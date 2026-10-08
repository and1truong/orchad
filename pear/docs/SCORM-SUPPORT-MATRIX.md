# SCORM support and acceptance matrix

Version: epic #133 / ADR-075–125. Engine: **scorm-again 3.4.5**, pinned MIT package. Supported execution currently means reviewed synthetic loopback fixtures; production execution is disabled. Pear applies checksum-locked adaptation `pear-uri-fragment-binding-v24` to the exact ESM entry: ADR-082 direct-log removal plus selection corrections in ADR-092 and duration integration in ADR-094 and plain Unicode characterstring correction in ADR-095 and localized-string correction in ADR-096 and interaction-collection correction in ADR-097, response corrections in ADR-098/100, URI binding in ADR-102 and timestamp binding in ADR-104 and preloaded collection initialization in ADR-105 and failed collection append rollback in ADR-106 and complete packed-index binding in ADR-107 and 1.2 failed append rollback in ADR-108 and recommended blank score defaults/reset in ADR-109 and navigation target binding in ADR-112 and real integral/preference capacity in ADR-113 and successful derived-read error reset in ADR-114, language preference binding in ADR-115, 1.2 data-model errors in ADR-118 and shared timeinterval grammar in ADR-119 and conditional URN namespace/NSS binding in ADR-120 and URI scheme/relative-first-segment binding in ADR-123 and fragment delimiter binding in ADR-125. A passing fixture is not standards certification or Rustici parity.

| Capability | 1.2 | 2004 2nd | 2004 3rd | 2004 4th | Evidence / boundary |
|---|---|---|---|---|---|
| ZIP/XML, immutable original, nested paths and auxiliary assets | Tested | Tested | Tested | Tested | Strict quotas, UTF-8 XML, no DTD/XXE/traversal/special files; auxiliary assets differ from asset activity leaves |
| API discovery, synchronous string results, CMI/lifecycle errors | Tested profile | Tested profile | Tested profile | Tested profile | Real engine, server replay/read-only baseline; no complete error-code suite claim |
| Suspend data | 4096 scalar characters | 4000 scalar characters | 64000 scalar characters | 64000 scalar characters | Tested exact supplementary boundaries, durable resume/refusal (ADR-095); broader encoding/SPM conformance remains OPEN |
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
| Noncommunicating asset leaves | Tested profile | Tested profile | Tested profile | Tested profile | No API/CMI; LMS-owned durable navigation; SCO-only proof plus trusted root rollup; asset-only packages cannot generate official proof (ADR-093) |
| Selection/randomization | — | Tested profile | Tested profile | Tested profile | Original cluster controls, count 0–2048, once/each timing, trusted stable pool/order, retry/resume and selected-only proof (ADR-092) |
| System-global objectives | — | Tested profile | Tested profile | Tested profile | Tenant/learner mapped tracking values, original access flags, cross-package prerequisite delivery, field deltas, unofficial separation and schema 50 (ADR-091) |
| System-global shared data | — | — | — | Tested profile | Tenant/learner working stores, current mapped permissions, explicit-delta concurrency/receipts, unofficial isolation, schema 49 and backup/quota/revocation evidence (ADR-090) |
| Registration-local shared data | — | — | — | Tested profile | Explicit sharedDataGlobalToSystem=false; mapped read/write stores, durable delta receipts, technical retake preservation and hidden backing-state redaction (ADR-089) |
| Absolute/experienced sequencing durations | — | Tested profile | Tested profile | Tested profile | Trusted host attempt/activity clocks; suspend/close/expiry, retries/reconstruction, zero/untracked conditions; bounded day/time XML profile (ADR-094) |
| Calendar delivery windows | — | Tested profile | Tested profile | Tested profile | Host-clock begin/end checks, explicit timezone, Gregorian validation, inclusive endpoints; bounded precision/profile (ADR-088) |
| ADL developer-guide licensed wrapper | — | Unverified | Tested | Unverified | Exact byte-preserved file, CC BY-SA 3.0 notices retained; full Roses/Flash course not bundled |
| Enrollment/standalone/nested award version/cycle projection | Tested | Tested | Tested | Tested | All required SCO evidence; live authorization, immutable proof/audit/receipt; quiz remains required for course certificate |

Explicitly refused duration bindings: negative, calendar year/month, week or finer-than-centisecond limits; see the admitted day/time profile in ADR-094. Malformed recognized definitions fail validation; unknown metadata is retained without being represented as implemented runtime semantics. Future profile changes must reparse the retained original manifest and add concrete conformance counterexamples.

