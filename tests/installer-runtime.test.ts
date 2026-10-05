import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { encrypt } from "../src/security";

const origin = "https://installer.test";
const sessionId = "a".repeat(64);
const key = "11".repeat(32);
async function fixture(
  outboundService?: (request: Request) => Promise<Response>,
  hostedAssets?: (request: Request) => Promise<Response>,
) {
  const script = await readFile("dist/installer/worker.js", "utf8");
  const config = JSON.parse(await readFile("wrangler.installer.jsonc", "utf8"));
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        script +
        `\nexport class TestInstallation extends Installation {
      async seed(value) { await this.ctx.storage.put('install',value); }
      async advance() { return this.alarm(); }
      async snapshot() { return this.ctx.storage.get('install'); }
    }`,
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      durableObjects: {
        INSTALLATIONS: { className: "TestInstallation", useSQLite: true },
      },
      bindings: {
        INSTALLER_ORIGIN: origin,
        INSTALLER_KEY: key,
        CLIENT_ID: "test-client",
        REQUIRED_SCOPES: '["account-settings.read"]',
        RELEASE_BASE_URL: hostedAssets
          ? origin + "/releases/0.1.1/"
          : "https://release.test/",
        RELEASE_PUBLIC_KEY: hostedAssets
          ? config.vars.RELEASE_PUBLIC_KEY
          : "test",
        REFRESH_HANDOFF_VERIFIED: "false",
      },
      outboundService,
      serviceBindings: hostedAssets ? { ASSETS: hostedAssets } : undefined,
    }),
  );
  const namespace = await mf.getDurableObjectNamespace("INSTALLATIONS");
  const stub = namespace.get(namespace.idFromName(sessionId)) as unknown as {
    seed(value: unknown): Promise<void>;
    advance(): Promise<void>;
    snapshot(): Promise<{
      step: string;
      error?: string;
      credential?: unknown;
      expires: number;
    }>;
  };
  const call = (path = "/", method = "GET", body?: URLSearchParams) =>
    mf.dispatchFetch(origin + path, {
      method,
      body,
      redirect: "manual",
      headers: { Cookie: `__Host-installation=${sessionId}`, Origin: origin },
    });
  return { mf, stub, call };
}

test("expired installation offers a CSRF-protected restart without clearing cookies", async () => {
  const { mf, stub, call } = await fixture();
  try {
    await stub.seed({
      id: "old",
      csrf: "csrf",
      step: "preflight",
      expires: Date.now() - 1000,
      credential: { iv: [], data: [] },
    });
    const expired = await call();
    assert.equal(expired.status, 410);
    assert.match(await expired.text(), /action="\/restart"/);
    assert.equal(
      (await call("/restart", "POST", new URLSearchParams({ csrf: "wrong" })))
        .status,
      403,
    );
    assert.equal(
      (await call("/restart", "POST", new URLSearchParams({ csrf: "csrf" })))
        .status,
      303,
    );
    const reset = await stub.snapshot();
    assert.equal(reset.step, "authorize");
    assert.equal(reset.credential, undefined);
    assert.ok(reset.expires > Date.now());
    assert.match(await (await call()).text(), /Install on my Cloudflare/);
  } finally {
    await mf.dispose();
  }
});

test("progress remains readable while the preflight API call is pending", async () => {
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const { mf, stub, call } = await fixture(async () => {
    entered();
    await pending;
    return Response.json(
      { success: false, errors: [{ code: 10000 }] },
      { status: 403 },
    );
  });
  let alarm: Promise<void> | undefined;
  try {
    await stub.seed({
      id: "pending",
      csrf: "csrf",
      step: "preflight",
      account: "test-account",
      expires: Date.now() + 60000,
      credential: await encrypt({ access_token: "test-only", scopes: [] }, key),
    });
    alarm = stub.advance();
    await started;
    const progress = await Promise.race([
      call(),
      new Promise<undefined>((resolve) => setTimeout(resolve, 1000)),
    ]);
    assert.ok(
      progress,
      "progress GET must not wait behind the provisioning alarm",
    );
    const html = await progress.text();
    assert.match(html, /Checking your account/);
    assert.match(html, /http-equiv="refresh"/);
    release();
    await alarm;
    const failed = await (await call()).text();
    assert.match(failed, /HTTP 403; error 10000/);
    assert.match(failed, /Resume installation/);
    assert.doesNotMatch(failed, /http-equiv="refresh"/);
  } finally {
    release();
    await alarm;
    await mf.dispose();
  }
});

