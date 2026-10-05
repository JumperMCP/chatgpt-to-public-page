import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { chromium } from "playwright";
import { installationPage } from "../../src/installer/ui";
import { page, form } from "../../src/ui";
import { exactOrigin } from "../../src/security";

// A browser must create Origin itself: API clients with hand-written headers
// cannot detect Referrer-Policy suppression or CSP redirect failures.
test("native installer and owner forms preserve Origin and permit OAuth navigation", async () => {
  let origin = "";
  let callbackOrigin = "";
  let submittedOrigin: string | undefined;
  const server = createServer(async (req, res) => {
    if (req.method === "POST") {
      submittedOrigin = req.headers.origin;
      try {
        exactOrigin(
          new Request(origin, { headers: { Origin: submittedOrigin ?? "" } }),
          origin,
        );
        let body = "";
        for await (const chunk of req) body += chunk;
        assert.equal(new URLSearchParams(body).get("csrf"), "browser-csrf");
        res.writeHead(303, {
          Location:
            req.url === "/start"
              ? callbackOrigin + "/oauth2/auth"
              : req.url === "/approve"
                ? callbackOrigin + "/callback?code=test"
                : "/success",
        });
      } catch {
        res.writeHead(403);
      }
      res.end();
      return;
    }
    if (req.headers.host?.startsWith("localhost:")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("Local OAuth destination");
      return;
    }
    const response =
      req.url === "/owner"
        ? page("Owner", form("/save", "browser-csrf", "<button>Save</button>"))
        : req.url === "/consent"
          ? page(
              "Consent",
              form("/approve", "browser-csrf", "<button>Approve</button>"),
              200,
              {},
              callbackOrigin + "/callback",
            )
          : req.url === "/success"
            ? new Response("Saved")
            : installationPage(
                { step: "authorize", csrf: "browser-csrf" },
                false,
              );
    // Redirected requests bypass Playwright's route stubs. Use a second
    // loopback origin so the browser exercises real redirects without network.
    const headers = new Headers(response.headers);
    const policy = headers.get("Content-Security-Policy");
    if (req.url === "/" && policy) {
      assert.ok(
        policy.includes("form-action 'self' https://dash.cloudflare.com;"),
      );
      headers.set(
        "Content-Security-Policy",
        policy.replace("https://dash.cloudflare.com", callbackOrigin),
      );
    }
    res.writeHead(response.status, Object.fromEntries(headers));
    res.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  callbackOrigin = `http://localhost:${address.port}`;
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ["--no-sandbox"],
  });
  try {
    const tab = await browser.newPage();
    await tab.goto(origin);
    const submission = tab.waitForResponse(
      (r) => r.url() === origin + "/start",
    );
    await tab.getByRole("button", { name: "Install on my Cloudflare" }).click();
    await submission;
    assert.equal(
      submittedOrigin,
      origin,
      "browser-native POST must retain the actual Origin",
    );
    await tab.waitForURL(callbackOrigin + "/oauth2/auth", { timeout: 3000 });
    await tab.goto(origin + "/owner");
    await tab.getByRole("button", { name: "Save" }).click();
    await tab.waitForURL(origin + "/success");
    assert.equal(submittedOrigin, origin);
    await tab.goto(origin + "/consent");
    await tab.getByRole("button", { name: "Approve" }).click();
    await tab.waitForURL(callbackOrigin + "/callback?code=test", {
      timeout: 3000,
    });
    for (const invalidOrigin of ["null", "https://attacker.example"]) {
      const r = await tab.request.post(origin + "/start", {
        headers: { Origin: invalidOrigin },
        form: { csrf: "browser-csrf" },
      });
      assert.equal(r.status(), 403);
    }
  } finally {
    await browser.close();
    server.close();
    await once(server, "close");
  }
});
