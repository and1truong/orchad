# Lime implementation report

Implementation date: 2026-10-05. Scope: `lime/` in and1truong/orchad. No Mango, Coconut or Guava implementation files changed. Root contract remains unchanged.

## Implemented

- React trusted sidebar: target picker/pinning, origin/document/instance, configurable gateway and authenticated model listing, model picker, explicit context/read consent, transcript, tool activity, mutation approval with client/app/origin/document/tool/explicit objects/canonical arguments/revision, Stop, Disconnect, pairing confirmation, reconnect and revoke.
- State transitions for connecting, connected, waiting for approval, cancelled, target changed, error; bridge status independent from target connection.
- Chrome MV3 unpacked build with Side Panel API, activeTab/user-origin grants, fixed MAIN-world dispatcher restricted to describe/getContext/invoke. No content-script global reads, generic eval, DOM fallback or iframe enumeration. Runtime documentId/frameId/origin rechecked.
- One shared HostPolicy for sidebar and external MCP: scoped consent, argument schema, target/session binding before and after approval, absent/denied approver fails closed, expiry and cancellation, serialized calls, correlation conflict checks, bounded JSON and unknown-outcome failure. No transport write replay.
- Official MCP SDK Streamable HTTP server at loopback /mcp; exactly four contract tools; structuredContent and matching text result, isError on failure, SDK lifecycle and cancellation.
- Outbound WebSocket /bridge with explicit extension Origin allowlist, Host validation, separate random MCP/bridge credentials, random one-time 60-second code initiated by operator, sidebar confirmation, unauthenticated deadline, per-client frozen target scope, revocation, resource/payload limits.
- Gateway-client interface plus deterministic runAgentTurn development mock; no production model loop/provider SDK. Message IDs and continuation fields retained in history. Context is appended as explicitly untrusted data only after consent; history discarded when target/model/consent changes.
- Counter, no-bridge and mock HTTP gateway fixtures, contract JSON samples, locked dependencies, development build scripts and runnable browser harness.

## Actually executed and passed

Node.js v24.19.0, npm 11.9.0, Linux. Pinned TypeScript 5.9.3/esbuild 0.27.2 build and SDK 1.32.0 integration. SDK protocol default supported by client/server is 2025-11-25 (the Page Bridge remains version 0.1).

`npm run build`: PASS, strict type check plus UI/CSS, worker/manifest and companion bundles. `npm test`: **31 tests, 31 passed, 0 failed, 0 skipped**. Raw outputs: artifacts/build-report.txt and artifacts/test-report.txt.

The MCP tests use the **actual official Client and StreamableHTTPClientTransport over real loopback HTTP**, actual authenticated WebSocket, and shared HostPolicy against the in-memory counter page adapter. They verify initialization, tools/list, tools/call, matching structured/text envelopes, scope, approvals, cancellation, credentials, revocation and disconnect/reconnect. This is real SDK/transport integration, **not** live Chrome page integration.

The gateway boundary test uses real mock HTTP /v1/models and an interrupted SSE HTTP response; incomplete arguments cause zero dispatch. No paid/provider API called.

## Acceptance evidence by boundary

