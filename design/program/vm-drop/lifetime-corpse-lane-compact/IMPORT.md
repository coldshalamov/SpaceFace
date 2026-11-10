# IMPORT — lifetime-corpse-lane-compact

## What

Portable CPU cut for quiet `lifetimeSweep` corpse compact under `registry.step`
after #87: skip the fat asteroid/station `entityList` reverse walk on quiet
ticks. Always scan death-capable typed lanes (movables, damageables, ordnance
leftovers). Fail open to the full list when `DIRTY.MEMBERSHIP` is set or the
entity index is not ready. `removeEntity`, mining asteroid destroy, and field
emitter expiry mark MEMBERSHIP so static/beacon/asteroid deaths still compact.

## Live path (later, by owner)

- `src/core/coreSystem.js` — `lifetimeSweep`, `_compactDeadEntities`, `_compactDeadLane`, `removeEntity`
- `src/systems/mining.js` — asteroid destroy `markDirty(MEMBERSHIP)`
- `src/systems/fields.js` — field emitter expiry/retire/clear `markDirty(MEMBERSHIP)`

## Apply

```bash
git am design/program/vm-drop/lifetime-corpse-lane-compact/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
