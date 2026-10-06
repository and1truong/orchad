import { test, expect } from "@playwright/test";
import { HostPolicy } from "../../../lime/src/host/policy.ts";
import { dispatcher } from "../../../lime/src/extension/page-adapter.ts";
import { startMockGateway } from "../../../lime/fixtures/gateway.ts";
import {
  runAgentTurn,
  type Result as AgentResult,
} from "../../../mango/packages/agent-client/dist/index.js";
import type { Call } from "../../src/shared/model.ts";

test("shared Pi client + fake Mango -> real Lime HostPolicy -> browser Pear bridge -> SQLite", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  let pageInstance = "page-1",
    dispatches = 0,
    approvals = 0,
    allow = true;
  const context = (await page.evaluate<unknown, "getContext">(
    dispatcher,
    "getContext",
  )) as any;
  const description = (await page.evaluate<unknown, "describe">(
    dispatcher,
    "describe",
  )) as any;
  const target = {
    targetId: "test-transport",
    pageInstanceId: pageInstance,
    origin: new URL(page.url()).origin,
    appId: context.appId,
    documentId: context.documentId,
    title: "Pear",
  };
  const adapter = {
    target,
    current: async () => ({ ...target, pageInstanceId: pageInstance }),
    describe: () => page.evaluate<unknown, "describe">(dispatcher, "describe"),
    getContext: () =>
      page.evaluate<unknown, "getContext">(dispatcher, "getContext"),
    invoke: (call: Call) => {
      dispatches++;
      return page.evaluate(async (c) => window.agentBridgeV1!.invoke(c), call);
    },
  };
  // Only browser transport and trusted approval UI are replaced by a labelled
  // fixture. Production HostPolicy and Pi/Mango client execute unchanged.
  const policy = new HostPolicy(
    adapter,
    {
      clientId: "fixture",
      sessionId: "fixture-session",
      target: { ...target },
      sessionEpoch: context.sessionEpoch,
      reads: new Set(
        description.tools
          .filter((t: any) => t.effect === "read")
          .map((t: any) => t.name),
      ),
    },
    async () => {
      approvals++;
      return allow;
    },
    new AbortController().signal,
  );
  const gateway = await startMockGateway(0, true, {
    name: "learning_set_bookmark",
    arguments: '{"courseId":"systems-basics","saved":true}',
  });
  try {
    const turn = async () =>
      runAgentTurn({
        gatewayBaseUrl: `http://127.0.0.1:${gateway.port}`,
        gatewayToken: "lime-fixture-token",
        model: "mock-counter",
        messages: [{ role: "user", content: "Save systems-basics for later." }],
        tools: description.tools,
        executeTool: async (name, args, id) => {
          const c = (await adapter.getContext()) as any,
            t = description.tools.find((t: any) => t.name === name);
          return (await policy.call({
            requestId: id,
            documentId: target.documentId,
            toolName: name,
            arguments: args,
            expectedRevision: t.effect === "read" ? null : c.revision,
            idempotencyKey: t.effect === "read" ? null : id,
          })) as AgentResult;
        },
      });
    const first = await turn();
    expect(first.finishReason).toBe("completed");
    expect(approvals).toBe(1);
    expect(dispatches).toBe(1);
    expect(((await adapter.getContext()) as any).revision).toBe(
      context.revision + 1,
    );
    allow = false;
    await turn();
    expect(approvals).toBe(2);
    expect(dispatches).toBe(1);
    expect(((await adapter.getContext()) as any).revision).toBe(
      context.revision + 1,
    );
    const forbidden = await policy.call({
      requestId: "human",
      documentId: target.documentId,
      toolName: "human_submit_attempt",
      arguments: { attemptId: "not-an-agent-capability", confirmed: true },
      expectedRevision: context.revision + 1,
      idempotencyKey: "human",
    });
    expect(forbidden.error?.code).toBe("UNSUPPORTED");
    expect(dispatches).toBe(1);
    await page.screenshot({
      path: "artifacts/host-policy-browser.png",
      fullPage: true,
    });
    page.once("framenavigated", () => {
      pageInstance = "page-2";
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    const revoked = await policy.context();
    expect(revoked.error?.code).toBe("STALE_CONTEXT");
    expect(dispatches).toBe(1);
  } finally {
    await gateway.close();
  }
});
