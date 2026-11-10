# IMPORT — pending-detonations-quiet-empty-latch

## What it is

Quiet empty latch for prepareFrame / vfx `_updatePendingDetonations`. When
the 12-slot pending-detonation pool is empty after the first empty observe,
skip the active walk every tick. Wake on `_scheduleDetonation` (and
`_resetPendingDetonations`). Soft-GPU fps not claimed.

## Live path that would receive it

- `src/render/vfx.js` (pending-detonations quiet-empty latch / schedule wake / reset clear)
- `test/pending-detonations-quiet-empty-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
