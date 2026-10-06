# ADR 028: Trusted Lime learning workflows
Epic #49 G02/G11/G13/G20/G21/G22; depends on shared Pi #47, existing durable seam #48.

## Decision
Lime owns the trusted workflow guidance, model/gateway choice, consent, conversation, cancellation and approval. Pear remains deterministic and contains no model/provider keys/agent loop. An explicit Pear-only host selector offers discovery, planning, optional practice, curation, typed report and audience-rule drafting. Guidance is not a permission and never incorporates page-authored tool descriptions. Available semantic tools, host read consent, current target/session and server roles continue to decide authority.

Guidance requires source IDs/versions, honest no-match/withheld results, intended-vs-observed metrics, explicit typed report/group previews and normal mutation approval. Practice is visibly labelled AI/unofficial and skippable. It asks from an explicitly selected permitted source and never selects/submits official answers or claims official credit. Backend human-only grading/completion remains the actual enforcement boundary. Lesson semantic results now include enrollment/course/version IDs even when text is withheld.

Changing workflow resets the conversation. Skip aborts the active turn and its approval; a generation check prevents late text/history from resurrecting the old workflow. Consent/target invalidation also advances generation, keeping canceled context out of a later conversation. Ordinary chat in other apps retains its existing behavior.

## Evidence
The actual unpacked-extension harness is extended to opt into a lesson read, send trusted guidance through the shared Pi client to a scripted Mango fixture, receive the authorized original source with IDs/version, then skip a pending mutation approval and prove identical Pear bookmark/progress/revision. A following turn must contain no old tool transcript/practice system guide. Recorded gateway messages are synthetic fixture-only, bounded to 32 requests; credentials are never part of recorded request bodies. Exact-head CI still determines PASS.

The gateway chooses known tool calls and returns canned text. This verifies real transport, grounding context, approval/cancellation and learning integrity, **not live-model natural-language accuracy or question quality**. Provider-backed relevance, recommendation/explanation quality, NL report/rule correctness and multi-language practice evaluation remain NOT RUN until an authorized provider lane is supplied. No invented quality score or benchmark.

Durable companion authority/reconciliation already exists; this selector applies to foreground chat. The full Pear-specific durable planning/digest/calendar/channel workflow, Slack/Teams installs and real notification delivery remain open. No always-on loop or deployment.
