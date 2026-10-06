import React, { useEffect, useState } from "react";
type Props = {
  role: string;
  tick: number;
  busy: boolean;
  op: (name: string, args?: Record<string, unknown>) => Promise<any>;
  mutate: (name: string, args: Record<string, unknown>) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<boolean>;
};
export function Assessments(p: Props) {
  const [queue, setQueue] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [submission, setSubmission] = useState<any>(null),
    [courseId, setCourseId] = useState(""),
    [assessorId, setAssessorId] = useState("assessor"),
    [enabled, setEnabled] = useState(true),
    [enrollmentId, setEnrollmentId] = useState(""),
    [extra, setExtra] = useState(1),
    [reason, setReason] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    if (["admin", "assessor"].includes(p.role))
      void p
        .op("learning_get_assessment_queue", { offset, limit: 20 })
        .then((r) => {
          if (live) {
            setQueue(r.items);
            setNext(r.nextOffset);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [p.role, p.tick, offset]);
  return (
    <section aria-label="Assessment reviews" className="assessments">
      <h2>Human assessment reviews</h2>
      <p>
        Objective responses are graded by the backend. Delegated assessors
        evaluate long answers against the pinned rubric. No certificate is
        issued until the whole assessment is graded and passes.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {["admin", "content_admin"].includes(p.role) && (
        <form
          aria-label="Course assessor delegation"
          onSubmit={(e) => {
            e.preventDefault();
            void p.run(async () => {
              await p.mutate("learning_set_course_assessor", {
                courseId,
                assessorId,
                enabled,
              });
              setNotice(
                enabled
                  ? "Course assessor delegated."
                  : "Course assessor revoked.",
              );
            });
          }}
        >
          <fieldset disabled={p.busy}>
            <legend>Course assessor</legend>
            <label>
              Assessment course ID
              <input
                aria-label="Assessment course ID"
                required
                maxLength={64}
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              />
            </label>
            <label>
              Course assessor ID
              <input
                aria-label="Course assessor ID"
                required
                maxLength={64}
                value={assessorId}
                onChange={(e) => setAssessorId(e.target.value)}
              />
            </label>
            <label className="choice">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Assessment permission enabled
            </label>
            <button>Save course assessor</button>
          </fieldset>
        </form>
      )}
      {["admin", "assessor"].includes(p.role) && (
        <>
          <h3>Submitted essays awaiting review</h3>
          {queue.map((row) => (
            <div className="learning-row" key={row.id}>
              <div>
                <h4>{row.course_id}</h4>
                <p>
                  Learner {row.learner} · Version {row.version} · Attempt{" "}
                  {row.number}
                </p>
              </div>
              <button
                className="ghost"
                disabled={p.busy}
                onClick={() =>
                  void p.run(async () => {
                    setSubmission(
                      await p.op("human_get_assessment_submission", {
                        attemptId: row.id,
                      }),
                    );
                  })
                }
              >
                Review submitted essay
              </button>
            </div>
          ))}
          <div className="actions">
            <button
              className="ghost"
              disabled={p.busy || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous assessments
            </button>
            <button
              className="ghost"
              disabled={p.busy || next === null}
              onClick={() => setOffset(next!)}
            >
              Next assessments
            </button>
          </div>
        </>
      )}
      {submission && (
        <section className="panel" aria-label="Submitted essay">
          <h3>
            {submission.courseId} · {submission.learnerId}
          </h3>
          <p>
            Version {submission.version} · {submission.state}
          </p>
          {submission.questions.map((q: any) => {
            const reviewed = submission.reviews.find(
              (r: any) => r.question_id === q.id,
            );
            return (
              <section key={q.id}>
                <h4>{q.prompt}</h4>
                <p>Rubric: {q.rubric}</p>
                <blockquote>{q.answer}</blockquote>
                {reviewed ? (
                  <p>
                    Final review: {reviewed.points}/{q.points} ·{" "}
                    {reviewed.reason}
                  </p>
                ) : (
                  <EssayReview
                    q={q}
                    busy={p.busy}
                    grade={async (points, reason) => {
                      await p.run(async () => {
                        const r = await p.mutate("human_assess_answer", {
                          attemptId: submission.id,
                          questionId: q.id,
                          points,
                          reason,
                        });
                        setSubmission(
                          await p.op("human_get_assessment_submission", {
                            attemptId: submission.id,
                          }),
                        );
                        setNotice(
                          r.gradingState === "graded"
                            ? `Official score: ${r.score}% · ${r.passed ? "Passed" : "Not passed"}.`
                            : "Question assessed; remaining essays await review.",
                        );
                      });
                    }}
                  />
                )}
              </section>
            );
          })}
          <button className="ghost" onClick={() => setSubmission(null)}>
            Close essay review
          </button>
        </section>
      )}
      {p.role === "admin" && (
        <form
          aria-label="Assessment retry allowance"
          onSubmit={(e) => {
            e.preventDefault();
            void p.run(async () => {
              await p.mutate("human_reset_assessment", {
                enrollmentId,
                extraAttempts: extra,
                reason,
              });
              setNotice(
                "Further attempts allowed. Earlier attempts remain immutable.",
              );
            });
          }}
        >
          <fieldset disabled={p.busy}>
            <legend>Reviewed retry allowance</legend>
            <label>
              Retry enrollment ID
              <input
                aria-label="Retry enrollment ID"
                required
                maxLength={64}
                value={enrollmentId}
                onChange={(e) => setEnrollmentId(e.target.value)}
              />
            </label>
            <label>
              Additional attempts
              <input
                type="number"
                min={1}
                max={10}
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
              />
            </label>
            <label>
              Retry reason
              <textarea
                aria-label="Retry reason"
                required
                maxLength={600}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button>Allow further attempts</button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
function EssayReview({
  q,
  busy,
  grade,
}: {
  q: any;
  busy: boolean;
  grade: (points: number, reason: string) => Promise<void>;
}) {
  const [points, setPoints] = useState(0),
    [reason, setReason] = useState("");
  return (
    <form
      aria-label="Essay rubric review"
      onSubmit={(e) => {
        e.preventDefault();
        void grade(points, reason);
      }}
    >
      <fieldset disabled={busy}>
        <label>
          Rubric points · maximum {q.points}
          <input
            aria-label="Rubric points"
            type="number"
            min={0}
            max={q.points}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </label>
        <label>
          Assessment reason
          <textarea
            aria-label="Assessment reason"
            required
            maxLength={600}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p>
          A committed question review is final. Check the response and rubric
          before saving.
        </p>
        <button>Commit human rubric review</button>
      </fieldset>
    </form>
  );
}
