# ADR-187 — cmi5 standalone XML and ZIP64 (#144)

Successor to merged #262 / ADR-186, based on main `152b78b751f129a2cf0858bba5e9e45b8d5bd751`.

Import now accepts standalone UTF-8 XML (`application/xml` or `text/xml`, 1 MiB)
alongside ZIP32/ZIP64 (32 MiB). Media type must match the `.xml`/`.zip` filename.
Both formats retain their exact source bytes, immutable hash, quarantine/review,
tenant authorization, operation receipt and correct export media type. No schema
migration, new dependency, remote fetch or production enablement.

Standalone XML requires fully qualified HTTPS AU URLs; loopback HTTP is accepted
for controlled fixtures. ZIP packages may combine local and fully qualified AU
URLs. Credentials, non-web schemes, network-path references and reserved cmi5
query names are rejected. Remote AU metadata uses `pear-cmi5-quartz/2`; existing
local packages/registrations keep the original profile and identity. Remote launch
is disabled until the separately reviewed origin/session/CORS successor.

Namespaced vendor extensions are ignored at the XSD extension positions, after
core children. They cannot masquerade as standard course/block/AU/title fields or
override core attributes. Objective title/description follow the XSD's unordered
group. DTD/entity, node/depth, Unicode and archive/path/CRC quotas remain enforced.
Arbitrary XSD/IRI conformance remains separate from these checked constraints.

The ZIP64 fixture uses real 64-bit size/offset extra fields, EOCD64 and locator,
with all 32-bit sentinel values. Python's standard `zipfile` independently reads
all files and verifies CRCs; the actual bounded runtime reader then imports them.
Malformed locators and over-quota 64-bit sizes are rejected. This closes the
internal ZIP64 fixture gap, without asserting external certification.

Acceptance: the expanded cmi5 lane covers source formats, vendor positioning,
mixed URLs, independent ZIP64 checks, HTTP MIME/source identity, restart and
authorization; the built browser lane covers standalone XML import/review/export
as well as existing local-AU journeys. Subsequent remote runtime, general LRS,
official bindings and production/platform work continues in #144.

Local validation: build/typecheck/vendor PASS, 16 cmi5 cases PASS, all four built
Chromium journeys PASS. A first browser attempt used the old ZIP-only upload
label; the corrected ZIP/XML locator passes without weakening assertions. The
independent ZIP64 check uses a temporary file and a bounded Python subprocess,
avoiding a stdin pipe hang observed in this executor. CI remains a separate gate.
