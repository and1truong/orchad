# ADR-163: manifest-local collection XML ID/IDREF whitespace

Status: implementation and exact owner acceptance pending.

IMS SS XML Binding3.2 and published imsss sequencingType bind collection ID
to xs:ID and its reference to xs:IDREF. Both derive from NCName/token with
XML whitespace collapse. Outer XML space/tab/LF/CR around admitted collection
identifiers must resolve the same manifest-local definition. Original standalone
three editions × ID-only/IDREF-only/both probe completes0PASS/9FAIL exit1,
Unsupported sequencing before launch, all complete footer counts retained.
Primary sources reviewed without licensed implementation/test copying:
- https://www.imsglobal.org/node/52631
- https://github.com/adlnet/SCORM-2004-4ed-SampleRTE/blob/master/xml/xsd/imsss_v1p0.xsd
- https://www.w3.org/TR/xmlschema-2/#ID
- https://www.w3.org/TR/xmlschema-2/#IDREF
- https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace

Reuse xmlAtomicToken at the two shared collection-definition/reference reads,
before existing NCName/4000/duplicate checks and manifest-local lookup. Keep
reference scope, non-chainable definitions, validation of unused collections,
whole top-level group overrides and exact case/Unicode identity. No CP package
identifier/resource identifier/IDREF policy, RTE identifiers, objective anyURI
or general XML/schema admission change. XML ID normalization is not generic
Unicode trim. Existing bounded inline-ID/anonymous-definition profile remains
explicit; full schema/semantic matrix remains OPEN. Original XML/ZIP/hash and
trusted sequencing/receipt/clock/history/proof authority remain unchanged.

Nine original domain tests cover each edition: ID-only/reference-only/both;
all four XML whitespace kinds and literal mixed whitespace; ASCII/Unicode/
4000 logical IDs with byte/hash retention and whole-group overrides; blank/
internal/non-XML/malformed/4001/normalized-duplicate/dangling/case/chained/
unselected-definition refusal; locked objective gate, exact receipts, SQLite
reopen/suspended resume, next-SCO and exactly one official rollup proof with
no certificate. Existing built collection3 and actual native fixture import
whitespace collection references while retaining all earlier XML flag/token/
date/duration/ADL/shared-target, API/authority/journal/ACK/retry/resume/proof/
shutdown checks. No timeout/assertion/retry/policy relaxation.

An independent suspected unused NCName U+2028/U+2029 rejection defect did not
reproduce: original-tree6PASS exit0 with complete counts. No NCName regex patch.
No arbitrary Unicode case folding, URI canonicalization or schema-size claim.
Engine remains v42SHA0447a6/1.2eb7539. Full owner domain/browser/native/build/
CI/review validation required; no pending PASS/READY or certification claim.

Original Windows forced fixture failures remain retained/cause unproved; ADR162
phase measurements are diagnostics, not a proven product repair. Supported
Chromium153 install blockedCDN403, local151 is supplementary. Owner222e2b
CI absent; descendants cannot substitute owner proof. Full mandatory matrices
OPEN; license/authorized exports/Rustici account/actual Safari+Android/reviewed
production inputs BLOCKED. Epic133 OPEN, production DISABLED.

ADR163 implementation: two shared ID/IDREF reads use existing XML-only token
helper. Existing collection fixture gains optional manifest input and is reused
for native imports, preserving all previous authored sequencing bindings.
Corrected focused59PASS/zero fail/cancel/skip exit0; typecheck/build exit0.
Built collection3PASS exit0 (10.8s), supplemental native4PASS exit0 (27.3s).
Original probe9FAIL and NCName6PASS remain retained. Initial wrong-root runner
and wrong native filename diagnostics exit1/no tests retained; corrected paths
only, no source/assertion/deadline changes. Full973/136files and full172 running,
no pending PASS claim. Parent236 now READY: own10 completedSUCCESS/latestfull
logs/freshhead/review_threads[]; Pear964/237dev/237built/SidePanel4, all3OS
16/13/13/24/24/25 and five clean ACK/exit0 each. Parent237 diagnostics own CI
pending; no Windows failure cause or product repair inferred. MatricesOPEN,
external inputsBLOCKED; epicOPEN/prodDISABLED.

ADR163 fresh full domain973PASS/136files completes with zero fail/cancel/skip;
every file plan/footer/five counts/exit0 and aggregate exit0 inspected.
Build/source frozen for full172 browser; no pending browser PASS claim.
Original collection binding9FAIL and independent NCName6PASS retained.
Independent subsequent objective XML anyURI original probe11FAIL exit1 on
unchanged ADR162 tree, canonical manifest comparison; separate ADR164 work,
not part of this implementation. #222 current e2b owner again has no PR runs;
no skip-CI marker in commit message, cause remains unproved. No synthetic
workflow event, unrelated empty commit or descendant substitution.

Final fixed-tree full172 browser:167PASS/5FAIL process exit1 (8.5m), all five
trace/error contexts inspected. Fourth-edition download60s timeout/cause
unproved; managed ServiceWorker denial;2004-3 navigation target/retry/retryAll
next-SCO heading assertion failures (DOM/session evidence recorded in trace,
root cause unproved). Changed collection3 and supplemental native4 PASS within
full run. No unrelated repeat to obtain green counts; no clean full local or
supported153/actual native claim. Original full failure and diagnostics retained;
no source/build/test/deadline/assertion/retry/policy changes during acceptance.
Parent237 own Windows/macOS actual native full logs now inspected:16/13/13/
24/24/25, five clean ACK/native+fixture exit0 each. Measured Windows2004-3/4
app-to-database-close interval3804/3808ms; cleanup completes3810/3813ms within
unchanged five-second budget. This locates a slow synchronous operation in
successful measured runs, not the cause of prior forced failures. Linux/Pear
remain pending; no diagnostic owner READY or product repair claim.
