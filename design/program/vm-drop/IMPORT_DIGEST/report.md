# IMPORT_DIGEST report — 2026-09-24cw (post-#140 ship)

Master tip: **`4b28a8323`** (fetched; unchanged since #138 / digest 20260924cu).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` @ `bed5a3fa9` on `origin/master`
@ `4b28a8323` through #140. No restack this pass. Profile cite remains
`settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–139 | (unchanged — see digest 20260924cv) |
| **140** | **tumble-states-quiet-latch** (~5.8× / floor ≥4.17×) |

### SKIP / hold (unchanged + prior miss)

Carry forward all holds from digest 20260924cv. Prior holds still stand:
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
**new hold this pass** (thin vs current #88 lane baseline).
zoneAt cell-retain weak floor ~0.98× remains held.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136+#137+#139+#140 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#140)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), rock-visit quiet retain (#127),
  frame quiet retain (#128), early quiet latch (#138); selectClassify id-replay
  after #128 held ~1.16× (superseded by early latch angle)
- prepareFrame → (unchanged; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep residual;
  **tumbleStates quiet latch (#140)**; tacticalAI quiet latch (#139); CM #129 + fields #130
  + bombs #131 + far #132 + optic #133 + decode-runway #134 + field-interact still #135
  + poi-scan #136 + dockingCorridor far #137 shipped
- world / `_tickAsteroidFieldInteractions` → still-player (#135) shipped; empty
  complement held (floor ~1.22×)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **140** | **tumble-states-quiet-latch** | Isolated 5×11-pair @ 30k npc24: medians ~5.68–5.90×; package floor minSpeedup **≥4.17×**. Dirty-wake ok (impulse gen / begin clear). Focused **90/90**. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| tumbleStates quiet latch (no tumble/rcs/recovery/drift) | **SHIPPED #140** — see above |
| lifetimeSweep skip lane-compact when !MEMBERSHIP dirty | probe ~1.45× / floor ~1.40× vs current #88 lane baseline — **not shipped** (thin; new hold) |
| classify resolvePins / reusablePins under #138 | not separately re-probed; early latch already covers parked residual; flying residual remains |
| hazards empty-list / far / env-machinery far / asteroid-field empty / classify id-replay / rock visit-context / prepareFrame quiet-VFX / zoneAt cell-retain / lifetimeSweep no-movable | **not casually retried** (held floors) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138
   (resolvePins residual / reusablePins; selectClassify residual — id-replay
   after #128 held ~1.16× superseded by early latch; rock visit context-only
   held ~1.09×). Prefer angles that still move the residual under early latch
   (flying / rescan path).
2. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136+#137+#139+#140
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish;
   tumbleStates + tacticalAI quiet residuals after #140+#139).
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (closures /
   microMotion / ordnance / query miss / applySnapshotPose hold ~0.85×).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held;
   weapon-presenter callsite ~2.0×/floor ~1.18×; vfx quiet-head ~2.27×/floor ~1.36×;
   ceres-a11y / feel FOV+hullCrit / damage-venting / tether-arc-mining held).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery kill-machines / cinder+aperture quiet residual (held —
   always-on phase updates block naive latch; floor failed ~0.87×).
7. Deferred/held: hazards far; asteroid-field **empty** latch held at floor
   ~1.22× (still-player remains #135); hazards empty-list (non-Ceres) optional;
   zone-cell-retain weak floor; lifetimeSweep no-movable thin; lifetimeSweep
   skip-lane-compact-when-no-membership ~1.45× thin (new).

## Scratch

- Branch: `vm-work/hillclimb-20260924k`
- Tip: `bed5a3fa9eb9f81176e16aac64770b1d856801c6`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Package: `design/program/vm-drop/tumble-states-quiet-latch/`
