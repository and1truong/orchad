# ADR-148: Refuse checkpoints that cannot be resumed

Original three-edition probe: choice/answer is committed; changing type to
numeric succeeds, and the next checkpoint is accepted at revision2 while
reconstructing the API throws a learner-response type mismatch. The original
three regressions fail before the guard, complete exit1. No accepted historical
state, receipt, sequencing envelope, engine adaptation or proof is rewritten.

Reuse the strict shared engine loader before the synchronous durable queue and
after server typed replay, before sequencing effects or persistence. An
unreloadable snapshot returns Commit false/391 or Terminate false/111 without
queueing; direct checkpoint replay is refused atomically. The live type and
responses stay available. Supplying a numeric response or restoring the prior
type permits another commit, exact retry and close/resume. The server guard
also covers a trusted sequencing runtime's unchanged baseline response, which
ordinary changed-leaf replay previously skipped.

This is a durability guard, not full type-change conformance. RTE4.2.9.1 permits
valid type writes and warns that previously recorded responses can become
invalid under a changed type. We do not make type immutable, clear responses,
coerce values, or relax incoming typed replay. Persisting those retained
responses needs response binding/operation provenance across snapshot,
queue, typed replay, trusted restore and sequencing copies; that internal
implementation remains OPEN. Exact second-edition reference expansion is OPEN.

Final focused3, build, fresh full828/828 across122 domain files and built7
(new recovery3 and supplemental native fixture4) complete exit0. Domain paths
cover sequenced/non-sequenced state, refusal without another queue/receipt/
revision/proof, unchanged accepted receipt, correction and exact resume. The
native fixture adds type-write0/commit391/preserved-response evidence before
recovery; actual Linux/macOS/Windows logs must verify it on the new head.
Full160 browser and exact-head CI/reviews remain required. Chromium is
supplemental; assertions, timeout budgets and managed policies remain intact.

Parent #220 f5047398/run37875587701 completed all10 jobs and all logs: Pear822,
216 dev/216 built/SidePanel4, native three OS runtime16/Pear13/1.2=13/each2004=15,
five clean exit0/ACK records each; READY. Parent #2213812c248 full157 completes
151PASS/6FAIL exit1: five navigation/retry/system-objective journeys include
DOM.describeNode internal/session-closed errors, player Service Worker access
is denied. All capacity6/native fixture4 pass. No driver-cause attribution.

#221 run37876846214 Linux/macOS native runtime16/Pear13/1.2=13/each2004=16 and
five clean exit0/ACK records each complete. Windows2004-2 functional checks,
including large checkpoint preservation, pass, then fixture shutdown stops
after app-closed and requires SIGKILL; earlier runtime/Pear/1.2 complete. This
failure is retained and unattributed; later2004 profiles have no completion
from that attempt. An isolated retry request was rejected by GitHub because
the workflow was still running; no retry PASS is claimed. Earlier preparation
and overflow/build failures remain in ADR-147; the first probe's .ts format
failed before execution, corrected .mts probe reproduced all three cases.

References: third/fourth-edition ADL RTE4.2.9.1 interaction type storage/write
requirements and warning about changing the type:
https://upload.aura-software.com/files/20191008081839-de8fbb595231f8557780f59e3a0ae316f2a2abbf/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Commercial exports/Rustici, actual Safari/Android, exact legacy reference
license/platform and reviewed production storage/scanner/load/retention/RPO/DR
inputs remain absent. Internal conformance matrices remain incomplete.
Epic133 OPEN; production DISABLED.
