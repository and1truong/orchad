import {validateQuestionForm,validateQuizAnswer,makeQuizPresentation,presentedQuizQuestions,objectiveFraction} from "../shared/quiz-engine.ts";
import type { DatabaseSync } from "node:sqlite";
import { randomInt, randomUUID } from "node:crypto";
import type { Principal, Course, Question } from "../shared/model.ts";
import { reject, boundedPage } from "./errors.ts";
const kind = (q: Question) => q.kind ?? "mcq";
export function validateQuestion(q:Question){try{validateQuestionForm(q);}catch(error){reject("INVALID_ARGUMENT",error instanceof Error?error.message:"Invalid question");}}
function shuffled<T>(array: T[]) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function presentation(course:Course){return makeQuizPresentation(course,shuffled);}
export function visibleQuestions(v:Course,at:any){
 const p=at.presentation?JSON.parse(at.presentation):presentation({...v,quiz:{...v.quiz,shuffleQuestions:false,shuffleOptions:false}});
 return presentedQuizQuestions(v,p);
}
export function validateAnswer(q:Question,answer:any,complete=false){try{validateQuizAnswer(q,answer,complete);}catch(error){reject("INVALID_ARGUMENT",error instanceof Error?error.message:"Invalid response");}}
export {objectiveFraction,releasedOptionFeedback} from "../shared/quiz-engine.ts";
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
      if(!this.db.prepare("SELECT 1 FROM attempts WHERE enrollment_id=? AND submitted=1 AND grading_state='graded' AND passed=0").get(e.id))
        reject("FORBIDDEN", "A graded failed assessment is required before a retry allowance");
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
      if (k !== "long_answer") earned += max * 840 * objectiveFraction(q,a,p);
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
          ((v.quiz.answerRelease === "after_submission" || v.quiz.answerRelease === "after_question") ||
          (v.quiz.answerRelease === "after_pass" && passed) ||
            (v.quiz.answerRelease === "after_exhausted" && !v.quiz.unlimitedAttempts &&
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
      resultMessage: pending ? null : passed ? v.quiz.passMessage ?? null : v.quiz.failMessage ?? null,
    };
  }
  results(at:any,v:Course){
   const answers=JSON.parse(at.answers),p=at.presentation?JSON.parse(at.presentation):presentation({...v,quiz:{...v.quiz,shuffleOptions:false,shuffleQuestions:false}}),reviews=this.db.prepare("SELECT * FROM essay_reviews WHERE attempt_id=?").all(at.id) as any[];
   return v.quiz.questions.map(q=>{const review=reviews.find(r=>r.question_id===q.id),fraction=kind(q)==="long_answer"?(review?review.points/(q.points??1):null):objectiveFraction(q,answers[q.id],p);
    return {questionId:q.id,scorePercent:fraction===null?null:Math.floor(fraction*100),correct:fraction===null?null:kind(q)==="long_answer"?fraction*100>=(q.passRate??100):fraction===1};});
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