| Lane | Observed result | Remaining gate |
|---|---|---|
| Built Chromium desktop | Wrapper, multi-SCO, enrollment/quiz, lost ACK/retry, adversarial fixtures | This browser lane does not prove every egress channel on every engine |
| Built Chromium narrow viewport | Human SCORM workflow; no extension required | Third-party package layout is content-owned; real mobile Safari/Android remains unverified |
| Actual unpacked Lime + local scripted Mango | PASS in #140 CI, run 37591223932; metadata read while SCORM active | Extension-page UI, not native Side Panel container; no live-model inference claim |
| Coconut Tauri / Linux WebKit | Historical four-profile native PASS: run 37823636259 at 35a1121d, runtime 16/16, Pear/MCP 13/13, each SCORM 11/11 | Exact successor-head acceptance and full authority/all-egress matrix remain required |
| Coconut macOS WKWebView | Historical four-profile native PASS on 35a1121d, run 37823636259; each SCORM 11/11 | Exact successor-head acceptance and full authority/all-egress matrix remain required |
| Coconut Windows WebView2 | Actual head ff919811 / run 37834968705: runtime16, Pear/MCP13, each four-edition SCORM11; native/fixture clean exit 0, no forced kill | Current successor-head full acceptance and all-egress matrix remain required; earlier probe/cleanup failures are retained |
| Native Chrome Side Panel | ADR-122 actual context/mount check added; CI pending | Container consent/rebind/revoke/player remains OPEN; local managed extension policy blocks execution |
| Production / strict all-egress | Disabled | Reviewed credentialless content origin, deployment isolation, native/browser channel policy and negative evidence |
| Main integration S1–S8 | PASS: main `f7d30b45f968dbaf52199cb35021d7aee6cc5600`, tree `159d24bd1178633d82f15cc7ee34bcf89538bf7e`; run 37675973833, 8/8 | Successor semantics require their own integrated acceptance; production/conformance gates remain open |

External gates stay OPEN/BLOCKED: commercial Storyline/Captivate/Rise exports with redistribution rights; authorized Rustici/SCORM Cloud differential account; complete ADL/reference suite and license resolution for legacy ADL Sample RTE. That RTE's root Apache notice conflicts with a legacy CC BY-NC-SA notice and its Windows/Java/Tomcat platform differs from CI. Offline wrapper tests provide explicit equivalent coverage only for API discovery/save/resume/finish, not the whole conformance suite. Never upload learner data or licensed packages to an external engine without independent authorization.

Unicode/SPM evidence (ADR-095): exact supplementary suspend-data bounds in all four editions, plain location/comment-location and mapped shared-store scalar counting, malformed-surrogate refusal and durable receipt/resume. Byte quotas remain separate. Localized strings, identifiers and interaction response grammars retain explicit exhaustive-conformance gaps; this does not close the full encoding/SPM requirement.

Localized-string evidence (ADR-096): scalar 250/4000 text patterns, multiple language subtags, 250-character language values, line terminators and unchanged supplementary/combining text in comments/descriptions and fill-in/long-fill-in records. Browser and server replay share the checksum-locked correction; maximum localized comments and ten fill-in learner records round-trip through durable ACK/resume. Host binding envelopes remain bounded (4257 localized leaves / 8192 interaction response leaves; 512 KiB checkpoint). Exhaustive identifier/interaction/language-registry/error-precedence conformance remains OPEN. Known Unicode-v4 sequencing snapshots remain readable.

Interaction collection evidence (ADR-097): zero-record learner choice/matching/sequencing/performance collections and a one-pattern empty choice correct set retain counts across ACK/retry/resume. Tested 36 choice/sequencing identifiers, 36 matching pairs and 250 full-size performance records; per-record 250-scalar performance and 4000-scalar other answers. ADR-102 raises response envelopes to 144105 characters for 36 full-length choice identifiers and their delimiters within the unchanged 512 KiB checkpoint; typed engine validation remains mandatory. ADR-098 adds named textual-response prefix/whitespace checks; exhaustive response and URI conformance remain OPEN. Localized-v5 and older known snapshot markers stay accepted.

Integrated #165 review regression evidence: active reopen checks current leaf
and ancestor calendar windows even when no duration clock is installed, while
calendar-only legacy snapshots remain readable. Inclusive boundaries and denied
early/expired delivery preserve launch/proof state in all three 2004 editions.
Edition 2/3 shared-data error 401 precedes malformed-Unicode validation. These
shared host/facade corrections do not change pinned ESM bytes or schema.

Textual correct-response evidence (ADR-098): fill-in/long-fill-in/performance
whitespace, unbracketed commas, newlines and leading typed boolean properties
preserve their original values across browser API, server replay, exact receipt
retry and preloaded resume. Fill-in permits repeated localized records and ten
250-scalar answers. Only bracketed separators split textual records; a bare
comma cannot split a performance answer or evade a fill-in scalar limit.
Invalid boolean values/repeated leading properties return
406 without altering record/count; missing ID/type stays 408. Known snapshots
through interactions-v6 remain readable. No complete edition/response/reference
conformance is inferred; see SCORM-CONFORMANCE.md.

