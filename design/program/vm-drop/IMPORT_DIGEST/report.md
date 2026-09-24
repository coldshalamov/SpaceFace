# IMPORT_DIGEST report — 2026-09-24ap (post-import hillclimb)

Master tip: **`7850b341e`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` through #76 @ `f265f0ecb`; +#77 measured on
stacked tip @ `ccc73ef75`. Fresh profile `settled-45s-stacked-20260924ac`
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
**moving chase lookAt (informational ~1.00× — retain rarely hits)**;
**moving clearance floor retain (~0.85× — hold)**;
**under-roof clearance stamp-check retain (~1.33× — hold; off-roof is #73 KPI)**;
**moving presentation-query retain without quantize (~0.99× — bounds change; superseded by #77)**;
**Direct Matrix4 lookAt (moving) ~1.43× median / floor ~1.16× — hold (reconfirmed)**;
**resolvePins context-only rock trailing-scan skip ~1.09× — hold (reconfirmed rock-resolvePins)**;
**classify incremental skip currentEntityIds ~1.17× fair visit — under bar / hold**.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64 |
| 202 | `syncEntityViews` | residual after #15+#44+#57+#74+#76+#77 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61 |

### Notable callees (post-#77)

- prepareFrame → syncEntityViews (**#57+#74+#76+#77**), camera.follow (**#63+#65+#73** clearance, **#71** framing trust, **#72** lookAt retain), packPresentationWorldToFence (**#68+#75**), spaceBackground (hold)
- syncEntityViews → presentationQueries.query (**#74+#77**), refreshVisibleEntity (**#76**), updateCraftMicroMotion (**#57**), applySnapshotPose
- classifyWorld → resolvePins, normalizePinReasons (**#64**), selectClassifyEntities (**#60**), reusablePins, shouldSyncPhysics (**#62**)
- registry.step → preStep (**#56+#59**), packCombatTable, stampNearWorkBudget (**#61**), input.update (**#55**), lifetimeSweep (dirty-publish trust dropped), eventTrace sanitize (**#58**), ai.stack liveFramesFor (**#66**), liveListSquads (**#67**), sampleProjectileEvidence (**#69**), StuntFlightObserver.update (**#70**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 77 | `presentation-query-retain-pos-quantize` | Portable quiet chase-drift `presentationQueries.query` **~3.05×** median (20k; floor minSpeedup ≥2.83×). Focused presentation suites 26/26. Soft-GPU fps not claimed. |
| 76 | `presentation-world-unchanged-refresh-skip` | Portable quiet `refreshVisibleEntity` **~1.60×** median (8k; floor minSpeedup ≥1.51×). Focused presentation suites 24/24. Soft-GPU fps not claimed. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| presentation-query retain-key 0.25 WU pos quantize (quiet chase drift) | **shipped #77 ~3.05×** |
| refreshVisibleEntity unchanged early-out (+ writePoseScalars identical skip) | **shipped #76 ~1.60×** |
| Direct Matrix4 lookAt without updateWorldMatrix (moving) | ~1.43× median / floor ~1.16× — **hold** (reconfirmed prior ~1.19×) |
| resolvePins context-only skip of trailing entity.data scan (rocks) | ~1.09× — **hold** (reconfirmed rock-resolvePins) |
| classify incremental skip currentEntityIds clear+add | ~1.17× fair visit loop — under bar — **hold** |
| glassIds/runwayIds epoch marks alone | ~1.13× — under bar — not shipped |
| atan2/direct-quat chase lookAt | incorrect quat vs Three (maxErr ~1.41) — dropped |
| packFence dirty>0 dirtySlots list | **shipped #75 ~2.01×** |
| presentationQueries zero-dirty identical-cull retain | **shipped #74 ~6.91×** |
| composition quiet cadence (skip 2/3 when no sticky attacker) | ~1.0× with near ambient sticky — **hold** |
| settled lookAt retain | **shipped #72 ~2.14×** |
| settled off-roof clearance floor retain | **shipped #73 ~2.07×** |
| clearance floor retain with per-mesh stamp-check under-roof | ~1.33× — hold |
| moving clearance / presentation-query retain (no quantize) | informational under bar — hold; **#77 supersedes moving query retain** |
| lifetimeSweep dirty-publish / pose-publish-list | prior drop / ~1.00× |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| spaceBg steady-state / midflight-wave-hull-decode / syncCombatantBounds | Holds — not retried |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73+#74+#75+#76+#77
   (syncEntityViews residual closures / ordnance / microMotion; under-roof
   clearance stamp-check path; moving lookAt still full Three cost).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins; selectClassify residual).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70
   (preStep residual / lifetimeSweep residual / tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57+#74+#76+#77 (ordnance / query miss path /
   residual microMotion / applySnapshotPose).
5. Soft-GPU fps is not a KPI.
