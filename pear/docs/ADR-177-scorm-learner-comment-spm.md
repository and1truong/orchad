# ADR-177: bounded full learner-comment transport

Epic #133; successor stacked on fresh unmerged #251 head51569431. The original
shared engine accepted250 learner comments, each4000 supplementary Unicode
scalars, but all three2004 server profiles refused4020609-byte snapshots at
the ordinary2MiB transport ceiling (three original failures/process exit1).
Fourth-edition RTE4.1.1.4/4.1.1.7/4.2.2 requires the250/4000 character SPM;
characters are not octets. Source:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Exact original second-edition source remains unresolved; a fresh third-edition
URL lookup redirected to an unrelated HTML hub, so neither is claimed as new
independent normative-source verification. Named compatibility checks cover
all three existing2004 profiles.

Reuse one shared byte-limit calculation in the built content queue, direct
typed validator, transactional service and credentialless HTTP route. Add only
the actual JSON UTF8 bytes of comment strings at first250 canonical own record
indices. Each eligible value contains at most4257 valid Unicode scalars,
including the existing bounded localization envelope. Arrays, inherited or
noncanonical records, indices250+ and malformed/oversized strings gain no
allowance. The unchanged typed engine still enforces4000 content characters,
language syntax, field names, location/timestamp bindings and LMS-owned values.

All other state, shared data and interaction journal bytes together must still
fit ordinary2MiB. The journal4096-entry/2MiB bound, queue16, tenant storage and
receipt quotas, capabilities/origin/credentials/CAS/payload-hash retry,
transactional rollback and Finish/proof rules remain. Only the checkpoint HTTP
route has the finite parser maximum8483152+32768 bytes; the existing host-wide
body bound is unchanged. After parsing, actual state/shared/journal over-budget
requests return413, preserving the original response-capacity negative control.
The32KiB request metadata allowance cannot be borrowed by the CMI payload.

Named evidence:
- Seven new domain checks include exact UTF8/escaped-scalar maximum,250 full
  comments, local queue refusal/retry, original HTTP receipt replay, SQLite
  reopen/human Close/resume and atomic typed/authority/ordinary-byte refusal.
- Corrected focused16 domain PASS/exit0(37.35s), including the previous full
  response-capacity and collection/provenance/quota suites. Initial7 checks
  produced1PASS/6FAIL/exit1: three fixture timestamps used the existing facade's
  seconds-to-.00Z canonicalization, and three HTTP ordinary overflow cases
  returned400 instead of413. Use explicit authored.00Z in the exact vector and
  enforce the same actual payload budget at HTTP; original logs are retained.
- Build/typecheck exit0, unchanged v50 SHA
  e692d42794558b5ec312207caef86327ca0e7d87e37fdfabad3bf3cd76eed9bc;
  unchanged1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642.
- Three built journeys PASS/exit0(26.2s): real4MB HTTP acceptance followed by
  deliberately lost ACK, exact-payload retry without duplicate revision or
  receipt, human Close/resume with all750 field values preserved, and genuine
  Finish producing one proof/no certificate. Full147 files1108 domain
  PASS/aggregate exit0; every exact file/TAP plan/five footer counts/per-file
  exit inspected. Fixed181 browser178PASS/3FAIL/exit1(10.7m); all full traces,
  network/context and failed status inspected. Third collection fixture resume
  probe expected2/received1 after5000ms, checkpoint200/503/lost ACK retained;
  third retryAll heading DOM.describeNode/session closed, cause UNPROVED;
  managed ServiceWorker enumeration denied. Three changed full-comment
  journeys pass in that full run; no clean full browser PASS claim. No
  unrelated rerun or deadline/assertion weakening.
- Own exact-head CI/full job logs/fresh reviews and actual full-comment native
  profiles remain pending; Chromium evidence does not substitute for WebViews.

Parent#25081107a4c READY own37951636145/all10 full logs/fresh reviews0:
1098 domain/240dev/240built/SidePanel4; Linux/macOS/Windows16/13/13/31/31/32,
all five clean shutdowns and four SCORM fixtures with six ordered phases/direct
finite database-close times. Parent#25151569431 own37953704002 has nineSUCCESS/full logs inspected,
Pear pending; all3OS16/13/13/31/31/32+15/15/15, eight clean shutdowns/seven
ordered-phase SCORM fixtures/direct finite DB-close times.
full1461101 domain PASS/exit0, fixed178175PASS/3FAIL/all artifacts retained.
All prior original failures/retries and unproved causes remain historical
evidence. No deadline or predicate was weakened and no unrelated retry run.
Broader simultaneous SPM/full matrices stay OPEN. Licenses/authorized exports/
Rustici account/actual Safari+Android/reviewed production inputs stay BLOCKED.
Epic #133 OPEN; production DISABLED. Continue independent implementation
immediately without waiting for merge.
