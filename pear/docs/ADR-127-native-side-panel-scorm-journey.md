# ADR-127: Actual Side Panel consent and durable SCORM journey

ADR-122 exact b9c42239 CI established SIDE_PANEL and its page CDP target.
Extend that same native-container check in all four SCORM profiles. Drive
only the page Chrome creates after a real sidePanel.open user gesture;
require one runtime SIDE_PANEL/document URL, its mounted React reporter and
the same documentId at the end. No panel-URL tab fallback or product hook.

Reuse the original licensed wrapper fixture, real Pear app/content host,
Lime target/policy/gateway path and existing deterministic gateway. Pin and
consent to lesson metadata, assert that successful read excludes private
SCORM/credentials/responses, and require SCO isolation and zero proof.
Unchecking the permitted read revokes consent and disables send; grant new
consent, commit progress with a deliberately lost ACK, retry the identical
request without another revision/receipt, close/reopen and finish exactly
one proof while the quiz requirement still prevents a certificate. Change
account in the same app tab: old consent must fail STALE_CONTEXT before any
gateway request, repinning the new identity requires fresh consent, and
Disconnect clears the token and disables Send.

Only a temporary test copy gets opener/reporter/listener and fixture-origin
permissions. Published extension permissions/code and the managed Chromium
policy are unchanged. Existing extension-page/native/SCORM suites remain.

Local host typecheck and discovery of all four journeys completed; actual extension execution
is blocked by managed ExtensionInstallBlocklist[*]. Full exact-head CI and
review are required before recording these journeys as tested. Full other
browser/platform, all-egress, operations/reference and integration gates
remain OPEN/BLOCKED; epic stays open and production disabled.

Actual #200 head c47b6daa/CI37849982707 failed all four journeys at panel automation attachment: SIDE_PANEL context, unique getContexts/report ID and CDP target type page were verified, but the original context.pages() did not include it. Reconnect through public connectOverCDP to the same loopback browser after verified mount, require exactly one existing panel page and independently recheck the same SIDE_PANEL document ID. No panel navigation, new panel tab, fallback, or assertion relaxation. Owner host typecheck and ordinary same-target CDP transport check passed; local managed extension blocklist still prevents actual-container execution. New-head full CI remains required. The initial data-URL transport probe was blocked by administrator policy; it was replaced by an ordinary synthetic loopback page without policy changes.

Head3b59b1b8/run37853838437 attaches the actual existing Side Panel and reaches account-change denial in all four profiles. Each fails only because the STALE_CONTEXT log is inside the initially collapsed native Tool activity details. Open its summary before requiring the same visible error and zero additional gateway calls. No assertion, consent/identity policy or timeout is removed. Require new-head actual-container acceptance; original four failures remain retained.
