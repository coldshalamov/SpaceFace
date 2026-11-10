# IMPORT — classify-rock-visit-quiet-retain

## What it is

Quiet retain for classifyWorld asteroid/payload visits while the player is
parked. After the first observe with stable glass/runway extents and pinFacts,
republish prior stamps into this tick's id lists without re-running
classifyActivity + applyStamp + signature. Wake on player speed, origin/extents,
pinFacts._revision, per-rock pose, scheduled wake, pending grace, and first
observation. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/world/activityRuntime.js` (rock-visit quiet retain / arm / publish)
- `test/classify-rock-visit-quiet-retain.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Different angle from held rock-resolvePins / rock-visit context ~1.09×.
