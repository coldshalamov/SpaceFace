# IMPORT_DIGEST report — 2026-09-24al (post-import hillclimb)

Master tip: **`7850b341e`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` through #72 @ `1dc05e5d9`; +#73 measured on
stacked tip @ `95eb33e50`. Fresh profile `settled-45s-stacked-20260924ac`
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
**moving chase lookAt (informational ~1.00× — retain rarely hits)**.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70 |
| 269 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62+#64 |
| 202 | `syncEntityViews` | residual after #15+#44+#57 |
| 186 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73 |
| 132 | `hud.frame` | radar.draw + setLagTranslate |
| 111 | `preStep` | residual after #56+#59+#61 |

### Notable callees (post-#73)

- prepareFrame → syncEntityViews (**#57**), camera.follow (**#63+#65+#73** clearance, **#71** framing trust, **#72** lookAt retain), packPresentationWorldToFence (**#68**), spaceBackground (hold)
- syncEntityViews → updateCraftMicroMotion (**#57**), presentationQueries, applySnapshotPose
- classifyWorld → resolvePins, normalizePinReasons (**#64**), selectClassifyEntities (**#60**), reusablePins, shouldSyncPhysics (**#62**)
- registry.step → preStep (**#56+#59**), packCombatTable, stampNearWorkBudget (**#61**), input.update (**#55**), lifetimeSweep (dirty-publish trust dropped), eventTrace sanitize (**#58**), ai.stack liveFramesFor (**#66**), liveListSquads (**#67**), sampleProjectileEvidence (**#69**), StuntFlightObserver.update (**#70**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 73 | `camera-clearance-floor-retain` | Portable settled off-roof `cameraClearanceFloorAt` **~2.07×** median (200k; floor minSpeedup ≥1.72×). Focused camera suites 78/78. Soft-GPU fps not claimed. |
| 72 | `chase-lookat-retain` | Portable settled `applyChaseLookAt` **~2.14×** median (200k; floor minSpeedup ≥2.05×). Focused camera suites 72/72. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| composition quiet cadence (skip 2/3 when no sticky attacker) | ~1.0× with near ambient sticky keeping `sticky.id` warm — **hold** |
| direct Matrix4 lookAt without updateWorldMatrix (moving) | ~1.19× under bar — not shipped alone |
| settled lookAt retain (exact eye+target identity) | **shipped #72 ~2.14×** |
| settled off-roof clearance floor retain (static structural) | **shipped #73 ~2.07×** |
| clearance floor retain with per-mesh stamp-check under-roof | ~1.33× under bar — not primary; off-roof `-Infinity` path is the KPI |
| moving clearance floor retain | informational ~0.85× (cam floats change) — hold |
| roster-member-scratch-fill (alloc-only member/squad records) | **~0.97× — drop**; signature/sort dominate; replaced by retain-stable |
| lifetimeSweep dirty-publish `isMovableEntity` trust | thin sub-loop ~1.51–1.69×; **fair full-pole ~1.08× — drop** |
| lifetimeSweep pose-publish-list reshape | ~1.00× — no win |
| classify physics-partition fuse (inline three checks) | ~1.44× — under bar; replaced by cache |
| resolvePins rockBody skip + normalize | prior under bar — not retried |
| bitfield materialize pins | prior miss — not retried (distinct from #64) |
| normalizePinReasons small-n (n<=2) fast path | **shipped #64 ~1.92×** |
| clearance never-roof structural exclude (after #63) | **shipped #65 ~1.78×** |
| liveFramesFor entityContacts scratch fill | **shipped #66 ~5.75×** |
| liveListSquads retain-when-stable | **shipped #67 ~1.78×** |
| packFence zero-dirty retain (O(1) dirtyCount) | **shipped #68 ~9.2×** |
| packFence zero-dirty JS dirty-scan (no dirtyCount) | ~0.8× — miss; replaced by dirtyCount |
| contact-base identity retain | ~1.27× under bar — hold |
| quiet-iter sampleProjectileEvidence (collidables+for-in+cold cadence) | **shipped #69 ~1.77×** |
| quiet-skip StuntFlightObserver history (no tracks + empty projectiles) | **shipped #70 ~4.66×** |
| composition framing trust (sticky.hadActiveAttacker) | **shipped #71 ~11.75×** framing-alone; follow-pair ~1.06× informational |
| reusablePins pinBits short-circuit | prior miss — not retried |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| spaceBg steady-state | Hold — not retried |
| midflight-wave-hull-decode / syncCombatantBounds | Holds — not retried |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58+#63+#65+#68+#71+#72+#73 (syncEntityViews /
   packFence residual / residual closures; under-roof clearance stamp-check path;
   moving lookAt still full Three cost).
2. classifyWorld after #37+#38+#45+#48+#60+#62+#64 (resolvePins residual /
   reusablePins; selectClassify residual).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70 (preStep residual /
   lifetimeSweep residual / tacticalAI residual).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
