# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`abcccfd87`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #61; +#62 @ `fc9ff75bb`.

Quiet profile `settled-45s-stacked-20260924w` (Picture ON, soft-GPU,
post-#57 tip) still cites ranking; #62 cuts classifyWorld shouldSyncPhysics
partition re-entry.

**Shipped this pass:**
- **#62 `classify-physics-partition-cache`** — portable quiet classify physics
  partition cache **~4.1×** median (180 mixed × 80k; floor minSpeedup ≥3.70×
  across five isolated runs; admit + production parity); focused suites
  **74/74**.

**Holds / misses:** lifetimeSweep dirty-publish isMovableEntity trust (thin
~1.51–1.69×; full-pole ~1.08× — drop), lifetimeSweep pose-publish-list(~1.00×),
classify physics-partition fuse-only (~1.44×), physics S1-idle,
spatial-hash@600, visit-loop cadence, stamp-reuse/inert/near-disc,
imminent-collision (~1.22×), rock-resolvePins, selectClassify empty-projectile,
isMovableEntity type-first, reusablePins pinBits, bitfield pin materialize,
Map-epoch marks. 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58 (syncEntityViews /
   packFence / residual closures / camera.follow).
2. classifyWorld after #37+#38+#45+#48+#60+#62 (resolvePins+normalizePinReasons /
   reusablePins).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61 (preStep residual /
   lifetimeSweep residual / tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
