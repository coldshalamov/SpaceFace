# IMPORT — bombs-empty-quiet-latch

## What it is

Quiet latch for `bombs.update` when the ready typed `entityIndex.bombs` bucket
is empty. Production used to run `ensureRuntime` rack normalize + collect/sort
+ empty tick every flight tick with no live bombs. Latch after empty probe;
wake on drop/cycle/detonate edges, entity-index membership bump, or a 0.5 s
rescan. Without a versioned bombs bucket the latch refuses so the entityList
fallback stays live. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/bombs.js` (empty quiet latch / bench toggles)
- `test/bombs-empty-quiet-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Stacks under registry.step residual (bombs under quiet queue; mines already
empty-early-out).
