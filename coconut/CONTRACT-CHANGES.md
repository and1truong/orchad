# Contract changes

None. CONTRACT.md is byte-for-byte the provided snapshot (SHA-256 18ec8f8d1812ab06e77d39536b746d82482285073a79ee9a076149461d65962c). The repo-root `contract` file carries the same text re-formatted as plain prose; its bytes differ, but its content is identical.

Coconut policy is intentionally stricter: domain tools declaring read still require write scope and trusted approval. No descriptor alone grants invocation authority. Page-declared inputSchemas are validated against a host-safe keyword subset (no pattern/$ref/combinators/format, no schema-registry keys $id/$schema, no quadratic-cost uniqueItems; depth and size caps) before the sidecar compiles them with Ajv, so a hostile schema cannot wedge, stall, or crash the enforcement process; tools outside the subset fail UNSUPPORTED. This changes no field or method in the snapshot.

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
