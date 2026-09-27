# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-09-27 · 942 events · 3153 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:280`, `systems/encounterDirector.js:290`, `ui/discoveryPlate.js:140` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:725` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:1694` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:1929` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:757` | `systems/salvage.js:72` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1291` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:1746` | `systems/lawSecurity.js:259`, `systems/salvage.js:73` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:164` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:487` | `systems/presentationOrchestrator.js:165`, `systems/tetherGameplay.js:213` |
| `ai:egressExit` | `ai/egressExit.js:74` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:240` | — |
| `ai:flee` | `systems/ai.js:259`, `systems/traffic.js:4763`, `systems/wingMorale.js:303` | `render/vfx.js:2356`, `systems/barkDirector.js:271`, `systems/combatOutcome.js:156`, `systems/encounterDirector.js:302`, `systems/presentationOrchestrator.js:166` |
| `ai:formationBroken` | `systems/ai.js:435`, `systems/wingMorale.js:253` | `render/vfx.js:2357` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:273` |
| `ai:stateChange` | `systems/ai.js:256` | `systems/combatOutcome.js:182` |
| `ai:telegraph` | `systems/ai.js:331`, `systems/encounterScripts.js:178`, `systems/encounterScripts.js:1051`, `systems/masslineSnares.js:331`, `systems/mines.js:104`, `systems/tacticalAI.js:475` | `audio/audioSystem.js:1863`, `render/vfx.js:2355`, `systems/presentationOrchestrator.js:163`, `systems/survivalResults.js:453`, `ui/hud.js:2679`, `ui/survivalHud.js:224`, `ui/threatHalo.js:553` |
| `aiTrader:requestTrade` | `systems/traffic.js:6715` | `systems/economy.js:883` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | — |
| `anomaly:bearing` | `systems/scanner.js:1034` | — |
| `anomaly:triangulated` | `systems/scanner.js:1052` | `systems/world.js:497` |
| `asset:deployed` | `systems/automation.js:2043`, `systems/automation.js:2103`, `systems/automation.js:2192`, `systems/claims.js:484` | `systems/missions.js:1225`, `systems/onboarding.js:497`, `systems/story.js:183` |
| `asteroid:chunked` | `systems/mining.js:1640` | `render/asteroidMotionPresentation.js:452`, `render/vfx.js:2340`, `systems/presentationOrchestrator.js:201` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1001`, `systems/mining.js:845` | `audio/audioSystem.js:1819`, `render/vfx.js:2339`, `systems/fieldDepletion.js:703`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:416`, `render/shipMicroMotion.js:2029`, `render/vfx.js:2384`, `render/vfx.js:5381`, `render/vfx.js:9579`, `render/vfx.js:10604`, `systems/ai.js:706`, `systems/barkDirector.js:878`, `systems/beacons.js:60`, `systems/beacons.js:65`, `systems/beacons.js:97`, `systems/bombs.js:600`, `systems/bombs.js:717`, `systems/bombs.js:895`, `systems/bulletTime.js:185`, `systems/bulletTime.js:201`, `systems/bulletTime.js:280`, `systems/claims.js:331`, `systems/claims.js:416`, `systems/claims.js:461`, `systems/claims.js:1164`, `systems/claims.js:1775`, `systems/cloak.js:156`, `systems/cloak.js:168`, `systems/countermeasures.js:382`, `systems/crafting.js:268`, `systems/crafting.js:278`, `systems/fields.js:704`, `systems/fields.js:920`, `systems/fields.js:1051`, `systems/fields.js:1324`, `systems/flybyFocus.js:433`, `systems/impulseCharges.js:412`, `systems/impulseCharges.js:633`, `systems/impulseCharges.js:815`, `systems/impulseCharges.js:928`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:239`, `systems/masslineThrow.js:538`, `systems/masslineThrow.js:623`, `systems/mining.js:611`, `systems/mining.js:1720`, `systems/planetRuntime.js:508`, `systems/presentationAdapters.js:547`, `systems/presentationOrchestrator.js:493`, `systems/salvage.js:560`, `systems/tumbleStates.js:409`, `systems/tumbleStates.js:444`, `systems/weapons.js:1786`, `ui/commsRadial.js:539`, `ui/commsRadial.js:584`, `ui/commsRadial.js:769`, `ui/commsRadial.js:800`, `ui/hud.js:2151`, `ui/hud.js:3451`, `ui/hud.js:3686`, `ui/hud.js:3746`, `ui/hud.js:3788`, `ui/hud.js:3807`, `ui/hud.js:3905`, `ui/hud.js:4041`, `ui/hud.js:4325`, `ui/input.js:181`, `ui/input.js:210`, `ui/input.js:259`, `ui/input.js:297`, `ui/input.js:303`, `ui/input.js:354`, `ui/input.js:413`, `ui/input.js:419`, `ui/input.js:425`, `ui/input.js:431`, `ui/input.js:642`, `ui/input.js:849`, `ui/input.js:854`, `ui/input.js:872`, `ui/input.js:877`, `ui/input.js:970`, `ui/input.js:991`, `ui/input.js:999`, `ui/input.js:1005`, `ui/input.js:1047`, `ui/input.js:1058`, `ui/input.js:1062`, `ui/input.js:1075`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:488`, `ui/screens/base.js:522`, `ui/screens/base.js:668`, `ui/screens/missionLog.js:2154`, `ui/screens/missionLog.js:2158`, `ui/screens/missionLog.js:2162`, `ui/screens/missionLog.js:2166`, `ui/screens/missionLog.js:2182`, `ui/screens/missionLog.js:2190`, `ui/screens/missionLog.js:2197`, `ui/screens/missionLog.js:2204`, `ui/screens/missionLog.js:2212`, `ui/screens/missionLog.js:2219`, `ui/screens/missionLog.js:2226`, `ui/screens/missionLog.js:2235`, `ui/screens/missionLog.js:2242`, `ui/screens/missionLog.js:2258`, `ui/screens/missionLog.js:2289`, `ui/screens/missionLog.js:2309`, `ui/shipLedgerPanel.js:295`, `ui/shipLedgerPanel.js:302`, `ui/shipLedgerPanel.js:309`, `ui/station/screens/bar.js:533`, `ui/station/screens/bar.js:574`, `ui/station/screens/bar.js:578`, `ui/station/screens/bar.js:582`, `ui/station/screens/bar.js:604`, `ui/station/screens/bar.js:620`, `ui/station/screens/bar.js:649`, `ui/station/screens/bar.js:674`, `ui/station/screens/bar.js:683`, `ui/station/screens/contracts.js:986`, `ui/station/screens/contracts.js:997`, `ui/station/screens/contracts.js:1033`, `ui/station/screens/contracts.js:1036`, `ui/station/screens/contracts.js:1067`, `ui/station/screens/factions.js:340`, `ui/station/screens/industry.js:306`, `ui/station/screens/industry.js:331`, `ui/station/screens/industry.js:341`, `ui/station/screens/market.js:603`, `ui/station/screens/market.js:904`, `ui/station/screens/market.js:973`, `ui/station/screens/market.js:981`, `ui/station/screens/market.js:1002`, `ui/station/screens/market.js:1013`, `ui/station/screens/market.js:1205`, `ui/station/screens/shipworks.js:562`, `ui/station/screens/shipworks.js:3130`, `ui/station/screens/shipworks.js:3929`, `ui/station/screens/shipworks.js:3946`, `ui/station/screens/shipworks.js:3959`, `ui/station/screens/shipworks.js:3963`, `ui/station/screens/shipworks.js:3968`, `ui/station/screens/shipworks.js:3995`, `ui/station/screens/shipworks.js:4001`, `ui/station/screens/shipworks.js:4017`, `ui/station/screens/shipworks.js:4061`, `ui/station/screens/shipworks.js:4070`, `ui/station/screens/shipworks.js:4080`, `ui/station/screens/shipworks.js:4086`, `ui/station/screens/shipworks.js:4106`, `ui/station/screens/shipworks.js:4113`, `ui/station/screens/shipworks.js:4155`, `ui/station/screens/shipworks.js:4162`, `ui/station/screens/shipworks.js:4173`, `ui/station/screens/shipworks.js:4183`, `ui/station/screens/shipworks.js:4188`, `ui/station/screens/shipworks.js:4302`, `ui/station/screens/shipworks.js:4312`, `ui/station/screens/shipworks.js:4322`, `ui/station/screens/shipworks.js:4332`, `ui/station/screens/shipworks.js:4365`, `ui/station/screens/shipworks.js:4369`, `ui/station/screens/shipworks.js:4385`, `ui/station/screens/shipworks.js:4390`, `ui/station/stationApp.js:637`, `ui/station/stationApp.js:902`, `ui/station/stationApp.js:938`, `ui/uiRoot.js:1219`, `ui/wingmanRadial.js:135`, `ui/wingmanRadial.js:156`, `ui/wingmanRadial.js:178`, `ui/wingmanRadial.js:204`, `ui/wingmanRadial.js:229` | `audio/audioSystem.js:1939` |
| `automation:assetDistressed` | `systems/automation.js:1798` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2288` | `systems/intervention.js:63`, `systems/lossLedger.js:377`, `systems/missions.js:1227` |
| `automation:assetRepossessed` | `systems/automation.js:1823` | `ui/automationPayoff.js:90` |
| `automation:assetResumed` | `systems/automation.js:2144` | — |
| `automation:incomeCredited` | `systems/automation.js:1852`, `systems/automation.js:1863`, `systems/automation.js:2561` | — |
| `automation:offlineSummary` | `systems/automation.js:2326`, `systems/automation.js:2350`, `systems/automation.js:2374`, `systems/automation.js:2397`, `systems/automation.js:2608` | `ui/automationPayoff.js:80` |
| `automation:outpostRaided` | `systems/automation.js:1725`, `systems/automation.js:2683` | `systems/lossLedger.js:378` |
| `automation:programAssigned` | `systems/automation.js:1998` | `systems/missions.js:1226` |
| `automation:traderCycleCompleted` | `systems/automation.js:1481` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:521` | — |
| `band:bearingRequest` | `systems/bandRadio.js:494` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:629`, `systems/uniqueWrecks.js:672` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:636`, `systems/uniqueWrecks.js:644`, `systems/uniqueWrecks.js:658` | — |
| `band:bed` | `systems/bandRadio.js:578` | `audio/audioSystem.js:2012` |
| `band:cycle` | `ui/bandHud.js:83`, `ui/input.js:319` | — |
| `band:status` | `systems/bandRadio.js:560` | `ui/bandHud.js:87` |
| `barkDirector:voice` | — | `audio/audioSystem.js:1985` |
| `beacon:deploy` | — | `systems/beacons.js:43` |
| `beacon:deployed` | `systems/beacons.js:92` | `render/shipMicroMotion.js:1201` |
| `beam:denied` | `systems/mining.js:282`, `systems/mining.js:325`, `systems/mining.js:339`, `systems/mining.js:349`, `systems/mining.js:381` | — |
| `beam:repaired` | `systems/mining.js:442` | — |
| `beam:transferred` | `systems/mining.js:496` | — |
| `bombs:armed` | `systems/bombs.js:655` | — |
| `bombs:commanded` | `systems/bombs.js:613` | — |
| `bombs:cycle` | `systems/bombs.js:357`, `systems/bombs.js:592` | — |
| `bombs:denied` | `systems/bombs.js:243`, `systems/bombs.js:350`, `systems/bombs.js:372`, `systems/bombs.js:408`, `systems/bombs.js:445`, `systems/bombs.js:469`, `systems/bombs.js:537`, `systems/bombs.js:551` | — |
| `bombs:destroyed` | `systems/bombs.js:892` | `render/vfx.js:2354` |
| `bombs:detonated` | `systems/bombs.js:711` | `audio/bombAudio.js:338`, `render/vfx.js:2352` |
| `bombs:dropped` | `systems/bombs.js:599` | `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:514` |
| `bombs:fieldEnded` | `systems/bombs.js:847` | `audio/bombAudio.js:346`, `render/vfx.js:2353` |
| `bombs:primed` | `systems/bombs.js:624` | — |
| `bombs:rackChanged` | `systems/bombs.js:498` | — |
| `bombs:released` | `systems/bombs.js:912` | `audio/bombAudio.js:349` |
| `bombs:stockChanged` | `systems/bombs.js:379`, `systems/bombs.js:490`, `systems/bombs.js:597` | — |
| `boss:defeated` | `systems/world.js:708` | — |
| `bounty:cleared` | `systems/economy.js:2191` | `systems/heat.js:279` |
| `buildIdentity:revealed` | `systems/buildIdentity.js:299` | — |
| `bulletTime:end` | `systems/bulletTime.js:200` | `audio/audioSystem.js:2011` |
| `bulletTime:start` | `systems/bulletTime.js:184` | `audio/audioSystem.js:2008`, `systems/onboarding.js:557` |
| `camera:kill` | `render/feel.js:1171`, `render/feel.js:1647` | — |
| `camera:shake` | `render/shipMicroMotion.js:2027`, `render/vfx.js:5639`, `render/vfx.js:5929`, `render/vfx.js:6266`, `systems/combat.js:557`, `systems/combat.js:696`, `systems/combat.js:874`, `systems/combat.js:957`, `systems/drill.js:1284`, `systems/flybyFocus.js:432`, `systems/intervention.js:205`, `systems/presentationAdapters.js:469`, `systems/survivalAnnounce.js:443`, `systems/tetherGameplay.js:526` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:485`, `ui/input.js:486`, `ui/input.js:718` | — |
| `capitalBoss:detach` | `systems/missions.js:1242` | — |
| `capitalBoss:start` | `systems/missions.js:5106` | — |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:110`, `systems/capitalBossEncounters.js:132` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:731` | `systems/world.js:499` |
| `cargo:changed` | `systems/cargo.js:188`, `systems/mining.js:1885` | `systems/ships.js:1444`, `ui/cargoConscience.js:142`, `ui/commandBar.js:412`, `ui/hud.js:3819`, `ui/hud.js:3848`, `ui/hudMeta.js:192` |
| `cargo:delivered` | `systems/missions.js:5802`, `systems/missions.js:5873` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:287`, `systems/mining.js:601`, `systems/mining.js:1162` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:457`, `systems/presentationOrchestrator.js:209`, `ui/alerts.js:370`, `ui/floatingText.js:240` |
| `cargo:hotDockSpill` | `systems/cargo.js:507` | — |
| `cargo:jettison` | `ui/hud.js:3459` | `ui/hud.js:3751` |
| `cargo:jettisoned` | `systems/cargo.js:583` | `audio/audioSystem.js:1845`, `render/shipMicroMotion.js:1199`, `systems/barkDirector.js:281`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:553` |
| `cargo:massSettled` | `systems/cargo.js:418` | `systems/presentationOrchestrator.js:208`, `systems/ships.js:1445` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:901` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:937` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:821`, `systems/lootShards.js:877` | — |
| `chain:detonated` | `systems/impulseCharges.js:613` | `systems/fields.js:377` |
| `chain:primeEnded` | `systems/impulseCharges.js:576` | — |
| `chain:primed` | `systems/impulseCharges.js:553` | — |
| `chain:slam` | `systems/impulseCharges.js:487`, `systems/impulseCharges.js:507` | `systems/fields.js:376` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1859` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:811` | `systems/onboarding.js:565` |
| `charge:armed` | `systems/impulseCharges.js:650` | — |
| `charge:combo` | `systems/impulseCharges.js:853`, `systems/impulseCharges.js:912` | — |
| `charge:detonated` | `systems/impulseCharges.js:404`, `systems/impulseCharges.js:625`, `systems/impulseCharges.js:920` | `audio/audioSystem.js:1873`, `render/feel.js:1251`, `render/vfx.js:2350`, `systems/fields.js:378` |
| `charge:stuck` | `systems/impulseCharges.js:727` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1198` |
| `charge:thrown` | `systems/impulseCharges.js:807` | `render/ordnanceMotionPresentation.js:261` |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:18` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:19` |
| `claim:claimed` | `systems/claims.js:330` | `systems/onboarding.js:503`, `systems/story.js:189`, `systems/traffic.js:1393` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1223` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:284` |
| `claim:defenseResolved` | `systems/claims.js:1299` | — |
| `claim:defenseStarted` | `systems/claims.js:1228` | — |
| `claim:defenseWarning` | `systems/claims.js:1147` | — |
| `claim:depotPatrolCompleted` | `systems/claims.js:2069` | `systems/factions.js:349` |
| `claim:depotPatrolRotation` | `systems/claims.js:2026` | — |
| `claim:depotSupport` | `systems/claims.js:1941`, `systems/claims.js:1966` | — |
| `claim:freightDelivered` | `systems/traffic.js:2387` | — |
| `claim:infrastructureActive` | `systems/claims.js:864` | `systems/traffic.js:1391` |
| `claim:infrastructureConstructed` | `systems/claims.js:397` | — |
| `claim:infrastructureStatus` | `systems/claims.js:875` | `systems/traffic.js:1392` |
| `claim:moduleBuilt` | `systems/claims.js:415` | — |
| `claim:raidRepelled` | `systems/claims.js:1096` | — |
| `claim:raidWarning` | `systems/claims.js:1089` | — |
| `claim:receipt` | `systems/claims.js:1516` | — |
| `claim:sensorPostRumor` | `systems/claims.js:924` | `systems/world.js:527` |
| `claim:specialized` | `systems/claims.js:456` | — |
| `claim:teleportRequest` | `systems/claims.js:662` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:2226` | — |
| `claims:migrated` | `systems/claims.js:1634` | — |
| `cloak:burned` | `systems/cloak.js:210` | — |
| `cloak:dropped` | `systems/cloak.js:167` | `render/shipMicroMotion.js:1195` |
| `cloak:engaged` | `systems/cloak.js:155` | `render/shipMicroMotion.js:1194`, `systems/onboarding.js:561` |
| `cloak:faded` | `systems/aiPorts.js:1059` | — |
| `combat:actionCancelled` | `combat/actions.js:336` | — |
| `combat:actionCompleted` | `combat/actions.js:322` | — |
| `combat:actionPhase` | `combat/actions.js:195` | — |
| `combat:actionRejected` | `combat/actions.js:358` | `ui/toasts.js:379` |
| `combat:actionStarted` | `combat/actions.js:165` | `systems/presentationOrchestrator.js:168`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2286` |
| `combat:baseDestroyed` | — | `systems/economy.js:933` |
| `combat:beamStop` | `systems/weapons.js:1156` | `audio/audioSystem.js:1759`, `render/asteroidMotionPresentation.js:451`, `render/vfx.js:2282` |
| `combat:bounceContinued` | `combat/attackHit.js:36` | `render/vfx.js:2287`, `systems/presentationOrchestrator.js:251` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:257` | `render/feel.js:1286`, `render/vfx.js:2296`, `systems/fields.js:380`, `systems/gamepad.js:323` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:275` | `render/vfx.js:2297` |
| `combat:damage` | `combat/damage.js:288` | `audio/audioSystem.js:1766`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `render/asteroidMotionPresentation.js:445`, `render/feel.js:1096`, `render/shipMicroMotion.js:1181`, `render/vfx.js:2288`, `save/saveSystem.js:240`, `systems/ai.js:101`, `systems/aiEncounter.js:111`, `systems/barkDirector.js:277`, `systems/combatOutcome.js:181`, `systems/cruise.js:53`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:281`, `systems/factionPresence.js:429`, `systems/heat.js:245`, `systems/lawSecurity.js:254`, `systems/onboarding.js:423`, `systems/onboarding.js:434`, `systems/presentationOrchestrator.js:162`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1505`, `systems/stationBroadcast.js:152`, `systems/survivalResults.js:448`, `systems/titles.js:396`, `systems/traffic.js:1341`, `ui/alerts.js:356`, `ui/commandBar.js:401`, `ui/floatingText.js:149`, `ui/hud.js:1706`, `ui/hud.js:1979`, `ui/hud.js:2181`, `ui/uiRoot.js:613` |
| `combat:emp` | `combat/damage.js:322` | `ui/hud.js:2187` |
| `combat:fire` | `systems/weapons.js:1062`, `systems/weapons.js:1135`, `systems/weapons.js:1284`, `systems/weapons.js:1601` | `audio/audioSystem.js:1758`, `data/stationBubbles.js:181`, `render/feel.js:1187`, `render/shipMicroMotion.js:1179`, `render/vfx.js:2281`, `systems/cloak.js:52`, `systems/cruise.js:61`, `systems/lawSecurity.js:255`, `systems/onboarding.js:373`, `systems/onboarding.js:386`, `systems/presentationOrchestrator.js:167`, `systems/traffic.js:1342`, `ui/hud.js:3863` |
| `combat:hit` | `systems/salvageActions.js:275` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:539` |
| `combat:kill` | `systems/world.js:4964` | — |
| `combat:lockChanged` | `systems/weapons.js:842` | `systems/world.js:492`, `ui/alerts.js:363` |
| `combat:outcome` | `systems/combatOutcome.js:296` | `systems/barkDirector.js:274` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:297` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:162` |
| `combat:requestAction` | — | `combat/kernel.js:160` |
| `combat:routeDamage` | `systems/bombs.js:860`, `systems/drill.js:1296`, `systems/impulseCharges.js:1129`, `systems/mines.js:250`, `systems/missions.js:5450` | `combat/kernel.js:161`, `systems/routeFollower.js:333` |
| `combat:shove` | `systems/onboarding.js:1791` | `audio/audioSystem.js:1857`, `systems/onboarding.js:385` |
| `combat:statusApplied` | `combat/statuses.js:178` | `render/vfx.js:2298` |
| `combat:statusExpired` | `combat/statuses.js:76` | `audio/bombAudio.js:358` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:157`, `systems/encounterDirector.js:273`, `systems/factionPresence.js:427`, `systems/presentationOrchestrator.js:230`, `systems/surrenderRecovery.js:64`, `systems/tumbleStates.js:99`, `systems/wingMorale.js:179` |
| `combat:subsystemEnabled` | — | `render/shipMicroMotion.js:1197`, `systems/factionPresence.js:428`, `systems/presentationOrchestrator.js:239`, `systems/surrenderRecovery.js:65` |
| `combat:surrendered` | — | `systems/combatOutcome.js:158`, `systems/surrenderRecovery.js:63` |
| `combat:tumbled` | `systems/tumbleStates.js:407` | `systems/fields.js:379`, `systems/missions.js:1169`, `systems/tetherGameplay.js:212` |
| `combat:warded` | `combat/damage.js:52` | — |
| `combat:weakPointHit` | `systems/combat.js:618` | `render/vfx.js:2289`, `ui/floatingText.js:177` |
| `comms:log` | `data/encounters/344-opening-hauler-raid.js:130`, `systems/encounterDirector.js:2232`, `systems/encounterScripts.js:745`, `systems/encounterScripts.js:2608`, `systems/encounterScripts.js:2854`, `systems/salvage.js:558` | `ui/floatingText.js:69` |
| `comms:message` | `systems/traffic.js:4638`, `systems/traffic.js:5379` | — |
| `comms:popup` | `systems/ai.js:490`, `systems/factionPresence.js:986`, `systems/factionPresence.js:1007`, `systems/memorialThief.js:93`, `systems/missions.js:3982`, `systems/missions.js:5987`, `systems/missions.js:6021`, `systems/missions.js:6060`, `systems/missions.js:6770`, `systems/missions.js:7203`, `systems/missions.js:7613`, `systems/onboarding.js:714`, `systems/scenarioRuntime.js:186`, `systems/story.js:419`, `systems/story.js:1102`, `systems/story.js:1130` | `audio/audioSystem.js:1925`, `ui/screens/codex.js:630` |
| `conflict:flip` | `systems/factions.js:680` | `systems/factionPresence.js:433`, `systems/sectorSim.js:109`, `systems/story.js:184` |
| `conflict:frontAction` | `systems/factions.js:567` | — |
| `conflict:warDeclared` | `systems/factions.js:624` | — |
| `contactHail:availability` | `systems/scanner.js:1377`, `systems/scanner.js:1388` | — |
| `contactHail:choice` | `ui/commsRadial.js:533`, `ui/contactHailPrompt.js:167` | `systems/scanner.js:834` |
| `contactHail:clear` | `systems/scanner.js:1399` | — |
| `contactHail:handoff` | `systems/scanner.js:1237` | — |
| `contactHail:offer` | `systems/scanner.js:1259` | — |
| `contactHail:request` | `ui/commsRadial.js:585`, `ui/contactHailPrompt.js:161` | `systems/scanner.js:833` |
| `contactHail:response` | `systems/scanner.js:1293` | `systems/traffic.js:1331` |
| `contraband:bribe` | `systems/encounterScripts.js:426`, `ui/customsPrompt.js:212` | `systems/economy.js:929` |
| `contraband:scanned` | `systems/economy.js:2625` | `systems/encounterDirector.js:282`, `systems/factions.js:330`, `systems/heat.js:248`, `systems/lawSecurity.js:265`, `ui/customsPrompt.js:139` |
| `contract:clauseBroken` | `systems/contractClauses.js:395` | `systems/missions.js:1206` |
| `contract:clauseHonored` | `systems/contractClauses.js:380`, `systems/missions.js:6074` | — |
| `contract:clauseSettledKill` | `systems/contractClauses.js:290` | `systems/missions.js:1135` |
| `countermeasure:deployed` | `systems/countermeasures.js:378` | `render/shipMicroMotion.js:1200` |
| `craft:complete` | `systems/crafting.js:267`, `systems/crafting.js:310` | `ui/station/screens/industry.js:352` |
| `craft:queueChanged` | `systems/crafting.js:162`, `systems/crafting.js:277`, `systems/crafting.js:312` | `systems/onboarding.js:508`, `ui/station/screens/industry.js:352` |
| `credits:changed` | `systems/economy.js:2131`, `systems/economy.js:2143` | `audio/audioSystem.js:1838`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:413`, `ui/hud.js:3847` |
| `cruise:charging` | `systems/cruise.js:123` | `render/vfx.js:2347`, `systems/presentationOrchestrator.js:175` |
| `cruise:dropped` | `systems/cruise.js:189` | `render/vfx.js:2349`, `systems/presentationOrchestrator.js:177` |
| `cruise:engaged` | `systems/cruise.js:98` | `render/vfx.js:2348`, `systems/presentationOrchestrator.js:176` |
| `cruise:snareRequest` | `systems/encounterScripts.js:589` | `systems/cruise.js:66` |
| `cruise:snared` | `systems/cruise.js:188` | `audio/audioSystem.js:1919` |
| `customs:breakScan` | `ui/customsPrompt.js:216` | — |
| `customs:submit` | `ui/customsPrompt.js:195` | — |
| `danger:miningNoise` | `systems/mining.js:1897` | — |
| `day:tick` | `core/coreSystem.js:271` | `systems/custodyConsequences.js:40`, `systems/economy.js:862`, `systems/encounterDirector.js:255`, `systems/factions.js:361`, `systems/sectorSim.js:93` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:226` | `systems/combat.js:530` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:217` | `systems/combat.js:529` |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:184` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:plateUnlocked` | `systems/world.js:663`, `systems/world.js:4824`, `systems/world.js:5113`, `systems/world.js:5733` | `audio/audioSystem.js:1855`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:632` |
| `distress:call` | `systems/traffic.js:4636` | — |
| `distress:rescued` | `systems/encounterScripts.js:744` | `systems/factions.js:339` |
| `dock:attempt` | `ui/input.js:176` | `ui/dockDenyBanner.js:116` |
| `dock:denied` | `ui/dockDenyBanner.js:141` | — |
| `dock:docked` | `balance/careerCohorts.js:494`, `balance/careerCohorts.js:1649`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `ui/input.js:180` | `audio/audioSystem.js:1856`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/infrastructureMotion.js:115`, `render/shipMicroMotion.js:1190`, `save/saveSystem.js:267`, `systems/aftermathWrecks.js:914`, `systems/autoTargetAssist.js:101`, `systems/combat.js:516`, `systems/economy.js:908`, `systems/economyContracts.js:164`, `systems/factionPresence.js:425`, `systems/lawSecurity.js:274`, `systems/mining.js:190`, `systems/missions.js:1090`, `systems/onboarding.js:347`, `systems/onboarding.js:474`, `systems/pirateDisguise.js:37`, `systems/scanner.js:837`, `systems/stationServices.js:205`, `systems/story.js:149`, `systems/world.js:520`, `ui/alerts.js:330`, `ui/cargoConscience.js:143`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:117`, `ui/impoundPayPrompt.js:35`, `ui/priceForecast.js:86`, `ui/promptDeck.js:710`, `ui/securityReadout.js:158`, `ui/uiRoot.js:1143`, `ui/wingmanRadial.js:247` |
| `dock:launder` | — | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:1087`, `core/physics.js:1091`, `ui/input.js:153` | `systems/onboarding.js:443`, `ui/alerts.js:326`, `ui/input.js:159` |
| `dock:undocked` | `balance/careerCohorts.js:495`, `balance/careerCohorts.js:1654`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:682`, `ui/station/stationApp.js:863` | `audio/audioSystem.js:1861`, `render/infrastructureMotion.js:116`, `render/shipMicroMotion.js:1191`, `save/saveSystem.js:268`, `systems/combat.js:520`, `systems/economy.js:917`, `systems/missions.js:1109`, `systems/moralTrap.js:119`, `systems/onboarding.js:396`, `systems/presentationAdapters.js:202`, `systems/stationServices.js:206`, `systems/world.js:521`, `ui/input.js:167`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1173` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1309` | `ui/uiRoot.js:1232` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1294`, `ui/sandbox/sandboxSetup.js:593` | `ui/uiRoot.js:1222` |
| `drill:approachRequested` | `ui/input.js:597` | `systems/tetherGameplay.js:211` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1186`, `ui/sandbox/sandboxSetup.js:592` | `ui/uiRoot.js:1211` |
| `drill:break` | `systems/drill.js:1195` | `audio/audioSystem.js:2042`, `systems/asteroidSites.js:166`, `systems/presentationOrchestrator.js:216`, `ui/asteroid/asteroidScreen.js:1611`, `ui/screens/drill.js:1742` |
| `drill:cargoFull` | `systems/drill.js:1244` | `audio/audioSystem.js:2044`, `systems/presentationOrchestrator.js:223`, `ui/asteroid/asteroidScreen.js:1601`, `ui/screens/drill.js:1712` |
| `drill:end` | `systems/drill.js:807` | `audio/audioSystem.js:2052`, `systems/asteroidSites.js:176`, `systems/presentationOrchestrator.js:224` |
| `drill:gasHit` | `systems/drill.js:1283` | `audio/audioSystem.js:2043`, `systems/presentationOrchestrator.js:218`, `ui/asteroid/asteroidScreen.js:1588`, `ui/screens/drill.js:1652` |
| `drill:retry` | `systems/drill.js:858` | `systems/presentationOrchestrator.js:225` |
| `drill:rockDepleted` | `systems/drill.js:773`, `systems/drill.js:1209`, `systems/drill.js:1235` | `audio/audioSystem.js:2045`, `ui/asteroid/asteroidScreen.js:1598`, `ui/screens/drill.js:1703` |
| `drill:scanPulse` | `systems/drill.js:931` | `audio/audioSystem.js:2046`, `systems/asteroidSites.js:193`, `systems/presentationOrchestrator.js:214`, `ui/asteroid/asteroidScreen.js:1605`, `ui/screens/drill.js:1730` |
| `drill:spark` | `systems/drill.js:1165` | `audio/audioSystem.js:2041`, `systems/presentationOrchestrator.js:215`, `ui/asteroid/asteroidScreen.js:1616`, `ui/screens/drill.js:1763` |
| `drill:start` | `systems/drill.js:765` | `audio/audioSystem.js:2051`, `systems/asteroidSites.js:159`, `systems/onboarding.js:479`, `systems/presentationOrchestrator.js:213` |
| `drill:warn` | `systems/drill.js:779`, `systems/drill.js:784`, `systems/drill.js:1061`, `systems/drill.js:1096`, `systems/drill.js:1117`, `systems/drill.js:1216`, `systems/drill.js:1247`, `systems/drill.js:1254` | `audio/audioSystem.js:2047`, `systems/presentationOrchestrator.js:212`, `ui/asteroid/asteroidRenderer3d.js:7054`, `ui/asteroid/asteroidScreen.js:1594`, `ui/screens/drill.js:1680` |
| `drill:yield` | `systems/drill.js:1233` | `audio/audioSystem.js:2038`, `systems/presentationOrchestrator.js:217`, `ui/asteroid/asteroidScreen.js:1580`, `ui/screens/drill.js:1631` |
| `economy:applyTradePressure` | `systems/automation.js:847`, `systems/automation.js:1574`, `systems/automation.js:1575`, `systems/claims.js:1005`, `systems/encounterDirector.js:1759`, `systems/encounterDirector.js:1807`, `systems/sectorSim.js:375`, `systems/traffic.js:8298`, `systems/traffic.js:10033` | `systems/economy.js:891` |
| `economy:cargoKillOpportunity` | `systems/economy.js:1914` | `systems/missions.js:1120` |
| `economy:chargeCredits` | `systems/automation.js:1747`, `systems/automation.js:1754`, `systems/automation.js:2571`, `systems/automation.js:2795`, `systems/beacons.js:69`, `systems/bombs.js:376`, `systems/bombs.js:456`, `systems/bombs.js:473`, `systems/claims.js:310`, `systems/claims.js:380`, `systems/claims.js:451`, `systems/claims.js:1049`, `systems/combat.js:853`, `systems/encounterDirector.js:1753`, `systems/factions.js:425`, `systems/gateControlDirector.js:120`, `systems/mining.js:428`, `systems/missions.js:2851`, `systems/missions.js:2854`, `systems/pirateParley.js:621`, `systems/ships.js:1822`, `systems/ships.js:1892`, `systems/ships.js:1948`, `systems/world.js:3417`, `systems/world.js:3461`, `systems/world.js:4492` | `systems/economy.js:852` |
| `economy:debtEscalated` | `systems/economy.js:2229` | — |
| `economy:demandShift` | `systems/economy.js:1190` | — |
| `economy:eventEnded` | `systems/economy.js:2703` | `ui/floatingText.js:256` |
| `economy:eventStarted` | `systems/economy.js:2678` | `ui/floatingText.js:245` |
| `economy:grantCredits` | `systems/automation.js:1848`, `systems/automation.js:1859`, `systems/automation.js:2557`, `systems/bombs.js:489`, `systems/claims.js:1004`, `systems/claims.js:1620`, `systems/combat.js:703`, `systems/combat.js:715`, `systems/combat.js:941`, `systems/encounterDirector.js:1754`, `systems/mining.js:1559`, `systems/mining.js:1736`, `systems/missions.js:6082`, `systems/missions.js:6085`, `systems/missions.js:6423`, `systems/missions.js:7526`, `systems/moralTrap.js:220`, `systems/ships.js:1978`, `systems/survivorPod.js:1052`, `systems/uniqueWrecks.js:1469` | `systems/economy.js:851`, `systems/story.js:182` |
| `economy:marketOpened` | `ui/station/screens/market.js:1247` | `systems/economy.js:867`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1599` | `systems/economy.js:854` |
| `economy:salvageIntakeApplied` | `systems/economy.js:2114` | — |
| `economy:sinkCharged` | `systems/economy.js:2157` | — |
| `economy:tick` | `systems/economy.js:1023` | `ui/priceHistory.js:116` |
| `economy:tradeCompleted` | `systems/economy.js:1766` | `audio/audioSystem.js:1839`, `audio/audioSystem.js:1895`, `careers/origins/haulerOriginSystem.js:91`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:275`, `systems/claims.js:278`, `systems/factions.js:309`, `systems/missions.js:1118`, `systems/onboarding.js:352`, `systems/sectorSim.js:104`, `systems/story.js:178` |
| `economy:tradeFailed` | `systems/economy.js:1985`, `systems/economy.js:2008` | — |
| `emergent:audio` | `systems/emergentPrimitives.js:144` | — |
| `emergent:contact` | `systems/emergentPrimitives.js:150` | `render/feel.js:1269` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1610` | `ui/encounterChoicePrompt.js:53` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:295` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1695` | — |
| `encounter:hostileCommitted` | `systems/encounterDirector.js:2273` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:6942` | `systems/encounterDirector.js:280` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1892`, `systems/encounterScripts.js:2828` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:2237` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:1146` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1063`, `systems/encounterScripts.js:1131` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:1036` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1708` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:1690`, `systems/encounterDirector.js:1739`, `systems/survivalArena.js:1156` | `audio/audioSystem.js:1865`, `systems/aftermathWrecks.js:913`, `systems/claims.js:282`, `systems/claims.js:283`, `systems/story.js:137`, `systems/terrainAnchors.js:89`, `systems/traffic.js:1394`, `systems/uniqueLootAbilities.js:133`, `ui/encounterChoicePrompt.js:54` |
| `encounter:spawned` | `systems/encounterDirector.js:1066` | `systems/uniqueLootAbilities.js:132` |
| `encounter:stale` | `systems/encounterDirector.js:409` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1038`, `systems/survivalArena.js:1080` | `audio/audioSystem.js:1864`, `systems/survivalResults.js:454`, `systems/terrainAnchors.js:88`, `systems/world.js:530` |
| `encounter:voice` | `systems/encounterDirector.js:1593` | — |
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
| `endgame:pullCompleted` | `systems/claims.js:2172` | `systems/factions.js:352` |
| `endgame:sandboxContinued` | `systems/story.js:938` | `ui/screens/missionLog.js:2438` |
| `entity:destroyed` | `main.js:471`, `main.js:703`, `save/saveSystem.js:3477`, `systems/survivorPod.js:274`, `systems/traffic.js:6373` | `audio/audioSystem.js:1813`, `combat/kernel.js:155`, `render/vfx.js:2309`, `systems/aftermathWrecks.js:908`, `systems/ai.js:113`, `systems/aiEncounter.js:110`, `systems/combatOutcome.js:161`, `systems/encounterDirector.js:271`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:247`, `systems/lawSecurity.js:258`, `systems/missions.js:1137`, `systems/npcJobsRuntime.js:880`, `systems/presentationOrchestrator.js:174`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:94`, `systems/survivalWave.js:95`, `systems/swarmArena.js:428`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:179` |
| `entity:killed` | `balance/careerCohorts.js:463`, `combat/damage.js:464`, `combat/kernel.js:106`, `systems/combat.js:682` | `audio/audioSystem.js:1812`, `render/feel.js:1147`, `render/shipMicroMotion.js:1174`, `render/vfx.js:2308`, `sim/titleAttract.js:166`, `systems/aftermathWrecks.js:906`, `systems/ai.js:114`, `systems/barkDirector.js:282`, `systems/barkDirector.js:283`, `systems/combatOutcome.js:155`, `systems/economy.js:897`, `systems/encounterDirector.js:272`, `systems/factions.js:239`, `systems/factions.js:276`, `systems/impulseCharges.js:226`, `systems/lawSecurity.js:257`, `systems/lawSecurity.js:269`, `systems/lootShards.js:539`, `systems/lossLedger.js:380`, `systems/mining.js:185`, `systems/missions.js:1130`, `systems/npcJobsRuntime.js:872`, `systems/onboarding.js:387`, `systems/onboarding.js:412`, `systems/presentationOrchestrator.js:173`, `systems/sectorSim.js:108`, `systems/surrenderRecovery.js:70`, `systems/survivalResults.js:445`, `systems/survivorPod.js:412`, `systems/swarmChain.js:107`, `systems/swarmSupply.js:101`, `systems/titles.js:397`, `systems/traffic.js:1319`, `systems/wingMorale.js:178`, `systems/world.js:534`, `ui/floatingText.js:174`, `ui/floatingText.js:212`, `ui/uiRoot.js:620`, `ui/uiRoot.js:628` |
| `entity:spawnRequest` | — | `core/coreSystem.js:183` |
| `entity:spawned` | `core/coreSystem.js:81` | `combat/kernel.js:150`, `render/asteroidMotionPresentation.js:453`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:220`, `render/shipMicroMotion.js:1175`, `render/vfx.js:2315`, `sim/titleAttract.js:167`, `systems/aiEncounter.js:109`, `systems/combatOutcome.js:160`, `systems/factionPresence.js:431`, `systems/fields.js:374`, `systems/lawSecurity.js:256`, `systems/lossLedger.js:379`, `systems/npcJobsRuntime.js:857`, `systems/salvageActions.js:93`, `systems/survivalSwarm.js:216`, `systems/swarmSupply.js:106`, `systems/titles.js:398`, `systems/uniqueLootAbilities.js:135` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:320`, `systems/environmentalMachinery.js:840` | `systems/terrainAnchors.js:90` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:655` | `systems/terrainAnchors.js:94` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:734` | `systems/terrainAnchors.js:92` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:931` | `data/hazardLanguage.js:133` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:667` | `systems/terrainAnchors.js:96` |
| `escalation:arrived` | `systems/encounterDirector.js:449` | — |
| `escalation:seeded` | `systems/encounterDirector.js:436` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:401`, `systems/factions.js:467`, `systems/factions.js:794` | `systems/heat.js:254` |
| `faction:bribe` | `ui/screens/footprint.js:1605` | `systems/factions.js:220` |
| `faction:repChanged` | `systems/factions.js:398`, `systems/factions.js:462`, `systems/factions.js:790` | `ui/floatingText.js:230`, `ui/station/screens/factions.js:381` |
| `faction:repDelta` | `balance/careerCohorts.js:257`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `systems/claims.js:1287`, `systems/economy.js:2406`, `systems/economy.js:2617`, `systems/encounterDirector.js:1755`, `systems/missions.js:6420`, `systems/missions.js:6476`, `systems/missions.js:7478`, `systems/missions.js:7480`, `systems/missions.js:7544`, `systems/moralTrap.js:214`, `systems/stuntGrammar.js:102`, `systems/survivorPod.js:842`, `systems/survivorPod.js:1058`, `systems/uniqueWrecks.js:1473`, `systems/world.js:5238`, `systems/world.js:5472` | `systems/factions.js:217` |
| `faction:repSpillover` | `systems/factions.js:460` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1234` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:990` | `systems/story.js:199` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1146` | `ui/uiRoot.js:286` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:838` | — |
| `factionPresence:service` | `systems/factionPresence.js:939` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1015` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:572`, `systems/factionPresence.js:657` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:789` | `systems/world.js:496` |
| `field:opportunity` | `systems/world.js:3811` | — |
| `field:regrown` | `systems/world.js:3740` | `systems/presentationOrchestrator.js:211` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:717`, `systems/traffic.js:1675`, `systems/traffic.js:9952` | — |
| `field:richSeamOpened` | `systems/traffic.js:9006` | — |
| `field:richSeamWorked` | `systems/mining.js:813`, `systems/traffic.js:8665` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:788` | `systems/npcJobsRuntime.js:888`, `systems/presentationOrchestrator.js:210` |
| `fields:anchorRegistered` | `systems/fields.js:851` | — |
| `fields:cleared` | `systems/fields.js:1356` | — |
| `fields:clusterDetonate` | `systems/fields.js:1933` | `systems/presentationOrchestrator.js:272` |
| `fields:coneToggled` | `systems/fields.js:1044`, `systems/fields.js:1050`, `systems/fields.js:1144`, `systems/fields.js:1152` | `systems/onboarding.js:403` |
| `fields:deployDenied` | `systems/fields.js:918` | — |
| `fields:deployed` | `systems/fields.js:558`, `systems/fields.js:643`, `systems/fields.js:1004`, `systems/fields.js:1041`, `systems/fields.js:1135`, `systems/fields.js:1249` | `audio/audioSystem.js:2000`, `systems/fields.js:375`, `systems/onboarding.js:402` |
| `fields:ended` | `systems/fields.js:870`, `systems/fields.js:1151`, `systems/fields.js:1172`, `systems/fields.js:1322` | — |
| `fields:hitchCut` | `systems/fields.js:589` | — |
| `fields:hitchLatched` | `systems/fields.js:577` | — |
| `fields:specialistDisrupt` | `systems/fields.js:467` | — |
| `firsthour:beat` | `systems/onboarding.js:2648` | — |
| `firsthour:complete` | `systems/onboarding.js:2661` | — |
| `firsthour:milestone` | `systems/onboarding.js:795` | `audio/audioSystem.js:1993` |
| `firsthour:sentence` | `systems/onboarding.js:1429` | — |
| `firsthour:started` | `systems/onboarding.js:2446` | — |
| `firsthour:verb` | `systems/onboarding.js:2585` | — |
| `flight:modeChanged` | `systems/flightV3.js:578` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:279` |
| `flybyFocus:end` | `systems/flybyFocus.js:317` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:415` | `systems/onboarding.js:370` |
| `formation:discovered` | `systems/asteroidFormations.js:236` | — |
| `freight:arrival` | `systems/traffic.js:6732` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1548`, `systems/encounterScripts.js:1767`, `systems/traffic.js:4742` | `systems/barkDirector.js:280`, `systems/economy.js:853`, `systems/encounterDirector.js:300`, `systems/lootShards.js:542`, `systems/traffic.js:1337` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1410` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:583` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1467` | — |
| `freight:loss` | `systems/encounterDirector.js:1817`, `systems/traffic.js:8300`, `systems/traffic.js:10045` | `systems/encounterDirector.js:301` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1411` | `systems/surrenderRecovery.js:71` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1903` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:278`, `systems/traffic.js:1334` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:279`, `systems/traffic.js:1335` |
| `frontierRumor:acquired` | `systems/world.js:3480` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:5703` | — |
| `frontierRumor:contacted` | `systems/world.js:5599` | — |
| `frontierRumor:resolved` | `systems/world.js:3497` | — |
| `fuel:changed` | `systems/economy.js:2271`, `systems/stationServices.js:422`, `systems/stationServices.js:489`, `systems/world.js:4986`, `systems/world.js:4994` | — |
| `fuel:empty` | `systems/world.js:4987` | `audio/audioSystem.js:1885`, `ui/alerts.js:371` |
| `game:exitToMenu` | `ui/screens/crucible.js:2575`, `ui/screens/crucible.js:2588`, `ui/screens/demoEnd.js:216`, `ui/screens/pause.js:979` | `audio/audioSystem.js:2090`, `main.js:249`, `systems/runSession.js:57`, `ui/screens/crucibleLabControls.js:552` |
| `game:load` | `ui/input.js:308`, `ui/input.js:482`, `ui/screens/mainMenu.js:521`, `ui/screens/saveLoad.js:1207` | `save/saveSystem.js:189`, `systems/scanner.js:836`, `ui/commandBar.js:430`, `ui/promptDeck.js:709` |
| `game:loadingProgress` | `main.js:148`, `main.js:166`, `main.js:647`, `main.js:728`, `main.js:744`, `main.js:763`, `main.js:781`, `main.js:822`, `main.js:959` | `ui/loadingPresenter.js:319`, `ui/screens/newGame.js:815`, `ui/screens/saveLoad.js:811` |
| `game:new` | `main.js:414`, `ui/sandbox/sandboxSetup.js:359`, `ui/screens/crucible.js:2579`, `ui/screens/gameOver.js:404`, `ui/screens/newGame.js:894` | `audio/audioSystem.js:2085`, `audio/bombAudio.js:352`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:197`, `main.js:228`, `render/feel.js:1090`, `render/vfx.js:2323`, `save/saveSystem.js:252`, `systems/aftermathWrecks.js:920`, `systems/aiEncounter.js:114`, `systems/bombs.js:251`, `systems/cloak.js:71`, `systems/combatOutcome.js:165`, `systems/countermeasures.js:132`, `systems/difficultyDirector.js:168`, `systems/encounterDirector.js:269`, `systems/environmentalMachinery.js:156`, `systems/fields.js:368`, `systems/impulseCharges.js:230`, `systems/massSeed.js:120`, `systems/masslineSnares.js:129`, `systems/mines.js:41`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:274`, `systems/salvageActions.js:99`, `systems/scanner.js:835`, `systems/surrenderRecovery.js:77`, `systems/survivorPod.js:410`, `systems/tetherGameplay.js:206`, `systems/tumbleStates.js:97`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/moralTrapPrompt.js:44`, `ui/priceHistory.js:146`, `ui/promptDeck.js:708`, `ui/screens/crucibleLabControls.js:546` |
| `game:newGame` | `main.js:492` | `audio/audioSystem.js:2086`, `audio/bombAudio.js:353`, `core/coreSystem.js:198`, `render/shipMicroMotion.js:1178`, `render/vfx.js:2324`, `save/saveSystem.js:256`, `systems/aftermathWrecks.js:921`, `systems/bombs.js:254`, `systems/cloak.js:72`, `systems/collisionConsequences.js:62`, `systems/combatOutcome.js:171`, `systems/countermeasures.js:133`, `systems/difficultyDirector.js:169`, `systems/fieldDepletion.js:705`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:382`, `systems/salvageActions.js:100`, `systems/survivorPod.js:409`, `systems/titles.js:400`, `systems/tumbleStates.js:98`, `systems/wingMorale.js:180`, `ui/cargoConscience.js:147`, `ui/uiRoot.js:531` |
| `game:over` | `systems/combat.js:643`, `systems/combat.js:757` | `ui/uiRoot.js:1255` |
| `game:save` | `ui/input.js:307`, `ui/input.js:480`, `ui/screens/saveLoad.js:1227` | `save/saveSystem.js:178` |
| `game:scenePrepared` | `main.js:553` | `ui/sandbox/sandboxSetup.js:383` |
| `game:startFailed` | `main.js:912` | `ui/loadingPresenter.js:330`, `ui/sandbox/sandboxSetup.js:388`, `ui/screens/crucibleLabControls.js:548`, `ui/screens/newGame.js:814`, `ui/screens/saveLoad.js:817` |
| `game:started` | `main.js:656` | `audio/audioSystem.js:2091`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:199`, `save/saveSystem.js:249`, `save/saveSystem.js:263`, `sim/killcamTape.js:426`, `systems/automation.js:559`, `systems/collisionConsequences.js:61`, `systems/combat.js:527`, `systems/economyContracts.js:167`, `systems/factions.js:214`, `systems/flight.js:79`, `systems/flightV3.js:155`, `systems/heat.js:261`, `systems/lootShards.js:543`, `systems/masslineSnares.js:130`, `systems/missions.js:1068`, `systems/onboarding.js:332`, `systems/presentationAdapters.js:200`, `systems/presentationOrchestrator.js:275`, `systems/sectorSim.js:99`, `systems/ships.js:1537`, `systems/story.js:135`, `systems/surrenderRecovery.js:78`, `systems/tetherGameplay.js:207`, `ui/alerts.js:351`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:380`, `ui/screens/crucibleLabControls.js:547`, `ui/uiRoot.js:1240`, `ui/uiRoot.js:1298`, `ui/uiRoot.js:1300` |
| `gamepad:connected` | `systems/gamepad.js:441` | — |
| `gamepad:disconnected` | `systems/gamepad.js:412` | — |
| `gate:range` | `core/physics.js:1097`, `core/physics.js:1101` | `systems/onboarding.js:450`, `systems/presentationOrchestrator.js:178`, `ui/alerts.js:332` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:565`, `systems/story.js:495`, `systems/story.js:509`, `systems/story.js:541`, `systems/story.js:1238`, `systems/story.js:1585`, `systems/story.js:1753`, `systems/uniqueWrecks.js:1479` | `systems/ships.js:1532`, `ui/screens/codex.js:631` |
| `harasser:disengaged` | `systems/encounterDirector.js:2083` | — |
| `hazard:changed` | `systems/world.js:656` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:874`, `systems/world.js:4853` | `data/hazardLanguage.js:129`, `render/shipMicroMotion.js:1183` |
| `hazard:exit` | `systems/environmentalMachinery.js:883`, `systems/world.js:4860` | `data/hazardLanguage.js:130`, `render/shipMicroMotion.js:1184` |
| `heat:changed` | `systems/heat.js:592` | `audio/audioSystem.js:1888`, `render/vfx.js:2320`, `systems/barkDirector.js:288`, `systems/lawSecurity.js:275`, `systems/onboarding.js:415`, `ui/hud.js:3875` |
| `heat:clear` | — | `systems/heat.js:265` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:847` | `systems/missions.js:1179` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1213` | — |
| `heist:captureFork` | `systems/heistFacilities.js:1468` | `systems/missions.js:1188` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1355` | `systems/missions.js:1184` |
| `heist:launchCue` | `systems/heistFacilities.js:339` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:457`, `systems/heistFacilities.js:466`, `systems/heistFacilities.js:470`, `systems/heistFacilities.js:484` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:1867` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:1809` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:1790` | `systems/npcJobsRuntime.js:891` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:1728` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:249` |
| `hud:firstUse` | `systems/onboarding.js:587` | `ui/hud.js:2053` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:279` |
| `hud:phase` | `systems/story.js:252`, `systems/story.js:282`, `systems/story.js:285`, `systems/story.js:582` | `ui/hudMeta.js:142` |
| `hud:recallObjective` | `ui/input.js:326` | `ui/hud.js:1574` |
| `hud:slotClaim` | `ui/promptDeck.js:229` | `ui/hud.js:1945` |
| `hud:slotRelease` | `ui/promptDeck.js:230` | `ui/hud.js:1946` |
| `hud:tagFlicker` | `systems/story.js:559` | `ui/hudMeta.js:176` |
| `hull:fractured` | `systems/hullFracture.js:178` | — |
| `interdiction:triggered` | `systems/encounterScripts.js:590`, `systems/world.js:4373` | `systems/presentationOrchestrator.js:186`, `systems/sectorSim.js:105` |
| `intervention:available` | `systems/intervention.js:206` | — |
| `intervention:closed` | `systems/intervention.js:259` | — |
| `intervention:logged` | `systems/intervention.js:118` | — |
| `jump:arrive` | `systems/world.js:4314` | `render/feel.js:1231`, `render/shipMicroMotion.js:1188`, `save/saveSystem.js:270`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:184`, `systems/sectorSim.js:114` |
| `jump:chargeAbort` | `systems/world.js:4451`, `systems/world.js:4519`, `systems/world.js:4577` | `render/shipMicroMotion.js:1189`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:183`, `systems/routeFollower.js:324` |
| `jump:chargeStart` | `systems/world.js:4504`, `systems/world.js:4543` | `render/feel.js:1221`, `render/shipMicroMotion.js:1185`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:180`, `systems/story.js:155` |
| `jump:chargeTick` | `systems/world.js:4257` | `render/shipMicroMotion.js:1186`, `systems/presentationOrchestrator.js:181` |
| `jump:departurePreflight` | `systems/world.js:4488` | `systems/story.js:154` |
| `jump:start` | `systems/world.js:4274` | `render/feel.js:1225`, `render/shipMicroMotion.js:1187`, `systems/economy.js:927`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:182`, `systems/sectorSim.js:113` |
| `jump:unfiledConfirmed` | `systems/world.js:4561` | `systems/story.js:156` |
| `landmark:artifactRecovered` | `systems/missions.js:4256` | `systems/world.js:522` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:39` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:284` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:70` | `systems/lawSecurity.js:276` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:30` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:31` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:41` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:43`, `systems/heat.js:275`, `ui/impoundPayPrompt.js:32` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:33` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:42` |
| `law:incidentOpened` | — | `systems/traffic.js:1343` |
| `law:killedAdjudicated` | — | `systems/factions.js:229` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:287`, `systems/factions.js:289`, `systems/heat.js:286` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:271` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:286` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:285` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:299` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `systems/lawSecurity.js:264` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:719`, `systems/lootShards.js:1031`, `systems/stuntGrammar.js:110` | `systems/mining.js:187`, `ui/floatingText.js:200`, `ui/floatingText.js:203` |
| `loot:magnetCaptured` | `systems/lootShards.js:612` | — |
| `loot:manifestPayload` | `systems/lootShards.js:1137` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:342` | `systems/factionPresence.js:426`, `systems/ships.js:1486` |
| `map:sectorCharted` | `systems/world.js:3421` | `systems/economy.js:872` |
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
| `massline:bridleCut` | `systems/tetherGameplay.js:808` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:753`, `systems/tetherGameplay.js:769`, `systems/tetherGameplay.js:938` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:617` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:671` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:818` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:1933` | — |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:2088` | — |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1556` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:1677` | — |
| `massline:recovered` | `systems/tumbleStates.js:217` | — |
| `massline:recovering` | `systems/tumbleStates.js:176` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:179` | — |
| `massline:releaseValidated` | `systems/masslineThrow.js:595` | `systems/presentationOrchestrator.js:161` |
| `massline:releaseWindow` | `systems/masslineThrow.js:240` | — |
| `massline:selfSling` | `systems/masslineThrow.js:622` | `systems/flightV3.js:157`, `systems/onboarding.js:549` |
| `massline:snareArmed` | `systems/masslineSnares.js:223` | — |
| `massline:snareCaught` | `systems/masslineSnares.js:418` | — |
| `massline:snareCut` | `systems/masslineSnares.js:532` | — |
| `massline:snareDeployed` | `systems/masslineSnares.js:325` | — |
| `massline:snareEnded` | `systems/masslineSnares.js:534` | — |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `systems/masslineImpactDamage.js:42`, `systems/presentationOrchestrator.js:148` |
| `massline:tangentMeeting` | `systems/masslineThrow.js:755` | — |
| `massline:threat` | `systems/masslineThreats.js:216` | `systems/presentationOrchestrator.js:124` |
| `massline:throw` | `systems/masslineThrow.js:537` | `systems/lootShards.js:541`, `systems/mines.js:38`, `systems/missions.js:1167`, `systems/tumbleStates.js:90` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:175` | `render/feel.js:1316` |
| `massline:tumbled` | `systems/tumbleStates.js:408` | `render/feel.js:1302` |
| `mines:armed` | `systems/mines.js:139`, `systems/mines.js:172` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:57` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:147`, `systems/survivalArena.js:1051` | `systems/mines.js:37` |
| `mines:placed` | `systems/mines.js:112` | `systems/survivalArena.js:844` |
| `mines:released` | `systems/mines.js:265` | — |
| `mines:triggered` | `systems/mines.js:230` | — |
| `mining:beamLocked` | `systems/mining.js:722` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:1737` | `systems/missions.js:1128`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:736` | `systems/presentationOrchestrator.js:206`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:566` | — |
| `mining:npcExtraction` | `systems/traffic.js:8653` | `systems/fieldDepletion.js:704` |
| `mining:podSplit` | `systems/mining.js:1312` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:1690` | `render/asteroidMotionPresentation.js:455`, `systems/presentationOrchestrator.js:203` |
| `mining:richCoreCompleted` | `systems/mining.js:1717` | `render/asteroidMotionPresentation.js:456`, `systems/presentationOrchestrator.js:204` |
| `mining:richCoreExposed` | `systems/mining.js:1668` | `render/asteroidMotionPresentation.js:454`, `systems/presentationOrchestrator.js:202` |
| `mining:richCoreFizzle` | `systems/mining.js:1719` | `render/asteroidMotionPresentation.js:457`, `systems/presentationOrchestrator.js:205` |
| `mining:seamHit` | `systems/mining.js:1965` | `audio/audioSystem.js:1981`, `systems/presentationOrchestrator.js:195` |
| `mining:start` | `systems/mining.js:269`, `systems/mining.js:391`, `systems/mining.js:1264` | `audio/audioSystem.js:1816`, `render/asteroidMotionPresentation.js:449`, `render/vfx.js:2333`, `systems/onboarding.js:355`, `systems/presentationOrchestrator.js:192` |
| `mining:stop` | `systems/mining.js:514` | `audio/audioSystem.js:1817`, `render/asteroidMotionPresentation.js:450`, `render/vfx.js:2334`, `systems/presentationOrchestrator.js:193` |
| `mining:tick` | `systems/automation.js:995`, `systems/mining.js:757` | `audio/audioSystem.js:1818`, `render/vfx.js:2335`, `systems/presentationOrchestrator.js:194` |
| `mining:ventBonus` | `systems/mining.js:602` | — |
| `mining:ventReady` | `systems/mining.js:547` | `systems/presentationOrchestrator.js:199` |
| `mining:yield` | `balance/careerCohorts.js:1852`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:599`, `systems/mining.js:876`, `systems/mining.js:1387`, `systems/mining.js:1714` | `audio/audioSystem.js:1977`, `careers/origins/prospectorOrigin.js:636`, `render/vfx.js:2338`, `systems/encounterDirector.js:297`, `systems/missions.js:1122`, `systems/onboarding.js:356`, `systems/presentationOrchestrator.js:200`, `ui/floatingText.js:185` |
| `miningDrone:sellOre` | — | `systems/economy.js:887` |
| `mission:abandon` | `systems/moralTrap.js:204` | `systems/missions.js:1081` |
| `mission:accepted` | `systems/missions.js:2873` | `audio/audioSystem.js:1849`, `save/saveSystem.js:271`, `systems/aftermathWrecks.js:916`, `systems/contractClauses.js:226`, `systems/economy.js:848`, `systems/moralTrap.js:122`, `systems/onboarding.js:358`, `ui/hud.js:3855`, `ui/screens/missionLog.js:2420` |
| `mission:completed` | `systems/missions.js:6180` | `audio/audioSystem.js:1850`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:272`, `systems/aftermathWrecks.js:917`, `systems/claims.js:279`, `systems/contractClauses.js:230`, `systems/factions.js:318`, `systems/lossLedger.js:381`, `systems/onboarding.js:359`, `systems/story.js:177`, `ui/hud.js:3856`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2421` |
| `mission:conditionBroken` | `systems/contractClauses.js:348`, `systems/missions.js:1402` | — |
| `mission:conditionPending` | `systems/missions.js:1455` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:316`, `systems/missions.js:1385` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:327`, `systems/missions.js:1393` | `systems/missions.js:1209` |
| `mission:expired` | `systems/missions.js:6489` | `audio/audioSystem.js:1854`, `save/saveSystem.js:274`, `systems/aftermathWrecks.js:919`, `systems/factions.js:327`, `ui/screens/missionLog.js:2423` |
| `mission:failed` | `systems/missions.js:6443` | `audio/audioSystem.js:1853`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:273`, `systems/aftermathWrecks.js:918`, `systems/factions.js:326`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2422` |
| `mission:forceEvent` | — | `systems/economy.js:932` |
| `mission:offerBoarded` | `systems/missions.js:2172` | `systems/aftermathWrecks.js:915` |
| `mission:offered` | `systems/aftermathWrecks.js:1637`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:232`, `systems/economyContracts.js:254`, `systems/lossLedger.js:318`, `systems/postEndingReplay.js:340`, `systems/salvage.js:566`, `systems/uniqueWrecks.js:812` | `systems/economy.js:847`, `systems/lossInvestigation.js:106`, `systems/missions.js:1086`, `systems/survivorPod.js:407` |
| `mission:setPieceTransition` | `systems/missions.js:6008` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:7209` | — |
| `mission:spawnDeferred` | `systems/missions.js:7056` | — |
| `mission:updated` | `systems/contractClauses.js:321`, `systems/contractClauses.js:331`, `systems/contractClauses.js:360`, `systems/missions.js:1389`, `systems/missions.js:1397`, `systems/missions.js:1415`, `systems/missions.js:1490`, `systems/missions.js:1594`, `systems/missions.js:1695`, `systems/missions.js:1765`, `systems/missions.js:1995`, `systems/missions.js:2029`, `systems/missions.js:2041`, `systems/missions.js:2171`, `systems/missions.js:2800`, `systems/missions.js:2885`, `systems/missions.js:3034`, `systems/missions.js:3238`, `systems/missions.js:3860`, `systems/missions.js:3896`, `systems/missions.js:3909`, `systems/missions.js:3917`, `systems/missions.js:3933`, `systems/missions.js:3971`, `systems/missions.js:4032`, `systems/missions.js:4133`, `systems/missions.js:4142`, `systems/missions.js:4289`, `systems/missions.js:4315`, `systems/missions.js:4383`, `systems/missions.js:4399`, `systems/missions.js:4441`, `systems/missions.js:4462`, `systems/missions.js:4498`, `systems/missions.js:4550`, `systems/missions.js:5550`, `systems/missions.js:5705`, `systems/missions.js:5751`, `systems/missions.js:5824`, `systems/missions.js:5831`, `systems/missions.js:6169`, `systems/missions.js:6466`, `systems/missions.js:6499`, `systems/missions.js:6829`, `systems/missions.js:7033`, `systems/missions.js:7047`, `systems/missions.js:7143`, `systems/missions.js:7291`, `systems/missions.js:7573`, `systems/missions.js:7719` | `ui/hud.js:3854`, `ui/screens/missionLog.js:2419`, `ui/station/screens/contracts.js:1073` |
| `mode:changed` | `main.js:252`, `main.js:889`, `main.js:899`, `main.js:910`, `save/saveSystem.js:3010`, `save/saveSystem.js:3145` | `systems/autoTargetAssist.js:96`, `systems/presentationAdapters.js:199`, `systems/scanner.js:838`, `ui/loadingPresenter.js:320`, `ui/screenManager.js:601`, `ui/uiRoot.js:799`, `ui/wingmanRadial.js:246` |
| `module:equipped` | `systems/ships.js:2101` | `systems/onboarding.js:395`, `systems/ships.js:1435`, `systems/world.js:493` |
| `module:granted` | `systems/ships.js:1906` | — |
| `module:purchased` | `systems/ships.js:1893` | — |
| `module:unequipped` | `systems/ships.js:1592`, `systems/ships.js:2120` | `systems/ships.js:1436`, `systems/world.js:494` |
| `moment:amended` | `systems/bulletTime.js:240` | — |
| `moment:holyShit` | — | `render/feel.js:1291` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:289` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | — |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:121` |
| `moralTrap:resolved` | `systems/moralTrap.js:200` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:163` | `ui/moralTrapPrompt.js:37` |
| `namedAce:appeared` | `systems/encounterScripts.js:2778` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:303` |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:404`, `systems/flightV3.js:1005`, `systems/world.js:4631` | `systems/routeFollower.js:319` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:3452`, `systems/claims.js:1326`, `systems/claims.js:1334`, `systems/missions.js:1100`, `systems/missions.js:3227`, `systems/missions.js:3294`, `systems/missions.js:3326`, `systems/missions.js:3878`, `systems/world.js:4630`, `ui/market/tradeLogic.js:483` | — |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:123` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:188` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:119` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `news:dockCards` | `ui/marketNews.js:364` | — |
| `news:headline` | `systems/aftermathWrecks.js:758`, `systems/e1EncounterRuntime.js:225`, `systems/nemesisSignals.js:25`, `systems/traffic.js:8301`, `systems/traffic.js:10047`, `ui/marketNews.js:256` | — |
| `news:publish` | `systems/aftermathWrecks.js:776`, `systems/choirReliefBerth.js:175`, `systems/claims.js:1762`, `systems/claims.js:2180`, `systems/claims.js:2227`, `systems/memorialThief.js:126`, `systems/npcJobsRuntime.js:1027`, `systems/traffic.js:3195`, `systems/traffic.js:9659`, `systems/uniqueWrecks.js:396`, `systems/uniqueWrecks.js:1523`, `systems/world.js:665` | — |
| `news:render` | `ui/hud.js:1486` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1328` |
| `npcjobs:load` | — | `systems/traffic.js:1326` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1003` | — |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:996` | — |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:987` | — |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:985` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3002` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:4088` | — |
| `npcjobs:unload` | — | `systems/traffic.js:1327` |
| `npcjobs:work` | — | `systems/traffic.js:1325` |
| `onboarding:rangePrompt` | `systems/onboarding.js:1634`, `systems/onboarding.js:2438` | — |
| `optic:beamContact` | `systems/combat.js:1137` | — |
| `optic:contact` | `systems/weapons.js:2055`, `systems/weapons.js:2116` | `audio/audioSystem.js:1777` |
| `optic:rekindled` | — | `audio/audioSystem.js:1778` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1072` | `systems/world.js:500` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1691` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1097` | — |
| `orrinWitness:submitted` | `systems/story.js:1125` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:5565` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:502` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:5361` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:5396` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:5525` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:5479` | `ui/recoveryEncounterPrompt.js:478` |
| `patrol:proximity` | `systems/encounterScripts.js:438` | `systems/economy.js:928`, `systems/moralTrap.js:120` |
| `pds:intercept` | `systems/countermeasures.js:319` | — |
| `physics:attachmentBroken` | — | `combat/kernel.js:159` |
| `physics:impact` | `core/physics.js:1633` | `audio/audioSystem.js:1772`, `render/asteroidMotionPresentation.js:446`, `render/feel.js:1268`, `render/shipMicroMotion.js:1182`, `render/vfx.js:2290`, `systems/asteroidSites.js:228`, `systems/barkDirector.js:291`, `systems/collisionConsequences.js:56`, `systems/fields.js:381`, `systems/fragileCargo.js:202`, `systems/gamepad.js:322`, `systems/heistFacilities.js:248`, `systems/impulseCharges.js:224`, `systems/lootShards.js:540`, `systems/masslineImpactDamage.js:43`, `systems/ships.js:1509` |
| `pickup:collected` | `core/physics.js:1473`, `systems/mining.js:1116`, `systems/mining.js:1819`, `systems/uniqueWrecks.js:1404` | `audio/audioSystem.js:1826`, `render/vfx.js:2364`, `save/saveSystem.js:228`, `systems/economy.js:898`, `systems/encounterDirector.js:274`, `systems/lawSecurity.js:267`, `systems/mining.js:189`, `systems/onboarding.js:357`, `systems/onboarding.js:414`, `systems/presentationOrchestrator.js:207`, `systems/swarmSupply.js:107`, `systems/traffic.js:1336`, `systems/world.js:503`, `systems/world.js:504`, `ui/floatingText.js:222` |
| `pirateDisengage:triggered` | — | `systems/combatOutcome.js:187` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:132` | `systems/pirateParley.js:77` |
| `pirateParley:demand` | `systems/scanner.js:1243` | `ui/pirateParleyPrompt.js:160` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:186`, `ui/pirateParleyPrompt.js:161` |
| `pirateParley:started` | — | `systems/combatOutcome.js:185` |
| `planet:collector` | `systems/planetRuntime.js:507` | — |
| `planet:harvest` | `systems/planetRuntime.js:540` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:544` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:407`, `systems/planetRuntime.js:419` | — |
| `planet:recoveryBurn` | `systems/planetRuntime.js:485` | — |
| `planet:registered` | `systems/planetRuntime.js:195` | — |
| `planet:unregistered` | `systems/planetRuntime.js:256` | — |
| `player:death` | `systems/combat.js:642`, `systems/combat.js:756`, `systems/combat.js:936`, `systems/world.js:4971` | `audio/audioSystem.js:1814`, `render/feel.js:1176`, `render/shipMicroMotion.js:1193`, `render/vfx.js:2332`, `save/saveSystem.js:235`, `systems/aftermathWrecks.js:907`, `systems/lawSecurity.js:266`, `systems/onboarding.js:388`, `systems/onboarding.js:413`, `systems/surrenderRecovery.js:73`, `systems/survivalResults.js:455`, `systems/survivalRun.js:123`, `systems/survivorPod.js:413`, `ui/commandBar.js:405`, `ui/hud.js:2425`, `ui/survivalHud.js:225` |
| `player:recoveryFailed` | `systems/combat.js:809` | `ui/screens/gameOver.js:436` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:379` | `systems/combat.js:521` |
| `player:respawn` | `systems/combat.js:873`, `systems/combat.js:949` | `audio/audioSystem.js:1815`, `render/shipMicroMotion.js:1192`, `save/saveSystem.js:236`, `save/saveSystem.js:286`, `ui/commandBar.js:409`, `ui/hud.js:2439`, `ui/screens/gameOver.js:428` |
| `player:scannedByPatrol` | `systems/economy.js:2562` | `render/vfx.js:2319`, `systems/missions.js:1203`, `ui/customsPrompt.js:138` |
| `poi:discovered` | `systems/world.js:694`, `systems/world.js:4764`, `systems/world.js:4809`, `systems/world.js:5084`, `systems/world.js:5110` | `systems/encounterDirector.js:291`, `systems/world.js:528` |
| `poi:identified` | `systems/world.js:4816`, `systems/world.js:5111` | `systems/encounterDirector.js:292`, `systems/missions.js:1087`, `systems/world.js:529` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2442` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2441` |
| `presentation:audioCue` | `render/vfx.js:5380`, `systems/presentationAdapters.js:546` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:468` | — |
| `presentation:caption` | `audio/audioSystem.js:4630`, `systems/factionPresence.js:764`, `systems/factionPresence.js:1103`, `systems/factionPresence.js:1118`, `systems/factionPresence.js:1136`, `systems/factionPresence.js:1198`, `systems/presentationAdapters.js:638`, `systems/story.js:1016`, `systems/story.js:1180` | `ui/hud.js:2488` |
| `presentation:cue` | — | `audio/audioSystem.js:1927`, `render/vfx.js:2358`, `render/vfx.js:2359`, `render/vfx.js:2360`, `systems/presentationAdapters.js:196` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:450` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:371`, `systems/presentationAdapters.js:617` | — |
| `presentation:vfxCue` | `render/vfx.js:2377`, `systems/countermeasures.js:327`, `systems/fields.js:2086`, `systems/fields.js:2105`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:544`, `systems/missions.js:2898`, `systems/missions.js:6185`, `systems/planetRuntime.js:564`, `systems/presentationAdapters.js:514`, `systems/tumbleStates.js:410`, `systems/tumbleStates.js:440`, `systems/weapons.js:1604`, `systems/weapons.js:1781`, `systems/weapons.js:2784` | `render/vfx.js:2363` |
| `projectile:bank` | — | `render/vfx.js:2284` |
| `projectile:hit` | `core/physics.js:821`, `core/physics.js:995`, `systems/sectorSim.js:548` | `audio/audioSystem.js:1762`, `combat/tetherWebs.js:27`, `render/vfx.js:2283`, `systems/bombs.js:259`, `systems/combat.js:514`, `systems/missions.js:1168` |
| `projectile:nearMiss` | `core/physics.js:955` | `audio/audioSystem.js:1765`, `systems/presentationOrchestrator.js:172`, `ui/hud.js:1980` |
| `projectile:ricochet` | — | `render/vfx.js:2285` |
| `range:opened` | `ui/screens/range.js:1397` | `systems/onboarding.js:400` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:157` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:158` |
| `rescue:beat` | `systems/onboarding.js:1810`, `systems/onboarding.js:1842` | — |
| `rescue:complete` | `systems/onboarding.js:1821` | — |
| `rescue:started` | `systems/onboarding.js:1405` | `systems/onboarding.js:389` |
| `research:pointsChanged` | `systems/missions.js:4166`, `systems/missions.js:4218`, `systems/missions.js:6128`, `systems/missions.js:6136`, `systems/missions.js:7533` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2385` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1154` | `systems/encounterDirector.js:298` |
| `rhythm:phase` | `systems/encounterDirector.js:420` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:317` | — |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:114` |
| `run:awardRequested` | — | `systems/runSession.js:53` |
| `run:awarded` | — | `ui/survivalHud.js:205` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1096`, `ui/sandbox/sandboxSetup.js:1135` | `systems/runSession.js:50` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:682`, `ui/screens/crucibleDraft.js:687`, `ui/screens/crucibleDraft.js:1041` | `systems/survivalDraft.js:99` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:771` | `systems/survivalDraft.js:103` |
| `run:draftResolved` | — | `systems/survivalRun.js:117` |
| `run:endRequested` | `save/saveSystem.js:199` | `systems/runSession.js:52` |
| `run:ended` | — | `systems/survivalAnnounce.js:298`, `systems/survivalArena.js:836`, `systems/survivalDraft.js:108`, `systems/survivalResults.js:484`, `systems/survivalRun.js:111`, `systems/survivalWave.js:94`, `systems/swarmArena.js:429`, `systems/swarmChain.js:108`, `systems/swarmSupply.js:109` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:120` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:296`, `ui/survivalHud.js:206` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1157` | `systems/ships.js:1541`, `systems/survivalRun.js:112`, `systems/swarmSupply.js:102`, `systems/world.js:524` |
| `run:modifierChosen` | — | `systems/survivalRun.js:118` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:55` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1158` | `systems/survivalRun.js:113` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1136`, `ui/screens/crucibleDraft.js:1153` | `systems/survivalDraft.js:100` |
| `run:refitClosed` | — | `systems/survivalRun.js:119` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:1474` | `systems/survivalDraft.js:101` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:1470` | `systems/survivalDraft.js:102` |
| `run:resultsReady` | — | `systems/achievements.js:785`, `ui/uiRoot.js:1276` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:107` |
| `run:spendRequested` | — | `systems/runSession.js:54` |
| `run:spent` | — | `systems/survivalDraft.js:106` |
| `run:started` | — | `sim/killcamTape.js:425`, `systems/survivalAnnounce.js:291`, `systems/survivalResults.js:444`, `systems/survivalRun.js:109`, `ui/survivalHud.js:207`, `ui/uiRoot.js:1297` |
| `run:threatRequested` | — | `systems/runSession.js:56` |
| `run:transitionRequested` | `systems/survivalRun.js:497` | `systems/runSession.js:51` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:297`, `systems/survivalDraft.js:98`, `systems/survivalResults.js:483`, `systems/survivalRun.js:110`, `systems/survivalWave.js:93`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:295`, `systems/survivalArena.js:835`, `systems/survivalResults.js:447` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:115` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:294` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:456` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:292`, `systems/survivalArena.js:802`, `systems/survivalWave.js:91`, `systems/swarmArena.js:426`, `ui/survivalHud.js:218` |
| `run:waveProgress` | — | `ui/survivalHud.js:219` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:293`, `systems/survivalResults.js:446`, `systems/survivalWave.js:92`, `systems/swarmArena.js:427` |
| `salvage:actionRead` | `systems/salvageActions.js:170` | — |
| `salvage:communicatorFound` | `systems/salvage.js:567` | `systems/encounterDirector.js:293`, `systems/story.js:202` |
| `salvage:completed` | `systems/mining.js:1392` | `render/vfx.js:2337`, `systems/aftermathWrecks.js:912`, `systems/lawSecurity.js:273`, `systems/missions.js:1126` |
| `salvage:cutComplete` | `systems/mining.js:419` | `audio/audioSystem.js:1833`, `render/vfx.js:2336` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | — |
| `salvage:npcExtraction` | `systems/traffic.js:6038` | — |
| `salvage:npcUnload` | `systems/traffic.js:9781` | `systems/economy.js:902` |
| `salvage:placed` | `systems/salvage.js:332` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:405` |
| `salvage:reactorBurst` | `systems/salvageActions.js:278` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:232` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:184` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:95` |
| `save:backup` | `save/saveSystem.js:1162` | — |
| `save:completed` | `save/saveSystem.js:1168` | `ui/screens/saveLoad.js:828`, `ui/uiRoot.js:355` |
| `save:dirty` | — | `save/saveSystem.js:212` |
| `save:error` | `main.js:157`, `save/saveSystem.js:777`, `save/saveSystem.js:878`, `save/saveSystem.js:896`, `save/saveSystem.js:1172`, `save/saveSystem.js:1451`, `save/saveSystem.js:1913`, `save/saveSystem.js:2666`, `save/saveSystem.js:2674`, `save/saveSystem.js:2709`, `save/saveSystem.js:2719`, `save/saveSystem.js:2735`, `save/saveSystem.js:2802`, `save/saveSystem.js:2835`, `save/saveSystem.js:2872`, `save/saveSystem.js:2911`, `save/saveSystem.js:3168`, `save/saveSystem.js:3176`, `save/saveSystem.js:3203`, `save/saveSystem.js:3677`, `save/saveSystem.js:3690`, `save/saveSystem.js:3705`, `save/saveSystem.js:3718`, `ui/screens/saveLoad.js:1280` | `systems/aftermathWrecks.js:924`, `systems/asteroidSites.js:227`, `systems/automation.js:554`, `systems/encounterDirector.js:266`, `ui/loadingPresenter.js:331`, `ui/screenManager.js:602`, `ui/uiRoot.js:381` |
| `save:exportRecovery` | `save/saveSystem.js:3666` | — |
| `save:loaded` | `save/saveSystem.js:3148` | `audio/audioSystem.js:2076`, `audio/bombAudio.js:354`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:188`, `core/physics.js:130`, `main.js:213`, `render/feel.js:1092`, `render/shipMicroMotion.js:1177`, `render/vfx.js:2326`, `save/saveSystem.js:248`, `save/saveSystem.js:264`, `systems/aftermathWrecks.js:923`, `systems/aiEncounter.js:112`, `systems/asteroidFormations.js:122`, `systems/asteroidSites.js:218`, `systems/autoTargetAssist.js:111`, `systems/automation.js:549`, `systems/barkDirector.js:272`, `systems/beacons.js:45`, `systems/bombs.js:258`, `systems/collisionConsequences.js:60`, `systems/combat.js:528`, `systems/combatOutcome.js:162`, `systems/countermeasures.js:134`, `systems/difficultyDirector.js:167`, `systems/economy.js:936`, `systems/encounterDirector.js:265`, `systems/environmentalMachinery.js:158`, `systems/factionPresence.js:432`, `systems/fields.js:369`, `systems/flight.js:75`, `systems/flightV3.js:148`, `systems/gateControlDirector.js:71`, `systems/heat.js:262`, `systems/heistFacilities.js:252`, `systems/impulseCharges.js:231`, `systems/lawSecurity.js:263`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:131`, `systems/mines.js:42`, `systems/missions.js:1070`, `systems/npcJobsRuntime.js:845`, `systems/npcJobsRuntime.js:853`, `systems/onboarding.js:336`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:203`, `systems/presentationOrchestrator.js:276`, `systems/routeFollower.js:336`, `systems/runSession.js:61`, `systems/salvageActions.js:98`, `systems/sectorSim.js:98`, `systems/ships.js:1446`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:96`, `systems/story.js:136`, `systems/survivalArena.js:850`, `systems/survivorPod.js:411`, `systems/tetherGameplay.js:205`, `systems/titles.js:399`, `systems/traffic.js:1351`, `systems/travelLanes.js:483`, `systems/tumbleStates.js:96`, `systems/uniqueLootAbilities.js:136`, `systems/world.js:509`, `ui/alerts.js:352`, `ui/automationPayoff.js:76`, `ui/bandHud.js:91`, `ui/capitalBossOverlayMount.js:93`, `ui/cargoConscience.js:146`, `ui/hudLayout.js:120`, `ui/moralTrapPrompt.js:43`, `ui/priceHistory.js:147`, `ui/uiRoot.js:362`, `ui/uiRoot.js:1301` |
| `save:recovered` | `save/saveSystem.js:2698` | `ui/uiRoot.js:374` |
| `save:restoring` | `save/saveSystem.js:2933` | `core/coreSystem.js:185`, `render/feel.js:1091`, `render/vfx.js:2325`, `systems/aftermathWrecks.js:922`, `systems/asteroidSites.js:210`, `systems/autoTargetAssist.js:108`, `systems/automation.js:543`, `systems/encounterDirector.js:258`, `systems/environmentalMachinery.js:157`, `systems/lawSecurity.js:262`, `systems/missions.js:1074`, `systems/npcJobsRuntime.js:846`, `systems/runSession.js:60`, `systems/salvage.js:78`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:74`, `systems/traffic.js:1344`, `systems/world.js:505` |
| `save:started` | `save/saveSystem.js:881`, `save/saveSystem.js:1505` | `ui/screenManager.js:609`, `ui/uiRoot.js:351` |
| `scan:completed` | `balance/careerCohorts.js:484`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:976`, `systems/world.js:4768` | `careers/origins/prospectorOrigin.js:633`, `systems/missions.js:1139`, `systems/onboarding.js:369`, `systems/presentationOrchestrator.js:188`, `systems/salvage.js:75`, `systems/salvageActions.js:94`, `systems/story.js:191`, `systems/story.js:192`, `ui/hud.js:4307` |
| `scan:pulse` | `systems/scanner.js:903` | `render/shipMicroMotion.js:1202`, `systems/buildIdentity.js:277`, `systems/cloak.js:75`, `systems/encounterDirector.js:283`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:187`, `systems/scanReveal.js:23`, `ui/hud.js:4308` |
| `scan:shipRevealed` | `systems/scanReveal.js:46` | `systems/buildIdentity.js:276` |
| `scan:weakPoint` | `systems/scanner.js:965` | `ui/hud.js:1531` |
| `scan:wreckInvestigated` | `systems/scanReveal.js:77` | — |
| `scan:wreckResolved` | `systems/scanner.js:925` | `systems/lawSecurity.js:272` |
| `scan:wreckRevealed` | `systems/scanReveal.js:74` | — |
| `scanner:ghostEscaped` | `systems/scanner.js:883` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:944` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:94` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:273` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:516`, `ui/comms.js:520` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:793` | `systems/presentationOrchestrator.js:185` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:806` | `audio/audioSystem.js:1900`, `audio/bombAudio.js:351`, `render/shipMicroMotion.js:1176`, `render/vfx.js:2321`, `save/saveSystem.js:269`, `systems/aftermathWrecks.js:910`, `systems/aiEncounter.js:113`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:203`, `systems/automation.js:579`, `systems/bombs.js:250`, `systems/claims.js:274`, `systems/claims.js:276`, `systems/combatOutcome.js:177`, `systems/difficultyDirector.js:170`, `systems/economy.js:921`, `systems/encounterDirector.js:254`, `systems/factionPresence.js:423`, `systems/fields.js:367`, `systems/heistFacilities.js:245`, `systems/intervention.js:65`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:128`, `systems/mines.js:40`, `systems/mining.js:192`, `systems/missions.js:1220`, `systems/moralTrap.js:118`, `systems/npcJobsRuntime.js:834`, `systems/presentationOrchestrator.js:226`, `systems/routeFollower.js:328`, `systems/salvage.js:71`, `systems/salvageActions.js:101`, `systems/sectorSim.js:95`, `systems/story.js:153`, `systems/story.js:190`, `systems/survivalArena.js:848`, `systems/survivorPod.js:406`, `systems/tetherGameplay.js:209`, `systems/traffic.js:1314`, `systems/wingmen.js:48`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:150`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:736` | `audio/bombAudio.js:350`, `render/vfx.js:2322`, `systems/aftermathWrecks.js:911`, `systems/asteroidSites.js:209`, `systems/automation.js:568`, `systems/bombs.js:249`, `systems/encounterDirector.js:256`, `systems/environmentalMachinery.js:155`, `systems/factionPresence.js:424`, `systems/fields.js:366`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:246`, `systems/impulseCharges.js:232`, `systems/lawSecurity.js:261`, `systems/massSeed.js:118`, `systems/masslineSnares.js:127`, `systems/mines.js:39`, `systems/missions.js:1221`, `systems/npcJobsRuntime.js:833`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:50`, `systems/stationServices.js:207`, `systems/stationSideEventDirector.js:95`, `systems/surrenderRecovery.js:72`, `systems/survivalArena.js:849`, `systems/tetherGameplay.js:208`, `systems/traffic.js:1317`, `systems/wingmen.js:51`, `ui/customsPrompt.js:140`, `ui/impoundPayPrompt.js:34`, `ui/promptDeck.js:707` |
| `sectorsim:embodiment` | `systems/sectorSim.js:801` | `systems/world.js:538` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:318` | `ui/screens/starmap.js:823` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1687`, `systems/claims.js:1289`, `systems/encounterDirector.js:1824`, `systems/mining.js:1917` | `systems/sectorSim.js:103` |
| `sectorsim:intel` | `systems/sectorSim.js:855` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:639` | `systems/economy.js:940` |
| `sectorsim:reconcile` | `systems/sectorSim.js:596` | — |
| `sectorsim:tick` | `systems/sectorSim.js:263` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:559` | `ui/screens/starmap.js:824` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:543` | — |
| `service:aborted` | `systems/stationServices.js:256` | — |
| `service:completed` | `systems/economy.js:2329`, `systems/economy.js:2361`, `systems/economy.js:2407`, `systems/stationServices.js:475`, `systems/stationServices.js:491` | `systems/ships.js:1513` |
| `service:progress` | `systems/stationServices.js:417` | — |
| `service:queued` | `systems/stationServices.js:324` | — |
| `service:started` | `systems/stationServices.js:406` | — |
| `settings:changed` | `save/saveSystem.js:3184`, `save/saveSystem.js:3185`, `systems/touch.js:509`, `ui/screens/motionAsk.js:95`, `ui/screens/pause.js:591`, `ui/screens/pause.js:599`, `ui/screens/pause.js:677`, `ui/screens/settings.js:368`, `ui/screens/settings.js:731`, `ui/screens/settings.js:807` | `audio/audioSystem.js:2016`, `main.js:212`, `render/vfx.js:2328`, `save/saveSystem.js:206`, `ui/uiRoot.js:667` |
| `ship:appearanceChanged` | `systems/ships.js:1790`, `systems/ships.js:2025`, `systems/traffic.js:2733` | `core/coreSystem.js:184`, `render/vfx.js:2316` |
| `ship:appearanceSaved` | `systems/ships.js:2027` | — |
| `ship:boostPreKick` | `systems/flightV3.js:395` | `render/feel.js:1203` |
| `ship:boostStart` | `systems/flight.js:106`, `systems/flightV3.js:199` | `audio/audioSystem.js:1907`, `render/vfx.js:2344`, `systems/cruise.js:58`, `systems/onboarding.js:401` |
| `ship:boostStop` | `systems/flight.js:107`, `systems/flight.js:220`, `systems/flightV3.js:200`, `systems/flightV3.js:487` | `audio/audioSystem.js:1912`, `render/vfx.js:2345` |
| `ship:cargoCapChanged` | `systems/ships.js:1785` | — |
| `ship:dash` | `systems/flight.js:197`, `systems/flightV3.js:466` | `audio/audioSystem.js:1913`, `render/vfx.js:2346`, `systems/uniqueLootAbilities.js:134` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2023` | `render/vfx.js:2368` |
| `ship:deathPop` | `render/shipMicroMotion.js:928`, `render/shipMicroMotion.js:2013` | `render/vfx.js:2367` |
| `ship:livingHullChanged` | `systems/ships.js:1614`, `systems/ships.js:1666`, `systems/story.js:1704` | `systems/barkDirector.js:275` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2256` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2229` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2188` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2167` | — |
| `ship:massChanged` | `systems/ships.js:1922` | `ui/hud.js:3853` |
| `ship:purchased` | `systems/ships.js:1958` | `audio/audioSystem.js:1892`, `systems/missions.js:1224` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:977`, `render/shipMicroMotion.js:2000` | `render/vfx.js:2366` |
| `ship:roleContext` | `systems/ships.js:1724` | `systems/presentationAdapters.js:198` |
| `ship:sold` | `systems/ships.js:1979` | — |
| `ship:statsChanged` | `systems/ships.js:1784` | `systems/world.js:495`, `ui/commandBar.js:410`, `ui/hud.js:3849` |
| `ship:swingDash` | `systems/flightV3.js:467` | `render/shipMicroMotion.js:1196` |
| `ship:thrust` | `systems/flight.js:431`, `systems/flightV3.js:1509` | `render/vfx.js:2343` |
| `ships:grantModule` | — | `systems/ships.js:1439` |
| `signal:investigate` | — | `systems/scanner.js:831` |
| `signal:investigated` | `systems/scanner.js:1459` | `systems/missions.js:1153`, `systems/presentationOrchestrator.js:191`, `systems/story.js:138`, `systems/world.js:498`, `ui/signalInvestigationPrompt.js:176` |
| `signal:investigating` | `systems/scanner.js:1202` | `ui/signalInvestigationPrompt.js:175` |
| `signal:receipt` | `systems/scanner.js:1460` | — |
| `signal:scanResults` | `systems/scanner.js:977` | `systems/missions.js:1140`, `systems/presentationOrchestrator.js:189`, `systems/story.js:193`, `ui/signalInvestigationPrompt.js:173` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:832` |
| `signal:track` | — | `systems/scanner.js:830` |
| `signal:tracked` | `systems/scanner.js:1219` | `systems/presentationOrchestrator.js:190`, `ui/signalInvestigationPrompt.js:174` |
| `sim:pause` | `ui/screenManager.js:426` | `audio/audioSystem.js:2032`, `audio/bombAudio.js:357`, `render/feel.js:1089` |
| `sim:resume` | `ui/screenManager.js:433` | `audio/audioSystem.js:2033` |
| `site:anchored` | `systems/asteroidSites.js:917` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1849` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1764` | `audio/audioSystem.js:2054` |
| `site:courierLost` | `systems/asteroidSites.js:1837` | — |
| `site:created` | `systems/asteroidSites.js:855` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1212`, `systems/asteroidSites.js:1296` | — |
| `site:lost` | `systems/asteroidSites.js:1409` | `ui/alerts.js:342` |
| `site:machineInstalled` | `systems/asteroidSites.js:886` | `audio/audioSystem.js:2053`, `ui/alerts.js:341` |
| `site:machineMode` | `systems/asteroidSites.js:1318` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1229` | — |
| `site:machineStatus` | `systems/asteroidSites.js:1705` | `audio/audioSystem.js:2058`, `ui/alerts.js:337` |
| `site:overlayChanged` | `systems/asteroidSites.js:1302` | — |
| `site:podBuilt` | `systems/asteroidSites.js:1653` | — |
| `site:producing` | `systems/asteroidSites.js:1096` | `ui/asteroid/asteroidScreen.js:1670` |
| `site:rematerialized` | `systems/asteroidSites.js:1455` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1014` | `ui/asteroid/asteroidScreen.js:1655` |
| `site:surveyComplete` | `systems/asteroidSites.js:957` | `ui/asteroid/asteroidScreen.js:1649` |
| `site:surveyDetected` | `systems/asteroidSites.js:947` | `ui/asteroid/asteroidScreen.js:1642` |
| `spawn:request` | `systems/automation.js:1492` | `systems/world.js:523` |
| `station:berthAssigned` | `systems/stationServices.js:386` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:226` | — |
| `station:exitRequest` | `ui/screenManager.js:566`, `ui/uiRoot.js:1176` | `ui/station/stationApp.js:1284` |
| `station:holding` | `systems/stationServices.js:390` | — |
| `station:moduleGained` | `systems/claims.js:1755` | `systems/factions.js:346` |
| `station:navigate` | `ui/screens/automationPanel.js:1038`, `ui/station/screens/bar.js:682`, `ui/station/screens/bar.js:687`, `ui/station/screens/industry.js:337` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:255` | `render/vfx.js:2342` |
| `station:throughput` | `systems/claims.js:1725` | — |
| `station:yardChanged` | `systems/stationServices.js:544` | — |
| `stationContact:changed` | `systems/stationContacts.js:297`, `systems/stationContacts.js:333`, `systems/stationContacts.js:415`, `systems/stationContacts.js:439` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:240`, `systems/stationContacts.js:456` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:321` | — |
| `story:beatAdvanced` | `systems/missions.js:7559` | `save/saveSystem.js:276`, `systems/story.js:131`, `ui/screens/codex.js:629` |
| `story:elroyResolved` | `systems/missions.js:4587` | `systems/story.js:132` |
| `story:kurtzLedger` | `systems/story.js:1461`, `systems/story.js:1472` | — |
| `story:newGamePlusStarted` | `systems/story.js:1625` | `systems/titles.js:403`, `ui/hudMeta.js:104` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1650` | — |
| `story:postEndingContinuity` | `systems/story.js:1361` | — |
| `story:postEndingProgress` | `systems/story.js:1331` | `ui/screens/missionLog.js:2439` |
| `story:replayHookUnlocked` | `systems/story.js:1346` | `ui/screens/missionLog.js:2440` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:279` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:278` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1159` | — |
| `story:vergeObserversRevealed` | `systems/story.js:1015` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1179` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:194` | — |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:179` | — |
| `stunt:salvageRights` | `systems/stuntGrammar.js:104` | — |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:126` | — |
| `stunt:styleBanked` | `systems/stuntGrammar.js:91` | `audio/audioSystem.js:1830`, `ui/stuntCallout.js:424` |
| `stunt:trickAmended` | — | `systems/bulletTime.js:134`, `systems/survivalResults.js:450`, `systems/titles.js:402`, `ui/stuntCallout.js:423` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:1829`, `systems/bulletTime.js:133`, `systems/survivalResults.js:449`, `systems/titles.js:401`, `ui/stuntCallout.js:422`, `ui/toasts.js:370` |
| `surrender:escaped` | — | `systems/combatOutcome.js:183` |
| `surrender:secured` | — | `systems/traffic.js:1333` |
| `surrender:tethered` | — | `systems/traffic.js:1332` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1020` | — |
| `survivorPod:choose` | — | `systems/survivorPod.js:408` |
| `survivorPod:delivered` | `systems/traffic.js:5374` | — |
| `survivorPod:ejected` | `systems/survivorPod.js:556`, `systems/survivorPod.js:687` | `systems/lawSecurity.js:260` |
| `survivorPod:promoted` | `systems/survivorPod.js:919` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1013` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1025` | — |
| `survivorPod:rescued` | — | `systems/traffic.js:1338` |
| `survivorPod:resolved` | `systems/survivorPod.js:853` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1064` | — |
| `swarm:chain` | — | `systems/survivalResults.js:459`, `ui/survivalHud.js:220` |
| `swarm:chainBest` | — | `systems/survivalResults.js:472` |
| `swarm:chainBroken` | — | `ui/survivalHud.js:221` |
| `tech:researched` | `systems/ships.js:1827` | `audio/audioSystem.js:1891`, `systems/onboarding.js:492`, `systems/ships.js:1443` |
| `tether:attached` | `combat/attachments.js:369` | `audio/audioSystem.js:1951`, `render/vfx.js:2277`, `systems/encounterDirector.js:288`, `systems/presentationOrchestrator.js:95`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:325`, `systems/tetherGameplay.js:1124` | `audio/audioSystem.js:1969`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1204`, `systems/onboarding.js:367`, `systems/onboarding.js:383`, `systems/surrenderRecovery.js:69` |
| `tether:broken` | `combat/attachments.js:487` | `audio/audioSystem.js:1942`, `render/feel.js:1241`, `render/vfx.js:2280`, `systems/presentationOrchestrator.js:103`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:210` |
| `tether:cut` | `systems/tetherGameplay.js:1711` | `audio/audioSystem.js:1973`, `systems/masslineThrow.js:121`, `systems/onboarding.js:382`, `systems/onboarding.js:410` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1704` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:549`, `systems/tetherGameplay.js:255`, `systems/tetherGameplay.js:415`, `systems/tetherGameplay.js:458`, `systems/tetherGameplay.js:463`, `systems/tetherGameplay.js:473`, `systems/tetherGameplay.js:490`, `systems/tetherGameplay.js:837` | `systems/onboarding.js:528`, `testing/lab/proofSixtySeconds.js:1033`, `ui/masslineHud.js:724` |
| `tether:latched` | `systems/tetherGameplay.js:510` | `audio/audioSystem.js:1965`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:384`, `systems/flightV3.js:156`, `systems/lawSecurity.js:268`, `systems/missions.js:1164`, `systems/missions.js:1190`, `systems/onboarding.js:362`, `systems/onboarding.js:379`, `systems/onboarding.js:399`, `systems/onboarding.js:408`, `systems/onboarding.js:540`, `systems/onboarding.js:543`, `systems/surrenderRecovery.js:66`, `systems/survivorPod.js:414`, `testing/lab/proofSixtySeconds.js:1034`, `ui/masslineHud.js:738`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1403` | — |
| `tether:nearBreak` | `combat/attachments.js:829` | `audio/audioSystem.js:1963`, `systems/onboarding.js:368`, `systems/presentationOrchestrator.js:96` |
| `tether:rebound` | `combat/attachments.js:765` | — |
| `tether:reel` | `combat/attachments.js:421` | `audio/audioSystem.js:1940`, `systems/missions.js:1160`, `systems/onboarding.js:365`, `systems/onboarding.js:380`, `systems/surrenderRecovery.js:67` |
| `tether:reelPump` | `systems/masslineTelemetry.js:251` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:326`, `systems/tetherGameplay.js:1122`, `systems/tetherGameplay.js:1125`, `systems/tetherGameplay.js:1713` | `audio/audioSystem.js:1941`, `render/feel.js:1294`, `render/vfx.js:2279`, `systems/missions.js:1165`, `systems/presentationOrchestrator.js:160` |
| `tether:released` | `systems/tetherGameplay.js:1119`, `systems/tetherGameplay.js:1712` | `render/shipMicroMotion.js:1203`, `render/vfx.js:2278`, `systems/barkDirector.js:289`, `systems/onboarding.js:366`, `systems/onboarding.js:381`, `systems/onboarding.js:409`, `systems/surrenderRecovery.js:68` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:329` | — |
| `tether:strain` | `systems/tetherGameplay.js:1457` | `audio/audioSystem.js:1956` |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1319`, `systems/collisionConsequences.js:57`, `systems/combat.js:515`, `systems/masslineImpactDamage.js:41`, `systems/missions.js:1166`, `systems/onboarding.js:384`, `systems/onboarding.js:411`, `systems/presentationOrchestrator.js:136`, `systems/tumbleStates.js:89` |
| `tether:whipSnap` | `systems/tetherGameplay.js:1746` | — |
| `title:holdResolved` | — | `systems/titles.js:395` |
| `touch:uiAction` | `systems/touch.js:457` | `ui/input.js:743` |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:1824` |
| `traffic:oreCollected` | `systems/traffic.js:5171` | — |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:3194` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:9929` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:8541` | — |
| `traffic:spillNoticed` | `systems/traffic.js:5736` | — |
| `tutorial:finished` | `systems/onboarding.js:1085` | `systems/achievements.js:789`, `systems/missions.js:1069`, `systems/presentationAdapters.js:201`, `systems/story.js:140` |
| `tutorial:say` | `systems/onboarding.js:776` | `audio/audioSystem.js:1990`, `systems/story.js:146` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2307` | `systems/missions.js:1078` |
| `ui:acceptMission` | `ui/adventureDecisions.js:396`, `ui/station/screens/bar.js:619`, `ui/station/screens/contracts.js:1035` | `systems/missions.js:1077` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:3967` | `systems/ships.js:1480` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:865` |
| `ui:buyModule` | `ui/station/screens/shipworks.js:4369` | `systems/onboarding.js:487`, `systems/ships.js:1473` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:4301` | `systems/bombs.js:260` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:4080` | `systems/ships.js:1471` |
| `ui:cancel` | `ui/input.js:990`, `ui/input.js:1004` | — |
| `ui:clearTarget` | `ui/input.js:385` | `ui/uiRoot.js:1042` |
| `ui:closeAll` | `main.js:832`, `ui/screens/crucible.js:2576`, `ui/screens/crucible.js:2589` | `ui/uiRoot.js:1040` |
| `ui:closeCargo` | `ui/input.js:234`, `ui/input.js:347` | `ui/hud.js:3823` |
| `ui:closeComms` | `ui/input.js:342` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:1034` |
| `ui:confirm` | `ui/input.js:998` | `audio/audioSystem.js:2070` |
| `ui:cycleComponent` | `ui/targetPanel.js:435`, `ui/targetPanel.js:439` | `ui/uiRoot.js:1046` |
| `ui:cycleTarget` | `ui/input.js:381`, `ui/input.js:1068` | `ui/uiRoot.js:1041` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:3998` | `systems/ships.js:1481` |
| `ui:endgameChoose` | `systems/missions.js:2809`, `ui/station/barContacts.js:822` | `systems/story.js:159` |
| `ui:endgameConfirm` | — | `systems/story.js:160` |
| `ui:endgameDecline` | `ui/comms.js:447` | `systems/story.js:161` |
| `ui:endgameDepartAshfall` | `ui/comms.js:464` | `systems/story.js:170` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2157` | `systems/story.js:167` |
| `ui:endgameStayAshfall` | `ui/comms.js:465` | `systems/story.js:171` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2161` | `systems/story.js:168` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:169` |
| `ui:endingArchiveOpen` | — | `systems/story.js:163` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | — |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:71` | `systems/factionPresence.js:430` |
| `ui:fitModule` | `ui/station/screens/shipworks.js:4380` | `systems/onboarding.js:484`, `systems/ships.js:1474` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:4311` | `systems/bombs.js:261` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1085` | `systems/automation.js:535`, `systems/wingmen.js:59` |
| `ui:globalFind` | `ui/input.js:272`, `ui/input.js:334` | `ui/globalFind.js:183` |
| `ui:heliosBay7Scan` | — | `systems/story.js:196` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:68` | `systems/story.js:195` |
| `ui:navigate` | `ui/input.js:978`, `ui/input.js:982`, `ui/input.js:1046` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2550`, `ui/screens/achievements.js:208`, `ui/screens/automationPanel.js:517`, `ui/screens/credits.js:177`, `ui/screens/crucible.js:1487`, `ui/screens/crucibleDraft.js:1135`, `ui/screens/demoEnd.js:194`, `ui/screens/starmap.js:639`, `ui/screens/techTree.js:274` | `ui/uiRoot.js:1030` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:603` | `systems/world.js:526` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:673` | `systems/world.js:525` |
| `ui:pushScreen` | `main.js:379`, `systems/onboarding.js:618`, `systems/story.js:1139`, `ui/mapAuthority.js:133`, `ui/screens/crucible.js:2590`, `ui/screens/crucibleDraft.js:691`, `ui/screens/gameOver.js:390`, `ui/screens/starmap.js:647`, `ui/signalInvestigationPrompt.js:169`, `ui/station/barContacts.js:549`, `ui/station/screens/bar.js:636`, `ui/station/stationApp.js:512` | `ui/uiRoot.js:1007` |
| `ui:replaceScreen` | `ui/screens/crucible.js:2544`, `ui/screens/crucible.js:2567`, `ui/screens/demoEnd.js:223`, `ui/screens/motionAsk.js:105` | `ui/uiRoot.js:1039` |
| `ui:restockBombRack` | `ui/station/screens/shipworks.js:4060` | `systems/bombs.js:264` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:3939` | `systems/ships.js:1479` |
| `ui:screenTop` | `ui/screenManager.js:274` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:866` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:4321` | `systems/bombs.js:263` |
| `ui:service` | `balance/careerCohorts.js:713`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:427`, `ui/station/stationApp.js:901`, `ui/station/stationApp.js:937` | `systems/economy.js:924` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:4085`, `ui/station/screens/shipworks.js:4187` | `systems/ships.js:1472` |
| `ui:setCourse` | `systems/factionPresence.js:1129`, `systems/missions.js:3314`, `systems/scanner.js:1218`, `ui/galaxyMap.js:2206`, `ui/galaxyMap.js:2218`, `ui/galaxyMap.js:7186`, `ui/market/tradeLogic.js:485`, `ui/screens/footprint.js:1614`, `ui/screens/footprint.js:1625`, `ui/screens/localmap.js:995`, `ui/screens/starmap.js:1523`, `ui/screens/starmap.js:1536`, `ui/screens/starmap.js:1540` | `systems/world.js:491` |
| `ui:setShipAppearance` | — | `systems/ships.js:1483` |
| `ui:talkContact` | — | `systems/story.js:197` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:46`, `combat/autoTargetMode.js:214` | `ui/uiRoot.js:1047` |
| `ui:toggleCargo` | `ui/input.js:448` | `ui/hud.js:3822` |
| `ui:toggleComms` | `ui/input.js:465` | — |
| `ui:toggleOverview` | `ui/input.js:452` | `ui/hud.js:4317` |
| `ui:trackMission` | `ui/galaxyMap.js:4008`, `ui/screens/missionLog.js:2153`, `ui/screens/missionLog.js:2225`, `ui/screens/missionLog.js:2286`, `ui/station/screens/contracts.js:1067` | `systems/missions.js:1082` |
| `ui:undock` | — | `ui/input.js:742` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:4390` | `systems/ships.js:1475` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:4331` | `systems/bombs.js:262` |
| `ui:unlockTech` | `ui/screens/techTree.js:623` | `systems/ships.js:1482` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:4069` | `systems/bombs.js:265` |
| `ui:wingOrder` | `ui/wingmanRadial.js:182` | `systems/automation.js:536` |
| `ui:wingmanRadial` | `ui/input.js:458` | `ui/wingmanRadial.js:244` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:337` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:287` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:222` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1285` | `systems/missions.js:1213`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:choose` | `systems/missions.js:4333`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:700` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:718`, `systems/uniqueWrecks.js:876`, `systems/uniqueWrecks.js:1079` | `systems/missions.js:1214` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1345` | `systems/missions.js:1216`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:938` | `systems/missions.js:1215` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:968` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:465`, `systems/uniqueWrecks.js:878` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1521` | `systems/missions.js:1217`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `ui/station/screens/bar.js:653` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:573` | `systems/missions.js:1212` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1522` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1264` | `systems/world.js:531` |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1452` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1150`, `ui/bandHud.js:88` |
| `verb:used` | `systems/onboarding.js:2591` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:5325` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:501` |
| `vestaOreCache:clueRecovered` | `systems/world.js:5146` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:5177` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:5288` | — |
| `vestaOreCache:resolved` | `systems/world.js:5245` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:369`, `ui/voiceArbiter.js:413` | `ui/alerts.js:322` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:324` |
| `voice:say` | `systems/achievements.js:652`, `systems/survivalAnnounce.js:348`, `ui/alerts.js:221` | `ui/voiceArbiter.js:323` |
| `voice:surface` | `ui/voiceArbiter.js:374`, `ui/voiceArbiter.js:423` | `systems/barkDirector.js:276`, `ui/alerts.js:321` |
| `watch:changed` | `ui/entityLinks.js:237` | `ui/watchlistHud.js:69` |
| `weapons:inertialShunt` | `systems/weapons.js:366` | — |
| `weapons:mineArmed` | `systems/weapons.js:1645` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1602` | — |
| `weapons:mineDetonated` | `systems/weapons.js:1775` | — |
| `weapons:mineExpired` | `systems/weapons.js:1639` | `systems/presentationOrchestrator.js:265` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:346` | — |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1300` | — |
| `weapons:vent` | `systems/weapons.js:743`, `systems/weapons.js:763` | `audio/audioSystem.js:1870`, `render/shipMicroMotion.js:1180`, `render/vfx.js:2341`, `systems/ships.js:1527`, `ui/hud.js:3896` |
| `web:linked` | `combat/tetherWebs.js:95` | — |
| `well:capture` | `systems/fields.js:1971` | — |
| `well:fling` | `systems/fields.js:1896` | — |
| `well:grind` | `systems/fields.js:1652` | `systems/impulseCharges.js:225` |
| `wingMorale:broken` | `systems/wingMorale.js:261` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:346` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:373` | — |
| `wingOrder:accepted` | `systems/automation.js:1978` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1979` | — |
| `wingOrder:converted` | `systems/wingmen.js:310` | — |
| `wingOrder:status` | `systems/automation.js:1980` | — |
| `world:abortJumpCharge` | `systems/story.js:788`, `ui/comms.js:456` | `systems/world.js:488` |
| `world:confirmUnfiledJump` | `systems/story.js:169` | `systems/world.js:487` |
| `world:criticalSpawnDeferred` | `systems/world.js:1540`, `systems/world.js:3212` | — |
| `world:farActorRestored` | `world/farActorTable.js:681` | `systems/npcJobsRuntime.js:836`, `systems/traffic.js:1321` |
| `world:farActorShelved` | `world/farActorTable.js:659` | `systems/npcJobsRuntime.js:835`, `systems/traffic.js:1320` |
| `world:membership` | `systems/world.js:799` | `systems/presentationOrchestrator.js:179` |
| `world:originShift` | `systems/world.js:4206` | — |
| `world:playerRelocated` | `systems/world.js:3358` | `core/coreSystem.js:196`, `render/vfx.js:2327` |
| `world:requestJump` | `systems/story.js:772`, `ui/galaxyMap.js:2204`, `ui/screens/starmap.js:1535` | `systems/world.js:485` |
| `world:requestRoute` | `ui/galaxyMap.js:2216`, `ui/galaxyMap.js:4025`, `ui/galaxyMap.js:7184`, `ui/screens/starmap.js:1522`, `ui/screens/starmap.js:1539` | `systems/world.js:489` |
| `world:requestSectorScan` | `ui/galaxyMap.js:5792` | `systems/world.js:490` |
| `world:requestUnfiledJump` | `systems/story.js:740` | `systems/world.js:486` |
| `world:residency` | `systems/world.js:943`, `systems/world.js:976`, `systems/world.js:1743` | — |
| `world:spawnLimited` | `systems/world.js:3148` | — |
| `world:zoneEntered` | `systems/world.js:4233` | `data/hazardLanguage.js:131` |
| `world:zoneExited` | `systems/world.js:4236` | `data/hazardLanguage.js:132` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:543` | `systems/presentationOrchestrator.js:279` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:497` | `systems/presentationOrchestrator.js:280`, `systems/traffic.js:1399` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2369` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1106` | — |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1149` | — |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:2116` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2297` | `systems/npcJobsRuntime.js:866` |
| `wreckField:source` | `systems/factionPresence.js:695`, `systems/salvage.js:351`, `systems/uniqueWrecks.js:1180` | `systems/aftermathWrecks.js:909` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 3 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `barkDirector:voice` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `chronicler:radio` — 1 subscriber(s)
- `chronicler:recall` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:bankShot` — 1 subscriber(s)
- `combat:baseDestroyed` — 1 subscriber(s)
- `combat:repairSubsystem` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 7 subscriber(s)
- `combat:subsystemEnabled` — 4 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `dock:launder` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `entity:spawnRequest` — 1 subscriber(s)
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
- `survivorPod:choose` — 1 subscriber(s)
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
- `ui:setShipAppearance` — 1 subscriber(s)
- `ui:talkContact` — 1 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `voice:dismiss` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:completed` — 1 emitter(s)
- `aftermathWreck:retired` — 1 emitter(s)
- `ai:egressExit` — 1 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
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
- `cargo:delivered` — 2 emitter(s)
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
- `customs:breakScan` — 1 emitter(s)
- `customs:submit` — 1 emitter(s)
- `danger:miningNoise` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `distress:call` — 1 emitter(s)
- `dock:denied` — 1 emitter(s)
- `economy:debtEscalated` — 1 emitter(s)
- `economy:demandShift` — 1 emitter(s)
- `economy:salvageIntakeApplied` — 1 emitter(s)
- `economy:sinkCharged` — 1 emitter(s)
- `economy:tradeFailed` — 2 emitter(s)
- `emergent:audio` — 1 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:hostileCommitted` — 1 emitter(s)
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
- `harasser:disengaged` — 1 emitter(s)
- `hazard:changed` — 1 emitter(s)
- `heist:capsuleResumed` — 1 emitter(s)
- `heist:launchCue` — 1 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `hull:fractured` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `intervention:logged` — 1 emitter(s)
- `loot:magnetCaptured` — 1 emitter(s)
- `loot:manifestPayload` — 1 emitter(s)
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
- `massline:tangentMeeting` — 1 emitter(s)
- `mines:capReached` — 1 emitter(s)
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:heatChanged` — 1 emitter(s)
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
- `npcjobs:loadEmpty` — 1 emitter(s)
- `npcjobs:lotClaimed` — 1 emitter(s)
- `npcjobs:lotPosted` — 1 emitter(s)
- `npcjobs:lotReplaced` — 1 emitter(s)
- `npcjobs:minerRelocated` — 1 emitter(s)
- `npcjobs:resumed` — 1 emitter(s)
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
- `salvage:fieldVulture` — 1 emitter(s)
- `salvage:npcExtraction` — 1 emitter(s)
- `salvage:reactorBurst` — 1 emitter(s)
- `salvage:reactorTowedClear` — 1 emitter(s)
- `salvage:reactorVented` — 1 emitter(s)
- `save:backup` — 1 emitter(s)
- `save:exportRecovery` — 1 emitter(s)
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
- `sectorsim:intel` — 1 emitter(s)
- `sectorsim:reconcile` — 1 emitter(s)
- `sectorsim:tick` — 1 emitter(s)
- `sensorGhost:swarm` — 1 emitter(s)
- `service:aborted` — 1 emitter(s)
- `service:progress` — 1 emitter(s)
- `service:queued` — 1 emitter(s)
- `service:started` — 1 emitter(s)
- `ship:appearanceSaved` — 1 emitter(s)
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
- `survivorPod:rescueBlocked` — 1 emitter(s)
- `survivorPod:rescueSelected` — 1 emitter(s)
- `survivorPod:resolved` — 1 emitter(s)
- `survivorPod:stripped` — 1 emitter(s)
- `tether:cutDenied` — 1 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:rebound` — 1 emitter(s)
- `tether:reelPump` — 1 emitter(s)
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
