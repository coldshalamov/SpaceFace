# IMPORT — presentation-query-retain-pos-quantize

## What it is

Quiet `syncEntityViews` → `presentationQueries.query` residual after #74: zero-dirty
retain required bit-identical cull rect + origin, so quiet chase drift missed retain
every frame. Quantize the retain KEY (bounds/origin) to **0.25 WU** (same cell as
authored-instance camera cull). Exact floats still drive collect/exactVisible when
the cell changes. Bench-only `setPresentationQueryRetainPosQuantizeForBench(false)`
restores bit-identical keys. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/presentation-query-retain-pos-quantize origin/master
# Stack through #76 first if not already imported (see IMPORT_DIGEST).
git apply --ignore-space-change design/program/vm-drop/presentation-query-retain-pos-quantize/patches/*.patch
git add -A && git commit -m "perf(render): quantize presentation-query retain key (~3.0×)"
node --test \
  test/presentation-query-zero-dirty-retain.test.mjs \
  test/presentation-world.test.mjs \
  test/presentation-world-unchanged-refresh-skip.test.mjs \
  test/presentation-world-origin-cell-corruption.test.mjs \
  test/entity-view-sync-band.test.mjs \
  test/snapshot-fence-dirty-slot-list.test.mjs
```

## Picture

Untouched: full spatial walk still runs on cell change, dirty world, zoom change, or
layout/maxRadius/boundCount change. Within a 0.25 WU cell, quiet zero-dirty frames
reuse the prior visible set (same contract as #74 when the camera is still). Soft-GPU
fps not claimed.

## Apply order

After `presentation-world-unchanged-refresh-skip` (#76). Stacks under prepareFrame /
syncEntityViews residual after #15+#44+#57+#74+#75+#76.
