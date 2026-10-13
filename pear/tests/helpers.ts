import { scopedWorkspace, toolGroups } from "../src/shared/tool-groups.ts";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../src/server/database.ts";
import { LearningService } from "../src/server/service.ts";
import type { Call, Result } from "../src/shared/model.ts";
import {
  allCatalog,
  catalog,
  humanTools,
  libraryWrites,
} from "../src/shared/catalog.ts";
export function fixture(path = ":memory:") {
  const db = openDatabase(path, true),
    service = new LearningService(db);
  function call(
    user: string,
    name: string,
    args: Record<string, unknown> = {},
    source: "bridge" | "human" = "bridge",
    overrides: Partial<Call> = {},
  ): Result {
    const p = service.principal(user),
      tool = [
        ...allCatalog(p.role),
        ...(source === "human" ? humanTools : []),
      ].find((t) => t.name === name),
      write = tool?.effect !== "read",
      admin =
        libraryWrites.has(name) &&
        ["admin", "manager", "content_admin", "assessor"].includes(p.role),
      base = admin ? service.library(p) : service.personal(p),
      group =
        toolGroups.find((group) =>
          catalog(p.role, group).some((t) => t.name === name),
        ) ?? "learning",
      documentId = source === "human" ? base : scopedWorkspace(base, group);
    return service.invoke(
      user,
      {
        requestId: randomUUID(),
        documentId,
        toolName: name,
        arguments: args,
        expectedRevision: write
          ? service.context(user, documentId).revision
          : null,
        idempotencyKey: write ? randomUUID() : null,
        ...overrides,
      },
      source,
    );
  }
  return { db, service, call };
}
export function data(r: Result): any {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.data;
}
// Only for fixtures simulating a populated pre-cmi5 database. Remove both the
// empty tables and their marker before exercising the real upgrade path.
export const cmi5SchemaRewind = 'DROP TABLE cmi5_attachments; DROP TABLE cmi5_completion_proofs; DROP TABLE cmi5_learning_bindings; DROP TABLE cmi5_documents; DROP TABLE cmi5_state; DROP TABLE cmi5_statements; DROP TABLE cmi5_sessions; DROP TABLE cmi5_registrations; DROP TABLE cmi5_resources; DROP TABLE cmi5_packages; DELETE FROM schema_version WHERE version>=52;';
