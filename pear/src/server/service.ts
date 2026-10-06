import Ajv, { type ValidateFunction } from "ajv";
import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import {
  canonical,
  failure,
  success,
  type Code,
  type Invoke,
  type Result,
} from "../shared/contract.ts";
import { catalog, policies, toolByName, invokeSchema } from "../shared/catalog.ts";
import type {
  Account,
  AssignmentRow,
  AttemptRow,
  ContentRow,
  CourseStructure,
  EnrollmentRow,
  ItemPayload,
  Principal,
  Quiz,
} from "../shared/domain.ts";
import { parseDocumentId } from "../shared/domain.ts";

export class DomainError extends Error {
  constructor(
    public code: Code,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: Code, msg: string): never => {
  throw new DomainError(code, msg);
};
const assert: (ok: unknown, code: Code, msg: string) => asserts ok = (
  ok,
  code,
  msg,
) => {
  if (!ok) fail(code, msg);
};

const ajv = new Ajv({ allErrors: false, strict: false });
const validateInvoke = ajv.compile(invokeSchema);
const argValidators = new Map<string, ValidateFunction>(
  catalog.map((t) => [t.name, ajv.compile(t.inputSchema)]),
);

type Content = ContentRow;
type Enrollment = EnrollmentRow;

type AggregateRow = { id: string; org_id: string; revision: number };

const readInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

export class LearningService {
  constructor(private db: DatabaseSync) {}

  principalOf(accountId: string): Principal | null {
    const a = this.db
      .prepare(
        "SELECT id,role,org_id,manager_id,name,active FROM accounts WHERE id=?",
      )
      .get(accountId) as Account | undefined;
    if (!a || !a.active) return null;
    return { id: a.id, role: a.role, orgId: a.org_id, managerId: a.manager_id };
  }

  private aggregate(documentId: string): AggregateRow | undefined {
    return this.db
      .prepare("SELECT id,org_id,revision FROM aggregates WHERE id=?")
      .get(documentId) as AggregateRow | undefined;
  }

  private ensureAggregate(documentId: string, orgId: string): AggregateRow {
    this.db
      .prepare(
        "INSERT INTO aggregates(id,org_id,revision) VALUES(?,?,0) ON CONFLICT(id) DO NOTHING",
      )
      .run(documentId, orgId);
    return this.aggregate(documentId)!;
  }

  private bump(documentId: string): number {
    this.db
      .prepare("UPDATE aggregates SET revision=revision+1 WHERE id=?")
      .run(documentId);
    return this.aggregate(documentId)!.revision;
  }

  revisionOf(documentId: string): number {
    return this.aggregate(documentId)?.revision ?? 0;
  }

  private content(id: string, orgId: string): Content | undefined {
    return this.db
      .prepare("SELECT * FROM content WHERE id=? AND org_id=?")
      .get(id, orgId) as Content | undefined;
  }

  private enrollment(id: string, orgId: string): Enrollment | undefined {
    return this.db
      .prepare("SELECT * FROM enrollments WHERE id=? AND org_id=?")
      .get(id, orgId) as Enrollment | undefined;
  }

  private assertVisible(c: Content, p: Principal) {
    if (c.status === "draft") {
      assert(
        p.role === "admin" || p.role === "content_admin",
        "FORBIDDEN",
        "Nội dung bản nháp chỉ dành cho quản trị nội dung.",
      );
    }
  }

  private assertAggregateAccess(
    documentId: string,
    p: Principal,
    write: boolean,
  ): void {
    const { kind, entityId } = parseDocumentId(documentId);
    switch (kind) {
      case "workspace":
        assert(
          entityId === p.id,
          "FORBIDDEN",
          "Workspace chỉ truy cập bởi chính chủ.",
        );
        break;
      case "enrollment": {
        const e = this.enrollment(entityId, p.orgId);
        assert(!!e, "NOT_FOUND", "Enrollment không tồn tại.");
        const learner = this.db
          .prepare("SELECT manager_id FROM accounts WHERE id=?")
          .get(e.learner) as { manager_id: string | null } | undefined;
        const isManagerOfLearner =
          p.role === "manager" && learner?.manager_id === p.id;
        const ok =
          e.learner === p.id ||
          p.role === "admin" ||
          (p.role === "content_admin" && !write) ||
          isManagerOfLearner;
        assert(ok, "FORBIDDEN", "Không có quyền trên enrollment này.");
        break;
      }
      case "course": {
        const c = this.content(entityId, p.orgId);
        assert(!!c, "NOT_FOUND", "Course không tồn tại.");
        if (write) {
          assert(
            p.role === "admin" || p.role === "content_admin",
            "FORBIDDEN",
            "Chỉ content_admin/admin được sửa course.",
          );
        } else this.assertVisible(c, p);
        break;
      }
      case "org":
        assert(entityId === p.orgId, "FORBIDDEN", "Sai tenant.");
        break;
    }
  }

