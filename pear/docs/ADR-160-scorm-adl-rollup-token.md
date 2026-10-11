# ADR-160: ADL rollup consideration XML tokens

Status: implemented; local full browser failure retained; owner-head CI/review pending.

All three SCORM2004 CAM§5.1.11 bind requiredForSatisfied,
requiredForNotSatisfied, requiredForCompleted and requiredForIncomplete to
xs:token. ADL's published schema derives rollupConsiderationType from xs:token;
W3C XML Schema collapse applies. Primary sources reviewed, without copying
reference implementation code or licensed test packages:
- https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_CAM.pdf
- https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_CAM.pdf
- https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_CAM_20090814.pdf
- https://github.com/adlnet/SCORM-2004-4ed-SampleRTE/blob/master/xml/xsd/adlseq_v1p3.xsd
- https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace

Original standalone four-field/three-edition whitespace probe on234d25abdea
retains0PASS/12FAIL exit1. Reuse existing xmlAtomicToken in the one shared
four-field importer loop. Retain exact four vocabularies/omission defaults,
explicit blank/non-XML/internal-space/case/unknown refusal and original XML/ZIP/
hash. Boolean measureSatisfactionIfActive remains unchanged, including existing
true default corresponding to corrected2nd-edition addendum. No ID/string/UI
whitespace or new vocabulary/rollup algorithm changes; full schema/semantic
matrix remains OPEN.

Nine original domain tests cover all four vocabularies across all fields, used/
unused definitions, canonical equivalence and immutable authored bytes, defaults,
all malformed fields, typed exact receipts, SQLite reopen/suspend/resume and
exactly one authoritative rollup proof with no certificate. Existing built
ADL3 and native fixture now import ADL whitespace tokens with existing authority/
absence/type5000/response10000/result4096/large checkpoint/ACK/retry/resume/proof/
clean-shutdown guards retained. No timeout/assertion/retry/policy relaxation.
Focused97 completes97PASS/zero fail/skip/cancel exit0 (20.0s); typecheck/build
exit0. Fresh full958 domain/134files completes958PASS, zero fail/cancel/skip and all
134 file plans/footers/five counts/exit0 inspected; aggregate exit0 received.
Fixed full172 browser now running on this unchanged built tree.

Engine remains pear-interaction-result-decimal-v42;
2004 SHA2560447a677c989ac331f2e883c3e450a04c9366dcf3b5e4b06c5cbb0d5fdb1a62b;
1.2eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642 unchanged.
Actual native2004 controller24/1.2=13 unchanged. Chromium151 supplementary;
expected153 install blocked CDN403. Parent23203cd READY10owner logs940/237/
237/4/native3OS23clean5ACK5/fresh reviews. Parent234d25 CI incomplete: original Windows1.2 fixture cleanup failed after
native exit0/ACKtrue, fixtureForcedtrue/app-closed/no database-closed; cause
unproved, original full log retained. Its focused45/
full949/installer1/built3/native4/typecheck/build PASS and full172170/2 retained
ADR159. Original installer/fixture diagnostics retained. No PR233 assumption:
GitHub assigned result PR234; predecessor is verified at exactd25abdea.
Owner222e2b CI absent; descendant CI cannot replace owner gates.

Full API/DM/time/response/history/sequencing/operations/reference matrices OPEN.
License/authorized authoring exports/Rustici account/actual Safari and Android/
reviewed production inputs BLOCKED. Epic133 OPEN; production DISABLED.

Expanded built ADL3 completes3PASS exit0 (21.0s), supplemental native4 completes
4PASS exit0 (34.8s), including four ADL attributes with unchanged all prior
authority/absence/result/journal/ACK/retry/resume/proof/shutdown checks. Fresh
full958 domain/134files completes958PASS/exit0; fixed full172 browser running. No clean full local or pending PASS claim. Engine hashes unchangedv42.

Predecessor234 exactd25 macOS owner lane completes runtime16/Pear13/1.2=13/
three2004=24, five clean native/fixture exit0 records and ACKtrue, no forced.
Windows original1.2 failure retained; Linux/Pear incomplete, remains Draft.
Next independent shared-target anyURI outer-XML-whitespace probe completes
0PASS/8FAIL exit1 (local+system/four XML whitespace kinds), no product change
in this ADL slice. CAM4th3.4.1.19 and published ADLCP schema agree xs:anyURI;
CAM default writeSharedData=true versus schema=false conflict remains OPEN,
existing false/default permission behavior retained pending resolution.

Parent234 owner Linux also completes runtime16/Pear13/1.2=13/three2004=24,
five clean native/fixture exit0 records/ACKtrue/no forced; complete full log
inspected. Its Windows original forced1.2 failure remains unproved; Pear still
running. This tree full172 running has DOM.describeNode/session-closed failures
(including2004-3 ADL), ServiceWorker denial; original traces inspected and
retained. No clean full claim; final footer/process exit still required.

Fixed source/build full172 browser completes168PASS/4FAIL exit1 (9.5m),
all four failure traces inspected: managed ServiceWorker permission denial;
DOM.describeNode/session-closed during2004-4 retry,2004-2 duration and2004-3
ADL next-SCO delivery. DOM causes unproved; no blanket driver attribution.
All native4 pass in full; ADL2/3 pass here and earlier focused ADL3/3 PASS
retained. Original full failure remains; one unchanged exact-three DOM
diagnostic follows, no clean full/standard Chromium153/native proof claim.

One unchanged exact-three DOM recheck completes3PASS exit0 (17.5s), original
full172168PASS/4FAIL remains retained. This does not prove DOM cause or a clean
full local tree. Final installed source hashes0447a6/1.2eb7539 verified unchanged.
