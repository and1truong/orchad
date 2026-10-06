# @orchard/agent-durable

Durable agent runner for Orchard hosts (issue #48). One pi-durable `Harness`
over SQLite owns orchestration: prompts are durable submissions, tool calls
become journaled host ops, and a process that dies mid-run is recovered by a
new process opening the same DB — checkpoint, replay rules and re-binding are
in `ADR-001-DURABLE-RUNNER.md`.

## Storage

- One SQLite DB per host instance (`LIME_DURABLE_DB` /
  `COCONUT_DURABLE_DB`). Everything the run needs is in it: transcript,
  ops journal, submissions, cancel intent, schema/runtime version stamp.
- **Single owner.** A sibling `runs.db.lock` (PID file) fails a second
  `openRunner` on a live DB (`StorageOwnerConflict`); a stale lock from a
  dead PID is reclaimed. Two processes must never drive one run.
- **Version gate.** First open stamps schema + runtime version; reopening
  with an incompatible build fails closed (`IncompatibleStorage`) before any
  scheduling resumes.
- **No secrets.** The Mango token lives in memory only — supply it again via
  `configure()` after every open. Tests assert the DB bytes never contain
  the bearer token; do not log it either.
- Retention: the DB is append-mostly; delete the file (+ `.lock`) to reset.
  There is no pruning in the POC.

## Lifecycle / phases

`status()` → `phase`:

| Phase | Meaning |
|---|---|
| `idle` | No admitted input |
| `queued`/`running` | Input admitted, generation or tool round live |
| `waiting_for_host` | Ops parked — their target isn't bound |
| `needs_reconciliation` | An op is `ambiguous`/`interrupted` — outcome unprovable, needs a human verdict |
| `cancelled` | Cancel intent persisted; work aborted |
| `completed` | Latest input answered cleanly |
| `failed` | Terminal run failure (`detail` carries `[STEP_LIMIT]`/`[AUTHENTICATION]`/model errors) |

## Ops journal

Every host tool call mints an `OpRecord` *before* dispatch:

`parked` → `dispatched` → `completed` | `failed` | `ambiguous` | `interrupted` → (`reconciled` via `resolveOp` verdict)

- `dispatched` is journaled *before* the bytes leave; a crash while
  dispatched recovers to `ambiguous` (no live task + no tool result →
  outcome unknown, never silent-replayed).
- An `INTERNAL`/`TIMEOUT` host result saying "outcome unknown — no replay"
  settles `ambiguous`, not `failed`; other retryable errors settle
  `interrupted`. Ambiguous/interrupted ops block the phase at
  `needs_reconciliation` until `resolveOp({callId, verdict})`.
- Re-entry (`resume` after reopen) revalidates consent/binding
  (`revalidate()` throws → `failed`, zero dispatches) and re-sends the
  **same envelope + idempotencyKey** for `safe` (read or `idempotentTools`)
  ops; the app's atomic dedup makes it exactly one effect. `unsafe` ops are
  never re-dispatched automatically.
- Late results after cancel are recorded; the phase stays `cancelled`.
- `expectedRevision` CAS: write envelopes carry the last known target
  revision; successful results carry the authoritative revision forward.

## Runner API

```ts
const runner = await openRunner({ storagePath, maxSteps?, maxToolCalls?, fetcher? });
await runner.configure({ baseUrl, token, model });     // Mango seam from issue #47
await runner.bind(bindings, dispatch);                  // HostBinding[] + dispatch fn
await runner.submit({ prompt, requestId? });
await runner.status() | runner.watch(cb) | runner.transcript();
await runner.resume() | runner.cancel() | runner.reconcile();
await runner.resolveOp(callId, {status:"reconciled"|"failed", ...});
await runner.close();                                   // releases the DB lock
```

`HostBinding`: `{ targetId, tools, revision?, idempotentTools?, revalidate? }`.
`revalidate` re-proves consent before any re-dispatch — pairing live, target
in scope, session epoch unchanged.

## Bounded demo (lime)

`lime/demo/lime-durable.mts` — headed Chromium + real guava + mock Mango
gateway + real companion over `ws://127.0.0.1:4312/bridge`:

```bash
cd lime && npm run build && npm --prefix ../packages/agent-durable run build
node --import tsx demo/lime-durable.mts
```

Phases (evidence → `lime/demo/evidence/`): approved `canvas_apply_patch`
mutation (1 guava effect) → SIGKILL companion mid-approval → restart on the
same DB → re-pair → resume → same envelope+key → 1 effect → sidepanel
close → zero dispatch (op `ambiguous`, phase `needs_reconciliation`) →
reopen → reconcile → verdict.

## Bounded demo (coconut) — NOT RUN

The sidecar `durable_*` ops are wired (`coconut/host/durable.mjs`,
`durable-status` frames → native UI resume/cancel/reconcile section), but
the issue requires the native lane (Tauri WebView + sidecar on a supported
OS). This box is headless-only, so the native demo is recorded as **NOT
RUN** rather than substituted with a headless fixture, per the issue's
rule. To run it on a desktop OS:

```bash
cd coconut && npm install && npm run vendor:durable && npm run tauri dev
# env: COCONUT_GATEWAY_URL / COCONUT_GATEWAY_TOKEN / COCONUT_GATEWAY_MODEL /
#      COCONUT_DURABLE_DB / COCONUT_IDEMPOTENT_TOOLS
```

## Limitations

- POC only: no multi-conversation routing (one root conversation per DB),
  no pruning, no compaction tuning, `maxSteps`/`maxToolCalls` are the only
  budgets. No coding tools, no multi-agent — per the issue rules.
- `watch` pushes status on op/state transitions; a crashed *generation*
  partial is not separately surfaced.
- Guava must be reachable via the host's pinned target; nothing here grants
  new privileges to guest/external MCP clients — they ride the same
  pair/consent/approval seam.
