# ADR-193 — scoped cmi5 multipart attachments (#144)

Follow-up on merged #264–269, based on main `aa420817`. Statement POST/PUT now
accept multipart/mixed; GET with attachments=true emits a JSON first part and
the available raw parts, deduplicated by SHA-2. Ordinary JSON retrieval retains
attachment metadata. JSON submissions require fileUrl for every attachment;
multipart submissions require the received matching bytes or fileUrl. Pear
does not fetch fileUrl resources or forward AU/application credentials to them.

Validate metadata, unique UTF-8 JSON, MIME headers, declared length/media type
and actual SHA-256/384/512 bytes before accepting the whole transaction. MIME
framing scans Buffers so binary zeros, non-UTF-8 bytes and near-boundary prefixes
are preserved. The bounded ingress profile uses strict CRLF, an ASCII boundary
of up to 70 characters, bounded unique unfolded headers and binary transfer
encoding (including omitted encoding, as allowed by xAPI). MIME preambles,
epilogues, folded headers and alternate transfer encodings remain unsupported;
this is not an exhaustive RFC/conformance claim.

Limits: 256 KiB transmission, 64 KiB JSON first part, four received parts and
32 KiB per attachment; 512 KiB raw bytes per registration and 16 MiB per tenant.
Same-hash retries do not consume space or advance revision again. Store raw bytes
under registration/tenant scope, never a global hash-only lookup. Header/hash/
length conflicts, unreferenced parts, quota or lifecycle errors and audit failure
roll back bytes and statements together. Immutable schema-55 storage preserves
previous registrations/State/learning proofs and introduces no completion credit.
Returned parts use matching metadata media type, or omit the optional part type
when the same bytes have multiple valid metadata types.

Local evidence: 43 cmi5 cases; build/typecheck/vendor; seven built Chromium
journeys including actual remote browser multipart POST/GET/CORS and exact bytes.
The regression result is recorded in CMI5-ACCEPTANCE.md after completion. Tests
exercise PUT, deduplication, hash algorithms, scoped disclosure, malformed MIME,
duplicate JSON, metadata mismatch, audit rollback, quotas and populated schema-54
migration/SQLite reopen. Full conformance, broader allowed objects and external
partner/platform/production gates remain open; object interoperability continues
in the successor without waiting for this PR to merge.
