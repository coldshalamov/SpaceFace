# PQ-133 Crucible seam audit

Date: 2026-08-21

Scope: CRU-001 only. This is a source audit, not an implementation packet.
The master plan now lives at design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md; the former
docs/Spec/SPACEFACE_CRUCIBLE_SURVIVAL_MASTER_PLAN.md is a six-line move notice
(docs/Spec/SPACEFACE_CRUCIBLE_SURVIVAL_MASTER_PLAN.md:1).
The requested plan slices were read at their current canonical locations: §25.0
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:3613), §27
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:4025), §28
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:4316), Phase 0–4
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:4726), §31
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:5132), Appendix A
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:6016), and Appendix E
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:6722).
No game, browser probe, or npm script was run.

Legend:

- Reusable means the named owner can be called or extended without creating a competing writer.
- MISSING means no verified live seam supplies the required Crucible behavior.
- Proposed signatures in First packet shape are designs for CRU-002/CRU-003, not live exports.
- A symbol described as private exists but is not exported from its module.

## Sandbox and launch path

### Current route and symbols

| Concern | Verified live seam |
|---|---|
| Preset catalog | SCENARIO_PRESETS is exported from src/ui/sandbox/sandboxSetup.js:123. |
| Recovery ids | RECOVERY_SCENARIO_IDS is exported at src/ui/sandbox/sandboxSetup.js:40. |
| Camera choices | SANDBOX_CAMERA_CANDIDATES is exported at src/ui/sandbox/sandboxSetup.js:54. |
| Physics loadouts | SANDBOX_PHYSICS_LOADOUTS is exported at src/ui/sandbox/sandboxSetup.js:61. |
| Config builder | buildSandboxLaunchConfig(baseConfig, overrides) is exported at src/ui/sandbox/sandboxSetup.js:83. |
| Launch request | requestSandboxGame(bus, config) is exported at src/ui/sandbox/sandboxSetup.js:283. |
| Post-start setup | installSandboxGameStartedHook and applySandboxSetup are exported at src/ui/sandbox/sandboxSetup.js:290 and src/ui/sandbox/sandboxSetup.js:771. |
| Live helper exports | giveAndEquipItem, spawnEnemyNow, and spawnTargetsNow are exported at src/ui/sandbox/sandboxSetup.js:840, src/ui/sandbox/sandboxSetup.js:849, and src/ui/sandbox/sandboxSetup.js:855. |

requestSandboxGame stages the setup and emits game:new
(src/ui/sandbox/sandboxSetup.js:283). The installed hook consumes game:started, applies
the staged setup once, and clears it on game:startFailed
(src/ui/sandbox/sandboxSetup.js:290). The real launcher consumes game:new in
src/main.js:190, calls the private startNewGame at src/main.js:318, changes mode through
the private enterFlightMode at src/main.js:591, and emits game:started at src/main.js:419.
The terminal launch state is state.mode = 'flight' at src/main.js:416.

The Sandbox is therefore not a parallel game. It first runs the ordinary New Game reset,
ship construction, registry, and scene bootstrap, then applies canonical setup writers
(src/ui/sandbox/sandboxSetup.js:1). New Game itself directly consumes the New Game form;
the Sandbox stages additional post-start mutations.

### Accepted config and presets

| Input | Current behavior | Crucible disposition |
|---|---|---|
| Hull | config.shipId is applied through setShip; setShip calls ships.buyShip with grant and setActive at src/ui/sandbox/sandboxSetup.js:451. | Reusable as-is for one selected hull. |
| Loadout | config.physicsLoadout selects starter, impulse, or physics_toolkit definitions at src/ui/sandbox/sandboxSetup.js:61. applySandboxSetup routes their modules through grant/equip helpers at src/ui/sandbox/sandboxSetup.js:787. | Named debug loadouts are reusable; arbitrary slot-by-slot fittings are MISSING — must be added in CRU-003. |
| Enemies | config.spawnEnemies is an array of archetype/count/level entries consumed at src/ui/sandbox/sandboxSetup.js:807. buildSandboxLaunchConfig can override enemyCount from 0–20 at src/ui/sandbox/sandboxSetup.js:96. | Simple immediate lists are reusable; package ids, waves, gates, spawn cadence, and budget receipts are MISSING — CRU-003 defines setup data and CRU-012 adds canonical wave materialization. |
| Seed | Only an own, finite uint32 config.seed is forwarded into game:new options by private gameNewOptionsForSandboxConfig at src/ui/sandbox/sandboxSetup.js:272. | Reusable as-is for launch determinism. Same-seed restart/build identity is MISSING — must be added in CRU-003/CRU-007. |
| Arena | No arenaId is accepted by buildSandboxLaunchConfig at src/ui/sandbox/sandboxSetup.js:83. sectorId and pos are used by individual presets. | MISSING — must be added in CRU-003, then backed by arena data in CRU-009/CRU-028. |
| Wave | No wave or enemyPackage field exists in the builder at src/ui/sandbox/sandboxSetup.js:83. | MISSING — must be added in CRU-003. |

Existing ordinary presets are drill, arsenal, combat, and freeplay
(src/ui/sandbox/sandboxSetup.js:125). Recovery presets include three Massline cases,
physics_swarm, Ceres, planet sling, crime interception, and visual_stress_scene
(src/ui/sandbox/sandboxSetup.js:169).
physics_swarm chooses ship_hornet, physics_toolkit, 10 light plus 2 medium enemies, and
3 anchors (src/ui/sandbox/sandboxSetup.js:202). visual_stress_scene requests 12 light,
2 medium, 3 anchors, and 4 drones (src/ui/sandbox/sandboxSetup.js:255).

bootstrapScene is private. It resolves the active hull/fittings, calls exported
makeShipEntitySpec, spawns the player, and then calls ships.recomputeActiveShip
(src/main.js:288). The ships system is the canonical player-ship writer; Sandbox does
not construct the player entity by hand.

Events consumed: game:started and game:startFailed
(src/ui/sandbox/sandboxSetup.js:290). Events emitted: game:new
(src/ui/sandbox/sandboxSetup.js:285), plus setup-specific writer events downstream.
Reusable: the real New Game staging pattern and canonical ship/economy/tech calls.
MISSING — current spawnEnemies directly calls makeEnemySpawnSpec and helpers.spawnEntity
at src/ui/sandbox/sandboxSetup.js:463; it does not request spawnBudget. CRU-003 must stop
Combat Lab packages from inheriting that bypass.

Coverage: test/sandbox-recovery-launcher.test.mjs:10 imports the launcher symbols;
the preset/override cases begin at test/sandbox-recovery-launcher.test.mjs:137 and the
seed forwarding cases at test/sandbox-recovery-launcher.test.mjs:436.
test/ceres-active-pockets.test.mjs:652 also exercises the Ceres Sandbox preset.

## Deterministic Lab

### Scenario contract and runner

| Concern | Verified live seam |
|---|---|
| Schema owner | SIM_SCENARIO_SCHEMA, SIM_SCENARIO_VERSION, and EVIDENCE_CLASSES are exported from src/contracts/simScenarioSchema.js:5. |
| Validation | validateSimScenario is exported at src/contracts/simScenarioSchema.js:179. |
| Compilation | compileSimScenario is exported at src/contracts/simScenarioSchema.js:594. |
| Execution | runLabScenario is exported from src/testing/lab/runScenario.js:42. |
| Entity construction | ENTITY_PROFILE_REGISTRY, resolveEntityProfile, buildEntitySpawnSpec, and listEntityProfiles are exported from src/testing/lab/entityProfiles.js:12, src/testing/lab/entityProfiles.js:53, src/testing/lab/entityProfiles.js:87, and src/testing/lab/entityProfiles.js:148. |
| Repeat | repeatScenario is exported from src/testing/lab/repeat.js:79. |
| Replay | replayScenario and replayFailure are exported from src/testing/lab/replay.js:12 and src/testing/lab/replay.js:55. |
| Save/load comparison | compareSaveLoad is exported from src/testing/lab/saveLoadCompare.js:77. |
| CLI | runLabCommand is exported from scripts/sf-lab.mjs:33. |

