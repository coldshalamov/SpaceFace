# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
> This is a static source index: dynamic names, bus taps, and consumers in scripts or tests
> are not listed. A missing endpoint does not establish that an event is unused.
>
> Generated: 2026-11-05 · 2088 events · 6581 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:363`, `systems/encounterDirector.js:401`, `ui/discoveryPlate.js:117` |
| `achievement:unlocked` | — | `audio/audioSystem.js:3070` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:2547` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:923` | — |
| `aftermath:custodyFreight` | `systems/aftermathWrecks.js:2433` | — |
| `aftermath:custodySurvivor` | `systems/aftermathWrecks.js:2445` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:2526` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2906`, `systems/aftermathWrecks.js:2918` | `systems/missions.js:1796` |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:988` | `render/vfx.js:2863`, `systems/missions.js:1795`, `systems/salvage.js:161` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1786`, `systems/aftermathWrecks.js:2316`, `systems/aftermathWrecks.js:2327` | `systems/missions.js:1797`, `ui/galaxyMap.js:2108` |
| `aftermathWreck:siteUnavailable` | `systems/aftermathWrecks.js:2004` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:2649` | `systems/alienEcology.js:424`, `systems/dyingHull.js:182`, `systems/lawSecurity.js:408`, `systems/salvage.js:162` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:170` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:726`, `systems/tacticalAI.js:776` | `systems/presentationOrchestrator.js:171`, `systems/scissorwake.js:81`, `systems/tetherGameplay.js:347`, `ui/threatHalo.js:919` |
| `ai:egressExit` | `ai/egressExit.js:111`, `systems/missionStoryOps.js:1269` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:397` | — |
| `ai:flee` | `systems/ai.js:276`, `systems/trafficRoleOps.js:497`, `systems/wingMorale.js:331` | `render/authoredMotion.js:1189`, `render/vfx.js:2928`, `systems/barkDirector.js:814`, `systems/combatOutcome.js:260`, `systems/encounterDirector.js:439`, `systems/presentationOrchestrator.js:172` |
| `ai:formationBroken` | `systems/ai.js:454`, `systems/wingMorale.js:281` | `render/vfx.js:2929` |
| `ai:mayday` | `ai/shovePanic.js:72` | — |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:816` |
| `ai:stateChange` | `systems/ai.js:273` | `render/authoredMotion.js:1206`, `systems/combatOutcome.js:296` |
| `ai:telegraph` | `ai/counterplay/live.js:138`, `systems/ai.js:350`, `systems/encounterScripts.js:173`, `systems/encounterScripts.js:1132`, `systems/encounterScripts/weirAmbush.js:256`, `systems/masslineSnares.js:347`, `systems/mines.js:167`, `systems/tacticalAI.js:112`, `systems/tacticalAI.js:145`, `systems/tacticalAI.js:753`, `systems/tacticalAI.js:951` | `audio/audioSystem.js:3026`, `render/authoredMotion.js:1188`, `render/vfx.js:2927`, `systems/presentationOrchestrator.js:169`, `systems/scissorwake.js:74`, `systems/survivalResults.js:519`, `ui/survivalHud.js:328`, `ui/threatHalo.js:915` |
| `aiTrader:requestTrade` | `systems/trafficEscortOps.js:170` | `systems/economy.js:1787` |
| `alienEcology:blackBoxRecovered` | `systems/world.js:850` | `systems/world.js:821` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:1468` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:1172` | `systems/world.js:829` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:819` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:817` |
| `alienEcology:relaySevered` | — | `systems/world.js:818` |
| `alienEcology:relocateSite` | — | `systems/world.js:820` |
| `alienEcology:vented` | `systems/alienEcology.js:2493` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114`, `systems/economyContracts.js:787` | `systems/story.js:169` |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:289` | `systems/story.js:170` |
| `ambush:clauseDecided` | `systems/encounterDirector.js:1111` | — |
| `ambush:clauseFired` | `systems/encounterDirector.js:1304` | — |
| `anomaly:bearing` | `systems/scanner.js:1406` | `systems/presentationOrchestrator.js:202` |
| `anomaly:triangulated` | `systems/scanner.js:1424` | `systems/world.js:748` |
| `archive:amnesty` | `systems/faction_archive.js:1226`, `systems/faction_archive.js:1577` | — |
| `archive:annotated` | `systems/faction_archive.js:1545` | — |
| `archive:cited` | `systems/faction_archive.js:725` | — |
| `archive:copyPublished` | `systems/faction_archive.js:1069` | — |
| `archive:copySuppressed` | `systems/faction_archive.js:1190` | — |
| `archive:courierArrived` | `systems/faction_archive.js:1668` | — |
| `archive:courierHail` | `systems/faction_archive.js:1660` | — |
| `archive:courierSpawn` | `systems/faction_archive.js:1735` | — |
| `archive:deskRefused` | `systems/faction_archive.js:1038` | — |
| `archive:errandExpired` | `systems/faction_archive.js:1261`, `systems/faction_archive.js:1281`, `systems/faction_archive.js:1445` | — |
| `archive:errandPosted` | `systems/faction_archive.js:1363`, `systems/faction_archive.js:1386` | — |
| `archive:errandSettled` | `systems/faction_archive.js:1412` | — |
| `archive:expunged` | `systems/faction_archive.js:1551`, `systems/faction_archive.js:1573` | — |
| `archive:fieldCastSpawn` | `systems/faction_archive.js:1835` | — |
| `archive:fileCirculated` | `systems/faction_archive.js:1493`, `systems/faction_archive.js:1519` | — |
| `archive:folioBought` | `systems/faction_archive.js:1122` | — |
| `archive:folioRecovered` | `systems/faction_archive.js:1292` | — |
| `archive:indexFiled` | `systems/faction_archive.js:1011` | — |
| `archive:indexRead` | `systems/faction_archive.js:963` | — |
| `archive:logCopied` | `systems/faction_archive.js:929` | — |
| `archive:markForgiven` | `systems/faction_archive.js:1564` | — |
| `archive:marked` | `systems/faction_archive.js:1542` | — |
| `archive:penance` | `systems/faction_archive.js:1216` | — |
| `archive:redacted` | `systems/faction_archive.js:847` | — |
| `archive:redactionLifted` | `systems/faction_archive.js:861` | — |
| `archive:suppressOffered` | `systems/faction_archive.js:1149` | — |
| `archive:tier` | `systems/faction_archive.js:705` | — |
| `asset:deployed` | `systems/automation.js:2655`, `systems/automation.js:2741`, `systems/automation.js:2843`, `systems/claims.js:564` | `systems/missions.js:2039`, `systems/onboarding.js:908`, `systems/story.js:256` |
| `asteroid:chunked` | `systems/environmentMaterials.js:327`, `systems/mining.js:2580` | `audio/audioSystem.js:2855`, `render/asteroidMotionPresentation.js:524`, `render/authoredMotion.js:1204`, `render/vfx.js:2895`, `systems/presentationOrchestrator.js:215` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1225`, `systems/mining.js:1268` | `audio/audioSystem.js:2851`, `render/authoredMotion.js:1203`, `render/vfx.js:2893`, `systems/asteroidFormations.js:131`, `systems/environmentalMachinery.js:284`, `systems/fieldDepletion.js:755`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `features/breakwaterSpur/presentation.js:117`, `features/industrialDisasters/presentation.js:111`, `features/salvageTender/presentation.js:64`, `features/shipbreakingYard/audio.js:28`, `matter/collectorKnot.js:155`, `matter/collectorKnot.js:178`, `matter/collectorKnot.js:363`, `matter/collectorKnot.js:410`, `render/feel.js:586`, `render/shipMicroMotion.js:2763`, `render/trailerStaging.js:13`, `render/vfx.js:2956`, `render/vfx.js:5792`, `render/vfx.js:9756`, `render/vfx/tetherCableEventMethods.js:337`, `systems/ai.js:726`, `systems/alienEcology.js:789`, `systems/asteroidSites.js:2664`, `systems/barkDirector.js:1957`, `systems/barkDirector.js:2004`, `systems/beacons.js:77`, `systems/beacons.js:82`, `systems/beacons.js:94`, `systems/bellhop.js:198`, `systems/blindWelderRuntime.js:161`, `systems/bombs.js:1166`, `systems/bombs.js:1290`, `systems/bombs.js:1679`, `systems/bracket.js:125`, `systems/bulletTime.js:216`, `systems/bulletTime.js:234`, `systems/bulletTime.js:314`, `systems/cargo.js:1357`, `systems/cargo.js:1380`, `systems/claims.js:411`, `systems/claims.js:496`, `systems/claims.js:541`, `systems/claims.js:1575`, `systems/claims.js:1695`, `systems/claims.js:2435`, `systems/cloak.js:201`, `systems/cloak.js:241`, `systems/countermeasures.js:559`, `systems/countermeasures.js:595`, `systems/crafting.js:352`, `systems/crafting.js:362`, `systems/crafting.js:384`, `systems/discoverySound.js:25`, `systems/docket.js:158`, `systems/eighthBellRuntime.js:122`, `systems/eighthBellRuntime.js:137`, `systems/environmentalMachinery.js:1665`, `systems/fields.js:838`, `systems/fields.js:1224`, `systems/fields.js:1357`, `systems/fields.js:1633`, `systems/flybyFocus.js:540`, `systems/glueMeetMassRuntime.js:119`, `systems/gyreSnare.js:531`, `systems/gyreSnare.js:1236`, `systems/gyreSnare.js:1608`, `systems/gyreSnare.js:1641`, `systems/gyreSnare.js:2016`, `systems/gyreSnare.js:2129`, `systems/gyreSnare.js:2211`, `systems/gyreSnare.js:2446`, `systems/gyreSnare.js:2471`, `systems/gyreSnare.js:2486`, `systems/gyreSnare.js:2499`, `systems/gyreSnare.js:2528`, `systems/gyreSnare.js:2559`, `systems/gyreSnare.js:2664`, `systems/gyreSnare.js:2683`, `systems/gyreSnare.js:2699`, `systems/gyreSnare.js:2737`, `systems/gyreSnare.js:2746`, `systems/gyreSnare.js:2768`, `systems/gyreSnare.js:2870`, `systems/gyreSnare.js:2949`, `systems/gyreSnare.js:2959`, `systems/gyreSnare.js:3003`, `systems/heroManeuvers.js:447`, `systems/heroManeuvers.js:487`, `systems/heroManeuvers.js:733`, `systems/heroManeuvers.js:743`, `systems/hullBurst.js:238`, `systems/hullBurst.js:401`, `systems/hullBurst.js:432`, `systems/hullBurst.js:546`, `systems/hullBurst.js:618`, `systems/hullFracture.js:565`, `systems/hullFracture.js:703`, `systems/impulseCharges.js:663`, `systems/impulseCharges.js:770`, `systems/impulseCharges.js:991`, `systems/impulseCharges.js:1186`, `systems/impulseCharges.js:1300`, `systems/jettisonImpulse.js:78`, `systems/lineHeads.js:233`, `systems/machineWork.js:214`, `systems/machineWork.js:264`, `systems/machineWork.js:323`, `systems/machineWork.js:399`, `systems/machineWork.js:481`, `systems/massSeed.js:181`, `systems/massSeed.js:554`, `systems/massSeed.js:597`, `systems/masslineThrow.js:246`, `systems/masslineThrow.js:572`, `systems/masslineThrow.js:659`, `systems/mining.js:1007`, `systems/mining.js:2668`, `systems/morrow.js:201`, `systems/phaseBlink.js:193`, `systems/phaseBlink.js:338`, `systems/precursorMachines.js:194`, `systems/precursorMachines.js:580`, `systems/precursorMachines.js:670`, `systems/precursorMachines.js:1053`, `systems/precursorMachines.js:1111`, `systems/presentationAdapters.js:322`, `systems/presentationAdapters.js:699`, `systems/presentationOrchestrator.js:525`, `systems/ravel.js:131`, `systems/rubric.js:307`, `systems/ruckus.js:143`, `systems/runawayKilnRuntime.js:188`, `systems/runawayKilnRuntime.js:206`, `systems/ruud.js:553`, `systems/ruud.js:557`, `systems/salvage.js:1091`, `systems/salvage.js:1193`, `systems/salvage.js:1249`, `systems/shieldPylons.js:347`, `systems/shieldPylons.js:367`, `systems/shieldPylons.js:377`, `systems/shipjack.js:91`, `systems/solstice.js:296`, `systems/special500DeathBell.js:87`, `systems/special500ForgeKaraoke.js:87`, `systems/special500Spectacle.js:151`, `systems/tacticalAI.js:1095`, `systems/theBolus.js:362`, `systems/tumbleStates.js:563`, `systems/tumbleStates.js:678`, `systems/twoShipsOneMistakeRuntime.js:193`, `systems/vesper.js:245`, `systems/volatileExposure.js:494`, `systems/volatileExposure.js:568`, `systems/weapons.js:2211`, `systems/weapons.js:2343`, `ui/commsRadial.js:585`, `ui/commsRadial.js:625`, `ui/commsRadial.js:639`, `ui/commsRadial.js:856`, `ui/commsRadial.js:899`, `ui/hud.js:2500`, `ui/hud.js:3979`, `ui/hud.js:4017`, `ui/hud.js:4247`, `ui/hud.js:4307`, `ui/hud.js:4352`, `ui/hud.js:4371`, `ui/hud.js:4459`, `ui/hud.js:4601`, `ui/hud.js:4967`, `ui/input.js:378`, `ui/input.js:501`, `ui/input.js:558`, `ui/input.js:582`, `ui/input.js:620`, `ui/input.js:626`, `ui/input.js:720`, `ui/input.js:791`, `ui/input.js:797`, `ui/input.js:804`, `ui/input.js:1035`, `ui/input.js:1272`, `ui/input.js:1277`, `ui/input.js:1295`, `ui/input.js:1300`, `ui/input.js:1393`, `ui/input.js:1402`, `ui/input.js:1407`, `ui/input.js:1416`, `ui/input.js:1431`, `ui/input.js:1473`, `ui/input.js:1489`, `ui/input.js:1493`, `ui/input.js:1506`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:578`, `ui/screens/base.js:1293`, `ui/screens/base.js:1545`, `ui/screens/missionLog.js:2279`, `ui/screens/missionLog.js:2283`, `ui/screens/missionLog.js:2287`, `ui/screens/missionLog.js:2291`, `ui/screens/missionLog.js:2307`, `ui/screens/missionLog.js:2315`, `ui/screens/missionLog.js:2322`, `ui/screens/missionLog.js:2329`, `ui/screens/missionLog.js:2337`, `ui/screens/missionLog.js:2344`, `ui/screens/missionLog.js:2351`, `ui/screens/missionLog.js:2360`, `ui/screens/missionLog.js:2367`, `ui/screens/missionLog.js:2383`, `ui/screens/missionLog.js:2414`, `ui/screens/missionLog.js:2434`, `ui/shipLedgerPanel.js:252`, `ui/shipLedgerPanel.js:520`, `ui/shipLedgerPanel.js:527`, `ui/station/screens/bar.js:681`, `ui/station/screens/bar.js:779`, `ui/station/screens/bar.js:783`, `ui/station/screens/bar.js:787`, `ui/station/screens/bar.js:809`, `ui/station/screens/bar.js:823`, `ui/station/screens/bar.js:865`, `ui/station/screens/bar.js:920`, `ui/station/screens/bar.js:929`, `ui/station/screens/contracts.js:1484`, `ui/station/screens/contracts.js:1495`, `ui/station/screens/contracts.js:1531`, `ui/station/screens/contracts.js:1534`, `ui/station/screens/contracts.js:1620`, `ui/station/screens/factions.js:413`, `ui/station/screens/industry.js:494`, `ui/station/screens/industry.js:544`, `ui/station/screens/industry.js:581`, `ui/station/screens/industry.js:590`, `ui/station/screens/industry.js:598`, `ui/station/screens/industry.js:604`, `ui/station/screens/industry.js:614`, `ui/station/screens/market.js:1636`, `ui/station/screens/market.js:2455`, `ui/station/screens/market.js:2527`, `ui/station/screens/market.js:2560`, `ui/station/screens/market.js:2576`, `ui/station/screens/market.js:2639`, `ui/station/screens/market.js:2654`, `ui/station/screens/market.js:2852`, `ui/station/screens/shipworks.js:930`, `ui/station/screens/shipworks.js:4113`, `ui/station/screens/shipworks.js:4546`, `ui/station/screens/shipworks.js:5191`, `ui/station/screens/shipworks.js:5262`, `ui/station/screens/shipworks.js:5279`, `ui/station/screens/shipworks.js:5292`, `ui/station/screens/shipworks.js:5296`, `ui/station/screens/shipworks.js:5301`, `ui/station/screens/shipworks.js:5331`, `ui/station/screens/shipworks.js:5349`, `ui/station/screens/shipworks.js:5385`, `ui/station/screens/shipworks.js:5407`, `ui/station/screens/shipworks.js:5409`, `ui/station/screens/shipworks.js:5427`, `ui/station/screens/shipworks.js:5474`, `ui/station/screens/shipworks.js:5529`, `ui/station/screens/shipworks.js:5543`, `ui/station/screens/shipworks.js:5550`, `ui/station/screens/shipworks.js:5608`, `ui/station/screens/shipworks.js:5619`, `ui/station/screens/shipworks.js:5626`, `ui/station/screens/shipworks.js:5668`, `ui/station/screens/shipworks.js:5679`, `ui/station/screens/shipworks.js:5690`, `ui/station/screens/shipworks.js:5700`, `ui/station/screens/shipworks.js:5705`, `ui/station/screens/shipworks.js:5713`, `ui/station/screens/shipworks.js:5722`, `ui/station/screens/shipworks.js:5729`, `ui/station/screens/shipworks.js:5885`, `ui/station/screens/shipworks.js:5895`, `ui/station/screens/shipworks.js:5905`, `ui/station/screens/shipworks.js:5915`, `ui/station/screens/shipworks.js:5977`, `ui/station/screens/shipworks.js:6014`, `ui/station/screens/shipworks.js:6018`, `ui/station/screens/shipworks.js:6046`, `ui/station/screens/shipworks.js:6051`, `ui/station/screens/shipworks.js:6073`, `ui/station/screens/shipworks.js:6077`, `ui/station/stationApp.js:781`, `ui/station/stationApp.js:1192`, `ui/station/stationApp.js:1228`, `ui/station/stationLife.js:33`, `ui/toasts.js:413`, `ui/uiRoot.js:1633`, `ui/wingmanRadial.js:221`, `ui/wingmanRadial.js:244`, `ui/wingmanRadial.js:269`, `ui/wingmanRadial.js:306`, `ui/wingmanRadial.js:331`, `world/motionFossil.js:188` | `audio/audioSystem.js:3146` |
| `audio:outputDeviceChanged` | `audio/audioSystem.js:3514` | — |
| `automation:assetDistressed` | `systems/automation.js:2325` | `ui/automationPayoff.js:88` |
| `automation:assetLost` | `systems/automation.js:3003` | `systems/intervention.js:70`, `systems/lossLedger.js:460`, `systems/missions.js:2041` |
| `automation:assetRepossessed` | `systems/automation.js:2372` | `ui/automationPayoff.js:95` |
| `automation:assetResumed` | `systems/automation.js:2787` | — |
| `automation:droneDistressed` | `systems/automation.js:1651` | — |
| `automation:droneRecovered` | `systems/automation.js:1727` | — |
| `automation:fleetChanged` | `systems/automation.js:2864`, `systems/automation.js:2884`, `systems/automation.js:2897`, `systems/automation.js:2902`, `systems/automation.js:2906`, `systems/automation.js:2914`, `systems/automation.js:2933`, `systems/automation.js:2983`, `systems/ships.js:2993`, `systems/ships.js:3047` | — |
| `automation:incomeCredited` | `systems/automation.js:2403`, `systems/automation.js:2414`, `systems/automation.js:3284` | — |
| `automation:interact` | `systems/automation.js:3916` | — |
| `automation:offlineSummary` | `systems/automation.js:3041`, `systems/automation.js:3065`, `systems/automation.js:3089`, `systems/automation.js:3112`, `systems/automation.js:3331` | `ui/automationPayoff.js:85`, `ui/dockArrival.js:152` |
| `automation:outpostRaided` | `systems/automation.js:2245`, `systems/automation.js:3406` | `systems/lossLedger.js:461` |
| `automation:outpostsChanged` | `systems/automation.js:2844`, `systems/automation.js:2855` | — |
| `automation:programAssigned` | `systems/automation.js:2587` | `systems/missions.js:2040`, `ui/screens/automationPanel.js:1841` |
| `automation:programInterrupted` | `systems/alphabet.js:223`, `systems/alphabet.js:588`, `systems/alphabet.js:596` | — |
| `automation:programRejected` | `systems/automation.js:2553`, `systems/automation.js:2560` | `ui/screens/automationPanel.js:1836` |
| `automation:reactionAssigned` | `systems/automation.js:2602` | — |
| `automation:reactionCleared` | `systems/automation.js:2613` | — |
| `automation:traderCycleCompleted` | `systems/automation.js:1976` | `ui/screens/automationPanel.js:1142` |
| `band:bearingReceipt` | `systems/bandRadio.js:709` | `systems/presentationOrchestrator.js:203` |
| `band:bearingRequest` | `systems/bandRadio.js:682` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:919`, `systems/uniqueWrecks.js:962` | `render/authoredMotion.js:1177` |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:926`, `systems/uniqueWrecks.js:934`, `systems/uniqueWrecks.js:948` | `ui/bandHud.js:107` |
| `band:bed` | `systems/bandRadio.js:766` | `audio/audioSystem.js:3317` |
| `band:cycle` | `ui/bandHud.js:102`, `ui/input.js:667` | — |
| `band:status` | `systems/bandRadio.js:748` | `ui/bandHud.js:106` |
| `barkDirector:silence` | — | `audio/audioSystem.js:2920` |
| `barkDirector:voice` | `features/salvageOutfits/presentation.js:103`, `systems/barkDirector.js:922`, `ui/station/stationArrival.js:121`, `ui/station/stationLife.js:41`, `ui/voiceArbiter.js:894` | `audio/audioSystem.js:3267` |
| `beacon:deploy` | — | `systems/beacons.js:52` |
| `beacon:deployed` | `systems/beacons.js:89` | `render/shipMicroMotion.js:1772`, `systems/onboarding.js:1066` |
| `beam:denied` | `systems/mining.js:471`, `systems/mining.js:552`, `systems/mining.js:668`, `systems/mining.js:684`, `systems/mining.js:696`, `systems/mining.js:727` | `render/authoredMotion.js:1149` |
| `beam:repaired` | `systems/mining.js:803` | — |
| `beam:transferred` | `systems/mining.js:863` | — |
| `body:sled` | — | `systems/spectrum/live.js:63` |
| `bombs:armed` | `systems/bombs.js:1224` | `audio/bombAudio.js:440` |
| `bombs:commanded` | `systems/bombs.js:1179` | `systems/fields.js:483` |
| `bombs:cycle` | `systems/bombs.js:817`, `systems/bombs.js:827`, `systems/bombs.js:1157` | `audio/bombAudio.js:469` |
| `bombs:denied` | `systems/bombs.js:684`, `systems/bombs.js:804`, `systems/bombs.js:844`, `systems/bombs.js:881`, `systems/bombs.js:920`, `systems/bombs.js:945`, `systems/bombs.js:1097`, `systems/bombs.js:1116` | — |
| `bombs:destroyed` | `systems/bombs.js:1676` | `audio/bombAudio.js:441`, `render/vfx.js:2923` |
| `bombs:detonated` | `systems/bombs.js:1283` | `audio/bombAudio.js:444`, `render/vfx.js:2921` |
| `bombs:dropped` | `systems/bombs.js:1165` | `audio/bombAudio.js:438`, `render/ordnanceMotionPresentation.js:266`, `systems/onboarding.js:925` |
| `bombs:fieldEnded` | `systems/bombs.js:1575` | `audio/bombAudio.js:452`, `render/vfx.js:2922` |
| `bombs:primed` | `systems/bombs.js:1191` | `audio/bombAudio.js:439`, `ui/stuntCallout.js:1028` |
| `bombs:rackChanged` | `systems/bombs.js:1047` | `audio/bombAudio.js:474` |
| `bombs:redirected` | `systems/bombs.js:1642` | — |
| `bombs:released` | `systems/bombs.js:1700` | `audio/bombAudio.js:455` |
| `bombs:stockChanged` | `systems/bombs.js:851`, `systems/bombs.js:969`, `systems/bombs.js:1162` | — |
| `borrowedSun:charter` | `ui/borrowedSunPrompt.js:35` | — |
| `borrowedSun:collectorsOut` | `systems/borrowedSun.js:1248` | — |
| `borrowedSun:contract` | `systems/borrowedSun.js:1041` | — |
| `borrowedSun:contractAccepted` | `systems/borrowedSun.js:1060` | — |
| `borrowedSun:contractClosed` | `systems/borrowedSun.js:1143`, `systems/borrowedSun.js:1157` | — |
| `borrowedSun:debtEscalated` | `systems/borrowedSun.js:1207`, `systems/borrowedSun.js:1446` | — |
| `borrowedSun:debtPosted` | `systems/borrowedSun.js:1174` | — |
| `borrowedSun:debtSettle` | `ui/borrowedSunPrompt.js:36` | — |
| `borrowedSun:debtSettled` | `systems/borrowedSun.js:953`, `systems/borrowedSun.js:1191`, `systems/borrowedSun.js:1286` | — |
| `borrowedSun:deed` | `systems/borrowedSun.js:657` | — |
| `borrowedSun:freightPosted` | `systems/borrowedSun.js:1080` | — |
| `borrowedSun:leaseBeat` | `systems/borrowedSun.js:914` | — |
| `borrowedSun:leaseBuy` | `ui/borrowedSunPrompt.js:34` | — |
| `borrowedSun:leaseClosed` | `systems/borrowedSun.js:970` | — |
| `borrowedSun:leaseSold` | `systems/borrowedSun.js:883` | — |
| `borrowedSun:levy` | `systems/borrowedSun.js:1278` | — |
| `borrowedSun:lost` | `systems/borrowedSun.js:614` | — |
| `borrowedSun:notice` | `systems/borrowedSun.js:531` | — |
| `borrowedSun:offer` | `systems/borrowedSun.js:601` | `ui/borrowedSunPrompt.js:5` |
| `borrowedSun:phase` | `systems/borrowedSun.js:521` | `ui/borrowedSunPrompt.js:8` |
| `borrowedSun:record` | `systems/borrowedSun.js:676` | — |
| `borrowedSun:regard` | `systems/borrowedSun.js:660` | — |
| `borrowedSun:route` | `ui/borrowedSunPrompt.js:33` | — |
| `borrowedSun:sailDeployed` | `systems/borrowedSun.js:764` | — |
| `borrowedSun:sailLost` | `systems/borrowedSun.js:1423` | — |
| `borrowedSun:shadowFilled` | `systems/borrowedSun.js:1381` | — |
| `borrowedSun:shadowLapsed` | `systems/borrowedSun.js:994`, `systems/borrowedSun.js:1353` | — |
| `borrowedSun:shadowPosted` | `systems/borrowedSun.js:1011` | — |
| `borrowedSun:shadowProgress` | `systems/borrowedSun.js:1370` | — |
| `borrowedSun:wash` | `systems/borrowedSun.js:821` | — |
| `borrowedVoice:disposition` | `ui/borrowedVoicePrompt.js:16` | — |
| `borrowedVoice:dispositionAccepted` | `systems/borrowedVoice.js:155` | — |
| `borrowedVoice:fragmentRecovered` | `systems/borrowedVoice.js:117` | — |
| `borrowedVoice:offer` | `systems/borrowedVoice.js:127` | `ui/borrowedVoicePrompt.js:4` |
| `boss:defeated` | `systems/world.js:1109` | `systems/survivalAnnounce.js:402` |
| `bouncer:banned` | `systems/bouncer.js:725` | — |
| `bouncer:ejected` | `systems/bouncer.js:684` | — |
| `bouncer:muscleHired` | `systems/bouncer.js:776` | — |
| `bouncer:muscleShove` | `systems/bouncer.js:928` | — |
| `bouncer:muscleStandDown` | `systems/bouncer.js:861` | — |
| `bouncer:offense` | `systems/bouncer.js:530` | — |
| `bouncer:vipDischarge` | `systems/bouncer.js:575` | — |
| `bouncer:vipEarned` | `systems/bouncer.js:560` | — |
| `bouncer:wanted` | `systems/bouncer.js:706` | — |
| `bouncer:wantedCleared` | `systems/bouncer.js:799` | — |
| `bouncer:warned` | `systems/bouncer.js:632` | — |
| `bounty:cleared` | `systems/economy.js:4883` | `systems/heat.js:437` |
| `bounty:cooled` | `systems/heat.js:771` | `systems/barkDirector.js:837` |
| `bracket:bank` | `systems/bracket.js:182` | — |
| `bracket:matchFinished` | `systems/bracket.js:239` | — |
| `bracket:matchStarted` | `systems/bracket.js:143` | — |
| `bracket:save` | `systems/bracket.js:188` | — |
| `bracket:shotResolved` | `systems/bracket.js:227` | — |
| `bracket:voice` | `systems/bracket.js:123` | — |
| `breakwaterSpur:action` | `features/breakwaterSpur/presentation.js:65` | `features/breakwaterSpur/runtime.js:71` |
| `breakwaterSpur:close` | `features/breakwaterSpur/runtime.js:140` | `features/breakwaterSpur/presentation.js:32` |
| `breakwaterSpur:cue` | `features/breakwaterSpur/freight.js:72`, `features/breakwaterSpur/runtime.js:121` | `features/breakwaterSpur/presentation.js:101` |
| `breakwaterSpur:offer` | `features/breakwaterSpur/runtime.js:133`, `features/breakwaterSpur/runtime.js:245` | `features/breakwaterSpur/presentation.js:30`, `ui/screens/missionLog.js:2555` |
| `breakwaterSpur:receipt` | `features/breakwaterSpur/runtime.js:284`, `features/breakwaterSpur/runtime.js:306`, `features/breakwaterSpur/runtime.js:308`, `features/breakwaterSpur/runtime.js:315`, `features/breakwaterSpur/runtime.js:339`, `features/breakwaterSpur/runtime.js:345`, `features/breakwaterSpur/runtime.js:350`, `features/breakwaterSpur/runtime.js:355`, `features/breakwaterSpur/runtime.js:360`, `features/breakwaterSpur/runtime.js:367`, `features/breakwaterSpur/runtime.js:386`, `features/breakwaterSpur/runtime.js:393`, `features/breakwaterSpur/runtime.js:417` | `features/breakwaterSpur/presentation.js:31`, `ui/screens/missionLog.js:2556` |
| `buildIdentity:revealed` | `systems/buildIdentity.js:327` | `audio/audioSystem.js:3015` |
| `bulletTime:end` | `systems/bulletTime.js:233` | `audio/audioSystem.js:3316` |
| `bulletTime:start` | `systems/bulletTime.js:215` | `audio/audioSystem.js:3313`, `systems/onboarding.js:1025` |
| `calendar:festival` | `systems/worldClock.js:103` | — |
| `calendar:marketDay` | `systems/worldClock.js:121` | — |
| `calendar:rushHour` | `systems/worldClock.js:149` | — |
| `calendar:stormSeason` | `systems/worldClock.js:88` | — |
| `camera:shake` | `matter/collectorKnot.js:412`, `render/shipMicroMotion.js:2761`, `render/vfx/explosionPresentationVfx.js:91`, `render/vfx/explosionPresentationVfx.js:391`, `render/vfx/explosionPresentationVfx.js:737`, `systems/combat.js:687`, `systems/combat.js:858`, `systems/combat.js:1074`, `systems/drill.js:1538`, `systems/drill.js:1653`, `systems/drill.js:1980`, `systems/flybyFocus.js:539`, `systems/gyreSnare.js:551`, `systems/gyreSnare.js:1245`, `systems/gyreSnare.js:1635`, `systems/gyreSnare.js:2862`, `systems/gyreSnare.js:2942`, `systems/intervention.js:262`, `systems/presentationAdapters.js:612`, `systems/survivalAnnounce.js:867`, `systems/tetherGameplay.js:775` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:874`, `ui/input.js:878`, `ui/input.js:1119` | — |
| `capitalBoss:actChanged` | — | `ui/toasts.js:772` |
| `capitalBoss:actRetried` | `systems/capitalBossEncounters.js:478` | — |
| `capitalBoss:countered` | — | `ui/toasts.js:781` |
| `capitalBoss:detach` | `systems/missions.js:2072` | — |
| `capitalBoss:disarmed` | — | `ui/toasts.js:783` |
| `capitalBoss:ended` | — | `ui/toasts.js:798` |
| `capitalBoss:hit` | — | `ui/toasts.js:790` |
| `capitalBoss:plateTorn` | `systems/capitalBossEncounters.js:418` | — |
| `capitalBoss:recovery` | — | `ui/toasts.js:782` |
| `capitalBoss:start` | `systems/missionObjectiveOps.js:2152` | `systems/swarmJuice.js:167` |
| `capitalBoss:started` | — | `ui/toasts.js:765` |
| `capitalBoss:telegraph` | — | `render/authoredMotion.js:1205`, `ui/toasts.js:753` |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:471`, `systems/capitalBossEncounters.js:497`, `systems/capitalBossEncounters.js:521` | — |
| `captain:remembered` | `systems/captainMemory.js:92` | — |
| `cargo:breakwaterFreightAccepted` | `systems/cargo.js:1589` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:861` | `systems/world.js:750` |
| `cargo:changed` | `features/salvageTender/physical.js:398`, `systems/cargo.js:492`, `systems/mining.js:2910` | `audio/audioSystem.js:2944`, `systems/moistureLoss.js:89`, `systems/onboarding.js:826`, `systems/ships.js:1969`, `ui/cargoConscience.js:143`, `ui/commandBar.js:464` |
| `cargo:cinderglassReceived` | `features/cinderglassJob/ownerSeams.js:46` | — |
| `cargo:delivered` | `systems/asteroidSites.js:3042`, `systems/missions.js:4995`, `systems/missions.js:5054`, `systems/missions.js:5178`, `systems/missions.js:5228` | `systems/economy.js:1799` |
| `cargo:fragileLost` | `systems/fragileCargo.js:320` | — |
| `cargo:full` | `systems/cargo.js:600`, `systems/cargo.js:853`, `systems/mining.js:1863`, `systems/mining.js:2888` | `audio/audioSystem.js:2945`, `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:829`, `systems/presentationOrchestrator.js:223`, `ui/alerts.js:606` |
| `cargo:hotDockSpill` | `systems/cargo.js:1303` | — |
| `cargo:jettison` | `ui/hud.js:3987` | — |
| `cargo:jettisoned` | `systems/cargo.js:1686` | `audio/audioSystem.js:2983`, `render/authoredMotion.js:1214`, `render/shipMicroMotion.js:1770`, `systems/barkDirector.js:825`, `systems/cloak.js:57`, `systems/jettisonImpulse.js:54`, `systems/lawSecurity.js:432`, `systems/onboarding.js:1007`, `systems/onboarding.js:1074` |
| `cargo:massSettled` | `systems/cargo.js:1026` | `systems/presentationOrchestrator.js:222`, `systems/ships.js:1970` |
| `cargo:parkedHoldSwapped` | `systems/cargo.js:1180` | `systems/shipControlTransfer.js:142` |
| `cargo:parkedTransfer` | `systems/cargo.js:1242` | — |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:podIntake` | `systems/economy.js:3908` | `systems/economy.js:1809` |
| `cargo:radiationCooked` | `systems/fragileCargo.js:152` | — |
| `cargo:tallyThreeDelivered` | `systems/economy.js:4323` | — |
| `cargo:vesselFreightReleased` | `systems/cargo.js:1436` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:1031` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:1067` | — |
| `cargo:volatileExposed` | `systems/volatileExposure.js:384` | — |
| `cargo:volatileRupture` | `systems/volatileExposure.js:548` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:951`, `systems/lootShards.js:1007` | `systems/volatileExposure.js:218` |
| `cargo:volatileVent` | `systems/volatileExposure.js:472` | — |
| `ceresWorkfleet:interrupted` | `systems/ceresWorkfleet.js:315` | — |
| `chain:detonated` | `systems/impulseCharges.js:971` | `systems/fields.js:472` |
| `chain:primeEnded` | `systems/impulseCharges.js:934` | — |
| `chain:primed` | `systems/impulseCharges.js:911` | — |
| `chain:slam` | `systems/impulseCharges.js:845`, `systems/impulseCharges.js:865` | `systems/fields.js:471` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1190`, `systems/tetherGameplay.js:2489` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:1182` | `systems/onboarding.js:1033` |
| `charge:armed` | `systems/impulseCharges.js:1008` | — |
| `charge:combo` | `systems/impulseCharges.js:1224`, `systems/impulseCharges.js:1283` | `systems/tetherGameplay.js:352` |
| `charge:detonated` | `systems/impulseCharges.js:654`, `systems/impulseCharges.js:762`, `systems/impulseCharges.js:983`, `systems/impulseCharges.js:1291` | `audio/audioSystem.js:3040`, `render/feel.js:1573`, `render/vfx.js:2919`, `systems/fields.js:473`, `systems/fields.js:484`, `systems/flightV3.js:232`, `systems/gamepad.js:1008` |
| `charge:stuck` | `systems/impulseCharges.js:1089` | `render/ordnanceMotionPresentation.js:268`, `render/shipMicroMotion.js:1769` |
| `charge:thrown` | `systems/impulseCharges.js:1169` | `render/ordnanceMotionPresentation.js:267` |
| `choir:bellHeadRing` | `systems/faction_choir.js:735` | — |
| `choir:bellPulse` | `systems/faction_choir.js:554` | — |
| `choir:blessing` | `systems/faction_choir.js:800` | — |
| `choir:blessingEnded` | `systems/faction_choir.js:811` | — |
| `choir:circuitComplete` | `systems/faction_choir.js:977` | — |
| `choir:crystalShattered` | `systems/faction_choir.js:584` | — |
| `choir:devotionalYield` | `systems/faction_choir.js:1136` | — |
| `choir:escortComplete` | `systems/faction_choir.js:1415` | — |
| `choir:escortRequest` | `systems/faction_choir.js:1297` | — |
| `choir:heresyLapsed` | `systems/faction_choir.js:1503`, `systems/faction_choir.js:1511` | — |
| `choir:heresyMarked` | `systems/faction_choir.js:1480` | — |
| `choir:heresyResolved` | `systems/faction_choir.js:1625` | — |
| `choir:offering` | `systems/faction_choir.js:1103` | — |
| `choir:pilgrimArrived` | `systems/faction_choir.js:1419` | — |
| `choir:pilgrimLeg` | `systems/faction_choir.js:939` | — |
| `choir:pilgrimLost` | `systems/faction_choir.js:1439` | — |
| `choir:pilgrimSpawn` | `systems/faction_choir.js:1350` | — |
| `choir:pilgrimVisit` | `systems/faction_choir.js:896` | — |
| `choir:relicAlarm` | `systems/faction_choir.js:677` | — |
| `choir:relicCracked` | `systems/faction_choir.js:645` | — |
| `choir:relicPing` | `systems/faction_choir.js:663` | — |
| `choir:sacrilege` | `systems/faction_choir.js:858` | — |
| `choir:sanctuary` | `systems/faction_choir.js:844`, `systems/faction_choir.js:874` | — |
| `choir:siteRaised` | `systems/faction_choir.js:1680`, `systems/faction_choir.js:1701` | — |
| `choir:titheAssessed` | `systems/faction_choir.js:1028` | — |
| `choir:tithePaid` | `systems/faction_choir.js:1047` | — |
| `choir:tribute` | `systems/faction_choir.js:697` | — |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:22` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:23` |
| `cinderglassJob:action` | `features/cinderglassJob/integration.js:39` | — |
| `cinderglassJob:close` | `features/cinderglassJob/runtime.js:448` | — |
| `cinderglassJob:fact` | `features/cinderglassJob/runtime.js:305`, `features/cinderglassJob/runtime.js:435` | — |
| `cinderglassJob:offer` | `features/cinderglassJob/runtime.js:149` | — |
| `cinderglassJob:refused` | `features/cinderglassJob/runtime.js:393` | `ui/screens/missionLog.js:2558` |
| `cinderglassJob:servicePrompt` | `features/cinderglassJob/runtime.js:289`, `features/cinderglassJob/runtime.js:448` | — |
| `cinderglassJob:view` | `features/cinderglassJob/runtime.js:446` | `features/cinderglassJob/integration.js:89`, `ui/screens/missionLog.js:2557` |
| `claim:claimed` | `systems/claims.js:410` | `systems/onboarding.js:914`, `systems/story.js:265`, `systems/traffic.js:1888` |
| `claim:convoyAbandoned` | `systems/claims.js:1389` | `systems/traffic.js:1891` |
| `claim:convoyDocked` | `systems/trafficConvoyOps.js:210` | `systems/claims.js:371` |
| `claim:convoyManifested` | `systems/trafficConvoyOps.js:110` | `systems/claims.js:370` |
| `claim:defenseDelegate` | — | `systems/claims.js:362` |
| `claim:defenseDelegateRefused` | `systems/claims.js:1768` | — |
| `claim:defenseEncounterRequested` | `systems/claims.js:1650` | — |
| `claim:defenseGo` | — | `systems/claims.js:361` |
| `claim:defenseIgnore` | — | `systems/claims.js:357` |
| `claim:defenseResolved` | `systems/claims.js:1850` | `ui/encounterChoicePrompt.js:181` |
| `claim:defenseStarted` | `systems/claims.js:1660` | `ui/encounterChoicePrompt.js:180` |
| `claim:defenseWarning` | `systems/claims.js:1557`, `systems/claims.js:1675` | `systems/encounterDirector.js:411`, `ui/encounterChoicePrompt.js:177` |
| `claim:depotPatrolCompleted` | `systems/claims.js:3024` | `systems/factions.js:541` |
| `claim:depotPatrolRotation` | `systems/claims.js:2980` | — |
| `claim:depotPatrolSpent` | `systems/claims.js:1755` | — |
| `claim:depotSupport` | `systems/claims.js:2891`, `systems/claims.js:2917` | — |
| `claim:freightDelivered` | `systems/trafficConvoyOps.js:421` | — |
| `claim:infrastructureActive` | `systems/claims.js:1072`, `systems/claims.js:2685` | `systems/traffic.js:1886` |
| `claim:infrastructureConstructed` | `systems/claims.js:477`, `systems/claims.js:2622` | — |
| `claim:infrastructureStatus` | `systems/claims.js:1083` | `systems/traffic.js:1887` |
| `claim:moduleBuilt` | `systems/claims.js:495` | — |
| `claim:raidRepelled` | `systems/claims.js:1506` | — |
| `claim:raidWarning` | `systems/claims.js:1499` | `audio/audioSystem.js:3008` |
| `claim:receipt` | `systems/claims.js:2070` | — |
| `claim:sensorPostRumor` | `systems/claims.js:1132` | `systems/world.js:794` |
| `claim:specialized` | `systems/claims.js:536` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:3158` | — |
| `claims:migrated` | `systems/claims.js:2248` | — |
| `cloak:burned` | `systems/cloak.js:306` | `audio/audioSystem.js:2873` |
| `cloak:dropped` | `systems/cloak.js:240` | `audio/audioSystem.js:2868`, `render/authoredMotion.js:1209`, `render/shipMicroMotion.js:1766` |
| `cloak:engaged` | `systems/cloak.js:200` | `render/authoredMotion.js:1208`, `render/shipMicroMotion.js:1765`, `systems/gamepad.js:1013`, `systems/onboarding.js:1029` |
| `cloak:faded` | `systems/aiPorts.js:1301` | `audio/audioSystem.js:2867` |
| `coldburnRey:playerDelivered` | `systems/missions.js:5676` | — |
| `coldburnRey:raceSettled` | `systems/coldburnRey.js:91` | — |
| `collector:absorbed` | `matter/collectorKnot.js:174` | — |
| `collector:freed` | `matter/collectorKnot.js:114` | — |
| `collector:lost` | `matter/collectorKnot.js:123` | — |
| `collector:released` | `matter/collectorKnot.js:405` | — |
| `collector:snagged` | `matter/collectorKnot.js:154` | — |
| `collision:tearOff` | `systems/hullFracture.js:694` | `render/vfx.js:2805` |
| `combat:actionCancelled` | `combat/actions.js:373` | — |
| `combat:actionCompleted` | `combat/actions.js:359` | — |
| `combat:actionPhase` | `combat/actions.js:222` | — |
| `combat:actionRejected` | `combat/actions.js:395` | `ui/toasts.js:809` |
| `combat:actionStarted` | `combat/actions.js:189` | `systems/presentationOrchestrator.js:174`, `systems/scenarioRuntime.js:24` |
| `combat:aftermathChoices` | `systems/combatOutcome.js:494`, `systems/combatOutcome.js:563`, `systems/combatOutcome.js:575` | `ui/aftermathChoicePrompt.js:79` |
| `combat:aftermathChoose` | `ui/aftermathChoicePrompt.js:74` | `systems/combatOutcome.js:290` |
| `combat:aftermathChosen` | `systems/combatOutcome.js:256` | — |
| `combat:bankShot` | — | `render/vfx.js:2793` |
| `combat:baseDestroyed` | `systems/combat.js:844` | `systems/economy.js:1878`, `systems/gamepad.js:1118` |
| `combat:beamStop` | `systems/swarmFortifyEffects.js:305`, `systems/weapons.js:1446` | `audio/audioSystem.js:2779`, `render/asteroidMotionPresentation.js:523`, `render/vfx.js:2789` |
| `combat:bounceContinued` | `combat/attackHit.js:38` | `render/vfx.js:2794`, `systems/presentationOrchestrator.js:266` |
| `combat:chainKill` | — | `systems/killReplay.js:403` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:521` | `render/feel.js:1608`, `render/vfx.js:2803`, `systems/economy.js:1880`, `systems/fields.js:475`, `systems/gamepad.js:1000`, `systems/lawSecurity.js:403`, `systems/ships.js:2102`, `systems/swarmLegendaries.js:115` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:540` | `render/vfx.js:2804` |
| `combat:damage` | `combat/damage.js:540` | `audio/audioSystem.js:2794`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `data/encounters/367-the-salvage-tail.js:146`, `render/asteroidMotionPresentation.js:516`, `render/authoredMotion.js:1165`, `render/feel.js:1387`, `render/shipMicroMotion.js:1750`, `render/vfx.js:2795`, `save/saveSystem.js:510`, `systems/ai.js:108`, `systems/aiEncounter.js:137`, `systems/asteroidSites.js:777`, `systems/barkDirector.js:820`, `systems/cloak.js:53`, `systems/collisionConsequences.js:105`, `systems/combatOutcome.js:295`, `systems/cruise.js:60`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:382`, `systems/factionPresence.js:521`, `systems/gamepad.js:1126`, `systems/heat.js:377`, `systems/killReplay.js:391`, `systems/lawSecurity.js:402`, `systems/missions.js:2025`, `systems/npcJobsRuntime.js:1199`, `systems/npcJobsRuntime.js:1200`, `systems/onboarding.js:748`, `systems/onboarding.js:759`, `systems/onboarding.js:771`, `systems/presentationOrchestrator.js:168`, `systems/routeFollower.js:433`, `systems/salvageActions.js:142`, `systems/scenarioRuntime.js:30`, `systems/ships.js:2091`, `systems/special500HullLog.js:44`, `systems/stationBroadcast.js:265`, `systems/survivalResults.js:512`, `systems/survivalWave.js:203`, `systems/swarmElites.js:182`, `systems/swarmElites.js:183`, `systems/swarmElites.js:184`, `systems/swarmJuice.js:161`, `systems/titles.js:582`, `systems/traffic.js:1806`, `systems/volatileExposure.js:216`, `systems/world.js:743`, `ui/alerts.js:590`, `ui/commandBar.js:453`, `ui/uiRoot.js:970` |
| `combat:emp` | `combat/damage.js:545` | — |
| `combat:fire` | `systems/impulseCharges.js:696`, `systems/swarmFortifyEffects.js:302`, `systems/swarmFortifyEffects.js:406`, `systems/weapons.js:1329`, `systems/weapons.js:1425`, `systems/weapons.js:1653`, `systems/weapons.js:2072` | `audio/audioSystem.js:2778`, `data/stationBubbles.js:184`, `render/farPlaneLife.js:95`, `render/feel.js:1509`, `render/shipMicroMotion.js:1748`, `render/vfx.js:2788`, `systems/asteroidSites.js:594`, `systems/cloak.js:59`, `systems/cruise.js:68`, `systems/lawSecurity.js:404`, `systems/onboarding.js:672`, `systems/onboarding.js:685`, `systems/presentationOrchestrator.js:173`, `systems/story.js:270`, `systems/traffic.js:1807`, `systems/world.js:827` |
| `combat:hit` | `systems/salvageActions.js:624`, `systems/salvageActions.js:715` | `render/farPlaneLife.js:94`, `systems/routeFollower.js:431`, `systems/story.js:271` |
| `combat:hitAsset` | `systems/wingmen.js:239` | `systems/automation.js:601` |
| `combat:hullRepair` | `combat/kernel.js:517` | — |
| `combat:kill` | `systems/world.js:7182` | `systems/factionPresence.js:529` |
| `combat:lockChanged` | `systems/weapons.js:1051` | `systems/onboarding.js:784`, `systems/world.js:742`, `ui/alerts.js:599` |
| `combat:outcome` | `systems/combatOutcome.js:471` | `systems/barkDirector.js:817`, `ui/aftermathChoicePrompt.js:79` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:472` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:6359`, `systems/npcJobsRuntime.js:6725` | `combat/kernel.js:207` |
| `combat:requestAction` | — | `combat/kernel.js:204` |
| `combat:routeDamage` | `systems/bombs.js:1636`, `systems/capitalBossEncounters.js:125`, `systems/drill.js:1992`, `systems/foldAberrant.js:173`, `systems/hullBurst.js:554`, `systems/impulseCharges.js:1523`, `systems/mines.js:407`, `systems/missionObjectiveOps.js:2534`, `systems/theBolus.js:352`, `systems/tumbleStates.js:615` | `combat/kernel.js:206`, `systems/routeFollower.js:432` |
| `combat:shipjackPulse` | `combat/kernel.js:592` | — |
| `combat:shipjackShutdown` | `combat/kernel.js:607` | — |
| `combat:shockwavePass` | — | `render/asteroidMotionPresentation.js:518`, `render/vfx.js:2926` |
| `combat:shove` | `systems/onboarding.js:3437` | `audio/audioSystem.js:3020`, `systems/onboarding.js:684` |
| `combat:statusApplied` | `combat/statuses.js:212` | `render/vfx.js:2806`, `ui/stuntCallout.js:988` |
| `combat:statusExpired` | `combat/statuses.js:90`, `systems/bombs.js:1613` | `audio/bombAudio.js:464`, `systems/tumbleStates.js:143`, `ui/stuntCallout.js:1009` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:261`, `systems/encounterDirector.js:373`, `systems/factionPresence.js:519`, `systems/npcJobsRuntime.js:1204`, `systems/presentationOrchestrator.js:245`, `systems/surrenderRecovery.js:92`, `systems/tumbleStates.js:147`, `systems/wingMorale.js:202`, `ui/alerts.js:580` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1768`, `systems/factionPresence.js:520`, `systems/npcJobsRuntime.js:1205`, `systems/presentationOrchestrator.js:254`, `systems/surrenderRecovery.js:93`, `ui/alerts.js:585` |
| `combat:surrendered` | — | `systems/combatOutcome.js:262`, `systems/surrenderRecovery.js:91` |
| `combat:thrownWreck` | `systems/deedRecord.js:524` | `systems/barkDirector.js:877` |
| `combat:tumbleRake` | `systems/tumbleStates.js:603` | `systems/barkDirector.js:876` |
| `combat:tumbled` | `systems/tumbleStates.js:561` | `render/shipMicroMotion.js:1751`, `systems/fields.js:474`, `systems/missions.js:1925`, `systems/tetherGameplay.js:346` |
| `combat:warded` | `combat/damage.js:500` | `audio/audioSystem.js:2906` |
| `combat:weakPointHit` | `combat/damage.js:433`, `systems/combat.js:751` | `render/vfx.js:2796` |
| `comms:log` | `data/boundaryField.js:42`, `data/curlField.js:41`, `data/encounters/344-opening-hauler-raid.js:37`, `data/encounters/344-opening-hauler-raid.js:559`, `data/encounters/344-opening-hauler-raid.js:587`, `data/encounters/350-the-long-tail.js:229`, `data/encounters/350-the-long-tail.js:264`, `data/encounters/350-the-long-tail.js:282`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:155`, `data/encounters/352-the-slot.js:175`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:144`, `data/encounters/355-the-winnow-throw.js:161`, `data/encounters/355-the-winnow-throw.js:168`, `data/encounters/355-the-winnow-throw.js:186`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:73`, `data/encounters/357-the-handoff.js:246`, `data/encounters/357-the-handoff.js:261`, `data/encounters/357-the-handoff.js:296`, `data/encounters/357-the-handoff.js:312`, `data/encounters/357-the-handoff.js:355`, `data/encounters/358-the-press-camp.js:117`, `data/encounters/358-the-press-camp.js:153`, `data/encounters/358-the-press-camp.js:344`, `data/encounters/358-the-press-camp.js:358`, `data/encounters/358-the-press-camp.js:372`, `data/encounters/358-the-press-camp.js:382`, `data/encounters/362-the-salvage-watch.js:446`, `data/encounters/367-the-salvage-tail.js:337`, `data/encounters/700-the-weighing.js:142`, `data/encounters/700-the-weighing.js:227`, `data/encounters/701-spine-break.js:137`, `data/encounters/701-spine-break.js:153`, `data/encounters/701-spine-break.js:190`, `data/encounters/701-spine-break.js:206`, `data/encounters/702-the-swap.js:55`, `data/encounters/702-the-swap.js:180`, `data/encounters/702-the-swap.js:201`, `data/encounters/703-too-perfect-pack.js:117`, `data/encounters/703-too-perfect-pack.js:162`, `data/encounters/704-claim-jump.js:128`, `data/encounters/704-claim-jump.js:145`, `data/encounters/705-the-nest.js:359`, `data/encounters/705-the-nest.js:397`, `data/encounters/705-the-nest.js:551`, `data/laneField.js:53`, `data/laneField.js:65`, `data/velocityPlane.js:46`, `features/industrialDisasters/presentation.js:104`, `features/salvageOutfits/index.js:70`, `systems/alienEcology.js:786`, `systems/alienEcology.js:815`, `systems/alienEcology.js:838`, `systems/alienEcology.js:917`, `systems/alienEcology.js:948`, `systems/alienEcology.js:958`, `systems/alienEcology.js:979`, `systems/alienEcology.js:986`, `systems/alienEcology.js:1005`, `systems/alienEcology.js:1345`, `systems/alienEcology.js:1537`, `systems/alienEcology.js:1674`, `systems/alienEcology.js:1707`, `systems/alienEcology.js:1749`, `systems/alienEcology.js:1784`, `systems/alienEcology.js:1789`, `systems/alienEcology.js:1858`, `systems/alienEcology.js:1940`, `systems/alienEcology.js:1952`, `systems/alienEcology.js:2005`, `systems/alienEcology.js:2347`, `systems/alienEcology.js:2426`, `systems/alienEcology.js:2777`, `systems/alienEcology.js:2805`, `systems/alienEcology.js:3092`, `systems/alienEcology.js:3120`, `systems/alienEcology.js:3131`, `systems/alienEcology.js:3190`, `systems/alienEcology.js:3232`, `systems/alienEcology.js:3436`, `systems/alphabet.js:235`, `systems/asteroidSites.js:1544`, `systems/automation.js:3901`, `systems/borrowedSun.js:668`, `systems/contractClauses.js:774`, `systems/docket.js:210`, `systems/docket.js:220`, `systems/economy.js:3868`, `systems/encounterDirector.js:3436`, `systems/encounterScripts.js:780`, `systems/encounterScripts.js:3634`, `systems/encounterScripts.js:3893`, `systems/faction_archive.js:628`, `systems/faction_archive.js:851`, `systems/faction_archive.js:863`, `systems/faction_archive.js:932`, `systems/faction_archive.js:964`, `systems/faction_choir.js:622`, `systems/faction_choir.js:646`, `systems/faction_choir.js:666`, `systems/faction_choir.js:680`, `systems/faction_choir.js:859`, `systems/faction_choir.js:860`, `systems/faction_choir.js:898`, `systems/faction_choir.js:940`, `systems/faction_choir.js:978`, `systems/faction_choir.js:1030`, `systems/faction_choir.js:1036`, `systems/faction_choir.js:1038`, `systems/faction_choir.js:1107`, `systems/faction_choir.js:1110`, `systems/faction_choir.js:1114`, `systems/faction_choir.js:1119`, `systems/faction_choir.js:1298`, `systems/faction_choir.js:1422`, `systems/faction_choir.js:1440`, `systems/faction_choir.js:1481`, `systems/faction_choir.js:1504`, `systems/faction_choir.js:1512`, `systems/faction_choir.js:1623`, `systems/faction_concord.js:215`, `systems/faction_frontier.js:750`, `systems/faction_frontier.js:1054`, `systems/faction_frontier.js:1174`, `systems/faction_frontier.js:1224`, `systems/faction_frontier.js:1285`, `systems/faction_frontier.js:1342`, `systems/faction_frontier.js:1430`, `systems/faction_frontier.js:2300`, `systems/faction_fulfillment.js:256`, `systems/faction_fulfillment.js:265`, `systems/faction_fulfillment.js:314`, `systems/faction_fulfillment.js:318`, `systems/faction_fulfillment.js:332`, `systems/faction_fulfillment.js:345`, `systems/faction_fulfillment.js:384`, `systems/faction_fulfillment.js:418`, `systems/faction_helix.js:570`, `systems/faction_helix.js:775`, `systems/faction_helix.js:843`, `systems/faction_meridian.js:433`, `systems/faction_meridian.js:734`, `systems/faction_pitborn.js:659`, `systems/faction_pitborn.js:769`, `systems/faction_pitborn.js:853`, `systems/faction_pitborn.js:879`, `systems/faction_pitborn.js:885`, `systems/faction_pitborn.js:888`, `systems/faction_pitborn.js:938`, `systems/faction_understory.js:954`, `systems/faction_understory.js:980`, `systems/faction_understory.js:1033`, `systems/faction_understory.js:1161`, `systems/faction_understory.js:1208`, `systems/faction_understory.js:1368`, `systems/faction_vael.js:486`, `systems/faction_vael.js:499`, `systems/faction_vael.js:648`, `systems/faction_vael.js:698`, `systems/faction_vael.js:818`, `systems/faction_vael.js:819`, `systems/faction_vael.js:847`, `systems/faction_verge.js:556`, `systems/faction_verge.js:1660`, `systems/faction_verge.js:1719`, `systems/faction_verge.js:1756`, `systems/faction_verge.js:1807`, `systems/faction_verge.js:1817`, `systems/faction_verge.js:1843`, `systems/faction_verge.js:1867`, `systems/factions.js:604`, `systems/foldAberrant.js:44`, `systems/impoundGrudge.js:1100`, `systems/lamplighter.js:635`, `systems/lineHeads.js:292`, `systems/machineWork.js:14`, `systems/massSignature.js:507`, `systems/massSignature.js:524`, `systems/massSignature.js:623`, `systems/missionObjectiveOps.js:1420`, `systems/morrow.js:253`, `systems/nestVisit.js:117`, `systems/nestVisit.js:137`, `systems/patrolBait.js:92`, `systems/precursorMachines.js:65`, `systems/precursorMachines.js:132`, `systems/precursorMachines.js:165`, `systems/precursorMachines.js:172`, `systems/precursorMachines.js:185`, `systems/precursorMachines.js:191`, `systems/precursorMachines.js:409`, `systems/precursorMachines.js:422`, `systems/precursorMachines.js:440`, `systems/precursorMachines.js:464`, `systems/precursorMachines.js:487`, `systems/precursorMachines.js:503`, `systems/precursorMachines.js:517`, `systems/precursorMachines.js:529`, `systems/precursorMachines.js:536`, `systems/precursorMachines.js:552`, `systems/precursorMachines.js:613`, `systems/precursorMachines.js:709`, `systems/precursorMachines.js:728`, `systems/precursorMachines.js:750`, `systems/precursorMachines.js:784`, `systems/precursorMachines.js:799`, `systems/precursorMachines.js:831`, `systems/precursorMachines.js:859`, `systems/precursorMachines.js:907`, `systems/precursorMachines.js:1026`, `systems/precursorMachines.js:1040`, `systems/precursorMachines.js:1086`, `systems/precursorMachines.js:1100`, `systems/precursorMachines.js:1166`, `systems/precursorMachines.js:1219`, `systems/precursorMachines.js:1227`, `systems/quill.js:483`, `systems/rubric.js:474`, `systems/salvage.js:181`, `systems/salvage.js:980`, `systems/salvage.js:1051`, `systems/salvage.js:1085`, `systems/salvage.js:1247`, `systems/shipjack.js:85`, `systems/special500CollectiveHours.js:78`, `systems/special500Confessional.js:206`, `systems/special500Confessional.js:244`, `systems/special500DeathBell.js:92`, `systems/special500Director.js:280`, `systems/special500DockLedger.js:166`, `systems/special500DockLedger.js:178`, `systems/special500DockLedger.js:191`, `systems/special500DockLedger.js:215`, `systems/special500DockLedger.js:239`, `systems/special500ForgeKaraoke.js:89`, `systems/special500HullLog.js:92`, `systems/special500HullLog.js:112`, `systems/special500Invoice.js:129`, `systems/special500Invoice.js:174`, `systems/special500Invoice.js:189`, `systems/special500PortraitBuoys.js:228`, `systems/special500Question.js:90`, `systems/special500Sommelier.js:108`, `systems/special500Sommelier.js:155`, `systems/special500Sommelier.js:161`, `systems/towlineTable.js:266`, `systems/uniqueWrecks.js:2088`, `systems/vesper.js:287`, `systems/wingmen.js:315`, `systems/wingmen.js:321`, `systems/wingmen.js:328`, `systems/worldPressure.js:238`, `systems/worldPressure.js:286`, `world/motionFossil.js:41`, `world/playerHullEcho.js:100`, `world/playerHullEcho.js:111`, `world/playerHullEcho.js:133`, `world/vestaWinnowRecovery.js:159`, `world/vestaWinnowRecovery.js:342`, `world/vestaWinnowRecovery.js:552` | `ui/floatingText.js:118` |
| `comms:message` | `systems/ceresWorkfleetStagecraft.js:71`, `systems/economy.js:4270`, `systems/precursorMachines.js:313`, `systems/trafficRoleOps.js:265`, `systems/trafficRoleOps.js:1284`, `systems/trafficRoleOps.js:1427` | — |
| `comms:popup` | `missions/lanternWardConversation.js:46`, `missions/lanternWardConversation.js:54`, `systems/ai.js:509`, `systems/bellhop.js:140`, `systems/bouncer.js:352`, `systems/bouncer.js:555`, `systems/bouncer.js:571`, `systems/bouncer.js:628`, `systems/bouncer.js:679`, `systems/bouncer.js:710`, `systems/bouncer.js:728`, `systems/careerContracts.js:456`, `systems/careerContracts.js:470`, `systems/careerContracts.js:486`, `systems/coldburnRey.js:64`, `systems/crew.js:250`, `systems/crew.js:361`, `systems/crew.js:382`, `systems/crew.js:507`, `systems/crew.js:523`, `systems/crew.js:539`, `systems/crew.js:561`, `systems/crew.js:570`, `systems/crew.js:590`, `systems/crew.js:614`, `systems/crew.js:623`, `systems/crew.js:646`, `systems/crew.js:667`, `systems/crew.js:692`, `systems/crew.js:712`, `systems/crew.js:741`, `systems/crew.js:771`, `systems/crew.js:788`, `systems/crew.js:800`, `systems/factionPresence.js:814`, `systems/factionPresence.js:1483`, `systems/factionPresence.js:1534`, `systems/factionPresence.js:1549`, `systems/furnaceIntake.js:111`, `systems/furnaceIntake.js:145`, `systems/gateThreeWeir.js:318`, `systems/gateThreeWeir.js:336`, `systems/gravedigger.js:533`, `systems/holdfast.js:163`, `systems/impoundGrudge.js:489`, `systems/kesslerScale.js:132`, `systems/kesslerScale.js:153`, `systems/kesslerScale.js:178`, `systems/lamplighter.js:630`, `systems/mail.js:230`, `systems/memorialThief.js:102`, `systems/missionObjectiveOps.js:200`, `systems/missionObjectiveOps.js:1313`, `systems/missionSpawningOps.js:583`, `systems/missionSpawningOps.js:890`, `systems/missionSpawningOps.js:1227`, `systems/missionSpawningOps.js:1358`, `systems/missionSpawningOps.js:1372`, `systems/missionSpawningOps.js:1383`, `systems/missionSpawningOps.js:1584`, `systems/missionSpawningOps.js:1646`, `systems/missionStoryOps.js:157`, `systems/missionStoryOps.js:1318`, `systems/missionStoryOps.js:1360`, `systems/missionStoryOps.js:1691`, `systems/missionStoryOps.js:1705`, `systems/missionStoryOps.js:1711`, `systems/missionStoryOps.js:1717`, `systems/missionStoryOps.js:1723`, `systems/missionStoryOps.js:1729`, `systems/missionStoryOps.js:1736`, `systems/missionStoryOps.js:1745`, `systems/missionStoryOps.js:1791`, `systems/missionStoryOps.js:1796`, `systems/missionStoryOps.js:1808`, `systems/missionStoryOps.js:1882`, `systems/missionStoryOps.js:1977`, `systems/missionStoryOps.js:1981`, `systems/missionStoryOps.js:2325`, `systems/missionStoryOps.js:2476`, `systems/missionStoryOps.js:2485`, `systems/missionStoryOps.js:2503`, `systems/missionStoryOps.js:2522`, `systems/missionStoryOps.js:2542`, `systems/missionStoryOps.js:2554`, `systems/missions.js:5415`, `systems/missions.js:5538`, `systems/missions.js:5702`, `systems/missions.js:5712`, `systems/missions.js:5720`, `systems/moistureLoss.js:148`, `systems/mop.js:135`, `systems/onboarding.js:1535`, `systems/onboarding.js:3875`, `systems/onboarding.js:4042`, `systems/quill.js:478`, `systems/receipt.js:111`, `systems/receipt.js:129`, `systems/receipt.js:177`, `systems/rookBooth.js:401`, `systems/rookBooth.js:427`, `systems/scenarioRuntime.js:189`, `systems/shepherd12.js:174`, `systems/slateColumn.js:138`, `systems/slateColumn.js:156`, `systems/slateColumn.js:180`, `systems/special500Director.js:272`, `systems/special500Invoice.js:122`, `systems/special500Question.js:89`, `systems/special500ReadEverything.js:70`, `systems/story.js:575`, `systems/story.js:1362`, `systems/story.js:1390`, `systems/tallyho.js:461`, `systems/tallyho.js:514`, `systems/tallyho.js:662`, `systems/tare.js:129`, `systems/wexTicket.js:121`, `systems/worldClock.js:165`, `ui/station/screens/bar.js:884` | `audio/audioSystem.js:3129`, `ui/screens/codex.js:1327` |
| `concord:clampAttached` | `systems/faction_concord.js:270` | — |
| `concord:clampReleased` | `systems/faction_concord.js:246` | — |
| `concord:formationLocked` | `systems/faction_concord.js:209` | — |
| `concord:formationReformed` | `systems/faction_concord.js:226` | — |
| `conflict:flip` | `systems/factions.js:898` | `systems/factionPresence.js:528`, `systems/gateControlDirector.js:79`, `systems/sectorSim.js:148`, `systems/story.js:260` |
| `conflict:frontAction` | `systems/factions.js:781` | — |
| `conflict:warDeclared` | `systems/factions.js:838` | — |
| `contactHail:availability` | `systems/scanner.js:1985`, `systems/scanner.js:2002` | — |
| `contactHail:choice` | `ui/commsRadial.js:579`, `ui/contactHailPrompt.js:227` | `systems/scanner.js:1106`, `systems/special500Question.js:105` |
| `contactHail:clear` | `systems/scanner.js:2020` | — |
| `contactHail:handoff` | `systems/scanner.js:1711` | — |
| `contactHail:offer` | `systems/scanner.js:1752` | — |
| `contactHail:request` | `ui/commsRadial.js:640`, `ui/contactHailPrompt.js:221` | `systems/scanner.js:1105`, `systems/special500Question.js:104` |
| `contactHail:response` | `systems/scanner.js:1776`, `systems/scanner.js:1810` | `systems/traffic.js:1779` |
| `contraband:bribe` | `systems/encounterScripts.js:432` | `systems/economy.js:1872` |
| `contraband:scanned` | `systems/economy.js:5771` | `systems/encounterDirector.js:383`, `systems/factions.js:521`, `systems/heat.js:382`, `systems/lawSecurity.js:414`, `systems/lawSecurity.js:433`, `ui/customsPrompt.js:58` |
| `contract:clauseBroken` | `systems/contractClauses.js:787` | `systems/missions.js:1983` |
| `contract:clauseHonored` | `systems/contractClauses.js:706`, `systems/missions.js:5734` | `systems/contractClauses.js:385` |
| `contract:clauseSettledKill` | `systems/contractClauses.js:563` | `systems/missions.js:1864` |
| `countermeasure:denied` | `systems/countermeasures.js:572` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:554` | `render/shipMicroMotion.js:1771` |
| `counterplay:encountered` | `ai/counterplay/adventure.js:82` | `ui/toasts.js:642` |
| `counterweightCircuit:action` | `features/counterweightCircuit/prompts.js:58` | — |
| `counterweightCircuit:attemptStarted` | `features/counterweightCircuit/runtime.js:149` | — |
| `counterweightCircuit:close` | `features/counterweightCircuit/runtime.js:293` | `ui/screens/missionLog.js:2554` |
| `counterweightCircuit:discovered` | `features/counterweightCircuit/runtime.js:469` | — |
| `counterweightCircuit:offer` | `features/counterweightCircuit/runtime.js:272` | — |
| `counterweightCircuit:view` | `features/counterweightCircuit/runtime.js:423` | `ui/screens/missionLog.js:2553` |
| `craft:cancelled` | `systems/crafting.js:382` | — |
| `craft:complete` | `systems/crafting.js:351`, `systems/crafting.js:423` | `ui/station/screens/industry.js:625` |
| `craft:queueChanged` | `systems/crafting.js:212`, `systems/crafting.js:236`, `systems/crafting.js:361`, `systems/crafting.js:383` | `render/authoredMotion.js:1175`, `systems/onboarding.js:919`, `ui/station/screens/industry.js:625` |
| `credits:changed` | `systems/economy.js:4306`, `systems/economy.js:4356`, `systems/economy.js:4441`, `systems/economy.js:4453` | `audio/audioSystem.js:2968`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:465` |
| `crew:decide` | `ui/crewPrompt.js:83` | `systems/crew.js:94` |
| `crew:decisionOffer` | `systems/crew.js:309` | `ui/crewPrompt.js:95` |
| `crew:decline` | `ui/crewPrompt.js:49` | `systems/crew.js:84` |
| `crew:demandSettled` | `systems/crew.js:627` | — |
| `crew:hire` | `ui/crewPrompt.js:46` | `systems/crew.js:83` |
| `crew:hireDenied` | `systems/crew.js:355`, `systems/crew.js:365` | — |
| `crew:hired` | `systems/crew.js:385` | — |
| `crew:injured` | `systems/crew.js:804` | — |
| `crew:lost` | `systems/crew.js:792` | — |
| `crew:loyalty` | `systems/crew.js:744` | — |
| `crew:promoted` | `systems/crew.js:668` | — |
| `crew:quit` | `systems/crew.js:647` | — |
| `crew:recruitOffer` | `systems/crew.js:287` | `ui/crewPrompt.js:94` |
| `crew:salvage` | `systems/crew.js:694` | — |
| `crew:strike` | `systems/crew.js:542` | — |
| `crew:strikeSettled` | `systems/crew.js:593` | — |
| `crew:wagesPaid` | `systems/crew.js:505` | — |
| `cruise:charging` | `systems/cruise.js:178` | `render/vfx.js:2916`, `systems/presentationOrchestrator.js:181` |
| `cruise:dropped` | `systems/cruise.js:250` | `audio/audioSystem.js:3117`, `render/authoredMotion.js:1182`, `render/vfx.js:2918`, `systems/presentationOrchestrator.js:183` |
| `cruise:engaged` | `systems/cruise.js:133` | `audio/audioSystem.js:3113`, `render/vfx.js:2917`, `systems/presentationOrchestrator.js:182` |
| `cruise:snareRequest` | `systems/encounterScripts.js:612` | `render/authoredMotion.js:1181`, `systems/cruise.js:74` |
| `cruise:snared` | `systems/cruise.js:249` | `audio/audioSystem.js:3121` |
| `cruise:wrestleEscaped` | `systems/cruise.js:145` | — |
| `cruise:wrestleStarted` | `systems/cruise.js:82` | — |
| `custody:aftermathChanged` | — | `systems/combatOutcome.js:291` |
| `custody:aftermathSettled` | — | `systems/aftermathWrecks.js:1247` |
| `customs:breakScan` | `systems/encounterScripts.js:407` | `render/authoredMotion.js:1193` |
| `customs:massSlipFiled` | — | `systems/economyContracts.js:267` |
| `customs:scanAborted` | — | `ui/customsPrompt.js:59` |
| `customs:scanWaived` | — | `ui/customsPrompt.js:61` |
| `customs:submit` | `systems/encounterScripts.js:443` | `render/authoredMotion.js:1192`, `systems/lawSecurity.js:429` |
| `customs:trustMarked` | — | `ui/customsPrompt.js:60` |
| `customs:weirBolt` | — | `systems/economy.js:1871`, `systems/heat.js:397` |
| `danger:miningNoise` | `systems/mining.js:2922` | `audio/audioSystem.js:2913` |
| `day:tick` | `core/coreSystem.js:630` | `systems/crew.js:121`, `systems/custodyConsequences.js:58`, `systems/economy.js:1766`, `systems/encounterDirector.js:352`, `systems/factions.js:553`, `systems/impoundLot.js:1095`, `systems/sectorSim.js:128` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:233` | `systems/combat.js:454` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:224` | `systems/combat.js:453` |
| `deniable:fenceBurned` | — | `systems/fenceDesk.js:52` |
| `deniable:fenceEmboldened` | — | `systems/fenceDesk.js:51` |
| `deniable:fenceThanked` | `systems/encounterDirector.js:1202` | `systems/fenceDesk.js:50` |
| `derby:finished` | `data/encounters/706-breaker-derby.js:213` | — |
| `derby:slam` | `data/encounters/706-breaker-derby.js:143`, `data/encounters/706-breaker-derby.js:165` | — |
| `detonator:detonated` | `systems/impulseCharges.js:643` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:298` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:chartFiled` | `systems/world.js:4963` | — |
| `discovery:plateUnlocked` | `systems/world.js:1064`, `systems/world.js:6897`, `systems/world.js:7533`, `systems/world.js:8159` | `audio/audioSystem.js:3016`, `ui/discoveryPlate.js:115`, `ui/screens/codex.js:1329` |
| `distress:call` | `systems/trafficRoleOps.js:263`, `systems/trafficRoleOps.js:316` | `audio/audioSystem.js:2884` |
| `distress:rescued` | `systems/encounterScripts.js:779` | `systems/factions.js:531` |
| `dock:attempt` | `ui/input.js:373` | `ui/dockDenyBanner.js:54` |
| `dock:committed` | `ui/dockStateCommit.js:19` | `systems/encounterDirector.js:432`, `ui/alerts.js:480` |
| `dock:denied` | `ui/dockDenyBanner.js:79` | `render/authoredMotion.js:1224` |
| `dock:docked` | `balance/careerCohorts.js:533`, `balance/careerCohorts.js:2010`, `balance/careerCohorts.js:2071`, `balance/careerCohorts.js:2337`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `systems/world.js:7388`, `ui/input.js:377` | `audio/audioSystem.js:3019`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/authoredMotion.js:1222`, `render/infrastructureMotion.js:289`, `render/shipMicroMotion.js:1761`, `save/saveSystem.js:574`, `systems/achievements.js:1204`, `systems/aftermathWrecks.js:1244`, `systems/autoTargetAssist.js:148`, `systems/barkDirector.js:880`, `systems/combat.js:404`, `systems/crew.js:126`, `systems/economy.js:1830`, `systems/economyContracts.js:248`, `systems/encounterDirector.js:431`, `systems/factionPresence.js:513`, `systems/fenceDesk.js:49`, `systems/impoundLot.js:1096`, `systems/lawSecurity.js:424`, `systems/lawSecurity.js:428`, `systems/mining.js:302`, `systems/mining.js:304`, `systems/missions.js:1745`, `systems/onboarding.js:637`, `systems/onboarding.js:885`, `systems/pirateDisguise.js:434`, `systems/scanner.js:1111`, `systems/shieldPylons.js:247`, `systems/special500CollectiveHours.js:39`, `systems/special500Confessional.js:107`, `systems/special500DockLedger.js:124`, `systems/special500ForgeKaraoke.js:45`, `systems/special500HullLog.js:45`, `systems/special500Invoice.js:73`, `systems/stationServices.js:276`, `systems/story.js:220`, `systems/world.js:787`, `systems/world.js:830`, `ui/cargoConscience.js:144`, `ui/causeLedger.js:226`, `ui/comms.js:134`, `ui/dockDenyBanner.js:55`, `ui/impoundPayPrompt.js:73`, `ui/impoundPayPrompt.js:78`, `ui/impoundPayPrompt.js:89`, `ui/priceForecast.js:86`, `ui/promptDeck.js:906`, `ui/securityReadout.js:158`, `ui/station/screens/bar.js:175`, `ui/uiRoot.js:1540`, `ui/watchlistHud.js:90`, `ui/wingmanRadial.js:349`, `ui/worldObjectInteraction.js:429`, `ui/wreckChoicePrompt.js:54` |
| `dock:launder` | `ui/station/launderService.js:22`, `ui/station/launderService.js:73` | `systems/pirateDisguise.js:435` |
| `dock:range` | `core/physics.js:1664`, `core/physics.js:1668`, `ui/input.js:346` | `render/authoredMotion.js:1221`, `systems/onboarding.js:787`, `ui/alerts.js:474`, `ui/input.js:352` |
| `dock:undocked` | `balance/careerCohorts.js:534`, `balance/careerCohorts.js:2015`, `balance/careerCohorts.js:2076`, `balance/careerCohorts.js:2414`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:1083`, `ui/station/stationApp.js:1146` | `audio/audioSystem.js:3024`, `render/authoredMotion.js:1223`, `render/infrastructureMotion.js:290`, `render/shipMicroMotion.js:1762`, `render/vfx.js:2761`, `save/saveSystem.js:575`, `systems/combat.js:409`, `systems/economy.js:1844`, `systems/economyContracts.js:277`, `systems/factionPresence.js:514`, `systems/missions.js:1772`, `systems/moralTrap.js:188`, `systems/onboarding.js:713`, `systems/pirateDisguise.js:438`, `systems/presentationAdapters.js:345`, `systems/special500Sommelier.js:27`, `systems/stationServices.js:277`, `systems/wingmen.js:174`, `systems/world.js:788`, `ui/comms.js:135`, `ui/impoundPayPrompt.js:76`, `ui/impoundPayPrompt.js:81`, `ui/input.js:360`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1583` |
| `docket:delivered` | `systems/docket.js:219` | — |
| `docket:met` | `systems/docket.js:182`, `systems/docket.js:187` | — |
| `docket:voice` | `systems/docket.js:154` | — |
| `drift:claimContested` | `systems/faction_drift.js:244` | — |
| `drift:claimLifted` | `systems/faction_drift.js:217` | — |
| `drift:claimStaked` | `systems/faction_drift.js:240` | — |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1688` | `ui/uiRoot.js:1652` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1673`, `ui/sandbox/sandboxSetup.js:696` | `ui/uiRoot.js:1636` |
| `drill:approachRequested` | `ui/input.js:990` | `systems/tetherGameplay.js:345` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1565`, `ui/sandbox/sandboxSetup.js:695` | `ui/asteroid/asteroidScreen.js:2306`, `ui/uiRoot.js:1623` |
| `drill:backblast` | `systems/drill.js:1533` | `ui/asteroid/asteroidScreen.js:2208` |
| `drill:beginRejected` | `systems/input.js:1208` | `ui/asteroid/asteroidScreen.js:2165` |
| `drill:break` | `systems/asteroidSites.js:2713`, `systems/drill.js:1459`, `systems/drill.js:1487`, `systems/drill.js:1632`, `systems/drill.js:1950` | `audio/audioSystem.js:3347`, `render/authoredMotion.js:1186`, `systems/asteroidSites.js:610`, `systems/presentationOrchestrator.js:231`, `ui/asteroid/asteroidScreen.js:2235`, `ui/screens/drill.js:1988` |
| `drill:cargoFull` | `systems/drill.js:267`, `systems/drill.js:316` | `audio/audioSystem.js:3349`, `systems/presentationOrchestrator.js:238`, `ui/asteroid/asteroidScreen.js:2192`, `ui/screens/drill.js:1959` |
| `drill:caveIn` | `systems/drill.js:1652` | `audio/audioSystem.js:3355`, `systems/asteroidSites.js:630`, `ui/asteroid/asteroidScreen.js:2218` |
| `drill:chargeArm` | `systems/drill.js:1340`, `systems/drill.js:1350`, `systems/drill.js:1372` | — |
| `drill:chargeBlast` | `systems/drill.js:1539` | `audio/audioSystem.js:3352`, `systems/asteroidSites.js:670`, `ui/asteroid/asteroidScreen.js:2201` |
| `drill:chargePlanted` | `systems/drill.js:1413` | `audio/audioSystem.js:3351`, `systems/asteroidSites.js:669`, `ui/asteroid/asteroidScreen.js:2196` |
| `drill:chargeTick` | `systems/drill.js:1718` | `audio/audioSystem.js:3353` |
| `drill:end` | `systems/drill.js:994` | `audio/audioSystem.js:3363`, `render/authoredMotion.js:1187`, `systems/asteroidSites.js:672`, `systems/faction_pitborn.js:644`, `systems/presentationOrchestrator.js:239` |
| `drill:gasHit` | `systems/drill.js:1509`, `systems/drill.js:1979` | `audio/audioSystem.js:3348`, `systems/presentationOrchestrator.js:233`, `ui/asteroid/asteroidScreen.js:2179`, `ui/screens/drill.js:1888` |
| `drill:gasVent` | `systems/drill.js:1458` | `audio/audioSystem.js:3356`, `systems/asteroidSites.js:645`, `ui/asteroid/asteroidScreen.js:2224` |
| `drill:retry` | `systems/drill.js:1041` | `systems/presentationOrchestrator.js:240` |
| `drill:rockCreak` | `systems/drill.js:1601` | `audio/audioSystem.js:3354`, `ui/asteroid/asteroidScreen.js:2212` |
| `drill:rockDepleted` | `systems/drill.js:212`, `systems/drill.js:246`, `systems/drill.js:325`, `systems/drill.js:956` | `audio/audioSystem.js:3350`, `ui/asteroid/asteroidScreen.js:2189`, `ui/screens/drill.js:1950` |
| `drill:scanPulse` | `systems/drill.js:1119` | `audio/audioSystem.js:3357`, `systems/asteroidSites.js:696`, `systems/presentationOrchestrator.js:229`, `ui/asteroid/asteroidScreen.js:2229`, `ui/screens/drill.js:1976` |
| `drill:spark` | `systems/drill.js:1917` | `audio/audioSystem.js:3346`, `systems/presentationOrchestrator.js:230`, `ui/asteroid/asteroidScreen.js:2240`, `ui/screens/drill.js:2009` |
| `drill:start` | `systems/drill.js:947` | `audio/audioSystem.js:3362`, `render/authoredMotion.js:1185`, `systems/asteroidSites.js:602`, `systems/onboarding.js:890`, `systems/presentationOrchestrator.js:228`, `ui/asteroid/asteroidScreen.js:2168` |
| `drill:warn` | `systems/drill.js:219`, `systems/drill.js:270`, `systems/drill.js:279`, `systems/drill.js:317`, `systems/drill.js:962`, `systems/drill.js:967`, `systems/drill.js:1383`, `systems/drill.js:1602`, `systems/drill.js:1794`, `systems/drill.js:1829`, `systems/drill.js:1850`, `systems/drill.js:1869` | `audio/audioSystem.js:3358`, `systems/presentationOrchestrator.js:227`, `ui/asteroid/asteroidRenderer3d.js:7461`, `ui/asteroid/asteroidScreen.js:2185`, `ui/screens/drill.js:1916` |
| `drill:yield` | `systems/drill.js:244`, `systems/drill.js:312` | `audio/audioSystem.js:3343`, `systems/missions.js:1843`, `systems/presentationOrchestrator.js:232`, `ui/asteroid/asteroidScreen.js:2171`, `ui/screens/drill.js:1866` |
| `drone:grindStart` | `systems/automation.js:1164` | `render/authoredMotion.js:1171` |
| `drone:grindStop` | — | `render/authoredMotion.js:1172` |
| `dyingHull:begin` | `systems/dyingHull.js:353` | `render/vfx.js:2839` |
| `dyingHull:lost` | `systems/dyingHull.js:266`, `systems/dyingHull.js:413` | `render/vfx.js:2841` |
| `dyingHull:ruptured` | `systems/dyingHull.js:455` | `render/vfx.js:2840` |
| `ecology:claimCrew` | `systems/alienEcology.js:3093` | — |
| `ecology:coherence` | `systems/alienEcology.js:1693` | — |
| `ecology:collar` | `systems/alienEcology.js:797` | — |
| `ecology:evidence` | `systems/precursorMachines.js:134`, `systems/precursorMachines.js:135`, `systems/precursorMachines.js:417`, `systems/precursorMachines.js:803`, `systems/precursorMachines.js:835`, `systems/precursorMachines.js:1223`, `world/motionFossil.js:256`, `world/veilRayNursery.js:158` | `systems/world.js:833` |
| `ecology:factionOutcome` | `systems/economy.js:3231`, `systems/economy.js:3535` | `systems/world.js:832` |
| `ecology:fossilRecorded` | `world/motionFossil.js:231` | — |
| `ecology:fossilSettled` | `world/motionFossil.js:257` | — |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:753` | `systems/world.js:834` |
| `ecology:relayPulse` | `systems/alienEcology.js:1813` | `audio/audioSystem.js:3378` |
| `ecology:setpiece` | `systems/alienEcology.js:1844`, `systems/alienEcology.js:3312`, `systems/alienEcology.js:3379` | — |
| `economy:applyTradePressure` | `systems/automation.js:1022`, `systems/automation.js:2069`, `systems/automation.js:2070`, `systems/claims.js:1371`, `systems/encounterDirector.js:2812`, `systems/encounterDirector.js:2860`, `systems/lossLedger.js:613`, `systems/scavengerOccupationSwitch.js:588`, `systems/sectorSim.js:446`, `systems/trafficCausalChainOps.js:2780`, `systems/trafficRecoveryOps.js:333` | `systems/economy.js:1791` |
| `economy:auditorTally` | `systems/economy.js:3941` | — |
| `economy:cargoKillOpportunity` | `systems/economy.js:3404` | `systems/missions.js:1838` |
| `economy:chargeCredits` | `data/encounters/1206-the-fire-sale.js:259`, `data/encounters/1208-the-vetting.js:241`, `data/encounters/1212-the-clean-sheet.js:314`, `features/breakwaterSpur/services.js:98`, `features/salvageTender/services.js:58`, `features/shipbreakingYard/runtime.js:274`, `shipjack/fleetOperations.js:116`, `shipjack/yardOperations.js:128`, `shipjack/yardOperations.js:194`, `shipjack/yardOperations.js:226`, `shipjack/yardOperations.js:239`, `systems/automation.js:2271`, `systems/automation.js:2279`, `systems/automation.js:3294`, `systems/automation.js:3521`, `systems/beacons.js:86`, `systems/bombs.js:848`, `systems/bombs.js:931`, `systems/bombs.js:949`, `systems/bombs.js:1015`, `systems/borrowedSun.js:684`, `systems/borrowedSun.js:1277`, `systems/claims.js:390`, `systems/claims.js:460`, `systems/claims.js:531`, `systems/claims.js:1459`, `systems/combat.js:1043`, `systems/crew.js:381`, `systems/crew.js:504`, `systems/crew.js:589`, `systems/crew.js:622`, `systems/drill.js:1398`, `systems/economy.js:5074`, `systems/eighthBellRuntime.js:304`, `systems/encounterDirector.js:2806`, `systems/faction_archive.js:751`, `systems/faction_choir.js:1033`, `systems/faction_helix.js:605`, `systems/faction_meridian.js:422`, `systems/faction_pitborn.js:685`, `systems/faction_understory.js:2007`, `systems/faction_understory.js:2038`, `systems/faction_vael.js:532`, `systems/faction_vael.js:846`, `systems/faction_verge.js:663`, `systems/faction_verge.js:929`, `systems/faction_verge.js:1392`, `systems/faction_verge.js:1443`, `systems/factions.js:639`, `systems/fenceDesk.js:355`, `systems/gateControlDirector.js:128`, `systems/gateThreeWeir.js:538`, `systems/gateThreeWeir.js:608`, `systems/gateThreeWeir.js:640`, `systems/gateThreeWeir.js:723`, `systems/gravedigger.js:586`, `systems/impoundGrudge.js:748`, `systems/impoundGrudge.js:816`, `systems/longBerth.js:285`, `systems/manifestGame.js:32`, `systems/mining.js:789`, `systems/missions.js:2495`, `systems/missions.js:2498`, `systems/npcJobsRuntime.js:3701`, `systems/npcJobsRuntime.js:5992`, `systems/pirateParley.js:896`, `systems/quill.js:700`, `systems/quill.js:721`, `systems/quill.js:856`, `systems/shieldPylons.js:291`, `systems/shipjack.js:230`, `systems/ships.js:2608`, `systems/ships.js:2762`, `systems/ships.js:2868`, `systems/ships.js:2897`, `systems/special500Confessional.js:235`, `systems/special500Invoice.js:162`, `systems/special500Invoice.js:187`, `systems/special500Sommelier.js:94`, `systems/special500Sommelier.js:153`, `systems/tallyho.js:638`, `systems/world.js:5000`, `systems/world.js:5044`, `systems/world.js:6520` | `systems/economy.js:1755` |
| `economy:coldChainArmed` | `systems/economy.js:4114` | — |
| `economy:coldChainSpoiled` | `systems/economy.js:4167` | — |
| `economy:convoyShareBought` | `systems/economy.js:3732` | — |
| `economy:convoyShareSettled` | `systems/economy.js:4008`, `systems/economy.js:4062` | — |
| `economy:debtEscalated` | `systems/economy.js:4921` | — |
| `economy:demandShift` | `systems/economy.js:2243` | — |
| `economy:eventEnded` | `systems/economy.js:5865` | — |
| `economy:eventStarted` | `systems/economy.js:5840` | — |
| `economy:forwardSlipBought` | `systems/economy.js:3786` | — |
| `economy:forwardSlipSettled` | `systems/economy.js:4030`, `systems/economy.js:4075` | — |
| `economy:freightAccepted` | `systems/economy.js:3614`, `systems/economy.js:3666` | `systems/claims.js:353`, `systems/economyContracts.js:251`, `systems/missions.js:1834` |
| `economy:grantCredits` | `features/industrialDisasters/runtime.js:440`, `features/rigWorkshop/jobs.js:222`, `missions/lanternWardStory.js:71`, `shipjack/fleetOperations.js:98`, `shipjack/fleetOperations.js:136`, `shipjack/yardOperations.js:195`, `shipjack/yardOperations.js:263`, `systems/alienEcology.js:978`, `systems/automation.js:2399`, `systems/automation.js:2410`, `systems/automation.js:3280`, `systems/bellhop.js:221`, `systems/bombs.js:968`, `systems/borrowedSun.js:636`, `systems/cargo.js:1342`, `systems/claims.js:1370`, `systems/claims.js:2234`, `systems/combat.js:861`, `systems/combat.js:873`, `systems/combat.js:1051`, `systems/crew.js:689`, `systems/encounterDirector.js:2807`, `systems/faction_archive.js:720`, `systems/faction_archive.js:733`, `systems/faction_choir.js:942`, `systems/faction_choir.js:979`, `systems/faction_choir.js:1135`, `systems/faction_choir.js:1411`, `systems/faction_choir.js:1621`, `systems/faction_frontier.js:1376`, `systems/faction_fulfillment.js:415`, `systems/faction_helix.js:598`, `systems/faction_meridian.js:416`, `systems/faction_pitborn.js:679`, `systems/faction_pitborn.js:803`, `systems/faction_understory.js:1211`, `systems/faction_understory.js:1307`, `systems/faction_vael.js:526`, `systems/faction_verge.js:855`, `systems/fenceDesk.js:265`, `systems/fenceDesk.js:300`, `systems/gateThreeWeir.js:426`, `systems/gateThreeWeir.js:596`, `systems/gravedigger.js:581`, `systems/impoundGrudge.js:677`, `systems/lamplighter.js:651`, `systems/manifestGame.js:15`, `systems/mining.js:2490`, `systems/mining.js:2684`, `systems/mining.js:2845`, `systems/missionStoryOps.js:2238`, `systems/missions.js:5567`, `systems/missions.js:5747`, `systems/missions.js:5750`, `systems/missions.js:6285`, `systems/moralTrap.js:326`, `systems/npcJobsRuntime.js:3716`, `systems/npcJobsRuntime.js:3945`, `systems/quill.js:674`, `systems/quill.js:760`, `systems/quill.js:772`, `systems/rookBooth.js:554`, `systems/scanReveal.js:206`, `systems/scanReveal.js:241`, `systems/scavengerOccupationSwitch.js:603`, `systems/shieldPylons.js:337`, `systems/shieldPylons.js:573`, `systems/ships.js:2687`, `systems/ships.js:3032`, `systems/stationServices.js:420`, `systems/survivorPod.js:1505`, `systems/survivorPod.js:1858`, `systems/tallyho.js:632`, `systems/uniqueWrecks.js:2003`, `systems/uniqueWrecks.js:2132`, `systems/world.js:4955`, `systems/wreckCourt.js:1029` | `systems/economy.js:1751`, `systems/onboarding.js:653`, `systems/story.js:255` |
| `economy:marketContractExpired` | `systems/economy.js:3995`, `systems/economy.js:4145` | — |
| `economy:marketOpened` | `ui/station/screens/market.js:2901` | `systems/economy.js:1771` |
| `economy:oreFlood` | `systems/sectorSim.js:718` | `systems/barkDirector.js:873`, `systems/economy.js:1819` |
| `economy:payBounty` | `ui/screens/footprint.js:1653` | `systems/economy.js:1758` |
| `economy:podIntakeAccepted` | `systems/economy.js:3827`, `systems/economy.js:3842` | — |
| `economy:releaseDebt` | `systems/stationServices.js:429` | `systems/economy.js:1756` |
| `economy:salvageIntakeApplied` | `systems/economy.js:4424` | `ui/alerts.js:515` |
| `economy:shortageRelieved` | `systems/economy.js:3658` | `systems/missions.js:1835` |
| `economy:shortageRepairRestored` | `systems/economyContracts.js:873` | — |
| `economy:sinkCharged` | `systems/economy.js:4467` | `ui/alerts.js:531` |
| `economy:tick` | `systems/economy.js:2008` | `systems/achievements.js:1190`, `systems/economyContracts.js:290` |
| `economy:towCharge` | `systems/world.js:7358` | `systems/economy.js:1864` |
| `economy:tradeCompleted` | `systems/economy.js:3217` | `audio/audioSystem.js:2971`, `audio/audioSystem.js:3083`, `careers/origins/haulerOriginSystem.js:90`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:582`, `systems/claims.js:350`, `systems/factions.js:497`, `systems/missions.js:1820`, `systems/missions.js:1836`, `systems/onboarding.js:644`, `systems/sectorSim.js:143`, `systems/story.js:250`, `ui/adventureDecisions.js:453`, `ui/station/screens/market.js:2411` |
| `economy:tradeFailed` | `systems/economy.js:3488`, `systems/economy.js:3520` | `audio/audioSystem.js:2977`, `ui/adventureDecisions.js:454`, `ui/station/screens/market.js:2410` |
| `emergent:audio` | `systems/emergentPrimitives.js:185`, `systems/environmentMaterials.js:255` | `audio/emergentPrimitiveVoice.js:83` |
| `emergent:contact` | `systems/emergentPrimitives.js:191` | `render/feel.js:1591` |
| `encounter:ambientPredationCleared` | — | `systems/barkDirector.js:868` |
| `encounter:ambientPredationTelegraph` | — | `systems/barkDirector.js:867` |
| `encounter:choiceOffered` | `features/industrialDisasters/presentation.js:125`, `features/industrialDisasters/presentation.js:173`, `systems/encounterDirector.js:2641` | `ui/encounterChoicePrompt.js:174` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:43` | `systems/encounterDirector.js:407` |
| `encounter:claimDefenseRoster` | `systems/encounterDirector.js:1855` | — |
| `encounter:convoyEscorted` | `systems/encounterScripts.js:3248` | — |
| `encounter:distressBroadcast` | `systems/encounterScripts.js:742` | `systems/encounterDirector.js:422` |
| `encounter:fingerprint` | `systems/encounterDirector.js:2740` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `data/encounters/586-the-blank-page.js:323`, `systems/encounterDirector.js:3481` | — |
| `encounter:lootSweepCollected` | `ai/lootSweep.js:494` | — |
| `encounter:lootSweepDispatched` | `ai/lootSweep.js:296` | — |
| `encounter:lootSweepEnded` | `ai/lootSweep.js:327` | — |
| `encounter:namedCaptainBound` | `systems/missionSpawningOps.js:1070` | `systems/encounterDirector.js:381` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:3006`, `systems/encounterScripts.js:3860` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:3441` | `systems/barkDirector.js:835` |
| `encounter:predationCleared` | `systems/encounterScripts.js:1227` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1144`, `systems/encounterScripts.js:1212` | `render/authoredMotion.js:1190` |
| `encounter:predationTelegraph` | — | `render/authoredMotion.js:1207` |
| `encounter:receipt` | `systems/encounterDirector.js:2757` | `ui/recoveryEncounterPrompt.js:491` |
| `encounter:resolved` | `features/industrialDisasters/presentation.js:98`, `systems/encounterDirector.js:2735`, `systems/encounterDirector.js:2790`, `systems/survivalArena.js:1706` | `audio/audioSystem.js:3028`, `data/encounters/362-the-salvage-watch.js:80`, `data/encounters/367-the-salvage-tail.js:129`, `systems/aftermathWrecks.js:1243`, `systems/claims.js:365`, `systems/claims.js:366`, `systems/encounterDirector.js:418`, `systems/encounterDirector.js:423`, `systems/missions.js:1790`, `systems/story.js:160`, `systems/terrainAnchors.js:102`, `systems/traffic.js:1764`, `systems/traffic.js:1892`, `systems/uniqueLootAbilities.js:159`, `ui/encounterChoicePrompt.js:175` |
| `encounter:scarcityRumor` | `systems/encounterDirector.js:1054` | — |
| `encounter:spawned` | `systems/encounterDirector.js:1983` | `systems/uniqueLootAbilities.js:158` |
| `encounter:stale` | `systems/encounterDirector.js:643` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1955`, `systems/survivalArena.js:1612` | `audio/audioSystem.js:3027`, `render/authoredMotion.js:1202`, `systems/survivalResults.js:520`, `systems/terrainAnchors.js:101`, `systems/world.js:797` |
| `encounter:voice` | `systems/encounterDirector.js:2622` | — |
| `encounter:waitStarted` | `data/encounters/367-the-salvage-tail.js:96`, `data/encounters/367-the-salvage-tail.js:262`, `systems/e1EncounterRuntime.js:499` | `ui/encounterChoicePrompt.js:176` |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:458` | `systems/story.js:175` |
| `endgame:archive` | `systems/story.js:236`, `systems/story.js:1124` | `ui/screens/codex.js:1332` |
| `endgame:chosen` | `systems/story.js:1112` | `systems/traffic.js:1731`, `ui/screens/missionLog.js:2577` |
| `endgame:confirmRequired` | `systems/story.js:997` | `ui/screens/missionLog.js:2576` |
| `endgame:eligibility` | `systems/story.js:808` | `ui/screens/missionLog.js:2575` |
| `endgame:finaleCompleted` | `systems/story.js:884` | — |
| `endgame:finaleReady` | `systems/story.js:1121` | — |
| `endgame:ineligible` | `systems/story.js:894`, `systems/story.js:951`, `systems/story.js:977`, `systems/story.js:1042` | — |
| `endgame:loopBack` | — | `systems/story.js:244` |
| `endgame:promptChoiceC` | `systems/story.js:962` | — |
| `endgame:promptChoiceD` | `systems/story.js:920` | — |
| `endgame:promptSandbox` | `systems/story.js:819` | — |
| `endgame:pullCompleted` | `systems/claims.js:3104` | `systems/factions.js:544` |
| `endgame:sandboxContinued` | `systems/story.js:1106` | `ui/screens/missionLog.js:2578` |
| `entity:destroyed` | `core/newGameBoot.js:138`, `main.js:867`, `save/saveSystem.js:8424`, `systems/survivorPod.js:399`, `systems/trafficTugOps.js:279` | `audio/audioSystem.js:2845`, `combat/kernel.js:197`, `data/encounters/362-the-salvage-watch.js:196`, `features/breakwaterSpur/runtime.js:74`, `render/vfx.js:2842`, `systems/aftermathWrecks.js:1222`, `systems/ai.js:121`, `systems/aiEncounter.js:136`, `systems/asteroidFormations.js:140`, `systems/asteroidSites.js:784`, `systems/automation.js:602`, `systems/cloak.js:94`, `systems/combatOutcome.js:265`, `systems/encounterDirector.js:371`, `systems/environmentalMachinery.js:282`, `systems/gateControlDirector.js:76`, `systems/heistFacilities.js:324`, `systems/lawSecurity.js:407`, `systems/missions.js:1866`, `systems/missions.js:2027`, `systems/missions.js:2031`, `systems/npcJobsRuntime.js:1187`, `systems/presentationOrchestrator.js:180`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:102`, `systems/survivalWave.js:200`, `systems/swarmArena.js:745`, `systems/swarmFortify.js:173`, `systems/swarmSupply.js:111`, `systems/traffic.js:1760`, `systems/traffic.js:1793`, `systems/traffic.js:1797`, `systems/world.js:759`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | `systems/tallyho.js:967` | `core/coreSystem.js:536` |
| `entity:killed` | `balance/careerCohorts.js:502`, `combat/damage.js:685`, `combat/kernel.js:139`, `systems/combat.js:819`, `systems/tallyho.js:969` | `audio/audioSystem.js:2844`, `combat/chainKills.js:88`, `features/breakwaterSpur/runtime.js:73`, `render/feel.js:1459`, `render/shipMicroMotion.js:1743`, `render/vfx.js:2822`, `render/vfx.js:2836`, `systems/aftermathWrecks.js:1220`, `systems/ai.js:122`, `systems/asteroidSites.js:780`, `systems/barkDirector.js:826`, `systems/barkDirector.js:827`, `systems/barkDirector.js:869`, `systems/combatOutcome.js:259`, `systems/crew.js:99`, `systems/dyingHull.js:181`, `systems/economy.js:1815`, `systems/economy.js:1818`, `systems/encounterDirector.js:372`, `systems/environmentalMachinery.js:283`, `systems/faction_archive.js:588`, `systems/faction_choir.js:518`, `systems/faction_frontier.js:465`, `systems/faction_helix.js:502`, `systems/faction_meridian.js:365`, `systems/faction_pitborn.js:643`, `systems/faction_understory.js:703`, `systems/faction_vael.js:435`, `systems/factions.js:396`, `systems/factions.js:458`, `systems/gamepad.js:1115`, `systems/impoundGrudge.js:397`, `systems/impulseCharges.js:227`, `systems/killReplay.js:375`, `systems/lawSecurity.js:406`, `systems/lawSecurity.js:418`, `systems/lawSecurity.js:419`, `systems/lootShards.js:601`, `systems/lossLedger.js:464`, `systems/mining.js:297`, `systems/missions.js:1859`, `systems/missions.js:2026`, `systems/missions.js:2030`, `systems/npcJobsRuntime.js:1179`, `systems/onboarding.js:686`, `systems/onboarding.js:732`, `systems/pirateDisguise.js:437`, `systems/presentationOrchestrator.js:179`, `systems/rockCore.js:90`, `systems/sectorSim.js:147`, `systems/surrenderRecovery.js:100`, `systems/survivalResults.js:504`, `systems/survivalWave.js:201`, `systems/survivorPod.js:673`, `systems/swarmChain.js:162`, `systems/swarmElites.js:181`, `systems/swarmJuice.js:160`, `systems/swarmLegendaries.js:112`, `systems/swarmSupply.js:103`, `systems/titles.js:583`, `systems/traffic.js:1757`, `systems/traffic.js:1792`, `systems/wingMorale.js:201`, `systems/wingmen.js:142`, `systems/world.js:801`, `testing/playerTruth/reader.js:415`, `ui/uiRoot.js:977`, `ui/uiRoot.js:985` |
| `entity:spawnRequest` | `data/scanReveal.js:537`, `systems/salvageActions.js:279`, `systems/salvageActions.js:528` | `core/coreSystem.js:540` |
| `entity:spawned` | `core/coreSystem.js:370`, `core/coreSystem.js:409` | `combat/kernel.js:186`, `render/asteroidMotionPresentation.js:525`, `render/ordnanceMotionPresentation.js:264`, `render/pickupMotionPresentation.js:260`, `render/shipMicroMotion.js:1744`, `render/vfx.js:2848`, `render/vfx.js:2853`, `sim/titleAttract.js:10`, `systems/aiEncounter.js:135`, `systems/barkDirector.js:812`, `systems/barkDirector.js:813`, `systems/combatOutcome.js:264`, `systems/factionPresence.js:526`, `systems/faction_understory.js:702`, `systems/fields.js:469`, `systems/flybyFocus.js:319`, `systems/lawSecurity.js:405`, `systems/lossLedger.js:462`, `systems/npcJobsRuntime.js:1153`, `systems/salvageActions.js:139`, `systems/scanReveal.js:68`, `systems/survivalSwarm.js:216`, `systems/swarmElites.js:180`, `systems/swarmFortify.js:174`, `systems/swarmSupply.js:109`, `systems/titles.js:584`, `systems/uniqueLootAbilities.js:161`, `testing/playerTruth/impulseObserver.js:123` |
| `environment:detonated` | — | `render/vfx.js:2894` |
| `environment:fractured` | — | `systems/sectorSim.js:163` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:582`, `systems/environmentalMachinery.js:1506` | `systems/terrainAnchors.js:103` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:1091` | `systems/terrainAnchors.js:107` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:1400` | `systems/terrainAnchors.js:105` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:1600` | `data/hazardLanguage.js:178` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:1103` | `systems/terrainAnchors.js:109` |
| `erisChoir:drinkReceipt` | `systems/special500Sommelier.js:145` | — |
| `escalation:arrived` | `systems/encounterDirector.js:683` | — |
| `escalation:seeded` | `systems/encounterDirector.js:670` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:342`, `systems/factions.js:598`, `systems/factions.js:681`, `systems/factions.js:1067` | `systems/heat.js:404` |
| `faction:bribe` | `data/encounters/1208-the-vetting.js:277`, `ui/screens/footprint.js:1659` | `systems/factions.js:374` |
| `faction:repChanged` | `systems/factions.js:594`, `systems/factions.js:676`, `systems/factions.js:1063` | `audio/audioSystem.js:3080`, `systems/factionPresence.js:530`, `ui/station/screens/factions.js:461` |
| `faction:repDelta` | `balance/careerCohorts.js:273`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `features/industrialDisasters/runtime.js:441`, `systems/borrowedSun.js:641`, `systems/choirReliefBerth.js:425`, `systems/choirReliefBerth.js:459`, `systems/choirReliefBerth.js:480`, `systems/claims.js:1831`, `systems/economy.js:4574`, `systems/economy.js:5363`, `systems/economy.js:5763`, `systems/encounterDirector.js:2808`, `systems/faction_archive.js:723`, `systems/faction_archive.js:758`, `systems/faction_archive.js:1488`, `systems/faction_archive.js:1515`, `systems/faction_choir.js:943`, `systems/faction_choir.js:980`, `systems/faction_choir.js:1042`, `systems/faction_choir.js:1111`, `systems/faction_choir.js:1115`, `systems/faction_choir.js:1120`, `systems/faction_choir.js:1178`, `systems/faction_choir.js:1206`, `systems/faction_choir.js:1412`, `systems/faction_choir.js:1622`, `systems/faction_frontier.js:1382`, `systems/faction_helix.js:612`, `systems/faction_meridian.js:428`, `systems/faction_pitborn.js:691`, `systems/faction_understory.js:1210`, `systems/faction_understory.js:1313`, `systems/faction_vael.js:538`, `systems/faction_vael.js:878`, `systems/faction_verge.js:711`, `systems/faction_verge.js:730`, `systems/faction_verge.js:856`, `systems/faction_verge.js:1067`, `systems/faction_verge.js:1085`, `systems/faction_verge.js:1364`, `systems/faction_verge.js:1414`, `systems/faction_verge.js:1503`, `systems/faction_verge.js:1530`, `systems/faction_verge.js:1573`, `systems/faction_verge.js:1625`, `systems/fenceDesk.js:268`, `systems/gateThreeWeir.js:427`, `systems/gateThreeWeir.js:539`, `systems/gateThreeWeir.js:597`, `systems/gateThreeWeir.js:609`, `systems/gravedigger.js:591`, `systems/lamplighter.js:656`, `systems/missionStoryOps.js:2175`, `systems/missionStoryOps.js:2177`, `systems/missionStoryOps.js:2256`, `systems/missions.js:6282`, `systems/missions.js:6385`, `systems/moralTrap.js:320`, `systems/quill.js:701`, `systems/quill.js:901`, `systems/scavengerOccupationSwitch.js:761`, `systems/scavengerOccupationSwitch.js:766`, `systems/special500Confessional.js:238`, `systems/special500ForgeKaraoke.js:82`, `systems/special500Invoice.js:173`, `systems/special500Invoice.js:188`, `systems/special500Sommelier.js:102`, `systems/stuntGrammar.js:184`, `systems/stuntGrammar.js:192`, `systems/survivorPod.js:1494`, `systems/survivorPod.js:1864`, `systems/tallyho.js:644`, `systems/uniqueWrecks.js:2007`, `systems/uniqueWrecks.js:2134`, `systems/world.js:4959`, `systems/world.js:7661`, `systems/world.js:7895` | `systems/factions.js:346` |
| `faction:repSpillover` | `systems/factions.js:674` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | `systems/factions.js:366` |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1832` | `systems/barkDirector.js:849` |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:1487` | `systems/story.js:284` |
| `factionPresence:berthGreeting` | `systems/factionPresence.js:1024` | — |
| `factionPresence:berthReturned` | `systems/factionPresence.js:1001` | — |
| `factionPresence:berthRobbed` | `systems/factionPresence.js:987` | — |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1744` | `ui/uiRoot.js:570` |
| `factionPresence:conduct` | `systems/factionPresence.js:798`, `systems/factionPresence.js:905` | — |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:1321` | `systems/barkDirector.js:848` |
| `factionPresence:service` | `systems/factionPresence.js:1426` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1557` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:774`, `systems/factionPresence.js:945`, `systems/factionPresence.js:1137` | — |
| `fence:routeLegDue` | — | `systems/economyContracts.js:260` |
| `fence:scrubAsk` | — | `systems/fenceDesk.js:62` |
| `field:depletedChanged` | `systems/fieldDepletion.js:841` | `systems/world.js:747` |
| `field:opportunity` | `systems/world.js:5734` | — |
| `field:regrown` | `systems/world.js:5663` | `systems/presentationOrchestrator.js:225` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:769`, `systems/traffic.js:2308`, `systems/trafficCausalChainOps.js:2699` | `systems/presentationOrchestrator.js:226` |
| `field:richSeamOpened` | `systems/heliosClaimOpening.js:118`, `systems/trafficCausalChainOps.js:532` | `systems/traffic.js:1750` |
| `field:richSeamVisible` | `systems/heliosClaimOpening.js:107` | `systems/presentationOrchestrator.js:193` |
| `field:richSeamWorked` | `systems/mining.js:1234`, `systems/trafficRecoveryOps.js:698` | `systems/traffic.js:1751` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:840` | `systems/npcJobsRuntime.js:1195`, `systems/presentationOrchestrator.js:224` |
| `fields:anchorRegistered` | `systems/fields.js:1059` | `audio/audioSystem.js:3287`, `render/forceLanguage/fieldForcePresentation.js:61` |
| `fields:cleared` | `systems/fields.js:1683` | `audio/fieldAudio.js:321`, `render/forceLanguage/fieldForcePresentation.js:62` |
| `fields:clusterDetonate` | `systems/fields.js:2491` | `systems/presentationOrchestrator.js:287` |
| `fields:coneToggled` | `systems/fields.js:1350`, `systems/fields.js:1356`, `systems/fields.js:1467`, `systems/fields.js:1475` | `systems/onboarding.js:723` |
| `fields:deployDenied` | `systems/fields.js:1220` | — |
| `fields:deployed` | `systems/fields.js:692`, `systems/fields.js:777`, `systems/fields.js:1292`, `systems/fields.js:1347`, `systems/fields.js:1458`, `systems/fields.js:1552` | `audio/audioSystem.js:3288`, `systems/fields.js:470`, `systems/onboarding.js:722` |
| `fields:ended` | `systems/fields.js:1078`, `systems/fields.js:1101`, `systems/fields.js:1150`, `systems/fields.js:1474`, `systems/fields.js:1495`, `systems/fields.js:1631` | `audio/fieldAudio.js:318` |
| `fields:hitchCut` | `systems/fields.js:723` | — |
| `fields:hitchLatched` | `systems/fields.js:711` | — |
| `fields:pullMarked` | `systems/fields.js:1322` | — |
| `fields:specialistDisrupt` | `systems/fields.js:601` | `audio/fieldAudio.js:322` |
| `fields:thermalCreated` | `systems/fields.js:1722` | — |
| `fields:thermalHit` | `core/fields/thermalFields.js:35` | — |
| `firsthour:beat` | `systems/onboarding.js:4761` | — |
| `firsthour:complete` | `systems/onboarding.js:4778` | — |
| `firsthour:milestone` | `systems/onboarding.js:1861` | `audio/audioSystem.js:3280`, `testing/playerTruth/reader.js:410` |
| `firsthour:sentence` | `systems/onboarding.js:3013` | — |
| `firsthour:started` | `systems/onboarding.js:4426` | — |
| `firsthour:verb` | `systems/onboarding.js:4698` | — |
| `flight:modeChanged` | `systems/flightV3.js:1170` | — |
| `flight:racePrecision` | `systems/missions.js:4656` | `systems/flightV3.js:205` |
| `flight:sweptHull` | `systems/flightV3.js:1069` | — |
| `flybyFocus:cancel` | `systems/flybyFocus.js:379` | `render/cameraDirector.js:1537` |
| `flybyFocus:end` | `systems/flybyFocus.js:380` | `render/cameraDirector.js:1536` |
| `flybyFocus:start` | `systems/flybyFocus.js:522` | `systems/onboarding.js:669` |
| `formation:discovered` | `systems/asteroidFormations.js:329` | — |
| `freight:arrival` | `systems/trafficEscortOps.js:187` | `render/authoredMotion.js:1198`, `systems/economy.js:1811` |
| `freight:cargoSpilled` | `systems/encounterScripts.js:2129`, `systems/encounterScripts.js:2422`, `systems/trafficRoleOps.js:441` | `systems/barkDirector.js:823`, `systems/economy.js:1757`, `systems/encounterDirector.js:437`, `systems/lootShards.js:604`, `systems/presentationOrchestrator.js:300`, `systems/sectorSim.js:154`, `systems/traffic.js:1790`, `systems/traffic.js:1795`, `systems/traffic.js:1800` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1962` | `render/authoredMotion.js:1197`, `systems/aftermathWrecks.js:1245` |
| `freight:custodyRebound` | `systems/encounterDirector.js:889` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:2019`, `systems/encounterScripts.js:2041` | — |
| `freight:gratitudeGift` | `systems/missions.js:4852` | — |
| `freight:lootSweepStarted` | `systems/encounterScripts.js:1685` | — |
| `freight:loss` | `systems/encounterDirector.js:2870`, `systems/trafficCausalChainOps.js:2792`, `systems/trafficRecoveryOps.js:335` | `systems/claims.js:372`, `systems/economy.js:1812`, `systems/encounterDirector.js:438`, `systems/sectorSim.js:153` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1963` | `systems/surrenderRecovery.js:101` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:2578` | `systems/barkDirector.js:824` |
| `freight:recovery` | — | `systems/encounterDirector.js:379`, `systems/traffic.js:1782` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:380`, `systems/traffic.js:1783` |
| `freight:sweeperEscaped` | `systems/encounterScripts.js:1846` | — |
| `frontier:barnRetry` | `systems/faction_frontier.js:1220` | `systems/missions.js:1710` |
| `frontier:debtLapsed` | `systems/faction_frontier.js:1674` | — |
| `frontier:debtPosted` | `systems/faction_frontier.js:1609` | — |
| `frontier:debtSettled` | `systems/faction_frontier.js:1654` | — |
| `frontier:deed` | `systems/faction_frontier.js:1357` | — |
| `frontier:defenseCalled` | `systems/faction_frontier.js:1984` | — |
| `frontier:defenseCleared` | `systems/faction_frontier.js:1992` | — |
| `frontier:defenseFailed` | `systems/faction_frontier.js:2013` | — |
| `frontier:disputeJumped` | `systems/faction_frontier.js:1827` | — |
| `frontier:disputeLapsed` | `systems/faction_frontier.js:1832` | — |
| `frontier:disputePosted` | `systems/faction_frontier.js:1717` | — |
| `frontier:disputeSettled` | `systems/faction_frontier.js:1806` | — |
| `frontier:homesteadLost` | `systems/faction_frontier.js:2022` | — |
| `frontier:homesteadRaised` | — | `systems/missions.js:1711` |
| `frontier:jobTier` | `systems/faction_frontier.js:1362` | — |
| `frontier:justiceFiled` | `systems/faction_frontier.js:1395` | — |
| `frontier:leadPosted` | `systems/faction_frontier.js:1488` | — |
| `frontier:leadSoured` | `systems/faction_frontier.js:1503` | — |
| `frontier:leadVerified` | `systems/faction_frontier.js:1524` | — |
| `frontier:missionAttemptLost` | `systems/faction_frontier.js:634`, `systems/faction_frontier.js:933` | `systems/missions.js:1712` |
| `frontier:missionAttemptStarted` | `systems/faction_frontier.js:559` | — |
| `frontier:missionAttemptUnavailable` | `systems/faction_frontier.js:549` | `systems/missions.js:1713` |
| `frontier:moduleRestocked` | `systems/faction_frontier.js:1117` | — |
| `frontier:moduleSnapped` | `systems/faction_frontier.js:1165` | `systems/missions.js:1709` |
| `frontier:raidSpawned` | `systems/faction_frontier.js:1878` | — |
| `frontier:raiderRepelled` | `systems/faction_frontier.js:2194`, `systems/faction_frontier.js:2212` | — |
| `frontier:sitePlanted` | `systems/faction_frontier.js:745`, `systems/faction_frontier.js:1050` | `systems/missions.js:1708` |
| `frontier:steadStruck` | `systems/faction_frontier.js:1955` | — |
| `frontier:supplyDelivered` | `systems/faction_frontier.js:1452` | — |
| `frontier:supplyRunAsked` | `systems/faction_frontier.js:1429`, `systems/faction_frontier.js:1951` | — |
| `frontier:trafficTick` | `systems/faction_frontier.js:1423` | — |
| `frontier:vendettaLapsed` | `systems/faction_frontier.js:2114` | — |
| `frontier:vendettaPaid` | `systems/faction_frontier.js:2173` | — |
| `frontier:vendettaPosted` | `systems/faction_frontier.js:2092` | — |
| `frontier:welded` | `systems/faction_frontier.js:2297` | — |
| `frontierRumor:acquired` | `systems/world.js:5063` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:8126` | — |
| `frontierRumor:contacted` | `systems/world.js:8022` | — |
| `frontierRumor:resolved` | `systems/world.js:5080` | — |
| `fuel:changed` | `features/salvageTender/services.js:142`, `systems/economy.js:4996`, `systems/economy.js:5157`, `systems/economy.js:5174`, `systems/stationServices.js:561`, `systems/stationServices.js:669`, `systems/stationServices.js:763`, `systems/world.js:7204`, `systems/world.js:7212` | — |
| `fuel:crackCell` | `ui/hud.js:4018` | `systems/world.js:741` |
| `fuel:empty` | `systems/world.js:7205` | `audio/audioSystem.js:3052`, `systems/economy.js:1862`, `ui/alerts.js:607` |
| `fulfillment:boardingDocked` | `systems/faction_fulfillment.js:344` | — |
| `fulfillment:boardingFlung` | `systems/faction_fulfillment.js:331` | — |
| `fulfillment:cargoFiled` | `systems/faction_fulfillment.js:383` | — |
| `fulfillment:derailed` | `systems/faction_fulfillment.js:253` | — |
| `fulfillment:hitchhike` | `systems/faction_fulfillment.js:312` | — |
| `fulfillment:orderOneClosed` | `systems/faction_fulfillment.js:417` | — |
| `fulfillment:rerailed` | `systems/faction_fulfillment.js:264` | — |
| `fulfillment:trainSpawned` | `systems/faction_fulfillment.js:491` | — |
| `furnace:fed` | `systems/furnaceIntake.js:136` | `systems/missions.js:1802` |
| `game:embarkSpeculation` | `ui/sandbox/sandboxSetup.js:413`, `ui/screens/gameOver.js:598`, `ui/screens/newGame.js:1006` | — |
| `game:exitToMenu` | `ui/loadingPresenter.js:548`, `ui/screens/crucible.js:3886`, `ui/screens/gameOver.js:626`, `ui/screens/pause.js:1376` | `audio/audioSystem.js:3403`, `core/gameStartRecovery.js:19`, `main.js:448`, `save/saveSystem.js:600`, `systems/missions.js:2002`, `systems/runSession.js:116`, `systems/swarmFortify.js:176`, `ui/confirm.js:312`, `ui/loadingPresenter.js:596`, `ui/screens/crucibleLabControls.js:579`, `ui/uiRoot.js:1699` |
| `game:load` | `ui/input.js:631`, `ui/input.js:866`, `ui/screens/gameOver.js:587`, `ui/screens/mainMenu.js:717`, `ui/screens/saveLoad.js:1595` | `core/gameStartRecovery.js:12`, `save/saveSystem.js:388`, `systems/scanner.js:1110`, `systems/special500Confessional.js:110`, `ui/commandBar.js:482`, `ui/loadingPresenter.js:595`, `ui/loadingPresenter.js:626`, `ui/promptDeck.js:905` |
| `game:loadingProgress` | `main.js:148`, `main.js:236`, `main.js:299`, `main.js:332`, `main.js:504`, `main.js:806`, `main.js:903`, `main.js:962`, `main.js:989`, `main.js:1023`, `main.js:1034`, `main.js:1097`, `main.js:1269`, `save/saveSystem.js:6878` | `ui/loadingPresenter.js:566`, `ui/screens/newGame.js:958`, `ui/screens/saveLoad.js:1061` |
| `game:new` | `main.js:669`, `ui/physicsVenues.js:28`, `ui/sandbox/sandboxSetup.js:427`, `ui/screens/gameOver.js:613`, `ui/screens/newGame.js:1095`, `ui/screens/raceBoard.js:59` | `audio/audioSystem.js:3398`, `audio/bombAudio.js:458`, `audio/fieldAudio.js:325`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:554`, `core/gameStartRecovery.js:11`, `features/breakwaterSpur/presentation.js:35`, `main.js:426`, `render/feel.js:1374`, `render/vfx.js:2866`, `render/vfx.js:2877`, `save/saveSystem.js:525`, `sim/killcamTape.js:471`, `systems/aftermathWrecks.js:1253`, `systems/aiEncounter.js:140`, `systems/bombs.js:692`, `systems/cloak.js:89`, `systems/combatOutcome.js:269`, `systems/countermeasures.js:224`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:84`, `systems/encounterDirector.js:369`, `systems/environmentalMachinery.js:286`, `systems/faction_frontier.js:477`, `systems/faction_helix.js:515`, `systems/fields.js:461`, `systems/impulseCharges.js:232`, `systems/killReplay.js:363`, `systems/massSeed.js:140`, `systems/masslineSnares.js:137`, `systems/masslineTelemetry.js:125`, `systems/mines.js:80`, `systems/mining.js:322`, `systems/planetRuntime.js:214`, `systems/presentationOrchestrator.js:289`, `systems/reactiveMatter.js:537`, `systems/rockCore.js:91`, `systems/salvageActions.js:146`, `systems/scanner.js:1109`, `systems/scissorwake.js:73`, `systems/shieldPylons.js:244`, `systems/ships.js:1954`, `systems/special500Spectacle.js:206`, `systems/surrenderRecovery.js:107`, `systems/survivorPod.js:669`, `systems/swarmFortify.js:175`, `systems/swarmLegendaries.js:124`, `systems/tetherGameplay.js:337`, `systems/tumbleStates.js:145`, `ui/aftermathChoicePrompt.js:80`, `ui/capitalBossOverlayMount.js:653`, `ui/commandBar.js:481`, `ui/hudLayout.js:123`, `ui/loadingPresenter.js:594`, `ui/loadingPresenter.js:625`, `ui/moralTrapPrompt.js:44`, `ui/promptDeck.js:904`, `ui/screens/crucibleLabControls.js:573`, `ui/uiRoot.js:789`, `ui/uiRoot.js:1703`, `ui/voiceArbiter.js:541`, `ui/wreckChoicePrompt.js:56` |
| `game:newGame` | `core/newGameBoot.js:167` | `audio/audioSystem.js:3399`, `audio/bombAudio.js:459`, `audio/fieldAudio.js:326`, `core/coreSystem.js:555`, `core/physics.js:207`, `render/npcJobSignatureVfx.js:903`, `render/shipMicroMotion.js:1747`, `render/vfx.js:2867`, `render/vfx.js:2878`, `save/saveSystem.js:532`, `systems/aftermathWrecks.js:1254`, `systems/bombs.js:695`, `systems/cloak.js:90`, `systems/collisionConsequences.js:112`, `systems/combatOutcome.js:276`, `systems/countermeasures.js:225`, `systems/difficultyDirector.js:169`, `systems/faction_frontier.js:478`, `systems/faction_helix.js:516`, `systems/fieldDepletion.js:757`, `systems/fragileCargo.js:407`, `systems/lossInvestigation.js:131`, `systems/lossLedger.js:467`, `systems/masslineTelemetry.js:126`, `systems/moistureLoss.js:85`, `systems/onboarding.js:616`, `systems/salvageActions.js:147`, `systems/scanReveal.js:67`, `systems/survivorPod.js:668`, `systems/titles.js:586`, `systems/tumbleStates.js:146`, `systems/wingMorale.js:203`, `ui/cargoConscience.js:148`, `ui/uiRoot.js:849` |
| `game:over` | `systems/combat.js:776`, `systems/combat.js:939` | `ui/confirm.js:311`, `ui/uiRoot.js:1668` |
| `game:retryStart` | `ui/loadingPresenter.js:531` | `core/gameStartRecovery.js:14` |
| `game:save` | `ui/input.js:630`, `ui/input.js:861`, `ui/screens/saveLoad.js:1628` | `save/saveSystem.js:368` |
| `game:scenePrepared` | `core/newGameBoot.js:240` | `systems/missions.js:1722`, `systems/onboarding.js:592`, `ui/loadingPresenter.js:642`, `ui/sandbox/sandboxSetup.js:488` |
| `game:startFailed` | `main.js:1219`, `ui/loadingPresenter.js:614` | `core/gameStartRecovery.js:13`, `ui/loadingPresenter.js:593`, `ui/sandbox/sandboxSetup.js:491`, `ui/screens/crucibleLabControls.js:575`, `ui/screens/newGame.js:957`, `ui/screens/saveLoad.js:1067` |
| `game:started` | `main.js:821` | `audio/audioSystem.js:3404`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:556`, `save/saveSystem.js:519`, `save/saveSystem.js:552`, `sim/killcamTape.js:470`, `systems/automation.js:641`, `systems/collisionConsequences.js:111`, `systems/combat.js:451`, `systems/economyContracts.js:254`, `systems/factionPresence.js:517`, `systems/faction_helix.js:517`, `systems/factions.js:343`, `systems/flight.js:83`, `systems/flightV3.js:224`, `systems/heat.js:411`, `systems/masslineSnares.js:138`, `systems/missions.js:1692`, `systems/onboarding.js:615`, `systems/presentationAdapters.js:343`, `systems/presentationOrchestrator.js:290`, `systems/sectorSim.js:134`, `systems/ships.js:2145`, `systems/story.js:158`, `systems/surrenderRecovery.js:108`, `systems/survivalDraft.js:220`, `systems/tetherGameplay.js:338`, `systems/wingmen.js:175`, `ui/alerts.js:501`, `ui/commandBar.js:480`, `ui/sandbox/sandboxSetup.js:483`, `ui/screens/crucibleLabControls.js:574`, `ui/uiRoot.js:790`, `ui/uiRoot.js:1660`, `ui/uiRoot.js:1694`, `ui/uiRoot.js:1704` |
| `gamepad:connected` | `systems/gamepad.js:1314` | — |
| `gamepad:disconnected` | `systems/gamepad.js:1262` | — |
| `gate:range` | `core/physics.js:1674`, `core/physics.js:1678` | `render/authoredMotion.js:1225`, `systems/onboarding.js:796`, `systems/presentationOrchestrator.js:184`, `ui/alerts.js:482` |
| `gate:verdict` | `systems/gateControlDirector.js:143` | `render/infrastructureMotion.js:291` |
| `gateThree:bondLapsed` | `systems/gateThreeWeir.js:434` | — |
| `gateThree:bonded` | `systems/gateThreeWeir.js:652` | — |
| `gateThree:contested` | `systems/gateThreeWeir.js:602`, `systems/gateThreeWeir.js:614` | — |
| `gateThree:evaded` | `systems/gateThreeWeir.js:544` | — |
| `gateThree:inspection` | `systems/gateThreeWeir.js:694` | — |
| `gateThree:laneWeighed` | `systems/gateThreeWeir.js:491` | — |
| `gateThree:logged` | `systems/gateThreeWeir.js:548`, `systems/gateThreeWeir.js:672`, `systems/gateThreeWeir.js:742` | — |
| `gateThree:maintenance` | `systems/gateThreeWeir.js:413` | — |
| `gateThree:weighed` | `systems/gateThreeWeir.js:668`, `systems/gateThreeWeir.js:735` | — |
| `graffiti:show` | `data/encounters/366-the-counting-relay.js:102`, `data/encounters/366-the-counting-relay.js:112`, `systems/blindWelderRuntime.js:153`, `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:285`, `systems/e1EncounterRuntime.js:677`, `systems/historyWear.js:103`, `systems/missionStoryOps.js:2539`, `systems/special500DockLedger.js:158`, `systems/story.js:655`, `systems/story.js:669`, `systems/story.js:703`, `systems/story.js:1520`, `systems/story.js:1921`, `systems/story.js:2132`, `systems/uniqueWrecks.js:2013` | `systems/ships.js:2122`, `ui/comms.js:205`, `ui/screens/codex.js:1328` |
| `gravedigger:claimClosed` | `systems/gravedigger.js:896`, `systems/gravedigger.js:912`, `systems/gravedigger.js:935`, `systems/gravedigger.js:973` | — |
| `gravedigger:claimLapsed` | `systems/gravedigger.js:915` | — |
| `gravedigger:claimPosted` | `systems/gravedigger.js:879` | — |
| `gravedigger:claimRobbed` | `systems/gravedigger.js:976` | — |
| `gravedigger:claimYielded` | `systems/gravedigger.js:938` | — |
| `gravedigger:forgiven` | `systems/gravedigger.js:1059` | — |
| `gravedigger:graveDesecrated` | `systems/gravedigger.js:1320` | — |
| `gravedigger:graveNamed` | `systems/gravedigger.js:1206` | — |
| `gravedigger:grudged` | `systems/gravedigger.js:985` | — |
| `gravedigger:kinSlain` | `systems/gravedigger.js:1302` | — |
| `gravedigger:offering` | `systems/gravedigger.js:1079` | — |
| `gravedigger:pitRefused` | `systems/gravedigger.js:1384` | — |
| `gravedigger:portionPaid` | `systems/gravedigger.js:1070` | — |
| `gravedigger:standing` | `systems/gravedigger.js:1083` | — |
| `gravedigger:verdictFiled` | `systems/gravedigger.js:612` | — |
| `gravedigger:vigilBegun` | `systems/gravedigger.js:747` | — |
| `gravedigger:vigilDeparting` | `systems/gravedigger.js:790` | — |
| `gravedigger:vigilInbound` | `systems/gravedigger.js:722` | — |
| `gravedigger:vigilPosted` | `systems/gravedigger.js:687` | — |
| `gyre:absorbTick` | — | `systems/gamepad.js:1080` |
| `gyre:ballGrave` | — | `systems/gamepad.js:1059` |
| `gyre:beamOn` | — | `systems/gamepad.js:1018` |
| `gyre:caught` | — | `systems/gamepad.js:1060` |
| `gyre:dropped` | — | `systems/gamepad.js:1089` |
| `gyre:full` | — | `systems/gamepad.js:1057` |
| `gyre:fuseLow` | — | `systems/gamepad.js:1058` |
| `gyre:snagged` | — | `systems/gamepad.js:1019` |
| `gyre:strained` | — | `systems/gamepad.js:1104` |
| `gyre:thrown` | — | `systems/gamepad.js:1042` |
| `gyre:windup` | — | `systems/gamepad.js:1029` |
| `harasser:disengaged` | `systems/encounterDirector.js:3274` | `systems/barkDirector.js:836`, `systems/barkDirector.js:945` |
| `hazard:changed` | `systems/world.js:1057`, `systems/world.js:7072` | `ui/alerts.js:624` |
| `hazard:enter` | `systems/environmentalMachinery.js:1540`, `systems/world.js:6943` | `data/hazardLanguage.js:174`, `render/shipMicroMotion.js:1754`, `ui/alerts.js:544` |
| `hazard:exit` | `systems/environmentalMachinery.js:1549`, `systems/world.js:6953` | `data/hazardLanguage.js:175`, `render/shipMicroMotion.js:1755`, `ui/alerts.js:555` |
| `heat:changed` | `systems/heat.js:935` | `audio/audioSystem.js:3055`, `render/vfx.js:2874`, `systems/barkDirector.js:850`, `systems/lawSecurity.js:425`, `systems/onboarding.js:735`, `systems/onboarding.js:738`, `systems/titles.js:593` |
| `heat:clear` | — | `systems/heat.js:415` |
| `heat:scrubRequested` | `data/encounters/1212-the-clean-sheet.js:328`, `systems/fenceDesk.js:352` | `systems/heat.js:451` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:1057` | `systems/missions.js:1935` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1521` | — |
| `heist:captureFork` | `systems/heistFacilities.js:2060` | `systems/missions.js:1944` |
| `heist:counterweight` | `systems/heistFacilities.js:3201` | `systems/missions.js:1955` |
| `heist:counterweightSceneReceipt` | `systems/heistFacilities.js:3524`, `systems/heistFacilities.js:3532`, `systems/heistFacilities.js:3537`, `systems/heistFacilities.js:3559` | — |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1947` | `systems/missions.js:1940` |
| `heist:launchCue` | `systems/heistFacilities.js:451`, `systems/heistFacilities.js:3896` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:591`, `systems/heistFacilities.js:600`, `systems/heistFacilities.js:604`, `systems/heistFacilities.js:618` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:2509` | — |
| `heist:monitorScan` | `systems/heistFacilities.js:3853` | `systems/missions.js:1948` |
| `heist:observed` | `systems/heistFacilities.js:2720` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:2451` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:2432` | `systems/npcJobsRuntime.js:1214` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:2370` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:326` |
| `heist:routineReceipt` | `systems/heistFacilities.js:1810` | — |
| `heist:shipmentUnit` | `systems/heistFacilities.js:1925` | `systems/missions.js:1951` |
| `helix:appealHeard` | `systems/faction_helix.js:1468`, `systems/faction_helix.js:1478` | — |
| `helix:auditBegun` | `systems/faction_helix.js:1546` | — |
| `helix:auditEvaded` | `systems/faction_helix.js:1613` | — |
| `helix:auditRuled` | `systems/faction_helix.js:1604` | — |
| `helix:deed` | `systems/faction_helix.js:630` | — |
| `helix:deskFiled` | `systems/faction_helix.js:929` | — |
| `helix:deskLost` | `systems/faction_helix.js:967` | — |
| `helix:docketChoice` | `ui/impoundPayPrompt.js:157` | `systems/faction_helix.js:513` |
| `helix:fineOverdue` | `systems/faction_helix.js:1397` | — |
| `helix:finePaid` | `systems/faction_helix.js:1442` | — |
| `helix:finePosted` | `systems/faction_helix.js:1382` | — |
| `helix:flagsDropped` | `systems/faction_helix.js:771` | — |
| `helix:garnished` | `systems/faction_helix.js:1416` | — |
| `helix:lienFiled` | `systems/faction_helix.js:839` | — |
| `helix:lienScraped` | `systems/faction_helix.js:813`, `systems/faction_helix.js:1947` | — |
| `helix:lienStuck` | `systems/faction_helix.js:873` | — |
| `helix:manifestFiled` | `systems/faction_helix.js:1511` | — |
| `helix:noticeJumped` | `systems/faction_helix.js:1908` | — |
| `helix:noticeLapsed` | `systems/faction_helix.js:960`, `systems/faction_helix.js:1206`, `systems/faction_helix.js:1221`, `systems/faction_helix.js:1257`, `systems/faction_helix.js:1295`, `systems/faction_helix.js:1318`, `systems/faction_helix.js:1333`, `systems/faction_helix.js:1912`, `systems/faction_helix.js:1929` | — |
| `helix:noticePosted` | `systems/faction_helix.js:1092` | — |
| `helix:noticeVerified` | `systems/faction_helix.js:1359` | — |
| `helix:precedent` | `systems/faction_helix.js:668` | — |
| `helix:serviceOffer` | `systems/faction_helix.js:2043` | `ui/impoundPayPrompt.js:87` |
| `helix:tier` | `systems/faction_helix.js:635` | — |
| `helix:verdictFiled` | `systems/faction_helix.js:654` | — |
| `helix:warrantEscalated` | `systems/faction_helix.js:1680` | — |
| `helix:warrantPosted` | `systems/faction_helix.js:1695` | — |
| `helix:warrantSettled` | `systems/faction_helix.js:1759` | — |
| `helix:writLevy` | `systems/faction_helix.js:1832` | — |
| `helix:writSpawned` | `systems/faction_helix.js:1734` | — |
| `history:deadNoted` | `systems/historyWear.js:65` | — |
| `history:decal` | `systems/historyWear.js:90` | `systems/ships.js:2135` |
| `history:trinket` | `systems/historyWear.js:85` | `systems/ships.js:2131` |
| `hud:firstUse` | `systems/onboarding.js:1255`, `systems/tetherGameplay.js:2187`, `systems/tetherGameplay.js:2258` | — |
| `hud:layoutChanged` | `ui/hudLayout.js:86` | `save/saveSystem.js:586`, `ui/stuntCallout.js:907` |
| `hud:phase` | `systems/story.js:347`, `systems/story.js:377`, `systems/story.js:380`, `systems/story.js:744` | — |
| `hud:recallObjective` | `ui/input.js:674` | — |
| `hud:slotClaim` | `ui/promptDeck.js:259` | — |
| `hud:slotRelease` | `ui/promptDeck.js:260` | — |
| `hud:tagFlicker` | `systems/story.js:721` | — |
| `hull:fractured` | `systems/hullFracture.js:549` | `render/authoredMotion.js:1168` |
| `hullBurst:activated` | `systems/hullBurst.js:231` | — |
| `hullBurst:ended` | `systems/hullBurst.js:253` | — |
| `hullBurst:hit` | `systems/hullBurst.js:400`, `systems/hullBurst.js:431`, `systems/hullBurst.js:610` | `render/authoredMotion.js:1166` |
| `hullBurst:released` | `systems/hullBurst.js:545` | — |
| `ilexArk:accepted` | `systems/ilexArk.js:178` | — |
| `ilexArk:finished` | `systems/ilexArk.js:210` | — |
| `ilexArk:harvested` | `systems/economy.js:4238` | — |
| `ilexArk:offer` | `systems/ilexArk.js:242` | `ui/ilexArkPrompt.js:7` |
| `ilexArk:vaultDelivered` | `systems/ilexArk.js:196` | — |
| `ilexArk:vaultReleased` | `systems/ilexArk.js:118` | — |
| `impoundGrudge:escalated` | `systems/impoundGrudge.js:636` | — |
| `impoundGrudge:offer` | `systems/impoundGrudge.js:718` | — |
| `impoundGrudge:offerRefused` | `systems/impoundGrudge.js:732` | — |
| `impoundGrudge:resolved` | `systems/impoundGrudge.js:693` | — |
| `impoundGrudge:sabotage` | `systems/impoundGrudge.js:818` | — |
| `impoundGrudge:settled` | `systems/impoundGrudge.js:752` | — |
| `impoundGrudge:surfaced` | `systems/impoundGrudge.js:1073` | — |
| `impoundGrudge:surfacingEnded` | `systems/impoundGrudge.js:650` | — |
| `impoundGrudge:tracked` | `systems/impoundGrudge.js:808` | — |
| `impoundLot:deskAnswered` | — | `ui/station/screens/shipworks.js:5491` |
| `impoundLot:deskIntent` | `ui/station/screens/shipworks.js:5499` | `systems/impoundLot.js:1101` |
| `industrialDisasters:commandRejected` | `features/industrialDisasters/runtime.js:208` | — |
| `industrialDisasters:consequence` | `features/industrialDisasters/runtime.js:442` | — |
| `industrialDisasters:discover` | `features/industrialDisasters/encounter.js:17` | — |
| `industrialDisasters:event` | `features/industrialDisasters/runtime.js:404` | — |
| `industrialDisasters:inspect` | `features/industrialDisasters/runtime.js:319`, `features/industrialDisasters/runtime.js:415` | — |
| `industrialDisasters:poses` | `features/industrialDisasters/workerAdapter.js:118` | — |
| `industrialDisasters:signal` | `features/industrialDisasters/runtime.js:264` | — |
| `industrialDisasters:status` | `features/industrialDisasters/runtime.js:455` | — |
| `industry:haulRequested` | `systems/environmentalMachinery.js:1132` | `systems/traffic.js:1906` |
| `input:worldGestureCancelled` | `systems/input.js:1375`, `ui/worldObjectInteraction.js:195` | `systems/masslineThrow.js:129` |
| `interdiction:triggered` | `systems/encounterScripts.js:613`, `systems/world.js:6379` | `render/authoredMotion.js:1180`, `systems/presentationOrchestrator.js:192`, `systems/sectorSim.js:144` |
| `intervention:available` | `systems/intervention.js:263` | — |
| `intervention:closed` | `systems/intervention.js:316` | — |
| `intervention:jumperRipped` | `systems/intervention.js:435` | — |
| `intervention:logged` | `systems/intervention.js:139` | — |
| `jump:arrive` | `systems/world.js:6319` | `render/authoredMotion.js:1228`, `render/feel.js:1553`, `render/infrastructureMotion.js:306`, `render/shipMicroMotion.js:1759`, `save/saveSystem.js:577`, `systems/gateControlDirector.js:74`, `systems/onboarding.js:813`, `systems/presentationOrchestrator.js:190`, `systems/sectorSim.js:168` |
| `jump:chargeAbort` | `systems/world.js:6459`, `systems/world.js:6552`, `systems/world.js:6618` | `audio/audioSystem.js:3034`, `render/authoredMotion.js:1229`, `render/shipMicroMotion.js:1760`, `systems/gateControlDirector.js:75`, `systems/presentationOrchestrator.js:189`, `systems/routeFollower.js:423`, `ui/galaxyMap.js:3047`, `ui/toasts.js:861` |
| `jump:chargeStart` | `systems/world.js:6534`, `systems/world.js:6578` | `render/authoredMotion.js:1226`, `render/feel.js:1543`, `render/shipMicroMotion.js:1756`, `systems/cloak.js:55`, `systems/cruise.js:72`, `systems/gateControlDirector.js:72`, `systems/missions.js:1738`, `systems/presentationOrchestrator.js:186`, `systems/story.js:226`, `ui/galaxyMap.js:3046` |
| `jump:chargeTick` | `systems/world.js:6252` | `render/authoredMotion.js:1220`, `render/shipMicroMotion.js:1757`, `systems/presentationOrchestrator.js:187` |
| `jump:departurePreflight` | `systems/world.js:6516` | `systems/story.js:225` |
| `jump:interdictionWarning` | `systems/world.js:6278` | — |
| `jump:start` | `systems/world.js:6283` | `audio/audioSystem.js:3033`, `render/authoredMotion.js:1227`, `render/feel.js:1547`, `render/infrastructureMotion.js:299`, `render/shipMicroMotion.js:1758`, `systems/economy.js:1867`, `systems/gateControlDirector.js:73`, `systems/mining.js:305`, `systems/presentationOrchestrator.js:188`, `systems/sectorSim.js:167` |
| `jump:unfiledConfirmed` | `systems/world.js:6598` | `systems/story.js:227` |
| `kesslerPod:weighed` | `systems/kesslerScale.js:182` | `systems/missions.js:1786` |
| `kilnback:caskReleased` | `systems/kilnback.js:163` | — |
| `kilnback:caskSalvaged` | `systems/kilnback.js:224` | — |
| `kilnback:coolantReleased` | `systems/kilnback.js:212` | — |
| `kilnback:phase` | `systems/kilnback.js:252` | — |
| `lamplighter:amends` | `systems/lamplighter.js:693` | — |
| `lamplighter:askLapsed` | `systems/lamplighter.js:838`, `systems/lamplighter.js:873` | — |
| `lamplighter:askPosted` | `systems/lamplighter.js:808` | — |
| `lamplighter:askSoured` | `systems/lamplighter.js:887` | — |
| `lamplighter:askVerified` | `systems/lamplighter.js:826` | — |
| `lamplighter:favor` | `systems/lamplighter.js:676` | — |
| `lamplighter:forgiven` | `systems/lamplighter.js:697` | — |
| `lamplighter:grudge` | `systems/lamplighter.js:715` | — |
| `lamplighter:guttered` | `systems/lamplighter.js:910` | — |
| `lamplighter:keeperTier` | `systems/lamplighter.js:679` | — |
| `lamplighter:lampSiphoned` | `systems/lamplighter.js:1062` | — |
| `lamplighter:lampTended` | `systems/lamplighter.js:1118` | — |
| `lamplighter:logged` | `systems/lamplighter.js:668` | — |
| `lamplighter:oilPodDropped` | `systems/lamplighter.js:947` | — |
| `lamplighter:oilSold` | `systems/lamplighter.js:1097` | — |
| `lamplighter:oiled` | `systems/lamplighter.js:1146` | — |
| `lamplighter:planted` | `systems/lamplighter.js:1167` | — |
| `lamplighter:rimPaid` | `systems/lamplighter.js:1179` | — |
| `lamplighter:snufferDowned` | `systems/lamplighter.js:1269` | — |
| `lamplighter:snufferInbound` | `systems/lamplighter.js:982` | — |
| `lamplighter:spurned` | `systems/lamplighter.js:718` | — |
| `lamplighter:wayfarerArrived` | `systems/lamplighter.js:1014` | — |
| `lamplighter:wayfarerInbound` | `systems/lamplighter.js:966` | — |
| `lamplighter:wayfarerLost` | `systems/lamplighter.js:1281` | — |
| `lamplighter:wayfarerTurned` | `systems/lamplighter.js:999` | — |
| `landmark:artifactRecovered` | `systems/missionObjectiveOps.js:849` | `systems/world.js:789` |
| `lane:facadeMiss` | `runtime/laneSystemFacades.js:57` | — |
| `lanternWard:serviceCommitted` | — | `systems/missions.js:1694` |
| `lastShift:archive` | `ui/lastShiftPrompt.js:92`, `ui/lastShiftPrompt.js:102` | — |
| `lastShift:archived` | `systems/lastShift.js:408` | — |
| `lastShift:cancelRecovery` | `ui/lastShiftPrompt.js:104` | — |
| `lastShift:cue` | `systems/lastShift.js:268` | `ui/lastShiftPrompt.js:25` |
| `lastShift:cueSurfaced` | `ui/lastShiftPrompt.js:56` | — |
| `lastShift:offer` | `systems/lastShift.js:387` | `ui/lastShiftPrompt.js:26` |
| `lastShift:readRecovery` | `ui/lastShiftPrompt.js:97`, `ui/lastShiftPrompt.js:99` | — |
| `lastShift:recorderReturned` | `systems/lastShift.js:450` | — |
| `lastShift:recover` | `ui/lastShiftPrompt.js:103` | — |
| `lastShift:returnRecorder` | `ui/lastShiftPrompt.js:105` | — |
| `law:audit` | — | `systems/lawSecurity.js:436` |
| `law:custodyAcknowledged` | — | `systems/barkDirector.js:838` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:57`, `systems/lossLedger.js:468` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:828` |
| `law:distressRaised` | — | `systems/barkDirector.js:847` |
| `law:fineAssessed` | — | `systems/barkDirector.js:841`, `ui/impoundPayPrompt.js:74` |
| `law:fineChoice` | `ui/impoundPayPrompt.js:319`, `ui/impoundPayPrompt.js:413` | `systems/lawSecurity.js:434` |
| `law:fineRefused` | — | `ui/impoundPayPrompt.js:75` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:196` | `systems/lawSecurity.js:426` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:68` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:69` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:59` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:61`, `systems/heat.js:425`, `ui/impoundPayPrompt.js:70` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:71` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:60` |
| `law:incidentOpened` | — | `systems/traffic.js:1808` |
| `law:incidentResolved` | — | `systems/barkDirector.js:845` |
| `law:killedAdjudicated` | — | `systems/factions.js:383` |
| `law:obligationNoted` | — | `ui/impoundPayPrompt.js:79` |
| `law:obligationPaid` | — | `systems/factions.js:391`, `ui/impoundPayPrompt.js:80` |
| `law:playerSurrender` | — | `systems/lawSecurity.js:435` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:834`, `systems/factions.js:471`, `systems/heat.js:448` |
| `law:response` | — | `systems/barkDirector.js:844` |
| `law:responseDeferred` | — | `systems/barkDirector.js:843` |
| `law:sanctuaryWithdrawal` | — | `systems/barkDirector.js:842` |
| `law:sponsorPay` | — | `systems/lawSecurity.js:427` |
| `law:sponsorSettled` | — | `systems/heat.js:433` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:421` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:830` |
| `law:wantedSweepEscaped` | — | `systems/heat.js:429` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:829` |
| `law:wantedWarrantReleased` | — | `systems/barkDirector.js:846` |
| `law:warrantIssued` | `data/encounters/700-the-weighing.js:286` | — |
| `law:witnessChoice` | — | `systems/encounterDirector.js:436` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `render/authoredMotion.js:1191`, `systems/lawSecurity.js:413` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `ledger:evidenceLinked` | `ui/shipLedgerPanel.js:552` | `systems/story.js:187` |
| `line:classChanged` | `systems/lineProgression.js:172` | — |
| `line:recordStamped` | `systems/lineProgression.js:120` | — |
| `lineHead:breakerSplit` | `systems/lineHeads.js:223` | — |
| `lineHead:sealed` | `systems/lineHeads.js:288` | — |
| `lineHead:stapled` | `systems/lineHeads.js:453` | — |
| `longBerth:claim` | `ui/longBerthPrompt.js:39` | `systems/longBerth.js:66` |
| `longBerth:claimOffer` | `systems/longBerth.js:160` | `ui/longBerthPrompt.js:78` |
| `longBerth:restore` | `ui/longBerthPrompt.js:66` | `systems/longBerth.js:67` |
| `longBerth:restoreOffer` | `systems/longBerth.js:254` | `ui/longBerthPrompt.js:79` |
| `longBerth:stage` | `systems/longBerth.js:291` | `systems/crew.js:111` |
| `longBerth:trophy` | `systems/longBerth.js:312` | `systems/crew.js:114` |
| `loot:drop` | `systems/combat.js:877`, `systems/lootShards.js:1163`, `systems/stuntGrammar.js:202` | `systems/mining.js:299` |
| `loot:magnetCaptured` | `systems/lootShards.js:739` | `audio/audioSystem.js:2947` |
| `loot:manifestPayload` | `systems/lootShards.js:1272` | `systems/missions.js:2035`, `systems/traffic.js:1791`, `systems/traffic.js:1796` |
| `loot:overflowConverted` | `systems/mining.js:2850` | `audio/audioSystem.js:2946` |
| `lossInvestigation:closed` | `systems/lossInvestigation.js:331` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:194` | `systems/lossInvestigation.js:129` |
| `lossLedger:claimSurvey` | `systems/scanReveal.js:172` | `systems/lossLedger.js:463` |
| `lossLedger:priceMove` | `systems/lossLedger.js:622` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:403` | `systems/factionPresence.js:518`, `systems/ships.js:2072` |
| `machine:appealAccepted` | `systems/precursorMachines.js:187` | — |
| `machine:jurisdictionResolved` | `systems/machineWork.js:262` | — |
| `machine:repairCompleted` | `systems/machineWork.js:221`, `systems/machineWork.js:328` | — |
| `machine:tokenDelivered` | `systems/precursorMachines.js:1046`, `systems/precursorMachines.js:1107` | — |
| `machine:workpiecePlaced` | `systems/machineWork.js:398` | — |
| `mail:delivered` | `systems/mail.js:238` | — |
| `manifest:changed` | `systems/manifestGame.js:10` | `ui/screens/manifest.js:23` |
| `manifest:completed` | `systems/manifestGame.js:17` | — |
| `map:sectorCharted` | `systems/world.js:5004` | `systems/economy.js:1776` |
| `massSeed:cleared` | `systems/massSeed.js:613` | — |
| `massSeed:collapsed` | `systems/massSeed.js:436`, `systems/massSeed.js:486`, `systems/massSeed.js:566`, `systems/massSeed.js:596` | `render/authoredMotion.js:1219` |
| `massSeed:collapsing` | `systems/massSeed.js:435`, `systems/massSeed.js:457`, `systems/massSeed.js:552`, `systems/massSeed.js:594` | `audio/audioSystem.js:3254` |
| `massSeed:deployDenied` | `systems/massSeed.js:175` | — |
| `massSeed:deployed` | `systems/massSeed.js:265` | `audio/audioSystem.js:3238`, `render/authoredMotion.js:1216`, `systems/onboarding.js:1039` |
| `massSeed:destroyed` | `systems/massSeed.js:593` | — |
| `massSeed:locked` | `systems/massSeed.js:322` | `audio/audioSystem.js:3246`, `render/authoredMotion.js:1217` |
| `massSeed:locking` | `systems/massSeed.js:387` | `audio/audioSystem.js:3242` |
| `massSeed:tetherCut` | `systems/massSeed.js:514` | `audio/audioSystem.js:3259`, `render/authoredMotion.js:1218` |
| `massSeed:warning` | `systems/massSeed.js:349` | `audio/audioSystem.js:3250` |
| `massline:bridleCut` | `systems/tetherGameplay.js:1093` | `ui/stuntCallout.js:982` |
| `massline:bridleEnded` | `systems/tetherGameplay.js:1030`, `systems/tetherGameplay.js:1048`, `systems/tetherGameplay.js:1267` | `ui/masslineHud.js:1262` |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:887` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:941` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:1103` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2810` | — |
| `massline:flailOffer` | `systems/tetherGameplay.js:514`, `systems/tetherGameplay.js:725` | `systems/rockCore.js:94` |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:3013` | `systems/barkDirector.js:933` |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1955` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:2078` | `systems/gamepad.js:1016` |
| `massline:recovered` | `systems/tumbleStates.js:267` | — |
| `massline:recovering` | `systems/tumbleStates.js:698` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:186` | `audio/audioSystem.js:2934` |
| `massline:releaseValidated` | `systems/masslineThrow.js:629` | `systems/presentationOrchestrator.js:167` |
| `massline:releaseWindow` | `systems/masslineThrow.js:247` | `ui/stuntCallout.js:974` |
| `massline:rideStarted` | `systems/tetherGameplay.js:2231` | `ui/stuntCallout.js:975` |
| `massline:selfSling` | `systems/masslineThrow.js:658` | `systems/flightV3.js:248`, `systems/onboarding.js:1003`, `ui/stuntCallout.js:913` |
| `massline:snareArmed` | `systems/masslineSnares.js:239` | `audio/audioSystem.js:3230`, `render/authoredMotion.js:1157` |
| `massline:snareCaught` | `systems/masslineSnares.js:434` | `systems/gamepad.js:1007` |
| `massline:snareCut` | `systems/masslineSnares.js:727` | `audio/audioSystem.js:3234` |
| `massline:snareDeployed` | `systems/masslineSnares.js:341`, `systems/masslineSnares.js:686` | `render/authoredMotion.js:1151` |
| `massline:snareEnded` | `systems/masslineSnares.js:729` | `render/authoredMotion.js:1155` |
| `massline:sweepImpact` | `systems/masslineImpacts.js:351` | `render/vfx.js:2862`, `systems/masslineImpactDamage.js:58`, `systems/presentationOrchestrator.js:154`, `ui/stuntCallout.js:981` |
| `massline:threat` | `systems/masslineThreats.js:273` | `systems/presentationOrchestrator.js:130` |
| `massline:throw` | `systems/masslineThrow.js:571` | `systems/lootShards.js:603`, `systems/mines.js:77`, `systems/missions.js:1923`, `systems/tumbleStates.js:129`, `ui/stuntCallout.js:977` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:697` | `render/feel.js:1638`, `render/shipMicroMotion.js:1752` |
| `massline:tumbled` | `systems/tumbleStates.js:562` | `render/feel.js:1624` |
| `matter:refused` | `matter/collectorKnot.js:97`, `systems/gyreSnare.js:2279`, `systems/gyreSnare.js:2747` | `ui/arsenalDenials.js:31` |
| `mercyService:completed` | `response/mercyService/live.js:226` | — |
| `mercyService:failedForward` | `response/mercyService/live.js:272` | — |
| `mercyService:order` | `ui/physicalJobsPrompt.js:25` | — |
| `mercyService:started` | `response/mercyService/live.js:83` | — |
| `mercyService:tool` | `ui/physicalJobsPrompt.js:28` | — |
| `mercyService:toolResult` | `response/mercyService/live.js:53` | — |
| `meridian:accountCharged` | `systems/faction_meridian.js:477` | — |
| `meridian:accountPaid` | `systems/faction_meridian.js:667` | — |
| `meridian:accountWarned` | `systems/faction_meridian.js:1523` | — |
| `meridian:assessmentCharged` | `systems/faction_meridian.js:1519` | — |
| `meridian:blacklistLifted` | `systems/faction_meridian.js:1494` | — |
| `meridian:blacklisted` | `systems/faction_meridian.js:1487`, `systems/faction_meridian.js:1505` | — |
| `meridian:claimPosted` | `systems/faction_meridian.js:1023` | — |
| `meridian:claimSettled` | `systems/faction_meridian.js:1083` | — |
| `meridian:claimStolen` | `systems/faction_meridian.js:1127` | — |
| `meridian:containerRecoupled` | `systems/faction_meridian.js:781` | — |
| `meridian:containerSold` | `data/encounters/701-spine-break.js:189` | — |
| `meridian:contractDefaulted` | `systems/faction_meridian.js:983` | — |
| `meridian:contractDelivered` | `systems/faction_meridian.js:941` | — |
| `meridian:contractExpired` | `systems/faction_meridian.js:953` | — |
| `meridian:contractPosted` | `systems/faction_meridian.js:901` | — |
| `meridian:contractTaken` | `systems/faction_meridian.js:646` | — |
| `meridian:convoyArrived` | `systems/faction_meridian.js:1312` | — |
| `meridian:convoyDeparted` | `systems/faction_meridian.js:1225` | — |
| `meridian:convoyLost` | `systems/faction_meridian.js:1334` | — |
| `meridian:convoyRaided` | `systems/faction_meridian.js:1363` | — |
| `meridian:couplerSnapped` | `systems/faction_meridian.js:731` | — |
| `meridian:deed` | `systems/faction_meridian.js:451` | — |
| `meridian:escortAsked` | `systems/faction_meridian.js:1229` | — |
| `meridian:escortSigned` | `systems/faction_meridian.js:1278` | — |
| `meridian:levyCollected` | `systems/faction_meridian.js:1582` | — |
| `meridian:raiderPlucked` | `systems/faction_meridian.js:1414` | — |
| `meridian:raiderRepelled` | `systems/faction_meridian.js:1749` | — |
| `meridian:refused` | `systems/faction_meridian.js:497` | — |
| `meridian:repoFielded` | `systems/faction_meridian.js:1621` | — |
| `meridian:tickerFloor` | `systems/faction_meridian.js:807` | — |
| `meridian:tier` | `systems/faction_meridian.js:446` | — |
| `meridian:verdictFiled` | `systems/faction_meridian.js:463` | — |
| `meridian:warrantLapsed` | `systems/faction_meridian.js:1472` | — |
| `meridian:warrantPaid` | `systems/faction_meridian.js:1729` | — |
| `meridian:warrantPosted` | `systems/faction_meridian.js:1447` | — |
| `meridian:writPosted` | `systems/faction_meridian.js:1544` | — |
| `meridian:writSettled` | `systems/faction_meridian.js:1641` | — |
| `mines:armed` | `systems/mines.js:209`, `systems/mines.js:246`, `systems/mines.js:289` | `render/ordnanceMotionPresentation.js:265` |
| `mines:capReached` | `systems/mines.js:104` | `audio/audioSystem.js:2978` |
| `mines:detonated` | `systems/mines.js:387` | `audio/audioSystem.js:2891` |
| `mines:expired` | `systems/mines.js:196` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:153`, `systems/encounterScripts/weirAmbush.js:241`, `systems/impoundGrudge.js:990`, `systems/survivalArena.js:1583`, `systems/swarmEvents.js:278` | `systems/mines.js:76` |
| `mines:placed` | `systems/mines.js:175` | `systems/survivalArena.js:1269` |
| `mines:released` | `systems/mines.js:303`, `systems/mines.js:422` | — |
| `mines:triggered` | `systems/mines.js:377` | — |
| `mines:turned` | `systems/mines.js:249` | — |
| `mining:beamLocked` | `systems/mining.js:1139` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2685` | `systems/missions.js:1857`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:1153` | `systems/presentationOrchestrator.js:220`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:940` | `ui/miningHud.js:210` |
| `mining:npcExtraction` | `systems/trafficRecoveryOps.js:686` | `systems/fieldDepletion.js:756` |
| `mining:podSplit` | `systems/mining.js:2061` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2630` | `render/asteroidMotionPresentation.js:527`, `systems/presentationOrchestrator.js:217`, `ui/miningHud.js:213` |
| `mining:richCoreCompleted` | `systems/mining.js:2663` | `render/asteroidMotionPresentation.js:528`, `systems/presentationOrchestrator.js:218`, `ui/miningHud.js:214` |
| `mining:richCoreExposed` | `systems/mining.js:2608` | `render/asteroidMotionPresentation.js:526`, `systems/presentationOrchestrator.js:216`, `ui/miningHud.js:212` |
| `mining:richCoreFizzle` | `systems/mining.js:2667` | `render/asteroidMotionPresentation.js:529`, `systems/presentationOrchestrator.js:219`, `ui/miningHud.js:215` |
| `mining:seamHit` | `systems/mining.js:2987` | `systems/presentationOrchestrator.js:209` |
| `mining:start` | `systems/mining.js:489`, `systems/mining.js:543`, `systems/mining.js:604`, `systems/mining.js:745`, `systems/mining.js:2007` | `audio/audioSystem.js:2848`, `render/asteroidMotionPresentation.js:521`, `render/authoredMotion.js:1146`, `render/authoredMotion.js:1173`, `render/vfx.js:2887`, `systems/missions.js:2021`, `systems/onboarding.js:654`, `systems/presentationOrchestrator.js:206`, `ui/miningHud.js:208`, `ui/worldObjectInteraction.js:418` |
| `mining:stop` | `systems/mining.js:881` | `audio/audioSystem.js:2849`, `render/asteroidMotionPresentation.js:522`, `render/authoredMotion.js:1148`, `render/authoredMotion.js:1174`, `render/vfx.js:2888`, `systems/presentationOrchestrator.js:207`, `ui/miningHud.js:209` |
| `mining:tick` | `systems/automation.js:1215`, `systems/mining.js:1174` | `audio/audioSystem.js:2850`, `render/vfx.js:2889`, `systems/presentationOrchestrator.js:208`, `ui/miningHud.js:211` |
| `mining:ventBonus` | `systems/mining.js:996` | `systems/onboarding.js:845`, `ui/miningHud.js:216` |
| `mining:ventReady` | `systems/mining.js:921` | `systems/presentationOrchestrator.js:213` |
| `mining:yield` | `balance/careerCohorts.js:2304`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:991`, `systems/mining.js:1376`, `systems/mining.js:1449`, `systems/mining.js:2162`, `systems/mining.js:2660` | `careers/origins/prospectorOrigin.js:636`, `render/authoredMotion.js:1147`, `render/vfx.js:2892`, `systems/encounterDirector.js:413`, `systems/missions.js:1840`, `systems/onboarding.js:655`, `systems/presentationOrchestrator.js:214` |
| `missile:guidanceLost` | `systems/weapons.js:1169` | — |
| `mission:abandon` | `systems/moralTrap.js:310` | `systems/missions.js:1731` |
| `mission:abandoned` | — | `systems/contractClauses.js:375` |
| `mission:accepted` | `systems/missions.js:2518` | `audio/audioSystem.js:2993`, `save/saveSystem.js:578`, `systems/aftermathWrecks.js:1249`, `systems/contractClauses.js:370`, `systems/contractClauses.js:371`, `systems/economy.js:1748`, `systems/encounterDirector.js:415`, `systems/faction_frontier.js:466`, `systems/fenceDesk.js:53`, `systems/moralTrap.js:191`, `systems/onboarding.js:657`, `ui/screens/missionLog.js:2560`, `ui/wreckChoicePrompt.js:45` |
| `mission:completed` | `missions/lanternWardStory.js:84`, `systems/missions.js:5569`, `systems/missions.js:5589`, `systems/missions.js:5880` | `audio/audioSystem.js:2997`, `balance/careerCohorts.js:2242`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:579`, `systems/aftermathWrecks.js:1250`, `systems/claims.js:354`, `systems/contractClauses.js:372`, `systems/contractClauses.js:379`, `systems/crew.js:106`, `systems/economyContracts.js:265`, `systems/encounterDirector.js:424`, `systems/faction_frontier.js:468`, `systems/factions.js:506`, `systems/fenceDesk.js:54`, `systems/lossLedger.js:466`, `systems/onboarding.js:658`, `systems/story.js:248`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2561` |
| `mission:conditionBroken` | `systems/contractClauses.js:674`, `systems/missions.js:2274` | — |
| `mission:conditionPending` | `systems/missions.js:2330` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:642`, `systems/missions.js:2257` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:653`, `systems/missions.js:2265` | `systems/missions.js:1986` |
| `mission:expired` | `systems/missions.js:6398` | `audio/audioSystem.js:3005`, `save/saveSystem.js:581`, `systems/aftermathWrecks.js:1252`, `systems/contractClauses.js:374`, `systems/contractClauses.js:384`, `systems/encounterDirector.js:429`, `systems/factions.js:515`, `systems/fenceDesk.js:60`, `ui/screens/missionLog.js:2563` |
| `mission:failed` | `systems/missions.js:6314` | `audio/audioSystem.js:3004`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:580`, `systems/aftermathWrecks.js:1251`, `systems/contractClauses.js:373`, `systems/encounterDirector.js:425`, `systems/faction_frontier.js:467`, `systems/factions.js:514`, `systems/fenceDesk.js:55`, `systems/story.js:249`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2562` |
| `mission:forceEvent` | `data/encounters/1206-the-fire-sale.js:124`, `systems/economyContracts.js:871` | `systems/economy.js:1877` |
| `mission:gateCleared` | `systems/missions.js:4672`, `systems/missions.js:4800` | — |
| `mission:offerBoarded` | `systems/missionBoardOps.js:1169` | `systems/aftermathWrecks.js:1248`, `systems/economyContracts.js:246` |
| `mission:offered` | `response/mercyService/live.js:136`, `systems/aftermathWrecks.js:2469`, `systems/alienEcology.js:777`, `systems/careerContracts.js:329`, `systems/e1EncounterRuntime.js:519`, `systems/economyContracts.js:403`, `systems/lossInvestigation.js:284`, `systems/lossLedger.js:379`, `systems/postEndingReplay.js:371`, `systems/salvage.js:1257`, `systems/uniqueWrecks.js:1122` | `systems/economy.js:1747`, `systems/lossInvestigation.js:128`, `systems/missions.js:1736`, `systems/survivorPod.js:665` |
| `mission:setPieceTransition` | `systems/missions.js:5525` | `systems/lossInvestigation.js:130` |
| `mission:setPieceTravelLine` | `systems/missionStoryOps.js:1324` | — |
| `mission:spawnDeferred` | `systems/missionSpawningOps.js:1314` | — |
| `mission:targetsProjected` | `systems/missionSpawningOps.js:87` | — |
| `mission:updated` | `missions/blackFlagMissions.js:183`, `missions/cinderRoute.js:151`, `missions/cinderRoute.js:178`, `missions/furnaceWorksiteRuntime.js:80`, `systems/contractClauses.js:647`, `systems/contractClauses.js:657`, `systems/contractClauses.js:686`, `systems/missionBoardOps.js:86`, `systems/missionBoardOps.js:250`, `systems/missionBoardOps.js:450`, `systems/missionBoardOps.js:597`, `systems/missionBoardOps.js:961`, `systems/missionBoardOps.js:995`, `systems/missionBoardOps.js:1007`, `systems/missionBoardOps.js:1168`, `systems/missionObjectiveOps.js:54`, `systems/missionObjectiveOps.js:98`, `systems/missionObjectiveOps.js:111`, `systems/missionObjectiveOps.js:127`, `systems/missionObjectiveOps.js:143`, `systems/missionObjectiveOps.js:189`, `systems/missionObjectiveOps.js:231`, `systems/missionObjectiveOps.js:299`, `systems/missionObjectiveOps.js:373`, `systems/missionObjectiveOps.js:404`, `systems/missionObjectiveOps.js:524`, `systems/missionObjectiveOps.js:637`, `systems/missionObjectiveOps.js:646`, `systems/missionObjectiveOps.js:923`, `systems/missionObjectiveOps.js:949`, `systems/missionObjectiveOps.js:1020`, `systems/missionObjectiveOps.js:1036`, `systems/missionObjectiveOps.js:1080`, `systems/missionObjectiveOps.js:1101`, `systems/missionObjectiveOps.js:1131`, `systems/missionObjectiveOps.js:1154`, `systems/missionObjectiveOps.js:1265`, `systems/missionObjectiveOps.js:1457`, `systems/missionObjectiveOps.js:2642`, `systems/missionObjectiveOps.js:2769`, `systems/missionObjectiveOps.js:2883`, `systems/missionObjectiveOps.js:2973`, `systems/missionSpawningOps.js:498`, `systems/missionSpawningOps.js:516`, `systems/missionSpawningOps.js:588`, `systems/missionSpawningOps.js:953`, `systems/missionSpawningOps.js:1278`, `systems/missionSpawningOps.js:1305`, `systems/missionSpawningOps.js:1402`, `systems/missionSpawningOps.js:1530`, `systems/missionSpawningOps.js:1707`, `systems/missionStoryOps.js:163`, `systems/missionStoryOps.js:245`, `systems/missionStoryOps.js:315`, `systems/missionStoryOps.js:519`, `systems/missionStoryOps.js:552`, `systems/missionStoryOps.js:567`, `systems/missionStoryOps.js:581`, `systems/missionStoryOps.js:766`, `systems/missionStoryOps.js:908`, `systems/missionStoryOps.js:956`, `systems/missionStoryOps.js:1042`, `systems/missionStoryOps.js:1577`, `systems/missionStoryOps.js:2285`, `systems/missionStoryOps.js:2399`, `systems/missionStoryOps.js:2445`, `systems/missions.js:1613`, `systems/missions.js:1625`, `systems/missions.js:1635`, `systems/missions.js:1830`, `systems/missions.js:2261`, `systems/missions.js:2269`, `systems/missions.js:2290`, `systems/missions.js:2360`, `systems/missions.js:2374`, `systems/missions.js:2388`, `systems/missions.js:2398`, `systems/missions.js:2411`, `systems/missions.js:2430`, `systems/missions.js:2531`, `systems/missions.js:2770`, `systems/missions.js:2797`, `systems/missions.js:2955`, `systems/missions.js:3233`, `systems/missions.js:3953`, `systems/missions.js:3990`, `systems/missions.js:4001`, `systems/missions.js:4017`, `systems/missions.js:4351`, `systems/missions.js:4589`, `systems/missions.js:4611`, `systems/missions.js:4686`, `systems/missions.js:4730`, `systems/missions.js:4806`, `systems/missions.js:4873`, `systems/missions.js:5020`, `systems/missions.js:5027`, `systems/missions.js:5865`, `systems/missions.js:6328`, `systems/missions.js:6409`, `systems/wakeHandoffRuntime.js:25`, `systems/workingBattlefieldRuntime.js:148` | `systems/contractClauses.js:393`, `ui/screens/missionLog.js:2559`, `ui/station/screens/contracts.js:1626` |
| `mission:venueFailure` | `response/mercyService/live.js:283`, `systems/wreckCourt.js:1071` | `systems/missions.js:1881` |
| `mission:venueProof` | `response/mercyService/live.js:227`, `systems/wreckCourt.js:1034` | `systems/missions.js:1869` |
| `mode:changed` | `core/simLaneCommands.js:180`, `main.js:456`, `main.js:1163`, `main.js:1205`, `main.js:1217`, `save/saveSystem.js:6506`, `save/saveSystem.js:6532`, `save/saveSystem.js:7244`, `save/saveSystem.js:7582` | `render/feel.js:1378`, `systems/autoTargetAssist.js:143`, `systems/presentationAdapters.js:342`, `systems/scanner.js:1112`, `ui/loadingPresenter.js:573`, `ui/masslineHud.js:1285`, `ui/screenManager.js:732`, `ui/screens/mainMenu.js:1194`, `ui/uiRoot.js:1179`, `ui/wingmanRadial.js:348` |
| `module:equipped` | `systems/ships.js:3352` | `systems/onboarding.js:693`, `systems/onboarding.js:703`, `systems/onboarding.js:1055`, `systems/ships.js:1960`, `systems/survivalDraft.js:214`, `systems/world.js:744`, `ui/station/screens/shipworks.js:4792` |
| `module:fitRefused` | `systems/ships.js:2049`, `systems/ships.js:2055`, `systems/ships.js:2699`, `systems/ships.js:3289`, `systems/ships.js:3362` | `ui/station/screens/shipworks.js:4796`, `ui/station/screens/shipworks.js:4819`, `ui/station/screens/shipworks.js:4828` |
| `module:granted` | `systems/ships.js:2341`, `systems/ships.js:2791`, `systems/ships.js:2802` | — |
| `module:purchased` | `systems/ships.js:2763` | `systems/onboarding.js:855` |
| `module:sold` | `systems/ships.js:2688` | — |
| `module:unequipped` | `systems/ships.js:2202`, `systems/ships.js:3397` | `systems/ships.js:1961`, `systems/survivalDraft.js:215`, `systems/world.js:745`, `ui/station/screens/shipworks.js:4816` |
| `moisture:loss` | `systems/moistureLoss.js:208` | — |
| `moment:amended` | `systems/bulletTime.js:278` | `ui/clipCaptureRuntime.js:111` |
| `moment:holyShit` | — | `render/feel.js:1613`, `systems/gamepad.js:1138` |
| `moralMemory:remember` | `data/encounters/1211-the-forecastle-vote.js:437`, `data/encounters/1211-the-forecastle-vote.js:444` | `systems/encounterDirector.js:400` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:529` | `systems/encounterDirector.js:402` |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:190` |
| `moralTrap:resolved` | `systems/moralTrap.js:306` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:254` | `ui/moralTrapPrompt.js:37` |
| `morrow:launch` | `systems/morrow.js:291` | — |
| `morrow:met` | `systems/morrow.js:223` | — |
| `morrow:voice` | `systems/morrow.js:197` | — |
| `mothlight:identified` | `systems/mothlight.js:225` | `ui/mothlightPrompt.js:6` |
| `mothlight:lampReleased` | `systems/mothlight.js:132` | — |
| `mothlight:phase` | `systems/mothlight.js:179` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:3810` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:440` |
| `nav:abortRoute` | — | `systems/routeFollower.js:415` |
| `nav:autopilot` | `systems/flight.js:408`, `systems/flightV3.js:1527`, `systems/flightV3.js:1828`, `systems/missions.js:3298`, `systems/missions.js:3320`, `systems/world.js:6709` | `systems/routeFollower.js:418` |
| `nav:engageRoute` | `systems/routeFollower.js:413`, `ui/screens/starmap.js:1821` | `systems/routeFollower.js:408` |
| `nav:routeBrake` | — | `audio/audioSystem.js:3103` |
| `nav:waypoint` | `features/industrialDisasters/runtime.js:307`, `save/saveSystem.js:8346`, `systems/claims.js:1879`, `systems/claims.js:1887`, `systems/missionObjectiveOps.js:72`, `systems/missionObjectiveOps.js:1213`, `systems/missionStoryOps.js:2750`, `systems/missions.js:1755`, `systems/missions.js:3222`, `systems/missions.js:3353`, `systems/missions.js:3388`, `systems/world.js:6708`, `ui/market/tradeLogic.js:573` | `render/authoredMotion.js:1176` |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:135` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:205` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:131` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `nest:waspsLaunched` | `data/encounters/705-the-nest.js:396` | — |
| `news:headline` | `systems/aftermathWrecks.js:890`, `systems/aftermathWrecks.js:990`, `systems/e1EncounterRuntime.js:329`, `systems/lastShift.js:403`, `systems/nemesisSignals.js:25`, `systems/presentationOrchestrator.js:1328`, `systems/trafficCausalChainOps.js:2794`, `systems/trafficRecoveryOps.js:336`, `ui/marketNews.js:296` | — |
| `news:publish` | `data/encounters/1311-eris-last-pod.js:266`, `data/encounters/1311-eris-last-pod.js:294`, `data/encounters/362-the-salvage-watch.js:344`, `data/encounters/362-the-salvage-watch.js:360`, `data/encounters/362-the-salvage-watch.js:451`, `data/encounters/365-the-grandee.js:102`, `data/encounters/365-the-grandee.js:166`, `data/encounters/365-the-grandee.js:196`, `data/encounters/367-the-salvage-tail.js:272`, `data/encounters/367-the-salvage-tail.js:317`, `data/encounters/367-the-salvage-tail.js:343`, `systems/aftermathWrecks.js:898`, `systems/aftermathWrecks.js:1008`, `systems/blindWelderRuntime.js:162`, `systems/choirReliefBerth.js:367`, `systems/choirReliefBerth.js:407`, `systems/claims.js:2422`, `systems/claims.js:2630`, `systems/claims.js:3112`, `systems/claims.js:3159`, `systems/crSituationKit.js:69`, `systems/driftAuctionRuntime.js:194`, `systems/driftAuctionRuntime.js:211`, `systems/driftAuctionRuntime.js:403`, `systems/eighthBellRuntime.js:140`, `systems/factions.js:354`, `systems/factions.js:607`, `systems/glueMeetMassRuntime.js:120`, `systems/heliosClaimOpening.js:83`, `systems/heliosClaimOpening.js:119`, `systems/impoundGrudge.js:682`, `systems/impoundLot.js:1390`, `systems/memorialThief.js:135`, `systems/npcJobsRuntime.js:1582`, `systems/presentationOrchestrator.js:1335`, `systems/runawayKilnRuntime.js:191`, `systems/runawayKilnRuntime.js:208`, `systems/special500Director.js:286`, `systems/special500Spectacle.js:136`, `systems/trafficCausalChainOps.js:2300`, `systems/trafficJobOps.js:983`, `systems/uniqueWrecks.js:669`, `systems/uniqueWrecks.js:2057`, `systems/uniqueWrecks.js:2136`, `systems/world.js:1066`, `systems/world.js:4970`, `systems/worldClock.js:173`, `systems/worldPressure.js:446`, `ui/watchlistHud.js:77` | — |
| `news:render` | `ui/hud.js:2009` | — |
| `npc:hailed` | `systems/barkDirector.js:1963`, `systems/barkDirector.js:2064` | `render/authoredMotion.js:1211` |
| `npcJobs:towAssistComplete` | `systems/npcJobsRuntime.js:3824` | `systems/scanner.js:1107` |
| `npcJobs:towAssistLost` | `systems/npcJobsRuntime.js:3360`, `systems/npcJobsRuntime.js:3909`, `systems/npcJobsRuntime.js:3948` | `systems/missions.js:2032`, `systems/scanner.js:1108` |
| `npcjobs:approach` | — | `features/breakwaterSpur/runtime.js:78` |
| `npcjobs:arrived` | — | `features/breakwaterSpur/runtime.js:77` |
| `npcjobs:closeCall` | `systems/npcJobsRuntime.js:5665` | — |
| `npcjobs:complete` | — | `features/breakwaterSpur/runtime.js:80`, `systems/traffic.js:1787` |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:6789` | — |
| `npcjobs:cycle` | — | `systems/traffic.js:1785`, `systems/traffic.js:1786` |
| `npcjobs:depart` | — | `features/breakwaterSpur/runtime.js:76` |
| `npcjobs:distress` | `systems/npcJobsRuntime.js:6957` | `systems/traffic.js:1776` |
| `npcjobs:errand` | `systems/laneErrands.js:374` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1773` |
| `npcjobs:load` | — | `features/breakwaterSpur/runtime.js:75`, `systems/traffic.js:1771` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1383`, `systems/npcJobsRuntime.js:1397` | `systems/barkDirector.js:856` |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1390` | `ui/station/barContacts.js:210` |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1370` | `ui/station/barContacts.js:209` |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1368` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:4077` | `render/authoredMotion.js:1196`, `systems/barkDirector.js:860` |
| `npcjobs:oncallTenderRetired` | `systems/npcJobsRuntime.js:6224` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:5770` | — |
| `npcjobs:surveyMarked` | `systems/npcJobsRuntime.js:1541` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:5842` | `render/npcJobSignatureVfx.js:711`, `render/npcJobSignatureVfx.js:902` |
| `npcjobs:unload` | — | `features/breakwaterSpur/runtime.js:79`, `systems/traffic.js:1772` |
| `npcjobs:work` | — | `systems/traffic.js:1770` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:5974` | `systems/stationSideEventDirector.js:105` |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:5997` | — |
| `occupation:delivered` | `systems/scavengerOccupationSwitch.js:610` | — |
| `occupation:licensed` | `systems/scavengerOccupationSwitch.js:955` | — |
| `occupation:lost` | `systems/scavengerOccupationSwitch.js:691`, `systems/scavengerOccupationSwitch.js:750` | — |
| `occupation:recommissioned` | `systems/scavengerOccupationSwitch.js:860` | — |
| `occupation:settled` | `systems/scavengerOccupationSwitch.js:631` | — |
| `occupation:switched` | `systems/scavengerOccupationSwitch.js:502` | — |
| `onboarding:drillFolded` | `systems/onboarding.js:1915` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:2412`, `systems/onboarding.js:3232`, `systems/onboarding.js:4418` | — |
| `onboarding:rosterPrewarm` | `systems/onboarding.js:2930` | — |
| `onboarding:swingClinic` | `systems/onboarding.js:2417` | — |
| `optic:beamContact` | `systems/combat.js:1435` | — |
| `optic:contact` | `systems/weapons.js:3007`, `systems/weapons.js:3074` | `audio/audioSystem.js:2804` |
| `optic:rekindled` | — | `audio/audioSystem.js:2805` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1244` | `systems/world.js:751` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:2406` | `systems/story.js:165` |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1357` | — |
| `orrinWitness:submitted` | `systems/story.js:1385` | — |
| `pallas:shift` | `systems/pallasWorkLoop.js:136` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:7988` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:386` | `systems/world.js:753` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:7784` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:7819` | `ui/recoveryEncounterPrompt.js:489` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:7948` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:7902` | `ui/recoveryEncounterPrompt.js:490` |
| `palletJack:drop` | `ui/palletJackPrompt.js:19` | — |
| `palletJack:lost` | `systems/palletJack.js:382` | — |
| `palletJack:offer` | `systems/palletJack.js:283` | `ui/palletJackPrompt.js:6` |
| `palletJack:phase` | `systems/palletJack.js:187` | — |
| `palletJack:released` | `systems/palletJack.js:266` | — |
| `palletJack:trail` | `ui/palletJackPrompt.js:20` | — |
| `patrol:proximity` | `systems/encounterScripts.js:455`, `systems/faction_verge.js:761` | `systems/economy.js:1868`, `systems/moralTrap.js:189` |
| `patrolBait:cleared` | `systems/patrolBait.js:330` | — |
| `patrolBait:opened` | `systems/patrolBait.js:262` | — |
| `patrolBait:voice` | `systems/patrolBait.js:93` | — |
| `pds:intercept` | `systems/countermeasures.js:470` | `audio/audioSystem.js:2789` |
| `physics:authorityStalled` | — | `ui/toasts.js:855` |
| `physics:contactsCompleted` | — | `systems/collisionConsequences.js:99` |
| `physics:impact` | `core/physics.js:2510` | `audio/audioSystem.js:2799`, `features/breakwaterSpur/runtime.js:72`, `features/industrialDisasters/physicalSite.js:501`, `gallery/orbital/session.js:118`, `missions/racingOpponents.js:361`, `render/asteroidMotionPresentation.js:517`, `render/feel.js:1590`, `render/shipMicroMotion.js:1753`, `render/vfx.js:2797`, `systems/aftermathWrecks.js:1224`, `systems/asteroidSites.js:762`, `systems/barkDirector.js:947`, `systems/collisionConsequences.js:98`, `systems/encounterDirector.js:392`, `systems/environmentMaterials.js:213`, `systems/fields.js:476`, `systems/flightV3.js:239`, `systems/fragileCargo.js:406`, `systems/gamepad.js:999`, `systems/heistFacilities.js:325`, `systems/impulseCharges.js:225`, `systems/lootShards.js:602`, `systems/masslineImpactDamage.js:59`, `systems/npcJobsRuntime.js:1201`, `systems/reactiveMatter.js:530`, `systems/ships.js:2095`, `systems/survivalResults.js:513`, `systems/swarmArena.js:746`, `systems/swarmElites.js:185`, `systems/volatileExposure.js:215`, `testing/lab/titleVerbScenario.js:51`, `testing/motionScenarios.js:1764` |
| `pickup:collected` | `core/physics.js:2268`, `systems/combat.js:639`, `systems/mining.js:1770`, `systems/mining.js:2782`, `systems/uniqueWrecks.js:1918` | `audio/audioSystem.js:2943`, `render/vfx.js:2936`, `save/saveSystem.js:498`, `systems/economy.js:1820`, `systems/encounterDirector.js:374`, `systems/faction_meridian.js:366`, `systems/lawSecurity.js:416`, `systems/mining.js:301`, `systems/missions.js:1813`, `systems/onboarding.js:656`, `systems/onboarding.js:734`, `systems/onboarding.js:830`, `systems/presentationOrchestrator.js:221`, `systems/swarmArena.js:764`, `systems/swarmEvents.js:116`, `systems/swarmSupply.js:110`, `systems/tetherGameplay.js:348`, `systems/traffic.js:1788`, `systems/traffic.js:1789`, `systems/traffic.js:1794`, `systems/traffic.js:1798`, `systems/traffic.js:1799`, `systems/world.js:754`, `systems/world.js:755`, `systems/world.js:758`, `systems/world.js:760`, `systems/world.js:838` |
| `pirateDisengage:surrenderOffer` | — | `ui/pirateParleyPrompt.js:221` |
| `pirateDisengage:triggered` | `data/encounters/344-opening-hauler-raid.js:101` | `systems/combatOutcome.js:301` |
| `pirateDisengage:verdict` | `ui/pirateParleyPrompt.js:199` | — |
| `pirateDisengage:yieldResolved` | — | `ui/pirateParleyPrompt.js:222` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:154` | `systems/pirateParley.js:98` |
| `pirateParley:demand` | `systems/scanner.js:1717` | `ui/pirateParleyPrompt.js:219` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:300`, `ui/pirateParleyPrompt.js:220` |
| `pirateParley:started` | — | `systems/combatOutcome.js:299` |
| `pitborn:ballastAccreted` | `systems/faction_pitborn.js:829` | — |
| `pitborn:ballastHorn` | `systems/faction_pitborn.js:876` | — |
| `pitborn:ballastNamed` | `systems/faction_pitborn.js:886` | — |
| `pitborn:ballastStart` | `systems/faction_pitborn.js:852` | — |
| `pitborn:blacklistLifted` | `systems/faction_pitborn.js:2083` | — |
| `pitborn:blacklisted` | `systems/faction_pitborn.js:2067` | — |
| `pitborn:claimExtracted` | `systems/faction_pitborn.js:1349` | — |
| `pitborn:claimFiled` | `systems/faction_pitborn.js:1098` | — |
| `pitborn:claimForeclosed` | `systems/faction_pitborn.js:1524` | — |
| `pitborn:claimJumped` | `systems/faction_pitborn.js:1336` | — |
| `pitborn:claimLapsed` | `systems/faction_pitborn.js:1182` | — |
| `pitborn:claimSold` | `systems/faction_pitborn.js:2002` | — |
| `pitborn:collectorDown` | `systems/faction_pitborn.js:2135` | — |
| `pitborn:collectorsOut` | `systems/faction_pitborn.js:1577` | — |
| `pitborn:crowdStyle` | `systems/faction_pitborn.js:762` | — |
| `pitborn:crowdTier` | `systems/faction_pitborn.js:770` | — |
| `pitborn:cullSettled` | `systems/faction_pitborn.js:800` | — |
| `pitborn:debtDueSoon` | `systems/faction_pitborn.js:1497` | — |
| `pitborn:debtEscalated` | `systems/faction_pitborn.js:1512` | — |
| `pitborn:debtPaid` | `systems/faction_pitborn.js:1478` | — |
| `pitborn:debtPosted` | `systems/faction_pitborn.js:1148` | — |
| `pitborn:debtSettled` | `systems/faction_pitborn.js:1682` | — |
| `pitborn:debtWrittenOff` | `systems/faction_pitborn.js:1702` | — |
| `pitborn:deed` | `systems/faction_pitborn.js:701` | — |
| `pitborn:dividend` | `systems/faction_pitborn.js:1780` | — |
| `pitborn:fined` | `systems/faction_pitborn.js:2045` | — |
| `pitborn:levyCollected` | `systems/faction_pitborn.js:1642` | — |
| `pitborn:marketBought` | `systems/faction_pitborn.js:1938` | — |
| `pitborn:marketDelisted` | `systems/faction_pitborn.js:1187`, `systems/faction_pitborn.js:1809`, `systems/faction_pitborn.js:1833`, `systems/faction_pitborn.js:1910`, `systems/faction_pitborn.js:1992` | — |
| `pitborn:marketListed` | `systems/faction_pitborn.js:1863`, `systems/faction_pitborn.js:1974` | — |
| `pitborn:quotaPosted` | `systems/faction_pitborn.js:1413` | — |
| `pitborn:quotaProgress` | `systems/faction_pitborn.js:1366` | — |
| `pitborn:quotaSettled` | `systems/faction_pitborn.js:1452` | — |
| `pitborn:refused` | `systems/faction_pitborn.js:724` | — |
| `pitborn:scoreboard` | `systems/faction_pitborn.js:773` | — |
| `pitborn:shareBought` | `systems/faction_pitborn.js:1748` | — |
| `pitborn:shareSold` | `systems/faction_pitborn.js:1763` | — |
| `pitborn:suspicionFiled` | `systems/faction_pitborn.js:2021` | — |
| `pitborn:suspicionWarned` | `systems/faction_pitborn.js:2040` | — |
| `pitborn:tier` | `systems/faction_pitborn.js:706` | — |
| `pitborn:yardmasterDown` | `systems/faction_pitborn.js:937` | — |
| `pitborn:yardmasterStripped` | `systems/faction_pitborn.js:932` | — |
| `planet:bandFirst` | `systems/planetRuntime.js:618` | `systems/onboarding.js:1073` |
| `planet:collector` | `systems/planetRuntime.js:833` | `audio/audioSystem.js:2985`, `render/authoredMotion.js:1215`, `systems/onboarding.js:1067` |
| `planet:harvest` | `systems/planetRuntime.js:1006` | `audio/audioSystem.js:2986` |
| `planet:harvestDenied` | `systems/planetRuntime.js:1013` | `audio/audioSystem.js:2987` |
| `planet:npcHarvest` | `systems/planetRuntime.js:969` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:711`, `systems/planetRuntime.js:724` | `audio/audioSystem.js:2988` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:808` | `audio/audioSystem.js:2989` |
| `planet:registered` | `systems/planetRuntime.js:324` | — |
| `planet:unregistered` | `systems/planetRuntime.js:513` | — |
| `player:death` | `systems/combat.js:775`, `systems/combat.js:938`, `systems/world.js:7189` | `audio/audioSystem.js:2846`, `render/feel.js:1498`, `render/shipMicroMotion.js:1764`, `render/vfx.js:2886`, `save/saveSystem.js:505`, `sim/killcamTape.js:476`, `systems/aftermathWrecks.js:1221`, `systems/crew.js:125`, `systems/encounterDirector.js:430`, `systems/flightV3.js:244`, `systems/input.js:1419`, `systems/lawSecurity.js:415`, `systems/lossLedger.js:465`, `systems/masslineTelemetry.js:128`, `systems/missions.js:1980`, `systems/onboarding.js:687`, `systems/onboarding.js:733`, `systems/shieldPylons.js:246`, `systems/special500DeathBell.js:61`, `systems/special500ReadEverything.js:39`, `systems/surrenderRecovery.js:103`, `systems/survivalResults.js:521`, `systems/survivalRun.js:153`, `systems/survivorPod.js:674`, `systems/tetherGameplay.js:339`, `systems/world.js:733`, `ui/commandBar.js:457`, `ui/confirm.js:310`, `ui/survivalHud.js:329` |
| `player:recoveryFailed` | `systems/combat.js:991` | `ui/screens/gameOver.js:647` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:528`, `ui/screens/gameOver.js:541` | `systems/combat.js:410` |
| `player:respawn` | `systems/combat.js:1073` | `audio/audioSystem.js:2847`, `render/shipMicroMotion.js:1763`, `save/saveSystem.js:506`, `save/saveSystem.js:593`, `sim/killcamTape.js:473`, `systems/flightV3.js:245`, `systems/input.js:1420`, `systems/tetherGameplay.js:340`, `ui/commandBar.js:461`, `ui/screens/gameOver.js:639` |
| `player:scannedByPatrol` | `systems/economy.js:5719` | `render/authoredMotion.js:1194`, `render/vfx.js:2873`, `systems/lawSecurity.js:431`, `systems/missions.js:1970` |
| `poi:discovered` | `data/encounters/1310-tether-memorial-line.js:217`, `systems/world.js:1095`, `systems/world.js:6783`, `systems/world.js:6881`, `systems/world.js:7500`, `systems/world.js:7530` | `audio/audioSystem.js:3018`, `systems/encounterDirector.js:403`, `systems/world.js:795` |
| `poi:identified` | `systems/world.js:6888`, `systems/world.js:7531` | `systems/encounterDirector.js:404`, `systems/missions.js:1742`, `systems/world.js:796` |
| `postEndingReplay:cycleCompleted` | — | `systems/sectorSim.js:139`, `ui/screens/missionLog.js:2583` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:288` | `ui/screens/missionLog.js:2582` |
| `presentation:audioCue` | `render/vfx.js:5791`, `systems/presentationAdapters.js:317`, `systems/presentationAdapters.js:698` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:611` | — |
| `presentation:caption` | `audio/audioSystem.js:6839`, `features/breakwaterSpur/presentation.js:118`, `features/salvageTender/presentation.js:69`, `systems/asteroidSites.js:2600`, `systems/asteroidSites.js:2657`, `systems/factionPresence.js:1247`, `systems/factionPresence.js:1701`, `systems/factionPresence.js:1716`, `systems/factionPresence.js:1734`, `systems/factionPresence.js:1796`, `systems/presentationAdapters.js:798`, `systems/shipjack.js:93`, `systems/story.js:1188`, `systems/story.js:1440` | — |
| `presentation:cue` | `systems/aftermathWrecks.js:1640`, `systems/cargo.js:1308`, `systems/planetRuntime.js:735`, `systems/salvageActions.js:283`, `systems/salvageActions.js:498` | `audio/audioSystem.js:3131`, `render/vfx.js:2930`, `render/vfx.js:2931`, `render/vfx.js:2932`, `systems/presentationAdapters.js:339` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:593` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:514`, `systems/presentationAdapters.js:776` | — |
| `presentation:vfxCue` | `data/encounters/1322-the-shadow-ring.js:171`, `render/vfx.js:2949`, `systems/bombs.js:1330`, `systems/fields.js:1726`, `systems/fields.js:2041`, `systems/fields.js:2648`, `systems/fields.js:2699`, `systems/hullBurst.js:239`, `systems/hullBurst.js:351`, `systems/hullBurst.js:402`, `systems/hullBurst.js:433`, `systems/hullBurst.js:619`, `systems/massSeed.js:329`, `systems/massSeed.js:445`, `systems/massSeed.js:539`, `systems/massSeed.js:581`, `systems/masslineThrow.js:578`, `systems/missions.js:2544`, `systems/missions.js:5908`, `systems/planetRuntime.js:1036`, `systems/presentationAdapters.js:660`, `systems/special500DockLedger.js:205`, `systems/special500Spectacle.js:167`, `systems/special500Spectacle.js:180`, `systems/tumbleStates.js:564`, `systems/tumbleStates.js:674`, `systems/volatileExposure.js:482`, `systems/volatileExposure.js:556`, `systems/weapons.js:2075`, `systems/weapons.js:2206`, `systems/weapons.js:2338`, `systems/weapons.js:3767` | `render/vfx.js:2935` |
| `projectile:bank` | — | `render/vfx.js:2791` |
| `projectile:hit` | `core/physics.js:1401`, `core/physics.js:1430`, `core/physics.js:1621`, `data/encounters/705-the-nest.js:338`, `systems/sectorSim.js:751` | `audio/audioSystem.js:2782`, `combat/tetherWebs.js:61`, `render/vfx.js:2790`, `systems/bombs.js:700`, `systems/combat.js:402`, `systems/gamepad.js:1112`, `systems/missions.js:1924` |
| `projectile:nearMiss` | `core/physics.js:1581` | `audio/audioSystem.js:2785`, `systems/presentationOrchestrator.js:178` |
| `projectile:ricochet` | — | `render/vfx.js:2792` |
| `quiet:routeSold` | `data/encounters/702-the-swap.js:52` | — |
| `quill:archiveRebound` | `systems/quill.js:775` | — |
| `quill:errandAnswered` | `systems/quill.js:764` | — |
| `quill:errandArmed` | `systems/quill.js:742` | — |
| `quill:folioBurned` | `systems/quill.js:708` | — |
| `quill:folioMinted` | `systems/quill.js:542` | — |
| `quill:folioSeized` | `systems/quill.js:863` | — |
| `quill:folioSold` | `systems/quill.js:675` | — |
| `quill:forgeryDetected` | `systems/quill.js:725` | — |
| `quill:redactorKilled` | `systems/quill.js:906` | — |
| `quill:redactorSpawned` | `systems/quill.js:797` | — |
| `quill:redactorWithdrew` | `systems/quill.js:837` | — |
| `race:abort` | — | `systems/missions.js:2001` |
| `race:ended` | `systems/missions.js:6244` | — |
| `race:launchFailed` | — | `save/saveSystem.js:565` |
| `race:reset` | — | `systems/missions.js:1999` |
| `race:restart` | `ui/input.js:659` | `systems/missions.js:2000` |
| `race:restarted` | `systems/missions.js:4526` | — |
| `race:toggleView` | `ui/input.js:651`, `ui/input.js:1482` | — |
| `range:opened` | `ui/screens/range.js:2722` | `systems/onboarding.js:720` |
| `ravel:cast` | `systems/ravel.js:176` | — |
| `ravel:destroyed` | `systems/ravel.js:211` | — |
| `ravel:hit` | `systems/ravel.js:190` | — |
| `ravel:pacified` | `systems/ravel.js:199` | — |
| `ravel:telegraph` | `systems/ravel.js:157` | — |
| `ravel:unthreaded` | `systems/ravel.js:196` | — |
| `ravel:voice` | `systems/ravel.js:130` | — |
| `reach:trophyHung` | `data/encounters/705-the-nest.js:218` | — |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:325` | — |
| `recovery:completed` | `systems/onboarding.js:3487` | `ui/recoveryEncounterPrompt.js:484` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:283` | — |
| `redKite:aborted` | `systems/redKite.js:177` | — |
| `redKite:course` | `ui/redKitePrompt.js:18` | — |
| `redKite:finished` | `systems/redKite.js:203` | — |
| `redKite:offer` | `systems/redKite.js:155` | `ui/redKitePrompt.js:6` |
| `redKite:start` | `ui/redKitePrompt.js:19` | — |
| `redKite:started` | `systems/redKite.js:170` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:277` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:278` |
| `rescue:beat` | `systems/onboarding.js:3456`, `systems/onboarding.js:3516` | — |
| `rescue:complete` | `systems/onboarding.js:3467` | — |
| `rescue:started` | `systems/onboarding.js:2989` | `systems/onboarding.js:688` |
| `rescuedWorker:returned` | `systems/rescuedWorkerReturn.js:489` | — |
| `research:pointsChanged` | `systems/missionObjectiveOps.js:670`, `systems/missionObjectiveOps.js:724`, `systems/missionObjectiveOps.js:758`, `systems/missionObjectiveOps.js:805`, `systems/missionStoryOps.js:2245`, `systems/missions.js:5818`, `systems/missions.js:5834` | `ui/alerts.js:507` |
| `resonance:patrolQueued` | `systems/encounterDirector.js:3593` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1537` | `systems/encounterDirector.js:435` |
| `rhythm:phase` | `systems/encounterDirector.js:654` | — |
| `rigWorkshop:changed` | `features/rigWorkshop/runtime.js:336` | — |
| `rigWorkshop:delivered` | `features/rigWorkshop/jobs.js:223` | — |
| `rigWorkshop:feedback` | `features/rigWorkshop/runtime.js:341` | — |
| `rigWorkshop:prompt` | `features/rigWorkshop/runtime.js:354` | — |
| `rigWorkshop:promptClosed` | `features/rigWorkshop/runtime.js:359` | — |
| `rookWreck:appraised` | `systems/rookBooth.js:673` | — |
| `rookWreck:countered` | `systems/rookBooth.js:514` | — |
| `rookWreck:delivered` | `systems/rookBooth.js:578` | `systems/missions.js:1798` |
| `rookWreck:disputeFiled` | `systems/rookBooth.js:639` | — |
| `rookWreck:offerLapsed` | `systems/rookBooth.js:482` | — |
| `rookWreck:padRefused` | `systems/rookBooth.js:655` | — |
| `rubric:destroyed` | `systems/rubric.js:369` | — |
| `rubric:last` | `systems/rubric.js:524` | — |
| `rubric:marked` | `systems/rubric.js:453` | — |
| `rubric:voice` | `systems/rubric.js:269` | — |
| `ruckus:pulse` | `systems/ruckus.js:213` | — |
| `ruckus:retrieved` | `systems/ruckus.js:198` | — |
| `ruckus:state` | `systems/ruckus.js:147` | — |
| `ruckus:voice` | `systems/ruckus.js:141` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:376` | `ui/station/barContacts.js:167` |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:140` |
| `run:awardRequested` | `systems/swarmBrood.js:3523`, `systems/swarmEvents.js:215`, `systems/swarmEvents.js:345`, `ui/sandbox/sandboxSetup.js:1339`, `ui/sandbox/sandboxSetup.js:1354` | `systems/runSession.js:112` |
| `run:awarded` | — | `ui/survivalHud.js:305` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1259`, `ui/sandbox/sandboxSetup.js:1301` | `systems/runSession.js:108` |
| `run:circuitChoiceApplied` | — | `systems/survivalDraft.js:197` |
| `run:circuitChoiceRequested` | — | `systems/survivalRun.js:150` |
| `run:draftLockRequested` | — | `systems/survivalDraft.js:205` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:1126`, `ui/screens/crucibleDraft.js:1131`, `ui/screens/crucibleDraft.js:1337` | `systems/survivalDraft.js:194` |
| `run:draftRerollRequested` | — | `systems/survivalDraft.js:206` |
| `run:draftResolved` | — | `systems/survivalRun.js:143` |
| `run:endRequested` | `save/saveSystem.js:398` | `systems/runSession.js:110` |
| `run:ended` | — | `audio/audioSystem.js:2960`, `systems/fields.js:463`, `systems/mines.js:83`, `systems/survivalAnnounce.js:401`, `systems/survivalArena.js:1261`, `systems/survivalDraft.js:221`, `systems/survivalResults.js:558`, `systems/survivalRun.js:137`, `systems/survivalWave.js:199`, `systems/swarmArena.js:748`, `systems/swarmChain.js:167`, `systems/swarmElites.js:189`, `systems/swarmEvents.js:115`, `systems/swarmFortify.js:172`, `systems/swarmJuice.js:175`, `systems/swarmLegendaries.js:123`, `systems/swarmSupply.js:112`, `ui/swarmJuiceHud.js:102` |
| `run:extractionRequested` | `systems/survivalExtraction.js:31` | `systems/survivalRun.js:146` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:399`, `ui/survivalHud.js:306` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1378` | `systems/ships.js:2150`, `systems/survivalRun.js:138`, `systems/swarmSupply.js:105`, `systems/world.js:791` |
| `run:modifierChosen` | — | `systems/survivalRun.js:144` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:114` |
| `run:modifierRecorded` | — | `systems/survivalArena.js:1221` |
| `run:openingLessonReleased` | — | `systems/survivalAnnounce.js:397`, `systems/survivalArena.js:1256`, `systems/swarmArena.js:747` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1379` | `systems/survivalRun.js:139` |
| `run:partialBankRequested` | `systems/survivalExtraction.js:61` | `systems/survivalRun.js:147` |
| `run:refitChanged` | — | `ui/screens/crucibleDraft.js:1978` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:2072`, `ui/screens/crucibleDraft.js:2089` | `systems/survivalDraft.js:198` |
| `run:refitClosed` | — | `systems/survivalRun.js:145` |
| `run:refitFitRequested` | — | `systems/survivalDraft.js:199` |
| `run:refitSellRequested` | — | `systems/survivalDraft.js:204` |
| `run:refitStripRequested` | — | `systems/survivalDraft.js:200` |
| `run:resultsReady` | — | `systems/achievements.js:1206`, `ui/uiRoot.js:1681` |
| `run:retireRequested` | — | `systems/runSession.js:111` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:210` |
| `run:spendRequested` | — | `systems/runSession.js:113` |
| `run:spent` | — | `systems/survivalDraft.js:209` |
| `run:started` | — | `audio/audioSystem.js:2959`, `save/saveSystem.js:522`, `sim/killcamTape.js:469`, `systems/combatOutcome.js:289`, `systems/survivalAnnounce.js:387`, `systems/survivalResults.js:503`, `systems/survivalRun.js:135`, `systems/swarmElites.js:188`, `systems/swarmFortify.js:170`, `systems/swarmJuice.js:174`, `systems/swarmLegendaries.js:122`, `ui/survivalHud.js:307`, `ui/swarmJuiceHud.js:101`, `ui/uiRoot.js:1690` |
| `run:threatRequested` | — | `systems/runSession.js:115` |
| `run:transitionRequested` | `systems/survivalRun.js:1062` | `systems/runSession.js:109` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:400`, `systems/survivalDraft.js:193`, `systems/survivalResults.js:557`, `systems/survivalRun.js:136`, `systems/survivalWave.js:198`, `systems/swarmSupply.js:106` |
| `run:waveCleared` | — | `systems/fields.js:462`, `systems/mines.js:82`, `systems/survivalAnnounce.js:398`, `systems/survivalArena.js:1255`, `systems/survivalResults.js:511`, `systems/swarmEvents.js:114`, `systems/swarmLegendaries.js:121` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:141` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:390` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:522` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:388`, `systems/survivalArena.js:1222`, `systems/survivalWave.js:196`, `systems/swarmArena.js:743`, `systems/swarmFortify.js:171`, `systems/swarmJuice.js:164`, `systems/tetherGameplay.js:349`, `ui/survivalHud.js:322` |
| `run:waveProgress` | — | `ui/survivalHud.js:323` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:389`, `systems/survivalResults.js:508`, `systems/survivalWave.js:197`, `systems/swarmArena.js:744`, `systems/swarmEvents.js:113`, `systems/swarmJuice.js:165`, `ui/swarmJuiceHud.js:100` |
| `ruud:cut` | `systems/ruud.js:462` | — |
| `ruud:spared` | `systems/ruud.js:435` | — |
| `ruud:stamp` | `systems/ruud.js:379` | — |
| `ruud:voice` | `systems/ruud.js:326`, `systems/ruud.js:378` | — |
| `sable:demonstrated` | `ui/station/screens/shipworks.js:5874` | — |
| `salvage:actionRead` | `systems/salvageActions.js:229` | — |
| `salvage:bayCashedIn` | `systems/cargo.js:1348` | `systems/onboarding.js:839` |
| `salvage:changed` | `systems/cargo.js:664`, `systems/cargo.js:1351` | `systems/onboarding.js:835` |
| `salvage:claimJumped` | `systems/mining.js:2328` | `systems/missions.js:2022` |
| `salvage:communicatorFound` | `systems/salvage.js:1258` | `systems/encounterDirector.js:405`, `systems/story.js:287`, `ui/wreckChoicePrompt.js:44` |
| `salvage:completed` | `systems/gravedigger.js:1177`, `systems/mining.js:2183`, `systems/rookBooth.js:592` | `render/vfx.js:2891`, `systems/aftermathWrecks.js:1242`, `systems/lawSecurity.js:423`, `systems/missions.js:1855`, `systems/missions.js:2023`, `systems/story.js:269` |
| `salvage:cookerFlight` | `systems/salvageActions.js:493` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:640` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:280` | `render/authoredMotion.js:1201` |
| `salvage:cutComplete` | `systems/mining.js:780` | `audio/audioSystem.js:2963`, `render/authoredMotion.js:1170`, `render/vfx.js:2890` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:454` | `systems/salvage.js:177` |
| `salvage:npcExtraction` | `systems/trafficRoleOps.js:2409` | `render/authoredMotion.js:1169` |
| `salvage:npcUnload` | `features/salvageOutfits/physical.js:487`, `systems/trafficCausalChainOps.js:2516` | `systems/economy.js:1824` |
| `salvage:placed` | `systems/salvage.js:576` | `systems/lossInvestigation.js:126`, `systems/npcJobsRuntime.js:1172`, `systems/survivorPod.js:649` |
| `salvage:reactorBurst` | `systems/salvageActions.js:746` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:350` | `systems/salvage.js:173` |
| `salvage:reactorVented` | `systems/salvageActions.js:244` | — |
| `salvage:sortDelivered` | `systems/salvage.js:1076` | — |
| `salvage:sortImpact` | `systems/salvage.js:1010` | — |
| `salvage:sortLost` | `systems/salvage.js:1106` | — |
| `salvage:sortSeparated` | `systems/salvage.js:974` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:141` |
| `salvageOutfits:agreement` | `features/salvageOutfits/index.js:430` | — |
| `salvageOutfits:choose` | `features/salvageOutfits/presentation.js:65` | — |
| `salvageOutfits:completed` | `features/salvageOutfits/index.js:205` | — |
| `salvageOutfits:delivered` | `features/salvageOutfits/index.js:333` | — |
| `salvageOutfits:mistake` | `features/salvageOutfits/index.js:276` | — |
| `salvageOutfits:offer` | `features/salvageOutfits/index.js:343`, `features/salvageOutfits/index.js:371`, `features/salvageOutfits/index.js:384` | — |
| `salvageOutfits:offerClosed` | `features/salvageOutfits/index.js:377` | — |
| `salvageOutfits:radio` | `features/salvageOutfits/index.js:68` | — |
| `salvageOutfits:started` | `features/salvageOutfits/index.js:116` | — |
| `salvageTender:action` | `features/salvageTender/prompts.js:32` | — |
| `salvageTender:close` | `features/salvageTender/runtime.js:96` | — |
| `salvageTender:cue` | `features/salvageTender/runtime.js:92` | `features/salvageTender/presentation.js:49` |
| `salvageTender:disabled` | `features/salvageTender/physical.js:520` | — |
| `salvageTender:discovered` | `features/salvageTender/runtime.js:111` | — |
| `salvageTender:offer` | `features/salvageTender/runtime.js:288` | — |
| `salvageTender:rackReleased` | `features/salvageTender/physical.js:480` | — |
| `salvageTender:reset` | `features/salvageTender/runtime.js:442`, `features/salvageTender/runtime.js:448` | — |
| `salvageWatch:repairWork` | `data/encounters/362-the-salvage-watch.js:471` | — |
| `save:backup` | `save/saveSystem.js:2670` | `ui/screens/saveLoad.js:1113` |
| `save:completed` | `save/saveSystem.js:2741` | `ui/screens/saveLoad.js:1103`, `ui/toasts.js:55`, `ui/uiRoot.js:589` |
| `save:dirty` | `features/industrialDisasters/runtime.js:464`, `features/shipbreakingYard/runtime.js:121`, `features/shipbreakingYard/runtime.js:276`, `features/shipbreakingYard/runtime.js:411`, `shipjack/fleetOperations.js:72`, `shipjack/fleetOperations.js:152`, `shipjack/fleetOperations.js:170`, `systems/ruckus.js:91`, `systems/shipjack.js:82` | `save/saveSystem.js:482` |
| `save:durabilitySettled` | — | `runtime/laneSystemFacades.js:39` |
| `save:envelopePrepared` | `save/saveSystem.js:5810`, `save/saveSystem.js:5876`, `save/saveSystem.js:5888` | `main.js:297`, `ui/loadingPresenter.js:627` |
| `save:envelopeSpecPrepared` | `save/saveSystem.js:3286` | `main.js:296`, `ui/screens/saveLoad.js:1127` |
| `save:error` | `main.js:314`, `main.js:1128`, `main.js:1192`, `save/saveSystem.js:1806`, `save/saveSystem.js:2817`, `save/saveSystem.js:5608`, `save/saveSystem.js:5629`, `save/saveSystem.js:5678`, `save/saveSystem.js:5705`, `save/saveSystem.js:5744`, `save/saveSystem.js:5867`, `save/saveSystem.js:5916`, `save/saveSystem.js:6118`, `save/saveSystem.js:6138`, `save/saveSystem.js:6155`, `save/saveSystem.js:6346`, `save/saveSystem.js:6360`, `save/saveSystem.js:6466`, `save/saveSystem.js:6484`, `save/saveSystem.js:6520`, `save/saveSystem.js:6561`, `save/saveSystem.js:6566`, `save/saveSystem.js:6598`, `save/saveSystem.js:6724`, `save/saveSystem.js:6802`, `save/saveSystem.js:6807`, `save/saveSystem.js:7027`, `save/saveSystem.js:7720`, `save/saveSystem.js:7732`, `save/saveSystem.js:7800`, `save/saveSystem.js:8715`, `save/saveSystem.js:8727`, `save/saveSystem.js:8733`, `save/saveSystem.js:8754`, `save/saveSystem.js:8759`, `save/saveSystem.js:8777`, `save/saveSystem.js:8881`, `save/saveSystem.js:8906`, `ui/screens/saveLoad.js:1705` | `systems/aftermathWrecks.js:1257`, `systems/asteroidSites.js:761`, `systems/automation.js:636`, `systems/encounterDirector.js:366`, `systems/faction_understory.js:723`, `systems/special500Confessional.js:120`, `systems/survivorPod.js:672`, `systems/traffic.js:1821`, `ui/loadingPresenter.js:601`, `ui/screenManager.js:733`, `ui/screens/mainMenu.js:672`, `ui/screens/mainMenu.js:1204`, `ui/screens/saveLoad.js:1089`, `ui/screens/saveLoad.js:1114`, `ui/uiRoot.js:615` |
| `save:exportRecovery` | `save/saveSystem.js:8669`, `save/saveSystem.js:8696` | `ui/toasts.js:836` |
| `save:loadSpeculationTarget` | `ui/screens/gameOver.js:920`, `ui/screens/pause.js:1410`, `ui/screens/saveLoad.js:1202`, `ui/screens/saveLoad.js:1342` | `save/saveSystem.js:415` |
| `save:loaded` | `save/saveSystem.js:7612` | `audio/audioSystem.js:3389`, `audio/bombAudio.js:460`, `audio/fieldAudio.js:327`, `careers/origins/haulerOriginSystem.js:65`, `combat/kernel.js:205`, `combat/tetherWebs.js:70`, `core/coreSystem.js:545`, `core/physics.js:206`, `features/breakwaterSpur/runtime.js:84`, `main.js:395`, `main.js:403`, `render/feel.js:1376`, `render/shipMicroMotion.js:1746`, `render/vfx.js:2869`, `render/vfx.js:2880`, `save/saveSystem.js:518`, `save/saveSystem.js:556`, `sim/killcamTape.js:472`, `systems/aftermathWrecks.js:1256`, `systems/aiEncounter.js:138`, `systems/asteroidFormations.js:127`, `systems/asteroidSites.js:585`, `systems/asteroidSites.js:751`, `systems/autoTargetAssist.js:158`, `systems/automation.js:623`, `systems/barkDirector.js:815`, `systems/beacons.js:54`, `systems/bombs.js:699`, `systems/collisionConsequences.js:110`, `systems/combat.js:452`, `systems/combatOutcome.js:266`, `systems/contractClauses.js:394`, `systems/countermeasures.js:226`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:85`, `systems/economy.js:1889`, `systems/economyContracts.js:284`, `systems/encounterDirector.js:365`, `systems/environmentalMachinery.js:288`, `systems/factionPresence.js:516`, `systems/factionPresence.js:527`, `systems/faction_archive.js:590`, `systems/faction_frontier.js:472`, `systems/faction_helix.js:505`, `systems/faction_meridian.js:367`, `systems/faction_understory.js:714`, `systems/faction_vael.js:438`, `systems/fields.js:464`, `systems/flight.js:79`, `systems/flightV3.js:212`, `systems/gateControlDirector.js:78`, `systems/heat.js:412`, `systems/heistFacilities.js:337`, `systems/impoundGrudge.js:398`, `systems/impoundLot.js:1097`, `systems/impulseCharges.js:233`, `systems/lawSecurity.js:412`, `systems/lineProgression.js:56`, `systems/longBerth.js:68`, `systems/lossInvestigation.js:132`, `systems/massSeed.js:141`, `systems/masslineSnares.js:139`, `systems/masslineTelemetry.js:123`, `systems/mines.js:81`, `systems/mining.js:321`, `systems/missions.js:1695`, `systems/npcJobsRuntime.js:1141`, `systems/npcJobsRuntime.js:1149`, `systems/npcJobsRuntime.js:1208`, `systems/npcJobsRuntime.js:1211`, `systems/onboarding.js:620`, `systems/pirateDisguise.js:439`, `systems/planetRuntime.js:215`, `systems/presentationAdapters.js:346`, `systems/presentationOrchestrator.js:291`, `systems/routeFollower.js:436`, `systems/runSession.js:120`, `systems/salvageActions.js:145`, `systems/sectorSim.js:133`, `systems/shieldPylons.js:245`, `systems/ships.js:1971`, `systems/stationContactLoadBoundary.js:91`, `systems/stationSideEventDirector.js:104`, `systems/story.js:159`, `systems/survivalArena.js:1282`, `systems/survivalArena.js:1284`, `systems/survivorPod.js:670`, `systems/swarmFortify.js:178`, `systems/swarmLegendaries.js:126`, `systems/tetherGameplay.js:336`, `systems/titles.js:585`, `systems/traffic.js:1732`, `systems/traffic.js:1784`, `systems/traffic.js:1839`, `systems/traffic.js:1865`, `systems/traffic.js:1875`, `systems/traffic.js:1878`, `systems/travelLanes.js:553`, `systems/tumbleStates.js:144`, `systems/uniqueLootAbilities.js:162`, `systems/wingmen.js:173`, `systems/world.js:776`, `ui/aftermathChoicePrompt.js:80`, `ui/alerts.js:502`, `ui/automationPayoff.js:81`, `ui/bandHud.js:120`, `ui/capitalBossOverlayMount.js:652`, `ui/cargoConscience.js:147`, `ui/hudLayout.js:122`, `ui/loadingPresenter.js:635`, `ui/moralTrapPrompt.js:43`, `ui/screens/mainMenu.js:676`, `ui/uiRoot.js:596`, `ui/uiRoot.js:1706`, `ui/voiceArbiter.js:539`, `ui/wreckChoicePrompt.js:55` |
| `save:recovered` | `save/saveSystem.js:5555` | `ui/screens/saveLoad.js:1112`, `ui/uiRoot.js:608` |
| `save:restoreCommitted` | `save/saveSystem.js:7701` | — |
| `save:restoring` | `save/saveSystem.js:6959`, `save/saveSystem.js:7041` | `core/coreSystem.js:542`, `features/breakwaterSpur/presentation.js:33`, `features/breakwaterSpur/presentation.js:244`, `features/breakwaterSpur/runtime.js:83`, `main.js:396`, `render/feel.js:1375`, `render/vfx.js:2868`, `render/vfx.js:2879`, `save/saveSystem.js:564`, `systems/aftermathWrecks.js:1255`, `systems/asteroidSites.js:742`, `systems/autoTargetAssist.js:155`, `systems/automation.js:616`, `systems/cloak.js:80`, `systems/encounterDirector.js:357`, `systems/environmentalMachinery.js:287`, `systems/faction_understory.js:713`, `systems/lawSecurity.js:411`, `systems/masslineTelemetry.js:124`, `systems/missions.js:1714`, `systems/missions.js:2003`, `systems/npcJobsRuntime.js:1142`, `systems/runSession.js:119`, `systems/salvage.js:167`, `systems/spawnBudget.js:54`, `systems/special500Confessional.js:115`, `systems/special500Spectacle.js:205`, `systems/stationContactLoadBoundary.js:90`, `systems/surrenderRecovery.js:104`, `systems/survivalArena.js:1283`, `systems/survivorPod.js:671`, `systems/swarmFortify.js:177`, `systems/swarmLegendaries.js:125`, `systems/traffic.js:1809`, `systems/world.js:761`, `ui/loadingPresenter.js:632`, `ui/uiRoot.js:1705` |
| `save:slotsValidated` | `save/saveSystem.js:3194` | `ui/screens/saveLoad.js:1102` |
| `save:started` | `save/saveSystem.js:2032`, `save/saveSystem.js:2135`, `save/saveSystem.js:4059` | `systems/drill.js:793`, `systems/encounterDirector.js:356`, `systems/encounterDirector.js:364`, `ui/screenManager.js:745` |
| `scan:capabilityVerdicts` | `systems/scanReveal.js:136` | `ui/signalInvestigationPrompt.js:265` |
| `scan:completed` | `balance/careerCohorts.js:523`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:1346`, `systems/world.js:6787` | `careers/origins/prospectorOrigin.js:633`, `features/breakwaterSpur/runtime.js:70`, `systems/asteroidFormations.js:153`, `systems/heistFacilities.js:332`, `systems/missions.js:1868`, `systems/onboarding.js:668`, `systems/presentationOrchestrator.js:195`, `systems/salvage.js:164`, `systems/salvageActions.js:140`, `systems/story.js:273`, `systems/story.js:274`, `systems/world.js:825` |
| `scan:debrisCache` | `systems/mining.js:2229`, `systems/scanReveal.js:275` | `systems/presentationOrchestrator.js:205` |
| `scan:pulse` | `systems/scanner.js:1251` | `render/authoredMotion.js:1145`, `render/shipMicroMotion.js:1773`, `systems/asteroidSites.js:586`, `systems/buildIdentity.js:305`, `systems/cloak.js:97`, `systems/encounterDirector.js:384`, `systems/pirateDisguise.js:433`, `systems/presentationOrchestrator.js:194`, `systems/scanReveal.js:66`, `systems/world.js:826` |
| `scan:shipRevealed` | `systems/scanReveal.js:96` | `audio/audioSystem.js:2763`, `systems/buildIdentity.js:304` |
| `scan:weakPoint` | `systems/scanner.js:1335` | — |
| `scan:wreckInvestigated` | `systems/scanReveal.js:178` | `audio/audioSystem.js:2930` |
| `scan:wreckResolved` | `systems/scanner.js:1290` | `systems/lawSecurity.js:422` |
| `scan:wreckRevealed` | `systems/scanReveal.js:169` | `audio/audioSystem.js:2764`, `systems/presentationOrchestrator.js:204` |
| `scanner:ghostEscaped` | `systems/scanner.js:1193` | `systems/presentationOrchestrator.js:201` |
| `scanner:ghostRevealed` | `systems/scanner.js:1309` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:143` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:159` | `systems/presentationOrchestrator.js:98` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:581` | `systems/presentationOrchestrator.js:288` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:369` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:556` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:138` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:128` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:193` | — |
| `scenario:scavengerResponse` | `ui/comms.js:724`, `ui/comms.js:728` | `systems/scenarioRuntime.js:31` |
| `sector:discovered` | `systems/world.js:1272` | `systems/presentationOrchestrator.js:191` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:1332` | `audio/audioSystem.js:3089`, `audio/bombAudio.js:457`, `audio/fieldAudio.js:324`, `data/hazardLanguage.js:173`, `features/breakwaterSpur/runtime.js:82`, `render/shipMicroMotion.js:1745`, `render/vfx.js:2864`, `render/vfx.js:2875`, `save/saveSystem.js:576`, `systems/achievements.js:1192`, `systems/aftermathWrecks.js:1231`, `systems/aiEncounter.js:139`, `systems/asteroidFormations.js:126`, `systems/asteroidSites.js:707`, `systems/automation.js:662`, `systems/bombs.js:691`, `systems/claims.js:346`, `systems/claims.js:348`, `systems/combatOutcome.js:283`, `systems/difficultyDirector.js:170`, `systems/dockingCorridor.js:83`, `systems/economy.js:1848`, `systems/encounterDirector.js:351`, `systems/factionPresence.js:507`, `systems/faction_archive.js:589`, `systems/faction_understory.js:712`, `systems/fields.js:460`, `systems/heistFacilities.js:304`, `systems/intervention.js:75`, `systems/lossInvestigation.js:127`, `systems/massSeed.js:139`, `systems/masslineSnares.js:135`, `systems/mines.js:79`, `systems/mining.js:320`, `systems/missions.js:1997`, `systems/moistureLoss.js:80`, `systems/moralTrap.js:187`, `systems/npcJobsRuntime.js:1130`, `systems/onboarding.js:865`, `systems/presentationOrchestrator.js:241`, `systems/routeFollower.js:427`, `systems/salvage.js:138`, `systems/salvageActions.js:148`, `systems/scanner.js:1113`, `systems/sectorSim.js:130`, `systems/shieldPylons.js:243`, `systems/story.js:224`, `systems/story.js:272`, `systems/survivalArena.js:1280`, `systems/survivorPod.js:652`, `systems/swarmLegendaries.js:127`, `systems/tetherGameplay.js:343`, `systems/traffic.js:1730`, `systems/travelLanes.js:554`, `systems/wingmen.js:147`, `ui/causeLedger.js:225`, `ui/commandBar.js:467`, `ui/loadingPresenter.js:643`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:270`, `ui/securityReadout.js:157`, `ui/watchlistHud.js:91` |
| `sector:exit` | `systems/world.js:1185` | `audio/bombAudio.js:456`, `audio/fieldAudio.js:323`, `core/physics.js:208`, `features/breakwaterSpur/presentation.js:34`, `features/breakwaterSpur/presentation.js:245`, `features/breakwaterSpur/runtime.js:81`, `render/vfx.js:2865`, `render/vfx.js:2876`, `systems/achievements.js:1198`, `systems/aftermathWrecks.js:1241`, `systems/asteroidSites.js:732`, `systems/automation.js:650`, `systems/bombs.js:690`, `systems/dockingCorridor.js:82`, `systems/encounterDirector.js:353`, `systems/environmentalMachinery.js:285`, `systems/factionPresence.js:512`, `systems/factionPresence.js:515`, `systems/fields.js:459`, `systems/gateControlDirector.js:77`, `systems/heistFacilities.js:323`, `systems/impulseCharges.js:234`, `systems/lawSecurity.js:410`, `systems/massSeed.js:138`, `systems/masslineSnares.js:133`, `systems/masslineTelemetry.js:127`, `systems/mines.js:78`, `systems/mining.js:306`, `systems/missions.js:1998`, `systems/npcJobsRuntime.js:1129`, `systems/planetRuntime.js:216`, `systems/reactiveMatter.js:536`, `systems/sectorSim.js:129`, `systems/shieldPylons.js:242`, `systems/spawnBudget.js:50`, `systems/stationServices.js:278`, `systems/stationSideEventDirector.js:103`, `systems/surrenderRecovery.js:102`, `systems/survivalArena.js:1281`, `systems/survivorPod.js:678`, `systems/swarmLegendaries.js:128`, `systems/tetherGameplay.js:342`, `systems/traffic.js:1755`, `systems/wingmen.js:159`, `ui/aftermathChoicePrompt.js:80`, `ui/impoundPayPrompt.js:72`, `ui/impoundPayPrompt.js:77`, `ui/impoundPayPrompt.js:82`, `ui/impoundPayPrompt.js:88`, `ui/promptDeck.js:903`, `ui/voiceArbiter.js:540`, `ui/wreckChoicePrompt.js:53` |
| `sector:membershipCandidate` | `systems/world.js:2629` | — |
| `sector:physicalLaw` | `systems/environmentalMachinery.js:851` | — |
| `sectorWonder:secured` | — | `systems/environmentalMachinery.js:273` |
| `sectorsim:embodiment` | `systems/sectorSim.js:1026` | `systems/world.js:808` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:389` | `ui/screens/starmap.js:934` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:2519`, `systems/claims.js:1833`, `systems/encounterDirector.js:2877`, `systems/masslineImpacts.js:314`, `systems/mining.js:2943`, `systems/trafficRoleOps.js:1797`, `systems/worldPressure.js:192`, `systems/worldPressure.js:276`, `world/motionFossil.js:187` | `systems/sectorSim.js:138`, `systems/world.js:824` |
| `sectorsim:intel` | `systems/sectorSim.js:1080` | `systems/world.js:813` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:856` | `systems/economy.js:1903` |
| `sectorsim:reconcile` | `systems/sectorSim.js:809` | `systems/world.js:814` |
| `sectorsim:tick` | `systems/sectorSim.js:333` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:762` | `ui/screens/starmap.js:935` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:655` | `systems/scanner.js:1117` |
| `sensors:playerLit` | `systems/massSignature.js:501` | — |
| `sensors:playerSignature` | `systems/massSignature.js:437` | — |
| `sensors:playerUnlit` | `systems/massSignature.js:482` | — |
| `sensors:quietCoast` | `systems/massSignature.js:413`, `systems/massSignature.js:419` | — |
| `sensors:signatureLost` | `systems/massSignature.js:311`, `systems/massSignature.js:323` | — |
| `sensors:signatureReport` | `systems/massSignature.js:609` | — |
| `sensors:signatureResolved` | `systems/massSignature.js:305` | — |
| `service:aborted` | `systems/stationServices.js:365` | `audio/audioSystem.js:3010`, `render/authoredMotion.js:1164`, `systems/economy.js:1854` |
| `service:completed` | `features/salvageTender/services.js:146`, `systems/blindWelderRuntime.js:142`, `systems/economy.js:5002`, `systems/economy.js:5226`, `systems/economy.js:5277`, `systems/economy.js:5309`, `systems/economy.js:5364`, `systems/economy.js:5405`, `systems/economy.js:5437`, `systems/economy.js:5475`, `systems/stationServices.js:746`, `systems/stationServices.js:765` | `audio/audioSystem.js:3011`, `render/authoredMotion.js:1163`, `render/authoredMotion.js:1167`, `systems/factionPresence.js:525`, `systems/ships.js:2103` |
| `service:decantRequest` | `ui/station/stationApp.js:1160` | `systems/stationServices.js:286` |
| `service:decanted` | `systems/stationServices.js:562` | — |
| `service:progress` | `systems/stationServices.js:664` | — |
| `service:queued` | `systems/stationServices.js:490` | — |
| `service:started` | `systems/stationServices.js:648` | `audio/audioSystem.js:3009`, `render/authoredMotion.js:1162` |
| `setPiece:staged` | `render/trailerStaging.js:14` | — |
| `settings:changed` | `render/slowFrameOffer.js:165`, `save/saveSystem.js:7742`, `save/saveSystem.js:7744`, `systems/legacyTouch.js:703`, `ui/screens/mainMenu.js:105`, `ui/screens/motionAsk.js:108`, `ui/screens/pause.js:720`, `ui/screens/pause.js:728`, `ui/screens/pause.js:844`, `ui/screens/pause.js:884`, `ui/screens/raceBoard.js:99`, `ui/screens/settings.js:744`, `ui/screens/settings.js:1397`, `ui/screens/settings.js:1458`, `ui/screens/settings.js:1580` | `audio/audioSystem.js:3321`, `main.js:394`, `render/vfx.js:2882`, `save/saveSystem.js:476`, `systems/missions.js:2004`, `systems/survivalResults.js:510`, `ui/uiRoot.js:1027` |
| `settings:restored` | `save/saveSystem.js:8338` | — |
| `shieldPylon:active` | `systems/shieldPylons.js:487` | — |
| `shieldPylon:contact` | `systems/shieldPylons.js:459` | — |
| `shieldPylon:denied` | `systems/shieldPylons.js:375` | — |
| `shieldPylon:intercepted` | `core/physics.js:1376` | — |
| `shieldPylon:linking` | `systems/shieldPylons.js:362` | — |
| `shieldPylon:overloaded` | `systems/shieldPylons.js:539` | — |
| `shieldPylon:placed` | `systems/shieldPylons.js:345`, `systems/shieldPylons.js:361` | — |
| `shieldPylon:recovered` | `systems/shieldPylons.js:528` | — |
| `shieldPylon:retired` | `systems/shieldPylons.js:575` | — |
| `shieldPylon:strained` | `systems/shieldPylons.js:505` | — |
| `shieldPylon:warning` | `systems/shieldPylons.js:495` | — |
| `ship:appearanceChanged` | `systems/ships.js:2567`, `systems/ships.js:3187`, `systems/trafficJobOps.js:424` | `core/coreSystem.js:541`, `render/vfx.js:2870` |
| `ship:appearanceSaved` | `systems/ships.js:3189` | `ui/station/screens/shipworks.js:1014` |
| `ship:berthSwitching` | `systems/ships.js:3087` | — |
| `ship:boostPreKick` | `systems/flightV3.js:930` | `render/authoredMotion.js:1159`, `render/feel.js:1525` |
| `ship:boostStart` | `systems/flight.js:110`, `systems/flightV3.js:296` | `audio/audioSystem.js:3096`, `render/authoredMotion.js:1160`, `render/vfx.js:2913`, `systems/cruise.js:65`, `systems/onboarding.js:721` |
| `ship:boostStop` | `systems/flight.js:111`, `systems/flight.js:224`, `systems/flightV3.js:297`, `systems/flightV3.js:1009` | `audio/audioSystem.js:3101`, `render/authoredMotion.js:1161`, `render/vfx.js:2914` |
| `ship:captured` | `systems/shipControlTransfer.js:97` | `data/encounters/362-the-salvage-watch.js:93`, `data/encounters/362-the-salvage-watch.js:187`, `data/encounters/367-the-salvage-tail.js:140` |
| `ship:cargoCapChanged` | `systems/ships.js:2561` | — |
| `ship:controlChanging` | `systems/shipControlTransfer.js:161` | `data/encounters/362-the-salvage-watch.js:98`, `data/encounters/362-the-salvage-watch.js:192`, `data/encounters/367-the-salvage-tail.js:135`, `systems/cruise.js:58`, `systems/flightV3.js:246`, `systems/tetherGameplay.js:341` |
| `ship:controlTransferred` | `systems/shipControlTransfer.js:202` | — |
| `ship:dash` | `systems/flight.js:201`, `systems/flightV3.js:955` | `audio/audioSystem.js:3104`, `render/vfx.js:2915`, `systems/combat.js:414`, `systems/gamepad.js:1109`, `systems/uniqueLootAbilities.js:160` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2757` | `render/vfx.js:2940` |
| `ship:deathPop` | `render/shipMicroMotion.js:1418`, `render/shipMicroMotion.js:2747` | `render/vfx.js:2939` |
| `ship:livingHullChanged` | `systems/ships.js:2224`, `systems/ships.js:2402`, `systems/story.js:2058` | `systems/barkDirector.js:818` |
| `ship:loadoutPresetApplied` | `systems/ships.js:3696` | `ui/station/screens/shipworks.js:1045` |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:3527`, `systems/ships.js:3545`, `systems/ships.js:3574`, `systems/ships.js:3599`, `systems/ships.js:3666`, `systems/ships.js:3686` | `ui/station/screens/shipworks.js:1039` |
| `ship:loadoutPresetDeleted` | `systems/ships.js:3512` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:3483` | — |
| `ship:massChanged` | `systems/ships.js:2818` | — |
| `ship:nameChanged` | `systems/ships.js:3212` | `ui/orrery/hudAdapter.js:382` |
| `ship:parkedHoldSwap` | `systems/shipControlTransfer.js:146`, `systems/ships.js:3070` | — |
| `ship:phaseBlink` | `systems/phaseBlink.js:190`, `systems/phaseBlink.js:331` | `render/phaseBlinkPresentation.js:855` |
| `ship:purchased` | `systems/ships.js:2869`, `systems/ships.js:2908` | `audio/audioSystem.js:3063`, `systems/impoundLot.js:1098`, `systems/lawSecurity.js:430`, `systems/missions.js:2038` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1483`, `render/shipMicroMotion.js:2734` | `render/vfx.js:2938` |
| `ship:released` | `shipjack/ownedOperations.js:26` | — |
| `ship:roleContext` | `systems/ships.js:2460` | `systems/presentationAdapters.js:341` |
| `ship:sold` | `systems/ships.js:3033` | — |
| `ship:statsChanged` | `systems/ships.js:2560` | `systems/stationServices.js:279`, `systems/world.js:746`, `ui/commandBar.js:462` |
| `ship:swingDash` | `systems/flightV3.js:956` | `render/shipMicroMotion.js:1767` |
| `ship:thrust` | `systems/flight.js:435`, `systems/flightV3.js:2308` | `render/vfx.js:2912` |
| `shipbreakingYard:action` | `features/shipbreakingYard/presentation.js:79` | — |
| `shipbreakingYard:close` | `features/shipbreakingYard/runtime.js:128` | — |
| `shipbreakingYard:cue` | `features/shipbreakingYard/runtime.js:125` | `features/shipbreakingYard/audio.js:18` |
| `shipbreakingYard:delivered` | `features/shipbreakingYard/runtime.js:407` | — |
| `shipbreakingYard:offer` | `features/shipbreakingYard/runtime.js:212`, `features/shipbreakingYard/runtime.js:224`, `features/shipbreakingYard/runtime.js:252`, `features/shipbreakingYard/runtime.js:315`, `features/shipbreakingYard/runtime.js:498`, `features/shipbreakingYard/runtime.js:524` | — |
| `shipbreakingYard:receipt` | `features/shipbreakingYard/runtime.js:123` | — |
| `shipbreakingYard:view` | `features/shipbreakingYard/runtime.js:630` | — |
| `shipjack:actionCommitted` | `systems/shipjack.js:113` | — |
| `shipjack:claimResolved` | `shipjack/yardOperations.js:132`, `shipjack/yardOperations.js:197` | — |
| `shipjack:cue` | `systems/shipjack.js:89` | — |
| `shipjack:destroyed` | `systems/shipjack.js:437` | — |
| `shipjack:distress` | `systems/shipjack.js:142` | — |
| `shipjack:fleetArrived` | `shipjack/fleetOperations.js:183` | — |
| `shipjack:fleetDeparted` | `shipjack/fleetOperations.js:153` | — |
| `shipjack:fleetPickedUp` | `shipjack/fleetOperations.js:171` | — |
| `shipjack:fleetReceipt` | `shipjack/fleetOperations.js:73` | — |
| `shipjack:fleetStarted` | `shipjack/fleetOperations.js:118` | — |
| `shipjack:inspection` | `systems/shipjack.js:545` | — |
| `shipjack:opportunity` | `systems/shipjack.js:496` | — |
| `shipjack:result` | `systems/shipjack.js:110` | — |
| `shipjack:route` | `systems/shipjack.js:428` | — |
| `shipjack:settled` | `systems/shipjack.js:571` | — |
| `shipjack:yardCompleted` | `shipjack/yardOperations.js:131`, `shipjack/yardOperations.js:196` | — |
| `shipjack:yardReceipt` | `shipjack/yardOperations.js:93`, `shipjack/yardOperations.js:130` | — |
| `shipjack:yardStarted` | `shipjack/yardOperations.js:241` | — |
| `ships:grantModule` | `systems/fenceDesk.js:266` | `systems/ships.js:1964` |
| `signal:investigate` | — | `systems/scanner.js:1103` |
| `signal:investigated` | `systems/scanner.js:2081` | `systems/missions.js:1904`, `systems/presentationOrchestrator.js:198`, `systems/story.js:164`, `systems/world.js:749`, `ui/signalInvestigationPrompt.js:268` |
| `signal:investigating` | `systems/scanner.js:1606`, `systems/spectrum/index.js:257` | `ui/signalInvestigationPrompt.js:267` |
| `signal:receipt` | `systems/scanner.js:2082` | — |
| `signal:scanResults` | `response/mercyService/live.js:144`, `systems/scanner.js:1347`, `systems/spectrum/index.js:131`, `systems/spectrum/index.js:246` | `systems/missions.js:1889`, `systems/presentationOrchestrator.js:196`, `systems/story.js:275`, `systems/story.js:278`, `ui/signalInvestigationPrompt.js:264` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:318` | `systems/scanner.js:1104` |
| `signal:track` | — | `systems/scanner.js:1102` |
| `signal:tracked` | `systems/scanner.js:1614`, `systems/scanner.js:1637` | `systems/presentationOrchestrator.js:197`, `ui/signalInvestigationPrompt.js:266` |
| `sim:pause` | `ui/screenManager.js:552` | `audio/audioSystem.js:3337`, `audio/bombAudio.js:463`, `audio/fieldAudio.js:329`, `audio/worldFeelSeams.js:447`, `render/feel.js:1367`, `systems/autoTargetAssist.js:166`, `ui/masslineHud.js:1271` |
| `sim:resume` | `core/simLaneMain.js:541`, `ui/screenManager.js:560` | `audio/audioSystem.js:3338`, `ui/masslineHud.js:1274`, `ui/screenManager.js:738` |
| `site:anchored` | `systems/asteroidSites.js:1490` | — |
| `site:chargePressed` | `systems/asteroidSites.js:2429` | — |
| `site:claimContested` | `systems/asteroidSites.js:2538` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:2918` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:2806` | `audio/audioSystem.js:3365` |
| `site:courierLost` | `systems/asteroidSites.js:2902` | — |
| `site:created` | `systems/asteroidSites.js:1428` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1825`, `systems/asteroidSites.js:1903` | — |
| `site:lost` | `systems/asteroidSites.js:2052` | `ui/alerts.js:492` |
| `site:machineInstalled` | `systems/asteroidSites.js:1459` | `audio/audioSystem.js:3364`, `ui/alerts.js:491` |
| `site:machineMode` | `systems/asteroidSites.js:1924` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1842` | `render/authoredMotion.js:1179` |
| `site:machineStatus` | `systems/asteroidSites.js:2493` | `audio/audioSystem.js:3369`, `ui/alerts.js:487` |
| `site:podBuilt` | `systems/asteroidSites.js:2355` | — |
| `site:producing` | `systems/asteroidSites.js:1712` | `render/authoredMotion.js:1178`, `ui/asteroid/asteroidScreen.js:2294` |
| `site:rematerialized` | `systems/asteroidSites.js:2104` | — |
| `site:signatureBand` | `systems/asteroidSites.js:2530` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1630` | `ui/asteroid/asteroidScreen.js:2279` |
| `site:surveyComplete` | `systems/asteroidSites.js:1581` | `ui/asteroid/asteroidScreen.js:2273` |
| `site:surveyDetected` | `systems/asteroidSites.js:1571` | `ui/asteroid/asteroidScreen.js:2266` |
| `siteEvidence:action` | `ui/physicalJobsPrompt.js:79`, `ui/physicalJobsPrompt.js:83` | `systems/asteroidSites.js:563` |
| `siteEvidence:closed` | `systems/machineWork.js:79`, `systems/machineWork.js:123`, `systems/machineWork.js:149`, `systems/machineWork.js:263`, `world/motionFossil.js:112`, `world/motionFossil.js:147`, `world/motionFossil.js:258` | — |
| `siteEvidence:offer` | `systems/alienEcology.js:884`, `systems/machineWork.js:88`, `world/motionFossil.js:119` | — |
| `siteEvidence:result` | `systems/asteroidSites.js:569`, `systems/asteroidSites.js:575` | — |
| `slate:columnRead` | `systems/slateColumn.js:186` | — |
| `slate:spike` | `systems/slateColumn.js:162` | — |
| `solstice:bloom` | `systems/solstice.js:526` | — |
| `solstice:charged` | `systems/solstice.js:449` | — |
| `solstice:destroyed` | `systems/solstice.js:361` | — |
| `solstice:voice` | `systems/solstice.js:291` | — |
| `spawn:request` | `systems/automation.js:1987` | `systems/world.js:790` |
| `special500:confessional` | `systems/special500Confessional.js:113`, `systems/special500Confessional.js:118`, `systems/special500Confessional.js:126`, `systems/special500Confessional.js:156`, `systems/special500Confessional.js:163` | `ui/special500ConfessionalPrompt.js:84` |
| `special500:confessionalReceipt` | `systems/special500Confessional.js:140` | `ui/special500ConfessionalPrompt.js:95` |
| `special500:deathBell` | `systems/special500DeathBell.js:86` | `render/feel.js:1379` |
| `special500:invoice` | `systems/special500Invoice.js:132` | `ui/special500InvoicePrompt.js:70` |
| `special500:invoiceReceipt` | `systems/special500Invoice.js:164`, `systems/special500Invoice.js:170`, `systems/special500Invoice.js:190` | `ui/special500InvoicePrompt.js:76` |
| `special500:karaokeHeard` | `systems/special500ForgeKaraoke.js:88` | — |
| `special500:portraitCommission` | `systems/special500PortraitBuoys.js:208`, `systems/special500PortraitBuoys.js:218`, `systems/special500PortraitBuoys.js:225` | — |
| `special500:spectacle` | `systems/special500Director.js:301` | `systems/special500Spectacle.js:207` |
| `spectrum:focus` | `ui/signalInvestigationPrompt.js:189` | — |
| `spectrum:resolved` | `systems/spectrum/index.js:314` | — |
| `station:berthAssigned` | `systems/stationServices.js:627` | — |
| `station:blockade` | `systems/economy.js:4849` | — |
| `station:boom` | `systems/economy.js:4826` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:430` | `render/vfx.js:2901` |
| `station:exitRequest` | `ui/screenManager.js:697`, `ui/uiRoot.js:1586` | `ui/station/stationApp.js:1626` |
| `station:grudge` | `systems/economy.js:4662` | — |
| `station:grudgeCleared` | `systems/economy.js:4700` | — |
| `station:holding` | `systems/stationServices.js:631` | — |
| `station:marketTradeIntentRetired` | `ui/station/screens/market.js:1031` | — |
| `station:marketTradeReceiptRecovered` | `ui/station/screens/market.js:1105` | — |
| `station:moduleGained` | `systems/claims.js:2415` | `systems/factions.js:538` |
| `station:navigate` | `ui/screens/automationPanel.js:2001`, `ui/station/screens/bar.js:928`, `ui/station/screens/bar.js:933`, `ui/station/screens/industry.js:603`, `ui/station/screens/industry.js:610` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:306` | `render/infrastructureMotion.js:310`, `render/vfx.js:2900` |
| `station:slammed` | `systems/economy.js:4605` | `systems/sectorSim.js:158` |
| `station:strike` | `systems/economy.js:4789` | — |
| `station:throughput` | `systems/claims.js:2376` | `render/authoredMotion.js:1199` |
| `station:yardChanged` | `systems/stationServices.js:822` | — |
| `stationContact:changed` | `systems/stationContacts.js:248`, `systems/stationContacts.js:436`, `systems/stationContacts.js:472`, `systems/stationContacts.js:749`, `systems/stationContacts.js:773` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:361`, `systems/stationContacts.js:790` | — |
| `stationContact:counterDelta` | `systems/missions.js:5510` | — |
| `stationContact:manifestWon` | `systems/manifestGame.js:16` | — |
| `stationLife:deedNoticed` | `systems/stationContacts.js:710` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:460`, `systems/stationContacts.js:572`, `systems/stationContacts.js:603` | — |
| `story:beatAdvanced` | `systems/missionStoryOps.js:2271` | `save/saveSystem.js:583`, `systems/story.js:154`, `ui/screens/codex.js:1326` |
| `story:continuationAccess` | `systems/story.js:2506` | — |
| `story:elroyResolved` | `systems/missionObjectiveOps.js:1302` | `systems/story.js:155` |
| `story:kurtzLedger` | `systems/story.js:1743`, `systems/story.js:1754` | `systems/story.js:183` |
| `story:newGamePlusStarted` | `systems/story.js:1972` | `systems/titles.js:589` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:2682` | `systems/story.js:181` |
| `story:postEndingContinuity` | `systems/story.js:1643` | `ui/screens/missionLog.js:2580` |
| `story:postEndingProgress` | `systems/story.js:1613` | `ui/screens/missionLog.js:2579` |
| `story:replayHookUnlocked` | `systems/story.js:1628` | `ui/screens/missionLog.js:2581` |
| `story:skimResolved` | `systems/missionStoryOps.js:1992` | `systems/missions.js:1785` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:822`, `systems/wingmen.js:171` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:821`, `systems/wingmen.js:172` |
| `story:varianceSeamFailed` | `systems/missionStoryOps.js:2489` | — |
| `story:vergeEvidenceRecorded` | `systems/story.js:1419` | `systems/story.js:182` |
| `story:vergeObserversRevealed` | `systems/story.js:1187` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1439` | `systems/story.js:184` |
| `stunt:arenaLawBounty` | `systems/stuntGrammar.js:185` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:299` | `ui/stuntCallout.js:924` |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:284` | `ui/stuntCallout.js:923` |
| `stunt:salvageRights` | `systems/stuntGrammar.js:194` | `ui/stuntCallout.js:921` |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:218` | `ui/stuntCallout.js:922` |
| `stunt:styleBanked` | `systems/stuntGrammar.js:167` | `audio/audioSystem.js:2951`, `ui/stuntCallout.js:912` |
| `stunt:trickAmended` | — | `systems/achievements.js:1181`, `systems/bulletTime.js:136`, `systems/survivalResults.js:516`, `systems/titles.js:588`, `ui/stuntCallout.js:911` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:2950`, `systems/achievements.js:1179`, `systems/bulletTime.js:135`, `systems/killReplay.js:382`, `systems/survivalResults.js:515`, `systems/titles.js:587`, `ui/stuntCallout.js:910`, `ui/toasts.js:608` |
| `surrender:escaped` | — | `systems/combatOutcome.js:297` |
| `surrender:secured` | — | `systems/traffic.js:1781` |
| `surrender:tethered` | — | `systems/traffic.js:1780` |
| `survivalArena:installed` | — | `systems/survivalAnnounce.js:403`, `systems/swarmArena.js:760` |
| `survivalArena:released` | — | `systems/swarmArena.js:761` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1552` | — |
| `survivalArena:stormPresented` | `render/renderer.js:20217` | `systems/survivalArena.js:1273` |
| `survivalWave:cohortJoined` | `systems/capitalBossRuntime.js:192` | `systems/survivalWave.js:207` |
| `survivorPod:boarded` | `systems/survivorPod.js:1262`, `systems/survivorPod.js:1362` | `systems/traffic.js:1803` |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:136` | `systems/survivorPod.js:666` |
| `survivorPod:delivered` | `systems/trafficRoleOps.js:1269` | `render/authoredMotion.js:1200`, `systems/survivorPod.js:677`, `systems/titles.js:590` |
| `survivorPod:ejected` | `systems/survivorPod.js:917`, `systems/survivorPod.js:1060` | `render/authoredMotion.js:1183`, `render/vfx.js:2898`, `systems/aftermathWrecks.js:1246`, `systems/lawSecurity.js:409`, `systems/survivorPod.js:676` |
| `survivorPod:heatCooled` | `systems/heat.js:812` | `systems/survivorPod.js:667` |
| `survivorPod:huntDispatched` | `ai/podHunt.js:188` | — |
| `survivorPod:huntEnded` | `ai/podHunt.js:244` | — |
| `survivorPod:promoted` | `systems/survivorPod.js:1654` | — |
| `survivorPod:ransomed` | — | `systems/fenceDesk.js:63` |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1798`, `systems/survivorPod.js:1833` | `ui/wreckChoicePrompt.js:52` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1812` | `render/authoredMotion.js:1184`, `systems/missions.js:1975` |
| `survivorPod:rescued` | — | `systems/heat.js:441`, `systems/titles.js:591` |
| `survivorPod:resolved` | `systems/survivorPod.js:1517` | — |
| `survivorPod:stripBlocked` | `systems/survivorPod.js:1775` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1870` | `systems/missions.js:1977`, `ui/wreckChoicePrompt.js:51` |
| `survivorpod:barrel` | — | `render/visualFactory.js:7003` |
| `survivorpod:crashcollar` | — | `render/visualFactory.js:7015` |
| `survivorpod:lamp` | — | `render/visualFactory.js:7028` |
| `survivorpod:mast` | — | `render/visualFactory.js:7022` |
| `survivorpod:nose` | — | `render/visualFactory.js:7005` |
| `survivorpod:retroblock` | — | `render/visualFactory.js:7018` |
| `survivorpod:viewportglass` | — | `render/visualFactory.js:7012` |
| `survivorpod:viewportring` | — | `render/visualFactory.js:7010` |
| `swarm:affix` | — | `systems/survivalAnnounce.js:395` |
| `swarm:announce` | — | `ui/swarmJuiceHud.js:90` |
| `swarm:bossDown` | — | `ui/swarmJuiceHud.js:95` |
| `swarm:bossHp` | — | `ui/swarmJuiceHud.js:94` |
| `swarm:bossIntro` | — | `ui/swarmJuiceHud.js:93` |
| `swarm:broodBurst` | `systems/swarmBrood.js:3177`, `systems/swarmBrood.js:3251` | — |
| `swarm:broodDeathPositions` | `systems/swarmBrood.js:3540` | `systems/swarmLegendaries.js:120` |
| `swarm:broodKills` | `systems/swarmBrood.js:3511` | `systems/survivalResults.js:507`, `systems/swarmChain.js:166`, `systems/swarmJuice.js:163`, `systems/swarmSupply.js:104` |
| `swarm:broodProjectileHit` | `systems/swarmBrood.js:2863` | — |
| `swarm:broodRemains` | `systems/swarmBrood.js:3330` | — |
| `swarm:broodRemainsSpent` | `systems/swarmBrood.js:3372` | — |
| `swarm:broodReserve` | `systems/swarmBrood.js:3488` | — |
| `swarm:broodShielded` | `systems/swarmBrood.js:3029` | — |
| `swarm:broodTelegraph` | `systems/swarmBrood.js:1603` | `systems/survivalAnnounce.js:394` |
| `swarm:broodTeslaHit` | `systems/swarmBrood.js:2893` | — |
| `swarm:chain` | — | `audio/audioSystem.js:2955`, `systems/survivalResults.js:525`, `systems/swarmElites.js:186`, `systems/swarmJuice.js:168`, `ui/survivalHud.js:324`, `ui/swarmJuiceHud.js:96` |
| `swarm:chainBest` | — | `systems/survivalResults.js:546` |
| `swarm:chainBroken` | — | `audio/audioSystem.js:2958`, `systems/swarmElites.js:187`, `systems/swarmJuice.js:169`, `ui/survivalHud.js:325`, `ui/swarmJuiceHud.js:97` |
| `swarm:chainShatter` | — | `ui/swarmJuiceHud.js:99` |
| `swarm:chainTier` | — | `ui/swarmJuiceHud.js:98` |
| `swarm:event` | `systems/swarmEvents.js:365` | `ui/encounterChoicePrompt.js:183` |
| `swarm:eventTelegraphed` | `systems/swarmEvents.js:167` | `ui/encounterChoicePrompt.js:182` |
| `swarm:eventVerdict` | `ui/encounterChoicePrompt.js:157` | `systems/swarmEvents.js:117` |
| `swarm:fortifyBuildRequested` | `ui/swarmFortifyPanel.js:125` | — |
| `swarm:fortifyBuildResolved` | — | `ui/swarmFortifyPanel.js:105` |
| `swarm:fortifyReloadRequested` | `ui/swarmFortifyPanel.js:127` | — |
| `swarm:fortifyRepairRequested` | `ui/swarmFortifyPanel.js:126` | — |
| `swarm:fortifyState` | — | `ui/swarmFortifyPanel.js:101` |
| `swarm:fortifyStateRequested` | `ui/swarmFortifyPanel.js:119` | — |
| `swarm:killPopup` | — | `ui/stuntCallout.js:1035`, `ui/swarmJuiceHud.js:89` |
| `swarm:pressureSpend` | — | `systems/survivalResults.js:514` |
| `swarm:pressureTelegraph` | — | `systems/survivalAnnounce.js:393` |
| `swarm:roundClear` | — | `ui/swarmJuiceHud.js:92` |
| `swarm:roundSlam` | — | `ui/swarmJuiceHud.js:91` |
| `swarm:stallReleased` | — | `systems/survivalAnnounce.js:396` |
| `swarm:stormDischarge` | — | `systems/swarmJuice.js:173` |
| `swarmrepair:barrel` | — | `render/visualFactory.js:3726` |
| `swarmrepair:crossbar` | — | `render/visualFactory.js:3741`, `render/visualFactory.js:3742` |
| `swarmrepair:flange` | — | `render/visualFactory.js:3728` |
| `swarmrepair:lid` | — | `render/visualFactory.js:3730` |
| `swarmrepair:weldseam` | — | `render/visualFactory.js:3737` |
| `tallyho:betLost` | `systems/tallyho.js:783`, `systems/tallyho.js:800`, `systems/tallyho.js:816`, `systems/tallyho.js:828` | — |
| `tallyho:betPaid` | `systems/tallyho.js:777` | — |
| `tallyho:betPosted` | `systems/tallyho.js:1126` | — |
| `tallyho:bountyClaimed` | `systems/tallyho.js:1108` | — |
| `tallyho:bountyCold` | `systems/tallyho.js:1040` | — |
| `tallyho:bountyPosted` | `systems/tallyho.js:1070` | — |
| `tallyho:deed` | `systems/tallyho.js:676` | — |
| `tallyho:huntCold` | `systems/tallyho.js:833` | — |
| `tallyho:huntPoached` | `systems/tallyho.js:805` | — |
| `tallyho:huntPosted` | `systems/tallyho.js:731` | — |
| `tallyho:huntSlipped` | `systems/tallyho.js:821` | — |
| `tallyho:ledgerFiled` | `systems/tallyho.js:654` | — |
| `tallyho:quarryFleeing` | `systems/tallyho.js:1153` | — |
| `tallyho:rivalDowned` | `systems/tallyho.js:994` | — |
| `tallyho:rivalLeft` | `systems/tallyho.js:887`, `systems/tallyho.js:1233` | — |
| `tallyho:rivalPosted` | `systems/tallyho.js:930` | — |
| `tallyho:sightingFiled` | `systems/tallyho.js:612` | — |
| `tallyho:standing` | `systems/tallyho.js:681` | — |
| `tech:researched` | `systems/ships.js:2613` | `audio/audioSystem.js:3059`, `systems/onboarding.js:903`, `systems/ships.js:1968` |
| `terrainAnchors:replenished` | `systems/terrainAnchors.js:249` | — |
| `tether:attached` | `combat/attachments.js:537` | `audio/audioSystem.js:3162`, `render/authoredMotion.js:1150`, `render/vfx.js:2784`, `systems/encounterDirector.js:389`, `systems/presentationOrchestrator.js:99`, `systems/scenarioRuntime.js:25`, `systems/surrenderRecovery.js:95`, `systems/survivalArena.js:1270`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:536`, `systems/tetherGameplay.js:1486`, `systems/tetherGameplay.js:1507`, `systems/tetherGameplay.js:2411` | `audio/audioSystem.js:3189`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1775`, `systems/faction_understory.js:708`, `systems/lineProgression.js:55`, `systems/onboarding.js:666`, `systems/onboarding.js:682`, `systems/surrenderRecovery.js:99` |
| `tether:broken` | `combat/attachments.js:655` | `audio/audioSystem.js:3150`, `render/feel.js:1563`, `render/vfx.js:2787`, `systems/encounterDirector.js:390`, `systems/missions.js:1920`, `systems/presentationOrchestrator.js:107`, `systems/scenarioRuntime.js:29`, `systems/surrenderRecovery.js:96`, `systems/survivalArena.js:1271`, `systems/tetherGameplay.js:344`, `systems/volatileExposure.js:217`, `ui/masslineHud.js:1254` |
| `tether:couplerLock` | `systems/tetherGameplay.js:2819` | — |
| `tether:cut` | `systems/tetherGameplay.js:2140` | `audio/audioSystem.js:3207`, `systems/gamepad.js:1002`, `systems/masslineThrow.js:120`, `systems/onboarding.js:681`, `systems/onboarding.js:730`, `systems/onboarding.js:740` |
| `tether:cutDenied` | `systems/tetherGameplay.js:2124` | — |
| `tether:detached` | — | `systems/missions.js:1919` |
| `tether:latchDenied` | `systems/masslineSnares.js:744`, `systems/tetherGameplay.js:429`, `systems/tetherGameplay.js:616`, `systems/tetherGameplay.js:641`, `systems/tetherGameplay.js:689`, `systems/tetherGameplay.js:694`, `systems/tetherGameplay.js:703`, `systems/tetherGameplay.js:732`, `systems/tetherGameplay.js:1122` | `render/authoredMotion.js:1156`, `systems/onboarding.js:939`, `testing/lab/proofSixtySeconds.js:1530`, `ui/masslineHud.js:1200` |
| `tether:latched` | `systems/tetherGameplay.js:516`, `systems/tetherGameplay.js:727`, `systems/tetherGameplay.js:757` | `audio/audioSystem.js:3177`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:479`, `systems/flightV3.js:247`, `systems/gamepad.js:1001`, `systems/heistFacilities.js:336`, `systems/lawSecurity.js:417`, `systems/lineProgression.js:53`, `systems/longBerth.js:53`, `systems/masslineThrow.js:126`, `systems/missions.js:1918`, `systems/missions.js:1957`, `systems/missions.js:2024`, `systems/onboarding.js:661`, `systems/onboarding.js:678`, `systems/onboarding.js:719`, `systems/onboarding.js:728`, `systems/onboarding.js:946`, `systems/onboarding.js:949`, `systems/onboarding.js:961`, `systems/onboarding.js:983`, `systems/surrenderRecovery.js:94`, `systems/survivalAnnounce.js:391`, `systems/survivorPod.js:675`, `testing/lab/proofSixtySeconds.js:1531`, `ui/masslineHud.js:1214`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1791` | — |
| `tether:massWeighed` | `systems/masslineTelemetry.js:338` | `systems/economyContracts.js:263` |
| `tether:nearBreak` | `combat/attachments.js:1040`, `combat/attachments.js:1063` | `audio/audioSystem.js:3174`, `systems/onboarding.js:667`, `systems/onboarding.js:985`, `systems/presentationOrchestrator.js:100` |
| `tether:rebound` | `combat/attachments.js:969` | `audio/audioSystem.js:3218`, `systems/survivalArena.js:1272` |
| `tether:reel` | `combat/attachments.js:589` | `audio/audioSystem.js:3148`, `systems/missions.js:1914`, `systems/onboarding.js:664`, `systems/onboarding.js:679`, `systems/surrenderRecovery.js:97` |
| `tether:reelPump` | `systems/masslineTelemetry.js:400` | `render/authoredMotion.js:1153`, `ui/stuntCallout.js:979` |
| `tether:releaseRated` | `systems/tetherGameplay.js:537`, `systems/tetherGameplay.js:1482`, `systems/tetherGameplay.js:1487`, `systems/tetherGameplay.js:1509`, `systems/tetherGameplay.js:2142` | `audio/audioSystem.js:3149`, `render/feel.js:1616`, `render/vfx.js:2786`, `systems/economy.js:1810`, `systems/gamepad.js:1003`, `systems/masslineThrow.js:123`, `systems/missions.js:1921`, `systems/presentationOrchestrator.js:166`, `systems/titles.js:592`, `ui/masslineHud.js:1222` |
| `tether:released` | `systems/tetherGameplay.js:1479`, `systems/tetherGameplay.js:1505`, `systems/tetherGameplay.js:2141` | `render/authoredMotion.js:1154`, `render/shipMicroMotion.js:1774`, `render/vfx.js:2785`, `systems/barkDirector.js:851`, `systems/faction_understory.js:707`, `systems/lineProgression.js:54`, `systems/onboarding.js:665`, `systems/onboarding.js:680`, `systems/onboarding.js:729`, `systems/onboarding.js:739`, `systems/rockCore.js:97`, `systems/surrenderRecovery.js:98`, `systems/tumbleStates.js:133`, `systems/world.js:831` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2723` | `ui/stuntCallout.js:976` |
| `tether:snagged` | `systems/tetherGameplay.js:2576` | `audio/audioSystem.js:3211` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:478` | `render/authoredMotion.js:1152`, `ui/stuntCallout.js:978` |
| `tether:strain` | `systems/tetherGameplay.js:1855` | `audio/audioSystem.js:3167`, `render/authoredMotion.js:1158`, `systems/missions.js:1812`, `systems/onboarding.js:986` |
| `tether:tractorCapture` | `systems/tetherGameplay.js:781` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1641`, `render/vfx.js:2861`, `systems/collisionConsequences.js:102`, `systems/combat.js:403`, `systems/lineHeads.js:121`, `systems/lineHeads.js:122`, `systems/masslineImpactDamage.js:57`, `systems/missions.js:1922`, `systems/onboarding.js:683`, `systems/onboarding.js:731`, `systems/onboarding.js:987`, `systems/presentationOrchestrator.js:142`, `systems/survivalAnnounce.js:392`, `systems/tumbleStates.js:128`, `ui/stuntCallout.js:980` |
| `tether:whipSnap` | `systems/tetherGameplay.js:2269` | `systems/gamepad.js:1017` |
| `title:holdResolved` | — | `systems/titles.js:581` |
| `touch:guide` | `ui/screens/pause.js:1163` | — |
| `touch:uiAction` | `systems/legacyTouch.js:635` | `ui/input.js:1147` |
| `towlineTable:assistAccepted` | `systems/towlineTable.js:202` | — |
| `towlineTable:assistFulfilled` | `systems/towlineTable.js:226` | — |
| `towlineTable:cleanupAccepted` | `systems/towlineTable.js:159` | — |
| `towlineTable:offer` | `systems/towlineTable.js:261` | `ui/towlineTablePrompt.js:7` |
| `traffic:anvilSpillReturned` | `systems/anvilWork.js:700` | — |
| `traffic:anvilTransfer` | `systems/anvilWork.js:801` | — |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:2941` |
| `traffic:freightTallied` | `systems/trafficRoleOps.js:968` | — |
| `traffic:haulerRegroup` | `systems/trafficRoleOps.js:1805` | `systems/barkDirector.js:871` |
| `traffic:oreCollected` | `systems/trafficRoleOps.js:1043` | `render/authoredMotion.js:1195`, `render/npcJobSignatureVfx.js:676`, `render/npcJobSignatureVfx.js:901` |
| `traffic:passengerLinerReceipt` | `systems/trafficJobOps.js:982` | — |
| `traffic:passengerLinerSuspended` | `systems/trafficCausalChainOps.js:2676` | — |
| `traffic:richSeamHelpReserved` | `systems/trafficRecoveryOps.js:572` | `systems/barkDirector.js:857` |
| `traffic:spillNoticed` | `systems/trafficRoleOps.js:1729` | `systems/barkDirector.js:855` |
| `traffic:vesselRelinquished` | `systems/traffic.js:1665` | — |
| `travelLanes:slingRingPass` | — | `ui/toasts.js:618` |
| `tutorial:finished` | `systems/onboarding.js:2264` | `systems/achievements.js:1210`, `systems/missions.js:1693`, `systems/presentationAdapters.js:344`, `systems/story.js:177` |
| `tutorial:say` | `systems/onboarding.js:1842` | `audio/audioSystem.js:3277`, `systems/story.js:217` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2432` | `systems/missions.js:1728` |
| `ui:acceptMission` | `ui/adventureDecisions.js:431` | `systems/missions.js:1727` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:5300` | `systems/ships.js:2063` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:1769` |
| `ui:buyModule` | — | `systems/onboarding.js:898`, `systems/ships.js:2038` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:5884` | `systems/bombs.js:701` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:5542` | `systems/ships.js:2001` |
| `ui:cancel` | `ui/input.js:1415`, `ui/input.js:1430` | `ui/screens/crucibleDraft.js:1232`, `ui/swarmFortifyPanel.js:112` |
| `ui:clearTarget` | `ui/input.js:753` | `ui/uiRoot.js:1439` |
| `ui:closeAll` | `main.js:1111`, `ui/loadingPresenter.js:549`, `ui/screens/crucible.js:3887` | `ui/uiRoot.js:1434` |
| `ui:closeCargo` | `ui/input.js:536`, `ui/input.js:713` | — |
| `ui:closeComms` | `ui/input.js:707` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1428` |
| `ui:confessionalChoose` | `ui/special500ConfessionalPrompt.js:76` | `systems/special500Confessional.js:108` |
| `ui:confessionalReady` | `ui/special500ConfessionalPrompt.js:101`, `ui/special500ConfessionalPrompt.js:118`, `ui/special500ConfessionalPrompt.js:122`, `ui/special500ConfessionalPrompt.js:124` | `systems/special500Confessional.js:109` |
| `ui:confirm` | `ui/input.js:1425` | `audio/audioSystem.js:3383` |
| `ui:convoyShareBuy` | — | `systems/economy.js:1807` |
| `ui:cycleComponent` | `ui/targetPanel.js:974`, `ui/targetPanel.js:978` | `ui/uiRoot.js:1443` |
| `ui:cycleTarget` | `ui/input.js:748`, `ui/input.js:1499` | `ui/uiRoot.js:1438` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:5346` | `systems/ships.js:2064` |
| `ui:endgameChoose` | `systems/missions.js:2437`, `ui/station/barContacts.js:1641` | `systems/story.js:230` |
| `ui:endgameConfirm` | — | `systems/story.js:231` |
| `ui:endgameDecline` | `ui/comms.js:655` | `systems/story.js:232` |
| `ui:endgameDepartAshfall` | `ui/comms.js:672` | `systems/story.js:241` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2282` | `systems/story.js:238` |
| `ui:endgameStayAshfall` | `ui/comms.js:673` | `systems/story.js:242` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2286` | `systems/story.js:239` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:240` |
| `ui:endingArchiveOpen` | `ui/screens/pause.js:1188` | `systems/story.js:234` |
| `ui:entityDrawer` | `ui/entityLinks.js:321`, `ui/entityLinks.js:339`, `ui/entityLinks.js:394` | `ui/globalFind.js:197` |
| `ui:entityRoute` | `ui/entityLinks.js:199` | `systems/routeFollower.js:411` |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:85` | `systems/factionPresence.js:522` |
| `ui:fitModule` | — | `systems/onboarding.js:895`, `systems/ships.js:2040` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:5894` | `systems/bombs.js:702` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:2047` | `systems/automation.js:594`, `systems/wingmen.js:168` |
| `ui:forwardSlipBuy` | — | `systems/economy.js:1808` |
| `ui:globalFind` | `ui/input.js:595`, `ui/input.js:683` | `ui/globalFind.js:193` |
| `ui:heliosBay7Scan` | — | `systems/story.js:281` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:244` | `systems/story.js:280` |
| `ui:loadingHidden` | `ui/loadingPresenter.js:388` | `ui/screens/mainMenu.js:907` |
| `ui:manifestAction` | `ui/screens/manifest.js:30` | — |
| `ui:manifestOpen` | `ui/screens/manifest.js:27` | — |
| `ui:manifestStart` | `ui/screens/manifest.js:51` | — |
| `ui:navigate` | `ui/input.js:1401`, `ui/input.js:1406`, `ui/input.js:1472` | — |
| `ui:popScreen` | `ui/galaxyMap.js:3423`, `ui/screens/achievements.js:267`, `ui/screens/automationPanel.js:1178`, `ui/screens/clips.js:352`, `ui/screens/credits.js:182`, `ui/screens/crucible.js:2473`, `ui/screens/crucibleDraft.js:2071`, `ui/screens/localmap.js:887`, `ui/screens/manifest.js:86`, `ui/screens/replay.js:305`, `ui/screens/starmap.js:737`, `ui/screens/statistics.js:174`, `ui/screens/techTree.js:341`, `ui/swarmFortifyPanel.js:93`, `ui/swarmFortifyPanel.js:113` | `ui/uiRoot.js:1424` |
| `ui:prepareBombRack` | `systems/ships.js:3684`, `ui/station/screens/shipworks.js:5405` | `systems/bombs.js:712` |
| `ui:previewBombRackPreparation` | `systems/ships.js:3595`, `ui/station/screens/shipworks.js:4260`, `ui/station/screens/shipworks.js:5361` | `systems/bombs.js:709` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:808` | `systems/world.js:793` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:919` | `systems/world.js:792` |
| `ui:pushScreen` | `main.js:613`, `systems/story.js:1399`, `ui/loadingPresenter.js:550`, `ui/mapAuthority.js:134`, `ui/screens/base.js:1386`, `ui/screens/crucible.js:3888`, `ui/screens/crucibleDraft.js:84`, `ui/screens/crucibleDraft.js:1135`, `ui/screens/gameOver.js:554`, `ui/screens/starmap.js:745`, `ui/signalInvestigationPrompt.js:260`, `ui/station/barContacts.js:1262`, `ui/station/screens/bar.js:847`, `ui/station/screens/bar.js:913`, `ui/station/screens/industry.js:597`, `ui/station/stationApp.js:616` | `ui/uiRoot.js:1401` |
| `ui:replaceScreen` | `ui/screens/crucible.js:3852`, `ui/screens/crucible.js:3879`, `ui/screens/motionAsk.js:118` | `ui/uiRoot.js:1433` |
| `ui:restockBombRack` | — | `systems/bombs.js:705` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:5272` | `systems/ships.js:2062` |
| `ui:screenTop` | `ui/screenManager.js:367` | `ui/comms.js:136`, `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:1770` |
| `ui:sellModule` | — | `systems/ships.js:2039` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:5904` | `systems/bombs.js:704` |
| `ui:service` | `balance/careerCohorts.js:752`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:552`, `ui/station/stationApp.js:1191`, `ui/station/stationApp.js:1227` | `systems/economy.js:1851` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:5549`, `ui/station/screens/shipworks.js:5704` | `systems/ships.js:2037` |
| `ui:setCourse` | `data/encounters/1210-the-deadweight.js:284`, `features/breakwaterSpur/runtime.js:292`, `features/breakwaterSpur/runtime.js:295`, `features/breakwaterSpur/runtime.js:300`, `features/cinderglassJob/runtime.js:318`, `features/cinderglassJob/runtime.js:338`, `features/rigWorkshop/jobs.js:259`, `features/rigWorkshop/runtime.js:322`, `features/salvageTender/runtime.js:309`, `features/shipbreakingYard/runtime.js:485`, `features/shipbreakingYard/runtime.js:491`, `systems/borrowedSun.js:605`, `systems/economy.js:5049`, `systems/economy.js:5076`, `systems/factionPresence.js:1727`, `systems/ilexArk.js:40`, `systems/missions.js:3291`, `systems/missions.js:3376`, `systems/palletJack.js:291`, `systems/redKite.js:61`, `systems/scanner.js:1636`, `systems/scanner.js:1668`, `systems/scanner.js:1828`, `systems/shipjack.js:427`, `systems/tallyThree.js:118`, `systems/towlineTable.js:34`, `ui/galaxyMap.js:3055`, `ui/galaxyMap.js:3070`, `ui/galaxyMap.js:8827`, `ui/market/tradeLogic.js:575`, `ui/radar.js:1741`, `ui/screens/footprint.js:1668`, `ui/screens/footprint.js:1679`, `ui/screens/localmap.js:1222`, `ui/screens/starmap.js:1798`, `ui/screens/starmap.js:1811`, `ui/screens/starmap.js:1815` | `systems/world.js:740` |
| `ui:setShipAppearance` | `ui/screens/raceBoard.js:328`, `ui/station/screens/shipworks.js:5187` | `systems/ships.js:2066` |
| `ui:setShipName` | `ui/station/screens/shipworks.js:5607` | `systems/ships.js:2069` |
| `ui:shipjack` | `ui/blackFlag.js:75`, `ui/blackFlag.js:94`, `ui/blackFlag.js:97`, `ui/blackFlag.js:104`, `ui/blackFlag.js:182`, `ui/blackFlagRegistry.js:143`, `ui/blackFlagRegistry.js:146`, `ui/blackFlagRegistry.js:155` | — |
| `ui:standbyFeeChoose` | `ui/special500InvoicePrompt.js:65` | `systems/special500Invoice.js:71` |
| `ui:talkContact` | `ui/station/screens/bar.js:247` | `systems/fenceDesk.js:61`, `systems/special500PortraitBuoys.js:121`, `systems/special500Sommelier.js:26`, `systems/story.js:282` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:66`, `combat/autoTargetMode.js:256` | `ui/uiRoot.js:1444` |
| `ui:toast` | `features/counterweightCircuit/runtime.js:470`, `features/counterweightCircuit/runtime.js:514`, `systems/scanner.js:1825`, `systems/scanner.js:1831` | — |
| `ui:toggleCargo` | `ui/input.js:822` | — |
| `ui:toggleComms` | `ui/input.js:844` | — |
| `ui:toggleOverview` | `ui/input.js:829` | — |
| `ui:trackMission` | `ui/galaxyMap.js:4780`, `ui/galaxyMap.js:4939`, `ui/screens/missionLog.js:2278`, `ui/screens/missionLog.js:2350`, `ui/screens/missionLog.js:2411`, `ui/station/screens/contracts.js:1620` | `systems/missions.js:1732` |
| `ui:transferParkedCargo` | `ui/station/screens/shipworks.js:5725` | — |
| `ui:undock` | — | `ui/input.js:1146` |
| `ui:unfitModule` | — | `systems/ships.js:2054` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:5914` | `systems/bombs.js:703` |
| `ui:unlockTech` | `ui/screens/techTree.js:840` | `systems/ships.js:2065` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:5528` | `systems/bombs.js:706` |
| `ui:wingOrder` | `ui/wingmanRadial.js:275` | `systems/automation.js:598` |
| `ui:wingmanRadial` | `ui/input.js:836` | `ui/wingmanRadial.js:346` |
| `understory:accessTier` | `systems/faction_understory.js:1291` | — |
| `understory:blacklisted` | `systems/faction_understory.js:1900` | — |
| `understory:buyCover` | — | `systems/faction_understory.js:710` |
| `understory:compostRunComplete` | `systems/faction_understory.js:1205` | — |
| `understory:coverBurned` | `systems/faction_understory.js:1966` | — |
| `understory:coverIssued` | `systems/faction_understory.js:1955` | — |
| `understory:debtChanged` | `systems/faction_understory.js:1329`, `systems/faction_understory.js:1346`, `systems/faction_understory.js:2042` | — |
| `understory:debtSquared` | `systems/faction_understory.js:1352` | — |
| `understory:dropCracked` | `systems/faction_understory.js:1667` | — |
| `understory:dropDelivered` | `systems/faction_understory.js:1604` | — |
| `understory:dropLapsed` | `systems/faction_understory.js:1534`, `systems/faction_understory.js:1544`, `systems/faction_understory.js:1577`, `systems/faction_understory.js:1585`, `systems/faction_understory.js:1645` | — |
| `understory:dropReturned` | `systems/faction_understory.js:1618` | — |
| `understory:dropStashed` | `systems/faction_understory.js:1456` | — |
| `understory:favor` | `systems/faction_understory.js:1286` | — |
| `understory:gardenFed` | `systems/faction_understory.js:1157` | — |
| `understory:gardenSeeded` | `systems/faction_understory.js:1081` | — |
| `understory:gardenStage` | `systems/faction_understory.js:1160` | — |
| `understory:markedStash` | `systems/faction_understory.js:1816` | — |
| `understory:noticeChanged` | `systems/faction_understory.js:1871`, `systems/faction_understory.js:1923` | — |
| `understory:payDebt` | — | `systems/faction_understory.js:711` |
| `understory:playerGrowth` | `systems/faction_understory.js:1042`, `systems/faction_understory.js:1158` | `systems/missions.js:1789` |
| `understory:sporeSkin` | `systems/faction_understory.js:1273` | — |
| `understory:whisperPosted` | `systems/faction_understory.js:1689` | — |
| `understory:whisperVerified` | `systems/faction_understory.js:1762` | — |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:391` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:329` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:250` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1723` | `audio/audioSystem.js:3017`, `systems/missions.js:1990`, `ui/discoveryPlate.js:116` |
| `uniqueWreck:blackBoxRecovered` | `systems/uniqueWrecks.js:1757` | — |
| `uniqueWreck:choiceBlocked` | `systems/uniqueWrecks.js:1885` | — |
| `uniqueWreck:choose` | `systems/missionObjectiveOps.js:967`, `systems/uniqueWreckEncounterScripts.js:123`, `ui/recoveryEncounterPrompt.js:345` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:992` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:1013`, `systems/uniqueWrecks.js:1187`, `systems/uniqueWrecks.js:1375` | `systems/missions.js:1991` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1819` | `systems/missions.js:1993`, `ui/recoveryEncounterPrompt.js:485` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1234` | `systems/missions.js:1992` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1264` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:742`, `systems/uniqueWrecks.js:1189` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:2055` | `systems/missions.js:1994`, `systems/traffic.js:1802`, `ui/recoveryEncounterPrompt.js:486` |
| `uniqueWreck:rumorHeard` | `systems/trafficJobOps.js:1146`, `ui/station/screens/bar.js:869` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:863` | `systems/missions.js:1989` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:2056` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1702` | `systems/world.js:798` |
| `uniqueWreck:storyRewardDisposed` | `systems/uniqueWrecks.js:2147` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1984` | `systems/factions.js:351` |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:388` | `systems/missions.js:1901`, `ui/bandHud.js:117` |
| `vael:clauseDone` | `systems/faction_vael.js:1600` | — |
| `vael:clauseFailed` | `systems/faction_vael.js:1627` | — |
| `vael:clauseLapsed` | `systems/faction_vael.js:1637` | — |
| `vael:clausePosted` | `systems/faction_vael.js:1565` | — |
| `vael:clauseSigned` | `systems/faction_vael.js:1579` | — |
| `vael:debtorCollected` | `systems/faction_vael.js:1869` | — |
| `vael:debtorPosted` | `systems/faction_vael.js:1825` | — |
| `vael:debtorSkipped` | `systems/faction_vael.js:1746`, `systems/faction_vael.js:1753` | — |
| `vael:debtorTransferred` | `systems/faction_vael.js:1769` | — |
| `vael:hullScriptRead` | `systems/faction_vael.js:1321` | — |
| `vael:invoiceFiled` | `systems/faction_vael.js:967` | — |
| `vael:invoiceReminded` | `systems/faction_vael.js:1014` | — |
| `vael:invoiceSettled` | `systems/faction_vael.js:992` | — |
| `vael:ledgerFiled` | `systems/faction_vael.js:508` | — |
| `vael:lienClamped` | `systems/faction_vael.js:695` | — |
| `vael:lienCut` | `systems/faction_vael.js:879` | — |
| `vael:lienPaid` | `systems/faction_vael.js:848` | — |
| `vael:lienServed` | `systems/faction_vael.js:1692` | — |
| `vael:lienTelegraph` | `systems/faction_vael.js:647` | — |
| `vael:lienThrown` | `systems/faction_vael.js:732` | — |
| `vael:lienTransferred` | `systems/faction_vael.js:815` | — |
| `vael:marked` | `systems/faction_vael.js:1280` | — |
| `vael:milestone` | `systems/faction_vael.js:1884` | — |
| `vael:overrideThrust` | `systems/faction_vael.js:914` | — |
| `vael:pageNineArmed` | `systems/faction_vael.js:485` | — |
| `vael:pageTurned` | `systems/faction_vael.js:1903` | — |
| `vael:paperTier` | `systems/faction_vael.js:1604`, `systems/faction_vael.js:1863` | — |
| `vael:patrolHail` | `systems/faction_vael.js:1269` | — |
| `vael:patrolPosted` | `systems/faction_vael.js:1406` | — |
| `vael:patrolWithdrew` | `systems/faction_vael.js:1289` | — |
| `vael:reading` | `systems/faction_vael.js:1306` | — |
| `vael:riderLeft` | `systems/faction_vael.js:1347` | — |
| `vael:riderOpened` | `systems/faction_vael.js:1362` | — |
| `vael:writClosed` | `systems/faction_vael.js:1107` | — |
| `vael:writHullKilled` | `systems/faction_vael.js:1967` | — |
| `vael:writPosted` | `systems/faction_vael.js:1081` | — |
| `vael:writRecalled` | `systems/faction_vael.js:1117` | — |
| `vael:writServed` | `systems/faction_vael.js:1180` | — |
| `vael:writTelegraph` | `systems/faction_vael.js:1156` | — |
| `verb:used` | `systems/onboarding.js:4704` | — |
| `verge:appealDenied` | `systems/faction_verge.js:1813` | — |
| `verge:appealGranted` | `systems/faction_verge.js:1804` | — |
| `verge:checkpointChallenged` | `systems/faction_verge.js:699` | — |
| `verge:checkpointCleared` | `systems/faction_verge.js:686` | — |
| `verge:checkpointScan` | `systems/faction_verge.js:755` | — |
| `verge:courtConvened` | `systems/faction_verge.js:1718` | — |
| `verge:directive` | `systems/faction_verge.js:561`, `systems/faction_verge.js:1657` | — |
| `verge:directiveViolated` | `systems/faction_verge.js:1706` | — |
| `verge:escortBroken` | `systems/faction_verge.js:1081`, `systems/faction_verge.js:1499`, `systems/faction_verge.js:1569` | — |
| `verge:escortDemanded` | `systems/faction_verge.js:1000` | — |
| `verge:escortReleased` | `systems/faction_verge.js:1063` | — |
| `verge:incident` | `systems/faction_verge.js:518` | — |
| `verge:jurorWoke` | `systems/faction_verge.js:1840` | — |
| `verge:lawWoke` | `systems/worldPressure.js:281` | — |
| `verge:lineTrialPassed` | `systems/faction_verge.js:1863` | — |
| `verge:manifestFined` | `systems/faction_verge.js:664` | — |
| `verge:massWeighed` | `systems/faction_verge.js:647`, `systems/faction_verge.js:1753`, `systems/tare.js:192` | — |
| `verge:permitDenied` | `systems/faction_verge.js:942` | — |
| `verge:permitGranted` | `systems/faction_verge.js:936` | — |
| `verge:permitLapsed` | `systems/faction_verge.js:850` | — |
| `verge:permitReinstated` | `systems/faction_verge.js:1800` | — |
| `verge:permitSuspended` | `systems/faction_verge.js:1699` | — |
| `verge:pursuitCold` | `systems/faction_verge.js:1423` | — |
| `verge:pursuitCrossed` | `systems/faction_verge.js:1368`, `systems/faction_verge.js:1534`, `systems/faction_verge.js:1629` | — |
| `verge:pursuitEscaped` | `systems/faction_verge.js:1418` | — |
| `verge:pursuitIntercepted` | `systems/faction_verge.js:1396` | — |
| `verge:pursuitOpened` | `systems/faction_verge.js:1127`, `systems/faction_verge.js:1595` | — |
| `verge:pursuitResumed` | `systems/faction_verge.js:1339` | — |
| `verge:pursuitSubmitted` | `systems/faction_verge.js:1447` | — |
| `verge:scanLogged` | `systems/faction_verge.js:781` | — |
| `verge:treatmentChanged` | `systems/faction_verge.js:601` | — |
| `vesper:met` | `systems/vesper.js:205` | — |
| `vesper:note` | `systems/vesper.js:247` | — |
| `vesper:performance` | `systems/vesper.js:271` | — |
| `vesper:phraseProgress` | `systems/vesper.js:263` | — |
| `vesper:voice` | `systems/vesper.js:103`, `systems/vesper.js:189` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:7748` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:365` | `systems/world.js:752` |
| `vestaOreCache:clueRecovered` | `systems/world.js:7569` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:7600` | `ui/recoveryEncounterPrompt.js:487` |
| `vestaOreCache:pickupReady` | `systems/world.js:7711` | — |
| `vestaOreCache:resolved` | `systems/world.js:7668` | `ui/recoveryEncounterPrompt.js:488` |
| `voice:clear` | `ui/voiceArbiter.js:949`, `ui/voiceArbiter.js:996` | `ui/alerts.js:470` |
| `voice:dismiss` | `ui/bindings.js:103`, `ui/input.js:692` | `ui/voiceArbiter.js:428` |
| `voice:say` | `audio/audioSystem.js:2932`, `audio/audioSystem.js:5565`, `features/breakwaterSpur/runtime.js:113`, `features/salvageOutfits/presentation.js:96`, `systems/achievements.js:1027`, `systems/mines.js:108`, `systems/mines.js:257`, `systems/survivalAnnounce.js:473`, `systems/survivalAnnounce.js:960`, `systems/world.js:894`, `systems/world.js:916`, `ui/alerts.js:357`, `ui/hud.js:671` | `ui/voiceArbiter.js:427` |
| `voice:surface` | `ui/voiceArbiter.js:954`, `ui/voiceArbiter.js:1006` | `audio/audioSystem.js:3272`, `systems/barkDirector.js:819`, `systems/story.js:173`, `ui/alerts.js:469`, `ui/voiceArbiter.js:538` |
| `warrant:acceptPayment` | `ui/warrantOfferPrompt.js:93` | — |
| `watch:changed` | `ui/entityLinks.js:239`, `ui/entityLinks.js:283` | `ui/watchlistHud.js:89` |
| `weapons:debrisOrbitClaimed` | `systems/weapons.js:2434` | — |
| `weapons:inertialShunt` | `systems/weapons.js:507` | `ui/stuntCallout.js:985` |
| `weapons:mineArmed` | `systems/weapons.js:2116` | `audio/audioSystem.js:2898` |
| `weapons:mineDeployed` | `systems/weapons.js:2073` | `render/vfx.js:2857` |
| `weapons:mineDetonated` | `systems/weapons.js:2200` | — |
| `weapons:mineExpired` | `systems/weapons.js:2110` | `render/vfx.js:2858`, `systems/presentationOrchestrator.js:280` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:476` | `audio/audioSystem.js:2935` |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1669` | `audio/audioSystem.js:2936` |
| `weapons:mortarDetonated` | `systems/weapons.js:2334` | — |
| `weapons:mortarLanded` | `systems/weapons.js:2272` | — |
| `weapons:vent` | `systems/weapons.js:934`, `systems/weapons.js:954` | `audio/audioSystem.js:3037`, `render/shipMicroMotion.js:1749`, `render/vfx.js:2899`, `systems/ships.js:2117` |
| `weather:ionBlackout` | `systems/environmentalMachinery.js:1664`, `systems/environmentalMachinery.js:1859` | — |
| `web:linked` | `combat/tetherWebs.js:161` | — |
| `weighing:overMass` | `data/encounters/700-the-weighing.js:232` | — |
| `well:capture` | `systems/fields.js:2529` | — |
| `well:fling` | `systems/fields.js:2454` | `systems/flightV3.js:225`, `ui/stuntCallout.js:983` |
| `well:grind` | `systems/fields.js:2119` | `systems/impulseCharges.js:226` |
| `well:haulerDragged` | `systems/fields.js:2398` | `systems/traffic.js:1801` |
| `wexTicket:found` | `systems/wexTicket.js:125` | — |
| `wingMorale:broken` | `systems/wingMorale.js:289` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:398` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:426` | — |
| `wingOrder:accepted` | `systems/automation.js:2531` | `systems/wingmen.js:169` |
| `wingOrder:blocked` | `systems/automation.js:2532` | `ui/wingmanRadial.js:353` |
| `wingOrder:converted` | `systems/wingmen.js:775` | `ui/wingmanRadial.js:359` |
| `wingOrder:status` | `systems/automation.js:2533` | `ui/wingmanRadial.js:363` |
| `wingmen:gap` | `systems/wingmen.js:334` | — |
| `world:abortJumpCharge` | `systems/story.js:950`, `ui/comms.js:664` | `systems/world.js:737` |
| `world:confirmUnfiledJump` | `systems/story.js:240` | `systems/world.js:736` |
| `world:courtRulingRecorded` | `systems/world.js:672` | — |
| `world:criticalSpawnDeferred` | `systems/world.js:2237`, `systems/world.js:4751` | — |
| `world:farActorRestored` | `world/farActorTable.js:1243` | `systems/npcJobsRuntime.js:1132`, `systems/traffic.js:1766` |
| `world:farActorShelved` | `world/farActorTable.js:1189` | `systems/npcJobsRuntime.js:1131`, `systems/traffic.js:1765` |
| `world:membership` | `systems/world.js:1280` | `systems/presentationOrchestrator.js:185` |
| `world:originShift` | `systems/world.js:6177` | — |
| `world:playerRelocated` | `systems/world.js:4897` | `core/coreSystem.js:553`, `render/vfx.js:2881` |
| `world:requestJump` | `systems/story.js:934`, `ui/galaxyMap.js:3049`, `ui/screens/starmap.js:1810` | `systems/world.js:734` |
| `world:requestRoute` | `ui/galaxyMap.js:3068`, `ui/galaxyMap.js:4956`, `ui/galaxyMap.js:8825`, `ui/screens/starmap.js:1797`, `ui/screens/starmap.js:1814` | `systems/world.js:738` |
| `world:requestSectorScan` | `ui/galaxyMap.js:7161` | `systems/world.js:739` |
| `world:requestUnfiledJump` | `systems/story.js:902` | `systems/world.js:735` |
| `world:residency` | `systems/world.js:1479`, `systems/world.js:1522`, `systems/world.js:2478` | — |
| `world:spawnLimited` | `systems/world.js:4671` | — |
| `world:stuckCleared` | `systems/world.js:7283` | — |
| `world:stuckTowAccept` | `ui/stuckTowPrompt.js:52` | `systems/world.js:837` |
| `world:stuckTowOffer` | `systems/world.js:7316` | `ui/stuckTowPrompt.js:23` |
| `world:zoneEntered` | `systems/world.js:6204` | `data/hazardLanguage.js:176` |
| `world:zoneExited` | `systems/world.js:6219` | `data/hazardLanguage.js:177` |
| `worldPressure:auditAnnounced` | `systems/worldPressure.js:237` | `systems/missions.js:1810` |
| `worldPressure:auditDelayed` | `systems/worldPressure.js:352` | — |
| `worldPressure:colossusRemains` | `systems/worldPressure.js:381` | — |
| `worldPressure:gateClosed` | `systems/worldPressure.js:278` | `systems/missions.js:1811` |
| `worldPressure:scaffoldSpawned` | `systems/worldPressure.js:437` | — |
| `worldPressure:slowGray` | `systems/worldPressure.js:300` | — |
| `worldPressure:tideChanged` | `systems/worldPressure.js:208` | — |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:1282` | `systems/presentationOrchestrator.js:294` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:1167` | `audio/worldFeelSeams.js:446`, `systems/economy.js:1754`, `systems/presentationOrchestrator.js:295`, `systems/traffic.js:1897` |
| `wreckCourt:action` | `ui/physicalJobsPrompt.js:33` | — |
| `wreckCourt:lawFact` | `systems/wreckCourt.js:1031` | `systems/heat.js:357` |
| `wreckCourt:opened` | `systems/wreckCourt.js:950` | — |
| `wreckCourt:result` | `systems/wreckCourt.js:894` | — |
| `wreckCourt:ruled` | `systems/wreckCourt.js:1032` | — |
| `wreckCourt:worldFact` | `systems/wreckCourt.js:1030` | `systems/world.js:665` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:3456` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1584` | `systems/barkDirector.js:833` |
| `wreckEcology:rivalPressured` | `systems/aftermathWrecks.js:1545` | `systems/barkDirector.js:832` |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1627` | `systems/barkDirector.js:831` |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:3137` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:3359` | `systems/npcJobsRuntime.js:1162` |
| `wreckField:source` | `systems/factionPresence.js:1175`, `systems/salvage.js:595`, `systems/uniqueWrecks.js:1594` | `systems/aftermathWrecks.js:1223` |
| `wreckMarket:rates` | `systems/rookBooth.js:452` | — |
| `wreckMission:choiceApplied` | `systems/missionObjectiveOps.js:1413` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:145` | `systems/missions.js:1973` |

## Events with no statically indexed emitter

- `aceMemory:transition` — 3 subscriber(s)
- `achievement:unlocked` — 1 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `alienEcology:nurseryBloom` — 1 subscriber(s)
- `alienEcology:nurseryPowered` — 1 subscriber(s)
- `alienEcology:relaySevered` — 1 subscriber(s)
- `alienEcology:relocateSite` — 1 subscriber(s)
- `barkDirector:silence` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `body:sled` — 1 subscriber(s)
- `capitalBoss:actChanged` — 1 subscriber(s)
- `capitalBoss:countered` — 1 subscriber(s)
- `capitalBoss:disarmed` — 1 subscriber(s)
- `capitalBoss:ended` — 1 subscriber(s)
- `capitalBoss:hit` — 1 subscriber(s)
- `capitalBoss:recovery` — 1 subscriber(s)
- `capitalBoss:started` — 1 subscriber(s)
- `capitalBoss:telegraph` — 2 subscriber(s)
- `chronicler:radio` — 1 subscriber(s)
- `chronicler:recall` — 1 subscriber(s)
- `claim:defenseDelegate` — 1 subscriber(s)
- `claim:defenseGo` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:bankShot` — 1 subscriber(s)
- `combat:chainKill` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:shockwavePass` — 2 subscriber(s)
- `combat:subsystemDisabled` — 9 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `custody:aftermathChanged` — 1 subscriber(s)
- `custody:aftermathSettled` — 1 subscriber(s)
- `customs:massSlipFiled` — 1 subscriber(s)
- `customs:scanAborted` — 1 subscriber(s)
- `customs:scanWaived` — 1 subscriber(s)
- `customs:trustMarked` — 1 subscriber(s)
- `customs:weirBolt` — 2 subscriber(s)
- `deniable:fenceBurned` — 1 subscriber(s)
- `deniable:fenceEmboldened` — 1 subscriber(s)
- `drone:grindStop` — 1 subscriber(s)
- `encounter:ambientPredationCleared` — 1 subscriber(s)
- `encounter:ambientPredationTelegraph` — 1 subscriber(s)
- `encounter:predationTelegraph` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `environment:detonated` — 1 subscriber(s)
- `environment:fractured` — 1 subscriber(s)
- `fence:routeLegDue` — 1 subscriber(s)
- `fence:scrubAsk` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
- `frontier:homesteadRaised` — 1 subscriber(s)
- `gyre:absorbTick` — 1 subscriber(s)
- `gyre:ballGrave` — 1 subscriber(s)
- `gyre:beamOn` — 1 subscriber(s)
- `gyre:caught` — 1 subscriber(s)
- `gyre:dropped` — 1 subscriber(s)
- `gyre:full` — 1 subscriber(s)
- `gyre:fuseLow` — 1 subscriber(s)
- `gyre:snagged` — 1 subscriber(s)
- `gyre:strained` — 1 subscriber(s)
- `gyre:thrown` — 1 subscriber(s)
- `gyre:windup` — 1 subscriber(s)
- `heat:clear` — 1 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
- `impoundLot:deskAnswered` — 1 subscriber(s)
- `lanternWard:serviceCommitted` — 1 subscriber(s)
- `law:audit` — 1 subscriber(s)
- `law:custodyAcknowledged` — 1 subscriber(s)
- `law:custodyTransfer` — 2 subscriber(s)
- `law:dispatchStarted` — 1 subscriber(s)
- `law:distressRaised` — 1 subscriber(s)
- `law:fineAssessed` — 2 subscriber(s)
- `law:fineRefused` — 1 subscriber(s)
- `law:impoundPayOffer` — 1 subscriber(s)
- `law:impoundPayRefused` — 1 subscriber(s)
- `law:impoundPosted` — 1 subscriber(s)
- `law:impoundRecovered` — 3 subscriber(s)
- `law:impoundReleased` — 1 subscriber(s)
- `law:impoundWorked` — 1 subscriber(s)
- `law:incidentOpened` — 1 subscriber(s)
- `law:incidentResolved` — 1 subscriber(s)
- `law:killedAdjudicated` — 1 subscriber(s)
- `law:obligationNoted` — 1 subscriber(s)
- `law:obligationPaid` — 2 subscriber(s)
- `law:playerSurrender` — 1 subscriber(s)
- `law:reportIncidentReceipt` — 3 subscriber(s)
- `law:response` — 1 subscriber(s)
- `law:responseDeferred` — 1 subscriber(s)
- `law:sanctuaryWithdrawal` — 1 subscriber(s)
- `law:sponsorPay` — 1 subscriber(s)
- `law:sponsorSettled` — 1 subscriber(s)
- `law:wantedCheckpointBroken` — 1 subscriber(s)
- `law:wantedCheckpointPosted` — 1 subscriber(s)
- `law:wantedSweepEscaped` — 1 subscriber(s)
- `law:wantedWarrantPosted` — 1 subscriber(s)
- `law:wantedWarrantReleased` — 1 subscriber(s)
- `law:witnessChoice` — 1 subscriber(s)
- `lawfulInspection:offered` — 1 subscriber(s)
- `lawfulInspection:resolved` — 1 subscriber(s)
- `lawfulInspection:scanning` — 1 subscriber(s)
- `mission:abandoned` — 1 subscriber(s)
- `moment:holyShit` — 2 subscriber(s)
- `namedAce:fled` — 1 subscriber(s)
- `nav:abortRoute` — 1 subscriber(s)
- `nav:routeBrake` — 1 subscriber(s)
- `npcjobs:approach` — 1 subscriber(s)
- `npcjobs:arrived` — 1 subscriber(s)
- `npcjobs:complete` — 2 subscriber(s)
- `npcjobs:cycle` — 2 subscriber(s)
- `npcjobs:depart` — 1 subscriber(s)
- `npcjobs:hold` — 1 subscriber(s)
- `npcjobs:load` — 2 subscriber(s)
- `npcjobs:unload` — 2 subscriber(s)
- `npcjobs:work` — 1 subscriber(s)
- `optic:rekindled` — 1 subscriber(s)
- `physics:authorityStalled` — 1 subscriber(s)
- `physics:contactsCompleted` — 1 subscriber(s)
- `pirateDisengage:surrenderOffer` — 1 subscriber(s)
- `pirateDisengage:yieldResolved` — 1 subscriber(s)
- `pirateParley:resolved` — 2 subscriber(s)
- `pirateParley:started` — 1 subscriber(s)
- `postEndingReplay:cycleCompleted` — 2 subscriber(s)
- `projectile:bank` — 1 subscriber(s)
- `projectile:ricochet` — 1 subscriber(s)
- `race:abort` — 1 subscriber(s)
- `race:launchFailed` — 1 subscriber(s)
- `race:reset` — 1 subscriber(s)
- `regionalEcology:applied` — 1 subscriber(s)
- `regionalEcology:changed` — 1 subscriber(s)
- `run:arenaIntroComplete` — 1 subscriber(s)
- `run:awarded` — 1 subscriber(s)
- `run:circuitChoiceApplied` — 1 subscriber(s)
- `run:circuitChoiceRequested` — 1 subscriber(s)
- `run:draftLockRequested` — 1 subscriber(s)
- `run:draftRerollRequested` — 1 subscriber(s)
- `run:draftResolved` — 1 subscriber(s)
- `run:ended` — 18 subscriber(s)
- `run:levelUp` — 2 subscriber(s)
- `run:modifierChosen` — 1 subscriber(s)
- `run:modifierRecordRequested` — 1 subscriber(s)
- `run:modifierRecorded` — 1 subscriber(s)
- `run:openingLessonReleased` — 3 subscriber(s)
- `run:refitChanged` — 1 subscriber(s)
- `run:refitClosed` — 1 subscriber(s)
- `run:refitFitRequested` — 1 subscriber(s)
- `run:refitSellRequested` — 1 subscriber(s)
- `run:refitStripRequested` — 1 subscriber(s)
- `run:resultsReady` — 2 subscriber(s)
- `run:retireRequested` — 1 subscriber(s)
- `run:spendRejected` — 1 subscriber(s)
- `run:spendRequested` — 1 subscriber(s)
- `run:spent` — 1 subscriber(s)
- `run:started` — 14 subscriber(s)
- `run:threatRequested` — 1 subscriber(s)
- `run:transitioned` — 6 subscriber(s)
- `run:waveCleared` — 7 subscriber(s)
- `run:waveIntroComplete` — 1 subscriber(s)
- `run:waveMaterialized` — 1 subscriber(s)
- `run:wavePlanFailed` — 1 subscriber(s)
- `run:wavePlanned` — 8 subscriber(s)
- `run:waveProgress` — 1 subscriber(s)
- `run:waveStarted` — 7 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `save:durabilitySettled` — 1 subscriber(s)
- `sectorWonder:secured` — 1 subscriber(s)
- `signal:investigate` — 1 subscriber(s)
- `signal:track` — 1 subscriber(s)
- `story:stuntIncidentRecorded` — 2 subscriber(s)
- `story:stuntIncidentUpdated` — 2 subscriber(s)
- `stunt:trickAmended` — 5 subscriber(s)
- `stunt:trickDetected` — 8 subscriber(s)
- `surrender:escaped` — 1 subscriber(s)
- `surrender:secured` — 1 subscriber(s)
- `surrender:tethered` — 1 subscriber(s)
- `survivalArena:installed` — 2 subscriber(s)
- `survivalArena:released` — 1 subscriber(s)
- `survivorPod:ransomed` — 1 subscriber(s)
- `survivorPod:rescued` — 2 subscriber(s)
- `survivorpod:barrel` — 1 subscriber(s)
- `survivorpod:crashcollar` — 1 subscriber(s)
- `survivorpod:lamp` — 1 subscriber(s)
- `survivorpod:mast` — 1 subscriber(s)
- `survivorpod:nose` — 1 subscriber(s)
- `survivorpod:retroblock` — 1 subscriber(s)
- `survivorpod:viewportglass` — 1 subscriber(s)
- `survivorpod:viewportring` — 1 subscriber(s)
- `swarm:affix` — 1 subscriber(s)
- `swarm:announce` — 1 subscriber(s)
- `swarm:bossDown` — 1 subscriber(s)
- `swarm:bossHp` — 1 subscriber(s)
- `swarm:bossIntro` — 1 subscriber(s)
- `swarm:chain` — 6 subscriber(s)
- `swarm:chainBest` — 1 subscriber(s)
- `swarm:chainBroken` — 5 subscriber(s)
- `swarm:chainShatter` — 1 subscriber(s)
- `swarm:chainTier` — 1 subscriber(s)
- `swarm:fortifyBuildResolved` — 1 subscriber(s)
- `swarm:fortifyState` — 1 subscriber(s)
- `swarm:killPopup` — 2 subscriber(s)
- `swarm:pressureSpend` — 1 subscriber(s)
- `swarm:pressureTelegraph` — 1 subscriber(s)
- `swarm:roundClear` — 1 subscriber(s)
- `swarm:roundSlam` — 1 subscriber(s)
- `swarm:stallReleased` — 1 subscriber(s)
- `swarm:stormDischarge` — 1 subscriber(s)
- `swarmrepair:barrel` — 1 subscriber(s)
- `swarmrepair:crossbar` — 2 subscriber(s)
- `swarmrepair:flange` — 1 subscriber(s)
- `swarmrepair:lid` — 1 subscriber(s)
- `swarmrepair:weldseam` — 1 subscriber(s)
- `tether:detached` — 1 subscriber(s)
- `title:holdResolved` — 1 subscriber(s)
- `traffic:ceresCausalChain` — 1 subscriber(s)
- `travelLanes:slingRingPass` — 1 subscriber(s)
- `ui:buy` — 1 subscriber(s)
- `ui:buyModule` — 2 subscriber(s)
- `ui:closeScreen` — 1 subscriber(s)
- `ui:convoyShareBuy` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:endgameUnfiledJumpConfirm` — 1 subscriber(s)
- `ui:fitModule` — 2 subscriber(s)
- `ui:forwardSlipBuy` — 1 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:restockBombRack` — 1 subscriber(s)
- `ui:sell` — 1 subscriber(s)
- `ui:sellModule` — 1 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `ui:unfitModule` — 1 subscriber(s)
- `understory:buyCover` — 1 subscriber(s)
- `understory:payDebt` — 1 subscriber(s)

## Events with no statically indexed subscriber

- `aftermath:causeExhausted` — 1 emitter(s)
- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:custodyFreight` — 1 emitter(s)
- `aftermath:custodySurvivor` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:siteUnavailable` — 1 emitter(s)
- `ai:egressExit` — 2 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `ai:mayday` — 1 emitter(s)
- `alienEcology:cystRupture` — 1 emitter(s)
- `alienEcology:vented` — 1 emitter(s)
- `ambush:clauseDecided` — 1 emitter(s)
- `ambush:clauseFired` — 1 emitter(s)
- `archive:amnesty` — 2 emitter(s)
- `archive:annotated` — 1 emitter(s)
- `archive:cited` — 1 emitter(s)
- `archive:copyPublished` — 1 emitter(s)
- `archive:copySuppressed` — 1 emitter(s)
- `archive:courierArrived` — 1 emitter(s)
- `archive:courierHail` — 1 emitter(s)
- `archive:courierSpawn` — 1 emitter(s)
- `archive:deskRefused` — 1 emitter(s)
- `archive:errandExpired` — 3 emitter(s)
- `archive:errandPosted` — 2 emitter(s)
- `archive:errandSettled` — 1 emitter(s)
- `archive:expunged` — 2 emitter(s)
- `archive:fieldCastSpawn` — 1 emitter(s)
- `archive:fileCirculated` — 2 emitter(s)
- `archive:folioBought` — 1 emitter(s)
- `archive:folioRecovered` — 1 emitter(s)
- `archive:indexFiled` — 1 emitter(s)
- `archive:indexRead` — 1 emitter(s)
- `archive:logCopied` — 1 emitter(s)
- `archive:markForgiven` — 1 emitter(s)
- `archive:marked` — 1 emitter(s)
- `archive:penance` — 1 emitter(s)
- `archive:redacted` — 1 emitter(s)
- `archive:redactionLifted` — 1 emitter(s)
- `archive:suppressOffered` — 1 emitter(s)
- `archive:tier` — 1 emitter(s)
- `audio:outputDeviceChanged` — 1 emitter(s)
- `automation:assetResumed` — 1 emitter(s)
- `automation:droneDistressed` — 1 emitter(s)
- `automation:droneRecovered` — 1 emitter(s)
- `automation:fleetChanged` — 10 emitter(s)
- `automation:incomeCredited` — 3 emitter(s)
- `automation:interact` — 1 emitter(s)
- `automation:outpostsChanged` — 2 emitter(s)
- `automation:programInterrupted` — 3 emitter(s)
- `automation:reactionAssigned` — 1 emitter(s)
- `automation:reactionCleared` — 1 emitter(s)
- `band:bearingRequest` — 1 emitter(s)
- `band:cycle` — 2 emitter(s)
- `beam:repaired` — 1 emitter(s)
- `beam:transferred` — 1 emitter(s)
- `bombs:denied` — 8 emitter(s)
- `bombs:redirected` — 1 emitter(s)
- `bombs:stockChanged` — 3 emitter(s)
- `borrowedSun:charter` — 1 emitter(s)
- `borrowedSun:collectorsOut` — 1 emitter(s)
- `borrowedSun:contract` — 1 emitter(s)
- `borrowedSun:contractAccepted` — 1 emitter(s)
- `borrowedSun:contractClosed` — 2 emitter(s)
- `borrowedSun:debtEscalated` — 2 emitter(s)
- `borrowedSun:debtPosted` — 1 emitter(s)
- `borrowedSun:debtSettle` — 1 emitter(s)
- `borrowedSun:debtSettled` — 3 emitter(s)
- `borrowedSun:deed` — 1 emitter(s)
- `borrowedSun:freightPosted` — 1 emitter(s)
- `borrowedSun:leaseBeat` — 1 emitter(s)
- `borrowedSun:leaseBuy` — 1 emitter(s)
- `borrowedSun:leaseClosed` — 1 emitter(s)
- `borrowedSun:leaseSold` — 1 emitter(s)
- `borrowedSun:levy` — 1 emitter(s)
- `borrowedSun:lost` — 1 emitter(s)
- `borrowedSun:notice` — 1 emitter(s)
- `borrowedSun:record` — 1 emitter(s)
- `borrowedSun:regard` — 1 emitter(s)
- `borrowedSun:route` — 1 emitter(s)
- `borrowedSun:sailDeployed` — 1 emitter(s)
- `borrowedSun:sailLost` — 1 emitter(s)
- `borrowedSun:shadowFilled` — 1 emitter(s)
- `borrowedSun:shadowLapsed` — 2 emitter(s)
- `borrowedSun:shadowPosted` — 1 emitter(s)
- `borrowedSun:shadowProgress` — 1 emitter(s)
- `borrowedSun:wash` — 1 emitter(s)
- `borrowedVoice:disposition` — 1 emitter(s)
- `borrowedVoice:dispositionAccepted` — 1 emitter(s)
- `borrowedVoice:fragmentRecovered` — 1 emitter(s)
- `bouncer:banned` — 1 emitter(s)
- `bouncer:ejected` — 1 emitter(s)
- `bouncer:muscleHired` — 1 emitter(s)
- `bouncer:muscleShove` — 1 emitter(s)
- `bouncer:muscleStandDown` — 1 emitter(s)
- `bouncer:offense` — 1 emitter(s)
- `bouncer:vipDischarge` — 1 emitter(s)
- `bouncer:vipEarned` — 1 emitter(s)
- `bouncer:wanted` — 1 emitter(s)
- `bouncer:wantedCleared` — 1 emitter(s)
- `bouncer:warned` — 1 emitter(s)
- `bracket:bank` — 1 emitter(s)
- `bracket:matchFinished` — 1 emitter(s)
- `bracket:matchStarted` — 1 emitter(s)
- `bracket:save` — 1 emitter(s)
- `bracket:shotResolved` — 1 emitter(s)
- `bracket:voice` — 1 emitter(s)
- `calendar:festival` — 1 emitter(s)
- `calendar:marketDay` — 1 emitter(s)
- `calendar:rushHour` — 1 emitter(s)
- `calendar:stormSeason` — 1 emitter(s)
- `camera:shake` — 21 emitter(s)
- `camera:zoom` — 5 emitter(s)
- `capitalBoss:actRetried` — 1 emitter(s)
- `capitalBoss:detach` — 1 emitter(s)
- `capitalBoss:plateTorn` — 1 emitter(s)
- `capitalBoss:telegraphEnd` — 3 emitter(s)
- `captain:remembered` — 1 emitter(s)
- `cargo:breakwaterFreightAccepted` — 1 emitter(s)
- `cargo:cinderglassReceived` — 1 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:hotDockSpill` — 1 emitter(s)
- `cargo:jettison` — 1 emitter(s)
- `cargo:parkedTransfer` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `cargo:radiationCooked` — 1 emitter(s)
- `cargo:tallyThreeDelivered` — 1 emitter(s)
- `cargo:vesselFreightReleased` — 1 emitter(s)
- `cargo:volatileCorrosive` — 1 emitter(s)
- `cargo:volatileCryo` — 1 emitter(s)
- `cargo:volatileExposed` — 1 emitter(s)
- `cargo:volatileRupture` — 1 emitter(s)
- `cargo:volatileVent` — 1 emitter(s)
- `ceresWorkfleet:interrupted` — 1 emitter(s)
- `chain:primeEnded` — 1 emitter(s)
- `chain:primed` — 1 emitter(s)
- `chain:tetherShare` — 2 emitter(s)
- `charge:armed` — 1 emitter(s)
- `choir:bellHeadRing` — 1 emitter(s)
- `choir:bellPulse` — 1 emitter(s)
- `choir:blessing` — 1 emitter(s)
- `choir:blessingEnded` — 1 emitter(s)
- `choir:circuitComplete` — 1 emitter(s)
- `choir:crystalShattered` — 1 emitter(s)
- `choir:devotionalYield` — 1 emitter(s)
- `choir:escortComplete` — 1 emitter(s)
- `choir:escortRequest` — 1 emitter(s)
- `choir:heresyLapsed` — 2 emitter(s)
- `choir:heresyMarked` — 1 emitter(s)
- `choir:heresyResolved` — 1 emitter(s)
- `choir:offering` — 1 emitter(s)
- `choir:pilgrimArrived` — 1 emitter(s)
- `choir:pilgrimLeg` — 1 emitter(s)
- `choir:pilgrimLost` — 1 emitter(s)
- `choir:pilgrimSpawn` — 1 emitter(s)
- `choir:pilgrimVisit` — 1 emitter(s)
- `choir:relicAlarm` — 1 emitter(s)
- `choir:relicCracked` — 1 emitter(s)
- `choir:relicPing` — 1 emitter(s)
- `choir:sacrilege` — 1 emitter(s)
- `choir:sanctuary` — 2 emitter(s)
- `choir:siteRaised` — 2 emitter(s)
- `choir:titheAssessed` — 1 emitter(s)
- `choir:tithePaid` — 1 emitter(s)
- `choir:tribute` — 1 emitter(s)
- `cinderglassJob:action` — 1 emitter(s)
- `cinderglassJob:close` — 1 emitter(s)
- `cinderglassJob:fact` — 2 emitter(s)
- `cinderglassJob:offer` — 1 emitter(s)
- `cinderglassJob:servicePrompt` — 2 emitter(s)
- `claim:defenseDelegateRefused` — 1 emitter(s)
- `claim:defenseEncounterRequested` — 1 emitter(s)
- `claim:depotPatrolRotation` — 1 emitter(s)
- `claim:depotPatrolSpent` — 1 emitter(s)
- `claim:depotSupport` — 2 emitter(s)
- `claim:freightDelivered` — 1 emitter(s)
- `claim:infrastructureConstructed` — 2 emitter(s)
- `claim:moduleBuilt` — 1 emitter(s)
- `claim:raidRepelled` — 1 emitter(s)
- `claim:receipt` — 1 emitter(s)
- `claim:specialized` — 1 emitter(s)
- `claim:trophyHeadGranted` — 1 emitter(s)
- `claims:migrated` — 1 emitter(s)
- `coldburnRey:playerDelivered` — 1 emitter(s)
- `coldburnRey:raceSettled` — 1 emitter(s)
- `collector:absorbed` — 1 emitter(s)
- `collector:freed` — 1 emitter(s)
- `collector:lost` — 1 emitter(s)
- `collector:released` — 1 emitter(s)
- `collector:snagged` — 1 emitter(s)
- `combat:actionCancelled` — 1 emitter(s)
- `combat:actionCompleted` — 1 emitter(s)
- `combat:actionPhase` — 1 emitter(s)
- `combat:aftermathChosen` — 1 emitter(s)
- `combat:emp` — 1 emitter(s)
- `combat:hullRepair` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `combat:shipjackPulse` — 1 emitter(s)
- `combat:shipjackShutdown` — 1 emitter(s)
- `comms:message` — 6 emitter(s)
- `concord:clampAttached` — 1 emitter(s)
- `concord:clampReleased` — 1 emitter(s)
- `concord:formationLocked` — 1 emitter(s)
- `concord:formationReformed` — 1 emitter(s)
- `conflict:frontAction` — 1 emitter(s)
- `conflict:warDeclared` — 1 emitter(s)
- `contactHail:availability` — 2 emitter(s)
- `contactHail:clear` — 1 emitter(s)
- `contactHail:handoff` — 1 emitter(s)
- `contactHail:offer` — 1 emitter(s)
- `countermeasure:denied` — 1 emitter(s)
- `counterweightCircuit:action` — 1 emitter(s)
- `counterweightCircuit:attemptStarted` — 1 emitter(s)
- `counterweightCircuit:discovered` — 1 emitter(s)
- `counterweightCircuit:offer` — 1 emitter(s)
- `craft:cancelled` — 1 emitter(s)
- `crew:demandSettled` — 1 emitter(s)
- `crew:hireDenied` — 2 emitter(s)
- `crew:hired` — 1 emitter(s)
- `crew:injured` — 1 emitter(s)
- `crew:lost` — 1 emitter(s)
- `crew:loyalty` — 1 emitter(s)
- `crew:promoted` — 1 emitter(s)
- `crew:quit` — 1 emitter(s)
- `crew:salvage` — 1 emitter(s)
- `crew:strike` — 1 emitter(s)
- `crew:strikeSettled` — 1 emitter(s)
- `crew:wagesPaid` — 1 emitter(s)
- `cruise:wrestleEscaped` — 1 emitter(s)
- `cruise:wrestleStarted` — 1 emitter(s)
- `derby:finished` — 1 emitter(s)
- `derby:slam` — 2 emitter(s)
- `detonator:detonated` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `discovery:chartFiled` — 1 emitter(s)
- `docket:delivered` — 1 emitter(s)
- `docket:met` — 2 emitter(s)
- `docket:voice` — 1 emitter(s)
- `drift:claimContested` — 1 emitter(s)
- `drift:claimLifted` — 1 emitter(s)
- `drift:claimStaked` — 1 emitter(s)
- `drill:chargeArm` — 3 emitter(s)
- `ecology:claimCrew` — 1 emitter(s)
- `ecology:coherence` — 1 emitter(s)
- `ecology:collar` — 1 emitter(s)
- `ecology:fossilRecorded` — 1 emitter(s)
- `ecology:fossilSettled` — 1 emitter(s)
- `ecology:setpiece` — 3 emitter(s)
- `economy:auditorTally` — 1 emitter(s)
- `economy:coldChainArmed` — 1 emitter(s)
- `economy:coldChainSpoiled` — 1 emitter(s)
- `economy:convoyShareBought` — 1 emitter(s)
- `economy:convoyShareSettled` — 2 emitter(s)
- `economy:debtEscalated` — 1 emitter(s)
- `economy:demandShift` — 1 emitter(s)
- `economy:eventEnded` — 1 emitter(s)
- `economy:eventStarted` — 1 emitter(s)
- `economy:forwardSlipBought` — 1 emitter(s)
- `economy:forwardSlipSettled` — 2 emitter(s)
- `economy:marketContractExpired` — 2 emitter(s)
- `economy:podIntakeAccepted` — 2 emitter(s)
- `economy:shortageRepairRestored` — 1 emitter(s)
- `encounter:claimDefenseRoster` — 1 emitter(s)
- `encounter:convoyEscorted` — 1 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:hostileCommitted` — 4 emitter(s)
- `encounter:lootSweepCollected` — 1 emitter(s)
- `encounter:lootSweepDispatched` — 1 emitter(s)
- `encounter:lootSweepEnded` — 1 emitter(s)
- `encounter:namedCaptainDefeated` — 2 emitter(s)
- `encounter:predationCleared` — 1 emitter(s)
- `encounter:scarcityRumor` — 1 emitter(s)
- `encounter:stale` — 1 emitter(s)
- `encounter:voice` — 1 emitter(s)
- `endgame:finaleCompleted` — 1 emitter(s)
- `endgame:finaleReady` — 1 emitter(s)
- `endgame:ineligible` — 4 emitter(s)
- `endgame:promptChoiceC` — 1 emitter(s)
- `endgame:promptChoiceD` — 1 emitter(s)
- `endgame:promptSandbox` — 1 emitter(s)
- `erisChoir:drinkReceipt` — 1 emitter(s)
- `escalation:arrived` — 1 emitter(s)
- `escalation:seeded` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `factionPresence:berthGreeting` — 1 emitter(s)
- `factionPresence:berthReturned` — 1 emitter(s)
- `factionPresence:berthRobbed` — 1 emitter(s)
- `factionPresence:conduct` — 2 emitter(s)
- `factionPresence:service` — 1 emitter(s)
- `factionPresence:serviceAction` — 1 emitter(s)
- `factionPresence:spawned` — 3 emitter(s)
- `field:opportunity` — 1 emitter(s)
- `fields:deployDenied` — 1 emitter(s)
- `fields:hitchCut` — 1 emitter(s)
- `fields:hitchLatched` — 1 emitter(s)
- `fields:pullMarked` — 1 emitter(s)
- `fields:thermalCreated` — 1 emitter(s)
- `fields:thermalHit` — 1 emitter(s)
- `firsthour:beat` — 1 emitter(s)
- `firsthour:complete` — 1 emitter(s)
- `firsthour:sentence` — 1 emitter(s)
- `firsthour:started` — 1 emitter(s)
- `firsthour:verb` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `flight:sweptHull` — 1 emitter(s)
- `formation:discovered` — 1 emitter(s)
- `freight:custodyRebound` — 1 emitter(s)
- `freight:custodyReceipt` — 2 emitter(s)
- `freight:gratitudeGift` — 1 emitter(s)
- `freight:lootSweepStarted` — 1 emitter(s)
- `freight:sweeperEscaped` — 1 emitter(s)
- `frontier:debtLapsed` — 1 emitter(s)
- `frontier:debtPosted` — 1 emitter(s)
- `frontier:debtSettled` — 1 emitter(s)
- `frontier:deed` — 1 emitter(s)
- `frontier:defenseCalled` — 1 emitter(s)
- `frontier:defenseCleared` — 1 emitter(s)
- `frontier:defenseFailed` — 1 emitter(s)
- `frontier:disputeJumped` — 1 emitter(s)
- `frontier:disputeLapsed` — 1 emitter(s)
- `frontier:disputePosted` — 1 emitter(s)
- `frontier:disputeSettled` — 1 emitter(s)
- `frontier:homesteadLost` — 1 emitter(s)
- `frontier:jobTier` — 1 emitter(s)
- `frontier:justiceFiled` — 1 emitter(s)
- `frontier:leadPosted` — 1 emitter(s)
- `frontier:leadSoured` — 1 emitter(s)
- `frontier:leadVerified` — 1 emitter(s)
- `frontier:missionAttemptStarted` — 1 emitter(s)
- `frontier:moduleRestocked` — 1 emitter(s)
- `frontier:raidSpawned` — 1 emitter(s)
- `frontier:raiderRepelled` — 2 emitter(s)
- `frontier:steadStruck` — 1 emitter(s)
- `frontier:supplyDelivered` — 1 emitter(s)
- `frontier:supplyRunAsked` — 2 emitter(s)
- `frontier:trafficTick` — 1 emitter(s)
- `frontier:vendettaLapsed` — 1 emitter(s)
- `frontier:vendettaPaid` — 1 emitter(s)
- `frontier:vendettaPosted` — 1 emitter(s)
- `frontier:welded` — 1 emitter(s)
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:blackMarketAccess` — 1 emitter(s)
- `frontierRumor:contacted` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `fuel:changed` — 9 emitter(s)
- `fulfillment:boardingDocked` — 1 emitter(s)
- `fulfillment:boardingFlung` — 1 emitter(s)
- `fulfillment:cargoFiled` — 1 emitter(s)
- `fulfillment:derailed` — 1 emitter(s)
- `fulfillment:hitchhike` — 1 emitter(s)
- `fulfillment:orderOneClosed` — 1 emitter(s)
- `fulfillment:rerailed` — 1 emitter(s)
- `fulfillment:trainSpawned` — 1 emitter(s)
- `game:embarkSpeculation` — 3 emitter(s)
- `gamepad:connected` — 1 emitter(s)
- `gamepad:disconnected` — 1 emitter(s)
- `gateThree:bondLapsed` — 1 emitter(s)
- `gateThree:bonded` — 1 emitter(s)
- `gateThree:contested` — 2 emitter(s)
- `gateThree:evaded` — 1 emitter(s)
- `gateThree:inspection` — 1 emitter(s)
- `gateThree:laneWeighed` — 1 emitter(s)
- `gateThree:logged` — 3 emitter(s)
- `gateThree:maintenance` — 1 emitter(s)
- `gateThree:weighed` — 2 emitter(s)
- `gravedigger:claimClosed` — 4 emitter(s)
- `gravedigger:claimLapsed` — 1 emitter(s)
- `gravedigger:claimPosted` — 1 emitter(s)
- `gravedigger:claimRobbed` — 1 emitter(s)
- `gravedigger:claimYielded` — 1 emitter(s)
- `gravedigger:forgiven` — 1 emitter(s)
- `gravedigger:graveDesecrated` — 1 emitter(s)
- `gravedigger:graveNamed` — 1 emitter(s)
- `gravedigger:grudged` — 1 emitter(s)
- `gravedigger:kinSlain` — 1 emitter(s)
- `gravedigger:offering` — 1 emitter(s)
- `gravedigger:pitRefused` — 1 emitter(s)
- `gravedigger:portionPaid` — 1 emitter(s)
- `gravedigger:standing` — 1 emitter(s)
- `gravedigger:verdictFiled` — 1 emitter(s)
- `gravedigger:vigilBegun` — 1 emitter(s)
- `gravedigger:vigilDeparting` — 1 emitter(s)
- `gravedigger:vigilInbound` — 1 emitter(s)
- `gravedigger:vigilPosted` — 1 emitter(s)
- `heist:capsuleResumed` — 1 emitter(s)
- `heist:counterweightSceneReceipt` — 4 emitter(s)
- `heist:launchCue` — 2 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:observed` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `heist:routineReceipt` — 1 emitter(s)
- `helix:appealHeard` — 2 emitter(s)
- `helix:auditBegun` — 1 emitter(s)
- `helix:auditEvaded` — 1 emitter(s)
- `helix:auditRuled` — 1 emitter(s)
- `helix:deed` — 1 emitter(s)
- `helix:deskFiled` — 1 emitter(s)
- `helix:deskLost` — 1 emitter(s)
- `helix:fineOverdue` — 1 emitter(s)
- `helix:finePaid` — 1 emitter(s)
- `helix:finePosted` — 1 emitter(s)
- `helix:flagsDropped` — 1 emitter(s)
- `helix:garnished` — 1 emitter(s)
- `helix:lienFiled` — 1 emitter(s)
- `helix:lienScraped` — 2 emitter(s)
- `helix:lienStuck` — 1 emitter(s)
- `helix:manifestFiled` — 1 emitter(s)
- `helix:noticeJumped` — 1 emitter(s)
- `helix:noticeLapsed` — 9 emitter(s)
- `helix:noticePosted` — 1 emitter(s)
- `helix:noticeVerified` — 1 emitter(s)
- `helix:precedent` — 1 emitter(s)
- `helix:tier` — 1 emitter(s)
- `helix:verdictFiled` — 1 emitter(s)
- `helix:warrantEscalated` — 1 emitter(s)
- `helix:warrantPosted` — 1 emitter(s)
- `helix:warrantSettled` — 1 emitter(s)
- `helix:writLevy` — 1 emitter(s)
- `helix:writSpawned` — 1 emitter(s)
- `history:deadNoted` — 1 emitter(s)
- `hud:firstUse` — 3 emitter(s)
- `hud:phase` — 4 emitter(s)
- `hud:recallObjective` — 1 emitter(s)
- `hud:slotClaim` — 1 emitter(s)
- `hud:slotRelease` — 1 emitter(s)
- `hud:tagFlicker` — 1 emitter(s)
- `hullBurst:activated` — 1 emitter(s)
- `hullBurst:ended` — 1 emitter(s)
- `hullBurst:released` — 1 emitter(s)
- `ilexArk:accepted` — 1 emitter(s)
- `ilexArk:finished` — 1 emitter(s)
- `ilexArk:harvested` — 1 emitter(s)
- `ilexArk:vaultDelivered` — 1 emitter(s)
- `ilexArk:vaultReleased` — 1 emitter(s)
- `impoundGrudge:escalated` — 1 emitter(s)
- `impoundGrudge:offer` — 1 emitter(s)
- `impoundGrudge:offerRefused` — 1 emitter(s)
- `impoundGrudge:resolved` — 1 emitter(s)
- `impoundGrudge:sabotage` — 1 emitter(s)
- `impoundGrudge:settled` — 1 emitter(s)
- `impoundGrudge:surfaced` — 1 emitter(s)
- `impoundGrudge:surfacingEnded` — 1 emitter(s)
- `impoundGrudge:tracked` — 1 emitter(s)
- `industrialDisasters:commandRejected` — 1 emitter(s)
- `industrialDisasters:consequence` — 1 emitter(s)
- `industrialDisasters:discover` — 1 emitter(s)
- `industrialDisasters:event` — 1 emitter(s)
- `industrialDisasters:inspect` — 2 emitter(s)
- `industrialDisasters:poses` — 1 emitter(s)
- `industrialDisasters:signal` — 1 emitter(s)
- `industrialDisasters:status` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `intervention:jumperRipped` — 1 emitter(s)
- `intervention:logged` — 1 emitter(s)
- `jump:interdictionWarning` — 1 emitter(s)
- `kilnback:caskReleased` — 1 emitter(s)
- `kilnback:caskSalvaged` — 1 emitter(s)
- `kilnback:coolantReleased` — 1 emitter(s)
- `kilnback:phase` — 1 emitter(s)
- `lamplighter:amends` — 1 emitter(s)
- `lamplighter:askLapsed` — 2 emitter(s)
- `lamplighter:askPosted` — 1 emitter(s)
- `lamplighter:askSoured` — 1 emitter(s)
- `lamplighter:askVerified` — 1 emitter(s)
- `lamplighter:favor` — 1 emitter(s)
- `lamplighter:forgiven` — 1 emitter(s)
- `lamplighter:grudge` — 1 emitter(s)
- `lamplighter:guttered` — 1 emitter(s)
- `lamplighter:keeperTier` — 1 emitter(s)
- `lamplighter:lampSiphoned` — 1 emitter(s)
- `lamplighter:lampTended` — 1 emitter(s)
- `lamplighter:logged` — 1 emitter(s)
- `lamplighter:oilPodDropped` — 1 emitter(s)
- `lamplighter:oilSold` — 1 emitter(s)
- `lamplighter:oiled` — 1 emitter(s)
- `lamplighter:planted` — 1 emitter(s)
- `lamplighter:rimPaid` — 1 emitter(s)
- `lamplighter:snufferDowned` — 1 emitter(s)
- `lamplighter:snufferInbound` — 1 emitter(s)
- `lamplighter:spurned` — 1 emitter(s)
- `lamplighter:wayfarerArrived` — 1 emitter(s)
- `lamplighter:wayfarerInbound` — 1 emitter(s)
- `lamplighter:wayfarerLost` — 1 emitter(s)
- `lamplighter:wayfarerTurned` — 1 emitter(s)
- `lane:facadeMiss` — 1 emitter(s)
- `lastShift:archive` — 2 emitter(s)
- `lastShift:archived` — 1 emitter(s)
- `lastShift:cancelRecovery` — 1 emitter(s)
- `lastShift:cueSurfaced` — 1 emitter(s)
- `lastShift:readRecovery` — 2 emitter(s)
- `lastShift:recorderReturned` — 1 emitter(s)
- `lastShift:recover` — 1 emitter(s)
- `lastShift:returnRecorder` — 1 emitter(s)
- `law:warrantIssued` — 1 emitter(s)
- `line:classChanged` — 1 emitter(s)
- `line:recordStamped` — 1 emitter(s)
- `lineHead:breakerSplit` — 1 emitter(s)
- `lineHead:sealed` — 1 emitter(s)
- `lineHead:stapled` — 1 emitter(s)
- `lossInvestigation:closed` — 1 emitter(s)
- `lossLedger:priceMove` — 1 emitter(s)
- `machine:appealAccepted` — 1 emitter(s)
- `machine:jurisdictionResolved` — 1 emitter(s)
- `machine:repairCompleted` — 2 emitter(s)
- `machine:tokenDelivered` — 2 emitter(s)
- `machine:workpiecePlaced` — 1 emitter(s)
- `mail:delivered` — 1 emitter(s)
- `manifest:completed` — 1 emitter(s)
- `massSeed:cleared` — 1 emitter(s)
- `massSeed:deployDenied` — 1 emitter(s)
- `massSeed:destroyed` — 1 emitter(s)
- `massline:bridleEndpointSelected` — 1 emitter(s)
- `massline:bridleLinked` — 1 emitter(s)
- `massline:bridleSetupEnded` — 1 emitter(s)
- `massline:cadenceChanged` — 1 emitter(s)
- `massline:npcLineCut` — 1 emitter(s)
- `massline:recovered` — 1 emitter(s)
- `massline:recovering` — 1 emitter(s)
- `mercyService:completed` — 1 emitter(s)
- `mercyService:failedForward` — 1 emitter(s)
- `mercyService:order` — 1 emitter(s)
- `mercyService:started` — 1 emitter(s)
- `mercyService:tool` — 1 emitter(s)
- `mercyService:toolResult` — 1 emitter(s)
- `meridian:accountCharged` — 1 emitter(s)
- `meridian:accountPaid` — 1 emitter(s)
- `meridian:accountWarned` — 1 emitter(s)
- `meridian:assessmentCharged` — 1 emitter(s)
- `meridian:blacklistLifted` — 1 emitter(s)
- `meridian:blacklisted` — 2 emitter(s)
- `meridian:claimPosted` — 1 emitter(s)
- `meridian:claimSettled` — 1 emitter(s)
- `meridian:claimStolen` — 1 emitter(s)
- `meridian:containerRecoupled` — 1 emitter(s)
- `meridian:containerSold` — 1 emitter(s)
- `meridian:contractDefaulted` — 1 emitter(s)
- `meridian:contractDelivered` — 1 emitter(s)
- `meridian:contractExpired` — 1 emitter(s)
- `meridian:contractPosted` — 1 emitter(s)
- `meridian:contractTaken` — 1 emitter(s)
- `meridian:convoyArrived` — 1 emitter(s)
- `meridian:convoyDeparted` — 1 emitter(s)
- `meridian:convoyLost` — 1 emitter(s)
- `meridian:convoyRaided` — 1 emitter(s)
- `meridian:couplerSnapped` — 1 emitter(s)
- `meridian:deed` — 1 emitter(s)
- `meridian:escortAsked` — 1 emitter(s)
- `meridian:escortSigned` — 1 emitter(s)
- `meridian:levyCollected` — 1 emitter(s)
- `meridian:raiderPlucked` — 1 emitter(s)
- `meridian:raiderRepelled` — 1 emitter(s)
- `meridian:refused` — 1 emitter(s)
- `meridian:repoFielded` — 1 emitter(s)
- `meridian:tickerFloor` — 1 emitter(s)
- `meridian:tier` — 1 emitter(s)
- `meridian:verdictFiled` — 1 emitter(s)
- `meridian:warrantLapsed` — 1 emitter(s)
- `meridian:warrantPaid` — 1 emitter(s)
- `meridian:warrantPosted` — 1 emitter(s)
- `meridian:writPosted` — 1 emitter(s)
- `meridian:writSettled` — 1 emitter(s)
- `mines:expired` — 1 emitter(s)
- `mines:released` — 2 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mines:turned` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:podSplit` — 1 emitter(s)
- `missile:guidanceLost` — 1 emitter(s)
- `mission:conditionBroken` — 2 emitter(s)
- `mission:conditionPending` — 1 emitter(s)
- `mission:conditionProgress` — 2 emitter(s)
- `mission:gateCleared` — 2 emitter(s)
- `mission:setPieceTravelLine` — 1 emitter(s)
- `mission:spawnDeferred` — 1 emitter(s)
- `mission:targetsProjected` — 1 emitter(s)
- `module:granted` — 3 emitter(s)
- `module:sold` — 1 emitter(s)
- `moisture:loss` — 1 emitter(s)
- `morrow:launch` — 1 emitter(s)
- `morrow:met` — 1 emitter(s)
- `morrow:voice` — 1 emitter(s)
- `mothlight:lampReleased` — 1 emitter(s)
- `mothlight:phase` — 1 emitter(s)
- `namedAce:appeared` — 1 emitter(s)
- `nemesis:encounterRejected` — 1 emitter(s)
- `nemesis:encounterStarted` — 1 emitter(s)
- `nemesis:escaped` — 1 emitter(s)
- `nemesis:spare` — 1 emitter(s)
- `nest:waspsLaunched` — 1 emitter(s)
- `news:headline` — 9 emitter(s)
- `news:publish` — 49 emitter(s)
- `news:render` — 1 emitter(s)
- `npcjobs:closeCall` — 1 emitter(s)
- `npcjobs:crewResponse` — 1 emitter(s)
- `npcjobs:errand` — 1 emitter(s)
- `npcjobs:lotReplaced` — 1 emitter(s)
- `npcjobs:oncallTenderRetired` — 1 emitter(s)
- `npcjobs:resumed` — 1 emitter(s)
- `npcjobs:surveyMarked` — 1 emitter(s)
- `npcjobs:yardDispatchDone` — 1 emitter(s)
- `occupation:delivered` — 1 emitter(s)
- `occupation:licensed` — 1 emitter(s)
- `occupation:lost` — 2 emitter(s)
- `occupation:recommissioned` — 1 emitter(s)
- `occupation:settled` — 1 emitter(s)
- `occupation:switched` — 1 emitter(s)
- `onboarding:drillFolded` — 1 emitter(s)
- `onboarding:rangePrompt` — 3 emitter(s)
- `onboarding:rosterPrewarm` — 1 emitter(s)
- `onboarding:swingClinic` — 1 emitter(s)
- `optic:beamContact` — 1 emitter(s)
- `orrinWitness:evidenceRecovered` — 1 emitter(s)
- `orrinWitness:submitted` — 1 emitter(s)
- `pallas:shift` — 1 emitter(s)
- `pallasHiddenCache:cargoChanged` — 1 emitter(s)
- `pallasHiddenCache:clueRecovered` — 1 emitter(s)
- `pallasHiddenCache:pickupReady` — 1 emitter(s)
- `palletJack:drop` — 1 emitter(s)
- `palletJack:lost` — 1 emitter(s)
- `palletJack:phase` — 1 emitter(s)
- `palletJack:released` — 1 emitter(s)
- `palletJack:trail` — 1 emitter(s)
- `patrolBait:cleared` — 1 emitter(s)
- `patrolBait:opened` — 1 emitter(s)
- `patrolBait:voice` — 1 emitter(s)
- `pirateDisengage:verdict` — 1 emitter(s)
- `pitborn:ballastAccreted` — 1 emitter(s)
- `pitborn:ballastHorn` — 1 emitter(s)
- `pitborn:ballastNamed` — 1 emitter(s)
- `pitborn:ballastStart` — 1 emitter(s)
- `pitborn:blacklistLifted` — 1 emitter(s)
- `pitborn:blacklisted` — 1 emitter(s)
- `pitborn:claimExtracted` — 1 emitter(s)
- `pitborn:claimFiled` — 1 emitter(s)
- `pitborn:claimForeclosed` — 1 emitter(s)
- `pitborn:claimJumped` — 1 emitter(s)
- `pitborn:claimLapsed` — 1 emitter(s)
- `pitborn:claimSold` — 1 emitter(s)
- `pitborn:collectorDown` — 1 emitter(s)
- `pitborn:collectorsOut` — 1 emitter(s)
- `pitborn:crowdStyle` — 1 emitter(s)
- `pitborn:crowdTier` — 1 emitter(s)
- `pitborn:cullSettled` — 1 emitter(s)
- `pitborn:debtDueSoon` — 1 emitter(s)
- `pitborn:debtEscalated` — 1 emitter(s)
- `pitborn:debtPaid` — 1 emitter(s)
- `pitborn:debtPosted` — 1 emitter(s)
- `pitborn:debtSettled` — 1 emitter(s)
- `pitborn:debtWrittenOff` — 1 emitter(s)
- `pitborn:deed` — 1 emitter(s)
- `pitborn:dividend` — 1 emitter(s)
- `pitborn:fined` — 1 emitter(s)
- `pitborn:levyCollected` — 1 emitter(s)
- `pitborn:marketBought` — 1 emitter(s)
- `pitborn:marketDelisted` — 5 emitter(s)
- `pitborn:marketListed` — 2 emitter(s)
- `pitborn:quotaPosted` — 1 emitter(s)
- `pitborn:quotaProgress` — 1 emitter(s)
- `pitborn:quotaSettled` — 1 emitter(s)
- `pitborn:refused` — 1 emitter(s)
- `pitborn:scoreboard` — 1 emitter(s)
- `pitborn:shareBought` — 1 emitter(s)
- `pitborn:shareSold` — 1 emitter(s)
- `pitborn:suspicionFiled` — 1 emitter(s)
- `pitborn:suspicionWarned` — 1 emitter(s)
- `pitborn:tier` — 1 emitter(s)
- `pitborn:yardmasterDown` — 1 emitter(s)
- `pitborn:yardmasterStripped` — 1 emitter(s)
- `planet:npcHarvest` — 1 emitter(s)
- `planet:registered` — 1 emitter(s)
- `planet:unregistered` — 1 emitter(s)
- `presentation:audioCue` — 3 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:caption` — 14 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 2 emitter(s)
- `quiet:routeSold` — 1 emitter(s)
- `quill:archiveRebound` — 1 emitter(s)
- `quill:errandAnswered` — 1 emitter(s)
- `quill:errandArmed` — 1 emitter(s)
- `quill:folioBurned` — 1 emitter(s)
- `quill:folioMinted` — 1 emitter(s)
- `quill:folioSeized` — 1 emitter(s)
- `quill:folioSold` — 1 emitter(s)
- `quill:forgeryDetected` — 1 emitter(s)
- `quill:redactorKilled` — 1 emitter(s)
- `quill:redactorSpawned` — 1 emitter(s)
- `quill:redactorWithdrew` — 1 emitter(s)
- `race:ended` — 1 emitter(s)
- `race:restarted` — 1 emitter(s)
- `race:toggleView` — 2 emitter(s)
- `ravel:cast` — 1 emitter(s)
- `ravel:destroyed` — 1 emitter(s)
- `ravel:hit` — 1 emitter(s)
- `ravel:pacified` — 1 emitter(s)
- `ravel:telegraph` — 1 emitter(s)
- `ravel:unthreaded` — 1 emitter(s)
- `ravel:voice` — 1 emitter(s)
- `reach:trophyHung` — 1 emitter(s)
- `recovery:choose` — 1 emitter(s)
- `recovery:vent` — 1 emitter(s)
- `redKite:aborted` — 1 emitter(s)
- `redKite:course` — 1 emitter(s)
- `redKite:finished` — 1 emitter(s)
- `redKite:start` — 1 emitter(s)
- `redKite:started` — 1 emitter(s)
- `rescue:beat` — 2 emitter(s)
- `rescue:complete` — 1 emitter(s)
- `rescuedWorker:returned` — 1 emitter(s)
- `resonance:patrolQueued` — 1 emitter(s)
- `rhythm:phase` — 1 emitter(s)
- `rigWorkshop:changed` — 1 emitter(s)
- `rigWorkshop:delivered` — 1 emitter(s)
- `rigWorkshop:feedback` — 1 emitter(s)
- `rigWorkshop:prompt` — 1 emitter(s)
- `rigWorkshop:promptClosed` — 1 emitter(s)
- `rookWreck:appraised` — 1 emitter(s)
- `rookWreck:countered` — 1 emitter(s)
- `rookWreck:disputeFiled` — 1 emitter(s)
- `rookWreck:offerLapsed` — 1 emitter(s)
- `rookWreck:padRefused` — 1 emitter(s)
- `rubric:destroyed` — 1 emitter(s)
- `rubric:last` — 1 emitter(s)
- `rubric:marked` — 1 emitter(s)
- `rubric:voice` — 1 emitter(s)
- `ruckus:pulse` — 1 emitter(s)
- `ruckus:retrieved` — 1 emitter(s)
- `ruckus:state` — 1 emitter(s)
- `ruckus:voice` — 1 emitter(s)
- `run:roleProblemStamped` — 1 emitter(s)
- `ruud:cut` — 1 emitter(s)
- `ruud:spared` — 1 emitter(s)
- `ruud:stamp` — 1 emitter(s)
- `ruud:voice` — 2 emitter(s)
- `sable:demonstrated` — 1 emitter(s)
- `salvage:actionRead` — 1 emitter(s)
- `salvage:cookerFlight` — 1 emitter(s)
- `salvage:coreDetonated` — 1 emitter(s)
- `salvage:reactorBurst` — 1 emitter(s)
- `salvage:reactorVented` — 1 emitter(s)
- `salvage:sortDelivered` — 1 emitter(s)
- `salvage:sortImpact` — 1 emitter(s)
- `salvage:sortLost` — 1 emitter(s)
- `salvage:sortSeparated` — 1 emitter(s)
- `salvageOutfits:agreement` — 1 emitter(s)
- `salvageOutfits:choose` — 1 emitter(s)
- `salvageOutfits:completed` — 1 emitter(s)
- `salvageOutfits:delivered` — 1 emitter(s)
- `salvageOutfits:mistake` — 1 emitter(s)
- `salvageOutfits:offer` — 3 emitter(s)
- `salvageOutfits:offerClosed` — 1 emitter(s)
- `salvageOutfits:radio` — 1 emitter(s)
- `salvageOutfits:started` — 1 emitter(s)
- `salvageTender:action` — 1 emitter(s)
- `salvageTender:close` — 1 emitter(s)
- `salvageTender:disabled` — 1 emitter(s)
- `salvageTender:discovered` — 1 emitter(s)
- `salvageTender:offer` — 1 emitter(s)
- `salvageTender:rackReleased` — 1 emitter(s)
- `salvageTender:reset` — 2 emitter(s)
- `salvageWatch:repairWork` — 1 emitter(s)
- `save:restoreCommitted` — 1 emitter(s)
- `scan:weakPoint` — 1 emitter(s)
- `scanner:ghostRevealed` — 1 emitter(s)
- `scenario:actorBindings` — 1 emitter(s)
- `scenario:dialogueLine` — 1 emitter(s)
- `scenario:factChanged` — 1 emitter(s)
- `scenario:factsInitialized` — 1 emitter(s)
- `scenario:loaded` — 1 emitter(s)
- `scenario:safeOpeningDemand` — 1 emitter(s)
- `sector:membershipCandidate` — 1 emitter(s)
- `sector:physicalLaw` — 1 emitter(s)
- `sectorsim:tick` — 1 emitter(s)
- `sensors:playerLit` — 1 emitter(s)
- `sensors:playerSignature` — 1 emitter(s)
- `sensors:playerUnlit` — 1 emitter(s)
- `sensors:quietCoast` — 2 emitter(s)
- `sensors:signatureLost` — 2 emitter(s)
- `sensors:signatureReport` — 1 emitter(s)
- `sensors:signatureResolved` — 1 emitter(s)
- `service:decanted` — 1 emitter(s)
- `service:progress` — 1 emitter(s)
- `service:queued` — 1 emitter(s)
- `setPiece:staged` — 1 emitter(s)
- `settings:restored` — 1 emitter(s)
- `shieldPylon:active` — 1 emitter(s)
- `shieldPylon:contact` — 1 emitter(s)
- `shieldPylon:denied` — 1 emitter(s)
- `shieldPylon:intercepted` — 1 emitter(s)
- `shieldPylon:linking` — 1 emitter(s)
- `shieldPylon:overloaded` — 1 emitter(s)
- `shieldPylon:placed` — 2 emitter(s)
- `shieldPylon:recovered` — 1 emitter(s)
- `shieldPylon:retired` — 1 emitter(s)
- `shieldPylon:strained` — 1 emitter(s)
- `shieldPylon:warning` — 1 emitter(s)
- `ship:berthSwitching` — 1 emitter(s)
- `ship:cargoCapChanged` — 1 emitter(s)
- `ship:controlTransferred` — 1 emitter(s)
- `ship:loadoutPresetDeleted` — 1 emitter(s)
- `ship:loadoutPresetSaved` — 1 emitter(s)
- `ship:massChanged` — 1 emitter(s)
- `ship:parkedHoldSwap` — 2 emitter(s)
- `ship:released` — 1 emitter(s)
- `ship:sold` — 1 emitter(s)
- `shipbreakingYard:action` — 1 emitter(s)
- `shipbreakingYard:close` — 1 emitter(s)
- `shipbreakingYard:delivered` — 1 emitter(s)
- `shipbreakingYard:offer` — 6 emitter(s)
- `shipbreakingYard:receipt` — 1 emitter(s)
- `shipbreakingYard:view` — 1 emitter(s)
- `shipjack:actionCommitted` — 1 emitter(s)
- `shipjack:claimResolved` — 2 emitter(s)
- `shipjack:cue` — 1 emitter(s)
- `shipjack:destroyed` — 1 emitter(s)
- `shipjack:distress` — 1 emitter(s)
- `shipjack:fleetArrived` — 1 emitter(s)
- `shipjack:fleetDeparted` — 1 emitter(s)
- `shipjack:fleetPickedUp` — 1 emitter(s)
- `shipjack:fleetReceipt` — 1 emitter(s)
- `shipjack:fleetStarted` — 1 emitter(s)
- `shipjack:inspection` — 1 emitter(s)
- `shipjack:opportunity` — 1 emitter(s)
- `shipjack:result` — 1 emitter(s)
- `shipjack:route` — 1 emitter(s)
- `shipjack:settled` — 1 emitter(s)
- `shipjack:yardCompleted` — 2 emitter(s)
- `shipjack:yardReceipt` — 2 emitter(s)
- `shipjack:yardStarted` — 1 emitter(s)
- `signal:receipt` — 1 emitter(s)
- `site:anchored` — 1 emitter(s)
- `site:chargePressed` — 1 emitter(s)
- `site:claimContested` — 1 emitter(s)
- `site:courierDelivered` — 1 emitter(s)
- `site:courierLost` — 1 emitter(s)
- `site:created` — 1 emitter(s)
- `site:laneSpilled` — 2 emitter(s)
- `site:machineMode` — 1 emitter(s)
- `site:podBuilt` — 1 emitter(s)
- `site:rematerialized` — 1 emitter(s)
- `site:signatureBand` — 1 emitter(s)
- `siteEvidence:closed` — 7 emitter(s)
- `siteEvidence:offer` — 3 emitter(s)
- `siteEvidence:result` — 2 emitter(s)
- `slate:columnRead` — 1 emitter(s)
- `slate:spike` — 1 emitter(s)
- `solstice:bloom` — 1 emitter(s)
- `solstice:charged` — 1 emitter(s)
- `solstice:destroyed` — 1 emitter(s)
- `solstice:voice` — 1 emitter(s)
- `special500:karaokeHeard` — 1 emitter(s)
- `special500:portraitCommission` — 3 emitter(s)
- `spectrum:focus` — 1 emitter(s)
- `spectrum:resolved` — 1 emitter(s)
- `station:berthAssigned` — 1 emitter(s)
- `station:blockade` — 1 emitter(s)
- `station:boom` — 1 emitter(s)
- `station:grudge` — 1 emitter(s)
- `station:grudgeCleared` — 1 emitter(s)
- `station:holding` — 1 emitter(s)
- `station:marketTradeIntentRetired` — 1 emitter(s)
- `station:marketTradeReceiptRecovered` — 1 emitter(s)
- `station:navigate` — 5 emitter(s)
- `station:strike` — 1 emitter(s)
- `station:yardChanged` — 1 emitter(s)
- `stationContact:changed` — 5 emitter(s)
- `stationContact:counterChanged` — 2 emitter(s)
- `stationContact:counterDelta` — 1 emitter(s)
- `stationContact:manifestWon` — 1 emitter(s)
- `stationLife:deedNoticed` — 1 emitter(s)
- `stationLife:trafficChanged` — 3 emitter(s)
- `story:continuationAccess` — 1 emitter(s)
- `story:varianceSeamFailed` — 1 emitter(s)
- `story:vergeObserversRevealed` — 1 emitter(s)
- `stunt:arenaLawBounty` — 1 emitter(s)
- `survivalArena:rosterPrewarm` — 1 emitter(s)
- `survivorPod:huntDispatched` — 1 emitter(s)
- `survivorPod:huntEnded` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:resolved` — 1 emitter(s)
- `survivorPod:stripBlocked` — 1 emitter(s)
- `swarm:broodBurst` — 2 emitter(s)
- `swarm:broodProjectileHit` — 1 emitter(s)
- `swarm:broodRemains` — 1 emitter(s)
- `swarm:broodRemainsSpent` — 1 emitter(s)
- `swarm:broodReserve` — 1 emitter(s)
- `swarm:broodShielded` — 1 emitter(s)
- `swarm:broodTeslaHit` — 1 emitter(s)
- `swarm:fortifyBuildRequested` — 1 emitter(s)
- `swarm:fortifyReloadRequested` — 1 emitter(s)
- `swarm:fortifyRepairRequested` — 1 emitter(s)
- `swarm:fortifyStateRequested` — 1 emitter(s)
- `tallyho:betLost` — 4 emitter(s)
- `tallyho:betPaid` — 1 emitter(s)
- `tallyho:betPosted` — 1 emitter(s)
- `tallyho:bountyClaimed` — 1 emitter(s)
- `tallyho:bountyCold` — 1 emitter(s)
- `tallyho:bountyPosted` — 1 emitter(s)
- `tallyho:deed` — 1 emitter(s)
- `tallyho:huntCold` — 1 emitter(s)
- `tallyho:huntPoached` — 1 emitter(s)
- `tallyho:huntPosted` — 1 emitter(s)
- `tallyho:huntSlipped` — 1 emitter(s)
- `tallyho:ledgerFiled` — 1 emitter(s)
- `tallyho:quarryFleeing` — 1 emitter(s)
- `tallyho:rivalDowned` — 1 emitter(s)
- `tallyho:rivalLeft` — 2 emitter(s)
- `tallyho:rivalPosted` — 1 emitter(s)
- `tallyho:sightingFiled` — 1 emitter(s)
- `tallyho:standing` — 1 emitter(s)
- `terrainAnchors:replenished` — 1 emitter(s)
- `tether:couplerLock` — 1 emitter(s)
- `tether:cutDenied` — 1 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:tractorCapture` — 1 emitter(s)
- `touch:guide` — 1 emitter(s)
- `towlineTable:assistAccepted` — 1 emitter(s)
- `towlineTable:assistFulfilled` — 1 emitter(s)
- `towlineTable:cleanupAccepted` — 1 emitter(s)
- `traffic:anvilSpillReturned` — 1 emitter(s)
- `traffic:anvilTransfer` — 1 emitter(s)
- `traffic:freightTallied` — 1 emitter(s)
- `traffic:passengerLinerReceipt` — 1 emitter(s)
- `traffic:passengerLinerSuspended` — 1 emitter(s)
- `traffic:vesselRelinquished` — 1 emitter(s)
- `ui:bulkHaulTag` — 1 emitter(s)
- `ui:bulkHaulTagCleared` — 1 emitter(s)
- `ui:closeCargo` — 2 emitter(s)
- `ui:closeComms` — 1 emitter(s)
- `ui:manifestAction` — 1 emitter(s)
- `ui:manifestOpen` — 1 emitter(s)
- `ui:manifestStart` — 1 emitter(s)
- `ui:navigate` — 3 emitter(s)
- `ui:shipjack` — 8 emitter(s)
- `ui:toast` — 4 emitter(s)
- `ui:toggleCargo` — 1 emitter(s)
- `ui:toggleComms` — 1 emitter(s)
- `ui:toggleOverview` — 1 emitter(s)
- `ui:transferParkedCargo` — 1 emitter(s)
- `understory:accessTier` — 1 emitter(s)
- `understory:blacklisted` — 1 emitter(s)
- `understory:compostRunComplete` — 1 emitter(s)
- `understory:coverBurned` — 1 emitter(s)
- `understory:coverIssued` — 1 emitter(s)
- `understory:debtChanged` — 3 emitter(s)
- `understory:debtSquared` — 1 emitter(s)
- `understory:dropCracked` — 1 emitter(s)
- `understory:dropDelivered` — 1 emitter(s)
- `understory:dropLapsed` — 5 emitter(s)
- `understory:dropReturned` — 1 emitter(s)
- `understory:dropStashed` — 1 emitter(s)
- `understory:favor` — 1 emitter(s)
- `understory:gardenFed` — 1 emitter(s)
- `understory:gardenSeeded` — 1 emitter(s)
- `understory:gardenStage` — 1 emitter(s)
- `understory:markedStash` — 1 emitter(s)
- `understory:noticeChanged` — 2 emitter(s)
- `understory:sporeSkin` — 1 emitter(s)
- `understory:whisperPosted` — 1 emitter(s)
- `understory:whisperVerified` — 1 emitter(s)
- `uniqueLoot:choirBellPulse` — 1 emitter(s)
- `uniqueLoot:nestbreakerSplit` — 1 emitter(s)
- `uniqueLoot:paleCoilBlink` — 1 emitter(s)
- `uniqueWreck:blackBoxRecovered` — 1 emitter(s)
- `uniqueWreck:choiceBlocked` — 1 emitter(s)
- `uniqueWreck:choose` — 3 emitter(s)
- `uniqueWreck:complicationScheduled` — 1 emitter(s)
- `uniqueWreck:encounterCompleted` — 1 emitter(s)
- `uniqueWreck:encounterRequested` — 2 emitter(s)
- `uniqueWreck:rumorHeard` — 2 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:storyRewardDisposed` — 1 emitter(s)
- `vael:clauseDone` — 1 emitter(s)
- `vael:clauseFailed` — 1 emitter(s)
- `vael:clauseLapsed` — 1 emitter(s)
- `vael:clausePosted` — 1 emitter(s)
- `vael:clauseSigned` — 1 emitter(s)
- `vael:debtorCollected` — 1 emitter(s)
- `vael:debtorPosted` — 1 emitter(s)
- `vael:debtorSkipped` — 2 emitter(s)
- `vael:debtorTransferred` — 1 emitter(s)
- `vael:hullScriptRead` — 1 emitter(s)
- `vael:invoiceFiled` — 1 emitter(s)
- `vael:invoiceReminded` — 1 emitter(s)
- `vael:invoiceSettled` — 1 emitter(s)
- `vael:ledgerFiled` — 1 emitter(s)
- `vael:lienClamped` — 1 emitter(s)
- `vael:lienCut` — 1 emitter(s)
- `vael:lienPaid` — 1 emitter(s)
- `vael:lienServed` — 1 emitter(s)
- `vael:lienTelegraph` — 1 emitter(s)
- `vael:lienThrown` — 1 emitter(s)
- `vael:lienTransferred` — 1 emitter(s)
- `vael:marked` — 1 emitter(s)
- `vael:milestone` — 1 emitter(s)
- `vael:overrideThrust` — 1 emitter(s)
- `vael:pageNineArmed` — 1 emitter(s)
- `vael:pageTurned` — 1 emitter(s)
- `vael:paperTier` — 2 emitter(s)
- `vael:patrolHail` — 1 emitter(s)
- `vael:patrolPosted` — 1 emitter(s)
- `vael:patrolWithdrew` — 1 emitter(s)
- `vael:reading` — 1 emitter(s)
- `vael:riderLeft` — 1 emitter(s)
- `vael:riderOpened` — 1 emitter(s)
- `vael:writClosed` — 1 emitter(s)
- `vael:writHullKilled` — 1 emitter(s)
- `vael:writPosted` — 1 emitter(s)
- `vael:writRecalled` — 1 emitter(s)
- `vael:writServed` — 1 emitter(s)
- `vael:writTelegraph` — 1 emitter(s)
- `verb:used` — 1 emitter(s)
- `verge:appealDenied` — 1 emitter(s)
- `verge:appealGranted` — 1 emitter(s)
- `verge:checkpointChallenged` — 1 emitter(s)
- `verge:checkpointCleared` — 1 emitter(s)
- `verge:checkpointScan` — 1 emitter(s)
- `verge:courtConvened` — 1 emitter(s)
- `verge:directive` — 2 emitter(s)
- `verge:directiveViolated` — 1 emitter(s)
- `verge:escortBroken` — 3 emitter(s)
- `verge:escortDemanded` — 1 emitter(s)
- `verge:escortReleased` — 1 emitter(s)
- `verge:incident` — 1 emitter(s)
- `verge:jurorWoke` — 1 emitter(s)
- `verge:lawWoke` — 1 emitter(s)
- `verge:lineTrialPassed` — 1 emitter(s)
- `verge:manifestFined` — 1 emitter(s)
- `verge:massWeighed` — 3 emitter(s)
- `verge:permitDenied` — 1 emitter(s)
- `verge:permitGranted` — 1 emitter(s)
- `verge:permitLapsed` — 1 emitter(s)
- `verge:permitReinstated` — 1 emitter(s)
- `verge:permitSuspended` — 1 emitter(s)
- `verge:pursuitCold` — 1 emitter(s)
- `verge:pursuitCrossed` — 3 emitter(s)
- `verge:pursuitEscaped` — 1 emitter(s)
- `verge:pursuitIntercepted` — 1 emitter(s)
- `verge:pursuitOpened` — 2 emitter(s)
- `verge:pursuitResumed` — 1 emitter(s)
- `verge:pursuitSubmitted` — 1 emitter(s)
- `verge:scanLogged` — 1 emitter(s)
- `verge:treatmentChanged` — 1 emitter(s)
- `vesper:met` — 1 emitter(s)
- `vesper:note` — 1 emitter(s)
- `vesper:performance` — 1 emitter(s)
- `vesper:phraseProgress` — 1 emitter(s)
- `vesper:voice` — 2 emitter(s)
- `vestaOreCache:cargoChanged` — 1 emitter(s)
- `vestaOreCache:clueRecovered` — 1 emitter(s)
- `vestaOreCache:pickupReady` — 1 emitter(s)
- `warrant:acceptPayment` — 1 emitter(s)
- `weapons:debrisOrbitClaimed` — 1 emitter(s)
- `weapons:mineDetonated` — 1 emitter(s)
- `weapons:mortarDetonated` — 1 emitter(s)
- `weapons:mortarLanded` — 1 emitter(s)
- `weather:ionBlackout` — 2 emitter(s)
- `web:linked` — 1 emitter(s)
- `weighing:overMass` — 1 emitter(s)
- `well:capture` — 1 emitter(s)
- `wexTicket:found` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `wingmen:gap` — 1 emitter(s)
- `world:courtRulingRecorded` — 1 emitter(s)
- `world:criticalSpawnDeferred` — 2 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:residency` — 3 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
- `world:stuckCleared` — 1 emitter(s)
- `worldPressure:auditDelayed` — 1 emitter(s)
- `worldPressure:colossusRemains` — 1 emitter(s)
- `worldPressure:scaffoldSpawned` — 1 emitter(s)
- `worldPressure:slowGray` — 1 emitter(s)
- `worldPressure:tideChanged` — 1 emitter(s)
- `wreckCourt:action` — 1 emitter(s)
- `wreckCourt:opened` — 1 emitter(s)
- `wreckCourt:result` — 1 emitter(s)
- `wreckCourt:ruled` — 1 emitter(s)
- `wreckEcology:decayed` — 1 emitter(s)
- `wreckEcology:seeded` — 1 emitter(s)
- `wreckMarket:rates` — 1 emitter(s)
- `wreckMission:choiceApplied` — 1 emitter(s)
