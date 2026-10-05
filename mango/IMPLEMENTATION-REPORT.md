# Implementation report — Mango / Agent 2

Date: 2026-10-05. Scope: only mango/ in and1truong/orchad (product name Orchard). Main contained README.md and contract, no AGENTS.md. No Lime, Coconut or Guava files modified.

## Implemented

- Runnable Node 24/Fastify inference service, loopback default port 4311, configurable binding/port, health, model listing, documented Chat Completions subset, streaming/nonstreaming, cancellation/timeouts and graceful shutdown.
- Direct REST provider adapters for OpenAI Chat Completions, Anthropic Messages and Gemini GenerateContent. Administrator model registry and capability matrix; unsupported features reject. Default offline mock replays administrator-controlled scripts without any domain operations in core.
- Portable TypeScript runAgentTurn package and mock factory, declarations, local tarball build/install instructions. Browser-standard APIs with no Node/Chrome/Tauri/provider SDK imports. Interpreted JSON Schema validation compatible with MV3 CSP. Complete-turn assembly, argument validation, sequential host callbacks, preserved IDs/assistant/state, deterministic terminal event, cancellation and budgets.
- Distinct principal token provision/revoke with SHA-256 hash storage, allowlists, per-principal rate/concurrency, body/output bounds, atomic quota reservation/reconciliation. SQLite storage interface, usage/status/latency/provider/model/correlation ledger; missing upstream usage remains NULL/unknown/provisional.
- AES-256-GCM continuation protection bound to principal/provider/model/assistant payload, expiry, replay/tamper checks. Gemini signed public parts, signature-only terminal parts and required provider function-call IDs retained. No exposed hidden reasoning; extended thinking not enabled on Anthropic.
- Credential/content redaction, explicit development content-debug warning, exact CORS allowlist, production key/TLS requirements, redirect rejection, default zero retry budget, explicit bounded pre-output retries only, no provider/model fallback.
- API.md, generated api.schema.json, .env.example, Dockerfile, package-lock.json, security notes, contract fixtures, CONTRACT.md and checksum discrepancy record. The local SDK tarball can be reproduced with npm run pack:client; package not published.

## Actually verified

Environment: Node 24.19.0, npm 11.9.0. Exact dependencies in package-lock.json. Commands: npm run check; npm test; npm run build; npm run pack:client; npm run smoke:local. Production dependency npm audit reported zero advisories at execution time; this is a point-in-time dependency check, not a claim of production security certification.

Final automated suite: **44 tests, 41 passed, 3 skipped, 0 failed**. Skipped tests are the three opt-in paid provider smoke tests.

Coverage includes health/auth/revoke/hash storage; principal allowlists/isolation; schema/message validation; feature and output limits; rate/concurrency/quota failures; unknown/provisional usage; atomic reservations and crash recovery; opaque continuation replay/tamper/cross-principal/provider/model/assistant/expiry checks; fragmented SSE/tool arguments; truncated responses and tool calls; sequential tools; error-result roundtrip; maxSteps/maxToolCalls; cancellation before inference, at tool request and during pending callback; HTTP disconnect; provider timeout; graceful shutdown; redacted structured logs; no retry after streaming or observed tool calls; API schema/response consistency.

Portable integration runs through **real loopback HTTP** to the actual gateway with scripted inference: model emits demo_increment, fake host executes it, tool result returns through history, model emits final text. A direct inference-only call leaves the fake counter unchanged, proving this server does not execute app tools. Deduplication, idempotency conflict, stale revision and denied approval are exercised solely in the fake host fixture. They are not production app authorization.

All three adapters have synthetic text, stream, function, error, truncated upstream and abort fixtures. Anthropic tool-result IDs/ordering and thinking-disabled behavior are tested; OpenAI gateway-state stripping is tested; Gemini signatures/original function IDs/metadata-only terminal parts roundtrip. No real prompts, customer data or provider keys occur in fixtures.

Browser portability: esbuild produces a browser bundle, then an actual tool loop runs inside a VM with string code generation disabled; no eval, new Function or Node imports in the bundle. This tests the portable library and CSP constraint, not an installed Chrome extension or desktop shell.

Built binary smoke starts the compiled service as a child process, provisions a random principal, checks health, 401 enforcement and offline inference, then sends SIGTERM and verifies clean exit. The tsx CLI's IPC pipe was restricted in this environment; scripts use node --import tsx instead and run successfully.

## Mock-only / not tested live

- No OpenAI, Anthropic or Gemini paid API calls were made. LIVE_SMOKE opt-in and exact configured model IDs/keys were not supplied. Fixture success is not live access or model-account compatibility evidence.
- No real browser extension, desktop shell, page adapter or external MCP client integrated. Lime/Coconut can consume the package through the documented contract; actual host policy/approval/execution remains their responsibility.
- Dockerfile supplied, but Docker binary unavailable. Container image build, healthcheck and containerized execution are **not tested**. Local compiled service is tested.
- No public endpoint, cloud deployment, extension release or package-registry publication.

## Assumptions and integration limitations

- One deployable service process per SQLite file. Rate/concurrency are in-process. Startup recovery assumes no other live service owns that ledger. Authentication is development token provisioning; SSO, production signup/billing and user-owned provider credential enrollment are future adapters/flows.
- Configured model IDs/capabilities must be validated by an administrator against provider/account access. Example registry IDs are placeholders. No latest model is hardcoded, no silent feature degradation or cross-provider fallback occurs.
- Anthropic extended thinking, OpenAI nonstandard reasoning fields, multimodal/server tools, response-format/temperature and unsupported Chat API options are outside the declared subset. Unexpected reasoning/tool blocks fail closed.
- Host callback cannot be physically aborted by the contract's three-argument executeTool signature. The client cancels waiting/streaming and does not replay; hosts must independently cancel approvals/execution, reconcile any in-flight mutation and handle incomplete cancelled history.
- Quota units are tokens/reservation ceilings, not currency. Unknown usage is conservatively charged; any upstream usage exceeding reservations becomes debt and blocks future requests. The admitted-concurrency overshoot bound and provider-tokenization caveats are documented in SECURITY.md. Production monetary accounting requires provider-specific counters/pricing.
- Complex adversarial schemas/regexes are body-bounded but not isolated in a CPU sandbox. This is a local MVP limitation, not a completed production hardening claim.
- Development state key is ephemeral unless configured; restart invalidates old continuation. Production requires a stable key and CORS allowlist, plus external HTTPS termination.

## Contract snapshot

CONTRACT.md matches main's Git blob 024abfa69475ebd25e8017f16133c7049d2845ae byte for byte. Its actual SHA-256 is 137db8eb8557bdad656a48337c9020227fc7a1ca1d3b537469ca5cfbd90d564d, differing from the prompt-supplied 18ec8f8d1812ab06e77d39536b746d82482285073a79ee9a076149461d65962c. No semantic changes proposed; the discrepancy is recorded in CONTRACT-CHANGES.md.
