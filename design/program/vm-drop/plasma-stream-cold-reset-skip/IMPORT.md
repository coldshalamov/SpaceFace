# IMPORT — plasma-stream-cold-reset-skip

## What

Portable CPU cut for quiet `PlasmaStreamSystem.update` under prepareFrame →
energy / thruster after #93: already-cold `!commanded` ticks still ran
`integrateDriveEnvelope`, boost blend, socket math, trail live walk, then
`reset()` every frame. Production early-outs when nothing is commanded and the
system is already dark (`!_active && !sampler.hasLive && !group.visible`). The
existing cold gate still runs `reset()` once when first going dark. Picture
unchanged.

## Live path (later, by owner)

- `src/render/thruster/systems/plasmaStream.js` — `update` early cold skip

## Apply

```bash
git am design/program/vm-drop/plasma-stream-cold-reset-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
