import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import { courses } from "../src/server/seed.ts";
function complete(f: ReturnType<typeof fixture>, user = "learner-a") {
  const id = data(
    f.call(user, "learning_enroll", { courseId: "learning-vi" }),
  ).enrollmentId;
  data(
    f.call(
      user,
      "human_complete_lesson",
      { enrollmentId: id, lessonId: "practice" },
      "human",
    ),
  );
  const attempt = data(
    f.call(user, "learning_start_attempt", { enrollmentId: id }),
  ).attemptId;
  data(
    f.call(
      user,
      "human_save_answer",
      { attemptId: attempt, questionId: "q-practice", answer: 1 },
      "human",
    ),
  );
  data(
    f.call(
      user,
      "human_submit_attempt",
      { attemptId: attempt, confirmed: true },
      "human",
    ),
  );
  return id;
}
const rating = (
  f: ReturnType<typeof fixture>,
  user: string,
  id: string,
  value = 5,
  comment = "Private original opinion",
) =>
  f.call(
    user,
    "human_save_course_feedback",
    { enrollmentId: id, rating: value, comment, confirmed: true },
    "human",
  );
test("ratings require human confirmation and own backend-completed version; private comments never enter Bridge or operational audit", () => {
  const f = fixture();
  try {
    const id = data(
      f.call("learner-a", "learning_enroll", { courseId: "learning-vi" }),
    ).enrollmentId;
    assert.equal(rating(f, "learner-a", id).error?.code, "FORBIDDEN");
    assert.equal(
      f.call("learner-a", "human_save_course_feedback", {
        enrollmentId: id,
        rating: 5,
        comment: "Agent-generated opinion",
        confirmed: true,
      }).error?.code,
      "FORBIDDEN",
    );
    complete(f);
    assert.equal(rating(f, "learner-b", id).error?.code, "FORBIDDEN");
    assert.equal(rating(f, "outsider", id).error?.code, "FORBIDDEN");
    const before = data(
      f.call("learner-a", "learning_get_my_learning"),
    ).enrollments.find((e: any) => e.id === id);
    data(rating(f, "learner-a", id));
    const after = data(
      f.call("learner-a", "learning_get_my_learning"),
    ).enrollments.find((e: any) => e.id === id);
    assert.deepEqual(after, before);
    assert.equal(
      data(
        f.call(
          "learner-a",
          "human_get_course_feedback",
          { enrollmentId: id },
          "human",
        ),
      ).feedback.comment,
      "Private original opinion",
    );
    const bridge = data(
      f.call("learner-b", "learning_get_course_ratings", {
        courseId: "learning-vi",
        version: 1,
      }),
    );
    assert.equal(bridge.count, 1);
    assert.equal(bridge.average, 5);
    assert.equal(bridge.comment, undefined);
    assert.equal(bridge.learner, undefined);
    for (const user of [
      "learner-a",
      "manager",
      "editor",
      "assessor",
      "outsider",
    ])
      assert.equal(
        f.call(
          user,
          "human_list_course_feedback",
          { courseId: "learning-vi", version: 1 },
          "human",
        ).error?.code,
        "FORBIDDEN",
      );
    assert.equal(
      f.call("admin", "human_list_course_feedback", {
        courseId: "learning-vi",
        version: 1,
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      data(
        f.call(
          "admin",
          "human_list_course_feedback",
          { courseId: "learning-vi", version: 1 },
          "human",
        ),
      ).items[0].comment,
      "Private original opinion",
    );
    const audit = f.db
      .prepare(
        "SELECT arguments FROM audit WHERE tool='human_save_course_feedback'",
      )
      .get() as any;
    assert.equal(audit.arguments.includes("Private original opinion"), false);
    assert.equal(rating(f, "learner-a", id, 6).error?.code, "INVALID_ARGUMENT");
    assert.equal(
      f.call(
        "learner-a",
        "human_save_course_feedback",
        {
          enrollmentId: id,
          rating: 5,
          comment: "not confirmed",
          confirmed: false,
        },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
  } finally {
    f.db.close();
  }
});
test("one voluntary rating per learner/version, atomic update/retry and version aggregates survive retirement without score changes", () => {
  const f = fixture();
  try {
    const a = complete(f),
      b = complete(f, "learner-b");
    const revision = f.service.context(
        "learner-a",
        "learning:demo:learner-a",
      ).revision,
      overrides = {
        expectedRevision: revision,
        idempotencyKey: "opinion-save",
      };
    const args = {
      enrollmentId: a,
      rating: 5,
      comment: "Own opinion",
      confirmed: true,
    };
    const saved = f.call(
      "learner-a",
      "human_save_course_feedback",
      args,
      "human",
      overrides,
    );
    assert.deepEqual(
      f.call(
        "learner-a",
        "human_save_course_feedback",
        args,
        "human",
        overrides,
      ),
      saved,
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_save_course_feedback",
        { ...args, rating: 1 },
        "human",
        overrides,
      ).error?.code,
      "IDEMPOTENCY_CONFLICT",
    );
    data(rating(f, "learner-b", b, 2));
    data(rating(f, "learner-a", a, 4));
    const aggregate = data(
      f.call("learner-a", "learning_get_course_ratings", {
        courseId: "learning-vi",
        version: 1,
      }),
    );
    assert.equal(aggregate.count, 2);
    assert.equal(aggregate.average, 3);
    const oldComment = data(
      f.call(
        "learner-a",
        "human_get_course_feedback",
        { enrollmentId: a },
        "human",
      ),
    );
    f.db.exec(
      "CREATE TRIGGER fail_feedback_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;",
    );
    assert.equal(rating(f, "learner-a", a, 1, "Rollback comment").ok, false);
    assert.deepEqual(
      data(
        f.call(
          "learner-a",
          "human_get_course_feedback",
          { enrollmentId: a },
          "human",
        ),
      ),
      oldComment,
    );
    f.db.exec("DROP TRIGGER fail_feedback_audit");
    data(
      f.call("admin", "learning_update_course", {
        courseId: "learning-vi",
        course: structuredClone(courses["learning-vi"]),
      }),
    );
    data(
      f.call("admin", "learning_publish_course", { courseId: "learning-vi" }),
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_course_ratings", {
          courseId: "learning-vi",
        }),
      ).count,
      0,
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_course_ratings", {
          courseId: "learning-vi",
          version: 1,
        }),
      ).count,
      2,
    );
    data(
      f.call("admin", "learning_retire_course", { courseId: "learning-vi" }),
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_course_ratings", {
          courseId: "learning-vi",
          version: 1,
        }),
      ).count,
      2,
    );
    assert.equal(
      f.call("assessor", "learning_get_course_ratings", {
        courseId: "learning-vi",
        version: 1,
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n,
      2,
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
  }
});
test("feedback history reopens durably and active principal authorization precedes retry", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pear-feedback-"));
  let f = fixture(join(dir, "feedback.sqlite"));
  try {
    const id = complete(f);
    data(rating(f, "learner-a", id, 4, "Luyện tập rất hữu ích."));
    f.db.close();
    f = fixture(join(dir, "feedback.sqlite"));
    assert.equal(
      data(
        f.call(
          "learner-a",
          "human_get_course_feedback",
          { enrollmentId: id },
          "human",
        ),
      ).feedback.comment,
      "Luyện tập rất hữu ích.",
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_course_ratings", {
          courseId: "learning-vi",
          version: 1,
        }),
      ).average,
      4,
    );
    f.db
      .prepare(
        "UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id='learner-a'",
      )
      .run();
    assert.throws(() => rating(f, "learner-a", id), /Active account required/);
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
