import { test } from "node:test";
import assert from "node:assert/strict";
import { Cloudflare } from "../src/cloudflare";
import { Projects } from "../src/projects";
import { Credentials } from "../src/security";
import { TestStore } from "./helpers";
test("Cloudflare adapter refuses a colliding unrelated Worker before mutation", async () => {
  const store = new TestStore(),
    projects = new Projects(store, "account"),
    credentials = new Credentials(store, "11".repeat(32), async () => {
      throw Error();
    });
  await credentials.save({ access_token: "token", scopes: [] });
  const r = await projects.stage({
    name: "taken",
    base_revision: null,
    files: { "index.html": "hello" },
  });
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push(init?.method ?? "GET");
    return Response.json({
      success: true,
      result: [
        { id: "unrelated", name: "taken", tags: ["another-installation"] },
      ],
    });
  };
  const provider = new Cloudflare(
    "account",
    "installation",
    credentials,
    projects,
    fetcher,
  );
  await assert.rejects(
    provider.ensureOwned(projects.project(r.project)),
    /unavailable/,
  );
  assert.deepEqual(calls, ["GET"]);
  assert.equal(store.get("remote:" + r.project), undefined);
});
test("assets-only upload sends complete manifest and serving rules, without a script or admin bindings", async () => {
  const store = new TestStore(),
    projects = new Projects(store, "account"),
    credentials = new Credentials(store, "11".repeat(32), async () => {
      throw Error();
    });
  await credentials.save({ access_token: "token", scopes: [] });
  const r = await projects.stage({
      name: "static-site",
      base_revision: null,
      files: {
        "index.html": "hello",
        _headers: "/*\n  X-Robots-Tag: noindex",
        _redirects: "/old / 301",
      },
    }),
    p = projects.project(r.project);
  store.put("remote:" + p.id, { id: "owned" });
  let metadata: any, manifest: any;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    let result: unknown;
    if (url.endsWith("/workers/workers/owned"))
      result = {
        id: "owned",
        name: p.hostname,
        tags: ["publisher:installation:" + p.id],
      };
    else if (url.endsWith("/assets-upload-session")) {
      manifest = JSON.parse(String(init?.body)).manifest;
      result = { jwt: "complete-assets", buckets: [] };
    } else if (url.endsWith("/deployments")) {
      result = {
        deployments: [
          {
            id: "deployment",
            versions: [{ version_id: "version", percentage: 100 }],
          },
        ],
      };
    } else if (url.endsWith("/versions/version")) {
      result = {
        metadata: { annotations: { "workers/message": "operation" } },
      };
    } else if (url.endsWith("/scripts/static-site") && init?.method === "PUT") {
      assert.ok(init?.body instanceof FormData);
      metadata = JSON.parse(String(init.body.get("metadata")));
      assert.equal([...init.body.keys()].length, 1);
      result = { id: "version" };
    } else throw Error("Unexpected API call");
    return Response.json({ success: true, result });
  };
  const provider = new Cloudflare(
    "account",
    "installation",
    credentials,
    projects,
    fetcher,
  );
  const handle = await provider.upload(p, r, "operation");
  assert.equal(handle, "assets:operation");
  assert.equal(Boolean(metadata), false);
  assert.equal(await provider.activate(p, handle, "operation"), "deployment");
  assert.deepEqual(Object.keys(manifest), ["/index.html"]);
  assert.equal(metadata.assets.config._redirects, "/old / 301");
  assert.match(metadata.assets.config._headers, /noindex/);
  assert.equal(metadata.main_module, undefined);
  assert.equal(metadata.bindings, undefined);
});
