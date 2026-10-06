import { string, integer, array, enumeration, object, tool } from "./schema.ts";
import type { Role, Tool } from "./model.ts";
export interface Reference {
  kind: "course" | "item" | "award" | "external";
  id: string;
  version?: number;
}
export interface Requirement {
  id: string;
  title: string;
  required: boolean;
  credits: number;
  alternatives: Reference[];
}
export interface Playlist {
  title: string;
  summary: string;
  access: "tenant" | "author" | "groups";
  groupIds?: string[];
  items: Reference[];
}
export interface Award {
  title: string;
  summary: string;
  access: "tenant" | "author" | "groups";
  groupIds?: string[];
  unit: "credits" | "hours";
  target: number;
  ongoing: boolean;
  moderatedExternal: boolean;
  requirements: Requirement[];
}
const metadata = {
  title: string(160),
  summary: string(600),
  access: enumeration("tenant", "author", "groups"),
  groupIds: array(string(64),8,1),
};
const reference = (kinds: string[]) =>
  object({ kind: enumeration(...kinds), id: string(64) });
const optionalAudience=(properties:Record<string,unknown>)=>object(properties,Object.keys(properties).filter(k=>k!=="groupIds"));
export const playlistSchema = optionalAudience({
  ...metadata,
  items: array(reference(["course", "item"]), 16, 1),
});
export const awardSchema = optionalAudience({
  ...metadata,
  unit: enumeration("credits", "hours"),
  target: integer(10000, 1),
  ongoing: { type: "boolean" },
  moderatedExternal: { type: "boolean" },
  requirements: array(
    object({
      id: string(64),
      title: string(160),
      required: { type: "boolean" },
      credits: integer(1000, 1),
      alternatives: array(reference(["course", "award", "external"]), 8, 1),
    }),
    16,
    1,
  ),
});
export const programLibraryWrites = [
  "learning_save_playlist",
  "learning_save_award",
  "learning_publish_collection",
  "learning_retire_collection",
  "learning_unpublish_collection",
  "learning_assign_award",
  "learning_set_award_assessor",
  "learning_assess_external_record",
];
const page = { offset: integer(100000), limit: integer(20, 1) },
  collection = { collectionId: string(64) },
  enrollment = { awardEnrollmentId: string() };
const learner = [
  tool(
    "learning_search_collections",
    "read",
    { ...page, kind: enumeration("playlist", "award") },
    "Discover authorized playlists and awards. Playlists do not have assignment/completion.",
    [],
  ),
  tool(
    "learning_get_collection",
    "read",
    { ...collection, ...page },
    "Read an authorized immutable collection and permitted reference metadata.",
    ["collectionId"],
  ),
  tool(
    "learning_get_my_awards",
    "read",
    page,
    "Read own award progress, required/elective rules, moderated evidence and authoritative credits.",
    [],
  ),
  tool(
    "learning_enroll_award",
    "write",
    collection,
    "Enroll current learner in a published award; retain the first enrolled version.",
  ),
];
const authors = [
  tool(
    "learning_save_playlist",
    "write",
    { ...collection, playlist: playlistSchema },
    "Create/update a self-authored playlist draft. Not assignable; no completion of its own.",
  ),
  tool(
    "learning_save_award",
    "write",
    { ...collection, award: awardSchema },
    "Create/update an award draft with required/elective alternatives, credit/hour target and ongoing policy.",
  ),
  tool(
    "learning_get_collection_drafts",
    "read",
    page,
    "Read scoped collection drafts without assessment records.",
    [],
  ),
  tool(
    "learning_publish_collection",
    "write",
    collection,
    "Validate graph and publish a new immutable collection version, pinning content/nested award versions.",
  ),
  tool("learning_unpublish_collection", "destructive", collection, "Withdraw published playlist or award from discovery and new enrollment/references; preserve enrolled immutable award rules."),
  tool(
    "learning_retire_collection",
    "destructive",
    collection,
    "Retire new discovery/enrollment; preserve enrolled award rules and history.",
  ),
];
const assessment = [
  tool(
    "learning_get_external_records",
    "read",
    { ...page, ...collection },
    "Read external learning submissions for an authorized award assessor. Evidence text is human-only.",
    ["collectionId"],
  ),
  tool(
    "learning_assess_external_record",
    "write",
    { recordId: string(), accepted: { type: "boolean" }, reason: string(600) },
    "Record a final scoped moderation decision with a reason; pending/rejected evidence gives no credit.",
  ),
];
export function programTools(role: Role): Tool[] {
  return [
    ...learner,
    ...(["admin", "content_admin"].includes(role) ? authors : []),
    ...(["admin", "manager"].includes(role)
      ? [
          tool(
            "learning_assign_award",
            "write",
            { ...collection, learnerId: string() },
            "Assign an award within current tenant/direct-report scope. Playlists cannot be assigned.",
          ),
        ]
      : []),
    ...(role === "admin"
      ? [
          tool(
            "learning_set_award_assessor",
            "write",
            {
              ...collection,
              assessorId: string(),
              enabled: { type: "boolean" },
            },
            "Grant/revoke assessment scope for one active same-tenant assessor, without org-admin rights.",
          ),
        ]
      : []),
    ...(["admin", "assessor"].includes(role) ? assessment : []),
  ];
}
export const programHumanTools = [
  tool(
    "human_submit_external_record",
    "write",
    {
      ...enrollment,
      criterionPath: string(768),
      amount: integer(1000, 1),
      evidence: string(2000),
      assetId: string(64),
      confirmed: { type: "boolean", enum: [true] },
    },
    "Learner-confirmed external learning evidence; moderation or explicit self-attestation policy determines credit.",
    ["awardEnrollmentId", "criterionPath", "amount", "evidence", "confirmed"],
  ),
];
