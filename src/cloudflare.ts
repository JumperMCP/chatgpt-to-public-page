import { Buffer } from "node:buffer";
import { Credentials } from "./security";
import {
  LIMITS,
  Problem,
  publicError,
  requireThat,
  sha256,
  type Operation,
  type Project,
  type Revision,
  type Store,
} from "./types";
import { Projects } from "./projects";

export interface DeploymentProvider {
  ensureOwned(project: Project): Promise<void>;
  upload(
    project: Project,
    revision: Revision,
    operation: string,
  ): Promise<string>;
  active(project: Project): Promise<{
    version: string;
    deployment: string;
    remoteVersion?: string;
  } | null>;
  activate(
    project: Project,
    version: string,
    operation: string,
  ): Promise<string>;
  serving(project: Project, enabled: boolean): Promise<void>;
  remove(project: Project): Promise<void>;
  reachable(url: string, spa: boolean): Promise<boolean>;
}
export class Cloudflare implements DeploymentProvider {
  constructor(
    private account: string,
    private installation: string,
    private credentials: Credentials,
    private projects: Projects,
    private fetcher: typeof fetch = fetch,
  ) {}
  async api<T>(
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ): Promise<T> {
    const fetcher = this.fetcher;
    const response = await fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.account)}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token ?? (await this.credentials.token())}`,
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
    let data:
      | { success: boolean; result: T; errors?: { code?: unknown }[] }
      | undefined;
    try {
      data = await response.json();
    } catch {
      /* Report HTTP failures even when Cloudflare returns no JSON. */
    }
    const codes = Array.isArray(data?.errors)
      ? data.errors
          .map((e) => e?.code)
          .filter(
            (code): code is number =>
              typeof code === "number" && Number.isSafeInteger(code),
          )
          .slice(0, 8)
      : [];
    const diagnostic = `${method} ${path.split("?")[0]} (HTTP ${response.status}${codes.length ? "; codes " + codes.join(", ") : ""}).`;
    if (response.status === 401 || response.status === 403) {
      this.credentials.revoked();
      throw new Problem(
        "cloudflare_permission",
        "Cloudflare denied access. Check the publishing token's account and permissions. " +
          diagnostic,
        503,
      );
    }
    if (response.status === 404)
      throw new Problem(
        "cloudflare_not_found",
        "The Cloudflare resource was not found. " + diagnostic,
        404,
      );
    if (response.status === 429)
      throw new Problem(
        "cloudflare_quota",
        "Cloudflare rate or account limits were reached. " + diagnostic,
        503,
      );
    requireThat(
      data && typeof data === "object",
      "cloudflare_response",
      "Cloudflare returned an unreadable response. " + diagnostic,
      503,
    );
    requireThat(
      response.ok && data.success,
      "cloudflare_error",
      "Cloudflare rejected the request. " + diagnostic,
      503,
    );
    return data.result;
  }
  private path(project: Project) {
    return `/workers/scripts/${encodeURIComponent(project.hostname)}`;
  }
  private tag(project: Project) {
    return `publisher:${this.installation}:${project.id}`;
  }
  async ensureOwned(project: Project) {
    const key = "remote:" + project.id;
    const saved = this.projects.store.get<{ id: string }>(key);
    if (saved) {
      const remote = await this.api<{
        id: string;
        name: string;
        tags?: string[];
      }>(`/workers/workers/${saved.id}`);
      requireThat(
        remote.name === project.hostname &&
          remote.tags?.includes(this.tag(project)),
        "ownership",
        "The remote Worker no longer belongs to this project. No changes were made.",
        409,
      );
      return;
    }
    // Exact ownership tags permit reconciliation after a lost create response; names alone never do.
    let found: { id: string; name: string; tags?: string[] } | undefined;
    for (let page = 1; page <= 100; page++) {
      const rows = await this.api<
        { id: string; name: string; tags?: string[] }[]
      >(`/workers/workers?page=${page}&per_page=100`);
      found = rows.find((r) => r.name === project.hostname);
      if (found || rows.length < 100) break;
      requireThat(
        page < 100,
        "account_limit",
        "Could not safely inspect all existing Workers.",
      );
    }
    if (found)
      requireThat(
        found.tags?.includes(this.tag(project)),
        "name_unavailable",
        "That hostname is unavailable. Choose another; no existing Worker was overwritten.",
        409,
      );
    else
      found = await this.api<{ id: string; name: string; tags: string[] }>(
        "/workers/workers",
        "POST",
        {
          name: project.hostname,
          tags: [this.tag(project)],
          subdomain: { enabled: false, previews_enabled: false },
        },
      );
    this.projects.store.put(key, {
      id: found.id,
      name: project.hostname,
      tag: this.tag(project),
    });
    project.owned = true;
    this.projects.store.put("project:" + project.id, project);
  }
  async upload(project: Project, revision: Revision, operation: string) {
    await this.ensureOwned(project);
    const manifest: Record<string, { hash: string; size: number }> = {};
    const byHash = new Map<
      string,
      { path: string; file: Revision["files"][string] }
    >();
    for (const [path, file] of Object.entries(revision.files)) {
      if (path === "_headers" || path === "_redirects") continue;
      // Content type participates in the identifier because upload MIME metadata follows each hash.
      const hash = (await sha256(file.hash + ":" + file.type)).slice(0, 32);
      manifest["/" + path] = { hash, size: file.size };
      byHash.set(hash, { path, file });
    }
    const session = await this.api<{ jwt: string; buckets: string[][] }>(
      this.path(project) + "/assets-upload-session",
      "POST",
      { manifest },
    );
    let completion = session.buckets.length ? undefined : session.jwt;
    for (const bucket of session.buckets) {
      const form = new FormData();
      for (const hash of bucket) {
        const entry = byHash.get(hash);
        requireThat(
          entry,
          "cloudflare_response",
          "Cloudflare requested an unknown asset.",
          503,
        );
        form.set(
          hash,
          new Blob(
            [Buffer.from(this.projects.bytes(entry.file)).toString("base64")],
            { type: entry.file.type },
          ),
          entry.path,
        );
      }
      const result = await this.api<{ jwt?: string }>(
        "/workers/assets/upload?base64=true",
        "POST",
        form,
        session.jwt,
      );
      if (result.jwt) completion = result.jwt;
    }
    requireThat(
      completion,
      "upload_incomplete",
      "Cloudflare did not confirm the complete asset upload.",
      503,
    );
    this.projects.store.put("asset-upload:" + operation, {
      encrypted: await this.credentials.seal({ jwt: completion }),
      revision: revision.id,
      expires: Date.now() + 55 * 60 * 1000,
    });
    return "assets:" + operation;
  }
  async active(project: Project): Promise<{
    version: string;
    deployment: string;
    remoteVersion?: string;
  } | null> {
    await this.ensureOwned(project);
    let response: {
      deployments: {
        id: string;
        versions: { version_id: string; percentage: number }[];
      }[];
    };
    try {
      response = await this.api(this.path(project) + "/deployments");
    } catch (error) {
      if (error instanceof Problem && error.code === "cloudflare_not_found")
        return null;
      throw error;
    }
    const current = response.deployments[0],
      full = current?.versions.find((v) => v.percentage === 100);
    if (!full) return null;
    const details = await this.api<{
      annotations?: Record<string, string>;
    }>(this.path(project) + "/versions/" + full.version_id);
    const operation = details.annotations?.["workers/message"];
    return {
      version: operation ? "assets:" + operation : full.version_id,
      remoteVersion: full.version_id,
      deployment: current.id,
    };
  }
  async activate(project: Project, handle: string, operation: string) {
    await this.ensureOwned(project);
    requireThat(
      handle === "assets:" + operation,
      "invalid_operation",
      "The upload does not belong to this operation.",
    );
    let saved = this.projects.store.get<{
      encrypted: { iv: number[]; data: number[] };
      revision: string;
      expires: number;
    }>("asset-upload:" + operation);
    requireThat(
      saved,
      "upload_incomplete",
      "The uploaded asset session is missing.",
    );
    const revision = this.projects.revision(saved.revision, project.id);
    if (saved.expires <= Date.now()) {
      await this.upload(project, revision, operation);
      saved = this.projects.store.get("asset-upload:" + operation)!;
    }
    const { jwt } = await this.credentials.unseal<{ jwt: string }>(
      saved.encrypted,
    );
    const form = new FormData();
    form.set(
      "metadata",
      JSON.stringify({
        compatibility_date: "2026-09-01",
        tags: [this.tag(project)],
        annotations: { "workers/message": operation },
        assets: {
          jwt,
          config: {
            not_found_handling: revision.settings.not_found_handling,
            _headers: revision.settings.headers,
            _redirects: revision.settings.redirects,
          },
        },
      }),
    );
    // The documented assets-only endpoint activates only after the complete upload session exists.
    await this.api(this.path(project), "PUT", form);
    const active = await this.active(project);
    requireThat(
      active?.version === handle,
      "activation_pending",
      "Cloudflare activation is awaiting reconciliation.",
      503,
    );
    return active.deployment;
  }
  async serving(project: Project, enabled: boolean) {
    await this.ensureOwned(project);
    await this.api(this.path(project) + "/subdomain", "POST", {
      enabled,
      previews_enabled: false,
    });
  }
  async remove(project: Project) {
    const saved = this.projects.store.get<{ id: string }>(
      "remote:" + project.id,
    );
    if (!saved) return;
    try {
      await this.ensureOwned(project);
      await this.api(`/workers/workers/${saved.id}`, "DELETE");
    } catch (error) {
      if (!(error instanceof Problem && error.code === "cloudflare_not_found"))
        throw error;
    }
  }
  async reachable(url: string, spa: boolean) {
    try {
      const fetcher = this.fetcher;
      for (const path of spa ? ["/", "/__publisher_spa_probe__"] : ["/"]) {
        const r = await fetcher(url + path, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        });
        await r.body?.cancel();
        if (!r.ok && !(r.status >= 300 && r.status < 400)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
export class Publications {
  constructor(
    private projects: Projects,
    private provider: DeploymentProvider,
    private now = Date.now,
  ) {}
  async step(id: string) {
    const store = this.projects.store,
      op = store.get<Operation>("operation:" + id);
    requireThat(op, "not_found", "Operation not found.", 404);
    if (
      op.state === "failed" ||
      (op.state === "published" && op.reachable !== false)
    )
      return;
    const p = this.projects.project(op.project);
    try {
      if (op.kind !== "publish") {
        this.projects.base(p, op.base);
        if (op.kind === "unpublish") {
          if (p.owned) await this.provider.serving(p, false);
          p.live = null;
          store.put("project:" + p.id, p);
        } else {
          if (p.owned || store.get("remote:" + p.id))
            await this.provider.remove(p);
          store.transaction(() => {
            store.delete("project:" + p.id);
            store.delete("remote:" + p.id);
            for (const [key, r] of store.list<Revision>("revision:"))
              if (r.project === p.id) store.delete(key);
          });
        }
        op.state = "published";
        store.put("operation:" + op.id, op);
        this.projects.collect();
        return;
      }
      const revision = this.projects.revision(op.revision, p.id);
      if (op.state === "staged") {
        this.projects.base(p, op.base);
        await this.provider.ensureOwned(p);
        op.state = "uploading";
      } else if (op.state === "uploading") {
        this.projects.base(p, op.base);
        op.version = await this.provider.upload(p, revision, op.id);
        op.state = "activating";
      } else if (op.state === "activating") {
        this.projects.base(p, op.base);
        requireThat(
          op.version,
          "invalid_operation",
          "The uploaded version is missing.",
          500,
        );
        const current = await this.provider.active(p);
        op.deployment =
          current?.version === op.version
            ? current.deployment
            : await this.provider.activate(p, op.version, op.id);
        await this.provider.serving(p, true);
        const confirmed = await this.provider.active(p);
        if (confirmed?.remoteVersion) op.version = confirmed.remoteVersion;
        store.transaction(() => {
          this.projects.base(this.projects.project(p.id), op.base);
          p.head = revision.id;
          p.live = revision.id;
          p.owned = true;
          p.history = [...p.history, revision.id].slice(-LIMITS.snapshots);
          store.put("project:" + p.id, p);
          op.state = "published";
          store.delete("asset-upload:" + op.id);
          op.reachable = false;
          op.attempts = 0;
          store.put("operation:" + op.id, op);
        });
        this.projects.collect();
        return;
      } else {
        op.reachable = await this.provider.reachable(
          this.projects.url(p),
          revision.settings.not_found_handling === "single-page-application",
        );
        op.attempts++;
        if (!op.reachable)
          op.error = {
            code: "awaiting_reachability",
            message:
              "Cloudflare activated the deployment; the hostname is not reachable yet. Check the public URL later.",
          };
        else delete op.error;
      }
      if (op.state !== "published") {
        op.attempts = 0;
        delete op.error;
      }
      store.put("operation:" + op.id, op);
    } catch (error) {
      op.attempts++;
      op.error = publicError(error);
      // Activation may have succeeded remotely. Keep reconciling, never label an ambiguous activation failed.
      if (
        op.state !== "activating" &&
        op.state !== "published" &&
        (op.attempts >= 5 || (error instanceof Problem && error.status < 500))
      )
        op.state = "failed";
      store.put("operation:" + op.id, op);
    }
  }
  pending() {
    return this.projects.store
      .list<Operation>("operation:")
      .map(([, op]) => op)
      .filter(
        (op) =>
          op.state !== "failed" &&
          (op.state !== "published" ||
            (op.reachable === false && op.attempts < 5)),
      );
  }
  nextDelay() {
    const attempts = Math.max(0, ...this.pending().map((op) => op.attempts));
    return Math.min(300000, 1000 * 2 ** Math.min(attempts, 9));
  }
}
