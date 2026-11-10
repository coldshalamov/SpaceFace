# DONE — camera-clearance-never-roof-exclude

## Summary

Quiet `camera.follow` clearance residual after #63 span-reject: undersized
field rocks still re-entered `cameraClearanceFloorAt` every WU (pos-keyed
cache miss → re-reject). Production now sticky-marks never-roof asteroids and
excludes them from the structural walk until scale changes. Soft-GPU fps not
claimed.

## Before / after

### Offline microbench (primary — portable CPU)

60 field rocks (R≈8–12) + 3 stations + 1 capital rock (R=70) × 20k floor
queries with #63 pos-cache bust each frame (same miss rate as 1.05 WU drift).
Before = #63 span-reject structural walk (64); after = sticky never-roof
exclude (structural 4 = stations + capital). Isolated child processes.

| | Before | After | |
|---|---:|---:|---|
| wall (median) | 78.6 ms | 44.2 ms | **~1.78×** |

Floor minSpeedup **1.60×** across five isolated pairs; capital/station roof
parity; small rocks stay non-roofs; sink match. Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `cameraClearanceBoxForMesh` / `follow` under `prepareFrame`.

### Focused tests

pic-07-wreck-camera-clearance + camera-director-governor +
camera-focus-separation + dense-scene-camera-legibility +
camera-neutral-pair + camera-nimble-regime → **68/68** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-exclude-never-roof-asteroids-from-cleara.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/camera-clearance-never-roof-exclude-microbench.json`
- Tests: `artifacts/focused-tests-camera-clearance-never-roof-exclude.log`

## Apply order

After `camera-clearance-asteroid-span-reject` (#63). Stacks under prepareFrame /
camera.follow residual.

## Risks

- Asteroids without `userData.asteroidBody` still take the ordinary path.
- Scale growth on a previously never-roof rock (authoring / capital promote)
  clears the sticky bit on the next structural rebuild (`_meshesVersion`) or
  on the next `cameraClearanceBoxForMesh` touch; quiet field rocks do not grow.
- Structural exclude is gated by the same bench flag as span-reject plus
  `CAMERA_CLEARANCE_ASTEROID_NEVER_ROOF_EXCLUDE` (default on).
