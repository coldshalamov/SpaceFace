# IMPORT_DIGEST report — 2026-09-24y (post-import hillclimb)

Master tip: **`abcccfd87`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` on `abcccfd87` through #59; +#60 measured on
stacked tip @ `6357d192c`.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar),
imminent-collision earlyout (~1.22× under bar), rock-resolvePins-only (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10× — not lane trust),
reusablePins pinBits short-circuit (slower on quiet 0–2 pin arrays),
normalizePinReasons/bitfield materialize (~0.87× — miss this pass).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924w` (Picture ON, soft-GPU; post-#57
stack @ `8b280fb14` before #58). Idle **62.4%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 319 | `registry.step` | residual after #39+#43+#49+#50+#55+#56+#58+#59 |
| 310 | `classifyWorld` | residual after #37+#38+#45+#48+#60 |
| 204 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#57 |
| 181 | `syncEntityViews` | residual after #15+#44+#57 |
| 153 | `hud.frame` | radar.draw + setLagTranslate |
| 45 | `selectClassifyEntities` | **#60 shipped** |

### Notable callees (post-#57 / pre-#60)

- prepareFrame → syncEntityViews (**#57**), camera.follow, packPresentationWorldToFence, spaceBackground (hold)
- syncEntityViews → updateCraftMicroMotion (**#57**), presentationQueries, applySnapshotPose
- classifyWorld → resolvePins, normalizePinReasons, selectClassifyEntities (**#60**), reusablePins, shouldSyncPhysics
- registry.step → preStep (**#56+#59**), packCombatTable, stampNearWorkBudget, input.update (**#55**), lifetimeSweep, eventTrace sanitize (**#58**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 60 | `select-classify-epoch-seen` | Portable quiet selectClassify seen-membership **~2.89×** median (12k × 11; admit parity 220). Uint32Array id-epoch marks; focused activity suites 64/64. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| resolvePins rockBody skip + normalize | ~1.07× — under bar (confirms prior rock-resolvePins miss) |
| bitfield materialize pins (replace normalize) | ~0.87× — slower than normalize on quiet pins (miss) |
| selectClassify Map-epoch marks (isolated) | ~1.46× — under bar; replaced by dense Uint32Array |
| stampNearWorkBudget always-awake cache | ~1.58× isolated — ready next; not shipped this pass |
| reusablePins pinBits short-circuit | prior miss — not retried |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| spaceBg steady-state | Hold — not retried |
| midflight-wave-hull-decode / syncCombatantBounds | Holds — not retried |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58 (syncEntityViews /
   packFence / residual closures / camera.follow).
2. classifyWorld after #37+#38+#45+#48+#60 (resolvePins+normalizePinReasons /
   reusablePins / shouldSyncPhysics; selectClassify residual).
3. registry.step after #39+#43+#49+#50+#55+#56+#58+#59 (preStep residual /
   lifetimeSweep / stampNearWorkBudget always-awake cache ~1.58× ready /
   tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
