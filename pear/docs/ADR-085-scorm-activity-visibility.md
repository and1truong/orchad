# ADR-085 — Activity visibility and default launch

Status: implemented successor to ADR-084; epic #133 remains open.

[IMS Content Packaging Best Practice 1.1.4 section 4.10](https://www.imsglobal.org/node/53181) defines isvisible as organization-menu presentation. It defaults true and is not inherited by an item's children. Preserve an explicit boolean on each retained activity. Render only visible leaves in both existing menus; descendants of hidden folders retain their own defaults. Visibility does not remove a SCO from tracking, prerequisites, sequencing or published completion/pass requirements.

Do not forward manifest isvisible to scorm-again Activity.isVisible: the pinned engine also uses that flag to deny choice navigation. Trusted sequencing continues to govern choice/flow/rules independently. Unknown XML visibility booleans are rejected.

Add a human consent-gated enrolled Play or resume action, so all-hidden organizations remain launchable. Without an explicit SCO choice, 2004 follows its trusted current delivery or start/resume flow, avoiding an unintended choice of the first menu activity. SCORM 1.2 selects the first available unfinished SCO, then the first available SCO if all have finished; explicit SCO choices retain prerequisite authorization. Practice already has a package play/resume action. Server checks every launch independently; visibility is not an access grant.

Tests cover all editions, hidden-first and all-hidden packages, independent child defaults, invalid booleans, hidden direct choice/flow/current delivery, unfinished resume and unchanged official evidence/prerequisite denial. Built browser journeys verify hidden menus, consent, save/close/resume, next hidden SCO, final proof and separate course quiz/certificate requirements. No migration; retained originals are reparsed through the updated reader. Other unsupported semantics and exhaustive conformance/production/platform/reference gates remain open.
