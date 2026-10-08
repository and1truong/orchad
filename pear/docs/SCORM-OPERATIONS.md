# SCORM fixture operations and recovery

Execution is loopback-only and opt-in; it is not a production deployment switch. Use Node 24+, install Pear dependencies, and build both Pear and the independent runtime bundle. Run Pear at `http://127.0.0.1:4314` with `PEAR_SCORM_CONTENT_ORIGIN=http://localhost:4315 npm run dev`. Both owned servers share the same SQLite database. Different ports on the same hostname do not isolate cookies. Do not proxy Pear cookies/Authorization into content, rewrite its exact Host/Origin checks, remove HTTP sandbox/CSP, or disable browser web security. Production and broader native/security gates remain in the support matrix.

| Symptom | Authorized diagnostic | Recovery |
|---|---|---|
| Import queued/running after restart | Author's own job; aggregate pending counts | Existing startup resumes durable jobs; live author authorization and exact hash are rechecked |
| Package quarantined / unsupported | Exact author review and support matrix | Review original code/rights; unsupported features stay unavailable |
| Local Commit true, progress pending | Own-session support packet sequence/revision vs player status | Keep player open; retry the same immutable queued request, then reconcile server ACK |
| Session/account/audience/package revoked | Current authenticated endpoint failure | Reauthenticate and review live enrollment authority; old capability cannot be restored |
| Two tabs / stale writer | Closed launch and revision conflict | Use the newest authorized launch; do not invent a new sequence for an old payload |
| Runtime quota reached | Tenant aggregate bytes; own launch sequence | Preserve accepted state. Close communication and review capacity/history in an offline copy; do not delete receipts/proofs to fake success |
| Finished SCO, incomplete enrollment | Proof flag and published policy | Complete every required SCO/status/score/root rollup, then the course quiz |

Human **Download SCORM support details** returns only allowlisted engine/schema/package identity, numeric sequence/revision/time, capability lifecycle and projection status. It requires the original session's launch plus current account/enrollment authorization. Authors can download an own-tenant aggregate with bounded counts and byte usage. Neither packet includes raw CMI, suspend data, interactions/answers, learner names/IDs, authored titles/paths/provenance/error strings, archives, capability/session tokens, initial state or sequencing snapshots. No diagnostic tool is added to the agent catalog. Downloads use `no-store` and a fixed filename.

Capacity: 32 MiB ZIP / 64 MiB expanded / 16 MiB file / 2048 entries / 1 MiB manifest; four concurrent tenant imports and the existing shared 128 MiB upload quota. Runtime has 128 KiB 1.2 or 512 KiB 2004 CMI envelopes, a 1 MiB sequencing snapshot, a 16-entry client queue, a one-hour capability lifetime, 2048 receipts per launch and 64 MiB tenant runtime-state/seed/snapshot/receipt capacity. Capacity refusal rolls back state, time, navigation, proof, receipt and audit. Previously accepted replay is checked before fresh-write capacity. These are development fixture limits, not enterprise sizing commitments.

Default engine logging is `NONE`, HTTP loggers are disabled, and durable checkpoint audit records contain identifiers/counters rather than raw CMI. Three upstream direct sequencing debug/error statements bypassed that logger. A checksum-locked installation adaptation removes them from the exact ESM entry used by Pear and the runtime bundle; fresh/unreviewed engine bytes fail verification. Install/build/start verify this patch. The current `pear-timestamps-v10` adaptation also corrects selection, integrates trusted duration limits and validates Unicode/localized text as documented in ADR-092/094/095/096/097/098; MIT copyright/license notices remain unchanged. Support packets identify logging and behavior adaptations separately from engine version. The real sequencing/CMI rejection test observes zero console output. Arbitrary package-owned JavaScript may still log within its own untrusted frame; do not collect its console or turn on raw engine logging in production. Import failures retain a bounded parser diagnostic; support packets exclude those strings. Failed import archive bytes are erased, successful import archives move to immutable version storage, and private originals/CMI/history remain in the database. Official proof/history is never automatically deleted. A reviewed production privacy/retention policy and archival mechanism are still required; there is no hidden purge job. CI evidence uses synthetic learners/content and seven-day artifact retention. Support downloads require the human to decide where to retain/share them.

