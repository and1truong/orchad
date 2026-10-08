# ADR-128: Shared numeric response and bound validation

ADL2004 RTE4.2.9.1/4.2.9.2 bind numeric learner response to real(10,7),
numeric correct response to bracketed min/max bounds (including either/both
open endpoints), and performance numeric correct answers to the same real
bound form. Direct shared/facade setters admitted arithmetic overflow and
numeric patterns without the reserved range delimiter.

Checksum-locked v26 reuses the existing shared decimal validator in numeric
learner responses, numeric pattern endpoints and performance range endpoints.
Its finite/4096-character/18-decimal lexical envelope is Pear capacity policy,
not an exhaustive real precision or standards certification claim. Numeric
correct responses require [:]; exact authored strings and open endpoints stay
unchanged. Performance literal/empty optional components retain their grammar;
no literal numeric-looking string is normalized. No new dependency/schema or
history rewrite. Known v25 markers and exact installation histories accepted;
1.2 bytes unchanged. 2004 SHA25616ea129cb6cbf6e50774afe6c852afd3dfb861e52220286d368bbec535ac9d14.

Original expanded result/response file before correction:3 retained result
cases passed and12 response/capacity/preload/replay regressions failed. After:
focused37/37, fresh full domain728/728 across105 files, build and all three
built numeric response journeys completed with exit0 and no failures. Direct shared/facade and preload/replay assert
refused state/count/revision/receipt/proof preservation; browser adds dropped
ACK/identical retry and original stored strings through close/resume.

Exact-head full CI/native/review required. Full response-type/set/range,
precision/edition and other conformance/platform/egress/operations/reference
and integration gates remain OPEN/BLOCKED; production disabled and epic open.
Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
