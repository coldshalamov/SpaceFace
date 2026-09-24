# DONE — snapshot-fence-dirty-slot-list

## Summary

Quiet `prepareFrame` → packFence residual after #51+#68: when dirtyCount > 0,
production still `copyDenseFrom`d then scanned every active slot's dirty mask.
`presentationWorld` now keeps a dense `dirtySlots` list (with `dirtyPositions`)
alongside `dirtyCount`; `packPresentationWorldToFence` rewrites only those rows.
Bench-only `setSnapshotFenceDirtySlotListForBench(false)` restores the O(active)
mask walk. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Before = dirty-slot list off (O(active) mask
scan); after = list on. Checksums match every pair.

| scenario | median | floor minSpeedup |
|---|---:|---:|
| quiet-180ents-1dirty (primary) | **~2.01×** | **≥1.76×** |
| quiet-180ents-3dirty | ~1.94× | ≥1.78× |
| quiet-400ents-4dirty | ~2.93× | ≥2.79× |
| combat-ish-400ents-40dirty | ~1.72× | ≥1.63× |

Primary: **~2.01×** median (12k packs; floor minSpeedup ≥1.76×). Soft-GPU fps
not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; packFence / prepareFrame residual after #68+#74.

### Focused tests

snapshot-fence-dirty-slot-list + snapshot-fence-dirty-incremental +
snapshot-fence-pose-epoch + snapshot-fence-span-alpha + presentation-world +
presentation-world-origin-cell-corruption + ship-pitch-presentation +
entity-view-sync-band → **33/33** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-snapshot-fence-dirty-slot-list.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/snapshot-fence-dirty-slot-list-microbench.json`
- Tests: `artifacts/focused-tests-snapshot-fence-dirty-slot-list.log`

## Apply order

After `presentation-query-zero-dirty-retain` (#74). Stacks under prepareFrame /
packFence residual after #51+#68+#74.

## Risks

- Dirty list must stay matched on mark/clear/allocate/retire (same edges as
  dirtyCount). Invariant breaks fall back to full pack.
- Retain keys on exact dirtySlots cardinality == dirtyCount; bench toggle off
  restores walk-all for A/B.
