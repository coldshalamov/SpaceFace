# IMPORT — classify-physics-partition-cache

## What it is

Quiet `classifyWorld` re-entered `shouldSyncPhysicsBodyEntity` →
`authoredPhysicsBody` and `isDynamicPhysicsBodyEntity` → `defaultDynamic` on
every visit when building `physicsDynamics` / `physicsStatics`. Production now
caches `entity._physicsPartition` (0=skip, 1=static, 2=dynamic), refreshes on
`simTier` / `pinnedExact` flips in `applyStamp` and on first touch, and stamps
same-tick projectile admits as dynamic. Admit parity unchanged. Soft-GPU fps
not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/classify-physics-partition-cache origin/master
git am design/program/vm-drop/classify-physics-partition-cache/patches/*.patch
node --test \
  test/activity-runtime.test.mjs \
  test/activity-classification.test.mjs \
  test/ceres-activity-runtime-lifecycle.test.mjs \
  test/world-activityRuntime.review.test.mjs \
  test/dynamic-physics-render-interpolation.test.mjs \
  test/physics-authority-cache.test.mjs \
  test/pq-148-01-volatile-classes.test.mjs
```

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Prefer after #60. Stacks under classifyWorld / shouldSyncPhysics.
