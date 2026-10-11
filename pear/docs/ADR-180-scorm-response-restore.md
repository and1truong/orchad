# ADR-180: bulk current-pattern validation with learner-response origins

Epic #133; successor stacked immediately on #254 head4a52a271. Preserve the
original six regression failures: three restorations construct2750 probes for
250 learner-only origins/2500 current patterns, and three accept duplicate
choice sets with a bound learner response. The separate original probe shows
both exact and reordered duplicate sets accepted in all three editions while
ordinary current-type bulk loading rejects each. The constructor-count probe
preserves exact state including350 full Unicode comments; this is not evidence
that it caused historical browser timeouts.

The shared loader now clears/rebuilds correct-response arrays only for records
with an actual pattern origin. Learner-only origins retain their current-type
patterns together in the normal loader, preserving packed indices and engine
cross-pattern duplicate-set validation. Only the250 learner responses need
original-type probes, instead of2750. Every existing queue/reload, typed server,
trusted sequencing copy, context/launch/resume caller already uses this helper.
No engine/adaptation bytes or API/model/metadata/transport/journal/tenant limits
change. Trusted pattern-origin records retain their established restoration
path and original values; fuller mixed-history validation remains OPEN.

Six original regressions now cover exact complete250-interaction/100-objective/
2500-ID/2500-pattern/350-comment snapshot plus250 host bindings, deterministic
constructor count (no timing threshold), strict exact/reordered duplicate
refusal, and mixed original learner/pattern/current-pattern restoration with
subsequent351 duplicate refusal. Existing blank/original type, changed response,
forged metadata, typed replay, exact receipt retry, SQLite resume and sequencing
coverage remain in the same file.

Completed local evidence:
- Original added6tests0PASS6FAIL/exit1(3.25s), all cases/footer read; six separate
  duplicate counterexamples and original exact2750-probe count logs retained.
- Build/typecheck PASS/exit0, chunk-size warning retained; v50 bytes unchanged.
- Focused34domain PASS/exit0(26.17s), all cases/five counters/footer read,
  including prior provenance/choice/ordered response/collection/combined LMS
  comment transactional refusals and durable exact retries.
- Six built response-binding/combined LMS-comment journeys PASS/exit0(57.3s),
  all cases/footer/status read. Full148domain1120PASS/exit0, exact package
  file map/all148 per-file cases/TAP plans/five counters/durations/exits and
  final aggregate independently inspected. Hyphenated180 browser lane completes
  177PASS3FAIL/exit1(11.7m), all180 per-case IDs/footer/status and all three
  full trace/network/context artifacts inspected: third combined native
  resumed-entry5s, managed SW enumeration denial, third retryAll heading
  DOM.describeNode/session closed. Native initial1608460-byte200, intentional
  6230635-byte503(1.415s)/exact same-body retry200(334ms), Close5965513-byte
  200(1.281s), new launch200(170ms)/new5965503-byte checkpoint still in flight.
  No page errors; historical native/heading causes UNPROVED. All combined
  LMS-comment and response-binding built cases pass. No clean full local
  browser PASS claim. Remaining seven browser cases PASS/exit0(25.5s), all
  cases/footer/status inspected; exact disjoint42+5=47-file map gives187
  coverage184PASS3FAIL across two lanes, not one clean full run. Affected
  third combined native-only unchanged recheck1PASS/exit0(22.8s), all
  case/footer/status read, same code/predicates/deadlines; original retained.
  The full-browser shell glob selects180 hyphenated cases, excluding seven
  scorm12/scorm2004/scorm.spec cases; these seven run as a separate
  lane after180 finishes, with exact combined file-map coverage inspected.
  Preserve both lane results; no single fixed187-run claim.
- Own exact-head CI/all completed full logs/fresh reviews/actual3OS proof
  remain required; Chromium evidence is supplementary.

Parent#2544a52a271 remains DRAFT own37967161742, exact-head CI in progress;
original Windows job113944270767 completedFAILURE: runtime16/Pear13/1.2 13
pass, second-edition assertions pass until shutdown. NativeExit0, fixture forced
SIGKILL/exit null; only five phases through database-closed, no cleanup-complete,
app-closed7.987ms/database-closed4999.663ms/direct DB4991.649ms/errorBytes0.
Full1650-line log/material checks/diagnostics/warnings inspected, cause UNPROVED;
one unchanged affected-job recheck pending workflow completion, no criteria
change. Mac job113944270636 completedSUCCESS/full1740-line log/material
commands/checks/shutdown records inspected:16/13/13/31/31/32 plus15/15/15
and17/17/17, eleven clean/ten six-phase/direct finite DB-close records
35.364/51.937/16.817/39.285/14.416/15.121/19.695/6.875/31.342/9.956ms.
Other required parent jobs/review gate remain pending. Local full1481114domain PASS/exit0 and fixed187182PASS5FAIL/exit1(14.2m), all
five full trace/network/context artifacts read. Managed SW enumeration denied;
two heading DOM.describeNode/session closed and third/fourth native resumed
entry observations have UNPROVED causes. Separate unchanged affected native
2PASS/exit0(31.1s) does not erase the full failures. Initial fixture failures,
original native8/2 and affected2PASS, interrupted old full sessions retained.
#253d433c629 READY own37962021002/all10/full logs/fresh reviews0,1111domain/
249dev/249built/actual SidePanel4/all3OS original+15/15/15+16/16/16 eleven
clean/ten six-phase/direct finite DB close. Independent successor probes retain six mixed-pattern duplicate counterexamples
(one historical numeric pattern plus two current duplicate choice sets), and
three full-origin Commit391 refusals:250 interactions/2500 fill-in patterns/
250 learners accept3500 typed writes, but2750 host-derived bindings exceed2048
and no checkpoint callback runs. Separate raw-loader probes confirm exact
`Invalid response bindings` from this cap. Neither gap is repaired here; both
remain internal OPEN work, not external license blockers. Remaining API/DM/response/time/
URI/sequencing/recovery/full simultaneous SPM/production matrices stay OPEN.
License/authorized exports/Rustici account/actual Safari+Android/reviewed
production inputs BLOCKED. Epic OPEN; production DISABLED.
