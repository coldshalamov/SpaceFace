# IMPORT_DIGEST report — 2026-09-24m (post-import hillclimb)

Master tip: **`2e7ec656b`** (fetched; moved from `a4bb310e2`).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` rebased onto `2e7ec656b` (23 commits clean, then +1 ship).
Prior tip content retained (#31–#46 + opening hitch + sync-entity-views-closure-gate).
New work measured from stacked tip + #47/#48.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar).

## Quiet CPU / hitch profile (stacked tip pre-#47/#48 cite)

Tool cite: prior `settled-45s-stacked-20260924h` (Picture ON, soft-GPU). Idle **61.4%**.
Soft-GPU / native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| ms | owner | notes |
|---:|---|---|
| 100 | `registry.step` | residual after #39+#43 |
| 66 | `prepareFrame` | residual after #13+#44+#46; **#47** cuts composition hostility walk |
| 61 | `classifyWorld` | residual after #37+#38+#45; **#48** cuts rock visit-body context |
| 45 | `syncEntityViews` | residual after #15 + closure-gate + #44 |
| 22 | `_stepCraft` | HOLD propulsion |
| 19 | `_stepFixed` | physics sleep residual |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 47 | `composition-threat-prefilter` | Portable follow-pair **~2.09–2.33×** quiet (8000 iters); combat ~2.06×. Camera + activity suites pass. |
| 48 | `classify-rock-body-context` | Portable rock-dominated context fill **~1.55×** (180 rocks+20 ships × 4k). Activity suites pass. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| Physics S1-idle sleep expansion | Hold — not retried |
| classifyWorld visit-loop cadence | Prior under bar — leave |
| classifyWorld stamp-reuse / inert fast-path | Prior under bar — leave (new angle #48 instead) |
| spatial-hash surface @600 | Hold — not retried |
| syncCombatantBounds early-out | Prior miss — not retried |
| serviceRenderMeshResidency | Already poll-cadenced — no new ≥1.5× |
| registry.step residual after #39+#43 | Not shipped this pass (physics/flight/AI holds) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. registry.step after #39+#43 (physics / flight / AI holds).
2. prepareFrame residual after #13+#44+#46+#47 (non-composition leftovers).
3. classifyWorld residual after #37+#38+#45+#48 (non-rock visit / selectClassify).
4. Physics sleep / spatial-hash@600 holds.
5. Soft-GPU fps is not a KPI.
