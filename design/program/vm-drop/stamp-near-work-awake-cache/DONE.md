# DONE — stamp-near-work-awake-cache

## Summary

Quiet `stampNearWorkBudget` walked `ownerIsAlwaysAwake` (ai record +
combatant + activityActorSlotId) for every shipLike each tick. Production
now caches `entity._nearWorkAlwaysAwake` and refreshes on the same volatile
AI cadence as `aiShips` (#56). Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

80 shipLike (player + 2 combatants/slot + S1 civilians + dormant) × 80k
ticks; before = live `ownerIsAlwaysAwake`; after = cached boolean (warmed
as volatile refresh / first touch). Isolated child processes.

| | Before | After | |
|---|---:|---:|---|
| wall (median band) | ~97–112 ms | ~57–63 ms | **~1.56–1.85×** |

Primary claim band **~1.65×** (median of five isolated runs; floor ≥1.56×).
Admit parity + production-module parity match across 64 ticks. Soft-GPU fps
not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924w`
(Picture ON): idle **62.4%**, long tasks **17**; `stampNearWorkBudget`
under `registry.step`.

### Focused tests

pq-204-advanced-perf + activity-runtime + activity-classification +
ceres-activity-runtime-lifecycle + entity-lifecycle-residency-recycle +
core-coreSystem.review → **93/93** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-core-cache-stampNearWorkBudget-always-awake-bit.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/stamp-near-work-awake-cache-microbench.json`
- Tests: `artifacts/focused-tests-stamp-near-work-awake-cache.log`

## Apply order

Independent. Prefer after #56/#59/#60. Stacks under registry.step /
stampNearWorkBudget.

## Risks

- Mid-life combatant / activity-slot attach without a volatile rebuild can
  lag up to `VOLATILE_INDEX_PERIOD_TICKS` (8) — same window as `aiShips`.
- First stamp after spawn fills the cache (one `ownerIsAlwaysAwake` per new
  entity); subsequent ticks read the boolean.
