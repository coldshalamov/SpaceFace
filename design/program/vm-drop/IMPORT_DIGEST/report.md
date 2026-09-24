# IMPORT_DIGEST report — 2026-09-24cy (post-#141; #142 miss)

Master tip: **`4b28a8323`** (fetched; unchanged since #138 / digest 20260924cu).

## Stack refresh

Scratch `vm-work/hillclimb-20260924m` @ `c2a9bf173` on `origin/master`
@ `4b28a8323` through #141. No restack this pass (master unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–141 | (unchanged — see digest 20260924cx) |

### SKIP / hold (unchanged + #142 miss)

Carry forward all holds from digest 20260924cx. Prior holds still stand:
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
**NEW #142 hold: classify flying-early-latch under #141** — production-profile
A/B median ~1.34–1.39× / floor ~1.21–1.26× (eligibility + drift-bounded deepen);
in-process rocks48 ~1.31× / floor ~1.27×. Clears neither ≥~1.5× median nor solid
floor. Soft-GPU fps not claimed. Picture ON. Different angle from #141 (still
paid extents+selectClassify+retain walk) but residual after flying-frame-retain
is too thin once that path is hot.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88+#129+#130+#131+#132+#133+#134+#135+#136+#137+#139+#140 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141; flying-early-latch held ~1.3× |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89–#126 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#141 / #142 miss)

- classifyWorld → resolvePins, normalizePinReasons (#64), selectClassifyEntities (#60),
  reusablePins, shouldSyncPhysics (#62), rock-visit quiet retain (#127),
  frame quiet retain (#128), early quiet latch (#138), **flying rock/frame retain (#141)**;
  flying-early-latch (extents/selectClassify skip under #141) **held ~1.3×**;
  selectClassify id-replay after #128 held ~1.16×; rock visit context-only held ~1.09×
- prepareFrame → (unchanged; quiet-VFX floors still held)
- syncEntityViews → presentationQueries.query (#74+#77), refreshVisibleEntity (#76),
  updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81), applySnapshotPose (hold ~0.85×)
- registry.step → preStep / packCombatTable / lifetimeSweep residual;
  tumbleStates quiet latch (#140); tacticalAI quiet latch (#139); CM #129 + fields #130
  + bombs #131 + far #132 + optic #133 + decode-runway #134 + field-interact still #135
  + poi-scan #136 + dockingCorridor far #137 shipped
- world / `_tickAsteroidFieldInteractions` → still-player (#135) shipped; empty
  complement held (floor ~1.22×)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| — | **none** (#142 miss) | No weak package. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| classify flying-early-latch under #141 (skip extents/pinFacts/selectClassify after flying-frame-retain; eligibility + drift-bounded deepen) | **HOLD** — prod-profile median ~1.34–1.39× / floor ~1.21–1.26×; rocks48 in-process ~1.31×. Below ≥~1.5× bar. 0 stale-glass on soak when eligibility present; not enough portable win. Reverted from scratch tip. |
| flying-early-latch IDEAL upper bound (skip ensure entirely) | probe ~3000× — proves cost is inside ensure/classify, but legal cut cannot skip ensure |
| lifetimeSweep no-nonplayer-movable full-skip sketch | ~5× unfair (skips bus.flush / player transform / compact); careful synthetic ~1.60× already held |
| per-rock flying retain alone / hazards empty-list / far / env-machinery far / asteroid-field empty / classify id-replay / rock visit-context / prepareFrame quiet-VFX / zoneAt cell-retain / lifetimeSweep compact-skip | **not casually retried** (held floors) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   (rescan-path / non-rock visit residual; selectClassify residual — id-replay
   after #128 held ~1.16×; rock visit context-only held ~1.09×;
   **flying-early-latch held ~1.3×**). Prefer angles that still move residual
   under flying retain without replaying the early-latch skip of
   extents+selectClassify (NPC/ship visit deepen, disc-admission index).
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
   skip-lane-compact-when-no-membership ~1.45× thin;
   **classify flying-early-latch ~1.3×**.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `c2a9bf1733560e100a43e285845823bebd91523a` (unchanged; #141 tip; thin #142 latch reverted)
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Package: none this pass (miss-only digest)
