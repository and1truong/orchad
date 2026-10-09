# ADR-154: XML boolean whitespace at SCORM import boundaries

Status: implemented; local evidence complete with full-browser failures retained; current-head CI/review pending.

IMS Simple Sequencing XML Binding1.0 table4.1 maps control, objective, map,
rollup, randomization and delivery flags to XML boolean. W3C XML Schema1.0
Part2§3.2.2 admits true/false/1/0; §4.3.6 fixes whitespace collapse for non-string
atomic types. Only U+0020/U+0009/U+000A/U+000D are XML whitespace. SCORM4th
CAM§3.4.1.15 also binds completedByMeasure to xs:boolean. Sources:
- https://www.imsglobal.org/node/52631
- https://www.w3.org/TR/xmlschema-2/#boolean
- https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace
- https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_CAM_20090814.pdf

Original predecessor22704e2995a importer refuses valid outer XML whitespace:
three editions ×four legal spellings completes0PASS/12FAIL exit1. Log
/workspace/scratch/scorm-xml-boolean-before.log and original standalone probe
are retained. DOM character references are decoded before typed translation.

Use one shared XML-boolean token normalizer before existing vocabulary guards
in sequencing groups/collections and package objective scope/shared-data scope,
activity visibility and completedByMeasure. Removing only outer XML whitespace
is equivalent to collapse for these four indivisible boolean tokens; internal
whitespace remains invalid. JS trim would incorrectly admit NBSP/FEFF/EM SPACE.
Missing/default/edition/namespace/duplicate rules and existing error categories
remain. Identifiers, URIs, strings, numeric/duration/calendar tokens, original
manifest/ZIP bytes, hashes and persisted history are untouched. Engine/source
lock remains pear-uri-authority-v40, SHA256
9ba7375b3f88be0bf54cf02ed4220346f5fbee12de8fa23ac723ba6fe0d0d35c.

Named26 domain tests complete PASS exit0: legal lexical spellings and original
bytes/hash; canonical-equivalent rich groups, ADL flags and collection overrides;
malformed/internal/non-XML whitespace in selected and unused definitions;
objective scope false, all-four-edition visibility; fourth completion weights and
shared-data scope/permissions; exact receipt retry and SQLite reopen with no proof.
An initial shell used the wrong cwd when creating the test; its57 existing tests
ran but excluded the new file. That log is retained and is not the26-test result.
Build/typecheck complete exit0. Fresh full domain and browser acceptance pending.

Extend existing choice3 built journeys with numeric boolean spellings, original
XML whitespace/character references, preserving every lost ACK/exact retry/Close/
resume/next-SCO/rollup proof check and time budget. Actual native2004 fixture import
now includes spaced visibility/tracked booleans; existing22-check journey is
unchanged, with supplemental browser4 and actual threeOS evidence required.

Parent225b32 READY(all10/logs846/237dev/237built/SidePanel4/native2004=20).
Parent22619c4 cancelled at25minute Pear job limit after855/237/237/host passes;
SidePanel incomplete. Owner8f706306 changes only scheduling ceiling25→35minutes;
22704e2995a integrates it without rewriting history. Exact-head all10 CI/logs and
reviews still required for both. Prior local browser/native failures remain in
ADR148–153, without proved generic driver cause. Chromium151 is supplementary;
expected153 installation is blocked by CDN403 Domain forbidden.

This is named boolean binding coverage, not complete XML Schema validation.
Full numeric/duration/calendar/token/identifier bindings, delivery/rollup/rule/
SPM/history/operations/reference corpus matrices remain OPEN. External authorized
exports/license/Rustici account/Safari/Android/production evidence absent: BLOCKED.
Epic133 OPEN; production DISABLED.

Initial focused browser3 completes0PASS/3FAIL exit1 before product execution:
Chromium launch SIGTRAP/setsockopt Operation not permitted under the default
execution sandbox. Rerun with approved browser execution permission and identical
commands/budgets completes3PASS exit0 (14.4s), retaining original log/traces.
The first full domain attempt ends exit1/TimeoutExpired180s at certificate PDF;
three concurrent pdftotext cases were waiting, no complete aggregate/footer.
No cause inferred beyond those observations. New fresh full-domain cache/run
uses approved execution permission, preserving the180second file deadline.

Fresh full-domain cache completes893/893 tests across128 files, every plan,
footer and exit checked, zero fail/skip/cancel and aggregate exit0. PDF5/4/4
complete in the fresh run. Expanded built choice3 completes PASS under30second
CI test budget; supplemental native fixture4 completes PASS exit0 (28.6s),
including authored spaced visibility/tracked flags, old full22 checks unchanged.
Full172 SCORM browser acceptance is now running; no complete full-browser claim.

Parent227 original9d7b/run37892225012 completed all10 jobs/logs:
867 domain/237dev/237built/SidePanel4; actual threeOS runtime16/Pear13/1.2=13/
2004=22/five clean exits+quitAcknowledged each. This is historical after04e299
merged the scheduling ceiling; current run37893318621 still pending.
Parent2268f706306/run37893220968 Windows fails2004-3 fixture shutdown after
app-closed before database-closed: nativeExit0/quitAcknowledged true, fixture
forced/null exit;2004-4 not run. Original log retained, cause unproved. Linux/
macOS complete2004=21/five clean exits+ACK each; Pear/run still pending. No
current-head READY or complete actual-platform assertion based on descendants.

SCORM1.2 Conformance Requirements also explicitly requires isvisible to be
Boolean: https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_ConformanceReq.pdf
and CAM item diagram binds it to boolean:
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_CAM.pdf
The distributed imscp_rootv1p1p2.xsd declares xs:boolean. IMS2001 schema
update's boolean→string note concerns the DTD, not this XSD; no generic string
normalization is applied. Named all-four-edition visibility remains covered.

Full172 SCORM built browser completes169PASS/3FAIL exit1 (7.3m):
2004-4 pipwerks support download waits until60second deadline;2004-3 target
navigation reports DOM.describeNode/Internal server error/session closed;
managed ServiceWorker registration is denied. Logs/traces are retained, cause
unproved beyond observed policy/error. All changed choice3 and supplemental
native4 pass, as do binding/provenance/URI/Close/reload related journeys. This
is not clean full local acceptance. Final893 domain/128files, typecheck/build,
focused26 and focused built7 all complete PASS exit0; current-head CI/native
threeOS/review gates remain required. No quota/assertion/retry changes.
