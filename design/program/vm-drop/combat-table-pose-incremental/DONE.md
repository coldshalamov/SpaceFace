# DONE — combat-table-pose-incremental

## Summary

`packCombatTable` no longer rebuilds the entire combat SoA when only poses moved.
Quiet flight marks the player (and a few movers) POSE-dirty every tick; the old
path paid `rowById.clear()` + a full shipLike/projectile/wreck rewrite.
Pose-only dirty now refreshes matching rows in place. MEMBERSHIP still forces a
dense full rebuild.

## Before / after

### Offline microbench (primary — portable CPU)

8000 iters; quiet Ceres-shaped (120 ships + 4 wrecks; player ± movers pose-dirty):

| scenario | Before (full rebuild) | After (pose incremental) | speedup |
|---|---:|---:|---:|
| quiet-120ships-1mover | 52.5 ms | 11.0 ms | **~4.78×** |
| quiet-120ships-3movers | — | — | **~10×** (same bench family) |
| combat-80ships-3movers-6proj | — | — | **~1.72×** |

Membership add-row oracle: count +1 and new id indexed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924h` —
`registry.step` / `preStep` → `packCombatTable` every tick under player motion.

### Focused tests

`pq-204-advanced-perf` → **24/24** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-sim-incremental-combat-table-pack.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/combat-table-pose-incremental-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Stacks under registry.step residual after #39+#43+#49.

## Risks

- Pose-dirty ids not present in `rowById` (non-combat movers) are skipped — columns
  for combat rows stay as last packed.
- Callers that mutated combat-table columns expecting a full rewrite on every pose
  tick still see stable row indices across pose-only packs (same as still-reuse path).
- Missing `state.entities.get` falls through to the legacy full rebuild.
