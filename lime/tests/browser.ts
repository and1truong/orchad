import { chromium } from "playwright";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startCompanion } from "../src/companion/server.js";
import { startMockGateway } from "../fixtures/gateway.js";
import type { Result, Target } from "../src/shared/contract.js";
const temp = await mkdtemp(path.join(tmpdir(), "lime-browser-"));
const extension = path.join(temp, "extension");
await cp("dist/extension", extension, { recursive: true });
const manifest = JSON.parse(
  await readFile(path.join(extension, "manifest.json"), "utf8"),
);
// Exact fixture + mock-gateway origins are pre-granted ONLY in the test
// copy; the normal unpacked build retains activeTab/user gesture grants.
manifest.host_permissions = [
  "http://127.0.0.1:4313/*",
  "http://127.0.0.1:4311/*",
];
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify(manifest),
);
const fixture = spawn(
  process.execPath,
  ["--import", "tsx", "fixtures/server.ts"],
  { stdio: "pipe" },
);
let context:
    Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined,
  companion: Awaited<ReturnType<typeof startCompanion>> | undefined,
  gateway: Awaited<ReturnType<typeof startMockGateway>> | undefined,
  client: Client | undefined;
try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch("http://127.0.0.1:4313");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  // Scripted mock gateway: deterministic demo_increment turn, then stop,
  // so the sidebar reaches the real approval/dispatch flow offline.
  gateway = await startMockGateway(4311, true);
  context = await chromium.launchPersistentContext(path.join(temp, "profile"), {
    channel: "chromium",
    headless: process.env.LIME_HEADFUL !== "1",
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).hostname;
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4313");
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.setViewportSize({ width: 500, height: 1400 });
  // Match by the option's data-url, not its label: the tab title carries a
  // UTF-8 em-dash whose rendering depends on the browser's locale charset.
  const targetOption = panel.locator(
    'select[aria-label="Target picker"] option[data-url^="http://127.0.0.1:4313"]',
  );
  // Options inside a native <select> are attached but never "visible".
  await targetOption.waitFor({ state: "attached" });
  const tabId = await targetOption.getAttribute("value");
  await panel.getByLabel("Target picker").selectOption(tabId!);
  await panel.getByRole("button", { name: "Pin target", exact: true }).click();
  await panel.getByText("Document: demo-document", { exact: false }).waitFor();
  await panel.getByLabel("Gateway token").fill("lime-fixture-token");
  await panel.getByRole("button", { name: "Load models" }).click();
  await panel
    .locator("select option", { hasText: "mock-counter" })
    .waitFor({ state: "attached" });
  await panel
    .getByRole("button", { name: "Consent to pinned target + model" })
    .click();
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await panel.getByRole("button", { name: "Approve", exact: true }).waitFor();
  await mkdir("artifacts", { recursive: true });
  await panel.screenshot({
    path: "artifacts/approval-live-extension.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById("value")?.textContent === "1",
  );
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await panel.getByRole("button", { name: "Deny", exact: true }).click();
  assert.equal(await page.locator("#value").textContent(), "1");
  companion = await startCompanion({
    port: 0,
    extensionOrigins: [`chrome-extension://${extensionId}`],
  });
  const pairing = companion.beginPairing();
  await panel
    .getByLabel("WebSocket endpoint")
    .fill(`ws://127.0.0.1:${companion.port}/bridge`);
  await panel.getByLabel("One-time pairing code").fill(pairing.code);
  await panel.getByRole("button", { name: "Pair external client" }).click();
  await panel.getByRole("button", { name: "Confirm pairing" }).click();
  await panel
    .getByText("MCP credential · copy to local CLI environment")
    .click();
  const mcpToken = await panel.locator("pre").textContent();
  client = new Client({ name: "lime-live-browser-sdk", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${companion.port}/mcp`),
      { requestInit: { headers: { Authorization: "Bearer " + mcpToken } } },
    ),
  );
  const listed = await client.callTool({
    name: "host_list_targets",
    arguments: {},
  });
  const target = (listed.structuredContent as Result).data as {
    targets: Target[];
  };
  assert.equal(target.targets.length, 1);
  const binding = {
    targetId: target.targets[0].targetId,
    pageInstanceId: target.targets[0].pageInstanceId,
  };
  const invoke = {
    requestId: "live-mcp-1",
    documentId: "demo-document",
    toolName: "demo_increment",
    arguments: { amount: 1 },
    expectedRevision: 1,
    idempotencyKey: "live-key-1",
  };
  const pending = client.callTool({
    name: "host_call_tool",
    arguments: { ...binding, call: invoke },
  });
  await panel.getByRole("button", { name: "Approve", exact: true }).click();
  const result = await pending;
  assert.deepEqual((result.structuredContent as Result).data, {
    value: 2,
    revision: 2,
  });
  assert.equal(await page.locator("#value").textContent(), "2");
  await panel
    .getByText("MCP credential · copy to local CLI environment")
    .click();
  await panel.screenshot({
    path: "artifacts/connected-live-extension.png",
    fullPage: true,
  });
  await page.screenshot({ path: "artifacts/counter-live-page.png" });
  await page.goto("http://127.0.0.1:4313/empty");
  await panel.getByText("target changed", { exact: true }).waitFor();
  // Navigation invalidated the consent, which revokes the pairing: the MCP
  // credential either already died at HTTP layer (SDK throws) or routes to a
  // consent that no longer exists (FORBIDDEN result). Both are denial.
  const denied = await client
    .callTool({ name: "host_get_context", arguments: binding })
    .then(
      (r) => r.isError === true,
      () => true,
    );
  assert.equal(denied, true);
  await panel.getByRole("button", { name: "Pin target", exact: true }).click();
  await panel.getByText("error", { exact: true }).waitFor();
  await writeFile(
    "artifacts/browser-report.json",
    JSON.stringify(
      {
        passed: true,
        runtime:
          "Playwright Chromium extension page (not native side-panel container)",
        checks: [
          "sidebar approved/denied write",
          "real MCP SDK -> companion -> actual extension -> MAIN-world fixture",
          "navigation invalidation",
          "unsupported bridge",
        ],
        nativeSidePanelManual: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Live Chromium extension-page checks PASS. Native Side Panel container remains manual.",
  );
} finally {
  await client?.close().catch(() => {});
  await companion?.close();
  await context?.close();
  await gateway?.close();
  fixture.kill();
  await rm(temp, { recursive: true, force: true });
}
