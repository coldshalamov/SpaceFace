# IMPORT_DIGEST report — 2026-09-24ck (post-import hillclimb)

Master tip: **`8ebdf5537`** (fetched; station UI / ORRERY / model-survey landed after #114 base).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` on `origin/master` @ `8ebdf5537`;
through #128 @ `03613271d`; +#129 measured on stacked tip @ `c6089caeb`. Profile
cite remains `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–127 | (unchanged — see digest 20260924ci) |
| 128 | `classify-frame-quiet-retain` |
| 129 | `countermeasures-quiet-empty-latch` |

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924cj, plus:
**countermeasures quiet-empty latch shipped #129**. This pass also measured
**classify selectClassify id-replay retain ~1.16× integrated** after #128 —
**hold** (under ≥1.5× bar; not a visit-loop / stamp-reuse retry). Prior holds
still stand: weapon-presenter callsite quiet ~2.0×/floor ~1.18×; vfx quiet-head
composite ~2.27×/floor ~1.36×; ceres-a11y / feel FOV+hullCrit / damage-venting /
tether-arc-mining; rock-resolvePins / classify rock visit context ~1.09×;
reusablePins pinBits; glassIds/runwayIds epoch ~1.13×; classify incremental
currentEntityIds ~1.17×; visit-loop; stamp-reuse/inert/near-disc; selectClassify
id-replay after #128 ~1.16×.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#129)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), rock-visit quiet retain (#127),
  frame quiet retain (#128); **selectClassify id-replay after #128 held ~1.16×**
- prepareFrame → (unchanged; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep / tacticalAI residual;
  **countermeasures quiet-empty latch (#129)**

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 129 | `countermeasures-quiet-empty-latch` | Portable quiet countermeasures.update latch when no CM/PDS interest **~40.3–42.1×** median (60k; floor minSpeedup ≥7.17× across 5 package runs). Latch after interest scan; wake on deploy edge / membership / live cm/pds / 0.5s fittings rescan. Dirty-wake proved. Focused latch+chaff 6/6. Soft-GPU fps not claimed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| countermeasures quiet-empty latch (no CM/PDS interest) | **shipped #129 ~40.3–42.1×** (floor ≥7.17× across package runs @ 60k) |
| classify selectClassify id-replay retain after #128 | **hold ~1.16×** integrated (under ≥1.5× bar) |
| weapon-presenter callsite / vfx quiet-head / ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining | **not casually retried** (held floors) |
| visit-loop / stamp-reuse / rock-resolvePins ~1.09× / glass-runway epoch ~1.13× | **not casually retried** |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128
   (resolvePins residual / reusablePins; selectClassify residual — id-replay
   after #128 held ~1.16×; rock visit context-only held ~1.09×).
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual; countermeasures #129 shipped).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (closures /
   microMotion / ordnance / query miss / applySnapshotPose hold ~0.85×).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held;
   weapon-presenter callsite ~2.0×/floor ~1.18×; vfx quiet-head ~2.27×/floor ~1.36×;
   ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining held).
5. Soft-GPU fps is not a KPI.
