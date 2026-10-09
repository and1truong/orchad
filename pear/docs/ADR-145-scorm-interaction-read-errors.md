# ADR-145: Collection record read errors

ADL RTE4.2.9/4.2.17 require an absent interaction record to return blank/error301,
while an existing record with an unset type/timestamp/weighting/result/latency
returns blank/error403. The shared collection resolver returned403 for both.
Original six raw/facade/preload/durable regressions fail on v36.
pear-collection-read-errors-v37 extends the existing absent-record301 resolver
rule to all named objective/interaction scalar and score fields and nested
objective IDs/correct-response patterns. Missing parent/child records both fail
without appending; valid records, unset403 and supported counts are unchanged. No changed defaults, serialization/presence,
set dependencies, type/range bindings, SCORM1.2 or accepted receipt/history.
2004 SHA256: 3d677e8ee9457aa0ca29a68ada989301493de6965c3cc2e51431b0198b2f10aa.

Exact v36/historical installer paths upgrade idempotently; unknown bytes fail.
Trusted v36 identity is admitted with original wrong-attempt/unknown-marker
refusal and complete restored-state equality under a controlled Date clock.
Initial narrow v37 focused32/build/new browser3/full domain810 across119 files/
supplementary native fixture4 and integrated root full810/build complete exit0.
Caller review finds the same missing-record bug on objective and nested fields;
three extension cases fail on the narrow resolver. Final broader focused35/build
complete exit0. Final source full domain813/813 across119 files completes exit0
in the draft; tracked source diff and all new source/test files match root
exactly. Integrated root focused35/build/built12 (new errors3, URI3, learning2,
supplementary native fixture4) complete exit0. Full148 local acceptance and
exact new-head CI/reviews remain required.
Native fixture emits only standard path/field/error-code evidence and checks all
five unset interaction fields plus thirteen absent objective/score/nested paths
before and after lost-ACK/exact retry/resume. Actual native CI is still required;
Chromium fixture evidence is supplementary. Parent316d8fa0 shutdown ACK correction completes actual native Linux/macOS/
Windows runtime16/Pear13/four SCORM13 with five clean exit0/no-forced and ACK
records per OS; current parent Pear CI is still running. Parent full145 local
140PASS/5FAIL remains retained, not a fresh v37 pass.

The first draft full-domain attempt stops at certificate PDF180-second timeout
inside shell sandbox, with no complete footer; partial/failure logs remain.
Full domain is rerun outside that sandbox using the installed Chromium.
Initial API tests already show correct403 for existing unset fields. A discarded
serialization-omission assertion was not a normative requirement and caused
three additional initial failures; its logs are retained. The final six original
regressions test absent-record301, not a serialization change.

All remaining API/data-model/URI/error/edition/reference matrices remain open.
Epic #133 stays open, production disabled; licensed authoring exports/Rustici,
actual Safari/Android and reviewed real production-operation inputs remain absent.

Reference: ADL SCORM2004 fourth-edition RTE4.2.9/4.2.17 dot-notation API tables:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Third-edition RTE4.2.9:
https://upload.aura-software.com/files/20191008081839-de8fbb595231f8557780f59e3a0ae316f2a2abbf/SCORM_RunTimeEnv.pdf
