# IMPORT — wreck-wisps-quiet-irrelevant-latch

## What

Portable CPU cut for quiet `_wreckWispsRelevant` under prepareFrame /
renderUpdate residual after #116. Two stacked pieces:

1. **Quiet empty-bucket latch** — after the first empty wrecks observe (type-
   filtered) + Map.clear while `entityIndexVersion` is trustworthy, skip
   player resolve + scan + clear until a wake fires.
2. **Dirty wake** — `entityIndexVersion` bump clears `_wreckWispsQuietIdle`
   so the next relevant probe rebuilds. Empty again re-latches after one
   observe. No-index (version null) refuses the latch so entityList fallback
   stays truthful.

Picture unchanged while no wrecks are live. Soft-GPU fps not claimed. Live
wisp emit path is unchanged.

## Live path (later, by owner)

- `src/render/vfx.js` (`_wreckWispsRelevant`, `_wreckWispsQuietMaybeAwake`,
  init flags, boundary resets)
- `test/wreck-wisps-quiet-irrelevant-latch.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/wreck-wisps-quiet-irrelevant-latch/patches/*.patch
```

Stacks under prepareFrame / renderUpdate / wreck-wisps residual. Clean on
stacked tip through #116. Sibling of #115 loot-magnet-quiet-empty-latch.

## Did not wire

- No master merge from this VM
- Soft-GPU fps not claimed
- Does not change wisp emit cadence, sprite look, or Picture contract
