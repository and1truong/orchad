export type Role = "learner" | "manager" | "content_admin" | "assessor" | "admin";

export type Account = {
  id: string;
  role: Role;
  org_id: string;
  manager_id: string | null;
  name: string;
  active: number;
};

export type Principal = {
  id: string;
  role: Role;
  orgId: string;
  managerId: string | null;
};

export type ContentStatus = "draft" | "published" | "retiring" | "retired";
export type ContentType = "item" | "course" | "playlist" | "award";

export type ContentRow = {
  id: string;
  org_id: string;
  type: ContentType;
  title: string;
  summary: string;
  provider: string;
  duration_minutes: number;
  level: string;
  language: string;
  skills: string; // JSON array
  topics: string; // JSON array
  industry: string;
  accessibility: number;
  status: ContentStatus;
  egress: "model_ok" | "no_model";
  license: string;
  draft: string; // JSON course structure
  draft_revision: number;
  latest_version: number;
  replaced_by: string | null;
  created_by: string;
  updated: number;
};

// Content model honoring the frozen tool catalog:
// - type "item" rows are lessons; an item draft may carry a quiz payload
//   (quiz items are what learning_start_attempt's quizId points at).
// - type "course" drafts store modules of lessonIds (item ids) plus module
//   prerequisites; publishing snapshots each referenced item's payload into
//   the course version so enrolled learners see immutable content (ADR 0002).
export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; text: string; correct?: boolean }[];
};

export type Quiz = {
  title: string;
  passScore: number; // percent
  questions: QuizQuestion[];
};

export type ItemPayload = {
  title: string;
  body?: string;
  url?: string;
  quiz?: Quiz;
  egress?: "model_ok" | "no_model";
};

export type CourseModule = {
  title: string;
  lessonIds: string[];
  prerequisiteModuleIndexes?: number[];
};

export type CourseStructure = {
  modules: CourseModule[];
  completionPolicy: "all_lessons" | "quiz_pass" | "all_lessons_and_quiz";
  attemptCap: number;
  // Filled at publish: itemId -> immutable item payload snapshot.
  lessons?: Record<string, ItemPayload>;
};

export type EnrollmentStatus = "assigned" | "enrolled" | "completed";

export type EnrollmentRow = {
  id: string;
  org_id: string;
  learner: string;
  content_id: string;
  content_version_id: string;
  status: EnrollmentStatus;
  assignment_id: string | null;
  due_at: string | null;
  created: string;
  completed_at: string | null;
};

export type AttemptRow = {
  id: string;
  org_id: string;
  enrollment_id: string;
  quiz_id: string;
  quiz_version_id: string;
  status: "open" | "graded" | "pending_assessment";
  answers: string; // JSON map questionId -> choiceId
  score: number | null;
  passed: number | null;
  attempt_no: number;
  started: string;
  submitted: string | null;
};

export type AssignmentRow = {
  id: string;
  org_id: string;
  content_id: string;
  created_by: string;
  audience: string; // JSON { userIds, groupIds }
  due_kind: "fixed" | "rolling" | "none";
  due_at: string | null;
  rolling_days: number | null;
  starts_at: string | null;
  recurrence: string;
  status: "active" | "closed" | "cancelled";
  created: string;
};

export type DocKind = "workspace" | "enrollment" | "course" | "org";

export function parseDocumentId(documentId: string): {
  kind: DocKind;
  entityId: string;
} {
  const idx = documentId.indexOf(":");
  const kind = idx > 0 ? (documentId.slice(0, idx) as DocKind) : ("" as DocKind);
  const entityId = idx > 0 ? documentId.slice(idx + 1) : "";
  if (
    !["workspace", "enrollment", "course", "org"].includes(kind) ||
    !entityId ||
    entityId.includes(":")
  ) {
    throw Object.assign(new Error("documentId phải có dạng kind:id"), {
      code: "INVALID_ARGUMENT",
    });
  }
  return { kind, entityId };
}
