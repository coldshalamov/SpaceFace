# IMPORT — flyby-focus-empty-quiet-latch

## What

Quiet latch for `flybyFocus.update` when no closing hostile/training pass
remains. Short-circuits the shipLike census (`pickFlybyTarget` kinematics);
wakes on membership, hostile spawn/tag (`entity:spawned` / `noteFlybyWake`),
or 0.5 s rescan. Soft-GPU fps not claimed. Picture unchanged.

## Apply

```bash
git am --ignore-space-change design/program/vm-drop/flyby-focus-empty-quiet-latch/patches/*.patch
```

Onto master tip `97c88f92b` (verified → `3f7c9bb28`).

## Claims

Fresh near-clock residual after #151 pirateParley. Prior pick-only probe was
deferred as thin abs (~0.55 µs); full `update` abs ~6.6–6.8 µs/call clears
that band. Outside held pirate*/bounty/salvage/sanctuary/cones/catch-nets /
lifetimeSweep / classify / sync / quiet-VFX / weapons residual deepen clusters.

## Owner-GPU

None required. Portable CPU microbench is the KPI.
