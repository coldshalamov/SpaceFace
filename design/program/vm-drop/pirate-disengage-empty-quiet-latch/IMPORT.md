# IMPORT — pirate-disengage-empty-quiet-latch

## What

Quiet latch for `pirateDisengage.update` when no active pirate/hostile
combatants remain. Short-circuits the dual shipLike census
(`lawfulPatrols` + `combatantSquads` / `isActiveCombatant`); wakes on
membership, combatant spawn/tag (`entity:spawned` / `noteCombatantWake`),
or 0.5 s rescan. Soft-GPU fps not claimed. Picture unchanged.

## Apply

```bash
git am --ignore-space-change design/program/vm-drop/pirate-disengage-empty-quiet-latch/patches/*.patch
```

Onto master tip `97c88f92b` (verified → `8dbf201ee`).

## Claims

Fresh combat residual after #149 bountyHunt. Outside held lifetimeSweep /
classify / sync / weapons residual deepen / cones #145 / catch-nets #146 /
sanctuary #147 / salvage #148 / bountyHunt #149 / flybyFocus thin-abs clusters.

## Owner-GPU

None required. Portable CPU microbench is the KPI.
