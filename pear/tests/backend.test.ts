import test from "node:test";
import assert from "node:assert/strict";
import {
  makeApp,
  login,
  invoke,
  write,
  completeLesson,
  enrollCourse,
  ORIGIN,
} from "./helpers.ts";

test("login, session, csrf and origin guards", async () => {
  const { app } = await makeApp();
  const bad = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { username: "learner1", password: "wrong" },
  });
  assert.equal(bad.statusCode, 401);

  const c = await login(app, "learner1", "learner-dev");
  const session = await app.inject({
    method: "GET",
    url: "/api/session",
    headers: { cookie: c.cookies },
  });
  const s = session.json() as {
    data: { role: string; orgId: string; sessionEpoch: string };
  };
  assert.equal(s.data.role, "learner");
  assert.equal(s.data.orgId, "org-demo");
  assert.ok(s.data.sessionEpoch.length > 16);

  const noCsrf = await app.inject({
    method: "POST",
    url: "/api/invoke",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      cookie: c.cookies,
    },
    payload: {},
  });
  assert.equal(noCsrf.statusCode, 403);

  const badOrigin = await app.inject({
    method: "POST",
    url: "/api/invoke",
    headers: {
      origin: "http://evil.example",
      "content-type": "application/json",
      cookie: c.cookies,
      "x-csrf-token": c.csrf,
    },
    payload: {},
  });
  assert.equal(badOrigin.statusCode, 403);
  await app.close();
});

test("catalog search, filters and item detail", async () => {
  const { app } = await makeApp();
  const c = await login(app, "learner1", "learner-dev");
  const r = await invoke(app, c, {
    toolName: "learning_search",
    arguments: { query: "an ninh" },
  });
  assert.equal(r.ok, true);
  const data = r.data as { total: number; items: { id: string }[] };
  assert.ok(data.total >= 1);
  assert.ok(data.items.some((i) => i.id === "course-security"));

  const filtered = await invoke(app, c, {
    toolName: "learning_search",
    arguments: { contentType: "item" },
  });
  const fd = filtered.data as { items: { type: string }[] };
  assert.ok(fd.items.every((i) => i.type === "item"));

  const item = await invoke(app, c, {
    toolName: "learning_get_item",
    arguments: { itemId: "course-security" },
  });
  const iv = item.data as {
    item: { id: string; latestVersion: number };
    structure: { modules: unknown[] };
  };
  assert.equal(iv.item.latestVersion, 1);
  assert.ok(Array.isArray(iv.structure.modules));
  await app.close();
});

test("enroll: atomic, idempotent replay, conflict, stale revision", async () => {
  const { app } = await makeApp();
  const c = await login(app, "learner1", "learner-dev");
  const doc = "workspace:learner1";
  const r1 = await write(app, c, doc, "learning_enroll",
    { contentId: "course-security" }, 0, "enroll-key-1");
  assert.equal(r1.ok, true);
  const d1 = r1.data as { enrollmentId: string; alreadyExisted: boolean };
  assert.equal(d1.alreadyExisted, false);
  assert.equal(r1.revision, 1);

  // Same key + same payload → stored result replayed, no extra revision.
  const r2 = await write(app, c, doc, "learning_enroll",
    { contentId: "course-security" }, 0, "enroll-key-1");
  assert.equal(r2.ok, true);
  assert.equal(
    (r2.data as { enrollmentId: string }).enrollmentId,
    d1.enrollmentId,
  );

  // Same key, different payload → IDEMPOTENCY_CONFLICT.
  const r3 = await write(app, c, doc, "learning_enroll",
    { contentId: "course-data" }, 1, "enroll-key-1");
  assert.equal(r3.ok, false);
  assert.equal(r3.error?.code, "IDEMPOTENCY_CONFLICT");

  // Stale revision rejected.
  const r4 = await write(app, c, doc, "learning_set_bookmark",
    { contentId: "course-data", saved: true }, 0);
  assert.equal(r4.error?.code, "STALE_CONTEXT");

  const ml = await invoke(app, c, {
    toolName: "learning_get_my_learning",
    arguments: {},
  });
  const mld = ml.data as { items: { contentId: string; status: string }[] };
  assert.ok(
    mld.items.some(
      (i) => i.contentId === "course-security" && i.status === "enrolled",
    ),
  );

  const prog = await invoke(app, c, {
    documentId: `enrollment:${d1.enrollmentId}`,
    toolName: "learning_get_progress",
    arguments: { enrollmentId: d1.enrollmentId },
  });
  const pd = prog.data as { enrollment: { pinnedVersion: number } };
  assert.equal(pd.enrollment.pinnedVersion, 1);
  await app.close();
});

