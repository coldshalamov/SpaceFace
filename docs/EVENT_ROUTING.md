# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-10-03 · 1091 events · 3983 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:373`, `systems/encounterDirector.js:296`, `ui/discoveryPlate.js:140` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:1888` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:771` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:1870` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2168` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:803` | `render/vfx.js:2549`, `systems/salvage.js:135` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1444` | `ui/galaxyMap.js:1768` |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:1957` | `systems/lawSecurity.js:317`, `systems/salvage.js:136` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:166` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:501` | `systems/presentationOrchestrator.js:167`, `systems/tetherGameplay.js:271`, `ui/threatHalo.js:797` |
| `ai:egressExit` | `ai/egressExit.js:74` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:244` | — |
| `ai:flee` | `systems/ai.js:265`, `systems/traffic.js:5821`, `systems/wingMorale.js:326` | `render/authoredMotion.js:917`, `render/vfx.js:2607`, `systems/barkDirector.js:475`, `systems/combatOutcome.js:159`, `systems/encounterDirector.js:313`, `systems/presentationOrchestrator.js:168` |
| `ai:formationBroken` | `systems/ai.js:441`, `systems/wingMorale.js:276` | `render/vfx.js:2608` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:477` |
| `ai:stateChange` | `systems/ai.js:262` | `render/authoredMotion.js:934`, `systems/combatOutcome.js:185` |
| `ai:telegraph` | `systems/ai.js:337`, `systems/encounterScripts.js:171`, `systems/encounterScripts.js:1075`, `systems/masslineSnares.js:340`, `systems/mines.js:150`, `systems/tacticalAI.js:486` | `audio/audioSystem.js:2472`, `render/authoredMotion.js:916`, `render/vfx.js:2606`, `systems/presentationOrchestrator.js:165`, `systems/survivalResults.js:494`, `ui/hud.js:2964`, `ui/survivalHud.js:226`, `ui/threatHalo.js:793` |
| `aiTrader:requestTrade` | `systems/traffic.js:7782` | `systems/economy.js:1421` |
| `alienEcology:blackBoxRecovered` | — | `systems/world.js:647` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:671` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:1216` | `systems/world.js:653` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:646` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:644` |
| `alienEcology:relaySevered` | — | `systems/world.js:645` |
| `alienEcology:vented` | `systems/alienEcology.js:1282` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | `systems/story.js:156` |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | `systems/story.js:157` |
| `anomaly:bearing` | `systems/scanner.js:1193` | `systems/presentationOrchestrator.js:197` |
| `anomaly:triangulated` | `systems/scanner.js:1211` | `systems/world.js:587` |
| `asset:deployed` | `systems/automation.js:2159`, `systems/automation.js:2234`, `systems/automation.js:2327`, `systems/claims.js:581` | `systems/missions.js:1516`, `systems/onboarding.js:621`, `systems/story.js:237` |
| `asteroid:chunked` | `systems/mining.js:2141` | `render/asteroidMotionPresentation.js:454`, `render/authoredMotion.js:932`, `render/vfx.js:2580`, `systems/presentationOrchestrator.js:210` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1071`, `systems/mining.js:975` | `audio/audioSystem.js:2388`, `render/authoredMotion.js:931`, `render/vfx.js:2579`, `systems/fieldDepletion.js:703`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:471`, `render/shipMicroMotion.js:2255`, `render/vfx.js:2635`, `render/vfx.js:5796`, `render/vfx.js:10457`, `render/vfx.js:11593`, `systems/ai.js:717`, `systems/alienEcology.js:350`, `systems/barkDirector.js:1399`, `systems/beacons.js:60`, `systems/beacons.js:65`, `systems/beacons.js:97`, `systems/bombs.js:1019`, `systems/bombs.js:1142`, `systems/bombs.js:1382`, `systems/bracket.js:125`, `systems/bulletTime.js:194`, `systems/bulletTime.js:210`, `systems/bulletTime.js:296`, `systems/cargo.js:997`, `systems/cargo.js:1020`, `systems/claims.js:428`, `systems/claims.js:513`, `systems/claims.js:558`, `systems/claims.js:1583`, `systems/claims.js:2320`, `systems/cloak.js:195`, `systems/cloak.js:208`, `systems/countermeasures.js:522`, `systems/countermeasures.js:558`, `systems/crafting.js:338`, `systems/crafting.js:348`, `systems/eighthBellRuntime.js:104`, `systems/eighthBellRuntime.js:119`, `systems/fields.js:837`, `systems/fields.js:1135`, `systems/fields.js:1266`, `systems/fields.js:1539`, `systems/flybyFocus.js:519`, `systems/hullBurst.js:217`, `systems/hullBurst.js:351`, `systems/hullBurst.js:375`, `systems/hullBurst.js:489`, `systems/hullBurst.js:564`, `systems/hullFracture.js:324`, `systems/hullFracture.js:426`, `systems/impulseCharges.js:696`, `systems/impulseCharges.js:803`, `systems/impulseCharges.js:1024`, `systems/impulseCharges.js:1230`, `systems/impulseCharges.js:1343`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:161`, `systems/massSeed.js:539`, `systems/massSeed.js:582`, `systems/masslineThrow.js:240`, `systems/masslineThrow.js:544`, `systems/masslineThrow.js:631`, `systems/mining.js:731`, `systems/mining.js:2229`, `systems/morrow.js:160`, `systems/precursorMachines.js:353`, `systems/precursorMachines.js:430`, `systems/presentationAdapters.js:566`, `systems/presentationOrchestrator.js:502`, `systems/ravel.js:96`, `systems/salvage.js:879`, `systems/salvage.js:966`, `systems/salvage.js:1016`, `systems/tacticalAI.js:668`, `systems/tumbleStates.js:474`, `systems/tumbleStates.js:544`, `systems/vesper.js:196`, `systems/volatileExposure.js:499`, `systems/volatileExposure.js:573`, `systems/weapons.js:1823`, `ui/commsRadial.js:539`, `ui/commsRadial.js:584`, `ui/commsRadial.js:769`, `ui/commsRadial.js:800`, `ui/hud.js:2387`, `ui/hud.js:3741`, `ui/hud.js:3978`, `ui/hud.js:4038`, `ui/hud.js:4080`, `ui/hud.js:4099`, `ui/hud.js:4197`, `ui/hud.js:4342`, `ui/hud.js:4634`, `ui/input.js:195`, `ui/input.js:224`, `ui/input.js:295`, `ui/input.js:333`, `ui/input.js:339`, `ui/input.js:398`, `ui/input.js:457`, `ui/input.js:463`, `ui/input.js:469`, `ui/input.js:475`, `ui/input.js:686`, `ui/input.js:893`, `ui/input.js:898`, `ui/input.js:916`, `ui/input.js:921`, `ui/input.js:1014`, `ui/input.js:1035`, `ui/input.js:1043`, `ui/input.js:1049`, `ui/input.js:1091`, `ui/input.js:1102`, `ui/input.js:1106`, `ui/input.js:1119`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:489`, `ui/screens/base.js:1187`, `ui/screens/base.js:1437`, `ui/screens/missionLog.js:2162`, `ui/screens/missionLog.js:2166`, `ui/screens/missionLog.js:2170`, `ui/screens/missionLog.js:2174`, `ui/screens/missionLog.js:2190`, `ui/screens/missionLog.js:2198`, `ui/screens/missionLog.js:2205`, `ui/screens/missionLog.js:2212`, `ui/screens/missionLog.js:2220`, `ui/screens/missionLog.js:2227`, `ui/screens/missionLog.js:2234`, `ui/screens/missionLog.js:2243`, `ui/screens/missionLog.js:2250`, `ui/screens/missionLog.js:2266`, `ui/screens/missionLog.js:2297`, `ui/screens/missionLog.js:2317`, `ui/shipLedgerPanel.js:310`, `ui/shipLedgerPanel.js:317`, `ui/shipLedgerPanel.js:324`, `ui/station/screens/bar.js:574`, `ui/station/screens/bar.js:661`, `ui/station/screens/bar.js:665`, `ui/station/screens/bar.js:669`, `ui/station/screens/bar.js:691`, `ui/station/screens/bar.js:707`, `ui/station/screens/bar.js:736`, `ui/station/screens/bar.js:761`, `ui/station/screens/bar.js:770`, `ui/station/screens/contracts.js:1365`, `ui/station/screens/contracts.js:1376`, `ui/station/screens/contracts.js:1412`, `ui/station/screens/contracts.js:1415`, `ui/station/screens/contracts.js:1454`, `ui/station/screens/factions.js:361`, `ui/station/screens/industry.js:417`, `ui/station/screens/industry.js:458`, `ui/station/screens/industry.js:483`, `ui/station/screens/industry.js:491`, `ui/station/screens/industry.js:497`, `ui/station/screens/industry.js:507`, `ui/station/screens/market.js:870`, `ui/station/screens/market.js:1550`, `ui/station/screens/market.js:1619`, `ui/station/screens/market.js:1627`, `ui/station/screens/market.js:1669`, `ui/station/screens/market.js:1681`, `ui/station/screens/market.js:1877`, `ui/station/screens/shipworks.js:624`, `ui/station/screens/shipworks.js:3396`, `ui/station/screens/shipworks.js:4332`, `ui/station/screens/shipworks.js:4403`, `ui/station/screens/shipworks.js:4420`, `ui/station/screens/shipworks.js:4433`, `ui/station/screens/shipworks.js:4437`, `ui/station/screens/shipworks.js:4442`, `ui/station/screens/shipworks.js:4472`, `ui/station/screens/shipworks.js:4490`, `ui/station/screens/shipworks.js:4526`, `ui/station/screens/shipworks.js:4548`, `ui/station/screens/shipworks.js:4550`, `ui/station/screens/shipworks.js:4568`, `ui/station/screens/shipworks.js:4617`, `ui/station/screens/shipworks.js:4627`, `ui/station/screens/shipworks.js:4633`, `ui/station/screens/shipworks.js:4658`, `ui/station/screens/shipworks.js:4669`, `ui/station/screens/shipworks.js:4676`, `ui/station/screens/shipworks.js:4718`, `ui/station/screens/shipworks.js:4725`, `ui/station/screens/shipworks.js:4736`, `ui/station/screens/shipworks.js:4746`, `ui/station/screens/shipworks.js:4751`, `ui/station/screens/shipworks.js:4759`, `ui/station/screens/shipworks.js:4768`, `ui/station/screens/shipworks.js:4775`, `ui/station/screens/shipworks.js:4888`, `ui/station/screens/shipworks.js:4898`, `ui/station/screens/shipworks.js:4908`, `ui/station/screens/shipworks.js:4918`, `ui/station/screens/shipworks.js:4971`, `ui/station/screens/shipworks.js:5008`, `ui/station/screens/shipworks.js:5012`, `ui/station/screens/shipworks.js:5030`, `ui/station/screens/shipworks.js:5034`, `ui/station/screens/shipworks.js:5039`, `ui/station/stationApp.js:640`, `ui/station/stationApp.js:916`, `ui/station/stationApp.js:952`, `ui/uiRoot.js:1308`, `ui/wingmanRadial.js:203`, `ui/wingmanRadial.js:225`, `ui/wingmanRadial.js:250`, `ui/wingmanRadial.js:287`, `ui/wingmanRadial.js:312` | `audio/audioSystem.js:2567` |
| `automation:assetDistressed` | `systems/automation.js:1905` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2430` | `systems/intervention.js:70`, `systems/lossLedger.js:377`, `systems/missions.js:1518` |
| `automation:assetRepossessed` | `systems/automation.js:1937` | `ui/automationPayoff.js:90` |
| `automation:assetResumed` | `systems/automation.js:2275` | — |
| `automation:incomeCredited` | `systems/automation.js:1968`, `systems/automation.js:1979`, `systems/automation.js:2709` | — |
| `automation:offlineSummary` | `systems/automation.js:2468`, `systems/automation.js:2492`, `systems/automation.js:2516`, `systems/automation.js:2539`, `systems/automation.js:2756` | `ui/automationPayoff.js:80`, `ui/dockArrival.js:69` |
| `automation:outpostRaided` | `systems/automation.js:1832`, `systems/automation.js:2831` | `systems/lossLedger.js:378` |
| `automation:programAssigned` | `systems/automation.js:2114` | `systems/missions.js:1517` |
| `automation:traderCycleCompleted` | `systems/automation.js:1590` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:578` | `systems/presentationOrchestrator.js:198` |
| `band:bearingRequest` | `systems/bandRadio.js:551` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:794`, `systems/uniqueWrecks.js:837` | `render/authoredMotion.js:905` |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:801`, `systems/uniqueWrecks.js:809`, `systems/uniqueWrecks.js:823` | — |
| `band:bed` | `systems/bandRadio.js:635` | `audio/audioSystem.js:2690` |
| `band:cycle` | `ui/bandHud.js:83`, `ui/input.js:355` | — |
| `band:status` | `systems/bandRadio.js:617` | `ui/bandHud.js:87` |
| `barkDirector:voice` | — | `audio/audioSystem.js:2647` |
| `beacon:deploy` | — | `systems/beacons.js:43` |
| `beacon:deployed` | `systems/beacons.js:92` | `render/shipMicroMotion.js:1305`, `systems/onboarding.js:779` |
| `beam:denied` | `systems/mining.js:394`, `systems/mining.js:437`, `systems/mining.js:451`, `systems/mining.js:461`, `systems/mining.js:493` | `render/authoredMotion.js:877` |
| `beam:repaired` | `systems/mining.js:554` | — |
| `beam:transferred` | `systems/mining.js:608` | — |
| `bombs:armed` | `systems/bombs.js:1077` | `audio/bombAudio.js:440` |
| `bombs:commanded` | `systems/bombs.js:1032` | — |
| `bombs:cycle` | `systems/bombs.js:696`, `systems/bombs.js:1010` | `audio/bombAudio.js:469` |
| `bombs:denied` | `systems/bombs.js:572`, `systems/bombs.js:689`, `systems/bombs.js:713`, `systems/bombs.js:750`, `systems/bombs.js:789`, `systems/bombs.js:814`, `systems/bombs.js:955`, `systems/bombs.js:969` | — |
| `bombs:destroyed` | `systems/bombs.js:1379` | `audio/bombAudio.js:441`, `render/vfx.js:2605` |
| `bombs:detonated` | `systems/bombs.js:1135` | `audio/bombAudio.js:444`, `render/vfx.js:2603` |
| `bombs:dropped` | `systems/bombs.js:1018` | `audio/bombAudio.js:438`, `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:638` |
| `bombs:fieldEnded` | `systems/bombs.js:1292` | `audio/bombAudio.js:452`, `render/vfx.js:2604` |
| `bombs:primed` | `systems/bombs.js:1044` | `audio/bombAudio.js:439` |
| `bombs:rackChanged` | `systems/bombs.js:916` | `audio/bombAudio.js:474` |
| `bombs:redirected` | `systems/bombs.js:1345` | — |
| `bombs:released` | `systems/bombs.js:1400` | `audio/bombAudio.js:455` |
| `bombs:stockChanged` | `systems/bombs.js:720`, `systems/bombs.js:838`, `systems/bombs.js:1015` | — |
| `boss:defeated` | `systems/world.js:919` | `systems/survivalAnnounce.js:332` |
| `bounty:cleared` | `systems/economy.js:3115` | `systems/heat.js:340` |
| `bounty:cooled` | `systems/heat.js:618` | `systems/barkDirector.js:497` |
| `bracket:bank` | `systems/bracket.js:182` | — |
| `bracket:matchFinished` | `systems/bracket.js:239` | — |
| `bracket:matchStarted` | `systems/bracket.js:143` | — |
| `bracket:save` | `systems/bracket.js:188` | — |
| `bracket:shotResolved` | `systems/bracket.js:227` | — |
| `bracket:voice` | `systems/bracket.js:123` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:327` | `audio/audioSystem.js:2462` |
| `bulletTime:end` | `systems/bulletTime.js:209` | `audio/audioSystem.js:2689` |
| `bulletTime:start` | `systems/bulletTime.js:193` | `audio/audioSystem.js:2686`, `systems/onboarding.js:738` |
| `camera:shake` | `render/shipMicroMotion.js:2253`, `render/vfx.js:6058`, `render/vfx.js:6358`, `render/vfx.js:6704`, `systems/combat.js:751`, `systems/combat.js:911`, `systems/combat.js:1094`, `systems/combat.js:1177`, `systems/drill.js:1634`, `systems/flybyFocus.js:518`, `systems/intervention.js:224`, `systems/presentationAdapters.js:479`, `systems/survivalAnnounce.js:555`, `systems/tetherGameplay.js:595` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:529`, `ui/input.js:530`, `ui/input.js:762` | — |
| `capitalBoss:detach` | `systems/missions.js:1533` | — |
| `capitalBoss:start` | `systems/missions.js:6213` | `systems/swarmJuice.js:101` |
| `capitalBoss:telegraph` | — | `render/authoredMotion.js:933` |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:110`, `systems/capitalBossEncounters.js:132` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:788` | `systems/world.js:589` |
| `cargo:changed` | `systems/cargo.js:322`, `systems/mining.js:2459` | `systems/ships.js:1594`, `ui/cargoConscience.js:142`, `ui/commandBar.js:412`, `ui/hud.js:4111`, `ui/hud.js:4140`, `ui/hudMeta.js:192` |
| `cargo:delivered` | `systems/missions.js:7146`, `systems/missions.js:7205`, `systems/missions.js:7300`, `systems/missions.js:7350` | `systems/economy.js:1433` |
| `cargo:fragileLost` | `systems/fragileCargo.js:200` | — |
| `cargo:full` | `systems/cargo.js:421`, `systems/mining.js:1475`, `systems/mining.js:2437` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:571`, `systems/presentationOrchestrator.js:218`, `ui/alerts.js:477`, `ui/floatingText.js:311` |
| `cargo:hotDockSpill` | `systems/cargo.js:956` | — |
| `cargo:jettison` | `ui/hud.js:3749` | `ui/hud.js:4043` |
| `cargo:jettisoned` | `systems/cargo.js:1103` | `audio/audioSystem.js:2438`, `render/authoredMotion.js:942`, `render/shipMicroMotion.js:1303`, `systems/barkDirector.js:485`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:720`, `systems/onboarding.js:784` |
| `cargo:massSettled` | `systems/cargo.js:679` | `systems/presentationOrchestrator.js:217`, `systems/ships.js:1595` |
| `cargo:parkedHoldSwapped` | `systems/cargo.js:833` | — |
| `cargo:parkedTransfer` | `systems/cargo.js:895` | — |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:958` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:994` | — |
| `cargo:volatileExposed` | `systems/volatileExposure.js:383` | — |
| `cargo:volatileRupture` | `systems/volatileExposure.js:553` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:878`, `systems/lootShards.js:934` | `systems/volatileExposure.js:217` |
| `cargo:volatileVent` | `systems/volatileExposure.js:477` | — |
| `chain:detonated` | `systems/impulseCharges.js:1004` | `systems/fields.js:499` |
| `chain:primeEnded` | `systems/impulseCharges.js:967` | — |
| `chain:primed` | `systems/impulseCharges.js:944` | — |
| `chain:slam` | `systems/impulseCharges.js:878`, `systems/impulseCharges.js:898` | `systems/fields.js:498` |
| `chain:tetherShare` | `systems/tetherGameplay.js:986`, `systems/tetherGameplay.js:2154` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:1226` | `systems/onboarding.js:746` |
| `charge:armed` | `systems/impulseCharges.js:1041` | — |
| `charge:combo` | `systems/impulseCharges.js:1268`, `systems/impulseCharges.js:1327` | — |
| `charge:detonated` | `systems/impulseCharges.js:688`, `systems/impulseCharges.js:795`, `systems/impulseCharges.js:1016`, `systems/impulseCharges.js:1335` | `audio/audioSystem.js:2486`, `render/feel.js:1369`, `render/vfx.js:2601`, `systems/fields.js:500`, `systems/gamepad.js:800` |
| `charge:stuck` | `systems/impulseCharges.js:1118` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1302` |
| `charge:thrown` | `systems/impulseCharges.js:1213` | `render/ordnanceMotionPresentation.js:261` |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:18` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:19` |
| `claim:claimed` | `systems/claims.js:427` | `systems/onboarding.js:627`, `systems/story.js:246`, `systems/traffic.js:1672` |
| `claim:convoyAbandoned` | `systems/claims.js:1280`, `systems/claims.js:1398` | `systems/traffic.js:1675` |
| `claim:convoyDocked` | `systems/traffic.js:2961` | `systems/claims.js:383` |
| `claim:convoyManifested` | `systems/traffic.js:2861` | `systems/claims.js:382` |
| `claim:defenseDelegate` | — | `systems/claims.js:372` |
| `claim:defenseDelegateRefused` | `systems/claims.js:1740` | — |
| `claim:defenseEncounterRequested` | `systems/claims.js:1642` | — |
| `claim:defenseGo` | — | `systems/claims.js:371` |
| `claim:defenseIgnore` | — | `systems/claims.js:367`, `systems/claims.js:378` |
| `claim:defenseResolved` | `systems/claims.js:1806` | `ui/encounterChoicePrompt.js:133` |
| `claim:defenseStarted` | `systems/claims.js:1647` | `ui/encounterChoicePrompt.js:132` |
| `claim:defenseWarning` | `systems/claims.js:1566` | `systems/encounterDirector.js:306`, `ui/encounterChoicePrompt.js:129` |
| `claim:depotPatrolCompleted` | `systems/claims.js:2911` | `systems/factions.js:470` |
| `claim:depotPatrolRotation` | `systems/claims.js:2867` | — |
| `claim:depotPatrolSpent` | `systems/claims.js:1727` | — |
| `claim:depotSupport` | `systems/claims.js:2778`, `systems/claims.js:2804` | — |
| `claim:freightDelivered` | `systems/traffic.js:3172` | — |
| `claim:infrastructureActive` | `systems/claims.js:1102`, `systems/claims.js:2566` | `systems/traffic.js:1670` |
| `claim:infrastructureConstructed` | `systems/claims.js:494`, `systems/claims.js:2503` | — |
| `claim:infrastructureStatus` | `systems/claims.js:1113` | `systems/traffic.js:1671` |
| `claim:moduleBuilt` | `systems/claims.js:512` | — |
| `claim:raidRepelled` | `systems/claims.js:1515` | — |
| `claim:raidWarning` | `systems/claims.js:1508` | `audio/audioSystem.js:2456` |
| `claim:receipt` | `systems/claims.js:2024` | — |
| `claim:sensorPostRumor` | `systems/claims.js:1162` | `systems/world.js:623` |
| `claim:specialized` | `systems/claims.js:553` | — |
| `claim:teleportRequest` | `systems/claims.js:770` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:3068` | — |
| `claims:migrated` | `systems/claims.js:2142` | — |
| `cloak:burned` | `systems/cloak.js:256` | — |
| `cloak:dropped` | `systems/cloak.js:207` | `audio/audioSystem.js:2390`, `render/authoredMotion.js:937`, `render/shipMicroMotion.js:1299` |
| `cloak:engaged` | `systems/cloak.js:194` | `render/authoredMotion.js:936`, `render/shipMicroMotion.js:1298`, `systems/gamepad.js:805`, `systems/onboarding.js:742` |
| `cloak:faded` | `systems/aiPorts.js:1124` | `audio/audioSystem.js:2389` |
| `collision:tearOff` | `systems/hullFracture.js:417` | `render/vfx.js:2521` |
| `combat:actionCancelled` | `combat/actions.js:373` | — |
| `combat:actionCompleted` | `combat/actions.js:359` | — |
| `combat:actionPhase` | `combat/actions.js:222` | — |
| `combat:actionRejected` | `combat/actions.js:395` | `ui/toasts.js:445` |
| `combat:actionStarted` | `combat/actions.js:189` | `systems/presentationOrchestrator.js:170`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2509` |
| `combat:baseDestroyed` | `systems/combat.js:897` | `systems/economy.js:1483` |
| `combat:beamStop` | `systems/weapons.js:1184` | `audio/audioSystem.js:2321`, `render/asteroidMotionPresentation.js:453`, `render/vfx.js:2505` |
| `combat:bounceContinued` | `combat/attackHit.js:36` | `render/vfx.js:2510`, `systems/presentationOrchestrator.js:260` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:394` | `render/feel.js:1404`, `render/vfx.js:2519`, `systems/fields.js:502`, `systems/gamepad.js:792` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:412` | `render/vfx.js:2520` |
| `combat:damage` | `combat/damage.js:330` | `audio/audioSystem.js:2336`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `render/asteroidMotionPresentation.js:447`, `render/authoredMotion.js:893`, `render/feel.js:1205`, `render/shipMicroMotion.js:1285`, `render/vfx.js:2511`, `save/saveSystem.js:370`, `systems/ai.js:106`, `systems/aiEncounter.js:136`, `systems/barkDirector.js:481`, `systems/collisionConsequences.js:97`, `systems/combatOutcome.js:184`, `systems/cruise.js:53`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:287`, `systems/factionPresence.js:452`, `systems/heat.js:301`, `systems/lawSecurity.js:312`, `systems/missions.js:1507`, `systems/npcJobsRuntime.js:967`, `systems/onboarding.js:537`, `systems/onboarding.js:548`, `systems/presentationOrchestrator.js:164`, `systems/salvageActions.js:132`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1673`, `systems/stationBroadcast.js:154`, `systems/survivalResults.js:487`, `systems/swarmJuice.js:97`, `systems/titles.js:582`, `systems/traffic.js:1595`, `systems/volatileExposure.js:215`, `ui/alerts.js:463`, `ui/commandBar.js:401`, `ui/floatingText.js:196`, `ui/hud.js:1910`, `ui/hud.js:2190`, `ui/hud.js:2417`, `ui/uiRoot.js:680` |
| `combat:emp` | `combat/damage.js:332` | `ui/hud.js:2423` |
| `combat:fire` | `systems/impulseCharges.js:729`, `systems/weapons.js:1090`, `systems/weapons.js:1163`, `systems/weapons.js:1318`, `systems/weapons.js:1638` | `audio/audioSystem.js:2320`, `data/stationBubbles.js:181`, `render/feel.js:1305`, `render/shipMicroMotion.js:1283`, `render/vfx.js:2504`, `systems/cloak.js:53`, `systems/cruise.js:61`, `systems/lawSecurity.js:313`, `systems/onboarding.js:475`, `systems/onboarding.js:488`, `systems/presentationOrchestrator.js:169`, `systems/story.js:251`, `systems/traffic.js:1596`, `ui/hud.js:4155` |
| `combat:hit` | `systems/salvageActions.js:607`, `systems/salvageActions.js:698` | `systems/routeFollower.js:372`, `systems/story.js:252` |
| `combat:hitAsset` | `systems/wingmen.js:204` | `systems/automation.js:548` |
| `combat:kill` | `systems/world.js:5688` | — |
| `combat:lockChanged` | `systems/weapons.js:862` | `systems/world.js:582`, `ui/alerts.js:470` |
| `combat:outcome` | `systems/combatOutcome.js:301` | `systems/barkDirector.js:478` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:302` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:4541`, `systems/npcJobsRuntime.js:4781` | `combat/kernel.js:191` |
| `combat:requestAction` | — | `combat/kernel.js:189` |
| `combat:routeDamage` | `systems/bombs.js:1339`, `systems/drill.js:1646`, `systems/hullBurst.js:497`, `systems/impulseCharges.js:1559`, `systems/mines.js:308`, `systems/missions.js:6563` | `combat/kernel.js:190`, `systems/routeFollower.js:373` |
| `combat:shove` | `systems/onboarding.js:2288` | `audio/audioSystem.js:2466`, `systems/onboarding.js:487` |
| `combat:statusApplied` | `combat/statuses.js:212` | `render/vfx.js:2522` |
| `combat:statusExpired` | `combat/statuses.js:90` | `audio/bombAudio.js:464`, `systems/tumbleStates.js:122` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:160`, `systems/encounterDirector.js:279`, `systems/factionPresence.js:450`, `systems/npcJobsRuntime.js:970`, `systems/presentationOrchestrator.js:239`, `systems/surrenderRecovery.js:69`, `systems/tumbleStates.js:126`, `systems/wingMorale.js:202` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1301`, `systems/factionPresence.js:451`, `systems/npcJobsRuntime.js:971`, `systems/presentationOrchestrator.js:248`, `systems/surrenderRecovery.js:70` |
| `combat:surrendered` | — | `systems/combatOutcome.js:161`, `systems/surrenderRecovery.js:68` |
| `combat:tumbled` | `systems/tumbleStates.js:472` | `systems/fields.js:501`, `systems/missions.js:1427`, `systems/tetherGameplay.js:270` |
| `combat:warded` | `combat/damage.js:294` | — |
| `combat:weakPointHit` | `systems/combat.js:812` | `render/vfx.js:2512`, `ui/floatingText.js:243` |
| `comms:log` | `data/encounters/344-opening-hauler-raid.js:130`, `data/encounters/350-the-long-tail.js:175`, `data/encounters/350-the-long-tail.js:209`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:154`, `data/encounters/352-the-slot.js:174`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:138`, `data/encounters/355-the-winnow-throw.js:155`, `data/encounters/355-the-winnow-throw.js:162`, `data/encounters/355-the-winnow-throw.js:179`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:183`, `data/encounters/357-the-handoff.js:197`, `data/encounters/357-the-handoff.js:222`, `data/encounters/357-the-handoff.js:262`, `data/encounters/357-the-handoff.js:278`, `data/encounters/358-the-press-camp.js:56`, `data/encounters/358-the-press-camp.js:201`, `data/encounters/358-the-press-camp.js:214`, `data/encounters/362-the-salvage-watch.js:275`, `systems/alienEcology.js:347`, `systems/alienEcology.js:792`, `systems/alienEcology.js:850`, `systems/alienEcology.js:868`, `systems/alienEcology.js:926`, `systems/alienEcology.js:992`, `systems/alienEcology.js:1004`, `systems/alienEcology.js:1738`, `systems/asteroidSites.js:1392`, `systems/contractClauses.js:566`, `systems/encounterDirector.js:2426`, `systems/encounterScripts.js:744`, `systems/encounterScripts.js:2932`, `systems/encounterScripts.js:3178`, `systems/factions.js:533`, `systems/missions.js:5592`, `systems/morrow.js:212`, `systems/precursorMachines.js:53`, `systems/precursorMachines.js:218`, `systems/precursorMachines.js:231`, `systems/precursorMachines.js:248`, `systems/precursorMachines.js:271`, `systems/precursorMachines.js:291`, `systems/precursorMachines.js:305`, `systems/precursorMachines.js:314`, `systems/precursorMachines.js:379`, `systems/precursorMachines.js:444`, `systems/precursorMachines.js:471`, `systems/precursorMachines.js:504`, `systems/precursorMachines.js:519`, `systems/precursorMachines.js:551`, `systems/precursorMachines.js:572`, `systems/precursorMachines.js:579`, `systems/precursorMachines.js:595`, `systems/precursorMachines.js:638`, `systems/precursorMachines.js:767`, `systems/precursorMachines.js:811`, `systems/precursorMachines.js:837`, `systems/precursorMachines.js:862`, `systems/precursorMachines.js:915`, `systems/precursorMachines.js:923`, `systems/salvage.js:155`, `systems/salvage.js:798`, `systems/salvage.js:873`, `systems/salvage.js:1014`, `systems/vesper.js:238` | `ui/floatingText.js:94` |
| `comms:message` | `systems/traffic.js:5673`, `systems/traffic.js:6440` | — |
| `comms:popup` | `systems/ai.js:496`, `systems/factionPresence.js:1111`, `systems/factionPresence.js:1132`, `systems/memorialThief.js:102`, `systems/missions.js:4750`, `systems/missions.js:7486`, `systems/missions.js:7579`, `systems/missions.js:7618`, `systems/missions.js:8527`, `systems/missions.js:8829`, `systems/missions.js:8944`, `systems/missions.js:9005`, `systems/missions.js:9165`, `systems/missions.js:9734`, `systems/missions.js:9776`, `systems/missions.js:10271`, `systems/onboarding.js:987`, `systems/scenarioRuntime.js:186`, `systems/story.js:482`, `systems/story.js:1261`, `systems/story.js:1289` | `audio/audioSystem.js:2550`, `ui/screens/codex.js:778` |
| `conflict:flip` | `systems/factions.js:823` | `systems/factionPresence.js:456`, `systems/sectorSim.js:128`, `systems/story.js:241` |
| `conflict:frontAction` | `systems/factions.js:710` | — |
| `conflict:warDeclared` | `systems/factions.js:767` | — |
| `contactHail:availability` | `systems/scanner.js:1614`, `systems/scanner.js:1625` | — |
| `contactHail:choice` | `ui/commsRadial.js:533`, `ui/contactHailPrompt.js:167` | `systems/scanner.js:923` |
| `contactHail:clear` | `systems/scanner.js:1636` | — |
| `contactHail:handoff` | `systems/scanner.js:1474` | — |
| `contactHail:offer` | `systems/scanner.js:1496` | — |
| `contactHail:request` | `ui/commsRadial.js:585`, `ui/contactHailPrompt.js:161` | `systems/scanner.js:922` |
| `contactHail:response` | `systems/scanner.js:1530` | `systems/traffic.js:1584` |
| `contraband:bribe` | `systems/encounterScripts.js:422`, `ui/customsPrompt.js:230` | `systems/economy.js:1479` |
| `contraband:scanned` | `systems/economy.js:3752` | `systems/encounterDirector.js:288`, `systems/factions.js:450`, `systems/heat.js:306`, `systems/lawSecurity.js:323`, `ui/customsPrompt.js:150` |
| `contract:clauseBroken` | `systems/contractClauses.js:579` | `systems/missions.js:1474` |
| `contract:clauseHonored` | `systems/contractClauses.js:498`, `systems/missions.js:7632` | `systems/contractClauses.js:265` |
| `contract:clauseSettledKill` | `systems/contractClauses.js:355` | `systems/missions.js:1390` |
| `countermeasure:denied` | `systems/countermeasures.js:535` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:517` | `render/shipMicroMotion.js:1304` |
| `craft:complete` | `systems/crafting.js:337`, `systems/crafting.js:383` | `ui/station/screens/industry.js:518` |
| `craft:queueChanged` | `systems/crafting.js:198`, `systems/crafting.js:222`, `systems/crafting.js:347` | `render/authoredMotion.js:903`, `systems/onboarding.js:632`, `ui/station/screens/industry.js:518` |
| `credits:changed` | `systems/economy.js:3024`, `systems/economy.js:3036` | `audio/audioSystem.js:2423`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:413`, `ui/hud.js:4139` |
| `cruise:charging` | `systems/cruise.js:123` | `render/vfx.js:2598`, `systems/presentationOrchestrator.js:177` |
| `cruise:dropped` | `systems/cruise.js:193` | `audio/audioSystem.js:2538`, `render/authoredMotion.js:910`, `render/vfx.js:2600`, `systems/presentationOrchestrator.js:179` |
| `cruise:engaged` | `systems/cruise.js:98` | `audio/audioSystem.js:2534`, `render/vfx.js:2599`, `systems/presentationOrchestrator.js:178` |
| `cruise:snareRequest` | `systems/encounterScripts.js:586` | `render/authoredMotion.js:909`, `systems/cruise.js:66` |
| `cruise:snared` | `systems/cruise.js:192` | `audio/audioSystem.js:2542` |
| `customs:breakScan` | `ui/customsPrompt.js:235` | `render/authoredMotion.js:921` |
| `customs:submit` | `ui/customsPrompt.js:213` | `render/authoredMotion.js:920`, `systems/lawSecurity.js:335` |
| `customs:weirBolt` | — | `systems/economy.js:1478` |
| `danger:miningNoise` | `systems/mining.js:2471` | — |
| `day:tick` | `core/coreSystem.js:314` | `systems/custodyConsequences.js:43`, `systems/economy.js:1400`, `systems/encounterDirector.js:261`, `systems/factions.js:482`, `systems/sectorSim.js:112` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:226` | `systems/combat.js:724` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:217` | `systems/combat.js:723` |
| `detonator:detonated` | `systems/impulseCharges.js:677` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:187` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:plateUnlocked` | `systems/world.js:874`, `systems/world.js:5528`, `systems/world.js:5999`, `systems/world.js:6620` | `audio/audioSystem.js:2463`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:780` |
| `distress:call` | `systems/traffic.js:5671` | — |
| `distress:rescued` | `systems/encounterScripts.js:743` | `systems/factions.js:460` |
| `dock:attempt` | `ui/input.js:190` | `ui/dockDenyBanner.js:116` |
| `dock:denied` | `ui/dockDenyBanner.js:141` | `render/authoredMotion.js:952` |
| `dock:docked` | `balance/careerCohorts.js:507`, `balance/careerCohorts.js:1994`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `systems/world.js:5839`, `ui/input.js:194` | `audio/audioSystem.js:2465`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/authoredMotion.js:950`, `render/infrastructureMotion.js:192`, `render/shipMicroMotion.js:1294`, `save/saveSystem.js:397`, `systems/achievements.js:1110`, `systems/aftermathWrecks.js:991`, `systems/autoTargetAssist.js:119`, `systems/combat.js:687`, `systems/economy.js:1447`, `systems/economyContracts.js:178`, `systems/factionPresence.js:448`, `systems/lawSecurity.js:332`, `systems/mining.js:241`, `systems/mining.js:243`, `systems/missions.js:1317`, `systems/onboarding.js:449`, `systems/onboarding.js:598`, `systems/pirateDisguise.js:37`, `systems/scanner.js:926`, `systems/stationServices.js:205`, `systems/story.js:201`, `systems/world.js:616`, `systems/world.js:654`, `ui/alerts.js:381`, `ui/cargoConscience.js:143`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:117`, `ui/impoundPayPrompt.js:50`, `ui/impoundPayPrompt.js:55`, `ui/priceForecast.js:86`, `ui/promptDeck.js:767`, `ui/securityReadout.js:158`, `ui/uiRoot.js:1224`, `ui/watchlistHud.js:90`, `ui/wingmanRadial.js:330`, `ui/worldObjectInteraction.js:382`, `ui/wreckChoicePrompt.js:50` |
| `dock:launder` | `ui/station/screens/market.js:430` | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:1210`, `core/physics.js:1214`, `ui/input.js:163` | `render/authoredMotion.js:949`, `systems/onboarding.js:557`, `ui/alerts.js:377`, `ui/input.js:169` |
| `dock:undocked` | `balance/careerCohorts.js:508`, `balance/careerCohorts.js:1999`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:726`, `ui/station/stationApp.js:877` | `audio/audioSystem.js:2470`, `render/authoredMotion.js:951`, `render/infrastructureMotion.js:193`, `render/shipMicroMotion.js:1295`, `render/vfx.js:2482`, `save/saveSystem.js:398`, `systems/combat.js:692`, `systems/economy.js:1459`, `systems/missions.js:1336`, `systems/moralTrap.js:179`, `systems/onboarding.js:510`, `systems/presentationAdapters.js:212`, `systems/stationServices.js:206`, `systems/world.js:617`, `ui/impoundPayPrompt.js:53`, `ui/input.js:177`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1262` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1440` | `ui/uiRoot.js:1321` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1425`, `ui/sandbox/sandboxSetup.js:632` | `ui/uiRoot.js:1311` |
| `drill:approachRequested` | `ui/input.js:641` | `systems/tetherGameplay.js:269` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1317`, `ui/sandbox/sandboxSetup.js:631` | `ui/asteroid/asteroidScreen.js:1682`, `ui/uiRoot.js:1300` |
| `drill:break` | `systems/drill.js:1605` | `audio/audioSystem.js:2720`, `render/authoredMotion.js:914`, `systems/asteroidSites.js:453`, `systems/presentationOrchestrator.js:225`, `ui/asteroid/asteroidScreen.js:1611`, `ui/screens/drill.js:1936` |
| `drill:cargoFull` | `systems/drill.js:277` | `audio/audioSystem.js:2722`, `systems/presentationOrchestrator.js:232`, `ui/asteroid/asteroidScreen.js:1601`, `ui/screens/drill.js:1907` |
| `drill:end` | `systems/drill.js:1192` | `audio/audioSystem.js:2730`, `render/authoredMotion.js:915`, `systems/asteroidSites.js:463`, `systems/presentationOrchestrator.js:233` |
| `drill:gasHit` | `systems/drill.js:1633` | `audio/audioSystem.js:2721`, `systems/presentationOrchestrator.js:227`, `ui/asteroid/asteroidScreen.js:1588`, `ui/screens/drill.js:1836` |
| `drill:retry` | `systems/drill.js:1241` | `systems/presentationOrchestrator.js:234` |
| `drill:rockDepleted` | `systems/drill.js:222`, `systems/drill.js:256`, `systems/drill.js:1158` | `audio/audioSystem.js:2723`, `ui/asteroid/asteroidScreen.js:1598`, `ui/screens/drill.js:1898` |
| `drill:scanPulse` | `systems/drill.js:1314` | `audio/audioSystem.js:2724`, `systems/asteroidSites.js:485`, `systems/presentationOrchestrator.js:223`, `ui/asteroid/asteroidScreen.js:1605`, `ui/screens/drill.js:1924` |
| `drill:spark` | `systems/drill.js:1572` | `audio/audioSystem.js:2719`, `systems/presentationOrchestrator.js:224`, `ui/asteroid/asteroidScreen.js:1616`, `ui/screens/drill.js:1957` |
| `drill:start` | `systems/drill.js:1150` | `audio/audioSystem.js:2729`, `render/authoredMotion.js:913`, `systems/asteroidSites.js:446`, `systems/onboarding.js:603`, `systems/presentationOrchestrator.js:222` |
| `drill:warn` | `systems/drill.js:229`, `systems/drill.js:280`, `systems/drill.js:289`, `systems/drill.js:1164`, `systems/drill.js:1169`, `systems/drill.js:1445`, `systems/drill.js:1484`, `systems/drill.js:1505`, `systems/drill.js:1524` | `audio/audioSystem.js:2725`, `systems/presentationOrchestrator.js:221`, `ui/asteroid/asteroidRenderer3d.js:7114`, `ui/asteroid/asteroidScreen.js:1594`, `ui/screens/drill.js:1864` |
| `drill:yield` | `systems/drill.js:254` | `audio/audioSystem.js:2716`, `systems/missions.js:1369`, `systems/presentationOrchestrator.js:226`, `ui/asteroid/asteroidScreen.js:1580`, `ui/screens/drill.js:1814` |
| `drone:grindStart` | `systems/automation.js:1021` | `render/authoredMotion.js:899` |
| `drone:grindStop` | — | `render/authoredMotion.js:900` |
| `ecology:coherence` | `systems/alienEcology.js:808` | — |
| `ecology:evidence` | `systems/precursorMachines.js:226`, `systems/precursorMachines.js:309`, `systems/precursorMachines.js:310`, `systems/precursorMachines.js:523`, `systems/precursorMachines.js:555`, `systems/precursorMachines.js:919` | `systems/world.js:657` |
| `ecology:factionOutcome` | `systems/economy.js:2559`, `systems/economy.js:2827` | `systems/world.js:656` |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:477` | `systems/world.js:658` |
| `ecology:relayPulse` | `systems/alienEcology.js:889` | — |
| `ecology:setpiece` | `systems/alienEcology.js:1681` | — |
| `economy:applyTradePressure` | `systems/automation.js:886`, `systems/automation.js:1683`, `systems/automation.js:1684`, `systems/claims.js:1380`, `systems/encounterDirector.js:1879`, `systems/encounterDirector.js:1927`, `systems/sectorSim.js:400`, `systems/traffic.js:9404`, `systems/traffic.js:11128` | `systems/economy.js:1425` |
| `economy:cargoKillOpportunity` | `systems/economy.js:2705` | `systems/missions.js:1364` |
| `economy:chargeCredits` | `systems/automation.js:1854`, `systems/automation.js:1861`, `systems/automation.js:2719`, `systems/automation.js:2943`, `systems/beacons.js:69`, `systems/bombs.js:717`, `systems/bombs.js:800`, `systems/bombs.js:818`, `systems/bombs.js:884`, `systems/claims.js:407`, `systems/claims.js:477`, `systems/claims.js:548`, `systems/claims.js:1468`, `systems/combat.js:1064`, `systems/encounterDirector.js:1873`, `systems/factions.js:568`, `systems/gateControlDirector.js:120`, `systems/mining.js:540`, `systems/missions.js:3421`, `systems/missions.js:3424`, `systems/npcJobsRuntime.js:4427`, `systems/pirateParley.js:885`, `systems/ships.js:1996`, `systems/ships.js:2100`, `systems/ships.js:2162`, `systems/world.js:4004`, `systems/world.js:4048`, `systems/world.js:5147` | `systems/economy.js:1390` |
| `economy:debtEscalated` | `systems/economy.js:3153` | — |
| `economy:demandShift` | `systems/economy.js:1840` | — |
| `economy:eventEnded` | `systems/economy.js:3830` | `ui/floatingText.js:327` |
| `economy:eventStarted` | `systems/economy.js:3805` | `ui/floatingText.js:316` |
| `economy:freightAccepted` | `systems/economy.js:2906`, `systems/economy.js:2935` | `systems/claims.js:363`, `systems/missions.js:1360` |
| `economy:grantCredits` | `systems/automation.js:1964`, `systems/automation.js:1975`, `systems/automation.js:2705`, `systems/bombs.js:837`, `systems/cargo.js:984`, `systems/claims.js:1379`, `systems/claims.js:2128`, `systems/combat.js:914`, `systems/combat.js:926`, `systems/combat.js:1072`, `systems/combat.js:1161`, `systems/encounterDirector.js:1874`, `systems/mining.js:2060`, `systems/mining.js:2245`, `systems/mining.js:2394`, `systems/missions.js:7640`, `systems/missions.js:7643`, `systems/missions.js:8092`, `systems/missions.js:10184`, `systems/moralTrap.js:317`, `systems/scanReveal.js:152`, `systems/scanReveal.js:185`, `systems/ships.js:2212`, `systems/survivorPod.js:1256`, `systems/uniqueWrecks.js:1667` | `systems/economy.js:1389`, `systems/story.js:236` |
| `economy:marketOpened` | `ui/station/screens/market.js:1919` | `systems/economy.js:1405`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1618` | `systems/economy.js:1392` |
| `economy:salvageIntakeApplied` | `systems/economy.js:3007` | `ui/alerts.js:416`, `ui/alerts.js:502` |
| `economy:shortageRelieved` | `systems/economy.js:2927` | `systems/missions.js:1361` |
| `economy:sinkCharged` | `systems/economy.js:3050` | `ui/alerts.js:432`, `ui/alerts.js:490` |
| `economy:tick` | `systems/economy.js:1605` | `systems/achievements.js:1096`, `ui/priceHistory.js:116` |
| `economy:towCharge` | `systems/world.js:5809` | `systems/economy.js:1471` |
| `economy:tradeCompleted` | `systems/economy.js:2547` | `audio/audioSystem.js:2426`, `audio/audioSystem.js:2508`, `careers/origins/haulerOriginSystem.js:90`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:405`, `systems/claims.js:360`, `systems/factions.js:426`, `systems/missions.js:1346`, `systems/missions.js:1362`, `systems/onboarding.js:454`, `systems/sectorSim.js:123`, `systems/story.js:231` |
| `economy:tradeFailed` | `systems/economy.js:2787`, `systems/economy.js:2813` | `audio/audioSystem.js:2432` |
| `emergent:audio` | `systems/emergentPrimitives.js:181` | `audio/emergentPrimitiveVoice.js:83` |
| `emergent:contact` | `systems/emergentPrimitives.js:187` | `render/feel.js:1387` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1726` | `ui/encounterChoicePrompt.js:126` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:302` |
| `encounter:claimDefenseRoster` | `systems/encounterDirector.js:1053` | — |
| `encounter:fingerprint` | `systems/encounterDirector.js:1811` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `systems/encounterDirector.js:2467` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:8699` | `systems/encounterDirector.js:286` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:2059`, `systems/encounterScripts.js:3152` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:2431` | `systems/barkDirector.js:495` |
| `encounter:predationCleared` | `systems/encounterScripts.js:1170` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1087`, `systems/encounterScripts.js:1155` | `render/authoredMotion.js:918` |
| `encounter:predationTelegraph` | — | `render/authoredMotion.js:935` |
| `encounter:receipt` | `systems/encounterDirector.js:1824` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:1806`, `systems/encounterDirector.js:1857`, `systems/survivalArena.js:1330` | `audio/audioSystem.js:2474`, `systems/aftermathWrecks.js:990`, `systems/claims.js:375`, `systems/claims.js:376`, `systems/story.js:147`, `systems/terrainAnchors.js:89`, `systems/traffic.js:1676`, `systems/uniqueLootAbilities.js:146`, `ui/encounterChoicePrompt.js:127` |
| `encounter:spawned` | `systems/encounterDirector.js:1166` | `systems/uniqueLootAbilities.js:145` |
| `encounter:stale` | `systems/encounterDirector.js:448` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1138`, `systems/survivalArena.js:1240` | `audio/audioSystem.js:2473`, `render/authoredMotion.js:930`, `systems/survivalResults.js:495`, `systems/terrainAnchors.js:88`, `systems/world.js:626` |
| `encounter:voice` | `systems/encounterDirector.js:1709` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | `ui/encounterChoicePrompt.js:128` |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | `systems/story.js:159` |
| `endgame:archive` | `systems/story.js:217`, `systems/story.js:1023` | `ui/screens/codex.js:783` |
| `endgame:chosen` | `systems/story.js:1011` | `ui/screens/missionLog.js:2445` |
| `endgame:confirmRequired` | `systems/story.js:896` | `ui/screens/missionLog.js:2444` |
| `endgame:eligibility` | `systems/story.js:713` | `ui/screens/missionLog.js:2443` |
| `endgame:finaleCompleted` | `systems/story.js:789` | — |
| `endgame:finaleReady` | `systems/story.js:1020` | — |
| `endgame:ineligible` | `systems/story.js:799`, `systems/story.js:876`, `systems/story.js:941` | — |
| `endgame:loopBack` | — | `systems/story.js:225` |
| `endgame:promptChoiceC` | `systems/story.js:861` | — |
| `endgame:promptChoiceD` | `systems/story.js:825` | — |
| `endgame:promptSandbox` | `systems/story.js:724` | — |
| `endgame:pullCompleted` | `systems/claims.js:3014` | `systems/factions.js:473` |
| `endgame:sandboxContinued` | `systems/story.js:1005` | `ui/screens/missionLog.js:2446` |
| `entity:destroyed` | `main.js:566`, `main.js:841`, `save/saveSystem.js:5487`, `systems/survivorPod.js:310`, `systems/traffic.js:7430` | `audio/audioSystem.js:2382`, `combat/kernel.js:182`, `render/vfx.js:2536`, `systems/aftermathWrecks.js:971`, `systems/ai.js:119`, `systems/aiEncounter.js:135`, `systems/cloak.js:88`, `systems/combatOutcome.js:164`, `systems/encounterDirector.js:277`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:266`, `systems/lawSecurity.js:316`, `systems/missions.js:1392`, `systems/missions.js:1509`, `systems/npcJobsRuntime.js:955`, `systems/presentationOrchestrator.js:176`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:95`, `systems/survivalWave.js:140`, `systems/swarmArena.js:446`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:220` |
| `entity:killed` | `balance/careerCohorts.js:476`, `combat/damage.js:478`, `combat/kernel.js:125`, `systems/combat.js:880` | `audio/audioSystem.js:2381`, `render/feel.js:1257`, `render/shipMicroMotion.js:1278`, `render/vfx.js:2535`, `sim/titleAttract.js:166`, `systems/aftermathWrecks.js:969`, `systems/ai.js:120`, `systems/barkDirector.js:486`, `systems/barkDirector.js:487`, `systems/combatOutcome.js:158`, `systems/economy.js:1436`, `systems/encounterDirector.js:278`, `systems/factions.js:328`, `systems/factions.js:388`, `systems/impulseCharges.js:277`, `systems/lawSecurity.js:315`, `systems/lawSecurity.js:327`, `systems/lootShards.js:590`, `systems/lossLedger.js:380`, `systems/mining.js:236`, `systems/missions.js:1385`, `systems/missions.js:1508`, `systems/npcJobsRuntime.js:947`, `systems/onboarding.js:489`, `systems/onboarding.js:526`, `systems/presentationOrchestrator.js:175`, `systems/sectorSim.js:127`, `systems/surrenderRecovery.js:75`, `systems/survivalResults.js:484`, `systems/survivalWave.js:141`, `systems/survivorPod.js:477`, `systems/swarmChain.js:107`, `systems/swarmElites.js:136`, `systems/swarmJuice.js:96`, `systems/swarmSupply.js:101`, `systems/titles.js:583`, `systems/traffic.js:1572`, `systems/wingMorale.js:201`, `systems/world.js:630`, `ui/floatingText.js:240`, `ui/floatingText.js:283`, `ui/uiRoot.js:687`, `ui/uiRoot.js:695` |
| `entity:spawnRequest` | `data/scanReveal.js:505`, `systems/salvageActions.js:266`, `systems/salvageActions.js:512` | `core/coreSystem.js:224` |
| `entity:spawned` | `core/coreSystem.js:122` | `combat/kernel.js:171`, `render/asteroidMotionPresentation.js:455`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:220`, `render/shipMicroMotion.js:1279`, `render/vfx.js:2542`, `sim/titleAttract.js:167`, `systems/aiEncounter.js:134`, `systems/barkDirector.js:473`, `systems/barkDirector.js:474`, `systems/combatOutcome.js:163`, `systems/factionPresence.js:454`, `systems/fields.js:496`, `systems/flybyFocus.js:307`, `systems/lawSecurity.js:314`, `systems/lossLedger.js:379`, `systems/npcJobsRuntime.js:932`, `systems/salvageActions.js:129`, `systems/survivalSwarm.js:216`, `systems/swarmElites.js:135`, `systems/swarmSupply.js:106`, `systems/titles.js:584`, `systems/uniqueLootAbilities.js:148` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:379`, `systems/environmentalMachinery.js:1112` | `systems/terrainAnchors.js:90` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:726` | `systems/terrainAnchors.js:94` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:1006` | `systems/terrainAnchors.js:92` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:1203` | `data/hazardLanguage.js:133` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:738` | `systems/terrainAnchors.js:96` |
| `escalation:arrived` | `systems/encounterDirector.js:488` | — |
| `escalation:seeded` | `systems/encounterDirector.js:475` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:527`, `systems/factions.js:610`, `systems/factions.js:953` | `systems/heat.js:315` |
| `faction:bribe` | `ui/screens/footprint.js:1624` | `systems/factions.js:309` |
| `faction:repChanged` | `systems/factions.js:523`, `systems/factions.js:605`, `systems/factions.js:949` | `ui/floatingText.js:301`, `ui/station/screens/factions.js:409` |
| `faction:repDelta` | `balance/careerCohorts.js:270`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `systems/choirReliefBerth.js:358`, `systems/choirReliefBerth.js:392`, `systems/choirReliefBerth.js:413`, `systems/claims.js:1794`, `systems/economy.js:3429`, `systems/economy.js:3744`, `systems/encounterDirector.js:1875`, `systems/missions.js:8089`, `systems/missions.js:8170`, `systems/missions.js:10136`, `systems/missions.js:10138`, `systems/missions.js:10202`, `systems/moralTrap.js:311`, `systems/stuntGrammar.js:111`, `systems/survivorPod.js:976`, `systems/survivorPod.js:1262`, `systems/uniqueWrecks.js:1671`, `systems/world.js:6125`, `systems/world.js:6359` | `systems/factions.js:296` |
| `faction:repSpillover` | `systems/factions.js:603` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | `systems/factions.js:301` |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1359` | `systems/barkDirector.js:508` |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:1115` | `systems/story.js:262` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1271` | `ui/uiRoot.js:301` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:963` | `systems/barkDirector.js:507` |
| `factionPresence:service` | `systems/factionPresence.js:1064` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1140` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:687`, `systems/factionPresence.js:782` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:789` | `systems/world.js:586` |
| `field:opportunity` | `systems/world.js:4457` | — |
| `field:regrown` | `systems/world.js:4386` | `systems/presentationOrchestrator.js:220` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:717`, `systems/traffic.js:2039`, `systems/traffic.js:11047` | — |
| `field:richSeamOpened` | `systems/traffic.js:10100` | `systems/traffic.js:1565` |
| `field:richSeamWorked` | `systems/mining.js:943`, `systems/traffic.js:9769` | `systems/traffic.js:1566` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:788` | `systems/npcJobsRuntime.js:963`, `systems/presentationOrchestrator.js:219` |
| `fields:anchorRegistered` | `systems/fields.js:1038` | `render/forceLanguage/fieldForcePresentation.js:60` |
| `fields:cleared` | `systems/fields.js:1582` | `audio/fieldAudio.js:182`, `render/forceLanguage/fieldForcePresentation.js:61` |
| `fields:clusterDetonate` | `systems/fields.js:2154` | `systems/presentationOrchestrator.js:281` |
| `fields:coneToggled` | `systems/fields.js:1259`, `systems/fields.js:1265`, `systems/fields.js:1359`, `systems/fields.js:1367` | `systems/onboarding.js:517` |
| `fields:deployDenied` | `systems/fields.js:1133` | — |
| `fields:deployed` | `systems/fields.js:691`, `systems/fields.js:776`, `systems/fields.js:1219`, `systems/fields.js:1256`, `systems/fields.js:1350`, `systems/fields.js:1464` | `audio/audioSystem.js:2662`, `systems/fields.js:497`, `systems/onboarding.js:516` |
| `fields:ended` | `systems/fields.js:1057`, `systems/fields.js:1366`, `systems/fields.js:1387`, `systems/fields.js:1537` | `audio/fieldAudio.js:179` |
| `fields:hitchCut` | `systems/fields.js:722` | — |
| `fields:hitchLatched` | `systems/fields.js:710` | — |
| `fields:specialistDisrupt` | `systems/fields.js:600` | `audio/fieldAudio.js:183` |
| `firsthour:beat` | `systems/onboarding.js:3194` | — |
| `firsthour:complete` | `systems/onboarding.js:3207` | — |
| `firsthour:milestone` | `systems/onboarding.js:1189` | `audio/audioSystem.js:2655` |
| `firsthour:sentence` | `systems/onboarding.js:1915` | — |
| `firsthour:started` | `systems/onboarding.js:2943` | — |
| `firsthour:verb` | `systems/onboarding.js:3131` | — |
| `flight:modeChanged` | `systems/flightV3.js:791` | — |
| `flight:sweptHull` | `systems/flightV3.js:697` | — |
| `flybyFocus:cancel` | `systems/flybyFocus.js:367` | `render/cameraDirector.js:1266` |
| `flybyFocus:end` | `systems/flybyFocus.js:368` | `render/cameraDirector.js:1265` |
| `flybyFocus:start` | `systems/flybyFocus.js:501` | `systems/onboarding.js:472` |
| `formation:discovered` | `systems/asteroidFormations.js:290` | — |
| `freight:arrival` | `systems/traffic.js:7799` | `render/authoredMotion.js:926` |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1638`, `systems/encounterScripts.js:1863`, `systems/traffic.js:5797` | `systems/barkDirector.js:484`, `systems/economy.js:1391`, `systems/encounterDirector.js:311`, `systems/lootShards.js:593`, `systems/sectorSim.js:134`, `systems/traffic.js:1590` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1500` | `render/authoredMotion.js:925` |
| `freight:custodyRebound` | `systems/encounterDirector.js:652` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1557` | — |
| `freight:loss` | `systems/encounterDirector.js:1937`, `systems/traffic.js:9406`, `systems/traffic.js:11140` | `systems/claims.js:384`, `systems/encounterDirector.js:312`, `systems/sectorSim.js:133` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1501` | `systems/surrenderRecovery.js:76` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1998` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:284`, `systems/traffic.js:1587` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:285`, `systems/traffic.js:1588` |
| `frontierRumor:acquired` | `systems/world.js:4067` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:6590` | — |
| `frontierRumor:contacted` | `systems/world.js:6486` | — |
| `frontierRumor:resolved` | `systems/world.js:4084` | — |
| `fuel:changed` | `systems/economy.js:3207`, `systems/economy.js:3276`, `systems/economy.js:3294`, `systems/stationServices.js:422`, `systems/stationServices.js:490`, `systems/world.js:5710`, `systems/world.js:5718` | — |
| `fuel:empty` | `systems/world.js:5711` | `audio/audioSystem.js:2498`, `systems/economy.js:1469`, `ui/alerts.js:478` |
| `game:embarkSpeculation` | `ui/sandbox/sandboxSetup.js:384`, `ui/screens/gameOver.js:506`, `ui/screens/newGame.js:887` | — |
| `game:exitToMenu` | `ui/screens/crucible.js:3397`, `ui/screens/crucible.js:3410`, `ui/screens/demoEnd.js:216`, `ui/screens/pause.js:1064` | `audio/audioSystem.js:2769`, `main.js:325`, `save/saveSystem.js:423`, `systems/runSession.js:72`, `ui/screens/crucibleLabControls.js:552` |
| `game:load` | `ui/input.js:344`, `ui/input.js:526`, `ui/screens/gameOver.js:495`, `ui/screens/mainMenu.js:530`, `ui/screens/saveLoad.js:1236` | `save/saveSystem.js:299`, `systems/scanner.js:925`, `ui/commandBar.js:430`, `ui/promptDeck.js:766` |
| `game:loadingProgress` | `main.js:147`, `main.js:172`, `main.js:206`, `main.js:232`, `main.js:358`, `main.js:785`, `main.js:872`, `main.js:921`, `main.js:943`, `main.js:972`, `main.js:992`, `main.js:1047`, `main.js:1184`, `save/saveSystem.js:4586` | `ui/loadingPresenter.js:185`, `ui/screens/newGame.js:847`, `ui/screens/saveLoad.js:834` |
| `game:new` | `main.js:502`, `ui/sandbox/sandboxSetup.js:398`, `ui/screens/crucible.js:3401`, `ui/screens/gameOver.js:521`, `ui/screens/newGame.js:961` | `audio/audioSystem.js:2764`, `audio/bombAudio.js:458`, `audio/fieldAudio.js:186`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:238`, `main.js:303`, `render/feel.js:1199`, `render/vfx.js:2552`, `render/vfx.js:2563`, `save/saveSystem.js:382`, `systems/aftermathWrecks.js:997`, `systems/aiEncounter.js:139`, `systems/bombs.js:580`, `systems/cloak.js:83`, `systems/combatOutcome.js:168`, `systems/countermeasures.js:221`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:84`, `systems/encounterDirector.js:275`, `systems/environmentalMachinery.js:214`, `systems/fields.js:490`, `systems/impulseCharges.js:282`, `systems/massSeed.js:120`, `systems/masslineSnares.js:136`, `systems/mines.js:77`, `systems/mining.js:259`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:283`, `systems/salvageActions.js:136`, `systems/scanner.js:924`, `systems/surrenderRecovery.js:82`, `systems/survivorPod.js:475`, `systems/tetherGameplay.js:264`, `systems/tumbleStates.js:124`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/moralTrapPrompt.js:44`, `ui/priceHistory.js:146`, `ui/promptDeck.js:765`, `ui/screens/crucibleLabControls.js:546`, `ui/wreckChoicePrompt.js:52` |
| `game:newGame` | `main.js:594` | `audio/audioSystem.js:2765`, `audio/bombAudio.js:459`, `audio/fieldAudio.js:187`, `core/coreSystem.js:239`, `render/npcJobSignatureVfx.js:903`, `render/shipMicroMotion.js:1282`, `render/vfx.js:2553`, `render/vfx.js:2564`, `save/saveSystem.js:386`, `systems/aftermathWrecks.js:998`, `systems/bombs.js:583`, `systems/cloak.js:84`, `systems/collisionConsequences.js:100`, `systems/combatOutcome.js:174`, `systems/countermeasures.js:222`, `systems/difficultyDirector.js:169`, `systems/fieldDepletion.js:705`, `systems/fragileCargo.js:285`, `systems/lossInvestigation.js:128`, `systems/lossLedger.js:382`, `systems/salvageActions.js:137`, `systems/survivorPod.js:474`, `systems/titles.js:586`, `systems/tumbleStates.js:125`, `systems/wingMorale.js:203`, `ui/cargoConscience.js:147`, `ui/uiRoot.js:596` |
| `game:over` | `systems/combat.js:837`, `systems/combat.js:968` | `ui/uiRoot.js:1344` |
| `game:save` | `ui/input.js:343`, `ui/input.js:524`, `ui/screens/saveLoad.js:1256` | `save/saveSystem.js:288` |
| `game:scenePrepared` | `main.js:659` | `systems/onboarding.js:408`, `ui/sandbox/sandboxSetup.js:424` |
| `game:startFailed` | `main.js:1137` | `ui/loadingPresenter.js:194`, `ui/sandbox/sandboxSetup.js:427`, `ui/screens/crucibleLabControls.js:548`, `ui/screens/newGame.js:846`, `ui/screens/saveLoad.js:840` |
| `game:started` | `main.js:794` | `audio/audioSystem.js:2770`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:240`, `save/saveSystem.js:379`, `save/saveSystem.js:393`, `sim/killcamTape.js:431`, `systems/automation.js:568`, `systems/collisionConsequences.js:99`, `systems/combat.js:721`, `systems/economyContracts.js:181`, `systems/factions.js:293`, `systems/flight.js:83`, `systems/flightV3.js:184`, `systems/heat.js:322`, `systems/masslineSnares.js:137`, `systems/missions.js:1294`, `systems/onboarding.js:431`, `systems/presentationAdapters.js:210`, `systems/presentationOrchestrator.js:284`, `systems/sectorSim.js:118`, `systems/ships.js:1705`, `systems/story.js:145`, `systems/surrenderRecovery.js:83`, `systems/survivalDraft.js:186`, `systems/tetherGameplay.js:265`, `systems/wingmen.js:146`, `ui/alerts.js:402`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:419`, `ui/screens/crucibleLabControls.js:547`, `ui/uiRoot.js:1329`, `ui/uiRoot.js:1370`, `ui/uiRoot.js:1372` |
| `gamepad:connected` | `systems/gamepad.js:915` | — |
| `gamepad:disconnected` | `systems/gamepad.js:907` | — |
| `gate:range` | `core/physics.js:1220`, `core/physics.js:1224` | `render/authoredMotion.js:953`, `systems/onboarding.js:564`, `systems/presentationOrchestrator.js:180`, `ui/alerts.js:383` |
| `gate:verdict` | `systems/gateControlDirector.js:135` | `render/infrastructureMotion.js:194` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:573`, `systems/story.js:560`, `systems/story.js:574`, `systems/story.js:608`, `systems/story.js:1406`, `systems/story.js:1753`, `systems/story.js:1955`, `systems/uniqueWrecks.js:1677` | `systems/ships.js:1700`, `ui/screens/codex.js:779` |
| `harasser:disengaged` | `systems/encounterDirector.js:2277` | `systems/barkDirector.js:496`, `systems/barkDirector.js:535` |
| `hazard:changed` | `systems/world.js:867`, `systems/world.js:5583` | `ui/alerts.js:482` |
| `hazard:enter` | `systems/environmentalMachinery.js:1146`, `systems/world.js:5558` | `data/hazardLanguage.js:129`, `render/shipMicroMotion.js:1287`, `ui/alerts.js:445` |
| `hazard:exit` | `systems/environmentalMachinery.js:1155`, `systems/world.js:5568` | `data/hazardLanguage.js:130`, `render/shipMicroMotion.js:1288`, `ui/alerts.js:456` |
| `heat:changed` | `systems/heat.js:700` | `audio/audioSystem.js:2501`, `render/vfx.js:2560`, `systems/barkDirector.js:509`, `systems/lawSecurity.js:333`, `systems/onboarding.js:529`, `systems/titles.js:593`, `ui/hud.js:4167` |
| `heat:clear` | — | `systems/heat.js:326` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:874` | `systems/missions.js:1437` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1240` | — |
| `heist:captureFork` | `systems/heistFacilities.js:1495` | `systems/missions.js:1446` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1382` | `systems/missions.js:1442` |
| `heist:launchCue` | `systems/heistFacilities.js:358` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:484`, `systems/heistFacilities.js:493`, `systems/heistFacilities.js:497`, `systems/heistFacilities.js:511` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:1894` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:1836` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:1817` | `systems/npcJobsRuntime.js:977` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:1755` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:268` |
| `hud:firstUse` | `systems/onboarding.js:856`, `systems/tetherGameplay.js:1903`, `systems/tetherGameplay.js:1974` | `ui/hud.js:2278` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:409` |
| `hud:phase` | `systems/story.js:314`, `systems/story.js:344`, `systems/story.js:347`, `systems/story.js:649` | `ui/hudMeta.js:142` |
| `hud:recallObjective` | `ui/input.js:362` | `ui/hud.js:1777` |
| `hud:slotClaim` | `ui/promptDeck.js:237` | `ui/hud.js:2156` |
| `hud:slotRelease` | `ui/promptDeck.js:238` | `ui/hud.js:2157` |
| `hud:tagFlicker` | `systems/story.js:626` | `ui/hudMeta.js:176` |
| `hull:fractured` | `systems/hullFracture.js:308` | `render/authoredMotion.js:896` |
| `hullBurst:activated` | `systems/hullBurst.js:211` | — |
| `hullBurst:ended` | `systems/hullBurst.js:232` | — |
| `hullBurst:hit` | `systems/hullBurst.js:350`, `systems/hullBurst.js:374`, `systems/hullBurst.js:556` | `render/authoredMotion.js:894` |
| `hullBurst:released` | `systems/hullBurst.js:488` | — |
| `industry:haulRequested` | `systems/environmentalMachinery.js:767` | `systems/traffic.js:1689` |
| `input:worldGestureCancelled` | `systems/input.js:1066`, `ui/worldObjectInteraction.js:188` | `systems/masslineThrow.js:123` |
| `interdiction:triggered` | `systems/encounterScripts.js:587`, `systems/world.js:5019` | `render/authoredMotion.js:908`, `systems/presentationOrchestrator.js:188`, `systems/sectorSim.js:124` |
| `intervention:available` | `systems/intervention.js:225` | — |
| `intervention:closed` | `systems/intervention.js:278` | — |
| `intervention:jumperRipped` | `systems/intervention.js:397` | — |
| `intervention:logged` | `systems/intervention.js:135` | — |
| `jump:arrive` | `systems/world.js:4960` | `render/authoredMotion.js:956`, `render/feel.js:1349`, `render/shipMicroMotion.js:1292`, `save/saveSystem.js:400`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:186`, `systems/sectorSim.js:139` |
| `jump:chargeAbort` | `systems/world.js:5099`, `systems/world.js:5179`, `systems/world.js:5244` | `audio/audioSystem.js:2480`, `render/authoredMotion.js:957`, `render/shipMicroMotion.js:1293`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:185`, `systems/routeFollower.js:364`, `ui/galaxyMap.js:2483`, `ui/toasts.js:482` |
| `jump:chargeStart` | `systems/world.js:5161`, `systems/world.js:5205` | `render/authoredMotion.js:954`, `render/feel.js:1339`, `render/shipMicroMotion.js:1289`, `systems/gateControlDirector.js:65`, `systems/missions.js:1313`, `systems/presentationOrchestrator.js:182`, `systems/story.js:207`, `ui/galaxyMap.js:2482` |
| `jump:chargeTick` | `systems/world.js:4903` | `render/authoredMotion.js:948`, `render/shipMicroMotion.js:1290`, `systems/presentationOrchestrator.js:183` |
| `jump:departurePreflight` | `systems/world.js:5143` | `systems/story.js:206` |
| `jump:start` | `systems/world.js:4920` | `audio/audioSystem.js:2479`, `render/authoredMotion.js:955`, `render/feel.js:1343`, `render/shipMicroMotion.js:1291`, `systems/economy.js:1474`, `systems/gateControlDirector.js:66`, `systems/mining.js:244`, `systems/presentationOrchestrator.js:184`, `systems/sectorSim.js:138` |
| `jump:unfiledConfirmed` | `systems/world.js:5225` | `systems/story.js:208` |
| `landmark:artifactRecovered` | `systems/missions.js:5114` | `systems/world.js:618` |
| `law:audit` | — | `systems/lawSecurity.js:338` |
| `law:custodyAcknowledged` | — | `systems/barkDirector.js:498` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:42` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:488` |
| `law:distressRaised` | — | `systems/barkDirector.js:506` |
| `law:fineAssessed` | — | `systems/barkDirector.js:501`, `ui/impoundPayPrompt.js:51` |
| `law:fineChoice` | `ui/impoundPayPrompt.js:217` | `systems/lawSecurity.js:336` |
| `law:fineRefused` | — | `ui/impoundPayPrompt.js:52` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:90` | `systems/lawSecurity.js:334` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:45` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:46` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:44` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:46`, `systems/heat.js:336`, `ui/impoundPayPrompt.js:47` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:48` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:45` |
| `law:incidentOpened` | — | `systems/traffic.js:1597` |
| `law:incidentResolved` | — | `systems/barkDirector.js:504` |
| `law:killedAdjudicated` | — | `systems/factions.js:318` |
| `law:playerSurrender` | — | `systems/lawSecurity.js:337` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:494`, `systems/factions.js:401`, `systems/heat.js:347` |
| `law:responseDeferred` | — | `systems/barkDirector.js:503` |
| `law:sanctuaryWithdrawal` | — | `systems/barkDirector.js:502` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:332` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:490` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:489` |
| `law:wantedWarrantReleased` | — | `systems/barkDirector.js:505` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:310` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `render/authoredMotion.js:919`, `systems/lawSecurity.js:322` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:930`, `systems/lootShards.js:1088`, `systems/stuntGrammar.js:121` | `systems/mining.js:238`, `ui/floatingText.js:267`, `ui/floatingText.js:274` |
| `loot:magnetCaptured` | `systems/lootShards.js:669` | `audio/audioSystem.js:2402` |
| `loot:manifestPayload` | `systems/lootShards.js:1197` | `systems/missions.js:1512` |
| `loot:overflowConverted` | `systems/mining.js:2399` | `audio/audioSystem.js:2401`, `ui/floatingText.js:269` |
| `lossInvestigation:closed` | `systems/lossInvestigation.js:322` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:185` | `systems/lossInvestigation.js:126` |
| `lossLedger:recorded` | `systems/lossLedger.js:342` | `systems/factionPresence.js:449`, `systems/ships.js:1654` |
| `machine:tokenDelivered` | `systems/precursorMachines.js:773` | — |
| `map:sectorCharted` | `systems/world.js:4008` | `systems/economy.js:1410` |
| `massSeed:cleared` | `systems/massSeed.js:598` | — |
| `massSeed:collapsed` | `systems/massSeed.js:421`, `systems/massSeed.js:471`, `systems/massSeed.js:551`, `systems/massSeed.js:581` | `render/authoredMotion.js:947` |
| `massSeed:collapsing` | `systems/massSeed.js:420`, `systems/massSeed.js:442`, `systems/massSeed.js:537`, `systems/massSeed.js:579` | `audio/audioSystem.js:2639` |
| `massSeed:deployDenied` | `systems/massSeed.js:155` | — |
| `massSeed:deployed` | `systems/massSeed.js:250` | `audio/audioSystem.js:2627`, `render/authoredMotion.js:944`, `systems/onboarding.js:752` |
| `massSeed:destroyed` | `systems/massSeed.js:578` | — |
| `massSeed:locked` | `systems/massSeed.js:307` | `audio/audioSystem.js:2633`, `render/authoredMotion.js:945` |
| `massSeed:locking` | `systems/massSeed.js:372` | `audio/audioSystem.js:2630` |
| `massSeed:tetherCut` | `systems/massSeed.js:499` | `audio/audioSystem.js:2643`, `render/authoredMotion.js:946` |
| `massSeed:warning` | `systems/massSeed.js:334` | `audio/audioSystem.js:2636` |
| `massline:bridleCut` | `systems/tetherGameplay.js:889` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:834`, `systems/tetherGameplay.js:850`, `systems/tetherGameplay.js:1061` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:698` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:752` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:899` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2464` | — |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:2640` | `systems/barkDirector.js:524` |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1688` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:1811` | `systems/gamepad.js:808` |
| `massline:recovered` | `systems/tumbleStates.js:237` | — |
| `massline:recovering` | `systems/tumbleStates.js:561` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:180` | `audio/audioSystem.js:2391` |
| `massline:releaseValidated` | `systems/masslineThrow.js:601` | `systems/presentationOrchestrator.js:163` |
| `massline:releaseWindow` | `systems/masslineThrow.js:241` | — |
| `massline:rideStarted` | `systems/tetherGameplay.js:1947` | — |
| `massline:selfSling` | `systems/masslineThrow.js:630` | `systems/flightV3.js:186`, `systems/onboarding.js:716`, `ui/stuntCallout.js:532` |
| `massline:snareArmed` | `systems/masslineSnares.js:232` | `audio/audioSystem.js:2625`, `render/authoredMotion.js:885` |
| `massline:snareCaught` | `systems/masslineSnares.js:427` | `systems/gamepad.js:799` |
| `massline:snareCut` | `systems/masslineSnares.js:720` | `audio/audioSystem.js:2626` |
| `massline:snareDeployed` | `systems/masslineSnares.js:334`, `systems/masslineSnares.js:679` | `render/authoredMotion.js:879` |
| `massline:snareEnded` | `systems/masslineSnares.js:722` | `render/authoredMotion.js:883` |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `render/vfx.js:2548`, `systems/masslineImpactDamage.js:48`, `systems/presentationOrchestrator.js:150` |
| `massline:threat` | `systems/masslineThreats.js:273` | `systems/presentationOrchestrator.js:126` |
| `massline:throw` | `systems/masslineThrow.js:543` | `systems/lootShards.js:592`, `systems/mines.js:74`, `systems/missions.js:1425`, `systems/tumbleStates.js:112` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:560` | `render/feel.js:1434` |
| `massline:tumbled` | `systems/tumbleStates.js:473` | `render/feel.js:1420` |
| `mines:armed` | `systems/mines.js:185`, `systems/mines.js:218` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:93` | `audio/audioSystem.js:2433` |
| `mines:detonated` | `systems/mines.js:288` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:151`, `systems/survivalArena.js:1211`, `systems/swarmEvents.js:208` | `systems/mines.js:73` |
| `mines:placed` | `systems/mines.js:158` | `systems/survivalArena.js:953` |
| `mines:released` | `systems/mines.js:323` | — |
| `mines:triggered` | `systems/mines.js:278` | — |
| `mining:beamLocked` | `systems/mining.js:851` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2246` | `systems/missions.js:1383`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:865` | `systems/presentationOrchestrator.js:215`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:678` | `ui/miningHud.js:206` |
| `mining:npcExtraction` | `systems/traffic.js:9757` | `systems/fieldDepletion.js:704` |
| `mining:podSplit` | `systems/mining.js:1669` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2191` | `render/asteroidMotionPresentation.js:457`, `systems/presentationOrchestrator.js:212`, `ui/miningHud.js:209` |
| `mining:richCoreCompleted` | `systems/mining.js:2224` | `render/asteroidMotionPresentation.js:458`, `systems/presentationOrchestrator.js:213`, `ui/miningHud.js:210` |
| `mining:richCoreExposed` | `systems/mining.js:2169` | `render/asteroidMotionPresentation.js:456`, `systems/presentationOrchestrator.js:211`, `ui/miningHud.js:208` |
| `mining:richCoreFizzle` | `systems/mining.js:2228` | `render/asteroidMotionPresentation.js:459`, `systems/presentationOrchestrator.js:214`, `ui/miningHud.js:211` |
| `mining:seamHit` | `systems/mining.js:2536` | `systems/presentationOrchestrator.js:204` |
| `mining:start` | `systems/mining.js:381`, `systems/mining.js:503`, `systems/mining.js:1618` | `audio/audioSystem.js:2385`, `render/asteroidMotionPresentation.js:451`, `render/authoredMotion.js:874`, `render/authoredMotion.js:901`, `render/vfx.js:2573`, `systems/missions.js:1503`, `systems/onboarding.js:457`, `systems/presentationOrchestrator.js:201`, `ui/miningHud.js:204`, `ui/worldObjectInteraction.js:371` |
| `mining:stop` | `systems/mining.js:626` | `audio/audioSystem.js:2386`, `render/asteroidMotionPresentation.js:452`, `render/authoredMotion.js:876`, `render/authoredMotion.js:902`, `render/vfx.js:2574`, `systems/presentationOrchestrator.js:202`, `ui/miningHud.js:205` |
| `mining:tick` | `systems/automation.js:1065`, `systems/mining.js:886` | `audio/audioSystem.js:2387`, `render/vfx.js:2575`, `systems/presentationOrchestrator.js:203`, `ui/miningHud.js:207` |
| `mining:ventBonus` | `systems/mining.js:722` | — |
| `mining:ventReady` | `systems/mining.js:659` | `systems/presentationOrchestrator.js:208` |
| `mining:yield` | `balance/careerCohorts.js:2197`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:717`, `systems/mining.js:1079`, `systems/mining.js:1149`, `systems/mining.js:1744`, `systems/mining.js:2221` | `careers/origins/prospectorOrigin.js:636`, `render/authoredMotion.js:875`, `render/vfx.js:2578`, `systems/encounterDirector.js:308`, `systems/missions.js:1366`, `systems/onboarding.js:458`, `systems/presentationOrchestrator.js:209`, `ui/floatingText.js:251` |
| `mission:abandon` | `systems/moralTrap.js:301` | `systems/missions.js:1307` |
| `mission:abandoned` | — | `systems/contractClauses.js:255` |
| `mission:accepted` | `systems/missions.js:3443` | `audio/audioSystem.js:2448`, `save/saveSystem.js:401`, `systems/aftermathWrecks.js:993`, `systems/contractClauses.js:250`, `systems/contractClauses.js:251`, `systems/economy.js:1386`, `systems/moralTrap.js:182`, `systems/onboarding.js:460`, `ui/hud.js:4147`, `ui/screens/missionLog.js:2428`, `ui/wreckChoicePrompt.js:45` |
| `mission:completed` | `systems/missions.js:7744` | `audio/audioSystem.js:2449`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:402`, `systems/aftermathWrecks.js:994`, `systems/claims.js:364`, `systems/contractClauses.js:252`, `systems/contractClauses.js:259`, `systems/factions.js:435`, `systems/lossLedger.js:381`, `systems/onboarding.js:461`, `systems/story.js:229`, `ui/hud.js:1773`, `ui/hud.js:4148`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2429` |
| `mission:conditionBroken` | `systems/contractClauses.js:466`, `systems/missions.js:1702` | `ui/hud.js:1764` |
| `mission:conditionPending` | `systems/missions.js:1755` | `ui/hud.js:1761` |
| `mission:conditionProgress` | `systems/contractClauses.js:434`, `systems/missions.js:1685` | `ui/hud.js:1762` |
| `mission:conditionSatisfied` | `systems/contractClauses.js:445`, `systems/missions.js:1693` | `systems/missions.js:1477`, `ui/hud.js:1763` |
| `mission:expired` | `systems/missions.js:8184` | `audio/audioSystem.js:2453`, `save/saveSystem.js:404`, `systems/aftermathWrecks.js:996`, `systems/contractClauses.js:254`, `systems/contractClauses.js:264`, `systems/factions.js:444`, `ui/screens/missionLog.js:2431` |
| `mission:failed` | `systems/missions.js:8120` | `audio/audioSystem.js:2452`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:403`, `systems/aftermathWrecks.js:995`, `systems/contractClauses.js:253`, `systems/factions.js:443`, `systems/story.js:230`, `ui/hud.js:1769`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2430` |
| `mission:forceEvent` | — | `systems/economy.js:1482` |
| `mission:gateCleared` | `systems/missions.js:7038` | — |
| `mission:offerBoarded` | `systems/missions.js:2551` | `systems/aftermathWrecks.js:992`, `systems/economyContracts.js:176` |
| `mission:offered` | `systems/aftermathWrecks.js:1813`, `systems/alienEcology.js:338`, `systems/careerContracts.js:306`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:257`, `systems/lossInvestigation.js:275`, `systems/lossLedger.js:318`, `systems/postEndingReplay.js:340`, `systems/salvage.js:1024`, `systems/uniqueWrecks.js:989` | `systems/economy.js:1385`, `systems/lossInvestigation.js:125`, `systems/missions.js:1312`, `systems/survivorPod.js:472` |
| `mission:setPieceTransition` | `systems/missions.js:7566` | `systems/lossInvestigation.js:127` |
| `mission:setPieceTravelLine` | `systems/missions.js:9740` | — |
| `mission:spawnDeferred` | `systems/missions.js:8908` | — |
| `mission:targetsProjected` | `systems/missions.js:8280` | — |
| `mission:updated` | `systems/contractClauses.js:439`, `systems/contractClauses.js:449`, `systems/contractClauses.js:478`, `systems/missions.js:1356`, `systems/missions.js:1689`, `systems/missions.js:1697`, `systems/missions.js:1715`, `systems/missions.js:1791`, `systems/missions.js:1911`, `systems/missions.js:2054`, `systems/missions.js:2124`, `systems/missions.js:2354`, `systems/missions.js:2388`, `systems/missions.js:2400`, `systems/missions.js:2550`, `systems/missions.js:3347`, `systems/missions.js:3362`, `systems/missions.js:3456`, `systems/missions.js:3707`, `systems/missions.js:3919`, `systems/missions.js:4617`, `systems/missions.js:4656`, `systems/missions.js:4669`, `systems/missions.js:4677`, `systems/missions.js:4693`, `systems/missions.js:4739`, `systems/missions.js:4800`, `systems/missions.js:4951`, `systems/missions.js:4960`, `systems/missions.js:5186`, `systems/missions.js:5212`, `systems/missions.js:5280`, `systems/missions.js:5296`, `systems/missions.js:5340`, `systems/missions.js:5361`, `systems/missions.js:5397`, `systems/missions.js:5449`, `systems/missions.js:5629`, `systems/missions.js:6663`, `systems/missions.js:6845`, `systems/missions.js:6983`, `systems/missions.js:7044`, `systems/missions.js:7081`, `systems/missions.js:7171`, `systems/missions.js:7178`, `systems/missions.js:7733`, `systems/missions.js:8155`, `systems/missions.js:8200`, `systems/missions.js:8586`, `systems/missions.js:8879`, `systems/missions.js:8899`, `systems/missions.js:9066`, `systems/missions.js:9171`, `systems/missions.js:9253`, `systems/missions.js:9323`, `systems/missions.js:9527`, `systems/missions.js:9560`, `systems/missions.js:9575`, `systems/missions.js:9589`, `systems/missions.js:9949`, `systems/missions.js:10231`, `systems/missions.js:10377` | `ui/hud.js:4146`, `ui/screens/missionLog.js:2427`, `ui/station/screens/contracts.js:1460` |
| `mode:changed` | `main.js:328`, `main.js:1114`, `main.js:1124`, `main.js:1135`, `save/saveSystem.js:4332`, `save/saveSystem.js:4356`, `save/saveSystem.js:4789`, `save/saveSystem.js:5032` | `systems/autoTargetAssist.js:114`, `systems/presentationAdapters.js:209`, `systems/scanner.js:927`, `ui/loadingPresenter.js:186`, `ui/screenManager.js:674`, `ui/screens/mainMenu.js:870`, `ui/uiRoot.js:871`, `ui/wingmanRadial.js:329` |
| `module:equipped` | `systems/ships.js:2429` | `systems/onboarding.js:497`, `systems/onboarding.js:502`, `systems/onboarding.js:768`, `systems/ships.js:1585`, `systems/survivalDraft.js:180`, `systems/world.js:583` |
| `module:fitRefused` | `systems/ships.js:2043`, `systems/ships.js:2376` | `ui/station/screens/shipworks.js:4010` |
| `module:granted` | `systems/ships.js:2118` | — |
| `module:purchased` | `systems/ships.js:2101` | — |
| `module:unequipped` | `systems/ships.js:1761`, `systems/ships.js:2453` | `systems/ships.js:1586`, `systems/survivalDraft.js:181`, `systems/world.js:584` |
| `moment:amended` | `systems/bulletTime.js:256` | `ui/screens/clips.js:85` |
| `moment:holyShit` | — | `render/feel.js:1409` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:295` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | `systems/encounterDirector.js:297` |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:181` |
| `moralTrap:resolved` | `systems/moralTrap.js:297` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:245` | `ui/moralTrapPrompt.js:37` |
| `morrow:launch` | `systems/morrow.js:243` | — |
| `morrow:met` | `systems/morrow.js:182` | — |
| `morrow:voice` | `systems/morrow.js:156` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:3102` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:314` |
| `nav:abortRoute` | — | `systems/routeFollower.js:356` |
| `nav:autopilot` | `systems/flight.js:408`, `systems/flightV3.js:1225`, `systems/world.js:5302` | `systems/routeFollower.js:359` |
| `nav:engageRoute` | `systems/routeFollower.js:354` | `systems/routeFollower.js:349` |
| `nav:routeBrake` | — | `audio/audioSystem.js:2527` |
| `nav:waypoint` | `save/saveSystem.js:5439`, `systems/claims.js:1834`, `systems/claims.js:1842`, `systems/missions.js:1327`, `systems/missions.js:3908`, `systems/missions.js:3975`, `systems/missions.js:4007`, `systems/missions.js:4635`, `systems/world.js:5301`, `ui/market/tradeLogic.js:484` | `render/authoredMotion.js:904` |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:123` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:188` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:119` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `news:headline` | `systems/aftermathWrecks.js:804`, `systems/e1EncounterRuntime.js:225`, `systems/nemesisSignals.js:25`, `systems/traffic.js:9407`, `systems/traffic.js:11142`, `ui/marketNews.js:266` | — |
| `news:publish` | `data/encounters/362-the-salvage-watch.js:171`, `data/encounters/362-the-salvage-watch.js:186`, `data/encounters/362-the-salvage-watch.js:280`, `data/encounters/365-the-grandee.js:102`, `data/encounters/365-the-grandee.js:121`, `data/encounters/365-the-grandee.js:169`, `systems/aftermathWrecks.js:822`, `systems/choirReliefBerth.js:340`, `systems/claims.js:2307`, `systems/claims.js:2511`, `systems/claims.js:3022`, `systems/claims.js:3069`, `systems/eighthBellRuntime.js:122`, `systems/factions.js:536`, `systems/memorialThief.js:135`, `systems/npcJobsRuntime.js:1137`, `systems/traffic.js:4106`, `systems/traffic.js:10753`, `systems/uniqueWrecks.js:558`, `systems/uniqueWrecks.js:1721`, `systems/world.js:876`, `ui/watchlistHud.js:77` | — |
| `news:render` | `ui/hud.js:1670` | — |
| `npc:hailed` | `systems/barkDirector.js:1405`, `systems/barkDirector.js:1455` | `render/authoredMotion.js:939` |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:4843` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1581` |
| `npcjobs:load` | — | `systems/traffic.js:1579` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1113` | `systems/barkDirector.js:515` |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1106` | `ui/station/barContacts.js:181` |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1094` | `ui/station/barContacts.js:180` |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1092` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3148` | `render/authoredMotion.js:924` |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:4244` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:4316` | `render/npcJobSignatureVfx.js:711`, `render/npcJobSignatureVfx.js:902` |
| `npcjobs:unload` | — | `systems/traffic.js:1580` |
| `npcjobs:work` | — | `systems/traffic.js:1578` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:4411` | `systems/stationSideEventDirector.js:98` |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:4432` | — |
| `occupation:delivered` | `systems/scavengerOccupationSwitch.js:238` | — |
| `occupation:switched` | `systems/scavengerOccupationSwitch.js:209` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:2131`, `systems/onboarding.js:2935` | — |
| `onboarding:rosterPrewarm` | `systems/onboarding.js:1832` | — |
| `optic:beamContact` | `systems/combat.js:1393` | — |
| `optic:contact` | `systems/weapons.js:2129`, `systems/weapons.js:2190` | `audio/audioSystem.js:2346` |
| `optic:rekindled` | — | `audio/audioSystem.js:2347` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1143` | `systems/world.js:590` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:2111` | `systems/story.js:152` |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1256` | — |
| `orrinWitness:submitted` | `systems/story.js:1284` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:6452` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:592` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:6248` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:6283` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:6412` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:6366` | `ui/recoveryEncounterPrompt.js:478` |
| `patrol:proximity` | `systems/encounterScripts.js:434` | `systems/economy.js:1475`, `systems/moralTrap.js:180` |
| `pds:intercept` | `systems/countermeasures.js:440` | `audio/audioSystem.js:2331` |
| `physics:impact` | `core/physics.js:1904` | `audio/audioSystem.js:2341`, `render/asteroidMotionPresentation.js:448`, `render/feel.js:1386`, `render/shipMicroMotion.js:1286`, `render/vfx.js:2513`, `systems/asteroidSites.js:548`, `systems/barkDirector.js:537`, `systems/collisionConsequences.js:93`, `systems/fields.js:503`, `systems/fragileCargo.js:284`, `systems/gamepad.js:791`, `systems/heistFacilities.js:267`, `systems/impulseCharges.js:275`, `systems/lootShards.js:591`, `systems/masslineImpactDamage.js:49`, `systems/ships.js:1677`, `systems/survivalResults.js:488`, `systems/swarmArena.js:447`, `systems/swarmElites.js:137`, `systems/volatileExposure.js:214`, `testing/motionScenarios.js:1656`, `ui/hud.js:2192` |
| `pickup:collected` | `core/physics.js:1677`, `systems/mining.js:1409`, `systems/mining.js:2332`, `systems/uniqueWrecks.js:1599` | `audio/audioSystem.js:2400`, `render/vfx.js:2615`, `save/saveSystem.js:358`, `systems/economy.js:1437`, `systems/encounterDirector.js:280`, `systems/lawSecurity.js:325`, `systems/mining.js:240`, `systems/onboarding.js:459`, `systems/onboarding.js:528`, `systems/presentationOrchestrator.js:216`, `systems/swarmEvents.js:92`, `systems/swarmSupply.js:107`, `systems/tetherGameplay.js:272`, `systems/traffic.js:1589`, `systems/world.js:593`, `systems/world.js:594`, `systems/world.js:597`, `systems/world.js:662`, `ui/floatingText.js:293` |
| `pirateDisengage:triggered` | — | `systems/combatOutcome.js:190` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:132` | `systems/pirateParley.js:98` |
| `pirateParley:demand` | `systems/scanner.js:1480` | `ui/pirateParleyPrompt.js:160` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:189`, `ui/pirateParleyPrompt.js:161` |
| `pirateParley:started` | — | `systems/combatOutcome.js:188` |
| `planet:collector` | `systems/planetRuntime.js:539` | `audio/audioSystem.js:2440`, `render/authoredMotion.js:943`, `systems/onboarding.js:780` |
| `planet:harvest` | `systems/planetRuntime.js:617` | `audio/audioSystem.js:2441` |
| `planet:harvestDenied` | `systems/planetRuntime.js:624` | `audio/audioSystem.js:2442` |
| `planet:npcHarvest` | `systems/planetRuntime.js:604` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:417`, `systems/planetRuntime.js:430` | `audio/audioSystem.js:2443` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:514` | `audio/audioSystem.js:2444` |
| `planet:registered` | `systems/planetRuntime.js:196` | — |
| `planet:unregistered` | `systems/planetRuntime.js:265` | — |
| `player:death` | `systems/combat.js:836`, `systems/combat.js:967`, `systems/combat.js:1156`, `systems/world.js:5695` | `audio/audioSystem.js:2383`, `render/feel.js:1294`, `render/shipMicroMotion.js:1297`, `render/vfx.js:2572`, `save/saveSystem.js:365`, `systems/aftermathWrecks.js:970`, `systems/lawSecurity.js:324`, `systems/missions.js:1471`, `systems/onboarding.js:490`, `systems/onboarding.js:527`, `systems/surrenderRecovery.js:78`, `systems/survivalResults.js:496`, `systems/survivalRun.js:130`, `systems/survivorPod.js:478`, `ui/commandBar.js:405`, `ui/hud.js:2696`, `ui/survivalHud.js:227` |
| `player:recoveryFailed` | `systems/combat.js:1020` | `ui/screens/gameOver.js:553` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:451` | `systems/combat.js:693` |
| `player:respawn` | `systems/combat.js:1093`, `systems/combat.js:1169` | `audio/audioSystem.js:2384`, `render/shipMicroMotion.js:1296`, `save/saveSystem.js:366`, `save/saveSystem.js:416`, `ui/commandBar.js:409`, `ui/hud.js:2710`, `ui/screens/gameOver.js:545` |
| `player:scannedByPatrol` | `systems/economy.js:3697` | `render/authoredMotion.js:922`, `render/vfx.js:2559`, `systems/missions.js:1461`, `ui/customsPrompt.js:149` |
| `poi:discovered` | `systems/world.js:905`, `systems/world.js:5435`, `systems/world.js:5513`, `systems/world.js:5970`, `systems/world.js:5996` | `audio/audioSystem.js:2464`, `systems/encounterDirector.js:298`, `systems/world.js:624` |
| `poi:identified` | `systems/world.js:5520`, `systems/world.js:5997` | `systems/encounterDirector.js:299`, `systems/missions.js:1314`, `systems/world.js:625` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2451` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2450` |
| `presentation:audioCue` | `render/vfx.js:5795`, `systems/presentationAdapters.js:565` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:478` | — |
| `presentation:caption` | `audio/audioSystem.js:2678`, `audio/audioSystem.js:5644`, `systems/factionPresence.js:889`, `systems/factionPresence.js:1228`, `systems/factionPresence.js:1243`, `systems/factionPresence.js:1261`, `systems/factionPresence.js:1323`, `systems/presentationAdapters.js:663`, `systems/story.js:1087`, `systems/story.js:1339` | `ui/hud.js:2759` |
| `presentation:cue` | `systems/aftermathWrecks.js:1304`, `systems/cargo.js:961`, `systems/planetRuntime.js:441`, `systems/salvageActions.js:270`, `systems/salvageActions.js:482` | `audio/audioSystem.js:2552`, `render/vfx.js:2609`, `render/vfx.js:2610`, `render/vfx.js:2611`, `systems/presentationAdapters.js:206` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:460` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:381`, `systems/presentationAdapters.js:642` | — |
| `presentation:vfxCue` | `render/vfx.js:2628`, `systems/fields.js:2308`, `systems/fields.js:2359`, `systems/hullBurst.js:218`, `systems/hullBurst.js:352`, `systems/hullBurst.js:376`, `systems/hullBurst.js:565`, `systems/massSeed.js:314`, `systems/massSeed.js:430`, `systems/massSeed.js:524`, `systems/massSeed.js:566`, `systems/masslineThrow.js:550`, `systems/missions.js:3469`, `systems/missions.js:7749`, `systems/planetRuntime.js:647`, `systems/presentationAdapters.js:527`, `systems/tumbleStates.js:475`, `systems/tumbleStates.js:540`, `systems/volatileExposure.js:487`, `systems/volatileExposure.js:561`, `systems/weapons.js:1641`, `systems/weapons.js:1818`, `systems/weapons.js:2858` | `render/vfx.js:2614` |
| `projectile:bank` | — | `render/vfx.js:2507` |
| `projectile:hit` | `core/physics.js:944`, `core/physics.js:1119`, `systems/sectorSim.js:639` | `audio/audioSystem.js:2324`, `combat/tetherWebs.js:39`, `render/vfx.js:2506`, `systems/bombs.js:588`, `systems/combat.js:685`, `systems/missions.js:1426` |
| `projectile:nearMiss` | `core/physics.js:1079` | `audio/audioSystem.js:2327`, `systems/presentationOrchestrator.js:174`, `ui/hud.js:2191` |
| `projectile:ricochet` | — | `render/vfx.js:2508` |
| `range:opened` | `ui/screens/range.js:2581` | `systems/onboarding.js:514` |
| `ravel:cast` | `systems/ravel.js:141` | — |
| `ravel:destroyed` | `systems/ravel.js:176` | — |
| `ravel:hit` | `systems/ravel.js:155` | — |
| `ravel:pacified` | `systems/ravel.js:164` | — |
| `ravel:telegraph` | `systems/ravel.js:122` | — |
| `ravel:unthreaded` | `systems/ravel.js:161` | — |
| `ravel:voice` | `systems/ravel.js:95` | — |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:161` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:162` |
| `rescue:beat` | `systems/onboarding.js:2307`, `systems/onboarding.js:2339` | — |
| `rescue:complete` | `systems/onboarding.js:2318` | — |
| `rescue:started` | `systems/onboarding.js:1891` | `systems/onboarding.js:491` |
| `rescuedWorker:returned` | `systems/rescuedWorkerReturn.js:420` | — |
| `research:pointsChanged` | `systems/missions.js:4984`, `systems/missions.js:5038`, `systems/missions.js:5072`, `systems/missions.js:7686`, `systems/missions.js:7700`, `systems/missions.js:10191` | `ui/alerts.js:408` |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2579` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1321` | `systems/encounterDirector.js:309` |
| `rhythm:phase` | `systems/encounterDirector.js:459` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:317` | `ui/station/barContacts.js:138` |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:121` |
| `run:awardRequested` | `systems/swarmEvents.js:275`, `ui/sandbox/sandboxSetup.js:1215`, `ui/sandbox/sandboxSetup.js:1230` | `systems/runSession.js:68` |
| `run:awarded` | — | `ui/survivalHud.js:207` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1135`, `ui/sandbox/sandboxSetup.js:1177` | `systems/runSession.js:65` |
| `run:draftLockRequested` | `ui/screens/crucibleDraft.js:1241` | `systems/survivalDraft.js:171` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:783`, `ui/screens/crucibleDraft.js:788`, `ui/screens/crucibleDraft.js:1134`, `ui/screens/crucibleDraft.js:1225`, `ui/screens/crucibleDraft.js:1376` | `systems/survivalDraft.js:163` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:905` | `systems/survivalDraft.js:172` |
| `run:draftResolved` | — | `systems/survivalRun.js:124` |
| `run:endRequested` | `save/saveSystem.js:309` | `systems/runSession.js:67` |
| `run:ended` | — | `audio/audioSystem.js:2415`, `systems/survivalAnnounce.js:331`, `systems/survivalArena.js:945`, `systems/survivalDraft.js:187`, `systems/survivalResults.js:533`, `systems/survivalRun.js:118`, `systems/survivalWave.js:139`, `systems/swarmArena.js:448`, `systems/swarmChain.js:108`, `systems/swarmElites.js:141`, `systems/swarmEvents.js:91`, `systems/swarmJuice.js:105`, `systems/swarmSupply.js:109`, `ui/swarmJuiceHud.js:102` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:127` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:329`, `ui/survivalHud.js:208` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1251` | `systems/ships.js:1709`, `systems/survivalRun.js:119`, `systems/swarmSupply.js:102`, `systems/world.js:620` |
| `run:modifierChosen` | — | `systems/survivalRun.js:125` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:70` |
| `run:openingLessonReleased` | — | `systems/survivalAnnounce.js:327` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1252` | `systems/survivalRun.js:120` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1477`, `ui/screens/crucibleDraft.js:1494` | `systems/survivalDraft.js:164` |
| `run:refitClosed` | — | `systems/survivalRun.js:126` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:1859` | `systems/survivalDraft.js:165` |
| `run:refitSellRequested` | `ui/screens/crucibleDraft.js:1890` | `systems/survivalDraft.js:170` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:1855` | `systems/survivalDraft.js:166` |
| `run:resultsReady` | — | `systems/achievements.js:1112`, `ui/uiRoot.js:1357` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:176` |
| `run:spendRequested` | — | `systems/runSession.js:69` |
| `run:spent` | — | `systems/survivalDraft.js:175` |
| `run:started` | — | `audio/audioSystem.js:2414`, `sim/killcamTape.js:430`, `systems/survivalAnnounce.js:322`, `systems/survivalResults.js:483`, `systems/survivalRun.js:116`, `systems/swarmElites.js:140`, `systems/swarmJuice.js:104`, `ui/survivalHud.js:209`, `ui/swarmJuiceHud.js:101`, `ui/uiRoot.js:1369` |
| `run:threatRequested` | — | `systems/runSession.js:71` |
| `run:transitionRequested` | `systems/survivalRun.js:544` | `systems/runSession.js:66` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:330`, `systems/survivalDraft.js:162`, `systems/survivalResults.js:532`, `systems/survivalRun.js:117`, `systems/survivalWave.js:138`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:328`, `systems/survivalArena.js:944`, `systems/survivalResults.js:486`, `systems/swarmEvents.js:90` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:122` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:325` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:497` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:323`, `systems/survivalArena.js:911`, `systems/survivalWave.js:136`, `systems/swarmArena.js:444`, `systems/swarmJuice.js:98`, `ui/survivalHud.js:220` |
| `run:waveProgress` | — | `ui/survivalHud.js:221` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:324`, `systems/survivalResults.js:485`, `systems/survivalWave.js:137`, `systems/swarmArena.js:445`, `systems/swarmEvents.js:89`, `systems/swarmJuice.js:99`, `ui/swarmJuiceHud.js:100` |
| `salvage:actionRead` | `systems/salvageActions.js:216` | — |
| `salvage:bayCashedIn` | `systems/cargo.js:990` | — |
| `salvage:changed` | `systems/cargo.js:485`, `systems/cargo.js:991` | — |
| `salvage:claimJumped` | `systems/mining.js:1898` | `systems/missions.js:1504` |
| `salvage:communicatorFound` | `systems/salvage.js:1025` | `systems/encounterDirector.js:300`, `systems/story.js:265`, `ui/wreckChoicePrompt.js:44` |
| `salvage:completed` | `systems/mining.js:1757` | `render/vfx.js:2577`, `systems/aftermathWrecks.js:989`, `systems/lawSecurity.js:331`, `systems/missions.js:1381`, `systems/missions.js:1505`, `systems/story.js:250` |
| `salvage:cookerFlight` | `systems/salvageActions.js:477` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:623` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:267` | `render/authoredMotion.js:929` |
| `salvage:cutComplete` | `systems/mining.js:531` | `audio/audioSystem.js:2418`, `render/authoredMotion.js:898`, `render/vfx.js:2576` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | `systems/salvage.js:151` |
| `salvage:npcExtraction` | `systems/traffic.js:7099` | `render/authoredMotion.js:897` |
| `salvage:npcUnload` | `systems/traffic.js:10876` | `systems/economy.js:1441` |
| `salvage:placed` | `systems/salvage.js:416` | `systems/lossInvestigation.js:123`, `systems/survivorPod.js:454` |
| `salvage:reactorBurst` | `systems/salvageActions.js:729` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:334` | `systems/salvage.js:147` |
| `salvage:reactorVented` | `systems/salvageActions.js:231` | — |
| `salvage:sortDelivered` | `systems/salvage.js:864` | — |
| `salvage:sortImpact` | `systems/salvage.js:828` | — |
| `salvage:sortLost` | `systems/salvage.js:885` | — |
| `salvage:sortSeparated` | `systems/salvage.js:792` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:131` |
| `save:backup` | `save/saveSystem.js:1550` | — |
| `save:completed` | `save/saveSystem.js:1556` | `ui/screens/saveLoad.js:852`, `ui/uiRoot.js:413` |
| `save:dirty` | — | `save/saveSystem.js:342` |
| `save:envelopePrepared` | `save/saveSystem.js:3838`, `save/saveSystem.js:3854` | `main.js:204` |
| `save:envelopeSpecPrepared` | `save/saveSystem.js:1930` | `main.js:203` |
| `save:error` | `main.js:218`, `save/saveSystem.js:1103`, `save/saveSystem.js:1623`, `save/saveSystem.js:3707`, `save/saveSystem.js:3725`, `save/saveSystem.js:3769`, `save/saveSystem.js:3790`, `save/saveSystem.js:3809`, `save/saveSystem.js:3879`, `save/saveSystem.js:4010`, `save/saveSystem.js:4031`, `save/saveSystem.js:4048`, `save/saveSystem.js:4204`, `save/saveSystem.js:4218`, `save/saveSystem.js:4312`, `save/saveSystem.js:4344`, `save/saveSystem.js:4391`, `save/saveSystem.js:4509`, `save/saveSystem.js:4545`, `save/saveSystem.js:5079`, `save/saveSystem.js:5087`, `save/saveSystem.js:5128`, `save/saveSystem.js:5721`, `save/saveSystem.js:5739`, `save/saveSystem.js:5836`, `save/saveSystem.js:5855`, `ui/screens/saveLoad.js:1325` | `systems/aftermathWrecks.js:1001`, `systems/asteroidSites.js:547`, `systems/automation.js:563`, `systems/encounterDirector.js:272`, `systems/traffic.js:1605`, `ui/loadingPresenter.js:195`, `ui/screenManager.js:675`, `ui/uiRoot.js:439` |
| `save:exportRecovery` | `save/saveSystem.js:5710` | `ui/toasts.js:472` |
| `save:loadSpeculationTarget` | `ui/screens/gameOver.js:817`, `ui/screens/pause.js:1083`, `ui/screens/saveLoad.js:1028` | `save/saveSystem.js:322` |
| `save:loaded` | `save/saveSystem.js:5044` | `audio/audioSystem.js:2755`, `audio/bombAudio.js:460`, `audio/fieldAudio.js:188`, `careers/origins/haulerOriginSystem.js:65`, `combat/tetherWebs.js:48`, `core/coreSystem.js:229`, `core/physics.js:141`, `main.js:288`, `render/feel.js:1201`, `render/shipMicroMotion.js:1281`, `render/vfx.js:2555`, `render/vfx.js:2566`, `save/saveSystem.js:378`, `save/saveSystem.js:394`, `systems/aftermathWrecks.js:1000`, `systems/aiEncounter.js:137`, `systems/asteroidFormations.js:124`, `systems/asteroidSites.js:538`, `systems/autoTargetAssist.js:129`, `systems/automation.js:558`, `systems/barkDirector.js:476`, `systems/beacons.js:45`, `systems/bombs.js:587`, `systems/collisionConsequences.js:98`, `systems/combat.js:722`, `systems/combatOutcome.js:165`, `systems/countermeasures.js:223`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:85`, `systems/economy.js:1492`, `systems/encounterDirector.js:271`, `systems/environmentalMachinery.js:216`, `systems/factionPresence.js:455`, `systems/fields.js:491`, `systems/flight.js:79`, `systems/flightV3.js:176`, `systems/gateControlDirector.js:71`, `systems/heat.js:323`, `systems/heistFacilities.js:271`, `systems/impulseCharges.js:283`, `systems/lawSecurity.js:321`, `systems/lossInvestigation.js:129`, `systems/massSeed.js:121`, `systems/masslineSnares.js:138`, `systems/mines.js:78`, `systems/mining.js:258`, `systems/missions.js:1296`, `systems/npcJobsRuntime.js:920`, `systems/npcJobsRuntime.js:928`, `systems/npcJobsRuntime.js:974`, `systems/onboarding.js:435`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:213`, `systems/presentationOrchestrator.js:285`, `systems/routeFollower.js:376`, `systems/runSession.js:76`, `systems/salvageActions.js:135`, `systems/sectorSim.js:117`, `systems/ships.js:1596`, `systems/stationContactLoadBoundary.js:39`, `systems/stationSideEventDirector.js:97`, `systems/story.js:146`, `systems/survivalArena.js:959`, `systems/survivorPod.js:476`, `systems/tetherGameplay.js:263`, `systems/titles.js:585`, `systems/traffic.js:1623`, `systems/traffic.js:1649`, `systems/traffic.js:1659`, `systems/traffic.js:1662`, `systems/travelLanes.js:492`, `systems/tumbleStates.js:123`, `systems/uniqueLootAbilities.js:149`, `systems/wingmen.js:145`, `systems/world.js:605`, `ui/alerts.js:403`, `ui/automationPayoff.js:76`, `ui/bandHud.js:91`, `ui/capitalBossOverlayMount.js:93`, `ui/cargoConscience.js:146`, `ui/hudLayout.js:120`, `ui/moralTrapPrompt.js:43`, `ui/priceHistory.js:147`, `ui/uiRoot.js:420`, `ui/uiRoot.js:1373`, `ui/wreckChoicePrompt.js:51` |
| `save:recovered` | `save/saveSystem.js:3758`, `save/saveSystem.js:3868` | `ui/uiRoot.js:432` |
| `save:restoring` | `save/saveSystem.js:4654` | `core/coreSystem.js:226`, `render/feel.js:1200`, `render/vfx.js:2554`, `render/vfx.js:2565`, `systems/aftermathWrecks.js:999`, `systems/asteroidSites.js:530`, `systems/autoTargetAssist.js:126`, `systems/automation.js:552`, `systems/cloak.js:74`, `systems/encounterDirector.js:264`, `systems/environmentalMachinery.js:215`, `systems/lawSecurity.js:320`, `systems/missions.js:1300`, `systems/npcJobsRuntime.js:921`, `systems/runSession.js:75`, `systems/salvage.js:141`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:38`, `systems/surrenderRecovery.js:79`, `systems/traffic.js:1598`, `systems/world.js:598` |
| `save:slotsValidated` | `save/saveSystem.js:1887` | `ui/screens/saveLoad.js:851` |
| `save:started` | `save/saveSystem.js:1243`, `save/saveSystem.js:2435` | `ui/screenManager.js:682`, `ui/uiRoot.js:409` |
| `scan:completed` | `balance/careerCohorts.js:497`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:1135`, `systems/world.js:5439` | `careers/origins/prospectorOrigin.js:633`, `systems/asteroidFormations.js:130`, `systems/missions.js:1394`, `systems/onboarding.js:471`, `systems/presentationOrchestrator.js:190`, `systems/salvage.js:138`, `systems/salvageActions.js:130`, `systems/story.js:254`, `systems/story.js:255`, `systems/world.js:651`, `ui/hud.js:4616` |
| `scan:debrisCache` | `systems/mining.js:1799`, `systems/scanReveal.js:219` | `systems/presentationOrchestrator.js:200` |
| `scan:pulse` | `systems/scanner.js:1050` | `render/authoredMotion.js:873`, `render/shipMicroMotion.js:1306`, `systems/buildIdentity.js:305`, `systems/cloak.js:91`, `systems/encounterDirector.js:289`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:189`, `systems/scanReveal.js:60`, `ui/hud.js:4617` |
| `scan:shipRevealed` | `systems/scanReveal.js:87` | `audio/audioSystem.js:2307`, `systems/buildIdentity.js:304` |
| `scan:weakPoint` | `systems/scanner.js:1124` | `ui/hud.js:1715` |
| `scan:wreckInvestigated` | `systems/scanReveal.js:124` | — |
| `scan:wreckResolved` | `systems/scanner.js:1079` | `systems/lawSecurity.js:330` |
| `scan:wreckRevealed` | `systems/scanReveal.js:120` | `audio/audioSystem.js:2308`, `systems/presentationOrchestrator.js:199` |
| `scanner:ghostEscaped` | `systems/scanner.js:992` | `systems/presentationOrchestrator.js:196` |
| `scanner:ghostRevealed` | `systems/scanner.js:1098` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:94` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:282` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:519`, `ui/comms.js:523` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:1041` | `systems/presentationOrchestrator.js:187` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:1093` | `audio/audioSystem.js:2513`, `audio/bombAudio.js:457`, `audio/fieldAudio.js:185`, `render/shipMicroMotion.js:1280`, `render/vfx.js:2550`, `render/vfx.js:2561`, `save/saveSystem.js:399`, `systems/achievements.js:1098`, `systems/aftermathWrecks.js:975`, `systems/aiEncounter.js:138`, `systems/asteroidFormations.js:123`, `systems/asteroidSites.js:495`, `systems/automation.js:588`, `systems/bombs.js:579`, `systems/claims.js:356`, `systems/claims.js:358`, `systems/combatOutcome.js:180`, `systems/difficultyDirector.js:170`, `systems/dockingCorridor.js:83`, `systems/economy.js:1463`, `systems/encounterDirector.js:260`, `systems/factionPresence.js:442`, `systems/fields.js:489`, `systems/heistFacilities.js:246`, `systems/intervention.js:75`, `systems/lossInvestigation.js:124`, `systems/massSeed.js:119`, `systems/masslineSnares.js:134`, `systems/mines.js:76`, `systems/mining.js:257`, `systems/missions.js:1488`, `systems/moralTrap.js:178`, `systems/npcJobsRuntime.js:909`, `systems/onboarding.js:578`, `systems/presentationOrchestrator.js:235`, `systems/routeFollower.js:368`, `systems/salvage.js:112`, `systems/salvageActions.js:138`, `systems/sectorSim.js:114`, `systems/story.js:205`, `systems/story.js:253`, `systems/survivalArena.js:957`, `systems/survivorPod.js:457`, `systems/tetherGameplay.js:267`, `systems/traffic.js:1547`, `systems/wingmen.js:122`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:154`, `ui/securityReadout.js:157`, `ui/watchlistHud.js:91` |
| `sector:exit` | `systems/world.js:966` | `audio/bombAudio.js:456`, `audio/fieldAudio.js:184`, `render/vfx.js:2551`, `render/vfx.js:2562`, `systems/achievements.js:1104`, `systems/aftermathWrecks.js:979`, `systems/asteroidSites.js:520`, `systems/automation.js:577`, `systems/bombs.js:578`, `systems/dockingCorridor.js:82`, `systems/encounterDirector.js:262`, `systems/environmentalMachinery.js:213`, `systems/factionPresence.js:447`, `systems/fields.js:488`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:265`, `systems/impulseCharges.js:284`, `systems/lawSecurity.js:319`, `systems/massSeed.js:118`, `systems/masslineSnares.js:132`, `systems/mines.js:75`, `systems/mining.js:245`, `systems/missions.js:1489`, `systems/npcJobsRuntime.js:908`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:113`, `systems/spawnBudget.js:50`, `systems/stationServices.js:207`, `systems/stationSideEventDirector.js:96`, `systems/surrenderRecovery.js:77`, `systems/survivalArena.js:958`, `systems/tetherGameplay.js:266`, `systems/traffic.js:1570`, `systems/wingmen.js:134`, `ui/customsPrompt.js:151`, `ui/impoundPayPrompt.js:49`, `ui/impoundPayPrompt.js:54`, `ui/promptDeck.js:764`, `ui/wreckChoicePrompt.js:49` |
| `sector:membershipCandidate` | `systems/world.js:2313` | — |
| `sectorsim:embodiment` | `systems/sectorSim.js:908` | `systems/world.js:635` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:343` | `ui/screens/starmap.js:863` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1863`, `systems/claims.js:1796`, `systems/encounterDirector.js:1944`, `systems/mining.js:2492` | `systems/sectorSim.js:122`, `systems/world.js:650` |
| `sectorsim:intel` | `systems/sectorSim.js:962` | `systems/world.js:640` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:738` | `systems/economy.js:1506` |
| `sectorsim:reconcile` | `systems/sectorSim.js:691` | `systems/world.js:641` |
| `sectorsim:tick` | `systems/sectorSim.js:288` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:650` | `ui/screens/starmap.js:864` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:551` | `systems/scanner.js:931` |
| `service:aborted` | `systems/stationServices.js:256` | `audio/audioSystem.js:2458`, `render/authoredMotion.js:892` |
| `service:completed` | `systems/economy.js:3213`, `systems/economy.js:3352`, `systems/economy.js:3384`, `systems/economy.js:3430`, `systems/economy.js:3471`, `systems/economy.js:3501`, `systems/economy.js:3539`, `systems/stationServices.js:475`, `systems/stationServices.js:492` | `render/authoredMotion.js:891`, `render/authoredMotion.js:895`, `systems/ships.js:1681` |
| `service:progress` | `systems/stationServices.js:417` | — |
| `service:queued` | `systems/stationServices.js:324` | — |
| `service:started` | `systems/stationServices.js:406` | `audio/audioSystem.js:2457`, `render/authoredMotion.js:890` |
| `settings:changed` | `save/saveSystem.js:5095`, `save/saveSystem.js:5096`, `systems/touch.js:701`, `ui/screens/motionAsk.js:95`, `ui/screens/pause.js:613`, `ui/screens/pause.js:621`, `ui/screens/pause.js:699`, `ui/screens/pause.js:732`, `ui/screens/settings.js:492`, `ui/screens/settings.js:935`, `ui/screens/settings.js:994`, `ui/screens/settings.js:1070` | `audio/audioSystem.js:2694`, `main.js:287`, `render/vfx.js:2568`, `save/saveSystem.js:336`, `ui/uiRoot.js:734` |
| `ship:appearanceChanged` | `systems/ships.js:1964`, `systems/ships.js:2283`, `systems/traffic.js:3644` | `core/coreSystem.js:225`, `render/vfx.js:2556` |
| `ship:appearanceSaved` | `systems/ships.js:2285` | `ui/station/screens/shipworks.js:706` |
| `ship:boostPreKick` | `systems/flightV3.js:525` | `render/authoredMotion.js:887`, `render/feel.js:1321` |
| `ship:boostStart` | `systems/flight.js:110`, `systems/flightV3.js:228` | `audio/audioSystem.js:2520`, `render/authoredMotion.js:888`, `render/vfx.js:2595`, `systems/cruise.js:58`, `systems/onboarding.js:515` |
| `ship:boostStop` | `systems/flight.js:111`, `systems/flight.js:224`, `systems/flightV3.js:229`, `systems/flightV3.js:640` | `audio/audioSystem.js:2525`, `render/authoredMotion.js:889`, `render/vfx.js:2596` |
| `ship:cargoCapChanged` | `systems/ships.js:1959` | — |
| `ship:dash` | `systems/flight.js:201`, `systems/flightV3.js:618` | `audio/audioSystem.js:2528`, `render/vfx.js:2597`, `systems/uniqueLootAbilities.js:147` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2249` | `render/vfx.js:2619` |
| `ship:deathPop` | `render/shipMicroMotion.js:984`, `render/shipMicroMotion.js:2239` | `render/vfx.js:2618` |
| `ship:livingHullChanged` | `systems/ships.js:1783`, `systems/ships.js:1835`, `systems/story.js:1881` | `systems/barkDirector.js:479` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2710` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2607`, `systems/ships.js:2632`, `systems/ships.js:2700` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2566` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2537` | — |
| `ship:massChanged` | `systems/ships.js:2134` | `ui/hud.js:4145` |
| `ship:nameChanged` | `systems/ships.js:2308` | — |
| `ship:parkedHoldSwap` | `systems/ships.js:2235` | — |
| `ship:purchased` | `systems/ships.js:2173` | `audio/audioSystem.js:2505`, `systems/missions.js:1515` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1033`, `render/shipMicroMotion.js:2226` | `render/vfx.js:2617` |
| `ship:roleContext` | `systems/ships.js:1893` | `systems/presentationAdapters.js:208` |
| `ship:sold` | `systems/ships.js:2213` | — |
| `ship:statsChanged` | `systems/ships.js:1958` | `systems/world.js:585`, `ui/commandBar.js:410`, `ui/hud.js:4141` |
| `ship:swingDash` | `systems/flightV3.js:619` | `render/shipMicroMotion.js:1300` |
| `ship:thrust` | `systems/flight.js:435`, `systems/flightV3.js:1818` | `render/vfx.js:2594` |
| `ships:grantModule` | — | `systems/ships.js:1589` |
| `signal:investigate` | — | `systems/scanner.js:920` |
| `signal:investigated` | `systems/scanner.js:1697` | `systems/missions.js:1408`, `systems/presentationOrchestrator.js:193`, `systems/story.js:151`, `systems/world.js:588`, `ui/signalInvestigationPrompt.js:176` |
| `signal:investigating` | `systems/scanner.js:1390` | `ui/signalInvestigationPrompt.js:175` |
| `signal:receipt` | `systems/scanner.js:1698` | — |
| `signal:scanResults` | `systems/scanner.js:1136` | `systems/missions.js:1395`, `systems/presentationOrchestrator.js:191`, `systems/story.js:256`, `ui/signalInvestigationPrompt.js:173` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:921` |
| `signal:track` | — | `systems/scanner.js:919` |
| `signal:tracked` | `systems/scanner.js:1398`, `systems/scanner.js:1418` | `systems/presentationOrchestrator.js:192`, `ui/signalInvestigationPrompt.js:174` |
| `sim:pause` | `ui/screenManager.js:495` | `audio/audioSystem.js:2710`, `audio/bombAudio.js:463`, `audio/fieldAudio.js:190`, `render/feel.js:1198` |
| `sim:resume` | `ui/screenManager.js:502` | `audio/audioSystem.js:2711` |
| `site:anchored` | `systems/asteroidSites.js:1338` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:2349` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:2252` | `audio/audioSystem.js:2732` |
| `site:courierLost` | `systems/asteroidSites.js:2335` | — |
| `site:created` | `systems/asteroidSites.js:1276` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1684`, `systems/asteroidSites.js:1768` | — |
| `site:lost` | `systems/asteroidSites.js:1881` | `ui/alerts.js:393` |
| `site:machineInstalled` | `systems/asteroidSites.js:1307` | `audio/audioSystem.js:2731`, `ui/alerts.js:392` |
| `site:machineMode` | `systems/asteroidSites.js:1790` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1701` | `render/authoredMotion.js:907` |
| `site:machineStatus` | `systems/asteroidSites.js:2193` | `audio/audioSystem.js:2736`, `ui/alerts.js:388` |
| `site:overlayChanged` | `systems/asteroidSites.js:1774` | — |
| `site:podBuilt` | `systems/asteroidSites.js:2141` | — |
| `site:producing` | `systems/asteroidSites.js:1568` | `render/authoredMotion.js:906`, `ui/asteroid/asteroidScreen.js:1670` |
| `site:rematerialized` | `systems/asteroidSites.js:1933` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1486` | `ui/asteroid/asteroidScreen.js:1655` |
| `site:surveyComplete` | `systems/asteroidSites.js:1429` | `ui/asteroid/asteroidScreen.js:1649` |
| `site:surveyDetected` | `systems/asteroidSites.js:1419` | `ui/asteroid/asteroidScreen.js:1642` |
| `spawn:request` | `systems/automation.js:1601` | `systems/world.js:619` |
| `station:berthAssigned` | `systems/stationServices.js:386` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:228` | `render/vfx.js:2583` |
| `station:exitRequest` | `ui/screenManager.js:639`, `ui/uiRoot.js:1265` | `ui/station/stationApp.js:1318` |
| `station:holding` | `systems/stationServices.js:390` | — |
| `station:moduleGained` | `systems/claims.js:2300` | `systems/factions.js:467` |
| `station:navigate` | `ui/screens/automationPanel.js:1509`, `ui/station/screens/bar.js:769`, `ui/station/screens/bar.js:774`, `ui/station/screens/industry.js:496`, `ui/station/screens/industry.js:503` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:259` | `render/infrastructureMotion.js:201`, `render/vfx.js:2582` |
| `station:throughput` | `systems/claims.js:2270` | `render/authoredMotion.js:927` |
| `station:yardChanged` | `systems/stationServices.js:546` | — |
| `stationContact:changed` | `systems/stationContacts.js:312`, `systems/stationContacts.js:348`, `systems/stationContacts.js:476`, `systems/stationContacts.js:500` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:248`, `systems/stationContacts.js:517` | — |
| `stationContact:counterDelta` | `systems/missions.js:7551` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:336`, `systems/stationContacts.js:448` | — |
| `story:beatAdvanced` | `systems/missions.js:10217` | `save/saveSystem.js:406`, `systems/story.js:141`, `ui/screens/codex.js:777` |
| `story:continuationAccess` | `systems/story.js:2311` | — |
| `story:elroyResolved` | `systems/missions.js:5486` | `systems/story.js:142` |
| `story:kurtzLedger` | `systems/story.js:1629`, `systems/story.js:1640` | `systems/story.js:167` |
| `story:newGamePlusStarted` | `systems/story.js:1795` | `systems/titles.js:589`, `ui/hudMeta.js:104` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1766` | `systems/story.js:165` |
| `story:postEndingContinuity` | `systems/story.js:1529` | `ui/screens/missionLog.js:2448` |
| `story:postEndingProgress` | `systems/story.js:1499` | `ui/screens/missionLog.js:2447` |
| `story:replayHookUnlocked` | `systems/story.js:1514` | `ui/screens/missionLog.js:2449` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:483` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:482` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1318` | `systems/story.js:166` |
| `story:vergeObserversRevealed` | `systems/story.js:1086` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1338` | `systems/story.js:168` |
| `stunt:bridge` | `systems/stuntGrammar.js:207` | `ui/stuntCallout.js:543` |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:192` | `ui/stuntCallout.js:542` |
| `stunt:salvageRights` | `systems/stuntGrammar.js:113` | `ui/stuntCallout.js:540` |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:137` | `ui/stuntCallout.js:541` |
| `stunt:styleBanked` | `systems/stuntGrammar.js:100` | `audio/audioSystem.js:2406`, `ui/stuntCallout.js:531` |
| `stunt:trickAmended` | — | `systems/bulletTime.js:143`, `systems/survivalResults.js:491`, `systems/titles.js:588`, `ui/stuntCallout.js:530` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:2405`, `systems/bulletTime.js:142`, `systems/survivalResults.js:490`, `systems/titles.js:587`, `ui/stuntCallout.js:529`, `ui/toasts.js:436` |
| `surrender:escaped` | — | `systems/combatOutcome.js:186` |
| `surrender:secured` | — | `systems/traffic.js:1586` |
| `surrender:tethered` | — | `systems/traffic.js:1585` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1180` | — |
| `survivalWave:cohortJoined` | `systems/capitalBossRuntime.js:187` | `systems/survivalWave.js:145` |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:132` | `systems/survivorPod.js:473` |
| `survivorPod:delivered` | `systems/traffic.js:6434` | `render/authoredMotion.js:928`, `systems/titles.js:590` |
| `survivorPod:ejected` | `systems/survivorPod.js:676`, `systems/survivorPod.js:807` | `render/authoredMotion.js:911`, `systems/lawSecurity.js:318` |
| `survivorPod:promoted` | `systems/survivorPod.js:1110` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1217` | `ui/wreckChoicePrompt.js:48` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1229` | `render/authoredMotion.js:912`, `systems/missions.js:1466`, `ui/wreckChoicePrompt.js:46` |
| `survivorPod:rescued` | — | `systems/titles.js:591`, `systems/traffic.js:1592` |
| `survivorPod:resolved` | `systems/survivorPod.js:987` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1268` | `systems/missions.js:1468`, `ui/wreckChoicePrompt.js:47` |
| `swarm:announce` | — | `ui/swarmJuiceHud.js:90` |
| `swarm:bossDown` | — | `ui/swarmJuiceHud.js:95` |
| `swarm:bossHp` | — | `ui/swarmJuiceHud.js:94` |
| `swarm:bossIntro` | — | `ui/swarmJuiceHud.js:93` |
| `swarm:chain` | — | `audio/audioSystem.js:2410`, `systems/survivalResults.js:500`, `systems/swarmElites.js:138`, `systems/swarmJuice.js:102`, `ui/survivalHud.js:222`, `ui/swarmJuiceHud.js:96` |
| `swarm:chainBest` | — | `systems/survivalResults.js:521` |
| `swarm:chainBroken` | — | `audio/audioSystem.js:2413`, `systems/swarmElites.js:139`, `systems/swarmJuice.js:103`, `ui/survivalHud.js:223`, `ui/swarmJuiceHud.js:97` |
| `swarm:chainShatter` | — | `ui/swarmJuiceHud.js:99` |
| `swarm:chainTier` | — | `ui/swarmJuiceHud.js:98` |
| `swarm:event` | `systems/swarmEvents.js:289` | — |
| `swarm:eventTelegraphed` | `systems/swarmEvents.js:137` | — |
| `swarm:killPopup` | — | `ui/stuntCallout.js:545`, `ui/swarmJuiceHud.js:89` |
| `swarm:pressureSpend` | — | `systems/survivalResults.js:489` |
| `swarm:pressureTelegraph` | — | `systems/survivalAnnounce.js:326` |
| `swarm:roundClear` | — | `ui/swarmJuiceHud.js:92` |
| `swarm:roundSlam` | — | `ui/swarmJuiceHud.js:91` |
| `tech:researched` | `systems/ships.js:2001` | `audio/audioSystem.js:2504`, `systems/onboarding.js:616`, `systems/ships.js:1593` |
| `terrainAnchors:replenished` | `systems/terrainAnchors.js:219` | — |
| `tether:attached` | `combat/attachments.js:384` | `audio/audioSystem.js:2579`, `render/authoredMotion.js:878`, `render/vfx.js:2500`, `systems/encounterDirector.js:294`, `systems/presentationOrchestrator.js:95`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:391`, `systems/tetherGameplay.js:1255`, `systems/tetherGameplay.js:2077` | `audio/audioSystem.js:2598`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1308`, `systems/onboarding.js:469`, `systems/onboarding.js:485`, `systems/surrenderRecovery.js:74` |
| `tether:broken` | `combat/attachments.js:502` | `audio/audioSystem.js:2570`, `render/feel.js:1359`, `render/vfx.js:2503`, `systems/presentationOrchestrator.js:103`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:268`, `systems/volatileExposure.js:216` |
| `tether:couplerLock` | `systems/tetherGameplay.js:2473` | — |
| `tether:cut` | `systems/tetherGameplay.js:1861` | `audio/audioSystem.js:2602`, `systems/gamepad.js:794`, `systems/masslineThrow.js:114`, `systems/onboarding.js:484`, `systems/onboarding.js:524` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1845` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:737`, `systems/tetherGameplay.js:314`, `systems/tetherGameplay.js:484`, `systems/tetherGameplay.js:527`, `systems/tetherGameplay.js:532`, `systems/tetherGameplay.js:542`, `systems/tetherGameplay.js:559`, `systems/tetherGameplay.js:918` | `render/authoredMotion.js:884`, `systems/onboarding.js:652`, `testing/lab/proofSixtySeconds.js:1530`, `ui/masslineHud.js:984` |
| `tether:latched` | `systems/tetherGameplay.js:579` | `audio/audioSystem.js:2594`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:506`, `systems/flightV3.js:185`, `systems/gamepad.js:793`, `systems/lawSecurity.js:326`, `systems/masslineThrow.js:120`, `systems/missions.js:1422`, `systems/missions.js:1448`, `systems/missions.js:1506`, `systems/onboarding.js:464`, `systems/onboarding.js:481`, `systems/onboarding.js:513`, `systems/onboarding.js:522`, `systems/onboarding.js:664`, `systems/onboarding.js:667`, `systems/onboarding.js:679`, `systems/surrenderRecovery.js:71`, `systems/survivorPod.js:479`, `testing/lab/proofSixtySeconds.js:1531`, `ui/masslineHud.js:998`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1534` | — |
| `tether:nearBreak` | `combat/attachments.js:875` | `audio/audioSystem.js:2591`, `systems/onboarding.js:470`, `systems/presentationOrchestrator.js:96` |
| `tether:rebound` | `combat/attachments.js:807` | `audio/audioSystem.js:2613` |
| `tether:reel` | `combat/attachments.js:436` | `audio/audioSystem.js:2568`, `systems/missions.js:1418`, `systems/onboarding.js:467`, `systems/onboarding.js:482`, `systems/surrenderRecovery.js:72` |
| `tether:reelPump` | `systems/masslineTelemetry.js:251` | `render/authoredMotion.js:881` |
| `tether:releaseRated` | `systems/tetherGameplay.js:392`, `systems/tetherGameplay.js:1253`, `systems/tetherGameplay.js:1256`, `systems/tetherGameplay.js:1863` | `audio/audioSystem.js:2569`, `render/feel.js:1412`, `render/vfx.js:2502`, `systems/gamepad.js:795`, `systems/masslineThrow.js:117`, `systems/missions.js:1423`, `systems/presentationOrchestrator.js:162`, `systems/titles.js:592`, `ui/masslineHud.js:1006` |
| `tether:released` | `systems/tetherGameplay.js:1250`, `systems/tetherGameplay.js:1862` | `render/authoredMotion.js:882`, `render/shipMicroMotion.js:1307`, `render/vfx.js:2501`, `systems/barkDirector.js:510`, `systems/onboarding.js:468`, `systems/onboarding.js:483`, `systems/onboarding.js:523`, `systems/surrenderRecovery.js:73`, `systems/world.js:655` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2388` | — |
| `tether:snagged` | `systems/tetherGameplay.js:2241` | `audio/audioSystem.js:2606` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:329` | `render/authoredMotion.js:880` |
| `tether:strain` | `systems/tetherGameplay.js:1588` | `audio/audioSystem.js:2584`, `render/authoredMotion.js:886` |
| `tether:tractorCapture` | `systems/tetherGameplay.js:601` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1437`, `render/vfx.js:2547`, `systems/collisionConsequences.js:94`, `systems/combat.js:686`, `systems/masslineImpactDamage.js:47`, `systems/missions.js:1424`, `systems/onboarding.js:486`, `systems/onboarding.js:525`, `systems/onboarding.js:700`, `systems/presentationOrchestrator.js:138`, `systems/tumbleStates.js:111` |
| `tether:whipSnap` | `systems/tetherGameplay.js:1985` | `systems/gamepad.js:809` |
| `title:holdResolved` | — | `systems/titles.js:581` |
| `touch:uiAction` | `systems/touch.js:634` | `ui/input.js:787` |
| `traffic:anvilTransfer` | `systems/anvilWork.js:155` | — |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:2398` |
| `traffic:oreCollected` | `systems/traffic.js:6230` | `render/authoredMotion.js:923`, `render/npcJobSignatureVfx.js:676`, `render/npcJobSignatureVfx.js:901` |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:4105` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:11024` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:9645` | `systems/barkDirector.js:516` |
| `traffic:spillNoticed` | `systems/traffic.js:6797` | `systems/barkDirector.js:514` |
| `tutorial:finished` | `systems/onboarding.js:1479` | `systems/achievements.js:1116`, `systems/missions.js:1295`, `systems/presentationAdapters.js:211`, `systems/story.js:161` |
| `tutorial:say` | `systems/onboarding.js:1170` | `audio/audioSystem.js:2652`, `systems/story.js:198` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2315` | `systems/missions.js:1304` |
| `ui:acceptMission` | `ui/adventureDecisions.js:408`, `ui/station/screens/bar.js:706`, `ui/station/screens/contracts.js:1414` | `systems/missions.js:1303` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:4441` | `systems/ships.js:1645` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:1403` |
| `ui:buyModule` | — | `systems/onboarding.js:611`, `systems/ships.js:1638` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:4887` | `systems/bombs.js:589` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:4627` | `systems/ships.js:1624` |
| `ui:cancel` | `ui/input.js:1034`, `ui/input.js:1048` | — |
| `ui:clearTarget` | `ui/input.js:429` | `ui/uiRoot.js:1123` |
| `ui:closeAll` | `main.js:1057`, `ui/screens/crucible.js:3398`, `ui/screens/crucible.js:3411` | `ui/uiRoot.js:1121` |
| `ui:closeCargo` | `ui/input.js:259`, `ui/input.js:391` | `ui/hud.js:4115` |
| `ui:closeComms` | `ui/input.js:386` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1115` |
| `ui:confirm` | `ui/input.js:1042` | `audio/audioSystem.js:2749` |
| `ui:cycleComponent` | `ui/targetPanel.js:588`, `ui/targetPanel.js:592` | `ui/uiRoot.js:1127` |
| `ui:cycleTarget` | `ui/input.js:425`, `ui/input.js:1112` | `ui/uiRoot.js:1122` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:4487` | `systems/ships.js:1646` |
| `ui:endgameChoose` | `systems/missions.js:3374`, `ui/station/barContacts.js:968` | `systems/story.js:211` |
| `ui:endgameConfirm` | — | `systems/story.js:212` |
| `ui:endgameDecline` | `ui/comms.js:450` | `systems/story.js:213` |
| `ui:endgameDepartAshfall` | `ui/comms.js:467` | `systems/story.js:222` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2165` | `systems/story.js:219` |
| `ui:endgameStayAshfall` | `ui/comms.js:468` | `systems/story.js:223` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2169` | `systems/story.js:220` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:221` |
| `ui:endingArchiveOpen` | — | `systems/story.js:215` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | `systems/routeFollower.js:352` |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:72` | `systems/factionPresence.js:453` |
| `ui:fitModule` | — | `systems/onboarding.js:608`, `systems/ships.js:1639` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:4897` | `systems/bombs.js:590` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1556` | `systems/automation.js:544`, `systems/wingmen.js:143` |
| `ui:globalFind` | `ui/input.js:308`, `ui/input.js:370` | `ui/globalFind.js:183` |
| `ui:heliosBay7Scan` | — | `systems/story.js:259` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:214` | `systems/story.js:258` |
| `ui:navigate` | `ui/input.js:1022`, `ui/input.js:1026`, `ui/input.js:1090` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2838`, `ui/screens/achievements.js:212`, `ui/screens/automationPanel.js:860`, `ui/screens/clips.js:348`, `ui/screens/credits.js:177`, `ui/screens/crucible.js:2209`, `ui/screens/crucibleDraft.js:1476`, `ui/screens/demoEnd.js:194`, `ui/screens/replay.js:289`, `ui/screens/starmap.js:679`, `ui/screens/techTree.js:275` | `ui/uiRoot.js:1111` |
| `ui:prepareBombRack` | `systems/ships.js:2698`, `ui/station/screens/shipworks.js:4546` | `systems/bombs.js:600` |
| `ui:previewBombRackPreparation` | `systems/ships.js:2628`, `ui/station/screens/shipworks.js:3531`, `ui/station/screens/shipworks.js:4502` | `systems/bombs.js:597` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:690` | `systems/world.js:622` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:760` | `systems/world.js:621` |
| `ui:pushScreen` | `main.js:467`, `systems/onboarding.js:887`, `systems/story.js:1298`, `ui/mapAuthority.js:133`, `ui/screens/base.js:1280`, `ui/screens/crucible.js:3412`, `ui/screens/crucibleDraft.js:792`, `ui/screens/gameOver.js:462`, `ui/screens/starmap.js:687`, `ui/signalInvestigationPrompt.js:169`, `ui/station/barContacts.js:695`, `ui/station/screens/bar.js:723`, `ui/station/screens/industry.js:490`, `ui/station/stationApp.js:515` | `ui/uiRoot.js:1088` |
| `ui:replaceScreen` | `ui/screens/crucible.js:3359`, `ui/screens/crucible.js:3386`, `ui/screens/demoEnd.js:223`, `ui/screens/motionAsk.js:105` | `ui/uiRoot.js:1120` |
| `ui:restockBombRack` | — | `systems/bombs.js:593` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:4413` | `systems/ships.js:1644` |
| `ui:screenTop` | `ui/screenManager.js:343` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:1404` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:4907` | `systems/bombs.js:592` |
| `ui:service` | `balance/careerCohorts.js:726`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:439`, `ui/station/stationApp.js:915`, `ui/station/stationApp.js:951` | `systems/economy.js:1466` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:4632`, `ui/station/screens/shipworks.js:4750` | `systems/ships.js:1637` |
| `ui:setCourse` | `systems/factionPresence.js:1254`, `systems/missions.js:3995`, `systems/scanner.js:1417`, `systems/scanner.js:1448`, `ui/galaxyMap.js:2491`, `ui/galaxyMap.js:2506`, `ui/galaxyMap.js:7549`, `ui/market/tradeLogic.js:486`, `ui/screens/footprint.js:1633`, `ui/screens/footprint.js:1644`, `ui/screens/localmap.js:1118`, `ui/screens/starmap.js:1564`, `ui/screens/starmap.js:1577`, `ui/screens/starmap.js:1581` | `systems/world.js:581` |
| `ui:setShipAppearance` | `ui/station/screens/shipworks.js:4328` | `systems/ships.js:1648` |
| `ui:setShipName` | `ui/station/screens/shipworks.js:4657` | `systems/ships.js:1651` |
| `ui:talkContact` | — | `systems/story.js:260` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:65`, `combat/autoTargetMode.js:246` | `ui/uiRoot.js:1128` |
| `ui:toggleCargo` | `ui/input.js:492` | `ui/hud.js:4114` |
| `ui:toggleComms` | `ui/input.js:509` | — |
| `ui:toggleOverview` | `ui/input.js:496` | `ui/hud.js:4626` |
| `ui:trackMission` | `ui/galaxyMap.js:4302`, `ui/screens/missionLog.js:2161`, `ui/screens/missionLog.js:2233`, `ui/screens/missionLog.js:2294`, `ui/station/screens/contracts.js:1454` | `systems/missions.js:1308` |
| `ui:transferParkedCargo` | `ui/station/screens/shipworks.js:4771` | — |
| `ui:undock` | — | `ui/input.js:786` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:5039` | `systems/ships.js:1640` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:4917` | `systems/bombs.js:591` |
| `ui:unlockTech` | `ui/screens/techTree.js:629` | `systems/ships.js:1647` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:4616` | `systems/bombs.js:594` |
| `ui:wingOrder` | `ui/wingmanRadial.js:256` | `systems/automation.js:545` |
| `ui:wingmanRadial` | `ui/input.js:502` | `ui/wingmanRadial.js:327` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:350` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:300` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:235` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1474` | `systems/missions.js:1481`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:choose` | `systems/missions.js:5230`, `systems/uniqueWreckEncounterScripts.js:123`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:867` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:888`, `systems/uniqueWrecks.js:1054`, `systems/uniqueWrecks.js:1242` | `systems/missions.js:1482` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1540` | `systems/missions.js:1484`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1101` | `systems/missions.js:1483` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1131` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:630`, `systems/uniqueWrecks.js:1056` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1719` | `systems/missions.js:1485`, `systems/traffic.js:1591`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `systems/traffic.js:4248`, `ui/station/screens/bar.js:740` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:738` | `systems/missions.js:1480` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1720` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1453` | `systems/world.js:627` |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1650` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1405`, `ui/bandHud.js:88` |
| `verb:used` | `systems/onboarding.js:3137` | — |
| `vesper:met` | `systems/vesper.js:156` | — |
| `vesper:note` | `systems/vesper.js:198` | — |
| `vesper:performance` | `systems/vesper.js:222` | — |
| `vesper:phraseProgress` | `systems/vesper.js:214` | — |
| `vesper:voice` | `systems/vesper.js:140` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:6212` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:591` |
| `vestaOreCache:clueRecovered` | `systems/world.js:6033` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:6064` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:6175` | — |
| `vestaOreCache:resolved` | `systems/world.js:6132` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:398`, `ui/voiceArbiter.js:442` | `ui/alerts.js:373` |
| `voice:dismiss` | `ui/bindings.js:77`, `ui/input.js:378` | `ui/voiceArbiter.js:337` |
| `voice:say` | `audio/audioSystem.js:4600`, `systems/achievements.js:949`, `systems/mines.js:97`, `systems/survivalAnnounce.js:386`, `systems/survivalAnnounce.js:640`, `systems/world.js:711`, `systems/world.js:733`, `ui/alerts.js:272`, `ui/hud.js:581` | `ui/voiceArbiter.js:336` |
| `voice:surface` | `ui/voiceArbiter.js:403`, `ui/voiceArbiter.js:452` | `systems/barkDirector.js:480`, `ui/alerts.js:372` |
| `watch:changed` | `ui/entityLinks.js:237`, `ui/entityLinks.js:281` | `ui/watchlistHud.js:89` |
| `weapons:inertialShunt` | `systems/weapons.js:368` | — |
| `weapons:mineArmed` | `systems/weapons.js:1682` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1639` | `render/vfx.js:2543` |
| `weapons:mineDetonated` | `systems/weapons.js:1812` | — |
| `weapons:mineExpired` | `systems/weapons.js:1676` | `render/vfx.js:2544`, `systems/presentationOrchestrator.js:274` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:348` | `audio/audioSystem.js:2392` |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1334` | `audio/audioSystem.js:2393` |
| `weapons:vent` | `systems/weapons.js:745`, `systems/weapons.js:765` | `audio/audioSystem.js:2483`, `render/shipMicroMotion.js:1284`, `render/vfx.js:2581`, `systems/ships.js:1695`, `ui/hud.js:4188` |
| `web:linked` | `combat/tetherWebs.js:143` | — |
| `well:capture` | `systems/fields.js:2192` | — |
| `well:fling` | `systems/fields.js:2117` | — |
| `well:grind` | `systems/fields.js:1889` | `systems/impulseCharges.js:276` |
| `wingMorale:broken` | `systems/wingMorale.js:284` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:369` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:396` | — |
| `wingOrder:accepted` | `systems/automation.js:2094` | `systems/wingmen.js:144` |
| `wingOrder:blocked` | `systems/automation.js:2095` | `ui/wingmanRadial.js:334` |
| `wingOrder:converted` | `systems/wingmen.js:464` | `ui/wingmanRadial.js:340` |
| `wingOrder:status` | `systems/automation.js:2096` | `ui/wingmanRadial.js:344` |
| `world:abortJumpCharge` | `systems/story.js:855`, `ui/comms.js:459` | `systems/world.js:578` |
| `world:confirmUnfiledJump` | `systems/story.js:221` | `systems/world.js:577` |
| `world:criticalSpawnDeferred` | `systems/world.js:1956`, `systems/world.js:3799` | — |
| `world:farActorRestored` | `world/farActorTable.js:858` | `systems/npcJobsRuntime.js:911`, `systems/traffic.js:1574` |
| `world:farActorShelved` | `world/farActorTable.js:804` | `systems/npcJobsRuntime.js:910`, `systems/traffic.js:1573` |
| `world:membership` | `systems/world.js:1047` | `systems/presentationOrchestrator.js:181` |
| `world:originShift` | `systems/world.js:4852` | — |
| `world:playerRelocated` | `systems/world.js:3945` | `core/coreSystem.js:237`, `render/vfx.js:2567` |
| `world:requestJump` | `systems/story.js:839`, `ui/galaxyMap.js:2485`, `ui/screens/starmap.js:1576` | `systems/world.js:575` |
| `world:requestRoute` | `ui/galaxyMap.js:2504`, `ui/galaxyMap.js:4319`, `ui/galaxyMap.js:7547`, `ui/screens/starmap.js:1563`, `ui/screens/starmap.js:1580` | `systems/world.js:579` |
| `world:requestSectorScan` | `ui/galaxyMap.js:6155` | `systems/world.js:580` |
| `world:requestUnfiledJump` | `systems/story.js:807` | `systems/world.js:576` |
| `world:residency` | `systems/world.js:1240`, `systems/world.js:1283`, `systems/world.js:2163` | — |
| `world:spawnLimited` | `systems/world.js:3719` | — |
| `world:stuckCleared` | `systems/world.js:5734` | — |
| `world:stuckTowAccept` | `ui/stuckTowPrompt.js:52` | `systems/world.js:661` |
| `world:stuckTowOffer` | `systems/world.js:5767` | `ui/stuckTowPrompt.js:23` |
| `world:zoneEntered` | `systems/world.js:4879` | `data/hazardLanguage.js:131` |
| `world:zoneExited` | `systems/world.js:4882` | `data/hazardLanguage.js:132` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:963` | `systems/presentationOrchestrator.js:288` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:904` | `systems/presentationOrchestrator.js:289`, `systems/traffic.js:1681` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2637` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1248` | `systems/barkDirector.js:493` |
| `wreckEcology:rivalPressured` | `systems/aftermathWrecks.js:1209` | `systems/barkDirector.js:492` |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1291` | `systems/barkDirector.js:491` |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:2363` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2559` | `systems/npcJobsRuntime.js:941` |
| `wreckField:source` | `systems/factionPresence.js:820`, `systems/salvage.js:435`, `systems/uniqueWrecks.js:1355` | `systems/aftermathWrecks.js:972` |
| `wreckMission:choiceApplied` | `systems/missions.js:5585` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:141` | `systems/missions.js:1464` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 3 subscriber(s)
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
- `claim:defenseIgnore` — 2 subscriber(s)
- `combat:bankShot` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 8 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `customs:weirBolt` — 1 subscriber(s)
- `drone:grindStop` — 1 subscriber(s)
- `encounter:predationTelegraph` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
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
- `pirateDisengage:triggered` — 1 subscriber(s)
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
- `save:dirty` — 1 subscriber(s)
- `ships:grantModule` — 1 subscriber(s)
- `signal:investigate` — 1 subscriber(s)
- `signal:track` — 1 subscriber(s)
- `story:stuntIncidentRecorded` — 1 subscriber(s)
- `story:stuntIncidentUpdated` — 1 subscriber(s)
- `stunt:trickAmended` — 4 subscriber(s)
- `stunt:trickDetected` — 6 subscriber(s)
- `surrender:escaped` — 1 subscriber(s)
- `surrender:secured` — 1 subscriber(s)
- `surrender:tethered` — 1 subscriber(s)
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
- `ui:endingArchiveOpen` — 1 subscriber(s)
- `ui:fitModule` — 2 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:restockBombRack` — 1 subscriber(s)
- `ui:sell` — 1 subscriber(s)
- `ui:talkContact` — 1 subscriber(s)
- `ui:undock` — 1 subscriber(s)

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
- `bracket:bank` — 1 emitter(s)
- `bracket:matchFinished` — 1 emitter(s)
- `bracket:matchStarted` — 1 emitter(s)
- `bracket:save` — 1 emitter(s)
- `bracket:shotResolved` — 1 emitter(s)
- `bracket:voice` — 1 emitter(s)
- `camera:shake` — 14 emitter(s)
- `camera:zoom` — 5 emitter(s)
- `capitalBoss:detach` — 1 emitter(s)
- `capitalBoss:telegraphEnd` — 2 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:hotDockSpill` — 1 emitter(s)
- `cargo:parkedHoldSwapped` — 1 emitter(s)
- `cargo:parkedTransfer` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `cargo:volatileCorrosive` — 1 emitter(s)
- `cargo:volatileCryo` — 1 emitter(s)
- `cargo:volatileExposed` — 1 emitter(s)
- `cargo:volatileRupture` — 1 emitter(s)
- `cargo:volatileVent` — 1 emitter(s)
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
- `claim:teleportRequest` — 1 emitter(s)
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
- `ecology:coherence` — 1 emitter(s)
- `ecology:relayPulse` — 1 emitter(s)
- `ecology:setpiece` — 1 emitter(s)
- `economy:debtEscalated` — 1 emitter(s)
- `economy:demandShift` — 1 emitter(s)
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
- `field:richSeamMissed` — 3 emitter(s)
- `fields:deployDenied` — 1 emitter(s)
- `fields:hitchCut` — 1 emitter(s)
- `fields:hitchLatched` — 1 emitter(s)
- `firsthour:beat` — 1 emitter(s)
- `firsthour:complete` — 1 emitter(s)
- `firsthour:sentence` — 1 emitter(s)
- `firsthour:started` — 1 emitter(s)
- `firsthour:verb` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `flight:sweptHull` — 1 emitter(s)
- `formation:discovered` — 1 emitter(s)
- `freight:custodyRebound` — 1 emitter(s)
- `freight:custodyReceipt` — 1 emitter(s)
- `freight:raiderEscaped` — 1 emitter(s)
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:blackMarketAccess` — 1 emitter(s)
- `frontierRumor:contacted` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `fuel:changed` — 7 emitter(s)
- `game:embarkSpeculation` — 3 emitter(s)
- `gamepad:connected` — 1 emitter(s)
- `gamepad:disconnected` — 1 emitter(s)
- `heist:capsuleResumed` — 1 emitter(s)
- `heist:launchCue` — 1 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `hullBurst:activated` — 1 emitter(s)
- `hullBurst:ended` — 1 emitter(s)
- `hullBurst:released` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `intervention:jumperRipped` — 1 emitter(s)
- `intervention:logged` — 1 emitter(s)
- `lossInvestigation:closed` — 1 emitter(s)
- `machine:tokenDelivered` — 1 emitter(s)
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
- `namedAce:appeared` — 1 emitter(s)
- `nemesis:encounterRejected` — 1 emitter(s)
- `nemesis:encounterStarted` — 1 emitter(s)
- `nemesis:escaped` — 1 emitter(s)
- `nemesis:spare` — 1 emitter(s)
- `news:headline` — 6 emitter(s)
- `news:publish` — 22 emitter(s)
- `news:render` — 1 emitter(s)
- `npcjobs:crewResponse` — 1 emitter(s)
- `npcjobs:lotReplaced` — 1 emitter(s)
- `npcjobs:resumed` — 1 emitter(s)
- `npcjobs:yardDispatchDone` — 1 emitter(s)
- `occupation:delivered` — 1 emitter(s)
- `occupation:switched` — 1 emitter(s)
- `onboarding:rangePrompt` — 2 emitter(s)
- `onboarding:rosterPrewarm` — 1 emitter(s)
- `optic:beamContact` — 1 emitter(s)
- `orrinWitness:evidenceRecovered` — 1 emitter(s)
- `orrinWitness:submitted` — 1 emitter(s)
- `pallasHiddenCache:cargoChanged` — 1 emitter(s)
- `pallasHiddenCache:clueRecovered` — 1 emitter(s)
- `pallasHiddenCache:pickupReady` — 1 emitter(s)
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
- `rescue:beat` — 2 emitter(s)
- `rescue:complete` — 1 emitter(s)
- `rescuedWorker:returned` — 1 emitter(s)
- `resonance:patrolQueued` — 1 emitter(s)
- `rhythm:phase` — 1 emitter(s)
- `run:roleProblemStamped` — 1 emitter(s)
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
- `site:overlayChanged` — 1 emitter(s)
- `site:podBuilt` — 1 emitter(s)
- `site:rematerialized` — 1 emitter(s)
- `station:berthAssigned` — 1 emitter(s)
- `station:holding` — 1 emitter(s)
- `station:navigate` — 5 emitter(s)
- `station:yardChanged` — 1 emitter(s)
- `stationContact:changed` — 4 emitter(s)
- `stationContact:counterChanged` — 2 emitter(s)
- `stationContact:counterDelta` — 1 emitter(s)
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
