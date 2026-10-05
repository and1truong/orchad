import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/server/database.ts";
import { createApp } from "../src/server/app.ts";
import type { Invoke, Result } from "../src/shared/contract.ts";
const origin = "http://127.0.0.1:4310";
const directories: string[] = [];
afterEach(() => {
  for (const d of directories.splice(0))
    rmSync(d, { recursive: true, force: true });
});
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "guava-test-"));
  directories.push(dir);
  const db = openDatabase(join(dir, "test.sqlite"));
  const { app, service } = await createApp({ db, origin });
  await app.ready();
  async function login(username = "investigator") {
    const r = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin },
      payload: { username, password: username + "-dev" },
    });
    assert.equal(r.statusCode, 200);
    return {
      cookie: r.headers["set-cookie"]!.toString().split(";")[0],
      csrf: r.json().csrf,
    };
  }
  async function invoke(call: any, session: any) {
    const r = await app.inject({
      method: "POST",
      url: "/api/invoke",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: call,
    });
    return { status: r.statusCode, result: r.json() as Result };
  }
  return {
    db,
    app,
    service,
    login,
    invoke,
    close: async () => {
      await app.close();
      db.close();
    },
  };
}
const documentId = "rca-consumer-lag";
const node = (id: string) => ({
  id,
  type: "hypothesis",
  label: "A candidate",
  body: "Not a fact",
  position: { x: 650, y: 0 },
  evidenceIds: ["ev-config"],
});
const call = (
  toolName = "canvas_apply_patch",
  args: any = { operations: [{ op: "add_node", node: node("h1") }] },
  revision: number | null = 0,
  key: string | null = "key-1",
): Invoke => ({
  requestId: crypto.randomUUID(),
  documentId,
  toolName,
  arguments: args,
  expectedRevision: revision,
  idempotencyKey: key,
});

test("one approved batch adds three hypotheses, evidence links, one revision and server principal audit", async () => {
  const f = await fixture();
  try {
    const session = await f.login();
    const operations = ["config", "traffic", "broker"].flatMap((id, i) => [
      {
        op: "add_node",
        node: { ...node("h-" + id), position: { x: 600, y: i * 160 } },
      },
      {
        op: "add_edge",
        edge: {
          id: "e-" + id,
          source: "consumer-lag",
          target: "h-" + id,
          type: "relates",
          label: "candidate",
        },
      },
    ]);
    const { result } = await f.invoke(
      call("canvas_apply_patch", { operations }),
      session,
    );
    assert.equal(result.ok, true);
    assert.equal(result.revision, 1);
    const d = f.service.document(
      { id: "investigator", role: "investigator" },
      documentId,
    );
    assert.equal(d.graph.nodes.length, 6);
    assert.equal(d.graph.edges.length, 5);
    assert.equal(
      d.graph.nodes.filter((n) => n.type === "hypothesis").length,
      3,
    );
    const audit = f.db.prepare("SELECT * FROM audit").get() as any;
    assert.equal(audit.principal, "investigator");
    assert.equal(audit.before_revision, 0);
    assert.equal(audit.after_revision, 1);
    assert.match(audit.summary, /add_node/);
  } finally {
    await f.close();
  }
});

test("atomic replay precedes stale revision; changed payload conflicts; changed requestId and key order replay", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const c = call();
    const first = await f.invoke(c, s);
    const retry = await f.invoke({ ...c, requestId: "retry" }, s);
    assert.deepEqual(retry.result, first.result);
    assert.equal(f.db.prepare("SELECT count(*) n FROM history").get()!.n, 1);
    const conflict = await f.invoke(
      {
        ...c,
        arguments: { operations: [{ op: "add_node", node: node("h2") }] },
      },
      s,
    );
    assert.equal(conflict.result.error?.code, "IDEMPOTENCY_CONFLICT");
    const stale = await f.invoke({ ...c, idempotencyKey: "key-2" }, s);
    assert.equal(stale.result.error?.code, "STALE_CONTEXT");
    assert.equal(stale.status, 409);
    const reordered = await f.invoke(
      {
        ...c,
        arguments: { operations: [{ node: node("h1"), op: "add_node" }] },
      },
      s,
    );
    assert.equal(reordered.result.ok, true);
  } finally {
    await f.close();
  }
});

