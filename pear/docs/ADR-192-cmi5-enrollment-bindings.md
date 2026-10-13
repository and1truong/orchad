# ADR-192 — exact cmi5 enrollment completion proofs (#144)

Stacked on ADR-191 / #268. Add cmi5 course lessons and reusable/standalone items
with immutable package ID/SHA-256 and an explicit `allowWaivers` policy. Authoring
requires an exact published same-tenant package. Reusable lessons copy their
authoritative item pin and policy, discarding caller overrides. New enrollments
and retakes cannot pin retired/revoked packages; existing enrolled pins may
finish on retired packages. The concise `cmi5_and_quiz` policy keeps the public
course tool envelope within the existing host's 8 KiB schema limit.

Reuse Pear's enrolled course/item context resolution, including live audience,
module/lesson prerequisites, standalone successors, nested award bindings,
assignment cycle and coordinator authority. SCORM and cmi5 share that resolution
but retain separate runtime evidence/proofs. Freeze the complete context at
registration attachment and re-resolve it on every fetch, resource, document or
statement request. Missing authorization adapters cannot operate an existing
bound registration. Identical binding keys resume one registration; different
enrollments, criterion paths, course pins and retakes retain independent progress.

Official completion requires all AUs to satisfy their imported moveOn policy
and end their latest accepted Normal session. A prior failed termination cannot
authorize an in-flight new pass; NotApplicable at launch does not grant credit.
Browse, Review and unbound practice cannot project. A confirmed LMS waiver is
allowed on a bound registration only when the immutable authored policy opts in;
otherwise reject it without revoking the learner's working session. Waived
reported completion/pass remain false. Course quiz/grading/certificate rules
still use the existing human ledger.

In the same transaction as accepted statements, lifecycle, satisfaction and
audit, store one immutable package/context/AU/UUID/hash completion proof and
update the exact lesson or standalone enrollment. Refresh existing standalone
award/assignment completion notifications. Audit failure rolls back the final
statement, termination, proof, ledger and revision. Proofs/bindings have SQLite
update/delete protection. Schema 054 retains previous packages, registrations,
State and statements without inventing bindings or credit. Receipts, binary
State, historical proof and certificates survive restart and requalification.

The built course/item editors offer reviewed cmi5 pins and an explicit waiver
policy. The enrolled player launches the exact binding, supports AU pagination,
Normal/Review and local/OwnWindow delivery, and reads server proof status before
refreshing the learning UI. Personal acknowledgement cannot complete cmi5 content.
Generic cmi5 reports distinguish practice, enrolled completion and permitted
waivers. Semantic progress receives scoped completion metadata, not executable
content, credentials, private response payloads or raw State.

Local evidence: 39 cmi5 cases, seven built Chromium journeys and build/typecheck/
vendor PASS; all 1,135 existing Pear regression cases PASS (concurrency 2, no
failed/cancelled/skipped cases). New cases cover real course quiz certificates,
standalone retakes, current audience/module gates, authoritative reusable policy,
nested award pins/requalification, missing adapters, audit rollback, populated
schema-53 migration and restart. Browser acceptance completes both actual AUs,
stores one proof, and only then passes the real Pear quiz to issue a certificate.
These are controlled local checks; external partner mappings, full LRS/cmi5
conformance, licensed/native/platform and production evidence remain open.
