# IMPORT — asteroid-instance-camera-quantize

## What it is

Quiet `prepareFrame` → `syncAsteroidInstancePool` residual after authored-instance
camera quantize (#53): asteroid pool `cameraStateChanged` still used exact float
equality, so quiet chase follow damping (camera creep ≪1 WU) marked `cameraDirty`
every frame and forced every registered rock through frustum + `matrixWorld`
evaluate. Quantize the camera cull KEY (translation **0.25 WU**, basis/projection
**1e-3**) — same contract as #53. Exact floats still drive the full sync when the
cell changes. Bench-only `setAsteroidInstanceCameraCullExactCompare(true)` restores
bit-identical keys. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/asteroid-instance-camera-quantize origin/master
# Stack through #79 first if not already imported (see IMPORT_DIGEST).
git apply --ignore-space-change design/program/vm-drop/asteroid-instance-camera-quantize/patches/*.patch
git add -A && git commit -m "perf(render): quantize asteroid instance camera cull dirty (~3.0×)"
node --test \
  test/asteroid-instance-camera-quantize.test.mjs \
  test/asteroid-instance-structure.test.mjs \
  test/asteroid-pool-admission.test.mjs \
  test/asteroid-pool-retired-owner.test.mjs \
  test/instance-chunk-submit-policy.test.mjs \
  test/render-entity-frame.test.mjs \
  test/dynamic-buffer-ranges.test.mjs
```

## Picture

Untouched: full frustum + matrix evaluate still runs on cell change, classified
dirty, or pool.dirty. Within a 0.25 WU camera cell, quiet frames reuse the prior
static instance submission (same contract as #53 for authored pools). Soft-GPU
fps not claimed.

## Apply order

After `chase-lookat-retain-pos-quantize` (#79) / after `authored-instance-camera-quantize` (#53).
Stacks under prepareFrame / asteroid instance cameraDirty residual.
