import { test } from "node:test";
import assert from "node:assert/strict";
import { Projects } from "../src/projects";
import { Publications, type DeploymentProvider } from "../src/cloudflare";
import {
  LIMITS,
  type Project,
  type Revision,
  type Operation,
} from "../src/types";
import { TestStore } from "./helpers";
class Provider implements DeploymentProvider {
  current: { version: string; deployment: string } | null = null;
  activateCalls = 0;
  uploads = 0;
  lostActivation = false;
  failUpload = false;
  reachableNow = true;
  serves = false;
  async ensureOwned(_p: Project) {}
  async upload(_p: Project, _r: Revision) {
    this.uploads++;
    if (this.failUpload) throw Error("upload");
    return crypto.randomUUID();
  }
  async active() {
    return this.current;
  }
  async activate(_p: Project, version: string) {
    this.activateCalls++;
    this.current = { version, deployment: "deployment" };
    if (this.lostActivation) {
      this.lostActivation = false;
      throw Error("lost response");
    }
    return "deployment";
  }
  async serving(_p: Project, enabled: boolean) {
    this.serves = enabled;
  }
  async remove() {
    this.serves = false;
  }
  async reachable() {
    return this.reachableNow;
  }
}
const fixture = () => {
  const store = new TestStore(),
    projects = new Projects(store, "tester"),
    provider = new Provider(),
    publications = new Publications(projects, provider);
  return { store, projects, provider, publications };
};
async function publish(f: ReturnType<typeof fixture>, revision: Revision) {
  const op = f.projects.publish(revision.id, revision.base, true);
  for (let i = 0; i < 4; i++) await f.publications.step(op.id);
  return op;
}
test("snapshots preserve unmentioned bytes, deduplicate chunks and reject stale publication", async () => {
  const f = fixture(),
    image = new Uint8Array(LIMITS.chunkBytes + 10).fill(128);
  const first = await f.projects.stage(
    { name: "hello", base_revision: null, files: { "index.html": "first" } },
    new Map([["photo.png", image]]),
  );
  await publish(f, first);
  assert.deepEqual(f.projects.bytes(first.files["photo.png"]), image);
  const second = await f.projects.stage({
    project: first.project,
    base_revision: first.id,
    patches: [
      { path: "index.html", old_string: "first", new_string: "second" },
    ],
  });
  const stale = await f.projects.stage({
    project: first.project,
    base_revision: first.id,
    files: { "index.html": "stale" },
  });
  await publish(f, second);
  assert.equal(second.files["photo.png"].hash, first.files["photo.png"].hash);
  assert.throws(() => f.projects.publish(stale.id, first.id), /changed/);
  assert.equal(
    f.projects.read(first.project, first.id, "index.html").text,
    "first",
  );
  assert.equal(
    f.projects.read(first.project, undefined, "index.html").text,
    "second",
  );
});
test("exact patches are atomic and every match must be unique", async () => {
  const f = fixture(),
    r = await f.projects.stage({
      name: "patches",
      base_revision: null,
      files: { "index.html": "a b a" },
    });
  await publish(f, r);
  const count = f.store.list("revision:").length;
  await assert.rejects(
    f.projects.stage({
      project: r.project,
      base_revision: r.id,
      patches: [
        { path: "index.html", old_string: "b", new_string: "c" },
        { path: "index.html", old_string: "a", new_string: "d" },
      ],
    }),
    /exactly once/,
  );
  assert.equal(f.store.list("revision:").length, count);
  assert.equal(
    f.projects.read(r.project, undefined, "index.html").text,
    "a b a",
  );
});
test("combined requests are bound to payloads and staged publishes are idempotent", async () => {
  const f = fixture(),
    input = {
      name: "idempotent",
      base_revision: null,
      files: { "index.html": "hello" },
    };
  const a = await f.projects.combined(input, "request-123"),
    b = await f.projects.combined(input, "request-123");
  assert.deepEqual(a, b);
  assert.equal(f.store.list("revision:").length, 1);
  await assert.rejects(
    f.projects.combined(
      { ...input, files: { "index.html": "changed" } },
      "request-123",
    ),
    /different input/,
  );
});
test("activation response loss reconciles without a second activation; delayed reachability stays published", async () => {
  const f = fixture(),
    r = await f.projects.stage({
      name: "timeout",
      base_revision: null,
      files: { "index.html": "hello" },
    }),
    op = f.projects.publish(r.id, null);
  f.provider.lostActivation = true;
  f.provider.reachableNow = false;
  for (let i = 0; i < 5; i++) await f.publications.step(op.id);
  assert.equal(f.provider.activateCalls, 1);
  assert.equal(
    f.store.get<Operation>("operation:" + op.id)?.state,
    "published",
  );
  assert.equal(f.store.get<Operation>("operation:" + op.id)?.reachable, false);
  f.provider.reachableNow = true;
  await f.publications.step(op.id);
  assert.equal(f.store.get<Operation>("operation:" + op.id)?.reachable, true);
});
test("failed uploads preserve the live publication", async () => {
  const f = fixture(),
    r = await f.projects.stage({
      name: "failures",
      base_revision: null,
      files: { "index.html": "old" },
    });
  await publish(f, r);
  const next = await f.projects.stage({
      project: r.project,
      base_revision: r.id,
      files: { "index.html": "new" },
    }),
    op = f.projects.publish(next.id, r.id);
  f.provider.failUpload = true;
  for (let i = 0; i < 7; i++) await f.publications.step(op.id);
  assert.equal(f.store.get<Operation>("operation:" + op.id)?.state, "failed");
  assert.equal(f.projects.project(r.project).live, r.id);
});
test("warnings keep combined candidates private and bounded reads/search identify continuation", async () => {
  const f = fixture(),
    r = await f.projects.stage({
      name: "warnings",
      base_revision: null,
      files: { "index.html": "hello ".repeat(300) },
    });
  await publish(f, r);
  const result = await f.projects.combined(
    {
      project: r.project,
      base_revision: r.id,
      files: { "index.html": "<!-- rest unchanged -->" },
    },
    "request-warning",
  );
  assert.equal(result.state, "staged");
  assert.equal(f.projects.project(r.project).live, r.id);
  assert.equal(
    f.projects.read(r.project, r.id, "index.html", 0, 5).next_offset,
    5,
  );
  assert.equal(f.projects.search(r.project, "hello").next_cursor, 50);
});
test("undo includes serving settings; unpublish retains state; confirmed deletion collects blobs", async () => {
  const f = fixture(),
    r = await f.projects.stage({
      name: "restore",
      base_revision: null,
      files: {
        "index.html": "first",
        "404.html": "missing",
        _headers: "/*\n  X-Robots-Tag: noindex",
      },
    });
  await publish(f, r);
  const next = await f.projects.stage({
    project: r.project,
    base_revision: r.id,
    files: { "index.html": "next" },
    spa: true,
  });
  await publish(f, next);
  const restored = await f.projects.restore(r.project, next.id);
  for (let i = 0; i < 4; i++) await f.publications.step(restored.id);
  const p = f.projects.project(r.project);
  assert.equal(
    f.projects.revision(p.head!, p.id).settings.not_found_handling,
    "404-page",
  );
  assert.match(f.projects.revision(p.head!, p.id).settings.headers!, /noindex/);
  const unpublish = f.projects.remove(p.id, p.head, "unpublish");
  await f.publications.step(unpublish.id);
  assert.equal(f.projects.project(p.id).live, null);
  assert.ok(f.projects.project(p.id).head);
  assert.throws(
    () => f.projects.remove(p.id, p.head, "delete", "wrong"),
    /exact project ID/,
  );
  const deletion = f.projects.remove(p.id, p.head, "delete", p.id);
  await f.publications.step(deletion.id);
  assert.equal(f.projects.usage(), 0);
  assert.equal(f.store.list("project:").length, 0);
});
test("capacity failures leave existing state intact", async () => {
  const f = fixture();
  f.store.put("blob:reserved", { size: LIMITS.retainedBytes });
  await assert.rejects(
    f.projects.stage({
      name: "full",
      base_revision: null,
      files: { "index.html": "hello" },
    }),
    /storage is full/,
  );
  assert.equal(f.store.list("project:").length, 0);
  assert.equal(f.store.list("revision:").length, 0);
});
test("abandoned candidates expire without collecting current content; history capped at 20", async () => {
  const f = fixture();
  let r = await f.projects.stage({
    name: "retained",
    base_revision: null,
    files: { "index.html": "0" },
  });
  await publish(f, r);
  for (let i = 1; i < 23; i++) {
    r = await f.projects.stage({
      project: r.project,
      base_revision: r.id,
      files: { "index.html": String(i) },
    });
    await publish(f, r);
  }
  assert.equal(f.projects.project(r.project).history.length, 20);
  const abandoned = await f.projects.stage({
    name: "abandoned",
    base_revision: null,
    files: { "index.html": "unused" },
  });
  const later = new Projects(
    f.store,
    "tester",
    () => Date.now() + LIMITS.stagingMs + 1000,
  );
  later.collect();
  assert.equal(f.store.get("revision:" + abandoned.id), undefined);
  assert.ok(f.store.get("revision:" + r.id));
});

