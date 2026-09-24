# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative order is `src/runtime/authoritativeSystemManifest.js` (materialized by
> `src/core/registry.js`); this is a navigable projection of it.
>
> Generated: 2026-09-24. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → runSession → survivalWave → survivalRewards → survivalDraft → survivalResults → killReplay → survivalAnnounce → survivalArena → swarmArena → swarmSupply → swarmChain → survivalRun → voiceArbiter → input → autoTargetAssist → flybyFocus → bulletTime → cloak → scanner → scanReveal → buildIdentity → lawSecurity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → barkDirector → ai → dockingCorridor → physics → aiPorts → tumbleStates → collisionConsequences → stuntGrammar → aiEncounter → actions → flight → cruise → weapons → countermeasures → impulseCharges → mines → bombs → emergentPrimitives → massSeed → uniqueLootAbilities → fields → environmentalMachinery → planetRuntime → combat → combatOutcome → aftermathWrecks → capitalBossEncounters → uniqueWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → mining → fieldDepletion → cargo → fragileCargo → economy → automation → asteroidSites → asteroidFormations → wingmen → intervention → lossLedger → provenanceLedger → chronicler → factionPresence → spawnBudget → world → heistFacilities → regionalEcology → tensionDirector → encounterDirector → nemesis → nemesisEncounter → nemesisSignals → routeFollower → travelLanes → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationContacts → stationContactLoadBoundary → stationServices → difficultyDirector → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → npcJobsRuntime → careerOrigins → careerLadders → liveCareerLadderBranches → missions → careerContracts → economyContracts → postEndingReplay → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → drill → claims → beacons → bandRadio → v2FlavorRuntime → onboarding → masslineHud → massSeedHud → fieldHud → planetHud → survivalHud → crucibleFocus → sectorPostcard → dockDenyBanner → stationBroadcast → hazardHints → bulkHaulTag → dangerGradient → causeLedger → customsPrompt → impoundPayPrompt → cargoConscience → securityReadoutSystem → priceForecastSystem → contractClausesSystem → moralTrapSystem → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → autoTargetAssist → flybyFocus → bulletTime → cloak → lawSecurity → scanner → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → factionPresence → nemesis → nemesisEncounter → capitalBossEncounters → ai → barkDirector → aiEncounter → actions → beacons → travelLanes → flight → cruise → aiPorts → tumbleStates → collisionConsequences → stuntGrammar → weapons → countermeasures → bombs → emergentPrimitives → impulseCharges → mines → massSeed → uniqueLootAbilities → dockingCorridor → environmentalMachinery → survivalArena → fields → planetRuntime → physics → combat → combatOutcome → aftermathWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → mining → fieldDepletion → cargo → fragileCargo → automation → asteroidSites → asteroidFormations → wingmen → crafting → economy → intervention → world → heistFacilities → regionalEcology → tensionDirector → encounterDirector → routeFollower → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationServices → difficultyDirector → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → npcJobsRuntime → missions → careerOrigins → careerLadders → liveCareerLadderBranches → story → scenarioRuntime → swarmArena → survivalWave → survivalRun → swarmChain → killReplay → heat → traffic → drill → claims → chronicler → bandRadio → onboarding → masslineHud → massSeedHud → fieldHud → planetHud → survivalHud → crucibleFocus → voiceArbiter → save
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 1395 | 0 | 0 | — |
| `autoTargetAssist` | `systems/autoTargetAssist.js` | 220 | 0 | 4 | — |
| `flybyFocus` | `systems/flybyFocus.js` | 439 | 4 | 1 | `flybyFocus:end`×1, `flybyFocus:start`×1, `camera:shake`×1 |
| `bulletTime` | `systems/bulletTime.js` | 397 | 6 | 2 | `audio:cue`×3, `bulletTime:start`×1, `bulletTime:end`×1 |
| `cloak` | `systems/cloak.js` | 164 | 4 | 3 | `audio:cue`×2, `cloak:engaged`×1, `cloak:dropped`×1 |
| `lawSecurity` | `systems/lawSecurity.js` | 4099 | 0 | 19 | — |
| `scanner` | `systems/scanner.js` | 1626 | 21 | 9 | `contactHail:availability`×2, `scanner:ghostEscaped`×1, `scan:pulse`×1 |
| `scanReveal` | `systems/scanReveal.js` | 51 | 1 | 1 | `scan:shipRevealed`×1 |
| `buildIdentity` | `systems/buildIdentity.js` | 327 | 1 | 2 | `buildIdentity:revealed`×1 |
| `pirateDisguise` | `systems/pirateDisguise.js` | 246 | 0 | 3 | — |
| `pirateParley` | `systems/pirateParley.js` | 612 | 1 | 1 | `economy:chargeCredits`×1 |
| `pirateDisengage` | `systems/pirateDisengage.js` | 437 | 0 | 0 | — |
| `aceMemory` | `systems/aceMemory.js` | 1315 | 0 | 0 | — |
| `factionPresence` | `systems/factionPresence.js` | 1202 | 17 | 11 | `presentation:caption`×5, `factionPresence:spawned`×2, `comms:popup`×2 |
| `nemesis` | `systems/nemesis.js` | 344 | 0 | 0 | — |
| `nemesisEncounter` | `systems/nemesisEncounter.js` | 9 | 0 | 0 | — |
| `capitalBossEncounters` | `systems/capitalBossEncounters.js` | 148 | 2 | 0 | `capitalBoss:telegraphEnd`×2 |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 996 | 2 | 0 | `ai:telegraph`×1, `ai:doctrinePhase`×1 |
| `barkDirector` | `systems/barkDirector.js` | 1409 | 1 | 19 | `audio:cue`×1 |
| `aiEncounter` | `systems/aiEncounter.js` | 400 | 0 | 0 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 216 | 5 | 2 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `travelLanes` | `systems/travelLanes.js` | 1320 | 0 | 1 | — |
| `flight` | `systems/flightV3.js` (+ legacy) | 1493 | 9 | 4 | `ship:boostStop`×2, `ship:boostStart`×1, `ship:boostPreKick`×1 |
| `cruise` | `systems/cruise.js` | 238 | 4 | 4 | `cruise:engaged`×1, `cruise:charging`×1, `cruise:snared`×1 |
| `aiPorts` | `systems/aiPorts.js` | 1541 | 1 | 0 | `ai:encounterCommand`×1 |
| `tumbleStates` | `systems/tumbleStates.js` | 504 | 9 | 2 | `audio:cue`×2, `presentation:vfxCue`×2, `massline:tumbleEnd`×1 |
| `collisionConsequences` | `systems/collisionConsequences.js` | 554 | 2 | 5 | `combat:collisionConsequence`×1, `combat:collisionDebris`×1 |
| `stuntGrammar` | `systems/stuntGrammar.js` | 213 | 7 | 0 | `stunt:styleBanked`×1, `faction:repDelta`×1, `stunt:salvageRights`×1 |
| `weapons` | `systems/weapons.js` | 2368 | 20 | 0 | `combat:fire`×4, `presentation:vfxCue`×3, `weapons:vent`×2 |
| `countermeasures` | `systems/countermeasures.js` | 388 | 4 | 0 | `pds:intercept`×1, `presentation:vfxCue`×1, `countermeasure:deployed`×1 |
| `bombs` | `systems/bombs.js` | 889 | 30 | 12 | `bombs:denied`×8, `economy:chargeCredits`×3, `bombs:stockChanged`×3 |
| `emergentPrimitives` | `systems/emergentPrimitives.js` | 1131 | 2 | 0 | `emergent:audio`×1, `emergent:contact`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 1113 | 17 | 6 | `audio:cue`×3, `chain:slam`×2, `charge:detonated`×2 |
| `mines` | `systems/mines.js` | 262 | 7 | 5 | `mines:capReached`×1, `ai:telegraph`×1, `mines:placed`×1 |
| `massSeed` | `systems/massSeed.js` | 612 | 26 | 4 | `audio:cue`×6, `presentation:vfxCue`×4, `massSeed:collapsing`×4 |
| `uniqueLootAbilities` | `systems/uniqueLootAbilities.js` | 530 | 3 | 5 | `uniqueLoot:paleCoilBlink`×1, `uniqueLoot:nestbreakerSplit`×1, `uniqueLoot:choirBellPulse`×1 |
| `dockingCorridor` | `systems/dockingCorridor.js` | 206 | 0 | 0 | — |
| `environmentalMachinery` | `systems/environmentalMachinery.js` | 869 | 7 | 4 | `environmentalMachinery:ensureAperturePlug`×1, `environmentalMachinery:releaseAperturePlug`×1, `environmentalMachinery:ensureReef`×1 |
| `survivalArena` | `systems/survivalArena.js` | 1139 | 4 | 7 | `survivalArena:rosterPrewarm`×1, `mines:placeRequest`×1, `encounter:telegraph`×1 |
| `fields` | `systems/fields.js` | 1857 | 28 | 12 | `audio:cue`×5, `fields:ended`×4, `fields:coneToggled`×4 |
| `planetRuntime` | `systems/planetRuntime.js` | 591 | 10 | 3 | `planet:plungeStage`×2, `planet:registered`×1, `planet:unregistered`×1 |
| `physics` | `core/physics.js` | 1703 | 9 | 1 | `projectile:hit`×2, `dock:range`×2, `gate:range`×2 |
| `combat` | `systems/combat.js` | 1204 | 19 | 9 | `camera:shake`×4, `player:death`×3, `economy:grantCredits`×3 |
| `combatOutcome` | `systems/combatOutcome.js` | 227 | 2 | 4 | `combat:outcome`×1, `combat:outcomeConsequence`×1 |
| `aftermathWrecks` | `systems/aftermathWrecks.js` | 2269 | 15 | 19 | `aftermath:causeRecorded`×1, `aftermathWreck:recorded`×1, `news:headline`×1 |
| `titles` | `systems/titles.js` | 869 | 0 | 9 | — |
| `wingMorale` | `systems/wingMorale.js` | 384 | 5 | 3 | `ai:formationBroken`×1, `wingMorale:broken`×1, `ai:flee`×1 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 3257 | 37 | 9 | `tether:latchDenied`×7, `tether:releaseRated`×4, `massline:bridleEnded`×3 |
| `surrenderRecovery` | `systems/surrenderRecovery.js` | 1194 | 0 | 14 | — |
| `custodyConsequences` | `systems/custodyConsequences.js` | 417 | 0 | 5 | — |
| `masslineTelemetry` | `systems/masslineTelemetry.js` | 528 | 2 | 0 | `tether:reelPump`×1, `tether:snapCatch`×1 |
| `masslineThreats` | `systems/masslineThreats.js` | 341 | 1 | 0 | `massline:threat`×1 |
| `masslineImpacts` | `systems/masslineImpacts.js` | 530 | 2 | 0 | `tether:whipImpact`×1, `massline:sweepImpact`×1 |
| `masslineSnares` | `systems/masslineSnares.js` | 682 | 7 | 5 | `massline:snareArmed`×1, `massline:snareDeployed`×1, `ai:telegraph`×1 |
| `masslineThrow` | `systems/masslineThrow.js` | 1164 | 10 | 1 | `audio:cue`×3, `massline:releaseCancelled`×1, `massline:releaseWindow`×1 |
| `masslineImpactDamage` | `systems/masslineImpactDamage.js` | 135 | 0 | 3 | — |
| `lootShards` | `systems/lootShards.js` | 1013 | 7 | 4 | `loot:magnetCaptured`×1, `cargo:caughtByNet`×1, `cargo:volatileSlam`×1 |
| `terrainAnchors` | `systems/terrainAnchors.js` | 400 | 0 | 6 | — |
| `jettisonImpulse` | `systems/jettisonImpulse.js` | 95 | 1 | 1 | `audio:cue`×1 |
| `mining` | `systems/mining.js` | 2368 | 45 | 5 | `beam:denied`×5, `mining:yield`×4, `mining:start`×3 |
| `fieldDepletion` | `systems/fieldDepletion.js` | 860 | 3 | 3 | `field:richSeamMissed`×1, `fieldDepletion:changed`×1, `field:depletedChanged`×1 |
| `cargo` | `systems/cargo.js` | 559 | 5 | 0 | `cargo:changed`×1, `cargo:full`×1, `cargo:massSettled`×1 |
| `fragileCargo` | `systems/fragileCargo.js` | 218 | 1 | 2 | `cargo:fragileLost`×1 |
| `automation` | `systems/automation.js` | 3192 | 35 | 9 | `automation:offlineSummary`×5, `economy:chargeCredits`×4, `economy:applyTradePressure`×3 |
| `asteroidSites` | `systems/asteroidSites.js` | 2053 | 21 | 10 | `site:laneSpilled`×2, `worldSite:operationReceipt`×1, `worldSite:failureReceipt`×1 |
| `asteroidFormations` | `systems/asteroidFormations.js` | 256 | 1 | 2 | `formation:discovered`×1 |
| `wingmen` | `systems/wingmen.js` | 344 | 2 | 4 | `combat:hitAsset`×1, `wingOrder:converted`×1 |
| `crafting` | `systems/crafting.js` | 350 | 7 | 0 | `craft:queueChanged`×3, `craft:complete`×2, `audio:cue`×2 |
| `economy` | `systems/economy.js` | 3312 | 21 | 27 | `service:completed`×3, `economy:tradeFailed`×2, `credits:changed`×2 |
| `intervention` | `systems/intervention.js` | 147 | 3 | 1 | `camera:shake`×1, `intervention:available`×1, `intervention:closed`×1 |
| `world` | `systems/world.js` | 5750 | 72 | 35 | `poi:discovered`×5, `discovery:plateUnlocked`×4, `world:residency`×3 |
| `heistFacilities` | `systems/heistFacilities.js` | 1908 | 13 | 6 | `heist:launchScheduleReceipt`×4, `heist:launchCue`×1, `heist:capsuleLaunched`×1 |
| `regionalEcology` | `systems/regionalEcology.js` | 397 | 0 | 0 | — |
| `tensionDirector` | `systems/tensionDirector.js` | 278 | 0 | 0 | — |
| `encounterDirector` | `systems/encounterDirector.js` | 4201 | 27 | 31 | `encounter:resolved`×2, `economy:applyTradePressure`×2, `encounter:stale`×1 |
| `routeFollower` | `systems/routeFollower.js` | 901 | 0 | 8 | — |
| `livingPoiBehaviors` | `systems/livingPoiBehaviors.js` | 843 | 0 | 0 | — |
| `pirateRumor` | `systems/pirateRumor.js` | 674 | 0 | 0 | — |
| `ambushSignatures` | `systems/ambushSignatures.js` | 230 | 0 | 0 | — |
| `bountyHunt` | `systems/bountyHunt.js` | 394 | 0 | 0 | — |
| `stationSideEventDirector` | `systems/stationSideEventDirector.js` | 403 | 1 | 3 | `station:sideEvent`×1 |
| `stationServices` | `systems/stationServices.js` | 625 | 11 | 3 | `fuel:changed`×2, `service:completed`×2, `service:aborted`×1 |
| `difficultyDirector` | `systems/difficultyDirector.js` | 378 | 2 | 1 | `difficulty:pinReleased`×1, `difficulty:stanceChanged`×1 |
| `gateControlDirector` | `systems/gateControlDirector.js` | 318 | 1 | 7 | `economy:chargeCredits`×1 |
| `salvage` | `systems/salvage.js` | 751 | 6 | 5 | `salvage:placed`×1, `wreckField:source`×1, `comms:log`×1 |
| `lossInvestigation` | `systems/lossInvestigation.js` | 206 | 1 | 5 | `lossInvestigation:promoted`×1 |
| `salvageActions` | `systems/salvageActions.js` | 202 | 5 | 3 | `salvage:actionRead`×1, `salvage:reactorVented`×1, `salvage:reactorTowedClear`×1 |
| `survivorPod` | `systems/survivorPod.js` | 1074 | 11 | 10 | `survivorPod:ejected`×2, `faction:repDelta`×2, `entity:destroyed`×1 |
| `recoveryEncounter` | `systems/recoveryEncounter.js` | 730 | 0 | 0 | — |
| `factions` | `systems/factions.js` | 821 | 11 | 15 | `faction:repChanged`×3, `faction:aggro`×3, `economy:chargeCredits`×1 |
| `sectorSim` | `systems/sectorSim.js` | 1028 | 9 | 12 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `npcJobsRuntime` | `systems/npcJobsRuntime.js` | 4122 | 7 | 13 | `npcjobs:lotReplaced`×1, `npcjobs:lotPosted`×1, `npcjobs:lotClaimed`×1 |
| `missions` | `systems/missions.js` | 8077 | 101 | 48 | `mission:updated`×47, `comms:popup`×6, `nav:waypoint`×5 |
| `careerOrigins` | `careers/origins/careerOrigins.js` | 1246 | 0 | 0 | — |
| `careerLadders` | `careers/ladders/careerLadders.js` | 348 | 0 | 0 | — |
| `liveCareerLadderBranches` | `careers/ladders/liveCareerLadderBranches.js` | 206 | 0 | 0 | — |
| `story` | `systems/story.js` | 1924 | 47 | 36 | `graffiti:show`×6, `hud:phase`×4, `comms:popup`×3 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 852 | 9 | 5 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `swarmArena` | `systems/swarmArena.js` | 953 | 0 | 4 | — |
| `survivalWave` | `systems/survivalWave.js` | 579 | 0 | 5 | — |
| `survivalRun` | `systems/survivalRun.js` | 482 | 1 | 12 | `run:transitionRequested`×1 |
| `swarmChain` | `systems/swarmChain.js` | 266 | 0 | 2 | — |
| `killReplay` | `systems/killReplay.js` | 146 | 0 | 0 | — |
| `heat` | `systems/heat.js` | 634 | 1 | 9 | `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 10317 | 30 | 27 | `field:richSeamMissed`×2, `news:publish`×2, `comms:message`×2 |
| `drill` | `systems/drill.js` | 1372 | 22 | 0 | `drill:warn`×8, `drill:rockDepleted`×3, `drill:start`×1 |
| `claims` | `systems/claims.js` | 2343 | 44 | 8 | `audio:cue`×5, `economy:chargeCredits`×4, `news:publish`×3 |
| `chronicler` | `systems/chronicler.js` | 334 | 0 | 0 | — |
| `bandRadio` | `systems/bandRadio.js` | 660 | 4 | 0 | `band:bearingRequest`×1, `band:bearingReceipt`×1, `band:status`×1 |
| `onboarding` | `systems/onboarding.js` | 2949 | 19 | 64 | `onboarding:rangePrompt`×2, `rescue:beat`×2, `hud:firstUse`×1 |
| `masslineHud` | `ui/masslineHud.js` | 1482 | 0 | 2 | — |
| `massSeedHud` | `ui/massSeedHud.js` | 348 | 0 | 0 | — |
| `fieldHud` | `ui/fieldHud.js` | 221 | 0 | 0 | — |
| `planetHud` | `ui/planetHud.js` | 158 | 0 | 0 | — |
| `survivalHud` | `ui/survivalHud.js` | 744 | 0 | 9 | — |
| `crucibleFocus` | `ui/crucibleFocus.js` | 196 | 2 | 0 | `camera:zoom`×2 |
| `voiceArbiter` | `ui/voiceArbiter.js` | 452 | 4 | 2 | `voice:clear`×2, `voice:surface`×2 |
| `save` | `save/saveSystem.js` | 4729 | 37 | 26 | `save:error`×22, `save:started`×2, `mode:changed`×2 |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
