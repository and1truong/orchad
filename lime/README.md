# Orchard Lime — browser host POC

Chrome MV3 / React / TypeScript sidebar and a Node local MCP companion. Domain-neutral host; demo-counter is explicitly a test double. No provider integration, production inference loop, DOM scraping, or native WebMCP assumption.

## Run locally

Use Node 22 or newer. From `orchad/lime`:

1. Run `npm ci`, then `npm run build`.
2. Open Chrome's `chrome://extensions`, enable Developer Mode, Load unpacked, select `lime/dist/extension`.
3. Run `npm run fixtures`, open `http://127.0.0.1:4313`.
4. Click the Lime toolbar action to open the native Side Panel and grant activeTab access. Select the fixture tab, Pin target. The Pin action can request that single origin. No origins are granted on install.
5. Review gateway endpoint/model, check any read tool names you consent to, then click Consent. The current development agent is a mock: it sends no inference requests. Enter `/tool demo_increment {"amount":1}`, Send, then Approve or Deny. Observe the counter.
6. Optional mock gateway boundary: `npm run gateway:mock`. Enter `http://127.0.0.1:4311` and token `lime-fixture-token`; Load models requests that exact gateway origin. The mock chat endpoint deliberately terminates mid-arguments for transport testing.

There is no GUI browser in the implementation environment. Build and SDK integration have run; native Chrome acceptance and screenshots remain unverified. See IMPLEMENTATION-REPORT.md.

## Companion and external Codex CLI

Find the unpacked extension ID in Chrome. In another terminal set `LIME_EXTENSION_ORIGINS=chrome-extension://YOUR_EXTENSION_ID` and run `npm run companion`. Use comma-separated origins only for extensions you explicitly trust. Default bind is 127.0.0.1:4312; `LIME_COMPANION_PORT` changes it.

Type `pair` in the companion terminal. This deliberately user-initiated action generates a cryptographically random code, valid for one use and 60 seconds. Paste it into the sidebar, Pair external client, then Confirm pairing (30-second confirmation deadline). Pin and consent before pairing. Only that exact target/page instance and checked reads are in scope.

The sidebar's MCP credential disclosure contains the external-client bearer token. Copy it into the local CLI environment as `LIME_MCP_TOKEN`, without putting it into a URL, repository, or shell history. The bridge token is different and remains in host memory.

Current official Codex instructions support Streamable HTTP URL and an environment-variable bearer token. The user can run `codex mcp add lime --url http://127.0.0.1:4312/mcp --bearer-token-env-var LIME_MCP_TOKEN`. Alternatively set the `mcp_servers.lime` table in config.toml with `url = "http://127.0.0.1:4312/mcp"` and `bearer_token_env_var = "LIME_MCP_TOKEN"`. Set `tool_timeout_sec = 90` if allowing the full 60-second host approval deadline. We do not execute these commands or modify user configuration.

Ask local Codex to list targets, get context/list tools with returned targetId/pageInstanceId, then call demo_increment. Every mutation waits for this sidebar, irrespective of the external agent's own approval. An `approved` flag fails schema validation. Closing the sidebar disconnects the outbound bridge and denies execution. Cloud/remote Codex cannot access the user's loopback server and is out of scope.

Revoke via sidebar Revoke pairing or companion `revoke CLIENT_ID`. Reconnect uses the memory-only bridge credential and never replays a pending request. Restarting the sidebar/companion discards credentials and requires new pairing. Target/model/consent changes require a fresh pairing; stale credentials cannot broaden scope.

## Tests and evidence

- `npm test`: Node unit tests plus actual SDK Client ↔ Streamable HTTP server ↔ authenticated WebSocket ↔ in-memory fixture using the same HostPolicy as the sidebar. This is real transport integration with a mock page boundary, not live Chrome integration.
- `npm run build`: strict TypeScript check; extension UI/CSS/worker bundle, MV3 manifest, Node companion bundle.
- For real browser checks, install `npx playwright install chromium`, then `npm run test:browser`. The harness uses a temporary extension copy pre-granted **only** the fixture origin, launches a real unpacked extension, and routes actual SDK calls through companion → extension → MAIN-world fixture. Screenshots are written to artifacts only after actual execution. This runs the trusted extension UI in an extension tab; the native Side Panel container still needs the manual checks below. `LIME_HEADFUL=1` enables a visible browser.
- Recorded actual test output: artifacts/test-report.txt. Browser attempt: artifacts/browser-attempt.txt. No screenshot is fabricated or represented as live proof.

