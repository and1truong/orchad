# ADR-147: Bounded response checkpoint transport

Original performance capacity vectors (five patterns,125 records,250-character
step names and250-scalar answers) are accepted by the synchronous API but
rejected by the512KiB durable checkpoint ceiling. Three edition regressions
fail on v38, complete exit1. Choice requires ten patterns of36 long identifiers;
named full-capacity choice/performance plus learner/suspend data are now tested.

The shared SCORM2004 ceiling becomes2MiB. Browser queue already uses this
constant; server state and combined shared-data checks now agree. Only the
checkpoint HTTP route gets2MiB plus32KiB metadata overhead. Oversized HTTP
requests return413/INVALID_ARGUMENT. The default content-host limit, SCORM1.2
128KiB model limit, queue16,2048 leaves, typed field limits, per-launch receipts
and64MiB tenant runtime storage bound remain enforced. No engine adaptation,
schema, accepted receipt/history or proof change; engine remains v38.

Final focused24/build/typecheck, fresh full domain825/825 across121 files,
large-checkpoint/ordered built9 and supplemental native fixture4 complete exit0.
Each named large browser journey checks lost ACK, exact retry payload and exact
resume. HTTP acceptance and over2MiB atomic refusal preserve revision/receipt/
proof. Tests use Boolean comparisons for large values to avoid logging CMI.
Full157 local browser and exact-head CI/reviews remain required.

Native fixture retains all original read/ordered checks and adds35 supplied
4000-scalar Unicode comments; successful checkpoint bytes must exceed544KiB
after real lost-ACK/retry/resume. Evidence emits only byte/count/preservation
metadata. Actual Linux/macOS/Windows logs remain required; Chromium is supplemental.
Payload capacity is bounded evidence, not all-interaction/SPM combination or
production load acceptance. Reviewed load/storage/retention/RPO/DR policy is
still absent, as are authorized exports/Rustici and actual Safari/Android.

Initial build fails strict unknown-error typing; narrowed Error/statusCode check
fixes it. Initial overflow test wrongly assumes two performance interactions
exceed2MiB in second edition; three packed interactions exceed the ceiling in
every named vector. Both failures and wrong-cwd preparation logs are retained.
Parent #220 full151149PASS/2FAIL exit1 (download/SW restrictions) is retained;
parent exact-head CI/reviews are separate. Epic133 OPEN, production DISABLED.

Reference: ADL third/fourth-edition RTE4.2.9.1 Table4.2.9.1a choice/performance:
https://upload.aura-software.com/files/20191008081839-de8fbb595231f8557780f59e3a0ae316f2a2abbf/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Second-edition execution remains bounded compatibility evidence pending exact
reference expansion.
