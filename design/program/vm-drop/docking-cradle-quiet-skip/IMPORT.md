# IMPORT — docking-cradle-quiet-skip

## What

Portable CPU cut for quiet `vfx._updateDockingCradle` under prepareFrame
residual after #108. Two stacked pieces:

1. **Quiet empty latch** — after the cradle fully fades (`visible01 ≤ 0.004`)
   and geometry indexCount is 0, skip proxy scan / cradle update / geometry
   write / a11y resolve until a cheap maybe-awake fires. Boundary resets
   (`_resetDockingCradle` via `sector:enter` / `game:newGame` / `save:loaded`)
   clear the latch.
2. **Cheap dirty wake** — `_dockingCradleQuietMaybeAwake` checks
   `state.dockingCorridor` phase ≠ `none` with a berth present. False-wake
   falls through to one full update and re-latches when faded.

Picture unchanged while no bay is engaged/previewing. Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/vfx.js`
- `test/docking-cradle-quiet-skip.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/docking-cradle-quiet-skip/patches/*.patch
```

Stacks under prepareFrame / vfx docking cradle residual. Clean on stacked tip
through #108.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
