# SCORM support and acceptance matrix

Version: epic #133 / ADR-075–092. Engine: **scorm-again 3.4.5**, pinned MIT package. Supported execution currently means reviewed synthetic loopback fixtures; production execution is disabled. Pear applies checksum-locked adaptation `pear-selection-v2` to the exact ESM entry: ADR-082 direct-log removal plus the selection corrections in ADR-092. A passing fixture is not standards certification or Rustici parity.

| Capability | 1.2 | 2004 2nd | 2004 3rd | 2004 4th | Evidence / boundary |
|---|---|---|---|---|---|
| ZIP/XML, immutable original, nested paths and auxiliary assets | Tested | Tested | Tested | Tested | Strict quotas, UTF-8 XML, no DTD/XXE/traversal/special files; auxiliary assets differ from asset activity leaves |
| API discovery, synchronous string results, CMI/lifecycle errors | Tested profile | Tested profile | Tested profile | Tested profile | Real engine, server replay/read-only baseline; no complete error-code suite claim |
| Suspend data | 4096 engine limit | 4000 engine limit | 64000 engine limit | 64000 engine limit | Upstream UTF-16 code-unit counting; supplementary-Unicode SPM conformance is OPEN |
| Comments, objectives, interactions, score and reported duration | Tested profile | Tested profile | Tested profile | Tested profile | Time intervals bounded to centiseconds; 2004 calendar conversion uses 365-day years / 30-day months |
| Separate completion / success | Combined lesson status | Tested | Tested | Tested | Passed policy requires completed and passed for 2004; preview/practice remains unofficial |
| Multi-SCO folders, durable per-SCO resume/history | Tested | Tested profile | Tested profile | Tested profile | Current technical attempt differs from overall attempt and domain retake |
| Prerequisites / objective gates | AICC expression profile | Sequencing profile | Sequencing profile | Sequencing profile | Direct requests checked server-side; unknown objective state is not silently treated as false |
| Flow/choice, rules, local objective maps, rollup, attempt limits | AICC profile | Tested profile | Tested profile | Tested profile | Flow-only initial start and ADL-namespaced local maps tested; Commit does not navigate; Terminate/delivery/root rollup remain authoritative (ADR-080/082) |
| Manifest-local sequencing collections / IDRef | — | Tested profile | Tested profile | Tested profile | Whole XML group replacement, control defaults, objective gates and durable official rollup (ADR-083) |
| Post-condition retry / retryAll | — | Tested profile | Tested profile | Tested profile | New technical SCO attempt and scoped capability; immutable history and domain-retake separation; denied retry at attempt limit (ADR-084) |
| Manifest isvisible presentation | Tested | Tested | Tested | Tested | Hidden menus, non-inherited child visibility, default play/resume and unchanged flow/choice/prerequisite/proof requirements (ADR-085) |
| Weighted completion / progress rollup | — | — | — | Tested profile | Fourth-edition progressWeight and threshold policy; durable trusted measure, zero-weight obligations and official proof (ADR-086) |
| ADL presentation / rollup / constrained choice | — | Tested profile | Tested profile | Tested profile | Namespace/default/collection validation; hideLMSUI is presentation, content navigation remains allowed; ADL score/progress/completion maps are fourth-edition-only (ADR-087) |
| pipwerks licensed wrapper save/resume/finish | Tested | Tested | Tested | Tested | Pinned original wrapper and original course assets; not a commercial authoring export |
| Selection/randomization | — | Tested profile | Tested profile | Tested profile | Original cluster controls, count 0–2048, once/each timing, trusted stable pool/order, retry/resume and selected-only proof (ADR-092) |
| System-global objectives | — | Tested profile | Tested profile | Tested profile | Tenant/learner mapped tracking values, original access flags, cross-package prerequisite delivery, field deltas, unofficial separation and schema 50 (ADR-091) |
| System-global shared data | — | — | — | Tested profile | Tenant/learner working stores, current mapped permissions, explicit-delta concurrency/receipts, unofficial isolation, schema 49 and backup/quota/revocation evidence (ADR-090) |
| Registration-local shared data | — | — | — | Tested profile | Explicit sharedDataGlobalToSystem=false; mapped read/write stores, durable delta receipts, technical retake preservation and hidden backing-state redaction (ADR-089) |
| Calendar delivery windows | — | Tested profile | Tested profile | Tested profile | Host-clock begin/end checks, explicit timezone, Gregorian validation, inclusive endpoints; bounded precision/profile (ADR-088) |
| ADL developer-guide licensed wrapper | — | Unverified | Tested | Unverified | Exact byte-preserved file, CC BY-SA 3.0 notices retained; full Roses/Flash course not bundled |
| Enrollment/standalone/nested award version/cycle projection | Tested | Tested | Tested | Tested | All required SCO evidence; live authorization, immutable proof/audit/receipt; quiz remains required for course certificate |

Explicitly refused playback profiles: asset activity leaves, absolute/experienced duration limits. Malformed recognized definitions fail validation; unknown metadata is retained without being represented as implemented runtime semantics. Future profile changes must reparse the retained original manifest and add concrete conformance counterexamples.

| Lane | Observed result | Remaining gate |
|---|---|---|
| Built Chromium desktop | Wrapper, multi-SCO, enrollment/quiz, lost ACK/retry, adversarial fixtures | This browser lane does not prove every egress channel on every engine |
| Built Chromium narrow viewport | Human SCORM workflow; no extension required | Third-party package layout is content-owned; real mobile Safari/Android remains unverified |
| Actual unpacked Lime + local scripted Mango | PASS in #140 CI, run 37591223932; metadata read while SCORM active | Extension-page UI, not native Side Panel container; no live-model inference claim |
| Coconut Tauri / Linux WebKit | PASS: real SCORM Tauri/WebKit, 9/9 checks in run 37594546875 at 41b4fbe14597aa79e976bfc12e645730f26ec946 | Licensed wrapper save/resume/finish, isolation and real external MCP; other OS engines remain open |
| Coconut Windows/macOS | Unverified | Actual WebView2/WKWebView playback, authority and egress counterexamples |
| Production / strict all-egress | Disabled | Reviewed credentialless content origin, deployment isolation, native/browser channel policy and negative evidence |
| Main integration S1–S8 | PASS: main `f7d30b45f968dbaf52199cb35021d7aee6cc5600`, tree `159d24bd1178633d82f15cc7ee34bcf89538bf7e`; run 37675973833, 8/8 | Successor semantics require their own integrated acceptance; production/conformance gates remain open |

External gates stay OPEN/BLOCKED: commercial Storyline/Captivate/Rise exports with redistribution rights; authorized Rustici/SCORM Cloud differential account; complete ADL/reference suite and license resolution for legacy ADL Sample RTE. That RTE's root Apache notice conflicts with a legacy CC BY-NC-SA notice and its Windows/Java/Tomcat platform differs from CI. Offline wrapper tests provide explicit equivalent coverage only for API discovery/save/resume/finish, not the whole conformance suite. Never upload learner data or licensed packages to an external engine without independent authorization.
