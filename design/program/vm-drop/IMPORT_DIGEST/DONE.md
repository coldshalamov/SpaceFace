# DONE — IMPORT_DIGEST (report id **20260924am**)

## Summary

Post-import hillclimb on master **`7850b341e`** (fetched).
Scratch `vm-work/hillclimb-20260924h` refreshed onto master + through #73; +#74 @ `aee114930`.

Fresh quiet profile `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU,
tip through #64) cites ranking; #74 cuts residual settled zero-dirty
presentationQueries.query under syncEntityViews / prepareFrame after #73.

**Shipped this pass:**
- **#74 `presentation-query-zero-dirty-retain`** — portable settled zero-dirty
  presentation query **~6.91×** median (20k; floor minSpeedup ≥5.86×); focused
  presentation suites **13/13**.

**Holds / misses:** JS dirty-scan ~0.8×; contact-base identity retain ~1.27×;
roster-member-scratch-fill (alloc-only ~0.97× — drop; replaced by #67);
lifetimeSweep dirty-publish trust full-pole ~1.08×; lifetimeSweep
pose-publish-list(~1.00×); classify physics-partition fuse-only (~1.44×);
physics S1-idle; spatial-hash@600; visit-loop cadence; stamp-reuse/inert/near-disc;
imminent-collision (~1.22×); rock-resolvePins; selectClassify empty-projectile;
isMovableEntity type-first; reusablePins pinBits; bitfield pin materialize
(~0.87× — still hold; distinct from #64); Map-epoch marks. 11 rocks pinned.
Framing+compose follow-pair informational ~1.06× (compose dominates; framing
alone is the shipped KPI). Composition quiet cadence under bar with near ambient
sticky (~1.0× — hold). Moving chase lookAt informational ~1.00× (retain miss).
Moving clearance floor retain informational ~0.85× (cam floats change).
Clearance floor retain with per-mesh stamp-check under-roof ~1.33× — not shipped
as primary; off-roof `-Infinity` fast path is the KPI. Moving presentation-query
retain informational ~0.99× (bounds change).

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74
   (syncEntityViews residual closures / ordnance / microMotion; under-roof
   clearance stamp-check path; moving lookAt still full Three cost; packFence
   residual when dirty>0).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins; selectClassify residual).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70
   (preStep residual / lifetimeSweep residual / tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57+#74 (ordnance / query miss path /
   residual microMotion).
5. Soft-GPU fps is not a KPI.
