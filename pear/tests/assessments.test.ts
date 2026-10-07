import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import { courses } from "../src/server/seed.ts";
export function mixedCourse() {
  return {
    ...structuredClone(courses["learning-vi"]),
    title: "Mixed assessment",
    quiz: {
      passScore: 75,
      maxAttempts: 1,
      shuffleQuestions: true,
      shuffleOptions: true,
      answerRelease: "after_pass",
      questions: [
        {
          id: "mcq",
          kind: "mcq",
          prompt: "Choose one",
          options: ["Wrong", "Right"],
          correct: 1,
          points: 1,
        },
        {
          id: "match",
          kind: "matching",
          prompt: "Match each term",
          options: ["One", "Two"],
          correct: 0,
          prompts: ["First", "Second"],
          matches: [0, 1],
          points: 2,
        },
        {
          id: "blanks",
          kind: "blanks",
          prompt: "Supply words",
          options: [],
          correct: 0,
          prompts: ["First word", "Second word"],
          correctAnswers: ["Áp dụng", "Review"],
          points: 2,
        },
        {
          id: "essay",
          kind: "long_answer",
          prompt: "Explain your own practice",
          options: [],
          correct: 0,
          rubric: "5 for a concrete explanation, 0 for no explanation",
          points: 5,
        },
      ],
    },
  };
}
function setup(f: ReturnType<typeof fixture>, id = "mixed") {
  data(
    f.call("editor", "learning_create_course", {
      courseId: id,
      course: mixedCourse(),
    }),
  );
  data(f.call("editor", "learning_publish_course", { courseId: id }));
  const enrollmentId = data(
    f.call("learner-a", "learning_enroll", { courseId: id }),
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
  return { enrollmentId, attemptId };
}
function answer(f: ReturnType<typeof fixture>, attemptId: string) {
  const read = data(
    f.call("learner-a", "learning_get_attempt", { attemptId }, "human"),
  );
  for (const q of read.questions) {
    const answer =
      q.kind === "mcq"
        ? q.options.indexOf("Right")
        : q.kind === "matching"
          ? [q.options.indexOf("One"), q.options.indexOf("Two")]
          : q.kind === "blanks"
            ? [" áp DỤNG ", "Wrong"]
            : "I studied a real example and explained it in my own words.";
    data(
      f.call(
        "learner-a",
        "human_save_answer",
        { attemptId, questionId: q.id, answer },
        "human",
      ),
    );
  }
}
test("mixed randomized objective and essay assessment requires human scoped grade, partial credit and atomic certificate", () => {
  const f = fixture();
  try {
    const { enrollmentId, attemptId } = setup(f);
    const initial = data(
      f.call("learner-a", "learning_get_attempt", { attemptId }, "human"),
    );
    assert.deepEqual(
      data(f.call("learner-a", "learning_get_attempt", { attemptId }, "human"))
        .questions,
      initial.questions,
    );
    answer(f, attemptId);
    const bridge = data(
      f.call("learner-a", "learning_get_attempt", { attemptId }),
    );
    assert.deepEqual(bridge.answers, {});
    assert.ok(!JSON.stringify(bridge).includes("Áp dụng"));
    assert.ok(!JSON.stringify(bridge).includes("5 for"));
    assert.equal(bridge.feedback.length, 0);
    const submit = data(
      f.call(
        "learner-a",
        "human_submit_attempt",
        { attemptId, confirmed: true },
        "human",
      ),
    );
    assert.equal(submit.score, null);
    assert.equal(submit.gradingState, "pending_manual");
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM certificates").get() as any).n,
      0,
    );
    assert.equal(
      f.call("learner-a", "learning_start_attempt", { enrollmentId }).error
        ?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call(
        "assessor",
        "human_get_assessment_submission",
        { attemptId },
        "human",
      ).error?.code,
      "FORBIDDEN",
    );
    data(
      f.call("editor", "learning_set_course_assessor", {
        courseId: "mixed",
        assessorId: "assessor",
        enabled: true,
      }),
    );
    assert.equal(
      data(
        f.call("assessor", "learning_get_assessment_queue", {
          offset: 0,
          limit: 50,
        }),
      ).total,
      1,
    );
    const detail = data(
      f.call(
        "assessor",
        "human_get_assessment_submission",
        { attemptId },
        "human",
      ),
    );
    assert.equal(
      detail.questions[0].answer,
      "I studied a real example and explained it in my own words.",
    );
    assert.equal(
      f.call(
        "assessor",
        "human_assess_answer",
        { attemptId, questionId: "essay", points: 6, reason: "Review" },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
    f.db.exec(
      "CREATE TRIGGER fail_review BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit failure'); END",
    );
    assert.equal(
      f.call(
        "assessor",
        "human_assess_answer",
        {
          attemptId,
          questionId: "essay",
          points: 5,
          reason: "Concrete explanation",
        },
        "human",
      ).ok,
      false,
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM essay_reviews").get() as any).n,
      0,
    );
    f.db.exec("DROP TRIGGER fail_review");
    const args = {
        attemptId,
        questionId: "essay",
        points: 5,
        reason: "Concrete explanation",
      },
      revision = f.service.context("assessor", "library:demo").revision;
    const first = f.call("assessor", "human_assess_answer", args, "human", {
      idempotencyKey: "review-final",
      expectedRevision: revision,
    });
    const result = data(first);
    assert.equal(result.score, 90);
    assert.equal(result.passed, true);
    assert.deepEqual(
      f.call("assessor", "human_assess_answer", args, "human", {
        idempotencyKey: "review-final",
        expectedRevision: revision,
      }),
      first,
    );
    assert.equal(
      data(f.call("learner-a", "learning_get_progress", { enrollmentId }))
        .status,
      "completed",
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM certificates").get() as any).n,
      1,
    );
    const human = data(
      f.call("learner-a", "learning_get_attempt", { attemptId }, "human"),
    );
    assert.equal(human.feedback.length, 3);
    assert.equal(
      data(f.call("learner-a", "learning_get_attempt", { attemptId })).feedback
        .length,
      0,
    );
    assert.equal(
      f.call("assessor", "human_assess_answer", args, "bridge").error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call(
        "manager",
        "human_get_assessment_submission",
        { attemptId },
        "human",
      ).error?.code,
      "FORBIDDEN",
    );
    data(
      f.call("editor", "learning_set_course_assessor", {
        courseId: "mixed",
        assessorId: "assessor",
        enabled: false,
      }),
    );
    assert.equal(
      f.call("assessor", "human_assess_answer", args, "human", {
        idempotencyKey: "review-final",
        expectedRevision: revision,
      }).error?.code,
      "FORBIDDEN",
    );
  } finally {
    f.db.close();
  }
});
test("question key validation, incomplete typed drafts, reset allowance and immutable failed attempt history", () => {
  const f = fixture();
  try {
    const invalid = mixedCourse();
    invalid.quiz.questions[1].matches = [0, 0];
    assert.equal(
      f.call("editor", "learning_create_course", {
        courseId: "invalid",
        course: invalid,
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    const course = structuredClone(courses["learning-vi"]);
    course.quiz.maxAttempts = 1;
    course.quiz.answerRelease = "after_exhausted";
    data(
      f.call("editor", "learning_create_course", { courseId: "retry", course }),
    );
    data(f.call("editor", "learning_publish_course", { courseId: "retry" }));
    const enrollmentId = data(
      f.call("learner-a", "learning_enroll", { courseId: "retry" }),
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
        { attemptId, questionId: "q-practice", answer: 0 },
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
    const before = JSON.stringify(
      f.db.prepare("SELECT * FROM attempts WHERE id=?").get(attemptId),
    );
    assert.equal(
      f.call("learner-a", "learning_start_attempt", { enrollmentId }).error
        ?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call(
        "manager",
        "human_reset_assessment",
        { enrollmentId, extraAttempts: 1, reason: "Reviewed retry" },
        "human",
      ).error?.code,
      "FORBIDDEN",
    );
    data(
      f.call(
        "admin",
        "human_reset_assessment",
        { enrollmentId, extraAttempts: 1, reason: "Reviewed retry" },
        "human",
      ),
    );
    assert.equal(
      data(f.call("learner-a", "learning_start_attempt", { enrollmentId }))
        .number,
      2,
    );
    assert.equal(
      JSON.stringify(
        f.db.prepare("SELECT * FROM attempts WHERE id=?").get(attemptId),
      ),
      before,
    );
    const mixed = setup(f, "drafts");
    assert.equal(
      f.call(
        "learner-a",
        "human_save_answer",
        { attemptId: mixed.attemptId, questionId: "blanks", answer: ["", ""] },
        "human",
      ).ok,
      true,
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_submit_attempt",
        { attemptId: mixed.attemptId, confirmed: true },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_save_answer",
        { attemptId: mixed.attemptId, questionId: "match", answer: [0, 0] },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_save_answer",
        { attemptId: mixed.attemptId, questionId: "essay", answer: 1 },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
  } finally {
    f.db.close();
  }
});

test("randomized drafts and submitted essay review survive restart; author updates preserve pinned rubric and released feedback", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pear-essay-"));
  let f = fixture(join(dir, "db.sqlite"));
  try {
    const { attemptId, enrollmentId } = setup(f);
    answer(f, attemptId);
    const display = data(
      f.call("learner-a", "learning_get_attempt", { attemptId }, "human"),
    );
    data(
      f.call(
        "learner-a",
        "human_submit_attempt",
        { attemptId, confirmed: true },
        "human",
      ),
    );
    data(
      f.call("editor", "learning_set_course_assessor", {
        courseId: "mixed",
        assessorId: "assessor",
        enabled: true,
      }),
    );
    const updated = mixedCourse();
    updated.quiz.questions[3].rubric = "New rubric only for future enrollment";
    updated.quiz.questions[3].points = 10;
    data(
      f.call("editor", "learning_update_course", {
        courseId: "mixed",
        course: updated,
      }),
    );
    data(f.call("editor", "learning_publish_course", { courseId: "mixed" }));
    f.db.close();
    f = fixture(join(dir, "db.sqlite"));
    const resumed = data(
      f.call("learner-a", "learning_get_attempt", { attemptId }, "human"),
    );
    assert.deepEqual(resumed.questions, display.questions);
    assert.deepEqual(resumed.answers, display.answers);
    assert.equal(resumed.score, null);
    assert.equal(
      data(
        f.call(
          "assessor",
          "human_get_assessment_submission",
          { attemptId },
          "human",
        ),
      ).questions[0].points,
      5,
    );
    assert.ok(
      !JSON.stringify(
        data(
          f.call(
            "assessor",
            "human_get_assessment_submission",
            { attemptId },
            "human",
          ),
        ),
      ).includes("New rubric"),
    );
    assert.equal(
      data(
        f.call(
          "assessor",
          "human_assess_answer",
          {
            attemptId,
            questionId: "essay",
            points: 5,
            reason: "Reviewed original rubric",
          },
          "human",
        ),
      ).score,
      90,
    );
    f.db.close();
    f = fixture(join(dir, "db.sqlite"));
    assert.equal(
      data(f.call("learner-a", "learning_get_progress", { enrollmentId }))
        .status,
      "completed",
    );
    assert.equal(
      data(f.call("learner-a", "learning_get_attempt", { attemptId }, "human"))
        .feedback.length,
      3,
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("cumulative response byte budget rejects oversized save without losing previous answers", () => {
  const f = fixture();
  try {
    const course = structuredClone(courses["learning-vi"]);
    course.quiz.questions = Array.from({ length: 8 }, (_, i) => ({
      id: "essay-" + i,
      prompt: "Original question " + i,
      kind: "long_answer",
      options: [],
      correct: 0,
      rubric: "Explain your own example.",
      points: 1,
    }));
    data(
      f.call("editor", "learning_create_course", {
        courseId: "bounded-essays",
        course,
      }),
    );
    data(
      f.call("editor", "learning_publish_course", {
        courseId: "bounded-essays",
      }),
    );
    const enrollmentId = data(
      f.call("learner-a", "learning_enroll", { courseId: "bounded-essays" }),
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
    for (let i = 0; i < 3; i++)
      data(
        f.call(
          "learner-a",
          "human_save_answer",
          { attemptId, questionId: "essay-" + i, answer: "学".repeat(3000) },
          "human",
        ),
      );
    const before = (
      f.db
        .prepare("SELECT answers FROM attempts WHERE id=?")
        .get(attemptId) as any
    ).answers;
    assert.equal(
      f.call(
        "learner-a",
        "human_save_answer",
        { attemptId, questionId: "essay-3", answer: "学".repeat(3000) },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      (
        f.db
          .prepare("SELECT answers FROM attempts WHERE id=?")
          .get(attemptId) as any
      ).answers,
      before,
    );
    assert.equal(
      data(f.call("learner-a", "learning_get_attempt", { attemptId }, "human"))
        .questions.length,
      8,
    );
  } finally {
    f.db.close();
  }
});

test("one-to-one matching earns exact fractional credit at a weighted pass threshold", () => {
  const f = fixture();
  try {
    const course = structuredClone(courses["learning-vi"]);
    course.quiz = {
      passScore: 50,
      maxAttempts: 1,
      questions: [
        {
          id: "match",
          kind: "matching",
          prompt: "Match three",
          options: ["A", "B", "C"],
          correct: 0,
          prompts: ["First", "Second", "Third"],
          matches: [0, 1, 2],
          points: 3,
        },
        {
          id: "blank",
          kind: "blanks",
          prompt: "Supply two words",
          options: [],
          correct: 0,
          prompts: ["Word one", "Word two"],
          correctAnswers: ["One", "Two"],
          points: 2,
        },
        {
          id: "mcq",
          prompt: "Choose",
          options: ["Right", "Wrong"],
          correct: 0,
          points: 1,
        },
      ],
    };
    data(
      f.call("editor", "learning_create_course", {
        courseId: "fractional",
        course,
      }),
    );
    data(
      f.call("editor", "learning_publish_course", { courseId: "fractional" }),
    );
    const enrollmentId = data(
      f.call("learner-a", "learning_enroll", { courseId: "fractional" }),
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
    for (const [questionId, answer] of [
      ["match", [0, 2, 1]],
      ["blank", ["one", "wrong"]],
      ["mcq", 0],
    ] as const)
      data(
        f.call(
          "learner-a",
          "human_save_answer",
          { attemptId, questionId, answer },
          "human",
        ),
      );
    const result = data(
      f.call(
        "learner-a",
        "human_submit_attempt",
        { attemptId, confirmed: true },
        "human",
      ),
    );
    assert.equal(result.score, 50);
    assert.equal(result.passed, true);
    assert.equal(result.gradingState, "graded");
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM certificates").get() as any).n,
      1,
    );
  } finally {
    f.db.close();
  }
});

test("retry allowance cannot be preallocated before an eligible graded failed assessment",()=>{const f=fixture();try{const e=data(f.call("learner-a","learning_enroll",{courseId:"learning-vi"}));assert.equal(f.call("admin","human_reset_assessment",{enrollmentId:e.enrollmentId,extraAttempts:1,reason:"Reviewed retry"},"human").error?.code,"FORBIDDEN");assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_resets").get()!.n,0);}finally{f.db.close();}});
