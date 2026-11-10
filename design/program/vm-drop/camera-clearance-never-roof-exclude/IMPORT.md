# IMPORT — camera-clearance-never-roof-exclude

1. Apply `camera-clearance-asteroid-span-reject` (#63) first if not already on
   the tree (this patch edits the span-reject seam).
2. Apply `patches/0001-perf-render-exclude-never-roof-asteroids-from-cleara.patch`
   on master tip `abcccfd87` (or current master after fetch) through #63.
3. Confirm `cameraClearanceFloorAt` rebuild skips asteroids whose
   `asteroidBody.scale × 2.5` is under the 120 WU span bar, and
   `cameraClearanceBoxForMesh` sticky-returns null when never-roof scale matches.
4. Run: `node --test test/pic-07-wreck-camera-clearance.test.mjs test/camera-director-governor.test.mjs test/camera-focus-separation.test.mjs test/dense-scene-camera-legibility.test.mjs test/camera-neutral-pair.test.mjs test/camera-nimble-regime.test.mjs`
5. Optional: `node design/program/vm-drop/camera-clearance-never-roof-exclude/artifacts/camera-clearance-never-roof-exclude-microbench.mjs`

Scratch: `vm-work/hillclimb-20260924h` @ `31e445654`.
