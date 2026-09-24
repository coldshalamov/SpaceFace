# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`fd8adfdfd`** (fetched; moved from `abcccfd87`).
Scratch `vm-work/hillclimb-20260924h` refreshed onto master + through #68; +#69 @ `d6f4b62c5`.

Fresh quiet profile `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU,
tip through #64) cites ranking; #69 cuts residual `sampleProjectileEvidence`
under registry.step after #35+#36.

**Shipped this pass:**
- **#69 `stunt-projectile-evidence-quiet-iter`** — portable quiet
  sampleProjectileEvidence **~1.77×** median (400 ents × 4000 ticks, 0 plates;
  floor minSpeedup ≥1.64×); focused stunt/projectile suites **30/30**.

**Holds / misses:** JS dirty-scan ~0.8×; contact-base identity retain ~1.27×;
roster-member-scratch-fill (alloc-only ~0.97× — drop; replaced by #67);
lifetimeSweep dirty-publish trust full-pole ~1.08×; lifetimeSweep
pose-publish-list(~1.00×); classify physics-partition fuse-only (~1.44×);
physics S1-idle; spatial-hash@600; visit-loop cadence; stamp-reuse/inert/near-disc;
imminent-collision (~1.22×); rock-resolvePins; selectClassify empty-projectile;
isMovableEntity type-first; reusablePins pinBits; bitfield pin materialize
(~0.87× — still hold; distinct from #64); Map-epoch marks. 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68 (syncEntityViews /
   packFence residual / residual closures / camera.follow residual).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69 (preStep residual /
   lifetimeSweep residual / tacticalAI residual after liveFramesFor+#66,
   liveListSquads+#67, sampleProjectileEvidence+#69).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
