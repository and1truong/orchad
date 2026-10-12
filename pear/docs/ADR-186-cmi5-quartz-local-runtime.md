# ADR-186 — cmi5 Quartz local-AU runtime (#144)

Status: implemented restricted profile; full cmi5/LRS conformance and production OPEN.

## Reconciliation and decision

#144, #49 G18, #133 and `CAPABILITIES.md` were read before implementation. Main
`3c3c7b412eae5eb2428f22943a4d195507944c02` has SCORM and the restricted ADR-025
xAPI endpoint, but no cmi5 packaging, launch or session implementation. Neither
existing profile is cmi5 evidence.

Implement `pear-cmi5-quartz-local/1` against Quartz 1st Edition (June 2016),
using the AICC specification at
[`0ff5b3058778035acdb604aedc1f672083970f67`](https://github.com/AICC/CMI-5_Spec_Current/blob/0ff5b3058778035acdb604aedc1f672083970f67/cmi5_spec.md)
and its `v1/CourseStructure.xsd`. This is an independent deterministic service,
without a commercial engine or new dependency. Reuse the installed xmldom/yauzl
parsers, bounded archive/path validation, resource MIME map and live account
guard. No SCORM adapter or SCIM client token acts as a cmi5 runtime credential.

## Delivered flow

Content administrators import a licensed ZIP into quarantine and review its exact
SHA-256 before publication. Store original bytes and resources in SQLite. Each
import is an immutable package identity; importing updated content does not
rewrite an existing registration. Local HTML AUs, nested blocks, multilingual
metadata, objective references, launch method, launch parameters, optional
entitlement data and mastery scores are parsed. Course/block/AU LMS activity IDs
are distinct from publisher IDs and stable across launches of the imported
package. XML extensions and remote/non-browser launches are explicitly refused.

Learners create a registration by starting an AU. Resuming an AU from its saved
registration preserves the actor, registration, activity identity and State data;
starting without a registration ID creates a new registration, suitable for a
retake. Launches use Normal/Browse/Review vocabulary; administrator preview uses
Browse. Existing retired pins remain playable, while retired packages cannot
create new registrations. Revoke prevents all subsequent runtime access.

The AU receives the five encoded launch parameters, with existing query/fragment
preserved. AnyWindow embeds the AU; OwnWindow uses a user-activated new-window
link with no opener. The LMS persists `LMS.LaunchData` and the `launched` statement
in the launch transaction. `launchurl` contains the content session path and
original AU parameters, with the five cmi5 parameters omitted. The content
session ID grants read-only resource access; it cannot fetch an authorization
token. Fetch uses a separate random one-use POST capability. Fetch/Basic secrets
are hashed at rest and absent from statements, audit and operation receipts.

The fetch response returns a Basic auth-token once, or cmi5 error code 1/2 with
HTTP 200. The token is restricted to one session and its own registration, and
expires after four hours at most. Every runtime request also verifies the live
browser login, learner account/auth version and package status. Logout, account
revocation and package revoke invalidate access immediately, including after
restart. A successor launch abandons active sessions in the same registration;
closing an unfinished activity records one LMS `abandoned` statement. The AU
owns its `terminated` statement; the LMS never fabricates successful termination.

The restricted xAPI 1.0.3 listener supports UUID-based POST/PUT statements, scoped
GET reconciliation/cursors, JSON State GET/PUT/POST merge/DELETE with ETags, and
the read-only `cmi5LearnerPreferences` Agent Profile. `LMS.LaunchData` cannot be
overwritten or deleted. AU State persists per registration/AU across sessions.
State/profile operations require the exact launch actor and activity scope.

Defined statements enforce exact actor, AU, registration, session, publisher
grouping and categories; initialized first, terminated last, defined verb
uniqueness, one passed/failed per session, registration-wide completed/passed
uniqueness and no failed after passed. Source UTC timestamps determine ordering,
with equal timestamps allowed and lifecycle boundaries ordered around them.
Terminated sessions allow five seconds for delayed statement delivery/retry;
the complete timestamp-ordered history is revalidated atomically. After that,
all runtime credentials are refused. Supported allowed statements retain the
context template and are stored but cannot satisfy an AU. LMS-only/voiding verbs
cannot be authored as defined AU statements. Score/result/duration and
masteryScore checks reject inconsistent reports.

All five `moveOn` values are evaluated from accepted defined evidence. Evaluate
NotApplicable at launch; emit each satisfied block/course statement once per
registration. Browse/Review cannot report satisfaction. Own learner and
same-tenant content-administrator reports show AU completion/pass/score/duration,
session history and course satisfaction. Cookie-authorized paginated statement
evidence remains available after runtime credentials expire. These values do
not create Pear official enrollment, quiz score, observed time, proof or certificate.

## Boundaries and operations

Schema 52 adds only cmi5 tables; existing SCORM/xAPI/official records are retained.
SQLite transaction receipts bind human writes to principal, workspace revision,
operation key and exact payload. Failed batch/audit validation rolls back the
entire mutation. Import checks live authorization both before parsing and during
the final transaction. Import/export/review/launch/close are human HTTP flows;
none is added to the agent tool catalogs.

Execution requires explicit reviewed loopback configuration and a content
hostname different from Pear. The separate listener accepts no cookies and no
Pear/SCIM credentials, validates Host/Origin, and has no cross-origin CORS.
Resource CSP permits packaged scripts/media and same-origin xAPI only; workers,
forms, external connections and top-frame embedding outside Pear are denied.
No package writes files to the server filesystem. This development isolation is
not production credentialless/strict-egress enforcement or a malware scan.

Quotas: ZIP 32 MiB, expanded 64 MiB, file 16 MiB, manifest 1 MiB, 2,048 entries,
16,000 XML elements/32 levels, 2,048 AUs; cmi5 stored archives/resources 128 MiB
per tenant. AU pages contain ten rows, including the tested 1,001-AU package.
Each learner has at most 200 registrations; each registration at most 10,000
statements, 128 State documents/512 KiB total. Requests contain at most 20
statements/64 KiB; each statement 16 KiB and each State document 32 KiB.

The global listener shares one origin for reviewed development packages.
Independent production origins, scanning, account/entitlement review, retention,
resource ranges, load/DR acceptance and additional browser/native platforms need
separate evidence. No runtime credentials appear in application operation
receipts; a lost launch response is recovered by registration/session IDs and an
explicit subsequent launch, which abandons the unreceived active session.

## Acceptance and remaining gates

See [CMI5-ACCEPTANCE.md](CMI5-ACCEPTANCE.md). Automated evidence covers the
delivered local profile, not complete XSD/xAPI/cmi5 conformance. In particular,
standalone XML/remote AUs, certified ZIP64 fixtures, arbitrary xAPI objects,
attachments, full State/Profile/query semantics, administrative waivers and
external commercial/reference content remain open. Production remains disabled;
#144 and G18 stay open pending those requirements and external evidence.
