# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-09-24 · 923 events · 3041 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:280`, `systems/encounterDirector.js:259`, `ui/discoveryPlate.js:140` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:712` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:1556` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:1786` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:744` | `systems/salvage.js:72` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1262` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:1608` | `systems/lawSecurity.js:201`, `systems/salvage.js:73` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:159` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:424` | `systems/presentationOrchestrator.js:160`, `systems/tetherGameplay.js:212` |
| `ai:encounterCommand` | `systems/aiPorts.js:235` | — |
| `ai:flee` | `systems/ai.js:259`, `systems/traffic.js:4679`, `systems/wingMorale.js:299` | `render/vfx.js:2226`, `systems/barkDirector.js:239`, `systems/combatOutcome.js:119`, `systems/encounterDirector.js:271`, `systems/presentationOrchestrator.js:161` |
| `ai:formationBroken` | `systems/ai.js:433`, `systems/wingMorale.js:249` | `render/vfx.js:2227` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:241` |
| `ai:stateChange` | `systems/ai.js:256` | — |
| `ai:telegraph` | `systems/ai.js:329`, `systems/encounterScripts.js:178`, `systems/encounterScripts.js:966`, `systems/masslineSnares.js:331`, `systems/mines.js:100`, `systems/tacticalAI.js:412` | `audio/audioSystem.js:1740`, `render/vfx.js:2225`, `systems/presentationOrchestrator.js:158`, `systems/survivalResults.js:380`, `ui/hud.js:2616`, `ui/survivalHud.js:215`, `ui/threatHalo.js:553` |
| `aiTrader:requestTrade` | `systems/traffic.js:6538` | `systems/economy.js:853` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | — |
| `anomaly:bearing` | `systems/scanner.js:987` | — |
| `anomaly:triangulated` | `systems/scanner.js:1005` | `systems/world.js:476` |
| `asset:deployed` | `systems/automation.js:2043`, `systems/automation.js:2103`, `systems/automation.js:2192`, `systems/claims.js:484` | `systems/missions.js:1164`, `systems/onboarding.js:492`, `systems/story.js:181` |
| `asteroid:chunked` | `systems/mining.js:1537` | `render/asteroidMotionPresentation.js:417`, `render/vfx.js:2210`, `systems/presentationOrchestrator.js:196` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:1001`, `systems/mining.js:789` | `audio/audioSystem.js:1700`, `render/vfx.js:2209`, `systems/fieldDepletion.js:703`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:386`, `render/shipMicroMotion.js:1962`, `render/vfx.js:2251`, `render/vfx.js:9636`, `render/vfx.js:10894`, `systems/ai.js:704`, `systems/barkDirector.js:842`, `systems/beacons.js:60`, `systems/beacons.js:65`, `systems/beacons.js:97`, `systems/bombs.js:506`, `systems/bombs.js:623`, `systems/bombs.js:801`, `systems/bulletTime.js:182`, `systems/bulletTime.js:198`, `systems/bulletTime.js:277`, `systems/claims.js:331`, `systems/claims.js:416`, `systems/claims.js:461`, `systems/claims.js:1164`, `systems/claims.js:1775`, `systems/cloak.js:118`, `systems/cloak.js:129`, `systems/countermeasures.js:281`, `systems/crafting.js:268`, `systems/crafting.js:278`, `systems/fields.js:707`, `systems/fields.js:793`, `systems/fields.js:826`, `systems/fields.js:833`, `systems/fields.js:1088`, `systems/flybyFocus.js:433`, `systems/impulseCharges.js:617`, `systems/impulseCharges.js:795`, `systems/impulseCharges.js:908`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:239`, `systems/masslineThrow.js:535`, `systems/masslineThrow.js:620`, `systems/mining.js:577`, `systems/mining.js:1617`, `systems/planetRuntime.js:496`, `systems/presentationAdapters.js:527`, `systems/presentationOrchestrator.js:465`, `systems/salvage.js:560`, `systems/tumbleStates.js:332`, `systems/tumbleStates.js:366`, `systems/weapons.js:1437`, `ui/commsRadial.js:539`, `ui/commsRadial.js:584`, `ui/commsRadial.js:769`, `ui/commsRadial.js:800`, `ui/hud.js:2088`, `ui/hud.js:3379`, `ui/hud.js:3588`, `ui/hud.js:3648`, `ui/hud.js:3690`, `ui/hud.js:3709`, `ui/hud.js:3807`, `ui/hud.js:3943`, `ui/hud.js:4225`, `ui/input.js:181`, `ui/input.js:210`, `ui/input.js:259`, `ui/input.js:297`, `ui/input.js:303`, `ui/input.js:354`, `ui/input.js:413`, `ui/input.js:419`, `ui/input.js:425`, `ui/input.js:431`, `ui/input.js:642`, `ui/input.js:849`, `ui/input.js:854`, `ui/input.js:872`, `ui/input.js:877`, `ui/input.js:970`, `ui/input.js:991`, `ui/input.js:999`, `ui/input.js:1005`, `ui/input.js:1047`, `ui/input.js:1058`, `ui/input.js:1062`, `ui/input.js:1075`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:488`, `ui/screens/base.js:522`, `ui/screens/base.js:668`, `ui/screens/missionLog.js:1881`, `ui/screens/missionLog.js:1885`, `ui/screens/missionLog.js:1889`, `ui/screens/missionLog.js:1893`, `ui/screens/missionLog.js:1909`, `ui/screens/missionLog.js:1917`, `ui/screens/missionLog.js:1924`, `ui/screens/missionLog.js:1931`, `ui/screens/missionLog.js:1939`, `ui/screens/missionLog.js:1946`, `ui/screens/missionLog.js:1953`, `ui/screens/missionLog.js:1962`, `ui/screens/missionLog.js:1969`, `ui/screens/missionLog.js:1985`, `ui/screens/missionLog.js:2016`, `ui/screens/missionLog.js:2036`, `ui/shipLedgerPanel.js:295`, `ui/shipLedgerPanel.js:302`, `ui/shipLedgerPanel.js:309`, `ui/station/screens/bar.js:452`, `ui/station/screens/bar.js:475`, `ui/station/screens/bar.js:479`, `ui/station/screens/bar.js:483`, `ui/station/screens/bar.js:505`, `ui/station/screens/bar.js:521`, `ui/station/screens/bar.js:550`, `ui/station/screens/bar.js:575`, `ui/station/screens/bar.js:584`, `ui/station/screens/contracts.js:818`, `ui/station/screens/contracts.js:829`, `ui/station/screens/contracts.js:865`, `ui/station/screens/contracts.js:868`, `ui/station/screens/contracts.js:899`, `ui/station/screens/factions.js:314`, `ui/station/screens/industry.js:261`, `ui/station/screens/industry.js:290`, `ui/station/screens/market.js:595`, `ui/station/screens/market.js:894`, `ui/station/screens/market.js:963`, `ui/station/screens/market.js:971`, `ui/station/screens/market.js:992`, `ui/station/screens/market.js:1003`, `ui/station/screens/market.js:1195`, `ui/station/screens/shipworks.js:523`, `ui/station/screens/shipworks.js:2105`, `ui/station/screens/shipworks.js:2850`, `ui/station/screens/shipworks.js:2867`, `ui/station/screens/shipworks.js:2880`, `ui/station/screens/shipworks.js:2884`, `ui/station/screens/shipworks.js:2889`, `ui/station/screens/shipworks.js:2916`, `ui/station/screens/shipworks.js:2922`, `ui/station/screens/shipworks.js:2937`, `ui/station/screens/shipworks.js:2980`, `ui/station/screens/shipworks.js:2989`, `ui/station/screens/shipworks.js:2999`, `ui/station/screens/shipworks.js:3005`, `ui/station/screens/shipworks.js:3025`, `ui/station/screens/shipworks.js:3032`, `ui/station/screens/shipworks.js:3067`, `ui/station/screens/shipworks.js:3074`, `ui/station/screens/shipworks.js:3085`, `ui/station/screens/shipworks.js:3095`, `ui/station/screens/shipworks.js:3100`, `ui/station/screens/shipworks.js:3189`, `ui/station/screens/shipworks.js:3199`, `ui/station/screens/shipworks.js:3209`, `ui/station/screens/shipworks.js:3219`, `ui/station/screens/shipworks.js:3252`, `ui/station/screens/shipworks.js:3256`, `ui/station/screens/shipworks.js:3269`, `ui/station/screens/shipworks.js:3274`, `ui/station/stationApp.js:630`, `ui/station/stationApp.js:882`, `ui/station/stationApp.js:918`, `ui/uiRoot.js:1162`, `ui/wingmanRadial.js:135`, `ui/wingmanRadial.js:156`, `ui/wingmanRadial.js:178`, `ui/wingmanRadial.js:204`, `ui/wingmanRadial.js:229` | `audio/audioSystem.js:1816` |
| `automation:assetDistressed` | `systems/automation.js:1798` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2288` | `systems/intervention.js:38`, `systems/lossLedger.js:377`, `systems/missions.js:1166` |
| `automation:assetRepossessed` | `systems/automation.js:1823` | `ui/automationPayoff.js:90` |
| `automation:assetResumed` | `systems/automation.js:2144` | — |
| `automation:incomeCredited` | `systems/automation.js:1852`, `systems/automation.js:1863`, `systems/automation.js:2561` | — |
| `automation:offlineSummary` | `systems/automation.js:2326`, `systems/automation.js:2350`, `systems/automation.js:2374`, `systems/automation.js:2397`, `systems/automation.js:2608` | `ui/automationPayoff.js:80` |
| `automation:outpostRaided` | `systems/automation.js:1725`, `systems/automation.js:2683` | `systems/lossLedger.js:378` |
| `automation:programAssigned` | `systems/automation.js:1998` | `systems/missions.js:1165` |
| `automation:traderCycleCompleted` | `systems/automation.js:1481` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:515` | — |
| `band:bearingRequest` | `systems/bandRadio.js:488` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:604`, `systems/uniqueWrecks.js:647` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:611`, `systems/uniqueWrecks.js:619`, `systems/uniqueWrecks.js:633` | — |
| `band:bed` | `systems/bandRadio.js:572` | `audio/audioSystem.js:1865` |
| `band:cycle` | `ui/bandHud.js:82`, `ui/input.js:319` | — |
| `band:status` | `systems/bandRadio.js:554` | `ui/bandHud.js:86` |
| `barkDirector:voice` | — | `audio/audioSystem.js:1841` |
| `beacon:deploy` | — | `systems/beacons.js:43` |
| `beacon:deployed` | `systems/beacons.js:92` | `render/shipMicroMotion.js:1143` |
| `beam:denied` | `systems/mining.js:271`, `systems/mining.js:314`, `systems/mining.js:328`, `systems/mining.js:338`, `systems/mining.js:370` | — |
| `beam:repaired` | `systems/mining.js:431` | — |
| `beam:transferred` | `systems/mining.js:462` | — |
| `bombs:armed` | `systems/bombs.js:561` | — |
| `bombs:commanded` | `systems/bombs.js:519` | — |
| `bombs:cycle` | `systems/bombs.js:263`, `systems/bombs.js:498` | — |
| `bombs:denied` | `systems/bombs.js:195`, `systems/bombs.js:256`, `systems/bombs.js:278`, `systems/bombs.js:314`, `systems/bombs.js:351`, `systems/bombs.js:375`, `systems/bombs.js:443`, `systems/bombs.js:457` | — |
| `bombs:destroyed` | `systems/bombs.js:798` | `render/vfx.js:2224` |
| `bombs:detonated` | `systems/bombs.js:617` | `audio/bombAudio.js:314`, `render/vfx.js:2222` |
| `bombs:dropped` | `systems/bombs.js:505` | `render/ordnanceMotionPresentation.js:260`, `systems/onboarding.js:509` |
| `bombs:fieldEnded` | `systems/bombs.js:753` | `audio/bombAudio.js:322`, `render/vfx.js:2223` |
| `bombs:primed` | `systems/bombs.js:530` | — |
| `bombs:rackChanged` | `systems/bombs.js:404` | — |
| `bombs:released` | `systems/bombs.js:816` | `audio/bombAudio.js:325` |
| `bombs:stockChanged` | `systems/bombs.js:285`, `systems/bombs.js:396`, `systems/bombs.js:503` | — |
| `boss:defeated` | `systems/world.js:686` | — |
| `bounty:cleared` | `systems/economy.js:2117` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:299` | — |
| `bulletTime:end` | `systems/bulletTime.js:197` | `audio/audioSystem.js:1864` |
| `bulletTime:start` | `systems/bulletTime.js:181` | `audio/audioSystem.js:1861`, `systems/onboarding.js:552` |
| `camera:kill` | `render/feel.js:1141`, `render/feel.js:1632` | — |
| `camera:shake` | `render/shipMicroMotion.js:1960`, `render/vfx.js:5694`, `render/vfx.js:6031`, `systems/combat.js:547`, `systems/combat.js:674`, `systems/combat.js:847`, `systems/combat.js:929`, `systems/drill.js:1283`, `systems/flybyFocus.js:432`, `systems/intervention.js:109`, `systems/presentationAdapters.js:449`, `systems/survivalAnnounce.js:413`, `systems/tetherGameplay.js:526` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:485`, `ui/input.js:486`, `ui/input.js:718` | — |
| `capitalBoss:detach` | `systems/missions.js:1181` | — |
| `capitalBoss:start` | `systems/missions.js:4936` | — |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:110`, `systems/capitalBossEncounters.js:131` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:656` | `systems/world.js:478` |
| `cargo:changed` | `systems/cargo.js:170`, `systems/mining.js:1782` | `systems/ships.js:1407`, `ui/cargoConscience.js:122`, `ui/commandBar.js:412`, `ui/hud.js:3721`, `ui/hud.js:3750`, `ui/hudMeta.js:192` |
| `cargo:delivered` | `systems/missions.js:5628`, `systems/missions.js:5699` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:269`, `systems/mining.js:567`, `systems/mining.js:1071` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:452`, `systems/presentationOrchestrator.js:204`, `ui/alerts.js:370`, `ui/floatingText.js:236` |
| `cargo:hotDockSpill` | `systems/cargo.js:478` | — |
| `cargo:jettison` | `ui/hud.js:3387` | `ui/hud.js:3653` |
| `cargo:jettisoned` | `systems/cargo.js:554` | `audio/audioSystem.js:1722`, `render/shipMicroMotion.js:1141`, `systems/barkDirector.js:249`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:548` |
| `cargo:massSettled` | `systems/cargo.js:400` | `systems/presentationOrchestrator.js:203`, `systems/ships.js:1408` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:747` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:783` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:723` | — |
| `chain:detonated` | `systems/impulseCharges.js:597` | `systems/fields.js:364` |
| `chain:primeEnded` | `systems/impulseCharges.js:560` | — |
| `chain:primed` | `systems/impulseCharges.js:537` | — |
| `chain:slam` | `systems/impulseCharges.js:471`, `systems/impulseCharges.js:491` | `systems/fields.js:363` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1859` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:791` | `systems/onboarding.js:560` |
| `charge:armed` | `systems/impulseCharges.js:634` | — |
| `charge:combo` | `systems/impulseCharges.js:833`, `systems/impulseCharges.js:892` | — |
| `charge:detonated` | `systems/impulseCharges.js:609`, `systems/impulseCharges.js:900` | `audio/audioSystem.js:1750`, `render/feel.js:1236`, `render/vfx.js:2220`, `systems/fields.js:365` |
| `charge:stuck` | `systems/impulseCharges.js:711` | `render/ordnanceMotionPresentation.js:262`, `render/shipMicroMotion.js:1140` |
| `charge:thrown` | `systems/impulseCharges.js:787` | `render/ordnanceMotionPresentation.js:261` |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:18` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:19` |
| `claim:claimed` | `systems/claims.js:330` | `systems/onboarding.js:498`, `systems/story.js:187`, `systems/traffic.js:1360` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1223` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:284` |
| `claim:defenseResolved` | `systems/claims.js:1299` | — |
| `claim:defenseStarted` | `systems/claims.js:1228` | — |
| `claim:defenseWarning` | `systems/claims.js:1147` | — |
| `claim:depotPatrolCompleted` | `systems/claims.js:2069` | `systems/factions.js:293` |
| `claim:depotPatrolRotation` | `systems/claims.js:2026` | — |
| `claim:depotSupport` | `systems/claims.js:1941`, `systems/claims.js:1966` | — |
| `claim:freightDelivered` | `systems/traffic.js:2351` | — |
| `claim:infrastructureActive` | `systems/claims.js:864` | `systems/traffic.js:1358` |
| `claim:infrastructureConstructed` | `systems/claims.js:397` | — |
| `claim:infrastructureStatus` | `systems/claims.js:875` | `systems/traffic.js:1359` |
| `claim:moduleBuilt` | `systems/claims.js:415` | — |
| `claim:raidRepelled` | `systems/claims.js:1096` | — |
| `claim:raidWarning` | `systems/claims.js:1089` | — |
| `claim:receipt` | `systems/claims.js:1516` | — |
| `claim:sensorPostRumor` | `systems/claims.js:924` | `systems/world.js:506` |
| `claim:specialized` | `systems/claims.js:456` | — |
| `claim:teleportRequest` | `systems/claims.js:662` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:2226` | — |
| `claims:migrated` | `systems/claims.js:1634` | — |
| `cloak:dropped` | `systems/cloak.js:128` | `render/shipMicroMotion.js:1137` |
| `cloak:engaged` | `systems/cloak.js:117` | `render/shipMicroMotion.js:1136`, `systems/onboarding.js:556` |
| `combat:actionCancelled` | `combat/actions.js:303` | — |
| `combat:actionCompleted` | `combat/actions.js:289` | — |
| `combat:actionPhase` | `combat/actions.js:162` | — |
| `combat:actionRejected` | `combat/actions.js:325` | `ui/toasts.js:359` |
| `combat:actionStarted` | `combat/actions.js:132` | `systems/presentationOrchestrator.js:163`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2166` |
| `combat:baseDestroyed` | — | `systems/economy.js:902` |
| `combat:beamStop` | `systems/weapons.js:809` | `audio/audioSystem.js:1646`, `render/asteroidMotionPresentation.js:416`, `render/vfx.js:2162` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:253` | `render/feel.js:1271`, `render/vfx.js:2175`, `systems/fields.js:367`, `systems/gamepad.js:323` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:271` | `render/vfx.js:2176` |
| `combat:damage` | `combat/damage.js:288` | `audio/audioSystem.js:1653`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/asteroidMotionPresentation.js:410`, `render/feel.js:1066`, `render/shipMicroMotion.js:1123`, `render/vfx.js:2167`, `save/saveSystem.js:240`, `systems/ai.js:101`, `systems/barkDirector.js:245`, `systems/cruise.js:53`, `systems/difficultyDirector.js:133`, `systems/encounterDirector.js:250`, `systems/factionPresence.js:406`, `systems/heat.js:237`, `systems/lawSecurity.js:196`, `systems/onboarding.js:418`, `systems/onboarding.js:429`, `systems/presentationOrchestrator.js:157`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1468`, `systems/stationBroadcast.js:152`, `systems/survivalResults.js:375`, `systems/titles.js:395`, `systems/traffic.js:1308`, `ui/alerts.js:356`, `ui/commandBar.js:401`, `ui/floatingText.js:145`, `ui/hud.js:1651`, `ui/hud.js:1916`, `ui/hud.js:2118`, `ui/uiRoot.js:613` |
| `combat:emp` | `combat/damage.js:322` | `ui/hud.js:2124` |
| `combat:fire` | `systems/weapons.js:721`, `systems/weapons.js:788`, `systems/weapons.js:937`, `systems/weapons.js:1252` | `audio/audioSystem.js:1645`, `render/feel.js:1157`, `render/shipMicroMotion.js:1121`, `render/vfx.js:2161`, `systems/cloak.js:37`, `systems/cruise.js:61`, `systems/lawSecurity.js:197`, `systems/onboarding.js:369`, `systems/onboarding.js:382`, `systems/presentationOrchestrator.js:162`, `systems/traffic.js:1309`, `ui/hud.js:3765` |
| `combat:hit` | `systems/salvageActions.js:182` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:539` |
| `combat:kill` | `systems/world.js:4563` | — |
| `combat:lockChanged` | `systems/weapons.js:558` | `systems/world.js:471`, `ui/alerts.js:363` |
| `combat:outcome` | `systems/combatOutcome.js:183` | `systems/barkDirector.js:242` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:184` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:77` |
| `combat:requestAction` | — | `combat/kernel.js:75` |
| `combat:routeDamage` | `systems/bombs.js:766`, `systems/drill.js:1295`, `systems/impulseCharges.js:1109`, `systems/mines.js:213`, `systems/missions.js:5276` | `combat/kernel.js:76`, `systems/routeFollower.js:333` |
| `combat:shove` | `systems/onboarding.js:1791` | `audio/audioSystem.js:1734`, `systems/onboarding.js:381` |
| `combat:statusApplied` | `combat/statuses.js:155` | `render/vfx.js:2177` |
| `combat:statusExpired` | `combat/statuses.js:57` | `audio/bombAudio.js:334` |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:120`, `systems/encounterDirector.js:245`, `systems/factionPresence.js:404`, `systems/presentationOrchestrator.js:225`, `systems/surrenderRecovery.js:64`, `systems/wingMorale.js:179` |
| `combat:subsystemEnabled` | — | `render/shipMicroMotion.js:1139`, `systems/factionPresence.js:405`, `systems/presentationOrchestrator.js:234`, `systems/surrenderRecovery.js:65` |
| `combat:surrendered` | — | `systems/combatOutcome.js:121`, `systems/surrenderRecovery.js:63` |
| `combat:tumbled` | `systems/tumbleStates.js:330` | `systems/fields.js:366`, `systems/missions.js:1108`, `systems/tetherGameplay.js:211` |
| `combat:warded` | `combat/damage.js:52` | — |
| `combat:weakPointHit` | `systems/combat.js:608` | `render/vfx.js:2168`, `ui/floatingText.js:173` |
| `comms:log` | `data/encounters/015-opening-hauler-raid.js:127`, `systems/encounterDirector.js:2100`, `systems/encounterScripts.js:660`, `systems/encounterScripts.js:2523`, `systems/encounterScripts.js:2769`, `systems/salvage.js:558` | `ui/floatingText.js:65` |
| `comms:message` | `systems/traffic.js:4554`, `systems/traffic.js:5203` | — |
| `comms:popup` | `systems/ai.js:488`, `systems/factionPresence.js:893`, `systems/factionPresence.js:914`, `systems/missions.js:3845`, `systems/missions.js:5813`, `systems/missions.js:5847`, `systems/missions.js:5886`, `systems/missions.js:6995`, `systems/missions.js:7385`, `systems/onboarding.js:709`, `systems/scenarioRuntime.js:186`, `systems/story.js:412`, `systems/story.js:1093`, `systems/story.js:1121` | `audio/audioSystem.js:1802`, `ui/screens/codex.js:672` |
| `conflict:flip` | `systems/factions.js:606` | `systems/factionPresence.js:410`, `systems/sectorSim.js:109`, `systems/story.js:182` |
| `conflict:frontAction` | `systems/factions.js:493` | — |
| `conflict:warDeclared` | `systems/factions.js:550` | — |
| `contactHail:availability` | `systems/scanner.js:1324`, `systems/scanner.js:1335` | — |
| `contactHail:choice` | `ui/commsRadial.js:533`, `ui/contactHailPrompt.js:167` | `systems/scanner.js:803` |
| `contactHail:clear` | `systems/scanner.js:1346` | — |
| `contactHail:handoff` | `systems/scanner.js:1184` | — |
| `contactHail:offer` | `systems/scanner.js:1206` | — |
| `contactHail:request` | `ui/commsRadial.js:585`, `ui/contactHailPrompt.js:161` | `systems/scanner.js:802` |
| `contactHail:response` | `systems/scanner.js:1240` | `systems/traffic.js:1298` |
| `contraband:bribe` | `systems/encounterScripts.js:426`, `ui/customsPrompt.js:207` | `systems/economy.js:898` |
| `contraband:scanned` | `systems/economy.js:2443` | `systems/encounterDirector.js:251`, `systems/factions.js:274`, `systems/heat.js:240`, `systems/lawSecurity.js:207`, `ui/customsPrompt.js:139` |
| `contract:clauseBroken` | `systems/contractClauses.js:351` | `systems/missions.js:1145` |
| `contract:clauseHonored` | `systems/contractClauses.js:338`, `systems/missions.js:5900` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:277` | `render/shipMicroMotion.js:1142` |
| `craft:complete` | `systems/crafting.js:267`, `systems/crafting.js:310` | `ui/station/screens/industry.js:301` |
| `craft:queueChanged` | `systems/crafting.js:162`, `systems/crafting.js:277`, `systems/crafting.js:312` | `systems/onboarding.js:503`, `ui/station/screens/industry.js:301` |
| `credits:changed` | `systems/economy.js:2057`, `systems/economy.js:2069` | `audio/audioSystem.js:1715`, `balance/hunterPublicRoute.js:466`, `ui/commandBar.js:413`, `ui/hud.js:3749` |
| `cruise:charging` | `systems/cruise.js:123` | `render/vfx.js:2217`, `systems/presentationOrchestrator.js:170` |
| `cruise:dropped` | `systems/cruise.js:189` | `render/vfx.js:2219`, `systems/presentationOrchestrator.js:172` |
| `cruise:engaged` | `systems/cruise.js:98` | `render/vfx.js:2218`, `systems/presentationOrchestrator.js:171` |
| `cruise:snareRequest` | `systems/encounterScripts.js:523` | `systems/cruise.js:66` |
| `cruise:snared` | `systems/cruise.js:188` | `audio/audioSystem.js:1796` |
| `customs:breakScan` | `ui/customsPrompt.js:211` | — |
| `customs:submit` | `ui/customsPrompt.js:190` | — |
| `danger:miningNoise` | `systems/mining.js:1794` | — |
| `day:tick` | `core/coreSystem.js:249` | `systems/custodyConsequences.js:40`, `systems/encounterDirector.js:227`, `systems/factions.js:305`, `systems/sectorSim.js:93` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:189` | `systems/combat.js:520` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:180` | `systems/combat.js:519` |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:315` | — |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:346` | — |
| `discovery:plateUnlocked` | `systems/world.js:641`, `systems/world.js:4461`, `systems/world.js:4712`, `systems/world.js:5332` | `audio/audioSystem.js:1732`, `ui/discoveryPlate.js:138`, `ui/screens/codex.js:674` |
| `distress:call` | `systems/traffic.js:4552` | — |
| `distress:rescued` | `systems/encounterScripts.js:659` | `systems/factions.js:283` |
| `dock:attempt` | `ui/input.js:176` | `ui/dockDenyBanner.js:116` |
| `dock:denied` | `ui/dockDenyBanner.js:141` | — |
| `dock:docked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:180` | `audio/audioSystem.js:1733`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/infrastructureMotion.js:115`, `render/shipMicroMotion.js:1132`, `save/saveSystem.js:267`, `systems/aftermathWrecks.js:896`, `systems/autoTargetAssist.js:101`, `systems/combat.js:506`, `systems/economy.js:878`, `systems/economyContracts.js:164`, `systems/factionPresence.js:402`, `systems/lawSecurity.js:212`, `systems/mining.js:179`, `systems/missions.js:1031`, `systems/onboarding.js:343`, `systems/onboarding.js:469`, `systems/pirateDisguise.js:37`, `systems/scanner.js:806`, `systems/stationServices.js:205`, `systems/story.js:147`, `systems/world.js:499`, `ui/alerts.js:330`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:162`, `ui/dockDenyBanner.js:117`, `ui/impoundPayPrompt.js:35`, `ui/priceForecast.js:86`, `ui/promptDeck.js:710`, `ui/securityReadout.js:158`, `ui/uiRoot.js:1086`, `ui/wingmanRadial.js:247` |
| `dock:launder` | — | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:976`, `core/physics.js:980`, `ui/input.js:153` | `systems/onboarding.js:438`, `ui/alerts.js:326`, `ui/input.js:159` |
| `dock:undocked` | `balance/careerCohorts.js:489`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:682`, `ui/station/stationApp.js:851` | `audio/audioSystem.js:1738`, `render/infrastructureMotion.js:116`, `render/shipMicroMotion.js:1133`, `save/saveSystem.js:268`, `systems/combat.js:510`, `systems/economy.js:886`, `systems/missions.js:1050`, `systems/onboarding.js:392`, `systems/presentationAdapters.js:185`, `systems/stationServices.js:206`, `systems/world.js:500`, `ui/input.js:167`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1116` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1309` | `ui/uiRoot.js:1175` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1294`, `ui/sandbox/sandboxSetup.js:593` | `ui/uiRoot.js:1165` |
| `drill:approachRequested` | `ui/input.js:597` | `systems/tetherGameplay.js:210` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1186`, `ui/sandbox/sandboxSetup.js:592` | `ui/uiRoot.js:1154` |
| `drill:break` | `systems/drill.js:1194` | `audio/audioSystem.js:1895`, `systems/asteroidSites.js:166`, `systems/presentationOrchestrator.js:211`, `ui/asteroid/asteroidScreen.js:1611`, `ui/screens/drill.js:1742` |
| `drill:cargoFull` | `systems/drill.js:1243` | `audio/audioSystem.js:1897`, `systems/presentationOrchestrator.js:218`, `ui/asteroid/asteroidScreen.js:1601`, `ui/screens/drill.js:1712` |
| `drill:end` | `systems/drill.js:807` | `audio/audioSystem.js:1905`, `systems/asteroidSites.js:176`, `systems/presentationOrchestrator.js:219` |
| `drill:gasHit` | `systems/drill.js:1282` | `audio/audioSystem.js:1896`, `systems/presentationOrchestrator.js:213`, `ui/asteroid/asteroidScreen.js:1588`, `ui/screens/drill.js:1652` |
| `drill:retry` | `systems/drill.js:858` | `systems/presentationOrchestrator.js:220` |
| `drill:rockDepleted` | `systems/drill.js:773`, `systems/drill.js:1208`, `systems/drill.js:1234` | `audio/audioSystem.js:1898`, `ui/asteroid/asteroidScreen.js:1598`, `ui/screens/drill.js:1703` |
| `drill:scanPulse` | `systems/drill.js:931` | `audio/audioSystem.js:1899`, `systems/asteroidSites.js:193`, `systems/presentationOrchestrator.js:209`, `ui/asteroid/asteroidScreen.js:1605`, `ui/screens/drill.js:1730` |
| `drill:spark` | `systems/drill.js:1164` | `audio/audioSystem.js:1894`, `systems/presentationOrchestrator.js:210`, `ui/asteroid/asteroidScreen.js:1616`, `ui/screens/drill.js:1763` |
| `drill:start` | `systems/drill.js:765` | `audio/audioSystem.js:1904`, `systems/asteroidSites.js:159`, `systems/onboarding.js:474`, `systems/presentationOrchestrator.js:208` |
| `drill:warn` | `systems/drill.js:779`, `systems/drill.js:784`, `systems/drill.js:1061`, `systems/drill.js:1096`, `systems/drill.js:1116`, `systems/drill.js:1215`, `systems/drill.js:1246`, `systems/drill.js:1253` | `audio/audioSystem.js:1900`, `systems/presentationOrchestrator.js:207`, `ui/asteroid/asteroidRenderer3d.js:6981`, `ui/asteroid/asteroidScreen.js:1594`, `ui/screens/drill.js:1680` |
| `drill:yield` | `systems/drill.js:1232` | `audio/audioSystem.js:1891`, `systems/presentationOrchestrator.js:212`, `ui/asteroid/asteroidScreen.js:1580`, `ui/screens/drill.js:1631` |
| `economy:applyTradePressure` | `systems/automation.js:847`, `systems/automation.js:1574`, `systems/automation.js:1575`, `systems/claims.js:1005`, `systems/encounterDirector.js:1637`, `systems/encounterDirector.js:1685`, `systems/sectorSim.js:375`, `systems/traffic.js:8121`, `systems/traffic.js:9853` | `systems/economy.js:861` |
| `economy:cargoKillOpportunity` | `systems/economy.js:1840` | `systems/missions.js:1061` |
| `economy:chargeCredits` | `systems/automation.js:1747`, `systems/automation.js:1754`, `systems/automation.js:2571`, `systems/automation.js:2795`, `systems/beacons.js:69`, `systems/bombs.js:282`, `systems/bombs.js:362`, `systems/bombs.js:379`, `systems/claims.js:310`, `systems/claims.js:380`, `systems/claims.js:451`, `systems/claims.js:1049`, `systems/combat.js:829`, `systems/encounterDirector.js:1631`, `systems/factions.js:369`, `systems/gateControlDirector.js:120`, `systems/mining.js:417`, `systems/missions.js:2733`, `systems/missions.js:2736`, `systems/pirateParley.js:508`, `systems/ships.js:1785`, `systems/ships.js:1855`, `systems/ships.js:1911`, `systems/world.js:3078`, `systems/world.js:3122`, `systems/world.js:4129` | `systems/economy.js:827` |
| `economy:demandShift` | `systems/economy.js:1155` | — |
| `economy:eventEnded` | `systems/economy.js:2521` | `ui/floatingText.js:252` |
| `economy:eventStarted` | `systems/economy.js:2496` | `ui/floatingText.js:241` |
| `economy:grantCredits` | `systems/automation.js:1848`, `systems/automation.js:1859`, `systems/automation.js:2557`, `systems/bombs.js:395`, `systems/claims.js:1004`, `systems/claims.js:1620`, `systems/combat.js:681`, `systems/combat.js:693`, `systems/combat.js:914`, `systems/encounterDirector.js:1632`, `systems/mining.js:1456`, `systems/mining.js:1633`, `systems/missions.js:5908`, `systems/missions.js:5911`, `systems/missions.js:6249`, `systems/missions.js:7298`, `systems/moralTrap.js:195`, `systems/ships.js:1941`, `systems/survivorPod.js:1021`, `systems/uniqueWrecks.js:1440` | `systems/economy.js:826`, `systems/story.js:180` |
| `economy:marketOpened` | `ui/station/screens/market.js:1237` | `systems/economy.js:837`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1224` | `systems/economy.js:829` |
| `economy:salvageIntakeApplied` | `systems/economy.js:2040` | — |
| `economy:sinkCharged` | `systems/economy.js:2083` | — |
| `economy:tick` | `systems/economy.js:988` | `ui/priceHistory.js:116` |
| `economy:tradeCompleted` | `systems/economy.js:1692` | `audio/audioSystem.js:1716`, `audio/audioSystem.js:1772`, `careers/origins/haulerOriginSystem.js:91`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:275`, `systems/claims.js:278`, `systems/factions.js:253`, `systems/missions.js:1059`, `systems/onboarding.js:348`, `systems/sectorSim.js:104`, `systems/story.js:176` |
| `economy:tradeFailed` | `systems/economy.js:1911`, `systems/economy.js:1934` | — |
| `emergent:audio` | `systems/emergentPrimitives.js:144` | — |
| `emergent:contact` | `systems/emergentPrimitives.js:150` | `render/feel.js:1254` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1488` | `ui/encounterChoicePrompt.js:53` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:264` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1573` | — |
| `encounter:hostileCommitted` | `systems/encounterDirector.js:2141` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:6734` | `systems/encounterDirector.js:249` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1763`, `systems/encounterScripts.js:2743` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:2105` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:1061` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:978`, `systems/encounterScripts.js:1046` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:951` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1586` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:1568`, `systems/encounterDirector.js:1617`, `systems/survivalArena.js:975` | `audio/audioSystem.js:1742`, `systems/aftermathWrecks.js:895`, `systems/claims.js:282`, `systems/claims.js:283`, `systems/story.js:135`, `systems/terrainAnchors.js:89`, `systems/traffic.js:1361`, `systems/uniqueLootAbilities.js:133`, `ui/encounterChoicePrompt.js:54` |
| `encounter:spawned` | `systems/encounterDirector.js:974` | `systems/uniqueLootAbilities.js:132` |
| `encounter:stale` | `systems/encounterDirector.js:327` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:946`, `systems/survivalArena.js:901` | `audio/audioSystem.js:1741`, `systems/survivalResults.js:381`, `systems/terrainAnchors.js:88`, `systems/world.js:509` |
| `encounter:voice` | `systems/encounterDirector.js:1471` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | — |
| `endgame:archive` | `systems/story.js:163` | — |
| `endgame:chosen` | `systems/story.js:935` | `ui/screens/missionLog.js:2130` |
| `endgame:confirmRequired` | `systems/story.js:820` | `ui/screens/missionLog.js:2129` |
| `endgame:eligibility` | `systems/story.js:637` | `ui/screens/missionLog.js:2128` |
| `endgame:finaleCompleted` | `systems/story.js:713` | — |
| `endgame:finaleReady` | `systems/story.js:944` | — |
| `endgame:ineligible` | `systems/story.js:723`, `systems/story.js:800`, `systems/story.js:865` | — |
| `endgame:loopBack` | — | `systems/story.js:171` |
| `endgame:promptChoiceC` | `systems/story.js:785` | — |
| `endgame:promptChoiceD` | `systems/story.js:749` | — |
| `endgame:promptSandbox` | `systems/story.js:648` | — |
| `endgame:pullCompleted` | `systems/claims.js:2172` | `systems/factions.js:296` |
| `endgame:sandboxContinued` | `systems/story.js:929` | `ui/screens/missionLog.js:2131` |
| `entity:destroyed` | `main.js:465`, `main.js:682`, `save/saveSystem.js:3440`, `systems/survivorPod.js:274`, `systems/traffic.js:6197` | `audio/audioSystem.js:1694`, `combat/kernel.js:70`, `render/vfx.js:2179`, `systems/aftermathWrecks.js:890`, `systems/ai.js:113`, `systems/encounterDirector.js:243`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:247`, `systems/lawSecurity.js:200`, `systems/missions.js:1076`, `systems/npcJobsRuntime.js:815`, `systems/presentationOrchestrator.js:169`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:94`, `systems/survivalWave.js:95`, `systems/swarmArena.js:428`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:162` |
| `entity:killed` | `balance/careerCohorts.js:457`, `combat/damage.js:464`, `combat/kernel.js:45`, `systems/combat.js:660` | `audio/audioSystem.js:1693`, `render/feel.js:1117`, `render/shipMicroMotion.js:1116`, `render/vfx.js:2178`, `sim/titleAttract.js:166`, `systems/aftermathWrecks.js:888`, `systems/ai.js:114`, `systems/barkDirector.js:250`, `systems/combatOutcome.js:118`, `systems/economy.js:867`, `systems/encounterDirector.js:244`, `systems/factions.js:215`, `systems/factions.js:243`, `systems/impulseCharges.js:226`, `systems/lawSecurity.js:199`, `systems/lawSecurity.js:211`, `systems/lootShards.js:514`, `systems/lossLedger.js:380`, `systems/mining.js:174`, `systems/missions.js:1071`, `systems/npcJobsRuntime.js:807`, `systems/onboarding.js:383`, `systems/onboarding.js:407`, `systems/presentationOrchestrator.js:168`, `systems/sectorSim.js:108`, `systems/surrenderRecovery.js:70`, `systems/survivalResults.js:372`, `systems/survivorPod.js:412`, `systems/swarmChain.js:107`, `systems/swarmSupply.js:101`, `systems/titles.js:396`, `systems/traffic.js:1286`, `systems/wingMorale.js:178`, `systems/world.js:512`, `ui/floatingText.js:170`, `ui/floatingText.js:208`, `ui/uiRoot.js:620`, `ui/uiRoot.js:628` |
| `entity:spawnRequest` | — | `core/coreSystem.js:166` |
| `entity:spawned` | `core/coreSystem.js:67` | `combat/kernel.js:65`, `render/asteroidMotionPresentation.js:418`, `render/ordnanceMotionPresentation.js:258`, `render/pickupMotionPresentation.js:220`, `render/shipMicroMotion.js:1117`, `render/vfx.js:2185`, `sim/titleAttract.js:167`, `systems/factionPresence.js:408`, `systems/fields.js:361`, `systems/lawSecurity.js:198`, `systems/lossLedger.js:379`, `systems/npcJobsRuntime.js:792`, `systems/salvageActions.js:69`, `systems/survivalSwarm.js:216`, `systems/swarmSupply.js:106`, `systems/titles.js:397`, `systems/uniqueLootAbilities.js:135` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:646` | `systems/terrainAnchors.js:90` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:461` | `systems/terrainAnchors.js:94` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:540` | `systems/terrainAnchors.js:92` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:737` | `data/hazardLanguage.js:133` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:473` | `systems/terrainAnchors.js:96` |
| `escalation:arrived` | `systems/encounterDirector.js:367` | — |
| `escalation:seeded` | `systems/encounterDirector.js:354` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:345`, `systems/factions.js:411`, `systems/factions.js:720` | `systems/heat.js:246` |
| `faction:bribe` | `ui/screens/footprint.js:1230` | `systems/factions.js:208` |
| `faction:repChanged` | `systems/factions.js:342`, `systems/factions.js:406`, `systems/factions.js:716` | `ui/floatingText.js:226`, `ui/station/screens/factions.js:355` |
| `faction:repDelta` | `balance/careerCohorts.js:256`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:1287`, `systems/economy.js:2292`, `systems/economy.js:2436`, `systems/encounterDirector.js:1633`, `systems/missions.js:6246`, `systems/missions.js:6302`, `systems/missions.js:7251`, `systems/missions.js:7253`, `systems/missions.js:7316`, `systems/moralTrap.js:190`, `systems/moralTrap.js:197`, `systems/stuntGrammar.js:102`, `systems/survivorPod.js:811`, `systems/survivorPod.js:1027`, `systems/uniqueWrecks.js:1444`, `systems/world.js:4837`, `systems/world.js:5071` | `systems/factions.js:205` |
| `faction:repSpillover` | `systems/factions.js:404` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1133` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:897` | `systems/story.js:195` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1045` | `ui/uiRoot.js:286` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:746` | — |
| `factionPresence:service` | `systems/factionPresence.js:846` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:922` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:487`, `systems/factionPresence.js:572` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:789` | `systems/world.js:475` |
| `field:opportunity` | `systems/world.js:3452` | — |
| `field:regrown` | `systems/world.js:3381` | `systems/presentationOrchestrator.js:206` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:717`, `systems/traffic.js:1641`, `systems/traffic.js:9772` | — |
| `field:richSeamOpened` | `systems/traffic.js:8827` | — |
| `field:richSeamWorked` | `systems/mining.js:757`, `systems/traffic.js:8486` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:788` | `systems/npcJobsRuntime.js:823`, `systems/presentationOrchestrator.js:205` |
| `fields:anchorRegistered` | `systems/fields.js:638` | — |
| `fields:cleared` | `systems/fields.js:1116` | — |
| `fields:clusterDetonate` | `systems/fields.js:1677` | — |
| `fields:coneToggled` | `systems/fields.js:825`, `systems/fields.js:832`, `systems/fields.js:926`, `systems/fields.js:934` | — |
| `fields:deployDenied` | `systems/fields.js:705` | — |
| `fields:deployed` | `systems/fields.js:527`, `systems/fields.js:791`, `systems/fields.js:917` | `audio/audioSystem.js:1856`, `systems/fields.js:362`, `systems/onboarding.js:398` |
| `fields:ended` | `systems/fields.js:657`, `systems/fields.js:933`, `systems/fields.js:952`, `systems/fields.js:1086` | — |
| `fields:hitchCut` | `systems/fields.js:558` | — |
| `fields:hitchLatched` | `systems/fields.js:546` | — |
| `fields:specialistDisrupt` | `systems/fields.js:436` | — |
| `firsthour:beat` | `systems/onboarding.js:2557` | — |
| `firsthour:complete` | `systems/onboarding.js:2570` | — |
| `firsthour:milestone` | `systems/onboarding.js:790` | `audio/audioSystem.js:1849` |
| `firsthour:sentence` | `systems/onboarding.js:1429` | — |
| `firsthour:started` | `systems/onboarding.js:2415` | — |
| `firsthour:verb` | `systems/onboarding.js:2510` | — |
| `flight:modeChanged` | `systems/flightV3.js:577` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:279` |
| `flybyFocus:end` | `systems/flybyFocus.js:317` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:415` | `systems/onboarding.js:366` |
| `formation:discovered` | `systems/asteroidFormations.js:236` | — |
| `freight:arrival` | `systems/traffic.js:6555` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1463`, `systems/encounterScripts.js:1682`, `systems/traffic.js:4658` | `systems/barkDirector.js:248`, `systems/economy.js:828`, `systems/encounterDirector.js:269`, `systems/lootShards.js:516`, `systems/traffic.js:1304` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1325` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:499` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1382` | — |
| `freight:loss` | `systems/encounterDirector.js:1695`, `systems/traffic.js:8123`, `systems/traffic.js:9865` | `systems/encounterDirector.js:270` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1326` | `systems/surrenderRecovery.js:71` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1818` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:247`, `systems/traffic.js:1301` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:248`, `systems/traffic.js:1302` |
| `frontierRumor:acquired` | `systems/world.js:3141` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:5302` | — |
| `frontierRumor:contacted` | `systems/world.js:5198` | — |
| `frontierRumor:resolved` | `systems/world.js:3158` | — |
| `fuel:changed` | `systems/economy.js:2157`, `systems/stationServices.js:422`, `systems/stationServices.js:489`, `systems/world.js:4585`, `systems/world.js:4593` | — |
| `fuel:empty` | `systems/world.js:4586` | `audio/audioSystem.js:1762`, `ui/alerts.js:371` |
| `game:exitToMenu` | `ui/screens/crucible.js:2389`, `ui/screens/crucible.js:2402`, `ui/screens/demoEnd.js:173`, `ui/screens/pause.js:845` | `audio/audioSystem.js:1943`, `main.js:248`, `systems/runSession.js:57` |
| `game:load` | `ui/input.js:308`, `ui/input.js:482`, `ui/screens/mainMenu.js:496`, `ui/screens/saveLoad.js:1046` | `save/saveSystem.js:189`, `systems/scanner.js:805`, `ui/commandBar.js:430`, `ui/promptDeck.js:709` |
| `game:loadingProgress` | `main.js:147`, `main.js:165`, `main.js:626`, `main.js:707`, `main.js:723`, `main.js:742`, `main.js:760`, `main.js:801`, `main.js:938` | `ui/loadingPresenter.js:319`, `ui/screens/newGame.js:767`, `ui/screens/saveLoad.js:768` |
| `game:new` | `main.js:408`, `ui/sandbox/sandboxSetup.js:359`, `ui/screens/crucible.js:2393`, `ui/screens/gameOver.js:301`, `ui/screens/newGame.js:845` | `audio/audioSystem.js:1938`, `audio/bombAudio.js:328`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:175`, `main.js:227`, `render/feel.js:1060`, `render/vfx.js:2193`, `save/saveSystem.js:252`, `systems/aftermathWrecks.js:902`, `systems/bombs.js:203`, `systems/cloak.js:44`, `systems/encounterDirector.js:241`, `systems/environmentalMachinery.js:131`, `systems/fields.js:355`, `systems/impulseCharges.js:230`, `systems/massSeed.js:120`, `systems/masslineSnares.js:129`, `systems/mines.js:37`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:249`, `systems/scanner.js:804`, `systems/surrenderRecovery.js:77`, `systems/survivorPod.js:410`, `systems/tetherGameplay.js:205`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/moralTrapPrompt.js:44`, `ui/priceHistory.js:146`, `ui/promptDeck.js:708` |
| `game:newGame` | `main.js:486` | `audio/audioSystem.js:1939`, `audio/bombAudio.js:329`, `core/coreSystem.js:176`, `render/shipMicroMotion.js:1120`, `render/vfx.js:2194`, `save/saveSystem.js:256`, `systems/aftermathWrecks.js:903`, `systems/bombs.js:206`, `systems/cloak.js:45`, `systems/collisionConsequences.js:62`, `systems/fieldDepletion.js:705`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:382`, `systems/survivorPod.js:409`, `systems/titles.js:399`, `systems/wingMorale.js:180`, `ui/uiRoot.js:531` |
| `game:over` | `systems/combat.js:633`, `systems/combat.js:735` | `ui/uiRoot.js:1198` |
| `game:save` | `ui/input.js:307`, `ui/input.js:480`, `ui/screens/saveLoad.js:1066` | `save/saveSystem.js:178` |
| `game:scenePrepared` | `main.js:547` | `ui/sandbox/sandboxSetup.js:383` |
| `game:startFailed` | `main.js:891` | `ui/loadingPresenter.js:330`, `ui/sandbox/sandboxSetup.js:388`, `ui/screens/newGame.js:766`, `ui/screens/saveLoad.js:774` |
| `game:started` | `main.js:635` | `audio/audioSystem.js:1944`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:177`, `save/saveSystem.js:249`, `save/saveSystem.js:263`, `systems/automation.js:559`, `systems/collisionConsequences.js:61`, `systems/combat.js:517`, `systems/economyContracts.js:167`, `systems/factions.js:202`, `systems/flight.js:79`, `systems/flightV3.js:155`, `systems/heat.js:253`, `systems/lootShards.js:517`, `systems/masslineSnares.js:130`, `systems/missions.js:1012`, `systems/onboarding.js:328`, `systems/presentationAdapters.js:183`, `systems/presentationOrchestrator.js:250`, `systems/sectorSim.js:99`, `systems/ships.js:1500`, `systems/story.js:133`, `systems/surrenderRecovery.js:78`, `systems/tetherGameplay.js:206`, `ui/alerts.js:351`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:380`, `ui/uiRoot.js:1183`, `ui/uiRoot.js:1241`, `ui/uiRoot.js:1243` |
| `gamepad:connected` | `systems/gamepad.js:441` | — |
| `gamepad:disconnected` | `systems/gamepad.js:412` | — |
| `gate:range` | `core/physics.js:986`, `core/physics.js:990` | `systems/onboarding.js:445`, `systems/presentationOrchestrator.js:173`, `ui/alerts.js:332` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:565`, `systems/story.js:488`, `systems/story.js:502`, `systems/story.js:535`, `systems/story.js:1229`, `systems/story.js:1521`, `systems/story.js:1686`, `systems/uniqueWrecks.js:1450` | `systems/ships.js:1495`, `ui/screens/codex.js:673` |
| `harasser:disengaged` | `systems/encounterDirector.js:1951` | — |
| `hazard:changed` | `systems/world.js:634` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:680`, `systems/world.js:4489` | `data/hazardLanguage.js:129`, `render/shipMicroMotion.js:1125` |
| `hazard:exit` | `systems/environmentalMachinery.js:689`, `systems/world.js:4496` | `data/hazardLanguage.js:130`, `render/shipMicroMotion.js:1126` |
| `heat:changed` | `systems/heat.js:568` | `audio/audioSystem.js:1765`, `render/vfx.js:2190`, `systems/barkDirector.js:255`, `systems/lawSecurity.js:213`, `systems/onboarding.js:410`, `ui/hud.js:3777` |
| `heat:clear` | — | `systems/heat.js:257` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:847` | `systems/missions.js:1118` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1213` | — |
| `heist:captureFork` | `systems/heistFacilities.js:1468` | `systems/missions.js:1127` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1355` | `systems/missions.js:1123` |
| `heist:launchCue` | `systems/heistFacilities.js:339` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:457`, `systems/heistFacilities.js:466`, `systems/heistFacilities.js:470`, `systems/heistFacilities.js:484` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:1867` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:1809` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:1790` | `systems/npcJobsRuntime.js:826` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:1728` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:249` |
| `hud:firstUse` | `systems/onboarding.js:582` | `ui/hud.js:1990` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:279` |
| `hud:phase` | `systems/story.js:245`, `systems/story.js:275`, `systems/story.js:278`, `systems/story.js:576` | `ui/hudMeta.js:142` |
| `hud:recallObjective` | `ui/input.js:326` | `ui/hud.js:1519` |
| `hud:slotClaim` | `ui/promptDeck.js:229` | `ui/hud.js:1882` |
| `hud:slotRelease` | `ui/promptDeck.js:230` | `ui/hud.js:1883` |
| `hud:tagFlicker` | `systems/story.js:553` | `ui/hudMeta.js:176` |
| `hull:fractured` | `systems/hullFracture.js:178` | — |
| `interdiction:triggered` | `systems/encounterScripts.js:524`, `systems/world.js:4014` | `systems/presentationOrchestrator.js:181`, `systems/sectorSim.js:105` |
| `intervention:available` | `systems/intervention.js:110` | — |
| `intervention:closed` | `systems/intervention.js:124` | — |
| `jump:arrive` | `systems/world.js:3955` | `render/feel.js:1201`, `render/shipMicroMotion.js:1130`, `save/saveSystem.js:270`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:179`, `systems/sectorSim.js:114` |
| `jump:chargeAbort` | `systems/world.js:4092`, `systems/world.js:4156`, `systems/world.js:4214` | `render/shipMicroMotion.js:1131`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:178`, `systems/routeFollower.js:324` |
| `jump:chargeStart` | `systems/world.js:4141`, `systems/world.js:4180` | `render/feel.js:1191`, `render/shipMicroMotion.js:1127`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:175`, `systems/story.js:153` |
| `jump:chargeTick` | `systems/world.js:3898` | `render/shipMicroMotion.js:1128`, `systems/presentationOrchestrator.js:176` |
| `jump:departurePreflight` | `systems/world.js:4125` | `systems/story.js:152` |
| `jump:start` | `systems/world.js:3915` | `render/feel.js:1195`, `render/shipMicroMotion.js:1129`, `systems/economy.js:896`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:177`, `systems/sectorSim.js:113` |
| `jump:unfiledConfirmed` | `systems/world.js:4198` | `systems/story.js:154` |
| `landmark:artifactRecovered` | `systems/missions.js:4085` | `systems/world.js:501` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:39` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:251` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:70` | `systems/lawSecurity.js:214` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:30` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:31` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:41` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:43`, `systems/heat.js:267`, `ui/impoundPayPrompt.js:32` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:33` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:42` |
| `law:incidentOpened` | — | `systems/traffic.js:1310` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:254`, `systems/heat.js:274` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:263` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:253` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:252` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:268` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `systems/lawSecurity.js:206` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:697`, `systems/lootShards.js:877`, `systems/stuntGrammar.js:110` | `systems/mining.js:176`, `ui/floatingText.js:196`, `ui/floatingText.js:199` |
| `loot:magnetCaptured` | `systems/lootShards.js:582` | — |
| `loot:manifestPayload` | `systems/lootShards.js:955` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:342` | `systems/factionPresence.js:403`, `systems/ships.js:1449` |
| `map:sectorCharted` | `systems/world.js:3082` | `systems/economy.js:842` |
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
| `massline:releaseValidated` | `systems/masslineThrow.js:592` | `systems/presentationOrchestrator.js:156` |
| `massline:releaseWindow` | `systems/masslineThrow.js:240` | — |
| `massline:selfSling` | `systems/masslineThrow.js:619` | `systems/flightV3.js:157`, `systems/onboarding.js:544` |
| `massline:snareArmed` | `systems/masslineSnares.js:223` | — |
| `massline:snareCaught` | `systems/masslineSnares.js:418` | — |
| `massline:snareCut` | `systems/masslineSnares.js:532` | — |
| `massline:snareDeployed` | `systems/masslineSnares.js:325` | — |
| `massline:snareEnded` | `systems/masslineSnares.js:534` | — |
| `massline:sweepImpact` | `systems/masslineImpacts.js:336` | `systems/masslineImpactDamage.js:42`, `systems/presentationOrchestrator.js:143` |
| `massline:tangentMeeting` | `systems/masslineThrow.js:752` | — |
| `massline:threat` | `systems/masslineThreats.js:216` | `systems/presentationOrchestrator.js:119` |
| `massline:throw` | `systems/masslineThrow.js:534` | `systems/missions.js:1106`, `systems/tumbleStates.js:72` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:118` | `render/feel.js:1301` |
| `massline:tumbled` | `systems/tumbleStates.js:331` | `render/feel.js:1287` |
| `mines:armed` | `systems/mines.js:135` | `render/ordnanceMotionPresentation.js:259` |
| `mines:capReached` | `systems/mines.js:53` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:147`, `systems/survivalArena.js:872` | `systems/mines.js:34` |
| `mines:placed` | `systems/mines.js:108` | `systems/survivalArena.js:698` |
| `mines:released` | `systems/mines.js:228` | — |
| `mines:triggered` | `systems/mines.js:193` | — |
| `mining:beamLocked` | `systems/mining.js:666` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:1634` | `systems/missions.js:1069`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:680` | `systems/presentationOrchestrator.js:201`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:532` | — |
| `mining:npcExtraction` | `systems/traffic.js:8474` | `systems/fieldDepletion.js:704` |
| `mining:podSplit` | `systems/mining.js:1221` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:1587` | `render/asteroidMotionPresentation.js:420`, `systems/presentationOrchestrator.js:198` |
| `mining:richCoreCompleted` | `systems/mining.js:1614` | `render/asteroidMotionPresentation.js:421`, `systems/presentationOrchestrator.js:199` |
| `mining:richCoreExposed` | `systems/mining.js:1565` | `render/asteroidMotionPresentation.js:419`, `systems/presentationOrchestrator.js:197` |
| `mining:richCoreFizzle` | `systems/mining.js:1616` | `render/asteroidMotionPresentation.js:422`, `systems/presentationOrchestrator.js:200` |
| `mining:seamHit` | `systems/mining.js:1862` | `systems/presentationOrchestrator.js:190` |
| `mining:start` | `systems/mining.js:258`, `systems/mining.js:380`, `systems/mining.js:1173` | `audio/audioSystem.js:1697`, `render/asteroidMotionPresentation.js:414`, `render/vfx.js:2203`, `systems/onboarding.js:351`, `systems/presentationOrchestrator.js:187` |
| `mining:stop` | `systems/mining.js:480` | `audio/audioSystem.js:1698`, `render/asteroidMotionPresentation.js:415`, `render/vfx.js:2204`, `systems/presentationOrchestrator.js:188` |
| `mining:tick` | `systems/automation.js:995`, `systems/mining.js:701` | `audio/audioSystem.js:1699`, `render/vfx.js:2205`, `systems/presentationOrchestrator.js:189` |
| `mining:ventBonus` | `systems/mining.js:568` | — |
| `mining:ventReady` | `systems/mining.js:513` | `systems/presentationOrchestrator.js:194` |
| `mining:yield` | `balance/careerCohorts.js:1806`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:565`, `systems/mining.js:820`, `systems/mining.js:1296`, `systems/mining.js:1611` | `careers/origins/prospectorOrigin.js:636`, `render/feel.js:1214`, `render/vfx.js:2208`, `systems/encounterDirector.js:266`, `systems/missions.js:1063`, `systems/onboarding.js:352`, `systems/presentationOrchestrator.js:195`, `ui/floatingText.js:181` |
| `miningDrone:sellOre` | — | `systems/economy.js:857` |
| `mission:accepted` | `systems/missions.js:2755` | `audio/audioSystem.js:1726`, `save/saveSystem.js:271`, `systems/aftermathWrecks.js:898`, `systems/contractClauses.js:196`, `systems/economy.js:823`, `systems/moralTrap.js:100`, `systems/onboarding.js:354`, `ui/hud.js:3757`, `ui/screens/missionLog.js:2113` |
| `mission:completed` | `systems/missions.js:6006` | `audio/audioSystem.js:1727`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:272`, `systems/aftermathWrecks.js:899`, `systems/claims.js:279`, `systems/contractClauses.js:200`, `systems/factions.js:262`, `systems/lossLedger.js:381`, `systems/onboarding.js:355`, `systems/story.js:175`, `ui/hud.js:3758`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2114` |
| `mission:conditionBroken` | `systems/contractClauses.js:306`, `systems/missions.js:1338` | — |
| `mission:conditionPending` | `systems/missions.js:1391` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:274`, `systems/missions.js:1321` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:285`, `systems/missions.js:1329` | `systems/missions.js:1148` |
| `mission:expired` | `systems/missions.js:6315` | `audio/audioSystem.js:1731`, `save/saveSystem.js:274`, `systems/aftermathWrecks.js:901`, `systems/factions.js:271`, `ui/screens/missionLog.js:2116` |
| `mission:failed` | `systems/missions.js:6269` | `audio/audioSystem.js:1730`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:273`, `systems/aftermathWrecks.js:900`, `systems/factions.js:270`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2115` |
| `mission:forceEvent` | — | `systems/economy.js:901` |
| `mission:offerBoarded` | `systems/missions.js:2106` | `systems/aftermathWrecks.js:897` |
| `mission:offered` | `systems/aftermathWrecks.js:1499`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:232`, `systems/economyContracts.js:254`, `systems/lossLedger.js:318`, `systems/postEndingReplay.js:340`, `systems/salvage.js:566`, `systems/uniqueWrecks.js:786` | `systems/economy.js:822`, `systems/lossInvestigation.js:106`, `systems/missions.js:1027`, `systems/survivorPod.js:407` |
| `mission:setPieceTransition` | `systems/missions.js:5834` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:7001` | — |
| `mission:spawnDeferred` | `systems/missions.js:6848` | — |
| `mission:updated` | `systems/contractClauses.js:279`, `systems/contractClauses.js:289`, `systems/contractClauses.js:318`, `systems/missions.js:1325`, `systems/missions.js:1333`, `systems/missions.js:1351`, `systems/missions.js:1426`, `systems/missions.js:1530`, `systems/missions.js:1631`, `systems/missions.js:1701`, `systems/missions.js:1929`, `systems/missions.js:1963`, `systems/missions.js:1975`, `systems/missions.js:2105`, `systems/missions.js:2682`, `systems/missions.js:2767`, `systems/missions.js:2916`, `systems/missions.js:3116`, `systems/missions.js:3723`, `systems/missions.js:3759`, `systems/missions.js:3772`, `systems/missions.js:3780`, `systems/missions.js:3796`, `systems/missions.js:3834`, `systems/missions.js:3885`, `systems/missions.js:3962`, `systems/missions.js:3971`, `systems/missions.js:4118`, `systems/missions.js:4144`, `systems/missions.js:4212`, `systems/missions.js:4228`, `systems/missions.js:4270`, `systems/missions.js:4291`, `systems/missions.js:4327`, `systems/missions.js:4379`, `systems/missions.js:5376`, `systems/missions.js:5531`, `systems/missions.js:5577`, `systems/missions.js:5650`, `systems/missions.js:5657`, `systems/missions.js:5995`, `systems/missions.js:6292`, `systems/missions.js:6325`, `systems/missions.js:6617`, `systems/missions.js:6825`, `systems/missions.js:6839`, `systems/missions.js:6935`, `systems/missions.js:7083`, `systems/missions.js:7345`, `systems/missions.js:7491` | `ui/hud.js:3756`, `ui/screens/missionLog.js:2112`, `ui/station/screens/contracts.js:905` |
| `mode:changed` | `main.js:251`, `main.js:868`, `main.js:878`, `main.js:889`, `save/saveSystem.js:3010`, `save/saveSystem.js:3140` | `systems/autoTargetAssist.js:96`, `systems/presentationAdapters.js:182`, `systems/scanner.js:807`, `ui/loadingPresenter.js:320`, `ui/screenManager.js:581`, `ui/uiRoot.js:762`, `ui/wingmanRadial.js:246` |
| `module:equipped` | `systems/ships.js:2064` | `systems/onboarding.js:391`, `systems/ships.js:1404`, `systems/world.js:472` |
| `module:granted` | `systems/ships.js:1869` | — |
| `module:purchased` | `systems/ships.js:1856` | — |
| `module:unequipped` | `systems/ships.js:1555`, `systems/ships.js:2083` | `systems/ships.js:1405`, `systems/world.js:473` |
| `moment:amended` | `systems/bulletTime.js:237` | — |
| `moment:holyShit` | — | `render/feel.js:1276` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:258` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | — |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:99` |
| `moralTrap:resolved` | `systems/moralTrap.js:180` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:146` | `ui/moralTrapPrompt.js:37` |
| `namedAce:appeared` | `systems/encounterScripts.js:2693` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:272` |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:404`, `systems/flightV3.js:972`, `systems/world.js:4268` | `systems/routeFollower.js:319` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:3415`, `systems/claims.js:1326`, `systems/claims.js:1334`, `systems/missions.js:1041`, `systems/missions.js:3105`, `systems/missions.js:3172`, `systems/missions.js:3204`, `systems/missions.js:3741`, `systems/world.js:4267`, `ui/market/tradeLogic.js:483` | — |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:111` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:176` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:107` | — |
| `nemesis:spare` | `ui/nemesisComms.js:67` | — |
| `news:dockCards` | `ui/marketNews.js:361` | — |
| `news:headline` | `systems/aftermathWrecks.js:745`, `systems/e1EncounterRuntime.js:225`, `systems/nemesisSignals.js:25`, `systems/traffic.js:8124`, `systems/traffic.js:9867`, `ui/marketNews.js:253` | — |
| `news:publish` | `systems/aftermathWrecks.js:763`, `systems/claims.js:1762`, `systems/claims.js:2180`, `systems/claims.js:2227`, `systems/npcJobsRuntime.js:960`, `systems/traffic.js:3157`, `systems/traffic.js:9480`, `systems/uniqueWrecks.js:373`, `systems/uniqueWrecks.js:1494`, `systems/world.js:643` | — |
| `news:render` | `ui/hud.js:1431` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1295` |
| `npcjobs:load` | — | `systems/traffic.js:1293` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:936` | — |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:929` | — |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:920` | — |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:918` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:2886` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:3731` | — |
| `npcjobs:unload` | — | `systems/traffic.js:1294` |
| `npcjobs:work` | — | `systems/traffic.js:1292` |
| `onboarding:rangePrompt` | `systems/onboarding.js:1634`, `systems/onboarding.js:2408` | — |
| `optic:contact` | `systems/weapons.js:1695` | — |
| `orrinWitness:ensureEvidence` | `systems/story.js:1063` | `systems/world.js:479` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1533` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1088` | — |
| `orrinWitness:submitted` | `systems/story.js:1116` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:5164` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:481` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:4960` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:4995` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:5124` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:5078` | `ui/recoveryEncounterPrompt.js:478` |
| `patrol:proximity` | `systems/encounterScripts.js:438` | `systems/economy.js:897` |
| `pds:intercept` | `systems/countermeasures.js:220` | — |
| `physics:attachmentBroken` | — | `combat/kernel.js:74` |
| `physics:impact` | `core/physics.js:1502` | `audio/audioSystem.js:1659`, `render/asteroidMotionPresentation.js:411`, `render/feel.js:1253`, `render/shipMicroMotion.js:1124`, `render/vfx.js:2169`, `systems/asteroidSites.js:228`, `systems/barkDirector.js:258`, `systems/collisionConsequences.js:56`, `systems/fields.js:368`, `systems/fragileCargo.js:202`, `systems/gamepad.js:322`, `systems/heistFacilities.js:248`, `systems/impulseCharges.js:224`, `systems/lootShards.js:515`, `systems/masslineImpactDamage.js:43`, `systems/ships.js:1472` |
| `pickup:collected` | `core/physics.js:1347`, `systems/mining.js:1025`, `systems/mining.js:1716`, `systems/uniqueWrecks.js:1375` | `audio/audioSystem.js:1707`, `render/vfx.js:2231`, `save/saveSystem.js:228`, `systems/economy.js:868`, `systems/encounterDirector.js:246`, `systems/lawSecurity.js:209`, `systems/mining.js:178`, `systems/onboarding.js:353`, `systems/onboarding.js:409`, `systems/presentationOrchestrator.js:202`, `systems/swarmSupply.js:107`, `systems/traffic.js:1303`, `systems/world.js:482`, `systems/world.js:483`, `ui/floatingText.js:218` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:132` | `systems/pirateParley.js:42` |
| `pirateParley:demand` | `systems/scanner.js:1190` | `ui/pirateParleyPrompt.js:160` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:161` |
| `planet:collector` | `systems/planetRuntime.js:495` | — |
| `planet:harvest` | `systems/planetRuntime.js:528` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:532` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:402`, `systems/planetRuntime.js:414` | — |
| `planet:recoveryBurn` | `systems/planetRuntime.js:480` | — |
| `planet:registered` | `systems/planetRuntime.js:190` | — |
| `planet:unregistered` | `systems/planetRuntime.js:251` | — |
| `player:death` | `systems/combat.js:632`, `systems/combat.js:734`, `systems/combat.js:909`, `systems/world.js:4570` | `audio/audioSystem.js:1695`, `render/feel.js:1146`, `render/shipMicroMotion.js:1135`, `render/vfx.js:2202`, `save/saveSystem.js:235`, `systems/aftermathWrecks.js:889`, `systems/lawSecurity.js:208`, `systems/onboarding.js:384`, `systems/onboarding.js:408`, `systems/surrenderRecovery.js:73`, `systems/survivalResults.js:382`, `systems/survivalRun.js:107`, `systems/survivorPod.js:413`, `ui/commandBar.js:405`, `ui/hud.js:2362`, `ui/survivalHud.js:216` |
| `player:recoveryFailed` | `systems/combat.js:787` | `ui/screens/gameOver.js:333` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:276` | `systems/combat.js:511` |
| `player:respawn` | `systems/combat.js:846`, `systems/combat.js:922` | `audio/audioSystem.js:1696`, `render/shipMicroMotion.js:1134`, `save/saveSystem.js:236`, `save/saveSystem.js:286`, `ui/commandBar.js:409`, `ui/hud.js:2376`, `ui/screens/gameOver.js:325` |
| `player:scannedByPatrol` | `systems/economy.js:2385` | `render/vfx.js:2189`, `systems/missions.js:1142`, `ui/customsPrompt.js:138` |
| `poi:discovered` | `systems/world.js:672`, `systems/world.js:4401`, `systems/world.js:4446`, `systems/world.js:4683`, `systems/world.js:4709` | `systems/encounterDirector.js:260`, `systems/world.js:507` |
| `poi:identified` | `systems/world.js:4453`, `systems/world.js:4710` | `systems/encounterDirector.js:261`, `systems/missions.js:1028`, `systems/world.js:508` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2135` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2134` |
| `presentation:audioCue` | `systems/presentationAdapters.js:526` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:448` | — |
| `presentation:caption` | `audio/audioSystem.js:4396`, `systems/factionPresence.js:672`, `systems/factionPresence.js:1002`, `systems/factionPresence.js:1017`, `systems/factionPresence.js:1035`, `systems/factionPresence.js:1097`, `systems/presentationAdapters.js:618`, `systems/story.js:1007`, `systems/story.js:1171` | `ui/hud.js:2425` |
| `presentation:cue` | — | `audio/audioSystem.js:1804`, `render/vfx.js:2228`, `render/vfx.js:2229`, `systems/presentationAdapters.js:179` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:430` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:351`, `systems/presentationAdapters.js:597` | — |
| `presentation:vfxCue` | `render/vfx.js:2244`, `systems/countermeasures.js:228`, `systems/fields.js:1820`, `systems/fields.js:1839`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:541`, `systems/missions.js:2780`, `systems/missions.js:6011`, `systems/planetRuntime.js:552`, `systems/presentationAdapters.js:494`, `systems/tumbleStates.js:333`, `systems/tumbleStates.js:362`, `systems/weapons.js:1255`, `systems/weapons.js:1432`, `systems/weapons.js:2336` | `render/vfx.js:2230` |
| `projectile:bank` | — | `render/vfx.js:2164` |
| `projectile:hit` | `core/physics.js:731`, `core/physics.js:884`, `systems/sectorSim.js:548` | `audio/audioSystem.js:1649`, `combat/tetherWebs.js:27`, `render/vfx.js:2163`, `systems/bombs.js:211`, `systems/combat.js:504`, `systems/missions.js:1107` |
| `projectile:nearMiss` | `core/physics.js:851` | `audio/audioSystem.js:1652`, `systems/presentationOrchestrator.js:167`, `ui/hud.js:1917` |
| `projectile:ricochet` | — | `render/vfx.js:2165` |
| `range:opened` | `ui/screens/range.js:1383` | `systems/onboarding.js:396` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:157` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:158` |
| `rescue:beat` | `systems/onboarding.js:1810`, `systems/onboarding.js:1842` | — |
| `rescue:complete` | `systems/onboarding.js:1821` | — |
| `rescue:started` | `systems/onboarding.js:1405` | `systems/onboarding.js:385` |
| `research:pointsChanged` | `systems/missions.js:3995`, `systems/missions.js:4047`, `systems/missions.js:5954`, `systems/missions.js:5962`, `systems/missions.js:7305` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2253` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1101` | `systems/encounterDirector.js:267` |
| `rhythm:phase` | `systems/encounterDirector.js:338` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:317` | — |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:98` |
| `run:awardRequested` | — | `systems/runSession.js:53` |
| `run:awarded` | — | `ui/survivalHud.js:196` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1096`, `ui/sandbox/sandboxSetup.js:1135` | `systems/runSession.js:50` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:678`, `ui/screens/crucibleDraft.js:683`, `ui/screens/crucibleDraft.js:1037` | `systems/survivalDraft.js:95` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:767` | `systems/survivalDraft.js:99` |
| `run:draftResolved` | — | `systems/survivalRun.js:101` |
| `run:endRequested` | `save/saveSystem.js:199` | `systems/runSession.js:52` |
| `run:ended` | — | `systems/survivalAnnounce.js:276`, `systems/survivalArena.js:690`, `systems/survivalDraft.js:104`, `systems/survivalResults.js:411`, `systems/survivalRun.js:95`, `systems/survivalWave.js:94`, `systems/swarmArena.js:429`, `systems/swarmChain.js:108`, `systems/swarmSupply.js:109` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:104` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:274`, `ui/survivalHud.js:197` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1157` | `systems/ships.js:1504`, `systems/survivalRun.js:96`, `systems/swarmSupply.js:102`, `systems/world.js:503` |
| `run:modifierChosen` | — | `systems/survivalRun.js:102` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:55` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1158` | `systems/survivalRun.js:97` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:1132`, `ui/screens/crucibleDraft.js:1149` | `systems/survivalDraft.js:96` |
| `run:refitClosed` | — | `systems/survivalRun.js:103` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:1470` | `systems/survivalDraft.js:97` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:1466` | `systems/survivalDraft.js:98` |
| `run:resultsReady` | — | `systems/achievements.js:785`, `ui/uiRoot.js:1219` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:103` |
| `run:spendRequested` | — | `systems/runSession.js:54` |
| `run:spent` | — | `systems/survivalDraft.js:102` |
| `run:started` | — | `systems/survivalAnnounce.js:269`, `systems/survivalResults.js:371`, `systems/survivalRun.js:93`, `ui/survivalHud.js:198`, `ui/uiRoot.js:1240` |
| `run:threatRequested` | — | `systems/runSession.js:56` |
| `run:transitionRequested` | `systems/survivalRun.js:470` | `systems/runSession.js:51` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:275`, `systems/survivalDraft.js:94`, `systems/survivalResults.js:410`, `systems/survivalRun.js:94`, `systems/survivalWave.js:93`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:273`, `systems/survivalArena.js:689`, `systems/survivalResults.js:374` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:99` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:272` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:383` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:270`, `systems/survivalArena.js:656`, `systems/survivalWave.js:91`, `systems/swarmArena.js:426`, `ui/survivalHud.js:209` |
| `run:waveProgress` | — | `ui/survivalHud.js:210` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:271`, `systems/survivalResults.js:373`, `systems/survivalWave.js:92`, `systems/swarmArena.js:427` |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:567` | `systems/encounterDirector.js:262`, `systems/story.js:198` |
| `salvage:completed` | `systems/mining.js:1301` | `render/vfx.js:2207`, `systems/aftermathWrecks.js:894`, `systems/missions.js:1067` |
| `salvage:cutComplete` | `systems/mining.js:408` | `audio/audioSystem.js:1710`, `render/vfx.js:2206` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | — |
| `salvage:npcExtraction` | `systems/traffic.js:5862` | — |
| `salvage:npcUnload` | `systems/traffic.js:9602` | `systems/economy.js:872` |
| `salvage:placed` | `systems/salvage.js:332` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:405` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:1162` | — |
| `save:completed` | `save/saveSystem.js:1168` | `ui/screens/saveLoad.js:785`, `ui/uiRoot.js:355` |
| `save:dirty` | — | `save/saveSystem.js:212` |
| `save:error` | `main.js:156`, `save/saveSystem.js:777`, `save/saveSystem.js:878`, `save/saveSystem.js:896`, `save/saveSystem.js:1172`, `save/saveSystem.js:1451`, `save/saveSystem.js:1913`, `save/saveSystem.js:2666`, `save/saveSystem.js:2674`, `save/saveSystem.js:2709`, `save/saveSystem.js:2719`, `save/saveSystem.js:2735`, `save/saveSystem.js:2802`, `save/saveSystem.js:2835`, `save/saveSystem.js:2872`, `save/saveSystem.js:2911`, `save/saveSystem.js:3163`, `save/saveSystem.js:3171`, `save/saveSystem.js:3198`, `save/saveSystem.js:3640`, `save/saveSystem.js:3653`, `save/saveSystem.js:3668`, `save/saveSystem.js:3681`, `ui/screens/saveLoad.js:1119` | `systems/aftermathWrecks.js:906`, `systems/asteroidSites.js:227`, `systems/automation.js:554`, `systems/encounterDirector.js:238`, `ui/loadingPresenter.js:331`, `ui/screenManager.js:582`, `ui/uiRoot.js:381` |
| `save:exportRecovery` | `save/saveSystem.js:3629` | — |
| `save:loaded` | `save/saveSystem.js:3143` | `audio/audioSystem.js:1929`, `audio/bombAudio.js:330`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:171`, `core/physics.js:110`, `main.js:212`, `render/feel.js:1062`, `render/shipMicroMotion.js:1119`, `render/vfx.js:2196`, `save/saveSystem.js:248`, `save/saveSystem.js:264`, `systems/aftermathWrecks.js:905`, `systems/asteroidFormations.js:122`, `systems/asteroidSites.js:218`, `systems/autoTargetAssist.js:111`, `systems/automation.js:549`, `systems/barkDirector.js:240`, `systems/beacons.js:45`, `systems/bombs.js:210`, `systems/collisionConsequences.js:60`, `systems/combat.js:518`, `systems/economy.js:905`, `systems/encounterDirector.js:237`, `systems/environmentalMachinery.js:133`, `systems/factionPresence.js:409`, `systems/fields.js:356`, `systems/flight.js:75`, `systems/flightV3.js:148`, `systems/gateControlDirector.js:71`, `systems/heat.js:254`, `systems/heistFacilities.js:252`, `systems/impulseCharges.js:231`, `systems/lawSecurity.js:205`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:131`, `systems/mines.js:38`, `systems/missions.js:1014`, `systems/npcJobsRuntime.js:780`, `systems/npcJobsRuntime.js:788`, `systems/onboarding.js:332`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:186`, `systems/presentationOrchestrator.js:251`, `systems/routeFollower.js:336`, `systems/runSession.js:61`, `systems/sectorSim.js:98`, `systems/ships.js:1409`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:96`, `systems/story.js:134`, `systems/survivalArena.js:704`, `systems/survivorPod.js:411`, `systems/tetherGameplay.js:204`, `systems/titles.js:398`, `systems/traffic.js:1318`, `systems/travelLanes.js:483`, `systems/uniqueLootAbilities.js:136`, `systems/world.js:488`, `ui/alerts.js:352`, `ui/automationPayoff.js:76`, `ui/bandHud.js:90`, `ui/capitalBossOverlayMount.js:86`, `ui/hudLayout.js:120`, `ui/moralTrapPrompt.js:43`, `ui/priceHistory.js:147`, `ui/uiRoot.js:362`, `ui/uiRoot.js:1244` |
| `save:recovered` | `save/saveSystem.js:2698` | `ui/uiRoot.js:374` |
| `save:restoring` | `save/saveSystem.js:2933` | `core/coreSystem.js:168`, `render/feel.js:1061`, `render/vfx.js:2195`, `systems/aftermathWrecks.js:904`, `systems/asteroidSites.js:210`, `systems/autoTargetAssist.js:108`, `systems/automation.js:543`, `systems/encounterDirector.js:230`, `systems/environmentalMachinery.js:132`, `systems/lawSecurity.js:204`, `systems/missions.js:1018`, `systems/npcJobsRuntime.js:781`, `systems/runSession.js:60`, `systems/salvage.js:78`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:74`, `systems/traffic.js:1311`, `systems/world.js:484` |
| `save:started` | `save/saveSystem.js:881`, `save/saveSystem.js:1505` | `ui/screenManager.js:589`, `ui/uiRoot.js:351` |
| `scan:completed` | `balance/careerCohorts.js:478`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:934`, `systems/world.js:4405` | `careers/origins/prospectorOrigin.js:633`, `systems/missions.js:1078`, `systems/onboarding.js:365`, `systems/presentationOrchestrator.js:183`, `systems/salvage.js:75`, `systems/salvageActions.js:70`, `systems/story.js:189`, `ui/hud.js:4207` |
| `scan:pulse` | `systems/scanner.js:872` | `render/shipMicroMotion.js:1144`, `systems/buildIdentity.js:277`, `systems/encounterDirector.js:252`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:182`, `systems/scanReveal.js:15`, `ui/hud.js:4208` |
| `scan:shipRevealed` | `systems/scanReveal.js:38` | `systems/buildIdentity.js:276` |
| `scan:weakPoint` | `systems/scanner.js:923` | `ui/hud.js:1476` |
| `scanner:ghostEscaped` | `systems/scanner.js:852` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:902` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:89` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:248` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:510`, `ui/comms.js:514` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:771` | `systems/presentationOrchestrator.js:180` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:784` | `audio/audioSystem.js:1777`, `audio/bombAudio.js:327`, `render/shipMicroMotion.js:1118`, `render/vfx.js:2191`, `save/saveSystem.js:269`, `systems/aftermathWrecks.js:892`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:203`, `systems/automation.js:579`, `systems/bombs.js:202`, `systems/claims.js:274`, `systems/claims.js:276`, `systems/economy.js:890`, `systems/encounterDirector.js:226`, `systems/factionPresence.js:400`, `systems/fields.js:354`, `systems/heistFacilities.js:245`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:128`, `systems/mines.js:36`, `systems/mining.js:181`, `systems/missions.js:1159`, `systems/moralTrap.js:98`, `systems/npcJobsRuntime.js:769`, `systems/presentationOrchestrator.js:221`, `systems/routeFollower.js:328`, `systems/salvage.js:71`, `systems/sectorSim.js:95`, `systems/story.js:151`, `systems/story.js:188`, `systems/survivalArena.js:702`, `systems/survivorPod.js:406`, `systems/tetherGameplay.js:208`, `systems/traffic.js:1281`, `systems/wingmen.js:48`, `ui/causeLedger.js:161`, `ui/commandBar.js:415`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:150`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:714` | `audio/bombAudio.js:326`, `render/vfx.js:2192`, `systems/aftermathWrecks.js:893`, `systems/asteroidSites.js:209`, `systems/automation.js:568`, `systems/bombs.js:201`, `systems/encounterDirector.js:228`, `systems/environmentalMachinery.js:130`, `systems/factionPresence.js:401`, `systems/fields.js:353`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:246`, `systems/impulseCharges.js:232`, `systems/lawSecurity.js:203`, `systems/massSeed.js:118`, `systems/masslineSnares.js:127`, `systems/mines.js:35`, `systems/missions.js:1160`, `systems/npcJobsRuntime.js:768`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:50`, `systems/stationServices.js:207`, `systems/stationSideEventDirector.js:95`, `systems/surrenderRecovery.js:72`, `systems/survivalArena.js:703`, `systems/tetherGameplay.js:207`, `systems/traffic.js:1284`, `systems/wingmen.js:51`, `ui/customsPrompt.js:140`, `ui/impoundPayPrompt.js:34`, `ui/promptDeck.js:707` |
| `sectorsim:embodiment` | `systems/sectorSim.js:801` | `systems/world.js:516` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:318` | `ui/screens/starmap.js:823` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1549`, `systems/claims.js:1289`, `systems/encounterDirector.js:1702`, `systems/mining.js:1814` | `systems/sectorSim.js:103` |
| `sectorsim:intel` | `systems/sectorSim.js:855` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:639` | `systems/economy.js:909` |
| `sectorsim:reconcile` | `systems/sectorSim.js:596` | — |
| `sectorsim:tick` | `systems/sectorSim.js:263` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:559` | `ui/screens/starmap.js:824` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:543` | — |
| `service:aborted` | `systems/stationServices.js:256` | — |
| `service:completed` | `systems/economy.js:2215`, `systems/economy.js:2247`, `systems/economy.js:2293`, `systems/stationServices.js:475`, `systems/stationServices.js:491` | `systems/ships.js:1476` |
| `service:progress` | `systems/stationServices.js:417` | — |
| `service:queued` | `systems/stationServices.js:324` | — |
| `service:started` | `systems/stationServices.js:406` | — |
| `settings:changed` | `save/saveSystem.js:3179`, `save/saveSystem.js:3180`, `systems/touch.js:509`, `ui/screens/motionAsk.js:95`, `ui/screens/pause.js:461`, `ui/screens/pause.js:469`, `ui/screens/pause.js:547`, `ui/screens/settings.js:345`, `ui/screens/settings.js:704`, `ui/screens/settings.js:777` | `audio/audioSystem.js:1869`, `main.js:211`, `render/vfx.js:2198`, `save/saveSystem.js:206`, `ui/uiRoot.js:656` |
| `ship:appearanceChanged` | `systems/ships.js:1753`, `systems/ships.js:1988`, `systems/traffic.js:2695` | `core/coreSystem.js:167`, `render/vfx.js:2186` |
| `ship:appearanceSaved` | `systems/ships.js:1990` | — |
| `ship:boostPreKick` | `systems/flightV3.js:396` | `render/feel.js:1173` |
| `ship:boostStart` | `systems/flight.js:106`, `systems/flightV3.js:199` | `audio/audioSystem.js:1784`, `render/vfx.js:2214`, `systems/cruise.js:58`, `systems/onboarding.js:397` |
| `ship:boostStop` | `systems/flight.js:107`, `systems/flight.js:220`, `systems/flightV3.js:200`, `systems/flightV3.js:488` | `audio/audioSystem.js:1789`, `render/vfx.js:2215` |
| `ship:cargoCapChanged` | `systems/ships.js:1748` | — |
| `ship:dash` | `systems/flight.js:197`, `systems/flightV3.js:467` | `audio/audioSystem.js:1790`, `render/vfx.js:2216`, `systems/uniqueLootAbilities.js:134` |
| `ship:deathFlash` | `render/shipMicroMotion.js:1956` | `render/vfx.js:2235` |
| `ship:deathPop` | `render/shipMicroMotion.js:926`, `render/shipMicroMotion.js:1946` | `render/vfx.js:2234` |
| `ship:livingHullChanged` | `systems/ships.js:1577`, `systems/ships.js:1629`, `systems/story.js:1637` | `systems/barkDirector.js:243` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2219` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2192` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2151` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2130` | — |
| `ship:massChanged` | `systems/ships.js:1885` | `ui/hud.js:3755` |
| `ship:purchased` | `systems/ships.js:1921` | `audio/audioSystem.js:1769`, `systems/missions.js:1163` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:975`, `render/shipMicroMotion.js:1933` | `render/vfx.js:2233` |
| `ship:roleContext` | `systems/ships.js:1687` | `systems/presentationAdapters.js:181` |
| `ship:sold` | `systems/ships.js:1942` | — |
| `ship:statsChanged` | `systems/ships.js:1747` | `systems/world.js:474`, `ui/commandBar.js:410`, `ui/hud.js:3751` |
| `ship:swingDash` | `systems/flightV3.js:468` | `render/shipMicroMotion.js:1138` |
| `ship:thrust` | `systems/flight.js:423`, `systems/flightV3.js:1462` | `render/vfx.js:2213` |
| `signal:investigate` | — | `systems/scanner.js:800` |
| `signal:investigated` | `systems/scanner.js:1406` | `systems/missions.js:1092`, `systems/presentationOrchestrator.js:186`, `systems/story.js:136`, `systems/world.js:477`, `ui/signalInvestigationPrompt.js:153` |
| `signal:investigating` | `systems/scanner.js:1149` | `ui/signalInvestigationPrompt.js:152` |
| `signal:receipt` | `systems/scanner.js:1407` | — |
| `signal:scanResults` | `systems/scanner.js:935` | `systems/missions.js:1079`, `systems/presentationOrchestrator.js:184`, `ui/signalInvestigationPrompt.js:150` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:801` |
| `signal:track` | — | `systems/scanner.js:799` |
| `signal:tracked` | `systems/scanner.js:1166` | `systems/presentationOrchestrator.js:185`, `ui/signalInvestigationPrompt.js:151` |
| `sim:pause` | `ui/screenManager.js:406` | `audio/audioSystem.js:1885`, `audio/bombAudio.js:333`, `render/feel.js:1059` |
| `sim:resume` | `ui/screenManager.js:413` | `audio/audioSystem.js:1886` |
| `site:anchored` | `systems/asteroidSites.js:917` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1849` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1764` | `audio/audioSystem.js:1907` |
| `site:courierLost` | `systems/asteroidSites.js:1837` | — |
| `site:created` | `systems/asteroidSites.js:855` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1212`, `systems/asteroidSites.js:1296` | — |
| `site:lost` | `systems/asteroidSites.js:1409` | `ui/alerts.js:342` |
| `site:machineInstalled` | `systems/asteroidSites.js:886` | `audio/audioSystem.js:1906`, `ui/alerts.js:341` |
| `site:machineMode` | `systems/asteroidSites.js:1318` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1229` | — |
| `site:machineStatus` | `systems/asteroidSites.js:1705` | `audio/audioSystem.js:1911`, `ui/alerts.js:337` |
| `site:overlayChanged` | `systems/asteroidSites.js:1302` | — |
| `site:podBuilt` | `systems/asteroidSites.js:1653` | — |
| `site:producing` | `systems/asteroidSites.js:1096` | `ui/asteroid/asteroidScreen.js:1670` |
| `site:rematerialized` | `systems/asteroidSites.js:1455` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1014` | `ui/asteroid/asteroidScreen.js:1655` |
| `site:surveyComplete` | `systems/asteroidSites.js:957` | `ui/asteroid/asteroidScreen.js:1649` |
| `site:surveyDetected` | `systems/asteroidSites.js:947` | `ui/asteroid/asteroidScreen.js:1642` |
| `spawn:request` | `systems/automation.js:1492` | `systems/world.js:502` |
| `station:berthAssigned` | `systems/stationServices.js:386` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:226` | — |
| `station:exitRequest` | `ui/screenManager.js:546`, `ui/uiRoot.js:1119` | `ui/station/stationApp.js:1261` |
| `station:holding` | `systems/stationServices.js:390` | — |
| `station:moduleGained` | `systems/claims.js:1755` | `systems/factions.js:290` |
| `station:navigate` | `ui/screens/automationPanel.js:1038`, `ui/station/screens/bar.js:583`, `ui/station/screens/bar.js:588`, `ui/station/screens/industry.js:286` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:255` | `render/vfx.js:2212` |
| `station:throughput` | `systems/claims.js:1725` | — |
| `station:yardChanged` | `systems/stationServices.js:544` | — |
| `stationContact:changed` | `systems/stationContacts.js:297`, `systems/stationContacts.js:333`, `systems/stationContacts.js:415`, `systems/stationContacts.js:439` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:240`, `systems/stationContacts.js:456` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:321` | — |
| `story:beatAdvanced` | `systems/missions.js:7331` | `save/saveSystem.js:276`, `systems/story.js:129`, `ui/screens/codex.js:671` |
| `story:elroyResolved` | `systems/missions.js:4416` | `systems/story.js:130` |
| `story:kurtzLedger` | `systems/story.js:1452`, `systems/story.js:1463` | — |
| `story:newGamePlusStarted` | `systems/story.js:1560` | `systems/titles.js:402`, `ui/hudMeta.js:104` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1528` | — |
| `story:postEndingContinuity` | `systems/story.js:1352` | — |
| `story:postEndingProgress` | `systems/story.js:1322` | `ui/screens/missionLog.js:2132` |
| `story:replayHookUnlocked` | `systems/story.js:1337` | `ui/screens/missionLog.js:2133` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:247` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:246` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1150` | — |
| `story:vergeObserversRevealed` | `systems/story.js:1006` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1170` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:190` | — |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:179` | — |
| `stunt:salvageRights` | `systems/stuntGrammar.js:104` | — |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:126` | — |
| `stunt:styleBanked` | `systems/stuntGrammar.js:91` | — |
| `stunt:trickAmended` | — | `systems/bulletTime.js:131`, `systems/survivalResults.js:377`, `systems/titles.js:401` |
| `stunt:trickDetected` | — | `systems/bulletTime.js:130`, `systems/survivalResults.js:376`, `systems/titles.js:400`, `ui/toasts.js:350` |
| `surrender:secured` | — | `systems/traffic.js:1300` |
| `surrender:tethered` | — | `systems/traffic.js:1299` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:841` | — |
| `survivorPod:choose` | — | `systems/survivorPod.js:408` |
| `survivorPod:delivered` | `systems/traffic.js:5198` | — |
| `survivorPod:ejected` | `systems/survivorPod.js:556`, `systems/survivorPod.js:656` | `systems/lawSecurity.js:202` |
| `survivorPod:promoted` | `systems/survivorPod.js:888` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:982` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:994` | — |
| `survivorPod:rescued` | — | `systems/traffic.js:1305` |
| `survivorPod:resolved` | `systems/survivorPod.js:822` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1033` | — |
| `swarm:chain` | — | `systems/survivalResults.js:386`, `ui/survivalHud.js:211` |
| `swarm:chainBest` | — | `systems/survivalResults.js:399` |
| `swarm:chainBroken` | — | `ui/survivalHud.js:212` |
| `tech:researched` | `systems/ships.js:1790` | `audio/audioSystem.js:1768`, `systems/onboarding.js:487`, `systems/ships.js:1406` |
| `tether:attached` | `combat/attachments.js:365` | `audio/audioSystem.js:1828`, `render/vfx.js:2157`, `systems/encounterDirector.js:257`, `systems/presentationOrchestrator.js:90`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:324`, `systems/tetherGameplay.js:1124` | `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1146`, `systems/onboarding.js:363`, `systems/onboarding.js:379`, `systems/surrenderRecovery.js:69` |
| `tether:broken` | `combat/attachments.js:483` | `audio/audioSystem.js:1819`, `render/feel.js:1226`, `render/vfx.js:2160`, `systems/presentationOrchestrator.js:98`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:209` |
| `tether:cut` | `systems/tetherGameplay.js:1711` | `systems/masslineThrow.js:121`, `systems/onboarding.js:378`, `systems/onboarding.js:405` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1704` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:549`, `systems/tetherGameplay.js:254`, `systems/tetherGameplay.js:414`, `systems/tetherGameplay.js:457`, `systems/tetherGameplay.js:462`, `systems/tetherGameplay.js:472`, `systems/tetherGameplay.js:490`, `systems/tetherGameplay.js:837` | `systems/onboarding.js:523`, `testing/lab/proofSixtySeconds.js:953`, `ui/masslineHud.js:687` |
| `tether:latched` | `systems/tetherGameplay.js:510` | `careers/origins/prospectorOrigin.js:642`, `systems/flightV3.js:156`, `systems/lawSecurity.js:210`, `systems/missions.js:1103`, `systems/missions.js:1129`, `systems/onboarding.js:358`, `systems/onboarding.js:375`, `systems/onboarding.js:395`, `systems/onboarding.js:403`, `systems/onboarding.js:535`, `systems/onboarding.js:538`, `systems/surrenderRecovery.js:66`, `systems/survivorPod.js:414`, `testing/lab/proofSixtySeconds.js:954`, `ui/masslineHud.js:701`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1403` | — |
| `tether:nearBreak` | `combat/attachments.js:825` | `audio/audioSystem.js:1840`, `systems/onboarding.js:364`, `systems/presentationOrchestrator.js:91` |
| `tether:rebound` | `combat/attachments.js:761` | — |
| `tether:reel` | `combat/attachments.js:417` | `audio/audioSystem.js:1817`, `systems/missions.js:1099`, `systems/onboarding.js:361`, `systems/onboarding.js:376`, `systems/surrenderRecovery.js:67` |
| `tether:reelPump` | `systems/masslineTelemetry.js:251` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:325`, `systems/tetherGameplay.js:1122`, `systems/tetherGameplay.js:1125`, `systems/tetherGameplay.js:1713` | `audio/audioSystem.js:1818`, `render/feel.js:1279`, `render/vfx.js:2159`, `systems/missions.js:1104`, `systems/presentationOrchestrator.js:155` |
| `tether:released` | `systems/tetherGameplay.js:1119`, `systems/tetherGameplay.js:1712` | `render/shipMicroMotion.js:1145`, `render/vfx.js:2158`, `systems/barkDirector.js:256`, `systems/onboarding.js:362`, `systems/onboarding.js:377`, `systems/onboarding.js:404`, `systems/surrenderRecovery.js:68` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:329` | — |
| `tether:strain` | `systems/tetherGameplay.js:1457` | `audio/audioSystem.js:1833` |
| `tether:whipImpact` | `systems/masslineImpacts.js:308` | `render/feel.js:1304`, `systems/collisionConsequences.js:57`, `systems/combat.js:505`, `systems/masslineImpactDamage.js:41`, `systems/missions.js:1105`, `systems/onboarding.js:380`, `systems/onboarding.js:406`, `systems/presentationOrchestrator.js:131`, `systems/tumbleStates.js:71` |
| `tether:whipSnap` | `systems/tetherGameplay.js:1746` | — |
| `title:holdResolved` | — | `systems/titles.js:394` |
| `touch:uiAction` | `systems/touch.js:457` | `ui/input.js:743` |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:1705` |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:3156` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:9749` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:8362` | — |
| `traffic:spillNoticed` | `systems/traffic.js:5560` | — |
| `tutorial:finished` | `systems/onboarding.js:1073` | `systems/achievements.js:789`, `systems/missions.js:1013`, `systems/presentationAdapters.js:184`, `systems/story.js:138` |
| `tutorial:say` | `systems/onboarding.js:771` | `audio/audioSystem.js:1846`, `systems/story.js:144` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2034` | `systems/missions.js:1022` |
| `ui:acceptMission` | `ui/adventureDecisions.js:396`, `ui/station/screens/bar.js:520`, `ui/station/screens/contracts.js:867` | `systems/missions.js:1021` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:2888` | `systems/ships.js:1443` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:835` |
| `ui:buyModule` | `ui/station/screens/shipworks.js:3256` | `systems/onboarding.js:482`, `systems/ships.js:1436` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:3188` | `systems/bombs.js:212` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:2999` | `systems/ships.js:1434` |
| `ui:cancel` | `ui/input.js:990`, `ui/input.js:1004` | — |
| `ui:clearTarget` | `ui/input.js:385` | `ui/uiRoot.js:985` |
| `ui:closeAll` | `main.js:811`, `ui/screens/crucible.js:2390`, `ui/screens/crucible.js:2403` | `ui/uiRoot.js:983` |
| `ui:closeCargo` | `ui/input.js:234`, `ui/input.js:347` | `ui/hud.js:3725` |
| `ui:closeComms` | `ui/input.js:342` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:977` |
| `ui:confirm` | `ui/input.js:998` | `audio/audioSystem.js:1923` |
| `ui:cycleComponent` | `ui/targetPanel.js:435`, `ui/targetPanel.js:439` | `ui/uiRoot.js:989` |
| `ui:cycleTarget` | `ui/input.js:381`, `ui/input.js:1068` | `ui/uiRoot.js:984` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:2919` | `systems/ships.js:1444` |
| `ui:endgameChoose` | `systems/missions.js:2691`, `ui/station/barContacts.js:735` | `systems/story.js:157` |
| `ui:endgameConfirm` | — | `systems/story.js:158` |
| `ui:endgameDecline` | `ui/comms.js:441` | `systems/story.js:159` |
| `ui:endgameDepartAshfall` | `ui/comms.js:458` | `systems/story.js:168` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1884` | `systems/story.js:165` |
| `ui:endgameStayAshfall` | `ui/comms.js:459` | `systems/story.js:169` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:1888` | `systems/story.js:166` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:167` |
| `ui:endingArchiveOpen` | — | `systems/story.js:161` |
| `ui:entityRoute` | `ui/entityLinks.js:197` | — |
| `ui:factionPresenceService` | — | `systems/factionPresence.js:407` |
| `ui:fitModule` | `ui/station/screens/shipworks.js:3264` | `systems/onboarding.js:479`, `systems/ships.js:1437` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:3198` | `systems/bombs.js:213` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1085` | `systems/automation.js:535`, `systems/wingmen.js:59` |
| `ui:globalFind` | `ui/input.js:272`, `ui/input.js:334` | `ui/globalFind.js:162` |
| `ui:heliosBay7Scan` | — | `systems/story.js:192` |
| `ui:kurtzInteract` | — | `systems/story.js:191` |
| `ui:navigate` | `ui/input.js:978`, `ui/input.js:982`, `ui/input.js:1046` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2498`, `ui/screens/achievements.js:126`, `ui/screens/automationPanel.js:517`, `ui/screens/credits.js:112`, `ui/screens/crucible.js:1368`, `ui/screens/crucibleDraft.js:1131`, `ui/screens/demoEnd.js:152`, `ui/screens/starmap.js:639`, `ui/screens/techTree.js:657` | `ui/uiRoot.js:973` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:504` | `systems/world.js:505` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:574` | `systems/world.js:504` |
| `ui:pushScreen` | `main.js:373`, `systems/onboarding.js:613`, `systems/story.js:1130`, `ui/mapAuthority.js:133`, `ui/screens/crucible.js:2404`, `ui/screens/crucibleDraft.js:687`, `ui/screens/gameOver.js:287`, `ui/screens/starmap.js:647`, `ui/signalInvestigationPrompt.js:146`, `ui/station/barContacts.js:462`, `ui/station/screens/bar.js:537`, `ui/station/stationApp.js:505` | `ui/uiRoot.js:950` |
| `ui:replaceScreen` | `ui/screens/crucible.js:2358`, `ui/screens/crucible.js:2381`, `ui/screens/demoEnd.js:180`, `ui/screens/motionAsk.js:105` | `ui/uiRoot.js:982` |
| `ui:restockBombRack` | `ui/station/screens/shipworks.js:2979` | `systems/bombs.js:216` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:2860` | `systems/ships.js:1442` |
| `ui:screenTop` | `ui/screenManager.js:258` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `systems/economy.js:836` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:3208` | `systems/bombs.js:215` |
| `ui:service` | `balance/careerCohorts.js:700`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/adventureDecisions.js:427`, `ui/station/stationApp.js:881`, `ui/station/stationApp.js:917` | `systems/economy.js:893` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:3004`, `ui/station/screens/shipworks.js:3099` | `systems/ships.js:1435` |
| `ui:setCourse` | `systems/factionPresence.js:1028`, `systems/missions.js:3192`, `systems/scanner.js:1165`, `ui/galaxyMap.js:2156`, `ui/galaxyMap.js:2168`, `ui/galaxyMap.js:6888`, `ui/market/tradeLogic.js:485`, `ui/screens/footprint.js:1239`, `ui/screens/footprint.js:1250`, `ui/screens/localmap.js:993`, `ui/screens/starmap.js:1523`, `ui/screens/starmap.js:1536`, `ui/screens/starmap.js:1540` | `systems/world.js:470` |
| `ui:setShipAppearance` | — | `systems/ships.js:1446` |
| `ui:talkContact` | — | `systems/story.js:193` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:46`, `combat/autoTargetMode.js:210` | `ui/uiRoot.js:990` |
| `ui:toggleCargo` | `ui/input.js:448` | `ui/hud.js:3724` |
| `ui:toggleComms` | `ui/input.js:465` | — |
| `ui:toggleOverview` | `ui/input.js:452` | `ui/hud.js:4217` |
| `ui:trackMission` | `ui/galaxyMap.js:3910`, `ui/screens/missionLog.js:1880`, `ui/screens/missionLog.js:1952`, `ui/screens/missionLog.js:2013`, `ui/station/screens/contracts.js:899` | `systems/missions.js:1023` |
| `ui:undock` | — | `ui/input.js:742` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:3274` | `systems/ships.js:1438` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:3218` | `systems/bombs.js:214` |
| `ui:unlockTech` | `ui/screens/techTree.js:1283` | `systems/ships.js:1445` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:2988` | `systems/bombs.js:217` |
| `ui:wingOrder` | `ui/wingmanRadial.js:182` | `systems/automation.js:536` |
| `ui:wingmanRadial` | `ui/input.js:458` | `ui/wingmanRadial.js:244` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:337` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:287` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:222` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1256` | `systems/missions.js:1152`, `ui/discoveryPlate.js:139` |
| `uniqueWreck:choose` | `systems/missions.js:4162`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:675` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:693`, `systems/uniqueWrecks.js:850`, `systems/uniqueWrecks.js:1053` | `systems/missions.js:1153` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1316` | `systems/missions.js:1155`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:912` | `systems/missions.js:1154` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:942` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:442`, `systems/uniqueWrecks.js:852` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1492` | `systems/missions.js:1156`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `ui/station/screens/bar.js:554` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:549` | `systems/missions.js:1151` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1493` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1235` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1423` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:1089`, `ui/bandHud.js:87` |
| `verb:used` | `systems/onboarding.js:2516` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:4924` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:480` |
| `vestaOreCache:clueRecovered` | `systems/world.js:4745` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:4776` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:4887` | — |
| `vestaOreCache:resolved` | `systems/world.js:4844` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:369`, `ui/voiceArbiter.js:413` | `ui/alerts.js:322` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:324` |
| `voice:say` | `systems/achievements.js:652`, `systems/survivalAnnounce.js:326`, `ui/alerts.js:221` | `ui/voiceArbiter.js:323` |
| `voice:surface` | `ui/voiceArbiter.js:374`, `ui/voiceArbiter.js:423` | `systems/barkDirector.js:244`, `ui/alerts.js:321` |
| `watch:changed` | `ui/entityLinks.js:237` | `ui/watchlistHud.js:69` |
| `weapons:inertialShunt` | `systems/weapons.js:257` | — |
| `weapons:mineArmed` | `systems/weapons.js:1296` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1253` | — |
| `weapons:mineDetonated` | `systems/weapons.js:1426` | — |
| `weapons:mineExpired` | `systems/weapons.js:1290` | `systems/presentationOrchestrator.js:243` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:237` | — |
| `weapons:momentumSinkReleased` | `systems/weapons.js:953` | — |
| `weapons:vent` | `systems/weapons.js:473`, `systems/weapons.js:493` | `audio/audioSystem.js:1747`, `render/shipMicroMotion.js:1122`, `render/vfx.js:2211`, `systems/ships.js:1490`, `ui/hud.js:3798` |
| `web:linked` | `combat/tetherWebs.js:95` | — |
| `well:capture` | `systems/fields.js:1711` | — |
| `well:fling` | `systems/fields.js:1645` | — |
| `well:grind` | `systems/fields.js:1412` | `systems/impulseCharges.js:225` |
| `wingMorale:broken` | `systems/wingMorale.js:257` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:342` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:369` | — |
| `wingOrder:accepted` | `systems/automation.js:1978` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1979` | — |
| `wingOrder:converted` | `systems/wingmen.js:310` | — |
| `wingOrder:status` | `systems/automation.js:1980` | — |
| `world:abortJumpCharge` | `systems/story.js:779`, `ui/comms.js:450` | `systems/world.js:467` |
| `world:confirmUnfiledJump` | `systems/story.js:167` | `systems/world.js:466` |
| `world:criticalSpawnDeferred` | `systems/world.js:1404`, `systems/world.js:2873` | — |
| `world:farActorRestored` | `world/farActorTable.js:578` | `systems/npcJobsRuntime.js:771`, `systems/traffic.js:1288` |
| `world:farActorShelved` | `world/farActorTable.js:556` | `systems/npcJobsRuntime.js:770`, `systems/traffic.js:1287` |
| `world:membership` | `systems/world.js:777` | `systems/presentationOrchestrator.js:174` |
| `world:originShift` | `systems/world.js:3847` | — |
| `world:playerRelocated` | `systems/world.js:3019` | `render/vfx.js:2197` |
| `world:requestJump` | `systems/story.js:763`, `ui/galaxyMap.js:2154`, `ui/screens/starmap.js:1535` | `systems/world.js:464` |
| `world:requestRoute` | `ui/galaxyMap.js:2166`, `ui/galaxyMap.js:3927`, `ui/galaxyMap.js:6886`, `ui/screens/starmap.js:1522`, `ui/screens/starmap.js:1539` | `systems/world.js:468` |
| `world:requestSectorScan` | `ui/galaxyMap.js:5663` | `systems/world.js:469` |
| `world:requestUnfiledJump` | `systems/story.js:731` | `systems/world.js:465` |
| `world:residency` | `systems/world.js:921`, `systems/world.js:954`, `systems/world.js:1585` | — |
| `world:spawnLimited` | `systems/world.js:2809` | — |
| `world:zoneEntered` | `systems/world.js:3874` | `data/hazardLanguage.js:131` |
| `world:zoneExited` | `systems/world.js:3877` | `data/hazardLanguage.js:132` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:543` | `systems/presentationOrchestrator.js:254` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:497` | `systems/presentationOrchestrator.js:255`, `systems/traffic.js:1366` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:2225` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1087` | — |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1130` | — |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:1972` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:2153` | `systems/npcJobsRuntime.js:801` |
| `wreckField:source` | `systems/factionPresence.js:604`, `systems/salvage.js:351`, `systems/uniqueWrecks.js:1152` | `systems/aftermathWrecks.js:891` |

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
- `run:started` — 5 subscriber(s)
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
- `stunt:trickAmended` — 3 subscriber(s)
- `stunt:trickDetected` — 4 subscriber(s)
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
- `fields:clusterDetonate` — 1 emitter(s)
- `fields:coneToggled` — 4 emitter(s)
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
- `news:publish` — 10 emitter(s)
- `news:render` — 1 emitter(s)
- `npcjobs:loadEmpty` — 1 emitter(s)
- `npcjobs:lotClaimed` — 1 emitter(s)
- `npcjobs:lotPosted` — 1 emitter(s)
- `npcjobs:lotReplaced` — 1 emitter(s)
- `npcjobs:minerRelocated` — 1 emitter(s)
- `npcjobs:resumed` — 1 emitter(s)
- `onboarding:rangePrompt` — 2 emitter(s)
- `optic:contact` — 1 emitter(s)
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
- `stunt:styleBanked` — 1 emitter(s)
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
