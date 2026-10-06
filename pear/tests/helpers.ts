import { scopedWorkspace, toolGroups } from "../src/shared/tool-groups.ts";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../src/server/database.ts";
import { LearningService } from "../src/server/service.ts";
import type { Call, Result } from "../src/shared/model.ts";
import { allCatalog, catalog, libraryWrites } from "../src/shared/catalog.ts";
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
      tool = allCatalog(p.role).find((t) => t.name === name),
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
