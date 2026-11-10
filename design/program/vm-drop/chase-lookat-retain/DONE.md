# DONE — chase-lookat-retain

## Summary

Quiet `prepareFrame` → `camera.follow` lookAt residual after #63+#65+#71:
settled eye+target still paid full Three `Object3D.lookAt` (`updateWorldMatrix`
+ `Matrix4.lookAt` + `setFromRotationMatrix`) every frame. Production now
caches the base look quat and restores it when eye+target are bit-identical;
bank roll and trauma shake still post-multiply after. Snap/teleport and photo
free-cam invalidate the cache. Bench-only `setChaseLookAtRetainForBench(false)`
restores always-lookAt. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

`applyChaseLookAt` + settled roll multiply; fixed eye/target × 200000 calls.
Isolated Node child processes. Before = retain off (Three lookAt every call);
after = retain on (cached base quat).

| | Before | After | |
|---|---:|---:|---|
| settled wall (median) | ~62 ms | ~29 ms | **~2.14×** |

Floor minSpeedup **≥2.05×** across seven isolated pairs (settled-lookat).
Moving-chase informational ~1.00× (eye/target change every call — retain rarely
hits). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; lookAt under `camera.follow` / prepareFrame residual after
clearance + framing trust.

### Focused tests

`chase-lookat-retain` + `composition-framing-trust` +
`dense-scene-camera-legibility` + `camera-focus-separation` +
`camera-director-governor` + `camera-neutral-pair` +
`pic-07-wreck-camera-clearance` → **72/72** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-retain-settled-chase-lookAt-base-quat.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/chase-lookat-retain-microbench.json`
- Tests: `artifacts/focused-tests-chase-lookat-retain.log`

## Apply order

After `composition-framing-trust` (#71). Stacks under prepareFrame /
camera.follow lookAt residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71.

## Risks

- Retain keys on exact float identity of eye/target; continuous damping still
  calls Three lookAt (intentional).
- Snap/photo paths must keep invalidating `_lookAtCache.eyeX` so a later retain
  cannot restore a pre-snap base quat at coincidentally identical coordinates.
- Bench-only `setChaseLookAtRetainForBench` must stay default-on in prod.
