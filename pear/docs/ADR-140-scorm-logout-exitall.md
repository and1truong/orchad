# ADR-140: Shared logout ExitAll precedence

Six original three-edition regressions fail: a pending navigation preflight can
refuse logout Terminate, and the raw engine leaves its sequencing service
initialized after logout ExitAll. ADL RTE4.2.8 requires ExitAll to replace pending
navigation for logout as well as time-out.

Checksum-locked pear-logout-exitall-v34 extends the shared Terminate
normalization and trusted preflight to logout. The authored request remains
unchanged before termination; normalized ExitAll also invokes existing sequencing
service termination. Continue/choice/SuspendAll/none cannot supersede this exit.
Typed server replay, immutable history, exact receipts and proof/identity/rollback
guards remain. Exact v33 installer bytes and snapshot markers stay compatible;
SCORM1.2 bytes unchanged. 2004 SHA256:
bc4d03187eb829e7b8a9a22e775b2cf2cfe14d7e0815ad24e518522c6500706a.

Original6/6 failed. Focused75/75 includes time-out regressions, actual raw-engine
service termination, every historical installer path/idempotence/source refusal,
operations and sequencing. Build, final typecheck and three built logout plus
disabled-choice/lost-ACK/exact-retry browser journeys completed exit0. Fresh full domain788/788 across115 files completed exit0; complete new-head CI/native/actual Side Panel/review required.
No proof or extra SCO is created; accepted retry preserves the finished record.
The existing upstream data-free logout deprecation warning remains observable;
this change does not claim all logging paths are silent.

ponytail: named exit/navigation precedence is covered. Complete communication,
learner/organization attempt reset/retake semantics and independent reference
traces remain OPEN. Parent #208 heada49cdc8e/run37860684141 attempt2 completed10 jobs with all latest logs/head/reviews inspected, Pear764/192dev/192built/SidePanel4 and native3OS16/13/fourSCORM13/five clean exit0 records per OS. Windows-only unchanged retry passed; the original consent timeout remains unattributed and retained. Epic open; production disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf (RTE4.2.8 sequencing impacts).
