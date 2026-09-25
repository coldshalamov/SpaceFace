# IMPORT — energy-bolt-quiet-begin-commit

## What

Portable CPU cut for quiet `EnergyBoltPool.beginFrame` + `commit` under
WeaponVfxPresenter / prepareFrame residual after #101. After the first empty
publish (`writeCount===0`, `mesh.count===0`, invisible), defer beginFrame
Map.clear + uniform writes until `writeBolt` wakes the pool; quiet commit
drops the deferred begin. Picture unchanged when idle. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/weapons/energyBoltPool.js`

## Apply

```bash
git am design/program/vm-drop/energy-bolt-quiet-begin-commit/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