Session-time evidence (ADR-099): all four editions replace the current launch's
contribution with the last reported value, including downward/zero corrections.
Earlier sessions and the launch's initial total_time stay fixed. Integer
centisecond accounting, overflow rollback, immutable receipt retry and actual DB
reopen are tested; built-browser ACK/close/resume verifies the API/server path.
Calendar conversion and exhaustive time semantics remain OPEN.

Reserved-separator correction (ADR-100): shared learner/correct response parsing
recognizes bracketed tokens only and preserves bare punctuation and backslashes.
Known pear-responses-v7 snapshots remain readable; unknown adaptations fail closed.
Original domain and authored browser vectors extend bounded evidence; full response
and identifier conformance remains open.

URI lexical bindings (ADR-102): pear-identifiers-v9 checks nonempty ASCII URI characters, exact percent triplets and 250/4000 identifier bounds in the shared browser/server engine. Bare URI punctuation is retained; matching correct responses no longer bypass typed validation on backslashes. Full RFC component/authority/URN and edition-specific IP literal validation remains OPEN. Known v8 snapshots are accepted; invalid stored CMI is refused atomically. Production remains disabled.

Timestamp evidence (ADR-104): shared 1970–2038/Gregorian/one-to-two fractional digits and strict timezone/full-input binding for interaction and learner/LMS comments. Original vectors cover every month-end, pre-init load, forged/legacy refusal, ACK retry and SQLite/browser resume. Known identifiers-v9 markers remain readable. Pear retains its explicit seconds+TZD to .00 compatibility conversion. Full cross-field/error/reference/platform conformance remains OPEN.

Preloaded collection evidence (ADR-105): shared initialization traverses existing nested records; loaded LMS comments reject every content write with 404 and preserve trusted values/count. New content-owned LMS records are refused before append. Original three-edition API/replay and built ACK/retry/resume vectors cover this bounded DM-03 correction; known v10 snapshots remain readable. Full DM-03 conformance remains OPEN.

Collection append evidence (ADR-106): failed first/nested/next writes preserve record counts and existing CMI, including type/range/dependency/unknown-field and duplicate objective-ID refusal. Shared traversal rollback runs for browser and trusted replay/load; known v11 snapshots remain readable. Historical empty records and full leaf/sequencing transaction semantics remain outside this bounded correction.

Packed-index evidence (ADR-107): both exact engine entries refuse malformed prefix/suffix/whitespace/signed aliases before accessing collection records; valid unsigned decimal/leading-zero/capacity behavior is retained. Named 1.2 and three-edition 2004 API/replay/built retry/resume vectors preserve values/counts. Known v12 markers remain compatible. Full API/data-model conformance remains OPEN; ADR-108 adds bounded 1.2 failed-append atomicity.

SCORM 1.2 collection append evidence (ADR-108): shared traversal rollback preserves objective/interaction/nested counts and records after invalid type/range/unknown writes. Existing read/write access, typed errors and successful retry remain supported. Original API/preload/bound-receipt/built retry/resume vectors cover the bounded correction; known v13 snapshots remain readable. Full 1.2 conformance and every external/platform/production gate remain OPEN/BLOCKED.

Score initialization evidence (ADR-109): fresh core/objective score components stay blank until explicitly set; reset clears max, while trusted stored maxima remain exact. Original API/preload/bound-receipt and built lost-ACK/resume vectors cover the ADL initialization recommendation. Known v14 markers remain readable; no historical value is rewritten. Full 1.2/default/score conformance remains OPEN.

API refusal evidence (ADR-110): all eight methods in before/active/terminated states across four profiles, malformed arguments and support error preservation. Empty 1.2 element names return 201; thrown checkpoint acceptance returns false with 101/391/111 and keeps state/shared deltas retryable. Four built journeys inject queue encoding failure and recover through ACK/retry/resume. Exact ESM/adaptation stays v15; full precedence/error/edition certification remains OPEN.

API model-access evidence (ADR-111): four-profile scalar result/model-path guards refuse live categories, engine settings/methods and private backing fields while retaining public keywords, readonly semantics, write-only setters and new collection records. Original API/bound-host/built ACK/retry/resume vectors preserve identity and refuse forged checkpoints atomically. Exact v15 ESM remains unchanged; origin-sharing, full conformance and production/platform isolation remain OPEN.

