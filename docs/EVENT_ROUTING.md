# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-10-01 · 989 events · 3464 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:331`, `systems/encounterDirector.js:294`, `ui/discoveryPlate.js:140` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:1744` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:748` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:1726` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2004` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:780` | `systems/salvage.js:78` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1314` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:1813` | `systems/lawSecurity.js:264`, `systems/salvage.js:79` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:166` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:497` | `systems/presentationOrchestrator.js:167`, `systems/tetherGameplay.js:251` |
| `ai:egressExit` | `ai/egressExit.js:74` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:241` | — |
| `ai:flee` | `systems/ai.js:260`, `systems/traffic.js:5297`, `systems/wingMorale.js:303` | `render/vfx.js:2466`, `systems/barkDirector.js:319`, `systems/combatOutcome.js:156`, `systems/encounterDirector.js:307`, `systems/presentationOrchestrator.js:168` |
| `ai:formationBroken` | `systems/ai.js:436`, `systems/wingMorale.js:253` | `render/vfx.js:2467` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:321` |
| `ai:stateChange` | `systems/ai.js:257` | `systems/combatOutcome.js:182` |
| `ai:telegraph` | `systems/ai.js:332`, `systems/encounterScripts.js:167`, `systems/encounterScripts.js:1043`, `systems/masslineSnares.js:331`, `systems/mines.js:140`, `systems/tacticalAI.js:485` | `audio/audioSystem.js:1961`, `render/vfx.js:2465`, `systems/presentationOrchestrator.js:165`, `systems/survivalResults.js:491`, `ui/hud.js:2706`, `ui/survivalHud.js:224`, `ui/threatHalo.js:651` |
| `aiTrader:requestTrade` | `systems/traffic.js:7250` | `systems/economy.js:994` |
| `alienEcology:blackBoxRecovered` | — | `systems/world.js:621` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:667` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:1031` | `systems/world.js:627` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:620` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:618` |
| `alienEcology:relaySevered` | — | `systems/world.js:619` |
| `alienEcology:vented` | `systems/alienEcology.js:1253` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | `systems/story.js:142` |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | `systems/story.js:143` |
| `anomaly:bearing` | `systems/scanner.js:1081` | — |
| `anomaly:triangulated` | `systems/scanner.js:1099` | `systems/world.js:564` |
| `asset:deployed` | `systems/automation.js:2049`, `systems/automation.js:2109`, `systems/automation.js:2198`, `systems/claims.js:537` | `systems/missions.js:1348`, `systems/onboarding.js:509`, `systems/story.js:190` |
| `asteroid:chunked` | `systems/mining.js:2029` | `render/asteroidMotionPresentation.js:452`, `render/vfx.js:2450`, `systems/presentationOrchestrator.js:203` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1002`, `systems/mining.js:891` | `audio/audioSystem.js:1915`, `render/vfx.js:2449`, `systems/fieldDepletion.js:703`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:419`, `render/shipMicroMotion.js:2255`, `render/vfx.js:2494`, `render/vfx.js:5502`, `render/vfx.js:9877`, `render/vfx.js:10963`, `systems/ai.js:711`, `systems/alienEcology.js:346`, `systems/barkDirector.js:1058`, `systems/beacons.js:60`, `systems/beacons.js:65`, `systems/beacons.js:97`, `systems/bombs.js:900`, `systems/bombs.js:1020`, `systems/bombs.js:1212`, `systems/bulletTime.js:194`, `systems/bulletTime.js:210`, `systems/bulletTime.js:296`, `systems/cargo.js:681`, `systems/cargo.js:704`, `systems/claims.js:384`, `systems/claims.js:469`, `systems/claims.js:514`, `systems/claims.js:1370`, `systems/claims.js:2014`, `systems/cloak.js:194`, `systems/cloak.js:207`, `systems/countermeasures.js:396`, `systems/countermeasures.js:426`, `systems/crafting.js:268`, `systems/crafting.js:278`, `systems/eighthBellRuntime.js:104`, `systems/eighthBellRuntime.js:119`, `systems/fields.js:763`, `systems/fields.js:1051`, `systems/fields.js:1182`, `systems/fields.js:1455`, `systems/flybyFocus.js:509`, `systems/hullBurst.js:197`, `systems/hullBurst.js:234`, `systems/hullBurst.js:334`, `systems/hullBurst.js:358`, `systems/hullBurst.js:472`, `systems/hullBurst.js:547`, `systems/hullFracture.js:308`, `systems/hullFracture.js:410`, `systems/impulseCharges.js:526`, `systems/impulseCharges.js:633`, `systems/impulseCharges.js:854`, `systems/impulseCharges.js:1045`, `systems/impulseCharges.js:1158`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:226`, `systems/masslineThrow.js:520`, `systems/masslineThrow.js:605`, `systems/mining.js:647`, `systems/mining.js:2117`, `systems/planetRuntime.js:508`, `systems/precursorMachines.js:340`, `systems/precursorMachines.js:417`, `systems/presentationAdapters.js:558`, `systems/presentationOrchestrator.js:495`, `systems/salvage.js:608`, `systems/tumbleStates.js:470`, `systems/tumbleStates.js:540`, `systems/weapons.js:1786`, `ui/commsRadial.js:539`, `ui/commsRadial.js:584`, `ui/commsRadial.js:769`, `ui/commsRadial.js:800`, `ui/hud.js:2178`, `ui/hud.js:3478`, `ui/hud.js:3713`, `ui/hud.js:3773`, `ui/hud.js:3815`, `ui/hud.js:3834`, `ui/hud.js:3932`, `ui/hud.js:4077`, `ui/hud.js:4361`, `ui/input.js:181`, `ui/input.js:210`, `ui/input.js:270`, `ui/input.js:308`, `ui/input.js:314`, `ui/input.js:365`, `ui/input.js:424`, `ui/input.js:430`, `ui/input.js:436`, `ui/input.js:442`, `ui/input.js:653`, `ui/input.js:860`, `ui/input.js:865`, `ui/input.js:883`, `ui/input.js:888`, `ui/input.js:981`, `ui/input.js:1002`, `ui/input.js:1010`, `ui/input.js:1016`, `ui/input.js:1058`, `ui/input.js:1069`, `ui/input.js:1073`, `ui/input.js:1086`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:489`, `ui/screens/base.js:1182`, `ui/screens/base.js:1421`, `ui/screens/missionLog.js:2162`, `ui/screens/missionLog.js:2166`, `ui/screens/missionLog.js:2170`, `ui/screens/missionLog.js:2174`, `ui/screens/missionLog.js:2190`, `ui/screens/missionLog.js:2198`, `ui/screens/missionLog.js:2205`, `ui/screens/missionLog.js:2212`, `ui/screens/missionLog.js:2220`, `ui/screens/missionLog.js:2227`, `ui/screens/missionLog.js:2234`, `ui/screens/missionLog.js:2243`, `ui/screens/missionLog.js:2250`, `ui/screens/missionLog.js:2266`, `ui/screens/missionLog.js:2297`, `ui/screens/missionLog.js:2317`, `ui/shipLedgerPanel.js:295`, `ui/shipLedgerPanel.js:302`, `ui/shipLedgerPanel.js:309`, `ui/station/screens/bar.js:570`, `ui/station/screens/bar.js:657`, `ui/station/screens/bar.js:661`, `ui/station/screens/bar.js:665`, `ui/station/screens/bar.js:687`, `ui/station/screens/bar.js:703`, `ui/station/screens/bar.js:732`, `ui/station/screens/bar.js:757`, `ui/station/screens/bar.js:766`, `ui/station/screens/contracts.js:1299`, `ui/station/screens/contracts.js:1310`, `ui/station/screens/contracts.js:1346`, `ui/station/screens/contracts.js:1349`, `ui/station/screens/contracts.js:1388`, `ui/station/screens/factions.js:361`, `ui/station/screens/industry.js:378`, `ui/station/screens/industry.js:419`, `ui/station/screens/industry.js:444`, `ui/station/screens/industry.js:454`, `ui/station/screens/market.js:822`, `ui/station/screens/market.js:1492`, `ui/station/screens/market.js:1561`, `ui/station/screens/market.js:1569`, `ui/station/screens/market.js:1610`, `ui/station/screens/market.js:1622`, `ui/station/screens/market.js:1818`, `ui/station/screens/shipworks.js:585`, `ui/station/screens/shipworks.js:3273`, `ui/station/screens/shipworks.js:4177`, `ui/station/screens/shipworks.js:4248`, `ui/station/screens/shipworks.js:4265`, `ui/station/screens/shipworks.js:4278`, `ui/station/screens/shipworks.js:4282`, `ui/station/screens/shipworks.js:4287`, `ui/station/screens/shipworks.js:4317`, `ui/station/screens/shipworks.js:4335`, `ui/station/screens/shipworks.js:4371`, `ui/station/screens/shipworks.js:4393`, `ui/station/screens/shipworks.js:4395`, `ui/station/screens/shipworks.js:4413`, `ui/station/screens/shipworks.js:4462`, `ui/station/screens/shipworks.js:4472`, `ui/station/screens/shipworks.js:4478`, `ui/station/screens/shipworks.js:4498`, `ui/station/screens/shipworks.js:4505`, `ui/station/screens/shipworks.js:4547`, `ui/station/screens/shipworks.js:4554`, `ui/station/screens/shipworks.js:4565`, `ui/station/screens/shipworks.js:4575`, `ui/station/screens/shipworks.js:4580`, `ui/station/screens/shipworks.js:4588`, `ui/station/screens/shipworks.js:4703`, `ui/station/screens/shipworks.js:4713`, `ui/station/screens/shipworks.js:4723`, `ui/station/screens/shipworks.js:4733`, `ui/station/screens/shipworks.js:4786`, `ui/station/screens/shipworks.js:4820`, `ui/station/screens/shipworks.js:4836`, `ui/station/screens/shipworks.js:4841`, `ui/station/stationApp.js:637`, `ui/station/stationApp.js:902`, `ui/station/stationApp.js:938`, `ui/uiRoot.js:1232`, `ui/wingmanRadial.js:135`, `ui/wingmanRadial.js:156`, `ui/wingmanRadial.js:178`, `ui/wingmanRadial.js:204`, `ui/wingmanRadial.js:229` | `audio/audioSystem.js:2037` |
| `automation:assetDistressed` | `systems/automation.js:1804` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2294` | `systems/intervention.js:69`, `systems/lossLedger.js:377`, `systems/missions.js:1350` |
| `automation:assetRepossessed` | `systems/automation.js:1829` | `ui/automationPayoff.js:90` |
| `automation:assetResumed` | `systems/automation.js:2150` | — |
| `automation:incomeCredited` | `systems/automation.js:1858`, `systems/automation.js:1869`, `systems/automation.js:2567` | — |
| `automation:offlineSummary` | `systems/automation.js:2332`, `systems/automation.js:2356`, `systems/automation.js:2380`, `systems/automation.js:2403`, `systems/automation.js:2614` | `ui/automationPayoff.js:80` |
| `automation:outpostRaided` | `systems/automation.js:1731`, `systems/automation.js:2689` | `systems/lossLedger.js:378` |
| `automation:programAssigned` | `systems/automation.js:2004` | `systems/missions.js:1349` |
| `automation:traderCycleCompleted` | `systems/automation.js:1489` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:543` | — |
| `band:bearingRequest` | `systems/bandRadio.js:516` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:718`, `systems/uniqueWrecks.js:761` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:725`, `systems/uniqueWrecks.js:733`, `systems/uniqueWrecks.js:747` | — |
| `band:bed` | `systems/bandRadio.js:600` | `audio/audioSystem.js:2116` |
| `band:cycle` | `ui/bandHud.js:83`, `ui/input.js:330` | — |
| `band:status` | `systems/bandRadio.js:582` | `ui/bandHud.js:87` |
| `barkDirector:voice` | — | `audio/audioSystem.js:2089` |
| `beacon:deploy` | — | `systems/beacons.js:43` |
| `beacon:deployed` | `systems/beacons.js:92` | `render/shipMicroMotion.js:1305` |
| `beam:denied` | `systems/mining.js:310`, `systems/mining.js:353`, `systems/mining.js:367`, `systems/mining.js:377`, `systems/mining.js:409` | — |
| `beam:repaired` | `systems/mining.js:470` | — |
| `beam:transferred` | `systems/mining.js:524` | — |
| `bombs:armed` | `systems/bombs.js:957` | — |
| `bombs:commanded` | `systems/bombs.js:913` | — |
| `bombs:cycle` | `systems/bombs.js:581`, `systems/bombs.js:892` | — |
| `bombs:denied` | `systems/bombs.js:457`, `systems/bombs.js:574`, `systems/bombs.js:597`, `systems/bombs.js:634`, `systems/bombs.js:673`, `systems/bombs.js:698`, `systems/bombs.js:837`, `systems/bombs.js:851` | — |
| `bombs:destroyed` | `systems/bombs.js:1209` | `render/vfx.js:2464` |
| `bombs:detonated` | `systems/bombs.js:1013` | `audio/bombAudio.js:346`, `render/vfx.js:2462` |
| `bombs:dropped` | `systems/bombs.js:899` | `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:526` |
| `bombs:fieldEnded` | `systems/bombs.js:1164` | `audio/bombAudio.js:354`, `render/vfx.js:2463` |
| `bombs:primed` | `systems/bombs.js:925` | — |
| `bombs:rackChanged` | `systems/bombs.js:798` | — |
| `bombs:released` | `systems/bombs.js:1229` | `audio/bombAudio.js:357` |
| `bombs:stockChanged` | `systems/bombs.js:604`, `systems/bombs.js:720`, `systems/bombs.js:897` | — |
| `boss:defeated` | `systems/world.js:890` | — |
| `bounty:cleared` | `systems/economy.js:2544` | `systems/heat.js:321` |
| `bounty:cooled` | `systems/heat.js:586` | `systems/barkDirector.js:336` |
| `buildIdentity:revealed` | `systems/buildIdentity.js:299` | — |
| `bulletTime:end` | `systems/bulletTime.js:209` | `audio/audioSystem.js:2115` |
| `bulletTime:start` | `systems/bulletTime.js:193` | `audio/audioSystem.js:2112`, `systems/onboarding.js:612` |
| `camera:kill` | `render/feel.js:1229`, `render/feel.js:1713` | — |
| `camera:shake` | `render/shipMicroMotion.js:2253`, `render/vfx.js:5760`, `render/vfx.js:6050`, `render/vfx.js:6387`, `systems/combat.js:571`, `systems/combat.js:731`, `systems/combat.js:905`, `systems/combat.js:988`, `systems/drill.js:1371`, `systems/flybyFocus.js:508`, `systems/intervention.js:211`, `systems/presentationAdapters.js:474`, `systems/survivalAnnounce.js:456`, `systems/tetherGameplay.js:567` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:496`, `ui/input.js:497`, `ui/input.js:729` | — |
| `capitalBoss:detach` | `systems/missions.js:1365` | — |
| `capitalBoss:start` | `systems/missions.js:5599` | — |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:110`, `systems/capitalBossEncounters.js:132` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:735` | `systems/world.js:566` |
| `cargo:changed` | `systems/cargo.js:204`, `systems/mining.js:2342` | `systems/ships.js:1455`, `ui/cargoConscience.js:142`, `ui/commandBar.js:412`, `ui/hud.js:3846`, `ui/hud.js:3875`, `ui/hudMeta.js:192` |
| `cargo:delivered` | `systems/missions.js:6310`, `systems/missions.js:6411` | `systems/economy.js:1006` |
| `cargo:fragileLost` | `systems/fragileCargo.js:200` | — |
| `cargo:full` | `systems/cargo.js:303`, `systems/mining.js:1385`, `systems/mining.js:2320` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:459`, `systems/presentationOrchestrator.js:211`, `ui/alerts.js:370`, `ui/floatingText.js:256` |
| `cargo:hotDockSpill` | `systems/cargo.js:640` | — |
| `cargo:jettison` | `ui/hud.js:3486` | `ui/hud.js:3778` |
| `cargo:jettisoned` | `systems/cargo.js:780` | `audio/audioSystem.js:1942`, `render/shipMicroMotion.js:1303`, `systems/barkDirector.js:329`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:608` |
| `cargo:massSettled` | `systems/cargo.js:541` | `systems/presentationOrchestrator.js:210`, `systems/ships.js:1456` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:905` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:941` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:825`, `systems/lootShards.js:881` | — |
| `chain:detonated` | `systems/impulseCharges.js:834` | `systems/fields.js:436` |
| `chain:primeEnded` | `systems/impulseCharges.js:797` | — |
| `chain:primed` | `systems/impulseCharges.js:774` | — |
| `chain:slam` | `systems/impulseCharges.js:708`, `systems/impulseCharges.js:728` | `systems/fields.js:435` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1918` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:1041` | `systems/onboarding.js:620` |
| `charge:armed` | `systems/impulseCharges.js:871` | — |
| `charge:combo` | `systems/impulseCharges.js:1083`, `systems/impulseCharges.js:1142` | — |
| `charge:detonated` | `systems/impulseCharges.js:518`, `systems/impulseCharges.js:625`, `systems/impulseCharges.js:846`, `systems/impulseCharges.js:1150` | `audio/audioSystem.js:1971`, `render/feel.js:1309`, `render/vfx.js:2460`, `systems/fields.js:437` |
| `charge:stuck` | `systems/impulseCharges.js:948` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1302` |
| `charge:thrown` | `systems/impulseCharges.js:1028` | `render/ordnanceMotionPresentation.js:261` |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:18` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:19` |
| `claim:claimed` | `systems/claims.js:383` | `systems/onboarding.js:515`, `systems/story.js:196`, `systems/traffic.js:1451` |
| `claim:convoyAbandoned` | `systems/claims.js:1092`, `systems/claims.js:1198` | `systems/traffic.js:1454` |
| `claim:convoyDocked` | `systems/traffic.js:2663` | `systems/claims.js:339` |
| `claim:convoyManifested` | `systems/traffic.js:2563` | `systems/claims.js:338` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1429` | — |
| `claim:defenseResolved` | `systems/claims.js:1505` | — |
| `claim:defenseStarted` | `systems/claims.js:1434` | — |
| `claim:defenseWarning` | `systems/claims.js:1353` | — |
| `claim:depotPatrolCompleted` | `systems/claims.js:2314` | `systems/factions.js:415` |
| `claim:depotPatrolRotation` | `systems/claims.js:2270` | — |
| `claim:depotSupport` | `systems/claims.js:2181`, `systems/claims.js:2207` | — |
| `claim:freightDelivered` | `systems/traffic.js:2874` | — |
| `claim:infrastructureActive` | `systems/claims.js:928` | `systems/traffic.js:1449` |
| `claim:infrastructureConstructed` | `systems/claims.js:450` | — |
| `claim:infrastructureStatus` | `systems/claims.js:939` | `systems/traffic.js:1450` |
| `claim:moduleBuilt` | `systems/claims.js:468` | — |
| `claim:raidRepelled` | `systems/claims.js:1302` | — |
| `claim:raidWarning` | `systems/claims.js:1295` | — |
| `claim:receipt` | `systems/claims.js:1722` | — |
| `claim:sensorPostRumor` | `systems/claims.js:986` | `systems/world.js:597` |
| `claim:specialized` | `systems/claims.js:509` | — |
| `claim:teleportRequest` | `systems/claims.js:726` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:2471` | — |
| `claims:migrated` | `systems/claims.js:1840` | — |
| `cloak:burned` | `systems/cloak.js:250` | — |
| `cloak:dropped` | `systems/cloak.js:206` | `render/shipMicroMotion.js:1299` |
| `cloak:engaged` | `systems/cloak.js:193` | `render/shipMicroMotion.js:1298`, `systems/onboarding.js:616` |
| `cloak:faded` | `systems/aiPorts.js:1094` | — |
| `collision:tearOff` | `systems/hullFracture.js:401` | `render/vfx.js:2407` |
| `combat:actionCancelled` | `combat/actions.js:336` | — |
| `combat:actionCompleted` | `combat/actions.js:322` | — |
| `combat:actionPhase` | `combat/actions.js:195` | — |
| `combat:actionRejected` | `combat/actions.js:358` | `ui/toasts.js:436` |
| `combat:actionStarted` | `combat/actions.js:165` | `systems/presentationOrchestrator.js:170`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2395` |
| `combat:baseDestroyed` | `systems/combat.js:717` | `systems/economy.js:1048` |
| `combat:beamStop` | `systems/weapons.js:1156` | `audio/audioSystem.js:1847`, `render/asteroidMotionPresentation.js:451`, `render/vfx.js:2391` |
| `combat:bounceContinued` | `combat/attackHit.js:36` | `render/vfx.js:2396`, `systems/presentationOrchestrator.js:253` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:333` | `render/feel.js:1344`, `render/vfx.js:2405`, `systems/fields.js:439`, `systems/gamepad.js:565` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:351` | `render/vfx.js:2406` |
| `combat:damage` | `combat/damage.js:293` | `audio/audioSystem.js:1862`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `render/asteroidMotionPresentation.js:445`, `render/feel.js:1153`, `render/shipMicroMotion.js:1285`, `render/vfx.js:2397`, `save/saveSystem.js:247`, `systems/ai.js:102`, `systems/aiEncounter.js:131`, `systems/barkDirector.js:325`, `systems/collisionConsequences.js:76`, `systems/combatOutcome.js:181`, `systems/cruise.js:53`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:285`, `systems/factionPresence.js:438`, `systems/heat.js:282`, `systems/lawSecurity.js:259`, `systems/missions.js:1339`, `systems/npcJobsRuntime.js:945`, `systems/onboarding.js:425`, `systems/onboarding.js:436`, `systems/presentationOrchestrator.js:164`, `systems/salvageActions.js:128`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1516`, `systems/stationBroadcast.js:154`, `systems/survivalResults.js:484`, `systems/titles.js:396`, `systems/traffic.js:1399`, `ui/alerts.js:356`, `ui/commandBar.js:401`, `ui/floatingText.js:160`, `ui/hud.js:1728`, `ui/hud.js:2006`, `ui/hud.js:2208`, `ui/uiRoot.js:624` |
| `combat:emp` | `combat/damage.js:327` | `ui/hud.js:2214` |
| `combat:fire` | `systems/impulseCharges.js:559`, `systems/weapons.js:1062`, `systems/weapons.js:1135`, `systems/weapons.js:1284`, `systems/weapons.js:1601` | `audio/audioSystem.js:1846`, `data/stationBubbles.js:181`, `render/feel.js:1245`, `render/shipMicroMotion.js:1283`, `render/vfx.js:2390`, `systems/cloak.js:52`, `systems/cruise.js:61`, `systems/lawSecurity.js:260`, `systems/onboarding.js:375`, `systems/onboarding.js:388`, `systems/presentationOrchestrator.js:169`, `systems/traffic.js:1400`, `ui/hud.js:3890` |
| `combat:hit` | `systems/salvageActions.js:579`, `systems/salvageActions.js:671` | `systems/routeFollower.js:371` |
| `combat:hitAsset` | `systems/wingmen.js:137` | `systems/automation.js:540` |
| `combat:kill` | `systems/world.js:5341` | — |
| `combat:lockChanged` | `systems/weapons.js:842` | `systems/world.js:559`, `ui/alerts.js:363` |
| `combat:outcome` | `systems/combatOutcome.js:296` | `systems/barkDirector.js:322` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:297` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:4479`, `systems/npcJobsRuntime.js:4715` | `combat/kernel.js:181` |
| `combat:requestAction` | — | `combat/kernel.js:179` |
| `combat:routeDamage` | `systems/bombs.js:1177`, `systems/drill.js:1383`, `systems/hullBurst.js:480`, `systems/impulseCharges.js:1359`, `systems/mines.js:286`, `systems/missions.js:5943` | `combat/kernel.js:180`, `systems/routeFollower.js:372` |
| `combat:shove` | `systems/onboarding.js:1846` | `audio/audioSystem.js:1955`, `systems/onboarding.js:387` |
| `combat:statusApplied` | `combat/statuses.js:212` | `render/vfx.js:2408` |
| `combat:statusExpired` | `combat/statuses.js:90` | `audio/bombAudio.js:366`, `systems/tumbleStates.js:119` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:157`, `systems/encounterDirector.js:277`, `systems/factionPresence.js:436`, `systems/npcJobsRuntime.js:948`, `systems/presentationOrchestrator.js:232`, `systems/surrenderRecovery.js:66`, `systems/tumbleStates.js:123`, `systems/wingMorale.js:179` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1301`, `systems/factionPresence.js:437`, `systems/npcJobsRuntime.js:949`, `systems/presentationOrchestrator.js:241`, `systems/surrenderRecovery.js:67` |
| `combat:surrendered` | — | `systems/combatOutcome.js:158`, `systems/surrenderRecovery.js:65` |
| `combat:tumbled` | `systems/tumbleStates.js:468` | `systems/fields.js:438`, `systems/missions.js:1268`, `systems/tetherGameplay.js:250` |
| `combat:warded` | `combat/damage.js:289` | — |
| `combat:weakPointHit` | `systems/combat.js:632` | `render/vfx.js:2398`, `ui/floatingText.js:188` |
| `comms:log` | `data/encounters/344-opening-hauler-raid.js:130`, `data/encounters/350-the-long-tail.js:175`, `data/encounters/350-the-long-tail.js:209`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:154`, `data/encounters/352-the-slot.js:174`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:138`, `data/encounters/355-the-winnow-throw.js:155`, `data/encounters/355-the-winnow-throw.js:162`, `data/encounters/355-the-winnow-throw.js:179`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:180`, `data/encounters/357-the-handoff.js:194`, `data/encounters/357-the-handoff.js:215`, `data/encounters/358-the-press-camp.js:56`, `data/encounters/358-the-press-camp.js:201`, `data/encounters/358-the-press-camp.js:214`, `systems/alienEcology.js:343`, `systems/alienEcology.js:769`, `systems/alienEcology.js:827`, `systems/alienEcology.js:845`, `systems/alienEcology.js:903`, `systems/alienEcology.js:969`, `systems/alienEcology.js:981`, `systems/alienEcology.js:1707`, `systems/asteroidSites.js:1041`, `systems/encounterDirector.js:2298`, `systems/encounterScripts.js:737`, `systems/encounterScripts.js:2608`, `systems/encounterScripts.js:2854`, `systems/missions.js:4998`, `systems/precursorMachines.js:49`, `systems/precursorMachines.js:205`, `systems/precursorMachines.js:218`, `systems/precursorMachines.js:235`, `systems/precursorMachines.js:258`, `systems/precursorMachines.js:278`, `systems/precursorMachines.js:292`, `systems/precursorMachines.js:301`, `systems/precursorMachines.js:366`, `systems/precursorMachines.js:431`, `systems/precursorMachines.js:458`, `systems/precursorMachines.js:490`, `systems/precursorMachines.js:507`, `systems/precursorMachines.js:522`, `systems/precursorMachines.js:554`, `systems/precursorMachines.js:575`, `systems/precursorMachines.js:582`, `systems/precursorMachines.js:598`, `systems/precursorMachines.js:642`, `systems/salvage.js:95`, `systems/salvage.js:606` | `ui/floatingText.js:80` |
| `comms:message` | `systems/traffic.js:5149`, `systems/traffic.js:5914` | — |
| `comms:popup` | `systems/ai.js:491`, `systems/factionPresence.js:995`, `systems/factionPresence.js:1016`, `systems/memorialThief.js:93`, `systems/missions.js:4233`, `systems/missions.js:6534`, `systems/missions.js:6627`, `systems/missions.js:6666`, `systems/missions.js:7483`, `systems/missions.js:7785`, `systems/missions.js:7929`, `systems/missions.js:8055`, `systems/missions.js:8560`, `systems/missions.js:8602`, `systems/missions.js:9056`, `systems/onboarding.js:769`, `systems/scenarioRuntime.js:186`, `systems/story.js:426`, `systems/story.js:1167`, `systems/story.js:1195` | `audio/audioSystem.js:2023`, `ui/screens/codex.js:630` |
| `conflict:flip` | `systems/factions.js:747` | `systems/factionPresence.js:442`, `systems/sectorSim.js:126`, `systems/story.js:191` |
| `conflict:frontAction` | `systems/factions.js:634` | — |
| `conflict:warDeclared` | `systems/factions.js:691` | — |
| `contactHail:availability` | `systems/scanner.js:1432`, `systems/scanner.js:1443` | — |
| `contactHail:choice` | `ui/commsRadial.js:533`, `ui/contactHailPrompt.js:167` | `systems/scanner.js:843` |
| `contactHail:clear` | `systems/scanner.js:1454` | — |
| `contactHail:handoff` | `systems/scanner.js:1292` | — |
| `contactHail:offer` | `systems/scanner.js:1314` | — |
| `contactHail:request` | `ui/commsRadial.js:585`, `ui/contactHailPrompt.js:161` | `systems/scanner.js:842` |
| `contactHail:response` | `systems/scanner.js:1348` | `systems/traffic.js:1389` |
| `contraband:bribe` | `systems/encounterScripts.js:415`, `ui/customsPrompt.js:230` | `systems/economy.js:1044` |
| `contraband:scanned` | `systems/economy.js:2990` | `systems/encounterDirector.js:286`, `systems/factions.js:395`, `systems/heat.js:287`, `systems/lawSecurity.js:270`, `ui/customsPrompt.js:150` |
| `contract:clauseBroken` | `systems/contractClauses.js:395` | `systems/missions.js:1315` |
| `contract:clauseHonored` | `systems/contractClauses.js:380`, `systems/missions.js:6680` | — |
| `contract:clauseSettledKill` | `systems/contractClauses.js:290` | `systems/missions.js:1234` |
| `countermeasure:denied` | `systems/countermeasures.js:409` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:392` | `render/shipMicroMotion.js:1304` |
| `craft:complete` | `systems/crafting.js:267`, `systems/crafting.js:310` | `ui/station/screens/industry.js:465` |
| `craft:queueChanged` | `systems/crafting.js:162`, `systems/crafting.js:277`, `systems/crafting.js:312` | `systems/onboarding.js:520`, `ui/station/screens/industry.js:465` |
| `credits:changed` | `systems/economy.js:2454`, `systems/economy.js:2466` | `audio/audioSystem.js:1935`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:413`, `ui/hud.js:3874` |
| `cruise:charging` | `systems/cruise.js:123` | `render/vfx.js:2457`, `systems/presentationOrchestrator.js:177` |
| `cruise:dropped` | `systems/cruise.js:193` | `render/vfx.js:2459`, `systems/presentationOrchestrator.js:179` |
| `cruise:engaged` | `systems/cruise.js:98` | `render/vfx.js:2458`, `systems/presentationOrchestrator.js:178` |
| `cruise:snareRequest` | `systems/encounterScripts.js:579` | `systems/cruise.js:66` |
| `cruise:snared` | `systems/cruise.js:192` | `audio/audioSystem.js:2017` |
| `customs:breakScan` | `ui/customsPrompt.js:235` | — |
| `customs:submit` | `ui/customsPrompt.js:213` | `systems/lawSecurity.js:282` |
| `customs:weirBolt` | — | `systems/economy.js:1043` |
| `danger:miningNoise` | `systems/mining.js:2354` | — |
| `day:tick` | `core/coreSystem.js:313` | `systems/custodyConsequences.js:43`, `systems/economy.js:973`, `systems/encounterDirector.js:259`, `systems/factions.js:427`, `systems/sectorSim.js:110` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:226` | `systems/combat.js:544` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:217` | `systems/combat.js:543` |
| `detonator:detonated` | `systems/impulseCharges.js:507` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:184` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:plateUnlocked` | `systems/world.js:845`, `systems/world.js:5201`, `systems/world.js:5531`, `systems/world.js:6152` | `audio/audioSystem.js:1952`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:632` |
| `distress:call` | `systems/traffic.js:5147` | — |
| `distress:rescued` | `systems/encounterScripts.js:736` | `systems/factions.js:405` |
| `dock:attempt` | `ui/input.js:176` | `ui/dockDenyBanner.js:116` |
| `dock:denied` | `ui/dockDenyBanner.js:141` | — |
| `dock:docked` | `balance/careerCohorts.js:507`, `balance/careerCohorts.js:1943`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `ui/input.js:180` | `audio/audioSystem.js:1954`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/infrastructureMotion.js:115`, `render/shipMicroMotion.js:1294`, `save/saveSystem.js:274`, `systems/aftermathWrecks.js:937`, `systems/autoTargetAssist.js:119`, `systems/combat.js:530`, `systems/economy.js:1020`, `systems/economyContracts.js:176`, `systems/factionPresence.js:434`, `systems/lawSecurity.js:279`, `systems/mining.js:202`, `systems/mining.js:204`, `systems/missions.js:1188`, `systems/onboarding.js:349`, `systems/onboarding.js:486`, `systems/pirateDisguise.js:37`, `systems/scanner.js:846`, `systems/stationServices.js:205`, `systems/story.js:156`, `systems/world.js:590`, `systems/world.js:628`, `ui/alerts.js:330`, `ui/cargoConscience.js:143`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:117`, `ui/impoundPayPrompt.js:35`, `ui/priceForecast.js:86`, `ui/promptDeck.js:710`, `ui/securityReadout.js:158`, `ui/uiRoot.js:1154`, `ui/wingmanRadial.js:247`, `ui/worldObjectInteraction.js:328`, `ui/wreckChoicePrompt.js:50` |
| `dock:launder` | `ui/station/screens/market.js:362` | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:1094`, `core/physics.js:1098`, `ui/input.js:153` | `systems/onboarding.js:445`, `ui/alerts.js:326`, `ui/input.js:159` |
| `dock:undocked` | `balance/careerCohorts.js:508`, `balance/careerCohorts.js:1948`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:693`, `ui/station/stationApp.js:863` | `audio/audioSystem.js:1959`, `render/infrastructureMotion.js:116`, `render/shipMicroMotion.js:1295`, `save/saveSystem.js:275`, `systems/combat.js:534`, `systems/economy.js:1029`, `systems/missions.js:1207`, `systems/moralTrap.js:179`, `systems/onboarding.js:398`, `systems/presentationAdapters.js:207`, `systems/stationServices.js:206`, `systems/world.js:591`, `ui/input.js:167`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1186` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1350` | `ui/uiRoot.js:1245` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1335`, `ui/sandbox/sandboxSetup.js:600` | `ui/uiRoot.js:1235` |
| `drill:approachRequested` | `ui/input.js:608` | `systems/tetherGameplay.js:249` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1227`, `ui/sandbox/sandboxSetup.js:599` | `ui/uiRoot.js:1224` |
| `drill:break` | `systems/drill.js:1342` | `audio/audioSystem.js:2146`, `systems/asteroidSites.js:214`, `systems/presentationOrchestrator.js:218`, `ui/asteroid/asteroidScreen.js:1611`, `ui/screens/drill.js:1813` |
| `drill:cargoFull` | `systems/drill.js:275` | `audio/audioSystem.js:2148`, `systems/presentationOrchestrator.js:225`, `ui/asteroid/asteroidScreen.js:1601`, `ui/screens/drill.js:1784` |
| `drill:end` | `systems/drill.js:933` | `audio/audioSystem.js:2156`, `systems/asteroidSites.js:224`, `systems/presentationOrchestrator.js:226` |
| `drill:gasHit` | `systems/drill.js:1370` | `audio/audioSystem.js:2147`, `systems/presentationOrchestrator.js:220`, `ui/asteroid/asteroidScreen.js:1588`, `ui/screens/drill.js:1713` |
| `drill:retry` | `systems/drill.js:982` | `systems/presentationOrchestrator.js:227` |
| `drill:rockDepleted` | `systems/drill.js:220`, `systems/drill.js:254`, `systems/drill.js:899` | `audio/audioSystem.js:2149`, `ui/asteroid/asteroidScreen.js:1598`, `ui/screens/drill.js:1775` |
| `drill:scanPulse` | `systems/drill.js:1055` | `audio/audioSystem.js:2150`, `systems/asteroidSites.js:246`, `systems/presentationOrchestrator.js:216`, `ui/asteroid/asteroidScreen.js:1605`, `ui/screens/drill.js:1801` |
| `drill:spark` | `systems/drill.js:1309` | `audio/audioSystem.js:2145`, `systems/presentationOrchestrator.js:217`, `ui/asteroid/asteroidScreen.js:1616`, `ui/screens/drill.js:1834` |
| `drill:start` | `systems/drill.js:891` | `audio/audioSystem.js:2155`, `systems/asteroidSites.js:207`, `systems/onboarding.js:491`, `systems/presentationOrchestrator.js:215` |
| `drill:warn` | `systems/drill.js:227`, `systems/drill.js:278`, `systems/drill.js:287`, `systems/drill.js:905`, `systems/drill.js:910`, `systems/drill.js:1186`, `systems/drill.js:1221`, `systems/drill.js:1242`, `systems/drill.js:1261` | `audio/audioSystem.js:2151`, `systems/presentationOrchestrator.js:214`, `ui/asteroid/asteroidRenderer3d.js:7110`, `ui/asteroid/asteroidScreen.js:1594`, `ui/screens/drill.js:1741` |
| `drill:yield` | `systems/drill.js:252` | `audio/audioSystem.js:2142`, `systems/presentationOrchestrator.js:219`, `ui/asteroid/asteroidScreen.js:1580`, `ui/screens/drill.js:1692` |
| `ecology:coherence` | `systems/alienEcology.js:785` | — |
| `ecology:evidence` | `systems/precursorMachines.js:213`, `systems/precursorMachines.js:296`, `systems/precursorMachines.js:297`, `systems/precursorMachines.js:494`, `systems/precursorMachines.js:526`, `systems/precursorMachines.js:558` | `systems/world.js:631` |
| `ecology:factionOutcome` | `systems/economy.js:2023`, `systems/economy.js:2277` | `systems/world.js:630` |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:464` | `systems/world.js:632` |
| `ecology:relayPulse` | `systems/alienEcology.js:866` | — |
| `ecology:setpiece` | `systems/alienEcology.js:1650` | — |
| `economy:applyTradePressure` | `systems/automation.js:848`, `systems/automation.js:1582`, `systems/automation.js:1583`, `systems/claims.js:1180`, `systems/encounterDirector.js:1797`, `systems/encounterDirector.js:1845`, `systems/sectorSim.js:398`, `systems/traffic.js:8844`, `systems/traffic.js:10580` | `systems/economy.js:998` |
| `economy:cargoKillOpportunity` | `systems/economy.js:2169` | `systems/missions.js:1219` |
| `economy:chargeCredits` | `systems/automation.js:1753`, `systems/automation.js:1760`, `systems/automation.js:2577`, `systems/automation.js:2801`, `systems/beacons.js:69`, `systems/bombs.js:601`, `systems/bombs.js:684`, `systems/bombs.js:702`, `systems/bombs.js:766`, `systems/claims.js:363`, `systems/claims.js:433`, `systems/claims.js:504`, `systems/claims.js:1255`, `systems/combat.js:884`, `systems/encounterDirector.js:1791`, `systems/factions.js:492`, `systems/gateControlDirector.js:120`, `systems/mining.js:456`, `systems/missions.js:3032`, `systems/missions.js:3035`, `systems/npcJobsRuntime.js:4365`, `systems/pirateParley.js:880`, `systems/ships.js:1833`, `systems/ships.js:1922`, `systems/ships.js:1978`, `systems/world.js:3696`, `systems/world.js:3740`, `systems/world.js:4836` | `systems/economy.js:963` |
| `economy:debtEscalated` | `systems/economy.js:2582` | — |
| `economy:demandShift` | `systems/economy.js:1377` | — |
| `economy:eventEnded` | `systems/economy.js:3068` | `ui/floatingText.js:272` |
| `economy:eventStarted` | `systems/economy.js:3043` | `ui/floatingText.js:261` |
| `economy:freightAccepted` | `systems/economy.js:2356`, `systems/economy.js:2368` | `systems/claims.js:329` |
| `economy:grantCredits` | `systems/automation.js:1854`, `systems/automation.js:1865`, `systems/automation.js:2563`, `systems/bombs.js:719`, `systems/cargo.js:668`, `systems/claims.js:1179`, `systems/claims.js:1826`, `systems/combat.js:734`, `systems/combat.js:746`, `systems/combat.js:972`, `systems/encounterDirector.js:1792`, `systems/mining.js:1948`, `systems/mining.js:2133`, `systems/mining.js:2277`, `systems/missions.js:6688`, `systems/missions.js:6691`, `systems/missions.js:7124`, `systems/missions.js:8969`, `systems/moralTrap.js:317`, `systems/scanReveal.js:117`, `systems/scanReveal.js:150`, `systems/ships.js:2008`, `systems/survivorPod.js:1229`, `systems/uniqueWrecks.js:1580` | `systems/economy.js:962`, `systems/story.js:189` |
| `economy:marketOpened` | `ui/station/screens/market.js:1860` | `systems/economy.js:978`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1612` | `systems/economy.js:965` |
| `economy:salvageIntakeApplied` | `systems/economy.js:2437` | — |
| `economy:sinkCharged` | `systems/economy.js:2480` | — |
| `economy:tick` | `systems/economy.js:1142` | `ui/priceHistory.js:116` |
| `economy:tradeCompleted` | `systems/economy.js:2011` | `audio/audioSystem.js:1936`, `audio/audioSystem.js:1993`, `careers/origins/haulerOriginSystem.js:90`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:282`, `systems/claims.js:326`, `systems/factions.js:371`, `systems/missions.js:1217`, `systems/onboarding.js:354`, `systems/sectorSim.js:121`, `systems/story.js:185` |
| `economy:tradeFailed` | `systems/economy.js:2240`, `systems/economy.js:2263` | — |
| `emergent:audio` | `systems/emergentPrimitives.js:181` | `audio/emergentPrimitiveVoice.js:83` |
| `emergent:contact` | `systems/emergentPrimitives.js:187` | `render/feel.js:1327` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1648` | `ui/encounterChoicePrompt.js:75` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:300` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1733` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `systems/encounterDirector.js:2339` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:7655` | `systems/encounterDirector.js:284` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1944`, `systems/encounterScripts.js:2828` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:2303` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:1138` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1055`, `systems/encounterScripts.js:1123` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:1028` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1746` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:1728`, `systems/encounterDirector.js:1777`, `systems/survivalArena.js:1230` | `audio/audioSystem.js:1963`, `systems/aftermathWrecks.js:936`, `systems/claims.js:333`, `systems/claims.js:334`, `systems/story.js:137`, `systems/terrainAnchors.js:89`, `systems/traffic.js:1455`, `systems/uniqueLootAbilities.js:133`, `ui/encounterChoicePrompt.js:76` |
| `encounter:spawned` | `systems/encounterDirector.js:1096` | `systems/uniqueLootAbilities.js:132` |
| `encounter:stale` | `systems/encounterDirector.js:431` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1068`, `systems/survivalArena.js:1151` | `audio/audioSystem.js:1962`, `systems/survivalResults.js:492`, `systems/terrainAnchors.js:88`, `systems/world.js:600` |
| `encounter:voice` | `systems/encounterDirector.js:1631` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | `ui/encounterChoicePrompt.js:77` |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | `systems/story.js:145` |
| `endgame:archive` | `systems/story.js:172` | — |
| `endgame:chosen` | `systems/story.js:951` | `ui/screens/missionLog.js:2445` |
| `endgame:confirmRequired` | `systems/story.js:836` | `ui/screens/missionLog.js:2444` |
| `endgame:eligibility` | `systems/story.js:653` | `ui/screens/missionLog.js:2443` |
| `endgame:finaleCompleted` | `systems/story.js:729` | — |
| `endgame:finaleReady` | `systems/story.js:960` | — |
| `endgame:ineligible` | `systems/story.js:739`, `systems/story.js:816`, `systems/story.js:881` | — |
| `endgame:loopBack` | — | `systems/story.js:180` |
| `endgame:promptChoiceC` | `systems/story.js:801` | — |
| `endgame:promptChoiceD` | `systems/story.js:765` | — |
| `endgame:promptSandbox` | `systems/story.js:664` | — |
| `endgame:pullCompleted` | `systems/claims.js:2417` | `systems/factions.js:418` |
| `endgame:sandboxContinued` | `systems/story.js:945` | `ui/screens/missionLog.js:2446` |
| `entity:destroyed` | `main.js:499`, `main.js:733`, `save/saveSystem.js:3592`, `systems/survivorPod.js:309`, `systems/traffic.js:6908` | `audio/audioSystem.js:1909`, `combat/kernel.js:175`, `render/vfx.js:2419`, `systems/aftermathWrecks.js:931`, `systems/ai.js:114`, `systems/aiEncounter.js:130`, `systems/cloak.js:87`, `systems/combatOutcome.js:161`, `systems/encounterDirector.js:275`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:247`, `systems/lawSecurity.js:263`, `systems/missions.js:1236`, `systems/missions.js:1341`, `systems/npcJobsRuntime.js:933`, `systems/presentationOrchestrator.js:176`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:94`, `systems/survivalWave.js:132`, `systems/swarmArena.js:446`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:219` |
| `entity:killed` | `balance/careerCohorts.js:476`, `combat/damage.js:469`, `combat/kernel.js:124`, `systems/combat.js:700` | `audio/audioSystem.js:1908`, `render/feel.js:1205`, `render/shipMicroMotion.js:1278`, `render/vfx.js:2418`, `sim/titleAttract.js:166`, `systems/aftermathWrecks.js:929`, `systems/ai.js:115`, `systems/barkDirector.js:330`, `systems/barkDirector.js:331`, `systems/combatOutcome.js:155`, `systems/economy.js:1009`, `systems/encounterDirector.js:276`, `systems/factions.js:273`, `systems/factions.js:333`, `systems/impulseCharges.js:234`, `systems/lawSecurity.js:262`, `systems/lawSecurity.js:274`, `systems/lootShards.js:543`, `systems/lossLedger.js:380`, `systems/mining.js:197`, `systems/missions.js:1229`, `systems/missions.js:1340`, `systems/npcJobsRuntime.js:925`, `systems/onboarding.js:389`, `systems/onboarding.js:414`, `systems/presentationOrchestrator.js:175`, `systems/sectorSim.js:125`, `systems/surrenderRecovery.js:72`, `systems/survivalResults.js:481`, `systems/survivalWave.js:133`, `systems/survivorPod.js:450`, `systems/swarmChain.js:107`, `systems/swarmSupply.js:101`, `systems/titles.js:397`, `systems/traffic.js:1377`, `systems/wingMorale.js:178`, `systems/world.js:604`, `ui/floatingText.js:185`, `ui/floatingText.js:228`, `ui/uiRoot.js:631`, `ui/uiRoot.js:639` |
| `entity:spawnRequest` | `data/scanReveal.js:357`, `systems/salvageActions.js:260`, `systems/salvageActions.js:483` | `core/coreSystem.js:223` |
| `entity:spawned` | `core/coreSystem.js:121` | `combat/kernel.js:170`, `render/asteroidMotionPresentation.js:453`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:220`, `render/shipMicroMotion.js:1279`, `render/vfx.js:2425`, `sim/titleAttract.js:167`, `systems/aiEncounter.js:129`, `systems/barkDirector.js:317`, `systems/barkDirector.js:318`, `systems/combatOutcome.js:160`, `systems/factionPresence.js:440`, `systems/fields.js:433`, `systems/flybyFocus.js:303`, `systems/lawSecurity.js:261`, `systems/lossLedger.js:379`, `systems/npcJobsRuntime.js:910`, `systems/salvageActions.js:125`, `systems/survivalSwarm.js:216`, `systems/swarmSupply.js:106`, `systems/titles.js:398`, `systems/uniqueLootAbilities.js:135` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:320`, `systems/environmentalMachinery.js:845` | `systems/terrainAnchors.js:90` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:660` | `systems/terrainAnchors.js:94` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:739` | `systems/terrainAnchors.js:92` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:936` | `data/hazardLanguage.js:133` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:672` | `systems/terrainAnchors.js:96` |
| `escalation:arrived` | `systems/encounterDirector.js:471` | — |
| `escalation:seeded` | `systems/encounterDirector.js:458` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:468`, `systems/factions.js:534`, `systems/factions.js:877` | `systems/heat.js:296` |
| `faction:bribe` | `ui/screens/footprint.js:1618` | `systems/factions.js:254` |
| `faction:repChanged` | `systems/factions.js:465`, `systems/factions.js:529`, `systems/factions.js:873` | `ui/floatingText.js:246`, `ui/station/screens/factions.js:409` |
| `faction:repDelta` | `balance/careerCohorts.js:270`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `systems/choirReliefBerth.js:199`, `systems/choirReliefBerth.js:233`, `systems/claims.js:1493`, `systems/economy.js:2759`, `systems/economy.js:2982`, `systems/encounterDirector.js:1793`, `systems/missions.js:7121`, `systems/missions.js:7182`, `systems/missions.js:8921`, `systems/missions.js:8923`, `systems/missions.js:8987`, `systems/moralTrap.js:311`, `systems/stuntGrammar.js:102`, `systems/survivorPod.js:949`, `systems/survivorPod.js:1235`, `systems/uniqueWrecks.js:1584`, `systems/world.js:5657`, `systems/world.js:5891` | `systems/factions.js:241` |
| `faction:repSpillover` | `systems/factions.js:527` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | `systems/factions.js:246` |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1243` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:999` | `systems/story.js:206` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1155` | `ui/uiRoot.js:293` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:847` | — |
| `factionPresence:service` | `systems/factionPresence.js:948` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1024` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:581`, `systems/factionPresence.js:666` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:789` | `systems/world.js:563` |
| `field:opportunity` | `systems/world.js:4146` | — |
| `field:regrown` | `systems/world.js:4075` | `systems/presentationOrchestrator.js:213` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:717`, `systems/traffic.js:1745`, `systems/traffic.js:10499` | — |
| `field:richSeamOpened` | `systems/traffic.js:9552` | — |
| `field:richSeamWorked` | `systems/mining.js:859`, `systems/traffic.js:9211` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:788` | `systems/npcJobsRuntime.js:941`, `systems/presentationOrchestrator.js:212` |
| `fields:anchorRegistered` | `systems/fields.js:954` | — |
| `fields:cleared` | `systems/fields.js:1487` | — |
| `fields:clusterDetonate` | `systems/fields.js:2068` | `systems/presentationOrchestrator.js:274` |
| `fields:coneToggled` | `systems/fields.js:1175`, `systems/fields.js:1181`, `systems/fields.js:1275`, `systems/fields.js:1283` | `systems/onboarding.js:405` |
| `fields:deployDenied` | `systems/fields.js:1049` | — |
| `fields:deployed` | `systems/fields.js:617`, `systems/fields.js:702`, `systems/fields.js:1135`, `systems/fields.js:1172`, `systems/fields.js:1266`, `systems/fields.js:1380` | `audio/audioSystem.js:2104`, `systems/fields.js:434`, `systems/onboarding.js:404` |
| `fields:ended` | `systems/fields.js:973`, `systems/fields.js:1282`, `systems/fields.js:1303`, `systems/fields.js:1453` | — |
| `fields:hitchCut` | `systems/fields.js:648` | — |
| `fields:hitchLatched` | `systems/fields.js:636` | — |
| `fields:specialistDisrupt` | `systems/fields.js:526` | — |
| `firsthour:beat` | `systems/onboarding.js:2703` | — |
| `firsthour:complete` | `systems/onboarding.js:2716` | — |
| `firsthour:milestone` | `systems/onboarding.js:850` | `audio/audioSystem.js:2097` |
| `firsthour:sentence` | `systems/onboarding.js:1484` | — |
| `firsthour:started` | `systems/onboarding.js:2501` | — |
| `firsthour:verb` | `systems/onboarding.js:2640` | — |
| `flight:modeChanged` | `systems/flightV3.js:594` | — |
| `flybyFocus:end` | `systems/flybyFocus.js:357` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:491` | `systems/onboarding.js:372` |
| `formation:discovered` | `systems/asteroidFormations.js:284` | — |
| `freight:arrival` | `systems/traffic.js:7267` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1540`, `systems/encounterScripts.js:1761`, `systems/traffic.js:5273` | `systems/barkDirector.js:328`, `systems/economy.js:964`, `systems/encounterDirector.js:305`, `systems/lootShards.js:546`, `systems/sectorSim.js:132`, `systems/traffic.js:1395` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1402` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:605` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1459` | — |
| `freight:loss` | `systems/encounterDirector.js:1855`, `systems/traffic.js:8846`, `systems/traffic.js:10592` | `systems/claims.js:340`, `systems/encounterDirector.js:306`, `systems/sectorSim.js:131` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1403` | `systems/surrenderRecovery.js:73` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1897` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:282`, `systems/traffic.js:1392` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:283`, `systems/traffic.js:1393` |
| `frontierRumor:acquired` | `systems/world.js:3759` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:6122` | — |
| `frontierRumor:contacted` | `systems/world.js:6018` | — |
| `frontierRumor:resolved` | `systems/world.js:3776` | — |
| `fuel:changed` | `systems/economy.js:2624`, `systems/stationServices.js:422`, `systems/stationServices.js:489`, `systems/world.js:5363`, `systems/world.js:5371` | — |
| `fuel:empty` | `systems/world.js:5364` | `audio/audioSystem.js:1983`, `ui/alerts.js:371` |
| `game:exitToMenu` | `ui/screens/crucible.js:2927`, `ui/screens/crucible.js:2940`, `ui/screens/demoEnd.js:216`, `ui/screens/pause.js:983` | `audio/audioSystem.js:2194`, `main.js:265`, `save/saveSystem.js:300`, `systems/runSession.js:68`, `ui/screens/crucibleLabControls.js:552` |
| `game:load` | `ui/input.js:319`, `ui/input.js:493`, `ui/screens/gameOver.js:468`, `ui/screens/mainMenu.js:523`, `ui/screens/saveLoad.js:1215` | `save/saveSystem.js:196`, `systems/scanner.js:845`, `ui/commandBar.js:430`, `ui/promptDeck.js:709` |
| `game:loadingProgress` | `main.js:131`, `main.js:154`, `main.js:162`, `main.js:180`, `main.js:298`, `main.js:677`, `main.js:758`, `main.js:774`, `main.js:793`, `main.js:811`, `main.js:852`, `main.js:989` | `ui/loadingPresenter.js:178`, `ui/screens/newGame.js:817`, `ui/screens/saveLoad.js:819` |
| `game:new` | `main.js:442`, `ui/sandbox/sandboxSetup.js:366`, `ui/screens/crucible.js:2931`, `ui/screens/gameOver.js:481`, `ui/screens/newGame.js:896` | `audio/audioSystem.js:2189`, `audio/bombAudio.js:360`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:237`, `main.js:243`, `render/feel.js:1147`, `render/vfx.js:2433`, `save/saveSystem.js:259`, `systems/aftermathWrecks.js:943`, `systems/aiEncounter.js:134`, `systems/bombs.js:465`, `systems/cloak.js:82`, `systems/combatOutcome.js:165`, `systems/countermeasures.js:137`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:83`, `systems/encounterDirector.js:273`, `systems/environmentalMachinery.js:156`, `systems/fields.js:427`, `systems/impulseCharges.js:239`, `systems/massSeed.js:120`, `systems/masslineSnares.js:129`, `systems/mines.js:77`, `systems/mining.js:219`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:276`, `systems/salvageActions.js:132`, `systems/scanner.js:844`, `systems/surrenderRecovery.js:79`, `systems/survivorPod.js:448`, `systems/tetherGameplay.js:244`, `systems/tumbleStates.js:121`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/moralTrapPrompt.js:44`, `ui/priceHistory.js:146`, `ui/promptDeck.js:708`, `ui/screens/crucibleLabControls.js:546`, `ui/wreckChoicePrompt.js:52` |
| `game:newGame` | `main.js:520` | `audio/audioSystem.js:2190`, `audio/bombAudio.js:361`, `core/coreSystem.js:238`, `render/shipMicroMotion.js:1282`, `render/vfx.js:2434`, `save/saveSystem.js:263`, `systems/aftermathWrecks.js:944`, `systems/bombs.js:468`, `systems/cloak.js:83`, `systems/collisionConsequences.js:79`, `systems/combatOutcome.js:171`, `systems/countermeasures.js:138`, `systems/difficultyDirector.js:169`, `systems/fieldDepletion.js:705`, `systems/fragileCargo.js:282`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:382`, `systems/salvageActions.js:133`, `systems/survivorPod.js:447`, `systems/titles.js:400`, `systems/tumbleStates.js:122`, `systems/wingMorale.js:180`, `ui/cargoConscience.js:147`, `ui/uiRoot.js:540` |
| `game:over` | `systems/combat.js:657`, `systems/combat.js:788` | `ui/uiRoot.js:1268` |
| `game:save` | `ui/input.js:318`, `ui/input.js:491`, `ui/screens/saveLoad.js:1235` | `save/saveSystem.js:185` |
| `game:scenePrepared` | `main.js:581` | `ui/sandbox/sandboxSetup.js:390` |
| `game:startFailed` | `main.js:942` | `ui/loadingPresenter.js:187`, `ui/sandbox/sandboxSetup.js:395`, `ui/screens/crucibleLabControls.js:548`, `ui/screens/newGame.js:816`, `ui/screens/saveLoad.js:825` |
| `game:started` | `main.js:686` | `audio/audioSystem.js:2195`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:239`, `save/saveSystem.js:256`, `save/saveSystem.js:270`, `sim/killcamTape.js:426`, `systems/automation.js:560`, `systems/collisionConsequences.js:78`, `systems/combat.js:541`, `systems/economyContracts.js:179`, `systems/factions.js:238`, `systems/flight.js:79`, `systems/flightV3.js:156`, `systems/heat.js:303`, `systems/lootShards.js:547`, `systems/masslineSnares.js:130`, `systems/missions.js:1166`, `systems/onboarding.js:334`, `systems/presentationAdapters.js:205`, `systems/presentationOrchestrator.js:277`, `systems/sectorSim.js:116`, `systems/ships.js:1548`, `systems/story.js:135`, `systems/surrenderRecovery.js:80`, `systems/survivalDraft.js:130`, `systems/tetherGameplay.js:245`, `ui/alerts.js:351`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:387`, `ui/screens/crucibleLabControls.js:547`, `ui/uiRoot.js:1253`, `ui/uiRoot.js:1294`, `ui/uiRoot.js:1296` |
| `gamepad:connected` | `systems/gamepad.js:666` | — |
| `gamepad:disconnected` | `systems/gamepad.js:658` | — |
| `gate:range` | `core/physics.js:1104`, `core/physics.js:1108` | `systems/onboarding.js:452`, `systems/presentationOrchestrator.js:180`, `ui/alerts.js:332` |
| `gate:verdict` | `systems/gateControlDirector.js:135` | — |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:565`, `systems/story.js:502`, `systems/story.js:516`, `systems/story.js:548`, `systems/story.js:1303`, `systems/story.js:1650`, `systems/story.js:1818`, `systems/uniqueWrecks.js:1590` | `systems/ships.js:1543`, `ui/screens/codex.js:631` |
| `harasser:disengaged` | `systems/encounterDirector.js:2149` | — |
| `hazard:changed` | `systems/world.js:838` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:879`, `systems/world.js:5230` | `data/hazardLanguage.js:129`, `render/shipMicroMotion.js:1287` |
| `hazard:exit` | `systems/environmentalMachinery.js:888`, `systems/world.js:5237` | `data/hazardLanguage.js:130`, `render/shipMicroMotion.js:1288` |
| `heat:changed` | `systems/heat.js:667` | `audio/audioSystem.js:1986`, `render/vfx.js:2430`, `systems/barkDirector.js:338`, `systems/lawSecurity.js:280`, `systems/onboarding.js:417`, `ui/hud.js:3902` |
| `heat:clear` | — | `systems/heat.js:307` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:847` | `systems/missions.js:1278` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1213` | — |
| `heist:captureFork` | `systems/heistFacilities.js:1468` | `systems/missions.js:1287` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1355` | `systems/missions.js:1283` |
| `heist:launchCue` | `systems/heistFacilities.js:339` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:457`, `systems/heistFacilities.js:466`, `systems/heistFacilities.js:470`, `systems/heistFacilities.js:484` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:1867` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:1809` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:1790` | `systems/npcJobsRuntime.js:955` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:1728` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:249` |
| `hud:firstUse` | `systems/onboarding.js:642` | `ui/hud.js:2080` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:286` |
| `hud:phase` | `systems/story.js:259`, `systems/story.js:289`, `systems/story.js:292`, `systems/story.js:589` | `ui/hudMeta.js:142` |
| `hud:recallObjective` | `ui/input.js:337` | `ui/hud.js:1596` |
| `hud:slotClaim` | `ui/promptDeck.js:229` | `ui/hud.js:1972` |
| `hud:slotRelease` | `ui/promptDeck.js:230` | `ui/hud.js:1973` |
| `hud:tagFlicker` | `systems/story.js:566` | `ui/hudMeta.js:176` |
| `hull:fractured` | `systems/hullFracture.js:292` | — |
| `hullBurst:activated` | `systems/hullBurst.js:191` | — |
| `hullBurst:ended` | `systems/hullBurst.js:216` | — |
| `hullBurst:hit` | `systems/hullBurst.js:333`, `systems/hullBurst.js:357`, `systems/hullBurst.js:539` | — |
| `hullBurst:released` | `systems/hullBurst.js:471` | — |
| `input:worldGestureCancelled` | `systems/input.js:1010`, `ui/worldObjectInteraction.js:178` | `systems/masslineThrow.js:109` |
| `interdiction:triggered` | `systems/encounterScripts.js:580`, `systems/world.js:4708` | `systems/presentationOrchestrator.js:188`, `systems/sectorSim.js:122` |
| `intervention:available` | `systems/intervention.js:212` | — |
| `intervention:closed` | `systems/intervention.js:265` | — |
| `intervention:jumperRipped` | `systems/intervention.js:384` | — |
| `intervention:logged` | `systems/intervention.js:124` | — |
| `jump:arrive` | `systems/world.js:4649` | `render/feel.js:1289`, `render/shipMicroMotion.js:1292`, `save/saveSystem.js:277`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:186`, `systems/sectorSim.js:137` |
| `jump:chargeAbort` | `systems/world.js:4788`, `systems/world.js:4863`, `systems/world.js:4923` | `render/shipMicroMotion.js:1293`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:185`, `systems/routeFollower.js:363`, `ui/galaxyMap.js:2261`, `ui/toasts.js:473` |
| `jump:chargeStart` | `systems/world.js:4848`, `systems/world.js:4889` | `render/feel.js:1279`, `render/shipMicroMotion.js:1289`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:182`, `systems/story.js:162`, `ui/galaxyMap.js:2260` |
| `jump:chargeTick` | `systems/world.js:4592` | `render/shipMicroMotion.js:1290`, `systems/presentationOrchestrator.js:183` |
| `jump:departurePreflight` | `systems/world.js:4832` | `systems/story.js:161` |
| `jump:start` | `systems/world.js:4609` | `render/feel.js:1283`, `render/shipMicroMotion.js:1291`, `systems/economy.js:1039`, `systems/gateControlDirector.js:66`, `systems/mining.js:205`, `systems/presentationOrchestrator.js:184`, `systems/sectorSim.js:136` |
| `jump:unfiledConfirmed` | `systems/world.js:4907` | `systems/story.js:163` |
| `landmark:artifactRecovered` | `systems/missions.js:4520` | `systems/world.js:592` |
| `law:custodyAcknowledged` | — | `systems/barkDirector.js:337` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:42` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:332` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:70` | `systems/lawSecurity.js:281` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:30` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:31` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:44` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:46`, `systems/heat.js:317`, `ui/impoundPayPrompt.js:32` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:33` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:45` |
| `law:incidentOpened` | — | `systems/traffic.js:1401` |
| `law:killedAdjudicated` | — | `systems/factions.js:263` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:335`, `systems/factions.js:346`, `systems/heat.js:328` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:313` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:334` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:333` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:304` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `systems/lawSecurity.js:269` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:750`, `systems/lootShards.js:1035`, `systems/stuntGrammar.js:110` | `systems/mining.js:199`, `ui/floatingText.js:212`, `ui/floatingText.js:219` |
| `loot:magnetCaptured` | `systems/lootShards.js:616` | — |
| `loot:manifestPayload` | `systems/lootShards.js:1141` | `systems/missions.js:1344` |
| `loot:overflowConverted` | `systems/mining.js:2282` | `audio/audioSystem.js:1923`, `ui/floatingText.js:214` |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:342` | `systems/factionPresence.js:435`, `systems/ships.js:1497` |
| `map:sectorCharted` | `systems/world.js:3700` | `systems/economy.js:983` |
| `massSeed:cleared` | `systems/massSeed.js:591` | — |
| `massSeed:collapsed` | `systems/massSeed.js:414`, `systems/massSeed.js:464`, `systems/massSeed.js:544`, `systems/massSeed.js:574` | — |
| `massSeed:collapsing` | `systems/massSeed.js:413`, `systems/massSeed.js:435`, `systems/massSeed.js:530`, `systems/massSeed.js:572` | — |
| `massSeed:deployDenied` | `systems/massSeed.js:154` | — |
| `massSeed:deployed` | `systems/massSeed.js:249` | — |
| `massSeed:destroyed` | `systems/massSeed.js:571` | — |
| `massSeed:locked` | `systems/massSeed.js:302` | — |
| `massSeed:locking` | `systems/massSeed.js:365` | — |
| `massSeed:tetherCut` | `systems/massSeed.js:492` | — |
| `massSeed:warning` | `systems/massSeed.js:328` | — |
| `massline:bridleCut` | `systems/tetherGameplay.js:849` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:794`, `systems/tetherGameplay.js:810`, `systems/tetherGameplay.js:979` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:658` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:712` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:859` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2210` | — |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:2365` | — |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1598` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:1719` | — |
| `massline:recovered` | `systems/tumbleStates.js:233` | — |
| `massline:recovering` | `systems/tumbleStates.js:557` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:166` | — |
| `massline:releaseValidated` | `systems/masslineThrow.js:577` | `systems/presentationOrchestrator.js:163` |
| `massline:releaseWindow` | `systems/masslineThrow.js:227` | — |
| `massline:selfSling` | `systems/masslineThrow.js:604` | `systems/flightV3.js:158`, `systems/onboarding.js:604` |
| `massline:snareArmed` | `systems/masslineSnares.js:223` | — |
| `massline:snareCaught` | `systems/masslineSnares.js:418` | — |
| `massline:snareCut` | `systems/masslineSnares.js:532` | — |
| `massline:snareDeployed` | `systems/masslineSnares.js:325` | — |
| `massline:snareEnded` | `systems/masslineSnares.js:534` | — |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `systems/masslineImpactDamage.js:42`, `systems/presentationOrchestrator.js:150` |
| `massline:threat` | `systems/masslineThreats.js:273` | `systems/presentationOrchestrator.js:126` |
| `massline:throw` | `systems/masslineThrow.js:519` | `systems/lootShards.js:545`, `systems/mines.js:74`, `systems/missions.js:1266`, `systems/tumbleStates.js:109` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:556` | `render/feel.js:1374` |
| `massline:tumbled` | `systems/tumbleStates.js:469` | `render/feel.js:1360` |
| `mines:armed` | `systems/mines.js:175`, `systems/mines.js:208` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:93` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:147`, `systems/survivalArena.js:1122`, `systems/swarmEvents.js:208` | `systems/mines.js:73` |
| `mines:placed` | `systems/mines.js:148` | `systems/survivalArena.js:892` |
| `mines:released` | `systems/mines.js:301` | — |
| `mines:triggered` | `systems/mines.js:266` | — |
| `mining:beamLocked` | `systems/mining.js:767` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2134` | `systems/missions.js:1227`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:781` | `systems/presentationOrchestrator.js:208`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:594` | `ui/miningHud.js:206` |
| `mining:npcExtraction` | `systems/traffic.js:9199` | `systems/fieldDepletion.js:704` |
| `mining:podSplit` | `systems/mining.js:1572` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2079` | `render/asteroidMotionPresentation.js:455`, `systems/presentationOrchestrator.js:205`, `ui/miningHud.js:209` |
| `mining:richCoreCompleted` | `systems/mining.js:2112` | `render/asteroidMotionPresentation.js:456`, `systems/presentationOrchestrator.js:206`, `ui/miningHud.js:210` |
| `mining:richCoreExposed` | `systems/mining.js:2057` | `render/asteroidMotionPresentation.js:454`, `systems/presentationOrchestrator.js:204`, `ui/miningHud.js:208` |
| `mining:richCoreFizzle` | `systems/mining.js:2116` | `render/asteroidMotionPresentation.js:457`, `systems/presentationOrchestrator.js:207`, `ui/miningHud.js:211` |
| `mining:seamHit` | `systems/mining.js:2422` | `systems/presentationOrchestrator.js:197` |
| `mining:start` | `systems/mining.js:297`, `systems/mining.js:419`, `systems/mining.js:1521` | `audio/audioSystem.js:1912`, `render/asteroidMotionPresentation.js:449`, `render/vfx.js:2443`, `systems/missions.js:1335`, `systems/onboarding.js:357`, `systems/presentationOrchestrator.js:194`, `ui/miningHud.js:204`, `ui/worldObjectInteraction.js:317` |
| `mining:stop` | `systems/mining.js:542` | `audio/audioSystem.js:1913`, `render/asteroidMotionPresentation.js:450`, `render/vfx.js:2444`, `systems/presentationOrchestrator.js:195`, `ui/miningHud.js:205` |
| `mining:tick` | `systems/automation.js:996`, `systems/mining.js:802` | `audio/audioSystem.js:1914`, `render/vfx.js:2445`, `systems/presentationOrchestrator.js:196`, `ui/miningHud.js:207` |
| `mining:ventBonus` | `systems/mining.js:638` | — |
| `mining:ventReady` | `systems/mining.js:575` | `systems/presentationOrchestrator.js:201` |
| `mining:yield` | `balance/careerCohorts.js:2146`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:633`, `systems/mining.js:995`, `systems/mining.js:1065`, `systems/mining.js:1647`, `systems/mining.js:2109` | `careers/origins/prospectorOrigin.js:636`, `render/vfx.js:2448`, `systems/encounterDirector.js:302`, `systems/missions.js:1221`, `systems/onboarding.js:358`, `systems/presentationOrchestrator.js:202`, `ui/floatingText.js:196` |
| `mission:abandon` | `systems/moralTrap.js:301` | `systems/missions.js:1179` |
| `mission:accepted` | `systems/missions.js:3054` | `audio/audioSystem.js:1946`, `save/saveSystem.js:278`, `systems/aftermathWrecks.js:939`, `systems/contractClauses.js:226`, `systems/economy.js:959`, `systems/moralTrap.js:182`, `systems/onboarding.js:360`, `ui/hud.js:3882`, `ui/screens/missionLog.js:2428`, `ui/wreckChoicePrompt.js:45` |
| `mission:completed` | `systems/missions.js:6786` | `audio/audioSystem.js:1947`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:279`, `systems/aftermathWrecks.js:940`, `systems/claims.js:330`, `systems/contractClauses.js:230`, `systems/factions.js:380`, `systems/lossLedger.js:381`, `systems/onboarding.js:361`, `systems/story.js:184`, `ui/hud.js:3883`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2429` |
| `mission:conditionBroken` | `systems/contractClauses.js:348`, `systems/missions.js:1531` | — |
| `mission:conditionPending` | `systems/missions.js:1584` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:316`, `systems/missions.js:1514` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:327`, `systems/missions.js:1522` | `systems/missions.js:1318` |
| `mission:expired` | `systems/missions.js:7196` | `audio/audioSystem.js:1951`, `save/saveSystem.js:281`, `systems/aftermathWrecks.js:942`, `systems/factions.js:389`, `ui/screens/missionLog.js:2431` |
| `mission:failed` | `systems/missions.js:7144` | `audio/audioSystem.js:1950`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:280`, `systems/aftermathWrecks.js:941`, `systems/factions.js:388`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2430` |
| `mission:forceEvent` | — | `systems/economy.js:1047` |
| `mission:offerBoarded` | `systems/missions.js:2328` | `systems/aftermathWrecks.js:938`, `systems/economyContracts.js:174` |
| `mission:offered` | `systems/aftermathWrecks.js:1669`, `systems/alienEcology.js:334`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:255`, `systems/lossLedger.js:318`, `systems/postEndingReplay.js:340`, `systems/salvage.js:616`, `systems/uniqueWrecks.js:898` | `systems/economy.js:958`, `systems/lossInvestigation.js:106`, `systems/missions.js:1184`, `systems/survivorPod.js:445` |
| `mission:setPieceTransition` | `systems/missions.js:6614` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:8566` | — |
| `mission:spawnDeferred` | `systems/missions.js:7862` | — |
| `mission:updated` | `systems/contractClauses.js:321`, `systems/contractClauses.js:331`, `systems/contractClauses.js:360`, `systems/missions.js:1518`, `systems/missions.js:1526`, `systems/missions.js:1544`, `systems/missions.js:1619`, `systems/missions.js:1738`, `systems/missions.js:1839`, `systems/missions.js:1909`, `systems/missions.js:2139`, `systems/missions.js:2173`, `systems/missions.js:2185`, `systems/missions.js:2327`, `systems/missions.js:2981`, `systems/missions.js:3066`, `systems/missions.js:3216`, `systems/missions.js:3424`, `systems/missions.js:4103`, `systems/missions.js:4139`, `systems/missions.js:4152`, `systems/missions.js:4160`, `systems/missions.js:4176`, `systems/missions.js:4222`, `systems/missions.js:4283`, `systems/missions.js:4397`, `systems/missions.js:4406`, `systems/missions.js:4592`, `systems/missions.js:4618`, `systems/missions.js:4686`, `systems/missions.js:4702`, `systems/missions.js:4746`, `systems/missions.js:4767`, `systems/missions.js:4803`, `systems/missions.js:4855`, `systems/missions.js:5035`, `systems/missions.js:6043`, `systems/missions.js:6198`, `systems/missions.js:6259`, `systems/missions.js:6332`, `systems/missions.js:6339`, `systems/missions.js:6775`, `systems/missions.js:7167`, `systems/missions.js:7212`, `systems/missions.js:7542`, `systems/missions.js:7835`, `systems/missions.js:7853`, `systems/missions.js:7990`, `systems/missions.js:8061`, `systems/missions.js:8143`, `systems/missions.js:8210`, `systems/missions.js:8414`, `systems/missions.js:8447`, `systems/missions.js:8462`, `systems/missions.js:8476`, `systems/missions.js:8734`, `systems/missions.js:9016`, `systems/missions.js:9162` | `ui/hud.js:3881`, `ui/screens/missionLog.js:2427`, `ui/station/screens/contracts.js:1394` |
| `mode:changed` | `main.js:268`, `main.js:919`, `main.js:929`, `main.js:940`, `save/saveSystem.js:3118`, `save/saveSystem.js:3256` | `systems/autoTargetAssist.js:114`, `systems/presentationAdapters.js:204`, `systems/scanner.js:847`, `ui/loadingPresenter.js:179`, `ui/screenManager.js:601`, `ui/uiRoot.js:810`, `ui/wingmanRadial.js:246` |
| `module:equipped` | `systems/ships.js:2131` | `systems/onboarding.js:397`, `systems/ships.js:1446`, `systems/survivalDraft.js:124`, `systems/world.js:560` |
| `module:granted` | `systems/ships.js:1936` | — |
| `module:purchased` | `systems/ships.js:1923` | — |
| `module:unequipped` | `systems/ships.js:1603`, `systems/ships.js:2150` | `systems/ships.js:1447`, `systems/survivalDraft.js:125`, `systems/world.js:561` |
| `moment:amended` | `systems/bulletTime.js:256` | `ui/screens/clips.js:85` |
| `moment:holyShit` | — | `render/feel.js:1349` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:293` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | `systems/encounterDirector.js:295` |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:181` |
| `moralTrap:resolved` | `systems/moralTrap.js:297` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:245` | `ui/moralTrapPrompt.js:37` |
| `namedAce:appeared` | `systems/encounterScripts.js:2778` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:308` |
| `nav:abortRoute` | — | `systems/routeFollower.js:355` |
| `nav:autopilot` | `systems/flight.js:404`, `systems/flightV3.js:1021`, `systems/world.js:4981` | `systems/routeFollower.js:358` |
| `nav:engageRoute` | `systems/routeFollower.js:353` | `systems/routeFollower.js:348` |
| `nav:waypoint` | `save/saveSystem.js:3567`, `systems/claims.js:1532`, `systems/claims.js:1540`, `systems/missions.js:1198`, `systems/missions.js:3413`, `systems/missions.js:3480`, `systems/missions.js:3512`, `systems/missions.js:4121`, `systems/world.js:4980`, `ui/market/tradeLogic.js:484` | — |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:123` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:188` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:119` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `news:headline` | `systems/aftermathWrecks.js:781`, `systems/e1EncounterRuntime.js:225`, `systems/nemesisSignals.js:25`, `systems/traffic.js:8847`, `systems/traffic.js:10594`, `ui/marketNews.js:265` | — |
| `news:publish` | `systems/aftermathWrecks.js:799`, `systems/choirReliefBerth.js:181`, `systems/claims.js:2001`, `systems/claims.js:2425`, `systems/claims.js:2472`, `systems/eighthBellRuntime.js:122`, `systems/memorialThief.js:126`, `systems/npcJobsRuntime.js:1114`, `systems/traffic.js:3682`, `systems/traffic.js:10205`, `systems/uniqueWrecks.js:482`, `systems/uniqueWrecks.js:1634`, `systems/world.js:847` | — |
| `news:render` | `ui/hud.js:1508` | — |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:4777` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1386` |
| `npcjobs:load` | — | `systems/traffic.js:1384` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1090` | — |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1083` | — |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1071` | — |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1069` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3094` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:4182` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:4254` | — |
| `npcjobs:unload` | — | `systems/traffic.js:1385` |
| `npcjobs:work` | — | `systems/traffic.js:1383` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:4349` | — |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:4370` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:1689`, `systems/onboarding.js:2493` | — |
| `optic:beamContact` | `systems/combat.js:1168` | — |
| `optic:contact` | `systems/weapons.js:2060`, `systems/weapons.js:2121` | `audio/audioSystem.js:1873` |
| `optic:rekindled` | — | `audio/audioSystem.js:1874` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1079` | `systems/world.js:567` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1879` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1162` | — |
| `orrinWitness:submitted` | `systems/story.js:1190` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:5984` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:569` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:5780` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:5815` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:5944` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:5898` | `ui/recoveryEncounterPrompt.js:478` |
| `patrol:proximity` | `systems/encounterScripts.js:427` | `systems/economy.js:1040`, `systems/moralTrap.js:180` |
| `pds:intercept` | `systems/countermeasures.js:330` | `audio/audioSystem.js:1857` |
| `physics:impact` | `core/physics.js:1642` | `audio/audioSystem.js:1868`, `render/asteroidMotionPresentation.js:446`, `render/feel.js:1326`, `render/shipMicroMotion.js:1286`, `render/vfx.js:2399`, `systems/asteroidSites.js:290`, `systems/barkDirector.js:341`, `systems/collisionConsequences.js:72`, `systems/fields.js:440`, `systems/fragileCargo.js:281`, `systems/gamepad.js:564`, `systems/heistFacilities.js:248`, `systems/impulseCharges.js:232`, `systems/lootShards.js:544`, `systems/masslineImpactDamage.js:43`, `systems/ships.js:1520`, `systems/survivalResults.js:485`, `systems/swarmArena.js:447` |
| `pickup:collected` | `core/physics.js:1481`, `systems/mining.js:1319`, `systems/mining.js:2220`, `systems/uniqueWrecks.js:1515` | `audio/audioSystem.js:1922`, `render/vfx.js:2474`, `save/saveSystem.js:235`, `systems/economy.js:1010`, `systems/encounterDirector.js:278`, `systems/lawSecurity.js:272`, `systems/mining.js:201`, `systems/onboarding.js:359`, `systems/onboarding.js:416`, `systems/presentationOrchestrator.js:209`, `systems/swarmEvents.js:92`, `systems/swarmSupply.js:107`, `systems/traffic.js:1394`, `systems/world.js:570`, `systems/world.js:571`, `systems/world.js:633`, `ui/floatingText.js:238` |
| `pirateDisengage:triggered` | — | `systems/combatOutcome.js:187` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:132` | `systems/pirateParley.js:95` |
| `pirateParley:demand` | `systems/scanner.js:1298` | `ui/pirateParleyPrompt.js:160` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:186`, `ui/pirateParleyPrompt.js:161` |
| `pirateParley:started` | — | `systems/combatOutcome.js:185` |
| `planet:collector` | `systems/planetRuntime.js:507` | — |
| `planet:harvest` | `systems/planetRuntime.js:540` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:544` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:407`, `systems/planetRuntime.js:419` | — |
| `planet:recoveryBurn` | `systems/planetRuntime.js:485` | — |
| `planet:registered` | `systems/planetRuntime.js:195` | — |
| `planet:unregistered` | `systems/planetRuntime.js:256` | — |
| `player:death` | `systems/combat.js:656`, `systems/combat.js:787`, `systems/combat.js:967`, `systems/world.js:5348` | `audio/audioSystem.js:1910`, `render/feel.js:1234`, `render/shipMicroMotion.js:1297`, `render/vfx.js:2442`, `save/saveSystem.js:242`, `systems/aftermathWrecks.js:930`, `systems/lawSecurity.js:271`, `systems/missions.js:1312`, `systems/onboarding.js:390`, `systems/onboarding.js:415`, `systems/surrenderRecovery.js:75`, `systems/survivalResults.js:493`, `systems/survivalRun.js:124`, `systems/survivorPod.js:451`, `ui/commandBar.js:405`, `ui/hud.js:2452`, `ui/survivalHud.js:225` |
| `player:recoveryFailed` | `systems/combat.js:840` | `ui/screens/gameOver.js:513` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:424` | `systems/combat.js:535` |
| `player:respawn` | `systems/combat.js:904`, `systems/combat.js:980` | `audio/audioSystem.js:1911`, `render/shipMicroMotion.js:1296`, `save/saveSystem.js:243`, `save/saveSystem.js:293`, `ui/commandBar.js:409`, `ui/hud.js:2466`, `ui/screens/gameOver.js:505` |
| `player:scannedByPatrol` | `systems/economy.js:2935` | `render/vfx.js:2429`, `systems/missions.js:1302`, `ui/customsPrompt.js:149` |
| `poi:discovered` | `systems/world.js:876`, `systems/world.js:5114`, `systems/world.js:5186`, `systems/world.js:5502`, `systems/world.js:5528` | `audio/audioSystem.js:1953`, `systems/encounterDirector.js:296`, `systems/world.js:598` |
| `poi:identified` | `systems/world.js:5193`, `systems/world.js:5529` | `systems/encounterDirector.js:297`, `systems/missions.js:1185`, `systems/world.js:599` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2451` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2450` |
| `presentation:audioCue` | `render/vfx.js:5501`, `systems/presentationAdapters.js:557` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:473` | — |
| `presentation:caption` | `audio/audioSystem.js:4786`, `systems/factionPresence.js:773`, `systems/factionPresence.js:1112`, `systems/factionPresence.js:1127`, `systems/factionPresence.js:1145`, `systems/factionPresence.js:1207`, `systems/presentationAdapters.js:649`, `systems/story.js:1023`, `systems/story.js:1245` | `ui/hud.js:2515` |
| `presentation:cue` | `systems/cargo.js:645` | `audio/audioSystem.js:2025`, `render/vfx.js:2468`, `render/vfx.js:2469`, `render/vfx.js:2470`, `systems/presentationAdapters.js:201` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:455` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:376`, `systems/presentationAdapters.js:628` | — |
| `presentation:vfxCue` | `render/vfx.js:2487`, `systems/fields.js:2221`, `systems/fields.js:2240`, `systems/hullBurst.js:198`, `systems/hullBurst.js:335`, `systems/hullBurst.js:359`, `systems/hullBurst.js:548`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:526`, `systems/missions.js:3079`, `systems/missions.js:6791`, `systems/planetRuntime.js:564`, `systems/presentationAdapters.js:519`, `systems/tumbleStates.js:471`, `systems/tumbleStates.js:536`, `systems/weapons.js:1604`, `systems/weapons.js:1781`, `systems/weapons.js:2789` | `render/vfx.js:2473` |
| `projectile:bank` | — | `render/vfx.js:2393` |
| `projectile:hit` | `core/physics.js:828`, `core/physics.js:1002`, `systems/sectorSim.js:637` | `audio/audioSystem.js:1850`, `combat/tetherWebs.js:27`, `render/vfx.js:2392`, `systems/bombs.js:473`, `systems/combat.js:528`, `systems/missions.js:1267` |
| `projectile:nearMiss` | `core/physics.js:962` | `audio/audioSystem.js:1853`, `systems/presentationOrchestrator.js:174`, `ui/hud.js:2007` |
| `projectile:ricochet` | — | `render/vfx.js:2394` |
| `range:opened` | `ui/screens/range.js:1641` | `systems/onboarding.js:402` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:157` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:158` |
| `rescue:beat` | `systems/onboarding.js:1865`, `systems/onboarding.js:1897` | — |
| `rescue:complete` | `systems/onboarding.js:1876` | — |
| `rescue:started` | `systems/onboarding.js:1460` | `systems/onboarding.js:391` |
| `research:pointsChanged` | `systems/missions.js:4430`, `systems/missions.js:4482`, `systems/missions.js:6734`, `systems/missions.js:6742`, `systems/missions.js:8976` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2451` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1209` | `systems/encounterDirector.js:303` |
| `rhythm:phase` | `systems/encounterDirector.js:442` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:317` | — |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:115` |
| `run:awardRequested` | `systems/swarmEvents.js:275`, `ui/sandbox/sandboxSetup.js:1165` | `systems/runSession.js:64` |
| `run:awarded` | — | `ui/survivalHud.js:205` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1103`, `ui/sandbox/sandboxSetup.js:1145` | `systems/runSession.js:61` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:752`, `ui/screens/crucibleDraft.js:757`, `ui/screens/crucibleDraft.js:1040`, `ui/screens/crucibleDraft.js:1130`, `ui/screens/crucibleDraft.js:1256` | `systems/survivalDraft.js:112` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:865` | `systems/survivalDraft.js:116` |
| `run:draftResolved` | — | `systems/survivalRun.js:118` |
| `run:endRequested` | `save/saveSystem.js:206` | `systems/runSession.js:63` |
| `run:ended` | — | `systems/survivalAnnounce.js:311`, `systems/survivalArena.js:884`, `systems/survivalDraft.js:131`, `systems/survivalResults.js:522`, `systems/survivalRun.js:112`, `systems/survivalWave.js:131`, `systems/swarmArena.js:448`, `systems/swarmChain.js:108`, `systems/swarmEvents.js:91`, `systems/swarmSupply.js:109` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:121` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:309`, `ui/survivalHud.js:206` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1186` | `systems/ships.js:1552`, `systems/survivalRun.js:113`, `systems/swarmSupply.js:102`, `systems/world.js:594` |
| `run:modifierChosen` | — | `systems/survivalRun.js:119` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:66` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1187` | `systems/survivalRun.js:114` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1351`, `ui/screens/crucibleDraft.js:1368` | `systems/survivalDraft.js:113` |
| `run:refitClosed` | — | `systems/survivalRun.js:120` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:1709` | `systems/survivalDraft.js:114` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:1705` | `systems/survivalDraft.js:115` |
| `run:resultsReady` | — | `systems/achievements.js:867`, `ui/uiRoot.js:1281` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:120` |
| `run:spendRequested` | — | `systems/runSession.js:65` |
| `run:spent` | — | `systems/survivalDraft.js:119` |
| `run:started` | — | `sim/killcamTape.js:425`, `systems/survivalAnnounce.js:304`, `systems/survivalResults.js:480`, `systems/survivalRun.js:110`, `ui/survivalHud.js:207`, `ui/uiRoot.js:1293` |
| `run:threatRequested` | — | `systems/runSession.js:67` |
| `run:transitionRequested` | `systems/survivalRun.js:512` | `systems/runSession.js:62` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:310`, `systems/survivalDraft.js:111`, `systems/survivalResults.js:521`, `systems/survivalRun.js:111`, `systems/survivalWave.js:130`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:308`, `systems/survivalArena.js:883`, `systems/survivalResults.js:483`, `systems/swarmEvents.js:90` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:116` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:307` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:494` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:305`, `systems/survivalArena.js:850`, `systems/survivalWave.js:128`, `systems/swarmArena.js:444`, `ui/survivalHud.js:218` |
| `run:waveProgress` | — | `ui/survivalHud.js:219` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:306`, `systems/survivalResults.js:482`, `systems/survivalWave.js:129`, `systems/swarmArena.js:445`, `systems/swarmEvents.js:89` |
| `salvage:actionRead` | `systems/salvageActions.js:212` | — |
| `salvage:bayCashedIn` | `systems/cargo.js:674` | — |
| `salvage:changed` | `systems/cargo.js:356`, `systems/cargo.js:675` | — |
| `salvage:claimJumped` | `systems/mining.js:1786` | `systems/missions.js:1336` |
| `salvage:communicatorFound` | `systems/salvage.js:617` | `systems/encounterDirector.js:298`, `systems/story.js:209`, `ui/wreckChoicePrompt.js:44` |
| `salvage:completed` | `systems/mining.js:1660` | `render/vfx.js:2447`, `systems/aftermathWrecks.js:935`, `systems/lawSecurity.js:278`, `systems/missions.js:1225`, `systems/missions.js:1337` |
| `salvage:cookerFlight` | `systems/salvageActions.js:459` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:595` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:261` | — |
| `salvage:cutComplete` | `systems/mining.js:447` | `audio/audioSystem.js:1930`, `render/vfx.js:2446` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | `systems/salvage.js:91` |
| `salvage:npcExtraction` | `systems/traffic.js:6573` | — |
| `salvage:npcUnload` | `systems/traffic.js:10328` | `systems/economy.js:1014` |
| `salvage:placed` | `systems/salvage.js:351` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:443` |
| `salvage:reactorBurst` | `systems/salvageActions.js:702` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:317` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:227` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:127` |
| `save:backup` | `save/saveSystem.js:1197` | — |
| `save:completed` | `save/saveSystem.js:1203` | `ui/screens/saveLoad.js:836`, `ui/uiRoot.js:362` |
| `save:dirty` | — | `save/saveSystem.js:219` |
| `save:error` | `main.js:171`, `save/saveSystem.js:812`, `save/saveSystem.js:913`, `save/saveSystem.js:931`, `save/saveSystem.js:1207`, `save/saveSystem.js:1545`, `save/saveSystem.js:2007`, `save/saveSystem.js:2760`, `save/saveSystem.js:2768`, `save/saveSystem.js:2803`, `save/saveSystem.js:2813`, `save/saveSystem.js:2829`, `save/saveSystem.js:2896`, `save/saveSystem.js:2929`, `save/saveSystem.js:2966`, `save/saveSystem.js:3015`, `save/saveSystem.js:3279`, `save/saveSystem.js:3287`, `save/saveSystem.js:3314`, `save/saveSystem.js:3792`, `save/saveSystem.js:3805`, `save/saveSystem.js:3820`, `save/saveSystem.js:3833`, `ui/screens/saveLoad.js:1288` | `systems/aftermathWrecks.js:947`, `systems/asteroidSites.js:289`, `systems/automation.js:555`, `systems/encounterDirector.js:270`, `ui/loadingPresenter.js:188`, `ui/screenManager.js:602`, `ui/uiRoot.js:388` |
| `save:exportRecovery` | `save/saveSystem.js:3781` | `ui/toasts.js:463` |
| `save:loaded` | `save/saveSystem.js:3259` | `audio/audioSystem.js:2180`, `audio/bombAudio.js:362`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:228`, `core/physics.js:131`, `main.js:228`, `render/feel.js:1149`, `render/shipMicroMotion.js:1281`, `render/vfx.js:2436`, `save/saveSystem.js:255`, `save/saveSystem.js:271`, `systems/aftermathWrecks.js:946`, `systems/aiEncounter.js:132`, `systems/asteroidFormations.js:124`, `systems/asteroidSites.js:280`, `systems/autoTargetAssist.js:129`, `systems/automation.js:550`, `systems/barkDirector.js:320`, `systems/beacons.js:45`, `systems/bombs.js:472`, `systems/collisionConsequences.js:77`, `systems/combat.js:542`, `systems/combatOutcome.js:162`, `systems/countermeasures.js:139`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:84`, `systems/economy.js:1051`, `systems/encounterDirector.js:269`, `systems/environmentalMachinery.js:158`, `systems/factionPresence.js:441`, `systems/fields.js:428`, `systems/flight.js:75`, `systems/flightV3.js:149`, `systems/gateControlDirector.js:71`, `systems/heat.js:304`, `systems/heistFacilities.js:252`, `systems/impulseCharges.js:240`, `systems/lawSecurity.js:268`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:131`, `systems/mines.js:78`, `systems/mining.js:218`, `systems/missions.js:1168`, `systems/npcJobsRuntime.js:898`, `systems/npcJobsRuntime.js:906`, `systems/npcJobsRuntime.js:952`, `systems/onboarding.js:338`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:208`, `systems/presentationOrchestrator.js:278`, `systems/routeFollower.js:375`, `systems/runSession.js:72`, `systems/salvageActions.js:131`, `systems/sectorSim.js:115`, `systems/ships.js:1457`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:96`, `systems/story.js:136`, `systems/survivalArena.js:898`, `systems/survivorPod.js:449`, `systems/tetherGameplay.js:243`, `systems/titles.js:399`, `systems/traffic.js:1409`, `systems/travelLanes.js:483`, `systems/tumbleStates.js:120`, `systems/uniqueLootAbilities.js:136`, `systems/world.js:579`, `ui/alerts.js:352`, `ui/automationPayoff.js:76`, `ui/bandHud.js:91`, `ui/capitalBossOverlayMount.js:93`, `ui/cargoConscience.js:146`, `ui/hudLayout.js:120`, `ui/moralTrapPrompt.js:43`, `ui/priceHistory.js:147`, `ui/uiRoot.js:369`, `ui/uiRoot.js:1297`, `ui/wreckChoicePrompt.js:51` |
| `save:recovered` | `save/saveSystem.js:2792` | `ui/uiRoot.js:381` |
| `save:restoring` | `save/saveSystem.js:3037` | `core/coreSystem.js:225`, `render/feel.js:1148`, `render/vfx.js:2435`, `systems/aftermathWrecks.js:945`, `systems/asteroidSites.js:272`, `systems/autoTargetAssist.js:126`, `systems/automation.js:544`, `systems/cloak.js:73`, `systems/encounterDirector.js:262`, `systems/environmentalMachinery.js:157`, `systems/lawSecurity.js:267`, `systems/missions.js:1172`, `systems/npcJobsRuntime.js:899`, `systems/runSession.js:71`, `systems/salvage.js:84`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:76`, `systems/traffic.js:1402`, `systems/world.js:572` |
| `save:started` | `save/saveSystem.js:916`, `save/saveSystem.js:1599` | `ui/screenManager.js:609`, `ui/uiRoot.js:358` |
| `scan:completed` | `balance/careerCohorts.js:497`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:1023`, `systems/world.js:5118` | `careers/origins/prospectorOrigin.js:633`, `systems/asteroidFormations.js:130`, `systems/missions.js:1238`, `systems/onboarding.js:371`, `systems/presentationOrchestrator.js:190`, `systems/salvage.js:81`, `systems/salvageActions.js:126`, `systems/story.js:198`, `systems/story.js:199`, `systems/world.js:625`, `ui/hud.js:4343` |
| `scan:debrisCache` | `systems/mining.js:1702`, `systems/scanReveal.js:184` | — |
| `scan:pulse` | `systems/scanner.js:950` | `render/shipMicroMotion.js:1306`, `systems/buildIdentity.js:277`, `systems/cloak.js:90`, `systems/encounterDirector.js:287`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:189`, `systems/scanReveal.js:34`, `ui/hud.js:4344` |
| `scan:shipRevealed` | `systems/scanReveal.js:57` | `systems/buildIdentity.js:276` |
| `scan:weakPoint` | `systems/scanner.js:1012` | `ui/hud.js:1553` |
| `scan:wreckInvestigated` | `systems/scanReveal.js:89` | — |
| `scan:wreckResolved` | `systems/scanner.js:972` | `systems/lawSecurity.js:277` |
| `scan:wreckRevealed` | `systems/scanReveal.js:85` | — |
| `scanner:ghostEscaped` | `systems/scanner.js:896` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:991` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:94` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:275` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:516`, `ui/comms.js:520` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:975` | `systems/presentationOrchestrator.js:187` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:988` | `audio/audioSystem.js:1998`, `audio/bombAudio.js:359`, `render/shipMicroMotion.js:1280`, `render/vfx.js:2431`, `save/saveSystem.js:276`, `systems/aftermathWrecks.js:933`, `systems/aiEncounter.js:133`, `systems/asteroidFormations.js:123`, `systems/asteroidSites.js:256`, `systems/automation.js:580`, `systems/bombs.js:464`, `systems/claims.js:322`, `systems/claims.js:324`, `systems/combatOutcome.js:177`, `systems/difficultyDirector.js:170`, `systems/dockingCorridor.js:82`, `systems/economy.js:1033`, `systems/encounterDirector.js:258`, `systems/factionPresence.js:432`, `systems/fields.js:426`, `systems/heistFacilities.js:245`, `systems/intervention.js:71`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:128`, `systems/mines.js:76`, `systems/mining.js:217`, `systems/missions.js:1329`, `systems/moralTrap.js:178`, `systems/npcJobsRuntime.js:887`, `systems/onboarding.js:466`, `systems/presentationOrchestrator.js:228`, `systems/routeFollower.js:367`, `systems/salvage.js:77`, `systems/salvageActions.js:134`, `systems/sectorSim.js:112`, `systems/story.js:160`, `systems/story.js:197`, `systems/survivalArena.js:896`, `systems/survivorPod.js:444`, `systems/tetherGameplay.js:247`, `systems/traffic.js:1372`, `systems/wingmen.js:96`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:150`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:918` | `audio/bombAudio.js:358`, `render/vfx.js:2432`, `systems/aftermathWrecks.js:934`, `systems/asteroidSites.js:262`, `systems/automation.js:569`, `systems/bombs.js:463`, `systems/dockingCorridor.js:81`, `systems/encounterDirector.js:260`, `systems/environmentalMachinery.js:155`, `systems/factionPresence.js:433`, `systems/fields.js:425`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:246`, `systems/impulseCharges.js:241`, `systems/lawSecurity.js:266`, `systems/massSeed.js:118`, `systems/masslineSnares.js:127`, `systems/mines.js:75`, `systems/mining.js:206`, `systems/missions.js:1330`, `systems/npcJobsRuntime.js:886`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:111`, `systems/spawnBudget.js:50`, `systems/stationServices.js:207`, `systems/stationSideEventDirector.js:95`, `systems/surrenderRecovery.js:74`, `systems/survivalArena.js:897`, `systems/tetherGameplay.js:246`, `systems/traffic.js:1375`, `systems/wingmen.js:99`, `ui/customsPrompt.js:151`, `ui/impoundPayPrompt.js:34`, `ui/promptDeck.js:707`, `ui/wreckChoicePrompt.js:49` |
| `sectorsim:embodiment` | `systems/sectorSim.js:894` | `systems/world.js:609` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:341` | `ui/screens/starmap.js:823` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1719`, `systems/claims.js:1495`, `systems/encounterDirector.js:1862`, `systems/mining.js:2374` | `systems/sectorSim.js:120`, `systems/world.js:624` |
| `sectorsim:intel` | `systems/sectorSim.js:948` | `systems/world.js:614` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:732` | `systems/economy.js:1055` |
| `sectorsim:reconcile` | `systems/sectorSim.js:685` | `systems/world.js:615` |
| `sectorsim:tick` | `systems/sectorSim.js:286` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:648` | `ui/screens/starmap.js:824` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:543` | `systems/scanner.js:851` |
| `service:aborted` | `systems/stationServices.js:256` | — |
| `service:completed` | `systems/economy.js:2682`, `systems/economy.js:2714`, `systems/economy.js:2760`, `systems/stationServices.js:475`, `systems/stationServices.js:491` | `systems/ships.js:1524` |
| `service:progress` | `systems/stationServices.js:417` | — |
| `service:queued` | `systems/stationServices.js:324` | — |
| `service:started` | `systems/stationServices.js:406` | — |
| `settings:changed` | `save/saveSystem.js:3295`, `save/saveSystem.js:3296`, `systems/touch.js:627`, `ui/screens/motionAsk.js:95`, `ui/screens/pause.js:591`, `ui/screens/pause.js:599`, `ui/screens/pause.js:677`, `ui/screens/settings.js:366`, `ui/screens/settings.js:742`, `ui/screens/settings.js:818` | `audio/audioSystem.js:2120`, `main.js:227`, `render/vfx.js:2438`, `save/saveSystem.js:213`, `ui/uiRoot.js:678` |
| `ship:appearanceChanged` | `systems/ships.js:1801`, `systems/ships.js:2055`, `systems/traffic.js:3220` | `core/coreSystem.js:224`, `render/vfx.js:2426` |
| `ship:appearanceSaved` | `systems/ships.js:2057` | `ui/station/screens/shipworks.js:667` |
| `ship:boostPreKick` | `systems/flightV3.js:406` | `render/feel.js:1261` |
| `ship:boostStart` | `systems/flight.js:106`, `systems/flightV3.js:200` | `audio/audioSystem.js:2005`, `render/vfx.js:2454`, `systems/cruise.js:58`, `systems/onboarding.js:403` |
| `ship:boostStop` | `systems/flight.js:107`, `systems/flight.js:220`, `systems/flightV3.js:201`, `systems/flightV3.js:503` | `audio/audioSystem.js:2010`, `render/vfx.js:2455` |
| `ship:cargoCapChanged` | `systems/ships.js:1796` | — |
| `ship:dash` | `systems/flight.js:197`, `systems/flightV3.js:482` | `audio/audioSystem.js:2011`, `render/vfx.js:2456`, `systems/uniqueLootAbilities.js:134` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2249` | `render/vfx.js:2478` |
| `ship:deathPop` | `render/shipMicroMotion.js:984`, `render/shipMicroMotion.js:2239` | `render/vfx.js:2477` |
| `ship:livingHullChanged` | `systems/ships.js:1625`, `systems/ships.js:1677`, `systems/story.js:1769` | `systems/barkDirector.js:323` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2294` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2267` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2226` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2197` | — |
| `ship:massChanged` | `systems/ships.js:1952` | `ui/hud.js:3880` |
| `ship:purchased` | `systems/ships.js:1988` | `audio/audioSystem.js:1990`, `systems/missions.js:1347` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1033`, `render/shipMicroMotion.js:2226` | `render/vfx.js:2476` |
| `ship:roleContext` | `systems/ships.js:1735` | `systems/presentationAdapters.js:203` |
| `ship:sold` | `systems/ships.js:2009` | — |
| `ship:statsChanged` | `systems/ships.js:1795` | `systems/world.js:562`, `ui/commandBar.js:410`, `ui/hud.js:3876` |
| `ship:swingDash` | `systems/flightV3.js:483` | `render/shipMicroMotion.js:1300` |
| `ship:thrust` | `systems/flight.js:431`, `systems/flightV3.js:1525` | `render/vfx.js:2453` |
| `ships:grantModule` | — | `systems/ships.js:1450` |
| `signal:investigate` | — | `systems/scanner.js:840` |
| `signal:investigated` | `systems/scanner.js:1514` | `systems/missions.js:1252`, `systems/presentationOrchestrator.js:193`, `systems/story.js:138`, `systems/world.js:565`, `ui/signalInvestigationPrompt.js:176` |
| `signal:investigating` | `systems/scanner.js:1257` | `ui/signalInvestigationPrompt.js:175` |
| `signal:receipt` | `systems/scanner.js:1515` | — |
| `signal:scanResults` | `systems/scanner.js:1024` | `systems/missions.js:1239`, `systems/presentationOrchestrator.js:191`, `systems/story.js:200`, `ui/signalInvestigationPrompt.js:173` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:841` |
| `signal:track` | — | `systems/scanner.js:839` |
| `signal:tracked` | `systems/scanner.js:1274` | `systems/presentationOrchestrator.js:192`, `ui/signalInvestigationPrompt.js:174` |
| `sim:pause` | `ui/screenManager.js:426` | `audio/audioSystem.js:2136`, `audio/bombAudio.js:365`, `render/feel.js:1146` |
| `sim:resume` | `ui/screenManager.js:433` | `audio/audioSystem.js:2137` |
| `site:anchored` | `systems/asteroidSites.js:987` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1974` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1889` | `audio/audioSystem.js:2158` |
| `site:courierLost` | `systems/asteroidSites.js:1962` | — |
| `site:created` | `systems/asteroidSites.js:925` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1333`, `systems/asteroidSites.js:1417` | — |
| `site:lost` | `systems/asteroidSites.js:1530` | `ui/alerts.js:342` |
| `site:machineInstalled` | `systems/asteroidSites.js:956` | `audio/audioSystem.js:2157`, `ui/alerts.js:341` |
| `site:machineMode` | `systems/asteroidSites.js:1439` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1350` | — |
| `site:machineStatus` | `systems/asteroidSites.js:1830` | `audio/audioSystem.js:2162`, `ui/alerts.js:337` |
| `site:overlayChanged` | `systems/asteroidSites.js:1423` | — |
| `site:podBuilt` | `systems/asteroidSites.js:1778` | — |
| `site:producing` | `systems/asteroidSites.js:1217` | `ui/asteroid/asteroidScreen.js:1670` |
| `site:rematerialized` | `systems/asteroidSites.js:1578` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1135` | `ui/asteroid/asteroidScreen.js:1655` |
| `site:surveyComplete` | `systems/asteroidSites.js:1078` | `ui/asteroid/asteroidScreen.js:1649` |
| `site:surveyDetected` | `systems/asteroidSites.js:1068` | `ui/asteroid/asteroidScreen.js:1642` |
| `spawn:request` | `systems/automation.js:1500` | `systems/world.js:593` |
| `station:berthAssigned` | `systems/stationServices.js:386` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:228` | — |
| `station:exitRequest` | `ui/screenManager.js:566`, `ui/uiRoot.js:1189` | `ui/station/stationApp.js:1284` |
| `station:holding` | `systems/stationServices.js:390` | — |
| `station:moduleGained` | `systems/claims.js:1994` | `systems/factions.js:412` |
| `station:navigate` | `ui/screens/automationPanel.js:1502`, `ui/station/screens/bar.js:765`, `ui/station/screens/bar.js:770`, `ui/station/screens/industry.js:450` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:257` | `render/vfx.js:2452` |
| `station:throughput` | `systems/claims.js:1964` | — |
| `station:yardChanged` | `systems/stationServices.js:544` | — |
| `stationContact:changed` | `systems/stationContacts.js:309`, `systems/stationContacts.js:345`, `systems/stationContacts.js:427`, `systems/stationContacts.js:451` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:245`, `systems/stationContacts.js:468` | — |
| `stationContact:counterDelta` | `systems/missions.js:6599` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:333` | — |
| `story:beatAdvanced` | `systems/missions.js:9002` | `save/saveSystem.js:283`, `systems/story.js:131`, `ui/screens/codex.js:629` |
| `story:elroyResolved` | `systems/missions.js:4892` | `systems/story.js:132` |
| `story:kurtzLedger` | `systems/story.js:1526`, `systems/story.js:1537` | — |
| `story:newGamePlusStarted` | `systems/story.js:1690` | `systems/titles.js:403`, `ui/hudMeta.js:104` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1688` | — |
| `story:postEndingContinuity` | `systems/story.js:1426` | `ui/screens/missionLog.js:2448` |
| `story:postEndingProgress` | `systems/story.js:1396` | `ui/screens/missionLog.js:2447` |
| `story:replayHookUnlocked` | `systems/story.js:1411` | `ui/screens/missionLog.js:2449` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:327` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:326` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1224` | — |
| `story:vergeObserversRevealed` | `systems/story.js:1022` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1244` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:194` | — |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:179` | — |
| `stunt:salvageRights` | `systems/stuntGrammar.js:104` | — |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:126` | — |
| `stunt:styleBanked` | `systems/stuntGrammar.js:91` | `audio/audioSystem.js:1927`, `ui/stuntCallout.js:424` |
| `stunt:trickAmended` | — | `systems/bulletTime.js:143`, `systems/survivalResults.js:488`, `systems/titles.js:402`, `ui/stuntCallout.js:423` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:1926`, `systems/bulletTime.js:142`, `systems/survivalResults.js:487`, `systems/titles.js:401`, `ui/stuntCallout.js:422`, `ui/toasts.js:427` |
| `surrender:escaped` | — | `systems/combatOutcome.js:183` |
| `surrender:secured` | — | `systems/traffic.js:1391` |
| `surrender:tethered` | — | `systems/traffic.js:1390` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1091` | — |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:132` | `systems/survivorPod.js:446` |
| `survivorPod:delivered` | `systems/traffic.js:5909` | — |
| `survivorPod:ejected` | `systems/survivorPod.js:649`, `systems/survivorPod.js:780` | `systems/lawSecurity.js:265` |
| `survivorPod:promoted` | `systems/survivorPod.js:1083` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1190` | `ui/wreckChoicePrompt.js:48` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1202` | `systems/missions.js:1307`, `ui/wreckChoicePrompt.js:46` |
| `survivorPod:rescued` | — | `systems/traffic.js:1396` |
| `survivorPod:resolved` | `systems/survivorPod.js:960` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1241` | `systems/missions.js:1309`, `ui/wreckChoicePrompt.js:47` |
| `swarm:chain` | — | `systems/survivalResults.js:497`, `ui/survivalHud.js:220` |
| `swarm:chainBest` | — | `systems/survivalResults.js:510` |
| `swarm:chainBroken` | — | `ui/survivalHud.js:221` |
| `swarm:event` | `systems/swarmEvents.js:289` | — |
| `swarm:eventTelegraphed` | `systems/swarmEvents.js:137` | — |
| `swarm:pressureSpend` | — | `systems/survivalResults.js:486` |
| `tech:researched` | `systems/ships.js:1838` | `audio/audioSystem.js:1989`, `systems/onboarding.js:504`, `systems/ships.js:1454` |
| `tether:attached` | `combat/attachments.js:369` | `audio/audioSystem.js:2049`, `render/vfx.js:2386`, `systems/encounterDirector.js:292`, `systems/presentationOrchestrator.js:95`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:363`, `systems/tetherGameplay.js:1165` | `audio/audioSystem.js:2068`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1308`, `systems/onboarding.js:369`, `systems/onboarding.js:385`, `systems/surrenderRecovery.js:71` |
| `tether:broken` | `combat/attachments.js:487` | `audio/audioSystem.js:2040`, `render/feel.js:1299`, `render/vfx.js:2389`, `systems/presentationOrchestrator.js:103`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:248` |
| `tether:cut` | `systems/tetherGameplay.js:1769` | `audio/audioSystem.js:2072`, `systems/masslineThrow.js:108`, `systems/onboarding.js:384`, `systems/onboarding.js:412` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1753` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:549`, `systems/tetherGameplay.js:293`, `systems/tetherGameplay.js:456`, `systems/tetherGameplay.js:499`, `systems/tetherGameplay.js:504`, `systems/tetherGameplay.js:514`, `systems/tetherGameplay.js:531`, `systems/tetherGameplay.js:878` | `systems/onboarding.js:540`, `testing/lab/proofSixtySeconds.js:1530`, `ui/masslineHud.js:848` |
| `tether:latched` | `systems/tetherGameplay.js:551` | `audio/audioSystem.js:2064`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:443`, `systems/flightV3.js:157`, `systems/lawSecurity.js:273`, `systems/missions.js:1263`, `systems/missions.js:1289`, `systems/missions.js:1338`, `systems/onboarding.js:364`, `systems/onboarding.js:381`, `systems/onboarding.js:401`, `systems/onboarding.js:410`, `systems/onboarding.js:552`, `systems/onboarding.js:555`, `systems/onboarding.js:567`, `systems/surrenderRecovery.js:68`, `systems/survivorPod.js:452`, `testing/lab/proofSixtySeconds.js:1531`, `ui/masslineHud.js:862`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1444` | — |
| `tether:nearBreak` | `combat/attachments.js:840` | `audio/audioSystem.js:2061`, `systems/onboarding.js:370`, `systems/presentationOrchestrator.js:96` |
| `tether:rebound` | `combat/attachments.js:772` | `audio/audioSystem.js:2083` |
| `tether:reel` | `combat/attachments.js:421` | `audio/audioSystem.js:2038`, `systems/missions.js:1259`, `systems/onboarding.js:367`, `systems/onboarding.js:382`, `systems/surrenderRecovery.js:69` |
| `tether:reelPump` | `systems/masslineTelemetry.js:251` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:364`, `systems/tetherGameplay.js:1163`, `systems/tetherGameplay.js:1166`, `systems/tetherGameplay.js:1771` | `audio/audioSystem.js:2039`, `render/feel.js:1352`, `render/vfx.js:2388`, `systems/missions.js:1264`, `systems/presentationOrchestrator.js:162`, `ui/masslineHud.js:870` |
| `tether:released` | `systems/tetherGameplay.js:1160`, `systems/tetherGameplay.js:1770` | `render/shipMicroMotion.js:1307`, `render/vfx.js:2387`, `systems/barkDirector.js:339`, `systems/onboarding.js:368`, `systems/onboarding.js:383`, `systems/onboarding.js:411`, `systems/surrenderRecovery.js:70`, `systems/world.js:629` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2134` | — |
| `tether:snagged` | `systems/tetherGameplay.js:2005` | `audio/audioSystem.js:2076` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:329` | — |
| `tether:strain` | `systems/tetherGameplay.js:1498` | `audio/audioSystem.js:2054` |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1377`, `systems/collisionConsequences.js:73`, `systems/combat.js:529`, `systems/masslineImpactDamage.js:41`, `systems/missions.js:1265`, `systems/onboarding.js:386`, `systems/onboarding.js:413`, `systems/onboarding.js:588`, `systems/presentationOrchestrator.js:138`, `systems/tumbleStates.js:108` |
| `tether:whipSnap` | `systems/tetherGameplay.js:1805` | — |
| `title:holdResolved` | — | `systems/titles.js:395` |
| `touch:uiAction` | `systems/touch.js:575` | `ui/input.js:754` |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:1920` |
| `traffic:oreCollected` | `systems/traffic.js:5706` | — |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:3681` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:10476` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:9087` | — |
| `traffic:spillNoticed` | `systems/traffic.js:6271` | — |
| `tutorial:finished` | `systems/onboarding.js:1140` | `systems/achievements.js:871`, `systems/missions.js:1167`, `systems/presentationAdapters.js:206`, `systems/story.js:147` |
| `tutorial:say` | `systems/onboarding.js:831` | `audio/audioSystem.js:2094`, `systems/story.js:153` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2315` | `systems/missions.js:1176` |
| `ui:acceptMission` | `ui/adventureDecisions.js:396`, `ui/station/screens/bar.js:702`, `ui/station/screens/contracts.js:1348` | `systems/missions.js:1175` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:4286` | `systems/ships.js:1491` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:976` |
| `ui:buyModule` | `ui/station/screens/shipworks.js:4820` | `systems/onboarding.js:499`, `systems/ships.js:1484` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:4702` | `systems/bombs.js:474` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:4472` | `systems/ships.js:1482` |
| `ui:cancel` | `ui/input.js:1001`, `ui/input.js:1015` | — |
| `ui:clearTarget` | `ui/input.js:396` | `ui/uiRoot.js:1053` |
| `ui:closeAll` | `main.js:862`, `ui/screens/crucible.js:2928`, `ui/screens/crucible.js:2941` | `ui/uiRoot.js:1051` |
| `ui:closeCargo` | `ui/input.js:245`, `ui/input.js:358` | `ui/hud.js:3850` |
| `ui:closeComms` | `ui/input.js:353` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1045` |
| `ui:confirm` | `ui/input.js:1009` | `audio/audioSystem.js:2174` |
| `ui:cycleComponent` | `ui/targetPanel.js:565`, `ui/targetPanel.js:569` | `ui/uiRoot.js:1057` |
| `ui:cycleTarget` | `ui/input.js:392`, `ui/input.js:1079` | `ui/uiRoot.js:1052` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:4332` | `systems/ships.js:1492` |
| `ui:endgameChoose` | `systems/missions.js:2990`, `ui/station/barContacts.js:822` | `systems/story.js:166` |
| `ui:endgameConfirm` | — | `systems/story.js:167` |
| `ui:endgameDecline` | `ui/comms.js:447` | `systems/story.js:168` |
| `ui:endgameDepartAshfall` | `ui/comms.js:464` | `systems/story.js:177` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2165` | `systems/story.js:174` |
| `ui:endgameStayAshfall` | `ui/comms.js:465` | `systems/story.js:178` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2169` | `systems/story.js:175` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:176` |
| `ui:endingArchiveOpen` | — | `systems/story.js:170` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | `systems/routeFollower.js:351` |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:71` | `systems/factionPresence.js:439` |
| `ui:fitModule` | `ui/station/screens/shipworks.js:4831` | `systems/onboarding.js:496`, `systems/ships.js:1485` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:4712` | `systems/bombs.js:475` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1549` | `systems/automation.js:536`, `systems/wingmen.js:107` |
| `ui:globalFind` | `ui/input.js:283`, `ui/input.js:345` | `ui/globalFind.js:183` |
| `ui:heliosBay7Scan` | — | `systems/story.js:203` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:68` | `systems/story.js:202` |
| `ui:navigate` | `ui/input.js:989`, `ui/input.js:993`, `ui/input.js:1057` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2616`, `ui/screens/achievements.js:208`, `ui/screens/automationPanel.js:860`, `ui/screens/clips.js:348`, `ui/screens/credits.js:177`, `ui/screens/crucible.js:1734`, `ui/screens/crucibleDraft.js:1350`, `ui/screens/demoEnd.js:194`, `ui/screens/replay.js:289`, `ui/screens/starmap.js:639`, `ui/screens/techTree.js:274` | `ui/uiRoot.js:1041` |
| `ui:prepareBombRack` | `ui/station/screens/shipworks.js:4391` | `systems/bombs.js:485` |
| `ui:previewBombRackPreparation` | `ui/station/screens/shipworks.js:3401`, `ui/station/screens/shipworks.js:4347` | `systems/bombs.js:482` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:686` | `systems/world.js:596` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:756` | `systems/world.js:595` |
| `ui:pushScreen` | `main.js:407`, `systems/onboarding.js:673`, `systems/story.js:1204`, `ui/mapAuthority.js:133`, `ui/screens/base.js:1264`, `ui/screens/crucible.js:2942`, `ui/screens/crucibleDraft.js:761`, `ui/screens/gameOver.js:435`, `ui/screens/starmap.js:647`, `ui/signalInvestigationPrompt.js:169`, `ui/station/barContacts.js:549`, `ui/station/screens/bar.js:719`, `ui/station/stationApp.js:512` | `ui/uiRoot.js:1018` |
| `ui:replaceScreen` | `ui/screens/crucible.js:2896`, `ui/screens/crucible.js:2919`, `ui/screens/demoEnd.js:223`, `ui/screens/motionAsk.js:105` | `ui/uiRoot.js:1050` |
| `ui:restockBombRack` | — | `systems/bombs.js:478` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:4258` | `systems/ships.js:1490` |
| `ui:screenTop` | `ui/screenManager.js:274` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:977` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:4722` | `systems/bombs.js:477` |
| `ui:service` | `balance/careerCohorts.js:726`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:427`, `ui/station/stationApp.js:901`, `ui/station/stationApp.js:937` | `systems/economy.js:1036` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:4477`, `ui/station/screens/shipworks.js:4579` | `systems/ships.js:1483` |
| `ui:setCourse` | `systems/factionPresence.js:1138`, `systems/missions.js:3500`, `systems/scanner.js:1273`, `ui/galaxyMap.js:2269`, `ui/galaxyMap.js:2284`, `ui/galaxyMap.js:7252`, `ui/market/tradeLogic.js:486`, `ui/screens/footprint.js:1627`, `ui/screens/footprint.js:1638`, `ui/screens/localmap.js:995`, `ui/screens/starmap.js:1523`, `ui/screens/starmap.js:1536`, `ui/screens/starmap.js:1540` | `systems/world.js:558` |
| `ui:setShipAppearance` | `ui/station/screens/shipworks.js:4173` | `systems/ships.js:1494` |
| `ui:talkContact` | — | `systems/story.js:204` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:65`, `combat/autoTargetMode.js:246` | `ui/uiRoot.js:1058` |
| `ui:toggleCargo` | `ui/input.js:459` | `ui/hud.js:3849` |
| `ui:toggleComms` | `ui/input.js:476` | — |
| `ui:toggleOverview` | `ui/input.js:463` | `ui/hud.js:4353` |
| `ui:trackMission` | `ui/galaxyMap.js:4074`, `ui/screens/missionLog.js:2161`, `ui/screens/missionLog.js:2233`, `ui/screens/missionLog.js:2294`, `ui/station/screens/contracts.js:1388` | `systems/missions.js:1180` |
| `ui:undock` | — | `ui/input.js:753` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:4841` | `systems/ships.js:1486` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:4732` | `systems/bombs.js:476` |
| `ui:unlockTech` | `ui/screens/techTree.js:623` | `systems/ships.js:1493` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:4461` | `systems/bombs.js:479` |
| `ui:wingOrder` | `ui/wingmanRadial.js:182` | `systems/automation.js:537` |
| `ui:wingmanRadial` | `ui/input.js:469` | `ui/wingmanRadial.js:244` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:337` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:287` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:222` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1390` | `systems/missions.js:1322`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:choose` | `systems/missions.js:4636`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:791` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:812`, `systems/uniqueWrecks.js:963`, `systems/uniqueWrecks.js:1166` | `systems/missions.js:1323` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1456` | `systems/missions.js:1325`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1025` | `systems/missions.js:1324` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1055` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:554`, `systems/uniqueWrecks.js:965` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1632` | `systems/missions.js:1326`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `ui/station/screens/bar.js:736` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:662` | `systems/missions.js:1321` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1633` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1369` | `systems/world.js:601` |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1563` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1249`, `ui/bandHud.js:88` |
| `verb:used` | `systems/onboarding.js:2646` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:5744` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:568` |
| `vestaOreCache:clueRecovered` | `systems/world.js:5565` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:5596` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:5707` | — |
| `vestaOreCache:resolved` | `systems/world.js:5664` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:369`, `ui/voiceArbiter.js:413` | `ui/alerts.js:322` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:324` |
| `voice:say` | `systems/achievements.js:731`, `systems/survivalAnnounce.js:361`, `systems/world.js:682`, `systems/world.js:704`, `ui/alerts.js:221` | `ui/voiceArbiter.js:323` |
| `voice:surface` | `ui/voiceArbiter.js:374`, `ui/voiceArbiter.js:423` | `systems/barkDirector.js:324`, `ui/alerts.js:321` |
| `watch:changed` | `ui/entityLinks.js:237` | `ui/watchlistHud.js:69` |
| `weapons:inertialShunt` | `systems/weapons.js:366` | — |
| `weapons:mineArmed` | `systems/weapons.js:1645` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1602` | — |
| `weapons:mineDetonated` | `systems/weapons.js:1775` | — |
| `weapons:mineExpired` | `systems/weapons.js:1639` | `systems/presentationOrchestrator.js:267` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:346` | — |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1300` | — |
| `weapons:vent` | `systems/weapons.js:743`, `systems/weapons.js:763` | `audio/audioSystem.js:1968`, `render/shipMicroMotion.js:1284`, `render/vfx.js:2451`, `systems/ships.js:1538`, `ui/hud.js:3923` |
| `web:linked` | `combat/tetherWebs.js:95` | — |
| `well:capture` | `systems/fields.js:2106` | — |
| `well:fling` | `systems/fields.js:2031` | — |
| `well:grind` | `systems/fields.js:1787` | `systems/impulseCharges.js:233` |
| `wingMorale:broken` | `systems/wingMorale.js:261` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:346` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:373` | — |
| `wingOrder:accepted` | `systems/automation.js:1984` | `systems/wingmen.js:108` |
| `wingOrder:blocked` | `systems/automation.js:1985` | — |
| `wingOrder:converted` | `systems/wingmen.js:394` | — |
| `wingOrder:status` | `systems/automation.js:1986` | — |
| `world:abortJumpCharge` | `systems/story.js:795`, `ui/comms.js:456` | `systems/world.js:555` |
| `world:confirmUnfiledJump` | `systems/story.js:176` | `systems/world.js:554` |
| `world:criticalSpawnDeferred` | `systems/world.js:1728`, `systems/world.js:3491` | — |
| `world:farActorRestored` | `world/farActorTable.js:757` | `systems/npcJobsRuntime.js:889`, `systems/traffic.js:1379` |
| `world:farActorShelved` | `world/farActorTable.js:734` | `systems/npcJobsRuntime.js:888`, `systems/traffic.js:1378` |
| `world:membership` | `systems/world.js:981` | `systems/presentationOrchestrator.js:181` |
| `world:originShift` | `systems/world.js:4541` | — |
| `world:playerRelocated` | `systems/world.js:3637` | `core/coreSystem.js:236`, `render/vfx.js:2437` |
| `world:requestJump` | `systems/story.js:779`, `ui/galaxyMap.js:2263`, `ui/screens/starmap.js:1535` | `systems/world.js:552` |
| `world:requestRoute` | `ui/galaxyMap.js:2282`, `ui/galaxyMap.js:4091`, `ui/galaxyMap.js:7250`, `ui/screens/starmap.js:1522`, `ui/screens/starmap.js:1539` | `systems/world.js:556` |
| `world:requestSectorScan` | `ui/galaxyMap.js:5858` | `systems/world.js:557` |
| `world:requestUnfiledJump` | `systems/story.js:747` | `systems/world.js:553` |
| `world:residency` | `systems/world.js:1125`, `systems/world.js:1158`, `systems/world.js:1931` | — |
| `world:spawnLimited` | `systems/world.js:3427` | — |
| `world:zoneEntered` | `systems/world.js:4568` | `data/hazardLanguage.js:131` |
| `world:zoneExited` | `systems/world.js:4571` | `data/hazardLanguage.js:132` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:612` | `systems/presentationOrchestrator.js:281` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:566` | `systems/presentationOrchestrator.js:282`, `systems/traffic.js:1460` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2444` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1129` | — |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1172` | — |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:2191` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2372` | `systems/npcJobsRuntime.js:919` |
| `wreckField:source` | `systems/factionPresence.js:704`, `systems/salvage.js:370`, `systems/uniqueWrecks.js:1271` | `systems/aftermathWrecks.js:932` |
| `wreckMission:choiceApplied` | `systems/missions.js:4991` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:141` | `systems/missions.js:1305` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 3 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `alienEcology:blackBoxRecovered` — 1 subscriber(s)
- `alienEcology:nurseryBloom` — 1 subscriber(s)
- `alienEcology:nurseryPowered` — 1 subscriber(s)
- `alienEcology:relaySevered` — 1 subscriber(s)
- `barkDirector:voice` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `chronicler:radio` — 1 subscriber(s)
- `chronicler:recall` — 1 subscriber(s)
- `combat:bankShot` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 8 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `customs:weirBolt` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
- `heat:clear` — 1 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
- `law:custodyAcknowledged` — 1 subscriber(s)
- `law:custodyTransfer` — 1 subscriber(s)
- `law:dispatchStarted` — 1 subscriber(s)
- `law:impoundPayOffer` — 1 subscriber(s)
- `law:impoundPayRefused` — 1 subscriber(s)
- `law:impoundPosted` — 1 subscriber(s)
- `law:impoundRecovered` — 3 subscriber(s)
- `law:impoundReleased` — 1 subscriber(s)
- `law:impoundWorked` — 1 subscriber(s)
- `law:incidentOpened` — 1 subscriber(s)
- `law:killedAdjudicated` — 1 subscriber(s)
- `law:reportIncidentReceipt` — 3 subscriber(s)
- `law:wantedCheckpointBroken` — 1 subscriber(s)
- `law:wantedCheckpointPosted` — 1 subscriber(s)
- `law:wantedWarrantPosted` — 1 subscriber(s)
- `law:witnessChoice` — 1 subscriber(s)
- `lawfulInspection:offered` — 1 subscriber(s)
- `lawfulInspection:resolved` — 1 subscriber(s)
- `lawfulInspection:scanning` — 1 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `moment:holyShit` — 1 subscriber(s)
- `moralMemory:remember` — 1 subscriber(s)
- `namedAce:fled` — 1 subscriber(s)
- `nav:abortRoute` — 1 subscriber(s)
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
- `run:ended` — 10 subscriber(s)
- `run:levelUp` — 2 subscriber(s)
- `run:modifierChosen` — 1 subscriber(s)
- `run:modifierRecordRequested` — 1 subscriber(s)
- `run:refitClosed` — 1 subscriber(s)
- `run:resultsReady` — 2 subscriber(s)
- `run:spendRejected` — 1 subscriber(s)
- `run:spendRequested` — 1 subscriber(s)
- `run:spent` — 1 subscriber(s)
- `run:started` — 6 subscriber(s)
- `run:threatRequested` — 1 subscriber(s)
- `run:transitioned` — 6 subscriber(s)
- `run:waveCleared` — 4 subscriber(s)
- `run:waveIntroComplete` — 1 subscriber(s)
- `run:waveMaterialized` — 1 subscriber(s)
- `run:wavePlanFailed` — 1 subscriber(s)
- `run:wavePlanned` — 5 subscriber(s)
- `run:waveProgress` — 1 subscriber(s)
- `run:waveStarted` — 5 subscriber(s)
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
- `survivorPod:rescued` — 1 subscriber(s)
- `swarm:chain` — 2 subscriber(s)
- `swarm:chainBest` — 1 subscriber(s)
- `swarm:chainBroken` — 1 subscriber(s)
- `swarm:pressureSpend` — 1 subscriber(s)
- `title:holdResolved` — 1 subscriber(s)
- `traffic:ceresCausalChain` — 1 subscriber(s)
- `ui:buy` — 1 subscriber(s)
- `ui:closeScreen` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:endgameUnfiledJumpConfirm` — 1 subscriber(s)
- `ui:endingArchiveOpen` — 1 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:restockBombRack` — 1 subscriber(s)
- `ui:sell` — 1 subscriber(s)
- `ui:talkContact` — 1 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `voice:dismiss` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aftermath:causeExhausted` — 1 emitter(s)
- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:completed` — 1 emitter(s)
- `aftermathWreck:retired` — 1 emitter(s)
- `ai:egressExit` — 1 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `alienEcology:cystRupture` — 1 emitter(s)
- `alienEcology:vented` — 1 emitter(s)
- `anomaly:bearing` — 1 emitter(s)
- `automation:assetResumed` — 1 emitter(s)
- `automation:incomeCredited` — 3 emitter(s)
- `automation:traderCycleCompleted` — 1 emitter(s)
- `band:bearingReceipt` — 1 emitter(s)
- `band:bearingRequest` — 1 emitter(s)
- `band:bearingResolved` — 2 emitter(s)
- `band:bearingUnavailable` — 3 emitter(s)
- `band:cycle` — 2 emitter(s)
- `beam:denied` — 5 emitter(s)
- `beam:repaired` — 1 emitter(s)
- `beam:transferred` — 1 emitter(s)
- `bombs:armed` — 1 emitter(s)
- `bombs:commanded` — 1 emitter(s)
- `bombs:cycle` — 2 emitter(s)
- `bombs:denied` — 8 emitter(s)
- `bombs:primed` — 1 emitter(s)
- `bombs:rackChanged` — 1 emitter(s)
- `bombs:stockChanged` — 3 emitter(s)
- `boss:defeated` — 1 emitter(s)
- `buildIdentity:revealed` — 1 emitter(s)
- `camera:kill` — 2 emitter(s)
- `camera:shake` — 14 emitter(s)
- `camera:zoom` — 5 emitter(s)
- `capitalBoss:detach` — 1 emitter(s)
- `capitalBoss:start` — 1 emitter(s)
- `capitalBoss:telegraphEnd` — 2 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:hotDockSpill` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `cargo:volatileCorrosive` — 1 emitter(s)
- `cargo:volatileCryo` — 1 emitter(s)
- `cargo:volatileSlam` — 2 emitter(s)
- `chain:primeEnded` — 1 emitter(s)
- `chain:primed` — 1 emitter(s)
- `chain:tetherShare` — 1 emitter(s)
- `charge:armed` — 1 emitter(s)
- `charge:combo` — 2 emitter(s)
- `claim:defenseEncounterRequested` — 1 emitter(s)
- `claim:defenseResolved` — 1 emitter(s)
- `claim:defenseStarted` — 1 emitter(s)
- `claim:defenseWarning` — 1 emitter(s)
- `claim:depotPatrolRotation` — 1 emitter(s)
- `claim:depotSupport` — 2 emitter(s)
- `claim:freightDelivered` — 1 emitter(s)
- `claim:infrastructureConstructed` — 1 emitter(s)
- `claim:moduleBuilt` — 1 emitter(s)
- `claim:raidRepelled` — 1 emitter(s)
- `claim:raidWarning` — 1 emitter(s)
- `claim:receipt` — 1 emitter(s)
- `claim:specialized` — 1 emitter(s)
- `claim:teleportRequest` — 1 emitter(s)
- `claim:trophyHeadGranted` — 1 emitter(s)
- `claims:migrated` — 1 emitter(s)
- `cloak:burned` — 1 emitter(s)
- `cloak:faded` — 1 emitter(s)
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
- `contract:clauseHonored` — 2 emitter(s)
- `countermeasure:denied` — 1 emitter(s)
- `customs:breakScan` — 1 emitter(s)
- `danger:miningNoise` — 1 emitter(s)
- `detonator:detonated` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `distress:call` — 1 emitter(s)
- `dock:denied` — 1 emitter(s)
- `ecology:coherence` — 1 emitter(s)
- `ecology:relayPulse` — 1 emitter(s)
- `ecology:setpiece` — 1 emitter(s)
- `economy:debtEscalated` — 1 emitter(s)
- `economy:demandShift` — 1 emitter(s)
- `economy:salvageIntakeApplied` — 1 emitter(s)
- `economy:sinkCharged` — 1 emitter(s)
- `economy:tradeFailed` — 2 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:hostileCommitted` — 3 emitter(s)
- `encounter:namedCaptainDefeated` — 2 emitter(s)
- `encounter:patrolIntervened` — 1 emitter(s)
- `encounter:predationCleared` — 1 emitter(s)
- `encounter:predationEngaged` — 2 emitter(s)
- `encounter:predationTelegraph` — 1 emitter(s)
- `encounter:stale` — 1 emitter(s)
- `encounter:voice` — 1 emitter(s)
- `endgame:archive` — 1 emitter(s)
- `endgame:finaleCompleted` — 1 emitter(s)
- `endgame:finaleReady` — 1 emitter(s)
- `endgame:ineligible` — 3 emitter(s)
- `endgame:promptChoiceC` — 1 emitter(s)
- `endgame:promptChoiceD` — 1 emitter(s)
- `endgame:promptSandbox` — 1 emitter(s)
- `escalation:arrived` — 1 emitter(s)
- `escalation:seeded` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `factionPresence:administrativeRouting` — 1 emitter(s)
- `factionPresence:fulfillmentProvoked` — 1 emitter(s)
- `factionPresence:service` — 1 emitter(s)
- `factionPresence:serviceAction` — 1 emitter(s)
- `factionPresence:spawned` — 2 emitter(s)
- `field:opportunity` — 1 emitter(s)
- `field:richSeamMissed` — 3 emitter(s)
- `field:richSeamOpened` — 1 emitter(s)
- `field:richSeamWorked` — 2 emitter(s)
- `fields:anchorRegistered` — 1 emitter(s)
- `fields:cleared` — 1 emitter(s)
- `fields:deployDenied` — 1 emitter(s)
- `fields:ended` — 4 emitter(s)
- `fields:hitchCut` — 1 emitter(s)
- `fields:hitchLatched` — 1 emitter(s)
- `fields:specialistDisrupt` — 1 emitter(s)
- `firsthour:beat` — 1 emitter(s)
- `firsthour:complete` — 1 emitter(s)
- `firsthour:sentence` — 1 emitter(s)
- `firsthour:started` — 1 emitter(s)
- `firsthour:verb` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `flybyFocus:end` — 1 emitter(s)
- `formation:discovered` — 1 emitter(s)
- `freight:arrival` — 1 emitter(s)
- `freight:custodyChanged` — 1 emitter(s)
- `freight:custodyRebound` — 1 emitter(s)
- `freight:custodyReceipt` — 1 emitter(s)
- `freight:raiderEscaped` — 1 emitter(s)
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:blackMarketAccess` — 1 emitter(s)
- `frontierRumor:contacted` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `fuel:changed` — 5 emitter(s)
- `gamepad:connected` — 1 emitter(s)
- `gamepad:disconnected` — 1 emitter(s)
- `gate:verdict` — 1 emitter(s)
- `harasser:disengaged` — 1 emitter(s)
- `hazard:changed` — 1 emitter(s)
- `heist:capsuleResumed` — 1 emitter(s)
- `heist:launchCue` — 1 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `hull:fractured` — 1 emitter(s)
- `hullBurst:activated` — 1 emitter(s)
- `hullBurst:ended` — 1 emitter(s)
- `hullBurst:hit` — 3 emitter(s)
- `hullBurst:released` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `intervention:jumperRipped` — 1 emitter(s)
- `intervention:logged` — 1 emitter(s)
- `loot:magnetCaptured` — 1 emitter(s)
- `lossInvestigation:promoted` — 1 emitter(s)
- `massSeed:cleared` — 1 emitter(s)
- `massSeed:collapsed` — 4 emitter(s)
- `massSeed:collapsing` — 4 emitter(s)
- `massSeed:deployDenied` — 1 emitter(s)
- `massSeed:deployed` — 1 emitter(s)
- `massSeed:destroyed` — 1 emitter(s)
- `massSeed:locked` — 1 emitter(s)
- `massSeed:locking` — 1 emitter(s)
- `massSeed:tetherCut` — 1 emitter(s)
- `massSeed:warning` — 1 emitter(s)
- `massline:bridleCut` — 1 emitter(s)
- `massline:bridleEnded` — 3 emitter(s)
- `massline:bridleEndpointSelected` — 1 emitter(s)
- `massline:bridleLinked` — 1 emitter(s)
- `massline:bridleSetupEnded` — 1 emitter(s)
- `massline:cadenceChanged` — 1 emitter(s)
- `massline:npcCounterplay` — 1 emitter(s)
- `massline:npcLineCut` — 1 emitter(s)
- `massline:playerLineCut` — 1 emitter(s)
- `massline:recovered` — 1 emitter(s)
- `massline:recovering` — 1 emitter(s)
- `massline:releaseCancelled` — 1 emitter(s)
- `massline:releaseWindow` — 1 emitter(s)
- `massline:snareArmed` — 1 emitter(s)
- `massline:snareCaught` — 1 emitter(s)
- `massline:snareCut` — 1 emitter(s)
- `massline:snareDeployed` — 1 emitter(s)
- `massline:snareEnded` — 1 emitter(s)
- `mines:capReached` — 1 emitter(s)
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:podSplit` — 1 emitter(s)
- `mining:ventBonus` — 1 emitter(s)
- `mission:conditionBroken` — 2 emitter(s)
- `mission:conditionPending` — 1 emitter(s)
- `mission:conditionProgress` — 2 emitter(s)
- `mission:setPieceTransition` — 1 emitter(s)
- `mission:setPieceTravelLine` — 1 emitter(s)
- `mission:spawnDeferred` — 1 emitter(s)
- `module:granted` — 1 emitter(s)
- `module:purchased` — 1 emitter(s)
- `namedAce:appeared` — 1 emitter(s)
- `nav:waypoint` — 10 emitter(s)
- `nemesis:encounterRejected` — 1 emitter(s)
- `nemesis:encounterStarted` — 1 emitter(s)
- `nemesis:escaped` — 1 emitter(s)
- `nemesis:spare` — 1 emitter(s)
- `news:headline` — 6 emitter(s)
- `news:publish` — 13 emitter(s)
- `news:render` — 1 emitter(s)
- `npcjobs:crewResponse` — 1 emitter(s)
- `npcjobs:loadEmpty` — 1 emitter(s)
- `npcjobs:lotClaimed` — 1 emitter(s)
- `npcjobs:lotPosted` — 1 emitter(s)
- `npcjobs:lotReplaced` — 1 emitter(s)
- `npcjobs:minerRelocated` — 1 emitter(s)
- `npcjobs:resumed` — 1 emitter(s)
- `npcjobs:threatened` — 1 emitter(s)
- `npcjobs:yardDispatch` — 1 emitter(s)
- `npcjobs:yardDispatchDone` — 1 emitter(s)
- `onboarding:rangePrompt` — 2 emitter(s)
- `optic:beamContact` — 1 emitter(s)
- `orrinWitness:evidenceEnsured` — 1 emitter(s)
- `orrinWitness:evidenceRecovered` — 1 emitter(s)
- `orrinWitness:submitted` — 1 emitter(s)
- `pallasHiddenCache:cargoChanged` — 1 emitter(s)
- `pallasHiddenCache:clueRecovered` — 1 emitter(s)
- `pallasHiddenCache:pickupReady` — 1 emitter(s)
- `planet:collector` — 1 emitter(s)
- `planet:harvest` — 1 emitter(s)
- `planet:harvestDenied` — 1 emitter(s)
- `planet:plungeStage` — 2 emitter(s)
- `planet:recoveryBurn` — 1 emitter(s)
- `planet:registered` — 1 emitter(s)
- `planet:unregistered` — 1 emitter(s)
- `presentation:audioCue` — 2 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 2 emitter(s)
- `recovery:choose` — 1 emitter(s)
- `recovery:vent` — 1 emitter(s)
- `rescue:beat` — 2 emitter(s)
- `rescue:complete` — 1 emitter(s)
- `research:pointsChanged` — 5 emitter(s)
- `resonance:patrolQueued` — 1 emitter(s)
- `rhythm:phase` — 1 emitter(s)
- `rumor:ghostConvoy` — 1 emitter(s)
- `run:roleProblemStamped` — 1 emitter(s)
- `salvage:actionRead` — 1 emitter(s)
- `salvage:bayCashedIn` — 1 emitter(s)
- `salvage:changed` — 2 emitter(s)
- `salvage:cookerFlight` — 1 emitter(s)
- `salvage:coreDetonated` — 1 emitter(s)
- `salvage:coreEjected` — 1 emitter(s)
- `salvage:npcExtraction` — 1 emitter(s)
- `salvage:reactorBurst` — 1 emitter(s)
- `salvage:reactorTowedClear` — 1 emitter(s)
- `salvage:reactorVented` — 1 emitter(s)
- `save:backup` — 1 emitter(s)
- `scan:debrisCache` — 2 emitter(s)
- `scan:wreckInvestigated` — 1 emitter(s)
- `scan:wreckRevealed` — 1 emitter(s)
- `scanner:ghostEscaped` — 1 emitter(s)
- `scanner:ghostRevealed` — 1 emitter(s)
- `scenario:actorBindings` — 1 emitter(s)
- `scenario:dialogueLine` — 1 emitter(s)
- `scenario:factChanged` — 1 emitter(s)
- `scenario:factsInitialized` — 1 emitter(s)
- `scenario:loaded` — 1 emitter(s)
- `scenario:safeOpeningDemand` — 1 emitter(s)
- `sectorsim:tick` — 1 emitter(s)
- `service:aborted` — 1 emitter(s)
- `service:progress` — 1 emitter(s)
- `service:queued` — 1 emitter(s)
- `service:started` — 1 emitter(s)
- `ship:cargoCapChanged` — 1 emitter(s)
- `ship:loadoutPresetApplied` — 1 emitter(s)
- `ship:loadoutPresetApplyRejected` — 1 emitter(s)
- `ship:loadoutPresetDeleted` — 1 emitter(s)
- `ship:loadoutPresetSaved` — 1 emitter(s)
- `ship:sold` — 1 emitter(s)
- `signal:receipt` — 1 emitter(s)
- `site:anchored` — 1 emitter(s)
- `site:courierDelivered` — 1 emitter(s)
- `site:courierLost` — 1 emitter(s)
- `site:created` — 1 emitter(s)
- `site:laneSpilled` — 2 emitter(s)
- `site:machineMode` — 1 emitter(s)
- `site:machineRemoved` — 1 emitter(s)
- `site:overlayChanged` — 1 emitter(s)
- `site:podBuilt` — 1 emitter(s)
- `site:rematerialized` — 1 emitter(s)
- `station:berthAssigned` — 1 emitter(s)
- `station:broadcastTic` — 1 emitter(s)
- `station:holding` — 1 emitter(s)
- `station:navigate` — 4 emitter(s)
- `station:throughput` — 1 emitter(s)
- `station:yardChanged` — 1 emitter(s)
- `stationContact:changed` — 4 emitter(s)
- `stationContact:counterChanged` — 2 emitter(s)
- `stationContact:counterDelta` — 1 emitter(s)
- `stationLife:trafficChanged` — 1 emitter(s)
- `story:kurtzLedger` — 2 emitter(s)
- `story:playerChoiceRecorded` — 1 emitter(s)
- `story:vergeEvidenceRecorded` — 1 emitter(s)
- `story:vergeObserversRevealed` — 1 emitter(s)
- `story:vergeValeGatesRevoked` — 1 emitter(s)
- `stunt:bridge` — 1 emitter(s)
- `stunt:lineContractCompleted` — 1 emitter(s)
- `stunt:salvageRights` — 1 emitter(s)
- `stunt:salvageRightsClaimed` — 1 emitter(s)
- `survivalArena:rosterPrewarm` — 1 emitter(s)
- `survivorPod:delivered` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:resolved` — 1 emitter(s)
- `swarm:event` — 1 emitter(s)
- `swarm:eventTelegraphed` — 1 emitter(s)
- `tether:cutDenied` — 1 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:reelPump` — 1 emitter(s)
- `tether:snagCleared` — 1 emitter(s)
- `tether:snapCatch` — 1 emitter(s)
- `tether:whipSnap` — 1 emitter(s)
- `traffic:oreCollected` — 1 emitter(s)
- `traffic:passengerLinerReceipt` — 1 emitter(s)
- `traffic:passengerLinerSuspended` — 1 emitter(s)
- `traffic:richSeamHelpReserved` — 1 emitter(s)
- `traffic:spillNoticed` — 1 emitter(s)
- `ui:bulkHaulTag` — 1 emitter(s)
- `ui:bulkHaulTagCleared` — 1 emitter(s)
- `ui:cancel` — 2 emitter(s)
- `ui:closeComms` — 1 emitter(s)
- `ui:navigate` — 3 emitter(s)
- `ui:toggleComms` — 1 emitter(s)
- `uniqueLoot:choirBellPulse` — 1 emitter(s)
- `uniqueLoot:nestbreakerSplit` — 1 emitter(s)
- `uniqueLoot:paleCoilBlink` — 1 emitter(s)
- `uniqueWreck:choose` — 2 emitter(s)
- `uniqueWreck:complicationScheduled` — 1 emitter(s)
- `uniqueWreck:encounterCompleted` — 1 emitter(s)
- `uniqueWreck:encounterRequested` — 2 emitter(s)
- `uniqueWreck:rumorHeard` — 1 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:storyRewardGranted` — 1 emitter(s)
- `verb:used` — 1 emitter(s)
- `vestaOreCache:cargoChanged` — 1 emitter(s)
- `vestaOreCache:clueRecovered` — 1 emitter(s)
- `vestaOreCache:pickupReady` — 1 emitter(s)
- `weapons:inertialShunt` — 1 emitter(s)
- `weapons:mineArmed` — 1 emitter(s)
- `weapons:mineDeployed` — 1 emitter(s)
- `weapons:mineDetonated` — 1 emitter(s)
- `weapons:momentumSinkPlanted` — 1 emitter(s)
- `weapons:momentumSinkReleased` — 1 emitter(s)
- `web:linked` — 1 emitter(s)
- `well:capture` — 1 emitter(s)
- `well:fling` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `wingOrder:blocked` — 1 emitter(s)
- `wingOrder:converted` — 1 emitter(s)
- `wingOrder:status` — 1 emitter(s)
- `world:criticalSpawnDeferred` — 2 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:residency` — 3 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
- `wreckEcology:decayed` — 1 emitter(s)
- `wreckEcology:departed` — 1 emitter(s)
- `wreckEcology:scavenged` — 1 emitter(s)
- `wreckEcology:seeded` — 1 emitter(s)
- `wreckMission:choiceApplied` — 1 emitter(s)
