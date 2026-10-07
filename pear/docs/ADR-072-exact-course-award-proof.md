# ADR-072: exact course completion proof for original awards
2026-10-06. Continues #49/G08 on the fresh-reading stack.

The published graph pins course versions. The evaluator previously matched only course ID, so old or newer completion could falsely satisfy an immutable criterion. Match exact learner, tenant, course and pinned version, completed state and existing cycle start. Require an active learner and both pinned group and current content audience before deriving credits, as for standalone proof.

No course score, completion, certificate, receipt or historic version is rewritten. No new tool, migration or descriptor cap. Award issue remains inside the existing official submission transaction. Four real SQLite/domain regressions cover both version directions, other learners, original pins, audience revocation/restoration and audit rollback.

This is an original deterministic proof policy. Exact reference equivalence, recertification, broader provider/reference rules, licensed catalog, independent quality/accessibility and production validation remain OPEN. CI evidence is recorded in the PR after exact-head verification.
