# ADR-121: Dynamic egress probes in actual native fixtures

Continue BOUND-02 with original synthetic probes, retaining loopback-only
execution and production disabled. This changes only CI fixtures and checks,
not content permissions or product guards.

The existing four-edition fixture now attempts dynamic XHR, WebSocket, beacon,
image/CSS, media, iframe, form, popup, Worker and service-worker operations
against a local synthetic sink before saving, and again on resume. Named
connect/img/media/frame/worker CSP events must be observed; popup and service
worker must be denied, and the sink must receive zero requests. Sandbox
blocks forms before CSP can emit form-action; form submission is attempted
and its lack of sink traffic is required. No timeout is accepted as native
IPC denial. Existing credential/native/MCP isolation, exact lost-ACK retry,
resume, authoritative proof and identity revocation checks remain.

The actual native controller adds one explicit dynamic-egress check (12
checks per SCORM profile); Chromium preflight asserts the same probes at
first delivery and resume. These are bounded named vectors, not proof of
all-egress enforcement, redirect/self-navigation policy or certification.
Actual current-head Linux/macOS/Windows acceptance remains mandatory.

Local four-profile built Chromium preflight completed 4/4. The initial new
probe assertions failed in all four profiles because they required a
form-action event despite sandbox denial; diagnostics showed all five other
CSP directives and zero sink requests. Corrected probe expectations retain
form submission plus the zero-request guard. No product permission relaxed.

Self-navigation, redirects, complete dynamic/nested traversal, real Side
Panel/Safari/Android and reviewed production enforcement remain OPEN. Strict
mode is not enabled by these fixtures.


Actual macOS run 37835169386, job 113510238758 failed the first-profile
dynamic-egress assertion after runtime16/Pear13 passed. Initial diagnostics
recorded authority surfaces but omitted dynamic probe fields and sink count,
so the cause cannot be assigned to event timing or sandbox semantics. Add
only those boolean/directive/count diagnostics; no authored state, URLs,
capabilities or credentials. Denial and zero-sink assertions remain unchanged.
Current-head actual native validation is required; this failure is retained.


Diagnostic head e157e87c / macOS job 113519415935 records popup and
service-worker denial, zero sink requests, and connect/img/frame/worker CSP
events; media-src was absent. A video with an unspecified extension/MIME did
not establish an actual media load. Use an explicit audio/mpeg source at
media.mp3 and call load/play; record playback/error status without accepting a
timeout as denial. The media-src CSP requirement and zero-sink guard remain.
This corrects the stimulus; actual macOS validation still must complete.
