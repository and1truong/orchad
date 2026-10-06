// Real unpacked Lime + MAIN-world Pear bridge + real HTTP backend. Scripted
// Mango boundary only: no paid provider and no app-owned agent loop.
import { chromium, expect } from "@playwright/test";
import { startMockGateway } from "../../lime/fixtures/gateway.ts";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const temp = await mkdtemp(join(tmpdir(), "pear-lime-")),
  extension = join(temp, "extension"),
  origin = "http://127.0.0.1:4314";
await cp(resolve("../lime/dist/extension"), extension, { recursive: true });
const manifest = JSON.parse(
  await readFile(join(extension, "manifest.json"), "utf8"),
);
manifest.host_permissions = [origin + "/*", "http://127.0.0.1:4311/*"];
await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest));
const server = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/start.ts", "--dev"],
  {
    env: { ...process.env, DATABASE_PATH: join(temp, "pear.sqlite") },
    stdio: "pipe",
  },
);
let context: any,
  gateway: Awaited<ReturnType<typeof startMockGateway>> | undefined;
try {
  let healthy = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(origin + "/health")).ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(healthy, "Pear server must start");
  gateway = await startMockGateway(4311, true, {
    name: "learning_set_bookmark",
    arguments: '{"courseId":"learning-vi","saved":true}',
  });
  context = await chromium.launchPersistentContext(join(temp, "profile"), {
    channel: "chromium",
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: [
      "--no-sandbox",
      ...(process.env.CHROMIUM_EXTRA_ARGS
        ? JSON.parse(process.env.CHROMIUM_EXTRA_ARGS)
        : []),
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker")),
    extensionId = new URL(worker.url()).hostname;
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.setViewportSize({ width: 520, height: 1100 });
  const option = panel.locator(
    `select[aria-label="Target picker"] option[data-url^="${origin}"]`,
  );
  await option.waitFor({ state: "attached" });
  await panel
    .getByLabel("Target picker")
    .selectOption((await option.getAttribute("value"))!);
  await panel.getByRole("button", { name: "Pin target", exact: true }).click();
  await panel
    .getByText("Document: learning:demo:learner-a", { exact: false })
    .waitFor();
  await panel.getByLabel("Gateway token").fill("lime-fixture-token");
  await panel.getByRole("button", { name: "Load models", exact: true }).click();
  await panel
    .locator("select option", { hasText: "mock-counter" })
    .waitFor({ state: "attached" });
  await panel
    .getByRole("button", {
      name: "Consent to pinned target + model",
      exact: true,
    })
    .click();
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await panel.getByRole("button", { name: "Approve", exact: true }).waitFor();
  await mkdir("artifacts", { recursive: true });
  await panel.screenshot({
    path: "artifacts/lime-approval.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save Học tập có chủ đích", exact: true }),
  ).toHaveText("Saved ✓");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await panel.getByRole("button", { name: "Deny", exact: true }).click();
  const state = await page.evaluate(async () => {
    const ctx = await window.agentBridgeV1!.getContext();
    return window.agentBridgeV1!.invoke({
      requestId: "verify",
      documentId: ctx.documentId,
      toolName: "learning_get_my_learning",
      arguments: {},
      expectedRevision: null,
      idempotencyKey: null,
    });
  });
  assert.equal(state.revision, 1);
  assert.equal(state.data.saved.length, 1);
  await page.reload();
  await panel.getByText("target changed", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  const saved = await page.evaluate(async () => {
    const ctx = await window.agentBridgeV1!.getContext();
    return window.agentBridgeV1!.invoke({
      requestId: "saved",
      documentId: ctx.documentId,
      toolName: "learning_get_my_learning",
      arguments: {},
      expectedRevision: null,
      idempotencyKey: null,
    });
  });
  assert.equal(saved.data.saved.length, 1);
  await page.screenshot({
    path: "artifacts/lime-pear-catalog.png",
    fullPage: true,
  });
  await panel.screenshot({
    path: "artifacts/lime-invalidated.png",
    fullPage: true,
  });
  await writeFile(
    "artifacts/lime-report.json",
    JSON.stringify(
      {
        passed: true,
        lane: "Actual Chromium unpacked extension-page UI, not native Side Panel container",
        gateway: "Scripted fake Mango boundary; no live provider",
        checks: [
          "host consent and approval -> actual MAIN-world Pear bridge -> SQLite bookmark",
          "denied write zero mutation",
          "reload invalidates host authority",
          "Pear bookmark survives reload",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Real Lime / Pear browser integration PASS");
} finally {
  await context?.close();
  await gateway?.close();
  server.kill();
  await rm(temp, { recursive: true, force: true });
}