test("retry after reload / database reopen persists deduplication", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guava-reopen-"));
  directories.push(dir);
  const path = join(dir, "db.sqlite");
  const { CanvasService } = await import("../src/server/service.ts");
  let db = openDatabase(path);
  const p = { id: "investigator", role: "investigator" } as const;
  const c = call();
  const first = new CanvasService(db).invoke(p, c);
  db.close();
  db = openDatabase(path);
  assert.deepEqual(
    new CanvasService(db).invoke(p, { ...c, requestId: "after-disconnect" }),
    first,
  );
  assert.equal(
    new CanvasService(db).document(p, documentId).graph.nodes.length,
    4,
  );
  db.close();
});

test("reader is forbidden by backend even when UI and envelope are tampered", async () => {
  const f = await fixture();
  try {
    const s = await f.login("reader");
    assert.equal((await f.invoke(call(), s)).result.error?.code, "FORBIDDEN");
    assert.equal(
      (await f.invoke({ ...call(), role: "investigator", approved: true }, s))
        .result.error?.code,
      "INVALID_ARGUMENT",
    );
    const read = await f.invoke(call("canvas_get_graph", {}, null, null), s);
    assert.equal(read.result.ok, true);
    assert.equal(read.result.revision, 0);
  } finally {
    await f.close();
  }
});

test("unknown document and cross-document evidence are blocked", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const foreign = await f.invoke(
      {
        ...call("evidence_get", { evidenceIds: ["ev-config"] }, null, null),
        documentId: "brainstorm-workshop",
      },
      s,
    );
    assert.equal(foreign.result.error?.code, "NOT_FOUND");
    assert.equal(
      (await f.invoke({ ...call(), documentId: "private" }, s)).result.error
        ?.code,
      "FORBIDDEN",
    );
    f.db
      .prepare("DELETE FROM access WHERE principal=? AND document_id=?")
      .run("investigator", documentId);
    assert.equal(
      (await f.invoke(call("evidence_search", {}, null, null), s)).result.error
        ?.code,
      "FORBIDDEN",
    );
  } finally {
    await f.close();
  }
});

test("all-or-nothing batch rejects dangling edge, missing reference, duplicate and oversized input", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const bad = [
      {
        operations: [
          { op: "add_node", node: node("valid") },
          {
            op: "add_edge",
            edge: {
              id: "bad",
              source: "valid",
              target: "missing",
              type: "supports",
              label: "",
            },
          },
        ],
      },
      {
        operations: [
          { op: "add_node", node: { ...node("bad"), evidenceIds: ["absent"] } },
        ],
      },
      { operations: [{ op: "add_node", node: node("consumer-lag") }] },
      {
        operations: Array.from({ length: 101 }, () => ({ op: "auto_layout" })),
      },
      {
        operations: [
          {
            op: "add_node",
            node: { ...node("bad"), position: { x: Infinity, y: 0 } },
          },
        ],
      },
    ];
    for (const arguments_ of bad) {
      const r = await f.invoke(call("canvas_apply_patch", arguments_), s);
      assert.equal(r.result.ok, false);
    }
    const d = f.service.document(
      { id: "investigator", role: "investigator" },
      documentId,
    );
    assert.equal(d.revision, 0);
    assert.equal(d.graph.nodes.length, 3);
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM idempotency").get()!.n,
      0,
    );
  } finally {
    await f.close();
  }
});

test("delete node validates final graph; deleting incident edges in same batch succeeds", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    assert.equal(
      (
        await f.invoke(
          call("canvas_apply_patch", {
            operations: [{ op: "delete_node", id: "deployment" }],
          }),
          s,
        )
      ).result.error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      (
        await f.invoke(
          call("canvas_apply_patch", {
            operations: [
              { op: "delete_node", id: "deployment" },
              { op: "delete_edge", id: "edge-deploy" },
            ],
          }),
          s,
        )
      ).result.ok,
      true,
    );
  } finally {
    await f.close();
  }
});

test("undo restores graph with new revision, rejects intervening changes and supports replay", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const first = await f.invoke(call(), s);
    const mutationId = first.result.data.mutationId;
    const undo = call("canvas_undo", { mutationId }, 1, "undo-1");
    const r = await f.invoke(undo, s);
    assert.equal(r.result.revision, 2);
    assert.equal(
      f.service.document(
        { id: "investigator", role: "investigator" },
        documentId,
      ).graph.nodes.length,
      3,
    );
    assert.deepEqual((await f.invoke(undo, s)).result, r.result);
    const patch = await f.invoke(
      call(
        "canvas_apply_patch",
        { operations: [{ op: "auto_layout" }] },
        2,
        "layout",
      ),
      s,
    );
    assert.equal(patch.result.ok, true);
    assert.equal(
      (await f.invoke(call("canvas_undo", { mutationId }, 3, "old-undo"), s))
        .result.error?.code,
      "STALE_CONTEXT",
    );
  } finally {
    await f.close();
  }
});

