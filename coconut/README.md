# Coconut — Orchard desktop host

Development POC source. React trusted sidebar, dedicated Tauri 2 guest WebView, native dispatch, and an independent MCP sidecar. No iframe or native WebMCP dependency. **Native Linux compilation/runtime is blocked in this environment; read IMPLEMENTATION-REPORT.md before treating this as a working desktop binary.**

## Local development

Use Node 22 or later, Rust stable, and Tauri 2 prerequisites for your OS. On Linux install pkg-config, GTK 3, WebKitGTK 4.1 development packages and a graphical session. macOS uses WKWebView; Windows uses WebView2; Linux uses WebKitGTK. macOS and Windows have not been tested.

From coconut: run npm ci, npm test, npm run build, and npm run package:sidecar. Start npm run fixture in a second terminal, then npm run tauri -- dev. Open http://127.0.0.1:4314/ from the trusted host. The existing page registry is used unchanged. The mock agent requests one fixture increment. Approve or deny in the sidebar.

The initial allowlist is deliberately fixed to http://127.0.0.1:4314 in native code and the guest-replies capability. Change BOTH when adding an application origin; this POC has no runtime origin editor. Navigation to other origins is permitted for same-WebView login redirects but immediately revokes the bridge. Popups are denied. Real SSO and app login have not been tested. Guest cookies belong to its own embedded session; Chrome cookies are never read.

Native app owns the sidecar child and kills it when the host is destroyed. MCP is enabled without a gateway. COCONUT_MCP_PORT configures the loopback listener, default 4313. Port conflicts fail startup. The development/runtime package currently requires Node on PATH; an embedded Node executable is not included.

## MCP pairing and CLI

Open the trusted sidebar, select a target, click Pair. Copy the one-hour ephemeral token to the client environment. Pairing grants read/write scopes for that exact target; reload creates a new target and requires pairing again. Tokens are stored hashed in sidecar memory, never in a URL or plaintext config. Revoke in the trusted UI. Closing the shell loses all credentials.

Run the supplied scripts/mcp-client.mjs with COCONUT_TOKEN in the environment. It discovers a target, gets context, lists app tools and requests a mutation. Click approval in the native sidebar. This native demonstration remains unexecuted here; the automated MCP test uses the real SDK and HTTP with a mocked page.

Current Codex documentation: https://developers.openai.com/codex/mcp . Configure a Streamable HTTP server entry named coconut in your own Codex configuration. Set url to http://127.0.0.1:4313/mcp and bearer_token_env_var to COCONUT_TOKEN. No user configuration is modified by this project. Use a local Codex CLI: cloud sessions cannot reach this loopback endpoint. A remote relay is out of scope.

Only four tools exist: host_list_targets, host_get_context, host_list_tools, host_call_tool. All return the shared envelope in structuredContent and JSON text. SDK handles initialization, sessions, listing, invocation, and cancellation. Browser Origin requests are rejected; CLI requests without Origin still require authentication. No CORS wildcard.

## Build and packaging

Run npm run tauri -- build after installing native prerequisites. The configured Linux development package target is deb; signing/notarization is not configured. Tauri includes the bundled MCP JavaScript resource. Node must be supplied by the development environment. Packaging enterprise approval, endpoint policy review, certificates, and platform-specific validation are still required. This is not a means of bypassing Chrome management or EDR.

## Integration seam

src/agent-client.ts exports a mock runAgentTurn with Gateway 0.1 input/events. Replace that import with Mango's artifact to integrate inference. Do not add provider adapters to Coconut. The mock never calls a paid API and does not implement a production reasoning loop. Gateway token stays only in React memory. The consent UI names gateway/model/target before constructing context messages. Changing target/model resets consent. Current CSP permits only the development loopback gateway.

host/policy.mjs is shared by sidebar and MCP. All domain invokes require approval, including page-declared reads, because an untrusted page effect does not establish permission. Context and descriptors can be read within a paired target's scope. Approval pins client, target instance, tool, canonical arguments, revision, and expiration. Native verifies current guest identity/origin and dispatch nonce. No automatic mutation replay.

## Test coverage

npm test runs policy units, the exact injected script in a Node VM, a real SDK client/server HTTP test, and a real bundled-sidecar child/stdio test. These are not native WebView integration tests. The fixture is an in-memory test double, not production backend authorization or durable transactions. See report for acceptance gaps.
