# ADR-194 — cmi5 allowed Statement object interoperability (#144)

Stacked on ADR-193 / #271. Allowed statements now accept Activity, Agent,
identified/anonymous Group, StatementRef and one-level SubStatement objects.
Validate inverse functional identifiers, Group members, verb/language/Activity
metadata, context instructor/team/statement and result shapes. Nested
SubStatements, SubStatement IDs/attachments/authority and voiding are rejected.
Outer statements still require the exact launch actor, registration, session
extension, publisher grouping and mandatory UTC source timestamp. cmi5-defined
statements still require the exact AU Activity and their existing verb, mastery,
mode, lifecycle and moveOn rules. Nested pass/completion results grant no credit.

StatementRef permissions cover existing statements of this registration and
valid members of the same atomic batch. Unknown/foreign IDs receive the same
unavailable rejection; references cannot expand tenant/learner permission.
Duplicate IDs within a batch reject atomically. UUID retries across requests
remain unchanged. Shared ISO 8601 duration validation supports bounded years,
months, weeks, days/time and fractional lowest components; P1Y is valid, while
bare units, mixed week/date/time and non-lowest fractions are rejected.

Statement queries recursively inherit each non-time verb/Activity filter through
object StatementRefs. Apply since/until/order/cursor to the targeting row's own
stored time, and retain the registration and snapshot ceiling. UNION terminates
cycles. A materialized scoped target relation lets SQLite index reference joins
without parsing entire statement bodies for every recursive edge. Context-only
statement references do not affect filtering. Related Activity filters include
SubStatement objects and their context. Agent query permission remains the own
launch Agent; root actor scope already constrains all returned statements.

exact preserves accepted object/context metadata; ids removes display/definition
and identified-Group members while retaining anonymous Group member identifiers.
canonical chooses Activity/Verb languages inside SubStatements. Raw extension
values remain unchanged. A remote browser now exchanges an allowed SubStatement
with its raw attachment through the actual multipart/CORS runtime.

Local evidence: 47 cmi5 cases, build/typecheck/vendor and seven built Chromium
journeys PASS. The schema-55 predecessor also passed all 1,135 existing Pear
regression cases (concurrency 2, zero failed/cancelled/skipped). New cases cover
all object forms, exact/minimum/canonical formats, forward/cyclic/scoped refs,
per-filter recursion, target stored-time boundaries, metadata errors, atomic
batches, forged defined objects and absence of credit from nested results.
This does not certify exhaustive XSD/xAPI/cmi5 or licensed/platform/production
acceptance; those gates retain their own requirements and evidence.