test("tenant + workspace isolation", async () => {
  const { app } = await makeApp();
  const c1 = await login(app, "learner1", "learner-dev");
  const c2 = await login(app, "learner2", "learner-dev");
  const r = await write(app, c1, "workspace:learner2",
    "learning_set_bookmark", { contentId: "course-data", saved: true }, 0);
  assert.equal(r.error?.code, "FORBIDDEN");
  const r2 = await write(app, c2, "workspace:learner2",
    "learning_set_bookmark", { contentId: "course-data", saved: true }, 0);
  assert.equal(r2.ok, true);

  // learner2 cannot read learner1's enrollment aggregate.
  // (learner1's workspace revision is 0 — the FORBIDDEN write above didn't bump.)
  const { enrollmentId, doc } = await enrollCourse(app, c1, "course-data", 0);
  const peek = await invoke(app, c2, {
    documentId: doc,
    toolName: "learning_get_progress",
    arguments: { enrollmentId },
  });
  assert.equal(peek.error?.code, "FORBIDDEN");
  await app.close();
});

test("quiz lifecycle: prerequisite lessons, grading, no answer keys", async () => {
  const { app } = await makeApp();
  const c = await login(app, "learner1", "learner-dev");
  const { enrollmentId: enr, doc: edoc } = await enrollCourse(
    app, c, "course-security",
  );

  const early = await write(app, c, edoc, "learning_start_attempt",
    { enrollmentId: enr, quizId: "quiz-security" }, 0);
  assert.equal(early.error?.code, "FORBIDDEN");

  // Complete the 4 non-quiz lessons; quiz lesson completes via passing attempt.
  for (const lid of ["les-phishing", "les-check-link", "les-password", "les-mfa"]) {
    const done = await completeLesson(app, c, enr, lid);
    assert.equal(done.ok, true, `lesson ${lid}: ${JSON.stringify(done.error)}`);
  }
  // Each complete bumps the enrollment aggregate: rev is now 4.
  const start = await write(app, c, edoc, "learning_start_attempt",
    { enrollmentId: enr, quizId: "quiz-security" }, 4);
  assert.equal(start.ok, true, JSON.stringify(start.error));
  const att = (start.data as { attemptId: string }).attemptId;

  // 2/3 correct → score 66.67 < passScore 70 → not passed, course incomplete.
  let rev = start.revision!;
  for (const [q, ch] of [["q1", "c"], ["q2", "a"], ["q3", "c"]] as const) {
    const s = await write(app, c, edoc, "learning_save_answer",
      { attemptId: att, questionId: q, selectedChoiceIds: [ch] }, rev);
    assert.equal(s.ok, true, JSON.stringify(s.error));
    rev = s.revision!;
  }
  const sub = await write(app, c, edoc, "learning_submit_attempt",
    { attemptId: att }, rev);
  assert.equal(sub.ok, true, JSON.stringify(sub.error));
  const sd = sub.data as { score: number; passed: boolean; correct: number };
  assert.equal(sd.correct, 2);
  assert.equal(sd.score, 66.67);
  assert.equal(sd.passed, false);

  const av = await invoke(app, c, {
    documentId: edoc,
    toolName: "learning_get_attempt",
    arguments: { attemptId: att },
  });
  const q = (av.data as { quiz: { questions: { choices: object[] }[] } })
    .quiz.questions[0];
  assert.deepEqual(Object.keys(q.choices[0]).sort(), ["id", "text"]);

  const prog = await invoke(app, c, {
    documentId: edoc,
    toolName: "learning_get_progress",
    arguments: { enrollmentId: enr },
  });
  assert.equal(
    (prog.data as { enrollment: { status: string } }).enrollment.status,
    "enrolled",
  );
  await app.close();
});

test("attempt cap and course completion after a passing retake", async () => {
  const { app } = await makeApp();
  const c = await login(app, "learner1", "learner-dev");
  const { enrollmentId: enr, doc: edoc } = await enrollCourse(
    app, c, "course-communication",
  );
  for (const lid of ["les-listen", "les-openq"])
    await completeLesson(app, c, enr, lid);
  let rev = 2;
  // Fail once (no answers → 0 < 60), then pass (both correct).
  for (const answers of [[], [["q1", "b"], ["q2", "b"]]] as const) {
    const st = await write(app, c, edoc, "learning_start_attempt",
      { enrollmentId: enr, quizId: "quiz-comm" }, rev);
    assert.equal(st.ok, true, JSON.stringify(st.error));
    rev = st.revision!;
    const att = (st.data as { attemptId: string }).attemptId;
    for (const [q, ch] of answers) {
      const s = await write(app, c, edoc, "learning_save_answer",
        { attemptId: att, questionId: q, selectedChoiceIds: [ch] }, rev);
      rev = s.revision!;
    }
    const sub = await write(app, c, edoc, "learning_submit_attempt",
      { attemptId: att }, rev);
    assert.equal(sub.ok, true);
    rev = sub.revision!;
  }
  const prog = await invoke(app, c, {
    documentId: edoc,
    toolName: "learning_get_progress",
    arguments: { enrollmentId: enr },
  });
  const pd = prog.data as {
    enrollment: { status: string; completedAt: string | null };
    summary: { quizzesPassed: number };
  };
  assert.equal(pd.enrollment.status, "completed");
  assert.ok(pd.enrollment.completedAt);
  assert.equal(pd.summary.quizzesPassed, 1);
  await app.close();
});

