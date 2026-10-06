import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBridge, invoke, request, type Session } from "./api.ts";
import type { Course } from "../shared/model.ts";
import "./style.css";
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
  const [session, setSessionState] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [view, setView] = useState("catalog"),
    [locale, setLocale] = useState<"en" | "vi">("en"),
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
  const [editing, setEditing] = useState<string | null>(null),
    [form, setForm] = useState({
      id: "",
      title: "",
      summary: "",
      lesson: "",
      question: "",
      option0: "",
      option1: "",
      correct: 1,
    });
  const sessionRef = useRef<Session | null>(null);
  const refreshGeneration = useRef(0);
  const setSession = (next: Session | null) => {
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
    setCatalogOffset(0);
    setLearningOffset(0);
    setDraftOffset(0);
  };
  const t = labels[locale],
    doc = session
      ? view === "admin"
        ? `library:${session.principal.tenant}`
        : personal(session)
      : "";
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    return (await invoke(session, documentId, name, args, write)).data as any;
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
    setDrafts(draftRows);
    setReport(reportRows);
    setAudience(users);
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
  const openLesson = async (e: any, id: string) => {
    const r = await op(
      "learning_get_lesson",
      { enrollmentId: e.id, lessonId: id },
      false,
      personal(session!),
    );
    if (sessionRef.current !== session) return;
    setActive(e);
    setLesson(r);
    setAttempt(null);
    setPreview(null);
  };
  const clearLearning = () => {
    setActive(null);
    setLesson(null);
    setAttempt(null);
    setCertificate(null);
    setPreview(null);
  };
  if (!ready) return <main>Loading Pear…</main>;
  if (!session)
    return (
      <main className="signin">
        <div className="brand">◒ pear</div>
        <p className="eyebrow">A little progress, every day</p>
        <h1>
          Your next
          <br />
          learning chapter.
        </h1>
        <p className="muted">
          Self-authored courses. Real progress. An assistant through Lime when
          you choose.
        </p>
        <form
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
          <label>
            Account
            <input
              name="username"
              defaultValue="learner-a"
              required
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              defaultValue="learner-a-dev"
              required
              autoComplete="current-password"
            />
          </label>
          <button disabled={busy}>{t.login}</button>
        </form>
        <p className="dev">
          Synthetic development portal. Accounts: learner-a, learner-b, manager,
          admin, editor, assessor. Password: account name + “-dev”. Production
          identity is not configured.
        </p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const role = session.principal.role,
    canAdmin = ["admin", "manager", "content_admin"].includes(role),
    canEdit = ["admin", "content_admin"].includes(role);
  return (
    <div className="shell">
      <aside>
        <div className="brand">◒ pear</div>
        <p className="eyebrow">Learning workspace</p>
        <nav>
          {[
            ["catalog", t.catalog],
            ["learning", t.learning],
            ...(canAdmin ? [["admin", t.admin]] : []),
          ].map(([id, text]) => (
            <button
              key={id}
              className={view === id ? "selected" : "ghost"}
              onClick={() => {
                clearLearning();
                setView(id);
              }}
            >
              {text}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <label>
            Interface language
            <select
              value={locale}
              onChange={(e) => {
                const v = e.target.value as "en" | "vi";
                setLocale(v);
                document.documentElement.lang = v;
              }}
            >
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
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
      <main>
        <header>
          <div>
            <p className="eyebrow">Your learning, at your pace</p>
            <h1>
              {view === "catalog"
                ? "Make room for curiosity."
                : view === "learning"
                  ? "Build on what you know."
                  : "Help your team grow."}
            </h1>
          </div>
          <span className="badge">Synthetic demo · Originals only</span>
        </header>
        <p className="muted">
          Lime can discover and explain permitted lessons. Assessment answers
          and submissions stay with you.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {view === "catalog" && (
          <>
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
                  placeholder="Try systems, learning, security…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Content language
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="">All languages</option>
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                </select>
              </label>
              <label>
                Time available
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  <option value="">Any duration</option>
                  <option value="10">10 minutes</option>
                  <option value="20">20 minutes</option>
                </select>
              </label>
              <label>
                Topic
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                >
                  <option value="">All topics</option>
                  <option>Distributed systems</option>
                  <option>Learning skills</option>
                  <option>Security</option>
                </select>
              </label>
              <button disabled={busy}>Search</button>
            </form>
            <div className="section-title">
              <h2>Explore the collection</h2>
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
                      >
                        Preview
                      </button>
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
              >
                Previous courses
              </button>
              <button
                className="ghost"
                disabled={catalogOffset + items.length >= catalogTotal}
                onClick={() => setCatalogOffset(catalogOffset + items.length)}
              >
                Next courses
              </button>
            </div>
            {items.length === 0 && (
              <p>No matching permitted content. Adjust your filters.</p>
            )}
          </>
        )}
        {preview && (
          <section className="panel" aria-label="Course preview">
            <h2>{preview.title}</h2>
            <p>{preview.summary}</p>
            <ul>
              {preview.lessons.map((l: any) => (
                <li key={l.id}>{l.title}</li>
              ))}
            </ul>
            <p>
              {preview.quiz.questionCount} questions · Pass score{" "}
              {preview.quiz.passScore}% · {preview.quiz.maxAttempts} attempts
            </p>
            <p>
              Completion requires your lesson acknowledgement and a passing
              backend-graded quiz.{" "}
              {preview.aiProcessingAllowed
                ? "Lesson text may be shared with Lime after host consent."
                : "Lesson text is withheld from Lime: model processing is not permitted."}
            </p>
            <button className="ghost" onClick={() => setPreview(null)}>
              Close preview
            </button>
          </section>
        )}
        {view === "learning" && (
          <>
            <div className="stats">
              <div>
                <strong>
                  {
                    my.enrollments.filter((e: any) => e.status !== "completed")
                      .length
                  }
                </strong>
                <span>In progress</span>
              </div>
              <div>
                <strong>
                  {my.enrollments.filter((e: any) => e.overdue).length}
                </strong>
                <span>Overdue</span>
              </div>
              <div>
                <strong>
                  {
                    my.enrollments.filter((e: any) => e.status === "completed")
                      .length
                  }
                </strong>
                <span>Completed</span>
              </div>
              <div>
                <strong>{my.saved.length}</strong>
                <span>Saved</span>
              </div>
            </div>
            <h2>Your next steps</h2>
            <p className="muted">
              Showing up to 20 enrollments. Counts above are for this page;
              saved lists are bounded.
            </p>
            {my.enrollments.length === 0 && (
              <p>Choose a course from Explore to begin.</p>
            )}
            {my.enrollments.map((e: any) => (
              <section key={e.id} className="learning-row">
                <div>
                  <span className="eyebrow">
                    {e.assigned_by ? "Assigned" : "Self-directed"} · Version{" "}
                    {e.version}
                  </span>
                  <h3>{e.course.title}</h3>
                  <p>
                    {e.completed_lessons.length}/{e.course.lessons.length}{" "}
                    lessons ·{" "}
                    {e.status === "completed"
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
                    >
                      Certificate
                    </button>
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
              >
                Previous learning
              </button>
              <button
                className="ghost"
                disabled={my.nextOffset == null}
                onClick={() => {
                  clearLearning();
                  setLearningOffset(my.nextOffset);
                }}
              >
                Next learning
              </button>
            </div>
            {active && (
              <section className="panel">
                <h2>{active.course.title}</h2>
                <nav className="lesson-nav">
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
                    {lesson.kind === "video" && (
                      <video src={lesson.url} controls preload="metadata" />
                    )}
                    {lesson.url && (
                      <p>
                        <a href={lesson.url} target="_blank" rel="noreferrer">
                          Open learning resource
                        </a>
                      </p>
                    )}
                    {lesson.transcript && (
                      <details>
                        <summary>Transcript</summary>
                        <p>{lesson.transcript}</p>
                      </details>
                    )}
                    <p className="muted">
                      Completion policy: personal acknowledgement plus a passing
                      quiz.
                    </p>
                    <button
                      disabled={busy || lesson.completed}
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
                  disabled={busy}
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
                    <h3>Assessment · Attempt {attempt.number}</h3>
                    {attempt.questions.map((q: any) => (
                      <fieldset key={q.id} disabled={attempt.submitted || busy}>
                        <legend>{q.prompt}</legend>
                        {q.options.map((o: string, i: number) => (
                          <label className="choice" key={i}>
                            <input
                              type="radio"
                              name={q.id}
                              checked={attempt.answers[q.id] === i}
                              onChange={() => {
                                const previous = attempt;
                                setAttempt({
                                  ...attempt,
                                  answers: { ...attempt.answers, [q.id]: i },
                                });
                                void run(async () => {
                                  try {
                                    await mutate("human_save_answer", {
                                      attemptId: attempt.id,
                                      questionId: q.id,
                                      answer: i,
                                    });
                                  } catch (e) {
                                    setAttempt(previous);
                                    throw e;
                                  }
                                });
                              }}
                            />
                            {o}
                          </label>
                        ))}
                      </fieldset>
                    ))}
                    {attempt.submitted ? (
                      <p role="status">
                        Score: {attempt.score}% ·{" "}
                        {attempt.passed
                          ? "Passed. Completion committed."
                          : "Not passed."}
                      </p>
                    ) : (
                      <button
                        disabled={
                          busy ||
                          attempt.questions.some(
                            (q: any) => attempt.answers[q.id] === undefined,
                          )
                        }
                        onClick={() =>
                          void run(async () => {
                            const r = await mutate("human_submit_attempt", {
                              attemptId: attempt.id,
                              confirmed: true,
                            });
                            setAttempt({
                              ...attempt,
                              submitted: true,
                              score: r.score,
                              passed: r.passed,
                            });
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
              <section className="panel">
                <h2>Completion certificate</h2>
                <p>
                  {certificate.learnerName} completed {certificate.title},
                  version {certificate.version}.
                </p>
                <p>
                  {new Date(certificate.issued_at).toLocaleString()} ·{" "}
                  {certificate.issuer}
                </p>
                <p>
                  Self-authored development content. This certificate is not
                  accredited.
                </p>
                <a
                  download={"pear-certificate-" + certificate.id + ".txt"}
                  href={
                    "data:text/plain;charset=utf-8," +
                    encodeURIComponent(
                      `Pear completion certificate\n${certificate.learnerName}\n${certificate.title}\nVersion ${certificate.version}\nIssued ${certificate.issued_at}\nID ${certificate.id}\nIssuer ${certificate.issuer}\nNot accredited`,
                    )
                  }
                >
                  Download certificate
                </a>
              </section>
            )}
          </>
        )}
        {view === "admin" && (
          <>
            {canEdit && (
              <>
                <h2>Course library</h2>
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
                          onClick={() => {
                            setEditing(d.id);
                            setForm({
                              id: d.id,
                              title: d.draft.title,
                              summary: d.draft.summary,
                              lesson: d.draft.lessons[0].text,
                              question: d.draft.quiz.questions[0].prompt,
                              option0: d.draft.quiz.questions[0].options[0],
                              option1: d.draft.quiz.questions[0].options[1],
                              correct: d.draft.quiz.questions[0].correct,
                            });
                          }}
                        >
                          Edit draft
                        </button>
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
                        >
                          Publish
                        </button>
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
                        >
                          Retire
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
                <section className="panel">
                  <h2>
                    {editing ? "Edit course draft" : "Create course draft"}
                  </h2>
                  <form
                    className="editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const base = editing
                          ? (structuredClone(
                              drafts.find((d) => d.id === editing).draft,
                            ) as Course)
                          : null;
                        const c: Course = base ?? {
                          title: "",
                          summary: "",
                          topic: "Learning skills",
                          language: "en",
                          duration: 10,
                          level: "beginner",
                          provider: "Pear Originals",
                          license: "self-authored",
                          aiProcessingAllowed: true,
                          completionPolicy: "human_attestation_and_quiz",
                          lessons: [
                            {
                              id: "lesson-1",
                              title: "Introduction",
                              text: "",
                              kind: "text",
                              prerequisiteIds: [],
                            },
                          ],
                          quiz: {
                            passScore: 100,
                            maxAttempts: 2,
                            questions: [
                              {
                                id: "question-1",
                                prompt: "",
                                options: ["", ""],
                                correct: 1,
                              },
                            ],
                          },
                        };
                        c.title = form.title;
                        c.summary = form.summary;
                        c.lessons[0].text = form.lesson;
                        c.quiz.questions[0].prompt = form.question;
                        c.quiz.questions[0].options[0] = form.option0;
                        c.quiz.questions[0].options[1] = form.option1;
                        c.quiz.questions[0].correct = Number(form.correct);
                        await mutate(
                          editing
                            ? "learning_update_course"
                            : "learning_create_course",
                          { courseId: form.id, course: c },
                        );
                        setNotice("Draft saved. Publish when ready.");
                      });
                    }}
                  >
                    {(
                      [
                        "id",
                        "title",
                        "summary",
                        "lesson",
                        "question",
                        "option0",
                        "option1",
                      ] as const
                    ).map((k) => (
                      <label key={k}>
                        {
                          {
                            id: "Course ID",
                            title: "Title",
                            summary: "Summary",
                            lesson: "First lesson text",
                            question: "First quiz question",
                            option0: "Option A",
                            option1: "Option B",
                          }[k]
                        }
                        {k === "lesson" ? (
                          <textarea
                            required
                            maxLength={2500}
                            value={form[k]}
                            onChange={(e) =>
                              setForm({ ...form, [k]: e.target.value })
                            }
                          />
                        ) : (
                          <input
                            required
                            disabled={k === "id" && !!editing}
                            maxLength={
                              k === "summary"
                                ? 600
                                : k === "question"
                                  ? 400
                                  : k === "id"
                                    ? 64
                                    : 160
                            }
                            value={form[k]}
                            onChange={(e) =>
                              setForm({ ...form, [k]: e.target.value })
                            }
                          />
                        )}
                      </label>
                    ))}
                    <label>
                      Correct option
                      <select
                        value={form.correct}
                        onChange={(e) =>
                          setForm({ ...form, correct: Number(e.target.value) })
                        }
                      >
                        <option value="0">A</option>
                        <option value="1">B</option>
                      </select>
                    </label>
                    <button disabled={busy}>Save draft</button>
                    {editing && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setEditing(null);
                          setForm({
                            id: "",
                            title: "",
                            summary: "",
                            lesson: "",
                            question: "",
                            option0: "",
                            option1: "",
                            correct: 1,
                          });
                        }}
                      >
                        New course
                      </button>
                    )}
                  </form>
                </section>
              </>
            )}
            {["admin", "manager"].includes(role) && (
              <>
                <section className="panel">
                  <h2>Assign learning</h2>
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
                    <label>
                      Course
                      <select
                        aria-label="Course"
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
                    <label>
                      Learner
                      <select
                        aria-label="Learner"
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
                    <label>
                      Due date · your local time
                      <input
                        type="datetime-local"
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>Assign course</button>
                  </form>
                </section>
                <h2>Learning report</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Course</th>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Lessons</th>
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
                <p className="muted">
                  Server-enforced{" "}
                  {role === "manager" ? "direct-report" : "organization"} scope.
                  First 50 records.
                </p>
              </>
            )}
          </>
        )}
        <footer>
          Pear · A deterministic learning app, with an optional Lime assistant.
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
