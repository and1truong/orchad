# ADR-151: Validate contemporary URI components without changing legacy binding

The shared long/short identifier character whitelist refuses RFC3986 IPv6 and
IPvFuture hosts and admits malformed authorities (for example an alphabetic
port or a second unescaped userinfo separator). ADL third/fourth-edition
RTE4.1.1.7 identifies RFC3986 for both identifier types. RFC2396 instead admits
registry authorities containing colon and @ as data. Applying the contemporary
grammar to the historical second-edition profile would introduce a regression.

`pear-uri-authority-v40` adds a checksum-locked successor (2004 SHA256
`9ba7375b3f88be0bf54cf02ed4220346f5fbee12de8fa23ac723ba6fe0d0d35c`).
The installer assembles RFC3986 Appendix A grammar for component placement,
authority/userinfo/reg-name/digit-only port, nine IPv6 forms with strict embedded
IPv4 octets, IPvFuture, and relative first segments/query/fragment. Brackets
belong only around an IP literal host. Generic empty authority/port and large
digit-only port values are admitted; no HTTP/DNS/TCP or WHATWG normalization is
applied. Authored case, escapes, order and bytes remain exact. Existing URN,
NUL, fragment, nonempty and250/4000 limits remain enforced.

One engine implementation runs in isolated module closures for contemporary and
legacy URI tables. Third/fourth editions select the contemporary constructor;
second edition retains its exact v39 lexical policy. No shared regex mutation,
new dependency, package-export change or duplicated engine source is required.
Construction, trusted sequencing/selection/navigation copies, strict preload,
response-origin validation probes, queue reload guard and server typed replay
carry the same constructor/profile. v39 and all previously admitted sequencing
envelopes remain supported without rewriting snapshots, receipts, history or
proofs. SCORM1.2 is unchanged. Full RFC2396 structural validation, its errata and
edition-specific IPv6 update policy remain OPEN; legacy compatibility is not a
claim of complete second-edition conformance.

Original unscoped IP-literal regressions complete0PASS/3FAIL exit1 (including a
second-edition compatibility trial, not a normative RFC3986 assertion for that
edition). Initial shared contemporary-only draft focused28/full844 across125
domain files complete PASS/exit0. Initial build fails for a missing declaration
of the exported installer test helper; corrected build completes exit0. A later
edition-scoped draft focused41, typecheck and build complete exit0; final full
domain and built/browser acceptance are required after the added preload,
interleaved-write and reset isolation regression. Built runtime477.14KB retains
one implementation rather than doubling the bundle.

The initial focused built13 run completes9PASS/4FAIL exit1: three native fixture
resume probes fail because this draft placed URI records in the objective
collection whose absence is checked on every launch. URI probes now use the
existing separate interaction1 objective collection; all absent301/unset403
assertions remain unchanged. One2004-2 provenance click timeout remains
unattributed. Original logs/traces are retained; a changed rerun cannot prove
driver causality or a clean full suite.

Original vectors cover all IPv6 compression positions, embedded IPv4,
IPvFuture, escaped reg-name/userinfo, relative components, generic empty and
large ports, malformed bracket placement, invalid IPv6/IPv4/version/port,
unescaped delimiters/controls, typed leaf/count rollback, durable4000-character
IDs and full-capacity choice state, forged and legacy refusal, exact receipt
retry/reopen/resume with zero official proof. The built identifier journeys add
both edition matrices to their existing lost-ACK/full-capacity/Close/resume
checks. Native fixture evidence adds exact URI preservation and malformed
authority406/count rollback through durable resume, preserving the absent-record
probes and every authority/recovery/capacity/proof/cleanup assertion. Actual
three-OS acceptance must verify2004=20,1.2=13 with clean native/fixture exit0 and
quit ACK on the final head; Chromium fixture evidence is supplementary.

References:
- ADL third-edition RTE4.1.1.7 and revision history (RFC2396 replaced byRFC3986):
  https://upload.aura-software.com/files/20191008081839-de8fbb595231f8557780f59e3a0ae316f2a2abbf/SCORM_RunTimeEnv.pdf
- ADL fourth-edition RTE4.1.1.7:
  https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
- RFC3986 Appendix A: https://www.rfc-editor.org/rfc/rfc3986
- RFC2396 Appendix A: https://www.rfc-editor.org/rfc/rfc2396
  The indexed second-edition RTE1.3.1 PDF path currently returns the site's HTML
  fallback; an exact accessible original and full legacy reference matrix remain
  required: https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_RunTimeEnv.pdf

Remaining URI/URN namespace and UTF8/equivalence/dependency matrices, all other
register requirements and journal compaction remain OPEN. Legacy ADL license/
platform, authorized commercial exports/Rustici account, actual Safari/Android
and reviewed production origin/storage/scanner/load/retention/RPO/DR evidence
remain absent. Epic133 OPEN; production DISABLED.

Edition-scoped final full845/845 across125 domain files completes exit0,
including isolated legacy/contemporary bound preload, interleaved writes and
reset. Final focused built22 completes22PASS/exit0: expanded identifier3,
native fixture4, reload guards3, Close refusal6, accepted bindings3 and first
provenance3. The three fixture resume failures are corrected without changing
any absent-record assertion or budget; the earlier click timeout remains
unattributed. A further all-five URI response-family/edition matrix passes in
the eight-test URI file, exit0. Fresh full846 and full172 browser are required
before publishing the successor; actual native/CI/review remain pending.

Fresh expanded full846/846 across125 files completes PASS/exit0; every file
footer/plan/exit is checked. The eight URI regressions include all five response
families under each selected edition binding. Full172 built browser acceptance
is running; no full browser/native/CI success is claimed before completion.

Final full172 built SCORM browser completes170PASS/2FAIL exit1: managed
ServiceWorker permission denial and2004-3 calendar DOM.describeNode/session
closed. Original logs/traces retained; driver cause unproved. All expanded URI3,
binding3/provenance3/guard3/Close6/native4 pass. Chromium151 is supplementary;
Playwright1.63 expects Chromium153. Installation to the user-specified browser
directory is blocked by CDN403 Domain forbidden, complete installer exit1; no
dependency, policy, timeout or assertion is changed. This is not clean full
local acceptance. Exact-head CI/native3OS2004=20/review gates remain required.


Head0ba183c7/run37888472163 attempt1 completes eight SUCCESS/two FAILURE.
Linux/macOS runtime16/Pear13/1.2=13/each2004=20 pass with five clean native/
fixture exit0 and quitACK records each. Windows113683752681 fails1.2 fixture
shutdown after app-closed, before database-closed; native exit0/ACK true, fixture
forced,2004 profiles not run. Cause unproved; original log retained. Pear
113683752715 completes846 domain/237 dev PASS; built236PASS/1FAIL exit1,
2004-3 bound-response correction click after resume waits for visible/enabled/
stable in a nested frame. Side Panel/host lanes not reached. Both binding and
first-provenance journeys now scroll the resumed outer iframe into viewport
and assert readiness before clicking correction. All recovery/state/proof
assertions and time budgets are retained; no forced click or retry is added.
This follows the existing interop readiness step. Original CI timeout retained;
changed journeys and complete new-head CI/log/review gates remain required.
No runtime, engine adaptation, source checksum or receipt/history change.

Changed built journeys complete6/6 PASS exit0 (2.1–2.5seconds each); footer and
process completion checked. Original failures remain retained. The current
head requires complete exact-head CI and native/review gates before READY.
