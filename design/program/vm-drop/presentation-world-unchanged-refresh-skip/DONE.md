# DONE — presentation-world-unchanged-refresh-skip

## Summary

Quiet `prepareFrame` → `syncEntityViews` → `refreshVisibleEntity` residual after
#15+#44+#57+#74+#75: every visible root re-wrote pose/metadata scalars into the
presentation world even when the entity ref and all values already matched.
Production now early-outs that path (and `writePoseScalars` skips identical
pose re-assigns). Bench-only
`setPresentationWorldUnchangedRefreshSkipForBench(false)` restores always-write
for A/B. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Before = skip off (always write); after = skip
on. Checksums match every pair.

| scenario | median | floor minSpeedup |
|---|---:|---:|
| quiet-180ents-2pct-movers (primary) | **~1.60×** | **≥1.51×** |

Primary: **~1.60×** median (8k passes × 180 slots; floor minSpeedup ≥1.51×).
Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; syncEntityViews / refreshVisibleEntity residual after #74+#75.

### Focused tests

presentation-world-unchanged-refresh-skip + presentation-world +
presentation-world-origin-cell-corruption + entity-view-sync-band +
presentation-query-zero-dirty-retain + snapshot-fence-dirty-slot-list →
**24/24** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-presentation-world-unchanged-refresh-skip.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/presentation-world-unchanged-refresh-skip-microbench.json`
- Tests: `artifacts/focused-tests-presentation-world-unchanged-refresh-skip.log`

## Apply order

After `snapshot-fence-dirty-slot-list` (#75). Stacks under prepareFrame /
syncEntityViews residual after #15+#44+#57+#74+#75.

## Risks

- Early-out requires same entity object identity; respawn that replaces the
  entity ref still takes the write path (metadata refresh updates the ref).
- Visual-radius argument participates in the match — callers that change only
  the radius arg without entity.radius still update correctly.
- Bench toggle off restores always-write for A/B; production default is on.
