# IMPORT — asteroid-field-interact-still-quiet-latch

## What it is

Still-player quiet latch for `_tickAsteroidFieldInteractions`. Skips the near
`queryAsteroidField` grid walk while the player is parked; wakes on
`asteroidField.version`, player move beyond ~15% of reach, player unpark
(speed), or a 0.5 s rescan. Different from the deferred empty latch — arms even
when the near-disc is non-empty. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/world.js` (`_tickAsteroidFieldInteractions` + bench toggles)
- `test/asteroid-field-interact-still-quiet-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Empty-far
asteroid-field latch remains deferred. Owner applies the patch from `patches/`
in numeric package order on master when importing. Stacks under world /
registry.step residual after #134 decode-runway latch.
