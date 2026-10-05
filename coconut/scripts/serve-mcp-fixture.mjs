// Headless trusted-host endpoint: real MCP server + real Policy driving the
// demo-counter fixture. Intended for the strict integration suite and CI —
// approvals are auto-granted (fixture trust domain), so it exercises
// envelope/idempotency/stale behavior without a GUI.
import { Policy, ok } from "../host/policy.mjs";
import { makeCounter } from "../fixtures/counter.mjs";
import { startMcp } from "../host/mcp.mjs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const scenario = JSON.parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      "@orchard/bridge-contract/scenario/bridge-scenario.json",
    ),
    "utf8",
  ),
);
const page = makeCounter();
const autoApprove = process.env.COCONUT_FIXTURE_AUTO_APPROVE !== "false";
const policy = new Policy(
  async (t, op, call) =>
    op === "invoke" ? page.invoke(call) : ok(await page[op]()),
);
policy.bind({ ...scenario.target });
// Keep the trusted-UI window open and resolve approval cards like an
// operator would; deny with COCONUT_FIXTURE_AUTO_APPROVE=false.
setInterval(() => {
  policy.heartbeat();
  for (const a of [...policy.pending.values()]) policy.decide(a.id, autoApprove);
}, 200).unref();
const pair = policy.pair("guava-integration", ["read", "write"], [
  scenario.target.targetId,
]);
const port = Number(process.env.PORT ?? 14315);
const server = await startMcp(policy, port);
console.log(`ORCHARD_DESKTOP_MCP_URL=http://127.0.0.1:${server.port}/mcp`);
console.log(`ORCHARD_DESKTOP_MCP_TOKEN=${pair.token}`);
console.log(`ORCHARD_DOCUMENT_ID=${scenario.target.documentId}`);
console.error(
  `fixture host MCP at 127.0.0.1:${server.port} (auto-approve=${autoApprove})`,
);
