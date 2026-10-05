// TEST DOUBLE ONLY. No production authorization, page dispatch or persistence.
import type {
  ToolDescriptor,
  BridgeErrorCode,
  Result,
} from "../packages/agent-client/src/protocol.js";
export const demoTool: ToolDescriptor = {
  name: "demo_increment",
  description: "Increment test counter",
  inputSchema: {
    type: "object",
    required: ["amount"],
    additionalProperties: false,
    properties: { amount: { type: "integer" } },
  },
  effect: "write",
};
export type Invoke = {
  requestId: string;
  documentId: string;
  toolName: string;
  arguments: { amount: number };
  expectedRevision: number | null;
  idempotencyKey: string | null;
};
export function fakeHost() {
  let value = 0,
    revision = 0,
    dispatches = 0;
  const records = new Map<string, { semantic: string; result: Result }>();
  const fail = (code: BridgeErrorCode): Result => ({
    ok: false,
    revision,
    data: null,
    error: { code, message: code, retryable: false },
  });
  return {
    context: () => ({
      appId: "demo-counter",
      documentId: "demo-document",
      revision,
      selectionIds: [],
      summary: `value ${value}`,
    }),
    get dispatches() {
      return dispatches;
    },
    unsupported: () => fail("UNSUPPORTED"),
    invoke(
      call: Invoke,
      approved: boolean,
      principal = "fixture-user",
    ): Result {
      if (!approved) return fail("APPROVAL_DENIED");
      dispatches++;
      if (
        call.documentId !== "demo-document" ||
        call.toolName !== "demo_increment"
      )
        return fail("NOT_FOUND");
      if (
        !Number.isInteger(call.arguments.amount) ||
        call.expectedRevision === null ||
        !call.idempotencyKey
      )
        return fail("INVALID_ARGUMENT");
      const key = JSON.stringify([
        principal,
        call.documentId,
        call.idempotencyKey,
      ]);
      const semantic = JSON.stringify([
        call.documentId,
        call.toolName,
        call.arguments.amount,
        call.expectedRevision,
      ]);
      const previous = records.get(key);
      if (previous)
        return previous.semantic === semantic
          ? previous.result
          : fail("IDEMPOTENCY_CONFLICT");
      if (call.expectedRevision !== revision) return fail("STALE_CONTEXT");
      value += call.arguments.amount;
      revision++;
      const result: Result = {
        ok: true,
        revision,
        data: { value, revision },
        error: null,
      };
      records.set(key, { semantic, result });
      return result;
    },
  };
}
