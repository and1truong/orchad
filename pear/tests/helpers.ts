import { randomUUID } from "node:crypto";
import { openDatabase } from "../src/server/database.ts";
import { LearningService } from "../src/server/service.ts";
import type { Call, Result } from "../src/shared/model.ts";
export function fixture() {
  const db = openDatabase(":memory:", true),
    service = new LearningService(db);
  function call(
    user: string,
    name: string,
    args: Record<string, unknown> = {},
    source: "bridge" | "human" = "bridge",
    overrides: Partial<Call> = {},
  ): Result {
    const p = service.principal(user),
      tool = [...service.description(user).tools].find((t) => t.name === name),
      write = tool?.effect !== "read",
      admin = [
        "learning_create_course",
        "learning_update_course",
        "learning_publish_course",
        "learning_retire_course",
        "learning_assign",
      ].includes(name),
      documentId = admin ? service.library(p) : service.personal(p);
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
