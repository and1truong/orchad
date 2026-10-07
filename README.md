# orchad

Collection of Agent App Bridge 0.1 POCs: `lime/` (Chrome MV3 host), `coconut/`
(Tauri 2 host), `guava/` (web app + backend), `mango/` (model gateway +
portable agent client), `pear/` (independent learning app, issue #49). `acceptance/` holds the canonical interop scenario
every POC executes — see `acceptance/README.md`.

## Shared contract

The root `contract` file is the only hand-edited copy of the binding spec.
Each POC's `<poc>/CONTRACT.md` is a byte-identical copy — never edit it
directly; after changing `contract`, copy it over every `CONTRACT.md` and
keep `cmp contract <poc>/CONTRACT.md` clean (CI checks this). Proposed or
adopted changes are recorded per-POC in `<poc>/CONTRACT-CHANGES.md`.

## Pear

Pear implements deterministic versioned learning: authored/reusable media, courses, standalone reading, playlists/awards, typed human assessments, groups/scheduled assignments, scoped reports, reviewed language variants, identity/provisioning adapters and restricted SCORM/xAPI profiles. The stack adds explicit unpublish, an own on-demand digest and shared durable recovery evidence. It exposes the same Bridge 0.1 to Lime; it contains no embedded AI. See [Pear README](pear/README.md), [capability register](pear/docs/CAPABILITIES.md) and [evidence](pear/IMPLEMENTATION-REPORT.md). Full Go1 parity remains tracked in #49.
