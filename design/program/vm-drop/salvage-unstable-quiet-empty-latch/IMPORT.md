# IMPORT — salvage-unstable-quiet-empty-latch

## What

Quiet latch for `salvageActions.update` when no live unstable reactors remain.
Also prefers the wrecks entity-index bucket for the live census (replaces the
fat `entities.values()` walk). Soft-GPU fps not claimed. Picture unchanged.

## Apply

```bash
git am --ignore-space-change design/program/vm-drop/salvage-unstable-quiet-empty-latch/patches/*.patch
```

Onto master tip `97c88f92b` (verified → `813d3160f`).

## Claims

Fresh salvage residual after #146 catch-nets / #147 sanctuary. Outside held
lifetimeSweep / classify / sync / weapons residual / cones / wanted deepen
clusters.

## Owner-GPU

None required. Portable CPU microbench is the KPI.