test("focused edits can extend a private candidate without changing the live revision", async () => {
  const f = fixture(),
    base = await f.projects.stage({
      name: "private-edit",
      base_revision: null,
      files: { "index.html": "first" },
    });
  await publish(f, base);
  const candidate = await f.projects.stage({
    project: base.project,
    base_revision: base.id,
    files: { "index.html": "second" },
  });
  const edited = await f.projects.stage({
    project: base.project,
    candidate: candidate.id,
    base_revision: base.id,
    patches: [
      { path: "index.html", old_string: "second", new_string: "third" },
    ],
  });
  assert.equal(
    f.projects.read(base.project, edited.id, "index.html").text,
    "third",
  );
  assert.equal(
    f.projects.read(base.project, undefined, "index.html").text,
    "first",
  );
});

test("a failed upload retries the same candidate and an unowned hostname can be corrected", async () => {
  const f = fixture(),
    r = await f.projects.stage({
      name: "taken-name",
      base_revision: null,
      files: { "index.html": "hello" },
    });
  f.provider.failUpload = true;
  const op = f.projects.publish(r.id, null);
  for (let i = 0; i < 6; i++) await f.publications.step(op.id);
  assert.equal(f.store.get<Operation>("operation:" + op.id)?.state, "failed");
  f.provider.failUpload = false;
  assert.equal(f.projects.publish(r.id, null).id, op.id);
  for (let i = 0; i < 4; i++) await f.publications.step(op.id);
  assert.equal(f.projects.project(r.project).live, r.id);
  const other = await f.projects.stage({
    name: "unavailable",
    base_revision: null,
    files: { "index.html": "new" },
  });
  const corrected = await f.projects.stage({
    project: other.project,
    candidate: other.id,
    hostname: "available",
    base_revision: null,
  });
  assert.equal(f.projects.project(other.project).hostname, "available");
  assert.equal(
    f.projects.read(other.project, corrected.id, "index.html").text,
    "new",
  );
  await assert.rejects(
    f.projects.stage({
      project: r.project,
      hostname: "changed-live",
      base_revision: r.id,
    }),
    /cannot be changed/,
  );
});
