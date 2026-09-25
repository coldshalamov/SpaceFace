# IMPORT — speed-lines-quiet-idle-latch

## What

Portable CPU cut for quiet `feel._updateSpeedLines` under prepareFrame
residual after #111. Two stacked pieces:

1. **Quiet empty latch** — after the first update with opacity≤0.01 +
   grain≤0.002 and no wake (speed / boost / physicsEarned), skip
   governed-combat resolve / speedLineDrive / region / publishVelocityLanguage
   / canvas work until a wake fires. Loading mode and photo-hide clear the
   latch so band-0 still publishes (background must never keep a stale
   flight record).
2. **Cheap dirty wake** — `_speedLinesQuietMaybeAwake` reads player
   speed against cached governed max × VL_WAKE_AT×0.85, plus
   `flags.boosting` / `_flightFrame.governor.physicsEarned`. False-wake
   falls through to one full update and re-latches when silent.

Picture unchanged while overlay already opacity 0. Soft-GPU fps not claimed.
Last band-0 velocity-language record is retained while latched (consumers
tolerate ≤1-frame staleness by contract).

## Live path (later, by owner)

- `src/render/feel.js`
- `test/speed-lines-quiet-idle-latch.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/speed-lines-quiet-idle-latch/patches/*.patch
```

Stacks under prepareFrame / feel speed-lines residual. Clean on stacked tip
through #111.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