Top-level scenario keys are an allowlist: schema, id, version, title, description,
evidenceClass, runtimeProfile, seed, ticks, dt, world, entities, relations, attachments,
inputEvents, frames, policies, checkpoints, trace, metrics, assertions, parameterOverlay,
fixtureExceptions, systems, observer, notes, and saveLoadEquivalence
(src/contracts/simScenarioSchema.js:24).
The world shape is validated at src/contracts/simScenarioSchema.js:64.
Each startup entity can declare alias, profile, role, team, factionId, isPlayer, pos,
vel, heading, angularVelocity, overrides, loadout, and persistent
(src/contracts/simScenarioSchema.js:74).
Input events and assertion frames are validated at
src/contracts/simScenarioSchema.js:293 and src/contracts/simScenarioSchema.js:366.

A complete small example is src/testing/scenarios/flight-fixed-input.scenario.json:1:
it declares schema/id/version, seed/ticks, a world block, startup entities, frames,
metrics, assertions, trace, fixture exceptions, and observer.
runLabScenario compiles the scenario at src/testing/lab/runScenario.js:142, builds the
authoritative runtime at src/testing/lab/runScenario.js:200, and materializes startup
entities with buildEntitySpawnSpec plus runtime.spawn at
src/testing/lab/runScenario.js:229.

Scenario “spawns” today are the entities array at tick zero. There is no scheduled
enemy package, wave, gate, or spawn-at-tick schema key. Entity profiles cover starter
ships, direct ship_* ids, asteroids, and payload anchors
(src/testing/lab/entityProfiles.js:12); there is no enemy-archetype profile.
MISSING — must be added in CRU-008 for deterministic Combat Lab parity, after CRU-003
freezes the human-facing setup schema. CRU-003 should not silently widen simScenario.v1.

repeatScenario runs arms and compares traceHash, deterministicCovered output, and
semantic output (src/testing/lab/repeat.js:171, src/testing/lab/repeat.js:218).
replayScenario does not prove determinism; it reruns a failure and requires the same
failure fingerprint (src/testing/lab/replay.js:20).
compareSaveLoad compares deterministic coverage and tick-by-tick traces
(src/testing/lab/saveLoadCompare.js:265).

New scenarios are placed under src/testing/scenarios. loadScenario searches explicit
paths and scenario ids there (scripts/sf-lab.mjs:285); only shorthand names need an
entry in the SHORT map at scripts/sf-lab.mjs:310.
The sf command dispatches validate, run, repeat, compare, replay, and trace at
scripts/sf-lab.mjs:48. package.json exposes it as npm run sf at package.json:15;
there is no check:lab script.

Events: scenarios observe real gameplay events through trace declarations; the runner
does not introduce a second gameplay event bus. Reusable: schema validation, seeded
runtime, repeat, replay fingerprinting, save/load comparison, and coverage accounting.

Coverage: test/sim-scenario-schema.test.mjs:1,
test/lab-runner.test.mjs:1, test/lab-scenarios-cli.test.mjs:1,
test/lab-repeat.test.mjs:1, test/lab-replay.test.mjs:1, and
test/lab-save-load-compare.test.mjs:1.
The evidence classes and authoring route are documented at
docs/VALIDATION_WORKFLOW.md:74 and docs/VALIDATION_WORKFLOW.md:118.

## Run / session lifecycle

### Boot, New Game, Continue, and menu exit

| Transition | Owner and effect |
|---|---|
| Boot | Private boot creates state with createGameState and a Date.now-derived seed at src/main.js:89, creates the bus at src/main.js:105, and creates the registry at src/main.js:124. |
| New Game | main consumes game:new at src/main.js:190 and calls private startNewGame at src/main.js:318. |
| Fresh reset | startNewGame destroys current entities with entity:destroyed, calls private resetRunState, resets combat input, then calls resetFreshRunSystems at src/main.js:324. |
| Canonical player reset | startNewGame invokes ships.newGame before scene bootstrap at src/main.js:340. |
| Continue | mainMenuScreen emits game:load at src/ui/screens/mainMenu.js:265; save consumes it at src/save/saveSystem.js:137 and restores before save:loaded at src/save/saveSystem.js:2428. |
| Loaded flight | private finalizeLoadedGame is at src/main.js:461 and returns through private enterFlightMode at src/main.js:591. |
| Exit to menu | pauseScreen’s private _toMenu directly sets ctx.state.mode = 'menu', closes screens, and replaces mainMenu at src/ui/screens/pause.js:426. |

The state factory is createGameState in src/core/gameState.js:99, not
src/core/state.js. The latter path does not exist.
private resetRunState creates a fresh state and copies an explicit set of fields back
onto the shared object at src/main.js:700. A newly added state.run will be lost or stale
unless CRU-002 explicitly includes it in this reset boundary.
resetFreshRunSystems is exported from src/core/runReset.js:26 and invokes newGame on
the listed FRESH_RUN_SYSTEMS at src/core/runReset.js:3.

Current save schema version is CURRENT_VERSION = 14 in src/data/saveVersion.js:14.
Migrations are sequential functions in MIGRATIONS at src/save/migrations.js:104.
The latest migration is v13 → v14 and initializes provenance as
version 1, empty chains, empty openIncidents, and nextSeq 0
(src/save/migrations.js:299).
save is the exported system at src/save/saveSystem.js:104.
Its capture plan begins at src/save/saveSystem.js:292 and serialization at
src/save/saveSystem.js:342; neither contains state.run.

PAUSING_SCREENS is a private Set in src/ui/screenManager.js:20. It includes pause,
mainMenu, newGame, gameOver, settings, saveLoad, help, codex, drill, base, station,
sandbox, ship, range, footprint, galaxyMap, and localmap.
The manager emits sim:pause at src/ui/screenManager.js:301 and sim:resume at
src/ui/screenManager.js:308 only when aggregate pausing-screen state changes.

Events consumed: game:new, game:load, save:restoring, and save:loaded.
Events emitted: entity:destroyed, game:started, game:startFailed, mode:changed,
sim:pause, and sim:resume at the cited owners.
Reusable: createGameState, the real startNewGame pipeline, resetFreshRunSystems,
the migration chain, and centralized screen pause aggregation.

MISSING — must be added in CRU-002: an orthogonal state.run contract, one run-session
writer, a run-aware exit-to-menu lifecycle event, explicit reset semantics, and an
autosave exclusion. The current _toMenu raw assignment neither resets state nor emits
mode:changed, so it is not a safe Survival teardown seam.

Coverage: test/new-game-reset.test.mjs:1, test/new-game-lifecycle.test.mjs:1,
test/save-schema.test.mjs:1, scripts/check-sg03-save-reload.mjs:1,
test/screen-manager-pause.test.mjs:1, and test/pause-screen-actions.test.mjs:1.
Exact filenames must remain the source of truth where a focused file is absent; the
packaged save gates are listed under Existing checks to keep green.

## Weapon firing

### Data schema

WEAPONS is exported from src/data/weapons.js:10. There is no separate runtime validator;
the live schema is the object shape consumed by weapons.

| Field group | Pulse Laser S at src/data/weapons.js:12 | Projectile example: Autocannon S at src/data/weapons.js:23 |
|---|---|---|
| Identity/catalog | id, name, slotType, size, tier, mass, price | Same fields |
| Damage cadence | dmg 8, rof 5.5, dps 44, damageType energy, energyCost 2 | dmg 14, rof 2.2, dps 31, damageType kinetic, energyCost 1.5 |
| Projectile | projSpeed 320, range 600, tracking fixed, spreadDeg 0.6 | projSpeed 420, range 520, tracking fixed, spreadDeg 2.2 |
| Thermal | heatPerShot 5, heatMax 100, heatDissip 12 | heatPerShot 9, heatMax 100, heatDissip 28 |
| Consequence | impulsePerHit 0.5, tumbleTorque 0.05, impulseProvenance pulse | armorPierce 0.5, impulsePerHit 28, tumbleTorque 4, impulseProvenance autocannon |

