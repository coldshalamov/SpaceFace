# IMPORT_DIGEST report — 2026-09-24q (post-import hillclimb)

Master tip: **`2e7ec656b`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` on `2e7ec656b` through #51; +#52 measured
on stacked tip @ `92e36f2e8`.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar),
imminent-collision earlyout (~1.22× under bar), rock-resolvePins-only (~1.02×),
selectClassify empty-projectile (~1.11×), isMovableEntity type-first (~1.10×).

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: prior `settled-45s-stacked-20260924h` (Picture ON, soft-GPU). Idle **61.4%**.
Soft-GPU / native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| ms | owner | notes |
|---:|---|---|
| 100 | `registry.step` | residual after #39+#43+#49+#50 |
| 66 | `prepareFrame` | residual after #13+#44+#46+#47+#51+#52 (spaceBg / sync; pack+diag cut) |
| 61 | `classifyWorld` | residual after #37+#38+#45+#48 |
| 45 | `syncEntityViews` | residual after #15 + closure-gate + #44 |
| 22 | `_stepCraft` | HOLD propulsion |
| 19 | `_stepFixed` | physics sleep residual |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 52 | `asset-residency-diagnostics-cache` | Portable quiet `canonicalDiagnostics` **~794×** (80 assets; emit/cacheSweep invalidate). 40 assets ~768×. Oracle same-ref quiet + mutate invalidate. Focused residency pass. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| isMovableEntity type-first | ~1.10× — under bar (prior) |
| classify rock-only resolvePins | ~1.02× — under bar (prior) |
| selectClassify empty-projectile skip | ~1.11× indexed — under bar (prior) |
| imminentCollision earlyout | prior ~1.22× — under bar |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| spaceBg steady-state | Profile `deepSkyPlates.pump` was one-shot `initTexture` upload — not a quiet portable cut |
| classifyWorld non-rock visit | Not shipped this pass |
| syncEntityViews micro-motion residual | Not shipped this pass |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47+#51+#52 (spaceBg / sync residual).
2. classifyWorld residual after #37+#38+#45+#48 (non-rock visit / selectClassify).
3. registry.step after #39+#43+#49+#50 (physics / flight / AI holds).
4. syncEntityViews residual after #15+#44.
5. Soft-GPU fps is not a KPI.
