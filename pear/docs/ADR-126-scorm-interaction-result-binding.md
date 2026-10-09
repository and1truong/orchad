# ADR-126: Shared interaction result real capacity and ID dependency

ADL2004 RTE §4.2.9 binds result to four vocabulary tokens or real(10,7),
and requires the interaction ID before a result write. The shared engine
limited numeric result to four integral digits and admitted a result-only
interaction without an ID. The latter created an unintended collection record.

Checksum-locked v25 broadens only the numeric result branch, retaining the
existing real lexical precision, four vocabulary tokens and exact authored
strings. The existing shared finite/4096-character numeric guard also checks
numeric results. One setter dependency guard returns408 before mutation;
existing transactional traversal rolls back the refused append. Known v24
snapshot markers and exact installer histories remain accepted;1.2 bytes stay
unchanged. No schema/history rewrite, normalization or production change.

2004 SHA256d28dc6ff0d7f4f2637302a285c600a686078fb64e80518ce541404449c017430.
Original direct/facade cases check missing-ID count rollback, signed/wide
results and vocabulary preservation. Preload/replay refuse overflow; forged
missing-ID state cannot change revision, receipts or proof. Existing three
built wide-real journeys now include result dependency/overflow and exact
lost-ACK retry, stored value and close/resume.

Before correction12/12 regressions failed. Completed local focused26/26,
fresh full domain725/725 across105 files,build and all three built wide-real
journeys. Exact-head full CI/native/review remains required. Full data-model,
response/real lexical conformance and deployment/reference/platform/operations
gates remain OPEN/BLOCKED.
Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