The firing owner is exported system weapons at src/systems/weapons.js:98.
private _serviceProjectileWeapon is at src/systems/weapons.js:607. It checks cooldown,
capacitor energy, and heat capacity before committing capacitor, heat, and cooldown at
src/systems/weapons.js:695; it calls private _spawnProjectile at
src/systems/weapons.js:719 and emits combat:fire at src/systems/weapons.js:713.

_spawnProjectile derives speed, range, velocity, and ttl at
src/systems/weapons.js:720. The shot data contains damage, damageType, damagePacket,
ownerId, weaponId, kind, spawnPos, and maxDistance at src/systems/weapons.js:744.
Missiles additionally carry targetId, turnRate, projSpeed, projAccel, armed,
splashRadius, and splashDmg at src/systems/weapons.js:756.
The spawned entity also has team, ownerId, factionId, radius, mass, ttl, collides,
position, rotation, and velocity at src/systems/weapons.js:768.

buildWeaponDamagePacket is exported at src/systems/weapons.js:1185. It maps
armorPierce to packet penetration and copies shield bypass, subsystem share, statuses,
impulse, tumble, and weapon source fields at src/systems/weapons.js:1200.
armorPierce is damage penetration; it is not a count of bodies the projectile may pass.

Events emitted: combat:fire; beam paths also emit combat:beamStop as declared by the
owner contract at src/systems/weapons.js:2. The system consumes input/action state
rather than a Crucible-specific fire event.
Reusable: weapon definitions, energy/heat spending, projectile creation, and damage
packet construction.

MISSING — must be added in CRU-020/CRU-021: immutable AttackSpec reference/digest,
root/descendant lineage id, generation, remaining proc budget, visited-target set,
bounce count, chain state, and child inheritance. No current per-shot field represents
those concepts.

Coverage: scripts/check-gameplay-core.mjs:5024,
scripts/check-sg03-save-reload.mjs:1,
test/arcade-core-physics-arsenal.test.mjs:1, and
test/weapon-impulse-consequence.test.mjs:1.
The 47a firing/hit counts are pinned under Existing checks to keep green.

## Projectile contact and damage

### Contact owners and receipt shapes

| Contact | Current owner | Current receipt |
|---|---|---|
| Projectile → entity | custom physics sweepProjectiles in src/core/physics.js:576; fallback pair collision at src/core/physics.js:650. | projectile:hit built by exported projectileHitPayload at src/core/physics.js:1023. |
| Projectile → world surface | No distinct surface route. Collidable station/asteroid/prop entities pass through the same entity sweep. Rapier projectiles are ghosted and swept in JavaScript, as documented at src/core/sg02DynamicBodyOwner.js:67. | The same projectile:hit receipt; the projectile is consumed at src/core/physics.js:621. |
| General body contact | SG02/Rapier contact collection in src/core/sg02DynamicBodyOwner.js:840. | physics:impact is emitted by custom physics with consequenceKernelVersion, backend, tick, aId, bId, dp, trauma, impulse, player involvement, causalActorId, pos, and normal at src/core/physics.js:1161. |

projectileHitPayload contains targetId, ownerId, damage, damageType, pos, approach,
normal, optional weaponId, and a cloned packet hit record
(src/core/physics.js:1023). pos is the available contact point. normal exists.
approach is normalized projectile direction, not contact velocity.
Surface material, projectile velocity, target/surface velocity, relative velocity, and
surface motion are absent.

The combat system is exported as combat from src/systems/combat.js:430. It consumes
projectile:hit at src/systems/combat.js:444 and routes a normalized packet at
src/systems/combat.js:463.
createDamageRouter is exported from src/combat/damage.js:16. Its callable routeDamage
is created privately at src/combat/damage.js:35.
Other exported entry points are normalizeDamagePacket, scalarHitToDamagePacket, and
legacyHitToDamagePacket at src/combat/damage.js:414, src/combat/damage.js:435, and
src/combat/damage.js:467.

routeDamage emits combat:damage with targetId, attackerId, raw/applied amount, type,
channels/layers, before/after state, pos, approach, normal, faction/origin, and weaponId
at src/combat/damage.js:241.
Combat emits entity:killed with id, killerId, type, pos, factionId, factionLawful,
bountyCr, lootTableId, victimClass, targetHostileToPlayer, and presentation
(src/systems/combat.js:580).
buildKillPresentationReceipt is exported at src/systems/combat.js:329 and supplies
cause, position, direction, normal, surface, targetVelocity, playerCaused, and impact
to the nested presentation field.

Kill attribution today stops at killerId plus the nested presentation cause. There is
no attack lineage, root shot, generation, bounce/chain path, visited set, or shared proc
budget in entity:killed.
MISSING — CRU-021 must add lineage and CRU-025 must add an authoritative surface-contact
receipt containing point, normal, material, and relative/contact velocity. CRU-036 must
then derive deduplicated causal score attribution rather than guessing from VFX.

Reusable: the single damage router, combat:damage layer receipt, current killerId,
and presentation receipt. Events consumed/emitted are projectile:hit → combat:damage →
entity:killed.

Coverage: test/damage-death-recovery.test.mjs:1,
test/entity-killed-presentation-receipt.test.mjs:1,
test/weapon-impulse-consequence.test.mjs:1, and
test/ceres-job-law-response.test.mjs:616.

## Physics authority

### Body contract and Rapier owner

physicsAuthority exports PHYSICS_BODY_SCHEMA, PHYSICS_BODY_SCHEMA_VERSION,
PHYSICS_BACKEND_DEFAULT, PHYSICS_BACKENDS, choosePhysicsBackend,
ensurePhysicsBodySpec, setPhysicsMass, setPhysicsInertiaY, setPhysicsRadius,
setPhysicsMaterial, setPhysicsAttachmentPoints, markPhysicsDirty,
syncPhysicsBodyFromEntity, clearPhysicsBody, physicsBodySignature,
assertNoIllegalPhysicsWrites, and installPhysicsAuthority
(src/core/physicsAuthority.js:7, src/core/physicsAuthority.js:120,
src/core/physicsAuthority.js:157, src/core/physicsAuthority.js:242).

ensurePhysicsBodySpec produces schemaVersion, mass, inertiaY, centerOfMass, radius,
shape, dynamic, ccd, material, attachmentPoints, thrusters, and revision
(src/core/physicsAuthority.js:136).
There is no body-kind enum. Entity type plus the dynamic boolean determine behavior;
default dynamic entity types are selected at src/core/physicsAuthority.js:313.

createSg02DynamicBodyOwner and createSg02CombatPhysicsPort are exported from
src/core/sg02DynamicBodyOwner.js:127 and src/core/sg02DynamicBodyOwner.js:132.
The owner creates Rapier dynamic or fixed rigid bodies at
src/core/sg02DynamicBodyOwner.js:643.
It has no kinematic-position-based or kinematic-velocity-based body creation path and
no setNextKinematicTranslation/Rotation seam.

Surface material exists only as collision tuning. The SG02 material table gives ship
0 restitution, rock 0.22, station 0.06, debris 0.16, payload 0.10, and projectile/sensor
ghost behavior at src/core/sg02DynamicBodyOwner.js:71.
physicsAuthority also has a default material object at
src/core/physicsAuthority.js:324.
Custom collision response reads restitution in src/core/physics.js:1093 and applies it
at src/core/physics.js:1116.
Neither system exposes authored material identity such as reflective, absorbent, hot,
or cryogenic in contact receipts.

Events: physics authority emits/feeds physics:impact through the physics owner; it
consumes entity lifecycle and physics dirty state through the registry integration.
Reusable: body schema, backend selection, fixed/dynamic Rapier ownership, CCD, mass,
inertia, radius, and low-level restitution.

MISSING — CRU-025 must promote material identity and velocity into authoritative
contact receipts. CRU-029 must extend the body schema with an explicit motion type and
add a sole-writer kinematic pose API for moving shutters. A moving surface also needs
relative surface velocity in projectile/body contact; teleporting fixed geometry is
not an acceptable substitute.

