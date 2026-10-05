import { canonical, requireThat, sha256 } from "./types";
export interface ReleaseManifest {
  version: string;
  commit: string;
  schema: 1;
  migration_tag: "v1";
  durable_object_class: "Publisher";
  compatibility_date: string;
  modules: { name: string; sha256: string; size: number; type: string }[];
  notes: string;
}
export interface SignedRelease {
  manifest: ReleaseManifest;
  signature: string;
}
export async function verifyRelease(
  release: SignedRelease,
  modules: Map<string, Uint8Array>,
  publicKey: string,
) {
  const m = release.manifest;
  requireThat(
    m &&
      m.schema === 1 &&
      m.migration_tag === "v1" &&
      m.durable_object_class === "Publisher",
    "incompatible_release",
    "This release is not compatible with the installed storage schema.",
  );
  requireThat(
    /^\d+\.\d+\.\d+$/.test(m.version) &&
      /^[a-f0-9]{40}$/.test(m.commit) &&
      /^\d{4}-\d{2}-\d{2}$/.test(m.compatibility_date),
    "invalid_release",
    "Invalid release metadata.",
  );
  requireThat(
    m.modules.length > 0 &&
      m.modules.length <= 20 &&
      new Set(m.modules.map((m) => m.name)).size === m.modules.length &&
      modules.size === m.modules.length,
    "invalid_release",
    "The release module set is incomplete or duplicated.",
  );
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0)),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "Ed25519",
    key,
    Uint8Array.from(atob(release.signature), (c) => c.charCodeAt(0)),
    new TextEncoder().encode(canonical(m)),
  );
  requireThat(
    valid,
    "invalid_signature",
    "Release signature verification failed.",
  );
  let size = 0;
  for (const entry of m.modules) {
    requireThat(
      /^[\w.-]+\.(js|mjs|wasm)$/.test(entry.name),
      "invalid_release",
      "Invalid release module name.",
    );
    const bytes = modules.get(entry.name);
    requireThat(
      bytes &&
        bytes.length === entry.size &&
        (await sha256(bytes)) === entry.sha256,
      "damaged_release",
      "Release checksum verification failed.",
    );
    size += entry.size;
  }
  requireThat(
    size <= 10 * 1024 * 1024 && modules.has("worker.js"),
    "invalid_release",
    "Release is too large or missing worker.js.",
  );
  return m;
}
// Existing bindings and secrets are inherited explicitly. No creation migration is replayed.
export function updateMetadata(
  release: ReleaseManifest,
  settings: {
    bindings: { name: string; type: string }[];
    migration_tag: string;
  },
  operation: string,
) {
  requireThat(
    settings.migration_tag === release.migration_tag,
    "incompatible_migration",
    "Migration tags differ. Use the documented recovery path.",
  );
  requireThat(
    settings.bindings.some(
      (b) => b.name === "PUBLISHER" && b.type === "durable_object_namespace",
    ) &&
      settings.bindings.some(
        (b) => b.name === "OAUTH_KV" && b.type === "kv_namespace",
      ) &&
      settings.bindings.some(
        (b) => b.name === "CREDENTIAL_KEY" && b.type === "secret_text",
      ),
    "missing_bindings",
    "Required Publisher bindings are missing.",
  );
  return {
    main_module: "worker.js",
    compatibility_date: release.compatibility_date,
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    keep_bindings: ["secret_text"],
    bindings: settings.bindings
      .filter((b) => b.type !== "secret_text" && b.name !== "RELEASE_VERSION")
      .map((b) => ({ name: b.name, type: "inherit" }))
      .concat([
        {
          name: "RELEASE_VERSION",
          type: "plain_text",
          text: release.version,
        } as { name: string; type: string },
      ]),
    migrations: {
      old_tag: settings.migration_tag,
      new_tag: release.migration_tag,
    },
    annotations: { "workers/message": operation },
  };
}
