# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-10-08 · 1184 events · 4192 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:397`, `systems/encounterDirector.js:297`, `ui/discoveryPlate.js:140` |
| `achievement:unlocked` | — | `audio/audioSystem.js:2527` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:1984` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:786` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:1966` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2282` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:818` | `render/vfx.js:2565`, `systems/salvage.js:151` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1537` | `ui/galaxyMap.js:1786` |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:2070` | `systems/lawSecurity.js:318`, `systems/salvage.js:152` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:167` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:508` | `systems/presentationOrchestrator.js:168`, `systems/scissorwake.js:81`, `systems/tetherGameplay.js:302`, `ui/threatHalo.js:797` |
| `ai:egressExit` | `ai/egressExit.js:74` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:244` | — |
| `ai:flee` | `systems/ai.js:265`, `systems/traffic.js:5960`, `systems/wingMorale.js:326` | `render/authoredMotion.js:1012`, `render/vfx.js:2626`, `systems/barkDirector.js:598`, `systems/combatOutcome.js:159`, `systems/encounterDirector.js:314`, `systems/presentationOrchestrator.js:169` |
| `ai:formationBroken` | `systems/ai.js:441`, `systems/wingMorale.js:276` | `render/vfx.js:2627` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:600` |
| `ai:stateChange` | `systems/ai.js:262` | `render/authoredMotion.js:1029`, `systems/combatOutcome.js:185` |
| `ai:telegraph` | `systems/ai.js:337`, `systems/encounterScripts.js:172`, `systems/encounterScripts.js:1081`, `systems/masslineSnares.js:347`, `systems/mines.js:150`, `systems/tacticalAI.js:493` | `audio/audioSystem.js:2490`, `render/authoredMotion.js:1011`, `render/vfx.js:2625`, `systems/presentationOrchestrator.js:166`, `systems/scissorwake.js:74`, `systems/survivalResults.js:494`, `ui/hud.js:3081`, `ui/survivalHud.js:226`, `ui/threatHalo.js:793` |
| `aiTrader:requestTrade` | `systems/traffic.js:7921` | `systems/economy.js:1450` |
| `alienEcology:blackBoxRecovered` | — | `systems/world.js:650` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:718` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:1216` | `systems/world.js:658` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:649` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:647` |
| `alienEcology:relaySevered` | — | `systems/world.js:648` |
| `alienEcology:vented` | `systems/alienEcology.js:1358` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | `systems/story.js:163` |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | `systems/story.js:164` |
| `anomaly:bearing` | `systems/scanner.js:1305` | `systems/presentationOrchestrator.js:198` |
| `anomaly:triangulated` | `systems/scanner.js:1323` | `systems/world.js:590` |
| `asset:deployed` | `systems/automation.js:2222`, `systems/automation.js:2297`, `systems/automation.js:2390`, `systems/claims.js:603` | `systems/missions.js:1606`, `systems/onboarding.js:630`, `systems/story.js:247` |
| `asteroid:chunked` | `systems/mining.js:2241` | `render/asteroidMotionPresentation.js:491`, `render/authoredMotion.js:1027`, `render/vfx.js:2596`, `systems/presentationOrchestrator.js:211` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1073`, `systems/mining.js:1033` | `audio/audioSystem.js:2406`, `render/authoredMotion.js:1026`, `render/vfx.js:2595`, `systems/fieldDepletion.js:743`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:471`, `render/shipMicroMotion.js:2267`, `render/vfx.js:2654`, `render/vfx.js:5844`, `render/vfx.js:10545`, `render/vfx.js:11770`, `systems/ai.js:717`, `systems/alienEcology.js:389`, `systems/barkDirector.js:1536`, `systems/beacons.js:77`, `systems/beacons.js:82`, `systems/beacons.js:116`, `systems/bombs.js:1082`, `systems/bombs.js:1206`, `systems/bombs.js:1592`, `systems/bracket.js:125`, `systems/bulletTime.js:200`, `systems/bulletTime.js:216`, `systems/bulletTime.js:296`, `systems/cargo.js:1064`, `systems/cargo.js:1087`, `systems/claims.js:450`, `systems/claims.js:535`, `systems/claims.js:580`, `systems/claims.js:1631`, `systems/claims.js:2393`, `systems/cloak.js:195`, `systems/cloak.js:208`, `systems/countermeasures.js:525`, `systems/countermeasures.js:561`, `systems/crafting.js:338`, `systems/crafting.js:348`, `systems/eighthBellRuntime.js:104`, `systems/eighthBellRuntime.js:119`, `systems/fields.js:844`, `systems/fields.js:1150`, `systems/fields.js:1281`, `systems/fields.js:1554`, `systems/flybyFocus.js:519`, `systems/gyreSnare.js:275`, `systems/gyreSnare.js:791`, `systems/gyreSnare.js:1035`, `systems/gyreSnare.js:1053`, `systems/gyreSnare.js:1253`, `systems/gyreSnare.js:1297`, `systems/gyreSnare.js:1332`, `systems/gyreSnare.js:1500`, `systems/gyreSnare.js:1508`, `systems/gyreSnare.js:1535`, `systems/gyreSnare.js:1541`, `systems/gyreSnare.js:1593`, `systems/gyreSnare.js:1652`, `systems/gyreSnare.js:1687`, `systems/hullBurst.js:217`, `systems/hullBurst.js:351`, `systems/hullBurst.js:375`, `systems/hullBurst.js:489`, `systems/hullBurst.js:564`, `systems/hullFracture.js:350`, `systems/hullFracture.js:469`, `systems/impulseCharges.js:696`, `systems/impulseCharges.js:803`, `systems/impulseCharges.js:1024`, `systems/impulseCharges.js:1230`, `systems/impulseCharges.js:1343`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:161`, `systems/massSeed.js:544`, `systems/massSeed.js:587`, `systems/masslineThrow.js:246`, `systems/masslineThrow.js:572`, `systems/masslineThrow.js:659`, `systems/mining.js:781`, `systems/mining.js:2329`, `systems/morrow.js:169`, `systems/precursorMachines.js:353`, `systems/precursorMachines.js:430`, `systems/precursorMachines.js:780`, `systems/precursorMachines.js:829`, `systems/presentationAdapters.js:566`, `systems/presentationOrchestrator.js:504`, `systems/ravel.js:131`, `systems/rubric.js:302`, `systems/ruckus.js:143`, `systems/salvage.js:991`, `systems/salvage.js:1083`, `systems/salvage.js:1133`, `systems/solstice.js:296`, `systems/tacticalAI.js:676`, `systems/tumbleStates.js:474`, `systems/tumbleStates.js:544`, `systems/vesper.js:212`, `systems/volatileExposure.js:494`, `systems/volatileExposure.js:568`, `systems/weapons.js:1941`, `ui/commsRadial.js:556`, `ui/commsRadial.js:602`, `ui/commsRadial.js:794`, `ui/commsRadial.js:825`, `ui/hud.js:2502`, `ui/hud.js:3858`, `ui/hud.js:4095`, `ui/hud.js:4155`, `ui/hud.js:4197`, `ui/hud.js:4216`, `ui/hud.js:4313`, `ui/hud.js:4463`, `ui/hud.js:4769`, `ui/input.js:196`, `ui/input.js:225`, `ui/input.js:296`, `ui/input.js:334`, `ui/input.js:340`, `ui/input.js:399`, `ui/input.js:458`, `ui/input.js:464`, `ui/input.js:470`, `ui/input.js:476`, `ui/input.js:689`, `ui/input.js:896`, `ui/input.js:901`, `ui/input.js:919`, `ui/input.js:924`, `ui/input.js:1017`, `ui/input.js:1026`, `ui/input.js:1031`, `ui/input.js:1040`, `ui/input.js:1055`, `ui/input.js:1097`, `ui/input.js:1108`, `ui/input.js:1112`, `ui/input.js:1125`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:490`, `ui/screens/base.js:1192`, `ui/screens/base.js:1442`, `ui/screens/missionLog.js:2222`, `ui/screens/missionLog.js:2226`, `ui/screens/missionLog.js:2230`, `ui/screens/missionLog.js:2234`, `ui/screens/missionLog.js:2250`, `ui/screens/missionLog.js:2258`, `ui/screens/missionLog.js:2265`, `ui/screens/missionLog.js:2272`, `ui/screens/missionLog.js:2280`, `ui/screens/missionLog.js:2287`, `ui/screens/missionLog.js:2294`, `ui/screens/missionLog.js:2303`, `ui/screens/missionLog.js:2310`, `ui/screens/missionLog.js:2326`, `ui/screens/missionLog.js:2357`, `ui/screens/missionLog.js:2377`, `ui/shipLedgerPanel.js:310`, `ui/shipLedgerPanel.js:317`, `ui/shipLedgerPanel.js:324`, `ui/station/screens/bar.js:574`, `ui/station/screens/bar.js:661`, `ui/station/screens/bar.js:665`, `ui/station/screens/bar.js:669`, `ui/station/screens/bar.js:691`, `ui/station/screens/bar.js:707`, `ui/station/screens/bar.js:736`, `ui/station/screens/bar.js:761`, `ui/station/screens/bar.js:770`, `ui/station/screens/contracts.js:1365`, `ui/station/screens/contracts.js:1376`, `ui/station/screens/contracts.js:1412`, `ui/station/screens/contracts.js:1415`, `ui/station/screens/contracts.js:1454`, `ui/station/screens/factions.js:361`, `ui/station/screens/industry.js:417`, `ui/station/screens/industry.js:458`, `ui/station/screens/industry.js:483`, `ui/station/screens/industry.js:491`, `ui/station/screens/industry.js:497`, `ui/station/screens/industry.js:507`, `ui/station/screens/market.js:975`, `ui/station/screens/market.js:1661`, `ui/station/screens/market.js:1730`, `ui/station/screens/market.js:1738`, `ui/station/screens/market.js:1802`, `ui/station/screens/market.js:1814`, `ui/station/screens/market.js:2010`, `ui/station/screens/shipworks.js:658`, `ui/station/screens/shipworks.js:3487`, `ui/station/screens/shipworks.js:4438`, `ui/station/screens/shipworks.js:4509`, `ui/station/screens/shipworks.js:4526`, `ui/station/screens/shipworks.js:4539`, `ui/station/screens/shipworks.js:4543`, `ui/station/screens/shipworks.js:4548`, `ui/station/screens/shipworks.js:4578`, `ui/station/screens/shipworks.js:4596`, `ui/station/screens/shipworks.js:4632`, `ui/station/screens/shipworks.js:4654`, `ui/station/screens/shipworks.js:4656`, `ui/station/screens/shipworks.js:4674`, `ui/station/screens/shipworks.js:4723`, `ui/station/screens/shipworks.js:4733`, `ui/station/screens/shipworks.js:4739`, `ui/station/screens/shipworks.js:4764`, `ui/station/screens/shipworks.js:4775`, `ui/station/screens/shipworks.js:4782`, `ui/station/screens/shipworks.js:4824`, `ui/station/screens/shipworks.js:4831`, `ui/station/screens/shipworks.js:4842`, `ui/station/screens/shipworks.js:4852`, `ui/station/screens/shipworks.js:4857`, `ui/station/screens/shipworks.js:4865`, `ui/station/screens/shipworks.js:4874`, `ui/station/screens/shipworks.js:4881`, `ui/station/screens/shipworks.js:5009`, `ui/station/screens/shipworks.js:5019`, `ui/station/screens/shipworks.js:5029`, `ui/station/screens/shipworks.js:5039`, `ui/station/screens/shipworks.js:5092`, `ui/station/screens/shipworks.js:5129`, `ui/station/screens/shipworks.js:5133`, `ui/station/screens/shipworks.js:5151`, `ui/station/screens/shipworks.js:5155`, `ui/station/screens/shipworks.js:5168`, `ui/station/screens/shipworks.js:5172`, `ui/station/stationApp.js:641`, `ui/station/stationApp.js:925`, `ui/station/stationApp.js:961`, `ui/uiRoot.js:1363`, `ui/wingmanRadial.js:205`, `ui/wingmanRadial.js:227`, `ui/wingmanRadial.js:252`, `ui/wingmanRadial.js:289`, `ui/wingmanRadial.js:314` | `audio/audioSystem.js:2590` |
| `automation:assetDistressed` | `systems/automation.js:1968` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2493` | `systems/intervention.js:70`, `systems/lossLedger.js:427`, `systems/missions.js:1608` |
| `automation:assetRepossessed` | `systems/automation.js:2000` | `ui/automationPayoff.js:90` |
| `automation:assetResumed` | `systems/automation.js:2338` | — |
| `automation:incomeCredited` | `systems/automation.js:2031`, `systems/automation.js:2042`, `systems/automation.js:2772` | — |
| `automation:offlineSummary` | `systems/automation.js:2531`, `systems/automation.js:2555`, `systems/automation.js:2579`, `systems/automation.js:2602`, `systems/automation.js:2819` | `ui/automationPayoff.js:80`, `ui/dockArrival.js:69` |
| `automation:outpostRaided` | `systems/automation.js:1895`, `systems/automation.js:2894` | `systems/lossLedger.js:428` |
| `automation:programAssigned` | `systems/automation.js:2177` | `systems/missions.js:1607` |
| `automation:traderCycleCompleted` | `systems/automation.js:1653` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:578` | `systems/presentationOrchestrator.js:199` |
| `band:bearingRequest` | `systems/bandRadio.js:551` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:825`, `systems/uniqueWrecks.js:868` | `render/authoredMotion.js:1000` |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:832`, `systems/uniqueWrecks.js:840`, `systems/uniqueWrecks.js:854` | — |
| `band:bed` | `systems/bandRadio.js:635` | `audio/audioSystem.js:2713` |
| `band:cycle` | `ui/bandHud.js:83`, `ui/input.js:356` | — |
| `band:status` | `systems/bandRadio.js:617` | `ui/bandHud.js:87` |
| `barkDirector:voice` | — | `audio/audioSystem.js:2670` |
| `beacon:deploy` | — | `systems/beacons.js:52` |
| `beacon:deployed` | `systems/beacons.js:111` | `render/shipMicroMotion.js:1317`, `systems/onboarding.js:788` |
| `beam:denied` | `systems/mining.js:436`, `systems/mining.js:480`, `systems/mining.js:495`, `systems/mining.js:506`, `systems/mining.js:539` | `render/authoredMotion.js:972` |
| `beam:repaired` | `systems/mining.js:601` | — |
| `beam:transferred` | `systems/mining.js:655` | — |
| `bombs:armed` | `systems/bombs.js:1140` | `audio/bombAudio.js:440` |
| `bombs:commanded` | `systems/bombs.js:1095` | — |
| `bombs:cycle` | `systems/bombs.js:746`, `systems/bombs.js:1073` | `audio/bombAudio.js:469` |
| `bombs:denied` | `systems/bombs.js:620`, `systems/bombs.js:739`, `systems/bombs.js:763`, `systems/bombs.js:800`, `systems/bombs.js:839`, `systems/bombs.js:864`, `systems/bombs.js:1011`, `systems/bombs.js:1030` | — |
| `bombs:destroyed` | `systems/bombs.js:1589` | `audio/bombAudio.js:441`, `render/vfx.js:2621` |
| `bombs:detonated` | `systems/bombs.js:1199` | `audio/bombAudio.js:444`, `render/vfx.js:2619` |
| `bombs:dropped` | `systems/bombs.js:1081` | `audio/bombAudio.js:438`, `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:647` |
| `bombs:fieldEnded` | `systems/bombs.js:1487` | `audio/bombAudio.js:452`, `render/vfx.js:2620` |
| `bombs:primed` | `systems/bombs.js:1107` | `audio/bombAudio.js:439` |
| `bombs:rackChanged` | `systems/bombs.js:966` | `audio/bombAudio.js:474` |
| `bombs:redirected` | `systems/bombs.js:1555` | — |
| `bombs:released` | `systems/bombs.js:1613` | `audio/bombAudio.js:455` |
| `bombs:stockChanged` | `systems/bombs.js:770`, `systems/bombs.js:888`, `systems/bombs.js:1078` | — |
| `borrowedSun:lost` | `systems/borrowedSun.js:206` | — |
| `borrowedSun:notice` | `systems/borrowedSun.js:159` | — |
| `borrowedSun:offer` | `systems/borrowedSun.js:193` | `ui/borrowedSunPrompt.js:5` |
| `borrowedSun:phase` | `systems/borrowedSun.js:150` | — |
| `borrowedSun:route` | `ui/borrowedSunPrompt.js:15` | — |
| `borrowedVoice:disposition` | `ui/borrowedVoicePrompt.js:16` | — |
| `borrowedVoice:dispositionAccepted` | `systems/borrowedVoice.js:122` | — |
| `borrowedVoice:fragmentRecovered` | `systems/borrowedVoice.js:97` | — |
| `borrowedVoice:offer` | `systems/borrowedVoice.js:106` | `ui/borrowedVoicePrompt.js:4` |
| `boss:defeated` | `systems/world.js:927` | `systems/survivalAnnounce.js:331` |
| `bounty:cleared` | `systems/economy.js:3195` | `systems/heat.js:340` |
| `bounty:cooled` | `systems/heat.js:618` | `systems/barkDirector.js:621` |
| `bracket:bank` | `systems/bracket.js:182` | — |
| `bracket:matchFinished` | `systems/bracket.js:239` | — |
| `bracket:matchStarted` | `systems/bracket.js:143` | — |
| `bracket:save` | `systems/bracket.js:188` | — |
| `bracket:shotResolved` | `systems/bracket.js:227` | — |
| `bracket:voice` | `systems/bracket.js:123` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:327` | `audio/audioSystem.js:2480` |
| `bulletTime:end` | `systems/bulletTime.js:215` | `audio/audioSystem.js:2712` |
| `bulletTime:start` | `systems/bulletTime.js:199` | `audio/audioSystem.js:2709`, `systems/onboarding.js:747` |
| `camera:shake` | `render/shipMicroMotion.js:2265`, `render/vfx.js:6106`, `render/vfx.js:6406`, `render/vfx.js:6752`, `systems/combat.js:760`, `systems/combat.js:920`, `systems/combat.js:1103`, `systems/drill.js:1634`, `systems/flybyFocus.js:518`, `systems/gyreSnare.js:282`, `systems/gyreSnare.js:792`, `systems/gyreSnare.js:1048`, `systems/gyreSnare.js:1645`, `systems/intervention.js:259`, `systems/presentationAdapters.js:479`, `systems/survivalAnnounce.js:573`, `systems/tetherGameplay.js:636` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:532`, `ui/input.js:533`, `ui/input.js:765` | — |
| `capitalBoss:detach` | `systems/missions.js:1623` | — |
| `capitalBoss:start` | `systems/missions.js:6712` | `systems/swarmJuice.js:107` |
| `capitalBoss:telegraph` | — | `render/authoredMotion.js:1028` |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:110`, `systems/capitalBossEncounters.js:132` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:788` | `systems/world.js:592` |
| `cargo:changed` | `systems/cargo.js:364`, `systems/mining.js:2568` | `systems/ships.js:1623`, `ui/cargoConscience.js:142`, `ui/commandBar.js:412`, `ui/hud.js:4228`, `ui/hud.js:4257`, `ui/hudMeta.js:217` |
| `cargo:delivered` | `systems/asteroidSites.js:2560`, `systems/missions.js:7654`, `systems/missions.js:7713`, `systems/missions.js:7808`, `systems/missions.js:7858` | `systems/economy.js:1462` |
| `cargo:fragileLost` | `systems/fragileCargo.js:200` | — |
| `cargo:full` | `systems/cargo.js:468`, `systems/mining.js:1566`, `systems/mining.js:2546` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:580`, `systems/presentationOrchestrator.js:219`, `ui/alerts.js:551`, `ui/floatingText.js:311` |
| `cargo:hotDockSpill` | `systems/cargo.js:1023` | — |
| `cargo:jettison` | `ui/hud.js:3866` | `ui/hud.js:4160` |
| `cargo:jettisoned` | `systems/cargo.js:1170` | `audio/audioSystem.js:2456`, `render/authoredMotion.js:1037`, `render/shipMicroMotion.js:1315`, `systems/barkDirector.js:609`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:729`, `systems/onboarding.js:796` |
| `cargo:massSettled` | `systems/cargo.js:746` | `systems/presentationOrchestrator.js:218`, `systems/ships.js:1624` |
| `cargo:parkedHoldSwapped` | `systems/cargo.js:900` | — |
| `cargo:parkedTransfer` | `systems/cargo.js:962` | — |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:tallyThreeDelivered` | `systems/economy.js:3015` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:958` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:994` | — |
| `cargo:volatileExposed` | `systems/volatileExposure.js:384` | — |
| `cargo:volatileRupture` | `systems/volatileExposure.js:548` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:878`, `systems/lootShards.js:934` | `systems/volatileExposure.js:218` |
| `cargo:volatileVent` | `systems/volatileExposure.js:472` | — |
| `ceresWorkfleet:interrupted` | `systems/ceresWorkfleet.js:258` | — |
| `chain:detonated` | `systems/impulseCharges.js:1004` | `systems/fields.js:500` |
| `chain:primeEnded` | `systems/impulseCharges.js:967` | — |
| `chain:primed` | `systems/impulseCharges.js:944` | — |
| `chain:slam` | `systems/impulseCharges.js:878`, `systems/impulseCharges.js:898` | `systems/fields.js:499` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1033`, `systems/tetherGameplay.js:2211` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:1226` | `systems/onboarding.js:755` |
| `charge:armed` | `systems/impulseCharges.js:1041` | — |
| `charge:combo` | `systems/impulseCharges.js:1268`, `systems/impulseCharges.js:1327` | — |
| `charge:detonated` | `systems/impulseCharges.js:688`, `systems/impulseCharges.js:795`, `systems/impulseCharges.js:1016`, `systems/impulseCharges.js:1335` | `audio/audioSystem.js:2504`, `render/feel.js:1369`, `render/vfx.js:2617`, `systems/fields.js:501`, `systems/gamepad.js:832` |
| `charge:stuck` | `systems/impulseCharges.js:1118` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1314` |
| `charge:thrown` | `systems/impulseCharges.js:1213` | `render/ordnanceMotionPresentation.js:261` |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:18` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:19` |
| `claim:claimed` | `systems/claims.js:449` | `systems/onboarding.js:636`, `systems/story.js:256`, `systems/traffic.js:1719` |
| `claim:convoyAbandoned` | `systems/claims.js:1327`, `systems/claims.js:1445` | `systems/traffic.js:1722` |
| `claim:convoyDocked` | `systems/traffic.js:3034` | `systems/claims.js:405` |
| `claim:convoyManifested` | `systems/traffic.js:2934` | `systems/claims.js:404` |
| `claim:defenseDelegate` | — | `systems/claims.js:396` |
| `claim:defenseDelegateRefused` | `systems/claims.js:1796` | — |
| `claim:defenseEncounterRequested` | `systems/claims.js:1709` | — |
| `claim:defenseGo` | — | `systems/claims.js:395` |
| `claim:defenseIgnore` | — | `systems/claims.js:391` |
| `claim:defenseResolved` | `systems/claims.js:1878` | `ui/encounterChoicePrompt.js:133` |
| `claim:defenseStarted` | `systems/claims.js:1719` | `ui/encounterChoicePrompt.js:132` |
| `claim:defenseWarning` | `systems/claims.js:1613` | `systems/encounterDirector.js:307`, `ui/encounterChoicePrompt.js:129` |
| `claim:depotPatrolCompleted` | `systems/claims.js:2984` | `systems/factions.js:470` |
| `claim:depotPatrolRotation` | `systems/claims.js:2940` | — |
| `claim:depotPatrolSpent` | `systems/claims.js:1783` | — |
| `claim:depotSupport` | `systems/claims.js:2851`, `systems/claims.js:2877` | — |
| `claim:freightDelivered` | `systems/traffic.js:3245` | — |
| `claim:infrastructureActive` | `systems/claims.js:1149`, `systems/claims.js:2639` | `systems/traffic.js:1717` |
| `claim:infrastructureConstructed` | `systems/claims.js:516`, `systems/claims.js:2576` | — |
| `claim:infrastructureStatus` | `systems/claims.js:1160` | `systems/traffic.js:1718` |
| `claim:moduleBuilt` | `systems/claims.js:534` | — |
| `claim:raidRepelled` | `systems/claims.js:1562` | — |
| `claim:raidWarning` | `systems/claims.js:1555` | `audio/audioSystem.js:2474` |
| `claim:receipt` | `systems/claims.js:2097` | — |
| `claim:sensorPostRumor` | `systems/claims.js:1209` | `systems/world.js:626` |
| `claim:specialized` | `systems/claims.js:575` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:3141` | — |
| `claims:migrated` | `systems/claims.js:2215` | — |
| `cloak:burned` | `systems/cloak.js:261` | — |
| `cloak:dropped` | `systems/cloak.js:207` | `audio/audioSystem.js:2408`, `render/authoredMotion.js:1032`, `render/shipMicroMotion.js:1311` |
| `cloak:engaged` | `systems/cloak.js:194` | `render/authoredMotion.js:1031`, `render/shipMicroMotion.js:1310`, `systems/gamepad.js:837`, `systems/onboarding.js:751` |
| `cloak:faded` | `systems/aiPorts.js:1124` | `audio/audioSystem.js:2407` |
| `collision:tearOff` | `systems/hullFracture.js:460` | `render/vfx.js:2537` |
| `combat:actionCancelled` | `combat/actions.js:373` | — |
| `combat:actionCompleted` | `combat/actions.js:359` | — |
| `combat:actionPhase` | `combat/actions.js:222` | — |
| `combat:actionRejected` | `combat/actions.js:395` | `ui/toasts.js:535` |
| `combat:actionStarted` | `combat/actions.js:189` | `systems/presentationOrchestrator.js:171`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2525` |
| `combat:baseDestroyed` | `systems/combat.js:906` | `systems/economy.js:1512` |
| `combat:beamStop` | `systems/weapons.js:1244` | `audio/audioSystem.js:2339`, `render/asteroidMotionPresentation.js:490`, `render/vfx.js:2521` |
| `combat:bounceContinued` | `combat/attackHit.js:36` | `render/vfx.js:2526`, `systems/presentationOrchestrator.js:262` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:407` | `render/feel.js:1404`, `render/vfx.js:2535`, `systems/fields.js:503`, `systems/gamepad.js:824` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:426` | `render/vfx.js:2536` |
| `combat:damage` | `combat/damage.js:335` | `audio/audioSystem.js:2354`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `render/asteroidMotionPresentation.js:483`, `render/authoredMotion.js:988`, `render/feel.js:1205`, `render/shipMicroMotion.js:1297`, `render/vfx.js:2527`, `save/saveSystem.js:374`, `systems/ai.js:106`, `systems/aiEncounter.js:136`, `systems/barkDirector.js:604`, `systems/collisionConsequences.js:97`, `systems/combatOutcome.js:184`, `systems/cruise.js:56`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:288`, `systems/factionPresence.js:453`, `systems/heat.js:301`, `systems/lawSecurity.js:313`, `systems/missions.js:1592`, `systems/npcJobsRuntime.js:1033`, `systems/onboarding.js:546`, `systems/onboarding.js:557`, `systems/presentationOrchestrator.js:165`, `systems/salvageActions.js:134`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1702`, `systems/stationBroadcast.js:154`, `systems/survivalResults.js:487`, `systems/swarmJuice.js:101`, `systems/titles.js:582`, `systems/traffic.js:1637`, `systems/volatileExposure.js:216`, `ui/alerts.js:535`, `ui/commandBar.js:401`, `ui/floatingText.js:196`, `ui/hud.js:2021`, `ui/hud.js:2301`, `ui/hud.js:2532`, `ui/uiRoot.js:693` |
| `combat:emp` | `combat/damage.js:337` | `ui/hud.js:2538` |
| `combat:fire` | `systems/impulseCharges.js:729`, `systems/weapons.js:1138`, `systems/weapons.js:1223`, `systems/weapons.js:1425`, `systems/weapons.js:1756` | `audio/audioSystem.js:2338`, `data/stationBubbles.js:181`, `render/feel.js:1305`, `render/shipMicroMotion.js:1295`, `render/vfx.js:2520`, `systems/cloak.js:53`, `systems/cruise.js:64`, `systems/lawSecurity.js:314`, `systems/onboarding.js:484`, `systems/onboarding.js:497`, `systems/presentationOrchestrator.js:170`, `systems/story.js:261`, `systems/traffic.js:1638`, `systems/world.js:656`, `ui/hud.js:4272` |
| `combat:hit` | `systems/salvageActions.js:609`, `systems/salvageActions.js:700` | `systems/routeFollower.js:383`, `systems/story.js:262` |
| `combat:hitAsset` | `systems/wingmen.js:204` | `systems/automation.js:548` |
| `combat:kill` | `systems/world.js:5943` | — |
| `combat:lockChanged` | `systems/weapons.js:905` | `systems/world.js:585`, `ui/alerts.js:544` |
| `combat:outcome` | `systems/combatOutcome.js:301` | `systems/barkDirector.js:601` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:302` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:5260`, `systems/npcJobsRuntime.js:5516` | `combat/kernel.js:191` |
| `combat:requestAction` | — | `combat/kernel.js:189` |
| `combat:routeDamage` | `systems/bombs.js:1549`, `systems/drill.js:1646`, `systems/hullBurst.js:497`, `systems/impulseCharges.js:1559`, `systems/mines.js:308`, `systems/missions.js:7062` | `combat/kernel.js:190`, `systems/routeFollower.js:384` |
| `combat:shockwavePass` | — | `render/asteroidMotionPresentation.js:485`, `render/vfx.js:2624` |
| `combat:shove` | `systems/onboarding.js:2314` | `audio/audioSystem.js:2484`, `systems/onboarding.js:496` |
| `combat:statusApplied` | `combat/statuses.js:212` | `render/vfx.js:2538` |
| `combat:statusExpired` | `combat/statuses.js:90` | `audio/bombAudio.js:464`, `systems/tumbleStates.js:122` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:160`, `systems/encounterDirector.js:280`, `systems/factionPresence.js:451`, `systems/npcJobsRuntime.js:1036`, `systems/presentationOrchestrator.js:241`, `systems/surrenderRecovery.js:69`, `systems/tumbleStates.js:126`, `systems/wingMorale.js:202` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1313`, `systems/factionPresence.js:452`, `systems/npcJobsRuntime.js:1037`, `systems/presentationOrchestrator.js:250`, `systems/surrenderRecovery.js:70` |
| `combat:surrendered` | — | `systems/combatOutcome.js:161`, `systems/surrenderRecovery.js:68` |
| `combat:tumbled` | `systems/tumbleStates.js:472` | `systems/fields.js:502`, `systems/missions.js:1501`, `systems/tetherGameplay.js:301` |
| `combat:warded` | `combat/damage.js:299` | — |
| `combat:weakPointHit` | `systems/combat.js:821` | `render/vfx.js:2528`, `ui/floatingText.js:243` |
| `comms:log` | `data/encounters/344-opening-hauler-raid.js:130`, `data/encounters/350-the-long-tail.js:175`, `data/encounters/350-the-long-tail.js:209`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:154`, `data/encounters/352-the-slot.js:174`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:138`, `data/encounters/355-the-winnow-throw.js:155`, `data/encounters/355-the-winnow-throw.js:162`, `data/encounters/355-the-winnow-throw.js:179`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:183`, `data/encounters/357-the-handoff.js:197`, `data/encounters/357-the-handoff.js:222`, `data/encounters/357-the-handoff.js:262`, `data/encounters/357-the-handoff.js:278`, `data/encounters/358-the-press-camp.js:56`, `data/encounters/358-the-press-camp.js:201`, `data/encounters/358-the-press-camp.js:214`, `data/encounters/362-the-salvage-watch.js:275`, `data/encounters/367-the-salvage-tail.js:180`, `systems/alienEcology.js:386`, `systems/alienEcology.js:847`, `systems/alienEcology.js:876`, `systems/alienEcology.js:918`, `systems/alienEcology.js:936`, `systems/alienEcology.js:996`, `systems/alienEcology.js:1064`, `systems/alienEcology.js:1076`, `systems/alienEcology.js:1755`, `systems/alienEcology.js:1783`, `systems/alienEcology.js:1794`, `systems/alienEcology.js:1853`, `systems/alienEcology.js:1895`, `systems/alienEcology.js:2098`, `systems/asteroidSites.js:1478`, `systems/contractClauses.js:566`, `systems/encounterDirector.js:2444`, `systems/encounterScripts.js:750`, `systems/encounterScripts.js:3068`, `systems/encounterScripts.js:3314`, `systems/factions.js:533`, `systems/missions.js:6091`, `systems/morrow.js:221`, `systems/precursorMachines.js:53`, `systems/precursorMachines.js:218`, `systems/precursorMachines.js:231`, `systems/precursorMachines.js:248`, `systems/precursorMachines.js:271`, `systems/precursorMachines.js:291`, `systems/precursorMachines.js:305`, `systems/precursorMachines.js:314`, `systems/precursorMachines.js:379`, `systems/precursorMachines.js:444`, `systems/precursorMachines.js:471`, `systems/precursorMachines.js:504`, `systems/precursorMachines.js:519`, `systems/precursorMachines.js:551`, `systems/precursorMachines.js:572`, `systems/precursorMachines.js:579`, `systems/precursorMachines.js:595`, `systems/precursorMachines.js:638`, `systems/precursorMachines.js:767`, `systems/precursorMachines.js:818`, `systems/precursorMachines.js:855`, `systems/precursorMachines.js:880`, `systems/precursorMachines.js:933`, `systems/precursorMachines.js:941`, `systems/salvage.js:171`, `systems/salvage.js:910`, `systems/salvage.js:985`, `systems/salvage.js:1131`, `systems/towlineTable.js:265`, `systems/vesper.js:254` | `ui/floatingText.js:94` |
| `comms:message` | `systems/traffic.js:5812`, `systems/traffic.js:6579` | — |
| `comms:popup` | `systems/ai.js:496`, `systems/careerContracts.js:442`, `systems/careerContracts.js:456`, `systems/careerContracts.js:472`, `systems/factionPresence.js:1116`, `systems/factionPresence.js:1166`, `systems/factionPresence.js:1180`, `systems/memorialThief.js:102`, `systems/missions.js:5159`, `systems/missions.js:7994`, `systems/missions.js:8087`, `systems/missions.js:8167`, `systems/missions.js:9088`, `systems/missions.js:9390`, `systems/missions.js:9511`, `systems/missions.js:9572`, `systems/missions.js:9732`, `systems/missions.js:10806`, `systems/missions.js:10848`, `systems/missions.js:11360`, `systems/onboarding.js:1013`, `systems/scenarioRuntime.js:186`, `systems/story.js:561`, `systems/story.js:1341`, `systems/story.js:1369` | `audio/audioSystem.js:2573`, `ui/screens/codex.js:846` |
| `conflict:flip` | `systems/factions.js:823` | `systems/factionPresence.js:460`, `systems/sectorSim.js:128`, `systems/story.js:251` |
| `conflict:frontAction` | `systems/factions.js:710` | — |
| `conflict:warDeclared` | `systems/factions.js:767` | — |
| `contactHail:availability` | `systems/scanner.js:1816`, `systems/scanner.js:1827` | — |
| `contactHail:choice` | `ui/commsRadial.js:550`, `ui/contactHailPrompt.js:167` | `systems/scanner.js:1011` |
| `contactHail:clear` | `systems/scanner.js:1838` | — |
| `contactHail:handoff` | `systems/scanner.js:1609` | — |
| `contactHail:offer` | `systems/scanner.js:1633` | — |
| `contactHail:request` | `ui/commsRadial.js:603`, `ui/contactHailPrompt.js:161` | `systems/scanner.js:1010` |
| `contactHail:response` | `systems/scanner.js:1656`, `systems/scanner.js:1676` | `systems/traffic.js:1626` |
| `contraband:bribe` | `systems/encounterScripts.js:423`, `ui/customsPrompt.js:230` | `systems/economy.js:1508` |
| `contraband:scanned` | `systems/economy.js:3882` | `systems/encounterDirector.js:289`, `systems/factions.js:450`, `systems/heat.js:306`, `systems/lawSecurity.js:324`, `ui/customsPrompt.js:150` |
| `contract:clauseBroken` | `systems/contractClauses.js:579` | `systems/missions.js:1559` |
| `contract:clauseHonored` | `systems/contractClauses.js:498`, `systems/missions.js:8181` | `systems/contractClauses.js:265` |
| `contract:clauseSettledKill` | `systems/contractClauses.js:355` | `systems/missions.js:1462` |
| `countermeasure:denied` | `systems/countermeasures.js:538` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:520` | `render/shipMicroMotion.js:1316` |
| `craft:complete` | `systems/crafting.js:337`, `systems/crafting.js:383` | `ui/station/screens/industry.js:518` |
| `craft:queueChanged` | `systems/crafting.js:198`, `systems/crafting.js:222`, `systems/crafting.js:347` | `render/authoredMotion.js:998`, `systems/onboarding.js:641`, `ui/station/screens/industry.js:518` |
| `credits:changed` | `systems/economy.js:3104`, `systems/economy.js:3116` | `audio/audioSystem.js:2441`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:413`, `ui/hud.js:4256` |
| `cruise:charging` | `systems/cruise.js:134` | `render/vfx.js:2614`, `systems/presentationOrchestrator.js:178` |
| `cruise:dropped` | `systems/cruise.js:204` | `audio/audioSystem.js:2561`, `render/authoredMotion.js:1005`, `render/vfx.js:2616`, `systems/presentationOrchestrator.js:180` |
| `cruise:engaged` | `systems/cruise.js:109` | `audio/audioSystem.js:2557`, `render/vfx.js:2615`, `systems/presentationOrchestrator.js:179` |
| `cruise:snareRequest` | `systems/encounterScripts.js:592` | `render/authoredMotion.js:1004`, `systems/cruise.js:69` |
| `cruise:snared` | `systems/cruise.js:203` | `audio/audioSystem.js:2565` |
| `customs:breakScan` | `ui/customsPrompt.js:235` | `render/authoredMotion.js:1016` |
| `customs:submit` | `ui/customsPrompt.js:213` | `render/authoredMotion.js:1015`, `systems/lawSecurity.js:336` |
| `customs:weirBolt` | — | `systems/economy.js:1507` |
| `danger:miningNoise` | `systems/mining.js:2580` | — |
| `day:tick` | `core/coreSystem.js:395` | `systems/custodyConsequences.js:43`, `systems/economy.js:1429`, `systems/encounterDirector.js:262`, `systems/factions.js:482`, `systems/sectorSim.js:112` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:228` | `systems/combat.js:733` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:219` | `systems/combat.js:732` |
| `detonator:detonated` | `systems/impulseCharges.js:677` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:187` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:plateUnlocked` | `systems/world.js:882`, `systems/world.js:5776`, `systems/world.js:6254`, `systems/world.js:6875` | `audio/audioSystem.js:2481`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:848` |
| `distress:call` | `systems/traffic.js:5810` | — |
| `distress:rescued` | `systems/encounterScripts.js:749` | `systems/factions.js:460` |
| `dock:attempt` | `ui/input.js:191` | `ui/dockDenyBanner.js:54` |
| `dock:committed` | `ui/dockStateCommit.js:18` | — |
| `dock:denied` | `ui/dockDenyBanner.js:79` | `render/authoredMotion.js:1047` |
| `dock:docked` | `balance/careerCohorts.js:507`, `balance/careerCohorts.js:1994`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `systems/world.js:6094`, `ui/input.js:195` | `audio/audioSystem.js:2483`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/authoredMotion.js:1045`, `render/infrastructureMotion.js:195`, `render/shipMicroMotion.js:1306`, `save/saveSystem.js:401`, `systems/achievements.js:1110`, `systems/aftermathWrecks.js:1016`, `systems/autoTargetAssist.js:135`, `systems/combat.js:696`, `systems/economy.js:1476`, `systems/economyContracts.js:179`, `systems/factionPresence.js:449`, `systems/lawSecurity.js:333`, `systems/mining.js:262`, `systems/mining.js:264`, `systems/missions.js:1389`, `systems/onboarding.js:458`, `systems/onboarding.js:607`, `systems/pirateDisguise.js:37`, `systems/scanner.js:1014`, `systems/stationServices.js:205`, `systems/story.js:211`, `systems/world.js:619`, `systems/world.js:659`, `ui/alerts.js:435`, `ui/cargoConscience.js:143`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:55`, `ui/impoundPayPrompt.js:52`, `ui/impoundPayPrompt.js:57`, `ui/priceForecast.js:86`, `ui/promptDeck.js:853`, `ui/securityReadout.js:158`, `ui/uiRoot.js:1279`, `ui/watchlistHud.js:90`, `ui/wingmanRadial.js:332`, `ui/worldObjectInteraction.js:428`, `ui/wreckChoicePrompt.js:54` |
| `dock:launder` | `ui/station/screens/market.js:435` | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:1308`, `core/physics.js:1312`, `ui/input.js:164` | `render/authoredMotion.js:1044`, `systems/onboarding.js:566`, `ui/alerts.js:431`, `ui/input.js:170` |
| `dock:undocked` | `balance/careerCohorts.js:508`, `balance/careerCohorts.js:1999`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:729`, `ui/station/stationApp.js:886` | `audio/audioSystem.js:2488`, `render/authoredMotion.js:1046`, `render/infrastructureMotion.js:196`, `render/shipMicroMotion.js:1307`, `render/vfx.js:2498`, `save/saveSystem.js:402`, `systems/combat.js:701`, `systems/economy.js:1488`, `systems/missions.js:1408`, `systems/moralTrap.js:179`, `systems/onboarding.js:519`, `systems/presentationAdapters.js:212`, `systems/stationServices.js:206`, `systems/world.js:620`, `ui/impoundPayPrompt.js:55`, `ui/input.js:178`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1317` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1487` | `ui/uiRoot.js:1376` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1472`, `ui/sandbox/sandboxSetup.js:645` | `ui/uiRoot.js:1366` |
| `drill:approachRequested` | `ui/input.js:644` | `systems/tetherGameplay.js:300` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1364`, `ui/sandbox/sandboxSetup.js:644` | `ui/asteroid/asteroidScreen.js:1802`, `ui/uiRoot.js:1355` |
| `drill:break` | `systems/drill.js:1605` | `audio/audioSystem.js:2743`, `render/authoredMotion.js:1009`, `systems/asteroidSites.js:457`, `systems/presentationOrchestrator.js:227`, `ui/asteroid/asteroidScreen.js:1731`, `ui/screens/drill.js:1936` |
| `drill:cargoFull` | `systems/drill.js:277` | `audio/audioSystem.js:2745`, `systems/presentationOrchestrator.js:234`, `ui/asteroid/asteroidScreen.js:1721`, `ui/screens/drill.js:1907` |
| `drill:end` | `systems/drill.js:1192` | `audio/audioSystem.js:2753`, `render/authoredMotion.js:1010`, `systems/asteroidSites.js:467`, `systems/presentationOrchestrator.js:235` |
| `drill:gasHit` | `systems/drill.js:1633` | `audio/audioSystem.js:2744`, `systems/presentationOrchestrator.js:229`, `ui/asteroid/asteroidScreen.js:1708`, `ui/screens/drill.js:1836` |
| `drill:retry` | `systems/drill.js:1241` | `systems/presentationOrchestrator.js:236` |
| `drill:rockDepleted` | `systems/drill.js:222`, `systems/drill.js:256`, `systems/drill.js:1158` | `audio/audioSystem.js:2746`, `ui/asteroid/asteroidScreen.js:1718`, `ui/screens/drill.js:1898` |
| `drill:scanPulse` | `systems/drill.js:1314` | `audio/audioSystem.js:2747`, `systems/asteroidSites.js:489`, `systems/presentationOrchestrator.js:225`, `ui/asteroid/asteroidScreen.js:1725`, `ui/screens/drill.js:1924` |
| `drill:spark` | `systems/drill.js:1572` | `audio/audioSystem.js:2742`, `systems/presentationOrchestrator.js:226`, `ui/asteroid/asteroidScreen.js:1736`, `ui/screens/drill.js:1957` |
| `drill:start` | `systems/drill.js:1150` | `audio/audioSystem.js:2752`, `render/authoredMotion.js:1008`, `systems/asteroidSites.js:450`, `systems/onboarding.js:612`, `systems/presentationOrchestrator.js:224` |
| `drill:warn` | `systems/drill.js:229`, `systems/drill.js:280`, `systems/drill.js:289`, `systems/drill.js:1164`, `systems/drill.js:1169`, `systems/drill.js:1445`, `systems/drill.js:1484`, `systems/drill.js:1505`, `systems/drill.js:1524` | `audio/audioSystem.js:2748`, `systems/presentationOrchestrator.js:223`, `ui/asteroid/asteroidRenderer3d.js:7114`, `ui/asteroid/asteroidScreen.js:1714`, `ui/screens/drill.js:1864` |
| `drill:yield` | `systems/drill.js:254` | `audio/audioSystem.js:2739`, `systems/missions.js:1441`, `systems/presentationOrchestrator.js:228`, `ui/asteroid/asteroidScreen.js:1700`, `ui/screens/drill.js:1814` |
| `drone:grindStart` | `systems/automation.js:1023` | `render/authoredMotion.js:994` |
| `drone:grindStop` | — | `render/authoredMotion.js:995` |
| `ecology:claimCrew` | `systems/alienEcology.js:1756` | — |
| `ecology:coherence` | `systems/alienEcology.js:864` | — |
| `ecology:evidence` | `systems/precursorMachines.js:226`, `systems/precursorMachines.js:309`, `systems/precursorMachines.js:310`, `systems/precursorMachines.js:523`, `systems/precursorMachines.js:555`, `systems/precursorMachines.js:937`, `world/veilRayNursery.js:97` | `systems/world.js:662` |
| `ecology:factionOutcome` | `systems/economy.js:2592`, `systems/economy.js:2860` | `systems/world.js:661` |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:477` | `systems/world.js:663` |
| `ecology:relayPulse` | `systems/alienEcology.js:959` | — |
| `ecology:setpiece` | `systems/alienEcology.js:1975`, `systems/alienEcology.js:2041` | — |
| `economy:applyTradePressure` | `systems/automation.js:888`, `systems/automation.js:1746`, `systems/automation.js:1747`, `systems/claims.js:1427`, `systems/encounterDirector.js:1897`, `systems/encounterDirector.js:1945`, `systems/sectorSim.js:400`, `systems/traffic.js:9543`, `systems/traffic.js:11267` | `systems/economy.js:1454` |
| `economy:cargoKillOpportunity` | `systems/economy.js:2738` | `systems/missions.js:1436` |
| `economy:chargeCredits` | `systems/automation.js:1917`, `systems/automation.js:1924`, `systems/automation.js:2782`, `systems/automation.js:3006`, `systems/beacons.js:86`, `systems/bombs.js:767`, `systems/bombs.js:850`, `systems/bombs.js:868`, `systems/bombs.js:934`, `systems/claims.js:429`, `systems/claims.js:499`, `systems/claims.js:570`, `systems/claims.js:1515`, `systems/combat.js:1073`, `systems/encounterDirector.js:1891`, `systems/factions.js:568`, `systems/gateControlDirector.js:120`, `systems/mining.js:587`, `systems/missions.js:3710`, `systems/missions.js:3713`, `systems/npcJobsRuntime.js:3285`, `systems/npcJobsRuntime.js:5146`, `systems/pirateParley.js:885`, `systems/ships.js:2034`, `systems/ships.js:2144`, `systems/ships.js:2207`, `systems/world.js:4235`, `systems/world.js:4279`, `systems/world.js:5378` | `systems/economy.js:1418` |
| `economy:debtEscalated` | `systems/economy.js:3233` | — |
| `economy:demandShift` | `systems/economy.js:1869` | — |
| `economy:eventEnded` | `systems/economy.js:3960` | — |
| `economy:eventStarted` | `systems/economy.js:3935` | `ui/floatingText.js:316` |
| `economy:freightAccepted` | `systems/economy.js:2939`, `systems/economy.js:2968` | `systems/claims.js:387`, `systems/missions.js:1432` |
| `economy:grantCredits` | `systems/automation.js:2027`, `systems/automation.js:2038`, `systems/automation.js:2768`, `systems/bombs.js:887`, `systems/cargo.js:1051`, `systems/claims.js:1426`, `systems/claims.js:2201`, `systems/combat.js:923`, `systems/combat.js:935`, `systems/combat.js:1081`, `systems/encounterDirector.js:1892`, `systems/mining.js:2160`, `systems/mining.js:2345`, `systems/mining.js:2503`, `systems/missions.js:8113`, `systems/missions.js:8194`, `systems/missions.js:8197`, `systems/missions.js:8646`, `systems/missions.js:11273`, `systems/moralTrap.js:317`, `systems/npcJobsRuntime.js:3468`, `systems/scanReveal.js:152`, `systems/scanReveal.js:185`, `systems/ships.js:2257`, `systems/stationServices.js:269`, `systems/survivorPod.js:1101`, `systems/survivorPod.js:1438`, `systems/uniqueWrecks.js:1760` | `systems/economy.js:1417`, `systems/story.js:246` |
| `economy:marketOpened` | `ui/station/screens/market.js:2052` | `systems/economy.js:1434`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1618` | `systems/economy.js:1421` |
| `economy:releaseDebt` | `systems/stationServices.js:278` | `systems/economy.js:1419` |
| `economy:salvageIntakeApplied` | `systems/economy.js:3087` | `ui/alerts.js:470` |
| `economy:shortageRelieved` | `systems/economy.js:2960` | `systems/missions.js:1433` |
| `economy:sinkCharged` | `systems/economy.js:3130` | `ui/alerts.js:486` |
| `economy:tick` | `systems/economy.js:1634` | `systems/achievements.js:1096`, `ui/priceHistory.js:116` |
| `economy:towCharge` | `systems/world.js:6064` | `systems/economy.js:1500` |
| `economy:tradeCompleted` | `systems/economy.js:2580` | `audio/audioSystem.js:2444`, `audio/audioSystem.js:2531`, `careers/origins/haulerOriginSystem.js:90`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:409`, `systems/claims.js:384`, `systems/factions.js:426`, `systems/missions.js:1418`, `systems/missions.js:1434`, `systems/onboarding.js:463`, `systems/sectorSim.js:123`, `systems/story.js:241` |
| `economy:tradeFailed` | `systems/economy.js:2820`, `systems/economy.js:2846` | `audio/audioSystem.js:2450` |
| `emergent:audio` | `systems/emergentPrimitives.js:181` | `audio/emergentPrimitiveVoice.js:83` |
| `emergent:contact` | `systems/emergentPrimitives.js:187` | `render/feel.js:1387` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1741` | `ui/encounterChoicePrompt.js:126` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:303` |
| `encounter:claimDefenseRoster` | `systems/encounterDirector.js:1059` | — |
| `encounter:fingerprint` | `systems/encounterDirector.js:1829` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `systems/encounterDirector.js:2485` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:9260` | `systems/encounterDirector.js:287` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:2077`, `systems/encounterScripts.js:3288` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:2449` | `systems/barkDirector.js:619` |
| `encounter:predationCleared` | `systems/encounterScripts.js:1176` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1093`, `systems/encounterScripts.js:1161` | `render/authoredMotion.js:1013` |
| `encounter:predationTelegraph` | — | `render/authoredMotion.js:1030` |
| `encounter:receipt` | `systems/encounterDirector.js:1842` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:1824`, `systems/encounterDirector.js:1875`, `systems/survivalArena.js:1387` | `audio/audioSystem.js:2492`, `systems/aftermathWrecks.js:1015`, `systems/claims.js:399`, `systems/claims.js:400`, `systems/story.js:154`, `systems/terrainAnchors.js:88`, `systems/traffic.js:1723`, `systems/uniqueLootAbilities.js:147`, `ui/encounterChoicePrompt.js:127` |
| `encounter:spawned` | `systems/encounterDirector.js:1172` | `systems/uniqueLootAbilities.js:146` |
| `encounter:stale` | `systems/encounterDirector.js:449` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1144`, `systems/survivalArena.js:1297` | `audio/audioSystem.js:2491`, `render/authoredMotion.js:1025`, `systems/survivalResults.js:495`, `systems/terrainAnchors.js:87`, `systems/world.js:629` |
| `encounter:voice` | `systems/encounterDirector.js:1724` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | `ui/encounterChoicePrompt.js:128` |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | `systems/story.js:169` |
| `endgame:archive` | `systems/story.js:227`, `systems/story.js:1103` | `ui/screens/codex.js:851` |
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
| `endgame:pullCompleted` | `systems/claims.js:3087` | `systems/factions.js:473` |
| `endgame:sandboxContinued` | `systems/story.js:1085` | `ui/screens/missionLog.js:2506` |
| `entity:destroyed` | `main.js:595`, `main.js:879`, `save/saveSystem.js:5809`, `systems/survivorPod.js:341`, `systems/traffic.js:7569` | `audio/audioSystem.js:2400`, `combat/kernel.js:182`, `render/vfx.js:2552`, `systems/aftermathWrecks.js:994`, `systems/ai.js:119`, `systems/aiEncounter.js:135`, `systems/asteroidSites.js:570`, `systems/cloak.js:88`, `systems/combatOutcome.js:164`, `systems/encounterDirector.js:278`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:324`, `systems/lawSecurity.js:317`, `systems/missions.js:1464`, `systems/missions.js:1594`, `systems/missions.js:1598`, `systems/npcJobsRuntime.js:1021`, `systems/presentationOrchestrator.js:177`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:95`, `systems/survivalWave.js:140`, `systems/swarmArena.js:524`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:301` |
| `entity:killed` | `balance/careerCohorts.js:476`, `combat/damage.js:483`, `combat/kernel.js:125`, `systems/combat.js:889` | `audio/audioSystem.js:2399`, `render/feel.js:1257`, `render/shipMicroMotion.js:1290`, `render/vfx.js:2551`, `sim/titleAttract.js:166`, `systems/aftermathWrecks.js:992`, `systems/ai.js:120`, `systems/asteroidSites.js:569`, `systems/barkDirector.js:610`, `systems/barkDirector.js:611`, `systems/combatOutcome.js:158`, `systems/economy.js:1465`, `systems/encounterDirector.js:279`, `systems/factions.js:328`, `systems/factions.js:388`, `systems/impulseCharges.js:277`, `systems/killReplay.js:278`, `systems/lawSecurity.js:316`, `systems/lawSecurity.js:328`, `systems/lootShards.js:590`, `systems/lossLedger.js:430`, `systems/mining.js:257`, `systems/missions.js:1457`, `systems/missions.js:1593`, `systems/missions.js:1597`, `systems/npcJobsRuntime.js:1013`, `systems/onboarding.js:498`, `systems/onboarding.js:535`, `systems/presentationOrchestrator.js:176`, `systems/sectorSim.js:127`, `systems/surrenderRecovery.js:75`, `systems/survivalResults.js:484`, `systems/survivalWave.js:141`, `systems/survivorPod.js:547`, `systems/swarmChain.js:107`, `systems/swarmElites.js:136`, `systems/swarmJuice.js:100`, `systems/swarmSupply.js:101`, `systems/titles.js:583`, `systems/traffic.js:1614`, `systems/wingMorale.js:201`, `systems/world.js:633`, `ui/floatingText.js:240`, `ui/floatingText.js:283`, `ui/uiRoot.js:700`, `ui/uiRoot.js:708` |
| `entity:spawnRequest` | `data/scanReveal.js:527`, `systems/salvageActions.js:268`, `systems/salvageActions.js:514` | `core/coreSystem.js:305` |
| `entity:spawned` | `core/coreSystem.js:177` | `combat/kernel.js:171`, `render/asteroidMotionPresentation.js:492`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:220`, `render/shipMicroMotion.js:1291`, `render/vfx.js:2558`, `sim/titleAttract.js:167`, `systems/aiEncounter.js:134`, `systems/barkDirector.js:596`, `systems/barkDirector.js:597`, `systems/combatOutcome.js:163`, `systems/factionPresence.js:458`, `systems/fields.js:497`, `systems/flybyFocus.js:307`, `systems/lawSecurity.js:315`, `systems/lossLedger.js:429`, `systems/npcJobsRuntime.js:998`, `systems/salvageActions.js:131`, `systems/survivalSwarm.js:216`, `systems/swarmElites.js:135`, `systems/swarmSupply.js:106`, `systems/titles.js:584`, `systems/uniqueLootAbilities.js:149` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:385`, `systems/environmentalMachinery.js:1147` | `systems/terrainAnchors.js:89` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:732` | `systems/terrainAnchors.js:93` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:1041` | `systems/terrainAnchors.js:91` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:1238` | `data/hazardLanguage.js:142` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:744` | `systems/terrainAnchors.js:95` |
| `escalation:arrived` | `systems/encounterDirector.js:489` | — |
| `escalation:seeded` | `systems/encounterDirector.js:476` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:527`, `systems/factions.js:610`, `systems/factions.js:953` | `systems/heat.js:315` |
| `faction:bribe` | `ui/screens/footprint.js:1624` | `systems/factions.js:309` |
| `faction:repChanged` | `systems/factions.js:523`, `systems/factions.js:605`, `systems/factions.js:949` | `ui/floatingText.js:301`, `ui/station/screens/factions.js:409` |
| `faction:repDelta` | `balance/careerCohorts.js:270`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `systems/choirReliefBerth.js:379`, `systems/choirReliefBerth.js:413`, `systems/choirReliefBerth.js:434`, `systems/claims.js:1859`, `systems/economy.js:3559`, `systems/economy.js:3874`, `systems/encounterDirector.js:1893`, `systems/missions.js:8643`, `systems/missions.js:8724`, `systems/missions.js:11225`, `systems/missions.js:11227`, `systems/missions.js:11291`, `systems/moralTrap.js:311`, `systems/stuntGrammar.js:177`, `systems/survivorPod.js:1090`, `systems/survivorPod.js:1444`, `systems/uniqueWrecks.js:1764`, `systems/world.js:6380`, `systems/world.js:6614` | `systems/factions.js:296` |
| `faction:repSpillover` | `systems/factions.js:603` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | `systems/factions.js:301` |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1437` | `systems/barkDirector.js:632` |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:1120` | `systems/story.js:275` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1349` | `ui/uiRoot.js:303` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:967` | `systems/barkDirector.js:631` |
| `factionPresence:service` | `systems/factionPresence.js:1068` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1188` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:691`, `systems/factionPresence.js:786` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:829` | `systems/world.js:589` |
| `field:opportunity` | `systems/world.js:4688` | — |
| `field:regrown` | `systems/world.js:4617` | `systems/presentationOrchestrator.js:221` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:757`, `systems/traffic.js:2098`, `systems/traffic.js:11186` | `systems/presentationOrchestrator.js:222` |
| `field:richSeamOpened` | `systems/traffic.js:10239` | `systems/traffic.js:1607` |
| `field:richSeamWorked` | `systems/mining.js:1001`, `systems/traffic.js:9908` | `systems/traffic.js:1608` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:828` | `systems/npcJobsRuntime.js:1029`, `systems/presentationOrchestrator.js:220` |
| `fields:anchorRegistered` | `systems/fields.js:1053` | `render/forceLanguage/fieldForcePresentation.js:60` |
| `fields:cleared` | `systems/fields.js:1597` | `audio/fieldAudio.js:263`, `render/forceLanguage/fieldForcePresentation.js:61` |
| `fields:clusterDetonate` | `systems/fields.js:2213` | `systems/presentationOrchestrator.js:283` |
| `fields:coneToggled` | `systems/fields.js:1274`, `systems/fields.js:1280`, `systems/fields.js:1374`, `systems/fields.js:1382` | `systems/onboarding.js:526` |
| `fields:deployDenied` | `systems/fields.js:1148` | — |
| `fields:deployed` | `systems/fields.js:698`, `systems/fields.js:783`, `systems/fields.js:1234`, `systems/fields.js:1271`, `systems/fields.js:1365`, `systems/fields.js:1479` | `audio/audioSystem.js:2685`, `systems/fields.js:498`, `systems/onboarding.js:525` |
| `fields:ended` | `systems/fields.js:1072`, `systems/fields.js:1381`, `systems/fields.js:1402`, `systems/fields.js:1552` | `audio/fieldAudio.js:260` |
| `fields:hitchCut` | `systems/fields.js:729` | — |
| `fields:hitchLatched` | `systems/fields.js:717` | — |
| `fields:specialistDisrupt` | `systems/fields.js:607` | `audio/fieldAudio.js:264` |
| `fields:thermalCreated` | `systems/fields.js:1635` | — |
| `fields:thermalHit` | `core/fields/thermalFields.js:35` | — |
| `firsthour:beat` | `systems/onboarding.js:3220` | — |
| `firsthour:complete` | `systems/onboarding.js:3233` | — |
| `firsthour:milestone` | `systems/onboarding.js:1215` | `audio/audioSystem.js:2678` |
| `firsthour:sentence` | `systems/onboarding.js:1941` | — |
| `firsthour:started` | `systems/onboarding.js:2969` | — |
| `firsthour:verb` | `systems/onboarding.js:3157` | — |
| `flight:modeChanged` | `systems/flightV3.js:905` | — |
| `flight:sweptHull` | `systems/flightV3.js:811` | — |
| `flybyFocus:cancel` | `systems/flybyFocus.js:367` | `render/cameraDirector.js:1276` |
| `flybyFocus:end` | `systems/flybyFocus.js:368` | `render/cameraDirector.js:1275` |
| `flybyFocus:start` | `systems/flybyFocus.js:501` | `systems/onboarding.js:481` |
| `formation:discovered` | `systems/asteroidFormations.js:290` | — |
| `freight:arrival` | `systems/traffic.js:7938` | `render/authoredMotion.js:1021` |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1716`, `systems/encounterScripts.js:1958`, `systems/traffic.js:5936` | `systems/barkDirector.js:607`, `systems/economy.js:1420`, `systems/encounterDirector.js:312`, `systems/lootShards.js:593`, `systems/sectorSim.js:134`, `systems/traffic.js:1632` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1549` | `render/authoredMotion.js:1020` |
| `freight:custodyRebound` | `systems/encounterDirector.js:655` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1606`, `systems/encounterScripts.js:1628` | — |
| `freight:loss` | `systems/encounterDirector.js:1955`, `systems/traffic.js:9545`, `systems/traffic.js:11279` | `systems/claims.js:406`, `systems/encounterDirector.js:313`, `systems/sectorSim.js:133` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1550` | `systems/surrenderRecovery.js:76` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:2093` | `systems/barkDirector.js:608` |
| `freight:recovery` | — | `systems/encounterDirector.js:285`, `systems/traffic.js:1629` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:286`, `systems/traffic.js:1630` |
| `frontierRumor:acquired` | `systems/world.js:4298` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:6845` | — |
| `frontierRumor:contacted` | `systems/world.js:6741` | — |
| `frontierRumor:resolved` | `systems/world.js:4315` | — |
| `fuel:changed` | `systems/economy.js:3307`, `systems/economy.js:3396`, `systems/economy.js:3414`, `systems/stationServices.js:459`, `systems/stationServices.js:527`, `systems/world.js:5965`, `systems/world.js:5973` | — |
| `fuel:empty` | `systems/world.js:5966` | `audio/audioSystem.js:2516`, `systems/economy.js:1498`, `ui/alerts.js:552` |
| `game:embarkSpeculation` | `ui/sandbox/sandboxSetup.js:384`, `ui/screens/gameOver.js:518`, `ui/screens/newGame.js:906` | — |
| `game:exitToMenu` | `ui/screens/crucible.js:3399`, `ui/screens/crucible.js:3412`, `ui/screens/demoEnd.js:216`, `ui/screens/pause.js:1087` | `audio/audioSystem.js:2792`, `main.js:348`, `save/saveSystem.js:427`, `systems/runSession.js:77`, `ui/screens/crucibleLabControls.js:558` |
| `game:load` | `ui/input.js:345`, `ui/input.js:529`, `ui/screens/gameOver.js:507`, `ui/screens/mainMenu.js:534`, `ui/screens/saveLoad.js:1294` | `save/saveSystem.js:303`, `systems/scanner.js:1013`, `ui/commandBar.js:430`, `ui/promptDeck.js:852` |
| `game:loadingProgress` | `main.js:148`, `main.js:173`, `main.js:222`, `main.js:254`, `main.js:387`, `main.js:823`, `main.js:915`, `main.js:969`, `main.js:995`, `main.js:1028`, `main.js:1048`, `main.js:1127`, `main.js:1268`, `save/saveSystem.js:4667` | `ui/loadingPresenter.js:184`, `ui/screens/newGame.js:866`, `ui/screens/saveLoad.js:868` |
| `game:new` | `main.js:531`, `ui/sandbox/sandboxSetup.js:398`, `ui/screens/crucible.js:3403`, `ui/screens/gameOver.js:533`, `ui/screens/newGame.js:980` | `audio/audioSystem.js:2787`, `audio/bombAudio.js:458`, `audio/fieldAudio.js:267`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:319`, `main.js:326`, `render/feel.js:1199`, `render/vfx.js:2568`, `render/vfx.js:2579`, `save/saveSystem.js:386`, `systems/aftermathWrecks.js:1022`, `systems/aiEncounter.js:139`, `systems/bombs.js:628`, `systems/cloak.js:83`, `systems/combatOutcome.js:168`, `systems/countermeasures.js:221`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:84`, `systems/encounterDirector.js:276`, `systems/environmentalMachinery.js:220`, `systems/fields.js:491`, `systems/impulseCharges.js:282`, `systems/killReplay.js:268`, `systems/massSeed.js:120`, `systems/masslineSnares.js:137`, `systems/mines.js:77`, `systems/mining.js:280`, `systems/planetRuntime.js:102`, `systems/presentationOrchestrator.js:285`, `systems/salvageActions.js:138`, `systems/scanner.js:1012`, `systems/scissorwake.js:73`, `systems/surrenderRecovery.js:82`, `systems/survivorPod.js:545`, `systems/tetherGameplay.js:295`, `systems/tumbleStates.js:124`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/moralTrapPrompt.js:44`, `ui/priceHistory.js:146`, `ui/promptDeck.js:851`, `ui/screens/crucibleLabControls.js:552`, `ui/wreckChoicePrompt.js:56` |
| `game:newGame` | `main.js:623` | `audio/audioSystem.js:2788`, `audio/bombAudio.js:459`, `audio/fieldAudio.js:268`, `core/coreSystem.js:320`, `render/npcJobSignatureVfx.js:903`, `render/shipMicroMotion.js:1294`, `render/vfx.js:2569`, `render/vfx.js:2580`, `save/saveSystem.js:390`, `systems/aftermathWrecks.js:1023`, `systems/bombs.js:631`, `systems/cloak.js:84`, `systems/collisionConsequences.js:100`, `systems/combatOutcome.js:174`, `systems/countermeasures.js:222`, `systems/difficultyDirector.js:169`, `systems/fieldDepletion.js:745`, `systems/fragileCargo.js:285`, `systems/lossInvestigation.js:128`, `systems/lossLedger.js:433`, `systems/salvageActions.js:139`, `systems/survivorPod.js:544`, `systems/titles.js:586`, `systems/tumbleStates.js:125`, `systems/wingMorale.js:203`, `ui/cargoConscience.js:147`, `ui/uiRoot.js:609` |
| `game:over` | `systems/combat.js:846`, `systems/combat.js:977` | `ui/uiRoot.js:1399` |
| `game:save` | `ui/input.js:344`, `ui/input.js:527`, `ui/screens/saveLoad.js:1314` | `save/saveSystem.js:292` |
| `game:scenePrepared` | `main.js:688` | `systems/onboarding.js:417`, `ui/sandbox/sandboxSetup.js:437` |
| `game:startFailed` | `main.js:1221` | `ui/loadingPresenter.js:193`, `ui/sandbox/sandboxSetup.js:440`, `ui/screens/crucibleLabControls.js:554`, `ui/screens/newGame.js:865`, `ui/screens/saveLoad.js:874` |
| `game:started` | `main.js:832` | `audio/audioSystem.js:2793`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:321`, `save/saveSystem.js:383`, `save/saveSystem.js:397`, `sim/killcamTape.js:431`, `systems/automation.js:569`, `systems/collisionConsequences.js:99`, `systems/combat.js:730`, `systems/economyContracts.js:182`, `systems/factions.js:293`, `systems/flight.js:83`, `systems/flightV3.js:186`, `systems/heat.js:322`, `systems/masslineSnares.js:138`, `systems/missions.js:1366`, `systems/onboarding.js:440`, `systems/presentationAdapters.js:210`, `systems/presentationOrchestrator.js:286`, `systems/sectorSim.js:118`, `systems/ships.js:1734`, `systems/story.js:152`, `systems/surrenderRecovery.js:83`, `systems/survivalDraft.js:187`, `systems/tetherGameplay.js:296`, `systems/wingmen.js:146`, `ui/alerts.js:456`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:432`, `ui/screens/crucibleLabControls.js:553`, `ui/uiRoot.js:1384`, `ui/uiRoot.js:1425`, `ui/uiRoot.js:1427` |
| `gamepad:connected` | `systems/gamepad.js:986` | — |
| `gamepad:disconnected` | `systems/gamepad.js:970` | — |
| `gate:range` | `core/physics.js:1318`, `core/physics.js:1322` | `render/authoredMotion.js:1048`, `systems/onboarding.js:573`, `systems/presentationOrchestrator.js:181`, `ui/alerts.js:437` |
| `gate:verdict` | `systems/gateControlDirector.js:135` | `render/infrastructureMotion.js:197` |
| `graffiti:show` | `data/encounters/366-the-counting-relay.js:102`, `data/encounters/366-the-counting-relay.js:112`, `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:573`, `systems/story.js:640`, `systems/story.js:654`, `systems/story.js:688`, `systems/story.js:1486`, `systems/story.js:1887`, `systems/story.js:2094`, `systems/uniqueWrecks.js:1770` | `systems/ships.js:1729`, `ui/screens/codex.js:847` |
| `gyre:absorbTick` | — | `systems/gamepad.js:849` |
| `gyre:ballGrave` | — | `systems/gamepad.js:848` |
| `gyre:beamOn` | — | `systems/gamepad.js:842` |
| `gyre:dropped` | — | `systems/gamepad.js:858` |
| `gyre:full` | — | `systems/gamepad.js:846` |
| `gyre:fuseLow` | — | `systems/gamepad.js:847` |
| `gyre:snagged` | — | `systems/gamepad.js:843` |
| `gyre:strained` | — | `systems/gamepad.js:871` |
| `gyre:thrown` | — | `systems/gamepad.js:845` |
| `gyre:windup` | — | `systems/gamepad.js:844` |
| `harasser:disengaged` | `systems/encounterDirector.js:2295` | `systems/barkDirector.js:620`, `systems/barkDirector.js:659` |
| `hazard:changed` | `systems/world.js:875`, `systems/world.js:5838` | `ui/alerts.js:556` |
| `hazard:enter` | `systems/environmentalMachinery.js:1181`, `systems/world.js:5813` | `data/hazardLanguage.js:138`, `render/shipMicroMotion.js:1299`, `ui/alerts.js:499` |
| `hazard:exit` | `systems/environmentalMachinery.js:1190`, `systems/world.js:5823` | `data/hazardLanguage.js:139`, `render/shipMicroMotion.js:1300`, `ui/alerts.js:510` |
| `heat:changed` | `systems/heat.js:700` | `audio/audioSystem.js:2519`, `render/vfx.js:2576`, `systems/barkDirector.js:633`, `systems/lawSecurity.js:334`, `systems/onboarding.js:538`, `systems/titles.js:593`, `ui/hud.js:4284` |
| `heat:clear` | — | `systems/heat.js:326` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:1057` | `systems/missions.js:1511` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1514` | — |
| `heist:captureFork` | `systems/heistFacilities.js:2053` | `systems/missions.js:1520` |
| `heist:counterweight` | `systems/heistFacilities.js:3194` | `systems/missions.js:1531` |
| `heist:counterweightSceneReceipt` | `systems/heistFacilities.js:3517`, `systems/heistFacilities.js:3525`, `systems/heistFacilities.js:3530`, `systems/heistFacilities.js:3552` | — |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1940` | `systems/missions.js:1516` |
| `heist:launchCue` | `systems/heistFacilities.js:451`, `systems/heistFacilities.js:3889` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:591`, `systems/heistFacilities.js:600`, `systems/heistFacilities.js:604`, `systems/heistFacilities.js:618` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:2502` | — |
| `heist:monitorScan` | `systems/heistFacilities.js:3846` | `systems/missions.js:1524` |
| `heist:observed` | `systems/heistFacilities.js:2713` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:2444` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:2425` | `systems/npcJobsRuntime.js:1046` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:2363` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:326` |
| `heist:routineReceipt` | `systems/heistFacilities.js:1803` | — |
| `heist:shipmentUnit` | `systems/heistFacilities.js:1918` | `systems/missions.js:1527` |
| `hud:firstUse` | `systems/onboarding.js:882`, `systems/tetherGameplay.js:1960`, `systems/tetherGameplay.js:2031` | `ui/hud.js:2389` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:413` |
| `hud:phase` | `systems/story.js:335`, `systems/story.js:365`, `systems/story.js:368`, `systems/story.js:729` | `ui/hudMeta.js:167` |
| `hud:recallObjective` | `ui/input.js:363` | `ui/hud.js:1888` |
| `hud:slotClaim` | `ui/promptDeck.js:243` | `ui/hud.js:2267` |
| `hud:slotRelease` | `ui/promptDeck.js:244` | `ui/hud.js:2268` |
| `hud:tagFlicker` | `systems/story.js:706` | `ui/hudMeta.js:201` |
| `hull:fractured` | `systems/hullFracture.js:334` | `render/authoredMotion.js:991` |
| `hullBurst:activated` | `systems/hullBurst.js:211` | — |
| `hullBurst:ended` | `systems/hullBurst.js:232` | — |
| `hullBurst:hit` | `systems/hullBurst.js:350`, `systems/hullBurst.js:374`, `systems/hullBurst.js:556` | `render/authoredMotion.js:989` |
| `hullBurst:released` | `systems/hullBurst.js:488` | — |
| `ilexArk:accepted` | `systems/ilexArk.js:161` | — |
| `ilexArk:finished` | `systems/ilexArk.js:193` | — |
| `ilexArk:harvested` | `systems/economy.js:2997` | — |
| `ilexArk:offer` | `systems/ilexArk.js:225` | `ui/ilexArkPrompt.js:4` |
| `ilexArk:vaultDelivered` | `systems/ilexArk.js:179` | — |
| `ilexArk:vaultReleased` | `systems/ilexArk.js:111` | — |
| `industry:haulRequested` | `systems/environmentalMachinery.js:773` | `systems/traffic.js:1737` |
| `input:worldGestureCancelled` | `systems/input.js:1108`, `ui/worldObjectInteraction.js:196` | `systems/masslineThrow.js:129` |
| `interdiction:triggered` | `systems/encounterScripts.js:593`, `systems/world.js:5250` | `render/authoredMotion.js:1003`, `systems/presentationOrchestrator.js:189`, `systems/sectorSim.js:124` |
| `intervention:available` | `systems/intervention.js:260` | — |
| `intervention:closed` | `systems/intervention.js:313` | — |
| `intervention:jumperRipped` | `systems/intervention.js:432` | — |
| `intervention:logged` | `systems/intervention.js:135` | — |
| `jump:arrive` | `systems/world.js:5191` | `render/authoredMotion.js:1051`, `render/feel.js:1349`, `render/shipMicroMotion.js:1304`, `save/saveSystem.js:404`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:187`, `systems/sectorSim.js:139` |
| `jump:chargeAbort` | `systems/world.js:5330`, `systems/world.js:5410`, `systems/world.js:5475` | `audio/audioSystem.js:2498`, `render/authoredMotion.js:1052`, `render/shipMicroMotion.js:1305`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:186`, `systems/routeFollower.js:375`, `ui/galaxyMap.js:2597`, `ui/toasts.js:572` |
| `jump:chargeStart` | `systems/world.js:5392`, `systems/world.js:5436` | `render/authoredMotion.js:1049`, `render/feel.js:1339`, `render/shipMicroMotion.js:1301`, `systems/gateControlDirector.js:65`, `systems/missions.js:1385`, `systems/presentationOrchestrator.js:183`, `systems/story.js:217`, `ui/galaxyMap.js:2596` |
| `jump:chargeTick` | `systems/world.js:5134` | `render/authoredMotion.js:1043`, `render/shipMicroMotion.js:1302`, `systems/presentationOrchestrator.js:184` |
| `jump:departurePreflight` | `systems/world.js:5374` | `systems/story.js:216` |
| `jump:start` | `systems/world.js:5151` | `audio/audioSystem.js:2497`, `render/authoredMotion.js:1050`, `render/feel.js:1343`, `render/shipMicroMotion.js:1303`, `systems/economy.js:1503`, `systems/gateControlDirector.js:66`, `systems/mining.js:265`, `systems/presentationOrchestrator.js:185`, `systems/sectorSim.js:138` |
| `jump:unfiledConfirmed` | `systems/world.js:5456` | `systems/story.js:218` |
| `kilnback:caskReleased` | `systems/kilnback.js:134` | — |
| `kilnback:caskSalvaged` | `systems/kilnback.js:195` | — |
| `kilnback:coolantReleased` | `systems/kilnback.js:183` | — |
| `kilnback:phase` | `systems/kilnback.js:223` | — |
| `landmark:artifactRecovered` | `systems/missions.js:5532` | `systems/world.js:621` |
| `lastShift:archive` | `ui/lastShiftPrompt.js:24` | — |
| `lastShift:archived` | `systems/lastShift.js:194` | — |
| `lastShift:offer` | `systems/lastShift.js:175` | `ui/lastShiftPrompt.js:8` |
| `lastShift:recorderReturned` | `systems/lastShift.js:233` | — |
| `lastShift:returnRecorder` | `ui/lastShiftPrompt.js:25` | — |
| `law:audit` | — | `systems/lawSecurity.js:339` |
| `law:custodyAcknowledged` | — | `systems/barkDirector.js:622` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:42` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:612` |
| `law:distressRaised` | — | `systems/barkDirector.js:630` |
| `law:fineAssessed` | — | `systems/barkDirector.js:625`, `ui/impoundPayPrompt.js:53` |
| `law:fineChoice` | `ui/impoundPayPrompt.js:215` | `systems/lawSecurity.js:337` |
| `law:fineRefused` | — | `ui/impoundPayPrompt.js:54` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:92` | `systems/lawSecurity.js:335` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:47` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:48` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:44` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:46`, `systems/heat.js:336`, `ui/impoundPayPrompt.js:49` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:50` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:45` |
| `law:incidentOpened` | — | `systems/traffic.js:1639` |
| `law:incidentResolved` | — | `systems/barkDirector.js:628` |
| `law:killedAdjudicated` | — | `systems/factions.js:318` |
| `law:playerSurrender` | — | `systems/lawSecurity.js:338` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:618`, `systems/factions.js:401`, `systems/heat.js:347` |
| `law:responseDeferred` | — | `systems/barkDirector.js:627` |
| `law:sanctuaryWithdrawal` | — | `systems/barkDirector.js:626` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:332` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:614` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:613` |
| `law:wantedWarrantReleased` | — | `systems/barkDirector.js:629` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:311` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `render/authoredMotion.js:1014`, `systems/lawSecurity.js:323` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:939`, `systems/lootShards.js:1088`, `systems/stuntGrammar.js:187` | `systems/mining.js:259`, `ui/floatingText.js:267`, `ui/floatingText.js:274` |
| `loot:magnetCaptured` | `systems/lootShards.js:669` | `audio/audioSystem.js:2420` |
| `loot:manifestPayload` | `systems/lootShards.js:1197` | `systems/missions.js:1602` |
| `loot:overflowConverted` | `systems/mining.js:2508` | `audio/audioSystem.js:2419`, `ui/floatingText.js:269` |
| `lossInvestigation:closed` | `systems/lossInvestigation.js:322` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:185` | `systems/lossInvestigation.js:126` |
| `lossLedger:recorded` | `systems/lossLedger.js:391` | `systems/factionPresence.js:450`, `systems/ships.js:1683` |
| `machine:tokenDelivered` | `systems/precursorMachines.js:773`, `systems/precursorMachines.js:825` | — |
| `map:sectorCharted` | `systems/world.js:4239` | `systems/economy.js:1439` |
| `massSeed:cleared` | `systems/massSeed.js:603` | — |
| `massSeed:collapsed` | `systems/massSeed.js:426`, `systems/massSeed.js:476`, `systems/massSeed.js:556`, `systems/massSeed.js:586` | `render/authoredMotion.js:1042` |
| `massSeed:collapsing` | `systems/massSeed.js:425`, `systems/massSeed.js:447`, `systems/massSeed.js:542`, `systems/massSeed.js:584` | `audio/audioSystem.js:2662` |
| `massSeed:deployDenied` | `systems/massSeed.js:155` | — |
| `massSeed:deployed` | `systems/massSeed.js:255` | `audio/audioSystem.js:2650`, `render/authoredMotion.js:1039`, `systems/onboarding.js:761` |
| `massSeed:destroyed` | `systems/massSeed.js:583` | — |
| `massSeed:locked` | `systems/massSeed.js:312` | `audio/audioSystem.js:2656`, `render/authoredMotion.js:1040` |
| `massSeed:locking` | `systems/massSeed.js:377` | `audio/audioSystem.js:2653` |
| `massSeed:tetherCut` | `systems/massSeed.js:504` | `audio/audioSystem.js:2666`, `render/authoredMotion.js:1041` |
| `massSeed:warning` | `systems/massSeed.js:339` | `audio/audioSystem.js:2659` |
| `massline:bridleCut` | `systems/tetherGameplay.js:936` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:881`, `systems/tetherGameplay.js:897`, `systems/tetherGameplay.js:1108` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:739` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:793` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:946` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2525` | — |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:2713` | `systems/barkDirector.js:648` |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1745` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:1868` | `systems/gamepad.js:840` |
| `massline:recovered` | `systems/tumbleStates.js:237` | — |
| `massline:recovering` | `systems/tumbleStates.js:561` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:186` | `audio/audioSystem.js:2409` |
| `massline:releaseValidated` | `systems/masslineThrow.js:629` | `systems/presentationOrchestrator.js:164` |
| `massline:releaseWindow` | `systems/masslineThrow.js:247` | — |
| `massline:rideStarted` | `systems/tetherGameplay.js:2004` | — |
| `massline:selfSling` | `systems/masslineThrow.js:658` | `systems/flightV3.js:188`, `systems/onboarding.js:725`, `ui/stuntCallout.js:554` |
| `massline:snareArmed` | `systems/masslineSnares.js:239` | `audio/audioSystem.js:2648`, `render/authoredMotion.js:980` |
| `massline:snareCaught` | `systems/masslineSnares.js:434` | `systems/gamepad.js:831` |
| `massline:snareCut` | `systems/masslineSnares.js:727` | `audio/audioSystem.js:2649` |
| `massline:snareDeployed` | `systems/masslineSnares.js:341`, `systems/masslineSnares.js:686` | `render/authoredMotion.js:974` |
| `massline:snareEnded` | `systems/masslineSnares.js:729` | `render/authoredMotion.js:978` |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `render/vfx.js:2564`, `systems/masslineImpactDamage.js:48`, `systems/presentationOrchestrator.js:151` |
| `massline:threat` | `systems/masslineThreats.js:273` | `systems/presentationOrchestrator.js:127` |
| `massline:throw` | `systems/masslineThrow.js:571` | `systems/lootShards.js:592`, `systems/mines.js:74`, `systems/missions.js:1499`, `systems/tumbleStates.js:112` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:560` | `render/feel.js:1434` |
| `massline:tumbled` | `systems/tumbleStates.js:473` | `render/feel.js:1420` |
| `mines:armed` | `systems/mines.js:185`, `systems/mines.js:218` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:93` | `audio/audioSystem.js:2451` |
| `mines:detonated` | `systems/mines.js:288` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:152`, `systems/survivalArena.js:1268`, `systems/swarmEvents.js:208` | `systems/mines.js:73` |
| `mines:placed` | `systems/mines.js:158` | `systems/survivalArena.js:1010` |
| `mines:released` | `systems/mines.js:323` | — |
| `mines:triggered` | `systems/mines.js:278` | — |
| `mining:beamLocked` | `systems/mining.js:909` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2346` | `systems/missions.js:1455`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:923` | `systems/presentationOrchestrator.js:216`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:728` | `ui/miningHud.js:206` |
| `mining:npcExtraction` | `systems/traffic.js:9896` | `systems/fieldDepletion.js:744` |
| `mining:podSplit` | `systems/mining.js:1760` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2291` | `render/asteroidMotionPresentation.js:494`, `systems/presentationOrchestrator.js:213`, `ui/miningHud.js:209` |
| `mining:richCoreCompleted` | `systems/mining.js:2324` | `render/asteroidMotionPresentation.js:495`, `systems/presentationOrchestrator.js:214`, `ui/miningHud.js:210` |
| `mining:richCoreExposed` | `systems/mining.js:2269` | `render/asteroidMotionPresentation.js:493`, `systems/presentationOrchestrator.js:212`, `ui/miningHud.js:208` |
| `mining:richCoreFizzle` | `systems/mining.js:2328` | `render/asteroidMotionPresentation.js:496`, `systems/presentationOrchestrator.js:215`, `ui/miningHud.js:211` |
| `mining:seamHit` | `systems/mining.js:2645` | `systems/presentationOrchestrator.js:205` |
| `mining:start` | `systems/mining.js:423`, `systems/mining.js:550`, `systems/mining.js:1709` | `audio/audioSystem.js:2403`, `render/asteroidMotionPresentation.js:488`, `render/authoredMotion.js:969`, `render/authoredMotion.js:996`, `render/vfx.js:2589`, `systems/missions.js:1588`, `systems/onboarding.js:466`, `systems/presentationOrchestrator.js:202`, `ui/miningHud.js:204`, `ui/worldObjectInteraction.js:417` |
| `mining:stop` | `systems/mining.js:673` | `audio/audioSystem.js:2404`, `render/asteroidMotionPresentation.js:489`, `render/authoredMotion.js:971`, `render/authoredMotion.js:997`, `render/vfx.js:2590`, `systems/presentationOrchestrator.js:203`, `ui/miningHud.js:205` |
| `mining:tick` | `systems/automation.js:1067`, `systems/mining.js:944` | `audio/audioSystem.js:2405`, `render/vfx.js:2591`, `systems/presentationOrchestrator.js:204`, `ui/miningHud.js:207` |
| `mining:ventBonus` | `systems/mining.js:772` | — |
| `mining:ventReady` | `systems/mining.js:709` | `systems/presentationOrchestrator.js:209` |
| `mining:yield` | `balance/careerCohorts.js:2197`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:767`, `systems/mining.js:1141`, `systems/mining.js:1211`, `systems/mining.js:1840`, `systems/mining.js:2321` | `careers/origins/prospectorOrigin.js:636`, `render/authoredMotion.js:970`, `render/vfx.js:2594`, `systems/encounterDirector.js:309`, `systems/missions.js:1438`, `systems/onboarding.js:467`, `systems/presentationOrchestrator.js:210`, `ui/floatingText.js:251` |
| `mission:abandon` | `systems/moralTrap.js:301` | `systems/missions.js:1379` |
| `mission:abandoned` | — | `systems/contractClauses.js:255` |
| `mission:accepted` | `systems/missions.js:3732` | `audio/audioSystem.js:2466`, `save/saveSystem.js:405`, `systems/aftermathWrecks.js:1018`, `systems/contractClauses.js:250`, `systems/contractClauses.js:251`, `systems/economy.js:1414`, `systems/moralTrap.js:182`, `systems/onboarding.js:469`, `ui/hud.js:4264`, `ui/screens/missionLog.js:2488`, `ui/wreckChoicePrompt.js:45` |
| `mission:completed` | `systems/missions.js:8115`, `systems/missions.js:8135`, `systems/missions.js:8298` | `audio/audioSystem.js:2467`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:406`, `systems/aftermathWrecks.js:1019`, `systems/claims.js:388`, `systems/contractClauses.js:252`, `systems/contractClauses.js:259`, `systems/factions.js:435`, `systems/lossLedger.js:432`, `systems/onboarding.js:470`, `systems/story.js:239`, `ui/hud.js:1884`, `ui/hud.js:4265`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2489` |
| `mission:conditionBroken` | `systems/contractClauses.js:466`, `systems/missions.js:1809` | `ui/hud.js:1875` |
| `mission:conditionPending` | `systems/missions.js:1862` | `ui/hud.js:1872` |
| `mission:conditionProgress` | `systems/contractClauses.js:434`, `systems/missions.js:1792` | `ui/hud.js:1873` |
| `mission:conditionSatisfied` | `systems/contractClauses.js:445`, `systems/missions.js:1800` | `systems/missions.js:1562`, `ui/hud.js:1874` |
| `mission:expired` | `systems/missions.js:8738` | `audio/audioSystem.js:2471`, `save/saveSystem.js:408`, `systems/aftermathWrecks.js:1021`, `systems/contractClauses.js:254`, `systems/contractClauses.js:264`, `systems/factions.js:444`, `ui/screens/missionLog.js:2491` |
| `mission:failed` | `systems/missions.js:8674` | `audio/audioSystem.js:2470`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:407`, `systems/aftermathWrecks.js:1020`, `systems/contractClauses.js:253`, `systems/factions.js:443`, `systems/story.js:240`, `ui/hud.js:1880`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2490` |
| `mission:forceEvent` | — | `systems/economy.js:1511` |
| `mission:gateCleared` | `systems/missions.js:7546` | — |
| `mission:offerBoarded` | `systems/missions.js:2773` | `systems/aftermathWrecks.js:1017`, `systems/economyContracts.js:177` |
| `mission:offered` | `systems/aftermathWrecks.js:1909`, `systems/alienEcology.js:377`, `systems/careerContracts.js:318`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:271`, `systems/lossInvestigation.js:275`, `systems/lossLedger.js:367`, `systems/postEndingReplay.js:340`, `systems/salvage.js:1141`, `systems/uniqueWrecks.js:1020` | `systems/economy.js:1413`, `systems/lossInvestigation.js:125`, `systems/missions.js:1384`, `systems/survivorPod.js:542` |
| `mission:setPieceTransition` | `systems/missions.js:8074` | `systems/lossInvestigation.js:127` |
| `mission:setPieceTravelLine` | `systems/missions.js:10812` | — |
| `mission:spawnDeferred` | `systems/missions.js:9475` | — |
| `mission:targetsProjected` | `systems/missions.js:8841` | — |
| `mission:updated` | `systems/contractClauses.js:439`, `systems/contractClauses.js:449`, `systems/contractClauses.js:478`, `systems/missions.js:1428`, `systems/missions.js:1796`, `systems/missions.js:1804`, `systems/missions.js:1822`, `systems/missions.js:1901`, `systems/missions.js:2041`, `systems/missions.js:2184`, `systems/missions.js:2300`, `systems/missions.js:2576`, `systems/missions.js:2610`, `systems/missions.js:2622`, `systems/missions.js:2772`, `systems/missions.js:3636`, `systems/missions.js:3651`, `systems/missions.js:3745`, `systems/missions.js:4025`, `systems/missions.js:4274`, `systems/missions.js:5019`, `systems/missions.js:5058`, `systems/missions.js:5071`, `systems/missions.js:5086`, `systems/missions.js:5102`, `systems/missions.js:5148`, `systems/missions.js:5216`, `systems/missions.js:5369`, `systems/missions.js:5378`, `systems/missions.js:5606`, `systems/missions.js:5632`, `systems/missions.js:5703`, `systems/missions.js:5719`, `systems/missions.js:5763`, `systems/missions.js:5784`, `systems/missions.js:5814`, `systems/missions.js:5837`, `systems/missions.js:5948`, `systems/missions.js:6128`, `systems/missions.js:7170`, `systems/missions.js:7352`, `systems/missions.js:7491`, `systems/missions.js:7552`, `systems/missions.js:7589`, `systems/missions.js:7679`, `systems/missions.js:7686`, `systems/missions.js:8287`, `systems/missions.js:8709`, `systems/missions.js:8754`, `systems/missions.js:9147`, `systems/missions.js:9440`, `systems/missions.js:9466`, `systems/missions.js:9633`, `systems/missions.js:9738`, `systems/missions.js:9820`, `systems/missions.js:9890`, `systems/missions.js:10094`, `systems/missions.js:10127`, `systems/missions.js:10142`, `systems/missions.js:10156`, `systems/missions.js:10341`, `systems/missions.js:10483`, `systems/missions.js:10531`, `systems/missions.js:10617`, `systems/missions.js:11036`, `systems/missions.js:11320`, `systems/missions.js:11466` | `ui/hud.js:4263`, `ui/screens/missionLog.js:2487`, `ui/station/screens/contracts.js:1460` |
| `mode:changed` | `main.js:351`, `main.js:1198`, `main.js:1208`, `main.js:1219`, `save/saveSystem.js:4411`, `save/saveSystem.js:4437`, `save/saveSystem.js:4884`, `save/saveSystem.js:5163` | `systems/autoTargetAssist.js:130`, `systems/presentationAdapters.js:209`, `systems/scanner.js:1015`, `ui/loadingPresenter.js:185`, `ui/screenManager.js:674`, `ui/screens/mainMenu.js:874`, `ui/uiRoot.js:926`, `ui/wingmanRadial.js:331` |
| `module:equipped` | `systems/ships.js:2474` | `systems/onboarding.js:506`, `systems/onboarding.js:511`, `systems/onboarding.js:777`, `systems/ships.js:1614`, `systems/survivalDraft.js:181`, `systems/world.js:586` |
| `module:fitRefused` | `systems/ships.js:2087`, `systems/ships.js:2421`, `systems/ships.js:2485` | `ui/station/screens/shipworks.js:4113` |
| `module:granted` | `systems/ships.js:2163` | — |
| `module:purchased` | `systems/ships.js:2145` | — |
| `module:unequipped` | `systems/ships.js:1790`, `systems/ships.js:2512` | `systems/ships.js:1615`, `systems/survivalDraft.js:182`, `systems/world.js:587` |
| `moment:amended` | `systems/bulletTime.js:260` | `ui/screens/clips.js:85` |
| `moment:holyShit` | — | `render/feel.js:1409` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:296` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | `systems/encounterDirector.js:298` |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:181` |
| `moralTrap:resolved` | `systems/moralTrap.js:297` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:245` | `ui/moralTrapPrompt.js:37` |
| `morrow:launch` | `systems/morrow.js:252` | — |
| `morrow:met` | `systems/morrow.js:191` | — |
| `morrow:voice` | `systems/morrow.js:165` | — |
| `mothlight:identified` | `systems/mothlight.js:192` | `ui/mothlightPrompt.js:6` |
| `mothlight:lampReleased` | `systems/mothlight.js:112` | — |
| `mothlight:phase` | `systems/mothlight.js:152` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:3238` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:315` |
| `nav:abortRoute` | — | `systems/routeFollower.js:367` |
| `nav:autopilot` | `systems/flight.js:408`, `systems/flightV3.js:1451`, `systems/world.js:5550` | `systems/routeFollower.js:370` |
| `nav:engageRoute` | `systems/routeFollower.js:365` | `systems/routeFollower.js:360` |
| `nav:routeBrake` | — | `audio/audioSystem.js:2550` |
| `nav:waypoint` | `save/saveSystem.js:5734`, `systems/claims.js:1907`, `systems/claims.js:1915`, `systems/missions.js:1399`, `systems/missions.js:4263`, `systems/missions.js:4339`, `systems/missions.js:4371`, `systems/missions.js:5037`, `systems/missions.js:5896`, `systems/world.js:5549`, `ui/market/tradeLogic.js:485` | `render/authoredMotion.js:999` |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:135` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:205` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:131` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `news:headline` | `systems/aftermathWrecks.js:819`, `systems/e1EncounterRuntime.js:225`, `systems/lastShift.js:189`, `systems/nemesisSignals.js:25`, `systems/presentationOrchestrator.js:1277`, `systems/traffic.js:9546`, `systems/traffic.js:11281`, `ui/marketNews.js:275` | — |
| `news:publish` | `data/encounters/362-the-salvage-watch.js:171`, `data/encounters/362-the-salvage-watch.js:186`, `data/encounters/362-the-salvage-watch.js:280`, `data/encounters/365-the-grandee.js:102`, `data/encounters/365-the-grandee.js:121`, `data/encounters/365-the-grandee.js:169`, `data/encounters/367-the-salvage-tail.js:165`, `data/encounters/367-the-salvage-tail.js:185`, `systems/aftermathWrecks.js:837`, `systems/choirReliefBerth.js:321`, `systems/choirReliefBerth.js:361`, `systems/claims.js:2380`, `systems/claims.js:2584`, `systems/claims.js:3095`, `systems/claims.js:3142`, `systems/eighthBellRuntime.js:122`, `systems/factions.js:536`, `systems/memorialThief.js:135`, `systems/npcJobsRuntime.js:1293`, `systems/presentationOrchestrator.js:1284`, `systems/traffic.js:4179`, `systems/traffic.js:10892`, `systems/uniqueWrecks.js:576`, `systems/uniqueWrecks.js:1814`, `systems/world.js:884`, `ui/watchlistHud.js:77` | — |
| `news:render` | `ui/hud.js:1772` | — |
| `npc:hailed` | `systems/barkDirector.js:1542`, `systems/barkDirector.js:1592` | `render/authoredMotion.js:1034` |
| `npcJobs:towAssistComplete` | `systems/npcJobsRuntime.js:3371` | — |
| `npcJobs:towAssistLost` | `systems/npcJobsRuntime.js:2956`, `systems/npcJobsRuntime.js:3434`, `systems/npcJobsRuntime.js:3471` | `systems/missions.js:1599` |
| `npcjobs:closeCall` | `systems/npcJobsRuntime.js:4887` | — |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:5578` | — |
| `npcjobs:distress` | `systems/npcJobsRuntime.js:5703` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1623` |
| `npcjobs:load` | — | `systems/traffic.js:1621` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1199` | `systems/barkDirector.js:639` |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1192` | `ui/station/barContacts.js:181` |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1180` | `ui/station/barContacts.js:180` |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1178` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3600` | `render/authoredMotion.js:1019` |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:4963` | — |
| `npcjobs:surveyMarked` | `systems/npcJobsRuntime.js:1252` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:5035` | `render/npcJobSignatureVfx.js:711`, `render/npcJobSignatureVfx.js:902` |
| `npcjobs:unload` | — | `systems/traffic.js:1622` |
| `npcjobs:work` | — | `systems/traffic.js:1620` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:5130` | `systems/stationSideEventDirector.js:98` |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:5151` | — |
| `occupation:delivered` | `systems/scavengerOccupationSwitch.js:238` | — |
| `occupation:lost` | `systems/scavengerOccupationSwitch.js:266` | — |
| `occupation:switched` | `systems/scavengerOccupationSwitch.js:209` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:2157`, `systems/onboarding.js:2961` | — |
| `onboarding:rosterPrewarm` | `systems/onboarding.js:1858` | — |
| `optic:beamContact` | `systems/combat.js:1342` | — |
| `optic:contact` | `systems/weapons.js:2281`, `systems/weapons.js:2342` | `audio/audioSystem.js:2364` |
| `optic:rekindled` | — | `audio/audioSystem.js:2365` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1223` | `systems/world.js:593` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:2130` | `systems/story.js:159` |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1336` | — |
| `orrinWitness:submitted` | `systems/story.js:1364` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:6707` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:595` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:6503` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:6538` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:6667` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:6621` | `ui/recoveryEncounterPrompt.js:478` |
| `palletJack:drop` | `ui/palletJackPrompt.js:19` | — |
| `palletJack:lost` | `systems/palletJack.js:355` | — |
| `palletJack:offer` | `systems/palletJack.js:271` | `ui/palletJackPrompt.js:6` |
| `palletJack:phase` | `systems/palletJack.js:178` | — |
| `palletJack:released` | `systems/palletJack.js:254` | — |
| `palletJack:trail` | `ui/palletJackPrompt.js:20` | — |
| `patrol:proximity` | `systems/encounterScripts.js:435` | `systems/economy.js:1504`, `systems/moralTrap.js:180` |
| `pds:intercept` | `systems/countermeasures.js:440` | `audio/audioSystem.js:2349` |
| `physics:impact` | `core/physics.js:2031` | `audio/audioSystem.js:2359`, `render/asteroidMotionPresentation.js:484`, `render/feel.js:1386`, `render/shipMicroMotion.js:1298`, `render/vfx.js:2529`, `systems/aftermathWrecks.js:996`, `systems/asteroidSites.js:554`, `systems/barkDirector.js:661`, `systems/collisionConsequences.js:93`, `systems/fields.js:504`, `systems/fragileCargo.js:284`, `systems/gamepad.js:823`, `systems/heistFacilities.js:325`, `systems/impulseCharges.js:275`, `systems/lootShards.js:591`, `systems/masslineImpactDamage.js:49`, `systems/ships.js:1706`, `systems/survivalResults.js:488`, `systems/swarmArena.js:525`, `systems/swarmElites.js:137`, `systems/volatileExposure.js:215`, `testing/motionScenarios.js:1676`, `ui/hud.js:2303` |
| `pickup:collected` | `core/physics.js:1804`, `systems/mining.js:1473`, `systems/mining.js:2441`, `systems/uniqueWrecks.js:1692` | `audio/audioSystem.js:2418`, `render/vfx.js:2634`, `save/saveSystem.js:362`, `systems/economy.js:1466`, `systems/encounterDirector.js:281`, `systems/lawSecurity.js:326`, `systems/mining.js:261`, `systems/onboarding.js:468`, `systems/onboarding.js:537`, `systems/presentationOrchestrator.js:217`, `systems/swarmArena.js:534`, `systems/swarmEvents.js:92`, `systems/swarmSupply.js:107`, `systems/tetherGameplay.js:303`, `systems/traffic.js:1631`, `systems/world.js:596`, `systems/world.js:597`, `systems/world.js:600`, `systems/world.js:667`, `ui/floatingText.js:293` |
| `pirateDisengage:surrenderOffer` | — | `ui/pirateParleyPrompt.js:218` |
| `pirateDisengage:triggered` | — | `systems/combatOutcome.js:190` |
| `pirateDisengage:verdict` | `ui/pirateParleyPrompt.js:196` | — |
| `pirateDisengage:yieldResolved` | — | `ui/pirateParleyPrompt.js:219` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:151` | `systems/pirateParley.js:98` |
| `pirateParley:demand` | `systems/scanner.js:1615` | `ui/pirateParleyPrompt.js:216` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:189`, `ui/pirateParleyPrompt.js:217` |
| `pirateParley:started` | — | `systems/combatOutcome.js:188` |
| `planet:bandFirst` | `systems/planetRuntime.js:340` | `systems/onboarding.js:795` |
| `planet:collector` | `systems/planetRuntime.js:555` | `audio/audioSystem.js:2458`, `render/authoredMotion.js:1038`, `systems/onboarding.js:789` |
| `planet:harvest` | `systems/planetRuntime.js:633` | `audio/audioSystem.js:2459` |
| `planet:harvestDenied` | `systems/planetRuntime.js:640` | `audio/audioSystem.js:2460` |
| `planet:npcHarvest` | `systems/planetRuntime.js:620` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:433`, `systems/planetRuntime.js:446` | `audio/audioSystem.js:2461` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:530` | `audio/audioSystem.js:2462` |
| `planet:registered` | `systems/planetRuntime.js:200` | — |
| `planet:unregistered` | `systems/planetRuntime.js:269` | — |
| `player:death` | `systems/combat.js:845`, `systems/combat.js:976`, `systems/world.js:5950` | `audio/audioSystem.js:2401`, `render/feel.js:1294`, `render/shipMicroMotion.js:1309`, `render/vfx.js:2588`, `save/saveSystem.js:369`, `systems/aftermathWrecks.js:993`, `systems/lawSecurity.js:325`, `systems/lossLedger.js:431`, `systems/missions.js:1556`, `systems/onboarding.js:499`, `systems/onboarding.js:536`, `systems/surrenderRecovery.js:78`, `systems/survivalResults.js:496`, `systems/survivalRun.js:130`, `systems/survivorPod.js:548`, `ui/commandBar.js:405`, `ui/hud.js:2813`, `ui/survivalHud.js:227` |
| `player:recoveryFailed` | `systems/combat.js:1029` | `ui/screens/gameOver.js:565` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:463` | `systems/combat.js:702` |
| `player:respawn` | `systems/combat.js:1102` | `audio/audioSystem.js:2402`, `render/shipMicroMotion.js:1308`, `save/saveSystem.js:370`, `save/saveSystem.js:420`, `ui/commandBar.js:409`, `ui/hud.js:2827`, `ui/screens/gameOver.js:557` |
| `player:scannedByPatrol` | `systems/economy.js:3827` | `render/authoredMotion.js:1017`, `render/vfx.js:2575`, `systems/missions.js:1546`, `ui/customsPrompt.js:149` |
| `poi:discovered` | `systems/world.js:913`, `systems/world.js:5683`, `systems/world.js:5761`, `systems/world.js:6225`, `systems/world.js:6251` | `audio/audioSystem.js:2482`, `systems/encounterDirector.js:299`, `systems/world.js:627` |
| `poi:identified` | `systems/world.js:5768`, `systems/world.js:6252` | `systems/encounterDirector.js:300`, `systems/missions.js:1386`, `systems/world.js:628` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2511` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2510` |
| `presentation:audioCue` | `render/vfx.js:5843`, `systems/presentationAdapters.js:565` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:478` | — |
| `presentation:caption` | `audio/audioSystem.js:2701`, `audio/audioSystem.js:5671`, `systems/factionPresence.js:893`, `systems/factionPresence.js:1306`, `systems/factionPresence.js:1321`, `systems/factionPresence.js:1339`, `systems/factionPresence.js:1401`, `systems/presentationAdapters.js:663`, `systems/story.js:1167`, `systems/story.js:1419` | `ui/hud.js:2876` |
| `presentation:cue` | `systems/aftermathWrecks.js:1397`, `systems/cargo.js:1028`, `systems/planetRuntime.js:457`, `systems/salvageActions.js:272`, `systems/salvageActions.js:484` | `audio/audioSystem.js:2575`, `render/vfx.js:2628`, `render/vfx.js:2629`, `render/vfx.js:2630`, `systems/presentationAdapters.js:206` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:460` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:381`, `systems/presentationAdapters.js:642` | — |
| `presentation:vfxCue` | `render/vfx.js:2647`, `systems/bombs.js:1246`, `systems/fields.js:2367`, `systems/fields.js:2418`, `systems/hullBurst.js:218`, `systems/hullBurst.js:352`, `systems/hullBurst.js:376`, `systems/hullBurst.js:565`, `systems/massSeed.js:319`, `systems/massSeed.js:435`, `systems/massSeed.js:529`, `systems/massSeed.js:571`, `systems/masslineThrow.js:578`, `systems/missions.js:3758`, `systems/missions.js:8303`, `systems/planetRuntime.js:663`, `systems/presentationAdapters.js:527`, `systems/tumbleStates.js:475`, `systems/tumbleStates.js:540`, `systems/volatileExposure.js:482`, `systems/volatileExposure.js:556`, `systems/weapons.js:1759`, `systems/weapons.js:1936`, `systems/weapons.js:3017` | `render/vfx.js:2633` |
| `projectile:bank` | — | `render/vfx.js:2523` |
| `projectile:hit` | `core/physics.js:1076`, `core/physics.js:1265`, `systems/sectorSim.js:639` | `audio/audioSystem.js:2342`, `combat/tetherWebs.js:39`, `render/vfx.js:2522`, `systems/bombs.js:636`, `systems/combat.js:694`, `systems/missions.js:1500` |
| `projectile:nearMiss` | `core/physics.js:1225` | `audio/audioSystem.js:2345`, `systems/presentationOrchestrator.js:175`, `ui/hud.js:2302` |
| `projectile:ricochet` | — | `render/vfx.js:2524` |
| `range:opened` | `ui/screens/range.js:2516` | `systems/onboarding.js:523` |
| `ravel:cast` | `systems/ravel.js:176` | — |
| `ravel:destroyed` | `systems/ravel.js:211` | — |
| `ravel:hit` | `systems/ravel.js:190` | — |
| `ravel:pacified` | `systems/ravel.js:199` | — |
| `ravel:telegraph` | `systems/ravel.js:157` | — |
| `ravel:unthreaded` | `systems/ravel.js:196` | — |
| `ravel:voice` | `systems/ravel.js:130` | — |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `redKite:aborted` | `systems/redKite.js:177` | — |
| `redKite:course` | `ui/redKitePrompt.js:18` | — |
| `redKite:finished` | `systems/redKite.js:203` | — |
| `redKite:offer` | `systems/redKite.js:155` | `ui/redKitePrompt.js:6` |
| `redKite:start` | `ui/redKitePrompt.js:19` | — |
| `redKite:started` | `systems/redKite.js:170` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:162` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:163` |
| `rescue:beat` | `systems/onboarding.js:2333`, `systems/onboarding.js:2365` | — |
| `rescue:complete` | `systems/onboarding.js:2344` | — |
| `rescue:started` | `systems/onboarding.js:1917` | `systems/onboarding.js:500` |
| `rescuedWorker:returned` | `systems/rescuedWorkerReturn.js:420` | — |
| `research:pointsChanged` | `systems/missions.js:5402`, `systems/missions.js:5456`, `systems/missions.js:5490`, `systems/missions.js:8240`, `systems/missions.js:8254`, `systems/missions.js:11280` | `ui/alerts.js:462` |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2597` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1435` | `systems/encounterDirector.js:310` |
| `rhythm:phase` | `systems/encounterDirector.js:460` | — |
| `rubric:destroyed` | `systems/rubric.js:353` | — |
| `rubric:last` | `systems/rubric.js:482` | — |
| `rubric:marked` | `systems/rubric.js:437` | — |
| `rubric:voice` | `systems/rubric.js:264` | — |
| `ruckus:pulse` | `systems/ruckus.js:213` | — |
| `ruckus:retrieved` | `systems/ruckus.js:198` | — |
| `ruckus:state` | `systems/ruckus.js:147` | — |
| `ruckus:voice` | `systems/ruckus.js:141` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:364` | `ui/station/barContacts.js:138` |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:121` |
| `run:awardRequested` | `systems/swarmBrood.js:1333`, `systems/swarmEvents.js:275`, `ui/sandbox/sandboxSetup.js:1228`, `ui/sandbox/sandboxSetup.js:1243` | `systems/runSession.js:73` |
| `run:awarded` | — | `ui/survivalHud.js:207` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1148`, `ui/sandbox/sandboxSetup.js:1190` | `systems/runSession.js:70` |
| `run:draftLockRequested` | `ui/screens/crucibleDraft.js:1272` | `systems/survivalDraft.js:172` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:783`, `ui/screens/crucibleDraft.js:788`, `ui/screens/crucibleDraft.js:1150`, `ui/screens/crucibleDraft.js:1256`, `ui/screens/crucibleDraft.js:1413` | `systems/survivalDraft.js:164` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:911` | `systems/survivalDraft.js:173` |
| `run:draftResolved` | — | `systems/survivalRun.js:124` |
| `run:endRequested` | `save/saveSystem.js:313` | `systems/runSession.js:72` |
| `run:ended` | — | `audio/audioSystem.js:2433`, `systems/survivalAnnounce.js:330`, `systems/survivalArena.js:1002`, `systems/survivalDraft.js:188`, `systems/survivalResults.js:533`, `systems/survivalRun.js:118`, `systems/survivalWave.js:139`, `systems/swarmArena.js:526`, `systems/swarmChain.js:112`, `systems/swarmElites.js:141`, `systems/swarmEvents.js:91`, `systems/swarmJuice.js:111`, `systems/swarmSupply.js:109`, `ui/swarmJuiceHud.js:102` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:127` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:328`, `ui/survivalHud.js:208` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1264` | `systems/ships.js:1738`, `systems/survivalRun.js:119`, `systems/swarmSupply.js:102`, `systems/world.js:623` |
| `run:modifierChosen` | — | `systems/survivalRun.js:125` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:75` |
| `run:openingLessonReleased` | — | `systems/survivalAnnounce.js:326` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1265` | `systems/survivalRun.js:120` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1514`, `ui/screens/crucibleDraft.js:1531` | `systems/survivalDraft.js:165` |
| `run:refitClosed` | — | `systems/survivalRun.js:126` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:1896` | `systems/survivalDraft.js:166` |
| `run:refitSellRequested` | `ui/screens/crucibleDraft.js:1927` | `systems/survivalDraft.js:171` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:1892` | `systems/survivalDraft.js:167` |
| `run:resultsReady` | — | `systems/achievements.js:1112`, `ui/uiRoot.js:1412` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:177` |
| `run:spendRequested` | — | `systems/runSession.js:74` |
| `run:spent` | — | `systems/survivalDraft.js:176` |
| `run:started` | — | `audio/audioSystem.js:2432`, `sim/killcamTape.js:430`, `systems/survivalAnnounce.js:321`, `systems/survivalResults.js:483`, `systems/survivalRun.js:116`, `systems/swarmElites.js:140`, `systems/swarmJuice.js:110`, `ui/survivalHud.js:209`, `ui/swarmJuiceHud.js:101`, `ui/uiRoot.js:1424` |
| `run:threatRequested` | — | `systems/runSession.js:76` |
| `run:transitionRequested` | `systems/survivalRun.js:544` | `systems/runSession.js:71` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:329`, `systems/survivalDraft.js:163`, `systems/survivalResults.js:532`, `systems/survivalRun.js:117`, `systems/survivalWave.js:138`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:327`, `systems/survivalArena.js:1001`, `systems/survivalResults.js:486`, `systems/swarmEvents.js:90` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:122` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:324` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:497` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:322`, `systems/survivalArena.js:968`, `systems/survivalWave.js:136`, `systems/swarmArena.js:522`, `systems/swarmJuice.js:104`, `ui/survivalHud.js:220` |
| `run:waveProgress` | — | `ui/survivalHud.js:221` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:323`, `systems/survivalResults.js:485`, `systems/survivalWave.js:137`, `systems/swarmArena.js:523`, `systems/swarmEvents.js:89`, `systems/swarmJuice.js:105`, `ui/swarmJuiceHud.js:100` |
| `sable:demonstrated` | `ui/station/screens/shipworks.js:4998` | — |
| `salvage:actionRead` | `systems/salvageActions.js:218` | — |
| `salvage:bayCashedIn` | `systems/cargo.js:1057` | — |
| `salvage:changed` | `systems/cargo.js:532`, `systems/cargo.js:1058` | — |
| `salvage:claimJumped` | `systems/mining.js:1998` | `systems/missions.js:1589` |
| `salvage:communicatorFound` | `systems/salvage.js:1142` | `systems/encounterDirector.js:301`, `systems/story.js:278`, `ui/wreckChoicePrompt.js:44` |
| `salvage:completed` | `systems/mining.js:1853` | `render/vfx.js:2593`, `systems/aftermathWrecks.js:1014`, `systems/lawSecurity.js:332`, `systems/missions.js:1453`, `systems/missions.js:1590`, `systems/story.js:260` |
| `salvage:cookerFlight` | `systems/salvageActions.js:479` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:625` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:269` | `render/authoredMotion.js:1024` |
| `salvage:cutComplete` | `systems/mining.js:578` | `audio/audioSystem.js:2436`, `render/authoredMotion.js:993`, `render/vfx.js:2592` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | `systems/salvage.js:167` |
| `salvage:npcExtraction` | `systems/traffic.js:7238` | `render/authoredMotion.js:992` |
| `salvage:npcUnload` | `systems/traffic.js:11015` | `systems/economy.js:1470` |
| `salvage:placed` | `systems/salvage.js:528` | `systems/lossInvestigation.js:123`, `systems/survivorPod.js:526` |
| `salvage:reactorBurst` | `systems/salvageActions.js:731` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:336` | `systems/salvage.js:163` |
| `salvage:reactorVented` | `systems/salvageActions.js:233` | — |
| `salvage:sortDelivered` | `systems/salvage.js:976` | — |
| `salvage:sortImpact` | `systems/salvage.js:940` | — |
| `salvage:sortLost` | `systems/salvage.js:997` | — |
| `salvage:sortSeparated` | `systems/salvage.js:904` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:133` |
| `save:backup` | `save/saveSystem.js:1623` | — |
| `save:completed` | `save/saveSystem.js:1629` | `ui/screens/saveLoad.js:910`, `ui/uiRoot.js:422` |
| `save:dirty` | `systems/ruckus.js:91` | `save/saveSystem.js:346` |
| `save:envelopePrepared` | `save/saveSystem.js:3915`, `save/saveSystem.js:3931` | `main.js:220` |
| `save:envelopeSpecPrepared` | `save/saveSystem.js:2003` | `main.js:219` |
| `save:error` | `main.js:236`, `save/saveSystem.js:1151`, `save/saveSystem.js:1696`, `save/saveSystem.js:3784`, `save/saveSystem.js:3802`, `save/saveSystem.js:3846`, `save/saveSystem.js:3867`, `save/saveSystem.js:3886`, `save/saveSystem.js:3956`, `save/saveSystem.js:4087`, `save/saveSystem.js:4108`, `save/saveSystem.js:4125`, `save/saveSystem.js:4281`, `save/saveSystem.js:4295`, `save/saveSystem.js:4389`, `save/saveSystem.js:4425`, `save/saveSystem.js:4472`, `save/saveSystem.js:4590`, `save/saveSystem.js:4626`, `save/saveSystem.js:5219`, `save/saveSystem.js:5227`, `save/saveSystem.js:5273`, `save/saveSystem.js:6049`, `save/saveSystem.js:6067`, `save/saveSystem.js:6164`, `save/saveSystem.js:6183`, `ui/screens/saveLoad.js:1383` | `systems/aftermathWrecks.js:1026`, `systems/asteroidSites.js:553`, `systems/automation.js:564`, `systems/encounterDirector.js:273`, `systems/traffic.js:1652`, `ui/loadingPresenter.js:194`, `ui/screenManager.js:675`, `ui/screens/saveLoad.js:896`, `ui/uiRoot.js:448` |
| `save:exportRecovery` | `save/saveSystem.js:6038` | `ui/toasts.js:562` |
| `save:loadSpeculationTarget` | `ui/screens/gameOver.js:829`, `ui/screens/pause.js:1116`, `ui/screens/saveLoad.js:1086` | `save/saveSystem.js:326` |
| `save:loaded` | `save/saveSystem.js:5175` | `audio/audioSystem.js:2778`, `audio/bombAudio.js:460`, `audio/fieldAudio.js:269`, `careers/origins/haulerOriginSystem.js:65`, `combat/tetherWebs.js:48`, `core/coreSystem.js:310`, `core/physics.js:168`, `main.js:311`, `render/feel.js:1201`, `render/shipMicroMotion.js:1293`, `render/vfx.js:2571`, `render/vfx.js:2582`, `save/saveSystem.js:382`, `save/saveSystem.js:398`, `systems/aftermathWrecks.js:1025`, `systems/aiEncounter.js:137`, `systems/asteroidFormations.js:124`, `systems/asteroidSites.js:543`, `systems/autoTargetAssist.js:145`, `systems/automation.js:559`, `systems/barkDirector.js:599`, `systems/beacons.js:54`, `systems/bombs.js:635`, `systems/collisionConsequences.js:98`, `systems/combat.js:731`, `systems/combatOutcome.js:165`, `systems/countermeasures.js:223`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:85`, `systems/economy.js:1521`, `systems/encounterDirector.js:272`, `systems/environmentalMachinery.js:222`, `systems/factionPresence.js:459`, `systems/fields.js:492`, `systems/flight.js:79`, `systems/flightV3.js:178`, `systems/gateControlDirector.js:71`, `systems/heat.js:323`, `systems/heistFacilities.js:337`, `systems/impulseCharges.js:283`, `systems/lawSecurity.js:322`, `systems/lossInvestigation.js:129`, `systems/massSeed.js:121`, `systems/masslineSnares.js:139`, `systems/mines.js:78`, `systems/mining.js:279`, `systems/missions.js:1368`, `systems/npcJobsRuntime.js:986`, `systems/npcJobsRuntime.js:994`, `systems/npcJobsRuntime.js:1040`, `systems/npcJobsRuntime.js:1043`, `systems/onboarding.js:444`, `systems/planetRuntime.js:103`, `systems/presentationAdapters.js:213`, `systems/presentationOrchestrator.js:287`, `systems/routeFollower.js:387`, `systems/runSession.js:81`, `systems/salvageActions.js:137`, `systems/sectorSim.js:117`, `systems/ships.js:1625`, `systems/stationContactLoadBoundary.js:39`, `systems/stationSideEventDirector.js:97`, `systems/story.js:153`, `systems/survivalArena.js:1016`, `systems/survivorPod.js:546`, `systems/tetherGameplay.js:294`, `systems/titles.js:585`, `systems/traffic.js:1670`, `systems/traffic.js:1696`, `systems/traffic.js:1706`, `systems/traffic.js:1709`, `systems/travelLanes.js:533`, `systems/tumbleStates.js:123`, `systems/uniqueLootAbilities.js:150`, `systems/wingmen.js:145`, `systems/world.js:608`, `ui/alerts.js:457`, `ui/automationPayoff.js:76`, `ui/bandHud.js:91`, `ui/capitalBossOverlayMount.js:93`, `ui/cargoConscience.js:146`, `ui/hudLayout.js:120`, `ui/moralTrapPrompt.js:43`, `ui/priceHistory.js:147`, `ui/uiRoot.js:429`, `ui/uiRoot.js:1428`, `ui/wreckChoicePrompt.js:55` |
| `save:recovered` | `save/saveSystem.js:3835`, `save/saveSystem.js:3945` | `ui/uiRoot.js:441` |
| `save:restoring` | `save/saveSystem.js:4735` | `core/coreSystem.js:307`, `render/feel.js:1200`, `render/vfx.js:2570`, `render/vfx.js:2581`, `systems/aftermathWrecks.js:1024`, `systems/asteroidSites.js:534`, `systems/autoTargetAssist.js:142`, `systems/automation.js:552`, `systems/cloak.js:74`, `systems/encounterDirector.js:265`, `systems/environmentalMachinery.js:221`, `systems/lawSecurity.js:321`, `systems/missions.js:1372`, `systems/npcJobsRuntime.js:987`, `systems/runSession.js:80`, `systems/salvage.js:157`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:38`, `systems/surrenderRecovery.js:79`, `systems/traffic.js:1640`, `systems/world.js:601` |
| `save:slotsValidated` | `save/saveSystem.js:1960` | `ui/screens/saveLoad.js:909` |
| `save:started` | `save/saveSystem.js:1316`, `save/saveSystem.js:2508` | `ui/screenManager.js:682` |
| `scan:completed` | `balance/careerCohorts.js:497`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:1245`, `systems/world.js:5687` | `careers/origins/prospectorOrigin.js:633`, `systems/asteroidFormations.js:130`, `systems/heistFacilities.js:332`, `systems/missions.js:1466`, `systems/onboarding.js:480`, `systems/presentationOrchestrator.js:191`, `systems/salvage.js:154`, `systems/salvageActions.js:132`, `systems/story.js:264`, `systems/story.js:265`, `systems/world.js:654`, `ui/hud.js:4751` |
| `scan:debrisCache` | `systems/mining.js:1899`, `systems/scanReveal.js:219` | `systems/presentationOrchestrator.js:201` |
| `scan:pulse` | `systems/scanner.js:1151` | `render/authoredMotion.js:968`, `render/shipMicroMotion.js:1318`, `systems/buildIdentity.js:305`, `systems/cloak.js:91`, `systems/encounterDirector.js:290`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:190`, `systems/scanReveal.js:60`, `systems/world.js:655`, `ui/hud.js:4752` |
| `scan:shipRevealed` | `systems/scanReveal.js:87` | `audio/audioSystem.js:2325`, `systems/buildIdentity.js:304` |
| `scan:weakPoint` | `systems/scanner.js:1234` | `ui/hud.js:1826` |
| `scan:wreckInvestigated` | `systems/scanReveal.js:124` | — |
| `scan:wreckResolved` | `systems/scanner.js:1189` | `systems/lawSecurity.js:331` |
| `scan:wreckRevealed` | `systems/scanReveal.js:120` | `audio/audioSystem.js:2326`, `systems/presentationOrchestrator.js:200` |
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
| `sector:discovered` | `systems/world.js:1049` | `systems/presentationOrchestrator.js:188` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:1101` | `audio/audioSystem.js:2536`, `audio/bombAudio.js:457`, `audio/fieldAudio.js:266`, `render/shipMicroMotion.js:1292`, `render/vfx.js:2566`, `render/vfx.js:2577`, `save/saveSystem.js:403`, `systems/achievements.js:1098`, `systems/aftermathWrecks.js:1003`, `systems/aiEncounter.js:138`, `systems/asteroidFormations.js:123`, `systems/asteroidSites.js:499`, `systems/automation.js:590`, `systems/bombs.js:627`, `systems/claims.js:380`, `systems/claims.js:382`, `systems/combatOutcome.js:180`, `systems/difficultyDirector.js:170`, `systems/dockingCorridor.js:83`, `systems/economy.js:1492`, `systems/encounterDirector.js:261`, `systems/factionPresence.js:443`, `systems/fields.js:490`, `systems/heistFacilities.js:304`, `systems/intervention.js:75`, `systems/lossInvestigation.js:124`, `systems/massSeed.js:119`, `systems/masslineSnares.js:135`, `systems/mines.js:76`, `systems/mining.js:278`, `systems/missions.js:1573`, `systems/moralTrap.js:178`, `systems/npcJobsRuntime.js:975`, `systems/onboarding.js:587`, `systems/presentationOrchestrator.js:237`, `systems/routeFollower.js:379`, `systems/salvage.js:128`, `systems/salvageActions.js:140`, `systems/sectorSim.js:114`, `systems/story.js:215`, `systems/story.js:263`, `systems/survivalArena.js:1014`, `systems/survivorPod.js:529`, `systems/tetherGameplay.js:298`, `systems/traffic.js:1589`, `systems/travelLanes.js:534`, `systems/wingmen.js:122`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:155`, `ui/securityReadout.js:157`, `ui/watchlistHud.js:91` |
| `sector:exit` | `systems/world.js:974` | `audio/bombAudio.js:456`, `audio/fieldAudio.js:265`, `render/vfx.js:2567`, `render/vfx.js:2578`, `systems/achievements.js:1104`, `systems/aftermathWrecks.js:1013`, `systems/asteroidSites.js:524`, `systems/automation.js:578`, `systems/bombs.js:626`, `systems/dockingCorridor.js:82`, `systems/encounterDirector.js:263`, `systems/environmentalMachinery.js:219`, `systems/factionPresence.js:448`, `systems/fields.js:489`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:323`, `systems/impulseCharges.js:284`, `systems/lawSecurity.js:320`, `systems/massSeed.js:118`, `systems/masslineSnares.js:133`, `systems/mines.js:75`, `systems/mining.js:266`, `systems/missions.js:1574`, `systems/npcJobsRuntime.js:974`, `systems/planetRuntime.js:104`, `systems/sectorSim.js:113`, `systems/spawnBudget.js:50`, `systems/stationServices.js:207`, `systems/stationSideEventDirector.js:96`, `systems/surrenderRecovery.js:77`, `systems/survivalArena.js:1015`, `systems/tetherGameplay.js:297`, `systems/traffic.js:1612`, `systems/wingmen.js:134`, `ui/customsPrompt.js:151`, `ui/impoundPayPrompt.js:51`, `ui/impoundPayPrompt.js:56`, `ui/promptDeck.js:850`, `ui/wreckChoicePrompt.js:53` |
| `sector:membershipCandidate` | `systems/world.js:2332` | — |
| `sectorsim:embodiment` | `systems/sectorSim.js:908` | `systems/world.js:638` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:343` | `ui/screens/starmap.js:863` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1959`, `systems/claims.js:1861`, `systems/encounterDirector.js:1962`, `systems/mining.js:2601` | `systems/sectorSim.js:122`, `systems/world.js:653` |
| `sectorsim:intel` | `systems/sectorSim.js:962` | `systems/world.js:643` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:738` | `systems/economy.js:1535` |
| `sectorsim:reconcile` | `systems/sectorSim.js:691` | `systems/world.js:644` |
| `sectorsim:tick` | `systems/sectorSim.js:288` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:650` | `ui/screens/starmap.js:864` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:551` | `systems/scanner.js:1019` |
| `service:aborted` | `systems/stationServices.js:294` | `audio/audioSystem.js:2476`, `render/authoredMotion.js:987` |
| `service:completed` | `systems/economy.js:3313`, `systems/economy.js:3473`, `systems/economy.js:3505`, `systems/economy.js:3560`, `systems/economy.js:3601`, `systems/economy.js:3631`, `systems/economy.js:3669`, `systems/stationServices.js:512`, `systems/stationServices.js:529` | `render/authoredMotion.js:986`, `render/authoredMotion.js:990`, `systems/factionPresence.js:457`, `systems/ships.js:1710` |
| `service:progress` | `systems/stationServices.js:454` | — |
| `service:queued` | `systems/stationServices.js:361` | — |
| `service:started` | `systems/stationServices.js:443` | `audio/audioSystem.js:2475`, `render/authoredMotion.js:985` |
| `settings:changed` | `save/saveSystem.js:5235`, `save/saveSystem.js:5236`, `systems/legacyTouch.js:701`, `ui/screens/motionAsk.js:95`, `ui/screens/pause.js:618`, `ui/screens/pause.js:626`, `ui/screens/pause.js:704`, `ui/screens/pause.js:737`, `ui/screens/settings.js:544`, `ui/screens/settings.js:997`, `ui/screens/settings.js:1056`, `ui/screens/settings.js:1147` | `audio/audioSystem.js:2717`, `main.js:310`, `render/vfx.js:2584`, `save/saveSystem.js:340`, `ui/uiRoot.js:754` |
| `ship:appearanceChanged` | `systems/ships.js:1993`, `systems/ships.js:2328`, `systems/traffic.js:3717` | `core/coreSystem.js:306`, `render/vfx.js:2572` |
| `ship:appearanceSaved` | `systems/ships.js:2330` | `ui/station/screens/shipworks.js:740` |
| `ship:boostPreKick` | `systems/flightV3.js:711` | `render/authoredMotion.js:982`, `render/feel.js:1321` |
| `ship:boostStart` | `systems/flight.js:110`, `systems/flightV3.js:230` | `audio/audioSystem.js:2543`, `render/authoredMotion.js:983`, `render/vfx.js:2611`, `systems/cruise.js:61`, `systems/onboarding.js:524` |
| `ship:boostStop` | `systems/flight.js:111`, `systems/flight.js:224`, `systems/flightV3.js:231`, `systems/flightV3.js:754` | `audio/audioSystem.js:2548`, `render/authoredMotion.js:984`, `render/vfx.js:2612` |
| `ship:cargoCapChanged` | `systems/ships.js:1988` | — |
| `ship:dash` | `systems/flight.js:201`, `systems/flightV3.js:732` | `audio/audioSystem.js:2551`, `render/vfx.js:2613`, `systems/uniqueLootAbilities.js:148` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2261` | `render/vfx.js:2638` |
| `ship:deathPop` | `render/shipMicroMotion.js:988`, `render/shipMicroMotion.js:2251` | `render/vfx.js:2637` |
| `ship:livingHullChanged` | `systems/ships.js:1812`, `systems/ships.js:1864`, `systems/story.js:2020` | `systems/barkDirector.js:602` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2769` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2666`, `systems/ships.js:2691`, `systems/ships.js:2759` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2625` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2596` | — |
| `ship:massChanged` | `systems/ships.js:2179` | `ui/hud.js:4262` |
| `ship:nameChanged` | `systems/ships.js:2353` | — |
| `ship:parkedHoldSwap` | `systems/ships.js:2280` | — |
| `ship:purchased` | `systems/ships.js:2218` | `audio/audioSystem.js:2524`, `systems/missions.js:1605` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1037`, `render/shipMicroMotion.js:2238` | `render/vfx.js:2636` |
| `ship:roleContext` | `systems/ships.js:1922` | `systems/presentationAdapters.js:208` |
| `ship:sold` | `systems/ships.js:2258` | — |
| `ship:statsChanged` | `systems/ships.js:1987` | `systems/world.js:588`, `ui/commandBar.js:410`, `ui/hud.js:4258` |
| `ship:swingDash` | `systems/flightV3.js:733` | `render/shipMicroMotion.js:1312` |
| `ship:thrust` | `systems/flight.js:435`, `systems/flightV3.js:2080` | `render/vfx.js:2610` |
| `ships:grantModule` | — | `systems/ships.js:1618` |
| `signal:investigate` | — | `systems/scanner.js:1008` |
| `signal:investigated` | `systems/scanner.js:1899` | `systems/missions.js:1482`, `systems/presentationOrchestrator.js:194`, `systems/story.js:158`, `systems/world.js:591`, `ui/signalInvestigationPrompt.js:176` |
| `signal:investigating` | `systems/scanner.js:1504` | `ui/signalInvestigationPrompt.js:175` |
| `signal:receipt` | `systems/scanner.js:1900` | — |
| `signal:scanResults` | `systems/scanner.js:1246` | `systems/missions.js:1467`, `systems/presentationOrchestrator.js:192`, `systems/story.js:266`, `systems/story.js:269`, `ui/signalInvestigationPrompt.js:173` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:1009` |
| `signal:track` | — | `systems/scanner.js:1007` |
| `signal:tracked` | `systems/scanner.js:1512`, `systems/scanner.js:1535` | `systems/presentationOrchestrator.js:193`, `ui/signalInvestigationPrompt.js:174` |
| `sim:pause` | `ui/screenManager.js:495` | `audio/audioSystem.js:2733`, `audio/bombAudio.js:463`, `audio/fieldAudio.js:271`, `render/feel.js:1198`, `systems/autoTargetAssist.js:153` |
| `sim:resume` | `ui/screenManager.js:502` | `audio/audioSystem.js:2734` |
| `site:anchored` | `systems/asteroidSites.js:1424` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:2436` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:2337` | `audio/audioSystem.js:2755` |
| `site:courierLost` | `systems/asteroidSites.js:2420` | — |
| `site:created` | `systems/asteroidSites.js:1362` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1770`, `systems/asteroidSites.js:1854` | — |
| `site:lost` | `systems/asteroidSites.js:1966` | `ui/alerts.js:447` |
| `site:machineInstalled` | `systems/asteroidSites.js:1393` | `audio/audioSystem.js:2754`, `ui/alerts.js:446` |
| `site:machineMode` | `systems/asteroidSites.js:1875` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1787` | `render/authoredMotion.js:1002` |
| `site:machineStatus` | `systems/asteroidSites.js:2278` | `audio/audioSystem.js:2759`, `ui/alerts.js:442` |
| `site:podBuilt` | `systems/asteroidSites.js:2226` | — |
| `site:producing` | `systems/asteroidSites.js:1654` | `render/authoredMotion.js:1001`, `ui/asteroid/asteroidScreen.js:1790` |
| `site:rematerialized` | `systems/asteroidSites.js:2018` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1572` | `ui/asteroid/asteroidScreen.js:1775` |
| `site:surveyComplete` | `systems/asteroidSites.js:1515` | `ui/asteroid/asteroidScreen.js:1769` |
| `site:surveyDetected` | `systems/asteroidSites.js:1505` | `ui/asteroid/asteroidScreen.js:1762` |
| `solstice:bloom` | `systems/solstice.js:519` | — |
| `solstice:charged` | `systems/solstice.js:449` | — |
| `solstice:destroyed` | `systems/solstice.js:361` | — |
| `solstice:voice` | `systems/solstice.js:291` | — |
| `spawn:request` | `systems/automation.js:1664` | `systems/world.js:622` |
| `station:berthAssigned` | `systems/stationServices.js:423` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:234` | `render/vfx.js:2599` |
| `station:exitRequest` | `ui/screenManager.js:639`, `ui/uiRoot.js:1320` | `ui/station/stationApp.js:1327` |
| `station:holding` | `systems/stationServices.js:427` | — |
| `station:moduleGained` | `systems/claims.js:2373` | `systems/factions.js:467` |
| `station:navigate` | `ui/screens/automationPanel.js:1509`, `ui/station/screens/bar.js:769`, `ui/station/screens/bar.js:774`, `ui/station/screens/industry.js:496`, `ui/station/screens/industry.js:503` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:259` | `render/infrastructureMotion.js:204`, `render/vfx.js:2598` |
| `station:throughput` | `systems/claims.js:2343` | `render/authoredMotion.js:1022` |
| `station:yardChanged` | `systems/stationServices.js:583` | — |
| `stationContact:changed` | `systems/stationContacts.js:335`, `systems/stationContacts.js:371`, `systems/stationContacts.js:539`, `systems/stationContacts.js:563` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:271`, `systems/stationContacts.js:580` | — |
| `stationContact:counterDelta` | `systems/missions.js:8059` | — |
| `stationLife:deedNoticed` | `systems/stationContacts.js:500` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:359`, `systems/stationContacts.js:471` | — |
| `story:beatAdvanced` | `systems/missions.js:11306` | `save/saveSystem.js:410`, `systems/story.js:148`, `ui/screens/codex.js:845` |
| `story:continuationAccess` | `systems/story.js:2454` | — |
| `story:elroyResolved` | `systems/missions.js:5985` | `systems/story.js:149` |
| `story:kurtzLedger` | `systems/story.js:1709`, `systems/story.js:1720` | `systems/story.js:177` |
| `story:newGamePlusStarted` | `systems/story.js:1934` | `systems/titles.js:589`, `ui/hudMeta.js:129` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1781` | `systems/story.js:175` |
| `story:postEndingContinuity` | `systems/story.js:1609` | `ui/screens/missionLog.js:2508` |
| `story:postEndingProgress` | `systems/story.js:1579` | `ui/screens/missionLog.js:2507` |
| `story:replayHookUnlocked` | `systems/story.js:1594` | `ui/screens/missionLog.js:2509` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:606` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:605` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1398` | `systems/story.js:176` |
| `story:vergeObserversRevealed` | `systems/story.js:1166` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1418` | `systems/story.js:178` |
| `stunt:bridge` | `systems/stuntGrammar.js:274` | `ui/stuntCallout.js:565` |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:259` | `ui/stuntCallout.js:564` |
| `stunt:salvageRights` | `systems/stuntGrammar.js:179` | `ui/stuntCallout.js:562` |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:203` | `ui/stuntCallout.js:563` |
| `stunt:styleBanked` | `systems/stuntGrammar.js:166` | `audio/audioSystem.js:2424`, `ui/stuntCallout.js:553` |
| `stunt:trickAmended` | — | `systems/bulletTime.js:135`, `systems/survivalResults.js:491`, `systems/titles.js:588`, `ui/stuntCallout.js:552` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:2423`, `systems/bulletTime.js:134`, `systems/killReplay.js:285`, `systems/survivalResults.js:490`, `systems/titles.js:587`, `ui/stuntCallout.js:551`, `ui/toasts.js:526` |
| `surrender:escaped` | — | `systems/combatOutcome.js:186` |
| `surrender:secured` | — | `systems/traffic.js:1628` |
| `surrender:tethered` | — | `systems/traffic.js:1627` |
| `survivalArena:installed` | — | `systems/survivalAnnounce.js:332` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1237` | — |
| `survivalWave:cohortJoined` | `systems/capitalBossRuntime.js:187` | `systems/survivalWave.js:145` |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:136` | `systems/survivorPod.js:543` |
| `survivorPod:delivered` | `systems/traffic.js:6573` | `render/authoredMotion.js:1023`, `systems/titles.js:590` |
| `survivorPod:ejected` | `systems/survivorPod.js:746`, `systems/survivorPod.js:881` | `render/authoredMotion.js:1006`, `systems/lawSecurity.js:319` |
| `survivorPod:promoted` | `systems/survivorPod.js:1250` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1379`, `systems/survivorPod.js:1413` | `ui/wreckChoicePrompt.js:52` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1390` | `render/authoredMotion.js:1007`, `systems/missions.js:1551` |
| `survivorPod:rescued` | — | `systems/titles.js:591`, `systems/traffic.js:1634` |
| `survivorPod:resolved` | `systems/survivorPod.js:1113` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1450` | `systems/missions.js:1553`, `ui/wreckChoicePrompt.js:51` |
| `swarm:announce` | — | `ui/swarmJuiceHud.js:90` |
| `swarm:bossDown` | — | `ui/swarmJuiceHud.js:95` |
| `swarm:bossHp` | — | `ui/swarmJuiceHud.js:94` |
| `swarm:bossIntro` | — | `ui/swarmJuiceHud.js:93` |
| `swarm:broodKills` | `systems/swarmBrood.js:1323` | `systems/swarmChain.js:111`, `systems/swarmJuice.js:103` |
| `swarm:chain` | — | `audio/audioSystem.js:2428`, `systems/survivalResults.js:500`, `systems/swarmElites.js:138`, `systems/swarmJuice.js:108`, `ui/survivalHud.js:222`, `ui/swarmJuiceHud.js:96` |
| `swarm:chainBest` | — | `systems/survivalResults.js:521` |
| `swarm:chainBroken` | — | `audio/audioSystem.js:2431`, `systems/swarmElites.js:139`, `systems/swarmJuice.js:109`, `ui/survivalHud.js:223`, `ui/swarmJuiceHud.js:97` |
| `swarm:chainShatter` | — | `ui/swarmJuiceHud.js:99` |
| `swarm:chainTier` | — | `ui/swarmJuiceHud.js:98` |
| `swarm:event` | `systems/swarmEvents.js:289` | — |
| `swarm:eventTelegraphed` | `systems/swarmEvents.js:137` | — |
| `swarm:killPopup` | — | `ui/stuntCallout.js:567`, `ui/swarmJuiceHud.js:89` |
| `swarm:pressureSpend` | — | `systems/survivalResults.js:489` |
| `swarm:pressureTelegraph` | — | `systems/survivalAnnounce.js:325` |
| `swarm:roundClear` | — | `ui/swarmJuiceHud.js:92` |
| `swarm:roundSlam` | — | `ui/swarmJuiceHud.js:91` |
| `tech:researched` | `systems/ships.js:2039` | `audio/audioSystem.js:2523`, `systems/onboarding.js:625`, `systems/ships.js:1622` |
| `terrainAnchors:replenished` | `systems/terrainAnchors.js:229` | — |
| `tether:attached` | `combat/attachments.js:438` | `audio/audioSystem.js:2602`, `render/authoredMotion.js:973`, `render/vfx.js:2516`, `systems/encounterDirector.js:295`, `systems/presentationOrchestrator.js:96`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:422`, `systems/tetherGameplay.js:1302`, `systems/tetherGameplay.js:2134` | `audio/audioSystem.js:2621`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1320`, `systems/onboarding.js:478`, `systems/onboarding.js:494`, `systems/surrenderRecovery.js:74` |
| `tether:broken` | `combat/attachments.js:556` | `audio/audioSystem.js:2593`, `render/feel.js:1359`, `render/vfx.js:2519`, `systems/presentationOrchestrator.js:104`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:299`, `systems/volatileExposure.js:217` |
| `tether:couplerLock` | `systems/tetherGameplay.js:2534` | — |
| `tether:cut` | `systems/tetherGameplay.js:1918` | `audio/audioSystem.js:2625`, `systems/gamepad.js:826`, `systems/masslineThrow.js:120`, `systems/onboarding.js:493`, `systems/onboarding.js:533` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1902` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:744`, `systems/tetherGameplay.js:345`, `systems/tetherGameplay.js:500`, `systems/tetherGameplay.js:525`, `systems/tetherGameplay.js:568`, `systems/tetherGameplay.js:573`, `systems/tetherGameplay.js:583`, `systems/tetherGameplay.js:600`, `systems/tetherGameplay.js:965` | `render/authoredMotion.js:979`, `systems/onboarding.js:661`, `testing/lab/proofSixtySeconds.js:1530`, `ui/masslineHud.js:1001` |
| `tether:latched` | `systems/tetherGameplay.js:620` | `audio/audioSystem.js:2617`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:507`, `systems/flightV3.js:187`, `systems/gamepad.js:825`, `systems/heistFacilities.js:336`, `systems/lawSecurity.js:327`, `systems/masslineThrow.js:126`, `systems/missions.js:1496`, `systems/missions.js:1533`, `systems/missions.js:1591`, `systems/onboarding.js:473`, `systems/onboarding.js:490`, `systems/onboarding.js:522`, `systems/onboarding.js:531`, `systems/onboarding.js:673`, `systems/onboarding.js:676`, `systems/onboarding.js:688`, `systems/surrenderRecovery.js:71`, `systems/survivorPod.js:549`, `testing/lab/proofSixtySeconds.js:1531`, `ui/masslineHud.js:1015`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1581` | — |
| `tether:nearBreak` | `combat/attachments.js:929` | `audio/audioSystem.js:2614`, `systems/onboarding.js:479`, `systems/presentationOrchestrator.js:97` |
| `tether:rebound` | `combat/attachments.js:861` | `audio/audioSystem.js:2636` |
| `tether:reel` | `combat/attachments.js:490` | `audio/audioSystem.js:2591`, `systems/missions.js:1492`, `systems/onboarding.js:476`, `systems/onboarding.js:491`, `systems/surrenderRecovery.js:72` |
| `tether:reelPump` | `systems/masslineTelemetry.js:256` | `render/authoredMotion.js:976` |
| `tether:releaseRated` | `systems/tetherGameplay.js:423`, `systems/tetherGameplay.js:1300`, `systems/tetherGameplay.js:1303`, `systems/tetherGameplay.js:1920` | `audio/audioSystem.js:2592`, `render/feel.js:1412`, `render/vfx.js:2518`, `systems/gamepad.js:827`, `systems/masslineThrow.js:123`, `systems/missions.js:1497`, `systems/presentationOrchestrator.js:163`, `systems/titles.js:592`, `ui/masslineHud.js:1023` |
| `tether:released` | `systems/tetherGameplay.js:1297`, `systems/tetherGameplay.js:1919` | `render/authoredMotion.js:977`, `render/shipMicroMotion.js:1319`, `render/vfx.js:2517`, `systems/barkDirector.js:634`, `systems/onboarding.js:477`, `systems/onboarding.js:492`, `systems/onboarding.js:532`, `systems/surrenderRecovery.js:73`, `systems/world.js:660` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2445` | — |
| `tether:snagged` | `systems/tetherGameplay.js:2298` | `audio/audioSystem.js:2629` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:334` | `render/authoredMotion.js:975` |
| `tether:strain` | `systems/tetherGameplay.js:1645` | `audio/audioSystem.js:2607`, `render/authoredMotion.js:981` |
| `tether:tractorCapture` | `systems/tetherGameplay.js:642` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1437`, `render/vfx.js:2563`, `systems/collisionConsequences.js:94`, `systems/combat.js:695`, `systems/masslineImpactDamage.js:47`, `systems/missions.js:1498`, `systems/onboarding.js:495`, `systems/onboarding.js:534`, `systems/onboarding.js:709`, `systems/presentationOrchestrator.js:139`, `systems/tumbleStates.js:111` |
| `tether:whipSnap` | `systems/tetherGameplay.js:2042` | `systems/gamepad.js:841` |
| `title:holdResolved` | — | `systems/titles.js:581` |
| `touch:guide` | `ui/screens/pause.js:942` | — |
| `touch:uiAction` | `systems/legacyTouch.js:634` | `ui/input.js:790` |
| `towlineTable:assistAccepted` | `systems/towlineTable.js:201` | — |
| `towlineTable:assistFulfilled` | `systems/towlineTable.js:225` | — |
| `towlineTable:cleanupAccepted` | `systems/towlineTable.js:158` | — |
| `towlineTable:offer` | `systems/towlineTable.js:260` | `ui/towlineTablePrompt.js:4` |
| `traffic:anvilTransfer` | `systems/anvilWork.js:183` | — |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:2416` |
| `traffic:oreCollected` | `systems/traffic.js:6369` | `render/authoredMotion.js:1018`, `render/npcJobSignatureVfx.js:676`, `render/npcJobSignatureVfx.js:901` |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:4178` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:11163` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:9784` | `systems/barkDirector.js:640` |
| `traffic:spillNoticed` | `systems/traffic.js:6936` | `systems/barkDirector.js:638` |
| `tutorial:finished` | `systems/onboarding.js:1505` | `systems/achievements.js:1116`, `systems/missions.js:1367`, `systems/presentationAdapters.js:211`, `systems/story.js:171` |
| `tutorial:say` | `systems/onboarding.js:1196` | `audio/audioSystem.js:2675`, `systems/story.js:208` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2375` | `systems/missions.js:1376` |
| `ui:acceptMission` | `ui/adventureDecisions.js:408`, `ui/station/screens/bar.js:706`, `ui/station/screens/contracts.js:1414` | `systems/missions.js:1375` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:4547` | `systems/ships.js:1674` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:1432` |
| `ui:buyModule` | — | `systems/onboarding.js:620`, `systems/ships.js:1667` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:5008` | `systems/bombs.js:637` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:4733` | `systems/ships.js:1653` |
| `ui:cancel` | `ui/input.js:1039`, `ui/input.js:1054` | — |
| `ui:clearTarget` | `ui/input.js:430` | `ui/uiRoot.js:1178` |
| `ui:closeAll` | `main.js:1137`, `ui/screens/crucible.js:3400`, `ui/screens/crucible.js:3413` | `ui/uiRoot.js:1176` |
| `ui:closeCargo` | `ui/input.js:260`, `ui/input.js:392` | `ui/hud.js:4232` |
| `ui:closeComms` | `ui/input.js:387` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1170` |
| `ui:confirm` | `ui/input.js:1049` | `audio/audioSystem.js:2772` |
| `ui:cycleComponent` | `ui/targetPanel.js:599`, `ui/targetPanel.js:603` | `ui/uiRoot.js:1182` |
| `ui:cycleTarget` | `ui/input.js:426`, `ui/input.js:1118` | `ui/uiRoot.js:1177` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:4593` | `systems/ships.js:1675` |
| `ui:endgameChoose` | `systems/missions.js:3663`, `ui/station/barContacts.js:968` | `systems/story.js:221` |
| `ui:endgameConfirm` | — | `systems/story.js:222` |
| `ui:endgameDecline` | `ui/comms.js:450` | `systems/story.js:223` |
| `ui:endgameDepartAshfall` | `ui/comms.js:467` | `systems/story.js:232` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2225` | `systems/story.js:229` |
| `ui:endgameStayAshfall` | `ui/comms.js:468` | `systems/story.js:233` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2229` | `systems/story.js:230` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:231` |
| `ui:endingArchiveOpen` | `ui/screens/pause.js:966` | `systems/story.js:225` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | `systems/routeFollower.js:363` |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:81` | `systems/factionPresence.js:454` |
| `ui:fitModule` | — | `systems/onboarding.js:617`, `systems/ships.js:1668` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:5018` | `systems/bombs.js:638` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1556` | `systems/automation.js:544`, `systems/wingmen.js:143` |
| `ui:globalFind` | `ui/input.js:309`, `ui/input.js:371` | `ui/globalFind.js:183` |
| `ui:heliosBay7Scan` | — | `systems/story.js:272` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:214` | `systems/story.js:271` |
| `ui:navigate` | `ui/input.js:1025`, `ui/input.js:1030`, `ui/input.js:1096` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2954`, `ui/screens/achievements.js:212`, `ui/screens/automationPanel.js:860`, `ui/screens/clips.js:348`, `ui/screens/credits.js:177`, `ui/screens/crucible.js:2211`, `ui/screens/crucibleDraft.js:1513`, `ui/screens/demoEnd.js:194`, `ui/screens/replay.js:289`, `ui/screens/starmap.js:679`, `ui/screens/techTree.js:278` | `ui/uiRoot.js:1166` |
| `ui:prepareBombRack` | `systems/ships.js:2757`, `ui/station/screens/shipworks.js:4652` | `systems/bombs.js:648` |
| `ui:previewBombRackPreparation` | `systems/ships.js:2687`, `ui/station/screens/shipworks.js:3628`, `ui/station/screens/shipworks.js:4608` | `systems/bombs.js:645` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:690` | `systems/world.js:625` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:760` | `systems/world.js:624` |
| `ui:pushScreen` | `main.js:496`, `systems/onboarding.js:913`, `systems/story.js:1378`, `ui/mapAuthority.js:133`, `ui/screens/base.js:1285`, `ui/screens/crucible.js:3414`, `ui/screens/crucibleDraft.js:792`, `ui/screens/gameOver.js:474`, `ui/screens/starmap.js:687`, `ui/signalInvestigationPrompt.js:169`, `ui/station/barContacts.js:695`, `ui/station/screens/bar.js:723`, `ui/station/screens/industry.js:490`, `ui/station/stationApp.js:516` | `ui/uiRoot.js:1143` |
| `ui:replaceScreen` | `ui/screens/crucible.js:3361`, `ui/screens/crucible.js:3388`, `ui/screens/demoEnd.js:223`, `ui/screens/motionAsk.js:105` | `ui/uiRoot.js:1175` |
| `ui:restockBombRack` | — | `systems/bombs.js:641` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:4519` | `systems/ships.js:1673` |
| `ui:screenTop` | `ui/screenManager.js:343` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:1433` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:5028` | `systems/bombs.js:640` |
| `ui:service` | `balance/careerCohorts.js:726`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:439`, `ui/station/stationApp.js:924`, `ui/station/stationApp.js:960` | `systems/economy.js:1495` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:4738`, `ui/station/screens/shipworks.js:4856` | `systems/ships.js:1666` |
| `ui:setCourse` | `systems/borrowedSun.js:197`, `systems/factionPresence.js:1332`, `systems/ilexArk.js:33`, `systems/missions.js:4359`, `systems/palletJack.js:279`, `systems/redKite.js:61`, `systems/scanner.js:1534`, `systems/scanner.js:1566`, `systems/tallyThree.js:115`, `systems/towlineTable.js:33`, `ui/galaxyMap.js:2605`, `ui/galaxyMap.js:2620`, `ui/galaxyMap.js:7960`, `ui/market/tradeLogic.js:487`, `ui/radar.js:1553`, `ui/screens/footprint.js:1633`, `ui/screens/footprint.js:1644`, `ui/screens/localmap.js:1158`, `ui/screens/starmap.js:1564`, `ui/screens/starmap.js:1577`, `ui/screens/starmap.js:1581` | `systems/world.js:584` |
| `ui:setShipAppearance` | `ui/station/screens/shipworks.js:4434` | `systems/ships.js:1677` |
| `ui:setShipName` | `ui/station/screens/shipworks.js:4763` | `systems/ships.js:1680` |
| `ui:talkContact` | — | `systems/story.js:273` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:65`, `combat/autoTargetMode.js:246` | `ui/uiRoot.js:1183` |
| `ui:toggleCargo` | `ui/input.js:493` | `ui/hud.js:4231` |
| `ui:toggleComms` | `ui/input.js:512` | — |
| `ui:toggleOverview` | `ui/input.js:499` | `ui/hud.js:4761` |
| `ui:trackMission` | `ui/galaxyMap.js:4435`, `ui/screens/missionLog.js:2221`, `ui/screens/missionLog.js:2293`, `ui/screens/missionLog.js:2354`, `ui/station/screens/contracts.js:1454` | `systems/missions.js:1380` |
| `ui:transferParkedCargo` | `ui/station/screens/shipworks.js:4877` | — |
| `ui:undock` | — | `ui/input.js:789` |
| `ui:unfitModule` | — | `systems/ships.js:1669` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:5038` | `systems/bombs.js:639` |
| `ui:unlockTech` | `ui/screens/techTree.js:636` | `systems/ships.js:1676` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:4722` | `systems/bombs.js:642` |
| `ui:wingOrder` | `ui/wingmanRadial.js:258` | `systems/automation.js:545` |
| `ui:wingmanRadial` | `ui/input.js:505` | `ui/wingmanRadial.js:329` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:380` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:318` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:239` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1567` | `systems/missions.js:1566`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:choose` | `systems/missions.js:5650`, `systems/uniqueWreckEncounterScripts.js:123`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:898` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:919`, `systems/uniqueWrecks.js:1085`, `systems/uniqueWrecks.js:1273` | `systems/missions.js:1567` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1633` | `systems/missions.js:1569`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1132` | `systems/missions.js:1568` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1162` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:648`, `systems/uniqueWrecks.js:1087` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1812` | `systems/missions.js:1570`, `systems/traffic.js:1633`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `systems/traffic.js:4321`, `ui/station/screens/bar.js:740` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:769` | `systems/missions.js:1565` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1813` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1546` | `systems/world.js:630` |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1743` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1479`, `ui/bandHud.js:88` |
| `verb:used` | `systems/onboarding.js:3163` | — |
| `vesper:met` | `systems/vesper.js:172` | — |
| `vesper:note` | `systems/vesper.js:214` | — |
| `vesper:performance` | `systems/vesper.js:238` | — |
| `vesper:phraseProgress` | `systems/vesper.js:230` | — |
| `vesper:voice` | `systems/vesper.js:156` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:6467` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:594` |
| `vestaOreCache:clueRecovered` | `systems/world.js:6288` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:6319` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:6430` | — |
| `vestaOreCache:resolved` | `systems/world.js:6387` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:398`, `ui/voiceArbiter.js:442` | `ui/alerts.js:427` |
| `voice:dismiss` | `ui/bindings.js:77`, `ui/input.js:379` | `ui/voiceArbiter.js:337` |
| `voice:say` | `audio/audioSystem.js:4623`, `systems/achievements.js:949`, `systems/mines.js:97`, `systems/survivalAnnounce.js:387`, `systems/survivalAnnounce.js:658`, `systems/world.js:716`, `systems/world.js:738`, `ui/alerts.js:318`, `ui/hud.js:596` | `ui/voiceArbiter.js:336` |
| `voice:surface` | `ui/voiceArbiter.js:403`, `ui/voiceArbiter.js:452` | `systems/barkDirector.js:603`, `systems/story.js:167`, `ui/alerts.js:426` |
| `watch:changed` | `ui/entityLinks.js:237`, `ui/entityLinks.js:281` | `ui/watchlistHud.js:89` |
| `weapons:inertialShunt` | `systems/weapons.js:386` | — |
| `weapons:mineArmed` | `systems/weapons.js:1800` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1757` | `render/vfx.js:2559` |
| `weapons:mineDetonated` | `systems/weapons.js:1930` | — |
| `weapons:mineExpired` | `systems/weapons.js:1794` | `render/vfx.js:2560`, `systems/presentationOrchestrator.js:276` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:366` | `audio/audioSystem.js:2410` |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1441` | `audio/audioSystem.js:2411` |
| `weapons:vent` | `systems/weapons.js:788`, `systems/weapons.js:808` | `audio/audioSystem.js:2501`, `render/shipMicroMotion.js:1296`, `render/vfx.js:2597`, `systems/ships.js:1724`, `ui/hud.js:4304` |
| `web:linked` | `combat/tetherWebs.js:143` | — |
| `well:capture` | `systems/fields.js:2251` | — |
| `well:fling` | `systems/fields.js:2176` | — |
| `well:grind` | `systems/fields.js:1948` | `systems/impulseCharges.js:276` |
| `wingMorale:broken` | `systems/wingMorale.js:284` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:393` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:421` | — |
| `wingOrder:accepted` | `systems/automation.js:2157` | `systems/wingmen.js:144` |
| `wingOrder:blocked` | `systems/automation.js:2158` | `ui/wingmanRadial.js:336` |
| `wingOrder:converted` | `systems/wingmen.js:471` | `ui/wingmanRadial.js:342` |
| `wingOrder:status` | `systems/automation.js:2159` | `ui/wingmanRadial.js:346` |
| `world:abortJumpCharge` | `systems/story.js:935`, `ui/comms.js:459` | `systems/world.js:581` |
| `world:confirmUnfiledJump` | `systems/story.js:231` | `systems/world.js:580` |
| `world:criticalSpawnDeferred` | `systems/world.js:1975`, `systems/world.js:4030` | — |
| `world:farActorRestored` | `world/farActorTable.js:935` | `systems/npcJobsRuntime.js:977`, `systems/traffic.js:1616` |
| `world:farActorShelved` | `world/farActorTable.js:881` | `systems/npcJobsRuntime.js:976`, `systems/traffic.js:1615` |
| `world:membership` | `systems/world.js:1055` | `systems/presentationOrchestrator.js:182` |
| `world:originShift` | `systems/world.js:5083` | — |
| `world:playerRelocated` | `systems/world.js:4176` | `core/coreSystem.js:318`, `render/vfx.js:2583` |
| `world:requestJump` | `systems/story.js:919`, `ui/galaxyMap.js:2599`, `ui/screens/starmap.js:1576` | `systems/world.js:578` |
| `world:requestRoute` | `ui/galaxyMap.js:2618`, `ui/galaxyMap.js:4452`, `ui/galaxyMap.js:7958`, `ui/screens/starmap.js:1563`, `ui/screens/starmap.js:1580` | `systems/world.js:582` |
| `world:requestSectorScan` | `ui/galaxyMap.js:6331` | `systems/world.js:583` |
| `world:requestUnfiledJump` | `systems/story.js:887` | `systems/world.js:579` |
| `world:residency` | `systems/world.js:1248`, `systems/world.js:1291`, `systems/world.js:2182` | — |
| `world:spawnLimited` | `systems/world.js:3950` | — |
| `world:stuckCleared` | `systems/world.js:5989` | — |
| `world:stuckTowAccept` | `ui/stuckTowPrompt.js:52` | `systems/world.js:666` |
| `world:stuckTowOffer` | `systems/world.js:6022` | `ui/stuckTowPrompt.js:23` |
| `world:zoneEntered` | `systems/world.js:5110` | `data/hazardLanguage.js:140` |
| `world:zoneExited` | `systems/world.js:5113` | `data/hazardLanguage.js:141` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:1049` | `systems/presentationOrchestrator.js:290` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:934` | `systems/presentationOrchestrator.js:291`, `systems/traffic.js:1728` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2767` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1341` | `systems/barkDirector.js:617` |
| `wreckEcology:rivalPressured` | `systems/aftermathWrecks.js:1302` | `systems/barkDirector.js:616` |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1384` | `systems/barkDirector.js:615` |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:2477` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2689` | `systems/npcJobsRuntime.js:1007` |
| `wreckField:source` | `systems/factionPresence.js:824`, `systems/salvage.js:547`, `systems/uniqueWrecks.js:1448` | `systems/aftermathWrecks.js:995` |
| `wreckMission:choiceApplied` | `systems/missions.js:6084` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:145` | `systems/missions.js:1549` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 3 subscriber(s)
- `achievement:unlocked` — 1 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `alienEcology:blackBoxRecovered` — 1 subscriber(s)
- `alienEcology:nurseryBloom` — 1 subscriber(s)
- `alienEcology:nurseryPowered` — 1 subscriber(s)
- `alienEcology:relaySevered` — 1 subscriber(s)
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
- `drone:grindStop` — 1 subscriber(s)
- `encounter:predationTelegraph` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
- `gyre:absorbTick` — 1 subscriber(s)
- `gyre:ballGrave` — 1 subscriber(s)
- `gyre:beamOn` — 1 subscriber(s)
- `gyre:dropped` — 1 subscriber(s)
- `gyre:full` — 1 subscriber(s)
- `gyre:fuseLow` — 1 subscriber(s)
- `gyre:snagged` — 1 subscriber(s)
- `gyre:strained` — 1 subscriber(s)
- `gyre:thrown` — 1 subscriber(s)
- `gyre:windup` — 1 subscriber(s)
- `heat:clear` — 1 subscriber(s)
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
- `recovery:completed` — 1 subscriber(s)
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
- `ships:grantModule` — 1 subscriber(s)
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
- `survivorPod:rescued` — 2 subscriber(s)
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
- `ui:talkContact` — 1 subscriber(s)
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
- `automation:assetResumed` — 1 emitter(s)
- `automation:incomeCredited` — 3 emitter(s)
- `automation:traderCycleCompleted` — 1 emitter(s)
- `band:bearingRequest` — 1 emitter(s)
- `band:bearingUnavailable` — 3 emitter(s)
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
- `camera:shake` — 17 emitter(s)
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
- `cloak:burned` — 1 emitter(s)
- `combat:actionCancelled` — 1 emitter(s)
- `combat:actionCompleted` — 1 emitter(s)
- `combat:actionPhase` — 1 emitter(s)
- `combat:kill` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `combat:warded` — 1 emitter(s)
- `comms:message` — 2 emitter(s)
- `conflict:frontAction` — 1 emitter(s)
- `conflict:warDeclared` — 1 emitter(s)
- `contactHail:availability` — 2 emitter(s)
- `contactHail:clear` — 1 emitter(s)
- `contactHail:handoff` — 1 emitter(s)
- `contactHail:offer` — 1 emitter(s)
- `countermeasure:denied` — 1 emitter(s)
- `danger:miningNoise` — 1 emitter(s)
- `detonator:detonated` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `distress:call` — 1 emitter(s)
- `dock:committed` — 1 emitter(s)
- `ecology:claimCrew` — 1 emitter(s)
- `ecology:coherence` — 1 emitter(s)
- `ecology:relayPulse` — 1 emitter(s)
- `ecology:setpiece` — 2 emitter(s)
- `economy:debtEscalated` — 1 emitter(s)
- `economy:demandShift` — 1 emitter(s)
- `economy:eventEnded` — 1 emitter(s)
- `encounter:claimDefenseRoster` — 1 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:hostileCommitted` — 3 emitter(s)
- `encounter:namedCaptainDefeated` — 2 emitter(s)
- `encounter:predationCleared` — 1 emitter(s)
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
- `massline:bridleCut` — 1 emitter(s)
- `massline:bridleEnded` — 3 emitter(s)
- `massline:bridleEndpointSelected` — 1 emitter(s)
- `massline:bridleLinked` — 1 emitter(s)
- `massline:bridleSetupEnded` — 1 emitter(s)
- `massline:cadenceChanged` — 1 emitter(s)
- `massline:npcLineCut` — 1 emitter(s)
- `massline:recovered` — 1 emitter(s)
- `massline:recovering` — 1 emitter(s)
- `massline:releaseWindow` — 1 emitter(s)
- `massline:rideStarted` — 1 emitter(s)
- `mines:detonated` — 1 emitter(s)
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:podSplit` — 1 emitter(s)
- `mining:ventBonus` — 1 emitter(s)
- `mission:gateCleared` — 1 emitter(s)
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
- `news:headline` — 8 emitter(s)
- `news:publish` — 26 emitter(s)
- `news:render` — 1 emitter(s)
- `npcJobs:towAssistComplete` — 1 emitter(s)
- `npcjobs:closeCall` — 1 emitter(s)
- `npcjobs:crewResponse` — 1 emitter(s)
- `npcjobs:distress` — 1 emitter(s)
- `npcjobs:lotReplaced` — 1 emitter(s)
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
- `save:backup` — 1 emitter(s)
- `scan:wreckInvestigated` — 1 emitter(s)
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
- `ship:loadoutPresetApplied` — 1 emitter(s)
- `ship:loadoutPresetApplyRejected` — 3 emitter(s)
- `ship:loadoutPresetDeleted` — 1 emitter(s)
- `ship:loadoutPresetSaved` — 1 emitter(s)
- `ship:nameChanged` — 1 emitter(s)
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
- `station:holding` — 1 emitter(s)
- `station:navigate` — 5 emitter(s)
- `station:yardChanged` — 1 emitter(s)
- `stationContact:changed` — 4 emitter(s)
- `stationContact:counterChanged` — 2 emitter(s)
- `stationContact:counterDelta` — 1 emitter(s)
- `stationLife:deedNoticed` — 1 emitter(s)
- `stationLife:trafficChanged` — 2 emitter(s)
- `story:continuationAccess` — 1 emitter(s)
- `story:vergeObserversRevealed` — 1 emitter(s)
- `survivalArena:rosterPrewarm` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:resolved` — 1 emitter(s)
- `swarm:event` — 1 emitter(s)
- `swarm:eventTelegraphed` — 1 emitter(s)
- `terrainAnchors:replenished` — 1 emitter(s)
- `tether:couplerLock` — 1 emitter(s)
- `tether:cutDenied` — 1 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:snagCleared` — 1 emitter(s)
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
- `weapons:inertialShunt` — 1 emitter(s)
- `weapons:mineArmed` — 1 emitter(s)
- `weapons:mineDetonated` — 1 emitter(s)
- `web:linked` — 1 emitter(s)
- `well:capture` — 1 emitter(s)
- `well:fling` — 1 emitter(s)
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
