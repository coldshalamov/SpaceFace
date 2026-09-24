# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`abcccfd87`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #57; +#58 @ `df665a6bc`.

Fresh quiet profile `settled-45s-stacked-20260924w` (Picture ON, soft-GPU,
post-#57 tip): idle **62.4%**, long tasks **17**. Soft-GPU fps ignored.
Cite used to rank; #58 cuts held-thrust eventTrace sanitize.

**Shipped this pass:**
- **#58 `event-trace-thrust-sanitize`** — portable quiet `sanitizePayload` on
  ship:thrust envelope **~7.15×** median (30k × 7; JSON identical); focused
  governor-weave + vfx-settings-runtime-truth pass.

**Holds / misses (unchanged):** physics S1-idle, spatial-hash@600,
visit-loop cadence, stamp-reuse/inert/near-disc, imminent-collision (~1.22×),
rock-resolvePins (~1.02×), selectClassify empty-projectile (~1.11×),
isMovableEntity type-first (~1.10×), propulsion, soft-GPU draw-batch,
spaceBg steady-state, midflight-wave-hull-decode, syncCombatantBounds,
reusablePins pinBits short-circuit (slower than array compare on quiet pins).
11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58 (syncEntityViews /
   packFence / residual closures / camera.follow).
2. classifyWorld after #37+#38+#45+#48 (selectClassify / reusablePins /
   shouldSyncPhysics / resolvePins+normalizePinReasons).
3. registry.step after #39+#43+#49+#50+#55+#56+#58 (preStep residual /
   lifetimeSweep / stampNearWorkBudget / tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
