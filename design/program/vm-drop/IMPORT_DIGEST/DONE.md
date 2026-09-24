# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`2e7ec656b`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #53; +#54 measured on stack
@ `d510451c0`.

Fresh quiet profile `settled-45s-stacked-20260924r` (Picture ON, soft-GPU):
idle **61.7%**. Soft-GPU fps ignored. Profile flagged `entityTimeToGlassSeconds`
~70 ms under `kickDecodeRunwayAssets` full-list sort.

**Shipped this pass:**
- **#54 `decode-runway-top2-select`** — portable quiet decode-runway start
  selection **~4.09×** (400 entities / 24 ships; glass calls/iter 2174→24);
  focused decode/hold/wave/residency **42/42** pass.

**Holds / misses:** physics S1-idle, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc, imminent-collision (~1.22×), rock-resolvePins (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10×),
propulsion, soft-GPU draw-batch, spaceBg steady-state (pump was one-shot upload),
midflight-wave-hull-decode. 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51+#52+#53+#54 (sync / other).
2. classifyWorld residual after #37+#38+#45+#48.
3. registry.step after #39+#43+#49+#50.
4. syncEntityViews residual after #15+#44.
5. Soft-GPU fps is not a KPI.
