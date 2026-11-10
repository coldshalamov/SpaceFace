# IMPORT — decode-runway-empty-far-quiet-latch

## What it is

Quiet latch for `requestDecodeRunwayPromote` when the farActors table is empty,
plus an empty-row early-return in `queryFarActors` (far-query-row-scan only
helped `rows.length > 0`; empty tables still walked the wide decode disc grid).
Latch after empty probe; wake on `farActors.version`, player move beyond ~15% of
decode enter, or a 0.5 s rescan. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/world/farActorTable.js` (empty-row early-return + bench toggles)
- `src/world/presentationSources.js` (decode-runway empty-far quiet latch)
- `test/decode-runway-empty-far-quiet-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Stacks under world / requestDecodeRunwayPromote residual after #133 optic latch.