## Module boundaries

- src/shared/contract.ts: frozen wire shapes, JSON/schema/size validation.
- src/host/policy.ts: shared consent, target/session binding, approval, cancellation, dispatch; both execution paths.
- src/extension/page-adapter.ts: fixed Chrome MAIN dispatcher and runtime document binding. No content script reads page globals. Chrome returns frameId/documentId; dispatch is restricted to top frame and the pinned runtime document.
- src/extension/sidepanel.tsx: trusted UI/controller. Tokens, consent and pending approvals live only here.
- src/extension/worker.ts: toolbar Side Panel behavior and a sender-validated health message only. No run state, secret or queued write.
- src/extension/companion-transport.ts: outbound, authenticated loopback WebSocket.
- src/companion: SDK Streamable HTTP /mcp, /bridge, pairing, frozen client scope and revocation.
- src/agent-client/mock.ts: runAgentTurn development double with the Agent 2 interface. Replace its import with the independently versioned Agent 2 artifact; do not share a mutable sibling source tree.
- fixtures: standalone interoperability page, no-bridge page, mock gateway and in-memory counter.

## Security and permissions

Only activeTab, scripting and sidePanel are mandatory. Optional HTTP/HTTPS match patterns let the user explicitly grant one selected app or gateway origin; they are not all-sites grants. No cookies/password/history/storage permission. No synced storage, persistent gateway secret, arbitrary eval, injected credentials or cross-origin frame enumeration.

There is no page-to-extension postMessage bridge to spoof. The privileged host dispatches only a fixed function via Chrome's supported MAIN execution world. Main-world input/output shape checks and trusted Zod/Ajv checks are independent. Injected code sees only method names and domain invoke arguments. The worker rejects Chrome messages without the extension's own sender ID and exact sidepanel URL, or with a tab/content-script sender.

Page tool effect/description is untrusted. A read runs automatically only when its exact name was checked by the user; mutation always prompts. Host binding includes runtime document, target/page instance, origin, app/document and consent session. Server authorization remains the application's job. Explicit object IDs in arguments are captured in the approval; selection isn't re-resolved.

Limits: JSON boundary/HTTP/WebSocket 64 KiB, at most 64 tools, 64 pending companion calls, 64 MCP sessions, 16 sockets, 1,024 correlations per policy session; 5-second unauthenticated socket deadline, 30-second pair confirmation, 60-second code/approval expiry, 65-second companion call timeout, 15-second page-boundary deadline. Scope is fixed at pairing. Host/Origin allowlists have no wildcard CORS; CLI requests without Origin still require authentication on every request. Credentials are not query parameters or logs.

No transport exactly-once guarantee: uncertain dispatch returns an error and is never auto-replayed. The app must implement atomic server authorization/revision/idempotency, checking completed keys before revision for valid retries. The in-memory fixture demonstrates semantics only.

## Manual Chrome checks still required

Native toolbar → Side Panel launch; activeTab and optional origin prompts; visual layout in the actual panel; sidebar close while awaiting approval; service-worker suspension and resume; tab switch remains pinned; reload/same-document navigation/document replacement; tab close; backend logout; revocation; no-bridge origin; absence of cookies/tokens from injected payload/network model context. Record browser version and capture screenshots before claiming these pass.

## Official references checked

- Chrome Side Panel: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Chrome scripting MAIN/documentIds: https://developer.chrome.com/docs/extensions/reference/api/scripting
- Official MCP TypeScript SDK v1: https://ts.sdk.modelcontextprotocol.io/server and https://ts.sdk.modelcontextprotocol.io/client
- Codex MCP: https://developers.openai.com/codex/mcp (currently redirects to ChatGPT Learn; bearer_token_env_var documented there).

Dependencies pinned in package.json/package-lock.json. MCP SDK 1.32.0, negotiated supported protocol 2025-11-25. Contract source is the user's root contract file; exact copy and hash discrepancy recorded in CONTRACT-CHANGES.md.
