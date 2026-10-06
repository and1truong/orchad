import { array, integer, string, enumeration, object, tool } from "./schema.ts";
import type { Role, Tool } from "./model.ts";
export const questionSchema = object(
  {
    id: string(64),
    prompt: string(400),
    options: array(string(240), 8),
    correct: integer(7),
    kind: enumeration("mcq", "matching", "blanks", "long_answer"),
    points: integer(20, 1),
    prompts: array(string(240), 8, 1),
    matches: array(integer(7), 8, 1),
    correctAnswers: array(string(200), 8, 1),
    rubric: string(600),
  },
  ["id", "prompt", "options", "correct"],
);
export const answerSchema = {
  type: ["integer", "string", "array"],
  minimum: 0,
  maximum: 7,
  maxLength: 4000,
  maxItems: 8,
  items: {
    type: ["integer", "string"],
    minimum: -1,
    maximum: 7,
    maxLength: 200,
  },
};
export const assessmentLibraryWrites = [
  "learning_set_course_assessor",
  "human_assess_answer",
  "human_reset_assessment",
];
export function assessmentTools(role: Role): Tool[] {
  return [
    ...(["admin", "content_admin"].includes(role)
      ? [
          tool(
            "learning_set_course_assessor",
            "write",
            {
              courseId: string(64),
              assessorId: string(64),
              enabled: { type: "boolean" },
            },
            "Delegate/revoke course essay assessment to an active same-tenant assessor; no score argument.",
          ),
        ]
      : []),
    ...(["admin", "assessor"].includes(role)
      ? [
          tool(
            "learning_get_assessment_queue",
            "read",
            { offset: integer(100000), limit: integer(50, 1) },
            "Read scoped essay-assessment queue metadata. Learner responses and grading are human-only.",
            ["offset", "limit"],
          ),
        ]
      : []),
  ];
}
export const assessmentHumanTools = [
  tool(
    "human_get_assessment_submission",
    "read",
    { attemptId: string(64) },
    "Read delegated submitted answers and rubric in human assessor UI.",
  ),
  tool(
    "human_assess_answer",
    "write",
    {
      attemptId: string(64),
      questionId: string(64),
      points: integer(20),
      reason: string(600),
    },
    "Human assessor commits a final rubric score with reason; official grade is computed by backend.",
  ),
  tool(
    "human_reset_assessment",
    "write",
    {
      enrollmentId: string(64),
      extraAttempts: integer(10, 1),
      reason: string(600),
    },
    "Admin grants bounded further attempts after a failed assessment; preserve all prior attempts.",
  ),
];
