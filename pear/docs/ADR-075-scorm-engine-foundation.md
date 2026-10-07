# ADR-075 — Self-hosted SCORM engine foundation

Status: accepted for S1 of epic #133, built on #132 / #49. Runtime delivery is not yet enabled.

## Choice and evidence

Use MIT `scorm-again` **3.4.5**, pinned in package and lockfile. It has no runtime dependencies. The real installed runtime is exercised for synchronous string-return API behavior, state preload, interactions, protected identifiers and separate 2004 completion/success. These are integration probes, not conformance or sequencing acceptance. Preserve license notices through the bundled distribution.

The 1.2 probe found upstream permits SetValue after LMSFinish. Pear's narrow standard-method facade explicitly tracks the communication lifecycle, rejects post-finish writes with 301, validates string arguments and exposes checkpoint callbacks rather than engine helpers. This difference is covered by a regression; upstream acceptance is not assumed sufficient.

The old `pear-scorm12-inline/1` remains intact. Its parser deliberately accepts two flat files and its tracking is not official learning. Expanding that handwritten parser/API into a standards engine would duplicate mature runtime work and weaken its reviewed restrictions.

Rustici Engine/SCORM Cloud provide the reference lifecycle and real-world compatibility benchmark. They require licensed services/credentials for execution; the default Pear lane stays self-hosted and does not upload learner data to them. A later engine adapter remains possible behind package/registration/attempt records. No commercial purchase or account is required to continue this stack.

Sources checked 2026-10-07: https://rusticisoftware.com/products/rustici-engine/, https://cloud.scorm.com/docs/v2/knowledge_base/lms_integration/, https://github.com/jcputney/scorm-again, https://jcputney.github.io/scorm-again/docs/advanced/sequencing, https://github.com/adlnet/SCORM-2004-4ed-Test-Suite.

## Records and migration

Migration 043 creates immutable content versions/resources and separate registration → overall attempt → SCO attempt records with tenant-qualified foreign keys. Legacy package records are not copied into engine registrations and their status never becomes an official completion by migration. Registration creation uses live account/role checks, explicit package/version/mode, CAS, audit rollback and idempotency; preview and normal registrations are distinct. Normal registration is standalone practice in S1, with `officialLearningChanged:false`; course and award bindings belong to S4.

Published versions allow new registrations, retired versions allow existing history/resume, and revoked versions deny execution. Registration creation creates one first attempt and reuses it on repeated launches; retake is a later explicit operation, not a side effect of reload.

## Content boundary

The content server is separate from the Pear application. Even a different port on the same hostname shares cookie scope, so configuration requires **different hostnames**. Local defaults: Pear `http://127.0.0.1:4314`, content `http://localhost:4315`; production must use HTTPS and host-only Pear cookies on separate content infrastructure. Content receives no Pear session, agent bridge, model credentials or native IPC.

S1 serves health only, validates exact Host, rejects Cookie/Authorization headers, has no CORS and denies unknown paths. `npm run dev:scorm-content` is loopback-only. S2 will add capability-scoped resources; S3 places the synchronous runtime adapter and SCO on the content origin, with bounded persistence tied to its registration/attempt. The trusted Pear shell communicates with an exact origin/source/launch channel. SCOs are not hosted on Pear's application origin.

Runtime Commit acceptance and durable server ACK are separate. We will expose Saving/Saved/Failed, keep regular acknowledged checkpoints and test disconnect/crash/replay; unload and redirect are not the persistence contract. The content can report its own results, so SCORM is not an anti-cheat boundary. Server-side policy/validation remains the authority for official projection.

## Capability matrix / rollout

| Surface | S1 evidence | Remaining gate |
|---|---|---|
| SCORM 1.2 runtime | Installed API probe, resume preload, interactions, access checks | S2 manifest/assets, S3 real player and persistence, S4 multi-SCO/official binding |
| SCORM 2004 2nd/3rd/4th | Explicit identifiers in schema; generic installed 2004 API probe | S5 edition-specific adapters/data model/error corpus; no edition support claim yet |
| 2004 sequencing | Upstream candidate researched | S6 manifest mapping, trusted sequencing, snapshots, rollup and negative navigation evidence |
| Isolation | Separate cookie hostname, fail-closed host, no credentials/bridge | S7 executable/adversarial package and network-policy evidence |
| Compatibility | Local probes without vendor account | Licensed authoring-tool fixtures and optional Rustici differential validation |
| Production | Runtime disabled | Scanner/storage policy and strict-egress platform gates remain open |

Do not substitute runtime stubs or permissive parser retries for unsupported manifest/sequencing features. Unsupported standards fail explicitly. Full xAPI/cmi5/LTI and generated SCORM export are outside this engine epic.
