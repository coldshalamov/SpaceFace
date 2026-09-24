# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`abcccfd87`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #67; +#68 @ `7f6dd1c42`.

Fresh quiet profile `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU,
tip through #64) cites ranking; #68 cuts residual prepareFrame packFence
dense copy on zero-dirty ticks after #51.

**Shipped this pass:**
- **#68 `snapshot-fence-zero-dirty-retain`** — portable quiet packFence
  zero-dirty retain **~9.2×** median (400 ents × 10000 packs; floor minSpeedup
  ≥8.4×); focused fence/presentation suites **18/18**.

**Holds / misses:** snapshot-fence zero-dirty scan-without-dirtyCount (~0.8× —
replaced by O(1) dirtyCount); contact-base identity retain (~1.27× under bar);
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
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67 (preStep residual /
   lifetimeSweep residual / tacticalAI residual after liveFramesFor+#66 and
   liveListSquads+#67).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
