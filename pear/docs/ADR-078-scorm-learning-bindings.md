# ADR 078 — Multi-SCO 1.2 and exact learning evidence

S4 of epic #133, building on ADR 075–077 and the user-selected #49 branch. SCORM development owns its successor branches; the other session's checkout, stack and PRs remain untouched.

## Delivery and prerequisites

Reparse the immutable manifest at launch. Walk the selected organization through nested folders and SCO leaves; keep per-SCO CMI, revisions, Finish and reported time. Select only an exact activity ID in that organization. Supersede old capabilities across the overall attempt before a new SCO launch. The UI flushes, reconciles and closes the prior communication session before switching. Direct POST launch cannot bypass locked prerequisites.

Parse AICC prerequisite expressions with bounded tokens/depth, never executable evaluation. Support identifiers/blocks, conjunction/disjunction/negation, status equality/inequality, sets, thresholds and parentheses. Evaluate from accepted server state and enforce ancestor conditions. A completed prerequisite requires an accepted Finish; an in-flight status write alone cannot unlock it. Reject unknown IDs, malformed expressions, non-SCO activity resources, empty folders and SCOs with children. Auxiliary package assets remain hosted normally. Organization asset-activity delivery and external-tool conformance remain explicit acceptance work, rather than silently discarding those nodes.

Supply manifest launch data, mastery score and time-policy fields as LMS-owned CMI; content cannot change them. Normalize accepted Finish through the real server engine. Preserve explicit incomplete status against mastery override, matching ADL 1.2 conformance requirement 1.6.6; no mastery means no score-based status override. Time-limit action is supplied to the SCO; this is not a claim that arbitrary content obeys time limits or reports honest time. Reported seconds remain distinct from Pear's observed study timer.

References: [ADL 1.2 CAM](https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_CAM.pdf), [ADL 1.2 conformance requirements](https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_ConformanceReq.pdf), and the pinned upstream engine implementation. These guide fixtures and counterexamples, not an ADL certification claim.

## Enrollment, pins and projection

Add SCORM lesson/item references containing exact package ID, version, SHA-256 and an immutable completion policy: completed-or-passed versus passed, plus an optional minimum score for every required SCO. Authoring accepts only the exact published own-tenant version. Reusable item references copy the authoritative published reference/policy; caller-supplied overrides are discarded. Course modules and ordinary lessons retain their existing requirements, and the course quiz remains required.

Derive registration binding keys on the server from the exact course enrollment plus lesson, or standalone enrollment. Freeze package/policy, enrollment/version, assignment cycle and nested award binding/root/criterion path. Resolve permission through the existing domain services, including module prerequisites, current content audience, award ancestor audiences, coordinator authority, assignment state and current reviewed successor. Repeat that resolution on resource reads, bootstrap, checkpoints and receipt replay. Package retirement permits pinned enrolled learning; security revocation denies execution.

Migration 046 adds immutable enrollment bindings/completion proofs and per-SCO Finish. Accepted evidence must satisfy every required SCO's status and score policy. In one transaction, store the final CMI/time/sequence, immutable hash/attempt/SCO/engine-version proof, lesson or item ledger change, audit, workspace revision and exact receipt. Audit failure rolls everything back. Repeated delivery cannot project twice. Course completion/certificates still use the existing human quiz/grading ledger; standalone items retain no course certificate. Item completion refreshes existing award and assignment notifications atomically.

Practice and admin preview have no official binding/projection. Human acknowledgement cannot complete a SCORM lesson or item. Assistant progress/report views receive scoped package provenance and accepted completion metadata; executable content, launch capabilities, interactions and suspend payload stay outside semantic tools.

## Retakes and history

An explicit confirmed engine retake starts a new empty overall attempt and closes old capabilities, while preserving previous SCO rows, receipts and audit. It requires the exact owned registration/attempt and current personal revision; request replay is exact. Once bound learning has accepted proof, use the existing authorized course/item enrollment retake or award requalification flow. Fresh enrollment/criterion/cycle keys create independent registrations with no copied runtime/completion. Superseded award and standalone enrollments lose execution rights; issued proofs and certificates stay immutable.

## Evidence and remaining gates

Tests cover logical/status/set prerequisite cases, direct forbidden launches, independent SCO resume/time, Finish/pass/score policy, preview/practice separation, immutable package pins, transactional audit rollback, current audience/revocation, standalone retakes, nested award paths and distinct course pins, coordinator loss, later assignment cycles, failed-attempt reset, module gates, reusable-item authority, populated v45 migration and SQLite reopen. Built Chromium acceptance plays both SCOs, resumes the introduction, verifies prerequisite locking and durable completion, then issues a real quiz certificate. Import/review, outage/lost-ACK and legacy browser journeys remain required.

SCORM 2004 playback/sequencing, broad licensed external-tool fixtures, native/production executable isolation and final integrated main delivery remain S5–S8. Production execution and strict all-egress claims stay disabled. Local reviewed fixtures do not establish complete standards conformance or Rustici parity.
