# ADR-123: Shared URI scheme and relative-first-segment binding

RFC 2396 §3.1/§5 and RFC 3986 §3.1/§4.2 require a URI scheme to
begin with a letter and then use letters/digits/plus/hyphen/dot. A relative
first path segment cannot contain a colon; prefixing ./ makes later colons
unambiguous. Existing shared short/long identifier formats admitted
1:identifier, :identifier and bad_scheme:identifier as valid error-0 values.

The checksum-locked v23 adaptation adds one guard to the two shared formats:
a valid scheme prefix, or a first relative segment without a colon before
slash/query/fragment/end. The existing character/percent/SPM and conditional
URN rules remain; case, escapes, relative references and authored values are
not normalized or rewritten. Short/long typed identifiers and textual
responses reuse these shared formats, including pre-init load and server
replay. No scheme registry, authority/IP/full component or equivalence claim.

2004 source SHA-256:
83c7f6ec22e62557ab0642af4ac3b3b5ab9d3d134074a53763d1eb918a6183cd.
1.2 source remains eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642.
Known v22 markers and historical source upgrades remain accepted. Installer
checks exact v22 bytes, reverse checksum, idempotence and unknown bytes/version
refusal. Invalid legacy/preloaded values fail before revision/receipt/proof;
no history/schema rewrite.

Original vectors extend existing shared/facade/preload/replay tests and built
identifier ACK/retry/resume journeys. All six regression cases failed before
fixing; focused13/13, full domain718/718 across105 files, build and all three
built identifier journeys completed after correction. The first full run was
717/718 because operations still expected the v22 source checksum; updating
that exact pin retained its assertions and the twelve operations tests passed.
Exact-head full CI/native acceptance and review remain required before ready.

References: https://www.rfc-editor.org/rfc/rfc2396
and https://www.rfc-editor.org/rfc/rfc3986. Remaining RFC components/authority,
edition-specific IP literals, namespace/UTF-8/equivalence, full internal
conformance and production/external/platform gates remain OPEN/BLOCKED.
