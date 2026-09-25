# DONE — projectile-surface-distance-first

## Summary

`sampleProjectileEvidence` surfaceHistory walk range-gates (600²) before
`materialSurface`. Prior materialSurface-only cache was a miss (~0.95×);
reorder is the portable win. Spatial hash at this radius regresses.

## Before / after

### Portable microbench (primary KPI)

2500 entities (8 near plates + far mirrors + crowd) × 4000 iterations:

| | materialSurface then distance | distance² then materialSurface |
|---|---|---|
| wall ms | 10.77 | 5.76 |
| speedup | — | **~1.87×** |
| hit parity | — | identical sink |

Soft-GPU fps not claimed.

### Focused tests

`projectile-surface-distance-first` + `stunt-combo` + `stunt-taxonomy` + `pq-155-03-stunts-pay` → **22/22**.

## Evidence

- Patch: `patches/0001-perf-combat-distance-first-projectile-surfaceHistory.patch`
- Scratch: `vm-work/hillclimb-20260924c` @ `08d92020e`
- Microbench: `artifacts/projectile-surface-distance-first-microbench.json`
- Tests: `artifacts/focused-tests.log`
- Measured against master `568d1358e`

## Apply order

Independent. Stacks with prune-evidence-cadence.

## Risks

- Iteration order among >8 near reflective surfaces unchanged in spirit (still first 8 that pass filters)
- Far reflective plates still ignored (same 600 WU contract as before)
