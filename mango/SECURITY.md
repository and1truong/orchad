# Security and operational scope

## Trust boundary

Gateway credentials are owned by server configuration. Gateway bearer tokens are owned by trusted host memory and map by token hash to an independently provisioned principal. The request cannot override principal, provider endpoint, key or headers. Model allowlists are loaded from principal policy, not claimed identity. Custom provider endpoints are administrator-only environment settings; production requires HTTPS. Provider fetch refuses redirects to avoid credential forwarding.

Host owns consent, authorization, approval, target pinning, revisions and idempotency. The server has no page/cookie access, execute-tool callback or application tool registry implementation. Agent-client emits tool_requested as an observation, not permission. The demo counter fixture is isolated test code. Consumer chat subscriptions and cookies are not API credentials.

Authentication adapter seam: Storage.authenticate(token) returns Principal policy; replace it with a verified identity adapter (SSO/access-token validation plus policy lookup) at the auth boundary. SQLite hashes/provision/revoke are development controls. No production signup, billing portal or user-provider-credential enrollment flow is included. ProviderAdapter and Storage interfaces isolate inference and accounting for later replacement.

## Bounded requests and quota

- Body limit 512,000 bytes; max 128 messages, 65,536 content/argument characters each, 64 tools, 16 calls per turn; input schema compilation has no network resolver.
- max_completion_tokens 1..8192, further bounded by configured model. Normalized output hard limit 262,144 UTF-8 bytes. Upstream SSE decode bound 2,000,000 bytes. Client SSE decoder also bounds total bytes at 2,000,000. Continuation payload bound 100,000 plaintext bytes; input opaque state at most 196,608 characters.
- Per-principal fixed-window requests/minute and active inference concurrency. A rate allowance is consumed on admission attempts, including requests later rejected by concurrency/quota. Policies default in provisioning to 30 requests/minute and 2 active turns. Models listing is authenticated but does not consume inference quota.
- Lifetime development token quota, not money: each admitted request atomically reserves UTF-8 bytes of content/tools plus per-message/tool framing and max output tokens. No integer token estimate is reported as actual usage. Reservations are accounting ceilings, not usage observations.
- With complete final upstream usage, reconcile actual input/output tokens (including Anthropic cache token categories and Gemini thought token count). With missing usage, charge the reservation conservatively, retain NULL counts and unknown/provisional status. No missing usage is recorded as zero. Charge is not a real invoice.
- Admission never oversubscribes stored reservations; SQLite BEGIN IMMEDIATE serializes quota reservation across connections. If actual usage exceeds the conservative reservation, the principal is charged the excess and further requests are denied. The overshoot is limited to concurrently admitted requests: at most concurrency multiplied by max(0, actual turn usage minus its reservation). For providers honoring configured token ceilings and conservative input framing this is zero; this is not a guaranteed monetary bound or a claim that unknown provider tokenization is exact. Provider output hard byte limit still applies. Production monetary quotas need provider-specific input counters and pricing before billing is introduced.
- Startup recovery, enabled only in main service startup, converts orphaned reservations to unknown/interrupted entries and conservatively charges them. Token CLI opens without recovery so issuing/revoking tokens cannot clear active reservations. Run one service process per SQLite file; multiple concurrent service startups would mistake live reservations for abandoned ones. Multi-instance inference rate/concurrency is outside this single-service scope.

## Retry, cancellation and cleanup

Default retry budget is zero. createGateway may receive an explicit retryBudget for an administrator policy. Retryable upstream HTTP errors are 429/502/503/504 only, with exponential delay/jitter; no connection-error replay by default. Retry is prohibited after any stream output, any observed tool delta or any normalized output, including nonstreaming accumulation. There is no provider/model fallback implementation and no automatic tool replay. Configuring hidden SDK retries is avoided by using direct REST adapters.

Each request gets one upstream AbortSignal, default 30-second timeout, disconnect propagation and preClose abort on graceful shutdown. Finally reconciles usage and releases active admission. Client stream readers are cancelled and released. Host callback cancellation is independently owned by the host; client cannot reverse a mutation already dispatched and must not retry it.

## Continuation privacy

AES-256-GCM with random 96-bit nonce authenticates continuation payloads, principal, provider, model, assistant content and tool-call IDs/arguments. Stable 32-byte key is required in production. Development random key invalidates state on restart, which fails closed. TTL is 24 hours; no cross-model/provider migration. Encryption is not a substitute for host consent: provider already received the selected context.

Gemini's original signed public response parts remain inside encrypted state. Exposed thought text is rejected; includeThoughts is false. Anthropic extended thinking and built-ins are not requested; unexpected thinking blocks reject. OpenAI nonstandard reasoning fields are not exposed. Enabling unsupported reasoning/model features is not a compatible configuration.

## Logs, CORS and deployment

Default structured logs include request ID, principal, provider, configured model, latency and status only. Prompt/tool results are never persisted by the ledger. Headers, authorization, cookies and raw exception details are redacted/suppressed. Explicit DEBUG_CONTENT=true in local development enables content logs with a warning; forbidden in production. Logs still require access controls because model IDs and principal IDs can be sensitive.

CORS uses exact configured origin matches, no wildcard and no credential cookie forwarding. CLI requests without Origin still require bearer authentication. Production startup requires a nonempty CORS allowlist and persistent state key. CORS is not authentication; do not expose tokens to untrusted page scripts.

Keep development loopback binding. Container defaults to 0.0.0.0 internally and must be published on loopback for local use. Production must sit behind a trusted HTTPS reverse proxy with TLS termination, request/connection limits, and appropriate certificate management; public networking and TLS automation are not implemented. Restrict health availability and logs as appropriate to deployment. Secret configuration must remain outside the image/source. No public deployment was made.

Schema complexity/resource exhaustion is a remaining local-MVP risk: body/output bounds exist, but adversarial deeply nested schemas/regexes do not execute in an isolated worker. Production should add schema complexity budgets and an execution time sandbox. This is documented rather than treating the fixture authorization or interpreter as a production policy engine.
