# IMPORT — stunt-projectile-evidence-quiet-iter

1. Apply `patches/0001-perf-combat-quiet-iter-sampleProjectileEvidence.patch` on
   master tip through #68 (or current stacked hillclimb tip).
2. Confirm `sampleProjectileEvidence`:
   - prefers `state.entityIndex.collidables` when `__spacefaceEntityIndexV1` ready
   - ages bags with `for…in` (no `Object.entries`)
   - cadences surfaceHistory only while shots+contacts+surfaceHistory are empty
   - exposes `setProjectileEvidenceQuietIterForBench(false)` for A/B
3. Run: `node --test test/stunt-projectile-evidence-quiet-iter.test.mjs test/projectile-surface-distance-first.test.mjs test/pq146-projectiles.test.mjs test/stunt-combo.test.mjs test/stunt-taxonomy.test.mjs test/pq-155-03-stunts-pay.test.mjs`
4. Optional: `node design/program/vm-drop/stunt-projectile-evidence-quiet-iter/artifacts/stunt-projectile-evidence-quiet-iter-microbench.mjs`

Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`.
