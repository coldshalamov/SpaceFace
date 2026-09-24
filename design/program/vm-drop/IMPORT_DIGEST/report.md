# IMPORT_DIGEST report — 2026-09-24bd (post-import hillclimb)

Master tip: **`273f8bad7`** (fetched; unchanged from #92).

## Stack refresh

Scratch `vm-work/hillclimb-20260924i` on `origin/master` @ `273f8bad7`;
through #92 @ `bbd35c7e7`; +#93–#94 measured on stacked tip @ `a8c75e836`. Profile
cite remains `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip through #64).

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
| 82 | `stamp-near-work-budget-early-exit` |
| 83 | `combat-kernel-profile-reuse` |
| 84 | `combat-status-subsystem-quiet-skip` |
| 85 | `combat-prephysics-quiet-residual` |
| 86 | `combat-actions-advance-quiet-skip` |
| 87 | `combat-postphysics-quiet-skip` |
| 88 | `lifetime-corpse-lane-compact` |
| 89 | `arcade-structural-fx-quiet-live-skip` |
| 90 | `phased-explosion-quiet-active-skip` |
| 91 | `persistent-beams-quiet-active-skip` |
| 92 | `particles-idle-commit-skip` |
| 93 | `weapon-discharge-quiet-active-skip` |
| 94 | `plasma-stream-cold-reset-skip` |
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged + this pass)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds early-out
(prior miss — superseded for kernel call sites by #83 profile-reuse / post skip),
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
**noteRealtimeShadowCasterPose bit-identical early-out ~0.87× — hold (superseded by #81)**;
**applySnapshotPose identical-write skip ~0.85× — hold**;
**clearance floor retain with capital-rock movers (~1.26× median with PIC-07 stamp safety — under bar / hold)**;
**authored-instance static submission reuse after #53 (~1.25–1.31× @ 0.05 WU — under bar / hold)**;
**makeResult retained scratch (~0.17× — regress / hold)**;
**coolRuntime→stepPropulsion alone (~1.07× — reconfirm flight-propulsion-scratch hold)**;
**packCombatTable single-dirty (~1.42× — under bar / hold)**;
**weapons cool-weapon skip (~1.29× — under bar / hold)**;
**shield-bubble quiet skip (~0.96× — drop)**;
**drawTrail stroke batch (picture change — not shippable under Picture ON)**.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77+#81 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89+#90+#91+#92+#93+#94 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#94)

- prepareFrame → syncEntityViews (**#57+#74+#76+#77+#81**), camera.follow (**#63+#65+#73+#78** clearance, **#71** framing trust, **#72+#79** lookAt retain), syncAsteroidInstancePool (**#80**), packPresentationWorldToFence (**#68+#75**), ArcadeStructuralFx (**#89**), PhasedExplosion (**#90**), PersistentBeams (**#91**), particles idle commit (**#92**), WeaponDischargePool (**#93**), plasmaStream cold reset (**#94**), spaceBg (hold), feel speed-lines / hot plasma residual
- syncEntityViews → presentationQueries.query (**#74+#77**), refreshVisibleEntity (**#76**), updateCraftMicroMotion (**#57**), noteRealtimeShadowCasterPose (**#81** call-site quiet skip), applySnapshotPose (hold ~0.85×)
- classifyWorld → resolvePins, normalizePinReasons (**#64**), selectClassifyEntities (**#60**), reusablePins, shouldSyncPhysics (**#62**)
- registry.step → preStep (**#56+#59+#82**), packCombatTable, stampNearWorkBudget (**#61+#82**), combat kernel pre/post (**#83+#84+#85+#86+#87**), input.update (**#55**), lifetimeSweep (**#88** lane corpse compact; dirty-publish trust still dropped), eventTrace sanitize (**#58**), ai.stack liveFramesFor (**#66**), liveListSquads (**#67**), sampleProjectileEvidence (**#69**), StuntFlightObserver.update (**#70**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 93 | `weapon-discharge-quiet-active-skip` | Portable quiet `WeaponDischargePool.update` when activeCount===0 **~6.7×** median (48 slots × 200k; floor minSpeedup ≥4.86×). Focused weapon-source+force-language+muzzle+wave-a7 36/36. Soft-GPU fps not claimed. |
| 94 | `plasma-stream-cold-reset-skip` | Portable quiet `PlasmaStreamSystem.update` when already cold + !commanded **~3.3×** median (200k; floor minSpeedup ≥2.81×). Focused plasma+thruster+contrail+retro 62/62. Soft-GPU fps not claimed. |
| 92 | `particles-idle-commit-skip` | Portable quiet `_integrateParticles` idle commit republish skip **~2.31×** median (7-binding commit × 200k; floor minSpeedup ≥2.20×). Focused vfx save/restore+quarks+transients 15/15. Soft-GPU fps not claimed. |
| 91 | `persistent-beams-quiet-active-skip` | Portable quiet `PersistentCombatBeamPool.update` when active===0 **~3.67×** median (16 slots × 300k; floor minSpeedup ≥3.09×). Focused beam pool 4/4. Soft-GPU fps not claimed. |
| 90 | `phased-explosion-quiet-active-skip` | Portable quiet `PhasedExplosionLifecycle.update` when active===0 **~6.96×** median (40 slots × 200k; floor minSpeedup ≥6.15×). Focused explosion+impact+killed 34/34. Soft-GPU fps not claimed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| WeaponDischargePool quiet activeCount===0 skip (48-slot walk + begin/end commit(0)) | **shipped #93 ~6.7×** |
| PlasmaStream already-cold !commanded skip (envelope + repeated reset()) | **shipped #94 ~3.3×** |
| (held poles not casually retried — see SKIP / hold) | — |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89+#90+#91+#92+#93+#94
   (syncEntityViews residual closures / ordnance / microMotion; authored-instance
   static reuse held ~1.3×; under-roof clearance stamp-check path; clearance movers
   retain held ~1.26×; applySnapshotPose identical-write held; spaceBg / feel
   speed-lines / hot-drive plasma residual).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins; selectClassify residual; rock visit context-only held ~1.09×).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (ordnance / query miss path /
   residual microMotion / applySnapshotPose).
5. Soft-GPU fps is not a KPI.
