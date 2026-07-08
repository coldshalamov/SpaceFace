# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative source is `src/core/registry.js`; this is a navigable projection of it.
>
> Generated: 2026-07-08. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → voiceArbiter → input → autoTargetAssist → scanner → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → barkDirector → ai → physics → aiPorts → aiEncounter → actions → flight → cruise → weapons → countermeasures → impulseCharges → combat → combatOutcome → aftermathWrecks → wingMorale → tetherGameplay → masslineTelemetry → masslineThreats → masslineImpacts → mining → fieldDepletion → cargo → economy → automation → wingmen → intervention → lossLedger → spawnBudget → world → encounterDirector → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → factions → sectorSim → missions → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → drill → claims → beacons → onboarding → sectorPostcard → dockDenyBanner → stationBroadcast → hazardHints → bulkHaulTag → dangerGradient → causeLedger → customsPrompt → cargoConscience → securityReadoutSystem → priceForecastSystem → contractClausesSystem → moralTrapSystem → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → autoTargetAssist → scanner → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → ai → barkDirector → aiEncounter → actions → beacons → flight → cruise → aiPorts → weapons → countermeasures → impulseCharges → physics → combat → combatOutcome → aftermathWrecks → wingMorale → tetherGameplay → masslineTelemetry → masslineThreats → masslineImpacts → mining → fieldDepletion → cargo → automation → wingmen → crafting → economy → intervention → world → encounterDirector → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → gateControlDirector → salvage → lossInvestigation → salvageActions → survivorPod → factions → sectorSim → missions → story → scenarioRuntime → heat → traffic → drill → claims → onboarding → voiceArbiter
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 607 | 1 | 0 | `ui:setCourse`×1 |
| `autoTargetAssist` | `systems/autoTargetAssist.js` | 93 | 0 | 0 | — |
| `scanner` | `systems/scanner.js` | 369 | 3 | 0 | `scan:pulse`×1, `scan:weakPoint`×1, `scan:completed`×1 |
| `scanReveal` | `systems/scanReveal.js` | 50 | 1 | 1 | `scan:shipRevealed`×1 |
| `buildIdentity` | `systems/buildIdentity.js` | 318 | 1 | 2 | `buildIdentity:revealed`×1 |
| `pirateDisguise` | `systems/pirateDisguise.js` | 69 | 0 | 1 | — |
| `pirateParley` | `systems/pirateParley.js` | 344 | 0 | 1 | — |
| `pirateDisengage` | `systems/pirateDisengage.js` | 211 | 0 | 0 | — |
| `aceMemory` | `systems/aceMemory.js` | 463 | 0 | 0 | — |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 238 | 0 | 2 | — |
| `barkDirector` | `systems/barkDirector.js` | 306 | 0 | 3 | — |
| `aiEncounter` | `systems/aiEncounter.js` | 298 | 0 | 0 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 160 | 5 | 2 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `flight` | `systems/flightV3.js` (+ legacy) | 1050 | 7 | 3 | `ship:boostStop`×2, `ship:boostStart`×1, `ship:dash`×1 |
| `cruise` | `systems/cruise.js` | 142 | 4 | 4 | `cruise:engaged`×1, `cruise:charging`×1, `cruise:snared`×1 |
| `aiPorts` | `systems/aiPorts.js` | 905 | 1 | 0 | `ai:encounterCommand`×1 |
| `weapons` | `systems/weapons.js` | 741 | 5 | 0 | `weapons:vent`×2, `combat:fire`×2, `combat:beamStop`×1 |
| `countermeasures` | `systems/countermeasures.js` | 249 | 2 | 0 | `countermeasure:deployed`×1, `audio:cue`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 396 | 8 | 0 | `charge:combo`×2, `charge:stuck`×1, `charge:thrown`×1 |
| `physics` | `core/physics.js` | 1059 | 8 | 1 | `projectile:hit`×2, `dock:range`×2, `gate:range`×2 |
| `combat` | `systems/combat.js` | 619 | 14 | 4 | `camera:shake`×4, `economy:grantCredits`×3, `player:death`×2 |
| `combatOutcome` | `systems/combatOutcome.js` | 203 | 2 | 4 | `combat:outcome`×1, `combat:outcomeConsequence`×1 |
| `aftermathWrecks` | `systems/aftermathWrecks.js` | 379 | 4 | 6 | `aftermathWreck:recorded`×1, `news:headline`×1, `aftermathWreck:spawned`×1 |
| `wingMorale` | `systems/wingMorale.js` | 316 | 5 | 3 | `ai:formationBroken`×1, `wingMorale:broken`×1, `ai:flee`×1 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 595 | 11 | 0 | `tether:releaseRated`×4, `tether:released`×2, `tether:broke`×2 |
| `masslineTelemetry` | `systems/masslineTelemetry.js` | 523 | 2 | 0 | `tether:reelPump`×1, `tether:snapCatch`×1 |
| `masslineThreats` | `systems/masslineThreats.js` | 217 | 1 | 0 | `massline:threat`×1 |
| `masslineImpacts` | `systems/masslineImpacts.js` | 241 | 1 | 0 | `tether:whipImpact`×1 |
| `mining` | `systems/mining.js` | 986 | 23 | 5 | `mining:yield`×3, `cargo:full`×2, `mining:start`×1 |
| `fieldDepletion` | `systems/fieldDepletion.js` | 278 | 2 | 2 | `fieldDepletion:changed`×1, `field:depletedChanged`×1 |
| `cargo` | `systems/cargo.js` | 177 | 2 | 3 | `cargo:changed`×1, `cargo:full`×1 |
| `automation` | `systems/automation.js` | 1530 | 23 | 5 | `asset:deployed`×4, `economy:chargeCredits`×4, `economy:applyTradePressure`×3 |
| `wingmen` | `systems/wingmen.js` | 156 | 2 | 3 | `combat:hitAsset`×1, `entity:destroyed`×1 |
| `crafting` | `systems/crafting.js` | 296 | 7 | 0 | `craft:queueChanged`×3, `craft:complete`×2, `audio:cue`×2 |
| `economy` | `systems/economy.js` | 1185 | 12 | 18 | `economy:tradeFailed`×2, `credits:changed`×2, `economy:tick`×1 |
| `intervention` | `systems/intervention.js` | 144 | 3 | 1 | `camera:shake`×1, `intervention:available`×1, `intervention:closed`×1 |
| `world` | `systems/world.js` | 1603 | 28 | 12 | `economy:chargeCredits`×2, `jump:chargeAbort`×2, `poi:discovered`×2 |
| `encounterDirector` | `systems/encounterDirector.js` | 1034 | 12 | 12 | `encounter:resolved`×2, `encounter:telegraph`×1, `encounter:spawned`×1 |
| `pirateRumor` | `systems/pirateRumor.js` | 560 | 0 | 0 | — |
| `ambushSignatures` | `systems/ambushSignatures.js` | 225 | 0 | 0 | — |
| `bountyHunt` | `systems/bountyHunt.js` | 356 | 0 | 0 | — |
| `stationSideEventDirector` | `systems/stationSideEventDirector.js` | 305 | 1 | 3 | `station:sideEvent`×1 |
| `gateControlDirector` | `systems/gateControlDirector.js` | 313 | 1 | 7 | `economy:chargeCredits`×1 |
| `salvage` | `systems/salvage.js` | 276 | 5 | 3 | `salvage:placed`×1, `comms:log`×1, `audio:cue`×1 |
| `lossInvestigation` | `systems/lossInvestigation.js` | 206 | 1 | 5 | `lossInvestigation:promoted`×1 |
| `salvageActions` | `systems/salvageActions.js` | 157 | 5 | 3 | `salvage:actionRead`×1, `salvage:reactorVented`×1, `salvage:reactorTowedClear`×1 |
| `survivorPod` | `systems/survivorPod.js` | 410 | 6 | 6 | `survivorPod:promoted`×1, `survivorPod:rescueBlocked`×1, `survivorPod:rescueSelected`×1 |
| `factions` | `systems/factions.js` | 553 | 9 | 10 | `faction:repChanged`×3, `faction:aggro`×3, `faction:repSpillover`×1 |
| `sectorSim` | `systems/sectorSim.js` | 783 | 8 | 12 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `missions` | `systems/missions.js` | 1962 | 38 | 18 | `mission:updated`×15, `faction:repDelta`×5, `nav:waypoint`×3 |
| `story` | `systems/story.js` | 709 | 16 | 12 | `graffiti:show`×4, `hud:phase`×3, `faction:repDelta`×2 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 731 | 7 | 3 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `heat` | `systems/heat.js` | 292 | 1 | 4 | `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 384 | 1 | 2 | `aiTrader:requestTrade`×1 |
| `drill` | `systems/drill.js` | 389 | 11 | 0 | `drill:warn`×5, `drill:start`×1, `drill:end`×1 |
| `claims` | `systems/claims.js` | 235 | 7 | 0 | `economy:chargeCredits`×2, `audio:cue`×2, `claim:claimed`×1 |
| `onboarding` | `systems/onboarding.js` | 907 | 3 | 27 | `tutorial:say`×1, `tutorial:finished`×1, `loot:drop`×1 |
| `voiceArbiter` | `ui/voiceArbiter.js` | 215 | 0 | 1 | — |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
