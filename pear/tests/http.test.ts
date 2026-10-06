import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import { createApp } from "../src/server/app.ts";
const origin = "http://127.0.0.1:4314";
async function login(app: any, user = "learner-a") {
  const r = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { host: "127.0.0.1:4314", origin },
    payload: { username: user, password: user + "-dev" },
  });
  assert.equal(r.statusCode, 200);
  const b = r.json();
  return {
    headers: {
      host: "127.0.0.1:4314",
      origin,
      cookie: r.headers["set-cookie"].split(";")[0],
      "x-csrf-token": b.csrf,
      "x-pear-epoch": b.sessionEpoch,
    },
    body: b,
  };
}

test("HTTP auth, origin, host, CSRF, session binding and account switch fail closed", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  try {
    assert.equal(
      (
        await app.inject({
          url: "/api/session",
          headers: { host: "127.0.0.1:4314" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          headers: { host: "127.0.0.1:4314", origin: "http://evil.test" },
          payload: { username: "admin", password: "admin-dev" },
        })
      ).statusCode,
      403,
    );
    const s = await login(app);
    const call = {
      requestId: "r",
      documentId: "learning:demo:learner-a",
      toolName: "learning_enroll",
      arguments: { courseId: "learning-vi" },
      expectedRevision: 0,
      idempotencyKey: "k",
    };
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: { ...s.headers, "x-csrf-token": "wrong" },
          payload: call,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: { ...s.headers, host: "evil.test" },
          payload: call,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: { ...s.headers, "x-pear-epoch": "old" },
          payload: call,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: s.headers,
          payload: call,
        })
      ).statusCode,
      200,
    );
    const switched = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: s.headers,
      payload: { username: "learner-b", password: "learner-b-dev" },
    });
    assert.equal(switched.statusCode, 200);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/context",
          headers: s.headers,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: {
            ...s.headers,
            cookie: switched.headers["set-cookie"]!.toString().split(";")[0],
          },
          payload: call,
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
    f.db.close();
  }
});

test("current role/active/auth version are authoritative for HTTP and bridge, including protected audience", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  try {
    const learner = await login(app);
    assert.equal(
      (await app.inject({ url: "/api/audience", headers: learner.headers }))
        .statusCode,
      403,
    );
    const manager = await login(app, "manager");
    assert.deepEqual(
      (await app.inject({ url: "/api/audience", headers: manager.headers }))
        .json()
        .users.map((u: any) => u.id),
      ["learner-a"],
    );
    f.db
      .prepare(
        "UPDATE accounts SET role='learner',auth_version=auth_version+1 WHERE id='manager'",
      )
      .run();
    assert.equal(
      (await app.inject({ url: "/api/describe", headers: manager.headers }))
        .statusCode,
      401,
    );
    f.db.prepare("UPDATE accounts SET active=0 WHERE id='learner-a'").run();
    assert.equal(
      (await app.inject({ url: "/api/context", headers: learner.headers }))
        .statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ url: "/api/session", headers: learner.headers }))
        .statusCode,
      401,
    );
  } finally {
    await app.close();
    f.db.close();
  }
});

test("synthetic credentials require explicit opt-in; API response hides credentials and disallows unknown fields", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin });
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          headers: { origin, host: "127.0.0.1:4314" },
          payload: { username: "admin", password: "admin-dev" },
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
    f.db.close();
  }
  const g = fixture(),
    { app: a } = await createApp({ db: g.db, origin, developmentAuth: true });
  try {
    const s = await login(a);
    assert.equal(
      JSON.stringify(s.body.principal).includes("password_hash"),
      false,
    );
    assert.equal(JSON.stringify(s.body.principal).includes("salt"), false);
    assert.equal(
      (
        await a.inject({
          method: "POST",
          url: "/api/login",
          headers: s.headers,
          payload: { username: "admin", password: "admin-dev", role: "admin" },
        })
      ).statusCode,
      400,
    );
    assert.match(
      (await a.inject({ url: "/api/session", headers: s.headers })).headers[
        "cache-control"
      ]!,
      /no-store/,
    );
  } finally {
    await a.close();
    g.db.close();
  }
});
