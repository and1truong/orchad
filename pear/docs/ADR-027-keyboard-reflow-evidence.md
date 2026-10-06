# ADR 027: Keyboard and device evidence
Epic #49, G15. Target: WCAG 2.2 AA; this work does not claim conformance.

## Behavior
A first-entry skip link moves focus to the main landmark. The named learning navigation identifies the current page, and changing views focuses the main heading. Standard semantic buttons, radio inputs, forms and live status continue to own actions; no keyboard automation grants model authority. Checkboxes/radios keep native widths. Narrow panels, long IDs/text and small-screen filters reflow without hiding content; tables keep their own horizontal scroll where necessary.

## Acceptance
The browser test starts a separate actual Pear server and original SQLite fixtures. It records page scroll width at 320/390/768/1440 pixels across catalog, own learning, programs, imported packages, notifications, transcript and preferences, plus administration at 320/768/1440. It uses focused controls with Enter/Space to navigate, acknowledge an original lesson, choose a radio answer and submit human answers. It records landmarks/current navigation, skip-link/focus behavior, an ARIA snapshot, a mobile screenshot and JSON evidence. Existing timed caption tests use actual browser text tracks and keyboard transcript disclosure.

CI must pass against the published head before these automated checks are recorded PASS. Programmatic focus plus keyboard activation tests control behavior; it does not prove every possible sequential Tab order. Chromium only. Manual screen reader announcements/order, contrast, zoom/browser/device matrix, large dynamic tables and third-party package/media accessibility remain NOT RUN/NOT VERIFIED. Author-declared accessibility filters do not become audited compliance from these tests.
