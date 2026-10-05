# Lime POC — end-to-end product demo plan

Goal: record a scripted, step-by-step demo of the lime Chrome MV3 extension's NATIVE side panel against the counter fixture + scripted mock gateway. Artifacts go to /home/ubuntu/demo-lime/ (panel PNGs via CDP Page.captureScreenshot, fixture PNGs via Playwright page.screenshot, full-desktop recording via recording_start/stop, Playwright recordVideo as bonus).

## Environment setup (done)
- `npm run build` in lime/ → dist/extension (fixed missing mango/node_modules link to bridge-contract).
- Driver: temporary `lime/tests/demo-driver.ts` (deleted after run) — spawns fixture :4313, startMockGateway(4311, scripted=true), copies dist/extension → /tmp, patches manifest host_permissions to 4313+4311, launchPersistentContext (headed, dsf=2, 1080x1120, recordVideo, remote-debugging-port 9223), opens fixture page, then waits for sidepanel target on /json/list.
- Tester opens native panel by REAL mouse: toolbar puzzle icon → "Orchard Lime POC" row (worker sets openPanelOnActionClick).
- Driver attaches raw WebSocket to the sidepanel target, enables Page/Runtime/Log, drives UI with Input.dispatchMouseEvent/KeyEvent/insertText (trusted gestures) + Runtime.evaluate asserts + Page.captureScreenshot.

## Demo steps & assertions (concrete pass/fail)

1. **Fixture + initial panel**
   - Fixture page shows "Demo Counter", `#value`="0", `#revision`="Revision 0".
   - Panel: h1 "◒ Lime", `.status`="disconnected", textarea[aria-label=Message] prefilled `/tool demo_increment {"amount":1}`, Send disabled (consented=false).
   - Artifacts: step-01-fixture-page.png, step-01-panel-initial.png
2. **Target picker**
   - `select[aria-label="Target picker"]` contains option[data-url^="http://127.0.0.1:4313"] labeled "Demo Counter — test double"; fixture tab already selected (active-tab default).
   - Real click opens native popup (visible in recording), Escape closes it.
   - Artifact: step-02-target-picker.png
3. **Pin target**
   - Click "Pin target" → poll `.status`="connected"; `.pin` contains "demo-counter", "Document: demo-document", origin http://127.0.0.1:4313, "Instance:" uuid; activity log has "Discovered demo-counter; consent required"; "Allow read: demo_read" checkbox visible.
   - FAIL if .status shows "error".
   - Artifact: step-03-pinned-connected.png
4. **Token + models**
   - Click `input[aria-label="Gateway token"]`, Input.insertText `lime-fixture-token`, click "Load models" → 2nd select gets option "mock-counter" and value="mock-counter"; status remains "connected".
   - Artifact: step-04-models-loaded.png
5. **Consent**
   - Click "Consent to pinned target + model" → button text flips to "Consent granted"; `.status`="connected"; activity contains "Consent granted to mock-counter at http://127.0.0.1:4311"; Send enabled.
   - Artifact: step-05-consent-granted.png
6. **Send → approval card**
   - Precondition: fixture #value="0". Click "Send" → `section.approval` appears with "Approve mutation", "Client: sidebar", "App: demo-counter", "Tool: demo_increment", "Expected revision: 0", `Arguments: {"amount":1}`; `.status`="waiting for approval"; fixture #value still "0" (mutation gated on approval).
   - Artifacts: step-06-approval-card.png, step-06-counter-before.png
7. **Approve → mutation lands**
   - Click "Approve" → fixture `#value`="1", `#revision`="Revision 1"; card gone; `.status`="connected"; `.transcript` (Chat) ends with "Done."
   - Artifacts: step-07-transcript-done.png, step-07-counter-after.png
8. **Deny → no mutation**
   - Click "Send" → new approval card "Expected revision: 1" → click "Deny" → card resolves; fixture #value stays "1", revision stays "Revision 1"; transcript gets second "Done."; status "connected".
   - Artifacts: step-08-approval-card-2.png, step-08-counter-unchanged.png, step-08-denied.png
9. **Navigation invalidation**
   - page.goto("http://127.0.0.1:4313/empty") → panel `.status`="target changed"; consent button reverts to "Consent to pinned target + model" and is disabled; Send disabled; no approval card.
   - Artifacts: step-09-target-changed.png, step-09-empty-page.png

## Evidence collection
- Driver logs PASS/FAIL per assertion + any panel console errors (Log.entryAdded/Runtime.consoleAPICalled) to stdout → saved to demo-lime/driver-log.txt.
- recording_start before launching the browser (captures window open, puzzle-icon click, all panel activity); recording_stop after step 9 → save under demo-lime/.
- Playwright recordVideo of the fixture tab → demo-lime/pwvideo/*.webm.

## Pass criteria
All 9 steps' assertions pass; counter increments exactly once (0→1) across approve; deny leaves it unchanged; invalidation flips status to "target changed". Any console errors are reported even if steps pass.
