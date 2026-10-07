# ADR-018: Bounded metadata discovery and explicit profile recommendations

Search intersects published tenant content with reviewed filters: topic/provider/language/level, intended duration, required skills, industry, lesson format, author-declared accessibility, current-version aggregate rating, Pear publication date, organization curation and model-processing policy. Metadata excludes lesson bodies, quiz answers and private feedback.

Optional author metadata is validated and versioned with original course/item JSON. Accessibility provenance is author_declared; selecting a checkbox does not establish conformance. Publication dates are recorded atomically when Pear publishes a version. Migration backfills legacy versions with unknown dates and never invents historical timestamps.

Keyword mode preserves full-phrase matching. Controlled-concept mode normalizes Unicode and uses five explicit synonym groups plus bounded metadata words. It is a transparent local retrieval baseline, not an embedding search or an AI quality claim. Every result exposes matching concepts. Empty results remain empty.

Comparison requires two to four distinct, currently published authorized course IDs. Each source is validated; a revoked or retired source fails the operation. It never enrolls or modifies learning. Bridge reads withhold outcomes for human-only content and raw uploaded asset IDs. Human readers retain their existing authorized file access.

Recommendations rank only declared interests, declared language and explicit organization curation. Responses include reasons and source IDs, skip already enrolled content, and invent no skills or provider benchmarks. My learning independently prioritizes unfinished due work, then self-directed work, then completed and inactive history; no timer or intended duration changes this priority.

All discovery responses retain the shared 64 KiB envelope and use whole-row pagination within 48 KiB. Browser pagination records actual returned offsets rather than assuming every bounded page contains twenty rows. Role/tenant scopes, live authority and source licensing remain enforced by existing service boundaries.

Validation: six domain fixtures cover concept/no-match, intersected filters and immutable versions, comparison/egress, large whole-row paging, profile/due ordering, rollback and disk reopen. A human browser journey exercises discovery and comparison. Exact-head CI is required. Full semantic relevance evaluation, provider taxonomies/licensed catalogs and audited accessibility remain open.
