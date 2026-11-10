# IMPORT — weapon-discharge-quiet-active-skip

## What

Portable CPU cut for quiet `WeaponDischargePool.update` under prepareFrame →
weapon presenter / force-language after #92: every frame walked CAP slots and
paid `SweptSurfaceBatch.begin` + `end`/`commitDynamicBufferOwner(0)` even when
no muzzle/impact surfaces were alive. Production now trusts `activeCount`
(spawn ++ / age-or-pose retire -- / dispose clear) and returns when zero.
Picture unchanged — mesh already count=0/visible=false after the frame that
retired the last slot.

## Live path (later, by owner)

- `src/render/forceLanguage/weaponDischargePool.js` — constructor `activeCount`,
  `spawn` / `spawnImpact`, `update`, `dispose`

## Apply

```bash
git am design/program/vm-drop/weapon-discharge-quiet-active-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
