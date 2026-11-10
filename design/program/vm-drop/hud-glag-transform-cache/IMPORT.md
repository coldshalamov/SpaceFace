# IMPORT — hud-glag-transform-cache

## What it is

`setLagTranslate` quantized early-out (hundredths of a px + suffix/plain) for optical
G-lag / recoil-bloom `translate3d` writes on reticle, lock ring, diamond, lead pip,
and target arcs. Settled non-zero lag skips `toFixed` + template alloc.

## How to apply

```bash
git fetch origin
git checkout -B import/hud-glag-transform-cache origin/master
git am design/program/vm-drop/hud-glag-transform-cache/patches/*.patch
node --test \
  test/hud-g-lag.test.mjs \
  test/hud-layout.test.mjs \
  test/j07-hud-contract.test.mjs \
  test/hud-flight-attention.test.mjs
```

## Picture

Untouched. Same `toFixed(2)` rounding → identical transform strings when written.

## Apply order

Independent. Clean on bare `origin/master`. Compatible with `hud-settext-cache` and
`hud-screen-transform-cache`.
