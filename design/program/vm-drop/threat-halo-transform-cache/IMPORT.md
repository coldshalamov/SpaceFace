# IMPORT — threat-halo-transform-cache

## What it is

Quantized numeric early-out on threat-halo `setHudTransform` (tenths of a px).
Settled edge chevrons skip `toFixed` + template alloc when the rounded pose is unchanged.

## How to apply

```bash
git fetch origin
git checkout -B import/threat-halo-transform-cache origin/master
git am design/program/vm-drop/threat-halo-transform-cache/patches/*.patch
node --test test/threat-halo-urgency.test.mjs test/wave-g4-offscreen-threat.test.mjs
```

## Picture

Untouched. Same `toFixed(1)` rounding → identical transform strings when written.

## Apply order

Independent. Clean on bare `origin/master`. Sibling of `hud-screen-transform-cache`
(same pattern, different owner file).
