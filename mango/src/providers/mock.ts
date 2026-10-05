import {
  sleep,
  type ProviderAdapter,
  type ProviderRequest,
  type ProviderEvent,
  type ScriptTurn,
} from "./types.js";
export class MockProvider implements ProviderAdapter {
  readonly name = "mock";
  constructor(
    private script: ScriptTurn[] = [
      { content: "Offline mock response.", usage: { input: 8, output: 5 } },
    ],
  ) {}
  async *generate(
    request: ProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const turn =
      this.script[
        Math.min(
          request.messages.filter((m) => m.role === "assistant").length,
          this.script.length - 1,
        )
      ];
    if (!turn) throw new Error("Empty mock script");
    signal.throwIfAborted();
    if (turn.delayMs) await sleep(turn.delayMs, signal);
    if (turn.errorStatus) {
      const { UpstreamError } = await import("./types.js");
      throw new UpstreamError(
        turn.errorStatus,
        turn.errorStatus === 429 || turn.errorStatus === 503,
      );
    }
    if (turn.content)
      for (const content of turn.content.match(/.{1,5}/gs) ?? []) {
        signal.throwIfAborted();
        yield { type: "delta", content };
      }
    for (const [index, c] of (turn.toolCalls ?? []).entries()) {
      yield {
        type: "delta",
        tool_calls: [
          {
            index,
            id: c.id,
            type: "function",
            function: { name: c.function.name, arguments: "" },
          },
        ],
      };
      for (const a of c.function.arguments.match(/.{1,3}/gs) ?? [])
        yield {
          type: "delta",
          tool_calls: [{ index, function: { arguments: a } }],
        };
    }
    if (!turn.truncate)
      yield {
        type: "final",
        finishReason:
          turn.finishReason ?? (turn.toolCalls?.length ? "tool_calls" : "stop"),
        usage: turn.usage ?? { input: null, output: null },
        continuation: turn.continuation,
      };
  }
}
