# IMPORT_DIGEST report — 2026-09-24by (post-import hillclimb)

Master tip: **`8ebdf5537`** (fetched; station UI / ORRERY / model-survey landed after #114 base).

## Stack refresh

Scratch `vm-work/hillclimb-20260924k` on `origin/master` @ `8ebdf5537`;
through #117 @ `6e0af77bf`; +#118 measured on stacked tip @ `33355d9bc`. Profile
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
| 102 | `energy-bolt-quiet-begin-commit` |
| 103 | `energy-quiet-hide-latch` |
| 104 | `energy-quiet-relevant-skip` |
| 105 | `seam-markers-quiet-hide-latch` |
| 106 | `status-attached-quiet-empty-latch` |
| 107 | `tumble-body-language-quiet-skip` |
| 108 | `trail-emit-idle-drive-walk` |
| 109 | `docking-cradle-quiet-skip` |
| 110 | `law-heat-telegraph-quiet-skip` |
| 111 | `swing-trace-quiet-idle-skip` |
| 112 | `speed-lines-quiet-idle-latch` |
| 113 | `field-force-quiet-empty-latch` |
| 114 | `bomb-presentation-quiet-empty-latch` |
| 115 | `loot-magnet-quiet-empty-latch` |
| 116 | `sprites-idle-commit-skip` |
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
**energy-bolt quiet empty commit (~1.41× — hold; superseded by #102 begin+commit latch ~4.5×)**;
**energy quiet hide consecutive reset (shipped #103 ~11.8× — supersedes idle plasma/retro/fleet.reset churn)**;
**energy quiet-hidden relevant probe (shipped #104 ~4.3× — supersedes idle `_energyPlumeRelevant` drive walk)**.
**seam-markers relevant+sleep quiet latch (shipped #105 ~3.6× — supersedes prior no-wake hold ~4.6×)**.
**status-attached quiet empty latch (shipped #106 ~134× — Object.keys collect + housekeeping)**.
**tumble body-language quiet latch (shipped #107 ~29× — pitchPresentationEpoch wake; supersedes prior no-wake hold ~29×)**.
**trail emit idle drive walk (shipped #108 ~7× — cheap maybe-awake + empty-ribbon share)**.
**docking cradle quiet idle latch (shipped #109 ~2.16× — phase/berth wake; fade still runs)**.
**law-heat telegraph quiet idle latch (shipped #110 ~3.6× — scan/heat wake seq)**.
**swing-trace quiet idle latch (shipped #111 ~1.87× — tether.active wake)**.
**target-contour quiet idle latch (~1.0× — hold; null-id resolve already cheap)**.
**field-force quiet empty latch (shipped #113 ~2.5× — fields.active / residual-slot wake)**.
**bomb-presentation quiet empty latch (shipped #114 ~2.6× — entityIndexVersion wake; sticky after first bomb owner)**.
**tether-web quiet empty latch (~0.93× — drop; empty-assign noise)**.
**wreck-wisps quiet irrelevant latch (shipped #117 ~3.4× — version-only wake; supersedes prior hold that still re-scanned while latched ~0.96×)**.
**loot-magnet quiet empty buckets (shipped #115 ~3.0× — empty-bucket only; entityIndexVersion wake)**.

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
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89+#90+#91+#92+#93+#94+#95+#96+#97+#98+#99+#100+#101+#102+#103+#104+#105+#106+#107+#108+#109+#110+#111+#112+#113+#114+#115+#116+#117+#118 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61+#82 |

### Notable callees (post-#94)

- prepareFrame → syncEntityViews (**#57+#74+#76+#77+#81**), camera.follow (**#63+#65+#73+#78** clearance, **#71** framing trust, **#72+#79** lookAt retain), syncAsteroidInstancePool (**#80**), packPresentationWorldToFence (**#68+#75**), ArcadeStructuralFx (**#89**), PhasedExplosion (**#90**), PersistentBeams (**#91**), particles idle commit (**#92**), WeaponDischargePool (**#93**), plasmaStream cold reset (**#94**), HullScorch (**#95**), DistortionField (**#96**), WeaponRibbon (**#97**), RcsImpulse (**#98**), WeaponLight (**#99**), ContinuousPlume fleet sleep (**#100**), Quarks empty update (**#101**), EnergyBolt begin+commit (**#102**), energy quiet hide (**#103**), energy quiet relevant skip (**#104**), seam markers quiet hide (**#105**), status-attached quiet empty (**#106**), tumble body-language quiet (**#107**), trail emit idle drive (**#108**), docking cradle quiet (**#109**), law-heat telegraph quiet (**#110**), swing-trace quiet (**#111**), speed-lines quiet (**#112**), field-force quiet empty (**#113**), bomb telegraph quiet empty (**#114**), loot-magnet quiet empty buckets (**#115**), sprites idle commit (**#116**), wreck-wisps quiet empty (**#117**), momentum-sink quiet empty (**#118**), spaceBg (hold), hot plasma residual (volumetric/retro held)
- syncEntityViews → presentationQueries.query (**#74+#77**), refreshVisibleEntity (**#76**), updateCraftMicroMotion (**#57**), noteRealtimeShadowCasterPose (**#81** call-site quiet skip), applySnapshotPose (hold ~0.85×)
- classifyWorld → resolvePins, normalizePinReasons (**#64**), selectClassifyEntities (**#60**), reusablePins, shouldSyncPhysics (**#62**)
- registry.step → preStep (**#56+#59+#82**), packCombatTable, stampNearWorkBudget (**#61+#82**), combat kernel pre/post (**#83+#84+#85+#86+#87**), input.update (**#55**), lifetimeSweep (**#88** lane corpse compact; dirty-publish trust still dropped), eventTrace sanitize (**#58**), ai.stack liveFramesFor (**#66**), liveListSquads (**#67**), sampleProjectileEvidence (**#69**), StuntFlightObserver.update (**#70**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 118 | `momentum-sink-quiet-empty-latch` | Portable quiet `_updateMomentumSinkPresentation` empty combat.entities walk **~137×** median (48 entities × 200k; floor minSpeedup ≥101.99× across 4 package runs). Latch after empty collect when statusNextPendingSeq trustworthy; wake on seq bump. Dirty-wake proved. No-seq refuses latch. Focused momentum-sink latch+presentation + loot-magnet+wreck-wisps+sprites+field-force+inactive 26/26. Soft-GPU fps not claimed. |
| 117 | `wreck-wisps-quiet-irrelevant-latch` | Portable quiet `_wreckWispsRelevant` empty wrecks latch **~3.4×** median (200k; floor minSpeedup ≥2.87× across 4 package runs). Latch after empty observe when entityIndexVersion trustworthy; wake on version bump. Dirty-wake proved. Type-filter empty check; no-index refuses latch. Focused wreck-wisps+loot-magnet+sprites+field-force+bomb+vfx-save+inactive 18/18. Soft-GPU fps not claimed. |
| 116 | `sprites-idle-commit-skip` | Portable quiet `_integrateSprites` idle reset+commit latch **~6.4×** median (4 buckets × 7 bindings × 200k; floor minSpeedup ≥5.89× across 4 package runs). Latch after first idle publish; wake on `_activateSprite`. Dirty-wake proved. Focused sprites latch+instanced-pool+structured-transients+vfx-save 16/16. Soft-GPU fps not claimed. |
| 115 | `loot-magnet-quiet-empty-latch` | Portable quiet `_lootMagnetRelevant` empty pickups+payloads latch **~3.0×** median (200k; floor minSpeedup ≥2.48× across 4 package runs). Latch after empty-bucket observe when entityIndexVersion trustworthy; wake on version bump. Dirty-wake proved. No-index fallback refuses latch. Focused loot-magnet+inactive+field-force+bomb+speed-lines+swing-trace 16/16. Soft-GPU fps not claimed. |
| 114 | `bomb-presentation-quiet-empty-latch` | Portable quiet `BombPresentationBatch.update` empty latch **~2.6×** median (200k; floor minSpeedup ≥2.15× across 4 package runs). Latch after empty publish when entityIndexVersion trustworthy; wake on version bump. Dirty-wake proved. No-index fallback refuses latch. Focused bomb latch+presentation 9/9 (+ ordnance 35/35 + choreography 20/20 + inactive 1/1). Soft-GPU fps not claimed. |
| 113 | `field-force-quiet-empty-latch` | Portable quiet `FieldForcePresentation.update` empty latch **~2.5×** median (200k; floor minSpeedup ≥1.94× across 4 package runs). Latch after empty publish (no active / no residual slots / batch.count===0); wake on fields.active or releasing slots. Dirty-wake proved. Release residue still updates. Focused field-force latch+lifecycle+force-language+inf-043 44/44 (+ shield-shell 7/7 + inactive 1/1). Soft-GPU fps not claimed. |
| 111 | `swing-trace-quiet-idle-skip` |
| 112 | `speed-lines-quiet-idle-latch` | Portable quiet `feel._updateSpeedLines` idle latch **~2.40×** median (200k; floor minSpeedup ≥1.748× across 4 package runs). Latch after opacity/grain floor; wake on speed/boost/physicsEarned. Dirty-wake proved. Loading/photo-hide clear latch. Focused speed-lines+swing+release-arc+uvp+cradle+law-heat+inactive+vfx-save+stroke-cache 32/32. Soft-GPU fps not claimed. |
| 110 | `law-heat-telegraph-quiet-skip` | Portable quiet `vfx._updateLawHeatTelegraph` idle latch **~3.6×** median (6-slot light pool × 200k; floor minSpeedup ≥2.986× across 3 package runs). Latch after live===0; wake on scan/heat accept seq. Dirty-wake proved. Focused law-heat+inactive+cradle+vfx-save 18/18 (+ status-attached 4/4). Soft-GPU fps not claimed. |
| 109 | `docking-cradle-quiet-skip` | Portable quiet `vfx._updateDockingCradle` idle fade latch **~2.16×** median (12 proxies × 200k; floor minSpeedup ≥1.758× across 3 package runs). Latch on visible01≤0.004 + no corridor berth; wake on phase/berth. Dirty-wake proved. Focused cradle+inactive+vfx-save+corridor 31/31. Soft-GPU fps not claimed. |
| 108 | `trail-emit-idle-drive-walk` | Portable quiet `vfx._emitTrails` idle shipLike `_engineDriveFor` walk **~7×** median (48 ships × 200k; floor minSpeedup ≥3.998× across 3 package runs; typical pair floor ≥6.0×). Latch on empty emit; wake on cheap throttle/speed/actuator/input + entityIndexVersion. Empty ribbon update shares latch when map empty. Dirty-wake proved. Focused trail+ribbon+wing+thruster+plasma+retro+history+inactive 71/71. Soft-GPU fps not claimed. |
| 107 | `tumble-body-language-quiet-skip` | Portable quiet `vfx._updateTumbleBodyLanguageVfx` shipLike walk **~29×** median (48 ships × 200k; floor minSpeedup ≥25.9× across rebenches). Latch on empty walk+empty cadence; wake on `pitchPresentationEpoch` (safe vs entityIndexVersion-only). Dirty-wake proved. Focused thrown-trail+massline-uvp+inactive-plan+ship-pitch+inf-027+combat-vfx 38/38. Soft-GPU fps not claimed. |
| 106 | `status-attached-quiet-empty-latch` | Portable quiet `vfx._updateStatusAttachedVfx` empty collect+housekeeping **~134×** median (32 combat rows × 200k; floor minSpeedup ≥126× across rebenches). Alloc-free `for...in`+`STATUS_ROW_IDS`; latch on empty collect+empty cd; wake on `statusNextPendingSeq`. Dirty-wake proved. Focused status-attached 4/4; inf-045 contour 6/6; thruster propulsion-family 68/68. Soft-GPU fps not claimed. |
| 105 | `seam-markers-quiet-hide-latch` | Portable quiet-irrelevant seam `_seamMarkersRelevant`+`_sleepSeamMarkers` **~3.6×** median (200k; floor minSpeedup ≥2.59× across rebenches). Safe dirty wake: player quantum / `entityIndexVersion` / drawWu / mining pulse / 0.35s re-probe. Focused dynamic-buffer-ranges 24/24; trail-streak-instancing pass; vfx-additive-single-pass pass; thruster propulsion-family 68/68. Soft-GPU fps not claimed. |
| 104 | `energy-quiet-relevant-skip` | Portable quiet-hidden `vfx._updateEnergy` relevant probe **~4.3×** median (200k; floor minSpeedup ≥3.1× across rebenches). Cheap `_energyQuietMaybeAwake` while `#103` hide-latched. Focused thruster propulsion-family 68/68; plasma-unit 26/26; retro+history+plasma 29/29. Soft-GPU fps not claimed. |
| 103 | `energy-quiet-hide-latch` | Portable quiet `vfx._hideEnergyPlumes` after first cold publish **~11.8×** median (200k; floor minSpeedup ≥10.3× across rebenches). Stops plasma/retro/fleet.reset churn that also cleared #100 asleep latch. Focused thruster propulsion-family 68/68; plasma-unit 26/26; retro+history+plasma 29/29. Soft-GPU fps not claimed. |
| 102 | `energy-bolt-quiet-begin-commit` | Portable quiet `EnergyBoltPool.beginFrame`+`commit` when already empty **~4.5×** median (200k; floor minSpeedup ≥3.82×). Supersedes commit-only hold ~1.41×. Focused weapon-vfx-techniques 16/16; vfx-techniques 9/9; vfx-force-language 92/92. Soft-GPU fps not claimed. |
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
| sprites idle commit skip (4-bucket reset+commit while liveSpriteCount===0) | **shipped #116 ~6.4×** (floor ≥5.89× across package runs; activate dirty-wake; mirrors #92 particles) |
| bomb-presentation quiet empty latch (frustum + a11y + empty walk + publish(0) after owner exists) | **shipped #114 ~2.6×** (floor ≥2.15× across package runs; entityIndexVersion dirty-wake; no-index refuses latch) |
| loot-magnet quiet empty buckets (player + dual indexedTypeScan when pickups/payloads empty) | **shipped #115 ~3.0×** (floor ≥2.48× across package runs; entityIndexVersion dirty-wake; no-index refuses latch) |
| wreck-wisps quiet irrelevant latch (player + scan + Map.clear; version-only wake) | **shipped #117 ~3.4×** (floor ≥2.87× across package runs; entityIndexVersion dirty-wake; supersedes prior re-scan wake hold ~0.96×) |
| momentum-sink quiet empty latch (combat.entities for-in + MOMENTUM_SINK status probe; statusNextPendingSeq wake) | **shipped #118 ~137×** (floor ≥101.99× across package runs; statusNextPendingSeq dirty-wake; no-seq refuses latch) |
| ceres-job-action / pending-detonations / overlay-bundle / gas-a11y quiet latches | **~0.99–1.03× under bar / hold** (thin residual; latch overhead ≥ saved work) |
| contact-shadow retain commit-skip (N=8 unchanged) | **~1.04× under bar / hold** |
| tether-web quiet empty latch (empty byId for-in + count/visible reassign) | **~0.93× drop** (empty-assign noise) |
| field-force quiet empty latch (frustum + slot reserved walk + batch commit(0) when already empty) | **shipped #113 ~2.5×** (floor ≥1.94× across package runs; fields.active / residual-slot dirty-wake; release residue kept) |
| target-contour quiet idle latch (resolve+clear when no target/gun) | **~1.0× under bar / hold** (null-id resolve already cheap) |
| feel speed-lines quiet idle latch (governed-combat + drive + region + publish at opacity/grain floor) | **shipped #112 ~2.40×** (floor ≥1.748× across package runs; speed/boost/physicsEarned dirty-wake) |
| massline swing-trace quiet idle latch (tether resolve + a11y + geometry) | **shipped #111 ~1.87×** (floor ≥1.584× across package runs; tether.active dirty-wake) |
| law-heat telegraph quiet idle latch (a11y + stamp alloc + light-pool find/release) | **shipped #110 ~3.6×** (floor ≥2.986× across package runs; scan/heat wake seq) |
| docking cradle quiet idle latch (proxy scan + update + geometry after fade) | **shipped #109 ~2.16×** (floor ≥1.758× across package runs; phase/berth dirty-wake) |
| trail emit idle drive walk (shipLike `_engineDriveFor` every emit tick) | **shipped #108 ~7×** (floor ≥4.0× across package runs; cheap maybe-awake; empty-ribbon share) |
| tumble body-language quiet latch (shipLike walk; pitchPresentationEpoch wake) | **shipped #107 ~29×** (floor ≥25.9×; supersedes prior no-wake hold) |
| status-attached quiet empty latch (Object.keys collect + Set/Map housekeeping every idle tick) | **shipped #106 ~134×** (floor ≥126×; wake on statusNextPendingSeq; alloc-free collect) |
| `_energyPlumeRelevant` while `_energyQuietHidden` (full drive walk every idle tick) | **shipped #104 ~4.3×** (floor ≥3.1×; cheap maybe-awake) |
| `_sleepNpcJobSignatures` quiet latch (12-slot clear every idle tick) | **~1.56× under bar / hold** (floor ~1.40×) |
| seam-markers quiet hide latch (relevant+sleep + safe dirty wake) | **shipped #105 ~3.6×** (floor ≥2.59×; player quantum / index version / drawWu / pulse / 0.35s re-probe) |
| `_hideEnergyPlumes` quiet latch (plasma/retro/fleet.reset every idle tick) | **shipped #103 ~11.8×** (floor ≥10.3×; also stops clearing #100 asleep latch) |
| EnergyBoltPool beginFrame+commit quiet latch (Map.clear + uniforms + attr republish) | **shipped #102 ~4.5×** (floor ≥3.82×; supersedes commit-only ~1.41× hold) |
| EmergentPrimitivePools quiet-empty latch (count/visible re-assign) | **~1.22× under bar / hold** (empty-assign model still ~1.46× hold) |
| syncBolts early-out with entity projectile probe (48 non-projectiles) | **~1.45× under bar / hold** (pool-level latch is the shippable cut) |
| Quarks BatchedParticleRenderer quiet-empty (11 families particleNum===0) | **shipped #101 ~3.6×** (floor ≥2.81×) |
| FamilyProductionFleet quiet-asleep skip (6 families × 5 layers re-zero) + ContinuousPlume quiet-empty | **shipped #100 ~3.1×** (floor ≥2.18×; secondary ~2.0×) |
| (held poles not casually retried — volumetric/retro / prior holds) | — |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77+#78+#79+#80+#81+#89+#90+#91+#92+#93+#94+#95+#96+#97+#98+#99+#100+#101+#102+#103+#104+#105+#106+#107+#108+#109+#110+#111+#112+#113+#114+#115+#116+#117+#118
   (syncEntityViews residual closures / microMotion; sprites idle-commit shipped #116;
   wreck-wisps empty shipped #117; momentum-sink empty shipped #118; authored-instance
   static reuse held ~1.3×; under-roof clearance stamp-check path; clearance movers
   retain held ~1.26×; applySnapshotPose identical-write held; spaceBg; feel
   speed-lines shipped #112; field-force shipped #113; bomb telegraph shipped #114;
   hot-drive plasma residual;
   volumetric/retro cold-reset held ~1.42–1.48×; emergent empty-assign/latch held
   ~1.22–1.46×; npc-job-signatures quiet sleep held ~1.56×; massline release-arc
   residual; target-contour quiet held ~1.0×;
   tether-web empty-assign dropped ~0.93×).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins; selectClassify residual; rock visit context-only held ~1.09×).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87+#88
   (preStep residual / packCombatTable residual / lifetimeSweep dirty-publish /
   tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81 (ordnance residual after #114 /
   query miss path / residual microMotion / applySnapshotPose).
5. Soft-GPU fps is not a KPI.