Coverage: scripts/check-physics-authority.mjs:1,
scripts/check-sg02-save-reload.mjs:1,
test/arcade-core-physics-arsenal.test.mjs:1,
test/floating-origin-rapier.test.mjs:1, and
test/physics-authority-cache.test.mjs:1.

## Combat statuses and subsystems

### Current status ids

STATUS_DEFS and SUBSYSTEM_DEFS are exported from src/data/combatDefs.js:123 and
src/data/combatDefs.js:200. The four exported coupling ids are
STATUS_GRAVITY_MARKED, STATUS_MOMENTUM_SINK, STATUS_PINNED, and STATUS_UNMOORED
(src/data/combatDefs.js:6).

| Status id | Stack rule and effect source |
|---|---|
| status_tumbling | refresh, maxStacks 1; src/data/combatDefs.js:125 |
| status_gravity_marked | refresh, maxStacks 1, fieldCouplingMult 1.9; src/data/combatDefs.js:137 |
| status_momentum_sink | replace, maxStacks 1; src/data/combatDefs.js:146 |
| status_pinned | refresh, maxStacks 1, mass/inertia multipliers 6, consumes Unmoored; src/data/combatDefs.js:153 |
| status_unmoored | refresh, maxStacks 1, mass/inertia multipliers 0.3, consumes Pinned; src/data/combatDefs.js:162 |
| status_ionized | refresh, maxStacks 3, capacitor regeneration multiplier 0.70; combines with Overheated into Scrambled; src/data/combatDefs.js:169 |
| status_burning | stack, maxStacks 3, periodic thermal damage 4 and heat 1 every 30 ticks; src/data/combatDefs.js:176 |
| status_overheated | refresh, maxStacks 1, blocks weapons/burst; combines with Ionized into Scrambled; src/data/combatDefs.js:186 |
| status_scrambled | refresh, maxStacks 1, disables sensor and blocks lock; src/data/combatDefs.js:193 |

Gravity-tagged exists under the id status_gravity_marked. Tumbling exists.
Ionized and Burning exist. Cryo Lock does not exist.

createStatusService is exported from src/combat/statuses.js:4 and returns schedule,
advance, and clear at src/combat/statuses.js:183.
It emits combat:statusApplied at src/combat/statuses.js:155 and
combat:statusExpired at src/combat/statuses.js:57.
clear has no bus receipt at src/combat/statuses.js:94.
There is no caller allowlist: any holder of the service may schedule or clear.
Verified appliers are the damage router at src/combat/damage.js:149, fields at
src/systems/fields.js:557, and tumbleStates at src/systems/tumbleStates.js:199.

Subsystem ids are drive, weapon, sensor, tether_spool, and power
(src/data/combatDefs.js:200).
src/combat/subsystems.js exports applyPendingSubsystemTransitions,
recomputeCombatantModifiers, damageSubsystem, repairSubsystem,
actionBlockedByCombatant, and scheduleSubsystemTransition
(src/combat/subsystems.js:3, src/combat/subsystems.js:101,
src/combat/subsystems.js:138, src/combat/subsystems.js:158,
src/combat/subsystems.js:167).
It emits combat:subsystemDisabled and combat:subsystemEnabled around
src/combat/subsystems.js:72.

Reusable: status definitions, stacking/consumption, periodic ownership, and subsystem
transition helpers.
MISSING — CRU-040 must add Cryo Lock with explicit momentum-preservation/control-authority
semantics; CRU-033–CRU-035 must apply existing statuses through damage/status owners and
add causal receipts. A clear receipt is also missing if scoring/presentation must know
who consumed a status.

Coverage: test/gravity-mark.test.mjs:1,
test/mass-coupling-states.test.mjs:1,
scripts/check-massline2.mjs:1, and
scripts/check-sg03-save-reload.mjs:1.

## Fields and Massline

### Input verbs and owners

VERB_BINDINGS is private in src/systems/input.js:232. Relevant bindings are tether,
deployMassSeed, deployWell, deployRepulsor, toggleClearingCone, and
toggleSkimCollector at src/systems/input.js:234 and src/systems/input.js:251.
Input writes their action states at src/systems/input.js:1237.

The exported fields system is fields at src/systems/fields.js:111.
It owns Well, Repulsor, and Clearing Cone registration.
Its public system methods include registerExternal, registerEnvironmental, and
unregisterExternal at src/systems/fields.js:491.
It emits fields:deployed at src/systems/fields.js:360, field anchor registration at
src/systems/fields.js:222, and field teardown receipts at
src/systems/fields.js:462. It also emits presentation:vfxCue at
src/systems/fields.js:663.

createFieldKernel is exported at src/core/fields/fieldKernel.js:286.
The kernel normalizes fields, applies falloff/cone gates/coupling, samples
acceleration, and projects trajectories through exported helpers at
src/core/fields/fieldKernel.js:34, src/core/fields/fieldKernel.js:80,
src/core/fields/fieldKernel.js:210, and src/core/fields/fieldKernel.js:252.
Its returned API registers, unregisters, updates, gets, lists, clears, and expires
nodes at src/core/fields/fieldKernel.js:294.
activeFieldSnapshot is exported from src/systems/fields.js:693.

The exported massSeed system at src/systems/massSeed.js:101 consumes
sector:exit, sector:enter, game:new, and save:loaded at
src/systems/massSeed.js:118.
It emits massSeed:deployDenied, massSeed:deployed, massSeed:locked,
massSeed:warning, massSeed:locking, massSeed:collapsing, massSeed:collapsed,
massSeed:tetherCut, massSeed:destroyed, and massSeed:cleared across
src/systems/massSeed.js:154–591.
isMassSeedTetherEligible is exported at src/systems/massSeed.js:607.

Attachments are owned by exported createAttachmentService in
src/combat/attachments.js:226. Its returned API includes get, create, reel, cut,
breakAttachment, transfer, rebind, and listForEntity
(src/combat/attachments.js:229, src/combat/attachments.js:249,
src/combat/attachments.js:337, src/combat/attachments.js:387,
src/combat/attachments.js:524, src/combat/attachments.js:589,
src/combat/attachments.js:887).
It emits tether:attached, tether:reel, tether:broken, tether:rebound, and
tether:nearBreak at src/combat/attachments.js:322,
src/combat/attachments.js:374, src/combat/attachments.js:440,
src/combat/attachments.js:711, and src/combat/attachments.js:768.
tetherGameplay is the exported player-action system at
src/systems/tetherGameplay.js:75 and emits tether:cut/released/releaseRated at
src/systems/tetherGameplay.js:241.
Skim Collector belongs to planetRuntime, not fields; input states that boundary at
src/systems/input.js:258.

Reusable: field registration/query/sampling, Mass Seed’s anchored lifecycle, and the
attachment/tether owner.
MISSING — CRU-039 must add a run-scoped orbit-field-node owner with deterministic
source ids, lineage, target cooldowns, caps, and teardown. Mass Seed is one authored
anchor and must not be generalized by mutating its state.

Coverage: test/fields-kernel.test.mjs:1,
test/fields-integration.test.mjs:1, test/fields-predictor.test.mjs:1,
test/mass-seed.test.mjs:1, test/tether-latch-eligibility.test.mjs:1, and
scripts/check-massline2.mjs:1.

## Enemies, spawn budget, materialization

### Enemy catalog

ENEMY_TYPES is the only catalog export from src/data/enemies.js:17.
There is no exported ENEMY_BY_ID and no formal enemy-schema validator.

Current role/archetype ids are:

