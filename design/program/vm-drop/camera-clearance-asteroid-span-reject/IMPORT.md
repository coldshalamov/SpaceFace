# IMPORT — camera-clearance-asteroid-span-reject

## What it is

`cameraClearanceBoxForMesh` no longer calls `setFromObject` for field rocks
whose `asteroidBody` scale × 2.5 cannot clear the 120 WU span bar. Drifting
rocks re-invalidate the numeric cache every WU; the hint caches a null box
without the scene-graph walk. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/camera-clearance-asteroid-span-reject origin/master
git am design/program/vm-drop/camera-clearance-asteroid-span-reject/patches/*.patch
node --test \
  test/pic-07-wreck-camera-clearance.test.mjs \
  test/camera-director-governor.test.mjs \
  test/camera-focus-separation.test.mjs \
  test/dense-scene-camera-legibility.test.mjs \
  test/camera-neutral-pair.test.mjs \
  test/camera-nimble-regime.test.mjs
```

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Prefer after prepareFrame pack/sync stack. Stacks under
prepareFrame / camera.follow clearance.
