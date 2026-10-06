import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import type { AssignmentPlan } from "../src/shared/assignments.ts";
const start = "2026-10-01T10:00:00.000Z",
  next = "2026-10-02T10:00:00.000Z";
const plan = (extra: Partial<AssignmentPlan> = {}): AssignmentPlan => ({
  title: "Scheduled practice",
  targetKind: "course",
  targetId: "systems-basics",
  audienceKind: "individuals",
  learnerIds: ["learner-a"],
  groupId: "",
  membership: "fixed",
  startsAt: start,
  repeatDays: 0,
  endAt: null,
  dueKind: "none",
  fixedDueAt: null,
  rollingDays: 0,
  ...extra,
});
const save = (
  f: ReturnType<typeof fixture>,
  id: string,
  s = plan(),
  actor = "admin",
) =>
  data(
    f.call(actor, "learning_save_assignment_plan", {
      planId: id,
      plan: s,
      reason: "Reviewed original plan",
    }),
  );
const tick = (f: ReturnType<typeof fixture>, time = start) =>
  f.service.assignments.runBackground(time);
const group = (members: string[]) => ({
  name: "Cohort",
  kind: "static",
  memberIds: members,
  mode: "ALL",
  rules: [],
});
test("future cycles, fixed/rolling UTC deadlines and recurrence have fresh immutable ledgers and deduplicated notifications", () => {
  const f = fixture();
  try {
    save(
      f,
      "fixed",
      plan({
        repeatDays: 1,
        dueKind: "fixed",
        fixedDueAt: "2026-10-01T18:00:00.000Z",
      }),
    );
    tick(f, "2026-10-01T09:00:00.000Z");
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM enrollments").get() as any).n,
      0,
    );
    tick(f, start);
    tick(f, start);
    let rows = f.db
      .prepare("SELECT * FROM enrollments ORDER BY due_date")
      .all() as any[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].due_date, "2026-10-01T18:00:00.000Z");
    const prior = rows[0].id;
    f.db
      .prepare(
        "UPDATE enrollments SET status='completed',completed_at=? WHERE id=?",
      )
      .run(start, prior);
    tick(f, next);
    rows = f.db
      .prepare("SELECT * FROM enrollments ORDER BY due_date")
      .all() as any[];
    assert.equal(rows.length, 2);
    assert.equal(rows[1].due_date, "2026-10-02T18:00:00.000Z");
    assert.equal(rows[1].status, "in_progress");
    assert.equal(rows[1].completed_lessons, "[]");
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT COUNT(*) n FROM learning_notifications WHERE kind='assigned'",
          )
          .get() as any
      ).n,
      2,
    );
    tick(f, next);
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM enrollments").get() as any).n,
      2,
    );
    save(
      f,
      "rolling",
      plan({ learnerIds: ["learner-b"], dueKind: "rolling", rollingDays: 2 }),
    );
    tick(f, next);
    assert.equal(
      (
        f.db
          .prepare("SELECT due_date FROM enrollments WHERE learner='learner-b'")
          .get() as any
      ).due_date,
      "2026-10-04T10:00:00.000Z",
    );
    const direct = data(
      f.call("learner-a", "learning_enroll", { courseId: "systems-basics" }),
    );
    assert.ok(!rows.some((r) => r.id === direct.enrollmentId));
    assert.equal(
      data(
        f.call("learner-a", "learning_enroll", { courseId: "systems-basics" }),
      ).enrollmentId,
      direct.enrollmentId,
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
  }
});
test("fixed cohort ignores group edits while dynamic latest cycle joins/leaves/rejoins without duplicate enrollments", () => {
  const f = fixture();
  try {
    data(
      f.call("admin", "learning_save_group", {
        groupId: "cohort",
        group: group(["learner-a"]),
      }),
    );
    save(
      f,
      "fixed",
      plan({ audienceKind: "group", learnerIds: [], groupId: "cohort" }),
    );
    save(
      f,
      "dynamic",
      plan({
        audienceKind: "group",
        learnerIds: [],
        groupId: "cohort",
        membership: "dynamic",
        dueKind: "rolling",
        rollingDays: 3,
      }),
    );
    tick(f, start);
    data(
      f.call("admin", "learning_save_group", {
        groupId: "cohort",
        group: group(["learner-b"]),
      }),
    );
    tick(f, next);
    const deliveries = f.db
      .prepare(
        "SELECT d.*,c.plan_id,e.due_date FROM assignment_deliveries d JOIN assignment_cycles c ON c.id=d.cycle_id JOIN enrollments e ON e.id=d.enrollment_id ORDER BY c.plan_id,d.learner",
      )
      .all() as any[];
    assert.equal(deliveries.filter((r) => r.plan_id === "fixed").length, 1);
    assert.equal(deliveries.find((r) => r.plan_id === "fixed").state, "active");
    assert.equal(
      deliveries.find(
        (r) => r.plan_id === "dynamic" && r.learner === "learner-a",
      ).state,
      "withdrawn",
    );
    assert.equal(
      deliveries.find(
        (r) => r.plan_id === "dynamic" && r.learner === "learner-b",
      ).due_date,
      "2026-10-05T10:00:00.000Z",
    );
    const withdrawn = deliveries.find(
      (r) => r.plan_id === "dynamic" && r.learner === "learner-a",
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId: withdrawn.enrollment_id, lessonId: "retry" },
        "human",
      ).error?.code,
      "FORBIDDEN",
    );
    data(
      f.call("admin", "learning_save_group", {
        groupId: "cohort",
        group: group(["learner-a", "learner-b"]),
      }),
    );
    tick(f, next);
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT state FROM assignment_deliveries WHERE cycle_id=? AND learner=?",
          )
          .get(withdrawn.cycle_id, "learner-a") as any
      ).state,
      "active",
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM enrollments").get() as any).n,
      3,
    );
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT COUNT(*) n FROM learning_notifications WHERE kind='assigned'",
          )
          .get() as any
      ).n,
      3,
    );
  } finally {
    f.db.close();
  }
});
test("assignment preview and workers recheck live manager/tenant/target authority, while editing preserves prior cycles", () => {
  const f = fixture();
  try {
    assert.equal(
      f.call("manager", "learning_preview_assignment_plan", {
        plan: plan({ learnerIds: ["learner-b"] }),
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("manager", "learning_preview_assignment_plan", {
        plan: plan({ learnerIds: ["outsider"] }),
      }).error?.code,
      "FORBIDDEN",
    );
    save(f, "manager-plan", plan(), "manager");
    tick(f, start);
    const cycle = JSON.stringify(
      f.db.prepare("SELECT * FROM assignment_cycles").all(),
    );
    save(
      f,
      "manager-plan",
      plan({ title: "Updated future title", repeatDays: 1 }),
      "admin",
    );
    assert.equal(
      JSON.stringify(f.db.prepare("SELECT * FROM assignment_cycles").all()),
      cycle,
    );
    tick(f, next);
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM assignment_cycles").get() as any).n,
      2,
    );
    save(f, "revoked", plan(), "manager");
    f.db.prepare("UPDATE accounts SET role='learner' WHERE id='manager'").run();
    tick(f, next);
    assert.equal(
      (
        f.db
          .prepare("SELECT state FROM assignment_plans WHERE id='revoked'")
          .get() as any
      ).state,
      "blocked",
    );
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT COUNT(*) n FROM assignment_cycles WHERE plan_id='revoked'",
          )
          .get() as any
      ).n,
      0,
    );
    data(
      f.call("admin", "learning_retire_course", { courseId: "systems-basics" }),
    );
    tick(f, next);
    assert.equal(
      (
        f.db
          .prepare("SELECT state FROM assignment_plans WHERE id='manager-plan'")
          .get() as any
      ).state,
      "blocked",
    );
    assert.equal(
      f.call("learner-a", "learning_save_assignment_plan", {
        planId: "illegal",
        plan: plan(),
        reason: "Bypass",
      }).error?.code,
      "FORBIDDEN",
    );
  } finally {
    f.db.close();
  }
});
test("close/cancel preserve progress and certificates, stop future delivery and deny obsolete submissions", () => {
  const f = fixture();
  try {
    save(f, "cancel", plan({ repeatDays: 1 }));
    save(f, "close", plan({ learnerIds: ["learner-b"], repeatDays: 1 }));
    tick(f, start);
    const first = f.db
      .prepare(
        "SELECT d.* FROM assignment_deliveries d JOIN assignment_cycles c ON c.id=d.cycle_id WHERE c.plan_id='cancel'",
      )
      .get() as any;
    data(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId: first.enrollment_id, lessonId: "retry" },
        "human",
      ),
    );
    data(
      f.call("admin", "learning_set_assignment_plan_state", {
        planId: "cancel",
        state: "cancelled",
        reason: "Cancelled obligation",
      }),
    );
    data(
      f.call("admin", "learning_set_assignment_plan_state", {
        planId: "close",
        state: "closed",
        reason: "Stop future cycles",
      }),
    );
    tick(f, next);
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM assignment_cycles").get() as any).n,
      2,
    );
    assert.equal(
      (
        f.db
          .prepare("SELECT completed_lessons FROM enrollments WHERE id=?")
          .get(first.enrollment_id) as any
      ).completed_lessons,
      '["retry"]',
    );
    assert.equal(
      f.call("learner-a", "learning_start_attempt", {
        enrollmentId: first.enrollment_id,
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("admin", "learning_set_assignment_plan_state", {
        planId: "cancel",
        state: "active",
        reason: "Resurrect",
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("admin", "learning_save_assignment_plan", {
        planId: "cancel",
        plan: plan(),
        reason: "Resurrect",
      }).error?.code,
      "FORBIDDEN",
    );
    const notifications = data(
      f.call("learner-a", "learning_get_notifications"),
    );
    assert.equal(notifications.items.length, 2);
    const notificationId = notifications.items[0].id;
    assert.equal(
      f.call("learner-b", "learning_read_notification", { notificationId })
        .error?.code,
      "FORBIDDEN",
    );
    data(f.call("learner-a", "learning_read_notification", { notificationId }));
    assert.ok(
      data(f.call("learner-a", "learning_get_notifications")).items[0].read_at,
    );
  } finally {
    f.db.close();
  }
});
test("bounded scheduler rotates across more than 20 plans, caps catchup and rolls back all effects on audit failure", () => {
  const f = fixture();
  try {
    for (let i = 0; i < 23; i++) save(f, "plan-" + String(i).padStart(2, "0"));
    for (let i = 0; i < 6; i++) tick(f, start);
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM assignment_cycles").get() as any).n,
      23,
    );
    assert.equal(
      (
        f.db
          .prepare("SELECT COUNT(*) n FROM learning_notifications")
          .get() as any
      ).n,
      23,
    );
    save(f, "repeat", plan({ repeatDays: 1 }));
    tick(f, "2026-10-20T10:00:00.000Z");
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT COUNT(*) n FROM assignment_cycles WHERE plan_id='repeat'",
          )
          .get() as any
      ).n,
      5,
    );
    const before = (
        f.db.prepare("SELECT COUNT(*) n FROM enrollments").get() as any
      ).n,
      rev = f.service.context("admin", "library:demo").revision;
    f.db.prepare("UPDATE assignment_scheduler SET after_id='plan-22'").run();
    f.db.exec(
      "CREATE TRIGGER fail_job_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
    );
    assert.throws(() => tick(f, "2026-10-20T10:00:00.000Z"));
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM enrollments").get() as any).n,
      before,
    );
    assert.equal(f.service.context("admin", "library:demo").revision, rev);
  } finally {
    f.db.close();
  }
});
test("assignment save/run retries, invalid date policy and restart preserve cycle identities and notifications", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pear-assignments-")),
    path = join(dir, "learning.sqlite");
  let f = fixture(path);
  try {
    const args = { planId: "persist", plan: plan(), reason: "Reviewed" },
      key = { expectedRevision: 0, idempotencyKey: "plan-save" };
    const first = f.call(
      "admin",
      "learning_save_assignment_plan",
      args,
      "bridge",
      key,
    );
    data(first);
    assert.deepEqual(
      f.call("admin", "learning_save_assignment_plan", args, "bridge", key),
      first,
    );
    for (const s of [
      plan({ startsAt: "not-a-date" }),
      plan({ dueKind: "fixed", fixedDueAt: "2026-09-30T10:00:00.000Z" }),
      plan({ dueKind: "rolling", rollingDays: 0 }),
      plan({ endAt: "2026-09-30T10:00:00.000Z" }),
    ])
      assert.equal(
        f.call("admin", "learning_preview_assignment_plan", { plan: s }).error
          ?.code,
        "INVALID_ARGUMENT",
      );
    tick(f, start);
    const cycles = JSON.stringify(
        f.db.prepare("SELECT * FROM assignment_cycles").all(),
      ),
      enrollments = JSON.stringify(
        f.db.prepare("SELECT * FROM enrollments").all(),
      ),
      notifications = JSON.stringify(
        f.db.prepare("SELECT * FROM learning_notifications").all(),
      );
    f.db.close();
    f = fixture(path);
    tick(f, start);
    assert.equal(
      JSON.stringify(f.db.prepare("SELECT * FROM assignment_cycles").all()),
      cycles,
    );
    assert.equal(
      JSON.stringify(f.db.prepare("SELECT * FROM enrollments").all()),
      enrollments,
    );
    assert.equal(
      JSON.stringify(
        f.db.prepare("SELECT * FROM learning_notifications").all(),
      ),
      notifications,
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recurring awards require fresh course proof and cycle-local external evidence; course enrollment/certificates remain scoped and cancellation propagates", () => {
  const f = fixture();
  try {
    const complete = (id: string) => {
      for (const lessonId of ["retry", "capacity"])
        data(
          f.call(
            "learner-a",
            "human_complete_lesson",
            { enrollmentId: id, lessonId },
            "human",
          ),
        );
      const attemptId = data(
        f.call("learner-a", "learning_start_attempt", { enrollmentId: id }),
      ).attemptId;
      for (const [questionId, answer] of [
        ["q-retry", 1],
        ["q-write", 2],
      ] as const)
        data(
          f.call(
            "learner-a",
            "human_save_answer",
            { attemptId, questionId, answer },
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
    };
    const t = Date.now(),
      starts = new Date(t - 86400000).toISOString(),
      nextCycle = new Date(t + 86400000).toISOString();
    const prior = data(
      f.call("learner-a", "learning_enroll", { courseId: "systems-basics" }),
    ).enrollmentId;
    complete(prior);
    f.db
      .prepare("UPDATE enrollments SET completed_at=? WHERE id=?")
      .run(new Date(t - 2 * 86400000).toISOString(), prior);
    const award = {
      title: "Recurring award",
      summary: "Original recurring practice",
      access: "tenant",
      unit: "credits",
      target: 2,
      ongoing: false,
      moderatedExternal: false,
      requirements: [
        {
          id: "course",
          title: "Fresh course",
          required: true,
          credits: 1,
          alternatives: [{ kind: "course", id: "systems-basics" }],
        },
        {
          id: "practice",
          title: "External practice",
          required: true,
          credits: 1,
          alternatives: [{ kind: "external", id: "practice" }],
        },
      ],
    };
    data(
      f.call("editor", "learning_save_award", {
        collectionId: "recert",
        award,
      }),
    );
    data(
      f.call("editor", "learning_publish_collection", {
        collectionId: "recert",
      }),
    );
    save(
      f,
      "award-cycle",
      plan({
        targetKind: "award",
        targetId: "recert",
        startsAt: starts,
        repeatDays: 2,
      }),
    );
    tick(f, starts);
    let root = data(f.call("learner-a", "learning_get_my_awards")).items[0];
    assert.equal(root.earned, 0);
    assert.equal(
      f.call("learner-b", "learning_enroll_award_course", {
        awardEnrollmentId: root.id,
        courseId: "systems-basics",
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("learner-a", "learning_enroll_award_course", {
        awardEnrollmentId: root.id,
        courseId: "learning-vi",
      }).error?.code,
      "FORBIDDEN",
    );
    const fresh = data(
      f.call("learner-a", "learning_enroll_award_course", {
        awardEnrollmentId: root.id,
        courseId: "systems-basics",
      }),
    ).enrollmentId;
    assert.notEqual(fresh, prior);
    assert.equal(
      data(
        f.call("learner-a", "learning_enroll_award_course", {
          awardEnrollmentId: root.id,
          courseId: "systems-basics",
        }),
      ).enrollmentId,
      fresh,
    );
    complete(fresh);
    root = data(f.call("learner-a", "learning_get_my_awards")).items[0];
    assert.equal(root.earned, 1);
    assert.equal(root.certificate_id, null);
    data(
      f.call(
        "learner-a",
        "human_submit_external_record",
        {
          awardEnrollmentId: root.id,
          criterionPath: "practice",
          amount: 1,
          evidence: "Own practice in this cycle",
          confirmed: true,
        },
        "human",
      ),
    );
    root = data(f.call("learner-a", "learning_get_my_awards")).items[0];
    assert.ok(root.certificate_id);
    assert.equal(
      data(f.call("learner-a", "learning_get_notifications")).items.filter(
        (r: any) => r.kind === "completed",
      ).length,
      1,
    );
    tick(f, nextCycle);
    const second = data(
      f.call("learner-a", "learning_get_my_awards"),
    ).items.find((r: any) => r.id !== root.id);
    assert.equal(second.earned, 0);
    assert.equal(second.certificate_id, null);
    const child = data(
      f.call("learner-a", "learning_enroll_award_course", {
        awardEnrollmentId: second.id,
        courseId: "systems-basics",
      }),
    ).enrollmentId;
    assert.notEqual(child, fresh);
    data(
      f.call("admin", "learning_set_assignment_plan_state", {
        planId: "award-cycle",
        state: "cancelled",
        reason: "Cancel next cycle",
      }),
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId: child, lessonId: "retry" },
        "human",
      ).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_submit_external_record",
        {
          awardEnrollmentId: second.id,
          criterionPath: "practice",
          amount: 1,
          evidence: "Cancelled practice",
          confirmed: true,
        },
        "human",
      ).error?.code,
      "FORBIDDEN",
    );
    assert.ok(
      f.service.programs.certificate(
        f.service.principal("learner-a"),
        root.certificate_id,
      ),
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
  }
});

test("v4 migration preserves real submitted attempts, course/award certificates and external evidence with foreign keys intact", async () => {
  const { DatabaseSync } = await import("node:sqlite"),
    { mkdtempSync, rmSync, readFileSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pear-v4-")),
    path = join(dir, "learning.sqlite"),
    f = fixture();
  let reopened: ReturnType<typeof fixture> | null = null;
  try {
    const enrollmentId = data(
      f.call("learner-a", "learning_enroll", { courseId: "learning-vi" }),
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
        { attemptId, questionId: "q-practice", answer: 1 },
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
    const award = {
      title: "Legacy award",
      summary: "Original",
      access: "tenant",
      unit: "credits",
      target: 1,
      ongoing: false,
      moderatedExternal: false,
      requirements: [
        {
          id: "external",
          title: "Practice",
          required: true,
          credits: 1,
          alternatives: [{ kind: "external", id: "practice" }],
        },
      ],
    };
    data(
      f.call("admin", "learning_save_award", {
        collectionId: "legacy-award",
        award,
      }),
    );
    data(
      f.call("admin", "learning_publish_collection", {
        collectionId: "legacy-award",
      }),
    );
    const awardEnrollmentId = data(
      f.call("learner-a", "learning_enroll_award", {
        collectionId: "legacy-award",
      }),
    ).awardEnrollmentId;
    data(
      f.call(
        "learner-a",
        "human_submit_external_record",
        {
          awardEnrollmentId,
          criterionPath: "external",
          amount: 1,
          evidence: "Legacy original evidence",
          confirmed: true,
        },
        "human",
      ),
    );
    const old = new DatabaseSync(path);
    for (const number of ["001", "002", "003", "004"])
      old.exec(
        readFileSync(
          new URL("../migrations/" + number + ".sql", import.meta.url),
          "utf8",
        ),
      );
    for (const table of [
      "accounts",
      "workspaces",
      "courses",
      "course_versions",
      "enrollments",
      "attempts",
      "certificates",
      "collections",
      "collection_versions",
      "award_enrollments",
      "external_records",
      "user_profiles",
    ]) {
      const columns = (
          old.prepare(`PRAGMA table_info(${table})`).all() as any[]
        ).map((r) => r.name),
        rows = f.db
          .prepare(`SELECT ${columns.join(",")} FROM ${table}`)
          .all() as any[];
      for (const row of rows)
        old
          .prepare(
            `INSERT OR REPLACE INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((c) => row[c]));
    }
    const attempt = JSON.stringify(old.prepare("SELECT * FROM attempts").all()),
      evidence = JSON.stringify(
        old.prepare("SELECT * FROM external_records").all(),
      ),
      cert = (old.prepare("SELECT id FROM certificates").get() as any).id,
      awardCert = (
        old.prepare("SELECT certificate_id FROM award_enrollments").get() as any
      ).certificate_id;
    old.close();
    reopened = fixture(path);
    assert.deepEqual(reopened.db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(
      JSON.stringify(
        reopened.db
          .prepare(
            "SELECT id,enrollment_id,number,answers,submitted,score,passed FROM attempts",
          )
          .all(),
      ),
      attempt,
    );
    assert.equal(
      JSON.stringify(
        reopened.db
          .prepare(
            "SELECT id,enrollment_id,criterion_path,amount,evidence,evidence_hash,state,assessed_by,reason,created_at FROM external_records",
          )
          .all(),
      ),
      evidence,
    );
    assert.equal(reopened.service.certificate("learner-a", cert).version, 1);
    assert.equal(
      reopened.service.programs.certificate(
        reopened.service.principal("learner-a"),
        awardCert,
      ).version,
      1,
    );
    const row = reopened.db
      .prepare(
        "SELECT assignment_cycle_id,assignment_state FROM enrollments WHERE id=?",
      )
      .get(enrollmentId) as any;
    assert.equal(row.assignment_cycle_id, null);
    assert.equal(row.assignment_state, "active");
  } finally {
    f.db.close();
    reopened?.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
