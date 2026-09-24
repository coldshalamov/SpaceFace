# IMPORT_DIGEST report — 2026-09-24bh (post-import hillclimb)

Master tip: **`273f8bad7`** (fetched; unchanged from #94).

## Stack refresh

Scratch `vm-work/hillclimb-20260924i` on `origin/master` @ `273f8bad7`;
through #100 @ `fd7a2e4f5`; +#101 measured on stacked tip @ `b72bc418c`. Profile
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
| 95 | `hull-scorch-quiet-live-skip` |
| 96 | `distortion-field-quiet-live-skip` |
| 97 | `weapon-ribbon-quiet-live-skip` |
| 98 | `rcs-impulse-quiet-empty-skip` |
| 99 | `weapon-light-quiet-live-skip` |
| 100 | `continuous-plume-fleet-quiet-asleep` |
| 101 | `quarks-quiet-empty-update` |
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
**drawTrail stroke batch (picture change — not shippable under Picture ON)**;
**volumetric-plume cold-reset skip (~1.42× — hold)**;
**player-retro cold-reset skip (~1.44× — hold)**;
**combined volumetric+retro cold-reset (~1.48× — hold)**;
**energy-bolt quiet empty commit (~1.41× — hold)**.

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
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89+#90+#91+#92+#93+#94+#95+#96+#97+#98+#99+#100+#101 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#94)

- prepareFrame → syncEntityViews (**#57+#74+#76+#77+#81**), camera.follow (**#63+#65+#73+#78** clearance, **#71** framing trust, **#72+#79** lookAt retain), syncAsteroidInstancePool (**#80**), packPresentationWorldToFence (**#68+#75**), ArcadeStructuralFx (**#89**), PhasedExplosion (**#90**), PersistentBeams (**#91**), particles idle commit (**#92**), WeaponDischargePool (**#93**), plasmaStream cold reset (**#94**), HullScorch (**#95**), DistortionField (**#96**), WeaponRibbon (**#97**), RcsImpulse (**#98**), WeaponLight (**#99**), ContinuousPlume fleet sleep (**#100**), Quarks empty update (**#101**), spaceBg (hold), feel speed-lines / hot plasma residual (volumetric/retro held)
- syncEntityViews → presentationQueries.query (**#74+#77**), refreshVisibleEntity (**#76**), updateCraftMicroMotion (**#57**), noteRealtimeShadowCasterPose (**#81** call-site quiet skip), applySnapshotPose (hold ~0.85×)
- classifyWorld → resolvePins, normalizePinReasons (**#64**), selectClassifyEntities (**#60**), reusablePins, shouldSyncPhysics (**#62**)
- registry.step → preStep (**#56+#59+#82**), packCombatTable, stampNearWorkBudget (**#61+#82**), combat kernel pre/post (**#83+#84+#85+#86+#87**), input.update (**#55**), lifetimeSweep (**#88** lane corpse compact; dirty-publish trust still dropped), eventTrace sanitize (**#58**), ai.stack liveFramesFor (**#66**), liveListSquads (**#67**), sampleProjectileEvidence (**#69**), StuntFlightObserver.update (**#70**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 101 | `quarks-quiet-empty-update` | Portable quiet `QuarksVfxSystem.update` when all 11 families particleNum===0 **~3.6×** median (80k; floor minSpeedup ≥2.81×). Focused quarks+debris 26/26; vfx-techniques 9/9; vfx-force-language 92/92; 47a debris-sling OK. Soft-GPU fps not claimed. |
| 100 | `continuous-plume-fleet-quiet-asleep` | Portable quiet `FamilyProductionFleet.endFrame` when all 6 families already asleep **~3.1×** median (200k; floor minSpeedup ≥2.18× across rebenches). Secondary ContinuousPlume update quiet-empty **~2.0×** (floor ≥1.68×). Focused thruster propulsion-family 68/68 + rcs/buffer/plume/plasma/vocabulary 98/98. Soft-GPU fps not claimed. |
| 98 | `rcs-impulse-quiet-empty-skip` | Portable quiet `RcsImpulseSystem.update` when already empty **~2.7×** median (80k; floor minSpeedup ≥1.95×; rebench floor ≥2.52×). Focused rcs+thruster+propulsion+buffer+weapon-vfx 98/98. Soft-GPU fps not claimed. |
| 99 | `weapon-light-quiet-live-skip` | Portable quiet `WeaponLightPool.update` when live===0 **~1.60×** median (CAP 2 × 400k; floor minSpeedup ≥1.46×). Focused 98/98. Soft-GPU fps not claimed. Absolute CAP=2 cost is small; clear portable ratio on named residual. |
| 95 | `hull-scorch-quiet-live-skip` | Portable quiet `HullScorchPool.update` when live===0 **~5.3×** median (32 slots × 200k; floor minSpeedup ≥5.32×). Focused weapon-vfx+well+impact+ribbon 54/54. Soft-GPU fps not claimed. |
| 96 | `distortion-field-quiet-live-skip` | Portable quiet `DistortionField.update` when live===0 **~6.5×** median (64 slots × 200k; floor minSpeedup ≥5.70×). Well sync keeps field.live in sync. Focused 54/54. Soft-GPU fps not claimed. |
| 97 | `weapon-ribbon-quiet-live-skip` | Portable quiet `WeaponRibbonPool.update` when live===0 **~65×** median (256 slots × 200k; floor minSpeedup ≥59.4×). Focused 54/54. Soft-GPU fps not claimed. |
| 94 | `plasma-stream-cold-reset-skip` | Portable quiet `PlasmaStreamSystem.update` when already cold + !commanded **~3.3×** median (200k; floor minSpeedup ≥2.81×). Focused plasma+thruster+contrail+retro 62/62. Soft-GPU fps not claimed. |
| 93 | `weapon-discharge-quiet-active-skip` | Portable quiet `WeaponDischargePool.update` when activeCount===0 **~6.7×** median (48 slots × 200k; floor minSpeedup ≥4.86×). Focused weapon-source+force-language+muzzle+wave-a7 36/36. Soft-GPU fps not claimed. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| Quarks BatchedParticleRenderer quiet-empty (11 families particleNum===0) | **shipped #101 ~3.6×** (floor ≥2.81×) |
| FamilyProductionFleet quiet-asleep skip (6 families × 5 layers re-zero) + ContinuousPlume quiet-empty | **shipped #100 ~3.1×** (floor ≥2.18×; secondary ~2.0×) |
| (held poles not casually retried — volumetric/retro/energy-bolt / prior holds) | — |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89+#90+#91+#92+#93+#94+#95+#96+#97+#98+#99+#100+#101
   (syncEntityViews residual closures / ordnance / microMotion; authored-instance
   static reuse held ~1.3×; under-roof clearance stamp-check path; clearance movers
   retain held ~1.26×; applySnapshotPose identical-write held; spaceBg / feel
   speed-lines / hot-drive plasma residual; energy bolts quiet commit held ~1.41×;
   volumetric/retro cold-reset held ~1.42–1.48×).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins; selectClassify residual; rock visit context-only held ~1.09×).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (ordnance / query miss path /
   residual microMotion / applySnapshotPose).
5. Soft-GPU fps is not a KPI.
