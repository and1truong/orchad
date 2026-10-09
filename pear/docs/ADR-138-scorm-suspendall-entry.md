# ADR-138: Trusted SuspendAll entry binding

Three original edition vectors fail: SuspendAll with normal or empty cmi.exit
retains content data and the suspended SCO, but the next launch reports entry
empty. ADL RTE4.2.7/4.2.8 makes SuspendAll override the SCO's non-suspend exit.

The shared launch initializer now derives resume from the already loaded,
identity-bound engine's suspendedActivity as well as the stored suspend exit.
The current delivered SCO must match that trusted suspended activity. Revision0
still initializes ab-initio; no authored snapshot may set LMS-owned entry. Existing
server replay, exact receipts, identity/revocation checks and non-sequenced fresh
attempt behavior remain. No engine adaptation, schema or history rewrite.

Original domain3/3 failed. Final focused70/70, build and three built browser
SuspendAll/normal-exit close/resume journeys completed exit0. Domain vectors also
cover empty exit, engine snapshot identity, exact accepted retry, closed token,
same ordinal/revision/time/data/receipt count and no proof. Fresh full domain776/776 across113 files completed exit0; new-head full CI/native/actual Side Panel and reviews remain required.

ponytail: this closes only entry binding for trusted normal/empty-exit SuspendAll;
logout/time-out precedence and full lifecycle/reference matrices stay OPEN.
Original time-out+continue probes still deliver the next SCO in all three
editions and require a separate root fix. Parent #208 Windows consent-response
failure is retained; its unchanged isolated retry is running. Epic open;
production disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.

## Lost launch response review correction

PR #210's P1 review exposes a second launch boundary: ResumeAll consumes the
suspended snapshot before its launch response reaches the browser. Repeating
the registration can then replace that unacknowledged launch with empty entry.
The initializer also preserves resume from the latest sequence-zero launch's
trusted initial state, scoped to tenant, attempt, SCO and technical ordinal.
An acknowledged content checkpoint ends this fallback; revision-zero fresh
attempts still initialize ab-initio. No extra receipt, schema or token reuse.

Original three regressions fail. Exact owner v32 full domain779/779 across114
files, build and three built lost-response/replacement journeys complete exit0.
Focused56 also passed diagnostically against descendant v34 before restoring
owner v32; it is not owner acceptance evidence. Browser first3FAIL used the
wrong alert scope; the corrected check asserts the actual main alert's exact
Failed to fetch text and retains lost-response, row, revision, time, history,
receipt and no-proof assertions. New-head CI and review gates remain required.
