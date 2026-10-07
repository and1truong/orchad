# ADR 001 — Pear learning and host boundaries

Status: accepted for the P1 synthetic vertical slice. Production and full-parity decisions remain open in CAPABILITIES.md. Issue: https://github.com/and1truong/orchad/issues/49. Repository reference: main 864f40caff7ae6918358c7ea4c60e5fcbd9dd2d1.

## Deterministic application and aggregate identity

Pear owns learning state, content versions, authorization, assessment and persistence. It contains no model SDK, inference call, chat, agent loop, provider credential or domain-specific agent runtime. Its public browser boundary is Agent App Bridge 0.1. It is neither MCP nor native WebMCP. Lime owns inference, consent and approval; Mango/shared agent-client is unchanged.

Learner documentId is learning:{tenant}:{principal}. Library administration/assignment documentId is library:{tenant}. Learner mutations never advance another learner's revision. A new assignment atomically advances the library and the recipient's personal revision; this invalidates pending proposals against either affected aggregate. Library administrators share library CAS, so concurrent edits cannot silently overwrite drafts. Library revisions do not globally serialize learner progress. Personal aggregate revisions are coarse across one learner's courses for this slice; an enrollment-level aggregate is a future scalability ADR.

Every mutation takes an explicit course/enrollment/attempt/lesson ID. Selection is not authority. The bridge fails a call targeting the wrong currently selected workspace. Backend authority is the authenticated account, current tenant, live role, resource ownership and aggregate revision. Browser/model fields never supply userId, tenant, approved, role, score or pass.

One BEGIN IMMEDIATE transaction contains resource authorization, completed idempotency lookup, semantic-payload comparison, CAS, mutation, affected aggregate revisions, result storage and audit. Dedup key is principal + documentId + operation key. Semantic payload includes toolName, exact arguments, expectedRevision and channel; requestId is correlation only. A same-key valid retry returns the original result before checking the current revision. Different payload conflicts. Neither client nor host automatically retries writes. A timeout does not prove rollback; inspect authoritative progress and reconcile the original key. Changing channel cannot reuse a human-submission key through the agent API.

Duplicate enrollment means one learner/course enrollment: preserve original pinned version, assignment source and due date, return alreadyEnrolled. Assignment of an existing self-directed enrollment does not convert it or silently overwrite dates. Re-certification/recurrence requires a later explicit enrollment model, not an undocumented reset.

## Learning integrity

Published versions are immutable. Draft editing and publishing a new version leave all existing enrollments and attempts on their original version. Retirement removes discovery/new enrollment, while enrolled lessons and history remain readable. Prerequisites must refer to distinct earlier lessons; forward references/cycles are rejected. All required lessons must be acknowledged before assessment.

The only P1 completion policy is explicitly named human_attestation_and_quiz. Reading a lesson or tutor output does not record completion. An authenticated learner must acknowledge each lesson in the human UI, select quiz answers and confirm submission. These three human operations are deliberately absent from the agent catalog and forbidden through /api/bridge/invoke. This is an agent capability boundary, not a claim that an HTTP boolean cryptographically proves a human gesture or that a compromised same-origin page is safe. The trusted application UI owns confirmation; approved host tools cannot access generic fetch or human endpoints.

Objective scoring uses immutable quiz answer keys in SQLite, never score/pass supplied by a caller. Attempt caps, prerequisite checks, pending-attempt reuse and immutable submissions run on the backend. A certificate is generated in the same transaction as a valid passing completion. Certificate downloads authorize the enrolled learner and retain course version/issuer/time. They are synthetic and not accredited. Practice cannot mutate official progress because no practice-grade/completion tool exists.

## Role and tenant boundary

| Role | Personal learning | Draft/publish/retire | Assign/report | Other administration |
|---|---|---|---|---|
| Learner | Own | Denied | Denied | Denied |
| Manager | Own | Denied | Current active direct reports only | Denied |
| Content Admin | Own | Same tenant | Denied | Denied |
| Admin | Own | Same tenant | Same tenant | Not implemented |
| Assessor | Own | Denied | Denied | Scoped assessment workflow not implemented; no implied admin rights |

Every read/write re-reads live account authorization. Audience lists and reports enforce organization/direct-report scope at the server. There is no arbitrary SQL/report proxy or learner roster in learner tools. Cross-tenant catalog discovery and guessed enrollment/attempt/certificate IDs fail. Catalog entitlement in P1 is published content within the authenticated tenant; commercial provider/user-specific entitlements remain unimplemented.

## Session, model egress and transport

Sessions use opaque random HttpOnly, SameSite=Strict cookies; only a hash is stored. Mutations require exact Origin, Host and per-session CSRF. Domain reads and writes also require a non-credential sessionEpoch header bound to the UI session that initiated the request. An old tab cannot silently acquire a newly logged-in principal. Login rotates the prior session; logout/deactivation invalidate access. Identity adapters must increment auth_version on permission changes; current role is also evaluated per dispatch. The bridge closes over its login session. No cookies, CSRF or session credential is exposed through getContext, describe or tool outputs.

Content is untrusted data. Only self-authored fixture content is supported. aiProcessingAllowed=false withholds lesson text, transcript and media URL on the bridge channel while allowing authenticated human reading. Metadata previews are explicitly permitted for these self-authored fixtures. There is no claim that this metadata policy is valid for external provider contracts. Answer keys never appear in learner search, previews, lesson or attempt responses. Privileged authoring drafts require Content Admin/Admin; the learner catalog does not expose them. Audit avoids copying learner answer values.

The canonical schema dialect, envelope bounds, canonicalization, result helpers and validator come from @orchard/bridge-contract. Pear adds domain schemas without modifying the root contract. Reads use null revision/key, writes require both. All envelopes are at most 64 KiB; domain content has a stricter 44 KiB cap, page results use byte/row bounds. Unknown fields are rejected rather than removed. Search/report/course schemas are explicit; no generic browser, shell, URL fetch, SQL or JavaScript tools.

## Persistence and media isolation

Node 24 SQLite with foreign keys, WAL, busy timeout, idempotent migration and transactional synthetic seeds. SQLite and local assets suffice for the development slice. The server and development accounts default to loopback. Production-mode development-auth override also requires loopback. Synthetic login is disabled unless explicitly enabled. There is no production identity adapter: this is a rollout gate, not insecure fallback to a shared token.

Text, HTTPS links and direct video with required transcript are supported. Pear never fetches arbitrary remote URLs on the server. No iframe, interactive package, file upload, SCORM or archive import is enabled. Future uploaded content must receive storage authorization, type/size limits, quarantine policy and isolated-origin package sandboxing before adding a launch tool. Current media CSP permits only self/HTTPS video, no frames or plugins. Video URLs are chosen by authorized content admins; human viewing may contact the external media provider. Caption-file management remains an accessibility gap.

## Explicit open decisions

Go1 reference plan/portal and entitlements; production IdP/provisioning; licensed provider access/model-egress agreements; media storage/quarantine; enrollment re-certification/recurrence semantics; production worker scaling; retention/export/delete policy; content translation provenance; actual native Coconut/partner/channel test lanes. No subscriptions, provider keys, public deployment or Slack/Teams installation is authorized by this implementation.
