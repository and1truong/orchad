# ADR-110: preserve synchronous API failures and queue retry

Epic #133, stacked on ADR-109 / PR #179. The 1.2 adapter allowed an empty
GetValue/SetValue element name to reach an engine early return that retained the
previous error, including 0. Its existing argument guard now refuses the empty
name with 201, before model traversal. 2004 keeps its defined general get/set
failure binding (301/351).

Both adapters accepted a callback's false result but allowed a thrown checkpoint
queue exception to escape the synchronous API. Commit now returns false with
101 (1.2) or 391 (2004); Finish/Terminate returns false with 101/111. A refused
termination stays active, the shared-data delta remains pending and a later
successful queue acceptance can retry the unchanged state. Exceptions are caught
only at the checkpoint acceptance boundary; no rejected call is silently saved.
This acknowledges bounded local queue acceptance, not a durable server ACK.

The exact v15 ESM entries and adaptation/snapshot compatibility stay unchanged.
No new engine patch, schema migration, historical rewrite or production change.

Nine original domain tests enumerate all eight exposed methods across all four
edition profiles: before initialize, active, terminated; malformed/empty
arguments, string results, support-method error preservation, mutation/queue
counts, thrown acceptance and retry. A fourth-edition bound shared-data vector
verifies retained deltas, exact receipt replay, two accepted checkpoints and no
official proof. Four built pipwerks journeys inject a real encoder exception in
the engine frame's queue, restore the encoder, then verify normal persistence,
lost ACK/exact retry and close/resume. Five of the original eight API vectors
fail before correction; the three 2004 lifecycle controls already pass.

References: ADL 1.2 RTE §§3.3.2–3.3.3 and 2004 RTE §§3.1.2–3.1.7:
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf

These are named original vectors, not exhaustive API certification. The tests
explicitly retain Pear's bounded 1.2 post-finish 301 policy; simultaneous-invalid
precedence, every field/error classification, extra JavaScript arity/coercion,
internal initialization/termination exceptions and edition-specific reference
suite/platform/deployment gates remain separately OPEN in the register.
