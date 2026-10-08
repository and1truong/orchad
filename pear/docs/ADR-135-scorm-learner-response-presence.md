# ADR-135: Shared learner response presence

The original six three-profile regressions expose supplied empty learner
responses reading403 after preload, and untouched responses being serialized as
blank. Named valid empty bindings are choice/matching/sequencing/performance
zero records and fill-in/long-fill-in/other empty strings; they read0 when set.

Checksum-locked pear-learner-response-presence-binding-v31 leaves the shared
interaction response undefined until set, including reset; its initialized
getter returns403 for absence and existing jsonString serialization omits it.
The existing loader admits explicit empty responses for the seven declared
valid types, binding ID/type first regardless of JSON property order. Server
replay restores empty responses through the same typed setter. No new response
syntax, presence ledger, schema or dependency is introduced.

Numeric/true-false/likert blank SetValue stays406. Historical unsupported scalar
blank defaults keep the loader's existing skip policy; no claim of historical
presence inference or a complete type/field replay matrix. New typed snapshots
omit unused responses. Original stored histories are not rewritten. Known v30
sequencing envelopes and all historical installer byte locks stay supported;
SCORM1.2 bytes are unchanged. 2004 SHA256:
acc64c8c88268bbfaf8429cd0c4805ed2c0c4110888514e0dca8369b60480019.

Original regressions failed6/6. Focused94/94 including Unicode, sequencing,
installer history and operations completed exit0; build completed exit0.
Additional current legacy-scalar vectors6/6, fresh full domain758/758 across110
files and all three built comment/description/response ACK/retry/resume journeys
completed with exit0. They preserve original comment/read-only/description
assertions and verify response blank0/unset403 before and after resume, typed
refusal, stored omission and unchanged count/revision/receipt/proof. Required
new-head CI/native/actual Side Panel/review, full type/edition/presence matrix
and other SCORM-CONFORMANCE rows remain OPEN. Epic open; production disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf, RTE4.2.9.
