# DONE — classify-physics-partition-cache

## Summary

Quiet `classifyWorld` re-checked `entityNeedsPhysics` +
`shouldSyncPhysicsBodyEntity` + `isDynamicPhysicsBodyEntity` on every visit
when partitioning physics sync lists. Production now caches
`entity._physicsPartition` (0/1/2) and refreshes on `applyStamp` tier/pin
flips (plus first touch / same-tick projectile admit). Soft-GPU fps not
claimed.

## Before / after

### Offline microbench (primary — portable CPU)

180 mixed entities (exact/near/dormant/abstract + projectile/station/chunk/fx)
× 80k partition walks; before = three live checks; after = cached byte
(warmed). Isolated child processes.

| | Before | After | |
|---|---:|---:|---|
| wall (median band) | ~215–231 ms | ~52–55 ms | **~4.08–4.36×** |

Primary claim band **~4.1×** (median of five isolated runs; floor minSpeedup
≥3.70×). Admit parity + production `refreshPhysicsPartition` match. Soft-GPU
fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924w`
(Picture ON): idle **62.4%**, long tasks **17**; `shouldSyncPhysicsBodyEntity`
/ `isDynamicPhysicsBodyEntity` / `authoredPhysicsBody` under `classifyWorld`.

### Focused tests

activity-runtime + activity-classification + ceres-activity-runtime-lifecycle +
world-activityRuntime.review + dynamic-physics-render-interpolation +
physics-authority-cache + pq-148-01-volatile-classes → **74/74** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-cache-classify-physics-partition-kind-.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/classify-physics-partition-cache-microbench.json`
- Tests: `artifacts/focused-tests-classify-physics-partition-cache.log`

## Apply order

Independent. Prefer after #60. Stacks under classifyWorld / shouldSyncPhysics.

## Risks

- Mid-life `physicsBody` / `collides` / radius flips without an `applyStamp`
  tier/pin change can lag until the next stamp refresh or first-touch miss
  (same class as other entity fact caches). Closed-form `physicsBody: false`
  is normally authored at spawn before classify.
- Same-tick projectile admit stamps `_physicsPartition = 2` directly.
