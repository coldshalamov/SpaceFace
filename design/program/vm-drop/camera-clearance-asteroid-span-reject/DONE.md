# DONE — camera-clearance-asteroid-span-reject

## Summary

Quiet `camera.follow` clearance re-entered `setFromObject` →
`updateWorldMatrix` for every drifted field rock whose numeric cache missed
each WU — even when the rock could never clear the 120 WU span bar.
Production now rejects asteroids whose `asteroidBody.scale × 2.5` is under
the bar and caches a null box. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

60 field rocks (R≈8–12) + 3 stations + 1 capital rock (R=70) × 8k drifted
floor queries (1.05 WU/frame forces cache miss). Before = always
`setFromObject` on miss; after = asteroid span-hint reject. Isolated child
processes.

| | Before | After | |
|---|---:|---:|---|
| wall (median band) | ~156–172 ms | ~46–57 ms | **~2.98–3.58×** |

Primary claim band **~3.1×** (median of five isolated runs; floor minSpeedup
≥2.98×). Capital + station roof parity; small rocks stay non-roofs; sink
match. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924w`
(Picture ON): idle **62.4%**, long tasks **17**; `cameraClearanceBoxForMesh`
/ `updateWorldMatrix` under `camera.follow` / `prepareFrame`.

### Focused tests

pic-07-wreck-camera-clearance + camera-director-governor +
camera-focus-separation + dense-scene-camera-legibility +
camera-neutral-pair + camera-nimble-regime → **68/68** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-reject-undersized-asteroid-camera-cleara.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/camera-clearance-asteroid-span-reject-microbench.json`
- Tests: `artifacts/focused-tests-camera-clearance-asteroid-span-reject.log`

## Apply order

Independent. Prefer after prepareFrame pack/sync stack. Stacks under
prepareFrame / camera.follow.

## Risks

- Asteroids without `userData.asteroidBody` still take `setFromObject` (safe
  fallback).
- Hint uses `scale × 2.5` as an upper-bound diameter; a rock whose authored
  geo spans more than that relative to scale could be under-rejected (none
  in the common displaced/vein/gas paths). Capital rocks (hint ≥ 120) still
  measure.
