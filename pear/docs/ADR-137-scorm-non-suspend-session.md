# ADR-137: Fresh non-suspended 2004 SCO sessions

Three original counterexamples returned the finished SCO's location and
suspend_data after normal termination in all supported 2004 editions. ADL RTE
2.1.1.1 and 4.2.7/4.2.8/4.2.23 require a fresh runtime data set for a new
non-suspended learner attempt; historical storage may remain available to the
LMS. Suspend retains data for resumption.

The shared server launch transaction increments the existing SCO attempt ordinal
when a non-sequenced 2004 SCO is finished with normal, logout, time-out or empty
exit. The new row starts with revision/time zero and entry ab-initio; omitted
content fields read empty with403. Finished suspend and unfinished acknowledged
sessions retain their existing row. This technical SCO ordinal does not authorize
an enrollment retake or change official learning bindings. No schema, dependency,
historical rewrite, engine adaptation or SCORM1.2 change.

Original six tests completed3PASS/3FAIL. Nine final domain vectors cover all five
exit values, unfinished recovery, exact receipt retry, closed-token refusal,
unchanged finished history and audit-failure rollback in three editions. One old
completion-threshold test implicitly carried success/score into a finished new
attempt; it now verifies fresh state and supplies that attempt's own success/score,
retaining the original below-threshold no-proof assertion. First focused run
83/84; corrected focused87/87, fresh full domain773/773 across112 files, final
build and three built normal-exit/relaunch browser journeys completed exit0.

Parent #208 retains its original full local browser114PASS/13FAIL. Thirteen fresh
recheck commands completed10 successful/3 failed; one command selected an extra
hidden variant. An additional exact non-hidden learning recheck failed. Download,
non-hidden learning relaunch and service-worker permission failures remain;
separate passing retries do not establish a clean full acceptance run. Windows
run37860684141 failed waiting for the real UI consent response despite heartbeat
responses; attribution and full exact-head CI remain required.

ponytail: only the non-sequenced server launch path is changed. Sequenced
SuspendAll override, time-out ExitAll, the complete lifecycle/retake matrix,
independent reference traces and full conformance remain OPEN. Epic open;
production disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
