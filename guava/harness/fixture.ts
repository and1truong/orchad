import {
  canonical,
  failure,
  success,
  type Bridge,
  type Invoke,
  type Result,
} from "../src/shared/contract.ts";
// TEST DOUBLE ONLY. No production authorization. Reference contract counter.
export function counterFixture(): Bridge & {
  state: { value: number; revision: number; invocations: number };
} {
  const state = { value: 0, revision: 0, invocations: 0 };
  const saved = new Map<string, { semantic: string; result: Result }>();
  return {
    state,
    describe: async () => ({
      protocolVersion: "0.1",
      appId: "demo-counter",
      tools: [
        {
          name: "demo_increment",
          description: "Test double: increment bounded integer counter",
          inputSchema: {
            type: "object",
            properties: { amount: { type: "integer" } },
            required: ["amount"],
            additionalProperties: false,
          },
          effect: "write",
        },
      ],
    }),
    getContext: async () => ({
      appId: "demo-counter",
      documentId: "demo-document",
      revision: state.revision,
      selectionIds: [],
      summary: "TEST DOUBLE · scripted simulation, no LLM",
    }),
    invoke: async (call: Invoke) => {
      state.invocations++;
      if (
        call.documentId !== "demo-document" ||
        call.toolName !== "demo_increment" ||
        !Number.isInteger(call.arguments.amount) ||
        call.expectedRevision === null ||
        !call.idempotencyKey
      )
        return failure(
          "INVALID_ARGUMENT",
          "Invalid counter call",
          state.revision,
        );
      const semantic = canonical({
        toolName: call.toolName,
        arguments: call.arguments,
        expectedRevision: call.expectedRevision,
      });
      const previous = saved.get(call.idempotencyKey);
      if (previous)
        return previous.semantic === semantic
          ? previous.result
          : failure(
              "IDEMPOTENCY_CONFLICT",
              "Key payload mismatch",
              state.revision,
            );
      if (call.expectedRevision !== state.revision)
        return failure("STALE_CONTEXT", "Counter changed", state.revision);
      state.value += Number(call.arguments.amount);
      state.revision++;
      const result = success(state.revision, {
        value: state.value,
        revision: state.revision,
      });
      saved.set(call.idempotencyKey, { semantic, result });
      return result;
    },
  };
}
