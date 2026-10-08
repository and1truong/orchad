# ADR-083 — Manifest-local sequencing collections

Status: implemented successor to merged SCORM S1–S8; epic #133 remains open.

Packages using IMS SS sequencingCollection and IDRef previously failed playback. Resolve references during manifest inspection, retaining the original archive unchanged. Collections are local to the same root manifest, exactly zero or one, nonempty and bounded. Definitions require unique XML NCName IDs; item/organization sequencing permits only IDRef. Reject dangling references, chaining, duplicate IDs (including collisions with package identifiers), misplaced collections and unsupported definitions even when unused. SCORM 1.2 does not accept this profile.

[IMS Simple Sequencing XML Binding 3.1–3.2](https://www.imsglobal.org/node/52631) requires inline information to replace an entire top-level XML group. Compile XML groups before translating them to engine settings. A controlMode override therefore resets omitted flow/forwardOnly and other control attributes to their standard defaults; objective overrides remove referenced objective mappings. Independent groups remain inherited. Engine collection helpers merge controls and omit some group settings, so they are not the authority for manifest compilation. No mutable engine state is shared between activities.

Tests execute collected flow/local-objective gates through both SCOs, durable delivery and one official completion proof for editions 2/3/4. Counterexamples cover whole-group control/objective replacement, engine defaults, Unicode IDs and malformed/dangling/chained/duplicate/misplaced/unused definitions. Existing checkpoint authority, immutable history, technical attempts and course quiz gates are unchanged. No schema migration.

This implements collections for the currently supported sequencing groups. Other unsupported sequencing semantics still fail closed and remain required work in the epic. These fixtures are not exhaustive conformance or commercial/reference certification. Production remains disabled.
