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
