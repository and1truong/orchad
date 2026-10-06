import {PrimaryAssignment,AssessmentNotices} from "./moderation-assignments.tsx";
import {awardUnitLabel} from "../shared/programs.ts";
import {translateUI} from "./i18n.ts";
import { Certificate } from "./certificate.tsx";
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
  mutate: (name: string, args: Record<string, unknown>,documentId?:string) => Promise<any>;
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
          <legend>{translateUI("Alternative")}{" "}{i + 1}</legend>
          <label>{translateUI("Reference type")}<select aria-label={translateUI("Reference type")}
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
          <label>{translateUI("Published reference ID · external learning key")}<input
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
          >{translateUI("Remove reference")}</button>
        </fieldset>
      ))}
      <button
        type="button"
        className="ghost"
        disabled={busy || refs.length >= 8}
        onClick={() => onChange([...refs, { kind: kinds[0], id: "" }])}
      >{translateUI("Add reference")}</button>
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
        {assetId && <p role="status">{translateUI("Evidence PDF attached")}</p>}
        <label>{translateUI("Claimed")}{" "}{unit}
          <input
            name="amount"
            type="number"
            min={1}
            max={credits}
            defaultValue={1}
            required
          />
        </label>
        <label>{translateUI("Evidence · personal statement or reference")}<textarea name="evidence" required maxLength={2000} />
        </label>
        <label className="choice">
          <input type="checkbox" required />{translateUI("I confirm this evidence describes my own external learning.")}</label>
        <button disabled={props.busy || !active || uploading}>{translateUI("Submit external learning")}</button>
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
            {r.creditMode==="nested_earned"&&<span>{translateUI("Actual earned child award credits")} · </span>}{r.required ? "Required" : "Elective"} · {r.earned} / {r.credits}{" "}
            {awardUnitLabel(progress,r.credits)} · {r.completed ? "Complete" : "In progress"}
          </p>
          {r.alternatives.map((ref: any, i: number) => (
            <div key={i}>
              {ref.kind === "award" ? (
                <>
                  <p>{translateUI("Nested award:")}{" "}{ref.title} · Version {ref.version}
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
                  <p>{translateUI("Course:")}{" "}{ref.id} ·{" "}
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
                    >{translateUI("Study course for this award")}</button>
                  )}
                </div>
              ) : (
                <>
                  <p>{translateUI("External learning:")}{" "}{ref.id} ·{" "}
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
                    unit={awardUnitLabel(progress,r.credits)}
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
    if(field==="access"){
      const next={...value,access:v as Award["access"]};if(v==="groups")next.groupIds=next.groupIds??[];else delete next.groupIds;
      if(kind==="award")setAward(next as Award);else setPlaylist(next as Playlist);
    }else if (kind === "award") setAward({ ...award, [field]: v });
    else setPlaylist({ ...playlist, [field]: v });
  };
  const updateRequirement = (i: number, r: Requirement) =>
    setAward({
      ...award,
      requirements: award.requirements.map((old, n) => (n === i ? r : old)),
    });
  return (
    <section aria-label={translateUI("Programs")}>
      <h2>
        {administrative ? "Programs administration" : "Playlists and awards"}
      </h2>
      {loadError && <p role="alert">{loadError}</p>}
      {!administrative && (
        <>
          <p>{translateUI("Playlists are reading collections. Awards have their own required learning and credit targets.")}</p>
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
                >{translateUI("View collection")}</button>
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
                  >{translateUI("Enroll in award")}</button>
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
                >{translateUI("Previous references")}</button>
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
                >{translateUI("Next references")}</button>
              </div>
              {detail.kind === "playlist" && (
                <p>{translateUI("Open courses or standalone items through Explore. This playlist has no completion or certificate.")}</p>
              )}
              <button className="ghost" onClick={() => setDetail(null)}>{translateUI("Close collection")}</button>
            </section>
          )}
          <h3>{translateUI("My awards")}</h3>
          {awards.map((a) => (
            <section className="panel" key={a.id}>
              <h3>{a.title}</h3>
              <p>
                {a.assignment_state !== "active"
                  ? a.assignment_state + " · "
                  : ""}
                Version {a.version} · {a.completionMode==="one_item"?<>{translateUI("Complete one configured criterion")} · {a.earned} {awardUnitLabel(a,a.earned)}</>:<>{a.earned} / {a.target} {awardUnitLabel(a,a.target)}</>} ·{" "}
                {a.ongoing
                  ? "Ongoing · no automatic completion"
                  : a.completed_at
                    ? "Completed"
                    : "In progress"}{" "}
                · Required learning{" "}
                {a.requiredComplete ? "satisfied" : "still needed"}
              </p>
              {a.due_date && <p>{translateUI("Due")}{" "}{new Date(a.due_date).toLocaleString()}</p>}
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
                >{translateUI("Award certificate")}</button>
              )}
            </section>
          ))}
          <div className="actions">
            <button
              className="ghost"
              disabled={busy || awardOffset === 0}
              onClick={() => setAwardOffset(Math.max(0, awardOffset - 10))}
            >{translateUI("Previous awards")}</button>
            <button
              className="ghost"
              disabled={busy || awardNext === null}
              onClick={() => setAwardOffset(awardNext!)}
            >{translateUI("Next awards")}</button>
          </div>
          {certificate && (
            <Certificate
              key={props.session.sessionEpoch + certificate.id}
              certificate={certificate}
              award
            />
          )}
        </>
      )}
      {administrative && author && (
        <>
          <p>{translateUI("Published references: courses and nested awards must be published before publishing this program. External keys identify self-authored requirements.")}</p>
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
                >{translateUI("Edit program")}</button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await mutate("learning_publish_collection", {
                        collectionId: d.id,
                      });
                    })
                  }
                >{translateUI("Publish program")}</button>
                <button className="ghost" disabled={busy || d.state !== "published"} onClick={() => void run(async () => {await mutate("learning_unpublish_collection", {collectionId:d.id});})}>{translateUI("Unpublish program")}</button>
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
                >{translateUI("Retire program")}</button>
              </div>
            </section>
          ))}
          <form
            className="panel"
            aria-label={translateUI("Program editor")}
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
            <h3>{translateUI("Program editor")}</h3>
            <fieldset disabled={busy}>
              <label>{translateUI("Collection ID")}<input
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9_-]+"
                />
              </label>
              <label>{translateUI("Collection type")}<select aria-label={translateUI("Collection type")}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as any)}
                >
                  <option value="award">{translateUI("Award")}</option>
                  <option value="playlist">{translateUI("Playlist")}</option>
                </select>
              </label>
              <label>{translateUI("Program title")}<input
                  value={value.title}
                  onChange={(e) => metadata("title", e.target.value)}
                  required
                  maxLength={160}
                />
              </label>
              <label>{translateUI("Program summary")}<textarea
                  value={value.summary}
                  onChange={(e) => metadata("summary", e.target.value)}
                  required
                  maxLength={600}
                />
              </label>
              <label>{translateUI("Access")}<select aria-label={translateUI("Access")}
                  value={value.access}
                  onChange={(e) => metadata("access", e.target.value)}
                >
                  <option value="tenant">{translateUI("Organization")}</option>
                  <option value="author">{translateUI("Author only")}</option>
                  <option value="groups">{translateUI("Selected groups")}</option>
                </select>
              </label>
              {value.access==="groups"&&<label>{translateUI("Audience group IDs")}<input aria-label={translateUI("Audience group IDs")} required maxLength={520} value={(value.groupIds??[]).join(",")} onChange={e=>{const groupIds=e.target.value.split(",").map(id=>id.trim()).filter(Boolean);if(kind==="award")setAward({...award,groupIds});else setPlaylist({...playlist,groupIds});}}/></label>}
              {kind === "playlist" ? (
                <References
                  refs={playlist.items}
                  onChange={(items) => setPlaylist({ ...playlist, items })}
                  kinds={["course", "item"]}
                  busy={busy}
                />
              ) : (
                <>
                  <label>{translateUI("Credit unit")}<select aria-label={translateUI("Credit unit")}
                      value={award.unit}
                      onChange={(e) =>
                        setAward(({unitSingular,unitPlural,...current})=>e.target.value==="custom"?{...current,unit:"custom",unitSingular:"credit",unitPlural:"credits"}:{...current,unit:e.target.value as Award["unit"]})
                      }
                    >
                      <option value="credits">{translateUI("Credits")}</option>
                      <option value="hours">{translateUI("Hours")}</option>
                      <option value="custom">{translateUI("Original custom units")}</option>
                    </select>
                  </label>
                  {award.unit==="custom"&&<><label>{translateUI("Custom unit singular")}<input required maxLength={40} value={award.unitSingular??""} onChange={e=>setAward({...award,unitSingular:e.target.value})}/></label><label>{translateUI("Custom unit plural")}<input required maxLength={40} value={award.unitPlural??""} onChange={e=>setAward({...award,unitPlural:e.target.value})}/></label></>}
                  <label>{translateUI("Award completion rule")}<select aria-label={translateUI("Award completion rule")} value={award.completionMode??"target"} onChange={e=>setAward({...award,completionMode:e.target.value as Award["completionMode"],...(e.target.value==="one_item"?{requirements:award.requirements.map(r=>({...r,required:false}))}:{})})}><option value="target">{translateUI("Reach target and required criteria")}</option><option value="one_item">{translateUI("Complete one configured criterion")}</option></select></label>
                  <label>{translateUI("Target")}<input
                      type="number"
                      value={award.target}
                      disabled={award.completionMode==="one_item"}
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
                    />{translateUI("Ongoing · never complete automatically")}</label>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={award.moderatedExternal}
                      onChange={(e) =>
                        setAward({
                          ...award,
                          moderatedExternal: e.target.checked,
                          ...(!e.target.checked?{primaryModeration:false}:{}),
                        })
                      }
                    />{translateUI("Require assessor approval for external learning")}</label>
                  <label><input type="checkbox" disabled={!award.moderatedExternal} checked={!!award.primaryModeration} onChange={e=>setAward({...award,primaryModeration:e.target.checked})}/>{translateUI("Require designated primary assessor for external records")}</label>
                  {award.requirements.map((r, i) => (
                    <fieldset key={i}>
                      <legend>{translateUI("Requirement")}{" "}{i + 1}</legend>
                      <label>{translateUI("Criterion ID")}<input
                          value={r.id}
                          required
                          maxLength={64}
                          pattern="[A-Za-z0-9_-]+"
                          onChange={(e) =>
                            updateRequirement(i, { ...r, id: e.target.value })
                          }
                        />
                      </label>
                      <label>{translateUI("Criterion title")}<input
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
                          disabled={award.completionMode==="one_item"}
                          checked={r.required}
                          onChange={(e) =>
                            updateRequirement(i, {
                              ...r,
                              required: e.target.checked,
                            })
                          }
                        />{translateUI("Required criterion")}</label>
                      <label>{translateUI("Criterion credit calculation")}<select value={r.creditMode??"fixed"} onChange={e=>updateRequirement(i,{...r,creditMode:e.target.value as Requirement["creditMode"]})}><option value="fixed">{translateUI("Fixed criterion quantity")}</option><option value="nested_earned">{translateUI("Actual earned child award credits")}</option></select></label>
                      {r.creditMode==="nested_earned"&&<p>{translateUI("Only child award alternatives with identical units. Greatest actual child quantity counts once; child completion determines the required criterion.")}</p>}
                      <label>{translateUI("Criterion credits or hours")}<input disabled={r.creditMode==="nested_earned"}
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
                        kinds={r.creditMode==="nested_earned"?["award"]:["course", "award", "external"]}
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
                      >{translateUI("Remove criterion")}</button>
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
                          {...requirement(award.requirements.length + 1),required:award.completionMode!=="one_item"},
                        ],
                      })
                    }
                  >{translateUI("Add criterion")}</button>
                </>
              )}
              <button>{translateUI("Save program draft")}</button>
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
              >{translateUI("New program")}</button>
            </fieldset>
          </form>
        </>
      )}
      <div className="actions">
        <button
          className="ghost"
          disabled={busy || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 10))}
        >{translateUI("Previous programs")}</button>
        <button
          className="ghost"
          disabled={busy || next === null}
          onClick={() => setOffset(next!)}
        >{translateUI("Next programs")}</button>
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
          <h3>{translateUI("Assign an award")}</h3>
          <label>{translateUI("Award ID")}<input name="award" required maxLength={64} />
          </label>
          <label>{translateUI("Award learner ID")}<input name="learner" required maxLength={128} />
          </label>
          <button disabled={busy}>{translateUI("Assign award")}</button>
        </form>
      )}
      {["admin","assessor"].includes(role)&&<AssessmentNotices actions={{...props,mutate:(name,args)=>props.mutate(name,args,`learning:${props.session.principal.tenant}:${props.session.principal.id}`)}} tick={tick}/>}
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
          <h3>{translateUI("Assessor permissions")}</h3>
          <label>{translateUI("Assessed award ID")}<input name="award" required />
          </label>
          <label>{translateUI("Assessor account ID")}<input name="assessor" required />
          </label>
          <label className="choice">
            <input type="checkbox" name="enabled" defaultChecked />{translateUI("Grant award scope · uncheck to revoke")}</label>
          <button disabled={busy}>{translateUI("Save assessor scope")}</button>
        </form>
      )}
      {administrative && ["admin", "assessor"].includes(role) && (
        <section className="panel">
          <h3>{translateUI("External learning moderation")}</h3>
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
            <label>{translateUI("Moderation award ID")}<input
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
            <button disabled={busy}>{translateUI("Load submissions")}</button>
          </form>
          {records.map((r) => (
            <React.Fragment key={r.id}><form
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
              {r.primaryRequired&&<p>{translateUI("Designated primary assessor")}: {r.primaryAssessorId??translateUI("Awaiting administrator assignment")}</p>}
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
              {r.state === "pending" && (!r.primaryRequired||r.primaryAssessorId===props.session.principal.id) && (
                <>
                  <label>{translateUI("Decision")}<select aria-label={translateUI("Decision")} name="decision">
                      <option value="accept">{translateUI("Accept")}</option>
                      <option value="reject">{translateUI("Reject")}</option>
                    </select>
                  </label>
                  <label>{translateUI("Decision reason")}<textarea name="reason" required maxLength={600} />
                  </label>
                  <button disabled={busy}>{translateUI("Record moderation decision")}</button>
                </>
              )}
            </form>
            {role==="admin"&&r.state==="pending"&&<PrimaryAssignment record={r} actions={props} onUpdate={async()=>{const page=await op("learning_get_external_records",{collectionId:scope,offset:recordOffset,limit:10});setRecords(page.items);setRecordNext(page.nextOffset);}}/>}
            </React.Fragment>
          ))}
          <button
            className="ghost"
            disabled={recordOffset === 0}
            onClick={() => setRecordOffset(Math.max(0, recordOffset - 10))}
          >{translateUI("Previous submissions · then load")}</button>
          <button
            className="ghost"
            disabled={recordNext === null}
            onClick={() => setRecordOffset(recordNext!)}
          >{translateUI("Next submissions · then load")}</button>
        </section>
      )}
    </section>
  );
}
