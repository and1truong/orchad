# ADR-188 — reviewed remote-AU cmi5 launch (#144)

Stacked directly on ADR-187 / #264; no merge of the predecessor is required.

Remote AUs now launch at their imported fully qualified URL, preserving original
query/fragment and adding the five cmi5 parameters. Pear does not fetch, proxy or
execute their server resources. The LMS chooses OwnWindow for remote AnyWindow
AUs, and honors OwnWindow, with a user-activated link and no opener. The remote
AU speaks the same cmi5/xAPI protocol directly to the separate Pear listener.

`PEAR_CMI5_REMOTE_ORIGINS` supplies at most twenty exact canonical server-reviewed
origins, alongside `PEAR_CMI5_CONTENT_ORIGIN`. No wildcard, URL path, credentials,
public plain HTTP, Pear cookie hostname or local content origin is accepted.
HTTPS destinations and explicit loopback HTTP fixtures are supported. Package
source/hash/rights review remains necessary; imported metadata cannot change the
server allowlist. Destination configuration alone cannot enable production.

Actual requests bind Origin to the AU of the authenticated session. One-use fetch
also binds its capability to that AU's origin. A second origin in the allowlist
cannot reuse another AU's token. Preflight is limited to the runtime routes,
implemented methods and explicit xAPI/content/precondition headers. Responses
echo one permitted Origin, vary on Origin and expose ETag/version metadata; they
never use wildcard CORS or allow cookies/credentialed CORS. Non-browser runtime
requests may omit Origin when they have the scoped capability/Basic token.

Host, live browser login, account/auth version, package status, session lifecycle
and current origin configuration are checked on every actual request. Removing
an origin revokes its existing capabilities, including after restart, without
deleting retained learner/admin evidence. Remote sessions cannot read packaged
local resources. Fetch/auth secrets stay absent from audit/receipts/statements.

Local acceptance: build/typecheck/vendor PASS; 18 cmi5 cases PASS; five built
Chromium journeys PASS. The new journey launches a self-authored AU at a separate
real HTTP origin, performs browser CORS/preflight, fetches its token/LaunchData/
preferences, initializes, reports completed/passed, terminates and reconciles
the own Pear report. Negative cases include other reviewed/unreviewed origins,
Cookie/header/method abuse, credential reuse, logout and origin-config revocation.
No model, remote service subscription or external provider secret is needed.

This is controlled interoperability evidence. Public HTTPS deployment, browser
private-network policies, commercial licenses/accounts, additional platforms,
full LRS/attachments and production scanning/egress/retention/DR require their own
implementation or external evidence. Work continues in the next stacked API PR;
#144 remains the delivery tracker, not a reason to stop implementation.
