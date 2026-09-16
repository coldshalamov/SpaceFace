# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative order is `src/runtime/authoritativeSystemManifest.js` (materialized by
> `src/core/registry.js`); this is a navigable projection of it.
>
> Generated: 2026-09-15. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → runSession → survivalWave → survivalRewards → survivalDraft → survivalResults → survivalAnnounce → survivalArena → swarmArena → swarmSupply → swarmChain → survivalRun → voiceArbiter → input → autoTargetAssist → flybyFocus → bulletTime → cloak → scanner → scanReveal → buildIdentity → lawSecurity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → barkDirector → ai → dockingCorridor → physics → aiPorts → tumbleStates → collisionConsequences → stuntGrammar → aiEncounter → actions → flight → cruise → weapons → countermeasures → impulseCharges → mines → bombs → massSeed → uniqueLootAbilities → fields → environmentalMachinery → planetRuntime → combat → combatOutcome → aftermathWrecks → uniqueWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → mining → fieldDepletion → cargo → fragileCargo → economy → automation → asteroidSites → asteroidFormations → wingmen → intervention → lossLedger → provenanceLedger → factionPresence → spawnBudget → world → heistFacilities → regionalEcology → encounterDirector → routeFollower → travelLanes → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationContacts → stationContactLoadBoundary → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → npcJobsRuntime → careerOrigins → careerLadders → liveCareerLadderBranches → missions → careerContracts → economyContracts → postEndingReplay → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → drill → claims → beacons → bandRadio → v2FlavorRuntime → onboarding → masslineHud → massSeedHud → fieldHud → planetHud → survivalHud → crucibleFocus → sectorPostcard → dockDenyBanner → stationBroadcast → hazardHints → bulkHaulTag → dangerGradient → causeLedger → customsPrompt → cargoConscience → securityReadoutSystem → priceForecastSystem → contractClausesSystem → moralTrapSystem → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → autoTargetAssist → flybyFocus → bulletTime → cloak → lawSecurity → scanner → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → factionPresence → ai → barkDirector → aiEncounter → actions → beacons → travelLanes → flight → cruise → aiPorts → tumbleStates → collisionConsequences → stuntGrammar → weapons → countermeasures → impulseCharges → mines → bombs → massSeed → uniqueLootAbilities → dockingCorridor → environmentalMachinery → survivalArena → fields → planetRuntime → physics → combat → combatOutcome → aftermathWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → mining → fieldDepletion → cargo → fragileCargo → automation → asteroidSites → asteroidFormations → wingmen → crafting → economy → intervention → world → heistFacilities → regionalEcology → encounterDirector → routeFollower → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → npcJobsRuntime → missions → careerOrigins → careerLadders → liveCareerLadderBranches → story → scenarioRuntime → swarmArena → survivalWave → survivalRun → swarmChain → heat → traffic → drill → claims → bandRadio → onboarding → masslineHud → massSeedHud → fieldHud → planetHud → survivalHud → crucibleFocus → voiceArbiter → save
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 1381 | 0 | 0 | — |
| `autoTargetAssist` | `systems/autoTargetAssist.js` | 206 | 0 | 2 | — |
| `flybyFocus` | `systems/flybyFocus.js` | 428 | 4 | 1 | `flybyFocus:end`×1, `flybyFocus:start`×1, `camera:shake`×1 |
| `bulletTime` | `systems/bulletTime.js` | 397 | 6 | 2 | `audio:cue`×3, `bulletTime:start`×1, `bulletTime:end`×1 |
| `cloak` | `systems/cloak.js` | 153 | 4 | 1 | `audio:cue`×2, `cloak:engaged`×1, `cloak:dropped`×1 |
| `lawSecurity` | `systems/lawSecurity.js` | 3473 | 0 | 17 | — |
| `scanner` | `systems/scanner.js` | 1622 | 21 | 8 | `contactHail:availability`×2, `scanner:ghostEscaped`×1, `scan:pulse`×1 |
| `scanReveal` | `systems/scanReveal.js` | 50 | 1 | 1 | `scan:shipRevealed`×1 |
| `buildIdentity` | `systems/buildIdentity.js` | 318 | 1 | 2 | `buildIdentity:revealed`×1 |
| `pirateDisguise` | `systems/pirateDisguise.js` | 245 | 0 | 3 | — |
| `pirateParley` | `systems/pirateParley.js` | 612 | 1 | 1 | `economy:chargeCredits`×1 |
| `pirateDisengage` | `systems/pirateDisengage.js` | 437 | 0 | 0 | — |
| `aceMemory` | `systems/aceMemory.js` | 1070 | 0 | 0 | — |
| `factionPresence` | `systems/factionPresence.js` | 1164 | 16 | 10 | `presentation:caption`×5, `factionPresence:spawned`×2, `comms:popup`×2 |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 818 | 2 | 0 | `ai:telegraph`×1, `ai:doctrinePhase`×1 |
| `barkDirector` | `systems/barkDirector.js` | 984 | 0 | 12 | — |
| `aiEncounter` | `systems/aiEncounter.js` | 400 | 0 | 0 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 160 | 5 | 2 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `travelLanes` | `systems/travelLanes.js` | 1320 | 0 | 1 | — |
| `flight` | `systems/flightV3.js` (+ legacy) | 1314 | 8 | 4 | `ship:boostStop`×2, `ship:boostStart`×1, `ship:boostPreKick`×1 |
| `cruise` | `systems/cruise.js` | 150 | 4 | 4 | `cruise:engaged`×1, `cruise:charging`×1, `cruise:snared`×1 |
| `aiPorts` | `systems/aiPorts.js` | 1398 | 1 | 0 | `ai:encounterCommand`×1 |
| `tumbleStates` | `systems/tumbleStates.js` | 427 | 7 | 2 | `audio:cue`×2, `presentation:vfxCue`×2, `massline:tumbleEnd`×1 |
| `collisionConsequences` | `systems/collisionConsequences.js` | 514 | 2 | 5 | `combat:collisionConsequence`×1, `combat:collisionDebris`×1 |
| `stuntGrammar` | `systems/stuntGrammar.js` | 169 | 3 | 0 | `stunt:styleBanked`×1, `stunt:lineContractCompleted`×1, `stunt:bridge`×1 |
| `weapons` | `systems/weapons.js` | 2135 | 16 | 0 | `combat:fire`×3, `weapons:vent`×2, `presentation:vfxCue`×2 |
| `countermeasures` | `systems/countermeasures.js` | 277 | 2 | 0 | `countermeasure:deployed`×1, `audio:cue`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 1051 | 17 | 6 | `audio:cue`×3, `chain:slam`×2, `charge:detonated`×2 |
| `mines` | `systems/mines.js` | 262 | 7 | 5 | `mines:capReached`×1, `ai:telegraph`×1, `mines:placed`×1 |
| `bombs` | `systems/bombs.js` | 711 | 11 | 4 | `audio:cue`×3, `bombs:detonated`×2, `bombs:cycle`×1 |
| `massSeed` | `systems/massSeed.js` | 612 | 26 | 4 | `audio:cue`×6, `presentation:vfxCue`×4, `massSeed:collapsing`×4 |
| `uniqueLootAbilities` | `systems/uniqueLootAbilities.js` | 469 | 3 | 5 | `uniqueLoot:paleCoilBlink`×1, `uniqueLoot:nestbreakerSplit`×1, `uniqueLoot:choirBellPulse`×1 |
| `dockingCorridor` | `systems/dockingCorridor.js` | 182 | 0 | 0 | — |
| `environmentalMachinery` | `systems/environmentalMachinery.js` | 769 | 7 | 4 | `environmentalMachinery:ensureAperturePlug`×1, `environmentalMachinery:releaseAperturePlug`×1, `environmentalMachinery:ensureReef`×1 |
| `survivalArena` | `systems/survivalArena.js` | 969 | 3 | 7 | `mines:placeRequest`×1, `encounter:telegraph`×1, `encounter:resolved`×1 |
| `fields` | `systems/fields.js` | 1722 | 28 | 12 | `audio:cue`×5, `fields:ended`×4, `fields:coneToggled`×4 |
| `planetRuntime` | `systems/planetRuntime.js` | 558 | 10 | 3 | `planet:plungeStage`×2, `planet:registered`×1, `planet:unregistered`×1 |
| `physics` | `core/physics.js` | 1517 | 9 | 1 | `projectile:hit`×2, `dock:range`×2, `gate:range`×2 |
| `combat` | `systems/combat.js` | 1094 | 21 | 9 | `camera:shake`×6, `player:death`×3, `economy:grantCredits`×3 |
| `combatOutcome` | `systems/combatOutcome.js` | 227 | 2 | 4 | `combat:outcome`×1, `combat:outcomeConsequence`×1 |
| `aftermathWrecks` | `systems/aftermathWrecks.js` | 1572 | 11 | 19 | `aftermath:causeRecorded`×1, `aftermathWreck:recorded`×1, `news:headline`×1 |
| `titles` | `systems/titles.js` | 869 | 0 | 9 | — |
| `wingMorale` | `systems/wingMorale.js` | 384 | 5 | 3 | `ai:formationBroken`×1, `wingMorale:broken`×1, `ai:flee`×1 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 3110 | 35 | 9 | `tether:latchDenied`×7, `tether:releaseRated`×4, `massline:bridleEnded`×3 |
| `surrenderRecovery` | `systems/surrenderRecovery.js` | 1201 | 0 | 14 | — |
| `custodyConsequences` | `systems/custodyConsequences.js` | 417 | 0 | 5 | — |
| `masslineTelemetry` | `systems/masslineTelemetry.js` | 523 | 2 | 0 | `tether:reelPump`×1, `tether:snapCatch`×1 |
| `masslineThreats` | `systems/masslineThreats.js` | 341 | 1 | 0 | `massline:threat`×1 |
| `masslineImpacts` | `systems/masslineImpacts.js` | 484 | 2 | 0 | `tether:whipImpact`×1, `massline:sweepImpact`×1 |
| `masslineSnares` | `systems/masslineSnares.js` | 682 | 7 | 5 | `massline:snareArmed`×1, `massline:snareDeployed`×1, `ai:telegraph`×1 |
| `masslineThrow` | `systems/masslineThrow.js` | 783 | 7 | 1 | `audio:cue`×3, `massline:throw`×1, `presentation:vfxCue`×1 |
| `masslineImpactDamage` | `systems/masslineImpactDamage.js` | 135 | 0 | 3 | — |
| `lootShards` | `systems/lootShards.js` | 886 | 5 | 3 | `cargo:caughtByNet`×1, `cargo:volatileSlam`×1, `cargo:volatileCorrosive`×1 |
| `terrainAnchors` | `systems/terrainAnchors.js` | 315 | 0 | 6 | — |
| `jettisonImpulse` | `systems/jettisonImpulse.js` | 95 | 1 | 1 | `audio:cue`×1 |
| `mining` | `systems/mining.js` | 2104 | 45 | 5 | `beam:denied`×5, `mining:yield`×4, `mining:start`×2 |
| `fieldDepletion` | `systems/fieldDepletion.js` | 581 | 3 | 3 | `field:richSeamMissed`×1, `fieldDepletion:changed`×1, `field:depletedChanged`×1 |
| `cargo` | `systems/cargo.js` | 482 | 4 | 0 | `cargo:changed`×1, `cargo:full`×1, `cargo:massSettled`×1 |
| `fragileCargo` | `systems/fragileCargo.js` | 218 | 1 | 2 | `cargo:fragileLost`×1 |
| `automation` | `systems/automation.js` | 3110 | 34 | 9 | `automation:offlineSummary`×5, `economy:chargeCredits`×4, `economy:applyTradePressure`×3 |
| `asteroidSites` | `systems/asteroidSites.js` | 2047 | 21 | 10 | `site:laneSpilled`×2, `worldSite:operationReceipt`×1, `worldSite:failureReceipt`×1 |
| `asteroidFormations` | `systems/asteroidFormations.js` | 255 | 1 | 2 | `formation:discovered`×1 |
| `wingmen` | `systems/wingmen.js` | 344 | 2 | 4 | `combat:hitAsset`×1, `wingOrder:converted`×1 |
| `crafting` | `systems/crafting.js` | 350 | 7 | 0 | `craft:queueChanged`×3, `craft:complete`×2, `audio:cue`×2 |
| `economy` | `systems/economy.js` | 2783 | 17 | 24 | `economy:tradeFailed`×2, `credits:changed`×2, `service:completed`×2 |
| `intervention` | `systems/intervention.js` | 144 | 3 | 1 | `camera:shake`×1, `intervention:available`×1, `intervention:closed`×1 |
| `world` | `systems/world.js` | 4706 | 69 | 35 | `poi:discovered`×5, `discovery:plateUnlocked`×4, `economy:chargeCredits`×3 |
| `heistFacilities` | `systems/heistFacilities.js` | 1246 | 12 | 6 | `heist:launchScheduleReceipt`×4, `heist:launchCue`×1, `heist:capsuleLaunched`×1 |
| `regionalEcology` | `systems/regionalEcology.js` | 397 | 0 | 0 | — |
| `encounterDirector` | `systems/encounterDirector.js` | 3356 | 22 | 31 | `encounter:resolved`×2, `economy:applyTradePressure`×2, `rhythm:phase`×1 |
| `routeFollower` | `systems/routeFollower.js` | 901 | 0 | 8 | — |
| `livingPoiBehaviors` | `systems/livingPoiBehaviors.js` | 822 | 0 | 0 | — |
| `pirateRumor` | `systems/pirateRumor.js` | 674 | 0 | 0 | — |
| `ambushSignatures` | `systems/ambushSignatures.js` | 230 | 0 | 0 | — |
| `bountyHunt` | `systems/bountyHunt.js` | 357 | 0 | 0 | — |
| `stationSideEventDirector` | `systems/stationSideEventDirector.js` | 400 | 1 | 3 | `station:sideEvent`×1 |
| `gateControlDirector` | `systems/gateControlDirector.js` | 317 | 1 | 7 | `economy:chargeCredits`×1 |
| `salvage` | `systems/salvage.js` | 745 | 6 | 5 | `salvage:placed`×1, `wreckField:source`×1, `comms:log`×1 |
| `lossInvestigation` | `systems/lossInvestigation.js` | 206 | 1 | 5 | `lossInvestigation:promoted`×1 |
| `salvageActions` | `systems/salvageActions.js` | 202 | 5 | 3 | `salvage:actionRead`×1, `salvage:reactorVented`×1, `salvage:reactorTowedClear`×1 |
| `survivorPod` | `systems/survivorPod.js` | 1064 | 11 | 10 | `survivorPod:ejected`×2, `faction:repDelta`×2, `entity:destroyed`×1 |
| `recoveryEncounter` | `systems/recoveryEncounter.js` | 693 | 0 | 0 | — |
| `factions` | `systems/factions.js` | 768 | 11 | 12 | `faction:repChanged`×3, `faction:aggro`×3, `economy:chargeCredits`×1 |
| `sectorSim` | `systems/sectorSim.js` | 1028 | 9 | 12 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `npcJobsRuntime` | `systems/npcJobsRuntime.js` | 3612 | 1 | 12 | `npcjobs:minerRelocated`×1 |
| `missions` | `systems/missions.js` | 7027 | 91 | 46 | `mission:updated`×45, `nav:waypoint`×5, `comms:popup`×5 |
| `careerOrigins` | `careers/origins/careerOrigins.js` | 1246 | 0 | 0 | — |
| `careerLadders` | `careers/ladders/careerLadders.js` | 348 | 0 | 0 | — |
| `liveCareerLadderBranches` | `careers/ladders/liveCareerLadderBranches.js` | 206 | 0 | 0 | — |
| `story` | `systems/story.js` | 1809 | 43 | 35 | `graffiti:show`×5, `hud:phase`×4, `comms:popup`×3 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 849 | 9 | 5 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `swarmArena` | `systems/swarmArena.js` | 785 | 0 | 4 | — |
| `survivalWave` | `systems/survivalWave.js` | 573 | 0 | 5 | — |
| `survivalRun` | `systems/survivalRun.js` | 477 | 1 | 12 | `run:transitionRequested`×1 |
| `swarmChain` | `systems/swarmChain.js` | 214 | 0 | 2 | — |
| `heat` | `systems/heat.js` | 585 | 1 | 10 | `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 9398 | 26 | 26 | `field:richSeamMissed`×2, `news:publish`×2, `economy:applyTradePressure`×2 |
| `drill` | `systems/drill.js` | 1372 | 22 | 0 | `drill:warn`×8, `drill:rockDepleted`×3, `drill:start`×1 |
| `claims` | `systems/claims.js` | 1583 | 32 | 3 | `economy:chargeCredits`×4, `audio:cue`×4, `economy:grantCredits`×2 |
| `bandRadio` | `systems/bandRadio.js` | 658 | 4 | 0 | `band:bearingRequest`×1, `band:bearingReceipt`×1, `band:status`×1 |
| `onboarding` | `systems/onboarding.js` | 2101 | 16 | 52 | `onboarding:rangePrompt`×2, `rescue:beat`×2, `hud:firstUse`×1 |
| `masslineHud` | `ui/masslineHud.js` | 995 | 0 | 1 | — |
| `massSeedHud` | `ui/massSeedHud.js` | 326 | 0 | 0 | — |
| `fieldHud` | `ui/fieldHud.js` | 200 | 0 | 0 | — |
| `planetHud` | `ui/planetHud.js` | 142 | 0 | 0 | — |
| `survivalHud` | `ui/survivalHud.js` | 622 | 0 | 9 | — |
| `crucibleFocus` | `ui/crucibleFocus.js` | 203 | 2 | 0 | `camera:zoom`×2 |
| `voiceArbiter` | `ui/voiceArbiter.js` | 442 | 4 | 2 | `voice:clear`×2, `voice:surface`×2 |
| `save` | `save/saveSystem.js` | 4233 | 37 | 24 | `save:error`×22, `save:started`×2, `mode:changed`×2 |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
