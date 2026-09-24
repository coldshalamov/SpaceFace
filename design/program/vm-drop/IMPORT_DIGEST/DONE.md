# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`7850b341e`** (fetched; moved from `fd8adfdfd`).
Scratch `vm-work/hillclimb-20260924h` refreshed onto master + through #69; +#70 @ `212773a58`.

Fresh quiet profile `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU,
tip through #64) cites ranking; #70 cuts residual `StuntFlightObserver.update`
history under registry.step after #40+#49.

**Shipped this pass:**
- **#70 `stunt-flight-history-quiet-skip`** — portable quiet StuntFlightObserver
  history **~4.66×** median (120 ships + 40 near dyn × 8000 ticks; floor
  minSpeedup ≥3.91×); focused stunt suites **31/31**.

**Holds / misses:** JS dirty-scan ~0.8×; contact-base identity retain ~1.27×;
roster-member-scratch-fill (alloc-only ~0.97× — drop; replaced by #67);
lifetimeSweep dirty-publish trust full-pole ~1.08×; lifetimeSweep
pose-publish-list(~1.00×); classify physics-partition fuse-only (~1.44×);
physics S1-idle; spatial-hash@600; visit-loop cadence; stamp-reuse/inert/near-disc;
imminent-collision (~1.22×); rock-resolvePins; selectClassify empty-projectile;
isMovableEntity type-first; reusablePins pinBits; bitfield pin materialize
(~0.87× — still hold; distinct from #64); Map-epoch marks. 11 rocks pinned.
`pq146-flight-evidence` kickstart receipt fails on stacked tip pre-#70 (not
regressed; not in focused suite).

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68 (syncEntityViews /
   packFence residual / residual closures / camera.follow residual).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70 (preStep residual /
   lifetimeSweep residual / tacticalAI residual after liveFramesFor+#66,
   liveListSquads+#67, sampleProjectileEvidence+#69, flight-history+#70).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
