# ADR-132: Sequencing fixture action readiness

The original synthetic sequencing HTML exposed enabled action buttons before
its external player script had initialized the API or attached handlers. A
controlled script-delivery counterexample confirms Save was enabled while the
script was withheld. A click at that point has no handler and cannot commit.

Start the four original fixture buttons disabled; require Initialize to return
true, attach all handlers/listeners, then enable the buttons using HTML's native
disabled property. This is one fix in sequencingPackage, reused by every
original sequencing journey. It changes no product policy, standards engine,
snapshot/history schema or accepted state. Existing original ZIP bytes are
retained in imported records; new synthetic fixtures have their own hashes.

The existing2004-3 collections journey holds the script, verifies Save disabled,
releases it, and continues its original ACK/close/resume/lost-ACK/retry/next-SCO/
time/proof checks. No original assertion or five-second expectation is removed
or increased. Teardown releases the gate and waits for existing route handlers.

Original controlled regression failed once. Corrected complete fresh domain
740/740 across107 files and build passed. The first full43-journey local attempt
completed32PASS/11FAIL. Targeted12 completed10PASS/2FAIL, and the final unchanged
three-case check (including those two and the controlled regression) passed3/3.
All journeys have passing evidence across attempts, but this is not a clean full
acceptance run. Preserve the failures and require current-head full CI.

Additional sanitized message/click diagnostics reproduced one failure with
DOM.describeNode Internal server error/session closed on local Chromium151.
The first failed full run cannot all be attributed to that error. Original CI
#192358d initial-ACK and #193da5 initial retryAll failures remain distinct; an
unchanged local #192 case passed. The39MB CI artifact exceeded the transfer
limit and direct download received proxy403, so there is no definitive original
CI trace attribution. Those two failed jobs were retried once on their original
heads; their first failures remain recorded.

This fixture readiness correction is not conformance, native acceptance or
strict-egress evidence. Engine adaptation remains pear-choice-set-binding-v28;
all unfinished SCORM-CONFORMANCE rows and production/external gates remain.
