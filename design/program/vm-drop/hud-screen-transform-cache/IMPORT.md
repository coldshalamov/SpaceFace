# IMPORT — hud-screen-transform-cache

## What it is

Quantized numeric early-out on `setHudScreenTransform` (tenths of a px / deg).
Settled overlays skip `toFixed` + template alloc when the rounded pose is unchanged.

## How to apply

```bash
git fetch origin
git checkout -B import/hud-screen-transform-cache origin/master
git am design/program/vm-drop/hud-screen-transform-cache/patches/*.patch
node --test \
  test/hud-g-lag.test.mjs \
  test/hud-layout.test.mjs \
  test/hud-contact-roster-keyed-rows.test.mjs \
  test/hud-contact-roster-visibility.test.mjs \
  test/j07-hud-contract.test.mjs \
  test/hud-flight-attention.test.mjs
```

## Picture

Untouched. Same `toFixed(1)` rounding → identical transform strings when written.

## Apply order

Independent. Clean on bare `origin/master`. Compatible with `hud-settext-cache`.
