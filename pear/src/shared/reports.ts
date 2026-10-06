import { string, integer, array, enumeration, object, tool } from "./schema.ts";
import type { Role, Tool } from "./model.ts";
export const reportColumns = [
  "learnerId",
  "learnerName",
  "contentId",
  "title",
  "kind",
  "version",
  "status",
  "source",
  "dueDate",
  "completedAt",
  "progress",
  "earned",
  "target",
  "unit",
  "cycleId",
  "score",
  "requiredComplete",
  "estimatedMinutes",
  "observedSeconds",
] as const;
export type ReportColumn = (typeof reportColumns)[number];
export interface ReportSpec {
  title: string;
  template: "progress" | "completions" | "overdue" | "awards";
  query: string;
  kind: "all" | "course" | "award" | "item";
  status:
    | "all"
    | "in_progress"
    | "completed"
    | "overdue"
    | "withdrawn"
    | "cancelled";
  source: "all" | "assigned" | "self";
  learnerId: string;
  contentId: string;
  completedFrom: string | null;
  completedTo: string | null;
  columns: ReportColumn[];
  sortBy: ReportColumn;
  descending: boolean;
}
export const reportSchema = object({
  title: string(160),
  template: enumeration("progress", "completions", "overdue", "awards"),
  query: string(200, 0),
  kind: enumeration("all", "course", "award", "item"),
  status: enumeration(
    "all",
    "in_progress",
    "completed",
    "overdue",
    "withdrawn",
    "cancelled",
  ),
  source: enumeration("all", "assigned", "self"),
  learnerId: string(64, 0),
  contentId: string(64, 0),
  completedFrom: { type: ["string", "null"], maxLength: 10 },
  completedTo: { type: ["string", "null"], maxLength: 10 },
  columns: array(enumeration(...reportColumns), 19, 1),
  sortBy: enumeration(...reportColumns),
  descending: { type: "boolean" },
});
const page = {
  offset: integer(100000),
  limit: integer(50, 1),
  snapshotHash: string(64),
};
export const reportLibraryWrites = [
  "learning_save_report",
  "learning_delete_report",
];
export function reportTools(role: Role): Tool[] {
  return [
    tool(
      "learning_get_transcript",
      "read",
      page,
      "Read own course, standalone and award ledger, including recurring cycles and completion source/version; standalone completion is learner-confirmed reading, not an assessment or certificate.",
      [],
    ),
    ...(["admin", "manager"].includes(role)
      ? [
          tool(
            "learning_report_preview",
            "read",
            { spec: reportSchema, ...page },
            "Evaluate a structured report spec with live tenant/direct-report scope. Filters/columns are bounded, never SQL.",
            ["spec"],
          ),
          tool(
            "learning_list_saved_reports",
            "read",
            page,
            "Read own saved report definitions and ownership; no sharing bypass.",
            [],
          ),
          tool(
            "learning_save_report",
            "write",
            { reportId: string(64), spec: reportSchema },
            "Create/update own saved report. Creator-only update, with server validation and live audience checks.",
          ),
          tool(
            "learning_delete_report",
            "destructive",
            { reportId: string(64) },
            "Delete own saved report definition without deleting learning records.",
          ),
          tool(
            "learning_export_report",
            "read",
            {
              spec: reportSchema,
              rows: enumeration("filtered", "all"),
              columns: enumeration("visible", "all"),
              ...page,
            },
            "Export explicitly selected authorized report rows/columns as formula-safe paginated CSV. All rows never expands authorization.",
            ["spec", "rows", "columns"],
          ),
        ]
      : []),
  ];
}
export const freshReport = (): ReportSpec => ({
  title: "Learning progress",
  template: "progress",
  query: "",
  kind: "all",
  status: "all",
  source: "all",
  learnerId: "",
  contentId: "",
  completedFrom: null,
  completedTo: null,
  columns: [
    "learnerName",
    "title",
    "kind",
    "version",
    "status",
    "source",
    "dueDate",
    "completedAt",
    "progress",
  ],
  sortBy: "learnerName",
  descending: false,
});
