# IMPORT_DIGEST report — 2026-09-24cz (post-#141; #142 ship)

Master tip: **`4b28a8323`** (fetched; unchanged since #138 / digest 20260924cu).

## Stack refresh

Scratch `vm-work/hillclimb-20260924m` @ `89579be51` on `origin/master`
@ `4b28a8323` through #141 + #142. No restack this pass (master unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–141 | (unchanged — see digest 20260924cx) |
| **142** | **presentation-query-pose-dirty-retain** |

### SKIP / hold (unchanged + prior #142 miss stay held)

Carry forward all holds from digest 20260924cy. Prior holds still stand:
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
Ceres has a zone — probed ~21× empty / ~1.0× Ceres residual).
lifetimeSweep skip-lane-compact-when-no-membership ~1.45× / floor ~1.40× —
held (thin vs current #88 lane baseline).
zoneAt cell-retain weak floor ~0.98× remains held.
lifetimeSweep no-movable thin (synthetic latch ~1.60×; full-skip sketch unfair).
**classify flying-early-latch under #141** — production-profile A/B median
~1.34–1.39× / floor ~1.21–1.26× — held (digest 20260924cy).
This pass also probed (not shipped): lifetimeSweep dirty-publish fair ~1.04×;
classify NPC visit under frame-miss ~1.08×; selectClassify spatial stub ~1.12×;
adaptive quantize cruise fair regress ~0.78–0.98× — do not retry casually.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136+#137+#139+#140 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141; flying-early-latch held ~1.3× |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81+#**142** |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#142)

- syncEntityViews → presentationQueries.query (#74+#77+#**142** pose-dirty retain),
  refreshVisibleEntity (#76), updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81),
  applySnapshotPose (hold ~0.85×), ordnance / closures residual
- classifyWorld → flying rock/frame retain (#141); flying-early-latch held ~1.3×;
  selectClassify id-replay after #128 held ~1.16×; rock visit context-only held ~1.09×
- prepareFrame → (unchanged; quiet-VFX floors still held)
- registry.step → preStep / packCombatTable / lifetimeSweep residual;
  tumbleStates (#140) + tacticalAI (#139) + CM/fields/bombs/far/optic/decode/field/poi/dock shipped

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **142** | **presentation-query-pose-dirty-retain** | ~5.58–6.03× median / floor ≥4.74× (5×11 isolated); dirty-wake ok; 31/31 focused |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| presentation-query pose-dirty retain (TRANSFORM-only already-visible; exactVisible recheck) | **SHIP #142** — parked yaw+NPC drift ~5.5× / floor ≥4.74×; cruise ~1.0× neutral |
| lifetimeSweep dirty-publish playerOnly FAIR | ~1.04× — thin (clocks/compact dominate); not held-retry of compact-skip |
| classify NPC visit under forced frame-miss | ~1.08× factor — thin |
| selectClassify spatial stub / visit-retain | ~1.12× — thin; coherent cache already hot |
| adaptive quantize q=2 cruise + poseIgnore unfair | looked ~2.8× but fair snapped-origin regress ~0.78× — not shipped |
| flying-early-latch / lifetimeSweep compact-skip / asteroid-field empty / hazards / env-machinery / id-replay / rock visit-context / quiet-VFX / zoneAt / preStep-all-sleeping / packCombat single-dirty | **not casually retried** (held) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   (NPC/ship visit deepen still thin ~1.08×; disc-admission visit-retain thin
   ~1.12×; **flying-early-latch held ~1.3×**; id-replay ~1.16×; rock context ~1.09×).
2. registry.step after …+#140 (preStep residual / packCombatTable residual /
   lifetimeSweep dirty-publish fair ~1.04× thin; tumbleStates + tacticalAI quiet residuals).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81+#142 (closures /
   microMotion / ordnance / applySnapshotPose hold ~0.85×; query pose-dirty shipped).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery far (held ~0.87×).
7. Deferred/held: hazards far; asteroid-field **empty** ~1.22×; zoneAt;
   lifetimeSweep no-movable / compact-skip; **flying-early-latch ~1.3×**;
   lifetimeSweep dirty-publish fair thin.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `89579be51e54aa29cee63314b376e9f226cd7b59`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Package: `presentation-query-pose-dirty-retain` (#142)
