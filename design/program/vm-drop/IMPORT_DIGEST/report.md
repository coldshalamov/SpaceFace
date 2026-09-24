# IMPORT_DIGEST report — 2026-09-24cm (post-import hillclimb)

Master tip: **`8ebdf5537`** (fetched; station UI / ORRERY / model-survey landed after #114 base).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` on `origin/master` @ `8ebdf5537`;
through #130 @ `8b020a817`; +#131 measured on stacked tip @ `83b816338`. Profile
cite remains `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–129 | (unchanged — see digest 20260924cl) |
| 130 | `fields-idle-quiet-latch` |
| 131 | `bombs-empty-quiet-latch` |

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924cl, plus:
**bombs empty quiet latch shipped #131** (prior hold "bombs-empty synthetic ~5×
— not portable quiet path yet" cleared by real `bombs.update` A/B). Prior holds
still stand: classify selectClassify id-replay after #128 ~1.16×; weapon-presenter
callsite quiet ~2.0×/floor ~1.18×; vfx quiet-head composite ~2.27×/floor ~1.36×;
ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining;
rock-resolvePins / classify rock visit context ~1.09×; reusablePins pinBits;
glassIds/runwayIds epoch ~1.13×; classify incremental currentEntityIds ~1.17×;
visit-loop; stamp-reuse/inert/near-disc; selectClassify id-replay after #128
~1.16×; farActor no-virt careful latch synthetic ~24× still **hold** — restore
path must still run when far rows exist (careful empty-far+no-virt probe held
for integrate); shield-bubble / preStep-all-sleeping / stampNearWork-empty /
radar-pose-retain remain held or out of band.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#131)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), rock-visit quiet retain (#127),
  frame quiet retain (#128); **selectClassify id-replay after #128 held ~1.16×**
- prepareFrame → (unchanged; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep / tacticalAI residual;
  **countermeasures quiet-empty latch (#129)**; **fields idle quiet latch (#130)**;
  **bombs empty quiet latch (#131)**

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 131 | `bombs-empty-quiet-latch` | Portable quiet bombs.update empty latch when ready typed bombs bucket empty **~9.5–11.7×** median (60k; floor minSpeedup ≥1.78× across primary+5 package runs). Latch after empty+no-edge probe; wake on drop/cycle/detonate / membership / 0.5s rescan. Without versioned bombs bucket latch refuses. Dirty-wake proved. Focused latch+bombs **28/28**. Soft-GPU fps not claimed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| bombs empty quiet latch (ready typed bucket) | **shipped #131 ~9.5–11.7×** (floor ≥1.78× across package runs @ 60k) |
| farActor careful no-virt latch (empty far table) | **hold** — synthetic ~24× when far empty+no virt; ~1× when far rows exist (restore preserved); not casually shipped — needs integrate with ensureActivityClassified / tickFarActors |
| classify selectClassify id-replay / rock-resolvePins / prepareFrame quiet-VFX | **not casually retried** (held floors) |
| shield-bubble / preStep-all-sleeping / stampNearWork-empty / radar-pose-retain | **not casually retried** (held or out of band) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128
   (resolvePins residual / reusablePins; selectClassify residual — id-replay
   after #128 held ~1.16×; rock visit context-only held ~1.09×).
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual; CM #129 + fields #130 + bombs #131 shipped).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (closures /
   microMotion / ordnance / query miss / applySnapshotPose hold ~0.85×).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held;
   weapon-presenter callsite ~2.0×/floor ~1.18×; vfx quiet-head ~2.27×/floor ~1.36×;
   ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining held).
5. Soft-GPU fps is not a KPI.
6. farActor careful empty-far+no-virt latch (synthetic ~24×) — hold for integrate.
