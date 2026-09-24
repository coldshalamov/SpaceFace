# IMPORT_DIGEST report — 2026-09-24t (post-import hillclimb)

Master tip: **`2e7ec656b`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` on `2e7ec656b` through #54; +#55 measured
on stacked tip @ `f17566990`.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar),
imminent-collision earlyout (~1.22× under bar), rock-resolvePins-only (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10×).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924t` (Picture ON, soft-GPU; post-#54
stack before #55). Idle **57.9%**. Long tasks **15**. Soft-GPU / native GL / bloom
admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 301 | `registry.step` | residual after #39+#43+#49+#50; #55 cuts disconnected gamepad |
| 289 | `classifyWorld` | residual after #37+#38+#45+#48 |
| 190 | `prepareFrame` | residual after #13+#44+#46+#47+#51–#54; syncEntityViews dominates |
| 154 | `syncEntityViews` | residual after #15+#44; microMotion / ordnance / query |
| 124 | `hud.frame` | radar.draw + setLagTranslate |
| 17 | `entityTimeToGlassSeconds` | **#54 confirmed** (was 85 @ 20260924r) |

### Notable callees (post-#54)

- prepareFrame → syncEntityViews, camera.follow, packPresentationWorldToFence
- syncEntityViews → updateCraftMicroMotion, updateOrdnanceMotion, presentationQueries
- classifyWorld → selectClassifyEntities, reusablePins, shouldSyncPhysicsBodyEntity,
  imminentCollisionFor (hold), rebuildPinFacts (cache already on stack)
- registry.step → preStep, input.update (**#55**), lifetimeSweep, tacticalAI

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 55 | `gamepad-idle-clean-skip` | Portable quiet disconnected gamepad poll **~3.51×** cold (median ~23×; `_resetState` 40k→0). Focused gamepad/input **21/21**. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
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

1. prepareFrame residual after #13+#44+#46+#47+#51–#55 (syncEntityViews /
   updateCraftMicroMotion / packFence).
2. classifyWorld after #37+#38+#45+#48 (selectClassify / reusablePins /
   shouldSyncPhysics).
3. registry.step after #39+#43+#49+#50+#55 (preStep / lifetimeSweep / tacticalAI).
4. syncEntityViews residual after #15+#44 (microMotion / ordnance / query).
5. Soft-GPU fps is not a KPI.