test("fresh authorization resets the window instead of inheriting idle-page expiry", async () => {
  const { mf, stub, call } = await fixture(async (request) =>
    new URL(request.url).pathname.endsWith("/token")
      ? Response.json({
          access_token: "test-only",
          token_type: "bearer",
          scope: "account-settings.read",
          expires_in: 3600,
        })
      : new URL(request.url).pathname.endsWith("/workers/subdomain")
        ? Response.json({ success: true, result: { subdomain: "" } })
        : Response.json({
            success: true,
            result: [{ id: "account", name: "Test" }],
          }),
  );
  try {
    await stub.seed({
      id: "idle",
      csrf: "csrf",
      verifier: "v".repeat(64),
      oauthState: "state",
      step: "authorize",
      expires: Date.now() + 10000,
    });
    assert.equal(
      (await call("/start", "POST", new URLSearchParams({ csrf: "csrf" })))
        .status,
      303,
    );
    assert.ok((await stub.snapshot()).expires > Date.now() + 3500000);
    assert.equal(
      (await call("/callback?state=state&code=test-only")).status,
      303,
    );
    const state = await stub.snapshot();
    assert.equal(state.step, "account");
    assert.ok(state.expires > Date.now() + 3500000);
    assert.equal(
      (
        await call(
          "/account",
          "POST",
          new URLSearchParams({ csrf: "csrf", account: "account" }),
        )
      ).status,
      303,
    );
    let html = "";
    const deadline = Date.now() + 5000;
    do {
      html = await (await call()).text();
      if (html.includes("Resume installation")) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    assert.match(html, /activate workers.dev/);
    assert.match(html, /Resume installation/);
  } finally {
    await mf.dispose();
  }
});

test("preflight verifies hosted release assets without fetching its own public domain", async () => {
  for (const corrupt of [false, true]) {
    const assetPaths: string[] = [];
    let publicCalls = 0;
    const { mf, stub } = await fixture(
      async (request) => {
        publicCalls++;
        assert.equal(
          new URL(request.url).hostname,
          "api.cloudflare.com",
          "release files must use ASSETS rather than public fetch",
        );
        return Response.json({ success: true, result: { subdomain: "test" } });
      },
      async (request) => {
        const path = new URL(request.url).pathname;
        assetPaths.push(path);
        assert.ok(
          [
            "/releases/0.1.1/release.json",
            "/releases/0.1.1/worker.js",
          ].includes(path),
        );
        const bytes = await readFile("public" + path);
        if (corrupt && path.endsWith("worker.js")) bytes[0] ^= 1;
        return new Response(bytes);
      },
    );
    try {
      await stub.seed({
        id: "assets",
        csrf: "csrf",
        step: "preflight",
        account: "test-account",
        expires: Date.now() + 60000,
        credential: await encrypt(
          { access_token: "test-only", scopes: [] },
          key,
        ),
      });
      await stub.advance();
      const state = await stub.snapshot();
      assert.equal(publicCalls, 1);
      assert.deepEqual(assetPaths, [
        "/releases/0.1.1/release.json",
        "/releases/0.1.1/worker.js",
      ]);
      assert.equal(state.step, corrupt ? "preflight" : "storage");
      assert.equal(Boolean(state.error), corrupt);
    } finally {
      await mf.dispose();
    }
  }
});
