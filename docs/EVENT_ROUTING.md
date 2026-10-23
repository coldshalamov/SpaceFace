# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-10-23 · 1509 events · 5172 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:427`, `systems/encounterDirector.js:357`, `ui/discoveryPlate.js:140` |
| `achievement:unlocked` | — | `audio/audioSystem.js:2936` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:2138` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:835` | — |
| `aftermath:custodyFreight` | `systems/aftermathWrecks.js:2024` | — |
| `aftermath:custodySurvivor` | `systems/aftermathWrecks.js:2036` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:2117` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2439` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:867` | `render/vfx.js:2709`, `systems/salvage.js:161` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1612` | `ui/galaxyMap.js:1992` |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:2227` | `systems/lawSecurity.js:397`, `systems/salvage.js:162` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:167` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:636` | `systems/presentationOrchestrator.js:168`, `systems/scissorwake.js:81`, `systems/tetherGameplay.js:350`, `ui/threatHalo.js:903` |
| `ai:egressExit` | `ai/egressExit.js:74`, `systems/missionStoryOps.js:1232` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:284` | — |
| `ai:flee` | `systems/ai.js:276`, `systems/trafficRoleOps.js:463`, `systems/wingMorale.js:331` | `render/authoredMotion.js:1186`, `render/vfx.js:2771`, `systems/barkDirector.js:791`, `systems/combatOutcome.js:259`, `systems/encounterDirector.js:394`, `systems/presentationOrchestrator.js:169` |
| `ai:formationBroken` | `systems/ai.js:454`, `systems/wingMorale.js:281` | `render/vfx.js:2772` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:793` |
| `ai:stateChange` | `systems/ai.js:273` | `render/authoredMotion.js:1203`, `systems/combatOutcome.js:295` |
| `ai:telegraph` | `ai/counterplay/live.js:138`, `systems/ai.js:350`, `systems/encounterScripts.js:172`, `systems/encounterScripts.js:1098`, `systems/masslineSnares.js:347`, `systems/mines.js:154`, `systems/tacticalAI.js:105`, `systems/tacticalAI.js:138`, `systems/tacticalAI.js:621` | `audio/audioSystem.js:2892`, `render/authoredMotion.js:1185`, `render/vfx.js:2770`, `systems/presentationOrchestrator.js:166`, `systems/scissorwake.js:74`, `systems/survivalResults.js:517`, `ui/survivalHud.js:261`, `ui/threatHalo.js:899` |
| `aiTrader:requestTrade` | `systems/trafficEscortOps.js:169` | `systems/economy.js:1737` |
| `alienEcology:blackBoxRecovered` | `systems/world.js:762` | `systems/world.js:733` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:1198` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:1255` | `systems/world.js:741` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:731` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:729` |
| `alienEcology:relaySevered` | — | `systems/world.js:730` |
| `alienEcology:relocateSite` | — | `systems/world.js:732` |
| `alienEcology:vented` | `systems/alienEcology.js:2174` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114`, `systems/economyContracts.js:787` | `systems/story.js:165` |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | `systems/story.js:166` |
| `ambush:clauseDecided` | `systems/encounterDirector.js:988` | — |
| `ambush:clauseFired` | `systems/encounterDirector.js:1179` | — |
| `anomaly:bearing` | `systems/scanner.js:1371` | `systems/presentationOrchestrator.js:198` |
| `anomaly:triangulated` | `systems/scanner.js:1389` | `systems/world.js:668` |
| `archive:indexRead` | `systems/faction_archive.js:179` | — |
| `archive:logCopied` | `systems/faction_archive.js:156` | — |
| `archive:redacted` | `systems/faction_archive.js:97` | — |
| `archive:redactionLifted` | `systems/faction_archive.js:111` | — |
| `asset:deployed` | `systems/automation.js:2650`, `systems/automation.js:2735`, `systems/automation.js:2837`, `systems/claims.js:633` | `systems/missions.js:1860`, `systems/onboarding.js:802`, `systems/story.js:252` |
| `asteroid:chunked` | `systems/environmentMaterials.js:163`, `systems/mining.js:2496` | `render/asteroidMotionPresentation.js:524`, `render/authoredMotion.js:1201`, `render/vfx.js:2741`, `systems/presentationOrchestrator.js:211` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1221`, `systems/mining.js:1195` | `audio/audioSystem.js:2732`, `render/authoredMotion.js:1200`, `render/vfx.js:2739`, `systems/environmentalMachinery.js:269`, `systems/fieldDepletion.js:755`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:467`, `render/shipMicroMotion.js:2267`, `render/trailerStaging.js:13`, `render/vfx.js:2799`, `render/vfx.js:6070`, `render/vfx.js:10891`, `render/vfx.js:12146`, `systems/ai.js:726`, `systems/alienEcology.js:591`, `systems/asteroidSites.js:3052`, `systems/barkDirector.js:1851`, `systems/barkDirector.js:1898`, `systems/beacons.js:77`, `systems/beacons.js:82`, `systems/beacons.js:94`, `systems/blindWelderRuntime.js:161`, `systems/bombs.js:1166`, `systems/bombs.js:1290`, `systems/bombs.js:1678`, `systems/bracket.js:125`, `systems/bulletTime.js:216`, `systems/bulletTime.js:234`, `systems/bulletTime.js:314`, `systems/cargo.js:1248`, `systems/cargo.js:1271`, `systems/claims.js:480`, `systems/claims.js:565`, `systems/claims.js:610`, `systems/claims.js:1789`, `systems/claims.js:1909`, `systems/claims.js:2651`, `systems/cloak.js:195`, `systems/cloak.js:208`, `systems/countermeasures.js:559`, `systems/countermeasures.js:595`, `systems/crafting.js:340`, `systems/crafting.js:350`, `systems/crafting.js:372`, `systems/discoverySound.js:25`, `systems/eighthBellRuntime.js:121`, `systems/eighthBellRuntime.js:136`, `systems/environmentalMachinery.js:1528`, `systems/fields.js:1066`, `systems/fields.js:1382`, `systems/fields.js:1502`, `systems/fields.js:1755`, `systems/flybyFocus.js:519`, `systems/glueMeetMassRuntime.js:119`, `systems/gyreSnare.js:487`, `systems/gyreSnare.js:1242`, `systems/gyreSnare.js:1646`, `systems/gyreSnare.js:1679`, `systems/gyreSnare.js:1991`, `systems/gyreSnare.js:2104`, `systems/gyreSnare.js:2186`, `systems/gyreSnare.js:2397`, `systems/gyreSnare.js:2422`, `systems/gyreSnare.js:2437`, `systems/gyreSnare.js:2450`, `systems/gyreSnare.js:2479`, `systems/gyreSnare.js:2510`, `systems/gyreSnare.js:2615`, `systems/gyreSnare.js:2634`, `systems/gyreSnare.js:2650`, `systems/gyreSnare.js:2688`, `systems/gyreSnare.js:2697`, `systems/gyreSnare.js:2714`, `systems/gyreSnare.js:2817`, `systems/gyreSnare.js:2905`, `systems/gyreSnare.js:2915`, `systems/gyreSnare.js:2958`, `systems/hullBurst.js:238`, `systems/hullBurst.js:401`, `systems/hullBurst.js:432`, `systems/hullBurst.js:546`, `systems/hullBurst.js:618`, `systems/hullFracture.js:555`, `systems/hullFracture.js:693`, `systems/impulseCharges.js:747`, `systems/impulseCharges.js:854`, `systems/impulseCharges.js:1075`, `systems/impulseCharges.js:1269`, `systems/impulseCharges.js:1383`, `systems/jettisonImpulse.js:78`, `systems/machineWork.js:214`, `systems/machineWork.js:264`, `systems/machineWork.js:323`, `systems/machineWork.js:399`, `systems/machineWork.js:481`, `systems/massSeed.js:181`, `systems/massSeed.js:554`, `systems/massSeed.js:597`, `systems/masslineThrow.js:246`, `systems/masslineThrow.js:572`, `systems/masslineThrow.js:659`, `systems/mining.js:942`, `systems/mining.js:2584`, `systems/morrow.js:201`, `systems/phaseBlink.js:209`, `systems/precursorMachines.js:194`, `systems/precursorMachines.js:579`, `systems/precursorMachines.js:669`, `systems/precursorMachines.js:1052`, `systems/precursorMachines.js:1110`, `systems/presentationAdapters.js:580`, `systems/presentationOrchestrator.js:509`, `systems/ravel.js:131`, `systems/rubric.js:302`, `systems/ruckus.js:143`, `systems/runawayKilnRuntime.js:77`, `systems/runawayKilnRuntime.js:95`, `systems/ruud.js:502`, `systems/ruud.js:506`, `systems/salvage.js:1091`, `systems/salvage.js:1193`, `systems/salvage.js:1249`, `systems/shipjack.js:77`, `systems/solstice.js:296`, `systems/tacticalAI.js:806`, `systems/theBolus.js:171`, `systems/tumbleStates.js:513`, `systems/tumbleStates.js:628`, `systems/twoShipsOneMistakeRuntime.js:193`, `systems/vesper.js:212`, `systems/volatileExposure.js:494`, `systems/volatileExposure.js:568`, `systems/weapons.js:2063`, `ui/commsRadial.js:557`, `ui/commsRadial.js:603`, `ui/commsRadial.js:807`, `ui/commsRadial.js:850`, `ui/hud.js:2295`, `ui/hud.js:3616`, `ui/hud.js:3654`, `ui/hud.js:3884`, `ui/hud.js:3944`, `ui/hud.js:3989`, `ui/hud.js:4008`, `ui/hud.js:4096`, `ui/hud.js:4181`, `ui/hud.js:4486`, `ui/input.js:375`, `ui/input.js:404`, `ui/input.js:475`, `ui/input.js:513`, `ui/input.js:519`, `ui/input.js:599`, `ui/input.js:660`, `ui/input.js:666`, `ui/input.js:672`, `ui/input.js:679`, `ui/input.js:910`, `ui/input.js:1144`, `ui/input.js:1149`, `ui/input.js:1167`, `ui/input.js:1172`, `ui/input.js:1265`, `ui/input.js:1274`, `ui/input.js:1279`, `ui/input.js:1288`, `ui/input.js:1303`, `ui/input.js:1345`, `ui/input.js:1361`, `ui/input.js:1365`, `ui/input.js:1378`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:578`, `ui/screens/base.js:1277`, `ui/screens/base.js:1527`, `ui/screens/missionLog.js:2346`, `ui/screens/missionLog.js:2350`, `ui/screens/missionLog.js:2354`, `ui/screens/missionLog.js:2358`, `ui/screens/missionLog.js:2374`, `ui/screens/missionLog.js:2382`, `ui/screens/missionLog.js:2389`, `ui/screens/missionLog.js:2396`, `ui/screens/missionLog.js:2404`, `ui/screens/missionLog.js:2411`, `ui/screens/missionLog.js:2418`, `ui/screens/missionLog.js:2427`, `ui/screens/missionLog.js:2434`, `ui/screens/missionLog.js:2450`, `ui/screens/missionLog.js:2481`, `ui/screens/missionLog.js:2501`, `ui/shipLedgerPanel.js:248`, `ui/shipLedgerPanel.js:510`, `ui/shipLedgerPanel.js:517`, `ui/station/screens/bar.js:595`, `ui/station/screens/bar.js:682`, `ui/station/screens/bar.js:686`, `ui/station/screens/bar.js:690`, `ui/station/screens/bar.js:712`, `ui/station/screens/bar.js:726`, `ui/station/screens/bar.js:763`, `ui/station/screens/bar.js:800`, `ui/station/screens/bar.js:809`, `ui/station/screens/contracts.js:1434`, `ui/station/screens/contracts.js:1445`, `ui/station/screens/contracts.js:1481`, `ui/station/screens/contracts.js:1484`, `ui/station/screens/contracts.js:1540`, `ui/station/screens/factions.js:398`, `ui/station/screens/industry.js:456`, `ui/station/screens/industry.js:506`, `ui/station/screens/industry.js:543`, `ui/station/screens/industry.js:552`, `ui/station/screens/industry.js:560`, `ui/station/screens/industry.js:566`, `ui/station/screens/industry.js:576`, `ui/station/screens/market.js:1278`, `ui/station/screens/market.js:2030`, `ui/station/screens/market.js:2100`, `ui/station/screens/market.js:2133`, `ui/station/screens/market.js:2197`, `ui/station/screens/market.js:2209`, `ui/station/screens/market.js:2405`, `ui/station/screens/shipworks.js:697`, `ui/station/screens/shipworks.js:3713`, `ui/station/screens/shipworks.js:4137`, `ui/station/screens/shipworks.js:4700`, `ui/station/screens/shipworks.js:4771`, `ui/station/screens/shipworks.js:4788`, `ui/station/screens/shipworks.js:4801`, `ui/station/screens/shipworks.js:4805`, `ui/station/screens/shipworks.js:4810`, `ui/station/screens/shipworks.js:4840`, `ui/station/screens/shipworks.js:4858`, `ui/station/screens/shipworks.js:4894`, `ui/station/screens/shipworks.js:4916`, `ui/station/screens/shipworks.js:4918`, `ui/station/screens/shipworks.js:4936`, `ui/station/screens/shipworks.js:4985`, `ui/station/screens/shipworks.js:4998`, `ui/station/screens/shipworks.js:5005`, `ui/station/screens/shipworks.js:5043`, `ui/station/screens/shipworks.js:5054`, `ui/station/screens/shipworks.js:5061`, `ui/station/screens/shipworks.js:5103`, `ui/station/screens/shipworks.js:5110`, `ui/station/screens/shipworks.js:5121`, `ui/station/screens/shipworks.js:5131`, `ui/station/screens/shipworks.js:5136`, `ui/station/screens/shipworks.js:5144`, `ui/station/screens/shipworks.js:5153`, `ui/station/screens/shipworks.js:5160`, `ui/station/screens/shipworks.js:5288`, `ui/station/screens/shipworks.js:5298`, `ui/station/screens/shipworks.js:5308`, `ui/station/screens/shipworks.js:5318`, `ui/station/screens/shipworks.js:5380`, `ui/station/screens/shipworks.js:5417`, `ui/station/screens/shipworks.js:5421`, `ui/station/screens/shipworks.js:5439`, `ui/station/screens/shipworks.js:5443`, `ui/station/screens/shipworks.js:5456`, `ui/station/screens/shipworks.js:5460`, `ui/station/stationApp.js:706`, `ui/station/stationApp.js:1026`, `ui/station/stationApp.js:1062`, `ui/station/stationLife.js:21`, `ui/toasts.js:396`, `ui/uiRoot.js:1582`, `ui/wingmanRadial.js:205`, `ui/wingmanRadial.js:227`, `ui/wingmanRadial.js:252`, `ui/wingmanRadial.js:289`, `ui/wingmanRadial.js:314`, `world/motionFossil.js:188` | `audio/audioSystem.js:3012` |
| `audio:outputDeviceChanged` | `audio/audioSystem.js:3368` | — |
| `automation:assetDistressed` | `systems/automation.js:2321` | `ui/automationPayoff.js:88` |
| `automation:assetLost` | `systems/automation.js:2943` | `systems/intervention.js:70`, `systems/lossLedger.js:444`, `systems/missions.js:1862` |
| `automation:assetRepossessed` | `systems/automation.js:2368` | `ui/automationPayoff.js:95` |
| `automation:assetResumed` | `systems/automation.js:2781` | — |
| `automation:droneDistressed` | `systems/automation.js:1647` | — |
| `automation:droneRecovered` | `systems/automation.js:1723` | — |
| `automation:incomeCredited` | `systems/automation.js:2399`, `systems/automation.js:2410`, `systems/automation.js:3224` | — |
| `automation:interact` | `systems/automation.js:3850` | — |
| `automation:offlineSummary` | `systems/automation.js:2981`, `systems/automation.js:3005`, `systems/automation.js:3029`, `systems/automation.js:3052`, `systems/automation.js:3271` | `ui/automationPayoff.js:85`, `ui/dockArrival.js:114` |
| `automation:outpostRaided` | `systems/automation.js:2241`, `systems/automation.js:3346` | `systems/lossLedger.js:445` |
| `automation:programAssigned` | `systems/automation.js:2582` | `systems/missions.js:1861`, `ui/screens/automationPanel.js:1685` |
| `automation:programInterrupted` | `systems/alphabet.js:223`, `systems/alphabet.js:588`, `systems/alphabet.js:596` | — |
| `automation:programRejected` | `systems/automation.js:2548`, `systems/automation.js:2555` | `ui/screens/automationPanel.js:1680` |
| `automation:reactionAssigned` | `systems/automation.js:2597` | — |
| `automation:reactionCleared` | `systems/automation.js:2608` | — |
| `automation:traderCycleCompleted` | `systems/automation.js:1972` | `ui/screens/automationPanel.js:994` |
| `band:bearingReceipt` | `systems/bandRadio.js:684` | `systems/presentationOrchestrator.js:199` |
| `band:bearingRequest` | `systems/bandRadio.js:657` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:878`, `systems/uniqueWrecks.js:921` | `render/authoredMotion.js:1174` |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:885`, `systems/uniqueWrecks.js:893`, `systems/uniqueWrecks.js:907` | `ui/bandHud.js:94` |
| `band:bed` | `systems/bandRadio.js:741` | `audio/audioSystem.js:3173` |
| `band:cycle` | `ui/bandHud.js:89`, `ui/input.js:552` | — |
| `band:status` | `systems/bandRadio.js:723` | `ui/bandHud.js:93` |
| `barkDirector:silence` | — | `audio/audioSystem.js:2786` |
| `barkDirector:voice` | `systems/barkDirector.js:895`, `ui/station/stationArrival.js:121`, `ui/station/stationLife.js:27`, `ui/voiceArbiter.js:898` | `audio/audioSystem.js:3129` |
| `beacon:deploy` | — | `systems/beacons.js:52` |
| `beacon:deployed` | `systems/beacons.js:89` | `render/shipMicroMotion.js:1317`, `systems/onboarding.js:960` |
| `beam:denied` | `systems/mining.js:454`, `systems/mining.js:509`, `systems/mining.js:625`, `systems/mining.js:641`, `systems/mining.js:653`, `systems/mining.js:684` | `render/authoredMotion.js:1146` |
| `beam:repaired` | `systems/mining.js:756` | — |
| `beam:transferred` | `systems/mining.js:816` | — |
| `body:sled` | — | `systems/spectrum/live.js:63` |
| `bombs:armed` | `systems/bombs.js:1224` | `audio/bombAudio.js:440` |
| `bombs:commanded` | `systems/bombs.js:1179` | `systems/fields.js:725` |
| `bombs:cycle` | `systems/bombs.js:817`, `systems/bombs.js:827`, `systems/bombs.js:1157` | `audio/bombAudio.js:469` |
| `bombs:denied` | `systems/bombs.js:684`, `systems/bombs.js:804`, `systems/bombs.js:844`, `systems/bombs.js:881`, `systems/bombs.js:920`, `systems/bombs.js:945`, `systems/bombs.js:1097`, `systems/bombs.js:1116` | — |
| `bombs:destroyed` | `systems/bombs.js:1675` | `audio/bombAudio.js:441`, `render/vfx.js:2766` |
| `bombs:detonated` | `systems/bombs.js:1283` | `audio/bombAudio.js:444`, `render/vfx.js:2764` |
| `bombs:dropped` | `systems/bombs.js:1165` | `audio/bombAudio.js:438`, `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:819` |
| `bombs:fieldEnded` | `systems/bombs.js:1574` | `audio/bombAudio.js:452`, `render/vfx.js:2765` |
| `bombs:primed` | `systems/bombs.js:1191` | `audio/bombAudio.js:439`, `ui/stuntCallout.js:830` |
| `bombs:rackChanged` | `systems/bombs.js:1047` | `audio/bombAudio.js:474` |
| `bombs:redirected` | `systems/bombs.js:1641` | — |
| `bombs:released` | `systems/bombs.js:1699` | `audio/bombAudio.js:455` |
| `bombs:stockChanged` | `systems/bombs.js:851`, `systems/bombs.js:969`, `systems/bombs.js:1162` | — |
| `borrowedSun:lost` | `systems/borrowedSun.js:206` | — |
| `borrowedSun:notice` | `systems/borrowedSun.js:159` | — |
| `borrowedSun:offer` | `systems/borrowedSun.js:193` | `ui/borrowedSunPrompt.js:5` |
| `borrowedSun:phase` | `systems/borrowedSun.js:150` | — |
| `borrowedSun:route` | `ui/borrowedSunPrompt.js:15` | — |
| `borrowedVoice:disposition` | `ui/borrowedVoicePrompt.js:16` | — |
| `borrowedVoice:dispositionAccepted` | `systems/borrowedVoice.js:131` | — |
| `borrowedVoice:fragmentRecovered` | `systems/borrowedVoice.js:97` | — |
| `borrowedVoice:offer` | `systems/borrowedVoice.js:106` | `ui/borrowedVoicePrompt.js:4` |
| `boss:defeated` | `systems/world.js:1021` | `systems/survivalAnnounce.js:351` |
| `bounty:cleared` | `systems/economy.js:4623` | `systems/heat.js:428` |
| `bounty:cooled` | `systems/heat.js:715` | `systems/barkDirector.js:814` |
| `bracket:bank` | `systems/bracket.js:182` | — |
| `bracket:matchFinished` | `systems/bracket.js:239` | — |
| `bracket:matchStarted` | `systems/bracket.js:143` | — |
| `bracket:save` | `systems/bracket.js:188` | — |
| `bracket:shotResolved` | `systems/bracket.js:227` | — |
| `bracket:voice` | `systems/bracket.js:123` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:327` | `audio/audioSystem.js:2881` |
| `bulletTime:end` | `systems/bulletTime.js:233` | `audio/audioSystem.js:3172` |
| `bulletTime:start` | `systems/bulletTime.js:215` | `audio/audioSystem.js:3169`, `systems/onboarding.js:919` |
| `calendar:festival` | `systems/worldClock.js:103` | — |
| `calendar:marketDay` | `systems/worldClock.js:121` | — |
| `calendar:rushHour` | `systems/worldClock.js:149` | — |
| `calendar:stormSeason` | `systems/worldClock.js:88` | — |
| `camera:shake` | `render/shipMicroMotion.js:2265`, `render/vfx.js:6332`, `render/vfx.js:6632`, `render/vfx.js:6978`, `systems/combat.js:970`, `systems/combat.js:1132`, `systems/combat.js:1315`, `systems/drill.js:2038`, `systems/drill.js:2153`, `systems/drill.js:2480`, `systems/flybyFocus.js:518`, `systems/gyreSnare.js:507`, `systems/gyreSnare.js:1251`, `systems/gyreSnare.js:1673`, `systems/gyreSnare.js:2809`, `systems/gyreSnare.js:2898`, `systems/intervention.js:259`, `systems/presentationAdapters.js:493`, `systems/survivalAnnounce.js:604`, `systems/tetherGameplay.js:777` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:749`, `ui/input.js:753`, `ui/input.js:994` | — |
| `capitalBoss:actChanged` | — | `ui/toasts.js:747` |
| `capitalBoss:countered` | — | `ui/toasts.js:756` |
| `capitalBoss:detach` | `systems/missions.js:1882` | — |
| `capitalBoss:disarmed` | — | `ui/toasts.js:758` |
| `capitalBoss:ended` | — | `ui/toasts.js:773` |
| `capitalBoss:hit` | — | `ui/toasts.js:765` |
| `capitalBoss:recovery` | — | `ui/toasts.js:757` |
| `capitalBoss:start` | `systems/missionObjectiveOps.js:1901` | `systems/swarmJuice.js:166` |
| `capitalBoss:started` | — | `ui/toasts.js:740` |
| `capitalBoss:telegraph` | — | `render/authoredMotion.js:1202`, `ui/toasts.js:728` |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:231`, `systems/capitalBossEncounters.js:254` | — |
| `captain:remembered` | `systems/captainMemory.js:86` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:788` | `systems/world.js:670` |
| `cargo:changed` | `systems/cargo.js:386`, `systems/mining.js:2826` | `audio/audioSystem.js:2810`, `systems/onboarding.js:750`, `systems/ships.js:1714`, `ui/cargoConscience.js:143`, `ui/commandBar.js:412` |
| `cargo:delivered` | `systems/asteroidSites.js:3430`, `systems/missions.js:4418`, `systems/missions.js:4477`, `systems/missions.js:4586`, `systems/missions.js:4636` | `systems/economy.js:1749` |
| `cargo:fragileLost` | `systems/fragileCargo.js:256` | — |
| `cargo:full` | `systems/cargo.js:494`, `systems/cargo.js:746`, `systems/mining.js:1789`, `systems/mining.js:2804` | `audio/audioSystem.js:2811`, `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:753`, `systems/presentationOrchestrator.js:219`, `ui/alerts.js:585` |
| `cargo:hotDockSpill` | `systems/cargo.js:1196` | — |
| `cargo:jettison` | `ui/hud.js:3624` | — |
| `cargo:jettisoned` | `systems/cargo.js:1424` | `audio/audioSystem.js:2849`, `render/authoredMotion.js:1211`, `render/shipMicroMotion.js:1315`, `systems/barkDirector.js:802`, `systems/jettisonImpulse.js:54`, `systems/lawSecurity.js:419`, `systems/onboarding.js:901`, `systems/onboarding.js:968` |
| `cargo:massSettled` | `systems/cargo.js:919` | `systems/presentationOrchestrator.js:218`, `systems/ships.js:1715` |
| `cargo:parkedHoldSwapped` | `systems/cargo.js:1073` | `systems/shipControlTransfer.js:132` |
| `cargo:parkedTransfer` | `systems/cargo.js:1135` | — |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:podIntake` | `systems/economy.js:3744` | `systems/economy.js:1759` |
| `cargo:tallyThreeDelivered` | `systems/economy.js:4092` | — |
| `cargo:vesselFreightReleased` | `systems/cargo.js:1327` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:958` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:994` | — |
| `cargo:volatileExposed` | `systems/volatileExposure.js:384` | — |
| `cargo:volatileRupture` | `systems/volatileExposure.js:548` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:878`, `systems/lootShards.js:934` | `systems/volatileExposure.js:218` |
| `cargo:volatileVent` | `systems/volatileExposure.js:472` | — |
| `ceresWorkfleet:interrupted` | `systems/ceresWorkfleet.js:304` | — |
| `chain:detonated` | `systems/impulseCharges.js:1055` | `systems/fields.js:714` |
| `chain:primeEnded` | `systems/impulseCharges.js:1018` | — |
| `chain:primed` | `systems/impulseCharges.js:995` | — |
| `chain:slam` | `systems/impulseCharges.js:929`, `systems/impulseCharges.js:949` | `systems/fields.js:713` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1192`, `systems/tetherGameplay.js:2499` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:1265` | `systems/onboarding.js:927` |
| `charge:armed` | `systems/impulseCharges.js:1092` | — |
| `charge:combo` | `systems/impulseCharges.js:1307`, `systems/impulseCharges.js:1366` | `systems/tetherGameplay.js:355` |
| `charge:detonated` | `systems/impulseCharges.js:738`, `systems/impulseCharges.js:846`, `systems/impulseCharges.js:1067`, `systems/impulseCharges.js:1374` | `audio/audioSystem.js:2906`, `render/feel.js:1418`, `render/vfx.js:2762`, `systems/fields.js:715`, `systems/fields.js:726`, `systems/flightV3.js:232`, `systems/gamepad.js:999` |
| `charge:stuck` | `systems/impulseCharges.js:1173` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1314` |
| `charge:thrown` | `systems/impulseCharges.js:1252` | `render/ordnanceMotionPresentation.js:261` |
| `choir:bellHeadRing` | `systems/faction_choir.js:209` | — |
| `choir:bellPulse` | `systems/faction_choir.js:74` | — |
| `choir:crystalShattered` | `systems/faction_choir.js:92` | — |
| `choir:relicAlarm` | `systems/faction_choir.js:165` | — |
| `choir:relicCracked` | `systems/faction_choir.js:133` | — |
| `choir:relicPing` | `systems/faction_choir.js:151` | — |
| `choir:tribute` | `systems/faction_choir.js:174` | — |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:22` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:23` |
| `claim:claimed` | `systems/claims.js:479` | `systems/onboarding.js:808`, `systems/story.js:261`, `systems/traffic.js:2147` |
| `claim:convoyAbandoned` | `systems/claims.js:1485`, `systems/claims.js:1603` | `systems/traffic.js:2150` |
| `claim:convoyDocked` | `systems/trafficConvoyOps.js:210` | `systems/claims.js:435` |
| `claim:convoyManifested` | `systems/trafficConvoyOps.js:110` | `systems/claims.js:434` |
| `claim:defenseDelegate` | — | `systems/claims.js:426` |
| `claim:defenseDelegateRefused` | `systems/claims.js:1982` | — |
| `claim:defenseEncounterRequested` | `systems/claims.js:1864` | — |
| `claim:defenseGo` | — | `systems/claims.js:425` |
| `claim:defenseIgnore` | — | `systems/claims.js:421` |
| `claim:defenseResolved` | `systems/claims.js:2064` | `ui/encounterChoicePrompt.js:133` |
| `claim:defenseStarted` | `systems/claims.js:1874` | `ui/encounterChoicePrompt.js:132` |
| `claim:defenseWarning` | `systems/claims.js:1771`, `systems/claims.js:1889` | `systems/encounterDirector.js:367`, `ui/encounterChoicePrompt.js:129` |
| `claim:depotPatrolCompleted` | `systems/claims.js:3243` | `systems/factions.js:515` |
| `claim:depotPatrolRotation` | `systems/claims.js:3199` | — |
| `claim:depotPatrolSpent` | `systems/claims.js:1969` | — |
| `claim:depotSupport` | `systems/claims.js:3110`, `systems/claims.js:3136` | — |
| `claim:freightDelivered` | `systems/trafficConvoyOps.js:421` | — |
| `claim:infrastructureActive` | `systems/claims.js:1260`, `systems/claims.js:2897` | `systems/traffic.js:2145` |
| `claim:infrastructureConstructed` | `systems/claims.js:546`, `systems/claims.js:2834` | — |
| `claim:infrastructureStatus` | `systems/claims.js:1271` | `systems/traffic.js:2146` |
| `claim:moduleBuilt` | `systems/claims.js:564` | — |
| `claim:raidRepelled` | `systems/claims.js:1720` | — |
| `claim:raidWarning` | `systems/claims.js:1713` | `audio/audioSystem.js:2874` |
| `claim:receipt` | `systems/claims.js:2296` | — |
| `claim:sensorPostRumor` | `systems/claims.js:1320` | `systems/world.js:706` |
| `claim:specialized` | `systems/claims.js:605` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:3400` | — |
| `claims:migrated` | `systems/claims.js:2473` | — |
| `cloak:burned` | `systems/cloak.js:267` | `audio/audioSystem.js:2739` |
| `cloak:dropped` | `systems/cloak.js:207` | `audio/audioSystem.js:2734`, `render/authoredMotion.js:1206`, `render/shipMicroMotion.js:1311` |
| `cloak:engaged` | `systems/cloak.js:194` | `render/authoredMotion.js:1205`, `render/shipMicroMotion.js:1310`, `systems/gamepad.js:1004`, `systems/onboarding.js:923` |
| `cloak:faded` | `systems/aiPorts.js:1187` | `audio/audioSystem.js:2733` |
| `coldburnRey:playerDelivered` | `systems/missions.js:5028` | — |
| `coldburnRey:raceSettled` | `systems/coldburnRey.js:91` | — |
| `collision:tearOff` | `systems/hullFracture.js:684` | `render/vfx.js:2681` |
| `combat:actionCancelled` | `combat/actions.js:373` | — |
| `combat:actionCompleted` | `combat/actions.js:359` | — |
| `combat:actionPhase` | `combat/actions.js:222` | — |
| `combat:actionRejected` | `combat/actions.js:395` | `ui/toasts.js:784` |
| `combat:actionStarted` | `combat/actions.js:189` | `systems/presentationOrchestrator.js:171`, `systems/scenarioRuntime.js:23` |
| `combat:aftermathChoices` | `systems/combatOutcome.js:480`, `systems/combatOutcome.js:549`, `systems/combatOutcome.js:561` | `ui/aftermathChoicePrompt.js:41` |
| `combat:aftermathChoose` | `ui/aftermathChoicePrompt.js:36` | `systems/combatOutcome.js:289` |
| `combat:aftermathChosen` | `systems/combatOutcome.js:255` | — |
| `combat:bankShot` | — | `render/vfx.js:2669` |
| `combat:baseDestroyed` | `systems/combat.js:1118` | `systems/economy.js:1826`, `systems/gamepad.js:1109` |
| `combat:beamStop` | `systems/weapons.js:1392` | `audio/audioSystem.js:2660`, `render/asteroidMotionPresentation.js:523`, `render/vfx.js:2665` |
| `combat:bounceContinued` | `combat/attackHit.js:36` | `render/vfx.js:2670`, `systems/presentationOrchestrator.js:262` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:496` | `render/feel.js:1453`, `render/vfx.js:2679`, `systems/economy.js:1828`, `systems/fields.js:717`, `systems/gamepad.js:991`, `systems/lawSecurity.js:392` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:515` | `render/vfx.js:2680` |
| `combat:damage` | `combat/damage.js:428` | `audio/audioSystem.js:2675`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `render/asteroidMotionPresentation.js:516`, `render/authoredMotion.js:1162`, `render/feel.js:1249`, `render/shipMicroMotion.js:1297`, `render/vfx.js:2671`, `save/saveSystem.js:527`, `systems/ai.js:108`, `systems/aiEncounter.js:136`, `systems/asteroidSites.js:848`, `systems/barkDirector.js:797`, `systems/collisionConsequences.js:104`, `systems/combatOutcome.js:294`, `systems/cruise.js:60`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:348`, `systems/factionPresence.js:535`, `systems/gamepad.js:1117`, `systems/heat.js:376`, `systems/lawSecurity.js:391`, `systems/missions.js:1846`, `systems/npcJobsRuntime.js:1127`, `systems/onboarding.js:695`, `systems/onboarding.js:706`, `systems/onboarding.js:718`, `systems/presentationOrchestrator.js:165`, `systems/salvageActions.js:139`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1825`, `systems/stationBroadcast.js:233`, `systems/survivalResults.js:510`, `systems/survivalWave.js:190`, `systems/swarmJuice.js:160`, `systems/titles.js:582`, `systems/traffic.js:2065`, `systems/volatileExposure.js:216`, `ui/alerts.js:569`, `ui/commandBar.js:401`, `ui/uiRoot.js:929` |
| `combat:emp` | `combat/damage.js:430` | — |
| `combat:fire` | `systems/impulseCharges.js:780`, `systems/weapons.js:1276`, `systems/weapons.js:1371`, `systems/weapons.js:1588`, `systems/weapons.js:1924` | `audio/audioSystem.js:2659`, `data/stationBubbles.js:182`, `render/farPlaneLife.js:65`, `render/feel.js:1354`, `render/shipMicroMotion.js:1295`, `render/vfx.js:2664`, `systems/asteroidSites.js:669`, `systems/cloak.js:53`, `systems/cruise.js:68`, `systems/lawSecurity.js:393`, `systems/onboarding.js:612`, `systems/onboarding.js:625`, `systems/presentationOrchestrator.js:170`, `systems/story.js:266`, `systems/traffic.js:2066`, `systems/world.js:739` |
| `combat:hit` | `systems/salvageActions.js:617`, `systems/salvageActions.js:708` | `render/farPlaneLife.js:64`, `systems/routeFollower.js:420`, `systems/story.js:267` |
| `combat:hitAsset` | `systems/wingmen.js:219` | `systems/automation.js:600` |
| `combat:kill` | `systems/world.js:6326` | `systems/factionPresence.js:543` |
| `combat:lockChanged` | `systems/weapons.js:998` | `systems/onboarding.js:731`, `systems/world.js:663`, `ui/alerts.js:578` |
| `combat:outcome` | `systems/combatOutcome.js:457` | `systems/barkDirector.js:794` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:458` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:5870`, `systems/npcJobsRuntime.js:6127` | `combat/kernel.js:204` |
| `combat:requestAction` | — | `combat/kernel.js:201` |
| `combat:routeDamage` | `systems/bombs.js:1635`, `systems/capitalBossEncounters.js:108`, `systems/drill.js:2492`, `systems/foldAberrant.js:173`, `systems/hullBurst.js:554`, `systems/impulseCharges.js:1606`, `systems/mines.js:319`, `systems/missionObjectiveOps.js:2256`, `systems/theBolus.js:161`, `systems/tumbleStates.js:565` | `combat/kernel.js:203`, `systems/routeFollower.js:421` |
| `combat:shipjackPulse` | `combat/kernel.js:468` | — |
| `combat:shipjackShutdown` | `combat/kernel.js:483` | — |
| `combat:shockwavePass` | — | `render/asteroidMotionPresentation.js:518`, `render/vfx.js:2769` |
| `combat:shove` | `systems/onboarding.js:3030` | `audio/audioSystem.js:2886`, `systems/onboarding.js:624` |
| `combat:statusApplied` | `combat/statuses.js:212` | `render/vfx.js:2682`, `ui/stuntCallout.js:796` |
| `combat:statusExpired` | `combat/statuses.js:90`, `systems/bombs.js:1612` | `audio/bombAudio.js:464`, `systems/tumbleStates.js:130`, `ui/stuntCallout.js:817` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:260`, `systems/encounterDirector.js:339`, `systems/factionPresence.js:533`, `systems/npcJobsRuntime.js:1130`, `systems/presentationOrchestrator.js:241`, `systems/surrenderRecovery.js:96`, `systems/tumbleStates.js:134`, `systems/wingMorale.js:202` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1313`, `systems/factionPresence.js:534`, `systems/npcJobsRuntime.js:1131`, `systems/presentationOrchestrator.js:250`, `systems/surrenderRecovery.js:97` |
| `combat:surrendered` | — | `systems/combatOutcome.js:261`, `systems/surrenderRecovery.js:95` |
| `combat:tumbleRake` | `systems/tumbleStates.js:553` | `systems/barkDirector.js:852` |
| `combat:tumbled` | `systems/tumbleStates.js:511` | `systems/fields.js:716`, `systems/missions.js:1746`, `systems/tetherGameplay.js:349` |
| `combat:warded` | `combat/damage.js:392` | `audio/audioSystem.js:2772` |
| `combat:weakPointHit` | `systems/combat.js:1031` | `render/vfx.js:2672` |
| `comms:log` | `data/boundaryField.js:42`, `data/curlField.js:41`, `data/encounters/344-opening-hauler-raid.js:37`, `data/encounters/344-opening-hauler-raid.js:337`, `data/encounters/350-the-long-tail.js:175`, `data/encounters/350-the-long-tail.js:209`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:155`, `data/encounters/352-the-slot.js:175`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:138`, `data/encounters/355-the-winnow-throw.js:155`, `data/encounters/355-the-winnow-throw.js:162`, `data/encounters/355-the-winnow-throw.js:179`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:183`, `data/encounters/357-the-handoff.js:197`, `data/encounters/357-the-handoff.js:222`, `data/encounters/357-the-handoff.js:262`, `data/encounters/357-the-handoff.js:278`, `data/encounters/358-the-press-camp.js:56`, `data/encounters/358-the-press-camp.js:201`, `data/encounters/358-the-press-camp.js:214`, `data/encounters/362-the-salvage-watch.js:275`, `data/encounters/367-the-salvage-tail.js:180`, `data/encounters/585-candle-relighting.js:143`, `data/encounters/585-candle-relighting.js:151`, `data/encounters/700-the-weighing.js:142`, `data/encounters/700-the-weighing.js:227`, `data/encounters/701-spine-break.js:139`, `data/encounters/701-spine-break.js:155`, `data/encounters/701-spine-break.js:192`, `data/encounters/701-spine-break.js:208`, `data/encounters/702-the-swap.js:55`, `data/encounters/702-the-swap.js:180`, `data/encounters/702-the-swap.js:201`, `data/encounters/703-too-perfect-pack.js:117`, `data/encounters/703-too-perfect-pack.js:162`, `data/encounters/704-claim-jump.js:128`, `data/encounters/704-claim-jump.js:145`, `data/encounters/705-the-nest.js:135`, `data/encounters/705-the-nest.js:168`, `data/encounters/705-the-nest.js:202`, `data/laneField.js:53`, `data/laneField.js:65`, `data/velocityPlane.js:46`, `systems/alienEcology.js:588`, `systems/alienEcology.js:617`, `systems/alienEcology.js:640`, `systems/alienEcology.js:684`, `systems/alienEcology.js:694`, `systems/alienEcology.js:715`, `systems/alienEcology.js:722`, `systems/alienEcology.js:741`, `systems/alienEcology.js:1076`, `systems/alienEcology.js:1267`, `systems/alienEcology.js:1385`, `systems/alienEcology.js:1418`, `systems/alienEcology.js:1460`, `systems/alienEcology.js:1493`, `systems/alienEcology.js:1498`, `systems/alienEcology.js:1559`, `systems/alienEcology.js:1637`, `systems/alienEcology.js:1649`, `systems/alienEcology.js:1702`, `systems/alienEcology.js:2029`, `systems/alienEcology.js:2108`, `systems/alienEcology.js:2449`, `systems/alienEcology.js:2477`, `systems/alienEcology.js:2755`, `systems/alienEcology.js:2783`, `systems/alienEcology.js:2794`, `systems/alienEcology.js:2853`, `systems/alienEcology.js:2895`, `systems/alienEcology.js:3098`, `systems/alphabet.js:235`, `systems/asteroidSites.js:1861`, `systems/automation.js:3835`, `systems/contractClauses.js:774`, `systems/encounterDirector.js:3038`, `systems/encounterScripts.js:760`, `systems/encounterScripts.js:3483`, `systems/encounterScripts.js:3742`, `systems/faction_archive.js:101`, `systems/faction_archive.js:113`, `systems/faction_archive.js:159`, `systems/faction_archive.js:180`, `systems/faction_choir.js:114`, `systems/faction_choir.js:134`, `systems/faction_choir.js:154`, `systems/faction_choir.js:168`, `systems/faction_concord.js:159`, `systems/faction_frontier.js:77`, `systems/faction_frontier.js:125`, `systems/faction_frontier.js:151`, `systems/faction_frontier.js:198`, `systems/faction_fulfillment.js:197`, `systems/faction_fulfillment.js:206`, `systems/faction_fulfillment.js:255`, `systems/faction_fulfillment.js:259`, `systems/faction_fulfillment.js:273`, `systems/faction_fulfillment.js:286`, `systems/faction_fulfillment.js:325`, `systems/faction_fulfillment.js:352`, `systems/faction_helix.js:109`, `systems/faction_helix.js:143`, `systems/faction_meridian.js:116`, `systems/faction_pitborn.js:149`, `systems/faction_pitborn.js:210`, `systems/faction_pitborn.js:230`, `systems/faction_pitborn.js:234`, `systems/faction_pitborn.js:237`, `systems/faction_pitborn.js:282`, `systems/faction_understory.js:202`, `systems/faction_understory.js:292`, `systems/faction_vael.js:67`, `systems/faction_vael.js:87`, `systems/faction_vael.js:125`, `systems/faction_vael.js:201`, `systems/faction_vael.js:202`, `systems/faction_vael.js:222`, `systems/faction_verge.js:74`, `systems/faction_verge.js:105`, `systems/faction_verge.js:136`, `systems/faction_verge.js:165`, `systems/faction_verge.js:175`, `systems/faction_verge.js:201`, `systems/faction_verge.js:224`, `systems/factions.js:578`, `systems/foldAberrant.js:44`, `systems/machineWork.js:14`, `systems/missionObjectiveOps.js:1185`, `systems/morrow.js:253`, `systems/precursorMachines.js:65`, `systems/precursorMachines.js:132`, `systems/precursorMachines.js:165`, `systems/precursorMachines.js:172`, `systems/precursorMachines.js:185`, `systems/precursorMachines.js:191`, `systems/precursorMachines.js:409`, `systems/precursorMachines.js:422`, `systems/precursorMachines.js:440`, `systems/precursorMachines.js:464`, `systems/precursorMachines.js:487`, `systems/precursorMachines.js:503`, `systems/precursorMachines.js:517`, `systems/precursorMachines.js:529`, `systems/precursorMachines.js:536`, `systems/precursorMachines.js:552`, `systems/precursorMachines.js:612`, `systems/precursorMachines.js:708`, `systems/precursorMachines.js:727`, `systems/precursorMachines.js:749`, `systems/precursorMachines.js:783`, `systems/precursorMachines.js:798`, `systems/precursorMachines.js:830`, `systems/precursorMachines.js:858`, `systems/precursorMachines.js:906`, `systems/precursorMachines.js:1025`, `systems/precursorMachines.js:1039`, `systems/precursorMachines.js:1085`, `systems/precursorMachines.js:1099`, `systems/precursorMachines.js:1165`, `systems/precursorMachines.js:1218`, `systems/precursorMachines.js:1226`, `systems/salvage.js:181`, `systems/salvage.js:980`, `systems/salvage.js:1051`, `systems/salvage.js:1085`, `systems/salvage.js:1247`, `systems/shipjack.js:71`, `systems/towlineTable.js:265`, `systems/vesper.js:254`, `systems/worldPressure.js:238`, `systems/worldPressure.js:286`, `world/motionFossil.js:41`, `world/playerHullEcho.js:100`, `world/playerHullEcho.js:111`, `world/playerHullEcho.js:133` | `ui/floatingText.js:117` |
| `comms:message` | `systems/precursorMachines.js:313`, `systems/trafficRoleOps.js:240`, `systems/trafficRoleOps.js:1211`, `systems/trafficRoleOps.js:1336` | — |
| `comms:popup` | `systems/ai.js:509`, `systems/careerContracts.js:456`, `systems/careerContracts.js:470`, `systems/careerContracts.js:486`, `systems/coldburnRey.js:64`, `systems/crew.js:97`, `systems/crew.js:158`, `systems/crew.js:189`, `systems/crew.js:210`, `systems/crew.js:224`, `systems/crew.js:236`, `systems/factionPresence.js:828`, `systems/factionPresence.js:1497`, `systems/factionPresence.js:1548`, `systems/factionPresence.js:1563`, `systems/impoundGrudge.js:175`, `systems/mail.js:198`, `systems/memorialThief.js:102`, `systems/missionObjectiveOps.js:183`, `systems/missionSpawningOps.js:448`, `systems/missionSpawningOps.js:761`, `systems/missionSpawningOps.js:890`, `systems/missionSpawningOps.js:904`, `systems/missionSpawningOps.js:915`, `systems/missionSpawningOps.js:1115`, `systems/missionSpawningOps.js:1177`, `systems/missionStoryOps.js:127`, `systems/missionStoryOps.js:1281`, `systems/missionStoryOps.js:1323`, `systems/missionStoryOps.js:1846`, `systems/missions.js:4802`, `systems/missions.js:4923`, `systems/missions.js:5051`, `systems/onboarding.js:1420`, `systems/scenarioRuntime.js:186`, `systems/story.js:571`, `systems/story.js:1357`, `systems/story.js:1385`, `systems/worldClock.js:165`, `ui/station/screens/bar.js:776` | `audio/audioSystem.js:2995`, `ui/screens/codex.js:902` |
| `concord:clampAttached` | `systems/faction_concord.js:220` | — |
| `concord:clampReleased` | `systems/faction_concord.js:198` | — |
| `concord:formationLocked` | `systems/faction_concord.js:153` | — |
| `concord:formationReformed` | `systems/faction_concord.js:177` | — |
| `conflict:flip` | `systems/factions.js:872` | `systems/factionPresence.js:542`, `systems/gateControlDirector.js:79`, `systems/sectorSim.js:148`, `systems/story.js:256` |
| `conflict:frontAction` | `systems/factions.js:755` | — |
| `conflict:warDeclared` | `systems/factions.js:812` | — |
| `contactHail:availability` | `systems/scanner.js:1912`, `systems/scanner.js:1929` | — |
| `contactHail:choice` | `ui/commsRadial.js:551`, `ui/contactHailPrompt.js:174` | `systems/scanner.js:1074` |
| `contactHail:clear` | `systems/scanner.js:1940` | — |
| `contactHail:handoff` | `systems/scanner.js:1675` | — |
| `contactHail:offer` | `systems/scanner.js:1699` | — |
| `contactHail:request` | `ui/commsRadial.js:604`, `ui/contactHailPrompt.js:168` | `systems/scanner.js:1073` |
| `contactHail:response` | `systems/scanner.js:1722`, `systems/scanner.js:1742` | `systems/traffic.js:2052` |
| `contraband:bribe` | `systems/encounterScripts.js:423`, `ui/customsPrompt.js:249` | `systems/economy.js:1822` |
| `contraband:scanned` | `systems/economy.js:5502` | `systems/encounterDirector.js:349`, `systems/factions.js:495`, `systems/heat.js:381`, `systems/lawSecurity.js:403`, `systems/lawSecurity.js:420`, `ui/customsPrompt.js:155` |
| `contract:clauseBroken` | `systems/contractClauses.js:787` | `systems/missions.js:1804` |
| `contract:clauseHonored` | `systems/contractClauses.js:706`, `systems/missions.js:5065` | `systems/contractClauses.js:385` |
| `contract:clauseSettledKill` | `systems/contractClauses.js:563` | `systems/missions.js:1685` |
| `countermeasure:denied` | `systems/countermeasures.js:572` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:554` | `render/shipMicroMotion.js:1316` |
| `counterplay:encountered` | `ai/counterplay/adventure.js:82` | `ui/toasts.js:617` |
| `craft:cancelled` | `systems/crafting.js:370` | — |
| `craft:complete` | `systems/crafting.js:339`, `systems/crafting.js:411` | `ui/station/screens/industry.js:587` |
| `craft:queueChanged` | `systems/crafting.js:200`, `systems/crafting.js:224`, `systems/crafting.js:349`, `systems/crafting.js:371` | `render/authoredMotion.js:1172`, `systems/onboarding.js:813`, `ui/station/screens/industry.js:587` |
| `credits:changed` | `systems/economy.js:4181`, `systems/economy.js:4193` | `audio/audioSystem.js:2834`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:413` |
| `crew:decline` | `ui/crewPrompt.js:38` | `systems/crew.js:53` |
| `crew:hire` | `ui/crewPrompt.js:35` | `systems/crew.js:52` |
| `crew:hired` | `systems/crew.js:161` | — |
| `crew:injured` | `systems/crew.js:240` | — |
| `crew:lost` | `systems/crew.js:228` | — |
| `crew:loyalty` | `systems/crew.js:192` | — |
| `crew:recruitOffer` | `systems/crew.js:133` | `ui/crewPrompt.js:49` |
| `cruise:charging` | `systems/cruise.js:164` | `render/vfx.js:2759`, `systems/presentationOrchestrator.js:178` |
| `cruise:dropped` | `systems/cruise.js:235` | `audio/audioSystem.js:2983`, `render/authoredMotion.js:1179`, `render/vfx.js:2761`, `systems/presentationOrchestrator.js:180` |
| `cruise:engaged` | `systems/cruise.js:126` | `audio/audioSystem.js:2979`, `render/vfx.js:2760`, `systems/presentationOrchestrator.js:179` |
| `cruise:snareRequest` | `systems/encounterScripts.js:592` | `render/authoredMotion.js:1178`, `systems/cruise.js:72` |
| `cruise:snared` | `systems/cruise.js:234` | `audio/audioSystem.js:2987` |
| `cruise:wrestleEscaped` | `systems/cruise.js:138` | — |
| `cruise:wrestleStarted` | `systems/cruise.js:80` | — |
| `custody:aftermathChanged` | — | `systems/combatOutcome.js:290` |
| `custody:aftermathSettled` | — | `systems/aftermathWrecks.js:1082` |
| `customs:breakScan` | `ui/customsPrompt.js:254` | `render/authoredMotion.js:1190` |
| `customs:massSlipFiled` | — | `systems/economyContracts.js:267` |
| `customs:scanAborted` | — | `ui/customsPrompt.js:156` |
| `customs:scanWaived` | — | `ui/customsPrompt.js:158` |
| `customs:submit` | `ui/customsPrompt.js:232` | `render/authoredMotion.js:1189`, `systems/lawSecurity.js:416` |
| `customs:trustMarked` | — | `ui/customsPrompt.js:157` |
| `customs:weirBolt` | — | `systems/economy.js:1821`, `systems/heat.js:396` |
| `danger:miningNoise` | `systems/mining.js:2838` | `audio/audioSystem.js:2779` |
| `day:tick` | `core/coreSystem.js:615` | `systems/custodyConsequences.js:58`, `systems/economy.js:1716`, `systems/encounterDirector.js:321`, `systems/factions.js:527`, `systems/sectorSim.js:128` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:230` | `systems/combat.js:816` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:221` | `systems/combat.js:815` |
| `deniable:fenceBurned` | — | `systems/fenceDesk.js:52` |
| `deniable:fenceEmboldened` | — | `systems/fenceDesk.js:51` |
| `deniable:fenceThanked` | `systems/encounterDirector.js:1077` | `systems/fenceDesk.js:50` |
| `derby:finished` | `data/encounters/706-breaker-derby.js:213` | — |
| `derby:slam` | `data/encounters/706-breaker-derby.js:143`, `data/encounters/706-breaker-derby.js:165` | — |
| `detonator:detonated` | `systems/impulseCharges.js:727` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:297` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:chartFiled` | `systems/world.js:4578` | — |
| `discovery:plateUnlocked` | `systems/world.js:976`, `systems/world.js:6157`, `systems/world.js:6663`, `systems/world.js:7289` | `audio/audioSystem.js:2882`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:904` |
| `distress:call` | `systems/trafficRoleOps.js:238`, `systems/trafficRoleOps.js:291` | `audio/audioSystem.js:2750` |
| `distress:rescued` | `systems/encounterScripts.js:759` | `systems/factions.js:505` |
| `dock:attempt` | `ui/input.js:370` | `ui/dockDenyBanner.js:54` |
| `dock:committed` | `ui/dockStateCommit.js:19` | — |
| `dock:denied` | `ui/dockDenyBanner.js:79` | `render/authoredMotion.js:1221` |
| `dock:docked` | `balance/careerCohorts.js:526`, `balance/careerCohorts.js:2003`, `balance/careerCohorts.js:2064`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `systems/world.js:6532`, `ui/input.js:374` | `audio/audioSystem.js:2885`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/authoredMotion.js:1219`, `render/infrastructureMotion.js:196`, `render/shipMicroMotion.js:1306`, `save/saveSystem.js:580`, `systems/achievements.js:1179`, `systems/aftermathWrecks.js:1079`, `systems/autoTargetAssist.js:148`, `systems/barkDirector.js:855`, `systems/combat.js:766`, `systems/crew.js:81`, `systems/economy.js:1780`, `systems/economyContracts.js:248`, `systems/encounterDirector.js:387`, `systems/factionPresence.js:527`, `systems/fenceDesk.js:49`, `systems/lawSecurity.js:413`, `systems/mining.js:287`, `systems/mining.js:289`, `systems/missions.js:1610`, `systems/onboarding.js:576`, `systems/onboarding.js:779`, `systems/pirateDisguise.js:37`, `systems/scanner.js:1079`, `systems/stationServices.js:276`, `systems/story.js:216`, `systems/world.js:699`, `systems/world.js:742`, `ui/alerts.js:469`, `ui/cargoConscience.js:144`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:55`, `ui/impoundPayPrompt.js:57`, `ui/impoundPayPrompt.js:62`, `ui/priceForecast.js:86`, `ui/promptDeck.js:863`, `ui/securityReadout.js:158`, `ui/station/screens/bar.js:160`, `ui/uiRoot.js:1494`, `ui/watchlistHud.js:90`, `ui/wingmanRadial.js:332`, `ui/worldObjectInteraction.js:424`, `ui/wreckChoicePrompt.js:54` |
| `dock:launder` | `ui/station/screens/market.js:455` | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:1600`, `core/physics.js:1604`, `ui/input.js:343` | `render/authoredMotion.js:1218`, `systems/onboarding.js:734`, `ui/alerts.js:465`, `ui/input.js:349` |
| `dock:undocked` | `balance/careerCohorts.js:527`, `balance/careerCohorts.js:2008`, `balance/careerCohorts.js:2069`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:958`, `ui/station/stationApp.js:980` | `audio/audioSystem.js:2890`, `render/authoredMotion.js:1220`, `render/infrastructureMotion.js:197`, `render/shipMicroMotion.js:1307`, `render/vfx.js:2641`, `save/saveSystem.js:581`, `systems/combat.js:771`, `systems/economy.js:1794`, `systems/economyContracts.js:277`, `systems/factionPresence.js:528`, `systems/missions.js:1630`, `systems/moralTrap.js:188`, `systems/onboarding.js:659`, `systems/presentationAdapters.js:226`, `systems/stationServices.js:277`, `systems/world.js:700`, `ui/impoundPayPrompt.js:60`, `ui/impoundPayPrompt.js:65`, `ui/input.js:357`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1534` |
| `drift:claimContested` | `systems/faction_drift.js:112` | — |
| `drift:claimLifted` | `systems/faction_drift.js:85` | — |
| `drift:claimStaked` | `systems/faction_drift.js:108` | — |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1699` | `ui/uiRoot.js:1595` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1684`, `ui/sandbox/sandboxSetup.js:691` | `ui/uiRoot.js:1585` |
| `drill:approachRequested` | `ui/input.js:865` | `systems/tetherGameplay.js:348` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1576`, `ui/sandbox/sandboxSetup.js:690` | `ui/asteroid/asteroidScreen.js:2205`, `ui/uiRoot.js:1574` |
| `drill:backblast` | `systems/drill.js:2033` | `ui/asteroid/asteroidScreen.js:2107` |
| `drill:break` | `systems/asteroidSites.js:3101`, `systems/drill.js:1959`, `systems/drill.js:1987`, `systems/drill.js:2132`, `systems/drill.js:2450` | `audio/audioSystem.js:3203`, `render/authoredMotion.js:1183`, `systems/asteroidSites.js:684`, `systems/presentationOrchestrator.js:227`, `ui/asteroid/asteroidScreen.js:2134`, `ui/screens/drill.js:1938` |
| `drill:cargoFull` | `systems/drill.js:380`, `systems/drill.js:429` | `audio/audioSystem.js:3205`, `systems/presentationOrchestrator.js:234`, `ui/asteroid/asteroidScreen.js:2091`, `ui/screens/drill.js:1909` |
| `drill:caveIn` | `systems/drill.js:2152` | `audio/audioSystem.js:3211`, `systems/asteroidSites.js:704`, `ui/asteroid/asteroidScreen.js:2117` |
| `drill:chargeArm` | `systems/drill.js:1840`, `systems/drill.js:1850`, `systems/drill.js:1872` | — |
| `drill:chargeBlast` | `systems/drill.js:2039` | `audio/audioSystem.js:3208`, `systems/asteroidSites.js:744`, `ui/asteroid/asteroidScreen.js:2100` |
| `drill:chargePlanted` | `systems/drill.js:1913` | `audio/audioSystem.js:3207`, `systems/asteroidSites.js:743`, `ui/asteroid/asteroidScreen.js:2095` |
| `drill:chargeTick` | `systems/drill.js:2218` | `audio/audioSystem.js:3209` |
| `drill:end` | `systems/drill.js:1492` | `audio/audioSystem.js:3219`, `render/authoredMotion.js:1184`, `systems/asteroidSites.js:746`, `systems/presentationOrchestrator.js:235` |
| `drill:gasHit` | `systems/drill.js:2009`, `systems/drill.js:2479` | `audio/audioSystem.js:3204`, `systems/presentationOrchestrator.js:229`, `ui/asteroid/asteroidScreen.js:2078`, `ui/screens/drill.js:1838` |
| `drill:gasVent` | `systems/drill.js:1958` | `audio/audioSystem.js:3212`, `systems/asteroidSites.js:719`, `ui/asteroid/asteroidScreen.js:2123` |
| `drill:retry` | `systems/drill.js:1541` | `systems/presentationOrchestrator.js:236` |
| `drill:rockCreak` | `systems/drill.js:2101` | `audio/audioSystem.js:3210`, `ui/asteroid/asteroidScreen.js:2111` |
| `drill:rockDepleted` | `systems/drill.js:325`, `systems/drill.js:359`, `systems/drill.js:438`, `systems/drill.js:1455` | `audio/audioSystem.js:3206`, `ui/asteroid/asteroidScreen.js:2088`, `ui/screens/drill.js:1900` |
| `drill:scanPulse` | `systems/drill.js:1619` | `audio/audioSystem.js:3213`, `systems/asteroidSites.js:768`, `systems/presentationOrchestrator.js:225`, `ui/asteroid/asteroidScreen.js:2128`, `ui/screens/drill.js:1926` |
| `drill:spark` | `systems/drill.js:2417` | `audio/audioSystem.js:3202`, `systems/presentationOrchestrator.js:226`, `ui/asteroid/asteroidScreen.js:2139`, `ui/screens/drill.js:1959` |
| `drill:start` | `systems/drill.js:1447` | `audio/audioSystem.js:3218`, `render/authoredMotion.js:1182`, `systems/asteroidSites.js:677`, `systems/onboarding.js:784`, `systems/presentationOrchestrator.js:224` |
| `drill:warn` | `systems/drill.js:332`, `systems/drill.js:383`, `systems/drill.js:392`, `systems/drill.js:430`, `systems/drill.js:1461`, `systems/drill.js:1466`, `systems/drill.js:1883`, `systems/drill.js:2102`, `systems/drill.js:2294`, `systems/drill.js:2329`, `systems/drill.js:2350`, `systems/drill.js:2369` | `audio/audioSystem.js:3214`, `systems/presentationOrchestrator.js:223`, `ui/asteroid/asteroidRenderer3d.js:7409`, `ui/asteroid/asteroidScreen.js:2084`, `ui/screens/drill.js:1866` |
| `drill:yield` | `systems/drill.js:357`, `systems/drill.js:425` | `audio/audioSystem.js:3199`, `systems/missions.js:1664`, `systems/presentationOrchestrator.js:228`, `ui/asteroid/asteroidScreen.js:2070`, `ui/screens/drill.js:1816` |
| `drone:grindStart` | `systems/automation.js:1161` | `render/authoredMotion.js:1168` |
| `drone:grindStop` | — | `render/authoredMotion.js:1169` |
| `ecology:claimCrew` | `systems/alienEcology.js:2756` | — |
| `ecology:coherence` | `systems/alienEcology.js:1404` | — |
| `ecology:collar` | `systems/alienEcology.js:599` | — |
| `ecology:evidence` | `systems/precursorMachines.js:134`, `systems/precursorMachines.js:135`, `systems/precursorMachines.js:417`, `systems/precursorMachines.js:802`, `systems/precursorMachines.js:834`, `systems/precursorMachines.js:1222`, `world/motionFossil.js:256`, `world/veilRayNursery.js:103` | `systems/world.js:745` |
| `ecology:factionOutcome` | `systems/economy.js:3131`, `systems/economy.js:3401` | `systems/world.js:744` |
| `ecology:fossilRecorded` | `world/motionFossil.js:231` | — |
| `ecology:fossilSettled` | `world/motionFossil.js:257` | — |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:752` | `systems/world.js:746` |
| `ecology:relayPulse` | `systems/alienEcology.js:1522` | `audio/audioSystem.js:3234` |
| `ecology:setpiece` | `systems/alienEcology.js:2975`, `systems/alienEcology.js:3041` | — |
| `economy:applyTradePressure` | `systems/automation.js:1020`, `systems/automation.js:2065`, `systems/automation.js:2066`, `systems/claims.js:1585`, `systems/encounterDirector.js:2440`, `systems/encounterDirector.js:2488`, `systems/lossLedger.js:596`, `systems/sectorSim.js:446`, `systems/trafficCausalChainOps.js:2455`, `systems/trafficRecoveryOps.js:333` | `systems/economy.js:1741` |
| `economy:auditorTally` | `systems/economy.js:3777` | — |
| `economy:cargoKillOpportunity` | `systems/economy.js:3277` | `systems/missions.js:1659` |
| `economy:chargeCredits` | `data/encounters/1206-the-fire-sale.js:259`, `data/encounters/1208-the-vetting.js:241`, `data/encounters/1212-the-clean-sheet.js:314`, `shipjack/fleetOperations.js:113`, `shipjack/yardOperations.js:139`, `shipjack/yardOperations.js:170`, `shipjack/yardOperations.js:183`, `systems/automation.js:2267`, `systems/automation.js:2275`, `systems/automation.js:3234`, `systems/automation.js:3461`, `systems/beacons.js:86`, `systems/bombs.js:848`, `systems/bombs.js:931`, `systems/bombs.js:949`, `systems/bombs.js:1015`, `systems/claims.js:459`, `systems/claims.js:529`, `systems/claims.js:600`, `systems/claims.js:1673`, `systems/combat.js:1285`, `systems/drill.js:1898`, `systems/economy.js:4814`, `systems/encounterDirector.js:2434`, `systems/faction_vael.js:221`, `systems/factions.js:613`, `systems/fenceDesk.js:353`, `systems/gateControlDirector.js:128`, `systems/longBerth.js:228`, `systems/manifestGame.js:32`, `systems/mining.js:742`, `systems/missions.js:2273`, `systems/missions.js:2276`, `systems/npcJobsRuntime.js:3484`, `systems/npcJobsRuntime.js:5503`, `systems/pirateParley.js:896`, `systems/shipjack.js:216`, `systems/ships.js:2189`, `systems/ships.js:2331`, `systems/ships.js:2393`, `systems/ships.js:2438`, `systems/world.js:4615`, `systems/world.js:4659`, `systems/world.js:5795` | `systems/economy.js:1705` |
| `economy:coldChainArmed` | `systems/economy.js:3950` | — |
| `economy:coldChainSpoiled` | `systems/economy.js:4003` | — |
| `economy:convoyShareBought` | `systems/economy.js:3575` | — |
| `economy:convoyShareSettled` | `systems/economy.js:3844`, `systems/economy.js:3898` | — |
| `economy:debtEscalated` | `systems/economy.js:4661` | — |
| `economy:demandShift` | `systems/economy.js:2191` | — |
| `economy:eventEnded` | `systems/economy.js:5580` | — |
| `economy:eventStarted` | `systems/economy.js:5555` | — |
| `economy:forwardSlipBought` | `systems/economy.js:3629` | — |
| `economy:forwardSlipSettled` | `systems/economy.js:3866`, `systems/economy.js:3911` | — |
| `economy:freightAccepted` | `systems/economy.js:3480`, `systems/economy.js:3509` | `systems/claims.js:417`, `systems/economyContracts.js:251`, `systems/missions.js:1655` |
| `economy:grantCredits` | `shipjack/fleetOperations.js:95`, `shipjack/fleetOperations.js:133`, `shipjack/yardOperations.js:140`, `shipjack/yardOperations.js:207`, `systems/alienEcology.js:714`, `systems/automation.js:2395`, `systems/automation.js:2406`, `systems/automation.js:3220`, `systems/bombs.js:968`, `systems/cargo.js:1235`, `systems/claims.js:1584`, `systems/claims.js:2459`, `systems/combat.js:1135`, `systems/combat.js:1147`, `systems/combat.js:1293`, `systems/encounterDirector.js:2435`, `systems/faction_pitborn.js:171`, `systems/faction_understory.js:205`, `systems/fenceDesk.js:263`, `systems/fenceDesk.js:298`, `systems/manifestGame.js:15`, `systems/mining.js:2415`, `systems/mining.js:2600`, `systems/mining.js:2761`, `systems/missionStoryOps.js:1759`, `systems/missions.js:4949`, `systems/missions.js:5078`, `systems/missions.js:5081`, `systems/missions.js:5599`, `systems/moralTrap.js:326`, `systems/npcJobsRuntime.js:3499`, `systems/npcJobsRuntime.js:3742`, `systems/scanReveal.js:195`, `systems/scanReveal.js:228`, `systems/ships.js:2262`, `systems/ships.js:2495`, `systems/stationServices.js:415`, `systems/survivorPod.js:1239`, `systems/survivorPod.js:1592`, `systems/uniqueWrecks.js:1885`, `systems/world.js:4570`, `systems/wreckCourt.js:1029` | `systems/economy.js:1704`, `systems/onboarding.js:593`, `systems/story.js:251` |
| `economy:marketContractExpired` | `systems/economy.js:3831`, `systems/economy.js:3981` | — |
| `economy:marketOpened` | `ui/station/screens/market.js:2451` | `systems/economy.js:1721` |
| `economy:oreFlood` | `systems/sectorSim.js:718` | `systems/barkDirector.js:850`, `systems/economy.js:1769` |
| `economy:payBounty` | `ui/screens/footprint.js:1640` | `systems/economy.js:1708` |
| `economy:podIntakeAccepted` | `systems/economy.js:3670`, `systems/economy.js:3685` | — |
| `economy:releaseDebt` | `systems/stationServices.js:424` | `systems/economy.js:1706` |
| `economy:salvageIntakeApplied` | `systems/economy.js:4164` | `ui/alerts.js:504` |
| `economy:shortageRelieved` | `systems/economy.js:3501` | `systems/missions.js:1656` |
| `economy:shortageRepairRestored` | `systems/economyContracts.js:873` | — |
| `economy:sinkCharged` | `systems/economy.js:4207` | `ui/alerts.js:520` |
| `economy:tick` | `systems/economy.js:1956` | `systems/achievements.js:1165`, `systems/economyContracts.js:290` |
| `economy:towCharge` | `systems/world.js:6502` | `systems/economy.js:1814` |
| `economy:tradeCompleted` | `systems/economy.js:3117` | `audio/audioSystem.js:2837`, `audio/audioSystem.js:2949`, `careers/origins/haulerOriginSystem.js:90`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:588`, `systems/claims.js:414`, `systems/factions.js:471`, `systems/missions.js:1641`, `systems/missions.js:1657`, `systems/onboarding.js:584`, `systems/sectorSim.js:143`, `systems/story.js:246`, `ui/adventureDecisions.js:429`, `ui/station/screens/market.js:1989` |
| `economy:tradeFailed` | `systems/economy.js:3359`, `systems/economy.js:3386` | `audio/audioSystem.js:2843`, `ui/adventureDecisions.js:430`, `ui/station/screens/market.js:1988` |
| `emergent:audio` | `systems/emergentPrimitives.js:185`, `systems/environmentMaterials.js:129` | `audio/emergentPrimitiveVoice.js:83` |
| `emergent:contact` | `systems/emergentPrimitives.js:191` | `render/feel.js:1436` |
| `encounter:ambientPredationCleared` | — | `systems/barkDirector.js:845` |
| `encounter:ambientPredationTelegraph` | — | `systems/barkDirector.js:844` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:2284` | `ui/encounterChoicePrompt.js:126` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:363` |
| `encounter:claimDefenseRoster` | `systems/encounterDirector.js:1595` | — |
| `encounter:convoyEscorted` | `systems/encounterScripts.js:3125` | — |
| `encounter:distressBroadcast` | `systems/encounterScripts.js:722` | `systems/encounterDirector.js:378` |
| `encounter:fingerprint` | `systems/encounterDirector.js:2372` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `data/encounters/586-the-blank-page.js:323`, `systems/encounterDirector.js:3079` | — |
| `encounter:lootSweepCollected` | `ai/lootSweep.js:494` | — |
| `encounter:lootSweepDispatched` | `ai/lootSweep.js:296` | — |
| `encounter:lootSweepEnded` | `ai/lootSweep.js:327` | — |
| `encounter:namedCaptainBound` | `systems/missionSpawningOps.js:620` | `systems/encounterDirector.js:347` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:2633`, `systems/encounterScripts.js:3709` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:3043` | `systems/barkDirector.js:812` |
| `encounter:predationCleared` | `systems/encounterScripts.js:1193` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1110`, `systems/encounterScripts.js:1178` | `render/authoredMotion.js:1187` |
| `encounter:predationTelegraph` | — | `render/authoredMotion.js:1204` |
| `encounter:receipt` | `systems/encounterDirector.js:2385` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:2367`, `systems/encounterDirector.js:2418`, `systems/survivalArena.js:1507` | `audio/audioSystem.js:2894`, `systems/aftermathWrecks.js:1078`, `systems/claims.js:429`, `systems/claims.js:430`, `systems/encounterDirector.js:374`, `systems/encounterDirector.js:379`, `systems/story.js:156`, `systems/terrainAnchors.js:102`, `systems/traffic.js:2037`, `systems/traffic.js:2151`, `systems/uniqueLootAbilities.js:159`, `ui/encounterChoicePrompt.js:127` |
| `encounter:scarcityRumor` | `systems/encounterDirector.js:931` | — |
| `encounter:spawned` | `systems/encounterDirector.js:1708` | `systems/uniqueLootAbilities.js:158` |
| `encounter:stale` | `systems/encounterDirector.js:574` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1680`, `systems/survivalArena.js:1413` | `audio/audioSystem.js:2893`, `render/authoredMotion.js:1199`, `systems/survivalResults.js:518`, `systems/terrainAnchors.js:101`, `systems/world.js:709` |
| `encounter:voice` | `systems/encounterDirector.js:2267` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | `ui/encounterChoicePrompt.js:128` |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | `systems/story.js:171` |
| `endgame:archive` | `systems/story.js:232`, `systems/story.js:1119` | `ui/screens/codex.js:907` |
| `endgame:chosen` | `systems/story.js:1107` | `systems/traffic.js:2004`, `ui/screens/missionLog.js:2629` |
| `endgame:confirmRequired` | `systems/story.js:992` | `ui/screens/missionLog.js:2628` |
| `endgame:eligibility` | `systems/story.js:803` | `ui/screens/missionLog.js:2627` |
| `endgame:finaleCompleted` | `systems/story.js:879` | — |
| `endgame:finaleReady` | `systems/story.js:1116` | — |
| `endgame:ineligible` | `systems/story.js:889`, `systems/story.js:946`, `systems/story.js:972`, `systems/story.js:1037` | — |
| `endgame:loopBack` | — | `systems/story.js:240` |
| `endgame:promptChoiceC` | `systems/story.js:957` | — |
| `endgame:promptChoiceD` | `systems/story.js:915` | — |
| `endgame:promptSandbox` | `systems/story.js:814` | — |
| `endgame:pullCompleted` | `systems/claims.js:3346` | `systems/factions.js:518` |
| `endgame:sandboxContinued` | `systems/story.js:1101` | `ui/screens/missionLog.js:2630` |
| `entity:destroyed` | `core/newGameBoot.js:138`, `main.js:747`, `save/saveSystem.js:7896`, `systems/survivorPod.js:366`, `systems/trafficTugOps.js:278` | `audio/audioSystem.js:2726`, `combat/kernel.js:194`, `render/vfx.js:2696`, `systems/aftermathWrecks.js:1057`, `systems/ai.js:121`, `systems/aiEncounter.js:135`, `systems/asteroidSites.js:855`, `systems/automation.js:601`, `systems/cloak.js:88`, `systems/combatOutcome.js:264`, `systems/encounterDirector.js:337`, `systems/environmentalMachinery.js:267`, `systems/gateControlDirector.js:76`, `systems/heistFacilities.js:324`, `systems/lawSecurity.js:396`, `systems/missions.js:1687`, `systems/missions.js:1848`, `systems/missions.js:1852`, `systems/npcJobsRuntime.js:1115`, `systems/presentationOrchestrator.js:177`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:95`, `systems/survivalWave.js:187`, `systems/swarmArena.js:612`, `systems/swarmSupply.js:111`, `systems/traffic.js:2033`, `systems/world.js:679`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:521` |
| `entity:killed` | `balance/careerCohorts.js:495`, `combat/damage.js:563`, `combat/kernel.js:137`, `systems/combat.js:1099` | `audio/audioSystem.js:2725`, `render/feel.js:1304`, `render/shipMicroMotion.js:1290`, `render/vfx.js:2695`, `systems/aftermathWrecks.js:1055`, `systems/ai.js:122`, `systems/asteroidSites.js:851`, `systems/barkDirector.js:803`, `systems/barkDirector.js:804`, `systems/barkDirector.js:846`, `systems/combatOutcome.js:258`, `systems/crew.js:60`, `systems/economy.js:1765`, `systems/economy.js:1768`, `systems/encounterDirector.js:338`, `systems/environmentalMachinery.js:268`, `systems/faction_pitborn.js:113`, `systems/faction_understory.js:122`, `systems/factions.js:370`, `systems/factions.js:432`, `systems/gamepad.js:1106`, `systems/impulseCharges.js:324`, `systems/killReplay.js:370`, `systems/lawSecurity.js:395`, `systems/lawSecurity.js:407`, `systems/lawSecurity.js:408`, `systems/lootShards.js:590`, `systems/lossLedger.js:447`, `systems/mining.js:282`, `systems/missions.js:1680`, `systems/missions.js:1847`, `systems/missions.js:1851`, `systems/npcJobsRuntime.js:1107`, `systems/onboarding.js:626`, `systems/onboarding.js:679`, `systems/presentationOrchestrator.js:176`, `systems/rockCore.js:90`, `systems/sectorSim.js:147`, `systems/surrenderRecovery.js:104`, `systems/survivalResults.js:502`, `systems/survivalWave.js:188`, `systems/survivorPod.js:605`, `systems/swarmChain.js:123`, `systems/swarmElites.js:136`, `systems/swarmJuice.js:159`, `systems/swarmLegendaries.js:100`, `systems/swarmSupply.js:103`, `systems/titles.js:583`, `systems/traffic.js:2030`, `systems/wingMorale.js:201`, `systems/world.js:713`, `testing/playerTruth/reader.js:406`, `ui/uiRoot.js:936`, `ui/uiRoot.js:944` |
| `entity:spawnRequest` | `data/scanReveal.js:527`, `systems/salvageActions.js:276`, `systems/salvageActions.js:522` | `core/coreSystem.js:525` |
| `entity:spawned` | `core/coreSystem.js:355`, `core/coreSystem.js:394` | `combat/kernel.js:183`, `render/asteroidMotionPresentation.js:525`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:254`, `render/shipMicroMotion.js:1291`, `render/vfx.js:2702`, `sim/titleAttract.js:10`, `systems/aiEncounter.js:134`, `systems/barkDirector.js:789`, `systems/barkDirector.js:790`, `systems/combatOutcome.js:263`, `systems/factionPresence.js:540`, `systems/fields.js:711`, `systems/flybyFocus.js:307`, `systems/lawSecurity.js:394`, `systems/lossLedger.js:446`, `systems/npcJobsRuntime.js:1091`, `systems/salvageActions.js:136`, `systems/survivalSwarm.js:216`, `systems/swarmElites.js:135`, `systems/swarmSupply.js:109`, `systems/titles.js:584`, `systems/uniqueLootAbilities.js:161` |
| `environment:detonated` | — | `render/vfx.js:2740` |
| `environment:fractured` | — | `systems/sectorSim.js:163` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:547`, `systems/environmentalMachinery.js:1370` | `systems/terrainAnchors.js:103` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:955` | `systems/terrainAnchors.js:107` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:1264` | `systems/terrainAnchors.js:105` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:1464` | `data/hazardLanguage.js:148` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:967` | `systems/terrainAnchors.js:109` |
| `escalation:arrived` | `systems/encounterDirector.js:614` | — |
| `escalation:seeded` | `systems/encounterDirector.js:601` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:572`, `systems/factions.js:655`, `systems/factions.js:1041` | `systems/heat.js:403` |
| `faction:bribe` | `data/encounters/1208-the-vetting.js:277`, `ui/screens/footprint.js:1646` | `systems/factions.js:348` |
| `faction:repChanged` | `systems/factions.js:568`, `systems/factions.js:650`, `systems/factions.js:1037` | `audio/audioSystem.js:2946`, `systems/factionPresence.js:544`, `ui/station/screens/factions.js:446` |
| `faction:repDelta` | `balance/careerCohorts.js:270`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `systems/choirReliefBerth.js:379`, `systems/choirReliefBerth.js:413`, `systems/choirReliefBerth.js:434`, `systems/claims.js:2045`, `systems/economy.js:4314`, `systems/economy.js:5107`, `systems/economy.js:5494`, `systems/encounterDirector.js:2436`, `systems/faction_understory.js:204`, `systems/faction_vael.js:241`, `systems/fenceDesk.js:266`, `systems/missionStoryOps.js:1711`, `systems/missionStoryOps.js:1713`, `systems/missionStoryOps.js:1777`, `systems/missions.js:5596`, `systems/missions.js:5687`, `systems/moralTrap.js:320`, `systems/stuntGrammar.js:177`, `systems/survivorPod.js:1228`, `systems/survivorPod.js:1598`, `systems/uniqueWrecks.js:1889`, `systems/world.js:4574`, `systems/world.js:6791`, `systems/world.js:7025` | `systems/factions.js:335` |
| `faction:repSpillover` | `systems/factions.js:648` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | `systems/factions.js:340` |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1846` | `systems/barkDirector.js:826` |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:1501` | `systems/story.js:280` |
| `factionPresence:berthGreeting` | `systems/factionPresence.js:1038` | — |
| `factionPresence:berthReturned` | `systems/factionPresence.js:1015` | — |
| `factionPresence:berthRobbed` | `systems/factionPresence.js:1001` | — |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1758` | `ui/uiRoot.js:554` |
| `factionPresence:conduct` | `systems/factionPresence.js:812`, `systems/factionPresence.js:919` | — |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:1335` | `systems/barkDirector.js:825` |
| `factionPresence:service` | `systems/factionPresence.js:1440` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1571` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:788`, `systems/factionPresence.js:959`, `systems/factionPresence.js:1151` | — |
| `fence:routeLegDue` | — | `systems/economyContracts.js:260` |
| `fence:scrubAsk` | — | `systems/fenceDesk.js:62` |
| `field:depletedChanged` | `systems/fieldDepletion.js:841` | `systems/world.js:667` |
| `field:opportunity` | `systems/world.js:5070` | — |
| `field:regrown` | `systems/world.js:4999` | `systems/presentationOrchestrator.js:221` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:769`, `systems/traffic.js:2545`, `systems/trafficCausalChainOps.js:2374` | `systems/presentationOrchestrator.js:222` |
| `field:richSeamOpened` | `systems/trafficCausalChainOps.js:336` | `systems/traffic.js:2023` |
| `field:richSeamWorked` | `systems/mining.js:1163`, `systems/trafficRecoveryOps.js:698` | `systems/traffic.js:2024` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:840` | `systems/npcJobsRuntime.js:1123`, `systems/presentationOrchestrator.js:220` |
| `fields:anchorRegistered` | `systems/fields.js:1277` | `audio/audioSystem.js:3144`, `render/forceLanguage/fieldForcePresentation.js:61` |
| `fields:cleared` | `systems/fields.js:1804` | `audio/fieldAudio.js:321`, `render/forceLanguage/fieldForcePresentation.js:62` |
| `fields:clusterDetonate` | `systems/fields.js:2575` | `systems/presentationOrchestrator.js:283` |
| `fields:coneToggled` | `systems/fields.js:1495`, `systems/fields.js:1501`, `systems/fields.js:1595`, `systems/fields.js:1603` | `systems/onboarding.js:670` |
| `fields:deployDenied` | `systems/fields.js:1378` | — |
| `fields:deployed` | `systems/fields.js:920`, `systems/fields.js:1005`, `systems/fields.js:1440`, `systems/fields.js:1492`, `systems/fields.js:1586`, `systems/fields.js:1680` | `audio/audioSystem.js:3145`, `systems/fields.js:712`, `systems/onboarding.js:669` |
| `fields:ended` | `systems/fields.js:1296`, `systems/fields.js:1602`, `systems/fields.js:1623`, `systems/fields.js:1753` | `audio/fieldAudio.js:318` |
| `fields:hitchCut` | `systems/fields.js:951` | — |
| `fields:hitchLatched` | `systems/fields.js:939` | — |
| `fields:pullMarked` | `systems/fields.js:1467` | — |
| `fields:specialistDisrupt` | `systems/fields.js:829` | `audio/fieldAudio.js:322` |
| `fields:thermalCreated` | `systems/fields.js:1842` | — |
| `fields:thermalHit` | `core/fields/thermalFields.js:35` | — |
| `firsthour:beat` | `systems/onboarding.js:4063` | — |
| `firsthour:complete` | `systems/onboarding.js:4076` | — |
| `firsthour:milestone` | `systems/onboarding.js:1689` | `audio/audioSystem.js:3137`, `testing/playerTruth/reader.js:401` |
| `firsthour:sentence` | `systems/onboarding.js:2657` | — |
| `firsthour:started` | `systems/onboarding.js:3730` | — |
| `firsthour:verb` | `systems/onboarding.js:4000` | — |
| `flight:modeChanged` | `systems/flightV3.js:1071` | — |
| `flight:racePrecision` | `systems/missions.js:4162` | `systems/flightV3.js:205` |
| `flight:sweptHull` | `systems/flightV3.js:971` | — |
| `flybyFocus:cancel` | `systems/flybyFocus.js:367` | `render/cameraDirector.js:1307` |
| `flybyFocus:end` | `systems/flybyFocus.js:368` | `render/cameraDirector.js:1306` |
| `flybyFocus:start` | `systems/flybyFocus.js:501` | `systems/onboarding.js:609` |
| `formation:discovered` | `systems/asteroidFormations.js:290` | — |
| `freight:arrival` | `systems/trafficEscortOps.js:186` | `render/authoredMotion.js:1195`, `systems/economy.js:1761` |
| `freight:cargoSpilled` | `systems/encounterScripts.js:2043`, `systems/encounterScripts.js:2330`, `systems/trafficRoleOps.js:407` | `systems/barkDirector.js:800`, `systems/economy.js:1707`, `systems/encounterDirector.js:392`, `systems/lootShards.js:593`, `systems/presentationOrchestrator.js:296`, `systems/sectorSim.js:154`, `systems/traffic.js:2059` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1876` | `render/authoredMotion.js:1194`, `systems/aftermathWrecks.js:1080` |
| `freight:custodyRebound` | `systems/encounterDirector.js:781` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1933`, `systems/encounterScripts.js:1955` | — |
| `freight:lootSweepStarted` | `systems/encounterScripts.js:1605` | — |
| `freight:loss` | `systems/encounterDirector.js:2498`, `systems/trafficCausalChainOps.js:2467`, `systems/trafficRecoveryOps.js:335` | `systems/claims.js:436`, `systems/economy.js:1762`, `systems/encounterDirector.js:393`, `systems/sectorSim.js:153` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1877` | `systems/surrenderRecovery.js:105` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:2476` | `systems/barkDirector.js:801` |
| `freight:recovery` | — | `systems/encounterDirector.js:345`, `systems/traffic.js:2055` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:346`, `systems/traffic.js:2056` |
| `freight:sweeperEscaped` | `systems/encounterScripts.js:1760` | — |
| `frontier:moduleSnapped` | `systems/faction_frontier.js:70` | — |
| `frontier:supplyDelivered` | `systems/faction_frontier.js:162` | — |
| `frontier:supplyRunAsked` | `systems/faction_frontier.js:150` | — |
| `frontier:trafficTick` | `systems/faction_frontier.js:144` | — |
| `frontier:welded` | `systems/faction_frontier.js:195` | — |
| `frontierRumor:acquired` | `systems/world.js:4678` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:7256` | — |
| `frontierRumor:contacted` | `systems/world.js:7152` | — |
| `frontierRumor:resolved` | `systems/world.js:4695` | — |
| `fuel:changed` | `systems/economy.js:4736`, `systems/economy.js:4897`, `systems/economy.js:4914`, `systems/stationServices.js:549`, `systems/stationServices.js:652`, `systems/stationServices.js:746`, `systems/world.js:6348`, `systems/world.js:6356` | — |
| `fuel:crackCell` | `ui/hud.js:3655` | `systems/world.js:662` |
| `fuel:empty` | `systems/world.js:6349` | `audio/audioSystem.js:2918`, `systems/economy.js:1812`, `ui/alerts.js:586` |
| `fulfillment:boardingDocked` | `systems/faction_fulfillment.js:285` | — |
| `fulfillment:boardingFlung` | `systems/faction_fulfillment.js:272` | — |
| `fulfillment:cargoFiled` | `systems/faction_fulfillment.js:324` | — |
| `fulfillment:derailed` | `systems/faction_fulfillment.js:194` | — |
| `fulfillment:hitchhike` | `systems/faction_fulfillment.js:253` | — |
| `fulfillment:orderOneClosed` | `systems/faction_fulfillment.js:351` | — |
| `fulfillment:rerailed` | `systems/faction_fulfillment.js:205` | — |
| `game:embarkSpeculation` | `ui/sandbox/sandboxSetup.js:412`, `ui/screens/gameOver.js:535`, `ui/screens/newGame.js:984` | — |
| `game:exitToMenu` | `ui/loadingPresenter.js:541`, `ui/screens/crucible.js:3713`, `ui/screens/crucible.js:3726`, `ui/screens/demoEnd.js:217`, `ui/screens/gameOver.js:563`, `ui/screens/pause.js:1259` | `audio/audioSystem.js:3259`, `core/gameStartRecovery.js:19`, `main.js:376`, `save/saveSystem.js:606`, `systems/missions.js:1823`, `systems/runSession.js:93`, `ui/confirm.js:305`, `ui/loadingPresenter.js:583`, `ui/screens/crucibleLabControls.js:575`, `ui/uiRoot.js:1645` |
| `game:load` | `ui/input.js:524`, `ui/input.js:741`, `ui/screens/gameOver.js:524`, `ui/screens/mainMenu.js:756`, `ui/screens/saveLoad.js:1579` | `core/gameStartRecovery.js:12`, `save/saveSystem.js:410`, `systems/scanner.js:1078`, `ui/commandBar.js:430`, `ui/loadingPresenter.js:582`, `ui/loadingPresenter.js:609`, `ui/promptDeck.js:862` |
| `game:loadingProgress` | `main.js:133`, `main.js:178`, `main.js:227`, `main.js:262`, `main.js:431`, `main.js:710`, `main.js:783`, `main.js:838`, `main.js:865`, `main.js:899`, `main.js:910`, `main.js:973`, `main.js:1145`, `save/saveSystem.js:6489` | `ui/loadingPresenter.js:559`, `ui/screens/newGame.js:939`, `ui/screens/saveLoad.js:1057` |
| `game:new` | `main.js:575`, `ui/physicsVenues.js:28`, `ui/sandbox/sandboxSetup.js:426`, `ui/screens/crucible.js:3717`, `ui/screens/gameOver.js:550`, `ui/screens/newGame.js:1073`, `ui/screens/raceBoard.js:50` | `audio/audioSystem.js:3254`, `audio/bombAudio.js:458`, `audio/fieldAudio.js:325`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:539`, `core/gameStartRecovery.js:11`, `main.js:354`, `render/feel.js:1243`, `render/vfx.js:2712`, `render/vfx.js:2723`, `save/saveSystem.js:539`, `sim/killcamTape.js:471`, `systems/aftermathWrecks.js:1088`, `systems/aiEncounter.js:139`, `systems/bombs.js:692`, `systems/cloak.js:83`, `systems/combatOutcome.js:268`, `systems/countermeasures.js:224`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:84`, `systems/encounterDirector.js:335`, `systems/environmentalMachinery.js:271`, `systems/fields.js:705`, `systems/impulseCharges.js:329`, `systems/killReplay.js:358`, `systems/massSeed.js:140`, `systems/masslineSnares.js:137`, `systems/masslineTelemetry.js:123`, `systems/mines.js:77`, `systems/mining.js:305`, `systems/planetRuntime.js:154`, `systems/presentationOrchestrator.js:285`, `systems/reactiveMatter.js:537`, `systems/rockCore.js:91`, `systems/salvageActions.js:143`, `systems/scanner.js:1077`, `systems/scissorwake.js:73`, `systems/ships.js:1699`, `systems/surrenderRecovery.js:111`, `systems/survivorPod.js:603`, `systems/swarmLegendaries.js:105`, `systems/tetherGameplay.js:340`, `systems/tumbleStates.js:132`, `ui/capitalBossOverlayMount.js:532`, `ui/commandBar.js:429`, `ui/hudLayout.js:123`, `ui/loadingPresenter.js:581`, `ui/loadingPresenter.js:608`, `ui/moralTrapPrompt.js:44`, `ui/promptDeck.js:861`, `ui/screens/crucibleLabControls.js:569`, `ui/uiRoot.js:757`, `ui/uiRoot.js:1649`, `ui/voiceArbiter.js:545`, `ui/wreckChoicePrompt.js:56` |
| `game:newGame` | `core/newGameBoot.js:167` | `audio/audioSystem.js:3255`, `audio/bombAudio.js:459`, `audio/fieldAudio.js:326`, `core/coreSystem.js:540`, `core/physics.js:202`, `render/npcJobSignatureVfx.js:903`, `render/shipMicroMotion.js:1294`, `render/vfx.js:2713`, `render/vfx.js:2724`, `save/saveSystem.js:544`, `systems/aftermathWrecks.js:1089`, `systems/bombs.js:695`, `systems/cloak.js:84`, `systems/collisionConsequences.js:111`, `systems/combatOutcome.js:275`, `systems/countermeasures.js:225`, `systems/difficultyDirector.js:169`, `systems/fieldDepletion.js:757`, `systems/fragileCargo.js:341`, `systems/lossInvestigation.js:131`, `systems/lossLedger.js:450`, `systems/onboarding.js:554`, `systems/salvageActions.js:144`, `systems/survivorPod.js:602`, `systems/titles.js:586`, `systems/tumbleStates.js:133`, `systems/wingMorale.js:203`, `ui/cargoConscience.js:148`, `ui/uiRoot.js:812` |
| `game:over` | `systems/combat.js:1056`, `systems/combat.js:1189` | `ui/confirm.js:304`, `ui/uiRoot.js:1611` |
| `game:retryStart` | `ui/loadingPresenter.js:524` | `core/gameStartRecovery.js:14` |
| `game:save` | `ui/input.js:523`, `ui/input.js:736`, `ui/screens/saveLoad.js:1612` | `save/saveSystem.js:390` |
| `game:scenePrepared` | `core/newGameBoot.js:234` | `systems/missions.js:1587`, `systems/onboarding.js:530`, `ui/loadingPresenter.js:611`, `ui/sandbox/sandboxSetup.js:483` |
| `game:startFailed` | `main.js:1095`, `ui/loadingPresenter.js:600` | `core/gameStartRecovery.js:13`, `ui/loadingPresenter.js:580`, `ui/sandbox/sandboxSetup.js:486`, `ui/screens/crucibleLabControls.js:571`, `ui/screens/newGame.js:938`, `ui/screens/saveLoad.js:1063` |
| `game:started` | `main.js:725` | `audio/audioSystem.js:3260`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:541`, `save/saveSystem.js:536`, `save/saveSystem.js:558`, `sim/killcamTape.js:470`, `systems/automation.js:640`, `systems/collisionConsequences.js:110`, `systems/combat.js:813`, `systems/economyContracts.js:254`, `systems/factionPresence.js:531`, `systems/factions.js:332`, `systems/flight.js:83`, `systems/flightV3.js:224`, `systems/heat.js:410`, `systems/masslineSnares.js:138`, `systems/missions.js:1576`, `systems/onboarding.js:553`, `systems/presentationAdapters.js:224`, `systems/presentationOrchestrator.js:286`, `systems/sectorSim.js:134`, `systems/ships.js:1875`, `systems/story.js:154`, `systems/surrenderRecovery.js:112`, `systems/survivalDraft.js:204`, `systems/tetherGameplay.js:341`, `systems/wingmen.js:159`, `ui/alerts.js:490`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:478`, `ui/screens/crucibleLabControls.js:570`, `ui/uiRoot.js:758`, `ui/uiRoot.js:1603`, `ui/uiRoot.js:1640`, `ui/uiRoot.js:1650` |
| `gamepad:connected` | `systems/gamepad.js:1305` | — |
| `gamepad:disconnected` | `systems/gamepad.js:1253` | — |
| `gate:range` | `core/physics.js:1610`, `core/physics.js:1614` | `render/authoredMotion.js:1222`, `systems/onboarding.js:741`, `systems/presentationOrchestrator.js:181`, `ui/alerts.js:471` |
| `gate:verdict` | `systems/gateControlDirector.js:143` | `render/infrastructureMotion.js:198` |
| `graffiti:show` | `data/encounters/366-the-counting-relay.js:102`, `data/encounters/366-the-counting-relay.js:112`, `systems/blindWelderRuntime.js:153`, `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:573`, `systems/historyWear.js:103`, `systems/story.js:650`, `systems/story.js:664`, `systems/story.js:698`, `systems/story.js:1515`, `systems/story.js:1916`, `systems/story.js:2127`, `systems/uniqueWrecks.js:1895` | `systems/ships.js:1852`, `ui/screens/codex.js:903` |
| `gyre:absorbTick` | — | `systems/gamepad.js:1071` |
| `gyre:ballGrave` | — | `systems/gamepad.js:1050` |
| `gyre:beamOn` | — | `systems/gamepad.js:1009` |
| `gyre:caught` | — | `systems/gamepad.js:1051` |
| `gyre:dropped` | — | `systems/gamepad.js:1080` |
| `gyre:full` | — | `systems/gamepad.js:1048` |
| `gyre:fuseLow` | — | `systems/gamepad.js:1049` |
| `gyre:snagged` | — | `systems/gamepad.js:1010` |
| `gyre:strained` | — | `systems/gamepad.js:1095` |
| `gyre:thrown` | — | `systems/gamepad.js:1033` |
| `gyre:windup` | — | `systems/gamepad.js:1020` |
| `harasser:disengaged` | `systems/encounterDirector.js:2889` | `systems/barkDirector.js:813`, `systems/barkDirector.js:916` |
| `hazard:changed` | `systems/world.js:969`, `systems/world.js:6221` | `ui/alerts.js:603` |
| `hazard:enter` | `systems/environmentalMachinery.js:1404`, `systems/world.js:6196` | `data/hazardLanguage.js:144`, `render/shipMicroMotion.js:1299`, `ui/alerts.js:533` |
| `hazard:exit` | `systems/environmentalMachinery.js:1413`, `systems/world.js:6206` | `data/hazardLanguage.js:145`, `render/shipMicroMotion.js:1300`, `ui/alerts.js:544` |
| `heat:changed` | `systems/heat.js:879` | `audio/audioSystem.js:2921`, `render/vfx.js:2720`, `systems/barkDirector.js:827`, `systems/lawSecurity.js:414`, `systems/onboarding.js:682`, `systems/onboarding.js:685`, `systems/titles.js:593` |
| `heat:clear` | `systems/combat.js:1780` | `systems/heat.js:414` |
| `heat:scrubRequested` | `data/encounters/1212-the-clean-sheet.js:328`, `systems/fenceDesk.js:350` | `systems/heat.js:442` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:1057` | `systems/missions.js:1756` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1514` | — |
| `heist:captureFork` | `systems/heistFacilities.js:2053` | `systems/missions.js:1765` |
| `heist:counterweight` | `systems/heistFacilities.js:3194` | `systems/missions.js:1776` |
| `heist:counterweightSceneReceipt` | `systems/heistFacilities.js:3517`, `systems/heistFacilities.js:3525`, `systems/heistFacilities.js:3530`, `systems/heistFacilities.js:3552` | — |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1940` | `systems/missions.js:1761` |
| `heist:launchCue` | `systems/heistFacilities.js:451`, `systems/heistFacilities.js:3889` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:591`, `systems/heistFacilities.js:600`, `systems/heistFacilities.js:604`, `systems/heistFacilities.js:618` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:2502` | — |
| `heist:monitorScan` | `systems/heistFacilities.js:3846` | `systems/missions.js:1769` |
| `heist:observed` | `systems/heistFacilities.js:2713` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:2444` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:2425` | `systems/npcJobsRuntime.js:1140` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:2363` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:326` |
| `heist:routineReceipt` | `systems/heistFacilities.js:1803` | — |
| `heist:shipmentUnit` | `systems/heistFacilities.js:1918` | `systems/missions.js:1772` |
| `helix:flagsDropped` | `systems/faction_helix.js:104` | — |
| `helix:lienFiled` | `systems/faction_helix.js:139` | — |
| `helix:lienStuck` | `systems/faction_helix.js:170` | — |
| `history:deadNoted` | `systems/historyWear.js:65` | — |
| `history:decal` | `systems/historyWear.js:90` | `systems/ships.js:1865` |
| `history:trinket` | `systems/historyWear.js:85` | `systems/ships.js:1861` |
| `hud:firstUse` | `systems/onboarding.js:1139`, `systems/tetherGameplay.js:2197`, `systems/tetherGameplay.js:2268` | — |
| `hud:layoutChanged` | `ui/hudLayout.js:86` | `save/saveSystem.js:592` |
| `hud:phase` | `systems/story.js:343`, `systems/story.js:373`, `systems/story.js:376`, `systems/story.js:739` | — |
| `hud:recallObjective` | `ui/input.js:559` | — |
| `hud:slotClaim` | `ui/promptDeck.js:243` | — |
| `hud:slotRelease` | `ui/promptDeck.js:244` | — |
| `hud:tagFlicker` | `systems/story.js:716` | — |
| `hull:fractured` | `systems/hullFracture.js:539` | `render/authoredMotion.js:1165` |
| `hullBurst:activated` | `systems/hullBurst.js:231` | — |
| `hullBurst:ended` | `systems/hullBurst.js:253` | — |
| `hullBurst:hit` | `systems/hullBurst.js:400`, `systems/hullBurst.js:431`, `systems/hullBurst.js:610` | `render/authoredMotion.js:1163` |
| `hullBurst:released` | `systems/hullBurst.js:545` | — |
| `ilexArk:accepted` | `systems/ilexArk.js:161` | — |
| `ilexArk:finished` | `systems/ilexArk.js:193` | — |
| `ilexArk:harvested` | `systems/economy.js:4074` | — |
| `ilexArk:offer` | `systems/ilexArk.js:225` | `ui/ilexArkPrompt.js:4` |
| `ilexArk:vaultDelivered` | `systems/ilexArk.js:179` | — |
| `ilexArk:vaultReleased` | `systems/ilexArk.js:111` | — |
| `industry:haulRequested` | `systems/environmentalMachinery.js:996` | `systems/traffic.js:2165` |
| `input:worldGestureCancelled` | `systems/input.js:1338`, `ui/worldObjectInteraction.js:192` | `systems/masslineThrow.js:129` |
| `interdiction:triggered` | `systems/encounterScripts.js:593`, `systems/world.js:5655` | `render/authoredMotion.js:1177`, `systems/presentationOrchestrator.js:189`, `systems/sectorSim.js:144` |
| `intervention:available` | `systems/intervention.js:260` | — |
| `intervention:closed` | `systems/intervention.js:313` | — |
| `intervention:jumperRipped` | `systems/intervention.js:432` | — |
| `intervention:logged` | `systems/intervention.js:135` | — |
| `jump:arrive` | `systems/world.js:5595` | `render/authoredMotion.js:1225`, `render/feel.js:1398`, `render/shipMicroMotion.js:1304`, `save/saveSystem.js:583`, `systems/gateControlDirector.js:74`, `systems/presentationOrchestrator.js:187`, `systems/sectorSim.js:168` |
| `jump:chargeAbort` | `systems/world.js:5735`, `systems/world.js:5827`, `systems/world.js:5892` | `audio/audioSystem.js:2900`, `render/authoredMotion.js:1226`, `render/shipMicroMotion.js:1305`, `systems/gateControlDirector.js:75`, `systems/presentationOrchestrator.js:186`, `systems/routeFollower.js:412`, `ui/galaxyMap.js:2835`, `ui/toasts.js:836` |
| `jump:chargeStart` | `systems/world.js:5809`, `systems/world.js:5853` | `render/authoredMotion.js:1223`, `render/feel.js:1388`, `render/shipMicroMotion.js:1301`, `systems/gateControlDirector.js:72`, `systems/missions.js:1603`, `systems/presentationOrchestrator.js:183`, `systems/story.js:222`, `ui/galaxyMap.js:2834` |
| `jump:chargeTick` | `systems/world.js:5528` | `render/authoredMotion.js:1217`, `render/shipMicroMotion.js:1302`, `systems/presentationOrchestrator.js:184` |
| `jump:departurePreflight` | `systems/world.js:5791` | `systems/story.js:221` |
| `jump:interdictionWarning` | `systems/world.js:5554` | — |
| `jump:start` | `systems/world.js:5559` | `audio/audioSystem.js:2899`, `render/authoredMotion.js:1224`, `render/feel.js:1392`, `render/shipMicroMotion.js:1303`, `systems/economy.js:1817`, `systems/gateControlDirector.js:73`, `systems/mining.js:290`, `systems/presentationOrchestrator.js:185`, `systems/sectorSim.js:167` |
| `jump:unfiledConfirmed` | `systems/world.js:5873` | `systems/story.js:223` |
| `kilnback:caskReleased` | `systems/kilnback.js:152` | — |
| `kilnback:caskSalvaged` | `systems/kilnback.js:213` | — |
| `kilnback:coolantReleased` | `systems/kilnback.js:201` | — |
| `kilnback:phase` | `systems/kilnback.js:241` | — |
| `landmark:artifactRecovered` | `systems/missionObjectiveOps.js:623` | `systems/world.js:701` |
| `lane:facadeMiss` | `core/registry.js:1019` | — |
| `lastShift:archive` | `ui/lastShiftPrompt.js:24` | — |
| `lastShift:archived` | `systems/lastShift.js:199` | — |
| `lastShift:offer` | `systems/lastShift.js:180` | `ui/lastShiftPrompt.js:8` |
| `lastShift:recorderReturned` | `systems/lastShift.js:238` | — |
| `lastShift:returnRecorder` | `ui/lastShiftPrompt.js:25` | — |
| `law:audit` | — | `systems/lawSecurity.js:423` |
| `law:custodyAcknowledged` | — | `systems/barkDirector.js:815` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:57`, `systems/lossLedger.js:451` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:805` |
| `law:distressRaised` | — | `systems/barkDirector.js:824` |
| `law:fineAssessed` | — | `systems/barkDirector.js:818`, `ui/impoundPayPrompt.js:58` |
| `law:fineChoice` | `ui/impoundPayPrompt.js:224`, `ui/impoundPayPrompt.js:318` | `systems/lawSecurity.js:421` |
| `law:fineRefused` | — | `ui/impoundPayPrompt.js:59` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:101` | `systems/lawSecurity.js:415` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:52` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:53` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:59` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:61`, `systems/heat.js:424`, `ui/impoundPayPrompt.js:54` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:55` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:60` |
| `law:incidentOpened` | — | `systems/traffic.js:2067` |
| `law:incidentResolved` | — | `systems/barkDirector.js:822` |
| `law:killedAdjudicated` | — | `systems/factions.js:357` |
| `law:obligationNoted` | — | `ui/impoundPayPrompt.js:63` |
| `law:obligationPaid` | — | `systems/factions.js:365`, `ui/impoundPayPrompt.js:64` |
| `law:playerSurrender` | — | `systems/lawSecurity.js:422` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:811`, `systems/factions.js:445`, `systems/heat.js:439` |
| `law:response` | — | `systems/barkDirector.js:821` |
| `law:responseDeferred` | — | `systems/barkDirector.js:820` |
| `law:sanctuaryWithdrawal` | — | `systems/barkDirector.js:819` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:420` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:807` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:806` |
| `law:wantedWarrantReleased` | — | `systems/barkDirector.js:823` |
| `law:warrantIssued` | `data/encounters/700-the-weighing.js:286` | — |
| `law:witnessChoice` | — | `systems/encounterDirector.js:391` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `render/authoredMotion.js:1188`, `systems/lawSecurity.js:402` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `ledger:evidenceLinked` | `ui/shipLedgerPanel.js:563`, `ui/shipLedgerPanel.js:598` | `systems/story.js:183` |
| `line:classChanged` | `systems/lineProgression.js:145` | — |
| `line:recordStamped` | `systems/lineProgression.js:114` | — |
| `longBerth:claim` | `ui/longBerthPrompt.js:39` | `systems/longBerth.js:58` |
| `longBerth:claimOffer` | `systems/longBerth.js:109` | `ui/longBerthPrompt.js:78` |
| `longBerth:restore` | `ui/longBerthPrompt.js:66` | `systems/longBerth.js:59` |
| `longBerth:restoreOffer` | `systems/longBerth.js:197` | `ui/longBerthPrompt.js:79` |
| `longBerth:stage` | `systems/longBerth.js:234` | `systems/crew.js:69` |
| `longBerth:trophy` | `systems/longBerth.js:255` | `systems/crew.js:73` |
| `loot:drop` | `systems/combat.js:1151`, `systems/lootShards.js:1090`, `systems/stuntGrammar.js:187` | `systems/mining.js:284` |
| `loot:magnetCaptured` | `systems/lootShards.js:669` | `audio/audioSystem.js:2813` |
| `loot:manifestPayload` | `systems/lootShards.js:1199` | `systems/missions.js:1856` |
| `loot:overflowConverted` | `systems/mining.js:2766` | `audio/audioSystem.js:2812` |
| `lossInvestigation:closed` | `systems/lossInvestigation.js:331` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:194` | `systems/lossInvestigation.js:129` |
| `lossLedger:priceMove` | `systems/lossLedger.js:605` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:403` | `systems/factionPresence.js:532`, `systems/ships.js:1806` |
| `machine:appealAccepted` | `systems/precursorMachines.js:187` | — |
| `machine:jurisdictionResolved` | `systems/machineWork.js:262` | — |
| `machine:repairCompleted` | `systems/machineWork.js:221`, `systems/machineWork.js:328` | — |
| `machine:tokenDelivered` | `systems/precursorMachines.js:1045`, `systems/precursorMachines.js:1106` | — |
| `machine:workpiecePlaced` | `systems/machineWork.js:398` | — |
| `mail:delivered` | `systems/mail.js:206` | — |
| `manifest:changed` | `systems/manifestGame.js:10` | `ui/screens/manifest.js:23` |
| `manifest:completed` | `systems/manifestGame.js:17` | — |
| `map:sectorCharted` | `systems/world.js:4619` | `systems/economy.js:1726` |
| `massSeed:cleared` | `systems/massSeed.js:613` | — |
| `massSeed:collapsed` | `systems/massSeed.js:436`, `systems/massSeed.js:486`, `systems/massSeed.js:566`, `systems/massSeed.js:596` | `render/authoredMotion.js:1216` |
| `massSeed:collapsing` | `systems/massSeed.js:435`, `systems/massSeed.js:457`, `systems/massSeed.js:552`, `systems/massSeed.js:594` | `audio/audioSystem.js:3120` |
| `massSeed:deployDenied` | `systems/massSeed.js:175` | — |
| `massSeed:deployed` | `systems/massSeed.js:265` | `audio/audioSystem.js:3104`, `render/authoredMotion.js:1213`, `systems/onboarding.js:933` |
| `massSeed:destroyed` | `systems/massSeed.js:593` | — |
| `massSeed:locked` | `systems/massSeed.js:322` | `audio/audioSystem.js:3112`, `render/authoredMotion.js:1214` |
| `massSeed:locking` | `systems/massSeed.js:387` | `audio/audioSystem.js:3108` |
| `massSeed:tetherCut` | `systems/massSeed.js:514` | `audio/audioSystem.js:3125`, `render/authoredMotion.js:1215` |
| `massSeed:warning` | `systems/massSeed.js:349` | `audio/audioSystem.js:3116` |
| `massline:bridleCut` | `systems/tetherGameplay.js:1095` | `ui/stuntCallout.js:790` |
| `massline:bridleEnded` | `systems/tetherGameplay.js:1032`, `systems/tetherGameplay.js:1050`, `systems/tetherGameplay.js:1269` | `ui/masslineHud.js:1153` |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:889` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:943` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:1105` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2820` | — |
| `massline:flailOffer` | `systems/tetherGameplay.js:517`, `systems/tetherGameplay.js:727` | `systems/rockCore.js:94` |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:3012` | `systems/barkDirector.js:905` |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1966` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:2089` | `systems/gamepad.js:1007` |
| `massline:recovered` | `systems/tumbleStates.js:254` | — |
| `massline:recovering` | `systems/tumbleStates.js:648` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:186` | `audio/audioSystem.js:2800` |
| `massline:releaseValidated` | `systems/masslineThrow.js:629` | `systems/presentationOrchestrator.js:164` |
| `massline:releaseWindow` | `systems/masslineThrow.js:247` | `ui/stuntCallout.js:782` |
| `massline:rideStarted` | `systems/tetherGameplay.js:2241` | `ui/stuntCallout.js:783` |
| `massline:selfSling` | `systems/masslineThrow.js:658` | `systems/flightV3.js:248`, `systems/onboarding.js:897`, `ui/stuntCallout.js:740` |
| `massline:snareArmed` | `systems/masslineSnares.js:239` | `audio/audioSystem.js:3096`, `render/authoredMotion.js:1154` |
| `massline:snareCaught` | `systems/masslineSnares.js:434` | `systems/gamepad.js:998` |
| `massline:snareCut` | `systems/masslineSnares.js:727` | `audio/audioSystem.js:3100` |
| `massline:snareDeployed` | `systems/masslineSnares.js:341`, `systems/masslineSnares.js:686` | `render/authoredMotion.js:1148` |
| `massline:snareEnded` | `systems/masslineSnares.js:729` | `render/authoredMotion.js:1152` |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `render/vfx.js:2708`, `systems/masslineImpactDamage.js:48`, `systems/presentationOrchestrator.js:151`, `ui/stuntCallout.js:789` |
| `massline:threat` | `systems/masslineThreats.js:273` | `systems/presentationOrchestrator.js:127` |
| `massline:throw` | `systems/masslineThrow.js:571` | `systems/lootShards.js:592`, `systems/mines.js:74`, `systems/missions.js:1744`, `systems/tumbleStates.js:120`, `ui/stuntCallout.js:785` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:647` | `render/feel.js:1483` |
| `massline:tumbled` | `systems/tumbleStates.js:512` | `render/feel.js:1469` |
| `mercyService:completed` | `response/mercyService/live.js:226` | — |
| `mercyService:failedForward` | `response/mercyService/live.js:272` | — |
| `mercyService:order` | `ui/physicalJobsPrompt.js:25` | — |
| `mercyService:started` | `response/mercyService/live.js:83` | — |
| `mercyService:tool` | `ui/physicalJobsPrompt.js:28` | — |
| `mercyService:toolResult` | `response/mercyService/live.js:53` | — |
| `meridian:containerRecoupled` | `systems/faction_meridian.js:145` | — |
| `meridian:containerSold` | `data/encounters/701-spine-break.js:191` | — |
| `meridian:couplerSnapped` | `systems/faction_meridian.js:113` | — |
| `meridian:tickerFloor` | `systems/faction_meridian.js:164` | — |
| `mines:armed` | `systems/mines.js:189`, `systems/mines.js:222` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:96` | `audio/audioSystem.js:2844` |
| `mines:detonated` | `systems/mines.js:299` | `audio/audioSystem.js:2757` |
| `mines:placeRequest` | `systems/encounterScripts.js:152`, `systems/survivalArena.js:1384`, `systems/swarmEvents.js:208` | `systems/mines.js:73` |
| `mines:placed` | `systems/mines.js:162` | `systems/survivalArena.js:1082` |
| `mines:released` | `systems/mines.js:334` | — |
| `mines:triggered` | `systems/mines.js:289` | — |
| `mining:beamLocked` | `systems/mining.js:1070` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2601` | `systems/missions.js:1678`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:1084` | `systems/presentationOrchestrator.js:216`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:889` | `ui/miningHud.js:206` |
| `mining:npcExtraction` | `systems/trafficRecoveryOps.js:686` | `systems/fieldDepletion.js:756` |
| `mining:podSplit` | `systems/mining.js:1986` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2546` | `render/asteroidMotionPresentation.js:527`, `systems/presentationOrchestrator.js:213`, `ui/miningHud.js:209` |
| `mining:richCoreCompleted` | `systems/mining.js:2579` | `render/asteroidMotionPresentation.js:528`, `systems/presentationOrchestrator.js:214`, `ui/miningHud.js:210` |
| `mining:richCoreExposed` | `systems/mining.js:2524` | `render/asteroidMotionPresentation.js:526`, `systems/presentationOrchestrator.js:212`, `ui/miningHud.js:208` |
| `mining:richCoreFizzle` | `systems/mining.js:2583` | `render/asteroidMotionPresentation.js:529`, `systems/presentationOrchestrator.js:215`, `ui/miningHud.js:211` |
| `mining:seamHit` | `systems/mining.js:2903` | `systems/presentationOrchestrator.js:205` |
| `mining:start` | `systems/mining.js:462`, `systems/mining.js:561`, `systems/mining.js:702`, `systems/mining.js:1932` | `audio/audioSystem.js:2729`, `render/asteroidMotionPresentation.js:521`, `render/authoredMotion.js:1143`, `render/authoredMotion.js:1170`, `render/vfx.js:2733`, `systems/missions.js:1842`, `systems/onboarding.js:594`, `systems/presentationOrchestrator.js:202`, `ui/miningHud.js:204`, `ui/worldObjectInteraction.js:413` |
| `mining:stop` | `systems/mining.js:834` | `audio/audioSystem.js:2730`, `render/asteroidMotionPresentation.js:522`, `render/authoredMotion.js:1145`, `render/authoredMotion.js:1171`, `render/vfx.js:2734`, `systems/presentationOrchestrator.js:203`, `ui/miningHud.js:205` |
| `mining:tick` | `systems/automation.js:1211`, `systems/mining.js:1105` | `audio/audioSystem.js:2731`, `render/vfx.js:2735`, `systems/presentationOrchestrator.js:204`, `ui/miningHud.js:207` |
| `mining:ventBonus` | `systems/mining.js:933` | — |
| `mining:ventReady` | `systems/mining.js:870` | `systems/presentationOrchestrator.js:209` |
| `mining:yield` | `balance/careerCohorts.js:2297`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:928`, `systems/mining.js:1303`, `systems/mining.js:1376`, `systems/mining.js:2087`, `systems/mining.js:2576` | `careers/origins/prospectorOrigin.js:636`, `render/authoredMotion.js:1144`, `render/vfx.js:2738`, `systems/encounterDirector.js:369`, `systems/missions.js:1661`, `systems/onboarding.js:595`, `systems/presentationOrchestrator.js:210` |
| `missile:guidanceLost` | `systems/weapons.js:1116` | — |
| `mission:abandon` | `systems/moralTrap.js:310` | `systems/missions.js:1596` |
| `mission:abandoned` | — | `systems/contractClauses.js:375` |
| `mission:accepted` | `systems/missions.js:2296` | `audio/audioSystem.js:2859`, `save/saveSystem.js:584`, `systems/aftermathWrecks.js:1084`, `systems/contractClauses.js:370`, `systems/contractClauses.js:371`, `systems/economy.js:1701`, `systems/encounterDirector.js:371`, `systems/fenceDesk.js:53`, `systems/moralTrap.js:191`, `systems/onboarding.js:597`, `ui/screens/missionLog.js:2612`, `ui/wreckChoicePrompt.js:45` |
| `mission:completed` | `systems/missions.js:4951`, `systems/missions.js:4971`, `systems/missions.js:5203` | `audio/audioSystem.js:2863`, `balance/careerCohorts.js:2235`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:585`, `systems/aftermathWrecks.js:1085`, `systems/claims.js:418`, `systems/contractClauses.js:372`, `systems/contractClauses.js:379`, `systems/crew.js:65`, `systems/economyContracts.js:265`, `systems/encounterDirector.js:380`, `systems/factions.js:480`, `systems/fenceDesk.js:54`, `systems/lossLedger.js:449`, `systems/onboarding.js:598`, `systems/story.js:244`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2613` |
| `mission:conditionBroken` | `systems/contractClauses.js:674`, `systems/missions.js:2078` | — |
| `mission:conditionPending` | `systems/missions.js:2131` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:642`, `systems/missions.js:2061` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:653`, `systems/missions.js:2069` | `systems/missions.js:1807` |
| `mission:expired` | `systems/missions.js:5700` | `audio/audioSystem.js:2871`, `save/saveSystem.js:587`, `systems/aftermathWrecks.js:1087`, `systems/contractClauses.js:374`, `systems/contractClauses.js:384`, `systems/encounterDirector.js:385`, `systems/factions.js:489`, `systems/fenceDesk.js:60`, `ui/screens/missionLog.js:2615` |
| `mission:failed` | `systems/missions.js:5626` | `audio/audioSystem.js:2870`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:586`, `systems/aftermathWrecks.js:1086`, `systems/contractClauses.js:373`, `systems/encounterDirector.js:381`, `systems/factions.js:488`, `systems/fenceDesk.js:55`, `systems/story.js:245`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2614` |
| `mission:forceEvent` | `data/encounters/1206-the-fire-sale.js:124`, `systems/economyContracts.js:871` | `systems/economy.js:1825` |
| `mission:gateCleared` | `systems/missions.js:4178`, `systems/missions.js:4304` | — |
| `mission:offerBoarded` | `systems/missionBoardOps.js:1045` | `systems/aftermathWrecks.js:1083`, `systems/economyContracts.js:246` |
| `mission:offered` | `response/mercyService/live.js:136`, `systems/aftermathWrecks.js:2060`, `systems/alienEcology.js:579`, `systems/careerContracts.js:329`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:403`, `systems/lossInvestigation.js:284`, `systems/lossLedger.js:379`, `systems/postEndingReplay.js:342`, `systems/salvage.js:1257`, `systems/uniqueWrecks.js:1075` | `systems/economy.js:1700`, `systems/lossInvestigation.js:128`, `systems/missions.js:1601`, `systems/survivorPod.js:599` |
| `mission:setPieceTransition` | `systems/missions.js:4910` | `systems/lossInvestigation.js:130` |
| `mission:setPieceTravelLine` | `systems/missionStoryOps.js:1287` | — |
| `mission:spawnDeferred` | `systems/missionSpawningOps.js:846` | — |
| `mission:targetsProjected` | `systems/missionSpawningOps.js:63` | — |
| `mission:updated` | `missions/blackFlagMissions.js:183`, `systems/contractClauses.js:647`, `systems/contractClauses.js:657`, `systems/contractClauses.js:686`, `systems/missionBoardOps.js:84`, `systems/missionBoardOps.js:238`, `systems/missionBoardOps.js:429`, `systems/missionBoardOps.js:545`, `systems/missionBoardOps.js:837`, `systems/missionBoardOps.js:871`, `systems/missionBoardOps.js:883`, `systems/missionBoardOps.js:1044`, `systems/missionObjectiveOps.js:43`, `systems/missionObjectiveOps.js:82`, `systems/missionObjectiveOps.js:95`, `systems/missionObjectiveOps.js:110`, `systems/missionObjectiveOps.js:126`, `systems/missionObjectiveOps.js:172`, `systems/missionObjectiveOps.js:255`, `systems/missionObjectiveOps.js:411`, `systems/missionObjectiveOps.js:420`, `systems/missionObjectiveOps.js:697`, `systems/missionObjectiveOps.js:723`, `systems/missionObjectiveOps.js:794`, `systems/missionObjectiveOps.js:810`, `systems/missionObjectiveOps.js:854`, `systems/missionObjectiveOps.js:875`, `systems/missionObjectiveOps.js:905`, `systems/missionObjectiveOps.js:928`, `systems/missionObjectiveOps.js:1039`, `systems/missionObjectiveOps.js:1222`, `systems/missionObjectiveOps.js:2364`, `systems/missionObjectiveOps.js:2579`, `systems/missionObjectiveOps.js:2664`, `systems/missionSpawningOps.js:507`, `systems/missionSpawningOps.js:811`, `systems/missionSpawningOps.js:837`, `systems/missionSpawningOps.js:934`, `systems/missionSpawningOps.js:1062`, `systems/missionSpawningOps.js:1238`, `systems/missionStoryOps.js:133`, `systems/missionStoryOps.js:215`, `systems/missionStoryOps.js:285`, `systems/missionStoryOps.js:489`, `systems/missionStoryOps.js:522`, `systems/missionStoryOps.js:537`, `systems/missionStoryOps.js:551`, `systems/missionStoryOps.js:736`, `systems/missionStoryOps.js:878`, `systems/missionStoryOps.js:926`, `systems/missionStoryOps.js:1012`, `systems/missionStoryOps.js:1522`, `systems/missionStoryOps.js:1806`, `systems/missionStoryOps.js:1920`, `systems/missionStoryOps.js:1966`, `systems/missions.js:1651`, `systems/missions.js:2065`, `systems/missions.js:2073`, `systems/missions.js:2091`, `systems/missions.js:2161`, `systems/missions.js:2175`, `systems/missions.js:2189`, `systems/missions.js:2204`, `systems/missions.js:2309`, `systems/missions.js:2539`, `systems/missions.js:2566`, `systems/missions.js:2724`, `systems/missions.js:2992`, `systems/missions.js:3857`, `systems/missions.js:4095`, `systems/missions.js:4117`, `systems/missions.js:4190`, `systems/missions.js:4234`, `systems/missions.js:4310`, `systems/missions.js:4348`, `systems/missions.js:4443`, `systems/missions.js:4450`, `systems/missions.js:5189`, `systems/missions.js:5640`, `systems/missions.js:5711`, `systems/wakeHandoffRuntime.js:25`, `systems/workingBattlefieldRuntime.js:148` | `systems/contractClauses.js:393`, `ui/screens/missionLog.js:2611`, `ui/station/screens/contracts.js:1546` |
| `mission:venueFailure` | `response/mercyService/live.js:283`, `systems/wreckCourt.js:1071` | `systems/missions.js:1702` |
| `mission:venueProof` | `response/mercyService/live.js:227`, `systems/wreckCourt.js:1034` | `systems/missions.js:1690` |
| `mode:changed` | `core/simLaneCommands.js:85`, `main.js:384`, `main.js:1039`, `main.js:1081`, `main.js:1093`, `save/saveSystem.js:6131`, `save/saveSystem.js:6157`, `save/saveSystem.js:6809`, `save/saveSystem.js:7127` | `systems/autoTargetAssist.js:143`, `systems/presentationAdapters.js:223`, `systems/scanner.js:1080`, `ui/loadingPresenter.js:562`, `ui/screenManager.js:732`, `ui/screens/mainMenu.js:1212`, `ui/uiRoot.js:1138`, `ui/wingmanRadial.js:331` |
| `module:equipped` | `systems/ships.js:2783` | `systems/onboarding.js:634`, `systems/onboarding.js:639`, `systems/onboarding.js:649`, `systems/onboarding.js:949`, `systems/ships.js:1705`, `systems/survivalDraft.js:198`, `systems/world.js:664` |
| `module:fitRefused` | `systems/ships.js:2274`, `systems/ships.js:2728`, `systems/ships.js:2794` | `ui/station/screens/shipworks.js:4355` |
| `module:granted` | `systems/ships.js:2350` | — |
| `module:purchased` | `systems/ships.js:2332` | — |
| `module:sold` | `systems/ships.js:2263` | — |
| `module:unequipped` | `systems/ships.js:1931`, `systems/ships.js:2823` | `systems/ships.js:1706`, `systems/survivalDraft.js:199`, `systems/world.js:665` |
| `moment:amended` | `systems/bulletTime.js:278` | `ui/screens/clips.js:117` |
| `moment:holyShit` | — | `render/feel.js:1458`, `systems/gamepad.js:1129` |
| `moralMemory:remember` | `data/encounters/1211-the-forecastle-vote.js:437`, `data/encounters/1211-the-forecastle-vote.js:444` | `systems/encounterDirector.js:356` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | `systems/encounterDirector.js:358` |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:190` |
| `moralTrap:resolved` | `systems/moralTrap.js:306` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:254` | `ui/moralTrapPrompt.js:37` |
| `morrow:launch` | `systems/morrow.js:284` | — |
| `morrow:met` | `systems/morrow.js:223` | — |
| `morrow:voice` | `systems/morrow.js:197` | — |
| `mothlight:identified` | `systems/mothlight.js:225` | `ui/mothlightPrompt.js:6` |
| `mothlight:lampReleased` | `systems/mothlight.js:132` | — |
| `mothlight:phase` | `systems/mothlight.js:179` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:3659` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:395` |
| `nav:abortRoute` | — | `systems/routeFollower.js:404` |
| `nav:autopilot` | `systems/flight.js:408`, `systems/flightV3.js:1692`, `systems/world.js:5969` | `systems/routeFollower.js:407` |
| `nav:engageRoute` | `systems/routeFollower.js:402` | `systems/routeFollower.js:397` |
| `nav:routeBrake` | — | `audio/audioSystem.js:2969` |
| `nav:waypoint` | `save/saveSystem.js:7821`, `systems/claims.js:2093`, `systems/claims.js:2101`, `systems/missionObjectiveOps.js:61`, `systems/missionObjectiveOps.js:987`, `systems/missionStoryOps.js:2110`, `systems/missions.js:1620`, `systems/missions.js:2981`, `systems/missions.js:3057`, `systems/missions.js:3089`, `systems/world.js:5968`, `ui/market/tradeLogic.js:573` | `render/authoredMotion.js:1173` |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:135` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:205` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:131` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `nest:waspsLaunched` | `data/encounters/705-the-nest.js:256` | — |
| `news:headline` | `systems/aftermathWrecks.js:802`, `systems/aftermathWrecks.js:869`, `systems/e1EncounterRuntime.js:225`, `systems/lastShift.js:194`, `systems/nemesisSignals.js:25`, `systems/presentationOrchestrator.js:1284`, `systems/trafficCausalChainOps.js:2469`, `systems/trafficRecoveryOps.js:336`, `ui/marketNews.js:295` | — |
| `news:publish` | `data/encounters/362-the-salvage-watch.js:171`, `data/encounters/362-the-salvage-watch.js:186`, `data/encounters/362-the-salvage-watch.js:280`, `data/encounters/365-the-grandee.js:102`, `data/encounters/365-the-grandee.js:121`, `data/encounters/365-the-grandee.js:169`, `data/encounters/367-the-salvage-tail.js:165`, `data/encounters/367-the-salvage-tail.js:185`, `systems/aftermathWrecks.js:810`, `systems/aftermathWrecks.js:887`, `systems/blindWelderRuntime.js:162`, `systems/choirReliefBerth.js:321`, `systems/choirReliefBerth.js:361`, `systems/claims.js:2638`, `systems/claims.js:2842`, `systems/claims.js:3354`, `systems/claims.js:3401`, `systems/crSituationKit.js:69`, `systems/driftAuctionRuntime.js:194`, `systems/driftAuctionRuntime.js:211`, `systems/driftAuctionRuntime.js:395`, `systems/eighthBellRuntime.js:139`, `systems/factions.js:581`, `systems/glueMeetMassRuntime.js:120`, `systems/impoundLot.js:227`, `systems/memorialThief.js:135`, `systems/npcJobsRuntime.js:1415`, `systems/presentationOrchestrator.js:1291`, `systems/runawayKilnRuntime.js:80`, `systems/runawayKilnRuntime.js:97`, `systems/trafficCausalChainOps.js:2079`, `systems/trafficJobOps.js:819`, `systems/uniqueWrecks.js:628`, `systems/uniqueWrecks.js:1939`, `systems/world.js:978`, `systems/world.js:4585`, `systems/worldClock.js:173`, `systems/worldPressure.js:446`, `ui/watchlistHud.js:77` | — |
| `news:render` | `ui/hud.js:1850` | — |
| `npc:hailed` | `systems/barkDirector.js:1857`, `systems/barkDirector.js:1903`, `systems/barkDirector.js:1944` | `render/authoredMotion.js:1208` |
| `npcJobs:towAssistComplete` | `systems/npcJobsRuntime.js:3621` | `systems/scanner.js:1075` |
| `npcJobs:towAssistLost` | `systems/npcJobsRuntime.js:3143`, `systems/npcJobsRuntime.js:3706`, `systems/npcJobsRuntime.js:3745` | `systems/missions.js:1853`, `systems/scanner.js:1076` |
| `npcjobs:closeCall` | `systems/npcJobsRuntime.js:5205` | — |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:6189` | — |
| `npcjobs:distress` | `systems/npcJobsRuntime.js:6314` | `systems/traffic.js:2049` |
| `npcjobs:errand` | `systems/laneErrands.js:317` | — |
| `npcjobs:hold` | — | `systems/traffic.js:2046` |
| `npcjobs:load` | — | `systems/traffic.js:2044` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1290`, `systems/npcJobsRuntime.js:1304` | `systems/barkDirector.js:833` |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1297` | `ui/station/barContacts.js:189` |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1277` | `ui/station/barContacts.js:188` |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1275` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3874` | `render/authoredMotion.js:1193`, `systems/barkDirector.js:837` |
| `npcjobs:oncallTenderRetired` | `systems/npcJobsRuntime.js:5735` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:5281` | — |
| `npcjobs:surveyMarked` | `systems/npcJobsRuntime.js:1374` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:5353` | `render/npcJobSignatureVfx.js:711`, `render/npcJobSignatureVfx.js:902` |
| `npcjobs:unload` | — | `systems/traffic.js:2045` |
| `npcjobs:work` | — | `systems/traffic.js:2043` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:5485` | `systems/stationSideEventDirector.js:98` |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:5508` | — |
| `occupation:delivered` | `systems/scavengerOccupationSwitch.js:238` | — |
| `occupation:lost` | `systems/scavengerOccupationSwitch.js:266` | — |
| `occupation:switched` | `systems/scavengerOccupationSwitch.js:209` | — |
| `onboarding:drillFolded` | `systems/onboarding.js:1743` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:2131`, `systems/onboarding.js:2873`, `systems/onboarding.js:3722` | — |
| `onboarding:rosterPrewarm` | `systems/onboarding.js:2574` | — |
| `onboarding:swingClinic` | `systems/onboarding.js:2136` | — |
| `optic:beamContact` | `systems/combat.js:1600` | — |
| `optic:contact` | `systems/weapons.js:2544`, `systems/weapons.js:2608` | `audio/audioSystem.js:2685` |
| `optic:rekindled` | — | `audio/audioSystem.js:2686` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1239` | `systems/world.js:671` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:2231` | `systems/story.js:161` |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1352` | — |
| `orrinWitness:submitted` | `systems/story.js:1380` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:7118` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:673` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:6914` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:6949` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:7078` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:7032` | `ui/recoveryEncounterPrompt.js:478` |
| `palletJack:drop` | `ui/palletJackPrompt.js:19` | — |
| `palletJack:lost` | `systems/palletJack.js:360` | — |
| `palletJack:offer` | `systems/palletJack.js:274` | `ui/palletJackPrompt.js:6` |
| `palletJack:phase` | `systems/palletJack.js:181` | — |
| `palletJack:released` | `systems/palletJack.js:257` | — |
| `palletJack:trail` | `ui/palletJackPrompt.js:20` | — |
| `patrol:proximity` | `systems/encounterScripts.js:435` | `systems/economy.js:1818`, `systems/moralTrap.js:189` |
| `pds:intercept` | `systems/countermeasures.js:470` | `audio/audioSystem.js:2670` |
| `physics:authorityStalled` | — | `ui/toasts.js:830` |
| `physics:contactsCompleted` | — | `systems/collisionConsequences.js:98` |
| `physics:impact` | `core/physics.js:2408` | `audio/audioSystem.js:2680`, `gallery/orbital/session.js:118`, `missions/racingOpponents.js:337`, `render/asteroidMotionPresentation.js:517`, `render/feel.js:1435`, `render/shipMicroMotion.js:1298`, `render/vfx.js:2673`, `systems/aftermathWrecks.js:1059`, `systems/asteroidSites.js:833`, `systems/barkDirector.js:918`, `systems/collisionConsequences.js:97`, `systems/environmentMaterials.js:100`, `systems/fields.js:718`, `systems/flightV3.js:239`, `systems/fragileCargo.js:340`, `systems/gamepad.js:990`, `systems/heistFacilities.js:325`, `systems/impulseCharges.js:322`, `systems/lootShards.js:591`, `systems/masslineImpactDamage.js:49`, `systems/reactiveMatter.js:530`, `systems/ships.js:1829`, `systems/survivalResults.js:511`, `systems/swarmArena.js:613`, `systems/swarmElites.js:137`, `systems/volatileExposure.js:215`, `testing/lab/titleVerbScenario.js:51`, `testing/motionScenarios.js:1764` |
| `pickup:collected` | `core/physics.js:2179`, `systems/combat.js:922`, `systems/mining.js:1696`, `systems/mining.js:2698`, `systems/uniqueWrecks.js:1817` | `audio/audioSystem.js:2809`, `render/vfx.js:2779`, `save/saveSystem.js:515`, `systems/economy.js:1770`, `systems/encounterDirector.js:340`, `systems/lawSecurity.js:405`, `systems/mining.js:286`, `systems/missions.js:1637`, `systems/onboarding.js:596`, `systems/onboarding.js:681`, `systems/onboarding.js:754`, `systems/presentationOrchestrator.js:217`, `systems/swarmArena.js:625`, `systems/swarmEvents.js:92`, `systems/swarmSupply.js:110`, `systems/tetherGameplay.js:351`, `systems/traffic.js:2057`, `systems/traffic.js:2058`, `systems/world.js:674`, `systems/world.js:675`, `systems/world.js:678`, `systems/world.js:680`, `systems/world.js:750` |
| `pirateDisengage:surrenderOffer` | — | `ui/pirateParleyPrompt.js:220` |
| `pirateDisengage:triggered` | `data/encounters/344-opening-hauler-raid.js:102` | `systems/combatOutcome.js:300` |
| `pirateDisengage:verdict` | `ui/pirateParleyPrompt.js:198` | — |
| `pirateDisengage:yieldResolved` | — | `ui/pirateParleyPrompt.js:221` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:153` | `systems/pirateParley.js:98` |
| `pirateParley:demand` | `systems/scanner.js:1681` | `ui/pirateParleyPrompt.js:218` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:299`, `ui/pirateParleyPrompt.js:219` |
| `pirateParley:started` | — | `systems/combatOutcome.js:298` |
| `pitborn:ballastAccreted` | `systems/faction_pitborn.js:192` | — |
| `pitborn:ballastHorn` | `systems/faction_pitborn.js:227` | — |
| `pitborn:ballastNamed` | `systems/faction_pitborn.js:235` | — |
| `pitborn:ballastStart` | `systems/faction_pitborn.js:209` | — |
| `pitborn:crowdStyle` | `systems/faction_pitborn.js:142` | — |
| `pitborn:crowdTier` | `systems/faction_pitborn.js:150` | — |
| `pitborn:cullSettled` | `systems/faction_pitborn.js:168` | — |
| `pitborn:scoreboard` | `systems/faction_pitborn.js:153` | — |
| `pitborn:yardmasterDown` | `systems/faction_pitborn.js:281` | — |
| `pitborn:yardmasterStripped` | `systems/faction_pitborn.js:276` | — |
| `planet:bandFirst` | `systems/planetRuntime.js:556` | `systems/onboarding.js:967` |
| `planet:collector` | `systems/planetRuntime.js:771` | `audio/audioSystem.js:2851`, `render/authoredMotion.js:1212`, `systems/onboarding.js:961` |
| `planet:harvest` | `systems/planetRuntime.js:872` | `audio/audioSystem.js:2852` |
| `planet:harvestDenied` | `systems/planetRuntime.js:879` | `audio/audioSystem.js:2853` |
| `planet:npcHarvest` | `systems/planetRuntime.js:859` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:649`, `systems/planetRuntime.js:662` | `audio/audioSystem.js:2854` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:746` | `audio/audioSystem.js:2855` |
| `planet:registered` | `systems/planetRuntime.js:262` | — |
| `planet:unregistered` | `systems/planetRuntime.js:451` | — |
| `player:death` | `systems/combat.js:1055`, `systems/combat.js:1188`, `systems/world.js:6333` | `audio/audioSystem.js:2727`, `render/feel.js:1343`, `render/shipMicroMotion.js:1309`, `render/vfx.js:2732`, `save/saveSystem.js:522`, `sim/killcamTape.js:476`, `systems/aftermathWrecks.js:1056`, `systems/crew.js:80`, `systems/encounterDirector.js:386`, `systems/flightV3.js:244`, `systems/input.js:1382`, `systems/lawSecurity.js:404`, `systems/lossLedger.js:448`, `systems/missions.js:1801`, `systems/onboarding.js:627`, `systems/onboarding.js:680`, `systems/surrenderRecovery.js:107`, `systems/survivalResults.js:519`, `systems/survivalRun.js:146`, `systems/survivorPod.js:606`, `systems/tetherGameplay.js:342`, `systems/world.js:654`, `ui/commandBar.js:405`, `ui/confirm.js:303`, `ui/survivalHud.js:262` |
| `player:recoveryFailed` | `systems/combat.js:1241` | `ui/screens/gameOver.js:584` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:480` | `systems/combat.js:772` |
| `player:respawn` | `systems/combat.js:1314` | `audio/audioSystem.js:2728`, `render/shipMicroMotion.js:1308`, `save/saveSystem.js:523`, `save/saveSystem.js:599`, `sim/killcamTape.js:473`, `systems/flightV3.js:245`, `systems/input.js:1383`, `systems/tetherGameplay.js:343`, `ui/commandBar.js:409`, `ui/screens/gameOver.js:576` |
| `player:scannedByPatrol` | `systems/economy.js:5450` | `render/authoredMotion.js:1191`, `render/vfx.js:2719`, `systems/lawSecurity.js:418`, `systems/missions.js:1791`, `ui/customsPrompt.js:154` |
| `poi:discovered` | `systems/world.js:1007`, `systems/world.js:6043`, `systems/world.js:6141`, `systems/world.js:6630`, `systems/world.js:6660` | `audio/audioSystem.js:2884`, `systems/encounterDirector.js:359`, `systems/world.js:707` |
| `poi:identified` | `systems/world.js:6148`, `systems/world.js:6661` | `systems/encounterDirector.js:360`, `systems/missions.js:1607`, `systems/world.js:708` |
| `postEndingReplay:cycleCompleted` | — | `systems/sectorSim.js:139`, `ui/screens/missionLog.js:2635` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:286` | `ui/screens/missionLog.js:2634` |
| `presentation:audioCue` | `render/vfx.js:6069`, `systems/presentationAdapters.js:579` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:492` | — |
| `presentation:caption` | `audio/audioSystem.js:3161`, `audio/audioSystem.js:6466`, `systems/asteroidSites.js:2988`, `systems/asteroidSites.js:3045`, `systems/factionPresence.js:1261`, `systems/factionPresence.js:1715`, `systems/factionPresence.js:1730`, `systems/factionPresence.js:1748`, `systems/factionPresence.js:1810`, `systems/presentationAdapters.js:679`, `systems/shipjack.js:79`, `systems/story.js:1183`, `systems/story.js:1435` | — |
| `presentation:cue` | `systems/aftermathWrecks.js:1467`, `systems/cargo.js:1201`, `systems/planetRuntime.js:673`, `systems/salvageActions.js:280`, `systems/salvageActions.js:492` | `audio/audioSystem.js:2997`, `render/vfx.js:2773`, `render/vfx.js:2774`, `render/vfx.js:2775`, `systems/presentationAdapters.js:220` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:474` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:395`, `systems/presentationAdapters.js:657` | — |
| `presentation:vfxCue` | `render/vfx.js:2792`, `systems/bombs.js:1330`, `systems/fields.js:1846`, `systems/fields.js:2125`, `systems/fields.js:2732`, `systems/fields.js:2783`, `systems/hullBurst.js:239`, `systems/hullBurst.js:351`, `systems/hullBurst.js:402`, `systems/hullBurst.js:433`, `systems/hullBurst.js:619`, `systems/massSeed.js:329`, `systems/massSeed.js:445`, `systems/massSeed.js:539`, `systems/massSeed.js:581`, `systems/masslineThrow.js:578`, `systems/missions.js:2322`, `systems/missions.js:5226`, `systems/planetRuntime.js:902`, `systems/presentationAdapters.js:541`, `systems/tumbleStates.js:514`, `systems/tumbleStates.js:624`, `systems/volatileExposure.js:482`, `systems/volatileExposure.js:556`, `systems/weapons.js:1927`, `systems/weapons.js:2058`, `systems/weapons.js:3285` | `render/vfx.js:2778` |
| `projectile:bank` | — | `render/vfx.js:2667` |
| `projectile:hit` | `core/physics.js:1366`, `core/physics.js:1557`, `systems/sectorSim.js:751` | `audio/audioSystem.js:2663`, `combat/tetherWebs.js:61`, `render/vfx.js:2666`, `systems/bombs.js:700`, `systems/combat.js:764`, `systems/gamepad.js:1103`, `systems/missions.js:1745` |
| `projectile:nearMiss` | `core/physics.js:1517` | `audio/audioSystem.js:2666`, `systems/presentationOrchestrator.js:175` |
| `projectile:ricochet` | — | `render/vfx.js:2668` |
| `quiet:routeSold` | `data/encounters/702-the-swap.js:52` | — |
| `race:abort` | — | `systems/missions.js:1822` |
| `race:ended` | `systems/missions.js:5560` | — |
| `race:launchFailed` | — | `save/saveSystem.js:571` |
| `race:reset` | — | `systems/missions.js:1820` |
| `race:restart` | `ui/input.js:544` | `systems/missions.js:1821` |
| `race:restarted` | `systems/missions.js:4032` | — |
| `race:toggleView` | `ui/input.js:537`, `ui/input.js:1354` | — |
| `range:opened` | `ui/screens/range.js:2690` | `systems/onboarding.js:667` |
| `ravel:cast` | `systems/ravel.js:176` | — |
| `ravel:destroyed` | `systems/ravel.js:211` | — |
| `ravel:hit` | `systems/ravel.js:190` | — |
| `ravel:pacified` | `systems/ravel.js:199` | — |
| `ravel:telegraph` | `systems/ravel.js:157` | — |
| `ravel:unthreaded` | `systems/ravel.js:196` | — |
| `ravel:voice` | `systems/ravel.js:130` | — |
| `reach:trophyHung` | `data/encounters/705-the-nest.js:61` | — |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | `systems/onboarding.js:3080` | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `redKite:aborted` | `systems/redKite.js:177` | — |
| `redKite:course` | `ui/redKitePrompt.js:18` | — |
| `redKite:finished` | `systems/redKite.js:203` | — |
| `redKite:offer` | `systems/redKite.js:155` | `ui/redKitePrompt.js:6` |
| `redKite:start` | `ui/redKitePrompt.js:19` | — |
| `redKite:started` | `systems/redKite.js:170` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:277` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:278` |
| `rescue:beat` | `systems/onboarding.js:3049`, `systems/onboarding.js:3109` | — |
| `rescue:complete` | `systems/onboarding.js:3060` | — |
| `rescue:started` | `systems/onboarding.js:2633` | `systems/onboarding.js:628` |
| `rescuedWorker:returned` | `systems/rescuedWorkerReturn.js:440` | — |
| `research:pointsChanged` | `systems/missionObjectiveOps.js:444`, `systems/missionObjectiveOps.js:498`, `systems/missionObjectiveOps.js:532`, `systems/missionObjectiveOps.js:579`, `systems/missionStoryOps.js:1766`, `systems/missions.js:5142`, `systems/missions.js:5158` | `ui/alerts.js:496` |
| `resonance:patrolQueued` | `systems/encounterDirector.js:3191` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1501` | `systems/encounterDirector.js:390` |
| `rhythm:phase` | `systems/encounterDirector.js:585` | — |
| `rubric:destroyed` | `systems/rubric.js:353` | — |
| `rubric:last` | `systems/rubric.js:482` | — |
| `rubric:marked` | `systems/rubric.js:437` | — |
| `rubric:voice` | `systems/rubric.js:264` | — |
| `ruckus:pulse` | `systems/ruckus.js:213` | — |
| `ruckus:retrieved` | `systems/ruckus.js:198` | — |
| `ruckus:state` | `systems/ruckus.js:147` | — |
| `ruckus:voice` | `systems/ruckus.js:141` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:376` | `ui/station/barContacts.js:146` |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:134` |
| `run:awardRequested` | `systems/swarmBrood.js:1605`, `systems/swarmEvents.js:275`, `ui/sandbox/sandboxSetup.js:1334`, `ui/sandbox/sandboxSetup.js:1349` | `systems/runSession.js:89` |
| `run:awarded` | — | `ui/survivalHud.js:242` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1254`, `ui/sandbox/sandboxSetup.js:1296` | `systems/runSession.js:86` |
| `run:circuitChoiceApplied` | — | `systems/survivalDraft.js:181` |
| `run:circuitChoiceRequested` | — | `systems/survivalRun.js:143` |
| `run:draftLockRequested` | `ui/screens/crucibleDraft.js:1588` | `systems/survivalDraft.js:189` |
| `run:draftOffered` | — | `ui/screens/crucibleDraft.js:1014` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:921`, `ui/screens/crucibleDraft.js:926`, `ui/screens/crucibleDraft.js:1131`, `ui/screens/crucibleDraft.js:1463`, `ui/screens/crucibleDraft.js:1572`, `ui/screens/crucibleDraft.js:1741` | `systems/survivalDraft.js:178` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:1069` | `systems/survivalDraft.js:190` |
| `run:draftResolved` | — | `systems/survivalRun.js:137` |
| `run:endRequested` | `save/saveSystem.js:420` | `systems/runSession.js:88` |
| `run:ended` | — | `audio/audioSystem.js:2826`, `systems/survivalAnnounce.js:350`, `systems/survivalArena.js:1074`, `systems/survivalDraft.js:205`, `systems/survivalResults.js:556`, `systems/survivalRun.js:131`, `systems/survivalWave.js:186`, `systems/swarmArena.js:615`, `systems/swarmChain.js:128`, `systems/swarmElites.js:141`, `systems/swarmEvents.js:91`, `systems/swarmJuice.js:170`, `systems/swarmLegendaries.js:104`, `systems/swarmSupply.js:112`, `ui/swarmJuiceHud.js:102` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:140` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:348`, `ui/survivalHud.js:243` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1373` | `systems/ships.js:1879`, `systems/survivalRun.js:132`, `systems/swarmSupply.js:105`, `systems/world.js:703` |
| `run:modifierChosen` | — | `systems/survivalRun.js:138` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:91` |
| `run:modifierRecorded` | — | `systems/survivalArena.js:1034` |
| `run:openingLessonReleased` | — | `systems/survivalAnnounce.js:346`, `systems/survivalArena.js:1069`, `systems/swarmArena.js:614` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1374` | `systems/survivalRun.js:133` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1843`, `ui/screens/crucibleDraft.js:1860` | `systems/survivalDraft.js:182` |
| `run:refitClosed` | — | `systems/survivalRun.js:139` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:2228` | `systems/survivalDraft.js:183` |
| `run:refitSellRequested` | `ui/screens/crucibleDraft.js:2259` | `systems/survivalDraft.js:188` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:2224` | `systems/survivalDraft.js:184` |
| `run:resultsReady` | — | `systems/achievements.js:1181`, `ui/uiRoot.js:1624` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:194` |
| `run:spendRequested` | — | `systems/runSession.js:90` |
| `run:spent` | — | `systems/survivalDraft.js:193` |
| `run:started` | — | `audio/audioSystem.js:2825`, `sim/killcamTape.js:469`, `systems/combatOutcome.js:288`, `systems/survivalAnnounce.js:341`, `systems/survivalResults.js:501`, `systems/survivalRun.js:129`, `systems/swarmElites.js:140`, `systems/swarmJuice.js:169`, `systems/swarmLegendaries.js:103`, `ui/survivalHud.js:244`, `ui/swarmJuiceHud.js:101`, `ui/uiRoot.js:1636` |
| `run:threatRequested` | — | `systems/runSession.js:92` |
| `run:transitionRequested` | `systems/survivalRun.js:723` | `systems/runSession.js:87` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:349`, `systems/survivalDraft.js:177`, `systems/survivalResults.js:555`, `systems/survivalRun.js:130`, `systems/survivalWave.js:185`, `systems/swarmSupply.js:106` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:347`, `systems/survivalArena.js:1068`, `systems/survivalResults.js:509`, `systems/swarmEvents.js:90`, `systems/swarmLegendaries.js:102` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:135` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:344` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:520` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:342`, `systems/survivalArena.js:1035`, `systems/survivalWave.js:183`, `systems/swarmArena.js:610`, `systems/swarmJuice.js:163`, `systems/tetherGameplay.js:352`, `ui/survivalHud.js:255` |
| `run:waveProgress` | — | `ui/survivalHud.js:256` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:343`, `systems/survivalResults.js:506`, `systems/survivalWave.js:184`, `systems/swarmArena.js:611`, `systems/swarmEvents.js:89`, `systems/swarmJuice.js:164`, `ui/swarmJuiceHud.js:100` |
| `ruud:cut` | `systems/ruud.js:411` | — |
| `ruud:spared` | `systems/ruud.js:384` | — |
| `ruud:voice` | `systems/ruud.js:310` | — |
| `sable:demonstrated` | `ui/station/screens/shipworks.js:5277` | — |
| `salvage:actionRead` | `systems/salvageActions.js:226` | — |
| `salvage:bayCashedIn` | `systems/cargo.js:1241` | — |
| `salvage:changed` | `systems/cargo.js:558`, `systems/cargo.js:1242` | — |
| `salvage:claimJumped` | `systems/mining.js:2253` | `systems/missions.js:1843` |
| `salvage:communicatorFound` | `systems/salvage.js:1258` | `systems/encounterDirector.js:361`, `systems/story.js:283`, `ui/wreckChoicePrompt.js:44` |
| `salvage:completed` | `systems/mining.js:2108` | `render/vfx.js:2737`, `systems/aftermathWrecks.js:1077`, `systems/lawSecurity.js:412`, `systems/missions.js:1676`, `systems/missions.js:1844`, `systems/story.js:265` |
| `salvage:cookerFlight` | `systems/salvageActions.js:487` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:633` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:277` | `render/authoredMotion.js:1198` |
| `salvage:cutComplete` | `systems/mining.js:733` | `audio/audioSystem.js:2829`, `render/authoredMotion.js:1167`, `render/vfx.js:2736` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | `systems/salvage.js:177` |
| `salvage:npcExtraction` | `systems/trafficRoleOps.js:2033` | `render/authoredMotion.js:1166` |
| `salvage:npcUnload` | `systems/trafficCausalChainOps.js:2203` | `systems/economy.js:1774` |
| `salvage:placed` | `systems/salvage.js:576` | `systems/lossInvestigation.js:126`, `systems/survivorPod.js:583` |
| `salvage:reactorBurst` | `systems/salvageActions.js:739` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:344` | `systems/salvage.js:173` |
| `salvage:reactorVented` | `systems/salvageActions.js:241` | — |
| `salvage:sortDelivered` | `systems/salvage.js:1076` | — |
| `salvage:sortImpact` | `systems/salvage.js:1010` | — |
| `salvage:sortLost` | `systems/salvage.js:1106` | — |
| `salvage:sortSeparated` | `systems/salvage.js:974` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:138` |
| `save:backup` | `save/saveSystem.js:2424` | `ui/screens/saveLoad.js:1109` |
| `save:completed` | `save/saveSystem.js:2430` | `ui/screens/saveLoad.js:1099`, `ui/toasts.js:54`, `ui/uiRoot.js:573` |
| `save:dirty` | `shipjack/fleetOperations.js:69`, `shipjack/fleetOperations.js:149`, `shipjack/fleetOperations.js:167`, `systems/ruckus.js:91`, `systems/shipjack.js:68` | `save/saveSystem.js:499` |
| `save:envelopePrepared` | `save/saveSystem.js:5459`, `save/saveSystem.js:5524`, `save/saveSystem.js:5536` | `main.js:225`, `ui/loadingPresenter.js:610` |
| `save:envelopeSpecPrepared` | `save/saveSystem.js:2966` | `main.js:224`, `ui/screens/saveLoad.js:1123` |
| `save:error` | `main.js:244`, `main.js:1004`, `main.js:1068`, `save/saveSystem.js:1563`, `save/saveSystem.js:2497`, `save/saveSystem.js:5265`, `save/saveSystem.js:5286`, `save/saveSystem.js:5335`, `save/saveSystem.js:5357`, `save/saveSystem.js:5394`, `save/saveSystem.js:5515`, `save/saveSystem.js:5563`, `save/saveSystem.js:5743`, `save/saveSystem.js:5763`, `save/saveSystem.js:5780`, `save/saveSystem.js:5971`, `save/saveSystem.js:5985`, `save/saveSystem.js:6091`, `save/saveSystem.js:6109`, `save/saveSystem.js:6145`, `save/saveSystem.js:6186`, `save/saveSystem.js:6191`, `save/saveSystem.js:6222`, `save/saveSystem.js:6348`, `save/saveSystem.js:6413`, `save/saveSystem.js:6418`, `save/saveSystem.js:6634`, `save/saveSystem.js:7213`, `save/saveSystem.js:7225`, `save/saveSystem.js:7287`, `save/saveSystem.js:8173`, `save/saveSystem.js:8185`, `save/saveSystem.js:8191`, `save/saveSystem.js:8212`, `save/saveSystem.js:8217`, `save/saveSystem.js:8235`, `save/saveSystem.js:8339`, `save/saveSystem.js:8358`, `ui/screens/saveLoad.js:1689` | `systems/aftermathWrecks.js:1092`, `systems/asteroidSites.js:832`, `systems/automation.js:635`, `systems/encounterDirector.js:332`, `systems/traffic.js:2080`, `ui/loadingPresenter.js:587`, `ui/screenManager.js:733`, `ui/screens/mainMenu.js:711`, `ui/screens/mainMenu.js:1222`, `ui/screens/saveLoad.js:1085`, `ui/screens/saveLoad.js:1110`, `ui/uiRoot.js:599` |
| `save:exportRecovery` | `save/saveSystem.js:8127`, `save/saveSystem.js:8154` | `ui/toasts.js:811` |
| `save:loadSpeculationTarget` | `ui/screens/gameOver.js:857`, `ui/screens/pause.js:1292`, `ui/screens/saveLoad.js:1198`, `ui/screens/saveLoad.js:1331` | `save/saveSystem.js:437` |
| `save:loaded` | `save/saveSystem.js:7139` | `audio/audioSystem.js:3245`, `audio/bombAudio.js:460`, `audio/fieldAudio.js:327`, `careers/origins/haulerOriginSystem.js:65`, `combat/kernel.js:202`, `combat/tetherWebs.js:70`, `core/coreSystem.js:530`, `core/physics.js:201`, `main.js:323`, `main.js:331`, `render/feel.js:1245`, `render/shipMicroMotion.js:1293`, `render/vfx.js:2715`, `render/vfx.js:2726`, `save/saveSystem.js:535`, `save/saveSystem.js:562`, `sim/killcamTape.js:472`, `systems/aftermathWrecks.js:1091`, `systems/aiEncounter.js:137`, `systems/asteroidFormations.js:124`, `systems/asteroidSites.js:822`, `systems/autoTargetAssist.js:158`, `systems/automation.js:622`, `systems/barkDirector.js:792`, `systems/beacons.js:54`, `systems/bombs.js:699`, `systems/collisionConsequences.js:109`, `systems/combat.js:814`, `systems/combatOutcome.js:265`, `systems/contractClauses.js:394`, `systems/countermeasures.js:226`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:85`, `systems/economy.js:1837`, `systems/economyContracts.js:284`, `systems/encounterDirector.js:331`, `systems/environmentalMachinery.js:273`, `systems/factionPresence.js:530`, `systems/factionPresence.js:541`, `systems/fields.js:706`, `systems/flight.js:79`, `systems/flightV3.js:212`, `systems/gateControlDirector.js:78`, `systems/heat.js:411`, `systems/heistFacilities.js:337`, `systems/impulseCharges.js:330`, `systems/lawSecurity.js:401`, `systems/longBerth.js:60`, `systems/lossInvestigation.js:132`, `systems/massSeed.js:141`, `systems/masslineSnares.js:139`, `systems/masslineTelemetry.js:121`, `systems/mines.js:78`, `systems/mining.js:304`, `systems/missions.js:1578`, `systems/npcJobsRuntime.js:1079`, `systems/npcJobsRuntime.js:1087`, `systems/npcJobsRuntime.js:1134`, `systems/npcJobsRuntime.js:1137`, `systems/onboarding.js:558`, `systems/planetRuntime.js:155`, `systems/presentationAdapters.js:227`, `systems/presentationOrchestrator.js:287`, `systems/routeFollower.js:424`, `systems/runSession.js:97`, `systems/salvageActions.js:142`, `systems/sectorSim.js:133`, `systems/ships.js:1716`, `systems/stationContactLoadBoundary.js:91`, `systems/stationSideEventDirector.js:97`, `systems/story.js:155`, `systems/survivalArena.js:1091`, `systems/survivorPod.js:604`, `systems/swarmLegendaries.js:107`, `systems/tetherGameplay.js:339`, `systems/titles.js:585`, `systems/traffic.js:2005`, `systems/traffic.js:2098`, `systems/traffic.js:2124`, `systems/traffic.js:2134`, `systems/traffic.js:2137`, `systems/travelLanes.js:552`, `systems/tumbleStates.js:131`, `systems/uniqueLootAbilities.js:162`, `systems/wingmen.js:158`, `systems/world.js:688`, `ui/alerts.js:491`, `ui/automationPayoff.js:81`, `ui/bandHud.js:107`, `ui/capitalBossOverlayMount.js:531`, `ui/cargoConscience.js:147`, `ui/hudLayout.js:122`, `ui/moralTrapPrompt.js:43`, `ui/screens/mainMenu.js:715`, `ui/uiRoot.js:580`, `ui/uiRoot.js:1652`, `ui/voiceArbiter.js:543`, `ui/wreckChoicePrompt.js:55` |
| `save:recovered` | `save/saveSystem.js:5212` | `ui/screens/saveLoad.js:1108`, `ui/uiRoot.js:592` |
| `save:restoring` | `save/saveSystem.js:6568`, `save/saveSystem.js:6648` | `core/coreSystem.js:527`, `main.js:324`, `render/feel.js:1244`, `render/vfx.js:2714`, `render/vfx.js:2725`, `save/saveSystem.js:570`, `systems/aftermathWrecks.js:1090`, `systems/asteroidSites.js:813`, `systems/autoTargetAssist.js:155`, `systems/automation.js:615`, `systems/cloak.js:74`, `systems/encounterDirector.js:324`, `systems/environmentalMachinery.js:272`, `systems/lawSecurity.js:400`, `systems/masslineTelemetry.js:122`, `systems/missions.js:1582`, `systems/missions.js:1824`, `systems/npcJobsRuntime.js:1080`, `systems/runSession.js:96`, `systems/salvage.js:167`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:90`, `systems/surrenderRecovery.js:108`, `systems/swarmLegendaries.js:106`, `systems/traffic.js:2068`, `systems/world.js:681`, `ui/uiRoot.js:1651` |
| `save:slotsValidated` | `save/saveSystem.js:2874` | `ui/screens/saveLoad.js:1098` |
| `save:started` | `save/saveSystem.js:1787`, `save/saveSystem.js:1887`, `save/saveSystem.js:3727` | `systems/drill.js:1301`, `ui/screenManager.js:745` |
| `scan:capabilityVerdicts` | `systems/scanReveal.js:128` | `ui/signalInvestigationPrompt.js:265` |
| `scan:completed` | `balance/careerCohorts.js:516`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:1311`, `systems/world.js:6047` | `careers/origins/prospectorOrigin.js:633`, `systems/asteroidFormations.js:130`, `systems/heistFacilities.js:332`, `systems/missions.js:1689`, `systems/onboarding.js:608`, `systems/presentationOrchestrator.js:191`, `systems/salvage.js:164`, `systems/salvageActions.js:137`, `systems/story.js:269`, `systems/story.js:270`, `systems/world.js:737` |
| `scan:debrisCache` | `systems/mining.js:2154`, `systems/scanReveal.js:262` | `systems/presentationOrchestrator.js:201` |
| `scan:pulse` | `systems/scanner.js:1217` | `render/authoredMotion.js:1142`, `render/shipMicroMotion.js:1318`, `systems/asteroidSites.js:661`, `systems/buildIdentity.js:305`, `systems/cloak.js:91`, `systems/encounterDirector.js:350`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:190`, `systems/scanReveal.js:61`, `systems/world.js:738` |
| `scan:shipRevealed` | `systems/scanReveal.js:88` | `audio/audioSystem.js:2644`, `systems/buildIdentity.js:304` |
| `scan:weakPoint` | `systems/scanner.js:1300` | — |
| `scan:wreckInvestigated` | `systems/scanReveal.js:167` | `audio/audioSystem.js:2796` |
| `scan:wreckResolved` | `systems/scanner.js:1255` | `systems/lawSecurity.js:411` |
| `scan:wreckRevealed` | `systems/scanReveal.js:163` | `audio/audioSystem.js:2645`, `systems/presentationOrchestrator.js:200` |
| `scanner:ghostEscaped` | `systems/scanner.js:1159` | `systems/presentationOrchestrator.js:197` |
| `scanner:ghostRevealed` | `systems/scanner.js:1274` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:95` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:284` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:532`, `ui/comms.js:536` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:1144` | `systems/presentationOrchestrator.js:188` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:1196` | `audio/audioSystem.js:2955`, `audio/bombAudio.js:457`, `audio/fieldAudio.js:324`, `data/hazardLanguage.js:143`, `render/shipMicroMotion.js:1292`, `render/vfx.js:2710`, `render/vfx.js:2721`, `save/saveSystem.js:582`, `systems/achievements.js:1167`, `systems/aftermathWrecks.js:1066`, `systems/aiEncounter.js:138`, `systems/asteroidFormations.js:123`, `systems/asteroidSites.js:778`, `systems/automation.js:661`, `systems/bombs.js:691`, `systems/claims.js:410`, `systems/claims.js:412`, `systems/combatOutcome.js:282`, `systems/difficultyDirector.js:170`, `systems/dockingCorridor.js:83`, `systems/economy.js:1798`, `systems/encounterDirector.js:320`, `systems/factionPresence.js:521`, `systems/fields.js:704`, `systems/heistFacilities.js:304`, `systems/intervention.js:75`, `systems/lossInvestigation.js:127`, `systems/massSeed.js:139`, `systems/masslineSnares.js:135`, `systems/mines.js:76`, `systems/mining.js:303`, `systems/missions.js:1818`, `systems/moralTrap.js:187`, `systems/npcJobsRuntime.js:1068`, `systems/onboarding.js:759`, `systems/presentationOrchestrator.js:237`, `systems/routeFollower.js:416`, `systems/salvage.js:138`, `systems/salvageActions.js:145`, `systems/scanner.js:1081`, `systems/sectorSim.js:130`, `systems/story.js:220`, `systems/story.js:268`, `systems/survivalArena.js:1089`, `systems/survivorPod.js:586`, `systems/swarmLegendaries.js:108`, `systems/tetherGameplay.js:346`, `systems/traffic.js:2003`, `systems/travelLanes.js:553`, `systems/wingmen.js:132`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/loadingPresenter.js:612`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:270`, `ui/securityReadout.js:157`, `ui/watchlistHud.js:91` |
| `sector:exit` | `systems/world.js:1069` | `audio/bombAudio.js:456`, `audio/fieldAudio.js:323`, `core/physics.js:203`, `render/vfx.js:2711`, `render/vfx.js:2722`, `systems/achievements.js:1173`, `systems/aftermathWrecks.js:1076`, `systems/asteroidSites.js:803`, `systems/automation.js:649`, `systems/bombs.js:690`, `systems/dockingCorridor.js:82`, `systems/encounterDirector.js:322`, `systems/environmentalMachinery.js:270`, `systems/factionPresence.js:526`, `systems/factionPresence.js:529`, `systems/fields.js:703`, `systems/gateControlDirector.js:77`, `systems/heistFacilities.js:323`, `systems/impulseCharges.js:331`, `systems/lawSecurity.js:399`, `systems/massSeed.js:138`, `systems/masslineSnares.js:133`, `systems/mines.js:75`, `systems/mining.js:291`, `systems/missions.js:1819`, `systems/npcJobsRuntime.js:1067`, `systems/planetRuntime.js:156`, `systems/reactiveMatter.js:536`, `systems/sectorSim.js:129`, `systems/spawnBudget.js:50`, `systems/stationServices.js:278`, `systems/stationSideEventDirector.js:96`, `systems/surrenderRecovery.js:106`, `systems/survivalArena.js:1090`, `systems/swarmLegendaries.js:109`, `systems/tetherGameplay.js:345`, `systems/traffic.js:2028`, `systems/wingmen.js:144`, `ui/customsPrompt.js:159`, `ui/impoundPayPrompt.js:56`, `ui/impoundPayPrompt.js:61`, `ui/impoundPayPrompt.js:66`, `ui/promptDeck.js:860`, `ui/voiceArbiter.js:544`, `ui/wreckChoicePrompt.js:53` |
| `sector:membershipCandidate` | `systems/world.js:2446` | — |
| `sector:physicalLaw` | `systems/environmentalMachinery.js:755` | — |
| `sectorWonder:secured` | — | `systems/environmentalMachinery.js:258` |
| `sectorsim:embodiment` | `systems/sectorSim.js:1026` | `systems/world.js:720` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:389` | `ui/screens/starmap.js:866` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:2110`, `systems/claims.js:2047`, `systems/encounterDirector.js:2505`, `systems/mining.js:2859`, `systems/trafficRoleOps.js:1706`, `systems/worldPressure.js:192`, `systems/worldPressure.js:276`, `world/motionFossil.js:187` | `systems/sectorSim.js:138`, `systems/world.js:736` |
| `sectorsim:intel` | `systems/sectorSim.js:1080` | `systems/world.js:725` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:856` | `systems/economy.js:1851` |
| `sectorsim:reconcile` | `systems/sectorSim.js:809` | `systems/world.js:726` |
| `sectorsim:tick` | `systems/sectorSim.js:333` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:762` | `ui/screens/starmap.js:867` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:551` | `systems/scanner.js:1085` |
| `sensors:signatureLost` | `systems/massSignature.js:130`, `systems/massSignature.js:142` | — |
| `sensors:signatureResolved` | `systems/massSignature.js:125` | — |
| `service:aborted` | `systems/stationServices.js:360` | `audio/audioSystem.js:2876`, `render/authoredMotion.js:1161`, `systems/economy.js:1804` |
| `service:completed` | `systems/blindWelderRuntime.js:142`, `systems/economy.js:4742`, `systems/economy.js:4970`, `systems/economy.js:5021`, `systems/economy.js:5053`, `systems/economy.js:5108`, `systems/economy.js:5149`, `systems/economy.js:5181`, `systems/economy.js:5219`, `systems/stationServices.js:729`, `systems/stationServices.js:748` | `audio/audioSystem.js:2877`, `render/authoredMotion.js:1160`, `render/authoredMotion.js:1164`, `systems/factionPresence.js:539`, `systems/ships.js:1833` |
| `service:decantRequest` | `ui/station/stationApp.js:994` | `systems/stationServices.js:281` |
| `service:decanted` | `systems/stationServices.js:550` | — |
| `service:progress` | `systems/stationServices.js:647` | — |
| `service:queued` | `systems/stationServices.js:485` | — |
| `service:started` | `systems/stationServices.js:636` | `audio/audioSystem.js:2875`, `render/authoredMotion.js:1159` |
| `setPiece:staged` | `render/trailerStaging.js:14` | — |
| `settings:changed` | `render/slowFrameOffer.js:165`, `save/saveSystem.js:7235`, `save/saveSystem.js:7237`, `systems/legacyTouch.js:703`, `ui/screens/mainMenu.js:85`, `ui/screens/motionAsk.js:104`, `ui/screens/pause.js:683`, `ui/screens/pause.js:691`, `ui/screens/pause.js:807`, `ui/screens/pause.js:847`, `ui/screens/raceBoard.js:90`, `ui/screens/settings.js:741`, `ui/screens/settings.js:1345`, `ui/screens/settings.js:1406`, `ui/screens/settings.js:1528` | `audio/audioSystem.js:3177`, `main.js:322`, `render/vfx.js:2728`, `save/saveSystem.js:493`, `systems/missions.js:1825`, `systems/survivalResults.js:508`, `ui/uiRoot.js:986` |
| `settings:restored` | `save/saveSystem.js:7813` | — |
| `ship:appearanceChanged` | `systems/ships.js:2148`, `systems/ships.js:2631`, `systems/trafficJobOps.js:357` | `core/coreSystem.js:526`, `render/vfx.js:2716` |
| `ship:appearanceSaved` | `systems/ships.js:2633` | `ui/station/screens/shipworks.js:779` |
| `ship:berthSwitching` | `systems/ships.js:2541` | — |
| `ship:boostPreKick` | `systems/flightV3.js:835` | `render/authoredMotion.js:1156`, `render/feel.js:1370` |
| `ship:boostStart` | `systems/flight.js:110`, `systems/flightV3.js:296` | `audio/audioSystem.js:2962`, `render/authoredMotion.js:1157`, `render/vfx.js:2756`, `systems/cruise.js:65`, `systems/onboarding.js:668` |
| `ship:boostStop` | `systems/flight.js:111`, `systems/flight.js:224`, `systems/flightV3.js:297`, `systems/flightV3.js:914` | `audio/audioSystem.js:2967`, `render/authoredMotion.js:1158`, `render/vfx.js:2757` |
| `ship:captured` | `systems/shipControlTransfer.js:88` | — |
| `ship:cargoCapChanged` | `systems/ships.js:2143` | — |
| `ship:controlChanging` | `systems/shipControlTransfer.js:143` | `systems/cruise.js:58`, `systems/flightV3.js:246`, `systems/tetherGameplay.js:344` |
| `ship:controlTransferred` | `systems/shipControlTransfer.js:183` | — |
| `ship:dash` | `systems/flight.js:201`, `systems/flightV3.js:860` | `audio/audioSystem.js:2970`, `render/vfx.js:2758`, `systems/combat.js:776`, `systems/gamepad.js:1100`, `systems/uniqueLootAbilities.js:160` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2261` | `render/vfx.js:2783` |
| `ship:deathPop` | `render/shipMicroMotion.js:988`, `render/shipMicroMotion.js:2251` | `render/vfx.js:2782` |
| `ship:livingHullChanged` | `systems/ships.js:1953`, `systems/ships.js:2005`, `systems/story.js:2053` | `systems/barkDirector.js:795` |
| `ship:loadoutPresetApplied` | `systems/ships.js:3090` | `ui/station/screens/shipworks.js:810` |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2964`, `systems/ships.js:2987`, `systems/ships.js:3012`, `systems/ships.js:3080` | `ui/station/screens/shipworks.js:804` |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2937` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2908` | — |
| `ship:massChanged` | `systems/ships.js:2366` | — |
| `ship:nameChanged` | `systems/ships.js:2656` | `ui/orrery/hudAdapter.js:315` |
| `ship:parkedHoldSwap` | `systems/shipControlTransfer.js:136`, `systems/ships.js:2524` | — |
| `ship:phaseBlink` | `systems/phaseBlink.js:202` | `render/phaseBlinkPresentation.js:847` |
| `ship:purchased` | `systems/ships.js:2410`, `systems/ships.js:2449` | `audio/audioSystem.js:2929`, `systems/lawSecurity.js:417`, `systems/missions.js:1859` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1037`, `render/shipMicroMotion.js:2238` | `render/vfx.js:2781` |
| `ship:released` | `shipjack/ownedOperations.js:26` | — |
| `ship:roleContext` | `systems/ships.js:2063` | `systems/presentationAdapters.js:222` |
| `ship:sold` | `systems/ships.js:2496` | — |
| `ship:statsChanged` | `systems/ships.js:2142` | `systems/stationServices.js:279`, `systems/world.js:666`, `ui/commandBar.js:410` |
| `ship:swingDash` | `systems/flightV3.js:861` | `render/shipMicroMotion.js:1312` |
| `ship:thrust` | `systems/flight.js:435`, `systems/flightV3.js:2322` | `render/vfx.js:2755` |
| `shipjack:actionCommitted` | `systems/shipjack.js:99` | — |
| `shipjack:claimResolved` | `shipjack/yardOperations.js:142` | — |
| `shipjack:cue` | `systems/shipjack.js:75` | — |
| `shipjack:destroyed` | `systems/shipjack.js:373` | — |
| `shipjack:distress` | `systems/shipjack.js:128` | — |
| `shipjack:fleetArrived` | `shipjack/fleetOperations.js:180` | — |
| `shipjack:fleetDeparted` | `shipjack/fleetOperations.js:150` | — |
| `shipjack:fleetPickedUp` | `shipjack/fleetOperations.js:168` | — |
| `shipjack:fleetReceipt` | `shipjack/fleetOperations.js:70` | — |
| `shipjack:fleetStarted` | `shipjack/fleetOperations.js:115` | — |
| `shipjack:inspection` | `systems/shipjack.js:454` | — |
| `shipjack:opportunity` | `systems/shipjack.js:418` | — |
| `shipjack:result` | `systems/shipjack.js:96` | — |
| `shipjack:route` | `systems/shipjack.js:364` | — |
| `shipjack:settled` | `systems/shipjack.js:480` | — |
| `shipjack:yardCompleted` | `shipjack/yardOperations.js:141` | — |
| `shipjack:yardReceipt` | `shipjack/yardOperations.js:78` | — |
| `shipjack:yardStarted` | `shipjack/yardOperations.js:185` | — |
| `ships:grantModule` | `systems/fenceDesk.js:264` | `systems/ships.js:1709` |
| `signal:investigate` | — | `systems/scanner.js:1071` |
| `signal:investigated` | `systems/scanner.js:2001` | `systems/missions.js:1725`, `systems/presentationOrchestrator.js:194`, `systems/story.js:160`, `systems/world.js:669`, `ui/signalInvestigationPrompt.js:268` |
| `signal:investigating` | `systems/scanner.js:1570`, `systems/spectrum/index.js:257` | `ui/signalInvestigationPrompt.js:267` |
| `signal:receipt` | `systems/scanner.js:2002` | — |
| `signal:scanResults` | `response/mercyService/live.js:144`, `systems/scanner.js:1312`, `systems/spectrum/index.js:131`, `systems/spectrum/index.js:246` | `systems/missions.js:1710`, `systems/presentationOrchestrator.js:192`, `systems/story.js:271`, `systems/story.js:274`, `ui/signalInvestigationPrompt.js:264` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:1072` |
| `signal:track` | — | `systems/scanner.js:1070` |
| `signal:tracked` | `systems/scanner.js:1578`, `systems/scanner.js:1601` | `systems/presentationOrchestrator.js:193`, `ui/signalInvestigationPrompt.js:266` |
| `sim:pause` | `ui/screenManager.js:552` | `audio/audioSystem.js:3193`, `audio/bombAudio.js:463`, `audio/fieldAudio.js:329`, `render/feel.js:1242`, `systems/autoTargetAssist.js:166` |
| `sim:resume` | `core/simLaneMain.js:412`, `ui/screenManager.js:560` | `audio/audioSystem.js:3194`, `ui/screenManager.js:738` |
| `site:anchored` | `systems/asteroidSites.js:1807` | — |
| `site:chargePressed` | `systems/asteroidSites.js:2817` | — |
| `site:claimContested` | `systems/asteroidSites.js:2926` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:3306` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:3194` | `audio/audioSystem.js:3221` |
| `site:courierLost` | `systems/asteroidSites.js:3290` | — |
| `site:created` | `systems/asteroidSites.js:1745` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:2202`, `systems/asteroidSites.js:2291` | — |
| `site:lost` | `systems/asteroidSites.js:2440` | `ui/alerts.js:481` |
| `site:machineInstalled` | `systems/asteroidSites.js:1776` | `audio/audioSystem.js:3220`, `ui/alerts.js:480` |
| `site:machineMode` | `systems/asteroidSites.js:2312` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:2219` | `render/authoredMotion.js:1176` |
| `site:machineStatus` | `systems/asteroidSites.js:2881` | `audio/audioSystem.js:3225`, `ui/alerts.js:476` |
| `site:podBuilt` | `systems/asteroidSites.js:2743` | — |
| `site:producing` | `systems/asteroidSites.js:2037` | `render/authoredMotion.js:1175`, `ui/asteroid/asteroidScreen.js:2193` |
| `site:rematerialized` | `systems/asteroidSites.js:2492` | — |
| `site:signatureBand` | `systems/asteroidSites.js:2918` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1955` | `ui/asteroid/asteroidScreen.js:2178` |
| `site:surveyComplete` | `systems/asteroidSites.js:1898` | `ui/asteroid/asteroidScreen.js:2172` |
| `site:surveyDetected` | `systems/asteroidSites.js:1888` | `ui/asteroid/asteroidScreen.js:2165` |
| `siteEvidence:action` | `ui/physicalJobsPrompt.js:66` | `systems/asteroidSites.js:655` |
| `siteEvidence:closed` | `systems/machineWork.js:79`, `systems/machineWork.js:123`, `systems/machineWork.js:149`, `systems/machineWork.js:263`, `world/motionFossil.js:112`, `world/motionFossil.js:147`, `world/motionFossil.js:258` | — |
| `siteEvidence:offer` | `systems/machineWork.js:88`, `world/motionFossil.js:119` | — |
| `siteEvidence:result` | `systems/asteroidSites.js:659` | — |
| `solstice:bloom` | `systems/solstice.js:524` | — |
| `solstice:charged` | `systems/solstice.js:449` | — |
| `solstice:destroyed` | `systems/solstice.js:361` | — |
| `solstice:voice` | `systems/solstice.js:291` | — |
| `spawn:request` | `systems/automation.js:1983` | `systems/world.js:702` |
| `spectrum:focus` | `ui/signalInvestigationPrompt.js:189` | — |
| `spectrum:resolved` | `systems/spectrum/index.js:314` | — |
| `station:berthAssigned` | `systems/stationServices.js:615` | — |
| `station:blockade` | `systems/economy.js:4589` | — |
| `station:boom` | `systems/economy.js:4566` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:318` | `render/vfx.js:2744` |
| `station:exitRequest` | `ui/screenManager.js:697`, `ui/uiRoot.js:1537` | `ui/station/stationApp.js:1457` |
| `station:grudge` | `systems/economy.js:4402` | — |
| `station:grudgeCleared` | `systems/economy.js:4440` | — |
| `station:holding` | `systems/stationServices.js:619` | — |
| `station:moduleGained` | `systems/claims.js:2631` | `systems/factions.js:512` |
| `station:navigate` | `ui/screens/automationPanel.js:1845`, `ui/station/screens/bar.js:808`, `ui/station/screens/bar.js:813`, `ui/station/screens/industry.js:565`, `ui/station/screens/industry.js:572` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:266` | `render/infrastructureMotion.js:205`, `render/vfx.js:2743` |
| `station:slammed` | `systems/economy.js:4345` | `systems/sectorSim.js:158` |
| `station:strike` | `systems/economy.js:4529` | — |
| `station:throughput` | `systems/claims.js:2601` | `render/authoredMotion.js:1196` |
| `station:yardChanged` | `systems/stationServices.js:805` | — |
| `stationContact:changed` | `systems/stationContacts.js:248`, `systems/stationContacts.js:436`, `systems/stationContacts.js:472`, `systems/stationContacts.js:749`, `systems/stationContacts.js:773` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:361`, `systems/stationContacts.js:790` | — |
| `stationContact:counterDelta` | `systems/missions.js:4895` | — |
| `stationContact:manifestWon` | `systems/manifestGame.js:16` | — |
| `stationLife:deedNoticed` | `systems/stationContacts.js:710` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:460`, `systems/stationContacts.js:572`, `systems/stationContacts.js:603` | — |
| `story:beatAdvanced` | `systems/missionStoryOps.js:1792` | `save/saveSystem.js:589`, `systems/story.js:150`, `ui/screens/codex.js:901` |
| `story:continuationAccess` | `systems/story.js:2487` | — |
| `story:elroyResolved` | `systems/missionObjectiveOps.js:1076` | `systems/story.js:151` |
| `story:kurtzLedger` | `systems/story.js:1738`, `systems/story.js:1749` | `systems/story.js:179` |
| `story:newGamePlusStarted` | `systems/story.js:1967` | `systems/titles.js:589` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:2324` | `systems/story.js:177` |
| `story:postEndingContinuity` | `systems/story.js:1638` | `ui/screens/missionLog.js:2632` |
| `story:postEndingProgress` | `systems/story.js:1608` | `ui/screens/missionLog.js:2631` |
| `story:replayHookUnlocked` | `systems/story.js:1623` | `ui/screens/missionLog.js:2633` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:799`, `systems/wingmen.js:156` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:798`, `systems/wingmen.js:157` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1414` | `systems/story.js:178` |
| `story:vergeObserversRevealed` | `systems/story.js:1182` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1434` | `systems/story.js:180` |
| `stunt:bridge` | `systems/stuntGrammar.js:284` | `ui/stuntCallout.js:751` |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:269` | `ui/stuntCallout.js:750` |
| `stunt:salvageRights` | `systems/stuntGrammar.js:179` | `ui/stuntCallout.js:748` |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:203` | `ui/stuntCallout.js:749` |
| `stunt:styleBanked` | `systems/stuntGrammar.js:166` | `audio/audioSystem.js:2817`, `ui/stuntCallout.js:739` |
| `stunt:trickAmended` | — | `systems/achievements.js:1156`, `systems/bulletTime.js:136`, `systems/survivalResults.js:514`, `systems/titles.js:588`, `ui/stuntCallout.js:738` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:2816`, `systems/achievements.js:1154`, `systems/bulletTime.js:135`, `systems/killReplay.js:377`, `systems/survivalResults.js:513`, `systems/titles.js:587`, `ui/stuntCallout.js:737`, `ui/toasts.js:583` |
| `surrender:escaped` | — | `systems/combatOutcome.js:296` |
| `surrender:secured` | — | `systems/traffic.js:2054` |
| `surrender:tethered` | — | `systems/traffic.js:2053` |
| `survivalArena:installed` | — | `systems/survivalAnnounce.js:352` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1353` | — |
| `survivalWave:cohortJoined` | `systems/capitalBossRuntime.js:190` | `systems/survivalWave.js:194` |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:136` | `systems/survivorPod.js:600` |
| `survivorPod:delivered` | `systems/trafficRoleOps.js:1205` | `render/authoredMotion.js:1197`, `systems/titles.js:590` |
| `survivorPod:ejected` | `systems/survivorPod.js:835`, `systems/survivorPod.js:970` | `render/authoredMotion.js:1180`, `systems/aftermathWrecks.js:1081`, `systems/lawSecurity.js:398`, `systems/survivorPod.js:608` |
| `survivorPod:heatCooled` | `systems/heat.js:756` | `systems/survivorPod.js:601` |
| `survivorPod:huntDispatched` | `ai/podHunt.js:188` | — |
| `survivorPod:huntEnded` | `ai/podHunt.js:244` | — |
| `survivorPod:promoted` | `systems/survivorPod.js:1388` | — |
| `survivorPod:ransomed` | — | `systems/fenceDesk.js:63` |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1532`, `systems/survivorPod.js:1567` | `ui/wreckChoicePrompt.js:52` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1546` | `render/authoredMotion.js:1181`, `systems/missions.js:1796` |
| `survivorPod:rescued` | — | `systems/heat.js:432`, `systems/titles.js:591`, `systems/traffic.js:2062` |
| `survivorPod:resolved` | `systems/survivorPod.js:1251` | — |
| `survivorPod:stripBlocked` | `systems/survivorPod.js:1509` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1604` | `systems/missions.js:1798`, `ui/wreckChoicePrompt.js:51` |
| `swarm:announce` | — | `ui/swarmJuiceHud.js:90` |
| `swarm:bossDown` | — | `ui/swarmJuiceHud.js:95` |
| `swarm:bossHp` | — | `ui/swarmJuiceHud.js:94` |
| `swarm:bossIntro` | — | `ui/swarmJuiceHud.js:93` |
| `swarm:broodBurst` | `systems/swarmBrood.js:1533` | — |
| `swarm:broodDeathPositions` | `systems/swarmBrood.js:1622` | `systems/swarmLegendaries.js:101` |
| `swarm:broodKills` | `systems/swarmBrood.js:1593` | `systems/survivalResults.js:505`, `systems/swarmChain.js:127`, `systems/swarmJuice.js:162`, `systems/swarmSupply.js:104` |
| `swarm:chain` | — | `audio/audioSystem.js:2821`, `systems/survivalResults.js:523`, `systems/swarmElites.js:138`, `systems/swarmJuice.js:167`, `ui/survivalHud.js:257`, `ui/swarmJuiceHud.js:96` |
| `swarm:chainBest` | — | `systems/survivalResults.js:544` |
| `swarm:chainBroken` | — | `audio/audioSystem.js:2824`, `systems/swarmElites.js:139`, `systems/swarmJuice.js:168`, `ui/survivalHud.js:258`, `ui/swarmJuiceHud.js:97` |
| `swarm:chainShatter` | — | `ui/swarmJuiceHud.js:99` |
| `swarm:chainTier` | — | `ui/swarmJuiceHud.js:98` |
| `swarm:event` | `systems/swarmEvents.js:289` | — |
| `swarm:eventTelegraphed` | `systems/swarmEvents.js:137` | — |
| `swarm:killPopup` | — | `ui/stuntCallout.js:837`, `ui/swarmJuiceHud.js:89` |
| `swarm:pressureSpend` | — | `systems/survivalResults.js:512` |
| `swarm:pressureTelegraph` | — | `systems/survivalAnnounce.js:345` |
| `swarm:roundClear` | — | `ui/swarmJuiceHud.js:92` |
| `swarm:roundSlam` | — | `ui/swarmJuiceHud.js:91` |
| `tech:researched` | `systems/ships.js:2194` | `audio/audioSystem.js:2925`, `systems/onboarding.js:797`, `systems/ships.js:1713` |
| `terrainAnchors:replenished` | `systems/terrainAnchors.js:249` | — |
| `tether:attached` | `combat/attachments.js:537` | `audio/audioSystem.js:3028`, `render/authoredMotion.js:1147`, `render/vfx.js:2660`, `systems/encounterDirector.js:355`, `systems/presentationOrchestrator.js:96`, `systems/scenarioRuntime.js:24`, `systems/surrenderRecovery.js:99`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:539`, `systems/tetherGameplay.js:1497`, `systems/tetherGameplay.js:1518`, `systems/tetherGameplay.js:2421` | `audio/audioSystem.js:3055`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1320`, `systems/lineProgression.js:54`, `systems/onboarding.js:606`, `systems/onboarding.js:622`, `systems/surrenderRecovery.js:103` |
| `tether:broken` | `combat/attachments.js:655` | `audio/audioSystem.js:3016`, `render/feel.js:1408`, `render/vfx.js:2663`, `systems/missions.js:1741`, `systems/presentationOrchestrator.js:104`, `systems/scenarioRuntime.js:28`, `systems/surrenderRecovery.js:100`, `systems/tetherGameplay.js:347`, `systems/volatileExposure.js:217`, `ui/masslineHud.js:1146` |
| `tether:couplerLock` | `systems/tetherGameplay.js:2829` | — |
| `tether:cut` | `systems/tetherGameplay.js:2150` | `audio/audioSystem.js:3073`, `systems/gamepad.js:993`, `systems/masslineThrow.js:120`, `systems/onboarding.js:621`, `systems/onboarding.js:677`, `systems/onboarding.js:687` |
| `tether:cutDenied` | `systems/tetherGameplay.js:2134` | — |
| `tether:detached` | — | `systems/missions.js:1740` |
| `tether:latchDenied` | `systems/masslineSnares.js:744`, `systems/tetherGameplay.js:432`, `systems/tetherGameplay.js:618`, `systems/tetherGameplay.js:643`, `systems/tetherGameplay.js:691`, `systems/tetherGameplay.js:696`, `systems/tetherGameplay.js:705`, `systems/tetherGameplay.js:734`, `systems/tetherGameplay.js:1124` | `render/authoredMotion.js:1153`, `systems/onboarding.js:833`, `testing/lab/proofSixtySeconds.js:1530`, `ui/masslineHud.js:1092` |
| `tether:latched` | `systems/tetherGameplay.js:519`, `systems/tetherGameplay.js:729`, `systems/tetherGameplay.js:759` | `audio/audioSystem.js:3043`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:721`, `systems/flightV3.js:247`, `systems/gamepad.js:992`, `systems/heistFacilities.js:336`, `systems/lawSecurity.js:406`, `systems/lineProgression.js:52`, `systems/longBerth.js:45`, `systems/masslineThrow.js:126`, `systems/missions.js:1739`, `systems/missions.js:1778`, `systems/missions.js:1845`, `systems/onboarding.js:601`, `systems/onboarding.js:618`, `systems/onboarding.js:666`, `systems/onboarding.js:675`, `systems/onboarding.js:840`, `systems/onboarding.js:843`, `systems/onboarding.js:855`, `systems/onboarding.js:877`, `systems/surrenderRecovery.js:98`, `systems/survivorPod.js:607`, `testing/lab/proofSixtySeconds.js:1531`, `ui/masslineHud.js:1106`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1802` | — |
| `tether:massWeighed` | `systems/masslineTelemetry.js:302` | `systems/economyContracts.js:263` |
| `tether:nearBreak` | `combat/attachments.js:1040`, `combat/attachments.js:1063` | `audio/audioSystem.js:3040`, `systems/onboarding.js:607`, `systems/onboarding.js:879`, `systems/presentationOrchestrator.js:97` |
| `tether:rebound` | `combat/attachments.js:969` | `audio/audioSystem.js:3084` |
| `tether:reel` | `combat/attachments.js:589` | `audio/audioSystem.js:3014`, `systems/missions.js:1735`, `systems/onboarding.js:604`, `systems/onboarding.js:619`, `systems/surrenderRecovery.js:101` |
| `tether:reelPump` | `systems/masslineTelemetry.js:364` | `render/authoredMotion.js:1150`, `ui/stuntCallout.js:787` |
| `tether:releaseRated` | `systems/tetherGameplay.js:540`, `systems/tetherGameplay.js:1493`, `systems/tetherGameplay.js:1498`, `systems/tetherGameplay.js:1520`, `systems/tetherGameplay.js:2152` | `audio/audioSystem.js:3015`, `render/feel.js:1461`, `render/vfx.js:2662`, `systems/economy.js:1760`, `systems/gamepad.js:994`, `systems/masslineThrow.js:123`, `systems/missions.js:1742`, `systems/presentationOrchestrator.js:163`, `systems/titles.js:592`, `ui/masslineHud.js:1114` |
| `tether:released` | `systems/tetherGameplay.js:1490`, `systems/tetherGameplay.js:1516`, `systems/tetherGameplay.js:2151` | `render/authoredMotion.js:1151`, `render/shipMicroMotion.js:1319`, `render/vfx.js:2661`, `systems/barkDirector.js:828`, `systems/lineProgression.js:53`, `systems/onboarding.js:605`, `systems/onboarding.js:620`, `systems/onboarding.js:676`, `systems/onboarding.js:686`, `systems/rockCore.js:97`, `systems/surrenderRecovery.js:102`, `systems/world.js:743` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2733` | `ui/stuntCallout.js:784` |
| `tether:snagged` | `systems/tetherGameplay.js:2586` | `audio/audioSystem.js:3077` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:442` | `render/authoredMotion.js:1149`, `ui/stuntCallout.js:786` |
| `tether:strain` | `systems/tetherGameplay.js:1866` | `audio/audioSystem.js:3033`, `render/authoredMotion.js:1155`, `systems/onboarding.js:880` |
| `tether:tractorCapture` | `systems/tetherGameplay.js:783` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1486`, `render/vfx.js:2707`, `systems/collisionConsequences.js:101`, `systems/combat.js:765`, `systems/masslineImpactDamage.js:47`, `systems/missions.js:1743`, `systems/onboarding.js:623`, `systems/onboarding.js:678`, `systems/onboarding.js:881`, `systems/presentationOrchestrator.js:139`, `systems/tumbleStates.js:119`, `ui/stuntCallout.js:788` |
| `tether:whipSnap` | `systems/tetherGameplay.js:2279` | `systems/gamepad.js:1008` |
| `title:holdResolved` | — | `systems/titles.js:581` |
| `touch:guide` | `ui/screens/pause.js:1063` | — |
| `touch:uiAction` | `systems/legacyTouch.js:635` | `ui/input.js:1019` |
| `towlineTable:assistAccepted` | `systems/towlineTable.js:201` | — |
| `towlineTable:assistFulfilled` | `systems/towlineTable.js:225` | — |
| `towlineTable:cleanupAccepted` | `systems/towlineTable.js:158` | — |
| `towlineTable:offer` | `systems/towlineTable.js:260` | `ui/towlineTablePrompt.js:4` |
| `traffic:anvilTransfer` | `systems/anvilWork.js:234` | — |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:2807` |
| `traffic:freightTallied` | `systems/trafficRoleOps.js:934` | — |
| `traffic:haulerRegroup` | `systems/trafficRoleOps.js:1714` | `systems/barkDirector.js:848` |
| `traffic:oreCollected` | `systems/trafficRoleOps.js:1001` | `render/authoredMotion.js:1192`, `render/npcJobSignatureVfx.js:676`, `render/npcJobSignatureVfx.js:901` |
| `traffic:passengerLinerReceipt` | `systems/trafficJobOps.js:818` | — |
| `traffic:passengerLinerSuspended` | `systems/trafficCausalChainOps.js:2351` | — |
| `traffic:richSeamHelpReserved` | `systems/trafficRecoveryOps.js:574` | `systems/barkDirector.js:834` |
| `traffic:spillNoticed` | `systems/trafficRoleOps.js:1638` | `systems/barkDirector.js:832` |
| `traffic:vesselRelinquished` | `systems/traffic.js:1941` | — |
| `travelLanes:slingRingPass` | — | `ui/toasts.js:593` |
| `tutorial:finished` | `systems/onboarding.js:2006` | `systems/achievements.js:1185`, `systems/missions.js:1577`, `systems/presentationAdapters.js:225`, `systems/story.js:173` |
| `tutorial:say` | `systems/onboarding.js:1670` | `audio/audioSystem.js:3134`, `systems/story.js:213` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2499` | `systems/missions.js:1593` |
| `ui:acceptMission` | `ui/adventureDecisions.js:407` | `systems/missions.js:1592` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:4809` | `systems/ships.js:1797` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:1719` |
| `ui:buyModule` | — | `systems/onboarding.js:792`, `systems/ships.js:1781` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:5287` | `systems/bombs.js:701` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:4997` | `systems/ships.js:1744` |
| `ui:cancel` | `ui/input.js:1287`, `ui/input.js:1302` | `ui/screens/crucibleDraft.js:1024` |
| `ui:clearTarget` | `ui/input.js:632` | `ui/uiRoot.js:1393` |
| `ui:closeAll` | `main.js:987`, `ui/loadingPresenter.js:542`, `ui/screens/crucible.js:3714`, `ui/screens/crucible.js:3727` | `ui/uiRoot.js:1388` |
| `ui:closeCargo` | `ui/input.js:439`, `ui/input.js:592` | — |
| `ui:closeComms` | `ui/input.js:586` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1382` |
| `ui:confirm` | `ui/input.js:1297` | `audio/audioSystem.js:3239` |
| `ui:convoyShareBuy` | — | `systems/economy.js:1757` |
| `ui:cycleComponent` | `ui/targetPanel.js:819`, `ui/targetPanel.js:823` | `ui/uiRoot.js:1397` |
| `ui:cycleTarget` | `ui/input.js:627`, `ui/input.js:1371` | `ui/uiRoot.js:1392` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:4855` | `systems/ships.js:1798` |
| `ui:endgameChoose` | `systems/missions.js:2216`, `ui/station/barContacts.js:1136` | `systems/story.js:226` |
| `ui:endgameConfirm` | — | `systems/story.js:227` |
| `ui:endgameDecline` | `ui/comms.js:463` | `systems/story.js:228` |
| `ui:endgameDepartAshfall` | `ui/comms.js:480` | `systems/story.js:237` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2349` | `systems/story.js:234` |
| `ui:endgameStayAshfall` | `ui/comms.js:481` | `systems/story.js:238` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2353` | `systems/story.js:235` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:236` |
| `ui:endingArchiveOpen` | `ui/screens/pause.js:1088` | `systems/story.js:230` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | `systems/routeFollower.js:400` |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:85` | `systems/factionPresence.js:536` |
| `ui:fitModule` | — | `systems/onboarding.js:789`, `systems/ships.js:1783` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:5297` | `systems/bombs.js:702` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1892` | `systems/automation.js:593`, `systems/wingmen.js:153` |
| `ui:forwardSlipBuy` | — | `systems/economy.js:1758` |
| `ui:globalFind` | `ui/input.js:488`, `ui/input.js:568` | `ui/globalFind.js:183` |
| `ui:heliosBay7Scan` | — | `systems/story.js:277` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:222` | `systems/story.js:276` |
| `ui:loadingHidden` | `ui/loadingPresenter.js:381` | `ui/screens/mainMenu.js:935` |
| `ui:manifestAction` | `ui/screens/manifest.js:30` | — |
| `ui:manifestOpen` | `ui/screens/manifest.js:27` | — |
| `ui:manifestStart` | `ui/screens/manifest.js:51` | — |
| `ui:navigate` | `ui/input.js:1273`, `ui/input.js:1278`, `ui/input.js:1344` | — |
| `ui:popScreen` | `ui/galaxyMap.js:3211`, `ui/screens/achievements.js:212`, `ui/screens/automationPanel.js:1028`, `ui/screens/clips.js:458`, `ui/screens/credits.js:178`, `ui/screens/crucible.js:2316`, `ui/screens/crucibleDraft.js:1842`, `ui/screens/demoEnd.js:195`, `ui/screens/localmap.js:853`, `ui/screens/manifest.js:86`, `ui/screens/replay.js:305`, `ui/screens/starmap.js:682`, `ui/screens/statistics.js:78`, `ui/screens/techTree.js:300` | `ui/uiRoot.js:1378` |
| `ui:prepareBombRack` | `systems/ships.js:3078`, `ui/station/screens/shipworks.js:4914` | `systems/bombs.js:712` |
| `ui:previewBombRackPreparation` | `systems/ships.js:3008`, `ui/station/screens/shipworks.js:3858`, `ui/station/screens/shipworks.js:4870` | `systems/bombs.js:709` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:711` | `systems/world.js:705` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:799` | `systems/world.js:704` |
| `ui:pushScreen` | `main.js:540`, `systems/onboarding.js:1300`, `systems/story.js:1394`, `ui/loadingPresenter.js:543`, `ui/mapAuthority.js:133`, `ui/screens/base.js:1370`, `ui/screens/crucible.js:3728`, `ui/screens/crucibleDraft.js:930`, `ui/screens/gameOver.js:491`, `ui/screens/starmap.js:690`, `ui/signalInvestigationPrompt.js:260`, `ui/station/barContacts.js:861`, `ui/station/screens/bar.js:750`, `ui/station/screens/bar.js:793`, `ui/station/screens/industry.js:559`, `ui/station/stationApp.js:581` | `ui/uiRoot.js:1355` |
| `ui:replaceScreen` | `ui/screens/crucible.js:3675`, `ui/screens/crucible.js:3702`, `ui/screens/demoEnd.js:224`, `ui/screens/motionAsk.js:114` | `ui/uiRoot.js:1387` |
| `ui:restockBombRack` | — | `systems/bombs.js:705` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:4781` | `systems/ships.js:1796` |
| `ui:screenTop` | `ui/screenManager.js:367` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:1720` |
| `ui:sellModule` | — | `systems/ships.js:1782` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:5307` | `systems/bombs.js:704` |
| `ui:service` | `balance/careerCohorts.js:745`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:528`, `ui/station/stationApp.js:1025`, `ui/station/stationApp.js:1061` | `systems/economy.js:1801` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:5004`, `ui/station/screens/shipworks.js:5135` | `systems/ships.js:1780` |
| `ui:setCourse` | `data/encounters/1210-the-deadweight.js:284`, `systems/borrowedSun.js:197`, `systems/economy.js:4789`, `systems/economy.js:4816`, `systems/factionPresence.js:1741`, `systems/ilexArk.js:33`, `systems/missions.js:3077`, `systems/palletJack.js:282`, `systems/redKite.js:61`, `systems/scanner.js:1600`, `systems/scanner.js:1632`, `systems/scanner.js:1760`, `systems/shipjack.js:363`, `systems/tallyThree.js:117`, `systems/towlineTable.js:33`, `ui/galaxyMap.js:2843`, `ui/galaxyMap.js:2858`, `ui/galaxyMap.js:8549`, `ui/market/tradeLogic.js:575`, `ui/radar.js:1645`, `ui/screens/footprint.js:1655`, `ui/screens/footprint.js:1666`, `ui/screens/localmap.js:1163`, `ui/screens/starmap.js:1572`, `ui/screens/starmap.js:1585`, `ui/screens/starmap.js:1589` | `systems/world.js:661` |
| `ui:setShipAppearance` | `ui/screens/raceBoard.js:294`, `ui/station/screens/shipworks.js:4696` | `systems/ships.js:1800` |
| `ui:setShipName` | `ui/station/screens/shipworks.js:5042` | `systems/ships.js:1803` |
| `ui:shipjack` | `ui/blackFlag.js:75`, `ui/blackFlag.js:94`, `ui/blackFlag.js:97`, `ui/blackFlag.js:104`, `ui/blackFlag.js:182`, `ui/blackFlagRegistry.js:141`, `ui/blackFlagRegistry.js:144`, `ui/blackFlagRegistry.js:153` | — |
| `ui:talkContact` | — | `systems/fenceDesk.js:61`, `systems/story.js:278` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:65`, `combat/autoTargetMode.js:246` | `ui/uiRoot.js:1398` |
| `ui:toast` | `systems/scanner.js:1757`, `systems/scanner.js:1763` | — |
| `ui:toggleCargo` | `ui/input.js:697` | — |
| `ui:toggleComms` | `ui/input.js:719` | — |
| `ui:toggleOverview` | `ui/input.js:704` | — |
| `ui:trackMission` | `ui/galaxyMap.js:4561`, `ui/galaxyMap.js:4720`, `ui/screens/missionLog.js:2345`, `ui/screens/missionLog.js:2417`, `ui/screens/missionLog.js:2478`, `ui/station/screens/contracts.js:1540` | `systems/missions.js:1597` |
| `ui:transferParkedCargo` | `ui/station/screens/shipworks.js:5156` | — |
| `ui:undock` | — | `ui/input.js:1018` |
| `ui:unfitModule` | — | `systems/ships.js:1792` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:5317` | `systems/bombs.js:703` |
| `ui:unlockTech` | `ui/screens/techTree.js:661` | `systems/ships.js:1799` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:4984` | `systems/bombs.js:706` |
| `ui:wingOrder` | `ui/wingmanRadial.js:258` | `systems/automation.js:597` |
| `ui:wingmanRadial` | `ui/input.js:711` | `ui/wingmanRadial.js:329` |
| `understory:compostRunComplete` | `systems/faction_understory.js:199` | — |
| `understory:gardenFed` | `systems/faction_understory.js:180` | — |
| `understory:gardenSeeded` | `systems/faction_understory.js:141` | — |
| `understory:gardenStage` | `systems/faction_understory.js:288` | — |
| `understory:sporeSkin` | `systems/faction_understory.js:267` | — |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:391` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:329` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:250` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1666` | `audio/audioSystem.js:2883`, `systems/missions.js:1811`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:blackBoxRecovered` | `systems/uniqueWrecks.js:1696` | — |
| `uniqueWreck:choose` | `systems/missionObjectiveOps.js:741`, `systems/uniqueWreckEncounterScripts.js:123`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:951` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:972`, `systems/uniqueWrecks.js:1140`, `systems/uniqueWrecks.js:1328` | `systems/missions.js:1812` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1758` | `systems/missions.js:1814`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1187` | `systems/missions.js:1813` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1217` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:701`, `systems/uniqueWrecks.js:1142` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1937` | `systems/missions.js:1815`, `systems/traffic.js:2061`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `systems/trafficJobOps.js:962`, `ui/station/screens/bar.js:767` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:822` | `systems/missions.js:1810` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1938` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1645` | `systems/world.js:710` |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1868` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1722`, `ui/bandHud.js:104` |
| `vael:lienClamped` | `systems/faction_vael.js:122` | — |
| `vael:lienCut` | `systems/faction_vael.js:242` | — |
| `vael:lienPaid` | `systems/faction_vael.js:223` | — |
| `vael:lienTelegraph` | `systems/faction_vael.js:86` | — |
| `vael:lienThrown` | `systems/faction_vael.js:155` | — |
| `vael:lienTransferred` | `systems/faction_vael.js:198` | — |
| `vael:overrideThrust` | `systems/faction_vael.js:270` | — |
| `vael:pageNineArmed` | `systems/faction_vael.js:66` | — |
| `verb:used` | `systems/onboarding.js:4006` | — |
| `verge:appealDenied` | `systems/faction_verge.js:171` | — |
| `verge:appealGranted` | `systems/faction_verge.js:162` | — |
| `verge:courtConvened` | `systems/faction_verge.js:104` | — |
| `verge:directive` | `systems/faction_verge.js:71` | — |
| `verge:directiveViolated` | `systems/faction_verge.js:97` | — |
| `verge:jurorWoke` | `systems/faction_verge.js:198` | — |
| `verge:lawWoke` | `systems/worldPressure.js:281` | — |
| `verge:lineTrialPassed` | `systems/faction_verge.js:220` | — |
| `verge:massWeighed` | `systems/faction_verge.js:133` | — |
| `vesper:met` | `systems/vesper.js:172` | — |
| `vesper:note` | `systems/vesper.js:214` | — |
| `vesper:performance` | `systems/vesper.js:238` | — |
| `vesper:phraseProgress` | `systems/vesper.js:230` | — |
| `vesper:voice` | `systems/vesper.js:156` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:6878` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:672` |
| `vestaOreCache:clueRecovered` | `systems/world.js:6699` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:6730` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:6841` | — |
| `vestaOreCache:resolved` | `systems/world.js:6798` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:953`, `ui/voiceArbiter.js:1000` | `ui/alerts.js:461` |
| `voice:dismiss` | `ui/bindings.js:83`, `ui/input.js:577` | `ui/voiceArbiter.js:432` |
| `voice:say` | `audio/audioSystem.js:2798`, `audio/audioSystem.js:5316`, `systems/achievements.js:1003`, `systems/mines.js:100`, `systems/survivalAnnounce.js:414`, `systems/survivalAnnounce.js:695`, `systems/world.js:806`, `systems/world.js:828`, `ui/alerts.js:352`, `ui/hud.js:630` | `ui/voiceArbiter.js:431` |
| `voice:surface` | `ui/voiceArbiter.js:958`, `ui/voiceArbiter.js:1010` | `systems/barkDirector.js:796`, `systems/story.js:169`, `ui/alerts.js:460`, `ui/voiceArbiter.js:542` |
| `warrant:acceptPayment` | `ui/warrantOfferPrompt.js:93` | — |
| `watch:changed` | `ui/entityLinks.js:237`, `ui/entityLinks.js:281` | `ui/watchlistHud.js:89` |
| `weapons:inertialShunt` | `systems/weapons.js:470` | `ui/stuntCallout.js:793` |
| `weapons:mineArmed` | `systems/weapons.js:1968` | `audio/audioSystem.js:2764` |
| `weapons:mineDeployed` | `systems/weapons.js:1925` | `render/vfx.js:2703` |
| `weapons:mineDetonated` | `systems/weapons.js:2052` | — |
| `weapons:mineExpired` | `systems/weapons.js:1962` | `render/vfx.js:2704`, `systems/presentationOrchestrator.js:276` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:450` | `audio/audioSystem.js:2801` |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1604` | `audio/audioSystem.js:2802` |
| `weapons:vent` | `systems/weapons.js:881`, `systems/weapons.js:901` | `audio/audioSystem.js:2903`, `render/shipMicroMotion.js:1296`, `render/vfx.js:2742`, `systems/ships.js:1847` |
| `weather:ionBlackout` | `systems/environmentalMachinery.js:1527`, `systems/environmentalMachinery.js:1722` | — |
| `web:linked` | `combat/tetherWebs.js:161` | — |
| `weighing:overMass` | `data/encounters/700-the-weighing.js:232` | — |
| `well:capture` | `systems/fields.js:2613` | — |
| `well:fling` | `systems/fields.js:2538` | `systems/flightV3.js:225`, `ui/stuntCallout.js:791` |
| `well:grind` | `systems/fields.js:2203` | `systems/impulseCharges.js:323` |
| `well:haulerDragged` | `systems/fields.js:2482` | `systems/traffic.js:2060` |
| `wingMorale:broken` | `systems/wingMorale.js:289` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:398` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:426` | — |
| `wingOrder:accepted` | `systems/automation.js:2526` | `systems/wingmen.js:154` |
| `wingOrder:blocked` | `systems/automation.js:2527` | `ui/wingmanRadial.js:336` |
| `wingOrder:converted` | `systems/wingmen.js:625` | `ui/wingmanRadial.js:342` |
| `wingOrder:status` | `systems/automation.js:2528` | `ui/wingmanRadial.js:346` |
| `world:abortJumpCharge` | `systems/story.js:945`, `ui/comms.js:472` | `systems/world.js:658` |
| `world:confirmUnfiledJump` | `systems/story.js:236` | `systems/world.js:657` |
| `world:courtRulingRecorded` | `systems/world.js:598` | — |
| `world:criticalSpawnDeferred` | `systems/world.js:2073`, `systems/world.js:4366` | — |
| `world:farActorRestored` | `world/farActorTable.js:1063` | `systems/npcJobsRuntime.js:1070`, `systems/traffic.js:2039` |
| `world:farActorShelved` | `world/farActorTable.js:1009` | `systems/npcJobsRuntime.js:1069`, `systems/traffic.js:2038` |
| `world:membership` | `systems/world.js:1150` | `systems/presentationOrchestrator.js:182` |
| `world:originShift` | `systems/world.js:5465` | — |
| `world:playerRelocated` | `systems/world.js:4512` | `core/coreSystem.js:538`, `render/vfx.js:2727` |
| `world:requestJump` | `systems/story.js:929`, `ui/galaxyMap.js:2837`, `ui/screens/starmap.js:1584` | `systems/world.js:655` |
| `world:requestRoute` | `ui/galaxyMap.js:2856`, `ui/galaxyMap.js:4737`, `ui/galaxyMap.js:8547`, `ui/screens/starmap.js:1571`, `ui/screens/starmap.js:1588` | `systems/world.js:659` |
| `world:requestSectorScan` | `ui/galaxyMap.js:6915` | `systems/world.js:660` |
| `world:requestUnfiledJump` | `systems/story.js:897` | `systems/world.js:656` |
| `world:residency` | `systems/world.js:1343`, `systems/world.js:1386`, `systems/world.js:2295` | — |
| `world:spawnLimited` | `systems/world.js:4286` | — |
| `world:stuckCleared` | `systems/world.js:6427` | — |
| `world:stuckTowAccept` | `ui/stuckTowPrompt.js:52` | `systems/world.js:749` |
| `world:stuckTowOffer` | `systems/world.js:6460` | `ui/stuckTowPrompt.js:23` |
| `world:zoneEntered` | `systems/world.js:5492` | `data/hazardLanguage.js:146` |
| `world:zoneExited` | `systems/world.js:5507` | `data/hazardLanguage.js:147` |
| `worldPressure:auditAnnounced` | `systems/worldPressure.js:237` | — |
| `worldPressure:auditDelayed` | `systems/worldPressure.js:352` | — |
| `worldPressure:colossusRemains` | `systems/worldPressure.js:381` | — |
| `worldPressure:gateClosed` | `systems/worldPressure.js:278` | — |
| `worldPressure:scaffoldSpawned` | `systems/worldPressure.js:437` | — |
| `worldPressure:slowGray` | `systems/worldPressure.js:300` | — |
| `worldPressure:tideChanged` | `systems/worldPressure.js:208` | — |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:1353` | `systems/presentationOrchestrator.js:290` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:1238` | `systems/presentationOrchestrator.js:291`, `systems/traffic.js:2156` |
| `wreckCourt:action` | `ui/physicalJobsPrompt.js:33` | — |
| `wreckCourt:lawFact` | `systems/wreckCourt.js:1031` | `systems/heat.js:356` |
| `wreckCourt:opened` | `systems/wreckCourt.js:950` | — |
| `wreckCourt:result` | `systems/wreckCourt.js:894` | — |
| `wreckCourt:ruled` | `systems/wreckCourt.js:1032` | — |
| `wreckCourt:worldFact` | `systems/wreckCourt.js:1030` | `systems/world.js:591` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2954` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1411` | `systems/barkDirector.js:810` |
| `wreckEcology:rivalPressured` | `systems/aftermathWrecks.js:1372` | `systems/barkDirector.js:809` |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1454` | `systems/barkDirector.js:808` |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:2655` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2876` | `systems/npcJobsRuntime.js:1100` |
| `wreckField:source` | `systems/factionPresence.js:1189`, `systems/salvage.js:595`, `systems/uniqueWrecks.js:1546` | `systems/aftermathWrecks.js:1058` |
| `wreckMission:choiceApplied` | `systems/missionObjectiveOps.js:1178` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:145` | `systems/missions.js:1794` |

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
- `combat:subsystemDisabled` — 8 subscriber(s)
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
- `law:wantedCheckpointBroken` — 1 subscriber(s)
- `law:wantedCheckpointPosted` — 1 subscriber(s)
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
- `run:ended` — 15 subscriber(s)
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
- `run:started` — 12 subscriber(s)
- `run:threatRequested` — 1 subscriber(s)
- `run:transitioned` — 6 subscriber(s)
- `run:waveCleared` — 5 subscriber(s)
- `run:waveIntroComplete` — 1 subscriber(s)
- `run:waveMaterialized` — 1 subscriber(s)
- `run:wavePlanFailed` — 1 subscriber(s)
- `run:wavePlanned` — 7 subscriber(s)
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

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aftermath:causeExhausted` — 1 emitter(s)
- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:custodyFreight` — 1 emitter(s)
- `aftermath:custodySurvivor` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:completed` — 1 emitter(s)
- `ai:egressExit` — 2 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `alienEcology:cystRupture` — 1 emitter(s)
- `alienEcology:vented` — 1 emitter(s)
- `ambush:clauseDecided` — 1 emitter(s)
- `ambush:clauseFired` — 1 emitter(s)
- `archive:indexRead` — 1 emitter(s)
- `archive:logCopied` — 1 emitter(s)
- `archive:redacted` — 1 emitter(s)
- `archive:redactionLifted` — 1 emitter(s)
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
- `calendar:festival` — 1 emitter(s)
- `calendar:marketDay` — 1 emitter(s)
- `calendar:rushHour` — 1 emitter(s)
- `calendar:stormSeason` — 1 emitter(s)
- `camera:shake` — 20 emitter(s)
- `camera:zoom` — 5 emitter(s)
- `capitalBoss:detach` — 1 emitter(s)
- `capitalBoss:telegraphEnd` — 2 emitter(s)
- `captain:remembered` — 1 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:hotDockSpill` — 1 emitter(s)
- `cargo:jettison` — 1 emitter(s)
- `cargo:parkedTransfer` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
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
- `choir:crystalShattered` — 1 emitter(s)
- `choir:relicAlarm` — 1 emitter(s)
- `choir:relicCracked` — 1 emitter(s)
- `choir:relicPing` — 1 emitter(s)
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
- `combat:actionCancelled` — 1 emitter(s)
- `combat:actionCompleted` — 1 emitter(s)
- `combat:actionPhase` — 1 emitter(s)
- `combat:aftermathChosen` — 1 emitter(s)
- `combat:emp` — 1 emitter(s)
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
- `crew:hired` — 1 emitter(s)
- `crew:injured` — 1 emitter(s)
- `crew:lost` — 1 emitter(s)
- `crew:loyalty` — 1 emitter(s)
- `cruise:wrestleEscaped` — 1 emitter(s)
- `cruise:wrestleStarted` — 1 emitter(s)
- `derby:finished` — 1 emitter(s)
- `derby:slam` — 2 emitter(s)
- `detonator:detonated` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `discovery:chartFiled` — 1 emitter(s)
- `dock:committed` — 1 emitter(s)
- `drift:claimContested` — 1 emitter(s)
- `drift:claimLifted` — 1 emitter(s)
- `drift:claimStaked` — 1 emitter(s)
- `drill:chargeArm` — 3 emitter(s)
- `ecology:claimCrew` — 1 emitter(s)
- `ecology:coherence` — 1 emitter(s)
- `ecology:collar` — 1 emitter(s)
- `ecology:fossilRecorded` — 1 emitter(s)
- `ecology:fossilSettled` — 1 emitter(s)
- `ecology:setpiece` — 2 emitter(s)
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
- `frontier:moduleSnapped` — 1 emitter(s)
- `frontier:supplyDelivered` — 1 emitter(s)
- `frontier:supplyRunAsked` — 1 emitter(s)
- `frontier:trafficTick` — 1 emitter(s)
- `frontier:welded` — 1 emitter(s)
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:blackMarketAccess` — 1 emitter(s)
- `frontierRumor:contacted` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `fuel:changed` — 8 emitter(s)
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
- `heist:capsuleResumed` — 1 emitter(s)
- `heist:counterweightSceneReceipt` — 4 emitter(s)
- `heist:launchCue` — 2 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:observed` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `heist:routineReceipt` — 1 emitter(s)
- `helix:flagsDropped` — 1 emitter(s)
- `helix:lienFiled` — 1 emitter(s)
- `helix:lienStuck` — 1 emitter(s)
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
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `intervention:jumperRipped` — 1 emitter(s)
- `intervention:logged` — 1 emitter(s)
- `jump:interdictionWarning` — 1 emitter(s)
- `kilnback:caskReleased` — 1 emitter(s)
- `kilnback:caskSalvaged` — 1 emitter(s)
- `kilnback:coolantReleased` — 1 emitter(s)
- `kilnback:phase` — 1 emitter(s)
- `lane:facadeMiss` — 1 emitter(s)
- `lastShift:archive` — 1 emitter(s)
- `lastShift:archived` — 1 emitter(s)
- `lastShift:recorderReturned` — 1 emitter(s)
- `lastShift:returnRecorder` — 1 emitter(s)
- `law:warrantIssued` — 1 emitter(s)
- `line:classChanged` — 1 emitter(s)
- `line:recordStamped` — 1 emitter(s)
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
- `meridian:containerRecoupled` — 1 emitter(s)
- `meridian:containerSold` — 1 emitter(s)
- `meridian:couplerSnapped` — 1 emitter(s)
- `meridian:tickerFloor` — 1 emitter(s)
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:podSplit` — 1 emitter(s)
- `mining:ventBonus` — 1 emitter(s)
- `missile:guidanceLost` — 1 emitter(s)
- `mission:conditionBroken` — 2 emitter(s)
- `mission:conditionPending` — 1 emitter(s)
- `mission:conditionProgress` — 2 emitter(s)
- `mission:gateCleared` — 2 emitter(s)
- `mission:setPieceTravelLine` — 1 emitter(s)
- `mission:spawnDeferred` — 1 emitter(s)
- `mission:targetsProjected` — 1 emitter(s)
- `module:granted` — 1 emitter(s)
- `module:purchased` — 1 emitter(s)
- `module:sold` — 1 emitter(s)
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
- `news:publish` — 39 emitter(s)
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
- `occupation:lost` — 1 emitter(s)
- `occupation:switched` — 1 emitter(s)
- `onboarding:drillFolded` — 1 emitter(s)
- `onboarding:rangePrompt` — 3 emitter(s)
- `onboarding:rosterPrewarm` — 1 emitter(s)
- `onboarding:swingClinic` — 1 emitter(s)
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
- `pitborn:ballastAccreted` — 1 emitter(s)
- `pitborn:ballastHorn` — 1 emitter(s)
- `pitborn:ballastNamed` — 1 emitter(s)
- `pitborn:ballastStart` — 1 emitter(s)
- `pitborn:crowdStyle` — 1 emitter(s)
- `pitborn:crowdTier` — 1 emitter(s)
- `pitborn:cullSettled` — 1 emitter(s)
- `pitborn:scoreboard` — 1 emitter(s)
- `pitborn:yardmasterDown` — 1 emitter(s)
- `pitborn:yardmasterStripped` — 1 emitter(s)
- `planet:npcHarvest` — 1 emitter(s)
- `planet:registered` — 1 emitter(s)
- `planet:unregistered` — 1 emitter(s)
- `presentation:audioCue` — 2 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:caption` — 13 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 2 emitter(s)
- `quiet:routeSold` — 1 emitter(s)
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
- `sensors:signatureLost` — 2 emitter(s)
- `sensors:signatureResolved` — 1 emitter(s)
- `service:decanted` — 1 emitter(s)
- `service:progress` — 1 emitter(s)
- `service:queued` — 1 emitter(s)
- `setPiece:staged` — 1 emitter(s)
- `settings:restored` — 1 emitter(s)
- `ship:berthSwitching` — 1 emitter(s)
- `ship:captured` — 1 emitter(s)
- `ship:cargoCapChanged` — 1 emitter(s)
- `ship:controlTransferred` — 1 emitter(s)
- `ship:loadoutPresetDeleted` — 1 emitter(s)
- `ship:loadoutPresetSaved` — 1 emitter(s)
- `ship:massChanged` — 1 emitter(s)
- `ship:parkedHoldSwap` — 2 emitter(s)
- `ship:released` — 1 emitter(s)
- `ship:sold` — 1 emitter(s)
- `shipjack:actionCommitted` — 1 emitter(s)
- `shipjack:claimResolved` — 1 emitter(s)
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
- `shipjack:yardCompleted` — 1 emitter(s)
- `shipjack:yardReceipt` — 1 emitter(s)
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
- `story:vergeObserversRevealed` — 1 emitter(s)
- `survivalArena:rosterPrewarm` — 1 emitter(s)
- `survivorPod:huntDispatched` — 1 emitter(s)
- `survivorPod:huntEnded` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:resolved` — 1 emitter(s)
- `survivorPod:stripBlocked` — 1 emitter(s)
- `swarm:broodBurst` — 1 emitter(s)
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
- `understory:compostRunComplete` — 1 emitter(s)
- `understory:gardenFed` — 1 emitter(s)
- `understory:gardenSeeded` — 1 emitter(s)
- `understory:gardenStage` — 1 emitter(s)
- `understory:sporeSkin` — 1 emitter(s)
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
- `vael:lienClamped` — 1 emitter(s)
- `vael:lienCut` — 1 emitter(s)
- `vael:lienPaid` — 1 emitter(s)
- `vael:lienTelegraph` — 1 emitter(s)
- `vael:lienThrown` — 1 emitter(s)
- `vael:lienTransferred` — 1 emitter(s)
- `vael:overrideThrust` — 1 emitter(s)
- `vael:pageNineArmed` — 1 emitter(s)
- `verb:used` — 1 emitter(s)
- `verge:appealDenied` — 1 emitter(s)
- `verge:appealGranted` — 1 emitter(s)
- `verge:courtConvened` — 1 emitter(s)
- `verge:directive` — 1 emitter(s)
- `verge:directiveViolated` — 1 emitter(s)
- `verge:jurorWoke` — 1 emitter(s)
- `verge:lawWoke` — 1 emitter(s)
- `verge:lineTrialPassed` — 1 emitter(s)
- `verge:massWeighed` — 1 emitter(s)
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
- `weather:ionBlackout` — 2 emitter(s)
- `web:linked` — 1 emitter(s)
- `weighing:overMass` — 1 emitter(s)
- `well:capture` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `world:courtRulingRecorded` — 1 emitter(s)
- `world:criticalSpawnDeferred` — 2 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:residency` — 3 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
- `world:stuckCleared` — 1 emitter(s)
- `worldPressure:auditAnnounced` — 1 emitter(s)
- `worldPressure:auditDelayed` — 1 emitter(s)
- `worldPressure:colossusRemains` — 1 emitter(s)
- `worldPressure:gateClosed` — 1 emitter(s)
- `worldPressure:scaffoldSpawned` — 1 emitter(s)
- `worldPressure:slowGray` — 1 emitter(s)
- `worldPressure:tideChanged` — 1 emitter(s)
- `wreckCourt:action` — 1 emitter(s)
- `wreckCourt:opened` — 1 emitter(s)
- `wreckCourt:result` — 1 emitter(s)
- `wreckCourt:ruled` — 1 emitter(s)
- `wreckEcology:decayed` — 1 emitter(s)
- `wreckEcology:seeded` — 1 emitter(s)
- `wreckMission:choiceApplied` — 1 emitter(s)
