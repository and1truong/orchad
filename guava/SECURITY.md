# Security boundary

Guava owns application permissions and durable graph integrity. The external host owns target binding, consent and approvals. Domain tool descriptions, evidence content and graph text are untrusted data. No application tool can grant role, supply authenticated identity, accept host approval, or execute code/SQL/network requests.

## Authentication seam

Development login verifies a password using scrypt with per-account random salts. Accounts and ACLs are server-side SQLite records. Backend role is loaded by joining the authenticated session to its account on each request; localStorage, URL query parameters and caller-supplied principal fields are ignored or rejected. Replace `/api/login` and the session principal resolution with a production identity provider later; no enterprise SSO is claimed.

Session tokens are random 256-bit values, stored hashed in SQLite, sent as HttpOnly SameSite=Strict cookies, and expire after eight hours. Login rotates the previous cookie session; logout deletes it. The session endpoint includes a non-credential derived sessionInstanceId so the simulator detects re-login by the same principal; the bridge never exports it. HTTPS deployments require COOKIE_SECURE=true and use a __Host cookie. Development auth uses publicly documented fixture passwords and must not be exposed as a production identity system. Login throttling, account provisioning and enterprise audit retention are outside this POC.

State-changing requests require the configured exact Origin plus a session-bound CSRF token. Login checks Origin before session creation. No wildcard CORS exists. CSRF token stays in application controller memory; bridge context/results do not export cookie or CSRF values. Same-origin scripts necessarily share the app privilege boundary; there is no claim that app JS can be isolated from malicious same-origin JS. React escapes graph text. Production CSP restricts scripts and connections to self, disallows foreign framing, and permits inline styles for XYFlow. Vite dev middleware is development-only and is not the production CSP boundary.

## Integrity

Every tool validates the strict invocation envelope and JSON Schema inputs without coercion or additional fields. Requests are capped at 256 KiB, patches at 100 operations, graphs at 500 nodes/1000 edges, content at bounded string lengths, references at bounded ID arrays, and reads at bounded pages/depth. Every document read/write uses an ACL; evidence references must belong to that authorized document.

All domain calls use a SQLite BEGIN IMMEDIATE transaction. Permission/schema checks precede deduplication. The idempotency primary key is principal, document, key; semantic canonical JSON includes toolName, arguments and expectedRevision, excludes requestId, and normalizes object key order. Completed replay lookup precedes revision comparison. Different semantic payloads using the key conflict. Invalid/stale attempts do not consume the key or mutate the graph. Permission revocation also blocks stored replay. A two-connection concurrent test verifies one mutation for the same key.

History snapshots, graph writes, new revision, stored response and success audit are committed together. Validation failures rollback and then append a failure audit. Audit principal comes from the server session. Correlation requestId comes from the caller; it is never identity. Audit summaries contain operation kinds rather than full potentially sensitive payloads. Replays add an audit with REPLAY and current before/after revisions while returning the originally stored response revision. No agent identity is inferred from graph text or client metadata.

Undo requires an explicit history ID matching this document's latest current revision; an intervening mutation yields STALE_CONTEXT. Undo has its own revision and dedup record. It only affects the document; evidence fixtures, external services and auth sessions are not reversed. Retention of history/idempotency/audit is unbounded in this POC.

## Epistemic boundary

Graph patches cannot insert a conclusion, set accepted status or rewrite conclusion claims. Proposal requires referenced supporting/contradictory records, forbids overlapping evidence classifications, and sets proposed server-side. A separate human endpoint with the same backend role, CSRF, revision and idempotency checks acknowledges a conclusion. It is absent from the bridge tool registry. It is an explicit UI action rather than cryptographic proof of human presence; a malicious authenticated application session can invoke ordinary human endpoints. Verified factual truth is not a property this POC asserts.

## Host boundary

The dev simulator is same-origin testing code, not a production trusted host. Its approval UI tests boundary mechanics, but cannot establish real native/extension consent. Production Guava dispatches only domain operations and never claims to police host-side model export. Hosts must enforce approvals independently, pin explicit document/node IDs and fail closed on reload, logout, document change or consent revocation. The optional native adapter requires a verified host policy dispatcher and is not wired automatically; annotations do not grant permissions.

There is no MCP listener in Guava, no model gateway client, no credentials passed to models, no remote relay and no paid API calls. The optional integration runner is a dev-only MCP client with tokens only in headers and loopback endpoints only. Do not commit its credentials.