  invoke(p: Principal, raw: unknown): Result {
    let requestId = "";
    let documentId = "";
    let toolName = "";
    let before: number | null = null;
    let after: number | null = null;
    let result: Result;
    try {
      assert(
        validateInvoke(raw),
        "INVALID_ARGUMENT",
        "Envelope invoke không hợp lệ.",
      );
      const call = raw as Invoke;
      requestId = call.requestId;
      documentId = call.documentId;
      toolName = call.toolName;
      const policy = policies[call.toolName];
      const descriptor = toolByName.get(call.toolName);
      assert(!!descriptor && !!policy, "UNSUPPORTED", "Tool không tồn tại.");
      assert(
        policy.roles.includes(p.role),
        "FORBIDDEN",
        `Role ${p.role} không được dùng tool ${call.toolName}.`,
      );
      assert(
        policy.phase === "p1",
        "UNSUPPORTED",
        `Tool ${call.toolName} chưa triển khai (phase ${policy.phase}).`,
      );
      const isWrite = policy.effect === "write";
      if (isWrite) {
        assert(
          call.expectedRevision !== null && call.idempotencyKey !== null,
          "INVALID_ARGUMENT",
          "Write yêu cầu expectedRevision và idempotencyKey.",
        );
      } else {
        assert(
          call.expectedRevision === null && call.idempotencyKey === null,
          "INVALID_ARGUMENT",
          "Read phải để expectedRevision và idempotencyKey = null.",
        );
      }
      const v = argValidators.get(call.toolName)!;
      assert(
        v(call.arguments),
        "INVALID_ARGUMENT",
        "Arguments vi phạm inputSchema.",
      );
      this.assertAggregateAccess(call.documentId, p, isWrite);

      this.db.exec("BEGIN IMMEDIATE");
      try {
        const agg = this.ensureAggregate(call.documentId, p.orgId);
        assert(
          agg.org_id === p.orgId,
          "FORBIDDEN",
          "Aggregate thuộc tenant khác.",
        );
        before = agg.revision;
        const semantic = canonical({
          toolName: call.toolName,
          arguments: call.arguments,
          expectedRevision: call.expectedRevision,
        });
        if (isWrite) {
          const prev = this.db
            .prepare(
              "SELECT semantic,result FROM idempotency WHERE principal=? AND document_id=? AND key=?",
            )
            .get(p.id, call.documentId, call.idempotencyKey!) as
            | { semantic: string; result: string }
            | undefined;
          if (prev) {
            const stored = JSON.parse(prev.result) as Result;
            if (prev.semantic === semantic) {
              result = stored;
              after = before;
              this.audit(
                p.id, requestId, documentId, toolName, before, after,
                "REPLAY",
              );
              this.db.exec("COMMIT");
              return result;
            }
            fail(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key đã dùng với payload khác.",
            );
          }
          assert(
            call.expectedRevision === agg.revision,
            "STALE_CONTEXT",
            `Revision stale: kỳ vọng ${call.expectedRevision}, hiện ${agg.revision}.`,
          );
          result = this.executeWrite(p, call, call.documentId);
          after = this.bump(call.documentId);
          result = { ...result, revision: after };
          this.db
            .prepare(
              "INSERT INTO idempotency(principal,document_id,key,semantic,result) VALUES(?,?,?,?,?)",
            )
            .run(
              p.id,
              call.documentId,
              call.idempotencyKey!,
              semantic,
              JSON.stringify(result),
            );
        } else {
          result = this.executeRead(p, call, call.documentId);
          after = before;
        }
        this.audit(p.id, requestId, documentId, toolName, before, after, "OK");
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      const code: Code =
        error instanceof DomainError ? error.code : "INTERNAL";
      const message =
        error instanceof Error ? error.message : "Lỗi không xác định.";
      const r = failure(code, message, false, before ?? 0);
      try {
        this.audit(p.id, requestId, documentId, toolName, before, after, code);
      } catch {
        /* audit best-effort on failure */
      }
      return r;
    }
  }

  private audit(
    principal: string,
    requestId: string,
    documentId: string,
    toolName: string,
    beforeRev: number | null,
    afterRev: number | null,
    result: string,
  ) {
    this.db
      .prepare(
        "INSERT INTO audit(timestamp,principal,request_id,document_id,tool_name,before_revision,after_revision,result) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        new Date().toISOString(),
        principal,
        requestId,
        documentId,
        toolName,
        beforeRev,
        afterRev,
        result,
      );
  }

  // ---------- reads ----------

  private executeRead(p: Principal, call: Invoke, documentId: string): Result {
    const a = call.arguments;
    const rev = this.revisionOf(documentId);
    switch (call.toolName) {
      case "learning_search":
        return success(this.search(p, a), rev);
      case "learning_get_item":
        return success(this.getItem(p, a), rev);
      case "learning_get_lesson":
        return success(this.getLesson(p, a), rev);
      case "learning_get_my_learning":
        return success(this.myLearning(p, a), rev);
      case "learning_get_progress":
        return success(this.getProgress(p, a), rev);
      case "learning_get_attempt":
        return success(this.getAttempt(p, a), rev);
      case "learning_preview_assignment":
        return success(this.previewAssignment(p, a), rev);
      default:
        return fail("UNSUPPORTED", `Read ${call.toolName} chưa triển khai.`);
    }
  }

  private itemView(c: Content, includeDraft = false) {
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      summary: c.summary,
      provider: c.provider,
      durationMinutes: c.duration_minutes,
      level: c.level,
      language: c.language,
      skills: JSON.parse(c.skills),
      topics: JSON.parse(c.topics),
      industry: c.industry,
      accessibility: !!c.accessibility,
      status: c.status,
      license: c.license,
      latestVersion: c.latest_version,
      updated: c.updated,
      ...(includeDraft ? { draftRevision: c.draft_revision } : {}),
    };
  }

