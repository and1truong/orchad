# ADR-184: independent interaction writes retain a short typed journal

Epic #133; immediate successor on #257e9dfa598. The shared journal only
compacts globally adjacent same-field writes. Original three-edition probe
accepts6000 interleaved type writes in two records, then Commit391 before
queue callback. New durable regressions originally9PASS3FAIL/exit1(10.334s):
all three added cases fail because a short witness never reaches the queue.
Probe's initial root invocation could not resolve tsx; corrected Pear-directory
probe confirms three actual refusals. Keep original logs and counterexamples.

A successful type/response write now replaces only the latest write in its own
interaction when that write has the same field. Writes in another interaction
cannot alter this record's typed validation. Own ID/type/other-response writes
remain barriers; failed setters never enter the journal. Existing typed engine
replay, snapshot equality, forged witness refusal, origins, queue acceptance,
exact receipts and atomic server transaction remain. Byte growth replaces the
same prior entry;4096-entry/2MiB journal, ordinary model/transport and tenant
quotas are unchanged. No engine/adaptation/predicate/deadline changes.
The bounded reverse search adds no dependency or persistent metadata. Broader
noncompactable same-record histories and full simultaneous SPM remain OPEN.

Three new domain cases each cover sequenced/nonsequenced Commit/Terminate:
5000 interleaved learner, pattern and type writes per record, retained own
sequencing response barrier, invalid type refusal, unchanged queue-retry
payload,17-entry typed witness, forged barrier removal rejection, exact
receipt retry, four server-derived origins, real human Close/relaunch/resume
and no proof. Existing consecutive/mixed-origin cases remain.

Completed focused30PASS/exit0(18.704s), every case/counter/footer inspected.
The command included one nonexistent provenance filename; Node selected the
three existing files (type/response compaction and response provenance), so no
four-file coverage claim. Initial root npm build failed ENOENT/exit254;
correct Pear-directory typecheck/build PASS/exit0, full log/chunk warning read.
Six built real-service browser journeys PASS/exit0(29.0s), including three
original and three interleaved lost-ACK/exact body/receipt/SQLite/Close/resume/
numeric replacement journeys. Full149-domain1132PASS/exit0; all149 unique
package files,1132 cases, TAP plans/six counters/durations/per-file exits
independently inspected and retained. Full unfiltered258-browser/108 files253PASS5FAIL/exit1(16.4m); exact
manifest/258 unique IDs/file map/footer/status independently inspected. All
five original full trace/network/context ZIPs archived before analysis and
reviewed: second navigation-target/retry/unicode and third system-objectives
heading DOM.describeNode/session closed, managed SW enumeration denial.
No page errors; exact lost-ACK200 retries observed, heading causes UNPROVED.
All six provenance journeys pass in full run. Unchanged affected four
headings4PASS/exit0(13.2s), every case/footer/status inspected separately;
original full253/5 retained, no clean full local browser PASS claim.
Own exact-head eleven completed CI/full logs/fresh unresolved reviews0 required.
Native existing regression profiles remain; actual new interleaved native
vector evidence is still OPEN, Chromium remains supplementary.

Parent owner ADR183 Linux groups now complete at#254/#255: union of all
original+15/15/15+17/17/17 profiles, eleven clean exits and ten ordered six-phase
finite direct DB records at unchanged budgets/predicates. Windows/Mac also
complete on both parents with eleven clean/ten six-phase records; own Pear
gates now verified below. #25692ffbd6a Windows113980206239FAILURE: second-edition nativeExit0,
fixtureForced SIGKILL/null, four phases through app-closed5.713ms, no DB-close/
cleanup/direct DB duration; full1657-line log reviewed, cause UNPROVED. Old
Windows failures and Linux cancellations retained; no all-job PASS.
Internal exhaustive matrices/full SPM OPEN; licenses/authorized exports/account/
actual Safari+Android/reviewed production inputs BLOCKED. Epic OPEN;
production DISABLED.

Independent full collection probe preserves2750 origins shape and adds10000
interleaved type writes: all three editions original#257 Commit391/no callback,
patched Commit0/one callback/exact3500 journal entries. Initial .ts standalone
probe failed CJS top-level-await transform; corrected .mts probe exit0 before
and after, all cases inspected. This is domain queue evidence, not new actual
native proof; next native vector remains OPEN.

The initial193-browser estimate was incorrect; actual unfiltered discovery
records258 tests. The current full run follows that manifest and footer, not
the earlier estimate. No prior190-case run is promoted to full258 coverage.

Parent#25421e1a897/#2555e830485/#257e9dfa598 now READY after own eleven
completed SUCCESS jobs/full raw logs/fresh unresolved reviews0 at19:37UTC.
Pear1114/1120/1129 domain,252/252/255 dev+built,SidePanel4;actual3OS
original+small15/15/15+combined17/17/17 (254/255),18/18/18(257),
eleven clean exits/ten ordered six-phase/direct finite DB-close each OS.
Original failures/retries/local limits retained. #25692ffbd6a Windows
unchanged affected retry in progress; all ten carried logs byte-identical
to inspected originals, no new all-job PASS.
