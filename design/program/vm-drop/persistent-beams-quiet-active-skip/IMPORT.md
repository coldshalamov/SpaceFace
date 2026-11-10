# IMPORT — persistent-beams-quiet-active-skip

## What

Portable CPU cut for quiet `PersistentCombatBeamPool.update` under prepareFrame
→ VFX after #89: skip the 16-slot capacity walk and shader uniform refresh when
`activeCount===0`. Picture unchanged — `group.visible` already false after last
release.

## Live path (later, by owner)

- `src/render/combat/persistentBeams.js` — `PersistentCombatBeamPool.update`

## Apply

```bash
git am design/program/vm-drop/persistent-beams-quiet-active-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
