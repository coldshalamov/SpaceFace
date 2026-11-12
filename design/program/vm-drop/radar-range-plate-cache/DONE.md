# DONE — radar-range-plate-cache

## Summary

Cache `drawRangePlate` layout by `(range, expanded, metrics.size)`. Settled flight
no longer re-`measureText`s or lift-searches every HUD frame.

## Before / after

### Offline microbench (primary — portable CPU)

| | Uncached layout | Cached layout |
|---|---|---|
| 500k settled iterations | **110.7 ms** | **6.19 ms (~17.9×)** |

Phase A cite: cpu-profile-flight `drawRangePlate` ~102 ms self / 60 s settled.

### Soft-GPU crucible

Not required for this portable CPU cut. `scripts/check-radar-perf.mjs` is red on
untouched master (`asteroid blips` string drift) — pre-existing, not caused here.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-radar-cache-range-plate-layout-across-settled-f.patch`
- Scratch: `vm-work/radar-draw-cpu` @ `81f70888d2f8aba527004e57ae5736352ab271e5`
- Microbench: `artifacts/radar-range-plate-microbench.json`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`

## Apply order

Independent of opening-* packages. Safe alone on master `0612d2b9fc994557dd35cb00d0df21b791722c23`.

## Risks

- Cache key ignores DPR; size change still busts via `metrics.size`.
- Headless (no `document`) falls back to `text.length * 7` width estimate for the
  cache fill only; live HUD always has a canvas probe.
