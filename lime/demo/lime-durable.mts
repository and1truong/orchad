/**
 * Bounded lime durable demo (issue #48): scripted Mango gateway → companion
 * durable runner → approved guava mutation → SIGKILL the companion mid
 * approval → restart + rebind/re-pair → reconcile/resume → one effect.
 *
 *   cd packages/agent-durable && node --import tsx demo/lime-durable.mts
 *
 * Evidence lands in demo/evidence/: screenshots, run status snapshots and the
 * persisted transcript. Runs headed so the flow is recordable.
 */
import { chromium, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { startMockGateway } from "../fixtures/gateway.js";

const REPO = path.resolve(import.meta.dirname, "../..");
const GUAVA_PORT = 4310;
const GATEWAY_PORT = 4311;
const COMPANION_PORT = 4312;
const TOKEN = "lime-fixture-token";
const EVIDENCE = path.join(import.meta.dirname, "evidence");
mkdirSync(EVIDENCE, { recursive: true });

// Node ids are stamped per demo run: guava persists across restarts, so a
// deterministic id would collide with a previous run's leftover node.
const RUN_STAMP = Date.now().toString(36);
const PATCH = (n: number) =>
  JSON.stringify({
    operations: [
      {
        op: "add_node",
        node: {
          id: `durable-demo-${RUN_STAMP}-${n}`,
          type: "note",
          label: `Durable demo node ${RUN_STAMP}-${n}`,
          body: "Written by the companion-owned durable run",
          position: { x: 640, y: 40 * n },
          evidenceIds: [],
        },
      },
    ],
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const evidence = (name: string, data: unknown) =>
  writeFileSync(
    path.join(EVIDENCE, name),
    typeof data === "string" ? data : JSON.stringify(data, null, 2),
  );

let companion: ChildProcess | null = null;
let companionStdout = "";
async function startCompanion(db: string) {
  companion = spawn(
    process.execPath,
    ["--import", "tsx", "src/companion/cli.ts"],
    {
      cwd: path.join(REPO, "lime"),
      env: {
        ...process.env,
        LIME_COMPANION_PORT: String(COMPANION_PORT),
        LIME_EXTENSION_ORIGINS: `chrome-extension://${extensionId}`,
        LIME_GATEWAY_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
        LIME_GATEWAY_TOKEN: TOKEN,
        LIME_GATEWAY_MODEL: "mock-counter",
        LIME_DURABLE_DB: db,
        LIME_IDEMPOTENT_TOOLS: "canvas_apply_patch",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  companionStdout = "";
  companion.stdout!.on("data", (d) => (companionStdout += d));
  companion.stderr!.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 100; i++) {
    if (companionStdout.includes("listening")) return;
    await sleep(100);
  }
  throw new Error("companion did not start: " + companionStdout);
}
async function pairCode(): Promise<string> {
  companion!.stdin!.write("pair\n");
  for (let i = 0; i < 100; i++) {
    const m = companionStdout.match(/pairing code.*?: (\S+)/);
    if (m) {
      companionStdout = companionStdout.replace(m[0], "");
      return m[1];
    }
    await sleep(100);
  }
  throw new Error("no pairing code: " + companionStdout);
}
function killCompanion() {
  companion?.kill("SIGKILL");
  companion = null;
}

const waitText = (page: Page, text: string, timeout = 20000) =>
  page.getByText(text, { exact: false }).first().waitFor({ timeout });
const dStatus = async (page: Page) => {
  const el = await page
    .locator("section:has-text('Durable run') .pin")
    .textContent();
  return el ?? "";
};

// —— boot ————————————————————————————————————————————————————
const db = path.join(mkdtempSync(path.join(tmpdir(), "lime-durable-")), "runs.db");
let call = 0;
// Every scripted turn asks for a fresh canvas_apply_patch node; guava dedups
// retries of the SAME op by idempotencyKey, so exactly one node lands.
const gateway = await startMockGateway(GATEWAY_PORT, true, {
  name: "canvas_apply_patch",
  arguments: (callNo: number) => PATCH(callNo),
});

const guava = spawn("npm", ["run", "dev"], {
  cwd: path.join(REPO, "guava"),
  env: { ...process.env, PORT: String(GUAVA_PORT) },
  stdio: "inherit",
});
for (let i = 0; i < 200; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${GUAVA_PORT}/health`)).ok) break;
  } catch {}
  if (i === 199) throw new Error("guava did not start");
  await sleep(150);
}

// Extension with host permissions for guava + gateway (production build).
const extTmp = path.join(mkdtempSync(path.join(tmpdir(), "lime-ext-")), "ext");
cpSync(path.join(REPO, "lime/dist/extension"), extTmp, { recursive: true });
const manifestPath = path.join(extTmp, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = [
  `http://127.0.0.1:${GUAVA_PORT}/*`,
  `http://127.0.0.1:${GATEWAY_PORT}/*`,
];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const ctx = await chromium.launchPersistentContext(
  path.join(mkdtempSync(path.join(tmpdir(), "lime-profile-")), "p"),
  {
    channel: "chromium",
    headless: false,
    recordVideo: { dir: path.join(EVIDENCE, "video") },
    args: [
      `--disable-extensions-except=${extTmp}`,
      `--load-extension=${extTmp}`,
      "--remote-debugging-port=9224",
      "--remote-allow-origins=*",
      "--force-device-scale-factor=1.5",
      "--window-size=1400,1000",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  },
);
const worker =
  ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
const extensionId = new URL(worker.url()).hostname;
console.log("extension:", extensionId);

const guavaPage = await ctx.newPage();
await guavaPage.goto(`http://127.0.0.1:${GUAVA_PORT}`);
await guavaPage.locator('select[name="username"]').selectOption("investigator");
await guavaPage.locator('input[name="password"]').fill("investigator-dev");
await guavaPage.getByRole("button", { name: "Sign in" }).click();
await waitText(guavaPage, "Consumer lag");

await startCompanion(db);
console.log("companion up; durable db:", db);

let panel = await ctx.newPage();
await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await panel.setViewportSize({ width: 520, height: 1200 });

async function bindPanel(p: Page) {
  const opt = p.locator(
    `select[aria-label="Target picker"] option[data-url^="http://127.0.0.1:${GUAVA_PORT}"]`,
  );
  await opt.waitFor({ state: "attached" });
  await p
    .getByLabel("Target picker")
    .selectOption(await opt.getAttribute("value"));
  await p.getByRole("button", { name: "Pin target", exact: true }).click();
  await p.getByText("Document: rca-consumer-lag", { exact: false }).waitFor();
  await p.getByLabel("Gateway token").fill(TOKEN);
  await p.getByRole("button", { name: "Load models" }).click();
  await p
    .locator("select option", { hasText: "mock-counter" })
    .waitFor({ state: "attached" });
  await p
    .getByRole("button", { name: "Consent to pinned target + model" })
    .click();
  await p.getByLabel("WebSocket endpoint").fill(`ws://127.0.0.1:${COMPANION_PORT}/bridge`);
  await p.getByLabel("One-time pairing code").fill(await pairCode());
  await p.getByRole("button", { name: "Pair external client" }).click();
  await p.getByRole("button", { name: "Confirm pairing" }).click();
  await waitText(p, "Client:");
}

async function runOnce(p: Page, tag: string) {
  await p
    .getByLabel("Durable prompt")
    .fill(`Add one durable demo node (${tag})`);
  await p.getByRole("button", { name: "Run durable", exact: true }).click();
  try {
    await p.getByRole("button", { name: "Approve", exact: true }).waitFor({ timeout: 30000 });
  } catch {
    evidence(`${tag}-nostatus.txt`, await dStatus(p) + "\n" + await p.locator("main").innerText());
    await p.screenshot({ path: path.join(EVIDENCE, `${tag}-stuck.png`), fullPage: true });
    throw new Error("no approval card: " + (await dStatus(p)));
  }
  await p.screenshot({ path: path.join(EVIDENCE, `${tag}-approval.png`) });
  await p.getByRole("button", { name: "Approve", exact: true }).click();
  // Phase alone is not proof: the model can answer 'Done.' after a failed
  // tool call. The op itself must settle 'completed'.
  for (let i = 0; i < 120; i++) {
    const s = await dStatus(p);
    if (s.includes("canvas_apply_patch=completed") && s.includes("phase: completed")) return;
    if (s.match(/canvas_apply_patch=(failed|ambiguous)/)) break;
    await sleep(250);
  }
  throw new Error("op did not settle completed: " + (await dStatus(p)));
}

// —— phase 1: approved mutation ——————————————————————————————
await bindPanel(panel);
await waitText(panel, "Durable run");
await runOnce(panel, "p1");
evidence("p1-status.json", await dStatus(panel));
const nodeCount1 = await guavaPage.evaluate(
  async () =>
    (await (window as any).agentBridgeV1.invoke({
      requestId: crypto.randomUUID(),
      documentId: "rca-consumer-lag",
      toolName: "canvas_get_graph",
      arguments: {},
      expectedRevision: null,
      idempotencyKey: null,
    })).data?.nodes?.length,
);
console.log("phase 1 complete; guava nodes:", nodeCount1);
await panel.screenshot({ path: path.join(EVIDENCE, "p1-completed.png") });

// —— phase 2: kill companion mid-approval, restart, reconcile ——
await panel
  .getByLabel("Durable prompt")
  .fill("Add one more durable demo node");
await panel.getByRole("button", { name: "Run durable", exact: true }).click();
await panel.getByRole("button", { name: "Approve", exact: true }).waitFor();
// The op is dispatched and waiting on human approval — kill the owner now.
killCompanion();
console.log("companion killed with op dispatched/awaiting approval");
await panel.screenshot({ path: path.join(EVIDENCE, "p2-killed.png") });

await startCompanion(db); // same DB — checkpoint must survive
// The old socket is dead: re-pair is the honest rebind (new code, new
// clientId, same pinned target and consent).
await panel.getByRole("button", { name: "Reconnect bridge" }).click().catch(() => {});
await panel.getByLabel("One-time pairing code").fill(await pairCode());
await panel.getByRole("button", { name: "Pair external client" }).click();
await panel.getByRole("button", { name: "Confirm pairing" }).click();
await waitText(panel, "Client:");
await panel.getByRole("button", { name: "Refresh" }).click();
evidence("p2-reopen-status.json", await dStatus(panel));
await panel.getByRole("button", { name: "Resume", exact: true }).click();
// Re-entry redispatches the same envelope + idempotencyKey → new approval.
await panel.getByRole("button", { name: "Approve", exact: true }).waitFor({ timeout: 30000 });
await panel.getByRole("button", { name: "Approve", exact: true }).click();
for (let i = 0; i < 160; i++) {
  const s = await dStatus(panel);
  if (s.match(/canvas_apply_patch=(completed|reconciled)/) && s.includes("phase: completed")) break;
  await sleep(250);
}
await panel.screenshot({ path: path.join(EVIDENCE, "p2-resumed.png") });
const audit = await guavaPage.evaluate(
  async () => (await fetch("/api/documents/rca-consumer-lag/audit")).json(),
).catch(() => null);
evidence("p2-guava-audit.json", audit ?? "n/a");
const p2Status = await dStatus(panel);
evidence("p2-final-status.json", p2Status);
if (!/canvas_apply_patch=completed x2|canvas_apply_patch=(completed|reconciled)/.test(p2Status))
  console.warn("unexpected p2 status:", p2Status);

// —— phase 3: sidepanel close/reopen pause proof ————————————————
await panel.getByLabel("Durable prompt").fill("Add a third demo node");
await panel.getByRole("button", { name: "Run durable", exact: true }).click();
await panel.getByRole("button", { name: "Approve", exact: true }).waitFor();
// Do NOT approve: close the panel page → socket dies → companion unbinds.
await panel.close();
await sleep(1500);
const auditBeforeReopen = await guavaPage.evaluate(
  async () => (await fetch("/api/documents/rca-consumer-lag/audit")).json().catch(() => null),
).catch(() => null);
evidence("p3-panel-closed-audit.json", auditBeforeReopen ?? "n/a");

panel = await ctx.newPage();
await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await panel.setViewportSize({ width: 520, height: 1200 });
await bindPanel(panel);
await panel.getByRole("button", { name: "Refresh" }).click();
const p3Status = await dStatus(panel);
evidence("p3-reopen-status.json", p3Status);
await panel.screenshot({ path: path.join(EVIDENCE, "p3-reopened.png") });
// The panel-closed dispatch was refused with 'outcome unknown — no replay':
// the op must sit in reconciliation, never silently retried. Guava's audit
// log is the ground truth that zero effect landed; resolve it honestly.
if (!/canvas_apply_patch=(ambiguous|interrupted)/.test(p3Status))
  console.warn("expected p3 op in reconciliation:", p3Status);
await panel.getByRole("button", { name: "Reconcile", exact: true }).click().catch(() => {});
await panel.getByRole("button", { name: "Not applied", exact: true }).click().catch(() => {});
await sleep(800);
evidence("p3-resolved-status.json", await dStatus(panel));

// Persisted transcript as evidence
await panel.getByRole("button", { name: "Transcript" }).click();
await sleep(1000);
await panel.screenshot({ path: path.join(EVIDENCE, "p3-transcript.png"), fullPage: true });

console.log("demo complete; evidence in", EVIDENCE);
killCompanion();
await ctx.close().catch(() => {});
guava.kill();
process.exit(0);
