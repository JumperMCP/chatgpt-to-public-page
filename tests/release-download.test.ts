import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadRelease } from "../src/release-download";
import { Problem } from "../src/types";

test("release transport failures are not reported as invalid metadata", async () => {
  await assert.rejects(
    downloadRelease("https://release.test/", "unused", async () => {
      throw new TypeError("fetch failed");
    }),
    (error: unknown) =>
      error instanceof Problem && error.code === "release_download",
  );
});

test("invalid JSON is distinguished from an unavailable download", async () => {
  await assert.rejects(
    downloadRelease(
      "https://release.test/",
      "unused",
      async () => new Response("<html>not a manifest</html>"),
    ),
    (error: unknown) =>
      error instanceof Problem && error.code === "invalid_release",
  );
});

test("release redirects fail closed without a second request", async () => {
  let calls = 0;
  await assert.rejects(
    downloadRelease("https://release.test/", "unused", async (_input, init) => {
      calls++;
      assert.equal(init?.redirect, "manual");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://other.test/file" },
      });
    }),
    (error: unknown) =>
      error instanceof Problem && error.code === "release_download",
  );
  assert.equal(calls, 1);
});
