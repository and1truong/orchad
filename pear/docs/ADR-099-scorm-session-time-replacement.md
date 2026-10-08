# ADR-099: last session time replaces the current contribution

Epic #133, stacked after ADR-098 / #166. ADL SCORM 2004 RTE v1.1
4.2.21 and 4.2.25 require the last reported session_time to be accumulated and
total_time to remain fixed during the communication session. The same replacement
accounting is used for the supported 1.2 timespan binding.

The API already accepted a lower cmi.session_time, but server checkpoint replay
then refused it with "Session time cannot decrease within a launch". Remove that
inconsistent monotonic-value guard. Receipt sequence and expected revision still
enforce write ordering; the time value itself is content-reported, not a trusted
elapsed clock or authority counter.

Calculate the exact centisecond total as previous accumulated total minus this
launch's previous contribution plus its latest contribution. Reject negative or
unsafe cumulative totals transactionally; write the resulting seconds directly
instead of adding floating deltas repeatedly. Earlier communication sessions and
the launch's fixed initial total remain unchanged. ACK retry cannot apply the
replacement twice. Finish/Terminate, technical attempts, duration clocks,
projection/proof and live-capability guards keep their existing independent roles.
No schema migration, historical rewrite, engine-byte or adaptation change.

Original four-edition domain vectors cover 30.03 → 10.01 → 0 and centisecond
corrections, repeated ACK, stale receipt denial, audit rollback, actual DB reopen,
final zero-time termination, unchanged earlier total and zero official proof.
Overflow fails before state/receipt mutation. Built-browser licensed-wrapper
journeys cover actual API → durable ACK → close → preloaded resume for each edition.

Reference: ADL SCORM 2004 4th Edition RTE v1.1 (2009), original specification
mirrored at https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
Year/month conversion, all time/calendar/reference semantics and production
load/recovery remain OPEN; this correction is not exhaustive conformance.
