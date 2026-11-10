# IMPORT — optic-far-quiet-latch

## What it is

Quiet latch for `tickOpticFieldRocks` when no optic lattice sits in the decode
disc and no live optic body needs exit-shelve. Production used to run
`queryAsteroidField` (authored-prefetch disc) + entityList optic scan every
flight tick with nothing to promote or shelve. Latch after empty-interest
probe; wake on `asteroidField.version`, entity-index membership, player move
beyond ~15% of enter, or a 0.5 s rescan. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/world/asteroidField.js` (optic far quiet latch / bench toggles)
- `test/optic-far-quiet-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Stacks under world / tickOpticFieldRocks residual after #132 far-empty latch.
