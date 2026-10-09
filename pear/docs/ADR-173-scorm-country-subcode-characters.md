# ADR-173: First country subcode character binding

Unchanged v48 admits en-11/FRE-1a/qaa-a1 across six fields/raw+facade/three
editions: original108tests0PASS/108FAIL exit1 after valid registered-country,
registered numeric-three-character region, private/i and undefined later
subcode controls. Existing first-country membership lookahead only examined
alphabetic pairs, so mixed/digit pairs bypassed the shared ISO alpha2 guard.

ADL third/fourth RTE4.1.1.7 and RFC3066 section2.2 require first ordinary
subcodes of two characters to be ISO3166 alpha2 countries. Second addendum1.2
section2.9 references RFC3066; exact original legacy RTE/all errata unresolved.
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_2004_Addendum1.pdf
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2

One exact forward/reverse changes [a-zA-Z]{2} to [a-zA-Z0-9]{2} only in the
existing shared first-country negative lookahead. No new registry/profile
or dependency. All620 two-character ASCII alphanumeric pairs containing at
least one digit (36^2-26^2) now undergo the same assigned-country membership.
Preserve country249+11 historical profile/case, i/x and undefined later
subcodes (en-US-11/en-US-a1), registered numeric3-region en-001/FRE-419,
all captures/capacity/blank bindings and SCORM1.2. No preferred-value rewrite.

Separate candidate9360 positive/22320 atomic negative writes across620pairs,
three primary spellings/all6fields/two actual constructors completed exit0;
syntax and single exact reverse to v48 checked. Candidate is not accepted
full proof. v49 pear-country-subcode-characters-v49 SHA256
5213c4f81ce9d1e252c140a004faba1c7f615910ba781cbfdd81814547815a5b;
reverse restores v48 173633c973ab69464aba8afd36c615bc9e9e23d0b520037a2859cf732258865a;
SCORM1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Actual installer v48 input/all older reverse pins/idempotence/
unknown-byte refusal and trusted v48 envelope resume retained.

Nine new domain cases exercise all620 pairs/three primary spellings/six fields/
raw+facade/three editions with whole-state406 refusal, plus30 representative
preload/readonly LMS/forged typed rollback cases per field, unchanged receipt/
audit/history/SQLite reopen/v48 numeric-region exact resume/no proof/certificate.
Bounded representatives cover both digit positions, endpoints and uppercase;
not an exhaustive typed/preload matrix. Existing built3 adds all620 refusals
in six fields and valid numeric/private/later controls; original dialect/
historical-country/IANA strings and ACK/retry/resume/capacity/proof guards
unchanged. Native620 refusals follow valid controls then original I-MINGO
restoration; one genuine named check raises2004 counts30/30/31, all other
native guards unchanged. Own OS evidence required; not a commercial export.

Initial accepted new9:6PASS/3FAIL exit1(33.1s); fixture copied-marker replacement
accidentally used nonexistent pear-country-characters-registry-v48. All three
full failures inspected: trustedSequencing correctly refused unknown identity.
Fixture corrected to real pear-iana-subcode-registry-v48, no assertion or product
trust relaxation. Original/candidate/intermediate logs retained. Initial editor
wrong cwd failed before writes; corrected editor later stopped at mismatched
native source anchor after product changes, resumed against actual anchor;
installer matched expected hash. Nonexistent typecheck:host command exit1,
actual typecheck/build completed exit0; accepted focused/full/browser pending.

Parent247 Draft019726 own run37940391505 pending; completed localfull1074/143,
f126/build/typecheck/built3/native4 PASS; fixed172165PASS/7FAIL exit1/all traces
read, DOM.describeNode/session-closed cause unproved and managed ServiceWorker
denied. Parent246 original Windows fourth shutdown failure retained/no cause
claim; initial retry403 while running, one unchanged retry accepted afterrun
completed, pending. Other nine original jobs full logs1065/237/237/4/n28/28/29
PASS. Parent245 and PR222 actual-head READY gates retained. Prefix/whole-tag/
equivalence/first-one-character/SPM/legacy matrices OPEN; licenses/exports/
Rustici account/actual Safari+Android/reviewed production inputs BLOCKED.
Chromium151 supplemental/supported153 CDN403. Epic133 OPEN, production DISABLED.

Accepted focused110PASS/zero fail/cancel/skip exit0(267.4s), actual typecheck/
build exit0 and supplemental built3/native4 completed7PASS exit0(41.8s).
Fresh full1083PASS/144files aggregate exit0; every exact filename/plan/full
footer/five counts/per-file exit inspected. Fixed172 fullbrowser now running
on frozen product/test tree after lifecycle finished; no pending PASS.
Parent246f335 READY: latest own37936681321 all10 completed SUCCESS/latest full
logs/fresh reviews0 unresolved. One unchanged Windowsretry113851854434 passed
16/13/13/28/28/29/five clean closes/fourSCORMsixphases/finite direct DBduration;
original fourth forced/null/noDBduration failure retained/cause unproved.
Independent unchanged-v49 mandatory250 interaction x10objective IDs original
3tests0PASS/3FAIL exit1(3.5s) at141032bytes: server2048-leaf quota rejects legal
combination. ADL third/fourth RTE4.1.1.4/4.2.9 reviewed; exactlegacy RTE remains
unresolved. Separate candidate prepared outside acceptedtree for successor;
no accepted SPM fix or exhaustive/certification claim. EpicOPEN/prodDISABLED.

Fixed full172 completed170PASS/2FAIL exit1(6.7m); both complete traces/network/
contexts inspected, changed built3/native4 sevenPASS in full. Player ServiceWorker
enumeration denied by managed environment; third retry heading DOM.describeNode/
session closed (plus retained intercepted expected2/received1 intermediate event)
cause unproved. No unrelated rerun/assertion/deadline relaxation/clean local full
browser claim. Parent247 own9/10/native3OS16/13/13/29/29/30 clean5/sixphases/
finite directDBduration PASS/full logs inspected; Pear still pending.
Separate SPM candidate initially .ts module-loading constructor error retained;
corrected outside .mts probe completed three profiles2500objectiveIDs plus five
unchanged authority/byte/ordinary-leaf/type/unknown refusals. Expanded candidate
all7000 interaction fields (250x8 scalars/10objectives/10patterns) exact accepted
at262759bytes in each edition, exit0; all15 negative controls retained. Additional
mixed response-origin journal candidate remains separate/pending, no accepted
product change here. Current engine v49 pins and factual JSON unchanged.
