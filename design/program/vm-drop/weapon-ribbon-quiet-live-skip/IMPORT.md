# IMPORT — weapon-ribbon-quiet-live-skip

## What

Portable CPU cut for quiet `WeaponRibbonPool.update` under prepareFrame →
WeaponVfxPresenter after #96. Trust `live` (spawn ++ / retire --);
picture unchanged when idle. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/weapons/ribbonPool.js`

## Apply

```bash
git am design/program/vm-drop/weapon-ribbon-quiet-live-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
