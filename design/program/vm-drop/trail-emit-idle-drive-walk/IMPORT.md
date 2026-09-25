# IMPORT — trail-emit-idle-drive-walk

## What

Portable CPU cut for quiet `vfx._emitTrails` under prepareFrame residual
after #107. Two stacked pieces:

1. **Quiet empty latch** — after first emit tick with zero engine-trail /
   damage-smoke work, skip the shipLike `_engineDriveFor` walk until a cheap
   maybe-awake fires. Boundary events (`sector:enter` / `game:newGame` /
   `save:loaded`) clear the latch. Leaving an explicit non-flight mode also
   clears it (harnesses without `mode` still emit).
2. **Cheap dirty wake** — `_trailEmitQuietMaybeAwake` checks
   `entityIndexVersion`, player input/throttle/boost/actuators/speed-proxy,
   then NPC candidates with the same cheap probes (no full `_engineDriveFor`).
   False-wake falls through to one emit walk and re-latches.
3. **Empty ribbon share** — `_updateRibbonTrails` skips its candidate walk
   while emit is quiet-latched and `_ribbonTrails.size === 0`. Retiring wakes
   keep running while the map is non-empty (INF-047 fade).

Picture unchanged while no ship is thrusting/coasting above the idle band.
Soft-GPU fps not claimed.

## Live path (later, by owner)

- `src/render/vfx.js`

## Apply

```bash
git am design/program/vm-drop/trail-emit-idle-drive-walk/patches/*.patch
```

Stacks under prepareFrame / vfx trail emit residual. Clean on stacked tip
through #107.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
