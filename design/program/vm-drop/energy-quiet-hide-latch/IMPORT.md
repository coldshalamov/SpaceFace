# IMPORT — energy-quiet-hide-latch

## What

Portable CPU cut for quiet `vfx._hideEnergyPlumes` under prepareFrame /
`_updateEnergy` residual after #102. After the first cold publish
(plasma/retro/fleet.reset + ownership clear), latch `_energyQuietHidden`
and skip subsequent idle hides until plume or massline wake (also cleared
on init/dispose/boundary reset). Picture unchanged when idle. Soft-GPU fps
not claimed.

## Live path (later, by owner)

- `src/render/vfx.js`

## Apply

```bash
git am design/program/vm-drop/energy-quiet-hide-latch/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
