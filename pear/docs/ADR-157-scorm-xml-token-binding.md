# ADR-157: IMS sequencing enumeration token import binding

Status: implementation/acceptance in progress; no full conformance claim.

IMS Simple Sequencing XML Binding1.0 table4.2 binds rule conditionCombination,
condition/operator/action, rollup childActivitySet/conditionCombination/condition/
operator/action and selection/randomization timings to token enumerations.
W3C XML Schema Part2§3.3.2/4.3.6 collapses XML whitespace only. These enumerated
values contain no internal spaces, so reuse xmlAtomicToken at each recognized
read and then apply the existing exact vocabulary. Preserve author XML/ZIP/hash,
IDs/string fields, edition restrictions and semantic defaults. Sources:
- https://www.imsglobal.org/node/52631
- https://www.w3.org/TR/xmlschema-2/#token
- https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace

Original scorm-xml-token-before.log retains0PASS/9FAIL (three editions × rule,
rollup, selection) for legal XML outer whitespace refused on parent229v40.
Original scorm-xml-empty-operator-before.log retains0PASS/3FAIL on v41:
explicit empty rule operator was silently treated like omission. Refuse present
empty/whitespace-only values; omitted operator/defaults retain existing semantics.
No default-all→any change based on the contradictory prose/schema examples.
Do not guess ADL hideLMSUI/rollup token/string bindings or ID/IDRef grammar.
Full condition vocabulary including timeLimitExceeded/outsideAvailableTimeRange
and all independent sequencing/reference traces remain OPEN.

Original domain tests cover currently supported rule/rollup/selection vocabulary,
canonical semantic equivalence, immutable XML/ZIP/hash, omission defaults, used/
unused definition refusal for blank/internal/non-XML spaces/case/unknown values,
exact checkpoint receipts, SQLite reopen, suspend/resume, and exactly-one proof
with no quiz certificate. Expanded existing choice/weighted/selected-pool/retry
built journeys and actual native fixture exercise token-authored controls while
retaining every ACK/history/navigation/proof/isolation/shutdown assertion.
Engine adaptation/source stays v41; no quota/deadline/retry/policy relaxation.
Exact complete validation counts and current-head CI are required below.

Epic133 remains OPEN, production DISABLED. Full API/DM/response/URI/history/
sequencing/operations matrices remain OPEN. License/authorized exports/Rustici
account/actual Safari and Android/production inputs remain BLOCKED. Owner222e2b
CI remains absent; owner229 original Windows shutdown failure is retained and
unproved, with descendant evidence kept separate.

Focused token12/boolean26/numeric17 completes55PASS, zero fail/skip/cancel,
plan/footer/exit0 inspected (7.9s). Typecheck/build exit0; v41 source checksum
remains6d9a5a3b33f911fcc447c8edf475022e22b07bb34166122e376d1b1ff32df086.
Actual native fixture imports spaced pre-condition always/not/disabled (false
condition preserves availability) and never selection/randomization timings,
retaining23 controller checks and all absence/history/recovery/proof assertions.
Full931/131files domain, expanded13 built, supplemental native4 and full172
fixed-source/build browser results follow; no pending-result PASS claim.

Fresh full domain931/131files completes all per-file plans/footers/five counts/
exit0 and aggregate exit0. Native4 completes PASS exit0 (27.3s), build/typecheck
exit0. Expanded built13 initial run completes10PASS/3FAIL exit1 (1.0m): third-/
fourth-edition retryAll and fourth-edition weighted navigation. All three traces
show DOM.describeNode/internal server error/session closed; cause unproved.
No generic driver claim or assertion/timeout weakening. Preserve initial logs/
traces and run the required full172 suite on one fixed source/build. The full
run will independently exercise every changed journey; pending results are not
PASS. Current-head all10 CI/log/review/native23 gates remain required.

Next internal XML dateTime/duration whitespace probe retains0PASS/6FAIL on this
tree (scorm-xml-time-whitespace-before.log); standards XSD collapse binding is
confirmed but not changed in this token slice. Full standard/calendar duration
profile remains OPEN; no external-blocker attribution for this internal bug.

Parent229c3b8592d/run37899289895 is now READY: all10 latest completed SUCCESS
jobs/full logs inspected, fresh owner head/reviews clear. Pear910/237dev/237built/
SidePanel4/host lanes; each Linux/macOS/Windows runtime16/Pear13/1.2=13/three
2004=22, five clean native/fixture exits and quitAcknowledged perOS. One
unchanged Windows-only retry passed; original forced shutdown after app-close/
no database-close remains retained/unattributed. This does not establish a cause
or fix or replace owner222e2b's absent CI. Successor2306ec owner CI still running.

Fixed-source/build full172 SCORM browser completes170PASS/2FAIL exit1 (7.7m):
managed ServiceWorker permission denial and fourth-edition weighted navigation
DOM.describeNode/internal server error/session closed. Both traces inspected;
DOM root cause unproved. Twelve of thirteen changed sequencing journeys and
all four native fixture journeys pass in full. The two retryAll journeys that
failed in the initial focused13 pass unchanged in full; all original10/3 logs/
traces remain. Weighted-only recheck follows; no clean full local/browser/native
conformance claim, and no policy/assertion/deadline/retry relaxation.

Unchanged-tree weighted-only recheck completes1PASS exit0 (5.5s), retaining
every viewport/ACK/retry/rollup/proof assertion. This plus twelve affected
sequencing journeys passing in full covers all thirteen changed journeys across
separate runs; it does not make the original10/3 or full170/2 runs PASS or prove
DOM cause. Supplemental native4 remains PASS. Parent2306ec completed Windows/
macOS logs each16/13/13/23/23/23, five clean exit0/quitAcknowledged records and
no forced shutdown; Pear/Linux owner jobs still pending. Current successor
requires its own all10 exact-head CI/full logs/native23/fresh review gates.
