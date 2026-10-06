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
  const scriptedTool={name:"learning_set_bookmark",arguments:'{"courseId":"learning-vi","saved":true}'};
  gateway = await startMockGateway(4311,true,scriptedTool);
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
  // Actual extension/UI source-read consent and skippable practice transport.
  // Fake Mango chooses the calls; this is not an inference-quality claim.
  await page.getByLabel("Content language",{exact:true}).selectOption("vi");
  await expect(page.locator(".cards article")).toHaveCount(1);
  await page.getByRole("button",{name:"Enroll",exact:true}).click();
  async function learningState(){return page.evaluate(async()=>{const ctx=await window.agentBridgeV1!.getContext();return window.agentBridgeV1!.invoke({requestId:crypto.randomUUID(),documentId:ctx.documentId,toolName:"learning_get_my_learning",arguments:{},expectedRevision:null,idempotencyKey:null});});}
  const beforePractice=await learningState(),enrollment=beforePractice.data.enrollments.find((e:any)=>e.courseId==="learning-vi"||e.course_id==="learning-vi");
  assert.ok(enrollment);
  await panel.getByRole("button",{name:"Pin target",exact:true}).click();
  await panel.getByLabel("Learning workflow",{exact:true}).selectOption("practice");
  await panel.getByLabel("Allow read: learning_get_lesson",{exact:true}).check();
  await panel.getByRole("button",{name:"Consent to pinned target + model",exact:true}).click();
  scriptedTool.name="learning_get_lesson";scriptedTool.arguments=JSON.stringify({enrollmentId:enrollment.id,lessonId:"practice"});
  await panel.getByLabel("Message",{exact:true}).fill("Offer optional practice from this original permitted lesson.");
  await panel.getByRole("button",{name:"Send",exact:true}).click();
  await expect.poll(()=>gateway!.requests.some((r:any)=>r.messages?.some((m:any)=>m.role==="tool"&&m.content?.includes("Luyện nhớ chủ động")))).toBe(true);
  const transcriptRequest=gateway.requests.find((r:any)=>r.messages?.some((m:any)=>m.role==="tool"&&m.content?.includes("Luyện nhớ chủ động")))!;
  assert.ok(transcriptRequest.messages.some((m:any)=>m.role==="system"&&m.content.includes("unofficial and skippable")));
  const toolResult=JSON.parse(transcriptRequest.messages.find((m:any)=>m.role==="tool"&&m.content?.includes("Luyện nhớ chủ động")).content);
  assert.equal(toolResult.data.courseId,"learning-vi");assert.equal(toolResult.data.version,1);assert.equal(toolResult.data.enrollmentId,enrollment.id);
  for(const key of ["correct","quiz","answers","password","csrf","sessionEpoch"])assert.equal(Object.hasOwn(toolResult.data,key),false);
  await expect(panel.getByRole("button",{name:"Send",exact:true})).toBeEnabled();
  scriptedTool.name="learning_set_bookmark";scriptedTool.arguments='{"courseId":"learning-vi","saved":false}';
  await panel.getByRole("button",{name:"Send",exact:true}).click();await panel.getByRole("button",{name:"Approve",exact:true}).waitFor();
  await panel.getByRole("button",{name:"Skip practice",exact:true}).click();
  await expect(panel.getByLabel("Learning workflow",{exact:true})).toHaveValue("general");
  await expect(panel.getByRole("button",{name:"Approve",exact:true})).toHaveCount(0);
  await expect(panel.getByRole("button",{name:"Send",exact:true})).toBeEnabled();
  const afterPractice=await learningState();assert.deepEqual(afterPractice.data,beforePractice.data);assert.equal(afterPractice.revision,beforePractice.revision);
  scriptedTool.name="learning_get_lesson";scriptedTool.arguments=JSON.stringify({enrollmentId:enrollment.id,lessonId:"practice"});
  const oldRequests=gateway.requests.length;
  await panel.getByLabel("Message",{exact:true}).fill("Read the selected source again.");await panel.getByRole("button",{name:"Send",exact:true}).click();
  await expect.poll(()=>gateway!.requests.length).toBeGreaterThan(oldRequests);
  const fresh=gateway.requests[oldRequests];assert.equal(fresh.messages.some((m:any)=>m.role==="tool"),false);assert.equal(fresh.messages.some((m:any)=>m.role==="system"&&m.content.includes("Workflow: Optional AI practice")),false);
  await expect(panel.getByRole("button",{name:"Send",exact:true})).toBeEnabled();
  await panel.screenshot({path:"artifacts/lime-optional-practice.png",fullPage:true});
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
          "explicit lesson-read consent reaches actual shared Pi/Lime/Pear with source IDs/version",
          "practice Skip aborts pending approval with zero bookmark/progress mutation",
          "skipped workflow transcript does not reappear in the next turn",
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
