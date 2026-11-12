# IMPORT — stamp-near-work-awake-cache

## What it is

`stampNearWorkBudget` no longer re-walks `owner.ai` / `data.ai` /
`activityActorSlotId` for every shipLike each tick. It caches
`entity._nearWorkAlwaysAwake` and refreshes on the same volatile AI cadence
as `aiShips` (#56). Admit parity unchanged. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/stamp-near-work-awake-cache origin/master
git am design/program/vm-drop/stamp-near-work-awake-cache/patches/*.patch
node --test \
  test/pq-204-advanced-perf.test.mjs \
  test/activity-runtime.test.mjs \
  test/activity-classification.test.mjs \
  test/ceres-activity-runtime-lifecycle.test.mjs \
  test/entity-lifecycle-residency-recycle.test.mjs \
  test/core-coreSystem.review.test.mjs
```

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Prefer after #56/#59/#60. Stacks under registry.step / stampNearWorkBudget.
