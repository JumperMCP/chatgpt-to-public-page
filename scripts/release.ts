import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { canonical, sha256 } from "../src/types";
import type { ReleaseManifest } from "../src/releases";
const keyPath = process.env.RELEASE_SIGNING_KEY_FILE;
if (!keyPath)
  throw new Error(
    "Set RELEASE_SIGNING_KEY_FILE to an Ed25519 PEM key. Never commit this key.",
  );
if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
  throw new Error("Release builds require a clean, committed source tree.");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const bytes = new Uint8Array(await readFile("dist/worker.js"));
const notes = await readFile("docs/release-notes.md", "utf8");
const manifest: ReleaseManifest = {
  version: pkg.version,
  commit,
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
  notes,
};
const signature = Buffer.from(
  sign(
    null,
    Buffer.from(canonical(manifest)),
    createPrivateKey(await readFile(keyPath)),
  ),
).toString("base64");
await writeFile(
  "dist/release.json",
  JSON.stringify({ manifest, signature }, null, 2) + "\n",
);
await writeFile("dist/SHA256SUMS", `${await sha256(bytes)}  worker.js\n`);
console.log(`Signed Publisher ${manifest.version} from ${commit}.`);
