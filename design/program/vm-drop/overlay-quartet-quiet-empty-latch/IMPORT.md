# IMPORT — overlay-quartet-quiet-empty-latch

## What it is

Quiet empty latch for the prepareFrame / vfx.update overlay quartet
(wanted search ring, customs weir lines, route ribbon, payload release
ghost). When all four are inactive, skip the four truth readers + mesh
hide writes every tick after the first empty observe. Wake on cheap
identity/ref snapshot: heatZone active/level/radius, customsWeir ref,
nav/autopilot/waypoint/target refs, tether phase/targetId,
payloadReleaseGhost ref. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/render/vfx.js` (overlay-quartet quiet maybe-awake / latch / update gate)
- `test/overlay-quartet-quiet-empty-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
