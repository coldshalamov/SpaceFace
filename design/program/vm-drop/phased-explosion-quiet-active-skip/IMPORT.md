# IMPORT — phased-explosion-quiet-active-skip

## What

Portable CPU cut for quiet `PhasedExplosionLifecycle.update` under prepareFrame
→ VFX after #89: skip the 40-slot capacity walk when `activeCount===0`. Picture
unchanged — `emit` never runs for inactive entries.

## Live path (later, by owner)

- `src/render/combat/phasedExplosions.js` — `PhasedExplosionLifecycle.update`

## Apply

```bash
git am design/program/vm-drop/phased-explosion-quiet-active-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
