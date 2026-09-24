# DONE — select-classify-epoch-seen

## Summary

Quiet incremental `selectClassifyEntities` cleared and rehashed a `Set` of
near-disc entity ids every classify pass. Production now keeps dense
`Uint32Array` id-epoch marks and bumps a generation (wrap fills zeros) — the
same membership pattern presentationQueries already uses. Empty projectiles
lane skips the typed walk. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

exact+near ids + ~180 radius rocks × 12k iters; before = `Set.clear`+has/add;
after = Uint32Array epoch marks. Isolated child processes.

| | Before | After | |
|---|---:|---:|---|
| wall | 68.497 ms | 23.683 ms | **~2.89×** |
| admit parity | — | match (220) | |

Primary claim band **~2.89×** (isolated median). Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924w`
(Picture ON): idle **62.4%**, long tasks **17**; `selectClassifyEntities`
self under `classifyWorld` / `registry.step`.

### Focused tests

activity-runtime + activity-classification + ceres-activity-runtime-lifecycle
→ **64/64** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-epoch-id-marks-for-selectClassify-seen.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/select-classify-epoch-seen-microbench.json`
- Tests: `artifacts/focused-tests-select-classify-epoch-seen.log`

## Apply order

Independent. Prefer after #48/#59. Stacks under classifyWorld / selectClassify.

## Risks

- Entity ids must be non-negative integers (existing contract). Marks array
  grows to the max id seen on the classify path; wrap at 2^31−1 fills zeros.
- Map/Set based scratch field `classifySeenScratch` (Set) replaced by
  `classifySeenMarks` (Uint32Array) + `classifySeenEpoch` on the activity runtime object.
