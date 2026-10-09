# ADR-149: Preserve accepted responses across legal type changes

RTE4.2.9.1 permits changing an interaction type and warns that existing responses
may become invalid under the replacement type. ADR-148 prevented an unreloadable
acknowledged snapshot; it did not yet persist those responses. The original four
regressions fail on10dcee62, complete exit1: three edition durability journeys
and the raw shared engine's stale correct-response type after a type change.

The checksum-locked shared engine adaptation becomes
`pear-response-type-binding-v39` (2004 SHA256
`8bdddcc2d2b129e5541e9f18b46e50353cf72978d591ab9ca98d431876d46f10`).
Changing type now updates existing correct-response objects' validation type
without clearing stored patterns. New writes use the current type; vocabulary,
dependencies, uniqueness, count and typed errors remain enforced. SCORM1.2 is
unchanged. Reviewed v38 and earlier sequencing envelopes remain admitted;
unknown bytes/versions/identity still fail closed. Installer reversibility and
idempotence retain every predecessor source lock.

For unchanged responses already accepted in the previous ordered checkpoint,
derive path→original-type bindings. Record them only in the new accepted receipt
result; retrieve the exact tenant/attempt/SCO/SCO-attempt/revision binding for
bootstrap, trusted sequencing copies and resume. The public checkpoint input
still refuses extra binding metadata. Trusted restoration loads other fields
strictly, validates each preserved string under its recorded type, restores
only validated response values and initialized-presence flags, and retains the
current interaction type for future writes. A replacement response valid under
the current type removes its old binding. No historical receipt, CMI, proof,
schema or sequencing envelope is rewritten or guessed.

Server replay validates changed responses under the current type. Invalid new
or changed nonempty/empty numeric responses are refused atomically. Queue16,
2MiB transport,2048 leaves, typed limits, receipt and64MiB tenant storage bounds
remain. Bindings are host-derived, bounded and included in receipt storage
accounting. A response created then made invalid before its first checkpoint
still returns391/111; ordered validated write provenance is a separate internal
OPEN requirement. Raw unannotated invalid preloads remain strict. Legacy
unannotated blank numeric preload retains its existing unset403 policy; trusted
bound supplied blanks retain initialized0. No immutable-type or silent-clear
policy is introduced.

Draft final focused27 and fresh full832/832 across123 domain files, build and
supplemental native fixture4 complete exit0. Tests include sequenced and
non-sequenced learner/correct responses, nonempty/supplied empty preservation,
exact original and new receipt retries, no extra revision/receipt, close/resume,
new-response/extra-metadata refusal and current-type corrections. Integrated successor fresh full832/832 across123 files and build also complete
exit0. Integrated built16 (new binding3, reload guard3, Close refusal6 and
supplemental native fixture4) complete PASS/exit0; full169 is running. Native fixture
adds resumed type-change Commit/preservation and an acknowledged nonempty
binding receipt; actual three OS must verify2004=18,1.2=13 with clean exit/ACK.
Chromium evidence is supplementary, not actual native acceptance.

Retained preparation failures: initial typecheck used an overly broad base-CMI
type; an installer regression parser included later declarations (18PASS/1FAIL);
expanded empty restoration lost initialized-presence flags (23PASS/3FAIL and
1PASS/3FAIL). Narrow engine typing, exact v39 reversal and restored validated
presence corrected these; final focused27/full832 complete exit0. Original
four failing regressions and all intermediate logs remain retained. Initial
integrated built16 completes13PASS/3FAIL: the wrapper saved a tiny checkpoint
before the fixture authored choice responses, so its saved status did not prove
those responses had been accepted. The fixture now explicitly commits and
checks the choice responses in DB before changing type; final16PASS/exit0.
This keeps first-checkpoint invalid type changes outside the claimed scope. Parent222
Close P1 correction e903caa8 focused13/lifecycle8/confirmed build and fresh
full828 pass exit0; full166 completes162PASS/4FAIL and changed interop readiness5
passes exit0. Owner e2b1dfa9 retains those results; exact-head CI/review remains
pending. One acceptance-document append conflict while merging this owner
correction was resolved by retaining both ADR-148 and ADR-149 evidence.
Historical10dc full160156PASS/4FAIL and all10 CI logs remain in ADR-148.

References: third/fourth-edition ADL RTE4.2.9.1 type storage/write requirements:
https://upload.aura-software.com/files/20191008081839-de8fbb595231f8557780f59e3a0ae316f2a2abbf/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Exact second-edition/reference expansion, first-checkpoint provenance and all
remaining conformance matrices remain OPEN. Legacy license/platform, authorized
commercial exports/Rustici account, actual Safari/Android and reviewed real
storage/scanner/load/retention/RPO/DR inputs remain absent. Epic133 OPEN;
production DISABLED.

Final integrated d738df39 full169 completes165PASS/4FAIL exit1: pipwerks2004-4
download timeout, managed ServiceWorker permission denial and two
DOM.describeNode/session-closed failures remain retained/unattributed. All
binding/reload/Close/native focused journeys pass. Exact-head run37883481084
completes all10SUCCESS and all10 logs are read:832domain/234dev/234built/Side4,
actual Linux/macOS/Windows runtime16/Pear13/SCORM1.2=13/each2004=18, five clean
exit0 and quitACK records each. Fresh head and no unresolved threads verified;
#223 READY. #222 owner e2b1dfa9 remains draft because its exact-head CI is absent,
including after one reversible close/reopen event; descendant CI is not owner CI.
