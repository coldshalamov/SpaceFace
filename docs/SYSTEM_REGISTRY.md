# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative order is `src/runtime/authoritativeSystemManifest.js` (materialized by
> `src/core/registry.js`); this is a navigable projection of it.
>
> Generated: 2026-10-11. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → runSession → survivalWave → survivalRewards → survivalDraft → survivalResults → killReplay → killcamRecorder → survivalAnnounce → survivalArena → swarmArena → swarmSupply → swarmChain → swarmJuice → swarmElites → survivalRun → voiceArbiter → input → autoTargetAssist → flybyFocus → bulletTime → cloak → scanner → scanReveal → buildIdentity → lawSecurity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → barkDirector → ai → dockingCorridor → physics → latchNine → aiPorts → tumbleStates → collisionConsequences → stuntGrammar → aiEncounter → actions → flight → cruise → weapons → countermeasures → impulseCharges → hullBurst → mines → bombs → emergentPrimitives → environmentMaterials → massSeed → uniqueLootAbilities → fields → gyreSnare → environmentalMachinery → planetRuntime → combat → combatOutcome → aftermathWrecks → capitalBossEncounters → uniqueWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → volatileExposure → mining → fieldDepletion → cargo → fragileCargo → economy → automation → asteroidSites → asteroidFormations → wingmen → intervention → lossLedger → provenanceLedger → chronicler → factionPresence → spawnBudget → world → heistFacilities → regionalEcology → tensionDirector → encounterDirector → scissorwake → nemesis → nemesisEncounter → nemesisSignals → routeFollower → travelLanes → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationContacts → stationContactLoadBoundary → stationServices → difficultyDirector → gateControlDirector → morrow → vesper → bracket → ravel → solstice → rubric → ruckus → ruud → salvage → tallyThree → lastShift → lastShiftPrompt → redKite → redKitePrompt → sableVenn → ilexArk → ilexArkPrompt → kilnback → mothlight → mothlightPrompt → palletJack → palletJackPrompt → secondRinse → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → towlineTable → towlineTablePrompt → borrowedVoice → borrowedVoicePrompt → npcJobsRuntime → careerOrigins → careerLadders → liveCareerLadderBranches → missions → careerContracts → economyContracts → postEndingReplay → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → drill → claims → beacons → bandRadio → v2FlavorRuntime → onboarding → masslineHud → massSeedHud → fieldHud → gyreHud → planetHud → miningHud → survivalHud → swarmJuiceHud → crucibleFocus → sectorPostcard → dockDenyBanner → stationBroadcast → hazardHints → noFireAdvisory → bulkHaulTag → dangerGradient → causeLedger → customsPrompt → impoundPayPrompt → warrantOfferPrompt → moralTrapPrompt → wreckChoicePrompt → stuckTowPrompt → cargoConscience → securityReadoutSystem → priceForecastSystem → contractClausesSystem → moralTrapSystem → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → autoTargetAssist → flybyFocus → bulletTime → cloak → lawSecurity → scanner → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → factionPresence → nemesis → nemesisEncounter → capitalBossEncounters → kilnback → mothlight → palletJack → secondRinse → ai → barkDirector → aiEncounter → actions → beacons → travelLanes → flight → cruise → redKite → ilexArk → aiPorts → tumbleStates → collisionConsequences → stuntGrammar → weapons → countermeasures → bombs → emergentPrimitives → environmentMaterials → impulseCharges → hullBurst → mines → massSeed → uniqueLootAbilities → dockingCorridor → environmentalMachinery → survivalArena → fields → gyreSnare → planetRuntime → morrow → vesper → bracket → ravel → solstice → rubric → ruckus → ruud → physics → latchNine → combat → combatOutcome → aftermathWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → custodyConsequences → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → volatileExposure → mining → fieldDepletion → cargo → fragileCargo → automation → asteroidSites → asteroidFormations → wingmen → crafting → economy → intervention → world → heistFacilities → regionalEcology → tensionDirector → encounterDirector → scissorwake → routeFollower → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationServices → difficultyDirector → gateControlDirector → salvage → tallyThree → lastShift → sableVenn → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → sectorSim → towlineTable → borrowedVoice → npcJobsRuntime → missions → careerOrigins → careerLadders → liveCareerLadderBranches → story → scenarioRuntime → swarmArena → survivalWave → survivalRun → swarmChain → killReplay → killcamRecorder → swarmJuice → swarmElites → heat → traffic → drill → claims → chronicler → bandRadio → onboarding → masslineHud → massSeedHud → fieldHud → gyreHud → planetHud → miningHud → survivalHud → swarmJuiceHud → crucibleFocus → noFireAdvisory → moralTrapSystem → voiceArbiter → save
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 2067 | 1 | 0 | `input:worldGestureCancelled`×1 |
| `autoTargetAssist` | `systems/autoTargetAssist.js` | 294 | 0 | 5 | — |
| `flybyFocus` | `systems/flybyFocus.js` | 525 | 5 | 1 | `flybyFocus:cancel`×1, `flybyFocus:end`×1, `flybyFocus:start`×1 |
| `bulletTime` | `systems/bulletTime.js` | 401 | 6 | 2 | `audio:cue`×3, `bulletTime:start`×1, `bulletTime:end`×1 |
| `cloak` | `systems/cloak.js` | 376 | 5 | 6 | `audio:cue`×2, `cloak:engaged`×1, `cloak:dropped`×1 |
| `lawSecurity` | `systems/lawSecurity.js` | 6479 | 0 | 25 | — |
| `scanner` | `systems/scanner.js` | 2187 | 25 | 10 | `signal:tracked`×2, `ui:setCourse`×2, `contactHail:response`×2 |
| `scanReveal` | `systems/scanReveal.js` | 1313 | 6 | 1 | `economy:grantCredits`×2, `scan:shipRevealed`×1, `scan:wreckRevealed`×1 |
| `buildIdentity` | `systems/buildIdentity.js` | 355 | 1 | 2 | `buildIdentity:revealed`×1 |
| `pirateDisguise` | `systems/pirateDisguise.js` | 252 | 0 | 3 | — |
| `pirateParley` | `systems/pirateParley.js` | 1103 | 1 | 1 | `economy:chargeCredits`×1 |
| `pirateDisengage` | `systems/pirateDisengage.js` | 666 | 0 | 0 | — |
| `aceMemory` | `systems/aceMemory.js` | 1938 | 0 | 0 | — |
| `factionPresence` | `systems/factionPresence.js` | 1506 | 18 | 12 | `presentation:caption`×5, `comms:popup`×3, `factionPresence:spawned`×2 |
| `nemesis` | `systems/nemesis.js` | 446 | 0 | 0 | — |
| `nemesisEncounter` | `systems/nemesisEncounter.js` | 9 | 0 | 0 | — |
| `capitalBossEncounters` | `systems/capitalBossEncounters.js` | 149 | 2 | 0 | `capitalBoss:telegraphEnd`×2 |
| `kilnback` | `systems/kilnback.js` | 370 | 4 | 0 | `kilnback:caskReleased`×1, `kilnback:coolantReleased`×1, `kilnback:caskSalvaged`×1 |
| `mothlight` | `systems/mothlight.js` | 307 | 3 | 0 | `mothlight:lampReleased`×1, `mothlight:phase`×1, `mothlight:identified`×1 |
| `palletJack` | `systems/palletJack.js` | 484 | 5 | 0 | `palletJack:phase`×1, `palletJack:released`×1, `palletJack:offer`×1 |
| `secondRinse` | `systems/secondRinse.js` | 274 | 0 | 0 | — |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 1313 | 3 | 0 | `ai:telegraph`×1, `ai:doctrinePhase`×1, `audio:cue`×1 |
| `barkDirector` | `systems/barkDirector.js` | 2657 | 3 | 44 | `npc:hailed`×2, `audio:cue`×1 |
| `aiEncounter` | `systems/aiEncounter.js` | 856 | 0 | 6 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 264 | 5 | 2 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `travelLanes` | `systems/travelLanes.js` | 1504 | 0 | 2 | — |
| `flight` | `systems/flightV3.js` (+ legacy) | 2137 | 10 | 5 | `ship:boostStop`×2, `ship:boostStart`×1, `ship:boostPreKick`×1 |
| `cruise` | `systems/cruise.js` | 277 | 4 | 4 | `cruise:engaged`×1, `cruise:charging`×1, `cruise:snared`×1 |
| `redKite` | `systems/redKite.js` | 318 | 5 | 0 | `ui:setCourse`×1, `redKite:offer`×1, `redKite:started`×1 |
| `ilexArk` | `systems/ilexArk.js` | 256 | 6 | 0 | `ui:setCourse`×1, `ilexArk:vaultReleased`×1, `ilexArk:accepted`×1 |
| `aiPorts` | `systems/aiPorts.js` | 2005 | 2 | 0 | `ai:encounterCommand`×1, `cloak:faded`×1 |
| `tumbleStates` | `systems/tumbleStates.js` | 816 | 12 | 7 | `audio:cue`×2, `presentation:vfxCue`×2, `massline:recovered`×1 |
| `collisionConsequences` | `systems/collisionConsequences.js` | 856 | 2 | 6 | `combat:collisionConsequence`×1, `combat:collisionDebris`×1 |
| `stuntGrammar` | `systems/stuntGrammar.js` | 300 | 7 | 0 | `stunt:styleBanked`×1, `faction:repDelta`×1, `stunt:salvageRights`×1 |
| `weapons` | `systems/weapons.js` | 3099 | 21 | 0 | `combat:fire`×4, `presentation:vfxCue`×3, `weapons:vent`×2 |
| `countermeasures` | `systems/countermeasures.js` | 827 | 5 | 3 | `audio:cue`×2, `pds:intercept`×1, `countermeasure:deployed`×1 |
| `bombs` | `systems/bombs.js` | 1751 | 34 | 14 | `bombs:denied`×8, `economy:chargeCredits`×4, `bombs:stockChanged`×3 |
| `emergentPrimitives` | `systems/emergentPrimitives.js` | 1199 | 2 | 0 | `emergent:audio`×1, `emergent:contact`×1 |
| `environmentMaterials` | `systems/environmentMaterials.js` | 238 | 2 | 1 | `emergent:audio`×1, `asteroid:chunked`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 1570 | 24 | 6 | `audio:cue`×5, `charge:detonated`×4, `chain:slam`×2 |
| `hullBurst` | `systems/hullBurst.js` | 588 | 16 | 0 | `audio:cue`×5, `presentation:vfxCue`×4, `hullBurst:hit`×3 |
| `mines` | `systems/mines.js` | 357 | 10 | 6 | `mines:armed`×2, `mines:capReached`×1, `voice:say`×1 |
| `massSeed` | `systems/massSeed.js` | 673 | 23 | 4 | `presentation:vfxCue`×4, `massSeed:collapsing`×4, `massSeed:collapsed`×4 |
| `uniqueLootAbilities` | `systems/uniqueLootAbilities.js` | 583 | 3 | 5 | `uniqueLoot:paleCoilBlink`×1, `uniqueLoot:nestbreakerSplit`×1, `uniqueLoot:choirBellPulse`×1 |
| `dockingCorridor` | `systems/dockingCorridor.js` | 343 | 0 | 4 | — |
| `environmentalMachinery` | `systems/environmentalMachinery.js` | 1378 | 9 | 4 | `environmentalMachinery:ensureAnvil`×2, `environmentalMachinery:ensureAperturePlug`×1, `environmentalMachinery:releaseAperturePlug`×1 |
| `survivalArena` | `systems/survivalArena.js` | 1751 | 4 | 7 | `survivalArena:rosterPrewarm`×1, `mines:placeRequest`×1, `encounter:telegraph`×1 |
| `fields` | `systems/fields.js` | 3145 | 32 | 13 | `fields:deployed`×6, `audio:cue`×4, `fields:ended`×4 |
| `gyreSnare` | `systems/gyreSnare.js` | 2968 | 28 | 0 | `audio:cue`×23, `camera:shake`×5 |
| `planetRuntime` | `systems/planetRuntime.js` | 702 | 12 | 3 | `planet:plungeStage`×2, `planet:registered`×1, `planet:unregistered`×1 |
| `morrow` | `systems/morrow.js` | 332 | 5 | 0 | `morrow:voice`×1, `audio:cue`×1, `morrow:met`×1 |
| `vesper` | `systems/vesper.js` | 320 | 7 | 0 | `vesper:voice`×1, `vesper:met`×1, `audio:cue`×1 |
| `bracket` | `systems/bracket.js` | 327 | 7 | 0 | `bracket:voice`×1, `audio:cue`×1, `bracket:matchStarted`×1 |
| `ravel` | `systems/ravel.js` | 288 | 8 | 0 | `ravel:voice`×1, `audio:cue`×1, `ravel:telegraph`×1 |
| `solstice` | `systems/solstice.js` | 596 | 5 | 0 | `solstice:voice`×1, `audio:cue`×1, `solstice:destroyed`×1 |
| `rubric` | `systems/rubric.js` | 649 | 5 | 0 | `rubric:voice`×1, `audio:cue`×1, `rubric:destroyed`×1 |
| `ruckus` | `systems/ruckus.js` | 322 | 6 | 0 | `save:dirty`×1, `ruckus:voice`×1, `audio:cue`×1 |
| `ruud` | `systems/ruud.js` | 533 | 5 | 0 | `audio:cue`×2, `ruud:voice`×1, `ruud:spared`×1 |
| `physics` | `core/physics.js` | 2319 | 9 | 3 | `projectile:hit`×2, `dock:range`×2, `gate:range`×2 |
| `latchNine` | `systems/latchNine.js` | 150 | 0 | 0 | — |
| `combat` | `systems/combat.js` | 1593 | 19 | 9 | `camera:shake`×3, `economy:grantCredits`×3, `player:death`×2 |
| `combatOutcome` | `systems/combatOutcome.js` | 351 | 2 | 17 | `combat:outcome`×1, `combat:outcomeConsequence`×1 |
| `aftermathWrecks` | `systems/aftermathWrecks.js` | 2821 | 18 | 20 | `aftermath:causeRecorded`×1, `aftermathWreck:recorded`×1, `news:headline`×1 |
| `titles` | `systems/titles.js` | 1268 | 0 | 13 | — |
| `wingMorale` | `systems/wingMorale.js` | 437 | 5 | 3 | `ai:formationBroken`×1, `wingMorale:broken`×1, `ai:flee`×1 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 4201 | 47 | 10 | `tether:latchDenied`×8, `tether:releaseRated`×4, `tether:broke`×3 |
| `surrenderRecovery` | `systems/surrenderRecovery.js` | 1340 | 0 | 14 | — |
| `custodyConsequences` | `systems/custodyConsequences.js` | 432 | 0 | 5 | — |
| `masslineTelemetry` | `systems/masslineTelemetry.js` | 550 | 2 | 0 | `tether:reelPump`×1, `tether:snapCatch`×1 |
| `masslineThreats` | `systems/masslineThreats.js` | 400 | 1 | 0 | `massline:threat`×1 |
| `masslineImpacts` | `systems/masslineImpacts.js` | 530 | 2 | 0 | `tether:whipImpact`×1, `massline:sweepImpact`×1 |
| `masslineSnares` | `systems/masslineSnares.js` | 896 | 8 | 5 | `massline:snareDeployed`×2, `massline:snareArmed`×1, `ai:telegraph`×1 |
| `masslineThrow` | `systems/masslineThrow.js` | 877 | 9 | 4 | `audio:cue`×3, `massline:releaseCancelled`×1, `massline:releaseWindow`×1 |
| `masslineImpactDamage` | `systems/masslineImpactDamage.js` | 144 | 0 | 3 | — |
| `lootShards` | `systems/lootShards.js` | 1258 | 8 | 4 | `cargo:volatileSlam`×2, `loot:magnetCaptured`×1, `cargo:caughtByNet`×1 |
| `terrainAnchors` | `systems/terrainAnchors.js` | 427 | 1 | 6 | `terrainAnchors:replenished`×1 |
| `jettisonImpulse` | `systems/jettisonImpulse.js` | 95 | 1 | 1 | `audio:cue`×1 |
| `volatileExposure` | `systems/volatileExposure.js` | 575 | 7 | 4 | `presentation:vfxCue`×2, `audio:cue`×2, `cargo:volatileExposed`×1 |
| `mining` | `systems/mining.js` | 3257 | 50 | 10 | `beam:denied`×5, `mining:yield`×5, `mining:start`×3 |
| `fieldDepletion` | `systems/fieldDepletion.js` | 921 | 3 | 3 | `field:richSeamMissed`×1, `fieldDepletion:changed`×1, `field:depletedChanged`×1 |
| `cargo` | `systems/cargo.js` | 1176 | 14 | 0 | `salvage:changed`×2, `audio:cue`×2, `cargo:changed`×1 |
| `fragileCargo` | `systems/fragileCargo.js` | 297 | 1 | 2 | `cargo:fragileLost`×1 |
| `automation` | `systems/automation.js` | 3451 | 36 | 9 | `automation:offlineSummary`×5, `economy:chargeCredits`×4, `economy:applyTradePressure`×3 |
| `asteroidSites` | `systems/asteroidSites.js` | 2840 | 22 | 12 | `site:laneSpilled`×2, `worldSite:operationReceipt`×1, `worldSite:failureReceipt`×1 |
| `asteroidFormations` | `systems/asteroidFormations.js` | 317 | 1 | 3 | `formation:discovered`×1 |
| `wingmen` | `systems/wingmen.js` | 702 | 2 | 6 | `combat:hitAsset`×1, `wingOrder:converted`×1 |
| `crafting` | `systems/crafting.js` | 457 | 7 | 0 | `craft:queueChanged`×3, `craft:complete`×2, `audio:cue`×2 |
| `economy` | `systems/economy.js` | 5059 | 37 | 33 | `service:completed`×7, `faction:repDelta`×3, `fuel:changed`×3 |
| `intervention` | `systems/intervention.js` | 588 | 5 | 2 | `intervention:logged`×1, `camera:shake`×1, `intervention:available`×1 |
| `world` | `systems/world.js` | 7523 | 80 | 56 | `poi:discovered`×5, `discovery:plateUnlocked`×4, `world:residency`×3 |
| `heistFacilities` | `systems/heistFacilities.js` | 3926 | 23 | 8 | `heist:launchScheduleReceipt`×4, `heist:counterweightSceneReceipt`×4, `heist:launchCue`×2 |
| `regionalEcology` | `systems/regionalEcology.js` | 454 | 0 | 0 | — |
| `tensionDirector` | `systems/tensionDirector.js` | 278 | 0 | 0 | — |
| `encounterDirector` | `systems/encounterDirector.js` | 5261 | 32 | 39 | `encounter:resolved`×2, `economy:applyTradePressure`×2, `encounter:stale`×1 |
| `scissorwake` | `systems/scissorwake.js` | 118 | 0 | 3 | — |
| `routeFollower` | `systems/routeFollower.js` | 1011 | 1 | 9 | `nav:engageRoute`×1 |
| `livingPoiBehaviors` | `systems/livingPoiBehaviors.js` | 938 | 0 | 0 | — |
| `pirateRumor` | `systems/pirateRumor.js` | 674 | 0 | 0 | — |
| `ambushSignatures` | `systems/ambushSignatures.js` | 236 | 0 | 0 | — |
| `bountyHunt` | `systems/bountyHunt.js` | 1145 | 0 | 0 | — |
| `stationSideEventDirector` | `systems/stationSideEventDirector.js` | 443 | 1 | 4 | `station:sideEvent`×1 |
| `stationServices` | `systems/stationServices.js` | 664 | 13 | 3 | `fuel:changed`×2, `service:completed`×2, `economy:grantCredits`×1 |
| `difficultyDirector` | `systems/difficultyDirector.js` | 476 | 2 | 5 | `difficulty:pinReleased`×1, `difficulty:stanceChanged`×1 |
| `gateControlDirector` | `systems/gateControlDirector.js` | 339 | 2 | 7 | `economy:chargeCredits`×1, `gate:verdict`×1 |
| `salvage` | `systems/salvage.js` | 1434 | 15 | 7 | `comms:log`×4, `audio:cue`×3, `salvage:placed`×1 |
| `tallyThree` | `systems/tallyThree.js` | 140 | 1 | 0 | `ui:setCourse`×1 |
| `lastShift` | `systems/lastShift.js` | 250 | 4 | 0 | `lastShift:offer`×1, `news:headline`×1, `lastShift:archived`×1 |
| `sableVenn` | `systems/sableVenn.js` | 80 | 0 | 0 | — |
| `lossInvestigation` | `systems/lossInvestigation.js` | 378 | 3 | 7 | `lossInvestigation:promoted`×1, `mission:offered`×1, `lossInvestigation:closed`×1 |
| `salvageActions` | `systems/salvageActions.js` | 763 | 13 | 8 | `entity:spawnRequest`×2, `presentation:cue`×2, `combat:hit`×2 |
| `survivorPod` | `systems/survivorPod.js` | 1557 | 13 | 11 | `survivorPod:ejected`×2, `faction:repDelta`×2, `economy:grantCredits`×2 |
| `recoveryEncounter` | `systems/recoveryEncounter.js` | 814 | 0 | 0 | — |
| `factions` | `systems/factions.js` | 1060 | 13 | 18 | `faction:repChanged`×3, `faction:aggro`×3, `comms:log`×1 |
| `sectorSim` | `systems/sectorSim.js` | 1225 | 10 | 16 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `towlineTable` | `systems/towlineTable.js` | 306 | 6 | 0 | `ui:setCourse`×1, `towlineTable:cleanupAccepted`×1, `towlineTable:assistAccepted`×1 |
| `borrowedVoice` | `systems/borrowedVoice.js` | 185 | 3 | 0 | `borrowedVoice:fragmentRecovered`×1, `borrowedVoice:offer`×1, `borrowedVoice:dispositionAccepted`×1 |
| `npcJobsRuntime` | `systems/npcJobsRuntime.js` | 6433 | 24 | 18 | `npcJobs:towAssistLost`×3, `economy:chargeCredits`×2, `combat:repairSubsystem`×2 |
| `missions` | `systems/missions.js` | 12546 | 140 | 78 | `mission:updated`×65, `comms:popup`×12, `nav:waypoint`×6 |
| `careerOrigins` | `careers/origins/careerOrigins.js` | 1281 | 0 | 0 | — |
| `careerLadders` | `careers/ladders/careerLadders.js` | 348 | 0 | 0 | — |
| `liveCareerLadderBranches` | `careers/ladders/liveCareerLadderBranches.js` | 206 | 0 | 0 | — |
| `story` | `systems/story.js` | 2686 | 49 | 52 | `graffiti:show`×6, `hud:phase`×4, `comms:popup`×3 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 852 | 9 | 5 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `swarmArena` | `systems/swarmArena.js` | 1564 | 0 | 6 | — |
| `survivalWave` | `systems/survivalWave.js` | 885 | 0 | 7 | — |
| `survivalRun` | `systems/survivalRun.js` | 556 | 1 | 12 | `run:transitionRequested`×1 |
| `swarmChain` | `systems/swarmChain.js` | 308 | 0 | 3 | — |
| `killReplay` | `systems/killReplay.js` | 308 | 0 | 3 | — |
| `killcamRecorder` | `sim/killcamTape.js` | 497 | 0 | 2 | — |
| `swarmJuice` | `systems/swarmJuice.js` | 501 | 0 | 10 | — |
| `swarmElites` | `systems/swarmElites.js` | 591 | 0 | 7 | — |
| `heat` | `systems/heat.js` | 879 | 3 | 11 | `bounty:cooled`×1, `survivorPod:heatCooled`×1, `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 12075 | 38 | 38 | `comms:message`×3, `field:richSeamMissed`×2, `news:publish`×2 |
| `drill` | `systems/drill.js` | 1737 | 23 | 0 | `drill:warn`×9, `drill:rockDepleted`×3, `drill:yield`×1 |
| `claims` | `systems/claims.js` | 3287 | 50 | 14 | `audio:cue`×5, `economy:chargeCredits`×4, `news:publish`×4 |
| `chronicler` | `systems/chronicler.js` | 410 | 0 | 0 | — |
| `bandRadio` | `systems/bandRadio.js` | 723 | 4 | 0 | `band:bearingRequest`×1, `band:bearingReceipt`×1, `band:status`×1 |
| `onboarding` | `systems/onboarding.js` | 3669 | 21 | 77 | `onboarding:rangePrompt`×2, `rescue:beat`×2, `hud:firstUse`×1 |
| `masslineHud` | `ui/masslineHud.js` | 2471 | 0 | 5 | — |
| `massSeedHud` | `ui/massSeedHud.js` | 381 | 0 | 0 | — |
| `fieldHud` | `ui/fieldHud.js` | 303 | 0 | 0 | — |
| `gyreHud` | `ui/gyreHud.js` | 472 | 0 | 0 | — |
| `planetHud` | `ui/planetHud.js` | 193 | 0 | 0 | — |
| `miningHud` | `ui/miningHud.js` | 600 | 0 | 8 | — |
| `survivalHud` | `ui/survivalHud.js` | 842 | 0 | 9 | — |
| `swarmJuiceHud` | `ui/swarmJuiceHud.js` | 633 | 0 | 14 | — |
| `crucibleFocus` | `ui/crucibleFocus.js` | 196 | 2 | 0 | `camera:zoom`×2 |
| `noFireAdvisory` | `data/stationBubbles.js` | 251 | 0 | 1 | — |
| `moralTrapSystem` | *(not found)* | — | — | — | — |
| `voiceArbiter` | `ui/voiceArbiter.js` | 495 | 4 | 2 | `voice:clear`×2, `voice:surface`×2 |
| `save` | `save/saveSystem.js` | 7737 | 48 | 29 | `save:error`×26, `mode:changed`×4, `save:started`×2 |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
