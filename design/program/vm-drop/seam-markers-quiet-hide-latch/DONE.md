# DONE — seam-markers-quiet-hide-latch

## Summary

Quiet seam-marker residual under prepareFrame after #104: when no seamed
asteroid was in draw range, every idle tick still ran full
`_seamMarkersRelevant` (indexed asteroid walk + range tests) and
`_sleepSeamMarkers` (dynamic-buffer zero-commit). Pure probe+commit CPU on
quiet settled flight with rocks pinned out of range.

Production latches `_seamMarkersQuietHidden` after the first quiet sleep
and skips relevant+sleep until a cheap dirty wake (player quantum /
`entityIndexVersion` / drawWu / mining pulse / 0.35s re-probe). False-wake
falls through to full relevant; latch re-arms if still irrelevant.
Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet-irrelevant seam path
× 200k × 11 isolated pairs (11 seamed rocks out of drawWu range).
Before = relevant walk + sleep commit every tick; after = latch skip
while fingerprints clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-seam-relevant-plus-sleep (primary, 11 isolated pairs) | **~3.6×** | **≥2.59×** |

Primary package run median **3.513×** (min 2.725, max 4.312). Rebenches
median 3.567 / 3.707 (mins 2.768 / 2.594). Floor across rebenches
**≥2.594×**. Soft-GPU fps not claimed.

Dirty-wake proof: after latch, player quantum move + in-range seamed rock
→ `woke: true`, quiet latch cleared.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
seam / prepareFrame residual on quiet settled flight.

### Focused tests

`node --test test/dynamic-buffer-ranges.test.mjs` → **24/24** pass
(includes nearby asteroid seam markers publish prefix).

`node --test test/trail-streak-instancing.test.mjs` → **pass**
(seam-marker precompile staging).

`node --test test/vfx-additive-single-pass.test.mjs` → **pass**.

`npm run check:thruster:propulsion-family` → **68/68** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-seam-markers-with-safe-dirty-wake-3.6x.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
- Microbench: `artifacts/seam-markers-quiet-hide-latch-microbench.json`
- Rebenches: `artifacts/seam-markers-quiet-hide-latch-rebench1.json.tmp`,
  `artifacts/seam-markers-quiet-hide-latch-rebench2.json.tmp`
- Tests: `artifacts/focused-tests-seam-markers-quiet-hide-latch-*.log`

## Apply order

Stacks under prepareFrame / vfx seam residual. Clean on stacked tip through #104.
Supersedes the prior seam-markers hold (relevant+sleep ~4.6× without wake).

## Risks

- Relies on dirty fingerprints covering approach / spawn / pulse / drawWu /
  slow rock drift (0.35s re-probe). False-wake is safe (full relevant +
  re-latch). Worst seam appearance delay on pure approach ≈ one quantum
  cell (`max(16, drawWu*0.1)` WU) or 0.35s.
