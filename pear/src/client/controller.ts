import {
  appId,
  failure,
  type Bridge,
  type Invoke,
  type Result,
} from "../shared/contract.ts";
import { catalog } from "../shared/catalog.ts";

export type SessionInfo = {
  principal: string;
  role: string;
  orgId: string;
  csrf: string;
  sessionEpoch: string;
};

export type CatalogItem = {
  id: string;
  type: string;
  title: string;
  summary: string;
  provider: string;
  durationMinutes: number;
  level: string;
  status: string;
  latestVersion: number;
  skills: string[];
  topics: string[];
};

export type ProgressSummary = {
  lessonsDone: number;
  lessonsTotal: number;
  quizzesPassed: number;
  quizzesTotal: number;
};

export type EnrollmentListItem = {
  enrollmentId: string;
  contentId: string;
  title: string;
  type: string;
  status: "assigned" | "enrolled" | "completed";
  assignmentId: string | null;
  dueAt: string | null;
  progress: ProgressSummary;
};

export type ModuleView = {
  index: number;
  title: string;
  lessonIds: string[];
  prerequisiteModuleIndexes: number[];
};

export type ItemDetail = {
  item: CatalogItem;
  structure: {
    modules?: ModuleView[];
    completionPolicy?: string;
    attemptCap?: number;
    title?: string;
  } | null;
  myEnrollment: { id: string; status: string } | null;
};

export type ProgressView = {
  enrollment: {
    id: string;
    contentId: string;
    title: string;
    status: string;
    pinnedVersion: number;
    assignmentId: string | null;
    dueAt: string | null;
    completedAt: string | null;
  };
  lessons: { lessonId: string; completedAt: string }[];
  attempts: {
    attemptId: string;
    quizId: string;
    status: string;
    score: number | null;
    passed: boolean | null;
    attemptNo: number;
  }[];
  summary: ProgressSummary;
};

export type LessonView = {
  enrollmentId: string;
  contentId: string;
  lesson: {
    lessonId: string;
    title: string;
    body: string | null;
    url: string | null;
    egress: string;
    completedAt: string | null;
    quiz: {
      title: string;
      passScore: number;
      questions: {
        id: string;
        prompt: string;
        choices: { id: string; text: string }[];
      }[];
    } | null;
  };
};

export type AttemptView = {
  attempt: {
    id: string;
    status: string;
    answers: Record<string, { selectedChoiceIds?: string[]; text?: string }>;
    score: number | null;
    passed: boolean | null;
    attemptNo: number;
  };
  quiz: {
    quizId: string;
    title: string;
    passScore: number;
    questions: {
      id: string;
      prompt: string;
      choices: { id: string; text: string }[];
    }[];
  };
};

export type Route =
  | { view: "home" }
  | { view: "catalog" }
  | { view: "item"; itemId: string }
  | { view: "player"; enrollmentId: string; lessonId?: string };

export class AppController {
  session: SessionInfo | null = null;
  route: Route = { view: "home" };
  revisions = new Map<string, number>();
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  notify() {
    for (const fn of this.listeners) fn();
  }

