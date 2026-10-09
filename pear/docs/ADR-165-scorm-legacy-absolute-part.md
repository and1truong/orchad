# ADR-165: second-edition nonempty absolute URI part

Status: implemented; complete local acceptance inspected; owner-head CI/review pending.

RFC2396 Appendix A requires a nonempty hierarchical or opaque part after a
scheme. Original independent probes on unchanged ADR162 tree retain6tests
4PASS/2FAIL and12tests8PASS/4FAIL exit1: raw/facade second edition admits
custom: and custom:#fragment. RFC3986 permits path-empty in third/fourth
editions, which must continue accepting those exact values. Primary sources:
https://www.rfc-editor.org/rfc/rfc2396 (Appendix A)
https://www.rfc-editor.org/rfc/rfc3986 (Section3.3/Appendix A)

Add only a negative lookahead to the two isolated legacy short/long URI
patterns. Retain nonempty opaque/custom:?query, hierarchical/custom:/ and
custom://, percent-escaped fragments, registry authority colon/@ spelling,
relative/query-only policy, exact case/escapes, whole-input/bounds/dependencies,
modern patterns and 1.2 bytes. Full legacy/reference/errata/edition-specific IP
and all URI/error/response matrices remain OPEN; no WHATWG/DNS/port guess.

Checksum-locked forward/reverse adaptation pear-legacy-absolute-part-v43;
2004 SHA2568bd81c6515c2146928a9e3f665e7cf9544214ee2c8bf566da24bf19de4273a47;
1.2 unchanged eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642.
All historical installer pins/reversals preserved, including direct v42 upgrade,
idempotence, unexpected bytes/version refusal and actual installed syntax checks.
Trusted v42 sequencing envelopes retain exact receipt replay and resume.

Nine original domain tests cover three-edition raw/facade URI leaves/collection
IDs/likert response replacement and append, strict preload, typed forged-state
atomic refusal, SQLite reopen/exact retry/v42 resume, original text/entry/location
and no official proof/certificate. Existing built identifiers3 use expanded
shared vectors. Existing native URI guard adds custom:/custom:#fragment refusal
only in second edition (five406 codes rather than three); controller/check
counts remain16/13/13/24/24/25 and every prior guard/assertion remains.

Initial wrong-working-directory edit command failed before mutation; later shell
exit0 masked that diagnostic, never counted as acceptance. First candidate used
String.replace replacement text containing literal $&, which substituted the
matched string and generated checksum-valid malformed JavaScript. Preserve
malformed engine/correction copies outside source, focused1PASS/2SyntaxErrorFAIL
exit1 and typecheck exit0/build exit1 logs. Callback replacement preserves literal
pattern text. Accepted installer and node --check exit0. Corrected focused17PASS/
1FAIL exit1 was a fixture cardinality error: likert permits only one correct
pattern, so appending slot1 correctly returned351 before URI validation. Use a
new valid interaction's empty pattern0 and retain existing-pattern replacement;
product cardinality remains unchanged. Final focused18PASS/zero fail/cancel/skip
exit0 (36.0s), including all predecessor/idempotence/syntax installer checks.
Corrected typecheck/build exit0; final updated-test typecheck follows.

Parent238 own259/run37917819864 READY:10completedSUCCESS/all10latest full logs,
fresh exact head/reviews[] checked;973domain/237dev/237built/SidePanel4 plus
host lanes and allthree OS actual16/13/13/24/24/25/five clean ACK+exit0 each.
Parent237 own ab82 gates READY. Parent239182 own37919418466 pending. Windows
phase intervals include preceding synchronous write overhead; no direct db.close
duration or prior forced-shutdown cause/repair claim. Original failures retained.
Chromium151 supplemental; supported153 install blockedCDN403. Owner222e2b CI
absent remains Draft. License/authorized exports/Rustici account/actual Safari+
Android/reviewed production inputs BLOCKED. Epic133 OPEN; production DISABLED.

Final updated-test typecheck exits0. Targeted built URI3 + supplemental native4
complete7PASS exit0 (47.9s), all previous assertions retained. Fresh full domain
993PASS/138files, all package test filenames matched (completion order varies),
every plan/footer/five counts/individual exit0 and aggregate exit0 inspected.
An initial inspection incorrectly zipped completion-order output against source
order; it refused acceptance without changing/rerunning tests. Correct filename
mapping confirms all files present and complete. Fixed-tree full172 browser
is running; no pending PASS or clean full local/native-platform claim.

Parent239182/run37919418466 now READY: all10completedSUCCESS/latest full logs
and fresh exact-head/review_threads[] checked. Pear984/237dev/237built/SidePanel4
plus host3/browserhost2/realLime/SCORMhost1; actual3OS16/13/13/24/24/25 and five
clean quitACK/native+fixture exit0/no forced each. Parent238 own gates READY.
Mango51PASS/3 paid-accountSKIP remain unavailable-account evidence, not paid
service proof. All original failures retained, no Windows cause/repair claim.
Full local172 still running on fixed source/build/tests.

Exact second-edition RTE/errata retrieval remains unresolved: public viewer
returned HTML/no selected PDF and public index shell fetch returnedHTTP403;
Citeseer primary-document mirror fetch alsoHTTP403. No alternate-access bypass
or exact reference/errata/IP certification claim. RFC2396 AppendixA reg_name
explicitly admits semicolon along with colon/@; do not invent a host-only or
semicolon refusal. No authority patch was made on that unconfirmed suspicion.

Final fixed-tree full172 browser171PASS/1FAIL, process exit1 (9.6m). Sole full
trace and error context inspected: managed ServiceWorker enumeration permission
denied. All changed built identifiers3 and supplemental native4 pass within
full; timestamp3 and prior journeys retain assertions. This run's download
journeys pass; historical download/DOM failures remain preserved/unattributed.
No unrelated rerun to obtain green counts, no source/build/test/timeout/retry/
assertion/policy changes during acceptance. No clean full local/supported153/
actual native owner claim. Final hashes8bd81c/1.2eb7539 verified. Owner-head CI
and review gates remain pending. EpicOPEN/prodDISABLED.
