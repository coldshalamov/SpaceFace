# DONE — flight-dormant-skip

## Summary

Add `entityNeedsFlightStep` beside `entityNeedsPhysics`: S0/S1 (and unclassified /
pinnedExact) keep the 60 Hz flight integrator; S2/S3/S4 only step when a wake carries
intent. Wired into legacy `flight` and production `flightV3` (V3 already had
`npcFlightNeedsCommand` for sleeping islands — dormant residual velocity still stepped
without this gate).

Determinism: shelved actors are catch-up owned; continuous drag fought that authority.
Wake-edge intent still consumes one step.

## Before / after

### Offline microbench (primary — portable CPU)

500 craft × 600 ticks, 62% dormant, 18% near:

| | Before (step all) | After (`entityNeedsFlightStep`) |
|---|---|---|
| flight steps | **300000** | **114600 (~62% fewer)** |
| stand-in work time | **264.7 ms** | **104.5 ms (~2.53×)** |

Phase A cite: cpu-profile-flight `registry.step` 117.5 ms self / ~2996 ms inclusive.

### Focused tests

`flight-dormant-skip` + `activity-classification` → **15/15** pass.

### Quiet soft-GPU crucible seed 4242 (secondary, `SPACEFACE_SMOOTH_MS=20000`)

| Metric | Before (master `a57d7036d`) | After (scratch) | Notes |
|---|---|---|---|
| worst frame | 983 ms | **733 ms** | mild |
| p99 | 233 ms | 267 ms | flat/noise |
| hitch callbacks | 50 / 210 | 49 / 200 | flat |
| game speed | 48.0 % | 46.0 % | flat/noise |
| typical sim | 10.5 ms | 9.9 ms | mild |

Primary signal remains the offline microbench. GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-sim-skip-flight-step-for-dormant-abstract-craft.patch`
- Scratch: `vm-work/flight-dormant-skip` @ see `scratch-sha.txt`
- Microbench: `artifacts/flight-dormant-skip-microbench.json`
- Tests: `artifacts/flight-dormant-skip-focused-tests.log`
- Crucible after: `artifacts/flight-dormant-skip-after-crucible.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `a57d7036d`

## Apply order

Independent of prepare-pitch-settle.

## Risks

- Unclassified fixtures (no `activity.simTier`) keep prior every-tick behavior.
- A shelved craft with residual velocity and no intent no longer decays on the 60 Hz
  path — catch-up / promote owns that sample (matches physics shelving).
