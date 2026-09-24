# IMPORT — distortion-field-quiet-live-skip

## What

Portable CPU cut for quiet `DistortionField.update` under prepareFrame →
WeaponVfxPresenter after #95. Trust `live` (spawn ++ / retire --);
picture unchanged when idle. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/weapons/distortionField.js (+ presenter well sync)`

## Apply

```bash
git am design/program/vm-drop/distortion-field-quiet-live-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
