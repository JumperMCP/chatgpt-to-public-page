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
              ? "https://dash.cloudflare.com/oauth2/auth"
              : req.url === "/approve"
                ? "https://chatgpt.example/callback?code=test"
                : "/success",
        });
      } catch {
        res.writeHead(403);
      }
      res.end();
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
              "https://chatgpt.example/callback",
            )
          : req.url === "/success"
            ? new Response("Saved")
            : installationPage(
                { step: "authorize", csrf: "browser-csrf" },
                false,
              );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ["--no-sandbox"],
  });
  try {
    const tab = await browser.newPage();
    await tab.route("https://dash.cloudflare.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "Cloudflare consent",
      }),
    );
    await tab.route("https://chatgpt.example/**", (route) =>
      route.fulfill({ status: 200, body: "Connected" }),
    );
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
    await tab.waitForURL("https://dash.cloudflare.com/**", { timeout: 3000 });
    await tab.goto(origin + "/owner");
    await tab.getByRole("button", { name: "Save" }).click();
    await tab.waitForURL(origin + "/success");
    assert.equal(submittedOrigin, origin);
    await tab.goto(origin + "/consent");
    await tab.getByRole("button", { name: "Approve" }).click();
    await tab.waitForURL("https://chatgpt.example/**", { timeout: 3000 });
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
