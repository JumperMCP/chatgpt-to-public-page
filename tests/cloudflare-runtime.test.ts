import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("Workers native fetch supports Cloudflare API requests and publication probes", async () => {
  const script = await readFile("dist/worker.js", "utf8");
  const calls: string[] = [];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        script +
        `\nexport class TestPublisher extends Publisher {
      async checkApi() {
        return this.cloudflare.api('/workers/scripts/test/settings', 'GET', undefined, 'test-only');
      }
      async checkReachability() { return this.cloudflare.reachable('https://site.test', true); }
    }`,
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      durableObjects: {
        PUBLISHER: { className: "TestPublisher", useSQLite: true },
      },
      bindings: {
        ACCOUNT_ID: "test-account",
        ACCOUNT_SUBDOMAIN: "test",
        CREDENTIAL_KEY: "11".repeat(32),
      },
      outboundService: async (request: Request) => {
        const url = new URL(request.url);
        calls.push(url.host + url.pathname);
        if (url.host === "api.cloudflare.com") {
          assert.equal(
            request.headers.get("authorization"),
            "Bearer test-only",
          );
          return Response.json({
            success: true,
            result: { migration_tag: "v1", bindings: [] },
          });
        }
        assert.equal(request.headers.get("authorization"), null);
        return new Response("ok");
      },
    }),
  );
  try {
    const ns = await mf.getDurableObjectNamespace("PUBLISHER");
    const stub = ns.get(ns.idFromName("test")) as unknown as {
      checkApi(): Promise<{ migration_tag: string }>;
      checkReachability(): Promise<boolean>;
    };
    assert.equal((await stub.checkApi()).migration_tag, "v1");
    assert.equal(await stub.checkReachability(), true);
    assert.deepEqual(calls, [
      "api.cloudflare.com/client/v4/accounts/test-account/workers/scripts/test/settings",
      "site.test/",
      "site.test/__publisher_spa_probe__",
    ]);
  } finally {
    await mf.dispose();
  }
});