  private async request(path: string, body?: unknown) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: body
        ? {
            "Content-Type": "application/json",
            "X-CSRF-Token": this.session?.csrf ?? "",
          }
        : {},
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json()) as Result | Record<string, unknown>;
    if (!res.ok && (data as Result).error)
      throw Object.assign(
        new Error((data as Result).error!.message),
        { result: data },
      );
    return data as Result;
  }

  async restore() {
    try {
      const s = await this.request("/api/session");
      this.session = s.data as unknown as SessionInfo;
    } catch {
      this.session = null;
    }
    this.notify();
  }

  async login(username: string, password: string) {
    await this.request("/api/login", { username, password });
    const s = await this.request("/api/session");
    this.session = s.data as unknown as SessionInfo;
    this.notify();
  }

  async logout() {
    await this.request("/api/logout", {});
    this.session = null;
    this.revisions.clear();
    this.route = { view: "home" };
    this.notify();
  }

  navigate(route: Route) {
    this.route = route;
    this.notify();
  }

  workspaceDoc(): string {
    return `workspace:${this.session!.principal}`;
  }

  // Every result carries the aggregate revision; cache it so writes can pass
  // expectedRevision without extra round-trips.
  private noteRevision(documentId: string, r: Result) {
    if (r.revision !== null && r.revision !== undefined)
      this.revisions.set(documentId, r.revision);
  }

  async invoke(call: Invoke): Promise<Result> {
    const res = await fetch("/api/invoke", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": this.session?.csrf ?? "",
      },
      body: JSON.stringify(call),
    });
    const result = (await res.json()) as Result;
    if (result.revision !== null && result.revision !== undefined)
      this.noteRevision(call.documentId, result);
    return result;
  }

  async read<T>(documentId: string, toolName: string, args: Record<string, unknown>): Promise<T> {
    const r = await this.invoke({
      requestId: crypto.randomUUID(),
      documentId,
      toolName,
      arguments: args,
      expectedRevision: null,
      idempotencyKey: null,
    });
    if (!r.ok)
      throw Object.assign(new Error(r.error?.message ?? "read failed"), {
        result: r,
      });
    return r.data as T;
  }

  async write(
    documentId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Result> {
    const expected = this.revisions.get(documentId) ?? 0;
    const r = await this.invoke({
      requestId: crypto.randomUUID(),
      documentId,
      toolName,
      arguments: args,
      expectedRevision: expected,
      idempotencyKey: crypto.randomUUID(),
    });
    return r;
  }

  async search(args: Record<string, unknown>) {
    return this.read<{ total: number; items: CatalogItem[] }>(
      this.workspaceDoc(),
      "learning_search",
      args,
    );
  }

  async item(itemId: string, docId?: string) {
    return this.read<ItemDetail>(docId ?? this.workspaceDoc(), "learning_get_item", {
      itemId,
    });
  }

  async myLearning(status = "all") {
    return this.read<{
      items: EnrollmentListItem[];
      bookmarks: { contentId: string; title: string; type: string }[];
    }>(this.workspaceDoc(), "learning_get_my_learning", { status });
  }

  async progress(enrollmentId: string) {
    return this.read<ProgressView>(
      `enrollment:${enrollmentId}`,
      "learning_get_progress",
      { enrollmentId },
    );
  }

  async lesson(enrollmentId: string, lessonId: string) {
    return this.read<LessonView>(
      `enrollment:${enrollmentId}`,
      "learning_get_lesson",
      { enrollmentId, lessonId },
    );
  }

  async attempt(attemptId: string, enrollmentId: string) {
    return this.read<AttemptView>(
      `enrollment:${enrollmentId}`,
      "learning_get_attempt",
      { attemptId },
    );
  }

  async completeLesson(enrollmentId: string, lessonId: string) {
    const r = await this.request(
      `/api/enrollments/${enrollmentId}/lessons/${lessonId}/complete`,
      {},
    );
    this.noteRevision(`enrollment:${enrollmentId}`, r);
    return r;
  }

  // ---------- bridge ----------
  currentAggregate(): string {
    const r = this.route;
    if (r.view === "player") return `enrollment:${r.enrollmentId}`;
    if (r.view === "item" && r.itemId.startsWith("course-"))
      return `course:${r.itemId}`;
    return this.workspaceDoc();
  }

  contextSummary(): string {
    const r = this.route;
    if (r.view === "home") return "Trang chủ học tập: khóa được giao, đang học, bookmark.";
    if (r.view === "catalog") return "Catalog khóa học: tìm kiếm, lọc, xem trước và ghi danh.";
    if (r.view === "item") return `Chi tiết nội dung ${r.itemId}: metadata + cấu trúc module.`;
    return `Course player của enrollment ${(r as { enrollmentId?: string }).enrollmentId}: lesson player + quiz.`;
  }

  bridge(): Bridge {
    return {
      describe: () => ({
        protocolVersion: "0.1" as const,
        appId,
        tools: structuredClone(catalog),
      }),
      getContext: async () => {
        const s = await this.request("/api/session");
        this.session = s.data as unknown as SessionInfo;
        const doc = this.currentAggregate();
        return {
          appId,
          documentId: doc,
          revision: this.revisions.get(doc) ?? 0,
          selectionIds: [],
          summary: this.contextSummary().slice(0, 400),
          sessionEpoch: this.session.sessionEpoch,
        };
      },
      invoke: (call) => this.invoke(call),
    };
  }
}
