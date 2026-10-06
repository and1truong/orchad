# ADR-073: authorized pinned course opening
2026-10-06. #49/G08, on ADR-072.

Award course opening previously returned any existing same-cycle course before checking current rights. It could return the wrong immutable version or replay an obsolete success after audience revocation.

Resolve a single pinned version in the bounded award graph; conflicting nested pins require author review. Check pinned and current audiences before existing-row lookup and before receipts. Select the newest same-cycle successor and require its exact version and active obligation. A mismatch fails with a human diagnostic; no implicit migration, reset or fabricated completion. Existing reviewed learning changes remain separate.

The original UI displays the course pin. Three domain regressions and one actual EN/VI browser failure journey verify disclosure, no history/score/receipt mutation, live-rights replay denial and ambiguous nested pins.

OPEN: permitting multiple explicit pins in one graph, reviewed completed-course requalification and award-cycle child course migrations, exact reference/reset/recertification semantics and external dependencies. This bounded correction does not claim those gaps are closed.
