# Integration checklist

Status at delivery: external browser extension and desktop host **NOT RUN**. No artifacts or paired MCP endpoints were configured. The scripted simulator is not a live integration pass. Native WebMCP **NOT RUN**; registration adapter is mock-only.

## Common host setup

1. Start Guava at http://127.0.0.1:4310 using its normal production build or development bundle; do not modify this app for a host.
2. Open the same app URL in Lime browser extension or Coconut embedded webview and log in as investigator.
3. Select Consumer lag rising. Discover appId orchard-guava, documentId rca-consumer-lag and the seven domain tools.
4. Grant consent in the trusted host, paired to this target/session. External MCP client uses its own host auth token; it must never receive the Guava session cookie or CSRF token.
5. Run the configured integration client below; trusted host handles its own approval UI.

## Optional automated MCP client

| Environment | Meaning |
| --- | --- |
| ORCHARD_BROWSER_MCP_URL | Lime loopback Streamable HTTP /mcp URL |
| ORCHARD_BROWSER_MCP_TOKEN | Paired Lime credential, sent only as Authorization header |
| ORCHARD_DESKTOP_MCP_URL | Coconut loopback Streamable HTTP /mcp URL |
| ORCHARD_DESKTOP_MCP_TOKEN | Paired Coconut credential, sent only as Authorization header |
| ORCHARD_DOCUMENT_ID | Explicit document to inspect; defaults rca-consumer-lag |
| ORCHARD_RUN_WRITES | Set true to invoke a real mutation and manually approve in host |

Run `npm run test:integration`. With URL+token it tests initialization, the four host tools, authorized target listing, pinned context/describe, and bounded graph read. With writes opted in, it tests one graph mutation, replay and stale revision. The human must approve exact payloads in the host; there is no headless approval bypass. Tokens are not logged or embedded in URLs. Missing configuration prints NOT RUN. SDK @modelcontextprotocol/sdk 1.32.0 is pinned; SDK handles protocol negotiation and Streamable HTTP. No real MCP protocol version is claimed tested without a live endpoint.

## Manual acceptance matrix — run for each host

- Approve a single batch creating three hypotheses with stable fixture references and explicit links to consumer-lag. Verify immediate UI update, one revision and authenticated audit principal.
- Repeat the same semantic invocation/idempotency key with a new requestId. Verify original response and no duplicate nodes.
- Reuse key with changed valid payload. Verify IDEMPOTENCY_CONFLICT.
- Use another key with old revision. Verify STALE_CONTEXT.
- Deny approval. Verify host returns APPROVAL_DENIED without app invocation, graph change or domain audit.
- Switch selection after reading context. Explicit IDs must still target the original approved node.
- Close/reload target, change document, sign out, or revoke consent while approval is pending. Verify no dispatch against an obsolete target/session.
- Sign in as reader and attempt writes through manually modified bridge/UI. Server must still return FORBIDDEN.
- Open brainstorming map, rediscover target and apply the same generic graph tools. No app/host source changes.
- For desktop: separately record WKWebView, WebView2 or WebKitGTK engine/version; verify baseline bridge without native WebMCP assumptions.
- Model sidebar path: record provider/model consent in trusted host; do not treat scripted harness text as reasoning. External MCP path requires no Guava model gateway or API key.

Record host commit, runtime, OS, negotiated MCP protocol, test time and pass/fail for each scenario when dependencies arrive. Do not convert NOT RUN into PASS based on mocks.
