# IMPORT — law-heat-telegraph-quiet-skip

## What

Portable CPU cut for quiet `vfx._updateLawHeatTelegraph` under prepareFrame
residual after #109. Two stacked pieces:

1. **Quiet empty latch** — after the first update with `live === 0`, skip
   a11y resolve / controller.update / stamp() alloc / light-pool
   find/release until a wake fires. Boundary clears
   (`_clearLawHeatTelegraph` via `sector:enter` / `sector:exit` /
   `game:newGame` / `save:loaded`) reset the latch.
2. **Cheap dirty wake** — `_onLawHeatScan` / `_onLawHeatChanged` bump
   `_lawHeatWakeSeq` and clear the latch so the next update republishes.
   False-wake falls through to one full update and re-latches when empty.

Picture unchanged while no law/heat cue is live. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/vfx.js`
- `test/law-heat-telegraph-quiet-skip.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/law-heat-telegraph-quiet-skip/patches/*.patch
```

Stacks under prepareFrame / vfx law-heat residual. Clean on stacked tip
through #109.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