ADR-112 named navigation evidence: full characterstring target delimiter binding retains dotted/Unicode authored IDs, scalar-only validity, false/301 malformed reads and false/404 read-only writes; exact v16 engine bytes, original domain/built actual-choice/retry/resume vectors. Existing prediction rules remain a bounded profile; full sequencing/edition/default/error conformance remains OPEN.

ADR-113 named numeric evidence: 2004 real precision no longer imposes ten integral digits; audio/delivery-speed retain nonnegative unbounded ranges. Shared finite-input and 4096-character scalar-envelope guards preserve browser/replay agreement. Original preload/bound/built ACK/retry/resume checks cover exact strings, failed-write state and range distinctions. Full numeric lexical/precision/arithmetic/cross-field matrix remains OPEN.

ADR-114 named API evidence: successful derived completion/success/target reads reset previous errors through the shared active GetValue path; refused reads, lifecycle and support lookup preservation retain their codes. Original default/threshold/built receipt/reopen vectors cover three editions; full error precedence/field/edition certification remains OPEN.

ADR-115 named language evidence: shared 2004 preference/localized lexical binding admits multiple bounded subcodes, exact case/private capacity and empty preference clear; malformed writes/load/replay are refused atomically. Original domain/built receipt/resume vectors cover three editions; full ISO/IANA registry and every field/SPM combination remain OPEN.

ADR-116 native evidence gates: actual debug Tauri/WebView/MCP controllers now run Linux plus Windows/macOS and all four SCORM profiles, with post-commit ACK loss/exact retry, close/resume, completion authority, credential isolation and identity-rebind denial. Actual platform PASS requires completed runner logs/user-agent evidence on that head. Chromium fixture-driver journeys are supplemental only; Safari/Android, full all-egress and production packaging/deployment remain OPEN/BLOCKED.

ADR-117 support parameter evidence: published-code lookup shared by both facades refuses unsupported values without invoking content object conversion or throwing on Symbol. Known integer-number compatibility, empty-current diagnostic, prior errors and queue/state remain intact. SCORM 1.2 unknown lookups use an explicit empty-result policy rather than claiming a normative unknown-result requirement. Exact v19 engine bytes unchanged; full API/arity/coercion/precedence matrix remains OPEN.

ADR-118 1.2 model-error evidence: shared traversal and public facade distinguish invalid CMI paths (201) from unsupported outside models (401), retaining readonly/write-only/keyword/count/children/range/lifecycle codes. Original direct-engine/facade/bound/built receipt/resume checks cover named failures, including the ADL core.zip_code example. Exact 1.2 v20 bytes are pinned; 2004 bytes unchanged. Full field/optional-support/error precedence remains OPEN.

ADR-119 timeinterval evidence: shared 1.2 CMITimespan enforces 2–4 hour digits; shared 2004 rejects bare P/PT, weeks, fractional calendar components and missing/trailing T while preserving seven duration conversion slots. Original four-profile direct/facade/durable tests and existing built correction/close/resume journeys preserve values, reported time, revisions, receipts and proof state. The ADR-119 adaptation is v21; exact known v20/v19 predecessors and historical upgrades are tested, without rewriting history. Calendar conversion policy and full precision/error/reference conformance remain OPEN.

ADR-120 adds conditional URN namespace/NSS constraints to shared short/long identifier formats while preserving exact case/percent values and non-URN behavior. Original direct/facade/preload/replay vectors and existing built identifier retry/resume journeys extend named DM-02/RESP-02 evidence; full component/IP/namespace/UTF-8/equivalence conformance remains OPEN. Adaptation v22 accepts known v21 markers; 1.2 source stays unchanged.

ADR-121 expands original native-fixture dynamic egress probes with named CSP denial and zero local sink traffic, preserving authority/retry/resume/proof assertions. Four-profile local Chromium preflight passed; actual current-head native logs are required. Strict production egress, self-navigation/redirect and complete platform coverage remain OPEN.

ADR-123 refuses invalid URI scheme prefixes/relative first-segment colons in shared short/long formats while retaining relative references, case/escapes and existing URN/character/SPM rules. Adaptation v23 accepts known v22 markers and exact installer histories; 1.2 bytes are unchanged. Remaining components/authority/IP/namespace/UTF-8/equivalence conformance is OPEN.

ADR-124 extends original four-profile API session/access/type/range/dependency and no-coercion error preservation vectors through existing built exact-retry/resume journeys. Its runtime/adaptation remains v23; full matrix conformance is OPEN.

ADR-125 shared fragment binding rejects multiple raw number signs while retaining exact %23 and query/fragment data. Adaptation v24 accepts known v23 markers; 1.2 bytes stay unchanged. Full component/authority/IP/namespace/equivalence and production/external gates remain OPEN.
