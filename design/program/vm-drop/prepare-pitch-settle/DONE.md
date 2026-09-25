# DONE — prepare-pitch-settle

## Summary

1. **Settled idle skip:** parked craft with level pitch (no tumble/trail/lean target) skip the
   thrust-lean integrator each `prepareFrame`. Near-zero residual still snaps to exact 0.
2. **Middle-band cadence:** when `prepareFrame` supplies the same view extents as
   `syncEntityViews`, runway craft share entity-view closure cadence for thrust lean.
   Player + tumble/drift/recover always run (Massline UVP).

Also verified (no code change):
- `serviceRenderMeshResidency` already poll-cadenced (0.25 s) + hold-exempt 0.1 s.
- `shouldRefreshRealtimeShadowMap` still late-present gated (`test/shadow-present-cadence` 4/4).

## Before / after

### Offline microbench (primary — portable CPU)

400 craft × 240 frames, 55% settled idle, 72% middle-band:

| | Before | Settle-only | Settle + band |
|---|---|---|---|
| integrator calls | **96000** | **43440 (~55% fewer)** | **31200 (~68% fewer)** |
| stand-in work time | **129.6 ms** | **70.0 ms (~1.85×)** | **57.0 ms (~2.27×)** |

Phase A cite: cpu-profile-flight `prepareFrame` 50.6 ms self.

### Focused tests

`ship-pitch-presentation` + `massline-presentation-uvp` + `shadow-present-cadence` +
`thrown-body-trail-vfx` + `entity-view-sync-band` → **pass** (19 + thrown/band suites).

### Quiet soft-GPU crucible seed 4242 (secondary, `SPACEFACE_SMOOTH_MS=20000`)

| Metric | Before (master `a57d7036d`) | After (scratch) | Notes |
|---|---|---|---|
| worst frame | 983 ms | **200 ms** | **win** |
| p99 | 233 ms | **150 ms** | win |
| hitch callbacks | 50 / 210 | 26 / 256 | win |
| game speed | 48.0 % | **64.9 %** | win (soft-GPU noise still) |
| typical sim | 10.5 ms | 9.4 ms | mild |

Primary signal remains the offline microbench. GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-settle-idle-pitch-skip-middle-band-caden.patch`
- Scratch: `vm-work/prepare-pitch-settle` @ see `scratch-sha.txt`
- Microbench: `artifacts/prepare-pitch-settle-microbench.json`
- Tests: `artifacts/prepare-pitch-settle-focused-tests.log`
- Crucible after: `artifacts/prepare-pitch-settle-after-crucible.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `a57d7036d`

## Apply order

Independent. Complements `sync-entity-views-closure-gate` (same middle-band period).

## Risks

- Middle-band thrust lean updates at `MIDDLE_SYNC_PERIOD_TICKS` (4) instead of every frame;
  on-glass (inner) + player unchanged. Tumble/drift/recover never gated.
