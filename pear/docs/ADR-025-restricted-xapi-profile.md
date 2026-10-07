# ADR-025: Restricted external activity statement profile

Status: internal adapter implemented; exact-head CI required. Full LRS conformance/certification, partner/runtime sandbox and production deployment NOT VERIFIED.

## Frozen interoperability boundary

The starting reference is ADL xAPI 1.0.3, https://github.com/adlnet/xAPI-Spec/blob/master/xAPI-Data.md and https://github.com/adlnet/xAPI-Spec/blob/master/xAPI-Communication.md . This is the explicitly restricted `pear-xapi/1` profile, not a claim of a conformant general-purpose LRS. SCORM 1.2/2004, cmi5, xAPI 2.0, voiding, attachments/signed statements, OAuth1, State/Agent/Activity Profile APIs and arbitrary provider IRIs remain unsupported.

Explicit startup requires `PEAR_XAPI_ENABLED=true`, reviewed SCIM actors and secure HTTPS/cookies. Fixture HTTP is programmatic loopback only. Endpoint: `/integrations/xapi/1.0.3/statements`; X-Experience-API-Version must be 1.0.3. Scope is xapi.read/xapi.write, independently reviewed by a live tenant administrator. Machine API accepts scoped Bearer only, exact Host and no cookie fallback, same live issuer auth-version/expiry/revocation rules as ADR-022. Credentials never reach statement/tool payloads.

## Statements

Require explicit UUID id and registration, UTC timestamp (seconds or three-digit milliseconds), account Agent actor owned by the same managed SCIM client, and exact Pear course/version Activity IRI. Actor account homePage is the exact APP_ORIGIN + /scim/v2, name is the opaque managed User ID, with no email/display-name adoption. User must remain active/learner and current-client managed; deleted/promoted accounts cannot write or retry. Object IRI is APP_ORIGIN + /content/course/{bounded ID}?version={positive version}. Source must be currently published, or an existing authorized enrolled pin for that actor.

Supported verb IDs: ADL experienced/completed/passed/failed. Result fields: boolean completion/success, bounded finite score scaled/raw/min/max with consistent bounds, and the restricted PT hours/minutes/seconds duration grammar (up to three digits per component, fractional seconds up to three digits). Completed/passed/failed must agree with corresponding result booleans. Server rejects names, unknown fields/extensions, nested contexts, arbitrary activities, group actors, statements-as-objects, password/provider authority, attachments and unsupported versions. Timestamps are valid UTC calendar values ≥1970, no more than five minutes in the future. No external partner interpretation is assumed.

1–5 statements/batch, ≤8 KiB each/32 KiB combined; machine JSON remains ≤64 KiB and rejects decoded duplicate keys, malformed syntax, non-finite numbers and >16 nesting. Statement identity is global UUID with authorized client/tenant ownership checked before reconcile; property order is canonicalized and ID/registration case normalized. Same authorized ID/same semantic payload returns the existing ID; changed payload fails 409. Invalid mixed batch/audit failure rolls all statements/audit/revisions back. No new operation key is needed to recover an uncertain statement write.

POST returns UUID array; PUT requires a matching single statementId and returns 204; GET single statement or own-client StatementResult with complete-row stored-sequence paging. Profile query supports statementId alone, registration, limit 1–20 and explicit after cursor. These cursor/filter restrictions are profile-specific; general xAPI query portability is not claimed. more is a same-server relative continuation. Server adds stored/authority/version on read; client may reconcile historical statements for inactive actors while issuer/client scope remains live. History quota: 5000 statements/client, retained rather than silently purged.

## Projection and official integrity

Migration 020 stores immutable external statements, exact source/version, actor, registration, timestamp, received order and client. Private projection applies statements by timestamp then UUID, independent of arrival order; last explicit result field wins within actor/source/version/registration. Exact duplicate does not increment count. Statements and audit share IMMEDIATE transaction; successful new batches increment touched personal and library revisions to invalidate stale contexts.

Connector-reported completion, success, scores and durations remain a separate private **external activity** ledger, clearly disclosed in human My Learning and the own-only semantic read. They never enroll, answer/grade Pear quizzes, create certificates, update observed timer totals, bypass prerequisites or award credit. External duration is a report, not verified attention. No generic statement-write tool is in Bridge.

## Evidence and remaining gaps

Eight Node/HTTP fixtures test strict JSON, duplicate/conflict/mixed rollback, source timestamp ordering, live actor/client/tenant scopes, result/version rejection, private projection, official-ledger zero changes, whole paging, durable restart and real Fastify PUT/POST/GET/version/Host/Bearer behavior. Browser fixture uses a real HTTP statement client and signed SSO learner session; it shows reported completion after duplicate/out-of-order input while official enrollment/attempt/certificate/timer counts remain zero.

Full xAPI validation/standard queries/LRS certification, SCORM package/runtime import/export, provider mapping/licensing, data retention and actual LMS/HRIS partner sandbox remain OPEN/BLOCKED/NOT VERIFIED. No partner account, real provider credential, outbound delivery or deployment was configured.
