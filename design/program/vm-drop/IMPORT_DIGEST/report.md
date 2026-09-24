# IMPORT_DIGEST report — 2026-09-24c (hud-credits-pulse-no-reflow)

Master tip: **`568d1358e`**.

## Quiet CPU / hitch re-rank (this pass)

Tool: `node scripts/probe-main-thread-profile.mjs --ms=45000 --label=settled-45s-20260924b` on bare master tip (Picture ON, soft-GPU). Idle **68.7%**; long tasks **21**. Soft-GPU owners (`(program)`, `isProgram`, bloom readiness) ignored for portable ranking.

### Top portable src/ self (aggregated) — coverage

| ms | owner | coverage |
|---:|---|---|
| 173 | `queryFarActors` | pending **#1** far-actor-cell-key |
| 123 | `registry.step` | residual dispatcher |
| 104 | `classifyWorld` | master classify-pinfacts residual |
| **104** | **`refreshCredits`** | **SHIPPED #34** (1× ~104 ms forced-reflow hitch) |
| 52 | `prepareFrame` | pending **#13** prepare-pitch-settle |
| 51 | `syncEntityViews` | pending **#15** submit-scratch |
| 41 | `hud.frame` | residual (after caches on master) |
| 41 | `queryAsteroidField` | pending **#17** asteroid-query-callers |
| 35 | `renderPackageDigest` | worker path residual / cold |
| 27 | `_stepCraft` / propulsion | HOLD flight-propulsion-scratch |
| 24 | `pruneEvidence` | next pole (cadence candidate) |
| 21 | `radar.draw` | master radar packages |
| 19 | `setLagTranslate` | master hud-glag |

Accounted pending digest packages conceptually — do not re-cut those poles.

## New package

| # | Package | Evidence |
|---:|---|---|
| 34 | `hud-credits-pulse-no-reflow` | Early-flight hitch: `refreshCredits` **103.9 ms** / 1 invocation → layout reads **N→0**; 4/4 tests; patch clean on `568d1358e` |

## Still import — applies cleanly on `568d1358e`

| # | Package | Evidence |
|---:|---|---|
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
5. `#17 asteroid-query-callers`
6. `#1 far-actor-cell-key`
7. `#13 prepare-pitch-settle`
8. `#15 sync-entity-views-submit-scratch`
9. `#12 massline-settext-cache`
10. Soft-GPU opening: `#20` → `#21` (then rebase `#22`)

## Needs rebase / hold

| # | Package | Note |
|---:|---|---|
| 19 | `flight-propulsion-scratch` | integrated ~0.85× on tip — hold |
| 22 | `opening-residency-deadline` | patch drifts on renderer.js |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned (8 geology / 2 collision / 1 activity). **No legal cut**.

## Scour-ranked next poles

1. Import portable pending (esp. #31 + #32 + #33 + #1 + #17).
2. `pruneEvidence` every-tick Map walks (~24 ms / 45 s) — cadence / incremental prune.
3. `sampleProjectileEvidence` / `materialSurface` full-entity walk — distance-first + spatial.
4. `registry.step` / `selectClassifyEntities` residual after pending land.
5. Same-material hull batch only if draw/GPU present is still the pole after table authority.
6. Ignore soft-GPU fps for shipping KPIs.
