# Contract changes

Adopted into the shared contract (root `contract` updated at commit `c4de57a`, SHA-256 `1ae668a66fcaac00183e54cbbd1bb67877ff55045e94ebb6eb982c0d1a4d1333`, git blob `480d6a53b27a7f4c9d15c49f694804a296ebb5ea`; `coconut/CONTRACT.md` is byte-for-byte identical). Previously coconut's copy was a drifted older snapshot (`18ec8f8d…`); it now matches every other POC byte-identically.

## 1. Host-safe JSON Schema dialect (adopted)

The contract now states that a `ToolDescriptor.inputSchema` must sit inside one bounded JSON Schema dialect that the host publishes in its contract documentation; descriptors outside it are rejected safely, never silently compiled or granted.

Coconut's published dialect (`host/validation.mjs` `safeSchema`, mirrored by lime's `hostSafeSchema`):

- Allowed keywords: `type`, `properties`, `required`, `additionalProperties`, `items`, `prefixItems`, `enum`, `const`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `minItems`, `maxItems`, `minProperties`, `maxProperties`, `description`, `title`, `default`, `examples`, `deprecated`, `readOnly`, `writeOnly`, `$comment`, `pattern`, `uniqueItems`, `oneOf`, `anyOf`, `allOf`, `not`.
- Excluded: `$id`, `$schema`, `$ref`, `$defs` (Ajv registers `$id` process-wide and `$schema` can select an unsupported draft), `format` (annotation-only, would diverge across hosts), `patternProperties`, `propertyNames`, `dependentSchemas`, `dependentRequired`, `contains`, `if`/`then`/`else`, `unevaluated*`.
- Bounds: schema ≤ 8 KB serialized, depth ≤ 6, ≤ 128 subschema nodes, `properties` ≤ 64 keys, `prefixItems` ≤ 16, `enum`/`required` ≤ 256 entries, `oneOf`/`anyOf`/`allOf` fan-out 1–16.
- `pattern`: string ≤ 256 chars, must parse, no backreferences (`\1`–`\9`, `\k<`), no quantified group containing an unbounded repeat (`(a+)+`, `(a*)*`, `(\d{2,})+`). Bounded `{n}`/`{n,m}` repeats are fine.
- `uniqueItems: true` only where `maxItems` is an integer ≤ 256 (pairwise comparison is O(n²)).

This is a superset that accepts every descriptor in the real Guava catalog while keeping compilation and evaluation resource-bounded; hostile schemas fail `UNSUPPORTED`/`INVALID_ARGUMENT` instead of wedging the sidecar.

## 2. `sessionEpoch` — opaque app-session binding (adopted)

`getContext` results may carry an optional `sessionEpoch` string: an opaque marker the app's backend issues for the current login session. It carries no credential, token, or raw session identifier and never replaces server-side authorization; apps with no session simply omit it.

Hosts pin `sessionEpoch` into the target binding at promotion, and re-verify it on every `getContext` reveal and before every tool dispatch. If the epoch changes (login, logout, account switch, rotation) or disappears, all authority derived from the old binding — consent, MCP pairings, pending approvals, cached tools — fails closed with `STALE_CONTEXT` before any context is returned or tool dispatched. Fresh consent on the new session restores operation. No mutation is replayed across a session change.

## 3. Pairing binds full target/document/session identity

`pair()` now snapshots `canonical(target)` — `targetId` + `pageInstanceId` + `origin` + `appId` + `documentId` + `sessionEpoch` — per granted target, not just a `targetId` list. A native rebind (SPA document switch) or session change therefore revokes the grant rather than extending it to the new identity.

## 4. pageInstanceId rotates on document or session change

A `getContext` reply announcing a different `documentId` or a different `sessionEpoch` for the same app triggers rebind-with-rotation: new `pageInstanceId`, pinned `documentId`/`sessionEpoch`, installed before the reply is forwarded. The stale binding's in-flight reply, pending approvals, cached tools and pairings die with it; the new document's context is never delivered under the old binding.

## 5. Read envelopes and explicit read scope

`host_call_tool` enforces the declared `effect`: a `read` tool requires `expectedRevision === null` and `idempotencyKey === null` and runs under the `read` scope with no approval (it still re-verifies binding + session before dispatch); a `write`/`destructive` tool requires an integer `expectedRevision` ≥ 0, a non-empty `idempotencyKey`, `write` scope and trusted-UI approval. A descriptor that flips `read`→`write` produces a null-envelope write call the app backend itself rejects.

## 6. Trusted rediscovery (`discover_guest`)

A new trusted-only command re-runs bridge discovery for the current guest without a page load — needed after SPA login or a bridge that installed late. It is reachable only from the bundled host UI (`allow-discover-guest`), refuses when the guest URL is off the allowlist or a live bound target exists, and probes with a bare `getContext`, so nothing pending can replay. Rediscovery installs a fresh provisional binding; promotion then requires the normal consent/pairing path on the new identity.

## Agent client wiring

The trusted sidebar runs turns through `@orchard/agent-client` instead of its
inline mock loop. `executeTool` now distinguishes effects: read tools dispatch
with `expectedRevision: null` / `idempotencyKey: null` (the sidecar already
rejects read calls carrying write envelopes, which the old client violated);
writes pin `lastRevision` plus a fresh UUID. Cancellation and approval-denied
flow through the shared client unchanged.

## Trusted app origin

One file, `coconut/trusted-origin.txt`, is the trusted app origin for every
consumer: `build.rs` bakes it into `TRUSTED_APP_ORIGIN` for the native
`allowed()` check, `scripts/gen-capabilities.mjs` regenerates
`capabilities/guest-replies.json` (run by `prebuild`), and the sidebar's launch
default imports it via vite `?raw`. Exact-origin comparisons only — no
wildcards. The checked-in value tracks Guava's default
(`http://127.0.0.1:4310`); `tests/origin.test.mjs` fails if it drifts from
Guava's `PORT` default or the generated capability.
