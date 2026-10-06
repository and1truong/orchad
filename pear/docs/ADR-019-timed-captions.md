# ADR-019: Pinned original captions and browser text tracks

Pear accepts an explicit plain-text subset of WebVTT based on [W3C CRD 2026-05-20 section 4](https://www.w3.org/TR/2026/CRD-webvtt1-20260520/#syntax). Files use text/vtt and valid UTF-8, optional BOM/CRLF, WEBVTT followed by a blank line, optional distinct cue IDs and ordered start offsets. End must follow start; overlapping cues are allowed. Limits: 64 KiB, 200 cues, 1000 characters per cue and 24 hours. STYLE/REGION/settings/markup/entities are outside this profile and rejected explicitly; this is not general WebVTT conformance.

Content authors upload through the existing authenticated human route, preserving CAS, exact retries, audit, quota and production scanning gate. A course lesson or reusable item may reference at most one English and one Vietnamese caption track, only for uploaded audio/video. Reuse snapshots source tracks into the immutable course version; caller fields cannot replace source authority.

Reads use the same live tenant and published-item/pinned-enrollment/prerequisite checks as media. Retired items remain readable through an own tracked version. Captions grant no completion/score or credits. Bridge results exclude uploaded caption identifiers; human-only outcomes remain withheld in tracked standalone metadata too.

Human readers fetch authorized bytes into revocable Blob URLs and render native captions tracks, with a keyboard-operable text transcript for audio/video. Session/content changes clear old tracks and revoke URLs; failures surface as alerts. Metadata declarations do not imply caption quality or audited WCAG compliance.

Six domain/HTTP tests cover profile syntax/bounds, upload authority/rollback, role/version/prerequisite reads, identifier egress and source pinning. A real browser journey loads native text-track cues and opens the original transcript with keyboard Enter. This is targeted accessibility evidence, not a screen-reader or full mobile/WCAG audit. Existing legacy transcript/media flows remain covered.
