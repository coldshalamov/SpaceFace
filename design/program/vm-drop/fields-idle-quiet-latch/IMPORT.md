# IMPORT — fields-idle-quiet-latch

## What it is

Quiet latch for `fields.update` idle path when the kernel is empty and no awake
NPC field roles exist. Production used to run cadenced `_syncNpcFields`
discover + empty `_publish` every flight tick even with no cone/deployed/
anchored/npc/skim interest. Latch after interest scan; wake on entity-index
membership bump, 0.5 s rescan, or leaving idle. Awake scavenger/sweeper/salvor
roles refuse the latch so cadenced cones still arm. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/fields.js` (idle quiet latch / bench toggles)
- `test/fields-idle-quiet-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Stacks under registry.step residual (fields under quiet queue after
fields-npc-plan-cadence).
