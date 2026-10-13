# ADR-189 — scoped xAPI document resources for cmi5 (#144)

Stacked on ADR-188 / #265. The AU credential still authorizes only its launch
Agent, exact LMS AU Activity and own registration. This is an extension of the
cmi5 listener, not a replacement for the existing restricted ADR-025 API.

State, Agent Profile and Activity Profile now support GET/HEAD/PUT/POST/DELETE,
arbitrary document bytes and preserved Content-Type. State with a registration
is separate from State without one; the latter persists across registrations
for the same learner/AU. Agent Profiles persist for the learner, Activity
Profiles are shared by authorized learners of the same LMS AU, and all scopes
remain tenant-bound. Agent and Activity GET provide scoped Person/Activity
metadata. LMS.LaunchData and cmi5LearnerPreferences remain LMS-owned read-only
documents; bulk State deletion retains LaunchData.

JSON PUT preserves original UTF-8 bytes. JSON POST shallow-merges objects only;
arrays, duplicate keys, malformed UTF-8 and binary POST fail without mutation.
ETags are quoted SHA-1 hashes of the returned identity bytes, as required by
xAPI 1.0.3 Communication. Conditional GET/HEAD, conditional writes, 412 and
profile replacement without a precondition (409) are supported. State permits
unconditional updates as allowed by the State API. Lists are sorted and accept
an exclusive UTC `since` timestamp. Responses expose ETag/Last-Modified to the
reviewed remote AU without enabling cookies or wildcard CORS.

Migration 053 preserves populated schema-52 registrations, JSON State and
timestamps, recalculates existing State ETags as SHA-1, adds binary State storage
and general scoped document storage. Quotas remain 32 KiB per document,
128 documents/512 KiB per scope (registered State across its registration), plus
a 16 MiB tenant cap for general documents. Writes and quota checks use the
existing synchronous transaction boundary. SQLite reopen, failed writes,
preconditions and quota failures preserve accepted bytes.

Local acceptance: 23 cmi5 cases; build/typecheck/vendor; five built Chromium
journeys, including actual remote binary Profile PUT/GET, exact bytes, exposed
ETag and conditional 304. The separate complete Pear regression result is
recorded in CMI5-ACCEPTANCE.md after completion. No external subscription,
inference API or provider secret is needed for these checks.

Remaining work includes broader Statement query/object/attachment semantics,
official learning/partner bindings, exhaustive XSD/LRS/cmi5 conformance and
external content/platform/production acceptance. These are tracked separately;
document interoperability does not grant official credit or enable production.
