# IMPORT_DIGEST report — 2026-09-24cs (post-#136 miss pass)

Master tip: **`4b28a8323`** (fetched; unchanged since #136 / digest 20260924cr).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` @ `348695004` already on `origin/master`
@ `4b28a8323` through #136. No restack this pass. Profile cite remains
`settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–136 | (unchanged — see digest 20260924cr) |

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924cr. Prior holds still stand:
classify selectClassify id-replay after #128 ~1.16×; weapon-presenter
callsite quiet ~2.0×/floor ~1.18×; vfx quiet-head composite ~2.27×/floor ~1.36×;
ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining;
rock-resolvePins / classify rock visit context ~1.09×; reusablePins pinBits;
glassIds/runwayIds epoch ~1.13×; classify incremental currentEntityIds ~1.17×;
visit-loop; stamp-reuse/inert/near-disc; selectClassify id-replay after #128
~1.16×; shield-bubble / preStep-all-sleeping / stampNearWork-empty /
radar-pose-retain remain held or out of band; env-machinery far ~0.87×;
hazards far ~0.82–0.98×; pinFacts parked retain already cached.

**This pass NEW hold:** asteroid-field-interact **empty** latch (flying /
empty near-disc complement to #135 still-player). Isolated 5×11-pair @ 60k:
medians ~1.49–1.67×; package floor minSpeedup **~1.22×** (clears median bar
on some runs but **fails solid ≥1.5× floor**). Absolute empty-query cost is
thin once the spatial hash returns zero hits — latch overhead fights the win.
Still-player (#135) remains the Ceres quiet cut (near-nonempty parked). Do
not casually retry empty latch without a denser empty-query owner or a
different arm predicate that pays real skipped work.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#136; unchanged owners)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), rock-visit quiet retain (#127),
  frame quiet retain (#128); **selectClassify id-replay after #128 held ~1.16×**
- prepareFrame → (unchanged; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep / tacticalAI residual;
  CM #129 + fields #130 + bombs #131 + far #132 + optic #133 + decode-runway #134
  + field-interact still #135 + poi-scan #136 shipped
- world / `_tickAsteroidFieldInteractions` → still-player (#135) shipped; **empty
  complement held this pass (floor ~1.22×)**

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| — | *(none)* | Miss-only. Empty-disc asteroid-field-interact latch floor failed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| asteroid-field-interact empty quiet latch (flying / empty near-disc; complement to #135) | **HOLD** — isolated medians ~1.49–1.67× @ 60k; package floor across 5×11-pair runs **~1.22×** (under ≥1.5× floor bar). Absolute empty-query too thin. Code reverted on scratch; not packaged. |
| hazards far quiet latch | **not casually retried** (held floor ~0.98× / inside ~0.82×) |
| env-machinery far quiet latch | **not casually retried** (held floor ~0.87×) |
| classify selectClassify id-replay / rock-resolvePins / prepareFrame quiet-VFX | **not casually retried** (held floors) |
| shield-bubble / preStep-all-sleeping / stampNearWork-empty / radar-pose-retain | **not casually retried** (held or out of band) |
| docking-corridor far synthetic latch | probe floor noisy (~0.6× min) — not pursued |
| pinFacts parked retain | already cached — no new cut |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128
   (resolvePins residual / reusablePins; selectClassify residual — id-replay
   after #128 held ~1.16×; rock visit context-only held ~1.09×). Prefer a
   **different** classify angle than held id-replay / visit-context.
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (closures /
   microMotion / ordnance / query miss / applySnapshotPose hold ~0.85×).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held;
   weapon-presenter callsite ~2.0×/floor ~1.18×; vfx quiet-head ~2.27×/floor ~1.36×;
   ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining held).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery kill-machines / cinder+aperture quiet residual (held —
   always-on phase updates block naive latch; floor failed ~0.87×).
7. Deferred/held: hazards far; asteroid-field **empty** latch now **held** at
   floor ~1.22× (still-player remains #135).

## Scratch

- Branch: `vm-work/hillclimb-20260924k`
- Tip: `348695004dfb3d778e0b704c8a066ddda0db2cf2` (unchanged; no src ship)
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Empty-latch floor evidence (scratch artifacts, not imported):
  `artifacts/asteroid-field-interact-empty-quiet-latch-floor-summary.json`
