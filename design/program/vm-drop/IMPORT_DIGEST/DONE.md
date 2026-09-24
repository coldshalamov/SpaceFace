# DONE — IMPORT_DIGEST (report id **20260924an**)

## Summary

Post-import hillclimb on master **`7850b341e`** (fetched).
Scratch `vm-work/hillclimb-20260924h` refreshed onto master + through #74; +#75 @ `33401ba50`.

Fresh quiet profile `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU,
tip through #64) cites ranking; #75 cuts packFence dirty>0 residual under
prepareFrame after #51+#68+#74.

**Shipped this pass:**
- **#75 `snapshot-fence-dirty-slot-list`** — portable quiet dirty>0 fence pack
  **~2.01×** median (12k; floor minSpeedup ≥1.76×); focused fence/presentation
  suites **33/33**.

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

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75
   (syncEntityViews residual closures / ordnance / microMotion; under-roof
   clearance stamp-check path; moving lookAt still full Three cost).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins; selectClassify residual).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70
   (preStep residual / lifetimeSweep residual / tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57+#74 (ordnance / query miss path /
   residual microMotion).
5. Soft-GPU fps is not a KPI.
