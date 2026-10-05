import { test } from "node:test";
import assert from "node:assert/strict";
import { installationPage, installationError } from "../src/installer/ui";

test("installer presentation preserves forms and escapes provider-controlled content", async () => {
  const start = installationPage(
    { step: "authorize", csrf: 'token"<&' },
    false,
  );
  const html = await start.text();
  assert.match(html, /method="post" action="\/start"/);
  assert.match(html, /name="csrf" value="token&#34;&#60;&#38;"/);
  assert.match(html, /Install on my Cloudflare/);
  assert.equal(start.headers.get("Cache-Control"), "no-store, no-transform");
  assert.match(
    start.headers.get("Content-Security-Policy")!,
    /form-action 'self'/,
  );
  assert.doesNotMatch(html, /<script/);

  const account = await installationPage(
    {
      step: "account",
      csrf: "token",
      accounts: [{ id: 'id"', name: '<img src=x onerror="alert(1)">' }],
    },
    false,
  ).text();
  assert.match(account, /method="post" action="\/account"/);
  assert.match(account, /name="account" required/);
  assert.match(account, /value="id&#34;"/);
  assert.doesNotMatch(account, /<img src=x/);

  const retry = await installationPage(
    { step: "publisher", csrf: "token", error: "<script>bad</script>" },
    false,
  ).text();
  assert.match(retry, /method="post" action="\/resume"/);
  assert.match(retry, /role="alert"/);
  assert.doesNotMatch(retry, /<script>/);

  const complete = await installationPage(
    {
      step: "complete",
      csrf: "token",
      worker: "publisher",
      subdomain: "owner",
      setup: "one-use",
    },
    false,
  ).text();
  assert.match(
    complete,
    /https:\/\/publisher.owner.workers.dev\/setup\?token=one-use/,
  );
  assert.match(complete, /Installation receipt/);
  assert.match(complete, /Step-by-step instructions/);
  assert.doesNotMatch(complete, /refresh is unverified/);
  const error = installationError("<script>bad</script>", 503);
  assert.equal(error.status, 503);
  assert.doesNotMatch(await error.text(), /<script>/);
});
