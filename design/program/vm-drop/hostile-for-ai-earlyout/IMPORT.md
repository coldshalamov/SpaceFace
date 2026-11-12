# IMPORT — hostile-for-ai-earlyout

## What it is

Structural early-outs for `isHostileForAI`: drop `|| {}` allocs, null-safe ai reads, gate Ceres ambush on team+zone, gate faction first-fire on doctrine presence. **Not** a tick-Map pair cache (that miss measured ~0.58×).

## How to apply

```bash
git fetch origin
git checkout -B import/hostile-for-ai-earlyout origin/master
git am design/program/vm-drop/hostile-for-ai-earlyout/patches/*.patch
node --test \
  test/ai-engagement-authority.test.mjs \
  test/ai-engagement-sg03.test.mjs \
  test/hunter-origin.test.mjs
```

## Picture

Untouched.

## Apply order

Independent. Complements `stunt-flight-range-prefilter` (hot caller of this oracle).
