# ADR-101: diagnostics honor the requested parameter

Epic #133, after ADR-100. ADL SCORM 2004 RTE v1.1 3.1.5 requires support
methods to preserve error state and return empty strings for unknown requested
parameters. The facade returned its latest local diagnostic for every request,
including unknown strings and different known error codes.

Resolve an empty parameter to the effective last error. Return the local message
only when the resolved request addresses that local error; otherwise use the
pinned engine's requested-code lookup. The shared facade serves all four supported
editions and the built isolated player. No engine adaptation, schema, checkpoint,
authority or sequencing changes are needed.

Original four-edition regressions reproduce the failure before correction and
cover every defined 1.2/2004 error-code lookup in not-initialized, running and
terminated states. Unknown words, undefined numeric codes and mixed suffixes
return empty; current/explicit diagnostics agree; support calls preserve both
local and engine errors, bound descriptions to 255 characters, and create no
checkpoints. Successful operations reset the effective error to zero.
Built licensed-wrapper journeys exercise local/engine/unknown lookups, recovery,
checkpoint and close/resume through actual synchronous API methods. Current-head
CI is required for browser evidence; this checkout has no local Chromium.

Reference: Advanced Distributed Learning (ADL), SCORM 2004 4th Edition Run-Time
Environment (RTE), Version 1.1, 2009, sections 3.1.5 and 3.1.7, mirrored at
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
Full lifecycle/error precedence, data model and platform/reference/production
acceptance remain open in SCORM-CONFORMANCE.md. Production remains disabled.

The 1.2 binding has the same correction. ADL SCORM 1.2 Conformance Requirements
2.1.1.2, requirements 12.2–12.5, require explicit-code/current-error lookup and
error preservation before initialization as well as during the session:
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_ConformanceReq.pdf.
