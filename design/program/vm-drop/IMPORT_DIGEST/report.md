# IMPORT_DIGEST report — 2026-09-24dg (post-#146; #147 ship)

Master tip: **`4b28a8323`** (fetched; unchanged since #138 / digest 20260924cu).

## Stack refresh

Scratch `vm-work/hillclimb-20260924m` @ `8113f3292` on `origin/master`
@ `4b28a8323` through #147. No restack this pass (master unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (+ `settled-20s-stacked-20260924ad` cross-check; Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–146 | (unchanged — see digest 20260924df / de) |
| **147** | **sanctuary-empty-quiet-latch** (this digest) |

### SKIP / hold (unchanged + prior)

Carry forward all holds from digest 20260924df / de / dd / dc / db / da / cz. Prior holds still stand:
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

**#146 this pass carry:** no new thin holds (shipped catch-nets).

**#147 this pass:** no new thin holds (shipped fresh sanctuary angle).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`: `_enforceSanctuaryWithdrawals`
residual under lawSecurity after #145/#146 removed cones/catch-nets share.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#147 sanctuary; preStep / packCombat still open |
| 269 | `classifyWorld` | residual after …+#141; flying-early-latch held ~1.3×; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#142; asteroid settled + render-entity-frame retain thin |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held) |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#147)

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
  tumbleStates (#140) + tacticalAI (#139)
  + CM/fields/bombs/far/optic/decode/field/poi/dock shipped;
  pose-rematch / sleeping-clocks / compact-skip / dirty-publish / quiet-compact-skip remain held

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **147** | **sanctuary-empty-quiet-latch** | Isolated `_enforceSanctuaryWithdrawals` median **~14.58–15.87×** / floorMin **≥10.34×** (5×11-pair @ 60k quiet roster, `--expose-gc` children); dirty-wake OK (chase into jurisdiction → withdraw); focused **49/49**. Soft-GPU fps not claimed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| **sanctuary empty quiet latch** | **SHIP #147** — median ~14.58–15.87× / floor ≥10.34×; dirty-wake chase→withdraw OK. Fresh law sanctuary residual after #145/#146. |
| weapons quiet residual deepen / impulseCharges empty / updateDockRange far / spatial all-sleeping sketch | **not casually retried** (held from #145-miss) |
| packCombat single-dirty / flying-early-latch / NPC visit / spatial stub / asteroid settled / render-entity-frame retain / pose-rematch / sleeping-clocks / dirty-publish / quiet-VFX / zoneAt / preStep-all-sleeping / stampNearWork-empty / projectile-evidence surface-cadence / env-machinery far / hazards far | **not casually retried** (held) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   (NPC/ship visit deepen still thin ~1.08×; disc-admission visit-retain thin
   ~1.12×; **flying-early-latch held ~1.3×**; id-replay ~1.16×; rock context ~1.09×).
   Prefer angles that still move residual under flying retain without replaying
   the early-latch skip of extents+selectClassify.
2. registry.step after …+#147 (preStep residual / packCombatTable residual /
   lifetimeSweep quiet-clocks shipped; weapons NPC quiet shipped; customs cones
   shipped; catch-nets shipped; sanctuary shipped; **quiet-compact-skip thin floor held**;
   pose-rematch / sleeping-clocks / compact-skip / dirty-publish fair remain held;
   tumbleStates + tacticalAI quiet residuals; lawSecurity wanted / ambient residual).
   Prefer NEW preStep / packCombat / law residual angles that are not single-dirty /
   all-sleeping / stamp-empty / cones / catch-nets / sanctuary.
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
   impulseCharges empty; updateDockRange far; tether-web empty VFX.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `8113f3292a1e2fd987b4ba1354cc76fdcbe0594a`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `4b28a8323`
- Clean master patch (am verify): `b2442fb8a` on `4b28a8323`
