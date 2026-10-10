# ADR-133: Shared comment field presence

ADL2004 RTE4.2.2/4.2.3 distinguishes an existing comment record with an unset
child from a supplied empty comment/location. The former returns empty with403;
a read beyond the maintained comment count returns301. The shared model supplied
empty defaults for every child and serialized them as initialized values.
All six original three-profile regressions failed before correction.

Checksum-locked pear-comment-presence-binding-v29 leaves each comment child
undefined until its typed setter initializes it. Existing initialized getters
raise403 for missing fields and the existing jsonString serialization path omits
undefined children. Supplied empty comment/location stays initialized with0;
read-only404, malformed typed406, packed indices and atomic refusal remain.
The shared array-access path returns301 for absent recognized comment fields;
other collections retain their existing behavior. Browser/facade/server use the
same model; no new presence ledger, schema or dependency is introduced.

Known v28 sequencing snapshots and historical installers stay supported.
2004 SHA256: d0b3b183192ac4a8a10efb9058435a1d5e1255065f1d11e776c8420fa2a60897.
SCORM1.2 bytes are unchanged. Explicit serialized blanks in old snapshots cannot
be distinguished from old constructor defaults; preserve them as supplied values,
never infer or rewrite historical presence. Full mandatory-field presence remains
OPEN; this correction covers comment children and their collection-read error.

Completed focused70/70, fresh full domain746/746 across108 files and build, exit0. Three existing built comment journeys
passed3/3 with lost ACK, exact retry, unchanged count/revision/receipt/proof,
stored child omission and GetValue403 before/after close/resume. Direct shared/
facade partial trusted LMS records, malformed-write absence preservation,
explicit blanks and typed replay/durable omission are covered. The first full run completed743/746 because three existing atomicity snapshots
expected synthesized blank siblings. Those entire-object assertions now require
omitted children and add403 checks after resume; no rollback/history assertion
is removed. Current-head full CI/native/review are required before a broader PASS claim.
Epic remains open and production disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
