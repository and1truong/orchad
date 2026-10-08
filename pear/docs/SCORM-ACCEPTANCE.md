# SCORM #133 requirement acceptance

This is the current requirement disposition, not a scope reduction or certification.
Inherited implementation source: #164, 5281269795479540590176c07c7ce5570e4f1286,
tree 07fc9906a4aa1a87cfcdb41892d867fbbce03c92; ADR-075–097.
Local: 564 domain / 82 isolated files, 67 dedicated built Chromium journeys,
build/typecheck/vendor/actual installer PASS. Remote/integrated/main acceptance
is recorded against exact heads in #133, not inferred from these counts.

| Requirement | Implemented evidence | Outstanding acceptance |
|---|---|---|
| Multi-file ZIP, XML organization/resources/paths, immutable import/export | scorm-packages / engine-foundation tests; ADR-075/076 | Production scanner is not configured; parser PASS is not malware scanning |
| Quarantine/review/publish/version/retire/revoke | Package/player/review tests, immutable versions and current authorization | Actual production storage/scanner/deployment policy |
| Isolated content host, exact channel/capability/attempt scope | Player/browser/adversarial authority tests; ADR-077/080/081/093 | Credentialless production origin, all-egress self-navigation/redirect/worker/popup enforcement on each actual platform |
| Eight synchronous methods, lifecycle/argument/access/error APIs | scorm-player/scorm2004/scorm-review tests and licensed wrapper browser journeys | Exhaustive edition-specific error precedence, vocabulary/range/encoding combinations; no certification claim |
| CMI status, scores, location, suspend, preferences, comments, objectives/interactions | Runtime replay and Unicode/interaction tests; ADR-079/095–097 | Identifier URI grammar, remaining correct-response prefix/whitespace/language/error cases |
| Durable ACK, retry, reopen/restart, concurrent/stale/reordered writes | Player/learning/sequencing/system-store tests and lost-ACK built journeys | Additional real engines and production durability/load/DR |
| Commit vs Finish/Terminate, technical attempts vs domain retake | Runtime/sequencing/selection/duration tests; ADR-078/080/084/094 | Exhaustive reference lifecycle/reset/time behavior |
| Time and calendar | Reported centiseconds, trusted host duration clocks and calendar windows; ADR-088/094 | Year/month/finer-precision duration bindings and standard-aligned calendar conversion; existing 365/30 reported-time policy is not full conformance |
| SCORM 1.2 multi-SCO/AICC prerequisites | Learning/player/assets tests and 1.2 built workflow | Full recognized 1.2 prerequisite/data-model reference coverage |
| 2004 flow/choice/rules/rollup/local maps/retry/limits/selection/assets | Sequencing/selection/assets/duration tests; ADR-080/083–088/092–094 | Exhaustive branching/rule/error/delivery/reference suite |
| Fourth-edition shared data and system objective maps | Authorized delta stores and migration/reopen/backup tests; ADR-089–091 | Full licensed reference/platform/production validation; unofficial isolation is explicit Pear policy |
| Standalone/course/module/nested award/cycle proof | Learning/sequencing tests; trusted transaction, per-SCO policy, immutable proof, separate quiz certificate | Reference-specific proof/reuse/retake/issuer equivalence remains #49 scope |
| Preview/practice and agents | No official proof, redacted semantic context, scoped support packets, host-policy tests | Production/platform authority matrix; agents never impersonate SCO score/commit |
| Compatibility fixtures | Pinned licensed pipwerks and ADL developer-guide wrappers, synthetic multi-SCO/adversarial packages | Licensed Storyline/Captivate/Rise exports, ADL legacy license/platform resolution, authorized Rustici differential account |
| Browser/native/device lanes | Built Chromium, actual unpacked Lime, actual Linux Tauri/WebKit in acceptance workflow | Windows WebView2, macOS WKWebView, mobile Safari/Android and native Chrome Side Panel container |
| Operations/privacy | Diagnostics/log redaction/capacity/rollback/whole-DB backup/offline restore; ADR-082/090/091 | Reviewed production retention/archival/purge, immutable-proof preservation, load/RPO/DR/scanning/deployment |
| Delivery and register | G05/G10/G14/G18, support matrix/handoff reconciled through ADR-097 | Exact integrated head and main acceptance/ancestry verification; #133 stays open for unfinished requirements |

External blockers require actual authorized accounts/assets/platforms and reviewed
production policy. Do not buy licenses, upload packages/PII, fabricate exports,
substitute Chromium viewport for mobile engines or enable production to get green.
Code conformance gaps remain implementation work; they are not external exceptions.
The full epic cannot close while either class remains unfulfilled.

Integrated #165 review corrections additionally recheck leaf/ancestor calendar
windows on active communication-session reopen independently of optional
duration clocks. Calendar-only legacy snapshots do not need a new clock.
Three-edition regressions prove inclusive boundaries and denied early/expired
reopen without launch/proof changes. Earlier-edition shared-data unavailability
(error 401) takes precedence over malformed Unicode/store validation.
The actual Lime practice harness waits for completed discovery before selecting
read permissions/consent, reusing its existing bind helper. No host guard or
assertion is removed. Current exact-head acceptance remains in the epic ledger.
