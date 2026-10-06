import React, { useEffect, useState } from "react";
import type { Session } from "./api.ts";
import { UploadField, UploadedMedia } from "./media.tsx";
import type {
  Award,
  Playlist,
  Reference,
  Requirement,
} from "../shared/programs.ts";
type Props = {
  session: Session;
  role: string;
  administrative: boolean;
  tick: number;
  busy: boolean;
  op: (name: string, args?: Record<string, unknown>) => Promise<any>;
  mutate: (name: string, args: Record<string, unknown>) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<boolean>;
  certificate: (id: string) => Promise<any>;
  studyCourse?: () => void;
};
const requirement = (n: number): Requirement => ({
  id: `criterion-${n}`,
  title: `Requirement ${n}`,
  required: true,
  credits: 1,
  alternatives: [{ kind: "course", id: "systems-basics" }],
});
const freshAward = (): Award => ({
  title: "New award",
  summary: "A self-authored learning program.",
  access: "tenant",
  unit: "credits",
  target: 1,
  ongoing: false,
  moderatedExternal: true,
  requirements: [requirement(1)],
});
function References({
  refs,
  onChange,
  kinds,
  busy,
}: {
  refs: Reference[];
  onChange: (r: Reference[]) => void;
  kinds: Reference["kind"][];
  busy: boolean;
}) {
  return (
    <div>
      {refs.map((ref, i) => (
        <fieldset key={i} disabled={busy}>
          <legend>Alternative {i + 1}</legend>
          <label>
            Reference type
            <select
              value={ref.kind}
              onChange={(e) =>
                onChange(
                  refs.map((r, n) =>
                    n === i
                      ? { kind: e.target.value as Reference["kind"], id: r.id }
                      : r,
                  ),
                )
              }
            >
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Published reference ID · external learning key
            <input
              value={ref.id}
              required
              maxLength={64}
              pattern="[A-Za-z0-9_-]+"
              onChange={(e) =>
                onChange(
                  refs.map((r, n) =>
                    n === i ? { ...r, id: e.target.value } : r,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={refs.length === 1}
            onClick={() => onChange(refs.filter((_, n) => n !== i))}
          >
            Remove reference
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="ghost"
        disabled={busy || refs.length >= 8}
        onClick={() => onChange([...refs, { kind: kinds[0], id: "" }])}
      >
        Add reference
      </button>
    </div>
  );
}
function EvidenceForm({
  props,
  enrollmentId,
  criterionPath,
  credits,
  unit,
  active,
}: {
  props: Props;
  enrollmentId: string;
  criterionPath: string;
  credits: number;
  unit: string;
  active: boolean;
}) {
  const [assetId, setAssetId] = useState(""),
    [uploading, setUploading] = useState(false),
    [generation, setGeneration] = useState(0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (uploading) return;
        const form = e.currentTarget,
          d = new FormData(form);
        void props.run(async () => {
          await props.mutate("human_submit_external_record", {
            awardEnrollmentId: enrollmentId,
            criterionPath: criterionPath,
            amount: Number(d.get("amount")),
            evidence: d.get("evidence"),
            confirmed: true,
            ...(assetId ? { assetId } : {}),
          });
          form.reset();
          setAssetId("");
          setGeneration((n) => n + 1);
        });
      }}
    >
      <fieldset disabled={props.busy || !active}>
        <UploadField
          key={generation}
          session={props.session}
          kind="document"
          scope={{ awardEnrollmentId: enrollmentId, criterionPath }}
          onUploaded={setAssetId}
          onUploading={setUploading}
        />
        {assetId && <p role="status">Evidence PDF attached</p>}
        <label>
          Claimed {unit}
          <input
            name="amount"
            type="number"
            min={1}
            max={credits}
            defaultValue={1}
            required
          />
        </label>
        <label>
          Evidence · personal statement or reference
          <textarea name="evidence" required maxLength={2000} />
        </label>
        <label className="choice">
          <input type="checkbox" required />I confirm this evidence describes my
          own external learning.
        </label>
        <button disabled={props.busy || !active || uploading}>
          Submit external learning
        </button>
      </fieldset>
    </form>
  );
}
function Progress({
  progress,
  enrollmentId,
  props,
  active = true,
}: {
  active?: boolean;
  progress: any;
  enrollmentId: string;
  props: Props;
}) {
  return (
    <div>
      {progress.requirements.map((r: any) => (
        <section className="panel" key={r.criterionPath}>
          <h4>{r.title}</h4>
          <p>
            {r.required ? "Required" : "Elective"} · {r.earned} / {r.credits}{" "}
            {progress.unit} · {r.completed ? "Complete" : "In progress"}
          </p>
          {r.alternatives.map((ref: any, i: number) => (
            <div key={i}>
              {ref.kind === "award" ? (
                <>
                  <p>
                    Nested award: {ref.title} · Version {ref.version}
                  </p>
                  <Progress
                    progress={ref}
                    enrollmentId={enrollmentId}
                    props={props}
                    active={active}
                  />
                </>
              ) : ref.kind === "course" ? (
                <div>
                  <p>
                    Course: {ref.id} ·{" "}
                    {ref.completed ? "Completed" : "In progress"}
                  </p>
                  {!ref.completed && (
                    <button
                      disabled={props.busy || !active}
                      onClick={() =>
                        void props.run(async () => {
                          await props.mutate("learning_enroll_award_course", {
                            awardEnrollmentId: enrollmentId,
                            courseId: ref.id,
                          });
                          props.studyCourse?.();
                        })
                      }
                    >
                      Study course for this award
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p>
                    External learning: {ref.id} ·{" "}
                    {ref.moderated
                      ? "Assessor approval required"
                      : "Self-attested credit"}
                  </p>
                  {ref.records.map((record: any) => (
                    <div key={record.id}>
                      <p>
                        {record.amount} claimed · {record.state}
                      </p>
                      {record.assetId && (
                        <UploadedMedia
                          session={props.session}
                          content={{
                            assetId: record.assetId,
                            kind: "document",
                            title: "Award evidence",
                          }}
                          context={{ recordId: record.id }}
                        />
                      )}
                    </div>
                  ))}
                  <EvidenceForm
                    props={props}
                    enrollmentId={enrollmentId}
                    criterionPath={r.criterionPath}
                    credits={r.credits}
                    unit={progress.unit}
                    active={active}
                  />
                </>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
export function Programs(props: Props) {
  const { role, administrative, tick, busy, op, mutate, run } = props;
  const [collections, setCollections] = useState<any[]>([]),
    [awards, setAwards] = useState<any[]>([]),
    [drafts, setDrafts] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [detail, setDetail] = useState<any>(null),
    [certificate, setCertificate] = useState<any>(null),
    [id, setId] = useState(""),
    [kind, setKind] = useState<"award" | "playlist">("award"),
    [award, setAward] = useState<Award>(freshAward),
    [playlist, setPlaylist] = useState<Playlist>({
      title: "New playlist",
      summary: "A reading collection.",
      access: "tenant",
      items: [{ kind: "course", id: "systems-basics" }],
    }),
    [scope, setScope] = useState(""),
    [records, setRecords] = useState<any[]>([]),
    [recordOffset, setRecordOffset] = useState(0),
    [recordNext, setRecordNext] = useState<number | null>(null),
    [loadError, setLoadError] = useState("");
  const [awardOffset, setAwardOffset] = useState(0),
    [awardNext, setAwardNext] = useState<number | null>(null);
  const author = ["admin", "content_admin"].includes(role);
  useEffect(() => {
    let current = true;
    setLoadError("");
    void (async () => {
      const page = await op(
        administrative && author
          ? "learning_get_collection_drafts"
          : "learning_search_collections",
        { offset, limit: 10 },
      );
      const own = administrative
        ? null
        : await op("learning_get_my_awards", {
            offset: awardOffset,
            limit: 10,
          });
      if (!current) return;
      setNext(page.nextOffset);
      if (administrative && author) setDrafts(page.items);
      else setCollections(page.items);
      if (own) {
        setAwards(own.items);
        setAwardNext(own.nextOffset);
      }
    })().catch((e) => {
      if (current) setLoadError(e.message);
    });
    return () => {
      current = false;
    };
  }, [tick, offset, awardOffset, administrative, role]);
  const value = kind === "award" ? award : playlist;
  const metadata = (field: "title" | "summary" | "access", v: string) => {
    if (kind === "award") setAward({ ...award, [field]: v });
    else setPlaylist({ ...playlist, [field]: v });
  };
  const updateRequirement = (i: number, r: Requirement) =>
    setAward({
      ...award,
      requirements: award.requirements.map((old, n) => (n === i ? r : old)),
    });
  return (
    <section aria-label="Programs">
      <h2>
        {administrative ? "Programs administration" : "Playlists and awards"}
      </h2>
      {loadError && <p role="alert">{loadError}</p>}
      {!administrative && (
        <>
          <p>
            Playlists are reading collections. Awards have their own required
            learning and credit targets.
          </p>
          {collections.map((c) => (
            <section className="learning-row" key={c.id}>
              <div>
                <h3>{c.title}</h3>
                <p>
                  {c.kind} · Version {c.version} · {c.summary}
                </p>
              </div>
              <div className="actions">
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setDetail(
                        await op("learning_get_collection", {
                          collectionId: c.id,
                        }),
                      ),
                    )
                  }
                >
                  View collection
                </button>
                {c.kind === "award" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await mutate("learning_enroll_award", {
                          collectionId: c.id,
                        });
                      })
                    }
                  >
                    Enroll in award
                  </button>
                )}
              </div>
            </section>
          ))}
          {detail && (
            <section className="panel">
              <h3>{detail.title}</h3>
              <p>{detail.summary}</p>
              {detail.references.items.map((r: any, i: number) => (
                <p key={i}>
                  {r.kind}: {r.title} · ID {r.id} · Version{" "}
                  {r.version ?? "external"} · {r.state}
                </p>
              ))}
              <div className="actions">
                <button
                  className="ghost"
                  disabled={busy || detail.references.offset === 0}
                  onClick={() =>
                    void run(async () =>
                      setDetail(
                        await op("learning_get_collection", {
                          collectionId: detail.id,
                          offset: Math.max(0, detail.references.offset - 20),
                          limit: 20,
                        }),
                      ),
                    )
                  }
                >
                  Previous references
                </button>
                <button
                  className="ghost"
                  disabled={busy || detail.references.nextOffset === null}
                  onClick={() =>
                    void run(async () =>
                      setDetail(
                        await op("learning_get_collection", {
                          collectionId: detail.id,
                          offset: detail.references.nextOffset,
                          limit: 20,
                        }),
                      ),
                    )
                  }
                >
                  Next references
                </button>
              </div>
              {detail.kind === "playlist" && (
                <p>
                  Open courses or standalone items through Explore. This
                  playlist has no completion or certificate.
                </p>
              )}
              <button className="ghost" onClick={() => setDetail(null)}>
                Close collection
              </button>
            </section>
          )}
          <h3>My awards</h3>
          {awards.map((a) => (
            <section className="panel" key={a.id}>
              <h3>{a.title}</h3>
              <p>
                {a.assignment_state !== "active"
                  ? a.assignment_state + " · "
                  : ""}
                Version {a.version} · {a.earned} / {a.target} {a.unit} ·{" "}
                {a.ongoing
                  ? "Ongoing · no automatic completion"
                  : a.completed_at
                    ? "Completed"
                    : "In progress"}{" "}
                · Required learning{" "}
                {a.requiredComplete ? "satisfied" : "still needed"}
              </p>
              {a.due_date && <p>Due {new Date(a.due_date).toLocaleString()}</p>}
              <Progress
                progress={a}
                enrollmentId={a.id}
                props={props}
                active={a.assignment_state === "active"}
              />
              {a.certificate_id && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setCertificate(await props.certificate(a.certificate_id)),
                    )
                  }
                >
                  Award certificate
                </button>
              )}
            </section>
          ))}
          <div className="actions">
            <button
              className="ghost"
              disabled={busy || awardOffset === 0}
              onClick={() => setAwardOffset(Math.max(0, awardOffset - 10))}
            >
              Previous awards
            </button>
            <button
              className="ghost"
              disabled={busy || awardNext === null}
              onClick={() => setAwardOffset(awardNext!)}
            >
              Next awards
            </button>
          </div>
          {certificate && (
            <section className="panel">
              <h3>Award completion certificate</h3>
              <p>
                {certificate.learnerName} completed {certificate.title}, version{" "}
                {certificate.version}, on {certificate.issuedAt}.
              </p>
              <p>{certificate.issuer} · Not accredited.</p>
              <a
                download={`pear-award-${certificate.id}.txt`}
                href={
                  "data:text/plain;charset=utf-8," +
                  encodeURIComponent(JSON.stringify(certificate, null, 2))
                }
              >
                Download award certificate
              </a>
            </section>
          )}
        </>
      )}
      {administrative && author && (
        <>
          <p>
            Published references: courses and nested awards must be published
            before publishing this program. External keys identify self-authored
            requirements.
          </p>
          {drafts.map((d) => (
            <section className="learning-row" key={d.id}>
              <div>
                <h3>{d.draft.title}</h3>
                <p>
                  {d.kind} · {d.state} · Version {d.latest_version} · ID {d.id}
                </p>
              </div>
              <div className="actions">
                <button
                  className="ghost"
                  onClick={() => {
                    setId(d.id);
                    setKind(d.kind);
                    if (d.kind === "award") setAward(structuredClone(d.draft));
                    else setPlaylist(structuredClone(d.draft));
                  }}
                >
                  Edit program
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await mutate("learning_publish_collection", {
                        collectionId: d.id,
                      });
                    })
                  }
                >
                  Publish program
                </button>
                <button
                  className="ghost"
                  disabled={busy || d.state === "retired"}
                  onClick={() =>
                    void run(async () => {
                      await mutate("learning_retire_collection", {
                        collectionId: d.id,
                      });
                    })
                  }
                >
                  Retire program
                </button>
              </div>
            </section>
          ))}
          <form
            className="panel"
            aria-label="Program editor"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await mutate(
                  kind === "award"
                    ? "learning_save_award"
                    : "learning_save_playlist",
                  { collectionId: id, [kind]: value },
                );
              });
            }}
          >
            <h3>Program editor</h3>
            <fieldset disabled={busy}>
              <label>
                Collection ID
                <input
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9_-]+"
                />
              </label>
              <label>
                Collection type
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as any)}
                >
                  <option value="award">Award</option>
                  <option value="playlist">Playlist</option>
                </select>
              </label>
              <label>
                Program title
                <input
                  value={value.title}
                  onChange={(e) => metadata("title", e.target.value)}
                  required
                  maxLength={160}
                />
              </label>
              <label>
                Program summary
                <textarea
                  value={value.summary}
                  onChange={(e) => metadata("summary", e.target.value)}
                  required
                  maxLength={600}
                />
              </label>
              <label>
                Access
                <select
                  value={value.access}
                  onChange={(e) => metadata("access", e.target.value)}
                >
                  <option value="tenant">Organization</option>
                  <option value="author">Author only</option>
                </select>
              </label>
              {kind === "playlist" ? (
                <References
                  refs={playlist.items}
                  onChange={(items) => setPlaylist({ ...playlist, items })}
                  kinds={["course", "item"]}
                  busy={busy}
                />
              ) : (
                <>
                  <label>
                    Credit unit
                    <select
                      value={award.unit}
                      onChange={(e) =>
                        setAward({ ...award, unit: e.target.value as any })
                      }
                    >
                      <option value="credits">Credits</option>
                      <option value="hours">Hours</option>
                    </select>
                  </label>
                  <label>
                    Target
                    <input
                      type="number"
                      value={award.target}
                      min={1}
                      max={10000}
                      required
                      onChange={(e) =>
                        setAward({ ...award, target: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={award.ongoing}
                      onChange={(e) =>
                        setAward({ ...award, ongoing: e.target.checked })
                      }
                    />
                    Ongoing · never complete automatically
                  </label>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={award.moderatedExternal}
                      onChange={(e) =>
                        setAward({
                          ...award,
                          moderatedExternal: e.target.checked,
                        })
                      }
                    />
                    Require assessor approval for external learning
                  </label>
                  {award.requirements.map((r, i) => (
                    <fieldset key={i}>
                      <legend>Requirement {i + 1}</legend>
                      <label>
                        Criterion ID
                        <input
                          value={r.id}
                          required
                          maxLength={64}
                          pattern="[A-Za-z0-9_-]+"
                          onChange={(e) =>
                            updateRequirement(i, { ...r, id: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Criterion title
                        <input
                          value={r.title}
                          required
                          maxLength={160}
                          onChange={(e) =>
                            updateRequirement(i, {
                              ...r,
                              title: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="choice">
                        <input
                          type="checkbox"
                          checked={r.required}
                          onChange={(e) =>
                            updateRequirement(i, {
                              ...r,
                              required: e.target.checked,
                            })
                          }
                        />
                        Required criterion
                      </label>
                      <label>
                        Criterion credits or hours
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          required
                          value={r.credits}
                          onChange={(e) =>
                            updateRequirement(i, {
                              ...r,
                              credits: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <References
                        refs={r.alternatives}
                        onChange={(alternatives) =>
                          updateRequirement(i, { ...r, alternatives })
                        }
                        kinds={["course", "award", "external"]}
                        busy={busy}
                      />
                      <button
                        type="button"
                        className="ghost"
                        disabled={award.requirements.length === 1}
                        onClick={() =>
                          setAward({
                            ...award,
                            requirements: award.requirements.filter(
                              (_, n) => n !== i,
                            ),
                          })
                        }
                      >
                        Remove criterion
                      </button>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="ghost"
                    disabled={award.requirements.length >= 16}
                    onClick={() =>
                      setAward({
                        ...award,
                        requirements: [
                          ...award.requirements,
                          requirement(award.requirements.length + 1),
                        ],
                      })
                    }
                  >
                    Add criterion
                  </button>
                </>
              )}
              <button>Save program draft</button>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setId("");
                  setAward(freshAward());
                  setPlaylist({
                    title: "New playlist",
                    summary: "A reading collection.",
                    access: "tenant",
                    items: [{ kind: "course", id: "systems-basics" }],
                  });
                }}
              >
                New program
              </button>
            </fieldset>
          </form>
        </>
      )}
      <div className="actions">
        <button
          className="ghost"
          disabled={busy || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 10))}
        >
          Previous programs
        </button>
        <button
          className="ghost"
          disabled={busy || next === null}
          onClick={() => setOffset(next!)}
        >
          Next programs
        </button>
      </div>
      {administrative && ["admin", "manager"].includes(role) && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void run(async () => {
              await mutate("learning_assign_award", {
                collectionId: d.get("award"),
                learnerId: d.get("learner"),
              });
            });
          }}
        >
          <h3>Assign an award</h3>
          <label>
            Award ID
            <input name="award" required maxLength={64} />
          </label>
          <label>
            Award learner ID
            <input name="learner" required maxLength={128} />
          </label>
          <button disabled={busy}>Assign award</button>
        </form>
      )}
      {administrative && role === "admin" && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void run(async () => {
              await mutate("learning_set_award_assessor", {
                collectionId: d.get("award"),
                assessorId: d.get("assessor"),
                enabled: d.get("enabled") === "on",
              });
            });
          }}
        >
          <h3>Assessor permissions</h3>
          <label>
            Assessed award ID
            <input name="award" required />
          </label>
          <label>
            Assessor account ID
            <input name="assessor" required />
          </label>
          <label className="choice">
            <input type="checkbox" name="enabled" defaultChecked />
            Grant award scope · uncheck to revoke
          </label>
          <button disabled={busy}>Save assessor scope</button>
        </form>
      )}
      {administrative && ["admin", "assessor"].includes(role) && (
        <section className="panel">
          <h3>External learning moderation</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const page = await op("learning_get_external_records", {
                  collectionId: scope,
                  offset: recordOffset,
                  limit: 10,
                });
                setRecords(page.items);
                setRecordNext(page.nextOffset);
              });
            }}
          >
            <label>
              Moderation award ID
              <input
                value={scope}
                required
                onChange={(e) => {
                  setScope(e.target.value);
                  setRecords([]);
                  setRecordOffset(0);
                  setRecordNext(null);
                }}
              />
            </label>
            <button disabled={busy}>Load submissions</button>
          </form>
          {records.map((r) => (
            <form
              key={r.id}
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void run(async () => {
                  await mutate("learning_assess_external_record", {
                    recordId: r.id,
                    accepted: d.get("decision") === "accept",
                    reason: d.get("reason"),
                  });
                  setRecords(records.filter((old) => old.id !== r.id));
                });
              }}
            >
              <h4>
                {r.learner} · {r.criterion_path}
              </h4>
              <p>
                {r.amount} claimed · {r.state}
              </p>
              <p>{r.evidence}</p>
              {r.assetId && (
                <UploadedMedia
                  session={props.session}
                  content={{
                    assetId: r.assetId,
                    kind: "document",
                    title: "Award evidence",
                  }}
                  context={{ recordId: r.id }}
                />
              )}
              {r.state === "pending" && (
                <>
                  <label>
                    Decision
                    <select name="decision">
                      <option value="accept">Accept</option>
                      <option value="reject">Reject</option>
                    </select>
                  </label>
                  <label>
                    Decision reason
                    <textarea name="reason" required maxLength={600} />
                  </label>
                  <button disabled={busy}>Record moderation decision</button>
                </>
              )}
            </form>
          ))}
          <button
            className="ghost"
            disabled={recordOffset === 0}
            onClick={() => setRecordOffset(Math.max(0, recordOffset - 10))}
          >
            Previous submissions · then load
          </button>
          <button
            className="ghost"
            disabled={recordNext === null}
            onClick={() => setRecordOffset(recordNext!)}
          >
            Next submissions · then load
          </button>
        </section>
      )}
    </section>
  );
}
