# ADR-015: Optional study timer, separate from official learning

Status: internal policy. This measures timer intervals, not attention.

Human readers may explicitly start/pause a timer for an own course or tracked standalone version. The server accepts no client duration. Connected pulses credit server-clock intervals up to 30 seconds; longer gaps and backward clock corrections credit zero. A browser sends pulses every 15 seconds only while visible and pauses on hiding or leaving the reader. It never auto-resumes after reload. A learner has one token/session-bound lease across all targets, preventing overlapping tab totals. Starting another lease replaces the previous one without crediting its trailing interval.

Cookie, epoch, same-origin, CSRF and live account/record scope protect routes. Timer writes are absent from all agent catalogs. Totals are persisted separately, under an immediate transaction; start/stop audit failure rolls back totals and lease changes. Pulses are atomic interval updates, with no user content in logs. An ambiguous pulse is not replayed; a retry observes the current server boundary and cannot duplicate an already observed interval. Timers never update enrollment progress, attempts, official scores, credits, certificates or learning aggregate revisions.

Reports expose intended course duration in minutes and observed timer seconds as separate optional columns, preserving live tenant/direct-report scope and snapshot continuity. Awards have null telemetry: child activity is not silently double-counted. Items have no inferred intended duration. Unmeasured own course/item records show zero observed seconds. Completed source versions remain pinned; retired tracked items remain readable. Cancellation/withdrawal or revoked identity stops further recording.

No webcam, keystroke or attention inference is performed. Browser visibility is advisory; a foreground timer cannot prove a person learned. Disconnection can undercount. Runtime clock changes and process restarts do not create missing activity. Provider runtime/SCORM telemetry is a separate interoperability profile.
