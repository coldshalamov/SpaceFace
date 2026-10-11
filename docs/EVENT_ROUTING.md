# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-10-11 · 1224 events · 4348 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:397`, `systems/encounterDirector.js:329`, `ui/discoveryPlate.js:140` |
| `achievement:unlocked` | — | `audio/audioSystem.js:2640` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:2022` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:821` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:2001` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2323` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:853` | `render/vfx.js:2570`, `systems/salvage.js:152` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1572` | `ui/galaxyMap.js:1786` |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:2111` | `systems/lawSecurity.js:319`, `systems/salvage.js:153` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:167` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:508` | `systems/presentationOrchestrator.js:168`, `systems/scissorwake.js:81`, `systems/tetherGameplay.js:302`, `ui/threatHalo.js:797` |
| `ai:egressExit` | `ai/egressExit.js:74` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:245` | — |
| `ai:flee` | `systems/ai.js:266`, `systems/traffic.js:6053`, `systems/wingMorale.js:326` | `render/authoredMotion.js:1146`, `render/vfx.js:2632`, `systems/barkDirector.js:608`, `systems/combatOutcome.js:159`, `systems/encounterDirector.js:357`, `systems/presentationOrchestrator.js:169` |
| `ai:formationBroken` | `systems/ai.js:442`, `systems/wingMorale.js:276` | `render/vfx.js:2633` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:610` |
| `ai:stateChange` | `systems/ai.js:263` | `render/authoredMotion.js:1163`, `systems/combatOutcome.js:185` |
| `ai:telegraph` | `systems/ai.js:338`, `systems/encounterScripts.js:172`, `systems/encounterScripts.js:1081`, `systems/masslineSnares.js:347`, `systems/mines.js:150`, `systems/tacticalAI.js:493` | `audio/audioSystem.js:2603`, `render/authoredMotion.js:1145`, `render/vfx.js:2631`, `systems/presentationOrchestrator.js:166`, `systems/scissorwake.js:74`, `systems/survivalResults.js:497`, `ui/hud.js:3100`, `ui/survivalHud.js:237`, `ui/threatHalo.js:793` |
| `aiTrader:requestTrade` | `systems/traffic.js:8187` | `systems/economy.js:1610` |
| `alienEcology:blackBoxRecovered` | — | `systems/world.js:667` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:718` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:1219` | `systems/world.js:675` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:666` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:664` |
| `alienEcology:relaySevered` | — | `systems/world.js:665` |
| `alienEcology:vented` | `systems/alienEcology.js:1358` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | `systems/story.js:163` |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | `systems/story.js:164` |
| `ambush:clauseDecided` | `systems/encounterDirector.js:902` | — |
| `ambush:clauseFired` | `systems/encounterDirector.js:1093` | — |
| `anomaly:bearing` | `systems/scanner.js:1305` | `systems/presentationOrchestrator.js:198` |
| `anomaly:triangulated` | `systems/scanner.js:1323` | `systems/world.js:605` |
| `asset:deployed` | `systems/automation.js:2237`, `systems/automation.js:2312`, `systems/automation.js:2405`, `systems/claims.js:603` | `systems/missions.js:1645`, `systems/onboarding.js:662`, `systems/story.js:247` |
| `asteroid:chunked` | `systems/environmentMaterials.js:144`, `systems/mining.js:2242` | `render/asteroidMotionPresentation.js:491`, `render/authoredMotion.js:1161`, `render/vfx.js:2602`, `systems/presentationOrchestrator.js:211` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1088`, `systems/mining.js:1034` | `audio/audioSystem.js:2454`, `render/authoredMotion.js:1160`, `render/vfx.js:2600`, `systems/fieldDepletion.js:755`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:471`, `render/shipMicroMotion.js:2267`, `render/vfx.js:2660`, `render/vfx.js:5850`, `render/vfx.js:10557`, `render/vfx.js:11794`, `systems/ai.js:718`, `systems/alienEcology.js:389`, `systems/barkDirector.js:1563`, `systems/beacons.js:77`, `systems/beacons.js:82`, `systems/beacons.js:116`, `systems/bombs.js:1132`, `systems/bombs.js:1256`, `systems/bombs.js:1644`, `systems/bracket.js:125`, `systems/bulletTime.js:200`, `systems/bulletTime.js:218`, `systems/bulletTime.js:298`, `systems/cargo.js:1065`, `systems/cargo.js:1088`, `systems/claims.js:450`, `systems/claims.js:535`, `systems/claims.js:580`, `systems/claims.js:1631`, `systems/claims.js:2393`, `systems/cloak.js:195`, `systems/cloak.js:208`, `systems/countermeasures.js:526`, `systems/countermeasures.js:562`, `systems/crafting.js:338`, `systems/crafting.js:348`, `systems/eighthBellRuntime.js:104`, `systems/eighthBellRuntime.js:119`, `systems/fields.js:876`, `systems/fields.js:1182`, `systems/fields.js:1313`, `systems/fields.js:1586`, `systems/flybyFocus.js:519`, `systems/gyreSnare.js:487`, `systems/gyreSnare.js:1242`, `systems/gyreSnare.js:1646`, `systems/gyreSnare.js:1679`, `systems/gyreSnare.js:1991`, `systems/gyreSnare.js:2104`, `systems/gyreSnare.js:2186`, `systems/gyreSnare.js:2397`, `systems/gyreSnare.js:2422`, `systems/gyreSnare.js:2437`, `systems/gyreSnare.js:2450`, `systems/gyreSnare.js:2479`, `systems/gyreSnare.js:2510`, `systems/gyreSnare.js:2615`, `systems/gyreSnare.js:2634`, `systems/gyreSnare.js:2650`, `systems/gyreSnare.js:2688`, `systems/gyreSnare.js:2697`, `systems/gyreSnare.js:2714`, `systems/gyreSnare.js:2817`, `systems/gyreSnare.js:2905`, `systems/gyreSnare.js:2915`, `systems/gyreSnare.js:2958`, `systems/hullBurst.js:224`, `systems/hullBurst.js:362`, `systems/hullBurst.js:393`, `systems/hullBurst.js:507`, `systems/hullBurst.js:579`, `systems/hullFracture.js:350`, `systems/hullFracture.js:469`, `systems/impulseCharges.js:697`, `systems/impulseCharges.js:804`, `systems/impulseCharges.js:1025`, `systems/impulseCharges.js:1233`, `systems/impulseCharges.js:1346`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:161`, `systems/massSeed.js:544`, `systems/massSeed.js:587`, `systems/masslineThrow.js:246`, `systems/masslineThrow.js:572`, `systems/masslineThrow.js:659`, `systems/mining.js:781`, `systems/mining.js:2330`, `systems/morrow.js:169`, `systems/phaseBlink.js:196`, `systems/precursorMachines.js:353`, `systems/precursorMachines.js:430`, `systems/precursorMachines.js:780`, `systems/precursorMachines.js:829`, `systems/presentationAdapters.js:566`, `systems/presentationOrchestrator.js:504`, `systems/ravel.js:131`, `systems/rubric.js:302`, `systems/ruckus.js:143`, `systems/ruud.js:500`, `systems/ruud.js:504`, `systems/salvage.js:999`, `systems/salvage.js:1100`, `systems/salvage.js:1150`, `systems/solstice.js:296`, `systems/tacticalAI.js:676`, `systems/theBolus.js:171`, `systems/tumbleStates.js:487`, `systems/tumbleStates.js:602`, `systems/vesper.js:212`, `systems/volatileExposure.js:494`, `systems/volatileExposure.js:568`, `systems/weapons.js:1902`, `ui/commsRadial.js:556`, `ui/commsRadial.js:602`, `ui/commsRadial.js:806`, `ui/commsRadial.js:849`, `ui/hud.js:2521`, `ui/hud.js:3877`, `ui/hud.js:4114`, `ui/hud.js:4174`, `ui/hud.js:4216`, `ui/hud.js:4235`, `ui/hud.js:4332`, `ui/hud.js:4483`, `ui/hud.js:4802`, `ui/input.js:196`, `ui/input.js:225`, `ui/input.js:296`, `ui/input.js:334`, `ui/input.js:340`, `ui/input.js:406`, `ui/input.js:465`, `ui/input.js:471`, `ui/input.js:477`, `ui/input.js:483`, `ui/input.js:696`, `ui/input.js:903`, `ui/input.js:908`, `ui/input.js:926`, `ui/input.js:931`, `ui/input.js:1024`, `ui/input.js:1033`, `ui/input.js:1038`, `ui/input.js:1047`, `ui/input.js:1062`, `ui/input.js:1104`, `ui/input.js:1120`, `ui/input.js:1124`, `ui/input.js:1137`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:490`, `ui/screens/base.js:1192`, `ui/screens/base.js:1442`, `ui/screens/missionLog.js:2222`, `ui/screens/missionLog.js:2226`, `ui/screens/missionLog.js:2230`, `ui/screens/missionLog.js:2234`, `ui/screens/missionLog.js:2250`, `ui/screens/missionLog.js:2258`, `ui/screens/missionLog.js:2265`, `ui/screens/missionLog.js:2272`, `ui/screens/missionLog.js:2280`, `ui/screens/missionLog.js:2287`, `ui/screens/missionLog.js:2294`, `ui/screens/missionLog.js:2303`, `ui/screens/missionLog.js:2310`, `ui/screens/missionLog.js:2326`, `ui/screens/missionLog.js:2357`, `ui/screens/missionLog.js:2377`, `ui/shipLedgerPanel.js:310`, `ui/shipLedgerPanel.js:317`, `ui/shipLedgerPanel.js:324`, `ui/station/screens/bar.js:591`, `ui/station/screens/bar.js:678`, `ui/station/screens/bar.js:682`, `ui/station/screens/bar.js:686`, `ui/station/screens/bar.js:708`, `ui/station/screens/bar.js:724`, `ui/station/screens/bar.js:753`, `ui/station/screens/bar.js:778`, `ui/station/screens/bar.js:787`, `ui/station/screens/contracts.js:1365`, `ui/station/screens/contracts.js:1376`, `ui/station/screens/contracts.js:1412`, `ui/station/screens/contracts.js:1415`, `ui/station/screens/contracts.js:1454`, `ui/station/screens/factions.js:361`, `ui/station/screens/industry.js:417`, `ui/station/screens/industry.js:458`, `ui/station/screens/industry.js:483`, `ui/station/screens/industry.js:491`, `ui/station/screens/industry.js:497`, `ui/station/screens/industry.js:507`, `ui/station/screens/market.js:975`, `ui/station/screens/market.js:1661`, `ui/station/screens/market.js:1730`, `ui/station/screens/market.js:1738`, `ui/station/screens/market.js:1802`, `ui/station/screens/market.js:1814`, `ui/station/screens/market.js:2010`, `ui/station/screens/shipworks.js:666`, `ui/station/screens/shipworks.js:3524`, `ui/station/screens/shipworks.js:4477`, `ui/station/screens/shipworks.js:4548`, `ui/station/screens/shipworks.js:4565`, `ui/station/screens/shipworks.js:4578`, `ui/station/screens/shipworks.js:4582`, `ui/station/screens/shipworks.js:4587`, `ui/station/screens/shipworks.js:4617`, `ui/station/screens/shipworks.js:4635`, `ui/station/screens/shipworks.js:4671`, `ui/station/screens/shipworks.js:4693`, `ui/station/screens/shipworks.js:4695`, `ui/station/screens/shipworks.js:4713`, `ui/station/screens/shipworks.js:4762`, `ui/station/screens/shipworks.js:4772`, `ui/station/screens/shipworks.js:4778`, `ui/station/screens/shipworks.js:4803`, `ui/station/screens/shipworks.js:4814`, `ui/station/screens/shipworks.js:4821`, `ui/station/screens/shipworks.js:4863`, `ui/station/screens/shipworks.js:4870`, `ui/station/screens/shipworks.js:4881`, `ui/station/screens/shipworks.js:4891`, `ui/station/screens/shipworks.js:4896`, `ui/station/screens/shipworks.js:4904`, `ui/station/screens/shipworks.js:4913`, `ui/station/screens/shipworks.js:4920`, `ui/station/screens/shipworks.js:5048`, `ui/station/screens/shipworks.js:5058`, `ui/station/screens/shipworks.js:5068`, `ui/station/screens/shipworks.js:5078`, `ui/station/screens/shipworks.js:5131`, `ui/station/screens/shipworks.js:5168`, `ui/station/screens/shipworks.js:5172`, `ui/station/screens/shipworks.js:5190`, `ui/station/screens/shipworks.js:5194`, `ui/station/screens/shipworks.js:5207`, `ui/station/screens/shipworks.js:5211`, `ui/station/stationApp.js:641`, `ui/station/stationApp.js:925`, `ui/station/stationApp.js:961`, `ui/uiRoot.js:1446`, `ui/wingmanRadial.js:205`, `ui/wingmanRadial.js:227`, `ui/wingmanRadial.js:252`, `ui/wingmanRadial.js:289`, `ui/wingmanRadial.js:314` | `audio/audioSystem.js:2703` |
| `automation:assetDistressed` | `systems/automation.js:1983` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2508` | `systems/intervention.js:70`, `systems/lossLedger.js:427`, `systems/missions.js:1647` |
| `automation:assetRepossessed` | `systems/automation.js:2015` | `ui/automationPayoff.js:90` |
| `automation:assetResumed` | `systems/automation.js:2353` | — |
| `automation:incomeCredited` | `systems/automation.js:2046`, `systems/automation.js:2057`, `systems/automation.js:2787` | — |
| `automation:offlineSummary` | `systems/automation.js:2546`, `systems/automation.js:2570`, `systems/automation.js:2594`, `systems/automation.js:2617`, `systems/automation.js:2834` | `ui/automationPayoff.js:80`, `ui/dockArrival.js:69` |
| `automation:outpostRaided` | `systems/automation.js:1910`, `systems/automation.js:2909` | `systems/lossLedger.js:428` |
| `automation:programAssigned` | `systems/automation.js:2192` | `systems/missions.js:1646` |
| `automation:traderCycleCompleted` | `systems/automation.js:1668` | `ui/screens/automationPanel.js:859` |
| `band:bearingReceipt` | `systems/bandRadio.js:578` | `systems/presentationOrchestrator.js:199` |
| `band:bearingRequest` | `systems/bandRadio.js:551` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:825`, `systems/uniqueWrecks.js:868` | `render/authoredMotion.js:1134` |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:832`, `systems/uniqueWrecks.js:840`, `systems/uniqueWrecks.js:854` | `ui/bandHud.js:94` |
| `band:bed` | `systems/bandRadio.js:635` | `audio/audioSystem.js:2826` |
| `band:cycle` | `ui/bandHud.js:89`, `ui/input.js:363` | — |
| `band:status` | `systems/bandRadio.js:617` | `ui/bandHud.js:93` |
| `barkDirector:silence` | — | `audio/audioSystem.js:2508` |
| `barkDirector:voice` | — | `audio/audioSystem.js:2783` |
| `beacon:deploy` | — | `systems/beacons.js:52` |
| `beacon:deployed` | `systems/beacons.js:111` | `render/shipMicroMotion.js:1317`, `systems/onboarding.js:820` |
| `beam:denied` | `systems/mining.js:436`, `systems/mining.js:480`, `systems/mining.js:495`, `systems/mining.js:506`, `systems/mining.js:539` | `render/authoredMotion.js:1106` |
| `beam:repaired` | `systems/mining.js:601` | — |
| `beam:transferred` | `systems/mining.js:655` | — |
| `bombs:armed` | `systems/bombs.js:1190` | `audio/bombAudio.js:440` |
| `bombs:commanded` | `systems/bombs.js:1145` | — |
| `bombs:cycle` | `systems/bombs.js:791`, `systems/bombs.js:1123` | `audio/bombAudio.js:469` |
| `bombs:denied` | `systems/bombs.js:665`, `systems/bombs.js:784`, `systems/bombs.js:808`, `systems/bombs.js:845`, `systems/bombs.js:884`, `systems/bombs.js:909`, `systems/bombs.js:1061`, `systems/bombs.js:1080` | — |
| `bombs:destroyed` | `systems/bombs.js:1641` | `audio/bombAudio.js:441`, `render/vfx.js:2627` |
| `bombs:detonated` | `systems/bombs.js:1249` | `audio/bombAudio.js:444`, `render/vfx.js:2625` |
| `bombs:dropped` | `systems/bombs.js:1131` | `audio/bombAudio.js:438`, `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:679` |
| `bombs:fieldEnded` | `systems/bombs.js:1540` | `audio/bombAudio.js:452`, `render/vfx.js:2626` |
| `bombs:primed` | `systems/bombs.js:1157` | `audio/bombAudio.js:439`, `ui/stuntCallout.js:791` |
| `bombs:rackChanged` | `systems/bombs.js:1011` | `audio/bombAudio.js:474` |
| `bombs:redirected` | `systems/bombs.js:1607` | — |
| `bombs:released` | `systems/bombs.js:1665` | `audio/bombAudio.js:455` |
| `bombs:stockChanged` | `systems/bombs.js:815`, `systems/bombs.js:933`, `systems/bombs.js:1128` | — |
| `borrowedSun:lost` | `systems/borrowedSun.js:206` | — |
| `borrowedSun:notice` | `systems/borrowedSun.js:159` | — |
| `borrowedSun:offer` | `systems/borrowedSun.js:193` | `ui/borrowedSunPrompt.js:5` |
| `borrowedSun:phase` | `systems/borrowedSun.js:150` | — |
| `borrowedSun:route` | `ui/borrowedSunPrompt.js:15` | — |
| `borrowedVoice:disposition` | `ui/borrowedVoicePrompt.js:16` | — |
| `borrowedVoice:dispositionAccepted` | `systems/borrowedVoice.js:122` | — |
| `borrowedVoice:fragmentRecovered` | `systems/borrowedVoice.js:97` | — |
| `borrowedVoice:offer` | `systems/borrowedVoice.js:106` | `ui/borrowedVoicePrompt.js:4` |
| `boss:defeated` | `systems/world.js:944` | `systems/survivalAnnounce.js:334` |
| `bounty:cleared` | `systems/economy.js:3750` | `systems/heat.js:403` |
| `bounty:cooled` | `systems/heat.js:690` | `systems/barkDirector.js:631` |
| `bracket:bank` | `systems/bracket.js:182` | — |
| `bracket:matchFinished` | `systems/bracket.js:239` | — |
| `bracket:matchStarted` | `systems/bracket.js:143` | — |
| `bracket:save` | `systems/bracket.js:188` | — |
| `bracket:shotResolved` | `systems/bracket.js:227` | — |
| `bracket:voice` | `systems/bracket.js:123` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:327` | `audio/audioSystem.js:2593` |
| `bulletTime:end` | `systems/bulletTime.js:217` | `audio/audioSystem.js:2825` |
| `bulletTime:start` | `systems/bulletTime.js:199` | `audio/audioSystem.js:2822`, `systems/onboarding.js:779` |
| `camera:shake` | `render/shipMicroMotion.js:2265`, `render/vfx.js:6112`, `render/vfx.js:6412`, `render/vfx.js:6758`, `systems/combat.js:766`, `systems/combat.js:926`, `systems/combat.js:1109`, `systems/drill.js:1635`, `systems/flybyFocus.js:518`, `systems/gyreSnare.js:507`, `systems/gyreSnare.js:1251`, `systems/gyreSnare.js:1673`, `systems/gyreSnare.js:2809`, `systems/gyreSnare.js:2898`, `systems/intervention.js:259`, `systems/presentationAdapters.js:479`, `systems/survivalAnnounce.js:576`, `systems/tetherGameplay.js:640` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:539`, `ui/input.js:540`, `ui/input.js:772` | — |
| `capitalBoss:detach` | `systems/missions.js:1665` | — |
| `capitalBoss:start` | `systems/missions.js:6782` | `systems/swarmJuice.js:107` |
| `capitalBoss:telegraph` | — | `render/authoredMotion.js:1162` |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:110`, `systems/capitalBossEncounters.js:132` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:788` | `systems/world.js:607` |
| `cargo:changed` | `systems/cargo.js:364`, `systems/mining.js:2569` | `systems/ships.js:1631`, `ui/cargoConscience.js:142`, `ui/commandBar.js:412`, `ui/hud.js:4247`, `ui/hud.js:4276`, `ui/hudMeta.js:217` |
| `cargo:delivered` | `systems/asteroidSites.js:2691`, `systems/missions.js:7922`, `systems/missions.js:7981`, `systems/missions.js:8076`, `systems/missions.js:8126` | `systems/economy.js:1622` |
| `cargo:fragileLost` | `systems/fragileCargo.js:200` | — |
| `cargo:full` | `systems/cargo.js:468`, `systems/mining.js:1567`, `systems/mining.js:2547` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:612`, `systems/presentationOrchestrator.js:219`, `ui/alerts.js:575`, `ui/floatingText.js:311` |
| `cargo:hotDockSpill` | `systems/cargo.js:1024` | — |
| `cargo:jettison` | `ui/hud.js:3885` | `ui/hud.js:4179` |
| `cargo:jettisoned` | `systems/cargo.js:1171` | `audio/audioSystem.js:2569`, `render/authoredMotion.js:1171`, `render/shipMicroMotion.js:1315`, `systems/barkDirector.js:619`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:761`, `systems/onboarding.js:828` |
| `cargo:massSettled` | `systems/cargo.js:747` | `systems/presentationOrchestrator.js:218`, `systems/ships.js:1632` |
| `cargo:parkedHoldSwapped` | `systems/cargo.js:901` | — |
| `cargo:parkedTransfer` | `systems/cargo.js:963` | — |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:tallyThreeDelivered` | `systems/economy.js:3223` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:958` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:994` | — |
| `cargo:volatileExposed` | `systems/volatileExposure.js:384` | — |
| `cargo:volatileRupture` | `systems/volatileExposure.js:548` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:878`, `systems/lootShards.js:934` | `systems/volatileExposure.js:218` |
| `cargo:volatileVent` | `systems/volatileExposure.js:472` | — |
| `ceresWorkfleet:interrupted` | `systems/ceresWorkfleet.js:261` | — |
| `chain:detonated` | `systems/impulseCharges.js:1005` | `systems/fields.js:532` |
| `chain:primeEnded` | `systems/impulseCharges.js:968` | — |
| `chain:primed` | `systems/impulseCharges.js:945` | — |
| `chain:slam` | `systems/impulseCharges.js:879`, `systems/impulseCharges.js:899` | `systems/fields.js:531` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1045`, `systems/tetherGameplay.js:2231` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:1229` | `systems/onboarding.js:787` |
| `charge:armed` | `systems/impulseCharges.js:1042` | — |
| `charge:combo` | `systems/impulseCharges.js:1271`, `systems/impulseCharges.js:1330` | — |
| `charge:detonated` | `systems/impulseCharges.js:689`, `systems/impulseCharges.js:796`, `systems/impulseCharges.js:1017`, `systems/impulseCharges.js:1338` | `audio/audioSystem.js:2617`, `render/feel.js:1369`, `render/vfx.js:2623`, `systems/fields.js:533`, `systems/gamepad.js:859` |
| `charge:stuck` | `systems/impulseCharges.js:1119` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1314` |
| `charge:thrown` | `systems/impulseCharges.js:1216` | `render/ordnanceMotionPresentation.js:261` |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:22` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:23` |
| `claim:claimed` | `systems/claims.js:449` | `systems/onboarding.js:668`, `systems/story.js:256`, `systems/traffic.js:1747` |
| `claim:convoyAbandoned` | `systems/claims.js:1327`, `systems/claims.js:1445` | `systems/traffic.js:1750` |
| `claim:convoyDocked` | `systems/traffic.js:3063` | `systems/claims.js:405` |
| `claim:convoyManifested` | `systems/traffic.js:2963` | `systems/claims.js:404` |
| `claim:defenseDelegate` | — | `systems/claims.js:396` |
| `claim:defenseDelegateRefused` | `systems/claims.js:1796` | — |
| `claim:defenseEncounterRequested` | `systems/claims.js:1709` | — |
| `claim:defenseGo` | — | `systems/claims.js:395` |
| `claim:defenseIgnore` | — | `systems/claims.js:391` |
| `claim:defenseResolved` | `systems/claims.js:1878` | `ui/encounterChoicePrompt.js:133` |
| `claim:defenseStarted` | `systems/claims.js:1719` | `ui/encounterChoicePrompt.js:132` |
| `claim:defenseWarning` | `systems/claims.js:1613` | `systems/encounterDirector.js:339`, `ui/encounterChoicePrompt.js:129` |
| `claim:depotPatrolCompleted` | `systems/claims.js:2985` | `systems/factions.js:470` |
| `claim:depotPatrolRotation` | `systems/claims.js:2941` | — |
| `claim:depotPatrolSpent` | `systems/claims.js:1783` | — |
| `claim:depotSupport` | `systems/claims.js:2852`, `systems/claims.js:2878` | — |
| `claim:freightDelivered` | `systems/traffic.js:3274` | — |
| `claim:infrastructureActive` | `systems/claims.js:1149`, `systems/claims.js:2639` | `systems/traffic.js:1745` |
| `claim:infrastructureConstructed` | `systems/claims.js:516`, `systems/claims.js:2576` | — |
| `claim:infrastructureStatus` | `systems/claims.js:1160` | `systems/traffic.js:1746` |
| `claim:moduleBuilt` | `systems/claims.js:534` | — |
| `claim:raidRepelled` | `systems/claims.js:1562` | — |
| `claim:raidWarning` | `systems/claims.js:1555` | `audio/audioSystem.js:2587` |
| `claim:receipt` | `systems/claims.js:2097` | — |
| `claim:sensorPostRumor` | `systems/claims.js:1209` | `systems/world.js:642` |
| `claim:specialized` | `systems/claims.js:575` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:3142` | — |
| `claims:migrated` | `systems/claims.js:2215` | — |
| `cloak:burned` | `systems/cloak.js:267` | `audio/audioSystem.js:2461` |
| `cloak:dropped` | `systems/cloak.js:207` | `audio/audioSystem.js:2456`, `render/authoredMotion.js:1166`, `render/shipMicroMotion.js:1311` |
| `cloak:engaged` | `systems/cloak.js:194` | `render/authoredMotion.js:1165`, `render/shipMicroMotion.js:1310`, `systems/gamepad.js:864`, `systems/onboarding.js:783` |
| `cloak:faded` | `systems/aiPorts.js:1146` | `audio/audioSystem.js:2455` |
| `collision:tearOff` | `systems/hullFracture.js:460` | `render/vfx.js:2542` |
| `combat:actionCancelled` | `combat/actions.js:373` | — |
| `combat:actionCompleted` | `combat/actions.js:359` | — |
| `combat:actionPhase` | `combat/actions.js:222` | — |
| `combat:actionRejected` | `combat/actions.js:395` | `ui/toasts.js:535` |
| `combat:actionStarted` | `combat/actions.js:189` | `systems/presentationOrchestrator.js:171`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2530` |
| `combat:baseDestroyed` | `systems/combat.js:912` | `systems/economy.js:1678` |
| `combat:beamStop` | `systems/weapons.js:1251` | `audio/audioSystem.js:2387`, `render/asteroidMotionPresentation.js:490`, `render/vfx.js:2526` |
| `combat:bounceContinued` | `combat/attackHit.js:36` | `render/vfx.js:2531`, `systems/presentationOrchestrator.js:262` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:408` | `render/feel.js:1404`, `render/vfx.js:2540`, `systems/economy.js:1680`, `systems/fields.js:535`, `systems/gamepad.js:851` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:427` | `render/vfx.js:2541` |
| `combat:damage` | `combat/damage.js:353` | `audio/audioSystem.js:2402`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `render/asteroidMotionPresentation.js:483`, `render/authoredMotion.js:1122`, `render/feel.js:1205`, `render/shipMicroMotion.js:1297`, `render/vfx.js:2532`, `save/saveSystem.js:408`, `systems/ai.js:107`, `systems/aiEncounter.js:136`, `systems/barkDirector.js:614`, `systems/collisionConsequences.js:97`, `systems/combatOutcome.js:184`, `systems/cruise.js:56`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:320`, `systems/factionPresence.js:453`, `systems/heat.js:364`, `systems/lawSecurity.js:314`, `systems/missions.js:1631`, `systems/npcJobsRuntime.js:1064`, `systems/onboarding.js:578`, `systems/onboarding.js:589`, `systems/presentationOrchestrator.js:165`, `systems/salvageActions.js:134`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1710`, `systems/stationBroadcast.js:154`, `systems/survivalResults.js:490`, `systems/swarmJuice.js:101`, `systems/titles.js:582`, `systems/traffic.js:1665`, `systems/volatileExposure.js:216`, `ui/alerts.js:559`, `ui/commandBar.js:401`, `ui/floatingText.js:196`, `ui/hud.js:2030`, `ui/hud.js:2310`, `ui/hud.js:2551`, `ui/uiRoot.js:800` |
| `combat:emp` | `combat/damage.js:355` | `ui/hud.js:2557` |
| `combat:fire` | `systems/impulseCharges.js:730`, `systems/weapons.js:1145`, `systems/weapons.js:1230`, `systems/weapons.js:1432`, `systems/weapons.js:1763` | `audio/audioSystem.js:2386`, `data/stationBubbles.js:182`, `render/feel.js:1305`, `render/shipMicroMotion.js:1295`, `render/vfx.js:2525`, `systems/cloak.js:53`, `systems/cruise.js:64`, `systems/lawSecurity.js:315`, `systems/onboarding.js:501`, `systems/onboarding.js:514`, `systems/presentationOrchestrator.js:170`, `systems/story.js:261`, `systems/traffic.js:1666`, `systems/world.js:673`, `ui/hud.js:4291` |
| `combat:hit` | `systems/salvageActions.js:609`, `systems/salvageActions.js:700` | `systems/routeFollower.js:383`, `systems/story.js:262` |
| `combat:hitAsset` | `systems/wingmen.js:204` | `systems/automation.js:548` |
| `combat:kill` | `systems/world.js:6044` | — |
| `combat:lockChanged` | `systems/weapons.js:912` | `systems/world.js:600`, `ui/alerts.js:568` |
| `combat:outcome` | `systems/combatOutcome.js:301` | `systems/barkDirector.js:611` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:302` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:5621`, `systems/npcJobsRuntime.js:5878` | `combat/kernel.js:191` |
| `combat:requestAction` | — | `combat/kernel.js:189` |
| `combat:routeDamage` | `systems/bombs.js:1601`, `systems/drill.js:1647`, `systems/foldAberrant.js:173`, `systems/hullBurst.js:515`, `systems/impulseCharges.js:1566`, `systems/mines.js:308`, `systems/missions.js:7132`, `systems/theBolus.js:161`, `systems/tumbleStates.js:539` | `combat/kernel.js:190`, `systems/routeFollower.js:384` |
| `combat:shockwavePass` | — | `render/asteroidMotionPresentation.js:485`, `render/vfx.js:2630` |
| `combat:shove` | `systems/onboarding.js:2383` | `audio/audioSystem.js:2597`, `systems/onboarding.js:513` |
| `combat:statusApplied` | `combat/statuses.js:212` | `render/vfx.js:2543`, `ui/stuntCallout.js:757` |
| `combat:statusExpired` | `combat/statuses.js:90`, `systems/bombs.js:1578` | `audio/bombAudio.js:464`, `systems/tumbleStates.js:129`, `ui/stuntCallout.js:778` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:160`, `systems/encounterDirector.js:312`, `systems/factionPresence.js:451`, `systems/npcJobsRuntime.js:1067`, `systems/presentationOrchestrator.js:241`, `systems/surrenderRecovery.js:69`, `systems/tumbleStates.js:133`, `systems/wingMorale.js:202` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1313`, `systems/factionPresence.js:452`, `systems/npcJobsRuntime.js:1068`, `systems/presentationOrchestrator.js:250`, `systems/surrenderRecovery.js:70` |
| `combat:surrendered` | — | `systems/combatOutcome.js:161`, `systems/surrenderRecovery.js:68` |
| `combat:tumbleRake` | `systems/tumbleStates.js:527` | `systems/barkDirector.js:656` |
| `combat:tumbled` | `systems/tumbleStates.js:485` | `systems/fields.js:534`, `systems/missions.js:1532`, `systems/tetherGameplay.js:301` |
| `combat:warded` | `combat/damage.js:317` | `audio/audioSystem.js:2494` |
| `combat:weakPointHit` | `systems/combat.js:827` | `render/vfx.js:2533`, `ui/floatingText.js:243` |
| `comms:log` | `data/encounters/344-opening-hauler-raid.js:37`, `data/encounters/344-opening-hauler-raid.js:163`, `data/encounters/350-the-long-tail.js:175`, `data/encounters/350-the-long-tail.js:209`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:155`, `data/encounters/352-the-slot.js:175`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:138`, `data/encounters/355-the-winnow-throw.js:155`, `data/encounters/355-the-winnow-throw.js:162`, `data/encounters/355-the-winnow-throw.js:179`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:183`, `data/encounters/357-the-handoff.js:197`, `data/encounters/357-the-handoff.js:222`, `data/encounters/357-the-handoff.js:262`, `data/encounters/357-the-handoff.js:278`, `data/encounters/358-the-press-camp.js:56`, `data/encounters/358-the-press-camp.js:201`, `data/encounters/358-the-press-camp.js:214`, `data/encounters/362-the-salvage-watch.js:275`, `data/encounters/367-the-salvage-tail.js:180`, `systems/alienEcology.js:386`, `systems/alienEcology.js:847`, `systems/alienEcology.js:876`, `systems/alienEcology.js:918`, `systems/alienEcology.js:936`, `systems/alienEcology.js:996`, `systems/alienEcology.js:1064`, `systems/alienEcology.js:1076`, `systems/alienEcology.js:1755`, `systems/alienEcology.js:1783`, `systems/alienEcology.js:1794`, `systems/alienEcology.js:1853`, `systems/alienEcology.js:1895`, `systems/alienEcology.js:2098`, `systems/asteroidSites.js:1554`, `systems/contractClauses.js:566`, `systems/encounterDirector.js:2794`, `systems/encounterScripts.js:750`, `systems/encounterScripts.js:3068`, `systems/encounterScripts.js:3314`, `systems/factions.js:533`, `systems/foldAberrant.js:44`, `systems/missions.js:6161`, `systems/morrow.js:221`, `systems/precursorMachines.js:53`, `systems/precursorMachines.js:218`, `systems/precursorMachines.js:231`, `systems/precursorMachines.js:248`, `systems/precursorMachines.js:271`, `systems/precursorMachines.js:291`, `systems/precursorMachines.js:305`, `systems/precursorMachines.js:314`, `systems/precursorMachines.js:379`, `systems/precursorMachines.js:444`, `systems/precursorMachines.js:471`, `systems/precursorMachines.js:504`, `systems/precursorMachines.js:519`, `systems/precursorMachines.js:551`, `systems/precursorMachines.js:572`, `systems/precursorMachines.js:579`, `systems/precursorMachines.js:595`, `systems/precursorMachines.js:638`, `systems/precursorMachines.js:767`, `systems/precursorMachines.js:818`, `systems/precursorMachines.js:855`, `systems/precursorMachines.js:880`, `systems/precursorMachines.js:933`, `systems/precursorMachines.js:941`, `systems/salvage.js:172`, `systems/salvage.js:918`, `systems/salvage.js:993`, `systems/salvage.js:1148`, `systems/towlineTable.js:265`, `systems/vesper.js:254` | `ui/floatingText.js:94` |
| `comms:message` | `systems/traffic.js:5862`, `systems/traffic.js:6672`, `systems/traffic.js:6797` | — |
| `comms:popup` | `systems/ai.js:497`, `systems/careerContracts.js:442`, `systems/careerContracts.js:456`, `systems/careerContracts.js:472`, `systems/factionPresence.js:1116`, `systems/factionPresence.js:1166`, `systems/factionPresence.js:1180`, `systems/memorialThief.js:102`, `systems/missions.js:5229`, `systems/missions.js:8262`, `systems/missions.js:8355`, `systems/missions.js:8439`, `systems/missions.js:9391`, `systems/missions.js:9693`, `systems/missions.js:9814`, `systems/missions.js:9875`, `systems/missions.js:10035`, `systems/missions.js:11109`, `systems/missions.js:11151`, `systems/missions.js:11663`, `systems/onboarding.js:1079`, `systems/scenarioRuntime.js:186`, `systems/story.js:561`, `systems/story.js:1341`, `systems/story.js:1369` | `audio/audioSystem.js:2686`, `ui/screens/codex.js:847` |
| `conflict:flip` | `systems/factions.js:823` | `systems/factionPresence.js:460`, `systems/sectorSim.js:143`, `systems/story.js:251` |
| `conflict:frontAction` | `systems/factions.js:710` | — |
| `conflict:warDeclared` | `systems/factions.js:767` | — |
| `contactHail:availability` | `systems/scanner.js:1816`, `systems/scanner.js:1827` | — |
| `contactHail:choice` | `ui/commsRadial.js:550`, `ui/contactHailPrompt.js:174` | `systems/scanner.js:1011` |
| `contactHail:clear` | `systems/scanner.js:1838` | — |
| `contactHail:handoff` | `systems/scanner.js:1609` | — |
| `contactHail:offer` | `systems/scanner.js:1633` | — |
| `contactHail:request` | `ui/commsRadial.js:603`, `ui/contactHailPrompt.js:168` | `systems/scanner.js:1010` |
| `contactHail:response` | `systems/scanner.js:1656`, `systems/scanner.js:1676` | `systems/traffic.js:1653` |
| `contraband:bribe` | `systems/encounterScripts.js:423`, `ui/customsPrompt.js:230` | `systems/economy.js:1674` |
| `contraband:scanned` | `systems/economy.js:4460` | `systems/encounterDirector.js:321`, `systems/factions.js:450`, `systems/heat.js:369`, `systems/lawSecurity.js:325`, `ui/customsPrompt.js:150` |
| `contract:clauseBroken` | `systems/contractClauses.js:579` | `systems/missions.js:1590` |
| `contract:clauseHonored` | `systems/contractClauses.js:498`, `systems/missions.js:8453` | `systems/contractClauses.js:265` |
| `contract:clauseSettledKill` | `systems/contractClauses.js:355` | `systems/missions.js:1493` |
| `countermeasure:denied` | `systems/countermeasures.js:539` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:521` | `render/shipMicroMotion.js:1316` |
| `craft:complete` | `systems/crafting.js:337`, `systems/crafting.js:383` | `ui/station/screens/industry.js:518` |
| `craft:queueChanged` | `systems/crafting.js:198`, `systems/crafting.js:222`, `systems/crafting.js:347` | `render/authoredMotion.js:1132`, `systems/onboarding.js:673`, `ui/station/screens/industry.js:518` |
| `credits:changed` | `systems/economy.js:3312`, `systems/economy.js:3324` | `audio/audioSystem.js:2554`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:413`, `ui/hud.js:4275` |
| `cruise:charging` | `systems/cruise.js:134` | `render/vfx.js:2620`, `systems/presentationOrchestrator.js:178` |
| `cruise:dropped` | `systems/cruise.js:204` | `audio/audioSystem.js:2674`, `render/authoredMotion.js:1139`, `render/vfx.js:2622`, `systems/presentationOrchestrator.js:180` |
| `cruise:engaged` | `systems/cruise.js:109` | `audio/audioSystem.js:2670`, `render/vfx.js:2621`, `systems/presentationOrchestrator.js:179` |
| `cruise:snareRequest` | `systems/encounterScripts.js:592` | `render/authoredMotion.js:1138`, `systems/cruise.js:69` |
| `cruise:snared` | `systems/cruise.js:203` | `audio/audioSystem.js:2678` |
| `customs:breakScan` | `ui/customsPrompt.js:235` | `render/authoredMotion.js:1150` |
| `customs:submit` | `ui/customsPrompt.js:213` | `render/authoredMotion.js:1149`, `systems/lawSecurity.js:337` |
| `customs:weirBolt` | — | `systems/economy.js:1673` |
| `danger:miningNoise` | `systems/mining.js:2581` | `audio/audioSystem.js:2501` |
| `day:tick` | `core/coreSystem.js:395` | `systems/custodyConsequences.js:43`, `systems/economy.js:1589`, `systems/encounterDirector.js:294`, `systems/factions.js:482`, `systems/sectorSim.js:127` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:228` | `systems/combat.js:739` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:219` | `systems/combat.js:738` |
| `deniable:fenceBurned` | — | `systems/fenceDesk.js:52` |
| `deniable:fenceEmboldened` | — | `systems/fenceDesk.js:51` |
| `deniable:fenceThanked` | `systems/encounterDirector.js:991` | `systems/fenceDesk.js:50` |
| `detonator:detonated` | `systems/impulseCharges.js:678` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:187` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:plateUnlocked` | `systems/world.js:899`, `systems/world.js:5877`, `systems/world.js:6355`, `systems/world.js:6977` | `audio/audioSystem.js:2594`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:849` |
| `distress:call` | `systems/traffic.js:5860`, `systems/traffic.js:5913` | `audio/audioSystem.js:2472` |
| `distress:rescued` | `systems/encounterScripts.js:749` | `systems/factions.js:460` |
| `dock:attempt` | `ui/input.js:191` | `ui/dockDenyBanner.js:54` |
| `dock:committed` | `ui/dockStateCommit.js:18` | — |
| `dock:denied` | `ui/dockDenyBanner.js:79` | `render/authoredMotion.js:1181` |
| `dock:docked` | `balance/careerCohorts.js:522`, `balance/careerCohorts.js:2011`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `systems/world.js:6195`, `ui/input.js:195` | `audio/audioSystem.js:2596`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/authoredMotion.js:1179`, `render/infrastructureMotion.js:195`, `render/shipMicroMotion.js:1306`, `save/saveSystem.js:444`, `systems/achievements.js:1110`, `systems/aftermathWrecks.js:1051`, `systems/autoTargetAssist.js:148`, `systems/barkDirector.js:659`, `systems/combat.js:702`, `systems/economy.js:1640`, `systems/economyContracts.js:191`, `systems/encounterDirector.js:350`, `systems/factionPresence.js:449`, `systems/fenceDesk.js:49`, `systems/lawSecurity.js:334`, `systems/mining.js:262`, `systems/mining.js:264`, `systems/missions.js:1419`, `systems/onboarding.js:475`, `systems/onboarding.js:639`, `systems/pirateDisguise.js:37`, `systems/scanner.js:1014`, `systems/stationServices.js:206`, `systems/story.js:211`, `systems/world.js:635`, `systems/world.js:676`, `ui/alerts.js:459`, `ui/cargoConscience.js:143`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:55`, `ui/impoundPayPrompt.js:52`, `ui/impoundPayPrompt.js:57`, `ui/priceForecast.js:86`, `ui/promptDeck.js:853`, `ui/securityReadout.js:158`, `ui/station/screens/bar.js:157`, `ui/uiRoot.js:1362`, `ui/watchlistHud.js:90`, `ui/wingmanRadial.js:332`, `ui/worldObjectInteraction.js:426`, `ui/wreckChoicePrompt.js:54` |
| `dock:launder` | `ui/station/screens/market.js:435` | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:1327`, `core/physics.js:1331`, `ui/input.js:164` | `render/authoredMotion.js:1178`, `systems/onboarding.js:598`, `ui/alerts.js:455`, `ui/input.js:170` |
| `dock:undocked` | `balance/careerCohorts.js:523`, `balance/careerCohorts.js:2016`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:736`, `ui/station/stationApp.js:886` | `audio/audioSystem.js:2601`, `render/authoredMotion.js:1180`, `render/infrastructureMotion.js:196`, `render/shipMicroMotion.js:1307`, `render/vfx.js:2503`, `save/saveSystem.js:445`, `systems/combat.js:707`, `systems/economy.js:1654`, `systems/missions.js:1439`, `systems/moralTrap.js:179`, `systems/onboarding.js:548`, `systems/presentationAdapters.js:212`, `systems/stationServices.js:207`, `systems/world.js:636`, `ui/impoundPayPrompt.js:55`, `ui/input.js:178`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1400` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1507` | `ui/uiRoot.js:1459` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1492`, `ui/sandbox/sandboxSetup.js:645` | `ui/uiRoot.js:1449` |
| `drill:approachRequested` | `ui/input.js:651` | `systems/tetherGameplay.js:300` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1384`, `ui/sandbox/sandboxSetup.js:644` | `ui/asteroid/asteroidScreen.js:1991`, `ui/uiRoot.js:1438` |
| `drill:break` | `systems/drill.js:1606` | `audio/audioSystem.js:2856`, `render/authoredMotion.js:1143`, `systems/asteroidSites.js:502`, `systems/presentationOrchestrator.js:227`, `ui/asteroid/asteroidScreen.js:1920`, `ui/screens/drill.js:1936` |
| `drill:cargoFull` | `systems/drill.js:277` | `audio/audioSystem.js:2858`, `systems/presentationOrchestrator.js:234`, `ui/asteroid/asteroidScreen.js:1910`, `ui/screens/drill.js:1907` |
| `drill:end` | `systems/drill.js:1197` | `audio/audioSystem.js:2866`, `render/authoredMotion.js:1144`, `systems/asteroidSites.js:513`, `systems/presentationOrchestrator.js:235` |
| `drill:gasHit` | `systems/drill.js:1634` | `audio/audioSystem.js:2857`, `systems/presentationOrchestrator.js:229`, `ui/asteroid/asteroidScreen.js:1897`, `ui/screens/drill.js:1836` |
| `drill:retry` | `systems/drill.js:1246` | `systems/presentationOrchestrator.js:236` |
| `drill:rockDepleted` | `systems/drill.js:222`, `systems/drill.js:256`, `systems/drill.js:1163` | `audio/audioSystem.js:2859`, `ui/asteroid/asteroidScreen.js:1907`, `ui/screens/drill.js:1898` |
| `drill:scanPulse` | `systems/drill.js:1319` | `audio/audioSystem.js:2860`, `systems/asteroidSites.js:535`, `systems/presentationOrchestrator.js:225`, `ui/asteroid/asteroidScreen.js:1914`, `ui/screens/drill.js:1924` |
| `drill:spark` | `systems/drill.js:1573` | `audio/audioSystem.js:2855`, `systems/presentationOrchestrator.js:226`, `ui/asteroid/asteroidScreen.js:1925`, `ui/screens/drill.js:1957` |
| `drill:start` | `systems/drill.js:1155` | `audio/audioSystem.js:2865`, `render/authoredMotion.js:1142`, `systems/asteroidSites.js:495`, `systems/onboarding.js:644`, `systems/presentationOrchestrator.js:224` |
| `drill:warn` | `systems/drill.js:229`, `systems/drill.js:280`, `systems/drill.js:289`, `systems/drill.js:1169`, `systems/drill.js:1174`, `systems/drill.js:1450`, `systems/drill.js:1485`, `systems/drill.js:1506`, `systems/drill.js:1525` | `audio/audioSystem.js:2861`, `systems/presentationOrchestrator.js:223`, `ui/asteroid/asteroidRenderer3d.js:7210`, `ui/asteroid/asteroidScreen.js:1903`, `ui/screens/drill.js:1864` |
| `drill:yield` | `systems/drill.js:254` | `audio/audioSystem.js:2852`, `systems/missions.js:1472`, `systems/presentationOrchestrator.js:228`, `ui/asteroid/asteroidScreen.js:1889`, `ui/screens/drill.js:1814` |
| `drone:grindStart` | `systems/automation.js:1028` | `render/authoredMotion.js:1128` |
| `drone:grindStop` | — | `render/authoredMotion.js:1129` |
| `ecology:claimCrew` | `systems/alienEcology.js:1756` | — |
| `ecology:coherence` | `systems/alienEcology.js:864` | — |
| `ecology:evidence` | `systems/precursorMachines.js:226`, `systems/precursorMachines.js:309`, `systems/precursorMachines.js:310`, `systems/precursorMachines.js:523`, `systems/precursorMachines.js:555`, `systems/precursorMachines.js:937`, `world/veilRayNursery.js:97` | `systems/world.js:679` |
| `ecology:factionOutcome` | `systems/economy.js:2800`, `systems/economy.js:3068` | `systems/world.js:678` |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:477` | `systems/world.js:680` |
| `ecology:relayPulse` | `systems/alienEcology.js:959` | `audio/audioSystem.js:2881` |
| `ecology:setpiece` | `systems/alienEcology.js:1975`, `systems/alienEcology.js:2041` | — |
| `economy:applyTradePressure` | `systems/automation.js:893`, `systems/automation.js:1761`, `systems/automation.js:1762`, `systems/claims.js:1427`, `systems/encounterDirector.js:2247`, `systems/encounterDirector.js:2295`, `systems/sectorSim.js:424`, `systems/traffic.js:9809`, `systems/traffic.js:11533` | `systems/economy.js:1614` |
| `economy:cargoKillOpportunity` | `systems/economy.js:2946` | `systems/missions.js:1467` |
| `economy:chargeCredits` | `systems/automation.js:1932`, `systems/automation.js:1939`, `systems/automation.js:2797`, `systems/automation.js:3021`, `systems/beacons.js:86`, `systems/bombs.js:812`, `systems/bombs.js:895`, `systems/bombs.js:913`, `systems/bombs.js:979`, `systems/claims.js:429`, `systems/claims.js:499`, `systems/claims.js:570`, `systems/claims.js:1515`, `systems/combat.js:1079`, `systems/encounterDirector.js:2241`, `systems/factions.js:568`, `systems/fenceDesk.js:348`, `systems/gateControlDirector.js:120`, `systems/mining.js:587`, `systems/missions.js:3771`, `systems/missions.js:3774`, `systems/npcJobsRuntime.js:3347`, `systems/npcJobsRuntime.js:5254`, `systems/pirateParley.js:885`, `systems/ships.js:2042`, `systems/ships.js:2152`, `systems/ships.js:2215`, `systems/world.js:4334`, `systems/world.js:4378`, `systems/world.js:5479` | `systems/economy.js:1578` |
| `economy:debtEscalated` | `systems/economy.js:3788` | — |
| `economy:demandShift` | `systems/economy.js:2038` | — |
| `economy:eventEnded` | `systems/economy.js:4538` | — |
| `economy:eventStarted` | `systems/economy.js:4513` | `ui/floatingText.js:316` |
| `economy:freightAccepted` | `systems/economy.js:3147`, `systems/economy.js:3176` | `systems/claims.js:387`, `systems/missions.js:1463` |
| `economy:grantCredits` | `systems/automation.js:2042`, `systems/automation.js:2053`, `systems/automation.js:2783`, `systems/bombs.js:932`, `systems/cargo.js:1052`, `systems/claims.js:1426`, `systems/claims.js:2201`, `systems/combat.js:929`, `systems/combat.js:941`, `systems/combat.js:1087`, `systems/encounterDirector.js:2242`, `systems/fenceDesk.js:258`, `systems/fenceDesk.js:293`, `systems/mining.js:2161`, `systems/mining.js:2346`, `systems/mining.js:2504`, `systems/missions.js:8381`, `systems/missions.js:8466`, `systems/missions.js:8469`, `systems/missions.js:8948`, `systems/missions.js:11576`, `systems/moralTrap.js:317`, `systems/npcJobsRuntime.js:3530`, `systems/scanReveal.js:152`, `systems/scanReveal.js:185`, `systems/ships.js:2265`, `systems/stationServices.js:270`, `systems/survivorPod.js:1175`, `systems/survivorPod.js:1512`, `systems/uniqueWrecks.js:1760` | `systems/economy.js:1577`, `systems/story.js:246` |
| `economy:marketOpened` | `ui/station/screens/market.js:2052` | `systems/economy.js:1594`, `ui/priceHistory.js:145` |
| `economy:oreFlood` | `systems/sectorSim.js:696` | `systems/barkDirector.js:654`, `systems/economy.js:1629` |
| `economy:payBounty` | `ui/screens/footprint.js:1618` | `systems/economy.js:1581` |
| `economy:releaseDebt` | `systems/stationServices.js:279` | `systems/economy.js:1579` |
| `economy:salvageIntakeApplied` | `systems/economy.js:3295` | `ui/alerts.js:494` |
| `economy:shortageRelieved` | `systems/economy.js:3168` | `systems/missions.js:1464` |
| `economy:sinkCharged` | `systems/economy.js:3338` | `ui/alerts.js:510` |
| `economy:tick` | `systems/economy.js:1803` | `systems/achievements.js:1096`, `ui/priceHistory.js:116` |
| `economy:towCharge` | `systems/world.js:6165` | `systems/economy.js:1666` |
| `economy:tradeCompleted` | `systems/economy.js:2788` | `audio/audioSystem.js:2557`, `audio/audioSystem.js:2644`, `careers/origins/haulerOriginSystem.js:90`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:452`, `systems/claims.js:384`, `systems/factions.js:426`, `systems/missions.js:1449`, `systems/missions.js:1465`, `systems/onboarding.js:480`, `systems/sectorSim.js:138`, `systems/story.js:241` |
| `economy:tradeFailed` | `systems/economy.js:3028`, `systems/economy.js:3054` | `audio/audioSystem.js:2563` |
| `emergent:audio` | `systems/emergentPrimitives.js:185`, `systems/environmentMaterials.js:113` | `audio/emergentPrimitiveVoice.js:83` |
| `emergent:contact` | `systems/emergentPrimitives.js:191` | `render/feel.js:1387` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:2091` | `ui/encounterChoicePrompt.js:126` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:335` |
| `encounter:claimDefenseRoster` | `systems/encounterDirector.js:1409` | — |
| `encounter:fingerprint` | `systems/encounterDirector.js:2179` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `systems/encounterDirector.js:2835` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:9563` | `systems/encounterDirector.js:319` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:2427`, `systems/encounterScripts.js:3288` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:2799` | `systems/barkDirector.js:629` |
| `encounter:predationCleared` | `systems/encounterScripts.js:1176` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1093`, `systems/encounterScripts.js:1161` | `render/authoredMotion.js:1147` |
| `encounter:predationTelegraph` | — | `render/authoredMotion.js:1164` |
| `encounter:receipt` | `systems/encounterDirector.js:2192` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:2174`, `systems/encounterDirector.js:2225`, `systems/survivalArena.js:1387` | `audio/audioSystem.js:2605`, `systems/aftermathWrecks.js:1050`, `systems/claims.js:399`, `systems/claims.js:400`, `systems/encounterDirector.js:346`, `systems/story.js:154`, `systems/terrainAnchors.js:88`, `systems/traffic.js:1751`, `systems/uniqueLootAbilities.js:147`, `ui/encounterChoicePrompt.js:127` |
| `encounter:scarcityRumor` | `systems/encounterDirector.js:845` | — |
| `encounter:spawned` | `systems/encounterDirector.js:1522` | `systems/uniqueLootAbilities.js:146` |
| `encounter:stale` | `systems/encounterDirector.js:489` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1494`, `systems/survivalArena.js:1297` | `audio/audioSystem.js:2604`, `render/authoredMotion.js:1159`, `systems/survivalResults.js:498`, `systems/terrainAnchors.js:87`, `systems/world.js:645` |
| `encounter:voice` | `systems/encounterDirector.js:2074` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | `ui/encounterChoicePrompt.js:128` |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | `systems/story.js:169` |
| `endgame:archive` | `systems/story.js:227`, `systems/story.js:1103` | `ui/screens/codex.js:852` |
| `endgame:chosen` | `systems/story.js:1091` | `ui/screens/missionLog.js:2505` |
| `endgame:confirmRequired` | `systems/story.js:976` | `ui/screens/missionLog.js:2504` |
| `endgame:eligibility` | `systems/story.js:793` | `ui/screens/missionLog.js:2503` |
| `endgame:finaleCompleted` | `systems/story.js:869` | — |
| `endgame:finaleReady` | `systems/story.js:1100` | — |
| `endgame:ineligible` | `systems/story.js:879`, `systems/story.js:956`, `systems/story.js:1021` | — |
| `endgame:loopBack` | — | `systems/story.js:235` |
| `endgame:promptChoiceC` | `systems/story.js:941` | — |
| `endgame:promptChoiceD` | `systems/story.js:905` | — |
| `endgame:promptSandbox` | `systems/story.js:804` | — |
| `endgame:pullCompleted` | `systems/claims.js:3088` | `systems/factions.js:473` |
| `endgame:sandboxContinued` | `systems/story.js:1085` | `ui/screens/missionLog.js:2506` |
| `entity:destroyed` | `main.js:606`, `main.js:892`, `save/saveSystem.js:6030`, `systems/survivorPod.js:349`, `systems/traffic.js:7820` | `audio/audioSystem.js:2448`, `combat/kernel.js:182`, `render/vfx.js:2557`, `systems/aftermathWrecks.js:1029`, `systems/ai.js:120`, `systems/aiEncounter.js:135`, `systems/asteroidSites.js:616`, `systems/cloak.js:88`, `systems/combatOutcome.js:164`, `systems/encounterDirector.js:310`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:324`, `systems/lawSecurity.js:318`, `systems/missions.js:1495`, `systems/missions.js:1633`, `systems/missions.js:1637`, `systems/npcJobsRuntime.js:1052`, `systems/presentationOrchestrator.js:177`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:95`, `systems/survivalWave.js:140`, `systems/swarmArena.js:525`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:301` |
| `entity:killed` | `balance/careerCohorts.js:491`, `combat/damage.js:488`, `combat/kernel.js:125`, `systems/combat.js:895` | `audio/audioSystem.js:2447`, `render/feel.js:1257`, `render/shipMicroMotion.js:1290`, `render/vfx.js:2556`, `sim/titleAttract.js:166`, `systems/aftermathWrecks.js:1027`, `systems/ai.js:121`, `systems/asteroidSites.js:615`, `systems/barkDirector.js:620`, `systems/barkDirector.js:621`, `systems/combatOutcome.js:158`, `systems/economy.js:1625`, `systems/economy.js:1628`, `systems/encounterDirector.js:311`, `systems/factions.js:328`, `systems/factions.js:388`, `systems/impulseCharges.js:278`, `systems/killReplay.js:278`, `systems/lawSecurity.js:317`, `systems/lawSecurity.js:329`, `systems/lootShards.js:590`, `systems/lossLedger.js:430`, `systems/mining.js:257`, `systems/missions.js:1488`, `systems/missions.js:1632`, `systems/missions.js:1636`, `systems/npcJobsRuntime.js:1044`, `systems/onboarding.js:515`, `systems/onboarding.js:567`, `systems/presentationOrchestrator.js:176`, `systems/sectorSim.js:142`, `systems/surrenderRecovery.js:75`, `systems/survivalResults.js:484`, `systems/survivalWave.js:141`, `systems/survivorPod.js:563`, `systems/swarmChain.js:107`, `systems/swarmElites.js:136`, `systems/swarmJuice.js:100`, `systems/swarmSupply.js:101`, `systems/titles.js:583`, `systems/traffic.js:1638`, `systems/wingMorale.js:201`, `systems/world.js:649`, `ui/floatingText.js:240`, `ui/floatingText.js:283`, `ui/uiRoot.js:807`, `ui/uiRoot.js:815` |
| `entity:spawnRequest` | `data/scanReveal.js:527`, `systems/salvageActions.js:268`, `systems/salvageActions.js:514` | `core/coreSystem.js:305` |
| `entity:spawned` | `core/coreSystem.js:177` | `combat/kernel.js:171`, `render/asteroidMotionPresentation.js:492`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:220`, `render/shipMicroMotion.js:1291`, `render/vfx.js:2563`, `sim/titleAttract.js:167`, `systems/aiEncounter.js:134`, `systems/barkDirector.js:606`, `systems/barkDirector.js:607`, `systems/combatOutcome.js:163`, `systems/factionPresence.js:458`, `systems/fields.js:529`, `systems/flybyFocus.js:307`, `systems/lawSecurity.js:316`, `systems/lossLedger.js:429`, `systems/npcJobsRuntime.js:1028`, `systems/salvageActions.js:131`, `systems/survivalSwarm.js:216`, `systems/swarmElites.js:135`, `systems/swarmSupply.js:106`, `systems/titles.js:584`, `systems/uniqueLootAbilities.js:149` |
| `environment:detonated` | — | `render/vfx.js:2601` |
| `environment:fractured` | — | `systems/sectorSim.js:158` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:385`, `systems/environmentalMachinery.js:1147` | `systems/terrainAnchors.js:89` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:732` | `systems/terrainAnchors.js:93` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:1041` | `systems/terrainAnchors.js:91` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:1238` | `data/hazardLanguage.js:148` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:744` | `systems/terrainAnchors.js:95` |
| `escalation:arrived` | `systems/encounterDirector.js:529` | — |
| `escalation:seeded` | `systems/encounterDirector.js:516` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:527`, `systems/factions.js:610`, `systems/factions.js:953` | `systems/heat.js:378` |
| `faction:bribe` | `ui/screens/footprint.js:1624` | `systems/factions.js:309` |
| `faction:repChanged` | `systems/factions.js:523`, `systems/factions.js:605`, `systems/factions.js:949` | `ui/floatingText.js:301`, `ui/station/screens/factions.js:409` |
| `faction:repDelta` | `balance/careerCohorts.js:270`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `systems/choirReliefBerth.js:379`, `systems/choirReliefBerth.js:413`, `systems/choirReliefBerth.js:434`, `systems/claims.js:1859`, `systems/economy.js:3445`, `systems/economy.js:4135`, `systems/economy.js:4452`, `systems/encounterDirector.js:2243`, `systems/fenceDesk.js:261`, `systems/missions.js:8945`, `systems/missions.js:9027`, `systems/missions.js:11528`, `systems/missions.js:11530`, `systems/missions.js:11594`, `systems/moralTrap.js:311`, `systems/stuntGrammar.js:177`, `systems/survivorPod.js:1164`, `systems/survivorPod.js:1518`, `systems/uniqueWrecks.js:1764`, `systems/world.js:6482`, `systems/world.js:6716` | `systems/factions.js:296` |
| `faction:repSpillover` | `systems/factions.js:603` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | `systems/factions.js:301` |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1437` | `systems/barkDirector.js:642` |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:1120` | `systems/story.js:275` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1349` | `ui/uiRoot.js:358` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:967` | `systems/barkDirector.js:641` |
| `factionPresence:service` | `systems/factionPresence.js:1068` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1188` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:691`, `systems/factionPresence.js:786` | — |
| `fence:routeLegDue` | — | `systems/economyContracts.js:200` |
| `fence:scrubAsk` | — | `systems/fenceDesk.js:57` |
| `field:depletedChanged` | `systems/fieldDepletion.js:841` | `systems/world.js:604` |
| `field:opportunity` | `systems/world.js:4789` | — |
| `field:regrown` | `systems/world.js:4718` | `systems/presentationOrchestrator.js:221` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:769`, `systems/traffic.js:2127`, `systems/traffic.js:11452` | `systems/presentationOrchestrator.js:222` |
| `field:richSeamOpened` | `systems/traffic.js:10505` | `systems/traffic.js:1631` |
| `field:richSeamWorked` | `systems/mining.js:1002`, `systems/traffic.js:10174` | `systems/traffic.js:1632` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:840` | `systems/npcJobsRuntime.js:1060`, `systems/presentationOrchestrator.js:220` |
| `fields:anchorRegistered` | `systems/fields.js:1085` | `render/forceLanguage/fieldForcePresentation.js:60` |
| `fields:cleared` | `systems/fields.js:1632` | `audio/fieldAudio.js:321`, `render/forceLanguage/fieldForcePresentation.js:61` |
| `fields:clusterDetonate` | `systems/fields.js:2293` | `systems/presentationOrchestrator.js:283` |
| `fields:coneToggled` | `systems/fields.js:1306`, `systems/fields.js:1312`, `systems/fields.js:1406`, `systems/fields.js:1414` | `systems/onboarding.js:558` |
| `fields:deployDenied` | `systems/fields.js:1180` | — |
| `fields:deployed` | `systems/fields.js:730`, `systems/fields.js:815`, `systems/fields.js:1266`, `systems/fields.js:1303`, `systems/fields.js:1397`, `systems/fields.js:1511` | `audio/audioSystem.js:2798`, `systems/fields.js:530`, `systems/onboarding.js:557` |
| `fields:ended` | `systems/fields.js:1104`, `systems/fields.js:1413`, `systems/fields.js:1434`, `systems/fields.js:1584` | `audio/fieldAudio.js:318` |
| `fields:hitchCut` | `systems/fields.js:761` | — |
| `fields:hitchLatched` | `systems/fields.js:749` | — |
| `fields:specialistDisrupt` | `systems/fields.js:639` | `audio/fieldAudio.js:322` |
| `fields:thermalCreated` | `systems/fields.js:1670` | — |
| `fields:thermalHit` | `core/fields/thermalFields.js:35` | — |
| `firsthour:beat` | `systems/onboarding.js:3318` | — |
| `firsthour:complete` | `systems/onboarding.js:3331` | — |
| `firsthour:milestone` | `systems/onboarding.js:1281` | `audio/audioSystem.js:2791` |
| `firsthour:sentence` | `systems/onboarding.js:2010` | — |
| `firsthour:started` | `systems/onboarding.js:3067` | — |
| `firsthour:verb` | `systems/onboarding.js:3255` | — |
| `flight:modeChanged` | `systems/flightV3.js:920` | — |
| `flight:racePrecision` | `systems/missions.js:7694` | `systems/flightV3.js:181` |
| `flight:sweptHull` | `systems/flightV3.js:826` | — |
| `flybyFocus:cancel` | `systems/flybyFocus.js:367` | `render/cameraDirector.js:1276` |
| `flybyFocus:end` | `systems/flybyFocus.js:368` | `render/cameraDirector.js:1275` |
| `flybyFocus:start` | `systems/flybyFocus.js:501` | `systems/onboarding.js:498` |
| `formation:discovered` | `systems/asteroidFormations.js:290` | — |
| `freight:arrival` | `systems/traffic.js:8204` | `render/authoredMotion.js:1155` |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1716`, `systems/encounterScripts.js:1958`, `systems/traffic.js:6029` | `systems/barkDirector.js:617`, `systems/economy.js:1580`, `systems/encounterDirector.js:355`, `systems/lootShards.js:593`, `systems/sectorSim.js:149`, `systems/traffic.js:1659` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1549` | `render/authoredMotion.js:1154` |
| `freight:custodyRebound` | `systems/encounterDirector.js:695` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1606`, `systems/encounterScripts.js:1628` | — |
| `freight:loss` | `systems/encounterDirector.js:2305`, `systems/traffic.js:9811`, `systems/traffic.js:11545` | `systems/claims.js:406`, `systems/encounterDirector.js:356`, `systems/sectorSim.js:148` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1550` | `systems/surrenderRecovery.js:76` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:2093` | `systems/barkDirector.js:618` |
| `freight:recovery` | — | `systems/encounterDirector.js:317`, `systems/traffic.js:1656` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:318`, `systems/traffic.js:1657` |
| `frontierRumor:acquired` | `systems/world.js:4397` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:6947` | — |
| `frontierRumor:contacted` | `systems/world.js:6843` | — |
| `frontierRumor:resolved` | `systems/world.js:4414` | — |
| `fuel:changed` | `systems/economy.js:3863`, `systems/economy.js:3960`, `systems/economy.js:3978`, `systems/stationServices.js:461`, `systems/stationServices.js:529`, `systems/world.js:6066`, `systems/world.js:6074` | — |
| `fuel:empty` | `systems/world.js:6067` | `audio/audioSystem.js:2629`, `systems/economy.js:1664`, `ui/alerts.js:576` |
| `game:embarkSpeculation` | `ui/sandbox/sandboxSetup.js:384`, `ui/screens/gameOver.js:518`, `ui/screens/newGame.js:906` | — |
| `game:exitToMenu` | `ui/screens/crucible.js:3452`, `ui/screens/crucible.js:3465`, `ui/screens/demoEnd.js:217`, `ui/screens/pause.js:1088` | `audio/audioSystem.js:2906`, `main.js:355`, `save/saveSystem.js:470`, `systems/missions.js:1608`, `systems/runSession.js:83`, `ui/screens/crucibleLabControls.js:558` |
| `game:load` | `ui/input.js:345`, `ui/input.js:536`, `ui/screens/gameOver.js:507`, `ui/screens/mainMenu.js:536`, `ui/screens/saveLoad.js:1374` | `save/saveSystem.js:337`, `systems/scanner.js:1013`, `ui/commandBar.js:430`, `ui/promptDeck.js:852` |
| `game:loadingProgress` | `main.js:150`, `main.js:175`, `main.js:224`, `main.js:256`, `main.js:398`, `main.js:836`, `main.js:928`, `main.js:982`, `main.js:1008`, `main.js:1041`, `main.js:1061`, `main.js:1140`, `main.js:1281`, `save/saveSystem.js:4842` | `ui/loadingPresenter.js:184`, `ui/screens/newGame.js:866`, `ui/screens/saveLoad.js:896` |
| `game:new` | `main.js:542`, `ui/sandbox/sandboxSetup.js:398`, `ui/screens/crucible.js:3456`, `ui/screens/gameOver.js:533`, `ui/screens/newGame.js:980`, `ui/screens/raceBoard.js:46` | `audio/audioSystem.js:2901`, `audio/bombAudio.js:458`, `audio/fieldAudio.js:325`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:319`, `main.js:333`, `render/feel.js:1199`, `render/vfx.js:2573`, `render/vfx.js:2584`, `save/saveSystem.js:420`, `systems/aftermathWrecks.js:1057`, `systems/aiEncounter.js:139`, `systems/bombs.js:673`, `systems/cloak.js:83`, `systems/combatOutcome.js:168`, `systems/countermeasures.js:221`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:84`, `systems/encounterDirector.js:308`, `systems/environmentalMachinery.js:220`, `systems/fields.js:523`, `systems/impulseCharges.js:283`, `systems/killReplay.js:268`, `systems/massSeed.js:120`, `systems/masslineSnares.js:137`, `systems/mines.js:77`, `systems/mining.js:280`, `systems/planetRuntime.js:102`, `systems/presentationOrchestrator.js:285`, `systems/salvageActions.js:138`, `systems/scanner.js:1012`, `systems/scissorwake.js:73`, `systems/surrenderRecovery.js:82`, `systems/survivorPod.js:561`, `systems/tetherGameplay.js:295`, `systems/tumbleStates.js:131`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/moralTrapPrompt.js:44`, `ui/priceHistory.js:146`, `ui/promptDeck.js:851`, `ui/screens/crucibleLabControls.js:552`, `ui/uiRoot.js:637`, `ui/wreckChoicePrompt.js:56` |
| `game:newGame` | `main.js:634` | `audio/audioSystem.js:2902`, `audio/bombAudio.js:459`, `audio/fieldAudio.js:326`, `core/coreSystem.js:320`, `core/physics.js:172`, `render/npcJobSignatureVfx.js:903`, `render/shipMicroMotion.js:1294`, `render/vfx.js:2574`, `render/vfx.js:2585`, `save/saveSystem.js:425`, `systems/aftermathWrecks.js:1058`, `systems/bombs.js:676`, `systems/cloak.js:84`, `systems/collisionConsequences.js:100`, `systems/combatOutcome.js:174`, `systems/countermeasures.js:222`, `systems/difficultyDirector.js:169`, `systems/fieldDepletion.js:757`, `systems/fragileCargo.js:285`, `systems/lossInvestigation.js:128`, `systems/lossLedger.js:433`, `systems/salvageActions.js:139`, `systems/survivorPod.js:560`, `systems/titles.js:586`, `systems/tumbleStates.js:132`, `systems/wingMorale.js:203`, `ui/cargoConscience.js:147`, `ui/uiRoot.js:687` |
| `game:over` | `systems/combat.js:852`, `systems/combat.js:983` | `ui/uiRoot.js:1482` |
| `game:save` | `ui/input.js:344`, `ui/input.js:534`, `ui/screens/saveLoad.js:1405` | `save/saveSystem.js:321` |
| `game:scenePrepared` | `main.js:701` | `systems/onboarding.js:433`, `ui/sandbox/sandboxSetup.js:437` |
| `game:startFailed` | `main.js:1234` | `ui/loadingPresenter.js:193`, `ui/sandbox/sandboxSetup.js:440`, `ui/screens/crucibleLabControls.js:554`, `ui/screens/newGame.js:865`, `ui/screens/saveLoad.js:902` |
| `game:started` | `main.js:845` | `audio/audioSystem.js:2907`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:321`, `save/saveSystem.js:417`, `save/saveSystem.js:433`, `sim/killcamTape.js:431`, `systems/automation.js:569`, `systems/collisionConsequences.js:99`, `systems/combat.js:736`, `systems/economyContracts.js:194`, `systems/factions.js:293`, `systems/flight.js:83`, `systems/flightV3.js:196`, `systems/heat.js:385`, `systems/masslineSnares.js:138`, `systems/missions.js:1393`, `systems/onboarding.js:456`, `systems/presentationAdapters.js:210`, `systems/presentationOrchestrator.js:286`, `systems/sectorSim.js:133`, `systems/ships.js:1742`, `systems/story.js:152`, `systems/surrenderRecovery.js:83`, `systems/survivalDraft.js:188`, `systems/tetherGameplay.js:296`, `systems/wingmen.js:146`, `ui/alerts.js:480`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:432`, `ui/screens/crucibleLabControls.js:553`, `ui/uiRoot.js:638`, `ui/uiRoot.js:1467`, `ui/uiRoot.js:1508`, `ui/uiRoot.js:1510` |
| `gamepad:connected` | `systems/gamepad.js:1070` | — |
| `gamepad:disconnected` | `systems/gamepad.js:1054` | — |
| `gate:range` | `core/physics.js:1337`, `core/physics.js:1341` | `render/authoredMotion.js:1182`, `systems/onboarding.js:605`, `systems/presentationOrchestrator.js:181`, `ui/alerts.js:461` |
| `gate:verdict` | `systems/gateControlDirector.js:135` | `render/infrastructureMotion.js:197` |
| `graffiti:show` | `data/encounters/366-the-counting-relay.js:102`, `data/encounters/366-the-counting-relay.js:112`, `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:573`, `systems/story.js:640`, `systems/story.js:654`, `systems/story.js:688`, `systems/story.js:1486`, `systems/story.js:1887`, `systems/story.js:2094`, `systems/uniqueWrecks.js:1770` | `systems/ships.js:1737`, `ui/screens/codex.js:848` |
| `gyre:absorbTick` | — | `systems/gamepad.js:931` |
| `gyre:ballGrave` | — | `systems/gamepad.js:910` |
| `gyre:beamOn` | — | `systems/gamepad.js:869` |
| `gyre:caught` | — | `systems/gamepad.js:911` |
| `gyre:dropped` | — | `systems/gamepad.js:940` |
| `gyre:full` | — | `systems/gamepad.js:908` |
| `gyre:fuseLow` | — | `systems/gamepad.js:909` |
| `gyre:snagged` | — | `systems/gamepad.js:870` |
| `gyre:strained` | — | `systems/gamepad.js:955` |
| `gyre:thrown` | — | `systems/gamepad.js:893` |
| `gyre:windup` | — | `systems/gamepad.js:880` |
| `harasser:disengaged` | `systems/encounterDirector.js:2645` | `systems/barkDirector.js:630`, `systems/barkDirector.js:678` |
| `hazard:changed` | `systems/world.js:892`, `systems/world.js:5939` | `ui/alerts.js:593` |
| `hazard:enter` | `systems/environmentalMachinery.js:1181`, `systems/world.js:5914` | `data/hazardLanguage.js:144`, `render/shipMicroMotion.js:1299`, `ui/alerts.js:523` |
| `hazard:exit` | `systems/environmentalMachinery.js:1190`, `systems/world.js:5924` | `data/hazardLanguage.js:145`, `render/shipMicroMotion.js:1300`, `ui/alerts.js:534` |
| `heat:changed` | `systems/heat.js:854` | `audio/audioSystem.js:2632`, `render/vfx.js:2581`, `systems/barkDirector.js:643`, `systems/lawSecurity.js:335`, `systems/onboarding.js:570`, `systems/titles.js:593`, `ui/hud.js:4303` |
| `heat:clear` | `systems/combat.js:1553` | `systems/heat.js:389` |
| `heat:scrubRequested` | `systems/fenceDesk.js:345` | `systems/heat.js:417` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:1057` | `systems/missions.js:1542` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1514` | — |
| `heist:captureFork` | `systems/heistFacilities.js:2053` | `systems/missions.js:1551` |
| `heist:counterweight` | `systems/heistFacilities.js:3194` | `systems/missions.js:1562` |
| `heist:counterweightSceneReceipt` | `systems/heistFacilities.js:3517`, `systems/heistFacilities.js:3525`, `systems/heistFacilities.js:3530`, `systems/heistFacilities.js:3552` | — |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1940` | `systems/missions.js:1547` |
| `heist:launchCue` | `systems/heistFacilities.js:451`, `systems/heistFacilities.js:3889` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:591`, `systems/heistFacilities.js:600`, `systems/heistFacilities.js:604`, `systems/heistFacilities.js:618` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:2502` | — |
| `heist:monitorScan` | `systems/heistFacilities.js:3846` | `systems/missions.js:1555` |
| `heist:observed` | `systems/heistFacilities.js:2713` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:2444` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:2425` | `systems/npcJobsRuntime.js:1077` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:2363` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:326` |
| `heist:routineReceipt` | `systems/heistFacilities.js:1803` | — |
| `heist:shipmentUnit` | `systems/heistFacilities.js:1918` | `systems/missions.js:1558` |
| `hud:firstUse` | `systems/onboarding.js:915`, `systems/tetherGameplay.js:1980`, `systems/tetherGameplay.js:2051` | `ui/hud.js:2408` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:456` |
| `hud:phase` | `systems/story.js:335`, `systems/story.js:365`, `systems/story.js:368`, `systems/story.js:729` | `ui/hudMeta.js:167` |
| `hud:recallObjective` | `ui/input.js:370` | `ui/hud.js:1897` |
| `hud:slotClaim` | `ui/promptDeck.js:243` | `ui/hud.js:2276` |
| `hud:slotRelease` | `ui/promptDeck.js:244` | `ui/hud.js:2277` |
| `hud:tagFlicker` | `systems/story.js:706` | `ui/hudMeta.js:201` |
| `hull:fractured` | `systems/hullFracture.js:334` | `render/authoredMotion.js:1125` |
| `hullBurst:activated` | `systems/hullBurst.js:218` | — |
| `hullBurst:ended` | `systems/hullBurst.js:239` | — |
| `hullBurst:hit` | `systems/hullBurst.js:361`, `systems/hullBurst.js:392`, `systems/hullBurst.js:571` | `render/authoredMotion.js:1123` |
| `hullBurst:released` | `systems/hullBurst.js:506` | — |
| `ilexArk:accepted` | `systems/ilexArk.js:161` | — |
| `ilexArk:finished` | `systems/ilexArk.js:193` | — |
| `ilexArk:harvested` | `systems/economy.js:3205` | — |
| `ilexArk:offer` | `systems/ilexArk.js:225` | `ui/ilexArkPrompt.js:4` |
| `ilexArk:vaultDelivered` | `systems/ilexArk.js:179` | — |
| `ilexArk:vaultReleased` | `systems/ilexArk.js:111` | — |
| `industry:haulRequested` | `systems/environmentalMachinery.js:773` | `systems/traffic.js:1765` |
| `input:worldGestureCancelled` | `systems/input.js:1125`, `ui/worldObjectInteraction.js:194` | `systems/masslineThrow.js:129` |
| `interdiction:triggered` | `systems/encounterScripts.js:593`, `systems/world.js:5351` | `render/authoredMotion.js:1137`, `systems/presentationOrchestrator.js:189`, `systems/sectorSim.js:139` |
| `intervention:available` | `systems/intervention.js:260` | — |
| `intervention:closed` | `systems/intervention.js:313` | — |
| `intervention:jumperRipped` | `systems/intervention.js:432` | — |
| `intervention:logged` | `systems/intervention.js:135` | — |
| `jump:arrive` | `systems/world.js:5292` | `render/authoredMotion.js:1185`, `render/feel.js:1349`, `render/shipMicroMotion.js:1304`, `save/saveSystem.js:447`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:187`, `systems/sectorSim.js:163` |
| `jump:chargeAbort` | `systems/world.js:5431`, `systems/world.js:5511`, `systems/world.js:5576` | `audio/audioSystem.js:2611`, `render/authoredMotion.js:1186`, `render/shipMicroMotion.js:1305`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:186`, `systems/routeFollower.js:375`, `ui/galaxyMap.js:2597`, `ui/toasts.js:572` |
| `jump:chargeStart` | `systems/world.js:5493`, `systems/world.js:5537` | `render/authoredMotion.js:1183`, `render/feel.js:1339`, `render/shipMicroMotion.js:1301`, `systems/gateControlDirector.js:65`, `systems/missions.js:1412`, `systems/presentationOrchestrator.js:183`, `systems/story.js:217`, `ui/galaxyMap.js:2596` |
| `jump:chargeTick` | `systems/world.js:5235` | `render/authoredMotion.js:1177`, `render/shipMicroMotion.js:1302`, `systems/presentationOrchestrator.js:184` |
| `jump:departurePreflight` | `systems/world.js:5475` | `systems/story.js:216` |
| `jump:start` | `systems/world.js:5252` | `audio/audioSystem.js:2610`, `render/authoredMotion.js:1184`, `render/feel.js:1343`, `render/shipMicroMotion.js:1303`, `systems/economy.js:1669`, `systems/gateControlDirector.js:66`, `systems/mining.js:265`, `systems/presentationOrchestrator.js:185`, `systems/sectorSim.js:162` |
| `jump:unfiledConfirmed` | `systems/world.js:5557` | `systems/story.js:218` |
| `kilnback:caskReleased` | `systems/kilnback.js:134` | — |
| `kilnback:caskSalvaged` | `systems/kilnback.js:195` | — |
| `kilnback:coolantReleased` | `systems/kilnback.js:183` | — |
| `kilnback:phase` | `systems/kilnback.js:223` | — |
| `landmark:artifactRecovered` | `systems/missions.js:5602` | `systems/world.js:637` |
| `lastShift:archive` | `ui/lastShiftPrompt.js:24` | — |
| `lastShift:archived` | `systems/lastShift.js:199` | — |
| `lastShift:offer` | `systems/lastShift.js:180` | `ui/lastShiftPrompt.js:8` |
| `lastShift:recorderReturned` | `systems/lastShift.js:238` | — |
| `lastShift:returnRecorder` | `ui/lastShiftPrompt.js:25` | — |
| `law:audit` | — | `systems/lawSecurity.js:340` |
| `law:custodyAcknowledged` | — | `systems/barkDirector.js:632` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:42` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:622` |
| `law:distressRaised` | — | `systems/barkDirector.js:640` |
| `law:fineAssessed` | — | `systems/barkDirector.js:635`, `ui/impoundPayPrompt.js:53` |
| `law:fineChoice` | `ui/impoundPayPrompt.js:215` | `systems/lawSecurity.js:338` |
| `law:fineRefused` | — | `ui/impoundPayPrompt.js:54` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:92` | `systems/lawSecurity.js:336` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:47` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:48` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:44` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:46`, `systems/heat.js:399`, `ui/impoundPayPrompt.js:49` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:50` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:45` |
| `law:incidentOpened` | — | `systems/traffic.js:1667` |
| `law:incidentResolved` | — | `systems/barkDirector.js:638` |
| `law:killedAdjudicated` | — | `systems/factions.js:318` |
| `law:playerSurrender` | — | `systems/lawSecurity.js:339` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:628`, `systems/factions.js:401`, `systems/heat.js:414` |
| `law:responseDeferred` | — | `systems/barkDirector.js:637` |
| `law:sanctuaryWithdrawal` | — | `systems/barkDirector.js:636` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:395` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:624` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:623` |
| `law:wantedWarrantReleased` | — | `systems/barkDirector.js:639` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:354` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `render/authoredMotion.js:1148`, `systems/lawSecurity.js:324` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:945`, `systems/lootShards.js:1090`, `systems/stuntGrammar.js:187` | `systems/mining.js:259`, `ui/floatingText.js:267`, `ui/floatingText.js:274` |
| `loot:magnetCaptured` | `systems/lootShards.js:669` | `audio/audioSystem.js:2533` |
| `loot:manifestPayload` | `systems/lootShards.js:1199` | `systems/missions.js:1641` |
| `loot:overflowConverted` | `systems/mining.js:2509` | `audio/audioSystem.js:2532`, `ui/floatingText.js:269` |
| `lossInvestigation:closed` | `systems/lossInvestigation.js:322` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:185` | `systems/lossInvestigation.js:126` |
| `lossLedger:recorded` | `systems/lossLedger.js:391` | `systems/factionPresence.js:450`, `systems/ships.js:1691` |
| `machine:tokenDelivered` | `systems/precursorMachines.js:773`, `systems/precursorMachines.js:825` | — |
| `map:sectorCharted` | `systems/world.js:4338` | `systems/economy.js:1599` |
| `massSeed:cleared` | `systems/massSeed.js:603` | — |
| `massSeed:collapsed` | `systems/massSeed.js:426`, `systems/massSeed.js:476`, `systems/massSeed.js:556`, `systems/massSeed.js:586` | `render/authoredMotion.js:1176` |
| `massSeed:collapsing` | `systems/massSeed.js:425`, `systems/massSeed.js:447`, `systems/massSeed.js:542`, `systems/massSeed.js:584` | `audio/audioSystem.js:2775` |
| `massSeed:deployDenied` | `systems/massSeed.js:155` | — |
| `massSeed:deployed` | `systems/massSeed.js:255` | `audio/audioSystem.js:2763`, `render/authoredMotion.js:1173`, `systems/onboarding.js:793` |
| `massSeed:destroyed` | `systems/massSeed.js:583` | — |
| `massSeed:locked` | `systems/massSeed.js:312` | `audio/audioSystem.js:2769`, `render/authoredMotion.js:1174` |
| `massSeed:locking` | `systems/massSeed.js:377` | `audio/audioSystem.js:2766` |
| `massSeed:tetherCut` | `systems/massSeed.js:504` | `audio/audioSystem.js:2779`, `render/authoredMotion.js:1175` |
| `massSeed:warning` | `systems/massSeed.js:339` | `audio/audioSystem.js:2772` |
| `massline:bridleCut` | `systems/tetherGameplay.js:948` | `ui/stuntCallout.js:751` |
| `massline:bridleEnded` | `systems/tetherGameplay.js:886`, `systems/tetherGameplay.js:904`, `systems/tetherGameplay.js:1122` | `ui/masslineHud.js:1137` |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:743` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:797` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:958` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2545` | — |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:2733` | `systems/barkDirector.js:667` |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1765` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:1888` | `systems/gamepad.js:867` |
| `massline:recovered` | `systems/tumbleStates.js:247` | — |
| `massline:recovering` | `systems/tumbleStates.js:619` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:186` | `audio/audioSystem.js:2522` |
| `massline:releaseValidated` | `systems/masslineThrow.js:629` | `systems/presentationOrchestrator.js:164` |
| `massline:releaseWindow` | `systems/masslineThrow.js:247` | `ui/stuntCallout.js:743` |
| `massline:rideStarted` | `systems/tetherGameplay.js:2024` | `ui/stuntCallout.js:744` |
| `massline:selfSling` | `systems/masslineThrow.js:658` | `systems/flightV3.js:198`, `systems/onboarding.js:757`, `ui/stuntCallout.js:711` |
| `massline:snareArmed` | `systems/masslineSnares.js:239` | `audio/audioSystem.js:2761`, `render/authoredMotion.js:1114` |
| `massline:snareCaught` | `systems/masslineSnares.js:434` | `systems/gamepad.js:858` |
| `massline:snareCut` | `systems/masslineSnares.js:727` | `audio/audioSystem.js:2762` |
| `massline:snareDeployed` | `systems/masslineSnares.js:341`, `systems/masslineSnares.js:686` | `render/authoredMotion.js:1108` |
| `massline:snareEnded` | `systems/masslineSnares.js:729` | `render/authoredMotion.js:1112` |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `render/vfx.js:2569`, `systems/masslineImpactDamage.js:48`, `systems/presentationOrchestrator.js:151`, `ui/stuntCallout.js:750` |
| `massline:threat` | `systems/masslineThreats.js:273` | `systems/presentationOrchestrator.js:127` |
| `massline:throw` | `systems/masslineThrow.js:571` | `systems/lootShards.js:592`, `systems/mines.js:74`, `systems/missions.js:1530`, `systems/tumbleStates.js:119`, `ui/stuntCallout.js:746` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:618` | `render/feel.js:1434` |
| `massline:tumbled` | `systems/tumbleStates.js:486` | `render/feel.js:1420` |
| `mines:armed` | `systems/mines.js:185`, `systems/mines.js:218` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:93` | `audio/audioSystem.js:2564` |
| `mines:detonated` | `systems/mines.js:288` | `audio/audioSystem.js:2479` |
| `mines:placeRequest` | `systems/encounterScripts.js:152`, `systems/survivalArena.js:1268`, `systems/swarmEvents.js:208` | `systems/mines.js:73` |
| `mines:placed` | `systems/mines.js:158` | `systems/survivalArena.js:1010` |
| `mines:released` | `systems/mines.js:323` | — |
| `mines:triggered` | `systems/mines.js:278` | — |
| `mining:beamLocked` | `systems/mining.js:909` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2347` | `systems/missions.js:1486`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:923` | `systems/presentationOrchestrator.js:216`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:728` | `ui/miningHud.js:206` |
| `mining:npcExtraction` | `systems/traffic.js:10162` | `systems/fieldDepletion.js:756` |
| `mining:podSplit` | `systems/mining.js:1761` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2292` | `render/asteroidMotionPresentation.js:494`, `systems/presentationOrchestrator.js:213`, `ui/miningHud.js:209` |
| `mining:richCoreCompleted` | `systems/mining.js:2325` | `render/asteroidMotionPresentation.js:495`, `systems/presentationOrchestrator.js:214`, `ui/miningHud.js:210` |
| `mining:richCoreExposed` | `systems/mining.js:2270` | `render/asteroidMotionPresentation.js:493`, `systems/presentationOrchestrator.js:212`, `ui/miningHud.js:208` |
| `mining:richCoreFizzle` | `systems/mining.js:2329` | `render/asteroidMotionPresentation.js:496`, `systems/presentationOrchestrator.js:215`, `ui/miningHud.js:211` |
| `mining:seamHit` | `systems/mining.js:2646` | `systems/presentationOrchestrator.js:205` |
| `mining:start` | `systems/mining.js:423`, `systems/mining.js:550`, `systems/mining.js:1710` | `audio/audioSystem.js:2451`, `render/asteroidMotionPresentation.js:488`, `render/authoredMotion.js:1103`, `render/authoredMotion.js:1130`, `render/vfx.js:2594`, `systems/missions.js:1627`, `systems/onboarding.js:483`, `systems/presentationOrchestrator.js:202`, `ui/miningHud.js:204`, `ui/worldObjectInteraction.js:415` |
| `mining:stop` | `systems/mining.js:673` | `audio/audioSystem.js:2452`, `render/asteroidMotionPresentation.js:489`, `render/authoredMotion.js:1105`, `render/authoredMotion.js:1131`, `render/vfx.js:2595`, `systems/presentationOrchestrator.js:203`, `ui/miningHud.js:205` |
| `mining:tick` | `systems/automation.js:1078`, `systems/mining.js:944` | `audio/audioSystem.js:2453`, `render/vfx.js:2596`, `systems/presentationOrchestrator.js:204`, `ui/miningHud.js:207` |
| `mining:ventBonus` | `systems/mining.js:772` | — |
| `mining:ventReady` | `systems/mining.js:709` | `systems/presentationOrchestrator.js:209` |
| `mining:yield` | `balance/careerCohorts.js:2215`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:767`, `systems/mining.js:1142`, `systems/mining.js:1212`, `systems/mining.js:1841`, `systems/mining.js:2322` | `careers/origins/prospectorOrigin.js:636`, `render/authoredMotion.js:1104`, `render/vfx.js:2599`, `systems/encounterDirector.js:341`, `systems/missions.js:1469`, `systems/onboarding.js:484`, `systems/presentationOrchestrator.js:210`, `ui/floatingText.js:251` |
| `mission:abandon` | `systems/moralTrap.js:301` | `systems/missions.js:1406` |
| `mission:abandoned` | — | `systems/contractClauses.js:255` |
| `mission:accepted` | `systems/missions.js:3793` | `audio/audioSystem.js:2579`, `save/saveSystem.js:448`, `systems/aftermathWrecks.js:1053`, `systems/contractClauses.js:250`, `systems/contractClauses.js:251`, `systems/economy.js:1574`, `systems/encounterDirector.js:343`, `systems/fenceDesk.js:53`, `systems/moralTrap.js:182`, `systems/onboarding.js:486`, `ui/hud.js:4283`, `ui/screens/missionLog.js:2488`, `ui/wreckChoicePrompt.js:45` |
| `mission:completed` | `systems/missions.js:8383`, `systems/missions.js:8403`, `systems/missions.js:8586` | `audio/audioSystem.js:2580`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:449`, `systems/aftermathWrecks.js:1054`, `systems/claims.js:388`, `systems/contractClauses.js:252`, `systems/contractClauses.js:259`, `systems/encounterDirector.js:347`, `systems/factions.js:435`, `systems/fenceDesk.js:54`, `systems/lossLedger.js:432`, `systems/onboarding.js:487`, `systems/story.js:239`, `ui/hud.js:1893`, `ui/hud.js:4284`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2489` |
| `mission:conditionBroken` | `systems/contractClauses.js:466`, `systems/missions.js:1851` | `ui/hud.js:1884` |
| `mission:conditionPending` | `systems/missions.js:1904` | `ui/hud.js:1881` |
| `mission:conditionProgress` | `systems/contractClauses.js:434`, `systems/missions.js:1834` | `ui/hud.js:1882` |
| `mission:conditionSatisfied` | `systems/contractClauses.js:445`, `systems/missions.js:1842` | `systems/missions.js:1593`, `ui/hud.js:1883` |
| `mission:expired` | `systems/missions.js:9041` | `audio/audioSystem.js:2584`, `save/saveSystem.js:451`, `systems/aftermathWrecks.js:1056`, `systems/contractClauses.js:254`, `systems/contractClauses.js:264`, `systems/factions.js:444`, `ui/screens/missionLog.js:2491` |
| `mission:failed` | `systems/missions.js:8976` | `audio/audioSystem.js:2583`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:450`, `systems/aftermathWrecks.js:1055`, `systems/contractClauses.js:253`, `systems/encounterDirector.js:348`, `systems/factions.js:443`, `systems/fenceDesk.js:55`, `systems/story.js:240`, `ui/hud.js:1889`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2490` |
| `mission:forceEvent` | — | `systems/economy.js:1677` |
| `mission:gateCleared` | `systems/missions.js:7710`, `systems/missions.js:7814` | — |
| `mission:offerBoarded` | `systems/missions.js:2834` | `systems/aftermathWrecks.js:1052`, `systems/economyContracts.js:189` |
| `mission:offered` | `systems/aftermathWrecks.js:1944`, `systems/alienEcology.js:377`, `systems/careerContracts.js:318`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:290`, `systems/lossInvestigation.js:275`, `systems/lossLedger.js:367`, `systems/postEndingReplay.js:340`, `systems/salvage.js:1158`, `systems/uniqueWrecks.js:1020` | `systems/economy.js:1573`, `systems/lossInvestigation.js:125`, `systems/missions.js:1411`, `systems/survivorPod.js:558` |
| `mission:setPieceTransition` | `systems/missions.js:8342` | `systems/lossInvestigation.js:127` |
| `mission:setPieceTravelLine` | `systems/missions.js:11115` | — |
| `mission:spawnDeferred` | `systems/missions.js:9778` | — |
| `mission:targetsProjected` | `systems/missions.js:9144` | — |
| `mission:updated` | `systems/contractClauses.js:439`, `systems/contractClauses.js:449`, `systems/contractClauses.js:478`, `systems/missions.js:1459`, `systems/missions.js:1838`, `systems/missions.js:1846`, `systems/missions.js:1864`, `systems/missions.js:1944`, `systems/missions.js:2085`, `systems/missions.js:2229`, `systems/missions.js:2345`, `systems/missions.js:2637`, `systems/missions.js:2671`, `systems/missions.js:2683`, `systems/missions.js:2833`, `systems/missions.js:3697`, `systems/missions.js:3712`, `systems/missions.js:3806`, `systems/missions.js:4092`, `systems/missions.js:4344`, `systems/missions.js:5089`, `systems/missions.js:5128`, `systems/missions.js:5141`, `systems/missions.js:5156`, `systems/missions.js:5172`, `systems/missions.js:5218`, `systems/missions.js:5286`, `systems/missions.js:5439`, `systems/missions.js:5448`, `systems/missions.js:5676`, `systems/missions.js:5702`, `systems/missions.js:5773`, `systems/missions.js:5789`, `systems/missions.js:5833`, `systems/missions.js:5854`, `systems/missions.js:5884`, `systems/missions.js:5907`, `systems/missions.js:6018`, `systems/missions.js:6198`, `systems/missions.js:7240`, `systems/missions.js:7422`, `systems/missions.js:7563`, `systems/missions.js:7722`, `systems/missions.js:7820`, `systems/missions.js:7857`, `systems/missions.js:7947`, `systems/missions.js:7954`, `systems/missions.js:8575`, `systems/missions.js:9011`, `systems/missions.js:9057`, `systems/missions.js:9450`, `systems/missions.js:9743`, `systems/missions.js:9769`, `systems/missions.js:9936`, `systems/missions.js:10041`, `systems/missions.js:10123`, `systems/missions.js:10193`, `systems/missions.js:10397`, `systems/missions.js:10430`, `systems/missions.js:10445`, `systems/missions.js:10459`, `systems/missions.js:10644`, `systems/missions.js:10786`, `systems/missions.js:10834`, `systems/missions.js:10920`, `systems/missions.js:11339`, `systems/missions.js:11623`, `systems/missions.js:11769` | `ui/hud.js:4282`, `ui/screens/missionLog.js:2487`, `ui/station/screens/contracts.js:1460` |
| `mode:changed` | `main.js:362`, `main.js:1211`, `main.js:1221`, `main.js:1232`, `save/saveSystem.js:4578`, `save/saveSystem.js:4604`, `save/saveSystem.js:5087`, `save/saveSystem.js:5378` | `systems/autoTargetAssist.js:143`, `systems/presentationAdapters.js:209`, `systems/scanner.js:1015`, `ui/loadingPresenter.js:185`, `ui/screenManager.js:674`, `ui/screens/mainMenu.js:879`, `ui/uiRoot.js:1009`, `ui/wingmanRadial.js:331` |
| `module:equipped` | `systems/ships.js:2482` | `systems/onboarding.js:523`, `systems/onboarding.js:528`, `systems/onboarding.js:538`, `systems/onboarding.js:809`, `systems/ships.js:1622`, `systems/survivalDraft.js:182`, `systems/world.js:601` |
| `module:fitRefused` | `systems/ships.js:2095`, `systems/ships.js:2429`, `systems/ships.js:2493` | `ui/station/screens/shipworks.js:4152` |
| `module:granted` | `systems/ships.js:2171` | — |
| `module:purchased` | `systems/ships.js:2153` | — |
| `module:unequipped` | `systems/ships.js:1798`, `systems/ships.js:2520` | `systems/ships.js:1623`, `systems/survivalDraft.js:183`, `systems/world.js:602` |
| `moment:amended` | `systems/bulletTime.js:262` | `ui/screens/clips.js:85` |
| `moment:holyShit` | — | `render/feel.js:1409` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:328` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | `systems/encounterDirector.js:330` |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:181` |
| `moralTrap:resolved` | `systems/moralTrap.js:297` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:245` | `ui/moralTrapPrompt.js:37` |
| `morrow:launch` | `systems/morrow.js:252` | — |
| `morrow:met` | `systems/morrow.js:191` | — |
| `morrow:voice` | `systems/morrow.js:165` | — |
| `mothlight:identified` | `systems/mothlight.js:205` | `ui/mothlightPrompt.js:6` |
| `mothlight:lampReleased` | `systems/mothlight.js:112` | — |
| `mothlight:phase` | `systems/mothlight.js:159` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:3238` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:358` |
| `nav:abortRoute` | — | `systems/routeFollower.js:367` |
| `nav:autopilot` | `systems/flight.js:408`, `systems/flightV3.js:1472`, `systems/world.js:5651` | `systems/routeFollower.js:370` |
| `nav:engageRoute` | `systems/routeFollower.js:365` | `systems/routeFollower.js:360` |
| `nav:routeBrake` | — | `audio/audioSystem.js:2663` |
| `nav:waypoint` | `save/saveSystem.js:5955`, `systems/claims.js:1907`, `systems/claims.js:1915`, `systems/missions.js:1429`, `systems/missions.js:4333`, `systems/missions.js:4409`, `systems/missions.js:4441`, `systems/missions.js:5107`, `systems/missions.js:5966`, `systems/world.js:5650`, `ui/market/tradeLogic.js:485` | `render/authoredMotion.js:1133` |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:135` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:205` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:131` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `news:headline` | `systems/aftermathWrecks.js:788`, `systems/aftermathWrecks.js:854`, `systems/e1EncounterRuntime.js:225`, `systems/lastShift.js:194`, `systems/nemesisSignals.js:25`, `systems/presentationOrchestrator.js:1277`, `systems/traffic.js:9812`, `systems/traffic.js:11547`, `ui/marketNews.js:277` | — |
| `news:publish` | `data/encounters/362-the-salvage-watch.js:171`, `data/encounters/362-the-salvage-watch.js:186`, `data/encounters/362-the-salvage-watch.js:280`, `data/encounters/365-the-grandee.js:102`, `data/encounters/365-the-grandee.js:121`, `data/encounters/365-the-grandee.js:169`, `data/encounters/367-the-salvage-tail.js:165`, `data/encounters/367-the-salvage-tail.js:185`, `systems/aftermathWrecks.js:796`, `systems/aftermathWrecks.js:872`, `systems/choirReliefBerth.js:321`, `systems/choirReliefBerth.js:361`, `systems/claims.js:2380`, `systems/claims.js:2584`, `systems/claims.js:3096`, `systems/claims.js:3143`, `systems/eighthBellRuntime.js:122`, `systems/factions.js:536`, `systems/memorialThief.js:135`, `systems/npcJobsRuntime.js:1324`, `systems/presentationOrchestrator.js:1284`, `systems/traffic.js:4208`, `systems/traffic.js:11158`, `systems/uniqueWrecks.js:576`, `systems/uniqueWrecks.js:1814`, `systems/world.js:901`, `ui/watchlistHud.js:77` | — |
| `news:render` | `ui/hud.js:1781` | — |
| `npc:hailed` | `systems/barkDirector.js:1569`, `systems/barkDirector.js:1619` | `render/authoredMotion.js:1168` |
| `npcJobs:towAssistComplete` | `systems/npcJobsRuntime.js:3433` | — |
| `npcJobs:towAssistLost` | `systems/npcJobsRuntime.js:3017`, `systems/npcJobsRuntime.js:3496`, `systems/npcJobsRuntime.js:3533` | `systems/missions.js:1638` |
| `npcjobs:closeCall` | `systems/npcJobsRuntime.js:4956` | — |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:5940` | — |
| `npcjobs:distress` | `systems/npcJobsRuntime.js:6065` | `systems/traffic.js:1650` |
| `npcjobs:errand` | `systems/laneErrands.js:213` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1647` |
| `npcjobs:load` | — | `systems/traffic.js:1645` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1230` | `systems/barkDirector.js:649` |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1223` | `ui/station/barContacts.js:185` |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1211` | `ui/station/barContacts.js:184` |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1209` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3662` | `render/authoredMotion.js:1153` |
| `npcjobs:oncallTenderRetired` | `systems/npcJobsRuntime.js:5486` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:5032` | — |
| `npcjobs:surveyMarked` | `systems/npcJobsRuntime.js:1283` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:5104` | `render/npcJobSignatureVfx.js:711`, `render/npcJobSignatureVfx.js:902` |
| `npcjobs:unload` | — | `systems/traffic.js:1646` |
| `npcjobs:work` | — | `systems/traffic.js:1644` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:5236` | `systems/stationSideEventDirector.js:98` |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:5259` | — |
| `occupation:delivered` | `systems/scavengerOccupationSwitch.js:238` | — |
| `occupation:lost` | `systems/scavengerOccupationSwitch.js:266` | — |
| `occupation:switched` | `systems/scavengerOccupationSwitch.js:209` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:2226`, `systems/onboarding.js:3059` | — |
| `onboarding:rosterPrewarm` | `systems/onboarding.js:1927` | — |
| `optic:beamContact` | `systems/combat.js:1373` | — |
| `optic:contact` | `systems/weapons.js:2326`, `systems/weapons.js:2390` | `audio/audioSystem.js:2412` |
| `optic:rekindled` | — | `audio/audioSystem.js:2413` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1223` | `systems/world.js:608` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:2148` | `systems/story.js:159` |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1336` | — |
| `orrinWitness:submitted` | `systems/story.js:1364` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:6809` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:610` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:6605` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:6640` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:6769` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:6723` | `ui/recoveryEncounterPrompt.js:478` |
| `palletJack:drop` | `ui/palletJackPrompt.js:19` | — |
| `palletJack:lost` | `systems/palletJack.js:355` | — |
| `palletJack:offer` | `systems/palletJack.js:271` | `ui/palletJackPrompt.js:6` |
| `palletJack:phase` | `systems/palletJack.js:178` | — |
| `palletJack:released` | `systems/palletJack.js:254` | — |
| `palletJack:trail` | `ui/palletJackPrompt.js:20` | — |
| `patrol:proximity` | `systems/encounterScripts.js:435` | `systems/economy.js:1670`, `systems/moralTrap.js:180` |
| `pds:intercept` | `systems/countermeasures.js:441` | `audio/audioSystem.js:2397` |
| `physics:impact` | `core/physics.js:2121` | `audio/audioSystem.js:2407`, `render/asteroidMotionPresentation.js:484`, `render/feel.js:1386`, `render/shipMicroMotion.js:1298`, `render/vfx.js:2534`, `systems/aftermathWrecks.js:1031`, `systems/asteroidSites.js:600`, `systems/barkDirector.js:680`, `systems/collisionConsequences.js:93`, `systems/environmentMaterials.js:85`, `systems/fields.js:536`, `systems/fragileCargo.js:284`, `systems/gamepad.js:850`, `systems/heistFacilities.js:325`, `systems/impulseCharges.js:276`, `systems/lootShards.js:591`, `systems/masslineImpactDamage.js:49`, `systems/ships.js:1714`, `systems/survivalResults.js:491`, `systems/swarmArena.js:526`, `systems/swarmElites.js:137`, `systems/volatileExposure.js:215`, `testing/motionScenarios.js:1676`, `ui/hud.js:2312` |
| `pickup:collected` | `core/physics.js:1894`, `systems/mining.js:1474`, `systems/mining.js:2442`, `systems/uniqueWrecks.js:1692` | `audio/audioSystem.js:2531`, `render/vfx.js:2640`, `save/saveSystem.js:396`, `systems/economy.js:1630`, `systems/encounterDirector.js:313`, `systems/lawSecurity.js:327`, `systems/mining.js:261`, `systems/onboarding.js:485`, `systems/onboarding.js:569`, `systems/presentationOrchestrator.js:217`, `systems/swarmArena.js:535`, `systems/swarmEvents.js:92`, `systems/swarmSupply.js:107`, `systems/tetherGameplay.js:303`, `systems/traffic.js:1658`, `systems/world.js:611`, `systems/world.js:612`, `systems/world.js:615`, `systems/world.js:616`, `systems/world.js:684`, `ui/floatingText.js:293` |
| `pirateDisengage:surrenderOffer` | — | `ui/pirateParleyPrompt.js:218` |
| `pirateDisengage:triggered` | — | `systems/combatOutcome.js:190` |
| `pirateDisengage:verdict` | `ui/pirateParleyPrompt.js:196` | — |
| `pirateDisengage:yieldResolved` | — | `ui/pirateParleyPrompt.js:219` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:151` | `systems/pirateParley.js:98` |
| `pirateParley:demand` | `systems/scanner.js:1615` | `ui/pirateParleyPrompt.js:216` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:189`, `ui/pirateParleyPrompt.js:217` |
| `pirateParley:started` | — | `systems/combatOutcome.js:188` |
| `planet:bandFirst` | `systems/planetRuntime.js:340` | `systems/onboarding.js:827` |
| `planet:collector` | `systems/planetRuntime.js:555` | `audio/audioSystem.js:2571`, `render/authoredMotion.js:1172`, `systems/onboarding.js:821` |
| `planet:harvest` | `systems/planetRuntime.js:633` | `audio/audioSystem.js:2572` |
| `planet:harvestDenied` | `systems/planetRuntime.js:640` | `audio/audioSystem.js:2573` |
| `planet:npcHarvest` | `systems/planetRuntime.js:620` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:433`, `systems/planetRuntime.js:446` | `audio/audioSystem.js:2574` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:530` | `audio/audioSystem.js:2575` |
| `planet:registered` | `systems/planetRuntime.js:200` | — |
| `planet:unregistered` | `systems/planetRuntime.js:269` | — |
| `player:death` | `systems/combat.js:851`, `systems/combat.js:982`, `systems/world.js:6051` | `audio/audioSystem.js:2449`, `render/feel.js:1294`, `render/shipMicroMotion.js:1309`, `render/vfx.js:2593`, `save/saveSystem.js:403`, `systems/aftermathWrecks.js:1028`, `systems/encounterDirector.js:349`, `systems/lawSecurity.js:326`, `systems/lossLedger.js:431`, `systems/missions.js:1587`, `systems/onboarding.js:516`, `systems/onboarding.js:568`, `systems/surrenderRecovery.js:78`, `systems/survivalResults.js:499`, `systems/survivalRun.js:130`, `systems/survivorPod.js:564`, `ui/commandBar.js:405`, `ui/hud.js:2832`, `ui/survivalHud.js:238` |
| `player:recoveryFailed` | `systems/combat.js:1035` | `ui/screens/gameOver.js:565` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:463` | `systems/combat.js:708` |
| `player:respawn` | `systems/combat.js:1108` | `audio/audioSystem.js:2450`, `render/shipMicroMotion.js:1308`, `save/saveSystem.js:404`, `save/saveSystem.js:463`, `ui/commandBar.js:409`, `ui/hud.js:2846`, `ui/screens/gameOver.js:557` |
| `player:scannedByPatrol` | `systems/economy.js:4405` | `render/authoredMotion.js:1151`, `render/vfx.js:2580`, `systems/missions.js:1577`, `ui/customsPrompt.js:149` |
| `poi:discovered` | `systems/world.js:930`, `systems/world.js:5784`, `systems/world.js:5862`, `systems/world.js:6326`, `systems/world.js:6352` | `audio/audioSystem.js:2595`, `systems/encounterDirector.js:331`, `systems/world.js:643` |
| `poi:identified` | `systems/world.js:5869`, `systems/world.js:6353` | `systems/encounterDirector.js:332`, `systems/missions.js:1416`, `systems/world.js:644` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2511` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2510` |
| `presentation:audioCue` | `render/vfx.js:5849`, `systems/presentationAdapters.js:565` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:478` | — |
| `presentation:caption` | `audio/audioSystem.js:2814`, `audio/audioSystem.js:5790`, `systems/factionPresence.js:893`, `systems/factionPresence.js:1306`, `systems/factionPresence.js:1321`, `systems/factionPresence.js:1339`, `systems/factionPresence.js:1401`, `systems/presentationAdapters.js:663`, `systems/story.js:1167`, `systems/story.js:1419` | `ui/hud.js:2895` |
| `presentation:cue` | `systems/aftermathWrecks.js:1432`, `systems/cargo.js:1029`, `systems/planetRuntime.js:457`, `systems/salvageActions.js:272`, `systems/salvageActions.js:484` | `audio/audioSystem.js:2688`, `render/vfx.js:2634`, `render/vfx.js:2635`, `render/vfx.js:2636`, `systems/presentationAdapters.js:206` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:460` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:381`, `systems/presentationAdapters.js:642` | — |
| `presentation:vfxCue` | `render/vfx.js:2653`, `systems/bombs.js:1296`, `systems/fields.js:2447`, `systems/fields.js:2498`, `systems/hullBurst.js:225`, `systems/hullBurst.js:363`, `systems/hullBurst.js:394`, `systems/hullBurst.js:580`, `systems/massSeed.js:319`, `systems/massSeed.js:435`, `systems/massSeed.js:529`, `systems/massSeed.js:571`, `systems/masslineThrow.js:578`, `systems/missions.js:3819`, `systems/missions.js:8591`, `systems/planetRuntime.js:663`, `systems/presentationAdapters.js:527`, `systems/tumbleStates.js:488`, `systems/tumbleStates.js:598`, `systems/volatileExposure.js:482`, `systems/volatileExposure.js:556`, `systems/weapons.js:1766`, `systems/weapons.js:1897`, `systems/weapons.js:3067` | `render/vfx.js:2639` |
| `projectile:bank` | — | `render/vfx.js:2528` |
| `projectile:hit` | `core/physics.js:1095`, `core/physics.js:1284`, `systems/sectorSim.js:729` | `audio/audioSystem.js:2390`, `combat/tetherWebs.js:40`, `render/vfx.js:2527`, `systems/bombs.js:681`, `systems/combat.js:700`, `systems/missions.js:1531` |
| `projectile:nearMiss` | `core/physics.js:1244` | `audio/audioSystem.js:2393`, `systems/presentationOrchestrator.js:175`, `ui/hud.js:2311` |
| `projectile:ricochet` | — | `render/vfx.js:2529` |
| `race:abort` | — | `systems/missions.js:1607` |
| `race:ended` | `systems/missions.js:8917` | — |
| `race:launchFailed` | — | `save/saveSystem.js:435` |
| `race:reset` | — | `systems/missions.js:1606` |
| `race:toggleView` | `ui/input.js:358`, `ui/input.js:1113` | — |
| `range:opened` | `ui/screens/range.js:2516` | `systems/onboarding.js:555` |
| `ravel:cast` | `systems/ravel.js:176` | — |
| `ravel:destroyed` | `systems/ravel.js:211` | — |
| `ravel:hit` | `systems/ravel.js:190` | — |
| `ravel:pacified` | `systems/ravel.js:199` | — |
| `ravel:telegraph` | `systems/ravel.js:157` | — |
| `ravel:unthreaded` | `systems/ravel.js:196` | — |
| `ravel:voice` | `systems/ravel.js:130` | — |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | `systems/onboarding.js:2433` | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `redKite:aborted` | `systems/redKite.js:177` | — |
| `redKite:course` | `ui/redKitePrompt.js:18` | — |
| `redKite:finished` | `systems/redKite.js:203` | — |
| `redKite:offer` | `systems/redKite.js:155` | `ui/redKitePrompt.js:6` |
| `redKite:start` | `ui/redKitePrompt.js:19` | — |
| `redKite:started` | `systems/redKite.js:170` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:162` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:163` |
| `rescue:beat` | `systems/onboarding.js:2402`, `systems/onboarding.js:2462` | — |
| `rescue:complete` | `systems/onboarding.js:2413` | — |
| `rescue:started` | `systems/onboarding.js:1986` | `systems/onboarding.js:517` |
| `rescuedWorker:returned` | `systems/rescuedWorkerReturn.js:421` | — |
| `research:pointsChanged` | `systems/missions.js:5472`, `systems/missions.js:5526`, `systems/missions.js:5560`, `systems/missions.js:8528`, `systems/missions.js:8542`, `systems/missions.js:11583` | `ui/alerts.js:486` |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2947` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1435` | `systems/encounterDirector.js:353` |
| `rhythm:phase` | `systems/encounterDirector.js:500` | — |
| `rubric:destroyed` | `systems/rubric.js:353` | — |
| `rubric:last` | `systems/rubric.js:482` | — |
| `rubric:marked` | `systems/rubric.js:437` | — |
| `rubric:voice` | `systems/rubric.js:264` | — |
| `ruckus:pulse` | `systems/ruckus.js:213` | — |
| `ruckus:retrieved` | `systems/ruckus.js:198` | — |
| `ruckus:state` | `systems/ruckus.js:147` | — |
| `ruckus:voice` | `systems/ruckus.js:141` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:364` | `ui/station/barContacts.js:142` |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:121` |
| `run:awardRequested` | `systems/swarmBrood.js:1333`, `systems/swarmEvents.js:275`, `ui/sandbox/sandboxSetup.js:1228`, `ui/sandbox/sandboxSetup.js:1243` | `systems/runSession.js:79` |
| `run:awarded` | — | `ui/survivalHud.js:218` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1148`, `ui/sandbox/sandboxSetup.js:1190` | `systems/runSession.js:76` |
| `run:draftLockRequested` | `ui/screens/crucibleDraft.js:1285` | `systems/survivalDraft.js:173` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:786`, `ui/screens/crucibleDraft.js:791`, `ui/screens/crucibleDraft.js:1163`, `ui/screens/crucibleDraft.js:1269`, `ui/screens/crucibleDraft.js:1432` | `systems/survivalDraft.js:165` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:914` | `systems/survivalDraft.js:174` |
| `run:draftResolved` | — | `systems/survivalRun.js:124` |
| `run:endRequested` | `save/saveSystem.js:347` | `systems/runSession.js:78` |
| `run:ended` | — | `audio/audioSystem.js:2546`, `systems/survivalAnnounce.js:333`, `systems/survivalArena.js:1002`, `systems/survivalDraft.js:189`, `systems/survivalResults.js:536`, `systems/survivalRun.js:118`, `systems/survivalWave.js:139`, `systems/swarmArena.js:527`, `systems/swarmChain.js:112`, `systems/swarmElites.js:141`, `systems/swarmEvents.js:91`, `systems/swarmJuice.js:111`, `systems/swarmSupply.js:109`, `ui/swarmJuiceHud.js:102` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:127` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:331`, `ui/survivalHud.js:219` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1264` | `systems/ships.js:1746`, `systems/survivalRun.js:119`, `systems/swarmSupply.js:102`, `systems/world.js:639` |
| `run:modifierChosen` | — | `systems/survivalRun.js:125` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:81` |
| `run:openingLessonReleased` | — | `systems/survivalAnnounce.js:329` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1265` | `systems/survivalRun.js:120` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1533`, `ui/screens/crucibleDraft.js:1550` | `systems/survivalDraft.js:166` |
| `run:refitClosed` | — | `systems/survivalRun.js:126` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:1915` | `systems/survivalDraft.js:167` |
| `run:refitSellRequested` | `ui/screens/crucibleDraft.js:1946` | `systems/survivalDraft.js:172` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:1911` | `systems/survivalDraft.js:168` |
| `run:resultsReady` | — | `systems/achievements.js:1112`, `ui/uiRoot.js:1495` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:178` |
| `run:spendRequested` | — | `systems/runSession.js:80` |
| `run:spent` | — | `systems/survivalDraft.js:177` |
| `run:started` | — | `audio/audioSystem.js:2545`, `sim/killcamTape.js:430`, `systems/survivalAnnounce.js:324`, `systems/survivalResults.js:483`, `systems/survivalRun.js:116`, `systems/swarmElites.js:140`, `systems/swarmJuice.js:110`, `ui/survivalHud.js:220`, `ui/swarmJuiceHud.js:101`, `ui/uiRoot.js:1507` |
| `run:threatRequested` | — | `systems/runSession.js:82` |
| `run:transitionRequested` | `systems/survivalRun.js:544` | `systems/runSession.js:77` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:332`, `systems/survivalDraft.js:164`, `systems/survivalResults.js:535`, `systems/survivalRun.js:117`, `systems/survivalWave.js:138`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:330`, `systems/survivalArena.js:1001`, `systems/survivalResults.js:489`, `systems/swarmEvents.js:90` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:122` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:327` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:500` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:325`, `systems/survivalArena.js:968`, `systems/survivalWave.js:136`, `systems/swarmArena.js:523`, `systems/swarmJuice.js:104`, `ui/survivalHud.js:231` |
| `run:waveProgress` | — | `ui/survivalHud.js:232` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:326`, `systems/survivalResults.js:488`, `systems/survivalWave.js:137`, `systems/swarmArena.js:524`, `systems/swarmEvents.js:89`, `systems/swarmJuice.js:105`, `ui/swarmJuiceHud.js:100` |
| `ruud:cut` | `systems/ruud.js:411` | — |
| `ruud:spared` | `systems/ruud.js:384` | — |
| `ruud:voice` | `systems/ruud.js:310` | — |
| `sable:demonstrated` | `ui/station/screens/shipworks.js:5037` | — |
| `salvage:actionRead` | `systems/salvageActions.js:218` | — |
| `salvage:bayCashedIn` | `systems/cargo.js:1058` | — |
| `salvage:changed` | `systems/cargo.js:532`, `systems/cargo.js:1059` | — |
| `salvage:claimJumped` | `systems/mining.js:1999` | `systems/missions.js:1628` |
| `salvage:communicatorFound` | `systems/salvage.js:1159` | `systems/encounterDirector.js:333`, `systems/story.js:278`, `ui/wreckChoicePrompt.js:44` |
| `salvage:completed` | `systems/mining.js:1854` | `render/vfx.js:2598`, `systems/aftermathWrecks.js:1049`, `systems/lawSecurity.js:333`, `systems/missions.js:1484`, `systems/missions.js:1629`, `systems/story.js:260` |
| `salvage:cookerFlight` | `systems/salvageActions.js:479` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:625` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:269` | `render/authoredMotion.js:1158` |
| `salvage:cutComplete` | `systems/mining.js:578` | `audio/audioSystem.js:2549`, `render/authoredMotion.js:1127`, `render/vfx.js:2597` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | `systems/salvage.js:168` |
| `salvage:npcExtraction` | `systems/traffic.js:7487` | `render/authoredMotion.js:1126` |
| `salvage:npcUnload` | `systems/traffic.js:11281` | `systems/economy.js:1634` |
| `salvage:placed` | `systems/salvage.js:529` | `systems/lossInvestigation.js:123`, `systems/survivorPod.js:542` |
| `salvage:reactorBurst` | `systems/salvageActions.js:731` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:336` | `systems/salvage.js:164` |
| `salvage:reactorVented` | `systems/salvageActions.js:233` | — |
| `salvage:sortDelivered` | `systems/salvage.js:984` | — |
| `salvage:sortImpact` | `systems/salvage.js:948` | — |
| `salvage:sortLost` | `systems/salvage.js:1014` | — |
| `salvage:sortSeparated` | `systems/salvage.js:912` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:133` |
| `save:backup` | `save/saveSystem.js:1743` | `ui/screens/saveLoad.js:948` |
| `save:completed` | `save/saveSystem.js:1749` | `ui/screens/saveLoad.js:938`, `ui/uiRoot.js:479` |
| `save:dirty` | `systems/ruckus.js:91` | `save/saveSystem.js:380` |
| `save:envelopePrepared` | `save/saveSystem.js:4066`, `save/saveSystem.js:4082` | `main.js:222` |
| `save:envelopeSpecPrepared` | `save/saveSystem.js:2123` | `main.js:221` |
| `save:error` | `main.js:238`, `save/saveSystem.js:1203`, `save/saveSystem.js:1816`, `save/saveSystem.js:3935`, `save/saveSystem.js:3953`, `save/saveSystem.js:3997`, `save/saveSystem.js:4018`, `save/saveSystem.js:4037`, `save/saveSystem.js:4107`, `save/saveSystem.js:4238`, `save/saveSystem.js:4259`, `save/saveSystem.js:4276`, `save/saveSystem.js:4448`, `save/saveSystem.js:4462`, `save/saveSystem.js:4556`, `save/saveSystem.js:4592`, `save/saveSystem.js:4639`, `save/saveSystem.js:4757`, `save/saveSystem.js:4796`, `save/saveSystem.js:4801`, `save/saveSystem.js:5438`, `save/saveSystem.js:5446`, `save/saveSystem.js:5493`, `save/saveSystem.js:6270`, `save/saveSystem.js:6288`, `save/saveSystem.js:6385`, `save/saveSystem.js:6404`, `ui/screens/saveLoad.js:1480` | `systems/aftermathWrecks.js:1061`, `systems/asteroidSites.js:599`, `systems/automation.js:564`, `systems/encounterDirector.js:305`, `systems/traffic.js:1680`, `ui/loadingPresenter.js:194`, `ui/screenManager.js:675`, `ui/screens/saveLoad.js:924`, `ui/screens/saveLoad.js:949`, `ui/uiRoot.js:505` |
| `save:exportRecovery` | `save/saveSystem.js:6259` | `ui/toasts.js:562` |
| `save:loadSpeculationTarget` | `ui/screens/gameOver.js:829`, `ui/screens/pause.js:1117`, `ui/screens/saveLoad.js:1139` | `save/saveSystem.js:360` |
| `save:loaded` | `save/saveSystem.js:5390` | `audio/audioSystem.js:2892`, `audio/bombAudio.js:460`, `audio/fieldAudio.js:327`, `careers/origins/haulerOriginSystem.js:65`, `combat/tetherWebs.js:49`, `core/coreSystem.js:310`, `core/physics.js:171`, `main.js:317`, `render/feel.js:1201`, `render/shipMicroMotion.js:1293`, `render/vfx.js:2576`, `render/vfx.js:2587`, `save/saveSystem.js:416`, `save/saveSystem.js:434`, `systems/aftermathWrecks.js:1060`, `systems/aiEncounter.js:137`, `systems/asteroidFormations.js:124`, `systems/asteroidSites.js:589`, `systems/autoTargetAssist.js:158`, `systems/automation.js:559`, `systems/barkDirector.js:609`, `systems/beacons.js:54`, `systems/bombs.js:680`, `systems/collisionConsequences.js:98`, `systems/combat.js:737`, `systems/combatOutcome.js:165`, `systems/countermeasures.js:223`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:85`, `systems/economy.js:1689`, `systems/encounterDirector.js:304`, `systems/environmentalMachinery.js:222`, `systems/factionPresence.js:459`, `systems/fields.js:524`, `systems/flight.js:79`, `systems/flightV3.js:188`, `systems/gateControlDirector.js:71`, `systems/heat.js:386`, `systems/heistFacilities.js:337`, `systems/impulseCharges.js:284`, `systems/lawSecurity.js:323`, `systems/lossInvestigation.js:129`, `systems/massSeed.js:121`, `systems/masslineSnares.js:139`, `systems/mines.js:78`, `systems/mining.js:279`, `systems/missions.js:1395`, `systems/npcJobsRuntime.js:1016`, `systems/npcJobsRuntime.js:1024`, `systems/npcJobsRuntime.js:1071`, `systems/npcJobsRuntime.js:1074`, `systems/onboarding.js:460`, `systems/planetRuntime.js:103`, `systems/presentationAdapters.js:213`, `systems/presentationOrchestrator.js:287`, `systems/routeFollower.js:387`, `systems/runSession.js:87`, `systems/salvageActions.js:137`, `systems/sectorSim.js:132`, `systems/ships.js:1633`, `systems/stationContactLoadBoundary.js:39`, `systems/stationSideEventDirector.js:97`, `systems/story.js:153`, `systems/survivalArena.js:1016`, `systems/survivorPod.js:562`, `systems/tetherGameplay.js:294`, `systems/titles.js:585`, `systems/traffic.js:1698`, `systems/traffic.js:1724`, `systems/traffic.js:1734`, `systems/traffic.js:1737`, `systems/travelLanes.js:533`, `systems/tumbleStates.js:130`, `systems/uniqueLootAbilities.js:150`, `systems/wingmen.js:145`, `systems/world.js:624`, `ui/alerts.js:481`, `ui/automationPayoff.js:76`, `ui/bandHud.js:107`, `ui/capitalBossOverlayMount.js:93`, `ui/cargoConscience.js:146`, `ui/hudLayout.js:120`, `ui/moralTrapPrompt.js:43`, `ui/priceHistory.js:147`, `ui/uiRoot.js:486`, `ui/uiRoot.js:1511`, `ui/wreckChoicePrompt.js:55` |
| `save:recovered` | `save/saveSystem.js:3914` | `ui/screens/saveLoad.js:947`, `ui/uiRoot.js:498` |
| `save:restoring` | `save/saveSystem.js:4910` | `core/coreSystem.js:307`, `main.js:318`, `render/feel.js:1200`, `render/vfx.js:2575`, `render/vfx.js:2586`, `systems/aftermathWrecks.js:1059`, `systems/asteroidSites.js:580`, `systems/autoTargetAssist.js:155`, `systems/automation.js:552`, `systems/cloak.js:74`, `systems/encounterDirector.js:297`, `systems/environmentalMachinery.js:221`, `systems/lawSecurity.js:322`, `systems/missions.js:1399`, `systems/missions.js:1609`, `systems/npcJobsRuntime.js:1017`, `systems/runSession.js:86`, `systems/salvage.js:158`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:38`, `systems/surrenderRecovery.js:79`, `systems/traffic.js:1668`, `systems/world.js:617` |
| `save:slotsValidated` | `save/saveSystem.js:2080` | `ui/screens/saveLoad.js:937` |
| `save:started` | `save/saveSystem.js:1420`, `save/saveSystem.js:2651` | `ui/screenManager.js:682` |
| `scan:completed` | `balance/careerCohorts.js:512`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:1245`, `systems/world.js:5788` | `careers/origins/prospectorOrigin.js:633`, `systems/asteroidFormations.js:130`, `systems/heistFacilities.js:332`, `systems/missions.js:1497`, `systems/onboarding.js:497`, `systems/presentationOrchestrator.js:191`, `systems/salvage.js:155`, `systems/salvageActions.js:132`, `systems/story.js:264`, `systems/story.js:265`, `systems/world.js:671`, `ui/hud.js:4784` |
| `scan:debrisCache` | `systems/mining.js:1900`, `systems/scanReveal.js:219` | `systems/presentationOrchestrator.js:201` |
| `scan:pulse` | `systems/scanner.js:1151` | `render/authoredMotion.js:1102`, `render/shipMicroMotion.js:1318`, `systems/buildIdentity.js:305`, `systems/cloak.js:91`, `systems/encounterDirector.js:322`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:190`, `systems/scanReveal.js:60`, `systems/world.js:672`, `ui/hud.js:4785` |
| `scan:shipRevealed` | `systems/scanReveal.js:87` | `audio/audioSystem.js:2373`, `systems/buildIdentity.js:304` |
| `scan:weakPoint` | `systems/scanner.js:1234` | `ui/hud.js:1835` |
| `scan:wreckInvestigated` | `systems/scanReveal.js:124` | `audio/audioSystem.js:2518` |
| `scan:wreckResolved` | `systems/scanner.js:1189` | `systems/lawSecurity.js:332` |
| `scan:wreckRevealed` | `systems/scanReveal.js:120` | `audio/audioSystem.js:2374`, `systems/presentationOrchestrator.js:200` |
| `scanner:ghostEscaped` | `systems/scanner.js:1093` | `systems/presentationOrchestrator.js:197` |
| `scanner:ghostRevealed` | `systems/scanner.js:1208` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:95` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:284` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:519`, `ui/comms.js:523` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:1066` | `systems/presentationOrchestrator.js:188` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:1118` | `audio/audioSystem.js:2649`, `audio/bombAudio.js:457`, `audio/fieldAudio.js:324`, `data/hazardLanguage.js:143`, `render/shipMicroMotion.js:1292`, `render/vfx.js:2571`, `render/vfx.js:2582`, `save/saveSystem.js:446`, `systems/achievements.js:1098`, `systems/aftermathWrecks.js:1038`, `systems/aiEncounter.js:138`, `systems/asteroidFormations.js:123`, `systems/asteroidSites.js:545`, `systems/automation.js:590`, `systems/bombs.js:672`, `systems/claims.js:380`, `systems/claims.js:382`, `systems/combatOutcome.js:180`, `systems/difficultyDirector.js:170`, `systems/dockingCorridor.js:83`, `systems/economy.js:1658`, `systems/encounterDirector.js:293`, `systems/factionPresence.js:443`, `systems/fields.js:522`, `systems/heistFacilities.js:304`, `systems/intervention.js:75`, `systems/lossInvestigation.js:124`, `systems/massSeed.js:119`, `systems/masslineSnares.js:135`, `systems/mines.js:76`, `systems/mining.js:278`, `systems/missions.js:1604`, `systems/moralTrap.js:178`, `systems/npcJobsRuntime.js:1005`, `systems/onboarding.js:619`, `systems/presentationOrchestrator.js:237`, `systems/routeFollower.js:379`, `systems/salvage.js:129`, `systems/salvageActions.js:140`, `systems/sectorSim.js:129`, `systems/story.js:215`, `systems/story.js:263`, `systems/survivalArena.js:1014`, `systems/survivorPod.js:545`, `systems/tetherGameplay.js:298`, `systems/traffic.js:1613`, `systems/travelLanes.js:534`, `systems/wingmen.js:122`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:155`, `ui/securityReadout.js:157`, `ui/watchlistHud.js:91` |
| `sector:exit` | `systems/world.js:991` | `audio/bombAudio.js:456`, `audio/fieldAudio.js:323`, `core/physics.js:173`, `render/vfx.js:2572`, `render/vfx.js:2583`, `systems/achievements.js:1104`, `systems/aftermathWrecks.js:1048`, `systems/asteroidSites.js:570`, `systems/automation.js:578`, `systems/bombs.js:671`, `systems/dockingCorridor.js:82`, `systems/encounterDirector.js:295`, `systems/environmentalMachinery.js:219`, `systems/factionPresence.js:448`, `systems/fields.js:521`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:323`, `systems/impulseCharges.js:285`, `systems/lawSecurity.js:321`, `systems/massSeed.js:118`, `systems/masslineSnares.js:133`, `systems/mines.js:75`, `systems/mining.js:266`, `systems/missions.js:1605`, `systems/npcJobsRuntime.js:1004`, `systems/planetRuntime.js:104`, `systems/sectorSim.js:128`, `systems/spawnBudget.js:50`, `systems/stationServices.js:208`, `systems/stationSideEventDirector.js:96`, `systems/surrenderRecovery.js:77`, `systems/survivalArena.js:1015`, `systems/tetherGameplay.js:297`, `systems/traffic.js:1636`, `systems/wingmen.js:134`, `ui/customsPrompt.js:151`, `ui/impoundPayPrompt.js:51`, `ui/impoundPayPrompt.js:56`, `ui/promptDeck.js:850`, `ui/wreckChoicePrompt.js:53` |
| `sector:membershipCandidate` | `systems/world.js:2350` | — |
| `sectorsim:embodiment` | `systems/sectorSim.js:998` | `systems/world.js:655` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:367` | `ui/screens/starmap.js:866` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1994`, `systems/claims.js:1861`, `systems/encounterDirector.js:2312`, `systems/mining.js:2602`, `systems/traffic.js:7160` | `systems/sectorSim.js:137`, `systems/world.js:670` |
| `sectorsim:intel` | `systems/sectorSim.js:1052` | `systems/world.js:660` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:828` | `systems/economy.js:1703` |
| `sectorsim:reconcile` | `systems/sectorSim.js:781` | `systems/world.js:661` |
| `sectorsim:tick` | `systems/sectorSim.js:312` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:740` | `ui/screens/starmap.js:867` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:551` | `systems/scanner.js:1019` |
| `service:aborted` | `systems/stationServices.js:295` | `audio/audioSystem.js:2589`, `render/authoredMotion.js:1121` |
| `service:completed` | `systems/economy.js:3869`, `systems/economy.js:4049`, `systems/economy.js:4081`, `systems/economy.js:4136`, `systems/economy.js:4177`, `systems/economy.js:4209`, `systems/economy.js:4247`, `systems/stationServices.js:514`, `systems/stationServices.js:531` | `render/authoredMotion.js:1120`, `render/authoredMotion.js:1124`, `systems/factionPresence.js:457`, `systems/ships.js:1718` |
| `service:progress` | `systems/stationServices.js:456` | — |
| `service:queued` | `systems/stationServices.js:362` | — |
| `service:started` | `systems/stationServices.js:445` | `audio/audioSystem.js:2588`, `render/authoredMotion.js:1119` |
| `settings:changed` | `save/saveSystem.js:5455`, `save/saveSystem.js:5456`, `systems/legacyTouch.js:701`, `ui/screens/motionAsk.js:95`, `ui/screens/pause.js:618`, `ui/screens/pause.js:626`, `ui/screens/pause.js:704`, `ui/screens/pause.js:737`, `ui/screens/raceBoard.js:86`, `ui/screens/settings.js:572`, `ui/screens/settings.js:1076`, `ui/screens/settings.js:1135`, `ui/screens/settings.js:1230` | `audio/audioSystem.js:2830`, `main.js:316`, `render/vfx.js:2589`, `save/saveSystem.js:374`, `systems/missions.js:1610`, `ui/uiRoot.js:857` |
| `ship:appearanceChanged` | `systems/ships.js:2001`, `systems/ships.js:2336`, `systems/traffic.js:3746` | `core/coreSystem.js:306`, `render/vfx.js:2577` |
| `ship:appearanceSaved` | `systems/ships.js:2338` | `ui/station/screens/shipworks.js:748` |
| `ship:boostPreKick` | `systems/flightV3.js:726` | `render/authoredMotion.js:1116`, `render/feel.js:1321` |
| `ship:boostStart` | `systems/flight.js:110`, `systems/flightV3.js:243` | `audio/audioSystem.js:2656`, `render/authoredMotion.js:1117`, `render/vfx.js:2617`, `systems/cruise.js:61`, `systems/onboarding.js:556` |
| `ship:boostStop` | `systems/flight.js:111`, `systems/flight.js:224`, `systems/flightV3.js:244`, `systems/flightV3.js:769` | `audio/audioSystem.js:2661`, `render/authoredMotion.js:1118`, `render/vfx.js:2618` |
| `ship:cargoCapChanged` | `systems/ships.js:1996` | — |
| `ship:dash` | `systems/flight.js:201`, `systems/flightV3.js:747` | `audio/audioSystem.js:2664`, `render/vfx.js:2619`, `systems/uniqueLootAbilities.js:148` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2261` | `render/vfx.js:2644` |
| `ship:deathPop` | `render/shipMicroMotion.js:988`, `render/shipMicroMotion.js:2251` | `render/vfx.js:2643` |
| `ship:livingHullChanged` | `systems/ships.js:1820`, `systems/ships.js:1872`, `systems/story.js:2020` | `systems/barkDirector.js:612` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2777` | `ui/station/screens/shipworks.js:779` |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2674`, `systems/ships.js:2699`, `systems/ships.js:2767` | `ui/station/screens/shipworks.js:773` |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2633` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2604` | — |
| `ship:massChanged` | `systems/ships.js:2187` | `ui/hud.js:4281` |
| `ship:nameChanged` | `systems/ships.js:2361` | `ui/orrery/hudAdapter.js:242` |
| `ship:parkedHoldSwap` | `systems/ships.js:2288` | — |
| `ship:phaseBlink` | `systems/phaseBlink.js:189` | `render/phaseBlinkPresentation.js:823` |
| `ship:purchased` | `systems/ships.js:2226` | `audio/audioSystem.js:2637`, `systems/missions.js:1644` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1037`, `render/shipMicroMotion.js:2238` | `render/vfx.js:2642` |
| `ship:roleContext` | `systems/ships.js:1930` | `systems/presentationAdapters.js:208` |
| `ship:sold` | `systems/ships.js:2266` | — |
| `ship:statsChanged` | `systems/ships.js:1995` | `systems/world.js:603`, `ui/commandBar.js:410`, `ui/hud.js:4277` |
| `ship:swingDash` | `systems/flightV3.js:748` | `render/shipMicroMotion.js:1312` |
| `ship:thrust` | `systems/flight.js:435`, `systems/flightV3.js:2101` | `render/vfx.js:2616` |
| `ships:grantModule` | `systems/fenceDesk.js:259` | `systems/ships.js:1626` |
| `signal:investigate` | — | `systems/scanner.js:1008` |
| `signal:investigated` | `systems/scanner.js:1899` | `systems/missions.js:1513`, `systems/presentationOrchestrator.js:194`, `systems/story.js:158`, `systems/world.js:606`, `ui/signalInvestigationPrompt.js:176` |
| `signal:investigating` | `systems/scanner.js:1504` | `ui/signalInvestigationPrompt.js:175` |
| `signal:receipt` | `systems/scanner.js:1900` | — |
| `signal:scanResults` | `systems/scanner.js:1246` | `systems/missions.js:1498`, `systems/presentationOrchestrator.js:192`, `systems/story.js:266`, `systems/story.js:269`, `ui/signalInvestigationPrompt.js:173` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:1009` |
| `signal:track` | — | `systems/scanner.js:1007` |
| `signal:tracked` | `systems/scanner.js:1512`, `systems/scanner.js:1535` | `systems/presentationOrchestrator.js:193`, `ui/signalInvestigationPrompt.js:174` |
| `sim:pause` | `ui/screenManager.js:495` | `audio/audioSystem.js:2846`, `audio/bombAudio.js:463`, `audio/fieldAudio.js:329`, `render/feel.js:1198`, `systems/autoTargetAssist.js:166` |
| `sim:resume` | `ui/screenManager.js:502` | `audio/audioSystem.js:2847` |
| `site:anchored` | `systems/asteroidSites.js:1500` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:2567` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:2467` | `audio/audioSystem.js:2868` |
| `site:courierLost` | `systems/asteroidSites.js:2551` | — |
| `site:created` | `systems/asteroidSites.js:1438` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1847`, `systems/asteroidSites.js:1931` | — |
| `site:lost` | `systems/asteroidSites.js:2078` | `ui/alerts.js:471` |
| `site:machineInstalled` | `systems/asteroidSites.js:1469` | `audio/audioSystem.js:2867`, `ui/alerts.js:470` |
| `site:machineMode` | `systems/asteroidSites.js:1952` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1864` | `render/authoredMotion.js:1136` |
| `site:machineStatus` | `systems/asteroidSites.js:2405` | `audio/audioSystem.js:2872`, `ui/alerts.js:466` |
| `site:podBuilt` | `systems/asteroidSites.js:2350` | — |
| `site:producing` | `systems/asteroidSites.js:1730` | `render/authoredMotion.js:1135`, `ui/asteroid/asteroidScreen.js:1979` |
| `site:rematerialized` | `systems/asteroidSites.js:2130` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1648` | `ui/asteroid/asteroidScreen.js:1964` |
| `site:surveyComplete` | `systems/asteroidSites.js:1591` | `ui/asteroid/asteroidScreen.js:1958` |
| `site:surveyDetected` | `systems/asteroidSites.js:1581` | `ui/asteroid/asteroidScreen.js:1951` |
| `solstice:bloom` | `systems/solstice.js:519` | — |
| `solstice:charged` | `systems/solstice.js:449` | — |
| `solstice:destroyed` | `systems/solstice.js:361` | — |
| `solstice:voice` | `systems/solstice.js:291` | — |
| `spawn:request` | `systems/automation.js:1679` | `systems/world.js:638` |
| `station:berthAssigned` | `systems/stationServices.js:424` | — |
| `station:blockade` | `systems/economy.js:3716` | — |
| `station:boom` | `systems/economy.js:3697` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:234` | `render/vfx.js:2605` |
| `station:exitRequest` | `ui/screenManager.js:639`, `ui/uiRoot.js:1403` | `ui/station/stationApp.js:1327` |
| `station:grudge` | `systems/economy.js:3533` | — |
| `station:grudgeCleared` | `systems/economy.js:3571` | — |
| `station:holding` | `systems/stationServices.js:428` | — |
| `station:moduleGained` | `systems/claims.js:2373` | `systems/factions.js:467` |
| `station:navigate` | `ui/screens/automationPanel.js:1540`, `ui/station/screens/bar.js:786`, `ui/station/screens/bar.js:791`, `ui/station/screens/industry.js:496`, `ui/station/screens/industry.js:503` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:259` | `render/infrastructureMotion.js:204`, `render/vfx.js:2604` |
| `station:slammed` | `systems/economy.js:3476` | `systems/sectorSim.js:153` |
| `station:strike` | `systems/economy.js:3660` | — |
| `station:throughput` | `systems/claims.js:2343` | `render/authoredMotion.js:1156` |
| `station:yardChanged` | `systems/stationServices.js:585` | — |
| `stationContact:changed` | `systems/stationContacts.js:335`, `systems/stationContacts.js:371`, `systems/stationContacts.js:539`, `systems/stationContacts.js:563` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:271`, `systems/stationContacts.js:580` | — |
| `stationContact:counterDelta` | `systems/missions.js:8327` | — |
| `stationLife:deedNoticed` | `systems/stationContacts.js:500` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:359`, `systems/stationContacts.js:471` | — |
| `story:beatAdvanced` | `systems/missions.js:11609` | `save/saveSystem.js:453`, `systems/story.js:148`, `ui/screens/codex.js:846` |
| `story:continuationAccess` | `systems/story.js:2454` | — |
| `story:elroyResolved` | `systems/missions.js:6055` | `systems/story.js:149` |
| `story:kurtzLedger` | `systems/story.js:1709`, `systems/story.js:1720` | `systems/story.js:177` |
| `story:newGamePlusStarted` | `systems/story.js:1934` | `systems/titles.js:589`, `ui/hudMeta.js:129` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:2131` | `systems/story.js:175` |
| `story:postEndingContinuity` | `systems/story.js:1609` | `ui/screens/missionLog.js:2508` |
| `story:postEndingProgress` | `systems/story.js:1579` | `ui/screens/missionLog.js:2507` |
| `story:replayHookUnlocked` | `systems/story.js:1594` | `ui/screens/missionLog.js:2509` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:616` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:615` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1398` | `systems/story.js:176` |
| `story:vergeObserversRevealed` | `systems/story.js:1166` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1418` | `systems/story.js:178` |
| `stunt:bridge` | `systems/stuntGrammar.js:284` | `ui/stuntCallout.js:722` |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:269` | `ui/stuntCallout.js:721` |
| `stunt:salvageRights` | `systems/stuntGrammar.js:179` | `ui/stuntCallout.js:719` |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:203` | `ui/stuntCallout.js:720` |
| `stunt:styleBanked` | `systems/stuntGrammar.js:166` | `audio/audioSystem.js:2537`, `ui/stuntCallout.js:710` |
| `stunt:trickAmended` | — | `systems/bulletTime.js:135`, `systems/survivalResults.js:494`, `systems/titles.js:588`, `ui/stuntCallout.js:709` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:2536`, `systems/bulletTime.js:134`, `systems/killReplay.js:285`, `systems/survivalResults.js:493`, `systems/titles.js:587`, `ui/stuntCallout.js:708`, `ui/toasts.js:526` |
| `surrender:escaped` | — | `systems/combatOutcome.js:186` |
| `surrender:secured` | — | `systems/traffic.js:1655` |
| `surrender:tethered` | — | `systems/traffic.js:1654` |
| `survivalArena:installed` | — | `systems/survivalAnnounce.js:335` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1237` | — |
| `survivalWave:cohortJoined` | `systems/capitalBossRuntime.js:190` | `systems/survivalWave.js:145` |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:136` | `systems/survivorPod.js:559` |
| `survivorPod:delivered` | `systems/traffic.js:6666` | `render/authoredMotion.js:1157`, `systems/titles.js:590` |
| `survivorPod:ejected` | `systems/survivorPod.js:789`, `systems/survivorPod.js:924` | `render/authoredMotion.js:1140`, `systems/lawSecurity.js:320`, `systems/survivorPod.js:566` |
| `survivorPod:heatCooled` | `systems/heat.js:731` | — |
| `survivorPod:huntDispatched` | `ai/podHunt.js:188` | — |
| `survivorPod:huntEnded` | `ai/podHunt.js:244` | — |
| `survivorPod:promoted` | `systems/survivorPod.js:1324` | — |
| `survivorPod:ransomed` | — | `systems/fenceDesk.js:58` |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1453`, `systems/survivorPod.js:1487` | `ui/wreckChoicePrompt.js:52` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1464` | `render/authoredMotion.js:1141`, `systems/missions.js:1582` |
| `survivorPod:rescued` | — | `systems/heat.js:407`, `systems/titles.js:591`, `systems/traffic.js:1662` |
| `survivorPod:resolved` | `systems/survivorPod.js:1187` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1524` | `systems/missions.js:1584`, `ui/wreckChoicePrompt.js:51` |
| `swarm:announce` | — | `ui/swarmJuiceHud.js:90` |
| `swarm:bossDown` | — | `ui/swarmJuiceHud.js:95` |
| `swarm:bossHp` | — | `ui/swarmJuiceHud.js:94` |
| `swarm:bossIntro` | — | `ui/swarmJuiceHud.js:93` |
| `swarm:broodKills` | `systems/swarmBrood.js:1323` | `systems/survivalResults.js:487`, `systems/swarmChain.js:111`, `systems/swarmJuice.js:103` |
| `swarm:chain` | — | `audio/audioSystem.js:2541`, `systems/survivalResults.js:503`, `systems/swarmElites.js:138`, `systems/swarmJuice.js:108`, `ui/survivalHud.js:233`, `ui/swarmJuiceHud.js:96` |
| `swarm:chainBest` | — | `systems/survivalResults.js:524` |
| `swarm:chainBroken` | — | `audio/audioSystem.js:2544`, `systems/swarmElites.js:139`, `systems/swarmJuice.js:109`, `ui/survivalHud.js:234`, `ui/swarmJuiceHud.js:97` |
| `swarm:chainShatter` | — | `ui/swarmJuiceHud.js:99` |
| `swarm:chainTier` | — | `ui/swarmJuiceHud.js:98` |
| `swarm:event` | `systems/swarmEvents.js:289` | — |
| `swarm:eventTelegraphed` | `systems/swarmEvents.js:137` | — |
| `swarm:killPopup` | — | `ui/stuntCallout.js:798`, `ui/swarmJuiceHud.js:89` |
| `swarm:pressureSpend` | — | `systems/survivalResults.js:492` |
| `swarm:pressureTelegraph` | — | `systems/survivalAnnounce.js:328` |
| `swarm:roundClear` | — | `ui/swarmJuiceHud.js:92` |
| `swarm:roundSlam` | — | `ui/swarmJuiceHud.js:91` |
| `tech:researched` | `systems/ships.js:2047` | `audio/audioSystem.js:2636`, `systems/onboarding.js:657`, `systems/ships.js:1630` |
| `terrainAnchors:replenished` | `systems/terrainAnchors.js:229` | — |
| `tether:attached` | `combat/attachments.js:456` | `audio/audioSystem.js:2715`, `render/authoredMotion.js:1107`, `render/vfx.js:2521`, `systems/encounterDirector.js:327`, `systems/presentationOrchestrator.js:96`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:426`, `systems/tetherGameplay.js:1322`, `systems/tetherGameplay.js:2154` | `audio/audioSystem.js:2734`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1320`, `systems/onboarding.js:495`, `systems/onboarding.js:511`, `systems/surrenderRecovery.js:74` |
| `tether:broken` | `combat/attachments.js:574` | `audio/audioSystem.js:2706`, `render/feel.js:1359`, `render/vfx.js:2524`, `systems/presentationOrchestrator.js:104`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:299`, `systems/volatileExposure.js:217`, `ui/masslineHud.js:1130` |
| `tether:couplerLock` | `systems/tetherGameplay.js:2554` | — |
| `tether:cut` | `systems/tetherGameplay.js:1938` | `audio/audioSystem.js:2738`, `systems/gamepad.js:853`, `systems/masslineThrow.js:120`, `systems/onboarding.js:510`, `systems/onboarding.js:565` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1922` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:744`, `systems/tetherGameplay.js:345`, `systems/tetherGameplay.js:504`, `systems/tetherGameplay.js:529`, `systems/tetherGameplay.js:572`, `systems/tetherGameplay.js:577`, `systems/tetherGameplay.js:587`, `systems/tetherGameplay.js:604`, `systems/tetherGameplay.js:977` | `render/authoredMotion.js:1113`, `systems/onboarding.js:693`, `testing/lab/proofSixtySeconds.js:1530`, `ui/masslineHud.js:1086` |
| `tether:latched` | `systems/tetherGameplay.js:624` | `audio/audioSystem.js:2730`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:539`, `systems/flightV3.js:197`, `systems/gamepad.js:852`, `systems/heistFacilities.js:336`, `systems/lawSecurity.js:328`, `systems/masslineThrow.js:126`, `systems/missions.js:1527`, `systems/missions.js:1564`, `systems/missions.js:1630`, `systems/onboarding.js:490`, `systems/onboarding.js:507`, `systems/onboarding.js:554`, `systems/onboarding.js:563`, `systems/onboarding.js:705`, `systems/onboarding.js:708`, `systems/onboarding.js:720`, `systems/surrenderRecovery.js:71`, `systems/survivorPod.js:565`, `testing/lab/proofSixtySeconds.js:1531`, `ui/masslineHud.js:1100`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1601` | — |
| `tether:nearBreak` | `combat/attachments.js:949` | `audio/audioSystem.js:2727`, `systems/onboarding.js:496`, `systems/presentationOrchestrator.js:97` |
| `tether:rebound` | `combat/attachments.js:881` | `audio/audioSystem.js:2749` |
| `tether:reel` | `combat/attachments.js:508` | `audio/audioSystem.js:2704`, `systems/missions.js:1523`, `systems/onboarding.js:493`, `systems/onboarding.js:508`, `systems/surrenderRecovery.js:72` |
| `tether:reelPump` | `systems/masslineTelemetry.js:267` | `render/authoredMotion.js:1110`, `ui/stuntCallout.js:748` |
| `tether:releaseRated` | `systems/tetherGameplay.js:427`, `systems/tetherGameplay.js:1320`, `systems/tetherGameplay.js:1323`, `systems/tetherGameplay.js:1940` | `audio/audioSystem.js:2705`, `render/feel.js:1412`, `render/vfx.js:2523`, `systems/gamepad.js:854`, `systems/masslineThrow.js:123`, `systems/missions.js:1528`, `systems/presentationOrchestrator.js:163`, `systems/titles.js:592`, `ui/masslineHud.js:1108` |
| `tether:released` | `systems/tetherGameplay.js:1317`, `systems/tetherGameplay.js:1939` | `render/authoredMotion.js:1111`, `render/shipMicroMotion.js:1319`, `render/vfx.js:2522`, `systems/barkDirector.js:644`, `systems/onboarding.js:494`, `systems/onboarding.js:509`, `systems/onboarding.js:564`, `systems/surrenderRecovery.js:73`, `systems/world.js:677` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2465` | `ui/stuntCallout.js:745` |
| `tether:snagged` | `systems/tetherGameplay.js:2318` | `audio/audioSystem.js:2742` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:345` | `render/authoredMotion.js:1109`, `ui/stuntCallout.js:747` |
| `tether:strain` | `systems/tetherGameplay.js:1665` | `audio/audioSystem.js:2720`, `render/authoredMotion.js:1115` |
| `tether:tractorCapture` | `systems/tetherGameplay.js:646` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1437`, `render/vfx.js:2568`, `systems/collisionConsequences.js:94`, `systems/combat.js:701`, `systems/masslineImpactDamage.js:47`, `systems/missions.js:1529`, `systems/onboarding.js:512`, `systems/onboarding.js:566`, `systems/onboarding.js:741`, `systems/presentationOrchestrator.js:139`, `systems/tumbleStates.js:118`, `ui/stuntCallout.js:749` |
| `tether:whipSnap` | `systems/tetherGameplay.js:2062` | `systems/gamepad.js:868` |
| `title:holdResolved` | — | `systems/titles.js:581` |
| `touch:guide` | `ui/screens/pause.js:942` | — |
| `touch:uiAction` | `systems/legacyTouch.js:634` | `ui/input.js:797` |
| `towlineTable:assistAccepted` | `systems/towlineTable.js:201` | — |
| `towlineTable:assistFulfilled` | `systems/towlineTable.js:225` | — |
| `towlineTable:cleanupAccepted` | `systems/towlineTable.js:158` | — |
| `towlineTable:offer` | `systems/towlineTable.js:260` | `ui/towlineTablePrompt.js:4` |
| `traffic:anvilTransfer` | `systems/anvilWork.js:183` | — |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:2529` |
| `traffic:haulerRegroup` | `systems/traffic.js:7168` | `systems/barkDirector.js:652` |
| `traffic:oreCollected` | `systems/traffic.js:6462` | `render/authoredMotion.js:1152`, `render/npcJobSignatureVfx.js:676`, `render/npcJobSignatureVfx.js:901` |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:4207` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:11429` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:10050` | `systems/barkDirector.js:650` |
| `traffic:spillNoticed` | `systems/traffic.js:7092` | `systems/barkDirector.js:648` |
| `tutorial:finished` | `systems/onboarding.js:1571` | `systems/achievements.js:1116`, `systems/missions.js:1394`, `systems/presentationAdapters.js:211`, `systems/story.js:171` |
| `tutorial:say` | `systems/onboarding.js:1262` | `audio/audioSystem.js:2788`, `systems/story.js:208` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2375` | `systems/missions.js:1403` |
| `ui:acceptMission` | `ui/adventureDecisions.js:408`, `ui/station/screens/bar.js:723`, `ui/station/screens/contracts.js:1414` | `systems/missions.js:1402` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:4586` | `systems/ships.js:1682` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:1592` |
| `ui:buyModule` | — | `systems/onboarding.js:652`, `systems/ships.js:1675` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:5047` | `systems/bombs.js:682` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:4772` | `systems/ships.js:1661` |
| `ui:cancel` | `ui/input.js:1046`, `ui/input.js:1061` | — |
| `ui:clearTarget` | `ui/input.js:437` | `ui/uiRoot.js:1261` |
| `ui:closeAll` | `main.js:1150`, `ui/screens/crucible.js:3453`, `ui/screens/crucible.js:3466` | `ui/uiRoot.js:1259` |
| `ui:closeCargo` | `ui/input.js:260`, `ui/input.js:399` | `ui/hud.js:4251` |
| `ui:closeComms` | `ui/input.js:394` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1253` |
| `ui:confirm` | `ui/input.js:1056` | `audio/audioSystem.js:2886` |
| `ui:cycleComponent` | `ui/targetPanel.js:598`, `ui/targetPanel.js:602` | `ui/uiRoot.js:1265` |
| `ui:cycleTarget` | `ui/input.js:433`, `ui/input.js:1130` | `ui/uiRoot.js:1260` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:4632` | `systems/ships.js:1683` |
| `ui:endgameChoose` | `systems/missions.js:3724`, `ui/station/barContacts.js:1042` | `systems/story.js:221` |
| `ui:endgameConfirm` | — | `systems/story.js:222` |
| `ui:endgameDecline` | `ui/comms.js:450` | `systems/story.js:223` |
| `ui:endgameDepartAshfall` | `ui/comms.js:467` | `systems/story.js:232` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2225` | `systems/story.js:229` |
| `ui:endgameStayAshfall` | `ui/comms.js:468` | `systems/story.js:233` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2229` | `systems/story.js:230` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:231` |
| `ui:endingArchiveOpen` | `ui/screens/pause.js:967` | `systems/story.js:225` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | `systems/routeFollower.js:363` |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:82` | `systems/factionPresence.js:454` |
| `ui:fitModule` | — | `systems/onboarding.js:649`, `systems/ships.js:1676` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:5057` | `systems/bombs.js:683` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1587` | `systems/automation.js:544`, `systems/wingmen.js:143` |
| `ui:globalFind` | `ui/input.js:309`, `ui/input.js:378` | `ui/globalFind.js:183` |
| `ui:heliosBay7Scan` | — | `systems/story.js:272` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:218` | `systems/story.js:271` |
| `ui:navigate` | `ui/input.js:1032`, `ui/input.js:1037`, `ui/input.js:1103` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2973`, `ui/screens/achievements.js:212`, `ui/screens/automationPanel.js:889`, `ui/screens/clips.js:348`, `ui/screens/credits.js:177`, `ui/screens/crucible.js:2227`, `ui/screens/crucibleDraft.js:1532`, `ui/screens/demoEnd.js:195`, `ui/screens/replay.js:289`, `ui/screens/starmap.js:682`, `ui/screens/statistics.js:56`, `ui/screens/techTree.js:278` | `ui/uiRoot.js:1249` |
| `ui:prepareBombRack` | `systems/ships.js:2765`, `ui/station/screens/shipworks.js:4691` | `systems/bombs.js:693` |
| `ui:previewBombRackPreparation` | `systems/ships.js:2695`, `ui/station/screens/shipworks.js:3665`, `ui/station/screens/shipworks.js:4647` | `systems/bombs.js:690` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:707` | `systems/world.js:641` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:777` | `systems/world.js:640` |
| `ui:pushScreen` | `main.js:507`, `systems/onboarding.js:978`, `systems/story.js:1378`, `ui/mapAuthority.js:133`, `ui/screens/base.js:1285`, `ui/screens/crucible.js:3467`, `ui/screens/crucibleDraft.js:795`, `ui/screens/gameOver.js:474`, `ui/screens/starmap.js:690`, `ui/signalInvestigationPrompt.js:169`, `ui/station/barContacts.js:769`, `ui/station/screens/bar.js:740`, `ui/station/screens/industry.js:490`, `ui/station/stationApp.js:516` | `ui/uiRoot.js:1226` |
| `ui:replaceScreen` | `ui/screens/crucible.js:3414`, `ui/screens/crucible.js:3441`, `ui/screens/demoEnd.js:224`, `ui/screens/motionAsk.js:105` | `ui/uiRoot.js:1258` |
| `ui:restockBombRack` | — | `systems/bombs.js:686` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:4558` | `systems/ships.js:1681` |
| `ui:screenTop` | `ui/screenManager.js:343` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:1593` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:5067` | `systems/bombs.js:685` |
| `ui:service` | `balance/careerCohorts.js:741`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:439`, `ui/station/stationApp.js:924`, `ui/station/stationApp.js:960` | `systems/economy.js:1661` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:4777`, `ui/station/screens/shipworks.js:4895` | `systems/ships.js:1674` |
| `ui:setCourse` | `systems/borrowedSun.js:197`, `systems/factionPresence.js:1332`, `systems/ilexArk.js:33`, `systems/missions.js:4429`, `systems/palletJack.js:279`, `systems/redKite.js:61`, `systems/scanner.js:1534`, `systems/scanner.js:1566`, `systems/tallyThree.js:115`, `systems/towlineTable.js:33`, `ui/galaxyMap.js:2605`, `ui/galaxyMap.js:2620`, `ui/galaxyMap.js:7980`, `ui/market/tradeLogic.js:487`, `ui/radar.js:1620`, `ui/screens/footprint.js:1633`, `ui/screens/footprint.js:1644`, `ui/screens/localmap.js:1158`, `ui/screens/starmap.js:1567`, `ui/screens/starmap.js:1580`, `ui/screens/starmap.js:1584` | `systems/world.js:599` |
| `ui:setShipAppearance` | `ui/screens/raceBoard.js:194`, `ui/station/screens/shipworks.js:4473` | `systems/ships.js:1685` |
| `ui:setShipName` | `ui/station/screens/shipworks.js:4802` | `systems/ships.js:1688` |
| `ui:talkContact` | — | `systems/fenceDesk.js:56`, `systems/story.js:273` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:65`, `combat/autoTargetMode.js:246` | `ui/uiRoot.js:1266` |
| `ui:toggleCargo` | `ui/input.js:500` | `ui/hud.js:4250` |
| `ui:toggleComms` | `ui/input.js:519` | — |
| `ui:toggleOverview` | `ui/input.js:506` | `ui/hud.js:4794` |
| `ui:trackMission` | `ui/galaxyMap.js:4454`, `ui/screens/missionLog.js:2221`, `ui/screens/missionLog.js:2293`, `ui/screens/missionLog.js:2354`, `ui/station/screens/contracts.js:1454` | `systems/missions.js:1407` |
| `ui:transferParkedCargo` | `ui/station/screens/shipworks.js:4916` | — |
| `ui:undock` | — | `ui/input.js:796` |
| `ui:unfitModule` | — | `systems/ships.js:1677` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:5077` | `systems/bombs.js:684` |
| `ui:unlockTech` | `ui/screens/techTree.js:636` | `systems/ships.js:1684` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:4761` | `systems/bombs.js:687` |
| `ui:wingOrder` | `ui/wingmanRadial.js:258` | `systems/automation.js:545` |
| `ui:wingmanRadial` | `ui/input.js:512` | `ui/wingmanRadial.js:329` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:380` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:318` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:239` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1567` | `systems/missions.js:1597`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:choose` | `systems/missions.js:5720`, `systems/uniqueWreckEncounterScripts.js:123`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:898` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:919`, `systems/uniqueWrecks.js:1085`, `systems/uniqueWrecks.js:1273` | `systems/missions.js:1598` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1633` | `systems/missions.js:1600`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1132` | `systems/missions.js:1599` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1162` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:648`, `systems/uniqueWrecks.js:1087` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1812` | `systems/missions.js:1601`, `systems/traffic.js:1661`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `systems/traffic.js:4350`, `ui/station/screens/bar.js:757` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:769` | `systems/missions.js:1596` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1813` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1546` | `systems/world.js:646` |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1743` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1510`, `ui/bandHud.js:104` |
| `verb:used` | `systems/onboarding.js:3261` | — |
| `vesper:met` | `systems/vesper.js:172` | — |
| `vesper:note` | `systems/vesper.js:214` | — |
| `vesper:performance` | `systems/vesper.js:238` | — |
| `vesper:phraseProgress` | `systems/vesper.js:230` | — |
| `vesper:voice` | `systems/vesper.js:156` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:6569` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:609` |
| `vestaOreCache:clueRecovered` | `systems/world.js:6390` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:6421` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:6532` | — |
| `vestaOreCache:resolved` | `systems/world.js:6489` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:412`, `ui/voiceArbiter.js:456` | `ui/alerts.js:451` |
| `voice:dismiss` | `ui/bindings.js:80`, `ui/input.js:386` | `ui/voiceArbiter.js:351` |
| `voice:say` | `audio/audioSystem.js:2520`, `audio/audioSystem.js:4738`, `systems/achievements.js:949`, `systems/mines.js:97`, `systems/survivalAnnounce.js:390`, `systems/survivalAnnounce.js:661`, `systems/world.js:733`, `systems/world.js:755`, `ui/alerts.js:342`, `ui/hud.js:594` | `ui/voiceArbiter.js:350` |
| `voice:surface` | `ui/voiceArbiter.js:417`, `ui/voiceArbiter.js:466` | `systems/barkDirector.js:613`, `systems/story.js:167`, `ui/alerts.js:450` |
| `warrant:acceptPayment` | `ui/warrantOfferPrompt.js:93` | — |
| `watch:changed` | `ui/entityLinks.js:237`, `ui/entityLinks.js:281` | `ui/watchlistHud.js:89` |
| `weapons:inertialShunt` | `systems/weapons.js:393` | `ui/stuntCallout.js:754` |
| `weapons:mineArmed` | `systems/weapons.js:1807` | `audio/audioSystem.js:2486` |
| `weapons:mineDeployed` | `systems/weapons.js:1764` | `render/vfx.js:2564` |
| `weapons:mineDetonated` | `systems/weapons.js:1891` | — |
| `weapons:mineExpired` | `systems/weapons.js:1801` | `render/vfx.js:2565`, `systems/presentationOrchestrator.js:276` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:373` | `audio/audioSystem.js:2523` |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1448` | `audio/audioSystem.js:2524` |
| `weapons:vent` | `systems/weapons.js:795`, `systems/weapons.js:815` | `audio/audioSystem.js:2614`, `render/shipMicroMotion.js:1296`, `render/vfx.js:2603`, `systems/ships.js:1732`, `ui/hud.js:4323` |
| `web:linked` | `combat/tetherWebs.js:140` | — |
| `well:capture` | `systems/fields.js:2331` | — |
| `well:fling` | `systems/fields.js:2256` | `ui/stuntCallout.js:752` |
| `well:grind` | `systems/fields.js:1938` | `systems/impulseCharges.js:277` |
| `well:haulerDragged` | `systems/fields.js:2200` | `systems/traffic.js:1660` |
| `wingMorale:broken` | `systems/wingMorale.js:284` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:393` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:421` | — |
| `wingOrder:accepted` | `systems/automation.js:2172` | `systems/wingmen.js:144` |
| `wingOrder:blocked` | `systems/automation.js:2173` | `ui/wingmanRadial.js:336` |
| `wingOrder:converted` | `systems/wingmen.js:482` | `ui/wingmanRadial.js:342` |
| `wingOrder:status` | `systems/automation.js:2174` | `ui/wingmanRadial.js:346` |
| `world:abortJumpCharge` | `systems/story.js:935`, `ui/comms.js:459` | `systems/world.js:596` |
| `world:confirmUnfiledJump` | `systems/story.js:231` | `systems/world.js:595` |
| `world:criticalSpawnDeferred` | `systems/world.js:1993`, `systems/world.js:4129` | — |
| `world:farActorRestored` | `world/farActorTable.js:951` | `systems/npcJobsRuntime.js:1007`, `systems/traffic.js:1640` |
| `world:farActorShelved` | `world/farActorTable.js:897` | `systems/npcJobsRuntime.js:1006`, `systems/traffic.js:1639` |
| `world:membership` | `systems/world.js:1072` | `systems/presentationOrchestrator.js:182` |
| `world:originShift` | `systems/world.js:5184` | — |
| `world:playerRelocated` | `systems/world.js:4275` | `core/coreSystem.js:318`, `render/vfx.js:2588` |
| `world:requestJump` | `systems/story.js:919`, `ui/galaxyMap.js:2599`, `ui/screens/starmap.js:1579` | `systems/world.js:593` |
| `world:requestRoute` | `ui/galaxyMap.js:2618`, `ui/galaxyMap.js:4471`, `ui/galaxyMap.js:7978`, `ui/screens/starmap.js:1566`, `ui/screens/starmap.js:1583` | `systems/world.js:597` |
| `world:requestSectorScan` | `ui/galaxyMap.js:6350` | `systems/world.js:598` |
| `world:requestUnfiledJump` | `systems/story.js:887` | `systems/world.js:594` |
| `world:residency` | `systems/world.js:1265`, `systems/world.js:1308`, `systems/world.js:2200` | — |
| `world:spawnLimited` | `systems/world.js:4049` | — |
| `world:stuckCleared` | `systems/world.js:6090` | — |
| `world:stuckTowAccept` | `ui/stuckTowPrompt.js:52` | `systems/world.js:683` |
| `world:stuckTowOffer` | `systems/world.js:6123` | `ui/stuckTowPrompt.js:23` |
| `world:zoneEntered` | `systems/world.js:5211` | `data/hazardLanguage.js:146` |
| `world:zoneExited` | `systems/world.js:5214` | `data/hazardLanguage.js:147` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:1097` | `systems/presentationOrchestrator.js:290` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:982` | `systems/presentationOrchestrator.js:291`, `systems/traffic.js:1756` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2808` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1376` | `systems/barkDirector.js:627` |
| `wreckEcology:rivalPressured` | `systems/aftermathWrecks.js:1337` | `systems/barkDirector.js:626` |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1419` | `systems/barkDirector.js:625` |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:2518` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2730` | `systems/npcJobsRuntime.js:1037` |
| `wreckField:source` | `systems/factionPresence.js:824`, `systems/salvage.js:548`, `systems/uniqueWrecks.js:1448` | `systems/aftermathWrecks.js:1030` |
| `wreckMission:choiceApplied` | `systems/missions.js:6154` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:145` | `systems/missions.js:1580` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 3 subscriber(s)
- `achievement:unlocked` — 1 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `alienEcology:blackBoxRecovered` — 1 subscriber(s)
- `alienEcology:nurseryBloom` — 1 subscriber(s)
- `alienEcology:nurseryPowered` — 1 subscriber(s)
- `alienEcology:relaySevered` — 1 subscriber(s)
- `barkDirector:silence` — 1 subscriber(s)
- `barkDirector:voice` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `capitalBoss:telegraph` — 1 subscriber(s)
- `chronicler:radio` — 1 subscriber(s)
- `chronicler:recall` — 1 subscriber(s)
- `claim:defenseDelegate` — 1 subscriber(s)
- `claim:defenseGo` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:bankShot` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:shockwavePass` — 2 subscriber(s)
- `combat:subsystemDisabled` — 8 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `customs:weirBolt` — 1 subscriber(s)
- `deniable:fenceBurned` — 1 subscriber(s)
- `deniable:fenceEmboldened` — 1 subscriber(s)
- `drone:grindStop` — 1 subscriber(s)
- `encounter:predationTelegraph` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
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
- `law:custodyTransfer` — 1 subscriber(s)
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
- `law:playerSurrender` — 1 subscriber(s)
- `law:reportIncidentReceipt` — 3 subscriber(s)
- `law:responseDeferred` — 1 subscriber(s)
- `law:sanctuaryWithdrawal` — 1 subscriber(s)
- `law:wantedCheckpointBroken` — 1 subscriber(s)
- `law:wantedCheckpointPosted` — 1 subscriber(s)
- `law:wantedWarrantPosted` — 1 subscriber(s)
- `law:wantedWarrantReleased` — 1 subscriber(s)
- `law:witnessChoice` — 1 subscriber(s)
- `lawfulInspection:offered` — 1 subscriber(s)
- `lawfulInspection:resolved` — 1 subscriber(s)
- `lawfulInspection:scanning` — 1 subscriber(s)
- `mission:abandoned` — 1 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `moment:holyShit` — 1 subscriber(s)
- `moralMemory:remember` — 1 subscriber(s)
- `namedAce:fled` — 1 subscriber(s)
- `nav:abortRoute` — 1 subscriber(s)
- `nav:routeBrake` — 1 subscriber(s)
- `npcjobs:hold` — 1 subscriber(s)
- `npcjobs:load` — 1 subscriber(s)
- `npcjobs:unload` — 1 subscriber(s)
- `npcjobs:work` — 1 subscriber(s)
- `optic:rekindled` — 1 subscriber(s)
- `pirateDisengage:surrenderOffer` — 1 subscriber(s)
- `pirateDisengage:triggered` — 1 subscriber(s)
- `pirateDisengage:yieldResolved` — 1 subscriber(s)
- `pirateParley:resolved` — 2 subscriber(s)
- `pirateParley:started` — 1 subscriber(s)
- `postEndingReplay:cycleCompleted` — 1 subscriber(s)
- `projectile:bank` — 1 subscriber(s)
- `projectile:ricochet` — 1 subscriber(s)
- `race:abort` — 1 subscriber(s)
- `race:launchFailed` — 1 subscriber(s)
- `race:reset` — 1 subscriber(s)
- `regionalEcology:applied` — 1 subscriber(s)
- `regionalEcology:changed` — 1 subscriber(s)
- `run:arenaIntroComplete` — 1 subscriber(s)
- `run:awarded` — 1 subscriber(s)
- `run:draftResolved` — 1 subscriber(s)
- `run:ended` — 14 subscriber(s)
- `run:levelUp` — 2 subscriber(s)
- `run:modifierChosen` — 1 subscriber(s)
- `run:modifierRecordRequested` — 1 subscriber(s)
- `run:openingLessonReleased` — 1 subscriber(s)
- `run:refitClosed` — 1 subscriber(s)
- `run:resultsReady` — 2 subscriber(s)
- `run:spendRejected` — 1 subscriber(s)
- `run:spendRequested` — 1 subscriber(s)
- `run:spent` — 1 subscriber(s)
- `run:started` — 10 subscriber(s)
- `run:threatRequested` — 1 subscriber(s)
- `run:transitioned` — 6 subscriber(s)
- `run:waveCleared` — 4 subscriber(s)
- `run:waveIntroComplete` — 1 subscriber(s)
- `run:waveMaterialized` — 1 subscriber(s)
- `run:wavePlanFailed` — 1 subscriber(s)
- `run:wavePlanned` — 6 subscriber(s)
- `run:waveProgress` — 1 subscriber(s)
- `run:waveStarted` — 7 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `signal:investigate` — 1 subscriber(s)
- `signal:track` — 1 subscriber(s)
- `story:stuntIncidentRecorded` — 1 subscriber(s)
- `story:stuntIncidentUpdated` — 1 subscriber(s)
- `stunt:trickAmended` — 4 subscriber(s)
- `stunt:trickDetected` — 7 subscriber(s)
- `surrender:escaped` — 1 subscriber(s)
- `surrender:secured` — 1 subscriber(s)
- `surrender:tethered` — 1 subscriber(s)
- `survivalArena:installed` — 1 subscriber(s)
- `survivorPod:ransomed` — 1 subscriber(s)
- `survivorPod:rescued` — 3 subscriber(s)
- `swarm:announce` — 1 subscriber(s)
- `swarm:bossDown` — 1 subscriber(s)
- `swarm:bossHp` — 1 subscriber(s)
- `swarm:bossIntro` — 1 subscriber(s)
- `swarm:chain` — 6 subscriber(s)
- `swarm:chainBest` — 1 subscriber(s)
- `swarm:chainBroken` — 5 subscriber(s)
- `swarm:chainShatter` — 1 subscriber(s)
- `swarm:chainTier` — 1 subscriber(s)
- `swarm:killPopup` — 2 subscriber(s)
- `swarm:pressureSpend` — 1 subscriber(s)
- `swarm:pressureTelegraph` — 1 subscriber(s)
- `swarm:roundClear` — 1 subscriber(s)
- `swarm:roundSlam` — 1 subscriber(s)
- `title:holdResolved` — 1 subscriber(s)
- `traffic:ceresCausalChain` — 1 subscriber(s)
- `ui:buy` — 1 subscriber(s)
- `ui:buyModule` — 2 subscriber(s)
- `ui:closeScreen` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:endgameUnfiledJumpConfirm` — 1 subscriber(s)
- `ui:fitModule` — 2 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:restockBombRack` — 1 subscriber(s)
- `ui:sell` — 1 subscriber(s)
- `ui:talkContact` — 2 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `ui:unfitModule` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aftermath:causeExhausted` — 1 emitter(s)
- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:completed` — 1 emitter(s)
- `ai:egressExit` — 1 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `alienEcology:cystRupture` — 1 emitter(s)
- `alienEcology:vented` — 1 emitter(s)
- `ambush:clauseDecided` — 1 emitter(s)
- `ambush:clauseFired` — 1 emitter(s)
- `automation:assetResumed` — 1 emitter(s)
- `automation:incomeCredited` — 3 emitter(s)
- `band:bearingRequest` — 1 emitter(s)
- `band:cycle` — 2 emitter(s)
- `beam:repaired` — 1 emitter(s)
- `beam:transferred` — 1 emitter(s)
- `bombs:commanded` — 1 emitter(s)
- `bombs:denied` — 8 emitter(s)
- `bombs:redirected` — 1 emitter(s)
- `bombs:stockChanged` — 3 emitter(s)
- `borrowedSun:lost` — 1 emitter(s)
- `borrowedSun:notice` — 1 emitter(s)
- `borrowedSun:phase` — 1 emitter(s)
- `borrowedSun:route` — 1 emitter(s)
- `borrowedVoice:disposition` — 1 emitter(s)
- `borrowedVoice:dispositionAccepted` — 1 emitter(s)
- `borrowedVoice:fragmentRecovered` — 1 emitter(s)
- `bracket:bank` — 1 emitter(s)
- `bracket:matchFinished` — 1 emitter(s)
- `bracket:matchStarted` — 1 emitter(s)
- `bracket:save` — 1 emitter(s)
- `bracket:shotResolved` — 1 emitter(s)
- `bracket:voice` — 1 emitter(s)
- `camera:shake` — 18 emitter(s)
- `camera:zoom` — 5 emitter(s)
- `capitalBoss:detach` — 1 emitter(s)
- `capitalBoss:telegraphEnd` — 2 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:hotDockSpill` — 1 emitter(s)
- `cargo:parkedHoldSwapped` — 1 emitter(s)
- `cargo:parkedTransfer` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `cargo:tallyThreeDelivered` — 1 emitter(s)
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
- `charge:combo` — 2 emitter(s)
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
- `combat:actionCancelled` — 1 emitter(s)
- `combat:actionCompleted` — 1 emitter(s)
- `combat:actionPhase` — 1 emitter(s)
- `combat:kill` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `comms:message` — 3 emitter(s)
- `conflict:frontAction` — 1 emitter(s)
- `conflict:warDeclared` — 1 emitter(s)
- `contactHail:availability` — 2 emitter(s)
- `contactHail:clear` — 1 emitter(s)
- `contactHail:handoff` — 1 emitter(s)
- `contactHail:offer` — 1 emitter(s)
- `countermeasure:denied` — 1 emitter(s)
- `detonator:detonated` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `dock:committed` — 1 emitter(s)
- `ecology:claimCrew` — 1 emitter(s)
- `ecology:coherence` — 1 emitter(s)
- `ecology:setpiece` — 2 emitter(s)
- `economy:debtEscalated` — 1 emitter(s)
- `economy:demandShift` — 1 emitter(s)
- `economy:eventEnded` — 1 emitter(s)
- `encounter:claimDefenseRoster` — 1 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:hostileCommitted` — 3 emitter(s)
- `encounter:namedCaptainDefeated` — 2 emitter(s)
- `encounter:predationCleared` — 1 emitter(s)
- `encounter:scarcityRumor` — 1 emitter(s)
- `encounter:stale` — 1 emitter(s)
- `encounter:voice` — 1 emitter(s)
- `endgame:finaleCompleted` — 1 emitter(s)
- `endgame:finaleReady` — 1 emitter(s)
- `endgame:ineligible` — 3 emitter(s)
- `endgame:promptChoiceC` — 1 emitter(s)
- `endgame:promptChoiceD` — 1 emitter(s)
- `endgame:promptSandbox` — 1 emitter(s)
- `escalation:arrived` — 1 emitter(s)
- `escalation:seeded` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `factionPresence:service` — 1 emitter(s)
- `factionPresence:serviceAction` — 1 emitter(s)
- `factionPresence:spawned` — 2 emitter(s)
- `field:opportunity` — 1 emitter(s)
- `fields:deployDenied` — 1 emitter(s)
- `fields:hitchCut` — 1 emitter(s)
- `fields:hitchLatched` — 1 emitter(s)
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
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:blackMarketAccess` — 1 emitter(s)
- `frontierRumor:contacted` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `fuel:changed` — 7 emitter(s)
- `game:embarkSpeculation` — 3 emitter(s)
- `gamepad:connected` — 1 emitter(s)
- `gamepad:disconnected` — 1 emitter(s)
- `heist:capsuleResumed` — 1 emitter(s)
- `heist:counterweightSceneReceipt` — 4 emitter(s)
- `heist:launchCue` — 2 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:observed` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `heist:routineReceipt` — 1 emitter(s)
- `hullBurst:activated` — 1 emitter(s)
- `hullBurst:ended` — 1 emitter(s)
- `hullBurst:released` — 1 emitter(s)
- `ilexArk:accepted` — 1 emitter(s)
- `ilexArk:finished` — 1 emitter(s)
- `ilexArk:harvested` — 1 emitter(s)
- `ilexArk:vaultDelivered` — 1 emitter(s)
- `ilexArk:vaultReleased` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `intervention:jumperRipped` — 1 emitter(s)
- `intervention:logged` — 1 emitter(s)
- `kilnback:caskReleased` — 1 emitter(s)
- `kilnback:caskSalvaged` — 1 emitter(s)
- `kilnback:coolantReleased` — 1 emitter(s)
- `kilnback:phase` — 1 emitter(s)
- `lastShift:archive` — 1 emitter(s)
- `lastShift:archived` — 1 emitter(s)
- `lastShift:recorderReturned` — 1 emitter(s)
- `lastShift:returnRecorder` — 1 emitter(s)
- `lossInvestigation:closed` — 1 emitter(s)
- `machine:tokenDelivered` — 2 emitter(s)
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
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:podSplit` — 1 emitter(s)
- `mining:ventBonus` — 1 emitter(s)
- `mission:gateCleared` — 2 emitter(s)
- `mission:setPieceTravelLine` — 1 emitter(s)
- `mission:spawnDeferred` — 1 emitter(s)
- `mission:targetsProjected` — 1 emitter(s)
- `module:granted` — 1 emitter(s)
- `module:purchased` — 1 emitter(s)
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
- `news:headline` — 9 emitter(s)
- `news:publish` — 27 emitter(s)
- `news:render` — 1 emitter(s)
- `npcJobs:towAssistComplete` — 1 emitter(s)
- `npcjobs:closeCall` — 1 emitter(s)
- `npcjobs:crewResponse` — 1 emitter(s)
- `npcjobs:errand` — 1 emitter(s)
- `npcjobs:lotReplaced` — 1 emitter(s)
- `npcjobs:oncallTenderRetired` — 1 emitter(s)
- `npcjobs:resumed` — 1 emitter(s)
- `npcjobs:surveyMarked` — 1 emitter(s)
- `npcjobs:yardDispatchDone` — 1 emitter(s)
- `occupation:delivered` — 1 emitter(s)
- `occupation:lost` — 1 emitter(s)
- `occupation:switched` — 1 emitter(s)
- `onboarding:rangePrompt` — 2 emitter(s)
- `onboarding:rosterPrewarm` — 1 emitter(s)
- `optic:beamContact` — 1 emitter(s)
- `orrinWitness:evidenceRecovered` — 1 emitter(s)
- `orrinWitness:submitted` — 1 emitter(s)
- `pallasHiddenCache:cargoChanged` — 1 emitter(s)
- `pallasHiddenCache:clueRecovered` — 1 emitter(s)
- `pallasHiddenCache:pickupReady` — 1 emitter(s)
- `palletJack:drop` — 1 emitter(s)
- `palletJack:lost` — 1 emitter(s)
- `palletJack:phase` — 1 emitter(s)
- `palletJack:released` — 1 emitter(s)
- `palletJack:trail` — 1 emitter(s)
- `pirateDisengage:verdict` — 1 emitter(s)
- `planet:npcHarvest` — 1 emitter(s)
- `planet:registered` — 1 emitter(s)
- `planet:unregistered` — 1 emitter(s)
- `presentation:audioCue` — 2 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 2 emitter(s)
- `race:ended` — 1 emitter(s)
- `race:toggleView` — 2 emitter(s)
- `ravel:cast` — 1 emitter(s)
- `ravel:destroyed` — 1 emitter(s)
- `ravel:hit` — 1 emitter(s)
- `ravel:pacified` — 1 emitter(s)
- `ravel:telegraph` — 1 emitter(s)
- `ravel:unthreaded` — 1 emitter(s)
- `ravel:voice` — 1 emitter(s)
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
- `salvage:bayCashedIn` — 1 emitter(s)
- `salvage:changed` — 2 emitter(s)
- `salvage:cookerFlight` — 1 emitter(s)
- `salvage:coreDetonated` — 1 emitter(s)
- `salvage:reactorBurst` — 1 emitter(s)
- `salvage:reactorVented` — 1 emitter(s)
- `salvage:sortDelivered` — 1 emitter(s)
- `salvage:sortImpact` — 1 emitter(s)
- `salvage:sortLost` — 1 emitter(s)
- `salvage:sortSeparated` — 1 emitter(s)
- `scanner:ghostRevealed` — 1 emitter(s)
- `scenario:actorBindings` — 1 emitter(s)
- `scenario:dialogueLine` — 1 emitter(s)
- `scenario:factChanged` — 1 emitter(s)
- `scenario:factsInitialized` — 1 emitter(s)
- `scenario:loaded` — 1 emitter(s)
- `scenario:safeOpeningDemand` — 1 emitter(s)
- `sector:membershipCandidate` — 1 emitter(s)
- `sectorsim:tick` — 1 emitter(s)
- `service:progress` — 1 emitter(s)
- `service:queued` — 1 emitter(s)
- `ship:cargoCapChanged` — 1 emitter(s)
- `ship:loadoutPresetDeleted` — 1 emitter(s)
- `ship:loadoutPresetSaved` — 1 emitter(s)
- `ship:parkedHoldSwap` — 1 emitter(s)
- `ship:sold` — 1 emitter(s)
- `signal:receipt` — 1 emitter(s)
- `site:anchored` — 1 emitter(s)
- `site:courierDelivered` — 1 emitter(s)
- `site:courierLost` — 1 emitter(s)
- `site:created` — 1 emitter(s)
- `site:laneSpilled` — 2 emitter(s)
- `site:machineMode` — 1 emitter(s)
- `site:podBuilt` — 1 emitter(s)
- `site:rematerialized` — 1 emitter(s)
- `solstice:bloom` — 1 emitter(s)
- `solstice:charged` — 1 emitter(s)
- `solstice:destroyed` — 1 emitter(s)
- `solstice:voice` — 1 emitter(s)
- `station:berthAssigned` — 1 emitter(s)
- `station:blockade` — 1 emitter(s)
- `station:boom` — 1 emitter(s)
- `station:grudge` — 1 emitter(s)
- `station:grudgeCleared` — 1 emitter(s)
- `station:holding` — 1 emitter(s)
- `station:navigate` — 5 emitter(s)
- `station:strike` — 1 emitter(s)
- `station:yardChanged` — 1 emitter(s)
- `stationContact:changed` — 4 emitter(s)
- `stationContact:counterChanged` — 2 emitter(s)
- `stationContact:counterDelta` — 1 emitter(s)
- `stationLife:deedNoticed` — 1 emitter(s)
- `stationLife:trafficChanged` — 2 emitter(s)
- `story:continuationAccess` — 1 emitter(s)
- `story:vergeObserversRevealed` — 1 emitter(s)
- `survivalArena:rosterPrewarm` — 1 emitter(s)
- `survivorPod:heatCooled` — 1 emitter(s)
- `survivorPod:huntDispatched` — 1 emitter(s)
- `survivorPod:huntEnded` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:resolved` — 1 emitter(s)
- `swarm:event` — 1 emitter(s)
- `swarm:eventTelegraphed` — 1 emitter(s)
- `terrainAnchors:replenished` — 1 emitter(s)
- `tether:couplerLock` — 1 emitter(s)
- `tether:cutDenied` — 1 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:tractorCapture` — 1 emitter(s)
- `touch:guide` — 1 emitter(s)
- `towlineTable:assistAccepted` — 1 emitter(s)
- `towlineTable:assistFulfilled` — 1 emitter(s)
- `towlineTable:cleanupAccepted` — 1 emitter(s)
- `traffic:anvilTransfer` — 1 emitter(s)
- `traffic:passengerLinerReceipt` — 1 emitter(s)
- `traffic:passengerLinerSuspended` — 1 emitter(s)
- `ui:bulkHaulTag` — 1 emitter(s)
- `ui:bulkHaulTagCleared` — 1 emitter(s)
- `ui:cancel` — 2 emitter(s)
- `ui:closeComms` — 1 emitter(s)
- `ui:navigate` — 3 emitter(s)
- `ui:toggleComms` — 1 emitter(s)
- `ui:transferParkedCargo` — 1 emitter(s)
- `uniqueLoot:choirBellPulse` — 1 emitter(s)
- `uniqueLoot:nestbreakerSplit` — 1 emitter(s)
- `uniqueLoot:paleCoilBlink` — 1 emitter(s)
- `uniqueWreck:choose` — 3 emitter(s)
- `uniqueWreck:complicationScheduled` — 1 emitter(s)
- `uniqueWreck:encounterCompleted` — 1 emitter(s)
- `uniqueWreck:encounterRequested` — 2 emitter(s)
- `uniqueWreck:rumorHeard` — 2 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:storyRewardGranted` — 1 emitter(s)
- `verb:used` — 1 emitter(s)
- `vesper:met` — 1 emitter(s)
- `vesper:note` — 1 emitter(s)
- `vesper:performance` — 1 emitter(s)
- `vesper:phraseProgress` — 1 emitter(s)
- `vesper:voice` — 1 emitter(s)
- `vestaOreCache:cargoChanged` — 1 emitter(s)
- `vestaOreCache:clueRecovered` — 1 emitter(s)
- `vestaOreCache:pickupReady` — 1 emitter(s)
- `warrant:acceptPayment` — 1 emitter(s)
- `weapons:mineDetonated` — 1 emitter(s)
- `web:linked` — 1 emitter(s)
- `well:capture` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `world:criticalSpawnDeferred` — 2 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:residency` — 3 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
- `world:stuckCleared` — 1 emitter(s)
- `wreckEcology:decayed` — 1 emitter(s)
- `wreckEcology:seeded` — 1 emitter(s)
- `wreckMission:choiceApplied` — 1 emitter(s)
