import {translateUI} from "./i18n.ts";
import React, { useEffect, useState } from "react";
import type { UserInput, Group, Rule } from "../shared/people.ts";
import { encodeCsv, parseCsv } from "../shared/csv.ts";
type Props = {
  role: string;
  administrative: boolean;
  tick: number;
  busy: boolean;
  op: (name: string, args?: Record<string, unknown>) => Promise<any>;
  mutate: (name: string, args: Record<string, unknown>) => Promise<any>;
  saveProfile: (args: Record<string, unknown>) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<boolean>;
};
const user = (): UserInput => ({
  id: "",
  name: "",
  role: "learner",
  active: true,
  managerId: null,
  preferredLanguage: "en",
  interests: [],
  customFields: [],
});
const rule = (): Rule => ({
  field: "role",
  customField: "",
  operator: "equals",
  value: "learner",
});
const group = (): Group => ({
  name: "New group",
  kind: "dynamic",
  memberIds: [],
  mode: "ALL",
  rules: [rule()],
});
const split = (value: string) =>
  value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const download = (text: string, filename: string) => {
  const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export function People(p: Props) {
  const [editingUserId,setEditingUserId]=useState<string|null>(null);
  const [users, setUsers] = useState<any[]>([]),
    [groups, setGroups] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [groupOffset, setGroupOffset] = useState(0),
    [groupNext, setGroupNext] = useState<number | null>(null),
    [profile, setProfile] = useState<any>({
      preferredLanguage: "en",
      interests: [],
    }),
    [u, setU] = useState<UserInput>(user),
    [g, setG] = useState<Group>(group),
    [groupId, setGroupId] = useState(""),
    [members, setMembers] = useState<any>(null),
    [reviewedGroup, setReviewedGroup] = useState(""),
    [memberOffset, setMemberOffset] = useState(0),
    [csv, setCsv] = useState(""),
    [importReview, setImportReview] = useState<any>(null),
    [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false),
    [profileSaved, setProfileSaved] = useState(false);
  const manage = p.administrative && p.role === "admin",
    audience = p.administrative && ["admin", "manager"].includes(p.role);
  useEffect(() => {
    let live = true;
    void (async () => {
      const profile = await p.op("learning_get_profile");
      const rows = audience
        ? await p.op("learning_list_users", { offset, limit: 20 })
        : null;
      const gp = audience
        ? await p.op("learning_list_groups", { offset: groupOffset, limit: 20 })
        : null;
      if (!live) return;
      setProfile(profile);
      setLoaded(true);
      if (rows) {
        setUsers(rows.items);
        setNext(rows.nextOffset);
      }
      if (gp) {
        setGroups(gp.items);
        setGroupNext(gp.nextOffset);
      }
    })().catch((e) => {
      if (live) setLoadError(e.message);
    });
    return () => {
      live = false;
    };
  }, [p.tick, offset, groupOffset, audience]);
  const changeGroup = (next: Group) => {
    setG(next);
    setMembers(null);
    setReviewedGroup("");
    setMemberOffset(0);
  };
  if (!loaded && !loadError)
    return (
      <section aria-label={translateUI("People and groups")}>
        <p>{translateUI("Loading authorized profiles…")}</p>
      </section>
    );
  return (
    <section className="people" aria-label={translateUI("People and groups")}>
      <h2>{p.administrative ? "People and groups" : "Learning preferences"}</h2>
      {loadError && <p role="alert">{loadError}</p>}
      {!p.administrative && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void p.run(async () => {
              await p.saveProfile({
                preferredLanguage: profile.preferredLanguage,
                interests: split(profile.interests.join("\n")),
              });
              setProfileSaved(true);
            });
          }}
        >
          <label>{translateUI("Preferred content language")}<select
              aria-label={translateUI("Preferred content language")}
              value={profile.preferredLanguage}
              onChange={(e) => (
                setProfileSaved(false),
                setProfile({ ...profile, preferredLanguage: e.target.value })
              )}
            >
              <option value="en">{translateUI("English")}</option>
              <option value="vi">{translateUI("Tiếng Việt")}</option>
            </select>
          </label>
          <label>{translateUI("Learning interests · one per line")}<textarea
              aria-label={translateUI("Learning interests · one per line")}
              value={profile.interests.join("\n")}
              onChange={(e) => {
                setProfileSaved(false);
                setProfile({
                  ...profile,
                  interests: e.target.value.split("\n"),
                });
              }}
              maxLength={640}
            />
          </label>
          <p>{translateUI("Up to eight interests. Preferences never change your role or access.")}</p>
          <button disabled={p.busy}>{translateUI("Save learning preferences")}</button>
          {profileSaved && <p role="status">{translateUI("Learning preferences saved.")}</p>}
        </form>
      )}
      {audience && (
        <>
          <h3>{translateUI("Authorized users")}</h3>
          {users.map((row) => (
            <section key={row.id} className="learning-row">
              <div>
                <h4>{row.name}</h4>
                <p>
                  {row.id} · {row.role} · {row.active ? "Active" : "Inactive"} ·
                  Manager {row.managerId ?? "none"}
                </p>
              </div>
              {manage && (
                <button
                  className="ghost"
                  onClick={() => {
                    const { createdAt, ...fields } = row;
                    setEditingUserId(fields.id);setU(fields);
                  }}
                >{translateUI("Edit user")}</button>
              )}
            </section>
          ))}
          <button
            className="ghost"
            disabled={offset === 0 || p.busy}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >{translateUI("Previous users")}</button>
          <button
            className="ghost"
            disabled={next === null || p.busy}
            onClick={() => setOffset(next!)}
          >{translateUI("Next users")}</button>
          <h3>{translateUI("Groups")}</h3>
          {groups.map((row) => (
            <section className="learning-row" key={row.id}>
              <div>
                <h4>{row.name}</h4>
                <p>
                  {row.id} · {row.kind} · Version {row.version}
                </p>
              </div>
              <button
                className="ghost"
                onClick={() =>
                  void p.run(async () => {
                    const value = await p.op("learning_get_group", {
                      groupId: row.id,
                    });
                    setGroupId(row.id);
                    changeGroup(value.group);
                  })
                }
              >{translateUI("Open group")}</button>
            </section>
          ))}
          <button
            className="ghost"
            disabled={groupOffset === 0}
            onClick={() => setGroupOffset(Math.max(0, groupOffset - 20))}
          >{translateUI("Previous groups")}</button>
          <button
            className="ghost"
            disabled={groupNext === null}
            onClick={() => setGroupOffset(groupNext!)}
          >{translateUI("Next groups")}</button>
        </>
      )}
      {manage && (
        <>
          <form
            className="panel"
            aria-label={translateUI("User editor")}
            onSubmit={(e) => {
              e.preventDefault();
              void p.run(async () => {
                await p.mutate("learning_save_user", {
                  user: { ...u, interests: split(u.interests.join("\n")) },
                });
              });
            }}
          >
            <h3>{translateUI("User editor")}</h3>
            <fieldset disabled={p.busy}>
              <label>{translateUI("User ID")}<input
                  value={u.id}
                  readOnly={editingUserId!==null}
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9_-]+"
                  onChange={(e) => setU({ ...u, id: e.target.value })}
                />
              </label>
              <label>{translateUI("User name")}<input
                  value={u.name}
                  required
                  maxLength={160}
                  onChange={(e) => setU({ ...u, name: e.target.value })}
                />
              </label>
              <label>{translateUI("User role")}<select
                  aria-label={translateUI("User role")}
                  value={u.role}
                  onChange={(e) => setU({ ...u, role: e.target.value as any })}
                >
                  {[
                    "learner",
                    "manager",
                    "content_admin",
                    "admin",
                    "assessor",
                  ].map((role) => (
                    <option key={role} value={role}>{translateUI(role)}</option>
                  ))}
                </select>
              </label>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={u.active}
                  onChange={(e) => setU({ ...u, active: e.target.checked })}
                />{translateUI("Active account")}</label>
              <label>{translateUI("Manager ID · optional")}<input
                  value={u.managerId ?? ""}
                  maxLength={64}
                  onChange={(e) =>
                    setU({ ...u, managerId: e.target.value || null })
                  }
                />
              </label>
              <label>{translateUI("User content language")}<select
                  aria-label={translateUI("User content language")}
                  value={u.preferredLanguage}
                  onChange={(e) =>
                    setU({ ...u, preferredLanguage: e.target.value as any })
                  }
                >
                  <option value="en">{translateUI("English")}</option>
                  <option value="vi">{translateUI("Tiếng Việt")}</option>
                </select>
              </label>
              <label>{translateUI("User interests · one per line")}<textarea
                  aria-label={translateUI("User interests · one per line")}
                  value={u.interests.join("\n")}
                  maxLength={640}
                  onChange={(e) =>
                    setU({ ...u, interests: e.target.value.split("\n") })
                  }
                />
              </label>
              {u.customFields.map((f, i) => (
                <fieldset key={i}>
                  <legend>{translateUI("Custom field")}{" "}{i + 1}</legend>
                  <label>{translateUI("Field name")}<input
                      value={f.name}
                      required
                      maxLength={40}
                      pattern="[A-Za-z0-9_-]+"
                      onChange={(e) =>
                        setU({
                          ...u,
                          customFields: u.customFields.map((old, n) =>
                            n === i ? { ...old, name: e.target.value } : old,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>{translateUI("Field value")}<input
                      value={f.value}
                      maxLength={200}
                      onChange={(e) =>
                        setU({
                          ...u,
                          customFields: u.customFields.map((old, n) =>
                            n === i ? { ...old, value: e.target.value } : old,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setU({
                        ...u,
                        customFields: u.customFields.filter((_, n) => n !== i),
                      })
                    }
                  >{translateUI("Remove field")}</button>
                </fieldset>
              ))}
              <button
                type="button"
                className="ghost"
                disabled={u.customFields.length >= 8}
                onClick={() =>
                  setU({
                    ...u,
                    customFields: [...u.customFields, { name: "", value: "" }],
                  })
                }
              >{translateUI("Add custom field")}</button>
              <button>{translateUI("Save user")}</button>
              <button
                type="button"
                className="ghost"
                onClick={() => {setEditingUserId(null);setU(user());}}
              >{translateUI("New user")}</button>
            </fieldset>
            <p>{translateUI("Synthetic accounts use their ID plus “-dev”. Production login remains disabled until an identity adapter is configured. Deactivation preserves records and revokes sessions.")}</p>
          </form>
          <section className="panel">
            <h3>{translateUI("CSV user import")}</h3>
            <p>{translateUI("Header: id,name,role,active,managerId,preferredLanguage,interests,customFields. Interests and customFields are JSON arrays in CSV cells. Maximum 100 rows per reviewed batch.")}</p>
            <label>{translateUI("User CSV")}<textarea
                aria-label={translateUI("User CSV")}
                value={csv}
                maxLength={16000}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setImportReview(null);
                }}
              />
            </label>
            <button
              disabled={p.busy || !csv}
              onClick={() =>
                void p.run(async () =>
                  setImportReview(
                    await p.op("learning_preview_user_import", { csv }),
                  ),
                )
              }
            >{translateUI("Dry-run user import")}</button>
            {importReview && (
              <>
                <p role="status">
                  {importReview.valid ? "Valid review" : "Import rejected"} ·{" "}
                  {importReview.total} users
                </p>
                {importReview.errors.map((r: any, i: number) => (
                  <p key={i}>{translateUI("Row")}{" "}{r.row}: {r.message}
                  </p>
                ))}
                {importReview.changes.map((r: any) => (
                  <p key={r.id}>
                    {r.id} · {r.name} · {r.role} ·{" "}
                    {r.active ? "active" : "inactive"}
                  </p>
                ))}
                <button
                  disabled={p.busy || !importReview.valid}
                  onClick={() =>
                    void p.run(async () => {
                      await p.mutate("learning_import_users", {
                        csv,
                        previewHash: importReview.previewHash,
                      });
                      setImportReview(null);
                    })
                  }
                >{translateUI("Import reviewed users")}</button>
              </>
            )}
            <button
              className="ghost"
              disabled={p.busy}
              onClick={() =>
                void p.run(async () => {
                  let offset = 0;
                  const rows: string[][] = [];
                  do {
                    const result = await p.op("learning_export_users", {
                      offset,
                      limit: 20,
                    });
                    const parsed = parseCsv(result.csv);
                    rows.push(...(offset === 0 ? parsed : parsed.slice(1)));
                    if (result.nextOffset === null) break;
                    if (result.nextOffset <= offset)
                      throw Error("Export did not advance");
                    offset = result.nextOffset;
                  } while (true);
                  download(encodeCsv(rows), "pear-users.csv");
                })
              }
            >{translateUI("Export all authorized users CSV")}</button>
          </section>
        </>
      )}
      {audience && (
        <form
          className="panel"
          aria-label={translateUI("Group editor")}
          onSubmit={(e) => {
            e.preventDefault();
            void p.run(async () => {
              const result = await p.op("learning_preview_group", {
                group: { ...g, memberIds: split(g.memberIds.join("\n")) },
                offset: memberOffset,
                limit: 20,
              });
              setMembers(result);
              setReviewedGroup(JSON.stringify(g));
            });
          }}
        >
          <h3>{manage ? "Group editor" : "Scoped group preview"}</h3>
          <fieldset disabled={p.busy}>
            <label>{translateUI("Group ID")}<input
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  setReviewedGroup("");
                }}
                required
                maxLength={64}
                pattern="[A-Za-z0-9_-]+"
              />
            </label>
            <label>{translateUI("Group name")}<input
                value={g.name}
                onChange={(e) => changeGroup({ ...g, name: e.target.value })}
                required
                maxLength={160}
              />
            </label>
            <label>{translateUI("Group kind")}<select
                aria-label={translateUI("Group kind")}
                value={g.kind}
                onChange={(e) =>
                  changeGroup(
                    e.target.value === "static"
                      ? { ...g, kind: "static", memberIds: [], rules: [] }
                      : {
                          ...g,
                          kind: "dynamic",
                          memberIds: [],
                          rules: [rule()],
                        },
                  )
                }
              >
                <option value="static">{translateUI("Static")}</option>
                <option value="dynamic">{translateUI("Dynamic")}</option>
              </select>
            </label>
            {g.kind === "static" ? (
              <label>{translateUI("Member IDs · one per line")}<textarea
                  aria-label={translateUI("Member IDs · one per line")}
                  value={g.memberIds.join("\n")}
                  onChange={(e) =>
                    changeGroup({ ...g, memberIds: e.target.value.split("\n") })
                  }
                />
              </label>
            ) : (
              <>
                <label>{translateUI("Rule combination")}<select
                    aria-label={translateUI("Rule combination")}
                    value={g.mode}
                    onChange={(e) =>
                      changeGroup({ ...g, mode: e.target.value as any })
                    }
                  >
                    <option value="ALL">{translateUI("ALL")}</option>
                    <option value="ANY">{translateUI("ANY")}</option>
                  </select>
                </label>
                {g.rules.map((r, i) => (
                  <fieldset key={i}>
                    <legend>{translateUI("Membership rule")}{" "}{i + 1}</legend>
                    <label>{translateUI("Rule field")}<select
                        aria-label={translateUI("Rule field")}
                        value={r.field}
                        onChange={(e) =>
                          changeGroup({
                            ...g,
                            rules: g.rules.map((old, n) =>
                              n === i
                                ? {
                                    ...old,
                                    field: e.target.value as any,
                                    customField: "",
                                    operator: "equals",
                                    value: "",
                                  }
                                : old,
                            ),
                          })
                        }
                      >
                        {[
                          "name",
                          "role",
                          "managerId",
                          "active",
                          "createdAt",
                          "customField",
                        ].map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    {r.field === "customField" && (
                      <label>{translateUI("Custom field name")}<input
                          value={r.customField}
                          required
                          maxLength={40}
                          onChange={(e) =>
                            changeGroup({
                              ...g,
                              rules: g.rules.map((old, n) =>
                                n === i
                                  ? { ...old, customField: e.target.value }
                                  : old,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                    <label>{translateUI("Rule operator")}<select
                        aria-label={translateUI("Rule operator")}
                        value={r.operator}
                        onChange={(e) =>
                          changeGroup({
                            ...g,
                            rules: g.rules.map((old, n) =>
                              n === i
                                ? { ...old, operator: e.target.value as any }
                                : old,
                            ),
                          })
                        }
                      >
                        {[
                          "equals",
                          "notEquals",
                          "contains",
                          "before",
                          "after",
                        ].map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                    <label>{translateUI("Rule value")}<input
                        value={r.value}
                        type={r.field === "createdAt" ? "date" : "text"}
                        required
                        maxLength={200}
                        onChange={(e) =>
                          changeGroup({
                            ...g,
                            rules: g.rules.map((old, n) =>
                              n === i ? { ...old, value: e.target.value } : old,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost"
                      disabled={g.rules.length === 1}
                      onClick={() =>
                        changeGroup({
                          ...g,
                          rules: g.rules.filter((_, n) => n !== i),
                        })
                      }
                    >{translateUI("Remove rule")}</button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="ghost"
                  disabled={g.rules.length >= 16}
                  onClick={() =>
                    changeGroup({ ...g, rules: [...g.rules, rule()] })
                  }
                >{translateUI("Add membership rule")}</button>
              </>
            )}
            <button>{translateUI("Preview membership")}</button>
            {members && (
              <>
                <p role="status">
                  {members.total} active members in your authorized scope
                </p>
                {members.items.map((m: any) => (
                  <p key={m.id}>
                    {m.id} · {m.name}
                  </p>
                ))}
                <button
                  type="button"
                  className="ghost"
                  disabled={memberOffset === 0}
                  onClick={() =>
                    setMemberOffset(Math.max(0, memberOffset - 20))
                  }
                >{translateUI("Previous members · then preview")}</button>
                <button
                  type="button"
                  className="ghost"
                  disabled={members.nextOffset === null}
                  onClick={() => setMemberOffset(members.nextOffset)}
                >{translateUI("Next members · then preview")}</button>
              </>
            )}
            {manage && (
              <button
                type="button"
                disabled={reviewedGroup !== JSON.stringify(g)}
                onClick={() =>
                  void p.run(async () => {
                    await p.mutate("learning_save_group", {
                      groupId,
                      group: { ...g, memberIds: split(g.memberIds.join("\n")) },
                    });
                    setReviewedGroup("");
                  })
                }
              >{translateUI("Save reviewed group")}</button>
            )}
          </fieldset>
        </form>
      )}
    </section>
  );
}
