import React, { useEffect, useState, useId } from "react";
type Ops = {
  op: (name: string, args?: Record<string, unknown>) => Promise<any>;
  mutate: (name: string, args: Record<string, unknown>) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<boolean>;
  busy: boolean;
};
export function CourseFeedback({
  enrollmentId,
  ops,
}: {
  enrollmentId: string;
  ops: Ops;
}) {
  const commentId = useId();
  const [rating, setRating] = useState("5"),
    [comment, setComment] = useState(""),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    void ops
      .op("human_get_course_feedback", { enrollmentId })
      .then((r) => {
        if (alive && r.feedback) {
          setRating(String(r.feedback.rating));
          setComment(r.feedback.comment);
          setNotice("Your previous feedback is saved.");
        }
      })
      .catch((e) => {
        if (alive) setNotice(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enrollmentId]);
  return (
    <details>
      <summary>Rate this completed version</summary>
      <form
        aria-label="Course feedback"
        onSubmit={(e) => {
          e.preventDefault();
          void ops.run(async () => {
            await ops.mutate("human_save_course_feedback", {
              enrollmentId,
              rating: Number(rating),
              comment,
              confirmed: true,
            });
            setNotice("Feedback saved. Official progress is unchanged.");
          });
        }}
      >
        <fieldset disabled={ops.busy || loading}>
          <legend>Voluntary feedback</legend>
          <label>
            Your rating
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={commentId}>Private feedback</label>
          <textarea
            id={commentId}
            value={comment}
            maxLength={1200}
            onChange={(e) => setComment(e.target.value)}
          />
          <p>
            Only you and your tenant administrator can read this comment.
            Aggregate rating totals are visible for this course version.
          </p>
          <label className="choice">
            <input type="checkbox" required />I confirm this rating and feedback
            express my own opinion.
          </label>
          <button>Save course feedback</button>
        </fieldset>
        <p role="status">{notice}</p>
      </form>
    </details>
  );
}
export function CourseRatings({
  courseId,
  version,
  op,
}: {
  courseId: string;
  version: number;
  op: Ops["op"];
}) {
  const [rating, setRating] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    setRating(null);
    void op("learning_get_course_ratings", { courseId, version })
      .then((r) => {
        if (alive) setRating(r);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [courseId, version]);
  return rating ? (
    <p>
      {rating.count
        ? `${rating.average} / 5 · ${rating.count} voluntary learner ratings`
        : "No learner ratings yet"}{" "}
      · Version {version}. Ratings are opinions, not official scores.
    </p>
  ) : null;
}

export function FeedbackReview({ ops }: { ops: Ops }) {
  const [courseId, setCourseId] = useState(""),
    [version, setVersion] = useState("1"),
    [rows, setRows] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [scope, setScope] = useState<{ courseId: string; version: number } | null>(
      null,
    );
  const load = (
    selected: { courseId: string; version: number },
    start: number,
  ) =>
    ops.run(async () => {
      const r = await ops.op("human_list_course_feedback", {
        ...selected,
        offset: start,
        limit: 20,
      });
      setScope(selected);
      setRows(r.items);
      setOffset(start);
      setNext(r.nextOffset);
    });
  return (
    <section className="panel" aria-label="Private course feedback">
      <h2>Private course feedback</h2>
      <p>Tenant administrator view. Comments are withheld from assistants.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load({ courseId, version: Number(version) }, 0);
        }}
      >
        <label>
          Feedback course ID
          <input
            required
            maxLength={64}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          />
        </label>
        <label>
          Feedback version
          <input
            required
            type="number"
            min={1}
            max={100000}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>
        <button disabled={ops.busy}>Load private feedback</button>
      </form>
      {scope && (
        <>
          <p>
            {scope.courseId} · Version {scope.version} · Showing {rows.length}{" "}
            records
          </p>
          {rows.map((r) => (
            <blockquote key={r.learner}>
              <p>
                {r.learner} · {r.rating} / 5 · {r.updated_at}
              </p>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {r.comment || "No written feedback"}
              </p>
            </blockquote>
          ))}
          <button
            className="ghost"
            disabled={ops.busy || offset === 0}
            onClick={() => void load(scope, Math.max(0, offset - 20))}
          >
            Previous feedback
          </button>
          <button
            className="ghost"
            disabled={ops.busy || next === null}
            onClick={() => void load(scope, next!)}
          >
            Next feedback
          </button>
        </>
      )}
    </section>
  );
}
