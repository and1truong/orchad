import type { DatabaseSync } from "node:sqlite";
import { randomInt, randomUUID } from "node:crypto";
import type { Principal, Course, Question } from "../shared/model.ts";
import { reject, boundedPage } from "./errors.ts";
const norm = (v: string) => v.normalize("NFKC").trim().toLocaleLowerCase("en");
const kind = (q: Question) => q.kind ?? "mcq";
export function validateQuestion(q: Question) {
  const k = kind(q);
  if (!q.prompt.trim()) reject("INVALID_ARGUMENT", "Question prompt required");
  if (
    q.prompts &&
    (q.prompts.some((v) => !v.trim()) ||
      new Set(q.prompts.map(norm)).size !== q.prompts.length)
  )
    reject("INVALID_ARGUMENT", "Distinct nonempty prompt labels required");
  if (k === "mcq") {
    if (
      q.options.length < 2 ||
      q.options.length > 6 ||
      q.correct >= q.options.length ||
      q.prompts ||
      q.matches ||
      q.correctAnswers ||
      q.rubric
    )
      reject("INVALID_ARGUMENT", "Invalid MCQ choices/key");
  } else if (k === "matching") {
    if (
      q.options.length < 2 ||
      q.options.length > 8 ||
      !q.prompts ||
      !q.matches ||
      q.prompts.length !== q.options.length ||
      q.matches.length !== q.options.length ||
      new Set(q.matches).size !== q.matches.length ||
      q.matches.some((i) => i >= q.options.length) ||
      new Set(q.options).size !== q.options.length ||
      q.correctAnswers ||
      q.rubric
    )
      reject(
        "INVALID_ARGUMENT",
        "Matching requires distinct choices and a complete one-to-one key",
      );
  } else if (k === "blanks") {
    if (
      q.options.length ||
      !q.prompts ||
      !q.correctAnswers ||
      q.prompts.length !== q.correctAnswers.length ||
      q.correctAnswers.some((v) => !norm(v)) ||
      q.matches ||
      q.rubric
    )
      reject(
        "INVALID_ARGUMENT",
        "Blanks require a nonempty answer for each prompt",
      );
  } else if (k === "long_answer") {
    if (
      q.options.length ||
      !q.rubric?.trim() ||
      q.prompts ||
      q.matches ||
      q.correctAnswers
    )
      reject(
        "INVALID_ARGUMENT",
        "Essay requires rubric without objective answer key",
      );
  }
}
function shuffled<T>(array: T[]) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function presentation(course: Course) {
  return {
    questions: course.quiz.shuffleQuestions
      ? shuffled(course.quiz.questions.map((q) => q.id))
      : course.quiz.questions.map((q) => q.id),
    options: Object.fromEntries(
      course.quiz.questions.map((q) => [
        q.id,
        course.quiz.shuffleOptions
          ? shuffled(q.options.map((_, i) => i))
          : q.options.map((_, i) => i),
      ]),
    ),
  };
}
export function visibleQuestions(v: Course, at: any) {
  const p = at.presentation
    ? JSON.parse(at.presentation)
    : presentation({
        ...v,
        quiz: { ...v.quiz, shuffleOptions: false, shuffleQuestions: false },
      });
  return p.questions.map((id: string) => {
    const q = v.quiz.questions.find((q) => q.id === id)!;
    const { correct, matches, correctAnswers, rubric, ...safe } = q;
    return {
      ...safe,
      kind: kind(q),
      options: p.options[id].map((i: number) => q.options[i]),
    };
  });
}
export function validateAnswer(q: Question, answer: any, complete = false) {
  const k = kind(q);
  const valid =
    k === "mcq"
      ? Number.isInteger(answer) && answer >= 0 && answer < q.options.length
      : k === "matching"
        ? Array.isArray(answer) &&
          answer.length === q.prompts!.length &&
          new Set(answer.filter((i) => i !== -1)).size ===
            answer.filter((i) => i !== -1).length &&
          answer.every(
            (i) =>
              Number.isInteger(i) &&
              i >= (complete ? 0 : -1) &&
              i < q.options.length,
          )
        : k === "blanks"
          ? Array.isArray(answer) &&
            answer.length === q.prompts!.length &&
            answer.every(
              (s) =>
                typeof s === "string" &&
                (!complete || s.trim().length > 0) &&
                s.length <= 200,
            )
          : typeof answer === "string" &&
            (!complete || answer.trim().length > 0) &&
            answer.length <= 4000;
  if (!valid)
    reject("INVALID_ARGUMENT", "Answer does not match the question type");
}
export class AssessmentService {
  constructor(readonly db: DatabaseSync) {}
  extra(e: string) {
    return (
      (
        this.db
          .prepare(
            "SELECT extra_attempts FROM assessment_resets WHERE enrollment_id=?",
          )
          .get(e) as any
      )?.extra_attempts ?? 0
    );
  }
  private submitted(p: Principal, id: string) {
    const row = this.db
      .prepare(
        "SELECT a.*,e.tenant,e.learner,e.course_id,e.version,e.assignment_state,e.status FROM attempts a JOIN enrollments e ON e.id=a.enrollment_id WHERE a.id=? AND e.tenant=?",
      )
      .get(id, p.tenant) as any;
    if (
      !row ||
      !row.submitted ||
      !["admin", "assessor"].includes(p.role) ||
      (p.role === "assessor" &&
        !this.db
          .prepare(
            "SELECT 1 FROM course_assessors WHERE course_id=? AND assessor_id=?",
          )
          .get(row.course_id, p.id))
    )
      reject("FORBIDDEN", "Submitted essay assessment scope denied");
    return row;
  }
  course(row: any): Course {
    return JSON.parse(
      (
        this.db
          .prepare(
            "SELECT content FROM course_versions WHERE course_id=? AND version=?",
          )
          .get(row.course_id, row.version) as any
      ).content,
    );
  }
  authorize(p: Principal, name: string, a: any) {
    if (
      ["human_get_assessment_submission", "human_assess_answer"].includes(name)
    ) {
      const at = this.submitted(p, a.attemptId);
      if (name === "human_assess_answer" && at.assignment_state !== "active")
        reject("FORBIDDEN", "Attempt is no longer awaiting authorized review");
    }
    if (name === "human_reset_assessment") {
      if (p.role !== "admin") reject("FORBIDDEN", "Admin reset required");
      const e = this.db
        .prepare("SELECT * FROM enrollments WHERE id=? AND tenant=?")
        .get(a.enrollmentId, p.tenant) as any;
      if (!e || e.status === "completed" || e.assignment_state !== "active")
        reject(
          "FORBIDDEN",
          "Only active unfinished learning can receive further attempts",
        );
      if (
        this.db
          .prepare(
            "SELECT 1 FROM attempts WHERE enrollment_id=? AND (submitted=0 OR grading_state='pending_manual')",
          )
          .get(e.id)
      )
        reject(
          "FORBIDDEN",
          "Finish the current assessment before a retry allowance",
        );
    }
  }
  grade(at: any, v: Course) {
    const answers = JSON.parse(at.answers),
      p = at.presentation
        ? JSON.parse(at.presentation)
        : presentation({
            ...v,
            quiz: { ...v.quiz, shuffleOptions: false, shuffleQuestions: false },
          }),
      reviews = this.db
        .prepare("SELECT * FROM essay_reviews WHERE attempt_id=?")
        .all(at.id) as any[];
    let earned = 0,
      total = 0,
      pending = false;
    for (const q of v.quiz.questions) {
      const max = q.points ?? 1,
        k = kind(q),
        a = answers[q.id];
      total += max;
      if (k === "mcq")
        earned += p.options[q.id][a] === q.correct ? max * 840 : 0;
      else if (k === "matching")
        earned +=
          (max *
            840 *
            a.filter(
              (x: number, i: number) => p.options[q.id][x] === q.matches![i],
            ).length) /
          a.length;
      else if (k === "blanks")
        earned +=
          (max *
            840 *
            a.filter(
              (x: string, i: number) => norm(x) === norm(q.correctAnswers![i]),
            ).length) /
          a.length;
      else {
        const r = reviews.find((r) => r.question_id === q.id);
        if (!r) pending = true;
        else earned += r.points * 840;
      }
    }
    const score = pending ? null : Math.floor((100 * earned) / (total * 840)),
      passed = score === null ? null : score >= v.quiz.passScore;
    this.db
      .prepare(
        "UPDATE attempts SET submitted=1,score=?,passed=?,grading_state=?,feedback_released=? WHERE id=?",
      )
      .run(
        score,
        passed === null ? null : passed ? 1 : 0,
        pending ? "pending_manual" : "graded",
        !pending &&
          ((v.quiz.answerRelease === "after_pass" && passed) ||
            (v.quiz.answerRelease === "after_exhausted" &&
              at.number >= v.quiz.maxAttempts + this.extra(at.enrollment_id)))
          ? 1
          : 0,
        at.id,
      );
    if (passed) {
      const now = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE enrollments SET status='completed',completed_at=? WHERE id=? AND completed_at IS NULL",
        )
        .run(now, at.enrollment_id);
      this.db
        .prepare("INSERT OR IGNORE INTO certificates VALUES(?,?,?)")
        .run(randomUUID(), at.enrollment_id, now);
    }
    return {
      attemptId: at.id,
      score,
      passed,
      gradingState: pending ? "pending_manual" : "graded",
    };
  }
  read(p: Principal, name: string, a: any, source: string) {
    if (name === "learning_get_assessment_queue") {
      const rows = (
        this.db
          .prepare(
            "SELECT a.id,a.number,a.grading_state,e.course_id,e.version,e.learner FROM attempts a JOIN enrollments e ON e.id=a.enrollment_id WHERE e.tenant=? AND a.grading_state='pending_manual' AND e.assignment_state='active' ORDER BY a.id",
          )
          .all(p.tenant) as any[]
      ).filter(
        (r) =>
          p.role === "admin" ||
          this.db
            .prepare(
              "SELECT 1 FROM course_assessors WHERE course_id=? AND assessor_id=?",
            )
            .get(r.course_id, p.id),
      );
      return boundedPage(rows, a.offset ?? 0, a.limit ?? 50);
    }
    if (name === "human_get_assessment_submission" && source === "human") {
      const at = this.submitted(p, a.attemptId),
        v = this.course(at);
      return {
        id: at.id,
        learnerId: at.learner,
        courseId: at.course_id,
        version: at.version,
        state: at.grading_state,
        questions: v.quiz.questions
          .filter((q) => kind(q) === "long_answer")
          .map((q) => ({
            id: q.id,
            prompt: q.prompt,
            rubric: q.rubric,
            points: q.points ?? 1,
            answer: JSON.parse(at.answers)[q.id],
          })),
        reviews: this.db
          .prepare(
            "SELECT question_id,points,reason,assessor FROM essay_reviews WHERE attempt_id=?",
          )
          .all(at.id),
      };
    }
    reject("FORBIDDEN", "Human-only assessment detail");
  }
  write(p: Principal, name: string, a: any) {
    if (name === "learning_set_course_assessor") {
      const c = this.db
          .prepare("SELECT id FROM courses WHERE id=? AND tenant=?")
          .get(a.courseId, p.tenant),
        u = this.db
          .prepare(
            "SELECT id FROM accounts WHERE id=? AND tenant=? AND role='assessor' AND active=1",
          )
          .get(a.assessorId, p.tenant);
      if (!c || !u)
        reject("FORBIDDEN", "Active same-tenant course assessor required");
      if (a.enabled)
        this.db
          .prepare("INSERT OR IGNORE INTO course_assessors VALUES(?,?)")
          .run(a.courseId, a.assessorId);
      else
        this.db
          .prepare(
            "DELETE FROM course_assessors WHERE course_id=? AND assessor_id=?",
          )
          .run(a.courseId, a.assessorId);
      return {
        courseId: a.courseId,
        assessorId: a.assessorId,
        enabled: a.enabled,
      };
    }
    if (name === "human_reset_assessment") {
      if (!a.reason.trim()) reject("INVALID_ARGUMENT", "Reset reason required");
      const extra = this.extra(a.enrollmentId) + a.extraAttempts;
      if (extra > 100)
        reject("INVALID_ARGUMENT", "Retry allowance cap reached");
      this.db
        .prepare(
          "INSERT INTO assessment_resets VALUES(?,?) ON CONFLICT(enrollment_id) DO UPDATE SET extra_attempts=excluded.extra_attempts",
        )
        .run(a.enrollmentId, extra);
      const row = this.db
        .prepare("SELECT learner FROM enrollments WHERE id=?")
        .get(a.enrollmentId) as any;
      this.db
        .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
        .run(`learning:${p.tenant}:${row.learner}`);
      return {
        enrollmentId: a.enrollmentId,
        extraAttempts: extra,
        priorAttemptsPreserved: true,
      };
    }
    const at = this.submitted(p, a.attemptId),
      v = this.course(at),
      q = v.quiz.questions.find((q) => q.id === a.questionId);
    if (at.grading_state !== "pending_manual")
      reject("FORBIDDEN", "Attempt is already finalized");
    if (
      !q ||
      kind(q) !== "long_answer" ||
      a.points > (q.points ?? 1) ||
      !a.reason.trim()
    )
      reject("INVALID_ARGUMENT", "Invalid rubric grade/reason");
    if (
      this.db
        .prepare(
          "SELECT 1 FROM essay_reviews WHERE attempt_id=? AND question_id=?",
        )
        .get(at.id, q.id)
    )
      reject("FORBIDDEN", "Final question review is immutable");
    this.db
      .prepare("INSERT INTO essay_reviews VALUES(?,?,?,?,?,?)")
      .run(
        at.id,
        q.id,
        p.id,
        a.points,
        a.reason.trim(),
        new Date().toISOString(),
      );
    const result = this.grade(at, v);
    this.db
      .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
      .run(`learning:${p.tenant}:${at.learner}`);
    return { ...result, learnerId: at.learner };
  }
}
