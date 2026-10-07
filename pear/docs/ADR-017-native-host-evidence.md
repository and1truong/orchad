# ADR-017: Actual Coconut native WebView and MCP evidence for Pear

Verification lane; no production trust expansion.

The native lane starts a fresh synthetic Pear database and built human app on the existing trusted loopback origin (4310). It boots the real debug Tauri binary and bundled Coconut sidecar under Xvfb, opens the real Pear guest WebView, discovers its live window bridge and pairs an external MCP SDK client through Coconut's actual transport. The host's existing origin allowlist and production authority predicates remain unchanged.

A CI-only fixture bootstrap signs in through the real synthetic HTTP login and sets its real cookie before loading the built app. Bootstrap/state inspection require a random per-run nonce, bind only loopback, use original synthetic learners, and exist only in the fixture script; Pear's normal dev/start routes do not mount them. No production login, IdP, consent or account is bypassed or claimed as verified.

Checks cover actual Pear identity/catalog, bounded authorized MCP search/progress, explicit read-tool grants, a denied enrollment with zero ledger rows, separately approved enrollment reaching the real transaction, human-confirmation absence, hidden-host write denial, account-switch rebind/revocation and no fabricated score/completion/certificate. Test decisions use the existing debug smoke surface, calling the same native privilege predicates. No arbitrary guest evaluation or broader origin permissions are added. Pairing tokens stay in process memory and are not logged.

The counter lane remains an independent regression gate. All failures in the Pear lane fail CI; there is no optional skip or successful fallback to a headless fixture. Exact-head results are required before claiming runtime PASS. This tests the existing host MCP facade; the page bridge is still not itself an MCP server. Real enterprise authentication, partner/channel installs and production origins remain separate dependencies.
