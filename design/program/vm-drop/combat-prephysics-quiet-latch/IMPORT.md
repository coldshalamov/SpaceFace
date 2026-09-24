# IMPORT — combat-prephysics-quiet-latch

## What

Quiet latch for combat kernel `prePhysics` (actions.update) when the living
combat roster is idle (no heat, statuses, pending transitions, or actions).
Short-circuits the ensureCombatant + status/pending/cool/sync entity walk;
wakes on spawn/destroy, action request, status schedule, damage, repair,
scaled physics response / sink, or 0.5 s rescan. Soft-GPU fps not claimed.
Picture unchanged.

## Apply

```bash
git am --ignore-space-change design/program/vm-drop/combat-prephysics-quiet-latch/patches/*.patch
```

Onto master tip `97c88f92b` (verified → `2f1968384`).

## Claims

Fresh actions / combat residual after #153 barkDirector. Abs before
~32.5–33.2 µs/call clears thin-abs band (updateDockRange / impulseCharges /
lawSecurity residual). Outside held barkDirector / flybyFocus / pirate* /
bounty / salvage / sanctuary / cones / catch-nets / lifetimeSweep / classify /
sync / quiet-VFX / weapons residual deepen / lawSecurity thin residual
clusters. Prefer this over ai/aiPorts isolation numbers (those were
ensureActivityClassified-inflated in tick++ microbenches).

## Owner-GPU

None required. Portable CPU microbench is the KPI.
