# IMPORT_DIGEST report — 2026-09-24f (classify-signature-prune-membership)

Master tip: **`37f50a70d`** (moved from `568d1358e`).

## Quiet CPU / hitch re-rank (prior pass cite)

Tool: `node scripts/probe-main-thread-profile.mjs --ms=45000 --label=settled-45s-20260924b` on bare master tip (Picture ON, soft-GPU). Idle **68.7%**; long tasks **21**. Soft-GPU owners ignored for portable ranking.

### Top portable src/ self (aggregated) — coverage

| ms | owner | coverage |
|---:|---|---|
| 173 | `queryFarActors` | pending **#1** far-actor-cell-key |
| 123 | `registry.step` | residual dispatcher (next after classify shrink) |
| 104 | `classifyWorld` | **SHIPPED #37** catch-up index (~135×) + **SHIPPED #38** signature-prune gate (~178× prune slice) + pending pinFacts cache |
| **104** | **`refreshCredits`** | **SHIPPED #34** (layout N→0) |
| 52 | `prepareFrame` | pending **#13** prepare-pitch-settle |
| 51 | `syncEntityViews` | pending **#15** submit-scratch |
| 41 | `hud.frame` | residual (after caches on master) |
| 41 | `queryAsteroidField` | pending **#17** asteroid-query-callers |
| 35 | `renderPackageDigest` | worker path residual / cold |
| 27 | `_stepCraft` / propulsion | HOLD flight-propulsion-scratch |
| **24** | **`pruneEvidence`** | **SHIPPED #35** (~11× cadence) |
| 21 | `radar.draw` | master radar packages |
| 19 | `setLagTranslate` | master hud-glag |
| — | `sampleProjectileEvidence` / `materialSurface` | **SHIPPED #36** (~1.87× distance-first) |

Accounted pending digest packages conceptually — do not re-cut those poles.

## New packages

| # | Package | Evidence |
|---:|---|---|
| 38 | `classify-signature-prune-membership` | Quiet prune **~178×** vs every-tick walk; 21/21 tests; stacks after #37 |

## Still import — applies cleanly on `37f50a70d`

| # | Package | Evidence |
|---:|---|---|
| 38 | `classify-signature-prune-membership` | ~178× quiet signature prune |
| 37 | `classify-closed-form-index` | ~135× selectClassify catch-up |
| 36 | `projectile-surface-distance-first` | ~1.87× surface walk |
| 35 | `prune-evidence-cadence` | ~11× prune / ~7× worst |
| 34 | `hud-credits-pulse-no-reflow` | hitch / layout reads → 0 |
| 33 | `share-unchanged-ship-materials` | ~1.96× unique materials |
| 31 | `optic-field-resident` | ~1.64× walk; census green |
| 32 | `emergent-hot-spatial` | ~4.0× crowded hot path |
| 1 | `far-actor-cell-key` | ~2.06×; still top portable self |
| 12 | `massline-settext-cache` | patch applies |
| 13 | `prepare-pitch-settle` | ~2.35× |
| 15 | `sync-entity-views-submit-scratch` | patch applies |
| 17 | `asteroid-query-callers` | ~9.12× REBASED |
| 20 | `opening-plan-complete` | soft-GPU opening |
| 21 | `hitch-opening-drain` | soft-GPU opening |

### Apply order (portable first)

1. `#31 optic-field-resident`
2. `#32 emergent-hot-spatial`
3. `#33 share-unchanged-ship-materials`
4. `#34 hud-credits-pulse-no-reflow` — early-flight hitch
5. `#35 prune-evidence-cadence`
6. `#36 projectile-surface-distance-first`
7. `#37 classify-closed-form-index` — selectClassify / classifyWorld catch-up
8. `#38 classify-signature-prune-membership` — classifyWorld signature prune residual
9. `#17 asteroid-query-callers`
10. `#1 far-actor-cell-key`
11. `#13 prepare-pitch-settle`
12. `#15 sync-entity-views-submit-scratch`
13. `#12 massline-settext-cache`
14. Soft-GPU opening: `#20` → `#21` (then rebase `#22`)

## Needs rebase / hold

| # | Package | Note |
|---:|---|---|
| 19 | `flight-propulsion-scratch` | integrated ~0.85× on tip — hold |
| 22 | `opening-residency-deadline` | patch drifts on renderer.js |
| — | `classify-closed-form-scan` | superseded by #37 for walk shape |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned (8 geology / 2 collision / 1 activity). **No legal cut**.

## Scour-ranked next poles

1. Import portable pending (esp. #31–#38 + #1 + #17).
2. `registry.step` residual dispatcher after classify shrinks (#37+#38).
3. Remaining 11 live rocks still pinned — no legal cut.
4. Same-material hull batch only if draw/GPU present is still the pole after table authority.
5. Ignore soft-GPU fps for shipping KPIs.