test("conclusion proposed with references; bridge cannot accept or forge accepted status", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const args = {
      summary: "Configuration may explain throughput drop.",
      supportingEvidenceIds: ["ev-config"],
      contradictoryEvidenceIds: ["ev-transient"],
    };
    const r = await f.invoke(call("investigation_propose_conclusion", args), s);
    assert.equal(r.result.data.status, "proposed");
    const id = r.result.data.nodeId;
    assert.equal(
      (
        await f.invoke(
          call(
            "canvas_apply_patch",
            {
              operations: [
                { op: "update_node", id, changes: { status: "accepted" } },
              ],
            },
            1,
            "forge",
          ),
          s,
        )
      ).result.error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      (
        await f.invoke(
          call("human_accept_conclusion", { nodeId: id }, 1, "accept-via-tool"),
          s,
        )
      ).result.error?.code,
      "UNSUPPORTED",
    );
    const accept = await f.app.inject({
      method: "POST",
      url: "/api/human/accept-conclusion",
      headers: { origin, cookie: s.cookie, "x-csrf-token": s.csrf },
      payload: call(
        "human_accept_conclusion",
        { nodeId: id },
        1,
        "human-accept",
      ),
    });
    assert.equal(accept.statusCode, 200);
    assert.equal(
      f.service
        .document({ id: "investigator", role: "investigator" }, documentId)
        .graph.nodes.find((n) => n.id === id)?.status,
      "accepted",
    );
  } finally {
    await f.close();
  }
});

test("accepted conclusion cannot be deleted or reverted, and the human endpoint runs only the human operation", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const propose = await f.invoke(
      call(
        "investigation_propose_conclusion",
        {
          summary: "Configuration regression may explain the lag.",
          supportingEvidenceIds: ["ev-config"],
          contradictoryEvidenceIds: ["ev-metrics"],
        },
        0,
        "propose",
      ),
      s,
    );
    const nodeId = propose.result.data.nodeId;
    const wrongTool = await f.app.inject({
      method: "POST",
      url: "/api/human/accept-conclusion",
      headers: { origin, cookie: s.cookie, "x-csrf-token": s.csrf },
      payload: call(
        "canvas_apply_patch",
        { operations: [{ op: "delete_node", id: "incident-1" }] },
        1,
        "via-human",
      ),
    });
    assert.equal(wrongTool.json().error?.code, "INVALID_ARGUMENT");
    const retract = await f.invoke(
      call(
        "investigation_propose_conclusion",
        {
          summary: "A draft claim to retract.",
          supportingEvidenceIds: ["ev-deploy"],
          contradictoryEvidenceIds: [],
        },
        1,
        "propose-2",
      ),
      s,
    );
    const draftId = retract.result.data.nodeId;
    const deleted = await f.invoke(
      call(
        "canvas_apply_patch",
        { operations: [{ op: "delete_node", id: draftId }] },
        2,
        "retract",
      ),
      s,
    );
    assert.equal(deleted.result.ok, true);
    const accept = await f.app.inject({
      method: "POST",
      url: "/api/human/accept-conclusion",
      headers: { origin, cookie: s.cookie, "x-csrf-token": s.csrf },
      payload: call("human_accept_conclusion", { nodeId }, 3, "accept"),
    });
    assert.equal(accept.statusCode, 200);
    const acceptMutation = accept.json().data.mutationId;
    assert.equal(
      (
        await f.invoke(
          call(
            "canvas_apply_patch",
            { operations: [{ op: "delete_node", id: nodeId }] },
            4,
            "delete-accepted",
          ),
          s,
        )
      ).result.error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      (
        await f.invoke(
          call("canvas_undo", { mutationId: acceptMutation }, 4, "undo-accept"),
          s,
        )
      ).result.error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.service
        .document({ id: "investigator", role: "investigator" }, documentId)
        .graph.nodes.find((n) => n.id === nodeId)?.status,
      "accepted",
    );
  } finally {
    await f.close();
  }
});

