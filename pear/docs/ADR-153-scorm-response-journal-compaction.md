# ADR-153: Compact consecutive successful response writes

After ADR-152,5000 successful writes to the same learner_response or correct
pattern followed by a legal type change still overflowed the write journal.
Original three-edition Commit/Terminate regression completes0PASS/12FAIL exit1;
each SetValue succeeded but the initial checkpoint was refused391/111 despite
small final state. The existing compaction condition now also covers successful
writes to the same canonical response path. No intervening type, response,
identifier or other interaction journal entry is crossed. The last value was
validated under the same type; failed writes do not replace a valid entry.
Written origins, exact queue refusal/retry and incremental UTF8 accounting are
preserved. Identifier writes remain uncompressed.4096-entry/2MiB bounds,
server ordered replay, reload guard, receipt/proof/storage schema and v40 engine
source locks are unchanged. General nonconsecutive witness compaction remains OPEN.

Focused24/24 completes PASS exit0. Twelve first-save regressions alternate5000
valid values, reject duplicate choice members without losing the last value,
then retain the original type under numeric and require a four-entry journal,
queue refusal and byte-identical retry for Commit/Terminate. Existing mixed-origin
durable matrix now repeats learner/pattern writes5000 times in each origin and
retains its seven-entry witness, forged intermediate-type deletion refusal,
atomic state/revision/receipt preservation, exact receipt retry and Close/resume.
Quota guards still alternate type/response keys and exceed the genuine ceiling;
all refusal and recovery assertions remain active.

Existing built provenance3 journeys repeat both initial response fields5000
times and retain their five-entry witness, lost ACK/Retry/Close/resume/current-type
correction checks. Native fixture repeats the first sequencing pattern and
learner_response5000 times each before its existing5000 type transitions;
responseHistory count/last-value evidence supplements existing origin, URI,
absence, quota, capacity, authority, official proof and cleanup assertions.
Actual three-OS acceptance must verify runtime16/Pear13/1.2=13/each2004=22 with
five clean native/fixture exit0 and quitACK records perOS on the final head.
Chromium evidence is supplementary; expected153 install remains CDN403 blocked.
Fresh full domain/build/browser and exact-head CI/review gates remain required.

Parent226/head19c4efaf is stacked on corrected225/headb32a9aba without rewriting
history; both exact-head CI runs remain pending. Owner225 original head0ba
Windows shutdown and built resumed-frame click failures remain retained; its
viewport readiness correction passes changed6 locally. Parent226 full local
169PASS/3FAIL remains retained (download timeout, navigation DOM session closed,
managed ServiceWorker denial); no clean full local acceptance claim. Owner222
missing exact-head CI remains a separate blocker. No descendant proof replaces it.

Remaining API/error/URI/reference/URN/UTF8/SPM/type/sequencing/history/operations
matrices remain OPEN. Legacy license/platform, authorized commercial exports,
Rustici account, Safari/Android runners and reviewed production inputs are absent.
Epic133 remains OPEN; production DISABLED.

Fresh full domain completes867/867 across127 files, every footer/plan/exit
checked, no skipped/cancelled cases; final build/typecheck completes exit0.
Focused/full browser and actual current-head CI/review gates remain required.

Expanded focused built19/19 completes PASS exit0: native4/reload3/Close6/
binding3/provenance3, including5000 learner/pattern writes and five-entry
provenance witness. The URI selector matched no file; URI3 are in the existing
scorm-identifiers journey and remain included in the full172 run now underway.
No22-test focused claim; exact-head CI/review remain pending.

Full172 built SCORM browser completes168PASS/4FAIL exit1: support-download
timeout,2004-2 target navigation and same-SCO retry DOM.describeNode/session
closed, managed ServiceWorker permission denial. Logs/traces retained; driver
cause unproved. All expanded response/type-history/provenance3, binding3, URI3,
Close6/reload3/native4 pass. This is not clean full local acceptance; Chromium151
is supplementary and supported153 CDN remains blocked.

Parent225 current b32/run37890454443 and226 current19c4efaf/run37890698928
native Linux/Windows/macOS logs are all inspected: runtime16/Pear13/1.2=13,
2004=20 (225) or21 (226), five clean native/fixture exit0+quitACK records eachOS.
No forced shutdown. Both Pear jobs remain pending; no READY claim. Original225
head0ba Windows failure and local browser failures remain retained/unattributed.
