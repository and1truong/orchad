# ADR-161: shared data target XML anyURI whitespace

Status: implemented; local full-browser failure retained; exact owner CI/review pending.

SCORM2004 4th CAM3.4.1.19 and published ADLCP schema bind map targetID to
xs:anyURI; W3C XML Schema fixes its whitespace facet to collapse. Outer XML
space/tab/LF/CR surrounding an admitted identifier must not become a different
logical backing-store key. Original standalone local/system probe on the fixed
ADL predecessor completes0PASS/8FAIL exit1, all footer counts retained.
Primary sources reviewed without copying licensed implementation/tests:
- https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_CAM_20090814.pdf
- https://github.com/adlnet/SCORM-2004-4ed-SampleRTE/blob/master/xml/xsd/adlcp_v1p3.xsd
- https://www.w3.org/TR/xmlschema-2/#anyURI
- https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace

Reuse xmlAtomicToken at the one shared targetID read before existing length,
duplicate and profile checks. Original XML/ZIP/SHA remains exact; logical
4000-character limit, normalized duplicate refusal, per-SCO delta permissions,
read redaction, registration/system scope, live learner/session/enrollment
and proof authority remain unchanged. No RTE URI/ID normalization, generic
Unicode trim, new URI grammar or whole-snapshot client authority. The existing
profile still refuses internal/Unicode/control whitespace; this is a named
outer-whitespace correction, not full XML anyURI support. Objective/reference
XML bindings remain separate OPEN work.

Six original domain tests cover both scopes: four XML whitespace kinds plus
mixed characters, original bytes/hash and canonical equivalence at4000; blank,
internal/non-XML/control/4001 refusal, used/unselected organization validation
and normalized duplicates; exact explicit-write receipts, padded/readonly
forged delta rollback, SQLite reopen/suspended resume, writer/private-store
redaction, learner isolation, readonly next SCO and one official proof with
no certificate. Existing built local/system shared-data journeys and actual
fourth-edition native fixture retain every prior authority/absence/result/
journal/ACK/retry/resume/proof/clean shutdown guard.

Engine remains pear-interaction-result-decimal-v42 (2004 SHA2560447a677c989ac331f2e883c3e450a04c9366dcf3b5e4b06c5cbb0d5fdb1a62b;
1.2eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642).
No test deadline/assertion/retry/policy relaxation or pending PASS/READY claim.
Full acceptance, exact source-head CI and fresh review are required.

Normative discrepancy remains OPEN: CAM3.4.1.19 says omitted writeSharedData
is true while the ADL published schema mapType default is false. Retain current
schema-bound false default and explicit writer/reader permissions; this slice
does not silently enlarge write authority or claim resolution. Earlier ADR089
and tested readonly default are historical profile evidence, not proof that
the CAM/schema conflict is resolved. ADL hideLMSUI string/token discrepancy
and full mandatory schema/semantic matrices remain OPEN.

Supported Chromium153 install is blocked by CDN403; local Chromium151 is
supplementary. Windows fixture forced shutdown causes remain unproved and
original logs are retained. Owner222e2b CI absent; descendants cannot replace
owner gates. License/authorized exports/Rustici account/actual Safari+Android/
reviewed deployment/storage/operations inputs BLOCKED. Epic133 OPEN, production
DISABLED; no certification or production-enable claim.

Initial runner at repository root could not find Pear test paths (exit1);
corrected runner85PASS/one new-file TransformError exit1 from malformed
computed property in original test, retained. Initial typecheck/build failed
on that same syntax, all logs retained. Fixed computed-key syntax only;
source targetID correction remains one shared read, no relaxed assertion.

Corrected focused91 completes91PASS, zero fail/cancel/skip exit0 (17.1s);
typecheck/build exit0. Initial syntax/runner logs retained. Engine v42 unchanged.
Built2 and native4 running; full964 domain/135files and fixed full172 browser
follow after native ports release. Controller expectations:1.2=13,2004-2=24,
2004-3=24,2004-4=25; only named shared-target check adds one fourth-edition
check, all prior guards retained. Owner234 original CI9SUCCESS/Windows1.2
forced fixture failure; every original full job log inspected. One unchanged
Windows-only retry requested after complete original run, no source/timeout/
assertion/policy change or cause claim. Owner235 CI queued/running.

Initial built2 completes2PASS exit0 (11.0s); initial supplemental native4
completes4PASS exit0 (26.7s). Added matching fourth-edition native browser
assertions for canonical ID404/readback/resumed/store persistence; final
typecheck/native4 validation running before fresh full domain/browser.
No source/fixture/build mutation overlaps full acceptance.

Final added native shared-target assertions/typecheck complete; native4PASS
exit0 (25.0s), built2PASS exit0 (11.0s). Fresh full964 domain/135files completes
964PASS, zero fail/cancel/skip; each file plan/footer/all five counts/exit0
and aggregate exit0 inspected. Fixed full172 browser running on unchanged
source/build. Installed source hashes0447a6/1.2eb7539 unchanged. Independent
next XML collection ID/IDREF whitespace probe0PASS/9FAIL exit1 retained;
no collection/product changes in this slice.

Owner235de1 original Windows2004-3 native fixture cleanup FAILED: native
exit0/ACKtrue, fixtureForcedtrue/nullfixtureExit; observed phases through
app-closed/no database-closed. Full original job log inspected and retained;
cause unproved, no pending READY or source fix claim. Linux/mac/Pear incomplete.
Owner234 one unchanged Windows-only retry still pending. Future fixture-only
phase-duration/synchronous diagnostic work may distinguish database/cleanup/
pipe-delay causes; current shared-target tree remains fixed for full browser.

Owner235 macOS actual16/13/1.2=13/three2004=24 completes all5 clean
native/fixture exit0/ACKtrue/no forced; complete full log inspected. Windows
original2004-3 forced failure retained/cause unproved; Linux/Pear incomplete,
remains Draft. Shared-target full172 still running, no source changes.

Fixed full172 browser completes168PASS/4FAIL exit1 (7.6m), all four
traces inspected: fourth support download60sec timeout/cause unproved;
managed ServiceWorker permission denial;2004-2 retry and2004-3 retryAll
DOM.describeNode/session-closed at next-SCO delivery/cause unproved. Both
changed built shared/local-system journeys and native4 pass in full, including
new canonical-ID404/store/resume assertions. Original full failure retained,
no unrelated repeat just to obtain green counts; no clean full local/
Chromium153/actual native proof claim. No product/build/test/timeout/assertion/
retry/policy changes during full acceptance. Engine hashes0447a6/1.2eb7539
verified unchanged. Fresh owner CI/reviews still required before READY.
