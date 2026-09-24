# IMPORT_DIGEST report — 2026-09-24w (post-import hillclimb)

Master tip: **`abcccfd87`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` on `abcccfd87` through #57; +#58 measured on
stacked tip @ `df665a6bc`.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar),
imminent-collision earlyout (~1.22× under bar), rock-resolvePins-only (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10×),
reusablePins pinBits short-circuit (slower on quiet 0–2 pin arrays).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924w` (Picture ON, soft-GPU; post-#57
stack @ `8b280fb14` before #58). Idle **62.4%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 319 | `registry.step` | residual after #39+#43+#49+#50+#55+#56; eventTrace under bus |
| 310 | `classifyWorld` | residual after #37+#38+#45+#48 |
| 204 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#57 |
| 181 | `syncEntityViews` | residual after #15+#44+#57 |
| 153 | `hud.frame` | radar.draw + setLagTranslate |
| 71 | `sanitizePayload` | **#58 target** (held-thrust ship:thrust every frame) |

### Notable callees (post-#57 / pre-#58)

- prepareFrame → syncEntityViews (**#57**), camera.follow, packPresentationWorldToFence, spaceBackground (hold)
- syncEntityViews → updateCraftMicroMotion (**#57**), presentationQueries, applySnapshotPose
- classifyWorld → resolvePins, normalizePinReasons, selectClassifyEntities, reusablePins, shouldSyncPhysics
- registry.step → preStep (**#56**), packCombatTable, stampNearWorkBudget, input.update (**#55**), lifetimeSweep, eventTrace sanitize (**#58**)

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 58 | `event-trace-thrust-sanitize` | Portable quiet `sanitizePayload` on ship:thrust envelope **~7.15×** median (30k × 7 runs; min band ~3.18×). JSON tapes identical (0 mismatches). Typed flightV3 fast path; legacy fallback for other shapes. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| reusablePins pinBits short-circuit | ~0.54× — slower than short array compare (miss) |
| isMovableEntity type-first | ~1.10× — under bar (prior) |
| classify rock-only resolvePins | ~1.02× — under bar (prior) |
| selectClassify empty-projectile skip | ~1.11× indexed — under bar (prior) |
| imminentCollision earlyout | prior ~1.22× — under bar |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| spaceBg steady-state | Profile `deepSkyPlates.pump` was one-shot `initTexture` upload — not a quiet portable cut |
| midflight-wave-hull-decode | Hold — not retried |
| syncCombatantBounds | Prior miss — not retried |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51–#58 (syncEntityViews /
   packFence / residual closures / camera.follow).
2. classifyWorld after #37+#38+#45+#48 (selectClassify / reusablePins /
   shouldSyncPhysics / resolvePins+normalizePinReasons).
3. registry.step after #39+#43+#49+#50+#55+#56+#58 (preStep residual /
   lifetimeSweep / stampNearWorkBudget / tacticalAI).
4. syncEntityViews residual after #15+#44+#57 (ordnance / query / residual
   microMotion).
5. Soft-GPU fps is not a KPI.
