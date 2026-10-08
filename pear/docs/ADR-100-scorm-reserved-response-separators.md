# ADR-100: reserved response separators retain brackets

Epic #133, following integrated ADR-098/099. ADL SCORM 2004 RTE v1.1
4.1.1.6 requires bracketed reserved tokens; bare punctuation is response data.
Interaction learner/correct response formats are specified in 4.2.9. The shared
upstream splitDelimited/splitFirstDelimited fallback instead stripped brackets,
split bare punctuation and unescaped backslashes. It rejected valid performance
text, accepted malformed matching/numeric records, and bypassed fill-in scalar
limits by splitting one answer into several records.

Replace the common parser fallback with exact bracketed-token splitting. All
learner/correct response callers share this behavior, including the ADR-098
textual patterns, which no longer need a separate splitting branch. Do not infer
an escape grammar for ordinary backslashes. Public API and trusted server replay
use the same pinned adapted engine. No schema migration or authority changes.

The checksum-locked scorm-again 3.4.5 ESM adaptation is pear-separators-v8, SHA256
92eae7d9b66fc91c85c68e3ad53b3a4b1f9011b89e69698f0619c3187c69ff8c.
Installer vectors prove pristine and every known adapted input, including final
responses-v7, upgrade idempotently and reject unknown bytes/version. Known v7
sequencing snapshots remain compatible; unknown markers are refused. MIT notices
remain unchanged.

Original three-edition vectors cover exactly 250 versus 251 scalar fill-in
answers containing bare commas/emoji, performance text and literal backslashes,
choice punctuation/set duplication, bracketed matching and numeric correct ranges.
Rejected replacements preserve values. Durable commit, exact retry, forged replay
rejection and actual DB close/resume preserve accepted original strings and create
no official proof. Historical v7 invalid response seeds are rejected by the
engine loadFromJSON setters before baseline-equality skips; unchanged or omitted
incoming response fields cannot create a new receipt, revision or proof. Original
three-edition trusted-sequencing regressions preserve valid v7 resume and prove
failure transactionally for over-limit fill-in, malformed matching and numeric
correct patterns. No accepted history is rewritten. Built licensed-wrapper API/ACK/close/resume journeys are authored
for all three editions. Local browser installation is unavailable in this checkout;
actual current-head CI, rather than previous-head evidence, must verify that lane.

Reference: Advanced Distributed Learning (ADL), SCORM 2004 4th Edition Run-Time
Environment (RTE), Version 1.1, 2009, mirrored at
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
This fixes named vectors; full URI/response/error/reference/platform/production
acceptance remains open in SCORM-CONFORMANCE.md. Production remains disabled.
