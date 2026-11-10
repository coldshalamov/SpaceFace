# IMPORT — hull-scorch-quiet-live-skip

## What

Portable CPU cut for quiet `HullScorchPool.update` under prepareFrame →
WeaponVfxPresenter after #94. Trust `live` (spawn ++ / retire --);
picture unchanged when idle. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/weapons/contactMarks.js`

## Apply

```bash
git am design/program/vm-drop/hull-scorch-quiet-live-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
