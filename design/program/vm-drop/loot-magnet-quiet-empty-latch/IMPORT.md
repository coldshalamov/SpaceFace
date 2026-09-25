# IMPORT — loot-magnet-quiet-empty-latch

## What

Portable CPU cut for quiet `_lootMagnetRelevant` under prepareFrame /
renderUpdate residual after #114. Two stacked pieces:

1. **Quiet empty-bucket latch** — after the first observe with empty
   `pickups` + `payloads` indexes and a trustworthy `entityIndexVersion`,
   skip player resolve + dual `indexedTypeScan` until a wake fires.
2. **Cheap dirty wake** — `_lootMagnetQuietMaybeAwake` returns true when
   `entityIndexVersion` is null (refuse latch / entityList fallback) or
   differs from the latched version. False-wake falls through to one full
   relevant probe and re-latches when empty.

Picture unchanged while no magnet trails are live. Soft-GPU fps not
claimed. Non-empty bucket relevance walk (homing speed / table draw) is
unchanged.

## Live path (later, by owner)

- `src/render/vfx.js` (`_lootMagnetRelevant`, `_lootMagnetQuietMaybeAwake`)
- `test/loot-magnet-quiet-empty-latch.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/loot-magnet-quiet-empty-latch/patches/*.patch
```

Stacks under prepareFrame / renderUpdate / loot-magnet residual. Clean on
stacked tip through #114.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
