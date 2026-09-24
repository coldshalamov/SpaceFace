# IMPORT_DIGEST report — 2026-09-24h (scour / import-first)

Master tip: **`37f50a70d`** (fetch confirmed; tip did not move).

## Quiet CPU / hitch re-rank

Tool cite: `node scripts/probe-main-thread-profile.mjs --ms=45000 --label=settled-45s-20260924b`
on bare master tip (Picture ON, soft-GPU). Idle **68.7%**; long tasks **21**.
Artifacts: `/workspace/spaceface-scratch/hillclimb-20260924b/.devshots/main-thread-profile/settled-45s-20260924b/`.

Soft-GPU / native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — coverage

| ms | owner | coverage |
|---:|---|---|
| 178 | `queryFarActors` | pending **#1** far-actor-cell-key |
| 123 | `registry.step` | **SHIPPED #39** content-gate + calendar (~1.74–2.88× quiet dispatch) |
| 106 | `classifyWorld` | **SHIPPED #37** + **#38** (+ pinFacts already on master) |
| 104 | `refreshCredits` | **SHIPPED #34** (layout N→0) |
| 52 | `queryAsteroidField` | pending **#17** asteroid-query-callers |
| 52 | `prepareFrame` | pending **#13** prepare-pitch-settle |
| 51 | `syncEntityViews` | pending **#15** submit-scratch (+ closure-gate companion) |
| 41 | `hud.frame` | residual after master HUD caches; re-rank after **#34** |
| 35 | `renderPackageDigest` | worker / cold residual |
| 30 | `preStep` (coreSystem) | residual; no ≥1.5× cut this pass |
| 28 | `_stepCraft` / propulsion | HOLD flight-propulsion-scratch |
| 24 | `pruneEvidence` | **SHIPPED #35** |
| 21 | `lifetimeSweep` | residual with preStep |
| 19 | `setLagTranslate` | master hud-glag |
| 19 | `materialSurface` / projectile | **SHIPPED #36** |
| 18 | `syncCombatantBounds` / `resolveCombatProfile` | prior early-out miss |
| 18 | `spatialHash._syncDynamicLayer` | surface@600 HOLD; not retried |
| 17 | `appendNearbyLedgerRows` | mostly #1+#17 query cost; re-measure post-import |
| 16 | `_stepFixed` (sg02) | physics sleep residual — **MISS this pass** (see below) |
| 14 | `isHostileForAI` | master hostile-earlyout residual; far-AI after #1 |

Accounted pending digest packages — do not re-cut those poles.

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| — | *(none)* | No ≥~1.5× portable ship |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| Physics S1-idle sleep expansion (`mayRapierIslandSleep` + S1_NEAR) | Kinematics stand-in **~1.41×** (under bar). Richer capture+give+refresh stand-in **~0.97×** — policy walk dominates. Live dynamics are S0/S1; S2–S4 sleep eligibility rarely applies (`entityNeedsPhysics` drops them). |
| classifyWorld visit-loop cadence | Prior under bar — leave |
| spatial-hash surface @600 | Hold — not retried |
| same-material hull *draw* batch | Draw/GPU not portable pole after pending; soft-GPU fps ignored |
| Admission w/o dummy prewarm | Prior hitch-opening-admission miss stands |
| Remaining registry content-gates after #39 | No extra owner cleared ≥1.5× without post-import profile |

Scratch: `vm-work/scour-20260924g` @ `/workspace/spaceface-scratch/scour-20260924g/`
(`scratch-physics-s1-sleep-bench.mjs`, `scratch-physics-s1-sleep-bench2.mjs`).

## Still import — applies cleanly on `37f50a70d`

| # | Package | Evidence |
|---:|---|---|
| 39 | `registry-step-dispatch` | ~1.74–2.88× quiet registry.step |
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
7. `#37 classify-closed-form-index`
8. `#38 classify-signature-prune-membership`
9. `#39 registry-step-dispatch`
10. `#17 asteroid-query-callers`
11. `#1 far-actor-cell-key`
12. `#13 prepare-pitch-settle`
13. `#15 sync-entity-views-submit-scratch`
14. `#12 massline-settext-cache`
15. Soft-GPU opening: `#20` → `#21` (then rebase `#22`)

## Needs rebase / hold

| # | Package | Note |
|---:|---|---|
| 19 | `flight-propulsion-scratch` | integrated ~0.85× on tip — hold |
| 22 | `opening-residency-deadline` | patch drifts on renderer.js |
| — | `classify-closed-form-scan` | superseded by #37 for walk shape |
| — | physics S1-idle sleep | under bar this pass — leave |
| — | spatial-hash surface @600 | hold |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned (8 geology / 2 collision / 1 activity). **No legal cut**.

## Scour-ranked next poles

1. **Import-first** portable pending (#31–#39 + #1 + #17 + #13 + #15 + #12).
2. Far-AI residual after #1 lands (tickFarActors / aiPorts) — re-profile.
3. HUD leftover after #34 (hud.frame ~41 ms) — re-profile.
4. Presentation ledger residual after #1+#17.
5. Remaining 11 live rocks still pinned — no legal cut.
6. Ignore soft-GPU fps for shipping KPIs.
