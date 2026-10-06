import { openDatabase } from "../src/server/database.ts";
import { createApp } from "../src/server/app.ts";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import type { Invoke, Result } from "../src/shared/contract.ts";

export const ORIGIN = "http://127.0.0.1:4315";

export async function makeApp(): Promise<{
  app: FastifyInstance;
  service: import("../src/server/service.ts").LearningService;
  db: DatabaseSync;
}> {
  const db = openDatabase(":memory:");
  const { app, service } = await createApp({ db, origin: ORIGIN });
  return { app, service, db };
}

export type Client = {
  cookies: string;
  csrf: string;
  principal: string;
};

export async function login(
  app: FastifyInstance,
  user: string,
  pass: string,
): Promise<Client> {
  const res = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { username: user, password: pass },
  });
  if (res.statusCode !== 200) throw new Error(`login ${user} failed: ${res.body}`);
  const body = res.json() as { data: { principal: string; csrf: string } };
  const setCookie = res.headers["set-cookie"];
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie!])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookies, csrf: body.data.csrf, principal: body.data.principal };
}

export async function invoke(
  app: FastifyInstance,
  client: Client,
  call: Partial<Invoke> & { toolName: string },
): Promise<Result> {
  const payload: Invoke = {
    requestId: call.requestId ?? `req-${Math.random().toString(36).slice(2)}`,
    documentId: call.documentId ?? `workspace:${client.principal}`,
    toolName: call.toolName,
    arguments: call.arguments ?? {},
    expectedRevision: call.expectedRevision ?? null,
    idempotencyKey: call.idempotencyKey ?? null,
  };
  const res = await app.inject({
    method: "POST",
    url: "/api/invoke",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      cookie: client.cookies,
      "x-csrf-token": client.csrf,
    },
    payload,
  });
  return res.json() as Result;
}

export async function write(
  app: FastifyInstance,
  client: Client,
  documentId: string,
  toolName: string,
  args: Record<string, unknown>,
  revision: number,
  key?: string,
): Promise<Result> {
  return invoke(app, client, {
    documentId,
    toolName,
    arguments: args,
    expectedRevision: revision,
    idempotencyKey: key ?? `k-${Math.random().toString(36).slice(2)}`,
  });
}

// Human-only progress endpoint (not a bridge tool).
export async function completeLesson(
  app: FastifyInstance,
  client: Client,
  enrollmentId: string,
  lessonId: string,
): Promise<Result> {
  const res = await app.inject({
    method: "POST",
    url: `/api/enrollments/${enrollmentId}/lessons/${lessonId}/complete`,
    headers: {
      origin: ORIGIN,
      cookie: client.cookies,
      "x-csrf-token": client.csrf,
    },
  });
  return res.json() as Result;
}

export async function enrollCourse(
  app: FastifyInstance,
  client: Client,
  contentId: string,
  revision = 0,
): Promise<{ enrollmentId: string; doc: string }> {
  const r = await write(
    app, client, `workspace:${client.principal}`, "learning_enroll",
    { contentId }, revision,
  );
  const d = r.data as { enrollmentId: string };
  return { enrollmentId: d.enrollmentId, doc: `enrollment:${d.enrollmentId}` };
}
