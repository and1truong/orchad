# orchad

Collection of Agent App Bridge 0.1 POCs: `lime/` (Chrome MV3 host), `coconut/`
(Tauri 2 host), `guava/` (web app + backend), `mango/` (model gateway +
portable agent client). `acceptance/` holds the canonical interop scenario
every POC executes — see `acceptance/README.md`.

## Shared contract

The root `contract` file is the only hand-edited copy of the binding spec.
Each POC's `<poc>/CONTRACT.md` is a byte-identical copy — never edit it
directly; after changing `contract`, copy it over every `CONTRACT.md` and
keep `cmp contract <poc>/CONTRACT.md` clean (CI checks this). Proposed or
adopted changes are recorded per-POC in `<poc>/CONTRACT-CHANGES.md`.
