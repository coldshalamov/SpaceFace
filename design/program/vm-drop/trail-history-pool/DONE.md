# DONE — trail-history-pool

## Summary

`updateTrail` no longer allocates a fresh `{x,z}` (and GC's the shifted tip) every
time a contact moves ~20 wu. Recycle the dropped tip at `TRAIL_MAX`; grow from
`trailPointPool`; prune / sector / destroy return points to the pool.

Focused tests: **9/9** pass (`tactical-map-second-generation` + `fix-f56-radar-range-ring`).

## Before / after

### Offline microbench (primary — portable CPU)

64 contacts × 20 000 ticks, distance gate always trips:

| | Before (`push` + `shift` alloc) | After (recycle + pool) |
|---|---|---|
| wall | **100.1 ms** | **46.0 ms (~2.18×)** |
| checksum | match | match |

Phase A cite: hitch-hillclimb next pole after radar-project-scratch — trail leftover.

### Quiet soft-GPU crucible

Not required for this alloc cut; primary signal is the offline microbench.
GPU tier: **software**. Owner iGPU fps not claimed. Soft-GPU: ignore fps.

## Evidence

- Patch: `patches/0001-perf-radar-pool-trail-history-x-z-points.patch`
- Scratch: `vm-work/trail-history-pool` @ `d352c55af696f32f638c9dce78b81330ae554f39`
- Microbench: `artifacts/trail-history-pool-microbench.json`
- Tests: `artifacts/trail-history-pool-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `35e519ebd`
