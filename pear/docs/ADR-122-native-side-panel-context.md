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