| Id | Definition line |
|---|---|
| wasp_swarmer | src/data/enemies.js:19 |
| lancer_sniper | src/data/enemies.js:36 |
| bruiser_brawler | src/data/enemies.js:55 |
| mule_trader | src/data/enemies.js:74 |
| reaver_pirate | src/data/enemies.js:94 |
| corsair_raider | src/data/enemies.js:114 |
| patrol_lawman | src/data/enemies.js:134 |
| dreadnought_boss | src/data/enemies.js:150 |
| mine_layer_jackal | src/data/enemies.js:188 |
| pd_screen_escort | src/data/enemies.js:214 |
| customs_cutter | src/data/enemies.js:240 |
| choir_zealot | src/data/enemies.js:260 |
| quiet_ghost | src/data/enemies.js:282 |
| tether_control_raider | src/data/enemies.js:307 |
| field_anchor_controller | src/data/enemies.js:331 |

The live heterogeneous schema includes id/name, shipId, silhouette, factionId,
aiArchetype, levelRange, combatDoctrineId, hull/armor/shield values, capacitor,
movement, collision/mass, weapons, doctrine/behavior, bounty, shipClass, and loot.
Optional fields include shield regeneration rules, illegalToKill, reinforcements,
telegraph, counterHint, subsystems, specialist flags, and field anchors; the variations
are visible between src/data/enemies.js:19 and src/data/enemies.js:331.

makeEnemySpawnSpec is exported from src/systems/combat.js:110.
Faction precedence is caller factionId, then enemy definition factionId, then the
lawful/hostile fallback at src/systems/combat.js:118.
The resulting ship spec carries team, faction, AI archetype/doctrine, spawnContext,
and cause metadata through src/systems/combat.js:120–243.

### Budget and materializer

spawnBudget and its helpers ensureBudgetState and makeBudgetApi are exported at
src/systems/spawnBudget.js:30, src/systems/spawnBudget.js:75, and
src/systems/spawnBudget.js:95.
DEFAULT_MAX = 24 and HARD_MAX = 40 are private constants at
src/systems/spawnBudget.js:26 and src/systems/spawnBudget.js:28.
The returned API is request, bindEntity, releaseEntity, release, releaseSome, current,
available, max, setMax, reset, and ownerForEntity
(src/systems/spawnBudget.js:199).
It consumes entity:destroyed to release an entity binding at
src/systems/spawnBudget.js:55 and resets on sector:exit/save:restoring.

Ambient headroom is not a budget reservation constant. world privately caps ambient
requests at AMBIENT_HEADROOM = 8 at src/systems/world.js:196, requests that many at
src/systems/world.js:2120, and binds spawned entities at
src/systems/world.js:2160.

encounterDirector is exported at src/systems/encounterDirector.js:135.
Its public object method requestAuthoredEncounter(payload) is at
src/systems/encounterDirector.js:512; it requires shapeId, encounterId, and sectorId
and resolves an existing authored encounter shape.
Its public object method spawnShips(live, ships) is at
src/systems/encounterDirector.js:775. It requests slots under live.squadId at
src/systems/encounterDirector.js:780, constructs through makeEnemySpawnSpec at
src/systems/encounterDirector.js:796, stamps doctrine/causal context, spawns through
helpers.spawnEntity, and records live ids at src/systems/encounterDirector.js:845.
It releases unused reservations at src/systems/encounterDirector.js:853 and releases
one squad reservation on entity loss at src/systems/encounterDirector.js:1353.

requestAuthoredEncounter is reusable as-is only for cataloged campaign encounter
shapes. spawnShips is the closest materializer but requires the director’s internal
live record; a wave planner must not fabricate that record.
MISSING — CRU-012 must export a stable package-materialization request/result seam
that accepts a deterministic package, creates the director live record, requests the
budget, and returns admitted/spawned/rejected receipts. CRU-003 Lab spawning must use
spawnBudget now and migrate to that seam, not copy Sandbox’s direct spawn loop.

Events emitted by the director include encounter:telegraph,
encounter:spawned, encounter:resolved, encounter:fingerprint, and encounter:receipt
at src/systems/encounterDirector.js:665, src/systems/encounterDirector.js:680,
src/systems/encounterDirector.js:1206, src/systems/encounterDirector.js:1211, and
src/systems/encounterDirector.js:1224.

Coverage: scripts/check-encounter-director.mjs:1,
scripts/check-sg06-encounter-owner.mjs:1,
scripts/check-sg06-encounter-sink.mjs:1,
test/encounter-global-coordinates.test.mjs:1, and
test/field-anchor-controller.test.mjs:1.

## Ship grant / fit / derived stats

ships is exported from src/systems/ships.js:1005.
Pure exported builders include buildSlotList, fits, fittingsFromWeapons,
fittingsFromDefaultModules, getDerivedStats, and makeShipEntitySpec
(src/systems/ships.js:260, src/systems/ships.js:274,
src/systems/ships.js:518, src/systems/ships.js:909,
src/systems/ships.js:602, src/systems/ships.js:958).

| Canonical operation | Live method |
|---|---|
| Grant module | ships.grantModule; callers reach it on the exported ships object, implementation at src/systems/ships.js:1366. It emits module:granted. |
| Buy/grant hull | ships.buyShip({ defId, setActive, grant }) at src/systems/ships.js:1399; paid paths emit economy:chargeCredits at src/systems/ships.js:1414. |
| Activate hull | ships.setActiveShip(...) in the same exported owner; active recomputation is ships.recomputeActiveShip at src/systems/ships.js:1264. |
| Fit | ships.fitModule({ shipIndex, slotIndex, instanceId, defId }) at src/systems/ships.js:1530; it emits module:equipped and recomputes. |
| Unfit | ships.unfitModule({ shipIndex, slotIndex }) at src/systems/ships.js:1572; it emits module:unequipped. |
| Derived stats | getDerivedStats(defId, fittings, player) at src/systems/ships.js:602 is the sole pure derived-stat builder. |

UI intents ui:buyShip, ui:fitModule, and ui:unfitModule are consumed by ships at
src/systems/ships.js:1044. Recompute writes live entity stats and emits
ship:statsChanged/cargo-cap receipts in the recompute path beginning at
src/systems/ships.js:1212.

Reusable: canonical grants, ownership inventory, fitting validation, active-ship
transition, derived stats, and player entity construction.
A run modifier stack must not be written into player.ownedShips[].fittings or campaign
inventory. CRU-002 should store only immutable run modifier records in state.run.
CRU-020 should compile base weapon + canonical fitted weapon + state.run modifiers into
an immutable AttackSpec when a build changes.

MISSING — there is no generic ephemeral modifier projection hook in getDerivedStats.
If later run modifiers affect hull stats, add an explicit post-derived, run-only
projection rather than widening persistent fittings or making every caller scan
state.run per tick.

Coverage: test/ships-station-service-authority.test.mjs:1,
test/ship-flight-role-ordering.test.mjs:1,
scripts/check-outfitting-buy-fit.mjs:1, and
test/outfitting-spend-confirmation.test.mjs:1.

## Campaign economy and contamination boundary

Campaign credits live at state.player.credits; the default player state defines them
at src/core/gameState.js:59.
economy is the exported sole writer at src/systems/economy.js:556.
It consumes economy:grantCredits and economy:chargeCredits at
src/systems/economy.js:589. Its grant path writes player.credits and emits
credits:changed at src/systems/economy.js:1485.
ships and other clients emit intents rather than writing credits directly, for
example economy:chargeCredits at src/systems/ships.js:1414.

A Survival wallet must be state.run.credits and must never emit
economy:grantCredits/economy:chargeCredits, mutate player.credits, alter station stock,
add campaign modules/ships, alter research/reputation/heat, or serialize through the
Adventure save capture plan. The proposed separation is explicit in the master plan at
design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:4045 and
design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:4140.

There is no player-route ephemeral session container today.
Sandbox calls the real New Game pipeline and replaces the live state; it does not hold
an Adventure snapshot for restoration (src/ui/sandbox/sandboxSetup.js:283).
The deterministic Lab builds a separate authoritative runtime
(src/testing/lab/runScenario.js:200), but that is a focused harness, not a browser/
Electron session mechanism.

save capture/serialization excludes state.run today only because the field does not
exist (src/save/saveSystem.js:292). Autosaves still respond to campaign lifecycle
events in src/save/saveSystem.js:177; a Survival run on the same state would therefore
need an explicit gate.

