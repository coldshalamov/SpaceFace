# DONE — classify-closed-form-scan

## Summary

Incremental `classifyWorld` catch-up walk now only visits entities stamped
`physicsBody: false` (travel-lane closed-form movers). Physics-backed rows are
already in `seen` from the spatial-hash query; distance-testing the whole live
list every tick was portable CPU waste.

## Before / after

### Offline microbench (primary — portable CPU)

| | Full-list catch-up | `physicsBody === false` only |
|---|---|---|
| 8k entities × 3k iters | **187.2 ms** | **144.3 ms (~1.3×)** |

Phase A cite: cpu-profile-flight `classifyWorld` ~60–104 ms self settled.

### Focused tests

`test/activity-runtime.test.mjs` → **20/20** (includes “incremental classify
revisits fast non-physics movers the hash cannot see”).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-limit-classify-catch-up-walk-to-physic.patch`
- Scratch: `vm-work/classify-world-cpu` @ `3e798170f2337a44244b761c476f96b740cc8ffe`
- Microbench: `artifacts/classify-closed-form-microbench.json`
- Tests: `artifacts/classify-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`

## Apply order

Independent of opening-* packages. Safe alone on master `0612d2b9f`.

## Risks

- Only the explicit `physicsBody: false` stamp is visited. New closed-form movers
  must use that stamp (travel-lanes already does) or they stay hash-invisible.
