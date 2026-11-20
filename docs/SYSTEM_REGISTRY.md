# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative order is `src/runtime/authoritativeSystemManifest.js` (materialized by
> `src/core/registry.js`); this is a navigable projection of it.
>
> Generated: 2026-11-20. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → runSession → survivalWave → survivalRewards → survivalDraft → survivalResults → killReplay → chainKills → killcamRecorder → survivalAnnounce → survivalArena → swarmArena → swarmFortify → swarmSupply → swarmDrops → swarmChain → swarmJuice → swarmElites → swarmCourseTwists → survivalRun → voiceArbiter → input → autoTargetAssist → flybyFocus → bulletTime → cloak → scanner → spectrum → scanReveal → buildIdentity → lawSecurity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → barkDirector → ai → dockingCorridor → physics → latchNine → aiPorts → reactiveMatter → orbitalGallery → kineticLeague → tumbleStates → collisionConsequences → stuntGrammar → aiEncounter → actions → heroManeuvers → flight → cruise → weapons → countermeasures → impulseCharges → hullBurst → mines → bombs → emergentPrimitives → environmentMaterials → massSeed → uniqueLootAbilities → fields → stormChase → gyreSnare → shieldPylons → environmentalMachinery → planetRuntime → combat → combatOutcome → aftermathWrecks → dyingHull → capitalBossEncounters → uniqueWrecks → titles → wingMorale → tetherGameplay → surrenderRecovery → shipjack → custodyConsequences → mercyService → wreckCourt → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → understoryGardens → fulfillmentRoutes → pitbornCull → vaelLiens → archiveRedaction → choirResonance → vergeCourt → frontierHomesteads → terrainAnchors → jettisonImpulse → volatileExposure → mining → fieldDepletion → cargo → fragileCargo → moistureLoss → economy → automation → asteroidSites → industrialDisasters → asteroidFormations → wingmen → intervention → lossLedger → provenanceLedger → chronicler → factionPresence → spawnBudget → world → heistFacilities → regionalEcology → tensionDirector → derelictExpedition → encounterDirector → convoyRaid → towjaw → kineticCatalysts → rockCore → scissorwake → nemesis → nemesisEncounter → nemesisSignals → routeFollower → travelLanes → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationContacts → stationContactLoadBoundary → stationServices → difficultyDirector → gateControlDirector → morrow → vesper → bracket → ravel → solstice → rubric → ruckus → ruud → docket → wexTicket → salvage → tallyThree → lastShift → lastShiftPrompt → redKite → redKitePrompt → sableVenn → ilexArk → ilexArkPrompt → kilnback → mothlight → mothlightPrompt → palletJack → palletJackPrompt → secondRinse → lossInvestigation → salvageActions → survivorPod → rookBooth → kesslerScale → furnaceIntake → gateThreeWeir → slateColumn → bouncer → receipt → mop → tallyho → tare → lamplighter → shepherd12 → quill → holdfast → bellhop → gravedigger → recoveryEncounter → factions → massSignature → faction_concord → faction_meridian → faction_helix → faction_drift → lineHeads → sectorSim → towlineTable → towlineTablePrompt → shipbreakingYard → shipbreakingYardBrowser → rigWorkshop → salvageTender → salvageTenderPrompt → cinderglassJob → cinderglassJobPrompt → counterweightCircuit → counterweightCircuitPrompt → breakwaterSpur → breakwaterSpurPrompt → borrowedSun → borrowedSunPrompt → borrowedVoice → borrowedVoicePrompt → salvageOutfits → salvageOutfitsPrompt → npcJobsRuntime → careerOrigins → careerLadders → liveCareerLadderBranches → missions → careerContracts → economyContracts → postEndingReplay → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → varianceAdjustmentBerth → drill → claims → beacons → bandRadio → plants → v2FlavorRuntime → longBerth → crew → onboarding → masslineHud → massSeedHud → fieldHud → gyreHud → pylonHud → planetHud → miningHud → survivalHud → swarmJuiceHud → crucibleFocus → sectorPostcard → sectorArrivalPlate → dockDenyBanner → stationBroadcast → hazardHints → noFireAdvisory → bulkHaulTag → dangerGradient → causeLedger → customsPrompt → impoundPayPrompt → warrantOfferPrompt → moralTrapPrompt → wreckChoicePrompt → stuckTowPrompt → deedRecord → historyWear → cargoConscience → securityReadoutSystem → priceForecastSystem → contractClausesSystem → moralTrapSystem → moralMemory → special500 → special500Spectacle → special500Question → special500Invoice → special500PortraitBuoys → special500Sommelier → special500DockLedger → special500HullLog → special500ReadEverything → special500CollectiveHours → special500Confessional → special500DeathBell → special500ForgeKaraoke → mail → worldClock → worldPressure → lineProgression → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → autoTargetAssist → flybyFocus → bulletTime → cloak → lawSecurity → scanner → spectrum → scanReveal → buildIdentity → pirateDisguise → pirateParley → pirateDisengage → aceMemory → factionPresence → nemesis → nemesisEncounter → capitalBossEncounters → kilnback → mothlight → palletJack → secondRinse → ai → barkDirector → aiEncounter → actions → beacons → travelLanes → orbitalGallery → kineticLeague → heroManeuvers → flight → cruise → redKite → ilexArk → aiPorts → tumbleStates → collisionConsequences → stuntGrammar → weapons → countermeasures → bombs → emergentPrimitives → environmentMaterials → impulseCharges → hullBurst → mines → massSeed → uniqueLootAbilities → dockingCorridor → environmentalMachinery → survivalArena → swarmFortify → fields → stormChase → gyreSnare → shieldPylons → planetRuntime → morrow → vesper → bracket → ravel → solstice → rubric → ruckus → ruud → docket → industrialDisasters → salvageTender → convoyRaid → towjaw → derelictExpedition → kineticCatalysts → physics → reactiveMatter → latchNine → combat → combatOutcome → aftermathWrecks → dyingHull → titles → wingMorale → tetherGameplay → surrenderRecovery → shipjack → custodyConsequences → mercyService → wreckCourt → masslineTelemetry → masslineThreats → masslineImpacts → masslineSnares → masslineThrow → masslineImpactDamage → lootShards → terrainAnchors → jettisonImpulse → lineHeads → volatileExposure → mining → fieldDepletion → cargo → fragileCargo → moistureLoss → automation → asteroidSites → asteroidFormations → wingmen → crafting → economy → intervention → world → heistFacilities → regionalEcology → tensionDirector → encounterDirector → rockCore → scissorwake → routeFollower → livingPoiBehaviors → pirateRumor → ambushSignatures → bountyHunt → stationSideEventDirector → stationServices → difficultyDirector → gateControlDirector → salvage → tallyThree → lastShift → sableVenn → lossInvestigation → salvageActions → survivorPod → rookBooth → kesslerScale → furnaceIntake → gateThreeWeir → slateColumn → bouncer → receipt → mop → tallyho → tare → lamplighter → shepherd12 → quill → holdfast → bellhop → gravedigger → recoveryEncounter → factions → massSignature → faction_concord → faction_meridian → faction_helix → faction_drift → understoryGardens → fulfillmentRoutes → pitbornCull → vaelLiens → archiveRedaction → choirResonance → vergeCourt → frontierHomesteads → sectorSim → towlineTable → shipbreakingYard → rigWorkshop → counterweightCircuit → breakwaterSpur → borrowedVoice → borrowedSun → salvageOutfits → npcJobsRuntime → cinderglassJob → missions → careerOrigins → careerLadders → liveCareerLadderBranches → story → scenarioRuntime → swarmArena → survivalWave → swarmCourseTwists → survivalRun → swarmChain → killReplay → killcamRecorder → swarmJuice → swarmElites → swarmDrops → heat → traffic → drill → claims → chronicler → longBerth → crew → bandRadio → plants → onboarding → masslineHud → massSeedHud → fieldHud → gyreHud → pylonHud → planetHud → miningHud → survivalHud → swarmJuiceHud → crucibleFocus → noFireAdvisory → moralTrapSystem → moralMemory → special500 → special500Spectacle → special500Question → special500Invoice → special500PortraitBuoys → special500Sommelier → special500CollectiveHours → voiceArbiter → mail → worldClock → worldPressure → lineProgression → save
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 2776 | 2 | 4 | `drill:beginRejected`×1, `input:worldGestureCancelled`×1 |
| `autoTargetAssist` | `systems/autoTargetAssist.js` | 294 | 0 | 5 | — |
| `flybyFocus` | `systems/flybyFocus.js` | 566 | 5 | 2 | `flybyFocus:cancel`×1, `flybyFocus:end`×1, `flybyFocus:start`×1 |
| `bulletTime` | `systems/bulletTime.js` | 413 | 6 | 2 | `audio:cue`×3, `bulletTime:start`×1, `bulletTime:end`×1 |
| `cloak` | `systems/cloak.js` | 415 | 5 | 9 | `audio:cue`×2, `cloak:engaged`×1, `cloak:dropped`×1 |
| `lawSecurity` | `systems/lawSecurity.js` | 8973 | 0 | 33 | — |
| `scanner` | `systems/scanner.js` | 2443 | 39 | 16 | `contactHail:clear`×6, `ui:setCourse`×4, `contactHail:response`×3 |
| `spectrum` | `systems/spectrum/index.js` | 332 | 4 | 0 | `signal:scanResults`×2, `signal:investigating`×1, `spectrum:resolved`×1 |
| `scanReveal` | `systems/scanReveal.js` | 1626 | 8 | 3 | `economy:grantCredits`×2, `scan:shipRevealed`×1, `scan:capabilityVerdicts`×1 |
| `buildIdentity` | `systems/buildIdentity.js` | 355 | 1 | 2 | `buildIdentity:revealed`×1 |
| `pirateDisguise` | `systems/pirateDisguise.js` | 1476 | 0 | 6 | — |
| `pirateParley` | `systems/pirateParley.js` | 1114 | 1 | 1 | `economy:chargeCredits`×1 |
| `pirateDisengage` | `systems/pirateDisengage.js` | 797 | 0 | 0 | — |
| `aceMemory` | `systems/aceMemory.js` | 2535 | 0 | 0 | — |
| `factionPresence` | `systems/factionPresence.js` | 1917 | 25 | 18 | `presentation:caption`×5, `comms:popup`×4, `factionPresence:spawned`×3 |
| `nemesis` | `systems/nemesis.js` | 569 | 0 | 0 | — |
| `nemesisEncounter` | `systems/nemesisEncounter.js` | 9 | 0 | 0 | — |
| `capitalBossEncounters` | `systems/capitalBossEncounters.js` | 712 | 6 | 0 | `capitalBoss:telegraphEnd`×3, `combat:routeDamage`×1, `capitalBoss:plateTorn`×1 |
| `kilnback` | `systems/kilnback.js` | 462 | 4 | 0 | `kilnback:caskReleased`×1, `kilnback:coolantReleased`×1, `kilnback:caskSalvaged`×1 |
| `mothlight` | `systems/mothlight.js` | 339 | 3 | 0 | `mothlight:lampReleased`×1, `mothlight:phase`×1, `mothlight:identified`×1 |
| `palletJack` | `systems/palletJack.js` | 533 | 5 | 0 | `palletJack:phase`×1, `palletJack:released`×1, `palletJack:offer`×1 |
| `secondRinse` | `systems/secondRinse.js` | 282 | 0 | 0 | — |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 1824 | 8 | 0 | `ai:telegraph`×4, `ai:doctrinePhase`×2, `ai:flee`×1 |
| `barkDirector` | `systems/barkDirector.js` | 4304 | 6 | 60 | `audio:cue`×3, `npc:hailed`×2, `barkDirector:voice`×1 |
| `aiEncounter` | `systems/aiEncounter.js` | 886 | 0 | 6 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 289 | 5 | 3 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `travelLanes` | `systems/travelLanes.js` | 1633 | 0 | 3 | — |
| `orbitalGallery` | `gallery/orbital/system.js` | 151 | 0 | 0 | — |
| `kineticLeague` | `sports/kineticLeague/live.js` | 277 | 0 | 0 | — |
| `heroManeuvers` | `systems/heroManeuvers.js` | 794 | 4 | 0 | `audio:cue`×4 |
| `flight` | `systems/flightV3.js` (+ legacy) | 2390 | 11 | 11 | `ship:boostStop`×2, `nav:autopilot`×2, `ship:boostStart`×1 |
| `cruise` | `systems/cruise.js` | 356 | 6 | 6 | `cruise:wrestleStarted`×1, `cruise:engaged`×1, `cruise:wrestleEscaped`×1 |
| `redKite` | `systems/redKite.js` | 318 | 5 | 0 | `ui:setCourse`×1, `redKite:offer`×1, `redKite:started`×1 |
| `ilexArk` | `systems/ilexArk.js` | 273 | 6 | 0 | `ui:setCourse`×1, `ilexArk:vaultReleased`×1, `ilexArk:accepted`×1 |
| `aiPorts` | `systems/aiPorts.js` | 2290 | 2 | 0 | `ai:encounterCommand`×1, `cloak:faded`×1 |
| `tumbleStates` | `systems/tumbleStates.js` | 875 | 11 | 8 | `audio:cue`×2, `presentation:vfxCue`×2, `massline:recovered`×1 |
| `collisionConsequences` | `systems/collisionConsequences.js` | 1360 | 2 | 7 | `combat:collisionConsequence`×1, `combat:collisionDebris`×1 |
| `stuntGrammar` | `systems/stuntGrammar.js` | 322 | 9 | 0 | `faction:repDelta`×2, `stunt:styleBanked`×1, `stunt:arenaLawBounty`×1 |
| `weapons` | `systems/weapons.js` | 4228 | 29 | 0 | `weapons:vent`×4, `combat:fire`×4, `presentation:vfxCue`×4 |
| `countermeasures` | `systems/countermeasures.js` | 905 | 5 | 3 | `audio:cue`×2, `pds:intercept`×1, `countermeasure:deployed`×1 |
| `bombs` | `systems/bombs.js` | 1873 | 35 | 14 | `bombs:denied`×8, `economy:chargeCredits`×4, `bombs:cycle`×3 |
| `emergentPrimitives` | `systems/emergentPrimitives.js` | 1199 | 2 | 0 | `emergent:audio`×1, `emergent:contact`×1 |
| `environmentMaterials` | `systems/environmentMaterials.js` | 548 | 2 | 1 | `emergent:audio`×1, `asteroid:chunked`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 1676 | 27 | 6 | `audio:cue`×6, `charge:detonated`×5, `chain:slam`×2 |
| `hullBurst` | `systems/hullBurst.js` | 627 | 17 | 0 | `audio:cue`×5, `presentation:vfxCue`×5, `hullBurst:hit`×3 |
| `mines` | `systems/mines.js` | 722 | 17 | 9 | `voice:say`×3, `mines:armed`×3, `mines:released`×2 |
| `massSeed` | `systems/massSeed.js` | 853 | 27 | 7 | `presentation:vfxCue`×4, `massSeed:collapsing`×4, `massSeed:collapsed`×4 |
| `uniqueLootAbilities` | `systems/uniqueLootAbilities.js` | 593 | 3 | 5 | `uniqueLoot:paleCoilBlink`×1, `uniqueLoot:nestbreakerSplit`×1, `uniqueLoot:choirBellPulse`×1 |
| `dockingCorridor` | `systems/dockingCorridor.js` | 383 | 0 | 4 | — |
| `environmentalMachinery` | `systems/environmentalMachinery.js` | 1911 | 13 | 8 | `environmentalMachinery:ensureAnvil`×2, `weather:ionBlackout`×2, `sector:physicalLaw`×1 |
| `survivalArena` | `systems/survivalArena.js` | 3004 | 4 | 17 | `survivalArena:rosterPrewarm`×1, `mines:placeRequest`×1, `encounter:telegraph`×1 |
| `swarmFortify` | `systems/swarmFortify.js` | 985 | 0 | 9 | — |
| `fields` | `systems/fields.js` | 3724 | 39 | 21 | `fields:deployed`×6, `fields:ended`×6, `audio:cue`×4 |
| `stormChase` | `features/stormChase/runtime.js` | 698 | 0 | 6 | — |
| `gyreSnare` | `systems/gyreSnare.js` | 3024 | 30 | 0 | `audio:cue`×23, `camera:shake`×5, `matter:refused`×2 |
| `shieldPylons` | `systems/shieldPylons.js` | 687 | 17 | 6 | `audio:cue`×3, `economy:grantCredits`×2, `shieldPylon:placed`×2 |
| `planetRuntime` | `systems/planetRuntime.js` | 1075 | 12 | 3 | `planet:plungeStage`×2, `planet:registered`×1, `planet:unregistered`×1 |
| `morrow` | `systems/morrow.js` | 371 | 5 | 0 | `morrow:voice`×1, `audio:cue`×1, `morrow:met`×1 |
| `vesper` | `systems/vesper.js` | 356 | 8 | 0 | `vesper:voice`×2, `vesper:met`×1, `audio:cue`×1 |
| `bracket` | `systems/bracket.js` | 327 | 7 | 0 | `bracket:voice`×1, `audio:cue`×1, `bracket:matchStarted`×1 |
| `ravel` | `systems/ravel.js` | 288 | 8 | 0 | `ravel:voice`×1, `audio:cue`×1, `ravel:telegraph`×1 |
| `solstice` | `systems/solstice.js` | 603 | 5 | 0 | `solstice:voice`×1, `audio:cue`×1, `solstice:destroyed`×1 |
| `rubric` | `systems/rubric.js` | 691 | 6 | 0 | `rubric:voice`×1, `audio:cue`×1, `rubric:destroyed`×1 |
| `ruckus` | `systems/ruckus.js` | 322 | 6 | 0 | `save:dirty`×1, `ruckus:voice`×1, `audio:cue`×1 |
| `ruud` | `systems/ruud.js` | 586 | 7 | 0 | `ruud:voice`×2, `audio:cue`×2, `ruud:stamp`×1 |
| `docket` | `systems/docket.js` | 310 | 7 | 0 | `docket:met`×2, `comms:log`×2, `docket:voice`×1 |
| `industrialDisasters` | `features/industrialDisasters/runtime.js` | 511 | 11 | 0 | `industrialDisasters:inspect`×2, `industrialDisasters:commandRejected`×1, `industrialDisasters:signal`×1 |
| `salvageTender` | `features/salvageTender/runtime.js` | 612 | 7 | 0 | `salvageTender:reset`×2, `salvageTender:cue`×1, `salvageTender:close`×1 |
| `convoyRaid` | `features/convoyRaid/runtime.js` | 615 | 0 | 0 | — |
| `towjaw` | `features/towjaw/runtime.js` | 649 | 0 | 5 | — |
| `derelictExpedition` | `runtime/laneSystemFacades.js` | 570 | 1 | 1 | `lane:facadeMiss`×1 |
| `kineticCatalysts` | `features/kineticCatalysts/runtime.js` | 516 | 0 | 0 | — |
| `physics` | `core/physics.js` | 2803 | 11 | 3 | `projectile:hit`×3, `dock:range`×2, `gate:range`×2 |
| `reactiveMatter` | `systems/reactiveMatter.js` | 706 | 0 | 3 | — |
| `latchNine` | `systems/latchNine.js` | 150 | 0 | 0 | — |
| `combat` | `systems/combat.js` | 1691 | 19 | 10 | `camera:shake`×3, `economy:grantCredits`×3, `player:death`×2 |
| `combatOutcome` | `systems/combatOutcome.js` | 678 | 6 | 22 | `combat:aftermathChoices`×3, `combat:aftermathChosen`×1, `combat:outcome`×1 |
| `aftermathWrecks` | `systems/aftermathWrecks.js` | 3652 | 27 | 27 | `aftermathWreck:retired`×3, `news:headline`×2, `news:publish`×2 |
| `dyingHull` | `systems/dyingHull.js` | 527 | 4 | 2 | `dyingHull:lost`×2, `dyingHull:begin`×1, `dyingHull:ruptured`×1 |
| `titles` | `systems/titles.js` | 1312 | 0 | 14 | — |
| `wingMorale` | `systems/wingMorale.js` | 442 | 5 | 3 | `ai:formationBroken`×1, `wingMorale:broken`×1, `ai:flee`×1 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 4689 | 54 | 15 | `tether:latchDenied`×8, `tether:releaseRated`×5, `tether:broke`×4 |
| `surrenderRecovery` | `systems/surrenderRecovery.js` | 1654 | 0 | 16 | — |
| `shipjack` | `systems/shipjack.js` | 575 | 15 | 0 | `save:dirty`×1, `comms:log`×1, `shipjack:cue`×1 |
| `custodyConsequences` | `systems/custodyConsequences.js` | 638 | 0 | 5 | — |
| `mercyService` | `response/mercyService/live.js` | 335 | 8 | 0 | `mercyService:toolResult`×1, `mercyService:started`×1, `mission:offered`×1 |
| `wreckCourt` | `systems/wreckCourt.js` | 1081 | 8 | 0 | `wreckCourt:result`×1, `wreckCourt:opened`×1, `economy:grantCredits`×1 |
| `masslineTelemetry` | `systems/masslineTelemetry.js` | 694 | 3 | 6 | `tether:massWeighed`×1, `tether:reelPump`×1, `tether:snapCatch`×1 |
| `masslineThreats` | `systems/masslineThreats.js` | 400 | 1 | 0 | `massline:threat`×1 |
| `masslineImpacts` | `systems/masslineImpacts.js` | 569 | 3 | 0 | `tether:whipImpact`×1, `sectorsim:impulse`×1, `massline:sweepImpact`×1 |
| `masslineSnares` | `systems/masslineSnares.js` | 896 | 8 | 5 | `massline:snareDeployed`×2, `massline:snareArmed`×1, `ai:telegraph`×1 |
| `masslineThrow` | `systems/masslineThrow.js` | 1099 | 11 | 4 | `audio:cue`×4, `massline:releaseCancelled`×1, `massline:releaseWindow`×1 |
| `masslineImpactDamage` | `systems/masslineImpactDamage.js` | 164 | 0 | 3 | — |
| `lootShards` | `systems/lootShards.js` | 1331 | 8 | 4 | `cargo:volatileSlam`×2, `loot:magnetCaptured`×1, `cargo:caughtByNet`×1 |
| `terrainAnchors` | `systems/terrainAnchors.js` | 504 | 1 | 6 | `terrainAnchors:replenished`×1 |
| `jettisonImpulse` | `systems/jettisonImpulse.js` | 95 | 1 | 1 | `audio:cue`×1 |
| `lineHeads` | `systems/lineHeads.js` | 499 | 5 | 2 | `lineHead:breakerSplit`×1, `audio:cue`×1, `lineHead:sealed`×1 |
| `volatileExposure` | `systems/volatileExposure.js` | 575 | 7 | 4 | `presentation:vfxCue`×2, `audio:cue`×2, `cargo:volatileExposed`×1 |
| `mining` | `systems/mining.js` | 3732 | 54 | 10 | `beam:denied`×6, `mining:yield`×6, `mining:start`×5 |
| `fieldDepletion` | `systems/fieldDepletion.js` | 921 | 3 | 3 | `field:richSeamMissed`×1, `fieldDepletion:changed`×1, `field:depletedChanged`×1 |
| `cargo` | `systems/cargo.js` | 2050 | 19 | 0 | `cargo:full`×2, `salvage:changed`×2, `audio:cue`×2 |
| `fragileCargo` | `systems/fragileCargo.js` | 427 | 2 | 2 | `cargo:radiationCooked`×1, `cargo:fragileLost`×1 |
| `moistureLoss` | `systems/moistureLoss.js` | 242 | 2 | 3 | `comms:popup`×1, `moisture:loss`×1 |
| `automation` | `systems/automation.js` | 4493 | 67 | 10 | `automation:outpostsChanged`×11, `automation:fleetChanged`×8, `automation:incomeCredited`×5 |
| `asteroidSites` | `systems/asteroidSites.js` | 4119 | 42 | 21 | `siteEvidence:result`×2, `site:created`×2, `site:laneSpilled`×2 |
| `asteroidFormations` | `systems/asteroidFormations.js` | 356 | 1 | 5 | `formation:discovered`×1 |
| `wingmen` | `systems/wingmen.js` | 1023 | 6 | 10 | `comms:log`×3, `combat:hitAsset`×1, `wingmen:gap`×1 |
| `crafting` | `systems/crafting.js` | 503 | 10 | 0 | `craft:queueChanged`×4, `audio:cue`×3, `craft:complete`×2 |
| `economy` | `systems/economy.js` | 6734 | 67 | 43 | `service:completed`×8, `credits:changed`×4, `faction:repDelta`×3 |
| `intervention` | `systems/intervention.js` | 604 | 5 | 2 | `intervention:logged`×1, `camera:shake`×1, `intervention:available`×1 |
| `world` | `systems/world.js` | 9428 | 90 | 64 | `poi:discovered`×5, `discovery:plateUnlocked`×4, `jump:chargeAbort`×4 |
| `heistFacilities` | `systems/heistFacilities.js` | 3933 | 23 | 8 | `heist:launchScheduleReceipt`×4, `heist:counterweightSceneReceipt`×4, `heist:launchCue`×2 |
| `regionalEcology` | `systems/regionalEcology.js` | 454 | 0 | 0 | — |
| `tensionDirector` | `systems/tensionDirector.js` | 296 | 0 | 0 | — |
| `encounterDirector` | `systems/encounterDirector.js` | 5944 | 34 | 47 | `nav:waypoint`×2, `encounter:resolved`×2, `economy:applyTradePressure`×2 |
| `rockCore` | `systems/rockCore.js` | 271 | 0 | 4 | — |
| `scissorwake` | `systems/scissorwake.js` | 118 | 0 | 3 | — |
| `routeFollower` | `systems/routeFollower.js` | 1116 | 1 | 11 | `nav:engageRoute`×1 |
| `livingPoiBehaviors` | `systems/livingPoiBehaviors.js` | 1175 | 0 | 0 | — |
| `pirateRumor` | `systems/pirateRumor.js` | 678 | 0 | 0 | — |
| `ambushSignatures` | `systems/ambushSignatures.js` | 236 | 0 | 0 | — |
| `bountyHunt` | `systems/bountyHunt.js` | 1279 | 0 | 0 | — |
| `stationSideEventDirector` | `systems/stationSideEventDirector.js` | 605 | 1 | 4 | `station:sideEvent`×1 |
| `stationServices` | `systems/stationServices.js` | 980 | 17 | 6 | `fuel:changed`×3, `audio:cue`×2, `service:completed`×2 |
| `difficultyDirector` | `systems/difficultyDirector.js` | 476 | 2 | 5 | `difficulty:pinReleased`×1, `difficulty:stanceChanged`×1 |
| `gateControlDirector` | `systems/gateControlDirector.js` | 366 | 2 | 8 | `economy:chargeCredits`×1, `gate:verdict`×1 |
| `salvage` | `systems/salvage.js` | 1574 | 16 | 7 | `comms:log`×5, `audio:cue`×3, `salvage:placed`×1 |
| `tallyThree` | `systems/tallyThree.js` | 143 | 1 | 0 | `ui:setCourse`×1 |
| `lastShift` | `systems/lastShift.js` | 475 | 5 | 0 | `lastShift:cue`×1, `lastShift:offer`×1, `news:headline`×1 |
| `sableVenn` | `systems/sableVenn.js` | 80 | 0 | 0 | — |
| `lossInvestigation` | `systems/lossInvestigation.js` | 408 | 3 | 7 | `lossInvestigation:promoted`×1, `mission:offered`×1, `lossInvestigation:closed`×1 |
| `salvageActions` | `systems/salvageActions.js` | 778 | 13 | 8 | `entity:spawnRequest`×2, `presentation:cue`×2, `combat:hit`×2 |
| `survivorPod` | `systems/survivorPod.js` | 2125 | 19 | 16 | `survivorPod:ejected`×2, `survivorPod:boarded`×2, `barkDirector:voice`×2 |
| `rookBooth` | `systems/rookBooth.js` | 765 | 11 | 0 | `comms:popup`×2, `wreckMarket:rates`×1, `rookWreck:offerLapsed`×1 |
| `kesslerScale` | `systems/kesslerScale.js` | 387 | 4 | 0 | `comms:popup`×3, `kesslerPod:weighed`×1 |
| `furnaceIntake` | `systems/furnaceIntake.js` | 193 | 3 | 0 | `comms:popup`×2, `furnace:fed`×1 |
| `gateThreeWeir` | `systems/gateThreeWeir.js` | 748 | 25 | 0 | `faction:repDelta`×4, `economy:chargeCredits`×4, `gateThree:logged`×3 |
| `slateColumn` | `systems/slateColumn.js` | 195 | 5 | 0 | `comms:popup`×3, `slate:spike`×1, `slate:columnRead`×1 |
| `bouncer` | `systems/bouncer.js` | 977 | 18 | 0 | `comms:popup`×7, `bouncer:offense`×1, `bouncer:vipEarned`×1 |
| `receipt` | `systems/receipt.js` | 186 | 3 | 0 | `comms:popup`×3 |
| `mop` | `systems/mop.js` | 155 | 1 | 0 | `comms:popup`×1 |
| `tallyho` | `systems/tallyho.js` | 1327 | 30 | 0 | `tallyho:betLost`×4, `comms:popup`×3, `tallyho:rivalLeft`×2 |
| `tare` | `systems/tare.js` | 235 | 2 | 0 | `comms:popup`×1, `verge:massWeighed`×1 |
| `lamplighter` | `systems/lamplighter.js` | 1325 | 30 | 0 | `lamplighter:askLapsed`×2, `comms:popup`×1, `comms:log`×1 |
| `shepherd12` | `systems/shepherd12.js` | 324 | 1 | 0 | `comms:popup`×1 |
| `quill` | `systems/quill.js` | 973 | 21 | 0 | `economy:grantCredits`×3, `economy:chargeCredits`×3, `faction:repDelta`×2 |
| `holdfast` | `systems/holdfast.js` | 309 | 1 | 0 | `comms:popup`×1 |
| `bellhop` | `systems/bellhop.js` | 263 | 3 | 0 | `comms:popup`×1, `audio:cue`×1, `economy:grantCredits`×1 |
| `gravedigger` | `systems/gravedigger.js` | 1441 | 27 | 0 | `gravedigger:claimClosed`×4, `comms:popup`×1, `economy:grantCredits`×1 |
| `recoveryEncounter` | `systems/recoveryEncounter.js` | 851 | 0 | 0 | — |
| `factions` | `systems/factions.js` | 1207 | 14 | 20 | `faction:repChanged`×3, `faction:aggro`×3, `news:publish`×2 |
| `massSignature` | `systems/massSignature.js` | 635 | 12 | 0 | `comms:log`×3, `sensors:signatureLost`×2, `sensors:quietCoast`×2 |
| `faction_concord` | `systems/faction_concord.js` | 307 | 5 | 0 | `concord:formationLocked`×1, `comms:log`×1, `concord:formationReformed`×1 |
| `faction_meridian` | `systems/faction_meridian.js` | 1854 | 42 | 3 | `comms:log`×2, `meridian:blacklisted`×2, `economy:grantCredits`×1 |
| `faction_helix` | `systems/faction_helix.js` | 2067 | 45 | 6 | `helix:noticeLapsed`×9, `comms:log`×3, `helix:lienScraped`×2 |
| `faction_drift` | `systems/faction_drift.js` | 271 | 3 | 0 | `drift:claimLifted`×1, `drift:claimStaked`×1, `drift:claimContested`×1 |
| `understoryGardens` | `systems/faction_understory.js` | 2188 | 43 | 10 | `comms:log`×7, `understory:dropLapsed`×5, `understory:debtChanged`×3 |
| `fulfillmentRoutes` | `systems/faction_fulfillment.js` | 542 | 17 | 0 | `comms:log`×8, `fulfillment:derailed`×1, `fulfillment:rerailed`×1 |
| `pitbornCull` | `systems/faction_pitborn.js` | 2179 | 58 | 2 | `comms:log`×7, `pitborn:marketDelisted`×5, `economy:grantCredits`×2 |
| `vaelLiens` | `systems/faction_vael.js` | 2055 | 53 | 2 | `comms:log`×7, `economy:chargeCredits`×2, `faction:repDelta`×2 |
| `archiveRedaction` | `systems/faction_archive.js` | 1924 | 45 | 3 | `comms:log`×5, `faction:repDelta`×4, `archive:errandExpired`×3 |
| `choirResonance` | `systems/faction_choir.js` | 1733 | 69 | 1 | `comms:log`×23, `faction:repDelta`×10, `economy:grantCredits`×5 |
| `vergeCourt` | `systems/faction_verge.js` | 1989 | 62 | 0 | `faction:repDelta`×11, `comms:log`×8, `economy:chargeCredits`×4 |
| `frontierHomesteads` | `systems/faction_frontier.js` | 2682 | 51 | 8 | `comms:log`×10, `frontier:missionAttemptLost`×2, `frontier:sitePlanted`×2 |
| `sectorSim` | `systems/sectorSim.js` | 1254 | 10 | 17 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `towlineTable` | `systems/towlineTable.js` | 307 | 6 | 0 | `ui:setCourse`×1, `towlineTable:cleanupAccepted`×1, `towlineTable:assistAccepted`×1 |
| `shipbreakingYard` | `features/shipbreakingYard/runtime.js` | 731 | 17 | 0 | `shipbreakingYard:offer`×6, `save:dirty`×3, `ui:setCourse`×2 |
| `rigWorkshop` | `features/rigWorkshop/runtime.js` | 699 | 6 | 0 | `ui:setCourse`×2, `rigWorkshop:changed`×1, `rigWorkshop:feedback`×1 |
| `counterweightCircuit` | *(not found)* | — | — | — | — |
| `breakwaterSpur` | `features/breakwaterSpur/runtime.js` | 560 | 21 | 15 | `breakwaterSpur:receipt`×13, `ui:setCourse`×3, `breakwaterSpur:offer`×2 |
| `borrowedVoice` | `systems/borrowedVoice.js` | 246 | 3 | 0 | `borrowedVoice:fragmentRecovered`×1, `borrowedVoice:offer`×1, `borrowedVoice:dispositionAccepted`×1 |
| `borrowedSun` | `systems/borrowedSun.js` | 1559 | 37 | 0 | `borrowedSun:debtSettled`×3, `economy:chargeCredits`×2, `borrowedSun:shadowLapsed`×2 |
| `salvageOutfits` | `features/salvageOutfits/index.js` | 760 | 12 | 0 | `salvageOutfits:offer`×3, `salvageOutfits:agreement`×2, `salvageOutfits:radio`×1 |
| `npcJobsRuntime` | `systems/npcJobsRuntime.js` | 7753 | 27 | 21 | `npcJobs:towAssistLost`×3, `npcjobs:loadEmpty`×2, `economy:chargeCredits`×2 |
| `cinderglassJob` | `features/cinderglassJob/runtime.js` | 515 | 10 | 0 | `cinderglassJob:servicePrompt`×2, `cinderglassJob:fact`×2, `ui:setCourse`×2 |
| `missions` | `systems/missions.js` | 6032 | 90 | 108 | `mission:updated`×36, `comms:popup`×5, `nav:waypoint`×4 |
| `careerOrigins` | `careers/origins/careerOrigins.js` | 1329 | 0 | 0 | — |
| `careerLadders` | `careers/ladders/careerLadders.js` | 366 | 0 | 0 | — |
| `liveCareerLadderBranches` | `careers/ladders/liveCareerLadderBranches.js` | 206 | 0 | 0 | — |
| `story` | `systems/story.js` | 2834 | 51 | 54 | `graffiti:show`×7, `hud:phase`×4, `endgame:ineligible`×4 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 854 | 9 | 5 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `swarmArena` | `systems/swarmArena.js` | 2719 | 0 | 13 | — |
| `survivalWave` | `systems/survivalWave.js` | 2445 | 0 | 9 | — |
| `swarmCourseTwists` | `systems/swarmCourseTwists.js` | 753 | 6 | 0 | `run:spendRequested`×1, `swarm:bonusChip`×1, `freight:reverseRequested`×1 |
| `survivalRun` | `systems/survivalRun.js` | 1172 | 1 | 16 | `run:transitionRequested`×1 |
| `swarmChain` | `systems/swarmChain.js` | 424 | 0 | 4 | — |
| `killReplay` | `systems/killReplay.js` | 431 | 0 | 5 | — |
| `killcamRecorder` | `sim/killcamTape.js` | 561 | 0 | 6 | — |
| `swarmJuice` | `systems/swarmJuice.js` | 803 | 0 | 16 | — |
| `swarmElites` | `systems/swarmElites.js` | 1048 | 0 | 10 | — |
| `swarmDrops` | `systems/swarmDrops.js` | 722 | 0 | 13 | — |
| `heat` | `systems/heat.js` | 1028 | 3 | 16 | `bounty:cooled`×1, `survivorPod:heatCooled`×1, `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 4940 | 2 | 61 | `traffic:vesselRelinquished`×1, `field:richSeamMissed`×1 |
| `drill` | `systems/drill.js` | 2185 | 46 | 1 | `drill:warn`×12, `drill:rockDepleted`×4, `drill:break`×4 |
| `claims` | `systems/claims.js` | 3353 | 51 | 14 | `audio:cue`×6, `economy:chargeCredits`×4, `news:publish`×4 |
| `chronicler` | `systems/chronicler.js` | 481 | 0 | 0 | — |
| `longBerth` | `systems/longBerth.js` | 322 | 5 | 4 | `longBerth:claimOffer`×1, `longBerth:restoreOffer`×1, `economy:chargeCredits`×1 |
| `crew` | `systems/crew.js` | 819 | 39 | 10 | `comms:popup`×19, `economy:chargeCredits`×4, `crew:hireDenied`×2 |
| `bandRadio` | `systems/bandRadio.js` | 1232 | 4 | 0 | `band:bearingRequest`×1, `band:bearingReceipt`×1, `band:status`×1 |
| `plants` | `systems/plants/plantsRuntime.js` | 514 | 0 | 0 | — |
| `onboarding` | `systems/onboarding.js` | 5868 | 26 | 96 | `comms:popup`×3, `onboarding:rangePrompt`×3, `rescue:beat`×2 |
| `masslineHud` | `ui/masslineHud.js` | 2880 | 0 | 8 | — |
| `massSeedHud` | `ui/massSeedHud.js` | 340 | 0 | 0 | — |
| `fieldHud` | `ui/fieldHud.js` | 286 | 0 | 0 | — |
| `gyreHud` | `ui/gyreHud.js` | 518 | 0 | 0 | — |
| `pylonHud` | `ui/pylonHud.js` | 212 | 0 | 0 | — |
| `planetHud` | `ui/planetHud.js` | 192 | 0 | 0 | — |
| `miningHud` | `ui/miningHud.js` | 637 | 0 | 9 | — |
| `survivalHud` | `ui/survivalHud.js` | 1427 | 1 | 11 | `audio:cue`×1 |
| `swarmJuiceHud` | `ui/swarmJuiceHud.js` | 863 | 0 | 16 | — |
| `crucibleFocus` | `ui/crucibleFocus.js` | 196 | 2 | 0 | `camera:zoom`×2 |
| `noFireAdvisory` | `data/stationBubbles.js` | 253 | 0 | 1 | — |
| `moralTrapSystem` | *(not found)* | — | — | — | — |
| `moralMemory` | `systems/moralMemory.js` | 1315 | 0 | 0 | — |
| `special500` | `systems/special500Director.js` | 354 | 4 | 0 | `comms:popup`×1, `comms:log`×1, `news:publish`×1 |
| `special500Spectacle` | `systems/special500Spectacle.js` | 280 | 4 | 3 | `presentation:vfxCue`×2, `news:publish`×1, `audio:cue`×1 |
| `special500Question` | `systems/special500Question.js` | 182 | 2 | 2 | `comms:popup`×1, `comms:log`×1 |
| `special500Invoice` | `systems/special500Invoice.js` | 195 | 12 | 2 | `comms:log`×3, `special500:invoiceReceipt`×3, `economy:chargeCredits`×2 |
| `special500PortraitBuoys` | `systems/special500PortraitBuoys.js` | 238 | 4 | 1 | `special500:portraitCommission`×3, `comms:log`×1 |
| `special500Sommelier` | `systems/special500Sommelier.js` | 162 | 7 | 2 | `comms:log`×3, `economy:chargeCredits`×2, `faction:repDelta`×1 |
| `special500CollectiveHours` | `systems/special500CollectiveHours.js` | 90 | 1 | 1 | `comms:log`×1 |
| `voiceArbiter` | `ui/voiceArbiter.js` | 1035 | 5 | 6 | `voice:clear`×2, `voice:surface`×2, `barkDirector:voice`×1 |
| `mail` | `systems/mail.js` | 250 | 2 | 0 | `comms:popup`×1, `mail:delivered`×1 |
| `worldClock` | `systems/worldClock.js` | 270 | 8 | 0 | `calendar:stormSeason`×1, `calendar:festival`×1, `audio:cue`×1 |
| `worldPressure` | `systems/worldPressure.js` | 454 | 13 | 0 | `sectorsim:impulse`×2, `comms:log`×2, `worldPressure:tideChanged`×1 |
| `lineProgression` | `systems/lineProgression.js` | 229 | 2 | 4 | `line:recordStamped`×1, `line:classChanged`×1 |
| `save` | `save/saveSystem.js` | 10658 | 61 | 31 | `save:error`×34, `mode:changed`×4, `save:started`×3 |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
