import { tool, string, integer } from "./schema.ts";
export const feedbackTools = [
  tool(
    "learning_get_course_ratings",
    "read",
    {
      courseId: string(64),
      version: integer(100000, 1),
    },
    "Read aggregate learner ratings for one visible published version. Ratings are voluntary opinions, not official scores.",
    ["courseId"],
  ),
];
export const feedbackHumanTools = [
  tool(
    "human_get_course_feedback",
    "read",
    { enrollmentId: string(128) },
    "Read own private feedback for a completed course version.",
  ),
  tool(
    "human_save_course_feedback",
    "write",
    {
      enrollmentId: string(128),
      rating: integer(5, 1),
      comment: string(1200, 0),
      confirmed: { type: "boolean", enum: [true] },
    },
    "Save learner-confirmed voluntary rating and private feedback for an own completed version. Never changes official progress.",
  ),
  tool(
    "human_list_course_feedback",
    "read",
    {
      courseId: string(64),
      version: integer(100000, 1),
      offset: integer(100000),
      limit: integer(20, 1),
    },
    "Tenant administrator reads bounded private course feedback. No feedback bodies are exposed to agents.",
    ["courseId", "version"],
  ),
];
