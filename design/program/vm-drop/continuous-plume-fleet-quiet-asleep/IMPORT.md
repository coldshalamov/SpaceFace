# IMPORT — continuous-plume-fleet-quiet-asleep

## What

Portable CPU cut for quiet `FamilyProductionFleet.endFrame` sleep path under
prepareFrame / thruster residual after #99. Trust `_familyQuietAsleep` after the
first empty sleep publish (6 engine families × 5 layers); also quiet-skip
`ContinuousPlumeSystem.update` / `endUpdate` when `activeCount===0` and already
empty. Picture unchanged when idle. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/thruster/systems/familyFleet.js`
- `src/render/thruster/systems/continuousPlume.js`

## Apply

```bash
git am design/program/vm-drop/continuous-plume-fleet-quiet-asleep/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
