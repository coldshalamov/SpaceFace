# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative order is `src/runtime/authoritativeSystemManifest.js` (materialized by
> `src/core/registry.js`); this is a navigable projection of it.
>
> Generated: 2026-10-23. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → runSession → survivalWave → survivalRewards → survivalDraft → survivalResults → killReplay → killcamRecorder → survivalAnnounce → survivalArena → swarmArena → swarmSupply → swarmChain → swarmJuice → swarmElites → survivalRun → voiceArbiter → input → autoTargetAssist → flybyFocus → bulletTime → cloak → scanner → spectrum → scanReveal → buildIdentity → lawSecurity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → barkDirector → ai → dockingCorridor → physics → latchNine → aiPorts → reactiveMatter → orbitalGallery → kineticLeague → tumbleStates → collisionConsequences → stuntGrammar → aiEncounter → actions → flight → cruise → weapons → countermeasures → impulseCharges → hullBurst → mines → bombs → emergentPrimitives → environmentMaterials → massSeed → uniqueLootAbilities → fields → gyreSnare → environmentalMachinery → planetRuntime → combat → combatOutcome → aftermathWrecks → capitalBossEncounters → uniqueWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → shipjack → custodyConsequences → mercyService → wreckCourt → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → understoryGardens → fulfillmentRoutes → pitbornCull → vaelLiens → archiveRedaction → choirResonance → vergeCourt → frontierHomesteads → terrainAnchors → jettisonImpulse → volatileExposure → mining → fieldDepletion → cargo → fragileCargo → economy → automation → asteroidSites → asteroidFormations → wingmen → intervention → lossLedger → provenanceLedger → chronicler → factionPresence → spawnBudget → world → heistFacilities → regionalEcology → tensionDirector → encounterDirector → rockCore → scissorwake → nemesis → nemesisEncounter → nemesisSignals → routeFollower → travelLanes → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationContacts → stationContactLoadBoundary → stationServices → difficultyDirector → gateControlDirector → morrow → vesper → bracket → ravel → solstice → rubric → ruckus → ruud → salvage → tallyThree → lastShift → lastShiftPrompt → redKite → redKitePrompt → sableVenn → ilexArk → ilexArkPrompt → kilnback → mothlight → mothlightPrompt → palletJack → palletJackPrompt → secondRinse → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → massSignature → faction_concord → faction_meridian → faction_helix → faction_drift → sectorSim → towlineTable → towlineTablePrompt → borrowedVoice → borrowedVoicePrompt → npcJobsRuntime → careerOrigins → careerLadders → liveCareerLadderBranches → missions → careerContracts → economyContracts → postEndingReplay → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → drill → claims → beacons → bandRadio → v2FlavorRuntime → longBerth → onboarding → masslineHud → massSeedHud → fieldHud → gyreHud → planetHud → miningHud → survivalHud → swarmJuiceHud → crucibleFocus → sectorPostcard → dockDenyBanner → stationBroadcast → hazardHints → noFireAdvisory → bulkHaulTag → dangerGradient → causeLedger → customsPrompt → impoundPayPrompt → warrantOfferPrompt → moralTrapPrompt → wreckChoicePrompt → stuckTowPrompt → deedRecord → historyWear → cargoConscience → securityReadoutSystem → priceForecastSystem → contractClausesSystem → moralTrapSystem → mail → worldClock → worldPressure → lineProgression → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → autoTargetAssist → flybyFocus → bulletTime → cloak → lawSecurity → scanner → spectrum → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → factionPresence → nemesis → nemesisEncounter → capitalBossEncounters → kilnback → mothlight → palletJack → secondRinse → ai → barkDirector → aiEncounter → actions → beacons → travelLanes → orbitalGallery → kineticLeague → flight → cruise → redKite → ilexArk → aiPorts → tumbleStates → collisionConsequences → stuntGrammar → weapons → countermeasures → bombs → emergentPrimitives → environmentMaterials → impulseCharges → hullBurst → mines → massSeed → uniqueLootAbilities → dockingCorridor → environmentalMachinery → survivalArena → fields → gyreSnare → planetRuntime → morrow → vesper → bracket → ravel → solstice → rubric → ruckus → ruud → physics → reactiveMatter → latchNine → combat → combatOutcome → aftermathWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → shipjack → custodyConsequences → mercyService → wreckCourt → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → volatileExposure → mining → fieldDepletion → cargo → fragileCargo → automation → asteroidSites → asteroidFormations → wingmen → crafting → economy → intervention → world → heistFacilities → regionalEcology → tensionDirector → encounterDirector → rockCore → scissorwake → routeFollower → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationServices → difficultyDirector → gateControlDirector → salvage → tallyThree → lastShift → sableVenn → lossInvestigation → salvageActions → survivorPod → recoveryEncounter → factions → massSignature → faction_concord → faction_meridian → faction_helix → faction_drift → understoryGardens → fulfillmentRoutes → pitbornCull → vaelLiens → archiveRedaction → choirResonance → vergeCourt → frontierHomesteads → sectorSim → towlineTable → borrowedVoice → npcJobsRuntime → missions → careerOrigins → careerLadders → liveCareerLadderBranches → story → scenarioRuntime → swarmArena → survivalWave → survivalRun → swarmChain → killReplay → killcamRecorder → swarmJuice → swarmElites → heat → traffic → drill → claims → chronicler → longBerth → bandRadio → onboarding → masslineHud → massSeedHud → fieldHud → gyreHud → planetHud → miningHud → survivalHud → swarmJuiceHud → crucibleFocus → noFireAdvisory → moralTrapSystem → voiceArbiter → mail → worldClock → worldPressure → lineProgression → save
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 2473 | 1 | 2 | `input:worldGestureCancelled`×1 |
| `autoTargetAssist` | `systems/autoTargetAssist.js` | 294 | 0 | 5 | — |
| `flybyFocus` | `systems/flybyFocus.js` | 525 | 5 | 1 | `flybyFocus:cancel`×1, `flybyFocus:end`×1, `flybyFocus:start`×1 |
| `bulletTime` | `systems/bulletTime.js` | 417 | 6 | 2 | `audio:cue`×3, `bulletTime:start`×1, `bulletTime:end`×1 |
| `cloak` | `systems/cloak.js` | 376 | 5 | 6 | `audio:cue`×2, `cloak:engaged`×1, `cloak:dropped`×1 |
| `lawSecurity` | `systems/lawSecurity.js` | 7699 | 0 | 31 | — |
| `scanner` | `systems/scanner.js` | 2297 | 28 | 13 | `ui:setCourse`×3, `signal:tracked`×2, `contactHail:response`×2 |
| `spectrum` | `systems/spectrum/index.js` | 332 | 4 | 0 | `signal:scanResults`×2, `signal:investigating`×1, `spectrum:resolved`×1 |
| `scanReveal` | `systems/scanReveal.js` | 1548 | 7 | 1 | `economy:grantCredits`×2, `scan:shipRevealed`×1, `scan:capabilityVerdicts`×1 |
| `buildIdentity` | `systems/buildIdentity.js` | 355 | 1 | 2 | `buildIdentity:revealed`×1 |
| `pirateDisguise` | `systems/pirateDisguise.js` | 257 | 0 | 3 | — |
| `pirateParley` | `systems/pirateParley.js` | 1114 | 1 | 1 | `economy:chargeCredits`×1 |
| `pirateDisengage` | `systems/pirateDisengage.js` | 767 | 0 | 0 | — |
| `aceMemory` | `systems/aceMemory.js` | 2523 | 0 | 0 | — |
| `factionPresence` | `systems/factionPresence.js` | 1928 | 25 | 18 | `presentation:caption`×5, `comms:popup`×4, `factionPresence:spawned`×3 |
| `nemesis` | `systems/nemesis.js` | 569 | 0 | 0 | — |
| `nemesisEncounter` | `systems/nemesisEncounter.js` | 9 | 0 | 0 | — |
| `capitalBossEncounters` | `systems/capitalBossEncounters.js` | 271 | 3 | 0 | `capitalBoss:telegraphEnd`×2, `combat:routeDamage`×1 |
| `kilnback` | `systems/kilnback.js` | 401 | 4 | 0 | `kilnback:caskReleased`×1, `kilnback:coolantReleased`×1, `kilnback:caskSalvaged`×1 |
| `mothlight` | `systems/mothlight.js` | 339 | 3 | 0 | `mothlight:lampReleased`×1, `mothlight:phase`×1, `mothlight:identified`×1 |
| `palletJack` | `systems/palletJack.js` | 489 | 5 | 0 | `palletJack:phase`×1, `palletJack:released`×1, `palletJack:offer`×1 |
| `secondRinse` | `systems/secondRinse.js` | 274 | 0 | 0 | — |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 1443 | 5 | 0 | `ai:telegraph`×3, `ai:doctrinePhase`×1, `audio:cue`×1 |
| `barkDirector` | `systems/barkDirector.js` | 3400 | 6 | 52 | `npc:hailed`×3, `audio:cue`×2, `barkDirector:voice`×1 |
| `aiEncounter` | `systems/aiEncounter.js` | 856 | 0 | 6 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 284 | 5 | 2 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `travelLanes` | `systems/travelLanes.js` | 1606 | 0 | 2 | — |
| `orbitalGallery` | `gallery/orbital/system.js` | 151 | 0 | 0 | — |
| `kineticLeague` | `sports/kineticLeague/live.js` | 277 | 0 | 0 | — |
| `flight` | `systems/flightV3.js` (+ legacy) | 2358 | 10 | 11 | `ship:boostStop`×2, `ship:boostStart`×1, `ship:boostPreKick`×1 |
| `cruise` | `systems/cruise.js` | 330 | 6 | 5 | `cruise:wrestleStarted`×1, `cruise:engaged`×1, `cruise:wrestleEscaped`×1 |
| `redKite` | `systems/redKite.js` | 318 | 5 | 0 | `ui:setCourse`×1, `redKite:offer`×1, `redKite:started`×1 |
| `ilexArk` | `systems/ilexArk.js` | 256 | 6 | 0 | `ui:setCourse`×1, `ilexArk:vaultReleased`×1, `ilexArk:accepted`×1 |
| `aiPorts` | `systems/aiPorts.js` | 2102 | 2 | 0 | `ai:encounterCommand`×1, `cloak:faded`×1 |
| `tumbleStates` | `systems/tumbleStates.js` | 823 | 11 | 7 | `audio:cue`×2, `presentation:vfxCue`×2, `massline:recovered`×1 |
| `collisionConsequences` | `systems/collisionConsequences.js` | 972 | 2 | 7 | `combat:collisionConsequence`×1, `combat:collisionDebris`×1 |
| `stuntGrammar` | `systems/stuntGrammar.js` | 307 | 7 | 0 | `stunt:styleBanked`×1, `faction:repDelta`×1, `stunt:salvageRights`×1 |
| `weapons` | `systems/weapons.js` | 3317 | 22 | 0 | `combat:fire`×4, `presentation:vfxCue`×3, `weapons:vent`×2 |
| `countermeasures` | `systems/countermeasures.js` | 905 | 5 | 3 | `audio:cue`×2, `pds:intercept`×1, `countermeasure:deployed`×1 |
| `bombs` | `systems/bombs.js` | 1790 | 35 | 14 | `bombs:denied`×8, `economy:chargeCredits`×4, `bombs:cycle`×3 |
| `emergentPrimitives` | `systems/emergentPrimitives.js` | 1199 | 2 | 0 | `emergent:audio`×1, `emergent:contact`×1 |
| `environmentMaterials` | `systems/environmentMaterials.js` | 347 | 2 | 1 | `emergent:audio`×1, `asteroid:chunked`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 1610 | 24 | 6 | `audio:cue`×5, `charge:detonated`×4, `chain:slam`×2 |
| `hullBurst` | `systems/hullBurst.js` | 627 | 17 | 0 | `audio:cue`×5, `presentation:vfxCue`×5, `hullBurst:hit`×3 |
| `mines` | `systems/mines.js` | 406 | 10 | 6 | `mines:armed`×2, `mines:capReached`×1, `voice:say`×1 |
| `massSeed` | `systems/massSeed.js` | 683 | 23 | 4 | `presentation:vfxCue`×4, `massSeed:collapsing`×4, `massSeed:collapsed`×4 |
| `uniqueLootAbilities` | `systems/uniqueLootAbilities.js` | 589 | 3 | 5 | `uniqueLoot:paleCoilBlink`×1, `uniqueLoot:nestbreakerSplit`×1, `uniqueLoot:choirBellPulse`×1 |
| `dockingCorridor` | `systems/dockingCorridor.js` | 343 | 0 | 4 | — |
| `environmentalMachinery` | `systems/environmentalMachinery.js` | 1748 | 13 | 8 | `environmentalMachinery:ensureAnvil`×2, `weather:ionBlackout`×2, `sector:physicalLaw`×1 |
| `survivalArena` | `systems/survivalArena.js` | 1922 | 4 | 9 | `survivalArena:rosterPrewarm`×1, `mines:placeRequest`×1, `encounter:telegraph`×1 |
| `fields` | `systems/fields.js` | 3440 | 35 | 15 | `fields:deployed`×6, `audio:cue`×4, `fields:ended`×4 |
| `gyreSnare` | `systems/gyreSnare.js` | 2977 | 28 | 0 | `audio:cue`×23, `camera:shake`×5 |
| `planetRuntime` | `systems/planetRuntime.js` | 941 | 12 | 3 | `planet:plungeStage`×2, `planet:registered`×1, `planet:unregistered`×1 |
| `morrow` | `systems/morrow.js` | 364 | 5 | 0 | `morrow:voice`×1, `audio:cue`×1, `morrow:met`×1 |
| `vesper` | `systems/vesper.js` | 320 | 7 | 0 | `vesper:voice`×1, `vesper:met`×1, `audio:cue`×1 |
| `bracket` | `systems/bracket.js` | 327 | 7 | 0 | `bracket:voice`×1, `audio:cue`×1, `bracket:matchStarted`×1 |
| `ravel` | `systems/ravel.js` | 288 | 8 | 0 | `ravel:voice`×1, `audio:cue`×1, `ravel:telegraph`×1 |
| `solstice` | `systems/solstice.js` | 601 | 5 | 0 | `solstice:voice`×1, `audio:cue`×1, `solstice:destroyed`×1 |
| `rubric` | `systems/rubric.js` | 649 | 5 | 0 | `rubric:voice`×1, `audio:cue`×1, `rubric:destroyed`×1 |
| `ruckus` | `systems/ruckus.js` | 322 | 6 | 0 | `save:dirty`×1, `ruckus:voice`×1, `audio:cue`×1 |
| `ruud` | `systems/ruud.js` | 535 | 5 | 0 | `audio:cue`×2, `ruud:voice`×1, `ruud:spared`×1 |
| `physics` | `core/physics.js` | 2606 | 9 | 3 | `projectile:hit`×2, `dock:range`×2, `gate:range`×2 |
| `reactiveMatter` | `systems/reactiveMatter.js` | 706 | 0 | 3 | — |
| `latchNine` | `systems/latchNine.js` | 150 | 0 | 0 | — |
| `combat` | `systems/combat.js` | 1822 | 20 | 10 | `camera:shake`×3, `economy:grantCredits`×3, `player:death`×2 |
| `combatOutcome` | `systems/combatOutcome.js` | 637 | 6 | 20 | `combat:aftermathChoices`×3, `combat:aftermathChosen`×1, `combat:outcome`×1 |
| `aftermathWrecks` | `systems/aftermathWrecks.js` | 3011 | 22 | 23 | `news:headline`×2, `news:publish`×2, `aftermath:causeRecorded`×1 |
| `titles` | `systems/titles.js` | 1268 | 0 | 13 | — |
| `wingMorale` | `systems/wingMorale.js` | 442 | 5 | 3 | `ai:formationBroken`×1, `wingMorale:broken`×1, `ai:flee`×1 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 4571 | 54 | 15 | `tether:latchDenied`×8, `tether:releaseRated`×5, `tether:broke`×4 |
| `surrenderRecovery` | `systems/surrenderRecovery.js` | 1648 | 0 | 16 | — |
| `shipjack` | `systems/shipjack.js` | 482 | 15 | 0 | `save:dirty`×1, `comms:log`×1, `shipjack:cue`×1 |
| `custodyConsequences` | `systems/custodyConsequences.js` | 635 | 0 | 5 | — |
| `mercyService` | `response/mercyService/live.js` | 335 | 8 | 0 | `mercyService:toolResult`×1, `mercyService:started`×1, `mission:offered`×1 |
| `wreckCourt` | `systems/wreckCourt.js` | 1081 | 8 | 0 | `wreckCourt:result`×1, `wreckCourt:opened`×1, `economy:grantCredits`×1 |
| `masslineTelemetry` | `systems/masslineTelemetry.js` | 658 | 3 | 3 | `tether:massWeighed`×1, `tether:reelPump`×1, `tether:snapCatch`×1 |
| `masslineThreats` | `systems/masslineThreats.js` | 400 | 1 | 0 | `massline:threat`×1 |
| `masslineImpacts` | `systems/masslineImpacts.js` | 530 | 2 | 0 | `tether:whipImpact`×1, `massline:sweepImpact`×1 |
| `masslineSnares` | `systems/masslineSnares.js` | 896 | 8 | 5 | `massline:snareDeployed`×2, `massline:snareArmed`×1, `ai:telegraph`×1 |
| `masslineThrow` | `systems/masslineThrow.js` | 877 | 9 | 4 | `audio:cue`×3, `massline:releaseCancelled`×1, `massline:releaseWindow`×1 |
| `masslineImpactDamage` | `systems/masslineImpactDamage.js` | 144 | 0 | 3 | — |
| `lootShards` | `systems/lootShards.js` | 1258 | 8 | 4 | `cargo:volatileSlam`×2, `loot:magnetCaptured`×1, `cargo:caughtByNet`×1 |
| `terrainAnchors` | `systems/terrainAnchors.js` | 456 | 1 | 6 | `terrainAnchors:replenished`×1 |
| `jettisonImpulse` | `systems/jettisonImpulse.js` | 95 | 1 | 1 | `audio:cue`×1 |
| `volatileExposure` | `systems/volatileExposure.js` | 575 | 7 | 4 | `presentation:vfxCue`×2, `audio:cue`×2, `cargo:volatileExposed`×1 |
| `mining` | `systems/mining.js` | 3530 | 52 | 10 | `beam:denied`×6, `mining:yield`×5, `mining:start`×4 |
| `fieldDepletion` | `systems/fieldDepletion.js` | 921 | 3 | 3 | `field:richSeamMissed`×1, `fieldDepletion:changed`×1, `field:depletedChanged`×1 |
| `cargo` | `systems/cargo.js` | 1436 | 16 | 0 | `cargo:full`×2, `salvage:changed`×2, `audio:cue`×2 |
| `fragileCargo` | `systems/fragileCargo.js` | 353 | 1 | 2 | `cargo:fragileLost`×1 |
| `automation` | `systems/automation.js` | 4026 | 44 | 10 | `automation:offlineSummary`×5, `economy:chargeCredits`×4, `economy:applyTradePressure`×3 |
| `asteroidSites` | `systems/asteroidSites.js` | 3590 | 30 | 20 | `site:laneSpilled`×2, `presentation:caption`×2, `siteEvidence:result`×1 |
| `asteroidFormations` | `systems/asteroidFormations.js` | 317 | 1 | 3 | `formation:discovered`×1 |
| `wingmen` | `systems/wingmen.js` | 845 | 2 | 8 | `combat:hitAsset`×1, `wingOrder:converted`×1 |
| `crafting` | `systems/crafting.js` | 485 | 10 | 0 | `craft:queueChanged`×4, `audio:cue`×3, `craft:complete`×2 |
| `economy` | `systems/economy.js` | 6534 | 60 | 42 | `service:completed`×8, `faction:repDelta`×3, `fuel:changed`×3 |
| `intervention` | `systems/intervention.js` | 588 | 5 | 2 | `intervention:logged`×1, `camera:shake`×1, `intervention:available`×1 |
| `world` | `systems/world.js` | 7829 | 87 | 61 | `poi:discovered`×5, `discovery:plateUnlocked`×4, `world:residency`×3 |
| `heistFacilities` | `systems/heistFacilities.js` | 3926 | 23 | 8 | `heist:launchScheduleReceipt`×4, `heist:counterweightSceneReceipt`×4, `heist:launchCue`×2 |
| `regionalEcology` | `systems/regionalEcology.js` | 454 | 0 | 0 | — |
| `tensionDirector` | `systems/tensionDirector.js` | 296 | 0 | 0 | — |
| `encounterDirector` | `systems/encounterDirector.js` | 5516 | 32 | 42 | `encounter:resolved`×2, `economy:applyTradePressure`×2, `encounter:stale`×1 |
| `rockCore` | `systems/rockCore.js` | 271 | 0 | 4 | — |
| `scissorwake` | `systems/scissorwake.js` | 118 | 0 | 3 | — |
| `routeFollower` | `systems/routeFollower.js` | 1072 | 1 | 9 | `nav:engageRoute`×1 |
| `livingPoiBehaviors` | `systems/livingPoiBehaviors.js` | 938 | 0 | 0 | — |
| `pirateRumor` | `systems/pirateRumor.js` | 678 | 0 | 0 | — |
| `ambushSignatures` | `systems/ambushSignatures.js` | 236 | 0 | 0 | — |
| `bountyHunt` | `systems/bountyHunt.js` | 1269 | 0 | 0 | — |
| `stationSideEventDirector` | `systems/stationSideEventDirector.js` | 450 | 1 | 4 | `station:sideEvent`×1 |
| `stationServices` | `systems/stationServices.js` | 908 | 15 | 5 | `fuel:changed`×3, `service:completed`×2, `service:aborted`×1 |
| `difficultyDirector` | `systems/difficultyDirector.js` | 476 | 2 | 5 | `difficulty:pinReleased`×1, `difficulty:stanceChanged`×1 |
| `gateControlDirector` | `systems/gateControlDirector.js` | 349 | 2 | 8 | `economy:chargeCredits`×1, `gate:verdict`×1 |
| `salvage` | `systems/salvage.js` | 1574 | 16 | 7 | `comms:log`×5, `audio:cue`×3, `salvage:placed`×1 |
| `tallyThree` | `systems/tallyThree.js` | 142 | 1 | 0 | `ui:setCourse`×1 |
| `lastShift` | `systems/lastShift.js` | 255 | 4 | 0 | `lastShift:offer`×1, `news:headline`×1, `lastShift:archived`×1 |
| `sableVenn` | `systems/sableVenn.js` | 80 | 0 | 0 | — |
| `lossInvestigation` | `systems/lossInvestigation.js` | 408 | 3 | 7 | `lossInvestigation:promoted`×1, `mission:offered`×1, `lossInvestigation:closed`×1 |
| `salvageActions` | `systems/salvageActions.js` | 771 | 13 | 8 | `entity:spawnRequest`×2, `presentation:cue`×2, `combat:hit`×2 |
| `survivorPod` | `systems/survivorPod.js` | 1648 | 14 | 12 | `survivorPod:ejected`×2, `faction:repDelta`×2, `economy:grantCredits`×2 |
| `recoveryEncounter` | `systems/recoveryEncounter.js` | 821 | 0 | 0 | — |
| `factions` | `systems/factions.js` | 1148 | 13 | 19 | `faction:repChanged`×3, `faction:aggro`×3, `comms:log`×1 |
| `massSignature` | `systems/massSignature.js` | 182 | 3 | 0 | `sensors:signatureLost`×2, `sensors:signatureResolved`×1 |
| `faction_concord` | `systems/faction_concord.js` | 254 | 5 | 0 | `concord:formationLocked`×1, `comms:log`×1, `concord:formationReformed`×1 |
| `faction_meridian` | `systems/faction_meridian.js` | 178 | 4 | 0 | `meridian:couplerSnapped`×1, `comms:log`×1, `meridian:containerRecoupled`×1 |
| `faction_helix` | `systems/faction_helix.js` | 179 | 5 | 0 | `comms:log`×2, `helix:flagsDropped`×1, `helix:lienFiled`×1 |
| `faction_drift` | `systems/faction_drift.js` | 136 | 3 | 0 | `drift:claimLifted`×1, `drift:claimStaked`×1, `drift:claimContested`×1 |
| `understoryGardens` | `systems/faction_understory.js` | 302 | 9 | 1 | `comms:log`×2, `understory:gardenSeeded`×1, `understory:gardenFed`×1 |
| `fulfillmentRoutes` | `systems/faction_fulfillment.js` | 374 | 15 | 0 | `comms:log`×8, `fulfillment:derailed`×1, `fulfillment:rerailed`×1 |
| `pitbornCull` | `systems/faction_pitborn.js` | 302 | 17 | 1 | `comms:log`×6, `pitborn:crowdStyle`×1, `pitborn:crowdTier`×1 |
| `vaelLiens` | `systems/faction_vael.js` | 284 | 16 | 0 | `comms:log`×6, `vael:pageNineArmed`×1, `vael:lienTelegraph`×1 |
| `archiveRedaction` | `systems/faction_archive.js` | 222 | 8 | 0 | `comms:log`×4, `archive:redacted`×1, `archive:redactionLifted`×1 |
| `choirResonance` | `systems/faction_choir.js` | 229 | 11 | 0 | `comms:log`×4, `choir:bellPulse`×1, `choir:crystalShattered`×1 |
| `vergeCourt` | `systems/faction_verge.js` | 239 | 15 | 0 | `comms:log`×7, `verge:directive`×1, `verge:directiveViolated`×1 |
| `frontierHomesteads` | `systems/faction_frontier.js` | 223 | 9 | 0 | `comms:log`×4, `frontier:moduleSnapped`×1, `frontier:trafficTick`×1 |
| `sectorSim` | `systems/sectorSim.js` | 1253 | 10 | 17 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `towlineTable` | `systems/towlineTable.js` | 306 | 6 | 0 | `ui:setCourse`×1, `towlineTable:cleanupAccepted`×1, `towlineTable:assistAccepted`×1 |
| `borrowedVoice` | `systems/borrowedVoice.js` | 194 | 3 | 0 | `borrowedVoice:fragmentRecovered`×1, `borrowedVoice:offer`×1, `borrowedVoice:dispositionAccepted`×1 |
| `npcJobsRuntime` | `systems/npcJobsRuntime.js` | 6762 | 26 | 18 | `npcJobs:towAssistLost`×3, `npcjobs:loadEmpty`×2, `economy:chargeCredits`×2 |
| `missions` | `systems/missions.js` | 6299 | 70 | 85 | `mission:updated`×25, `nav:waypoint`×4, `cargo:delivered`×4 |
| `careerOrigins` | `careers/origins/careerOrigins.js` | 1329 | 0 | 0 | — |
| `careerLadders` | `careers/ladders/careerLadders.js` | 348 | 0 | 0 | — |
| `liveCareerLadderBranches` | `careers/ladders/liveCareerLadderBranches.js` | 206 | 0 | 0 | — |
| `story` | `systems/story.js` | 2725 | 50 | 53 | `graffiti:show`×6, `hud:phase`×4, `endgame:ineligible`×4 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 852 | 9 | 5 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `swarmArena` | `systems/swarmArena.js` | 1841 | 0 | 7 | — |
| `survivalWave` | `systems/survivalWave.js` | 1645 | 0 | 8 | — |
| `survivalRun` | `systems/survivalRun.js` | 735 | 1 | 13 | `run:transitionRequested`×1 |
| `swarmChain` | `systems/swarmChain.js` | 373 | 0 | 3 | — |
| `killReplay` | `systems/killReplay.js` | 406 | 0 | 3 | — |
| `killcamRecorder` | `sim/killcamTape.js` | 561 | 0 | 6 | — |
| `swarmJuice` | `systems/swarmJuice.js` | 656 | 0 | 10 | — |
| `swarmElites` | `systems/swarmElites.js` | 591 | 0 | 7 | — |
| `heat` | `systems/heat.js` | 948 | 3 | 14 | `bounty:cooled`×1, `survivorPod:heatCooled`×1, `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 4600 | 2 | 43 | `traffic:vesselRelinquished`×1, `field:richSeamMissed`×1 |
| `drill` | `systems/drill.js` | 2607 | 46 | 1 | `drill:warn`×12, `drill:rockDepleted`×4, `drill:break`×4 |
| `claims` | `systems/claims.js` | 3505 | 52 | 14 | `audio:cue`×6, `economy:chargeCredits`×4, `news:publish`×4 |
| `chronicler` | `systems/chronicler.js` | 480 | 0 | 0 | — |
| `longBerth` | `systems/longBerth.js` | 264 | 4 | 4 | `longBerth:claimOffer`×1, `longBerth:restoreOffer`×1, `economy:chargeCredits`×1 |
| `bandRadio` | `systems/bandRadio.js` | 846 | 4 | 0 | `band:bearingRequest`×1, `band:bearingReceipt`×1, `band:status`×1 |
| `onboarding` | `systems/onboarding.js` | 4471 | 24 | 89 | `onboarding:rangePrompt`×3, `rescue:beat`×2, `hud:firstUse`×1 |
| `masslineHud` | `ui/masslineHud.js` | 2488 | 0 | 5 | — |
| `massSeedHud` | `ui/massSeedHud.js` | 381 | 0 | 0 | — |
| `fieldHud` | `ui/fieldHud.js` | 334 | 0 | 0 | — |
| `gyreHud` | `ui/gyreHud.js` | 472 | 0 | 0 | — |
| `planetHud` | `ui/planetHud.js` | 193 | 0 | 0 | — |
| `miningHud` | `ui/miningHud.js` | 600 | 0 | 8 | — |
| `survivalHud` | `ui/survivalHud.js` | 923 | 0 | 9 | — |
| `swarmJuiceHud` | `ui/swarmJuiceHud.js` | 633 | 0 | 14 | — |
| `crucibleFocus` | `ui/crucibleFocus.js` | 196 | 2 | 0 | `camera:zoom`×2 |
| `noFireAdvisory` | `data/stationBubbles.js` | 251 | 0 | 1 | — |
| `moralTrapSystem` | *(not found)* | — | — | — | — |
| `voiceArbiter` | `ui/voiceArbiter.js` | 1039 | 5 | 6 | `voice:clear`×2, `voice:surface`×2, `barkDirector:voice`×1 |
| `mail` | `systems/mail.js` | 215 | 2 | 0 | `comms:popup`×1, `mail:delivered`×1 |
| `worldClock` | `systems/worldClock.js` | 221 | 6 | 0 | `calendar:stormSeason`×1, `calendar:festival`×1, `calendar:marketDay`×1 |
| `worldPressure` | `systems/worldPressure.js` | 454 | 13 | 0 | `sectorsim:impulse`×2, `comms:log`×2, `worldPressure:tideChanged`×1 |
| `lineProgression` | `systems/lineProgression.js` | 213 | 2 | 3 | `line:recordStamped`×1, `line:classChanged`×1 |
| `save` | `save/saveSystem.js` | 9827 | 62 | 30 | `save:error`×35, `mode:changed`×4, `save:started`×3 |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
