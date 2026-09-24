# IMPORT_DIGEST report — 2026-09-24at (post-import hillclimb)

Master tip: **`7850b341e`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` through #80 @ `aa1322c41`; +#81 measured on
stacked tip @ `c2f41b0f7`. Fresh profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31 | `optic-field-resident` |
| 32 | `emergent-hot-spatial` |
| 33 | `share-unchanged-ship-materials` |
| 34 | `hud-credits-pulse-no-reflow` |
| 35 | `prune-evidence-cadence` |
| 36 | `projectile-surface-distance-first` |
| 37 | `classify-closed-form-index` (rebased) |
| 38 | `classify-signature-prune-membership` |
| 39 | `registry-step-dispatch` |
| 17 | `asteroid-query-callers` |
| 1 | `far-actor-cell-key` |
| 13 | `prepare-pitch-settle` |
| 15 | `sync-entity-views-submit-scratch` |
| 12 | `massline-settext-cache` (rebased) |
| 40 | `stunt-threat-index-lanes` |
| 41 | `far-query-row-scan` |
| 42 | `hud-objective-plate-cache` |
| 43 | `fields-npc-plan-cadence` |
| 44 | `sync-entity-views-middle-policy-cadence` |
| 45 | `classify-signature-record` |
| 46 | `snapshot-fence-yaw-quat-cache` |
| 47 | `composition-threat-prefilter` |
| 48 | `classify-rock-body-context` |
| 49 | `stunt-threat-lock-prefilter` |
| 50 | `combat-table-pose-incremental` |
| 51 | `snapshot-fence-dirty-incremental` |
| 52 | `asset-residency-diagnostics-cache` |
| 53 | `authored-instance-camera-quantize` |
| 54 | `decode-runway-top2-select` |
| 55 | `gamepad-idle-clean-skip` |
| 56 | `volatile-index-cadence` |
| 57 | `micromotion-settled-skip` |
| 58 | `event-trace-thrust-sanitize` |
| 59 | `prestep-movables-trust` |
| 60 | `select-classify-epoch-seen` |
| 61 | `stamp-near-work-awake-cache` |
| 62 | `classify-physics-partition-cache` |
| 63 | `camera-clearance-asteroid-span-reject` |
| 64 | `classify-normalize-pins-small-n` |
| 65 | `camera-clearance-never-roof-exclude` |
| 66 | `sensor-contact-scratch-fill` |
| 67 | `roster-retain-stable` |
| 68 | `snapshot-fence-zero-dirty-retain` |
| 69 | `stunt-projectile-evidence-quiet-iter` |
| 70 | `stunt-flight-history-quiet-skip` |
| 71 | `composition-framing-trust` |
| 72 | `chase-lookat-retain` |
| 73 | `camera-clearance-floor-retain` |
| 74 | `presentation-query-zero-dirty-retain` |
| 75 | `snapshot-fence-dirty-slot-list` |
| 76 | `presentation-world-unchanged-refresh-skip` |
| 77 | `presentation-query-retain-pos-quantize` |
| 78 | `camera-clearance-floor-retain-pos-quantize` |
| 79 | `chase-lookat-retain-pos-quantize` |
| 80 | `asteroid-instance-camera-quantize` |
| 81 | `shadow-caster-pose-quiet-skip` |
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged + this pass)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar),
imminent-collision earlyout (~1.22× under bar), rock-resolvePins-only (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10× — not lane trust),
reusablePins pinBits short-circuit (slower on quiet 0–2 pin arrays),
normalizePinReasons/bitfield materialize (~0.87× — miss; distinct from #64 small-n),
lifetimeSweep dirty-publish isMovableEntity trust (thin ~1.51–1.69×; **full-pole ~1.08× — drop**),
classify physics-partition fuse-only (~1.44× under bar — replaced by cache),
**roster-member-scratch-fill (alloc-only ~0.97× — drop; replaced by #67 retain-stable)**;
**snapshot-fence zero-dirty scan-without-dirtyCount (~0.8× — replaced by O(1) dirtyCount)**;
**contact-base identity retain (~1.27× under bar)**;
**composition quiet cadence with near ambient sticky (~1.0× — hold)**;
**moving chase lookAt without quantize (informational ~1.00× — hold; superseded by #79)**;
**moving clearance floor retain without quantize (~0.85× — hold; superseded by #78)**;
**under-roof clearance stamp-check retain (~1.33× — hold; off-roof is #73+#78 KPI)**;
**moving presentation-query retain without quantize (~0.99× — bounds change; superseded by #77)**;
**Direct Matrix4 lookAt (moving) ~1.43× median / floor ~1.16× — hold (reconfirmed)**;
**resolvePins context-only rock trailing-scan skip ~1.09× — hold (reconfirmed rock-resolvePins)**;
**classify incremental skip currentEntityIds ~1.17× fair visit — under bar / hold**;
**noteRealtimeShadowCasterPose bit-identical early-out ~0.87× — hold (superseded by #81 call-site skip)**;
**applySnapshotPose identical-write skip ~0.85× — hold**;
**clearance floor retain with capital-rock movers (~1.26× median with PIC-07 stamp safety — under bar / hold)**.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61 |

### Notable callees (post-#81)

- prepareFrame → syncEntityViews (**#57+#74+#76+#77+#81**), camera.follow (**#63+#65+#73+#78** clearance, **#71** framing trust, **#72+#79** lookAt retain), syncAsteroidInstancePool (**#80**), packPresentationWorldToFence (**#68+#75**), spaceBg (hold)
- syncEntityViews → presentationQueries.query (**#74+#77**), refreshVisibleEntity (**#76**), updateCraftMicroMotion (**#57**), noteRealtimeShadowCasterPose (**#81** call-site quiet skip), applySnapshotPose (hold ~0.85×)
- classifyWorld → resolvePins, normalizePinReasons (**#64**), selectClassifyEntities (**#60**), reusablePins, shouldSyncPhysics (**#62**)
- registry.step → preStep (**#56+#59**), packCombatTable, stampNearWorkBudget (**#61**), input.update (**#55**), lifetimeSweep (dirty-publish trust dropped), eventTrace sanitize (**#58**), ai.stack liveFramesFor (**#66**), liveListSquads (**#67**), sampleProjectileEvidence (**#69**), StuntFlightObserver.update (**#70**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 81 | `shadow-caster-pose-quiet-skip` | Portable quiet parked cast-band `noteRealtimeShadowCasterPose` call-site skip **~3.63×** median (80 roots × 40k; floor minSpeedup ≥2.49×). Focused shadow suites 35/35. Soft-GPU fps not claimed. |
| 80 | `asteroid-instance-camera-quantize` | Portable quiet chase micro-jitter `syncAsteroidInstancePool` **~3.05×** median (80 rocks × 2k; floor minSpeedup ≥2.87×). Focused asteroid suites 41/41. Soft-GPU fps not claimed. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| shadow caster pose call-site quiet skip (parked cast-band unchanged TRS) | **shipped #81 ~3.63×** |
| clearance floor retain with capital-rock movers (off-roof + xz quantize + PIC-07 stamp) | ~1.26× median / floor ~1.12× — **hold** (under bar once stamp-safe) |
| asteroid instance camera cull 0.25 WU / 1e-3 quantize (quiet chase micro-jitter) | **shipped #80 ~3.05×** |
| chase lookAt retain-key 0.25 WU eye/target quantize (quiet chase drift) | **shipped #79 ~1.92×** |
| clearance floor retain-key 0.25 WU cam quantize (quiet chase drift) | **shipped #78 ~2.07×** |
| noteRealtimeShadowCasterPose bit-identical early-out | ~0.87× — **hold** (superseded by #81) |
| presentation-query retain-key 0.25 WU pos quantize (quiet chase drift) | **shipped #77 ~3.05×** |
| refreshVisibleEntity unchanged early-out (+ writePoseScalars identical skip) | **shipped #76 ~1.60×** |
| Direct Matrix4 lookAt without updateWorldMatrix (moving) | ~1.43× median / floor ~1.16× — **hold** |
| resolvePins context-only skip of trailing entity.data scan (rocks) | ~1.09× — **hold** |
| classify incremental skip currentEntityIds clear+add | ~1.17× fair visit loop — under bar — **hold** |
| glassIds/runwayIds epoch marks alone | ~1.13× — under bar — not shipped |
| atan2/direct-quat chase lookAt | incorrect quat vs Three (maxErr ~1.41) — dropped |
| packFence dirty>0 dirtySlots list | **shipped #75 ~2.01×** |
| presentationQueries zero-dirty identical-cull retain | **shipped #74 ~6.91×** |
| composition quiet cadence (skip 2/3 when no sticky attacker) | ~1.0× with near ambient sticky — **hold** |
| settled lookAt retain | **shipped #72 ~2.14×** |
| settled off-roof clearance floor retain | **shipped #73 ~2.07×** |
| clearance floor retain with per-mesh stamp-check under-roof | ~1.33× — hold |
| moving clearance / presentation-query / lookAt retain (no quantize) | informational under bar — hold; **#77/#78/#79 supersede** |
| lifetimeSweep dirty-publish / pose-publish-list | prior drop / ~1.00× |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| spaceBg steady-state / midflight-wave-hull-decode / syncCombatantBounds | Holds — not retried |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81
   (syncEntityViews residual closures / ordnance / microMotion; under-roof
   clearance stamp-check path; clearance movers retain held ~1.26×;
   applySnapshotPose identical-write held; spaceBg steady-state held).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins; selectClassify residual).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70
   (preStep residual / lifetimeSweep residual / tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (ordnance / query miss path /
   residual microMotion / applySnapshotPose).
5. Soft-GPU fps is not a KPI.
