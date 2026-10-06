# ADR 002 — Standalone items, course modules and reusable snapshots

Status: accepted for the synthetic P1 authoring layer. Part of #49; stacked on PR #59, base branch codex/pear-lms-49. This extends application schemas without changing Bridge 0.1 or adding model dependencies.

## Standalone identity and version lifecycle

An item is self-authored text, HTTPS video with transcript or HTTPS link, with metadata and explicit model-processing permission. It is independently draft/published/retired, discoverable by same-tenant learners and readable through the human controller. Reading alone does not create enrollment, progress, score, completion or certificate. Playlist/award semantics remain a separate P2 capability.

Content Admin/Admin create/edit/publish/retire under the library aggregate. Manager, learner and assessor cannot author. Items have immutable published versions; edits change only the draft. Publishing creates the next version transactionally with library CAS, idempotency and audit. Retirement hides standalone discovery and prevents new draft saves/publications referencing that item. A new published item version requires explicit selection in a course; no latest-version alias is resolved automatically.

Every course lesson may carry contentRef = itemId + exact version. The server reads the same-tenant published item version and copies its authoritative title/kind/text/URL/transcript into the course snapshot, preserving the local lesson ID and progression prerequisites. Caller-supplied duplicate fields cannot override that source. Course publication revalidates availability and the pinned version inside its transaction. Old item versions remain reusable while the item is published. Item retirement does not revoke independently published course snapshots; those retain self-authored distribution rights and existing course/enrollment history. Commercial revocation is not supported by this policy and requires the provider/entitlement design in P3.

The source permission is inherited conservatively: a course containing any item that disallows model processing becomes model-restricted. Source permissions are attached to the immutable source version, not later item drafts. Restricted lesson/assessment/course-draft/item-draft/item-read bodies are withheld through the bridge. Human reads remain authorized. Metadata previews are permitted only under the existing self-authored synthetic policy.

## Modules and progression

Optional modules partition every lesson exactly once in the same order as the course lesson sequence. Each module has an ID/title, nonempty ordered lesson IDs and distinct prerequisite module IDs. References must point to earlier modules, rejecting self/forward references and cycles. Lesson prerequisites still refer to distinct earlier lessons.

A lesson can be read or acknowledged only when its explicit lesson prerequisites and all lessons in its prerequisite modules have been acknowledged. The backend applies the same rule to human and bridge reads and human acknowledgement. Learner previews expose the effective prerequisites and module labels; answer keys remain absent. The final course assessment requires every lesson as before. Existing courses without modules retain their exact behavior and need no JSON rewrite.

## Human authoring and draft preview

The editor covers all current bounded metadata, 1–8 lessons across 1–8 modules, inline text/video/link/transcript or reusable refs, module/lesson sequence and prerequisites, 1–8 MCQ questions with 2–6 choices and pass score/attempt settings. Draft save does not publish. Reordering invalidates forward dependencies if the author has not adjusted them; backend rejects rather than silently removing progression rules. Removing a draft lesson/module explicitly removes its references inside that draft. Existing enrollments are immutable.

Admin preview displays local unsaved draft content without any learning/attempt mutation. It does not fetch remote media or display active external content. Reusable sources offered by the picker are the current bounded content-draft page; use item pagination for other sources. Previously selected historical versions remain visible. Source policy always wins over a requested course policy.

## Persistence and bounds

Migration 002 is additive/idempotent, creating content_items and content_item_versions while retaining v1 course/enrollment/attempt data. Standalone items are at most 12 KiB, course snapshots at most 44 KiB, envelopes at most 64 KiB. Validation runs again after materializing references, so repeated Unicode/media content cannot bypass byte bounds through short IDs. Discovery/draft pages have row and byte bounds. Audit stores item IDs, not content bodies.

No upload, SCORM/interactive package, externally licensed source, playlist/award, full i18n, accessibility certification or production identity is added by this layer. Those remain in the parity register.
