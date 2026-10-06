import type { Role } from "./model.ts";
export const toolGroups = [
  "learning",
  "content",
  "programs",
  "people",
  "assignments",
  "reports",
] as const;
export type ToolGroup = (typeof toolGroups)[number];
export function defaultGroup(documentId: string): ToolGroup {
  return documentId.startsWith("library:") ? "content" : "learning";
}
export function splitWorkspace(documentId: string) {
  const parts = documentId.split("::");
  if (
    parts.length > 2 ||
    (parts.length === 2 && !toolGroups.includes(parts[1] as ToolGroup))
  )
    throw Error("Invalid assistant workspace");
  return {
    base: parts[0],
    group: (parts[1] ?? defaultGroup(parts[0])) as ToolGroup,
  };
}
export function scopedWorkspace(base: string, group: ToolGroup) {
  return group === defaultGroup(base) ? base : base + "::" + group;
}
export function availableGroups(_role: Role): ToolGroup[] {
  return [...toolGroups];
}
