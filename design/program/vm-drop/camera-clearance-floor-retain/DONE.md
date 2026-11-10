# DONE — camera-clearance-floor-retain

## Summary

Quiet `prepareFrame` → `camera.follow` clearance residual after #63+#65+#72:
settled off-roof chase still walked the structural clearance list every frame
(box-cache hits + AABB). Production now retains the last floor when cam X/Y/Z
are bit-identical, structural is station/place-only (or empty), and the last
floor was `-Infinity`. Asteroid/wreck structural skips retain (drift / in-place
growth). Under-roof retains confirm authored stamps so pending→authored cannot
keep a stale empty floor. Bench-only `setCameraClearanceFloorRetainForBench(false)`
restores always-walk. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

`cameraClearanceFloorAt` quiet off-roof hover; 6 stations + 40 never-roof field
rocks; 200k calls. Isolated Node child processes. Before = retain off; after =
retain on.

| | Before | After | |
|---|---:|---:|---|
| settled wall (median) | ~35 ms | ~17 ms | **~2.07×** |

Floor minSpeedup **≥1.72×** across seven isolated pairs (settled off-roof).
Moving-chase informational ~0.85× (cam floats change every call — retain rarely
hits). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; clearance under `camera.follow` / prepareFrame residual after
#63+#65+#72.

### Focused tests

`camera-clearance-floor-retain` + `pic-07-wreck-camera-clearance` +
`chase-lookat-retain` + `composition-framing-trust` +
`dense-scene-camera-legibility` + `camera-focus-separation` +
`camera-director-governor` + `camera-neutral-pair` → **78/78** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-retain-settled-clearance-floor-off-roof.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/camera-clearance-floor-retain-microbench.json`
- Tests: `artifacts/focused-tests-camera-clearance-floor-retain.log`

## Apply order

After `chase-lookat-retain` (#72). Stacks under prepareFrame / camera.follow
clearance residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72.

## Risks

- Retain keys on exact float identity of cam X/Y/Z; continuous damping still
  walks (intentional).
- Asteroid/wreck structural never retains (drift / in-place authored growth).
- Under-roof path confirms authored stamps before returning a finite floor.
- Bench-only `setCameraClearanceFloorRetainForBench` must stay default-on in prod.
