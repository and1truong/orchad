# ADR-131: Player navigation and content redirect boundary

The SCO shares an origin with its synchronous API/player. It can read the
player nonce and inject a nonce-bearing script into that document. The nonce
is not an authority boundary. An original Chromium counterexample sent a
request to a synthetic Pear canary through player self-navigation; Pear's
frame-ancestors response blocked display after the request had reached Pear.

When executable content is configured, Pear now restricts frame-src to the
content origin, existing inline SCORM/interactive route prefixes and blob
content. It does not permit arbitrary Pear URLs. Apps without that runtime
configuration retain their existing policy. Original inline launch, progress,
resume, private reported-state and unofficial-learning assertions remain and
run with the combined configuration.

A second counterexample used a content-origin HTTP redirect to the Pear
canary; CSP path restrictions are ignored on redirect. The shared content
host now refuses off-origin, malformed or credential-bearing Location values
on redirect responses with403 and removes Location before the browser receives
it. Valid same-content-origin relative redirects remain available. Guards are
shared by all content-host callers and do not inspect or rewrite package data.

The four-edition real fixture attempts a redirect twice (initial/resume),
requires HTTP403 and zero Pear/sink canary calls, then after Terminate injects
player navigation to Pear. It requires an actual attempted marker, a Pear
frame-src violation, zero canary calls, unchanged one proof and zero certificates.
Native controllers use the same stimulus/check and keep clean exit0/no forced
kill. Supplemental Chromium is not native acceptance; new-head actual
Linux/macOS/Windows logs and all four actual Side Panel journeys remain required.

The original direct and HTTP-redirect failures are retained. Build and the six
built Chromium journeys completed with exit0, and the originally failing
redirect scratch probe then passed with zero actual Pear requests. Fresh final domain acceptance completed740/740 across107 files with zero
failures/cancellations/skips. Exact-head CI/review remains required before ready.

ponytail: this is bounded defense in depth, not universal strict-egress. The
necessary inline route prefixes still permit requests within those prefixes;
complete nested/blob/navigation traversal and reviewed platform/deployment
network enforcement remain OPEN. The loopback guard remains mandatory, epic
#133 stays open and production disabled. A real deployment must prove an
independent request boundary before enabling strict execution.

Reference: [W3C CSP3 URL matching, including redirect count and path matching](https://www.w3.org/TR/CSP3/#match-url-to-source-expression).
