import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { dashboard } from "../../src/dashboard";
import { page } from "../../src/ui";

test("Publisher cockpit fits desktop, scrolls long lists, and preserves owner forms on mobile", async () => {
  let posted = "";
  const fixture: Parameters<typeof dashboard>[0] = {
    origin: "https://publisher-c047d890.example.workers.dev",
    account: "test-account",
    version: "0.1.10",
    csrf: "test-csrf",
    connected: true,
    projects: {
      projects: Array.from({ length: 15 }, (_, i) => ({
        id: `project-${i}`,
        name:
          i === 0 ? "Dog tattoo: a lasting portrait" : "Publication " + (i + 1),
        hostname: "site-" + i,
        url: `https://site-${i}.example.workers.dev`,
        head: "revision",
        live: "revision",
        history: ["revision"],
        created: Date.now(),
        owned: true,
      })),
      next_cursor: null,
      retained_bytes: 8832,
      limit_bytes: 262144000,
    },
    operations: Array.from({ length: 10 }, (_, i) => ({
      id: "operation-" + i,
      project: "project-" + i,
      revision: "revision",
      base: null,
      kind: "publish" as const,
      state: i === 0 ? ("activating" as const) : ("published" as const),
      attempts: i === 0 ? 3 : 0,
      created: 1791234000000,
      error:
        i === 0
          ? {
              code: "cloudflare_error",
              message:
                "Cloudflare rejected the request. PUT /workers/scripts/site-0 (HTTP 400; codes 10021).",
            }
          : undefined,
    })),
    receipt: {
      publisher: "https://publisher-c047d890.example.workers.dev",
      mcp: "https://publisher-c047d890.example.workers.dev/mcp",
    },
  };
  const server = createServer(async (req, res) => {
    if (req.method === "POST") {
      for await (const chunk of req) posted += chunk;
      res.end("Saved");
      return;
    }
    const empty = req.url === "/empty";
    const body = dashboard(
      empty
        ? {
            ...fixture,
            connected: false,
            projects: { ...fixture.projects, projects: [] },
            operations: [],
          }
        : fixture,
    );
    const response = page(
      "Publishing, at a glance.",
      body,
      200,
      {},
      undefined,
      true,
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ["--no-sandbox"],
  });
  const tab = await browser.newPage();
  const errors: string[] = [];
  tab.on("pageerror", (error) => errors.push(error.message));
  tab.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  try {
    await mkdir("tmp/design-review", { recursive: true });
    for (const theme of ["light", "dark"] as const) {
      await tab.emulateMedia({ colorScheme: theme });
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1366, height: 768 },
        { width: 1024, height: 768 },
      ]) {
        await tab.setViewportSize(viewport);
        await tab.goto(`http://127.0.0.1:${address.port}/`);
        await tab.evaluate(() => document.fonts.ready);
        const bounds = await tab.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
        }));
        assert.ok(
          bounds.height <= viewport.height + 1,
          JSON.stringify({ viewport, bounds }),
        );
        assert.ok(bounds.width <= viewport.width);
        const scroll = tab.getByRole("region", {
          name: "Projects",
          exact: true,
        });
        assert.ok(
          await scroll.evaluate((el) => el.scrollHeight > el.clientHeight),
        );
        assert.ok(
          await tab
            .locator(".cloudflare-badge")
            .evaluate((el) => (el as HTMLImageElement).naturalWidth > 0),
        );
        if (viewport.width === 1366)
          await tab.screenshot({
            path: `tmp/design-review/cockpit-${theme}.png`,
            fullPage: true,
          });
      }
    }
    await tab.emulateMedia({ colorScheme: "light" });
    await tab.setViewportSize({ width: 390, height: 844 });
    await tab.reload();
    assert.ok(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await tab.screenshot({
      path: "tmp/design-review/cockpit-mobile.png",
      fullPage: true,
    });
    await tab
      .locator(".project-row")
      .first()
      .getByText("Manage project", { exact: true })
      .click();
    const deleteDetails = tab
      .locator(".project-row")
      .first()
      .getByText("Delete permanently", { exact: true });
    await deleteDetails.click();
    const deleteForm = tab.locator('form[action="/delete"]').first();
    assert.equal(
      await deleteForm.locator("input[name=csrf]").inputValue(),
      "test-csrf",
    );
    assert.equal(
      await deleteForm.locator("input[name=project]").inputValue(),
      "project-0",
    );
    await deleteForm.locator("input[name=confirmation]").fill("project-0");
    await deleteForm.getByRole("button").click();
    assert.equal(new URLSearchParams(posted).get("confirmation"), "project-0");
    await tab.goto(`http://127.0.0.1:${address.port}/empty`);
    assert.ok(
      await tab.getByText("Your first site starts in a chat.").isVisible(),
    );
    assert.ok(
      await tab.getByLabel("Cloudflare API token", { exact: true }).isVisible(),
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
