# ADR-178: native full-comment and interaction collection evidence

Epic #133; successor stacked immediately on unmerged #252 head12dc3757.
ADR-177 admits250 full4000-character learner comments through bounded shared
transport. Extend the real native fixture with three explicitly named
full-comment collection profiles, reusing the original ADR-174 interaction
vector and ADR-177 comment vector. Keep the four original native lanes and
three small collection lanes separate.

Each new lane preserves250 interactions,100 objectives,2500 nested objective
IDs,2500 choice patterns and250 comments with4000 supplementary Unicode
scalars, exact location and timestamp. Verify the SCO values on first launch
and resume and read the committed SQLite state independently. Retain3500
real journal entries and250 server-derived response origins. Actual payload
must exceed2MiB and stay below the finite shared comment allowance. Drop the
successful large-checkpoint ACK and require exact payload/receipt/revision
retry, human Close/resume, genuine Finish yielding one proof/no certificate,
identity revocation, MCP separation and all existing dynamic-egress checks.

The fixture driver polls only the small command endpoint every200ms; database
evidence remains independently read by the controller/state checks. The
supplemental Chromium full-comment tests additionally observe the actual
resumed SCO entry/bookmark before waiting for the egress probe. Original
seven tests keep their existing sequence. Each assertion retains5000ms and
the whole test retains60000ms; native and fixture shutdown predicates and
deadlines remain unchanged. This staged observation is not a claim that the
combined Close/launch/egress sequence completes in5000ms.

Expected actual native counts per OS:16/13/13/31/31/32 plus15/15/15 and
16/16/16. Eleven Pear/SCORM fixtures must shut down cleanly, with ten SCORM
fixtures recording six ordered phases and direct finite databaseCloseMs.
No engine, product quota, capability, transaction or proof behavior changes.
v50 SHA e692d42794558b5ec312207caef86327ca0e7d87e37fdfabad3bf3cd76eed9bc;
1.2 SHA eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642.

Completed local evidence:
- Build/typecheck exit0; focused24 domain PASS/exit0(34.75s), including eleven
  graceful IPC fixtures, six collection and seven comment checks.
- Ten supplemental fixture journeys PASS/exit0(1.8m). All original seven and
  three combined profiles retain exact ACK/retry/resume/Finish assertions.
- Original ten-profile run9PASS/1FAIL/exit1 and candidates1PASS/2FAIL,
  2PASS/1FAIL and0PASS/3FAIL remain retained. Full trace/network/context data
  identify the same expected2/received1 resume-probe observation timeout;
  increasing polling frequency alone or waiting for client ACK did not fix
  it. Some probes arrived within the nominal deadline after the last sampled
  value; other runs still performed Close/large initialization at that point.
  No historical engine/storage root cause is inferred. Final tests observe
  actual resumed entry before the unchanged probe assertion.
- Full147-file domain aggregate exit1:146 complete files1102PASS; country
  registry timeout180s/exit124 after eight intermediate subtests/no footer.
  Affected country-only recheck9PASS/exit0(170.73s) within the unchanged180s
  deadline. Exact file set/TAP plans/five footer counts/per-file exits checked;
  union147files1111PASS coverage is not a clean full-run PASS.
- Fixed184 browser170PASS/14FAIL/exit1(14.9m); all full trace/network/context
  artifacts,184 per-case results and failed status inspected. Seven native
  fixtures time out at initial lost-ACK/probe/resumed-entry observations;
  managed ServiceWorker enumeration denied; five sequencing heading checks
  report DOM.describeNode/session closed; third session-time Close/resume
  reaches60000ms with Introduction disabled. Causes other than the explicit
  managed ServiceWorker denial remain UNPROVED. Original checkpoint/probe failures and partial expected2/received1
  observations retained. No clean full browser PASS claim. Affected seven
  native fixtures rechecked separately after full domain/browser finish:
  7PASS/exit0(1.2m); full per-case results/footer/failed status inspected,
  unchanged deadlines/predicates. This does not erase the original14 failures.
- Own exact-head CI/full logs/fresh reviews and actual combined full-comment
  WebView proof remain required; Chromium does not substitute for it.

Parent#25151569431 READY own37953704002/all10 full logs/fresh reviews0:
1101domain/243dev/243built/SidePanel4; Linux/macOS/Windows original counts
plus15/15/15, eight clean shutdowns/seven ordered-phase SCORM fixtures/direct
finite DB-close times. Parent#25212dc3757 READY own37956753061/all10 full logs/fresh reviews0:
1108domain/246dev/246built/SidePanel4, actual3OS original+15/15/15 with eight
clean shutdowns/seven six-phase SCORM fixtures/direct finite DB-close times.
Its full1471108domainPASS/fixed181178PASS3FAIL/all artifacts retained, as are
all original failures/retries and unproved causes. Broader simultaneous SPM,
complete API/DM/URI/response/time/sequencing/equivalence matrices stay OPEN.
Licenses/authorized authoring exports/Rustici account/actual Safari+Android/
reviewed production inputs stay BLOCKED. Epic OPEN; production DISABLED.

Independent successor counterexample:100 trusted LMS comments with4000
Unicode scalars,250 learner comments and the original interaction collection
are individually accepted by strict typed replay, but their combined real
state/journal6230508-byte checkpoints exceed the current6097652-byte allowance
and all three service profiles refuse them (original3 failures/exit1). The
first direct-validator-only probe passed all three and does not prove service
acceptance; the subsequent real SQLite service refusal is retained separately.
This fixture-only PR does not fix the combined LMS-comment transport gap.

Fresh fourth-edition normative PDF fetches at both mirror and ADL returned
HTTP403/exit22; the existing
ADR-105/177 reference is retained without claiming fresh source verification.
