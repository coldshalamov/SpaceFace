# IMPORT — snapshot-fence-zero-dirty-retain

1. Apply `patches/0001-perf-render-snapshot-fence-zero-dirty-retain.patch` on
   master tip through #67 (or current stacked hillclimb tip).
2. Confirm `presentationWorld` exposes O(1) `dirtyCount` via mark/clear helpers,
   and `packPresentationWorldToFence` returns early when `dirtyCount === 0` and
   `fence.latestLayoutVersion === world.layoutVersion` (membership changes must
   still full/incremental pack).
3. Run: `node --test test/snapshot-fence-dirty-incremental.test.mjs test/presentation-world.test.mjs test/snapshot-fence-pose-epoch.test.mjs test/snapshot-fence-span-alpha.test.mjs`
4. Optional: `node design/program/vm-drop/snapshot-fence-zero-dirty-retain/artifacts/snapshot-fence-zero-dirty-retain-microbench.mjs`

Scratch: `vm-work/hillclimb-20260924h` @ `7f6dd1c42`.
