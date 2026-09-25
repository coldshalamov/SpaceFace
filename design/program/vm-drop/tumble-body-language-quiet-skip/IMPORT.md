# IMPORT — tumble-body-language-quiet-skip

## What

Portable CPU cut for quiet `vfx._updateTumbleBodyLanguageVfx` under prepareFrame
residual after #106. Two stacked pieces:

1. **pitchPresentationEpoch** — `updateShipPitchPresentation` bumps a module
   epoch whenever any craft writes active tumble / thrown-trail / recover
   body-language. This is the safe dirty signal: tumble can start without an
   `entityIndexVersion` bump.
2. **Quiet empty latch** — after first empty shipLike walk + empty cadence map,
   skip the walk until the epoch advances. Boundary events (`sector:enter` /
   `game:newGame` / `save:loaded`) and leaving flight clear the latch. A
   non-empty cadence map also forces a walk so death/inactivity still retires
   stale keys.

False-wake (epoch bump without lasting thrash) falls through to one walk and
re-latches. Picture unchanged while no tumble/thrown body-language. Soft-GPU
fps not claimed.

## Live path (later, by owner)

- `src/render/shipPitchPresentation.js`
- `src/render/vfx.js`

## Apply

```bash
git am design/program/vm-drop/tumble-body-language-quiet-skip/patches/*.patch
```

Stacks under prepareFrame / vfx tumble body-language residual. Clean on
stacked tip through #106.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
