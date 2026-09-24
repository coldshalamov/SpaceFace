# IMPORT_DIGEST report — 2026-09-24cq (post-import hillclimb)

Master tip: **`8ebdf5537`** (fetched; station UI / ORRERY / model-survey landed after #114 base).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` on `origin/master` @ `8ebdf5537`;
through #134 @ `8ba219286`; +#135 measured on stacked tip @ `929ae1949`. Profile
cite remains `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–134 | (unchanged — see digest 20260924cp) |
| 135 | `asteroid-field-interact-still-quiet-latch` |

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924cp. Prior holds still stand:
classify selectClassify id-replay after #128 ~1.16×; weapon-presenter
callsite quiet ~2.0×/floor ~1.18×; vfx quiet-head composite ~2.27×/floor ~1.36×;
ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining;
rock-resolvePins / classify rock visit context ~1.09×; reusablePins pinBits;
glassIds/runwayIds epoch ~1.13×; classify incremental currentEntityIds ~1.17×;
visit-loop; stamp-reuse/inert/near-disc; selectClassify id-replay after #128
~1.16×; shield-bubble / preStep-all-sleeping / stampNearWork-empty /
radar-pose-retain remain held or out of band.

**This pass:** asteroid-field-interactions **empty** latch remains deferred
(near-disc often non-empty on quiet Ceres) — shipped still-player pattern
instead. hazards far latch floor failed at origin (~0.98×) / inside regresses —
keep deferred. env-machinery far latch floor ~0.87× held. pinFacts parked
retain already cached. POI all-identified synthetic ~49× not shipped this pass
(absolute cost small vs field-interact; optional next).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#135)

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
  (promote preserved when rows exist; empty queryFarActors early-return)
- world / `_tickAsteroidFieldInteractions` → **still-player quiet latch (#135)**
  (ram promote preserved on first probe / wake; empty latch still deferred)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 135 | `asteroid-field-interact-still-quiet-latch` | Portable quiet parked `_tickAsteroidFieldInteractions` still-player latch **~13.5–14.0×** median (60k; floor minSpeedup ≥7.2× across primary+5 package runs). Arms even with nearby non-touching rocks; wake on field.version / player move / unpark / 0.5 s rescan. Flying ~1.0×. Dirty-wake proved. Focused latch+field+far/optic/decode suites **65/65**. Soft-GPU fps not claimed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| asteroid-field-interact still-player quiet latch | **shipped #135 ~13.5–14.0×** (floor ≥7.2× across package runs @ 60k); ram promote preserved |
| asteroid-field-interactions empty latch | synthetic ~6× far-rocks / still deferred — quiet Ceres near-disc often non-empty |
| hazards far quiet latch | @origin floor ~0.98× failed; @far ~4.6×; @inside ~0.82× regress — keep deferred |
| env-machinery far quiet latch | **not casually retried** (held floor ~0.87×) |
| poi-scan all-identified latch | synthetic ~49× / floor ~5.7× — not shipped (small absolute vs field-interact); optional next |
| classify selectClassify id-replay / rock-resolvePins / prepareFrame quiet-VFX | **not casually retried** (held floors) |
| shield-bubble / preStep-all-sleeping / stampNearWork-empty / radar-pose-retain | **not casually retried** (held or out of band) |
| pinFacts parked retain | already cached in rebuildPinFacts — no new cut |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128
   (resolvePins residual / reusablePins; selectClassify residual — id-replay
   after #128 held ~1.16×; rock visit context-only held ~1.09×).
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual; CM #129 + fields #130 + bombs #131 + far #132 + optic
   #133 + decode-runway #134 + field-interact still #135 shipped).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (closures /
   microMotion / ordnance / query miss / applySnapshotPose hold ~0.85×).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held;
   weapon-presenter callsite ~2.0×/floor ~1.18×; vfx quiet-head ~2.27×/floor ~1.36×;
   ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining held).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery kill-machines / cinder+aperture quiet residual (held —
   always-on phase updates block naive latch; floor failed ~0.87×).
7. Optional: poi-scan all-identified latch (synthetic ~49×); deferred hazards far
   latch only if real quiet Ceres path clears ≥1.5× floor with dirty-wake.
   Asteroid-field **empty** latch remains deferred (still-player shipped as #135).
