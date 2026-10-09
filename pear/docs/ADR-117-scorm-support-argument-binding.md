# ADR-117: typed published-code support lookups

Epic #133, stacked on ADR-116 / PR #186. SCORM 1.2 upstream error lookup
reports No Error for unknown codes/inherited names; the 2004 regex implicitly
coerces untrusted objects and throws on Symbol. Four original profile regressions
fail before correction. A shared published-code predicate admits exact known
strings and the already-supported integer-number compatibility; other inputs
return an empty string without invoking authored object conversion.

Both facades use the same predicate for error strings and diagnostics. Empty
diagnostic still selects the current local/engine error. No support call changes
last error, lifecycle, CMI, durable queue or shared deltas; known numeric codes
retain the profile-specific meaning of their string equivalents. No numeric
prefix, whitespace, inherited-property or unknown-code fallback to No Error.

ADL 2004 RTE §§3.1.5.2–3.1.5.3 require empty results for unknown support
parameters and preservation of current errors. 1.2 RTE §3.3.2.1 specifies error
code/current-error diagnostics and preservation, but does not prescribe the
unknown-result text; Pear deliberately uses the same safe empty-result policy.
This policy distinction is not a certification claim. Full API argument/coercion/
arity and simultaneous-invalid precedence conformance remains OPEN.

Four-profile domain vectors test before/active/terminated states, all unsupported
kinds including poisoned objects/Symbol, known string/number codes, empty-current
diagnostic and unchanged error/state/checkpoint count. Four built journeys run
actual SCO support queries after a write-only read, then lost ACK/exact retry and
close/resume without official proof. Engine hashes/adaptation remain v19; no
schema/history/data rewrite or production enablement.

References:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_RunTimeEnv.pdf
Actual native platform evidence is tracked separately in ADR-116. Licensed corpus/
account, remaining actual platforms and deployment/operations stay OPEN/BLOCKED;
epic stays open and production disabled.
