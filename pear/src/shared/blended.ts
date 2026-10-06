import { object, string, integer, array, tool } from "./schema.ts";
import type { Role } from "./model.ts";
export interface EventSession {
  id: string;
  startsAt: string;
  endsAt: string;
  cutoffAt: string;
  timezone: string;
  capacity: number;
  location: string;
  joinUrl?: string;
}
export const submissionSchema = object({
  rubric: string(600),
  maxAttempts: integer(10, 1),
  passScore: integer(100, 1),
});
export const sessionsSchema = array(
  object(
    {
      id: string(64),
      startsAt: string(40),
      endsAt: string(40),
      cutoffAt: string(40),
      timezone: string(80),
      capacity: integer(500, 1),
      location: string(200),
      joinUrl: string(2048),
    },
    [
      "id",
      "startsAt",
      "endsAt",
      "cutoffAt",
      "timezone",
      "capacity",
      "location",
    ],
  ),
  8,
  1,
);
const scope = { enrollmentId: string(128), lessonId: string(64) };
export function blendedTools(role: Role) {
  return [
    tool(
      "learning_get_blended_lesson",
      "read",
      scope,
      "Read own submission status or upcoming event sessions and booking; no private files or review rubric.",
    ),
    tool(
      "learning_book_session",
      "write",
      { ...scope, sessionId: string(64) },
      "Book an available session for own unlocked lesson; server enforces capacity and cutoff.",
    ),
    tool(
      "learning_cancel_booking",
      "write",
      { bookingId: string(128) },
      "Cancel own unassessed booking before its session starts; history remains.",
    ),
    ...(["admin", "assessor"].includes(role)
      ? [
          tool(
            "learning_get_blended_queue",
            "read",
            { offset: integer(100000), limit: integer(20, 1) },
            "Read bounded pending submission and event attendance metadata in delegated course scope.",
            [],
          ),
        ]
      : []),
  ];
}
export const blendedHumanTools = [
  tool(
    "human_submit_submission",
    "write",
    {
      ...scope,
      assetId: string(64),
      confirmed: { type: "boolean", enum: [true] },
    },
    "Learner confirms own uploaded assignment; submission alone is not passing.",
  ),
  tool(
    "human_get_submission",
    "read",
    { submissionId: string(128) },
    "Read own or delegated human submission, file reference and pinned review rubric.",
  ),
  tool(
    "human_assess_submission",
    "write",
    { submissionId: string(128), points: integer(100), reason: string(600) },
    "Scoped human assessor grades a pinned assignment; server derives passing lesson completion.",
  ),
  tool(
    "human_mark_attendance",
    "write",
    {
      bookingId: string(128),
      present: { type: "boolean" },
      reason: string(600),
    },
    "Scoped human instructor records actual attendance after the session starts.",
  ),
];
export const blendedLibraryWrites = new Set([
  "human_assess_submission",
  "human_mark_attendance",
]);
