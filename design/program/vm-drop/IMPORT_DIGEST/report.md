# IMPORT_DIGEST report — 2026-09-24j (post-import hillclimb)

Master tip: **`f4150f648`** (fetched; moved from `37f50a70d` via `2bbbc6312` + docs).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` rebased onto `f4150f648` (19 commits clean).
Prior tip content retained (#31–#40 + opening hitch + sync-entity-views-closure-gate
+ #37/#12 rebases). New work measured from stacked tip `c5c52256f`.

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
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss).

## Quiet CPU / hitch profile (stacked tip, pre-#41/#42 cite)

Tool cite: `node scripts/probe-main-thread-profile.mjs --ms=45000 --label=settled-45s-stacked-20260924h`
Picture ON, soft-GPU. Idle **61.4%**; long tasks **15** (worst **1401 ms** — opening admission inclusive).
Artifacts: `/workspace/spaceface-scratch/hillclimb-20260924h/.devshots/main-thread-profile/settled-45s-stacked-20260924h/`.

Soft-GPU / native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — post-stack pre-ship

| ms | owner | notes |
|---:|---|---|
| 100 | `registry.step` | residual after #39 content-gate |
| 66 | `prepareFrame` | residual after #13 |
| 61 | `classifyWorld` | residual after #37+#38 |
| 45 | `syncEntityViews` | residual after #15 + closure-gate |
| 37 | `getBoundingClientRect` | **SHIPPED** #42 resize-only plates (~45× reads) |
| 35 | `hud.frame` | residual after #34; plate tax was under it |
| 25 | `stuntFlightEvidence.update` | #40 landed (~16×) |
| 20 | `queryFarActors` | **SHIPPED** #41 adaptive row-scan (~11× wide disc) |
| 22 | `_stepCraft` | HOLD propulsion |
| 19 | `_stepFixed` | physics sleep residual |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 41 | `far-query-row-scan` | Portable wide-disc **~11.0×** (96 rows / 3600 WU / 8000 iters). Far suites pass. Master-clean + after-#1 patches. |
| 42 | `hud-objective-plate-cache` | Settled-edge layout reads **270 → 3** (~45×). Orrery/HUD focused pass. Clean on bare master. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| Physics S1-idle sleep expansion | Hold — not retried |
| classifyWorld visit-loop cadence | Prior under bar — leave |
| spatial-hash surface @600 | Hold — not retried |
| Remaining registry content-gates after #39 | No extra owner cleared ≥1.5× |
| syncCombatantBounds early-out | Prior miss — not retried |
| Far-AI residual after #1+#40 | **Closed** via #41 row-scan |
| HUD leftover getBoundingClientRect after #34 | **Closed** via #42 |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. registry.step residual after #39 (~100 ms self).
2. classifyWorld residual after #37+#38 (~61 ms).
3. prepareFrame / syncEntityViews leftovers.
4. Physics sleep / spatial-hash@600 holds.
5. Soft-GPU fps is not a KPI.
