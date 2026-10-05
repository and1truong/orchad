import { test } from "node:test";
import assert from "node:assert/strict";
import { registerNativeAdapter } from "../src/client/native-webmcp.ts";
import { counterFixture } from "../harness/fixture.ts";
import { failure } from "../src/shared/contract.ts";
test("native adapter absence is supported baseline; no polyfill installed", async () => {
  const runtime = {} as Document;
  const adapter = await registerNativeAdapter(
    counterFixture(),
    runtime,
    async () => failure("APPROVAL_DENIED", "No host"),
  );
  assert.equal(adapter.supported, false);
  assert.equal("modelContext" in runtime, false);
});
test("mock-only native registration uses registry and host dispatch, cancellation and disposal", async () => {
  const registrations: any[] = [];
  let dispatched: any = null;
  const adapter = await registerNativeAdapter(
    counterFixture(),
    {
      modelContext: {
        registerTool: async (tool: any, options: any) =>
          registrations.push({ tool, options }),
      },
    } as any,
    async (call) => {
      dispatched = call;
      return failure("APPROVAL_DENIED", "Verified host policy denies write");
    },
  );
  assert.equal(adapter.supported, true);
  assert.equal(registrations[0].tool.name, "demo_increment");
  const input = {
    documentId: "demo-document",
    arguments: { amount: 1 },
    expectedRevision: 0,
    idempotencyKey: "key-1",
  };
  const denied = JSON.parse(await registrations[0].tool.execute(input));
  assert.equal(denied.error.code, "APPROVAL_DENIED");
  assert.equal(dispatched.toolName, "demo_increment");
  assert.equal(dispatched.arguments.amount, 1);
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(
    JSON.parse(
      await registrations[0].tool.execute(input, { signal: aborted.signal }),
    ).error.code,
    "CANCELLED",
  );
  adapter.dispose();
  assert.equal(registrations[0].options.signal.aborted, true);
});
