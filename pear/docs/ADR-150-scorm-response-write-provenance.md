# ADR-150: Replay first-checkpoint interaction write provenance

ADR-149 preserved responses already accepted by an earlier checkpoint. A SCO
could also legally write choice responses, change type to numeric and then
Commit for the first time. Original three edition regressions fail on d738df39,
complete exit1. Do not infer an origin type from untrusted metadata or prohibit
the valid type change.

The synchronous facade retains successful ordered interaction ID/type/learner/
correct-response writes. If a retained response's origin cannot be explained
by the prior queued checkpoint, attach that bounded journal to the checkpoint.
Derive local bindings from actual successful setters; server replay independently
executes every journal entry through the strict engine, checks each touched
field against the final snapshot, and derives the original-type binding itself.
Then normal typed replay, reload/presence guard, trusted navigation and atomic
persistence proceed. New receipt bindings come from validated replay output.
Arbitrary origin metadata, unknown/read-only paths, invalid dependencies/types,
mismatched snapshots and malformed/oversized journals remain refused.

Only SCORM2004 communicating SCO checkpoints admit optional interactionWrites.
1.2 and assets keep their strict keys. The eight-method public API remains the
same; no engine source/adaptation, schema, historical CMI/receipt/proof rewrite.
The queue clones writes and retains the exact request for lost-ACK retry. Queue
refusal leaves the journal/baseline/live data intact. Successful queue acceptance
advances the baseline and clears that journal; ordinary valid snapshots and
already accepted response bindings need no journal.

The deliberate journal ceiling is4096 successful writes/2MiB; combined state,
shared data and journal still fit the existing2MiB queue/server transport bound.
An overflow cannot silently drop provenance: Commit391/Terminate111 preserve
live data and Close recovery. Correcting responses for the current type permits
another commit without the oversized journal. Larger repeated-write workloads
need validated journal compaction; full simultaneous SPM/history combinations
remain OPEN. Existing queue16/2048-leaf/receipt/64MiB tenant bounds remain.

Final focused10, three first-Terminate sequencing/receipt/resume probes, final
typecheck/build and built19 complete PASS/exit0. Fresh full838/838 across124
domain files (including three durable Terminate regressions) completes exit0. The new three
built journeys prove first-response/type ordering, accepted journal, lost ACK,
exact retry, Close/resume and current-type correction. Six Close refusal and
three reload guards now exercise a real oversized journal; no assertion/budget
relaxation. Supplemental native fixture4 also verifies a first-checkpoint
response/type journal and accepted receipt through resume, keeping all existing
read/ordered/capacity/authority/proof/clean-shutdown checks. Actual three OS must
verify2004=19,1.2=13 on the final head. Full172 browser/current-head CI/review are
required; Chromium is supplementary.

Retained intermediate failures: initial scripted edit passed writtenOrigins to
the loader before declaration and inferred an overly narrow reduce type:
typecheck exit1 and focused1PASS/9FAIL. Corrected source completed7PASS/3FAIL
because the old guards still expected newly supported legal type changes to
fail; bounded-journal refusal cases now pass, final focused10. First full835
domain completed832PASS/3FAIL exit1: lifecycle fixtures4310/4316 collided with
the simultaneously running browser fixture (EADDRINUSE). Browser19 completed
exit0; a separate fresh-cache full domain now runs after browser completion.
That separate fresh full835/835 across124 files completes exit0; after adding
three Terminate regressions, another fresh full838/838 completes exit0. The
original EADDRINUSE failure remains retained. Full172 browser is now running.

Parent223 d738/run37883481084: focused27/full832/build/built16 pass; full169
165PASS/4FAIL exit1 (interop2004-4 download timeout, target2004-4/retry2004-2
DOM.describeNode/session closure and managed Service Worker denial). All binding3/
guard3/Close refusal6/native fixture4 pass in full. Actual Linux/macOS/Windows
logs verify16/13/1.2=13/each2004=18 plus five clean exit0/quit ACK pairs per OS;
Pear832/234dev/234built/SidePanel4 completes; all10 jobs/logs verified, fresh
head/empty unresolved review threads checked, parent223 READY. Parent222 e2b stays Draft: no current workflow/check run
appeared after one close/reopen event replay; review P1 resolved, original and
full166162PASS/4FAIL retained. Historical10dc all10 CI logs remain verified.

References remain ADL third/fourth-edition RTE4.2.9.1 type storage/write rules,
linked in ADR-149. Full edition/type/sequence/URI/SPM/operations matrices remain
OPEN. Legacy license/platform, authorized commercial exports/Rustici account,
actual Safari/Android and reviewed real storage/scanner/load/retention/RPO/DR
inputs remain absent. Epic133 OPEN; production DISABLED.

Head72c2072f full172 completes166PASS/6FAIL exit1: pipwerks2004-4 download
timeout, managed ServiceWorker permission denial and four DOM.describeNode/
session-closed failures (2004-3 retry/retryAll,2004-4 duration/shared) remain
retained/unattributed. New provenance3/binding3/guard3/Close6/native4 all pass.
Run37885369934 attempt1 completes nine successful jobs; all ten job logs read.
Pear838domain/237dev/237built/Side4, actual Linux/macOS runtime16/Pear13/
SCORM1.2=13/each2004=19 with five clean exit0 and quitACK records each. Windows
2004-3 passes its18 pre-shutdown checks but fixture stalls after app-closed,
before database-closed, then is forced (native exit0/quitACK true);2004-4 did
not run. Original failure retained and cause unproved. A Windows-only rerun on
unchanged head was accepted after run completion; first request while Pear
was running returned GitHub403 already-running. #224 remains draft pending
completed exact-head retry/log/review gates.

Final head72c2072f/run37885369934 attempt2 completes all10SUCCESS/all10 latest
attempt logs inspected (nine retain original timestamps; only Windows reruns).
Unchanged Windows retry113679323066 passes runtime16/Pear13/1.2=13/each2004=19,
clean native/fixture exit0 and quitACK five times without forced shutdown.
Linux/macOS also clean5/ACK5; Pear838/237dev/237built/Side4 and host3/
browser-host2/Lime-host1 pass. Original Windows fixture failure retained/
unattributed. Fresh exact head and no unresolved review threads verified before
#224 READY; no clean full local acceptance or completed epic/production claim.
