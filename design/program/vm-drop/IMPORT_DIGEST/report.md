# IMPORT_DIGEST report — 2026-09-24k (post-import hillclimb)

Master tip: **`3b62f00e9`** (fetched; moved from `f4150f648`).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` rebased onto `3b62f00e9` (21 commits clean).
Prior tip content retained (#31–#42 + opening hitch + sync-entity-views-closure-gate).
New work measured from stacked tip + #43/#44.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar).

## Quiet CPU / hitch profile (stacked tip pre-#43/#44 cite)

Tool cite: prior `settled-45s-stacked-20260924h` (Picture ON, soft-GPU). Idle **61.4%**.
Soft-GPU / native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| ms | owner | notes |
|---:|---|---|
| 100 | `registry.step` | residual after #39; **#43** cuts fields NPC walk |
| 66 | `prepareFrame` | residual after #13 |
| 61 | `classifyWorld` | residual after #37+#38 — **miss this pass** |
| 45 | `syncEntityViews` | residual after #15 + closure-gate; **#44** cadences policy |
| 22 | `_stepCraft` | HOLD propulsion |
| 19 | `_stepFixed` | physics sleep residual |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 43 | `fields-npc-plan-cadence` | Portable NPC plan walk **~2.67×** (80 ships / 30 wrecks / 6k ticks). Quiet idle early-out after skim. Fields suites pass. |
| 44 | `sync-entity-views-middle-policy-cadence` | Portable middle-band policy **~2.10×** (400×240, 72% middle). LOD/shadow/classifyRender share closure cadence. Band/visibility/micro-motion/shadow tests pass. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| Physics S1-idle sleep expansion | Hold — not retried |
| classifyWorld visit-loop cadence | Prior under bar — leave |
| classifyWorld stamp-reuse / inert fast-path | Explored; near-disc already trimmed — no ≥1.5× package |
| spatial-hash surface @600 | Hold — not retried |
| syncCombatantBounds early-out | Prior miss — not retried |
| Remaining registry content-gates after #39 | No extra owner cleared ≥1.5× (fields path shipped instead) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38 (~61 ms).
2. prepareFrame leftovers after #13+#44.
3. registry.step after #39+#43 (physics / flight / AI holds).
4. Physics sleep / spatial-hash@600 holds.
5. Soft-GPU fps is not a KPI.
