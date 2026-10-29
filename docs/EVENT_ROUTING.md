# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-10-29 · 2007 events · 6214 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:428`, `systems/encounterDirector.js:381`, `ui/discoveryPlate.js:140` |
| `achievement:unlocked` | — | `audio/audioSystem.js:3020` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:2355` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:881` | — |
| `aftermath:custodyFreight` | `systems/aftermathWrecks.js:2241` | — |
| `aftermath:custodySurvivor` | `systems/aftermathWrecks.js:2253` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:2334` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2685` | `systems/missions.js:1672` |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:946` | `render/vfx.js:2773`, `systems/missions.js:1671`, `systems/salvage.js:161` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1700`, `systems/aftermathWrecks.js:2147` | `systems/missions.js:1673`, `ui/galaxyMap.js:1996` |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:2455` | `systems/dyingHull.js:182`, `systems/lawSecurity.js:400`, `systems/salvage.js:162` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:170` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:636` | `systems/presentationOrchestrator.js:171`, `systems/scissorwake.js:81`, `systems/tetherGameplay.js:347`, `ui/threatHalo.js:919` |
| `ai:egressExit` | `ai/egressExit.js:89`, `systems/missionStoryOps.js:1263` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:395` | — |
| `ai:flee` | `systems/ai.js:276`, `systems/trafficRoleOps.js:476`, `systems/wingMorale.js:331` | `render/authoredMotion.js:1189`, `render/vfx.js:2835`, `systems/barkDirector.js:802`, `systems/combatOutcome.js:259`, `systems/encounterDirector.js:418`, `systems/presentationOrchestrator.js:172` |
| `ai:formationBroken` | `systems/ai.js:454`, `systems/wingMorale.js:281` | `render/vfx.js:2836` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:804` |
| `ai:stateChange` | `systems/ai.js:273` | `render/authoredMotion.js:1206`, `systems/combatOutcome.js:295` |
| `ai:telegraph` | `ai/counterplay/live.js:138`, `systems/ai.js:350`, `systems/encounterScripts.js:172`, `systems/encounterScripts.js:1131`, `systems/masslineSnares.js:347`, `systems/mines.js:154`, `systems/tacticalAI.js:105`, `systems/tacticalAI.js:138`, `systems/tacticalAI.js:621`, `systems/tacticalAI.js:808` | `audio/audioSystem.js:2976`, `render/authoredMotion.js:1188`, `render/vfx.js:2834`, `systems/presentationOrchestrator.js:169`, `systems/scissorwake.js:74`, `systems/survivalResults.js:517`, `ui/survivalHud.js:328`, `ui/threatHalo.js:915` |
| `aiTrader:requestTrade` | `systems/trafficEscortOps.js:170` | `systems/economy.js:1796` |
| `alienEcology:blackBoxRecovered` | `systems/world.js:806` | `systems/world.js:777` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:1210` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:1268` | `systems/world.js:785` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:775` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:773` |
| `alienEcology:relaySevered` | — | `systems/world.js:774` |
| `alienEcology:relocateSite` | — | `systems/world.js:776` |
| `alienEcology:vented` | `systems/alienEcology.js:2194` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114`, `systems/economyContracts.js:787` | `systems/story.js:165` |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:280` | `systems/story.js:166` |
| `ambush:clauseDecided` | `systems/encounterDirector.js:1050` | — |
| `ambush:clauseFired` | `systems/encounterDirector.js:1241` | — |
| `anomaly:bearing` | `systems/scanner.js:1411` | `systems/presentationOrchestrator.js:202` |
| `anomaly:triangulated` | `systems/scanner.js:1429` | `systems/world.js:712` |
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
| `asset:deployed` | `systems/automation.js:2650`, `systems/automation.js:2736`, `systems/automation.js:2838`, `systems/claims.js:634` | `systems/missions.js:1912`, `systems/onboarding.js:860`, `systems/story.js:252` |
| `asteroid:chunked` | `systems/environmentMaterials.js:188`, `systems/mining.js:2543` | `render/asteroidMotionPresentation.js:524`, `render/authoredMotion.js:1204`, `render/vfx.js:2805`, `systems/presentationOrchestrator.js:215` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1221`, `systems/mining.js:1231` | `audio/audioSystem.js:2816`, `render/authoredMotion.js:1203`, `render/vfx.js:2803`, `systems/asteroidFormations.js:131`, `systems/environmentalMachinery.js:272`, `systems/fieldDepletion.js:755`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `features/industrialDisasters/presentation.js:111`, `features/salvageTender/presentation.js:63`, `features/shipbreakingYard/audio.js:28`, `matter/collectorKnot.js:155`, `matter/collectorKnot.js:178`, `matter/collectorKnot.js:363`, `matter/collectorKnot.js:410`, `render/feel.js:585`, `render/shipMicroMotion.js:2747`, `render/trailerStaging.js:13`, `render/vfx.js:2863`, `render/vfx.js:6445`, `render/vfx.js:11288`, `render/vfx.js:12548`, `systems/ai.js:726`, `systems/alienEcology.js:603`, `systems/asteroidSites.js:3052`, `systems/barkDirector.js:1933`, `systems/barkDirector.js:1980`, `systems/beacons.js:77`, `systems/beacons.js:82`, `systems/beacons.js:94`, `systems/bellhop.js:198`, `systems/blindWelderRuntime.js:161`, `systems/bombs.js:1166`, `systems/bombs.js:1290`, `systems/bombs.js:1679`, `systems/bracket.js:125`, `systems/bulletTime.js:216`, `systems/bulletTime.js:234`, `systems/bulletTime.js:314`, `systems/cargo.js:1250`, `systems/cargo.js:1273`, `systems/claims.js:481`, `systems/claims.js:566`, `systems/claims.js:611`, `systems/claims.js:1785`, `systems/claims.js:1905`, `systems/claims.js:2657`, `systems/cloak.js:201`, `systems/cloak.js:241`, `systems/countermeasures.js:559`, `systems/countermeasures.js:595`, `systems/crafting.js:351`, `systems/crafting.js:361`, `systems/crafting.js:383`, `systems/discoverySound.js:25`, `systems/docket.js:158`, `systems/eighthBellRuntime.js:122`, `systems/eighthBellRuntime.js:137`, `systems/environmentalMachinery.js:1608`, `systems/fields.js:1084`, `systems/fields.js:1450`, `systems/fields.js:1583`, `systems/fields.js:1842`, `systems/flybyFocus.js:528`, `systems/glueMeetMassRuntime.js:119`, `systems/gyreSnare.js:531`, `systems/gyreSnare.js:1236`, `systems/gyreSnare.js:1608`, `systems/gyreSnare.js:1641`, `systems/gyreSnare.js:2016`, `systems/gyreSnare.js:2129`, `systems/gyreSnare.js:2211`, `systems/gyreSnare.js:2446`, `systems/gyreSnare.js:2471`, `systems/gyreSnare.js:2486`, `systems/gyreSnare.js:2499`, `systems/gyreSnare.js:2528`, `systems/gyreSnare.js:2559`, `systems/gyreSnare.js:2664`, `systems/gyreSnare.js:2683`, `systems/gyreSnare.js:2699`, `systems/gyreSnare.js:2737`, `systems/gyreSnare.js:2746`, `systems/gyreSnare.js:2768`, `systems/gyreSnare.js:2870`, `systems/gyreSnare.js:2949`, `systems/gyreSnare.js:2959`, `systems/gyreSnare.js:3003`, `systems/heroManeuvers.js:447`, `systems/heroManeuvers.js:487`, `systems/heroManeuvers.js:733`, `systems/heroManeuvers.js:743`, `systems/hullBurst.js:238`, `systems/hullBurst.js:401`, `systems/hullBurst.js:432`, `systems/hullBurst.js:546`, `systems/hullBurst.js:618`, `systems/hullFracture.js:565`, `systems/hullFracture.js:703`, `systems/impulseCharges.js:760`, `systems/impulseCharges.js:867`, `systems/impulseCharges.js:1088`, `systems/impulseCharges.js:1282`, `systems/impulseCharges.js:1396`, `systems/jettisonImpulse.js:78`, `systems/lineHeads.js:233`, `systems/machineWork.js:214`, `systems/machineWork.js:264`, `systems/machineWork.js:323`, `systems/machineWork.js:399`, `systems/machineWork.js:481`, `systems/massSeed.js:181`, `systems/massSeed.js:554`, `systems/massSeed.js:597`, `systems/masslineThrow.js:246`, `systems/masslineThrow.js:572`, `systems/masslineThrow.js:659`, `systems/mining.js:970`, `systems/mining.js:2631`, `systems/morrow.js:201`, `systems/phaseBlink.js:193`, `systems/phaseBlink.js:338`, `systems/precursorMachines.js:194`, `systems/precursorMachines.js:580`, `systems/precursorMachines.js:670`, `systems/precursorMachines.js:1053`, `systems/precursorMachines.js:1111`, `systems/presentationAdapters.js:322`, `systems/presentationAdapters.js:699`, `systems/presentationOrchestrator.js:525`, `systems/ravel.js:131`, `systems/rubric.js:302`, `systems/ruckus.js:143`, `systems/runawayKilnRuntime.js:188`, `systems/runawayKilnRuntime.js:206`, `systems/ruud.js:502`, `systems/ruud.js:506`, `systems/salvage.js:1091`, `systems/salvage.js:1193`, `systems/salvage.js:1249`, `systems/shieldPylons.js:347`, `systems/shieldPylons.js:367`, `systems/shieldPylons.js:377`, `systems/shipjack.js:79`, `systems/solstice.js:296`, `systems/tacticalAI.js:876`, `systems/theBolus.js:362`, `systems/tumbleStates.js:561`, `systems/tumbleStates.js:676`, `systems/twoShipsOneMistakeRuntime.js:193`, `systems/vesper.js:245`, `systems/volatileExposure.js:494`, `systems/volatileExposure.js:568`, `systems/weapons.js:2209`, `systems/weapons.js:2341`, `ui/commsRadial.js:577`, `ui/commsRadial.js:617`, `ui/commsRadial.js:630`, `ui/commsRadial.js:844`, `ui/commsRadial.js:887`, `ui/hud.js:2311`, `ui/hud.js:3712`, `ui/hud.js:3750`, `ui/hud.js:3980`, `ui/hud.js:4040`, `ui/hud.js:4085`, `ui/hud.js:4104`, `ui/hud.js:4192`, `ui/hud.js:4334`, `ui/hud.js:4680`, `ui/input.js:376`, `ui/input.js:405`, `ui/input.js:476`, `ui/input.js:514`, `ui/input.js:520`, `ui/input.js:601`, `ui/input.js:662`, `ui/input.js:668`, `ui/input.js:674`, `ui/input.js:681`, `ui/input.js:912`, `ui/input.js:1146`, `ui/input.js:1151`, `ui/input.js:1169`, `ui/input.js:1174`, `ui/input.js:1267`, `ui/input.js:1276`, `ui/input.js:1281`, `ui/input.js:1290`, `ui/input.js:1305`, `ui/input.js:1347`, `ui/input.js:1363`, `ui/input.js:1367`, `ui/input.js:1380`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:578`, `ui/screens/base.js:1293`, `ui/screens/base.js:1545`, `ui/screens/missionLog.js:2160`, `ui/screens/missionLog.js:2164`, `ui/screens/missionLog.js:2168`, `ui/screens/missionLog.js:2172`, `ui/screens/missionLog.js:2188`, `ui/screens/missionLog.js:2196`, `ui/screens/missionLog.js:2203`, `ui/screens/missionLog.js:2210`, `ui/screens/missionLog.js:2218`, `ui/screens/missionLog.js:2225`, `ui/screens/missionLog.js:2232`, `ui/screens/missionLog.js:2241`, `ui/screens/missionLog.js:2248`, `ui/screens/missionLog.js:2264`, `ui/screens/missionLog.js:2295`, `ui/screens/missionLog.js:2315`, `ui/shipLedgerPanel.js:248`, `ui/shipLedgerPanel.js:516`, `ui/shipLedgerPanel.js:523`, `ui/station/screens/bar.js:606`, `ui/station/screens/bar.js:693`, `ui/station/screens/bar.js:697`, `ui/station/screens/bar.js:701`, `ui/station/screens/bar.js:723`, `ui/station/screens/bar.js:737`, `ui/station/screens/bar.js:774`, `ui/station/screens/bar.js:811`, `ui/station/screens/bar.js:820`, `ui/station/screens/contracts.js:1448`, `ui/station/screens/contracts.js:1459`, `ui/station/screens/contracts.js:1495`, `ui/station/screens/contracts.js:1498`, `ui/station/screens/contracts.js:1554`, `ui/station/screens/factions.js:399`, `ui/station/screens/industry.js:468`, `ui/station/screens/industry.js:518`, `ui/station/screens/industry.js:555`, `ui/station/screens/industry.js:564`, `ui/station/screens/industry.js:572`, `ui/station/screens/industry.js:578`, `ui/station/screens/industry.js:588`, `ui/station/screens/market.js:1306`, `ui/station/screens/market.js:2083`, `ui/station/screens/market.js:2155`, `ui/station/screens/market.js:2188`, `ui/station/screens/market.js:2252`, `ui/station/screens/market.js:2266`, `ui/station/screens/market.js:2462`, `ui/station/screens/shipworks.js:719`, `ui/station/screens/shipworks.js:3834`, `ui/station/screens/shipworks.js:4258`, `ui/station/screens/shipworks.js:4844`, `ui/station/screens/shipworks.js:4915`, `ui/station/screens/shipworks.js:4932`, `ui/station/screens/shipworks.js:4945`, `ui/station/screens/shipworks.js:4949`, `ui/station/screens/shipworks.js:4954`, `ui/station/screens/shipworks.js:4984`, `ui/station/screens/shipworks.js:5002`, `ui/station/screens/shipworks.js:5038`, `ui/station/screens/shipworks.js:5060`, `ui/station/screens/shipworks.js:5062`, `ui/station/screens/shipworks.js:5080`, `ui/station/screens/shipworks.js:5129`, `ui/station/screens/shipworks.js:5142`, `ui/station/screens/shipworks.js:5149`, `ui/station/screens/shipworks.js:5187`, `ui/station/screens/shipworks.js:5198`, `ui/station/screens/shipworks.js:5205`, `ui/station/screens/shipworks.js:5247`, `ui/station/screens/shipworks.js:5258`, `ui/station/screens/shipworks.js:5269`, `ui/station/screens/shipworks.js:5279`, `ui/station/screens/shipworks.js:5284`, `ui/station/screens/shipworks.js:5292`, `ui/station/screens/shipworks.js:5301`, `ui/station/screens/shipworks.js:5308`, `ui/station/screens/shipworks.js:5461`, `ui/station/screens/shipworks.js:5471`, `ui/station/screens/shipworks.js:5481`, `ui/station/screens/shipworks.js:5491`, `ui/station/screens/shipworks.js:5553`, `ui/station/screens/shipworks.js:5590`, `ui/station/screens/shipworks.js:5594`, `ui/station/screens/shipworks.js:5612`, `ui/station/screens/shipworks.js:5616`, `ui/station/screens/shipworks.js:5629`, `ui/station/screens/shipworks.js:5633`, `ui/station/stationApp.js:750`, `ui/station/stationApp.js:1104`, `ui/station/stationApp.js:1140`, `ui/station/stationLife.js:21`, `ui/toasts.js:406`, `ui/uiRoot.js:1597`, `ui/wingmanRadial.js:220`, `ui/wingmanRadial.js:242`, `ui/wingmanRadial.js:267`, `ui/wingmanRadial.js:304`, `ui/wingmanRadial.js:329`, `world/motionFossil.js:188` | `audio/audioSystem.js:3096` |
| `audio:outputDeviceChanged` | `audio/audioSystem.js:3458` | — |
| `automation:assetDistressed` | `systems/automation.js:2321` | `ui/automationPayoff.js:88` |
| `automation:assetLost` | `systems/automation.js:2944` | `systems/intervention.js:70`, `systems/lossLedger.js:460`, `systems/missions.js:1914` |
| `automation:assetRepossessed` | `systems/automation.js:2368` | `ui/automationPayoff.js:95` |
| `automation:assetResumed` | `systems/automation.js:2782` | — |
| `automation:droneDistressed` | `systems/automation.js:1647` | — |
| `automation:droneRecovered` | `systems/automation.js:1723` | — |
| `automation:incomeCredited` | `systems/automation.js:2399`, `systems/automation.js:2410`, `systems/automation.js:3225` | — |
| `automation:interact` | `systems/automation.js:3851` | — |
| `automation:offlineSummary` | `systems/automation.js:2982`, `systems/automation.js:3006`, `systems/automation.js:3030`, `systems/automation.js:3053`, `systems/automation.js:3272` | `ui/automationPayoff.js:85`, `ui/dockArrival.js:115` |
| `automation:outpostRaided` | `systems/automation.js:2241`, `systems/automation.js:3347` | `systems/lossLedger.js:461` |
| `automation:programAssigned` | `systems/automation.js:2582` | `systems/missions.js:1913`, `ui/screens/automationPanel.js:1733` |
| `automation:programInterrupted` | `systems/alphabet.js:223`, `systems/alphabet.js:588`, `systems/alphabet.js:596` | — |
| `automation:programRejected` | `systems/automation.js:2548`, `systems/automation.js:2555` | `ui/screens/automationPanel.js:1728` |
| `automation:reactionAssigned` | `systems/automation.js:2597` | — |
| `automation:reactionCleared` | `systems/automation.js:2608` | — |
| `automation:traderCycleCompleted` | `systems/automation.js:1972` | `ui/screens/automationPanel.js:1042` |
| `band:bearingReceipt` | `systems/bandRadio.js:684` | `systems/presentationOrchestrator.js:203` |
| `band:bearingRequest` | `systems/bandRadio.js:657` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:879`, `systems/uniqueWrecks.js:922` | `render/authoredMotion.js:1177` |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:886`, `systems/uniqueWrecks.js:894`, `systems/uniqueWrecks.js:908` | `ui/bandHud.js:107` |
| `band:bed` | `systems/bandRadio.js:741` | `audio/audioSystem.js:3263` |
| `band:cycle` | `ui/bandHud.js:102`, `ui/input.js:554` | — |
| `band:status` | `systems/bandRadio.js:723` | `ui/bandHud.js:106` |
| `barkDirector:silence` | — | `audio/audioSystem.js:2870` |
| `barkDirector:voice` | `features/salvageOutfits/presentation.js:103`, `systems/barkDirector.js:908`, `ui/station/stationArrival.js:121`, `ui/station/stationLife.js:27`, `ui/voiceArbiter.js:898` | `audio/audioSystem.js:3213` |
| `beacon:deploy` | — | `systems/beacons.js:52` |
| `beacon:deployed` | `systems/beacons.js:89` | `render/shipMicroMotion.js:1771`, `systems/onboarding.js:1018` |
| `beam:denied` | `systems/mining.js:464`, `systems/mining.js:519`, `systems/mining.js:635`, `systems/mining.js:651`, `systems/mining.js:663`, `systems/mining.js:694` | `render/authoredMotion.js:1149` |
| `beam:repaired` | `systems/mining.js:766` | — |
| `beam:transferred` | `systems/mining.js:826` | — |
| `body:sled` | — | `systems/spectrum/live.js:63` |
| `bombs:armed` | `systems/bombs.js:1224` | `audio/bombAudio.js:440` |
| `bombs:commanded` | `systems/bombs.js:1179` | `systems/fields.js:743` |
| `bombs:cycle` | `systems/bombs.js:817`, `systems/bombs.js:827`, `systems/bombs.js:1157` | `audio/bombAudio.js:469` |
| `bombs:denied` | `systems/bombs.js:684`, `systems/bombs.js:804`, `systems/bombs.js:844`, `systems/bombs.js:881`, `systems/bombs.js:920`, `systems/bombs.js:945`, `systems/bombs.js:1097`, `systems/bombs.js:1116` | — |
| `bombs:destroyed` | `systems/bombs.js:1676` | `audio/bombAudio.js:441`, `render/vfx.js:2830` |
| `bombs:detonated` | `systems/bombs.js:1283` | `audio/bombAudio.js:444`, `render/vfx.js:2828` |
| `bombs:dropped` | `systems/bombs.js:1165` | `audio/bombAudio.js:438`, `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:877` |
| `bombs:fieldEnded` | `systems/bombs.js:1575` | `audio/bombAudio.js:452`, `render/vfx.js:2829` |
| `bombs:primed` | `systems/bombs.js:1191` | `audio/bombAudio.js:439`, `ui/stuntCallout.js:925` |
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
| `borrowedVoice:dispositionAccepted` | `systems/borrowedVoice.js:135` | — |
| `borrowedVoice:fragmentRecovered` | `systems/borrowedVoice.js:97` | — |
| `borrowedVoice:offer` | `systems/borrowedVoice.js:107` | `ui/borrowedVoicePrompt.js:4` |
| `boss:defeated` | `systems/world.js:1065` | `systems/survivalAnnounce.js:382` |
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
| `bounty:cleared` | `systems/economy.js:4759` | `systems/heat.js:437` |
| `bounty:cooled` | `systems/heat.js:771` | `systems/barkDirector.js:825` |
| `bracket:bank` | `systems/bracket.js:182` | — |
| `bracket:matchFinished` | `systems/bracket.js:239` | — |
| `bracket:matchStarted` | `systems/bracket.js:143` | — |
| `bracket:save` | `systems/bracket.js:188` | — |
| `bracket:shotResolved` | `systems/bracket.js:227` | — |
| `bracket:voice` | `systems/bracket.js:123` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:327` | `audio/audioSystem.js:2965` |
| `bulletTime:end` | `systems/bulletTime.js:233` | `audio/audioSystem.js:3262` |
| `bulletTime:start` | `systems/bulletTime.js:215` | `audio/audioSystem.js:3259`, `systems/onboarding.js:977` |
| `calendar:festival` | `systems/worldClock.js:103` | — |
| `calendar:marketDay` | `systems/worldClock.js:121` | — |
| `calendar:rushHour` | `systems/worldClock.js:149` | — |
| `calendar:stormSeason` | `systems/worldClock.js:88` | — |
| `camera:shake` | `matter/collectorKnot.js:412`, `render/shipMicroMotion.js:2745`, `render/vfx.js:6707`, `render/vfx.js:7007`, `render/vfx.js:7353`, `systems/combat.js:1085`, `systems/combat.js:1249`, `systems/combat.js:1464`, `systems/drill.js:2038`, `systems/drill.js:2153`, `systems/drill.js:2480`, `systems/flybyFocus.js:527`, `systems/gyreSnare.js:551`, `systems/gyreSnare.js:1245`, `systems/gyreSnare.js:1635`, `systems/gyreSnare.js:2862`, `systems/gyreSnare.js:2942`, `systems/intervention.js:262`, `systems/presentationAdapters.js:612`, `systems/survivalAnnounce.js:736`, `systems/tetherGameplay.js:774` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:751`, `ui/input.js:755`, `ui/input.js:996` | — |
| `capitalBoss:actChanged` | — | `ui/toasts.js:765` |
| `capitalBoss:actRetried` | `systems/capitalBossEncounters.js:445` | — |
| `capitalBoss:countered` | — | `ui/toasts.js:774` |
| `capitalBoss:detach` | `systems/missions.js:1944` | — |
| `capitalBoss:disarmed` | — | `ui/toasts.js:776` |
| `capitalBoss:ended` | — | `ui/toasts.js:791` |
| `capitalBoss:hit` | — | `ui/toasts.js:783` |
| `capitalBoss:plateTorn` | `systems/capitalBossEncounters.js:385` | — |
| `capitalBoss:recovery` | — | `ui/toasts.js:775` |
| `capitalBoss:start` | `systems/missionObjectiveOps.js:2072` | `systems/swarmJuice.js:167` |
| `capitalBoss:started` | — | `ui/toasts.js:758` |
| `capitalBoss:telegraph` | — | `render/authoredMotion.js:1205`, `ui/toasts.js:746` |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:438`, `systems/capitalBossEncounters.js:463`, `systems/capitalBossEncounters.js:487` | — |
| `captain:remembered` | `systems/captainMemory.js:92` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:856` | `systems/world.js:714` |
| `cargo:changed` | `features/salvageTender/physical.js:398`, `systems/cargo.js:386`, `systems/mining.js:2873` | `audio/audioSystem.js:2894`, `systems/moistureLoss.js:89`, `systems/onboarding.js:778`, `systems/ships.js:1905`, `ui/cargoConscience.js:143`, `ui/commandBar.js:464` |
| `cargo:delivered` | `systems/asteroidSites.js:3430`, `systems/missions.js:4614`, `systems/missions.js:4673`, `systems/missions.js:4782`, `systems/missions.js:4832` | `systems/economy.js:1808` |
| `cargo:fragileLost` | `systems/fragileCargo.js:320` | — |
| `cargo:full` | `systems/cargo.js:494`, `systems/cargo.js:746`, `systems/mining.js:1826`, `systems/mining.js:2851` | `audio/audioSystem.js:2895`, `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:781`, `systems/presentationOrchestrator.js:223`, `ui/alerts.js:604` |
| `cargo:hotDockSpill` | `systems/cargo.js:1196` | — |
| `cargo:jettison` | `ui/hud.js:3720` | — |
| `cargo:jettisoned` | `systems/cargo.js:1426` | `audio/audioSystem.js:2933`, `render/authoredMotion.js:1214`, `render/shipMicroMotion.js:1769`, `systems/barkDirector.js:813`, `systems/cloak.js:57`, `systems/jettisonImpulse.js:54`, `systems/lawSecurity.js:424`, `systems/onboarding.js:959`, `systems/onboarding.js:1026` |
| `cargo:massSettled` | `systems/cargo.js:919` | `systems/presentationOrchestrator.js:222`, `systems/ships.js:1906` |
| `cargo:parkedHoldSwapped` | `systems/cargo.js:1073` | `systems/shipControlTransfer.js:136` |
| `cargo:parkedTransfer` | `systems/cargo.js:1135` | — |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:podIntake` | `systems/economy.js:3884` | `systems/economy.js:1818` |
| `cargo:radiationCooked` | `systems/fragileCargo.js:152` | — |
| `cargo:tallyThreeDelivered` | `systems/economy.js:4232` | — |
| `cargo:vesselFreightReleased` | `systems/cargo.js:1329` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:1026` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:1062` | — |
| `cargo:volatileExposed` | `systems/volatileExposure.js:384` | — |
| `cargo:volatileRupture` | `systems/volatileExposure.js:548` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:946`, `systems/lootShards.js:1002` | `systems/volatileExposure.js:218` |
| `cargo:volatileVent` | `systems/volatileExposure.js:472` | — |
| `ceresWorkfleet:interrupted` | `systems/ceresWorkfleet.js:304` | — |
| `chain:detonated` | `systems/impulseCharges.js:1068` | `systems/fields.js:732` |
| `chain:primeEnded` | `systems/impulseCharges.js:1031` | — |
| `chain:primed` | `systems/impulseCharges.js:1008` | — |
| `chain:slam` | `systems/impulseCharges.js:942`, `systems/impulseCharges.js:962` | `systems/fields.js:731` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1189`, `systems/tetherGameplay.js:2486` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:1278` | `systems/onboarding.js:985` |
| `charge:armed` | `systems/impulseCharges.js:1105` | — |
| `charge:combo` | `systems/impulseCharges.js:1320`, `systems/impulseCharges.js:1379` | `systems/tetherGameplay.js:352` |
| `charge:detonated` | `systems/impulseCharges.js:751`, `systems/impulseCharges.js:859`, `systems/impulseCharges.js:1080`, `systems/impulseCharges.js:1387` | `audio/audioSystem.js:2990`, `render/feel.js:1554`, `render/vfx.js:2826`, `systems/fields.js:733`, `systems/fields.js:744`, `systems/flightV3.js:232`, `systems/gamepad.js:1008` |
| `charge:stuck` | `systems/impulseCharges.js:1186` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1768` |
| `charge:thrown` | `systems/impulseCharges.js:1265` | `render/ordnanceMotionPresentation.js:261` |
| `choir:bellHeadRing` | `systems/faction_choir.js:692` | — |
| `choir:bellPulse` | `systems/faction_choir.js:518` | — |
| `choir:blessing` | `systems/faction_choir.js:757` | — |
| `choir:blessingEnded` | `systems/faction_choir.js:768` | — |
| `choir:circuitComplete` | `systems/faction_choir.js:934` | — |
| `choir:crystalShattered` | `systems/faction_choir.js:548` | — |
| `choir:devotionalYield` | `systems/faction_choir.js:1093` | — |
| `choir:escortComplete` | `systems/faction_choir.js:1365` | — |
| `choir:escortRequest` | `systems/faction_choir.js:1247` | — |
| `choir:heresyLapsed` | `systems/faction_choir.js:1453`, `systems/faction_choir.js:1461` | — |
| `choir:heresyMarked` | `systems/faction_choir.js:1430` | — |
| `choir:heresyResolved` | `systems/faction_choir.js:1575` | — |
| `choir:offering` | `systems/faction_choir.js:1060` | — |
| `choir:pilgrimArrived` | `systems/faction_choir.js:1369` | — |
| `choir:pilgrimLeg` | `systems/faction_choir.js:896` | — |
| `choir:pilgrimLost` | `systems/faction_choir.js:1389` | — |
| `choir:pilgrimSpawn` | `systems/faction_choir.js:1300` | — |
| `choir:pilgrimVisit` | `systems/faction_choir.js:853` | — |
| `choir:relicAlarm` | `systems/faction_choir.js:634` | — |
| `choir:relicCracked` | `systems/faction_choir.js:602` | — |
| `choir:relicPing` | `systems/faction_choir.js:620` | — |
| `choir:sacrilege` | `systems/faction_choir.js:815` | — |
| `choir:sanctuary` | `systems/faction_choir.js:801`, `systems/faction_choir.js:831` | — |
| `choir:titheAssessed` | `systems/faction_choir.js:985` | — |
| `choir:tithePaid` | `systems/faction_choir.js:1004` | — |
| `choir:tribute` | `systems/faction_choir.js:654` | — |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:22` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:23` |
| `claim:claimed` | `systems/claims.js:480` | `systems/onboarding.js:866`, `systems/story.js:261`, `systems/traffic.js:2260` |
| `claim:convoyAbandoned` | `systems/claims.js:1599` | `systems/traffic.js:2263` |
| `claim:convoyDocked` | `systems/trafficConvoyOps.js:210` | `systems/claims.js:436` |
| `claim:convoyManifested` | `systems/trafficConvoyOps.js:110` | `systems/claims.js:435` |
| `claim:defenseDelegate` | — | `systems/claims.js:427` |
| `claim:defenseDelegateRefused` | `systems/claims.js:1978` | — |
| `claim:defenseEncounterRequested` | `systems/claims.js:1860` | — |
| `claim:defenseGo` | — | `systems/claims.js:426` |
| `claim:defenseIgnore` | — | `systems/claims.js:422` |
| `claim:defenseResolved` | `systems/claims.js:2060` | `ui/encounterChoicePrompt.js:181` |
| `claim:defenseStarted` | `systems/claims.js:1870` | `ui/encounterChoicePrompt.js:180` |
| `claim:defenseWarning` | `systems/claims.js:1767`, `systems/claims.js:1885` | `systems/encounterDirector.js:391`, `ui/encounterChoicePrompt.js:177` |
| `claim:depotPatrolCompleted` | `systems/claims.js:3253` | `systems/factions.js:515` |
| `claim:depotPatrolRotation` | `systems/claims.js:3209` | — |
| `claim:depotPatrolSpent` | `systems/claims.js:1965` | — |
| `claim:depotSupport` | `systems/claims.js:3120`, `systems/claims.js:3146` | — |
| `claim:freightDelivered` | `systems/trafficConvoyOps.js:421` | — |
| `claim:infrastructureActive` | `systems/claims.js:1261`, `systems/claims.js:2907` | `systems/traffic.js:2258` |
| `claim:infrastructureConstructed` | `systems/claims.js:547`, `systems/claims.js:2844` | — |
| `claim:infrastructureStatus` | `systems/claims.js:1272` | `systems/traffic.js:2259` |
| `claim:moduleBuilt` | `systems/claims.js:565` | — |
| `claim:raidRepelled` | `systems/claims.js:1716` | — |
| `claim:raidWarning` | `systems/claims.js:1709` | `audio/audioSystem.js:2958` |
| `claim:receipt` | `systems/claims.js:2292` | — |
| `claim:sensorPostRumor` | `systems/claims.js:1321` | `systems/world.js:750` |
| `claim:specialized` | `systems/claims.js:606` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:3410` | — |
| `claims:migrated` | `systems/claims.js:2470` | — |
| `cloak:burned` | `systems/cloak.js:306` | `audio/audioSystem.js:2823` |
| `cloak:dropped` | `systems/cloak.js:240` | `audio/audioSystem.js:2818`, `render/authoredMotion.js:1209`, `render/shipMicroMotion.js:1765` |
| `cloak:engaged` | `systems/cloak.js:200` | `render/authoredMotion.js:1208`, `render/shipMicroMotion.js:1764`, `systems/gamepad.js:1013`, `systems/onboarding.js:981` |
| `cloak:faded` | `systems/aiPorts.js:1298` | `audio/audioSystem.js:2817` |
| `coldburnRey:playerDelivered` | `systems/missions.js:5231` | — |
| `coldburnRey:raceSettled` | `systems/coldburnRey.js:91` | — |
| `collector:absorbed` | `matter/collectorKnot.js:174` | — |
| `collector:freed` | `matter/collectorKnot.js:114` | — |
| `collector:lost` | `matter/collectorKnot.js:123` | — |
| `collector:released` | `matter/collectorKnot.js:405` | — |
| `collector:snagged` | `matter/collectorKnot.js:154` | — |
| `collision:tearOff` | `systems/hullFracture.js:694` | `render/vfx.js:2740` |
| `combat:actionCancelled` | `combat/actions.js:373` | — |
| `combat:actionCompleted` | `combat/actions.js:359` | — |
| `combat:actionPhase` | `combat/actions.js:222` | — |
| `combat:actionRejected` | `combat/actions.js:395` | `ui/toasts.js:802` |
| `combat:actionStarted` | `combat/actions.js:189` | `systems/presentationOrchestrator.js:174`, `systems/scenarioRuntime.js:23` |
| `combat:aftermathChoices` | `systems/combatOutcome.js:480`, `systems/combatOutcome.js:549`, `systems/combatOutcome.js:561` | `ui/aftermathChoicePrompt.js:41` |
| `combat:aftermathChoose` | `ui/aftermathChoicePrompt.js:36` | `systems/combatOutcome.js:289` |
| `combat:aftermathChosen` | `systems/combatOutcome.js:255` | — |
| `combat:bankShot` | — | `render/vfx.js:2728` |
| `combat:baseDestroyed` | `systems/combat.js:1235` | `systems/economy.js:1887`, `systems/gamepad.js:1118` |
| `combat:beamStop` | `systems/swarmFortifyEffects.js:305`, `systems/weapons.js:1444` | `audio/audioSystem.js:2744`, `render/asteroidMotionPresentation.js:523`, `render/vfx.js:2724` |
| `combat:bounceContinued` | `combat/attackHit.js:38` | `render/vfx.js:2729`, `systems/presentationOrchestrator.js:266` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:507` | `render/feel.js:1589`, `render/vfx.js:2738`, `systems/economy.js:1889`, `systems/fields.js:735`, `systems/gamepad.js:1000`, `systems/lawSecurity.js:395`, `systems/ships.js:2028`, `systems/swarmLegendaries.js:115` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:526` | `render/vfx.js:2739` |
| `combat:damage` | `combat/damage.js:490` | `audio/audioSystem.js:2759`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `data/encounters/367-the-salvage-tail.js:146`, `render/asteroidMotionPresentation.js:516`, `render/authoredMotion.js:1165`, `render/feel.js:1368`, `render/shipMicroMotion.js:1749`, `render/vfx.js:2730`, `save/saveSystem.js:541`, `systems/ai.js:108`, `systems/aiEncounter.js:136`, `systems/asteroidSites.js:848`, `systems/barkDirector.js:808`, `systems/cloak.js:53`, `systems/collisionConsequences.js:104`, `systems/combatOutcome.js:294`, `systems/cruise.js:60`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:362`, `systems/factionPresence.js:535`, `systems/gamepad.js:1126`, `systems/heat.js:377`, `systems/killReplay.js:391`, `systems/lawSecurity.js:394`, `systems/missions.js:1898`, `systems/npcJobsRuntime.js:1147`, `systems/onboarding.js:700`, `systems/onboarding.js:711`, `systems/onboarding.js:723`, `systems/presentationOrchestrator.js:168`, `systems/routeFollower.js:433`, `systems/salvageActions.js:139`, `systems/scenarioRuntime.js:29`, `systems/ships.js:2017`, `systems/stationBroadcast.js:265`, `systems/survivalResults.js:510`, `systems/survivalWave.js:202`, `systems/swarmJuice.js:161`, `systems/titles.js:582`, `systems/traffic.js:2178`, `systems/volatileExposure.js:216`, `systems/world.js:707`, `ui/alerts.js:588`, `ui/commandBar.js:453`, `ui/uiRoot.js:939` |
| `combat:emp` | `combat/damage.js:495` | — |
| `combat:fire` | `systems/impulseCharges.js:793`, `systems/swarmFortifyEffects.js:302`, `systems/swarmFortifyEffects.js:406`, `systems/weapons.js:1327`, `systems/weapons.js:1423`, `systems/weapons.js:1651`, `systems/weapons.js:2070` | `audio/audioSystem.js:2743`, `data/stationBubbles.js:182`, `render/farPlaneLife.js:65`, `render/feel.js:1490`, `render/shipMicroMotion.js:1747`, `render/vfx.js:2723`, `systems/asteroidSites.js:669`, `systems/cloak.js:59`, `systems/cruise.js:68`, `systems/lawSecurity.js:396`, `systems/onboarding.js:624`, `systems/onboarding.js:637`, `systems/presentationOrchestrator.js:173`, `systems/story.js:266`, `systems/traffic.js:2179`, `systems/world.js:783` |
| `combat:hit` | `systems/salvageActions.js:621`, `systems/salvageActions.js:712` | `render/farPlaneLife.js:64`, `systems/routeFollower.js:431`, `systems/story.js:267` |
| `combat:hitAsset` | `systems/wingmen.js:219` | `systems/automation.js:600` |
| `combat:hullRepair` | `combat/kernel.js:517` | — |
| `combat:kill` | `systems/world.js:6650` | `systems/factionPresence.js:543` |
| `combat:lockChanged` | `systems/weapons.js:1049` | `systems/onboarding.js:736`, `systems/world.js:706`, `ui/alerts.js:597` |
| `combat:outcome` | `systems/combatOutcome.js:457` | `systems/barkDirector.js:805` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:458` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:6079`, `systems/npcJobsRuntime.js:6445` | `combat/kernel.js:207` |
| `combat:requestAction` | — | `combat/kernel.js:204` |
| `combat:routeDamage` | `systems/bombs.js:1636`, `systems/capitalBossEncounters.js:112`, `systems/drill.js:2492`, `systems/foldAberrant.js:173`, `systems/hullBurst.js:554`, `systems/impulseCharges.js:1619`, `systems/mines.js:319`, `systems/missionObjectiveOps.js:2451`, `systems/theBolus.js:352`, `systems/tumbleStates.js:613` | `combat/kernel.js:206`, `systems/routeFollower.js:432` |
| `combat:shipjackPulse` | `combat/kernel.js:592` | — |
| `combat:shipjackShutdown` | `combat/kernel.js:607` | — |
| `combat:shockwavePass` | — | `render/asteroidMotionPresentation.js:518`, `render/vfx.js:2833` |
| `combat:shove` | `systems/onboarding.js:3262` | `audio/audioSystem.js:2970`, `systems/onboarding.js:636` |
| `combat:statusApplied` | `combat/statuses.js:212` | `render/vfx.js:2741`, `ui/stuntCallout.js:888` |
| `combat:statusExpired` | `combat/statuses.js:90`, `systems/bombs.js:1613` | `audio/bombAudio.js:464`, `systems/tumbleStates.js:143`, `ui/stuntCallout.js:909` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:260`, `systems/encounterDirector.js:353`, `systems/factionPresence.js:533`, `systems/npcJobsRuntime.js:1150`, `systems/presentationOrchestrator.js:245`, `systems/surrenderRecovery.js:96`, `systems/tumbleStates.js:147`, `systems/wingMorale.js:202`, `ui/alerts.js:578` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1767`, `systems/factionPresence.js:534`, `systems/npcJobsRuntime.js:1151`, `systems/presentationOrchestrator.js:254`, `systems/surrenderRecovery.js:97`, `ui/alerts.js:583` |
| `combat:surrendered` | — | `systems/combatOutcome.js:261`, `systems/surrenderRecovery.js:95` |
| `combat:tumbleRake` | `systems/tumbleStates.js:601` | `systems/barkDirector.js:863` |
| `combat:tumbled` | `systems/tumbleStates.js:559` | `render/shipMicroMotion.js:1750`, `systems/fields.js:734`, `systems/missions.js:1798`, `systems/tetherGameplay.js:346` |
| `combat:warded` | `combat/damage.js:450` | `audio/audioSystem.js:2856` |
| `combat:weakPointHit` | `systems/combat.js:1146` | `render/vfx.js:2731` |
| `comms:log` | `data/boundaryField.js:42`, `data/curlField.js:41`, `data/encounters/344-opening-hauler-raid.js:37`, `data/encounters/344-opening-hauler-raid.js:337`, `data/encounters/350-the-long-tail.js:229`, `data/encounters/350-the-long-tail.js:264`, `data/encounters/350-the-long-tail.js:282`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:155`, `data/encounters/352-the-slot.js:175`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:144`, `data/encounters/355-the-winnow-throw.js:161`, `data/encounters/355-the-winnow-throw.js:168`, `data/encounters/355-the-winnow-throw.js:186`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:73`, `data/encounters/357-the-handoff.js:246`, `data/encounters/357-the-handoff.js:261`, `data/encounters/357-the-handoff.js:296`, `data/encounters/357-the-handoff.js:312`, `data/encounters/357-the-handoff.js:355`, `data/encounters/358-the-press-camp.js:117`, `data/encounters/358-the-press-camp.js:153`, `data/encounters/358-the-press-camp.js:344`, `data/encounters/358-the-press-camp.js:358`, `data/encounters/358-the-press-camp.js:372`, `data/encounters/358-the-press-camp.js:382`, `data/encounters/362-the-salvage-watch.js:446`, `data/encounters/367-the-salvage-tail.js:337`, `data/encounters/700-the-weighing.js:142`, `data/encounters/700-the-weighing.js:227`, `data/encounters/701-spine-break.js:139`, `data/encounters/701-spine-break.js:155`, `data/encounters/701-spine-break.js:192`, `data/encounters/701-spine-break.js:208`, `data/encounters/702-the-swap.js:55`, `data/encounters/702-the-swap.js:180`, `data/encounters/702-the-swap.js:201`, `data/encounters/703-too-perfect-pack.js:117`, `data/encounters/703-too-perfect-pack.js:162`, `data/encounters/704-claim-jump.js:128`, `data/encounters/704-claim-jump.js:145`, `data/encounters/705-the-nest.js:359`, `data/encounters/705-the-nest.js:397`, `data/encounters/705-the-nest.js:551`, `data/laneField.js:53`, `data/laneField.js:65`, `data/velocityPlane.js:46`, `features/industrialDisasters/presentation.js:104`, `features/salvageOutfits/index.js:70`, `systems/alienEcology.js:600`, `systems/alienEcology.js:629`, `systems/alienEcology.js:652`, `systems/alienEcology.js:696`, `systems/alienEcology.js:706`, `systems/alienEcology.js:727`, `systems/alienEcology.js:734`, `systems/alienEcology.js:753`, `systems/alienEcology.js:1088`, `systems/alienEcology.js:1279`, `systems/alienEcology.js:1397`, `systems/alienEcology.js:1430`, `systems/alienEcology.js:1472`, `systems/alienEcology.js:1505`, `systems/alienEcology.js:1510`, `systems/alienEcology.js:1579`, `systems/alienEcology.js:1657`, `systems/alienEcology.js:1669`, `systems/alienEcology.js:1722`, `systems/alienEcology.js:2049`, `systems/alienEcology.js:2128`, `systems/alienEcology.js:2478`, `systems/alienEcology.js:2506`, `systems/alienEcology.js:2784`, `systems/alienEcology.js:2812`, `systems/alienEcology.js:2823`, `systems/alienEcology.js:2882`, `systems/alienEcology.js:2924`, `systems/alienEcology.js:3127`, `systems/alphabet.js:235`, `systems/asteroidSites.js:1861`, `systems/automation.js:3836`, `systems/borrowedSun.js:668`, `systems/contractClauses.js:774`, `systems/docket.js:210`, `systems/docket.js:220`, `systems/economy.js:3844`, `systems/encounterDirector.js:3178`, `systems/encounterScripts.js:779`, `systems/encounterScripts.js:3605`, `systems/encounterScripts.js:3864`, `systems/faction_archive.js:628`, `systems/faction_archive.js:851`, `systems/faction_archive.js:863`, `systems/faction_archive.js:932`, `systems/faction_archive.js:964`, `systems/faction_choir.js:580`, `systems/faction_choir.js:603`, `systems/faction_choir.js:623`, `systems/faction_choir.js:637`, `systems/faction_choir.js:816`, `systems/faction_choir.js:817`, `systems/faction_choir.js:855`, `systems/faction_choir.js:897`, `systems/faction_choir.js:935`, `systems/faction_choir.js:987`, `systems/faction_choir.js:993`, `systems/faction_choir.js:995`, `systems/faction_choir.js:1064`, `systems/faction_choir.js:1067`, `systems/faction_choir.js:1071`, `systems/faction_choir.js:1076`, `systems/faction_choir.js:1248`, `systems/faction_choir.js:1372`, `systems/faction_choir.js:1390`, `systems/faction_choir.js:1431`, `systems/faction_choir.js:1454`, `systems/faction_choir.js:1462`, `systems/faction_choir.js:1573`, `systems/faction_concord.js:159`, `systems/faction_frontier.js:643`, `systems/faction_frontier.js:719`, `systems/faction_frontier.js:798`, `systems/faction_frontier.js:855`, `systems/faction_frontier.js:943`, `systems/faction_frontier.js:1813`, `systems/faction_fulfillment.js:197`, `systems/faction_fulfillment.js:206`, `systems/faction_fulfillment.js:255`, `systems/faction_fulfillment.js:259`, `systems/faction_fulfillment.js:273`, `systems/faction_fulfillment.js:286`, `systems/faction_fulfillment.js:325`, `systems/faction_fulfillment.js:352`, `systems/faction_helix.js:567`, `systems/faction_helix.js:768`, `systems/faction_helix.js:836`, `systems/faction_meridian.js:433`, `systems/faction_meridian.js:695`, `systems/faction_pitborn.js:659`, `systems/faction_pitborn.js:769`, `systems/faction_pitborn.js:853`, `systems/faction_pitborn.js:879`, `systems/faction_pitborn.js:885`, `systems/faction_pitborn.js:888`, `systems/faction_pitborn.js:938`, `systems/faction_understory.js:828`, `systems/faction_understory.js:854`, `systems/faction_understory.js:901`, `systems/faction_understory.js:1026`, `systems/faction_understory.js:1068`, `systems/faction_understory.js:1228`, `systems/faction_vael.js:486`, `systems/faction_vael.js:499`, `systems/faction_vael.js:648`, `systems/faction_vael.js:698`, `systems/faction_vael.js:818`, `systems/faction_vael.js:819`, `systems/faction_vael.js:847`, `systems/faction_verge.js:556`, `systems/faction_verge.js:1660`, `systems/faction_verge.js:1719`, `systems/faction_verge.js:1756`, `systems/faction_verge.js:1807`, `systems/faction_verge.js:1817`, `systems/faction_verge.js:1843`, `systems/faction_verge.js:1867`, `systems/factions.js:578`, `systems/foldAberrant.js:44`, `systems/lamplighter.js:635`, `systems/lineHeads.js:292`, `systems/machineWork.js:14`, `systems/massSignature.js:507`, `systems/massSignature.js:524`, `systems/massSignature.js:623`, `systems/missionObjectiveOps.js:1341`, `systems/morrow.js:253`, `systems/nestVisit.js:117`, `systems/nestVisit.js:137`, `systems/precursorMachines.js:65`, `systems/precursorMachines.js:132`, `systems/precursorMachines.js:165`, `systems/precursorMachines.js:172`, `systems/precursorMachines.js:185`, `systems/precursorMachines.js:191`, `systems/precursorMachines.js:409`, `systems/precursorMachines.js:422`, `systems/precursorMachines.js:440`, `systems/precursorMachines.js:464`, `systems/precursorMachines.js:487`, `systems/precursorMachines.js:503`, `systems/precursorMachines.js:517`, `systems/precursorMachines.js:529`, `systems/precursorMachines.js:536`, `systems/precursorMachines.js:552`, `systems/precursorMachines.js:613`, `systems/precursorMachines.js:709`, `systems/precursorMachines.js:728`, `systems/precursorMachines.js:750`, `systems/precursorMachines.js:784`, `systems/precursorMachines.js:799`, `systems/precursorMachines.js:831`, `systems/precursorMachines.js:859`, `systems/precursorMachines.js:907`, `systems/precursorMachines.js:1026`, `systems/precursorMachines.js:1040`, `systems/precursorMachines.js:1086`, `systems/precursorMachines.js:1100`, `systems/precursorMachines.js:1166`, `systems/precursorMachines.js:1219`, `systems/precursorMachines.js:1227`, `systems/quill.js:482`, `systems/salvage.js:181`, `systems/salvage.js:980`, `systems/salvage.js:1051`, `systems/salvage.js:1085`, `systems/salvage.js:1247`, `systems/shipjack.js:73`, `systems/special500Director.js:214`, `systems/towlineTable.js:266`, `systems/vesper.js:287`, `systems/worldPressure.js:238`, `systems/worldPressure.js:286`, `world/motionFossil.js:41`, `world/playerHullEcho.js:100`, `world/playerHullEcho.js:111`, `world/playerHullEcho.js:133`, `world/vestaWinnowRecovery.js:159`, `world/vestaWinnowRecovery.js:342`, `world/vestaWinnowRecovery.js:552` | `ui/floatingText.js:117` |
| `comms:message` | `systems/precursorMachines.js:313`, `systems/trafficRoleOps.js:244`, `systems/trafficRoleOps.js:1232`, `systems/trafficRoleOps.js:1357` | — |
| `comms:popup` | `systems/ai.js:509`, `systems/bellhop.js:140`, `systems/bouncer.js:352`, `systems/bouncer.js:555`, `systems/bouncer.js:571`, `systems/bouncer.js:628`, `systems/bouncer.js:679`, `systems/bouncer.js:710`, `systems/bouncer.js:728`, `systems/careerContracts.js:456`, `systems/careerContracts.js:470`, `systems/careerContracts.js:486`, `systems/coldburnRey.js:64`, `systems/crew.js:250`, `systems/crew.js:361`, `systems/crew.js:382`, `systems/crew.js:507`, `systems/crew.js:523`, `systems/crew.js:539`, `systems/crew.js:561`, `systems/crew.js:570`, `systems/crew.js:590`, `systems/crew.js:614`, `systems/crew.js:623`, `systems/crew.js:646`, `systems/crew.js:667`, `systems/crew.js:692`, `systems/crew.js:712`, `systems/crew.js:741`, `systems/crew.js:771`, `systems/crew.js:788`, `systems/crew.js:800`, `systems/factionPresence.js:828`, `systems/factionPresence.js:1497`, `systems/factionPresence.js:1548`, `systems/factionPresence.js:1563`, `systems/furnaceIntake.js:111`, `systems/furnaceIntake.js:145`, `systems/gateThreeWeir.js:318`, `systems/gateThreeWeir.js:336`, `systems/gravedigger.js:533`, `systems/holdfast.js:163`, `systems/impoundGrudge.js:485`, `systems/kesslerScale.js:132`, `systems/kesslerScale.js:153`, `systems/kesslerScale.js:178`, `systems/lamplighter.js:630`, `systems/mail.js:212`, `systems/memorialThief.js:102`, `systems/missionObjectiveOps.js:193`, `systems/missionObjectiveOps.js:1234`, `systems/missionSpawningOps.js:484`, `systems/missionSpawningOps.js:802`, `systems/missionSpawningOps.js:932`, `systems/missionSpawningOps.js:946`, `systems/missionSpawningOps.js:957`, `systems/missionSpawningOps.js:1157`, `systems/missionSpawningOps.js:1219`, `systems/missionStoryOps.js:151`, `systems/missionStoryOps.js:1312`, `systems/missionStoryOps.js:1354`, `systems/missionStoryOps.js:1681`, `systems/missionStoryOps.js:1695`, `systems/missionStoryOps.js:1701`, `systems/missionStoryOps.js:1707`, `systems/missionStoryOps.js:1713`, `systems/missionStoryOps.js:1719`, `systems/missionStoryOps.js:1725`, `systems/missionStoryOps.js:1834`, `systems/missionStoryOps.js:1929`, `systems/missionStoryOps.js:1933`, `systems/missionStoryOps.js:2249`, `systems/missionStoryOps.js:2401`, `systems/missionStoryOps.js:2410`, `systems/missionStoryOps.js:2428`, `systems/missionStoryOps.js:2447`, `systems/missionStoryOps.js:2467`, `systems/missionStoryOps.js:2479`, `systems/missions.js:5005`, `systems/missions.js:5126`, `systems/missions.js:5254`, `systems/missions.js:5264`, `systems/missions.js:5272`, `systems/moistureLoss.js:148`, `systems/mop.js:135`, `systems/onboarding.js:1486`, `systems/onboarding.js:3700`, `systems/onboarding.js:3867`, `systems/quill.js:477`, `systems/receipt.js:111`, `systems/receipt.js:129`, `systems/receipt.js:177`, `systems/rookBooth.js:401`, `systems/rookBooth.js:427`, `systems/scenarioRuntime.js:186`, `systems/shepherd12.js:174`, `systems/slateColumn.js:108`, `systems/slateColumn.js:126`, `systems/slateColumn.js:149`, `systems/special500Director.js:206`, `systems/story.js:571`, `systems/story.js:1357`, `systems/story.js:1385`, `systems/tallyho.js:461`, `systems/tallyho.js:514`, `systems/tallyho.js:662`, `systems/tare.js:129`, `systems/wexTicket.js:121`, `systems/worldClock.js:165`, `ui/station/screens/bar.js:787` | `audio/audioSystem.js:3079`, `ui/screens/codex.js:904` |
| `concord:clampAttached` | `systems/faction_concord.js:220` | — |
| `concord:clampReleased` | `systems/faction_concord.js:198` | — |
| `concord:formationLocked` | `systems/faction_concord.js:153` | — |
| `concord:formationReformed` | `systems/faction_concord.js:177` | — |
| `conflict:flip` | `systems/factions.js:872` | `systems/factionPresence.js:542`, `systems/gateControlDirector.js:79`, `systems/sectorSim.js:148`, `systems/story.js:256` |
| `conflict:frontAction` | `systems/factions.js:755` | — |
| `conflict:warDeclared` | `systems/factions.js:812` | — |
| `contactHail:availability` | `systems/scanner.js:1982`, `systems/scanner.js:1999` | — |
| `contactHail:choice` | `ui/commsRadial.js:571`, `ui/contactHailPrompt.js:227` | `systems/scanner.js:1112` |
| `contactHail:clear` | `systems/scanner.js:2017` | — |
| `contactHail:handoff` | `systems/scanner.js:1716` | — |
| `contactHail:offer` | `systems/scanner.js:1757` | — |
| `contactHail:request` | `ui/commsRadial.js:631`, `ui/contactHailPrompt.js:221` | `systems/scanner.js:1111` |
| `contactHail:response` | `systems/scanner.js:1781`, `systems/scanner.js:1811` | `systems/traffic.js:2153` |
| `contraband:bribe` | `systems/encounterScripts.js:431` | `systems/economy.js:1881` |
| `contraband:scanned` | `systems/economy.js:5651` | `systems/encounterDirector.js:363`, `systems/factions.js:495`, `systems/heat.js:382`, `systems/lawSecurity.js:406`, `systems/lawSecurity.js:425`, `ui/customsPrompt.js:58` |
| `contract:clauseBroken` | `systems/contractClauses.js:787` | `systems/missions.js:1856` |
| `contract:clauseHonored` | `systems/contractClauses.js:706`, `systems/missions.js:5286` | `systems/contractClauses.js:385` |
| `contract:clauseSettledKill` | `systems/contractClauses.js:563` | `systems/missions.js:1737` |
| `countermeasure:denied` | `systems/countermeasures.js:572` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:554` | `render/shipMicroMotion.js:1770` |
| `counterplay:encountered` | `ai/counterplay/adventure.js:82` | `ui/toasts.js:635` |
| `craft:cancelled` | `systems/crafting.js:381` | — |
| `craft:complete` | `systems/crafting.js:350`, `systems/crafting.js:422` | `ui/station/screens/industry.js:599` |
| `craft:queueChanged` | `systems/crafting.js:211`, `systems/crafting.js:235`, `systems/crafting.js:360`, `systems/crafting.js:382` | `render/authoredMotion.js:1175`, `systems/onboarding.js:871`, `ui/station/screens/industry.js:599` |
| `credits:changed` | `systems/economy.js:4317`, `systems/economy.js:4329` | `audio/audioSystem.js:2918`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:465` |
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
| `cruise:charging` | `systems/cruise.js:178` | `render/vfx.js:2823`, `systems/presentationOrchestrator.js:181` |
| `cruise:dropped` | `systems/cruise.js:250` | `audio/audioSystem.js:3067`, `render/authoredMotion.js:1182`, `render/vfx.js:2825`, `systems/presentationOrchestrator.js:183` |
| `cruise:engaged` | `systems/cruise.js:133` | `audio/audioSystem.js:3063`, `render/vfx.js:2824`, `systems/presentationOrchestrator.js:182` |
| `cruise:snareRequest` | `systems/encounterScripts.js:611` | `render/authoredMotion.js:1181`, `systems/cruise.js:74` |
| `cruise:snared` | `systems/cruise.js:249` | `audio/audioSystem.js:3071` |
| `cruise:wrestleEscaped` | `systems/cruise.js:145` | — |
| `cruise:wrestleStarted` | `systems/cruise.js:82` | — |
| `custody:aftermathChanged` | — | `systems/combatOutcome.js:290` |
| `custody:aftermathSettled` | — | `systems/aftermathWrecks.js:1170` |
| `customs:breakScan` | `systems/encounterScripts.js:406` | `render/authoredMotion.js:1193` |
| `customs:massSlipFiled` | — | `systems/economyContracts.js:267` |
| `customs:scanAborted` | — | `ui/customsPrompt.js:59` |
| `customs:scanWaived` | — | `ui/customsPrompt.js:61` |
| `customs:submit` | `systems/encounterScripts.js:442` | `render/authoredMotion.js:1192`, `systems/lawSecurity.js:421` |
| `customs:trustMarked` | — | `ui/customsPrompt.js:60` |
| `customs:weirBolt` | — | `systems/economy.js:1880`, `systems/heat.js:397` |
| `danger:miningNoise` | `systems/mining.js:2885` | `audio/audioSystem.js:2863` |
| `day:tick` | `core/coreSystem.js:630` | `systems/crew.js:121`, `systems/custodyConsequences.js:58`, `systems/economy.js:1775`, `systems/encounterDirector.js:332`, `systems/factions.js:527`, `systems/impoundLot.js:1084`, `systems/sectorSim.js:128` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:233` | `systems/combat.js:852` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:224` | `systems/combat.js:851` |
| `deniable:fenceBurned` | — | `systems/fenceDesk.js:52` |
| `deniable:fenceEmboldened` | — | `systems/fenceDesk.js:51` |
| `deniable:fenceThanked` | `systems/encounterDirector.js:1139` | `systems/fenceDesk.js:50` |
| `derby:finished` | `data/encounters/706-breaker-derby.js:213` | — |
| `derby:slam` | `data/encounters/706-breaker-derby.js:143`, `data/encounters/706-breaker-derby.js:165` | — |
| `detonator:detonated` | `systems/impulseCharges.js:740` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:297` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:chartFiled` | `systems/world.js:4769` | — |
| `discovery:plateUnlocked` | `systems/world.js:1020`, `systems/world.js:6365`, `systems/world.js:7001`, `systems/world.js:7627` | `audio/audioSystem.js:2966`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:906` |
| `distress:call` | `systems/trafficRoleOps.js:242`, `systems/trafficRoleOps.js:295` | `audio/audioSystem.js:2834` |
| `distress:rescued` | `systems/encounterScripts.js:778` | `systems/factions.js:505` |
| `dock:attempt` | `ui/input.js:371` | `ui/dockDenyBanner.js:54` |
| `dock:committed` | `ui/dockStateCommit.js:19` | — |
| `dock:denied` | `ui/dockDenyBanner.js:79` | `render/authoredMotion.js:1224` |
| `dock:docked` | `balance/careerCohorts.js:530`, `balance/careerCohorts.js:2007`, `balance/careerCohorts.js:2068`, `balance/careerCohorts.js:2334`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `systems/world.js:6856`, `ui/input.js:375` | `audio/audioSystem.js:2969`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/authoredMotion.js:1222`, `render/infrastructureMotion.js:196`, `render/shipMicroMotion.js:1760`, `save/saveSystem.js:594`, `systems/achievements.js:1194`, `systems/aftermathWrecks.js:1167`, `systems/autoTargetAssist.js:148`, `systems/barkDirector.js:866`, `systems/combat.js:802`, `systems/crew.js:126`, `systems/economy.js:1839`, `systems/economyContracts.js:248`, `systems/encounterDirector.js:411`, `systems/factionPresence.js:527`, `systems/fenceDesk.js:49`, `systems/impoundLot.js:1085`, `systems/lawSecurity.js:416`, `systems/lawSecurity.js:420`, `systems/mining.js:295`, `systems/mining.js:297`, `systems/missions.js:1622`, `systems/onboarding.js:589`, `systems/onboarding.js:837`, `systems/pirateDisguise.js:434`, `systems/scanner.js:1117`, `systems/shieldPylons.js:247`, `systems/stationServices.js:276`, `systems/story.js:216`, `systems/world.js:743`, `systems/world.js:786`, `ui/alerts.js:478`, `ui/cargoConscience.js:144`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:55`, `ui/impoundPayPrompt.js:57`, `ui/impoundPayPrompt.js:62`, `ui/priceForecast.js:86`, `ui/promptDeck.js:863`, `ui/securityReadout.js:158`, `ui/station/screens/bar.js:168`, `ui/uiRoot.js:1509`, `ui/watchlistHud.js:90`, `ui/wingmanRadial.js:347`, `ui/worldObjectInteraction.js:427`, `ui/wreckChoicePrompt.js:54` |
| `dock:launder` | `ui/station/launderService.js:22`, `ui/station/launderService.js:73` | `systems/pirateDisguise.js:435` |
| `dock:range` | `core/physics.js:1664`, `core/physics.js:1668`, `ui/input.js:344` | `render/authoredMotion.js:1221`, `systems/onboarding.js:739`, `ui/alerts.js:474`, `ui/input.js:350` |
| `dock:undocked` | `balance/careerCohorts.js:531`, `balance/careerCohorts.js:2012`, `balance/careerCohorts.js:2073`, `balance/careerCohorts.js:2411`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:960`, `ui/station/stationApp.js:1058` | `audio/audioSystem.js:2974`, `render/authoredMotion.js:1223`, `render/infrastructureMotion.js:197`, `render/shipMicroMotion.js:1761`, `render/vfx.js:2700`, `save/saveSystem.js:595`, `systems/combat.js:807`, `systems/economy.js:1853`, `systems/economyContracts.js:277`, `systems/factionPresence.js:528`, `systems/missions.js:1648`, `systems/moralTrap.js:188`, `systems/onboarding.js:665`, `systems/pirateDisguise.js:438`, `systems/presentationAdapters.js:345`, `systems/stationServices.js:277`, `systems/world.js:744`, `ui/impoundPayPrompt.js:60`, `ui/impoundPayPrompt.js:65`, `ui/input.js:358`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1549` |
| `docket:delivered` | `systems/docket.js:219` | — |
| `docket:met` | `systems/docket.js:182`, `systems/docket.js:187` | — |
| `docket:voice` | `systems/docket.js:154` | — |
| `drift:claimContested` | `systems/faction_drift.js:244` | — |
| `drift:claimLifted` | `systems/faction_drift.js:217` | — |
| `drift:claimStaked` | `systems/faction_drift.js:240` | — |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1686` | `ui/uiRoot.js:1610` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1671`, `ui/sandbox/sandboxSetup.js:691` | `ui/uiRoot.js:1600` |
| `drill:approachRequested` | `ui/input.js:867` | `systems/tetherGameplay.js:345` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1563`, `ui/sandbox/sandboxSetup.js:690` | `ui/asteroid/asteroidScreen.js:2220`, `ui/uiRoot.js:1589` |
| `drill:backblast` | `systems/drill.js:2033` | `ui/asteroid/asteroidScreen.js:2122` |
| `drill:break` | `systems/asteroidSites.js:3101`, `systems/drill.js:1959`, `systems/drill.js:1987`, `systems/drill.js:2132`, `systems/drill.js:2450` | `audio/audioSystem.js:3293`, `render/authoredMotion.js:1186`, `systems/asteroidSites.js:684`, `systems/presentationOrchestrator.js:231`, `ui/asteroid/asteroidScreen.js:2149`, `ui/screens/drill.js:1935` |
| `drill:cargoFull` | `systems/drill.js:380`, `systems/drill.js:429` | `audio/audioSystem.js:3295`, `systems/presentationOrchestrator.js:238`, `ui/asteroid/asteroidScreen.js:2106`, `ui/screens/drill.js:1906` |
| `drill:caveIn` | `systems/drill.js:2152` | `audio/audioSystem.js:3301`, `systems/asteroidSites.js:704`, `ui/asteroid/asteroidScreen.js:2132` |
| `drill:chargeArm` | `systems/drill.js:1840`, `systems/drill.js:1850`, `systems/drill.js:1872` | — |
| `drill:chargeBlast` | `systems/drill.js:2039` | `audio/audioSystem.js:3298`, `systems/asteroidSites.js:744`, `ui/asteroid/asteroidScreen.js:2115` |
| `drill:chargePlanted` | `systems/drill.js:1913` | `audio/audioSystem.js:3297`, `systems/asteroidSites.js:743`, `ui/asteroid/asteroidScreen.js:2110` |
| `drill:chargeTick` | `systems/drill.js:2218` | `audio/audioSystem.js:3299` |
| `drill:end` | `systems/drill.js:1492` | `audio/audioSystem.js:3309`, `render/authoredMotion.js:1187`, `systems/asteroidSites.js:746`, `systems/faction_pitborn.js:644`, `systems/presentationOrchestrator.js:239` |
| `drill:gasHit` | `systems/drill.js:2009`, `systems/drill.js:2479` | `audio/audioSystem.js:3294`, `systems/presentationOrchestrator.js:233`, `ui/asteroid/asteroidScreen.js:2093`, `ui/screens/drill.js:1835` |
| `drill:gasVent` | `systems/drill.js:1958` | `audio/audioSystem.js:3302`, `systems/asteroidSites.js:719`, `ui/asteroid/asteroidScreen.js:2138` |
| `drill:retry` | `systems/drill.js:1541` | `systems/presentationOrchestrator.js:240` |
| `drill:rockCreak` | `systems/drill.js:2101` | `audio/audioSystem.js:3300`, `ui/asteroid/asteroidScreen.js:2126` |
| `drill:rockDepleted` | `systems/drill.js:325`, `systems/drill.js:359`, `systems/drill.js:438`, `systems/drill.js:1455` | `audio/audioSystem.js:3296`, `ui/asteroid/asteroidScreen.js:2103`, `ui/screens/drill.js:1897` |
| `drill:scanPulse` | `systems/drill.js:1619` | `audio/audioSystem.js:3303`, `systems/asteroidSites.js:768`, `systems/presentationOrchestrator.js:229`, `ui/asteroid/asteroidScreen.js:2143`, `ui/screens/drill.js:1923` |
| `drill:spark` | `systems/drill.js:2417` | `audio/audioSystem.js:3292`, `systems/presentationOrchestrator.js:230`, `ui/asteroid/asteroidScreen.js:2154`, `ui/screens/drill.js:1956` |
| `drill:start` | `systems/drill.js:1447` | `audio/audioSystem.js:3308`, `render/authoredMotion.js:1185`, `systems/asteroidSites.js:677`, `systems/onboarding.js:842`, `systems/presentationOrchestrator.js:228` |
| `drill:warn` | `systems/drill.js:332`, `systems/drill.js:383`, `systems/drill.js:392`, `systems/drill.js:430`, `systems/drill.js:1461`, `systems/drill.js:1466`, `systems/drill.js:1883`, `systems/drill.js:2102`, `systems/drill.js:2294`, `systems/drill.js:2329`, `systems/drill.js:2350`, `systems/drill.js:2369` | `audio/audioSystem.js:3304`, `systems/presentationOrchestrator.js:227`, `ui/asteroid/asteroidRenderer3d.js:7409`, `ui/asteroid/asteroidScreen.js:2099`, `ui/screens/drill.js:1863` |
| `drill:yield` | `systems/drill.js:357`, `systems/drill.js:425` | `audio/audioSystem.js:3289`, `systems/missions.js:1716`, `systems/presentationOrchestrator.js:232`, `ui/asteroid/asteroidScreen.js:2085`, `ui/screens/drill.js:1813` |
| `drone:grindStart` | `systems/automation.js:1161` | `render/authoredMotion.js:1171` |
| `drone:grindStop` | — | `render/authoredMotion.js:1172` |
| `dyingHull:begin` | `systems/dyingHull.js:353` | `render/vfx.js:2757` |
| `dyingHull:lost` | `systems/dyingHull.js:266`, `systems/dyingHull.js:413` | `render/vfx.js:2759` |
| `dyingHull:ruptured` | `systems/dyingHull.js:455` | `render/vfx.js:2758` |
| `ecology:claimCrew` | `systems/alienEcology.js:2785` | — |
| `ecology:coherence` | `systems/alienEcology.js:1416` | — |
| `ecology:collar` | `systems/alienEcology.js:611` | — |
| `ecology:evidence` | `systems/precursorMachines.js:134`, `systems/precursorMachines.js:135`, `systems/precursorMachines.js:417`, `systems/precursorMachines.js:803`, `systems/precursorMachines.js:835`, `systems/precursorMachines.js:1223`, `world/motionFossil.js:256`, `world/veilRayNursery.js:158` | `systems/world.js:789` |
| `ecology:factionOutcome` | `systems/economy.js:3213`, `systems/economy.js:3511` | `systems/world.js:788` |
| `ecology:fossilRecorded` | `world/motionFossil.js:231` | — |
| `ecology:fossilSettled` | `world/motionFossil.js:257` | — |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:753` | `systems/world.js:790` |
| `ecology:relayPulse` | `systems/alienEcology.js:1534` | `audio/audioSystem.js:3324` |
| `ecology:setpiece` | `systems/alienEcology.js:1565`, `systems/alienEcology.js:3004`, `systems/alienEcology.js:3070` | — |
| `economy:applyTradePressure` | `systems/automation.js:1020`, `systems/automation.js:2065`, `systems/automation.js:2066`, `systems/claims.js:1581`, `systems/encounterDirector.js:2579`, `systems/encounterDirector.js:2627`, `systems/lossLedger.js:613`, `systems/scavengerOccupationSwitch.js:588`, `systems/sectorSim.js:446`, `systems/trafficCausalChainOps.js:2755`, `systems/trafficRecoveryOps.js:333` | `systems/economy.js:1800` |
| `economy:auditorTally` | `systems/economy.js:3917` | — |
| `economy:cargoKillOpportunity` | `systems/economy.js:3380` | `systems/missions.js:1711` |
| `economy:chargeCredits` | `data/encounters/1206-the-fire-sale.js:259`, `data/encounters/1208-the-vetting.js:241`, `data/encounters/1212-the-clean-sheet.js:314`, `features/salvageTender/services.js:58`, `features/shipbreakingYard/runtime.js:274`, `shipjack/fleetOperations.js:113`, `shipjack/yardOperations.js:125`, `shipjack/yardOperations.js:191`, `shipjack/yardOperations.js:223`, `shipjack/yardOperations.js:236`, `systems/automation.js:2267`, `systems/automation.js:2275`, `systems/automation.js:3235`, `systems/automation.js:3462`, `systems/beacons.js:86`, `systems/bombs.js:848`, `systems/bombs.js:931`, `systems/bombs.js:949`, `systems/bombs.js:1015`, `systems/borrowedSun.js:684`, `systems/borrowedSun.js:1277`, `systems/claims.js:460`, `systems/claims.js:530`, `systems/claims.js:601`, `systems/claims.js:1669`, `systems/combat.js:1434`, `systems/crew.js:381`, `systems/crew.js:504`, `systems/crew.js:589`, `systems/crew.js:622`, `systems/drill.js:1898`, `systems/economy.js:4950`, `systems/eighthBellRuntime.js:304`, `systems/encounterDirector.js:2573`, `systems/faction_archive.js:751`, `systems/faction_choir.js:990`, `systems/faction_helix.js:598`, `systems/faction_meridian.js:422`, `systems/faction_pitborn.js:685`, `systems/faction_understory.js:1865`, `systems/faction_understory.js:1896`, `systems/faction_vael.js:532`, `systems/faction_vael.js:846`, `systems/faction_verge.js:663`, `systems/faction_verge.js:929`, `systems/faction_verge.js:1392`, `systems/faction_verge.js:1443`, `systems/factions.js:613`, `systems/fenceDesk.js:355`, `systems/gateControlDirector.js:128`, `systems/gateThreeWeir.js:538`, `systems/gateThreeWeir.js:608`, `systems/gateThreeWeir.js:640`, `systems/gateThreeWeir.js:723`, `systems/gravedigger.js:586`, `systems/impoundGrudge.js:744`, `systems/impoundGrudge.js:812`, `systems/longBerth.js:285`, `systems/manifestGame.js:32`, `systems/mining.js:752`, `systems/missions.js:2350`, `systems/missions.js:2353`, `systems/npcJobsRuntime.js:3548`, `systems/npcJobsRuntime.js:5712`, `systems/pirateParley.js:896`, `systems/quill.js:699`, `systems/quill.js:720`, `systems/quill.js:855`, `systems/shieldPylons.js:291`, `systems/shipjack.js:218`, `systems/ships.js:2525`, `systems/ships.js:2679`, `systems/ships.js:2785`, `systems/ships.js:2814`, `systems/tallyho.js:638`, `systems/world.js:4806`, `systems/world.js:4850`, `systems/world.js:6001` | `systems/economy.js:1764` |
| `economy:coldChainArmed` | `systems/economy.js:4090` | — |
| `economy:coldChainSpoiled` | `systems/economy.js:4143` | — |
| `economy:convoyShareBought` | `systems/economy.js:3708` | — |
| `economy:convoyShareSettled` | `systems/economy.js:3984`, `systems/economy.js:4038` | — |
| `economy:debtEscalated` | `systems/economy.js:4797` | — |
| `economy:demandShift` | `systems/economy.js:2252` | — |
| `economy:eventEnded` | `systems/economy.js:5745` | — |
| `economy:eventStarted` | `systems/economy.js:5720` | — |
| `economy:forwardSlipBought` | `systems/economy.js:3762` | — |
| `economy:forwardSlipSettled` | `systems/economy.js:4006`, `systems/economy.js:4051` | — |
| `economy:freightAccepted` | `systems/economy.js:3590`, `systems/economy.js:3642` | `systems/claims.js:418`, `systems/economyContracts.js:251`, `systems/missions.js:1707` |
| `economy:grantCredits` | `features/industrialDisasters/runtime.js:440`, `features/rigWorkshop/jobs.js:222`, `shipjack/fleetOperations.js:95`, `shipjack/fleetOperations.js:133`, `shipjack/yardOperations.js:192`, `shipjack/yardOperations.js:260`, `systems/alienEcology.js:726`, `systems/automation.js:2395`, `systems/automation.js:2406`, `systems/automation.js:3221`, `systems/bellhop.js:221`, `systems/bombs.js:968`, `systems/borrowedSun.js:636`, `systems/cargo.js:1235`, `systems/claims.js:1580`, `systems/claims.js:2456`, `systems/combat.js:1252`, `systems/combat.js:1264`, `systems/combat.js:1442`, `systems/crew.js:689`, `systems/encounterDirector.js:2574`, `systems/faction_archive.js:720`, `systems/faction_archive.js:733`, `systems/faction_choir.js:899`, `systems/faction_choir.js:936`, `systems/faction_choir.js:1092`, `systems/faction_choir.js:1361`, `systems/faction_choir.js:1571`, `systems/faction_frontier.js:889`, `systems/faction_helix.js:591`, `systems/faction_meridian.js:416`, `systems/faction_pitborn.js:679`, `systems/faction_pitborn.js:803`, `systems/faction_understory.js:1071`, `systems/faction_understory.js:1167`, `systems/faction_vael.js:526`, `systems/faction_verge.js:855`, `systems/fenceDesk.js:265`, `systems/fenceDesk.js:300`, `systems/gateThreeWeir.js:426`, `systems/gateThreeWeir.js:596`, `systems/gravedigger.js:581`, `systems/impoundGrudge.js:673`, `systems/lamplighter.js:651`, `systems/manifestGame.js:15`, `systems/mining.js:2453`, `systems/mining.js:2647`, `systems/mining.js:2808`, `systems/missionStoryOps.js:2162`, `systems/missions.js:5152`, `systems/missions.js:5299`, `systems/missions.js:5302`, `systems/missions.js:5828`, `systems/moralTrap.js:326`, `systems/npcJobsRuntime.js:3563`, `systems/npcJobsRuntime.js:3792`, `systems/quill.js:673`, `systems/quill.js:759`, `systems/quill.js:771`, `systems/rookBooth.js:554`, `systems/scanReveal.js:206`, `systems/scanReveal.js:241`, `systems/scavengerOccupationSwitch.js:603`, `systems/shieldPylons.js:337`, `systems/shieldPylons.js:573`, `systems/ships.js:2604`, `systems/ships.js:2874`, `systems/stationServices.js:420`, `systems/survivorPod.js:1262`, `systems/survivorPod.js:1615`, `systems/tallyho.js:632`, `systems/uniqueWrecks.js:1898`, `systems/world.js:4761`, `systems/wreckCourt.js:1029` | `systems/economy.js:1763`, `systems/onboarding.js:605`, `systems/story.js:251` |
| `economy:marketContractExpired` | `systems/economy.js:3971`, `systems/economy.js:4121` | — |
| `economy:marketOpened` | `ui/station/screens/market.js:2508` | `systems/economy.js:1780` |
| `economy:oreFlood` | `systems/sectorSim.js:718` | `systems/barkDirector.js:861`, `systems/economy.js:1828` |
| `economy:payBounty` | `ui/screens/footprint.js:1653` | `systems/economy.js:1767` |
| `economy:podIntakeAccepted` | `systems/economy.js:3803`, `systems/economy.js:3818` | — |
| `economy:releaseDebt` | `systems/stationServices.js:429` | `systems/economy.js:1765` |
| `economy:salvageIntakeApplied` | `systems/economy.js:4300` | `ui/alerts.js:513` |
| `economy:shortageRelieved` | `systems/economy.js:3634` | `systems/missions.js:1708` |
| `economy:shortageRepairRestored` | `systems/economyContracts.js:873` | — |
| `economy:sinkCharged` | `systems/economy.js:4343` | `ui/alerts.js:529` |
| `economy:tick` | `systems/economy.js:2017` | `systems/achievements.js:1180`, `systems/economyContracts.js:290` |
| `economy:towCharge` | `systems/world.js:6826` | `systems/economy.js:1873` |
| `economy:tradeCompleted` | `systems/economy.js:3199` | `audio/audioSystem.js:2921`, `audio/audioSystem.js:3033`, `careers/origins/haulerOriginSystem.js:90`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:602`, `systems/claims.js:415`, `systems/factions.js:471`, `systems/missions.js:1693`, `systems/missions.js:1709`, `systems/onboarding.js:596`, `systems/sectorSim.js:143`, `systems/story.js:246`, `ui/adventureDecisions.js:448`, `ui/station/screens/market.js:2042` |
| `economy:tradeFailed` | `systems/economy.js:3464`, `systems/economy.js:3496` | `audio/audioSystem.js:2927`, `ui/adventureDecisions.js:449`, `ui/station/screens/market.js:2041` |
| `emergent:audio` | `systems/emergentPrimitives.js:185`, `systems/environmentMaterials.js:154` | `audio/emergentPrimitiveVoice.js:83` |
| `emergent:contact` | `systems/emergentPrimitives.js:191` | `render/feel.js:1572` |
| `encounter:ambientPredationCleared` | — | `systems/barkDirector.js:856` |
| `encounter:ambientPredationTelegraph` | — | `systems/barkDirector.js:855` |
| `encounter:choiceOffered` | `features/industrialDisasters/presentation.js:125`, `features/industrialDisasters/presentation.js:173`, `systems/encounterDirector.js:2420` | `ui/encounterChoicePrompt.js:174` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:43` | `systems/encounterDirector.js:387` |
| `encounter:claimDefenseRoster` | `systems/encounterDirector.js:1665` | — |
| `encounter:convoyEscorted` | `systems/encounterScripts.js:3247` | — |
| `encounter:distressBroadcast` | `systems/encounterScripts.js:741` | `systems/encounterDirector.js:402` |
| `encounter:fingerprint` | `systems/encounterDirector.js:2510` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `data/encounters/586-the-blank-page.js:323`, `systems/encounterDirector.js:3219` | — |
| `encounter:lootSweepCollected` | `ai/lootSweep.js:494` | — |
| `encounter:lootSweepDispatched` | `ai/lootSweep.js:296` | — |
| `encounter:lootSweepEnded` | `ai/lootSweep.js:327` | — |
| `encounter:namedCaptainBound` | `systems/missionSpawningOps.js:661` | `systems/encounterDirector.js:361` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:2772`, `systems/encounterScripts.js:3831` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:3183` | `systems/barkDirector.js:823` |
| `encounter:predationCleared` | `systems/encounterScripts.js:1226` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1143`, `systems/encounterScripts.js:1211` | `render/authoredMotion.js:1190` |
| `encounter:predationTelegraph` | — | `render/authoredMotion.js:1207` |
| `encounter:receipt` | `systems/encounterDirector.js:2523` | `ui/recoveryEncounterPrompt.js:490` |
| `encounter:resolved` | `features/industrialDisasters/presentation.js:98`, `systems/encounterDirector.js:2505`, `systems/encounterDirector.js:2557`, `systems/survivalArena.js:1670` | `audio/audioSystem.js:2978`, `data/encounters/362-the-salvage-watch.js:80`, `data/encounters/367-the-salvage-tail.js:129`, `systems/aftermathWrecks.js:1166`, `systems/claims.js:430`, `systems/claims.js:431`, `systems/encounterDirector.js:398`, `systems/encounterDirector.js:403`, `systems/missions.js:1666`, `systems/story.js:156`, `systems/terrainAnchors.js:102`, `systems/traffic.js:2138`, `systems/traffic.js:2264`, `systems/uniqueLootAbilities.js:159`, `ui/encounterChoicePrompt.js:175` |
| `encounter:scarcityRumor` | `systems/encounterDirector.js:993` | — |
| `encounter:spawned` | `systems/encounterDirector.js:1782` | `systems/uniqueLootAbilities.js:158` |
| `encounter:stale` | `systems/encounterDirector.js:610` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1754`, `systems/survivalArena.js:1576` | `audio/audioSystem.js:2977`, `render/authoredMotion.js:1202`, `systems/survivalResults.js:518`, `systems/terrainAnchors.js:101`, `systems/world.js:753` |
| `encounter:voice` | `systems/encounterDirector.js:2403` | — |
| `encounter:waitStarted` | `data/encounters/367-the-salvage-tail.js:96`, `data/encounters/367-the-salvage-tail.js:262`, `systems/e1EncounterRuntime.js:490` | `ui/encounterChoicePrompt.js:176` |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:449` | `systems/story.js:171` |
| `endgame:archive` | `systems/story.js:232`, `systems/story.js:1119` | `ui/screens/codex.js:909` |
| `endgame:chosen` | `systems/story.js:1107` | `systems/traffic.js:2105`, `ui/screens/missionLog.js:2443` |
| `endgame:confirmRequired` | `systems/story.js:992` | `ui/screens/missionLog.js:2442` |
| `endgame:eligibility` | `systems/story.js:803` | `ui/screens/missionLog.js:2441` |
| `endgame:finaleCompleted` | `systems/story.js:879` | — |
| `endgame:finaleReady` | `systems/story.js:1116` | — |
| `endgame:ineligible` | `systems/story.js:889`, `systems/story.js:946`, `systems/story.js:972`, `systems/story.js:1037` | — |
| `endgame:loopBack` | — | `systems/story.js:240` |
| `endgame:promptChoiceC` | `systems/story.js:957` | — |
| `endgame:promptChoiceD` | `systems/story.js:915` | — |
| `endgame:promptSandbox` | `systems/story.js:814` | — |
| `endgame:pullCompleted` | `systems/claims.js:3356` | `systems/factions.js:518` |
| `endgame:sandboxContinued` | `systems/story.js:1101` | `ui/screens/missionLog.js:2444` |
| `entity:destroyed` | `core/newGameBoot.js:138`, `main.js:828`, `save/saveSystem.js:8104`, `systems/survivorPod.js:381`, `systems/trafficTugOps.js:279` | `audio/audioSystem.js:2810`, `combat/kernel.js:197`, `data/encounters/362-the-salvage-watch.js:196`, `render/vfx.js:2760`, `systems/aftermathWrecks.js:1145`, `systems/ai.js:121`, `systems/aiEncounter.js:135`, `systems/asteroidFormations.js:140`, `systems/asteroidSites.js:855`, `systems/automation.js:601`, `systems/cloak.js:94`, `systems/combatOutcome.js:264`, `systems/encounterDirector.js:351`, `systems/environmentalMachinery.js:270`, `systems/gateControlDirector.js:76`, `systems/heistFacilities.js:324`, `systems/lawSecurity.js:399`, `systems/missions.js:1739`, `systems/missions.js:1900`, `systems/missions.js:1904`, `systems/npcJobsRuntime.js:1135`, `systems/presentationOrchestrator.js:180`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:95`, `systems/survivalWave.js:199`, `systems/swarmArena.js:727`, `systems/swarmFortify.js:148`, `systems/swarmSupply.js:111`, `systems/traffic.js:2134`, `systems/traffic.js:2165`, `systems/traffic.js:2169`, `systems/world.js:723`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | `systems/tallyho.js:967` | `core/coreSystem.js:536` |
| `entity:killed` | `balance/careerCohorts.js:499`, `combat/damage.js:628`, `combat/kernel.js:139`, `systems/combat.js:1214`, `systems/tallyho.js:969` | `audio/audioSystem.js:2809`, `render/feel.js:1440`, `render/shipMicroMotion.js:1742`, `render/vfx.js:2754`, `systems/aftermathWrecks.js:1143`, `systems/ai.js:122`, `systems/asteroidSites.js:851`, `systems/barkDirector.js:814`, `systems/barkDirector.js:815`, `systems/barkDirector.js:857`, `systems/combatOutcome.js:258`, `systems/crew.js:99`, `systems/dyingHull.js:181`, `systems/economy.js:1824`, `systems/economy.js:1827`, `systems/encounterDirector.js:352`, `systems/environmentalMachinery.js:271`, `systems/faction_archive.js:588`, `systems/faction_choir.js:497`, `systems/faction_frontier.js:456`, `systems/faction_helix.js:502`, `systems/faction_meridian.js:365`, `systems/faction_pitborn.js:643`, `systems/faction_understory.js:673`, `systems/faction_vael.js:435`, `systems/factions.js:370`, `systems/factions.js:432`, `systems/gamepad.js:1115`, `systems/impoundGrudge.js:396`, `systems/impulseCharges.js:324`, `systems/killReplay.js:375`, `systems/lawSecurity.js:398`, `systems/lawSecurity.js:410`, `systems/lawSecurity.js:411`, `systems/lootShards.js:599`, `systems/lossLedger.js:464`, `systems/mining.js:290`, `systems/missions.js:1732`, `systems/missions.js:1899`, `systems/missions.js:1903`, `systems/npcJobsRuntime.js:1127`, `systems/onboarding.js:638`, `systems/onboarding.js:684`, `systems/pirateDisguise.js:437`, `systems/presentationOrchestrator.js:179`, `systems/rockCore.js:90`, `systems/sectorSim.js:147`, `systems/surrenderRecovery.js:104`, `systems/survivalResults.js:502`, `systems/survivalWave.js:200`, `systems/survivorPod.js:625`, `systems/swarmChain.js:162`, `systems/swarmElites.js:150`, `systems/swarmJuice.js:160`, `systems/swarmLegendaries.js:112`, `systems/swarmSupply.js:103`, `systems/titles.js:583`, `systems/traffic.js:2131`, `systems/traffic.js:2164`, `systems/wingMorale.js:201`, `systems/world.js:757`, `testing/playerTruth/reader.js:408`, `ui/uiRoot.js:946`, `ui/uiRoot.js:954` |
| `entity:spawnRequest` | `data/scanReveal.js:537`, `systems/salvageActions.js:276`, `systems/salvageActions.js:525` | `core/coreSystem.js:540` |
| `entity:spawned` | `core/coreSystem.js:370`, `core/coreSystem.js:409` | `combat/kernel.js:186`, `render/asteroidMotionPresentation.js:525`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:254`, `render/shipMicroMotion.js:1743`, `render/vfx.js:2766`, `sim/titleAttract.js:10`, `systems/aiEncounter.js:134`, `systems/barkDirector.js:800`, `systems/barkDirector.js:801`, `systems/combatOutcome.js:263`, `systems/factionPresence.js:540`, `systems/faction_understory.js:672`, `systems/fields.js:729`, `systems/flybyFocus.js:312`, `systems/lawSecurity.js:397`, `systems/lossLedger.js:462`, `systems/npcJobsRuntime.js:1111`, `systems/salvageActions.js:136`, `systems/scanReveal.js:68`, `systems/survivalSwarm.js:216`, `systems/swarmElites.js:149`, `systems/swarmFortify.js:149`, `systems/swarmSupply.js:109`, `systems/titles.js:584`, `systems/uniqueLootAbilities.js:161` |
| `environment:detonated` | — | `render/vfx.js:2804` |
| `environment:fractured` | — | `systems/sectorSim.js:163` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:551`, `systems/environmentalMachinery.js:1449` | `systems/terrainAnchors.js:103` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:1034` | `systems/terrainAnchors.js:107` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:1343` | `systems/terrainAnchors.js:105` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:1543` | `data/hazardLanguage.js:178` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:1046` | `systems/terrainAnchors.js:109` |
| `escalation:arrived` | `systems/encounterDirector.js:650` | — |
| `escalation:seeded` | `systems/encounterDirector.js:637` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:333`, `systems/factions.js:572`, `systems/factions.js:655`, `systems/factions.js:1041` | `systems/heat.js:404` |
| `faction:bribe` | `data/encounters/1208-the-vetting.js:277`, `ui/screens/footprint.js:1659` | `systems/factions.js:348` |
| `faction:repChanged` | `systems/factions.js:568`, `systems/factions.js:650`, `systems/factions.js:1037` | `audio/audioSystem.js:3030`, `systems/factionPresence.js:544`, `ui/station/screens/factions.js:447` |
| `faction:repDelta` | `balance/careerCohorts.js:270`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `features/industrialDisasters/runtime.js:441`, `systems/borrowedSun.js:641`, `systems/choirReliefBerth.js:425`, `systems/choirReliefBerth.js:459`, `systems/choirReliefBerth.js:480`, `systems/claims.js:2041`, `systems/economy.js:4450`, `systems/economy.js:5243`, `systems/economy.js:5643`, `systems/encounterDirector.js:2575`, `systems/faction_archive.js:723`, `systems/faction_archive.js:758`, `systems/faction_archive.js:1488`, `systems/faction_archive.js:1515`, `systems/faction_choir.js:900`, `systems/faction_choir.js:937`, `systems/faction_choir.js:999`, `systems/faction_choir.js:1068`, `systems/faction_choir.js:1072`, `systems/faction_choir.js:1077`, `systems/faction_choir.js:1128`, `systems/faction_choir.js:1156`, `systems/faction_choir.js:1362`, `systems/faction_choir.js:1572`, `systems/faction_frontier.js:895`, `systems/faction_helix.js:605`, `systems/faction_meridian.js:428`, `systems/faction_pitborn.js:691`, `systems/faction_understory.js:1070`, `systems/faction_understory.js:1173`, `systems/faction_vael.js:538`, `systems/faction_vael.js:878`, `systems/faction_verge.js:711`, `systems/faction_verge.js:730`, `systems/faction_verge.js:856`, `systems/faction_verge.js:1067`, `systems/faction_verge.js:1085`, `systems/faction_verge.js:1364`, `systems/faction_verge.js:1414`, `systems/faction_verge.js:1503`, `systems/faction_verge.js:1530`, `systems/faction_verge.js:1573`, `systems/faction_verge.js:1625`, `systems/fenceDesk.js:268`, `systems/gateThreeWeir.js:427`, `systems/gateThreeWeir.js:539`, `systems/gateThreeWeir.js:597`, `systems/gateThreeWeir.js:609`, `systems/gravedigger.js:591`, `systems/lamplighter.js:656`, `systems/missionStoryOps.js:2099`, `systems/missionStoryOps.js:2101`, `systems/missionStoryOps.js:2180`, `systems/missions.js:5825`, `systems/missions.js:5926`, `systems/moralTrap.js:320`, `systems/quill.js:700`, `systems/quill.js:900`, `systems/scavengerOccupationSwitch.js:761`, `systems/scavengerOccupationSwitch.js:766`, `systems/stuntGrammar.js:184`, `systems/stuntGrammar.js:192`, `systems/survivorPod.js:1251`, `systems/survivorPod.js:1621`, `systems/tallyho.js:644`, `systems/uniqueWrecks.js:1902`, `systems/world.js:4765`, `systems/world.js:7129`, `systems/world.js:7363` | `systems/factions.js:335` |
| `faction:repSpillover` | `systems/factions.js:648` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | `systems/factions.js:340` |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1846` | `systems/barkDirector.js:837` |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:1501` | `systems/story.js:280` |
| `factionPresence:berthGreeting` | `systems/factionPresence.js:1038` | — |
| `factionPresence:berthReturned` | `systems/factionPresence.js:1015` | — |
| `factionPresence:berthRobbed` | `systems/factionPresence.js:1001` | — |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1758` | `ui/uiRoot.js:556` |
| `factionPresence:conduct` | `systems/factionPresence.js:812`, `systems/factionPresence.js:919` | — |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:1335` | `systems/barkDirector.js:836` |
| `factionPresence:service` | `systems/factionPresence.js:1440` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1571` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:788`, `systems/factionPresence.js:959`, `systems/factionPresence.js:1151` | — |
| `fence:routeLegDue` | — | `systems/economyContracts.js:260` |
| `fence:scrubAsk` | — | `systems/fenceDesk.js:62` |
| `field:depletedChanged` | `systems/fieldDepletion.js:841` | `systems/world.js:711` |
| `field:opportunity` | `systems/world.js:5263` | — |
| `field:regrown` | `systems/world.js:5192` | `systems/presentationOrchestrator.js:225` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:769`, `systems/traffic.js:2677`, `systems/trafficCausalChainOps.js:2674` | `systems/presentationOrchestrator.js:226` |
| `field:richSeamOpened` | `systems/heliosClaimOpening.js:118`, `systems/trafficCausalChainOps.js:531` | `systems/traffic.js:2124` |
| `field:richSeamVisible` | `systems/heliosClaimOpening.js:107` | `systems/presentationOrchestrator.js:193` |
| `field:richSeamWorked` | `systems/mining.js:1197`, `systems/trafficRecoveryOps.js:698` | `systems/traffic.js:2125` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:840` | `systems/npcJobsRuntime.js:1143`, `systems/presentationOrchestrator.js:224` |
| `fields:anchorRegistered` | `systems/fields.js:1300` | `audio/audioSystem.js:3233`, `render/forceLanguage/fieldForcePresentation.js:61` |
| `fields:cleared` | `systems/fields.js:1892` | `audio/fieldAudio.js:321`, `render/forceLanguage/fieldForcePresentation.js:62` |
| `fields:clusterDetonate` | `systems/fields.js:2671` | `systems/presentationOrchestrator.js:287` |
| `fields:coneToggled` | `systems/fields.js:1576`, `systems/fields.js:1582`, `systems/fields.js:1676`, `systems/fields.js:1684` | `systems/onboarding.js:675` |
| `fields:deployDenied` | `systems/fields.js:1446` | — |
| `fields:deployed` | `systems/fields.js:938`, `systems/fields.js:1023`, `systems/fields.js:1518`, `systems/fields.js:1573`, `systems/fields.js:1667`, `systems/fields.js:1761` | `audio/audioSystem.js:3234`, `systems/fields.js:730`, `systems/onboarding.js:674` |
| `fields:ended` | `systems/fields.js:1327`, `systems/fields.js:1376`, `systems/fields.js:1683`, `systems/fields.js:1704`, `systems/fields.js:1840` | `audio/fieldAudio.js:318` |
| `fields:hitchCut` | `systems/fields.js:969` | — |
| `fields:hitchLatched` | `systems/fields.js:957` | — |
| `fields:pullMarked` | `systems/fields.js:1548` | — |
| `fields:specialistDisrupt` | `systems/fields.js:847` | `audio/fieldAudio.js:322` |
| `fields:thermalCreated` | `systems/fields.js:1931` | — |
| `fields:thermalHit` | `core/fields/thermalFields.js:35` | — |
| `firsthour:beat` | `systems/onboarding.js:4564` | — |
| `firsthour:complete` | `systems/onboarding.js:4581` | — |
| `firsthour:milestone` | `systems/onboarding.js:1786` | `audio/audioSystem.js:3226`, `testing/playerTruth/reader.js:403` |
| `firsthour:sentence` | `systems/onboarding.js:2887` | — |
| `firsthour:started` | `systems/onboarding.js:4231` | — |
| `firsthour:verb` | `systems/onboarding.js:4501` | — |
| `flight:modeChanged` | `systems/flightV3.js:1117` | — |
| `flight:racePrecision` | `systems/missions.js:4358` | `systems/flightV3.js:205` |
| `flight:sweptHull` | `systems/flightV3.js:1017` | — |
| `flybyFocus:cancel` | `systems/flybyFocus.js:372` | `render/cameraDirector.js:1345` |
| `flybyFocus:end` | `systems/flybyFocus.js:373` | `render/cameraDirector.js:1344` |
| `flybyFocus:start` | `systems/flybyFocus.js:510` | `systems/onboarding.js:621` |
| `formation:discovered` | `systems/asteroidFormations.js:329` | — |
| `freight:arrival` | `systems/trafficEscortOps.js:187` | `render/authoredMotion.js:1198`, `systems/economy.js:1820` |
| `freight:cargoSpilled` | `systems/encounterScripts.js:2128`, `systems/encounterScripts.js:2421`, `systems/trafficRoleOps.js:420` | `systems/barkDirector.js:811`, `systems/economy.js:1766`, `systems/encounterDirector.js:416`, `systems/lootShards.js:602`, `systems/presentationOrchestrator.js:300`, `systems/sectorSim.js:154`, `systems/traffic.js:2162`, `systems/traffic.js:2167`, `systems/traffic.js:2172` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1961` | `render/authoredMotion.js:1197`, `systems/aftermathWrecks.js:1168` |
| `freight:custodyRebound` | `systems/encounterDirector.js:843` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:2018`, `systems/encounterScripts.js:2040` | — |
| `freight:lootSweepStarted` | `systems/encounterScripts.js:1684` | — |
| `freight:loss` | `systems/encounterDirector.js:2637`, `systems/trafficCausalChainOps.js:2767`, `systems/trafficRecoveryOps.js:335` | `systems/claims.js:437`, `systems/economy.js:1821`, `systems/encounterDirector.js:417`, `systems/sectorSim.js:153` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1962` | `systems/surrenderRecovery.js:105` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:2577` | `systems/barkDirector.js:812` |
| `freight:recovery` | — | `systems/encounterDirector.js:359`, `systems/traffic.js:2156` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:360`, `systems/traffic.js:2157` |
| `freight:sweeperEscaped` | `systems/encounterScripts.js:1845` | — |
| `frontier:debtLapsed` | `systems/faction_frontier.js:1187` | — |
| `frontier:debtPosted` | `systems/faction_frontier.js:1122` | — |
| `frontier:debtSettled` | `systems/faction_frontier.js:1167` | — |
| `frontier:deed` | `systems/faction_frontier.js:870` | — |
| `frontier:defenseCalled` | `systems/faction_frontier.js:1497` | — |
| `frontier:defenseCleared` | `systems/faction_frontier.js:1505` | — |
| `frontier:defenseFailed` | `systems/faction_frontier.js:1526` | — |
| `frontier:disputeJumped` | `systems/faction_frontier.js:1340` | — |
| `frontier:disputeLapsed` | `systems/faction_frontier.js:1345` | — |
| `frontier:disputePosted` | `systems/faction_frontier.js:1230` | — |
| `frontier:disputeSettled` | `systems/faction_frontier.js:1319` | — |
| `frontier:homesteadLost` | `systems/faction_frontier.js:1535` | — |
| `frontier:jobTier` | `systems/faction_frontier.js:875` | — |
| `frontier:justiceFiled` | `systems/faction_frontier.js:908` | — |
| `frontier:leadPosted` | `systems/faction_frontier.js:1001` | — |
| `frontier:leadSoured` | `systems/faction_frontier.js:1016` | — |
| `frontier:leadVerified` | `systems/faction_frontier.js:1037` | — |
| `frontier:moduleRestocked` | `systems/faction_frontier.js:678` | — |
| `frontier:moduleSnapped` | `systems/faction_frontier.js:712` | — |
| `frontier:raidSpawned` | `systems/faction_frontier.js:1391` | — |
| `frontier:raiderRepelled` | `systems/faction_frontier.js:1707`, `systems/faction_frontier.js:1725` | — |
| `frontier:sitePlanted` | `systems/faction_frontier.js:639` | — |
| `frontier:steadStruck` | `systems/faction_frontier.js:1468` | — |
| `frontier:supplyDelivered` | `systems/faction_frontier.js:965` | — |
| `frontier:supplyRunAsked` | `systems/faction_frontier.js:942`, `systems/faction_frontier.js:1464` | — |
| `frontier:trafficTick` | `systems/faction_frontier.js:936` | — |
| `frontier:vendettaLapsed` | `systems/faction_frontier.js:1627` | — |
| `frontier:vendettaPaid` | `systems/faction_frontier.js:1686` | — |
| `frontier:vendettaPosted` | `systems/faction_frontier.js:1605` | — |
| `frontier:welded` | `systems/faction_frontier.js:1810` | — |
| `frontierRumor:acquired` | `systems/world.js:4869` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:7594` | — |
| `frontierRumor:contacted` | `systems/world.js:7490` | — |
| `frontierRumor:resolved` | `systems/world.js:4886` | — |
| `fuel:changed` | `features/salvageTender/services.js:142`, `systems/economy.js:4872`, `systems/economy.js:5033`, `systems/economy.js:5050`, `systems/stationServices.js:561`, `systems/stationServices.js:669`, `systems/stationServices.js:763`, `systems/world.js:6672`, `systems/world.js:6680` | — |
| `fuel:crackCell` | `ui/hud.js:3751` | `systems/world.js:705` |
| `fuel:empty` | `systems/world.js:6673` | `audio/audioSystem.js:3002`, `systems/economy.js:1871`, `ui/alerts.js:605` |
| `fulfillment:boardingDocked` | `systems/faction_fulfillment.js:285` | — |
| `fulfillment:boardingFlung` | `systems/faction_fulfillment.js:272` | — |
| `fulfillment:cargoFiled` | `systems/faction_fulfillment.js:324` | — |
| `fulfillment:derailed` | `systems/faction_fulfillment.js:194` | — |
| `fulfillment:hitchhike` | `systems/faction_fulfillment.js:253` | — |
| `fulfillment:orderOneClosed` | `systems/faction_fulfillment.js:351` | — |
| `fulfillment:rerailed` | `systems/faction_fulfillment.js:205` | — |
| `furnace:fed` | `systems/furnaceIntake.js:136` | `systems/missions.js:1678` |
| `game:embarkSpeculation` | `ui/sandbox/sandboxSetup.js:412`, `ui/screens/gameOver.js:577`, `ui/screens/newGame.js:1006` | — |
| `game:exitToMenu` | `ui/loadingPresenter.js:547`, `ui/screens/crucible.js:3874`, `ui/screens/gameOver.js:605`, `ui/screens/pause.js:1311` | `audio/audioSystem.js:3349`, `core/gameStartRecovery.js:19`, `main.js:412`, `save/saveSystem.js:620`, `systems/missions.js:1875`, `systems/runSession.js:115`, `systems/swarmFortify.js:151`, `ui/confirm.js:312`, `ui/loadingPresenter.js:589`, `ui/screens/crucibleLabControls.js:579`, `ui/uiRoot.js:1660` |
| `game:load` | `ui/input.js:525`, `ui/input.js:743`, `ui/screens/gameOver.js:566`, `ui/screens/mainMenu.js:800`, `ui/screens/saveLoad.js:1590` | `core/gameStartRecovery.js:12`, `save/saveSystem.js:424`, `systems/scanner.js:1116`, `ui/commandBar.js:482`, `ui/loadingPresenter.js:588`, `ui/loadingPresenter.js:615`, `ui/promptDeck.js:862` |
| `game:loadingProgress` | `main.js:140`, `main.js:214`, `main.js:263`, `main.js:296`, `main.js:468`, `main.js:770`, `main.js:864`, `main.js:919`, `main.js:946`, `main.js:980`, `main.js:991`, `main.js:1054`, `main.js:1226`, `save/saveSystem.js:6625` | `ui/loadingPresenter.js:565`, `ui/screens/newGame.js:958`, `ui/screens/saveLoad.js:1061` |
| `game:new` | `main.js:633`, `ui/physicsVenues.js:28`, `ui/sandbox/sandboxSetup.js:426`, `ui/screens/gameOver.js:592`, `ui/screens/newGame.js:1095`, `ui/screens/raceBoard.js:59` | `audio/audioSystem.js:3344`, `audio/bombAudio.js:458`, `audio/fieldAudio.js:325`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:554`, `core/gameStartRecovery.js:11`, `main.js:390`, `render/feel.js:1362`, `render/vfx.js:2776`, `render/vfx.js:2787`, `save/saveSystem.js:553`, `sim/killcamTape.js:471`, `systems/aftermathWrecks.js:1176`, `systems/aiEncounter.js:139`, `systems/bombs.js:692`, `systems/cloak.js:89`, `systems/combatOutcome.js:268`, `systems/countermeasures.js:224`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:80`, `systems/encounterDirector.js:349`, `systems/environmentalMachinery.js:274`, `systems/faction_frontier.js:465`, `systems/faction_helix.js:512`, `systems/fields.js:723`, `systems/impulseCharges.js:329`, `systems/killReplay.js:363`, `systems/massSeed.js:140`, `systems/masslineSnares.js:137`, `systems/masslineTelemetry.js:125`, `systems/mines.js:77`, `systems/mining.js:315`, `systems/planetRuntime.js:176`, `systems/presentationOrchestrator.js:289`, `systems/reactiveMatter.js:537`, `systems/rockCore.js:91`, `systems/salvageActions.js:143`, `systems/scanner.js:1115`, `systems/scissorwake.js:73`, `systems/shieldPylons.js:244`, `systems/ships.js:1890`, `systems/surrenderRecovery.js:111`, `systems/survivorPod.js:623`, `systems/swarmFortify.js:150`, `systems/swarmLegendaries.js:124`, `systems/tetherGameplay.js:337`, `systems/tumbleStates.js:145`, `ui/capitalBossOverlayMount.js:653`, `ui/commandBar.js:481`, `ui/hudLayout.js:123`, `ui/loadingPresenter.js:587`, `ui/loadingPresenter.js:614`, `ui/moralTrapPrompt.js:44`, `ui/promptDeck.js:861`, `ui/screens/crucibleLabControls.js:573`, `ui/uiRoot.js:763`, `ui/uiRoot.js:1664`, `ui/voiceArbiter.js:545`, `ui/wreckChoicePrompt.js:56` |
| `game:newGame` | `core/newGameBoot.js:167` | `audio/audioSystem.js:3345`, `audio/bombAudio.js:459`, `audio/fieldAudio.js:326`, `core/coreSystem.js:555`, `core/physics.js:207`, `render/npcJobSignatureVfx.js:903`, `render/shipMicroMotion.js:1746`, `render/vfx.js:2777`, `render/vfx.js:2788`, `save/saveSystem.js:558`, `systems/aftermathWrecks.js:1177`, `systems/bombs.js:695`, `systems/cloak.js:90`, `systems/collisionConsequences.js:111`, `systems/combatOutcome.js:275`, `systems/countermeasures.js:225`, `systems/difficultyDirector.js:169`, `systems/faction_frontier.js:466`, `systems/faction_helix.js:513`, `systems/fieldDepletion.js:757`, `systems/fragileCargo.js:407`, `systems/lossInvestigation.js:131`, `systems/lossLedger.js:467`, `systems/masslineTelemetry.js:126`, `systems/moistureLoss.js:85`, `systems/onboarding.js:568`, `systems/salvageActions.js:144`, `systems/scanReveal.js:67`, `systems/survivorPod.js:622`, `systems/titles.js:586`, `systems/tumbleStates.js:146`, `systems/wingMorale.js:203`, `ui/cargoConscience.js:148`, `ui/uiRoot.js:818` |
| `game:over` | `systems/combat.js:1171`, `systems/combat.js:1330` | `ui/confirm.js:311`, `ui/uiRoot.js:1626` |
| `game:retryStart` | `ui/loadingPresenter.js:530` | `core/gameStartRecovery.js:14` |
| `game:save` | `ui/input.js:524`, `ui/input.js:738`, `ui/screens/saveLoad.js:1623` | `save/saveSystem.js:404` |
| `game:scenePrepared` | `core/newGameBoot.js:234` | `systems/missions.js:1599`, `systems/onboarding.js:544`, `ui/loadingPresenter.js:631`, `ui/sandbox/sandboxSetup.js:483` |
| `game:startFailed` | `main.js:1176`, `ui/loadingPresenter.js:606` | `core/gameStartRecovery.js:13`, `ui/loadingPresenter.js:586`, `ui/sandbox/sandboxSetup.js:486`, `ui/screens/crucibleLabControls.js:575`, `ui/screens/newGame.js:957`, `ui/screens/saveLoad.js:1067` |
| `game:started` | `main.js:785` | `audio/audioSystem.js:3350`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:556`, `save/saveSystem.js:550`, `save/saveSystem.js:572`, `sim/killcamTape.js:470`, `systems/automation.js:640`, `systems/collisionConsequences.js:110`, `systems/combat.js:849`, `systems/economyContracts.js:254`, `systems/factionPresence.js:531`, `systems/faction_helix.js:514`, `systems/factions.js:332`, `systems/flight.js:83`, `systems/flightV3.js:224`, `systems/heat.js:411`, `systems/masslineSnares.js:138`, `systems/missions.js:1586`, `systems/onboarding.js:567`, `systems/presentationAdapters.js:343`, `systems/presentationOrchestrator.js:290`, `systems/sectorSim.js:134`, `systems/ships.js:2071`, `systems/story.js:154`, `systems/surrenderRecovery.js:112`, `systems/survivalDraft.js:220`, `systems/tetherGameplay.js:338`, `systems/wingmen.js:159`, `ui/alerts.js:499`, `ui/commandBar.js:480`, `ui/sandbox/sandboxSetup.js:478`, `ui/screens/crucibleLabControls.js:574`, `ui/uiRoot.js:764`, `ui/uiRoot.js:1618`, `ui/uiRoot.js:1655`, `ui/uiRoot.js:1665` |
| `gamepad:connected` | `systems/gamepad.js:1314` | — |
| `gamepad:disconnected` | `systems/gamepad.js:1262` | — |
| `gate:range` | `core/physics.js:1674`, `core/physics.js:1678` | `render/authoredMotion.js:1225`, `systems/onboarding.js:748`, `systems/presentationOrchestrator.js:184`, `ui/alerts.js:480` |
| `gate:verdict` | `systems/gateControlDirector.js:143` | `render/infrastructureMotion.js:198` |
| `gateThree:bondLapsed` | `systems/gateThreeWeir.js:434` | — |
| `gateThree:bonded` | `systems/gateThreeWeir.js:652` | — |
| `gateThree:contested` | `systems/gateThreeWeir.js:602`, `systems/gateThreeWeir.js:614` | — |
| `gateThree:evaded` | `systems/gateThreeWeir.js:544` | — |
| `gateThree:inspection` | `systems/gateThreeWeir.js:694` | — |
| `gateThree:laneWeighed` | `systems/gateThreeWeir.js:491` | — |
| `gateThree:logged` | `systems/gateThreeWeir.js:548`, `systems/gateThreeWeir.js:672`, `systems/gateThreeWeir.js:742` | — |
| `gateThree:maintenance` | `systems/gateThreeWeir.js:413` | — |
| `gateThree:weighed` | `systems/gateThreeWeir.js:668`, `systems/gateThreeWeir.js:735` | — |
| `graffiti:show` | `data/encounters/366-the-counting-relay.js:102`, `data/encounters/366-the-counting-relay.js:112`, `systems/blindWelderRuntime.js:153`, `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:276`, `systems/e1EncounterRuntime.js:668`, `systems/historyWear.js:103`, `systems/missionStoryOps.js:2464`, `systems/story.js:650`, `systems/story.js:664`, `systems/story.js:698`, `systems/story.js:1515`, `systems/story.js:1916`, `systems/story.js:2127`, `systems/uniqueWrecks.js:1908` | `systems/ships.js:2048`, `ui/comms.js:125`, `ui/screens/codex.js:905` |
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
| `harasser:disengaged` | `systems/encounterDirector.js:3029` | `systems/barkDirector.js:824`, `systems/barkDirector.js:931` |
| `hazard:changed` | `systems/world.js:1013`, `systems/world.js:6540` | `ui/alerts.js:622` |
| `hazard:enter` | `systems/environmentalMachinery.js:1483`, `systems/world.js:6411` | `data/hazardLanguage.js:174`, `render/shipMicroMotion.js:1753`, `ui/alerts.js:542` |
| `hazard:exit` | `systems/environmentalMachinery.js:1492`, `systems/world.js:6421` | `data/hazardLanguage.js:175`, `render/shipMicroMotion.js:1754`, `ui/alerts.js:553` |
| `heat:changed` | `systems/heat.js:935` | `audio/audioSystem.js:3005`, `render/vfx.js:2784`, `systems/barkDirector.js:838`, `systems/lawSecurity.js:417`, `systems/onboarding.js:687`, `systems/onboarding.js:690`, `systems/titles.js:593` |
| `heat:clear` | `systems/combat.js:2008` | `systems/heat.js:415` |
| `heat:scrubRequested` | `data/encounters/1212-the-clean-sheet.js:328`, `systems/fenceDesk.js:352` | `systems/heat.js:451` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:1057` | `systems/missions.js:1808` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1521` | — |
| `heist:captureFork` | `systems/heistFacilities.js:2060` | `systems/missions.js:1817` |
| `heist:counterweight` | `systems/heistFacilities.js:3201` | `systems/missions.js:1828` |
| `heist:counterweightSceneReceipt` | `systems/heistFacilities.js:3524`, `systems/heistFacilities.js:3532`, `systems/heistFacilities.js:3537`, `systems/heistFacilities.js:3559` | — |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1947` | `systems/missions.js:1813` |
| `heist:launchCue` | `systems/heistFacilities.js:451`, `systems/heistFacilities.js:3896` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:591`, `systems/heistFacilities.js:600`, `systems/heistFacilities.js:604`, `systems/heistFacilities.js:618` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:2509` | — |
| `heist:monitorScan` | `systems/heistFacilities.js:3853` | `systems/missions.js:1821` |
| `heist:observed` | `systems/heistFacilities.js:2720` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:2451` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:2432` | `systems/npcJobsRuntime.js:1160` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:2370` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:326` |
| `heist:routineReceipt` | `systems/heistFacilities.js:1810` | — |
| `heist:shipmentUnit` | `systems/heistFacilities.js:1925` | `systems/missions.js:1824` |
| `helix:appealHeard` | `systems/faction_helix.js:1456`, `systems/faction_helix.js:1466` | — |
| `helix:auditBegun` | `systems/faction_helix.js:1526` | — |
| `helix:auditEvaded` | `systems/faction_helix.js:1593` | — |
| `helix:auditRuled` | `systems/faction_helix.js:1584` | — |
| `helix:deed` | `systems/faction_helix.js:623` | — |
| `helix:deskFiled` | `systems/faction_helix.js:922` | — |
| `helix:deskLost` | `systems/faction_helix.js:960` | — |
| `helix:fineOverdue` | `systems/faction_helix.js:1385` | — |
| `helix:finePaid` | `systems/faction_helix.js:1430` | — |
| `helix:finePosted` | `systems/faction_helix.js:1370` | — |
| `helix:flagsDropped` | `systems/faction_helix.js:764` | — |
| `helix:garnished` | `systems/faction_helix.js:1404` | — |
| `helix:lienFiled` | `systems/faction_helix.js:832` | — |
| `helix:lienScraped` | `systems/faction_helix.js:806`, `systems/faction_helix.js:1927` | — |
| `helix:lienStuck` | `systems/faction_helix.js:866` | — |
| `helix:manifestFiled` | `systems/faction_helix.js:1491` | — |
| `helix:noticeJumped` | `systems/faction_helix.js:1888` | — |
| `helix:noticeLapsed` | `systems/faction_helix.js:953`, `systems/faction_helix.js:1199`, `systems/faction_helix.js:1214`, `systems/faction_helix.js:1250`, `systems/faction_helix.js:1288`, `systems/faction_helix.js:1311`, `systems/faction_helix.js:1326`, `systems/faction_helix.js:1892`, `systems/faction_helix.js:1909` | — |
| `helix:noticePosted` | `systems/faction_helix.js:1085` | — |
| `helix:noticeVerified` | `systems/faction_helix.js:1347` | — |
| `helix:precedent` | `systems/faction_helix.js:661` | — |
| `helix:tier` | `systems/faction_helix.js:628` | — |
| `helix:verdictFiled` | `systems/faction_helix.js:647` | — |
| `helix:warrantEscalated` | `systems/faction_helix.js:1660` | — |
| `helix:warrantPosted` | `systems/faction_helix.js:1675` | — |
| `helix:warrantSettled` | `systems/faction_helix.js:1739` | — |
| `helix:writLevy` | `systems/faction_helix.js:1812` | — |
| `helix:writSpawned` | `systems/faction_helix.js:1714` | — |
| `history:deadNoted` | `systems/historyWear.js:65` | — |
| `history:decal` | `systems/historyWear.js:90` | `systems/ships.js:2061` |
| `history:trinket` | `systems/historyWear.js:85` | `systems/ships.js:2057` |
| `hud:firstUse` | `systems/onboarding.js:1207`, `systems/tetherGameplay.js:2184`, `systems/tetherGameplay.js:2255` | — |
| `hud:layoutChanged` | `ui/hudLayout.js:86` | `save/saveSystem.js:606` |
| `hud:phase` | `systems/story.js:343`, `systems/story.js:373`, `systems/story.js:376`, `systems/story.js:739` | — |
| `hud:recallObjective` | `ui/input.js:561` | — |
| `hud:slotClaim` | `ui/promptDeck.js:243` | — |
| `hud:slotRelease` | `ui/promptDeck.js:244` | — |
| `hud:tagFlicker` | `systems/story.js:716` | — |
| `hull:fractured` | `systems/hullFracture.js:549` | `render/authoredMotion.js:1168` |
| `hullBurst:activated` | `systems/hullBurst.js:231` | — |
| `hullBurst:ended` | `systems/hullBurst.js:253` | — |
| `hullBurst:hit` | `systems/hullBurst.js:400`, `systems/hullBurst.js:431`, `systems/hullBurst.js:610` | `render/authoredMotion.js:1166` |
| `hullBurst:released` | `systems/hullBurst.js:545` | — |
| `ilexArk:accepted` | `systems/ilexArk.js:178` | — |
| `ilexArk:finished` | `systems/ilexArk.js:210` | — |
| `ilexArk:harvested` | `systems/economy.js:4214` | — |
| `ilexArk:offer` | `systems/ilexArk.js:242` | `ui/ilexArkPrompt.js:7` |
| `ilexArk:vaultDelivered` | `systems/ilexArk.js:196` | — |
| `ilexArk:vaultReleased` | `systems/ilexArk.js:118` | — |
| `impoundGrudge:escalated` | `systems/impoundGrudge.js:632` | — |
| `impoundGrudge:offer` | `systems/impoundGrudge.js:714` | — |
| `impoundGrudge:offerRefused` | `systems/impoundGrudge.js:728` | — |
| `impoundGrudge:resolved` | `systems/impoundGrudge.js:689` | — |
| `impoundGrudge:sabotage` | `systems/impoundGrudge.js:814` | — |
| `impoundGrudge:settled` | `systems/impoundGrudge.js:748` | — |
| `impoundGrudge:surfaced` | `systems/impoundGrudge.js:1069` | — |
| `impoundGrudge:surfacingEnded` | `systems/impoundGrudge.js:646` | — |
| `impoundGrudge:tracked` | `systems/impoundGrudge.js:804` | — |
| `industrialDisasters:commandRejected` | `features/industrialDisasters/runtime.js:208` | — |
| `industrialDisasters:consequence` | `features/industrialDisasters/runtime.js:442` | — |
| `industrialDisasters:discover` | `features/industrialDisasters/encounter.js:17` | — |
| `industrialDisasters:event` | `features/industrialDisasters/runtime.js:404` | — |
| `industrialDisasters:inspect` | `features/industrialDisasters/runtime.js:319`, `features/industrialDisasters/runtime.js:415` | — |
| `industrialDisasters:poses` | `features/industrialDisasters/workerAdapter.js:118` | — |
| `industrialDisasters:signal` | `features/industrialDisasters/runtime.js:264` | — |
| `industrialDisasters:status` | `features/industrialDisasters/runtime.js:455` | — |
| `industry:haulRequested` | `systems/environmentalMachinery.js:1075` | `systems/traffic.js:2278` |
| `input:worldGestureCancelled` | `systems/input.js:1370`, `ui/worldObjectInteraction.js:195` | `systems/masslineThrow.js:129` |
| `interdiction:triggered` | `systems/encounterScripts.js:612`, `systems/world.js:5860` | `render/authoredMotion.js:1180`, `systems/presentationOrchestrator.js:192`, `systems/sectorSim.js:144` |
| `intervention:available` | `systems/intervention.js:263` | — |
| `intervention:closed` | `systems/intervention.js:316` | — |
| `intervention:jumperRipped` | `systems/intervention.js:435` | — |
| `intervention:logged` | `systems/intervention.js:139` | — |
| `jump:arrive` | `systems/world.js:5800` | `render/authoredMotion.js:1228`, `render/feel.js:1534`, `render/shipMicroMotion.js:1758`, `save/saveSystem.js:597`, `systems/gateControlDirector.js:74`, `systems/onboarding.js:765`, `systems/presentationOrchestrator.js:190`, `systems/sectorSim.js:168` |
| `jump:chargeAbort` | `systems/world.js:5940`, `systems/world.js:6033`, `systems/world.js:6099` | `audio/audioSystem.js:2984`, `render/authoredMotion.js:1229`, `render/shipMicroMotion.js:1759`, `systems/gateControlDirector.js:75`, `systems/presentationOrchestrator.js:189`, `systems/routeFollower.js:423`, `ui/galaxyMap.js:2841`, `ui/toasts.js:854` |
| `jump:chargeStart` | `systems/world.js:6015`, `systems/world.js:6059` | `render/authoredMotion.js:1226`, `render/feel.js:1524`, `render/shipMicroMotion.js:1755`, `systems/cloak.js:55`, `systems/cruise.js:72`, `systems/gateControlDirector.js:72`, `systems/missions.js:1615`, `systems/presentationOrchestrator.js:186`, `systems/story.js:222`, `ui/galaxyMap.js:2840` |
| `jump:chargeTick` | `systems/world.js:5733` | `render/authoredMotion.js:1220`, `render/shipMicroMotion.js:1756`, `systems/presentationOrchestrator.js:187` |
| `jump:departurePreflight` | `systems/world.js:5997` | `systems/story.js:221` |
| `jump:interdictionWarning` | `systems/world.js:5759` | — |
| `jump:start` | `systems/world.js:5764` | `audio/audioSystem.js:2983`, `render/authoredMotion.js:1227`, `render/feel.js:1528`, `render/shipMicroMotion.js:1757`, `systems/economy.js:1876`, `systems/gateControlDirector.js:73`, `systems/mining.js:298`, `systems/presentationOrchestrator.js:188`, `systems/sectorSim.js:167` |
| `jump:unfiledConfirmed` | `systems/world.js:6079` | `systems/story.js:223` |
| `kesslerPod:weighed` | `systems/kesslerScale.js:182` | `systems/missions.js:1662` |
| `kilnback:caskReleased` | `systems/kilnback.js:153` | — |
| `kilnback:caskSalvaged` | `systems/kilnback.js:214` | — |
| `kilnback:coolantReleased` | `systems/kilnback.js:202` | — |
| `kilnback:phase` | `systems/kilnback.js:242` | — |
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
| `landmark:artifactRecovered` | `systems/missionObjectiveOps.js:770` | `systems/world.js:745` |
| `lane:facadeMiss` | `core/registry.js:1135` | — |
| `lastShift:archive` | `ui/lastShiftPrompt.js:89` | — |
| `lastShift:archived` | `systems/lastShift.js:297` | — |
| `lastShift:cancelRecovery` | `ui/lastShiftPrompt.js:91` | — |
| `lastShift:cue` | `systems/lastShift.js:206` | `ui/lastShiftPrompt.js:25` |
| `lastShift:cueSurfaced` | `ui/lastShiftPrompt.js:56` | — |
| `lastShift:offer` | `systems/lastShift.js:278` | `ui/lastShiftPrompt.js:26` |
| `lastShift:readRecovery` | `ui/lastShiftPrompt.js:86`, `ui/lastShiftPrompt.js:88` | — |
| `lastShift:recorderReturned` | `systems/lastShift.js:338` | — |
| `lastShift:recover` | `ui/lastShiftPrompt.js:90` | — |
| `lastShift:returnRecorder` | `ui/lastShiftPrompt.js:92` | — |
| `law:audit` | — | `systems/lawSecurity.js:428` |
| `law:custodyAcknowledged` | — | `systems/barkDirector.js:826` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:57`, `systems/lossLedger.js:468` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:816` |
| `law:distressRaised` | — | `systems/barkDirector.js:835` |
| `law:fineAssessed` | — | `systems/barkDirector.js:829`, `ui/impoundPayPrompt.js:58` |
| `law:fineChoice` | `ui/impoundPayPrompt.js:224`, `ui/impoundPayPrompt.js:318` | `systems/lawSecurity.js:426` |
| `law:fineRefused` | — | `ui/impoundPayPrompt.js:59` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:101` | `systems/lawSecurity.js:418` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:52` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:53` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:59` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:61`, `systems/heat.js:425`, `ui/impoundPayPrompt.js:54` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:55` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:60` |
| `law:incidentOpened` | — | `systems/traffic.js:2180` |
| `law:incidentResolved` | — | `systems/barkDirector.js:833` |
| `law:killedAdjudicated` | — | `systems/factions.js:357` |
| `law:obligationNoted` | — | `ui/impoundPayPrompt.js:63` |
| `law:obligationPaid` | — | `systems/factions.js:365`, `ui/impoundPayPrompt.js:64` |
| `law:playerSurrender` | — | `systems/lawSecurity.js:427` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:822`, `systems/factions.js:445`, `systems/heat.js:448` |
| `law:response` | — | `systems/barkDirector.js:832` |
| `law:responseDeferred` | — | `systems/barkDirector.js:831` |
| `law:sanctuaryWithdrawal` | — | `systems/barkDirector.js:830` |
| `law:sponsorPay` | — | `systems/lawSecurity.js:419` |
| `law:sponsorSettled` | — | `systems/heat.js:433` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:421` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:818` |
| `law:wantedSweepEscaped` | — | `systems/heat.js:429` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:817` |
| `law:wantedWarrantReleased` | — | `systems/barkDirector.js:834` |
| `law:warrantIssued` | `data/encounters/700-the-weighing.js:286` | — |
| `law:witnessChoice` | — | `systems/encounterDirector.js:415` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `render/authoredMotion.js:1191`, `systems/lawSecurity.js:405` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `ledger:evidenceLinked` | `ui/shipLedgerPanel.js:545` | `systems/story.js:183` |
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
| `loot:drop` | `systems/combat.js:1268`, `systems/lootShards.js:1158`, `systems/stuntGrammar.js:202` | `systems/mining.js:292` |
| `loot:magnetCaptured` | `systems/lootShards.js:737` | `audio/audioSystem.js:2897` |
| `loot:manifestPayload` | `systems/lootShards.js:1267` | `systems/missions.js:1908`, `systems/traffic.js:2163`, `systems/traffic.js:2168` |
| `loot:overflowConverted` | `systems/mining.js:2813` | `audio/audioSystem.js:2896` |
| `lossInvestigation:closed` | `systems/lossInvestigation.js:331` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:194` | `systems/lossInvestigation.js:129` |
| `lossLedger:claimSurvey` | `systems/scanReveal.js:172` | `systems/lossLedger.js:463` |
| `lossLedger:priceMove` | `systems/lossLedger.js:622` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:403` | `systems/factionPresence.js:532`, `systems/ships.js:1998` |
| `machine:appealAccepted` | `systems/precursorMachines.js:187` | — |
| `machine:jurisdictionResolved` | `systems/machineWork.js:262` | — |
| `machine:repairCompleted` | `systems/machineWork.js:221`, `systems/machineWork.js:328` | — |
| `machine:tokenDelivered` | `systems/precursorMachines.js:1046`, `systems/precursorMachines.js:1107` | — |
| `machine:workpiecePlaced` | `systems/machineWork.js:398` | — |
| `mail:delivered` | `systems/mail.js:220` | — |
| `manifest:changed` | `systems/manifestGame.js:10` | `ui/screens/manifest.js:23` |
| `manifest:completed` | `systems/manifestGame.js:17` | — |
| `map:sectorCharted` | `systems/world.js:4810` | `systems/economy.js:1785` |
| `massSeed:cleared` | `systems/massSeed.js:613` | — |
| `massSeed:collapsed` | `systems/massSeed.js:436`, `systems/massSeed.js:486`, `systems/massSeed.js:566`, `systems/massSeed.js:596` | `render/authoredMotion.js:1219` |
| `massSeed:collapsing` | `systems/massSeed.js:435`, `systems/massSeed.js:457`, `systems/massSeed.js:552`, `systems/massSeed.js:594` | `audio/audioSystem.js:3204` |
| `massSeed:deployDenied` | `systems/massSeed.js:175` | — |
| `massSeed:deployed` | `systems/massSeed.js:265` | `audio/audioSystem.js:3188`, `render/authoredMotion.js:1216`, `systems/onboarding.js:991` |
| `massSeed:destroyed` | `systems/massSeed.js:593` | — |
| `massSeed:locked` | `systems/massSeed.js:322` | `audio/audioSystem.js:3196`, `render/authoredMotion.js:1217` |
| `massSeed:locking` | `systems/massSeed.js:387` | `audio/audioSystem.js:3192` |
| `massSeed:tetherCut` | `systems/massSeed.js:514` | `audio/audioSystem.js:3209`, `render/authoredMotion.js:1218` |
| `massSeed:warning` | `systems/massSeed.js:349` | `audio/audioSystem.js:3200` |
| `massline:bridleCut` | `systems/tetherGameplay.js:1092` | `ui/stuntCallout.js:882` |
| `massline:bridleEnded` | `systems/tetherGameplay.js:1029`, `systems/tetherGameplay.js:1047`, `systems/tetherGameplay.js:1266` | `ui/masslineHud.js:1154` |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:886` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:940` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:1102` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2807` | — |
| `massline:flailOffer` | `systems/tetherGameplay.js:514`, `systems/tetherGameplay.js:724` | `systems/rockCore.js:94` |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:3010` | `systems/barkDirector.js:919` |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1953` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:2076` | `systems/gamepad.js:1016` |
| `massline:recovered` | `systems/tumbleStates.js:267` | — |
| `massline:recovering` | `systems/tumbleStates.js:696` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:186` | `audio/audioSystem.js:2884` |
| `massline:releaseValidated` | `systems/masslineThrow.js:629` | `systems/presentationOrchestrator.js:167` |
| `massline:releaseWindow` | `systems/masslineThrow.js:247` | `ui/stuntCallout.js:874` |
| `massline:rideStarted` | `systems/tetherGameplay.js:2228` | `ui/stuntCallout.js:875` |
| `massline:selfSling` | `systems/masslineThrow.js:658` | `systems/flightV3.js:248`, `systems/onboarding.js:955`, `ui/stuntCallout.js:799` |
| `massline:snareArmed` | `systems/masslineSnares.js:239` | `audio/audioSystem.js:3180`, `render/authoredMotion.js:1157` |
| `massline:snareCaught` | `systems/masslineSnares.js:434` | `systems/gamepad.js:1007` |
| `massline:snareCut` | `systems/masslineSnares.js:727` | `audio/audioSystem.js:3184` |
| `massline:snareDeployed` | `systems/masslineSnares.js:341`, `systems/masslineSnares.js:686` | `render/authoredMotion.js:1151` |
| `massline:snareEnded` | `systems/masslineSnares.js:729` | `render/authoredMotion.js:1155` |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `render/vfx.js:2772`, `systems/masslineImpactDamage.js:58`, `systems/presentationOrchestrator.js:154`, `ui/stuntCallout.js:881` |
| `massline:threat` | `systems/masslineThreats.js:273` | `systems/presentationOrchestrator.js:130` |
| `massline:throw` | `systems/masslineThrow.js:571` | `systems/lootShards.js:601`, `systems/mines.js:74`, `systems/missions.js:1796`, `systems/tumbleStates.js:129`, `ui/stuntCallout.js:877` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:695` | `render/feel.js:1619`, `render/shipMicroMotion.js:1751` |
| `massline:tumbled` | `systems/tumbleStates.js:560` | `render/feel.js:1605` |
| `matter:refused` | `matter/collectorKnot.js:97`, `systems/gyreSnare.js:2279`, `systems/gyreSnare.js:2747` | `ui/arsenalDenials.js:31` |
| `mercyService:completed` | `response/mercyService/live.js:226` | — |
| `mercyService:failedForward` | `response/mercyService/live.js:272` | — |
| `mercyService:order` | `ui/physicalJobsPrompt.js:25` | — |
| `mercyService:started` | `response/mercyService/live.js:83` | — |
| `mercyService:tool` | `ui/physicalJobsPrompt.js:28` | — |
| `mercyService:toolResult` | `response/mercyService/live.js:53` | — |
| `meridian:accountCharged` | `systems/faction_meridian.js:477` | — |
| `meridian:accountPaid` | `systems/faction_meridian.js:628` | — |
| `meridian:accountWarned` | `systems/faction_meridian.js:1454` | — |
| `meridian:assessmentCharged` | `systems/faction_meridian.js:1450` | — |
| `meridian:blacklistLifted` | `systems/faction_meridian.js:1425` | — |
| `meridian:blacklisted` | `systems/faction_meridian.js:1418`, `systems/faction_meridian.js:1436` | — |
| `meridian:claimPosted` | `systems/faction_meridian.js:959` | — |
| `meridian:claimSettled` | `systems/faction_meridian.js:1014` | — |
| `meridian:claimStolen` | `systems/faction_meridian.js:1058` | — |
| `meridian:containerRecoupled` | `systems/faction_meridian.js:725` | — |
| `meridian:containerSold` | `data/encounters/701-spine-break.js:191` | — |
| `meridian:contractDefaulted` | `systems/faction_meridian.js:920` | — |
| `meridian:contractDelivered` | `systems/faction_meridian.js:878` | — |
| `meridian:contractExpired` | `systems/faction_meridian.js:890` | — |
| `meridian:contractPosted` | `systems/faction_meridian.js:838` | — |
| `meridian:contractTaken` | `systems/faction_meridian.js:607` | — |
| `meridian:convoyArrived` | `systems/faction_meridian.js:1243` | — |
| `meridian:convoyDeparted` | `systems/faction_meridian.js:1156` | — |
| `meridian:convoyLost` | `systems/faction_meridian.js:1265` | — |
| `meridian:convoyRaided` | `systems/faction_meridian.js:1294` | — |
| `meridian:couplerSnapped` | `systems/faction_meridian.js:692` | — |
| `meridian:deed` | `systems/faction_meridian.js:451` | — |
| `meridian:escortAsked` | `systems/faction_meridian.js:1160` | — |
| `meridian:escortSigned` | `systems/faction_meridian.js:1209` | — |
| `meridian:levyCollected` | `systems/faction_meridian.js:1513` | — |
| `meridian:raiderPlucked` | `systems/faction_meridian.js:1345` | — |
| `meridian:raiderRepelled` | `systems/faction_meridian.js:1680` | — |
| `meridian:refused` | `systems/faction_meridian.js:497` | — |
| `meridian:repoFielded` | `systems/faction_meridian.js:1552` | — |
| `meridian:tickerFloor` | `systems/faction_meridian.js:744` | — |
| `meridian:tier` | `systems/faction_meridian.js:446` | — |
| `meridian:verdictFiled` | `systems/faction_meridian.js:463` | — |
| `meridian:warrantLapsed` | `systems/faction_meridian.js:1403` | — |
| `meridian:warrantPaid` | `systems/faction_meridian.js:1660` | — |
| `meridian:warrantPosted` | `systems/faction_meridian.js:1378` | — |
| `meridian:writPosted` | `systems/faction_meridian.js:1475` | — |
| `meridian:writSettled` | `systems/faction_meridian.js:1572` | — |
| `mines:armed` | `systems/mines.js:189`, `systems/mines.js:222` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:96` | `audio/audioSystem.js:2928` |
| `mines:detonated` | `systems/mines.js:299` | `audio/audioSystem.js:2841` |
| `mines:placeRequest` | `systems/encounterScripts.js:152`, `systems/impoundGrudge.js:986`, `systems/survivalArena.js:1547`, `systems/swarmEvents.js:278` | `systems/mines.js:73` |
| `mines:placed` | `systems/mines.js:162` | `systems/survivalArena.js:1245` |
| `mines:released` | `systems/mines.js:334` | — |
| `mines:triggered` | `systems/mines.js:289` | — |
| `mining:beamLocked` | `systems/mining.js:1102` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2648` | `systems/missions.js:1730`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:1116` | `systems/presentationOrchestrator.js:220`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:903` | `ui/miningHud.js:210` |
| `mining:npcExtraction` | `systems/trafficRecoveryOps.js:686` | `systems/fieldDepletion.js:756` |
| `mining:podSplit` | `systems/mining.js:2024` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2593` | `render/asteroidMotionPresentation.js:527`, `systems/presentationOrchestrator.js:217`, `ui/miningHud.js:213` |
| `mining:richCoreCompleted` | `systems/mining.js:2626` | `render/asteroidMotionPresentation.js:528`, `systems/presentationOrchestrator.js:218`, `ui/miningHud.js:214` |
| `mining:richCoreExposed` | `systems/mining.js:2571` | `render/asteroidMotionPresentation.js:526`, `systems/presentationOrchestrator.js:216`, `ui/miningHud.js:212` |
| `mining:richCoreFizzle` | `systems/mining.js:2630` | `render/asteroidMotionPresentation.js:529`, `systems/presentationOrchestrator.js:219`, `ui/miningHud.js:215` |
| `mining:seamHit` | `systems/mining.js:2950` | `systems/presentationOrchestrator.js:209` |
| `mining:start` | `systems/mining.js:472`, `systems/mining.js:571`, `systems/mining.js:712`, `systems/mining.js:1970` | `audio/audioSystem.js:2813`, `render/asteroidMotionPresentation.js:521`, `render/authoredMotion.js:1146`, `render/authoredMotion.js:1173`, `render/vfx.js:2797`, `systems/missions.js:1894`, `systems/onboarding.js:606`, `systems/presentationOrchestrator.js:206`, `ui/miningHud.js:208`, `ui/worldObjectInteraction.js:416` |
| `mining:stop` | `systems/mining.js:844` | `audio/audioSystem.js:2814`, `render/asteroidMotionPresentation.js:522`, `render/authoredMotion.js:1148`, `render/authoredMotion.js:1174`, `render/vfx.js:2798`, `systems/presentationOrchestrator.js:207`, `ui/miningHud.js:209` |
| `mining:tick` | `systems/automation.js:1211`, `systems/mining.js:1137` | `audio/audioSystem.js:2815`, `render/vfx.js:2799`, `systems/presentationOrchestrator.js:208`, `ui/miningHud.js:211` |
| `mining:ventBonus` | `systems/mining.js:959` | `systems/onboarding.js:797`, `ui/miningHud.js:216` |
| `mining:ventReady` | `systems/mining.js:884` | `systems/presentationOrchestrator.js:213` |
| `mining:yield` | `balance/careerCohorts.js:2301`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:954`, `systems/mining.js:1339`, `systems/mining.js:1412`, `systems/mining.js:2125`, `systems/mining.js:2623` | `careers/origins/prospectorOrigin.js:636`, `render/authoredMotion.js:1147`, `render/vfx.js:2802`, `systems/encounterDirector.js:393`, `systems/missions.js:1713`, `systems/onboarding.js:607`, `systems/presentationOrchestrator.js:214` |
| `missile:guidanceLost` | `systems/weapons.js:1167` | — |
| `mission:abandon` | `systems/moralTrap.js:310` | `systems/missions.js:1608` |
| `mission:abandoned` | — | `systems/contractClauses.js:375` |
| `mission:accepted` | `systems/missions.js:2373` | `audio/audioSystem.js:2943`, `save/saveSystem.js:598`, `systems/aftermathWrecks.js:1172`, `systems/contractClauses.js:370`, `systems/contractClauses.js:371`, `systems/economy.js:1760`, `systems/encounterDirector.js:395`, `systems/fenceDesk.js:53`, `systems/moralTrap.js:191`, `systems/onboarding.js:609`, `ui/screens/missionLog.js:2426`, `ui/wreckChoicePrompt.js:45` |
| `mission:completed` | `systems/missions.js:5154`, `systems/missions.js:5174`, `systems/missions.js:5430` | `audio/audioSystem.js:2947`, `balance/careerCohorts.js:2239`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:599`, `systems/aftermathWrecks.js:1173`, `systems/claims.js:419`, `systems/contractClauses.js:372`, `systems/contractClauses.js:379`, `systems/crew.js:106`, `systems/economyContracts.js:265`, `systems/encounterDirector.js:404`, `systems/factions.js:480`, `systems/fenceDesk.js:54`, `systems/lossLedger.js:466`, `systems/onboarding.js:610`, `systems/story.js:244`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2427` |
| `mission:conditionBroken` | `systems/contractClauses.js:674`, `systems/missions.js:2145` | — |
| `mission:conditionPending` | `systems/missions.js:2198` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:642`, `systems/missions.js:2128` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:653`, `systems/missions.js:2136` | `systems/missions.js:1859` |
| `mission:expired` | `systems/missions.js:5939` | `audio/audioSystem.js:2955`, `save/saveSystem.js:601`, `systems/aftermathWrecks.js:1175`, `systems/contractClauses.js:374`, `systems/contractClauses.js:384`, `systems/encounterDirector.js:409`, `systems/factions.js:489`, `systems/fenceDesk.js:60`, `ui/screens/missionLog.js:2429` |
| `mission:failed` | `systems/missions.js:5855` | `audio/audioSystem.js:2954`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:600`, `systems/aftermathWrecks.js:1174`, `systems/contractClauses.js:373`, `systems/encounterDirector.js:405`, `systems/factions.js:488`, `systems/fenceDesk.js:55`, `systems/story.js:245`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2428` |
| `mission:forceEvent` | `data/encounters/1206-the-fire-sale.js:124`, `systems/economyContracts.js:871` | `systems/economy.js:1886` |
| `mission:gateCleared` | `systems/missions.js:4374`, `systems/missions.js:4500` | — |
| `mission:offerBoarded` | `systems/missionBoardOps.js:1120` | `systems/aftermathWrecks.js:1171`, `systems/economyContracts.js:246` |
| `mission:offered` | `response/mercyService/live.js:136`, `systems/aftermathWrecks.js:2277`, `systems/alienEcology.js:591`, `systems/careerContracts.js:329`, `systems/e1EncounterRuntime.js:510`, `systems/economyContracts.js:403`, `systems/lossInvestigation.js:284`, `systems/lossLedger.js:379`, `systems/postEndingReplay.js:371`, `systems/salvage.js:1257`, `systems/uniqueWrecks.js:1082` | `systems/economy.js:1759`, `systems/lossInvestigation.js:128`, `systems/missions.js:1613`, `systems/survivorPod.js:619` |
| `mission:setPieceTransition` | `systems/missions.js:5113` | `systems/lossInvestigation.js:130` |
| `mission:setPieceTravelLine` | `systems/missionStoryOps.js:1318` | — |
| `mission:spawnDeferred` | `systems/missionSpawningOps.js:888` | — |
| `mission:targetsProjected` | `systems/missionSpawningOps.js:69` | — |
| `mission:updated` | `missions/blackFlagMissions.js:183`, `missions/cinderRoute.js:147`, `missions/furnaceWorksiteRuntime.js:80`, `systems/contractClauses.js:647`, `systems/contractClauses.js:657`, `systems/contractClauses.js:686`, `systems/missionBoardOps.js:86`, `systems/missionBoardOps.js:240`, `systems/missionBoardOps.js:431`, `systems/missionBoardOps.js:548`, `systems/missionBoardOps.js:912`, `systems/missionBoardOps.js:946`, `systems/missionBoardOps.js:958`, `systems/missionBoardOps.js:1119`, `systems/missionObjectiveOps.js:50`, `systems/missionObjectiveOps.js:91`, `systems/missionObjectiveOps.js:104`, `systems/missionObjectiveOps.js:120`, `systems/missionObjectiveOps.js:136`, `systems/missionObjectiveOps.js:182`, `systems/missionObjectiveOps.js:224`, `systems/missionObjectiveOps.js:292`, `systems/missionObjectiveOps.js:366`, `systems/missionObjectiveOps.js:397`, `systems/missionObjectiveOps.js:558`, `systems/missionObjectiveOps.js:567`, `systems/missionObjectiveOps.js:844`, `systems/missionObjectiveOps.js:870`, `systems/missionObjectiveOps.js:941`, `systems/missionObjectiveOps.js:957`, `systems/missionObjectiveOps.js:1001`, `systems/missionObjectiveOps.js:1022`, `systems/missionObjectiveOps.js:1052`, `systems/missionObjectiveOps.js:1075`, `systems/missionObjectiveOps.js:1186`, `systems/missionObjectiveOps.js:1378`, `systems/missionObjectiveOps.js:2559`, `systems/missionObjectiveOps.js:2672`, `systems/missionObjectiveOps.js:2786`, `systems/missionObjectiveOps.js:2871`, `systems/missionSpawningOps.js:544`, `systems/missionSpawningOps.js:852`, `systems/missionSpawningOps.js:879`, `systems/missionSpawningOps.js:976`, `systems/missionSpawningOps.js:1104`, `systems/missionSpawningOps.js:1280`, `systems/missionStoryOps.js:157`, `systems/missionStoryOps.js:239`, `systems/missionStoryOps.js:309`, `systems/missionStoryOps.js:513`, `systems/missionStoryOps.js:546`, `systems/missionStoryOps.js:561`, `systems/missionStoryOps.js:575`, `systems/missionStoryOps.js:760`, `systems/missionStoryOps.js:902`, `systems/missionStoryOps.js:950`, `systems/missionStoryOps.js:1036`, `systems/missionStoryOps.js:1569`, `systems/missionStoryOps.js:2209`, `systems/missionStoryOps.js:2323`, `systems/missionStoryOps.js:2369`, `systems/missions.js:1703`, `systems/missions.js:2132`, `systems/missions.js:2140`, `systems/missions.js:2158`, `systems/missions.js:2228`, `systems/missions.js:2242`, `systems/missions.js:2256`, `systems/missions.js:2271`, `systems/missions.js:2285`, `systems/missions.js:2386`, `systems/missions.js:2619`, `systems/missions.js:2646`, `systems/missions.js:2804`, `systems/missions.js:3072`, `systems/missions.js:4053`, `systems/missions.js:4291`, `systems/missions.js:4313`, `systems/missions.js:4386`, `systems/missions.js:4430`, `systems/missions.js:4506`, `systems/missions.js:4544`, `systems/missions.js:4639`, `systems/missions.js:4646`, `systems/missions.js:5415`, `systems/missions.js:5869`, `systems/missions.js:5950`, `systems/wakeHandoffRuntime.js:25`, `systems/workingBattlefieldRuntime.js:148` | `systems/contractClauses.js:393`, `ui/screens/missionLog.js:2425`, `ui/station/screens/contracts.js:1560` |
| `mission:venueFailure` | `response/mercyService/live.js:283`, `systems/wreckCourt.js:1071` | `systems/missions.js:1754` |
| `mission:venueProof` | `response/mercyService/live.js:227`, `systems/wreckCourt.js:1034` | `systems/missions.js:1742` |
| `mode:changed` | `core/simLaneCommands.js:91`, `main.js:420`, `main.js:1120`, `main.js:1162`, `main.js:1174`, `save/saveSystem.js:6266`, `save/saveSystem.js:6292`, `save/saveSystem.js:6983`, `save/saveSystem.js:7320` | `systems/autoTargetAssist.js:143`, `systems/presentationAdapters.js:342`, `systems/scanner.js:1118`, `ui/loadingPresenter.js:568`, `ui/screenManager.js:732`, `ui/screens/mainMenu.js:1277`, `ui/uiRoot.js:1148`, `ui/wingmanRadial.js:346` |
| `module:equipped` | `systems/ships.js:3177` | `systems/onboarding.js:645`, `systems/onboarding.js:655`, `systems/onboarding.js:1007`, `systems/ships.js:1896`, `systems/survivalDraft.js:214`, `systems/world.js:708` |
| `module:fitRefused` | `systems/ships.js:2616`, `systems/ships.js:3115`, `systems/ships.js:3188` | `ui/station/screens/shipworks.js:4491` |
| `module:granted` | `systems/ships.js:2267`, `systems/ships.js:2708`, `systems/ships.js:2719` | — |
| `module:purchased` | `systems/ships.js:2680` | `systems/onboarding.js:807` |
| `module:sold` | `systems/ships.js:2605` | — |
| `module:unequipped` | `systems/ships.js:2128`, `systems/ships.js:3217` | `systems/ships.js:1897`, `systems/survivalDraft.js:215`, `systems/world.js:709` |
| `moisture:loss` | `systems/moistureLoss.js:208` | — |
| `moment:amended` | `systems/bulletTime.js:278` | `ui/screens/clips.js:117` |
| `moment:holyShit` | — | `render/feel.js:1594`, `systems/gamepad.js:1138` |
| `moralMemory:remember` | `data/encounters/1211-the-forecastle-vote.js:437`, `data/encounters/1211-the-forecastle-vote.js:444` | `systems/encounterDirector.js:380` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:520` | `systems/encounterDirector.js:382` |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:190` |
| `moralTrap:resolved` | `systems/moralTrap.js:306` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:254` | `ui/moralTrapPrompt.js:37` |
| `morrow:launch` | `systems/morrow.js:284` | — |
| `morrow:met` | `systems/morrow.js:223` | — |
| `morrow:voice` | `systems/morrow.js:197` | — |
| `mothlight:identified` | `systems/mothlight.js:225` | `ui/mothlightPrompt.js:6` |
| `mothlight:lampReleased` | `systems/mothlight.js:132` | — |
| `mothlight:phase` | `systems/mothlight.js:179` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:3781` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:419` |
| `nav:abortRoute` | — | `systems/routeFollower.js:415` |
| `nav:autopilot` | `systems/flight.js:408`, `systems/flightV3.js:1738`, `systems/missions.js:3141`, `systems/world.js:6177` | `systems/routeFollower.js:418` |
| `nav:engageRoute` | `systems/routeFollower.js:413` | `systems/routeFollower.js:408` |
| `nav:routeBrake` | — | `audio/audioSystem.js:3053` |
| `nav:waypoint` | `features/industrialDisasters/runtime.js:307`, `save/saveSystem.js:8026`, `systems/claims.js:2089`, `systems/claims.js:2097`, `systems/missionObjectiveOps.js:68`, `systems/missionObjectiveOps.js:1134`, `systems/missionStoryOps.js:2673`, `systems/missions.js:1632`, `systems/missions.js:3061`, `systems/missions.js:3174`, `systems/missions.js:3206`, `systems/world.js:6176`, `ui/market/tradeLogic.js:573` | `render/authoredMotion.js:1176` |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:135` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:205` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:131` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `nest:waspsLaunched` | `data/encounters/705-the-nest.js:396` | — |
| `news:headline` | `systems/aftermathWrecks.js:848`, `systems/aftermathWrecks.js:948`, `systems/e1EncounterRuntime.js:320`, `systems/lastShift.js:292`, `systems/nemesisSignals.js:25`, `systems/presentationOrchestrator.js:1328`, `systems/trafficCausalChainOps.js:2769`, `systems/trafficRecoveryOps.js:336`, `ui/marketNews.js:296` | — |
| `news:publish` | `data/encounters/362-the-salvage-watch.js:344`, `data/encounters/362-the-salvage-watch.js:360`, `data/encounters/362-the-salvage-watch.js:451`, `data/encounters/365-the-grandee.js:102`, `data/encounters/365-the-grandee.js:166`, `data/encounters/365-the-grandee.js:196`, `data/encounters/367-the-salvage-tail.js:272`, `data/encounters/367-the-salvage-tail.js:317`, `data/encounters/367-the-salvage-tail.js:343`, `systems/aftermathWrecks.js:856`, `systems/aftermathWrecks.js:966`, `systems/blindWelderRuntime.js:162`, `systems/choirReliefBerth.js:367`, `systems/choirReliefBerth.js:407`, `systems/claims.js:2644`, `systems/claims.js:2852`, `systems/claims.js:3364`, `systems/claims.js:3411`, `systems/crSituationKit.js:69`, `systems/driftAuctionRuntime.js:194`, `systems/driftAuctionRuntime.js:211`, `systems/driftAuctionRuntime.js:403`, `systems/eighthBellRuntime.js:140`, `systems/factions.js:581`, `systems/glueMeetMassRuntime.js:120`, `systems/heliosClaimOpening.js:83`, `systems/heliosClaimOpening.js:119`, `systems/impoundGrudge.js:678`, `systems/impoundLot.js:1327`, `systems/memorialThief.js:135`, `systems/npcJobsRuntime.js:1445`, `systems/presentationOrchestrator.js:1335`, `systems/runawayKilnRuntime.js:191`, `systems/runawayKilnRuntime.js:208`, `systems/special500Director.js:220`, `systems/trafficCausalChainOps.js:2299`, `systems/trafficJobOps.js:845`, `systems/uniqueWrecks.js:629`, `systems/uniqueWrecks.js:1952`, `systems/world.js:1022`, `systems/world.js:4776`, `systems/worldClock.js:173`, `systems/worldPressure.js:446`, `ui/watchlistHud.js:77` | — |
| `news:render` | `ui/hud.js:1859` | — |
| `npc:hailed` | `systems/barkDirector.js:1939`, `systems/barkDirector.js:1985`, `systems/barkDirector.js:2039` | `render/authoredMotion.js:1211` |
| `npcJobs:towAssistComplete` | `systems/npcJobsRuntime.js:3671` | `systems/scanner.js:1113` |
| `npcJobs:towAssistLost` | `systems/npcJobsRuntime.js:3207`, `systems/npcJobsRuntime.js:3756`, `systems/npcJobsRuntime.js:3795` | `systems/missions.js:1905`, `systems/scanner.js:1114` |
| `npcjobs:closeCall` | `systems/npcJobsRuntime.js:5385` | — |
| `npcjobs:complete` | — | `systems/traffic.js:2160` |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:6509` | — |
| `npcjobs:cycle` | — | `systems/traffic.js:2159` |
| `npcjobs:distress` | `systems/npcJobsRuntime.js:6671` | `systems/traffic.js:2150` |
| `npcjobs:errand` | `systems/laneErrands.js:352` | — |
| `npcjobs:hold` | — | `systems/traffic.js:2147` |
| `npcjobs:load` | — | `systems/traffic.js:2145` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1320`, `systems/npcJobsRuntime.js:1334` | `systems/barkDirector.js:844` |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1327` | `ui/station/barContacts.js:197` |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1307` | `ui/station/barContacts.js:196` |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1305` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3924` | `render/authoredMotion.js:1196`, `systems/barkDirector.js:848` |
| `npcjobs:oncallTenderRetired` | `systems/npcJobsRuntime.js:5944` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:5490` | — |
| `npcjobs:surveyMarked` | `systems/npcJobsRuntime.js:1404` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:5562` | `render/npcJobSignatureVfx.js:711`, `render/npcJobSignatureVfx.js:902` |
| `npcjobs:unload` | — | `systems/traffic.js:2146` |
| `npcjobs:work` | — | `systems/traffic.js:2144` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:5694` | `systems/stationSideEventDirector.js:98` |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:5717` | — |
| `occupation:delivered` | `systems/scavengerOccupationSwitch.js:610` | — |
| `occupation:licensed` | `systems/scavengerOccupationSwitch.js:955` | — |
| `occupation:lost` | `systems/scavengerOccupationSwitch.js:691`, `systems/scavengerOccupationSwitch.js:750` | — |
| `occupation:recommissioned` | `systems/scavengerOccupationSwitch.js:860` | — |
| `occupation:settled` | `systems/scavengerOccupationSwitch.js:631` | — |
| `occupation:switched` | `systems/scavengerOccupationSwitch.js:502` | — |
| `onboarding:drillFolded` | `systems/onboarding.js:1840` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:2326`, `systems/onboarding.js:3103`, `systems/onboarding.js:4223` | — |
| `onboarding:rosterPrewarm` | `systems/onboarding.js:2804` | — |
| `onboarding:swingClinic` | `systems/onboarding.js:2331` | — |
| `optic:beamContact` | `systems/combat.js:1825` | — |
| `optic:contact` | `systems/weapons.js:3035`, `systems/weapons.js:3102` | `audio/audioSystem.js:2769` |
| `optic:rekindled` | — | `audio/audioSystem.js:2770` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1239` | `systems/world.js:715` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:2329` | `systems/story.js:161` |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1352` | — |
| `orrinWitness:submitted` | `systems/story.js:1380` | — |
| `pallas:shift` | `systems/pallasWorkLoop.js:136` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:7456` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:386` | `systems/world.js:717` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:7252` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:7287` | `ui/recoveryEncounterPrompt.js:488` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:7416` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:7370` | `ui/recoveryEncounterPrompt.js:489` |
| `palletJack:drop` | `ui/palletJackPrompt.js:19` | — |
| `palletJack:lost` | `systems/palletJack.js:378` | — |
| `palletJack:offer` | `systems/palletJack.js:279` | `ui/palletJackPrompt.js:6` |
| `palletJack:phase` | `systems/palletJack.js:186` | — |
| `palletJack:released` | `systems/palletJack.js:262` | — |
| `palletJack:trail` | `ui/palletJackPrompt.js:20` | — |
| `patrol:proximity` | `systems/encounterScripts.js:454`, `systems/faction_verge.js:761` | `systems/economy.js:1877`, `systems/moralTrap.js:189` |
| `pds:intercept` | `systems/countermeasures.js:470` | `audio/audioSystem.js:2754` |
| `physics:authorityStalled` | — | `ui/toasts.js:848` |
| `physics:contactsCompleted` | — | `systems/collisionConsequences.js:98` |
| `physics:impact` | `core/physics.js:2509` | `audio/audioSystem.js:2764`, `features/industrialDisasters/physicalSite.js:501`, `gallery/orbital/session.js:118`, `missions/racingOpponents.js:361`, `render/asteroidMotionPresentation.js:517`, `render/feel.js:1571`, `render/shipMicroMotion.js:1752`, `render/vfx.js:2732`, `systems/aftermathWrecks.js:1147`, `systems/asteroidSites.js:833`, `systems/barkDirector.js:933`, `systems/collisionConsequences.js:97`, `systems/encounterDirector.js:372`, `systems/environmentMaterials.js:112`, `systems/fields.js:736`, `systems/flightV3.js:239`, `systems/fragileCargo.js:406`, `systems/gamepad.js:999`, `systems/heistFacilities.js:325`, `systems/impulseCharges.js:322`, `systems/lootShards.js:600`, `systems/masslineImpactDamage.js:59`, `systems/reactiveMatter.js:530`, `systems/ships.js:2021`, `systems/survivalResults.js:511`, `systems/swarmArena.js:728`, `systems/swarmElites.js:151`, `systems/volatileExposure.js:215`, `testing/lab/titleVerbScenario.js:51`, `testing/motionScenarios.js:1764` |
| `pickup:collected` | `core/physics.js:2267`, `systems/combat.js:1037`, `systems/mining.js:1733`, `systems/mining.js:2745`, `systems/uniqueWrecks.js:1824` | `audio/audioSystem.js:2893`, `render/vfx.js:2843`, `save/saveSystem.js:529`, `systems/economy.js:1829`, `systems/encounterDirector.js:354`, `systems/faction_meridian.js:366`, `systems/lawSecurity.js:408`, `systems/mining.js:294`, `systems/missions.js:1689`, `systems/onboarding.js:608`, `systems/onboarding.js:686`, `systems/onboarding.js:782`, `systems/presentationOrchestrator.js:221`, `systems/swarmArena.js:746`, `systems/swarmEvents.js:116`, `systems/swarmSupply.js:110`, `systems/tetherGameplay.js:348`, `systems/traffic.js:2161`, `systems/traffic.js:2166`, `systems/traffic.js:2170`, `systems/traffic.js:2171`, `systems/world.js:718`, `systems/world.js:719`, `systems/world.js:722`, `systems/world.js:724`, `systems/world.js:794` |
| `pirateDisengage:surrenderOffer` | — | `ui/pirateParleyPrompt.js:221` |
| `pirateDisengage:triggered` | `data/encounters/344-opening-hauler-raid.js:102` | `systems/combatOutcome.js:300` |
| `pirateDisengage:verdict` | `ui/pirateParleyPrompt.js:199` | — |
| `pirateDisengage:yieldResolved` | — | `ui/pirateParleyPrompt.js:222` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:154` | `systems/pirateParley.js:98` |
| `pirateParley:demand` | `systems/scanner.js:1722` | `ui/pirateParleyPrompt.js:219` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:299`, `ui/pirateParleyPrompt.js:220` |
| `pirateParley:started` | — | `systems/combatOutcome.js:298` |
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
| `planet:bandFirst` | `systems/planetRuntime.js:578` | `systems/onboarding.js:1025` |
| `planet:collector` | `systems/planetRuntime.js:793` | `audio/audioSystem.js:2935`, `render/authoredMotion.js:1215`, `systems/onboarding.js:1019` |
| `planet:harvest` | `systems/planetRuntime.js:920` | `audio/audioSystem.js:2936` |
| `planet:harvestDenied` | `systems/planetRuntime.js:927` | `audio/audioSystem.js:2937` |
| `planet:npcHarvest` | `systems/planetRuntime.js:907` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:671`, `systems/planetRuntime.js:684` | `audio/audioSystem.js:2938` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:768` | `audio/audioSystem.js:2939` |
| `planet:registered` | `systems/planetRuntime.js:284` | — |
| `planet:unregistered` | `systems/planetRuntime.js:473` | — |
| `player:death` | `systems/combat.js:1170`, `systems/combat.js:1329`, `systems/world.js:6657` | `audio/audioSystem.js:2811`, `render/feel.js:1479`, `render/shipMicroMotion.js:1763`, `render/vfx.js:2796`, `save/saveSystem.js:536`, `sim/killcamTape.js:476`, `systems/aftermathWrecks.js:1144`, `systems/crew.js:125`, `systems/encounterDirector.js:410`, `systems/flightV3.js:244`, `systems/input.js:1414`, `systems/lawSecurity.js:407`, `systems/lossLedger.js:465`, `systems/masslineTelemetry.js:128`, `systems/missions.js:1853`, `systems/onboarding.js:639`, `systems/onboarding.js:685`, `systems/shieldPylons.js:246`, `systems/surrenderRecovery.js:107`, `systems/survivalResults.js:519`, `systems/survivalRun.js:153`, `systems/survivorPod.js:626`, `systems/tetherGameplay.js:339`, `systems/world.js:697`, `ui/commandBar.js:457`, `ui/confirm.js:310`, `ui/survivalHud.js:329` |
| `player:recoveryFailed` | `systems/combat.js:1382` | `ui/screens/gameOver.js:626` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:507`, `ui/screens/gameOver.js:520` | `systems/combat.js:808` |
| `player:respawn` | `systems/combat.js:1463` | `audio/audioSystem.js:2812`, `render/shipMicroMotion.js:1762`, `save/saveSystem.js:537`, `save/saveSystem.js:613`, `sim/killcamTape.js:473`, `systems/flightV3.js:245`, `systems/input.js:1415`, `systems/tetherGameplay.js:340`, `ui/commandBar.js:461`, `ui/screens/gameOver.js:618` |
| `player:scannedByPatrol` | `systems/economy.js:5599` | `render/authoredMotion.js:1194`, `render/vfx.js:2783`, `systems/lawSecurity.js:423`, `systems/missions.js:1843` |
| `poi:discovered` | `systems/world.js:1051`, `systems/world.js:6251`, `systems/world.js:6349`, `systems/world.js:6968`, `systems/world.js:6998` | `audio/audioSystem.js:2968`, `systems/encounterDirector.js:383`, `systems/world.js:751` |
| `poi:identified` | `systems/world.js:6356`, `systems/world.js:6999` | `systems/encounterDirector.js:384`, `systems/missions.js:1619`, `systems/world.js:752` |
| `postEndingReplay:cycleCompleted` | — | `systems/sectorSim.js:139`, `ui/screens/missionLog.js:2449` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:288` | `ui/screens/missionLog.js:2448` |
| `presentation:audioCue` | `render/vfx.js:6444`, `systems/presentationAdapters.js:317`, `systems/presentationAdapters.js:698` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:611` | — |
| `presentation:caption` | `audio/audioSystem.js:6668`, `features/salvageTender/presentation.js:68`, `systems/asteroidSites.js:2988`, `systems/asteroidSites.js:3045`, `systems/factionPresence.js:1261`, `systems/factionPresence.js:1715`, `systems/factionPresence.js:1730`, `systems/factionPresence.js:1748`, `systems/factionPresence.js:1810`, `systems/presentationAdapters.js:798`, `systems/shipjack.js:81`, `systems/story.js:1183`, `systems/story.js:1435` | — |
| `presentation:cue` | `systems/aftermathWrecks.js:1555`, `systems/cargo.js:1201`, `systems/planetRuntime.js:695`, `systems/salvageActions.js:280`, `systems/salvageActions.js:495` | `audio/audioSystem.js:3081`, `render/vfx.js:2837`, `render/vfx.js:2838`, `render/vfx.js:2839`, `systems/presentationAdapters.js:339` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:593` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:514`, `systems/presentationAdapters.js:776` | — |
| `presentation:vfxCue` | `render/vfx.js:2856`, `systems/bombs.js:1330`, `systems/fields.js:1935`, `systems/fields.js:2221`, `systems/fields.js:2828`, `systems/fields.js:2879`, `systems/hullBurst.js:239`, `systems/hullBurst.js:351`, `systems/hullBurst.js:402`, `systems/hullBurst.js:433`, `systems/hullBurst.js:619`, `systems/massSeed.js:329`, `systems/massSeed.js:445`, `systems/massSeed.js:539`, `systems/massSeed.js:581`, `systems/masslineThrow.js:578`, `systems/missions.js:2399`, `systems/missions.js:5453`, `systems/planetRuntime.js:950`, `systems/presentationAdapters.js:660`, `systems/tumbleStates.js:562`, `systems/tumbleStates.js:672`, `systems/volatileExposure.js:482`, `systems/volatileExposure.js:556`, `systems/weapons.js:2073`, `systems/weapons.js:2204`, `systems/weapons.js:2336`, `systems/weapons.js:3795` | `render/vfx.js:2842` |
| `projectile:bank` | — | `render/vfx.js:2726` |
| `projectile:hit` | `core/physics.js:1401`, `core/physics.js:1430`, `core/physics.js:1621`, `data/encounters/705-the-nest.js:338`, `systems/sectorSim.js:751` | `audio/audioSystem.js:2747`, `combat/tetherWebs.js:61`, `render/vfx.js:2725`, `systems/bombs.js:700`, `systems/combat.js:800`, `systems/gamepad.js:1112`, `systems/missions.js:1797` |
| `projectile:nearMiss` | `core/physics.js:1581` | `audio/audioSystem.js:2750`, `systems/presentationOrchestrator.js:178` |
| `projectile:ricochet` | — | `render/vfx.js:2727` |
| `quiet:routeSold` | `data/encounters/702-the-swap.js:52` | — |
| `quill:archiveRebound` | `systems/quill.js:774` | — |
| `quill:errandAnswered` | `systems/quill.js:763` | — |
| `quill:errandArmed` | `systems/quill.js:741` | — |
| `quill:folioBurned` | `systems/quill.js:707` | — |
| `quill:folioMinted` | `systems/quill.js:541` | — |
| `quill:folioSeized` | `systems/quill.js:862` | — |
| `quill:folioSold` | `systems/quill.js:674` | — |
| `quill:forgeryDetected` | `systems/quill.js:724` | — |
| `quill:redactorKilled` | `systems/quill.js:905` | — |
| `quill:redactorSpawned` | `systems/quill.js:796` | — |
| `quill:redactorWithdrew` | `systems/quill.js:836` | — |
| `race:abort` | — | `systems/missions.js:1874` |
| `race:ended` | `systems/missions.js:5787` | — |
| `race:launchFailed` | — | `save/saveSystem.js:585` |
| `race:reset` | — | `systems/missions.js:1872` |
| `race:restart` | `ui/input.js:546` | `systems/missions.js:1873` |
| `race:restarted` | `systems/missions.js:4228` | — |
| `race:toggleView` | `ui/input.js:538`, `ui/input.js:1356` | — |
| `range:opened` | `ui/screens/range.js:2716` | `systems/onboarding.js:672` |
| `ravel:cast` | `systems/ravel.js:176` | — |
| `ravel:destroyed` | `systems/ravel.js:211` | — |
| `ravel:hit` | `systems/ravel.js:190` | — |
| `ravel:pacified` | `systems/ravel.js:199` | — |
| `ravel:telegraph` | `systems/ravel.js:157` | — |
| `ravel:unthreaded` | `systems/ravel.js:196` | — |
| `ravel:voice` | `systems/ravel.js:130` | — |
| `reach:trophyHung` | `data/encounters/705-the-nest.js:218` | — |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:325` | — |
| `recovery:completed` | `systems/onboarding.js:3312` | `ui/recoveryEncounterPrompt.js:483` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:283` | — |
| `redKite:aborted` | `systems/redKite.js:177` | — |
| `redKite:course` | `ui/redKitePrompt.js:18` | — |
| `redKite:finished` | `systems/redKite.js:203` | — |
| `redKite:offer` | `systems/redKite.js:155` | `ui/redKitePrompt.js:6` |
| `redKite:start` | `ui/redKitePrompt.js:19` | — |
| `redKite:started` | `systems/redKite.js:170` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:277` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:278` |
| `rescue:beat` | `systems/onboarding.js:3281`, `systems/onboarding.js:3341` | — |
| `rescue:complete` | `systems/onboarding.js:3292` | — |
| `rescue:started` | `systems/onboarding.js:2863` | `systems/onboarding.js:640` |
| `rescuedWorker:returned` | `systems/rescuedWorkerReturn.js:489` | — |
| `research:pointsChanged` | `systems/missionObjectiveOps.js:591`, `systems/missionObjectiveOps.js:645`, `systems/missionObjectiveOps.js:679`, `systems/missionObjectiveOps.js:726`, `systems/missionStoryOps.js:2169`, `systems/missions.js:5368`, `systems/missions.js:5384` | `ui/alerts.js:505` |
| `resonance:patrolQueued` | `systems/encounterDirector.js:3331` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1542` | `systems/encounterDirector.js:414` |
| `rhythm:phase` | `systems/encounterDirector.js:621` | — |
| `rigWorkshop:changed` | `features/rigWorkshop/runtime.js:301` | — |
| `rigWorkshop:delivered` | `features/rigWorkshop/jobs.js:223` | — |
| `rigWorkshop:feedback` | `features/rigWorkshop/runtime.js:306` | — |
| `rigWorkshop:prompt` | `features/rigWorkshop/runtime.js:319` | — |
| `rigWorkshop:promptClosed` | `features/rigWorkshop/runtime.js:323` | — |
| `rookWreck:appraised` | `systems/rookBooth.js:668` | — |
| `rookWreck:countered` | `systems/rookBooth.js:514` | — |
| `rookWreck:delivered` | `systems/rookBooth.js:573` | `systems/missions.js:1674` |
| `rookWreck:disputeFiled` | `systems/rookBooth.js:634` | — |
| `rookWreck:offerLapsed` | `systems/rookBooth.js:482` | — |
| `rookWreck:padRefused` | `systems/rookBooth.js:650` | — |
| `rubric:destroyed` | `systems/rubric.js:353` | — |
| `rubric:last` | `systems/rubric.js:482` | — |
| `rubric:marked` | `systems/rubric.js:437` | — |
| `rubric:voice` | `systems/rubric.js:264` | — |
| `ruckus:pulse` | `systems/ruckus.js:213` | — |
| `ruckus:retrieved` | `systems/ruckus.js:198` | — |
| `ruckus:state` | `systems/ruckus.js:147` | — |
| `ruckus:voice` | `systems/ruckus.js:141` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:376` | `ui/station/barContacts.js:154` |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:140` |
| `run:awardRequested` | `systems/swarmBrood.js:2700`, `systems/swarmEvents.js:215`, `systems/swarmEvents.js:345`, `ui/sandbox/sandboxSetup.js:1334`, `ui/sandbox/sandboxSetup.js:1349` | `systems/runSession.js:111` |
| `run:awarded` | — | `ui/survivalHud.js:305` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1254`, `ui/sandbox/sandboxSetup.js:1296` | `systems/runSession.js:108` |
| `run:circuitChoiceApplied` | — | `systems/survivalDraft.js:197` |
| `run:circuitChoiceRequested` | — | `systems/survivalRun.js:150` |
| `run:draftLockRequested` | `ui/screens/crucibleDraft.js:1619` | `systems/survivalDraft.js:205` |
| `run:draftOffered` | — | `ui/screens/crucibleDraft.js:1034` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:940`, `ui/screens/crucibleDraft.js:945`, `ui/screens/crucibleDraft.js:1154`, `ui/screens/crucibleDraft.js:1494`, `ui/screens/crucibleDraft.js:1603`, `ui/screens/crucibleDraft.js:1777` | `systems/survivalDraft.js:194` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:1092` | `systems/survivalDraft.js:206` |
| `run:draftResolved` | — | `systems/survivalRun.js:143` |
| `run:endRequested` | `save/saveSystem.js:434` | `systems/runSession.js:110` |
| `run:ended` | — | `audio/audioSystem.js:2910`, `systems/survivalAnnounce.js:381`, `systems/survivalArena.js:1237`, `systems/survivalDraft.js:221`, `systems/survivalResults.js:556`, `systems/survivalRun.js:137`, `systems/survivalWave.js:198`, `systems/swarmArena.js:730`, `systems/swarmChain.js:167`, `systems/swarmElites.js:155`, `systems/swarmEvents.js:115`, `systems/swarmFortify.js:147`, `systems/swarmJuice.js:171`, `systems/swarmLegendaries.js:123`, `systems/swarmSupply.js:112`, `ui/swarmJuiceHud.js:102` |
| `run:extractionRequested` | `systems/survivalExtraction.js:31` | `systems/survivalRun.js:146` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:379`, `ui/survivalHud.js:306` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1373` | `systems/ships.js:2076`, `systems/survivalRun.js:138`, `systems/swarmSupply.js:105`, `systems/world.js:747` |
| `run:modifierChosen` | — | `systems/survivalRun.js:144` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:113` |
| `run:modifierRecorded` | — | `systems/survivalArena.js:1197` |
| `run:openingLessonReleased` | — | `systems/survivalAnnounce.js:377`, `systems/survivalArena.js:1232`, `systems/swarmArena.js:729` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1374` | `systems/survivalRun.js:139` |
| `run:partialBankRequested` | `systems/survivalExtraction.js:61` | `systems/survivalRun.js:147` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1881`, `ui/screens/crucibleDraft.js:1898` | `systems/survivalDraft.js:198` |
| `run:refitClosed` | — | `systems/survivalRun.js:145` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:2305` | `systems/survivalDraft.js:199` |
| `run:refitSellRequested` | `ui/screens/crucibleDraft.js:2336` | `systems/survivalDraft.js:204` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:2301` | `systems/survivalDraft.js:200` |
| `run:resultsReady` | — | `systems/achievements.js:1196`, `ui/uiRoot.js:1639` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:210` |
| `run:spendRequested` | — | `systems/runSession.js:112` |
| `run:spent` | — | `systems/survivalDraft.js:209` |
| `run:started` | — | `audio/audioSystem.js:2909`, `sim/killcamTape.js:469`, `systems/combatOutcome.js:288`, `systems/survivalAnnounce.js:369`, `systems/survivalResults.js:501`, `systems/survivalRun.js:135`, `systems/swarmElites.js:154`, `systems/swarmFortify.js:145`, `systems/swarmJuice.js:170`, `systems/swarmLegendaries.js:122`, `ui/survivalHud.js:307`, `ui/swarmJuiceHud.js:101`, `ui/uiRoot.js:1651` |
| `run:threatRequested` | — | `systems/runSession.js:114` |
| `run:transitionRequested` | `systems/survivalRun.js:1062` | `systems/runSession.js:109` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:380`, `systems/survivalDraft.js:193`, `systems/survivalResults.js:555`, `systems/survivalRun.js:136`, `systems/survivalWave.js:197`, `systems/swarmSupply.js:106` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:378`, `systems/survivalArena.js:1231`, `systems/survivalResults.js:509`, `systems/swarmEvents.js:114`, `systems/swarmLegendaries.js:121` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:141` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:372` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:520` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:370`, `systems/survivalArena.js:1198`, `systems/survivalWave.js:195`, `systems/swarmArena.js:725`, `systems/swarmFortify.js:146`, `systems/swarmJuice.js:164`, `systems/tetherGameplay.js:349`, `ui/survivalHud.js:322` |
| `run:waveProgress` | — | `ui/survivalHud.js:323` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:371`, `systems/survivalResults.js:506`, `systems/survivalWave.js:196`, `systems/swarmArena.js:726`, `systems/swarmEvents.js:113`, `systems/swarmJuice.js:165`, `ui/swarmJuiceHud.js:100` |
| `ruud:cut` | `systems/ruud.js:411` | — |
| `ruud:spared` | `systems/ruud.js:384` | — |
| `ruud:voice` | `systems/ruud.js:310` | — |
| `sable:demonstrated` | `ui/station/screens/shipworks.js:5450` | — |
| `salvage:actionRead` | `systems/salvageActions.js:226` | — |
| `salvage:bayCashedIn` | `systems/cargo.js:1241` | `systems/onboarding.js:791` |
| `salvage:changed` | `systems/cargo.js:558`, `systems/cargo.js:1244` | `systems/onboarding.js:787` |
| `salvage:claimJumped` | `systems/mining.js:2291` | `systems/missions.js:1895` |
| `salvage:communicatorFound` | `systems/salvage.js:1258` | `systems/encounterDirector.js:385`, `systems/story.js:283`, `ui/wreckChoicePrompt.js:44` |
| `salvage:completed` | `systems/gravedigger.js:1177`, `systems/mining.js:2146`, `systems/rookBooth.js:587` | `render/vfx.js:2801`, `systems/aftermathWrecks.js:1165`, `systems/lawSecurity.js:415`, `systems/missions.js:1728`, `systems/missions.js:1896`, `systems/story.js:265` |
| `salvage:cookerFlight` | `systems/salvageActions.js:490` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:637` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:277` | `render/authoredMotion.js:1201` |
| `salvage:cutComplete` | `systems/mining.js:743` | `audio/audioSystem.js:2913`, `render/authoredMotion.js:1170`, `render/vfx.js:2800` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:445` | `systems/salvage.js:177` |
| `salvage:npcExtraction` | `systems/trafficRoleOps.js:2095` | `render/authoredMotion.js:1169` |
| `salvage:npcUnload` | `features/salvageOutfits/physical.js:487`, `systems/trafficCausalChainOps.js:2496` | `systems/economy.js:1833` |
| `salvage:placed` | `systems/salvage.js:576` | `systems/lossInvestigation.js:126`, `systems/survivorPod.js:603` |
| `salvage:reactorBurst` | `systems/salvageActions.js:743` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:347` | `systems/salvage.js:173` |
| `salvage:reactorVented` | `systems/salvageActions.js:241` | — |
| `salvage:sortDelivered` | `systems/salvage.js:1076` | — |
| `salvage:sortImpact` | `systems/salvage.js:1010` | — |
| `salvage:sortLost` | `systems/salvage.js:1106` | — |
| `salvage:sortSeparated` | `systems/salvage.js:974` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:138` |
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
| `salvageTender:cue` | `features/salvageTender/runtime.js:92` | `features/salvageTender/presentation.js:48` |
| `salvageTender:disabled` | `features/salvageTender/physical.js:520` | — |
| `salvageTender:discovered` | `features/salvageTender/runtime.js:111` | — |
| `salvageTender:offer` | `features/salvageTender/runtime.js:288` | — |
| `salvageTender:rackReleased` | `features/salvageTender/physical.js:480` | — |
| `salvageTender:reset` | `features/salvageTender/runtime.js:442`, `features/salvageTender/runtime.js:448` | — |
| `salvageWatch:repairWork` | `data/encounters/362-the-salvage-watch.js:471` | — |
| `save:backup` | `save/saveSystem.js:2544` | `ui/screens/saveLoad.js:1113` |
| `save:completed` | `save/saveSystem.js:2550` | `ui/screens/saveLoad.js:1103`, `ui/toasts.js:55`, `ui/uiRoot.js:575` |
| `save:dirty` | `features/industrialDisasters/runtime.js:464`, `features/shipbreakingYard/runtime.js:121`, `features/shipbreakingYard/runtime.js:276`, `features/shipbreakingYard/runtime.js:411`, `shipjack/fleetOperations.js:69`, `shipjack/fleetOperations.js:149`, `shipjack/fleetOperations.js:167`, `systems/ruckus.js:91`, `systems/shipjack.js:70` | `save/saveSystem.js:513` |
| `save:envelopePrepared` | `save/saveSystem.js:5592`, `save/saveSystem.js:5658`, `save/saveSystem.js:5670` | `main.js:261`, `ui/loadingPresenter.js:616` |
| `save:envelopeSpecPrepared` | `save/saveSystem.js:3088` | `main.js:260`, `ui/screens/saveLoad.js:1127` |
| `save:error` | `main.js:278`, `main.js:1085`, `main.js:1149`, `save/saveSystem.js:1683`, `save/saveSystem.js:2619`, `save/saveSystem.js:5390`, `save/saveSystem.js:5411`, `save/saveSystem.js:5460`, `save/saveSystem.js:5487`, `save/saveSystem.js:5526`, `save/saveSystem.js:5649`, `save/saveSystem.js:5698`, `save/saveSystem.js:5878`, `save/saveSystem.js:5898`, `save/saveSystem.js:5915`, `save/saveSystem.js:6106`, `save/saveSystem.js:6120`, `save/saveSystem.js:6226`, `save/saveSystem.js:6244`, `save/saveSystem.js:6280`, `save/saveSystem.js:6321`, `save/saveSystem.js:6326`, `save/saveSystem.js:6358`, `save/saveSystem.js:6484`, `save/saveSystem.js:6549`, `save/saveSystem.js:6554`, `save/saveSystem.js:6772`, `save/saveSystem.js:7412`, `save/saveSystem.js:7424`, `save/saveSystem.js:7487`, `save/saveSystem.js:8388`, `save/saveSystem.js:8400`, `save/saveSystem.js:8406`, `save/saveSystem.js:8427`, `save/saveSystem.js:8432`, `save/saveSystem.js:8450`, `save/saveSystem.js:8554`, `save/saveSystem.js:8579`, `ui/screens/saveLoad.js:1700` | `systems/aftermathWrecks.js:1180`, `systems/asteroidSites.js:832`, `systems/automation.js:635`, `systems/encounterDirector.js:346`, `systems/faction_understory.js:689`, `systems/traffic.js:2193`, `ui/loadingPresenter.js:593`, `ui/screenManager.js:733`, `ui/screens/mainMenu.js:755`, `ui/screens/mainMenu.js:1287`, `ui/screens/saveLoad.js:1089`, `ui/screens/saveLoad.js:1114`, `ui/uiRoot.js:601` |
| `save:exportRecovery` | `save/saveSystem.js:8342`, `save/saveSystem.js:8369` | `ui/toasts.js:829` |
| `save:loadSpeculationTarget` | `ui/screens/gameOver.js:899`, `ui/screens/pause.js:1344`, `ui/screens/saveLoad.js:1202`, `ui/screens/saveLoad.js:1342` | `save/saveSystem.js:451` |
| `save:loaded` | `save/saveSystem.js:7338` | `audio/audioSystem.js:3335`, `audio/bombAudio.js:460`, `audio/fieldAudio.js:327`, `careers/origins/haulerOriginSystem.js:65`, `combat/kernel.js:205`, `combat/tetherWebs.js:70`, `core/coreSystem.js:545`, `core/physics.js:206`, `main.js:359`, `main.js:367`, `render/feel.js:1364`, `render/shipMicroMotion.js:1745`, `render/vfx.js:2779`, `render/vfx.js:2790`, `save/saveSystem.js:549`, `save/saveSystem.js:576`, `sim/killcamTape.js:472`, `systems/aftermathWrecks.js:1179`, `systems/aiEncounter.js:137`, `systems/asteroidFormations.js:127`, `systems/asteroidSites.js:822`, `systems/autoTargetAssist.js:158`, `systems/automation.js:622`, `systems/barkDirector.js:803`, `systems/beacons.js:54`, `systems/bombs.js:699`, `systems/collisionConsequences.js:109`, `systems/combat.js:850`, `systems/combatOutcome.js:265`, `systems/contractClauses.js:394`, `systems/countermeasures.js:226`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:81`, `systems/economy.js:1898`, `systems/economyContracts.js:284`, `systems/encounterDirector.js:345`, `systems/environmentalMachinery.js:276`, `systems/factionPresence.js:530`, `systems/factionPresence.js:541`, `systems/faction_archive.js:590`, `systems/faction_frontier.js:460`, `systems/faction_helix.js:505`, `systems/faction_meridian.js:367`, `systems/faction_understory.js:684`, `systems/faction_vael.js:438`, `systems/fields.js:724`, `systems/flight.js:79`, `systems/flightV3.js:212`, `systems/gateControlDirector.js:78`, `systems/heat.js:412`, `systems/heistFacilities.js:337`, `systems/impoundGrudge.js:397`, `systems/impoundLot.js:1086`, `systems/impulseCharges.js:330`, `systems/lawSecurity.js:404`, `systems/lineProgression.js:56`, `systems/longBerth.js:68`, `systems/lossInvestigation.js:132`, `systems/massSeed.js:141`, `systems/masslineSnares.js:139`, `systems/masslineTelemetry.js:123`, `systems/mines.js:78`, `systems/mining.js:314`, `systems/missions.js:1588`, `systems/npcJobsRuntime.js:1099`, `systems/npcJobsRuntime.js:1107`, `systems/npcJobsRuntime.js:1154`, `systems/npcJobsRuntime.js:1157`, `systems/onboarding.js:572`, `systems/pirateDisguise.js:439`, `systems/planetRuntime.js:177`, `systems/presentationAdapters.js:346`, `systems/presentationOrchestrator.js:291`, `systems/routeFollower.js:436`, `systems/runSession.js:119`, `systems/salvageActions.js:142`, `systems/sectorSim.js:133`, `systems/shieldPylons.js:245`, `systems/ships.js:1907`, `systems/stationContactLoadBoundary.js:91`, `systems/stationSideEventDirector.js:97`, `systems/story.js:155`, `systems/survivalArena.js:1254`, `systems/survivorPod.js:624`, `systems/swarmFortify.js:153`, `systems/swarmLegendaries.js:126`, `systems/tetherGameplay.js:336`, `systems/titles.js:585`, `systems/traffic.js:2106`, `systems/traffic.js:2158`, `systems/traffic.js:2211`, `systems/traffic.js:2237`, `systems/traffic.js:2247`, `systems/traffic.js:2250`, `systems/travelLanes.js:553`, `systems/tumbleStates.js:144`, `systems/uniqueLootAbilities.js:162`, `systems/wingmen.js:158`, `systems/world.js:732`, `ui/alerts.js:500`, `ui/automationPayoff.js:81`, `ui/bandHud.js:120`, `ui/capitalBossOverlayMount.js:652`, `ui/cargoConscience.js:147`, `ui/hudLayout.js:122`, `ui/loadingPresenter.js:624`, `ui/moralTrapPrompt.js:43`, `ui/screens/mainMenu.js:759`, `ui/uiRoot.js:582`, `ui/uiRoot.js:1667`, `ui/voiceArbiter.js:543`, `ui/wreckChoicePrompt.js:55` |
| `save:recovered` | `save/saveSystem.js:5337` | `ui/screens/saveLoad.js:1112`, `ui/uiRoot.js:594` |
| `save:restoring` | `save/saveSystem.js:6704`, `save/saveSystem.js:6786` | `core/coreSystem.js:542`, `main.js:360`, `render/feel.js:1363`, `render/vfx.js:2778`, `render/vfx.js:2789`, `save/saveSystem.js:584`, `systems/aftermathWrecks.js:1178`, `systems/asteroidSites.js:813`, `systems/autoTargetAssist.js:155`, `systems/automation.js:615`, `systems/cloak.js:80`, `systems/encounterDirector.js:337`, `systems/environmentalMachinery.js:275`, `systems/faction_understory.js:683`, `systems/lawSecurity.js:403`, `systems/masslineTelemetry.js:124`, `systems/missions.js:1594`, `systems/missions.js:1876`, `systems/npcJobsRuntime.js:1100`, `systems/runSession.js:118`, `systems/salvage.js:167`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:90`, `systems/surrenderRecovery.js:108`, `systems/swarmFortify.js:152`, `systems/swarmLegendaries.js:125`, `systems/traffic.js:2181`, `systems/world.js:725`, `ui/loadingPresenter.js:621`, `ui/uiRoot.js:1666` |
| `save:slotsValidated` | `save/saveSystem.js:2996` | `ui/screens/saveLoad.js:1102` |
| `save:started` | `save/saveSystem.js:1907`, `save/saveSystem.js:2007`, `save/saveSystem.js:3849` | `systems/drill.js:1301`, `systems/encounterDirector.js:336`, `systems/encounterDirector.js:344`, `ui/screenManager.js:745` |
| `scan:capabilityVerdicts` | `systems/scanReveal.js:136` | `ui/signalInvestigationPrompt.js:265` |
| `scan:completed` | `balance/careerCohorts.js:520`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:1351`, `systems/world.js:6255` | `careers/origins/prospectorOrigin.js:633`, `systems/asteroidFormations.js:153`, `systems/heistFacilities.js:332`, `systems/missions.js:1741`, `systems/onboarding.js:620`, `systems/presentationOrchestrator.js:195`, `systems/salvage.js:164`, `systems/salvageActions.js:137`, `systems/story.js:269`, `systems/story.js:270`, `systems/world.js:781` |
| `scan:debrisCache` | `systems/mining.js:2192`, `systems/scanReveal.js:275` | `systems/presentationOrchestrator.js:205` |
| `scan:pulse` | `systems/scanner.js:1257` | `render/authoredMotion.js:1145`, `render/shipMicroMotion.js:1772`, `systems/asteroidSites.js:661`, `systems/buildIdentity.js:305`, `systems/cloak.js:97`, `systems/encounterDirector.js:364`, `systems/pirateDisguise.js:433`, `systems/presentationOrchestrator.js:194`, `systems/scanReveal.js:66`, `systems/world.js:782` |
| `scan:shipRevealed` | `systems/scanReveal.js:96` | `audio/audioSystem.js:2728`, `systems/buildIdentity.js:304` |
| `scan:weakPoint` | `systems/scanner.js:1340` | — |
| `scan:wreckInvestigated` | `systems/scanReveal.js:178` | `audio/audioSystem.js:2880` |
| `scan:wreckResolved` | `systems/scanner.js:1295` | `systems/lawSecurity.js:414` |
| `scan:wreckRevealed` | `systems/scanReveal.js:169` | `audio/audioSystem.js:2729`, `systems/presentationOrchestrator.js:204` |
| `scanner:ghostEscaped` | `systems/scanner.js:1199` | `systems/presentationOrchestrator.js:201` |
| `scanner:ghostRevealed` | `systems/scanner.js:1314` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:98` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:288` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:605`, `ui/comms.js:609` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:1227` | `systems/presentationOrchestrator.js:191` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:1287` | `audio/audioSystem.js:3039`, `audio/bombAudio.js:457`, `audio/fieldAudio.js:324`, `data/hazardLanguage.js:173`, `render/shipMicroMotion.js:1744`, `render/vfx.js:2774`, `render/vfx.js:2785`, `save/saveSystem.js:596`, `systems/achievements.js:1182`, `systems/aftermathWrecks.js:1154`, `systems/aiEncounter.js:138`, `systems/asteroidFormations.js:126`, `systems/asteroidSites.js:778`, `systems/automation.js:661`, `systems/bombs.js:691`, `systems/claims.js:411`, `systems/claims.js:413`, `systems/combatOutcome.js:282`, `systems/difficultyDirector.js:170`, `systems/dockingCorridor.js:79`, `systems/economy.js:1857`, `systems/encounterDirector.js:331`, `systems/factionPresence.js:521`, `systems/faction_archive.js:589`, `systems/faction_understory.js:682`, `systems/fields.js:722`, `systems/heistFacilities.js:304`, `systems/intervention.js:75`, `systems/lossInvestigation.js:127`, `systems/massSeed.js:139`, `systems/masslineSnares.js:135`, `systems/mines.js:76`, `systems/mining.js:313`, `systems/missions.js:1870`, `systems/moistureLoss.js:80`, `systems/moralTrap.js:187`, `systems/npcJobsRuntime.js:1088`, `systems/onboarding.js:817`, `systems/presentationOrchestrator.js:241`, `systems/routeFollower.js:427`, `systems/salvage.js:138`, `systems/salvageActions.js:145`, `systems/scanner.js:1119`, `systems/sectorSim.js:130`, `systems/shieldPylons.js:243`, `systems/story.js:220`, `systems/story.js:268`, `systems/survivalArena.js:1252`, `systems/survivorPod.js:606`, `systems/swarmLegendaries.js:127`, `systems/tetherGameplay.js:343`, `systems/traffic.js:2104`, `systems/travelLanes.js:554`, `systems/wingmen.js:132`, `ui/causeLedger.js:161`, `ui/commandBar.js:467`, `ui/loadingPresenter.js:632`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:270`, `ui/securityReadout.js:157`, `ui/watchlistHud.js:91` |
| `sector:exit` | `systems/world.js:1140` | `audio/bombAudio.js:456`, `audio/fieldAudio.js:323`, `core/physics.js:208`, `render/vfx.js:2775`, `render/vfx.js:2786`, `systems/achievements.js:1188`, `systems/aftermathWrecks.js:1164`, `systems/asteroidSites.js:803`, `systems/automation.js:649`, `systems/bombs.js:690`, `systems/dockingCorridor.js:78`, `systems/encounterDirector.js:333`, `systems/environmentalMachinery.js:273`, `systems/factionPresence.js:526`, `systems/factionPresence.js:529`, `systems/fields.js:721`, `systems/gateControlDirector.js:77`, `systems/heistFacilities.js:323`, `systems/impulseCharges.js:331`, `systems/lawSecurity.js:402`, `systems/massSeed.js:138`, `systems/masslineSnares.js:133`, `systems/masslineTelemetry.js:127`, `systems/mines.js:75`, `systems/mining.js:299`, `systems/missions.js:1871`, `systems/npcJobsRuntime.js:1087`, `systems/planetRuntime.js:178`, `systems/reactiveMatter.js:536`, `systems/sectorSim.js:129`, `systems/shieldPylons.js:242`, `systems/spawnBudget.js:50`, `systems/stationServices.js:278`, `systems/stationSideEventDirector.js:96`, `systems/surrenderRecovery.js:106`, `systems/survivalArena.js:1253`, `systems/swarmLegendaries.js:128`, `systems/tetherGameplay.js:342`, `systems/traffic.js:2129`, `systems/wingmen.js:144`, `ui/impoundPayPrompt.js:56`, `ui/impoundPayPrompt.js:61`, `ui/impoundPayPrompt.js:66`, `ui/promptDeck.js:860`, `ui/voiceArbiter.js:544`, `ui/wreckChoicePrompt.js:53` |
| `sector:membershipCandidate` | `systems/world.js:2544` | — |
| `sector:physicalLaw` | `systems/environmentalMachinery.js:820` | — |
| `sectorWonder:secured` | — | `systems/environmentalMachinery.js:261` |
| `sectorsim:embodiment` | `systems/sectorSim.js:1026` | `systems/world.js:764` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:389` | `ui/screens/starmap.js:895` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:2327`, `systems/claims.js:2043`, `systems/encounterDirector.js:2644`, `systems/mining.js:2906`, `systems/trafficRoleOps.js:1727`, `systems/worldPressure.js:192`, `systems/worldPressure.js:276`, `world/motionFossil.js:187` | `systems/sectorSim.js:138`, `systems/world.js:780` |
| `sectorsim:intel` | `systems/sectorSim.js:1080` | `systems/world.js:769` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:856` | `systems/economy.js:1912` |
| `sectorsim:reconcile` | `systems/sectorSim.js:809` | `systems/world.js:770` |
| `sectorsim:tick` | `systems/sectorSim.js:333` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:762` | `ui/screens/starmap.js:896` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:646` | `systems/scanner.js:1123` |
| `sensors:playerLit` | `systems/massSignature.js:501` | — |
| `sensors:playerSignature` | `systems/massSignature.js:437` | — |
| `sensors:playerUnlit` | `systems/massSignature.js:482` | — |
| `sensors:quietCoast` | `systems/massSignature.js:413`, `systems/massSignature.js:419` | — |
| `sensors:signatureLost` | `systems/massSignature.js:311`, `systems/massSignature.js:323` | — |
| `sensors:signatureReport` | `systems/massSignature.js:609` | — |
| `sensors:signatureResolved` | `systems/massSignature.js:305` | — |
| `service:aborted` | `systems/stationServices.js:365` | `audio/audioSystem.js:2960`, `render/authoredMotion.js:1164`, `systems/economy.js:1863` |
| `service:completed` | `features/salvageTender/services.js:146`, `systems/blindWelderRuntime.js:142`, `systems/economy.js:4878`, `systems/economy.js:5106`, `systems/economy.js:5157`, `systems/economy.js:5189`, `systems/economy.js:5244`, `systems/economy.js:5285`, `systems/economy.js:5317`, `systems/economy.js:5355`, `systems/stationServices.js:746`, `systems/stationServices.js:765` | `audio/audioSystem.js:2961`, `render/authoredMotion.js:1163`, `render/authoredMotion.js:1167`, `systems/factionPresence.js:539`, `systems/ships.js:2029` |
| `service:decantRequest` | `ui/station/stationApp.js:1072` | `systems/stationServices.js:286` |
| `service:decanted` | `systems/stationServices.js:562` | — |
| `service:progress` | `systems/stationServices.js:664` | — |
| `service:queued` | `systems/stationServices.js:490` | — |
| `service:started` | `systems/stationServices.js:648` | `audio/audioSystem.js:2959`, `render/authoredMotion.js:1162` |
| `setPiece:staged` | `render/trailerStaging.js:14` | — |
| `settings:changed` | `render/slowFrameOffer.js:165`, `save/saveSystem.js:7434`, `save/saveSystem.js:7436`, `systems/legacyTouch.js:703`, `ui/screens/mainMenu.js:84`, `ui/screens/motionAsk.js:108`, `ui/screens/pause.js:688`, `ui/screens/pause.js:696`, `ui/screens/pause.js:812`, `ui/screens/pause.js:852`, `ui/screens/raceBoard.js:99`, `ui/screens/settings.js:743`, `ui/screens/settings.js:1353`, `ui/screens/settings.js:1414`, `ui/screens/settings.js:1536` | `audio/audioSystem.js:3267`, `main.js:358`, `render/vfx.js:2792`, `save/saveSystem.js:507`, `systems/missions.js:1877`, `systems/survivalResults.js:508`, `ui/uiRoot.js:996` |
| `settings:restored` | `save/saveSystem.js:8018` | — |
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
| `ship:appearanceChanged` | `systems/ships.js:2484`, `systems/ships.js:3013`, `systems/trafficJobOps.js:370` | `core/coreSystem.js:541`, `render/vfx.js:2780` |
| `ship:appearanceSaved` | `systems/ships.js:3015` | `ui/station/screens/shipworks.js:801` |
| `ship:berthSwitching` | `systems/ships.js:2923` | — |
| `ship:boostPreKick` | `systems/flightV3.js:881` | `render/authoredMotion.js:1159`, `render/feel.js:1506` |
| `ship:boostStart` | `systems/flight.js:110`, `systems/flightV3.js:296` | `audio/audioSystem.js:3046`, `render/authoredMotion.js:1160`, `render/vfx.js:2820`, `systems/cruise.js:65`, `systems/onboarding.js:673` |
| `ship:boostStop` | `systems/flight.js:111`, `systems/flight.js:224`, `systems/flightV3.js:297`, `systems/flightV3.js:960` | `audio/audioSystem.js:3051`, `render/authoredMotion.js:1161`, `render/vfx.js:2821` |
| `ship:captured` | `systems/shipControlTransfer.js:92` | `data/encounters/362-the-salvage-watch.js:93`, `data/encounters/362-the-salvage-watch.js:187`, `data/encounters/367-the-salvage-tail.js:140` |
| `ship:cargoCapChanged` | `systems/ships.js:2479` | — |
| `ship:controlChanging` | `systems/shipControlTransfer.js:155` | `data/encounters/362-the-salvage-watch.js:98`, `data/encounters/362-the-salvage-watch.js:192`, `data/encounters/367-the-salvage-tail.js:135`, `systems/cruise.js:58`, `systems/flightV3.js:246`, `systems/tetherGameplay.js:341` |
| `ship:controlTransferred` | `systems/shipControlTransfer.js:195` | — |
| `ship:dash` | `systems/flight.js:201`, `systems/flightV3.js:906` | `audio/audioSystem.js:3054`, `render/vfx.js:2822`, `systems/combat.js:812`, `systems/gamepad.js:1109`, `systems/uniqueLootAbilities.js:160` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2741` | `render/vfx.js:2847` |
| `ship:deathPop` | `render/shipMicroMotion.js:1417`, `render/shipMicroMotion.js:2731` | `render/vfx.js:2846` |
| `ship:livingHullChanged` | `systems/ships.js:2150`, `systems/ships.js:2328`, `systems/story.js:2053` | `systems/barkDirector.js:806` |
| `ship:loadoutPresetApplied` | `systems/ships.js:3509` | `ui/station/screens/shipworks.js:832` |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:3358`, `systems/ships.js:3387`, `systems/ships.js:3412`, `systems/ships.js:3479`, `systems/ships.js:3499` | `ui/station/screens/shipworks.js:826` |
| `ship:loadoutPresetDeleted` | `systems/ships.js:3331` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:3302` | — |
| `ship:massChanged` | `systems/ships.js:2735` | — |
| `ship:nameChanged` | `systems/ships.js:3038` | `ui/orrery/hudAdapter.js:377` |
| `ship:parkedHoldSwap` | `systems/shipControlTransfer.js:140`, `systems/ships.js:2906` | — |
| `ship:phaseBlink` | `systems/phaseBlink.js:190`, `systems/phaseBlink.js:331` | `render/phaseBlinkPresentation.js:847` |
| `ship:purchased` | `systems/ships.js:2786`, `systems/ships.js:2825` | `audio/audioSystem.js:3013`, `systems/impoundLot.js:1087`, `systems/lawSecurity.js:422`, `systems/missions.js:1911` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1482`, `render/shipMicroMotion.js:2718` | `render/vfx.js:2845` |
| `ship:released` | `shipjack/ownedOperations.js:26` | — |
| `ship:roleContext` | `systems/ships.js:2386` | `systems/presentationAdapters.js:341` |
| `ship:sold` | `systems/ships.js:2875` | — |
| `ship:statsChanged` | `systems/ships.js:2478` | `systems/stationServices.js:279`, `systems/world.js:710`, `ui/commandBar.js:462` |
| `ship:swingDash` | `systems/flightV3.js:907` | `render/shipMicroMotion.js:1766` |
| `ship:thrust` | `systems/flight.js:435`, `systems/flightV3.js:2368` | `render/vfx.js:2819` |
| `shipbreakingYard:action` | `features/shipbreakingYard/presentation.js:79` | — |
| `shipbreakingYard:close` | `features/shipbreakingYard/runtime.js:128` | — |
| `shipbreakingYard:cue` | `features/shipbreakingYard/runtime.js:125` | `features/shipbreakingYard/audio.js:18` |
| `shipbreakingYard:delivered` | `features/shipbreakingYard/runtime.js:407` | — |
| `shipbreakingYard:offer` | `features/shipbreakingYard/runtime.js:212`, `features/shipbreakingYard/runtime.js:224`, `features/shipbreakingYard/runtime.js:252`, `features/shipbreakingYard/runtime.js:315`, `features/shipbreakingYard/runtime.js:498`, `features/shipbreakingYard/runtime.js:524` | — |
| `shipbreakingYard:receipt` | `features/shipbreakingYard/runtime.js:123` | — |
| `shipbreakingYard:view` | `features/shipbreakingYard/runtime.js:630` | — |
| `shipjack:actionCommitted` | `systems/shipjack.js:101` | — |
| `shipjack:claimResolved` | `shipjack/yardOperations.js:129`, `shipjack/yardOperations.js:194` | — |
| `shipjack:cue` | `systems/shipjack.js:77` | — |
| `shipjack:destroyed` | `systems/shipjack.js:376` | — |
| `shipjack:distress` | `systems/shipjack.js:130` | — |
| `shipjack:fleetArrived` | `shipjack/fleetOperations.js:180` | — |
| `shipjack:fleetDeparted` | `shipjack/fleetOperations.js:150` | — |
| `shipjack:fleetPickedUp` | `shipjack/fleetOperations.js:168` | — |
| `shipjack:fleetReceipt` | `shipjack/fleetOperations.js:70` | — |
| `shipjack:fleetStarted` | `shipjack/fleetOperations.js:115` | — |
| `shipjack:inspection` | `systems/shipjack.js:483` | — |
| `shipjack:opportunity` | `systems/shipjack.js:435` | — |
| `shipjack:result` | `systems/shipjack.js:98` | — |
| `shipjack:route` | `systems/shipjack.js:367` | — |
| `shipjack:settled` | `systems/shipjack.js:509` | — |
| `shipjack:yardCompleted` | `shipjack/yardOperations.js:128`, `shipjack/yardOperations.js:193` | — |
| `shipjack:yardReceipt` | `shipjack/yardOperations.js:90`, `shipjack/yardOperations.js:127` | — |
| `shipjack:yardStarted` | `shipjack/yardOperations.js:238` | — |
| `ships:grantModule` | `systems/fenceDesk.js:266` | `systems/ships.js:1900` |
| `signal:investigate` | — | `systems/scanner.js:1109` |
| `signal:investigated` | `systems/scanner.js:2078` | `systems/missions.js:1777`, `systems/presentationOrchestrator.js:198`, `systems/story.js:160`, `systems/world.js:713`, `ui/signalInvestigationPrompt.js:268` |
| `signal:investigating` | `systems/scanner.js:1611`, `systems/spectrum/index.js:257` | `ui/signalInvestigationPrompt.js:267` |
| `signal:receipt` | `systems/scanner.js:2079` | — |
| `signal:scanResults` | `response/mercyService/live.js:144`, `systems/scanner.js:1352`, `systems/spectrum/index.js:131`, `systems/spectrum/index.js:246` | `systems/missions.js:1762`, `systems/presentationOrchestrator.js:196`, `systems/story.js:271`, `systems/story.js:274`, `ui/signalInvestigationPrompt.js:264` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:318` | `systems/scanner.js:1110` |
| `signal:track` | — | `systems/scanner.js:1108` |
| `signal:tracked` | `systems/scanner.js:1619`, `systems/scanner.js:1642` | `systems/presentationOrchestrator.js:197`, `ui/signalInvestigationPrompt.js:266` |
| `sim:pause` | `ui/screenManager.js:552` | `audio/audioSystem.js:3283`, `audio/bombAudio.js:463`, `audio/fieldAudio.js:329`, `render/feel.js:1361`, `systems/autoTargetAssist.js:166` |
| `sim:resume` | `core/simLaneMain.js:429`, `ui/screenManager.js:560` | `audio/audioSystem.js:3284`, `ui/screenManager.js:738` |
| `site:anchored` | `systems/asteroidSites.js:1807` | — |
| `site:chargePressed` | `systems/asteroidSites.js:2817` | — |
| `site:claimContested` | `systems/asteroidSites.js:2926` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:3306` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:3194` | `audio/audioSystem.js:3311` |
| `site:courierLost` | `systems/asteroidSites.js:3290` | — |
| `site:created` | `systems/asteroidSites.js:1745` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:2202`, `systems/asteroidSites.js:2291` | — |
| `site:lost` | `systems/asteroidSites.js:2440` | `ui/alerts.js:490` |
| `site:machineInstalled` | `systems/asteroidSites.js:1776` | `audio/audioSystem.js:3310`, `ui/alerts.js:489` |
| `site:machineMode` | `systems/asteroidSites.js:2312` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:2219` | `render/authoredMotion.js:1179` |
| `site:machineStatus` | `systems/asteroidSites.js:2881` | `audio/audioSystem.js:3315`, `ui/alerts.js:485` |
| `site:podBuilt` | `systems/asteroidSites.js:2743` | — |
| `site:producing` | `systems/asteroidSites.js:2037` | `render/authoredMotion.js:1178`, `ui/asteroid/asteroidScreen.js:2208` |
| `site:rematerialized` | `systems/asteroidSites.js:2492` | — |
| `site:signatureBand` | `systems/asteroidSites.js:2918` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1955` | `ui/asteroid/asteroidScreen.js:2193` |
| `site:surveyComplete` | `systems/asteroidSites.js:1898` | `ui/asteroid/asteroidScreen.js:2187` |
| `site:surveyDetected` | `systems/asteroidSites.js:1888` | `ui/asteroid/asteroidScreen.js:2180` |
| `siteEvidence:action` | `ui/physicalJobsPrompt.js:66` | `systems/asteroidSites.js:655` |
| `siteEvidence:closed` | `systems/machineWork.js:79`, `systems/machineWork.js:123`, `systems/machineWork.js:149`, `systems/machineWork.js:263`, `world/motionFossil.js:112`, `world/motionFossil.js:147`, `world/motionFossil.js:258` | — |
| `siteEvidence:offer` | `systems/machineWork.js:88`, `world/motionFossil.js:119` | — |
| `siteEvidence:result` | `systems/asteroidSites.js:659` | — |
| `slate:columnRead` | `systems/slateColumn.js:153` | — |
| `slate:spike` | `systems/slateColumn.js:132` | — |
| `solstice:bloom` | `systems/solstice.js:526` | — |
| `solstice:charged` | `systems/solstice.js:449` | — |
| `solstice:destroyed` | `systems/solstice.js:361` | — |
| `solstice:voice` | `systems/solstice.js:291` | — |
| `spawn:request` | `systems/automation.js:1983` | `systems/world.js:746` |
| `spectrum:focus` | `ui/signalInvestigationPrompt.js:189` | — |
| `spectrum:resolved` | `systems/spectrum/index.js:314` | — |
| `station:berthAssigned` | `systems/stationServices.js:627` | — |
| `station:blockade` | `systems/economy.js:4725` | — |
| `station:boom` | `systems/economy.js:4702` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:430` | `render/vfx.js:2808` |
| `station:exitRequest` | `ui/screenManager.js:697`, `ui/uiRoot.js:1552` | `ui/station/stationApp.js:1538` |
| `station:grudge` | `systems/economy.js:4538` | — |
| `station:grudgeCleared` | `systems/economy.js:4576` | — |
| `station:holding` | `systems/stationServices.js:631` | — |
| `station:moduleGained` | `systems/claims.js:2637` | `systems/factions.js:512` |
| `station:navigate` | `ui/screens/automationPanel.js:1893`, `ui/station/screens/bar.js:819`, `ui/station/screens/bar.js:824`, `ui/station/screens/industry.js:577`, `ui/station/screens/industry.js:584` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:266` | `render/infrastructureMotion.js:205`, `render/vfx.js:2807` |
| `station:slammed` | `systems/economy.js:4481` | `systems/sectorSim.js:158` |
| `station:strike` | `systems/economy.js:4665` | — |
| `station:throughput` | `systems/claims.js:2598` | `render/authoredMotion.js:1199` |
| `station:yardChanged` | `systems/stationServices.js:822` | — |
| `stationContact:changed` | `systems/stationContacts.js:248`, `systems/stationContacts.js:436`, `systems/stationContacts.js:472`, `systems/stationContacts.js:749`, `systems/stationContacts.js:773` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:361`, `systems/stationContacts.js:790` | — |
| `stationContact:counterDelta` | `systems/missions.js:5098` | — |
| `stationContact:manifestWon` | `systems/manifestGame.js:16` | — |
| `stationLife:deedNoticed` | `systems/stationContacts.js:710` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:460`, `systems/stationContacts.js:572`, `systems/stationContacts.js:603` | — |
| `story:beatAdvanced` | `systems/missionStoryOps.js:2195` | `save/saveSystem.js:603`, `systems/story.js:150`, `ui/screens/codex.js:903` |
| `story:continuationAccess` | `systems/story.js:2487` | — |
| `story:elroyResolved` | `systems/missionObjectiveOps.js:1223` | `systems/story.js:151` |
| `story:kurtzLedger` | `systems/story.js:1738`, `systems/story.js:1749` | `systems/story.js:179` |
| `story:newGamePlusStarted` | `systems/story.js:1967` | `systems/titles.js:589` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:2460` | `systems/story.js:177` |
| `story:postEndingContinuity` | `systems/story.js:1638` | `ui/screens/missionLog.js:2446` |
| `story:postEndingProgress` | `systems/story.js:1608` | `ui/screens/missionLog.js:2445` |
| `story:replayHookUnlocked` | `systems/story.js:1623` | `ui/screens/missionLog.js:2447` |
| `story:skimResolved` | `systems/missionStoryOps.js:1941` | `systems/missions.js:1661` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:810`, `systems/wingmen.js:156` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:809`, `systems/wingmen.js:157` |
| `story:varianceSeamFailed` | `systems/missionStoryOps.js:2414` | — |
| `story:vergeEvidenceRecorded` | `systems/story.js:1414` | `systems/story.js:178` |
| `story:vergeObserversRevealed` | `systems/story.js:1182` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1434` | `systems/story.js:180` |
| `stunt:arenaLawBounty` | `systems/stuntGrammar.js:185` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:299` | `ui/stuntCallout.js:810` |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:284` | `ui/stuntCallout.js:809` |
| `stunt:salvageRights` | `systems/stuntGrammar.js:194` | `ui/stuntCallout.js:807` |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:218` | `ui/stuntCallout.js:808` |
| `stunt:styleBanked` | `systems/stuntGrammar.js:167` | `audio/audioSystem.js:2901`, `ui/stuntCallout.js:798` |
| `stunt:trickAmended` | — | `systems/achievements.js:1171`, `systems/bulletTime.js:136`, `systems/survivalResults.js:514`, `systems/titles.js:588`, `ui/stuntCallout.js:797` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:2900`, `systems/achievements.js:1169`, `systems/bulletTime.js:135`, `systems/killReplay.js:382`, `systems/survivalResults.js:513`, `systems/titles.js:587`, `ui/stuntCallout.js:796`, `ui/toasts.js:601` |
| `surrender:escaped` | — | `systems/combatOutcome.js:296` |
| `surrender:secured` | — | `systems/traffic.js:2155` |
| `surrender:tethered` | — | `systems/traffic.js:2154` |
| `survivalArena:installed` | — | `systems/survivalAnnounce.js:383`, `systems/swarmArena.js:742` |
| `survivalArena:released` | — | `systems/swarmArena.js:743` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1516` | — |
| `survivalWave:cohortJoined` | `systems/capitalBossRuntime.js:190` | `systems/survivalWave.js:206` |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:136` | `systems/survivorPod.js:620` |
| `survivorPod:delivered` | `systems/trafficRoleOps.js:1226` | `render/authoredMotion.js:1200`, `systems/titles.js:590` |
| `survivorPod:ejected` | `systems/survivorPod.js:856`, `systems/survivorPod.js:993` | `render/authoredMotion.js:1183`, `systems/aftermathWrecks.js:1169`, `systems/lawSecurity.js:401`, `systems/survivorPod.js:628` |
| `survivorPod:heatCooled` | `systems/heat.js:812` | `systems/survivorPod.js:621` |
| `survivorPod:huntDispatched` | `ai/podHunt.js:188` | — |
| `survivorPod:huntEnded` | `ai/podHunt.js:244` | — |
| `survivorPod:promoted` | `systems/survivorPod.js:1411` | — |
| `survivorPod:ransomed` | — | `systems/fenceDesk.js:63` |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1555`, `systems/survivorPod.js:1590` | `ui/wreckChoicePrompt.js:52` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1569` | `render/authoredMotion.js:1184`, `systems/missions.js:1848` |
| `survivorPod:rescued` | — | `systems/heat.js:441`, `systems/titles.js:591`, `systems/traffic.js:2175` |
| `survivorPod:resolved` | `systems/survivorPod.js:1274` | — |
| `survivorPod:stripBlocked` | `systems/survivorPod.js:1532` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1627` | `systems/missions.js:1850`, `ui/wreckChoicePrompt.js:51` |
| `swarm:affix` | — | `systems/survivalAnnounce.js:375` |
| `swarm:announce` | — | `ui/swarmJuiceHud.js:90` |
| `swarm:bossDown` | — | `ui/swarmJuiceHud.js:95` |
| `swarm:bossHp` | — | `ui/swarmJuiceHud.js:94` |
| `swarm:bossIntro` | — | `ui/swarmJuiceHud.js:93` |
| `swarm:broodBurst` | `systems/swarmBrood.js:2377`, `systems/swarmBrood.js:2451` | — |
| `swarm:broodDeathPositions` | `systems/swarmBrood.js:2717` | `systems/swarmLegendaries.js:120` |
| `swarm:broodKills` | `systems/swarmBrood.js:2688` | `systems/survivalResults.js:505`, `systems/swarmChain.js:166`, `systems/swarmJuice.js:163`, `systems/swarmSupply.js:104` |
| `swarm:broodProjectileHit` | `systems/swarmBrood.js:2071` | — |
| `swarm:broodRemains` | `systems/swarmBrood.js:2507` | — |
| `swarm:broodRemainsSpent` | `systems/swarmBrood.js:2549` | — |
| `swarm:broodReserve` | `systems/swarmBrood.js:2665` | — |
| `swarm:broodTelegraph` | `systems/swarmBrood.js:1332` | `systems/survivalAnnounce.js:374` |
| `swarm:broodTeslaHit` | `systems/swarmBrood.js:2101` | — |
| `swarm:chain` | — | `audio/audioSystem.js:2905`, `systems/survivalResults.js:523`, `systems/swarmElites.js:152`, `systems/swarmJuice.js:168`, `ui/survivalHud.js:324`, `ui/swarmJuiceHud.js:96` |
| `swarm:chainBest` | — | `systems/survivalResults.js:544` |
| `swarm:chainBroken` | — | `audio/audioSystem.js:2908`, `systems/swarmElites.js:153`, `systems/swarmJuice.js:169`, `ui/survivalHud.js:325`, `ui/swarmJuiceHud.js:97` |
| `swarm:chainShatter` | — | `ui/swarmJuiceHud.js:99` |
| `swarm:chainTier` | — | `ui/swarmJuiceHud.js:98` |
| `swarm:event` | `systems/swarmEvents.js:365` | `ui/encounterChoicePrompt.js:183` |
| `swarm:eventTelegraphed` | `systems/swarmEvents.js:167` | `ui/encounterChoicePrompt.js:182` |
| `swarm:eventVerdict` | `ui/encounterChoicePrompt.js:157` | `systems/swarmEvents.js:117` |
| `swarm:fortifyBuildRequested` | `ui/swarmFortifyPanel.js:111` | — |
| `swarm:fortifyBuildResolved` | — | `ui/swarmFortifyPanel.js:91` |
| `swarm:fortifyReloadRequested` | `ui/swarmFortifyPanel.js:113` | — |
| `swarm:fortifyRepairRequested` | `ui/swarmFortifyPanel.js:112` | — |
| `swarm:fortifyState` | — | `ui/swarmFortifyPanel.js:87` |
| `swarm:fortifyStateRequested` | `ui/swarmFortifyPanel.js:105` | — |
| `swarm:killPopup` | — | `ui/stuntCallout.js:932`, `ui/swarmJuiceHud.js:89` |
| `swarm:pressureSpend` | — | `systems/survivalResults.js:512` |
| `swarm:pressureTelegraph` | — | `systems/survivalAnnounce.js:373` |
| `swarm:roundClear` | — | `ui/swarmJuiceHud.js:92` |
| `swarm:roundSlam` | — | `ui/swarmJuiceHud.js:91` |
| `swarm:stallReleased` | — | `systems/survivalAnnounce.js:376` |
| `swarmrepair:barrel` | — | `render/visualFactory.js:3703` |
| `swarmrepair:crossbar` | — | `render/visualFactory.js:3718`, `render/visualFactory.js:3719` |
| `swarmrepair:flange` | — | `render/visualFactory.js:3705` |
| `swarmrepair:lid` | — | `render/visualFactory.js:3707` |
| `swarmrepair:weldseam` | — | `render/visualFactory.js:3714` |
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
| `tech:researched` | `systems/ships.js:2530` | `audio/audioSystem.js:3009`, `systems/onboarding.js:855`, `systems/ships.js:1904` |
| `terrainAnchors:replenished` | `systems/terrainAnchors.js:249` | — |
| `tether:attached` | `combat/attachments.js:537` | `audio/audioSystem.js:3112`, `render/authoredMotion.js:1150`, `render/vfx.js:2719`, `systems/encounterDirector.js:369`, `systems/presentationOrchestrator.js:99`, `systems/scenarioRuntime.js:24`, `systems/surrenderRecovery.js:99`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:536`, `systems/tetherGameplay.js:1484`, `systems/tetherGameplay.js:1505`, `systems/tetherGameplay.js:2408` | `audio/audioSystem.js:3139`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1774`, `systems/faction_understory.js:678`, `systems/lineProgression.js:55`, `systems/onboarding.js:618`, `systems/onboarding.js:634`, `systems/surrenderRecovery.js:103` |
| `tether:broken` | `combat/attachments.js:655` | `audio/audioSystem.js:3100`, `render/feel.js:1544`, `render/vfx.js:2722`, `systems/encounterDirector.js:370`, `systems/missions.js:1793`, `systems/presentationOrchestrator.js:107`, `systems/scenarioRuntime.js:28`, `systems/surrenderRecovery.js:100`, `systems/tetherGameplay.js:344`, `systems/volatileExposure.js:217`, `ui/masslineHud.js:1147` |
| `tether:couplerLock` | `systems/tetherGameplay.js:2816` | — |
| `tether:cut` | `systems/tetherGameplay.js:2137` | `audio/audioSystem.js:3157`, `systems/gamepad.js:1002`, `systems/masslineThrow.js:120`, `systems/onboarding.js:633`, `systems/onboarding.js:682`, `systems/onboarding.js:692` |
| `tether:cutDenied` | `systems/tetherGameplay.js:2121` | — |
| `tether:detached` | — | `systems/missions.js:1792` |
| `tether:latchDenied` | `systems/masslineSnares.js:744`, `systems/tetherGameplay.js:429`, `systems/tetherGameplay.js:615`, `systems/tetherGameplay.js:640`, `systems/tetherGameplay.js:688`, `systems/tetherGameplay.js:693`, `systems/tetherGameplay.js:702`, `systems/tetherGameplay.js:731`, `systems/tetherGameplay.js:1121` | `render/authoredMotion.js:1156`, `systems/onboarding.js:891`, `testing/lab/proofSixtySeconds.js:1530`, `ui/masslineHud.js:1093` |
| `tether:latched` | `systems/tetherGameplay.js:516`, `systems/tetherGameplay.js:726`, `systems/tetherGameplay.js:756` | `audio/audioSystem.js:3127`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:739`, `systems/flightV3.js:247`, `systems/gamepad.js:1001`, `systems/heistFacilities.js:336`, `systems/lawSecurity.js:409`, `systems/lineProgression.js:53`, `systems/longBerth.js:53`, `systems/masslineThrow.js:126`, `systems/missions.js:1791`, `systems/missions.js:1830`, `systems/missions.js:1897`, `systems/onboarding.js:613`, `systems/onboarding.js:630`, `systems/onboarding.js:671`, `systems/onboarding.js:680`, `systems/onboarding.js:898`, `systems/onboarding.js:901`, `systems/onboarding.js:913`, `systems/onboarding.js:935`, `systems/surrenderRecovery.js:98`, `systems/survivorPod.js:627`, `testing/lab/proofSixtySeconds.js:1531`, `ui/masslineHud.js:1107`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1789` | — |
| `tether:massWeighed` | `systems/masslineTelemetry.js:338` | `systems/economyContracts.js:263` |
| `tether:nearBreak` | `combat/attachments.js:1040`, `combat/attachments.js:1063` | `audio/audioSystem.js:3124`, `systems/onboarding.js:619`, `systems/onboarding.js:937`, `systems/presentationOrchestrator.js:100` |
| `tether:rebound` | `combat/attachments.js:969` | `audio/audioSystem.js:3168` |
| `tether:reel` | `combat/attachments.js:589` | `audio/audioSystem.js:3098`, `systems/missions.js:1787`, `systems/onboarding.js:616`, `systems/onboarding.js:631`, `systems/surrenderRecovery.js:101` |
| `tether:reelPump` | `systems/masslineTelemetry.js:400` | `render/authoredMotion.js:1153`, `ui/stuntCallout.js:879` |
| `tether:releaseRated` | `systems/tetherGameplay.js:537`, `systems/tetherGameplay.js:1480`, `systems/tetherGameplay.js:1485`, `systems/tetherGameplay.js:1507`, `systems/tetherGameplay.js:2139` | `audio/audioSystem.js:3099`, `render/feel.js:1597`, `render/vfx.js:2721`, `systems/economy.js:1819`, `systems/gamepad.js:1003`, `systems/masslineThrow.js:123`, `systems/missions.js:1794`, `systems/presentationOrchestrator.js:166`, `systems/titles.js:592`, `ui/masslineHud.js:1115` |
| `tether:released` | `systems/tetherGameplay.js:1477`, `systems/tetherGameplay.js:1503`, `systems/tetherGameplay.js:2138` | `render/authoredMotion.js:1154`, `render/shipMicroMotion.js:1773`, `render/vfx.js:2720`, `systems/barkDirector.js:839`, `systems/faction_understory.js:677`, `systems/lineProgression.js:54`, `systems/onboarding.js:617`, `systems/onboarding.js:632`, `systems/onboarding.js:681`, `systems/onboarding.js:691`, `systems/rockCore.js:97`, `systems/surrenderRecovery.js:102`, `systems/tumbleStates.js:133`, `systems/world.js:787` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2720` | `ui/stuntCallout.js:876` |
| `tether:snagged` | `systems/tetherGameplay.js:2573` | `audio/audioSystem.js:3161` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:478` | `render/authoredMotion.js:1152`, `ui/stuntCallout.js:878` |
| `tether:strain` | `systems/tetherGameplay.js:1853` | `audio/audioSystem.js:3117`, `render/authoredMotion.js:1158`, `systems/missions.js:1688`, `systems/onboarding.js:938` |
| `tether:tractorCapture` | `systems/tetherGameplay.js:780` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1622`, `render/vfx.js:2771`, `systems/collisionConsequences.js:101`, `systems/combat.js:801`, `systems/lineHeads.js:121`, `systems/lineHeads.js:122`, `systems/masslineImpactDamage.js:57`, `systems/missions.js:1795`, `systems/onboarding.js:635`, `systems/onboarding.js:683`, `systems/onboarding.js:939`, `systems/presentationOrchestrator.js:142`, `systems/tumbleStates.js:128`, `ui/stuntCallout.js:880` |
| `tether:whipSnap` | `systems/tetherGameplay.js:2266` | `systems/gamepad.js:1017` |
| `title:holdResolved` | — | `systems/titles.js:581` |
| `touch:guide` | `ui/screens/pause.js:1115` | — |
| `touch:uiAction` | `systems/legacyTouch.js:635` | `ui/input.js:1021` |
| `towlineTable:assistAccepted` | `systems/towlineTable.js:202` | — |
| `towlineTable:assistFulfilled` | `systems/towlineTable.js:226` | — |
| `towlineTable:cleanupAccepted` | `systems/towlineTable.js:159` | — |
| `towlineTable:offer` | `systems/towlineTable.js:261` | `ui/towlineTablePrompt.js:7` |
| `traffic:anvilSpillReturned` | `systems/anvilWork.js:579` | — |
| `traffic:anvilTransfer` | `systems/anvilWork.js:679` | — |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:2891` |
| `traffic:freightTallied` | `systems/trafficRoleOps.js:947` | — |
| `traffic:haulerRegroup` | `systems/trafficRoleOps.js:1735` | `systems/barkDirector.js:859` |
| `traffic:oreCollected` | `systems/trafficRoleOps.js:1022` | `render/authoredMotion.js:1195`, `render/npcJobSignatureVfx.js:676`, `render/npcJobSignatureVfx.js:901` |
| `traffic:passengerLinerReceipt` | `systems/trafficJobOps.js:844` | — |
| `traffic:passengerLinerSuspended` | `systems/trafficCausalChainOps.js:2651` | — |
| `traffic:richSeamHelpReserved` | `systems/trafficRecoveryOps.js:572` | `systems/barkDirector.js:845` |
| `traffic:spillNoticed` | `systems/trafficRoleOps.js:1659` | `systems/barkDirector.js:843` |
| `traffic:vesselRelinquished` | `systems/traffic.js:2039` | — |
| `travelLanes:slingRingPass` | — | `ui/toasts.js:611` |
| `tutorial:finished` | `systems/onboarding.js:2184` | `systems/achievements.js:1200`, `systems/missions.js:1587`, `systems/presentationAdapters.js:344`, `systems/story.js:173` |
| `tutorial:say` | `systems/onboarding.js:1767` | `audio/audioSystem.js:3223`, `systems/story.js:213` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2313` | `systems/missions.js:1605` |
| `ui:acceptMission` | `ui/adventureDecisions.js:426` | `systems/missions.js:1604` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:4953` | `systems/ships.js:1989` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:1778` |
| `ui:buyModule` | — | `systems/onboarding.js:850`, `systems/ships.js:1973` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:5460` | `systems/bombs.js:701` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:5141` | `systems/ships.js:1936` |
| `ui:cancel` | `ui/input.js:1289`, `ui/input.js:1304` | `ui/screens/crucibleDraft.js:1047`, `ui/swarmFortifyPanel.js:98` |
| `ui:clearTarget` | `ui/input.js:634` | `ui/uiRoot.js:1408` |
| `ui:closeAll` | `main.js:1068`, `ui/loadingPresenter.js:548`, `ui/screens/crucible.js:3875` | `ui/uiRoot.js:1403` |
| `ui:closeCargo` | `ui/input.js:440`, `ui/input.js:594` | — |
| `ui:closeComms` | `ui/input.js:588` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1397` |
| `ui:confirm` | `ui/input.js:1299` | `audio/audioSystem.js:3329` |
| `ui:convoyShareBuy` | — | `systems/economy.js:1816` |
| `ui:cycleComponent` | `ui/targetPanel.js:843`, `ui/targetPanel.js:847` | `ui/uiRoot.js:1412` |
| `ui:cycleTarget` | `ui/input.js:629`, `ui/input.js:1373` | `ui/uiRoot.js:1407` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:4999` | `systems/ships.js:1990` |
| `ui:endgameChoose` | `systems/missions.js:2292`, `ui/station/barContacts.js:1351` | `systems/story.js:226` |
| `ui:endgameConfirm` | — | `systems/story.js:227` |
| `ui:endgameDecline` | `ui/comms.js:536` | `systems/story.js:228` |
| `ui:endgameDepartAshfall` | `ui/comms.js:553` | `systems/story.js:237` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2163` | `systems/story.js:234` |
| `ui:endgameStayAshfall` | `ui/comms.js:554` | `systems/story.js:238` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2167` | `systems/story.js:235` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:236` |
| `ui:endingArchiveOpen` | `ui/screens/pause.js:1140` | `systems/story.js:230` |
| `ui:entityDrawer` | `ui/entityLinks.js:321`, `ui/entityLinks.js:339`, `ui/entityLinks.js:394` | `ui/globalFind.js:197` |
| `ui:entityRoute` | `ui/entityLinks.js:199` | `systems/routeFollower.js:411` |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:85` | `systems/factionPresence.js:536` |
| `ui:fitModule` | — | `systems/onboarding.js:847`, `systems/ships.js:1975` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:5470` | `systems/bombs.js:702` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1940` | `systems/automation.js:593`, `systems/wingmen.js:153` |
| `ui:forwardSlipBuy` | — | `systems/economy.js:1817` |
| `ui:globalFind` | `ui/input.js:489`, `ui/input.js:570` | `ui/globalFind.js:193` |
| `ui:heliosBay7Scan` | — | `systems/story.js:277` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:230` | `systems/story.js:276` |
| `ui:loadingHidden` | `ui/loadingPresenter.js:387` | `ui/screens/mainMenu.js:990` |
| `ui:manifestAction` | `ui/screens/manifest.js:30` | — |
| `ui:manifestOpen` | `ui/screens/manifest.js:27` | — |
| `ui:manifestStart` | `ui/screens/manifest.js:51` | — |
| `ui:navigate` | `ui/input.js:1275`, `ui/input.js:1280`, `ui/input.js:1346` | — |
| `ui:popScreen` | `ui/galaxyMap.js:3217`, `ui/screens/achievements.js:266`, `ui/screens/automationPanel.js:1076`, `ui/screens/clips.js:458`, `ui/screens/credits.js:182`, `ui/screens/crucible.js:2473`, `ui/screens/crucibleDraft.js:1880`, `ui/screens/localmap.js:883`, `ui/screens/manifest.js:86`, `ui/screens/replay.js:305`, `ui/screens/starmap.js:708`, `ui/screens/statistics.js:174`, `ui/screens/techTree.js:340`, `ui/swarmFortifyPanel.js:79`, `ui/swarmFortifyPanel.js:99` | `ui/uiRoot.js:1393` |
| `ui:prepareBombRack` | `systems/ships.js:3497`, `ui/station/screens/shipworks.js:5058` | `systems/bombs.js:712` |
| `ui:previewBombRackPreparation` | `systems/ships.js:3408`, `ui/station/screens/shipworks.js:3979`, `ui/station/screens/shipworks.js:5014` | `systems/bombs.js:709` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:722` | `systems/world.js:749` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:810` | `systems/world.js:748` |
| `ui:pushScreen` | `main.js:577`, `systems/story.js:1394`, `ui/loadingPresenter.js:549`, `ui/mapAuthority.js:133`, `ui/screens/base.js:1386`, `ui/screens/crucible.js:3876`, `ui/screens/crucibleDraft.js:80`, `ui/screens/crucibleDraft.js:949`, `ui/screens/gameOver.js:533`, `ui/screens/starmap.js:716`, `ui/signalInvestigationPrompt.js:260`, `ui/station/barContacts.js:1071`, `ui/station/screens/bar.js:761`, `ui/station/screens/bar.js:804`, `ui/station/screens/industry.js:571`, `ui/station/stationApp.js:588` | `ui/uiRoot.js:1370` |
| `ui:replaceScreen` | `ui/screens/crucible.js:3840`, `ui/screens/crucible.js:3867`, `ui/screens/motionAsk.js:118` | `ui/uiRoot.js:1402` |
| `ui:restockBombRack` | — | `systems/bombs.js:705` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:4925` | `systems/ships.js:1988` |
| `ui:screenTop` | `ui/screenManager.js:367` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:1779` |
| `ui:sellModule` | — | `systems/ships.js:1974` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:5480` | `systems/bombs.js:704` |
| `ui:service` | `balance/careerCohorts.js:749`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:547`, `ui/station/stationApp.js:1103`, `ui/station/stationApp.js:1139` | `systems/economy.js:1860` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:5148`, `ui/station/screens/shipworks.js:5283` | `systems/ships.js:1972` |
| `ui:setCourse` | `data/encounters/1210-the-deadweight.js:284`, `features/rigWorkshop/jobs.js:259`, `features/rigWorkshop/runtime.js:287`, `features/salvageTender/runtime.js:309`, `features/shipbreakingYard/runtime.js:485`, `features/shipbreakingYard/runtime.js:491`, `systems/borrowedSun.js:605`, `systems/economy.js:4925`, `systems/economy.js:4952`, `systems/factionPresence.js:1741`, `systems/ilexArk.js:40`, `systems/missions.js:3194`, `systems/palletJack.js:287`, `systems/redKite.js:61`, `systems/scanner.js:1641`, `systems/scanner.js:1673`, `systems/scanner.js:1829`, `systems/shipjack.js:366`, `systems/tallyThree.js:118`, `systems/towlineTable.js:34`, `ui/galaxyMap.js:2849`, `ui/galaxyMap.js:2864`, `ui/galaxyMap.js:8564`, `ui/market/tradeLogic.js:575`, `ui/radar.js:1708`, `ui/screens/footprint.js:1668`, `ui/screens/footprint.js:1679`, `ui/screens/localmap.js:1218`, `ui/screens/starmap.js:1636`, `ui/screens/starmap.js:1649`, `ui/screens/starmap.js:1653` | `systems/world.js:704` |
| `ui:setShipAppearance` | `ui/screens/raceBoard.js:328`, `ui/station/screens/shipworks.js:4840` | `systems/ships.js:1992` |
| `ui:setShipName` | `ui/station/screens/shipworks.js:5186` | `systems/ships.js:1995` |
| `ui:shipjack` | `ui/blackFlag.js:75`, `ui/blackFlag.js:94`, `ui/blackFlag.js:97`, `ui/blackFlag.js:104`, `ui/blackFlag.js:182`, `ui/blackFlagRegistry.js:142`, `ui/blackFlagRegistry.js:145`, `ui/blackFlagRegistry.js:154` | — |
| `ui:talkContact` | — | `systems/fenceDesk.js:61`, `systems/story.js:278` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:66`, `combat/autoTargetMode.js:256` | `ui/uiRoot.js:1413` |
| `ui:toast` | `systems/scanner.js:1826`, `systems/scanner.js:1832` | — |
| `ui:toggleCargo` | `ui/input.js:699` | — |
| `ui:toggleComms` | `ui/input.js:721` | — |
| `ui:toggleOverview` | `ui/input.js:706` | — |
| `ui:trackMission` | `ui/galaxyMap.js:4567`, `ui/galaxyMap.js:4726`, `ui/screens/missionLog.js:2159`, `ui/screens/missionLog.js:2231`, `ui/screens/missionLog.js:2292`, `ui/station/screens/contracts.js:1554` | `systems/missions.js:1609` |
| `ui:transferParkedCargo` | `ui/station/screens/shipworks.js:5304` | — |
| `ui:undock` | — | `ui/input.js:1020` |
| `ui:unfitModule` | — | `systems/ships.js:1984` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:5490` | `systems/bombs.js:703` |
| `ui:unlockTech` | `ui/screens/techTree.js:839` | `systems/ships.js:1991` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:5128` | `systems/bombs.js:706` |
| `ui:wingOrder` | `ui/wingmanRadial.js:273` | `systems/automation.js:597` |
| `ui:wingmanRadial` | `ui/input.js:713` | `ui/wingmanRadial.js:344` |
| `understory:accessTier` | `systems/faction_understory.js:1151` | — |
| `understory:blacklisted` | `systems/faction_understory.js:1758` | — |
| `understory:buyCover` | — | `systems/faction_understory.js:680` |
| `understory:compostRunComplete` | `systems/faction_understory.js:1065` | — |
| `understory:coverBurned` | `systems/faction_understory.js:1824` | — |
| `understory:coverIssued` | `systems/faction_understory.js:1813` | — |
| `understory:debtChanged` | `systems/faction_understory.js:1189`, `systems/faction_understory.js:1206`, `systems/faction_understory.js:1900` | — |
| `understory:debtSquared` | `systems/faction_understory.js:1212` | — |
| `understory:dropCracked` | `systems/faction_understory.js:1525` | — |
| `understory:dropDelivered` | `systems/faction_understory.js:1462` | — |
| `understory:dropLapsed` | `systems/faction_understory.js:1392`, `systems/faction_understory.js:1402`, `systems/faction_understory.js:1435`, `systems/faction_understory.js:1443`, `systems/faction_understory.js:1503` | — |
| `understory:dropReturned` | `systems/faction_understory.js:1476` | — |
| `understory:dropStashed` | `systems/faction_understory.js:1314` | — |
| `understory:favor` | `systems/faction_understory.js:1146` | — |
| `understory:gardenFed` | `systems/faction_understory.js:1022` | — |
| `understory:gardenSeeded` | `systems/faction_understory.js:949` | — |
| `understory:gardenStage` | `systems/faction_understory.js:1025` | — |
| `understory:markedStash` | `systems/faction_understory.js:1674` | — |
| `understory:noticeChanged` | `systems/faction_understory.js:1729`, `systems/faction_understory.js:1781` | — |
| `understory:payDebt` | — | `systems/faction_understory.js:681` |
| `understory:playerGrowth` | `systems/faction_understory.js:910`, `systems/faction_understory.js:1023` | `systems/missions.js:1665` |
| `understory:sporeSkin` | `systems/faction_understory.js:1133` | — |
| `understory:whisperPosted` | `systems/faction_understory.js:1547` | — |
| `understory:whisperVerified` | `systems/faction_understory.js:1620` | — |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:391` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:329` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:250` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1673` | `audio/audioSystem.js:2967`, `systems/missions.js:1863`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:blackBoxRecovered` | `systems/uniqueWrecks.js:1703` | — |
| `uniqueWreck:choose` | `systems/missionObjectiveOps.js:888`, `systems/uniqueWreckEncounterScripts.js:123`, `ui/recoveryEncounterPrompt.js:345` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:952` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:973`, `systems/uniqueWrecks.js:1147`, `systems/uniqueWrecks.js:1335` | `systems/missions.js:1864` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1765` | `systems/missions.js:1866`, `ui/recoveryEncounterPrompt.js:484` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1194` | `systems/missions.js:1865` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1224` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:702`, `systems/uniqueWrecks.js:1149` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1950` | `systems/missions.js:1867`, `systems/traffic.js:2174`, `ui/recoveryEncounterPrompt.js:485` |
| `uniqueWreck:rumorHeard` | `systems/trafficJobOps.js:988`, `ui/station/screens/bar.js:778` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:823` | `systems/missions.js:1862` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1951` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1652` | `systems/world.js:754` |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1881` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:388` | `systems/missions.js:1774`, `ui/bandHud.js:117` |
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
| `verb:used` | `systems/onboarding.js:4507` | — |
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
| `vestaOreCache:cargoChanged` | `systems/world.js:7216` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:365` | `systems/world.js:716` |
| `vestaOreCache:clueRecovered` | `systems/world.js:7037` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:7068` | `ui/recoveryEncounterPrompt.js:486` |
| `vestaOreCache:pickupReady` | `systems/world.js:7179` | — |
| `vestaOreCache:resolved` | `systems/world.js:7136` | `ui/recoveryEncounterPrompt.js:487` |
| `voice:clear` | `ui/voiceArbiter.js:953`, `ui/voiceArbiter.js:1000` | `ui/alerts.js:470` |
| `voice:dismiss` | `ui/bindings.js:83`, `ui/input.js:579` | `ui/voiceArbiter.js:432` |
| `voice:say` | `audio/audioSystem.js:2882`, `audio/audioSystem.js:5508`, `features/salvageOutfits/presentation.js:96`, `systems/achievements.js:1017`, `systems/mines.js:100`, `systems/survivalAnnounce.js:451`, `systems/survivalAnnounce.js:827`, `systems/world.js:850`, `systems/world.js:872`, `ui/alerts.js:357`, `ui/hud.js:634` | `ui/voiceArbiter.js:431` |
| `voice:surface` | `ui/voiceArbiter.js:958`, `ui/voiceArbiter.js:1010` | `audio/audioSystem.js:3218`, `systems/barkDirector.js:807`, `systems/story.js:169`, `ui/alerts.js:469`, `ui/voiceArbiter.js:542` |
| `warrant:acceptPayment` | `ui/warrantOfferPrompt.js:93` | — |
| `watch:changed` | `ui/entityLinks.js:239`, `ui/entityLinks.js:283` | `ui/watchlistHud.js:89` |
| `weapons:debrisOrbitClaimed` | `systems/weapons.js:2432` | — |
| `weapons:inertialShunt` | `systems/weapons.js:505` | `ui/stuntCallout.js:885` |
| `weapons:mineArmed` | `systems/weapons.js:2114` | `audio/audioSystem.js:2848` |
| `weapons:mineDeployed` | `systems/weapons.js:2071` | `render/vfx.js:2767` |
| `weapons:mineDetonated` | `systems/weapons.js:2198` | — |
| `weapons:mineExpired` | `systems/weapons.js:2108` | `render/vfx.js:2768`, `systems/presentationOrchestrator.js:280` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:474` | `audio/audioSystem.js:2885` |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1667` | `audio/audioSystem.js:2886` |
| `weapons:mortarDetonated` | `systems/weapons.js:2332` | — |
| `weapons:mortarLanded` | `systems/weapons.js:2270` | — |
| `weapons:vent` | `systems/weapons.js:932`, `systems/weapons.js:952` | `audio/audioSystem.js:2987`, `render/shipMicroMotion.js:1748`, `render/vfx.js:2806`, `systems/ships.js:2043` |
| `weather:ionBlackout` | `systems/environmentalMachinery.js:1607`, `systems/environmentalMachinery.js:1802` | — |
| `web:linked` | `combat/tetherWebs.js:161` | — |
| `weighing:overMass` | `data/encounters/700-the-weighing.js:232` | — |
| `well:capture` | `systems/fields.js:2709` | — |
| `well:fling` | `systems/fields.js:2634` | `systems/flightV3.js:225`, `ui/stuntCallout.js:883` |
| `well:grind` | `systems/fields.js:2299` | `systems/impulseCharges.js:323` |
| `well:haulerDragged` | `systems/fields.js:2578` | `systems/traffic.js:2173` |
| `wexTicket:found` | `systems/wexTicket.js:125` | — |
| `wingMorale:broken` | `systems/wingMorale.js:289` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:398` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:426` | — |
| `wingOrder:accepted` | `systems/automation.js:2526` | `systems/wingmen.js:154` |
| `wingOrder:blocked` | `systems/automation.js:2527` | `ui/wingmanRadial.js:351` |
| `wingOrder:converted` | `systems/wingmen.js:625` | `ui/wingmanRadial.js:357` |
| `wingOrder:status` | `systems/automation.js:2528` | `ui/wingmanRadial.js:361` |
| `world:abortJumpCharge` | `systems/story.js:945`, `ui/comms.js:545` | `systems/world.js:701` |
| `world:confirmUnfiledJump` | `systems/story.js:236` | `systems/world.js:700` |
| `world:courtRulingRecorded` | `systems/world.js:641` | — |
| `world:criticalSpawnDeferred` | `systems/world.js:2171`, `systems/world.js:4557` | — |
| `world:farActorRestored` | `world/farActorTable.js:1113` | `systems/npcJobsRuntime.js:1090`, `systems/traffic.js:2140` |
| `world:farActorShelved` | `world/farActorTable.js:1059` | `systems/npcJobsRuntime.js:1089`, `systems/traffic.js:2139` |
| `world:membership` | `systems/world.js:1235` | `systems/presentationOrchestrator.js:185` |
| `world:originShift` | `systems/world.js:5658` | — |
| `world:playerRelocated` | `systems/world.js:4703` | `core/coreSystem.js:553`, `render/vfx.js:2791` |
| `world:requestJump` | `systems/story.js:929`, `ui/galaxyMap.js:2843`, `ui/screens/starmap.js:1648` | `systems/world.js:698` |
| `world:requestRoute` | `ui/galaxyMap.js:2862`, `ui/galaxyMap.js:4743`, `ui/galaxyMap.js:8562`, `ui/screens/starmap.js:1635`, `ui/screens/starmap.js:1652` | `systems/world.js:702` |
| `world:requestSectorScan` | `ui/galaxyMap.js:6930` | `systems/world.js:703` |
| `world:requestUnfiledJump` | `systems/story.js:897` | `systems/world.js:699` |
| `world:residency` | `systems/world.js:1434`, `systems/world.js:1477`, `systems/world.js:2393` | — |
| `world:spawnLimited` | `systems/world.js:4477` | — |
| `world:stuckCleared` | `systems/world.js:6751` | — |
| `world:stuckTowAccept` | `ui/stuckTowPrompt.js:52` | `systems/world.js:793` |
| `world:stuckTowOffer` | `systems/world.js:6784` | `ui/stuckTowPrompt.js:23` |
| `world:zoneEntered` | `systems/world.js:5685` | `data/hazardLanguage.js:176` |
| `world:zoneExited` | `systems/world.js:5700` | `data/hazardLanguage.js:177` |
| `worldPressure:auditAnnounced` | `systems/worldPressure.js:237` | `systems/missions.js:1686` |
| `worldPressure:auditDelayed` | `systems/worldPressure.js:352` | — |
| `worldPressure:colossusRemains` | `systems/worldPressure.js:381` | — |
| `worldPressure:gateClosed` | `systems/worldPressure.js:278` | `systems/missions.js:1687` |
| `worldPressure:scaffoldSpawned` | `systems/worldPressure.js:437` | — |
| `worldPressure:slowGray` | `systems/worldPressure.js:300` | — |
| `worldPressure:tideChanged` | `systems/worldPressure.js:208` | — |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:1353` | `systems/presentationOrchestrator.js:294` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:1238` | `systems/presentationOrchestrator.js:295`, `systems/traffic.js:2269` |
| `wreckCourt:action` | `ui/physicalJobsPrompt.js:33` | — |
| `wreckCourt:lawFact` | `systems/wreckCourt.js:1031` | `systems/heat.js:357` |
| `wreckCourt:opened` | `systems/wreckCourt.js:950` | — |
| `wreckCourt:result` | `systems/wreckCourt.js:894` | — |
| `wreckCourt:ruled` | `systems/wreckCourt.js:1032` | — |
| `wreckCourt:worldFact` | `systems/wreckCourt.js:1030` | `systems/world.js:634` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:3201` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1499` | `systems/barkDirector.js:821` |
| `wreckEcology:rivalPressured` | `systems/aftermathWrecks.js:1460` | `systems/barkDirector.js:820` |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1542` | `systems/barkDirector.js:819` |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:2902` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:3123` | `systems/npcJobsRuntime.js:1120` |
| `wreckField:source` | `systems/factionPresence.js:1189`, `systems/salvage.js:595`, `systems/uniqueWrecks.js:1553` | `systems/aftermathWrecks.js:1146` |
| `wreckMarket:rates` | `systems/rookBooth.js:452` | — |
| `wreckMission:choiceApplied` | `systems/missionObjectiveOps.js:1334` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:145` | `systems/missions.js:1846` |

