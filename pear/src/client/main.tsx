import {PreviousResponse} from "./previous-response.tsx";
import {DigestSubscriptions} from "./digest-subscriptions.tsx";
import {ProviderConnections} from "./provider-connections.tsx";
import {ProviderContent} from "./provider-catalog.tsx";
import {defaultPortal,portalPalettes,type PortalBranding} from "../shared/portal.ts";
import {PortalSettings} from "./portal.tsx";
import {CourseRetake} from "./retakes.tsx";
import {QuestionBanks} from "./question-banks.tsx";
import {OwnInsights} from "./insights.tsx";
import {SessionManagement,SessionNotices} from "./session-changes.tsx";
import {LearningDigest} from "./digest.tsx";
import {ExternalActivity} from "./external-activity.tsx";
import {PackageLearning} from "./scorm.tsx";
import {LanguageVariants,TranslationSettings} from "./translations.tsx";
import {WebhookSettings} from "./webhooks.tsx";
import {ProvisioningClients} from "./provisioning.tsx";
import {IdentityLinks} from "./identity.tsx";
import {translateUI,getUILocale,setUILocale} from "./i18n.ts";
import { Discovery } from "./discovery.tsx";
import { CurationPanel, CuratedContent } from "./curation.tsx";
import { StudyTimer } from "./study-timer.tsx";
import { StandaloneLearning } from "./standalone-learning.tsx";
import { Certificate } from "./certificate.tsx";
import { CourseFeedback, CourseRatings, FeedbackReview } from "./feedback.tsx";
import { BlendedPlayer, BlendedReviews } from "./blended.tsx";
import { UploadedMedia } from "./media.tsx";
import { Assessments } from "./assessments.tsx";
import { AssessmentQuestion, completeResponse } from "./assessment-player.tsx";
import {
  availableGroups,
  scopedWorkspace,
  type ToolGroup,
} from "../shared/tool-groups.ts";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBridge, invoke, request, type Session } from "./api.ts";
import {
  CourseEditor,
  newCourse,
  type DraftSelection,
} from "./course-editor.tsx";
import {
  ContentLibrary,
  StandaloneReader,
  type ContentDraft,
} from "./content-library.tsx";
import "./style.css";
import { Reports } from "./reports.tsx";
import { Assignments } from "./assignments.tsx";
import { People } from "./people.tsx";
import { Programs } from "./programs.tsx";
const labels = {
  en: {
    catalog: "Explore",
    learning: "My learning",
    admin: "Administration",
    search: "Search courses",
    saved: "Save course",
    enroll: "Enroll",
    continue: "Continue learning",
    complete: "I have studied this lesson",
    quiz: "Start assessment",
    logout: "Sign out",
    login: "Sign in",
    submit: "Confirm and submit my answers",
  },
  vi: {
    catalog: "Khám phá",
    learning: "Việc học của tôi",
    admin: "Quản trị",
    search: "Tìm khóa học",
    saved: "Lưu khóa học",
    enroll: "Đăng ký học",
    continue: "Tiếp tục học",
    complete: "Tôi đã học bài này",
    quiz: "Bắt đầu kiểm tra",
    logout: "Đăng xuất",
    login: "Đăng nhập",
    submit: "Xác nhận và nộp đáp án của tôi",
  },
};
const personal = (s: Session) =>
  `learning:${s.principal.tenant}:${s.principal.id}`;
