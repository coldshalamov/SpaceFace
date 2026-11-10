# IMPORT — classify-frame-quiet-retain

## What it is

Quiet full-frame retain for classifyWorld after #127 per-rock republish. When
the player is parked, glass/runway extents and pinFacts are unchanged, and every
entity in this tick's visit set still has a stable activity stamp + quantized
pose key, keep last tick's id lists / physics partitions / glass+runway sets /
counts and skip the clear+visit loop. Wake on player speed, origin/extents,
pinFacts._revision, per-entity pose, visit-set identity, scheduled wake,
pending grace, and first observation. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/world/activityRuntime.js` (frame quiet retain / arm / tryRetain)
- `test/classify-frame-quiet-retain.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Stacks after #127 `classify-rock-visit-quiet-retain`. Different from held
visit-loop cadence / stamp-reuse / rock-resolvePins ~1.09×.
