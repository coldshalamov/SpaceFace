# IMPORT_DIGEST report — 2026-09-24aa (post-import hillclimb)

Master tip: **`abcccfd87`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` on `abcccfd87` through #61; +#62 measured on
stacked tip @ `fc9ff75bb`.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar),
imminent-collision earlyout (~1.22× under bar), rock-resolvePins-only (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10× — not lane trust),
reusablePins pinBits short-circuit (slower on quiet 0–2 pin arrays),
normalizePinReasons/bitfield materialize (~0.87× — miss this pass),
lifetimeSweep dirty-publish isMovableEntity trust (thin ~1.51–1.69×; **full-pole ~1.08× — drop**),
classify physics-partition fuse-only (~1.44× under bar — replaced by cache).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924w` (Picture ON, soft-GPU; post-#57
stack @ `8b280fb14` before #58). Idle **62.4%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 319 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59+#61 |
| 310 | `classifyWorld` | residual after #37+#38+#45+#48+#60+#62 |
| 204 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#57 |
| 181 | `syncEntityViews` | residual after #15+#44+#57 |
| 153 | `hud.frame` | radar.draw + setLagTranslate |
| 45 | `selectClassifyEntities` | residual after #60 |

### Notable callees (post-#57 / pre-#60)

- prepareFrame → syncEntityViews (**#57**), camera.follow, packPresentationWorldToFence, spaceBackground (hold)
- syncEntityViews → updateCraftMicroMotion (**#57**), presentationQueries, applySnapshotPose
- classifyWorld → resolvePins, normalizePinReasons, selectClassifyEntities (**#60**), reusablePins, shouldSyncPhysics (**#62**)
- registry.step → preStep (**#56+#59**), packCombatTable, stampNearWorkBudget (**#61**), input.update (**#55**), lifetimeSweep (dirty-publish trust dropped), eventTrace sanitize (**#58**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 62 | `classify-physics-partition-cache` | Portable quiet classify physics partition cache **~4.1×** median (180 mixed × 80k; floor minSpeedup ≥3.70× / five isolated runs; admit + production parity). Focused suites 74/74. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| lifetimeSweep dirty-publish `isMovableEntity` trust | thin sub-loop ~1.51–1.69×; **fair full-pole ~1.08× — drop** (clocks+collectDirty+publish+compact dominate) |
| lifetimeSweep pose-publish-list reshape | ~1.00× — no win |
| classify physics-partition fuse (inline three checks) | ~1.44× — under bar; replaced by cache |
| resolvePins rockBody skip + normalize | prior under bar — not retried |
| bitfield materialize pins | prior miss — not retried |
| reusablePins pinBits short-circuit | prior miss — not retried |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| spaceBg steady-state | Hold — not retried |
| midflight-wave-hull-decode / syncCombatantBounds | Holds — not retried |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58 (syncEntityViews /
   packFence / residual closures / camera.follow).
2. classifyWorld after #37+#38+#45+#48+#60+#62 (resolvePins+normalizePinReasons /
   reusablePins; selectClassify residual).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59+#61 (preStep residual /
   lifetimeSweep residual / tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
