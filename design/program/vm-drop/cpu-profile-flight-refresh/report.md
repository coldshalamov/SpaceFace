# hitch-hillclimb-fresh-20260923

## Fresh quiet-machine CPU profile

- **Master tip:** `35e519ebd`
- **When:** 2026-09-23 ~00:09–00:11 EDT
- **Tool:** `node scripts/probe-main-thread-profile.mjs --ms=60000 --label=settled-60s-fresh`
- **GPU:** software (llvmpipe) — ignore fps; Picture defaults ON
- **Window:** 60937 ms settled held-thrust; idle **57.3%**; long tasks **18**
- **Artifacts:** `artifacts/settled-60s/`

## Soft-GPU / non-portable (ignore for portable hillclimb)

- `bufferData` 8.9%, `isProgram`/`getProgramParameter` cluster, `(program)`, bloom `checkProgramsReady`
- Inclusive: `enqueueGeometryResidencyBatches.urgent` ~9% (opening/residency uploads still mid-window)

## Top portable self-time poles (src/, bloom/admission/residency excluded)

| rank | ms | share | function | covered by unimported vm-drop? |
|---:|---:|---:|---|---|
| 1 | 398.9 | 0.65% | `draw` @ `src/ui/radar.js:744` | radar-project-scratch, radar-contact-color-defer, trail-history-pool, radar-range-plate-cache |
| 2 | 189.3 | 0.31% | `classifyWorld` @ `src/world/activityRuntime.js:706` | classify-pinfacts-cache, classify-closed-form-scan |
| 3 | 170.2 | 0.28% | `step` @ `src/core/registry.js:773` | flight-dormant-skip |
| 4 | 111.6 | 0.18% | `queryFarActors` @ `src/world/farActorTable.js:387` | far-actor-cell-key |
| 5 | 69.2 | 0.11% | `syncEntityViews` @ `src/render/renderer.js:11693` | sync-entity-views-closure-gate + submit-scratch |
| 6 | 63.9 | 0.10% | `prepareFrame` @ `src/render/renderer.js:12629` | prepare-pitch-settle |
| 7 | 61.5 | 0.10% | `frame` @ `src/ui/hud.js:4646` | hud-settext-cache, hud-screen/glag/threat-halo transform caches |
| 8 | 57.3 | 0.09% | `stepSimulation` @ `src/core/simulationRunner.js:275` | **NEW pole candidate** |
| 9 | 53.2 | 0.09% | `preStep` @ `src/core/coreSystem.js:202` | **NEW pole candidate** |
| 10 | 52.9 | 0.09% | `frame` @ `src/core/presentationRunner.js:780` | **NEW pole candidate** |
| 11 | 50.5 | 0.08% | `runRenderUpdatePhase` @ `src/core/renderUpdatePhase.js:14` | **NEW pole candidate** |
| 12 | 47.0 | 0.08% | `drawRangePlate` @ `src/ui/radar.js:397` | radar-range-plate-cache |
| 13 | 45.0 | 0.07% | `_stepCraft` @ `src/systems/flightV3.js:219` | **NEW pole candidate** |
| 14 | 43.0 | 0.07% | `syncCombatantBounds` @ `src/combat/runtime.js:84` | **NEW pole candidate** |
| 15 | 42.4 | 0.07% | `setStyle` @ `src/ui/hud.js:950` | already on master (_sfStyle) |
| 16 | 41.6 | 0.07% | `_stepFixed` @ `src/core/sg02DynamicBodyOwner.js:670` | **NEW pole candidate** |
| 17 | 40.3 | 0.07% | `makeResult` @ `src/core/flight/propulsionKernel.js:1098` | **NEW pole candidate** |
| 18 | 39.6 | 0.07% | `isHostileForAI` @ `src/ai/engagementAuthority.js:313` | **NEW pole candidate** |
| 19 | 38.0 | 0.06% | `queryAsteroidField` @ `src/world/asteroidField.js:146` | asteroid-query-callers (tight disc) |
| 20 | 37.4 | 0.06% | `applyPendingSubsystemTransitions` @ `src/combat/subsystems.js:3` | **NEW pole candidate** |
| 21 | 36.6 | 0.06% | `update` @ `src/render/vfx.js:11297` | **NEW pole candidate** |
| 22 | 35.9 | 0.06% | `assignFlightFrame` @ `src/systems/flightV3.js:1247` | **NEW pole candidate** |
| 23 | 32.9 | 0.05% | `assetResidentBytes` @ `src/render/assetResidency.js:1066` | **NEW pole candidate** |
| 24 | 32.6 | 0.05% | `_updateSpeedLines` @ `src/render/feel.js:729` | **NEW pole candidate** |
| 25 | 32.4 | 0.05% | `update` @ `src/systems/input.js:944` | **NEW pole candidate** |

## Import-first list for Robin (covers top poles; do not re-do)

Already equivalent on master: lanes C+D hitch floor / hold prefetch / wave hull; asteroid `cellKey`.

**Import these (wins, measured on vm-drop):**
1. `far-actor-cell-key` `070c58394` — queryFarActors 111.6 ms self
2. `radar-project-scratch` + `radar-contact-color-defer` + `radar-range-plate-cache` + `trail-history-pool` — radar.draw 398.9 ms
3. `classify-pinfacts-cache` + `classify-closed-form-scan` — classifyWorld 189.3 ms
4. `hud-settext-cache` + `hud-screen-transform-cache` + `hud-glag-transform-cache` + `threat-halo-transform-cache` — hud.frame 61.5 ms
5. `prepare-pitch-settle` + `sync-entity-views-closure-gate` + `sync-entity-views-submit-scratch` — prepareFrame / syncEntityViews
6. `flight-dormant-skip` — registry.step
7. `asteroid-query-callers` — queryAsteroidField residual
8. `alloc-journal-churn` — presentationJournal.append

**Do not import:** overview-contact-pool, radar-contact-list-reuse, shader-admission-slice, hold-prefetch-inbound (misses); cloneUniforms ocean (avoid).

## New packages this session (vm-drop outbox)

- **flight-propulsion-scratch** @ `aa6ec09ec` — coolRuntime scratch (~174×) + trust `_sfNormalized` bodySnapshot (~10.7×)
- **massline-settext-cache** @ `c0718f881` — massline `_sfText` cache (0 DOM text reads on settled labels)

## Honest note on top poles

Most of the top portable self-time poles are **already covered by unimported vm-drop packages**. Import those before more HUD/radar/transform work. New poles under the exclusion list that remained: propulsion coolRuntime/normalizeBody, massline textContent reads.
