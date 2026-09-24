# IMPORT_DIGEST report — 2026-09-24dj (post-#149; #150 ship)

Master tip: **`97c88f92b`** (fetched; unchanged since #149 / digest 20260924di).

## Stack refresh

Scratch `vm-work/hillclimb-20260924m` @ `259e98de3` on `origin/master`
@ `97c88f92b` through #150. No restack needed (master tip unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (+ `settled-20s-stacked-20260924ad` cross-check; Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–149 | (unchanged — see digest 20260924di / dh) |
| **150** | **pirate-disengage-empty-quiet-latch** (this digest) |

### SKIP / hold (unchanged + prior)

Carry forward all holds from digest 20260924di / dh / dg / df / de / dd / dc / db / da / cz. Prior holds still stand:
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
Prior #142 scour holds: lifetimeSweep dirty-publish fair ~1.04×;
classify NPC visit under frame-miss ~1.08×; selectClassify spatial stub ~1.12×;
adaptive quantize cruise fair regress ~0.78–0.98× — do not retry casually.
**#143-miss holds (still stand):** asteroid-motion sticky
settled-skip ~1.14× / floor ~1.00×; render-entity-frame unchanged retain ~1.21× /
floor ~1.11× (yaw inform ~1.44×); lifetimeSweep pose-rematch skip ~1.14×;
lifetimeSweep sleeping-clocks skip ~1.12×.
packCombat single-dirty remains held (synthetic ~2× noisy; not casually retried).

**#144-miss holds that remain:**
- **lifetimeSweep quiet-compact-skip** (clocks-gated typed-lane skip + entity:killed→MEMBERSHIP
  bridge sketch): isolated median **~1.61–1.72×** / floorMedian **1.672×** but floorMin
  **1.301×** — held (thin floor; held-adjacent to membership-only compact-skip ~1.45×).
  Movables-only variant regresses ~0.82×.
- **sampleProjectileEvidence quiet surface-cadence deepen** (ignore warm surfaceHistory;
  cadence16 while quiet): median **~1.0×** noise — held.
- stampNearWork vs noop envelope huge but stampNearWork-empty remains held.
- bus.flush empty already early-outs; length-check sketch thin/noisy.

**#145-miss holds that remain:**
- weapons quiet residual deepen (skip sampleProjectileEvidence / player-tick-only sketches)
  ~1.0–1.3× vs full quiet path — held (thin; #144 latch already owns the NPC walk).
- impulseCharges empty residual ~0.15 µs/call — too thin to clear portable bar fairly.
- updateDockRange far residual ~0.86 µs/call — thin absolute; not packaged.
- spatialHash all-sleeping sync latch sketch huge but unfair with live player dynamic —
  not casually retried without awake-set rewrite.
- tether-web empty VFX latch remains regress (~0.93×).

**#146 / #147 / #148 / #149 carry:** no new thin holds (shipped catch-nets / sanctuary /
salvage / bountyHunt).
flybyFocus quiet-idle probe ~16× synthetic / abs ~0.55 µs — deferred (thin abs vs
updateDockRange hold band; not packaged).

**#150 this pass:** no new thin holds (shipped fresh pirateDisengage empty combatant angle).
Abs before ~4.02 µs/call — well clear of the flybyFocus / bountyHunt thin-abs band.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`: salvage residual after #146/#147;
#149 claimed bountyHunt; this pass claimed pirateDisengage empty combatant dual
census under registry.step / combat.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#150 pirateDisengage; preStep / packCombat still open |
| 269 | `classifyWorld` | residual after …+#141; flying-early-latch held ~1.3×; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#142; asteroid settled + render-entity-frame retain thin |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held) |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#150)

- syncEntityViews → presentationQueries.query (#74+#77+#**142** pose-dirty retain),
  refreshVisibleEntity (#76), updateCraftMicroMotion (#57), noteRealtimeShadowCasterPose (#81),
  applySnapshotPose (hold ~0.85×), ordnance / closures / classifyRenderEntity residual
  (unchanged-retain ~1.21× thin); asteroid tumble write dominates pristine path
- classifyWorld → flying rock/frame retain (#141); flying-early-latch held ~1.3×;
  selectClassify id-replay after #128 held ~1.16×; rock visit context-only held ~1.09×;
  NPC visit ~1.08×; spatial stub ~1.12×
- prepareFrame → (unchanged; quiet-VFX floors still held)
- registry.step → preStep / packCombatTable / lifetimeSweep (#**143** quiet short-lived
  clocks skip); weapons (#**144** NPC quiet idle latch); lawSecurity customs cones
  (#**145** empty quiet latch); lootShards catch-nets (#**146** empty quiet latch);
  lawSecurity sanctuary (#**147** empty quiet latch);
  salvageActions unstable (#**148** empty quiet latch);
  bountyHunt empty hunters (#**149** empty quiet latch);
  pirateDisengage empty combatants (#**150** empty quiet latch);
  tumbleStates (#140) + tacticalAI (#139)
  + CM/fields/bombs/far/optic/decode/field/poi/dock shipped;
  pose-rematch / sleeping-clocks / compact-skip / dirty-publish / quiet-compact-skip remain held

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **150** | **pirate-disengage-empty-quiet-latch** | Isolated `pirateDisengage.update` median **~45.1–46.8×** / floorMin **≥36.87×** (5×11-pair @ 60k quiet roster, `--expose-gc` children); dirty-wake OK (pirate spawn → normalize); focused **58/58**. Soft-GPU fps not claimed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| **pirateDisengage empty quiet latch** | **SHIP #150** — median ~45.1–46.8× / floor ≥36.87×; dirty-wake pirate→clear OK. Fresh combat residual after #149. |
| flybyFocus quiet-idle / impulseCharges empty / updateDockRange far / spatial all-sleeping sketch | **not casually retried** (held from #145/#148) |
| packCombat single-dirty / flying-early-latch / NPC visit / spatial stub / asteroid settled / render-entity-frame retain / pose-rematch / sleeping-clocks / dirty-publish / quiet-VFX / zoneAt / preStep-all-sleeping / stampNearWork-empty / projectile-evidence surface-cadence / env-machinery far / hazards far / weapons residual deepen / quiet-compact-skip / bountyHunt deepen | **not casually retried** (held / shipped) |
| loot-magnet empty buckets / law-heat-telegraph idle | **not packaged** — magnet only pays when `lootMagnetRange>0` (mod unlocked); telegraph is prepareFrame quiet-VFX-adjacent held cluster |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   (NPC/ship visit deepen still thin ~1.08×; disc-admission visit-retain thin
   ~1.12×; **flying-early-latch held ~1.3×**; id-replay ~1.16×; rock context ~1.09×).
   Prefer angles that still move residual under flying retain without replaying
   the early-latch skip of extents+selectClassify.
2. registry.step after …+#150 (preStep residual / packCombatTable residual /
   lifetimeSweep quiet-clocks shipped; weapons NPC quiet shipped; customs cones
   shipped; catch-nets shipped; sanctuary shipped; salvage unstable shipped;
   bountyHunt empty hunters shipped; pirateDisengage empty combatants shipped;
   **quiet-compact-skip thin floor held**;
   pose-rematch / sleeping-clocks / compact-skip / dirty-publish fair remain held;
   tumbleStates + tacticalAI quiet residuals; lawSecurity wanted / ambient residual
   deepen; HUD NEW angles; flybyFocus quiet-idle deferred thin abs).
   Prefer NEW preStep / packCombat / law wanted·ambient deepen / HUD angles that are not
   single-dirty / all-sleeping / stamp-empty / cones / catch-nets / sanctuary / salvage /
   bountyHunt / pirateDisengage.
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81+#142 (closures /
   microMotion / ordnance / applySnapshotPose hold ~0.85×; query pose-dirty shipped;
   asteroid settled ~1.14× + render-entity-frame retain ~1.21× held).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery far (held ~0.87×).
7. Deferred/held: hazards far; asteroid-field **empty** ~1.22×; zoneAt;
   lifetimeSweep no-movable / compact-skip / pose-rematch / sleeping-clocks /
   **quiet-compact-skip floorMin 1.30×**;
   **flying-early-latch ~1.3×**; asteroid-motion settled; render-entity-frame
   unchanged retain; projectile-evidence surface-cadence deepen ~1.0×;
   weapons quiet residual deepen ~1.3×; spatial all-sleeping sync (needs awake-set);
   impulseCharges empty; updateDockRange far; tether-web empty VFX;
   flybyFocus quiet-idle thin abs ~0.55 µs.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `259e98de323a84dfa64da32215c140da0f9136db`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `97c88f92b`
- Clean master patch (am verify): `8dbf201ee` on `97c88f92b`
