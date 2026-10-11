# ADR-168: shared registered IANA i-prefix binding

Status: implemented; local validation complete with full-browser failures retained; own exact-head CI pending.
Epic #133; stacked on PR242 exact9dd6b2b4 (ADR167/v44).
Original unchanged-v44 six-field/raw+facade/three-edition36 tests0PASS/36FAIL
exit1 retained: valid i-klingon controls pass before unregistered i-madeup is
incorrectly accepted. No external license/account blocker inferred for this bug.

RFC3066 §2.2 and reviewed ADL 2004 language type requirements reserve i for
IANA registrations. Require a registered first i-subcode in the shared installed
primary token, serving CMILang and all five localized regexes. Refuse bare i and
i-madeup/i-klignon/I-UNKNOWN with406. Preserve all13 historical registrations,
including deprecated values, uppercase and exact authored bytes; no preferred-
value rewriting. Additional subcodes and private x keep ADR115 lexical policy.
No new runtime registry fetch/dependency, capture change, capacity change or
blank preference/localized delimiter relaxation. SCORM1.2 remains unchanged.

Factual IANA registry File-Date2026-09-17, retrieved/reviewed2026-10-09:
https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
Complete contiguous historical i-prefix section reviewed: i-ami/i-bnn/i-default/
i-enochian/i-hak/i-klingon/i-lux/i-mingo/i-navajo/i-pwn/i-tao/i-tay/i-tsu.
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2
ADL third RTE1.0 §4.1.1.7/fourth RTE1.1 §4.1.1.7 and second addendum1.2 §2.9
reviewed in ADR167; exact original second-edition RTE PDF remains unresolved.
Country/subcode registration/equivalence, undefined later-subcode requirements,
simultaneous SPM and exhaustive edition matrices remain OPEN.

Checksum-locked pear-iana-language-prefix-v45 SCORM2004 ESM SHA256
62d0e92379a86ba6cad924e0cc40f28065970b0d0a6f373256ce8fb20333d151;
SCORM1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Single exact forward/reverse pair returns v44 a8a7d45a; all old pins
and direct installer historical inputs/idempotence/unknown-byte/version refusal
retained. Trusted v44 envelopes remain accepted; invalid states fail closed.
Previous ADR167 bare-i positive becomes refused by this explicit stronger binding;
old historical validation is preserved, not claimed unchanged.

Nine new domain tests cover all13 registrations across all six fields/raw+facade/
three editions, uppercase extra subcodes and private x; strict preload including
read-only LMS comments; typed forged all-six-field rollback/exact retry/SQLite
close-reopen/v44 resume/exact text/no official proof or certificate. Existing
1220 ISO facts and historical code checks retained. Built3 keeps prior capacity/
empty/lost ACK/receipt/close-resume/proof assertions and checks stored/resumed
historical IANA localized strings. Native fixture keeps qtz/SCC and old301/403
absence checks, adding interaction0 description I-MINGO without setting type;
four406 refusals and exact resume. One real named native check changes counts to
16/13/13/26/26/27. Actual three-platform owner CI required before native PASS.

Typecheck completed exit0; installer/controller/engine syntax and exact hashes
verified. Focused/build/browser/full domain running or pending: no incomplete
PASS claim. Parent242 exact-head run37928444356 pending; parent241 READY with
own10/latest full logs/fresh reviews. #222e2b ownCI absent/Draft; historical10dc
is not current proof. Local Chromium151 is supplemental; supported153 CDN403.
License/authorized exports/Rustici account/actual Safari+Android/reviewed prod
inputs BLOCKED. Epic OPEN; production DISABLED.

Local accepted v45: focused99PASS/zero fail/cancel/skip exit0(57.2s), typecheck/build exit0 and separate built3/native4 7PASS exit0(34.0s), retaining every original guard. Fresh full domain and fixed full172 browser remain pending until completed counts/exits/traces are inspected. Factual repository JSON SHA2567e3f3fe3397df67468ea0c019e1d53ebf7c756b685c0e891a70da9d2e68b3524 (not network original-byte hash).

Fresh full accepted v45 domain1047PASS/140files aggregate exit0 completed. Every exact package filename, plan, full footer/five counts and individual exit0 verified by filename mapping, zero fail/cancel/skip. Fixed full172 browser still running; no pending browser PASS. Independent successor reserved-country original six-field36tests0PASS/36FAIL plus six boundary-code raw/facade/three-edition36tests0PASS/36FAIL exit1 retained (AA/QM/QZ/XA/XZ/ZZ). Valid country/private/IANA/additional-subcode controls passed first. RFC3066 explicit42 user-assigned codes reviewed; separate candidate exact forward/reverse bytes/syntax checked, not accepted-tree or full-validation proof.

Final local accepted v45 full172 browser170PASS/2FAIL exit1(7.7m), complete footer inspected. Both complete trace/network streams and full error contexts read: fourth-edition support download60s timeout (cause unproved) and managed ServiceWorker enumeration denial. All changed built3/native4 pass within full; no unrelated rerun, assertion/deadline/policy relaxation or clean full local browser claim. Current1038 successor full1047/140files, focused99, typecheck/build and separate7 completed PASS/exit0 as recorded above. Own PR/head CI/reviews remain pending. Parent242run37928444356 now9/10SUCCESS: all three actual native OS complete16/13/13/25/25/26 with five clean ACK/both exit0/no forced each; latest full native logs inspected, Pear still running. No READY until owner10/latest full logs/fresh reviews.
