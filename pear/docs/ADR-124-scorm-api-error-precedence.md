# ADR-124: Original simultaneous-invalid API error matrix

API-01/API-02 require explicit communication, argument and error-preservation
evidence. Four original profile cases extend the existing lifecycle tests:
invalid arguments combined with inactive/terminated sessions, malformed strings
on read-only/keyword/undefined elements, numeric type/range errors, missing
interaction dependencies and skipped packed indices. Poison objects and Symbols
must not escape or invoke authored conversion. Support calls preserve errors;
refused calls do not enqueue checkpoints, change bookmarks or append records.

The same published error vectors run through all four built API journeys before
their existing throwing-queue, exact lost-ACK retry and durable close/resume
checks. This is added evidence for current behavior: no new product/runtime
patch was needed, and no checksum, adaptation, schema or history changes.
1.2 post-Finish301 remains an explicit bounded Pear compatibility policy.

Completed local checks: lifecycle13/13, full domain722/722 across105 files,
build and all four built lifecycle journeys. Parent Side Panel correction
adds fixed-phase/IPC shutdown diagnostics; its Windows shutdown failure is
retained and requires current-head native CI. Exact-head full CI/review gates
remain required for this successor.

References: ADL1.2 RTE §§3.3.2–3.3.3 and2004 RTE §§3.1.2–3.1.7,
§4.2 access/range/dependency requirements:
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
Unspecified JavaScript extra arity/coercion, all fields and simultaneous error
combinations, internal exceptions and edition/platform/reference/deployment
conformance remain OPEN. Named tests do not establish certification.
