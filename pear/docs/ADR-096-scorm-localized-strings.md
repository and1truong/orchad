# ADR-096: Localized Unicode runtime strings

Continue epic #133 on the integrated Unicode tip after its main merge. ADL's
2004 RTE section 4.1.1.7 describes character counts and an optional language
delimiter; sections 4.2.2, 4.2.9 and 4.2.17 apply it to comments, interactions
and objectives. Reference: [the ADL-authored fourth-edition RTE archive](https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf).
The archived specification is read as a reference, not redistributed here.

The pinned engine's localized-string patterns counted UTF-16 units and
excluded line terminators. Their language patterns also accepted malformed
subtags and did not cover multiple hyphen-prefixed subtags. Correct those
shared patterns in the actual 2004 ESM entry, rather than bypassing validation
in the facade. Browser playback, server checkpoint replay and interaction
record validation consume the same corrected patterns. Retain the existing
correct-response language-code capture used by upstream validation.

Use a disjoint BMP-or-surrogate-pair atom to count each Unicode scalar once
without switching unrelated legacy regexes to Unicode mode. Allow line
terminators and ordinary braces in text. Reject lone surrogates, malformed
leading language delimiters, empty localized language codes and subtags
outside the 1–8 character lexical binding. Support multiple subtags and a
250-character language value. Keep text and language metadata separate when
applying the existing 250/4000 bounded localized-string patterns. The generic
description pattern retains its prior unbounded engine capacity; descriptions
still have the host checkpoint quota. SPM specifies minimum capacity, not a
maximum every implementation must enforce. Do not normalize or truncate data.

Host envelope quotas account for binding overhead: localized comment and
description leaves allow 4257 scalar characters; interaction response/pattern
leaves allow 8192, sufficient for ten 250-character fill-in records with their
own 250-character language values and separators. Engine replay still checks
each typed record and collection size. The 512 KiB serialized checkpoint limit,
2048-leaf limit, container whitelist, protected LMS fields, live launch scope,
CAS, exact receipts and transactional proof rules remain in force. These
bounded envelopes do not claim every performance-interaction capacity.

Behavior adaptation is `pear-localized-v5`; engine version remains 3.4.5.
2004 ESM SHA-256 is
`445f18f920d5424b335c666594e532fb9a3238b84cc76f522d5185e41aabbd08`.
The 1.2 ESM entry remains
`2f8591ab1f08bd696ff11dc72b1e92c197d12512978ef870a39507ed9567e366`.
The actual installer upgrades pristine/logging/selection/limits/Unicode inputs,
is idempotent, preserves MIT notices and refuses unknown source bytes/version.
Known selection-v2, limits-v3 and Unicode-v4 snapshots retain compatibility;
unknown adaptations and mismatched launch/package identities are refused.

Three edition domain regressions cover exact 4000-character supplementary
comments and long-fill-in responses with the complete 250-character language
value; ten maximum localized fill-in records; supplementary descriptions;
combining sequences, newlines and unchanged bytes after ACK/retry/close/resume.
Forged malformed/oversized comments roll back without revision or official
proof. All three editions also check scalar bounds and invalid language/surrogate
writes for learner and correct-response records without mutating prior values.
Three built browser journeys save/resume package-owned localized text through
the isolated player, recover a lost termination ACK and preserve stored text.

This slice does not close exhaustive language registries, identifiers, all
interaction grammars/error precedence, time/calendar conformance, licensed
reference/commercial differential testing, additional platforms or production
egress/scanning/retention gates. Required acceptance remains explicit in #133.
