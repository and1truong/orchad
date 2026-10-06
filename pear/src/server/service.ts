import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  Bounds,
  canonical,
  failure,
  success,
  validateArgs,
  withinMessageCap,
  type Code,
} from "@orchard/bridge-contract";
import {
  catalog,
  humanTools,
  object,
  courseSchema,
  itemSchema,
  libraryWrites,
} from "../shared/catalog.ts";
import {
  appId,
  type Call,
  type Course,
  type ContentItem,
  type Lesson,
  type Principal,
  type Result,
  type Role,
} from "../shared/model.ts";
import { requiredLessonIds } from "../shared/progression.ts";
const callSchema = object({
  requestId: { type: "string", minLength: 1, maxLength: Bounds.id },
  documentId: { type: "string", minLength: 1, maxLength: Bounds.documentId },
  toolName: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
  arguments: { type: "object" },
  expectedRevision: { type: ["integer", "null"], minimum: 0 },
  idempotencyKey: {
    type: ["string", "null"],
    minLength: 1,
    maxLength: Bounds.id,
  },
});
import { DomainError, reject, boundedPage as pageRows } from "./errors.ts";
import { AssignmentService } from "./assignments.ts";
import { PeopleService } from "./people.ts";
import { ProgramService } from "./programs.ts";
const decode = (r: any) => JSON.parse(r);
export class LearningService {
  readonly programs: ProgramService;
  readonly people: PeopleService;
  readonly assignments: AssignmentService;
  constructor(readonly db: DatabaseSync) {
    this.programs = new ProgramService(db);
    this.people = new PeopleService(db);
    this.assignments = new AssignmentService(db);
  }
  principal(id: string): Principal {
    const p = this.db
      .prepare(
        "SELECT id,tenant,name,role,manager_id,active,auth_version FROM accounts WHERE id=?",
      )
      .get(id) as unknown as Principal;
    if (!p?.active) reject("UNAUTHORIZED", "Active account required");
    return p;
  }
  personal(p: Principal) {
    return `learning:${p.tenant}:${p.id}`;
  }
  library(p: Principal) {
    return `library:${p.tenant}`;
  }
  workspace(p: Principal, id: string) {
    const w = this.db
      .prepare("SELECT * FROM workspaces WHERE id=? AND tenant=?")
      .get(id, p.tenant) as any;
    if (
      !w ||
      (w.owner !== p.id &&
        !(
          id === this.library(p) &&
          ["admin", "content_admin", "manager", "assessor"].includes(p.role)
        ))
    )
      reject("FORBIDDEN", "Workspace access denied");
    return w;
  }
  context(id: string, documentId?: string) {
    const p = this.principal(id),
      doc = documentId ?? this.personal(p),
      w = this.workspace(p, doc);
    return {
      appId,
      documentId: doc,
      revision: w.revision,
      selectionIds: [],
      summary: `Pear synthetic learning workspace for ${p.name}. Official progress is authoritative; practice does not change completion.`,
    };
  }
  description(id: string) {
    return {
      protocolVersion: "0.1" as const,
      appId,
      tools: catalog(this.principal(id).role),
    };
  }
  private course(p: Principal, id: string) {
    const c = this.db
      .prepare("SELECT * FROM courses WHERE id=? AND tenant=?")
      .get(id, p.tenant) as any;
    if (!c) reject("NOT_FOUND", "Course unavailable");
    return c;
  }
  private version(id: string, version: number): Course {
    const v = this.db
      .prepare(
        "SELECT content FROM course_versions WHERE course_id=? AND version=?",
      )
      .get(id, version) as any;
    if (!v) reject("NOT_FOUND", "Course version unavailable");
    return decode(v.content);
  }
  private contentItem(p: Principal, id: string) {
    const row = this.db
      .prepare("SELECT * FROM content_items WHERE id=? AND tenant=?")
      .get(id, p.tenant) as any;
    if (!row) reject("NOT_FOUND", "Content item unavailable");
    return row;
  }
  private itemVersion(p: Principal, id: string, version: number): ContentItem {
    this.contentItem(p, id);
    const row = this.db
      .prepare(
        "SELECT content FROM content_item_versions WHERE item_id=? AND version=?",
      )
      .get(id, version) as any;
    if (!row) reject("NOT_FOUND", "Published content version unavailable");
    return decode(row.content);
  }
  private itemPreview(row: any, value: ContentItem) {
    const { text, url, transcript, ...metadata } = value;
    return {
      id: row.id,
      state: row.state,
      version: row.latest_version,
      ...metadata,
    };
  }
  private enrollment(p: Principal, id: string) {
    const e = this.db
      .prepare(
        "SELECT * FROM enrollments WHERE id=? AND learner=? AND tenant=?",
      )
      .get(id, p.id, p.tenant) as any;
    if (!e) reject("FORBIDDEN", "Enrollment access denied");
    return e;
  }
  private attempt(p: Principal, id: string) {
    const a = this.db
      .prepare("SELECT * FROM attempts WHERE id=?")
      .get(id) as any;
    if (!a) reject("FORBIDDEN", "Attempt access denied");
    return { a, e: this.enrollment(p, a.enrollment_id) };
  }
  private recipient(p: Principal, id: string) {
    const r = this.db
      .prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1")
      .get(id, p.tenant) as any;
    if (
      !r ||
      (p.role !== "admin" && !(p.role === "manager" && r.manager_id === p.id))
    )
      reject("FORBIDDEN", "Assignment audience outside role scope");
    return r;
  }
  private resourceAccess(p: Principal, c: Call) {
    const a = c.arguments as any;
    this.programs.authorize(p, c.toolName, a);
    this.people.authorize(p, c.toolName, a);
    this.assignments.authorize(p, c.toolName, a);
    const scopedEnrollment = a.enrollmentId
      ? this.enrollment(p, a.enrollmentId)
      : a.attemptId
        ? this.attempt(p, a.attemptId).e
        : null;
    if (
      scopedEnrollment &&
      [
        "human_complete_lesson",
        "learning_start_attempt",
        "human_save_answer",
        "human_submit_attempt",
      ].includes(c.toolName) &&
      scopedEnrollment.assignment_state !== "active"
    )
      reject("FORBIDDEN", "Assignment obligation is no longer active");
    if (c.toolName === "learning_assign") this.recipient(p, a.learnerId);
    if (a.courseId && c.toolName !== "learning_create_course")
      this.course(p, a.courseId);
    if (a.itemId && c.toolName !== "learning_create_content_item")
      this.contentItem(p, a.itemId);
  }
  invoke(
    principalId: string,
    raw: unknown,
    source: "bridge" | "human" = "bridge",
  ): Result {
    let transaction = false;
    try {
      if (!withinMessageCap(raw) || !validateArgs(callSchema, raw))
        reject("INVALID_ARGUMENT", "Invalid call envelope");
      const c = raw as Call,
        p = this.principal(principalId),
        w = this.workspace(p, c.documentId);
      const t = [
        ...catalog(p.role),
        ...(source === "human" ? humanTools : []),
      ].find((t) => t.name === c.toolName);
      if (!t)
        reject("FORBIDDEN", "Tool unavailable for current role and channel");
      if (!validateArgs(t.inputSchema, c.arguments))
        reject("INVALID_ARGUMENT", "Arguments fail tool schema");
      const write = t.effect !== "read";
      if (
        write
          ? c.expectedRevision === null || c.idempotencyKey === null
          : c.expectedRevision !== null || c.idempotencyKey !== null
      )
        reject("INVALID_ARGUMENT", "Invalid revision or idempotency fields");
      const admin = libraryWrites.has(c.toolName);
      if (
        write &&
        c.documentId !== (admin ? this.library(p) : this.personal(p))
      )
        reject("STALE_CONTEXT", "Mutation targets the wrong aggregate");
      if (!write) {
        this.resourceAccess(p, c);
        const result = success(
          this.read(p, c.toolName, c.arguments, source),
          w.revision,
        );
        if (!withinMessageCap(result))
          reject("INVALID_ARGUMENT", "Result exceeds envelope limit");
        return result;
      }
      this.db.exec("BEGIN IMMEDIATE");
      transaction = true;
      const live = this.principal(principalId);
      if (
        live.tenant !== p.tenant ||
        live.role !== p.role ||
        live.auth_version !== p.auth_version
      )
        reject("STALE_CONTEXT", "Account authority changed before transaction");
      this.workspace(live, c.documentId);
      this.resourceAccess(live, c);
      const payload = canonical({
        toolName: c.toolName,
        arguments: c.arguments,
        expectedRevision: c.expectedRevision,
        source,
      });
      const old = this.db
        .prepare(
          "SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?",
        )
        .get(p.id, c.documentId, c.idempotencyKey!) as any;
      if (old) {
        if (old.payload !== payload)
          reject(
            "IDEMPOTENCY_CONFLICT",
            "Operation key reused with another payload",
          );
        this.db.exec("COMMIT");
        transaction = false;
        return decode(old.result);
      }
      const current = this.workspace(p, c.documentId).revision;
      if (current !== c.expectedRevision)
        reject(
          "STALE_CONTEXT",
          "Workspace changed; refresh before proposing another mutation",
        );
      const data = this.write(p, c.toolName, c.arguments);
      if (c.toolName === "human_submit_attempt")
        this.programs.refreshLearner(p.tenant, p.id);
      if (
        ["human_submit_attempt", "human_submit_external_record"].includes(
          c.toolName,
        )
      )
        this.assignments.refreshCompletionNotifications(p.tenant, p.id, false);
      if (c.toolName === "learning_assess_external_record") {
        const target = this.db
          .prepare(
            "SELECT learner FROM award_enrollments WHERE id=? AND tenant=?",
          )
          .get(data.awardEnrollmentId, p.tenant) as any;
        this.assignments.refreshCompletionNotifications(
          p.tenant,
          target.learner,
          false,
        );
      }
      this.db
        .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
        .run(c.documentId);
      const result = success(data, current + 1);
      if (!withinMessageCap(result))
        reject("INVALID_ARGUMENT", "Result exceeds envelope limit");
      this.db
        .prepare("INSERT INTO idempotency VALUES(?,?,?,?,?)")
        .run(
          p.id,
          c.documentId,
          c.idempotencyKey!,
          payload,
          JSON.stringify(result),
        );
      // Private assessment answer values are not copied to operational audit.
      const auditArgs =
        c.toolName === "learning_import_users"
          ? { previewHash: c.arguments.previewHash }
          : c.toolName === "learning_save_user"
            ? {
                userId: (c.arguments.user as any).id,
                role: (c.arguments.user as any).role,
                active: (c.arguments.user as any).active,
              }
            : c.toolName === "human_submit_external_record"
              ? {
                  awardEnrollmentId: c.arguments.awardEnrollmentId,
                  criterionPath: c.arguments.criterionPath,
                }
              : c.toolName === "human_save_answer"
                ? {
                    attemptId: c.arguments.attemptId,
                    questionId: c.arguments.questionId,
                  }
                : c.toolName.includes("content_item")
                  ? { itemId: c.arguments.itemId }
                  : c.toolName.includes("course")
                    ? { courseId: c.arguments.courseId }
                    : c.arguments;
      this.db
        .prepare(
          "INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          p.tenant,
          p.id,
          c.documentId,
          c.toolName,
          JSON.stringify(auditArgs),
          new Date().toISOString(),
        );
      this.db.exec("COMMIT");
      transaction = false;
      return result;
    } catch (e) {
      if (transaction) this.db.exec("ROLLBACK");
      return e instanceof DomainError
        ? failure(e.code, e.message)
        : failure("INTERNAL", "Internal learning operation error");
    }
  }
  private preview(row: any, content: Course) {
    const { lessons, quiz, ...metadata } = content;
    return {
      id: row.id,
      state: row.state,
      version: row.latest_version,
      ...metadata,
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        ...(lesson.contentRef ? { contentRef: lesson.contentRef } : {}),
        prerequisiteIds: requiredLessonIds(content, lesson),
      })),
      quiz: {
        passScore: quiz.passScore,
        maxAttempts: quiz.maxAttempts,
        questionCount: quiz.questions.length,
      },
    };
  }
  private progress(e: any) {
    const row = this.db
      .prepare("SELECT id FROM certificates WHERE enrollment_id=?")
      .get(e.id) as any;
    return {
      ...e,
      completed_lessons: decode(e.completed_lessons),
      certificateId: row?.id ?? null,
      overdue:
        e.status !== "completed" &&
        !!e.due_date &&
        e.due_date < new Date().toISOString(),
    };
  }
  private read(
    p: Principal,
    name: string,
    args: Record<string, unknown>,
    source: string,
  ): any {
    const a = args as any;
    switch (name) {
      case "learning_search_items": {
        const rows = (
          this.db
            .prepare(
              "SELECT * FROM content_items WHERE tenant=? AND state='published' ORDER BY id",
            )
            .all(p.tenant) as any[]
        )
          .map((row) =>
            this.itemPreview(
              row,
              this.itemVersion(p, row.id, row.latest_version),
            ),
          )
          .filter(
            (item) =>
              !a.query ||
              (item.title + " " + item.summary)
                .toLocaleLowerCase()
                .includes(a.query.toLocaleLowerCase()),
          );
        return pageRows(rows, a.offset ?? 0, a.limit ?? 20);
      }
      case "learning_get_content_item": {
        const row = this.contentItem(p, a.itemId);
        if (row.state !== "published")
          reject("NOT_FOUND", "Content item is not available for discovery");
        const item = this.itemVersion(p, row.id, row.latest_version);
        const preview = this.itemPreview(row, item);
        return source === "bridge" && !item.aiProcessingAllowed
          ? {
              ...preview,
              contentWithheld: true,
              reason: "Content is licensed for human reading only.",
            }
          : {
              ...preview,
              text: item.text,
              ...(item.url ? { url: item.url } : {}),
              ...(item.transcript ? { transcript: item.transcript } : {}),
            };
      }
      case "learning_get_content_drafts":
        return pageRows(
          (
            this.db
              .prepare("SELECT * FROM content_items WHERE tenant=? ORDER BY id")
              .all(p.tenant) as any[]
          ).map(({ draft, ...row }) => {
            const sanitize = (item: ContentItem) =>
              source === "bridge" && !item.aiProcessingAllowed
                ? {
                    title: item.title,
                    summary: item.summary,
                    aiProcessingAllowed: false,
                    contentWithheld: true,
                  }
                : item;
            return {
              ...row,
              draft: sanitize(decode(draft)),
              published: row.latest_version
                ? sanitize(this.itemVersion(p, row.id, row.latest_version))
                : null,
            };
          }),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      case "learning_search": {
        const candidates = this.db
          .prepare(
            "SELECT * FROM courses WHERE tenant=? AND state='published' ORDER BY id",
          )
          .all(p.tenant) as any[];
        const result = candidates
          .map((c) => this.preview(c, this.version(c.id, c.latest_version)))
          .filter(
            (c) =>
              (!a.query ||
                (c.title + " " + c.summary + " " + c.topic)
                  .toLocaleLowerCase()
                  .includes(a.query.toLocaleLowerCase())) &&
              (!a.topic || c.topic === a.topic) &&
              (!a.language || c.language === a.language) &&
              (!a.level || c.level === a.level) &&
              (!a.provider || c.provider === a.provider) &&
              (!a.maxDuration || c.duration <= a.maxDuration),
          );
        const offset = a.offset ?? 0,
          limit = a.limit ?? 10;
        return {
          items: result.slice(offset, offset + limit),
          total: result.length,
          offset,
        };
      }
      case "learning_get_item": {
        const c = this.course(p, a.courseId);
        if (c.state !== "published")
          reject("NOT_FOUND", "Course is not available for discovery");
        return this.preview(c, this.version(c.id, c.latest_version));
      }
      case "learning_get_my_learning": {
        const rows = this.db
          .prepare(
            "SELECT e.*,c.id AS content_id FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.learner=? AND e.tenant=? ORDER BY e.status,COALESCE(e.due_date,'9999'),e.id",
          )
          .all(p.id, p.tenant) as any[];
        const page = pageRows(
          rows.map((e) => ({
            ...this.progress(e),
            course: this.preview(
              {
                id: e.course_id,
                state: this.course(p, e.course_id).state,
                latest_version: e.version,
              },
              this.version(e.course_id, e.version),
            ),
          })),
          a.offset ?? 0,
          a.limit ?? 20,
        );
        return {
          enrollments: page.items,
          total: page.total,
          offset: page.offset,
          nextOffset: page.nextOffset,
          saved: this.db
            .prepare(
              "SELECT b.course_id FROM bookmarks b JOIN courses c ON c.id=b.course_id WHERE b.learner=? AND c.tenant=? ORDER BY b.course_id LIMIT 20",
            )
            .all(p.id, p.tenant),
          bounded: true,
        };
      }
      case "learning_get_progress":
        return this.progress(this.enrollment(p, a.enrollmentId));
      case "learning_get_lesson": {
        const e = this.enrollment(p, a.enrollmentId),
          v = this.version(e.course_id, e.version),
          l = v.lessons.find((l) => l.id === a.lessonId);
        if (!l) reject("NOT_FOUND", "Lesson unavailable");
        const complete = decode(e.completed_lessons);
        if (requiredLessonIds(v, l).some((id) => !complete.includes(id)))
          reject("FORBIDDEN", "Complete prerequisite lessons first");
        if (source === "bridge" && !v.aiProcessingAllowed)
          return {
            id: l.id,
            title: l.title,
            contentWithheld: true,
            reason:
              "This course does not permit model processing. Read in the human player.",
          };
        return {
          id: l.id,
          title: l.title,
          kind: l.kind,
          text: l.text,
          url: l.url ?? null,
          transcript: l.transcript ?? null,
          completed: complete.includes(l.id),
          policy: v.completionPolicy,
        };
      }
      case "learning_get_attempt": {
        const { a: at, e } = this.attempt(p, a.attemptId),
          v = this.version(e.course_id, e.version);
        if (source === "bridge" && !v.aiProcessingAllowed)
          return {
            id: at.id,
            enrollmentId: e.id,
            submitted: !!at.submitted,
            score: at.score,
            passed: at.passed === null ? null : !!at.passed,
            contentWithheld: true,
            reason:
              "Assessment content does not permit model processing; use the human player.",
          };
        return {
          id: at.id,
          enrollmentId: e.id,
          number: at.number,
          submitted: !!at.submitted,
          score: at.score,
          passed: at.passed === null ? null : !!at.passed,
          questions: v.quiz.questions.map(({ correct, ...q }) => q),
          answers: decode(at.answers),
        };
      }
      case "learning_get_drafts":
        return pageRows(
          (
            this.db
              .prepare("SELECT * FROM courses WHERE tenant=? ORDER BY id")
              .all(p.tenant) as any[]
          ).map(({ draft, ...c }) => {
            const d = decode(draft);
            return source === "bridge" && !d.aiProcessingAllowed
              ? {
                  ...c,
                  contentWithheld: true,
                  draft: {
                    title: d.title,
                    summary: d.summary,
                    aiProcessingAllowed: false,
                  },
                }
              : { ...c, draft: d };
          }),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      case "learning_get_course_draft": {
        const { draft, ...row } = this.course(p, a.courseId),
          d = decode(draft);
        return source === "bridge" && !d.aiProcessingAllowed
          ? {
              ...row,
              contentWithheld: true,
              draft: {
                title: d.title,
                summary: d.summary,
                aiProcessingAllowed: false,
              },
            }
          : { ...row, draft: d };
      }
      case "learning_report_query": {
        const rows = this.db
          .prepare(
            "SELECT e.*,u.name,u.manager_id FROM enrollments e JOIN accounts u ON u.id=e.learner WHERE e.tenant=? AND (?='admin' OR u.manager_id=?) ORDER BY e.id",
          )
          .all(p.tenant, p.role, p.id) as any[];
        const visible = rows
          .map((e) => ({ ...this.progress(e), learnerName: e.name }))
          .filter(
            (e) =>
              !a.status ||
              (a.status === "overdue" ? e.overdue : e.status === a.status),
          );
        const offset = a.offset ?? 0;
        return {
          rows: visible.slice(offset, offset + (a.limit ?? 20)),
          total: visible.length,
          offset,
        };
      }
      default:
        if (
          [
            "learning_get_notifications",
            "learning_preview_assignment_plan",
            "learning_list_assignment_plans",
          ].includes(name)
        )
          return this.assignments.read(p, name, args);
        return name.includes("profile") ||
          [
            "learning_list_users",
            "learning_list_groups",
            "learning_get_group",
            "learning_preview_group",
            "learning_preview_user_import",
            "learning_export_users",
          ].includes(name)
          ? this.people.read(p, name, args)
          : this.programs.read(p, name, args, source);
    }
  }
  private validateMedia(l: Pick<Lesson, "kind" | "url" | "transcript">) {
    if (l.kind !== "text") {
      if (!l.url) reject("INVALID_ARGUMENT", "External media URL required");
      let u: URL;
      try {
        u = new URL(l.url);
      } catch {
        reject("INVALID_ARGUMENT", "Invalid media URL");
      }
      if (u!.protocol !== "https:" || u!.username || u!.password)
        reject("INVALID_ARGUMENT", "Media must use HTTPS without credentials");
    }
    if (l.kind === "video" && !l.transcript?.trim())
      reject("INVALID_ARGUMENT", "Video transcript required");
  }
  private validateItem(value: unknown): ContentItem {
    if (
      !validateArgs(itemSchema, value) ||
      Buffer.byteLength(JSON.stringify(value)) > 12 * 1024
    )
      reject("INVALID_ARGUMENT", "Invalid standalone content structure");
    const item = structuredClone(value) as ContentItem;
    this.validateMedia(item);
    return item;
  }
  private validateCourse(p: Principal, value: unknown): Course {
    if (
      !validateArgs(courseSchema, value) ||
      !withinMessageCap(value) ||
      Buffer.byteLength(JSON.stringify(value)) > 44 * 1024
    )
      reject("INVALID_ARGUMENT", "Invalid course structure");
    const c = structuredClone(value) as Course;
    // Server snapshots the explicitly pinned item version. Caller-supplied text,
    // URL or license flags cannot override the authoritative source item.
    for (const l of c.lessons) {
      if (!l.contentRef) continue;
      const ref = l.contentRef,
        row = this.contentItem(p, ref.itemId);
      if (row.state !== "published")
        reject("FORBIDDEN", "Reusable item must be published and available");
      const item = this.itemVersion(p, ref.itemId, ref.version);
      l.title = item.title;
      l.text = item.text;
      l.kind = item.kind;
      delete l.url;
      delete l.transcript;
      if (item.url) l.url = item.url;
      if (item.transcript) l.transcript = item.transcript;
      c.aiProcessingAllowed = c.aiProcessingAllowed && item.aiProcessingAllowed;
    }
    if (
      new Set(c.lessons.map((l) => l.id)).size !== c.lessons.length ||
      new Set(c.quiz.questions.map((q) => q.id)).size !==
        c.quiz.questions.length
    )
      reject("INVALID_ARGUMENT", "Duplicate lesson/question IDs");
    const prior = new Set<string>();
    for (const l of c.lessons) {
      if (
        l.prerequisiteIds.some((id) => !prior.has(id)) ||
        new Set(l.prerequisiteIds).size !== l.prerequisiteIds.length
      )
        reject(
          "INVALID_ARGUMENT",
          "Prerequisites must reference distinct earlier lessons",
        );
      prior.add(l.id);
      this.validateMedia(l);
    }
    if (c.modules) {
      if (new Set(c.modules.map((m) => m.id)).size !== c.modules.length)
        reject("INVALID_ARGUMENT", "Duplicate module IDs");
      const flattened = c.modules.flatMap((m) => m.lessonIds);
      if (
        JSON.stringify(flattened) !== JSON.stringify(c.lessons.map((l) => l.id))
      )
        reject(
          "INVALID_ARGUMENT",
          "Modules must partition every lesson exactly once in course sequence",
        );
      const earlier = new Set<string>();
      for (const m of c.modules) {
        if (
          m.prerequisiteIds.some((id) => !earlier.has(id)) ||
          new Set(m.prerequisiteIds).size !== m.prerequisiteIds.length
        )
          reject(
            "INVALID_ARGUMENT",
            "Module prerequisites must reference distinct earlier modules",
          );
        earlier.add(m.id);
      }
    }
    for (const q of c.quiz.questions)
      if (q.correct >= q.options.length)
        reject("INVALID_ARGUMENT", "Correct choice outside options");
    if (
      !validateArgs(courseSchema, c) ||
      Buffer.byteLength(JSON.stringify(c)) > 44 * 1024
    )
      reject(
        "INVALID_ARGUMENT",
        "Resolved course exceeds schema or byte bounds",
      );
    return c;
  }
  private enroll(
    p: Principal,
    courseId: string,
    learner: string,
    assignedBy: string | null,
    dueDate: string | null,
  ) {
    const c = this.course(p, courseId);
    if (c.state !== "published")
      reject("FORBIDDEN", "Course is not accepting enrollments");
    const existing = this.db
      .prepare(
        "SELECT * FROM enrollments WHERE learner=? AND course_id=? AND assignment_cycle_id IS NULL",
      )
      .get(learner, courseId) as any;
    if (existing)
      return {
        enrollmentId: existing.id,
        alreadyEnrolled: true,
        version: existing.version,
      };
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO enrollments(id,tenant,learner,course_id,version,assigned_by,due_date) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        p.tenant,
        learner,
        courseId,
        c.latest_version,
        assignedBy,
        dueDate,
      );
    if (assignedBy)
      this.db
        .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
        .run(`learning:${p.tenant}:${learner}`);
    return {
      enrollmentId: id,
      alreadyEnrolled: false,
      version: c.latest_version,
    };
  }
  private write(
    p: Principal,
    name: string,
    args: Record<string, unknown>,
  ): any {
    const a = args as any;
    switch (name) {
      case "learning_create_content_item": {
        const item = this.validateItem(a.item);
        if (
          this.db
            .prepare("SELECT 1 FROM content_items WHERE id=?")
            .get(a.itemId)
        )
          reject("INVALID_ARGUMENT", "Content item ID already exists");
        this.db
          .prepare("INSERT INTO content_items VALUES(?,?,'draft',?,0)")
          .run(a.itemId, p.tenant, JSON.stringify(item));
        return { itemId: a.itemId, state: "draft" };
      }
      case "learning_update_content_item": {
        this.contentItem(p, a.itemId);
        const item = this.validateItem(a.item);
        this.db
          .prepare("UPDATE content_items SET draft=? WHERE id=?")
          .run(JSON.stringify(item), a.itemId);
        return { itemId: a.itemId, draftUpdated: true };
      }
      case "learning_publish_content_item": {
        const row = this.contentItem(p, a.itemId),
          item = this.validateItem(decode(row.draft)),
          version = row.latest_version + 1;
        this.db
          .prepare("INSERT INTO content_item_versions VALUES(?,?,?)")
          .run(row.id, version, JSON.stringify(item));
        this.db
          .prepare(
            "UPDATE content_items SET state='published',latest_version=? WHERE id=?",
          )
          .run(version, row.id);
        return { itemId: row.id, version, state: "published" };
      }
      case "learning_retire_content_item": {
        this.contentItem(p, a.itemId);
        this.db
          .prepare("UPDATE content_items SET state='retired' WHERE id=?")
          .run(a.itemId);
        return {
          itemId: a.itemId,
          state: "retired",
          courseSnapshotsPreserved: true,
        };
      }
      case "learning_enroll":
        return this.enroll(p, a.courseId, p.id, null, null);
      case "learning_set_bookmark": {
        const c = this.course(p, a.courseId);
        if (c.state !== "published")
          reject("FORBIDDEN", "Only available courses can be saved");
        if (a.saved)
          this.db
            .prepare("INSERT OR IGNORE INTO bookmarks VALUES(?,?)")
            .run(p.id, c.id);
        else
          this.db
            .prepare("DELETE FROM bookmarks WHERE learner=? AND course_id=?")
            .run(p.id, c.id);
        return { courseId: c.id, saved: a.saved };
      }
      case "human_complete_lesson": {
        const e = this.enrollment(p, a.enrollmentId),
          v = this.version(e.course_id, e.version),
          l = v.lessons.find((l) => l.id === a.lessonId);
        if (!l) reject("NOT_FOUND", "Lesson unavailable");
        const completed = decode(e.completed_lessons);
        if (requiredLessonIds(v, l).some((id) => !completed.includes(id)))
          reject("FORBIDDEN", "Complete prerequisites first");
        if (!completed.includes(l.id)) completed.push(l.id);
        this.db
          .prepare("UPDATE enrollments SET completed_lessons=? WHERE id=?")
          .run(JSON.stringify(completed), e.id);
        return {
          enrollmentId: e.id,
          completedLessons: completed,
          policy: v.completionPolicy,
        };
      }
      case "learning_start_attempt": {
        const e = this.enrollment(p, a.enrollmentId),
          v = this.version(e.course_id, e.version);
        if (e.status === "completed")
          reject("FORBIDDEN", "Enrollment already completed");
        if (v.lessons.some((l) => !decode(e.completed_lessons).includes(l.id)))
          reject("FORBIDDEN", "Complete all lessons before assessment");
        const pending = this.db
          .prepare(
            "SELECT * FROM attempts WHERE enrollment_id=? AND submitted=0",
          )
          .get(e.id) as any;
        if (pending) return { attemptId: pending.id, number: pending.number };
        const n =
          (
            this.db
              .prepare(
                "SELECT COUNT(*) AS n FROM attempts WHERE enrollment_id=?",
              )
              .get(e.id) as any
          ).n + 1;
        if (n > v.quiz.maxAttempts)
          reject("FORBIDDEN", "Assessment attempt limit reached");
        const id = randomUUID();
        this.db
          .prepare(
            "INSERT INTO attempts(id,enrollment_id,number) VALUES(?,?,?)",
          )
          .run(id, e.id, n);
        return { attemptId: id, number: n };
      }
      case "human_save_answer": {
        const { a: at, e } = this.attempt(p, a.attemptId),
          v = this.version(e.course_id, e.version),
          q = v.quiz.questions.find((q) => q.id === a.questionId);
        if (at.submitted)
          reject("FORBIDDEN", "Submitted answers are immutable");
        if (!q || a.answer >= q.options.length)
          reject("INVALID_ARGUMENT", "Invalid question/answer");
        const answers = decode(at.answers);
        answers[q.id] = a.answer;
        this.db
          .prepare("UPDATE attempts SET answers=? WHERE id=?")
          .run(JSON.stringify(answers), at.id);
        return { attemptId: at.id, questionId: q.id, answer: a.answer };
      }
      case "human_submit_attempt": {
        const { a: at, e } = this.attempt(p, a.attemptId),
          v = this.version(e.course_id, e.version);
        if (at.submitted)
          reject(
            "FORBIDDEN",
            "Attempt already submitted; reconcile the original key",
          );
        const answers = decode(at.answers);
        if (v.quiz.questions.some((q) => !Object.hasOwn(answers, q.id)))
          reject("INVALID_ARGUMENT", "Answer every question before submitting");
        const score = Math.floor(
            (100 *
              v.quiz.questions.filter((q) => answers[q.id] === q.correct)
                .length) /
              v.quiz.questions.length,
          ),
          passed = score >= v.quiz.passScore;
        this.db
          .prepare(
            "UPDATE attempts SET submitted=1,score=?,passed=? WHERE id=?",
          )
          .run(score, passed ? 1 : 0, at.id);
        if (passed) {
          const now = new Date().toISOString();
          this.db
            .prepare(
              "UPDATE enrollments SET status='completed',completed_at=? WHERE id=?",
            )
            .run(now, e.id);
          this.db
            .prepare("INSERT OR IGNORE INTO certificates VALUES(?,?,?)")
            .run(randomUUID(), e.id, now);
        }
        return {
          attemptId: at.id,
          score,
          passed,
          progress: this.progress(this.enrollment(p, e.id)),
        };
      }
      case "learning_create_course": {
        const c = this.validateCourse(p, a.course);
        if (this.db.prepare("SELECT 1 FROM courses WHERE id=?").get(a.courseId))
          reject("INVALID_ARGUMENT", "Course ID already exists");
        this.db
          .prepare("INSERT INTO courses VALUES(?,?,'draft',?,0)")
          .run(a.courseId, p.tenant, JSON.stringify(c));
        return { courseId: a.courseId, state: "draft" };
      }
      case "learning_update_course": {
        const c = this.validateCourse(p, a.course);
        this.course(p, a.courseId);
        this.db
          .prepare("UPDATE courses SET draft=? WHERE id=?")
          .run(JSON.stringify(c), a.courseId);
        return { courseId: a.courseId, draftUpdated: true };
      }
      case "learning_publish_course": {
        const c = this.course(p, a.courseId),
          draft = this.validateCourse(p, decode(c.draft)),
          v = c.latest_version + 1;
        this.db
          .prepare("INSERT INTO course_versions VALUES(?,?,?)")
          .run(c.id, v, JSON.stringify(draft));
        this.db
          .prepare(
            "UPDATE courses SET state='published',latest_version=? WHERE id=?",
          )
          .run(v, c.id);
        return { courseId: c.id, version: v, state: "published" };
      }
      case "learning_retire_course": {
        const c = this.course(p, a.courseId);
        this.db
          .prepare("UPDATE courses SET state='retired' WHERE id=?")
          .run(c.id);
        return {
          courseId: c.id,
          state: "retired",
          existingEnrollmentsPreserved: true,
        };
      }
      case "learning_assign": {
        this.recipient(p, a.learnerId);
        if (a.dueDate !== null) {
          const date = new Date(a.dueDate);
          if (
            !Number.isFinite(date.getTime()) ||
            date.toISOString() !== a.dueDate
          )
            reject(
              "INVALID_ARGUMENT",
              "Due date must be an exact UTC ISO timestamp",
            );
        }
        return this.enroll(p, a.courseId, a.learnerId, p.id, a.dueDate);
      }
      default:
        if (
          [
            "learning_enroll_award_course",
            "learning_read_notification",
            "learning_save_assignment_plan",
            "learning_set_assignment_plan_state",
            "learning_run_assignment_jobs",
          ].includes(name)
        )
          return this.assignments.write(p, name, args);
        return [
          "learning_save_profile",
          "learning_save_user",
          "learning_import_users",
          "learning_save_group",
        ].includes(name)
          ? this.people.write(p, name, args)
          : this.programs.write(p, name, args);
    }
  }
  certificate(id: string, certificateId: string) {
    const p = this.principal(id),
      row = this.db
        .prepare(
          "SELECT c.*,e.learner,e.tenant,e.course_id,e.version,e.status FROM certificates c JOIN enrollments e ON e.id=c.enrollment_id WHERE c.id=? AND e.learner=? AND e.tenant=?",
        )
        .get(certificateId, p.id, p.tenant) as any;
    if (!row || row.status !== "completed")
      reject("FORBIDDEN", "Certificate access denied");
    return {
      ...row,
      title: this.version(row.course_id, row.version).title,
      learnerName: p.name,
      issuer: "Pear synthetic development portal",
      accredited: false,
    };
  }
}
