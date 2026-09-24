# IMPORT_DIGEST report — 2026-09-24r (post-import hillclimb)

Master tip: **`2e7ec656b`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` on `2e7ec656b` through #52; +#53 measured
on stacked tip @ `a5cb8e4ab`.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar),
imminent-collision earlyout (~1.22× under bar), rock-resolvePins-only (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10×).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924r` (Picture ON, soft-GPU; post-#52
stack before #53). Idle **61.7%**. Soft-GPU / native GL / bloom admission owners
ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| ms | owner | notes |
|---:|---|---|
| 76 | `prepareFrame` | residual after #13+#44+#46+#47+#51+#52; #53 cuts instance cameraDirty |
| 70 | `entityTimeToGlassSeconds` | new / risen — decode-runway / residency relevance |
| 61 | `registry.step` | residual after #39+#43+#49+#50 |
| 55 | `syncEntityViews` | residual after #15 + closure-gate + #44 |
| 55 | `classifyWorld` | residual after #37+#38+#45+#48 |
| 28 | `camera.follow` | after #47 composition prefilter |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 53 | `authored-instance-camera-quantize` | Portable quiet authored instance pool sync **~2.32×** (120 owners / 0.05 WU chase jitter; ownersVisited ~5.5× fewer). Oracle micro quieter than large pan. Focused instance/frame pass. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| isMovableEntity type-first | ~1.10× — under bar (prior) |
| classify rock-only resolvePins | ~1.02× — under bar (prior) |
| selectClassify empty-projectile skip | ~1.11× indexed — under bar (prior) |
| imminentCollision earlyout | prior ~1.22× — under bar |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| spaceBg steady-state | Profile `deepSkyPlates.pump` was one-shot `initTexture` upload — not a quiet portable cut |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51+#52+#53 (`entityTimeToGlassSeconds` / sync residual).
2. classifyWorld residual after #37+#38+#45+#48.
3. registry.step after #39+#43+#49+#50.
4. syncEntityViews residual after #15+#44.
5. Soft-GPU fps is not a KPI.
