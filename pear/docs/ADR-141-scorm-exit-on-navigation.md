# ADR-141: Acknowledged exit when the LMS removes a SCO

Three original vectors fail: Commit acknowledges time-out/logout, but human
close or a replacement launch leaves the current sequenced activity active.
RTE4.2.8 also requires the organization attempt to end when the learner navigates
away, even when the SCO did not report Terminate.

The existing transactional removal paths load the acknowledged CMI into the
trusted engine and apply its v34 ExitAll handling before saving sequencing.
A replacement creates a fresh API communication session from that saved tree.
Non-sequenced time-out/logout also starts a new technical SCO ordinal on removal.
Other unfinished exit recovery retains its existing behavior. The old CMI row,
finished flag, time, revision and exact receipt remain history; the LMS does not
fabricate a SCO Terminate checkpoint or completion proof. Close remains idempotent.
An audit failure rolls back sequencing, history and launch capability together.
No engine adaptation, schema or SCORM1.2 change.

Original3FAIL; first focused88 completes82PASS/6FAIL. Three replacement cases
needed a fresh communication engine after ExitAll; three earlier non-sequenced
tests incorrectly expected logout/time-out to survive explicit navigation away.
The corrected focused88 and final focused91 complete exit0 with fault rollback
and unchanged receipt/proof assertions. Build and three built close journeys
complete exit0. Fresh integrated full domain797/797 across117 files, build and
six built navigation/P1 resume journeys complete exit0. Full local SCORM browser
acceptance145 completes134PASS/11FAIL, exit1, with original traces retained.
Four session-time failures are EADDRINUSE from a concurrent draft-worktree
browser run sharing4346/4347; five sequencing practice-delivery failures remain
unattributed; certificate download timeout and managed Service Worker permission
refusal recur. Sequential nine-case recheck completes7PASS/2FAIL, exit1;
all four session-time cases pass. Interaction-records2004-3 and duration2004-4
still miss practice delivery after retry. A retained interaction trace shows the
server accepted Terminate and returned nextScoId=practice, but no browser status
lookup/replacement launch followed the manual retry. Cause remains unresolved.
No clean full local browser acceptance claim.

The PR inherits #210's lost resume-launch response correction through normal
merges into #211 and #213. Original parent heads' CI runs37863187804 and
37863702885 completed all10 jobs and all logs were inspected: domain782/788,
dev+built201/204 respectively; actual Side Panel4; each native OS16/13/four
SCORM13 and five clean exit0 shutdown records. These historical runs do not
cover the propagated review correction or this change. Exact new-head full
CI/native/Side Panel/review gates remain required.

ponytail: only acknowledged time-out/logout removal is covered. Full lifecycle,
organization reset/attempt matrices, reference differential and production
acceptance stay OPEN. Actual Safari/Android runners, licensed authoring exports,
Rustici account and reviewed deployment/storage/scanner/recovery inputs remain
external blockers; production disabled and epic open.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf (RTE4.2.8).

## Close completion observation

A descendant integrated v35 browser run completes8/9 with one premature state
read: Introduction is already visible before Close finishes. The test now waits
for the Close control to disappear before reading its trusted sequencing state;
all prior CMI/history/receipt/no-proof assertions and timeout budgets remain.
Exact owner v34 build and three built journeys complete exit0. Full prior local
failures/recheck evidence remains above; new owner-head CI is required.
