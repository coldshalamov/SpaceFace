# DONE — snapshot-fence-zero-dirty-retain

## Summary

Quiet `prepareFrame` → packFence residual after #51: production no longer
`copyDenseFrom`s every snapshot column on layout-stable ticks with zero
`PRESENTATION_DIRTY` bits. `presentationWorld` tracks O(1) `dirtyCount`;
`packPresentationWorldToFence` retains the sealed latest snapshot when
`dirtyCount === 0` and `latestLayoutVersion` matches. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

400 entities × 10000 zero-dirty packs. Isolated Node child processes.
Before = #51 beginIncrementalPack + copyDenseFrom + commit every tick;
after = O(1) dirtyCount retain (no dense copy).

| | Before (dense copy) | After (zero-dirty retain) | |
|---|---:|---:|---|
| wall (median) | see microbench JSON | see microbench JSON | **~9.2×** |

Floor minSpeedup **≥8.4×** across seven isolated pairs (primary n=400 dirty=0).
Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; packFence / prepareFrame residual after #51.

### Focused tests

snapshot-fence-dirty-incremental + presentation-world + snapshot-fence-pose-epoch
+ snapshot-fence-span-alpha → **18/18** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-snapshot-fence-zero-dirty-retain.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/snapshot-fence-zero-dirty-retain-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

After `snapshot-fence-dirty-incremental` (#51). Stacks under prepareFrame /
packFence residual after #13+#44+#46+#47+#51–#58+#63+#65.

## Risks

- Zero-dirty retain requires `fence.latestLayoutVersion === world.layoutVersion`.
  Retire/allocate bumps layout and forces a real pack even when pose dirty bits
  are clear.
- `Object.assign` must not copy the `dirtyCount` getter (defineProperty).
- Dirty counts must stay matched on mark/clear/allocate/retire; clear()+rebuild
  goes through retire/allocate helpers.
