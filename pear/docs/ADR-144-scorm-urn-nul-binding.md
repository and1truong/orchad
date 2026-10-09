# ADR-144: Shared URN NUL binding

RFC2141 section2.4 says a null octet should never be used in raw or
percent-encoded form. This conditional URN policy follows that guidance.
The shared short/long identifier expressions accepted urn:pear:a%00b.
Original six raw/facade/preload/durable replay regressions fail on v35.
pear-urn-nul-v36 adds the same conditional URN NUL refusal to the two shared
expressions; URI percent/type/length/namespace/packed-array/dependency checks
remain. Non-URN percent00 and URN percent01/literal percent2500 remain exact.
No recursive decode, schema, SCORM1.2 or accepted receipt/history rewrite.
2004 SHA256: 35b50ad4ce8742e927725802ccba2b9950532f637d3a0ea74daa886155ff0790.

The installer upgrades exact v35 and all historical paths and rejects unknown
bytes. Trusted snapshot identity admits v35 while retaining v34/older markers
and wrong-attempt/unknown-marker refusal; complete restored-state equality uses
the same Date clock. Original valid-vector order/indexes remain unchanged.
Focused26/26, draft domain804/804 across118 files, build and built URI3/3
complete exit0. Integrated latest-parent domain804/804 across118 files/build
and built11/11 (URI3, learning2, close-navigation3, lost-resume-response3)
complete exit0. Full145 local browser acceptance remains required; earlier
parent failures and observation logs are retained, not erased by these passes.
New-head CI/reviews and full parent acceptance remain required. This closes the
named NUL guidance only; URI authority/IP literals/UTF8/equivalence and full
reference/error/edition conformance remain open. Two original edition3/4
IPv6-identifier regressions are retained separately and not fixed here.

Epic #133 remains open, production disabled. Licensed authoring exports,
Rustici account, actual Safari/Android and reviewed real production scanning/
storage/retention/load/recovery inputs remain missing.

Reference: https://www.rfc-editor.org/rfc/rfc2141 (section2.4); ADL RTE4.1.1.7.
