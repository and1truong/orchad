import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import { freshReport, reportColumns } from "../src/shared/reports.ts";
import { parseCsv } from "../src/shared/csv.ts";
const seed = (f: ReturnType<typeof fixture>) => {
  const a = data(
    f.call("learner-a", "learning_enroll", { courseId: "learning-vi" }),
  ).enrollmentId;
  const b = data(
    f.call("learner-b", "learning_enroll", { courseId: "systems-basics" }),
  ).enrollmentId;
  return { a, b };
};
test("reports/transcripts reconcile real completion and quiz score with live tenant/direct-report scope", () => {
  const f = fixture();
  try {
    const { a } = seed(f);
    data(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId: a, lessonId: "practice" },
        "human",
      ),
    );
    const attemptId = data(
      f.call("learner-a", "learning_start_attempt", { enrollmentId: a }),
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
    const own = data(f.call("learner-a", "learning_get_transcript"));
    assert.equal(own.total, 1);
    assert.equal(own.items[0].score, 100);
    assert.equal(own.items[0].progress, 100);
    assert.equal(own.items[0].status, "completed");
    assert.equal(data(f.call("outsider", "learning_get_transcript")).total, 0);
    assert.equal(
      f.call("learner-a", "learning_report_preview", { spec: freshReport() })
        .error?.code,
      "FORBIDDEN",
    );
    const spec = { ...freshReport(), columns: [...reportColumns] };
    const manager = data(
      f.call("manager", "learning_report_preview", { spec }),
    );
    assert.equal(manager.total, 1);
    assert.equal(manager.items[0].learnerId, "learner-a");
    assert.equal(
      data(f.call("admin", "learning_report_preview", { spec })).total,
      2,
    );
    assert.equal(
      f.call("manager", "learning_report_preview", {
        spec: { ...spec, learnerId: "learner-b" },
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      data(
        f.call("admin", "learning_report_preview", {
          spec: { ...spec, template: "completions" },
        }),
      ).total,
      1,
    );
    assert.equal(
      f.call("admin", "learning_report_preview", {
        spec: { ...spec, completedFrom: "2026-02-30" },
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.call("admin", "learning_report_preview", {
        spec: { ...spec, columns: ["title", "title"] },
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    f.db.prepare("UPDATE accounts SET active=0 WHERE id='learner-a'").run();
    assert.equal(
      data(f.call("manager", "learning_report_preview", { spec })).total,
      1,
    );
    f.db
      .prepare("UPDATE accounts SET manager_id=NULL WHERE id='learner-a'")
      .run();
    assert.equal(
      f.call("manager", "learning_report_preview", {
        spec,
        snapshotHash: manager.snapshotHash,
      }).error?.code,
      "STALE_CONTEXT",
    );
  } finally {
    f.db.close();
  }
});
test("saved reports enforce creator ownership before idempotent retry, CAS and atomic audit rollback", () => {
  const f = fixture();
  try {
    const spec = freshReport(),
      args = { reportId: "owned-report", spec };
    const revision = f.service.context("manager", "library:demo").revision;
    const first = f.call("manager", "learning_save_report", args, "bridge", {
      idempotencyKey: "same-report",
      expectedRevision: revision,
    });
    data(first);
    assert.deepEqual(
      f.call("manager", "learning_save_report", args, "bridge", {
        idempotencyKey: "same-report",
        expectedRevision: revision,
      }),
      first,
    );
    assert.equal(
      f.call("admin", "learning_save_report", args).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("admin", "learning_delete_report", { reportId: args.reportId })
        .error?.code,
      "FORBIDDEN",
    );
    assert.equal(data(f.call("admin", "learning_list_saved_reports")).total, 0);
    assert.equal(
      data(f.call("manager", "learning_list_saved_reports")).total,
      1,
    );
    assert.equal(
      f.call(
        "manager",
        "learning_save_report",
        { reportId: "stale", spec },
        "bridge",
        { expectedRevision: revision },
      ).error?.code,
      "STALE_CONTEXT",
    );
    f.db.exec(
      "CREATE TRIGGER fail_report BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
    );
    assert.equal(
      f.call("manager", "learning_save_report", { reportId: "rollback", spec })
        .ok,
      false,
    );
    assert.equal(
      f.db.prepare("SELECT id FROM saved_reports WHERE id='rollback'").get(),
      undefined,
    );
    f.db.exec("DROP TRIGGER fail_report");
    seed(f);
    const n = (f.db.prepare("SELECT COUNT(*) n FROM enrollments").get() as any)
      .n;
    data(
      f.call("manager", "learning_delete_report", { reportId: args.reportId }),
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM enrollments").get() as any).n,
      n,
    );
  } finally {
    f.db.close();
  }
});
test("export row/column matrix never broadens ACL, escapes formulas and binds all pages to a snapshot", () => {
  const f = fixture();
  try {
    seed(f);
    f.db
      .prepare("UPDATE accounts SET name=? WHERE id='learner-a'")
      .run('=HYPERLINK("evil")\nNguyễn');
    const spec = {
      ...freshReport(),
      query: "no-match",
      columns: ["learnerName", "title"],
    };
    for (const rows of ["filtered", "all"])
      for (const columns of ["visible", "all"]) {
        const result = data(
          f.call("manager", "learning_export_report", { spec, rows, columns }),
        );
        const csv = parseCsv(result.csv);
        assert.equal(csv[0].length, columns === "all" ? 19 : 2);
        assert.equal(csv.length, rows === "all" ? 2 : 1);
        if (rows === "all") {
          assert.ok(
            csv[1][columns === "all" ? 1 : 0].startsWith("'=HYPERLINK"),
          );
          assert.ok(!result.csv.includes("learner-b"));
        }
      }
    const args = { spec: freshReport(), rows: "all", columns: "all", limit: 1 };
    const first = data(f.call("admin", "learning_export_report", args));
    assert.equal(first.nextOffset, 1);
    const second = data(
      f.call("admin", "learning_export_report", {
        ...args,
        offset: first.nextOffset,
        snapshotHash: first.snapshotHash,
      }),
    );
    assert.equal(second.nextOffset, null);
    f.db
      .prepare(
        "UPDATE enrollments SET assignment_state='cancelled' WHERE learner='learner-b'",
      )
      .run();
    assert.equal(
      f.call("admin", "learning_export_report", {
        ...args,
        offset: 1,
        snapshotHash: first.snapshotHash,
      }).error?.code,
      "STALE_CONTEXT",
    );
    assert.equal(
      data(
        f.call("admin", "learning_report_preview", {
          spec: { ...freshReport(), status: "cancelled" },
        }),
      ).total,
      1,
    );
  } finally {
    f.db.close();
  }
});
test("scheduled award and child course retain exact deadline and distinct cycles in transcript", () => {
  const f = fixture();
  try {
    const award = {
      title: "Report award",
      summary: "Original",
      access: "tenant",
      unit: "credits",
      target: 1,
      ongoing: false,
      moderatedExternal: false,
      requirements: [
        {
          id: "course",
          title: "Course",
          required: true,
          credits: 1,
          alternatives: [{ kind: "course", id: "systems-basics" }],
        },
      ],
    };
    data(
      f.call("admin", "learning_save_award", {
        collectionId: "report-award",
        award,
      }),
    );
    data(
      f.call("admin", "learning_publish_collection", {
        collectionId: "report-award",
      }),
    );
    data(
      f.call("admin", "learning_save_assignment_plan", {
        planId: "report-cycle",
        reason: "Reviewed report cycle",
        plan: {
          title: "Report cycles",
          targetKind: "award",
          targetId: "report-award",
          audienceKind: "individuals",
          learnerIds: ["learner-a"],
          groupId: "",
          membership: "fixed",
          startsAt: "2026-10-01T10:00:00.000Z",
          repeatDays: 1,
          endAt: null,
          dueKind: "rolling",
          fixedDueAt: null,
          rollingDays: 2,
        },
      }),
    );
    f.service.assignments.runBackground("2026-10-01T10:00:00.000Z");
    const root = data(f.call("learner-a", "learning_get_my_awards")).items[0];
    data(
      f.call("learner-a", "learning_enroll_award_course", {
        awardEnrollmentId: root.id,
        courseId: "systems-basics",
      }),
    );
    const rows = data(f.call("learner-a", "learning_get_transcript")).items;
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.dueDate, "2026-10-03T10:00:00.000Z");
      assert.equal(row.cycleId, root.assignment_cycle_id);
    }
    const awardRow = rows.find((r: any) => r.kind === "award");
    assert.equal(awardRow.target, 1);
    assert.equal(awardRow.earned, 0);
    assert.equal(awardRow.requiredComplete, false);
    f.service.assignments.runBackground("2026-10-02T10:00:00.000Z");
    assert.equal(data(f.call("learner-a", "learning_get_transcript")).total, 3);
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
  }
});

test("report definitions survive restart; v5 award deadline migration uses delivery clock and is idempotent", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pear-report-")),
    path = join(dir, "db.sqlite");
  let f = fixture(path);
  try {
    data(
      f.call("manager", "learning_save_report", {
        reportId: "persistent",
        spec: freshReport(),
      }),
    );
    const award = {
      title: "Legacy scheduled award",
      summary: "Original",
      access: "tenant",
      unit: "credits",
      target: 1,
      ongoing: false,
      moderatedExternal: false,
      requirements: [
        {
          id: "course",
          title: "Course",
          required: true,
          credits: 1,
          alternatives: [{ kind: "course", id: "systems-basics" }],
        },
      ],
    };
    data(
      f.call("admin", "learning_save_award", {
        collectionId: "migration-award",
        award,
      }),
    );
    data(
      f.call("admin", "learning_publish_collection", {
        collectionId: "migration-award",
      }),
    );
    data(
      f.call("admin", "learning_save_assignment_plan", {
        planId: "migration-plan",
        reason: "Review",
        plan: {
          title: "Legacy cycle",
          targetKind: "award",
          targetId: "migration-award",
          audienceKind: "individuals",
          learnerIds: ["learner-a"],
          groupId: "",
          membership: "fixed",
          startsAt: "2026-10-01T10:00:00.000Z",
          repeatDays: 0,
          endAt: null,
          dueKind: "rolling",
          fixedDueAt: null,
          rollingDays: 2,
        },
      }),
    );
    f.service.assignments.runBackground("2026-10-02T12:34:56.789Z");
    const root = data(f.call("learner-a", "learning_get_my_awards")).items[0];
    data(
      f.call("learner-a", "learning_enroll_award_course", {
        awardEnrollmentId: root.id,
        courseId: "systems-basics",
      }),
    );
    f.db.exec(
      "ALTER TABLE award_enrollments DROP COLUMN due_date; UPDATE enrollments SET due_date=NULL; DELETE FROM schema_version WHERE version=6",
    );
    f.db.close();
    f = fixture(path);
    assert.equal(
      data(f.call("manager", "learning_list_saved_reports")).items[0].id,
      "persistent",
    );
    for (const row of data(f.call("learner-a", "learning_get_transcript"))
      .items)
      assert.equal(row.dueDate, "2026-10-04T12:34:56.789Z");
    f.db.close();
    f = fixture(path);
    assert.equal(data(f.call("learner-a", "learning_get_transcript")).total, 2);
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
