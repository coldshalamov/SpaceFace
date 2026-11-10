# DONE — sync-entity-views-middle-policy-cadence

## Summary

Middle-band (runway) roots already cadence presentation closures + micro-motion via
`shouldRunEntityClosures`. Projected LOD resolve, local shadow-caster policy / pose
notes, and `classifyRenderEntity` still ran every frame. Gate those on the same
`runClosures` seam; cache last `projectedPx` off-cadence. Poses + submit stay every
frame (Massline UVP / glass correctness).

## Before / after

### Offline microbench (primary — portable CPU)

400 entities × 240 frames, 72% middle-band:

| | Before (policy every frame) | After (`runClosures` cadence) |
|---|---|---|
| policy calls | **96000** | **44376 (~54% fewer)** |
| stand-in work time | **141.6 ms** | **67.5 ms (~2.10×)** |

Phase A cite: cpu-profile-flight `syncEntityViews` ~45 ms self post-#15/closure-gate.

### Focused tests

`entity-view-sync-band` + `entity-mesh-visibility` + `advanced-micro-motion` +
`shadow-present-cadence` → **pass**.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-middle-band-policy-cadence.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/sync-entity-views-middle-policy-cadence-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Complements `sync-entity-views-closure-gate` + `prepare-pitch-settle`.

## Risks

- Middle-band LOD / shadow policy / render-entity classify update at
  `MIDDLE_SYNC_PERIOD_TICKS` (4) instead of every frame; on-glass unchanged.
