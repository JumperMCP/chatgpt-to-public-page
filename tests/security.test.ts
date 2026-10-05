import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Credentials,
  OwnerAuth,
  decrypt,
  encrypt,
  exactOrigin,
  getCookie,
  sessionCookie,
} from "../src/security";
import { registrationAllowed } from "../src/oauth-policy";
import { sha256 } from "../src/types";
import { TestStore } from "./helpers";
test("single-use setup, recovery, login throttling and epoch invalidation", async () => {
  const store = new TestStore(),
    env = {
      SETUP_TOKEN_HASH: await sha256("setup"),
      SETUP_EXPIRES_AT: String(Date.now() + 60000),
      RECOVERY_TOKEN_HASH: await sha256("recovery"),
      RECOVERY_EXPIRES_AT: String(Date.now() + 60000),
    },
    auth = new OwnerAuth(store, env);
  await assert.rejects(
    auth.setup("wrong", "a long secure password"),
    /invalid or expired/,
  );
  const first = await auth.setup("setup", "a long secure password");
  await assert.rejects(
    auth.setup("setup", "a long secure password"),
    /invalid or expired/,
  );
  const request = new Request("https://owner.example", {
    headers: { Cookie: sessionCookie(first.token) },
  });
  assert.equal((await auth.session(request)).csrf, first.csrf);
  await auth.setup("recovery", "a different long password", true);
  await assert.rejects(auth.session(request), /Sign in/);
  for (let i = 0; i < 10; i++)
    await assert.rejects(auth.login("incorrect"), /Incorrect/);
  await assert.rejects(
    auth.login("a different long password"),
    /Wait 15 minutes/,
  );
});
test("untrusted sibling origins, missing CSRF and cookie tossing are rejected", async () => {
  const store = new TestStore(),
    auth = new OwnerAuth(store, {
      SETUP_TOKEN_HASH: await sha256("token"),
      SETUP_EXPIRES_AT: String(Date.now() + 60000),
    });
  const session = await auth.setup("token", "a secure owner password");
  const sibling = new Request("https://owner.account.workers.dev/delete", {
    method: "POST",
    headers: {
      Origin: "https://site.account.workers.dev",
      Cookie: sessionCookie(session.token),
    },
  });
  await assert.rejects(
    auth.mutate(sibling, "https://owner.account.workers.dev", session.csrf),
    /originate/,
  );
  const owner = new Request(sibling, {
    headers: {
      Origin: "https://owner.account.workers.dev",
      Cookie: sessionCookie(session.token),
    },
  });
  await assert.rejects(
    auth.mutate(owner, "https://owner.account.workers.dev", "wrong"),
    /expired/,
  );
  assert.throws(
    () =>
      getCookie(
        new Request("https://owner.example", {
          headers: { Cookie: "__Host-publisher=a; __Host-publisher=b" },
        }),
      ),
    /Ambiguous/,
  );
  assert.match(
    sessionCookie("a"),
    /Secure; HttpOnly; Path=\/; SameSite=Strict/,
  );
  assert.doesNotMatch(sessionCookie("a"), /Domain/);
});
test("callback registration fails closed and accepts only exact configured destinations", () => {
  const allowed = ["https://chatgpt.example/callback"];
  assert.equal(
    registrationAllowed(
      { redirect_uris: allowed, token_endpoint_auth_method: "none" },
      allowed,
    ),
    true,
  );
  for (const redirect of [
    "https://chatgpt.example/callback/extra",
    "https://attacker.example/callback",
    "https://chatgpt.example/callback?next=attacker",
  ])
    assert.equal(
      registrationAllowed(
        { redirect_uris: [redirect], token_endpoint_auth_method: "none" },
        allowed,
      ),
      false,
    );
  assert.equal(registrationAllowed({ redirect_uris: allowed }, allowed), false);
  assert.equal(
    registrationAllowed(
      { redirect_uris: allowed, token_endpoint_auth_method: "none" },
      [],
    ),
    false,
  );
});
test("credential encryption survives reload; rotation is serialized and interruption forces reconnect", async () => {
  const store = new TestStore(),
    key = "11".repeat(32);
  let calls = 0;
  const refresh = async () => {
    calls++;
    return {
      access_token: "new-access",
      refresh_token: "rotated-refresh",
      expires_at: Date.now() + 3600000,
      scopes: ["workers"],
    };
  };
  const credentials = new Credentials(store, key, refresh);
  await credentials.save({
    access_token: "expired",
    refresh_token: "old",
    expires_at: 1,
    scopes: ["workers"],
  });
  assert.deepEqual(
    await Promise.all([credentials.token(), credentials.token()]),
    ["new-access", "new-access"],
  );
  assert.equal(calls, 1);
  assert.equal(
    await new Credentials(store, key, refresh).token(),
    "new-access",
  );
  assert.doesNotMatch(
    JSON.stringify(store.get("credential")),
    /new-access|rotated-refresh/,
  );
  store.put("refresh-pending", true);
  await assert.rejects(
    new Credentials(store, key, refresh).token(),
    /interrupted/,
  );
  const encrypted = await encrypt({ token: "secret" }, key);
  assert.deepEqual(await decrypt(encrypted, key), { token: "secret" });
  await assert.rejects(decrypt(encrypted, "22".repeat(32)), /decryption/);
});

test("Cloudflare scopes are validated before provisioning and refresh rejects revoked credentials", async () => {
  const { validateScopes, exchangeCloudflare } =
    await import("../src/cloudflare-oauth");
  assert.throws(
    () => validateScopes("read", ["read", "write"]),
    /every required/,
  );
  assert.deepEqual(validateScopes("write read", ["read", "write"]), [
    "write",
    "read",
  ]);
  const response: typeof fetch = async () =>
    Response.json({
      access_token: "new",
      token_type: "bearer",
      expires_in: 3600,
      scope: "read",
    });
  await assert.rejects(
    exchangeCloudflare(
      new URLSearchParams({ client_id: "client" }),
      ["write"],
      undefined,
      response,
    ),
    /every required/,
  );
  const revoked: typeof fetch = async () => new Response(null, { status: 401 });
  await assert.rejects(
    exchangeCloudflare(new URLSearchParams(), ["write"], undefined, revoked),
    /Reconnect/,
  );
});
