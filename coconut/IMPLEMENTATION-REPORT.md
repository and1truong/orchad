# Implementation report — Coconut 0.1

Status: implemented source and verified non-native components. **Not a native-runtime-verified desktop POC.** Native build is blocked; no desktop development binary, screenshot, signed package or notarized package is claimed.

## Implemented

- Tauri 2 Rust host with bundled React UI and a separate guest child WebView, no iframe.
- Native URL allowlist, identity checks, navigation revocation, nonce guarding of queued dispatch, JSON serialization, request correlation and payload size limits. Dispatch only describe/getContext/invoke; guest reply is narrowly scoped.
- Explicit AppManifest command ACL and individual capabilities. Only bundled host can open guest or issue trusted host controls. Guest has only a correlated reply command at the fixture origin; no default process/filesystem/window permissions. Popups denied.
- Sidebar target/model/gateway fields, consent, mock chat/events, cancellation, approval cards, pairing/revoke and bounded audit history. Credential memory only.
- Shared sidebar/MCP execution module: exact request/schema validation, canonical frozen approvals, client scopes/target/expiration, UI lease, context/document checks, cancellation, failure envelopes. Unknown tools rejected. No mutation replay.
- Owned Node sidecar, official MCP SDK 1.32.0, Streamable HTTP /mcp bound to loopback, exact four tools, Host/Origin/bearer/session checks and SDK lifecycle/cancellation.
- Unmodified-contract counter registry fixture, no-bridge fixture, actual SDK test client script, ADR, threat model, contract snapshot and lockfiles.

## Tested in this Linux environment

- Node/npm dependencies installed from pinned package.json, package-lock.json generated.
- npm run build: TypeScript check and Vite production build passed.
- npm run package:sidecar: bundled MCP dependencies successfully.
- npm test: 19 tests passed. Policy cases include discovery/context, approved mutation, denied mutation without dispatch, idempotent retry, semantic conflict, stale revision, reload/navigation/close invalidation, UI inactivity, token visibility/scope/revoke/expiry, forged token, malicious payload, mutable request after approval, unknown tools, malformed results, logout, timeout and cancellation.
- The exact Rust-included injected script executes in a Node VM: shared page bridge works, payload injection stays data, nonce mismatch denies queued action, no registry returns UNSUPPORTED. This does not exercise any embedded engine.
- Real official SDK client and server negotiate MCP 2025-11-25 on HTTP, discover exactly four tools, get context and request/approve mutation. HTTP auth/Origin/revocation checked. Page dispatcher and approval decision are test doubles, not native UX.
- Real bundled Node sidecar process responds through inherited stdin/stdout. Rust parent mocked.
- CONTRACT.md SHA-256 equals 18ec8f8d1812ab06e77d39536b746d82482285073a79ee9a076149461d65962c.
- Rust 1.99.0 installed, cargo dependency resolution and Cargo.lock generated; cargo fmt succeeds. Relevant native APIs checked against downloaded Tauri 2.11.1 source.

## Native build blocker

cargo check --locked exits 101 in GTK/GLib dependency build scripts before application type checking:

The pkg-config command could not be found. Could not run pkg-config --libs --cflags gobject-2.0 'gobject-2.0 >= 2.70'.

Default apt update failed with setgroups/setegid/seteuid permission errors. A root sandbox-user update fetched package indices, but package installation failed opening /var/cache/apt/archives/partial/*.deb with Permission denied. GTK/WebKitGTK development dependencies remain absent. Native Rust application compilation is NOT verified, and API inspection/rustfmt is not compilation. Build log is available locally as native-build.log, excluded from source control.

## Acceptance matrix and remaining limitations

| Area | Evidence | Remaining |
| --- | --- | --- |
| MCP transport, auth, four tools | Real loopback SDK integration | Native guest and trusted UI end-to-end run |
| Page describe/context/invoke | VM bridge and counter policy tests | Linux WebKitGTK execution |
| Approval/deny/retry/stale/cancel | Policy units and SDK mutation test | Actual native click/visibility UX |
| Reload/navigation/close | Binding invalidation units; native source hooks | Actual embedded runtime events |
| Guest crash | Dispatch timeout implementation | Renderer crash hook and native crash test absent |
| Guest privileged command denial | Explicit ACL source + fixture attack button | Must run attack fixture in native engine |
| Gateway credential isolation | Host-only memory design | Runtime adversarial test absent |
| Additional privileged window denial | No guest window permission; popup denial source | Runtime test absent |
| SSO/login | Guest-owned session and navigation revocation source | Real auth flow untested; popups unsupported |
| Packaging | JS sidecar bundle and scripts | Native binary/installer blocked; Node runtime not bundled |
| OS support | Linux non-native tests only | macOS WKWebView and Windows WebView2 unverified |

Only one guest at a fixed layout is implemented. Origin allowlist is fixed to fixture origin in Rust plus capability; no runtime trusted origin editor. Browser Origin requests to MCP are all rejected rather than permitting a browser MCP client. All domain tool invocations, even page-declared reads, require approval/write scope; context/descriptors remain scoped reads. A document change without navigation revokes the old target and needs reload to rediscover. Approval UI uses a four-second heartbeat lease; native invoke dispatch additionally checks host visibility/minimized state. In-flight mutations cannot be rolled back after page dispatch. App authorization/idempotency is represented by a labeled fixture only, not a production atomic backend.

Gateway/agent-client integration remains mock-only. No live provider, paid API, real SSO, native security, Codex CLI/native mutation, macOS or Windows tests executed. No cloud relay, global daemon, auto-update, marketplace, enterprise policy changes, or arbitrary website automation.
