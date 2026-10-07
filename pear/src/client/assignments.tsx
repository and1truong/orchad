import {translateUI} from "./i18n.ts";
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
    <section className="assignments" aria-label={translateUI("Assignment operations")}>
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
              <p>{translateUI("ID")}{" "}{row.id} · {row.state} · Version {row.version} ·{" "}
                {row.cycleCount} cycles · Target version {row.target_version}
              </p>
              <p>{translateUI("Starts")}{" "}{row.plan.startsAt} ·{" "}
                {row.plan.repeatMonths
                  ? `Every ${row.plan.repeatMonths} calendar months · ${row.plan.timeZone}` : row.plan.repeatDays
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
              >{translateUI("Edit future rules")}</button>
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
                <label>{translateUI("Plan action")}<select name="state" aria-label={translateUI("Plan action")}>
                    <option value="closed">{translateUI("Close future delivery")}</option>
                    <option value="cancelled">{translateUI("Cancel outstanding obligations")}</option>
                    <option value="active">{translateUI("Reactivate future delivery")}</option>
                  </select>
                </label>
                <label>{translateUI("Plan action reason")}<input name="reason" required maxLength={600} />
                </label>
                <button disabled={p.busy || row.state === "cancelled"}>{translateUI("Apply plan action")}</button>
              </form>
            </section>
          ))}
          <form
            className="panel"
            aria-label={translateUI("Assignment plan editor")}
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
            <h3>{translateUI("Assignment plan editor")}</h3>
            <fieldset disabled={p.busy}>
              <label>{translateUI("Plan ID")}<input
                  value={id}
                  required
                  pattern="[A-Za-z0-9_-]+"
                  maxLength={64}
                  onChange={(e) => setId(e.target.value)}
                />
              </label>
              <label>{translateUI("Assignment title")}<input
                  value={spec.title}
                  required
                  maxLength={160}
                  onChange={(e) => change({ ...spec, title: e.target.value })}
                />
              </label>
              <label>{translateUI("Target type")}<select
                  aria-label={translateUI("Target type")}
                  value={spec.targetKind}
                  onChange={(e) =>
                    change({ ...spec, targetKind: e.target.value as any })
                  }
                >
                  <option value="course">{translateUI("Course")}</option>
                  <option value="award">{translateUI("Award")}</option>
                </select>
              </label>
              <label>{translateUI("Assignment target ID")}<input
                  value={spec.targetId}
                  required
                  maxLength={64}
                  onChange={(e) =>
                    change({ ...spec, targetId: e.target.value })
                  }
                />
              </label>
              <label>{translateUI("Audience type")}<select
                  aria-label={translateUI("Audience type")}
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
                  <option value="individuals">{translateUI("Individuals")}</option>
                  <option value="group">{translateUI("Group")}</option>
                </select>
              </label>
              {spec.audienceKind === "individuals" ? (
                <label>{translateUI("Assignment learner IDs · one per line")}<textarea
                    aria-label={translateUI("Assignment learner IDs · one per line")}
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
                  <label>{translateUI("Assignment group ID")}<input
                      value={spec.groupId}
                      required
                      maxLength={64}
                      onChange={(e) =>
                        change({ ...spec, groupId: e.target.value })
                      }
                    />
                  </label>
                  <label>{translateUI("Membership policy")}<select
                      aria-label={translateUI("Membership policy")}
                      value={spec.membership}
                      onChange={(e) =>
                        change({ ...spec, membership: e.target.value as any })
                      }
                    >
                      <option value="fixed">{translateUI("Fixed cohort at save")}</option>
                      <option value="dynamic">{translateUI("Dynamic joins and leaves")}</option>
                    </select>
                  </label>
                </>
              )}
              <label>{translateUI("Starts · your local time")}<input
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
              <label className="choice">
                <input type="checkbox" checked={spec.repeatMonths!==undefined} onChange={(e) => {
                  if (e.target.checked) change({...spec, repeatDays: 0, repeatMonths: 1,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, dstChoice: "earlier"});
                  else {
                    const {repeatMonths, timeZone, dstChoice, ...legacy} = spec;
                    change(legacy);
                  }
                }} />{translateUI("Use calendar-month recurrence")}</label>
              {spec.repeatMonths!==undefined ? <>
                <label>{translateUI("Repeat every calendar months")}<input type="number" min={1} max={12} required value={spec.repeatMonths}
                    onChange={e => change({...spec, repeatMonths: Number(e.target.value)})} />
                </label>
                <label>{translateUI("Recurrence timezone · IANA region or UTC")}<input required maxLength={80} value={spec.timeZone ?? ""}
                    onChange={e => change({...spec, timeZone: e.target.value})} />
                </label>
                <label>{translateUI("Repeated DST wall time")}<select aria-label={translateUI("Repeated DST wall time")} value={spec.dstChoice ?? "earlier"}
                    onChange={e => change({...spec, dstChoice: e.target.value as "earlier" | "later"})}>
                    <option value="earlier">{translateUI("Earlier occurrence")}</option>
                    <option value="later">{translateUI("Later occurrence")}</option>
                  </select>
                </label>
                <p>Month ends clamp to the last day. A missing wall time shifts forward by its DST gap.
                  Start/deadline inputs use your browser timezone; future repeats use the named recurrence timezone shown below.</p>
              </> : <label>{translateUI("Repeat every UTC days · 0 for once")}<input type="number" min={0} max={366} value={spec.repeatDays}
                  onChange={e => change({...spec, repeatDays: Number(e.target.value)})} />
              </label>}
              <label>{translateUI("Ends · your local time · optional")}<input
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
              <label>{translateUI("Deadline type")}<select
                  aria-label={translateUI("Deadline type")}
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
                  <option value="none">{translateUI("No deadline")}</option>
                  <option value="fixed">{translateUI("Fixed cohort deadline")}</option>
                  <option value="rolling">{translateUI("Rolling from delivery")}</option>
                </select>
              </label>
              {spec.dueKind === "fixed" && (
                <label>{translateUI("First fixed deadline · your local time")}<input
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
                <label>{translateUI("Days after delivery")}<input
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
              <p>{translateUI("Recurring fixed deadlines advance with the selected day or calendar-month cadence. Rolling deadlines start when each member actually receives the assignment. Every cycle pins its content and rules.")}</p>
              <label>{translateUI("Assignment change reason")}<input
                  value={reason}
                  required
                  maxLength={600}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button>{translateUI("Preview assignment audience")}</button>
              {preview && (
                <>
                  <p>
                    {preview.total} authorized active recipients · Target
                    version {preview.version}
                  </p>
                  {preview.policy.nextRuns && <div>
                    <h4>{translateUI("Calendar anchor and sample runs")}</h4>
                    <ul>{preview.policy.nextRuns.map((r: any) => <li key={r.utc}>{r.local} · {r.timeZone} · UTC {r.utc}</li>)}</ul>
                    <p>{translateUI("Repeated times:")}{" "}{preview.policy.dstChoice}. Missing times: shift forward.
                      Month ends: last day. Existing delivered cycles keep their original rules.</p>
                  </div>}
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
                  >{translateUI("Previous audience · then preview")}</button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={preview.nextOffset === null}
                    onClick={() => setMemberOffset(preview.nextOffset)}
                  >{translateUI("Next audience · then preview")}</button>
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
              >{translateUI("Save reviewed assignment plan")}</button>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setId("");
                  change(fresh());
                  setReason("");
                }}
              >{translateUI("New assignment plan")}</button>
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
            >{translateUI("Run due assignment jobs")}</button>
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
              >{translateUI("Mark notification read")}</button>
            </section>
          ))}
          {!rows.length && <p>{translateUI("No notifications.")}</p>}
        </>
      )}
      <button
        className="ghost"
        disabled={p.busy || offset === 0}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >{translateUI("Previous")}{" "}{p.administrative ? "plans" : "notifications"}
      </button>
      <button
        className="ghost"
        disabled={p.busy || next === null}
        onClick={() => setOffset(next!)}
      >{translateUI("Next")}{" "}{p.administrative ? "plans" : "notifications"}
      </button>
    </section>
  );
}
