# ADR-142: Shared interaction ID replacement

Six original vectors fail: a valid replacement cmi.interactions.n.id returns
351 because the engine applies objective-ID immutability to interaction IDs.
RTE4.2.9 recommends avoiding interaction-ID changes but permits valid writes.
RTE4.2.17 explicitly refuses a changed objective ID; that guard remains.

Checksum-locked pear-interaction-id-v35 removes only the interaction setter's
replacement refusal and corrects its comment. URI/type/packed-index/dependency
validation remains in the shared engine for facade, preload and server replay.
Tracked type, responses, objective references, descriptions, count and prior
receipts remain unchanged; invalid replacements return406 without mutation.
The installer upgrades exact v34 and every historical path and rejects unknown
bytes. Snapshot identity gates admit the exact v34 marker; no schema, SCORM1.2
or history rewrite. 2004 SHA256:
ca2588b34c137ee832c2b58cadde4ad5c6260286c3fe5ce0e25470f55b40dc31.

Original six regressions complete6FAIL. Draft focused39 initially36PASS/3FAIL
from the earlier interaction-immutability assertions, then39PASS; owner draft
build and three URI/replacement/lost-ACK/resume journeys complete exit0. First
integrated full domain799/803 retains three more old assertions and one old
checksum failure. The added compatibility check initially forgot async package
inspection (build/focused failure), then compared serialization timestamps at
different instants (full803/804 and focused63/64). It now compares both restored
snapshots under the same controlled Date clock, preserving full-state equality
and wrong-attempt/unknown-marker refusal; focused seven cases complete exit0.
Fresh final full domain804/804 across118 files, typecheck and focused64/64
complete exit0; no skipped/cancelled domain or focused tests.

Integrated build and nine browser journeys complete exit0. First8/9 retained a
premature Close observation; owner #215 fixes it by waiting for Close control
removal before unchanged DB/history/receipt/proof assertions. Exact owner v34
build/built3 pass, and its commit98a7bff0 is the current stacked base.
Parent full browser145:134PASS/11FAIL and sequential recheck9:7PASS/2FAIL remain
recorded in ADR-141. Diagnostic message observation passes the remaining two
sequencing cases but does not establish their cause or a clean full suite.

ponytail: this closes named interaction replacement, not complete URI/identifier
or lifecycle conformance. Current-head full CI/native/Side Panel/reviews remain
required. Licensed exports, Rustici account, actual Safari/Android and reviewed
deployment/storage/scanner/recovery evidence stay missing. Epic open; production
disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf (RTE4.2.9,4.2.17).
