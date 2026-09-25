# IMPORT — energy-quiet-relevant-skip

## What

Portable CPU cut for quiet `vfx._updateEnergy` under prepareFrame residual
after #103. While `_energyQuietHidden`, skip full `_energyPlumeRelevant`
(player `_engineDriveFor` + trail-candidate walk) unless cheap
`_energyQuietMaybeAwake` (input / actuators / throttle / boost /
speed-proxy) or massline wake. False-wake falls through to full relevant;
hide latch still early-returns. Picture unchanged while quiet. Soft-GPU
fps not claimed.

## Live path (later, by owner)

- `src/render/vfx.js`

## Apply

```bash
git am design/program/vm-drop/energy-quiet-relevant-skip/patches/*.patch
```

Prefer apply after #103 (uses `_energyQuietHidden`).

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
