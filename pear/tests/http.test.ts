import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import { createApp } from "../src/server/app.ts";
import { data } from "./helpers.ts";
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
test("standalone authoring HTTP and bridge share tenant/role/egress checks", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  const item = {
    title: "Private item",
    summary: "Original fixture",
    language: "en",
    provider: "Pear Originals",
    license: "self-authored",
    aiProcessingAllowed: false,
    kind: "text",
    text: "Human-only source content",
  };
  try {
    const editor = await login(app, "editor");
    const envelope = {
      requestId: "item-http",
      documentId: "library:demo",
      toolName: "learning_create_content_item",
      arguments: { itemId: "http-item", item },
      expectedRevision: 0,
      idempotencyKey: "http-item-key",
    };
    const saved = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: editor.headers,
      payload: envelope,
    });
    assert.equal(saved.statusCode, 200);
    data(saved.json());
    data(
      f.call("editor", "learning_publish_content_item", {
        itemId: "http-item",
      }),
    );
    const learner = await login(app);
    const read = {
      requestId: "item-read",
      documentId: "learning:demo:learner-a",
      toolName: "learning_get_content_item",
      arguments: { itemId: "http-item" },
      expectedRevision: null,
      idempotencyKey: null,
    };
    const bridge = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: learner.headers,
      payload: read,
    });
    assert.equal(data(bridge.json()).contentWithheld, true);
    assert.equal(JSON.stringify(bridge.json()).includes(item.text), false);
    const human = await app.inject({
      method: "POST",
      url: "/api/human/invoke",
      headers: learner.headers,
      payload: read,
    });
    assert.equal(data(human.json()).text, item.text);
    for (const url of ["/api/human/invoke", "/api/bridge/invoke"]) {
      const denied = await app.inject({
        method: "POST",
        url,
        headers: learner.headers,
        payload: { ...envelope, expectedRevision: 2, idempotencyKey: "denied" },
      });
      assert.equal(denied.json().error.code, "FORBIDDEN");
    }
    const outsider = await login(app, "outsider");
    const denied = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: outsider.headers,
      payload: { ...read, documentId: "learning:other:outsider" },
    });
    assert.equal(denied.json().error.code, "NOT_FOUND");
  } finally {
    await app.close();
    f.db.close();
  }
});

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

test("program evidence and certificate HTTP routes preserve learner and assessor scope", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  try {
    const award = {
      title: "HTTP program",
      summary: "Original evidence",
      access: "tenant",
      unit: "credits",
      target: 1,
      ongoing: false,
      moderatedExternal: true,
      requirements: [
        {
          id: "evidence",
          title: "Practice",
          required: true,
          credits: 1,
          alternatives: [{ kind: "external", id: "practice" }],
        },
      ],
    };
    data(
      f.call("admin", "learning_save_award", {
        collectionId: "http-program",
        award,
      }),
    );
    data(
      f.call("admin", "learning_publish_collection", {
        collectionId: "http-program",
      }),
    );
    const id = data(
      f.call("learner-a", "learning_enroll_award", {
        collectionId: "http-program",
      }),
    ).awardEnrollmentId;
    const learner = await login(app);
    const payload = {
      requestId: "evidence",
      documentId: "learning:demo:learner-a",
      toolName: "human_submit_external_record",
      arguments: {
        awardEnrollmentId: id,
        criterionPath: "evidence",
        amount: 1,
        evidence: "Private learner evidence",
        confirmed: true,
      },
      expectedRevision: f.service.context("learner-a").revision,
      idempotencyKey: "http-evidence",
    };
    const denied = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: learner.headers,
      payload,
    });
    assert.equal(denied.statusCode, 403);
    const submitted = await app.inject({
      method: "POST",
      url: "/api/human/invoke",
      headers: learner.headers,
      payload,
    });
    const recordId = data(submitted.json()).recordId;
    const assessor = await login(app, "assessor");
    const read = {
      requestId: "read",
      documentId: "library:demo",
      toolName: "learning_get_external_records",
      arguments: { collectionId: "http-program" },
      expectedRevision: null,
      idempotencyKey: null,
    };
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/human/invoke",
          headers: assessor.headers,
          payload: read,
        })
      ).statusCode,
      403,
    );
    data(
      f.call("admin", "learning_set_award_assessor", {
        collectionId: "http-program",
        assessorId: "assessor",
        enabled: true,
      }),
    );
    assert.equal(
      JSON.stringify(
        (
          await app.inject({
            method: "POST",
            url: "/api/bridge/invoke",
            headers: assessor.headers,
            payload: read,
          })
        ).json(),
      ).includes("Private learner evidence"),
      false,
    );
    data(
      f.call("assessor", "learning_assess_external_record", {
        recordId,
        accepted: true,
        reason: "Verified",
      }),
    );
    const certificate = (
      f.db
        .prepare("SELECT certificate_id FROM award_enrollments WHERE id=?")
        .get(id) as any
    ).certificate_id;
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/award-certificates/" + certificate,
          headers: learner.headers,
        })
      ).statusCode,
      200,
    );
    const other = await login(app, "learner-b");
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/award-certificates/" + certificate,
          headers: other.headers,
        })
      ).statusCode,
      403,
    );
    f.db
      .prepare(
        "UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id='learner-a'",
      )
      .run();
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/award-certificates/" + certificate,
          headers: learner.headers,
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
    f.db.close();
  }
});

