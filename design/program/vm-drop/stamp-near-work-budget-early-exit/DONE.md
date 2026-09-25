# DONE — stamp-near-work-budget-early-exit

## Summary

Quiet `preStep` → `stampNearWorkBudget` residual after #61: every tick still
`Set.add`'d every always-awake shipLike (player/combatants/slots) even though
`hasNearWorkSlot` short-circuits on `_nearWorkAlwaysAwake` before consulting the
Set — then cleared that same population next tick. With always-awake out of the
Set, the rotating S1 budget is the only remaining work, so the scan now
**breaks** once `NEAR_WORK_TOKEN_BUDGET` recipients are granted instead of
walking the rest of `shipLike`. Bench-only
`setNearWorkAlwaysAwakeSetInsertForBench(true)` restores the old inserts + full
scan for A/B. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 80 shipLike (#61 shape: player + 2 combatants +
S1/S3 mix) × 80k ticks. Before = insert awake + full scan; after = skip + early-exit.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-80shipLike (primary, 9 isolated pairs) | **~1.82×** | **≥1.52×** |

Primary: **~1.82×** median (floor minSpeedup ≥1.52×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`stampNearWorkBudget` **39** self under `preStep` / `registry.step` after #61.

### Focused tests

pq-204-advanced-perf + activity-runtime + activity-classification +
ceres-activity-runtime-lifecycle + core-coreSystem.review → **91/91** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-core-stamp-near-work-budget-early-exit.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/stamp-near-work-budget-early-exit-microbench.json`
- Tests: `artifacts/focused-tests-stamp-near-work-budget-early-exit.log`

## Apply order

After `stamp-near-work-awake-cache` (#61). Stacks under registry.step / preStep
residual after #56+#59+#61.

## Risks

- Always-awake entities no longer appear in `state.nearWorkIds`; only
  `hasNearWorkSlot` (and the always-awake short-circuit) is the supported
  consumer — matches live call sites.
- Early-exit assumes always-awake inserts are off; bench toggle restores full
  scan when measuring the pre-cut residual.
