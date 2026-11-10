# DONE — asteroid-instance-camera-quantize

## Summary

Quiet `prepareFrame` → `syncAsteroidInstancePool` residual after #53: asteroid
pool `cameraStateChanged` required bit-identical camera pose/matrix/projection, so
quiet chase follow damping (camera creep ≪1 WU) marked `cameraDirty` every frame
and forced every registered rock through frustum + `leaf.updateWorldMatrix` +
matrix evaluate. Production now quantizes the cull KEY (translation **0.25 WU**,
basis/projection **1e-3**) — same contract as authored-instance camera cull (#53),
presentation-query retain (#77), clearance-floor retain (#78), and chase lookAt
retain (#79). Exact floats still drive the full sync when the cell changes.
Bench-only `setAsteroidInstanceCameraCullExactCompare(true)` restores bit-identical
keys. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Before = exact cameraDirty (micro-jitter forces
full path); after = quantized capture (reuse static submission within cell).
80 rocks × 2000 frames; in-cell drift 0.05 WU.

| scenario | median | floor minSpeedup |
|---|---:|---:|
| quiet-80rocks-0.05WU (primary, 11 isolated pairs) | **~3.05×** | **≥2.87×** |

In-process scenarios (same harness): 40/80/120 rocks @ 0.05 WU ~4.6–5.5×; 120 @
0.02 WU ~12.6×; quiet-Ceres 11 rocks @ 0.05 WU ~3.0×. Oracle: micro dirtyRate
~0.19; large 2 WU moves dirtyRate 1.0.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `syncAsteroidInstancePool` under prepareFrame residual after
authored-instance #53 (asteroid pool still exact). Soft-GPU fps not claimed.

### Focused tests

asteroid-instance-camera-quantize (+ new cases) + asteroid-instance-structure +
asteroid-pool-admission + asteroid-pool-retired-owner + instance-chunk-submit-policy
+ render-entity-frame + dynamic-buffer-ranges → **41/41** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-asteroid-instance-camera-quantize.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/asteroid-instance-camera-quantize-microbench.json`
- Tests: `artifacts/focused-tests-asteroid-instance-camera-quantize.log`

## Apply order

After `chase-lookat-retain-pos-quantize` (#79) / after `authored-instance-camera-quantize` (#53).
Stacks under prepareFrame / asteroid instance cameraDirty residual.

## Risks

- Cull key quantization freezes frustum membership for up to one 0.25 WU cell of
  camera drift — glass is hundreds of WU; same order as #53/#77/#78/#79.
- Large pans/zooms (≫ cell) still dirty and re-evaluate (oracle large dirtyRate 1.0).
- Bench toggle on restores exact compare for A/B; production default is quantize on.
