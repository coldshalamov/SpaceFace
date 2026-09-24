# IMPORT_DIGEST report — 2026-09-24cu (post-#138 ship)

Master tip: **`4b28a8323`** (fetched; unchanged since #137 / digest 20260924ct).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` @ `1d86cef4a` on `origin/master`
@ `4b28a8323` through #138. No restack this pass. Profile cite remains
`settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–137 | (unchanged — see digest 20260924ct) |
| **138** | **classify-early-quiet-latch** (~2.8× / floor ≥2.31×) |

### SKIP / hold (unchanged + prior miss)

Carry forward all holds from digest 20260924ct. Prior holds still stand:
classify selectClassify id-replay after #128 ~1.16×; weapon-presenter
callsite quiet ~2.0×/floor ~1.18×; vfx quiet-head composite ~2.27×/floor ~1.36×;
ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining;
rock-resolvePins / classify rock visit context ~1.09×; reusablePins pinBits;
glassIds/runwayIds epoch ~1.13×; classify incremental currentEntityIds ~1.17×;
visit-loop; stamp-reuse/inert/near-disc; shield-bubble / preStep-all-sleeping /
stampNearWork-empty / radar-pose-retain remain held or out of band;
env-machinery far ~0.87×; hazards far ~0.82–0.98×; pinFacts parked retain
already cached; **asteroid-field-interact empty latch floor ~1.22×**
(digest 20260924cs). Hazards empty-list remains deferred (Helios/Tethys only;
Ceres has a zone — probed ~21× empty / ~1.0× Ceres residual this pass, not shipped).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136+#137 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#138)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), rock-visit quiet retain (#127),
  frame quiet retain (#128), **early quiet latch (#138)**; selectClassify id-replay
  after #128 held ~1.16× (superseded by early latch angle)
- prepareFrame → (unchanged; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep / tacticalAI residual;
  CM #129 + fields #130 + bombs #131 + far #132 + optic #133 + decode-runway #134
  + field-interact still #135 + poi-scan #136 + dockingCorridor far #137 shipped
- world / `_tickAsteroidFieldInteractions` → still-player (#135) shipped; empty
  complement held (floor ~1.22×)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **138** | **classify-early-quiet-latch** | Isolated 5×11-pair @ 20k: medians ~2.78–2.87×; package floor minSpeedup **≥2.31×**. Dirty-wake ok (move/membership/mining/pose). Focused **96/96**. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| classify early quiet latch (after frame-retain; pose-key verify) | **SHIPPED #138** — see above |
| hazards empty-list latch | synthetic ~21×/≥6.6× empty; Ceres residual ~1.0× — remains deferred (Helios/Tethys only) |
| selectClassify id-replay / rock visit-context / prepareFrame quiet-VFX / hazards far / env-machinery far / asteroid-field empty | **not casually retried** (held floors) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138
   (resolvePins residual / reusablePins; selectClassify residual — id-replay
   after #128 held ~1.16× superseded by early latch; rock visit context-only
   held ~1.09×). Prefer angles that still move the residual under early latch.
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136+#137
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
7. Deferred/held: hazards far; asteroid-field **empty** latch held at floor
   ~1.22× (still-player remains #135); hazards empty-list (non-Ceres) optional.

## Scratch

- Branch: `vm-work/hillclimb-20260924k`
- Tip: `1d86cef4a379873c7dc43103683864302e227ae7`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Package: `design/program/vm-drop/classify-early-quiet-latch/`
