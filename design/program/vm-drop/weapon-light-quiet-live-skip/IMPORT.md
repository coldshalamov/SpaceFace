# IMPORT — weapon-light-quiet-live-skip

## What

Portable CPU cut for quiet `WeaponLightPool.update` under prepareFrame /
WeaponVfxPresenter after #98. Trust `_live` (spawn ++ when taking a dead slot;
retire --); picture unchanged when idle. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/weapons/weaponLights.js`

## Apply

```bash
git am design/program/vm-drop/weapon-light-quiet-live-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
