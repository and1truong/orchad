# Contract notes — no interface changes

Lime implements the contract file added by the user on main, copied byte-for-byte into CONTRACT.md. No renamed fields/methods, enum changes, or added required wire fields.

Authoritative source: root `contract`, Git blob `024abfa69475ebd25e8017f16133c7049d2845ae`, read at main commit `b51ce3049dd9619c622032de1d1932017a15098e`.

That exact file has SHA-256 `137db8eb8557bdad656a48337c9020227fc7a1ca1d3b537469ca5cfbd90d564d`, not the prompt's `18ec8f8d1812ab06e77d39536b746d82482285073a79ee9a076149461d65962c`. Do not silently replace the authoritative text to match an unknown serialization. Git blob equality proves the checked-in copy is exact.

Potential future clarification: the fixture says data contains value and revision; Lime includes both in data and the envelope revision, which is compatible with arbitrary JSON data.

Logout detection requires application cooperation: the contract has no authentication-state notification method. A host can invalidate runtime navigation/document changes and fail on unauthorized page calls; it cannot prove a server session remains logged in without the application's methods enforcing that boundary.

Tool-argument validation interprets page-supplied JSON Schema (draft 7 subset via `@cfworker/json-schema`) instead of compiling it, because MV3 `script-src 'self'` forbids `new Function`. `format` assertions are now honored when the format is known (previously ignored); unknown formats still pass. No wire fields, methods or enums change.

## Agent client wiring

The sidepanel now runs turns through `@orchard/agent-client` (mango's portable
client) instead of the local mock: real SSE transport, sequential executeTool
dispatch after arguments are fully streamed, AbortSignal cancellation, and
opaque `x_gateway_state` replay. The mock stays for unit tests only. Reads still
dispatch with `expectedRevision: null` / `idempotencyKey: null`; writes pin the
latest revision and a fresh key — unchanged from the previous contract notes.
`tests/integration.test.ts` covers the full offline path: real Mango
(mock-scripted provider) → agent-client → HostPolicy → fixture, including
denied-approval and cancellation.


## Update: `sessionEpoch` adopted into the shared contract

Root `contract` was updated at commit `c4de57a` (SHA-256 `1ae668a66fcaac00183e54cbbd1bb67877ff55045e94ebb6eb982c0d1a4d1333`, git blob `480d6a53b27a7f4c9d15c49f694804a296ebb5ea`); `lime/CONTRACT.md` is byte-for-byte identical to it again. This resolves the earlier note about logout detection requiring application cooperation: apps that emit `sessionEpoch` give hosts an explicit session marker to invalidate on, while the contract stays optional for apps without sessions.

Lime's implementation: consent pins `sessionEpoch` from `getContext` at grant time (null when the app binds none); every `binding()` re-check fails closed — revoking the consent and any pairing derived from it — when the epoch changes, appears, or disappears. MCP-paired clients get the same policy object and the same check. `validateArguments` now gates page-declared schemas on the same bounded dialect coconut publishes (see `coconut/CONTRACT-CHANGES.md` §1) before Ajv compiles them, so a hostile `pattern`/`$id` cannot wedge the trusted extension.

## Behavior notes — finding fixes (#18, #19, #24)

- The companion HTTP server no longer applies `http.requestTimeout` (previously
  15 s) to `/mcp` requests. A `host_call_tool` POST legitimately waits on human
  approval up to the per-dispatch deadline (`requestTimeoutMs`, default 65 s),
  and the transport's standalone GET SSE stream stays open for the whole
  pairing. Per-call deadlines still live in `route()` and `headersTimeout`
  still bounds header receive; the wire protocol is unchanged.
- The sidepanel approval card is now a FIFO queue (`ApprovalQueue`) instead of
  a single `resolveApproval` slot. A concurrent approval request waits behind
  the visible card rather than silently auto-denying it; queued entries free
  their slot on answer, caller abort, or their own `expiresAt` deadline, so a
  disconnected or timed-out client can never hold the slot forever. Approvals
  remain bound to client+session+target+tool+canonical args+expectedRevision —
  queuing order is the only change.
- `tests/browser.ts` selects the fixture option by `data-url` instead of
  localized title text, and the fixture server now sends `charset=utf-8` (its
  title em-dash mojibaked on windows-1252-locale Chromium). The mock gateway
  gained a scripted mode so the e2e reaches the real approval card.
- Error-code classification at the policy boundary (#25): `HostPolicy.guard()`
  no longer flattens every non-Result throw to INVALID_ARGUMENT. Result-shaped
  throws pass through, AbortError maps to CANCELLED, closed-target errors map
  to TARGET_CLOSED, and everything else maps to INTERNAL with the underlying
  message (e.g. "Payload exceeds 64 KiB" or a Zod envelope failure). The one
  caller-fault site — parsing the agent's own call envelope — returns
  INVALID_ARGUMENT explicitly, and a page-declared inputSchema outside the
  host-safe dialect now fails as UNSUPPORTED (page fault) instead of blaming
  the caller's arguments. `ChromePageAdapter.dispatch` likewise splits
  closed-target (TARGET_CLOSED), vanished document binding (STALE_CONTEXT)
  and page-side faults (INTERNAL) instead of one STALE_CONTEXT for all.
  Result envelope shape unchanged; error.code/error.message only.
