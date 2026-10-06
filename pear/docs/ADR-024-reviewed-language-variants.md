# ADR-024: Reviewed content identity and language variants

Status: internal authored en/vi profile implemented; exact-head CI required. Licensed provider translation pipeline and full language coverage NOT VERIFIED.

## Identity and review

Migration 019 links one canonical original course/item to explicitly reviewed published authored derivatives. Identity is independent of source/version enrollment; variant source IDs remain exact launch/enrollment references. Only distinct current-tenant published self-authored sources in different supported languages are allowed. No translation chains, silent adoption, provider rights inference or automatic/model translation occurs. A source may have one active identity, and one active variant per language/identity; original language is the implicit original. Quotas retain at most 1000 identities/2000 review-history rows per tenant.

Content Admin/Admin human settings record exact original/derivative versions, provenance (`human_authored` or `ai_assisted_reviewed`), explicit human quality note/reason, reviewer and timestamp. Provenance is a reviewed declaration, not a claim that software proved linguistic accuracy or generated a derivative. This review uses same-origin/CSRF/session epoch, live role/auth-version, library CAS, atomic audit and exact retry. Disabling a review retains its history. Recovered historical action reports current active state.

## Discovery and selection

`learning_get_language_variants` is a bounded semantic read available through both human and Bridge. It returns a stable identity, metadata, provenance/disclosure, explicit preferred-language choice, original fallback and unavailable/version-change reasons. Quality-review prose is human-only; bodies/answer keys/transcripts/private asset IDs never appear in this metadata tool. Versioned full content retains existing processing/licensing gates; a reviewed translation never overrides aiProcessingAllowed.

Course discovery filters/ranks authorized source metadata, then emits one entry per current reviewed identity, preferring the requested language or declared profile language among matching results. It does not bypass search/filter matching to return a different language. Comparison retains explicit source IDs; declared-profile recommendations avoid duplicate identities and already enrolled identities. Standalone discovery remains source-oriented, with a reviewed identity selector in preview; collapsing its ranking still remains a UI/discovery gap.

Human course/standalone previews display provenance and language choices. Choosing a variant opens an explicit preview only. It never enrolls, transfers answers/progress, relaunches an active pinned player or grants credit. Existing enrollment/assignment/completion/certificate/attempt pins stay unchanged; learning the derivative later is a distinct explicit source enrollment. Cross-variant equivalence/credit transfer remains unsupported and cannot be inferred from translated wording.

A new publication version on either original or derivative invalidates the old **discovery review**; a human must disable/re-review exact new versions. Existing enrolled old versions remain readable under the existing ledger rules. Retired/unavailable/different-tenant sources are omitted with clear reason; original fallback requires the original still be authorized and published. No silent fallback to an unlicensed source occurs.

## Evidence and gaps

Seven domain/HTTP fixtures cover original fallback, one identity, source-only metadata/model egress, discovery language/filter deduplication, live roles/tenancy/CAS/versions/chains, atomic audit rollback, exact retry/disable/revocation, retired/pinned versions, no credit transfer, standalone derivatives and durable reopen. Browser fixture reviews a derivative as admin, previews an explicitly disclosed Vietnamese source as learner and verifies prior enrollment/progress/certificate counts unchanged.

Only reviewed en/vi authored derivatives are supported. Licensed provider variants, complete supported provider languages, translation generation/storage/provenance pipeline, external quality audit, variant-aware assignments/award equivalence and full reference entitlement semantics remain OPEN/BLOCKED/NOT VERIFIED. Existing explicit UI locale from ADR-020 is separate from source language; no benchmark or provider translation parity is claimed.
