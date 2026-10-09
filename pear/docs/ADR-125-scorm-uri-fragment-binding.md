# ADR-125: Shared URI fragment delimiter binding

RFC2396 §4.1 and RFC3986 §3.5 permit one raw fragment delimiter; a further
number sign must be percent-encoded. Shared short/long formats admitted
relative#first#second, including typed responses and forged replay.
One shared negative guard now rejects multiple raw signs, retaining %23,
empty fragments, query/question/slash data and exact authored values.
The existing scheme, conditional URN, character/percent/SPM rules remain.

Adaptation pear-uri-fragment-binding-v24 accepts known v23 snapshot markers.
2004 SHA25687e419e81c4f875d0388b8f5c4cad3036302bd2dc6b11acdec1d2f389783613f;
1.2 bytes remain unchanged. Installer verifies exact v23 reverse bytes,
known histories, idempotence and refusal of unknown bytes/version.
No normalization, schema or historical data rewrite.

Original vectors extend existing direct/facade/typed/preload/replay cases and
built identifier ACK/retry/resume journeys. All six regressions failed before
correction; focused13/13, full domain722/722 across105 files, build and all three
built identifier journeys completed. Exact-head full CI/native/review remains
required before ready.

References: https://www.rfc-editor.org/rfc/rfc2396
and https://www.rfc-editor.org/rfc/rfc3986.
Remaining component/authority/IP/namespace/UTF-8/equivalence, full internal
conformance and deployment/reference/platform gates remain OPEN/BLOCKED.
