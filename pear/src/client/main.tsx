import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppController,
  type AdminContentRow,
  type AssignmentPreview,
  type AttemptView,
  type CatalogItem,
  type CourseDraft,
  type Directory,
  type EnrollmentListItem,
  type ItemDetail,
  type LessonView,
  type ProgressView,
  type Route,
} from "./controller.ts";
import { installBridge } from "./bridge.ts";
import "./style.css";

const ctl = new AppController();

function useCtl() {
  const [, setTick] = useState(0);
  useEffect(() => ctl.subscribe(() => setTick((t) => t + 1)), []);
  return ctl;
}

const STATUS_LABEL: Record<string, string> = {
  assigned: "Được giao",
  enrolled: "Đang học",
  completed: "Hoàn thành",
};

function Login() {
  const [user, setUser] = useState("learner1");
  const [pass, setPass] = useState("learner-dev");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="brand">Pear</div>
      <h1>Đăng nhập LMS</h1>
      {err && <div className="banner err">{err}</div>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await ctl.login(user, pass);
          } catch (ex) {
            setErr((ex as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Tài khoản
          <input value={user} onChange={(e) => setUser(e.target.value)} />
        </label>
        <label>
          Mật khẩu
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>
        <div style={{ marginTop: 18 }}>
          <button className="primary" disabled={busy} type="submit">
            Đăng nhập
          </button>
        </div>
      </form>
      <div className="hint">
        Tài khoản dev: learner1/learner2 (learner-dev), manager (manager-dev),
        cadmin (content-dev), admin (admin-dev).
      </div>
    </div>
  );
}

function Topbar({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const s = ctl.session!;
  return (
    <div className="topbar">
      <div className="brand">Pear</div>
      <nav>
        <button
          className={route.view === "home" ? "active" : ""}
          onClick={() => navigate({ view: "home" })}
        >
          Học của tôi
        </button>
        <button
          className={route.view === "catalog" ? "active" : ""}
          onClick={() => navigate({ view: "catalog" })}
        >
          Catalog
        </button>
        {["manager", "content_admin", "admin"].includes(s.role) && (
          <button
            className={
              ["admin", "editor", "assign"].includes(route.view) ? "active" : ""
            }
            onClick={() => navigate({ view: "admin" })}
          >
            Quản trị
          </button>
        )}
      </nav>
      <div className="userchip">
        <span className="mono">{s.principal}</span>
        <span className="role">{s.role}</span>
        <button onClick={() => ctl.logout()}>Thoát</button>
      </div>
    </div>
  );
}

function EnrollmentCard({ e }: { e: EnrollmentListItem }) {
  const pct =
    e.progress.lessonsTotal === 0
      ? 0
      : Math.round((e.progress.lessonsDone / e.progress.lessonsTotal) * 100);
  return (
    <div className="card">
      <div className="row">
        <span className={`chip ${e.status}`}>{STATUS_LABEL[e.status]}</span>
        <span className="chip">{e.type}</span>
        {e.dueAt && <span className="chip">hạn {e.dueAt.slice(0, 10)}</span>}
      </div>
      <h3>{e.title}</h3>
      <div className="progressbar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <small>
        {e.progress.lessonsDone}/{e.progress.lessonsTotal} bài học ·{" "}
        {e.progress.quizzesPassed}/{e.progress.quizzesTotal} quiz đạt
      </small>
      <div className="row">
        <button
          className="primary"
          onClick={() =>
            ctl.navigate({ view: "player", enrollmentId: e.enrollmentId })
          }
        >
          {e.status === "completed" ? "Xem lại" : "Học tiếp"}
        </button>
        <button
          onClick={() => ctl.navigate({ view: "item", itemId: e.contentId })}
        >
          Chi tiết
        </button>
      </div>
    </div>
  );
}

function Home() {
  const [data, setData] = useState<{
    items: EnrollmentListItem[];
    bookmarks: { contentId: string; title: string; type: string }[];
  } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    ctl
      .myLearning()
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="banner err">{err}</div>;
  if (!data) return <p>Đang tải…</p>;
  const assigned = data.items.filter((i) => i.status === "assigned");
  const active = data.items.filter((i) => i.status === "enrolled");
  const done = data.items.filter((i) => i.status === "completed");
  return (
    <div>
      <h2>Học của tôi</h2>
      <div className="section-title">Được giao</div>
      {assigned.length === 0 ? (
        <div className="empty">Không có bài tập nào được giao.</div>
      ) : (
        <div className="cards">
          {assigned.map((e) => (
            <EnrollmentCard key={e.enrollmentId} e={e} />
          ))}
        </div>
      )}
      <div className="section-title">Đang học</div>
      {active.length === 0 ? (
        <div className="empty">Chưa ghi danh khóa nào — vào Catalog để bắt đầu.</div>
      ) : (
        <div className="cards">
          {active.map((e) => (
            <EnrollmentCard key={e.enrollmentId} e={e} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <>
          <div className="section-title">Hoàn thành</div>
          <div className="cards">
            {done.map((e) => (
              <EnrollmentCard key={e.enrollmentId} e={e} />
            ))}
          </div>
        </>
      )}
      <div className="section-title">Đã lưu</div>
      {data.bookmarks.length === 0 ? (
        <div className="empty">Chưa lưu nội dung nào.</div>
      ) : (
        <div className="cards">
          {data.bookmarks.map((b) => (
            <div className="card" key={b.contentId}>
              <span className="chip">{b.type}</span>
              <h3>{b.title}</h3>
              <button
                onClick={() =>
                  ctl.navigate({ view: "item", itemId: b.contentId })
                }
              >
                Mở
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <div className="card">
      <div className="row">
        <span className="chip">{item.type}</span>
        <span className="chip">{item.level}</span>
        {item.durationMinutes > 0 && (
          <span className="chip">{item.durationMinutes} phút</span>
        )}
      </div>
      <h3>{item.title}</h3>
      <small>{item.summary}</small>
      <div className="row">
        <button
          onClick={() => ctl.navigate({ view: "item", itemId: item.id })}
        >
          Xem
        </button>
      </div>
    </div>
  );
}

function Catalog() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [level, setLevel] = useState("");
  const [data, setData] = useState<{ total: number; items: CatalogItem[] } | null>(
    null,
  );
  const [err, setErr] = useState("");
  const load = useMemo(
    () => async () => {
      const args: Record<string, unknown> = { page: 0, pageSize: 40 };
      if (query) args.query = query;
      if (type) args.contentType = type;
      if (level) args.level = level;
      try {
        setData(await ctl.search(args));
        setErr("");
      } catch (e) {
        setErr((e as Error).message);
      }
    },
    [query, type, level],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <h2>Catalog</h2>
      <div className="filters">
        <label className="grow">
          Tìm kiếm
          <input
            placeholder="Từ khóa…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Loại
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="course">course</option>
            <option value="item">item</option>
          </select>
        </label>
        <label>
          Trình độ
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </label>
      </div>
      {err && <div className="banner err">{err}</div>}
      {!data ? (
        <p>Đang tải…</p>
      ) : (
        <>
          <small>{data.total} kết quả</small>
          <div className="cards" style={{ marginTop: 10 }}>
            {data.items.map((i) => (
              <CatalogCard key={i.id} item={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ItemPage({ itemId }: { itemId: string }) {
  const [d, setD] = useState<ItemDetail | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState<boolean | null>(null);
  const load = async () => {
    try {
      setD(await ctl.item(itemId));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [itemId]);
  useEffect(() => {
    ctl
      .myLearning()
      .then((ml) =>
        setSaved(ml.bookmarks.some((b) => b.contentId === itemId)),
      )
      .catch(() => {});
  }, [itemId]);
  if (err) return <div className="banner err">{err}</div>;
  if (!d) return <p>Đang tải…</p>;
  const enroll = async () => {
    const r = await ctl.write(ctl.workspaceDoc(), "learning_enroll", {
      contentId: itemId,
    });
    if (r.ok) {
      setMsg("Đã ghi danh.");
      await load();
    } else setErr(r.error?.message ?? "Lỗi ghi danh");
  };
  const toggleSave = async () => {
    const r = await ctl.write(ctl.workspaceDoc(), "learning_set_bookmark", {
      contentId: itemId,
      saved: !(saved === true),
    });
    if (r.ok) setSaved((r.data as { saved: boolean }).saved);
  };
  return (
    <div>
      <div className="row">
        <h2 style={{ marginBottom: 0 }}>{d.item.title}</h2>
        <span className={`chip ${d.item.status}`}>{d.item.status}</span>
      </div>
      <p style={{ marginTop: 8 }}>{d.item.summary}</p>
      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        <span className="chip">{d.item.type}</span>
        <span className="chip">{d.item.level}</span>
        {d.item.durationMinutes > 0 && (
          <span className="chip">{d.item.durationMinutes} phút</span>
        )}
        <span className="chip">v{d.item.latestVersion}</span>
        {d.item.topics.map((t) => (
          <span className="chip" key={t}>
            {t}
          </span>
        ))}
      </div>
      {msg && <div className="banner ok">{msg}</div>}
      <div className="row">
        {d.myEnrollment ? (
          <button
            className="primary"
            onClick={() =>
              ctl.navigate({
                view: "player",
                enrollmentId: d.myEnrollment!.id,
              })
            }
          >
            Vào học
          </button>
        ) : (
          <button className="primary" onClick={enroll}>
            Ghi danh
          </button>
        )}
        <button onClick={toggleSave}>
          {saved ? "Bỏ lưu" : "Lưu lại"}
        </button>
      </div>
      {d.structure?.modules && (
        <>
          <div className="section-title">Cấu trúc khóa học</div>
          {d.structure.modules.map((m) => (
            <div className="card" key={m.index} style={{ marginBottom: 10 }}>
              <h3>
                Module {m.index + 1}: {m.title}
              </h3>
              <small>
                {m.lessonIds.join(" · ")}
                {m.prerequisiteModuleIndexes.length > 0 &&
                  ` · yêu cầu xong module ${m.prerequisiteModuleIndexes
                    .map((i) => i + 1)
                    .join(",")}`}
              </small>
            </div>
          ))}
          <small>
            Hoàn thành khi: {d.structure.completionPolicy} · tối đa{" "}
            {d.structure.attemptCap} lượt quiz.
          </small>
        </>
      )}
    </div>
  );
}

function Quiz({ lesson, enrollmentId, onDone }: {
  lesson: LessonView["lesson"];
  enrollmentId: string;
  onDone: () => void;
}) {
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setErr("");
    const r = await ctl.write(`enrollment:${enrollmentId}`, "learning_start_attempt", {
      enrollmentId,
      quizId: lesson.lessonId,
    });
    if (!r.ok) {
      setErr(r.error?.message ?? "Không mở được attempt");
      return;
    }
    const v = await ctl.attempt(
      (r.data as { attemptId: string }).attemptId,
      enrollmentId,
    );
    setAttempt(v);
  };
  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.lessonId]);
  if (err)
    return (
      <div className="banner err">
        {err}
        <div style={{ marginTop: 10 }}>
          <button onClick={start}>Thử lại</button>
        </div>
      </div>
    );
  if (!attempt) return <p>Đang mở bài kiểm tra…</p>;
  if (attempt.attempt.status === "graded") {
    const a = attempt.attempt;
    return (
      <div className="result">
        <div className={`score ${a.passed ? "pass" : "fail"}`}>{a.score}%</div>
        <p>
          {a.passed ? "Đạt" : "Chưa đạt"} — cần {attempt.quiz.passScore}%.
          Lượt {a.attemptNo}.
        </p>
        <button className="primary" onClick={onDone}>
          Quay lại khóa học
        </button>
        <div style={{ marginTop: 10 }}>
          <button onClick={start}>Làm lại</button>
        </div>
      </div>
    );
  }
  const answers = attempt.attempt.answers;
  const answered = Object.keys(answers).length;
  const total = attempt.quiz.questions.length;
  const save = async (qid: string, cid: string) => {
    setErr("");
    const r = await ctl.write(`enrollment:${enrollmentId}`, "learning_save_answer", {
      attemptId: attempt.attempt.id,
      questionId: qid,
      selectedChoiceIds: [cid],
    });
    if (!r.ok) {
      setErr(r.error?.message ?? "Không lưu được câu trả lời");
      return;
    }
    setAttempt({
      ...attempt,
      attempt: {
        ...attempt.attempt,
        answers: { ...answers, [qid]: { selectedChoiceIds: [cid] } },
      },
    });
  };
  const submit = async () => {
    setBusy(true);
    setErr("");
    const r = await ctl.write(`enrollment:${enrollmentId}`, "learning_submit_attempt", {
      attemptId: attempt.attempt.id,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error?.message ?? "Không nộp được bài");
      return;
    }
    setAttempt(await ctl.attempt(attempt.attempt.id, enrollmentId));
  };
  return (
    <div>
      <h3>{attempt.quiz.title}</h3>
      <small>
        Điểm đạt {attempt.quiz.passScore}% · đã trả lời {answered}/{total}
      </small>
      <div style={{ marginTop: 16 }}>
        {attempt.quiz.questions.map((q, i) => (
          <div className="question" key={q.id}>
            <div className="prompt">
              {i + 1}. {q.prompt}
            </div>
            {q.choices.map((ch) => (
              <div
                key={ch.id}
                className={`choice ${
                  answers[q.id]?.selectedChoiceIds?.includes(ch.id)
                    ? "selected"
                    : ""
                }`}
                onClick={() => void save(q.id, ch.id)}
              >
                <input
                  type="radio"
                  readOnly
                  checked={
                    answers[q.id]?.selectedChoiceIds?.includes(ch.id) ?? false
                  }
                />
                <span>{ch.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {err && <div className="banner err">{err}</div>}
      <div className="row">
        <button
          className="primary"
          disabled={busy || answered < total}
          onClick={submit}
        >
          Nộp bài ({answered}/{total})
        </button>
        {answered < total && <small>Trả lời hết mới nộp được.</small>}
      </div>
    </div>
  );
}

function Player({ enrollmentId, lessonId }: { enrollmentId: string; lessonId?: string }) {
  const [prog, setProg] = useState<ProgressView | null>(null);
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [err, setErr] = useState("");
  const reload = async (lid?: string) => {
    try {
      const p = await ctl.progress(enrollmentId);
      setProg(p);
      const d = await ctl.item(p.enrollment.contentId, `enrollment:${enrollmentId}`);
      setDetail(d);
      const first =
        lid ??
        d.structure?.modules?.flatMap((m) => m.lessonIds)[0] ??
        p.enrollment.contentId;
      setLesson(await ctl.lesson(enrollmentId, first));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void reload(lessonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId, lessonId]);
  if (err) return <div className="banner err">{err}</div>;
  if (!prog || !detail || !lesson) return <p>Đang tải…</p>;
  const s = detail.structure;
  const doneSet = new Set(prog.lessons.map((l) => l.lessonId));
  const openLesson = async (lid: string) => {
    setLesson(await ctl.lesson(enrollmentId, lid));
  };
  const markDone = async () => {
    const r = await ctl.completeLesson(enrollmentId, lesson.lesson.lessonId);
    if (r.ok) {
      setProg(await ctl.progress(enrollmentId));
      setLesson(await ctl.lesson(enrollmentId, lesson.lesson.lessonId));
    } else setErr(r.error?.message ?? "Không đánh dấu được");
  };
  const isItem = detail.item.type === "item";
  const mods = s?.modules ?? [
    { index: 0, title: detail.item.title, lessonIds: [detail.item.id], prerequisiteModuleIndexes: [] },
  ];
  return (
    <div>
      <div className="row">
        <h2 style={{ marginBottom: 0 }}>{prog.enrollment.title}</h2>
        <span className={`chip ${prog.enrollment.status}`}>
          {STATUS_LABEL[prog.enrollment.status] ?? prog.enrollment.status}
        </span>
      </div>
      <small>
        version pin v{prog.enrollment.pinnedVersion} ·{" "}
        {prog.summary.lessonsDone}/{prog.summary.lessonsTotal} bài học
        {prog.enrollment.completedAt &&
          ` · xong ${prog.enrollment.completedAt.slice(0, 10)}`}
      </small>
      <div className="player" style={{ marginTop: 16 }}>
        <div className="toc">
          {mods.map((m) => (
            <div className="module" key={m.index}>
              <div className="module-title">{m.title}</div>
              {m.lessonIds.map((lid) => {
                const done = doneSet.has(lid);
                const active = lesson.lesson.lessonId === lid;
                return (
                  <div
                    key={lid}
                    className={`lesson ${active ? "active" : ""}`}
                    onClick={() => void openLesson(lid)}
                  >
                    <span className={done ? "tick" : "locked"}>
                      {done ? "✓" : "○"}
                    </span>
                    <span className="mono">{lid}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="content">
          {lesson.lesson.quiz ? (
            <Quiz
              lesson={lesson.lesson}
              enrollmentId={enrollmentId}
              onDone={() => void reload(lesson.lesson.lessonId)}
            />
          ) : (
            <>
              <h3>{lesson.lesson.title}</h3>
              <div className="lesson-body">{lesson.lesson.body}</div>
              {lesson.lesson.url && (
                <p>
                  <a href={lesson.lesson.url} target="_blank" rel="noreferrer">
                    {lesson.lesson.url}
                  </a>
                </p>
              )}
              {lesson.lesson.completedAt ? (
                <div className="banner ok">
                  Đã hoàn thành {lesson.lesson.completedAt.slice(0, 10)}
                </div>
              ) : (
                <div className="row">
                  <button className="primary" onClick={markDone}>
                    Đánh dấu hoàn thành
                  </button>
                  {!isItem && <small>Hoàn thành bài để mở quiz.</small>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Admin() {
  const [rows, setRows] = useState<AdminContentRow[] | null>(null);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const isEditor = ["content_admin", "admin"].includes(ctl.session!.role);
  const reload = async () => {
    try {
      setRows(await ctl.adminContent());
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  if (err) return <div className="banner err">{err}</div>;
  if (!rows) return <p>Đang tải…</p>;
  const create = async () => {
    if (!title.trim()) return;
    const r = await ctl.saveCourse({
      title: title.trim(),
      modules: [{ title: "Module 1", lessonIds: [], prerequisiteModuleIndexes: [] }],
    });
    if (!r.ok) {
      setErr(r.error?.message ?? "Không tạo được course");
      return;
    }
    setCreating(false);
    setTitle("");
    ctl.navigate({
      view: "editor",
      courseId: (r.data as { courseId: string }).courseId,
    });
  };
  return (
    <div>
      <div className="row">
        <h2 style={{ marginBottom: 0 }}>Quản trị nội dung</h2>
        {isEditor && (
          <button className="primary right" onClick={() => setCreating(true)}>
            + Course mới
          </button>
        )}
      </div>
      {creating && (
        <div className="card" style={{ marginTop: 14 }}>
          <label>
            Tên course
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={create}>
              Tạo draft
            </button>
            <button onClick={() => setCreating(false)}>Hủy</button>
          </div>
        </div>
      )}
      <div className="section-title">Nội dung</div>
      <div className="cards">
        {rows.map((r) => (
          <div className="card" key={r.id}>
            <div className="row">
              <span className={`chip ${r.status}`}>{r.status}</span>
              <span className="chip">{r.type}</span>
              {r.latest_version > 0 && (
                <span className="chip">v{r.latest_version}</span>
              )}
              {r.draft_revision !== undefined && (
                <span className="chip">draft r{r.draft_revision}</span>
              )}
            </div>
            <h3>{r.title}</h3>
            <small className="mono">{r.id}</small>
            <div className="row">
              {r.type === "course" && isEditor && (
                <button
                  onClick={() =>
                    ctl.navigate({ view: "editor", courseId: r.id })
                  }
                >
                  Sửa
                </button>
              )}
              {(r.status === "published" || r.status === "retiring") &&
                ["manager", "admin"].includes(ctl.session!.role) && (
                  <button
                    onClick={() =>
                      ctl.navigate({ view: "assign", contentId: r.id })
                    }
                  >
                    Giao bài
                  </button>
                )}
              <button
                onClick={() => ctl.navigate({ view: "item", itemId: r.id })}
              >
                Xem
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Editor({ courseId }: { courseId: string }) {
  const [d, setD] = useState<CourseDraft | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [modules, setModules] = useState<
    { title: string; lessonIds: string[]; prerequisiteModuleIndexes: number[] }[]
  >([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const isEditor = ["content_admin", "admin"].includes(ctl.session!.role);
  const load = async () => {
    const draft = await ctl.courseDraft(courseId);
    setD(draft);
    setTitle(draft.item.title);
    setSummary(draft.item.summary ?? "");
    setModules(
      (draft.structure?.modules ?? []).map((m) => ({
        title: m.title,
        lessonIds: [...m.lessonIds],
        prerequisiteModuleIndexes: [...m.prerequisiteModuleIndexes],
      })),
    );
    const cat = await ctl.search({ contentType: "item", pageSize: 40 });
    setItems(cat.items);
  };
  useEffect(() => {
    load().catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);
  if (err) return <div className="banner err">{err}</div>;
  if (!d) return <p>Đang tải…</p>;
  if (!isEditor) return <div className="banner err">Chỉ content_admin/admin được sửa course.</div>;
  const draftRev = d.item.draftRevision ?? 0;
  const setModule = (i: number, patch: Partial<(typeof modules)[0]>) =>
    setModules(modules.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const save = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    const r = await ctl.saveCourse({
      courseId,
      title,
      description: summary,
      modules,
    });
    setBusy(false);
    if (r.ok) {
      setMsg(`Đã lưu draft r${(r.data as { draftRevision: number }).draftRevision}.`);
      await load();
    } else setErr(r.error?.message ?? "Không lưu được");
  };
  const publish = async () => {
    setBusy(true);
    setErr("");
    const r = await ctl.publishCourse(courseId, draftRev);
    setBusy(false);
    if (r.ok) {
      setMsg("Đã publish.");
      await load();
    } else setErr(r.error?.message ?? "Không publish được");
  };
  return (
    <div>
      <div className="row">
        <h2 style={{ marginBottom: 0 }}>Sửa course</h2>
        <span className={`chip ${d.item.status}`}>{d.item.status}</span>
        <span className="chip">draft r{draftRev}</span>
        {d.item.latestVersion > 0 && (
          <span className="chip">v{d.item.latestVersion}</span>
        )}
      </div>
      <small className="mono">{courseId}</small>
      {msg && <div className="banner ok" style={{ marginTop: 12 }}>{msg}</div>}
      {err && <div className="banner err" style={{ marginTop: 12 }}>{err}</div>}
      <div className="card" style={{ marginTop: 14 }}>
        <label>
          Tên course
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Mô tả
          <textarea
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
      </div>
      <div className="section-title">Modules</div>
      {modules.map((m, i) => (
        <div className="card" key={i} style={{ marginBottom: 10 }}>
          <div className="row">
            <input
              style={{ flex: 1 }}
              value={m.title}
              onChange={(e) => setModule(i, { title: e.target.value })}
            />
            <button
              disabled={modules.length <= 1}
              onClick={() => setModules(modules.filter((_, j) => j !== i))}
            >
              Xóa module
            </button>
          </div>
          {i > 0 && (
            <small>
              Yêu cầu xong trước:{" "}
              {modules.slice(0, i).map((_, pi) => (
                <label key={pi} style={{ display: "inline-flex", gap: 4, marginRight: 10, marginTop: 0, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={m.prerequisiteModuleIndexes.includes(pi)}
                    onChange={(e) =>
                      setModule(i, {
                        prerequisiteModuleIndexes: e.target.checked
                          ? [...m.prerequisiteModuleIndexes, pi]
                          : m.prerequisiteModuleIndexes.filter((x) => x !== pi),
                      })
                    }
                  />
                  module {pi + 1}
                </label>
              ))}
            </small>
          )}
          <div>
            {m.lessonIds.map((lid) => (
              <span className="chip mono" key={lid} style={{ marginRight: 6 }}>
                {lid}{" "}
                <a
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setModule(i, {
                      lessonIds: m.lessonIds.filter((x) => x !== lid),
                    })
                  }
                >
                  ×
                </a>
              </span>
            ))}
          </div>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value && !m.lessonIds.includes(e.target.value))
                setModule(i, {
                  lessonIds: [...m.lessonIds, e.target.value],
                });
            }}
          >
            <option value="">+ thêm bài học…</option>
            {items
              .filter((it) => !m.lessonIds.includes(it.id))
              .map((it) => (
                <option key={it.id} value={it.id}>
                  {it.title} ({it.id})
                </option>
              ))}
          </select>
        </div>
      ))}
      <div className="row">
        <button
          onClick={() =>
            setModules([
              ...modules,
              {
                title: `Module ${modules.length + 1}`,
                lessonIds: [],
                prerequisiteModuleIndexes: [],
              },
            ])
          }
        >
          + Module
        </button>
        <div className="right row">
          <button onClick={save} disabled={busy || !title.trim()}>
            Lưu nháp
          </button>
          <button
            className="primary"
            disabled={busy || d.item.status === "published"}
            onClick={publish}
          >
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}

function Assign({ contentId }: { contentId?: string }) {
  const [rows, setRows] = useState<AdminContentRow[] | null>(null);
  const [dir, setDir] = useState<Directory | null>(null);
  const [cid, setCid] = useState(contentId ?? "");
  const [users, setUsers] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [dueKind, setDueKind] = useState<"fixed" | "rolling" | "none">("none");
  const [dueAt, setDueAt] = useState("");
  const [rollingDays, setRollingDays] = useState(30);
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    ctl.adminContent().then(setRows).catch((e) => setErr(e.message));
    ctl.adminDirectory().then(setDir).catch(() => {});
  }, []);
  if (err) return <div className="banner err">{err}</div>;
  if (!rows || !dir) return <p>Đang tải…</p>;
  const candidates = rows.filter(
    (r) => r.status === "published" || r.status === "retiring",
  );
  const doPreview = async () => {
    setErr("");
    setMsg("");
    try {
      setPreview(
        await ctl.previewAssignment(cid, users, groups),
      );
    } catch (e) {
      setErr((e as Error).message);
      setPreview(null);
    }
  };
  const create = async () => {
    setBusy(true);
    setErr("");
    const args: Parameters<typeof ctl.createAssignment>[0] = {
      contentId: cid,
      userIds: users,
      groupIds: groups,
      dueKind,
    };
    if (dueKind === "fixed" && dueAt) args.dueAt = new Date(dueAt).toISOString();
    if (dueKind === "rolling") args.rollingDays = rollingDays;
    const r = await ctl.createAssignment(args);
    setBusy(false);
    if (r.ok) {
      setMsg(
        `Đã giao cho ${(r.data as { assigned: string[] }).assigned.length} learner.`,
      );
      setPreview(null);
    } else setErr(r.error?.message ?? "Không tạo được assignment");
  };
  return (
    <div>
      <h2>Giao bài</h2>
      {msg && <div className="banner ok">{msg}</div>}
      {err && <div className="banner err">{err}</div>}
      <div className="card">
        <label>
          Nội dung
          <select value={cid} onChange={(e) => { setCid(e.target.value); setPreview(null); }}>
            <option value="">— chọn —</option>
            {candidates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} ({r.id})
              </option>
            ))}
          </select>
        </label>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label style={{ flex: 1 }}>
            Learners
            <div style={{ marginTop: 6 }}>
              {dir.users.map((u) => (
                <label key={u.id} style={{ display: "flex", gap: 6, fontWeight: 400, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={users.includes(u.id)}
                    onChange={(e) =>
                      setUsers(
                        e.target.checked
                          ? [...users, u.id]
                          : users.filter((x) => x !== u.id),
                      )
                    }
                  />
                  {u.name} <span className="mono">({u.id})</span>
                </label>
              ))}
            </div>
          </label>
          {dir.groups.length > 0 && (
            <label style={{ flex: 1 }}>
              Groups
              <div style={{ marginTop: 6 }}>
                {dir.groups.map((g) => (
                  <label key={g.id} style={{ display: "flex", gap: 6, fontWeight: 400, marginTop: 4 }}>
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={groups.includes(g.id)}
                      onChange={(e) =>
                        setGroups(
                          e.target.checked
                            ? [...groups, g.id]
                            : groups.filter((x) => x !== g.id),
                        )
                      }
                    />
                    {g.name} <span className="mono">({g.id})</span> · {g.memberCount}
                  </label>
                ))}
              </div>
            </label>
          )}
        </div>
        <div className="row">
          <label style={{ flex: 1 }}>
            Hạn nộp
            <select
              value={dueKind}
              onChange={(e) => setDueKind(e.target.value as typeof dueKind)}
            >
              <option value="none">Không hạn</option>
              <option value="fixed">Ngày cố định</option>
              <option value="rolling">Rolling (số ngày)</option>
            </select>
          </label>
          {dueKind === "fixed" && (
            <label style={{ flex: 1 }}>
              Ngày
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
          )}
          {dueKind === "rolling" && (
            <label style={{ flex: 1 }}>
              Số ngày
              <input
                type="number"
                min={1}
                value={rollingDays}
                onChange={(e) => setRollingDays(Number(e.target.value))}
              />
            </label>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            onClick={doPreview}
            disabled={!cid || (users.length === 0 && groups.length === 0)}
          >
            Preview
          </button>
          <button
            className="primary"
            disabled={busy || !preview || preview.resolved.length === 0}
            onClick={create}
          >
            Tạo assignment
          </button>
        </div>
      </div>
      {preview && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>
            Preview: {preview.title} → {preview.resolved.length} learner
          </h3>
          <div>
            {preview.resolved.map((u) => (
              <span className="chip mono" key={u.userId} style={{ marginRight: 6 }}>
                {u.userId}
                {u.alreadyEnrolled && " (đã enroll)"}
              </span>
            ))}
          </div>
          {preview.unknownUsers.length > 0 && (
            <small>Không tồn tại: {preview.unknownUsers.join(", ")}</small>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  useCtl();
  const [route, setRoute] = useState<Route>(ctl.route);
  useEffect(() => {
    ctl.restore();
    installBridge(ctl.bridge());
  }, []);
  useEffect(() => {
    setRoute(ctl.route);
  });
  if (!ctl.session) return <Login />;
  return (
    <>
      <Topbar route={route} navigate={(r) => ctl.navigate(r)} />
      <div className="page">
        {route.view === "home" && <Home />}
        {route.view === "catalog" && <Catalog />}
        {route.view === "item" && <ItemPage itemId={route.itemId} />}
        {route.view === "player" && (
          <Player
            enrollmentId={route.enrollmentId}
            lessonId={route.lessonId}
          />
        )}
        {route.view === "admin" && <Admin />}
        {route.view === "editor" && <Editor courseId={route.courseId} />}
        {route.view === "assign" && <Assign contentId={route.contentId} />}
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
