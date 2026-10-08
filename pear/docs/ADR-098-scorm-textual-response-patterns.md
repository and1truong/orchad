# ADR-098: preserve and validate textual correct-response patterns

Epic #133. Builds on accepted main `016a040e76242d14e58d10623fdbc1ed94693bab`.

## Problem and decision

Pinned scorm-again 3.4.5 has two correct-response validators. Its typed setter
rejects leading/trailing whitespace and unbracketed commas in textual answers,
rejects newline-containing patterns, and counts repeated fill-in records as
duplicates. Its API validator also accepts an invalid second boolean property
and strips language metadata inconsistently. Valid SCO writes can consequently
fail or invalid patterns can enter a durable checkpoint.

Keep the installed engine and checksum-locked adaptation. Reuse the typed setter
validator for fill-in, long-fill-in, performance and other patterns at the API
boundary. Validate leading interaction-wide boolean properties once, retain
per-record language bindings for typed scalar/SPM validation, preserve raw values
without trim/normalization, split textual records only on the reserved bracketed
separator (bare commas remain text), and enforce record uniqueness only where the response
definition requires it. Fill-in case/order properties support either order;
long-fill-in has case and performance has order. Invalid boolean values and
duplicate leading properties are rejected with 406. A failed replacement or
append leaves existing pattern/count unchanged; missing ID/type still gives 408.

Reference: ADL SCORM 2004 4th Edition RTE v1.1, sections 4.1.1.6–7 and
Table 4.2.9.1a, original document mirrored at
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
Tests are original vectors, not copied test-suite source. All three 2004 adapters
execute them; exhaustive earlier-edition reference reconciliation remains OPEN.

## Pin, history and authority

Adaptation `pear-responses-v7`, exact adapted ESM SHA-256:
`5312ce9cf54a83580a5e839c03cf6338a3b1d30d18fb0ab81f955b2ec603cb6b`.
Original pinned package bytes and all known intermediate adaptations are accepted
only through the existing exact-hash upgrade path. Actual installer tests cover
pristine through interactions-v6 and the initial response patch, repeat
installation, and unknown bytes/version. Review #166 found the legacy splitter
still split bare commas when no bracketed separator was present. Original vectors
now cover a single performance answer containing a comma and 250/251-scalar
fill-in answers with a comma; the latter cannot evade the per-record SPM.
Both browser bundle and trusted server replay use the same ESM entry. Existing
sequencing snapshots through interactions-v6 remain readable; unknown markers
remain rejected. No migration or package/proof/version rebinding.

CMI still comes from untrusted content and passes server-side typed replay in the
existing transaction. Receipt retry, current authorization, immutable proof,
official-learning projection, checkpoint quotas and the production-disabled guard
are unchanged. Language registry/URI/time/error/exhaustive response semantics,
reference/commercial/platform acceptance and production gates remain OPEN.

## Evidence

`scorm-responses.test.ts`: three-edition API preservation, two boolean orders,
Unicode/newline/comma/whitespace, maximum ten 250-scalar fill-in records,
repeated records, dependency/error/state preservation, transactional forged-write
denial, exact receipt retry, resume and zero unofficial proof.
`scorm-responses.spec.ts`: built isolated player with licensed pipwerks wrapper,
three-edition synchronous API/negative writes, durable server ACK and browser
preloaded resume. `scorm-unicode-install.test.ts` checks the actual patch path;
`scorm-selection.test.ts` preserves known snapshot compatibility.
