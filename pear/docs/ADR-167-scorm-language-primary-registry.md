# ADR-167: shared ISO primary language membership

Status: implemented; full acceptance and owner CI pending. Epic #133, successor
of ADR166 / PR241 exact95d1f108. Original unchanged-parent probes6tests0PASS/
6FAIL and six-field raw/facade three-edition36tests0PASS/36FAIL exit1 demonstrate
unregistered ISO two-letter zz admission. Original logs/probes retained.

Use one installed shared primary pattern in CMILang and all five localized
patterns, not caller-specific guards. Reject unknown two/three-letter ISO primary
codes and unassigned ordinary one/four-to-eight-letter primaries with406, preserving exact case/text and failed append/replacement/preload/
server transaction atomicity. Keep empty preference/default, nonempty localized
language, 250 tag capacity, existing Unicode scalar/body capacities and delimiters.
Read factual registry snapshot only at checksum-locked installation, no runtime
network, label/Intl.Locale inference or new dependency.

Snapshot sources (facts only; no reference implementation/test corpus):
- LOC ISO639-2 bibliographic/terminology current table,487 rows:506 distinct codes.
  https://www.loc.gov/standards/iso639-2/ISO-639-2_utf-8.txt
- IANA file date2026-09-17, reviewed2026-10-09:190 current/historical two-letter
  registrations, including bh/in/iw/ji/jw/mo/sh absent from current LOC alpha2.
  https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
- LOC changes: retain historical jaw/mol/scc/scr, without canonicalization.
  https://www.loc.gov/standards/iso639-2/php/code_changes.php
- ISO reserved local-use range qaa–qtz retained (520 codes).
Canonical factual snapshot SHA256 ba31ec9e26eceaf7a82e2019f5b6c1700d5d03506cecf8b0dee0ddec721e9f5b;
this is the repository JSON hash, not a claimed original network-byte hash.
Shell LOC fetch403 retained; facts extracted through readable source pages with
all487 LOC row positions and the complete two-letter IANA section checked.

Scope: registered ISO primary codes and reserved i/x prefixes. Reject ordinary
one-letter and 4–8-letter reserved primaries; ADR115 subcode policy remains unchanged. IANA i-prefix membership, registered country/subcodes,
undefined additional-subcode requirements/equivalence and exhaustive edition
matrix remain OPEN, with no external-license blocker inferred for those vectors.
Private i/x spellings, case/multiple subcodes/local-use/historical text stay exact.
No blanket modern BCP47/country/canonicalization policy. Independent1.2 plain
characterstring language remains unchanged.

Requirements reviewed: ADL third-edition RTE1.0 §4.1.1.7(pp75–76), fourth-edition
RTE1.1 §4.1.1.7(pp73–74), second-edition addendum1.2 §2.9/§3.1(pp34/84) covering
RFC3066 part bounds and empty preference; exact original legacy RTE PDF remains
unresolved (old URL returns HTML, not a reviewed PDF).
https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_2004_Addendum1.pdf

Checksum-locked pear-language-primary-registry-v44,2004 ESM SHA256
a8a7d45aae0d80cd982ab7260c2279b304e5da5f364622a636f5f879e426c9a3;
1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Exact v43 forward/reverse input and every historical pin retained;
unknown bytes/version still refused. Trusted v43 snapshot markers remain accepted
while invalid language snapshots fail closed without rewriting historical data.

Original36 regression replacements pass/exit0. Additional three-edition vectors
exercise all1220 factual/local-use codes with exact uppercase/subcode text,
strict preload across six writable plus readonly LMS-comment field, and typed
forged all-six-field rollback/exact receipt/SQLite close-reopen/v43 resume with
no official proof/certificate. New named native guard covers preference qtz and
historical localized scc plus ten406 refusals, all previous301/403 absence and
history/recovery/proof guards retained. Counts become runtime16/Pear13/1.2=13/
2004-2=25/2004-3=25/2004-4=26. Actual OS logs still required before native PASS.
Built preference-language journeys retain all lost ACK/exact retry/close-resume/
capacity/proof checks and add all six fields. Supplemental native4+built3 complete
7PASS exit0(36.5s), no actual-platform claim.

Initial focused90tests87PASS/3FAIL exit1 retained: durable test fixture attempted
to replace the manifest-preloaded immutable objective ID. Correct fixture uses
existing primary ID, without product validation relaxation. Corrected focused,
fresh full domain and fixed full172 browser remain pending until full footers/
counts/exits and traces inspected. Initial wrong-cwd editing/absent test invocation
exit1 retained; no success inferred from that diagnostic.

