# ADR-082: Scoped SCORM support packets, runtime capacity and recovery

Epic #133 S8 adds human diagnostic downloads built from an explicit field allowlist, authenticated launch/session and live enrollment checks, author-only own-tenant aggregates, transactional runtime quotas, and a whole-database online-backup/offline-restore operator CLI. Restore preserves domain/SCORM history but revokes sessions/capabilities; it never overwrites a database or switches the running service. See [operations](SCORM-OPERATIONS.md) and the versioned [support matrix](SCORM-SUPPORT-MATRIX.md).

Nondefault activity visibility is now an explicit unsupported playback feature. The previous parser retained but ignored `isvisible=false`; accepting it as ordinary visible content would silently change the package's behavior. Import still retains the original bytes and diagnoses the unsupported profile; malformed visibility is rejected. Implementing broader visibility semantics is future conformance work rather than an undocumented downgrade.

Integrated acceptance adds a built human import/review/publish/course-policy/enroll/save/close/reload/resume/finish/quiz/certificate workflow, narrow viewport behavior and an actual scoped support download. The dedicated Coconut lane drives the real Tauri/WebKit guest with the licensed pipwerks wrapper, server-ACKed incomplete progress, isolation probes, real external MCP metadata read, close/reopen/resume, authoritative Terminate proof, quiz separation and identity-switch revocation. A Chromium preflight checks the fixture's UI driver; only the actual native CI can establish its native result. Commercial/reference, additional OS/mobile engines, package-owned console capture policy and reviewed production privacy/archival retention, production strict-egress and main verification remain explicitly open.

Before S8 publication: #140 passed all eight CI jobs at `43784189739a48438c9c6245ae13a1a9825aabc9`, including the actual unpacked Lime SCORM test. Record S8's exact validated tip/tree and CI outcomes in the epic; do not close #133 from scoped fixture success or modify the other session's #49 stack.

The pinned engine's three direct sequencing console statements bypassed `logLevel=NONE`. A minimal ESM installation adaptation removes only those calls, verifies original and adapted SHA-256, preserves license/state semantics and fails on unknown source/version. Installation/build/start verify it. Existing trusted snapshot identities remain compatible because no engine state schema changes; diagnostics report the logging adaptation separately. Real sequencing construction/recovery and rejected protected CMI are checked for zero console output.

Local publication evidence: 427/427 full domain tests, 19/19 built Chromium SCORM journeys (including human import-to-certificate and native-driver preflight), eight focused operations counterexamples, Pear build/typecheck and host typecheck. Actual S8 Linux native and exact-tip integrated CI remain pending at initial publication; record results in epic #133.


S8 initial integrated head `41b4fbe14597aa79e976bfc12e645730f26ec946` passed all eight jobs in run 37594546875. Its real Linux Tauri/WebKit SCORM lane passed 9/9 checks: SCO isolation, durable resume, scoped external MCP metadata, authoritative proof with quiz separation, identity revocation and shutdown. The new acceptance is scoped to that OS and fixture.

Review disposition at the S8 integration tip: #140's close/automatic-next race is fixed in both practice and enrolled shells by synchronously claiming the current launch, excluding competing closes, and checking launch identity before clearing UI. Four built-browser regressions hold either the next-SCO close response or the finished checkpoint acknowledgement to exercise both winners and prove no orphan/new-launch deletion or duplicate proof. The pipwerks fixture's extra trailing newline is removed; reconstructing CRLF now matches its declared upstream Git blob exactly, with normalized SHA-256 and decoded ADL pin regression checks.


The new first-session race fixtures also exposed an initialized-default replay defect: comparison against pre-Initialize CMI treated manifest-seeded primary objective `unknown` defaults as explicit content writes, clearing completed rollup on the first Terminate without Commit. Replay now compares writable values after trusted Initialize while retaining the original protected-field baseline. Three edition-specific counterexamples assert first-session completed rollup, exactly one official proof and no replayed time. This preserves live authorization and the all-SCO/root-rollup completion gate.

Follow-up local verification: 431/431 full domain tests; 28/28 focused runtime/sequencing/operations cases, including 12 operations counterexamples; 23/23 built Chromium SCORM journeys; Pear build/typecheck and host typecheck. Confirm the new exact tip CI in epic #133.


A full-stack review sweep resolves the remaining predecessor findings at the S8 integration tip:

| Predecessor | Finding | Disposition / counterexample |
|---|---|---|
| #134 | Resource delete/reinsert/replace changes immutable executable pin | Migration 048 blocks resource deletion and post-review/publication/registration insertion; populated schema-47 upgrade preserves exact assets and private resume state |
| #135 | Package-root `xml:base="./"` rejected | Only directory-base resolution permits the empty root; concrete paths and archive-root escape remain rejected |
| #135 | Learner listings expose provenance/review notes | Administrator-only SQL projection; authenticated learner HTTP response omits both fields and author mode remains role-gated |
| #137 | Original launch receipt reopens superseded attempt after retake | Replayed registration receipt must refer to its latest overall attempt; denial rolls back launch/capability/state/workspace/audit and preserves historical CMI |
| #138 | Restored navigation request cannot be read | Initialize restores validated request; the eight-method adapter provides read/write `adl.nav.request` semantics and resets successful-read error state |
| #139 | Registration-local objective maps read the wrong XML namespace | ADL sequencing namespace lookup, strict XML boolean/conflict validation; old unqualified fixture input remains compatible |
| #139 | Flow-only/choice-disabled initial session cannot launch | Initial start traversal chooses the first deliverable activity; actual subsequent choices and locked prerequisites remain engine-enforced |

The navigation adapter also corrects the pinned engine's write-only GetValue behavior against [ADL 4th Edition Testing Requirements REQ_47.1](https://adlnet.gov/assets/uploads/SCORM_2004_4ED_v1_1_TR_20090814.pdf), which defines `adl.nav.request` as read/write. This is a narrow API adapter, not a claim that the engine or full profile is certified. Three-edition regressions cover restored requests and first flow-only delivery. Built flow-only journeys cover lost-ACK retry, close/resume, authenticated next-SCO delivery and final official proof.

Full-stack review sweep verification: 445/445 full domain tests (four local workers), 69/69 focused SCORM cases, 26/26 built Chromium SCORM journeys and build/typecheck/host checks. Prior follow-up de965d86c838e02390ff575f108b37fe8fe0d19e also passed all eight CI jobs in run 37596888933; confirm the current integration tip separately before delivery.
