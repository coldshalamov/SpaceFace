# IMPORT — snapshot-fence-dirty-slot-list

## What it is

Quiet `prepareFrame` → `packPresentationWorldToFence` residual after #51+#68:
when `dirtyCount > 0`, production rewrites only the dense `dirtySlots` list
instead of scanning every `activeSlots` dirty mask after `copyDenseFrom`.
`presentationWorld` maintains `dirtySlots` / `dirtyPositions` alongside
`dirtyCount`. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/snapshot-fence-dirty-slot-list origin/master
# Stack through #74 first if not already imported (see IMPORT_DIGEST).
git apply --ignore-space-change design/program/vm-drop/snapshot-fence-dirty-slot-list/patches/*.patch
git add -A && git commit -m "perf(render): dirty-slot list for fence pack (~2.0×)"
node --test \
  test/snapshot-fence-dirty-slot-list.test.mjs \
  test/snapshot-fence-dirty-incremental.test.mjs \
  test/snapshot-fence-pose-epoch.test.mjs \
  test/snapshot-fence-span-alpha.test.mjs \
  test/presentation-world.test.mjs \
  test/presentation-world-origin-cell-corruption.test.mjs \
  test/ship-pitch-presentation.test.mjs \
  test/entity-view-sync-band.test.mjs
```

## Picture

Untouched: dirty rows still `rewritePose` with the same values; clean rows still
come from `copyDenseFrom` of the sealed prior pack. Soft-GPU fps not claimed.

## Apply order

After `presentation-query-zero-dirty-retain` (#74). Stacks under prepareFrame /
packFence residual after #51+#68.
