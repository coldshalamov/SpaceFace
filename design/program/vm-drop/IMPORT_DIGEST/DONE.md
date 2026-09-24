# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`abcccfd87`** (fetched; moved from `2e7ec656b`).
Scratch `vm-work/hillclimb-20260924h` refreshed onto master through #56; +#57
measured on stack @ `8b280fb14`.

Fresh quiet profile `settled-45s-stacked-20260924t` (Picture ON, soft-GPU,
post-#54 tip): idle **57.9%**, long tasks **15**. Soft-GPU fps ignored.
Cite still valid for ranking; #55+#56+#57 cut input / preStep / micromotion.

**Shipped this pass:**
- **#57 `micromotion-settled-skip`** — portable quiet `updateCraftMicroMotion`
  **~1.81×** median (80 ships × 4k frames; min ~1.70×); idle breath kept;
  focused micro-motion suites **35/35**.

**Holds / misses (unchanged + this scour):** physics S1-idle, spatial-hash@600,
visit-loop cadence, stamp-reuse/inert/near-disc, imminent-collision (~1.22×),
rock-resolvePins (~1.02×), selectClassify empty-projectile (~1.11×),
isMovableEntity type-first (~1.10×), propulsion, soft-GPU draw-batch,
spaceBg steady-state, midflight-wave-hull-decode, syncCombatantBounds,
reusablePins pinBits short-circuit (slower than array compare on quiet pins).
11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#57 (syncEntityViews /
   packFence / residual closures).
2. classifyWorld after #37+#38+#45+#48 (selectClassify / reusablePins /
   shouldSyncPhysics).
3. registry.step after #39+#43+#49+#50+#55+#56 (preStep residual / lifetimeSweep /
   tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
