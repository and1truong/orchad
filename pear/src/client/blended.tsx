import {translateUI} from "./i18n.ts";
import React, { useEffect, useState } from "react";
import { UploadField, UploadedMedia } from "./media.tsx";
import type { Session } from "./api.ts";
type Ops = {
  busy: boolean;
  tick: number;
  op: (name: string, args: Record<string, unknown>) => Promise<any>;
  mutate: (name: string, args: Record<string, unknown>) => Promise<any>;
  run: (f: () => Promise<void>) => Promise<boolean>;
};
export function BlendedPlayer(
  p: Ops & { session: Session; enrollmentId: string; lesson: any },
) {
  const [data, setData] = useState<any>(null),
    [asset, setAsset] = useState(""),
    [error, setError] = useState("");
  const scope = { enrollmentId: p.enrollmentId, lessonId: p.lesson.id };
  useEffect(() => {
    let active = true;
    void p
      .op("learning_get_blended_lesson", scope)
      .then((r) => {
        if (active) {
          setData(r);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [p.tick, p.enrollmentId, p.lesson.id]);
  const calendar = async (id: string) => {
    const r = await fetch("/api/bookings/" + id + "/calendar", {
      credentials: "same-origin",
      headers: { "X-Pear-Epoch": p.session.sessionEpoch },
    });
    if (!r.ok) throw new Error("Calendar access denied");
    const url = URL.createObjectURL(await r.blob()),
      a = document.createElement("a");
    a.href = url;
    a.download = "pear-session.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!["submission", "event"].includes(p.lesson.kind)) return null;
  return (
    <section aria-label={translateUI("Blended lesson")} className="panel">
      {error && <p role="alert">{error}</p>}
      {p.lesson.kind === "submission" ? (
        <>
          <h4>{translateUI("Assignment upload and human review")}</h4>
          <p>{p.lesson.submission?.rubric}</p>
          <p>
            Upload a PDF; submission is pending until a delegated human assessor
            reviews it.
          </p>
          <UploadField
            session={p.session}
            kind="document"
            scope={scope}
            onUploaded={setAsset}
          />
          <button
            disabled={
              p.busy ||
              !asset ||
              data?.submissions?.some((s: any) => s.state !== "failed")
            }
            onClick={() =>
              void p.run(async () => {
                await p.mutate("human_submit_submission", {
                  ...scope,
                  assetId: asset,
                  confirmed: true,
                });
                setAsset("");
              })
            }
          >{translateUI("Submit assignment for review")}</button>
          {data?.submissions?.map((s: any) => (
            <p key={s.id}>{translateUI("Submission")}{" "}{s.number} · {s.state}
              {s.points !== null ? ` · ${s.points}%` : ""}
            </p>
          ))}
        </>
      ) : (
        <>
          <h4>{translateUI("Instructor-led session")}</h4>
          {data?.sessions?.map((s: any) => (
            <section key={s.id} className="learning-row">
              <div>
                <p>
                  {new Intl.DateTimeFormat(undefined, {
                    timeZone: s.timezone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(s.startsAt))}{" "}
                  · {s.timezone}
                </p>
                {s.state==="cancelled"&&<p role="status">{translateUI("Session cancelled")} · {s.changeReason}</p>}
                {s.sessionRevision>0&&s.state!=="cancelled"&&<p role="status">{translateUI("Session schedule changed")} · {s.changeReason}</p>}
                <p>
                  {s.location} · {s.available} seats available · Cutoff{" "}
                  {new Date(s.cutoffAt).toISOString()}
                </p>
                {s.joinUrl && s.state!=="cancelled" && (
                  <a href={s.joinUrl} target="_blank" rel="noopener noreferrer">{translateUI("Open session meeting")}</a>
                )}
              </div>
              <button
                disabled={
                  p.busy ||
                  !s.bookingOpen ||
                  s.available === 0 ||
                  data.bookings.some((b: any) =>
                    ["booked", "present"].includes(b.state),
                  )
                }
                onClick={() =>
                  void p.run(async () => {
                    await p.mutate("learning_book_session", {
                      ...scope,
                      sessionId: s.id,
                    });
                  })
                }
              >{translateUI("Book session")}</button>
            </section>
          ))}
          {data?.bookings?.map((b: any) => (
            <div key={b.id}>
              <p>{translateUI("Booking ·")}{" "}{b.state}</p>
              {b.reason&&<p>{b.reason}</p>}
              {b.state === "booked" && (
                <>
                  <button
                    disabled={p.busy}
                    onClick={() =>
                      void p.run(async () => {
                        await p.mutate("learning_cancel_booking", {
                          bookingId: b.id,
                        });
                      })
                    }
                  >{translateUI("Cancel booking")}</button>

                </>
              )}
              {["booked","present","cancelled"].includes(b.state)&&(b.state!=="cancelled"||!!b.cancelledAt)&&<button disabled={p.busy} onClick={()=>void p.run(()=>calendar(b.id))}>{translateUI(b.state==="cancelled"?"Download cancelled calendar":"Download calendar")}</button>}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function BlendedReviews(p: Ops & { session: Session }) {
  const [rows, setRows] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [detail, setDetail] = useState<any>(null),
    [points, setPoints] = useState(70),
    [reason, setReason] = useState(""),
    [present, setPresent] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void p
      .op("learning_get_blended_queue", { offset, limit: 20 })
      .then((r) => {
        if (live) {
          setRows(r.items);
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
  }, [p.tick, offset]);
  return (
    <section aria-label={translateUI("Submission and attendance reviews")} className="panel">
      <h2>{translateUI("Submission and attendance reviews")}</h2>
      {error && <p role="alert">{error}</p>}
      {rows.map((row) => (
        <section className="learning-row" key={row.id}>
          <p>
            {row.kind} · {row.learnerId} · {row.lessonId}{row.sessionId&&` · ${row.sessionId} · ${row.startsAt} · ${row.timezone} · ${row.location}`}
          </p>
          <button
            disabled={p.busy}
            onClick={() => {
              setReason("");
              if (row.kind === "event") {
                setDetail(row);
                return;
              }
              void p.run(async () =>
                setDetail({
                  ...(await p.op("human_get_submission", {
                    submissionId: row.id,
                  })),
                  kind: "submission",
                }),
              );
            }}
          >{translateUI("Review")}{" "}{row.kind}
          </button>
        </section>
      ))}
      <div className="actions">
        <button
          disabled={p.busy || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >{translateUI("Previous reviews")}</button>
        <button
          disabled={p.busy || next === null}
          onClick={() => setOffset(next!)}
        >{translateUI("Next reviews")}</button>
      </div>
      {detail && (
        <form
          aria-label={translateUI("Blended review")}
          onSubmit={(e) => {
            e.preventDefault();
            void p.run(async () => {
              await p.mutate(
                detail.kind === "submission"
                  ? "human_assess_submission"
                  : "human_mark_attendance",
                detail.kind === "submission"
                  ? { submissionId: detail.id, points, reason }
                  : { bookingId: detail.id, present, reason },
              );
              setDetail(null);
            });
          }}
        >
          <fieldset disabled={p.busy}>
            <legend>{translateUI("Human review")}</legend>
            <p>
              {detail.learnerId} · {detail.lessonId}
            </p>
            {detail.kind === "submission" ? (
              <>
                <p>{detail.rubric}</p>
                <UploadedMedia
                  session={p.session}
                  content={{
                    assetId: detail.assetId,
                    kind: "document",
                    title: "Assignment submission",
                  }}
                  context={{ submissionId: detail.id }}
                />
                <label>{translateUI("Submission score")}<input
                    aria-label={translateUI("Submission score")}
                    type="number"
                    min={0}
                    max={100}
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                  />
                </label>
              </>
            ) : (
              <label className="choice">
                <input
                  type="checkbox"
                  checked={present}
                  onChange={(e) => setPresent(e.target.checked)}
                />{translateUI("Learner actually attended this started session")}</label>
            )}
            <label>{translateUI("Review reason")}<textarea
                aria-label={translateUI("Review reason")}
                required
                maxLength={600}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button>{translateUI("Record human review")}</button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
