# ADR 076 — Durable multi-file SCORM package ingestion

Builds on ADR 075 and epic #133. This slice adds ingestion and review; it does not enable package execution or claim edition conformance.

## Package boundary

Use pinned MIT `yauzl` 3.4.0 and `@xmldom/xmldom` 0.9.12 instead of the legacy two-file profile parser. ZIPs are streamed in memory, bounded by archive, expansion, entry count and per-file limits, with CRC verification. No archive entry is extracted to disk or evaluated. Reject traversal, duplicate paths, symlinks, encryption, unsupported compression and ambiguous paths. XML is parsed by namespace rather than prefix; DTD/entity declarations are forbidden. Resolve local `xml:base`, launch paths, file references and resource dependencies within the package root. Exact SCORM metadata distinguishes 1.2 and each supported 2004 edition. Import recognition alone is not runtime compatibility.

## Durable review lifecycle

Migration 044 adds original filename/provenance and persistent import jobs. Enqueue consumes the existing library revision and idempotency key inside the same transaction as audit. Validation runs asynchronously; restart resumes queued/running jobs. Finalization rechecks the author's current role, tenant and authorization version. Original ZIP bytes and SHA-256, immutable manifest, and every asset are committed together into a quarantined version. Audit failure rolls back finalization. Shared tenant quota includes legacy assets, legacy packages, import jobs, engine archives and expanded resources.

Publish/retire/revoke decisions identify the exact version and hash, require review reason and explicit confirmation, and retain the existing live authorization, CSRF/session epoch, revision and idempotency boundaries. Replaying a past review cannot restore a revoked version. Export returns the exact original archive. Learners see only published metadata. No completion, certificate, award or study time changes occur in this slice.

## Evidence and gates

Original self-authored five-file fixtures cover all four exact metadata editions, two SCOs, a shared resource dependency, XML prefixes/entity text and relative asset paths. Adversarial tests cover ZIP traversal/symlink/CRC/size, XML entities, invalid namespaces, unknown editions, missing resources, authorization changes and audit rollback. Built browser acceptance covers import, quarantine, publish, byte-identical export and revoke, alongside the legacy player regression.

New import/review/export is available only to explicitly enabled loopback development or authenticated identity fixtures. Production arbitrary content execution remains disabled. S3 must implement the isolated content host, durable runtime acknowledgements, resume and revocation. S4 must bind multi-SCO results to authorized learning items. S5/S6 must implement edition-specific runtime/sequencing; sequencing and prerequisites are not executed by this importer.