Reusable: fresh createGameState, real New Game reset, economy intents for Adventure,
and serialize/restore comparison utilities.
MISSING — CRU-002 must add a fresh run session boundary, run-local wallet, autosave
guard, teardown/reset, and an Adventure contamination test. Appendix A specifies that
the test snapshot campaign credits/inventory/reputation/research/ships before and after
the run at design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:6260.
First release intentionally has no mid-run save
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:4272).

Events: Survival may observe entity:killed for run rewards later, but CRU-002 must not
consume campaign economy events. Its lifecycle events are MISSING and proposed in
First packet shape.

Coverage: test/arcade-core-kill-economy.test.mjs:1,
test/ships-station-service-authority.test.mjs:1,
scripts/check-sg03-save-reload.mjs:1, and the current 47a save/reload golden.

## UI navigation and screens

createScreenManager(ctx) is exported from src/ui/screenManager.js:29.
Its internal registry is a Map at src/ui/screenManager.js:36.
The returned public API includes register, pushScreen, popScreen, replaceScreen,
closeAll, and pause-state helpers at src/ui/screenManager.js:532.
private register(def) requires an id at src/ui/screenManager.js:178.

SCREEN_MODULES is private in src/ui/uiRoot.js:62. It dynamically imports ordinary
screens, including mainMenu/newGame/pause at src/ui/uiRoot.js:83 and dev-only Sandbox
at src/ui/uiRoot.js:92. Registration runs through screenManager.register in the load
cycle at src/ui/uiRoot.js:1008.
uiRoot consumes ui:pushScreen, ui:replaceScreen, and ui:closeAll at
src/ui/uiRoot.js:745 and src/ui/uiRoot.js:769.

mainMenuScreen is exported from src/ui/screens/mainMenu.js:204.
Its normal buttons are created at src/ui/screens/mainMenu.js:231; Sandbox is added only
in the dev path at src/ui/screens/mainMenu.js:245.
New Game and Continue handlers are at src/ui/screens/mainMenu.js:256.
A new top-level Crucible button therefore requires:

1. an exported screen module with a stable id;
2. a literal dynamic import entry in SCREEN_MODULES;
3. a mainMenuScreen button/handler that pushes or replaces it;
4. its id in PAUSING_SCREENS while it is a menu/setup/results surface;
5. no alternate renderer or game bootstrap.

uiPrimitives exports glyphSvg, glyph, panel, card, chip, dataBar, setDataBar, rail,
assetStage, trace, sfSelect, enhanceSelects, dataState, mountDataState,
dataStateHtml, and settleDataState
(src/ui/uiPrimitives.js:67, src/ui/uiPrimitives.js:84,
src/ui/uiPrimitives.js:123, src/ui/uiPrimitives.js:207,
src/ui/uiPrimitives.js:459, src/ui/uiPrimitives.js:519).
Its private DATA_STATES set is empty/loading/error/denied at
src/ui/uiPrimitives.js:405.

Role tokens already exist:

| Token | Definition |
|---|---|
| --sf-you | styles/ui.css:27 |
| --sf-foe | styles/ui.css:28 |
| --sf-goal | styles/ui.css:29 |
| --sf-calm | styles/ui.css:30 |
| --sf-paper | styles/ui.css:31 |

Reusable: screen manager, dynamic module registry, main-menu grammar, data-state
primitives, pause aggregation, and role tokens.
MISSING — CRU-004 must add the Crucible setup screen/button. CRU-018/CRU-052 later
add results and run HUD. CRU-002 first needs a lifecycle event so UI does not raw-write
state.mode as pause _toMenu currently does.

Coverage: test/screen-manager-pause.test.mjs:1,
test/ui-primitives.test.mjs:1, test/main-menu.test.mjs:1, and
test/pause-screen-actions.test.mjs:1 where present; check:playable owns the live
boot/menu/launch route described under Performance limits.

## Events bus

createBus is exported from src/core/eventBus.js:5.

| API | Semantics |
|---|---|
| on / off / once | synchronous listener registration/removal; src/core/eventBus.js:9, src/core/eventBus.js:16, src/core/eventBus.js:21 |
| emit | synchronous dispatch with handler errors contained and reported; src/core/eventBus.js:26 |
| queue | append a deferred event; src/core/eventBus.js:42 |
| flush | dispatch queued events in order; src/core/eventBus.js:49 |
| clear | clear listeners/queue; src/core/eventBus.js:64 |

EventBus is also exported as an alias at src/core/eventBus.js:69.

PRODUCTION_INIT_ORDER and PRODUCTION_UPDATE_ORDER are exported from
src/runtime/authoritativeSystemManifest.js:27 and
src/runtime/authoritativeSystemManifest.js:59.
createRegistry is exported from src/core/registry.js:314.
The registry resolves the authoritative manifest, exposes updateOrder, initializes
systems, steps update order, and flushes queued events at
src/core/registry.js:333, src/core/registry.js:536, and src/core/registry.js:566.
UPDATE_ORDER in registry is an alias/reference at src/core/registry.js:463, not a second
independent list.

Golden-safety recipe for a new system:

1. Add it to PRODUCTION_INIT_ORDER and to PRODUCTION_UPDATE_ORDER only if it actually ticks.
2. Wire its import/lookup in registry; update order must remain a subset of init order, enforced at test/authoritative-manifest.test.mjs:48.
3. An event-only runSession owner should stay out of UPDATE_ORDER. A ticking survivalRun owner arrives later under CRU-011.
4. If a new updater is meant to be absent from legacy 47a, keep it absent through the curated runtime profile/feature gate and make its default behavior a strict no-op. Do not rely on ordering alone.
5. Run manifest tests, check:sim, and check:sim:v3. If a hash moves, use the sim-golden-diff procedure before any expected-file change.

docs/COMMON_BUGS.md:315 records the no-surprise golden rule for system changes, and
docs/COMMON_BUGS.md:387 explains that hash equality is comparison evidence rather than
proof of correctness. test/AGENTS.md:9 forbids editing expected JSON merely to pass.

Reusable: the bus and one authoritative system manifest.
MISSING — proposed run lifecycle events and package materialization events do not exist;
their exact CRU-002 names are defined under First packet shape.
Coverage: test/authoritative-manifest.test.mjs:14,
test/event-bus.test.mjs:1, check:sim, and check:sim:v3.

## VFX / presentation adapter

### Semantic cue route

presentationOrchestrator is exported from
src/systems/presentationOrchestrator.js:57.
It consumes combat:damage at src/systems/presentationOrchestrator.js:149 and
entity:killed at src/systems/presentationOrchestrator.js:157.
Damage maps to semantic damage/player-hit/shield-collapse cues around
src/systems/presentationOrchestrator.js:294.
A kill maps to combat.player.kill at
src/systems/presentationOrchestrator.js:500.
private _emitCue applies recipe/arbitration and queues presentation:cue at
src/systems/presentationOrchestrator.js:1424; rejected work emits
presentation:cueSuppressed at src/systems/presentationOrchestrator.js:1461.

presentationAdapters is exported from src/systems/presentationAdapters.js:152.
It consumes presentation:cue at src/systems/presentationAdapters.js:165, emits
presentation:cueApplied at src/systems/presentationAdapters.js:410, and sends render
payloads as presentation:vfxCue at src/systems/presentationAdapters.js:474.

CUE_LANE_BUDGETS, CRITICAL_COOCCURRENCE, CUE_LANE_CRITICAL_RESERVE,
isCriticalCue, laneLimitFor, laneBudgetReason, chargeCueLanes, and
CUE_BUDGET_DECLARATION are exported from src/presentation/cueArbitration.js:34,
src/presentation/cueArbitration.js:51, src/presentation/cueArbitration.js:61,
src/presentation/cueArbitration.js:82, src/presentation/cueArbitration.js:93,
src/presentation/cueArbitration.js:103, src/presentation/cueArbitration.js:117,
and src/presentation/cueArbitration.js:132.
The lane budgets are camera 3, vfx 8, audio 6, ui 6, access 6.