Back up the **whole Pear database**, including SCORM, domain history and receipts, with SQLite's online backup API. Never copy only a live `.sqlite` file while its WAL is active. The operator CLI checks exact schema, SQLite integrity/foreign keys, creates a new file with mode `0600`, and refuses overwrite:

```sh
npm run database:recovery -- backup /absolute/path/pear.sqlite /absolute/path/new-backup.sqlite
npm run database:recovery -- restore /absolute/path/new-backup.sqlite /absolute/path/new-offline-restored.sqlite
```

Restore always uses a new offline destination. It revokes all restored browser sessions and closes old SCORM capabilities while retaining acknowledged CMI, sequencing, immutable receipts/proofs/certificates and old attempts. Failure to invalidate authority removes the new destination. It does not switch the running app or deploy anything. Keep the restored service isolated from external integrations; rotate integration/provider credentials and validate the pinned build/configuration before an operator chooses a service/database switch. Backup files contain private data: protect/encrypt them in the operator's approved storage and apply the reviewed retention policy. The CLI intentionally prints no CMI or credentials.

Recovery acceptance covers a coherent snapshot taken while the original DB remains open, later source writes excluded, old capability/session denial, fresh-login bookmark/time resume, sequencing completion, immutable proof/certificate preservation, overwrite refusal and fault cleanup. File corruption or schema mismatch fails closed. Recovery-point objectives and external disaster-recovery storage remain deployment decisions; no production RPO/RTO is advertised.

Schema 49 adds learner-scoped system shared-data working stores. Values, target-ID bytes and a bounded metadata estimate join the 64 MiB tenant runtime capacity; each learner is limited to 4096 stores. Only explicit manifest-authorized deltas update these stores, transactionally with CMI/time/navigation/proof/receipt. Aggregate support usage includes their bytes without exposing values/target IDs. Whole-DB backup/offline restore includes this table and still closes restored capabilities/sessions. Unofficial preview/practice data stays registration-private. This is fixture capacity/privacy behavior, not production retention or enterprise sizing (ADR-090).


Schema 50 retains learner-owned system objective tracking with target/revision/source metadata. It counts toward runtime capacity and has a 4096-objective learner bound. Whole-database backup/offline restore preserves coherent values and closes old authority. Package revocation retains tracking history but blocks that package’s capabilities and old receipt replay; aggregate diagnostics do not disclose objective IDs/values. Production privacy/retention/archival gates remain open.

Reported session time may be corrected downward. The last value replaces only
the current launch's contribution; earlier sessions and initial total_time stay
fixed. Receipt sequence/revision still enforce ordering and accepted retries
cannot apply time twice. This content-reported field never replaces trusted host
duration clocks. Unsafe cumulative centisecond totals roll back (ADR-099).

Reserved-separator correction (ADR-100): shared learner/correct response parsing
recognizes bracketed tokens only and preserves bare punctuation and backslashes.
Known pear-responses-v7 snapshots remain readable; unknown adaptations fail closed.
Original domain and authored browser vectors extend bounded evidence; full response
and identifier conformance remains open.

URI binding correction (ADR-102) preserves exact valid characters/percent bytes and accepts known v8 sequencing markers. The per-response envelope is 144105 characters within the 512 KiB total checkpoint. Invalid historical identifiers/patterns fail closed before revision/receipt/proof writes; no automatic repair or deletion is performed. Production recovery of incompatible historical CMI requires a reviewed operator policy. Full URI conformance and production gates remain open.

Timestamp correction (ADR-104) keeps known v9 markers and validates historical interaction and learner/LMS-comment timestamps through engine setters before accepting a fresh checkpoint. Invalid historical state fails closed without revision/receipt/proof changes. No automatic rewrite, reset or deletion is performed. Explicit operator recovery policy remains required for incompatible historical CMI.

Preloaded collection correction (ADR-105) uses checksum-locked initialization-v11, retains known v10 snapshots and initializes existing nested records before content operations. LMS-owned comments/count remain unchanged after denied writes; trusted preload remains available. No schema migration, stored-data rewrite or production change.

Collection append correction (ADR-106) uses checksum-locked atomicity-v12 and known v11 snapshot compatibility. Invalid writes cannot accumulate empty collection records. Existing historical records remain unchanged; no automatic purge, schema migration or production enablement.