function App() {
  const [portal,setPortal]=useState<{branding:PortalBranding;version:number}>({branding:structuredClone(defaultPortal),version:0});
  useEffect(()=>{document.documentElement.lang=getUILocale();},[]);
  const [authOptions,setAuthOptions]=useState<{oidcEnabled:boolean;developmentEnabled:boolean}|null>(null);
  useEffect(()=>{let active=true;void request<any>("/api/auth/config",null).then(r=>{if(active)setAuthOptions(r);}).catch(()=>{});return()=>{active=false;};},[]);
  const [session, setSessionState] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [view, setView] = useState("catalog"),
    [assistantGroup, setAssistantGroup] = useState<ToolGroup>("learning"),
    [locale, setLocale] = useState<"en" | "vi">(getUILocale),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0);
  const [items, setItems] = useState<any[]>([]),
    [my, setMy] = useState<any>({ enrollments: [], saved: [] }),
    [query, setQuery] = useState(""),
    [language, setLanguage] = useState(""),
    [duration, setDuration] = useState(""),
    [topic, setTopic] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [lesson, setLesson] = useState<any>(null),
    [active, setActive] = useState<any>(null),
    [attempt, setAttempt] = useState<any>(null),
    [certificate, setCertificate] = useState<any>(null);
  const [drafts, setDrafts] = useState<any[]>([]),
    [report, setReport] = useState<any[]>([]),
    [audience, setAudience] = useState<any[]>([]),
    [selectedCourse, setSelectedCourse] = useState("systems-basics"),
    [learner, setLearner] = useState("learner-a"),
    [due, setDue] = useState("");
  const [catalogOffset, setCatalogOffset] = useState(0),
    [learningOffset, setLearningOffset] = useState(0),
    [draftOffset, setDraftOffset] = useState(0),
    [catalogTotal, setCatalogTotal] = useState(0),
    [draftNext, setDraftNext] = useState<number | null>(null);
  const [editing, setEditing] = useState<DraftSelection | null>(null),
    [editorKey, setEditorKey] = useState(0),
    [contentDrafts, setContentDrafts] = useState<ContentDraft[]>([]),
    [contentOffset, setContentOffset] = useState(0),
    [contentNext, setContentNext] = useState<number | null>(null),
    [standalone, setStandalone] = useState<any[]>([]),
    [standaloneOffset, setStandaloneOffset] = useState(0),
    [standaloneNext, setStandaloneNext] = useState<number | null>(null),
    [readingItem, setReadingItem] = useState<any>(null);
  const contentHeading=useRef<HTMLHeadingElement>(null);
  const previousView=useRef(view);
  useEffect(()=>{
    if(session&&previousView.current!==view)contentHeading.current?.focus();
    previousView.current=view;
  },[view,session]);
  const sessionRef = useRef<Session | null>(null);
  const refreshGeneration = useRef(0);
  const setSession = (next: Session | null) => {
    setPortal({branding:structuredClone(defaultPortal),version:0});
    setAssistantGroup("learning");
    sessionRef.current = next;
    if (!next) delete window.agentBridgeV1;
    setSessionState(next);
    setMy({ enrollments: [], saved: [] });
    setItems([]);
    setDrafts([]);
    setReport([]);
    setAudience([]);
    setActive(null);
    setLesson(null);
    setAttempt(null);
    setCertificate(null);
    setPreview(null);
    setEditing(null);
    setContentDrafts([]);
    setContentOffset(0);
    setStandalone([]);
    setStandaloneOffset(0);
    setReadingItem(null);
    setCatalogOffset(0);
    setLearningOffset(0);
    setDraftOffset(0);
  };
  const t = labels[locale],
    baseDoc = session
      ? view === "admin"
        ? `library:${session.principal.tenant}`
        : personal(session)
      : "",
    doc = baseDoc ? scopedWorkspace(baseDoc, assistantGroup) : "";
  const docRef = useRef(doc);
  docRef.current = doc;
  useEffect(() => {
    request<Session>("/api/session", null)
      .then(setSession)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!session) {
      delete window.agentBridgeV1;
      return;
    }
    const bridge = createBridge(
      session,
      () => docRef.current,
      () => setTick((n) => n + 1),
    );
    window.agentBridgeV1 = bridge;
    return () => {
      if (window.agentBridgeV1 === bridge) delete window.agentBridgeV1;
    };
  }, [session]);
  const run = async (fn: () => Promise<void>) => {
    const capturedSession = sessionRef.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      return true;
    } catch (e) {
      if (
        sessionRef.current === capturedSession &&
        e instanceof Error &&
        e.message.startsWith("UNAUTHORIZED:")
      )
        setSession(null);
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const op = async (
    name: string,
    args: Record<string, unknown> = {},
    write = false,
    documentId = doc,
  ) => {
    if (!session) throw new Error("Sign in required");
    try {
      return (await invoke(session, documentId, name, args, write)).data as any;
    } catch (e) {
      if (
        sessionRef.current === session &&
        e instanceof Error &&
        e.message.startsWith("UNAUTHORIZED:")
      )
        setSession(null);
      throw e;
    }
  };
  const refresh = async () => {
    if (!session) return;
    const generation = ++refreshGeneration.current;
    const result = await op("learning_search", {
      query,
      ...(language ? { language } : {}),
      ...(duration ? { maxDuration: Number(duration) } : {}),
      ...(topic ? { topic } : {}),
      limit: 20,
      offset: catalogOffset,
    });
    const learning = await op("learning_get_my_learning", {
      offset: learningOffset,
      limit: 20,
    });
    const itemPage =
      view === "catalog"
        ? await op("learning_search_items", {
            query,
            ...(language?{language}:{}),
            offset: standaloneOffset,
            limit: 20,
          })
        : null;
    let itemDraftPage: any = null;
    let draftContinuation: number | null = null;
    let draftRows: any[] = [],
      reportRows: any[] = [],
      users: any[] = [];
    if (view === "admin") {
      if (["admin", "content_admin"].includes(session.principal.role)) {
        const page = await op("learning_get_drafts", {
          offset: draftOffset,
          limit: 20,
        });
        itemDraftPage = await op("learning_get_content_drafts", {
          offset: contentOffset,
          limit: 20,
        });
        draftRows = page.items;
        draftContinuation = page.nextOffset;
      }
      if (["admin", "manager"].includes(session.principal.role)) {
        reportRows = (await op("learning_report_query", { limit: 50 })).rows;
        users = (await request<any>("/api/audience", session)).users;
      }
    }
    if (
      sessionRef.current !== session ||
      docRef.current !== doc ||
      generation !== refreshGeneration.current
    )
      return;
    setItems(result.items);
    setCatalogTotal(result.total);
    setDraftNext(draftContinuation);
    setMy(learning);
    setActive((current: any) =>
      current
        ? (learning.enrollments.find((e: any) => e.id === current.id) ??
          current)
        : null,
    );
    setDrafts(draftRows);
    setReport(reportRows);
    setAudience(users);
    if (itemPage) {
      setStandalone(itemPage.items);
      setStandaloneNext(itemPage.nextOffset);
    }
    if (itemDraftPage) {
      setContentDrafts(itemDraftPage.items);
      setContentNext(itemDraftPage.nextOffset);
    }
  };
  useEffect(() => {
    void refresh().catch((e) => {
      if (sessionRef.current === session)
        setError(e instanceof Error ? e.message : String(e));
    });
  }, [
    session,
    view,
    tick,
    language,
    duration,
    topic,
    catalogOffset,
    learningOffset,
    draftOffset,
    contentOffset,
    standaloneOffset,
  ]);
  const mutate = async (
    name: string,
    args: Record<string, unknown>,
    documentId = doc,
  ) => {
    const r = await op(name, args, true, documentId);
    setTick((n) => n + 1);
    return r;
  };
  useEffect(()=>{let live=true;if(session)void invoke(session,personal(session),"human_get_portal_branding",{}).then(r=>{if(live&&sessionRef.current===session)setPortal(r.data as {branding:PortalBranding;version:number});}).catch(()=>{});return()=>{live=false;};},[session,tick]);
  const openLesson = async (e: any, id: string) => {
    const r = await op(
      "learning_get_lesson",
      { enrollmentId: e.id, lessonId: id },
      false,
      personal(session!),
    );
    if (sessionRef.current !== session) return;
    setReadingItem(null);
    setActive(e);
    setLesson(r);
    setAttempt(null);
    setPreview(null);
  };
  const clearLearning = () => {
    setReadingItem(null);
    setActive(null);
    setLesson(null);
    setAttempt(null);
    setCertificate(null);
    setPreview(null);
  };
  if (!ready) return <main>{translateUI("Loading Pear…")}</main>;
  if (!session)
    return (
      <main className="signin">
        <div className="brand">{translateUI("◒ pear")}</div>
        <p className="eyebrow">{translateUI("A little progress, every day")}</p>
        <h1>{translateUI("Your next")}<br />{translateUI("learning chapter.")}</h1>
        <p className="muted">{translateUI("Self-authored courses. Real progress. An assistant through Lime when you choose.")}</p>
        {authOptions?.oidcEnabled&&<button disabled={busy} onClick={()=>void run(async()=>{
          const result=await request<{url:string}>("/api/auth/start",null,{});
          window.location.assign(result.url);
        })}>{translateUI("Continue with organization SSO")}</button>}
        {(authOptions===null||authOptions.developmentEnabled)&&<form
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void run(async () => {
              setSession(
                await request<Session>("/api/login", null, {
                  username: d.get("username"),
                  password: d.get("password"),
                }),
              );
              setView("catalog");
              clearLearning();
            });
          }}
        >
          <label>{translateUI("Account")}<input
              name="username"
              defaultValue="learner-a"
              required
              autoComplete="username"
            />
          </label>
          <label>{translateUI("Password")}<input
              name="password"
              type="password"
              defaultValue="learner-a-dev"
              required
              autoComplete="current-password"
            />
          </label>
          <button disabled={busy}>{t.login}</button>
        </form>}
        {!authOptions?.developmentEnabled&&<p>{translateUI(authOptions?.oidcEnabled?"Use your reviewed organization identity to sign in.":"Production identity is not configured.")}</p>}
        {(authOptions===null||authOptions.developmentEnabled)&&<p className="dev">{translateUI("Synthetic development portal. Accounts: learner-a, learner-b, manager, admin, editor, assessor. Password: account name + “-dev”. Production identity is not configured.")}</p>}
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const role = session.principal.role,
    canAdmin = ["admin", "manager", "content_admin", "assessor"].includes(role),
    canEdit = ["admin", "content_admin"].includes(role);
  return (
    <div className="shell">
      <a className="skip-link" href="#learning-main">{translateUI("Skip to learning content")}</a>
      <aside>
        <div className="brand" aria-label={translateUI("Organization learning portal")} style={{color:portalPalettes[portal.branding.palette],overflowWrap:"anywhere",maxWidth:"100%"}}><span>◒ {portal.branding.name}</span>{portal.branding.tagline&&<p className="muted">{portal.branding.tagline}</p>}</div>
        <p className="eyebrow">{translateUI("Learning workspace")}</p>
        <label>{translateUI("Assistant workspace")}<select
            aria-label={translateUI("Assistant workspace")}
            value={assistantGroup}
            disabled={busy}
            onChange={(e) => setAssistantGroup(e.target.value as ToolGroup)}
          >
            {availableGroups(role).map((group) => (
              <option value={group} key={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label={translateUI("Learning navigation")}>
          {[
            ["catalog", t.catalog],
            ["learning", t.learning],
            ["packages",translateUI("Imported packages")],
            ["programs", locale === "vi" ? "Chương trình" : "Programs"],
            ["notifications", locale === "vi" ? "Thông báo" : "Notifications"],
            ["transcript", locale === "vi" ? "Bảng học tập" : "Transcript"],
            [
              "profile",
              locale === "vi" ? "Sở thích học" : "Learning preferences",
            ],
            ...(canAdmin ? [["admin", t.admin]] : []),
          ].map(([id, text]) => (
            <button
              key={id}
              aria-current={view===id?"page":undefined}
              disabled={busy}
              className={view === id ? "selected" : "ghost"}
              onClick={() => {
                clearLearning();
                setAssistantGroup(
                  (
                    {
                      admin: "content",
                      programs: "programs",
                      notifications: "assignments",
                      transcript: "reports",
                      profile: "people",
                    } as Record<string, ToolGroup>
                  )[id] ?? "learning",
                );
                setView(id);
              }}
            >
              {text}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <label>{translateUI("Interface language")}<select
              aria-label={translateUI("Interface language")}
              value={locale}
              onChange={(e) => {
                const v = e.target.value as "en" | "vi";
                setUILocale(v);
                setLocale(v);
              }}
            >
              <option value="en">{translateUI("English")}</option>
              <option value="vi">{translateUI("Tiếng Việt")}</option>
            </select>
          </label>
          <p>
            {session.principal.name}
            <br />
            <span className="muted">{role}</span>
          </p>
          <button
            className="ghost"
            onClick={() =>
              void run(async () => {
                await request("/api/logout", session, {});
                setSession(null);
                clearLearning();
              })
            }
          >
            {t.logout}
          </button>
        </div>
      </aside>
      <main id="learning-main" tabIndex={-1}>
        <header>
          <div>
            <p className="eyebrow">{translateUI("Your learning, at your pace")}</p>
            <h1 ref={contentHeading} tabIndex={-1}>
              {view === "catalog"
                ? "Make room for curiosity."
                : view === "learning"
                  ? "Build on what you know."
                  : "Help your team grow."}
            </h1>
          </div>
          <span className="badge">{translateUI("Synthetic demo · Originals only")}</span>
        </header>
        <p className="muted">{translateUI("Lime can discover and explain permitted lessons. Assessment answers and submissions stay with you.")}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {view === "catalog" && (
          <>
            <ProviderContent key={"provider:"+session.sessionEpoch} busy={busy} tick={tick} op={op} mutate={mutate} run={run} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>
            <Discovery key={"discovery:"+session.sessionEpoch} tick={tick} busy={busy} op={op} run={run}
              isCurrent={()=>sessionRef.current===session && docRef.current===doc}
              onChoose={id=>void run(async()=>setPreview(await op("learning_get_item",{courseId:id})))} />
            <CuratedContent key={"curated:"+session.sessionEpoch} tick={tick} busy={busy} op={op} mutate={mutate} run={run}
              isCurrent={()=>sessionRef.current===session && docRef.current===doc}
              onChoose={(kind,id)=>void run(async()=>{
                if(kind==="course") setPreview(await op("learning_get_item",{courseId:id}));
                else {clearLearning();setReadingItem(await op("learning_get_content_item",{itemId:id}));}
              })} />
            <form
              className="filters"
              onSubmit={(e) => {
                e.preventDefault();
                void refresh().catch((e) => {
                  if (sessionRef.current === session)
                    setError(e instanceof Error ? e.message : String(e));
                });
              }}
            >
              <label className="search">
                {t.search}
                <input
                  placeholder={translateUI("Try systems, learning, security…")}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setStandaloneOffset(0);
                    setCatalogOffset(0);
                  }}
                />
              </label>
              <label>{translateUI("Content language")}<select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="">{translateUI("All languages")}</option>
                  <option value="en">{translateUI("English")}</option>
                  <option value="vi">{translateUI("Tiếng Việt")}</option>
                </select>
              </label>
              <label>{translateUI("Time available")}<select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  <option value="">{translateUI("Any duration")}</option>
                  <option value="10">{translateUI("10 minutes")}</option>
                  <option value="20">{translateUI("20 minutes")}</option>
                </select>
              </label>
              <label>{translateUI("Topic")}<select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                >
                  <option value="">{translateUI("All topics")}</option>
                  <option>{translateUI("Distributed systems")}</option>
                  <option>{translateUI("Learning skills")}</option>
                  <option>{translateUI("Security")}</option>
                </select>
              </label>
              <button disabled={busy}>{translateUI("Search")}</button>
            </form>
            <div className="section-title">
              <h2>{translateUI("Explore the collection")}</h2>
              <span>{catalogTotal} courses</span>
            </div>
            <div className="cards">
              {items.map((c, i) => (
                <article key={c.id}>
                  <div className={"cover tone-" + (i % 3)}>
                    <span>{c.topic}</span>
                    <div>{["↗", "◈", "⌁"][i % 3]}</div>
                  </div>
                  <div className="card-body">
                    <p className="eyebrow">
                      {c.provider} · {c.language.toUpperCase()}
                    </p>
                    <h3>{c.title}</h3>
                    <p>{c.summary}</p>
                    <div className="meta">
                      {c.duration} min · {c.level} · Version {c.version}
                    </div>
                    <div className="actions">
                      <button
                        className="ghost"
                        onClick={() =>
                          void run(async () =>
                            setPreview(
                              await op("learning_get_item", { courseId: c.id }),
                            ),
                          )
                        }
                      >{translateUI("Preview")}</button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await mutate("learning_enroll", { courseId: c.id });
                            clearLearning();
                            setView("learning");
                          })
                        }
                      >
                        {t.enroll}
                      </button>
                      <button
                        className="ghost"
                        aria-label={"Save " + c.title}
                        onClick={() =>
                          void run(async () => {
                            const saved = !my.saved.some(
                              (b: any) => b.course_id === c.id,
                            );
                            await mutate("learning_set_bookmark", {
                              courseId: c.id,
                              saved,
                            });
                            setNotice(
                              saved ? "Course saved." : "Bookmark removed.",
                            );
                          })
                        }
                      >
                        {my.saved.some((b: any) => b.course_id === c.id)
                          ? "Saved ✓"
                          : t.saved}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="actions">
              <button
                className="ghost"
                disabled={catalogOffset === 0}
                onClick={() =>
                  setCatalogOffset(Math.max(0, catalogOffset - 20))
                }
              >{translateUI("Previous courses")}</button>
              <button
                className="ghost"
                disabled={catalogOffset + items.length >= catalogTotal}
                onClick={() => setCatalogOffset(catalogOffset + items.length)}
              >{translateUI("Next courses")}</button>
            </div>
            {items.length === 0 && (
              <p>{translateUI("No matching permitted content. Adjust your filters.")}</p>
            )}
          </>
        )}
        {view === "catalog" && (
          <section aria-label={translateUI("Standalone discovery")}>
            <h2>{translateUI("Standalone items")}</h2>
            <p className="muted">
              Reading an item does not create course progress. Search keywords
              apply to both catalogs; course filters apply to courses only.
            </p>
            {standalone.length === 0 && (
              <p>{translateUI("No published standalone items match.")}</p>
            )}
            {standalone.map((item) => (
              <section className="learning-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.summary} · {item.language} · {item.kind} · v
                    {item.version}
                  </p>
                </div>
                <button
                  onClick={() =>
                    void run(async () => {
                      const value = await op("learning_get_content_item", {
                        itemId: item.id,
                      });
                      if (sessionRef.current === session) setReadingItem(value);
                    })
                  }
                >{translateUI("Read item")}</button>
              </section>
            ))}
            <div className="actions">
              <button
                className="ghost"
                disabled={standaloneOffset === 0}
                onClick={() =>
                  setStandaloneOffset(Math.max(0, standaloneOffset - 20))
                }
              >{translateUI("Previous standalone")}</button>
              <button
                className="ghost"
                disabled={standaloneNext === null}
                onClick={() => setStandaloneOffset(standaloneNext!)}
              >{translateUI("Next standalone")}</button>
            </div>
          </section>
        )}
        {readingItem&&view==="catalog"&&!readingItem.itemEnrollmentId&&<LanguageVariants key={"variants:"+readingItem.id+":"+session.sessionEpoch} kind="item" sourceId={readingItem.id} busy={busy} op={op} isCurrent={()=>sessionRef.current===session&&docRef.current===doc} onChoose={id=>void run(async()=>{const value=await op("learning_get_content_item",{itemId:id});if(sessionRef.current===session)setReadingItem(value);})}/>}
        {readingItem &&
          (view === "catalog" ||
            (view === "learning" && readingItem.itemEnrollmentId)) && (
            <StandaloneReader
              key={
                session.sessionEpoch +
                readingItem.id +
                readingItem.version +
                (readingItem.itemEnrollmentId ?? "untracked")
              }
              session={session}
              item={readingItem}
              busy={busy}
              onClose={() => setReadingItem(null)}
              onTrack={() =>
                void run(async () => {
                  const enrolled = await mutate("learning_enroll_item", {
                    itemId: readingItem.id,
                    version: readingItem.version,
                  });
                  const value = await op("learning_get_item_enrollment", {
                    itemEnrollmentId: enrolled.itemEnrollmentId,
                  });
                  if (sessionRef.current === session)
                    setReadingItem({
                      ...value.item,
                      itemEnrollmentId: enrolled.itemEnrollmentId,
                      status: value.status,
                    });
                })
              }
              onComplete={() =>
                void run(async () => {
                  await mutate("human_complete_item", {
                    itemEnrollmentId: readingItem.itemEnrollmentId,
                    confirmed: true,
                  });
                  const value = await op("learning_get_item_enrollment", {
                    itemEnrollmentId: readingItem.itemEnrollmentId,
                  });
                  if (sessionRef.current === session)
                    setReadingItem({
                      ...value.item,
                      itemEnrollmentId: readingItem.itemEnrollmentId,
                      status: value.status,
                    });
                })
              }
            />
          )}
        {preview && (
          <section className="panel" aria-label={translateUI("Course preview")}>
            <h2>{preview.title}</h2>
            <LanguageVariants key={"variants:"+preview.id+":"+session.sessionEpoch} kind="course" sourceId={preview.id} busy={busy} op={op} isCurrent={()=>sessionRef.current===session&&docRef.current===doc} onChoose={id=>void run(async()=>{const value=await op("learning_get_item",{courseId:id});if(sessionRef.current===session)setPreview(value);})}/>
            <CourseRatings
              key={session.sessionEpoch + preview.id + preview.version}
              courseId={preview.id}
              version={preview.version}
              op={op}
            />
            <p>{preview.summary}</p>
            <ul>
              {preview.lessons.map((l: any) => (
                <li key={l.id}>{l.title}</li>
              ))}
            </ul>
            <p>
              {preview.quiz.questionCount} questions · Pass score{" "}
              {preview.quiz.passScore}% · {preview.quiz.unlimitedAttempts?translateUI("Unlimited quiz attempts"):preview.quiz.maxAttempts+" "+translateUI("attempts")}
            </p>
            <p>{translateUI("Completion requires your lesson acknowledgement and a passing backend-graded quiz.")}{" "}
              {preview.aiProcessingAllowed
                ? "Lesson text may be shared with Lime after host consent."
                : "Lesson text is withheld from Lime: model processing is not permitted."}
            </p>
            <button className="ghost" onClick={() => setPreview(null)}>{translateUI("Close preview")}</button>
          </section>
        )}
        {view==="packages"&&<PackageLearning key={"packages:"+session.sessionEpoch} session={session} busy={busy} run={run} tick={tick} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
        {view === "learning" && (
          <>
            <OwnInsights key={"insights:"+session.sessionEpoch} busy={busy} op={op} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>
            <LearningDigest key={"digest:"+session.sessionEpoch} busy={busy} op={op} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>
            <DigestSubscriptions key={"scheduled-digest:"+session.sessionEpoch} busy={busy} tick={tick} op={op} mutate={mutate} run={run} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>
            <ExternalActivity key={"external:"+session.sessionEpoch} session={session} busy={busy} tick={tick} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>
            <div className="stats">
              <div>
                <strong>
                  {
                    my.enrollments.filter((e: any) => e.status !== "completed")
                      .length
                  }
                </strong>
                <span>{translateUI("In progress")}</span>
              </div>
              <div>
                <strong>
                  {my.enrollments.filter((e: any) => e.overdue).length}
                </strong>
                <span>{translateUI("Overdue")}</span>
              </div>
              <div>
                <strong>
                  {
                    my.enrollments.filter((e: any) => e.status === "completed")
                      .length
                  }
                </strong>
                <span>{translateUI("Completed")}</span>
              </div>
              <div>
                <strong>{my.saved.length}</strong>
                <span>{translateUI("Saved")}</span>
              </div>
            </div>
            <StandaloneLearning
              key={"items:" + session.sessionEpoch}
              tick={tick}
              busy={busy}
              op={op}
              run={run}
              onRead={(value) => {
                if (sessionRef.current === session) {
                  clearLearning();
                  setReadingItem(value);
                }
              }}
            />
            <h2>{translateUI("Your next steps")}</h2>
            <p className="muted">
              Showing up to 20 enrollments. Counts above are for this page;
              saved lists are bounded.
            </p>
            {my.enrollments.length === 0 && (
              <p>{translateUI("Choose a course from Explore to begin.")}</p>
            )}
            {my.enrollments.map((e: any) => (
              <section key={e.id} className="learning-row">
                <div>
                  <span className="eyebrow">
                    {e.assigned_by ? "Assigned" : "Self-directed"} · Version{" "}
                    {e.version}
                    {e.assignment_cycle_id ? " · Scheduled cycle" : ""}
                  </span>
                  <h3>{e.course.title}</h3>
                  {e.retake_of&&<p>{translateUI("Fresh course retake")} · {e.retake_of}</p>}
                  {e.status==="completed"&&<CourseRetake key={"retake:"+session.sessionEpoch+e.id} enrollmentId={e.id} busy={busy} op={op} mutate={mutate} run={run} isCurrent={()=>sessionRef.current===session&&docRef.current===doc} onCreated={clearLearning}/>}
                  {e.status === "completed" && (
                    <CourseFeedback
                      key={session.sessionEpoch + e.id}
                      enrollmentId={e.id}
                      ops={{ op, mutate, run, busy }}
                    />
                  )}
                  <p>
                    {e.completed_lessons.length}/{e.course.lessons.length}{" "}
                    lessons ·{" "}
                    {e.assignment_state !== "active"
                      ? e.assignment_state
                      : e.status === "completed"
                        ? "Completed"
                        : e.overdue
                          ? "Overdue"
                          : "In progress"}
                    {e.due_date
                      ? " · Due " + new Date(e.due_date).toLocaleString()
                      : ""}
                  </p>
                </div>
                <div className="actions">
                  <button
                    onClick={() =>
                      void run(async () => {
                        const next =
                          e.course.lessons.find(
                            (l: any) => !e.completed_lessons.includes(l.id),
                          ) ?? e.course.lessons[0];
                        await openLesson(e, next.id);
                      })
                    }
                  >
                    {t.continue}
                  </button>
                  {e.certificateId && (
                    <button
                      className="ghost"
                      onClick={() =>
                        void run(async () =>
                          setCertificate(
                            await request(
                              "/api/certificates/" + e.certificateId,
                              session,
                            ),
                          ),
                        )
                      }
                    >{translateUI("Certificate")}</button>
                  )}
                </div>
              </section>
            ))}
            <div className="actions">
              <button
                className="ghost"
                disabled={learningOffset === 0}
                onClick={() => {
                  clearLearning();
                  setLearningOffset(Math.max(0, learningOffset - 20));
                }}
              >{translateUI("Previous learning")}</button>
              <button
                className="ghost"
                disabled={my.nextOffset == null}
                onClick={() => {
                  clearLearning();
                  setLearningOffset(my.nextOffset);
                }}
              >{translateUI("Next learning")}</button>
            </div>
            {active && (
              <section className="panel">
                <h2>{active.course.title}</h2>
                <StudyTimer key={session.sessionEpoch+active.id} session={session} kind="course" targetId={active.id} busy={busy} />
                <nav className="lesson-nav">
                  {active.course.modules?.map((m: any) => (
                    <span className="badge" key={m.id}>
                      {m.title}
                    </span>
                  ))}
                  {active.course.lessons.map((l: any) => (
                    <button
                      className="ghost"
                      key={l.id}
                      onClick={() =>
                        void run(async () =>
                          openLesson(
                            my.enrollments.find(
                              (e: any) => e.id === active.id,
                            ) ?? active,
                            l.id,
                          ),
                        )
                      }
                    >
                      {l.title}
                    </button>
                  ))}
                </nav>
                {lesson && (
                  <>
                    <h3>{lesson.title}</h3>
                    <p className="lesson-text">{lesson.text}</p>
                    <UploadedMedia
                      key={"media:" + active.id + ":" + lesson.id}
                      session={session}
                      content={lesson}
                      context={{ enrollmentId: active.id, lessonId: lesson.id }}
                    />
                    {lesson.kind === "video" && !lesson.assetId && (
                      <video src={lesson.url} controls preload="metadata" />
                    )}
                    {lesson.url && (
                      <p>
                        <a href={lesson.url} target="_blank" rel="noreferrer">{translateUI("Open learning resource")}</a>
                      </p>
                    )}
                    {lesson.transcript && (
                      <details>
                        <summary>{translateUI("Transcript")}</summary>
                        <p>{lesson.transcript}</p>
                      </details>
                    )}
                    {["submission", "event"].includes(lesson.kind) && (
                      <BlendedPlayer
                        key={"blended:" + active.id + ":" + lesson.id}
                        session={session}
                        enrollmentId={active.id}
                        lesson={lesson}
                        busy={busy}
                        tick={tick}
                        op={op}
                        mutate={mutate}
                        run={run}
                      />
                    )}
                    <p className="muted">
                      {["submission", "event"].includes(lesson.kind)
                        ? "Completion policy: authorized human review or attendance, followed by a passing quiz."
                        : "Completion policy: personal acknowledgement plus a passing quiz."}
                    </p>
                    <button
                      disabled={
                        busy ||
                        lesson.completed ||
                        ["submission", "event"].includes(lesson.kind) ||
                        active.assignment_state !== "active"
                      }
                      onClick={() =>
                        void run(async () => {
                          await mutate("human_complete_lesson", {
                            enrollmentId: active.id,
                            lessonId: lesson.id,
                          });
                          setLesson({ ...lesson, completed: true });
                        })
                      }
                    >
                      {lesson.completed ? "Lesson acknowledged ✓" : t.complete}
                    </button>
                  </>
                )}
                <button
                  className="ghost"
                  disabled={
                    busy ||
                    active.assignment_state !== "active" ||
                    active.course.lessons.some(
                      (l: any) => !active.completed_lessons.includes(l.id),
                    )
                  }
                  onClick={() =>
                    void run(async () => {
                      const r = await mutate("learning_start_attempt", {
                        enrollmentId: active.id,
                      });
                      setAttempt(
                        await op("learning_get_attempt", {
                          attemptId: r.attemptId,
                        }),
                      );
                      setLesson(null);
                    })
                  }
                >
                  {t.quiz}
                </button>
                {attempt && (
                  <div>
                    <h3>{translateUI("Assessment · Attempt")}{" "}{attempt.number}</h3>
                    {attempt.carriedQuestionCount>0&&<p>{attempt.carriedQuestionCount} · {translateUI("Earlier correct responses are retained unchanged; complete the remaining questions and explicitly submit this new attempt.")}</p>}
                    {attempt.questions.map((q: any) => (
                      <React.Fragment key={attempt.id+q.id}><PreviousResponse q={q} previous={attempt.previousResponses}/><AssessmentQuestion
                        key={attempt.id + q.id}
                        q={q}
                        answer={attempt.answers[q.id]}
                        disabled={
                          attempt.submitted ||
                          busy ||
                          active.assignment_state !== "active"
                        }
                        save={(answer) => {
                          const previous = attempt;
                          setAttempt({
                            ...previous,
                            answers: { ...previous.answers, [q.id]: answer },
                          });
                          void run(async () => {
                            try {
                              await mutate("human_save_answer", {
                                attemptId: attempt.id,
                                questionId: q.id,
                                answer,
                              });
                              setAttempt(await op("learning_get_attempt",{attemptId:attempt.id}));
                            } catch (e) {
                              setAttempt(previous);
                              throw e;
                            }
                          });
                        }}
                      />
                      {attempt.questionChecks?.find((entry:any)=>entry.questionId===q.id)?.checkable&&<div>
                       <p>{translateUI("Question checks do not submit, grade or complete learning. Essays need final human assessment.")}</p>
                       <button disabled={busy||active.assignment_state!=="active"||!completeResponse(q,attempt.answers[q.id])||!attempt.questionChecks.find((entry:any)=>entry.questionId===q.id)?.fingerprint} onClick={()=>void run(async()=>{const state=attempt.questionChecks.find((entry:any)=>entry.questionId===q.id);await mutate("human_check_question",{attemptId:attempt.id,questionId:q.id,fingerprint:state.fingerprint});setAttempt(await op("learning_get_attempt",{attemptId:attempt.id}));})}>{translateUI("Check saved response")}</button>
                       {attempt.questionChecks.find((entry:any)=>entry.questionId===q.id)?.checked&&<p role="status">{translateUI(attempt.questionChecks.find((entry:any)=>entry.questionId===q.id).correct?"Checked correct":"Try another response")}</p>}
                      </div>}</React.Fragment>
                    ))}
                    {attempt.questionResults?.length>0&&<ul aria-label={translateUI("Released question results")}>{attempt.questionResults.map((result:any)=><li key={result.questionId}>{result.questionId} · {result.scorePercent}% · {translateUI(result.correct?"Correct":"Incorrect")}</li>)}</ul>}
                    {attempt.feedback?.length > 0 && (
                      <details>
                        <summary>{translateUI("Released answer feedback")}</summary>
                        {attempt.feedback.map((f: any) => (
                          <p key={f.questionId}>
                            {f.questionId}:{" "}
                            {f.optionFeedback?.filter((entry:any)=>entry.message).map((entry:any)=><span key={entry.optionIndex}>{entry.message}{" · "}</span>)}
                            {f.correctIndices?.map((index:number)=>f.options[index]).join(" · ") ?? f.correctAnswers?.join(" · ") ??
                              (f.matches
                                ? f.matches
                                    .map((i: number) => f.options[i])
                                    .join(" · ")
                                : f.options[f.correct])}
                          </p>
                        ))}
                      </details>
                    )}
                    {attempt.resultMessage&&<p className="notice">{attempt.resultMessage}</p>}
                    {attempt.submitted ? (
                      <p role="status">
                        {attempt.gradingState === "pending_manual" ? (
                          "Awaiting human assessment. No official score or certificate yet."
                        ) : (
                          <>
                            Score: {attempt.score}% ·{" "}
                            {attempt.passed
                              ? "Passed. Completion committed."
                              : "Not passed."}
                          </>
                        )}
                      </p>
                    ) : (
                      <button
                        disabled={
                          busy ||
                          active.assignment_state !== "active" ||
                          attempt.canSubmit===false ||
                          attempt.questions.some(
                            (q: any) =>
                              !completeResponse(q, attempt.answers[q.id]),
                          )
                        }
                        onClick={() =>
                          void run(async () => {
                            const r = await mutate("human_submit_attempt", {
                              attemptId: attempt.id,
                              confirmed: true,
                            });
                            setAttempt(
                              await op("learning_get_attempt", {
                                attemptId: attempt.id,
                              }),
                            );
                          })
                        }
                      >
                        {t.submit}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            {certificate && (
              <Certificate
                key={session.sessionEpoch + certificate.id}
                certificate={certificate}
              />
            )}
          </>
        )}
        {view==="admin"&&role==="admin"&&<ProviderConnections key={"provider-review:"+session.sessionEpoch} busy={busy} tick={tick} op={op} mutate={mutate} run={run} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
        {view==="admin"&&role==="admin"&&<PortalSettings key={"portal:"+session.sessionEpoch} value={portal.branding} version={portal.version} busy={busy} mutate={mutate} run={run} isCurrent={()=>sessionRef.current===session&&docRef.current===doc} onSaved={branding=>setPortal(previous=>({...previous,branding}))}/>}
        {view==="admin"&&role==="admin"&&<IdentityLinks key={session.sessionEpoch} session={session} busy={busy} run={run} tick={tick} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
        {view==="admin"&&role==="admin"&&<ProvisioningClients key={"provisioning:"+session.sessionEpoch} session={session} busy={busy} run={run} tick={tick} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
        {view==="admin"&&canEdit&&<PackageLearning author key={"package-admin:"+session.sessionEpoch} session={session} busy={busy} run={run} tick={tick} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
        {view==="admin"&&canEdit&&<TranslationSettings key={"translations:"+session.sessionEpoch} session={session} busy={busy} run={run} tick={tick} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
        {view==="admin"&&role==="admin"&&<WebhookSettings key={"webhooks:"+session.sessionEpoch} session={session} busy={busy} run={run} tick={tick} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
        {view === "admin" && canEdit && (
          <CurationPanel key={"curation:"+session.sessionEpoch} tick={tick} busy={busy} op={op} mutate={mutate} run={run}
            isCurrent={()=>sessionRef.current===session && docRef.current===doc} />
        )}
        {view === "admin" && role === "admin" && (
          <FeedbackReview
            key={"feedback:" + session.sessionEpoch}
            ops={{ op, mutate, run, busy }}
          />
        )}
        {view === "admin" &&
          ["admin", "content_admin", "assessor"].includes(role) && (
            <>
              {canEdit&&<QuestionBanks key={"question-banks:"+session.sessionEpoch} busy={busy} tick={tick} op={op} mutate={mutate} run={run} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
              <SessionManagement key={"session-management:"+session.sessionEpoch} busy={busy} tick={tick} op={op} mutate={mutate} run={run} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>
              {["admin", "assessor"].includes(role) && (
                <BlendedReviews
                  key={"blended:" + session.sessionEpoch + view}
                  session={session}
                  busy={busy}
                  tick={tick}
                  op={op}
                  mutate={mutate}
                  run={run}
                />
              )}
              <Assessments
                key={"assessments:" + session.sessionEpoch + view}
                role={role}
                tick={tick}
                busy={busy}
                op={op}
                mutate={mutate}
                run={run}
              />
            </>
          )}
        {(view === "transcript" ||
          (view === "admin" && ["admin", "manager"].includes(role))) && (
          <Reports
            key={"reports:" + session.sessionEpoch + view}
            administrative={view === "admin"}
            tick={tick}
            busy={busy}
            op={op}
            mutate={mutate}
            run={run}
            isCurrent={() =>
              sessionRef.current === session && docRef.current === doc
            }
          />
        )}
        {view==="notifications"&&<SessionNotices key={"session-notices:"+session.sessionEpoch} busy={busy} tick={tick} op={op} mutate={mutate} run={run} isCurrent={()=>sessionRef.current===session&&docRef.current===doc}/>}
        {(view === "notifications" ||
          (view === "admin" && ["admin", "manager"].includes(role))) && (
          <Assignments
            key={"assignments:" + session.sessionEpoch + view}
            role={role}
            administrative={view === "admin"}
            tick={tick}
            busy={busy}
            op={op}
            mutate={mutate}
            run={run}
          />
        )}
        {(view === "profile" ||
          (view === "admin" && ["admin", "manager"].includes(role))) && (
          <People
            key={"people:" + session.sessionEpoch + view}
            role={role}
            administrative={view === "admin"}
            tick={tick}
            busy={busy}
            op={op}
            mutate={mutate}
            saveProfile={(args) =>
              mutate("learning_save_profile", args, personal(session))
            }
            run={run}
          />
        )}
        {["programs", "admin"].includes(view) && (
          <Programs
            session={session}
            key={"programs:" + session.sessionEpoch + view}
            role={role}
            administrative={view === "admin"}
            tick={tick}
            busy={busy}
            op={op}
            mutate={mutate}
            run={run}
            studyCourse={() => {
              clearLearning();
              setLearningOffset(0);
              setView("learning");
            }}
            certificate={(id) =>
              request(
                "/api/award-certificates/" + encodeURIComponent(id),
                session,
              )
            }
          />
        )}
        {view === "admin" && (
          <>
            {canEdit && (
              <>
                <h2>{translateUI("Course library")}</h2>
                <div className="admin-courses">
                  {drafts.map((d) => (
                    <section className="learning-row" key={d.id}>
                      <div>
                        <h3>{d.draft.title}</h3>
                        <p>
                          {d.state} · Published version {d.latest_version}
                        </p>
                      </div>
                      <div className="actions">
                        <button
                          className="ghost"
                          disabled={busy}
                          onClick={() => void run(async () => {
                            const latest=await op("learning_get_course_draft",{courseId:d.id});
                            if(sessionRef.current!==session||docRef.current!==doc)return;
                            setEditing({id:d.id,course:structuredClone(latest.draft),exists:true});
                            setEditorKey((n) => n + 1);
                          })}
                        >{translateUI("Edit draft")}</button>
                        <button
                          onClick={() =>
                            void run(async () => {
                              await mutate("learning_publish_course", {
                                courseId: d.id,
                              });
                              setNotice(
                                "New version published. Existing enrollments keep their original version.",
                              );
                            })
                          }
                        >{translateUI("Publish")}</button>
                        <button className="ghost" disabled={busy || d.state !== "published"} onClick={() => void run(async () => {
                          await mutate("learning_unpublish_course", {courseId:d.id});
                          setNotice("Unpublished. Existing learning history preserved.");
                        })}>{translateUI("Unpublish")}</button>
                        <button
                          className="ghost"
                          onClick={() =>
                            void run(async () => {
                              await mutate("learning_retire_course", {
                                courseId: d.id,
                              });
                              setNotice(
                                "Retired. Existing learning history preserved.",
                              );
                            })
                          }
                        >{translateUI("Retire")}</button>
                      </div>
                    </section>
                  ))}
                </div>
                <div className="actions">
                  <button
                    className="ghost"
                    disabled={draftOffset === 0 || busy}
                    onClick={() =>
                      setDraftOffset(Math.max(0, draftOffset - 20))
                    }
                  >{translateUI("Previous courses")}</button>
                  <button
                    className="ghost"
                    disabled={draftNext === null || busy}
                    onClick={() => setDraftOffset(draftNext!)}
                  >{translateUI("Next courses")}</button>
                </div>
                <CourseEditor
                  key={String(editorKey) + ":" + session.sessionEpoch}
                  selection={
                    editing ?? { id: "", course: newCourse(), exists: false }
                  }
                  reusableItems={contentDrafts}
                  busy={busy}
                  onNew={() => {
                    setEditing(null);
                    setEditorKey((n) => n + 1);
                  }}
                  onSave={(courseId, course, exists) =>
                    void run(async () => {
                      await mutate(
                        exists
                          ? "learning_update_course"
                          : "learning_create_course",
                        { courseId, course },
                      );
                      const saved = await op("learning_get_course_draft", {
                        courseId,
                      });
                      if (sessionRef.current !== session) return;
                      setEditing({
                        id: courseId,
                        course: saved.draft,
                        exists: true,
                      });
                      setEditorKey((n) => n + 1);
                      setNotice("Draft saved. Publish when ready.");
                    })
                  }
                />
                <ContentLibrary
                  session={session}
                  key={session.sessionEpoch}
                  items={contentDrafts}
                  busy={busy}
                  offset={contentOffset}
                  nextOffset={contentNext}
                  onPage={setContentOffset}
                  onSave={(itemId, item, exists) =>
                    run(async () => {
                      await mutate(
                        exists
                          ? "learning_update_content_item"
                          : "learning_create_content_item",
                        { itemId, item },
                      );
                      setNotice(
                        "Item draft saved. Publish to make it reusable.",
                      );
                    })
                  }
                  onAction={(name, itemId) =>
                    void run(async () => {
                      await mutate(name, { itemId });
                      setNotice(
                        name === "learning_publish_content_item"
                          ? "Item version published."
                          : name === "learning_unpublish_content_item" ? "Item unpublished. Existing learning history preserved." : "Item retired. Existing course snapshots preserved.",
                      );
                    })
                  }
                />
              </>
            )}
            {["admin", "manager"].includes(role) && (
              <>
                <section className="panel">
                  <h2>{translateUI("Assign learning")}</h2>
                  <form
                    className="filters"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await mutate("learning_assign", {
                          courseId: selectedCourse,
                          learnerId: learner,
                          dueDate: due ? new Date(due).toISOString() : null,
                        });
                        setNotice(
                          "Assignment committed. Duplicate enrollments retain their original version and due date.",
                        );
                      });
                    }}
                  >
                    <label>{translateUI("Course")}<select
                        aria-label={translateUI("Course")}
                        value={selectedCourse}
                        onChange={(e) => setSelectedCourse(e.target.value)}
                      >
                        {items.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>{translateUI("Learner")}<select
                        aria-label={translateUI("Learner")}
                        value={learner}
                        onChange={(e) => setLearner(e.target.value)}
                      >
                        {audience.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>{translateUI("Due date · your local time")}<input
                        type="datetime-local"
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>{translateUI("Assign course")}</button>
                  </form>
                </section>
                <h2>{translateUI("Learning report")}</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{translateUI("Learner")}</th>
                        <th>{translateUI("Course")}</th>
                        <th>{translateUI("Version")}</th>
                        <th>{translateUI("Status")}</th>
                        <th>{translateUI("Lessons")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.map((r) => (
                        <tr key={r.id}>
                          <td>{r.learnerName}</td>
                          <td>{r.course_id}</td>
                          <td>{r.version}</td>
                          <td>{r.overdue ? "Overdue" : r.status}</td>
                          <td>{r.completed_lessons.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted">{translateUI("Server-enforced")}{" "}
                  {role === "manager" ? "direct-report" : "organization"} scope.
                  First 50 records.
                </p>
              </>
            )}
          </>
        )}
        <footer>{translateUI("Pear · A deterministic learning app, with an optional Lime assistant.")}</footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
