# IMPORT — emergent-hot-spatial

## What it is

`emergentPrimitives` hot-path radius probes use the warm spatial hash instead of
full `entityList` walks. Portable crowded microbench **~4.0×**. Cool path still
early-outs on `!emergent.hot`.

## How to apply

```bash
git fetch origin
git checkout -B import/emergent-hot-spatial origin/master
git am design/program/vm-drop/emergent-hot-spatial/patches/*.patch
node --test test/emergent-arpg-primitives.test.mjs
```

## Apply order

Clean on bare `origin/master` @ `568d1358e`. Independent of optic / query /
far-actor packages. Prefer after `#31` so quiet Ceres lists are already lean.

## Picture

Untouched. No material/program key changes. No dummy prewarm.
