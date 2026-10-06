# ADR-001: Durable agent runner (pi-durable + Mango transport)

Status: accepted (POC). Implements issue #48 — task recovery across restart,
host disconnect, and UI close/reopen with checkpoint, safe replay, and host
rebind.

## Context

Orchard hosts (lime companion, coconut sidecar) run an agent turn that calls
host tools on the user's behalf. Today a process death, host disconnect, or
sidepanel close loses the turn and — worse — makes any in-flight host
mutation's outcome unknowable. `@earendil-works/pi-durable` provides a
durable Harness (task graph + SQLite journal) this POC adopts as the single
orchestration owner.

## Decision

- **One Harness owns orchestration.** `openRunner()` wraps `Harness.open` over
  `openNodeSqliteStorage`. No copied agent loop: generation is `pi.generation`
  tasks streaming through `createMangoProvider`, which reuses the exact
  `streamMangoCompletion` seam from `@orchard/agent-client` (#47) — same
  strict SSE gate, batch caps, `x_gateway_state` capture, `argumentsRaw`
  pinning.
- **Storage layout.** One SQLite DB per user, at the host's app-data path
  (lime: `~/.local/share/lime/runs.db`, coconut: app-data dir). Layout:
  pi-durable's own tables plus three docs —
  `orchard.meta` (session scope: `schemaVersion`, `runtime` stamp),
  `orchard.ops` (conversation scope: op journal keyed by callId),
  `orchard.control` (conversation scope: `cancelledAt` intent).
- **Single owner.** `{db}.owner` lockfile (`wx` + pid). Any live owner —
  including the same process — blocks a second open
  (`StorageOwnerConflict`). A stale lock (dead pid) is taken over: sidecar
  death is a normal reopen path. No DB in the guest origin/WebView.
- **Version gate.** First open stamps `schemaVersion`+`RUNTIME_VERSION`
  (`pi-durable@1.0.4 pi-ai@1.0.4 chord@1.0.4`). A later open with different
  constants throws `IncompatibleStorage` before any scheduling resumes —
  fail closed, never silent-run on a foreign layout. All deps exact-pinned.

## Lifecycle

`configure` (live gateway credentials, memory-only `CredentialStore`) →
`bind` (host targets + dispatch fn + CAS revision seed + consent gate) →
`submit` (durably admitted, deduped by requestId) → `watch`/`status` →
`resume`/`cancel`/`reconcile`/`resolveOp` → `close` (release lock).

Cancel writes `orchard.control.cancelledAt` *before* aborting, so intent
persists across crash; parked waiters are woken so they can settle as
cancelled results instead of hanging.

## Op journal and replay matrix

Every host invocation is an `OpRecord` keyed by the model's callId:
`envelope {targetId, requestId, toolName, arguments, argumentsRaw,
expectedRevision, idempotencyKey}`, `attempts`, `status`. The `parked`
checkpoint commits *before* `whenBound`/dispatch, so an op can never leave
the process without a durable mark.

| Class | When | Replay |
|---|---|---|
| safe | `effect: read`, or write verified idempotent | pi re-runs `execute()`; journal re-entry revalidates consent, then re-dispatches the **same** envelope + idempotencyKey (attempts++). Backend dedups → exactly one effect. |
| unsafe | any other write | pi never re-runs `execute()` — task settles `interrupted`. Op stays `dispatched`/`interrupted` → `needs_reconciliation`. `resolveOp` is the only way out. Never auto-repeated. |
| parked→recovered | parked at death | still `parked` on reopen; wakes on `bind` for its own target only; `attempts` stays 0 until sent. |

`reconcile()` cross-checks journal vs live tasks vs committed tool results:
`dispatched` + no live task + no result → `ambiguous` (backend may have
applied it); `dispatched` + synthesized result → `interrupted`. Host may
answer via its own read-only status API (future); absent that, ambiguous
blocks retries and surfaces to the user.

## Auth in memory, never in checkpoint

The gateway token lives in `MemoryCredentials` (an in-process
`CredentialStore`). Reopen requires `configure()` with a fresh token:
storage grants no rights, pairing tokens/consent/UI leases never resurrect.
No secrets enter journal, transcript, or logs.

`x_gateway_state` is opaque; it rides `AssistantMessage.responseId` through
storage verbatim and is re-emitted only on the assistant message that owns
it (digest binds raw `arguments`). Expired/mismatch → gateway 400 →
`[INVALID_REQUEST]` failed phase; never a silent retry.

## Durability guarantees (and non-guarantees)

Guaranteed: at-least-once journal visibility (never silent dispatch), dedup
by requestId/idempotencyKey, consent revalidated on every re-entry, honest
`RunStatus` phases, budgets (`turnUsage` from committed wire) surviving
restart, disk-full/commit failure surfaces (commit throws — never
fake-done).

Not guaranteed: a sidecar dispatch may commit results the UI never sees
(daemon-owned); `ambiguous` needs a host verdict; `attempts>1` marks
at-least-once delivery for idempotent targets only.
