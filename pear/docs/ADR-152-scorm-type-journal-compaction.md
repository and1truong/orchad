# ADR-152: Compact consecutive successful interaction type writes

ADR-150's4096-write journal limit refused an initial Commit/Terminate after5000
legal consecutive type changes, even though the final response state was small
and had a short validated write witness. Original regressions complete0PASS/
6FAIL exit1 across three editions and both methods. SetValue continued to
succeed and stored responses remained present; the later checkpoint failed.

Within the successful-write journal, replace the last entry when it writes the
same canonical interaction type path. Only the last type affects stored state
and correct-response validation context. A response, identifier, another
interaction's type or any other journal entry separates histories and prevents
folding across it. Failed type writes are never journaled. Retained response
origins still come from their successful typed write, not the last type.
Incremental UTF8 byte accounting subtracts the replaced tuple before adding its
successor. The4096-entry/2MiB journal, combined transport bounds, snapshot reload
guard, strict ordered server replay and receipt/storage limits remain unchanged.
Other histories remain bounded; general validated witness compaction is OPEN.
No engine adaptation/source checksum, receipt/proof schema or historical state
changes are introduced. The previous v40 edition bindings remain active.

Basic6 regressions now complete PASS/exit0. Initial focused15, final expanded18
(new9, quota guards3, existing first-provenance6), typecheck/build complete
PASS/exit0. New durable matrix covers sequenced/non-sequenced Commit/Terminate,
queue refusal then exact retry, response writes between different types,
duplicate sequencing members invalid under choice, rejected type writes,
forged deletion of the intermediate type, unchanged state/revision/receipt on
refusal, exact accepted receipt retry, trusted mixed-origin restoration and
Close/resume with zero official proof. An unchanged final response history of
5000 consecutive type writes now needs five entries; mixed-origin response
writes remain ordered in a seven-entry witness.

Retained intermediate0PASS/3FAIL: the previous quota regressions repeated only
type writes, which now legitimately compact. The quota fixtures instead place
successful response writes between types. They still exceed the real4096-entry
limit and require unchanged391/111, no queue/data loss, server atomic refusal,
authenticated Close refusal and correction/Retry/resume. The assertions and
budgets are not relaxed. Original failing logs remain preserved.

The existing built provenance3 journeys now perform5000 legal type transitions
before the first response checkpoint, require a five-entry journal, then retain
their lost-ACK/exact retry/receipt count/Close/resume/current-type correction
checks. Native fixture does the same with its existing ordered response set,
records only journal length/count evidence and preserves all URI/absent/unset/
quota/capacity/authority/proof/cleanup checks. Actual native three-OS acceptance
must verify2004=21 and1.2=13 with five clean exit0 and quitACK records perOS on
the final head. Chromium evidence is supplementary. Final focused built browser completes22/22
PASS exit0, including URI3/native4/Close6/reload3/binding3/provenance3. Fresh full
domain completes855/855 across126 files, every file footer/plan/exit checked.
Full172 browser and exact-head CI/review gates remain required.

Parent225/head0ba183c7/run37888472163 attempt1 Windows113683752681 fails the1.2
fixture clean-shutdown assertion after app-closed, before database-closed:
native exit0/quitACK true, fixture forced;2004 profiles not run. Pre-shutdown
checks pass; cause unproved. Original log retained; parent stays draft while
other jobs finish and any unchanged Windows retry awaits run completion.
Parent224/head72c2072f is READY only after latest-attempt all10 SUCCESS/logs and
fresh head/review checks; its original Windows failure and full local166PASS/
6FAIL remain retained. Parent225 full local170PASS/2FAIL and blocked supported
Chromium install are retained in ADR-151. Missing owner222 exact-head CI remains
a separate blocker; descendant results do not replace it.

Remaining legacy/contemporary URI reference/URN/UTF8/equivalence/dependency,
API/error/type/SPM/sequencing/history/operations matrices remain OPEN. External
legacy license/platform, authorized exports/Rustici account, Safari/Android and
reviewed production inputs remain absent. Epic133 OPEN; production DISABLED.


Full172 SCORM built browser completes169PASS/3FAIL exit1: support download
timeout,2004-2 target navigation DOM.describeNode/session-closed, and managed
ServiceWorker permission denial. All changed provenance/type-history3, binding3,
URI3, reload3, Close6 and supplemental native4 journeys pass. Full logs/traces
retained; no clean full local acceptance or proved driver cause. Supported
Chromium153 installation remains blocked by CDN403. Fresh domain855/126 files,
final build, focused18 and built22 complete PASS exit0. Parent225 head0ba also
fails built response correction after resume (846 domain/237 dev pass;
236 built pass/1fail, Side Panel/host not reached); its viewport correction is
being validated at its owner before integration. Windows shutdown cause remains
unproved. General successful response histories remain OPEN: an independent
original5000 consecutive learner/pattern-write regression across three editions
and Commit/Terminate completes0PASS/12FAIL exit1, preserved for a successor.

Integrated owner225 viewport correction b32a9aba without rewriting either
history: documentation conflicts retain both evidence blocks. Changed built
binding/provenance6 completes PASS exit0 under CI30second test budget, including
5000-type compaction plus lost ACK/Retry/Close/resume/current-type correction.
Parent225 new-head run37890454443 is pending; historical0ba failures remain.
