# IMPORT — far-empty-quiet-latch

## What it is

Quiet latch for `tickFarActors` when the far table is empty and a probe found
no S2/S3/S4 virt candidates. Production used to run `ensureActivityClassified`
+ shipLike/wreck shelve-candidate walk every flight tick with nothing to shelf.
Latch after empty+no-virt probe; wake on entity-index membership bump or a
0.5 s rescan. **Restore path always runs when far rows exist** (never skip
promote-on-approach). Soft-GPU fps not claimed.

## Live path that would receive it

- `src/world/farActorTable.js` (empty quiet latch / bench toggles)
- `test/far-empty-quiet-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Stacks under world / farActor residual after careful empty-far+no-virt hold
cleared by real `tickFarActors` A/B with restore preserved.
