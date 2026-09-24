# IMPORT — classify-early-quiet-latch

## What it is

Early quiet latch for `classifyWorld` after #128 frame-retain already proved the
parked visit set stable. Skips extents / `rebuildPinFacts` / `selectClassifyEntities`
/ retain re-arm; pose-key verify wakes on rock teleports. Wakes on player move,
camera, membership, pin intent, maxSpeed, or a 0.5 s rescan. Soft-GPU fps not
claimed.

## Live path that would receive it

- `src/world/activityRuntime.js` (early quiet latch + bench toggles)
- `test/classify-early-quiet-latch.test.mjs`
- `test/classify-frame-quiet-retain.test.mjs` (accepts superseding early mode)

## How to apply

```bash
git am design/program/vm-drop/classify-early-quiet-latch/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm.
Held selectClassify id-replay / rock visit-context remain held (this is a
different angle). Owner applies the patch from `patches/` in numeric package
order on master when importing. Stacks under classifyWorld residual after #128.

## Perf-backlog

Hillclimb portable CPU cut (not a numbered PERF_TOP10 row). Soft-GPU fps
owner-verify only; not claimed here.