Parent2405e9/run37922413556 READY own10/latest full logs/fresh review, Pear993/
237dev/237built/SidePanel4, native3OS16/13/13/24/24/25 and five clean ACK/both exit0/
no forced each. Parent24195d1/run37924833794 CI pending; direct db-close metadata
is diagnostic only, no original Windows forced-failure cause or repair established.
Owner222e2b current CI absent/Draft; historical10dc proof is not current proof.
Chromium151 supplemental; supported153 downloadCDN403. Local historical failures
retained. Full matrices OPEN/license/authorized exports/Rustici account/actual
Safari+Android/reviewed production inputs BLOCKED. Epic OPEN; production DISABLED.

RFC3066 §2.2 reviewed directly: two/three-letter assignments are ISO639-1/2;
i/x reserved; other primary values unassigned without revision. Second-edition
addendum §2.9 explicitly references RFC3066. SCORM third/fourth permits both
bibliographic/terminology spellings, so do not apply RFC3066 preferred-code
rewriting to accepted authored text.
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2
Original separately executed30 reserved-primary cases0PASS/30FAIL exit1 retained
(a/A/abcd/abcdefgh/abcd-US × raw/facade × three editions). Earlier six-case probe
fails at a before later loop values; initial scratch-copy substitution did not
change zz and is not reserved-primary proof. Expanded probe establishes all five.
Initial ISO-only candidate bf5dd167, corrected focused90PASS exit0(44.2s), fresh
full1038PASS/139files exit0/all exact file plans/footers/counts/exits inspected,
and built3/native4 7PASS exit0(36.5s), retained as intermediate evidence. Final
v44 a8a7d45a additionally refuses reserved ordinary primaries through the same
six patterns; refined validation is pending, no reuse of intermediate full PASS.
Native guard now ten406 refusals per initial/resumed probe with original guards.

Refined accepted v44 a8a7d45a: typecheck/build exit0; focused90PASS/zero fail/cancel/skip exit0(44.4s); built3/native4 7PASS exit0(35.6s). Fresh full1038PASS/139files aggregate exit0; all exact package filenames/plans/footers/five counts/per-file exit0 inspected. Fixed full172 browser now running; no pending full PASS. Controller syntax and engine/current1.2 hashes verified.

Parent24195d1/run37924833794 READY on own10/all latest full logs/fresh empty reviews. Pear993/237dev/237built/SidePanel4 plus host3/browser-host2/real Lime/SCORM-host1; native3OS16/13/13/24/24/25 and five clean ACK/both exit0/no forced each. Direct SCORM close durations1.2/2nd/3rd/4th: Linux4.954/8.776/4.512/5.759ms(Node24.21), macOS63.206/88.453/16.874/16.683ms(Node24.20), Windows88.905/240.377/105.970/149.012ms(Node24.21). All four per OS complete six phases/fixtureClosed/errorBytes0. Actual successful instrumentation established; no original forced-failure cause/repair inferred.

Final accepted v44 a8a7d45a local validation completed: fixed full172 browser166PASS/6FAIL exit1(7.4m). All six complete trace/network streams and full error contexts inspected: fourth-edition interop support download60s timeout; third-edition navigation-target heading DOM.describeNode/session-closed; managed ServiceWorker enumeration denied; third-edition retry/retryAll and fourth-edition retryAll heading DOM.describeNode/session-closed. Intermediate polling mismatches are not separate terminal failures. Download/DOM causes remain unproved. All changed built-language3 and supplemental native4 journeys passed within this full run. No assertion/deadline/retry/policy changes or unrelated rerun. Full local browser is not PASS. Refined full domain1038/139files, focused90, typecheck/build and separate built3/native4 completed PASS/exit0 as recorded above; own PR/head CI remains pending until inspected.

Independent successor original36 tests0PASS/36FAIL exit1 confirms unregistered i-madeup accepted across six fields/raw+facade/three editions after valid i-klingon controls. Official IANA registry2026-09-17 contains13 historical i-prefix registrations (including deprecated tags); factual draft and forward/reverse candidate prepared separately, not yet accepted-tree or CI proof. Country/subcode/equivalence and exhaustive edition matrix remain OPEN. Epic OPEN; production DISABLED.
