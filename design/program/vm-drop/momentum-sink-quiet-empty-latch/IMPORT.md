# IMPORT — momentum-sink-quiet-empty-latch

## What

Portable CPU cut for quiet `_updateMomentumSinkPresentation` under prepareFrame /
renderUpdate residual after #117. Two stacked pieces:

1. **Quiet empty-bag latch** — after the first empty combat.entities collect
   (no live MOMENTUM_SINK statuses) while `statusNextPendingSeq` is trustworthy,
   skip the for-in + status probes until a wake fires.
2. **Dirty wake** — `statusNextPendingSeq` bump clears `_momentumSinkQuietEmpty`
   so the next cadence pull rebuilds. Empty again re-latches after one collect.
   Missing seq refuses the latch so untrusted combat bags stay truthful.

Picture unchanged while no sink cues are live. Soft-GPU fps not claimed. Live
emit path is unchanged.

## Live path (later, by owner)

- `src/render/vfx.js` (`_updateMomentumSinkPresentation`, `_resetMomentumSinkPresentation`, init flags)
- `test/momentum-sink-quiet-empty-latch.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/momentum-sink-quiet-empty-latch/patches/*.patch
```

Stacks under prepareFrame / renderUpdate / momentum-sink residual. Clean on
stacked tip through #117. Sibling of #106 status-attached / #117 wreck-wisps
version-wake latches.

## Did not wire

- No master merge from this VM
- Soft-GPU fps not claimed
- Does not change sink cue look, cadence Hz, or Picture contract
