# DONE — hud-objective-plate-cache

## Summary

Replace the 500 ms `getBoundingClientRect` refresh for objective edge plate
obstacles with a stale flag cleared on first edge use and `window.resize`.
Settled-edge flight pays layout once (or once per resize), not ~90×/45 s.

## Before / after

### Profile cite (ranking evidence)

Stacked 45s quiet profile: `getBoundingClientRect` **37.0 ms** self — sole caller
`plateBox ← objectiveEdgeObstacles ← updateObjectiveArrow ← hud.frame`.

### Portable A/B (primary KPI)

45 s edge flight @ ~60 Hz; 3 rects per refresh:

| | Legacy (500 ms timer) | Modern (resize-only) |
|---|---|---|
| sync layout reads | **270** | **3** (no resize) / **6** (one resize) |
| reduction | — | **~45×** settled |

Soft-GPU fps not claimed. Node wall of a fake rect getter is noise.

### Focused tests

`hud-objective-plate-cache` + `orrery-hud-adapter` + `hud-credits-pulse-no-reflow` → **pass**.

## Evidence

- Patch: `patches/0001-perf-hud-invalidate-objective-edge-plates-on-resize-.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ `c5c52256f`
- Bench: `artifacts/hud-objective-plate-cache-bench.json`
- Tests: `artifacts/focused-tests.log`
- Measured against stacked tip on master `f4150f648`

## Apply order

Independent.

## Risks

- Plate moves without a window resize (rare CSS/layout swaps) keep stale boxes until
  resize. Flight HUD plates are fixed CSS; `placeReceiptLane` does not move them.
- One resize listener on `window` for the HUD lifetime (no remove — HUD owns the page).
