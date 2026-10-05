# Canonical bridge scenario

`bridge-scenario.json` is the single canonical Agent App Bridge 0.1 interop
artifact: every POC's acceptance suite executes or validates the same
sequence, so cross-host conformance is proved on identical steps rather than
per-POC paraphrases.

Steps cover discovery → context → catalog → consented read (skipped where the
host requires approval for reads) → approved write → semantic replay →
idempotency conflict → stale revision → missing envelope → unknown tool →
schema violation → foreign documentId → denied approval → cancellation.

## Drivers

Each host adapts its own policy/dispatch surface to the driver contract in
`run-scenario.mjs` and executes every step:

- `lime/tests/scenario.test.ts` — `HostPolicy` + `CounterFixture` (14/14)
- `coconut/tests/scenario.test.mjs` — `Policy` + `makeCounter` (14/14)
- `coconut/tests/mcp-scenario.test.mjs` — same scenario over the real MCP
  HTTP transport (`startMcp`), not in-proc calls (14/14)

Consumers that don't dispatch still validate the artifact against their own
boundaries:

- `guava/tests/scenario.test.ts` — every call envelope passes the backend's
  `invokeSchema` (requestId/documentId/toolName/arguments/revision/key bounds)
- `mango/tests/scenario.test.ts` — every tool call fits the agent-client
  `toolCall` schema and envelope caps

## Host semantics recorded in the scenario

- `target`: the canonical counter descriptor both fixtures serve.
- `readsConsented`: lime auto-runs consented reads; coconut requires approval
  for every invoke. Steps carry `ifReadsConsented` so the difference is
  recorded, not hidden.
- `expect.code` accepts an array — hosts legitimately differ on e.g. the
  foreign-documentId failure code; any listed code conforms.

## Strict integrated acceptance

`guava/scripts/host-fixture.ts` serves the real `CanvasService` (same
envelope/authz/idempotency path as `/api/invoke`) behind the real coconut
`Policy` + `startMcp` transport, auto-approving like a trusted operator. Run:

```sh
node --import tsx scripts/host-fixture.ts   # prints export ORCHARD_DESKTOP_*
source <(node --import tsx scripts/host-fixture.ts &)  # or eval its exports
ORCHARD_RUN_WRITES=true ORCHARD_INTEGRATION_REQUIRE=DESKTOP \
  node --import tsx scripts/integration.ts --strict
```

`scripts/integration.ts` strict mode: any required host kind that is
`NOT RUN` fails the suite (exit≠0). This catches "acceptance passed while
nothing ran" — including schema-dialect regressions like a host rejecting the
real Guava tool catalog.

The BROWSER kind still needs a real Chrome + extension loopback MCP and stays
a local/manual lane; CI enforces DESKTOP headlessly.
