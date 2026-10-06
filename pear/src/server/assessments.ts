import {dropdownChoices} from "../shared/assessments.ts";
import type { DatabaseSync } from "node:sqlite";
import { randomInt, randomUUID } from "node:crypto";
import type { Principal, Course, Question } from "../shared/model.ts";
import { reject, boundedPage } from "./errors.ts";
const norm = (v: string) => v.normalize("NFKC").trim().toLocaleLowerCase("en");
const kind = (q: Question) => q.kind ?? "mcq";
export function validateQuestion(q: Question) {
  const k = kind(q);
  if(k!=="mcq"&&(q.correctIndices||q.partialCredit!==undefined||q.feedbackSelected||q.feedbackNotSelected))reject("INVALID_ARGUMENT","Choice settings require MCQ");
  if(k!=="blanks"&&(q.blankChoiceCounts||q.blankChoiceOptions))reject("INVALID_ARGUMENT","Dropdown choices require blanks");
  if(k!=="long_answer"&&q.passRate!==undefined)reject("INVALID_ARGUMENT","Question pass rate requires manual long answer");
  if(q.correctIndices&&(new Set(q.correctIndices).size!==q.correctIndices.length||q.correctIndices.some(i=>i>=q.options.length)))reject("INVALID_ARGUMENT","Distinct correct choice indices required");
  if(q.partialCredit&&!((q.correctIndices?.length??0)>=2))reject("INVALID_ARGUMENT","Partial credit requires at least two correct choices");
  if((q.feedbackSelected||q.feedbackNotSelected)&&(!q.feedbackSelected||!q.feedbackNotSelected||q.feedbackSelected.length!==q.options.length||q.feedbackNotSelected.length!==q.options.length))reject("INVALID_ARGUMENT","Feedback requires both branches per option");
  const choices=dropdownChoices(q);
  if((q.blankChoiceCounts||q.blankChoiceOptions)&&(!q.blankChoiceCounts||!q.blankChoiceOptions||q.blankChoiceCounts.length!==q.prompts?.length||q.blankChoiceCounts.reduce((a,b)=>a+b,0)!==q.blankChoiceOptions.length))reject("INVALID_ARGUMENT","Dropdown layout requires exact bounded counts");
  if(choices&&(choices.length!==q.prompts?.length||choices.some((choices,i)=>choices.length>0&&(choices.length<2||new Set(choices.map(norm)).size!==choices.length||choices.some(value=>!norm(value))||!choices.some(value=>norm(value)===norm(q.correctAnswers?.[i]??""))))))reject("INVALID_ARGUMENT","Dropdown blanks require distinct options including the accepted answer");
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
    blanks: Object.fromEntries(course.quiz.questions.map(q=>[q.id,(dropdownChoices(q)??[]).map(choices=>shuffled(choices.map((_,i)=>i)))])),
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
    const { correct, correctIndices, feedbackSelected, feedbackNotSelected, blankChoiceCounts, blankChoiceOptions, matches, correctAnswers, rubric, ...safe } = q;
    return {
      ...safe,
      kind: kind(q),
      multiple: !!correctIndices,
      ...(q.blankChoiceCounts?{blankChoices:dropdownChoices(q)!.map((choices,i)=>(p.blanks?.[q.id]?.[i]??choices.map((_,n)=>n)).map((n:number)=>choices[n]))}:{}),
      options: p.options[id].map((i: number) => q.options[i]),
    };
  });
}
export function validateAnswer(q: Question, answer: any, complete = false) {
  const k = kind(q);
  const valid =
    k === "mcq"
      ? q.correctIndices ? Array.isArray(answer)&&answer.length<=q.options.length&&(!complete||answer.length>0)&&new Set(answer).size===answer.length&&answer.every(i=>Number.isInteger(i)&&i>=0&&i<q.options.length) : Number.isInteger(answer) && answer >= 0 && answer < q.options.length
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
              (s,i) =>
                typeof s === "string" &&
                (!complete || s.trim().length > 0) &&
                s.length <= 200 && (!dropdownChoices(q)?.[i]?.length || !s && !complete || dropdownChoices(q)![i]!.includes(s)),
            )
          : typeof answer === "string" &&
            (!complete || answer.trim().length > 0) &&
            answer.length <= 4000;
  if (!valid)
    reject("INVALID_ARGUMENT", "Answer does not match the question type");
}
export function objectiveFraction(q:Question,answer:any,p:any){
 const k=kind(q),order=p.options[q.id];
 if(k==="mcq"){
  if(!q.correctIndices)return order[answer]===q.correct?1:0;
  const selected=(answer as number[]).map(index=>order[index]);
  if(q.partialCredit)return selected.filter(index=>q.correctIndices!.includes(index)).length/q.correctIndices.length;
  return selected.length===q.correctIndices.length&&selected.every(index=>q.correctIndices!.includes(index))?1:0;
 }
 if(k==="matching")return (answer as number[]).filter((x,i)=>order[x]===q.matches![i]).length/answer.length;
 if(k==="blanks")return (answer as string[]).filter((x,i)=>norm(x)===norm(q.correctAnswers![i])).length/answer.length;
 throw new RangeError("Manual question requires authorized review");
}
export function releasedOptionFeedback(q:Question,answer:any,p:any){
 if(!q.feedbackSelected||!q.feedbackNotSelected)return [];
 const selected=Array.isArray(answer)?answer.map(index=>p.options[q.id][index]):[p.options[q.id][answer]];
 return q.feedbackSelected.map((feedback,index)=>({optionIndex:index,selected:selected.includes(index),message:selected.includes(index)?feedback:q.feedbackNotSelected![index]}));
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
          ((v.quiz.answerRelease === "after_submission") ||
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
