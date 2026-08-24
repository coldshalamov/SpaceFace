<!-- LIFETIME: HISTORICAL -->
# PQ-135.00 — Draw-to-fly speed governor receipt

- **packetId:** PQ-135
- **leafId:** PQ-135.00
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## Premise correction (measured, supersedes the admission diagnosis)

The admission said gentle strokes pin to the 14 WU/s floor. Measured with the governor restored to
its pre-fix state: a SMOOTH gentle-S flew at 82.4 WU/s — never pinned. Only a HAND-TREMOR stroke
crawled, at 35.5 WU/s (not 14). The crawl was real but narrower than diagnosed, and no fixture in
the old test could see it. PQ-135.01 should weigh this when reading its own premise.

## What changed

`src/combat/autoTargetMode.js` (+36/−8): curvature is now SIGNED (the `Math.abs` that rectified
zero-mean tremor into a fake hairpin is gone), measured on a 24 WU chord (`PATH_CURVE_STENCIL`
2→8), boxcar-averaged over 15 WU before `abs`. Tremor cancels; a persistent turn survives.
`PATH_CORNER_FLOOR_SPEED = 14` untouched — a filter fix, not a re-tune. One behavior addition
beyond the ask, kept deliberately: `returnK = 2·|cross|/lookahead²` also governs speed by
cross-track error (~0 on-line, ~33 WU/s at 55 WU off) — physically sensible (come home before
sprinting) and load-bearing for the displaced-hull tests holding at their existing bounds.

## The numbers

Hand-drawn gentle S (the defect): **35.5 → 77.9 WU/s**. Straight 102.5 unchanged; gentle S
82.4→84.9; loop 59.5→66.3; hairpin on-track p10 36.5→39.3 (a real corner still slows — asserted).
Tight switchback 47.8→42.8, a small regression noted for PQ-135.01's nimbleness tuning.

## What passed

`test/draw-to-fly-path-tracking.test.mjs` 21/21 (baseline 20; +1 speed gate), verified by the lane
orchestrator AND the controller independently. Assertion-relaxation audit CLEAN — every existing
bound untouched; the test diff is pure addition; the new jittered fixture is held to the same
tracking bounds as gentle-S. Two-sided mutation: re-breaking the filter goes red on the crawl bar;
zeroing curvature goes red on the hairpin bar (the fix cannot be "ignore curvature"). No direct
position/velocity writes — still `applyWorldFlightCommand` on a velocity error. Seeded LCG fixture;
LF endings.

## Honest residuals

Only the hand-drawn fixture's bar actually catches the crawl (the smooth-stroke bar passes even
unfixed). The switchback nick and per-hull nimbleness belong to PQ-135.01, which now has the Motion
Lab (PQ-135.02) as its instrument.
