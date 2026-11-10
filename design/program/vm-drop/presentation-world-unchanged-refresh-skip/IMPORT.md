# IMPORT — presentation-world-unchanged-refresh-skip

## What it is

Quiet `syncEntityViews` → `refreshVisibleEntity` residual after #15+#44+#57+#74+#75:
when the entity ref and all pose/metadata scalars already match the slot, skip
re-assigns and dirty bookkeeping. `writePoseScalars` also skips identical pose
writes. Bench-only `setPresentationWorldUnchangedRefreshSkipForBench(false)`
restores the always-write path. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/presentation-world-unchanged-refresh-skip origin/master
# Stack through #75 first if not already imported (see IMPORT_DIGEST).
git apply --ignore-space-change design/program/vm-drop/presentation-world-unchanged-refresh-skip/patches/*.patch
git add -A && git commit -m "perf(render): skip unchanged presentation refresh (~1.6×)"
node --test \
  test/presentation-world-unchanged-refresh-skip.test.mjs \
  test/presentation-world.test.mjs \
  test/presentation-world-origin-cell-corruption.test.mjs \
  test/entity-view-sync-band.test.mjs \
  test/presentation-query-zero-dirty-retain.test.mjs \
  test/snapshot-fence-dirty-slot-list.test.mjs
```

## Picture

Untouched: movers still refresh and mark TRANSFORM; statics that already match
keep identical world scalars. Soft-GPU fps not claimed.

## Apply order

After `snapshot-fence-dirty-slot-list` (#75). Stacks under prepareFrame /
syncEntityViews residual after #15+#44+#57+#74+#75.
