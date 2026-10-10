# ADR-139: Shared time-out ExitAll binding

Six original regressions fail across three editions: time-out plus Continue
still delivers practice through both the real shared engine and typed server.
ADL RTE4.2.8 requires ExitAll to replace pending navigation when a SCO exits
with time-out, ending the content-organization attempt.

Checksum-locked pear-timeout-exitall-v33 normalizes the termination request to
exitAll before parsing authored choice/jump targets. The authored request remains
unchanged until termination. The existing shared navigation preflight evaluates
that same forced ExitAll for time-out rather than rejecting an overridden choice.
Browser runtime and trusted server replay therefore use the same engine behavior;
transaction/receipt/revision/proof/identity guards remain. Historical v32 envelope
markers and exact installer sources stay supported; no SCORM1.2 byte change.
2004 SHA256:06459750c6d56c132306b08b89814db746915c44be835fab1e4d1ab29c8bf26f.

Original6/6 failed. First focused66/69: three tests looked for suspendedActivity
on the live service summary instead of its serialized sequencing snapshot; fixed
that access while retaining null suspension/session-ended assertions. Final
focused69/69 includes actual historical installation/idempotence/source refusal,
operations and sequencing. Build, final typecheck and three built time-out plus
Continue/lost-ACK/exact-retry browser journeys complete exit0. Fresh full domain782/782 across114 files completed exit0; complete exact-head CI/native/actual Side Panel/review still required.
Domain vectors also override pending choice, SuspendAll and none, with one
accepted receipt and no proof or extra delivered SCO.

ponytail: this closes the named time-out termination/navigation binding. Logout
preflight precedence, every lifecycle/reset/organization-attempt transition,
independent reference traces and full conformance remain OPEN. Parent Windows
consent timeout and its one unchanged retry stay recorded. Epic open; production
disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf (RTE4.2.8 sequencing impacts and additional behavior).
