# DONE — optic-field-resident

## Summary

Optic lattices are field-resident until approach. Quiet Ceres combat list drops
from **96→54** entities and **53→11** live asteroids; field rocks **279→321**.
Ceres table-authority census **passes**. Focused tests **51/51**.

## Before / after

### Quiet Ceres census (seed 14920, production, Rapier)

| | Before (bare master) | After |
|---|---|---|
| entityList | 96 | **54** |
| live asteroids | 53 | **11** |
| asteroidField rocks | 279 | **321** (+42 optic) |
| tick p50 | ~2.45 ms | ~2.52 ms (already under 5 ms) |

### Portable microbench (primary KPI)

40 systems × 800 iters walking a firstAlong-style ray over the quiet Ceres list:

| | Before (optic forced live) | After (field-resident) |
|---|---|---|
| entityList | 96 | 54 |
| walkMs | 8.960 | 5.481 |
| speedup | — | **~1.64×** |

Soft-GPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-world-keep-Ceres-optic-lattices-field-resident.patch`
- Scratch: `vm-work/hillclimb-20260923c` @ `61a53c656`
- Bench: `artifacts/optic-field-resident-bench.json` + `.mjs`
- Tests: `artifacts/focused-tests.log` (51 pass)
- Measured against master `568d1358e`

## Apply order

Independent. Prefer before soft-GPU opening packages; stacks with
`asteroid-query-callers` / `far-actor-cell-key`.

## Risks

- Optic combat requires the player inside the decode disc (~640 WU at ref speed)
  before Rapier bodies exist. Long-range shots at a cold gallery will not hit
  until promote — same class as far-actor shelving.
- Promote uses entity.radius for optic physicsBody (unchanged contract).
