# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative order is `src/runtime/authoritativeSystemManifest.js` (materialized by
> `src/core/registry.js`); this is a navigable projection of it.
>
> Generated: 2026-08-16. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → voiceArbiter → input → autoTargetAssist → flybyFocus → bulletTime → cloak → scanner → scanReveal → buildIdentity → lawSecurity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → barkDirector → ai → dockingCorridor → physics → aiPorts → tumbleStates → collisionConsequences → aiEncounter → actions → flight → cruise → weapons → countermeasures → impulseCharges → mines → massSeed → uniqueLootAbilities → fields → environmentalMachinery → anomalyRuntime → planetRuntime → combat → combatOutcome → aftermathWrecks → uniqueWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → mining → fieldDepletion → cargo → fragileCargo → economy → automation → asteroidSites → asteroidFormations → wingmen → intervention → lossLedger → factionPresence → spawnBudget → world → heistFacilities → regionalEcology → encounterDirector → routeFollower → travelLanes → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationContacts → stationContactLoadBoundary → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → npcJobsRuntime → careerOrigins → careerLadders → liveCareerLadderBranches → missions → careerContracts → economyContracts → postEndingReplay → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → drill → claims → beacons → bandRadio → v2FlavorRuntime → onboarding → masslineHud → massSeedHud → fieldHud → planetHud → sectorPostcard → dockDenyBanner → stationBroadcast → hazardHints → bulkHaulTag → dangerGradient → causeLedger → customsPrompt → cargoConscience → securityReadoutSystem → priceForecastSystem → contractClausesSystem → moralTrapSystem → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → autoTargetAssist → flybyFocus → bulletTime → cloak → lawSecurity → scanner → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → factionPresence → ai → barkDirector → aiEncounter → actions → beacons → travelLanes → flight → cruise → aiPorts → tumbleStates → collisionConsequences → weapons → countermeasures → impulseCharges → mines → massSeed → uniqueLootAbilities → dockingCorridor → environmentalMachinery → anomalyRuntime → fields → planetRuntime → physics → combat → combatOutcome → aftermathWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → mining → fieldDepletion → cargo → fragileCargo → automation → asteroidSites → asteroidFormations → wingmen → crafting → economy → intervention → world → heistFacilities → regionalEcology → encounterDirector → routeFollower → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → npcJobsRuntime → missions → careerOrigins → careerLadders → liveCareerLadderBranches → story → scenarioRuntime → heat → traffic → drill → claims → bandRadio → onboarding → masslineHud → massSeedHud → fieldHud → planetHud → voiceArbiter
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 1332 | 0 | 0 | — |
| `autoTargetAssist` | `systems/autoTargetAssist.js` | 180 | 0 | 2 | — |
| `flybyFocus` | `systems/flybyFocus.js` | 411 | 4 | 1 | `flybyFocus:end`×1, `flybyFocus:start`×1, `camera:shake`×1 |
| `bulletTime` | `systems/bulletTime.js` | 121 | 4 | 0 | `audio:cue`×2, `bulletTime:start`×1, `bulletTime:end`×1 |
| `cloak` | `systems/cloak.js` | 153 | 4 | 1 | `audio:cue`×2, `cloak:engaged`×1, `cloak:dropped`×1 |
| `lawSecurity` | `systems/lawSecurity.js` | 1812 | 0 | 10 | — |
| `scanner` | `systems/scanner.js` | 1559 | 21 | 8 | `contactHail:availability`×2, `scanner:ghostEscaped`×1, `scan:pulse`×1 |
| `scanReveal` | `systems/scanReveal.js` | 50 | 1 | 1 | `scan:shipRevealed`×1 |
| `buildIdentity` | `systems/buildIdentity.js` | 318 | 1 | 2 | `buildIdentity:revealed`×1 |
| `pirateDisguise` | `systems/pirateDisguise.js` | 69 | 0 | 1 | — |
| `pirateParley` | `systems/pirateParley.js` | 609 | 1 | 1 | `economy:chargeCredits`×1 |
| `pirateDisengage` | `systems/pirateDisengage.js` | 434 | 0 | 0 | — |
| `aceMemory` | `systems/aceMemory.js` | 814 | 0 | 0 | — |
| `factionPresence` | `systems/factionPresence.js` | 1145 | 16 | 10 | `presentation:caption`×5, `factionPresence:spawned`×2, `comms:popup`×2 |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 222 | 2 | 2 | `ai:telegraph`×1, `ai:doctrinePhase`×1 |
| `barkDirector` | `systems/barkDirector.js` | 333 | 0 | 3 | — |
| `aiEncounter` | `systems/aiEncounter.js` | 399 | 0 | 0 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 160 | 5 | 2 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `travelLanes` | `systems/travelLanes.js` | 848 | 0 | 1 | — |
| `flight` | `systems/flightV3.js` (+ legacy) | 1219 | 7 | 4 | `ship:boostStop`×2, `ship:boostStart`×1, `ship:dash`×1 |
| `cruise` | `systems/cruise.js` | 142 | 4 | 4 | `cruise:engaged`×1, `cruise:charging`×1, `cruise:snared`×1 |
| `aiPorts` | `systems/aiPorts.js` | 1540 | 3 | 1 | `ai:encounterCommand`×1, `ai:skitterSpring`×1, `ai:skitterNest`×1 |
| `tumbleStates` | `systems/tumbleStates.js` | 280 | 5 | 2 | `combat:tumbleEnd`×1, `massline:tumbleEnd`×1, `massline:tumbled`×1 |
| `collisionConsequences` | `systems/collisionConsequences.js` | 673 | 2 | 5 | `combat:collisionConsequence`×1, `combat:collisionDebris`×1 |
| `weapons` | `systems/weapons.js` | 1211 | 14 | 0 | `combat:fire`×3, `weapons:vent`×2, `presentation:vfxCue`×2 |
| `countermeasures` | `systems/countermeasures.js` | 249 | 2 | 0 | `countermeasure:deployed`×1, `audio:cue`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 497 | 10 | 0 | `audio:cue`×2, `charge:combo`×2, `charge:stuck`×1 |
| `mines` | `systems/mines.js` | 254 | 7 | 5 | `mines:capReached`×1, `ai:telegraph`×1, `mines:placed`×1 |
| `massSeed` | `systems/massSeed.js` | 612 | 26 | 4 | `audio:cue`×6, `presentation:vfxCue`×4, `massSeed:collapsing`×4 |
| `uniqueLootAbilities` | `systems/uniqueLootAbilities.js` | 466 | 3 | 5 | `uniqueLoot:paleCoilBlink`×1, `uniqueLoot:nestbreakerSplit`×1, `uniqueLoot:choirBellPulse`×1 |
| `dockingCorridor` | `systems/dockingCorridor.js` | 182 | 0 | 0 | — |
| `environmentalMachinery` | `systems/environmentalMachinery.js` | 193 | 4 | 4 | `hazard:exit`×2, `hazard:enter`×1, `environmentalMachinery:phaseChanged`×1 |
| `anomalyRuntime` | `systems/anomalyRuntime.js` | 162 | 2 | 4 | `anomaly:registered`×1, `anomaly:unregistered`×1 |
| `fields` | `systems/fields.js` | 746 | 16 | 6 | `audio:cue`×5, `fields:ended`×3, `fields:coneToggled`×2 |
| `planetRuntime` | `systems/planetRuntime.js` | 579 | 10 | 3 | `planet:plungeStage`×2, `planet:registered`×1, `planet:unregistered`×1 |
| `physics` | `core/physics.js` | 1339 | 9 | 1 | `projectile:hit`×2, `dock:range`×2, `gate:range`×2 |
| `combat` | `systems/combat.js` | 1092 | 21 | 7 | `camera:shake`×6, `player:death`×3, `economy:grantCredits`×3 |
| `combatOutcome` | `systems/combatOutcome.js` | 211 | 2 | 4 | `combat:outcome`×1, `combat:outcomeConsequence`×1 |
| `aftermathWrecks` | `systems/aftermathWrecks.js` | 732 | 8 | 16 | `aftermath:causeRecorded`×1, `aftermathWreck:recorded`×1, `news:headline`×1 |
| `titles` | `systems/titles.js` | 712 | 0 | 6 | — |
| `wingMorale` | `systems/wingMorale.js` | 416 | 6 | 3 | `ai:formationBroken`×1, `wingMorale:broken`×1, `ai:flee`×1 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 2241 | 33 | 7 | `tether:latchDenied`×7, `tether:releaseRated`×5, `tether:released`×3 |
| `surrenderRecovery` | `systems/surrenderRecovery.js` | 1193 | 0 | 14 | — |
| `custodyConsequences` | `systems/custodyConsequences.js` | 303 | 0 | 2 | — |
| `masslineTelemetry` | `systems/masslineTelemetry.js` | 523 | 2 | 0 | `tether:reelPump`×1, `tether:snapCatch`×1 |
| `masslineThreats` | `systems/masslineThreats.js` | 293 | 1 | 0 | `massline:threat`×1 |
| `masslineImpacts` | `systems/masslineImpacts.js` | 484 | 2 | 0 | `tether:whipImpact`×1, `massline:sweepImpact`×1 |
| `masslineSnares` | `systems/masslineSnares.js` | 597 | 7 | 5 | `massline:snareArmed`×1, `massline:snareDeployed`×1, `ai:telegraph`×1 |
| `masslineThrow` | `systems/masslineThrow.js` | 753 | 7 | 1 | `audio:cue`×3, `massline:throw`×1, `presentation:vfxCue`×1 |
| `masslineImpactDamage` | `systems/masslineImpactDamage.js` | 135 | 0 | 3 | — |
| `lootShards` | `systems/lootShards.js` | 312 | 4 | 1 | `entity:destroyed`×1, `loot:drop`×1, `research:grant`×1 |
| `terrainAnchors` | `systems/terrainAnchors.js` | 129 | 0 | 2 | — |
| `jettisonImpulse` | `systems/jettisonImpulse.js` | 66 | 1 | 1 | `audio:cue`×1 |
| `mining` | `systems/mining.js` | 1977 | 44 | 5 | `beam:denied`×5, `mining:yield`×4, `mining:start`×2 |
| `fieldDepletion` | `systems/fieldDepletion.js` | 569 | 3 | 3 | `field:richSeamMissed`×1, `fieldDepletion:changed`×1, `field:depletedChanged`×1 |
| `cargo` | `systems/cargo.js` | 371 | 4 | 4 | `cargo:changed`×1, `cargo:full`×1, `cargo:massSettled`×1 |
| `fragileCargo` | `systems/fragileCargo.js` | 218 | 1 | 2 | `cargo:fragileLost`×1 |
| `automation` | `systems/automation.js` | 2700 | 33 | 9 | `automation:offlineSummary`×5, `asset:deployed`×4, `economy:chargeCredits`×4 |
| `asteroidSites` | `systems/asteroidSites.js` | 1871 | 20 | 10 | `site:laneSpilled`×2, `worldSite:operationReceipt`×1, `worldSite:failureReceipt`×1 |
| `asteroidFormations` | `systems/asteroidFormations.js` | 255 | 1 | 2 | `formation:discovered`×1 |
| `wingmen` | `systems/wingmen.js` | 341 | 3 | 4 | `combat:hitAsset`×1, `entity:destroyed`×1, `wingOrder:converted`×1 |
| `crafting` | `systems/crafting.js` | 296 | 7 | 0 | `craft:queueChanged`×3, `craft:complete`×2, `audio:cue`×2 |
| `economy` | `systems/economy.js` | 2329 | 18 | 24 | `economy:tradeFailed`×3, `service:completed`×3, `credits:changed`×2 |
| `intervention` | `systems/intervention.js` | 144 | 3 | 1 | `camera:shake`×1, `intervention:available`×1, `intervention:closed`×1 |
| `world` | `systems/world.js` | 4091 | 67 | 33 | `poi:discovered`×5, `discovery:plateUnlocked`×4, `economy:chargeCredits`×3 |
| `heistFacilities` | `systems/heistFacilities.js` | 809 | 11 | 5 | `heist:launchScheduleReceipt`×4, `heist:launchCue`×1, `heist:capsuleLaunched`×1 |
| `regionalEcology` | `systems/regionalEcology.js` | 397 | 0 | 0 | — |
| `encounterDirector` | `systems/encounterDirector.js` | 3249 | 21 | 29 | `encounter:telegraph`×2, `encounter:spawned`×2, `encounter:resolved`×2 |
| `routeFollower` | `systems/routeFollower.js` | 901 | 0 | 8 | — |
| `livingPoiBehaviors` | `systems/livingPoiBehaviors.js` | 822 | 0 | 0 | — |
| `pirateRumor` | `systems/pirateRumor.js` | 661 | 0 | 0 | — |
| `ambushSignatures` | `systems/ambushSignatures.js` | 230 | 0 | 0 | — |
| `bountyHunt` | `systems/bountyHunt.js` | 356 | 0 | 0 | — |
| `stationSideEventDirector` | `systems/stationSideEventDirector.js` | 393 | 1 | 3 | `station:sideEvent`×1 |
| `gateControlDirector` | `systems/gateControlDirector.js` | 317 | 1 | 7 | `economy:chargeCredits`×1 |
| `salvage` | `systems/salvage.js` | 655 | 5 | 3 | `salvage:placed`×1, `comms:log`×1, `audio:cue`×1 |
| `lossInvestigation` | `systems/lossInvestigation.js` | 206 | 1 | 5 | `lossInvestigation:promoted`×1 |
| `salvageActions` | `systems/salvageActions.js` | 202 | 5 | 3 | `salvage:actionRead`×1, `salvage:reactorVented`×1, `salvage:reactorTowedClear`×1 |
| `survivorPod` | `systems/survivorPod.js` | 900 | 10 | 9 | `faction:repDelta`×2, `entity:destroyed`×1, `survivorPod:ejected`×1 |
| `recoveryEncounter` | `systems/recoveryEncounter.js` | 693 | 0 | 0 | — |
| `factions` | `systems/factions.js` | 560 | 9 | 10 | `faction:repChanged`×3, `faction:aggro`×3, `faction:repSpillover`×1 |
| `sectorSim` | `systems/sectorSim.js` | 1028 | 9 | 12 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `npcJobsRuntime` | `systems/npcJobsRuntime.js` | 2700 | 1 | 9 | `npcjobs:minerRelocated`×1 |
| `missions` | `systems/missions.js` | 5557 | 86 | 40 | `mission:updated`×42, `nav:waypoint`×5, `comms:popup`×5 |
| `careerOrigins` | `careers/origins/careerOrigins.js` | 1265 | 0 | 0 | — |
| `careerLadders` | `careers/ladders/careerLadders.js` | 348 | 0 | 0 | — |
| `liveCareerLadderBranches` | `careers/ladders/liveCareerLadderBranches.js` | 206 | 0 | 0 | — |
| `story` | `systems/story.js` | 1730 | 42 | 35 | `graffiti:show`×5, `hud:phase`×4, `comms:popup`×3 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 842 | 9 | 5 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `heat` | `systems/heat.js` | 454 | 1 | 8 | `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 7808 | 22 | 20 | `field:richSeamMissed`×2, `economy:applyTradePressure`×2, `freight:loss`×2 |
| `drill` | `systems/drill.js` | 1053 | 22 | 0 | `drill:warn`×8, `drill:rockDepleted`×3, `drill:start`×1 |
| `claims` | `systems/claims.js` | 2274 | 42 | 5 | `audio:cue`×5, `economy:chargeCredits`×4, `claim:carrierIntercept`×2 |
| `bandRadio` | `systems/bandRadio.js` | 649 | 4 | 0 | `band:bearingRequest`×1, `band:bearingReceipt`×1, `band:status`×1 |
| `onboarding` | `systems/onboarding.js` | 1250 | 3 | 37 | `hud:firstUse`×1, `tutorial:say`×1, `tutorial:finished`×1 |
| `masslineHud` | `ui/masslineHud.js` | 775 | 0 | 0 | — |
| `massSeedHud` | `ui/massSeedHud.js` | 326 | 0 | 0 | — |
| `fieldHud` | `ui/fieldHud.js` | 200 | 0 | 0 | — |
| `planetHud` | `ui/planetHud.js` | 142 | 0 | 0 | — |
| `voiceArbiter` | `ui/voiceArbiter.js` | 442 | 4 | 2 | `voice:clear`×2, `voice:surface`×2 |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
