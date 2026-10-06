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
      sessionEpoch: context.sessionEpoch ?? null,
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

test("changing assistant workspace revokes an in-flight host approval before any dispatch", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Account", { exact: true }).fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("admin-dev");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await page
    .getByLabel("Assistant workspace", { exact: true })
    .selectOption("reports");
  const context = await page.evaluate(() => window.agentBridgeV1!.getContext()),
    description = await page.evaluate(() => window.agentBridgeV1!.describe());
  expect(context.documentId).toBe("library:demo::reports");
  expect(description.tools.some((t) => t.name === "learning_save_report")).toBe(
    true,
  );
  expect(description.tools.some((t) => t.name === "learning_save_user")).toBe(
    false,
  );
  let dispatches = 0,
    release!: (v: boolean) => void,
    ready!: () => void;
  const approvalReady = new Promise<void>((r) => (ready = r));
  const target = {
    targetId: "group-target",
    pageInstanceId: "group-page",
    origin: new URL(page.url()).origin,
    appId: context.appId,
    documentId: context.documentId,
    title: "Pear reports",
  };
  const adapter = {
    target,
    current: async () => target,
    describe: () => page.evaluate(() => window.agentBridgeV1!.describe()),
    getContext: () => page.evaluate(() => window.agentBridgeV1!.getContext()),
    invoke: (call: Call) => {
      dispatches++;
      return page.evaluate((c) => window.agentBridgeV1!.invoke(c), call);
    },
  };
  const policy = new HostPolicy(
    adapter,
    {
      clientId: "groups",
      sessionId: "groups-session",
      target,
      sessionEpoch: context.sessionEpoch ?? null,
      reads: new Set(),
    },
    () => {
      ready();
      return new Promise<boolean>((r) => (release = r));
    },
    new AbortController().signal,
  );
  const { freshReport } = await import("../../src/shared/reports.ts");
  const pending = policy.call({
    requestId: "pending-group",
    documentId: target.documentId,
    toolName: "learning_save_report",
    arguments: { reportId: "pending-group", spec: freshReport() },
    expectedRevision: context.revision,
    idempotencyKey: "pending-group",
  });
  await approvalReady;
  await page.evaluate(() => {
    const select = document.querySelector(
      'select[aria-label="Assistant workspace"]',
    ) as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )!.set!;
    setter.call(select, "people");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.agentBridgeV1!.getContext().then((c) => c.documentId),
      ),
    )
    .toBe("library:demo::people");
  release(true);
  expect((await pending).error?.code).toBe("STALE_CONTEXT");
  expect(dispatches).toBe(0);
  const next = await page.evaluate(() => window.agentBridgeV1!.describe());
  expect(next.tools.some((t) => t.name === "learning_save_user")).toBe(true);
  expect(next.tools.some((t) => t.name === "learning_save_report")).toBe(false);
});
