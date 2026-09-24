# IMPORT — persistent-beams-quiet-callsite-skip

## What it is

Quiet call-site skip for combat beams under prepareFrame / vfx.update: when
`PersistentCombatBeamPool.activeCount===0`, skip camDist hypot +
`resolveVfxAccessibilityProfile` + `worldSizeForPixels` (pool update already
early-outs after #91). Wake when upsert raises activeCount. Soft-GPU fps not
claimed.

## Live path that would receive it

- `src/render/vfx.js` (combat-beams branch inside `update`)
- `test/persistent-beams-quiet-callsite-skip.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
