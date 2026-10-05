import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { verifyRelease, type SignedRelease } from "../src/releases";

test("archived public releases retain valid signatures and matching checksums", async () => {
  const config = JSON.parse(await readFile("wrangler.installer.jsonc", "utf8"));
  const versions = await readdir("public/releases");
  assert.ok(versions.includes("0.1.0"));
  for (const version of versions) {
    const directory = `public/releases/${version}`;
    const signed: SignedRelease = JSON.parse(
      await readFile(`${directory}/release.json`, "utf8"),
    );
    const bytes = new Uint8Array(await readFile(`${directory}/worker.js`));
    const manifest = await verifyRelease(
      signed,
      new Map([["worker.js", bytes]]),
      config.vars.RELEASE_PUBLIC_KEY,
    );
    assert.equal(manifest.version, version);
    assert.equal(
      await readFile(`${directory}/SHA256SUMS`, "utf8"),
      `${manifest.modules[0].sha256}  worker.js\n`,
    );
  }
});
