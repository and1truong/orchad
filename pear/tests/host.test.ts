import { test } from "node:test";
import assert from "node:assert/strict";
import { HostPolicy } from "../../lime/src/host/policy.ts";
import { createApp } from "../src/server/app.ts";
import { fixture } from "./helpers.ts";
const origin = "http://127.0.0.1:4314";
async function setup() {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { host: "127.0.0.1:4314", origin },
    payload: { username: "learner-a", password: "learner-a-dev" },
  });
  const s = login.json(),
    headers = {
      host: "127.0.0.1:4314",
      origin,
      cookie: login.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": s.csrf,
      "x-pear-epoch": s.sessionEpoch,
    };
  let dispatches = 0;
  const target = {
    targetId: "t",
    pageInstanceId: "p1",
    origin,
    appId: "orchard-pear",
    documentId: "learning:demo:learner-a",
    title: "Pear",
  };
  const get = async (url: string) =>
    (await app.inject({ url, headers })).json();
  const adapter = {
    target,
    current: async () => ({ ...target }),
    describe: () => get("/api/describe"),
    getContext: () => get("/api/context"),
    invoke: async (call: any) => {
      dispatches++;
      return (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers,
          payload: call,
        })
      ).json();
    },
  };
  const consent = {
    clientId: "c",
    sessionId: "s",
    target: { ...target },
    sessionEpoch: s.sessionEpoch,
    reads: new Set(
      f.service
        .description("learner-a")
        .tools.filter((t) => t.effect === "read")
        .map((t) => t.name),
    ),
  };
  const call = {
    requestId: "host-1",
    documentId: target.documentId,
    toolName: "learning_enroll",
    arguments: { courseId: "learning-vi" },
    expectedRevision: 0,
    idempotencyKey: "host-key",
  };
  return {
    ...f,
    app,
    adapter,
    consent,
    call,
    headers,
    dispatches: () => dispatches,
    close: async () => {
      await app.close();
      f.db.close();
    },
  };
}

test("real Lime HostPolicy -> real Pear HTTP/domain: approved/denied/cancelled writes and read consent", async () => {
  const f = await setup();
  try {
    const deny = new HostPolicy(
      f.adapter,
      f.consent,
      async () => false,
      new AbortController().signal,
    );
    assert.equal((await deny.call(f.call)).error?.code, "APPROVAL_DENIED");
    assert.equal(f.dispatches(), 0);
    assert.equal(f.service.context("learner-a").revision, 0);
    const abort = new AbortController(),
      cancel = new HostPolicy(
        f.adapter,
        f.consent,
        async () => {
          abort.abort();
          return true;
        },
        abort.signal,
      );
    assert.equal(
      (await cancel.call({ ...f.call, requestId: "cancel" })).error?.code,
      "CANCELLED",
    );
    assert.equal(f.dispatches(), 0);
    const approve = new HostPolicy(
      f.adapter,
      f.consent,
      async () => true,
      new AbortController().signal,
    );
    assert.equal((await approve.call(f.call)).ok, true);
    assert.equal(f.dispatches(), 1);
    assert.equal(f.service.context("learner-a").revision, 1);
    assert.equal(
      (await approve.call({ ...f.call, requestId: "retry" })).ok,
      true,
    );
    assert.equal(f.service.context("learner-a").revision, 1);
    assert.equal(
      (
        await approve.call({
          ...f.call,
          requestId: "human",
          toolName: "human_submit_attempt",
          arguments: { attemptId: "x", confirmed: true },
        })
      ).error?.code,
      "UNSUPPORTED",
    );
    const read = {
      ...f.call,
      requestId: "read",
      toolName: "learning_get_my_learning",
      arguments: {},
      expectedRevision: null,
      idempotencyKey: null,
    };
    assert.equal((await approve.call(read)).ok, true);
    const noReads = new HostPolicy(
      f.adapter,
      { ...f.consent, reads: new Set() },
      null,
      new AbortController().signal,
    );
    assert.equal((await noReads.call(read)).error?.code, "FORBIDDEN");
  } finally {
    await f.close();
  }
});

test("target change and session rotation during approval have zero dispatch", async () => {
  const f = await setup();
  try {
    const policy = new HostPolicy(
      f.adapter,
      f.consent,
      async () => {
        f.adapter.target.pageInstanceId = "reloaded";
        return true;
      },
      new AbortController().signal,
    );
    assert.equal((await policy.call(f.call)).error?.code, "STALE_CONTEXT");
    assert.equal(f.dispatches(), 0);
    f.adapter.target.pageInstanceId = "p1";
    const sessionPolicy = new HostPolicy(
      f.adapter,
      f.consent,
      async () => {
        await f.app.inject({
          method: "POST",
          url: "/api/logout",
          headers: f.headers,
          payload: {},
        });
        return true;
      },
      new AbortController().signal,
    );
    assert.equal((await sessionPolicy.call(f.call)).ok, false);
    assert.equal(f.dispatches(), 0);
    assert.equal(f.service.context("learner-a").revision, 0);
  } finally {
    await f.close();
  }
});

test("concurrent HTTP same-key writes deduplicate; different-key stale revisions conflict", async () => {
  const f = await setup();
  try {
    const send = (payload: any) =>
      f.app.inject({
        method: "POST",
        url: "/api/bridge/invoke",
        headers: f.headers,
        payload,
      });
    const responses = await Promise.all([
      send(f.call),
      send({ ...f.call, requestId: "concurrent" }),
    ]);
    assert.deepEqual(responses[0].json(), responses[1].json());
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) AS n FROM enrollments").get() as any).n,
      1,
    );
    const next = {
      ...f.call,
      toolName: "learning_set_bookmark",
      arguments: { courseId: "learning-vi", saved: true },
      expectedRevision: 1,
    };
    const pair = await Promise.all([
      send({ ...next, requestId: "a", idempotencyKey: "a" }),
      send({ ...next, requestId: "b", idempotencyKey: "b" }),
    ]);
    assert.deepEqual(pair.map((r) => r.statusCode).sort(), [200, 409]);
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) AS n FROM bookmarks").get() as any).n,
      1,
    );
  } finally {
    await f.close();
  }
});
