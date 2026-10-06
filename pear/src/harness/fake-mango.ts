// Fake Mango: deterministic "model" used by the harness page and node tests.
// It emits a fixed sequence of proposed tool calls per scenario — no model,
// no inference. A host (harness UI or test) then approves/denies/cancels each
// proposal before it reaches the bridge, reproducing the Mango gateway's
// authority flow end-to-end with zero nondeterminism.

export type ProposedCall = {
  note: string; // what the fake model is "trying" to do, for the approval UI
  toolName: string;
  arguments: Record<string, unknown>;
  write: boolean; // whether expectedRevision/idempotencyKey are required
  documentId: string; // "self" resolves to the caller's workspace aggregate
};

export type Scenario = { id: string; title: string; steps: ProposedCall[] };

const ws = (suffix: string) => ({ documentId: suffix });

export const scenarios: Scenario[] = [
  {
    id: "search-enroll",
    title: "Tìm và ghi danh khóa 'an ninh'",
    steps: [
      {
        note: "Tìm khóa học về an ninh trong catalog",
        toolName: "learning_search",
        arguments: { query: "an ninh", limit: 10 },
        write: false,
        ...ws("workspace:{self}"),
      },
      {
        note: "Ghi danh learner vào course-security",
        toolName: "learning_enroll",
        arguments: { contentId: "course-security" },
        write: true,
        ...ws("workspace:{self}"),
      },
      {
        note: "Đọc lại my learning để xác nhận",
        toolName: "learning_get_my_learning",
        arguments: { status: "all" },
        write: false,
        ...ws("workspace:{self}"),
      },
    ],
  },
  {
    id: "quiz-blocked",
    title: "Agent không thể tự hoàn thành bài học (boundary)",
    steps: [
      {
        note: "Enroll vào course-security",
        toolName: "learning_enroll",
        arguments: { contentId: "course-security" },
        write: true,
        ...ws("workspace:{self}"),
      },
      {
        note: "Thử mở quiz ngay — backend phải chặn vì chưa xong prerequisites",
        toolName: "learning_start_attempt",
        arguments: { enrollmentId: "{lastEnrollmentId}", quizId: "quiz-security" },
        write: true,
        ...ws("enrollment:{lastEnrollmentId}"),
      },
      {
        note: "Không có tool đánh dấu hoàn thành — agent chỉ đọc được progress",
        toolName: "learning_get_progress",
        arguments: { enrollmentId: "{lastEnrollmentId}" },
        write: false,
        ...ws("enrollment:{lastEnrollmentId}"),
      },
    ],
  },
  {
    id: "rbac-deny",
    title: "Learner thử tool admin → FORBIDDEN",
    steps: [
      {
        note: "Thử sửa course dưới vai learner — policy phải từ chối",
        toolName: "learning_save_course",
        arguments: {
          courseId: "course-security",
          title: "Agent sửa đổi",
        },
        write: true,
        ...ws("course:course-security"),
      },
      {
        note: "Thử giao bài cho người khác — FORBIDDEN tương tự",
        toolName: "learning_create_assignment",
        arguments: { contentId: "course-security", userIds: ["learner2"], dueKind: "none" },
        write: true,
        ...ws("org:org-demo"),
      },
    ],
  },
  {
    id: "stale-retry",
    title: "STALE_CONTEXT rồi retry đúng revision",
    steps: [
      {
        note: "Ghi danh — lấy revision mới nhất của workspace",
        toolName: "learning_enroll",
        arguments: { contentId: "item-onboarding" },
        write: true,
        ...ws("workspace:{self}"),
      },
      {
        note: "Cố ý ghi với revision cũ → STALE_CONTEXT",
        toolName: "learning_set_bookmark",
        arguments: { contentId: "item-onboarding", saved: true },
        write: true,
        ...ws("workspace:{self}"),
        // forceStale: harness subtracts 1 from expectedRevision on this step
        // (deterministic) via step marker below.
      },
      {
        note: "Retry cùng ý định với revision đúng → thành công",
        toolName: "learning_set_bookmark",
        arguments: { contentId: "item-onboarding", saved: true },
        write: true,
        ...ws("workspace:{self}"),
      },
    ],
  },
];

// Deterministic tweaks keyed on step index within a scenario.
export function forceStaleStep(scenarioId: string, index: number): boolean {
  return scenarioId === "stale-retry" && index === 1;
}
