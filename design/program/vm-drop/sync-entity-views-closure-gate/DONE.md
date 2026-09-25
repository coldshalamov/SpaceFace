# DONE — sync-entity-views-closure-gate

## Summary

Middle-band (runway) roots already cadence presentation closures via
`shouldRunEntityClosures`. Cosmetic craft/asteroid/ordnance micro-motion still
ran every frame. Gate micro-motion on the same `runClosures` seam, and fill
`_craftMicroMotionOptions` once per `syncEntityViews` pass instead of per ship.

## Before / after

### Offline microbench (primary — portable CPU)

400 entities × 240 frames, 72% middle-band, 15% lod2 speck stand-in:

| | Before (`!farSpeck` every frame) | After (`runClosures && !farSpeck`) |
|---|---|---|
| micro-motion calls | **81600** | **29940 (~63% fewer)** |
| stand-in work time | **55.7 ms** | **21.7 ms (~2.56×)** |

Phase A cite: cpu-profile-flight `syncEntityViews` 53.2 ms self.

### Focused tests

`entity-view-sync-band` + `entity-mesh-visibility` + `advanced-micro-motion` +
`ship-locomotion-presentation` → **31/31** pass.

### Quiet soft-GPU crucible seed 4242 (secondary, `SPACEFACE_SMOOTH_MS=20000`)

| Metric | Before (master `a57d7036d`) | After (scratch) | Notes |
|---|---|---|---|
| worst frame | 983 ms | **233 ms** | **win** |
| p99 | 233 ms | **217 ms** | mild |
| hitch callbacks | 50 / 210 | 66 / 210 | flat/noise — not the hitch classifier |
| game speed | 48.0 % | 45.9 % | flat/noise on soft-GPU |
| p50 / p95 | 83 / 150 ms | 100 / 133 ms | soft-GPU — ignore fps |

Primary signal remains the offline microbench. GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-cadence-middle-band-micro-motion-with-en.patch`
- Scratch: `vm-work/sync-entity-views-closure-gate` @ see `scratch-sha.txt`
- Microbench: `artifacts/sync-entity-views-closure-gate-microbench.json`
- Tests: `artifacts/sync-entity-views-closure-gate-focused-tests.log`
- Crucible after: `artifacts/sync-entity-views-closure-gate-after-crucible.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `a57d7036d`

## Apply order

Independent. Complements `sync-entity-views-submit-scratch`.

## Risks

- Middle-band micro-motion updates at `MIDDLE_SYNC_PERIOD_TICKS` (4) instead of
  every frame; on-glass (inner) roots unchanged. Matches the documented closure
  cadence for off-glass runway traffic.
