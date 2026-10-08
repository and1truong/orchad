# SCORM #133 completion register

Accepted baseline: main `016a040e76242d14e58d10623fdbc1ed94693bab`, tree
`949d0d96101e3d0b2506511583608bf6fa7311f1`, push acceptance 37722879153
PASS. Source stack has landed. Historical handoff heads/pending statuses are not
current blockers. This register indexes all remaining acceptance families;
clause-level expansion and exhaustive conformance are still required.

Statuses: TESTED means only named vectors/lanes; PARTIAL means implementation has
bounded evidence; OPEN means missing code or validation; BLOCKED means a named
external input is absent. No profile PASS means certification or full compliance.

| ID | Requirement / reference anchor | Current evidence | Outstanding work / exit criterion |
|---|---|---|---|
| API-01 | 1.2 eight LMS methods and communication lifecycle; 2004 RTE 3.1.2–6 | PARTIAL: player/2004/review tests and wrappers | Enumerate each method/state/argument/return combination per edition; fix mismatches |
| API-02 | 2004 RTE 3.1.7 errors, diagnostics and precedence; 1.2 RTE API errors | PARTIAL: lifecycle and Unicode readonly/undefined/dependency tests | Full supported error table, simultaneous-invalid inputs and preservation; browser/server agreement |
| DM-01 | 2004 RTE 4.1.1.7 characterstring/localized string/SPM | PARTIAL: ADR-095–097 | Language registry, every field/SPM and cross-field capacity combinations per edition |
| DM-02 | 2004 RTE 4.1.1.7 long/short URI identifiers | OPEN: upstream grammar not verified | RFC 3986 valid/invalid vectors, escaped delimiters, uniqueness/dependencies, exact storage |
| DM-03 | 2004 RTE 4.2 data model; 1.2 CMI | PARTIAL: shared facade and server typed replay | Every mandatory field/access/default/vocabulary/range/collection limit; no silent host-envelope incompatibility |
| RESP-01 | 2004 RTE 4.1.1.6 / 4.2.9.1a textual patterns | TESTED: ADR-098, responses domain/built-browser | Whitespace/newline/comma/property/repeated-record vectors covered; full type/edition/escaping matrix remains OPEN |
| RESP-02 | 2004 RTE 4.2.9 learner/correct responses | PARTIAL: ADR-097/098 | Identifier types, semantic set uniqueness, replacement limits, numeric ranges, escaped separators, every interaction type |
| TIME-01 | 2004 RTE 4.1.1.7 / 4.2.21 / 4.2.25; 1.2 timespan | OPEN: centisecond and 365/30 reported-time policy | Reference-aligned calendar-unit accounting and overflow/precision/reset behavior without changing accepted history |
| TIME-02 | IMS SS limitConditions and XML dateTime/duration | PARTIAL: ADR-088/094 | Full admitted standard duration/date binding, authoritative clocks, all boundaries and rollback/reopen |
| LIFE-01 | Status/success/completion/credit/mode/entry/exit | PARTIAL: player/learning/2004 tests | Enumerate statuses and lifecycle transitions, reference reset/retake semantics and exactly-once time/proof |
| SEQ-01 | 1.2 CAM prerequisites; 2004 S&N activity/rules/navigation | PARTIAL: ADR-078/080/083–094 | Clause-level delivery/rule/branch/objective/rollup/attempt matrix and independent expected traces |
| STORE-01 | 2004 fourth-edition shared data/system maps | PARTIAL: ADR-089–091 | Full mapping/reference semantics with existing live authority, explicit deltas and unofficial separation |
| DUR-01 | ACK, retry, restart, conflicts, receipts, history | PARTIAL: SQLite/reopen and browser counterexamples | Same recovery suite on every required actual engine plus production load/recovery |
| PKG-01 | CAM ZIP/XML/resources/lifecycle/version/import/export | PARTIAL: package/foundation/review tests | Reference package corpus and real scanner/storage; immutable original/version/hash and failed-import cleanup |
| BOUND-01 | Epic credentialless origin/channel/attempt/host boundary | PARTIAL: loopback content host and adversarial tests | Real deployment isolation; no Pear/agent/native credentials or cross-attempt access |
| BOUND-02 | Epic strict-egress/network/navigation policy | OPEN: fixture CSP is not all-egress enforcement | Actual dynamic requests, self-navigation/redirect, popup/worker/media/iframe tests; unproved platform fails closed |
| OPS-01 | Epic scanning/storage/load/retention/archival/purge | OPEN: bounded local operations | Reviewed policy, executable implementation and real storage/scanner/load/retention evidence preserving official proof |
| OPS-02 | Epic backup/restore/RPO/DR/revocation | PARTIAL: whole-DB offline recovery | Chosen deployment/load/RPO targets and real failure/restore/revocation evidence |
| REF-01 | ADL/reference suite and provenance | BLOCKED: legacy license/platform unresolved | Resolve exact license/platform or independently implement requirement-equivalent original vectors; no certification claim |
| REF-02 | Storyline/Captivate/Rise + Rustici differential | BLOCKED: authorized exports/account not supplied | Same licensed package hashes; compare completion/success/score/time/navigation/resume; fix required differences |
| PLATFORM-01 | Windows WebView2, macOS WKWebView, Safari/Android | BLOCKED: actual platforms/runners unavailable here | Actual playback/authority/recovery/egress traces; Chromium viewport is not substitute |
| PLATFORM-02 | Native Chrome Side Panel container | OPEN: extension-page harness only | Actual container consent/rebind/revoke/player journey, recorded evidence |
| FINAL-01 | Epic requirement review and #49 G05/G10/G14/G18 | OPEN | No unresolved required code/validation/platform/production gate; integrated and main CI on exact heads, docs/ancestry verified |

## Execution order and dependencies

1. Expand API/DM/response/time/sequencing rows into standard-specific expected
   vectors; ship root fixes with shared browser/server replay and durable tests.
2. Investigate BOUND-02 now: ordinary content-host CSP does not enforce arbitrary
   JavaScript self-navigation on every browser. Do not remove the loopback guard
   until a concrete supported deployment/platform enforcement path is proved.
3. Implement operations against reviewed storage/scanning/retention policy;
   prepare license-approved corpus/account and actual platform runners concurrently.
4. Run one full integrated acceptance tree; repair review findings at their owner,
   update support/acceptance/#49 evidence, and verify main after authorized landing.

Independent coding does not wait for commercial accounts. External access does
not turn missing semantics into approved exceptions. xAPI/cmi5/AICC/LTI stay in
#143–146; they are not prerequisites to finish this epic. Production stays disabled.
