# ADR-116: actual native platform and four-profile acceptance gates

Epic #133, stacked on ADR-115 / PR #185. The former native lane tested only
SCORM 2004 fourth edition on Linux. Platform requirements cannot be proved by a
Chromium viewport; GitHub-hosted Windows/macOS runners can execute the existing
actual Tauri/WebView controller rather than being presumed unavailable.

One Node orchestrator starts the real trusted UI and runs unchanged native
runtime and Pear MCP controllers plus the SCORM controller in all four profiles.
Linux uses xvfb; Windows/macOS run the same real debug binary/controller with
WebView2/WKWebView. CI gates cargo build/test, dependencies, guest build, fixture
cleanup and every native journey, and uploads native logs. It records actual
WebView user agent and runner OS/image; no browser stub or successful skip.
The development binary still requires Node on PATH. Packaging/signing and real
production deployment are outside this bounded acceptance slice.

The synthetic Pear fixture selects the requested profile, with its actual entry
and bookmark names. Its content-server response hook loses one ACK only after
the real player transaction commits. The UI driver retries the original queued
request; the hook checks identical request/receipt and unchanged revision/history
before the next queued save. Close/resume retains the bookmark; Terminate creates
one authoritative proof without satisfying the independent quiz requirement.
Actual native controllers retain cross-origin credential/native/agent denial,
fixture fetch/image egress refusal, real external MCP metadata reads and account
rebind revocation. This is not exhaustive all-egress enforcement.

Fixture shutdown uses Node IPC so Windows executes the same graceful server/DB/
synthetic-directory cleanup as Unix signals. Existing signal handlers remain.
Fixtures/control channels are CI-only and never mounted by product entry points.
Five original real server/DB cleanup tests and four supplemental Chromium driver
journeys check shutdown/profile/fault logic. Supplementary Chromium journeys
never count as actual native platform evidence. Actual Windows/macOS and expanded
Linux PASS remains pending completed exact-head CI logs.

The shared engine remains pear-preference-language-v19 with unchanged hashes and
snapshot policy. No product authority, production gate, schema or historical
learning data changes. Safari/Android actual devices/runners, full conformance,
licensed package/Rustici differential and real isolation/operations remain
OPEN/BLOCKED; epic stays open and production disabled.

First Windows attempt on head 35a1121d failed in tauri-build because the default
Windows resource icon was missing, before playback could run (job 113470724312,
run 37823636259). Add only icons/icon.ico generated from the existing tracked
64×64 icons/icon.png with the installed Tauri CLI (`tauri icon`); no replacement
artwork or platform bypass. Actual Windows build/runtime evidence remains required.

Run 37823636259 completed the actual Linux and macOS lanes on initial head
35a1121d: runtime 16/16, Pear/MCP 13/13, each SCORM profile 11/11. Their complete
logs include the real WebView user agents and runner images (Linux job
113470724545; macOS job 113470724658). Windows failed the missing resource, so the
whole run was not PASS. The four-profile Linux execution took about eleven
minutes after setup; enlarge its former one-profile 15-minute job budget to 25
minutes for dependency/build overhead. New-head acceptance is still required.
