# ADR-174: Bounded interaction collection checkpoint allowance

Unchanged v49 accepts all synchronous writes for250 interactions with10 objective
IDs each, then server checkpoint rejects CMI field quota. Original independent
probe3tests0PASS/3FAIL exit1(3.5s), each snapshot141032bytes below unchanged2MiB.
This actual parser gap needs no commercial account/license.

ADL third RTE1.0 and fourth RTE1.1 sections4.1.1.4/4.2.9 require250 interaction
sets,10 associated objective IDs per interaction, and choice correct-response
collections of10 patterns; fourth4.2.18 requires100 objectives. Sources reviewed
at third3687–3691/4070–4089/4884–4887, fourth1926–1967/3731–3734/
4113–4132/4885–4910/6565–6569. Exact second original RTE/all errata unresolved;
second-edition tests prove the existing compatibility profile, not source
certification. No licensed suite copied.
https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf

Reuse the existing typed leaf walker. A single canonical-path predicate exempts
only first250 interaction records'8 scalars/first10 objective IDs/first10 correct
patterns from the ordinary2048-field counter: at most7000 unique additional
leaves, at most9048 unique total. Thread the ordinary counter through existing
recursion, removing repeated Object.keys enumeration. No added dependency,
config, permissive type/authority rule, byte-ceiling bump or history rewrite.
2MiB state/HTTP envelope, string bounds, supported containers, per-type pattern
rules/uniqueness/dependencies, principal/LMS authority, full engine typed replay,
response provenance and journal4096 remain unchanged. Unrecognized paths and
indices outside named allowance still consume ordinary budget or refuse.

This repairs one finite collection profile. Full simultaneous maximum strings/
collections and other SPM combinations remain OPEN under2MiB; no complete
standards conformance/Rustici parity or production approval claim. Server-only
change retains enginev49 SHA2565213c4f81ce9d1e252c140a004faba1c7f615910ba781cbfdd81814547815a5b
andSCORM1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642;
no artificial engine adaptation/version bump. Native predicate/counts unchanged
16/13/13/30/30/31; exact-head actual OS regression evidence still required. New
250-record SPM journeys are domain/Chromium evidence, not actual WebView proof.

Separate original/candidate artifacts outside accepted tree retained. Initial
.ts module-classification constructor error corrected in.mts; small2500-ID
candidate3profiles passed at141009bytes with15 authority/byte/ordinary-quota/
type/unknown refusals. Expanded7000-field candidate3profiles passed at262759bytes.
Homogeneous same-type probe did not emit a journal; logging undefined.length
failed (not a product regression). Correct mixed fill-in→choice provenance
probe requires3500 real entries; initial negative controls omitted journal and
hit type refusal before owner assertion, corrected input without weakening
assertions. Final expanded mixed candidate3profiles passed at266009bytes,
3500-entry journal and all15 negative controls. Candidate is separate evidence.

Accepted original shared SCO vector adds100 objectives/9 fields to250 interaction
sets/8 scalars/10 IDs/10 patterns, retaining fill-in learner responses under
current choice types. Six new domain cases completed6PASS exit0(11.9s):
local Commit391 refusal/retry retains exact3500-entry journal; no journal refuses
before first receipt; exact receipt replay/250 server-derived origins, unchanged
rows/history/audit on six malformed/owner/byte/ordinary-budget inputs; real HTTP
retry200; SQLite close/reopen/resume all original nested values/100 scores;
no official proof or certificate. Boundary cases retain ordinary budget beyond
interaction249/nested9 and retain positive named mandatory profile.

Accepted focused55PASS exit0(48.9s), typecheck/build exit0. New built3 completed
3PASS exit0(22.2s): shared original vector, genuine lost ACK/exact payload retry,
one accepted revision/receipt,250 response origins, human Close/resume/exact
values, no pre-Finish proof; genuine licensed-wrapper Finish yields exactly one
SCORM proof and no certificate (course quiz requirement retained). Full fresh
domain runner exited1 on inherited country registry file180s timeout; timeout
exception prevented partial stdout persistence/aggregate footer, so no clean
full-domain PASS claimed. Remaining135 files completed997PASS with per-file
exit0. Independent supplementary10 files completed92PASS exit0 at unchanged
180s limit/one worker. Exact145-file union/1089 tests, every TAP plan/five footer
counts and per-file exits checked; no assertion/deadline/product change or
original failure deletion. Fixed full175 browser completed171PASS/4FAIL exit1
(6.9m), changed3+native fixture4 PASS in that full run. All four complete
trace/network/context artifacts read with capability URLs redacted: single-SCO
ServiceWorker enumeration denied by managed environment; second/third retry and
unbound practice heading have DOM.describeNode/session closed, cause UNPROVED.
Both retry traces retain intermediate expected2/received1 events. No unrelated
rerun, weakened assertion/deadline or clean-full-browser PASS claim.

Parent248838ac099 READY after own37943182896 all10 completed SUCCESS/latest
complete logs inspected/fresh exact head/unmerged/reviews0 unresolved:
Pear1083/237dev(10.1m)/237built(9.1m)/actual SidePanel4(31.5s),host3/browserhost2/
realLime/SCORMhost1; actual native3OS16/13/13/30/30/31 all5 clean ACKtrue/both
exits0/unforced, fourSCORMsixphases/errorBytes0/directDBfinite. This successor
still needs its own exact-head CI/review gate; no inherited READY claim. Local1083/144/f110/build/typecheck/
built3/native4 PASS; full172170PASS/2FAIL exit1, both full traces/network/context
read, managed ServiceWorker denied and third-retry DOM.describeNode/session
closed cause unproved. Parent247019726 READY own37940391505/10/full latest logs/
fresh reviews0 unresolved; Pear1074/237dev/237built/4, native3OS29/29/30 clean5/
sixphases/directDBfinite. Parent246 READY after one unchanged Windows retry;
original fourth forced/null/noDBduration failure preserved/unproved. All older
PR/ADR history retained. License/authorized exports/Rustici account/actual Safari+
Android/reviewed production inputs BLOCKED; supported Chromium153CDN403/local151
supplemental. Epic133 OPEN; production DISABLED.