Render pools include createInstancedSpriteBuckets and its reset/write/commit functions
at src/render/combat/instancedSpritePool.js:58,
PersistentCombatBeamPool at src/render/combat/persistentBeams.js:63,
PhasedExplosionLifecycle at src/render/combat/phasedExplosions.js:170, and
ArcadeStructuralFx plus ARCADE_STRUCTURAL_FX_CAPACITY at
src/render/combat/arcadeStructuralFx.js:4 and
src/render/combat/arcadeStructuralFx.js:410.

EVENT_LIGHT_POOL_SIZE is exported as 6 at src/render/vfx.js:197.
vfx is exported at src/render/vfx.js:655.
The renderer still listens to raw projectile:hit/physics:impact at
src/render/vfx.js:1549 and semantic presentation:vfxCue at src/render/vfx.js:1602.
New Crucible cues must use the semantic adapter and avoid adding another raw duplicate.

Reusable: kill/damage cue recipes, arbitration, adapters, pooled sprites/beams/
explosions, and the six event-light limit.
MISSING — CRU-051 needs causal families for direct, bank, chain, collision, terrain,
tether, field, and reaction, fed by authoritative receipts from CRU-021/CRU-025/CRU-036.

Coverage: scripts/check-presentation-cues.mjs:1,
scripts/check-professional-combat-presentation.mjs:1,
test/combat-vfx-presentation-contract.test.mjs:1,
test/entity-killed-presentation-receipt.test.mjs:1, and
test/presentation-admission.test.mjs:1.

## Performance limits

### Budgets

| Metric | Current budget |
|---|---|
| Primary target | 16.7 ms / 60 FPS; design/PERF_BUDGET.md:14 |
| Compatibility floor | 33.3 ms / 30 FPS; design/PERF_BUDGET.md:17 |
| Simulation | fixed 60 Hz, maximum 4 catch-up steps, frame dt clamp 0.25 s; design/PERF_BUDGET.md:20 |
| Measurement | p95, p99, and hitch count above 32 ms; design/PERF_BUDGET.md:34 |
| Sim allocation | 5.0 ms; design/PERF_BUDGET.md:41 |
| Render allocation | 7.0 ms; design/PERF_BUDGET.md:42 |
| VFX allocation | 2.5 ms; design/PERF_BUDGET.md:43 |
| UI allocation | 1.2 ms; design/PERF_BUDGET.md:44 |
| Headroom | 1.0 ms; design/PERF_BUDGET.md:45 |

The performance policy forbids passing by cutting authored quality at
design/PERF_BUDGET.md:66 and prefers batching, cadence, culling, residency, allocation,
and frame-pacing work at design/PERF_BUDGET.md:77.

Sandbox physics_swarm starts 12 enemy ships and 3 anchors, plus the ordinary player
and world created by New Game; it starts with zero explicit projectiles
(src/ui/sandbox/sandboxSetup.js:202).
visual_stress_scene starts 14 enemy ships, 3 anchors, and 4 target drones, also with
zero explicit projectiles (src/ui/sandbox/sandboxSetup.js:255).
These are preset additions, not total live-entity caps.
The general spawn budget defaults to 24 and hard-caps at 40
(src/systems/spawnBudget.js:26); ambient world traffic requests at most 8 of those
slots (src/systems/world.js:196).

package check:perf invokes the headed strict performance profile with warmup 2500 ms
and duration 7000 ms (package.json:367). The probe’s hard hitch threshold is 32 ms and
default hitch allowance is zero at scripts/probe-performance-profile.mjs:55; the
default draw-call ceiling is 600 at scripts/probe-performance-profile.mjs:69.
Its strict verdict checks p95/floor, hitches, callback accounting, draw calls, and
render/sim/sim-frame/UI phase budgets at
scripts/probe-performance-profile.mjs:1677.

package check:playable invokes scripts/check-game-playable.mjs at package.json:383.
That script verifies browser boot, launch, player control/flight, hull/world presence,
and a clean player route (scripts/check-game-playable.mjs:1); it is not a frame-budget
or maximum-entity/projectile assertion.
test/perf-combat-count-gates.test.mjs:91 uses a synthetic player + 8 near + 24 far fleet
and asserts structural shadow-caster reduction; it is not a global entity cap.

Reusable: spawnBudget, diagnostic counters, strict profile, and cheap structural count
gates. MISSING — CRU-008 needs a deterministic physics-swarm scenario; CRU-050 needs a
measured run-specific scale profile inside spawnBudget. No current check asserts a
Crucible projectile/descendant cap; CRU-021 must make it explicit.

## Existing checks to keep green

No check was run during this audit.

| Change area | Exact existing command |
|---|---|
| Default deterministic golden | npm run check:sim; package.json:37 |
| Default golden comparison | npm run check:sim:compare; package.json:38 |
| Flight V3 golden | npm run check:sim:v3; package.json:43 |
| Flight V3 comparison | npm run check:sim:v3:compare; package.json:44 |
| Combat grammar plus SG03 save/reload | npm run check:combat; package.json:303 |
| Save/reload focused gate | npm run check:sg03:save-reload; package.json:276 |
| Save schema generation check | npm run check:save-schema; package.json:323 |
| Everyday fast gate | npm run check:baseline; package.json:526 |
| Player route | npm run check:playable; package.json:383 |
| Performance route when justified | npm run check:perf; package.json:367 |
| Arcade core focused tests | node --test test/arcade-core-kill-economy.test.mjs test/arcade-core-physics-arsenal.test.mjs |

There is no package script named check:save-reload and no package script named
check:arcade-core. Implementers must use the exact substitutes above, not invent aliases.

Current protected golden hashes are:

| Golden | Current hash |
|---|---|
| Legacy 47a authoritative | 1f5706f71d20344553328c051c3bd736728246ce91bd1660a2bc3b0ef66ae3d2 at test/47a.telemetry.expected.json:69 |
| Flight V3 47a authoritative | b3d1d0afaf19657ccc413b529fb0938269bf123a183d1f941990ae2c58245c70 at test/47a.telemetry.v3.expected.json:71 |
| 47a presentation state | c20b04f5eef2bd28d2d49afd21a37cb89363769aa244a22aa667ccbb3e51a7c4 at test/47a.presentation.expected.json:7 |

The legacy trace pins combat:fire/projectile:hit/combat:damage at 17/11/11
(test/47a.telemetry.expected.json:54). V3 pins 17/9/9
(test/47a.telemetry.v3.expected.json:56).
Expected JSON must not be edited merely to pass (test/AGENTS.md:9).
When a hash moves, run the comparison and
scripts/sim-golden-diff.mjs to distinguish motion from bookkeeping before any
deliberate re-record; docs/COMMON_BUGS.md:387 is the governing recipe.

Minimum CRU-002 gate: focused run-state/contamination tests, check:save-schema,
check:sg03:save-reload, check:sim, and check:sim:v3.
Minimum CRU-003 gate: focused Combat Lab schema/Sandbox setup tests,
test/sandbox-recovery-launcher.test.mjs, check:sim, and check:sim:v3.
check:playable belongs at the player-facing CRU-004/leaf acceptance boundary, not as
ritual proof for two headless foundation packets.

## First packet shape

The queue defines CRU-002 as orthogonal state.run/phases/reset/contamination and
CRU-003 as the Sandbox Combat Lab setup schema
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:5141).
The following is the smallest executable split against the live owners.

### CRU-002 — run-state contract

Files:

| File | Change |
|---|---|
| NEW src/core/runState.js | Pure JSON contract and validation only. |
| src/core/gameState.js | Initialize a fresh inactive run object in createGameState. |
| NEW src/systems/runSession.js | Event-only sole writer for state.run; init order only, no UPDATE_ORDER entry. |
| src/core/registry.js | Import/lookup runSession. |
| src/runtime/authoritativeSystemManifest.js | Add runSession to PRODUCTION_INIT_ORDER only. |
| src/main.js | Route New Game reset and exit-to-menu through runSession; include run in private resetRunState’s explicit copy boundary. |
| src/ui/screens/pause.js | Replace raw menu-mode mutation with game:exitToMenu request. |
| src/save/saveSystem.js | Explicitly exclude run from save data and suppress campaign autosave triggers while kind is survival. |
| NEW test/crucible-run-state.test.mjs | Contract, phase validation, reset, event, manifest, and no-update tests. |
| NEW test/crucible-contamination.test.mjs | Appendix A before/after campaign snapshot and shared-reference test. |

