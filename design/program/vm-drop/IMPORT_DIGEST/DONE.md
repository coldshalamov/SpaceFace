# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`abcccfd87`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #60; +#61 @ `e16cc07d5`.

Fresh quiet profile `settled-45s-stacked-20260924w` (Picture ON, soft-GPU,
post-#57 tip) still cites ranking; #61 cuts stampNearWorkBudget always-awake
owner walks.

**Shipped this pass:**
- **#61 `stamp-near-work-awake-cache`** — portable quiet stampNearWorkBudget
  always-awake cache **~1.65×** median (80 shipLike × 80k; floor ≥1.56× across
  five isolated runs; admit + production parity); focused suites **93/93**.

**Holds / misses:** physics S1-idle, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc, imminent-collision (~1.22×), rock-resolvePins
(~1.02× / reconfirmed ~1.07×), selectClassify empty-projectile (~1.11×),
isMovableEntity type-first (~1.10×), reusablePins pinBits short-circuit,
bitfield pin materialize (~0.87×), Map-epoch marks (~1.46× under bar → replaced
by Uint32Array). 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58 (syncEntityViews /
   packFence / residual closures / camera.follow).
2. classifyWorld after #37+#38+#45+#48+#60 (resolvePins+normalizePinReasons /
   reusablePins / shouldSyncPhysics).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61 (preStep residual /
   lifetimeSweep / tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
