import { test } from "node:test";
import assert from "node:assert/strict";
import { Updates, type Update } from "../src/updates";
import { TestStore } from "./helpers";
import { canonical, encoder, sha256, type Env } from "../src/types";
import type { ReleaseManifest } from "../src/releases";
import { encrypt, decrypt } from "../src/security";
test("self-update interruption reconciles the activated version without reuploading or touching website data", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]),
    publicKey = Buffer.from(
      await crypto.subtle.exportKey("raw", keys.publicKey),
    ).toString("base64"),
    bytes = encoder.encode("export default {}");
  const manifest: ReleaseManifest = {
    version: "0.1.1",
    commit: "a".repeat(40),
    schema: 1,
    migration_tag: "v1",
    durable_object_class: "Publisher",
    compatibility_date: "2026-09-01",
    modules: [
      {
        name: "worker.js",
        sha256: await sha256(bytes),
        size: bytes.length,
        type: "application/javascript+module",
      },
    ],
    notes: "Test update",
  };
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "Ed25519",
      keys.privateKey,
      encoder.encode(canonical(manifest)),
    ),
  ).toString("base64");
  const store = new TestStore(),
    op: Update = {
      id: "update",
      state: "queued",
      release: { manifest, signature },
      from: "0.1.0",
      attempts: 0,
      created: Date.now(),
    };
  store.put("publisher-update", op);
  store.putChunk("release:" + manifest.modules[0].sha256, 0, bytes);
  store.put("project:untouched", { name: "existing-site" });
  store.put(
    "credential",
    await encrypt({ token: "still-decrypts" }, "11".repeat(32)),
  );
  let writes = 0;
  let migrationTag: string | undefined = "v1";
  let percentage = 100;
  const api = {
    async api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      if (method === "PUT") {
        writes++;
        assert.ok(body instanceof FormData);
        const metadata = JSON.parse(String(body.get("metadata")));
        assert.deepEqual(metadata.keep_bindings, ["secret_text"]);
        throw Error("response lost after activation");
      }
      if (path.endsWith("/settings"))
        return {
          bindings: [
            { name: "PUBLISHER", type: "durable_object_namespace" },
            { name: "OAUTH_KV", type: "kv_namespace" },
            { name: "CREDENTIAL_KEY", type: "secret_text" },
          ],
        } as T;
      if (path.endsWith("/deployments"))
        return {
          deployments: [
            {
              versions: [
                {
                  version_id: writes ? "new-version" : "old-version",
                  percentage,
                },
              ],
            },
          ],
        } as T;
      return {
        annotations: writes ? { "workers/message": "update" } : {},
        resources: { script_runtime: { migration_tag: migrationTag } },
      } as T;
    },
  };
  const env = {
    PUBLISHER_ORIGIN: "https://publisher.test",
    RELEASE_VERSION: "0.1.0",
    RELEASE_PUBLIC_KEY: publicKey,
  } as Env;
  const updates = new Updates(store, env, api);
  await updates.step();
  assert.equal(updates.current()?.state, "deploying");
  await new Updates(store, env, api).step();
  assert.equal(updates.current()?.state, "complete");
  assert.equal(writes, 1);
  for (const [tag, share, code] of [
    ["v2", 100, "incompatible_migration"],
    [undefined, 100, "migration_unavailable"],
    ["v1", 50, "ambiguous_deployment"],
  ] as const) {
    migrationTag = tag;
    percentage = share;
    store.put("publisher-update", { ...op, state: "queued" });
    await updates.step();
    assert.equal(updates.current()?.state, "failed");
    assert.equal(updates.current()?.error?.code, code);
    assert.equal(
      writes,
      1,
      "must not upload when compatibility cannot be established",
    );
  }
  assert.deepEqual(store.get("project:untouched"), { name: "existing-site" });
  assert.deepEqual(await decrypt(store.get("credential")!, "11".repeat(32)), {
    token: "still-decrypts",
  });
});
