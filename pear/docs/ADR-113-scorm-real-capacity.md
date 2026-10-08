# ADR-113: separate real precision from integral capacity

Epic #133, stacked on ADR-112 / PR #182. The engine limits 2004 reals to ten
integral digits and caps audio_level/delivery_speed at 999.9999999. ADL RTE
§4.1.1.7 states that real(10,7) precision does not specify integral digit count;
§4.2.13 specifies nonnegative preference values without an upper bound.

`pear-real-capacity-v17` removes the ten-digit integral regex cap and sets both
preference ranges to 0..*. The shared numeric validator still refuses non-finite
Number inputs and retains the existing 4096-character host scalar envelope, so
content cannot enqueue a value that this host silently cannot replay. Exact
strings, including signed scores and leading zeros, remain intact. Existing
scaled/progress [-1,1]/[0,1] ranges and negative preference refusal remain distinct
407 errors; malformed/non-finite/over-envelope scalars return 406 and preserve
state. Fraction lexical precision and all other numeric semantics remain bounded
by the existing engine; this change does not certify all numeric bindings or
arithmetic at IEEE extremes. The 1.2 engine/defaults/limits remain unchanged.

Exact 2004 ESM SHA-256:
`2872964c5545baf04c2de580be6ece0dafafe76c83d04efedc7b5d5cec7720df`.
1.2 remains
`220469e4b8764960e49fe797f899a00fcdbc10d341cf01e534241bf4b0947a32`.
The reversible installer explicitly tests predecessor v16 reviewed bytes,
historical inputs, idempotence and unknown-source/version refusal. Known v16
snapshot markers remain accepted. No migration/history rewrite or production change.

Nine original domain regressions fail before correction: three-edition wider
score/objective/weight/preference values, preserved errors/ranges, full host
scalar capacity, pre-init load/non-finite refusal and bound exact receipts with
atomic forged-overflow rejection. Three built pipwerks journeys save wider real
strings, refuse bad writes, lose/retry ACK and close/resume without official proof.

Reference: ADL SCORM 2004 fourth-edition RTE §4.1.1.7 and Table 4.2.13a:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Full field/type/error/edition conformance, licensed reference/commercial inputs,
actual platforms and deployment isolation/operations evidence remain OPEN/BLOCKED.