## Events with no emitter (likely dead, or emitted dynamically)

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
- `heist:requestLaunchSchedule` — 1 subscriber(s)
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
- `npcjobs:complete` — 1 subscriber(s)
- `npcjobs:cycle` — 1 subscriber(s)
- `npcjobs:hold` — 1 subscriber(s)
- `npcjobs:load` — 1 subscriber(s)
- `npcjobs:unload` — 1 subscriber(s)
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
- `run:draftOffered` — 1 subscriber(s)
- `run:draftResolved` — 1 subscriber(s)
- `run:ended` — 16 subscriber(s)
- `run:levelUp` — 2 subscriber(s)
- `run:modifierChosen` — 1 subscriber(s)
- `run:modifierRecordRequested` — 1 subscriber(s)
- `run:modifierRecorded` — 1 subscriber(s)
- `run:openingLessonReleased` — 3 subscriber(s)
- `run:refitClosed` — 1 subscriber(s)
- `run:resultsReady` — 2 subscriber(s)
- `run:spendRejected` — 1 subscriber(s)
- `run:spendRequested` — 1 subscriber(s)
- `run:spent` — 1 subscriber(s)
- `run:started` — 13 subscriber(s)
- `run:threatRequested` — 1 subscriber(s)
- `run:transitioned` — 6 subscriber(s)
- `run:waveCleared` — 5 subscriber(s)
- `run:waveIntroComplete` — 1 subscriber(s)
- `run:waveMaterialized` — 1 subscriber(s)
- `run:wavePlanFailed` — 1 subscriber(s)
- `run:wavePlanned` — 8 subscriber(s)
- `run:waveProgress` — 1 subscriber(s)
- `run:waveStarted` — 7 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
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
- `survivorPod:rescued` — 3 subscriber(s)
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
- `ui:talkContact` — 2 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `ui:unfitModule` — 1 subscriber(s)
- `understory:buyCover` — 1 subscriber(s)
- `understory:payDebt` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aftermath:causeExhausted` — 1 emitter(s)
- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:custodyFreight` — 1 emitter(s)
- `aftermath:custodySurvivor` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `ai:egressExit` — 2 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
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
- `automation:incomeCredited` — 3 emitter(s)
- `automation:interact` — 1 emitter(s)
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
- `choir:titheAssessed` — 1 emitter(s)
- `choir:tithePaid` — 1 emitter(s)
- `choir:tribute` — 1 emitter(s)
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
- `comms:message` — 4 emitter(s)
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
- `dock:committed` — 1 emitter(s)
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
- `frontier:moduleRestocked` — 1 emitter(s)
- `frontier:moduleSnapped` — 1 emitter(s)
- `frontier:raidSpawned` — 1 emitter(s)
- `frontier:raiderRepelled` — 2 emitter(s)
- `frontier:sitePlanted` — 1 emitter(s)
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
- `lastShift:archive` — 1 emitter(s)
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
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
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
- `news:publish` — 44 emitter(s)
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
- `presentation:caption` — 13 emitter(s)
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
- `ruud:voice` — 1 emitter(s)
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
- `siteEvidence:offer` — 2 emitter(s)
- `siteEvidence:result` — 1 emitter(s)
- `slate:columnRead` — 1 emitter(s)
- `slate:spike` — 1 emitter(s)
- `solstice:bloom` — 1 emitter(s)
- `solstice:charged` — 1 emitter(s)
- `solstice:destroyed` — 1 emitter(s)
- `solstice:voice` — 1 emitter(s)
- `spectrum:focus` — 1 emitter(s)
- `spectrum:resolved` — 1 emitter(s)
- `station:berthAssigned` — 1 emitter(s)
- `station:blockade` — 1 emitter(s)
- `station:boom` — 1 emitter(s)
- `station:grudge` — 1 emitter(s)
- `station:grudgeCleared` — 1 emitter(s)
- `station:holding` — 1 emitter(s)
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
- `ui:toast` — 2 emitter(s)
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
- `uniqueWreck:choose` — 3 emitter(s)
- `uniqueWreck:complicationScheduled` — 1 emitter(s)
- `uniqueWreck:encounterCompleted` — 1 emitter(s)
- `uniqueWreck:encounterRequested` — 2 emitter(s)
- `uniqueWreck:rumorHeard` — 2 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:storyRewardGranted` — 1 emitter(s)
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
