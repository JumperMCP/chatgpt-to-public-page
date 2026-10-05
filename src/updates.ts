import { Cloudflare } from "./cloudflare";
import { downloadRelease } from "./release-download";
import { updateMetadata, verifyRelease, type SignedRelease } from "./releases";
import {
  LIMITS,
  publicError,
  requireThat,
  type Env,
  type Store,
} from "./types";
export interface Update {
  id: string;
  state: "review" | "queued" | "deploying" | "complete" | "failed";
  release: SignedRelease;
  from: string;
  attempts: number;
  error?: { code: string; message: string };
  created: number;
}
export class Updates {
  constructor(
    private store: Store,
    private env: Env,
    private api: Pick<Cloudflare, "api">,
  ) {}
  current() {
    return this.store.get<Update>("publisher-update");
  }
  async check() {
    requireThat(
      this.env.RELEASE_BASE_URL && this.env.RELEASE_PUBLIC_KEY,
      "updates_unconfigured",
      "Configure a trusted signed release source before checking updates.",
    );
    requireThat(
      !["queued", "deploying"].includes(this.current()?.state ?? ""),
      "update_busy",
      "A Publisher update is already running.",
    );
    const { signed, modules } = await downloadRelease(
      this.env.RELEASE_BASE_URL,
      this.env.RELEASE_PUBLIC_KEY,
    );
    const next: Update = {
      id: crypto.randomUUID(),
      state: "review",
      release: signed,
      from: this.env.RELEASE_VERSION,
      attempts: 0,
      created: Date.now(),
    };
    this.store.transaction(() => {
      for (const entry of this.current()?.release.manifest.modules ?? [])
        this.store.deleteChunks("release:" + entry.sha256);
      for (const entry of signed.manifest.modules) {
        const bytes = modules.get(entry.name)!;
        for (
          let at = 0, part = 0;
          at < bytes.length;
          at += LIMITS.chunkBytes, part++
        )
          this.store.putChunk(
            "release:" + entry.sha256,
            part,
            bytes.slice(at, at + LIMITS.chunkBytes),
          );
      }
      this.store.put("publisher-update", next);
    });
    return next;
  }
  request(id: string) {
    const op = this.current();
    requireThat(
      op &&
        op.id === id &&
        op.state === "review" &&
        Date.now() - op.created < 86400000,
      "stale_update",
      "Check for updates again before approving.",
    );
    requireThat(
      op.from === this.env.RELEASE_VERSION,
      "stale_update",
      "The Publisher changed since this update was reviewed.",
    );
    op.state = "queued";
    this.store.put("publisher-update", op);
  }
  pending() {
    return ["queued", "deploying"].includes(this.current()?.state ?? "");
  }
  async step() {
    const op = this.current();
    if (!op || !this.pending()) return;
    const name = new URL(this.env.PUBLISHER_ORIGIN).hostname.split(".")[0],
      path = "/workers/scripts/" + encodeURIComponent(name);
    try {
      const deployments = await this.api.api<{
        deployments: {
          versions: { version_id: string; percentage: number }[];
        }[];
      }>(path + "/deployments");
      const versions = deployments.deployments[0]?.versions ?? [];
      requireThat(
        versions.length === 1 && versions[0].percentage === 100,
        "ambiguous_deployment",
        "Publisher updates require one active version serving all traffic.",
      );
      const version = await this.api.api<{
        annotations?: Record<string, string>;
        resources?: { script_runtime?: { migration_tag?: string } };
      }>(path + "/versions/" + encodeURIComponent(versions[0].version_id));
      if (
        op.state === "deploying" &&
        version.annotations?.["workers/message"] === op.id
      ) {
        op.state = "complete";
        delete op.error;
        this.store.put("publisher-update", op);
        return;
      }
      const migrationTag = version.resources?.script_runtime?.migration_tag;
      requireThat(
        typeof migrationTag === "string" && migrationTag.length > 0,
        "migration_unavailable",
        "Cloudflare did not return the active version's migration tag. No update was uploaded.",
      );
      const modules = new Map<string, Uint8Array>();
      for (const entry of op.release.manifest.modules) {
        const bytes = new Uint8Array(entry.size);
        for (
          let at = 0, part = 0;
          at < bytes.length;
          at += LIMITS.chunkBytes, part++
        ) {
          const chunk = this.store.chunk("release:" + entry.sha256, part);
          requireThat(
            chunk,
            "damaged_release",
            "Stored release is incomplete.",
          );
          bytes.set(chunk, at);
        }
        modules.set(entry.name, bytes);
      }
      await verifyRelease(op.release, modules, this.env.RELEASE_PUBLIC_KEY!);
      const settings = await this.api.api<{
        bindings: { name: string; type: string }[];
      }>(path + "/settings");
      const metadata = updateMetadata(
        op.release.manifest,
        { ...settings, migration_tag: migrationTag },
        op.id,
      );
      const form = new FormData();
      form.set("metadata", JSON.stringify(metadata));
      for (const entry of op.release.manifest.modules)
        form.set(
          entry.name,
          new Blob([modules.get(entry.name)!.buffer as ArrayBuffer], {
            type: entry.type,
          }),
          entry.name,
        );
      // Save before uploading our own code. The next alarm reconciles if this instance is replaced.
      op.state = "deploying";
      this.store.put("publisher-update", op);
      await this.api.api(path, "PUT", form);
    } catch (error) {
      op.attempts++;
      op.error = publicError(error);
      if (op.state === "queued") op.state = "failed";
    }
    this.store.put("publisher-update", op);
  }
}
