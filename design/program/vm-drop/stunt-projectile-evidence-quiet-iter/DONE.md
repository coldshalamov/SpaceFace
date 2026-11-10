# DONE — stunt-projectile-evidence-quiet-iter

## Summary

Quiet `registry.step` → `sampleProjectileEvidence` residual after #36+#35:
`entities.values()` full-map walk every tick for ≤8 near reflective plates, plus
`Object.entries` aging on four bags (alloc even when empty).

Production now walks the `collidables` index lane, ages with `for…in`, and
cadences cold surfaceHistory (even ticks only while shots+contacts+history
empty). Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

400 entities × 4000 ticks; 0 reflective plates (quiet Ceres-shaped). Isolated
Node child processes. Before = bench toggle off (values walk every tick);
after = quiet-iter on.

| | Before | After | |
|---|---:|---:|---|
| wall (median) | see microbench JSON | see microbench JSON | **~1.77×** |

Floor minSpeedup **≥1.64×** across seven isolated pairs (primary n=400 plates=0).
With 2 near plates (history hot → no cadence): still **~1.8×** from lane+for-in.
Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `sampleProjectileEvidence` ~56 self under `registry.step`.

### Focused tests

`stunt-projectile-evidence-quiet-iter` + `projectile-surface-distance-first` +
`pq146-projectiles` + `stunt-combo` + `stunt-taxonomy` + `pq-155-03-stunts-pay`
→ **30/30** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-combat-quiet-iter-sampleProjectileEvidence.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/stunt-projectile-evidence-quiet-iter-microbench.json`
- Tests: `artifacts/focused-tests-stunt-projectile-evidence-quiet-iter.log`

## Apply order

After `projectile-surface-distance-first` (#36) and `prune-evidence-cadence` (#35).
Stacks under registry.step residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#68.

## Risks

- Cold surfaceHistory may lag one tick (~16 ms) before the first plate is
  recorded while quiet (no shots/contacts). Emission snapshots history at fire
  time; the 120-tick solution window tolerates it.
- Non-colliding reflective props were already excluded by the `collides` gate;
  the collidables lane preserves that contract.
- Bench-only `setProjectileEvidenceQuietIterForBench` must stay default-on in prod.
