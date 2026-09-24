# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`abcccfd87`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #59; +#60 @ `6357d192c`.

Fresh quiet profile `settled-45s-stacked-20260924w` (Picture ON, soft-GPU,
post-#57 tip) still cites ranking; #60 cuts selectClassify Set.clear/rehash.

**Shipped this pass:**
- **#60 `select-classify-epoch-seen`** — portable quiet selectClassify
  seen-membership **~2.89×** median (12k × 11; admit parity); focused activity
  suites **64/64**.

**Holds / misses:** physics S1-idle, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc, imminent-collision (~1.22×), rock-resolvePins
(~1.02× / reconfirmed ~1.07×), selectClassify empty-projectile (~1.11×),
isMovableEntity type-first (~1.10×), reusablePins pinBits short-circuit,
bitfield pin materialize (~0.87×), Map-epoch marks (~1.46× under bar → replaced
by Uint32Array). stampNearWorkBudget always-awake cache ~1.58× ready next.
11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58 (syncEntityViews /
   packFence / residual closures / camera.follow).
2. classifyWorld after #37+#38+#45+#48+#60 (resolvePins+normalizePinReasons /
   reusablePins / shouldSyncPhysics).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59 (preStep residual /
   lifetimeSweep / stampNearWorkBudget always-awake ~1.58× / tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
