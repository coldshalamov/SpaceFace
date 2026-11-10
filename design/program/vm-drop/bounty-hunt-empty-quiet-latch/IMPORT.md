# IMPORT — bounty-hunt-empty-quiet-latch

## What

Quiet latch for `bountyHunt.update` when no live bounty hunters remain.
Short-circuits the shipLike `isBountyHunter` / normalize / trick census;
wakes on membership, hunter spawn/tag (`entity:spawned` / `noteHunterWake`),
or 0.5 s rescan. Soft-GPU fps not claimed. Picture unchanged.

## Apply

```bash
git am --ignore-space-change design/program/vm-drop/bounty-hunt-empty-quiet-latch/patches/*.patch
```

Onto master tip `97c88f92b` (verified → `93dc4db5e`).

## Claims

Fresh law/wanted-adjacent residual after #148 salvage. Outside held
lifetimeSweep / classify / sync / weapons residual deepen / cones #145 /
catch-nets #146 / sanctuary #147 / salvage #148 / flybyFocus thin-abs clusters.

## Owner-GPU

None required. Portable CPU microbench is the KPI.