test("admin user deactivation through HTTP revokes a live session and keeps learner ledger private", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  try {
    const learner = await login(app),
      admin = await login(app, "admin");
    data(
      f.call("learner-a", "learning_enroll", { courseId: "systems-basics" }),
    );
    const saved = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: admin.headers,
      payload: {
        requestId: "deactivate",
        documentId: "library:demo::people",
        toolName: "learning_save_user",
        arguments: {
          user: {
            id: "learner-a",
            name: "learner-a",
            role: "learner",
            active: false,
            managerId: "manager",
            preferredLanguage: "en",
            interests: [],
            customFields: [],
          },
        },
        expectedRevision: f.service.context("admin", "library:demo").revision,
        idempotencyKey: "deactivate-http",
      },
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/session",
          headers: learner.headers,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT COUNT(*) n FROM enrollments WHERE learner='learner-a'",
          )
          .get() as any
      ).n,
      1,
    );
    const manager = await login(app, "manager");
    const denied = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: manager.headers,
      payload: {
        requestId: "denied",
        documentId: "library:demo::people",
        toolName: "learning_save_user",
        arguments: {
          user: {
            id: "outsider",
            name: "hidden",
            role: "admin",
            active: true,
            managerId: null,
            preferredLanguage: "en",
            interests: [],
            customFields: [],
          },
        },
        expectedRevision: f.service.context("manager", "library:demo").revision,
        idempotencyKey: "not-authorized",
      },
    });
    assert.equal(denied.statusCode, 403);
  } finally {
    await app.close();
    f.db.close();
  }
});