test("learner cannot reach admin tools; manager scoped to direct reports", async () => {
  const { app } = await makeApp();
  const learner = await login(app, "learner1", "learner-dev");
  const manager = await login(app, "manager", "manager-dev");
  const admin = await login(app, "admin", "admin-dev");

  // Policy role gate fires before anything else.
  const denied = await write(app, learner, "org:org-demo",
    "learning_save_course", { title: "X", structure: { modules: [] } }, 0);
  assert.equal(denied.error?.code, "FORBIDDEN");

  const deniedPreview = await invoke(app, learner, {
    documentId: "org:org-demo",
    toolName: "learning_preview_assignment",
    arguments: { contentId: "course-data", userIds: ["learner1"], groupIds: [] },
  });
  assert.equal(deniedPreview.error?.code, "FORBIDDEN");

  // Manager may preview but only within direct reports (learner1+learner2).
  const pv = await invoke(app, manager, {
    documentId: "org:org-demo",
    toolName: "learning_preview_assignment",
    arguments: { contentId: "course-data", userIds: ["learner1", "admin"], groupIds: [] },
  });
  assert.equal(pv.error?.code, "FORBIDDEN");
  const pv2 = await invoke(app, manager, {
    documentId: "org:org-demo",
    toolName: "learning_preview_assignment",
    arguments: { contentId: "course-data", userIds: ["learner1", "learner2"], groupIds: [] },
  });
  assert.equal(pv2.ok, true, JSON.stringify(pv2.error));
  const pv2d = pv2.data as { resolved: { userId: string }[] };
  assert.equal(pv2d.resolved.length, 2);

  // Manager assign → enrollment 'assigned' for each report; group works too.
  const asg = await write(app, manager, "org:org-demo",
    "learning_create_assignment",
    { contentId: "course-data", userIds: [], groupIds: ["grp-engineering"], dueKind: "none" },
    0);
  assert.equal(asg.ok, true, JSON.stringify(asg.error));
  const ad = asg.data as { resolved: number; enrollmentsCreated: number };
  assert.equal(ad.resolved, 2);
  assert.equal(ad.enrollmentsCreated, 2);

  const ml = await invoke(app, learner, {
    toolName: "learning_get_my_learning",
    arguments: {},
  });
  const item = (ml.data as { items: { contentId: string; status: string }[] })
    .items.find((i) => i.contentId === "course-data");
  assert.equal(item?.status, "assigned");

  // Admin may save + publish a new course draft (frozen schema:
  // title + modules of published lessonIds). The assignment above bumped the
  // org aggregate to revision 1.
  const created = await write(app, admin, "org:org-demo",
    "learning_save_course",
    {
      title: "Khóa mới",
      description: "s",
      modules: [{
        title: "M1",
        lessonIds: ["les-listen", "les-openq", "quiz-comm"],
      }],
    }, 1);
  assert.equal(created.ok, true, JSON.stringify(created.error));
  const courseId = (created.data as { courseId: string }).courseId;

  const published = await write(app, admin, `course:${courseId}`,
    "learning_publish_course", { courseId, draftRevision: 1 }, 0);
  assert.equal(published.ok, true, JSON.stringify(published.error));
  const pd = published.data as { version: number };
  assert.equal(pd.version, 1);

  // Learner cannot find a draft; after publish it is searchable.
  const search = await invoke(app, learner, {
    toolName: "learning_search",
    arguments: { query: "Khóa mới" },
  });
  assert.ok(
    (search.data as { items: { id: string }[] }).items.some(
      (i) => i.id === courseId,
    ),
  );
  await app.close();
});

test("writes require revision+key; reads must null them", async () => {
  const { app } = await makeApp();
  const c = await login(app, "learner1", "learner-dev");
  const noKey = await invoke(app, c, {
    documentId: "workspace:learner1",
    toolName: "learning_enroll",
    arguments: { contentId: "course-data" },
    expectedRevision: 0,
    idempotencyKey: null,
  });
  assert.equal(noKey.error?.code, "INVALID_ARGUMENT");
  const readWithKey = await invoke(app, c, {
    toolName: "learning_search",
    arguments: {},
    expectedRevision: 0,
    idempotencyKey: "x",
  });
  assert.equal(readWithKey.error?.code, "INVALID_ARGUMENT");
  const p2Tool = await invoke(app, c, {
    toolName: "learning_book_session",
    arguments: {},
  });
  assert.equal(p2Tool.error?.code, "UNSUPPORTED");
  await app.close();
});
