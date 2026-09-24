# IMPORT_DIGEST report — 2026-09-24i (post-import hillclimb)

Master tip: **`37f50a70d`** (fetch confirmed; tip did not move).

## Stack apply on `37f50a70d` → scratch `vm-work/hillclimb-20260924h`

### Applied cleanly (`git am`)

| # | Package |
|---:|---|
| 31 | `optic-field-resident` |
| 32 | `emergent-hot-spatial` |
| 33 | `share-unchanged-ship-materials` |
| 34 | `hud-credits-pulse-no-reflow` |
| 35 | `prune-evidence-cadence` |
| 36 | `projectile-surface-distance-first` |
| 38 | `classify-signature-prune-membership` |
| 39 | `registry-step-dispatch` |
| 17 | `asteroid-query-callers` |
| 1 | `far-actor-cell-key` |
| 13 | `prepare-pitch-settle` |
| 15 | `sync-entity-views-submit-scratch` |

Also applied residual clean pendings on the same tip: `#` sync-entity-views-closure-gate,
`#20` opening-plan-complete, `#21` hitch-opening-drain, `#22` opening-residency-deadline.

### Rebased (cheap) then applied

| # | Package | Note |
|---:|---|---|
| 37 | `classify-closed-form-index` | activityRuntime catch-up context drifted (projectile-append / filter residual). CoreSystem hunks + closedFormMovers walk rebased. See `REBASE_20260924.md`. |
| 12 | `massline-settext-cache` | preview `paint`/`text` drift. Local `setText` helper. See `REBASE_20260924.md`. |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `opening-residency-deadline` was clean this pass (applied),
`classify-closed-form-scan` (superseded by #37), physics S1-idle sleep, spatial-hash surface@600,
hitch-opening-admission, midflight-wave-hull-decode, combat-entity-key-cache.

## Quiet CPU / hitch profile (stacked tip)

Tool cite: `node scripts/probe-main-thread-profile.mjs --ms=45000 --label=settled-45s-stacked-20260924h`
Picture ON, soft-GPU. Idle **61.4%**; long tasks **15** (worst **1401 ms** — opening admission inclusive).
Artifacts: `/workspace/spaceface-scratch/hillclimb-20260924h/.devshots/main-thread-profile/settled-45s-stacked-20260924h/`.

Soft-GPU / native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — post-stack

| ms | owner | notes |
|---:|---|---|
| 100 | `registry.step` | residual after #39 content-gate |
| 61 | `classifyWorld` | residual after #37+#38 |
| 66 | `prepareFrame` | residual after #13 |
| 45 | `syncEntityViews` | residual after #15 + closure-gate |
| 35 | `hud.frame` | residual after #34 |
| 25 | `stuntFlightEvidence.update` | **SHIPPED** index-lane walk (~16× portable) |
| 25 | `preStep` | residual |
| 23 | `syncCombatantBounds` | prior early-out miss |
| 22 | `_stepCraft` | HOLD propulsion |
| 20 | `queryFarActors` | was 178 — #1 landed (~9×) |
| 19 | `_stepFixed` | physics sleep residual |
| 17 | `setLagTranslate` | master glag residual |

Accounted pending digest packages — do not re-cut those poles.

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 40 | `stunt-threat-index-lanes` | Portable threat-scan microbench **~16.4×** (800 rocks / 44 candidates). Focused stunt suites **20/20**. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| Physics S1-idle sleep expansion | Left (prior ~1.41× / ~0.97×) — not retried |
| classifyWorld visit-loop cadence | Prior under bar — leave |
| spatial-hash surface @600 | Hold — not retried |
| Remaining registry content-gates after #39 | No extra owner cleared ≥1.5× without deeper post-lane profile |
| Far-AI residual after #1 | Still open — re-profile after #40 lands with stack |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. Far-AI residual after #1+#40 (tickFarActors / aiPorts) — re-profile stacked tip.
2. HUD leftover after #34 (hud.frame ~35 ms; getBoundingClientRect under hud).
3. registry.step residual after #39 (~100 ms self).
4. classifyWorld residual after #37+#38 (~61 ms).
5. prepareFrame / syncEntityViews leftovers.
6. Physics sleep / spatial-hash@600 holds.
7. Soft-GPU fps is not a KPI.
