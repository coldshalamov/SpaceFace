# IMPORT_DIGEST report — 2026-09-24cr (post-import hillclimb)

Master tip: **`4b28a8323`** (fetched + restacked; moralTrap / shipworks / overflow
ribbon jets landed after #135 base `8ebdf5537`).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` rebase-onto `origin/master` @ `4b28a8323`
(+ one vfx trail-emit conflict resolved keeping overflow brake + anyBusy);
through #135 @ `d525ed9a0`; +#136 measured on stacked tip @ `348695004`. Profile
cite remains `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–135 | (unchanged — see digest 20260924cq) |
| 136 | `poi-scan-all-identified-quiet-latch` |

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924cq. Prior holds still stand:
classify selectClassify id-replay after #128 ~1.16×; weapon-presenter
callsite quiet ~2.0×/floor ~1.18×; vfx quiet-head composite ~2.27×/floor ~1.36×;
ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining;
rock-resolvePins / classify rock visit context ~1.09×; reusablePins pinBits;
glassIds/runwayIds epoch ~1.13×; classify incremental currentEntityIds ~1.17×;
visit-loop; stamp-reuse/inert/near-disc; selectClassify id-replay after #128
~1.16×; shield-bubble / preStep-all-sleeping / stampNearWork-empty /
radar-pose-retain remain held or out of band.

**This pass:** shipped optional poi-scan all-identified latch (portable floor
cleared). asteroid-field-interactions **empty** latch remains deferred.
hazards far latch floor failed at origin (~0.98×) / inside regresses — keep
deferred. env-machinery far latch floor ~0.87× held. pinFacts parked retain
already cached.

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

### Notable callees (post-#136)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), rock-visit quiet retain (#127),
  frame quiet retain (#128); **selectClassify id-replay after #128 held ~1.16×**
- prepareFrame → (unchanged; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep / tacticalAI residual;
  **countermeasures quiet-empty latch (#129)**; **fields idle quiet latch (#130)**;
  **bombs empty quiet latch (#131)**
- world / tickFarActors → **far empty quiet latch (#132)** (restore preserved)
- world / tickOpticFieldRocks → **optic far quiet latch (#133)** (near promote preserved)
- world / requestDecodeRunwayPromote → **decode-runway empty-far quiet latch (#134)**
- world / `_tickAsteroidFieldInteractions` → **still-player quiet latch (#135)**
- world / `_tickPOIScan` → **all-identified / no-proximity-work quiet latch (#136)**
  (identify preserved; dirty-wake on sectorId / pois.length / 0.5 s rescan)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 136 | `poi-scan-all-identified-quiet-latch` | Portable quiet `_tickPOIScan` all-identified latch **~3.9–4.2×** isolated median (60k; floor minSpeedup ≥3.26× across 5 package runs). Ceres-scale 4 POIs ~7.4× in-process. One-unidentified ~1.0×. Dirty-wake proved (sector / length). Focused suites **62/62**. Soft-GPU fps not claimed. Absolute small (~0.5 µs/call) — shipped per digest optional-next floor-clear rule. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| poi-scan all-identified quiet latch | **shipped #136 ~3.9–4.2×** (floor ≥3.26× across package runs @ 60k); identify preserved |
| asteroid-field-interactions empty latch | **not casually retried** (deferred; still-player shipped as #135) |
| hazards far quiet latch | **not casually retried** (held floor ~0.98× / inside ~0.82×) |
| env-machinery far quiet latch | **not casually retried** (held floor ~0.87×) |
| classify selectClassify id-replay / rock-resolvePins / prepareFrame quiet-VFX | **not casually retried** (held floors) |
| shield-bubble / preStep-all-sleeping / stampNearWork-empty / radar-pose-retain | **not casually retried** (held or out of band) |
| pinFacts parked retain | already cached — no new cut |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128
   (resolvePins residual / reusablePins; selectClassify residual — id-replay
   after #128 held ~1.16×; rock visit context-only held ~1.09×).
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual; CM #129 + fields #130 + bombs #131 + far #132 + optic
   #133 + decode-runway #134 + field-interact still #135 + poi-scan #136 shipped).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (closures /
   microMotion / ordnance / query miss / applySnapshotPose hold ~0.85×).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held;
   weapon-presenter callsite ~2.0×/floor ~1.18×; vfx quiet-head ~2.27×/floor ~1.36×;
   ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining held).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery kill-machines / cinder+aperture quiet residual (held —
   always-on phase updates block naive latch; floor failed ~0.87×).
7. Deferred: hazards far latch only if real quiet Ceres path clears ≥1.5× floor
   with dirty-wake. Asteroid-field **empty** latch remains deferred (still-player
   shipped as #135).
