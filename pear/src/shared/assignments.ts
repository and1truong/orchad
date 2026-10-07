import { string, integer, array, enumeration, object, tool } from "./schema.ts";
import type { Role, Tool } from "./model.ts";
export interface AssignmentPlan {
  title: string;
  targetKind: "course" | "award";
  targetId: string;
  audienceKind: "individuals" | "group";
  learnerIds: string[];
  groupId: string;
  membership: "fixed" | "dynamic";
  startsAt: string;
  repeatDays: number;
  repeatMonths?: number;
  timeZone?: string;
  dstChoice?: "earlier" | "later";
  endAt: string | null;
  dueKind: "none" | "fixed" | "rolling";
  fixedDueAt: string | null;
  rollingDays: number;
}
export const planSchema = object({
  title: string(160),
  targetKind: enumeration("course", "award"),
  targetId: string(64),
  audienceKind: enumeration("individuals", "group"),
  learnerIds: array(string(64), 100),
  groupId: string(64, 0),
  membership: enumeration("fixed", "dynamic"),
  startsAt: string(40),
  repeatDays: integer(366, 0),
  repeatMonths: integer(12, 1),
  timeZone: string(80),
  dstChoice: enumeration("earlier", "later"),
  endAt: { type: ["string", "null"], maxLength: 40 },
  dueKind: enumeration("none", "fixed", "rolling"),
  fixedDueAt: { type: ["string", "null"], maxLength: 40 },
  rollingDays: integer(366, 0),
}, ["title", "targetKind", "targetId", "audienceKind", "learnerIds", "groupId", "membership", "startsAt", "repeatDays", "endAt", "dueKind", "fixedDueAt", "rollingDays"]);
const page = { offset: integer(100000), limit: integer(20, 1) };
export const assignmentLibraryWrites = [
  "learning_save_assignment_plan",
  "learning_set_assignment_plan_state",
  "learning_run_assignment_jobs",
];
export function assignmentTools(role: Role): Tool[] {
  return [
    tool(
      "learning_enroll_award_course",
      "write",
      { awardEnrollmentId: string(), courseId: string(64), criterionPath:string(768) },
      "Enroll own course referenced by an enrolled award, retaining its permitted version; recurring award cycles receive a fresh course ledger.",
      ["awardEnrollmentId","courseId"],
    ),
    tool(
      "learning_get_notifications",
      "read",
      page,
      "Read own durable in-app assignment notifications. No email/channel delivery is implied.",
      [],
    ),
    tool(
      "learning_read_notification",
      "write",
      { notificationId: string() },
      "Mark one own in-app notification read.",
    ),
    ...(["admin", "manager"].includes(role)
      ? [
          tool(
            "learning_preview_assignment_plan",
            "read",
            { plan: planSchema, ...page },
            "Validate target, audience, fixed/dynamic membership and UTC-day or timezone/calendar-month due/recurrence policy; preview current authorized recipients without dispatch.",
            ["plan"],
          ),
          tool(
            "learning_list_assignment_plans",
            "read",
            page,
            "Read tenant/admin or own/manager plans and durable cycle counts.",
            [],
          ),
          tool(
            "learning_save_assignment_plan",
            "write",
            { planId: string(64), plan: planSchema, reason: string(600) },
            "Create/edit future assignment rules and pin target version. Existing cycles/history remain immutable. An admin edit adopts responsibility for the plan.",
          ),
          tool(
            "learning_set_assignment_plan_state",
            "destructive",
            {
              planId: string(64),
              state: enumeration("active", "closed", "cancelled"),
              reason: string(600),
            },
            "Close future delivery or cancel outstanding cycle obligations while preserving progress/history; reactivation cannot resurrect cancelled obligations.",
          ),
        ]
      : []),
    ...(role === "admin"
      ? [
          tool(
            "learning_run_assignment_jobs",
            "write",
            {},
            "Process bounded due assignment cycles at authoritative server time, atomically deduplicating enrollment and in-app notifications.",
          ),
        ]
      : []),
  ];
}
