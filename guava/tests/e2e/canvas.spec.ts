import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function signIn(page: Page, role = "investigator") {
  await page.goto("/");
  await page.locator('select[name="username"]').selectOption(role);
  await page.locator('input[name="password"]').fill(role + "-dev");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Consumer lag after deployment" }),
  ).toBeVisible();
}
async function context(page: Page) {
  return page.evaluate(() => window.agentBridgeV1!.getContext());
}

test("human UI persists edits, evidence search, undo and brainstorming; captures actual screenshots", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  await expect(page.locator(".graph-card")).toHaveCount(3);
  await page.locator('[data-id="consumer-lag"] .graph-card').click();
  await expect(
    page.getByRole("heading", { name: "Consumer lag rising" }),
  ).toBeVisible();
  const initial = await context(page);
  expect(initial.selectionIds).toContain("consumer-lag");
  await page.screenshot({ path: "screenshots/rca-canvas.png", fullPage: true });
  await page.getByRole("button", { name: "evidence", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Consumer configuration diff" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search evidence" }).fill("broker");
  await expect(
    page.getByRole("heading", { name: "Broker health" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Add node" }).click();
  await expect(page.locator(".graph-card")).toHaveCount(4);
  await page.locator(".graph-card").filter({ hasText: "New note" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Persisted human note");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.locator(".graph-card").filter({ hasText: "Persisted human note" }),
  ).toBeVisible();
  const revision = (await context(page)).revision;
  await page.reload();
  await expect(
    page.locator(".graph-card").filter({ hasText: "Persisted human note" }),
  ).toBeVisible();
  expect((await context(page)).revision).toBe(revision);
  await page.getByRole("button", { name: "Auto-layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await context(page)).revision).toBe(revision + 2);
  await page
    .getByRole("button", { name: /Design a calmer on-call week/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Design a calmer on-call week" }),
  ).toBeVisible();
  await page.screenshot({
    path: "screenshots/brainstorm-canvas.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("real browser bridge: batch, replay, stale, proposal, human acceptance and audit", async ({
  page,
}) => {
  await signIn(page);
  const before = await context(page);
  const call = {
    requestId: "browser-batch",
    documentId: before.documentId,
    toolName: "canvas_apply_patch",
    arguments: {
      operations: [
        {
          op: "add_node",
          node: {
            id: "browser-hypothesis",
            type: "hypothesis",
            label: "Candidate config regression",
            body: "An unverified hypothesis",
            position: { x: 650, y: 100 },
            evidenceIds: ["ev-config"],
          },
        },
        {
          op: "add_edge",
          edge: {
            id: "browser-link",
            source: "consumer-lag",
            target: "browser-hypothesis",
            type: "relates",
            label: "test",
          },
        },
      ],
    },
    expectedRevision: before.revision,
    idempotencyKey: "browser-batch-key",
  };
  const first = await page.evaluate(
    (c) => window.agentBridgeV1!.invoke(c),
    call,
  );
  expect(first.ok).toBe(true);
  await expect(
    page
      .locator(".graph-card")
      .filter({ hasText: "Candidate config regression" }),
  ).toBeVisible();
  const retry = await page.evaluate(
    (c) => window.agentBridgeV1!.invoke({ ...c, requestId: "browser-retry" }),
    call,
  );
  expect(retry).toEqual(first);
  const stale = await page.evaluate(
    (c) =>
      window.agentBridgeV1!.invoke({ ...c, idempotencyKey: "browser-stale" }),
    call,
  );
  expect(stale.error?.code).toBe("STALE_CONTEXT");
  const ctx = await context(page);
  const conclusion = await page.evaluate(
    (c) => window.agentBridgeV1!.invoke(c),
    {
      requestId: "proposal",
      documentId: ctx.documentId,
      toolName: "investigation_propose_conclusion",
      arguments: {
        summary: "Proposed configuration explanation",
        supportingEvidenceIds: ["ev-config"],
        contradictoryEvidenceIds: ["ev-transient"],
      },
      expectedRevision: ctx.revision,
      idempotencyKey: "browser-proposal",
    },
  );
  expect(conclusion.data.status).toBe("proposed");
  await page.getByRole("button", { name: "Auto-layout" }).click();
  await page.locator(".react-flow__controls-fitview").click();
  await page.locator(".graph-card.conclusion").click();
  await expect(
    page.getByRole("button", { name: "Accept conclusion as human" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Accept conclusion as human" })
    .click();
  await expect(page.locator(".graph-card.conclusion b")).toHaveText("accepted");
  await page.getByRole("button", { name: "audit", exact: true }).click();
  await expect(
    page
      .locator(".audit")
      .getByText("human_accept_conclusion", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.cookie.includes("guava-session")),
  ).toBe(false);
});

test("reader cannot write through manipulated bridge and supports read-only tools", async ({
  page,
}) => {
  await signIn(page, "reader");
  await expect(page.getByRole("button", { name: "+ Add node" })).toBeDisabled();
  const c = await context(page);
  const result = await page.evaluate(
    (c) =>
      window.agentBridgeV1!.invoke({
        requestId: "reader-bypass",
        documentId: c.documentId,
        toolName: "canvas_apply_patch",
        arguments: { operations: [{ op: "auto_layout" }] },
        expectedRevision: c.revision,
        idempotencyKey: "reader-write",
      }),
    c,
  );
  expect(result.error?.code).toBe("FORBIDDEN");
  const read = await page.evaluate(
    (c) =>
      window.agentBridgeV1!.invoke({
        requestId: "reader-read",
        documentId: c.documentId,
        toolName: "canvas_get_graph",
        arguments: { nodeLimit: 1 },
        expectedRevision: null,
        idempotencyKey: null,
      }),
    c,
  );
  expect(read.ok).toBe(true);
});

test("dev host simulator discovers actual bridge and approves one batch; denial never dispatches", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1050 });
  await page.goto("/harness/index.html");
  const app = page.frameLocator("iframe");
  await app.locator('input[name="password"]').fill("investigator-dev");
  await app.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    app.getByRole("heading", { name: "Consumer lag after deployment" }),
  ).toBeVisible();
  await app.locator('[data-id="consumer-lag"] .graph-card').click();
  await page.getByRole("button", { name: "Discover bridge" }).click();
  await expect(page.locator(".target")).toContainText("rca-consumer-lag");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Read context", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stage 3 hypotheses (one approval)" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Stage 3 hypotheses (one approval)" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Approve one batch?" }),
  ).toBeVisible();
  await page.screenshot({
    path: "screenshots/simulator-approval.png",
    fullPage: true,
  });
  const count = await app.locator(".graph-card.hypothesis").count();
  await page.getByRole("button", { name: "Approve exact payload" }).click();
  await expect(app.locator(".graph-card.hypothesis")).toHaveCount(count + 3);
  await page.getByRole("button", { name: "Replay identical request" }).click();
  await page.getByRole("button", { name: "Approve exact payload" }).click();
  await expect(app.locator(".graph-card.hypothesis")).toHaveCount(count + 3);
  await page.getByRole("button", { name: "Deny before dispatch" }).click();
  await expect(page.locator("pre").first()).toContainText("APPROVAL_DENIED");
  await expect(app.locator(".graph-card.hypothesis")).toHaveCount(count + 3);
  await page.getByRole("button", { name: "Try stale revision" }).click();
  await page.getByRole("button", { name: "Approve exact payload" }).click();
  await expect(page.locator("pre").first()).toContainText("STALE_CONTEXT");
  await app
    .getByRole("button", { name: /Design a calmer on-call week/ })
    .click();
  await page.getByRole("button", { name: "Read context", exact: true }).click();
  await expect(page.locator("pre").first()).toContainText("TARGET_CLOSED");
});

test("actual unsupported page has no bridge and simulator reports UNSUPPORTED without crashing", async ({
  page,
}) => {
  await page.goto("/harness/unsupported.html");
  await expect(
    page.getByRole("heading", { name: "Unsupported page fixture" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.agentBridgeV1)).toBeUndefined();
  const result = await page.evaluate(async () => {
    const { HostSimulator } = await import("/harness/simulator.ts" as string);
    return new HostSimulator(location.origin).discover(window.agentBridgeV1);
  });
  expect(result.error?.code).toBe("UNSUPPORTED");
});
