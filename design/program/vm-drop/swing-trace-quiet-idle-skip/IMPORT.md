# IMPORT — swing-trace-quiet-idle-skip

## What

Portable CPU cut for quiet `vfx._updateMasslineSwingTrace` under prepareFrame
residual after #110. Two stacked pieces:

1. **Quiet empty latch** — after the first update with fade≤0 + count===0 and
   no live player/remote tether, skip tether resolve / a11y /
   `writeMasslineSwingTraceGeometry` / mesh republish until a wake fires.
   Boundary clears (`_resetMasslineSwingTrace` via `sector:enter` /
   `game:newGame` / `save:loaded`) reset the latch.
2. **Cheap dirty wake** — `_swingTraceQuietMaybeAwake` reads player
   `tether.active` / `remoteMassline.active` (+ ids). False-wake falls
   through to one full update and re-latches when empty.

Picture unchanged while no swing arc is live. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/vfx.js`
- `test/swing-trace-quiet-idle-skip.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/swing-trace-quiet-idle-skip/patches/*.patch
```

Stacks under prepareFrame / vfx massline swing-trace residual. Clean on
stacked tip through #110.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
