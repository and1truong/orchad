// Headless trusted-host endpoint exposing the REAL Guava domain service
// (CanvasService — same envelope validation, authz, idempotency and audit
// path as /api/invoke) behind the REAL Coconut MCP transport + Policy.
// Prints the ORCHARD_DESKTOP_* env contract the strict integration suite
// consumes. Approvals are auto-granted (fixture trust domain); deny with
// COCONUT_FIXTURE_AUTO_APPROVE=false.
// @ts-expect-error coconut host modules are plain .mjs (no types)
import { Policy, ok } from "../../coconut/host/policy.mjs";
// @ts-expect-error coconut host modules are plain .mjs (no types)
import { startMcp } from "../../coconut/host/mcp.mjs";
import { openDatabase } from "../src/server/database.ts";
import { CanvasService, type Principal } from "../src/server/service.ts";
import { catalog } from "../src/shared/catalog.ts";
import { appId } from "../src/shared/contract.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const db = openDatabase(join(mkdtempSync(join(tmpdir(), "guava-host-")), "fixture.sqlite"));
const service = new CanvasService(db);
const principal: Principal = { id: "investigator", role: "investigator" };
const documentId = process.env.ORCHARD_DOCUMENT_ID ?? "rca-consumer-lag";
const target = {
  targetId: "guava-fixture",
  pageInstanceId: "guava-fixture-page",
  origin: "http://127.0.0.1:4310",
  appId,
  documentId,
  title: "Guava (headless fixture)",
};
// Bridge-shaped page the Coconut policy dispatches to: describe/getContext
// come from the real catalog + service; invoke is the real domain path.
const page = {
  describe: async () => ({ protocolVersion: "0.1", appId, tools: catalog }),
  getContext: async () => {
    const d = service.document(principal, documentId);
    return {
      appId,
      documentId,
      revision: d.revision,
      selectionIds: [],
      summary: d.title,
    };
  },
  invoke: async (call: unknown) => service.invoke(principal, call),
};

const policy = new Policy(async (_t: unknown, op: string, call: unknown) =>
  op === "invoke" ? page.invoke(call) : ok(await (page as any)[op]()),
);
policy.bind(target);
policy.heartbeat();
const autoApprove = process.env.COCONUT_FIXTURE_AUTO_APPROVE !== "false";
setInterval(() => {
  policy.heartbeat();
  for (const a of [...policy.pending.values()]) policy.decide(a.id, autoApprove);
}, 25).unref();
// Read consent is pinned to descriptor identity at pair time: the fixture
// snapshots the real catalog so 'all' grants exactly these tools — a tool
// appearing or changing later still requires a fresh approval.
policy.tools.set(target.targetId, catalog);
const pair = policy.pair(
  "guava-integration",
  ["read", "write"],
  [target.targetId],
  "all",
);
const server = await startMcp(policy, Number(process.env.PORT ?? 0));
console.log(`export ORCHARD_DESKTOP_MCP_URL=http://127.0.0.1:${server.port}/mcp`);
console.log(`export ORCHARD_DESKTOP_MCP_TOKEN=${pair.token}`);
console.log(`export ORCHARD_DOCUMENT_ID=${documentId}`);
console.error(
  `guava-behind-coconut MCP at 127.0.0.1:${server.port} (auto-approve=${autoApprove}, documentId=${documentId})`,
);
