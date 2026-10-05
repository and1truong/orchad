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
