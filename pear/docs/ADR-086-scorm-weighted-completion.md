# ADR-086 — Fourth-edition weighted completion

Status: implemented successor to ADR-085; epic #133 remains open.

Retain all three SCORM 2004 fourth-edition completionThreshold attributes: completedByMeasure, minProgressMeasure and progressWeight. The weight is independent of whether completion is derived from measure; preserve zero and bounded decimal values. Earlier editions reject these attributes. Original XML/archive bytes remain immutable.

Pass the complete configuration to the pinned engine activity tree. Progress weights are static manifest configuration, not fields in the engine's serialized tracking state; trusted snapshot reconstruction reparses the immutable manifest before restoring measures. Non-unit weighted single-SCO packages require the trusted sequencing boundary. Unit-weight single-SCO threshold packages retain their existing runtime/attempt behavior, avoiding an unrelated technical-attempt reset.

Accepted progress_measure participates in the engine's completion-measure rollup. Record its trusted root measure in immutable official proof alongside completion/success and normalized objective measure. It does not substitute for the published completion/pass/minimum-score policy for every required SCO. A zero-weight unfinished SCO can coexist with root progress 1 and still prevents official completion.

Reference: [ADL fourth-edition packaging schema](https://github.com/adlnet/SCORM-2004-4ed-SampleRTE/blob/master/xml/xsd/adlcp_v1p3.xsd), [ADL testing requirements](https://adlnet.gov/assets/uploads/SCORM_2004_4ED_v1_1_TR_20090814.pdf), and the installed scorm-again 3.4.5 activity-tree builder/completion-measure rollup implementation. No ADL engine code is vendored.

Tests cover asymmetric weights, denominator contribution by unattempted children, engine reconstruction, final measure/proof, zero-weight obligations, completedByMeasure=false, default-weight regression, malformed/range/edition negatives, and built save/resume/lost-ACK/next-SCO/official-proof journey. No migration. Exhaustive conformance/reference/commercial/platform/production gates remain open.
