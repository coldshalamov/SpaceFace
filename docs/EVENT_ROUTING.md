# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-09-29 · 983 events · 3383 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:281`, `systems/encounterDirector.js:293`, `ui/discoveryPlate.js:140` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:1744` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:748` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:1726` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2004` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:780` | `systems/salvage.js:78` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1314` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:1813` | `systems/lawSecurity.js:261`, `systems/salvage.js:79` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:166` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:497` | `systems/presentationOrchestrator.js:167`, `systems/tetherGameplay.js:248` |
| `ai:egressExit` | `ai/egressExit.js:74` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:241` | — |
| `ai:flee` | `systems/ai.js:260`, `systems/traffic.js:5790`, `systems/wingMorale.js:303` | `render/vfx.js:2448`, `systems/barkDirector.js:361`, `systems/combatOutcome.js:156`, `systems/encounterDirector.js:305`, `systems/presentationOrchestrator.js:168` |
| `ai:formationBroken` | `systems/ai.js:436`, `systems/wingMorale.js:253` | `render/vfx.js:2449` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:363` |
| `ai:stateChange` | `systems/ai.js:257` | `systems/combatOutcome.js:182` |
| `ai:telegraph` | `systems/ai.js:332`, `systems/encounterScripts.js:167`, `systems/encounterScripts.js:1043`, `systems/masslineSnares.js:331`, `systems/mines.js:140`, `systems/tacticalAI.js:485` | `audio/audioSystem.js:1921`, `render/vfx.js:2447`, `systems/presentationOrchestrator.js:165`, `systems/survivalResults.js:453`, `ui/hud.js:2844`, `ui/survivalHud.js:224`, `ui/threatHalo.js:650` |
| `aiTrader:requestTrade` | `systems/traffic.js:7743` | `systems/economy.js:993` |
| `alienEcology:blackBoxRecovered` | — | `systems/world.js:621` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:667` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:987` | `systems/world.js:627` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:620` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:618` |
| `alienEcology:relaySevered` | — | `systems/world.js:619` |
| `alienEcology:vented` | `systems/alienEcology.js:1253` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | — |
| `anomaly:bearing` | `systems/scanner.js:1038` | — |
| `anomaly:triangulated` | `systems/scanner.js:1056` | `systems/world.js:564` |
| `asset:deployed` | `systems/automation.js:2043`, `systems/automation.js:2103`, `systems/automation.js:2192`, `systems/claims.js:491` | `systems/missions.js:1365`, `systems/onboarding.js:509`, `systems/story.js:183` |
| `asteroid:chunked` | `systems/mining.js:1988` | `render/asteroidMotionPresentation.js:452`, `render/vfx.js:2432`, `systems/presentationOrchestrator.js:203` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1001`, `systems/mining.js:870` | `audio/audioSystem.js:1876`, `render/vfx.js:2431`, `systems/fieldDepletion.js:703`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:417`, `render/shipMicroMotion.js:2215`, `render/vfx.js:2476`, `render/vfx.js:5475`, `render/vfx.js:9845`, `render/vfx.js:10894`, `systems/ai.js:711`, `systems/alienEcology.js:346`, `systems/barkDirector.js:1022`, `systems/beacons.js:60`, `systems/beacons.js:65`, `systems/beacons.js:97`, `systems/bombs.js:604`, `systems/bombs.js:724`, `systems/bombs.js:916`, `systems/bulletTime.js:185`, `systems/bulletTime.js:201`, `systems/bulletTime.js:280`, `systems/cargo.js:558`, `systems/claims.js:338`, `systems/claims.js:423`, `systems/claims.js:468`, `systems/claims.js:1273`, `systems/claims.js:1884`, `systems/cloak.js:194`, `systems/cloak.js:207`, `systems/countermeasures.js:393`, `systems/countermeasures.js:423`, `systems/crafting.js:268`, `systems/crafting.js:278`, `systems/fields.js:760`, `systems/fields.js:1048`, `systems/fields.js:1179`, `systems/fields.js:1452`, `systems/flybyFocus.js:517`, `systems/hullBurst.js:166`, `systems/hullBurst.js:278`, `systems/hullFracture.js:308`, `systems/impulseCharges.js:506`, `systems/impulseCharges.js:589`, `systems/impulseCharges.js:810`, `systems/impulseCharges.js:1001`, `systems/impulseCharges.js:1114`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:225`, `systems/masslineThrow.js:519`, `systems/masslineThrow.js:604`, `systems/mining.js:635`, `systems/mining.js:2076`, `systems/planetRuntime.js:508`, `systems/precursorMachines.js:340`, `systems/precursorMachines.js:417`, `systems/presentationAdapters.js:558`, `systems/presentationOrchestrator.js:495`, `systems/salvage.js:608`, `systems/tumbleStates.js:459`, `systems/tumbleStates.js:517`, `systems/weapons.js:1786`, `ui/commsRadial.js:773`, `ui/commsRadial.js:828`, `ui/commsRadial.js:1026`, `ui/commsRadial.js:1057`, `ui/hud.js:2187`, `ui/hud.js:3713`, `ui/hud.js:3948`, `ui/hud.js:4008`, `ui/hud.js:4050`, `ui/hud.js:4069`, `ui/hud.js:4167`, `ui/hud.js:4304`, `ui/hud.js:4603`, `ui/input.js:181`, `ui/input.js:210`, `ui/input.js:270`, `ui/input.js:308`, `ui/input.js:314`, `ui/input.js:365`, `ui/input.js:424`, `ui/input.js:430`, `ui/input.js:436`, `ui/input.js:442`, `ui/input.js:653`, `ui/input.js:860`, `ui/input.js:865`, `ui/input.js:883`, `ui/input.js:888`, `ui/input.js:981`, `ui/input.js:1002`, `ui/input.js:1010`, `ui/input.js:1016`, `ui/input.js:1058`, `ui/input.js:1069`, `ui/input.js:1073`, `ui/input.js:1086`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:489`, `ui/screens/base.js:1182`, `ui/screens/base.js:1416`, `ui/screens/missionLog.js:2154`, `ui/screens/missionLog.js:2158`, `ui/screens/missionLog.js:2162`, `ui/screens/missionLog.js:2166`, `ui/screens/missionLog.js:2182`, `ui/screens/missionLog.js:2190`, `ui/screens/missionLog.js:2197`, `ui/screens/missionLog.js:2204`, `ui/screens/missionLog.js:2212`, `ui/screens/missionLog.js:2219`, `ui/screens/missionLog.js:2226`, `ui/screens/missionLog.js:2235`, `ui/screens/missionLog.js:2242`, `ui/screens/missionLog.js:2258`, `ui/screens/missionLog.js:2289`, `ui/screens/missionLog.js:2309`, `ui/shipLedgerPanel.js:295`, `ui/shipLedgerPanel.js:302`, `ui/shipLedgerPanel.js:309`, `ui/station/screens/bar.js:570`, `ui/station/screens/bar.js:657`, `ui/station/screens/bar.js:661`, `ui/station/screens/bar.js:665`, `ui/station/screens/bar.js:687`, `ui/station/screens/bar.js:703`, `ui/station/screens/bar.js:732`, `ui/station/screens/bar.js:757`, `ui/station/screens/bar.js:766`, `ui/station/screens/contracts.js:1299`, `ui/station/screens/contracts.js:1310`, `ui/station/screens/contracts.js:1346`, `ui/station/screens/contracts.js:1349`, `ui/station/screens/contracts.js:1388`, `ui/station/screens/factions.js:361`, `ui/station/screens/industry.js:378`, `ui/station/screens/industry.js:419`, `ui/station/screens/industry.js:444`, `ui/station/screens/industry.js:454`, `ui/station/screens/market.js:801`, `ui/station/screens/market.js:1465`, `ui/station/screens/market.js:1534`, `ui/station/screens/market.js:1542`, `ui/station/screens/market.js:1583`, `ui/station/screens/market.js:1595`, `ui/station/screens/market.js:1789`, `ui/station/screens/shipworks.js:584`, `ui/station/screens/shipworks.js:3272`, `ui/station/screens/shipworks.js:4155`, `ui/station/screens/shipworks.js:4226`, `ui/station/screens/shipworks.js:4243`, `ui/station/screens/shipworks.js:4256`, `ui/station/screens/shipworks.js:4260`, `ui/station/screens/shipworks.js:4265`, `ui/station/screens/shipworks.js:4295`, `ui/station/screens/shipworks.js:4313`, `ui/station/screens/shipworks.js:4329`, `ui/station/screens/shipworks.js:4373`, `ui/station/screens/shipworks.js:4382`, `ui/station/screens/shipworks.js:4392`, `ui/station/screens/shipworks.js:4398`, `ui/station/screens/shipworks.js:4418`, `ui/station/screens/shipworks.js:4425`, `ui/station/screens/shipworks.js:4467`, `ui/station/screens/shipworks.js:4474`, `ui/station/screens/shipworks.js:4485`, `ui/station/screens/shipworks.js:4495`, `ui/station/screens/shipworks.js:4500`, `ui/station/screens/shipworks.js:4508`, `ui/station/screens/shipworks.js:4623`, `ui/station/screens/shipworks.js:4633`, `ui/station/screens/shipworks.js:4643`, `ui/station/screens/shipworks.js:4653`, `ui/station/screens/shipworks.js:4706`, `ui/station/screens/shipworks.js:4740`, `ui/station/screens/shipworks.js:4756`, `ui/station/screens/shipworks.js:4761`, `ui/station/stationApp.js:637`, `ui/station/stationApp.js:902`, `ui/station/stationApp.js:938`, `ui/uiRoot.js:1219`, `ui/wingmanRadial.js:186`, `ui/wingmanRadial.js:209`, `ui/wingmanRadial.js:231`, `ui/wingmanRadial.js:257`, `ui/wingmanRadial.js:282` | `audio/audioSystem.js:1997` |
| `automation:assetDistressed` | `systems/automation.js:1798` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2288` | `systems/intervention.js:69`, `systems/lossLedger.js:377`, `systems/missions.js:1367` |
| `automation:assetRepossessed` | `systems/automation.js:1823` | `ui/automationPayoff.js:90` |
| `automation:assetResumed` | `systems/automation.js:2144` | — |
| `automation:incomeCredited` | `systems/automation.js:1852`, `systems/automation.js:1863`, `systems/automation.js:2561` | — |
| `automation:offlineSummary` | `systems/automation.js:2326`, `systems/automation.js:2350`, `systems/automation.js:2374`, `systems/automation.js:2397`, `systems/automation.js:2608` | `ui/automationPayoff.js:80` |
| `automation:outpostRaided` | `systems/automation.js:1725`, `systems/automation.js:2683` | `systems/lossLedger.js:378` |
| `automation:programAssigned` | `systems/automation.js:1998` | `systems/missions.js:1366` |
| `automation:traderCycleCompleted` | `systems/automation.js:1481` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:543` | — |
| `band:bearingRequest` | `systems/bandRadio.js:516` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:718`, `systems/uniqueWrecks.js:761` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:725`, `systems/uniqueWrecks.js:733`, `systems/uniqueWrecks.js:747` | — |
| `band:bed` | `systems/bandRadio.js:600` | `audio/audioSystem.js:2070` |
| `band:cycle` | `ui/bandHud.js:83`, `ui/input.js:330` | — |
| `band:status` | `systems/bandRadio.js:582` | `ui/bandHud.js:87` |
| `barkDirector:voice` | — | `audio/audioSystem.js:2043` |
| `beacon:deploy` | — | `systems/beacons.js:43` |
| `beacon:deployed` | `systems/beacons.js:92` | `render/shipMicroMotion.js:1267` |
| `beam:denied` | `systems/mining.js:298`, `systems/mining.js:341`, `systems/mining.js:355`, `systems/mining.js:365`, `systems/mining.js:397` | — |
| `beam:repaired` | `systems/mining.js:458` | — |
| `beam:transferred` | `systems/mining.js:512` | — |
| `bombs:armed` | `systems/bombs.js:661` | — |
| `bombs:commanded` | `systems/bombs.js:617` | — |
| `bombs:cycle` | `systems/bombs.js:361`, `systems/bombs.js:596` | — |
| `bombs:denied` | `systems/bombs.js:247`, `systems/bombs.js:354`, `systems/bombs.js:376`, `systems/bombs.js:412`, `systems/bombs.js:449`, `systems/bombs.js:473`, `systems/bombs.js:541`, `systems/bombs.js:555` | — |
| `bombs:destroyed` | `systems/bombs.js:913` | `render/vfx.js:2446` |
| `bombs:detonated` | `systems/bombs.js:717` | `audio/bombAudio.js:346`, `render/vfx.js:2444` |
| `bombs:dropped` | `systems/bombs.js:603` | `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:526` |
| `bombs:fieldEnded` | `systems/bombs.js:868` | `audio/bombAudio.js:354`, `render/vfx.js:2445` |
| `bombs:primed` | `systems/bombs.js:629` | — |
| `bombs:rackChanged` | `systems/bombs.js:502` | — |
| `bombs:released` | `systems/bombs.js:933` | `audio/bombAudio.js:357` |
| `bombs:stockChanged` | `systems/bombs.js:383`, `systems/bombs.js:494`, `systems/bombs.js:601` | — |
| `boss:defeated` | `systems/world.js:890` | — |
| `bounty:cleared` | `systems/economy.js:2462` | `systems/heat.js:321` |
| `buildIdentity:revealed` | `systems/buildIdentity.js:299` | — |
| `bulletTime:end` | `systems/bulletTime.js:200` | `audio/audioSystem.js:2069` |
| `bulletTime:start` | `systems/bulletTime.js:184` | `audio/audioSystem.js:2066`, `systems/onboarding.js:612` |
| `camera:kill` | `render/feel.js:1226`, `render/feel.js:1702` | — |
| `camera:shake` | `render/shipMicroMotion.js:2213`, `render/vfx.js:5733`, `render/vfx.js:6023`, `render/vfx.js:6360`, `systems/combat.js:571`, `systems/combat.js:726`, `systems/combat.js:904`, `systems/combat.js:987`, `systems/drill.js:1371`, `systems/flybyFocus.js:516`, `systems/intervention.js:211`, `systems/presentationAdapters.js:474`, `systems/survivalAnnounce.js:443`, `systems/tetherGameplay.js:564` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:496`, `ui/input.js:497`, `ui/input.js:729` | — |
| `capitalBoss:detach` | `systems/missions.js:1382` | — |
| `capitalBoss:start` | `systems/missions.js:5668` | — |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:110`, `systems/capitalBossEncounters.js:132` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:731` | `systems/world.js:566` |
| `cargo:changed` | `systems/cargo.js:203`, `systems/mining.js:2301` | `systems/ships.js:1455`, `ui/cargoConscience.js:142`, `ui/commandBar.js:412`, `ui/hud.js:4081`, `ui/hud.js:4110`, `ui/hudMeta.js:192` |
| `cargo:delivered` | `systems/missions.js:6379`, `systems/missions.js:6480` | `systems/economy.js:1007` |
| `cargo:fragileLost` | `systems/fragileCargo.js:200` | — |
| `cargo:full` | `systems/cargo.js:302`, `systems/mining.js:1344`, `systems/mining.js:2279` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:459`, `systems/presentationOrchestrator.js:211`, `ui/alerts.js:370`, `ui/floatingText.js:256` |
| `cargo:hotDockSpill` | `systems/cargo.js:528` | — |
| `cargo:jettison` | `ui/hud.js:3721` | `ui/hud.js:4013` |
| `cargo:jettisoned` | `systems/cargo.js:634` | `audio/audioSystem.js:1903`, `render/shipMicroMotion.js:1265`, `systems/barkDirector.js:371`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:608` |
| `cargo:massSettled` | `systems/cargo.js:438` | `systems/presentationOrchestrator.js:210`, `systems/ships.js:1456` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:901` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:937` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:821`, `systems/lootShards.js:877` | — |
| `chain:detonated` | `systems/impulseCharges.js:790` | `systems/fields.js:433` |
| `chain:primeEnded` | `systems/impulseCharges.js:753` | — |
| `chain:primed` | `systems/impulseCharges.js:730` | — |
| `chain:slam` | `systems/impulseCharges.js:664`, `systems/impulseCharges.js:684` | `systems/fields.js:432` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1915` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:997` | `systems/onboarding.js:620` |
| `charge:armed` | `systems/impulseCharges.js:827` | — |
| `charge:combo` | `systems/impulseCharges.js:1039`, `systems/impulseCharges.js:1098` | — |
| `charge:detonated` | `systems/impulseCharges.js:498`, `systems/impulseCharges.js:581`, `systems/impulseCharges.js:802`, `systems/impulseCharges.js:1106` | `audio/audioSystem.js:1931`, `render/feel.js:1306`, `render/vfx.js:2442`, `systems/fields.js:434` |
| `charge:stuck` | `systems/impulseCharges.js:904` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1264` |
| `charge:thrown` | `systems/impulseCharges.js:984` | `render/ordnanceMotionPresentation.js:261` |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:18` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:19` |
| `claim:claimed` | `systems/claims.js:337` | `systems/onboarding.js:515`, `systems/story.js:189`, `systems/traffic.js:1496` |
| `claim:convoyAbandoned` | `systems/claims.js:1001`, `systems/claims.js:1101` | `systems/traffic.js:1499` |
| `claim:convoyDocked` | `systems/traffic.js:2708` | `systems/claims.js:293` |
| `claim:convoyManifested` | `systems/traffic.js:2608` | `systems/claims.js:292` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1332` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:285` |
| `claim:defenseResolved` | `systems/claims.js:1408` | — |
| `claim:defenseStarted` | `systems/claims.js:1337` | — |
| `claim:defenseWarning` | `systems/claims.js:1256` | — |
| `claim:depotPatrolCompleted` | `systems/claims.js:2178` | `systems/factions.js:405` |
| `claim:depotPatrolRotation` | `systems/claims.js:2135` | — |
| `claim:depotSupport` | `systems/claims.js:2050`, `systems/claims.js:2075` | — |
| `claim:freightDelivered` | `systems/traffic.js:2919` | — |
| `claim:infrastructureActive` | `systems/claims.js:871` | `systems/traffic.js:1494` |
| `claim:infrastructureConstructed` | `systems/claims.js:404` | — |
| `claim:infrastructureStatus` | `systems/claims.js:882` | `systems/traffic.js:1495` |
| `claim:moduleBuilt` | `systems/claims.js:422` | — |
| `claim:raidRepelled` | `systems/claims.js:1205` | — |
| `claim:raidWarning` | `systems/claims.js:1198` | — |
| `claim:receipt` | `systems/claims.js:1625` | — |
| `claim:sensorPostRumor` | `systems/claims.js:931` | `systems/world.js:597` |
| `claim:specialized` | `systems/claims.js:463` | — |
| `claim:teleportRequest` | `systems/claims.js:669` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:2335` | — |
| `claims:migrated` | `systems/claims.js:1743` | — |
| `cloak:burned` | `systems/cloak.js:250` | — |
| `cloak:dropped` | `systems/cloak.js:206` | `render/shipMicroMotion.js:1261` |
| `cloak:engaged` | `systems/cloak.js:193` | `render/shipMicroMotion.js:1260`, `systems/onboarding.js:616` |
| `cloak:faded` | `systems/aiPorts.js:1088` | — |
| `combat:actionCancelled` | `combat/actions.js:336` | — |
| `combat:actionCompleted` | `combat/actions.js:322` | — |
| `combat:actionPhase` | `combat/actions.js:195` | — |
| `combat:actionRejected` | `combat/actions.js:358` | `ui/toasts.js:381` |
| `combat:actionStarted` | `combat/actions.js:165` | `systems/presentationOrchestrator.js:170`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2378` |
| `combat:baseDestroyed` | `systems/combat.js:712` | `systems/economy.js:1052` |
| `combat:beamStop` | `systems/weapons.js:1156` | `audio/audioSystem.js:1816`, `render/asteroidMotionPresentation.js:451`, `render/vfx.js:2374` |
| `combat:bounceContinued` | `combat/attackHit.js:36` | `render/vfx.js:2379`, `systems/presentationOrchestrator.js:253` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:317` | `render/feel.js:1341`, `render/vfx.js:2388`, `systems/fields.js:436`, `systems/gamepad.js:507` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:335` | `render/vfx.js:2389` |
| `combat:damage` | `combat/damage.js:288` | `audio/audioSystem.js:1823`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `render/asteroidMotionPresentation.js:445`, `render/feel.js:1151`, `render/shipMicroMotion.js:1247`, `render/vfx.js:2380`, `save/saveSystem.js:240`, `systems/ai.js:102`, `systems/aiEncounter.js:131`, `systems/barkDirector.js:367`, `systems/collisionConsequences.js:66`, `systems/combatOutcome.js:181`, `systems/cruise.js:53`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:284`, `systems/factionPresence.js:438`, `systems/heat.js:282`, `systems/lawSecurity.js:256`, `systems/missions.js:1356`, `systems/npcJobsRuntime.js:945`, `systems/onboarding.js:425`, `systems/onboarding.js:436`, `systems/presentationOrchestrator.js:164`, `systems/salvageActions.js:128`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1516`, `systems/stationBroadcast.js:154`, `systems/survivalResults.js:448`, `systems/titles.js:396`, `systems/traffic.js:1444`, `ui/alerts.js:356`, `ui/commandBar.js:401`, `ui/floatingText.js:160`, `ui/hud.js:1739`, `ui/hud.js:2015`, `ui/hud.js:2217`, `ui/uiRoot.js:613` |
| `combat:emp` | `combat/damage.js:322` | `ui/hud.js:2223` |
| `combat:fire` | `systems/weapons.js:1062`, `systems/weapons.js:1135`, `systems/weapons.js:1284`, `systems/weapons.js:1601` | `audio/audioSystem.js:1815`, `data/stationBubbles.js:181`, `render/feel.js:1242`, `render/shipMicroMotion.js:1245`, `render/vfx.js:2373`, `systems/cloak.js:52`, `systems/cruise.js:61`, `systems/lawSecurity.js:257`, `systems/onboarding.js:375`, `systems/onboarding.js:388`, `systems/presentationOrchestrator.js:169`, `systems/traffic.js:1445`, `ui/hud.js:4125` |
| `combat:hit` | `systems/salvageActions.js:579`, `systems/salvageActions.js:671` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:137` | `systems/automation.js:539` |
| `combat:kill` | `systems/world.js:5341` | — |
| `combat:lockChanged` | `systems/weapons.js:842` | `systems/world.js:559`, `ui/alerts.js:363` |
| `combat:outcome` | `systems/combatOutcome.js:296` | `systems/barkDirector.js:364` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:297` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:4479`, `systems/npcJobsRuntime.js:4715` | `combat/kernel.js:182` |
| `combat:requestAction` | — | `combat/kernel.js:180` |
| `combat:routeDamage` | `systems/bombs.js:881`, `systems/drill.js:1383`, `systems/impulseCharges.js:1315`, `systems/mines.js:286`, `systems/missions.js:6012` | `combat/kernel.js:181`, `systems/routeFollower.js:333` |
| `combat:shove` | `systems/onboarding.js:1846` | `audio/audioSystem.js:1915`, `systems/onboarding.js:387` |
| `combat:statusApplied` | `combat/statuses.js:181` | `render/vfx.js:2390` |
| `combat:statusExpired` | `combat/statuses.js:79` | `audio/bombAudio.js:366`, `systems/tumbleStates.js:108` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:157`, `systems/encounterDirector.js:276`, `systems/factionPresence.js:436`, `systems/npcJobsRuntime.js:948`, `systems/presentationOrchestrator.js:232`, `systems/surrenderRecovery.js:66`, `systems/tumbleStates.js:112`, `systems/wingMorale.js:179` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1263`, `systems/factionPresence.js:437`, `systems/npcJobsRuntime.js:949`, `systems/presentationOrchestrator.js:241`, `systems/surrenderRecovery.js:67` |
| `combat:surrendered` | — | `systems/combatOutcome.js:158`, `systems/surrenderRecovery.js:65` |
| `combat:tumbled` | `systems/tumbleStates.js:457` | `systems/fields.js:435`, `systems/missions.js:1285`, `systems/tetherGameplay.js:247` |
| `combat:warded` | `combat/damage.js:52` | — |
| `combat:weakPointHit` | `systems/combat.js:632` | `render/vfx.js:2381`, `ui/floatingText.js:188` |
| `comms:log` | `data/encounters/344-opening-hauler-raid.js:130`, `data/encounters/350-the-long-tail.js:175`, `data/encounters/350-the-long-tail.js:209`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:154`, `data/encounters/352-the-slot.js:174`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:138`, `data/encounters/355-the-winnow-throw.js:155`, `data/encounters/355-the-winnow-throw.js:162`, `data/encounters/355-the-winnow-throw.js:179`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:180`, `data/encounters/357-the-handoff.js:194`, `data/encounters/357-the-handoff.js:215`, `data/encounters/358-the-press-camp.js:56`, `data/encounters/358-the-press-camp.js:201`, `data/encounters/358-the-press-camp.js:214`, `systems/alienEcology.js:343`, `systems/alienEcology.js:769`, `systems/alienEcology.js:827`, `systems/alienEcology.js:845`, `systems/alienEcology.js:903`, `systems/alienEcology.js:969`, `systems/alienEcology.js:981`, `systems/alienEcology.js:1707`, `systems/asteroidSites.js:1041`, `systems/encounterDirector.js:2296`, `systems/encounterScripts.js:737`, `systems/encounterScripts.js:2600`, `systems/encounterScripts.js:2846`, `systems/missions.js:5067`, `systems/precursorMachines.js:49`, `systems/precursorMachines.js:205`, `systems/precursorMachines.js:218`, `systems/precursorMachines.js:235`, `systems/precursorMachines.js:258`, `systems/precursorMachines.js:278`, `systems/precursorMachines.js:292`, `systems/precursorMachines.js:301`, `systems/precursorMachines.js:366`, `systems/precursorMachines.js:431`, `systems/precursorMachines.js:458`, `systems/precursorMachines.js:490`, `systems/precursorMachines.js:507`, `systems/precursorMachines.js:522`, `systems/precursorMachines.js:554`, `systems/precursorMachines.js:575`, `systems/precursorMachines.js:582`, `systems/precursorMachines.js:598`, `systems/precursorMachines.js:642`, `systems/salvage.js:95`, `systems/salvage.js:606` | `ui/floatingText.js:80` |
| `comms:message` | `systems/traffic.js:5642`, `systems/traffic.js:6407` | — |
| `comms:popup` | `systems/ai.js:491`, `systems/factionPresence.js:995`, `systems/factionPresence.js:1016`, `systems/memorialThief.js:93`, `systems/missions.js:4261`, `systems/missions.js:6612`, `systems/missions.js:6705`, `systems/missions.js:6744`, `systems/missions.js:7577`, `systems/missions.js:7882`, `systems/missions.js:8026`, `systems/missions.js:8152`, `systems/missions.js:8824`, `systems/missions.js:8847`, `systems/missions.js:8960`, `systems/missions.js:9002`, `systems/missions.js:9456`, `systems/onboarding.js:769`, `systems/scenarioRuntime.js:186`, `systems/story.js:419`, `systems/story.js:1102`, `systems/story.js:1130` | `audio/audioSystem.js:1983`, `ui/screens/codex.js:630` |
| `conflict:flip` | `systems/factions.js:737` | `systems/factionPresence.js:442`, `systems/sectorSim.js:126`, `systems/story.js:184` |
| `conflict:frontAction` | `systems/factions.js:624` | — |
| `conflict:warDeclared` | `systems/factions.js:681` | — |
| `contactHail:availability` | `systems/scanner.js:1389`, `systems/scanner.js:1400` | — |
| `contactHail:choice` | `ui/commsRadial.js:767`, `ui/contactHailPrompt.js:167` | `systems/scanner.js:838` |
| `contactHail:clear` | `systems/scanner.js:1411` | — |
| `contactHail:handoff` | `systems/scanner.js:1249` | — |
| `contactHail:offer` | `systems/scanner.js:1271` | — |
| `contactHail:request` | `ui/commsRadial.js:829`, `ui/contactHailPrompt.js:161` | `systems/scanner.js:837` |
| `contactHail:response` | `systems/scanner.js:1305` | `systems/traffic.js:1434` |
| `contraband:bribe` | `systems/encounterScripts.js:415`, `ui/customsPrompt.js:227` | `systems/economy.js:1048` |
| `contraband:scanned` | `systems/economy.js:2908` | `systems/encounterDirector.js:285`, `systems/factions.js:385`, `systems/heat.js:287`, `systems/lawSecurity.js:267`, `ui/customsPrompt.js:148` |
| `contract:clauseBroken` | `systems/contractClauses.js:395` | `systems/missions.js:1332` |
| `contract:clauseHonored` | `systems/contractClauses.js:380`, `systems/missions.js:6758` | — |
| `contract:clauseSettledKill` | `systems/contractClauses.js:290` | `systems/missions.js:1251` |
| `countermeasure:denied` | `systems/countermeasures.js:406` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:389` | `render/shipMicroMotion.js:1266` |
| `craft:complete` | `systems/crafting.js:267`, `systems/crafting.js:310` | `ui/station/screens/industry.js:465` |
| `craft:queueChanged` | `systems/crafting.js:162`, `systems/crafting.js:277`, `systems/crafting.js:312` | `systems/onboarding.js:520`, `ui/station/screens/industry.js:465` |
| `credits:changed` | `systems/economy.js:2402`, `systems/economy.js:2414` | `audio/audioSystem.js:1896`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:413`, `ui/hud.js:4109` |
| `cruise:charging` | `systems/cruise.js:123` | `render/vfx.js:2439`, `systems/presentationOrchestrator.js:177` |
| `cruise:dropped` | `systems/cruise.js:189` | `render/vfx.js:2441`, `systems/presentationOrchestrator.js:179` |
| `cruise:engaged` | `systems/cruise.js:98` | `render/vfx.js:2440`, `systems/presentationOrchestrator.js:178` |
| `cruise:snareRequest` | `systems/encounterScripts.js:579` | `systems/cruise.js:66` |
| `cruise:snared` | `systems/cruise.js:188` | `audio/audioSystem.js:1977` |
| `customs:breakScan` | `ui/customsPrompt.js:231` | — |
| `customs:gateIncident` | — | `systems/barkDirector.js:373` |
| `customs:submit` | `ui/customsPrompt.js:210` | — |
| `customs:weirBolt` | — | `systems/economy.js:1047` |
| `danger:miningNoise` | `systems/mining.js:2313` | — |
| `day:tick` | `core/coreSystem.js:311` | `systems/custodyConsequences.js:40`, `systems/economy.js:972`, `systems/encounterDirector.js:258`, `systems/factions.js:417`, `systems/sectorSim.js:110` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:226` | `systems/combat.js:544` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:217` | `systems/combat.js:543` |
| `detonator:detonated` | `systems/impulseCharges.js:487` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:184` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:plateUnlocked` | `systems/world.js:845`, `systems/world.js:5201`, `systems/world.js:5531`, `systems/world.js:6152` | `audio/audioSystem.js:1913`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:632` |
| `distress:call` | `systems/traffic.js:5640` | — |
| `distress:rescued` | `systems/encounterScripts.js:736` | `systems/factions.js:395` |
| `dock:attempt` | `ui/input.js:176` | `ui/dockDenyBanner.js:116` |
| `dock:denied` | `ui/dockDenyBanner.js:141` | — |
| `dock:docked` | `balance/careerCohorts.js:507`, `balance/careerCohorts.js:1943`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `ui/input.js:180` | `audio/audioSystem.js:1914`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/infrastructureMotion.js:115`, `render/shipMicroMotion.js:1256`, `save/saveSystem.js:267`, `systems/aftermathWrecks.js:937`, `systems/autoTargetAssist.js:101`, `systems/combat.js:530`, `systems/economy.js:1024`, `systems/economyContracts.js:176`, `systems/factionPresence.js:434`, `systems/lawSecurity.js:276`, `systems/mining.js:201`, `systems/mining.js:203`, `systems/missions.js:1205`, `systems/onboarding.js:349`, `systems/onboarding.js:486`, `systems/pirateDisguise.js:37`, `systems/scanner.js:841`, `systems/stationServices.js:205`, `systems/story.js:149`, `systems/world.js:590`, `systems/world.js:628`, `ui/alerts.js:330`, `ui/cargoConscience.js:143`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:117`, `ui/impoundPayPrompt.js:35`, `ui/priceForecast.js:86`, `ui/promptDeck.js:710`, `ui/securityReadout.js:158`, `ui/uiRoot.js:1143`, `ui/wingmanRadial.js:300`, `ui/wreckChoicePrompt.js:50` |
| `dock:launder` | — | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:1087`, `core/physics.js:1091`, `ui/input.js:153` | `systems/onboarding.js:445`, `ui/alerts.js:326`, `ui/input.js:159` |
| `dock:undocked` | `balance/careerCohorts.js:508`, `balance/careerCohorts.js:1948`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:693`, `ui/station/stationApp.js:863` | `audio/audioSystem.js:1919`, `render/infrastructureMotion.js:116`, `render/shipMicroMotion.js:1257`, `save/saveSystem.js:268`, `systems/combat.js:534`, `systems/economy.js:1033`, `systems/missions.js:1224`, `systems/moralTrap.js:179`, `systems/onboarding.js:398`, `systems/presentationAdapters.js:207`, `systems/stationServices.js:206`, `systems/world.js:591`, `ui/input.js:167`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1173` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1347` | `ui/uiRoot.js:1232` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1332`, `ui/sandbox/sandboxSetup.js:593` | `ui/uiRoot.js:1222` |
| `drill:approachRequested` | `ui/input.js:608` | `systems/tetherGameplay.js:246` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1224`, `ui/sandbox/sandboxSetup.js:592` | `ui/uiRoot.js:1211` |
| `drill:break` | `systems/drill.js:1342` | `audio/audioSystem.js:2100`, `systems/asteroidSites.js:214`, `systems/presentationOrchestrator.js:218`, `ui/asteroid/asteroidScreen.js:1731` |
| `drill:cargoFull` | `systems/drill.js:275` | `audio/audioSystem.js:2102`, `systems/presentationOrchestrator.js:225`, `ui/asteroid/asteroidScreen.js:1721` |
| `drill:end` | `systems/drill.js:933` | `audio/audioSystem.js:2110`, `systems/asteroidSites.js:224`, `systems/presentationOrchestrator.js:226` |
| `drill:gasHit` | `systems/drill.js:1370` | `audio/audioSystem.js:2101`, `systems/presentationOrchestrator.js:220`, `ui/asteroid/asteroidScreen.js:1708` |
| `drill:retry` | `systems/drill.js:982` | `systems/presentationOrchestrator.js:227` |
| `drill:rockDepleted` | `systems/drill.js:220`, `systems/drill.js:254`, `systems/drill.js:899` | `audio/audioSystem.js:2103`, `ui/asteroid/asteroidScreen.js:1718` |
| `drill:scanPulse` | `systems/drill.js:1055` | `audio/audioSystem.js:2104`, `systems/asteroidSites.js:246`, `systems/presentationOrchestrator.js:216`, `ui/asteroid/asteroidScreen.js:1725` |
| `drill:spark` | `systems/drill.js:1309` | `audio/audioSystem.js:2099`, `systems/presentationOrchestrator.js:217`, `ui/asteroid/asteroidScreen.js:1736` |
| `drill:start` | `systems/drill.js:891` | `audio/audioSystem.js:2109`, `systems/asteroidSites.js:207`, `systems/onboarding.js:491`, `systems/presentationOrchestrator.js:215` |
| `drill:warn` | `systems/drill.js:227`, `systems/drill.js:278`, `systems/drill.js:287`, `systems/drill.js:905`, `systems/drill.js:910`, `systems/drill.js:1186`, `systems/drill.js:1221`, `systems/drill.js:1242`, `systems/drill.js:1261` | `audio/audioSystem.js:2105`, `systems/presentationOrchestrator.js:214`, `ui/asteroid/asteroidRenderer3d.js:7054`, `ui/asteroid/asteroidScreen.js:1714` |
| `drill:yield` | `systems/drill.js:252` | `audio/audioSystem.js:2096`, `systems/presentationOrchestrator.js:219`, `ui/asteroid/asteroidScreen.js:1700` |
| `ecology:coherence` | `systems/alienEcology.js:785` | — |
| `ecology:evidence` | `systems/precursorMachines.js:213`, `systems/precursorMachines.js:296`, `systems/precursorMachines.js:297`, `systems/precursorMachines.js:494`, `systems/precursorMachines.js:526`, `systems/precursorMachines.js:558` | `systems/world.js:631` |
| `ecology:factionOutcome` | `systems/economy.js:2029`, `systems/economy.js:2283` | `systems/world.js:630` |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:464` | `systems/world.js:632` |
| `ecology:relayPulse` | `systems/alienEcology.js:866` | — |
| `ecology:setpiece` | `systems/alienEcology.js:1650` | — |
| `economy:applyTradePressure` | `systems/automation.js:847`, `systems/automation.js:1574`, `systems/automation.js:1575`, `systems/claims.js:1085`, `systems/encounterDirector.js:1795`, `systems/encounterDirector.js:1843`, `systems/sectorSim.js:398`, `systems/traffic.js:9337`, `systems/traffic.js:11073` | `systems/economy.js:1001` |
| `economy:cargoKillOpportunity` | `systems/economy.js:2175` | `systems/missions.js:1236` |
| `economy:chargeCredits` | `systems/automation.js:1747`, `systems/automation.js:1754`, `systems/automation.js:2571`, `systems/automation.js:2795`, `systems/beacons.js:69`, `systems/bombs.js:380`, `systems/bombs.js:460`, `systems/bombs.js:477`, `systems/claims.js:317`, `systems/claims.js:387`, `systems/claims.js:458`, `systems/claims.js:1158`, `systems/combat.js:883`, `systems/encounterDirector.js:1789`, `systems/factions.js:482`, `systems/gateControlDirector.js:120`, `systems/mining.js:444`, `systems/missions.js:3060`, `systems/missions.js:3063`, `systems/npcJobsRuntime.js:4365`, `systems/pirateParley.js:880`, `systems/ships.js:1833`, `systems/ships.js:1922`, `systems/ships.js:1978`, `systems/world.js:3696`, `systems/world.js:3740`, `systems/world.js:4836` | `systems/economy.js:962` |
| `economy:debtEscalated` | `systems/economy.js:2500` | — |
| `economy:demandShift` | `systems/economy.js:1383` | — |
| `economy:eventEnded` | `systems/economy.js:2986` | `ui/floatingText.js:272` |
| `economy:eventStarted` | `systems/economy.js:2961` | `ui/floatingText.js:261` |
| `economy:grantCredits` | `systems/automation.js:1848`, `systems/automation.js:1859`, `systems/automation.js:2557`, `systems/bombs.js:493`, `systems/claims.js:1084`, `systems/claims.js:1729`, `systems/combat.js:733`, `systems/combat.js:745`, `systems/combat.js:971`, `systems/encounterDirector.js:1790`, `systems/mining.js:1907`, `systems/mining.js:2092`, `systems/mining.js:2236`, `systems/missions.js:6766`, `systems/missions.js:6769`, `systems/missions.js:7212`, `systems/missions.js:9369`, `systems/moralTrap.js:317`, `systems/scanReveal.js:117`, `systems/scanReveal.js:150`, `systems/ships.js:2014`, `systems/survivorPod.js:1215`, `systems/uniqueWrecks.js:1572` | `systems/economy.js:961`, `systems/story.js:182` |
| `economy:marketOpened` | `ui/station/screens/market.js:1831` | `systems/economy.js:977`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1599` | `systems/economy.js:964` |
| `economy:salvageIntakeApplied` | `systems/economy.js:2385` | — |
| `economy:sinkCharged` | `systems/economy.js:2428` | — |
| `economy:tick` | `systems/economy.js:1148` | `ui/priceHistory.js:116` |
| `economy:tradeCompleted` | `systems/economy.js:2017` | `audio/audioSystem.js:1897`, `audio/audioSystem.js:1953`, `careers/origins/haulerOriginSystem.js:91`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:275`, `systems/claims.js:279`, `systems/factions.js:361`, `systems/missions.js:1234`, `systems/onboarding.js:354`, `systems/sectorSim.js:121`, `systems/story.js:178` |
| `economy:tradeFailed` | `systems/economy.js:2246`, `systems/economy.js:2269` | — |
| `emergent:audio` | `systems/emergentPrimitives.js:161` | — |
| `emergent:contact` | `systems/emergentPrimitives.js:167` | `render/feel.js:1324` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1646` | `ui/encounterChoicePrompt.js:53` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:298` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1731` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `systems/encounterDirector.js:2337` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:7752` | `systems/encounterDirector.js:283` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1942`, `systems/encounterScripts.js:2820` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:2301` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:1138` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1055`, `systems/encounterScripts.js:1123` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:1028` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1744` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:1726`, `systems/encounterDirector.js:1775`, `systems/survivalArena.js:1156` | `audio/audioSystem.js:1923`, `systems/aftermathWrecks.js:936`, `systems/claims.js:283`, `systems/claims.js:284`, `systems/story.js:137`, `systems/terrainAnchors.js:89`, `systems/traffic.js:1500`, `systems/uniqueLootAbilities.js:133`, `ui/encounterChoicePrompt.js:54` |
| `encounter:spawned` | `systems/encounterDirector.js:1094` | `systems/uniqueLootAbilities.js:132` |
| `encounter:stale` | `systems/encounterDirector.js:429` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1066`, `systems/survivalArena.js:1080` | `audio/audioSystem.js:1922`, `systems/survivalResults.js:454`, `systems/terrainAnchors.js:88`, `systems/world.js:600` |
| `encounter:voice` | `systems/encounterDirector.js:1629` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | — |
| `endgame:archive` | `systems/story.js:165` | — |
| `endgame:chosen` | `systems/story.js:944` | `ui/screens/missionLog.js:2437` |
| `endgame:confirmRequired` | `systems/story.js:829` | `ui/screens/missionLog.js:2436` |
| `endgame:eligibility` | `systems/story.js:646` | `ui/screens/missionLog.js:2435` |
| `endgame:finaleCompleted` | `systems/story.js:722` | — |
| `endgame:finaleReady` | `systems/story.js:953` | — |
| `endgame:ineligible` | `systems/story.js:732`, `systems/story.js:809`, `systems/story.js:874` | — |
| `endgame:loopBack` | — | `systems/story.js:173` |
| `endgame:promptChoiceC` | `systems/story.js:794` | — |
| `endgame:promptChoiceD` | `systems/story.js:758` | — |
| `endgame:promptSandbox` | `systems/story.js:657` | — |
| `endgame:pullCompleted` | `systems/claims.js:2281` | `systems/factions.js:408` |
| `endgame:sandboxContinued` | `systems/story.js:938` | `ui/screens/missionLog.js:2438` |
| `entity:destroyed` | `main.js:473`, `main.js:707`, `save/saveSystem.js:3492`, `systems/survivorPod.js:309`, `systems/traffic.js:7401` | `audio/audioSystem.js:1870`, `combat/kernel.js:175`, `render/vfx.js:2401`, `systems/aftermathWrecks.js:931`, `systems/ai.js:114`, `systems/aiEncounter.js:130`, `systems/cloak.js:87`, `systems/combatOutcome.js:161`, `systems/encounterDirector.js:274`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:247`, `systems/lawSecurity.js:260`, `systems/missions.js:1253`, `systems/missions.js:1358`, `systems/npcJobsRuntime.js:933`, `systems/presentationOrchestrator.js:176`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:94`, `systems/survivalWave.js:132`, `systems/swarmArena.js:428`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:217` |
| `entity:killed` | `balance/careerCohorts.js:476`, `combat/damage.js:464`, `combat/kernel.js:124`, `systems/combat.js:696` | `audio/audioSystem.js:1869`, `render/feel.js:1202`, `render/shipMicroMotion.js:1240`, `render/vfx.js:2400`, `sim/titleAttract.js:166`, `systems/aftermathWrecks.js:929`, `systems/ai.js:115`, `systems/barkDirector.js:372`, `systems/barkDirector.js:374`, `systems/combatOutcome.js:155`, `systems/economy.js:1013`, `systems/encounterDirector.js:275`, `systems/factions.js:263`, `systems/factions.js:323`, `systems/impulseCharges.js:234`, `systems/lawSecurity.js:259`, `systems/lawSecurity.js:271`, `systems/lootShards.js:539`, `systems/lossLedger.js:380`, `systems/mining.js:196`, `systems/missions.js:1246`, `systems/missions.js:1357`, `systems/npcJobsRuntime.js:925`, `systems/onboarding.js:389`, `systems/onboarding.js:414`, `systems/presentationOrchestrator.js:175`, `systems/sectorSim.js:125`, `systems/surrenderRecovery.js:72`, `systems/survivalResults.js:445`, `systems/survivalWave.js:133`, `systems/survivorPod.js:450`, `systems/swarmChain.js:107`, `systems/swarmSupply.js:101`, `systems/titles.js:397`, `systems/traffic.js:1422`, `systems/wingMorale.js:178`, `systems/world.js:604`, `ui/floatingText.js:185`, `ui/floatingText.js:228`, `ui/uiRoot.js:620`, `ui/uiRoot.js:628` |
| `entity:spawnRequest` | `data/scanReveal.js:357`, `systems/salvageActions.js:260`, `systems/salvageActions.js:483` | `core/coreSystem.js:221` |
| `entity:spawned` | `core/coreSystem.js:119` | `combat/kernel.js:170`, `render/asteroidMotionPresentation.js:453`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:220`, `render/shipMicroMotion.js:1241`, `render/vfx.js:2407`, `sim/titleAttract.js:167`, `systems/aiEncounter.js:129`, `systems/barkDirector.js:360`, `systems/combatOutcome.js:160`, `systems/factionPresence.js:440`, `systems/fields.js:430`, `systems/flybyFocus.js:303`, `systems/lawSecurity.js:258`, `systems/lossLedger.js:379`, `systems/npcJobsRuntime.js:910`, `systems/salvageActions.js:125`, `systems/survivalSwarm.js:216`, `systems/swarmSupply.js:106`, `systems/titles.js:398`, `systems/uniqueLootAbilities.js:135` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:320`, `systems/environmentalMachinery.js:845` | `systems/terrainAnchors.js:90` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:660` | `systems/terrainAnchors.js:94` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:739` | `systems/terrainAnchors.js:92` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:936` | `data/hazardLanguage.js:133` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:672` | `systems/terrainAnchors.js:96` |
| `escalation:arrived` | `systems/encounterDirector.js:469` | — |
| `escalation:seeded` | `systems/encounterDirector.js:456` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:458`, `systems/factions.js:524`, `systems/factions.js:867` | `systems/heat.js:296` |
| `faction:bribe` | `ui/screens/footprint.js:1605` | `systems/factions.js:244` |
| `faction:repChanged` | `systems/factions.js:455`, `systems/factions.js:519`, `systems/factions.js:863` | `ui/floatingText.js:246`, `ui/station/screens/factions.js:409` |
| `faction:repDelta` | `balance/careerCohorts.js:270`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `systems/choirReliefBerth.js:199`, `systems/choirReliefBerth.js:233`, `systems/claims.js:1396`, `systems/economy.js:2677`, `systems/economy.js:2900`, `systems/encounterDirector.js:1791`, `systems/missions.js:7209`, `systems/missions.js:7270`, `systems/missions.js:9321`, `systems/missions.js:9323`, `systems/missions.js:9387`, `systems/moralTrap.js:311`, `systems/stuntGrammar.js:102`, `systems/survivorPod.js:935`, `systems/survivorPod.js:1221`, `systems/uniqueWrecks.js:1576`, `systems/world.js:5657`, `systems/world.js:5891` | `systems/factions.js:241` |
| `faction:repSpillover` | `systems/factions.js:517` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1243` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:999` | `systems/story.js:199` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1155` | `ui/uiRoot.js:286` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:847` | — |
| `factionPresence:service` | `systems/factionPresence.js:948` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1024` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:581`, `systems/factionPresence.js:666` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:789` | `systems/world.js:563` |
| `field:opportunity` | `systems/world.js:4146` | — |
| `field:regrown` | `systems/world.js:4075` | `systems/presentationOrchestrator.js:213` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:717`, `systems/traffic.js:1790`, `systems/traffic.js:10992` | — |
| `field:richSeamOpened` | `systems/traffic.js:10045` | — |
| `field:richSeamWorked` | `systems/mining.js:838`, `systems/traffic.js:9704` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:788` | `systems/npcJobsRuntime.js:941`, `systems/presentationOrchestrator.js:212` |
| `fields:anchorRegistered` | `systems/fields.js:951` | — |
| `fields:cleared` | `systems/fields.js:1484` | — |
| `fields:clusterDetonate` | `systems/fields.js:2065` | `systems/presentationOrchestrator.js:274` |
| `fields:coneToggled` | `systems/fields.js:1172`, `systems/fields.js:1178`, `systems/fields.js:1272`, `systems/fields.js:1280` | `systems/onboarding.js:405` |
| `fields:deployDenied` | `systems/fields.js:1046` | — |
| `fields:deployed` | `systems/fields.js:614`, `systems/fields.js:699`, `systems/fields.js:1132`, `systems/fields.js:1169`, `systems/fields.js:1263`, `systems/fields.js:1377` | `audio/audioSystem.js:2058`, `systems/fields.js:431`, `systems/onboarding.js:404` |
| `fields:ended` | `systems/fields.js:970`, `systems/fields.js:1279`, `systems/fields.js:1300`, `systems/fields.js:1450` | — |
| `fields:hitchCut` | `systems/fields.js:645` | — |
| `fields:hitchLatched` | `systems/fields.js:633` | — |
| `fields:specialistDisrupt` | `systems/fields.js:523` | — |
| `firsthour:beat` | `systems/onboarding.js:2703` | — |
| `firsthour:complete` | `systems/onboarding.js:2716` | — |
| `firsthour:milestone` | `systems/onboarding.js:850` | `audio/audioSystem.js:2051` |
| `firsthour:sentence` | `systems/onboarding.js:1484` | — |
| `firsthour:started` | `systems/onboarding.js:2501` | — |
| `firsthour:verb` | `systems/onboarding.js:2640` | — |
| `flight:modeChanged` | `systems/flightV3.js:578` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:315` |
| `flybyFocus:end` | `systems/flybyFocus.js:365` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:499` | `systems/onboarding.js:372` |
| `formation:discovered` | `systems/asteroidFormations.js:284` | — |
| `freight:arrival` | `systems/traffic.js:7760` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1540`, `systems/encounterScripts.js:1759`, `systems/traffic.js:5766` | `systems/barkDirector.js:370`, `systems/economy.js:963`, `systems/encounterDirector.js:303`, `systems/lootShards.js:542`, `systems/sectorSim.js:132`, `systems/traffic.js:1440` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1402` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:603` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1459` | — |
| `freight:loss` | `systems/encounterDirector.js:1853`, `systems/traffic.js:9339`, `systems/traffic.js:11085` | `systems/claims.js:294`, `systems/encounterDirector.js:304`, `systems/sectorSim.js:131` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1403` | `systems/surrenderRecovery.js:73` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1895` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:281`, `systems/traffic.js:1437` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:282`, `systems/traffic.js:1438` |
| `frontierRumor:acquired` | `systems/world.js:3759` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:6122` | — |
| `frontierRumor:contacted` | `systems/world.js:6018` | — |
| `frontierRumor:resolved` | `systems/world.js:3776` | — |
| `fuel:changed` | `systems/economy.js:2542`, `systems/stationServices.js:422`, `systems/stationServices.js:489`, `systems/world.js:5363`, `systems/world.js:5371` | — |
| `fuel:empty` | `systems/world.js:5364` | `audio/audioSystem.js:1943`, `ui/alerts.js:371` |
| `game:exitToMenu` | `ui/screens/crucible.js:2723`, `ui/screens/crucible.js:2736`, `ui/screens/demoEnd.js:216`, `ui/screens/pause.js:979` | `audio/audioSystem.js:2148`, `main.js:251`, `systems/runSession.js:57`, `ui/screens/crucibleLabControls.js:552` |
| `game:load` | `ui/input.js:319`, `ui/input.js:493`, `ui/screens/mainMenu.js:523`, `ui/screens/saveLoad.js:1207` | `save/saveSystem.js:189`, `systems/scanner.js:840`, `ui/commandBar.js:430`, `ui/promptDeck.js:709` |
| `game:loadingProgress` | `main.js:149`, `main.js:167`, `main.js:651`, `main.js:732`, `main.js:748`, `main.js:767`, `main.js:785`, `main.js:826`, `main.js:963` | `ui/loadingPresenter.js:422`, `ui/screens/newGame.js:815`, `ui/screens/saveLoad.js:811` |
| `game:new` | `main.js:416`, `ui/sandbox/sandboxSetup.js:359`, `ui/screens/crucible.js:2727`, `ui/screens/gameOver.js:404`, `ui/screens/newGame.js:894` | `audio/audioSystem.js:2143`, `audio/bombAudio.js:360`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:235`, `main.js:229`, `render/feel.js:1145`, `render/vfx.js:2415`, `save/saveSystem.js:252`, `systems/aftermathWrecks.js:943`, `systems/aiEncounter.js:134`, `systems/bombs.js:255`, `systems/cloak.js:82`, `systems/combatOutcome.js:165`, `systems/countermeasures.js:137`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:83`, `systems/encounterDirector.js:272`, `systems/environmentalMachinery.js:156`, `systems/fields.js:424`, `systems/impulseCharges.js:239`, `systems/massSeed.js:120`, `systems/masslineSnares.js:129`, `systems/mines.js:77`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:276`, `systems/salvageActions.js:132`, `systems/scanner.js:839`, `systems/surrenderRecovery.js:79`, `systems/survivorPod.js:448`, `systems/tetherGameplay.js:241`, `systems/tumbleStates.js:110`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/moralTrapPrompt.js:44`, `ui/priceHistory.js:146`, `ui/promptDeck.js:708`, `ui/screens/crucibleLabControls.js:546`, `ui/wreckChoicePrompt.js:52` |
| `game:newGame` | `main.js:494` | `audio/audioSystem.js:2144`, `audio/bombAudio.js:361`, `core/coreSystem.js:236`, `render/shipMicroMotion.js:1244`, `render/vfx.js:2416`, `save/saveSystem.js:256`, `systems/aftermathWrecks.js:944`, `systems/bombs.js:258`, `systems/cloak.js:83`, `systems/collisionConsequences.js:69`, `systems/combatOutcome.js:171`, `systems/countermeasures.js:138`, `systems/difficultyDirector.js:169`, `systems/fieldDepletion.js:705`, `systems/fragileCargo.js:282`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:382`, `systems/salvageActions.js:133`, `systems/survivorPod.js:447`, `systems/titles.js:400`, `systems/tumbleStates.js:111`, `systems/wingMorale.js:180`, `ui/cargoConscience.js:147`, `ui/uiRoot.js:531` |
| `game:over` | `systems/combat.js:657`, `systems/combat.js:787` | `ui/uiRoot.js:1255` |
| `game:save` | `ui/input.js:318`, `ui/input.js:491`, `ui/screens/saveLoad.js:1227` | `save/saveSystem.js:178` |
| `game:scenePrepared` | `main.js:555` | `ui/sandbox/sandboxSetup.js:383` |
| `game:startFailed` | `main.js:916` | `ui/loadingPresenter.js:433`, `ui/sandbox/sandboxSetup.js:388`, `ui/screens/crucibleLabControls.js:548`, `ui/screens/newGame.js:814`, `ui/screens/saveLoad.js:817` |
| `game:started` | `main.js:660` | `audio/audioSystem.js:2149`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:237`, `save/saveSystem.js:249`, `save/saveSystem.js:263`, `sim/killcamTape.js:426`, `systems/automation.js:559`, `systems/collisionConsequences.js:68`, `systems/combat.js:541`, `systems/economyContracts.js:179`, `systems/factions.js:238`, `systems/flight.js:79`, `systems/flightV3.js:155`, `systems/heat.js:303`, `systems/lootShards.js:543`, `systems/masslineSnares.js:130`, `systems/missions.js:1183`, `systems/onboarding.js:334`, `systems/presentationAdapters.js:205`, `systems/presentationOrchestrator.js:277`, `systems/sectorSim.js:116`, `systems/ships.js:1548`, `systems/story.js:135`, `systems/surrenderRecovery.js:80`, `systems/tetherGameplay.js:242`, `ui/alerts.js:351`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:380`, `ui/screens/crucibleLabControls.js:547`, `ui/uiRoot.js:1240`, `ui/uiRoot.js:1298`, `ui/uiRoot.js:1300` |
| `gamepad:connected` | `systems/gamepad.js:608` | — |
| `gamepad:disconnected` | `systems/gamepad.js:600` | — |
| `gate:range` | `core/physics.js:1097`, `core/physics.js:1101` | `systems/onboarding.js:452`, `systems/presentationOrchestrator.js:180`, `ui/alerts.js:332` |
| `gate:verdict` | `systems/gateControlDirector.js:135` | — |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:565`, `systems/story.js:495`, `systems/story.js:509`, `systems/story.js:541`, `systems/story.js:1238`, `systems/story.js:1585`, `systems/story.js:1753`, `systems/uniqueWrecks.js:1582` | `systems/ships.js:1543`, `ui/screens/codex.js:631` |
| `harasser:disengaged` | `systems/encounterDirector.js:2147` | — |
| `hazard:changed` | `systems/world.js:838` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:879`, `systems/world.js:5230` | `data/hazardLanguage.js:129`, `render/shipMicroMotion.js:1249` |
| `hazard:exit` | `systems/environmentalMachinery.js:888`, `systems/world.js:5237` | `data/hazardLanguage.js:130`, `render/shipMicroMotion.js:1250` |
| `heat:changed` | `systems/heat.js:658` | `audio/audioSystem.js:1946`, `render/vfx.js:2412`, `systems/barkDirector.js:379`, `systems/lawSecurity.js:277`, `systems/onboarding.js:417`, `ui/hud.js:4137` |
| `heat:clear` | — | `systems/heat.js:307` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:847` | `systems/missions.js:1295` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1213` | — |
| `heist:captureFork` | `systems/heistFacilities.js:1468` | `systems/missions.js:1304` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1355` | `systems/missions.js:1300` |
| `heist:launchCue` | `systems/heistFacilities.js:339` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:457`, `systems/heistFacilities.js:466`, `systems/heistFacilities.js:470`, `systems/heistFacilities.js:484` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:1867` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:1809` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:1790` | `systems/npcJobsRuntime.js:955` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:1728` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:249` |
| `hud:firstUse` | `systems/onboarding.js:642` | `ui/hud.js:2089` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:279` |
| `hud:phase` | `systems/story.js:252`, `systems/story.js:282`, `systems/story.js:285`, `systems/story.js:582` | `ui/hudMeta.js:142` |
| `hud:recallObjective` | `ui/input.js:337` | `ui/hud.js:1606` |
| `hud:slotClaim` | `ui/promptDeck.js:229` | `ui/hud.js:1981` |
| `hud:slotRelease` | `ui/promptDeck.js:230` | `ui/hud.js:1982` |
| `hud:tagFlicker` | `systems/story.js:559` | `ui/hudMeta.js:176` |
| `hull:fractured` | `systems/hullFracture.js:292` | — |
| `hullBurst:activated` | `systems/hullBurst.js:162` | — |
| `hullBurst:ended` | `systems/hullBurst.js:180` | — |
| `hullBurst:hit` | `systems/hullBurst.js:274` | — |
| `interdiction:triggered` | `systems/encounterScripts.js:580`, `systems/world.js:4708` | `systems/presentationOrchestrator.js:188`, `systems/sectorSim.js:122` |
| `intervention:available` | `systems/intervention.js:212` | — |
| `intervention:closed` | `systems/intervention.js:265` | — |
| `intervention:jumperRipped` | `systems/intervention.js:384` | — |
| `intervention:logged` | `systems/intervention.js:124` | — |
| `jump:arrive` | `systems/world.js:4649` | `render/feel.js:1286`, `render/shipMicroMotion.js:1254`, `save/saveSystem.js:270`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:186`, `systems/sectorSim.js:137` |
| `jump:chargeAbort` | `systems/world.js:4788`, `systems/world.js:4863`, `systems/world.js:4923` | `render/shipMicroMotion.js:1255`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:185`, `systems/routeFollower.js:324`, `ui/galaxyMap.js:2215`, `ui/toasts.js:395` |
| `jump:chargeStart` | `systems/world.js:4848`, `systems/world.js:4889` | `render/feel.js:1276`, `render/shipMicroMotion.js:1251`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:182`, `systems/story.js:155`, `ui/galaxyMap.js:2214` |
| `jump:chargeTick` | `systems/world.js:4592` | `render/shipMicroMotion.js:1252`, `systems/presentationOrchestrator.js:183` |
| `jump:departurePreflight` | `systems/world.js:4832` | `systems/story.js:154` |
| `jump:start` | `systems/world.js:4609` | `render/feel.js:1280`, `render/shipMicroMotion.js:1253`, `systems/economy.js:1043`, `systems/gateControlDirector.js:66`, `systems/mining.js:204`, `systems/presentationOrchestrator.js:184`, `systems/sectorSim.js:136` |
| `jump:unfiledConfirmed` | `systems/world.js:4907` | `systems/story.js:156` |
| `landmark:artifactRecovered` | `systems/missions.js:4589` | `systems/world.js:592` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:39` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:375` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:70` | `systems/lawSecurity.js:278` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:30` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:31` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:41` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:43`, `systems/heat.js:317`, `ui/impoundPayPrompt.js:32` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:33` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:42` |
| `law:incidentOpened` | — | `systems/traffic.js:1446` |
| `law:killedAdjudicated` | — | `systems/factions.js:253` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:378`, `systems/factions.js:336`, `systems/heat.js:328` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:313` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:377` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:376` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:302` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `systems/lawSecurity.js:266` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:749`, `systems/lootShards.js:1031`, `systems/stuntGrammar.js:110` | `systems/mining.js:198`, `ui/floatingText.js:212`, `ui/floatingText.js:219` |
| `loot:magnetCaptured` | `systems/lootShards.js:612` | — |
| `loot:manifestPayload` | `systems/lootShards.js:1137` | `systems/missions.js:1361` |
| `loot:overflowConverted` | `systems/mining.js:2241` | `audio/audioSystem.js:1884`, `ui/floatingText.js:214` |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:342` | `systems/factionPresence.js:435`, `systems/ships.js:1497` |
| `map:sectorCharted` | `systems/world.js:3700` | `systems/economy.js:982` |
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
| `massline:bridleCut` | `systems/tetherGameplay.js:846` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:791`, `systems/tetherGameplay.js:807`, `systems/tetherGameplay.js:976` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:655` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:709` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:856` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2202` | — |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:2357` | — |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1595` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:1716` | — |
| `massline:recovered` | `systems/tumbleStates.js:222` | — |
| `massline:recovering` | `systems/tumbleStates.js:534` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:165` | — |
| `massline:releaseValidated` | `systems/masslineThrow.js:576` | `systems/presentationOrchestrator.js:163` |
| `massline:releaseWindow` | `systems/masslineThrow.js:226` | — |
| `massline:selfSling` | `systems/masslineThrow.js:603` | `systems/flightV3.js:157`, `systems/onboarding.js:604` |
| `massline:snareArmed` | `systems/masslineSnares.js:223` | — |
| `massline:snareCaught` | `systems/masslineSnares.js:418` | — |
| `massline:snareCut` | `systems/masslineSnares.js:532` | — |
| `massline:snareDeployed` | `systems/masslineSnares.js:325` | — |
| `massline:snareEnded` | `systems/masslineSnares.js:534` | — |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `systems/masslineImpactDamage.js:42`, `systems/presentationOrchestrator.js:150` |
| `massline:threat` | `systems/masslineThreats.js:268` | `systems/presentationOrchestrator.js:126` |
| `massline:throw` | `systems/masslineThrow.js:518` | `systems/lootShards.js:541`, `systems/mines.js:74`, `systems/missions.js:1283`, `systems/tumbleStates.js:98` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:533` | `render/feel.js:1371` |
| `massline:tumbled` | `systems/tumbleStates.js:458` | `render/feel.js:1357` |
| `mines:armed` | `systems/mines.js:175`, `systems/mines.js:208` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:93` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:147`, `systems/survivalArena.js:1051` | `systems/mines.js:73` |
| `mines:placed` | `systems/mines.js:148` | `systems/survivalArena.js:844` |
| `mines:released` | `systems/mines.js:301` | — |
| `mines:triggered` | `systems/mines.js:266` | — |
| `mining:beamLocked` | `systems/mining.js:746` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2093` | `systems/missions.js:1244`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:760` | `systems/presentationOrchestrator.js:208`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:582` | `ui/miningHud.js:206` |
| `mining:npcExtraction` | `systems/traffic.js:9692` | `systems/fieldDepletion.js:704` |
| `mining:podSplit` | `systems/mining.js:1531` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2038` | `render/asteroidMotionPresentation.js:455`, `systems/presentationOrchestrator.js:205`, `ui/miningHud.js:209` |
| `mining:richCoreCompleted` | `systems/mining.js:2071` | `render/asteroidMotionPresentation.js:456`, `systems/presentationOrchestrator.js:206`, `ui/miningHud.js:210` |
| `mining:richCoreExposed` | `systems/mining.js:2016` | `render/asteroidMotionPresentation.js:454`, `systems/presentationOrchestrator.js:204`, `ui/miningHud.js:208` |
| `mining:richCoreFizzle` | `systems/mining.js:2075` | `render/asteroidMotionPresentation.js:457`, `systems/presentationOrchestrator.js:207`, `ui/miningHud.js:211` |
| `mining:seamHit` | `systems/mining.js:2381` | `audio/audioSystem.js:2039`, `systems/presentationOrchestrator.js:197` |
| `mining:start` | `systems/mining.js:285`, `systems/mining.js:407`, `systems/mining.js:1480` | `audio/audioSystem.js:1873`, `render/asteroidMotionPresentation.js:449`, `render/vfx.js:2425`, `systems/missions.js:1352`, `systems/onboarding.js:357`, `systems/presentationOrchestrator.js:194`, `ui/miningHud.js:204` |
| `mining:stop` | `systems/mining.js:530` | `audio/audioSystem.js:1874`, `render/asteroidMotionPresentation.js:450`, `render/vfx.js:2426`, `systems/presentationOrchestrator.js:195`, `ui/miningHud.js:205` |
| `mining:tick` | `systems/automation.js:995`, `systems/mining.js:781` | `audio/audioSystem.js:1875`, `render/vfx.js:2427`, `systems/presentationOrchestrator.js:196`, `ui/miningHud.js:207` |
| `mining:ventBonus` | `systems/mining.js:626` | — |
| `mining:ventReady` | `systems/mining.js:563` | `systems/presentationOrchestrator.js:201` |
| `mining:yield` | `balance/careerCohorts.js:2146`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:621`, `systems/mining.js:974`, `systems/mining.js:1044`, `systems/mining.js:1606`, `systems/mining.js:2068` | `audio/audioSystem.js:2035`, `careers/origins/prospectorOrigin.js:636`, `render/vfx.js:2430`, `systems/encounterDirector.js:300`, `systems/missions.js:1238`, `systems/onboarding.js:358`, `systems/presentationOrchestrator.js:202`, `ui/floatingText.js:196` |
| `miningDrone:sellOre` | — | `systems/economy.js:997` |
| `mission:abandon` | `systems/moralTrap.js:301` | `systems/missions.js:1196` |
| `mission:accepted` | `systems/missions.js:3082` | `audio/audioSystem.js:1907`, `save/saveSystem.js:271`, `systems/aftermathWrecks.js:939`, `systems/contractClauses.js:226`, `systems/economy.js:958`, `systems/moralTrap.js:182`, `systems/onboarding.js:360`, `ui/hud.js:4117`, `ui/screens/missionLog.js:2420`, `ui/wreckChoicePrompt.js:45` |
| `mission:completed` | `systems/missions.js:6874` | `audio/audioSystem.js:1908`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:272`, `systems/aftermathWrecks.js:940`, `systems/claims.js:280`, `systems/contractClauses.js:230`, `systems/factions.js:370`, `systems/lossLedger.js:381`, `systems/onboarding.js:361`, `systems/story.js:177`, `ui/hud.js:4118`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2421` |
| `mission:conditionBroken` | `systems/contractClauses.js:348`, `systems/missions.js:1552` | — |
| `mission:conditionPending` | `systems/missions.js:1605` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:316`, `systems/missions.js:1535` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:327`, `systems/missions.js:1543` | `systems/missions.js:1335` |
| `mission:expired` | `systems/missions.js:7284` | `audio/audioSystem.js:1912`, `save/saveSystem.js:274`, `systems/aftermathWrecks.js:942`, `systems/factions.js:379`, `ui/screens/missionLog.js:2423` |
| `mission:failed` | `systems/missions.js:7232` | `audio/audioSystem.js:1911`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:273`, `systems/aftermathWrecks.js:941`, `systems/factions.js:378`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2422` |
| `mission:forceEvent` | — | `systems/economy.js:1051` |
| `mission:offerBoarded` | `systems/missions.js:2349` | `systems/aftermathWrecks.js:938`, `systems/economyContracts.js:174` |
| `mission:offered` | `systems/aftermathWrecks.js:1669`, `systems/alienEcology.js:334`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:255`, `systems/lossLedger.js:318`, `systems/postEndingReplay.js:340`, `systems/salvage.js:616`, `systems/uniqueWrecks.js:892` | `systems/economy.js:957`, `systems/lossInvestigation.js:106`, `systems/missions.js:1201`, `systems/survivorPod.js:445` |
| `mission:setPieceTransition` | `systems/missions.js:6692` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:8966` | — |
| `mission:spawnDeferred` | `systems/missions.js:7959` | — |
| `mission:updated` | `systems/contractClauses.js:321`, `systems/contractClauses.js:331`, `systems/contractClauses.js:360`, `systems/missions.js:1539`, `systems/missions.js:1547`, `systems/missions.js:1565`, `systems/missions.js:1640`, `systems/missions.js:1759`, `systems/missions.js:1860`, `systems/missions.js:1930`, `systems/missions.js:2160`, `systems/missions.js:2194`, `systems/missions.js:2206`, `systems/missions.js:2348`, `systems/missions.js:3009`, `systems/missions.js:3094`, `systems/missions.js:3244`, `systems/missions.js:3452`, `systems/missions.js:4131`, `systems/missions.js:4167`, `systems/missions.js:4180`, `systems/missions.js:4188`, `systems/missions.js:4204`, `systems/missions.js:4250`, `systems/missions.js:4324`, `systems/missions.js:4426`, `systems/missions.js:4466`, `systems/missions.js:4475`, `systems/missions.js:4661`, `systems/missions.js:4687`, `systems/missions.js:4755`, `systems/missions.js:4771`, `systems/missions.js:4815`, `systems/missions.js:4836`, `systems/missions.js:4872`, `systems/missions.js:4924`, `systems/missions.js:5104`, `systems/missions.js:6112`, `systems/missions.js:6267`, `systems/missions.js:6328`, `systems/missions.js:6401`, `systems/missions.js:6408`, `systems/missions.js:6863`, `systems/missions.js:7255`, `systems/missions.js:7300`, `systems/missions.js:7636`, `systems/missions.js:7932`, `systems/missions.js:7950`, `systems/missions.js:8087`, `systems/missions.js:8158`, `systems/missions.js:8240`, `systems/missions.js:8307`, `systems/missions.js:8511`, `systems/missions.js:8544`, `systems/missions.js:8559`, `systems/missions.js:8573`, `systems/missions.js:8806`, `systems/missions.js:8825`, `systems/missions.js:8853`, `systems/missions.js:9134`, `systems/missions.js:9416`, `systems/missions.js:9562` | `ui/hud.js:4116`, `ui/screens/missionLog.js:2419`, `ui/station/screens/contracts.js:1394` |
| `mode:changed` | `main.js:254`, `main.js:893`, `main.js:903`, `main.js:914`, `save/saveSystem.js:3022`, `save/saveSystem.js:3160` | `systems/autoTargetAssist.js:96`, `systems/presentationAdapters.js:204`, `systems/scanner.js:842`, `ui/loadingPresenter.js:423`, `ui/screenManager.js:601`, `ui/uiRoot.js:799`, `ui/wingmanRadial.js:299` |
| `module:equipped` | `systems/ships.js:2137` | `systems/onboarding.js:397`, `systems/ships.js:1446`, `systems/world.js:560` |
| `module:granted` | `systems/ships.js:1936` | — |
| `module:purchased` | `systems/ships.js:1923` | — |
| `module:unequipped` | `systems/ships.js:1603`, `systems/ships.js:2156` | `systems/ships.js:1447`, `systems/world.js:561` |
| `moment:amended` | `systems/bulletTime.js:240` | — |
| `moment:holyShit` | — | `render/feel.js:1346` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:292` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | — |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:181` |
| `moralTrap:resolved` | `systems/moralTrap.js:297` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:245` | `ui/moralTrapPrompt.js:37` |
| `namedAce:appeared` | `systems/encounterScripts.js:2770` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:306` |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:404`, `systems/flightV3.js:1005`, `systems/world.js:4981` | `systems/routeFollower.js:319` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:3467`, `systems/claims.js:1435`, `systems/claims.js:1443`, `systems/missions.js:1215`, `systems/missions.js:3441`, `systems/missions.js:3508`, `systems/missions.js:3540`, `systems/missions.js:4149`, `systems/world.js:4980`, `ui/market/tradeLogic.js:484` | — |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:123` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:188` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:119` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `news:dockCards` | `ui/marketNews.js:364` | — |
| `news:headline` | `systems/aftermathWrecks.js:781`, `systems/e1EncounterRuntime.js:225`, `systems/nemesisSignals.js:25`, `systems/traffic.js:9340`, `systems/traffic.js:11087`, `ui/marketNews.js:256` | — |
| `news:publish` | `systems/aftermathWrecks.js:799`, `systems/choirReliefBerth.js:181`, `systems/claims.js:1871`, `systems/claims.js:2289`, `systems/claims.js:2336`, `systems/memorialThief.js:126`, `systems/npcJobsRuntime.js:1114`, `systems/traffic.js:3727`, `systems/traffic.js:10698`, `systems/uniqueWrecks.js:482`, `systems/uniqueWrecks.js:1626`, `systems/world.js:847` | — |
| `news:render` | `ui/hud.js:1518` | — |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:4777` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1431` |
| `npcjobs:load` | — | `systems/traffic.js:1429` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1090` | — |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1083` | — |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1071` | — |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1069` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3094` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:4182` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:4254` | — |
| `npcjobs:unload` | — | `systems/traffic.js:1430` |
| `npcjobs:work` | — | `systems/traffic.js:1428` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:4349` | — |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:4370` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:1689`, `systems/onboarding.js:2493` | — |
| `optic:beamContact` | `systems/combat.js:1167` | — |
| `optic:contact` | `systems/weapons.js:2060`, `systems/weapons.js:2121` | `audio/audioSystem.js:1834` |
| `optic:rekindled` | — | `audio/audioSystem.js:1835` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1072` | `systems/world.js:567` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1879` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1097` | — |
| `orrinWitness:submitted` | `systems/story.js:1125` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:5984` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:569` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:5780` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:5815` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:5944` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:5898` | `ui/recoveryEncounterPrompt.js:478` |
| `patrol:proximity` | `systems/encounterScripts.js:427` | `systems/economy.js:1044`, `systems/moralTrap.js:180` |
| `pds:intercept` | `systems/countermeasures.js:324` | — |
| `physics:attachmentBroken` | — | `combat/kernel.js:179` |
| `physics:impact` | `core/physics.js:1634` | `audio/audioSystem.js:1829`, `render/asteroidMotionPresentation.js:446`, `render/feel.js:1323`, `render/shipMicroMotion.js:1248`, `render/vfx.js:2382`, `systems/asteroidSites.js:290`, `systems/barkDirector.js:382`, `systems/collisionConsequences.js:62`, `systems/fields.js:437`, `systems/fragileCargo.js:281`, `systems/gamepad.js:506`, `systems/heistFacilities.js:248`, `systems/impulseCharges.js:232`, `systems/lootShards.js:540`, `systems/masslineImpactDamage.js:43`, `systems/ships.js:1520` |
| `pickup:collected` | `core/physics.js:1474`, `systems/mining.js:1278`, `systems/mining.js:2179`, `systems/uniqueWrecks.js:1507` | `audio/audioSystem.js:1883`, `render/vfx.js:2456`, `save/saveSystem.js:228`, `systems/economy.js:1014`, `systems/encounterDirector.js:277`, `systems/lawSecurity.js:269`, `systems/mining.js:200`, `systems/onboarding.js:359`, `systems/onboarding.js:416`, `systems/presentationOrchestrator.js:209`, `systems/swarmSupply.js:107`, `systems/traffic.js:1439`, `systems/world.js:570`, `systems/world.js:571`, `systems/world.js:633`, `ui/floatingText.js:238` |
| `pirateDisengage:triggered` | — | `systems/combatOutcome.js:187` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:132` | `systems/pirateParley.js:95` |
| `pirateParley:demand` | `systems/scanner.js:1255` | `ui/pirateParleyPrompt.js:160` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:186`, `ui/pirateParleyPrompt.js:161` |
| `pirateParley:started` | — | `systems/combatOutcome.js:185` |
| `planet:collector` | `systems/planetRuntime.js:507` | — |
| `planet:harvest` | `systems/planetRuntime.js:540` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:544` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:407`, `systems/planetRuntime.js:419` | — |
| `planet:recoveryBurn` | `systems/planetRuntime.js:485` | — |
| `planet:registered` | `systems/planetRuntime.js:195` | — |
| `planet:unregistered` | `systems/planetRuntime.js:256` | — |
| `player:death` | `systems/combat.js:656`, `systems/combat.js:786`, `systems/combat.js:966`, `systems/world.js:5348` | `audio/audioSystem.js:1871`, `render/feel.js:1231`, `render/shipMicroMotion.js:1259`, `render/vfx.js:2424`, `save/saveSystem.js:235`, `systems/aftermathWrecks.js:930`, `systems/lawSecurity.js:268`, `systems/missions.js:1329`, `systems/onboarding.js:390`, `systems/onboarding.js:415`, `systems/surrenderRecovery.js:75`, `systems/survivalResults.js:455`, `systems/survivalRun.js:123`, `systems/survivorPod.js:451`, `ui/commandBar.js:405`, `ui/hud.js:2557`, `ui/survivalHud.js:225` |
| `player:recoveryFailed` | `systems/combat.js:839` | `ui/screens/gameOver.js:436` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:379` | `systems/combat.js:535` |
| `player:respawn` | `systems/combat.js:903`, `systems/combat.js:979` | `audio/audioSystem.js:1872`, `render/shipMicroMotion.js:1258`, `save/saveSystem.js:236`, `save/saveSystem.js:286`, `ui/commandBar.js:409`, `ui/hud.js:2571`, `ui/screens/gameOver.js:428` |
| `player:scannedByPatrol` | `systems/economy.js:2853` | `render/vfx.js:2411`, `systems/missions.js:1319`, `ui/customsPrompt.js:147` |
| `poi:discovered` | `systems/world.js:876`, `systems/world.js:5114`, `systems/world.js:5186`, `systems/world.js:5502`, `systems/world.js:5528` | `systems/encounterDirector.js:294`, `systems/world.js:598` |
| `poi:identified` | `systems/world.js:5193`, `systems/world.js:5529` | `systems/encounterDirector.js:295`, `systems/missions.js:1202`, `systems/world.js:599` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2442` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2441` |
| `presentation:audioCue` | `render/vfx.js:5474`, `systems/presentationAdapters.js:557` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:473` | — |
| `presentation:caption` | `audio/audioSystem.js:4709`, `systems/factionPresence.js:773`, `systems/factionPresence.js:1112`, `systems/factionPresence.js:1127`, `systems/factionPresence.js:1145`, `systems/factionPresence.js:1207`, `systems/presentationAdapters.js:649`, `systems/story.js:1016`, `systems/story.js:1180` | `ui/hud.js:2620` |
| `presentation:cue` | — | `audio/audioSystem.js:1985`, `render/vfx.js:2450`, `render/vfx.js:2451`, `render/vfx.js:2452`, `systems/presentationAdapters.js:201` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:455` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:376`, `systems/presentationAdapters.js:628` | — |
| `presentation:vfxCue` | `render/vfx.js:2469`, `systems/countermeasures.js:332`, `systems/fields.js:2218`, `systems/fields.js:2237`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:525`, `systems/missions.js:3107`, `systems/missions.js:6879`, `systems/planetRuntime.js:564`, `systems/presentationAdapters.js:519`, `systems/tumbleStates.js:460`, `systems/tumbleStates.js:513`, `systems/weapons.js:1604`, `systems/weapons.js:1781`, `systems/weapons.js:2789` | `render/vfx.js:2455` |
| `projectile:bank` | — | `render/vfx.js:2376` |
| `projectile:hit` | `core/physics.js:821`, `core/physics.js:995`, `systems/sectorSim.js:637` | `audio/audioSystem.js:1819`, `combat/tetherWebs.js:27`, `render/vfx.js:2375`, `systems/bombs.js:263`, `systems/combat.js:528`, `systems/missions.js:1284` |
| `projectile:nearMiss` | `core/physics.js:955` | `audio/audioSystem.js:1822`, `systems/presentationOrchestrator.js:174`, `ui/hud.js:2016` |
| `projectile:ricochet` | — | `render/vfx.js:2377` |
| `range:opened` | `ui/screens/range.js:1641` | `systems/onboarding.js:402` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:157` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:158` |
| `rescue:beat` | `systems/onboarding.js:1865`, `systems/onboarding.js:1897` | — |
| `rescue:complete` | `systems/onboarding.js:1876` | — |
| `rescue:started` | `systems/onboarding.js:1460` | `systems/onboarding.js:391` |
| `research:pointsChanged` | `systems/missions.js:4499`, `systems/missions.js:4551`, `systems/missions.js:6822`, `systems/missions.js:6830`, `systems/missions.js:9376` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2449` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1166` | `systems/encounterDirector.js:301` |
| `rhythm:phase` | `systems/encounterDirector.js:440` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:317` | — |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:114` |
| `run:awardRequested` | — | `systems/runSession.js:53` |
| `run:awarded` | — | `ui/survivalHud.js:205` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1096`, `ui/sandbox/sandboxSetup.js:1135` | `systems/runSession.js:50` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:725`, `ui/screens/crucibleDraft.js:730`, `ui/screens/crucibleDraft.js:1140` | `systems/survivalDraft.js:99` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:814` | `systems/survivalDraft.js:103` |
| `run:draftResolved` | — | `systems/survivalRun.js:117` |
| `run:endRequested` | `save/saveSystem.js:199` | `systems/runSession.js:52` |
| `run:ended` | — | `systems/survivalAnnounce.js:298`, `systems/survivalArena.js:836`, `systems/survivalDraft.js:108`, `systems/survivalResults.js:484`, `systems/survivalRun.js:111`, `systems/survivalWave.js:131`, `systems/swarmArena.js:429`, `systems/swarmChain.js:108`, `systems/swarmSupply.js:109` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:120` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:296`, `ui/survivalHud.js:206` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1157` | `systems/ships.js:1552`, `systems/survivalRun.js:112`, `systems/swarmSupply.js:102`, `systems/world.js:594` |
| `run:modifierChosen` | — | `systems/survivalRun.js:118` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:55` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1158` | `systems/survivalRun.js:113` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1235`, `ui/screens/crucibleDraft.js:1252` | `systems/survivalDraft.js:100` |
| `run:refitClosed` | — | `systems/survivalRun.js:119` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:1593` | `systems/survivalDraft.js:101` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:1589` | `systems/survivalDraft.js:102` |
| `run:resultsReady` | — | `systems/achievements.js:785`, `ui/uiRoot.js:1276` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:107` |
| `run:spendRequested` | — | `systems/runSession.js:54` |
| `run:spent` | — | `systems/survivalDraft.js:106` |
| `run:started` | — | `sim/killcamTape.js:425`, `systems/survivalAnnounce.js:291`, `systems/survivalResults.js:444`, `systems/survivalRun.js:109`, `ui/survivalHud.js:207`, `ui/uiRoot.js:1297` |
| `run:threatRequested` | — | `systems/runSession.js:56` |
| `run:transitionRequested` | `systems/survivalRun.js:497` | `systems/runSession.js:51` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:297`, `systems/survivalDraft.js:98`, `systems/survivalResults.js:483`, `systems/survivalRun.js:110`, `systems/survivalWave.js:130`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:295`, `systems/survivalArena.js:835`, `systems/survivalResults.js:447` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:115` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:294` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:456` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:292`, `systems/survivalArena.js:802`, `systems/survivalWave.js:128`, `systems/swarmArena.js:426`, `ui/survivalHud.js:218` |
| `run:waveProgress` | — | `ui/survivalHud.js:219` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:293`, `systems/survivalResults.js:446`, `systems/survivalWave.js:129`, `systems/swarmArena.js:427` |
| `salvage:actionRead` | `systems/salvageActions.js:212` | — |
| `salvage:claimJumped` | `systems/mining.js:1745` | `systems/missions.js:1353` |
| `salvage:communicatorFound` | `systems/salvage.js:617` | `systems/encounterDirector.js:296`, `systems/story.js:202`, `ui/wreckChoicePrompt.js:44` |
| `salvage:completed` | `systems/mining.js:1619` | `render/vfx.js:2429`, `systems/aftermathWrecks.js:935`, `systems/lawSecurity.js:275`, `systems/missions.js:1242`, `systems/missions.js:1354` |
| `salvage:cookerFlight` | `systems/salvageActions.js:459` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:595` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:261` | — |
| `salvage:cutComplete` | `systems/mining.js:435` | `audio/audioSystem.js:1891`, `render/vfx.js:2428` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | `systems/salvage.js:91` |
| `salvage:npcExtraction` | `systems/traffic.js:7066` | — |
| `salvage:npcUnload` | `systems/traffic.js:10821` | `systems/economy.js:1018` |
| `salvage:placed` | `systems/salvage.js:351` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:443` |
| `salvage:reactorBurst` | `systems/salvageActions.js:702` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:317` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:227` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:127` |
| `save:backup` | `save/saveSystem.js:1171` | — |
| `save:completed` | `save/saveSystem.js:1177` | `ui/screens/saveLoad.js:828`, `ui/uiRoot.js:355` |
| `save:dirty` | — | `save/saveSystem.js:212` |
| `save:error` | `main.js:158`, `save/saveSystem.js:786`, `save/saveSystem.js:887`, `save/saveSystem.js:905`, `save/saveSystem.js:1181`, `save/saveSystem.js:1449`, `save/saveSystem.js:1911`, `save/saveSystem.js:2664`, `save/saveSystem.js:2672`, `save/saveSystem.js:2707`, `save/saveSystem.js:2717`, `save/saveSystem.js:2733`, `save/saveSystem.js:2800`, `save/saveSystem.js:2833`, `save/saveSystem.js:2870`, `save/saveSystem.js:2919`, `save/saveSystem.js:3183`, `save/saveSystem.js:3191`, `save/saveSystem.js:3218`, `save/saveSystem.js:3692`, `save/saveSystem.js:3705`, `save/saveSystem.js:3720`, `save/saveSystem.js:3733`, `ui/screens/saveLoad.js:1280` | `systems/aftermathWrecks.js:947`, `systems/asteroidSites.js:289`, `systems/automation.js:554`, `systems/encounterDirector.js:269`, `ui/loadingPresenter.js:434`, `ui/screenManager.js:602`, `ui/uiRoot.js:381` |
| `save:exportRecovery` | `save/saveSystem.js:3681` | — |
| `save:loaded` | `save/saveSystem.js:3163` | `audio/audioSystem.js:2134`, `audio/bombAudio.js:362`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:226`, `core/physics.js:130`, `main.js:214`, `render/feel.js:1147`, `render/shipMicroMotion.js:1243`, `render/vfx.js:2418`, `save/saveSystem.js:248`, `save/saveSystem.js:264`, `systems/aftermathWrecks.js:946`, `systems/aiEncounter.js:132`, `systems/asteroidFormations.js:124`, `systems/asteroidSites.js:280`, `systems/autoTargetAssist.js:111`, `systems/automation.js:549`, `systems/barkDirector.js:362`, `systems/beacons.js:45`, `systems/bombs.js:262`, `systems/collisionConsequences.js:67`, `systems/combat.js:542`, `systems/combatOutcome.js:162`, `systems/countermeasures.js:139`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:84`, `systems/economy.js:1055`, `systems/encounterDirector.js:268`, `systems/environmentalMachinery.js:158`, `systems/factionPresence.js:441`, `systems/fields.js:425`, `systems/flight.js:75`, `systems/flightV3.js:148`, `systems/gateControlDirector.js:71`, `systems/heat.js:304`, `systems/heistFacilities.js:252`, `systems/impulseCharges.js:240`, `systems/lawSecurity.js:265`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:131`, `systems/mines.js:78`, `systems/missions.js:1185`, `systems/npcJobsRuntime.js:898`, `systems/npcJobsRuntime.js:906`, `systems/npcJobsRuntime.js:952`, `systems/onboarding.js:338`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:208`, `systems/presentationOrchestrator.js:278`, `systems/routeFollower.js:336`, `systems/runSession.js:61`, `systems/salvageActions.js:131`, `systems/sectorSim.js:115`, `systems/ships.js:1457`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:96`, `systems/story.js:136`, `systems/survivalArena.js:850`, `systems/survivorPod.js:449`, `systems/tetherGameplay.js:240`, `systems/titles.js:399`, `systems/traffic.js:1454`, `systems/travelLanes.js:483`, `systems/tumbleStates.js:109`, `systems/uniqueLootAbilities.js:136`, `systems/world.js:579`, `ui/alerts.js:352`, `ui/automationPayoff.js:76`, `ui/bandHud.js:91`, `ui/capitalBossOverlayMount.js:93`, `ui/cargoConscience.js:146`, `ui/hudLayout.js:120`, `ui/moralTrapPrompt.js:43`, `ui/priceHistory.js:147`, `ui/uiRoot.js:362`, `ui/uiRoot.js:1301`, `ui/wreckChoicePrompt.js:51` |
| `save:recovered` | `save/saveSystem.js:2696` | `ui/uiRoot.js:374` |
| `save:restoring` | `save/saveSystem.js:2941` | `core/coreSystem.js:223`, `render/feel.js:1146`, `render/vfx.js:2417`, `systems/aftermathWrecks.js:945`, `systems/asteroidSites.js:272`, `systems/autoTargetAssist.js:108`, `systems/automation.js:543`, `systems/cloak.js:73`, `systems/encounterDirector.js:261`, `systems/environmentalMachinery.js:157`, `systems/lawSecurity.js:264`, `systems/missions.js:1189`, `systems/npcJobsRuntime.js:899`, `systems/runSession.js:60`, `systems/salvage.js:84`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:76`, `systems/traffic.js:1447`, `systems/world.js:572` |
| `save:started` | `save/saveSystem.js:890`, `save/saveSystem.js:1503` | `ui/screenManager.js:609`, `ui/uiRoot.js:351` |
| `scan:completed` | `balance/careerCohorts.js:497`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:980`, `systems/world.js:5118` | `careers/origins/prospectorOrigin.js:633`, `systems/asteroidFormations.js:130`, `systems/missions.js:1255`, `systems/onboarding.js:371`, `systems/presentationOrchestrator.js:190`, `systems/salvage.js:81`, `systems/salvageActions.js:126`, `systems/story.js:191`, `systems/story.js:192`, `systems/world.js:625`, `ui/hud.js:4585` |
| `scan:debrisCache` | `systems/mining.js:1661`, `systems/scanReveal.js:184` | — |
| `scan:pulse` | `systems/scanner.js:907` | `render/shipMicroMotion.js:1268`, `systems/buildIdentity.js:277`, `systems/cloak.js:90`, `systems/encounterDirector.js:286`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:189`, `systems/scanReveal.js:34`, `ui/hud.js:4586` |
| `scan:shipRevealed` | `systems/scanReveal.js:57` | `systems/buildIdentity.js:276` |
| `scan:weakPoint` | `systems/scanner.js:969` | `ui/hud.js:1563` |
| `scan:wreckInvestigated` | `systems/scanReveal.js:89` | — |
| `scan:wreckResolved` | `systems/scanner.js:929` | `systems/lawSecurity.js:274` |
| `scan:wreckRevealed` | `systems/scanReveal.js:85` | — |
| `scanner:ghostEscaped` | `systems/scanner.js:887` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:948` | — |
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
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:988` | `audio/audioSystem.js:1958`, `audio/bombAudio.js:359`, `render/shipMicroMotion.js:1242`, `render/vfx.js:2413`, `save/saveSystem.js:269`, `systems/aftermathWrecks.js:933`, `systems/aiEncounter.js:133`, `systems/asteroidFormations.js:123`, `systems/asteroidSites.js:256`, `systems/automation.js:579`, `systems/bombs.js:254`, `systems/claims.js:275`, `systems/claims.js:277`, `systems/combatOutcome.js:177`, `systems/difficultyDirector.js:170`, `systems/economy.js:1037`, `systems/encounterDirector.js:257`, `systems/factionPresence.js:432`, `systems/fields.js:423`, `systems/heistFacilities.js:245`, `systems/intervention.js:71`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:128`, `systems/mines.js:76`, `systems/mining.js:207`, `systems/missions.js:1346`, `systems/moralTrap.js:178`, `systems/npcJobsRuntime.js:887`, `systems/onboarding.js:466`, `systems/presentationOrchestrator.js:228`, `systems/routeFollower.js:328`, `systems/salvage.js:77`, `systems/salvageActions.js:134`, `systems/sectorSim.js:112`, `systems/story.js:153`, `systems/story.js:190`, `systems/survivalArena.js:848`, `systems/survivorPod.js:444`, `systems/tetherGameplay.js:244`, `systems/traffic.js:1417`, `systems/wingmen.js:96`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:150`, `ui/securityReadout.js:157` |
| `sector:entered` | — | `systems/dockingCorridor.js:82` |
| `sector:exit` | `systems/world.js:918` | `audio/bombAudio.js:358`, `render/vfx.js:2414`, `systems/aftermathWrecks.js:934`, `systems/asteroidSites.js:262`, `systems/automation.js:568`, `systems/bombs.js:253`, `systems/dockingCorridor.js:81`, `systems/encounterDirector.js:259`, `systems/environmentalMachinery.js:155`, `systems/factionPresence.js:433`, `systems/fields.js:422`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:246`, `systems/impulseCharges.js:241`, `systems/lawSecurity.js:263`, `systems/massSeed.js:118`, `systems/masslineSnares.js:127`, `systems/mines.js:75`, `systems/mining.js:205`, `systems/missions.js:1347`, `systems/npcJobsRuntime.js:886`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:111`, `systems/spawnBudget.js:50`, `systems/stationServices.js:207`, `systems/stationSideEventDirector.js:95`, `systems/surrenderRecovery.js:74`, `systems/survivalArena.js:849`, `systems/tetherGameplay.js:243`, `systems/traffic.js:1420`, `systems/wingmen.js:99`, `ui/customsPrompt.js:149`, `ui/impoundPayPrompt.js:34`, `ui/promptDeck.js:707`, `ui/wreckChoicePrompt.js:49` |
| `sectorsim:embodiment` | `systems/sectorSim.js:894` | `systems/world.js:609` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:341` | `ui/screens/starmap.js:823` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1719`, `systems/claims.js:1398`, `systems/encounterDirector.js:1860`, `systems/mining.js:2333` | `systems/sectorSim.js:120`, `systems/world.js:624` |
| `sectorsim:intel` | `systems/sectorSim.js:948` | `systems/world.js:614` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:732` | `systems/economy.js:1059` |
| `sectorsim:reconcile` | `systems/sectorSim.js:685` | `systems/world.js:615` |
| `sectorsim:tick` | `systems/sectorSim.js:286` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:648` | `ui/screens/starmap.js:824` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:543` | — |
| `service:aborted` | `systems/stationServices.js:256` | — |
| `service:completed` | `systems/economy.js:2600`, `systems/economy.js:2632`, `systems/economy.js:2678`, `systems/stationServices.js:475`, `systems/stationServices.js:491` | `systems/ships.js:1524` |
| `service:progress` | `systems/stationServices.js:417` | — |
| `service:queued` | `systems/stationServices.js:324` | — |
| `service:started` | `systems/stationServices.js:406` | — |
| `settings:changed` | `save/saveSystem.js:3199`, `save/saveSystem.js:3200`, `systems/touch.js:627`, `ui/screens/motionAsk.js:95`, `ui/screens/pause.js:591`, `ui/screens/pause.js:599`, `ui/screens/pause.js:677`, `ui/screens/settings.js:368`, `ui/screens/settings.js:736`, `ui/screens/settings.js:812` | `audio/audioSystem.js:2074`, `main.js:213`, `render/vfx.js:2420`, `save/saveSystem.js:206`, `ui/uiRoot.js:667` |
| `ship:appearanceChanged` | `systems/ships.js:1801`, `systems/ships.js:2061`, `systems/traffic.js:3265` | `core/coreSystem.js:222`, `render/vfx.js:2408` |
| `ship:appearanceSaved` | `systems/ships.js:2063` | `ui/station/screens/shipworks.js:666` |
| `ship:boostPreKick` | `systems/flightV3.js:395` | `render/feel.js:1258` |
| `ship:boostStart` | `systems/flight.js:106`, `systems/flightV3.js:199` | `audio/audioSystem.js:1965`, `render/vfx.js:2436`, `systems/cruise.js:58`, `systems/onboarding.js:403` |
| `ship:boostStop` | `systems/flight.js:107`, `systems/flight.js:220`, `systems/flightV3.js:200`, `systems/flightV3.js:487` | `audio/audioSystem.js:1970`, `render/vfx.js:2437` |
| `ship:cargoCapChanged` | `systems/ships.js:1796` | — |
| `ship:dash` | `systems/flight.js:197`, `systems/flightV3.js:466` | `audio/audioSystem.js:1971`, `render/vfx.js:2438`, `systems/uniqueLootAbilities.js:134` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2209` | `render/vfx.js:2460` |
| `ship:deathPop` | `render/shipMicroMotion.js:994`, `render/shipMicroMotion.js:2199` | `render/vfx.js:2459` |
| `ship:livingHullChanged` | `systems/ships.js:1625`, `systems/ships.js:1677`, `systems/story.js:1704` | `systems/barkDirector.js:365` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2300` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2273` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2232` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2203` | — |
| `ship:massChanged` | `systems/ships.js:1952` | `ui/hud.js:4115` |
| `ship:purchased` | `systems/ships.js:1988` | `audio/audioSystem.js:1950`, `systems/missions.js:1364` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1043`, `render/shipMicroMotion.js:2186` | `render/vfx.js:2458` |
| `ship:roleContext` | `systems/ships.js:1735` | `systems/presentationAdapters.js:203` |
| `ship:sold` | `systems/ships.js:2015` | — |
| `ship:statsChanged` | `systems/ships.js:1795` | `systems/world.js:562`, `ui/commandBar.js:410`, `ui/hud.js:4111` |
| `ship:swingDash` | `systems/flightV3.js:467` | `render/shipMicroMotion.js:1262` |
| `ship:thrust` | `systems/flight.js:431`, `systems/flightV3.js:1509` | `render/vfx.js:2435` |
| `ships:grantModule` | — | `systems/ships.js:1450` |
| `signal:investigate` | — | `systems/scanner.js:835` |
| `signal:investigated` | `systems/scanner.js:1471` | `systems/missions.js:1269`, `systems/presentationOrchestrator.js:193`, `systems/story.js:138`, `systems/world.js:565`, `ui/signalInvestigationPrompt.js:176` |
| `signal:investigating` | `systems/scanner.js:1214` | `ui/signalInvestigationPrompt.js:175` |
| `signal:receipt` | `systems/scanner.js:1472` | — |
| `signal:scanResults` | `systems/scanner.js:981` | `systems/missions.js:1256`, `systems/presentationOrchestrator.js:191`, `systems/story.js:193`, `ui/signalInvestigationPrompt.js:173` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:836` |
| `signal:track` | — | `systems/scanner.js:834` |
| `signal:tracked` | `systems/scanner.js:1231` | `systems/presentationOrchestrator.js:192`, `ui/signalInvestigationPrompt.js:174` |
| `sim:pause` | `ui/screenManager.js:426` | `audio/audioSystem.js:2090`, `audio/bombAudio.js:365`, `render/feel.js:1144` |
| `sim:resume` | `ui/screenManager.js:433` | `audio/audioSystem.js:2091` |
| `site:anchored` | `systems/asteroidSites.js:987` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1974` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1889` | `audio/audioSystem.js:2112` |
| `site:courierLost` | `systems/asteroidSites.js:1962` | — |
| `site:created` | `systems/asteroidSites.js:925` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1333`, `systems/asteroidSites.js:1417` | — |
| `site:lost` | `systems/asteroidSites.js:1530` | `ui/alerts.js:342` |
| `site:machineInstalled` | `systems/asteroidSites.js:956` | `audio/audioSystem.js:2111`, `ui/alerts.js:341` |
| `site:machineMode` | `systems/asteroidSites.js:1439` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1350` | — |
| `site:machineStatus` | `systems/asteroidSites.js:1830` | `audio/audioSystem.js:2116`, `ui/alerts.js:337` |
| `site:overlayChanged` | `systems/asteroidSites.js:1423` | — |
| `site:podBuilt` | `systems/asteroidSites.js:1778` | — |
| `site:producing` | `systems/asteroidSites.js:1217` | `ui/asteroid/asteroidScreen.js:1790` |
| `site:rematerialized` | `systems/asteroidSites.js:1578` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1135` | `ui/asteroid/asteroidScreen.js:1775` |
| `site:surveyComplete` | `systems/asteroidSites.js:1078` | `ui/asteroid/asteroidScreen.js:1769` |
| `site:surveyDetected` | `systems/asteroidSites.js:1068` | `ui/asteroid/asteroidScreen.js:1762` |
| `spawn:request` | `systems/automation.js:1492` | `systems/world.js:593` |
| `station:berthAssigned` | `systems/stationServices.js:386` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:228` | — |
| `station:exitRequest` | `ui/screenManager.js:566`, `ui/uiRoot.js:1176` | `ui/station/stationApp.js:1284` |
| `station:holding` | `systems/stationServices.js:390` | — |
| `station:moduleGained` | `systems/claims.js:1864` | `systems/factions.js:402` |
| `station:navigate` | `ui/screens/automationPanel.js:1502`, `ui/station/screens/bar.js:765`, `ui/station/screens/bar.js:770`, `ui/station/screens/industry.js:450` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:257` | `render/vfx.js:2434` |
| `station:throughput` | `systems/claims.js:1834` | — |
| `station:yardChanged` | `systems/stationServices.js:544` | — |
| `stationContact:changed` | `systems/stationContacts.js:309`, `systems/stationContacts.js:345`, `systems/stationContacts.js:427`, `systems/stationContacts.js:451` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:245`, `systems/stationContacts.js:468` | — |
| `stationContact:counterDelta` | `systems/missions.js:6677` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:333` | — |
| `story:beatAdvanced` | `systems/missions.js:9402` | `save/saveSystem.js:276`, `systems/story.js:131`, `ui/screens/codex.js:629` |
| `story:elroyResolved` | `systems/missions.js:4961` | `systems/story.js:132` |
| `story:kurtzLedger` | `systems/story.js:1461`, `systems/story.js:1472` | — |
| `story:newGamePlusStarted` | `systems/story.js:1625` | `systems/titles.js:403`, `ui/hudMeta.js:104` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1686` | — |
| `story:postEndingContinuity` | `systems/story.js:1361` | — |
| `story:postEndingProgress` | `systems/story.js:1331` | `ui/screens/missionLog.js:2439` |
| `story:replayHookUnlocked` | `systems/story.js:1346` | `ui/screens/missionLog.js:2440` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:369` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:368` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1159` | — |
| `story:vergeObserversRevealed` | `systems/story.js:1015` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1179` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:194` | — |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:179` | — |
| `stunt:salvageRights` | `systems/stuntGrammar.js:104` | — |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:126` | — |
| `stunt:styleBanked` | `systems/stuntGrammar.js:91` | `audio/audioSystem.js:1888`, `ui/stuntCallout.js:424` |
| `stunt:trickAmended` | — | `systems/bulletTime.js:134`, `systems/survivalResults.js:450`, `systems/titles.js:402`, `ui/stuntCallout.js:423` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:1887`, `systems/bulletTime.js:133`, `systems/survivalResults.js:449`, `systems/titles.js:401`, `ui/stuntCallout.js:422`, `ui/toasts.js:372` |
| `surrender:escaped` | — | `systems/combatOutcome.js:183` |
| `surrender:secured` | — | `systems/traffic.js:1436` |
| `surrender:tethered` | — | `systems/traffic.js:1435` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1020` | — |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:132` | `systems/survivorPod.js:446` |
| `survivorPod:delivered` | `systems/traffic.js:6402` | — |
| `survivorPod:ejected` | `systems/survivorPod.js:649`, `systems/survivorPod.js:780` | `systems/lawSecurity.js:262` |
| `survivorPod:promoted` | `systems/survivorPod.js:1069` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1176` | `ui/wreckChoicePrompt.js:48` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1188` | `systems/missions.js:1324`, `ui/wreckChoicePrompt.js:46` |
| `survivorPod:rescued` | — | `systems/traffic.js:1441` |
| `survivorPod:resolved` | `systems/survivorPod.js:946` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1227` | `systems/missions.js:1326`, `ui/wreckChoicePrompt.js:47` |
| `swarm:chain` | — | `systems/survivalResults.js:459`, `ui/survivalHud.js:220` |
| `swarm:chainBest` | — | `systems/survivalResults.js:472` |
| `swarm:chainBroken` | — | `ui/survivalHud.js:221` |
| `tech:researched` | `systems/ships.js:1838` | `audio/audioSystem.js:1949`, `systems/onboarding.js:504`, `systems/ships.js:1454` |
| `tether:attached` | `combat/attachments.js:369` | `audio/audioSystem.js:2009`, `render/vfx.js:2369`, `systems/encounterDirector.js:291`, `systems/presentationOrchestrator.js:95`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:360`, `systems/tetherGameplay.js:1162` | `audio/audioSystem.js:2027`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1270`, `systems/onboarding.js:369`, `systems/onboarding.js:385`, `systems/surrenderRecovery.js:71` |
| `tether:broken` | `combat/attachments.js:487` | `audio/audioSystem.js:2000`, `render/feel.js:1296`, `render/vfx.js:2372`, `systems/presentationOrchestrator.js:103`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:245` |
| `tether:cut` | `systems/tetherGameplay.js:1766` | `audio/audioSystem.js:2031`, `systems/masslineThrow.js:108`, `systems/onboarding.js:384`, `systems/onboarding.js:412` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1750` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:549`, `systems/tetherGameplay.js:290`, `systems/tetherGameplay.js:453`, `systems/tetherGameplay.js:496`, `systems/tetherGameplay.js:501`, `systems/tetherGameplay.js:511`, `systems/tetherGameplay.js:528`, `systems/tetherGameplay.js:875` | `systems/onboarding.js:540`, `testing/lab/proofSixtySeconds.js:1530`, `ui/masslineHud.js:811` |
| `tether:latched` | `systems/tetherGameplay.js:548` | `audio/audioSystem.js:2023`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:440`, `systems/flightV3.js:156`, `systems/lawSecurity.js:270`, `systems/missions.js:1280`, `systems/missions.js:1306`, `systems/missions.js:1355`, `systems/onboarding.js:364`, `systems/onboarding.js:381`, `systems/onboarding.js:401`, `systems/onboarding.js:410`, `systems/onboarding.js:552`, `systems/onboarding.js:555`, `systems/onboarding.js:567`, `systems/surrenderRecovery.js:68`, `systems/survivorPod.js:452`, `testing/lab/proofSixtySeconds.js:1531`, `ui/masslineHud.js:825`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1441` | — |
| `tether:nearBreak` | `combat/attachments.js:838` | `audio/audioSystem.js:2021`, `systems/onboarding.js:370`, `systems/presentationOrchestrator.js:96` |
| `tether:rebound` | `combat/attachments.js:770` | — |
| `tether:reel` | `combat/attachments.js:421` | `audio/audioSystem.js:1998`, `systems/missions.js:1276`, `systems/onboarding.js:367`, `systems/onboarding.js:382`, `systems/surrenderRecovery.js:69` |
| `tether:reelPump` | `systems/masslineTelemetry.js:251` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:361`, `systems/tetherGameplay.js:1160`, `systems/tetherGameplay.js:1163`, `systems/tetherGameplay.js:1768` | `audio/audioSystem.js:1999`, `render/feel.js:1349`, `render/vfx.js:2371`, `systems/missions.js:1281`, `systems/presentationOrchestrator.js:162`, `ui/masslineHud.js:833` |
| `tether:released` | `systems/tetherGameplay.js:1157`, `systems/tetherGameplay.js:1767` | `render/shipMicroMotion.js:1269`, `render/vfx.js:2370`, `systems/barkDirector.js:380`, `systems/onboarding.js:368`, `systems/onboarding.js:383`, `systems/onboarding.js:411`, `systems/surrenderRecovery.js:70`, `systems/world.js:629` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2124` | — |
| `tether:snagged` | `systems/tetherGameplay.js:2000` | — |
| `tether:snapCatch` | `systems/masslineTelemetry.js:329` | — |
| `tether:strain` | `systems/tetherGameplay.js:1495` | `audio/audioSystem.js:2014` |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1374`, `systems/collisionConsequences.js:63`, `systems/combat.js:529`, `systems/masslineImpactDamage.js:41`, `systems/missions.js:1282`, `systems/onboarding.js:386`, `systems/onboarding.js:413`, `systems/onboarding.js:588`, `systems/presentationOrchestrator.js:138`, `systems/tumbleStates.js:97` |
| `tether:whipSnap` | `systems/tetherGameplay.js:1802` | — |
| `title:holdResolved` | — | `systems/titles.js:395` |
| `touch:uiAction` | `systems/touch.js:575` | `ui/input.js:754` |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:1881` |
| `traffic:oreCollected` | `systems/traffic.js:6199` | — |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:3726` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:10969` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:9580` | — |
| `traffic:spillNoticed` | `systems/traffic.js:6764` | — |
| `tutorial:finished` | `systems/onboarding.js:1140` | `systems/achievements.js:789`, `systems/missions.js:1184`, `systems/presentationAdapters.js:206`, `systems/story.js:140` |
| `tutorial:say` | `systems/onboarding.js:831` | `audio/audioSystem.js:2048`, `systems/story.js:146` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2307` | `systems/missions.js:1193` |
| `ui:acceptMission` | `ui/adventureDecisions.js:396`, `ui/station/screens/bar.js:702`, `ui/station/screens/contracts.js:1348` | `systems/missions.js:1192` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:4264` | `systems/ships.js:1491` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:975` |
| `ui:buyModule` | `ui/station/screens/shipworks.js:4740` | `systems/onboarding.js:499`, `systems/ships.js:1484` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:4622` | `systems/bombs.js:264` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:4392` | `systems/ships.js:1482` |
| `ui:cancel` | `ui/input.js:1001`, `ui/input.js:1015` | — |
| `ui:clearTarget` | `ui/input.js:396` | `ui/uiRoot.js:1042` |
| `ui:closeAll` | `main.js:836`, `ui/screens/crucible.js:2724`, `ui/screens/crucible.js:2737` | `ui/uiRoot.js:1040` |
| `ui:closeCargo` | `ui/input.js:245`, `ui/input.js:358` | `ui/hud.js:4085` |
| `ui:closeComms` | `ui/input.js:353` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1034` |
| `ui:confirm` | `ui/input.js:1009` | `audio/audioSystem.js:2128` |
| `ui:cycleComponent` | `ui/targetPanel.js:487`, `ui/targetPanel.js:491` | `ui/uiRoot.js:1046` |
| `ui:cycleTarget` | `ui/input.js:392`, `ui/input.js:1079` | `ui/uiRoot.js:1041` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:4310` | `systems/ships.js:1492` |
| `ui:endgameChoose` | `systems/missions.js:3018`, `ui/station/barContacts.js:822` | `systems/story.js:159` |
| `ui:endgameConfirm` | — | `systems/story.js:160` |
| `ui:endgameDecline` | `ui/comms.js:447` | `systems/story.js:161` |
| `ui:endgameDepartAshfall` | `ui/comms.js:464` | `systems/story.js:170` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2157` | `systems/story.js:167` |
| `ui:endgameStayAshfall` | `ui/comms.js:465` | `systems/story.js:171` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2161` | `systems/story.js:168` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:169` |
| `ui:endingArchiveOpen` | — | `systems/story.js:163` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | — |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:71` | `systems/factionPresence.js:439` |
| `ui:fitModule` | `ui/station/screens/shipworks.js:4751` | `systems/onboarding.js:496`, `systems/ships.js:1485` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:4632` | `systems/bombs.js:265` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1549` | `systems/automation.js:535`, `systems/wingmen.js:107` |
| `ui:globalFind` | `ui/input.js:283`, `ui/input.js:345` | `ui/globalFind.js:183` |
| `ui:heliosBay7Scan` | — | `systems/story.js:196` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:68` | `systems/story.js:195` |
| `ui:navigate` | `ui/input.js:989`, `ui/input.js:993`, `ui/input.js:1057` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2570`, `ui/screens/achievements.js:208`, `ui/screens/automationPanel.js:860`, `ui/screens/clips.js:291`, `ui/screens/credits.js:177`, `ui/screens/crucible.js:1584`, `ui/screens/crucibleDraft.js:1234`, `ui/screens/demoEnd.js:194`, `ui/screens/replay.js:289`, `ui/screens/starmap.js:639`, `ui/screens/techTree.js:274` | `ui/uiRoot.js:1030` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:686` | `systems/world.js:596` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:756` | `systems/world.js:595` |
| `ui:pushScreen` | `main.js:381`, `systems/onboarding.js:673`, `systems/story.js:1139`, `ui/mapAuthority.js:133`, `ui/screens/crucible.js:2738`, `ui/screens/crucibleDraft.js:734`, `ui/screens/gameOver.js:390`, `ui/screens/starmap.js:647`, `ui/signalInvestigationPrompt.js:169`, `ui/station/barContacts.js:549`, `ui/station/screens/bar.js:719`, `ui/station/stationApp.js:512` | `ui/uiRoot.js:1007` |
| `ui:replaceScreen` | `ui/screens/crucible.js:2692`, `ui/screens/crucible.js:2715`, `ui/screens/demoEnd.js:223`, `ui/screens/motionAsk.js:105` | `ui/uiRoot.js:1039` |
| `ui:restockBombRack` | `ui/station/screens/shipworks.js:4372` | `systems/bombs.js:268` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:4236` | `systems/ships.js:1490` |
| `ui:screenTop` | `ui/screenManager.js:274` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:976` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:4642` | `systems/bombs.js:267` |
| `ui:service` | `balance/careerCohorts.js:726`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:427`, `ui/station/stationApp.js:901`, `ui/station/stationApp.js:937` | `systems/economy.js:1040` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:4397`, `ui/station/screens/shipworks.js:4499` | `systems/ships.js:1483` |
| `ui:setCourse` | `systems/factionPresence.js:1138`, `systems/missions.js:3528`, `systems/scanner.js:1230`, `ui/galaxyMap.js:2223`, `ui/galaxyMap.js:2238`, `ui/galaxyMap.js:7206`, `ui/market/tradeLogic.js:486`, `ui/screens/footprint.js:1614`, `ui/screens/footprint.js:1625`, `ui/screens/localmap.js:995`, `ui/screens/starmap.js:1523`, `ui/screens/starmap.js:1536`, `ui/screens/starmap.js:1540` | `systems/world.js:558` |
| `ui:setShipAppearance` | `ui/station/screens/shipworks.js:4151` | `systems/ships.js:1494` |
| `ui:talkContact` | — | `systems/story.js:197` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:46`, `combat/autoTargetMode.js:214` | `ui/uiRoot.js:1047` |
| `ui:toggleCargo` | `ui/input.js:459` | `ui/hud.js:4084` |
| `ui:toggleComms` | `ui/input.js:476` | — |
| `ui:toggleOverview` | `ui/input.js:463` | `ui/hud.js:4595` |
| `ui:trackMission` | `ui/galaxyMap.js:4028`, `ui/screens/missionLog.js:2153`, `ui/screens/missionLog.js:2225`, `ui/screens/missionLog.js:2286`, `ui/station/screens/contracts.js:1388` | `systems/missions.js:1197` |
| `ui:undock` | — | `ui/input.js:753` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:4761` | `systems/ships.js:1486` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:4652` | `systems/bombs.js:266` |
| `ui:unlockTech` | `ui/screens/techTree.js:623` | `systems/ships.js:1493` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:4381` | `systems/bombs.js:269` |
| `ui:wingOrder` | `ui/wingmanRadial.js:235` | `systems/automation.js:536` |
| `ui:wingmanRadial` | `ui/input.js:469` | `ui/wingmanRadial.js:297` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:337` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:287` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:222` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1382` | `systems/missions.js:1339`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:choose` | `systems/missions.js:4705`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:789` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:807`, `systems/uniqueWrecks.js:956`, `systems/uniqueWrecks.js:1159` | `systems/missions.js:1340` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1448` | `systems/missions.js:1342`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1018` | `systems/missions.js:1341` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1048` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:554`, `systems/uniqueWrecks.js:958` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1624` | `systems/missions.js:1343`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `ui/station/screens/bar.js:736` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:662` | `systems/missions.js:1338` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1625` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1361` | `systems/world.js:601` |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1555` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1266`, `ui/bandHud.js:88` |
| `verb:used` | `systems/onboarding.js:2646` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:5744` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:568` |
| `vestaOreCache:clueRecovered` | `systems/world.js:5565` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:5596` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:5707` | — |
| `vestaOreCache:resolved` | `systems/world.js:5664` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:369`, `ui/voiceArbiter.js:413` | `ui/alerts.js:322` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:324` |
| `voice:say` | `systems/achievements.js:652`, `systems/survivalAnnounce.js:348`, `systems/world.js:682`, `systems/world.js:704`, `ui/alerts.js:221` | `ui/voiceArbiter.js:323` |
| `voice:surface` | `ui/voiceArbiter.js:374`, `ui/voiceArbiter.js:423` | `systems/barkDirector.js:366`, `ui/alerts.js:321` |
| `watch:changed` | `ui/entityLinks.js:237` | `ui/watchlistHud.js:69` |
| `weapons:inertialShunt` | `systems/weapons.js:366` | — |
| `weapons:mineArmed` | `systems/weapons.js:1645` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1602` | — |
| `weapons:mineDetonated` | `systems/weapons.js:1775` | — |
| `weapons:mineExpired` | `systems/weapons.js:1639` | `systems/presentationOrchestrator.js:267` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:346` | — |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1300` | — |
| `weapons:vent` | `systems/weapons.js:743`, `systems/weapons.js:763` | `audio/audioSystem.js:1928`, `render/shipMicroMotion.js:1246`, `render/vfx.js:2433`, `systems/ships.js:1538`, `ui/hud.js:4158` |
| `web:linked` | `combat/tetherWebs.js:95` | — |
| `well:capture` | `systems/fields.js:2103` | — |
| `well:fling` | `systems/fields.js:2028` | — |
| `well:grind` | `systems/fields.js:1784` | `systems/impulseCharges.js:233` |
| `wingMorale:broken` | `systems/wingMorale.js:261` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:346` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:373` | — |
| `wingOrder:accepted` | `systems/automation.js:1978` | `systems/wingmen.js:108` |
| `wingOrder:blocked` | `systems/automation.js:1979` | — |
| `wingOrder:converted` | `systems/wingmen.js:394` | — |
| `wingOrder:status` | `systems/automation.js:1980` | — |
| `world:abortJumpCharge` | `systems/story.js:788`, `ui/comms.js:456` | `systems/world.js:555` |
| `world:confirmUnfiledJump` | `systems/story.js:169` | `systems/world.js:554` |
| `world:criticalSpawnDeferred` | `systems/world.js:1728`, `systems/world.js:3491` | — |
| `world:farActorRestored` | `world/farActorTable.js:757` | `systems/npcJobsRuntime.js:889`, `systems/traffic.js:1424` |
| `world:farActorShelved` | `world/farActorTable.js:734` | `systems/npcJobsRuntime.js:888`, `systems/traffic.js:1423` |
| `world:membership` | `systems/world.js:981` | `systems/presentationOrchestrator.js:181` |
| `world:originShift` | `systems/world.js:4541` | — |
| `world:playerRelocated` | `systems/world.js:3637` | `core/coreSystem.js:234`, `render/vfx.js:2419` |
| `world:requestJump` | `systems/story.js:772`, `ui/galaxyMap.js:2217`, `ui/screens/starmap.js:1535` | `systems/world.js:552` |
| `world:requestRoute` | `ui/galaxyMap.js:2236`, `ui/galaxyMap.js:4045`, `ui/galaxyMap.js:7204`, `ui/screens/starmap.js:1522`, `ui/screens/starmap.js:1539` | `systems/world.js:556` |
| `world:requestSectorScan` | `ui/galaxyMap.js:5812` | `systems/world.js:557` |
| `world:requestUnfiledJump` | `systems/story.js:740` | `systems/world.js:553` |
| `world:residency` | `systems/world.js:1125`, `systems/world.js:1158`, `systems/world.js:1931` | — |
| `world:spawnLimited` | `systems/world.js:3427` | — |
| `world:zoneEntered` | `systems/world.js:4568` | `data/hazardLanguage.js:131` |
| `world:zoneExited` | `systems/world.js:4571` | `data/hazardLanguage.js:132` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:612` | `systems/presentationOrchestrator.js:281` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:566` | `systems/presentationOrchestrator.js:282`, `systems/traffic.js:1505` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2444` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1129` | — |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1172` | — |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:2191` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2372` | `systems/npcJobsRuntime.js:919` |
| `wreckField:source` | `systems/factionPresence.js:704`, `systems/salvage.js:370`, `systems/uniqueWrecks.js:1263` | `systems/aftermathWrecks.js:932` |
| `wreckMission:choiceApplied` | `systems/missions.js:5060` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:141` | `systems/missions.js:1322` |

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
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:bankShot` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 8 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `customs:gateIncident` — 1 subscriber(s)
- `customs:weirBolt` — 1 subscriber(s)
- `dock:launder` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `flybyFocus:cancel` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
- `heat:clear` — 1 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
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
- `miningDrone:sellOre` — 1 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `moment:holyShit` — 1 subscriber(s)
- `moralMemory:remember` — 1 subscriber(s)
- `namedAce:fled` — 1 subscriber(s)
- `nav:abortRoute` — 1 subscriber(s)
- `nav:engageRoute` — 1 subscriber(s)
- `npcjobs:hold` — 1 subscriber(s)
- `npcjobs:load` — 1 subscriber(s)
- `npcjobs:unload` — 1 subscriber(s)
- `npcjobs:work` — 1 subscriber(s)
- `optic:rekindled` — 1 subscriber(s)
- `physics:attachmentBroken` — 1 subscriber(s)
- `pirateDisengage:triggered` — 1 subscriber(s)
- `pirateParley:resolved` — 2 subscriber(s)
- `pirateParley:started` — 1 subscriber(s)
- `postEndingReplay:cycleCompleted` — 1 subscriber(s)
- `presentation:cue` — 5 subscriber(s)
- `projectile:bank` — 1 subscriber(s)
- `projectile:ricochet` — 1 subscriber(s)
- `recovery:completed` — 1 subscriber(s)
- `regionalEcology:applied` — 1 subscriber(s)
- `regionalEcology:changed` — 1 subscriber(s)
- `run:arenaIntroComplete` — 1 subscriber(s)
- `run:awardRequested` — 1 subscriber(s)
- `run:awarded` — 1 subscriber(s)
- `run:draftResolved` — 1 subscriber(s)
- `run:ended` — 9 subscriber(s)
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
- `run:waveCleared` — 3 subscriber(s)
- `run:waveIntroComplete` — 1 subscriber(s)
- `run:waveMaterialized` — 1 subscriber(s)
- `run:wavePlanFailed` — 1 subscriber(s)
- `run:wavePlanned` — 5 subscriber(s)
- `run:waveProgress` — 1 subscriber(s)
- `run:waveStarted` — 4 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `save:dirty` — 1 subscriber(s)
- `sector:entered` — 1 subscriber(s)
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
- `title:holdResolved` — 1 subscriber(s)
- `traffic:ceresCausalChain` — 1 subscriber(s)
- `ui:buy` — 1 subscriber(s)
- `ui:closeScreen` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:endgameUnfiledJumpConfirm` — 1 subscriber(s)
- `ui:endingArchiveOpen` — 1 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
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
- `ambientComms:register` — 1 emitter(s)
- `ambientComms:toneChanged` — 1 emitter(s)
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
- `customs:submit` — 1 emitter(s)
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
- `emergent:audio` — 1 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:hostileCommitted` — 3 emitter(s)
- `encounter:namedCaptainDefeated` — 2 emitter(s)
- `encounter:patrolIntervened` — 1 emitter(s)
- `encounter:predationCleared` — 1 emitter(s)
- `encounter:predationEngaged` — 2 emitter(s)
- `encounter:predationTelegraph` — 1 emitter(s)
- `encounter:stale` — 1 emitter(s)
- `encounter:voice` — 1 emitter(s)
- `encounter:waitStarted` — 1 emitter(s)
- `encounter:winnerHostile` — 1 emitter(s)
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
- `faction:tradePosture` — 3 emitter(s)
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
- `hullBurst:hit` — 1 emitter(s)
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
- `moment:amended` — 1 emitter(s)
- `moralMemory:vengefulReturn` — 1 emitter(s)
- `namedAce:appeared` — 1 emitter(s)
- `nav:waypoint` — 10 emitter(s)
- `nemesis:encounterRejected` — 1 emitter(s)
- `nemesis:encounterStarted` — 1 emitter(s)
- `nemesis:escaped` — 1 emitter(s)
- `nemesis:spare` — 1 emitter(s)
- `news:dockCards` — 1 emitter(s)
- `news:headline` — 6 emitter(s)
- `news:publish` — 12 emitter(s)
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
- `pds:intercept` — 1 emitter(s)
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
- `salvage:cookerFlight` — 1 emitter(s)
- `salvage:coreDetonated` — 1 emitter(s)
- `salvage:coreEjected` — 1 emitter(s)
- `salvage:npcExtraction` — 1 emitter(s)
- `salvage:reactorBurst` — 1 emitter(s)
- `salvage:reactorTowedClear` — 1 emitter(s)
- `salvage:reactorVented` — 1 emitter(s)
- `save:backup` — 1 emitter(s)
- `save:exportRecovery` — 1 emitter(s)
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
- `sensorGhost:swarm` — 1 emitter(s)
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
- `story:postEndingContinuity` — 1 emitter(s)
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
- `tether:cutDenied` — 1 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:rebound` — 1 emitter(s)
- `tether:reelPump` — 1 emitter(s)
- `tether:snagCleared` — 1 emitter(s)
- `tether:snagged` — 1 emitter(s)
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
- `ui:entityRoute` — 1 emitter(s)
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
