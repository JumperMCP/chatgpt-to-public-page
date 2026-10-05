import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import {
  download,
  readBounded,
  safeDownloadUrl,
  safePath,
  servingSettings,
  unzip,
} from "../src/files";
import { LIMITS, encoder } from "../src/types";
const stream = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 1024)
        c.enqueue(bytes.slice(i, i + 1024));
      c.close();
    },
  });
test("archive import preserves bytes and rejects traversal, symlinks, duplicate normalized paths and bombs", async () => {
  const html = encoder.encode("<h1>hello</h1>"),
    img = new Uint8Array([0, 255, 64]);
  const files = await unzip(
    stream(zipSync({ "index.html": html, "image.png": img })),
  );
  assert.deepEqual(files.get("image.png"), img);
  assert.deepEqual(files.get("index.html"), html);
  for (const path of [
    "../index.html",
    "/index.html",
    "dir/../index.html",
    "a\\index.html",
    ".env",
    "package.json",
    ".assetsignore",
    "server.ts",
  ])
    await assert.rejects(unzip(stream(zipSync({ [path]: html }))));
  await assert.rejects(
    unzip(stream(zipSync({ "é.html": html, "é.html": html }))),
    /duplicate/,
  );
  const symlink = zipSync({ "index.html": html });
  for (let i = 0; i < symlink.length - 46; i++)
    if (new DataView(symlink.buffer).getUint32(i, true) === 0x02014b50)
      new DataView(symlink.buffer).setUint32(i + 38, 0xa1ff0000, true);
  await assert.rejects(unzip(stream(symlink)), /Symlinks/);
  await assert.rejects(
    unzip(
      stream(zipSync({ "index.html": new Uint8Array(LIMITS.fileBytes + 1) })),
    ),
    /limits/,
  );
});
test("downloads validate every redirect, reject private and credential-bearing destinations and enforce actual bytes", async () => {
  for (const url of [
    "http://files.example/x",
    "https://files.example:8443/x",
    "https://user:pass@files.example/x",
    "https://127.0.0.1/x",
    "https://files.example.evil/x",
  ])
    assert.throws(() => safeDownloadUrl(url, ["files.example"]));
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { Location: "https://127.0.0.1/private" },
    });
  };
  await assert.rejects(
    download("https://files.example/authorized", ["files.example"], fetcher),
    /approved/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    readBounded(stream(new Uint8Array(101)), 100),
    /size limit/,
  );
});
test("SPA routing requires intent and headers/redirects translate into serving settings", () => {
  assert.equal(
    servingSettings({ "index.html": true }, () => "").not_found_handling,
    "none",
  );
  assert.equal(
    servingSettings({ "index.html": true, "404.html": true }, () => "")
      .not_found_handling,
    "404-page",
  );
  assert.equal(
    servingSettings({ "index.html": true }, () => "", true).not_found_handling,
    "single-page-application",
  );
  const settings = servingSettings(
    { "index.html": true, _headers: true, _redirects: true },
    (p) => (p === "_headers" ? "/*\n  X-Robots-Tag: noindex" : "/old /new 301"),
  );
  assert.match(settings.headers!, /noindex/);
  assert.equal(settings.redirects, "/old /new 301");
  assert.throws(
    () =>
      servingSettings(
        { _redirects: true },
        () => "/old javascript:alert(1) 301",
      ),
    /Invalid redirect/,
  );
  assert.throws(
    () => servingSettings({ _headers: true }, () => "  X-Frame-Options: deny"),
    /Invalid header/,
  );
});
