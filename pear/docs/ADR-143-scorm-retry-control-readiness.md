# ADR-143: Sequencing retry control readiness

On v35 the unchanged43 sequencing journeys complete35PASS/8FAIL. Retained
trace shows server accepted Terminate and nextScoId=practice, with no retry
request/status lookup. Message observation9 completes7PASS/2FAIL; pointer
observation10 completes8PASS/2FAIL twice. In the final two failures, the intended
shell Retry click lands on HTML in the SCO iframe. No pointer event reaches
shell Retry and no retry message reaches the runtime. This establishes a missed
action in those two cases; it does not attribute every historical failure.

Use Playwright's existing scrollIntoViewIfNeeded and toBeInViewport before the
human Retry click, for both next-SCO and selected-pool exact-proof retry paths.
The extra readiness assertion precedes the original real click. Keep the same
lost response, runtime failure, ACK/retry/next SCO, time/state/count/history and
exactly-once proof assertions, five-second expectations, routing and policies.
No product/engine/schema change, no dispatchEvent shortcut, delay or retry of
a failed test. Temporary event observation is outside tracked tests/commits.

The corrected flow-only ten-case check completes10PASS, exit0. Whole43 sequencing completes42PASS/1FAIL: all lost-ACK/selected-pool paths
pass; unchanged2004-2 retryAll fails DOM.describeNode Internal server error/
session closed. Separate unchanged retryAll recheck completes1PASS/exit0; full145 browser
is running; typecheck complete exit0. No clean full local PASS claim. Previously verified
v35 full domain804/804 across118 files/build/built9 are inherited, not rerun
results for this test-only change. New-head complete CI and reviews remain
required. Download/Service Worker local failures, actual Safari/Android,
licensed authoring exports, Rustici account and reviewed production operations
remain open. Epic #133 open; production disabled.
