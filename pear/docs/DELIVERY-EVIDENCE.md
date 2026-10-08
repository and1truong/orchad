# Pear delivery evidence

## Historical Pear delivery source

Integrated runtime source `05d0bf4087e25250b0f9be19cfdc7c3be1b64907` passed all eight jobs in [acceptance 37566694622](https://github.com/and1truong/orchad/actions/runs/37566694622). Clean CI includes the actual Lime extension and native Tauri Pear/external Coconut MCP lanes; it is not model-quality, standards or production parity evidence.

| Commit / tree | Evidence | Result |
|---|---|---|
| `05d0bf4087e25250b0f9be19cfdc7c3be1b64907` / `b7bc989fd838e33b7030e8f43ec28290fcf246db` | Local typecheck, 369 domain tests; exact-cycle/learner/tenant/version/freshness negatives, nested ancestor revocation before replay, coordinator and separate learner confirmation, CAS/idempotency, audit rollback, scheduler cancellation/rejoin, nonempty v41 migration and actual reopen (including legacy issued credentials) | PASS |
| Same source | Actual Chromium human learner/coordinator/admin: 65 dev + 65 built journeys, 2 real host browser journeys; 6 focused award/group/scheduler journeys in each dev/built lane | PASS |
| `b11df53a68319248d92e2dd6d94bd8e355eb6819` / `d1d49c2c6766187873625e6a200efbf9c36ebe5a` | Clean installs; typecheck; 367 domain, 65 dev + 65 built, 2 browser host, 3 host unit, Lime 84, durable 25 and Coconut 57 local checks; all eight CI jobs [37565985506](https://github.com/and1truong/orchad/actions/runs/37565985506) | PASS; superseded by the nested ancestry regression/fix above |
| Initial `ca11e0f2db4ab39a51c2c63596145266cb02b8e2` | Historical all-eight-green [37547903899](https://github.com/and1truong/orchad/actions/runs/37547903899); independent local 348/349 reproduced the wrong collection-sharing denial route | Historical CI PASS / reproduced local FAIL; corrected real `/api/bridge/invoke` test verifies 403, FORBIDDEN and no destination state |

The source was frozen for successful full browser runs. Earlier browser failures are retained as failed attempts: wrong runner/browser timezone for datetime-local, a duplicate Course ID label, a timing budget and development reloads while source/dependency builds were changing. The corrected stable runs above replace those attempts as acceptance evidence; the failures were not silently counted as PASS.

The original tree was published through authenticated GitHub Git-data operations because local Git had no write credential. Local and remote tree hashes matched exactly; ref updates used expected heads and `force=false`. Published commits retain the original stack ancestry. The unpublished local transport checkpoint is retained separately; it is not remote CI evidence.

## Merge acceptance and live ledger

All 73 PR review-thread inventories were read and dispositions are in [DELIVERY-REVIEW.md](DELIVERY-REVIEW.md). A local merge-commit rehearsal from main `864f40caff7ae6918358c7ea4c60e5fcbd9dd2d1` through all 73 source heads found no conflicts and produced the exact integrated source tree. Before each real merge, re-read live head/base, compare the incremental diff and recheck CI; use merge commits and retarget the next PR to main after its predecessor merges. No force push, squash/rebase or closure substitutes for merge.

The final documentation head must also pass the full acceptance workflow before merging. Its exact head/run and the actual per-PR merge SHAs are recorded in the live [epic #49 delivery ledger](https://github.com/and1truong/orchad/issues/49). Documentation is separate from runtime source acceptance: no unrun commit is labelled green here. [DELIVERY-STACK.md](DELIVERY-STACK.md) retains the checked source-head CI history; current merged state is the GitHub PR/epic ledger.

Historical #64 native runtime TIMEOUT (head `34b9a410d2ed583f9f34bb6458875d36b0e9833f`, run [37454726356](https://github.com/and1truong/orchad/actions/runs/37454726356)) remains FAIL. Seven jobs, Rust build and predicate tests passed at that head. Later native fixes are retained in the stack and actual native acceptance passes on the integrated source above; a successful descendant never relabels the failed historical head. The contiguous stack delivery is accepted at the integrated tip, not as 73 independently deployable releases.

Local full Chrome unpacked-extension launch was NOT RUN successfully: the runtime denies the AF_UNIX process-singleton socket. The local Rust/WebKit native toolchain was unavailable. Real Lime/native/MCP acceptance therefore comes from exact-head clean CI, not a stub or a local capability claim. Manual native Chrome Side Panel, professional accessibility/linguistic audit, actual model-quality evaluation, standards conformance and real commercial/identity/channel/production dependencies remain open in [DELIVERY-STATUS.md](DELIVERY-STATUS.md). The full-parity goal and epic remain open.


## SCORM integrated successor

#132 and #134–#141 landed in main; exact baseline tree 159d24bd1178633d82f15cc7ee34bcf89538bf7e passed main acceptance 37675973833 (8/8). #147–#163 successor heads each passed their latest acceptance; all inline review findings were fixed/resolved. #147 and #148 merged to main as 048665255e0f88453da053f963064c6dfcbb31da and 26cdf3a412cb539cfe3ef294f9bf81fc7f2f5a2a.

#164 source 5281269795479540590176c07c7ce5570e4f1286 / tree 07fc9906a4aa1a87cfcdb41892d867fbbce03c92 passed local 564 domain tests across 82 isolated files, 67 dedicated built Chromium journeys and build/typecheck/vendor/installer checks. Remote run 37717241369 is tracked in the live #133 ledger; no pending run is PASS.

GitHub refuses retargeting #149 because it belongs to native stack #161. A normal integration PR preserves every reviewed source commit and the accepted main merge ancestry; its tree differs from #164 only in reconciled delivery documentation. Merge only after exact-head acceptance and verify main tree/ancestry/CI before recording delivery complete. Runtime source is unchanged by this reconciliation. Full conformance, commercial/reference accounts, additional platforms and production remain open; see SCORM-ACCEPTANCE.md.
