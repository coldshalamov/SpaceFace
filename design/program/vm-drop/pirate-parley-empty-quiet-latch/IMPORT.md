# IMPORT — pirate-parley-empty-quiet-latch

## What

Quiet latch for `pirateParley.update` when no toll-doctrine squads and no
unresolved parley records remain. Short-circuits the shipLike census
(`eligiblePlan` / `robberyEligibility` / Map alloc); wakes on membership,
toll spawn/tag (`entity:spawned` / `noteParleyWake`), or 0.5 s rescan.
Soft-GPU fps not claimed. Picture unchanged.

## Apply

```bash
git am --ignore-space-change design/program/vm-drop/pirate-parley-empty-quiet-latch/patches/*.patch
```

Onto master tip `97c88f92b` (verified → `14d1b9944`).

## Claims

Fresh combat residual after #150 pirateDisengage. Outside held lifetimeSweep /
classify / sync / weapons residual deepen / customs cones #145 / catch-nets #146 /
sanctuary #147 / salvage #148 / bountyHunt #149 / pirateDisengage #150 /
flybyFocus thin-abs clusters.

## Owner-GPU

None required. Portable CPU microbench is the KPI.
