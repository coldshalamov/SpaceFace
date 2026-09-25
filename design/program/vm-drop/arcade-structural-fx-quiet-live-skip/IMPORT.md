# IMPORT — arcade-structural-fx-quiet-live-skip

## What

Portable CPU cut for quiet `ArcadeStructuralFx.update` / `StructuralPool.update`
under prepareFrame → VFX: skip the 272-slot capacity walk when `live===0`.
Composite early-out when every pool is idle. Picture unchanged —
`mesh.visible` was already gated on `live > 0`.

## Live path (later, by owner)

- `src/render/combat/arcadeStructuralFx.js` — `StructuralPool.update`, `ArcadeStructuralFx.update`

## Apply

```bash
git am design/program/vm-drop/arcade-structural-fx-quiet-live-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
