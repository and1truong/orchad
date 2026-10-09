# ADR-164: sequencing objective XML anyURI binding

Status: original regression reproduced; implementation/owner validation pending.

Published IMS objective and sequencing-rule XML schemas bind objectiveID,
mapInfo targetObjectiveID and ruleCondition referencedObjective to xs:anyURI;
ADL fourth-edition objective/mapInfo bindings use the same type. Its XML
whitespace facet collapses outer XML space/tab/LF/CR. Original independently
authored probe on unchanged ADR162 tree completes0PASS/11FAIL exit1: three
editions × three IMS names plus two fourth-edition ADL names. IMS names persist
noncanonical whitespace; ADL objective names may fail the IMS extension join,
and ADL targets become a distinct map rather than the canonical target.

Primary binding requirements reviewed, no reference implementation/test copying:
- https://www.imsglobal.org/node/52631 (XML Binding3.4.5)
- https://github.com/adlnet/SCORM-2004-4ed-SampleRTE/blob/master/xml/xsd/imsss_v1p0objective.xsd
- https://github.com/adlnet/SCORM-2004-4ed-SampleRTE/blob/master/xml/xsd/imsss_v1p0seqrule.xsd
- https://github.com/adlnet/SCORM-2004-4ed-SampleRTE/blob/master/xml/xsd/adlseq_v1p3.xsd
- https://www.w3.org/TR/xmlschema-2/#anyURI
- https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace

Reuse xmlAtomicToken at all five shared logical-name reads, before existing
4000-character, nonempty, per-activity/per-map duplicate and ADL-to-IMS join.
Do not normalize CP/RTE/client identifiers, URI case/escapes or objective access
permissions. Original XML/ZIP/hash stay exact, system objective persistence
remains tenant/learner scoped, and manifest-created read/write flags stay the
only source of authority. No new general URI grammar, internal-whitespace
admission, case folding, optional-objective semantics or full anyURI claim.
Existing bounded profile and full binding/schema semantics remain OPEN.

Named original domain vectors cover all field groups/all four XML whitespace
kinds, immutable bytes/hash/logical4000 bounds, blank/duplicate/4001 refusal,
exact non-XML Unicode/case/percent identity, ADL canonical join and unchanged
explicit permissions. Durable three-edition local/system vectors retain locked
objective gates, accepted receipt replay, SQLite close/reopen/suspended resume,
canonical learner-scoped backing IDs, forged-map refusal and one official
rollup proof/no certificate. Built three-edition system-objective journeys
retain lost-ACK/retry/resume/next-SCO/official-proof checks. Native absent
objective301 vectors must not be replaced by preloading synthetic objectives;
the original
SCORM native fixtures retain their absent-objective state. Actual existing
native runtime/authority/absence/
journal/recovery/shutdown checks remain required on this owner.

Engine remains v42SHA0447a6/1.2eb7539. Local Chromium151 supplementary;
supported153 download blockedCDN403. Historical Windows forced cleanup and
unchanged retry results remain retained/unproved; ADR162 measures phase times,
not a cause or repair. Owner222 current CI absent remains Draft; descendant
proof cannot replace owner gates. MatricesOPEN; license/authorized exports/
Rustici account/actual Safari+Android/reviewed storage/scanning/load/retention/
production inputsBLOCKED. Epic133OPEN, productionDISABLED.

ADR164 implemented five shared XML objective-name reads using existing helper;
no product native fixture or engine changes. Original11FAIL probe retained.
Focused74PASS/zero fail/cancel/skip exit0 (21.9s); typecheck/build exit0,
accepted typecheck after new canonical target/learner assertions exit0.
Built system-objective3PASS exit0 (13.0s); supplemental native4PASS exit0
(27.9s), all absence/API/authority/journal/recovery/proof/clean-shutdown guards
unchanged. Native absent-objective301 checks are not replaced by artificial
preloaded objectives; actual executed objective-map evidence is domain/built,
not a new native objective-mapping claim. Fresh full984/137files/full172 now
running, no pending PASS or ownerCI readiness claim. Parent238259 Draft own CI
run37917819864; parent237ab82 Draft nine complete logs checked/three OS clean,
Pear pending. MatricesOPEN/externalBLOCKED; epicOPEN/productionDISABLED.

ADR164 fresh full984 domain/137files completes984PASS/zero fail/cancel/skip,
every file plan/footer/five counts/exit0 and aggregate exit0 inspected.
Full172 browser still running on frozen source/build, no pending PASS claim.
Corrected interpretation of ADR162 timings: cumulative app-closed→database-
closed interval includes the preceding synchronous phase write. It narrows the
operation region but does not separately time DatabaseSync.close or prove
SQLite/WAL/driver cause. Node24.0 source review shows finalization/session/
SQLite close within the method; actual Windows runner is24.21.0, so source
version and future direct operation timing require their own evidence. Existing
five-second guard and every prior original failure remain unchanged/retained.

Parent237ab82 now READY: run37916286618 all10completedSUCCESS, all10latest
full logs/freshhead/review_threads[] checked. Pear964/237dev/237built/SidePanel4
plus host3/browserhost2/realLime/SCORMhost1; three OS actual16/13/13/24/24/25,
five clean ACK/exit0/no forced each and complete SCORM phase timing sets.
Cumulative Windows3.8s app/database gap is not a direct database-close duration;
preceding phase-write overhead is included. No original failure cause/repair
claim. Parent238 own gates pending; objective full browser still running.

Final fixed-tree full172 browser170PASS/2FAIL process exit1 (10.0m), both
complete trace/error contexts inspected. Fourth-edition support download60s
timeout/cause unproved; managed ServiceWorker permission denial. Changed
system-objective3 and supplemental native4 PASS inside full. No unrelated
rerun solely to obtain green counts; no clean full local/supported153/actual
native objective-mapping claim. Source/build/tests/timeout/assertion/retry/
policy unchanged during acceptance; engine hashes0447a6/1.2eb7539 verified.
Parent237 READY10/latestfull logs/fresh reviews; parent238 ownWindows/macOS
complete native logs checked:16/13/13/24/24/25, five clean ACK/exit0/no forced
each/complete monotonic phase sets. Parent238 Linux/Pear pending, Draft.
Original distinct RFC2396-empty absolute URI probe on unchanged ADR162 tree
6tests4PASS/2FAIL exit1; expanded separate-value12tests8PASS/4FAIL exit1,
only second-edition raw/facade accepts custom:/custom:#fragment incorrectly.
RFC2396 AppendixA requires nonempty hier/opaque part; RFC3986 admits path-empty
for contemporary profiles. Separate subsequent binding, no current URI patch.
Full matricesOPEN/externalBLOCKED; epicOPEN/productionDISABLED.
