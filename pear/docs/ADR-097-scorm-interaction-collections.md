# ADR-097: Empty and full-capacity SCORM interaction collections

Continue #133 above the localized-string slice (ADR-096). Reference the
[ADL-authored 2004 RTE archive](https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf),
section 4.2.9 learner/correct-response binding tables. The learner choice,
matching, sequencing and performance collections permit zero records. A
choice correct-response pattern may represent an empty set (no correct
choice); that is one pattern, not absence of the pattern collection.

The pinned engine rejected empty learner collections after valid ID/type
initialization. Admit zero records only for those four types, after existing
dependency checks. Numeric, true-false and likert responses still require
their typed value. Admit an empty choice correct set in the typed pattern
setter; duplicate correct sets remain refused by upstream validation.

Two persistence paths previously dropped the no-choice pattern: host replay
treated a newly seen empty leaf as unset, and engine JSON loading ignored
falsy strings. Replay explicit empty interaction collection/pattern leaves,
while retaining the existing unset scalar defaults. Preserve empty
correct-response pattern leaves when loading CMI JSON. Keep this correction
scoped to the typed interaction pattern path; do not change unrelated empty,
null or falsy serialization semantics. Reload retains the pattern's count.

The old per-leaf envelope limit also rejected standard-size typed collections.
Admit up to 128000 scalar characters per interaction learner-response or
correct-response-pattern leaf, with the existing 512 KiB serialized checkpoint
and 2048-leaf bounds. This covers 36 choice/sequencing identifiers, 36 matching
pairs and 250 performance records at their individual 250-character capacities.
The engine still checks record count, type, uniqueness and each component's
grammar. ID leaves keep their prior quota. No larger permission or official
completion authority is granted by this envelope change.

Correct the 2004 plain-string constants and performance answer character atom
to count a disjoint BMP-or-surrogate-pair scalar. Direct interaction validators
construct regexes outside the common plain-string validation helper, so the
ADR-095 helper correction alone did not cover those consumers. Keep existing
reserved separator checks; only scalar width changes. This admits a
250-supplementary-character performance answer and a 4000-character other
learner response without weakening per-record capacities. Lone surrogates
remain rejected in the facade and trusted replay.

Behavior adaptation is `pear-interactions-v6`; engine stays at 3.4.5.
2004 ESM SHA-256:
`0294d815f75b820fdb34e8dde0a84297e49f42bba45a10f826ff298423f92d6d`.
The 1.2 entry remains unchanged from ADR-095. The actual installer upgrades
all known pristine/logging/selection/limits/Unicode/localized inputs, checks
cardinality and complete output hashes, is idempotent and refuses unknown
bytes/version. Known localized-v5 and prior pinned-engine snapshots remain
accepted; unrecognized adaptations and scope identities remain rejected.

Three-edition domain cases cover empty collection dependencies, no-choice
pattern count, duplicate denial, invalid empty scalar responses, ACK/exact
retry and close/resume. Separate cases round-trip maximum-size choice,
matching, sequencing and 250-record supplementary performance plus other
answers; extra records/over-limit answers and forged writes fail without
changing revision or creating official proof. Three built edition journeys
save/resume the large performance response and empty correct set, recover a
lost Finish ACK and complete through authenticated server navigation.

This slice does not claim exhaustive URI grammars, all correct-response
prefix/whitespace rules, every error-precedence combination, reference-engine
certification, additional platforms or production readiness. Those requirements
remain explicit in epic #133. No schema migration or production enablement.