test("proposed conclusion requires existing supporting and contradictory records, forbids overlapping claims", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    for (const args of [
      { summary: "x", supportingEvidenceIds: [], contradictoryEvidenceIds: [] },
      {
        summary: "x",
        supportingEvidenceIds: ["missing"],
        contradictoryEvidenceIds: [],
      },
      {
        summary: "x",
        supportingEvidenceIds: ["ev-config"],
        contradictoryEvidenceIds: ["ev-config"],
      },
    ])
      assert.equal(
        (await f.invoke(call("investigation_propose_conclusion", args), s))
          .result.ok,
        false,
      );
    assert.equal(
      f.service.document(
        { id: "investigator", role: "investigator" },
        documentId,
      ).revision,
      0,
    );
  } finally {
    await f.close();
  }
});

test("auth rejects missing session, invalid credentials, CSRF, foreign origin, and caller role", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.app.inject("/api/documents")).statusCode, 401);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/login",
          headers: { origin },
          payload: { username: "reader", password: "wrong" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/login",
          headers: { origin },
          payload: {
            username: "reader",
            password: "reader-dev",
            role: "investigator",
          },
        })
      ).statusCode,
      400,
    );
    const s = await f.login();
    for (const headers of [
      { origin, cookie: s.cookie },
      { origin: "https://evil.test", cookie: s.cookie, "x-csrf-token": s.csrf },
      { cookie: s.cookie, "x-csrf-token": s.csrf },
    ])
      assert.equal(
        (
          await f.app.inject({
            method: "POST",
            url: "/api/invoke",
            headers,
            payload: call(),
          })
        ).statusCode,
        403,
      );
    const r = await f.app.inject({
      method: "POST",
      url: "/api/logout",
      headers: { origin, cookie: s.cookie, "x-csrf-token": s.csrf },
      payload: {},
    });
    assert.equal(r.statusCode, 200);
    assert.equal((await f.invoke(call(), s)).status, 401);
  } finally {
    await f.close();
  }
});

test("session cookies HttpOnly Strict, secure deployment settings and expiration enforced", async () => {
  const f = await fixture();
  try {
    const r = await f.app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin },
      payload: { username: "reader", password: "reader-dev" },
    });
    const cookie = String(r.headers["set-cookie"]);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const s = await f.login();
    f.db.prepare("UPDATE sessions SET expires=0").run();
    assert.equal((await f.invoke(call(), s)).status, 401);
    const secure = await createApp({
      db: f.db,
      origin: "https://guava.test",
      secureCookies: true,
    });
    const logged = await secure.app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: "https://guava.test" },
      payload: { username: "reader", password: "reader-dev" },
    });
    assert.match(String(logged.headers["set-cookie"]), /__Host-guava-session=/);
    assert.match(String(logged.headers["set-cookie"]), /Secure/);
    await secure.app.close();
  } finally {
    await f.close();
  }
});

test("read tools bounded, deterministic search and explicit neighbors; same tools work on brainstorming", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const graph = await f.invoke(
      call("canvas_get_graph", { nodeLimit: 1, edgeLimit: 1 }, null, null),
      s,
    );
    assert.equal(graph.result.data.nodes.length, 1);
    assert.equal(graph.result.data.nextNodeOffset, 1);
    assert.equal(
      (
        await f.invoke(
          call("canvas_get_graph", { nodeLimit: 101 }, null, null),
          s,
        )
      ).result.error?.code,
      "INVALID_ARGUMENT",
    );
    const neighbors = await f.invoke(
      call(
        "canvas_get_neighbors",
        { nodeIds: ["consumer-lag"], depth: 1 },
        null,
        null,
      ),
      s,
    );
    assert.equal(neighbors.result.data.nodes.length, 3);
    assert.equal(
      (
        await f.invoke(
          call(
            "canvas_get_neighbors",
            { nodeIds: ["consumer-lag"], depth: 3 },
            null,
            null,
          ),
          s,
        )
      ).result.error?.code,
      "INVALID_ARGUMENT",
    );
    const search = await f.invoke(
      call(
        "evidence_search",
        { query: "STABLE", sourceKind: "metric" },
        null,
        null,
      ),
      s,
    );
    assert.ok(search.result.data.records.length);
    const brainstorm = await f.invoke(
      {
        ...call("canvas_apply_patch", {
          operations: [
            {
              op: "add_node",
              node: { ...node("idea"), type: "note", evidenceIds: [] },
            },
          ],
        }),
        documentId: "brainstorm-workshop",
      },
      s,
    );
    assert.equal(brainstorm.result.ok, true);
    const layout = await f.invoke(
      {
        ...call(
          "canvas_apply_patch",
          { operations: [{ op: "auto_layout" }] },
          1,
          "brain-layout",
        ),
        documentId: "brainstorm-workshop",
      },
      s,
    );
    assert.equal(layout.result.ok, true);
  } finally {
    await f.close();
  }
});

