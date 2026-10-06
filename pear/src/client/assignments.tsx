import React, { useEffect, useState } from "react";
import type { AssignmentPlan } from "../shared/assignments.ts";
type Props = {
  role: string;
  administrative: boolean;
  tick: number;
  busy: boolean;
  op: (name: string, args?: Record<string, unknown>) => Promise<any>;
  mutate: (name: string, args: Record<string, unknown>) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<boolean>;
};
const fresh = (): AssignmentPlan => ({
  title: "Learning assignment",
  targetKind: "course",
  targetId: "systems-basics",
  audienceKind: "individuals",
  learnerIds: ["learner-a"],
  groupId: "",
  membership: "fixed",
  startsAt: new Date().toISOString(),
  repeatDays: 0,
  endAt: null,
  dueKind: "none",
  fixedDueAt: null,
  rollingDays: 0,
});
const local = (value: string | null) =>
  value
    ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
const cleaned = (s: AssignmentPlan) => ({
  ...s,
  learnerIds: s.learnerIds.map((id) => id.trim()).filter(Boolean),
});
export function Assignments(p: Props) {
  const [rows, setRows] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [spec, setSpec] = useState<AssignmentPlan>(fresh),
    [id, setId] = useState(""),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [review, setReview] = useState(""),
    [memberOffset, setMemberOffset] = useState(0),
    [loadError, setLoadError] = useState(""),
    [result, setResult] = useState("");
  useEffect(() => {
    let live = true;
    void p
      .op(
        p.administrative
          ? "learning_list_assignment_plans"
          : "learning_get_notifications",
        { offset, limit: 20 },
      )
      .then((r) => {
        if (live) {
          setRows(r.items);
          setNext(r.nextOffset);
        }
      })
      .catch((e) => {
        if (live) setLoadError(e.message);
      });
    return () => {
      live = false;
    };
  }, [p.tick, offset, p.administrative]);
  const change = (next: AssignmentPlan) => {
    setSpec(next);
    setPreview(null);
    setReview("");
    setMemberOffset(0);
  };
  return (
    <section className="assignments" aria-label="Assignment operations">
      <h2>
        {p.administrative ? "Scheduled assignments" : "Your notifications"}
      </h2>
      {loadError && <p role="alert">{loadError}</p>}
      {result && <p role="status">{result}</p>}
      {p.administrative ? (
        <>
          <p>
            Each occurrence has a separate learning ledger. Fixed cohorts retain
            their members; dynamic audiences follow the group's current active
            members in your authorized scope. Closing stops future delivery;
            cancellation preserves history and stops outstanding obligations.
          </p>
          {rows.map((row) => (
            <section className="panel" key={row.id}>
              <h3>{row.plan.title}</h3>
              <p>
                ID {row.id} · {row.state} · Version {row.version} ·{" "}
                {row.cycleCount} cycles · Target version {row.target_version}
              </p>
              <p>
                Starts {row.plan.startsAt} ·{" "}
                {row.plan.repeatDays
                  ? `Every ${row.plan.repeatDays} UTC days`
                  : "Once"}{" "}
                · {row.plan.dueKind} deadline · {row.plan.membership} membership
              </p>
              {row.last_error && <p>{row.last_error}</p>}
              <button
                className="ghost"
                disabled={p.busy || row.state === "cancelled"}
                onClick={() => {
                  setId(row.id);
                  change(row.plan);
                  setReason("");
                }}
              >
                Edit future rules
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void p.run(async () => {
                    const result = await p.mutate(
                      "learning_set_assignment_plan_state",
                      {
                        planId: row.id,
                        state: d.get("state"),
                        reason: d.get("reason"),
                      },
                    );
                    setResult(`Plan ${result.state}; history preserved.`);
                  });
                }}
              >
                <label>
                  Plan action
                  <select name="state" aria-label="Plan action">
                    <option value="closed">Close future delivery</option>
                    <option value="cancelled">
                      Cancel outstanding obligations
                    </option>
                    <option value="active">Reactivate future delivery</option>
                  </select>
                </label>
                <label>
                  Plan action reason
                  <input name="reason" required maxLength={600} />
                </label>
                <button disabled={p.busy || row.state === "cancelled"}>
                  Apply plan action
                </button>
              </form>
            </section>
          ))}
          <form
            className="panel"
            aria-label="Assignment plan editor"
            onSubmit={(e) => {
              e.preventDefault();
              void p.run(async () => {
                setPreview(
                  await p.op("learning_preview_assignment_plan", {
                    plan: cleaned(spec),
                    offset: memberOffset,
                    limit: 20,
                  }),
                );
                setReview(JSON.stringify(spec));
              });
            }}
          >
            <h3>Assignment plan editor</h3>
            <fieldset disabled={p.busy}>
              <label>
                Plan ID
                <input
                  value={id}
                  required
                  pattern="[A-Za-z0-9_-]+"
                  maxLength={64}
                  onChange={(e) => setId(e.target.value)}
                />
              </label>
              <label>
                Assignment title
                <input
                  value={spec.title}
                  required
                  maxLength={160}
                  onChange={(e) => change({ ...spec, title: e.target.value })}
                />
              </label>
              <label>
                Target type
                <select
                  aria-label="Target type"
                  value={spec.targetKind}
                  onChange={(e) =>
                    change({ ...spec, targetKind: e.target.value as any })
                  }
                >
                  <option value="course">Course</option>
                  <option value="award">Award</option>
                </select>
              </label>
              <label>
                Assignment target ID
                <input
                  value={spec.targetId}
                  required
                  maxLength={64}
                  onChange={(e) =>
                    change({ ...spec, targetId: e.target.value })
                  }
                />
              </label>
              <label>
                Audience type
                <select
                  aria-label="Audience type"
                  value={spec.audienceKind}
                  onChange={(e) =>
                    change(
                      e.target.value === "individuals"
                        ? {
                            ...spec,
                            audienceKind: "individuals",
                            groupId: "",
                            membership: "fixed",
                            learnerIds: ["learner-a"],
                          }
                        : {
                            ...spec,
                            audienceKind: "group",
                            groupId: "",
                            learnerIds: [],
                          },
                    )
                  }
                >
                  <option value="individuals">Individuals</option>
                  <option value="group">Group</option>
                </select>
              </label>
              {spec.audienceKind === "individuals" ? (
                <label>
                  Assignment learner IDs · one per line
                  <textarea
                    aria-label="Assignment learner IDs · one per line"
                    value={spec.learnerIds.join("\n")}
                    onChange={(e) =>
                      change({
                        ...spec,
                        learnerIds: e.target.value.split("\n"),
                      })
                    }
                  />
                </label>
              ) : (
                <>
                  <label>
                    Assignment group ID
                    <input
                      value={spec.groupId}
                      required
                      maxLength={64}
                      onChange={(e) =>
                        change({ ...spec, groupId: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Membership policy
                    <select
                      aria-label="Membership policy"
                      value={spec.membership}
                      onChange={(e) =>
                        change({ ...spec, membership: e.target.value as any })
                      }
                    >
                      <option value="fixed">Fixed cohort at save</option>
                      <option value="dynamic">Dynamic joins and leaves</option>
                    </select>
                  </label>
                </>
              )}
              <label>
                Starts · your local time
                <input
                  type="datetime-local"
                  required
                  value={local(spec.startsAt)}
                  onChange={(e) =>
                    change({
                      ...spec,
                      startsAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    })
                  }
                />
              </label>
              <label>
                Repeat every UTC days · 0 for once
                <input
                  type="number"
                  min={0}
                  max={366}
                  value={spec.repeatDays}
                  onChange={(e) =>
                    change({ ...spec, repeatDays: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Ends · your local time · optional
                <input
                  type="datetime-local"
                  value={local(spec.endAt)}
                  onChange={(e) =>
                    change({
                      ...spec,
                      endAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Deadline type
                <select
                  aria-label="Deadline type"
                  value={spec.dueKind}
                  onChange={(e) =>
                    change(
                      e.target.value === "fixed"
                        ? {
                            ...spec,
                            dueKind: "fixed",
                            fixedDueAt: new Date(
                              (Number.isFinite(Date.parse(spec.startsAt))
                                ? Date.parse(spec.startsAt)
                                : Date.now()) +
                                7 * 86400000,
                            ).toISOString(),
                            rollingDays: 0,
                          }
                        : e.target.value === "rolling"
                          ? {
                              ...spec,
                              dueKind: "rolling",
                              fixedDueAt: null,
                              rollingDays: 7,
                            }
                          : {
                              ...spec,
                              dueKind: "none",
                              fixedDueAt: null,
                              rollingDays: 0,
                            },
                    )
                  }
                >
                  <option value="none">No deadline</option>
                  <option value="fixed">Fixed cohort deadline</option>
                  <option value="rolling">Rolling from delivery</option>
                </select>
              </label>
              {spec.dueKind === "fixed" && (
                <label>
                  First fixed deadline · your local time
                  <input
                    type="datetime-local"
                    required
                    value={local(spec.fixedDueAt)}
                    onChange={(e) =>
                      change({
                        ...spec,
                        fixedDueAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </label>
              )}
              {spec.dueKind === "rolling" && (
                <label>
                  Days after delivery
                  <input
                    type="number"
                    min={1}
                    max={366}
                    required
                    value={spec.rollingDays}
                    onChange={(e) =>
                      change({ ...spec, rollingDays: Number(e.target.value) })
                    }
                  />
                </label>
              )}
              <p>
                Recurring fixed deadlines advance with the same UTC-day cadence.
                Rolling deadlines start when each member actually receives the
                assignment. Every cycle pins its content and rules.
              </p>
              <label>
                Assignment change reason
                <input
                  value={reason}
                  required
                  maxLength={600}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button>Preview assignment audience</button>
              {preview && (
                <>
                  <p>
                    {preview.total} authorized active recipients · Target
                    version {preview.version}
                  </p>
                  {preview.items.map((u: any) => (
                    <p key={u.id}>{u.id}</p>
                  ))}
                  <button
                    type="button"
                    className="ghost"
                    disabled={memberOffset === 0}
                    onClick={() =>
                      setMemberOffset(Math.max(0, memberOffset - 20))
                    }
                  >
                    Previous audience · then preview
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={preview.nextOffset === null}
                    onClick={() => setMemberOffset(preview.nextOffset)}
                  >
                    Next audience · then preview
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={
                  review !== JSON.stringify(spec) || !id || !reason.trim()
                }
                onClick={() =>
                  void p.run(async () => {
                    await p.mutate("learning_save_assignment_plan", {
                      planId: id,
                      plan: cleaned(spec),
                      reason,
                    });
                    setResult(
                      "Assignment plan saved; existing cycles preserved.",
                    );
                    setReview("");
                  })
                }
              >
                Save reviewed assignment plan
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setId("");
                  change(fresh());
                  setReason("");
                }}
              >
                New assignment plan
              </button>
            </fieldset>
          </form>
          {p.role === "admin" && (
            <button
              disabled={p.busy}
              onClick={() =>
                void p.run(async () => {
                  const result = await p.mutate(
                    "learning_run_assignment_jobs",
                    {},
                  );
                  setResult(
                    `${result.cyclesProcessed} due cycles processed; ${result.moreDue ? "more due work queued" : "no remaining due cycles"}.`,
                  );
                })
              }
            >
              Run due assignment jobs
            </button>
          )}
          <p>
            Deterministic jobs also run every 30 seconds while the Pear server
            is running. Notifications stay in this app; no email or channel
            delivery is configured.
          </p>
        </>
      ) : (
        <>
          {rows.map((row) => (
            <section key={row.id} className="learning-row">
              <div>
                <h3>{row.title}</h3>
                <p>
                  {row.kind} · {new Date(row.created_at).toLocaleString()} ·{" "}
                  {row.read_at ? "Read" : "Unread"}
                </p>
              </div>
              <button
                className="ghost"
                disabled={p.busy || !!row.read_at}
                onClick={() =>
                  void p.run(async () => {
                    await p.mutate("learning_read_notification", {
                      notificationId: row.id,
                    });
                  })
                }
              >
                Mark notification read
              </button>
            </section>
          ))}
          {!rows.length && <p>No notifications.</p>}
        </>
      )}
      <button
        className="ghost"
        disabled={p.busy || offset === 0}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >
        Previous {p.administrative ? "plans" : "notifications"}
      </button>
      <button
        className="ghost"
        disabled={p.busy || next === null}
        onClick={() => setOffset(next!)}
      >
        Next {p.administrative ? "plans" : "notifications"}
      </button>
    </section>
  );
}
