# ADR-102: SCORM URI character/percent binding and full-size choices

The pinned engine accepted malformed percent escapes in short/long identifiers,
spaces/control characters in long identifiers, and unbounded long identifiers
through its URN alternative. Short identifiers rejected common URI punctuation
(`?`, `&`, `~`, `,`), including valid likert correct responses. A matching setter
also skipped typed validation whenever it saw a backslash before punctuation.
Original tests reproduce these defects against the exact pear-separators-v8 bytes.

The checksum-locked `pear-identifiers-v9` adaptation applies the shared ASCII URI
character/percent binding and 250/4000-character limits in the real engine. Both
the browser API and trusted server replay use its setters; loadFromJSON validates
stored identifiers before baseline-equality shortcuts. No URI decoding,
normalization or network lookup occurs. Bare commas remain URI data; bracketed
SCORM tokens retain their existing record boundaries. Matching patterns always
use the typed validator, including during trusted state load.

The response envelope now admits `36 * 4000 + 35 * 3 = 144105` characters, so the
required 36 full-length choice records and delimiters fit. The total 512 KiB
checkpoint and record-specific engine checks still apply. CAS, receipt identity,
atomic rollback and official-proof authority remain unchanged.

Installation upgrades every known pristine/adapted source, verifies exact input
and output hashes, is idempotent and rejects unknown bytes/version. Known v8 and
older sequencing identities stay accepted. Historically invalid CMI is refused
without silently rewriting it or creating a revision/receipt/proof; operator
recovery remains an explicit future requirement. No schema migration.

Original three-edition vectors exercise URI punctuation/escapes, exact values,
empty/control/space/non-ASCII/lone-surrogate/bad-percent rejection, identifier
limits, immutable-ID/dependency precedence, matching backslashes, full-sized
learner/correct choice responses, forged replay, legacy invalid state, exact
retry and real SQLite reopen. Built pipwerks journeys cover browser API,
full-capacity checkpoint, lost ACK/exact retry and close/resume.

References: ADL RTE §4.1.1.7 and §4.2.9, second-edition RFC 2396 §2 and
third/fourth-edition RFC 3986 §2:
- [RFC 2396](https://www.rfc-editor.org/rfc/rfc2396)
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986)
- [ADL fourth-edition RTE](https://adlnet.gov/assets/uploads/SCORM_2004_4ED_v1_1_RTE_20090814.pdf)
- [Archived original ADL RTE](https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf)

This is lexical binding evidence, not full URI conformance. Component/authority
grammar, edition-specific bracketed IP literals and scheme-specific RFC 2141 URN
constraints, identifier equivalence/uniqueness and all interaction-type matrices
remain OPEN in DM-02/RESP-02. In particular raw brackets are still refused by this
common binding; accepted encoded brackets remain exact. Full API/data-model/
language/time/sequencing/reference/commercial/platform/production requirements
remain open. Production stays disabled; independent coding continues.

Validation: recorded in the current PR/epic ledger on the exact head. Local
counts do not imply extension/native/reference or remote current-head acceptance.
