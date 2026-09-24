# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`2e7ec656b`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #52; +#53 measured on stack
@ `a5cb8e4ab`.

Fresh quiet profile `settled-45s-stacked-20260924r` (Picture ON, soft-GPU):
idle **61.7%**. Soft-GPU fps ignored.

**Shipped this pass:**
- **#53 `authored-instance-camera-quantize`** — portable quiet authored
  instance pool sync **~2.32×** (120 owners / 0.05 WU chase jitter; ownersVisited
  ~5.5× fewer); focused instance/frame **pass**.

**Holds / misses:** physics S1-idle, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc, imminent-collision (~1.22×), rock-resolvePins (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10×),
propulsion, soft-GPU draw-batch, spaceBg steady-state (pump was one-shot upload).
11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51+#52+#53 (entityTimeToGlassSeconds / sync residual).
2. classifyWorld residual after #37+#38+#45+#48.
3. registry.step after #39+#43+#49+#50.
4. syncEntityViews residual after #15+#44.
5. Soft-GPU fps is not a KPI.
