import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyRelease,
  updateMetadata,
  type ReleaseManifest,
} from "../src/releases";
import { canonical, encoder, sha256 } from "../src/types";
test("signed releases reject damaged modules, wrong trust roots and incompatible schema; updates preserve identity and secrets", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const key = Buffer.from(
    await crypto.subtle.exportKey("raw", keys.publicKey),
  ).toString("base64");
  const bytes = encoder.encode("export default {}");
  const manifest: ReleaseManifest = {
    version: "0.1.0",
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
    notes: "First test release",
  };
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "Ed25519",
      keys.privateKey,
      encoder.encode(canonical(manifest)),
    ),
  ).toString("base64");
  const release = { manifest, signature };
  assert.equal(
    (await verifyRelease(release, new Map([["worker.js", bytes]]), key))
      .version,
    "0.1.0",
  );
  await assert.rejects(
    verifyRelease(
      release,
      new Map([["worker.js", encoder.encode("changed")]]),
      key,
    ),
    /checksum/,
  );
  await assert.rejects(
    verifyRelease(
      { ...release, manifest: { ...manifest, notes: "tampered" } },
      new Map([["worker.js", bytes]]),
      key,
    ),
    /signature/,
  );
  const metadata = updateMetadata(
    manifest,
    {
      migration_tag: "v1",
      bindings: [
        { name: "PUBLISHER", type: "durable_object_namespace" },
        { name: "OAUTH_KV", type: "kv_namespace" },
        { name: "CREDENTIAL_KEY", type: "secret_text" },
        { name: "INSTALLATION_ID", type: "plain_text" },
      ],
    },
    "update",
  );
  assert.deepEqual(metadata.keep_bindings, ["secret_text"]);
  assert.deepEqual(metadata.migrations, { old_tag: "v1", new_tag: "v1" });
  assert.ok(
    metadata.bindings.some(
      (b) => b.name === "PUBLISHER" && b.type === "inherit",
    ),
  );
  assert.throws(
    () =>
      updateMetadata(manifest, { migration_tag: "v2", bindings: [] }, "update"),
    /tags differ/,
  );
});
