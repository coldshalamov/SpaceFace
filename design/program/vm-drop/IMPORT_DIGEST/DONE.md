# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`2e7ec656b`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #54; +#55 measured on stack
@ `f17566990`.

Fresh quiet profile `settled-45s-stacked-20260924t` (Picture ON, soft-GPU,
post-#54 tip): idle **57.9%**, long tasks **15** (was 49 @ 20260924r). Soft-GPU
fps ignored. `#54` confirmed: `entityTimeToGlassSeconds` 85→17 samples;
`kickDecode` 20→2.

**Shipped this pass:**
- **#55 `gamepad-idle-clean-skip`** — portable quiet disconnected gamepad poll
  **~3.51×** cold (median ~23×; resets 40k→0); focused gamepad/input **21/21**.

**Holds / misses:** physics S1-idle, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc, imminent-collision (~1.22×), rock-resolvePins (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10×),
propulsion, soft-GPU draw-batch, spaceBg steady-state (pump was one-shot upload),
midflight-wave-hull-decode, syncCombatantBounds (prior miss). 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#55 (syncEntityViews /
   updateCraftMicroMotion / packFence).
2. classifyWorld after #37+#38+#45+#48 (selectClassify / reusablePins /
   shouldSyncPhysics).
3. registry.step after #39+#43+#49+#50+#55 (preStep / lifetimeSweep / tacticalAI).
4. syncEntityViews residual after #15+#44 (microMotion / ordnance / query).
5. Soft-GPU fps is not a KPI.
