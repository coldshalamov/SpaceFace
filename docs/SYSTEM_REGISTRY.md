# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative source is `src/core/registry.js`; this is a navigable projection of it.
>
> Generated: 2026-07-20. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → voiceArbiter → input → autoTargetAssist → flybyFocus → bulletTime → cloak → scanner → scanReveal → buildIdentity → lawSecurity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → barkDirector → ai → dockingCorridor → physics → aiPorts → tumbleStates → collisionConsequences → aiEncounter → actions → flight → cruise → weapons → countermeasures → impulseCharges → mines → uniqueLootAbilities → combat → combatOutcome → aftermathWrecks → uniqueWrecks → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → mining → fieldDepletion → cargo → fragileCargo → economy → automation → asteroidSites → asteroidFormations → wingmen → intervention → lossLedger → factionPresence → spawnBudget → world → regionalEcology → encounterDirector → routeFollower → travelLanes → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationContacts → stationContactLoadBoundary → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → careerOrigins → careerLadders → liveCareerLadderBranches → missions → careerContracts → economyContracts → postEndingReplay → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → drill → claims → beacons → bandRadio → v2FlavorRuntime → onboarding → masslineHud → sectorPostcard → dockDenyBanner → stationBroadcast → hazardHints → bulkHaulTag → dangerGradient → causeLedger → customsPrompt → cargoConscience → securityReadoutSystem → priceForecastSystem → contractClausesSystem → moralTrapSystem → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → autoTargetAssist → flybyFocus → bulletTime → cloak → lawSecurity → scanner → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → factionPresence → ai → barkDirector → aiEncounter → actions → beacons → travelLanes → flight → cruise → aiPorts → tumbleStates → collisionConsequences → weapons → countermeasures → impulseCharges → mines → uniqueLootAbilities → dockingCorridor → physics → combat → combatOutcome → aftermathWrecks → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → mining → fieldDepletion → cargo → fragileCargo → automation → asteroidSites → asteroidFormations → wingmen → crafting → economy → intervention → world → regionalEcology → encounterDirector → routeFollower → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → missions → careerOrigins → careerLadders → liveCareerLadderBranches → story → scenarioRuntime → heat → traffic → drill → claims → bandRadio → onboarding → masslineHud → voiceArbiter
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 1062 | 1 | 0 | `ui:setCourse`×1 |
| `autoTargetAssist` | `systems/autoTargetAssist.js` | 163 | 0 | 2 | — |
| `flybyFocus` | `systems/flybyFocus.js` | 373 | 4 | 1 | `flybyFocus:end`×1, `flybyFocus:start`×1, `camera:shake`×1 |
| `bulletTime` | `systems/bulletTime.js` | 121 | 4 | 0 | `audio:cue`×2, `bulletTime:start`×1, `bulletTime:end`×1 |
| `cloak` | `systems/cloak.js` | 153 | 4 | 1 | `audio:cue`×2, `cloak:engaged`×1, `cloak:dropped`×1 |
| `lawSecurity` | `systems/lawSecurity.js` | 676 | 0 | 2 | — |
| `scanner` | `systems/scanner.js` | 1136 | 17 | 7 | `contactHail:availability`×2, `scanner:ghostEscaped`×1, `scan:pulse`×1 |
| `scanReveal` | `systems/scanReveal.js` | 50 | 1 | 1 | `scan:shipRevealed`×1 |
| `buildIdentity` | `systems/buildIdentity.js` | 318 | 1 | 2 | `buildIdentity:revealed`×1 |
| `pirateDisguise` | `systems/pirateDisguise.js` | 69 | 0 | 1 | — |
| `pirateParley` | `systems/pirateParley.js` | 609 | 1 | 1 | `economy:chargeCredits`×1 |
| `pirateDisengage` | `systems/pirateDisengage.js` | 434 | 0 | 0 | — |
| `aceMemory` | `systems/aceMemory.js` | 642 | 0 | 0 | — |
| `factionPresence` | `systems/factionPresence.js` | 831 | 15 | 10 | `presentation:caption`×5, `comms:popup`×2, `factionPresence:spawned`×1 |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 198 | 2 | 2 | `ai:telegraph`×1, `ai:doctrinePhase`×1 |
| `barkDirector` | `systems/barkDirector.js` | 321 | 0 | 3 | — |
| `aiEncounter` | `systems/aiEncounter.js` | 314 | 0 | 0 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 160 | 5 | 2 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `travelLanes` | `systems/travelLanes.js` | 538 | 0 | 1 | — |
| `flight` | `systems/flightV3.js` (+ legacy) | 1270 | 7 | 4 | `ship:boostStop`×2, `ship:boostStart`×1, `ship:dash`×1 |
| `cruise` | `systems/cruise.js` | 142 | 4 | 4 | `cruise:engaged`×1, `cruise:charging`×1, `cruise:snared`×1 |
| `aiPorts` | `systems/aiPorts.js` | 1137 | 1 | 0 | `ai:encounterCommand`×1 |
| `tumbleStates` | `systems/tumbleStates.js` | 194 | 4 | 2 | `massline:tumbleEnd`×1, `massline:tumbled`×1, `audio:cue`×1 |
| `collisionConsequences` | `systems/collisionConsequences.js` | 289 | 2 | 3 | `combat:collisionConsequence`×1, `combat:collisionDebris`×1 |
| `weapons` | `systems/weapons.js` | 928 | 5 | 0 | `weapons:vent`×2, `combat:fire`×2, `combat:beamStop`×1 |
| `countermeasures` | `systems/countermeasures.js` | 249 | 2 | 0 | `countermeasure:deployed`×1, `audio:cue`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 473 | 10 | 0 | `audio:cue`×2, `charge:combo`×2, `charge:stuck`×1 |
| `mines` | `systems/mines.js` | 254 | 7 | 5 | `mines:capReached`×1, `ai:telegraph`×1, `mines:placed`×1 |
| `uniqueLootAbilities` | `systems/uniqueLootAbilities.js` | 467 | 3 | 5 | `uniqueLoot:paleCoilBlink`×1, `uniqueLoot:nestbreakerSplit`×1, `uniqueLoot:choirBellPulse`×1 |
| `dockingCorridor` | `systems/dockingCorridor.js` | 182 | 0 | 0 | — |
| `physics` | `core/physics.js` | 1224 | 9 | 1 | `projectile:hit`×2, `dock:range`×2, `gate:range`×2 |
| `combat` | `systems/combat.js` | 867 | 21 | 7 | `camera:shake`×6, `player:death`×3, `economy:grantCredits`×3 |
| `combatOutcome` | `systems/combatOutcome.js` | 203 | 2 | 4 | `combat:outcome`×1, `combat:outcomeConsequence`×1 |
| `aftermathWrecks` | `systems/aftermathWrecks.js` | 593 | 8 | 13 | `aftermath:causeRecorded`×1, `aftermathWreck:recorded`×1, `news:headline`×1 |
| `wingMorale` | `systems/wingMorale.js` | 316 | 5 | 3 | `ai:formationBroken`×1, `wingMorale:broken`×1, `ai:flee`×1 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 983 | 21 | 0 | `tether:latchDenied`×5, `tether:releaseRated`×5, `tether:released`×3 |
| `surrenderRecovery` | `systems/surrenderRecovery.js` | 341 | 0 | 5 | — |
| `custodyConsequences` | `systems/custodyConsequences.js` | 303 | 0 | 2 | — |
| `masslineTelemetry` | `systems/masslineTelemetry.js` | 523 | 2 | 0 | `tether:reelPump`×1, `tether:snapCatch`×1 |
| `masslineThreats` | `systems/masslineThreats.js` | 217 | 1 | 0 | `massline:threat`×1 |
| `masslineImpacts` | `systems/masslineImpacts.js` | 241 | 1 | 0 | `tether:whipImpact`×1 |
| `masslineThrow` | `systems/masslineThrow.js` | 457 | 6 | 1 | `audio:cue`×3, `massline:throw`×1, `presentation:vfxCue`×1 |
| `masslineImpactDamage` | `systems/masslineImpactDamage.js` | 115 | 0 | 2 | — |
| `lootShards` | `systems/lootShards.js` | 69 | 1 | 1 | `loot:drop`×1 |
| `terrainAnchors` | `systems/terrainAnchors.js` | 129 | 0 | 2 | — |
| `jettisonImpulse` | `systems/jettisonImpulse.js` | 66 | 1 | 1 | `audio:cue`×1 |
| `mining` | `systems/mining.js` | 1067 | 24 | 5 | `mining:yield`×3, `cargo:full`×2, `mining:start`×1 |
| `fieldDepletion` | `systems/fieldDepletion.js` | 278 | 2 | 2 | `fieldDepletion:changed`×1, `field:depletedChanged`×1 |
| `cargo` | `systems/cargo.js` | 238 | 4 | 4 | `cargo:changed`×1, `cargo:full`×1, `cargo:massSettled`×1 |
| `fragileCargo` | `systems/fragileCargo.js` | 218 | 1 | 2 | `cargo:fragileLost`×1 |
| `automation` | `systems/automation.js` | 2551 | 33 | 9 | `automation:offlineSummary`×5, `asset:deployed`×4, `economy:chargeCredits`×4 |
| `asteroidSites` | `systems/asteroidSites.js` | 1284 | 14 | 5 | `site:laneSpilled`×2, `site:created`×1, `site:machineInstalled`×1 |
| `asteroidFormations` | `systems/asteroidFormations.js` | 255 | 1 | 2 | `formation:discovered`×1 |
| `wingmen` | `systems/wingmen.js` | 341 | 3 | 4 | `combat:hitAsset`×1, `entity:destroyed`×1, `wingOrder:converted`×1 |
| `crafting` | `systems/crafting.js` | 296 | 7 | 0 | `craft:queueChanged`×3, `craft:complete`×2, `audio:cue`×2 |
| `economy` | `systems/economy.js` | 1673 | 12 | 20 | `economy:tradeFailed`×2, `credits:changed`×2, `economy:tick`×1 |
| `intervention` | `systems/intervention.js` | 144 | 3 | 1 | `camera:shake`×1, `intervention:available`×1, `intervention:closed`×1 |
| `world` | `systems/world.js` | 2624 | 33 | 13 | `world:residency`×2, `economy:chargeCredits`×2, `jump:chargeAbort`×2 |
| `regionalEcology` | `systems/regionalEcology.js` | 397 | 0 | 0 | — |
| `encounterDirector` | `systems/encounterDirector.js` | 1511 | 15 | 18 | `encounter:resolved`×2, `encounter:telegraph`×1, `encounter:spawned`×1 |
| `routeFollower` | `systems/routeFollower.js` | 645 | 0 | 7 | — |
| `livingPoiBehaviors` | `systems/livingPoiBehaviors.js` | 773 | 0 | 0 | — |
| `pirateRumor` | `systems/pirateRumor.js` | 661 | 0 | 0 | — |
| `ambushSignatures` | `systems/ambushSignatures.js` | 230 | 0 | 0 | — |
| `bountyHunt` | `systems/bountyHunt.js` | 356 | 0 | 0 | — |
| `stationSideEventDirector` | `systems/stationSideEventDirector.js` | 334 | 1 | 3 | `station:sideEvent`×1 |
| `gateControlDirector` | `systems/gateControlDirector.js` | 317 | 1 | 7 | `economy:chargeCredits`×1 |
| `salvage` | `systems/salvage.js` | 289 | 5 | 3 | `salvage:placed`×1, `comms:log`×1, `audio:cue`×1 |
| `lossInvestigation` | `systems/lossInvestigation.js` | 206 | 1 | 5 | `lossInvestigation:promoted`×1 |
| `salvageActions` | `systems/salvageActions.js` | 202 | 5 | 3 | `salvage:actionRead`×1, `salvage:reactorVented`×1, `salvage:reactorTowedClear`×1 |
| `survivorPod` | `systems/survivorPod.js` | 410 | 6 | 6 | `survivorPod:promoted`×1, `survivorPod:rescueBlocked`×1, `survivorPod:rescueSelected`×1 |
| `recoveryEncounter` | `systems/recoveryEncounter.js` | 565 | 0 | 0 | — |
| `factions` | `systems/factions.js` | 547 | 9 | 10 | `faction:repChanged`×3, `faction:aggro`×3, `faction:repSpillover`×1 |
| `sectorSim` | `systems/sectorSim.js` | 990 | 9 | 12 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `missions` | `systems/missions.js` | 4387 | 75 | 31 | `mission:updated`×37, `nav:waypoint`×5, `comms:popup`×5 |
| `careerOrigins` | `careers/origins/careerOrigins.js` | 1246 | 0 | 0 | — |
| `careerLadders` | `careers/ladders/careerLadders.js` | 348 | 0 | 0 | — |
| `liveCareerLadderBranches` | `careers/ladders/liveCareerLadderBranches.js` | 206 | 0 | 0 | — |
| `story` | `systems/story.js` | 1458 | 30 | 27 | `hud:phase`×4, `graffiti:show`×4, `endgame:ineligible`×2 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 842 | 9 | 5 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `heat` | `systems/heat.js` | 297 | 1 | 5 | `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 1033 | 5 | 3 | `aiTrader:requestTrade`×1, `freight:arrival`×1, `economy:applyTradePressure`×1 |
| `drill` | `systems/drill.js` | 1053 | 22 | 0 | `drill:warn`×8, `drill:rockDepleted`×3, `drill:start`×1 |
| `claims` | `systems/claims.js` | 1186 | 28 | 3 | `economy:chargeCredits`×4, `audio:cue`×4, `economy:grantCredits`×2 |
| `bandRadio` | `systems/bandRadio.js` | 649 | 4 | 0 | `band:bearingRequest`×1, `band:bearingReceipt`×1, `band:status`×1 |
| `onboarding` | `systems/onboarding.js` | 1298 | 2 | 38 | `tutorial:say`×1, `tutorial:finished`×1 |
| `masslineHud` | `ui/masslineHud.js` | 258 | 0 | 0 | — |
| `voiceArbiter` | `ui/voiceArbiter.js` | 422 | 4 | 2 | `voice:clear`×2, `voice:surface`×2 |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
