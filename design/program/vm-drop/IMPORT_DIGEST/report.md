# IMPORT_DIGEST report — 2026-09-24cl (post-import hillclimb)

Master tip: **`8ebdf5537`** (fetched; station UI / ORRERY / model-survey landed after #114 base).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` on `origin/master` @ `8ebdf5537`;
through #129 @ `c6089caeb`; +#130 measured on stacked tip @ `8b020a817`. Profile
cite remains `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–128 | (unchanged — see digest 20260924ck) |
| 129 | `countermeasures-quiet-empty-latch` |
| 130 | `fields-idle-quiet-latch` |

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924ck, plus:
**fields idle quiet latch shipped #130**. Prior holds still stand: classify
selectClassify id-replay after #128 ~1.16×; weapon-presenter callsite quiet
~2.0×/floor ~1.18×; vfx quiet-head composite ~2.27×/floor ~1.36×; ceres-a11y /
feel FOV+hullCrit / damage-venting / tether-arc-mining; rock-resolvePins /
classify rock visit context ~1.09×; reusablePins pinBits; glassIds/runwayIds
epoch ~1.13×; classify incremental currentEntityIds ~1.17×; visit-loop;
stamp-reuse/inert/near-disc; selectClassify id-replay after #128 ~1.16×;
farActor no-virt synthetic probe held for restore-path correctness (far rows
must still promote); bombs-empty-latch synthetic ~5× not shipped this pass
(mines already empty-early-out; bombs residual lower priority than fields).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#130)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), rock-visit quiet retain (#127),
  frame quiet retain (#128); **selectClassify id-replay after #128 held ~1.16×**
- prepareFrame → (unchanged; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep / tacticalAI residual;
  **countermeasures quiet-empty latch (#129)**; **fields idle quiet latch (#130)**

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 130 | `fields-idle-quiet-latch` | Portable quiet fields.update idle latch when no awake NPC field roles **~2.57–2.71×** median (60k; floor minSpeedup ≥1.85× across 5 package runs). Latch after idle+no-role scan; wake on membership / 0.5s rescan / leave idle. Awake scavenger roles refuse latch (PQ-147.01). Dirty-wake proved. Focused latch+fields **31/31**. Soft-GPU fps not claimed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| fields idle quiet latch (no awake NPC field roles) | **shipped #130 ~2.57–2.71×** (floor ≥1.85× across package runs @ 60k) |
| farActor no-virt latch (synthetic ~24×) | **hold** — restore path must still run when far rows exist; not casually shipped |
| bombs empty latch (synthetic ~5×) | **hold** — mines already empty-early-out; lower priority vs fields this pass |
| classify selectClassify id-replay / rock-resolvePins / prepareFrame quiet-VFX | **not casually retried** (held floors) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128
   (resolvePins residual / reusablePins; selectClassify residual — id-replay
   after #128 held ~1.16×; rock visit context-only held ~1.09×).
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual; countermeasures #129 + fields #130 shipped).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (closures /
   microMotion / ordnance / query miss / applySnapshotPose hold ~0.85×).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held;
   weapon-presenter callsite ~2.0×/floor ~1.18×; vfx quiet-head ~2.27×/floor ~1.36×;
   ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining held).
5. Soft-GPU fps is not a KPI.
