import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { sha256 } from "../src/types";
const origin = "https://publisher.test";
test("real Worker + SQLite DO: setup, owner UI, sibling isolation, protected MCP and OAuth registration", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "dist/worker.js",
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      durableObjects: {
        PUBLISHER: { className: "Publisher", useSQLite: true },
      },
      kvNamespaces: ["OAUTH_KV"],
      bindings: {
        PUBLISHER_ORIGIN: origin,
        ACCOUNT_ID: "test",
        ACCOUNT_SUBDOMAIN: "test",
        INSTALLATION_ID: "test-installation",
        RELEASE_VERSION: "0.1.0",
        CHATGPT_CALLBACKS: '["https://chatgpt.example/callback"]',
        FILE_DOWNLOAD_HOSTS: "[]",
        CREDENTIAL_KEY: "11".repeat(32),
        SETUP_TOKEN_HASH: await sha256("setup-token"),
        SETUP_EXPIRES_AT: String(Date.now() + 60000),
      },
    }),
  );
  try {
    const call = (
      path: string,
      init: NonNullable<Parameters<Miniflare["dispatchFetch"]>[1]> = {},
    ) => mf.dispatchFetch(origin + path, { ...init, redirect: "manual" });
    let r = await call("/");
    assert.equal(r.status, 303);
    r = await call("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Publisher-Owner-Epoch": "forged",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate")!, /resource_metadata/);
    r = await call("/download/invalid");
    assert.equal(r.status, 401);
    r = await call("/setup", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token: "setup-token",
        password: "a secure owner password",
      }),
    });
    assert.equal(r.status, 303);
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    assert.match(cookie, /^__Host-publisher=/);
    r = await call("/", { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /Public projects/);
    assert.doesNotMatch(html, /a secure owner password/);
    const csrf = html.match(/name="csrf" value="([^"]+)"/)![1];
    r = await call("/logout", {
      method: "POST",
      headers: {
        Origin: "https://site.test",
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf }),
    });
    assert.equal(r.status, 403);
    r = await call("/logout", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf: "forged" }),
    });
    assert.equal(r.status, 403);
    r = await call("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "attacker",
        redirect_uris: ["https://attacker.example/callback"],
        token_endpoint_auth_method: "none",
      }),
    });
    assert.equal(r.status, 400);
    r = await call("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Test ChatGPT",
        redirect_uris: ["https://chatgpt.example/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    assert.equal(r.status, 201);
    const client = (await r.json()) as { client_id: string };
    const verifier = "a".repeat(43),
      challenge = Buffer.from(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ).toString("base64url");
    const authQuery = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: "https://chatgpt.example/callback",
      response_type: "code",
      resource: origin + "/mcp",
      scope: "projects:read projects:write",
      state: "some-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    // Exercise the real sign-in handoff, not only a preauthenticated consent page.
    r = await call("/authorize?" + authQuery);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /name="return_to"/);
    r = await call("/login", {
      method: "POST",
      headers: {
        Origin: origin,
        Accept: "text/html",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        password: "a secure owner password",
        return_to: "/authorize?" + authQuery,
      }),
    });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/authorize?" + authQuery);
    const loginCookie = r.headers.get("set-cookie")!.split(";")[0];
    r = await call("/authorize?" + authQuery, {
      headers: { Cookie: loginCookie },
    });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Allow project access/);
    r = await call("/login", {
      method: "POST",
      headers: {
        Origin: origin,
        Accept: "text/html",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        password: "wrong password",
        return_to: "/authorize?" + authQuery,
      }),
    });
    assert.equal(r.status, 401);
    const retryHtml = await r.text();
    assert.match(retryHtml, /Incorrect password/);
    assert.match(retryHtml, /name="return_to"/);
    assert.match(retryHtml, /type="password"/);
    assert.doesNotMatch(retryHtml, /wrong password/);
    for (const resources of [
      [origin],
      [origin + "/mcp/"],
      [origin + "/mcp", origin],
    ]) {
      const wrongTarget = new URLSearchParams(authQuery);
      wrongTarget.delete("resource");
      for (const resource of resources)
        wrongTarget.append("resource", resource);
      r = await call("/authorize?" + wrongTarget, {
        headers: { Cookie: cookie, Accept: "text/html" },
      });
      assert.equal(r.status, 400);
      const targetError = await r.text();
      assert.match(targetError, /invalid_target/);
      assert.match(
        targetError,
        /The resource parameter must name exactly one configured protected resource/,
      );
    }
    const invalidAuth = new URLSearchParams(authQuery);
    invalidAuth.set("client_id", "not-yet-visible");
    r = await call("/authorize?" + invalidAuth, {
      headers: { Cookie: cookie, Accept: "text/html" },
    });
    assert.equal(r.status, 400);
    const connectionError = await r.text();
    assert.match(connectionError, /Invalid client_id/);
    assert.match(connectionError, /Retry connecting to ChatGPT/);
    assert.doesNotMatch(connectionError, /The operation could not complete/);
    r = await call("/authorize?" + authQuery, { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    const consentHtml = await r.text();
    assert.match(consentHtml, /Connect ChatGPT/);
    const handle = consentHtml.match(/name="handle" value="([^"]+)"/)![1],
      consentCookie = r.headers.get("set-cookie")!.split(";")[0];
    r = await call("/authorize", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie + "; " + consentCookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf, handle, decision: "approve" }),
    });
    assert.equal(r.status, 302);
    const code = new URL(r.headers.get("Location")!).searchParams.get("code")!;
    r = await call("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code,
        code_verifier: verifier,
        redirect_uri: "https://chatgpt.example/callback",
        resource: origin + "/mcp",
      }),
    });
    assert.equal(r.status, 200);
    const token = (await r.json()) as { access_token: string };
    async function mcp(method: string, params?: unknown) {
      const response = await call("/mcp", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token.access_token,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      assert.equal(response.status, 200);
      return response.json() as Promise<any>;
    }
    const tools = await mcp("tools/list");
    assert.equal(tools.result.tools.length, 11);
    const staged = await mcp("tools/call", {
      name: "stage_project",
      arguments: {
        name: "runtime-test",
        base_revision: null,
        files: { "index.html": "<h1>hello</h1>" },
      },
    });
    assert.equal(staged.result.isError, undefined);
    const candidate = JSON.parse(staged.result.content[0].text);
    assert.ok(candidate.id);
    const read = await mcp("tools/call", {
      name: "read_files",
      arguments: {
        project: candidate.project,
        revision: candidate.id,
        path: "index.html",
      },
    });
    assert.equal(
      JSON.parse(read.result.content[0].text).text,
      "<h1>hello</h1>",
    );
    const exported = await mcp("tools/call", {
      name: "export_project",
      arguments: { project: candidate.project, revision: candidate.id },
    });
    const link = JSON.parse(exported.result.content[0].text).download_url;
    r = await mf.dispatchFetch(link);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/zip");
    assert.ok((await r.arrayBuffer()).byteLength > 20);
    r = await call("/setup", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token: "setup-token",
        password: "a secure owner password",
      }),
    });
    assert.equal(r.status, 403);
  } finally {
    await mf.dispose();
  }
});
