# ADR-190 — cmi5 Statement query and Activity metadata interoperability (#144)

Stacked on ADR-189 / #266. Add own-registration Statement API filters for Agent,
verb, Activity, related Activities, stored-time since/until and ascending order.
Agent filters still require the launch learner: this permission scope cannot
query a different learner's evidence. Single statementId requests accept only
format/attachments options; scoped nonexistent or voided IDs return 404. AUs
still cannot void statements or assert LMS-only defined verbs.

Default lists follow xAPI reverse stored-time order. Ascending lists are
explicit; the older `after` extension retains ascending compatibility. A
bounded continuation cursor preserves filters, registration, stored-time and
sequence tie-breaker, and a snapshot sequence ceiling. A new statement between
pages cannot repeat or skip an existing snapshot row, in either direction.
`limit=0` uses the server maximum of twenty; larger requested limits are capped.
The independent cookie-authenticated retained evidence endpoint remains the
existing chronological administrative/learner report, not an AU credential.

Formats exact/ids/canonical preserve accepted statement bytes logically, remove
display/definition metadata for ids, and select one language per Activity,
interaction component and Verb language map for canonical, using weighted
Accept-Language and subtag fallback. Extension values remain untouched. This
slice does not maintain an external global canonical vocabulary. Activity and
context Activity definitions now validate supported properties, BCP 47 maps,
IRIs, interaction types/component identities and bounded response-pattern
arrays. Exhaustive interaction-pattern grammar is further conformance work.
Allowed statements accept general xAPI raw scores without mandatory min/max;
cmi5-defined outcomes retain their integer and mastery constraints.

Document list and Statement query timestamps accept UTC or explicit offsets
with millisecond precision and valid calendar dates. cmi5 source statements
remain mandatory UTC with their existing lifecycle ordering. Statement HTTP
responses expose Consistent-Through; single GET also returns Last-Modified.
JSON retrieval never claims to deliver raw attachments: multipart attachment
requests remain explicitly unsupported pending their implementation.

Local evidence: 26 cmi5 cases, build/typecheck/vendor and five built Chromium
journeys PASS. Tests include equal stored timestamps, inserts between pages,
filter/cursor tampering, cross-registration disclosure, offsets, formats,
language fallback, immutable extensions, malformed metadata and atomic batches.
The schema-53 predecessor also passed all 1,135 existing Pear regression cases
(concurrency 2, no failed/cancelled/skipped cases). External full conformance,
official bindings, licensed content and production/platform gates stay open.
The next cmi5 lifecycle slice continues without waiting for this stack to merge.
