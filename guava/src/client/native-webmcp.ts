import { failure, type Bridge, type Invoke } from "../shared/contract.ts";
import { object, id } from "../shared/catalog.ts";
// Optional draft API adapter. Shape verified against Chrome documentation 2026-09-21:
// https://developer.chrome.com/docs/ai/webmcp/imperative-api
// No navigator polyfill. Not auto-enabled: the calling verified host must supply policy dispatch.
export interface NativeModelContext {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (
        input: any,
        options?: { signal?: AbortSignal },
      ) => Promise<string>;
    },
    options: { signal: AbortSignal },
  ): Promise<void> | void;
}
export async function registerNativeAdapter(
  bridge: Bridge,
  runtimeDocument: Document,
  dispatch: (call: Invoke) => Promise<import("../shared/contract.ts").Result>,
) {
  const native = (
    runtimeDocument as Document & { modelContext?: NativeModelContext }
  ).modelContext;
  if (!native || typeof native.registerTool !== "function")
    return { supported: false, dispose: () => {} };
  const lifetime = new AbortController();
  const description = await bridge.describe();
  try {
    for (const tool of description.tools) {
      await native.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: object({
            documentId: id,
            arguments: tool.inputSchema,
            expectedRevision: {
              anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
            },
            idempotencyKey: {
              anyOf: [
                { type: "string", minLength: 1, maxLength: 120 },
                { type: "null" },
              ],
            },
          }),
          annotations: {
            readOnlyHint: tool.effect === "read",
            untrustedContentHint: true,
          },
          execute: async (input, options) => {
            if (options?.signal?.aborted)
              return JSON.stringify(
                failure("CANCELLED", "Native tool cancelled"),
              );
            return JSON.stringify(
              await dispatch({
                requestId: crypto.randomUUID(),
                documentId: input.documentId,
                toolName: tool.name,
                arguments: input.arguments,
                expectedRevision: input.expectedRevision,
                idempotencyKey: input.idempotencyKey,
              }),
            );
          },
        },
        { signal: lifetime.signal },
      );
    }
    return { supported: true, dispose: () => lifetime.abort() };
  } catch {
    lifetime.abort();
    return { supported: false, dispose: () => {} };
  }
}
