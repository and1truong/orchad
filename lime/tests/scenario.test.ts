import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Canonical artifact lives at repo root; the .d.mts beside it types the import.
import { createRequire } from "node:module";
import { runScenario } from "@orchard/bridge-contract/scenario/run-scenario.mjs";
import { CounterFixture } from "../fixtures/counter.js";
import { HostPolicy, type Approval } from "../src/host/policy.js";
import type { Result } from "../src/shared/contract.js";

const scenario = JSON.parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      "@orchard/bridge-contract/scenario/bridge-scenario.json",
    ),
    "utf8",
  ),
);

test("canonical bridge scenario: lime HostPolicy + CounterFixture", async () => {
  const fixture = new CounterFixture();
  const controller = new AbortController();
  let approveNext = true;
  const approvals: Approval[] = [];
  const policy = new HostPolicy(
    fixture,
    {
      clientId: "scenario",
      sessionId: "s1",
      target: { ...fixture.target },
      sessionEpoch: null,
      reads: new Set(["demo_read"]),
    },
    async (a) => {
      approvals.push(a);
      return approveNext;
    },
    controller.signal,
  );
  const host = {
    target: fixture.target,
    readsConsented: true,
    listTargets: async (): Promise<Result> => ({
      ok: true,
      revision: null,
      data: { targets: [fixture.target] },
      error: null,
    }),
    getContext: () => policy.context(),
    listTools: () => policy.tools(),
    call: async (call: Record<string, unknown>, o: { approve: boolean; signal: AbortSignal }) => {
      approveNext = o.approve;
      return policy.call(call, o.signal);
    },
    dispatched: () => fixture.calls,
    revision: () => fixture.revision,
  };
  const failures = await runScenario(scenario, host as any, (name, status, detail) =>
    console.log(`  ${status.toUpperCase()} ${name}${detail ? " — " + detail : ""}`),
  );
  assert.deepEqual(failures, []);
});
