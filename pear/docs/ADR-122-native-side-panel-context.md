# ADR-122: Require an actual Chrome Side Panel context

PLATFORM-02 previously had only a tab opened at sidepanel.html. The new host
check opens chrome.sidePanel from a real button click in a temporary test
copy, without changing the published extension or its permissions. Chrome
must return contextType SIDE_PANEL at the built panel URL; a fixture reporter
must observe the React Target picker mounted in that same documentId.
Opening the panel URL as a tab is never a fallback. Actual browser user agent,
context and target types are attached for review and the followup journey.

The fixture-only opener/reporter/background listener are added to a temporary
copy and removed at teardown. No production hook, new trust permission or
credential is introduced. Normal extension-page/Lime SCORM acceptance is
retained. The CI Pear job runs the new check through xvfb-run with the pinned
Playwright browser; xvfb is an explicit runner dependency.

Local host typecheck and test discovery complete. Actual browser execution is
blocked locally by managed Chromium ExtensionInstallBlocklist [*]. Headless
and UI probes did not start the test extension; that is not a platform PASS.
Managed policies were neither changed nor bypassed. Xvfb was downloaded from
Debian into workspace without installing system packages. CI execution is
pending in the existing extension-capable lane.

This first context/mount check is bounded platform evidence. Actual container
consent/rebind/revoke/player flow remains OPEN and will follow after current
CI establishes the native context and its automation target type. Existing
SCORM/native/runtime and production/external gates remain required.


Initial head 1d894640 / run 37837858029 failed native macOS job
113519415372 and Windows job 113519415458 before runtime execution: Pear's
main typecheck included the Chrome host file without Chrome declarations.
Local main typecheck reproduced both TS2304 errors. The existing split now
excludes this file from main and explicitly includes it in typecheck:host;
the new host test is still compiled with Chrome declarations. Corrected
Pear build/main typecheck and host typecheck completed successfully.
Actual current-head browser/native/container acceptance remains pending.

Run37839011787 on33897329 completed718 domain and192 dev/192 built journeys,
but Side Panel correlation failed: Chrome returned a real SIDE_PANEL document
and the UI reporter mounted, while MessageSender.documentId was undefined.
The fixture reporter now queries its unique document URL using getContexts,
requires SIDE_PANEL and sends that API-provided ID; the worker's independent
query must match. Evidence attaches before correlation assertions and includes
the actual CDP target type. No panel URL is opened as a tab or fallback.
The same run failed Windows2004-2 fixture shutdown (native0, fixture forced),
while Linux/macOS completed all four profiles12/12. Keep that failure recorded;
local TCP stress did not reproduce it, so its cause is not inferred or waived.
Synthetic shutdown diagnostics now record only IPC-send status/error codes and
fixed cleanup phase names, distinguishing message delivery, connection/sink/app
closure and DB/directory cleanup. Five-second and exit-0 assertions are retained.
Reference: https://developer.chrome.com/docs/extensions/reference/api/runtime.

Exact b9c42239 CI37842311311 completed718 domain,192 dev/192 built, existing
host/Lime/SCORM checks and the actual Side Panel mount check. Its CDP target
is page, so the next journey can drive the existing native container directly.
All three native OS lanes completed runtime16/Pear13/four SCORM12, including
clean exit0 without forced kills. This does not erase the prior Windows failure.

Review found the new shutdown diagnostics could snapshot stdout at child exit,
before buffered data finished. The controller now waits for child close under
the existing five-second bound before collecting phases. The existing real
fixture checks also wait for close and assert all SCORM cleanup phases.
New-head CI remains required; no shutdown timeout or acceptance gate is relaxed.

70452253/run37846133703 macOS failed native-runtime before SCORM:
ui-response:consent never arrived despite successful UI heartbeat responses.
Keep that failure; no platform PASS. Actual component polling reproduced a
starvation defect: every reply slower than the one-second poll is discarded
by comparing its sequence to the newest issued request, leaving no target
snapshot to trigger consent revocation. Accept strictly newer completed
snapshots instead, retaining out-of-order refusal and hidden-UI heartbeat
suppression. Original actual-component tests failed1/2 before correction;
new full Coconut/native CI remains required to establish runtime recovery.
The deterministic polling defect is proved; that does not infer every cause
of the recorded macOS timeout or earlier Windows fixture failure.

Completed local Coconut61/61 and build after preparing the worktree's missing
sidecar/workspace dependencies; initial two missing-artifact failures retained.
Current5f296be6/CI37846479621 Windows failed SCORM1.2 shutdown: received,
connections/sink/app-closed markers arrived, but cleanup-complete did not.
Add database-closed to distinguish DB close from directory removal. Even on
forced kill, drain child close/output for at most one diagnostic second; the
five-second shutdown deadline still sets fixtureForced and cannot PASS.
No Windows cleanup cause is inferred or assertion waived; new CI required.
