# ALLOCATION CAMPAIGN — sim worker garbage (2026-11-21)

Owner of the measurement: the no-freeze lead. Ruling: the coordinator, 2026-11-21. Several agents run the slices below at the same time; slices do not share files.

## Why

The simulation worker allocates **1.63 MB per fixed step** in a busy Swarm round (sampled with collected objects included, 2940 steps). Garbage collection itself is under 1% of worker time (DevTools trace: minor collections max 5-7.5 ms, majors 15-29 ms), but allocation is spread over hundreds of sites, costs CPU in every step, and is what the world-speed target (0.97 or better on the owner's laptop) is fighting. **Target: under 200 KB per step in a busy Swarm round; no collector pause over 8 ms in three minutes.**

## The rule

- **Simulation results stay bit-identical.** Run npm run check:sim after every commit; a moved hash means the change altered behaviour and is wrong unless that was the point.
- One slice = one agent; edit only the files of your slice. A site in another slice's file goes in your report, not your diff.
- Commit by exact path; never tree-wide git commands. Measure before and after each commit with the probe below; put both numbers in the commit message.

## The probe

    node scripts/fleet/game-lock.mjs run -- node scripts/probe-no-freeze-electron.mjs --route=swarm --seconds=90 --alloc --out=.devshots/no-freeze/alloc-<slice>

It drives the desktop build with a busy Swarm round and dense input, attaches to the sim worker over DevTools, samples allocation (collected objects included) and prints bytes per step and the top sites. Built-ins (push, join, Map.set, Rapier vector constructors) are charged to the JS function that called them, shown as `caller file:line [builtin]`. The full list (top 80) is in `<out>/report.json` under `alloc.top` as `[site, totalBytes, bytesPerStep]`. Add `--gctrace` for a DevTools collector trace of the worker (counts and lengths of minor and major collections) and `--profile` for per-system step times. Numbers vary run to run by about 20%: compare runs taken in the same session.

## Measured top 60 sites (bytes per step, busy Swarm, 2026-11-21)

| # | bytes/step | site |
|---|---|---|
| 1 | 60358 | writeDomainSignature scripts/lib/simReadModel.mjs:1739 |
| 2 | 38517 | entityVitalsOf scripts/lib/simWorkerHost.mjs:365 |
| 3 | 36035 | _readPostStepKinematics src/core/sg02DynamicBodyOwner.js:2181 [register] |
| 4 | 32144 | walk scripts/lib/simReadModel.mjs:2178 [join] |
| 5 | 28215 | sweptDiscsOverlap src/systems/swarmSafety.js:14 |
| 6 | 26517 | _readPostStepKinematics src/core/sg02DynamicBodyOwner.js:2181 |
| 7 | 26317 | _captureExpectedKinematics src/core/sg02DynamicBodyOwner.js:2098 |
| 8 | 20683 | deliverPhysicalImpulseDetailed src/combat/physicalEffects.js:190 |
| 9 | 20207 | linvel vendor/rapier3d-compat/rapier.mjs:1 |
| 10 | 19959 | angvel vendor/rapier3d-compat/rapier.mjs:1 |
| 11 | 19833 | rotation vendor/rapier3d-compat/rapier.mjs:1 |
| 12 | 19576 | pruneEvidence src/combat/stuntEvidence.js:388 |
| 13 | 17366 | writeDomainSignature scripts/lib/simReadModel.mjs:1739 [sort] |
| 14 | 16277 | angvel vendor/rapier3d-compat/rapier.mjs:1 [register] |
| 15 | 15697 | observeContact src/combat/stuntEvidence.js:212 |
| 16 | 15449 | linvel vendor/rapier3d-compat/rapier.mjs:1 [register] |
| 17 | 14993 | collectWeaponVfxProjectiles scripts/lib/simWorkerHost.mjs:841 |
| 18 | 14870 | _applyForces src/systems/fields.js:2275 |
| 19 | 14223 | flattenEventPayload scripts/lib/simEventBridge.mjs:136 |
| 20 | 14032 | _enforcePlane src/core/sg02DynamicBodyOwner.js:3926 |
| 21 | 13242 | writeDomainSignature scripts/lib/simReadModel.mjs:1739 [push] |
| 22 | 13145 | _syncEntityFromKinematics src/core/sg02DynamicBodyOwner.js:4033 |
| 23 | 12821 | writeVitalShadow scripts/lib/simWorkerHost.mjs:669 |
| 24 | 12761 | _resolveCoincidentSpawnSlot src/core/sg02DynamicBodyOwner.js:3144 |
| 25 | 12599 | _publishTelemetry src/core/sg02DynamicBodyOwner.js:4054 |
| 26 | 12465 | _maybeResyncBodyPose src/core/sg02DynamicBodyOwner.js:3646 |
| 27 | 12255 | resolvePins src/world/activityClassification.js:150 |
| 28 | 12235 | _stepFixed src/core/sg02DynamicBodyOwner.js:1729 |
| 29 | 11957 | syncFromEntityLayers src/core/sg02DynamicBodyOwner.js:1206 |
| 30 | 11886 | isMasslineObstructed src/world/asteroidField.js:551 |
| 31 | 11877 | classifyWorld src/world/activityRuntime.js:1675 |
| 32 | 11814 | recordBridgeEvent scripts/lib/simWorkerHost.mjs:1394 |
| 33 | 11756 | measureThrusterAuthority src/core/physicsAuthority.js:571 |
| 34 | 11651 | snapshotNativePhysicsImpact src/core/physics.js:2491 |
| 35 | 11649 | queryRadius src/core/spatialHash.js:544 [push] |
| 36 | 11512 | rotation vendor/rapier3d-compat/rapier.mjs:1 [register] |
| 37 | 11274 | pruneEvidence src/combat/stuntEvidence.js:388 [next] |
| 38 | 11249 | walk scripts/lib/simReadModel.mjs:2178 |
| 39 | 11202 | _captureExpectedKinematics src/core/sg02DynamicBodyOwner.js:2098 [register] |
| 40 | 11196 | fracturePositions src/systems/environmentMaterials.js:34 |
| 41 | 10671 | imminentCollisionFor src/world/activityRuntime.js:363 |
| 42 | 10525 | _applyStructuralGive src/core/sg02DynamicBodyOwner.js:2785 |
| 43 | 10346 | classifyWorld src/world/activityRuntime.js:1675 [add] |
| 44 | 10213 | step src/systems/swarmBrood.js:1428 |
| 45 | 9795 | update src/combat/stuntFlightEvidence.js:88 |
| 46 | 9408 | _syncDynamicLayer src/core/spatialHash.js:190 |
| 47 | 9237 | normalizeAuthority src/core/physicsAuthority.js:792 |
| 48 | 9164 | observeAppliedImpulse src/combat/stuntEvidence.js:89 |
| 49 | 9032 | translation vendor/rapier3d-compat/rapier.mjs:1 |
| 50 | 8927 | _stepFixed src/core/sg02DynamicBodyOwner.js:1729 [next] |
| 51 | 8764 | sweepProjectiles src/core/physics.js:1318 |
| 52 | 8684 | vitalShadowMatches scripts/lib/simWorkerHost.mjs:560 |
| 53 | 8264 | queryRadius src/core/spatialHash.js:544 |
| 54 | 7925 | handleTick scripts/lib/simWorkerHost.mjs:2630 |
| 55 | 7860 | migrateLadderInstance src/careers/ladders/ladderSchema.js:127 |
| 56 | 7746 | bodyLife src/combat/stuntEvidence.js:55 |
| 57 | 7645 | (anon) src/core/sg02DynamicBodyOwner.js:3494 |
| 58 | 7487 | armClassifyFrameVisit src/world/activityRuntime.js:1516 |
| 59 | 7444 | _think src/ai/pack/packBrain.js:389 |
| 60 | 7316 | sampleProjectileEvidence src/combat/stuntProjectileEvidence.js:46 |

## Slices

### A — Physics readback and kinematics capture

- **Files (exclusive):** `src/core/sg02DynamicBodyOwner.js`, `src/core/physicsAuthority.js`, `src/core/physics.js`, `vendor/rapier3d-compat`
- **Measured in the top 60:** about 361 KB/step across 25 sites: `_readPostStepKinematics src/core/sg02DynamicBodyOwner.js:2181 [register]`, `_readPostStepKinematics src/core/sg02DynamicBodyOwner.js:2181`, `_captureExpectedKinematics src/core/sg02DynamicBodyOwner.js:2098`, `linvel vendor/rapier3d-compat/rapier.mjs:1`, `angvel vendor/rapier3d-compat/rapier.mjs:1`, `rotation vendor/rapier3d-compat/rapier.mjs:1`, `angvel vendor/rapier3d-compat/rapier.mjs:1 [register]`, `linvel vendor/rapier3d-compat/rapier.mjs:1 [register]`
- **Target:** under 39 KB/step for the slice's sites.
- **Pattern:** Read Rapier state through reused scratch (one read per body per step), batch raw reads where the compat layer allows (translation/linvel/angvel/rotation each allocate a Vector and a raw handle today), keep per-record scratch for expected/post kinematics, no object literals in _syncEntityFromKinematics/_enforcePlane/_maybeResyncBodyPose/_resolveCoincidentSpawnSlot, telemetry inputs reused.
- **Always:** no per-step arrays, Maps, closures or iterator objects on hot paths; reused scratch objects and pools; strings only for diagnostics someone reads, and only when asked; check:sim after each commit.

### B — Reply building: domain diff, vitals, bridge events

- **Files (exclusive):** `scripts/lib/simReadModel.mjs`, `scripts/lib/simWorkerHost.mjs`, `scripts/lib/simEventBridge.mjs`
- **Measured in the top 60:** about 238 KB/step across 12 sites: `writeDomainSignature scripts/lib/simReadModel.mjs:1739`, `entityVitalsOf scripts/lib/simWorkerHost.mjs:365`, `walk scripts/lib/simReadModel.mjs:2178 [join]`, `writeDomainSignature scripts/lib/simReadModel.mjs:1739 [sort]`, `collectWeaponVfxProjectiles scripts/lib/simWorkerHost.mjs:841`, `flattenEventPayload scripts/lib/simEventBridge.mjs:136`, `writeDomainSignature scripts/lib/simReadModel.mjs:1739 [push]`, `writeVitalShadow scripts/lib/simWorkerHost.mjs:669`
- **Target:** under 29 KB/step for the slice's sites.
- **Pattern:** Domain signatures without join/sort/push of fresh arrays (incremental dirty marks or a numeric hash over the leaves), vitals rows reused per entity (no fresh fields object when unchanged), weapon-VFX rows pooled, bridge event records and flattened payloads pooled or built only for forwarded types.
- **Always:** no per-step arrays, Maps, closures or iterator objects on hot paths; reused scratch objects and pools; strings only for diagnostics someone reads, and only when asked; check:sim after each commit.

### C — Combat evidence and stunt pruning

- **Files (exclusive):** `src/combat/stuntEvidence.js`, `src/combat/stuntFlightEvidence.js`, `src/combat/stuntProjectileEvidence.js`, `src/combat/physicalEffects.js`
- **Measured in the top 60:** about 99 KB/step across 8 sites: `deliverPhysicalImpulseDetailed src/combat/physicalEffects.js:190`, `pruneEvidence src/combat/stuntEvidence.js:388`, `observeContact src/combat/stuntEvidence.js:212`, `pruneEvidence src/combat/stuntEvidence.js:388 [next]`, `update src/combat/stuntFlightEvidence.js:88`, `observeAppliedImpulse src/combat/stuntEvidence.js:89`, `bodyLife src/combat/stuntEvidence.js:55`, `sampleProjectileEvidence src/combat/stuntProjectileEvidence.js:46`
- **Target:** under 15 KB/step for the slice's sites.
- **Pattern:** Ring buffers instead of growing/pruned arrays, prune in place (no filter/iterator copies), contact/impulse observations written into pooled records, detailed impulse delivery returns into a caller scratch.
- **Always:** no per-step arrays, Maps, closures or iterator objects on hot paths; reused scratch objects and pools; strings only for diagnostics someone reads, and only when asked; check:sim after each commit.

### D — Swarm safety, overlap and spatial queries

- **Files (exclusive):** `src/systems/swarmSafety.js`, `src/systems/swarmBrood.js`, `src/core/spatialHash.js`, `src/core/convexHullQuery.js`, `src/world/asteroidField.js`, `src/core/physics.js#sweepProjectiles (coordinate with A: A owns physics.js — D only proposes)`
- **Measured in the top 60:** about 76 KB/step across 6 sites (excluding the two `src/core/physics.js` sites, which slice A owns): `sweptDiscsOverlap src/systems/swarmSafety.js:14`, `isMasslineObstructed src/world/asteroidField.js:551`, `queryRadius src/core/spatialHash.js:544 [push]`, `step src/systems/swarmBrood.js:1428`, `_syncDynamicLayer src/core/spatialHash.js:190`, `queryRadius src/core/spatialHash.js:544`
- **Target:** under 15 KB/step for the slice's sites.
- **Pattern:** Overlap tests on numbers (no vector objects), queryRadius into a caller-owned result array, hull sweeps into reused scratch, obstruction tests without per-call arrays.
- **Always:** no per-step arrays, Maps, closures or iterator objects on hot paths; reused scratch objects and pools; strings only for diagnostics someone reads, and only when asked; check:sim after each commit.

### E — Activity classification, fields, AI pack brain

- **Files (exclusive):** `src/world/activityRuntime.js`, `src/world/activityClassification.js`, `src/systems/fields.js`, `src/systems/environmentMaterials.js`, `src/ai/pack/packBrain.js`, `src/careers/ladders/ladderSchema.js`
- **Measured in the top 60:** about 92 KB/step across 9 sites: `_applyForces src/systems/fields.js:2275`, `resolvePins src/world/activityClassification.js:150`, `classifyWorld src/world/activityRuntime.js:1675`, `fracturePositions src/systems/environmentMaterials.js:34`, `imminentCollisionFor src/world/activityRuntime.js:363`, `classifyWorld src/world/activityRuntime.js:1675 [add]`, `migrateLadderInstance src/careers/ladders/ladderSchema.js:127`, `armClassifyFrameVisit src/world/activityRuntime.js:1516`
- **Target:** under 20 KB/step for the slice's sites.
- **Pattern:** Classification frames reuse Sets/Maps (clear, not new), pin resolution and imminent-collision checks into scratch, field forces without per-body temporaries, fracture positions pooled, ladder migration only on load (never per step).
- **Always:** no per-step arrays, Maps, closures or iterator objects on hot paths; reused scratch objects and pools; strings only for diagnostics someone reads, and only when asked; check:sim after each commit.

### F — The long tail by system

- **Files (exclusive):** `every other file under src/ and scripts/lib/ (claim a system before editing; one system per agent)`
- **Measured in the top 60:** the sites above that no slice names (for example `migrateLadderInstance`, `_think src/ai/pack/packBrain.js` belongs to E) plus everything below rank 60, together roughly two-thirds of all allocation: the top 60 sites cover about a third.
- **Target:** under 10 KB/step for the slice's sites.
- **Pattern:** Run the probe, take the next site off the list, apply the same patterns; stop when the system is under 5 KB/step.
- **Always:** no per-step arrays, Maps, closures or iterator objects on hot paths; reused scratch objects and pools; strings only for diagnostics someone reads, and only when asked; check:sim after each commit.

## Done means

The probe shows the slice's sites under target in two runs, check:sim unchanged, and the slice's report lists any site it found in another slice's files. The campaign is done when a busy Swarm round measures under 200 KB per step and npm run check:no-freeze shows world speed 0.97 or better in every ten-second window.
