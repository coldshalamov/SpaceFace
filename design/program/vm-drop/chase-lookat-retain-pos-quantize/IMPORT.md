# IMPORT — chase-lookat-retain-pos-quantize

## What it is

Quiet `prepareFrame` → `camera.follow` → `applyChaseLookAt` residual after #72:
lookAt retain required bit-identical eye+target, so quiet chase drift missed
retain every frame and re-ran Three `Object3D.lookAt`. Quantize the retain KEY
(eye X/Y/Z + target X/Z) to **0.25 WU** (same cell as authored-instance camera
cull / presentation-query / clearance-floor retain). Exact floats still drive
`cam.lookAt` when the cell changes. At typical chase distance (~100–300 WU) a
one-cell delay is sub-degree. Bench-only
`setChaseLookAtRetainPosQuantizeForBench(false)` restores bit-identical keys.
Soft-GPU fps not claimed.

## How to apply

`camera.js` is CRLF on master; use `--ignore-space-change` if needed:

```bash
git fetch origin
git checkout -B import/chase-lookat-retain-pos-quantize origin/master
# Stack through #78 first if not already imported (see IMPORT_DIGEST).
git apply --ignore-space-change design/program/vm-drop/chase-lookat-retain-pos-quantize/patches/*.patch
git add -A && git commit -m "perf(render): quantize chase lookAt retain key (~1.9×)"
node --test \
  test/chase-lookat-retain.test.mjs \
  test/composition-framing-trust.test.mjs \
  test/dense-scene-camera-legibility.test.mjs \
  test/camera-focus-separation.test.mjs \
  test/camera-director-governor.test.mjs \
  test/camera-neutral-pair.test.mjs \
  test/pic-07-wreck-camera-clearance.test.mjs \
  test/camera-clearance-floor-retain.test.mjs
```

## Picture

Untouched: full Three lookAt still runs on cell change, snap/teleport, or photo
free-cam (cache invalidate unchanged). Within a 0.25 WU eye/target cell, quiet
frames restore the prior base quat (same contract as #72 when still). Soft-GPU
fps not claimed.

## Apply order

After `camera-clearance-floor-retain-pos-quantize` (#78) / after `chase-lookat-retain` (#72).
Stacks under prepareFrame / camera.follow lookAt residual after #72+#73+#78.
