import { DurableObject } from "cloudflare:workers";
import { CF_AUTHORIZE, exchangeCloudflare } from "../cloudflare-oauth";
import {
  decrypt,
  encrypt,
  exactOrigin,
  randomToken,
  type Credential,
} from "../security";
import { downloadRelease } from "../release-download";
import { readBounded } from "../files";
import {
  Problem,
  decoder,
  encoder,
  publicError,
  requireThat,
  sha256,
  canonical,
} from "../types";
import { installationPage, installationError } from "./ui";
interface InstallerEnv {
  INSTALLATIONS: DurableObjectNamespace;
  INSTALLER_ORIGIN: string;
  CLIENT_ID: string;
  REQUIRED_SCOPES: string;
  INSTALLER_KEY: string;
  RELEASE_BASE_URL: string;
  RELEASE_PUBLIC_KEY: string;
  CHATGPT_CALLBACKS: string;
  FILE_DOWNLOAD_HOSTS: string;
  REFRESH_HANDOFF_VERIFIED: string;
}
interface Install {
  id: string;
  csrf: string;
  verifier: string;
  oauthState: string;
  expires: number;
  credential?: { iv: number[]; data: number[] };
  accounts?: { id: string; name: string }[];
  account?: string;
  subdomain?: string;
  kv?: string;
  worker?: string;
  setup?: string;
  key?: string;
  handoff?: string;
  version?: string;
  releaseDigest?: string;
  deployed?: boolean;
  step:
    | "authorize"
    | "account"
    | "preflight"
    | "storage"
    | "publisher"
    | "handoff"
    | "complete"
    | "expired";
  error?: string;
}
const cookieName = "__Host-installation";
export default {
  async fetch(request: Request, env: InstallerEnv) {
    const url = new URL(request.url);
    if (url.origin !== env.INSTALLER_ORIGIN)
      return new Response("Unexpected host", { status: 400 });
    const cookies = (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c.startsWith(cookieName + "="));
    if (cookies.length > 1)
      return new Response("Invalid session", { status: 403 });
    let id = cookies[0]?.slice(cookieName.length + 1);
    if (!id || !/^[a-f0-9]{64}$/.test(id)) {
      if (url.pathname !== "/")
        return new Response("Start installation again.", { status: 403 });
      id = randomToken();
    }
    const response = await env.INSTALLATIONS.get(
      env.INSTALLATIONS.idFromName(id),
    ).fetch(request);
    const headers = new Headers(response.headers);
    headers.set(
      "Set-Cookie",
      `${cookieName}=${id}; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600`,
    );
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<InstallerEnv>;
export class Installation extends DurableObject<InstallerEnv> {
  private queue: Promise<unknown> = Promise.resolve();
  private exclusive<T>(fn: () => Promise<T>) {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }
  async fetch(request: Request) {
    return this.exclusive(async () => {
      try {
        return await this.route(request);
      } catch (error) {
        return installationError(
          publicError(error).message,
          error instanceof Problem ? error.status : 500,
        );
      }
    });
  }
  private async state() {
    let state = await this.ctx.storage.get<Install>("install");
    if (!state) {
      state = {
        id: crypto.randomUUID(),
        csrf: randomToken(),
        verifier: randomToken(),
        oauthState: randomToken(),
        expires: Date.now() + 3600000,
        step: "authorize",
      };
      await this.ctx.storage.put("install", state);
      await this.ctx.storage.setAlarm(state.expires);
    }
    return state;
  }
  private async api<T>(
    state: Install,
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    requireThat(state.credential, "expired", "Authorize Cloudflare again.");
    const credential = await decrypt<Credential>(
      state.credential,
      this.env.INSTALLER_KEY,
    );
    requireThat(
      !credential.expires_at || credential.expires_at > Date.now(),
      "expired",
      "Cloudflare installation authorization expired. Start a new installation.",
    );
    const response = await fetch(
      "https://api.cloudflare.com/client/v4" + path,
      {
        method,
        headers: {
          Authorization: "Bearer " + credential.access_token,
          ...(body instanceof FormData
            ? {}
            : body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
        },
        body:
          body instanceof FormData
            ? body
            : body === undefined
              ? undefined
              : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = (await response.json()) as { success: boolean; result: T };
    requireThat(
      response.ok && data.success,
      "provisioning",
      "Cloudflare could not complete this step. Check required permissions, account verification, account limits and workers.dev activation.",
      503,
    );
    return data.result;
  }
  private async route(request: Request) {
    const url = new URL(request.url),
      state = await this.state();
    requireThat(
      state.expires > Date.now(),
      "expired",
      "This installation session expired. Clear the installation cookie and start again.",
      410,
    );
    if (url.pathname === "/callback" && request.method === "GET") {
      requireThat(
        state.step === "authorize" &&
          url.searchParams.get("state") === state.oauthState &&
          url.searchParams.get("code"),
        "invalid_state",
        "Cloudflare callback state is invalid.",
        403,
      );
      const required = JSON.parse(this.env.REQUIRED_SCOPES) as string[];
      const credential = await exchangeCloudflare(
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.env.CLIENT_ID,
          code: url.searchParams.get("code")!,
          code_verifier: state.verifier,
          redirect_uri: this.env.INSTALLER_ORIGIN + "/callback",
        }),
        required,
      );
      state.credential = await encrypt(credential, this.env.INSTALLER_KEY);
      state.verifier = "";
      state.oauthState = "";
      state.step = "account";
      await this.ctx.storage.put("install", state);
      state.accounts = await this.api<{ id: string; name: string }[]>(
        state,
        "/accounts?per_page=50",
      );
      await this.ctx.storage.put("install", state);
      return Response.redirect(this.env.INSTALLER_ORIGIN + "/", 303);
    }
    if (state.step === "account" && !state.accounts) {
      state.accounts = await this.api<{ id: string; name: string }[]>(
        state,
        "/accounts?per_page=50",
      );
      await this.ctx.storage.put("install", state);
    }
    if (request.method === "POST") {
      exactOrigin(request, this.env.INSTALLER_ORIGIN);
      const body = new URLSearchParams(
        decoder.decode(await readBounded(request.body, 4096)),
      );
      requireThat(
        body.get("csrf") === state.csrf,
        "csrf",
        "Reload this installation page.",
        403,
      );
      if (url.pathname === "/start") {
        requireThat(
          state.step === "authorize" &&
            this.env.CLIENT_ID &&
            !this.env.CLIENT_ID.startsWith("REPLACE"),
          "operator_setup",
          "The operator has not configured the Cloudflare OAuth client yet.",
          503,
        );
        const challenge = btoa(
          String.fromCharCode(
            ...new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                encoder.encode(state.verifier),
              ),
            ),
          ),
        )
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        const target = new URL(CF_AUTHORIZE);
        target.search = new URLSearchParams({
          client_id: this.env.CLIENT_ID,
          redirect_uri: this.env.INSTALLER_ORIGIN + "/callback",
          response_type: "code",
          scope: (JSON.parse(this.env.REQUIRED_SCOPES) as string[]).join(" "),
          state: state.oauthState,
          code_challenge: challenge,
          code_challenge_method: "S256",
        }).toString();
        return Response.redirect(target.href, 303);
      }
      if (url.pathname === "/account") {
        requireThat(
          state.step === "account" &&
            state.accounts?.some((a) => a.id === body.get("account")),
          "account",
          "Select an authorized account.",
        );
        state.account = body.get("account")!;
        state.worker = "publisher-" + state.id.slice(0, 8);
        state.step = "preflight";
        await this.ctx.storage.put("install", state);
        await this.ctx.storage.setAlarm(Date.now() + 1000);
      }
      if (url.pathname === "/resume") {
        requireThat(
          !["authorize", "account", "complete"].includes(state.step),
          "invalid_step",
          "This step cannot be resumed.",
        );
        delete state.error;
        await this.ctx.storage.put("install", state);
        await this.ctx.storage.setAlarm(Date.now() + 1000);
      }
      return Response.redirect(this.env.INSTALLER_ORIGIN + "/", 303);
    }
    requireThat(
      request.method === "GET" && url.pathname === "/",
      "not_found",
      "Page not found.",
      404,
    );
    return installationPage(
      state,
      this.env.REFRESH_HANDOFF_VERIFIED === "true",
    );
  }
  async alarm() {
    return this.exclusive(async () => {
      const state = await this.state();
      if (Date.now() >= state.expires) {
        delete state.credential;
        delete state.key;
        delete state.handoff;
        delete state.setup;
        state.step = "expired";
        await this.ctx.storage.put("install", state);
        return;
      }
      try {
        const account = "/accounts/" + state.account;
        if (state.step === "preflight") {
          const subdomain = await this.api<{ subdomain: string }>(
            state,
            account + "/workers/subdomain",
          );
          requireThat(
            subdomain.subdomain,
            "activate_subdomain",
            "Open Cloudflare → Workers & Pages and activate workers.dev or finish account verification, then resume.",
          );
          state.subdomain = subdomain.subdomain;
          // Validate the pinned release before creating account resources.
          const release = await downloadRelease(
            this.env.RELEASE_BASE_URL,
            this.env.RELEASE_PUBLIC_KEY,
          );
          state.version = release.signed.manifest.version;
          state.releaseDigest = await sha256(
            canonical(release.signed.manifest),
          );
          state.step = "storage";
        } else if (state.step === "storage") {
          const title = "publisher-oauth-" + state.id;
          let namespace: { id: string; title: string } | undefined;
          for (let page = 1; page <= 100; page++) {
            const namespaces = await this.api<{ id: string; title: string }[]>(
              state,
              account + `/storage/kv/namespaces?page=${page}&per_page=100`,
            );
            namespace = namespaces.find((n) => n.title === title);
            if (namespace || namespaces.length < 100) break;
            requireThat(
              page < 100,
              "namespace_limit",
              "Could not safely inspect existing namespaces.",
            );
          }
          if (!namespace)
            namespace = await this.api(
              state,
              account + "/storage/kv/namespaces",
              "POST",
              { title },
            );
          state.kv = namespace!.id;
          state.key = randomToken();
          state.setup = randomToken();
          state.handoff = randomToken();
          state.step = "publisher";
        } else if (state.step === "publisher") {
          const release = await downloadRelease(
            this.env.RELEASE_BASE_URL,
            this.env.RELEASE_PUBLIC_KEY,
          );
          requireThat(
            release.signed.manifest.version === state.version &&
              (await sha256(canonical(release.signed.manifest))) ===
                state.releaseDigest,
            "release_changed",
            "The selected release changed during installation. Restore the pinned release URL before resuming.",
          );
          const scripts = await this.api<{ id: string; tags?: string[] }[]>(
            state,
            account + "/workers/scripts",
          );
          const existing = scripts.find((s) => s.id === state.worker);
          requireThat(
            !existing ||
              existing.tags?.includes("publisher-install:" + state.id),
            "name_unavailable",
            "The Publisher hostname belongs to another Worker. Start a new installation.",
          );
          if (!existing) {
            let reservation:
              { id: string; name: string; tags?: string[] } | undefined;
            for (let page = 1; page <= 100; page++) {
              const workers = await this.api<
                { id: string; name: string; tags?: string[] }[]
              >(state, account + `/workers/workers?page=${page}&per_page=100`);
              reservation = workers.find(
                (worker) => worker.name === state.worker,
              );
              if (reservation || workers.length < 100) break;
              requireThat(
                page < 100,
                "account_limit",
                "Could not safely inspect existing Workers.",
              );
            }
            if (reservation)
              requireThat(
                reservation.tags?.includes("publisher-install:" + state.id),
                "name_unavailable",
                "The Publisher name belongs to another Worker.",
              );
            else
              await this.api(state, account + "/workers/workers", "POST", {
                name: state.worker,
                tags: ["publisher-install:" + state.id],
                subdomain: { enabled: false, previews_enabled: false },
              });
            const origin = `https://${state.worker}.${state.subdomain}.workers.dev`;
            const vars = {
              PUBLISHER_ORIGIN: origin,
              ACCOUNT_ID: state.account!,
              ACCOUNT_SUBDOMAIN: state.subdomain!,
              INSTALLATION_ID: state.id,
              CHATGPT_CALLBACKS: this.env.CHATGPT_CALLBACKS,
              FILE_DOWNLOAD_HOSTS: this.env.FILE_DOWNLOAD_HOSTS,
              RELEASE_VERSION: state.version!,
              CF_OAUTH_CLIENT_ID: this.env.CLIENT_ID,
              REQUIRED_CF_SCOPES: this.env.REQUIRED_SCOPES,
              OAUTH_KV_ID: state.kv!,
              RELEASE_BASE_URL: this.env.RELEASE_BASE_URL,
              RELEASE_PUBLIC_KEY: this.env.RELEASE_PUBLIC_KEY,
              SETUP_EXPIRES_AT: String(state.expires),
            };
            const secrets = {
              CREDENTIAL_KEY: state.key!,
              SETUP_TOKEN_HASH: await sha256(state.setup!),
              HANDOFF_TOKEN_HASH: await sha256(state.handoff!),
            };
            const metadata = {
              main_module: "worker.js",
              compatibility_date: release.signed.manifest.compatibility_date,
              compatibility_flags: [
                "nodejs_compat",
                "global_fetch_strictly_public",
              ],
              tags: ["publisher-install:" + state.id],
              bindings: [
                {
                  name: "PUBLISHER",
                  type: "durable_object_namespace",
                  class_name: "Publisher",
                },
                {
                  name: "OAUTH_KV",
                  type: "kv_namespace",
                  namespace_id: state.kv,
                },
                ...Object.entries(vars).map(([name, text]) => ({
                  name,
                  type: "plain_text",
                  text,
                })),
                ...Object.entries(secrets).map(([name, text]) => ({
                  name,
                  type: "secret_text",
                  text,
                })),
              ],
              migrations: { new_tag: "v1", new_sqlite_classes: ["Publisher"] },
            };
            const data = new FormData();
            data.set("metadata", JSON.stringify(metadata));
            for (const entry of release.signed.manifest.modules)
              data.set(
                entry.name,
                new Blob(
                  [release.modules.get(entry.name)!.buffer as ArrayBuffer],
                  { type: entry.type },
                ),
                entry.name,
              );
            await this.api(
              state,
              account + "/workers/scripts/" + state.worker,
              "PUT",
              data,
            );
          }
          await this.api(
            state,
            account + "/workers/scripts/" + state.worker + "/subdomain",
            "POST",
            { enabled: true, previews_enabled: false },
          );
          state.deployed = true;
          state.step = "handoff";
        } else if (state.step === "handoff") {
          if (this.env.REFRESH_HANDOFF_VERIFIED === "true") {
            const credential = await decrypt<Credential>(
              state.credential!,
              this.env.INSTALLER_KEY,
            );
            requireThat(
              credential.refresh_token,
              "refresh_unavailable",
              "No independent refresh grant was returned. Enable the documented API-token fallback.",
            );
            const response = await fetch(
              `https://${state.worker}.${state.subdomain}.workers.dev/handoff`,
              {
                method: "POST",
                headers: {
                  Authorization: "Bearer " + state.handoff,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(credential),
                redirect: "error",
                signal: AbortSignal.timeout(15000),
              },
            );
            requireThat(
              response.ok,
              "handoff_pending",
              "The Publisher is not ready for secure credential handoff. Resume after its hostname becomes reachable.",
              503,
            );
          }
          delete state.credential;
          delete state.key;
          delete state.handoff;
          state.step = "complete";
        }
        delete state.error;
      } catch (error) {
        state.error = publicError(error).message;
      }
      await this.ctx.storage.put("install", state);
      await this.ctx.storage.setAlarm(
        state.error ||
          ["authorize", "account", "complete", "expired"].includes(state.step)
          ? state.expires
          : Date.now() + 1000,
      );
    });
  }
}
