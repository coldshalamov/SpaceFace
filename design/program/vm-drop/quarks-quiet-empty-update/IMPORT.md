# IMPORT — quarks-quiet-empty-update

## What

Portable CPU cut for quiet `QuarksVfxSystem.update` under WeaponVfxPresenter /
prepareFrame residual after #100. Trust `_quietEmpty` after the first empty
`particleNum===0` observe across all 11 three.quarks families; skip
`BatchedParticleRenderer.update`. Spawn / `_spawnCapped` clear the latch;
`reset()` sets it. Picture unchanged when idle. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/vfx/quarksSystem.js`

## Apply

```bash
git am design/program/vm-drop/quarks-quiet-empty-update/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
