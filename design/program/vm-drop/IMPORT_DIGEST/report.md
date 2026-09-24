# IMPORT_DIGEST report — 2026-09-24l (post-import hillclimb)

Master tip: **`a4bb310e2`** (fetched; moved from `3b62f00e9`).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` rebased onto `a4bb310e2` (22 commits clean, then +1 ship).
Prior tip content retained (#31–#44 + opening hitch + sync-entity-views-closure-gate).
New work measured from stacked tip + #45/#46.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar).

## Quiet CPU / hitch profile (stacked tip pre-#45/#46 cite)

Tool cite: prior `settled-45s-stacked-20260924h` (Picture ON, soft-GPU). Idle **61.4%**.
Soft-GPU / native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| ms | owner | notes |
|---:|---|---|
| 100 | `registry.step` | residual after #39+#43 |
| 66 | `prepareFrame` | residual after #13+#44; **#46** cuts fence pack yaw quat |
| 61 | `classifyWorld` | residual after #37+#38; **#45** cuts stamp-signature alloc |
| 45 | `syncEntityViews` | residual after #15 + closure-gate + #44 |
| 22 | `_stepCraft` | HOLD propulsion |
| 19 | `_stepFixed` | physics sleep residual |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 45 | `classify-signature-record` | Portable stamp-churn **~10.86×** (120×20k). Imminent-collision reach early-out supporting ~1.22×. Activity/presentation/fence suites pass. |
| 46 | `snapshot-fence-yaw-quat-cache` | Portable fence pack **~2.77×** (400×12k, 30% rotating). Half-yaw cache on rot write. Presentation/fence/band/pitch tests pass. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| Physics S1-idle sleep expansion | Hold — not retried |
| classifyWorld visit-loop cadence | Prior under bar — leave |
| classifyWorld stamp-reuse / inert fast-path | Re-measured honest mix ~1.18–1.45× — still under bar |
| spatial-hash surface @600 | Hold — not retried |
| syncCombatantBounds early-out | Prior miss — not retried |
| prepareFrame camera.follow idle short-circuit | Not shipped this pass |
| serviceRenderMeshResidency | Already poll-cadenced — no new ≥1.5× |
| imminent-collision early-out alone | ~1.22× — shipped as supporting under #45 |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame camera.follow / composition residual after #13+#44+#46.
2. registry.step after #39+#43 (physics / flight / AI holds).
3. classifyWorld visit-body residual after #37+#38+#45 (context assembly).
4. Physics sleep / spatial-hash@600 holds.
5. Soft-GPU fps is not a KPI.
