# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`abcccfd87`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #65; +#66 @ `2fcf7a7fc`.

Fresh quiet profile `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU,
tip through #64) cites ranking; #66 cuts residual `liveFramesFor` /
`entityContacts` spread-alloc after #39+#43+#49+#50+#55+#56+#58+#59+#61.

**Shipped this pass:**
- **#66 `sensor-contact-scratch-fill`** — portable quiet live sensor contact
  scratch fill **~5.75×** median (6 observers × 18 contacts × 2500 iters with
  PerceptionMemory-style Object.assign; floor minSpeedup ≥5.52×); focused
  suites **20/20**.

**Holds / misses:** lifetimeSweep dirty-publish trust full-pole ~1.08×;
lifetimeSweep pose-publish-list(~1.00×); classify physics-partition fuse-only
(~1.44×); physics S1-idle; spatial-hash@600; visit-loop cadence;
stamp-reuse/inert/near-disc; imminent-collision (~1.22×); rock-resolvePins;
selectClassify empty-projectile; isMovableEntity type-first; reusablePins
pinBits; bitfield pin materialize (~0.87× — still hold; distinct from #64);
Map-epoch marks. 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65 (syncEntityViews /
   packFence / residual closures / camera.follow residual).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66 (preStep residual /
   lifetimeSweep residual / tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
