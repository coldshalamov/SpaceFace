# IMPORT — projectile-trails-quiet-empty-latch

## What it is

Quiet empty latch for projectile trails under prepareFrame / vfx.update: when
the projectile index is empty, skip `indexedTypeScan` + candidate cache check
+ `resetProjectileTrailDiag` every tick after the first empty observe. Wake on
`entityIndexVersion` bump or `_markProjectileCacheDirty` (spawn path). Soft-GPU
fps not claimed.

## Live path that would receive it

- `src/render/vfx.js` (`_projectileTrailsRelevant` / quiet maybe-awake)
- `test/projectile-trails-quiet-empty-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
