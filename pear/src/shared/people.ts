import { string, integer, array, enumeration, object, tool } from "./schema.ts";
import type { Role, Tool } from "./model.ts";
export interface Field {
  name: string;
  value: string;
}
export interface UserInput {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  managerId: string | null;
  preferredLanguage: "en" | "vi";
  interests: string[];
  customFields: Field[];
}
export interface Rule {
  field: "name" | "role" | "managerId" | "active" | "createdAt" | "customField";
  customField: string;
  operator: "equals" | "notEquals" | "contains" | "before" | "after";
  value: string;
}
export interface Group {
  name: string;
  kind: "static" | "dynamic";
  memberIds: string[];
  mode: "ALL" | "ANY";
  rules: Rule[];
}
const roles = ["learner", "manager", "content_admin", "admin", "assessor"];
const page = { offset: integer(100000), limit: integer(20, 1) };
export const profileFields = {
  preferredLanguage: enumeration("en", "vi"),
  interests: array(string(80), 8),
  customFields: array(object({ name: string(40), value: string(200, 0) }), 8),
};
export const userSchema = object({
  id: string(64),
  name: string(160),
  role: enumeration(...roles),
  active: { type: "boolean" },
  managerId: { type: ["string", "null"], maxLength: 64 },
  ...profileFields,
});
export const groupSchema = object({
  name: string(160),
  kind: enumeration("static", "dynamic"),
  memberIds: array(string(64), 100),
  mode: enumeration("ALL", "ANY"),
  rules: array(
    object({
      field: enumeration(
        "name",
        "role",
        "managerId",
        "active",
        "createdAt",
        "customField",
      ),
      customField: string(40, 0),
      operator: enumeration(
        "equals",
        "notEquals",
        "contains",
        "before",
        "after",
      ),
      value: string(200),
    }),
    16,
  ),
});
export const peopleLibraryWrites = [
  "learning_save_user",
  "learning_import_users",
  "learning_save_group",
];
export function peopleTools(role: Role): Tool[] {
  return [
    tool(
      "learning_get_profile",
      "read",
      {},
      "Read own interests and language preferences.",
    ),
    tool(
      "learning_save_profile",
      "write",
      {
        preferredLanguage: profileFields.preferredLanguage,
        interests: profileFields.interests,
      },
      "Update own bounded language and interests; cannot alter identity, role or organization fields.",
    ),
    ...(["admin", "manager"].includes(role)
      ? [
          tool(
            "learning_list_users",
            "read",
            page,
            "Read minimal current-tenant or direct-report profiles; no credentials or session data.",
            [],
          ),
          tool(
            "learning_list_groups",
            "read",
            page,
            "Read organization group metadata; membership requires separately authorized preview.",
            [],
          ),
          tool(
            "learning_preview_group",
            "read",
            { group: groupSchema, ...page },
            "Evaluate static/dynamic ALL/ANY/date rules in current audience scope. No mutation.",
            ["group"],
          ),
          tool(
            "learning_get_group",
            "read",
            { groupId: string(64) },
            "Read group definition; managers receive only members within their audience.",
          ),
        ]
      : []),
    ...(role === "admin"
      ? [
          tool(
            "learning_save_user",
            "write",
            { user: userSchema },
            "Create/update same-tenant synthetic identity/profile, roles and active state. Revokes existing sessions on security changes; preserves learning records.",
          ),
          tool(
            "learning_preview_user_import",
            "read",
            { csv: string(16000) },
            "Validate bounded CSV identities and manager references, returning row errors and review hash. Does not create accounts.",
          ),
          tool(
            "learning_import_users",
            "write",
            { csv: string(16000), previewHash: string(64) },
            "Import reviewed all-valid CSV atomically, rechecking live identity constraints and content hash.",
          ),
          tool(
            "learning_export_users",
            "read",
            page,
            "Export authorized paginated user/profile CSV with formula-safe cells; no secrets.",
            [],
          ),
          tool(
            "learning_save_group",
            "write",
            { groupId: string(64), group: groupSchema },
            "Save validated static/dynamic ALL/ANY group rules after audience preview; records version and audit.",
          ),
        ]
      : []),
  ];
}
