# IMPORT — combat-table-pose-incremental

## What it is

`packCombatTable` pose-only incremental refresh. When the dirty journal has POSE
bits but no MEMBERSHIP, existing combat-table rows are updated in place instead
of `Map.clear` + rewriting every shipLike/projectile/wreck. Spawn/despawn still
full-rebuilds.

## How to apply

```bash
git fetch origin
git checkout -B import/combat-table-pose-incremental origin/master
git am design/program/vm-drop/combat-table-pose-incremental/patches/*.patch
node --test test/pq-204-advanced-perf.test.mjs
```

`combatTable.js` is CRLF on master; `git am` preserves it.

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Stacks under registry.step residual after #39+#43+#49.