test("revoking access blocks stored mutation replay", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const c = call();
    assert.equal((await f.invoke(c, s)).result.ok, true);
    f.db
      .prepare("DELETE FROM access WHERE principal=? AND document_id=?")
      .run("investigator", documentId);
    assert.equal((await f.invoke(c, s)).result.error?.code, "FORBIDDEN");
  } finally {
    await f.close();
  }
});

test("two independent SQLite connections racing the same key create one mutation", async () => {
  const { Worker } = await import("node:worker_threads");
  const dir = mkdtempSync(join(tmpdir(), "guava-race-"));
  directories.push(dir);
  const path = join(dir, "race.sqlite");
  const db = openDatabase(path);
  db.close();
  const request = call();
  const workers = [0, 1].map(
    () =>
      new Worker(new URL("./helpers/mutation-worker.ts", import.meta.url), {
        workerData: { path, call: request },
      }),
  );
  try {
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            w.once("message", () => resolve());
            w.once("error", reject);
          }),
      ),
    );
    const results = workers.map(
      (w) =>
        new Promise<Result>((resolve, reject) => {
          w.once("message", resolve);
          w.once("error", reject);
        }),
    );
    workers.forEach((w) => w.postMessage("go"));
    const [a, b] = await Promise.all(results);
    assert.equal(a.ok, true);
    assert.deepEqual(a, b);
    const check = openDatabase(path, false);
    assert.equal(check.prepare("SELECT count(*) n FROM history").get()!.n, 1);
    assert.equal(
      check
        .prepare("SELECT revision FROM documents WHERE id=?")
        .get(documentId)!.revision,
      1,
    );
    check.close();
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
});

test("graph size cap is enforced transactionally, not just operation count", async () => {
  const f = await fixture();
  try {
    const p = { id: "investigator", role: "investigator" } as const;
    for (let batch = 0; batch < 4; batch++) {
      const operations = Array.from({ length: 100 }, (_, i) => ({
        op: "add_node",
        node: node("bulk-" + batch + "-" + i),
      }));
      assert.equal(
        f.service.invoke(
          p,
          call("canvas_apply_patch", { operations }, batch, "batch-" + batch),
        ).ok,
        true,
      );
    }
    const overflow = f.service.invoke(
      p,
      call(
        "canvas_apply_patch",
        {
          operations: Array.from({ length: 100 }, (_, i) => ({
            op: "add_node",
            node: node("overflow-" + i),
          })),
        },
        4,
        "overflow",
      ),
    );
    assert.equal(overflow.error?.code, "INVALID_ARGUMENT");
    assert.equal(f.service.document(p, documentId).graph.nodes.length, 403);
    assert.equal(f.service.document(p, documentId).revision, 4);
  } finally {
    await f.close();
  }
});

test("same principal re-login rotates session binding and invalidates prior cookie", async () => {
  const f = await fixture();
  try {
    const s = await f.login();
    const a = await f.app.inject({
      url: "/api/session",
      headers: { cookie: s.cookie },
    });
    const next = await f.app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin, cookie: s.cookie },
      payload: { username: "investigator", password: "investigator-dev" },
    });
    const cookie = String(next.headers["set-cookie"]).split(";")[0];
    const b = await f.app.inject({ url: "/api/session", headers: { cookie } });
    assert.equal(a.json().principal.id, b.json().principal.id);
    assert.notEqual(a.json().sessionInstanceId, b.json().sessionInstanceId);
    assert.equal(
      (
        await f.app.inject({
          url: "/api/session",
          headers: { cookie: s.cookie },
        })
      ).statusCode,
      401,
    );
    assert.equal(typeof b.json().sessionInstanceId, "string");
  } finally {
    await f.close();
  }
});