test("assignment jobs use server time, deduplicate HTTP retries and keep notification reads/writes private", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  try {
    const plan = {
      title: "HTTP scheduled requirement",
      targetKind: "course",
      targetId: "systems-basics",
      audienceKind: "individuals",
      learnerIds: ["learner-a"],
      groupId: "",
      membership: "fixed",
      startsAt: new Date(Date.now() - 60000).toISOString(),
      repeatDays: 0,
      endAt: null,
      dueKind: "none",
      fixedDueAt: null,
      rollingDays: 0,
    };
    data(
      f.call("manager", "learning_save_assignment_plan", {
        planId: "http-job",
        plan,
        reason: "Reviewed",
      }),
    );
    const admin = await login(app, "admin"),
      manager = await login(app, "manager");
    const payload = {
      requestId: "run",
      documentId: "library:demo::assignments",
      toolName: "learning_run_assignment_jobs",
      arguments: {},
      expectedRevision: f.service.context("admin", "library:demo").revision,
      idempotencyKey: "run-http",
    };
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: manager.headers,
          payload,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: admin.headers,
          payload: {
            ...payload,
            arguments: { now: "2099-01-01T00:00:00.000Z" },
          },
        })
      ).statusCode,
      400,
    );
    const first = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: admin.headers,
      payload,
    });
    assert.equal(first.statusCode, 200);
    assert.equal(data(first.json()).cyclesProcessed, 1);
    const retried = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: admin.headers,
      payload,
    });
    assert.deepEqual(retried.json(), first.json());
    assert.equal(
      (
        f.db
          .prepare("SELECT COUNT(*) n FROM assignment_deliveries")
          .get() as any
      ).n,
      1,
    );
    const learner = await login(app),
      other = await login(app, "learner-b");
    const read = {
      requestId: "notifications",
      documentId: "learning:demo:learner-a::assignments",
      toolName: "learning_get_notifications",
      arguments: {},
      expectedRevision: null,
      idempotencyKey: null,
    };
    const notifications = data(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: learner.headers,
          payload: read,
        })
      ).json(),
    );
    assert.equal(notifications.items.length, 1);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: other.headers,
          payload: read,
        })
      ).statusCode,
      403,
    );
    const notificationId = notifications.items[0].id;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/human/invoke",
          headers: other.headers,
          payload: {
            ...read,
            documentId: "learning:demo:learner-b",
            toolName: "learning_read_notification",
            arguments: { notificationId },
            expectedRevision: f.service.context("learner-b").revision,
            idempotencyKey: "foreign-notification",
          },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        f.db
          .prepare("SELECT read_at FROM learning_notifications WHERE id=?")
          .get(notificationId) as any
      ).read_at,
      null,
    );
  } finally {
    await app.close();
    f.db.close();
  }
});

test("report HTTP exports retain direct-report scope and revoked session denial", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  try {
    data(f.call("learner-a", "learning_enroll", { courseId: "learning-vi" }));
    data(
      f.call("learner-b", "learning_enroll", { courseId: "systems-basics" }),
    );
    const manager = await login(app, "manager");
    const { freshReport } = await import("../src/shared/reports.ts");
    const payload = {
      requestId: "report-http",
      documentId: "library:demo::reports",
      toolName: "learning_export_report",
      arguments: { spec: freshReport(), rows: "all", columns: "all" },
      expectedRevision: null,
      idempotencyKey: null,
    };
    const r = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: manager.headers,
      payload,
    });
    assert.equal(r.statusCode, 200);
    const csv = data(r.json()).csv;
    assert.ok(csv.includes("learner-a"));
    assert.ok(!csv.includes("learner-b"));
    const forbidden = await app.inject({
      method: "POST",
      url: "/api/human/invoke",
      headers: manager.headers,
      payload: {
        ...payload,
        arguments: {
          ...payload.arguments,
          spec: { ...freshReport(), learnerId: "learner-b" },
        },
      },
    });
    assert.equal(forbidden.json().error.code, "FORBIDDEN");
    f.db
      .prepare(
        "UPDATE accounts SET auth_version=auth_version+1 WHERE id='manager'",
      )
      .run();
    const revoked = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: manager.headers,
      payload,
    });
    assert.equal(revoked.statusCode, 401);
  } finally {
    await app.close();
    f.db.close();
  }
});

