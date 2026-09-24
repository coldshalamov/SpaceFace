# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`abcccfd87`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #63; +#64 @ `e1b3f26a3`.

Quiet profile `settled-45s-stacked-20260924w` (Picture ON, soft-GPU,
post-#57 tip) still cites ranking; #64 cuts `normalizePinReasons` Set.clear+sort
on the quiet 0–2 pin lists that dominate classifyWorld.

**Shipped this pass:**
- **#64 `classify-normalize-pins-small-n`** — portable quiet `normalizePinReasons`
  small-n fast path **~1.92×** median (200-entity Ceres mix × 50k visits;
  floor minSpeedup ≥1.91× across five isolated pairs; admit parity); focused
  suites **35/35** (scratch) / **32/32** (vm-drop tree).

**Holds / misses:** lifetimeSweep dirty-publish trust full-pole ~1.08×;
lifetimeSweep pose-publish-list(~1.00×); classify physics-partition fuse-only
(~1.44×); physics S1-idle; spatial-hash@600; visit-loop cadence;
stamp-reuse/inert/near-disc; imminent-collision (~1.22×); rock-resolvePins;
selectClassify empty-projectile; isMovableEntity type-first; reusablePins
pinBits; bitfield pin materialize (~0.87× — still hold; distinct from #64);
Map-epoch marks. 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63 (syncEntityViews /
   packFence / residual closures / camera.follow residual).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61 (preStep residual /
   lifetimeSweep residual / tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
