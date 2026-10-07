# SCORM support and acceptance matrix

Version: epic #133 / ADR-075–082. Engine: **scorm-again 3.4.5**, pinned MIT package. Supported execution currently means reviewed synthetic loopback fixtures; production execution is disabled. Pear applies checksum-locked logging-only adaptation `pear-no-direct-sequencing-logs-v1` to the exact ESM entry (ADR-082). A passing fixture is not standards certification or Rustici parity.

| Capability | 1.2 | 2004 2nd | 2004 3rd | 2004 4th | Evidence / boundary |
|---|---|---|---|---|---|
| ZIP/XML, immutable original, nested paths and auxiliary assets | Tested | Tested | Tested | Tested | Strict quotas, UTF-8 XML, no DTD/XXE/traversal/special files; auxiliary assets differ from asset activity leaves |
| API discovery, synchronous string results, CMI/lifecycle errors | Tested profile | Tested profile | Tested profile | Tested profile | Real engine, server replay/read-only baseline; no complete error-code suite claim |
| Suspend data | 4096 engine limit | 4000 engine limit | 64000 engine limit | 64000 engine limit | Upstream UTF-16 code-unit counting; supplementary-Unicode SPM conformance is OPEN |
| Comments, objectives, interactions, score and reported duration | Tested profile | Tested profile | Tested profile | Tested profile | Time intervals bounded to centiseconds; 2004 calendar conversion uses 365-day years / 30-day months |
| Separate completion / success | Combined lesson status | Tested | Tested | Tested | Passed policy requires completed and passed for 2004; preview/practice remains unofficial |
| Multi-SCO folders, durable per-SCO resume/history | Tested | Tested profile | Tested profile | Tested profile | Current technical attempt differs from overall attempt and domain retake |
| Prerequisites / objective gates | AICC expression profile | Sequencing profile | Sequencing profile | Sequencing profile | Direct requests checked server-side; unknown objective state is not silently treated as false |
| Flow/choice, rules, local objective maps, rollup, attempt limits | AICC profile | Tested profile | Tested profile | Tested profile | Commit does not navigate; Terminate/delivery and root rollup are authoritative (ADR-080) |
| pipwerks licensed wrapper save/resume/finish | Tested | Tested | Tested | Tested | Pinned original wrapper and original course assets; not a commercial authoring export |
| ADL developer-guide licensed wrapper | — | Unverified | Tested | Unverified | Exact byte-preserved file, CC BY-SA 3.0 notices retained; full Roses/Flash course not bundled |
| Enrollment/standalone/nested award version/cycle projection | Tested | Tested | Tested | Tested | All required SCO evidence; live authorization, immutable proof/audit/receipt; quiz remains required for course certificate |

Explicitly refused playback profiles: asset activity leaves, nondefault `isvisible`, sequencing collections/references, retry/retryAll rules, duration limits, selection/randomization, ADL presentation/rollup extensions, system-global objective maps, weighted completion and fourth-edition shared data. Malformed recognized definitions fail validation; unknown metadata is retained without being represented as implemented runtime semantics. Future profile changes must reparse the retained original manifest and add concrete conformance counterexamples.

| Lane | Observed result | Remaining gate |
|---|---|---|
| Built Chromium desktop | Wrapper, multi-SCO, enrollment/quiz, lost ACK/retry, adversarial fixtures | This browser lane does not prove every egress channel on every engine |
| Built Chromium narrow viewport | Human SCORM workflow; no extension required | Third-party package layout is content-owned; real mobile Safari/Android remains unverified |
| Actual unpacked Lime + local scripted Mango | PASS in #140 CI, run 37591223932; metadata read while SCORM active | Extension-page UI, not native Side Panel container; no live-model inference claim |
| Coconut Tauri / Linux WebKit | Dedicated S8 `native-scorm-acceptance.mjs` lane; record its exact CI result | Local Cargo/xvfb/WebKit are unavailable; generic Coconut acceptance is insufficient |
| Coconut Windows/macOS | Unverified | Actual WebView2/WKWebView playback, authority and egress counterexamples |
| Production / strict all-egress | Disabled | Reviewed credentialless content origin, deployment isolation, native/browser channel policy and negative evidence |
| Main integration | Pending | Separate #49 owner must land the selected predecessor; preserve dependency/review gates |

External gates stay OPEN/BLOCKED: commercial Storyline/Captivate/Rise exports with redistribution rights; authorized Rustici/SCORM Cloud differential account; complete ADL/reference suite and license resolution for legacy ADL Sample RTE. That RTE's root Apache notice conflicts with a legacy CC BY-NC-SA notice and its Windows/Java/Tomcat platform differs from CI. Offline wrapper tests provide explicit equivalent coverage only for API discovery/save/resume/finish, not the whole conformance suite. Never upload learner data or licensed packages to an external engine without independent authorization.
