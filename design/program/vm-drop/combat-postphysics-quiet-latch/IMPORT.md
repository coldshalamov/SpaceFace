# IMPORT — combat-postphysics-quiet-latch

## What

Quiet skip for combat kernel `postPhysics` ensureCombatant +
syncCombatantBounds walk while the #154 prePhysics quiet latch is armed.
Attachments already empty-early-out; vitals clamp at mutation sites. Same wake
set as #154 (spawn/destroy, action, status, damage, repair, scaled physics,
0.5 s rescan). Soft-GPU fps not claimed. Picture unchanged.

## Apply

Requires **#154 combat-prephysics-quiet-latch** applied first (provides the
quiet latch this skip reads).

```bash
# after #154
git am --ignore-space-change design/program/vm-drop/combat-postphysics-quiet-latch/patches/*.patch
```

Onto master tip `97c88f92b` + #154 (verified chain → `649b3c51a`).

## Claims

Fresh combat residual after #154 prePhysics. Abs before ~11.4–11.8 µs/call
clears thin-abs band. Outside held barkDirector / flybyFocus / pirate* /
bounty / salvage / sanctuary / cones / catch-nets / lifetimeSweep / classify /
sync / quiet-VFX / weapons residual deepen / lawSecurity thin / ai isolation
clusters. Not a rediscovery of the stale empty-byId #87 claim folder
(`combat-postphysics-quiet-skip`) — that empty-attachment early-out is already
on master; this cut is the ensure+sync walk under the #154 latch.

## Owner-GPU

None required. Portable CPU microbench is the KPI.
