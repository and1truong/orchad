# Integrated stack review dispositions

All 73 PR review-thread inventories were read before integration. This is a source-level disposition ledger; it does not mark remote threads resolved or replace exact-commit checks. Historical findings are retained below. Current acceptance and remaining gaps are in DELIVERY-EVIDENCE.md and DELIVERY-STATUS.md.

| PR | Finding | Current disposition |
|---|---|---|
| [#59](https://github.com/and1truong/orchad/pull/59) | Bound catalog pages by serialized byte size | Byte-aware pages already present at baseline. |
| [#59](https://github.com/and1truong/orchad/pull/59) | Look up stored outcomes before mutable resource checks | Retain live authority before replay: required by this delivery. A revoked recipient/manager cannot recover a receipt through the obsolete grant; immutable committed ledger remains. |
| [#60](https://github.com/and1truong/orchad/pull/60) | Clear hidden media fields when changing item format | Format-change normalization already clears hidden URL/transcript/caption fields at baseline. |
| [#61](https://github.com/and1truong/orchad/pull/61) | Freeze award totals when issuing certificates | Immutable certificate graph at issuance; additive legacy snapshot provenance. |
| [#62](https://github.com/and1truong/orchad/pull/62) | Preserve the baseline date when creating missing profiles | Stable seed profile date; loaded account IDs read-only. |
| [#62](https://github.com/and1truong/orchad/pull/62) | Disable identity editing for loaded users | Stable seed profile date; loaded account IDs read-only. |
| [#64](https://github.com/and1truong/orchad/pull/64) | Process scheduled occurrences before closing expired plans | Inclusive-window catch-up before closure; exact legacy cycle proof. |
| [#64](https://github.com/and1truong/orchad/pull/64) | Scope recurring award proof to its assignment cycle | Inclusive-window catch-up before closure; exact legacy cycle proof. |
| [#66](https://github.com/and1truong/orchad/pull/66) | Synchronize assistant groups on every view transition | All navigation updates assistant group; refresh depends on group. |
| [#66](https://github.com/and1truong/orchad/pull/66) | Restart refreshes when the assistant workspace changes | All navigation updates assistant group; refresh depends on group. |
| [#67](https://github.com/and1truong/orchad/pull/67) | Require a failed attempt before granting retries | Graded-failure retry eligibility; Unicode answers already use shared code-point engine. |
| [#67](https://github.com/and1truong/orchad/pull/67) | Count Unicode code points for response limits | Graded-failure retry eligibility; Unicode answers already use shared code-point engine. |
| [#68](https://github.com/and1truong/orchad/pull/68) | Block interactive self-navigation to external origins | Content-owner role revocation fixed. Opaque iframe authority isolation is retained; arbitrary script self-navigation egress remains CODE, with M1/M4/M7 completion gates. |
| [#68](https://github.com/and1truong/orchad/pull/68) | Recheck the owner's author role before bypassing media scope | Content-owner role revocation fixed. Opaque iframe authority isolation is retained; arbitrary script self-navigation egress remains CODE, with M1/M4/M7 completion gates. |
| [#69](https://github.com/and1truong/orchad/pull/69) | Hide join URLs until the learner has booked | Booked-only links, actual session metadata, canonical definitions and per-owner uploads. |
| [#69](https://github.com/and1truong/orchad/pull/69) | Identify the booked session in attendance reviews | Booked-only links, actual session metadata, canonical definitions and per-owner uploads. |
| [#69](https://github.com/and1truong/orchad/pull/69) | Bound abandoned learner uploads before applying tenant quota | Booked-only links, actual session metadata, canonical definitions and per-owner uploads. |
| [#69](https://github.com/and1truong/orchad/pull/69) | Canonicalize session definitions before comparing them | Booked-only links, actual session metadata, canonical definitions and per-owner uploads. |
| [#70](https://github.com/and1truong/orchad/pull/70) | Clear the prior attachment when a replacement starts | Clear prior asset at replacement start. |
| [#71](https://github.com/and1truong/orchad/pull/71) | Restrict ratings for superseded course versions | Retain lawful explicit historical public-version ratings under FeedbackService requested-version ACL; immutable snapshots are not silently replaced by latest. Current group authority is still checked. |
| [#72](https://github.com/and1truong/orchad/pull/72) | Limit new tracking to the visible version | Interactive launch schema already accepts tracked context. Explicit old published pins remain lawful under current audience/license gates; no silent latest-version substitution. |
| [#72](https://github.com/and1truong/orchad/pull/72) | Accept enrollment context in interactive launch | Interactive launch schema already accepts tracked context. Explicit old published pins remain lawful under current audience/license gates; no silent latest-version substitution. |
| [#73](https://github.com/and1truong/orchad/pull/73) | Render monthly plans as recurring in the plan list | Monthly metadata summary and non-truthy editing mode. |
| [#73](https://github.com/and1truong/orchad/pull/73) | Keep monthly mode active while editing its interval | Monthly metadata summary and non-truthy editing mode. |
| [#74](https://github.com/and1truong/orchad/pull/74) | Keep the pulse boundary monotonic after clock rollback | Monotonic pulse boundary; rollback regression expects 24 honest seconds. |
| [#77](https://github.com/and1truong/orchad/pull/77) | Preserve outcomes for human course previews | Human preview outcomes, normalized metadata, submitted-query pagination. |
| [#77](https://github.com/and1truong/orchad/pull/77) | Canonicalize validated discovery metadata | Human preview outcomes, normalized metadata, submitted-query pagination. |
| [#77](https://github.com/and1truong/orchad/pull/77) | Keep pagination tied to the submitted filters | Human preview outcomes, normalized metadata, submitted-query pagination. |
| [#78](https://github.com/and1truong/orchad/pull/78) | Strip caption IDs from every bridge draft response | Bridge draft caption ID redaction. |
| [#79](https://github.com/and1truong/orchad/pull/79) | Preserve source values for localized topic options | Canonical topic/group enum values. |
| [#79](https://github.com/and1truong/orchad/pull/79) | Keep canonical values for localized group modes | Canonical topic/group enum values. |
| [#80](https://github.com/and1truong/orchad/pull/80) | Reject unlinks that do not remove a mapping | Affected-row unlink check and authorized same-key reconciliation. |
| [#80](https://github.com/and1truong/orchad/pull/80) | Reconcile idempotent retries before revalidating the target | Affected-row unlink check and authorized same-key reconciliation. |
| [#81](https://github.com/and1truong/orchad/pull/81) | Remove tombstoned users from retained group definitions | Remove tombstoned managed users from retained static groups. |
| [#82](https://github.com/and1truong/orchad/pull/82) | Decouple event credential issuance from SCIM enablement | Event-only credential controls; durable config revoke and round-robin claim cursor. |
| [#82](https://github.com/and1truong/orchad/pull/82) | Persist invalidation after endpoint configuration removal | Event-only credential controls; durable config revoke and round-robin claim cursor. |
| [#82](https://github.com/and1truong/orchad/pull/82) | Rotate outbox claims across subscriptions | Event-only credential controls; durable config revoke and round-robin claim cursor. |
| [#83](https://github.com/and1truong/orchad/pull/83) | Preserve the selected derivative when its original is unavailable | Retired original does not hide a lawful selected derivative. |
| [#84](https://github.com/and1truong/orchad/pull/84) | Bind xAPI scopes to a usable managed client | Usable managed xAPI scope set and explicit key type. |
| [#84](https://github.com/and1truong/orchad/pull/84) | Restore string validation for idempotency keys | Usable managed xAPI scope set and explicit key type. |
| [#85](https://github.com/and1truong/orchad/pull/85) | Reject external references in inline SCO HTML | Reject declared external SCO resources; dynamic egress remains an explicit CODE gap. |
| [#86](https://github.com/and1truong/orchad/pull/86) | Wait for route data before measuring reflow | Wait for populated routes before reflow checks; no conformance claim. |
| [#87](https://github.com/and1truong/orchad/pull/87) | Clear the transcript when switching learning workflows | Clear visible transcript when workflow changes. |
| [#88](https://github.com/and1truong/orchad/pull/88) | Reset standalone pagination when changing language | Reset standalone offset on language change. |
| [#89](https://github.com/and1truong/orchad/pull/89) | Emit assignment-state events when obligations are created | Add assigned-insertion lifecycle triggers in migration 042. |
| [#90](https://github.com/and1truong/orchad/pull/90) | Block enrollment through courses containing the withdrawn item | Reject new course learning through withdrawn referenced items; existing pins retained. |
| [#91](https://github.com/and1truong/orchad/pull/91) | Use each award enrollment's persisted deadline | Persisted award deadline, omitted-candidate flag and Vietnamese result text. |
| [#91](https://github.com/and1truong/orchad/pull/91) | Report recommendation candidates omitted by the limit | Persisted award deadline, omitted-candidate flag and Vietnamese result text. |
| [#91](https://github.com/and1truong/orchad/pull/91) | Localize the digest result text for Vietnamese users | Persisted award deadline, omitted-candidate flag and Vietnamese result text. |
| [#93](https://github.com/and1truong/orchad/pull/93) | Configure OIDC for the identity mutation check | Configured real loopback OIDC negative test; historical CI separate from current. |
| [#93](https://github.com/and1truong/orchad/pull/93) | Record the successful exact-head run | Configured real loopback OIDC negative test; historical CI separate from current. |
| [#94](https://github.com/and1truong/orchad/pull/94) | Honor the requested ratings version's audience | Feedback uses its requested immutable version authorization. |
| [#95](https://github.com/and1truong/orchad/pull/95) | Backfill legacy cancelled booking metadata | Suppress unverifiable legacy cancelled-calendar downloads; preserve original rows. |
| [#96](https://github.com/and1truong/orchad/pull/96) | Aggregate timer milliseconds before rounding | Sum milliseconds before flooring aggregate. |
| [#97](https://github.com/and1truong/orchad/pull/97) | Hide retirement controls from non-owners | Retire bank button follows owner/admin authority. |
| [#99](https://github.com/and1truong/orchad/pull/99) | Exclude retakes from award-course enrollment lookup | Legacy root excludes retakes; explicit binding replaces unordered opening. |
| [#113](https://github.com/and1truong/orchad/pull/113) | Handle overlapping delimiters when nesting bold and italic | Bounded combined bold/italic nodes. |
| [#123](https://github.com/and1truong/orchad/pull/123) | Recheck the session after reading the error body | Session freshness rechecked after awaiting error body. |
| [#125](https://github.com/and1truong/orchad/pull/125) | Build the bridge contract before running the evaluator | Clean quality evaluation builds the contract first. |
| [#127](https://github.com/and1truong/orchad/pull/127) | Preserve the stored mode when auditing cancellation | Cancellation audit retains stored fresh-course mode. |
| [#129](https://github.com/and1truong/orchad/pull/129) | Recheck the award audience before issuing item credit | Live root gate before credit; immutable issued snapshots. |
| [#129](https://github.com/and1truong/orchad/pull/129) | Preserve issued item-backed certificate quantities | Live root gate before credit; immutable issued snapshots. |

Remaining executable-media egress isolation is a visible delivery limitation, not a fixture PASS. Bounded original inline media/SCO profiles are unsuitable as proof of production all-egress isolation. Accessibility, linguistic, standards and actual-model evidence remain milestone gates.
