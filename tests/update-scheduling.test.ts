import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { sha256 } from "../src/types";

test("owner update pauses pending publication between steps and resumes it afterward", async () => {
  const origin = "https://publisher.test";
  const script = await readFile("dist/worker.js", "utf8");
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        script +
        `\nexport class SchedulingPublisher extends Publisher {
      async prepare() {
        const session = await this.auth.setup('setup', 'a secure owner password');
        const revision = await this.projects.stage({name:'pending-site',base_revision:null,files:{'index.html':'Keep these bytes'}});
        const op = this.projects.publish(revision.id,null);
        op.state = 'activating'; op.attempts = 3;
        op.error = {code:'cloudflare_error',message:'Retry pending'};
        this.store.put('operation:'+op.id,op);
        this.store.put('publisher-update',{id:'update',state:'review',from:'0.1.7',created:Date.now(),release:{manifest:{version:'0.1.8'}}});
        return {token:session.token,csrf:session.csrf,op,revision};
      }
      async apply(token, csrf) {
        const response = await this.fetch(new Request(this.env.PUBLISHER_ORIGIN+"/updates/apply", {method:"POST",headers:{Origin:this.env.PUBLISHER_ORIGIN,Cookie:"__Host-publisher="+token,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrf,update:"update"})}));
        return {status:response.status,text:await response.text()};
      }
      async advanceUpdate(outcome) {
        this.updates.step = async () => {
          const update=this.updates.current(); update.state=outcome;
          this.store.put('publisher-update',update);
        };
        this.publications.step = async () => { this.store.put('publication-ran',true); };
        await this.alarm();
        return {update:this.updates.current(),ran:!!this.store.get('publication-ran'),ops:this.publications.pending()};
      }
      async pollWithScheduledRetry(operation, delay = 4000) {
        // A retry is already due sooner than the current backoff interval.
        const due = Date.now() + delay;
        await this.ctx.storage.setAlarm(due);
        const response = await this.fetch(new Request(this.env.PUBLISHER_ORIGIN+"/mcp", {
          method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream","X-Publisher-Owner-Epoch":this.auth.epoch()},
          body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_operation",arguments:{operation}}})
        }));
        const body = await response.text();
        return {due,after:await this.ctx.storage.getAlarm(),status:response.status,body};
      }
      async snapshot(revision, project) {
        const r=this.projects.revision(revision, project);
        return new TextDecoder().decode(this.projects.bytes(r.files['index.html']));
      }
    }`,
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      durableObjects: {
        PUBLISHER: { className: "SchedulingPublisher", useSQLite: true },
      },
      bindings: {
        PUBLISHER_ORIGIN: origin,
        RELEASE_VERSION: "0.1.7",
        ACCOUNT_SUBDOMAIN: "test",
        SETUP_TOKEN_HASH: await sha256("setup"),
        SETUP_EXPIRES_AT: String(Date.now() + 60000),
      },
    }),
  );
  try {
    const ns = await mf.getDurableObjectNamespace("PUBLISHER");
    for (const outcome of ["complete", "failed"] as const) {
      const stub = ns.get(ns.idFromName(outcome)) as unknown as {
        prepare(): Promise<{
          token: string;
          csrf: string;
          op: { id: string };
          revision: { id: string; project: string };
        }>;
        apply(
          token: string,
          csrf: string,
        ): Promise<{ status: number; text: string }>;
        advanceUpdate(
          outcome: string,
        ): Promise<{ update: { state: string }; ran: boolean; ops: unknown[] }>;
        pollWithScheduledRetry(
          operation: string,
          delay?: number,
        ): Promise<{
          due: number;
          after: number;
          status: number;
          body: string;
        }>;
        snapshot(revision: string, project: string): Promise<string>;
      };
      const initial = await stub.prepare();
      const polled = await stub.pollWithScheduledRetry(initial.op.id);
      assert.equal(polled.status, 200, polled.body);
      assert.match(polled.body, /activating/);
      assert.equal(
        polled.after,
        polled.due,
        "A status poll must not postpone an existing publication retry",
      );
      const distant = await stub.pollWithScheduledRetry(initial.op.id, 60000);
      assert.equal(distant.status, 200, distant.body);
      assert.ok(
        distant.after < distant.due,
        "A distant alarm must move earlier when work is pending",
      );
      const post = (csrf: string) => stub.apply(initial.token, csrf);
      assert.equal((await post("wrong")).status, 403);
      const response = await post(initial.csrf);
      assert.equal(response.status, 303, response.text);
      const paused = await stub.advanceUpdate(outcome);
      assert.equal(paused.update.state, outcome);
      assert.equal(paused.ran, false);
      assert.deepEqual(paused.ops, [initial.op]);
      assert.equal(
        await stub.snapshot(initial.revision.id, initial.revision.project),
        "Keep these bytes",
      );
      const resumed = await stub.advanceUpdate(outcome);
      assert.equal(resumed.ran, true);
    }
  } finally {
    await mf.dispose();
  }
});
