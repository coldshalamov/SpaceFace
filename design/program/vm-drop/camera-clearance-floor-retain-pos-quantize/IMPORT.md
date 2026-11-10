# IMPORT — camera-clearance-floor-retain-pos-quantize

## What it is

Quiet `prepareFrame` → `camera.follow` → `cameraClearanceFloorAt` residual after #73:
floor retain required bit-identical cam X/Y/Z, so quiet chase drift missed retain every
frame and re-ran the structural walk. Quantize the retain KEY (cam X/Y/Z) to **0.25 WU**
(same cell as authored-instance camera cull / presentation-query retain). Exact floats
still drive the AABB walk when the cell changes. Margin is 16 WU, so a one-cell delay at
an AABB edge is negligible. Bench-only
`setCameraClearanceFloorRetainPosQuantizeForBench(false)` restores bit-identical keys.
Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/camera-clearance-floor-retain-pos-quantize origin/master
# Stack through #77 first if not already imported (see IMPORT_DIGEST).
git apply --ignore-space-change design/program/vm-drop/camera-clearance-floor-retain-pos-quantize/patches/*.patch
git add -A && git commit -m "perf(render): quantize clearance floor retain key (~2.1×)"
node --test \
  test/camera-clearance-floor-retain.test.mjs \
  test/pic-07-wreck-camera-clearance.test.mjs \
  test/chase-lookat-retain.test.mjs \
  test/composition-framing-trust.test.mjs \
  test/dense-scene-camera-legibility.test.mjs \
  test/camera-focus-separation.test.mjs \
  test/camera-director-governor.test.mjs \
  test/camera-neutral-pair.test.mjs
```

## Picture

Untouched: full structural AABB walk still runs on cell change, mesh churn, boxEpoch
bump, or asteroid/wreck structural (non-static). Within a 0.25 WU cam cell, quiet
frames reuse the prior floor (same contract as #73 when the camera is still). Soft-GPU
fps not claimed.

## Apply order

After `presentation-query-retain-pos-quantize` (#77) / after `camera-clearance-floor-retain` (#73).
Stacks under prepareFrame / camera.follow residual after #63+#65+#72+#73.
