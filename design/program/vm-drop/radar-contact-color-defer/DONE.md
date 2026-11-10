# DONE — radar-contact-color-defer

## Summary

1. Cache `drawRangePlate` layout by `(range, expanded, metrics.size)`.
2. Defer `contactColor` for hostiles/stations that early-continue — hostiles still
   get trails (and colour) when a trail slot is spent; priority/glyph passes own paint.

## Before / after

### Offline microbench (primary — portable CPU)

| | Uncached range-plate layout | Cached |
|---|---|---|
| 500k settled iterations | **92.2 ms** | **3.7 ms (~25×)** |

| | contactColor every in-range contact | Defer past 24/40 hostiles |
|---|---|---|
| 100k passes × 40 contacts | **41.6 ms** | **22.8 ms (~1.83×)** |

Phase A cite: cpu-profile-flight `radar.draw` ~385 ms / `drawRangePlate` ~102 ms self.

### Focused tests

`test/tactical-map-second-generation.test.mjs` + `test/fix-f56-radar-range-ring.test.mjs` → **pass**.
(`radar-range-module-runtime` overflow case fails on bare master too — pre-existing.)

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-radar-cache-range-plate-layout-defer-contactCol.patch`
- Scratch: `vm-work/radar-contact-cuts` @ `2d7bc6c71`
- Microbench: `artifacts/radar-contact-microbench.json`
- Tests: `artifacts/radar-contact-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `a57d7036d`

## Apply order

Independent. Supersedes `radar-range-plate-cache`.

## Risks

- Cache key ignores DPR; size change still busts via `metrics.size`.
- Hostile insertion-sort was measured slower than `Array.sort` — not shipped.
