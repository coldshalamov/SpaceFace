# IMPORT_DIGEST report — 2026-09-24ci (post-import hillclimb)

Master tip: **`8ebdf5537`** (fetched; station UI / ORRERY / model-survey landed after #114 base).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` on `origin/master` @ `8ebdf5537`;
through #126 @ `5cd366f28`; +#127 measured on stacked tip @ `c357994e4`. Profile
cite remains `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–125 | (unchanged — see digest 20260924ch) |
| 126 | `weapon-presenter-composite-quiet-latch` |
| 127 | `classify-rock-visit-quiet-retain` |

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924ch, plus:
**weapon-presenter callsite quiet ~2.0×/floor ~1.18×**; **vfx quiet-head composite
~2.27×/floor ~1.36×**; **ceres-a11y ~1.75–1.81×/floor ~1.12–1.40×**; **feel FOV+hullCrit
~1.56–1.72×/floor ~0.69–1.25×**; **damage-venting healthy ~1.24–1.32×**;
**tether/arc/mining active-probe ~0.8×**; rock-resolvePins / classify rock visit context
~1.09× (superseded for full-visit retain angle by #127); reusablePins pinBits;
glassIds/runwayIds epoch ~1.13×; classify incremental currentEntityIds ~1.17×.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#127)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), **rock-visit quiet retain (#127)**
- prepareFrame → (unchanged from 20260924ch; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep / tacticalAI residual

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 127 | `classify-rock-visit-quiet-retain` | Portable quiet classifyWorld parked rock-visit retain (asteroid/payload republish stamp; skip classifyActivity+applyStamp+signature+glass math) **~3.39×** median (8k; floor minSpeedup ≥2.155× across 5 package runs). Latch after first parked observe; wake on player speed / origin+extents / pinFacts._revision / per-rock pose / scheduled wake / pending grace / first observation. Dirty-wake proved. Focused retain+activity-runtime+classification 39/39. Soft-GPU fps not claimed. **Different angle** from held rock-resolvePins / rock visit context ~1.09× (those still paid classify+stamp). |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| classify rock-visit quiet retain (parked; pose+extents+facts+grace wake) | **shipped #127 ~3.39×** (floor ≥2.155× across package runs @ 8k) |
| weapon-presenter callsite quiet (held) | **not casually retried** |
| vfx quiet-head / ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining | **not casually retried** (held floors) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127
   (resolvePins residual / reusablePins; selectClassify residual; rock visit
   context-only held ~1.09× — full-visit retain shipped #127).
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (closures /
   microMotion / ordnance / query miss / applySnapshotPose hold ~0.85×).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held;
   weapon-presenter callsite ~2.0×/floor ~1.18×; vfx quiet-head ~2.27×/floor ~1.36×;
   ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining held).
5. Soft-GPU fps is not a KPI.
