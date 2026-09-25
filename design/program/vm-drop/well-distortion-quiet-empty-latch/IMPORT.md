# IMPORT — well-distortion-quiet-empty-latch

## What it is

Quiet-latch for `_syncWellDistortion` on empty `fields.active`: skip a11y resolve +
CAP slot zero + DistortionField.update (uTime write) after the first empty sync.
Wake on `fields.active` ref or length. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/render/weapons/presenter.js` (`_syncWellDistortion`, ctor, dispose)
- `test/well-distortion-quiet-empty-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies the
patch from `patches/` in numeric package order on master when importing.
