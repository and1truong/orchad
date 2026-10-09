# ADR-158: XML dateTime and duration whitespace import binding

Status: implemented; local acceptance inspected; owner-head CI/review pending.

IMS Simple Sequencing XML Binding1.0§3.5/table4.1 binds begin/end limits to
XML dateTime and four attempt/activity limits to XML duration. W3C XML Schema
Part2§4.3.6 requires collapse for these atomic types. Sources:
- https://www.imsglobal.org/node/52631
- https://www.w3.org/TR/xmlschema-2/#dateTime
- https://www.w3.org/TR/xmlschema-2/#duration
- https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace

Original three-edition dateTime/duration whitespace probes retain0PASS/6FAIL
(scorm-xml-time-whitespace-before.log on parent2317d214637). Reuse the existing
XML atomic-token normalizer in the two shared importer paths. Remove only outer
XML whitespace before the unchanged dateTime/duration validators. Internal and
non-XML spaces remain invalid; preserve explicit timezone/Gregorian/hour24/
three-fractional-digit date profile, interval order, nonnegative day/time/
centisecond duration grammar and3660-day ceiling. Full XML calendar year/month/
negative/finer-precision/delivery-reference semantics remain OPEN; this slice
neither widens the profile nor changes authoritative clock accounting.

Original XML/ZIP/hash and all CMI/receipt/history/proof/identity/quota boundaries
remain exact. Source adaptation stays pear-decimal-capacity-v41, ESM SHA256
6d9a5a3b33f911fcc447c8edf475022e22b07bb34166122e376d1b1ff32df086;1.2 unchanged.
Nine original domain tests cover all six fields, canonical semantic equivalence,
immutable bytes/hash, valid used/unused groups, malformed/non-XML values,
Gregorian/timezone/order/duration precision/quotas, real host clock instead of
reported session time, exact ACK retry and SQLite resume/expiry refusal.

Initial focused35 completes32PASS/3FAIL, initial full940/132files completes
937PASS/3FAIL exit1. The three failures are a new fixture expectation: retrying
a closed launch capability after database reopen. The unchanged server correctly
refuses Launch closed or expired. Retain the product authority guard; the fixed
fixture asserts that refusal and the exact retained receipt, plus pre-close
exact retry, bookmark/entry and trusted absolute7000ms/experienced2000ms resume
and expiry denial without new launch/receipt/proof. Original full/focused logs
remain; a corrected standalone9PASS exit0 probe is diagnostic, not final-suite
acceptance. The final committed-test focused/full results follow below.

Existing built calendar3/duration3 journeys import whitespace-authored limits
while preserving lost ACK/exact retry/Close/resume/navigation/time/proof checks.
Actual native fixture now imports the same six time fields: calendar2000–2099
and authored3600-second limits, within the unchanged profile. This is fixture
author data, not an increased test deadline. Native23/1.2=13 guards, clean
shutdown/authority/provenance/absence/receipt checks and host clock stay required.
Chromium151 checks remain supplementary; expected153 install blocked CDN403.
No policy/assertion/retry/deadline relaxation or clean full local claim.

Parent229c3b is READY: current-owner10/logs910/237/237/4/native22, after one
unchanged Windows retry, original forced shutdown retained/unproved. Parent2306ec
is READY: all10 current-owner logs inspected, Pear919/237/237/4 plus host lanes,
native Windows/macOS/Linux each16/13/13/23/23/23, five clean exit0/ACKs and fresh
review threads empty. Parent2317d completes9SUCCESS/WindowsFAIL:2004-2 fixture
forced after app-closed with no database-closed phase, nativeExit0/quit ACK;
cause unproved. One unchanged Windows-only retry is running; original retained.
Owner222e2b CI remains absent;
descendant CI cannot replace owner gates. Full mandatory API/DM/response/URI/
history/sequencing/operations/reference matrices remain OPEN; license/authorized
exports/Rustici account/actual Safari and Android/production inputs BLOCKED.
Epic133 OPEN; production DISABLED.

Final committed-test focused35 completes35PASS/zero fail/skip/cancel exit0
(16.7s). Fresh-cache full domain940/132files completes all per-file plans/
footers/five counts/exits and aggregate exit0, with the product closed-capability
guard retained. Expanded built calendar3/duration3 completes6PASS exit0 (31.6s);
build/typecheck exit0. Final supplemental native4 and final typecheck exit0;
full172 results follow on fixed source/build. Original32/3 and937/3 remain separate;
no failure or historical acceptance is overwritten.

Final supplemental native4 completes PASS exit0 (31.3s), preserving all
authority/absence/provenance/long decimal/ACK/retry/resume/proof/shutdown checks
with all six time fields admitted. Final typecheck exit0; build source remains
fixed v41. Fixed-source/build full172 SCORM browser completes168PASS/4FAIL exit1
(8.2m), with every failure trace inspected:4th asset and2nd retryAll report
DOM.describeNode/session closed,4th support download exceeds60s, managed
ServiceWorker enumeration is permission-denied. DOM and download causes remain
unproved. All six changed calendar/duration journeys and native4 pass in full.
Original full log and four traces remain; no clean full local claim.

One unchanged DOM-only recheck completes1PASS/1FAIL exit1 (12.9s):2nd retryAll
passes,4th asset again reports DOM.describeNode/session closed; its trace is
inspected and retained. No additional retry or diagnosed-cause claim.
Successor internal interaction-result probe retains0PASS/6FAIL on this v41 tree:
all three editions, raw engine and facade, refuse finite exact half padded to
41 fractional digits; numeric learner response and range endpoints pass first.
The result fractional cap is not changed in this importer-only slice.
