# IMPORT — gas-quiet-empty-latch

## What it is

Quiet empty latch for prepareFrame / vfx.update gas volumes. When
`GasVolumeField.liveCount===0` after the first empty observe, skip
`resolveVfxAccessibilityProfile` + `setAccessibility` + empty `update`
every tick. Wake on `liveCount>0` (emit). Soft-GPU fps not claimed.
Different angle from held gas-a11y profile-id retain (which still
resolved a11y every tick).

## Live path that would receive it

- `src/render/vfx.js` (gas quiet-empty latch / liveCount wake / boundary clear)
- `test/gas-quiet-empty-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
