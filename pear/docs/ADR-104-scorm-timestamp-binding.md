# ADR-104: SCORM 2004 timestamp calendar and lexical binding

Epic #133, from merged #170 / main `1a3a03aaf3b2a4909f9efc35d322a1cf47f68e8d`.
The pinned engine accepted years after 2038, impossible calendar dates,
three-to-six fractional digits, pipe timezone signs and minutes after Z.
Full-input refusal, including line terminators, is explicit in the new binding. The checksum-locked `pear-timestamps-v10` adaptation corrects
CMITime and the common 2004 format validator used by interactions and comments
from both learner and LMS. The same exact ESM bytes run in browser API, trusted
server replay and loadFromJSON; validation cannot be bypassed by baseline equality.

ADL RTE §4.1.1.7 defines progressively optional year/month/day/hour/minute/second
components, Gregorian day bounds, 1970–2038 years, one or two fractional digits
and extended timezone offsets. Hours range 00–23 and minutes/seconds 00–59,
including timezone components. TZD requires the complete fractional-second
component; Z has no minutes. No host-local Date.parse, decoding, timezone
conversion, truncation or calendar normalization is used. Valid binding bytes
remain exact. The pre-existing Pear compatibility conversion of full seconds
plus TZD to `.00` plus TZD remains explicit in scorm2004EngineValue; bare-engine
load still requires the reference binding. This compatibility policy is not a
claim that a missing fractional component conforms to the standard.

Installation accepts only known pristine/adapted hashes, verifies the exact
output SHA-256 `bc9b1872658bcc18d5bd9fcb20f035e2d0d9657f9ea174f847905256af141938`,
is idempotent and refuses unexpected engine bytes/version. Known v9 and earlier
sequencing markers remain compatible. Historically invalid timestamps fail
closed before revisions/receipts/proofs; no silent repair or schema migration.

Original three-edition tests cover lexical/calendar/precision/timezone vectors,
every last-day/next-day combination across 1970–2038, interaction ID dependency,
pre-init load of all three collections, forged checkpoint refusal, invalid
historical seed refusal, exact ACK retry and SQLite reopen. Built pipwerks
journeys cover synchronous API errors and value preservation, dropped ACK,
exact retry and close/resume. These tests do not cover the complete API/data-model
or every required calendar/duration/sequencing/reference/platform acceptance.

Reference: Advanced Distributed Learning (ADL), SCORM 2004 4th Edition RTE,
Version 1.1, 2009, §4.1.1.7, §4.2.2, §4.2.3 and §4.2.9:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
Exact-head test/CI evidence is recorded in the PR/epic ledger. Full conformance
remains open and production stays disabled. LMS comment browser read-only
behavior is an independent DM-03 successor finding; server protection remains.
