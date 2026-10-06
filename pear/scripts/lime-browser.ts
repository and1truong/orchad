import {freshReport} from "../src/shared/reports.ts";
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
  page.on("console",(message:any)=>{if(message.type()==="error")console.log("Pear fixture MAIN console:",message.text());});
  page.on("pageerror",(error:any)=>console.log("Pear fixture MAIN error:",error.message));
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
  await page.getByLabel("Content language").selectOption("vi");
  await expect(page.locator(".cards article")).toHaveCount(1);
  await page.getByRole("button",{name:"Enroll",exact:true}).click();
  async function learningState(){return page.evaluate(async()=>{const ctx=await window.agentBridgeV1!.getContext();return window.agentBridgeV1!.invoke({requestId:crypto.randomUUID(),documentId:ctx.documentId,toolName:"learning_get_my_learning",arguments:{},expectedRevision:null,idempotencyKey:null});});}
  const beforePractice=await learningState(),enrollment=beforePractice.data.enrollments.find((e:any)=>e.courseId==="learning-vi"||e.course_id==="learning-vi");
  assert.ok(enrollment);
  const directLesson=await page.evaluate(async(args:any)=>{const ctx=await window.agentBridgeV1!.getContext();return window.agentBridgeV1!.invoke({requestId:crypto.randomUUID(),documentId:ctx.documentId,toolName:"learning_get_lesson",arguments:args,expectedRevision:null,idempotencyKey:null});},{enrollmentId:enrollment.id,lessonId:"practice"});
  assert.equal(directLesson.ok,true,JSON.stringify(directLesson));assert.equal(directLesson.data.title,"Luyện nhớ chủ động");
  await panel.getByRole("button",{name:"Pin target",exact:true}).click();
  await panel.getByLabel("Learning workflow",{exact:true}).selectOption("practice");
  await panel.getByLabel("Allow read: learning_get_lesson",{exact:true}).check();
  await panel.getByRole("button",{name:"Consent to pinned target + model",exact:true}).click();
  scriptedTool.name="learning_get_lesson";scriptedTool.arguments=JSON.stringify({enrollmentId:enrollment.id,lessonId:"practice"});
  await panel.getByLabel("Message",{exact:true}).fill("Offer optional practice from this original permitted lesson.");
  const practiceRequestStart=gateway.requests.length;
  await panel.getByRole("button",{name:"Send",exact:true}).click();
  try{await expect.poll(()=>gateway!.requests.slice(practiceRequestStart).some((r:any)=>r.messages?.some((m:any)=>m.role==="tool"))).toBe(true);}
  catch(error){console.log("Practice fixture activity:",await panel.locator("main").innerText());throw error;}
  const transcriptRequest=gateway.requests.slice(practiceRequestStart).find((r:any)=>r.messages?.some((m:any)=>m.role==="tool"))!;
  const observed=JSON.parse(transcriptRequest.messages.find((m:any)=>m.role==="tool").content);
  assert.equal(observed.ok,true,JSON.stringify(observed));
  assert.equal(observed.data.title,"Luyện nhớ chủ động");

  assert.ok(transcriptRequest.messages.some((m:any)=>m.role==="system"&&m.content.includes("unofficial and skippable")));
  const toolResult=observed;
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
  // Actual typed admin workflows through the unpacked host, with a scripted
  // provider boundary. This verifies schema/scope/approval, not NL inference.
  async function directRead(name:string,args:Record<string,unknown>={}){
    return page.evaluate(async({name,args}:any)=>{const ctx=await window.agentBridgeV1!.getContext();return window.agentBridgeV1!.invoke({requestId:crypto.randomUUID(),documentId:ctx.documentId,toolName:name,arguments:args,expectedRevision:null,idempotencyKey:null});},{name,args});
  }
  async function identity(user:string,workspace:string){
    await expect(panel.getByRole("button",{name:"Send",exact:true})).toBeEnabled();
    await page.getByRole("button",{name:"Sign out",exact:true}).click();
    await page.getByLabel("Account",{exact:true}).fill(user);await page.getByLabel("Password",{exact:true}).fill(user+"-dev");
    await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.getByRole("button",{name:"Sign out",exact:true}).waitFor();
    await page.getByRole("button",{name:"Administration",exact:true}).click();
    await page.getByLabel("Assistant workspace",{exact:true}).selectOption(workspace);
    await expect.poll(()=>page.evaluate(async()=>String((await window.agentBridgeV1!.getContext()).documentId))).toBe("library:demo::"+workspace);
  }
  async function bind(mode:string,reads:string[]){
    await panel.getByRole("button",{name:"Pin target",exact:true}).click();
    await panel.getByLabel("Learning workflow",{exact:true}).selectOption(mode);
    for(const name of reads)await panel.getByLabel("Allow read: "+name,{exact:true}).check();
    await panel.getByRole("button",{name:"Consent to pinned target + model",exact:true}).click();
  }
  async function hostCall(name:string,args:Record<string,unknown>,decision?:"Approve"|"Deny"){
    scriptedTool.name=name;scriptedTool.arguments=JSON.stringify(args);
    const start=gateway!.requestCount;
    await panel.getByLabel("Message",{exact:true}).fill("Use the selected typed "+name+" operation with this reviewed fixture definition.");
    await panel.getByRole("button",{name:"Send",exact:true}).click();
    if(decision)await panel.getByRole("button",{name:decision,exact:true}).click();
    await expect.poll(()=>gateway!.requestCount>=start+2&&gateway!.requests.at(-1)?.messages?.at(-1)?.role==="tool").toBe(true);
    const request=gateway!.requests.at(-1)!;
    const result=JSON.parse(request.messages.at(-1).content);
    await expect(panel.getByRole("button",{name:"Send",exact:true})).toBeEnabled();
    return {request,result};
  }
  await identity("manager","reports");
  await bind("report",["learning_report_preview","learning_report_summary","learning_export_report","learning_list_saved_reports"]);
  const reportSpec={...freshReport(),title:"Original Lime direct-report progress",kind:"course" as const,columns:["learnerId","contentId","title","version","status","estimatedMinutes","observedSeconds"] as any,sortBy:"contentId" as const};
  const preview=await hostCall("learning_report_preview",{spec:reportSpec,limit:20});
  assert.equal(preview.result.ok,true,JSON.stringify(preview.result));assert.ok(preview.result.data.items.length);
  assert.ok(preview.result.data.items.every((row:any)=>row.learnerId==="learner-a"));
  assert.ok(preview.request.messages.some((m:any)=>m.role==="system"&&m.content.includes("explicit ReportSpec")));
  const summary=await hostCall("learning_report_summary",{spec:reportSpec,snapshotHash:preview.result.data.snapshotHash});
  assert.equal(summary.result.ok,true,JSON.stringify(summary.result));assert.equal(summary.result.data.rowTotal,preview.result.data.total);
  assert.equal(summary.result.data.statusCounts.reduce((n:number,row:any)=>n+row.count,0),summary.result.data.rowTotal);
  assert.equal(summary.result.data.snapshotHash,preview.result.data.snapshotHash);
  const savedReport=await hostCall("learning_save_report",{reportId:"lime-reviewed-report",spec:reportSpec},"Approve");
  assert.equal(savedReport.result.ok,true,JSON.stringify(savedReport.result));
  const ownReports=await hostCall("learning_list_saved_reports",{limit:20});
  assert.equal(ownReports.result.ok,true);assert.ok(ownReports.result.data.items.some((r:any)=>r.id==="lime-reviewed-report"&&r.owner==="manager"));
  const exported=await hostCall("learning_export_report",{spec:reportSpec,rows:"filtered",columns:"visible",limit:20});
  assert.equal(exported.result.ok,true);assert.ok(exported.result.data.csv.includes("learning-vi"));assert.equal(exported.result.data.csv.includes("learner-b"),false);
  await panel.screenshot({path:"artifacts/lime-typed-scoped-report.png",fullPage:true});
  await identity("admin","people");await bind("group",["learning_preview_group"]);
  const group={name:"Original Lime reviewed direct reports",kind:"dynamic",memberIds:[],mode:"ALL",rules:[{field:"role",customField:"",operator:"equals",value:"learner"},{field:"managerId",customField:"",operator:"equals",value:"manager"}]};
  const groupPreview=await hostCall("learning_preview_group",{group,limit:20});
  assert.equal(groupPreview.result.ok,true,JSON.stringify(groupPreview.result));assert.deepEqual(groupPreview.result.data.items.map((u:any)=>u.id),["learner-a"]);
  const groupBefore=await page.evaluate(()=>window.agentBridgeV1!.getContext());
  const deniedGroup=await hostCall("learning_save_group",{groupId:"lime-reviewed-group",group},"Deny");
  assert.notEqual(deniedGroup.result.ok,true);assert.equal((await directRead("learning_get_group",{groupId:"lime-reviewed-group"})).ok,false);
  assert.equal((await page.evaluate(()=>window.agentBridgeV1!.getContext())).revision,groupBefore.revision);
  const savedGroup=await hostCall("learning_save_group",{groupId:"lime-reviewed-group",group},"Approve");
  assert.equal(savedGroup.result.ok,true,JSON.stringify(savedGroup.result));
  const persistedGroup=await directRead("learning_get_group",{groupId:"lime-reviewed-group"});assert.equal(persistedGroup.ok,true);assert.equal(persistedGroup.data.group.kind,"dynamic");
  await panel.screenshot({path:"artifacts/lime-reviewed-group.png",fullPage:true});
  await page.getByLabel("Assistant workspace",{exact:true}).selectOption("programs");
  await expect.poll(()=>page.evaluate(async()=>String((await window.agentBridgeV1!.getContext()).documentId))).toBe("library:demo::programs");
  await bind("curate",["learning_search"]);
  const found=await hostCall("learning_search",{query:"Học tập",language:"vi",limit:20});
  assert.equal(found.result.ok,true,JSON.stringify(found.result));assert.ok(found.result.data.items.some((r:any)=>r.id==="learning-vi"));
  const playlist={title:"Original Lime reviewed reading",summary:"Reviewed original permitted source only",access:"tenant",items:[{kind:"course",id:"learning-vi"}]};
  const curated=await hostCall("learning_save_playlist",{collectionId:"lime-reviewed-playlist",playlist},"Approve");
  assert.equal(curated.result.ok,true,JSON.stringify(curated.result));
  const drafts=await directRead("learning_get_collection_drafts",{limit:20});assert.equal(drafts.ok,true);assert.ok(drafts.data.items.some((r:any)=>r.id==="lime-reviewed-playlist"&&r.kind==="playlist"&&r.state==="draft"));
  await panel.screenshot({path:"artifacts/lime-reviewed-playlist.png",fullPage:true});
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await page.getByLabel("Account",{exact:true}).fill("learner-a");await page.getByLabel("Password",{exact:true}).fill("learner-a-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.getByRole("button",{name:"Sign out",exact:true}).waitFor();
  const finalLearning=await learningState();assert.deepEqual(finalLearning.data,afterPractice.data);assert.equal(finalLearning.revision,afterPractice.revision);
  await writeFile("artifacts/lime-admin-workflows.json",JSON.stringify({passed:true,boundary:"Scripted Mango; actual unpacked Lime/shared Pi/HostPolicy/Pear HTTP/SQLite",report:{principal:"manager",authorizedLearners:["learner-a"],spec:reportSpec,summary:summary.result.data},group:{previewed:["learner-a"],deniedSaveZeroEffects:true,approvedDynamicGroup:true},curation:{sourceId:"learning-vi",version:1,playlistDraftOnly:true},officialLearningUnchanged:true,inferenceQuality:"NOT VERIFIED"},null,2));
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
          "manager typed report preview/summary/export and approved creator-owned save remain direct-report scoped",
          "admin dynamic group preview; denied save zero effect and separately approved save",
          "source-based playlist draft through explicit host approval; official learning unchanged",
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
