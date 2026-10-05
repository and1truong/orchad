import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAIProvider } from "../src/providers/openai.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import { GeminiProvider } from "../src/providers/gemini.js";
for (const [name, Adapter] of [
  ["OPENAI", OpenAIProvider],
  ["ANTHROPIC", AnthropicProvider],
  ["GEMINI", GeminiProvider],
] as const) {
  const key = process.env[`${name}_API_KEY`],
    model = process.env[`${name}_SMOKE_MODEL`];
  test(
    `${name}: opt-in paid live smoke`,
    { skip: process.env.LIVE_SMOKE !== "true" || !key || !model },
    async () => {
      const a = new Adapter({ apiKey: key! });
      const events = [];
      for await (const e of a.generate(
        {
          model: model!,
          upstreamModel: model!,
          messages: [{ role: "user", content: "Reply with hello." }],
          max_completion_tokens: 128,
          continuations: new Map(),
        },
        AbortSignal.timeout(30000),
      ))
        events.push(e);
      assert.equal(events.at(-1)?.type, "final");
    },
  );
}
