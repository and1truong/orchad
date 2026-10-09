# ADR-166: direct native-fixture database close duration

Status: isolated diagnostics implemented and local validation complete; owner CI pending.

ADR162 owner237 Windows successful2004-3/4 app-closed→database-closed cumulative
gaps were3804/3808ms. Those gaps include the preceding synchronous phase write,
so they do not separately measure DatabaseSync.close. Historical forced fixture
failures and unchanged retries remain retained; successful timings establish no
failure cause or product repair.

Measure performance.now immediately after app-closed phase write returns and
immediately before/after the existing f.db.close call. Add its finite numeric
databaseCloseMs to the existing database-closed line; phase prefix/order and
elapsedMs remain exact. The controller emits fixtureDatabaseCloseMs (or null
when a failed close produced no completed measurement), without CMI, launch
capability, credential or database values. No extra logging call, dependency,
product import, SQLite pragma/durability/server/close-order change, suppression,
deadline/retry/assertion relaxation or arbitrary delay. Existing clean-shutdown
predicate/check counts stay unchanged: runtime16/Pear13/1.2=13/2004-2=24/
2004-3=24/2004-4=25. Null/unfinished diagnostics cannot satisfy clean exit0.

Reuse the existing five-fixture real IPC lifecycle test with partial HTTP request:
retain all six phases/monotonic finite elapsed times/exit0/5000ms criteria; require
one completed direct SCORM close measurement, finite/nonnegative and no greater
than its enclosing phase gap plus0.002ms rounding tolerance. Supplemental native4
and fresh full domain/browser/typecheck/build remain required. Actual owner-head
Windows/macOS/Linux logs are necessary before interpreting platform timings.
An unfinished close still has no completed duration and needs separate evidence;
no Node/SQLite/WAL/driver cause is inferred from phase absence or source alone.

Parent2405e9ce258/run37922413556 Draft; legacy v43 local focused18/full993/
138files/built3/native4/typecheck/build PASS, full172171PASS/1FAIL exit1 managed
ServiceWorker denial, sole full trace/context inspected. All original malformed/
build/cardinality/inspector and historical download/DOM failures retained.
Parent237/238/239 READY own10/latest full logs/fresh reviews; owner222 current
e2b CI absent remains Draft. Engine remains v43SHA8bd81c/1.2eb7539 unchanged.
Chromium151 supplemental, supported153 download403; legacy RTE/errata retrieval
unresolved403. Full conformance/production matrices OPEN; license/authorized
exports/Rustici account/actual Safari+Android/reviewed production inputs BLOCKED.
Epic133 OPEN; production DISABLED.

ADR166 typecheck/build exit0; existing five-fixture IPC lifecycle completes
5PASS/zero fail/cancel/skip exit0 (6.7s), with direct-close metadata and all
prior close/partial-HTTP/phase/timing requirements. Supplemental native4 completes
4PASS exit0 (29.4s), preserving every prior assertion and authority/recovery/proof
check. Fresh full993/138files running; full172 follows once domain lifecycle
releases its shared ports. No pending PASS or actual Windows root cause claim.

Reviewed matching actual CI Node24.21.0 source (not inferred from24.0):
https://raw.githubusercontent.com/nodejs/node/v24.21.0/src/node_sqlite.cc
DatabaseSync::Close lines1356–1365 finalizes tracked statements, deletes sessions
and calls sqlite3_close_v2, then checks the return code and clears connection.
This confirms the measured JS call includes those internal operations, not which
operation caused an old failure or a platform gap. Existing WAL/busy_timeout5000
and product database/durability policy stay unchanged. Controller node --check
exit0; no separate controller/platform execution claim before actual CI.

Fresh ADR166 full domain993PASS/138files complete, every exact package filename/
plan/footer/five counts/per-file exit0 and aggregate exit0 inspected. Fixed-tree
full172 SCORM browser running, no pending PASS/clean local/native claim. Matching
Node24.21.0 implementation now reviewed; original forced-failure causes unproved.
Independent language registry requirements reviewed against fourth-edition RTE
4.1.1.7: ISO639-1 two-letter and ISO639-2 bibliographic/terminology three-letter
codes, IANA/private prefixes and undefined additional subcode requirements.
No blanket BCP47/country/current-registry rejection or production patch on this
diagnostic tree; named missing registry vectors remain separate successor work.

Final fixed-tree full172 browser completes169PASS/3FAIL exit1(8.1m). All three
complete traces and error contexts inspected: managed ServiceWorker enumeration
denied; 2004-4 support download60s timeout; 2004-2 interaction-record next-SCO
heading blocked by DOM.describeNode/session-closed error. Last two root causes
remain unproved. Every changed native4 journey passes in the full run; prior
assertions/deadlines/retries/policies unchanged. No clean full local claim.
Parent240 native Linux/macOS/Windows complete on exact5e9 with runtime16/Pear13/
1.2=13/2004-2=24/2004-3=24/2004-4=25 and all five ACK/both exit0/no forced;
Pear CI still running. These parent runs have cumulative phases only, not the
new direct-operation measurement; owner CI is required before READY.
Independent unchanged-parent language probe36tests0PASS/36FAIL exit1 confirms zz
admission in all six writable language paths across raw/facade and three editions.
Official LOC639-2 and IANA factual snapshots prepared separately:190 two-letter
current/historical registrations,506 bibliographic/terminology three-letter facts,
plus qaa-qtz local-use range. Preserve historical aliases/private/undefined extra
subcode policy; no language code changes in this diagnostic slice.
