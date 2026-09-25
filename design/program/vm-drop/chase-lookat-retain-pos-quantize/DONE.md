# DONE — chase-lookat-retain-pos-quantize

## Summary

Quiet `prepareFrame` → `camera.follow` → `applyChaseLookAt` residual after #72:
lookAt retain required bit-identical eye+target, so quiet chase drift (eye/target
creep ≪ chase distance) missed retain every frame and re-ran Three
`Object3D.lookAt` (`updateWorldMatrix` + `Matrix4.lookAt` + `setFromRotationMatrix`).
Production now quantizes the retain KEY (eye X/Y/Z + target X/Z) to the same
**0.25 WU** cell as authored-instance camera cull (#53), presentation-query
retain (#77), and clearance-floor retain (#78). Exact floats still drive
`cam.lookAt` when the cell changes. Bench-only
`setChaseLookAtRetainPosQuantizeForBench(false)` restores bit-identical keys.
Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Before = retain on, quantize off (drift misses);
after = retain on, quantize on (drift hits within cell). 200k calls; in-cell
drift (`% 0.12`).

| scenario | median | floor minSpeedup |
|---|---:|---:|
| quiet-chase-drift (primary) | **~1.92×** | **≥1.77×** |

Primary: **~1.92×** median (11 isolated pairs; floor minSpeedup ≥1.77×). Soft-GPU
fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; lookAt under `camera.follow` / prepareFrame residual after
clearance + framing + #72 settled retain. Moving lookAt retain without quantize
was a prior hold (~1.00× informational); this package supersedes that miss the
same way #77/#78 superseded moving query/clearance retain.

### Focused tests

chase-lookat-retain (+ new quantize cases) + composition-framing-trust +
dense-scene-camera-legibility + camera-focus-separation +
camera-director-governor + camera-neutral-pair + pic-07-wreck-camera-clearance +
camera-clearance-floor-retain → **85/85** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-chase-lookat-retain-pos-quantize.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/chase-lookat-retain-pos-quantize-microbench.json`
- Tests: `artifacts/focused-tests-chase-lookat-retain-pos-quantize.log`

## Apply order

After `camera-clearance-floor-retain-pos-quantize` (#78) / after `chase-lookat-retain` (#72).
Stacks under prepareFrame / camera.follow lookAt residual after #72+#73+#78.

## Risks

- Retain key quantization freezes base look quat for up to one 0.25 WU cell of
  eye/target drift — at typical chase distance (~100–300 WU) angular error is
  sub-degree; same order as #53/#77/#78.
- Snap/photo paths must keep invalidating `_lookAtCache.eyeX` (unchanged).
- Bench toggle off restores bit-identical keys for A/B; production default is on.
