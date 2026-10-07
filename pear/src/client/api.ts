import {diagnosticText,humanError} from "./diagnostics.ts";
import {
  appId,
  type Bridge,
  type Call,
  type Context,
  type Description,
  type Principal,
  type Result,
} from "../shared/model.ts";
export interface Session {
  principal: Principal;
  csrf: string;
  sessionEpoch: string;
}
export async function request<T>(
  path: string,
  session: Session | null,
  body?: unknown,
  localizedErrors = true,
): Promise<T> {
  let response:Response;
  try {response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session
        ? { "X-CSRF-Token": session.csrf, "X-Pear-Epoch": session.sessionEpoch }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  } catch(error) {
    if(!localizedErrors)throw error;
    const write=!!body&&typeof body==="object"&&"idempotencyKey" in body&&typeof body.idempotencyKey==="string";
    throw new Error(diagnosticText(write?"Request outcome unknown; refresh current data before confirming another action.":error instanceof Error?error.message:"Request failed"));
  }
  let result;
  try { result = await response.json(); } catch(error) {
    if(!localizedErrors)throw error;
    const write=!!body&&typeof body==="object"&&"idempotencyKey" in body&&typeof body.idempotencyKey==="string";
    throw new Error(diagnosticText(write?"Request outcome unknown; refresh current data before confirming another action.":"Request failed"));
  }
  if (!response.ok)
    throw new Error(
      localizedErrors ? humanError(result.error?.code??response.status,result.error?.message??"Request failed") : `${result.error?.code ?? response.status}: ${result.error?.message ?? "Request failed"}`,
    );
  return result;
}
export async function invoke(
  session: Session,
  documentId: string,
  toolName: string,
  args: Record<string, unknown>,
  write = false,
): Promise<Result> {
  const ctx = await request<Context>(
    "/api/context?documentId=" + encodeURIComponent(documentId),
    session,
  );
  const result = await request<Result>("/api/human/invoke", session, {
    requestId: crypto.randomUUID(),
    documentId,
    toolName,
    arguments: args,
    expectedRevision: write ? ctx.revision : null,
    idempotencyKey: write ? crypto.randomUUID() : null,
  });
  if (!result.ok) throw new Error(diagnosticText(result.error!.message));
  return result;
}
export function createBridge(
  session: Session,
  currentDocument: () => string,
  onMutation: () => void,
): Bridge {
  return Object.freeze({
    describe: () =>
      request<Description>(
        "/api/describe?documentId=" + encodeURIComponent(currentDocument()),
        session,
        undefined,
        false,
      ),
    getContext: () =>
      request<Context>(
        "/api/context?documentId=" + encodeURIComponent(currentDocument()),
        session,
        undefined,
        false,
      ),
    async invoke(call: Call): Promise<Result> {
      if (call.documentId !== currentDocument())
        return {
          ok: false,
          revision: null,
          data: null,
          error: {
            code: "STALE_CONTEXT",
            message: "Selected workspace changed",
            retryable: false,
          },
        };
      try {
        const response = await fetch("/api/bridge/invoke", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": session.csrf,
            "X-Pear-Epoch": session.sessionEpoch,
          },
          body: JSON.stringify(call),
        });
        const r = (await response.json()) as Result;
        if (r.ok && call.expectedRevision !== null) onMutation();
        return r;
      } catch {
        return {
          ok: false,
          revision: null,
          data: null,
          error: {
            code: "INTERNAL",
            message:
              "Dispatch outcome unknown; reconcile progress and original operation key before retrying",
            retryable: false,
          },
        };
      }
    },
  });
}
