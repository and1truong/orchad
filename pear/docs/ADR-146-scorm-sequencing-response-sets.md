# ADR-146: Ordered correct-response arrays

RTE4.2.9.1 defines sequencing correct responses as ordered arrays: repeated
members and zero members are permitted, but two identical patterns are not.
The shared engine admits duplicate arrays and rejects supplied empty patterns.
Nine original raw/facade/preload/durable tests fail on v37 (complete exit1).

`pear-sequencing-response-sets-v38` reuses the shared choice duplicate check,
comparing sequencing members by index while retaining choice set comparison.
The setter and API validator admit a zero-member sequencing pattern as one
supplied record. Self replacement remains valid; duplicate append/replacement
returns351 without changing patterns/counts. Matching repeats, choice member
uniqueness, dependencies, typed grammar and SCORM1.2 remain unchanged.
SCORM2004 SHA256:5153a70d4100dd05c905d4df8ad4f27dbab16292e4f27ef461096b77f022f276.

Exact v37/historical installer paths and trusted envelopes upgrade; unknown
source/version/identity still fail. Existing invalid duplicate state is refused,
not silently normalized. No schema, receipt, history or proof rewrite.
Focused35/build/typecheck and built7 complete exit0 (new ordered3,
supplementary native fixture4). Fresh full domain822/822 across120 files completes exit0. Full151 browser and
exact-head CI/review are still required. Native fixture adds only count/error-code/preservation
evidence before/after lost-ACK/exact retry/resume; actual three-OS execution is
required separately from Chromium fixture evidence.

Parent #21968c4ee15/run37873160107 completes all10 jobs, all logs inspected:
Pear813/213dev/213built/SidePanel4; native3OS runtime16/Pear13/SCORM1.2=13/
each2004=14, five clean native/fixture exit0 and quit ACK records per OS.
Parent full148 local142PASS/6FAIL exit1 remains: download/SW restrictions and
four DOM.describeNode/session-closed navigation/retry failures. Unchanged
Playwright1.63 repeats those nine journeys twice,18PASS exit0; cause remains
unattributed. Failed1.62 packaging preparation never changed dependencies.
No clean full local or downgraded-driver claim follows.

RESP-02 and other full type/edition/URI/capacity/reference matrices remain open.
Epic133 stays open, production disabled; licensed exports/Rustici account,
actual Safari/Android and reviewed real production-operation inputs are absent.

References: ADL third/fourth-edition RTE4.2.9.1, sequencing row in Table4.2.9.1a:
https://upload.aura-software.com/files/20191008081839-de8fbb595231f8557780f59e3a0ae316f2a2abbf/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Second-edition runs are bounded compatibility evidence; exact second-edition
reference expansion remains open.