test("essay details and grading use authenticated human channel and live scoped assessor authority", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  try {
    const { courses } = await import("../src/server/seed.ts"),
      course = structuredClone(courses["learning-vi"]);
    course.quiz.questions = [
      {
        id: "essay-http",
        kind: "long_answer",
        prompt: "Describe your own study",
        options: [],
        correct: 0,
        points: 2,
        rubric: "Two points for explanation",
      },
    ];
    data(
      f.call("editor", "learning_create_course", {
        courseId: "http-essay",
        course,
      }),
    );
    data(
      f.call("editor", "learning_publish_course", { courseId: "http-essay" }),
    );
    data(
      f.call("editor", "learning_set_course_assessor", {
        courseId: "http-essay",
        assessorId: "assessor",
        enabled: true,
      }),
    );
    const enrollmentId = data(
      f.call("learner-a", "learning_enroll", { courseId: "http-essay" }),
    ).enrollmentId;
    data(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId, lessonId: "practice" },
        "human",
      ),
    );
    const attemptId = data(
      f.call("learner-a", "learning_start_attempt", { enrollmentId }),
    ).attemptId;
    data(
      f.call(
        "learner-a",
        "human_save_answer",
        {
          attemptId,
          questionId: "essay-http",
          answer: "Private original essay body",
        },
        "human",
      ),
    );
    data(
      f.call(
        "learner-a",
        "human_submit_attempt",
        { attemptId, confirmed: true },
        "human",
      ),
    );
    const assessor = await login(app, "assessor"),
      payload = {
        requestId: "grade-http",
        documentId: "library:demo::assessments",
        toolName: "human_assess_answer",
        arguments: {
          attemptId,
          questionId: "essay-http",
          points: 2,
          reason: "Reviewed own explanation",
        },
        expectedRevision: f.service.context("assessor", "library:demo")
          .revision,
        idempotencyKey: "grade-http",
      };
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: assessor.headers,
          payload,
        })
      ).statusCode,
      403,
    );
    const detail = await app.inject({
      method: "POST",
      url: "/api/human/invoke",
      headers: assessor.headers,
      payload: {
        ...payload,
        toolName: "human_get_assessment_submission",
        arguments: { attemptId },
        expectedRevision: null,
        idempotencyKey: null,
      },
    });
    assert.equal(
      data(detail.json()).questions[0].answer,
      "Private original essay body",
    );
    data(
      f.call("editor", "learning_set_course_assessor", {
        courseId: "http-essay",
        assessorId: "assessor",
        enabled: false,
      }),
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/human/invoke",
          headers: assessor.headers,
          payload,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM essay_reviews").get() as any).n,
      0,
    );
    data(
      f.call("editor", "learning_set_course_assessor", {
        courseId: "http-essay",
        assessorId: "assessor",
        enabled: true,
      }),
    );
    payload.expectedRevision = f.service.context(
      "assessor",
      "library:demo",
    ).revision;
    const result = await app.inject({
      method: "POST",
      url: "/api/human/invoke",
      headers: assessor.headers,
      payload,
    });
    assert.equal(data(result.json()).score, 100);
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM certificates").get() as any).n,
      1,
    );
    assert.ok(
      !JSON.stringify(f.db.prepare("SELECT * FROM audit").all()).includes(
        "Private original essay body",
      ),
    );
  } finally {
    await app.close();
    f.db.close();
  }
});

test("synthetic login separates valid shared-IP requests from failed guesses without resetting brute-force limits", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  const now = Date.now;
  let clock = now();
  Date.now = () => clock;
  const signin = (password: string) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      headers: { host: "127.0.0.1:4314", origin },
      payload: { username: "learner-a", password },
    });
  try {
    for (let i = 0; i < 31; i++)
      assert.equal((await signin("learner-a-dev")).statusCode, 200);
    for (let i = 0; i < 29; i++)
      assert.equal((await signin("wrong")).statusCode, 401);
    assert.equal((await signin("learner-a-dev")).statusCode, 200);
    assert.equal((await signin("wrong")).statusCode, 401);
    const blocked = await signin("learner-a-dev");
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers["retry-after"], "60");
    clock += 60001;
    assert.equal((await signin("learner-a-dev")).statusCode, 200);
  } finally {
    Date.now = now;
    await app.close();
    f.db.close();
  }
});
