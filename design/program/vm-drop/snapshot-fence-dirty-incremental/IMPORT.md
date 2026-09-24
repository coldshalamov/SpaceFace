# IMPORT — snapshot-fence-dirty-incremental

## What it is

`packPresentationWorldToFence` layout-stable dirty incremental. When presentation
`layoutVersion` is unchanged across the fence ring, copy the previous dense
snapshot and rewrite dirty rows in place (reuse entityId→row Map). Membership
churn still full-rebuilds.

## How to apply

```bash
git fetch origin
git checkout -B import/snapshot-fence-dirty-incremental origin/master
git am design/program/vm-drop/snapshot-fence-dirty-incremental/patches/*.patch
node --test test/snapshot-fence-dirty-incremental.test.mjs \
  test/snapshot-fence-pose-epoch.test.mjs test/snapshot-fence-span-alpha.test.mjs \
  test/presentation-world.test.mjs
```

Prefer after #46 (yaw-quat cache). Independent of #50.

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Stacks under prepareFrame pack residual after #13+#44+#46+#47.
