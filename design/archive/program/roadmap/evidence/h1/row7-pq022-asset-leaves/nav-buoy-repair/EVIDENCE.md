<!-- LIFETIME: ROUTE_EVIDENCE -->
# nav-buoy repair route evidence — 2026-09-10

Reopened `PQ-022.billboard-buoy-reauthor` (buoy only): ordinary + diagnostic-close stills of the
repaired `place_nav_buoy` (Customs Log Relay, Tethys) in both runtimes, broker-authorized
acceptance cells, fixed seed 47, viewport 1440×900.

- `browser/` — Chromium headed cell (`pq022-nav-buoy-repair-browser`), report.json carries the
  consumed broker claim, admission facts, manifest identity (live source `edcfd277…`, release
  `e7d41985…`), and per-still authored/admission records.
- `electron/` — paired Electron cell (`pq022-nav-buoy-repair-electron`), browser↔electron parity
  asserted in-report.

Serving-chain verification (reviewer-independent): the page-fetchable release bytes hash to
`e7d41985b76e…c226f2`, and `render-packages/nav-buoy/render-package.json` was recompiled from that
release before these captures (see the leaf receipt for the render-package freshness finding).

Independent causal re-review: PASS — all three recorded defects (head silhouette, beacon carry at
ordinary framing, panel/palette camouflage) closed at ordinary framing in both runtimes. Full
lineage: `assets/ships/m5_navigation_infrastructure/reports/material_truth_v2/VISUAL_REVIEW.md`.
