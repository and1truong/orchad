# ADR-179: bounded combined learner and trusted LMS comment transport

Epic #133; successor stacked immediately on #253 head d433c629. An original
three-edition real-service probe accepts typed state but refuses the combined
100 trusted LMS comments/250 learner comments/collection/3500-entry journal:
6230508 bytes exceed6097652. A preceding direct-validator-only3PASS is not
service acceptance. Preserve both original probes and all three refusals.

Extend the existing shared actual-byte comment allowance to first100 canonical
own LMS comment strings alongside first250 learner comments. Every caller
already uses this helper: built queue, typed validator, transactional service,
credentialless HTTP. Parser maximum is finite11037552+32768; other state,
shared data and journal together retain ordinary2MiB. Own non-array records,
canonical indices, bounded UTF16/Unicode strings and exact JSON UTF8 bytes
remain required. Malformed/inherited/noncanonical/oversized strings and LMS
indices100+ gain no extra allowance. Engine typed limits, localization,
read-only seed comparison, identity/CAS/hash/exact receipt/rollback,4096/2MiB
journal,16-entry queue,64MiB tenant and2048-receipt limits remain unchanged.
No engine/adaptation bytes change: v50 SCORM2004 SHA
`e692d42794558b5ec312207caef86327ca0e7d87e37fdfabad3bf3cd76eed9bc`;
1.2 SHA `eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642`.

Original fixture operations preserve all350 comments with4000 supplementary
Unicode scalars, exact1050 location/timestamp/comment fields,250 interactions,
100 objectives,2500 nested objective IDs,2500 patterns and250 original response
bindings. Three domain journeys cover queue refusal, ordered3500-entry journal,
exact service/HTTP receipt retry, atomic forged owner/LMS fields/extra LMS row/
malformed model/ordinary byte overflow/oversized journal/wrong-origin refusal,
SQLite reopen and human Close/resume. Extend existing comment-byte boundary
check to both families and their finite escaped-scalar maximum.

Three new built journeys keep original learner-only and small-collection cases
separate, lose a successful real6MB checkpoint ACK, retry the exact bytes with
one revision/receipt, inspect SQLite, human Close/resume all fields and genuinely
Finish with one proof/no certificate. The three existing full-comment native
profiles additionally preload100 LMS comments from a fixture-only trusted SQL
seed before actual HTTP bootstrap, verify all300 LMS fields and404 readonly
refusals in the SCO and independent SQLite reads. Original four native and
three small-collection lanes remain separate. New combined native counts become
17/17/17; eleven clean fixtures/ten ordered six-phase/direct finite DB-close
records remain required. All assertion/test/native shutdown deadlines unchanged.

Completed local evidence:
- Build/typecheck exit0; original focused27domain PASS/exit0(82.73s).
- Initial three built browser cases FAIL/exit1: full traces/network/context show
  `LMS comment count lost` before the large checkpoint. The fixture wrapped its
  own service instance while the HTTP app uses a separate instance. Corrected
  fixture-only preload runs on the exact new launch before real HTTP bootstrap;
  no product initialization change or lost-ACK assertion weakening.
- Affected three domain cases PASS/exit0(44.54s) after correcting preload;
  corrected built three PASS/exit0(54.1s), all per-case/footer/status checked.
- Original ten supplemental native fixtures8PASS/2FAIL/exit1(1.7m): second
  initial lost-ACK/probe5s observation and third resumed-entry5s timeout.
  Full traces/network/context inspected, no page errors; second large
  checkpoint still in flight at timeout, third shows intentional503 then
  exact retry200 and a2.06s Close checkpoint before launch. Historical causes
  remain UNPROVED. Affected two-only recheck2PASS/exit0(29.4s), all per-case/footer/
  status inspected, identical code/deadlines; original8/2 retained.
  Original full148-domain/fixed187-browser runs were interrupted by the
  managed environment transition:112 completed domain file summaries826PASS,
  browser stopped after67 results66PASS/1FAIL, no aggregate footer/process
  exit. Both old session IDs disappeared; no matching live processes remained.
  Second asset heading failure includes DOM.describeNode/session closed; all
  full trace/network/context inspected, cause UNPROVED. Original partial logs/
  artifacts retained; fresh runs use separate paths. Fresh full148domain
  completes1114PASS/exit0 with all per-file cases/TAP plans/five counters/
  durations/exits and aggregate footer inspected. Fresh fixed187 browser completes
  182PASS/5FAIL/exit1(14.2m), all187 results/footer/status and all five full
  trace/network/context artifacts inspected: second asset and fourth retryAll
  heading DOM.describeNode/session closed, managed SW enumeration denial, and
  third/fourth combined native resumed-entry5s observations. Native traces
  preserve intentional large503/exact retry200, Close200 and new launch:
  third Close1.515s/new checkpoint still in flight; fourth Close2.057s/no
  new checkpoint observed yet. No page errors; historical heading/native
  causes UNPROVED. All three new combined built journeys pass in this full
  run. Original failures/interrupted runs and separate affected results are
  retained; no clean full local browser PASS claim. After the full run, the
  affected third/fourth native-only unchanged recheck2PASS/exit0(31.1s), all
  per-case/footer/status read, same predicates/deadlines; full182/5 retained.
- Own exact-head CI/all completed full logs/fresh reviews and actual combined
  three-OS WebView proof remain required; Chromium is supplementary.

Parent#25212dc3757 READY own37956753061/all10/full logs/fresh reviews0:
1108domain/246dev/246built/SidePanel4; actual3OS original+15/15/15,eight clean/
seven six-phase/direct finite database-close records. #253d433c629 READY own
37962021002 all10 completedSUCCESS/full logs/fresh head/reviews0:
1111domain/249dev(11.8m)/249built(11.2m)/actual SidePanel4(28.9s),
actual Linux/Windows/macOS original16/13/13/31/31/32 +15/15/15 +16/16/16,
eleven clean fixtures/ten ordered six-phase/direct finite DB-close records.
Local full147 aggregate exit1(country180s timeout) plus
country-only9PASS gives union1111, fixed184170PASS14FAIL plus affected native
seven PASS separately. All original failures/retries/unproved causes retained.

The existing ADR-105 fourth-edition RTE4.2.3/4.1.1.3 LMS-comment reference is
retained; fresh mirror/ADL PDF and fourth part100 HTML fetches403, third HTML hub do not verify the
normative source. Original shell RFC2141 fetches at RFC Editor and IETF403 are retained;
managed shell allowlist excludes these hosts. In the restored environment,
web connector reads RFC2141 at https://www.rfc-editor.org/rfc/rfc2141.html
in full; the namespace/percent/NUL/lexical-equivalence clauses are available
for subsequent DM-02 work. Web search also returns primary fourth-edition
Testing Requirements indexed REQ_58/58.3.2 (100 comments/4000 characters),
https://adlnet.gov/assets/uploads/SCORM_2004_4ED_v1_1_TR_20090814.pdf;
direct open fails, so this is indexed clause evidence, not full PDF review.
The www-hosted result is inconsistently labeled third edition and is not
used to establish fourth-edition identity. Other edition/source/equivalence
matrices remain OPEN.
Broader simultaneous maximal response/SPM combinations can exceed transport
and64MiB tenant storage; this named finite repair is not full SPM conformance.
Licenses/authorized authoring exports/Rustici account/actual Safari+Android/
reviewed production inputs BLOCKED. Epic OPEN; production DISABLED.
