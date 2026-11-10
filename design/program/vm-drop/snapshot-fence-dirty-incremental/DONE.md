# DONE — snapshot-fence-dirty-incremental

## Summary

`packPresentationWorldToFence` no longer rewrites every active slot + rebuilds the
entityId→row Map when only poses moved. Presentation world bumps `layoutVersion` on
activeSlots membership change. Layout-stable packs copy the previous dense fence
snapshot and `rewritePose` dirty rows in place, keeping the write buffer's index Map.

## Before / after

### Offline microbench (primary — portable CPU)

8000–12000 packs; quiet Ceres-shaped (parked majority, few TRANSFORM-dirty movers).
Before = `forceFull` dense rewrite; After = layout-stable dirty incremental.

| scenario | Before | After | speedup |
|---|---:|---:|---:|
| quiet-120ents-1dirty | 378 ms | 102 ms | **~3.71×** |
| quiet-120ents-3dirty | 370 ms | 106 ms | **~3.49×** |
| quiet-400ents-4dirty | 794 ms | 167 ms | **~4.76×** |
| combat-ish-400ents-40dirty | 937 ms | 322 ms | **~2.91×** |

Oracle: incremental vs forceFull position/quat/entityId **0 mismatches**.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924h` —
`prepareFrame` → `packPresentationWorldToFence` after #46 yaw-cache.

### Focused tests

`snapshot-fence-dirty-incremental` + `snapshot-fence-*` + `presentation-world` +
`ship-pitch-presentation` + `entity-view-sync-band` → **pass**.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-snapshot-fence-dirty-incremental.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/snapshot-fence-dirty-incremental-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Prefer after #46. Stacks under prepareFrame pack/residency/spaceBg
residual after #13+#44+#46+#47+#50.

## Risks

- Incremental requires the write buffer's `layoutVersion` to already match (ring
  fills with 3 full packs after membership churn before incremental resumes).
- `activeSlots` must stay dense (existing removeActive compacting). Alive holes
  fall back to full pack.
- Dirty masks are not cleared by pack (syncEntityViews still clears).