Proposed signatures — all MISSING today:

- export const RUN_STATE_SCHEMA_VERSION = 1
- export const RUN_PHASES = Object.freeze(['inactive', 'loadout', 'arena_intro',
  'wave_intro', 'active', 'cleanup', 'draft', 'refit', 'victory', 'ended'])
- export function createRunState({ kind = 'adventure', ruleset = null, seed = 0 } = {})
- export function validateRunState(run)
- export function snapshotCampaignBoundary(state)
- export function assertCampaignBoundaryUnchanged(before, after)
- export const runSession = { name: 'runSession', init(ctx), newGame(options),
  begin(request), transition(request), end(request) }

Required event contract:

| Event | Direction | Minimum payload |
|---|---|---|
| run:beginRequested | consumed by runSession | kind, ruleset, seed, optional arenaId |
| run:started | emitted by runSession | schemaVersion, kind, ruleset, seed, phase |
| run:transitionRequested | consumed by runSession | expectedPhase, nextPhase, reason, tick |
| run:transitioned | emitted by runSession | previousPhase, phase, reason, tick |
| run:endRequested | consumed by runSession | outcome, reason, tick |
| run:ended | emitted by runSession | outcome, reason, seed, terminal phase |
| game:exitToMenu | consumed by main lifecycle | source; main ends/resets run before replacing UI |

Initial state follows the plan’s shape at
design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:4061 and exact phase vocabulary at
design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:4105.
CRU-002 does not add waves, reward logic, a ticking survivalRun controller, UI, or
save/resume. Those belong to CRU-011 onward.
The contamination assertion must compare values and object identities for campaign
credits, inventory, reputation, research, ships/fittings, heat, world, and RNG, while
allowing only the explicitly fresh Survival state to change.

### CRU-003 — Combat Lab setup schema extension

Files:

| File | Change |
|---|---|
| NEW src/contracts/combatLabSetupSchema.js | Versioned setup allowlist, normalization, validation, and deterministic digest input. |
| NEW src/data/combatLabSetups.js | Explicit starter packages, enemy packages, and arena-prototype mappings; no runtime writes. |
| src/ui/sandbox/sandboxSetup.js | Accept validated hull/loadout/enemyPackage/arenaId/seed/wave and apply through canonical writers plus spawnBudget. Preserve old presets. |
| test/sandbox-recovery-launcher.test.mjs | Extend compatibility, malformed-config, budget, and canonical-writer cases. |
| NEW test/combat-lab-setup-schema.test.mjs | Schema/version/allowlist/order/digest properties. |
| NEW test/combat-lab-same-seed.test.mjs | Two normalized launches produce identical setup/spawn requests for the same build and seed. |

Proposed signatures — all MISSING today:

- export const COMBAT_LAB_SETUP_SCHEMA = 'spaceface.combatLabSetup.v1'
- export function validateCombatLabSetup(input) returning
  { ok, value, issues }
- export function normalizeCombatLabSetup(input) returning a plain deterministic value
- export function combatLabSetupDigestInput(setup)
- export const COMBAT_LAB_STARTER_PACKAGES
- export const COMBAT_LAB_ENEMY_PACKAGES
- export const COMBAT_LAB_ARENAS
- extend buildSandboxLaunchConfig(baseConfig, overrides) without breaking current callers
- export function applyCombatLabSetup(ctx, validatedSetup)
- export function spawnBudgetedLabPackage(ctx, packageSpec) returning
  { requested, admitted, spawnedIds, rejected }

The normalized v1 value must contain schema, hullId, loadout as ordered
slotIndex/defId entries, enemyPackageId, arenaId, seed uint32, and wave integer.
Loadout application must use ships.buyShip/grantModule/fitModule.
Enemy application must use makeEnemySpawnSpec plus spawnBudget request and either
bindEntity/releaseEntity or one documented package reservation owner.
arenaId maps only to existing sector/position data in CRU-003; authored arena geometry
is MISSING until CRU-009/CRU-028.

CRU-003 must not change simScenario.v1. CRU-008 later imports or maps the frozen Combat
Lab setup into a deterministic scenario, because human Combat Lab and the headless Lab
share schemas where practical but do not share evidence class automatically
(design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md:3787).
CRU-003 also must not add the top-level UI; that is CRU-004.

## Risks and collisions

### Three-day churn

Command used: git log --since="3 days ago" --date=short --name-only over the audited
implementation paths.

| Risk area | Recent commits and touched path | Consequence for Crucible |
|---|---|---|
| Physics body/save truth | d3d1e8d3 touched src/core/sg02DynamicBodyOwner.js; 2ed6399b touched src/core/physics.js and src/core/sg02DynamicBodyOwner.js. | CRU-025/CRU-029 must rebase contact and kinematic work on current SG02 behavior. |
| Save lifecycle/performance | 386cb7db, 6b9eb000, f0c7b653, 7772c715, 4dbd0257, and 583f7893 touched src/save/saveSystem.js. | CRU-002 must be single-owner on saveSystem and preserve recent restore/residency/UI bounds. |
| Registry/world cadence | e7c69624 and 583f7893 touched src/core/registry.js; 583f7893 touched src/runtime/authoritativeSystemManifest.js. | Manifest wiring is a high-collision seam; keep runSession init-only. |
| Menu lifecycle | 66d3787f touched src/ui/screens/mainMenu.js and src/ui/screens/pause.js. | CRU-002 exit-to-menu and CRU-004 button work must retain browser/Electron Quit behavior. |
| UI shell | 7091a4ce, f85507a9, 9d242df7, 583f7893, and 0996a2e4 touched src/ui/uiRoot.js and/or styles/ui.css. | CRU-004 must use the current screen registration cycle and tokens. |
| Weapons/economy/ships | 4ba68f62 touched src/systems/weapons.js; daa593e0 touched src/systems/economy.js; 4dbd0257 touched src/systems/ships.js. | CRU-020 and run wallet/loadout work must not regress recent authority fixes. |
| Sandbox | bea90b47 touched src/ui/sandbox/sandboxSetup.js. | CRU-003 must preserve current preset/camera behavior and focus tests. |

The authoritative current-path lines remain the citations in the preceding sections;
commit hashes above are history evidence, not alternate owners.

### Dirty tree overlap at audit close

git status --short showed unrelated Hornet texture/GLB/evidence and Blender-tool work.
It also showed concurrent program-admission edits in CANONICAL_BUILD_MAP.md,
design/PLAN_REGISTRY.md, design/program/NOW.md, design/program/PROGRAM_MAP.md,
design/program/roadmap/program-queue.json, and new PQ-132/PQ-133/PQ-134 packet files.
Those program files were not edited by this audit.

design/program/NOW.md now names the PQ-133/PQ-134 fleet as IMPLEMENTING and reserves
new survival/attack/data/UI paths at design/program/NOW.md:44.
That is a material collision for CRU-002/CRU-003 implementation, not for this requested
audit file. Later implementers must re-read NOW and take exact-path ownership before
touching:

- src/core/gameState.js
- src/main.js
- src/save/saveSystem.js
- src/core/registry.js
- src/runtime/authoritativeSystemManifest.js
- src/ui/screens/pause.js
- src/ui/sandbox/sandboxSetup.js
- any new src/systems/survival* or src/ui/screens/crucible* file

No dirty file at audit close matched
design/program/roadmap/active/PQ-133_SEAM_AUDIT.md, and that path did not exist before
this packet. MISSING — before CRU-002 begins, the live fleet must allocate exact files
between its run-state and Combat Lab lanes so a broad PQ-133 label does not create
dual writers.
