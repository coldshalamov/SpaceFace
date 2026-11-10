# DONE — radar-project-scratch

## Summary

1. `projectRadarPoint(..., out)` writes into a retained scratch (radar.draw hot path).
2. Hostile/infrastructure marks are pooled rows with copied `x/y/angle/offRange`.
3. Unchanged `aria-label` skipped.

One-shot callers (tests / `planObjectiveCue`) still get a frozen object when `out` is omitted.

Focused tests: **9/9** pass (`tactical-map-second-generation` + `fix-f56-radar-range-ring`).
(`radar-range-module-runtime` overflow case fails on bare master too — pre-existing.)

## Before / after

### Offline microbench (primary — portable CPU)

64 contacts × 8000 draws (~35% hostile), allocate+freeze+literal marks vs scratch+pool:

| | Before | After |
|---|---|---|
| wall | **59.4 ms** | **44.7 ms (~1.33×)** |
| checksum | match | match |

Phase A cite: cpu-profile-flight `draw @ radar.js` ~385 ms self / `drawRangePlate` already addressed by contact-color-defer package.

### Quiet soft-GPU crucible

Secondary only; soft-GPU noise. Primary signal is the offline microbench.
GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-radar-project-into-scratch-pool-hostile-infrast.patch`
- Scratch: `vm-work/radar-project-scratch` @ `77064b0b55b570caf17783eb5f86493143731b6d`
- Microbench: `artifacts/radar-project-scratch-microbench.json`
- Tests: `artifacts/radar-project-scratch-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `35e519ebd`

## Apply order

Independent. Compatible with `radar-contact-color-defer`. `git am` clean.

## Risks

- Lead-line path uses two scratches so aim+target projections do not alias.
- Mark rows must keep copied scalars (never retain the scratch object reference).
