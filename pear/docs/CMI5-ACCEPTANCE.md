# cmi5 acceptance — #144

ADR-187 adds standalone XML import/export and mixed local/remote AU metadata,
plus independently checked ZIP64 fixtures. Remote launch is deliberately handled
in its successor, with reviewed origin configuration and session CORS. New
evidence is `cmi5-packaging.test.ts` and the built standalone-XML browser case.
Original ADR-186 scope/evidence below is retained as historical baseline.

Profile: `pear-cmi5-quartz-local/1`, Quartz 1st Edition, xAPI 1.0.3. This evidence
belongs to cmi5; ADR-025 xAPI and #133 SCORM evidence do not close its gates.

| Requirement | Implemented evidence | Remaining gate |
| --- | --- | --- |
| Import, review and export | `cmi5.test.ts`: immutable/quarantined ZIP, exact SHA-256, tenant/role/CAS/receipt/audit checks; browser admin import/review/original ZIP export/revoke | Standalone XML, remote resources, certified ZIP64/reference fixtures; malware scanning and rights/account verification |
| Course structure | Namespace-aware local profile, nested blocks/objectives, unique publisher IDs, localized metadata, score/moveOn/launch metadata; 1,001 AUs import, final AU pagination and runtime test | Full XSD/IRI/vendor-extension/reference corpus |
| Launch | Encoded endpoint/fetch/actor/registration/activityId, original query/fragment, separate activity IDs, protected LaunchData and persisted launched statement; built iframe and OwnWindow journeys | External/non-browser content, reviewed HTTPS hosting and production isolation |
| Credentials | One-use POST fetch, Basic session token, live browser/account/tenant/version scope, expiry/logout/revoke/restart negatives | Production credentials, commercial entitlement and external host/account acceptance |
| State/preferences | JSON State and ETags, read-only LaunchData and Agent preferences; AU bookmark save/relaunch/restore in actual browser | Full binary State, Activity Profile and general LRS APIs |
| Statements/lifecycle | Defined/allowed separation; atomic UUID retry/conflict/batches, strict unique JSON, source timestamps, initialized/terminated/abandoned, terminal grace, registration-wide outcome validation; actual server-saved/lost-ACK retry | Exhaustive xAPI objects/query/result/attachment/conformance corpus and administrative waiver UI |
| Results and reconciliation | All five moveOn policies, block/course satisfied statements, separate reported completion/pass/score/duration, own/admin reports and paginated retained statement evidence | Official course/award bindings, partner mappings, production reporting/retention/DR |
| Isolation | Cookie-free separate hostname, Host/Origin/version checks, same-origin CSP, live capability invalidation; no official/xAPI/SCORM ledger writes | Strict production egress/credentialless enforcement; actual native, Safari and mobile platforms |

Run from `pear` after installing dependencies:

```sh
npm run test:cmi5
npm run build
npm run test:cmi5:browser
```

`test:cmi5` runs with Node test isolation disabled to expose every case and its
failure rather than only a subprocess summary. Browser tests use the built Pear
UI and a self-authored AU that speaks cmi5/xAPI directly, without a Pear content
shim. They own ports 4392–4397; default Playwright configuration also starts its
normal development/built lane server. Session close/relaunch uses keyboard
activation, while import/review/start/AU interactions use mouse activation.
CI runs the domain lane explicitly and includes all three browser cases in both
normal and built Pear acceptance. Screenshots/traces are in the existing Pear
artifact upload, under `artifacts/cmi5` and `test-results`.

For an explicit loopback demo, use Pear at `http://127.0.0.1:4314`:

```sh
PEAR_CMI5_CONTENT_ORIGIN=http://localhost:4316 npm run dev
```

Administration → cmi5 imports/review; Imported packages → learner activities,
saved registrations and results. Starting an AU without a registration creates
a new enrollment/retake; Resume preserves a saved registration. Results remain
separate from Pear official grades/certificates. Original bytes are retained for
admin export. State and evidence survive process restart. Backups contain State,
provenance and statements; ordinary browser-session revocation also revokes cmi5
credentials. Production retention/restore/load acceptance is not claimed.

Authenticated retained evidence API:
`GET /api/cmi5/registrations/:id/statements?after=0&limit=20`, with
`admin=true` for a same-tenant content administrator. `nextAfter` is the next
cursor. This endpoint does not reuse expired AU Basic credentials.

Full conformance, commercial/reference interoperability and production remain
OPEN. Keep #144 and #49 G18 open; do not infer readiness from the SCORM matrix.

Local verification (2026-10-12): 12 cmi5 cases and all three built Chromium 151
journeys PASS; build/typecheck/vendor PASS. The surrounding xAPI/HTTP/session/
SCORM-package lane passed 38 cases. After the schema fixture correction, the
cmi5/migration/authoring/invitation/SCORM learning lane passed all 60 cases.
The first complete Pear run was 1,131 PASS / 4 FAIL because old downgrade fixtures
left new cmi5 tables present; those failures are corrected by removing both
schema-52 tables and its marker before the real upgrade. The corrected complete
Pear run passed all 1,135 existing cases, with no failed, cancelled or skipped
cases (Node test concurrency 2); the independent cmi5 lane passed all 12 cases.
Exact-head remote CI remains pending; earlier failed runs
are not clean acceptance. Local Playwright 1.63/Chromium 151 mouse navigation
after iframe interaction did not issue requests on two parent controls; their
keyboard activation is the final tested journey. This is not native/platform
conformance evidence.
