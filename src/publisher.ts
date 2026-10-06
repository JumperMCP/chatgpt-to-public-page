import { dashboard } from "./dashboard";
import { AuthorizationError } from "@cloudflare/workers-oauth-provider";
import { ownerLogin, ownerSetup } from "./owner-ui";
import { Updates } from "./updates";
import { refreshCloudflare } from "./cloudflare-oauth";
import { DurableObject } from "cloudflare:workers";
import { exportStream } from "./export";
import { SqlStore } from "./store";
import { Projects } from "./projects";
import { Cloudflare, Publications } from "./cloudflare";
import {
  Credentials,
  OwnerAuth,
  exactOrigin,
  randomToken,
  sessionCookie,
} from "./security";
import {
  LIMITS,
  Problem,
  decoder,
  publicError,
  requireThat,
  sha256,
  type Env,
  type Operation,
  type Revision,
} from "./types";
import { readBounded } from "./files";
import { handleMcp } from "./mcp";
import { SCOPES, callbacks, oauthHelpers } from "./oauth";
import { escapeHtml as e, form, hidden, page } from "./ui";

export class Publisher extends DurableObject<Env> {
  private store: SqlStore;
  private projects: Projects;
  private auth: OwnerAuth;
  private credentials: Credentials;
  private cloudflare: Cloudflare;
  private publications: Publications;
  private updates: Updates;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqlStore(ctx.storage);
    this.projects = new Projects(this.store, env.ACCOUNT_SUBDOMAIN);
    this.auth = new OwnerAuth(this.store, env);
    // No background refresh: renew only when a deployment needs a credential.
    this.credentials = new Credentials(
      this.store,
      env.CREDENTIAL_KEY,
      (credential) =>
        refreshCloudflare(
          credential,
          JSON.parse(env.REQUIRED_CF_SCOPES ?? "[]"),
        ),
    );
    this.cloudflare = new Cloudflare(
      env.ACCOUNT_ID,
      env.INSTALLATION_ID,
      this.credentials,
      this.projects,
    );
    this.publications = new Publications(this.projects, this.cloudflare);
    this.updates = new Updates(this.store, env, this.cloudflare);
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  async fetch(request: Request) {
    return this.exclusive(async () => {
      try {
        return await this.route(request);
      } catch (error) {
        const status =
          error instanceof Problem
            ? error.status
            : error instanceof AuthorizationError
              ? 400
              : 500;
        const safe =
          error instanceof AuthorizationError
            ? { code: error.code, message: error.description }
            : publicError(error);
        const url = new URL(request.url);
        const consentRetry =
          url.pathname === "/authorize" && request.method === "GET"
            ? `<p><a href="${e(url.pathname + url.search)}">Retry connecting to ChatGPT</a></p><p>If this continues, return to ChatGPT and start Connect again. Your Publisher password does not need to be reset.</p>`
            : "";
        return request.headers.get("accept")?.includes("text/html")
          ? page(
              "Action could not complete",
              `<p>${e(safe.message)}</p>${error instanceof AuthorizationError ? `<p>Connection error: <code>${e(safe.code)}</code>.</p>` : ""}${consentRetry}<p><a href="/">Return to Publisher</a></p>`,
              status,
            )
          : Response.json(safe, {
              status,
              headers: { "Cache-Control": "no-store" },
            });
      }
    });
  }
  async alarm() {
    return this.exclusive(async () => {
      if (this.updates.pending()) {
        await this.ctx.storage.setAlarm(Date.now() + 30000);
        await this.updates.step();
      } else
        for (const op of this.publications.pending())
          await this.publications.step(op.id);
      this.projects.collect();
      for (const [key, record] of this.store.list<{ expires: number }>(
        "download:",
      ))
        if (record.expires <= Date.now()) this.store.delete(key);
      await this.schedule();
    });
  }
  private async schedule() {
    const next =
      Date.now() +
      (this.updates.pending()
        ? 30000
        : this.publications.pending().length
          ? this.publications.nextDelay()
          : 3600000);
    // Tool calls (including status polls) must not postpone work already due.
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || next < existing)
      await this.ctx.storage.setAlarm(next);
  }
  private async formData(request: Request) {
    const bytes = await readBounded(request.body, 16384);
    return new URLSearchParams(decoder.decode(bytes));
  }
  private async exportLink(id: string, revisionId?: string) {
    const p = this.projects.project(id),
      revision = this.projects.revision(revisionId ?? p.head ?? "", p.id),
      token = randomToken();
    this.store.put("download:" + (await sha256(token)), {
      project: p.id,
      revision: revision.id,
      expires: Date.now() + 300000,
    });
    return {
      download_url: this.env.PUBLISHER_ORIGIN + "/download/" + token,
      expires_in_seconds: 300,
      revision: revision.id,
    };
  }
  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname;
    if (path === "/handoff" && request.method === "POST") {
      const token =
        request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      requireThat(
        this.env.HANDOFF_TOKEN_HASH &&
          (await sha256(token)) === this.env.HANDOFF_TOKEN_HASH &&
          Date.now() < Number(this.env.SETUP_EXPIRES_AT),
        "invalid_handoff",
        "The installation handoff expired or is invalid.",
        403,
      );
      if (this.store.get("handoff-complete"))
        return Response.json({ complete: true });
      const bytes = await readBounded(request.body, 16384);
      const credential = JSON.parse(
        decoder.decode(bytes),
      ) as import("./security").Credential;
      requireThat(
        credential.client_id === this.env.CF_OAUTH_CLIENT_ID &&
          credential.refresh_token &&
          credential.access_token &&
          credential.expires_at &&
          Array.isArray(credential.scopes),
        "invalid_handoff",
        "The transferred grant is incomplete.",
      );
      const required = JSON.parse(
        this.env.REQUIRED_CF_SCOPES ?? "[]",
      ) as string[];
      requireThat(
        required.length &&
          required.every((scope) => credential.scopes.includes(scope)),
        "missing_scope",
        "The transferred grant lacks required scopes.",
      );
      await this.credentials.save(credential);
      this.store.put("handoff-complete", true);
      return Response.json({ complete: true });
    }
    if (path === "/mcp") {
      requireThat(
        request.headers.get("X-Publisher-Owner-Epoch") === this.auth.epoch() &&
          this.auth.epoch(),
        "unauthorized",
        "Reconnect to your Publisher.",
        401,
      );
      // Read and parse the bounded MCP body in the Durable Object, never at the edge.
      if (request.method === "POST") {
        const bytes = await readBounded(request.body, 1024 * 1024);
        request = new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: bytes.buffer as ArrayBuffer,
        });
      }
      return handleMcp(request, {
        projects: this.projects,
        env: this.env,
        schedule: () => this.schedule(),
        exportLink: (id, r) => this.exportLink(id, r),
      });
    }
    if (path.startsWith("/download/") && request.method === "GET") {
      const grant = this.store.get<{
        project: string;
        revision: string;
        expires: number;
      }>("download:" + (await sha256(path.slice(10))));
      requireThat(
        grant && grant.expires > Date.now(),
        "unauthorized",
        "The export link is invalid or expired.",
        401,
      );
      const revision = this.projects.revision(grant.revision, grant.project);
      const stream = exportStream(revision, this.store);
      return new Response(stream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="project.zip"',
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if ((path === "/setup" || path === "/recover") && request.method === "GET")
      return page(
        path === "/setup"
          ? "Your Publisher. Your password."
          : "Reset your Publisher password",
        ownerSetup(
          this.env.PUBLISHER_ORIGIN,
          url.searchParams.get("token") ?? "",
          path === "/recover",
        ),
      );
    if (
      (path === "/setup" || path === "/recover") &&
      request.method === "POST"
    ) {
      exactOrigin(request, this.env.PUBLISHER_ORIGIN);
      const body = await this.formData(request);
      const session = await this.auth.setup(
        body.get("token") ?? "",
        body.get("password") ?? "",
        path === "/recover",
      );
      return this.redirect("/", sessionCookie(session.token));
    }
    if (path === "/login" && request.method === "GET")
      return page("Sign in", ownerLogin());
    if (path === "/login" && request.method === "POST") {
      exactOrigin(request, this.env.PUBLISHER_ORIGIN);
      const body = await this.formData(request);
      const returnTo = body.get("return_to") ?? "/";
      let session;
      try {
        session = await this.auth.login(body.get("password") ?? "");
      } catch (error) {
        if (
          error instanceof Problem &&
          ["invalid_login", "throttled"].includes(error.code)
        )
          return page(
            "Sign in",
            ownerLogin(returnTo, error.message),
            error.status,
          );
        throw error;
      }
      return this.redirect(
        returnTo.startsWith("/authorize?") ? returnTo : "/",
        sessionCookie(session.token),
      );
    }
    let session;
    try {
      session = await this.auth.session(request);
    } catch (error) {
      if (request.method === "GET" && path === "/authorize")
        return page(
          "Sign in to connect ChatGPT",
          ownerLogin(url.pathname + url.search),
        );
      if (request.method === "GET" && path === "/")
        return this.redirect("/login");
      throw error;
    }
    if (path === "/authorize") {
      const oauth = oauthHelpers(this.env);
      if (request.method === "GET") {
        const auth = await oauth.parseAuthRequest(request);
        requireThat(
          callbacks(this.env).includes(auth.redirectUri) &&
            auth.codeChallengeMethod === "S256" &&
            auth.codeChallenge &&
            auth.state &&
            auth.scope.every((s) => SCOPES.includes(s)),
          "invalid_authorization",
          "The client callback, PKCE, state or requested scope is not approved.",
          403,
        );
        const details = await oauth.describeConsent(auth),
          consent = await oauth.beginConsent(auth);
        return page(
          "Connect ChatGPT",
          `<p>Allow <strong>${e(details.clientName)}</strong> to read your projects and publish selected files? The registered client name is self-reported. Continue only if you started this connection in ChatGPT.</p><p>Callback: <code>${e(auth.redirectUri)}</code></p>${form("/authorize", session.csrf, hidden("handle", consent.handle) + `<p>Access: ${e(SCOPES.join(", "))}. Published files become public.</p><button name="decision" value="approve">Allow project access</button> <button name="decision" value="deny">Deny</button>`)}`,
          200,
          consent.headers,
          auth.redirectUri,
        );
      }
      requireThat(
        request.method === "POST",
        "method_not_allowed",
        "Use POST.",
        405,
      );
      const body = await this.formData(request);
      await this.auth.mutate(
        request,
        this.env.PUBLISHER_ORIGIN,
        body.get("csrf") ?? "",
      );
      if (body.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(
          request,
          body.get("handle") ?? "",
        );
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(
        request,
        body.get("handle") ?? "",
        { scope: SCOPES },
      );
      requireThat(
        callbacks(this.env).includes(approved.request.redirectUri),
        "invalid_authorization",
        "Callback no longer allowed.",
        403,
      );
      const result = await oauth.completeAuthorization({
        request: approved.request,
        userId: "owner",
        metadata: {},
        scope: SCOPES,
        props: { ownerEpoch: this.auth.epoch() },
      });
      approved.headers.set("Location", result.redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
    if (request.method === "POST") {
      const body = await this.formData(request);
      await this.auth.mutate(
        request,
        this.env.PUBLISHER_ORIGIN,
        body.get("csrf") ?? "",
      );
      if (path === "/updates/check") {
        await this.updates.check();
        return this.redirect("/");
      }
      if (path === "/updates/apply") {
        // Fetch and alarms are serialized. The alarm prioritizes updates, then
        // resumes durable publication operations after the update settles.
        this.updates.request(body.get("update") ?? "");
        await this.schedule();
        return this.redirect("/");
      }
      if (path === "/logout") {
        await this.auth.logout(request);
        return this.redirect("/login", sessionCookie("", 0));
      }
      if (path === "/credentials") {
        const token = body.get("token") ?? "";
        requireThat(
          token.length >= 20 && token.length <= 2048,
          "invalid_token",
          "Paste the API token you created using the instructions in Settings → Cloudflare.",
        );
        // Read-only validation happens before storing the replacement credential.
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.env.ACCOUNT_ID)}/workers/subdomain`,
          {
            headers: { Authorization: "Bearer " + token },
            signal: AbortSignal.timeout(15000),
          },
        );
        requireThat(
          response.ok,
          "invalid_token",
          "Cloudflare could not validate account access. Check token permissions.",
          403,
        );
        const data = (await response.json()) as {
          success: boolean;
          result: { subdomain: string };
        };
        requireThat(
          data.success && data.result.subdomain === this.env.ACCOUNT_SUBDOMAIN,
          "account_mismatch",
          "Cloudflare subdomain does not match this installation.",
        );
        await this.credentials.save({ access_token: token, scopes: [] });
        return this.redirect("/");
      }
      if (path === "/unpublish" || path === "/delete") {
        this.projects.remove(
          body.get("project") ?? "",
          body.get("base") || null,
          path === "/delete" ? "delete" : "unpublish",
          body.get("confirmation") ?? "",
        );
        await this.schedule();
        return this.redirect("/");
      }
      if (path === "/export") {
        const result = await this.exportLink(body.get("project") ?? "");
        return page(
          "Download your project",
          `<p><a href="${e(result.download_url)}">Download all original files (valid for five minutes)</a></p>`,
        );
      }
      throw new Problem("not_found", "Page not found.", 404);
    }
    if (path === "/" && request.method === "GET") {
      const update = this.updates.current();
      const projects = this.projects.list("", 50),
        health = this.store.get<{ state: string }>("credential-health") ?? {
          state: "not_connected",
        },
        operations = this.store
          .list<Operation>("operation:")
          .map(([, op]) => op)
          .sort((a, b) => b.created - a.created)
          .slice(0, 10);
      return page(
        "Publishing, at a glance.",
        dashboard({
          origin: this.env.PUBLISHER_ORIGIN,
          account: this.env.ACCOUNT_ID,
          version: this.env.RELEASE_VERSION,
          csrf: session.csrf,
          projects,
          operations,
          connected: health.state === "connected",
          update,
          receipt: {
            installation: this.env.INSTALLATION_ID,
            account: this.env.ACCOUNT_ID,
            publisher: this.env.PUBLISHER_ORIGIN,
            mcp: this.env.PUBLISHER_ORIGIN + "/mcp",
            version: this.env.RELEASE_VERSION,
            durable_object: this.ctx.id.toString(),
            oauth_kv: this.env.OAUTH_KV_ID ?? "See Cloudflare bindings",
            sites: this.store.list("remote:").map(([, v]) => v),
          },
        }),
        200,
        {},
        undefined,
        true,
      );
    }
    throw new Problem("not_found", "Page not found.", 404);
  }
  private redirect(location: string, cookie?: string) {
    const headers = new Headers({
      Location: location,
      "Cache-Control": "no-store",
    });
    if (cookie) headers.set("Set-Cookie", cookie);
    return new Response(null, { status: 303, headers });
  }
}
