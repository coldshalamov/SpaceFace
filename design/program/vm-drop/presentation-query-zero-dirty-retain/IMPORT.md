# IMPORT — presentation-query-zero-dirty-retain

## What it is

Quiet `syncEntityViews` cull query retains the prior visible set when
`presentationWorld.dirtyCount === 0`, layout/maxRadius/boundCount are unchanged,
and the cull rectangle + origin + playerId are bit-identical. Skips spatial
collect / sort / exactVisible / hidden diff. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/presentation-query-zero-dirty-retain origin/master
# Stack through #73 first if not already imported (see IMPORT_DIGEST).
git apply --ignore-space-change design/program/vm-drop/presentation-query-zero-dirty-retain/patches/*.patch
git add -A && git commit -m "perf(render): retain zero-dirty presentation query (~6.9×)"
node --test \
  test/presentation-query-zero-dirty-retain.test.mjs \
  test/presentation-world.test.mjs \
  test/presentation-world-origin-cell-corruption.test.mjs
```

## Picture

Untouched for quiet settled flight (identical cull → identical visible set;
no newlyVisible/hidden transitions). Pose churn / layout / bounds change still
walk. Soft-GPU fps not claimed.

## Apply order

After `camera-clearance-floor-retain` (#73). Stacks under prepareFrame /
syncEntityViews query residual after #15+#44+#57+#68.