  private search(p: Principal, a: Record<string, unknown>) {
    const clauses = ["org_id = ?", "status IN ('published','retiring')"];
    const vals: unknown[] = [p.orgId];
    if (typeof a.contentType === "string") {
      clauses.push("type = ?");
      vals.push(a.contentType);
    }
    if (typeof a.level === "string") {
      clauses.push("level = ?");
      vals.push(a.level);
    }
    if (typeof a.language === "string") {
      clauses.push("language = ?");
      vals.push(a.language);
    }
    if (typeof a.provider === "string") {
      clauses.push("provider = ?");
      vals.push(a.provider);
    }
    const maxDur = readInt(a.maxDurationMinutes);
    if (maxDur !== null) {
      clauses.push("duration_minutes <= ?");
      vals.push(maxDur);
    }
    if (a.accessibility === true) clauses.push("accessibility = 1");
    const rows = this.db
      .prepare(`SELECT * FROM content WHERE ${clauses.join(" AND ")}`)
      .all(...(vals as string[])) as Content[];
    const query = typeof a.query === "string" ? a.query.toLowerCase() : "";
    const filtered = rows.filter((c) => {
      if (query) {
        const hay = `${c.title} ${c.summary} ${c.topics} ${c.skills}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (typeof a.skill === "string" && !JSON.parse(c.skills).includes(a.skill))
        return false;
      if (typeof a.topic === "string" && !JSON.parse(c.topics).includes(a.topic))
        return false;
      if (typeof a.industry === "string" && c.industry !== a.industry)
        return false;
      return true;
    });
    filtered.sort((x, y) => x.title.localeCompare(y.title, "vi"));
    const offset = Math.min(1000, Math.max(0, readInt(a.offset) ?? 0));
    const limit = Math.min(40, Math.max(1, readInt(a.limit) ?? 20));
    return {
      total: filtered.length,
      offset,
      items: filtered
        .slice(offset, offset + limit)
        .map((c) => this.itemView(c)),
    };
  }

  private getItem(p: Principal, a: Record<string, unknown>) {
    const c = this.content(String(a.itemId), p.orgId);
    assert(!!c, "NOT_FOUND", "Nội dung không tồn tại.");
    this.assertVisible(c, p);
    const versions = this.db
      .prepare(
        "SELECT version,published_at,published_by FROM content_versions WHERE content_id=? ORDER BY version",
      )
      .all(c.id) as { version: number; published_at: string; published_by: string }[];
    const enrolled = this.db
      .prepare(
        "SELECT id,status FROM enrollments WHERE learner=? AND content_id=?",
      )
      .get(p.id, c.id) as { id: string; status: string } | undefined;
    const structure = this.structureOf(c);
    return {
      item: this.itemView(c, true),
      versions,
      myEnrollment: enrolled ?? null,
      structure:
        structure && c.type === "course"
          ? {
              modules: (structure as CourseStructure).modules.map((m, i) => ({
                index: i,
                title: m.title,
                lessonIds: m.lessonIds,
                prerequisiteModuleIndexes:
                  m.prerequisiteModuleIndexes ?? [],
              })),
              completionPolicy:
                (structure as CourseStructure).completionPolicy,
              attemptCap: (structure as CourseStructure).attemptCap,
            }
          : structure
            ? { title: (structure as ItemPayload).title }
            : null,
    };
  }

  private structureOf(c: Content): CourseStructure | ItemPayload | null {
    if (c.status === "draft") return JSON.parse(c.draft || "{}");
    const v = this.db
      .prepare(
        "SELECT payload FROM content_versions WHERE content_id=? AND version=?",
      )
      .get(c.id, c.latest_version) as { payload: string } | undefined;
    return v ? JSON.parse(v.payload) : null;
  }

  private pinnedPayload(e: Enrollment): CourseStructure | ItemPayload {
    const v = this.db
      .prepare("SELECT payload FROM content_versions WHERE id=?")
      .get(e.content_version_id) as { payload: string } | undefined;
    assert(!!v, "INTERNAL", "Version đã pin không tồn tại.");
    return JSON.parse(v.payload);
  }

  private pinnedCourse(e: Enrollment): CourseStructure {
    return this.pinnedPayload(e) as CourseStructure;
  }

  private pinnedLesson(e: Enrollment, lessonId: string): ItemPayload {
    const payload = this.pinnedPayload(e);
    if ((payload as CourseStructure).modules) {
      const item = (payload as CourseStructure).lessons?.[lessonId];
      assert(!!item, "NOT_FOUND", "Lesson không có trong version đã pin.");
      return item;
    }
    assert(
      lessonId === e.content_id,
      "NOT_FOUND",
      "Lesson không thuộc enrollment.",
    );
    return payload as ItemPayload;
  }

  private allLessonIds(s: CourseStructure): string[] {
    return s.modules.flatMap((m) => m.lessonIds);
  }

  private quizLessonIds(s: CourseStructure): string[] {
    return this.allLessonIds(s).filter((id) => !!s.lessons?.[id]?.quiz);
  }

  private getLesson(p: Principal, a: Record<string, unknown>) {
    const e = this.enrollment(String(a.enrollmentId), p.orgId);
    assert(!!e, "NOT_FOUND", "Enrollment không tồn tại.");
    this.assertEnrollmentRead(e, p);
    const c = this.content(e.content_id, p.orgId)!;
    const lessonId = String(a.lessonId);
    const payload = this.pinnedLesson(e, lessonId);
    const done = this.db
      .prepare(
        "SELECT completed_at FROM progress WHERE enrollment_id=? AND lesson_id=?",
      )
      .get(e.id, lessonId) as { completed_at: string } | undefined;
    return {
      enrollmentId: e.id,
      contentId: c.id,
      lesson: {
        lessonId,
        title: payload.title,
        body: payload.body ?? null,
        url: payload.url ?? null,
        egress: payload.egress ?? c.egress,
        completedAt: done?.completed_at ?? null,
        // Answer keys never leave the server: strip `correct` flags.
        quiz: payload.quiz
          ? {
              title: payload.quiz.title,
              passScore: payload.quiz.passScore,
              questions: payload.quiz.questions.map((q) => ({
                id: q.id,
                prompt: q.prompt,
                choices: q.choices.map((ch) => ({ id: ch.id, text: ch.text })),
              })),
            }
          : null,
      },
    };
  }

  private assertEnrollmentRead(e: Enrollment, p: Principal) {
    if (e.learner === p.id || p.role === "admin") return;
    if (p.role === "manager") {
      const mgr = this.db
        .prepare("SELECT manager_id FROM accounts WHERE id=?")
        .get(e.learner) as { manager_id: string | null };
      if (mgr.manager_id === p.id) return;
    }
    fail("FORBIDDEN", "Không có quyền đọc enrollment này.");
  }

  private myLearning(p: Principal, a: Record<string, unknown>) {
    const statusFilter = typeof a.status === "string" ? a.status : null;
    const rows = this.db
      .prepare(
        "SELECT e.*,c.title,c.type,c.duration_minutes FROM enrollments e JOIN content c ON c.id=e.content_id WHERE e.learner=? AND e.org_id=? ORDER BY e.created DESC",
      )
      .all(p.id, p.orgId) as (Enrollment & {
      title: string;
      type: string;
      duration_minutes: number;
    })[];
    const items = rows
      .filter((r) => {
        if (!statusFilter || statusFilter === "all") return true;
        if (statusFilter === "in_progress") return r.status !== "completed";
        return r.status === statusFilter;
      })
      .map((r) => ({
        enrollmentId: r.id,
        contentId: r.content_id,
        title: r.title,
        type: r.type,
        status: r.status,
        assignmentId: r.assignment_id,
        dueAt: r.due_at,
        progress: this.progressSummary(r),
      }));
    const bookmarks = this.db
      .prepare(
        "SELECT b.content_id,c.title,c.type,b.saved FROM bookmarks b JOIN content c ON c.id=b.content_id WHERE b.learner=? AND b.saved=1",
      )
      .all(p.id) as { content_id: string; title: string; type: string; saved: number }[];
    return {
      items,
      bookmarks: bookmarks.map((b) => ({
        contentId: b.content_id,
        title: b.title,
        type: b.type,
      })),
    };
  }

  private progressSummary(e: Enrollment) {
    const c = this.content(e.content_id, e.org_id)!;
    const payload = this.pinnedPayload(e);
    if (c.type !== "course") {
      const done = (
        this.db
          .prepare(
            "SELECT COUNT(*) AS c FROM progress WHERE enrollment_id=?",
          )
          .get(e.id) as { c: number }
      ).c;
      const quiz = (payload as ItemPayload).quiz ? 1 : 0;
      const quizPassed = quiz
        ? (
            this.db
              .prepare(
                "SELECT 1 FROM attempts WHERE enrollment_id=? AND passed=1",
              )
              .get(e.id) as { 1?: number } | undefined
          )
          ? 1
          : 0
        : 0;
      return {
        lessonsDone: done,
        lessonsTotal: 1,
        quizzesPassed: quizPassed,
        quizzesTotal: quiz,
      };
    }
    const s = payload as CourseStructure;
    const total = this.allLessonIds(s).length;
    const done = (
      this.db
        .prepare("SELECT COUNT(*) AS c FROM progress WHERE enrollment_id=?")
        .get(e.id) as { c: number }
    ).c;
    const quizIds = this.quizLessonIds(s);
    const passed = (
      this.db
        .prepare(
          "SELECT COUNT(DISTINCT quiz_id) AS c FROM attempts WHERE enrollment_id=? AND passed=1",
        )
        .get(e.id) as { c: number }
    ).c;
    return {
      lessonsDone: done,
      lessonsTotal: total,
      quizzesPassed: passed,
      quizzesTotal: quizIds.length,
    };
  }

  private getProgress(p: Principal, a: Record<string, unknown>) {
    const e = this.enrollment(String(a.enrollmentId), p.orgId);
    assert(!!e, "NOT_FOUND", "Enrollment không tồn tại.");
    this.assertEnrollmentRead(e, p);
    const c = this.content(e.content_id, p.orgId)!;
    const lessons = this.db
      .prepare(
        "SELECT lesson_id,completed_at FROM progress WHERE enrollment_id=? ORDER BY completed_at",
      )
      .all(e.id) as { lesson_id: string; completed_at: string }[];
    const attempts = this.db
      .prepare(
        "SELECT id,quiz_id,status,score,passed,attempt_no,started,submitted FROM attempts WHERE enrollment_id=? ORDER BY started",
      )
      .all(e.id) as AttemptRow[];
    return {
      enrollment: {
        id: e.id,
        contentId: e.content_id,
        title: c.title,
        status: e.status,
        pinnedVersion: this.versionOf(e.content_version_id),
        assignmentId: e.assignment_id,
        dueAt: e.due_at,
        created: e.created,
        completedAt: e.completed_at,
      },
      lessons: lessons.map((l) => ({
        lessonId: l.lesson_id,
        completedAt: l.completed_at,
      })),
      attempts: attempts.map((t) => ({
        attemptId: t.id,
        quizId: t.quiz_id,
        status: t.status,
        score: t.score,
        passed: t.passed === null ? null : !!t.passed,
        attemptNo: t.attempt_no,
        started: t.started,
        submitted: t.submitted,
      })),
      summary: this.progressSummary(e),
    };
  }

  private versionOf(versionId: string): number {
    const v = this.db
      .prepare("SELECT version FROM content_versions WHERE id=?")
      .get(versionId) as { version: number } | undefined;
    return v?.version ?? 0;
  }

  private getAttempt(p: Principal, a: Record<string, unknown>) {
    const t = this.db
      .prepare("SELECT * FROM attempts WHERE id=? AND org_id=?")
      .get(String(a.attemptId), p.orgId) as AttemptRow | undefined;
    assert(!!t, "NOT_FOUND", "Attempt không tồn tại.");
    const e = this.enrollment(t.enrollment_id, p.orgId)!;
    this.assertEnrollmentRead(e, p);
    const quiz = this.quizOf(t);
    return {
      attempt: {
        id: t.id,
        enrollmentId: t.enrollment_id,
        quizId: t.quiz_id,
        status: t.status,
        answers: JSON.parse(t.answers),
        score: t.score,
        passed: t.passed === null ? null : !!t.passed,
        attemptNo: t.attempt_no,
        started: t.started,
        submitted: t.submitted,
      },
      quiz: {
        quizId: t.quiz_id,
        title: quiz.title,
        passScore: quiz.passScore,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          choices: q.choices.map((ch) => ({ id: ch.id, text: ch.text })),
        })),
      },
    };
  }

  // quiz_id is the item id of the quiz lesson inside the pinned version's
  // snapshot (or the pinned item itself for standalone item enrollments).
  private quizOf(t: AttemptRow): Quiz {
    const v = this.db
      .prepare("SELECT payload FROM content_versions WHERE id=?")
      .get(t.quiz_version_id) as { payload: string } | undefined;
    assert(!!v, "INTERNAL", "Quiz version không tồn tại.");
    const payload = JSON.parse(v.payload) as CourseStructure | ItemPayload;
    if ((payload as CourseStructure).modules) {
      const item = (payload as CourseStructure).lessons?.[t.quiz_id];
      assert(!!item?.quiz, "NOT_FOUND", "Quiz không có trong version đã pin.");
      return item.quiz;
    }
    const item = payload as ItemPayload;
    assert(!!item.quiz, "NOT_FOUND", "Item không phải quiz.");
    return item.quiz;
  }

  private previewAssignment(p: Principal, a: Record<string, unknown>) {
    const c = this.content(String(a.contentId), p.orgId);
    assert(!!c, "NOT_FOUND", "Nội dung không tồn tại.");
    assert(
      c.status === "published" || c.status === "retiring",
      "INVALID_ARGUMENT",
      "Chỉ gán nội dung đã publish.",
    );
    const userIds = Array.isArray(a.userIds) ? (a.userIds as string[]) : [];
    const groupIds = Array.isArray(a.groupIds) ? (a.groupIds as string[]) : [];
    const resolved = this.resolveAudience(p.orgId, userIds, groupIds);
    if (p.role === "manager") {
      const direct = new Set(this.directReports(p.id));
      const outside = resolved.filter((u) => !direct.has(u));
      assert(
        outside.length === 0,
        "FORBIDDEN",
        `Manager chỉ gán cho direct reports; ngoài phạm vi: ${outside.join(",")}.`,
      );
    }
    const already = new Set(
      (
        this.db
          .prepare(
            "SELECT learner FROM enrollments WHERE content_id=? AND org_id=?",
          )
          .all(c.id, p.orgId) as { learner: string }[]
      ).map((r) => r.learner),
    );
    return {
      contentId: c.id,
      title: c.title,
      resolved: resolved.map((u) => ({
        userId: u,
        alreadyEnrolled: already.has(u),
      })),
      unknownUsers: userIds.filter(
        (u) => !resolved.includes(u) && !this.accountExists(p.orgId, u),
      ),
    };
  }

  private accountExists(orgId: string, id: string): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM accounts WHERE id=? AND org_id=?")
      .get(id, orgId);
  }

  private directReports(managerId: string): string[] {
    return (
      this.db
        .prepare("SELECT id FROM accounts WHERE manager_id=? AND active=1")
        .all(managerId) as { id: string }[]
    ).map((r) => r.id);
  }

  private resolveAudience(
    orgId: string,
    userIds: string[],
    groupIds: string[],
  ): string[] {
    const out = new Set<string>();
    for (const u of userIds) {
      const acc = this.db
        .prepare("SELECT id,active FROM accounts WHERE id=? AND org_id=?")
        .get(u, orgId) as { id: string; active: number } | undefined;
      if (acc?.active) out.add(u);
    }
    for (const g of groupIds) {
      const members = this.db
        .prepare(
          "SELECT gm.user_id FROM group_members gm JOIN groups gr ON gr.id=gm.group_id WHERE gm.group_id=? AND gr.org_id=?",
        )
        .all(g, orgId) as { user_id: string }[];
      for (const m of members) out.add(m.user_id);
    }
    return [...out].sort();
  }

  // ---------- writes ----------

  private executeWrite(p: Principal, call: Invoke, documentId: string): Result {
    const rev = this.revisionOf(documentId);
    const a = call.arguments;
    switch (call.toolName) {
      case "learning_enroll":
        return this.enroll(p, a, rev);
      case "learning_set_bookmark":
        return this.setBookmark(p, a, rev);
      case "learning_start_attempt":
        return this.startAttempt(p, a, rev);
      case "learning_save_answer":
        return this.saveAnswer(p, a, rev);
      case "learning_submit_attempt":
        return this.submitAttempt(p, a, rev);
      case "learning_save_course":
        return this.saveCourse(p, a, documentId, rev);
      case "learning_publish_course":
        return this.publishCourse(p, a, rev);
      case "learning_create_assignment":
        return this.createAssignment(p, a, rev);
      default:
        return fail("UNSUPPORTED", `Write ${call.toolName} chưa triển khai.`);
    }
  }

  private enroll(p: Principal, a: Record<string, unknown>, rev: number) {
    const c = this.content(String(a.contentId), p.orgId);
    assert(!!c, "NOT_FOUND", "Nội dung không tồn tại.");
    assert(
      c.status === "published" || c.status === "retiring",
      "FORBIDDEN",
      "Chỉ ghi danh nội dung đã publish.",
    );
    const existing = this.db
      .prepare(
        "SELECT id,status FROM enrollments WHERE learner=? AND content_id=?",
      )
      .get(p.id, c.id) as { id: string; status: string } | undefined;
    if (existing) {
      if (existing.status === "assigned")
        this.db
          .prepare("UPDATE enrollments SET status='enrolled' WHERE id=?")
          .run(existing.id);
      return success({ enrollmentId: existing.id, status: existing.status === "assigned" ? "enrolled" : existing.status, alreadyExisted: true }, rev);
    }
    const version = this.db
      .prepare(
        "SELECT id FROM content_versions WHERE content_id=? AND version=?",
      )
      .get(c.id, c.latest_version) as { id: string } | undefined;
    assert(!!version, "INTERNAL", "Không có version để pin.");
    const id = `enr-${randomBytes(8).toString("hex")}`;
    this.db
      .prepare(
        "INSERT INTO enrollments(id,org_id,learner,content_id,content_version_id,status,assignment_id,due_at,created) VALUES(?,?,?,?,?,'enrolled',NULL,NULL,?)",
      )
      .run(id, p.orgId, p.id, c.id, version.id, new Date().toISOString());
    this.db
      .prepare("INSERT INTO aggregates(id,org_id,revision) VALUES(?,?,0)")
      .run(`enrollment:${id}`, p.orgId);
    return success({ enrollmentId: id, status: "enrolled", alreadyExisted: false }, rev);
  }

  private setBookmark(p: Principal, a: Record<string, unknown>, rev: number) {
    const c = this.content(String(a.contentId), p.orgId);
    assert(!!c, "NOT_FOUND", "Nội dung không tồn tại.");
    this.assertVisible(c, p);
    const saved = a.saved === true ? 1 : 0;
    this.db
      .prepare(
        "INSERT INTO bookmarks(org_id,learner,content_id,saved,updated) VALUES(?,?,?,?,?) ON CONFLICT(learner,content_id) DO UPDATE SET saved=excluded.saved,updated=excluded.updated",
      )
      .run(p.orgId, p.id, c.id, saved, new Date().toISOString());
    return success({ contentId: c.id, saved: !!saved }, rev);
  }

  private attemptOwner(
    p: Principal,
    enrollmentId: string,
  ): Enrollment {
    const e = this.enrollment(enrollmentId, p.orgId);
    assert(!!e, "NOT_FOUND", "Enrollment không tồn tại.");
    assert(e.learner === p.id, "FORBIDDEN", "Chỉ chủ enrollment được làm bài.");
    assert(e.status !== "completed", "INVALID_ARGUMENT", "Enrollment đã hoàn thành.");
    return e;
  }

  private lessonDone(enrollmentId: string, lessonId: string): boolean {
    return !!this.db
      .prepare(
        "SELECT 1 FROM progress WHERE enrollment_id=? AND lesson_id=?",
      )
      .get(enrollmentId, lessonId);
  }

  private startAttempt(p: Principal, a: Record<string, unknown>, rev: number) {
    const e = this.attemptOwner(p, String(a.enrollmentId));
    const c = this.content(e.content_id, p.orgId)!;
    const quizId = String(a.quizId);
    let attemptCap = 3;
    if (c.type === "item") {
      const item = this.pinnedLesson(e, quizId);
      assert(!!item.quiz, "NOT_FOUND", "Item không phải quiz.");
      assert(quizId === c.id, "NOT_FOUND", "Quiz không thuộc enrollment.");
    } else {
      const s = this.pinnedCourse(e);
      attemptCap = s.attemptCap ?? 3;
      const modIdx = s.modules.findIndex((m) =>
        m.lessonIds.includes(quizId),
      );
      assert(modIdx >= 0, "NOT_FOUND", "Quiz không có trong version đã pin.");
      const item = s.lessons?.[quizId];
      assert(!!item?.quiz, "NOT_FOUND", "Lesson không phải quiz.");
      // Prerequisites: every non-quiz lesson of the quiz's module, plus all
      // lessons of modules listed in prerequisiteModuleIndexes.
      const mustDo = new Set<string>();
      const mod = s.modules[modIdx];
      for (const lid of mod.lessonIds)
        if (!s.lessons?.[lid]?.quiz) mustDo.add(lid);
      for (const pi of mod.prerequisiteModuleIndexes ?? []) {
        const pre = s.modules[pi];
        assert(!!pre, "INTERNAL", "prerequisiteModuleIndexes sai.");
        for (const lid of pre.lessonIds)
          if (!s.lessons?.[lid]?.quiz) mustDo.add(lid);
      }
      for (const lid of mustDo)
        assert(
          this.lessonDone(e.id, lid),
          "FORBIDDEN",
          `Phải hoàn thành lesson ${lid} trước khi làm quiz.`,
        );
    }
    const open = this.db
      .prepare(
        "SELECT id FROM attempts WHERE enrollment_id=? AND quiz_id=? AND status='open'",
      )
      .get(e.id, quizId) as { id: string } | undefined;
    if (open)
      return success({ attemptId: open.id, attemptNo: this.attemptNo(open.id), reused: true }, rev);
    const count = (
      this.db
        .prepare(
          "SELECT COUNT(*) AS c FROM attempts WHERE enrollment_id=? AND quiz_id=?",
        )
        .get(e.id, quizId) as { c: number }
    ).c;
    assert(
      count < attemptCap,
      "FORBIDDEN",
      `Đã hết lượt làm quiz (tối đa ${attemptCap}).`,
    );
    const id = `att-${randomBytes(8).toString("hex")}`;
    this.db
      .prepare(
        "INSERT INTO attempts(id,org_id,enrollment_id,quiz_id,quiz_version_id,status,answers,attempt_no,started) VALUES(?,?,?,?,?,'open','{}',?,?)",
      )
      .run(
        id, p.orgId, e.id, quizId, e.content_version_id, count + 1,
        new Date().toISOString(),
      );
    return success({ attemptId: id, attemptNo: count + 1, reused: false }, rev);
  }

  private attemptNo(id: string): number {
    return (
      this.db
        .prepare("SELECT attempt_no FROM attempts WHERE id=?")
        .get(id) as { attempt_no: number }
    ).attempt_no;
  }

  private saveAnswer(p: Principal, a: Record<string, unknown>, rev: number) {
    const t = this.db
      .prepare("SELECT * FROM attempts WHERE id=? AND org_id=?")
      .get(String(a.attemptId), p.orgId) as AttemptRow | undefined;
    assert(!!t, "NOT_FOUND", "Attempt không tồn tại.");
    this.attemptOwner(p, t.enrollment_id);
    assert(t.status === "open", "INVALID_ARGUMENT", "Attempt đã nộp.");
    const quiz = this.quizOf(t);
    const question = quiz.questions.find((q) => q.id === String(a.questionId));
    assert(!!question, "NOT_FOUND", "Câu hỏi không thuộc quiz.");
    const selected = Array.isArray(a.selectedChoiceIds)
      ? (a.selectedChoiceIds as string[]).map(String)
      : undefined;
    const text = typeof a.text === "string" ? a.text : undefined;
    assert(
      selected !== undefined || text !== undefined,
      "INVALID_ARGUMENT",
      "Cần selectedChoiceIds hoặc text.",
    );
    if (selected)
      for (const ch of selected)
        assert(
          question.choices.some((c) => c.id === ch),
          "INVALID_ARGUMENT",
          `choiceId ${ch} không thuộc câu hỏi.`,
        );
    const answers = JSON.parse(t.answers) as Record<
      string,
      { selectedChoiceIds?: string[]; text?: string }
    >;
    if (selected && selected.length === 0 && text === undefined)
      delete answers[question.id];
    else
      answers[question.id] = {
        ...(selected !== undefined ? { selectedChoiceIds: selected } : {}),
        ...(text !== undefined ? { text } : {}),
      };
    this.db
      .prepare("UPDATE attempts SET answers=? WHERE id=?")
      .run(JSON.stringify(answers), t.id);
    return success({ attemptId: t.id, answered: Object.keys(answers).length }, rev);
  }

  private submitAttempt(p: Principal, a: Record<string, unknown>, rev: number) {
    const t = this.db
      .prepare("SELECT * FROM attempts WHERE id=? AND org_id=?")
      .get(String(a.attemptId), p.orgId) as AttemptRow | undefined;
    assert(!!t, "NOT_FOUND", "Attempt không tồn tại.");
    this.attemptOwner(p, t.enrollment_id);
    assert(t.status === "open", "INVALID_ARGUMENT", "Attempt đã nộp.");
    const quiz = this.quizOf(t);
    const answers = JSON.parse(t.answers) as Record<
      string,
      { selectedChoiceIds?: string[]; text?: string }
    >;
    const total = quiz.questions.length;
    const correct = quiz.questions.filter((q) => {
      const want = q.choices
        .filter((c) => c.correct === true)
        .map((c) => c.id)
        .sort();
      const got = (answers[q.id]?.selectedChoiceIds ?? []).slice().sort();
      return (
        want.length === got.length && want.every((w, i) => w === got[i])
      );
    }).length;
    const score = total === 0 ? 0 : Math.round((correct / total) * 10000) / 100;
    const passed = score >= quiz.passScore ? 1 : 0;
    this.db
      .prepare(
        "UPDATE attempts SET status='graded',score=?,passed=?,submitted=? WHERE id=?",
      )
      .run(score, passed, new Date().toISOString(), t.id);
    if (passed)
      this.db
        .prepare(
          "INSERT INTO progress(enrollment_id,lesson_id,completed_at) VALUES(?,?,?) ON CONFLICT(enrollment_id,lesson_id) DO NOTHING",
        )
        .run(t.enrollment_id, t.quiz_id, new Date().toISOString());
    this.refreshCompletion(t.enrollment_id);
    return success(
      { attemptId: t.id, score, passed: !!passed, correct, total },
      rev,
    );
  }

  // Human-only progress write (deliberately NOT a bridge tool — an agent must
  // not be able to mark lessons complete on a learner's behalf).
  markLessonComplete(
    p: Principal,
    enrollmentId: string,
    lessonId: string,
  ): Result {
    const doc = `enrollment:${enrollmentId}`;
    let before: number | null = null;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      const e = this.enrollment(enrollmentId, p.orgId);
      assert(!!e, "NOT_FOUND", "Enrollment không tồn tại.");
      assert(e.learner === p.id, "FORBIDDEN", "Chỉ chủ enrollment ghi progress.");
      const c = this.content(e.content_id, p.orgId)!;
      const agg = this.ensureAggregate(doc, p.orgId);
      before = agg.revision;
      let lessonKey: string;
      if (c.type === "item") {
        assert(
          lessonId === c.id,
          "NOT_FOUND",
          "Lesson không thuộc enrollment.",
        );
        lessonKey = c.id;
      } else {
        const s = this.pinnedCourse(e);
        assert(
          this.allLessonIds(s).includes(lessonId),
          "NOT_FOUND",
          "Lesson không có trong version đã pin.",
        );
        const item = s.lessons?.[lessonId];
        assert(
          !!item && !item.quiz,
          "INVALID_ARGUMENT",
          "Quiz hoàn thành qua attempt, không qua progress.",
        );
        lessonKey = lessonId;
      }
      this.db
        .prepare(
          "INSERT INTO progress(enrollment_id,lesson_id,completed_at) VALUES(?,?,?) ON CONFLICT(enrollment_id,lesson_id) DO NOTHING",
        )
        .run(e.id, lessonKey, new Date().toISOString());
      if (c.type === "item" && e.status !== "completed") {
        this.db
          .prepare(
            "UPDATE enrollments SET status='completed',completed_at=? WHERE id=?",
          )
          .run(new Date().toISOString(), e.id);
      }
      this.refreshCompletion(e.id);
      const after = this.bump(doc);
      this.audit(
        p.id, `ui-${Date.now()}`, doc, "internal_lesson_complete", before, after,
        "OK",
      );
      this.db.exec("COMMIT");
      const status = (
        this.db
          .prepare("SELECT status FROM enrollments WHERE id=?")
          .get(e.id) as { status: string }
      ).status;
      return success({ enrollmentId: e.id, lessonKey, status }, after);
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* no open txn */
      }
      const code: Code = error instanceof DomainError ? error.code : "INTERNAL";
      return failure(
        code,
        error instanceof Error ? error.message : "Lỗi không xác định.",
        false,
        before ?? 0,
      );
    }
  }

  private refreshCompletion(enrollmentId: string) {
    const e = this.db
      .prepare("SELECT * FROM enrollments WHERE id=?")
      .get(enrollmentId) as Enrollment;
    if (!e || e.status === "completed") return;
    const c = this.content(e.content_id, e.org_id)!;
    if (c.type !== "course") return;
    const s = this.pinnedCourse(e);
    const quizIds = new Set(this.quizLessonIds(s));
    const needLessons =
      s.completionPolicy === "all_lessons" ||
      s.completionPolicy === "all_lessons_and_quiz";
    const needQuiz =
      s.completionPolicy === "quiz_pass" ||
      s.completionPolicy === "all_lessons_and_quiz";
    let ok = true;
    for (const lid of this.allLessonIds(s)) {
      const isQuiz = quizIds.has(lid);
      if (isQuiz && !needQuiz) continue;
      if (!isQuiz && !needLessons) continue;
      if (!this.lessonDone(e.id, lid)) ok = false;
    }
    if (ok)
      this.db
        .prepare(
          "UPDATE enrollments SET status='completed',completed_at=? WHERE id=?",
        )
        .run(new Date().toISOString(), e.id);
  }

  private saveCourse(
    p: Principal,
    a: Record<string, unknown>,
    documentId: string,
    rev: number,
  ) {
    // Frozen schema: {courseId?, title, description?, modules:[{title,
    // lessonIds, prerequisiteModuleIndexes?}]}. lessonIds reference published
    // items in the same org; publish snapshots their payloads (ADR 0002).
    const modules = Array.isArray(a.modules)
      ? (a.modules as {
          title: string;
          lessonIds: string[];
          prerequisiteModuleIndexes?: number[];
        }[])
      : undefined;
    const validateModules = (ms: NonNullable<typeof modules>) => {
      assert(ms.length > 0, "INVALID_ARGUMENT", "Course cần ít nhất 1 module.");
      ms.forEach((m, i) => {
        for (const lid of m.lessonIds) {
          const item = this.content(lid, p.orgId);
          assert(
            !!item && item.type === "item" && item.status === "published",
            "INVALID_ARGUMENT",
            `lessonId ${lid} không phải item đã publish.`,
          );
        }
        for (const pi of m.prerequisiteModuleIndexes ?? [])
          assert(
            Number.isInteger(pi) && pi >= 0 && pi < i,
            "INVALID_ARGUMENT",
            `prerequisiteModuleIndexes của module ${i} phải trỏ module trước đó.`,
          );
      });
      return ms;
    };
    const toDraft = (ms: NonNullable<typeof modules>): string =>
      JSON.stringify({
        modules: ms,
        completionPolicy: "all_lessons_and_quiz",
        attemptCap: 3,
      } satisfies CourseStructure);
    if (a.courseId) {
      const c = this.content(String(a.courseId), p.orgId);
      assert(!!c && c.type === "course", "NOT_FOUND", "Course không tồn tại.");
      if (modules) {
        this.db
          .prepare(
            "UPDATE content SET draft=?,draft_revision=draft_revision+1,updated=? WHERE id=?",
          )
          .run(toDraft(validateModules(modules)), Date.now(), c.id);
      }
      if (typeof a.title === "string")
        this.db
          .prepare("UPDATE content SET title=?,updated=? WHERE id=?")
          .run(a.title, Date.now(), c.id);
      if (typeof a.description === "string")
        this.db
          .prepare("UPDATE content SET summary=?,updated=? WHERE id=?")
          .run(a.description, Date.now(), c.id);
      const fresh = this.content(c.id, p.orgId)!;
      return success({ courseId: c.id, draftRevision: fresh.draft_revision, status: fresh.status }, rev);
    }
    assert(!!modules, "INVALID_ARGUMENT", "Course mới cần modules.");
    const id = `course-${randomBytes(6).toString("hex")}`;
    this.db
      .prepare(
        "INSERT INTO content(id,org_id,type,title,summary,provider,duration_minutes,level,language,skills,topics,industry,accessibility,status,egress,license,draft,draft_revision,latest_version,created_by,updated) VALUES(?,?,'course',?,?,?,?,?,?,?,?,?,?,'draft','model_ok','synthetic',?,1,0,?,?)",
      )
      .run(
        id, p.orgId, String(a.title), String(a.description ?? ""),
        "Pear Studio", 0, "beginner",
        "vi", "[]", "[]",
        "", 0,
        toDraft(validateModules(modules)), p.id, Date.now(),
      );
    this.db
      .prepare("INSERT INTO aggregates(id,org_id,revision) VALUES(?,?,0)")
      .run(`course:${id}`, p.orgId);
    void documentId;
    return success({ courseId: id, draftRevision: 1, status: "draft" }, rev);
  }

  private publishCourse(p: Principal, a: Record<string, unknown>, rev: number) {
    const c = this.content(String(a.courseId), p.orgId);
    assert(!!c && c.type === "course", "NOT_FOUND", "Course không tồn tại.");
    const want = readInt(a.draftRevision);
    assert(
      want === c.draft_revision,
      "STALE_CONTEXT",
      `draftRevision stale: kỳ vọng ${want}, hiện ${c.draft_revision}.`,
    );
    const structure = JSON.parse(c.draft) as CourseStructure;
    assert(
      Array.isArray(structure.modules) && structure.modules.length > 0,
      "INVALID_ARGUMENT",
      "Draft rỗng — không thể publish.",
    );
    // Snapshot each referenced item's current published payload so the
    // version is immutable from a learner's point of view (ADR 0002).
    const lessons: Record<string, ItemPayload> = {};
    for (const m of structure.modules)
      for (const lid of m.lessonIds) {
        const row = this.db
          .prepare(
            "SELECT cv.payload FROM content_versions cv JOIN content c ON c.id=cv.content_id WHERE cv.content_id=? AND cv.version=c.latest_version AND c.org_id=?",
          )
          .get(lid, p.orgId) as { payload: string } | undefined;
        assert(
          !!row,
          "INVALID_ARGUMENT",
          `lessonId ${lid} chưa publish trong tenant.`,
        );
        lessons[lid] = JSON.parse(row.payload);
      }
    const version = c.latest_version + 1;
    const vid = `${c.id}-v${version}`;
    const payload = JSON.stringify({ ...structure, lessons });
    this.db
      .prepare(
        "INSERT INTO content_versions(id,content_id,org_id,version,payload,published_at,published_by) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        vid, c.id, p.orgId, version, payload, new Date().toISOString(), p.id,
      );
    this.db
      .prepare(
        "UPDATE content SET status='published',latest_version=?,updated=? WHERE id=?",
      )
      .run(version, Date.now(), c.id);
    return success({ courseId: c.id, version, versionId: vid }, rev);
  }

  private createAssignment(p: Principal, a: Record<string, unknown>, rev: number) {
    const c = this.content(String(a.contentId), p.orgId);
    assert(!!c, "NOT_FOUND", "Nội dung không tồn tại.");
    assert(
      c.status === "published" || c.status === "retiring",
      "INVALID_ARGUMENT",
      "Chỉ gán nội dung đã publish.",
    );
    const userIds = Array.isArray(a.userIds) ? (a.userIds as string[]) : [];
    const groupIds = Array.isArray(a.groupIds) ? (a.groupIds as string[]) : [];
    const resolved = this.resolveAudience(p.orgId, userIds, groupIds);
    assert(resolved.length > 0, "INVALID_ARGUMENT", "Audience rỗng.");
    if (p.role === "manager") {
      const direct = new Set(this.directReports(p.id));
      const outside = resolved.filter((u) => !direct.has(u));
      assert(
        outside.length === 0,
        "FORBIDDEN",
        `Manager chỉ gán cho direct reports; ngoài phạm vi: ${outside.join(",")}.`,
      );
    }
    const dueKind = String(a.dueKind ?? "none");
    let dueAt: string | null = null;
    let rollingDays: number | null = null;
    if (dueKind === "fixed") {
      dueAt = String(a.dueAt ?? "");
      assert(!Number.isNaN(Date.parse(dueAt)), "INVALID_ARGUMENT", "dueAt không hợp lệ.");
    } else if (dueKind === "rolling") {
      rollingDays = readInt(a.rollingDays);
      assert(
        rollingDays !== null && rollingDays >= 1 && rollingDays <= 3650,
        "INVALID_ARGUMENT",
        "rollingDays phải trong 1..3650.",
      );
    }
    const id = `asg-${randomBytes(6).toString("hex")}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO assignments(id,org_id,content_id,created_by,audience,due_kind,due_at,rolling_days,starts_at,recurrence,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,'active',?)",
      )
      .run(
        id, p.orgId, c.id, p.id,
        JSON.stringify({ userIds, groupIds }), dueKind, dueAt, rollingDays,
        (a.startsAt as string) ?? null, String(a.recurrence ?? "none"), now,
      );
    const version = this.db
      .prepare(
        "SELECT id FROM content_versions WHERE content_id=? AND version=?",
      )
      .get(c.id, c.latest_version) as { id: string };
    const insEnr = this.db.prepare(
      "INSERT INTO enrollments(id,org_id,learner,content_id,content_version_id,status,assignment_id,due_at,created) VALUES(?,?,?,?,?,'assigned',?,?,?) ON CONFLICT(learner,content_id) DO NOTHING",
    );
    const insTarget = this.db.prepare(
      "INSERT INTO assignment_targets(assignment_id,user_id) VALUES(?,?)",
    );
    const insAgg = this.db.prepare(
      "INSERT OR IGNORE INTO aggregates(id,org_id,revision) VALUES(?,?,0)",
    );
    let created = 0;
    for (const u of resolved) {
      insTarget.run(id, u);
      const enrId = `enr-${randomBytes(8).toString("hex")}`;
      const perDue =
        dueKind === "fixed"
          ? dueAt
          : dueKind === "rolling"
            ? new Date(Date.now() + rollingDays! * 86400000).toISOString()
            : null;
      const r = insEnr.run(
        enrId, p.orgId, u, c.id, version.id, id, perDue, now,
      );
      if (r.changes > 0) {
        insAgg.run(`enrollment:${enrId}`, p.orgId);
        created++;
      }
    }
    return success(
      { assignmentId: id, resolved: resolved.length, enrollmentsCreated: created },
      rev,
    );
  }
}
