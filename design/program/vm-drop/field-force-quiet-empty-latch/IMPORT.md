# IMPORT — field-force-quiet-empty-latch

## What

Portable CPU cut for quiet `FieldForcePresentation.update` under prepareFrame
/ vfx residual after #112. Two stacked pieces:

1. **Quiet empty latch** — after the first update with no `fields.active`, no
   residual releasing slots, and `batch.count===0`, skip frustum rebuild /
   slot reserved walk / batch.begin/end commit(0) until a wake fires.
2. **Cheap dirty wake** — `_quietMaybeAwake` returns true when
   `fields.active.length>0` or any presentation slot still has `id!==null`
   (release residue must keep updating). False-wake falls through to one
   full update and re-latches when empty.

Picture unchanged while mesh already count=0/visible=false. Soft-GPU fps
not claimed. Release lifecycle still runs until slots clear (does not sleep
during residue).

## Live path (later, by owner)

- `src/render/forceLanguage/fieldForcePresentation.js`
- `test/field-force-quiet-empty-latch.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/field-force-quiet-empty-latch/patches/*.patch
```

Stacks under prepareFrame / vfx field-force residual. Clean on stacked tip
through #112.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
