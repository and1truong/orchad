import { peopleTools, peopleLibraryWrites } from "./people.ts";
import { type Tool, type Role } from "./model.ts";
import { string, integer, array, enumeration, object, tool } from "./schema.ts";
export { object } from "./schema.ts";
import {
  programTools,
  programLibraryWrites,
  programHumanTools,
} from "./programs.ts";
const lesson = object(
  {
    id: string(64),
    title: string(160),
    text: string(2500),
    kind: enumeration("text", "video", "link"),
    url: { type: "string", maxLength: 2048 },
    transcript: { type: "string", maxLength: 2500 },
    prerequisiteIds: array(string(64), 8),
    contentRef: object({ itemId: string(64), version: integer(100000, 1) }),
  },
  ["id", "title", "text", "kind", "prerequisiteIds"],
);
const question = object({
  id: string(64),
  prompt: string(400),
  options: array(string(240), 6, 2),
  correct: integer(5),
});
export const itemSchema = object(
  {
    title: string(160),
    summary: string(600),
    language: enumeration("en", "vi"),
    provider: string(100),
    license: enumeration("self-authored"),
    aiProcessingAllowed: { type: "boolean" },
    kind: enumeration("text", "video", "link"),
    text: string(2500),
    url: { type: "string", maxLength: 2048 },
    transcript: { type: "string", maxLength: 2500 },
  },
  [
    "title",
    "summary",
    "language",
    "provider",
    "license",
    "aiProcessingAllowed",
    "kind",
    "text",
  ],
);
const courseProperties = {
  title: string(160),
  summary: string(600),
  topic: string(80),
  language: enumeration("en", "vi"),
  duration: integer(600, 1),
  level: enumeration("beginner", "intermediate"),
  provider: string(100),
  aiProcessingAllowed: { type: "boolean" },
  license: enumeration("self-authored"),
  completionPolicy: enumeration("human_attestation_and_quiz"),
  lessons: array(lesson, 8, 1),
  modules: array(
    object({
      id: string(64),
      title: string(160),
      lessonIds: array(string(64), 8, 1),
      prerequisiteIds: array(string(64), 8),
    }),
    8,
    1,
  ),
  quiz: object({
    passScore: integer(100, 1),
    maxAttempts: integer(10, 1),
    questions: array(question, 8, 1),
  }),
};
export const courseSchema = object(
  courseProperties,
  Object.keys(courseProperties).filter((k) => k !== "modules"),
);
// Shared aggregate mapping for UI/test helpers and authoritative server validation.
export const libraryWrites = new Set([
  ...programLibraryWrites,
  ...peopleLibraryWrites,
  "learning_create_course",
  "learning_update_course",
  "learning_publish_course",
  "learning_retire_course",
  "learning_assign",
  "learning_create_content_item",
  "learning_update_content_item",
  "learning_publish_content_item",
  "learning_retire_content_item",
]);
const id = { courseId: string() };
const enrollment = { enrollmentId: string() };
export const learnerTools: Tool[] = [
  tool(
    "learning_search_items",
    "read",
    {
      query: { type: "string", maxLength: 160 },
      offset: integer(100000),
      limit: integer(20, 1),
    },
    "Discover published standalone item metadata. Items have no course completion or certificate.",
    [],
  ),
  tool(
    "learning_get_content_item",
    "read",
    { itemId: string(64) },
    "Read current published standalone content, respecting model-processing permission.",
  ),
  tool(
    "learning_search",
    "read",
    {
      query: { type: "string", maxLength: 160 },
      topic: string(80),
      language: enumeration("en", "vi"),
      level: enumeration("beginner", "intermediate"),
      provider: string(100),
      maxDuration: integer(600, 1),
      offset: integer(100000),
      limit: integer(20, 1),
    },
    "Search permitted published courses using keyword and explicit metadata filters. Does not perform semantic search.",
    [],
  ),
  tool(
    "learning_get_item",
    "read",
    id,
    "Read course preview, outcomes and version without answer keys.",
  ),
  tool(
    "learning_get_lesson",
    "read",
    { ...enrollment, lessonId: string() },
    "Read an enrolled lesson after prerequisites; model egress respects course license.",
  ),
  tool(
    "learning_get_my_learning",
    "read",
    { offset: integer(100000), limit: integer(20, 1) },
    "Read own assigned, ongoing, overdue, completed and saved learning.",
    [],
  ),
  tool(
    "learning_get_progress",
    "read",
    enrollment,
    "Read own authoritative enrollment progress and completion.",
  ),
  tool(
    "learning_get_attempt",
    "read",
    { attemptId: string() },
    "Read own assessment questions and submitted score; never answer keys.",
  ),
  tool(
    "learning_enroll",
    "write",
    id,
    "Enroll current learner in the latest permitted published course.",
  ),
  tool(
    "learning_set_bookmark",
    "write",
    { ...id, saved: { type: "boolean" } },
    "Save or remove a course bookmark for current learner.",
  ),
  tool(
    "learning_start_attempt",
    "write",
    enrollment,
    "Start an assessment after all required lessons. Answers and submission require human UI.",
  ),
];
export const adminTools: Tool[] = [
  tool(
    "learning_get_course_draft",
    "read",
    { courseId: string(64) },
    "Read one authorized course draft with model-processing restrictions.",
  ),
  tool(
    "learning_create_content_item",
    "write",
    { itemId: string(64), item: itemSchema },
    "Create a self-authored standalone content draft.",
  ),
  tool(
    "learning_update_content_item",
    "write",
    { itemId: string(64), item: itemSchema },
    "Update draft without changing published item versions or course snapshots.",
  ),
  tool(
    "learning_publish_content_item",
    "write",
    { itemId: string(64) },
    "Publish immutable reusable content version. References specify exact versions.",
  ),
  tool(
    "learning_retire_content_item",
    "destructive",
    { itemId: string(64) },
    "Stop discovery and new course publication using this item; existing course snapshots remain available.",
  ),
  tool(
    "learning_get_content_drafts",
    "read",
    { offset: integer(100000), limit: integer(20, 1) },
    "Read scoped standalone drafts and published versions with model-egress checks.",
    [],
  ),
  tool(
    "learning_create_course",
    "write",
    { courseId: string(64), course: courseSchema },
    "Create a validated self-authored course draft.",
  ),
  tool(
    "learning_update_course",
    "write",
    { ...id, course: courseSchema },
    "Edit draft; published versions and existing enrollment progress remain immutable.",
  ),
  tool(
    "learning_publish_course",
    "write",
    id,
    "Publish a new immutable course version from draft.",
  ),
  tool(
    "learning_retire_course",
    "destructive",
    id,
    "Stop new enrollments. Preserve enrolled content and historical learning records.",
  ),
  tool(
    "learning_get_drafts",
    "read",
    { offset: integer(100000), limit: integer(20, 1) },
    "Read bounded organization course drafts for authorized content administrators.",
    [],
  ),
];
const assignment = tool(
  "learning_assign",
  "write",
  {
    ...id,
    learnerId: string(),
    dueDate: { type: ["string", "null"], maxLength: 30 },
  },
  "Assign one course to an active learner. Managers may assign only direct reports; duplicates keep original version/due date.",
);
const report = tool(
  "learning_report_query",
  "read",
  {
    status: enumeration("in_progress", "completed", "overdue"),
    offset: integer(100000),
    limit: integer(50, 1),
  },
  "Read bounded learning records in current administrator or direct-report scope. No arbitrary SQL.",
  [],
);
export function catalog(role: Role): Tool[] {
  return [
    ...learnerTools,
    ...programTools(role),
    ...peopleTools(role),
    ...(["admin", "content_admin"].includes(role) ? adminTools : []),
    ...(["admin", "manager"].includes(role) ? [assignment, report] : []),
  ];
}
// These operations are deliberately absent from the agent catalog. Host approvals
// authorize domain mutations, but never supply learner assessment confirmation.
export const humanTools: Tool[] = [
  ...programHumanTools,
  tool(
    "human_complete_lesson",
    "write",
    { ...enrollment, lessonId: string() },
    "Learner acknowledges completion under the explicit self-attestation policy.",
  ),
  tool(
    "human_save_answer",
    "write",
    { attemptId: string(), questionId: string(), answer: integer(5) },
    "Save learner-selected answer.",
  ),
  tool(
    "human_submit_attempt",
    "write",
    { attemptId: string(), confirmed: { type: "boolean", enum: [true] } },
    "Submit learner-confirmed assessment for backend grading.",
  ),
];
