# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-09-26 · 928 events · 3068 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:280`, `systems/encounterDirector.js:265`, `ui/discoveryPlate.js:140` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:712` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:1556` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:1786` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:744` | `systems/salvage.js:72` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1262` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:1608` | `systems/lawSecurity.js:204`, `systems/salvage.js:73` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:164` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:424` | `systems/presentationOrchestrator.js:165`, `systems/tetherGameplay.js:213` |
| `ai:encounterCommand` | `systems/aiPorts.js:236` | — |
| `ai:flee` | `systems/ai.js:259`, `systems/traffic.js:4732`, `systems/wingMorale.js:299` | `render/vfx.js:2290`, `systems/barkDirector.js:239`, `systems/combatOutcome.js:119`, `systems/encounterDirector.js:277`, `systems/presentationOrchestrator.js:166` |
| `ai:formationBroken` | `systems/ai.js:433`, `systems/wingMorale.js:249` | `render/vfx.js:2291` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:241` |
| `ai:stateChange` | `systems/ai.js:256` | — |
| `ai:telegraph` | `systems/ai.js:329`, `systems/encounterScripts.js:178`, `systems/encounterScripts.js:966`, `systems/masslineSnares.js:331`, `systems/mines.js:100`, `systems/tacticalAI.js:412` | `audio/audioSystem.js:1775`, `render/vfx.js:2289`, `systems/presentationOrchestrator.js:163`, `systems/survivalResults.js:453`, `ui/hud.js:2649`, `ui/survivalHud.js:215`, `ui/threatHalo.js:553` |
| `aiTrader:requestTrade` | `systems/traffic.js:6684` | `systems/economy.js:860` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | — |
| `anomaly:bearing` | `systems/scanner.js:987` | — |
| `anomaly:triangulated` | `systems/scanner.js:1005` | `systems/world.js:490` |
| `asset:deployed` | `systems/automation.js:2043`, `systems/automation.js:2103`, `systems/automation.js:2192`, `systems/claims.js:484` | `systems/missions.js:1220`, `systems/onboarding.js:497`, `systems/story.js:182` |
| `asteroid:chunked` | `systems/mining.js:1560` | `render/asteroidMotionPresentation.js:452`, `render/vfx.js:2274`, `systems/presentationOrchestrator.js:201` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:1001`, `systems/mining.js:794` | `audio/audioSystem.js:1735`, `render/vfx.js:2273`, `systems/fieldDepletion.js:703`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:416`, `render/shipMicroMotion.js:2029`, `render/vfx.js:2315`, `render/vfx.js:9812`, `render/vfx.js:11060`, `systems/ai.js:704`, `systems/barkDirector.js:842`, `systems/beacons.js:60`, `systems/beacons.js:65`, `systems/beacons.js:97`, `systems/bombs.js:520`, `systems/bombs.js:637`, `systems/bombs.js:815`, `systems/bulletTime.js:182`, `systems/bulletTime.js:198`, `systems/bulletTime.js:277`, `systems/claims.js:331`, `systems/claims.js:416`, `systems/claims.js:461`, `systems/claims.js:1164`, `systems/claims.js:1775`, `systems/cloak.js:118`, `systems/cloak.js:129`, `systems/countermeasures.js:281`, `systems/crafting.js:268`, `systems/crafting.js:278`, `systems/fields.js:707`, `systems/fields.js:793`, `systems/fields.js:826`, `systems/fields.js:833`, `systems/fields.js:1088`, `systems/flybyFocus.js:433`, `systems/impulseCharges.js:617`, `systems/impulseCharges.js:799`, `systems/impulseCharges.js:912`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:239`, `systems/masslineThrow.js:538`, `systems/masslineThrow.js:623`, `systems/mining.js:582`, `systems/mining.js:1640`, `systems/planetRuntime.js:508`, `systems/presentationAdapters.js:547`, `systems/presentationOrchestrator.js:493`, `systems/salvage.js:560`, `systems/tumbleStates.js:332`, `systems/tumbleStates.js:366`, `systems/weapons.js:1463`, `ui/commsRadial.js:539`, `ui/commsRadial.js:584`, `ui/commsRadial.js:769`, `ui/commsRadial.js:800`, `ui/hud.js:2121`, `ui/hud.js:3412`, `ui/hud.js:3621`, `ui/hud.js:3681`, `ui/hud.js:3723`, `ui/hud.js:3742`, `ui/hud.js:3840`, `ui/hud.js:3976`, `ui/hud.js:4258`, `ui/input.js:181`, `ui/input.js:210`, `ui/input.js:259`, `ui/input.js:297`, `ui/input.js:303`, `ui/input.js:354`, `ui/input.js:413`, `ui/input.js:419`, `ui/input.js:425`, `ui/input.js:431`, `ui/input.js:642`, `ui/input.js:849`, `ui/input.js:854`, `ui/input.js:872`, `ui/input.js:877`, `ui/input.js:970`, `ui/input.js:991`, `ui/input.js:999`, `ui/input.js:1005`, `ui/input.js:1047`, `ui/input.js:1058`, `ui/input.js:1062`, `ui/input.js:1075`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:488`, `ui/screens/base.js:522`, `ui/screens/base.js:668`, `ui/screens/missionLog.js:1927`, `ui/screens/missionLog.js:1931`, `ui/screens/missionLog.js:1935`, `ui/screens/missionLog.js:1939`, `ui/screens/missionLog.js:1955`, `ui/screens/missionLog.js:1963`, `ui/screens/missionLog.js:1970`, `ui/screens/missionLog.js:1977`, `ui/screens/missionLog.js:1985`, `ui/screens/missionLog.js:1992`, `ui/screens/missionLog.js:1999`, `ui/screens/missionLog.js:2008`, `ui/screens/missionLog.js:2015`, `ui/screens/missionLog.js:2031`, `ui/screens/missionLog.js:2062`, `ui/screens/missionLog.js:2082`, `ui/shipLedgerPanel.js:295`, `ui/shipLedgerPanel.js:302`, `ui/shipLedgerPanel.js:309`, `ui/station/screens/bar.js:527`, `ui/station/screens/bar.js:568`, `ui/station/screens/bar.js:572`, `ui/station/screens/bar.js:576`, `ui/station/screens/bar.js:598`, `ui/station/screens/bar.js:614`, `ui/station/screens/bar.js:643`, `ui/station/screens/bar.js:668`, `ui/station/screens/bar.js:677`, `ui/station/screens/contracts.js:975`, `ui/station/screens/contracts.js:986`, `ui/station/screens/contracts.js:1022`, `ui/station/screens/contracts.js:1025`, `ui/station/screens/contracts.js:1056`, `ui/station/screens/factions.js:340`, `ui/station/screens/industry.js:306`, `ui/station/screens/industry.js:331`, `ui/station/screens/industry.js:341`, `ui/station/screens/market.js:595`, `ui/station/screens/market.js:894`, `ui/station/screens/market.js:963`, `ui/station/screens/market.js:971`, `ui/station/screens/market.js:992`, `ui/station/screens/market.js:1003`, `ui/station/screens/market.js:1195`, `ui/station/screens/shipworks.js:531`, `ui/station/screens/shipworks.js:2738`, `ui/station/screens/shipworks.js:3534`, `ui/station/screens/shipworks.js:3551`, `ui/station/screens/shipworks.js:3564`, `ui/station/screens/shipworks.js:3568`, `ui/station/screens/shipworks.js:3573`, `ui/station/screens/shipworks.js:3600`, `ui/station/screens/shipworks.js:3606`, `ui/station/screens/shipworks.js:3622`, `ui/station/screens/shipworks.js:3666`, `ui/station/screens/shipworks.js:3675`, `ui/station/screens/shipworks.js:3685`, `ui/station/screens/shipworks.js:3691`, `ui/station/screens/shipworks.js:3711`, `ui/station/screens/shipworks.js:3718`, `ui/station/screens/shipworks.js:3753`, `ui/station/screens/shipworks.js:3760`, `ui/station/screens/shipworks.js:3771`, `ui/station/screens/shipworks.js:3781`, `ui/station/screens/shipworks.js:3786`, `ui/station/screens/shipworks.js:3886`, `ui/station/screens/shipworks.js:3896`, `ui/station/screens/shipworks.js:3906`, `ui/station/screens/shipworks.js:3916`, `ui/station/screens/shipworks.js:3949`, `ui/station/screens/shipworks.js:3953`, `ui/station/screens/shipworks.js:3966`, `ui/station/screens/shipworks.js:3971`, `ui/station/stationApp.js:630`, `ui/station/stationApp.js:882`, `ui/station/stationApp.js:918`, `ui/uiRoot.js:1162`, `ui/wingmanRadial.js:135`, `ui/wingmanRadial.js:156`, `ui/wingmanRadial.js:178`, `ui/wingmanRadial.js:204`, `ui/wingmanRadial.js:229` | `audio/audioSystem.js:1851` |
| `automation:assetDistressed` | `systems/automation.js:1798` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2288` | `systems/intervention.js:38`, `systems/lossLedger.js:377`, `systems/missions.js:1222` |
| `automation:assetRepossessed` | `systems/automation.js:1823` | `ui/automationPayoff.js:90` |
| `automation:assetResumed` | `systems/automation.js:2144` | — |
| `automation:incomeCredited` | `systems/automation.js:1852`, `systems/automation.js:1863`, `systems/automation.js:2561` | — |
| `automation:offlineSummary` | `systems/automation.js:2326`, `systems/automation.js:2350`, `systems/automation.js:2374`, `systems/automation.js:2397`, `systems/automation.js:2608` | `ui/automationPayoff.js:80` |
| `automation:outpostRaided` | `systems/automation.js:1725`, `systems/automation.js:2683` | `systems/lossLedger.js:378` |
| `automation:programAssigned` | `systems/automation.js:1998` | `systems/missions.js:1221` |
| `automation:traderCycleCompleted` | `systems/automation.js:1481` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:521` | — |
| `band:bearingRequest` | `systems/bandRadio.js:494` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:617`, `systems/uniqueWrecks.js:660` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:624`, `systems/uniqueWrecks.js:632`, `systems/uniqueWrecks.js:646` | — |
| `band:bed` | `systems/bandRadio.js:578` | `audio/audioSystem.js:1921` |
| `band:cycle` | `ui/bandHud.js:82`, `ui/input.js:319` | — |
| `band:status` | `systems/bandRadio.js:560` | `ui/bandHud.js:86` |
| `barkDirector:voice` | — | `audio/audioSystem.js:1897` |
| `beacon:deploy` | — | `systems/beacons.js:43` |
| `beacon:deployed` | `systems/beacons.js:92` | `render/shipMicroMotion.js:1201` |
| `beam:denied` | `systems/mining.js:276`, `systems/mining.js:319`, `systems/mining.js:333`, `systems/mining.js:343`, `systems/mining.js:375` | — |
| `beam:repaired` | `systems/mining.js:436` | — |
| `beam:transferred` | `systems/mining.js:467` | — |
| `bombs:armed` | `systems/bombs.js:575` | — |
| `bombs:commanded` | `systems/bombs.js:533` | — |
| `bombs:cycle` | `systems/bombs.js:277`, `systems/bombs.js:512` | — |
| `bombs:denied` | `systems/bombs.js:202`, `systems/bombs.js:270`, `systems/bombs.js:292`, `systems/bombs.js:328`, `systems/bombs.js:365`, `systems/bombs.js:389`, `systems/bombs.js:457`, `systems/bombs.js:471` | — |
| `bombs:destroyed` | `systems/bombs.js:812` | `render/vfx.js:2288` |
| `bombs:detonated` | `systems/bombs.js:631` | `audio/bombAudio.js:314`, `render/vfx.js:2286` |
| `bombs:dropped` | `systems/bombs.js:519` | `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:514` |
| `bombs:fieldEnded` | `systems/bombs.js:767` | `audio/bombAudio.js:322`, `render/vfx.js:2287` |
| `bombs:primed` | `systems/bombs.js:544` | — |
| `bombs:rackChanged` | `systems/bombs.js:418` | — |
| `bombs:released` | `systems/bombs.js:830` | `audio/bombAudio.js:325` |
| `bombs:stockChanged` | `systems/bombs.js:299`, `systems/bombs.js:410`, `systems/bombs.js:517` | — |
| `boss:defeated` | `systems/world.js:700` | — |
| `bounty:cleared` | `systems/economy.js:2124` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:299` | — |
| `bulletTime:end` | `systems/bulletTime.js:197` | `audio/audioSystem.js:1920` |
| `bulletTime:start` | `systems/bulletTime.js:181` | `audio/audioSystem.js:1917`, `systems/onboarding.js:557` |
| `camera:kill` | `render/feel.js:1171`, `render/feel.js:1647` | — |
| `camera:shake` | `render/shipMicroMotion.js:2027`, `render/vfx.js:5775`, `render/vfx.js:6112`, `systems/combat.js:548`, `systems/combat.js:675`, `systems/combat.js:848`, `systems/combat.js:930`, `systems/drill.js:1284`, `systems/flybyFocus.js:432`, `systems/intervention.js:109`, `systems/presentationAdapters.js:469`, `systems/survivalAnnounce.js:443`, `systems/tetherGameplay.js:526` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:485`, `ui/input.js:486`, `ui/input.js:718` | — |
| `capitalBoss:detach` | `systems/missions.js:1237` | — |
| `capitalBoss:start` | `systems/missions.js:5028` | — |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:110`, `systems/capitalBossEncounters.js:131` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:656` | `systems/world.js:492` |
| `cargo:changed` | `systems/cargo.js:188`, `systems/mining.js:1805` | `systems/ships.js:1438`, `ui/cargoConscience.js:122`, `ui/commandBar.js:412`, `ui/hud.js:3754`, `ui/hud.js:3783`, `ui/hudMeta.js:192` |
| `cargo:delivered` | `systems/missions.js:5724`, `systems/missions.js:5795` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:287`, `systems/mining.js:572`, `systems/mining.js:1082` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:457`, `systems/presentationOrchestrator.js:209`, `ui/alerts.js:370`, `ui/floatingText.js:236` |
| `cargo:hotDockSpill` | `systems/cargo.js:507` | — |
| `cargo:jettison` | `ui/hud.js:3420` | `ui/hud.js:3686` |
| `cargo:jettisoned` | `systems/cargo.js:583` | `audio/audioSystem.js:1757`, `render/shipMicroMotion.js:1199`, `systems/barkDirector.js:249`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:553` |
| `cargo:massSettled` | `systems/cargo.js:418` | `systems/presentationOrchestrator.js:208`, `systems/ships.js:1439` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:747` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:783` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:723` | — |
| `chain:detonated` | `systems/impulseCharges.js:597` | `systems/fields.js:364` |
| `chain:primeEnded` | `systems/impulseCharges.js:560` | — |
| `chain:primed` | `systems/impulseCharges.js:537` | — |
| `chain:slam` | `systems/impulseCharges.js:471`, `systems/impulseCharges.js:491` | `systems/fields.js:363` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1859` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:795` | `systems/onboarding.js:565` |
| `charge:armed` | `systems/impulseCharges.js:634` | — |
| `charge:combo` | `systems/impulseCharges.js:837`, `systems/impulseCharges.js:896` | — |
| `charge:detonated` | `systems/impulseCharges.js:609`, `systems/impulseCharges.js:904` | `audio/audioSystem.js:1785`, `render/feel.js:1251`, `render/vfx.js:2284`, `systems/fields.js:365` |
| `charge:stuck` | `systems/impulseCharges.js:711` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1198` |
| `charge:thrown` | `systems/impulseCharges.js:791` | `render/ordnanceMotionPresentation.js:261` |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:18` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:19` |
| `claim:claimed` | `systems/claims.js:330` | `systems/onboarding.js:503`, `systems/story.js:188`, `systems/traffic.js:1363` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1223` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:284` |
| `claim:defenseResolved` | `systems/claims.js:1299` | — |
| `claim:defenseStarted` | `systems/claims.js:1228` | — |
| `claim:defenseWarning` | `systems/claims.js:1147` | — |
| `claim:depotPatrolCompleted` | `systems/claims.js:2069` | `systems/factions.js:293` |
| `claim:depotPatrolRotation` | `systems/claims.js:2026` | — |
| `claim:depotSupport` | `systems/claims.js:1941`, `systems/claims.js:1966` | — |
| `claim:freightDelivered` | `systems/traffic.js:2357` | — |
| `claim:infrastructureActive` | `systems/claims.js:864` | `systems/traffic.js:1361` |
| `claim:infrastructureConstructed` | `systems/claims.js:397` | — |
| `claim:infrastructureStatus` | `systems/claims.js:875` | `systems/traffic.js:1362` |
| `claim:moduleBuilt` | `systems/claims.js:415` | — |
| `claim:raidRepelled` | `systems/claims.js:1096` | — |
| `claim:raidWarning` | `systems/claims.js:1089` | — |
| `claim:receipt` | `systems/claims.js:1516` | — |
| `claim:sensorPostRumor` | `systems/claims.js:924` | `systems/world.js:520` |
| `claim:specialized` | `systems/claims.js:456` | — |
| `claim:teleportRequest` | `systems/claims.js:662` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:2226` | — |
| `claims:migrated` | `systems/claims.js:1634` | — |
| `cloak:dropped` | `systems/cloak.js:128` | `render/shipMicroMotion.js:1195` |
| `cloak:engaged` | `systems/cloak.js:117` | `render/shipMicroMotion.js:1194`, `systems/onboarding.js:561` |
| `combat:actionCancelled` | `combat/actions.js:303` | — |
| `combat:actionCompleted` | `combat/actions.js:289` | — |
| `combat:actionPhase` | `combat/actions.js:162` | — |
| `combat:actionRejected` | `combat/actions.js:325` | `ui/toasts.js:359` |
| `combat:actionStarted` | `combat/actions.js:132` | `systems/presentationOrchestrator.js:168`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2230` |
| `combat:baseDestroyed` | — | `systems/economy.js:909` |
| `combat:beamStop` | `systems/weapons.js:835` | `audio/audioSystem.js:1675`, `render/asteroidMotionPresentation.js:451`, `render/vfx.js:2226` |
| `combat:bounceContinued` | `combat/attackHit.js:36` | `systems/presentationOrchestrator.js:251` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:257` | `render/feel.js:1286`, `render/vfx.js:2239`, `systems/fields.js:367`, `systems/gamepad.js:323` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:275` | `render/vfx.js:2240` |
| `combat:damage` | `combat/damage.js:288` | `audio/audioSystem.js:1682`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/asteroidMotionPresentation.js:445`, `render/feel.js:1096`, `render/shipMicroMotion.js:1181`, `render/vfx.js:2231`, `save/saveSystem.js:240`, `systems/ai.js:101`, `systems/barkDirector.js:245`, `systems/cruise.js:53`, `systems/difficultyDirector.js:133`, `systems/encounterDirector.js:256`, `systems/factionPresence.js:406`, `systems/heat.js:237`, `systems/lawSecurity.js:199`, `systems/onboarding.js:423`, `systems/onboarding.js:434`, `systems/presentationOrchestrator.js:162`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1499`, `systems/stationBroadcast.js:152`, `systems/survivalResults.js:448`, `systems/titles.js:396`, `systems/traffic.js:1311`, `ui/alerts.js:356`, `ui/commandBar.js:401`, `ui/floatingText.js:145`, `ui/hud.js:1679`, `ui/hud.js:1949`, `ui/hud.js:2151`, `ui/uiRoot.js:613` |
| `combat:emp` | `combat/damage.js:322` | `ui/hud.js:2157` |
| `combat:fire` | `systems/weapons.js:741`, `systems/weapons.js:814`, `systems/weapons.js:963`, `systems/weapons.js:1278` | `audio/audioSystem.js:1674`, `render/feel.js:1187`, `render/shipMicroMotion.js:1179`, `render/vfx.js:2225`, `systems/cloak.js:37`, `systems/cruise.js:61`, `systems/lawSecurity.js:200`, `systems/onboarding.js:373`, `systems/onboarding.js:386`, `systems/presentationOrchestrator.js:167`, `systems/traffic.js:1312`, `ui/hud.js:3798` |
| `combat:hit` | `systems/salvageActions.js:182` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:539` |
| `combat:kill` | `systems/world.js:4844` | — |
| `combat:lockChanged` | `systems/weapons.js:578` | `systems/world.js:485`, `ui/alerts.js:363` |
| `combat:outcome` | `systems/combatOutcome.js:183` | `systems/barkDirector.js:242` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:184` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:77` |
| `combat:requestAction` | — | `combat/kernel.js:75` |
| `combat:routeDamage` | `systems/bombs.js:780`, `systems/drill.js:1296`, `systems/impulseCharges.js:1113`, `systems/mines.js:213`, `systems/missions.js:5372` | `combat/kernel.js:76`, `systems/routeFollower.js:333` |
| `combat:shove` | `systems/onboarding.js:1791` | `audio/audioSystem.js:1769`, `systems/onboarding.js:385` |
| `combat:statusApplied` | `combat/statuses.js:155` | `render/vfx.js:2241` |
| `combat:statusExpired` | `combat/statuses.js:57` | `audio/bombAudio.js:334` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:120`, `systems/encounterDirector.js:251`, `systems/factionPresence.js:404`, `systems/presentationOrchestrator.js:230`, `systems/surrenderRecovery.js:64`, `systems/wingMorale.js:179` |
| `combat:subsystemEnabled` | — | `render/shipMicroMotion.js:1197`, `systems/factionPresence.js:405`, `systems/presentationOrchestrator.js:239`, `systems/surrenderRecovery.js:65` |
| `combat:surrendered` | — | `systems/combatOutcome.js:121`, `systems/surrenderRecovery.js:63` |
| `combat:tumbled` | `systems/tumbleStates.js:330` | `systems/fields.js:366`, `systems/missions.js:1164`, `systems/tetherGameplay.js:212` |
| `combat:warded` | `combat/damage.js:52` | — |
| `combat:weakPointHit` | `systems/combat.js:609` | `render/vfx.js:2232`, `ui/floatingText.js:173` |
| `comms:log` | `data/encounters/344-opening-hauler-raid.js:130`, `systems/encounterDirector.js:2116`, `systems/encounterScripts.js:660`, `systems/encounterScripts.js:2523`, `systems/encounterScripts.js:2769`, `systems/salvage.js:558` | `ui/floatingText.js:65` |
| `comms:message` | `systems/traffic.js:4607`, `systems/traffic.js:5348` | — |
| `comms:popup` | `systems/ai.js:488`, `systems/factionPresence.js:893`, `systems/factionPresence.js:914`, `systems/missions.js:3938`, `systems/missions.js:5909`, `systems/missions.js:5943`, `systems/missions.js:5982`, `systems/missions.js:7091`, `systems/missions.js:7501`, `systems/onboarding.js:714`, `systems/scenarioRuntime.js:186`, `systems/story.js:415`, `systems/story.js:1096`, `systems/story.js:1124` | `audio/audioSystem.js:1837`, `ui/screens/codex.js:569` |
| `conflict:flip` | `systems/factions.js:606` | `systems/factionPresence.js:410`, `systems/sectorSim.js:109`, `systems/story.js:183` |
| `conflict:frontAction` | `systems/factions.js:493` | — |
| `conflict:warDeclared` | `systems/factions.js:550` | — |
| `contactHail:availability` | `systems/scanner.js:1324`, `systems/scanner.js:1335` | — |
| `contactHail:choice` | `ui/commsRadial.js:533`, `ui/contactHailPrompt.js:167` | `systems/scanner.js:803` |
| `contactHail:clear` | `systems/scanner.js:1346` | — |
| `contactHail:handoff` | `systems/scanner.js:1184` | — |
| `contactHail:offer` | `systems/scanner.js:1206` | — |
| `contactHail:request` | `ui/commsRadial.js:585`, `ui/contactHailPrompt.js:161` | `systems/scanner.js:802` |
| `contactHail:response` | `systems/scanner.js:1240` | `systems/traffic.js:1301` |
| `contraband:bribe` | `systems/encounterScripts.js:426`, `ui/customsPrompt.js:207` | `systems/economy.js:905` |
| `contraband:scanned` | `systems/economy.js:2450` | `systems/encounterDirector.js:257`, `systems/factions.js:274`, `systems/heat.js:240`, `systems/lawSecurity.js:210`, `ui/customsPrompt.js:139` |
| `contract:clauseBroken` | `systems/contractClauses.js:351` | `systems/missions.js:1201` |
| `contract:clauseHonored` | `systems/contractClauses.js:338`, `systems/missions.js:5996` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:277` | `render/shipMicroMotion.js:1200` |
| `craft:complete` | `systems/crafting.js:267`, `systems/crafting.js:310` | `ui/station/screens/industry.js:352` |
| `craft:queueChanged` | `systems/crafting.js:162`, `systems/crafting.js:277`, `systems/crafting.js:312` | `systems/onboarding.js:508`, `ui/station/screens/industry.js:352` |
| `credits:changed` | `systems/economy.js:2064`, `systems/economy.js:2076` | `audio/audioSystem.js:1750`, `balance/hunterPublicRoute.js:466`, `ui/commandBar.js:413`, `ui/hud.js:3782` |
| `cruise:charging` | `systems/cruise.js:123` | `render/vfx.js:2281`, `systems/presentationOrchestrator.js:175` |
| `cruise:dropped` | `systems/cruise.js:189` | `render/vfx.js:2283`, `systems/presentationOrchestrator.js:177` |
| `cruise:engaged` | `systems/cruise.js:98` | `render/vfx.js:2282`, `systems/presentationOrchestrator.js:176` |
| `cruise:snareRequest` | `systems/encounterScripts.js:523` | `systems/cruise.js:66` |
| `cruise:snared` | `systems/cruise.js:188` | `audio/audioSystem.js:1831` |
| `customs:breakScan` | `ui/customsPrompt.js:211` | — |
| `customs:submit` | `ui/customsPrompt.js:190` | — |
| `danger:miningNoise` | `systems/mining.js:1817` | — |
| `day:tick` | `core/coreSystem.js:263` | `systems/custodyConsequences.js:40`, `systems/encounterDirector.js:233`, `systems/factions.js:305`, `systems/sectorSim.js:93` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:226` | `systems/combat.js:521` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:217` | `systems/combat.js:520` |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:315` | — |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:346` | — |
| `discovery:plateUnlocked` | `systems/world.js:655`, `systems/world.js:4742`, `systems/world.js:4993`, `systems/world.js:5613` | `audio/audioSystem.js:1767`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:571` |
| `distress:call` | `systems/traffic.js:4605` | — |
| `distress:rescued` | `systems/encounterScripts.js:659` | `systems/factions.js:283` |
| `dock:attempt` | `ui/input.js:176` | `ui/dockDenyBanner.js:116` |
| `dock:denied` | `ui/dockDenyBanner.js:141` | — |
| `dock:docked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:180` | `audio/audioSystem.js:1768`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/infrastructureMotion.js:115`, `render/shipMicroMotion.js:1190`, `save/saveSystem.js:267`, `systems/aftermathWrecks.js:896`, `systems/autoTargetAssist.js:101`, `systems/combat.js:507`, `systems/economy.js:885`, `systems/economyContracts.js:164`, `systems/factionPresence.js:402`, `systems/lawSecurity.js:215`, `systems/mining.js:184`, `systems/missions.js:1087`, `systems/onboarding.js:347`, `systems/onboarding.js:474`, `systems/pirateDisguise.js:37`, `systems/scanner.js:806`, `systems/stationServices.js:205`, `systems/story.js:148`, `systems/world.js:513`, `ui/alerts.js:330`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:117`, `ui/impoundPayPrompt.js:35`, `ui/priceForecast.js:86`, `ui/promptDeck.js:710`, `ui/securityReadout.js:158`, `ui/uiRoot.js:1086`, `ui/wingmanRadial.js:247` |
| `dock:launder` | — | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:1030`, `core/physics.js:1034`, `ui/input.js:153` | `systems/onboarding.js:443`, `ui/alerts.js:326`, `ui/input.js:159` |
| `dock:undocked` | `balance/careerCohorts.js:489`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:682`, `ui/station/stationApp.js:851` | `audio/audioSystem.js:1773`, `render/infrastructureMotion.js:116`, `render/shipMicroMotion.js:1191`, `save/saveSystem.js:268`, `systems/combat.js:511`, `systems/economy.js:893`, `systems/missions.js:1106`, `systems/onboarding.js:396`, `systems/presentationAdapters.js:202`, `systems/stationServices.js:206`, `systems/world.js:514`, `ui/input.js:167`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1116` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1309` | `ui/uiRoot.js:1175` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1294`, `ui/sandbox/sandboxSetup.js:593` | `ui/uiRoot.js:1165` |
| `drill:approachRequested` | `ui/input.js:597` | `systems/tetherGameplay.js:211` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1186`, `ui/sandbox/sandboxSetup.js:592` | `ui/uiRoot.js:1154` |
| `drill:break` | `systems/drill.js:1195` | `audio/audioSystem.js:1951`, `systems/asteroidSites.js:166`, `systems/presentationOrchestrator.js:216`, `ui/asteroid/asteroidScreen.js:1611`, `ui/screens/drill.js:1742` |
| `drill:cargoFull` | `systems/drill.js:1244` | `audio/audioSystem.js:1953`, `systems/presentationOrchestrator.js:223`, `ui/asteroid/asteroidScreen.js:1601`, `ui/screens/drill.js:1712` |
| `drill:end` | `systems/drill.js:807` | `audio/audioSystem.js:1961`, `systems/asteroidSites.js:176`, `systems/presentationOrchestrator.js:224` |
| `drill:gasHit` | `systems/drill.js:1283` | `audio/audioSystem.js:1952`, `systems/presentationOrchestrator.js:218`, `ui/asteroid/asteroidScreen.js:1588`, `ui/screens/drill.js:1652` |
| `drill:retry` | `systems/drill.js:858` | `systems/presentationOrchestrator.js:225` |
| `drill:rockDepleted` | `systems/drill.js:773`, `systems/drill.js:1209`, `systems/drill.js:1235` | `audio/audioSystem.js:1954`, `ui/asteroid/asteroidScreen.js:1598`, `ui/screens/drill.js:1703` |
| `drill:scanPulse` | `systems/drill.js:931` | `audio/audioSystem.js:1955`, `systems/asteroidSites.js:193`, `systems/presentationOrchestrator.js:214`, `ui/asteroid/asteroidScreen.js:1605`, `ui/screens/drill.js:1730` |
| `drill:spark` | `systems/drill.js:1165` | `audio/audioSystem.js:1950`, `systems/presentationOrchestrator.js:215`, `ui/asteroid/asteroidScreen.js:1616`, `ui/screens/drill.js:1763` |
| `drill:start` | `systems/drill.js:765` | `audio/audioSystem.js:1960`, `systems/asteroidSites.js:159`, `systems/onboarding.js:479`, `systems/presentationOrchestrator.js:213` |
| `drill:warn` | `systems/drill.js:779`, `systems/drill.js:784`, `systems/drill.js:1061`, `systems/drill.js:1096`, `systems/drill.js:1117`, `systems/drill.js:1216`, `systems/drill.js:1247`, `systems/drill.js:1254` | `audio/audioSystem.js:1956`, `systems/presentationOrchestrator.js:212`, `ui/asteroid/asteroidRenderer3d.js:7054`, `ui/asteroid/asteroidScreen.js:1594`, `ui/screens/drill.js:1680` |
| `drill:yield` | `systems/drill.js:1233` | `audio/audioSystem.js:1947`, `systems/presentationOrchestrator.js:217`, `ui/asteroid/asteroidScreen.js:1580`, `ui/screens/drill.js:1631` |
| `economy:applyTradePressure` | `systems/automation.js:847`, `systems/automation.js:1574`, `systems/automation.js:1575`, `systems/claims.js:1005`, `systems/encounterDirector.js:1653`, `systems/encounterDirector.js:1701`, `systems/sectorSim.js:375`, `systems/traffic.js:8267`, `systems/traffic.js:10002` | `systems/economy.js:868` |
| `economy:cargoKillOpportunity` | `systems/economy.js:1847` | `systems/missions.js:1117` |
| `economy:chargeCredits` | `systems/automation.js:1747`, `systems/automation.js:1754`, `systems/automation.js:2571`, `systems/automation.js:2795`, `systems/beacons.js:69`, `systems/bombs.js:296`, `systems/bombs.js:376`, `systems/bombs.js:393`, `systems/claims.js:310`, `systems/claims.js:380`, `systems/claims.js:451`, `systems/claims.js:1049`, `systems/combat.js:830`, `systems/encounterDirector.js:1647`, `systems/factions.js:369`, `systems/gateControlDirector.js:120`, `systems/mining.js:422`, `systems/missions.js:2808`, `systems/missions.js:2811`, `systems/pirateParley.js:508`, `systems/ships.js:1816`, `systems/ships.js:1886`, `systems/ships.js:1942`, `systems/world.js:3331`, `systems/world.js:3375`, `systems/world.js:4410` | `systems/economy.js:834` |
| `economy:demandShift` | `systems/economy.js:1162` | — |
| `economy:eventEnded` | `systems/economy.js:2528` | `ui/floatingText.js:252` |
| `economy:eventStarted` | `systems/economy.js:2503` | `ui/floatingText.js:241` |
| `economy:grantCredits` | `systems/automation.js:1848`, `systems/automation.js:1859`, `systems/automation.js:2557`, `systems/bombs.js:409`, `systems/claims.js:1004`, `systems/claims.js:1620`, `systems/combat.js:682`, `systems/combat.js:694`, `systems/combat.js:915`, `systems/encounterDirector.js:1648`, `systems/mining.js:1479`, `systems/mining.js:1656`, `systems/missions.js:6004`, `systems/missions.js:6007`, `systems/missions.js:6345`, `systems/missions.js:7414`, `systems/moralTrap.js:193`, `systems/ships.js:1972`, `systems/survivorPod.js:1021`, `systems/uniqueWrecks.js:1456` | `systems/economy.js:833`, `systems/story.js:181` |
| `economy:marketOpened` | `ui/station/screens/market.js:1237` | `systems/economy.js:844`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1224` | `systems/economy.js:836` |
| `economy:salvageIntakeApplied` | `systems/economy.js:2047` | — |
| `economy:sinkCharged` | `systems/economy.js:2090` | — |
| `economy:tick` | `systems/economy.js:995` | `ui/priceHistory.js:116` |
| `economy:tradeCompleted` | `systems/economy.js:1699` | `audio/audioSystem.js:1751`, `audio/audioSystem.js:1807`, `careers/origins/haulerOriginSystem.js:91`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:275`, `systems/claims.js:278`, `systems/factions.js:253`, `systems/missions.js:1115`, `systems/onboarding.js:352`, `systems/sectorSim.js:104`, `systems/story.js:177` |
| `economy:tradeFailed` | `systems/economy.js:1918`, `systems/economy.js:1941` | — |
| `emergent:audio` | `systems/emergentPrimitives.js:144` | — |
| `emergent:contact` | `systems/emergentPrimitives.js:150` | `render/feel.js:1269` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1504` | `ui/encounterChoicePrompt.js:53` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:270` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1589` | — |
| `encounter:hostileCommitted` | `systems/encounterDirector.js:2157` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:6830` | `systems/encounterDirector.js:255` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1779`, `systems/encounterScripts.js:2743` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:2121` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:1061` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:978`, `systems/encounterScripts.js:1046` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:951` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1602` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:1584`, `systems/encounterDirector.js:1633`, `systems/survivalArena.js:1127` | `audio/audioSystem.js:1777`, `systems/aftermathWrecks.js:895`, `systems/claims.js:282`, `systems/claims.js:283`, `systems/story.js:136`, `systems/terrainAnchors.js:89`, `systems/traffic.js:1364`, `systems/uniqueLootAbilities.js:133`, `ui/encounterChoicePrompt.js:54` |
| `encounter:spawned` | `systems/encounterDirector.js:990` | `systems/uniqueLootAbilities.js:132` |
| `encounter:stale` | `systems/encounterDirector.js:333` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:962`, `systems/survivalArena.js:1052` | `audio/audioSystem.js:1776`, `systems/survivalResults.js:454`, `systems/terrainAnchors.js:88`, `systems/world.js:523` |
| `encounter:voice` | `systems/encounterDirector.js:1487` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | — |
| `endgame:archive` | `systems/story.js:164` | — |
| `endgame:chosen` | `systems/story.js:938` | `ui/screens/missionLog.js:2197` |
| `endgame:confirmRequired` | `systems/story.js:823` | `ui/screens/missionLog.js:2196` |
| `endgame:eligibility` | `systems/story.js:640` | `ui/screens/missionLog.js:2195` |
| `endgame:finaleCompleted` | `systems/story.js:716` | — |
| `endgame:finaleReady` | `systems/story.js:947` | — |
| `endgame:ineligible` | `systems/story.js:726`, `systems/story.js:803`, `systems/story.js:868` | — |
| `endgame:loopBack` | — | `systems/story.js:172` |
| `endgame:promptChoiceC` | `systems/story.js:788` | — |
| `endgame:promptChoiceD` | `systems/story.js:752` | — |
| `endgame:promptSandbox` | `systems/story.js:651` | — |
| `endgame:pullCompleted` | `systems/claims.js:2172` | `systems/factions.js:296` |
| `endgame:sandboxContinued` | `systems/story.js:932` | `ui/screens/missionLog.js:2198` |
| `entity:destroyed` | `main.js:466`, `main.js:698`, `save/saveSystem.js:3440`, `systems/survivorPod.js:274`, `systems/traffic.js:6342` | `audio/audioSystem.js:1729`, `combat/kernel.js:70`, `render/vfx.js:2243`, `systems/aftermathWrecks.js:890`, `systems/ai.js:113`, `systems/encounterDirector.js:249`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:247`, `systems/lawSecurity.js:203`, `systems/missions.js:1132`, `systems/npcJobsRuntime.js:880`, `systems/presentationOrchestrator.js:174`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:94`, `systems/survivalWave.js:95`, `systems/swarmArena.js:428`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:171` |
| `entity:killed` | `balance/careerCohorts.js:457`, `combat/damage.js:464`, `combat/kernel.js:45`, `systems/combat.js:661` | `audio/audioSystem.js:1728`, `render/feel.js:1147`, `render/shipMicroMotion.js:1174`, `render/vfx.js:2242`, `sim/titleAttract.js:166`, `systems/aftermathWrecks.js:888`, `systems/ai.js:114`, `systems/barkDirector.js:250`, `systems/combatOutcome.js:118`, `systems/economy.js:874`, `systems/encounterDirector.js:250`, `systems/factions.js:215`, `systems/factions.js:243`, `systems/impulseCharges.js:226`, `systems/lawSecurity.js:202`, `systems/lawSecurity.js:214`, `systems/lootShards.js:514`, `systems/lossLedger.js:380`, `systems/mining.js:179`, `systems/missions.js:1127`, `systems/npcJobsRuntime.js:872`, `systems/onboarding.js:387`, `systems/onboarding.js:412`, `systems/presentationOrchestrator.js:173`, `systems/sectorSim.js:108`, `systems/surrenderRecovery.js:70`, `systems/survivalResults.js:445`, `systems/survivorPod.js:412`, `systems/swarmChain.js:107`, `systems/swarmSupply.js:101`, `systems/titles.js:397`, `systems/traffic.js:1289`, `systems/wingMorale.js:178`, `systems/world.js:526`, `ui/floatingText.js:170`, `ui/floatingText.js:208`, `ui/uiRoot.js:620`, `ui/uiRoot.js:628` |
| `entity:spawnRequest` | — | `core/coreSystem.js:175` |
| `entity:spawned` | `core/coreSystem.js:76` | `combat/kernel.js:65`, `render/asteroidMotionPresentation.js:453`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:220`, `render/shipMicroMotion.js:1175`, `render/vfx.js:2249`, `sim/titleAttract.js:167`, `systems/factionPresence.js:408`, `systems/fields.js:361`, `systems/lawSecurity.js:201`, `systems/lossLedger.js:379`, `systems/npcJobsRuntime.js:857`, `systems/salvageActions.js:69`, `systems/survivalSwarm.js:216`, `systems/swarmSupply.js:106`, `systems/titles.js:398`, `systems/uniqueLootAbilities.js:135` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:219`, `systems/environmentalMachinery.js:726` | `systems/terrainAnchors.js:90` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:541` | `systems/terrainAnchors.js:94` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:620` | `systems/terrainAnchors.js:92` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:817` | `data/hazardLanguage.js:133` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:553` | `systems/terrainAnchors.js:96` |
| `escalation:arrived` | `systems/encounterDirector.js:373` | — |
| `escalation:seeded` | `systems/encounterDirector.js:360` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:345`, `systems/factions.js:411`, `systems/factions.js:720` | `systems/heat.js:246` |
| `faction:bribe` | `ui/screens/footprint.js:1230` | `systems/factions.js:208` |
| `faction:repChanged` | `systems/factions.js:342`, `systems/factions.js:406`, `systems/factions.js:716` | `ui/floatingText.js:226`, `ui/station/screens/factions.js:381` |
| `faction:repDelta` | `balance/careerCohorts.js:256`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:1287`, `systems/economy.js:2299`, `systems/economy.js:2443`, `systems/encounterDirector.js:1649`, `systems/missions.js:6342`, `systems/missions.js:6398`, `systems/missions.js:7366`, `systems/missions.js:7368`, `systems/missions.js:7432`, `systems/moralTrap.js:187`, `systems/stuntGrammar.js:102`, `systems/survivorPod.js:811`, `systems/survivorPod.js:1027`, `systems/uniqueWrecks.js:1460`, `systems/world.js:5118`, `systems/world.js:5352` | `systems/factions.js:205` |
| `faction:repSpillover` | `systems/factions.js:404` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1140` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:897` | `systems/story.js:196` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1052` | `ui/uiRoot.js:286` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:746` | — |
| `factionPresence:service` | `systems/factionPresence.js:846` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:922` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:487`, `systems/factionPresence.js:572` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:789` | `systems/world.js:489` |
| `field:opportunity` | `systems/world.js:3722` | — |
| `field:regrown` | `systems/world.js:3651` | `systems/presentationOrchestrator.js:211` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:717`, `systems/traffic.js:1645`, `systems/traffic.js:9921` | — |
| `field:richSeamOpened` | `systems/traffic.js:8975` | — |
| `field:richSeamWorked` | `systems/mining.js:762`, `systems/traffic.js:8634` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:788` | `systems/npcJobsRuntime.js:888`, `systems/presentationOrchestrator.js:210` |
| `fields:anchorRegistered` | `systems/fields.js:638` | — |
| `fields:cleared` | `systems/fields.js:1116` | — |
| `fields:clusterDetonate` | `systems/fields.js:1687` | `systems/presentationOrchestrator.js:272` |
| `fields:coneToggled` | `systems/fields.js:825`, `systems/fields.js:832`, `systems/fields.js:926`, `systems/fields.js:934` | `systems/onboarding.js:403` |
| `fields:deployDenied` | `systems/fields.js:705` | — |
| `fields:deployed` | `systems/fields.js:527`, `systems/fields.js:791`, `systems/fields.js:917` | `audio/audioSystem.js:1912`, `systems/fields.js:362`, `systems/onboarding.js:402` |
| `fields:ended` | `systems/fields.js:657`, `systems/fields.js:933`, `systems/fields.js:952`, `systems/fields.js:1086` | — |
| `fields:hitchCut` | `systems/fields.js:558` | — |
| `fields:hitchLatched` | `systems/fields.js:546` | — |
| `fields:specialistDisrupt` | `systems/fields.js:436` | — |
| `firsthour:beat` | `systems/onboarding.js:2649` | — |
| `firsthour:complete` | `systems/onboarding.js:2662` | — |
| `firsthour:milestone` | `systems/onboarding.js:795` | `audio/audioSystem.js:1905` |
| `firsthour:sentence` | `systems/onboarding.js:1429` | — |
| `firsthour:started` | `systems/onboarding.js:2446` | — |
| `firsthour:verb` | `systems/onboarding.js:2585` | — |
| `flight:modeChanged` | `systems/flightV3.js:577` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:279` |
| `flybyFocus:end` | `systems/flybyFocus.js:317` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:415` | `systems/onboarding.js:370` |
| `formation:discovered` | `systems/asteroidFormations.js:236` | — |
| `freight:arrival` | `systems/traffic.js:6701` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1463`, `systems/encounterScripts.js:1682`, `systems/traffic.js:4711` | `systems/barkDirector.js:248`, `systems/economy.js:835`, `systems/encounterDirector.js:275`, `systems/lootShards.js:516`, `systems/traffic.js:1307` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1325` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:507` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1382` | — |
| `freight:loss` | `systems/encounterDirector.js:1711`, `systems/traffic.js:8269`, `systems/traffic.js:10014` | `systems/encounterDirector.js:276` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1326` | `systems/surrenderRecovery.js:71` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1818` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:253`, `systems/traffic.js:1304` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:254`, `systems/traffic.js:1305` |
| `frontierRumor:acquired` | `systems/world.js:3394` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:5583` | — |
| `frontierRumor:contacted` | `systems/world.js:5479` | — |
| `frontierRumor:resolved` | `systems/world.js:3411` | — |
| `fuel:changed` | `systems/economy.js:2164`, `systems/stationServices.js:422`, `systems/stationServices.js:489`, `systems/world.js:4866`, `systems/world.js:4874` | — |
| `fuel:empty` | `systems/world.js:4867` | `audio/audioSystem.js:1797`, `ui/alerts.js:371` |
| `game:exitToMenu` | `ui/screens/crucible.js:2510`, `ui/screens/crucible.js:2523`, `ui/screens/demoEnd.js:216`, `ui/screens/pause.js:979` | `audio/audioSystem.js:1999`, `main.js:249`, `systems/runSession.js:57`, `ui/screens/crucibleLabControls.js:549` |
| `game:load` | `ui/input.js:308`, `ui/input.js:482`, `ui/screens/mainMenu.js:521`, `ui/screens/saveLoad.js:1192` | `save/saveSystem.js:189`, `systems/scanner.js:805`, `ui/commandBar.js:430`, `ui/promptDeck.js:709` |
| `game:loadingProgress` | `main.js:148`, `main.js:166`, `main.js:642`, `main.js:723`, `main.js:739`, `main.js:758`, `main.js:776`, `main.js:817`, `main.js:954` | `ui/loadingPresenter.js:319`, `ui/screens/newGame.js:813`, `ui/screens/saveLoad.js:813` |
| `game:new` | `main.js:409`, `ui/sandbox/sandboxSetup.js:359`, `ui/screens/crucible.js:2514`, `ui/screens/gameOver.js:342`, `ui/screens/newGame.js:892` | `audio/audioSystem.js:1994`, `audio/bombAudio.js:328`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:189`, `main.js:228`, `render/feel.js:1090`, `render/vfx.js:2257`, `save/saveSystem.js:252`, `systems/aftermathWrecks.js:902`, `systems/bombs.js:210`, `systems/cloak.js:44`, `systems/encounterDirector.js:247`, `systems/environmentalMachinery.js:141`, `systems/fields.js:355`, `systems/impulseCharges.js:230`, `systems/massSeed.js:120`, `systems/masslineSnares.js:129`, `systems/mines.js:37`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:274`, `systems/scanner.js:804`, `systems/surrenderRecovery.js:77`, `systems/survivorPod.js:410`, `systems/tetherGameplay.js:206`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/moralTrapPrompt.js:44`, `ui/priceHistory.js:146`, `ui/promptDeck.js:708`, `ui/screens/crucibleLabControls.js:543` |
| `game:newGame` | `main.js:487` | `audio/audioSystem.js:1995`, `audio/bombAudio.js:329`, `core/coreSystem.js:190`, `render/shipMicroMotion.js:1178`, `render/vfx.js:2258`, `save/saveSystem.js:256`, `systems/aftermathWrecks.js:903`, `systems/bombs.js:213`, `systems/cloak.js:45`, `systems/collisionConsequences.js:62`, `systems/fieldDepletion.js:705`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:382`, `systems/survivorPod.js:409`, `systems/titles.js:400`, `systems/wingMorale.js:180`, `ui/uiRoot.js:531` |
| `game:over` | `systems/combat.js:634`, `systems/combat.js:736` | `ui/uiRoot.js:1198` |
| `game:save` | `ui/input.js:307`, `ui/input.js:480`, `ui/screens/saveLoad.js:1212` | `save/saveSystem.js:178` |
| `game:scenePrepared` | `main.js:548` | `ui/sandbox/sandboxSetup.js:383` |
| `game:startFailed` | `main.js:907` | `ui/loadingPresenter.js:330`, `ui/sandbox/sandboxSetup.js:388`, `ui/screens/crucibleLabControls.js:545`, `ui/screens/newGame.js:812`, `ui/screens/saveLoad.js:819` |
| `game:started` | `main.js:651` | `audio/audioSystem.js:2000`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:191`, `save/saveSystem.js:249`, `save/saveSystem.js:263`, `sim/killcamTape.js:426`, `systems/automation.js:559`, `systems/collisionConsequences.js:61`, `systems/combat.js:518`, `systems/economyContracts.js:167`, `systems/factions.js:202`, `systems/flight.js:79`, `systems/flightV3.js:155`, `systems/heat.js:253`, `systems/lootShards.js:517`, `systems/masslineSnares.js:130`, `systems/missions.js:1065`, `systems/onboarding.js:332`, `systems/presentationAdapters.js:200`, `systems/presentationOrchestrator.js:275`, `systems/sectorSim.js:99`, `systems/ships.js:1531`, `systems/story.js:134`, `systems/surrenderRecovery.js:78`, `systems/tetherGameplay.js:207`, `ui/alerts.js:351`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:380`, `ui/screens/crucibleLabControls.js:544`, `ui/uiRoot.js:1183`, `ui/uiRoot.js:1241`, `ui/uiRoot.js:1243` |
| `gamepad:connected` | `systems/gamepad.js:441` | — |
| `gamepad:disconnected` | `systems/gamepad.js:412` | — |
| `gate:range` | `core/physics.js:1040`, `core/physics.js:1044` | `systems/onboarding.js:450`, `systems/presentationOrchestrator.js:178`, `ui/alerts.js:332` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:565`, `systems/story.js:491`, `systems/story.js:505`, `systems/story.js:538`, `systems/story.js:1232`, `systems/story.js:1524`, `systems/story.js:1691`, `systems/uniqueWrecks.js:1466` | `systems/ships.js:1526`, `ui/screens/codex.js:570` |
| `harasser:disengaged` | `systems/encounterDirector.js:1967` | — |
| `hazard:changed` | `systems/world.js:648` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:760`, `systems/world.js:4770` | `data/hazardLanguage.js:129`, `render/shipMicroMotion.js:1183` |
| `hazard:exit` | `systems/environmentalMachinery.js:769`, `systems/world.js:4777` | `data/hazardLanguage.js:130`, `render/shipMicroMotion.js:1184` |
| `heat:changed` | `systems/heat.js:568` | `audio/audioSystem.js:1800`, `render/vfx.js:2254`, `systems/barkDirector.js:255`, `systems/lawSecurity.js:216`, `systems/onboarding.js:415`, `ui/hud.js:3810` |
| `heat:clear` | — | `systems/heat.js:257` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:847` | `systems/missions.js:1174` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1213` | — |
| `heist:captureFork` | `systems/heistFacilities.js:1468` | `systems/missions.js:1183` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1355` | `systems/missions.js:1179` |
| `heist:launchCue` | `systems/heistFacilities.js:339` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:457`, `systems/heistFacilities.js:466`, `systems/heistFacilities.js:470`, `systems/heistFacilities.js:484` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:1867` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:1809` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:1790` | `systems/npcJobsRuntime.js:891` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:1728` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:249` |
| `hud:firstUse` | `systems/onboarding.js:587` | `ui/hud.js:2023` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:279` |
| `hud:phase` | `systems/story.js:248`, `systems/story.js:278`, `systems/story.js:281`, `systems/story.js:579` | `ui/hudMeta.js:142` |
| `hud:recallObjective` | `ui/input.js:326` | `ui/hud.js:1547` |
| `hud:slotClaim` | `ui/promptDeck.js:229` | `ui/hud.js:1915` |
| `hud:slotRelease` | `ui/promptDeck.js:230` | `ui/hud.js:1916` |
| `hud:tagFlicker` | `systems/story.js:556` | `ui/hudMeta.js:176` |
| `hull:fractured` | `systems/hullFracture.js:178` | — |
| `interdiction:triggered` | `systems/encounterScripts.js:524`, `systems/world.js:4295` | `systems/presentationOrchestrator.js:186`, `systems/sectorSim.js:105` |
| `intervention:available` | `systems/intervention.js:110` | — |
| `intervention:closed` | `systems/intervention.js:124` | — |
| `jump:arrive` | `systems/world.js:4236` | `render/feel.js:1231`, `render/shipMicroMotion.js:1188`, `save/saveSystem.js:270`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:184`, `systems/sectorSim.js:114` |
| `jump:chargeAbort` | `systems/world.js:4373`, `systems/world.js:4437`, `systems/world.js:4495` | `render/shipMicroMotion.js:1189`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:183`, `systems/routeFollower.js:324` |
| `jump:chargeStart` | `systems/world.js:4422`, `systems/world.js:4461` | `render/feel.js:1221`, `render/shipMicroMotion.js:1185`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:180`, `systems/story.js:154` |
| `jump:chargeTick` | `systems/world.js:4179` | `render/shipMicroMotion.js:1186`, `systems/presentationOrchestrator.js:181` |
| `jump:departurePreflight` | `systems/world.js:4406` | `systems/story.js:153` |
| `jump:start` | `systems/world.js:4196` | `render/feel.js:1225`, `render/shipMicroMotion.js:1187`, `systems/economy.js:903`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:182`, `systems/sectorSim.js:113` |
| `jump:unfiledConfirmed` | `systems/world.js:4479` | `systems/story.js:155` |
| `landmark:artifactRecovered` | `systems/missions.js:4178` | `systems/world.js:515` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:39` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:251` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:70` | `systems/lawSecurity.js:217` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:30` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:31` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:41` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:43`, `systems/heat.js:267`, `ui/impoundPayPrompt.js:32` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:33` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:42` |
| `law:incidentOpened` | — | `systems/traffic.js:1313` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:254`, `systems/heat.js:274` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:263` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:253` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:252` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:274` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `systems/lawSecurity.js:209` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:698`, `systems/lootShards.js:877`, `systems/stuntGrammar.js:110` | `systems/mining.js:181`, `ui/floatingText.js:196`, `ui/floatingText.js:199` |
| `loot:magnetCaptured` | `systems/lootShards.js:582` | — |
| `loot:manifestPayload` | `systems/lootShards.js:955` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:342` | `systems/factionPresence.js:403`, `systems/ships.js:1480` |
| `map:sectorCharted` | `systems/world.js:3335` | `systems/economy.js:849` |
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
| `massline:recovered` | `systems/tumbleStates.js:160` | — |
| `massline:recovering` | `systems/tumbleStates.js:119` | — |
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
| `massline:throw` | `systems/masslineThrow.js:537` | `systems/missions.js:1162`, `systems/tumbleStates.js:72` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:118` | `render/feel.js:1316` |
| `massline:tumbled` | `systems/tumbleStates.js:331` | `render/feel.js:1302` |
| `mines:armed` | `systems/mines.js:135` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:53` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:147`, `systems/survivalArena.js:1023` | `systems/mines.js:34` |
| `mines:placed` | `systems/mines.js:108` | `systems/survivalArena.js:844` |
| `mines:released` | `systems/mines.js:228` | — |
| `mines:triggered` | `systems/mines.js:193` | — |
| `mining:beamLocked` | `systems/mining.js:671` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:1657` | `systems/missions.js:1125`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:685` | `systems/presentationOrchestrator.js:206`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:537` | — |
| `mining:npcExtraction` | `systems/traffic.js:8622` | `systems/fieldDepletion.js:704` |
| `mining:podSplit` | `systems/mining.js:1232` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:1610` | `render/asteroidMotionPresentation.js:455`, `systems/presentationOrchestrator.js:203` |
| `mining:richCoreCompleted` | `systems/mining.js:1637` | `render/asteroidMotionPresentation.js:456`, `systems/presentationOrchestrator.js:204` |
| `mining:richCoreExposed` | `systems/mining.js:1588` | `render/asteroidMotionPresentation.js:454`, `systems/presentationOrchestrator.js:202` |
| `mining:richCoreFizzle` | `systems/mining.js:1639` | `render/asteroidMotionPresentation.js:457`, `systems/presentationOrchestrator.js:205` |
| `mining:seamHit` | `systems/mining.js:1885` | `audio/audioSystem.js:1893`, `systems/presentationOrchestrator.js:195` |
| `mining:start` | `systems/mining.js:263`, `systems/mining.js:385`, `systems/mining.js:1184` | `audio/audioSystem.js:1732`, `render/asteroidMotionPresentation.js:449`, `render/vfx.js:2267`, `systems/onboarding.js:355`, `systems/presentationOrchestrator.js:192` |
| `mining:stop` | `systems/mining.js:485` | `audio/audioSystem.js:1733`, `render/asteroidMotionPresentation.js:450`, `render/vfx.js:2268`, `systems/presentationOrchestrator.js:193` |
| `mining:tick` | `systems/automation.js:995`, `systems/mining.js:706` | `audio/audioSystem.js:1734`, `render/vfx.js:2269`, `systems/presentationOrchestrator.js:194` |
| `mining:ventBonus` | `systems/mining.js:573` | — |
| `mining:ventReady` | `systems/mining.js:518` | `systems/presentationOrchestrator.js:199` |
| `mining:yield` | `balance/careerCohorts.js:1806`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:570`, `systems/mining.js:825`, `systems/mining.js:1307`, `systems/mining.js:1634` | `audio/audioSystem.js:1889`, `careers/origins/prospectorOrigin.js:636`, `render/vfx.js:2272`, `systems/encounterDirector.js:272`, `systems/missions.js:1119`, `systems/onboarding.js:356`, `systems/presentationOrchestrator.js:200`, `ui/floatingText.js:181` |
| `miningDrone:sellOre` | — | `systems/economy.js:864` |
| `mission:abandon` | `systems/moralTrap.js:177` | `systems/missions.js:1078` |
| `mission:accepted` | `systems/missions.js:2830` | `audio/audioSystem.js:1761`, `save/saveSystem.js:271`, `systems/aftermathWrecks.js:898`, `systems/contractClauses.js:196`, `systems/economy.js:830`, `systems/moralTrap.js:106`, `systems/onboarding.js:358`, `ui/hud.js:3790`, `ui/screens/missionLog.js:2180` |
| `mission:completed` | `systems/missions.js:6102` | `audio/audioSystem.js:1762`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:272`, `systems/aftermathWrecks.js:899`, `systems/claims.js:279`, `systems/contractClauses.js:200`, `systems/factions.js:262`, `systems/lossLedger.js:381`, `systems/onboarding.js:359`, `systems/story.js:176`, `ui/hud.js:3791`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2181` |
| `mission:conditionBroken` | `systems/contractClauses.js:306`, `systems/missions.js:1394` | — |
| `mission:conditionPending` | `systems/missions.js:1447` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:274`, `systems/missions.js:1377` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:285`, `systems/missions.js:1385` | `systems/missions.js:1204` |
| `mission:expired` | `systems/missions.js:6411` | `audio/audioSystem.js:1766`, `save/saveSystem.js:274`, `systems/aftermathWrecks.js:901`, `systems/factions.js:271`, `ui/screens/missionLog.js:2183` |
| `mission:failed` | `systems/missions.js:6365` | `audio/audioSystem.js:1765`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:273`, `systems/aftermathWrecks.js:900`, `systems/factions.js:270`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2182` |
| `mission:forceEvent` | — | `systems/economy.js:908` |
| `mission:offerBoarded` | `systems/missions.js:2164` | `systems/aftermathWrecks.js:897` |
| `mission:offered` | `systems/aftermathWrecks.js:1499`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:232`, `systems/economyContracts.js:254`, `systems/lossLedger.js:318`, `systems/postEndingReplay.js:340`, `systems/salvage.js:566`, `systems/uniqueWrecks.js:800` | `systems/economy.js:829`, `systems/lossInvestigation.js:106`, `systems/missions.js:1083`, `systems/survivorPod.js:407` |
| `mission:setPieceTransition` | `systems/missions.js:5930` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:7097` | — |
| `mission:spawnDeferred` | `systems/missions.js:6944` | — |
| `mission:updated` | `systems/contractClauses.js:279`, `systems/contractClauses.js:289`, `systems/contractClauses.js:318`, `systems/missions.js:1381`, `systems/missions.js:1389`, `systems/missions.js:1407`, `systems/missions.js:1482`, `systems/missions.js:1586`, `systems/missions.js:1687`, `systems/missions.js:1757`, `systems/missions.js:1987`, `systems/missions.js:2021`, `systems/missions.js:2033`, `systems/missions.js:2163`, `systems/missions.js:2757`, `systems/missions.js:2842`, `systems/missions.js:2991`, `systems/missions.js:3195`, `systems/missions.js:3816`, `systems/missions.js:3852`, `systems/missions.js:3865`, `systems/missions.js:3873`, `systems/missions.js:3889`, `systems/missions.js:3927`, `systems/missions.js:3978`, `systems/missions.js:4055`, `systems/missions.js:4064`, `systems/missions.js:4211`, `systems/missions.js:4237`, `systems/missions.js:4305`, `systems/missions.js:4321`, `systems/missions.js:4363`, `systems/missions.js:4384`, `systems/missions.js:4420`, `systems/missions.js:4472`, `systems/missions.js:5472`, `systems/missions.js:5627`, `systems/missions.js:5673`, `systems/missions.js:5746`, `systems/missions.js:5753`, `systems/missions.js:6091`, `systems/missions.js:6388`, `systems/missions.js:6421`, `systems/missions.js:6713`, `systems/missions.js:6921`, `systems/missions.js:6935`, `systems/missions.js:7031`, `systems/missions.js:7179`, `systems/missions.js:7461`, `systems/missions.js:7607` | `ui/hud.js:3789`, `ui/screens/missionLog.js:2179`, `ui/station/screens/contracts.js:1062` |
| `mode:changed` | `main.js:252`, `main.js:884`, `main.js:894`, `main.js:905`, `save/saveSystem.js:3010`, `save/saveSystem.js:3140` | `systems/autoTargetAssist.js:96`, `systems/presentationAdapters.js:199`, `systems/scanner.js:807`, `ui/loadingPresenter.js:320`, `ui/screenManager.js:581`, `ui/uiRoot.js:762`, `ui/wingmanRadial.js:246` |
| `module:equipped` | `systems/ships.js:2095` | `systems/onboarding.js:395`, `systems/ships.js:1435`, `systems/world.js:486` |
| `module:granted` | `systems/ships.js:1900` | — |
| `module:purchased` | `systems/ships.js:1887` | — |
| `module:unequipped` | `systems/ships.js:1586`, `systems/ships.js:2114` | `systems/ships.js:1436`, `systems/world.js:487` |
| `moment:amended` | `systems/bulletTime.js:237` | — |
| `moment:holyShit` | — | `render/feel.js:1291` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:264` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | — |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:105` |
| `moralTrap:resolved` | `systems/moralTrap.js:173` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:138` | `ui/moralTrapPrompt.js:37` |
| `namedAce:appeared` | `systems/encounterScripts.js:2693` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:278` |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:404`, `systems/flightV3.js:972`, `systems/world.js:4549` | `systems/routeFollower.js:319` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:3415`, `systems/claims.js:1326`, `systems/claims.js:1334`, `systems/missions.js:1097`, `systems/missions.js:3184`, `systems/missions.js:3251`, `systems/missions.js:3283`, `systems/missions.js:3834`, `systems/world.js:4548`, `ui/market/tradeLogic.js:483` | — |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:111` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:176` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:107` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `news:dockCards` | `ui/marketNews.js:364` | — |
| `news:headline` | `systems/aftermathWrecks.js:745`, `systems/e1EncounterRuntime.js:225`, `systems/nemesisSignals.js:25`, `systems/traffic.js:8270`, `systems/traffic.js:10016`, `ui/marketNews.js:256` | — |
| `news:publish` | `systems/aftermathWrecks.js:763`, `systems/choirReliefBerth.js:166`, `systems/claims.js:1762`, `systems/claims.js:2180`, `systems/claims.js:2227`, `systems/npcJobsRuntime.js:1027`, `systems/traffic.js:3165`, `systems/traffic.js:9628`, `systems/uniqueWrecks.js:384`, `systems/uniqueWrecks.js:1510`, `systems/world.js:657` | — |
| `news:render` | `ui/hud.js:1459` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1298` |
| `npcjobs:load` | — | `systems/traffic.js:1296` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1003` | — |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:996` | — |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:987` | — |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:985` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:3002` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:4088` | — |
| `npcjobs:unload` | — | `systems/traffic.js:1297` |
| `npcjobs:work` | — | `systems/traffic.js:1295` |
| `onboarding:rangePrompt` | `systems/onboarding.js:1634`, `systems/onboarding.js:2438` | — |
| `optic:beamContact` | `systems/combat.js:1110` | — |
| `optic:contact` | `systems/weapons.js:1729`, `systems/weapons.js:1790` | `audio/audioSystem.js:1693` |
| `optic:rekindled` | — | `audio/audioSystem.js:1694` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1066` | `systems/world.js:493` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1644` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1091` | — |
| `orrinWitness:submitted` | `systems/story.js:1119` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:5445` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:495` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:5241` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:5276` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:5405` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:5359` | `ui/recoveryEncounterPrompt.js:478` |
| `patrol:proximity` | `systems/encounterScripts.js:438` | `systems/economy.js:904` |
| `pds:intercept` | `systems/countermeasures.js:220` | — |
| `physics:attachmentBroken` | — | `combat/kernel.js:74` |
| `physics:impact` | `core/physics.js:1576` | `audio/audioSystem.js:1688`, `render/asteroidMotionPresentation.js:446`, `render/feel.js:1268`, `render/shipMicroMotion.js:1182`, `render/vfx.js:2233`, `systems/asteroidSites.js:228`, `systems/barkDirector.js:258`, `systems/collisionConsequences.js:56`, `systems/fields.js:368`, `systems/fragileCargo.js:202`, `systems/gamepad.js:322`, `systems/heistFacilities.js:248`, `systems/impulseCharges.js:224`, `systems/lootShards.js:515`, `systems/masslineImpactDamage.js:43`, `systems/ships.js:1503` |
| `pickup:collected` | `core/physics.js:1416`, `systems/mining.js:1036`, `systems/mining.js:1739`, `systems/uniqueWrecks.js:1391` | `audio/audioSystem.js:1742`, `render/vfx.js:2295`, `save/saveSystem.js:228`, `systems/economy.js:875`, `systems/encounterDirector.js:252`, `systems/lawSecurity.js:212`, `systems/mining.js:183`, `systems/onboarding.js:357`, `systems/onboarding.js:414`, `systems/presentationOrchestrator.js:207`, `systems/swarmSupply.js:107`, `systems/traffic.js:1306`, `systems/world.js:496`, `systems/world.js:497`, `ui/floatingText.js:218` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:132` | `systems/pirateParley.js:42` |
| `pirateParley:demand` | `systems/scanner.js:1190` | `ui/pirateParleyPrompt.js:160` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:161` |
| `planet:collector` | `systems/planetRuntime.js:507` | — |
| `planet:harvest` | `systems/planetRuntime.js:540` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:544` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:407`, `systems/planetRuntime.js:419` | — |
| `planet:recoveryBurn` | `systems/planetRuntime.js:485` | — |
| `planet:registered` | `systems/planetRuntime.js:195` | — |
| `planet:unregistered` | `systems/planetRuntime.js:256` | — |
| `player:death` | `systems/combat.js:633`, `systems/combat.js:735`, `systems/combat.js:910`, `systems/world.js:4851` | `audio/audioSystem.js:1730`, `render/feel.js:1176`, `render/shipMicroMotion.js:1193`, `render/vfx.js:2266`, `save/saveSystem.js:235`, `systems/aftermathWrecks.js:889`, `systems/lawSecurity.js:211`, `systems/onboarding.js:388`, `systems/onboarding.js:413`, `systems/surrenderRecovery.js:73`, `systems/survivalResults.js:455`, `systems/survivalRun.js:123`, `systems/survivorPod.js:413`, `ui/commandBar.js:405`, `ui/hud.js:2395`, `ui/survivalHud.js:216` |
| `player:recoveryFailed` | `systems/combat.js:788` | `ui/screens/gameOver.js:374` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:317` | `systems/combat.js:512` |
| `player:respawn` | `systems/combat.js:847`, `systems/combat.js:923` | `audio/audioSystem.js:1731`, `render/shipMicroMotion.js:1192`, `save/saveSystem.js:236`, `save/saveSystem.js:286`, `ui/commandBar.js:409`, `ui/hud.js:2409`, `ui/screens/gameOver.js:366` |
| `player:scannedByPatrol` | `systems/economy.js:2392` | `render/vfx.js:2253`, `systems/missions.js:1198`, `ui/customsPrompt.js:138` |
| `poi:discovered` | `systems/world.js:686`, `systems/world.js:4682`, `systems/world.js:4727`, `systems/world.js:4964`, `systems/world.js:4990` | `systems/encounterDirector.js:266`, `systems/world.js:521` |
| `poi:identified` | `systems/world.js:4734`, `systems/world.js:4991` | `systems/encounterDirector.js:267`, `systems/missions.js:1084`, `systems/world.js:522` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2202` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2201` |
| `presentation:audioCue` | `systems/presentationAdapters.js:546` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:468` | — |
| `presentation:caption` | `audio/audioSystem.js:4501`, `systems/factionPresence.js:672`, `systems/factionPresence.js:1009`, `systems/factionPresence.js:1024`, `systems/factionPresence.js:1042`, `systems/factionPresence.js:1104`, `systems/presentationAdapters.js:638`, `systems/story.js:1010`, `systems/story.js:1174` | `ui/hud.js:2458` |
| `presentation:cue` | — | `audio/audioSystem.js:1839`, `render/vfx.js:2292`, `render/vfx.js:2293`, `systems/presentationAdapters.js:196` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:450` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:371`, `systems/presentationAdapters.js:617` | — |
| `presentation:vfxCue` | `render/vfx.js:2308`, `systems/countermeasures.js:228`, `systems/fields.js:1834`, `systems/fields.js:1853`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:544`, `systems/missions.js:2855`, `systems/missions.js:6107`, `systems/planetRuntime.js:564`, `systems/presentationAdapters.js:514`, `systems/tumbleStates.js:333`, `systems/tumbleStates.js:362`, `systems/weapons.js:1281`, `systems/weapons.js:1458`, `systems/weapons.js:2458` | `render/vfx.js:2294` |
| `projectile:bank` | — | `render/vfx.js:2228` |
| `projectile:hit` | `core/physics.js:778`, `core/physics.js:938`, `systems/sectorSim.js:548` | `audio/audioSystem.js:1678`, `combat/tetherWebs.js:27`, `render/vfx.js:2227`, `systems/bombs.js:218`, `systems/combat.js:505`, `systems/missions.js:1163` |
| `projectile:nearMiss` | `core/physics.js:898` | `audio/audioSystem.js:1681`, `systems/presentationOrchestrator.js:172`, `ui/hud.js:1950` |
| `projectile:ricochet` | — | `render/vfx.js:2229` |
| `range:opened` | `ui/screens/range.js:1397` | `systems/onboarding.js:400` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:157` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:158` |
| `rescue:beat` | `systems/onboarding.js:1810`, `systems/onboarding.js:1842` | — |
| `rescue:complete` | `systems/onboarding.js:1821` | — |
| `rescue:started` | `systems/onboarding.js:1405` | `systems/onboarding.js:389` |
| `research:pointsChanged` | `systems/missions.js:4088`, `systems/missions.js:4140`, `systems/missions.js:6050`, `systems/missions.js:6058`, `systems/missions.js:7421` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2269` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1101` | `systems/encounterDirector.js:273` |
| `rhythm:phase` | `systems/encounterDirector.js:344` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:317` | — |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:114` |
| `run:awardRequested` | — | `systems/runSession.js:53` |
| `run:awarded` | — | `ui/survivalHud.js:196` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1096`, `ui/sandbox/sandboxSetup.js:1135` | `systems/runSession.js:50` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:678`, `ui/screens/crucibleDraft.js:683`, `ui/screens/crucibleDraft.js:1037` | `systems/survivalDraft.js:95` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:767` | `systems/survivalDraft.js:99` |
| `run:draftResolved` | — | `systems/survivalRun.js:117` |
| `run:endRequested` | `save/saveSystem.js:199` | `systems/runSession.js:52` |
| `run:ended` | — | `systems/survivalAnnounce.js:298`, `systems/survivalArena.js:836`, `systems/survivalDraft.js:104`, `systems/survivalResults.js:484`, `systems/survivalRun.js:111`, `systems/survivalWave.js:94`, `systems/swarmArena.js:429`, `systems/swarmChain.js:108`, `systems/swarmSupply.js:109` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:120` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:296`, `ui/survivalHud.js:197` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1157` | `systems/ships.js:1535`, `systems/survivalRun.js:112`, `systems/swarmSupply.js:102`, `systems/world.js:517` |
| `run:modifierChosen` | — | `systems/survivalRun.js:118` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:55` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1158` | `systems/survivalRun.js:113` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1132`, `ui/screens/crucibleDraft.js:1149` | `systems/survivalDraft.js:96` |
| `run:refitClosed` | — | `systems/survivalRun.js:119` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:1470` | `systems/survivalDraft.js:97` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:1466` | `systems/survivalDraft.js:98` |
| `run:resultsReady` | — | `systems/achievements.js:785`, `ui/uiRoot.js:1219` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:103` |
| `run:spendRequested` | — | `systems/runSession.js:54` |
| `run:spent` | — | `systems/survivalDraft.js:102` |
| `run:started` | — | `sim/killcamTape.js:425`, `systems/survivalAnnounce.js:291`, `systems/survivalResults.js:444`, `systems/survivalRun.js:109`, `ui/survivalHud.js:198`, `ui/uiRoot.js:1240` |
| `run:threatRequested` | — | `systems/runSession.js:56` |
| `run:transitionRequested` | `systems/survivalRun.js:494` | `systems/runSession.js:51` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:297`, `systems/survivalDraft.js:94`, `systems/survivalResults.js:483`, `systems/survivalRun.js:110`, `systems/survivalWave.js:93`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:295`, `systems/survivalArena.js:835`, `systems/survivalResults.js:447` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:115` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:294` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:456` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:292`, `systems/survivalArena.js:802`, `systems/survivalWave.js:91`, `systems/swarmArena.js:426`, `ui/survivalHud.js:209` |
| `run:waveProgress` | — | `ui/survivalHud.js:210` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:293`, `systems/survivalResults.js:446`, `systems/survivalWave.js:92`, `systems/swarmArena.js:427` |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:567` | `systems/encounterDirector.js:268`, `systems/story.js:199` |
| `salvage:completed` | `systems/mining.js:1312` | `render/vfx.js:2271`, `systems/aftermathWrecks.js:894`, `systems/missions.js:1123` |
| `salvage:cutComplete` | `systems/mining.js:413` | `audio/audioSystem.js:1745`, `render/vfx.js:2270` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | — |
| `salvage:npcExtraction` | `systems/traffic.js:6007` | — |
| `salvage:npcUnload` | `systems/traffic.js:9750` | `systems/economy.js:879` |
| `salvage:placed` | `systems/salvage.js:332` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:405` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:1162` | — |
| `save:completed` | `save/saveSystem.js:1168` | `ui/screens/saveLoad.js:830`, `ui/uiRoot.js:355` |
| `save:dirty` | — | `save/saveSystem.js:212` |
| `save:error` | `main.js:157`, `save/saveSystem.js:777`, `save/saveSystem.js:878`, `save/saveSystem.js:896`, `save/saveSystem.js:1172`, `save/saveSystem.js:1451`, `save/saveSystem.js:1913`, `save/saveSystem.js:2666`, `save/saveSystem.js:2674`, `save/saveSystem.js:2709`, `save/saveSystem.js:2719`, `save/saveSystem.js:2735`, `save/saveSystem.js:2802`, `save/saveSystem.js:2835`, `save/saveSystem.js:2872`, `save/saveSystem.js:2911`, `save/saveSystem.js:3163`, `save/saveSystem.js:3171`, `save/saveSystem.js:3198`, `save/saveSystem.js:3640`, `save/saveSystem.js:3653`, `save/saveSystem.js:3668`, `save/saveSystem.js:3681`, `ui/screens/saveLoad.js:1265` | `systems/aftermathWrecks.js:906`, `systems/asteroidSites.js:227`, `systems/automation.js:554`, `systems/encounterDirector.js:244`, `ui/loadingPresenter.js:331`, `ui/screenManager.js:582`, `ui/uiRoot.js:381` |
| `save:exportRecovery` | `save/saveSystem.js:3629` | — |
| `save:loaded` | `save/saveSystem.js:3143` | `audio/audioSystem.js:1985`, `audio/bombAudio.js:330`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:180`, `core/physics.js:129`, `main.js:213`, `render/feel.js:1092`, `render/shipMicroMotion.js:1177`, `render/vfx.js:2260`, `save/saveSystem.js:248`, `save/saveSystem.js:264`, `systems/aftermathWrecks.js:905`, `systems/asteroidFormations.js:122`, `systems/asteroidSites.js:218`, `systems/autoTargetAssist.js:111`, `systems/automation.js:549`, `systems/barkDirector.js:240`, `systems/beacons.js:45`, `systems/bombs.js:217`, `systems/collisionConsequences.js:60`, `systems/combat.js:519`, `systems/economy.js:912`, `systems/encounterDirector.js:243`, `systems/environmentalMachinery.js:143`, `systems/factionPresence.js:409`, `systems/fields.js:356`, `systems/flight.js:75`, `systems/flightV3.js:148`, `systems/gateControlDirector.js:71`, `systems/heat.js:254`, `systems/heistFacilities.js:252`, `systems/impulseCharges.js:231`, `systems/lawSecurity.js:208`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:131`, `systems/mines.js:38`, `systems/missions.js:1067`, `systems/npcJobsRuntime.js:845`, `systems/npcJobsRuntime.js:853`, `systems/onboarding.js:336`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:203`, `systems/presentationOrchestrator.js:276`, `systems/routeFollower.js:336`, `systems/runSession.js:61`, `systems/sectorSim.js:98`, `systems/ships.js:1440`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:96`, `systems/story.js:135`, `systems/survivalArena.js:850`, `systems/survivorPod.js:411`, `systems/tetherGameplay.js:205`, `systems/titles.js:399`, `systems/traffic.js:1321`, `systems/travelLanes.js:483`, `systems/uniqueLootAbilities.js:136`, `systems/world.js:502`, `ui/alerts.js:352`, `ui/automationPayoff.js:76`, `ui/bandHud.js:90`, `ui/capitalBossOverlayMount.js:86`, `ui/hudLayout.js:120`, `ui/moralTrapPrompt.js:43`, `ui/priceHistory.js:147`, `ui/uiRoot.js:362`, `ui/uiRoot.js:1244` |
| `save:recovered` | `save/saveSystem.js:2698` | `ui/uiRoot.js:374` |
| `save:restoring` | `save/saveSystem.js:2933` | `core/coreSystem.js:177`, `render/feel.js:1091`, `render/vfx.js:2259`, `systems/aftermathWrecks.js:904`, `systems/asteroidSites.js:210`, `systems/autoTargetAssist.js:108`, `systems/automation.js:543`, `systems/encounterDirector.js:236`, `systems/environmentalMachinery.js:142`, `systems/lawSecurity.js:207`, `systems/missions.js:1071`, `systems/npcJobsRuntime.js:846`, `systems/runSession.js:60`, `systems/salvage.js:78`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:74`, `systems/traffic.js:1314`, `systems/world.js:498` |
| `save:started` | `save/saveSystem.js:881`, `save/saveSystem.js:1505` | `ui/screenManager.js:589`, `ui/uiRoot.js:351` |
| `scan:completed` | `balance/careerCohorts.js:478`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:934`, `systems/world.js:4686` | `careers/origins/prospectorOrigin.js:633`, `systems/missions.js:1134`, `systems/onboarding.js:369`, `systems/presentationOrchestrator.js:188`, `systems/salvage.js:75`, `systems/salvageActions.js:70`, `systems/story.js:190`, `ui/hud.js:4240` |
| `scan:pulse` | `systems/scanner.js:872` | `render/shipMicroMotion.js:1202`, `systems/buildIdentity.js:277`, `systems/encounterDirector.js:258`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:187`, `systems/scanReveal.js:15`, `ui/hud.js:4241` |
| `scan:shipRevealed` | `systems/scanReveal.js:38` | `systems/buildIdentity.js:276` |
| `scan:weakPoint` | `systems/scanner.js:923` | `ui/hud.js:1504` |
| `scanner:ghostEscaped` | `systems/scanner.js:852` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:902` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:94` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:273` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:516`, `ui/comms.js:520` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:785` | `systems/presentationOrchestrator.js:185` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:798` | `audio/audioSystem.js:1812`, `audio/bombAudio.js:327`, `render/shipMicroMotion.js:1176`, `render/vfx.js:2255`, `save/saveSystem.js:269`, `systems/aftermathWrecks.js:892`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:203`, `systems/automation.js:579`, `systems/bombs.js:209`, `systems/claims.js:274`, `systems/claims.js:276`, `systems/economy.js:897`, `systems/encounterDirector.js:232`, `systems/factionPresence.js:400`, `systems/fields.js:354`, `systems/heistFacilities.js:245`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:128`, `systems/mines.js:36`, `systems/mining.js:186`, `systems/missions.js:1215`, `systems/moralTrap.js:104`, `systems/npcJobsRuntime.js:834`, `systems/presentationOrchestrator.js:226`, `systems/routeFollower.js:328`, `systems/salvage.js:71`, `systems/sectorSim.js:95`, `systems/story.js:152`, `systems/story.js:189`, `systems/survivalArena.js:848`, `systems/survivorPod.js:406`, `systems/tetherGameplay.js:209`, `systems/traffic.js:1284`, `systems/wingmen.js:48`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:150`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:728` | `audio/bombAudio.js:326`, `render/vfx.js:2256`, `systems/aftermathWrecks.js:893`, `systems/asteroidSites.js:209`, `systems/automation.js:568`, `systems/bombs.js:208`, `systems/encounterDirector.js:234`, `systems/environmentalMachinery.js:140`, `systems/factionPresence.js:401`, `systems/fields.js:353`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:246`, `systems/impulseCharges.js:232`, `systems/lawSecurity.js:206`, `systems/massSeed.js:118`, `systems/masslineSnares.js:127`, `systems/mines.js:35`, `systems/missions.js:1216`, `systems/npcJobsRuntime.js:833`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:50`, `systems/stationServices.js:207`, `systems/stationSideEventDirector.js:95`, `systems/surrenderRecovery.js:72`, `systems/survivalArena.js:849`, `systems/tetherGameplay.js:208`, `systems/traffic.js:1287`, `systems/wingmen.js:51`, `ui/customsPrompt.js:140`, `ui/impoundPayPrompt.js:34`, `ui/promptDeck.js:707` |
| `sectorsim:embodiment` | `systems/sectorSim.js:801` | `systems/world.js:530` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:318` | `ui/screens/starmap.js:823` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1549`, `systems/claims.js:1289`, `systems/encounterDirector.js:1718`, `systems/mining.js:1837` | `systems/sectorSim.js:103` |
| `sectorsim:intel` | `systems/sectorSim.js:855` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:639` | `systems/economy.js:916` |
| `sectorsim:reconcile` | `systems/sectorSim.js:596` | — |
| `sectorsim:tick` | `systems/sectorSim.js:263` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:559` | `ui/screens/starmap.js:824` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:543` | — |
| `service:aborted` | `systems/stationServices.js:256` | — |
| `service:completed` | `systems/economy.js:2222`, `systems/economy.js:2254`, `systems/economy.js:2300`, `systems/stationServices.js:475`, `systems/stationServices.js:491` | `systems/ships.js:1507` |
| `service:progress` | `systems/stationServices.js:417` | — |
| `service:queued` | `systems/stationServices.js:324` | — |
| `service:started` | `systems/stationServices.js:406` | — |
| `settings:changed` | `save/saveSystem.js:3179`, `save/saveSystem.js:3180`, `systems/touch.js:509`, `ui/screens/motionAsk.js:95`, `ui/screens/pause.js:591`, `ui/screens/pause.js:599`, `ui/screens/pause.js:677`, `ui/screens/settings.js:368`, `ui/screens/settings.js:731`, `ui/screens/settings.js:807` | `audio/audioSystem.js:1925`, `main.js:212`, `render/vfx.js:2262`, `save/saveSystem.js:206`, `ui/uiRoot.js:656` |
| `ship:appearanceChanged` | `systems/ships.js:1784`, `systems/ships.js:2019`, `systems/traffic.js:2703` | `core/coreSystem.js:176`, `render/vfx.js:2250` |
| `ship:appearanceSaved` | `systems/ships.js:2021` | — |
| `ship:boostPreKick` | `systems/flightV3.js:396` | `render/feel.js:1203` |
| `ship:boostStart` | `systems/flight.js:106`, `systems/flightV3.js:199` | `audio/audioSystem.js:1819`, `render/vfx.js:2278`, `systems/cruise.js:58`, `systems/onboarding.js:401` |
| `ship:boostStop` | `systems/flight.js:107`, `systems/flight.js:220`, `systems/flightV3.js:200`, `systems/flightV3.js:488` | `audio/audioSystem.js:1824`, `render/vfx.js:2279` |
| `ship:cargoCapChanged` | `systems/ships.js:1779` | — |
| `ship:dash` | `systems/flight.js:197`, `systems/flightV3.js:467` | `audio/audioSystem.js:1825`, `render/vfx.js:2280`, `systems/uniqueLootAbilities.js:134` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2023` | `render/vfx.js:2299` |
| `ship:deathPop` | `render/shipMicroMotion.js:928`, `render/shipMicroMotion.js:2013` | `render/vfx.js:2298` |
| `ship:livingHullChanged` | `systems/ships.js:1608`, `systems/ships.js:1660`, `systems/story.js:1642` | `systems/barkDirector.js:243` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2250` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2223` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2182` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2161` | — |
| `ship:massChanged` | `systems/ships.js:1916` | `ui/hud.js:3788` |
| `ship:purchased` | `systems/ships.js:1952` | `audio/audioSystem.js:1804`, `systems/missions.js:1219` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:977`, `render/shipMicroMotion.js:2000` | `render/vfx.js:2297` |
| `ship:roleContext` | `systems/ships.js:1718` | `systems/presentationAdapters.js:198` |
| `ship:sold` | `systems/ships.js:1973` | — |
| `ship:statsChanged` | `systems/ships.js:1778` | `systems/world.js:488`, `ui/commandBar.js:410`, `ui/hud.js:3784` |
| `ship:swingDash` | `systems/flightV3.js:468` | `render/shipMicroMotion.js:1196` |
| `ship:thrust` | `systems/flight.js:423`, `systems/flightV3.js:1462` | `render/vfx.js:2277` |
| `signal:investigate` | — | `systems/scanner.js:800` |
| `signal:investigated` | `systems/scanner.js:1406` | `systems/missions.js:1148`, `systems/presentationOrchestrator.js:191`, `systems/story.js:137`, `systems/world.js:491`, `ui/signalInvestigationPrompt.js:153` |
| `signal:investigating` | `systems/scanner.js:1149` | `ui/signalInvestigationPrompt.js:152` |
| `signal:receipt` | `systems/scanner.js:1407` | — |
| `signal:scanResults` | `systems/scanner.js:935` | `systems/missions.js:1135`, `systems/presentationOrchestrator.js:189`, `ui/signalInvestigationPrompt.js:150` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:801` |
| `signal:track` | — | `systems/scanner.js:799` |
| `signal:tracked` | `systems/scanner.js:1166` | `systems/presentationOrchestrator.js:190`, `ui/signalInvestigationPrompt.js:151` |
| `sim:pause` | `ui/screenManager.js:406` | `audio/audioSystem.js:1941`, `audio/bombAudio.js:333`, `render/feel.js:1089` |
| `sim:resume` | `ui/screenManager.js:413` | `audio/audioSystem.js:1942` |
| `site:anchored` | `systems/asteroidSites.js:917` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1849` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1764` | `audio/audioSystem.js:1963` |
| `site:courierLost` | `systems/asteroidSites.js:1837` | — |
| `site:created` | `systems/asteroidSites.js:855` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1212`, `systems/asteroidSites.js:1296` | — |
| `site:lost` | `systems/asteroidSites.js:1409` | `ui/alerts.js:342` |
| `site:machineInstalled` | `systems/asteroidSites.js:886` | `audio/audioSystem.js:1962`, `ui/alerts.js:341` |
| `site:machineMode` | `systems/asteroidSites.js:1318` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1229` | — |
| `site:machineStatus` | `systems/asteroidSites.js:1705` | `audio/audioSystem.js:1967`, `ui/alerts.js:337` |
| `site:overlayChanged` | `systems/asteroidSites.js:1302` | — |
| `site:podBuilt` | `systems/asteroidSites.js:1653` | — |
| `site:producing` | `systems/asteroidSites.js:1096` | `ui/asteroid/asteroidScreen.js:1670` |
| `site:rematerialized` | `systems/asteroidSites.js:1455` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1014` | `ui/asteroid/asteroidScreen.js:1655` |
| `site:surveyComplete` | `systems/asteroidSites.js:957` | `ui/asteroid/asteroidScreen.js:1649` |
| `site:surveyDetected` | `systems/asteroidSites.js:947` | `ui/asteroid/asteroidScreen.js:1642` |
| `spawn:request` | `systems/automation.js:1492` | `systems/world.js:516` |
| `station:berthAssigned` | `systems/stationServices.js:386` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:226` | — |
| `station:exitRequest` | `ui/screenManager.js:546`, `ui/uiRoot.js:1119` | `ui/station/stationApp.js:1261` |
| `station:holding` | `systems/stationServices.js:390` | — |
| `station:moduleGained` | `systems/claims.js:1755` | `systems/factions.js:290` |
| `station:navigate` | `ui/screens/automationPanel.js:1038`, `ui/station/screens/bar.js:676`, `ui/station/screens/bar.js:681`, `ui/station/screens/industry.js:337` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:255` | `render/vfx.js:2276` |
| `station:throughput` | `systems/claims.js:1725` | — |
| `station:yardChanged` | `systems/stationServices.js:544` | — |
| `stationContact:changed` | `systems/stationContacts.js:297`, `systems/stationContacts.js:333`, `systems/stationContacts.js:415`, `systems/stationContacts.js:439` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:240`, `systems/stationContacts.js:456` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:321` | — |
| `story:beatAdvanced` | `systems/missions.js:7447` | `save/saveSystem.js:276`, `systems/story.js:130`, `ui/screens/codex.js:568` |
| `story:elroyResolved` | `systems/missions.js:4509` | `systems/story.js:131` |
| `story:kurtzLedger` | `systems/story.js:1455`, `systems/story.js:1466` | — |
| `story:newGamePlusStarted` | `systems/story.js:1563` | `systems/titles.js:403`, `ui/hudMeta.js:104` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1544` | — |
| `story:postEndingContinuity` | `systems/story.js:1355` | — |
| `story:postEndingProgress` | `systems/story.js:1325` | `ui/screens/missionLog.js:2199` |
| `story:replayHookUnlocked` | `systems/story.js:1340` | `ui/screens/missionLog.js:2200` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:247` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:246` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1153` | — |
| `story:vergeObserversRevealed` | `systems/story.js:1009` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1173` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:194` | — |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:179` | — |
| `stunt:salvageRights` | `systems/stuntGrammar.js:104` | — |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:126` | — |
| `stunt:styleBanked` | `systems/stuntGrammar.js:91` | `ui/stuntCallout.js:424` |
| `stunt:trickAmended` | — | `systems/bulletTime.js:131`, `systems/survivalResults.js:450`, `systems/titles.js:402`, `ui/stuntCallout.js:423` |
| `stunt:trickDetected` | — | `systems/bulletTime.js:130`, `systems/survivalResults.js:449`, `systems/titles.js:401`, `ui/stuntCallout.js:422`, `ui/toasts.js:350` |
| `surrender:secured` | — | `systems/traffic.js:1303` |
| `surrender:tethered` | — | `systems/traffic.js:1302` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:992` | — |
| `survivorPod:choose` | — | `systems/survivorPod.js:408` |
| `survivorPod:delivered` | `systems/traffic.js:5343` | — |
| `survivorPod:ejected` | `systems/survivorPod.js:556`, `systems/survivorPod.js:656` | `systems/lawSecurity.js:205` |
| `survivorPod:promoted` | `systems/survivorPod.js:888` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:982` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:994` | — |
| `survivorPod:rescued` | — | `systems/traffic.js:1308` |
| `survivorPod:resolved` | `systems/survivorPod.js:822` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1033` | — |
| `swarm:chain` | — | `systems/survivalResults.js:459`, `ui/survivalHud.js:211` |
| `swarm:chainBest` | — | `systems/survivalResults.js:472` |
| `swarm:chainBroken` | — | `ui/survivalHud.js:212` |
| `tech:researched` | `systems/ships.js:1821` | `audio/audioSystem.js:1803`, `systems/onboarding.js:492`, `systems/ships.js:1437` |
| `tether:attached` | `combat/attachments.js:369` | `audio/audioSystem.js:1863`, `render/vfx.js:2221`, `systems/encounterDirector.js:263`, `systems/presentationOrchestrator.js:95`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:325`, `systems/tetherGameplay.js:1124` | `audio/audioSystem.js:1881`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1204`, `systems/onboarding.js:367`, `systems/onboarding.js:383`, `systems/surrenderRecovery.js:69` |
| `tether:broken` | `combat/attachments.js:487` | `audio/audioSystem.js:1854`, `render/feel.js:1241`, `render/vfx.js:2224`, `systems/presentationOrchestrator.js:103`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:210` |
| `tether:cut` | `systems/tetherGameplay.js:1711` | `audio/audioSystem.js:1885`, `systems/masslineThrow.js:121`, `systems/onboarding.js:382`, `systems/onboarding.js:410` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1704` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:549`, `systems/tetherGameplay.js:255`, `systems/tetherGameplay.js:415`, `systems/tetherGameplay.js:458`, `systems/tetherGameplay.js:463`, `systems/tetherGameplay.js:473`, `systems/tetherGameplay.js:490`, `systems/tetherGameplay.js:837` | `systems/onboarding.js:528`, `testing/lab/proofSixtySeconds.js:953`, `ui/masslineHud.js:691` |
| `tether:latched` | `systems/tetherGameplay.js:510` | `audio/audioSystem.js:1877`, `careers/origins/prospectorOrigin.js:642`, `systems/flightV3.js:156`, `systems/lawSecurity.js:213`, `systems/missions.js:1159`, `systems/missions.js:1185`, `systems/onboarding.js:362`, `systems/onboarding.js:379`, `systems/onboarding.js:399`, `systems/onboarding.js:408`, `systems/onboarding.js:540`, `systems/onboarding.js:543`, `systems/surrenderRecovery.js:66`, `systems/survivorPod.js:414`, `testing/lab/proofSixtySeconds.js:954`, `ui/masslineHud.js:705`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1403` | — |
| `tether:nearBreak` | `combat/attachments.js:829` | `audio/audioSystem.js:1875`, `systems/onboarding.js:368`, `systems/presentationOrchestrator.js:96` |
| `tether:rebound` | `combat/attachments.js:765` | — |
| `tether:reel` | `combat/attachments.js:421` | `audio/audioSystem.js:1852`, `systems/missions.js:1155`, `systems/onboarding.js:365`, `systems/onboarding.js:380`, `systems/surrenderRecovery.js:67` |
| `tether:reelPump` | `systems/masslineTelemetry.js:251` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:326`, `systems/tetherGameplay.js:1122`, `systems/tetherGameplay.js:1125`, `systems/tetherGameplay.js:1713` | `audio/audioSystem.js:1853`, `render/feel.js:1294`, `render/vfx.js:2223`, `systems/missions.js:1160`, `systems/presentationOrchestrator.js:160` |
| `tether:released` | `systems/tetherGameplay.js:1119`, `systems/tetherGameplay.js:1712` | `render/shipMicroMotion.js:1203`, `render/vfx.js:2222`, `systems/barkDirector.js:256`, `systems/onboarding.js:366`, `systems/onboarding.js:381`, `systems/onboarding.js:409`, `systems/surrenderRecovery.js:68` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:329` | — |
| `tether:strain` | `systems/tetherGameplay.js:1457` | `audio/audioSystem.js:1868` |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1319`, `systems/collisionConsequences.js:57`, `systems/combat.js:506`, `systems/masslineImpactDamage.js:41`, `systems/missions.js:1161`, `systems/onboarding.js:384`, `systems/onboarding.js:411`, `systems/presentationOrchestrator.js:136`, `systems/tumbleStates.js:71` |
| `tether:whipSnap` | `systems/tetherGameplay.js:1746` | — |
| `title:holdResolved` | — | `systems/titles.js:395` |
| `touch:uiAction` | `systems/touch.js:457` | `ui/input.js:743` |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:1740` |
| `traffic:oreCollected` | `systems/traffic.js:5140` | — |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:3164` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:9898` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:8510` | — |
| `traffic:spillNoticed` | `systems/traffic.js:5705` | — |
| `tutorial:finished` | `systems/onboarding.js:1085` | `systems/achievements.js:789`, `systems/missions.js:1066`, `systems/presentationAdapters.js:201`, `systems/story.js:139` |
| `tutorial:say` | `systems/onboarding.js:776` | `audio/audioSystem.js:1902`, `systems/story.js:145` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2080` | `systems/missions.js:1075` |
| `ui:acceptMission` | `ui/adventureDecisions.js:396`, `ui/station/screens/bar.js:613`, `ui/station/screens/contracts.js:1024` | `systems/missions.js:1074` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:3572` | `systems/ships.js:1474` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:842` |
| `ui:buyModule` | `ui/station/screens/shipworks.js:3953` | `systems/onboarding.js:487`, `systems/ships.js:1467` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:3885` | `systems/bombs.js:219` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:3685` | `systems/ships.js:1465` |
| `ui:cancel` | `ui/input.js:990`, `ui/input.js:1004` | — |
| `ui:clearTarget` | `ui/input.js:385` | `ui/uiRoot.js:985` |
| `ui:closeAll` | `main.js:827`, `ui/screens/crucible.js:2511`, `ui/screens/crucible.js:2524` | `ui/uiRoot.js:983` |
| `ui:closeCargo` | `ui/input.js:234`, `ui/input.js:347` | `ui/hud.js:3758` |
| `ui:closeComms` | `ui/input.js:342` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:977` |
| `ui:confirm` | `ui/input.js:998` | `audio/audioSystem.js:1979` |
| `ui:cycleComponent` | `ui/targetPanel.js:435`, `ui/targetPanel.js:439` | `ui/uiRoot.js:989` |
| `ui:cycleTarget` | `ui/input.js:381`, `ui/input.js:1068` | `ui/uiRoot.js:984` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:3603` | `systems/ships.js:1475` |
| `ui:endgameChoose` | `systems/missions.js:2766`, `ui/station/barContacts.js:747` | `systems/story.js:158` |
| `ui:endgameConfirm` | — | `systems/story.js:159` |
| `ui:endgameDecline` | `ui/comms.js:447` | `systems/story.js:160` |
| `ui:endgameDepartAshfall` | `ui/comms.js:464` | `systems/story.js:169` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1930` | `systems/story.js:166` |
| `ui:endgameStayAshfall` | `ui/comms.js:465` | `systems/story.js:170` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:1934` | `systems/story.js:167` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:168` |
| `ui:endingArchiveOpen` | — | `systems/story.js:162` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | — |
| `ui:factionPresenceService` | — | `systems/factionPresence.js:407` |
| `ui:fitModule` | `ui/station/screens/shipworks.js:3961` | `systems/onboarding.js:484`, `systems/ships.js:1468` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:3895` | `systems/bombs.js:220` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1085` | `systems/automation.js:535`, `systems/wingmen.js:59` |
| `ui:globalFind` | `ui/input.js:272`, `ui/input.js:334` | `ui/globalFind.js:162` |
| `ui:heliosBay7Scan` | — | `systems/story.js:193` |
| `ui:kurtzInteract` | — | `systems/story.js:192` |
| `ui:navigate` | `ui/input.js:978`, `ui/input.js:982`, `ui/input.js:1046` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2497`, `ui/screens/achievements.js:146`, `ui/screens/automationPanel.js:517`, `ui/screens/credits.js:137`, `ui/screens/crucible.js:1422`, `ui/screens/crucibleDraft.js:1131`, `ui/screens/demoEnd.js:194`, `ui/screens/starmap.js:639`, `ui/screens/techTree.js:227` | `ui/uiRoot.js:973` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:597` | `systems/world.js:519` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:667` | `systems/world.js:518` |
| `ui:pushScreen` | `main.js:374`, `systems/onboarding.js:618`, `systems/story.js:1133`, `ui/mapAuthority.js:133`, `ui/screens/crucible.js:2525`, `ui/screens/crucibleDraft.js:687`, `ui/screens/gameOver.js:328`, `ui/screens/starmap.js:647`, `ui/signalInvestigationPrompt.js:146`, `ui/station/barContacts.js:474`, `ui/station/screens/bar.js:630`, `ui/station/stationApp.js:505` | `ui/uiRoot.js:950` |
| `ui:replaceScreen` | `ui/screens/crucible.js:2479`, `ui/screens/crucible.js:2502`, `ui/screens/demoEnd.js:223`, `ui/screens/motionAsk.js:105` | `ui/uiRoot.js:982` |
| `ui:restockBombRack` | `ui/station/screens/shipworks.js:3665` | `systems/bombs.js:223` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:3544` | `systems/ships.js:1473` |
| `ui:screenTop` | `ui/screenManager.js:258` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:843` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:3905` | `systems/bombs.js:222` |
| `ui:service` | `balance/careerCohorts.js:700`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/adventureDecisions.js:427`, `ui/station/stationApp.js:881`, `ui/station/stationApp.js:917` | `systems/economy.js:900` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:3690`, `ui/station/screens/shipworks.js:3785` | `systems/ships.js:1466` |
| `ui:setCourse` | `systems/factionPresence.js:1035`, `systems/missions.js:3271`, `systems/scanner.js:1165`, `ui/galaxyMap.js:2156`, `ui/galaxyMap.js:2168`, `ui/galaxyMap.js:6866`, `ui/market/tradeLogic.js:485`, `ui/screens/footprint.js:1239`, `ui/screens/footprint.js:1250`, `ui/screens/localmap.js:993`, `ui/screens/starmap.js:1523`, `ui/screens/starmap.js:1536`, `ui/screens/starmap.js:1540` | `systems/world.js:484` |
| `ui:setShipAppearance` | — | `systems/ships.js:1477` |
| `ui:talkContact` | — | `systems/story.js:194` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:46`, `combat/autoTargetMode.js:210` | `ui/uiRoot.js:990` |
| `ui:toggleCargo` | `ui/input.js:448` | `ui/hud.js:3757` |
| `ui:toggleComms` | `ui/input.js:465` | — |
| `ui:toggleOverview` | `ui/input.js:452` | `ui/hud.js:4250` |
| `ui:trackMission` | `ui/galaxyMap.js:3909`, `ui/screens/missionLog.js:1926`, `ui/screens/missionLog.js:1998`, `ui/screens/missionLog.js:2059`, `ui/station/screens/contracts.js:1056` | `systems/missions.js:1079` |
| `ui:undock` | — | `ui/input.js:742` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:3971` | `systems/ships.js:1469` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:3915` | `systems/bombs.js:221` |
| `ui:unlockTech` | `ui/screens/techTree.js:572` | `systems/ships.js:1476` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:3674` | `systems/bombs.js:224` |
| `ui:wingOrder` | `ui/wingmanRadial.js:182` | `systems/automation.js:536` |
| `ui:wingmanRadial` | `ui/input.js:458` | `ui/wingmanRadial.js:244` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:337` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:287` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:222` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1272` | `systems/missions.js:1208`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:choose` | `systems/missions.js:4255`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:688` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:706`, `systems/uniqueWrecks.js:864`, `systems/uniqueWrecks.js:1067` | `systems/missions.js:1209` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1332` | `systems/missions.js:1211`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:926` | `systems/missions.js:1210` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:956` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:453`, `systems/uniqueWrecks.js:866` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1508` | `systems/missions.js:1212`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `ui/station/screens/bar.js:647` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:561` | `systems/missions.js:1207` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1509` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1251` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1439` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1145`, `ui/bandHud.js:87` |
| `verb:used` | `systems/onboarding.js:2591` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:5205` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:494` |
| `vestaOreCache:clueRecovered` | `systems/world.js:5026` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:5057` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:5168` | — |
| `vestaOreCache:resolved` | `systems/world.js:5125` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:369`, `ui/voiceArbiter.js:413` | `ui/alerts.js:322` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:324` |
| `voice:say` | `systems/achievements.js:652`, `systems/survivalAnnounce.js:348`, `ui/alerts.js:221` | `ui/voiceArbiter.js:323` |
| `voice:surface` | `ui/voiceArbiter.js:374`, `ui/voiceArbiter.js:423` | `systems/barkDirector.js:244`, `ui/alerts.js:321` |
| `watch:changed` | `ui/entityLinks.js:237` | `ui/watchlistHud.js:69` |
| `weapons:inertialShunt` | `systems/weapons.js:272` | — |
| `weapons:mineArmed` | `systems/weapons.js:1322` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1279` | — |
| `weapons:mineDetonated` | `systems/weapons.js:1452` | — |
| `weapons:mineExpired` | `systems/weapons.js:1316` | `systems/presentationOrchestrator.js:265` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:252` | — |
| `weapons:momentumSinkReleased` | `systems/weapons.js:979` | — |
| `weapons:vent` | `systems/weapons.js:493`, `systems/weapons.js:513` | `audio/audioSystem.js:1782`, `render/shipMicroMotion.js:1180`, `render/vfx.js:2275`, `systems/ships.js:1521`, `ui/hud.js:3831` |
| `web:linked` | `combat/tetherWebs.js:95` | — |
| `well:capture` | `systems/fields.js:1725` | — |
| `well:fling` | `systems/fields.js:1652` | — |
| `well:grind` | `systems/fields.js:1412` | `systems/impulseCharges.js:225` |
| `wingMorale:broken` | `systems/wingMorale.js:257` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:342` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:369` | — |
| `wingOrder:accepted` | `systems/automation.js:1978` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1979` | — |
| `wingOrder:converted` | `systems/wingmen.js:310` | — |
| `wingOrder:status` | `systems/automation.js:1980` | — |
| `world:abortJumpCharge` | `systems/story.js:782`, `ui/comms.js:456` | `systems/world.js:481` |
| `world:confirmUnfiledJump` | `systems/story.js:168` | `systems/world.js:480` |
| `world:criticalSpawnDeferred` | `systems/world.js:1493`, `systems/world.js:3126` | — |
| `world:farActorRestored` | `world/farActorTable.js:640` | `systems/npcJobsRuntime.js:836`, `systems/traffic.js:1291` |
| `world:farActorShelved` | `world/farActorTable.js:618` | `systems/npcJobsRuntime.js:835`, `systems/traffic.js:1290` |
| `world:membership` | `systems/world.js:791` | `systems/presentationOrchestrator.js:179` |
| `world:originShift` | `systems/world.js:4128` | — |
| `world:playerRelocated` | `systems/world.js:3272` | `core/coreSystem.js:188`, `render/vfx.js:2261` |
| `world:requestJump` | `systems/story.js:766`, `ui/galaxyMap.js:2154`, `ui/screens/starmap.js:1535` | `systems/world.js:478` |
| `world:requestRoute` | `ui/galaxyMap.js:2166`, `ui/galaxyMap.js:3926`, `ui/galaxyMap.js:6864`, `ui/screens/starmap.js:1522`, `ui/screens/starmap.js:1539` | `systems/world.js:482` |
| `world:requestSectorScan` | `ui/galaxyMap.js:5640` | `systems/world.js:483` |
| `world:requestUnfiledJump` | `systems/story.js:734` | `systems/world.js:479` |
| `world:residency` | `systems/world.js:935`, `systems/world.js:968`, `systems/world.js:1696` | — |
| `world:spawnLimited` | `systems/world.js:3062` | — |
| `world:zoneEntered` | `systems/world.js:4155` | `data/hazardLanguage.js:131` |
| `world:zoneExited` | `systems/world.js:4158` | `data/hazardLanguage.js:132` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:543` | `systems/presentationOrchestrator.js:279` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:497` | `systems/presentationOrchestrator.js:280`, `systems/traffic.js:1369` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2225` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1087` | — |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1130` | — |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:1972` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2153` | `systems/npcJobsRuntime.js:866` |
| `wreckField:source` | `systems/factionPresence.js:604`, `systems/salvage.js:351`, `systems/uniqueWrecks.js:1167` | `systems/aftermathWrecks.js:891` |

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
- `combat:subsystemDisabled` — 6 subscriber(s)
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
- `law:reportIncidentReceipt` — 2 subscriber(s)
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
- `pirateParley:resolved` — 1 subscriber(s)
- `postEndingReplay:cycleCompleted` — 1 subscriber(s)
- `presentation:cue` — 4 subscriber(s)
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
- `signal:investigate` — 1 subscriber(s)
- `signal:track` — 1 subscriber(s)
- `story:stuntIncidentRecorded` — 1 subscriber(s)
- `story:stuntIncidentUpdated` — 1 subscriber(s)
- `stunt:trickAmended` — 4 subscriber(s)
- `stunt:trickDetected` — 5 subscriber(s)
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
- `ui:factionPresenceService` — 1 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:kurtzInteract` — 1 subscriber(s)
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
- `ai:encounterCommand` — 1 emitter(s)
- `ai:stateChange` — 1 emitter(s)
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
- `bounty:cleared` — 1 emitter(s)
- `buildIdentity:revealed` — 1 emitter(s)
- `camera:kill` — 2 emitter(s)
- `camera:shake` — 13 emitter(s)
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
- `cargo:volatileSlam` — 1 emitter(s)
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
- `difficulty:pinReleased` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `distress:call` — 1 emitter(s)
- `dock:denied` — 1 emitter(s)
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
- `news:publish` — 11 emitter(s)
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
- `presentation:audioCue` — 1 emitter(s)
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
- `uniqueWreck:scanBlocked` — 1 emitter(s)
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
