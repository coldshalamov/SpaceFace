# IMPORT — countermeasures-quiet-empty-latch

## What it is

Quiet latch for `countermeasures.update` when the live roster has no
countermeasure / PDS interest. Production used to walk `index.ships` four times
every flight tick (cooldown tick, AI auto-deploy, active-effect apply, PDS
servo) even when nobody carried a CM/PDS module and no live `data.cm` /
`data.pds` timers existed. Latch after one interest scan; wake on deploy input
edge, entity-index membership bump, live cm/pds timers, or a 0.5 s fittings
rescan. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/countermeasures.js` (quiet latch / bench toggles)
- `test/countermeasures-quiet-empty-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Stacks under registry.step residual (countermeasures under quiet queue).
