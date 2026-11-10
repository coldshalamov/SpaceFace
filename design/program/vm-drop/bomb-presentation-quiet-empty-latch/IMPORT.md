# IMPORT — bomb-presentation-quiet-empty-latch

## What

Portable CPU cut for quiet `BombPresentationBatch.update` under
prepareFrame / renderUpdate / ordnance residual after #113. Two stacked
pieces:

1. **Quiet empty latch** — after the first update with `count===0` and a
   trustworthy `entityIndexVersion`, skip frustum rebuild / a11y /
   source walk / setDrawRange(0) until a wake fires.
2. **Cheap dirty wake** — `_quietMaybeAwake` returns true when
   `entityIndexVersion` is null (refuse latch / entityList fallback) or
   differs from the latched version. False-wake falls through to one
   full update and re-latches when empty.

Picture unchanged while mesh already count=0/visible=false. Soft-GPU fps
not claimed. Lazy owner creation (no baseline cost before first bomb)
unchanged.

## Live path (later, by owner)

- `src/render/bombPresentation.js`
- `test/bomb-presentation-quiet-empty-latch.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/bomb-presentation-quiet-empty-latch/patches/*.patch
```

Stacks under prepareFrame / renderUpdate / ordnance residual. Clean on
stacked tip through #113.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