| Required case                  | Evidence executed                                                                        | Native Chrome status           |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------ |
| Discover fixture, read context | Counter policy and mocked Chrome MAIN adapter; actual MCP SDK context/describe           | Not run                        |
| Approved write                 | Mock-agent → HostPolicy → counter; SDK → companion → WebSocket → same policy/counter     | Not run                        |
| Denied write                   | Both paths prove invoke/value unchanged                                                  | Not run                        |
| Stale revision                 | SDK and policy fixture checks                                                            | Not run                        |
| Duplicate/idempotency conflict | Completed-key lookup before revision, altered key payload conflict, correlation conflict | Not run                        |
| Navigation between read/write  | Fixture changes pageInstanceId during approval; no invoke                                | Not run                        |
| Tab close                      | TARGET_CLOSED adapter fixture, no dispatch                                               | Not run                        |
| Revoked pairing                | Real MCP bearer becomes unauthorized, active session closed                              | No native UI check             |
| Forged Origin/Host             | Real HTTP and WebSocket requests rejected                                                | No native browser-origin check |
| Malformed schema               | Smuggled approved flag, tool arguments, MAIN input/output shape                          | Not run                        |
| Oversized output/input         | Host/MAIN output limits, actual HTTP 413                                                 | Not run                        |
| Gateway interrupted arguments  | Real incomplete SSE mock plus stream collector; zero dispatch                            | Agent 2 integration not run    |
| Extension reconnect            | Actual socket disconnect returns unknown outcome, token reauth, zero replay              | No actual extension suspension |
| Page without bridge            | MAIN runtime double returns unsupported; no DOM fallback                                 | Not run                        |
| Cancellation                   | Actual SDK cancellation reaches bridge; policy approval and in-flight dispatch tests     | Not run                        |

## Browser attempt and missing required evidence

`npm run test:browser` was **attempted and failed before browser launch**: Chromium executable not present. `npx playwright install chromium` download was blocked by environment network policy at cdn.playwright.dev. Recorded failure: artifacts/browser-attempt.txt. There are **no live browser passes and no real screenshots/recording in this handoff**. This evidence requirement is outstanding; the POC is buildable and transport-tested, but full Chrome acceptance is incomplete.

The browser harness is provided, not marked passed. Once Chromium is available it loads the actual unpacked extension, uses actual MAIN-world fixture calls and official MCP SDK routing, and captures screenshots only after execution. It opens the trusted extension UI in an extension tab and pre-grants only the fixture origin in a temporary manifest; native Side Panel launch/permission prompts still need manual Chrome verification even after harness success.

## Mock-only and integration limitations

- runAgentTurn is the explicitly permitted development double, not Agent 2's production artifact. Chat does not perform inference; selecting a returned model is configuration-only until artifact replacement. No live provider tests.
- Counter authorization/idempotency is an in-memory test double. Production app must enforce authenticated-principal scoping and atomic validation/revision/idempotency transaction itself. Fixture state resets on reload.
- Chrome execution, Side Panel lifecycle, activeTab permission UX and service-worker suspension have not been verified against a real Chrome runtime here.
- All runs/secrets live in the trusted sidebar. Worker suspension loses no queued writes because the worker owns none. Closing/reloading the sidebar discards consent and bridge credentials; users re-pin/re-consent/re-pair. A socket reconnect while sidebar remains open is manual and keeps only existing frozen scope.
- No remote relay, native WebMCP, persisted credentials, provider adapters, enterprise policy bypass, extension distribution or public deployment.
- Browser gives no independent server-logout signal in this contract. App authorization failures remain necessary; navigation/document changes invalidate host consent.
- Gateway stream probe verifies the local mock boundary only; Agent 2's full streaming/opaque-continuation semantics remain that artifact's responsibility.
- Target/context and tool descriptions are bounded untrusted data. Effect declarations grant nothing by themselves; checked read names are a deliberate user decision. Backend authorization is not inferable from those declarations.

## Contract provenance

CONTRACT.md exactly matches root `contract` at main commit b51ce3049dd9619c622032de1d1932017a15098e: Git blob 024abfa69475ebd25e8017f16133c7049d2845ae. Actual SHA-256 137db8eb8557bdad656a48337c9020227fc7a1ca1d3b537469ca5cfbd90d564d differs from the prompt checksum. No text/interface changes made to force a hash. See CONTRACT-CHANGES.md.

## Remaining manual checks

Load unpacked Chrome and test toolbar → native Side Panel, activeTab/per-origin permission prompts, approval cards/layout, Stop/Disconnect, sidebar close during approval, tab switch, reload and same-document navigation/document replacement, tab close, backend logout, revoke, worker suspension, bridge reconnect and no-bridge page. Verify no secret in page payload/model context and capture actual screenshots/browser version.
