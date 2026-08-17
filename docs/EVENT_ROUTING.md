# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-08-17 · 905 events · 2932 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:playerKilled` | `combat/playerDefeat.js:527` | — |
| `aceMemory:rewardUnlocked` | — | `ui/screens/codex.js:506` |
| `aceMemory:transition` | — | `systems/encounterDirector.js:267`, `ui/screens/codex.js:505` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:386` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:829` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:1362` | — |
| `aftermathWreck:cooled` | `systems/aftermathWrecks.js:966` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:414` | — |
| `aftermathWreck:scavenged` | `systems/aftermathWrecks.js:1210` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:876` | `systems/anomalyRuntime.js:409` |
| `ai:counterTether` | `ai/sg03ActionPort.js:384` | `render/vfx.js:2190`, `systems/presentationOrchestrator.js:151` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:166` | `audio/audioSystem.js:857`, `render/vfx.js:2192`, `systems/fields.js:169`, `systems/presentationOrchestrator.js:152` |
| `ai:encounterCommand` | `systems/aiPorts.js:233` | — |
| `ai:flee` | `systems/ai.js:235`, `systems/encounterScripts.js:918`, `systems/tacticalAI.js:155`, `systems/wingMorale.js:290` | `render/vfx.js:2196`, `systems/barkDirector.js:40`, `systems/combatOutcome.js:104`, `systems/encounterDirector.js:254`, `systems/presentationOrchestrator.js:153` |
| `ai:formationBroken` | `systems/ai.js:404`, `systems/wingMorale.js:251` | `render/vfx.js:2197` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:41` |
| `ai:skitterNest` | `systems/aiPorts.js:953` | — |
| `ai:skitterSpring` | `systems/aiPorts.js:922` | — |
| `ai:stateChange` | `systems/ai.js:232` | — |
| `ai:telegraph` | `systems/ai.js:300`, `systems/encounterScripts.js:152`, `systems/encounterScripts.js:1338`, `systems/masslineSnares.js:319`, `systems/mines.js:107`, `systems/tacticalAI.js:143` | `audio/audioSystem.js:856`, `render/vfx.js:2191`, `systems/presentationOrchestrator.js:150`, `ui/hud.js:2119` |
| `aiTrader:requestTrade` | `systems/traffic.js:5099` | `systems/economy.js:862` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:115` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:203` | — |
| `anomaly:bearing` | `systems/scanner.js:976` | — |
| `anomaly:crystalChime` | `systems/anomalyRuntime.js:781` | — |
| `anomaly:drifterFlicker` | `systems/anomalyRuntime.js:867` | — |
| `anomaly:drifterUglinessBark` | `systems/anomalyRuntime.js:890` | `systems/timeTrials.js:385` |
| `anomaly:ionStormLightning` | `systems/anomalyRuntime.js:570` | `render/vfx.js:2152` |
| `anomaly:registered` | `systems/anomalyRuntime.js:545`, `systems/anomalyRuntime.js:615`, `systems/anomalyRuntime.js:664`, `systems/anomalyRuntime.js:936`, `systems/anomalyRuntime.js:976` | — |
| `anomaly:triangulated` | `systems/scanner.js:994` | `systems/world.js:360` |
| `anomaly:unregistered` | `systems/anomalyRuntime.js:1353`, `systems/anomalyRuntime.js:1381`, `systems/anomalyRuntime.js:1399`, `systems/anomalyRuntime.js:1412`, `systems/anomalyRuntime.js:1424`, `systems/anomalyRuntime.js:1440` | — |
| `arcade:pacingWingSpawned` | `testing/metrics/arcadeCorePacingRoute.js:245` | `testing/metrics/arcadeCorePacingRoute.js:339` |
| `asset:deployed` | `systems/automation.js:1211`, `systems/automation.js:1797`, `systems/automation.js:1834`, `systems/automation.js:1904`, `systems/claims.js:454` | `systems/missions.js:840`, `systems/onboarding.js:313`, `systems/story.js:169` |
| `asteroid:chunked` | `systems/mining.js:1720` | `systems/presentationOrchestrator.js:187` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:856`, `systems/mining.js:1072` | `audio/audioSystem.js:832`, `systems/encounterDirector.js:276`, `systems/fieldDepletion.js:431`, `systems/world.js:359`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `combat/cookOff.js:344`, `render/vfx.js:2217`, `systems/ai.js:675`, `systems/anomalyRuntime.js:782`, `systems/beacons.js:52`, `systems/beacons.js:57`, `systems/beacons.js:80`, `systems/bulletTime.js:95`, `systems/bulletTime.js:111`, `systems/claims.js:301`, `systems/claims.js:386`, `systems/claims.js:431`, `systems/claims.js:1147`, `systems/claims.js:1641`, `systems/cloak.js:107`, `systems/cloak.js:118`, `systems/countermeasures.js:190`, `systems/crafting.js:335`, `systems/crafting.js:345`, `systems/crafting.js:419`, `systems/fields.js:393`, `systems/fields.js:478`, `systems/fields.js:508`, `systems/fields.js:515`, `systems/fields.js:602`, `systems/flybyFocus.js:405`, `systems/impulseCharges.js:303`, `systems/impulseCharges.js:465`, `systems/jettisonImpulse.js:133`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:178`, `systems/masslineThrow.js:455`, `systems/masslineThrow.js:564`, `systems/mining.js:679`, `systems/mining.js:717`, `systems/mining.js:842`, `systems/mining.js:1800`, `systems/planetRuntime.js:543`, `systems/presentationAdapters.js:507`, `systems/salvage.js:639`, `systems/tumbleStates.js:233`, `systems/weapons.js:1009`, `systems/weapons.js:1076`, `ui/hud.js:2889`, `ui/hud.js:3092`, `ui/hud.js:3143`, `ui/hud.js:3182`, `ui/hud.js:3199`, `ui/hud.js:3304`, `ui/hud.js:3395`, `ui/hud.js:3607`, `ui/input.js:85`, `ui/input.js:108`, `ui/input.js:154`, `ui/input.js:166`, `ui/input.js:172`, `ui/input.js:208`, `ui/input.js:263`, `ui/input.js:269`, `ui/input.js:480`, `ui/input.js:695`, `ui/input.js:700`, `ui/input.js:784`, `ui/input.js:792`, `ui/input.js:798`, `ui/input.js:823`, `ui/input.js:834`, `ui/input.js:838`, `ui/input.js:851`, `ui/screens/bar.js:1367`, `ui/screens/bar.js:1371`, `ui/screens/bar.js:1377`, `ui/screens/bar.js:1406`, `ui/screens/bar.js:1443`, `ui/screens/bar.js:1461`, `ui/screens/bar.js:1513`, `ui/screens/base.js:506`, `ui/screens/base.js:648`, `ui/screens/market.js:451`, `ui/screens/market.js:453`, `ui/screens/market.js:524`, `ui/screens/market.js:637`, `ui/screens/market.js:647`, `ui/screens/market.js:698`, `ui/screens/market.js:707`, `ui/screens/market.js:736`, `ui/screens/market.js:793`, `ui/screens/market.js:799`, `ui/screens/market.js:809`, `ui/screens/market.js:902`, `ui/screens/market.js:1122`, `ui/screens/market.js:1635`, `ui/screens/market.js:1898`, `ui/screens/missionLog.js:1731`, `ui/screens/missionLog.js:1735`, `ui/screens/missionLog.js:1739`, `ui/screens/missionLog.js:1743`, `ui/screens/missionLog.js:1747`, `ui/screens/missionLog.js:1763`, `ui/screens/missionLog.js:1770`, `ui/screens/missionLog.js:1777`, `ui/screens/missionLog.js:1785`, `ui/screens/missionLog.js:1792`, `ui/screens/missionLog.js:1799`, `ui/screens/missionLog.js:1808`, `ui/screens/missionLog.js:1815`, `ui/screens/missionLog.js:1831`, `ui/screens/missionLog.js:1862`, `ui/screens/missionLog.js:1882`, `ui/screens/outfitting.js:913`, `ui/screens/outfitting.js:917`, `ui/screens/outfitting.js:983`, `ui/screens/outfitting.js:990`, `ui/screens/services.js:552`, `ui/screens/services.js:574`, `ui/screens/services.js:592`, `ui/screens/services.js:598`, `ui/screens/shipLedger.js:297`, `ui/screens/shipLedger.js:304`, `ui/screens/shipLedger.js:311`, `ui/screens/shipyard.js:813`, `ui/screens/shipyard.js:818`, `ui/screens/shipyard.js:840`, `ui/screens/shipyard.js:844`, `ui/screens/shipyard.js:862`, `ui/screens/stationHub.js:1197`, `ui/screens/stationHub.js:1206`, `ui/screens/stationHub.js:1262`, `ui/screens/stationHub.js:1295`, `ui/screens/stationHub.js:1301`, `ui/screens/stationHub.js:1348`, `ui/screens/stationHub.js:1360`, `ui/screens/stationHub.js:1364`, `ui/screens/stationHub.js:1376`, `ui/screens/stationHub.js:1392`, `ui/screens/stationHub.js:1563`, `ui/screens/stationHub.js:1676`, `ui/screens/stationHub.js:1685`, `ui/screens/stationHub.js:1701`, `ui/screens/stationHub.js:1711`, `ui/screens/stationHub.js:1714`, `ui/screens/stationHub.js:1969`, `ui/screens/stationHub.js:1989`, `ui/screens/stationHub.js:2458`, `ui/station/screens/bar.js:300`, `ui/station/screens/bar.js:305`, `ui/station/screens/bar.js:309`, `ui/station/screens/bar.js:313`, `ui/station/screens/bar.js:335`, `ui/station/screens/bar.js:351`, `ui/station/screens/bar.js:379`, `ui/station/screens/bar.js:405`, `ui/station/screens/bar.js:414`, `ui/station/screens/contracts.js:490`, `ui/station/screens/contracts.js:495`, `ui/station/screens/contracts.js:499`, `ui/station/screens/factions.js:387`, `ui/station/screens/industry.js:185`, `ui/station/screens/industry.js:194`, `ui/station/screens/industry.js:202`, `ui/station/screens/market.js:558`, `ui/station/screens/market.js:575`, `ui/station/screens/market.js:666`, `ui/station/screens/market.js:675`, `ui/station/screens/market.js:685`, `ui/station/screens/market.js:694`, `ui/station/screens/market.js:714`, `ui/station/screens/shipworks.js:801`, `ui/station/screens/shipworks.js:1263`, `ui/station/screens/shipworks.js:1319`, `ui/station/screens/shipworks.js:1339`, `ui/station/screens/shipworks.js:1357`, `ui/station/screens/shipworks.js:1378`, `ui/station/screens/shipworks.js:1388`, `ui/station/screens/shipworks.js:1397`, `ui/station/screens/shipworks.js:1402`, `ui/station/screens/shipworks.js:1404`, `ui/station/screens/shipworks.js:1408`, `ui/station/screens/shipworks.js:1417`, `ui/station/screens/shipworks.js:1507`, `ui/station/screens/shipworks.js:1511`, `ui/station/screens/shipworks.js:1515`, `ui/station/stationApp.js:561`, `ui/station/stationApp.js:766`, `ui/station/stationApp.js:790`, `ui/uiRoot.js:405`, `ui/uiRoot.js:866`, `ui/uiRoot.js:929`, `ui/wingmanRadial.js:77`, `ui/wingmanRadial.js:98`, `ui/wingmanRadial.js:120`, `ui/wingmanRadial.js:146`, `ui/wingmanRadial.js:163` | `audio/audioSystem.js:925` |
| `automation:assetDistressed` | `systems/automation.js:1550` | — |
| `automation:assetLost` | `systems/automation.js:2250` | `systems/intervention.js:37`, `systems/lossLedger.js:333`, `systems/missions.js:842` |
| `automation:assetRepossessed` | `systems/automation.js:1575` | — |
| `automation:incomeCredited` | `systems/automation.js:1603`, `systems/automation.js:2522` | — |
| `automation:offlineSummary` | `systems/automation.js:2288`, `systems/automation.js:2312`, `systems/automation.js:2336`, `systems/automation.js:2359`, `systems/automation.js:2569` | — |
| `automation:outpostRaided` | `systems/automation.js:1483`, `systems/automation.js:2644` | `systems/lossLedger.js:334` |
| `automation:outpostRecipeChanged` | `systems/automation.js:1937` | — |
| `automation:programAssigned` | `systems/automation.js:1752` | `systems/missions.js:841` |
| `band:bearingReceipt` | `systems/bandRadio.js:504` | — |
| `band:bearingRequest` | `systems/bandRadio.js:477` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:613`, `systems/uniqueWrecks.js:656` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:620`, `systems/uniqueWrecks.js:628`, `systems/uniqueWrecks.js:642` | — |
| `band:bed` | `systems/bandRadio.js:561` | `audio/audioSystem.js:930` |
| `band:cycle` | `ui/bandHud.js:74`, `ui/input.js:188` | — |
| `band:status` | `systems/bandRadio.js:543` | `ui/bandHud.js:78` |
| `beacon:deploy` | — | `systems/beacons.js:35` |
| `beacon:deployed` | `systems/beacons.js:75` | — |
| `beam:denied` | `systems/mining.js:307`, `systems/mining.js:351`, `systems/mining.js:359`, `systems/mining.js:369`, `systems/mining.js:401` | — |
| `beam:repaired` | `systems/mining.js:580` | — |
| `beam:transferred` | `systems/mining.js:611` | — |
| `boss:defeated` | `systems/world.js:588` | — |
| `boss:resolved` | `systems/capitalRuntime.js:295` | `systems/world.js:405` |
| `buildIdentity:revealed` | `systems/buildIdentity.js:290` | — |
| `bulletTime:end` | `systems/bulletTime.js:110` | `audio/audioSystem.js:929` |
| `bulletTime:start` | `systems/bulletTime.js:94` | `audio/audioSystem.js:926`, `systems/onboarding.js:355` |
| `camera:kill` | — | `render/renderer.js:2968` |
| `camera:shake` | `combat/playerDefeat.js:533`, `combat/playerDefeat.js:643`, `render/vfx.js:3643`, `render/vfx.js:5021`, `render/vfx.js:5367`, `render/vfx.js:5606`, `render/vfx.js:5762`, `systems/combat.js:630`, `systems/combat.js:705`, `systems/combat.js:760`, `systems/combat.js:821`, `systems/combat.js:924`, `systems/combat.js:1006`, `systems/drill.js:972`, `systems/flybyFocus.js:404`, `systems/intervention.js:106`, `systems/presentationAdapters.js:429`, `systems/tetherGameplay.js:466` | `render/renderer.js:2959` |
| `camera:zoom` | `ui/input.js:323`, `ui/input.js:324`, `ui/input.js:529` | `render/renderer.js:2976` |
| `capital:choiceStarted` | `systems/capitalRuntime.js:234` | — |
| `capital:phaseChanged` | `systems/capitalRuntime.js:172` | — |
| `capital:reactorArmed` | `systems/capitalRuntime.js:228` | — |
| `capital:reactorCookOff` | `systems/capitalRuntime.js:272` | — |
| `capital:resolved` | `systems/capitalRuntime.js:288` | — |
| `cargo:changed` | `systems/cargo.js:126`, `systems/mining.js:1975` | `systems/cargo.js:280`, `systems/ships.js:982`, `ui/cargoConscience.js:122`, `ui/commandBar.js:412`, `ui/hud.js:3211`, `ui/hud.js:3240`, `ui/hudMeta.js:183`, `ui/screens/manufacture.js:218`, `ui/screens/stationHub.js:2755`, `ui/screens/stationHub.js:2772`, `ui/screens/stationHub.js:2773`, `ui/screens/stationHub.js:2774` |
| `cargo:delivered` | `systems/missions.js:5176` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | `systems/missions.js:742` |
| `cargo:full` | `systems/cargo.js:241`, `systems/mining.js:832`, `systems/mining.js:1309` | `careers/origins/prospectorOrigin.js:640`, `systems/onboarding.js:274`, `systems/presentationOrchestrator.js:195`, `ui/alerts.js:290`, `ui/floatingText.js:185` |
| `cargo:jettison` | `ui/hud.js:2897` | `ui/hud.js:3148` |
| `cargo:jettisoned` | `systems/cargo.js:469` | `systems/encounterDirector.js:260`, `systems/jettisonImpulse.js:32`, `systems/onboarding.js:351`, `systems/pirateParley.js:44`, `systems/world.js:369` |
| `cargo:massSettled` | `systems/cargo.js:348` | `systems/presentationOrchestrator.js:194`, `systems/ships.js:983` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:85` | — |
| `cargo:podArmed` | `systems/jettisonImpulse.js:66` | — |
| `cargo:podRecovered` | `systems/jettisonImpulse.js:186` | `systems/missions.js:745`, `systems/world.js:370` |
| `cargo:podStrike` | `systems/jettisonImpulse.js:148` | `systems/missions.js:748` |
| `charge:aftDropped` | `systems/impulseCharges.js:299` | `systems/onboarding.js:363` |
| `charge:combo` | `systems/impulseCharges.js:341`, `systems/impulseCharges.js:444` | — |
| `charge:detonated` | `systems/impulseCharges.js:452` | `audio/audioSystem.js:872`, `render/feel.js:834`, `render/vfx.js:2189` |
| `charge:stuck` | `systems/impulseCharges.js:224` | — |
| `charge:thrown` | `systems/impulseCharges.js:295` | — |
| `civilianCast:landmarkVisit` | `systems/traffic.js:7178` | — |
| `civilianCast:towAttached` | `systems/traffic.js:3730` | — |
| `civilianCast:towDelivered` | `systems/traffic.js:3764` | — |
| `civilianCast:waypointVisited` | `systems/traffic.js:8492` | — |
| `claim:carrierDematerialized` | `systems/claims.js:1407` | — |
| `claim:carrierDispatched` | `systems/claims.js:1025` | — |
| `claim:carrierEngaged` | `systems/claims.js:1224` | — |
| `claim:carrierHeld` | `systems/claims.js:1174` | — |
| `claim:carrierIntercept` | `systems/claims.js:1161`, `systems/claims.js:1265` | — |
| `claim:carrierMaterialized` | `systems/claims.js:1358` | — |
| `claim:carrierSettled` | `systems/claims.js:1509` | — |
| `claim:carrierThreat` | `systems/claims.js:1130` | — |
| `claim:claimed` | `systems/claims.js:300` | `systems/onboarding.js:319`, `systems/story.js:175` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1701` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:250` |
| `claim:defenseResolved` | `systems/claims.js:1785` | — |
| `claim:defenseStarted` | `systems/claims.js:1706` | — |
| `claim:defenseWarning` | `systems/claims.js:1623` | — |
| `claim:infrastructureActive` | `systems/claims.js:835` | `systems/traffic.js:1091` |
| `claim:infrastructureConstructed` | `systems/claims.js:367` | — |
| `claim:infrastructureStatus` | `systems/claims.js:846` | `systems/traffic.js:1092` |
| `claim:moduleBuilt` | `systems/claims.js:385` | — |
| `claim:raidRepelled` | `systems/claims.js:1570` | — |
| `claim:raidWarning` | `systems/claims.js:1563` | — |
| `claim:receipt` | `systems/claims.js:2070` | — |
| `claim:sensorPostRumor` | `systems/claims.js:894` | `systems/world.js:393` |
| `claim:specialized` | `systems/claims.js:426` | — |
| `claim:teleportRequest` | `systems/claims.js:641` | — |
| `claims:migrated` | `systems/claims.js:2181` | — |
| `cloak:dropped` | `systems/cloak.js:117` | — |
| `cloak:engaged` | `systems/cloak.js:106` | `systems/onboarding.js:359` |
| `codex:bestiaryUpdated` | — | `ui/screens/codex.js:503` |
| `codex:blackBoxRecovered` | `systems/rareSpawnRuntime.js:552`, `systems/rareSpawnRuntime.js:700` | `ui/screens/codex.js:502` |
| `combat:actionCancelled` | `combat/actions.js:290` | — |
| `combat:actionCompleted` | `combat/actions.js:276` | — |
| `combat:actionPhase` | `combat/actions.js:157` | — |
| `combat:actionRejected` | `combat/actions.js:312` | — |
| `combat:actionStarted` | `combat/actions.js:127` | `systems/presentationOrchestrator.js:155`, `systems/scenarioRuntime.js:22` |
| `combat:baseDestroyed` | — | `systems/economy.js:907` |
| `combat:beamStop` | `systems/weapons.js:616` | `audio/audioSystem.js:792`, `render/vfx.js:2125` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:284` | `render/vfx.js:2137` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:286` | `render/vfx.js:2138` |
| `combat:damage` | `combat/damage.js:292` | `audio/audioSystem.js:796`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/feel.js:700`, `render/vfx.js:2128`, `save/saveSystem.js:141`, `systems/ai.js:89`, `systems/cruise.js:21`, `systems/encounterDirector.js:258`, `systems/factionPresence.js:428`, `systems/heat.js:200`, `systems/lawSecurity.js:119`, `systems/mediumEnemyRuntime.js:150`, `systems/onboarding.js:240`, `systems/onboarding.js:251`, `systems/presentationOrchestrator.js:149`, `systems/scanReveal.js:69`, `systems/scenarioRuntime.js:28`, `systems/stationBroadcast.js:152`, `systems/titles.js:456`, `ui/alerts.js:276`, `ui/commandBar.js:401`, `ui/floatingText.js:122`, `ui/floatingText.js:130`, `ui/hud.js:1295`, `ui/hud.js:1589`, `ui/hud.js:3268` |
| `combat:emberCookOff` | `combat/cookOff.js:329` | `audio/audioSystem.js:811`, `systems/fuelStack.js:78` |
| `combat:fieldRepaired` | `combat/kernel.js:291` | — |
| `combat:fire` | `systems/weapons.js:595`, `systems/weapons.js:757`, `systems/weapons.js:914` | `audio/audioSystem.js:791`, `render/feel.js:768`, `render/vfx.js:2124`, `systems/cloak.js:37`, `systems/cruise.js:28`, `systems/onboarding.js:218`, `systems/presentationOrchestrator.js:154`, `testing/metrics/arcadeCorePacingRoute.js:153`, `testing/metrics/arcadeCorePacingRoute.js:355`, `ui/hud.js:3252` |
| `combat:heavyCookOffPhase` | — | `audio/audioSystem.js:820` |
| `combat:hit` | `systems/salvageActions.js:182` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:96` | `systems/automation.js:496` |
| `combat:hullRepaired` | `combat/kernel.js:246` | `audio/audioSystem.js:797`, `render/vfx.js:2129` |
| `combat:lockChanged` | — | `systems/world.js:354`, `ui/alerts.js:283` |
| `combat:outcome` | `systems/combatOutcome.js:168` | `systems/barkDirector.js:43` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:169` | — |
| `combat:projectedShieldHit` | `combat/damage.js:284` | — |
| `combat:projectileIntercepted` | `core/physics.js:678` | `render/vfx.js:2127` |
| `combat:repairSubsystem` | — | `combat/kernel.js:78` |
| `combat:requestAction` | — | `combat/kernel.js:74` |
| `combat:routeDamage` | `systems/drill.js:984`, `systems/impulseCharges.js:493`, `systems/mines.js:219` | `combat/kernel.js:75`, `systems/routeFollower.js:333` |
| `combat:routeFieldRepair` | — | `combat/kernel.js:77` |
| `combat:routeHullRepair` | — | `combat/kernel.js:76` |
| `combat:statusApplied` | `combat/statuses.js:155` | `render/vfx.js:2130` |
| `combat:statusExpired` | `combat/statuses.js:57` | — |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:105`, `systems/encounterDirector.js:251`, `systems/factionPresence.js:426`, `systems/missions.js:756`, `systems/presentationOrchestrator.js:210`, `systems/surrenderRecovery.js:62`, `systems/wingMorale.js:184` |
| `combat:subsystemEnabled` | — | `systems/factionPresence.js:427`, `systems/surrenderRecovery.js:63` |
| `combat:surrendered` | — | `systems/combatOutcome.js:106`, `systems/surrenderRecovery.js:61` |
| `combat:tumbleEnd` | `systems/tumbleStates.js:144` | — |
| `combat:weakPointHit` | `systems/combat.js:684` | `ui/floatingText.js:134` |
| `comms:log` | `systems/encounterScripts.js:995`, `systems/salvage.js:637` | — |
| `comms:popup` | `systems/ai.js:459`, `systems/factionPresence.js:860`, `systems/factionPresence.js:881`, `systems/missions.js:5256`, `systems/missions.js:5290`, `systems/missions.js:5334`, `systems/missions.js:6708`, `systems/missions.js:7092`, `systems/scenarioRuntime.js:185`, `systems/story.js:386`, `systems/story.js:1027`, `systems/story.js:1055` | `audio/audioSystem.js:911`, `ui/screens/codex.js:498` |
| `conflict:flip` | `systems/factions.js:650` | `systems/sectorSim.js:109`, `systems/story.js:170` |
| `conflict:sideChosen` | `systems/factions.js:458` | — |
| `conflict:skirmishResolved` | `systems/factions.js:571` | — |
| `conflict:skirmishUnclaimed` | `systems/factions.js:504` | — |
| `conflict:staleFrontReset` | `systems/factions.js:598` | — |
| `conflict:warDeclared` | `systems/factions.js:607` | — |
| `contactHail:availability` | `systems/scanner.js:1316`, `systems/scanner.js:1327` | — |
| `contactHail:choice` | `ui/contactHailPrompt.js:82` | `systems/scanner.js:806` |
| `contactHail:clear` | `systems/scanner.js:1338` | — |
| `contactHail:handoff` | `systems/scanner.js:1176` | — |
| `contactHail:offer` | `systems/scanner.js:1198` | — |
| `contactHail:request` | `ui/contactHailPrompt.js:76` | `systems/scanner.js:805` |
| `contactHail:response` | `systems/scanner.js:1232` | `systems/traffic.js:1032` |
| `contraband:bribe` | `systems/encounterScripts.js:499`, `ui/customsPrompt.js:183` | `systems/economy.js:903` |
| `contraband:scanned` | `systems/economy.js:2779` | `systems/encounterDirector.js:259`, `systems/factions.js:224`, `systems/heat.js:203`, `systems/lawSecurity.js:127`, `ui/customsPrompt.js:131` |
| `contract:clauseBroken` | `systems/contractClauses.js:351` | `systems/missions.js:821` |
| `contract:clauseHonored` | `systems/contractClauses.js:338`, `systems/missions.js:5348` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:186` | — |
| `craft:blueprintsUnlocked` | `systems/crafting.js:209` | `ui/station/screens/industry.js:209` |
| `craft:complete` | `systems/crafting.js:334`, `systems/crafting.js:444` | `ui/screens/manufacture.js:220`, `ui/station/screens/industry.js:207` |
| `craft:fieldSupplyUsed` | `systems/crafting.js:418` | — |
| `craft:queueChanged` | `systems/crafting.js:174`, `systems/crafting.js:344`, `systems/crafting.js:446` | `systems/onboarding.js:324`, `ui/screens/manufacture.js:221`, `ui/station/screens/industry.js:208` |
| `craft:serviceFeeCharged` | `systems/economy.js:2097` | — |
| `credits:changed` | `systems/economy.js:2052`, `systems/economy.js:2069` | `audio/audioSystem.js:834`, `balance/hunterPublicRoute.js:466`, `testing/metrics/arcadeCorePacingRoute.js:351`, `ui/commandBar.js:413`, `ui/hud.js:3239`, `ui/screens/manufacture.js:219`, `ui/screens/stationHub.js:2753`, `ui/screens/stationHub.js:2775`, `ui/screens/stationHub.js:2776` |
| `cruise:charging` | `systems/cruise.js:88` | `render/vfx.js:2186`, `systems/presentationOrchestrator.js:159` |
| `cruise:dropped` | `systems/cruise.js:99` | `render/vfx.js:2188`, `systems/presentationOrchestrator.js:161` |
| `cruise:engaged` | `systems/cruise.js:64` | `render/vfx.js:2187`, `systems/presentationOrchestrator.js:160` |
| `cruise:snareRequest` | `systems/encounterScripts.js:605` | `systems/cruise.js:33` |
| `cruise:snared` | `systems/cruise.js:98` | `audio/audioSystem.js:905` |
| `customs:breakScan` | `ui/customsPrompt.js:187` | — |
| `customs:submit` | `ui/customsPrompt.js:179` | — |
| `danger:miningNoise` | `systems/mining.js:1987` | — |
| `day:tick` | `core/coreSystem.js:178` | `systems/custodyConsequences.js:30`, `systems/encounterDirector.js:233`, `systems/factions.js:240`, `systems/sectorSim.js:93` |
| `deadGate:materialRecovered` | `systems/world.js:3769` | — |
| `deadGate:opened` | `systems/world.js:3681` | — |
| `deadGate:rewardMaterialized` | `systems/world.js:3736` | — |
| `debt:changed` | `systems/economy.js:2185` | — |
| `derelictBoarding:hatchOpened` | `systems/aftermathWrecks.js:1057` | — |
| `derelictBoarding:physicalCut` | `systems/mining.js:518` | — |
| `derelictBoarding:requiresStabilization` | `systems/aftermathWrecks.js:1021` | — |
| `derelictBoarding:stabilized` | `systems/aftermathWrecks.js:1039` | — |
| `derelictBoarding:survivorExtracted` | `systems/aftermathWrecks.js:1121` | — |
| `discovery:plateUnlocked` | `systems/world.js:538`, `systems/world.js:3445`, `systems/world.js:3623`, `systems/world.js:4604` | `audio/audioSystem.js:852`, `ui/screens/codex.js:500` |
| `distress:rescued` | `systems/encounterScripts.js:994` | `systems/factions.js:233` |
| `dock:attempt` | `ui/input.js:81` | `ui/dockDenyBanner.js:112` |
| `dock:denied` | `ui/dockDenyBanner.js:137` | — |
| `dock:docked` | `balance/careerCohorts.js:487`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:84` | `audio/audioSystem.js:853`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:631`, `save/saveSystem.js:157`, `systems/aftermathWrecks.js:549`, `systems/autoTargetAssist.js:98`, `systems/automation.js:493`, `systems/combat.js:581`, `systems/economy.js:883`, `systems/economyContracts.js:162`, `systems/factionPresence.js:424`, `systems/mining.js:211`, `systems/missions.js:700`, `systems/onboarding.js:196`, `systems/onboarding.js:290`, `systems/scanner.js:809`, `systems/story.js:140`, `systems/timeTrials.js:376`, `systems/world.js:387`, `ui/alerts.js:267`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:133`, `ui/dockDenyBanner.js:113`, `ui/priceForecast.js:86`, `ui/securityReadout.js:158`, `ui/uiRoot.js:854`, `ui/wingmanRadial.js:181` |
| `dock:range` | `core/physics.js:807`, `core/physics.js:811` | `systems/onboarding.js:260`, `ui/alerts.js:263`, `ui/input.js:65` |
| `dock:undocked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:520`, `ui/station/screens/trials.js:100`, `ui/station/stationApp.js:741` | `audio/audioSystem.js:854`, `save/saveSystem.js:158`, `systems/automation.js:492`, `systems/combat.js:585`, `systems/economy.js:890`, `systems/missions.js:719`, `systems/onboarding.js:231`, `systems/presentationAdapters.js:171`, `systems/timeTrials.js:377`, `systems/world.js:388`, `ui/input.js:72`, `ui/uiRoot.js:883` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1148` | `ui/uiRoot.js:942` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1133`, `ui/sandbox/sandboxSetup.js:506` | `ui/uiRoot.js:932` |
| `drill:approachRequested` | `ui/input.js:435` | `systems/tetherGameplay.js:148` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1025`, `ui/sandbox/sandboxSetup.js:505` | `ui/uiRoot.js:921` |
| `drill:break` | `systems/drill.js:883` | `systems/asteroidSites.js:153`, `systems/presentationOrchestrator.js:201`, `ui/asteroid/asteroidScreen.js:580`, `ui/screens/drill.js:1863` |
| `drill:cargoFull` | `systems/drill.js:932` | `ui/asteroid/asteroidScreen.js:569`, `ui/screens/drill.js:1833` |
| `drill:end` | `systems/drill.js:552` | `systems/asteroidSites.js:163`, `systems/presentationOrchestrator.js:204` |
| `drill:gasHit` | `systems/drill.js:971` | `systems/presentationOrchestrator.js:203`, `ui/asteroid/asteroidScreen.js:556`, `ui/screens/drill.js:1773` |
| `drill:retry` | `systems/drill.js:603` | `systems/presentationOrchestrator.js:205` |
| `drill:rockDepleted` | `systems/drill.js:518`, `systems/drill.js:897`, `systems/drill.js:923` | `ui/asteroid/asteroidScreen.js:566`, `ui/screens/drill.js:1824` |
| `drill:scanPulse` | `systems/drill.js:676` | `systems/asteroidSites.js:180`, `systems/presentationOrchestrator.js:199`, `ui/asteroid/asteroidScreen.js:573`, `ui/screens/drill.js:1851` |
| `drill:spark` | `systems/drill.js:855` | `systems/presentationOrchestrator.js:200`, `ui/asteroid/asteroidScreen.js:585`, `ui/screens/drill.js:1884` |
| `drill:start` | `systems/drill.js:510` | `systems/asteroidSites.js:146`, `systems/onboarding.js:295`, `systems/presentationOrchestrator.js:198` |
| `drill:warn` | `systems/drill.js:524`, `systems/drill.js:529`, `systems/drill.js:777`, `systems/drill.js:809`, `systems/drill.js:828`, `systems/drill.js:904`, `systems/drill.js:935`, `systems/drill.js:942` | `systems/presentationOrchestrator.js:197`, `ui/asteroid/asteroidScreen.js:562`, `ui/screens/drill.js:1801` |
| `drill:yield` | `systems/drill.js:921` | `systems/presentationOrchestrator.js:202`, `ui/asteroid/asteroidScreen.js:548`, `ui/screens/drill.js:1752` |
| `economy:applyTradePressure` | `systems/automation.js:736`, `systems/automation.js:1292`, `systems/automation.js:1293`, `systems/claims.js:1490`, `systems/encounterDirector.js:1869`, `systems/encounterDirector.js:1917`, `systems/sectorSim.js:375`, `systems/traffic.js:7044`, `systems/traffic.js:8697` | `systems/economy.js:870` |
| `economy:chargeCredits` | `combat/playerDefeat.js:591`, `systems/automation.js:1505`, `systems/automation.js:1512`, `systems/automation.js:2137`, `systems/automation.js:2532`, `systems/automation.js:2756`, `systems/beacons.js:61`, `systems/claims.js:280`, `systems/claims.js:350`, `systems/claims.js:421`, `systems/claims.js:1523`, `systems/combat.js:906`, `systems/encounterDirector.js:1863`, `systems/gateControlDirector.js:119`, `systems/mining.js:566`, `systems/missions.js:2161`, `systems/missions.js:2164`, `systems/pirateParley.js:609`, `systems/ships.js:1439`, `systems/ships.js:1507`, `systems/ships.js:1650`, `systems/ships.js:1706`, `systems/timeTrials.js:724`, `systems/traffic.js:7378`, `systems/world.js:2648`, `systems/world.js:2692`, `systems/world.js:3125` | `systems/economy.js:829` |
| `economy:eventEnded` | `systems/economy.js:2857` | `ui/floatingText.js:201`, `ui/screens/stationHub.js:2815` |
| `economy:eventStarted` | `systems/economy.js:2832` | `ui/floatingText.js:190`, `ui/screens/market.js:741`, `ui/screens/stationHub.js:2814` |
| `economy:grantCredits` | `systems/automation.js:1599`, `systems/automation.js:2518`, `systems/claims.js:1489`, `systems/claims.js:2167`, `systems/combat.js:767`, `systems/combat.js:784`, `systems/combat.js:991`, `systems/encounterDirector.js:1864`, `systems/endgameReplay.js:304`, `systems/endgameReplay.js:333`, `systems/mining.js:1641`, `systems/mining.js:1816`, `systems/missions.js:5356`, `systems/missions.js:5359`, `systems/missions.js:7018`, `systems/moralTrap.js:133`, `systems/ships.js:1736`, `systems/survivorPod.js:1104`, `systems/timeTrials.js:795`, `systems/timeTrials.js:994`, `systems/uniqueWrecks.js:1615`, `systems/world.js:4545` | `systems/economy.js:828`, `systems/story.js:168` |
| `economy:marketOpened` | `ui/screens/market.js:1816`, `ui/station/screens/market.js:733` | `systems/economy.js:846`, `ui/priceHistory.js:118` |
| `economy:purchaseInsurance` | — | `systems/economy.js:830` |
| `economy:regimeChanged` | `systems/economy.js:1064` | — |
| `economy:salvageIntakeApplied` | `systems/economy.js:2034` | — |
| `economy:tick` | `systems/economy.js:1092` | `ui/priceHistory.js:93`, `ui/screens/stationHub.js:2771` |
| `economy:trade` | — | `careers/origins/haulerOriginSystem.js:87` |
| `economy:tradeCompleted` | `systems/economy.js:1643` | `audio/audioSystem.js:842`, `careers/origins/prospectorOrigin.js:649`, `save/saveSystem.js:165`, `systems/factions.js:203`, `systems/missions.js:727`, `systems/onboarding.js:197`, `systems/sectorSim.js:104`, `systems/story.js:164`, `ui/screens/market.js:721`, `ui/screens/stationHub.js:2757`, `ui/screens/stationHub.js:2769`, `ui/screens/stationHub.js:2770` |
| `economy:tradeFailed` | `systems/economy.js:1721`, `systems/economy.js:1739`, `systems/economy.js:1842` | `ui/screens/market.js:732` |
| `encounter:choiceOffered` | `systems/capitalRuntime.js:189`, `systems/encounterDirector.js:1714` | `ui/encounterChoicePrompt.js:143` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:106` | `systems/capitalRuntime.js:118`, `systems/encounterDirector.js:273` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1804` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:6330` | `systems/encounterDirector.js:257` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1984` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:1422` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1407` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:1323` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1817` | — |
| `encounter:resolved` | `systems/capitalRuntime.js:300`, `systems/encounterDirector.js:1799`, `systems/encounterDirector.js:1849` | `audio/audioSystem.js:864`, `systems/aftermathWrecks.js:548`, `systems/claims.js:249`, `systems/missions.js:762`, `systems/story.js:128`, `systems/terrainAnchors.js:44`, `systems/uniqueLootAbilities.js:114`, `ui/encounterChoicePrompt.js:144` |
| `encounter:spawned` | `systems/encounterDirector.js:683`, `systems/encounterDirector.js:793`, `systems/encounterDirector.js:1210` | `systems/uniqueLootAbilities.js:113`, `testing/metrics/arcadeCorePacingRoute.js:148` |
| `encounter:telegraph` | `systems/encounterDirector.js:672`, `systems/encounterDirector.js:782`, `systems/encounterDirector.js:1195` | `audio/audioSystem.js:863`, `systems/terrainAnchors.js:43`, `systems/world.js:397` |
| `encounter:voice` | `systems/encounterDirector.js:1698` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:396` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:355` | — |
| `endgame:chosen` | `systems/story.js:871` | `ui/screens/missionLog.js:1966` |
| `endgame:confirmRequired` | `systems/story.js:760` | `ui/screens/missionLog.js:1965` |
| `endgame:eligibility` | `systems/story.js:612` | `ui/screens/missionLog.js:1964` |
| `endgame:ineligible` | `systems/story.js:663`, `systems/story.js:740`, `systems/story.js:805` | — |
| `endgame:loopBack` | — | `systems/story.js:159` |
| `endgame:promptChoiceC` | `systems/story.js:725` | — |
| `endgame:promptChoiceD` | `systems/story.js:689` | — |
| `endgame:promptSandbox` | `systems/story.js:623` | — |
| `endgame:sandboxContinued` | `systems/story.js:865` | `ui/screens/missionLog.js:1967` |
| `endgameReplay:activated` | `systems/endgameReplay.js:151` | `ui/screens/missionLog.js:1972` |
| `endgameReplay:challengeCompleted` | `systems/endgameReplay.js:313` | `ui/screens/missionLog.js:1975` |
| `endgameReplay:challengeInterrupted` | `systems/endgameReplay.js:351` | — |
| `endgameReplay:challengeRerolled` | `systems/endgameReplay.js:202` | `ui/screens/missionLog.js:1973` |
| `endgameReplay:challengeStarted` | `systems/endgameReplay.js:246` | `ui/screens/missionLog.js:1974` |
| `endgameReplay:huntCompleted` | `systems/endgameReplay.js:335` | `ui/screens/missionLog.js:1977` |
| `endgameReplay:huntInterrupted` | `systems/endgameReplay.js:328` | — |
| `endgameReplay:huntStarted` | `systems/endgameReplay.js:269` | `ui/screens/missionLog.js:1976` |
| `entity:destroyed` | `main.js:325`, `main.js:446`, `save/saveSystem.js:2603`, `systems/aftermathWrecks.js:1326`, `systems/lootShards.js:187`, `systems/survivorPod.js:253`, `systems/traffic.js:4597`, `systems/wingmen.js:146`, `systems/world.js:1356` | `audio/audioSystem.js:821`, `combat/kernel.js:69`, `render/renderer.js:2919`, `render/vfx.js:2140`, `systems/ai.js:101`, `systems/encounterDirector.js:249`, `systems/gateControlDirector.js:68`, `systems/heistFacilities.js:161`, `systems/lawSecurity.js:122`, `systems/missions.js:758`, `systems/npcJobsRuntime.js:426`, `systems/presentationOrchestrator.js:158`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:91`, `systems/timeTrials.js:379`, `ui/prompts/bulkHaulTag.js:148`, `ui/radar.js:652` |
| `entity:kill` | — | `core/coreSystem.js:110` |
| `entity:killed` | `balance/careerCohorts.js:456`, `combat/damage.js:520`, `combat/kernel.js:46`, `systems/combat.js:742` | `audio/audioSystem.js:810`, `render/feel.js:733`, `render/vfx.js:2139`, `systems/aftermathWrecks.js:542`, `systems/ai.js:102`, `systems/barkDirector.js:42`, `systems/capitalRuntime.js:120`, `systems/claims.js:257`, `systems/combatOutcome.js:103`, `systems/encounterDirector.js:250`, `systems/factions.js:174`, `systems/fuelTenderService.js:34`, `systems/heat.js:196`, `systems/heavyPartsRuntime.js:54`, `systems/lawSecurity.js:121`, `systems/lootShards.js:203`, `systems/lossLedger.js:336`, `systems/mining.js:206`, `systems/missions.js:750`, `systems/npcJobsRuntime.js:419`, `systems/onboarding.js:228`, `systems/presentationOrchestrator.js:157`, `systems/scanReveal.js:70`, `systems/sectorSim.js:108`, `systems/surrenderRecovery.js:68`, `systems/survivorPod.js:376`, `systems/timeTrials.js:378`, `systems/titles.js:457`, `systems/traffic.js:1018`, `systems/wingMorale.js:183`, `systems/wingmen.js:63`, `systems/world.js:401`, `testing/metrics/arcadeCorePacingRoute.js:340`, `ui/floatingText.js:131`, `ui/floatingText.js:160`, `ui/galaxyMap.js:5689`, `ui/hud.js:3269` |
| `entity:spawnRequest` | — | `core/coreSystem.js:114` |
| `entity:spawned` | `core/coreSystem.js:60` | `combat/kernel.js:64`, `render/renderer.js:2917`, `render/renderer.js:3375`, `render/vfx.js:2146`, `systems/aiPorts.js:149`, `systems/capitalRuntime.js:107`, `systems/factionPresence.js:430`, `systems/fields.js:168`, `systems/heavyPartsRuntime.js:48`, `systems/lawSecurity.js:120`, `systems/lossLedger.js:335`, `systems/npcJobsRuntime.js:412`, `systems/salvageActions.js:69`, `systems/titles.js:458`, `systems/uniqueLootAbilities.js:116`, `ui/radar.js:651` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:166` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:139`, `systems/e1EncounterRuntime.js:239`, `systems/factions.js:274`, `systems/factions.js:305`, `systems/factions.js:731` | `systems/heat.js:209` |
| `faction:backroomPurchased` | `systems/economy.js:2315` | — |
| `faction:licensedFitPurchased` | `systems/economy.js:2276` | — |
| `faction:repChanged` | `systems/factions.js:271`, `systems/factions.js:300`, `systems/factions.js:727` | `ui/floatingText.js:178`, `ui/screens/stationHub.js:2796`, `ui/station/screens/factions.js:427` |
| `faction:repDelta` | `balance/careerCohorts.js:255`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:1773`, `systems/economy.js:2772`, `systems/encounterDirector.js:1865`, `systems/missions.js:5490`, `systems/missions.js:5535`, `systems/missions.js:6971`, `systems/missions.js:6973`, `systems/missions.js:7023`, `systems/moralTrap.js:128`, `systems/moralTrap.js:135`, `systems/survivorPod.js:894`, `systems/survivorPod.js:1110`, `systems/uniqueWrecks.js:1619`, `systems/world.js:3961`, `systems/world.js:4196` | `systems/factions.js:168` |
| `faction:repSpillover` | `systems/factions.js:298` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:127`, `systems/e1EncounterRuntime.js:131`, `systems/e1EncounterRuntime.js:141` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1100` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:864` | `systems/story.js:186` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1012` | `ui/uiRoot.js:232` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:713` | — |
| `factionPresence:service` | `systems/factionPresence.js:813` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:889` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:497`, `systems/factionPresence.js:582` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:517` | `systems/world.js:358` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:445`, `systems/traffic.js:1718`, `systems/traffic.js:8616` | — |
| `field:richSeamOpened` | `systems/traffic.js:7861` | — |
| `field:richSeamWorked` | `systems/mining.js:1023`, `systems/traffic.js:7533` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:516` | `systems/npcJobsRuntime.js:433`, `systems/presentationOrchestrator.js:196` |
| `fields:anchorRegistered` | `systems/fields.js:290` | — |
| `fields:cleared` | `systems/fields.js:618` | `audio/audioSystem.js:829` |
| `fields:coneToggled` | `systems/fields.js:507`, `systems/fields.js:514` | `audio/audioSystem.js:830` |
| `fields:deployDenied` | `systems/fields.js:391` | — |
| `fields:deployed` | `systems/fields.js:466` | `audio/audioSystem.js:827`, `systems/onboarding.js:227` |
| `fields:ended` | `systems/fields.js:324`, `systems/fields.js:333`, `systems/fields.js:600` | `audio/audioSystem.js:828` |
| `fields:reloaded` | `systems/fields.js:199` | — |
| `fixer:jobRemembered` | `systems/stationContacts.js:503` | — |
| `fixer:outcomeRemembered` | `systems/stationContacts.js:452` | — |
| `fixer:voice` | `systems/stationContacts.js:544` | — |
| `flight:modeChanged` | `systems/flightV3.js:499` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:273` |
| `flybyFocus:end` | `systems/flybyFocus.js:311` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:387` | `systems/onboarding.js:215` |
| `formation:discovered` | `systems/asteroidFormations.js:235` | — |
| `freight:arrival` | `systems/traffic.js:5116` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1795`, `systems/encounterScripts.js:1987`, `systems/encounterScripts.js:2226` | `audio/audioSystem.js:859` |
| `freight:cargoTowAttached` | `systems/encounterScripts.js:1732` | — |
| `freight:custodyChanged` | `systems/encounterScripts.js:1849` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:833` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1906` | — |
| `freight:loss` | `systems/encounterDirector.js:1927`, `systems/traffic.js:7046`, `systems/traffic.js:8709` | — |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1850` | `systems/surrenderRecovery.js:69` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:2385` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:255`, `systems/traffic.js:1038` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:256`, `systems/traffic.js:1039` |
| `frontierRumor:acquired` | `systems/world.js:2711` | — |
| `frontierRumor:contacted` | `systems/world.js:4575` | — |
| `frontierRumor:planned` | `systems/encounterDirector.js:887` | `systems/world.js:396` |
| `frontierRumor:resolved` | `systems/world.js:2728` | — |
| `fuel:changed` | `systems/economy.js:1005`, `systems/economy.js:2352`, `systems/economy.js:2422`, `systems/economy.js:2463`, `systems/economy.js:2482`, `systems/world.js:3496`, `systems/world.js:3504` | `ui/screens/stationHub.js:2754`, `ui/screens/stationHub.js:2789`, `ui/screens/stationHub.js:2790`, `ui/screens/stationHub.js:2791`, `ui/screens/stationHub.js:2792` |
| `fuel:empty` | `systems/world.js:3497` | `audio/audioSystem.js:881`, `ui/alerts.js:291` |
| `fuel:fieldLoaded` | `systems/economy.js:2353` | — |
| `fuel:scooped` | `systems/economy.js:1006` | — |
| `fuelStack:blown` | `systems/fuelStack.js:328` | — |
| `fuelStack:discovered` | `systems/fuelStack.js:107` | — |
| `fuelStack:refueled` | `systems/economy.js:2464` | `systems/fuelStack.js:79` |
| `fuelTender:completed` | `systems/fuelTenderService.js:114`, `systems/fuelTenderService.js:128` | — |
| `fuelTender:interrupted` | `systems/fuelTenderService.js:160` | — |
| `fuelTender:rendezvousReady` | `systems/fuelTenderService.js:91` | — |
| `fuelTender:rendezvousStarted` | `systems/fuelTenderService.js:77` | — |
| `fuelTender:transferRequested` | `systems/fuelTenderService.js:110` | `systems/economy.js:895` |
| `fuelTender:transferred` | `systems/economy.js:2423` | — |
| `game:load` | `ui/input.js:177`, `ui/input.js:320`, `ui/screens/mainMenu.js:264`, `ui/screens/saveLoad.js:305` | `save/saveSystem.js:125`, `systems/scanner.js:808`, `ui/commandBar.js:430`, `ui/encounterChoicePrompt.js:147`, `ui/lawfulInspectionPrompt.js:177`, `ui/pirateParleyPrompt.js:251`, `ui/signalInvestigationPrompt.js:262` |
| `game:loadingProgress` | `main.js:128`, `main.js:146`, `main.js:413`, `main.js:471`, `main.js:483`, `main.js:499`, `main.js:524`, `main.js:542` | `ui/loadingPresenter.js:46` |
| `game:new` | `ui/sandbox/sandboxSetup.js:285`, `ui/screens/gameOver.js:279`, `ui/screens/newGame.js:34`, `ui/screens/newGame.js:540` | `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:125`, `main.js:194`, `render/feel.js:685`, `render/vfx.js:2155`, `save/saveSystem.js:153`, `systems/aftermathWrecks.js:555`, `systems/anomalyRuntime.js:403`, `systems/encounterDirector.js:247`, `systems/environmentalMachinery.js:46`, `systems/fields.js:163`, `systems/massSeed.js:120`, `systems/masslineSnares.js:120`, `systems/mediumEnemyRuntime.js:148`, `systems/mines.js:37`, `systems/planetRuntime.js:105`, `systems/presentationOrchestrator.js:217`, `systems/scanner.js:807`, `systems/surrenderRecovery.js:75`, `systems/survivorPod.js:374`, `systems/tetherGameplay.js:143`, `systems/timeTrials.js:392`, `ui/commandBar.js:429`, `ui/encounterChoicePrompt.js:146`, `ui/hudLayout.js:121`, `ui/lawfulInspectionPrompt.js:176`, `ui/pirateParleyPrompt.js:250`, `ui/priceHistory.js:119`, `ui/signalInvestigationPrompt.js:261` |
| `game:newGame` | — | `core/coreSystem.js:126`, `render/vfx.js:2156`, `save/saveSystem.js:154`, `systems/aftermathWrecks.js:556`, `systems/anomalyRuntime.js:404`, `systems/collisionConsequences.js:61`, `systems/fieldDepletion.js:433`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:337`, `systems/survivorPod.js:373`, `systems/timeTrials.js:393`, `systems/titles.js:462`, `systems/wingMorale.js:185` |
| `game:over` | `combat/playerDefeat.js:534`, `systems/combat.js:706`, `systems/combat.js:822` | `ui/uiRoot.js:959` |
| `game:save` | `ui/input.js:176`, `ui/input.js:318`, `ui/screens/saveLoad.js:291` | `save/saveSystem.js:124` |
| `game:startFailed` | `main.js:614` | `ui/loadingPresenter.js:54`, `ui/sandbox/sandboxSetup.js:309`, `ui/screens/newGame.js:503` |
| `game:started` | `main.js:422` | `audio/audioSystem.js:968`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:127`, `render/renderer.js:2977`, `save/saveSystem.js:150`, `systems/automation.js:516`, `systems/collisionConsequences.js:60`, `systems/combat.js:597`, `systems/economyContracts.js:164`, `systems/factions.js:163`, `systems/flight.js:78`, `systems/flightV3.js:140`, `systems/heat.js:216`, `systems/masslineSnares.js:121`, `systems/missions.js:680`, `systems/onboarding.js:183`, `systems/presentationAdapters.js:169`, `systems/presentationOrchestrator.js:218`, `systems/sectorSim.js:99`, `systems/ships.js:1058`, `systems/story.js:126`, `systems/surrenderRecovery.js:76`, `systems/tacticalAI.js:113`, `systems/tetherGameplay.js:144`, `ui/commandBar.js:428`, `ui/radar.js:653`, `ui/sandbox/sandboxSetup.js:306`, `ui/uiRoot.js:950`, `ui/uiRoot.js:975` |
| `gamepad:connected` | `systems/gamepad.js:177` | — |
| `gamepad:disconnected` | `systems/gamepad.js:162` | — |
| `gate:range` | `core/physics.js:817`, `core/physics.js:821` | `systems/onboarding.js:267`, `systems/presentationOrchestrator.js:162`, `ui/alerts.js:269` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:109`, `systems/e1EncounterRuntime.js:170`, `systems/e1EncounterRuntime.js:199`, `systems/e1EncounterRuntime.js:616`, `systems/story.js:462`, `systems/story.js:476`, `systems/story.js:1162`, `systems/story.js:1501`, `systems/story.js:1592`, `systems/uniqueWrecks.js:1625` | `systems/ships.js:1053`, `ui/screens/codex.js:499` |
| `hazard:changed` | `systems/world.js:531` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:146`, `systems/world.js:3474` | `data/hazardLanguage.js:105` |
| `hazard:exit` | `systems/environmentalMachinery.js:152`, `systems/environmentalMachinery.js:179`, `systems/world.js:3484` | `data/hazardLanguage.js:106` |
| `heat:changed` | `systems/heat.js:557` | `render/vfx.js:2151`, `ui/hud.js:3275` |
| `heat:clear` | `systems/economy.js:2621` | `systems/heat.js:220` |
| `heavy:bayLaunch` | `systems/heavyPartsRuntime.js:225` | `audio/audioSystem.js:860`, `render/vfx.js:2193` |
| `heavy:beamExtracted` | `systems/mining.js:552` | `systems/capitalRuntime.js:119` |
| `heavy:chargedOreDetonated` | `systems/heavyPartsRuntime.js:371` | `audio/audioSystem.js:862`, `render/vfx.js:2195` |
| `heavy:chargedOreReleased` | `systems/heavyPartsRuntime.js:295` | `audio/audioSystem.js:861`, `render/vfx.js:2194` |
| `heavy:disabled` | `systems/heavyPartsRuntime.js:453` | `systems/capitalRuntime.js:114` |
| `heavyPart:detached` | `systems/heavyPartsRuntime.js:455` | `systems/capitalRuntime.js:110`, `systems/titles.js:459` |
| `heavyPart:lethal` | `combat/damage.js:331` | `systems/fuelStack.js:77`, `systems/heavyPartsRuntime.js:51` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:496` | `systems/missions.js:785` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:591` | `systems/missions.js:790` |
| `heist:launchCue` | `systems/heistFacilities.js:243` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:282`, `systems/heistFacilities.js:291`, `systems/heistFacilities.js:295`, `systems/heistFacilities.js:308` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:790` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:745` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:726` | — |
| `heist:receiverPrepared` | `systems/heistFacilities.js:681` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:163` |
| `hud:firstUse` | `systems/onboarding.js:384` | `ui/hud.js:1626` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:169` |
| `hud:phase` | `systems/story.js:228`, `systems/story.js:258`, `systems/story.js:261`, `systems/story.js:546` | `ui/hudMeta.js:133` |
| `hud:tagFlicker` | `systems/story.js:523` | `ui/hudMeta.js:167` |
| `insurance:cargoLienConsumed` | `systems/economy.js:2233` | — |
| `insurance:claimSettled` | `systems/economy.js:2214` | — |
| `insurance:policyPurchased` | `systems/economy.js:2141` | — |
| `interdiction:triggered` | `systems/encounterScripts.js:606`, `systems/world.js:3010` | `systems/presentationOrchestrator.js:170`, `systems/sectorSim.js:105` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:2951` | `render/feel.js:799`, `render/renderer.js:3392`, `render/renderer.js:3621`, `save/saveSystem.js:160`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:168`, `systems/sectorSim.js:114` |
| `jump:chargeAbort` | `systems/world.js:3088`, `systems/world.js:3152`, `systems/world.js:3209` | `render/renderer.js:3370`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:167`, `systems/routeFollower.js:324` |
| `jump:chargeStart` | `systems/world.js:3137`, `systems/world.js:3176` | `render/feel.js:789`, `render/renderer.js:3367`, `systems/gateControlDirector.js:64`, `systems/presentationOrchestrator.js:164`, `systems/story.js:146` |
| `jump:chargeTick` | `systems/world.js:2902` | `systems/presentationOrchestrator.js:165` |
| `jump:departurePreflight` | `systems/world.js:3121` | `systems/story.js:145` |
| `jump:start` | `systems/world.js:2913` | `render/feel.js:793`, `systems/economy.js:901`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:166`, `systems/sectorSim.js:113` |
| `jump:unfiledConfirmed` | `systems/world.js:3193` | `systems/story.js:147` |
| `landmark:artifactRecovered` | `systems/missions.js:4552` | `systems/world.js:389` |
| `law:activeHunterKilled` | — | `systems/heat.js:231` |
| `law:bountyPosted` | `systems/heat.js:503` | — |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:29`, `systems/missions.js:753` |
| `law:distressRaised` | — | `ui/signalInvestigationPrompt.js:260` |
| `law:fineNotice` | `systems/heat.js:488` | — |
| `law:majorCrimeStainChanged` | `systems/heat.js:325` | — |
| `law:reportIncidentReceipt` | — | `systems/heat.js:230` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:140` | `systems/lawSecurity.js:126` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:172` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:174` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:173` |
| `loadoutPresets:changed` | `systems/ships.js:1869`, `systems/ships.js:1941`, `systems/ships.js:1953` | — |
| `loot:collected` | `systems/cargo.js:134` | `systems/encounterDirector.js:253`, `systems/scanReveal.js:71`, `systems/story.js:182`, `systems/story.js:183`, `ui/lootHistory.js:169` |
| `loot:drop` | `systems/combat.js:788`, `systems/lootShards.js:263` | `systems/mining.js:208`, `ui/floatingText.js:155` |
| `loot:manifestPayload` | `systems/lootShards.js:333` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:299` | `systems/factionPresence.js:425`, `systems/ships.js:1033` |
| `map:sectorCharted` | `systems/world.js:2652`, `systems/world.js:3825` | `systems/economy.js:851` |
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
| `massline:bridleCut` | `systems/tetherGameplay.js:689` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:634`, `systems/tetherGameplay.js:650`, `systems/tetherGameplay.js:789` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:554` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:608` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:699` | — |
| `massline:releaseValidated` | `systems/masslineThrow.js:507` | `systems/presentationOrchestrator.js:148` |
| `massline:selfSling` | `systems/masslineThrow.js:563` | `render/renderer.js:2975`, `systems/flightV3.js:142`, `systems/onboarding.js:347` |
| `massline:snareArmed` | `systems/masslineSnares.js:211` | — |
| `massline:snareCaught` | `systems/masslineSnares.js:406` | — |
| `massline:snareCut` | `systems/masslineSnares.js:447` | — |
| `massline:snareDeployed` | `systems/masslineSnares.js:313` | — |
| `massline:snareEnded` | `systems/masslineSnares.js:449` | — |
| `massline:sweepImpact` | `systems/masslineImpacts.js:330` | `systems/masslineImpactDamage.js:42`, `systems/presentationOrchestrator.js:135` |
| `massline:threat` | `systems/masslineThreats.js:168` | `systems/presentationOrchestrator.js:111` |
| `massline:throw` | `systems/masslineThrow.js:454` | `systems/tumbleStates.js:81` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:155` | `render/feel.js:872` |
| `massline:tumbled` | `systems/tumbleStates.js:229` | `render/feel.js:858` |
| `medium:bulwarkLink` | `systems/mediumEnemyRuntime.js:240` | — |
| `medium:semanticCue` | `systems/encounterScripts.js:1741`, `systems/mediumEnemyRuntime.js:241`, `systems/mediumEnemyRuntime.js:331`, `systems/mediumEnemyRuntime.js:358`, `systems/mediumEnemyRuntime.js:418` | `audio/audioSystem.js:858` |
| `medium:torcherTrailEnded` | `systems/mediumEnemyRuntime.js:357` | — |
| `medium:torcherTrailHit` | `systems/mediumEnemyRuntime.js:417` | — |
| `medium:torcherTrailLaid` | `systems/mediumEnemyRuntime.js:330` | — |
| `mines:armed` | `systems/mines.js:141` | — |
| `mines:capReached` | `systems/mines.js:53` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:114` | `systems/mines.js:34` |
| `mines:placed` | `systems/mines.js:115` | — |
| `mines:released` | `systems/mines.js:233` | — |
| `mines:triggered` | `systems/mines.js:199` | — |
| `mining:beamCooled` | `systems/mining.js:790` | — |
| `mining:beamLocked` | `systems/mining.js:924` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:1817` | `systems/missions.js:738`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:938` | `systems/presentationOrchestrator.js:192`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:796` | — |
| `mining:npcExtraction` | `systems/traffic.js:7521` | `systems/fieldDepletion.js:432` |
| `mining:overheated` | `systems/mining.js:782` | `systems/presentationOrchestrator.js:185` |
| `mining:resonanceBeat` | `systems/mining.js:667` | — |
| `mining:resonanceResolved` | `systems/mining.js:704` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:1770` | `systems/presentationOrchestrator.js:189` |
| `mining:richCoreCompleted` | `systems/mining.js:1797` | `systems/presentationOrchestrator.js:190` |
| `mining:richCoreExposed` | `systems/mining.js:1748` | `systems/presentationOrchestrator.js:188` |
| `mining:richCoreFizzle` | `systems/mining.js:1799` | `systems/presentationOrchestrator.js:191` |
| `mining:seamHit` | `systems/mining.js:2055` | `systems/presentationOrchestrator.js:179` |
| `mining:start` | `systems/mining.js:294`, `systems/mining.js:411` | `audio/audioSystem.js:824`, `render/vfx.js:2177`, `systems/onboarding.js:200`, `systems/presentationOrchestrator.js:176` |
| `mining:stop` | `systems/mining.js:624` | `audio/audioSystem.js:825`, `render/vfx.js:2178`, `systems/presentationOrchestrator.js:177` |
| `mining:tick` | `systems/automation.js:719`, `systems/automation.js:850`, `systems/mining.js:964` | `audio/audioSystem.js:826`, `render/vfx.js:2179`, `systems/presentationOrchestrator.js:178` |
| `mining:ventBonus` | `systems/mining.js:833` | — |
| `mining:ventReady` | `systems/mining.js:762` | `systems/presentationOrchestrator.js:184` |
| `mining:yield` | `balance/careerCohorts.js:1805`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:830`, `systems/mining.js:1099`, `systems/mining.js:1431`, `systems/mining.js:1794` | `careers/origins/prospectorOrigin.js:637`, `render/feel.js:812`, `render/vfx.js:2180`, `systems/anomalyRuntime.js:407`, `systems/encounterDirector.js:275`, `systems/missions.js:729`, `systems/onboarding.js:201`, `systems/presentationOrchestrator.js:186`, `ui/floatingText.js:140` |
| `miningDrone:sellOre` | — | `systems/economy.js:866` |
| `mission:abandoned` | — | `careers/origins/haulerOriginSystem.js:72`, `ui/hud.js:3245` |
| `mission:accepted` | `systems/missions.js:2196` | `audio/audioSystem.js:846`, `save/saveSystem.js:161`, `systems/aftermathWrecks.js:551`, `systems/contractClauses.js:196`, `systems/onboarding.js:203`, `ui/hud.js:3243`, `ui/screens/missionLog.js:1949`, `ui/screens/stationHub.js:2804` |
| `mission:bountyTargetContacted` | `systems/missions.js:5794` | `systems/world.js:398` |
| `mission:completed` | `systems/missions.js:5440` | `audio/audioSystem.js:847`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:162`, `systems/aftermathWrecks.js:552`, `systems/contractClauses.js:200`, `systems/factions.js:212`, `systems/onboarding.js:204`, `systems/story.js:163`, `ui/hud.js:3244`, `ui/screens/missionLog.js:1950`, `ui/screens/stationHub.js:2811` |
| `mission:conditionBroken` | `systems/contractClauses.js:306`, `systems/missions.js:1019` | — |
| `mission:conditionPending` | `systems/missions.js:1071` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:274`, `systems/missions.js:1002` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:285`, `systems/missions.js:1010` | `systems/missions.js:824` |
| `mission:expired` | `systems/missions.js:5548` | `audio/audioSystem.js:851`, `save/saveSystem.js:164`, `systems/aftermathWrecks.js:554`, `systems/factions.js:221`, `ui/screens/missionLog.js:1952`, `ui/screens/stationHub.js:2813` |
| `mission:failed` | `systems/missions.js:5508` | `audio/audioSystem.js:850`, `careers/origins/haulerOriginSystem.js:71`, `save/saveSystem.js:163`, `systems/aftermathWrecks.js:553`, `systems/factions.js:220`, `ui/screens/missionLog.js:1951`, `ui/screens/stationHub.js:2812` |
| `mission:forceEvent` | — | `systems/economy.js:906` |
| `mission:offerBoarded` | `systems/missions.js:1566` | `systems/aftermathWrecks.js:550` |
| `mission:offered` | `systems/aftermathWrecks.js:772`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:438`, `systems/economyContracts.js:229`, `systems/economyContracts.js:251`, `systems/lossLedger.js:275`, `systems/postEndingReplay.js:340`, `systems/salvage.js:645`, `systems/uniqueWrecks.js:813` | `systems/lossInvestigation.js:106`, `systems/missions.js:695`, `systems/survivorPod.js:371` |
| `mission:setPieceTransition` | `systems/missions.js:5277` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:6714` | — |
| `mission:spawnDeferred` | `systems/missions.js:6425` | — |
| `mission:updated` | `systems/contractClauses.js:279`, `systems/contractClauses.js:289`, `systems/contractClauses.js:318`, `systems/missions.js:1006`, `systems/missions.js:1014`, `systems/missions.js:1031`, `systems/missions.js:1101`, `systems/missions.js:1173`, `systems/missions.js:1274`, `systems/missions.js:1326`, `systems/missions.js:1457`, `systems/missions.js:1491`, `systems/missions.js:1503`, `systems/missions.js:1565`, `systems/missions.js:2118`, `systems/missions.js:2208`, `systems/missions.js:2412`, `systems/missions.js:2602`, `systems/missions.js:3179`, `systems/missions.js:3278`, `systems/missions.js:3349`, `systems/missions.js:3439`, `systems/missions.js:3513`, `systems/missions.js:3588`, `systems/missions.js:3692`, `systems/missions.js:3705`, `systems/missions.js:3831`, `systems/missions.js:3904`, `systems/missions.js:3927`, `systems/missions.js:3943`, `systems/missions.js:3979`, `systems/missions.js:3992`, `systems/missions.js:4000`, `systems/missions.js:4016`, `systems/missions.js:4153`, `systems/missions.js:4226`, `systems/missions.js:4348`, `systems/missions.js:4443`, `systems/missions.js:4452`, `systems/missions.js:4585`, `systems/missions.js:4611`, `systems/missions.js:4679`, `systems/missions.js:4695`, `systems/missions.js:4737`, `systems/missions.js:4758`, `systems/missions.js:4794`, `systems/missions.js:4844`, `systems/missions.js:5091`, `systems/missions.js:5127`, `systems/missions.js:5134`, `systems/missions.js:5429`, `systems/missions.js:5519`, `systems/missions.js:5558`, `systems/missions.js:5864`, `systems/missions.js:5923`, `systems/missions.js:6005`, `systems/missions.js:6087`, `systems/missions.js:6169`, `systems/missions.js:6416`, `systems/missions.js:6557`, `systems/missions.js:6572`, `systems/missions.js:6611`, `systems/missions.js:6652`, `systems/missions.js:6796`, `systems/missions.js:7052`, `systems/missions.js:7198` | `ui/hud.js:3242`, `ui/screens/missionLog.js:1948`, `ui/screens/stationHub.js:2798`, `ui/station/screens/contracts.js:505` |
| `mode:changed` | `main.js:591`, `main.js:601`, `main.js:612`, `save/saveSystem.js:2265`, `save/saveSystem.js:2355` | `render/renderer.js:3608`, `systems/autoTargetAssist.js:93`, `systems/presentationAdapters.js:168`, `systems/scanner.js:810`, `ui/loadingPresenter.js:47`, `ui/screenManager.js:449`, `ui/uiRoot.js:578`, `ui/wingmanRadial.js:180` |
| `module:equipped` | `systems/ships.js:2049` | `systems/ships.js:979`, `systems/world.js:355`, `ui/screens/stationHub.js:2784` |
| `module:granted` | `systems/ships.js:1664` | — |
| `module:purchased` | `systems/ships.js:1651` | `ui/screens/stationHub.js:2786` |
| `module:unequipped` | `systems/ships.js:1567`, `systems/ships.js:2068` | `systems/ships.js:980`, `systems/world.js:356`, `ui/screens/stationHub.js:2785` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:266` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:448` | — |
| `moralTrap:choose` | — | `systems/moralTrap.js:73` |
| `moralTrap:resolved` | `systems/moralTrap.js:118` | — |
| `moralTrap:revealed` | `systems/moralTrap.js:91` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:3207`, `systems/rareSpawnRuntime.js:783` | — |
| `namedAce:defeated` | `systems/rareSpawnRuntime.js:834` | — |
| `namedAce:fled` | `systems/rareSpawnRuntime.js:819` | — |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:821`, `systems/world.js:3244` | `systems/routeFollower.js:319` |
| `nav:autopilotStopped` | `systems/flightV3.js:829` | `systems/world.js:353` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:2581`, `systems/claims.js:1813`, `systems/claims.js:1821`, `systems/factions.js:470`, `systems/factions.js:501`, `systems/factions.js:569`, `systems/missions.js:710`, `systems/missions.js:2591`, `systems/missions.js:2658`, `systems/missions.js:2690`, `systems/missions.js:3961`, `systems/world.js:3243`, `ui/screens/market.js:1893` | `ui/screens/stationHub.js:2793`, `ui/screens/stationHub.js:2794` |
| `nav:waypointQueue` | `systems/world.js:3254`, `systems/world.js:3266`, `systems/world.js:3292` | — |
| `news:dockCards` | `ui/marketNews.js:292` | — |
| `news:headline` | `systems/aftermathWrecks.js:415`, `systems/e1EncounterRuntime.js:226`, `systems/endgameReplay.js:173`, `systems/endgameReplay.js:181`, `systems/rareSpawnRuntime.js:18`, `systems/setpieceEventRuntime.js:19`, `systems/setpieceEventRuntime.js:53`, `systems/traffic.js:7047`, `systems/traffic.js:8711`, `ui/marketNews.js:199` | — |
| `news:publish` | `systems/traffic.js:3026`, `systems/uniqueWrecks.js:413`, `systems/uniqueWrecks.js:1669`, `systems/world.js:545`, `systems/world.js:1732` | — |
| `npcjobs:commission` | — | `systems/traffic.js:1025` |
| `npcjobs:hold` | — | `systems/traffic.js:1029` |
| `npcjobs:load` | — | `systems/traffic.js:1027` |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:1692` | — |
| `npcjobs:unload` | — | `systems/traffic.js:1028` |
| `npcjobs:work` | — | `systems/traffic.js:1026` |
| `orrinWitness:ensureEvidence` | `systems/story.js:997` | `systems/world.js:363` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1244` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1022` | — |
| `orrinWitness:submitted` | `systems/story.js:1050` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:4290` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:543` | `systems/world.js:365` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:4085` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:4120` | — |
| `pallasHiddenCache:pickupReady` | `systems/world.js:4250` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:4203` | — |
| `patrol:proximity` | `systems/encounterScripts.js:512` | `systems/economy.js:902` |
| `physics:attachmentBroken` | — | `combat/kernel.js:73` |
| `physics:impact` | `core/physics.js:1206` | `render/vfx.js:2131`, `systems/anomalyRuntime.js:411`, `systems/asteroidSites.js:215`, `systems/collisionConsequences.js:55`, `systems/fragileCargo.js:202`, `systems/heavyPartsRuntime.js:53`, `systems/heistFacilities.js:162`, `systems/jettisonImpulse.js:33`, `systems/masslineImpactDamage.js:43`, `systems/onboarding.js:223`, `systems/timeTrials.js:373` |
| `pickup:collected` | `core/physics.js:1120`, `systems/jettisonImpulse.js:181`, `systems/mining.js:1907`, `systems/uniqueWrecks.js:1550` | `audio/audioSystem.js:833`, `render/vfx.js:2201`, `systems/cargo.js:283`, `systems/encounterDirector.js:252`, `systems/mining.js:210`, `systems/onboarding.js:202`, `systems/onboarding.js:224`, `systems/presentationOrchestrator.js:193`, `systems/traffic.js:1040`, `systems/world.js:366`, `systems/world.js:367`, `systems/world.js:368`, `ui/floatingText.js:170` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:189` | `systems/pirateParley.js:43` |
| `pirateParley:demand` | `systems/scanner.js:1182` | `ui/pirateParleyPrompt.js:248`, `ui/signalInvestigationPrompt.js:259` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:249` |
| `planet:collector` | `systems/planetRuntime.js:542` | — |
| `planet:harvest` | `systems/planetRuntime.js:575` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:579` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:390`, `systems/planetRuntime.js:415` | `audio/audioSystem.js:831`, `systems/missions.js:818`, `systems/onboarding.js:230`, `systems/timeTrials.js:375`, `testing/metrics/arcadeCoreAtmosphereRoute.js:114` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:527` | — |
| `planet:registered` | `systems/planetRuntime.js:195` | `systems/onboarding.js:229` |
| `planet:unregistered` | `systems/planetRuntime.js:227` | — |
| `player:death` | `combat/playerDefeat.js:526`, `systems/combat.js:704`, `systems/combat.js:820`, `systems/combat.js:986` | `audio/audioSystem.js:822`, `render/feel.js:759`, `render/vfx.js:2176`, `save/saveSystem.js:136`, `systems/lawSecurity.js:128`, `systems/surrenderRecovery.js:71`, `systems/timeTrials.js:380`, `testing/metrics/arcadeCorePacingRoute.js:354`, `ui/commandBar.js:405`, `ui/hud.js:1870` |
| `player:recoveryFailed` | `combat/playerDefeat.js:716`, `systems/combat.js:858` | `ui/screens/gameOver.js:313` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:238` | `systems/combat.js:586` |
| `player:rescueRequested` | `ui/screens/gameOver.js:234`, `ui/screens/gameOver.js:250` | `systems/combat.js:587` |
| `player:respawn` | `combat/playerDefeat.js:634`, `systems/combat.js:923`, `systems/combat.js:999` | `audio/audioSystem.js:823`, `render/renderer.js:2979`, `save/saveSystem.js:137`, `save/saveSystem.js:170`, `ui/commandBar.js:409`, `ui/hud.js:1884`, `ui/screens/gameOver.js:305` |
| `player:scannedByPatrol` | `systems/economy.js:2711`, `systems/economy.js:2724`, `systems/economy.js:2727` | `render/vfx.js:2150`, `systems/missions.js:812`, `ui/customsPrompt.js:130` |
| `playerDefeat:podDrifting` | `systems/survivorPod.js:482` | — |
| `playerDefeat:podRescued` | `systems/survivorPod.js:867` | `systems/combat.js:588` |
| `playerDefeat:recoveryTowOffered` | `systems/aftermathWrecks.js:688` | — |
| `playerDefeat:rescueAuthorized` | `combat/playerDefeat.js:585` | `systems/traffic.js:1021` |
| `playerDefeat:rescueInbound` | `combat/playerDefeat.js:596` | `ui/screens/gameOver.js:317` |
| `playerDefeat:rescueWaiting` | `combat/playerDefeat.js:552` | `ui/screens/gameOver.js:316` |
| `playerDefeat:wreckDelivered` | `systems/aftermathWrecks.js:1280` | `systems/combat.js:589` |
| `playerDefeat:wreckRecovered` | `systems/aftermathWrecks.js:1291` | — |
| `poi:discovered` | `systems/fuelStack.js:101`, `systems/salvage.js:602`, `systems/survivorPod.js:612`, `systems/world.js:574`, `systems/world.js:3400`, `systems/world.js:3430`, `systems/world.js:3594`, `systems/world.js:3620` | `systems/encounterDirector.js:268`, `systems/world.js:394` |
| `poi:identified` | `systems/world.js:3437`, `systems/world.js:3621` | `systems/encounterDirector.js:269`, `systems/missions.js:697`, `systems/world.js:395` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:1971` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:1970` |
| `presentation:audioCue` | `systems/presentationAdapters.js:506` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:428` | — |
| `presentation:caption` | `systems/factionPresence.js:639`, `systems/factionPresence.js:969`, `systems/factionPresence.js:984`, `systems/factionPresence.js:1002`, `systems/factionPresence.js:1064`, `systems/presentationAdapters.js:598`, `systems/story.js:941`, `systems/story.js:1105` | `ui/hud.js:1935` |
| `presentation:cue` | — | `audio/audioSystem.js:913`, `render/vfx.js:2198`, `render/vfx.js:2199`, `systems/presentationAdapters.js:165` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:410` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:337`, `systems/presentationAdapters.js:577` | — |
| `presentation:vfxCue` | `combat/cookOff.js:330`, `render/vfx.js:2210`, `systems/fields.js:842`, `systems/fields.js:858`, `systems/impulseCharges.js:453`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:456`, `systems/mining.js:673`, `systems/mining.js:707`, `systems/missions.js:2221`, `systems/missions.js:5445`, `systems/planetRuntime.js:599`, `systems/presentationAdapters.js:474`, `systems/tumbleStates.js:234`, `systems/weapons.js:1004`, `systems/weapons.js:1072` | `render/vfx.js:2200` |
| `projectile:hit` | `core/physics.js:647`, `core/physics.js:715`, `systems/sectorSim.js:548` | `audio/audioSystem.js:795`, `render/vfx.js:2126`, `systems/anomalyRuntime.js:410`, `systems/combat.js:579`, `systems/heavyPartsRuntime.js:52`, `systems/onboarding.js:222`, `testing/metrics/arcadeCorePacingRoute.js:359` |
| `projectile:nearMiss` | `core/physics.js:693` | `systems/presentationOrchestrator.js:156` |
| `quartermaster:voice` | `systems/stationContacts.js:379` | — |
| `rareSpawn:resolved` | `systems/rareSpawnRuntime.js:118` | — |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:548` | — |
| `recovery:started` | — | `ui/signalInvestigationPrompt.js:258` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:547` | — |
| `recurringRival:salvageBidDecision` | `systems/traffic.js:7345`, `systems/traffic.js:7356`, `systems/traffic.js:7369`, `systems/traffic.js:7389` | — |
| `recurringRival:salvageRaceResolved` | — | `systems/traffic.js:1033` |
| `recurringRival:salvageRaceStarted` | `systems/traffic.js:4860` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:155` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:156` |
| `research:grant` | `systems/lootShards.js:273`, `systems/ships.js:1513` | `systems/missions.js:696` |
| `research:pointsChanged` | `systems/missions.js:4512` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:2119` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1093` | `systems/encounterDirector.js:277` |
| `rumor:ghostConvoy` | `systems/lossLedger.js:274` | — |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:646` | `systems/encounterDirector.js:270`, `systems/story.js:189` |
| `salvage:completed` | `systems/mining.js:1484` | `systems/aftermathWrecks.js:547`, `systems/anomalyRuntime.js:408`, `systems/encounterDirector.js:271`, `systems/missions.js:733` |
| `salvage:cutComplete` | `systems/mining.js:445` | — |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:351` | — |
| `salvage:npcExtraction` | `systems/traffic.js:4675` | `systems/missions.js:736` |
| `salvage:npcUnload` | `systems/traffic.js:8409` | `systems/economy.js:877` |
| `salvage:placed` | `systems/salvage.js:337` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:369` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:823` | — |
| `save:completed` | `save/saveSystem.js:829` | `ui/uiRoot.js:292` |
| `save:error` | `main.js:137`, `save/saveSystem.js:566`, `save/saveSystem.js:621`, `save/saveSystem.js:635`, `save/saveSystem.js:833`, `save/saveSystem.js:1072`, `save/saveSystem.js:1361`, `save/saveSystem.js:2051`, `save/saveSystem.js:2056`, `save/saveSystem.js:2087`, `save/saveSystem.js:2095`, `save/saveSystem.js:2106`, `save/saveSystem.js:2151`, `save/saveSystem.js:2169`, `save/saveSystem.js:2372`, `save/saveSystem.js:2380`, `save/saveSystem.js:2407`, `save/saveSystem.js:2759`, `save/saveSystem.js:2772`, `save/saveSystem.js:2786` | `systems/aftermathWrecks.js:559`, `systems/asteroidSites.js:214`, `systems/automation.js:511`, `systems/encounterDirector.js:244`, `ui/loadingPresenter.js:55`, `ui/screenManager.js:450`, `ui/uiRoot.js:314` |
| `save:exportRecovery` | `save/saveSystem.js:2748` | — |
| `save:loaded` | `save/saveSystem.js:2358` | `audio/audioSystem.js:960`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:121`, `core/physics.js:81`, `main.js:188`, `render/feel.js:687`, `render/renderer.js:2978`, `render/renderer.js:3629`, `render/vfx.js:2158`, `save/saveSystem.js:149`, `systems/aftermathWrecks.js:558`, `systems/anomalyRuntime.js:406`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:205`, `systems/automation.js:506`, `systems/beacons.js:37`, `systems/collisionConsequences.js:59`, `systems/combat.js:598`, `systems/economy.js:910`, `systems/encounterDirector.js:243`, `systems/environmentalMachinery.js:48`, `systems/factionPresence.js:431`, `systems/factions.js:164`, `systems/fields.js:164`, `systems/flight.js:74`, `systems/flightV3.js:133`, `systems/gateControlDirector.js:70`, `systems/heat.js:217`, `systems/jettisonImpulse.js:34`, `systems/lawSecurity.js:125`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:122`, `systems/mediumEnemyRuntime.js:149`, `systems/mines.js:38`, `systems/missions.js:682`, `systems/npcJobsRuntime.js:400`, `systems/npcJobsRuntime.js:408`, `systems/onboarding.js:187`, `systems/planetRuntime.js:106`, `systems/presentationAdapters.js:172`, `systems/presentationOrchestrator.js:219`, `systems/routeFollower.js:336`, `systems/salvage.js:84`, `systems/sectorSim.js:98`, `systems/ships.js:984`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:93`, `systems/story.js:127`, `systems/survivorPod.js:375`, `systems/tacticalAI.js:114`, `systems/tetherGameplay.js:142`, `systems/timeTrials.js:387`, `systems/titles.js:461`, `systems/traffic.js:1050`, `systems/travelLanes.js:288`, `systems/uniqueLootAbilities.js:117`, `systems/world.js:375`, `ui/bandHud.js:82`, `ui/hudLayout.js:120`, `ui/priceHistory.js:120`, `ui/radar.js:654`, `ui/uiRoot.js:299`, `ui/uiRoot.js:976` |
| `save:recovered` | `save/saveSystem.js:2076` | `ui/uiRoot.js:307` |
| `save:restoring` | `save/saveSystem.js:2191` | `core/coreSystem.js:118`, `render/feel.js:686`, `render/renderer.js:3016`, `render/vfx.js:2157`, `systems/aftermathWrecks.js:557`, `systems/anomalyRuntime.js:405`, `systems/asteroidSites.js:197`, `systems/automation.js:500`, `systems/encounterDirector.js:236`, `systems/environmentalMachinery.js:47`, `systems/fuelStack.js:80`, `systems/fuelTenderService.js:38`, `systems/lawSecurity.js:124`, `systems/missions.js:686`, `systems/npcJobsRuntime.js:401`, `systems/salvage.js:79`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:72`, `systems/timeTrials.js:386`, `systems/traffic.js:1041`, `systems/world.js:371` |
| `save:started` | `save/saveSystem.js:624`, `save/saveSystem.js:1122` | `ui/screenManager.js:457`, `ui/uiRoot.js:288` |
| `scan:completed` | `balance/careerCohorts.js:477`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:926`, `systems/world.js:3404` | `careers/origins/prospectorOrigin.js:634`, `systems/aftermathWrecks.js:544`, `systems/missions.js:760`, `systems/onboarding.js:214`, `systems/presentationOrchestrator.js:172`, `systems/salvage.js:76`, `systems/salvageActions.js:70`, `systems/story.js:177`, `ui/hud.js:3589` |
| `scan:pulse` | `systems/scanner.js:864` | `systems/buildIdentity.js:268`, `systems/encounterDirector.js:261`, `systems/pirateDisguise.js:39`, `systems/presentationOrchestrator.js:171`, `systems/scanReveal.js:67`, `ui/hud.js:3590` |
| `scan:shipRevealed` | `systems/scanReveal.js:95` | `systems/buildIdentity.js:267`, `systems/scanReveal.js:68` |
| `scan:weakPoint` | `systems/scanner.js:915` | `ui/hud.js:1277` |
| `scanner:ghostEscaped` | `systems/scanner.js:847` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:894` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:137` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:154` | `systems/presentationOrchestrator.js:85` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:572` | `systems/presentationOrchestrator.js:216` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:359` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:547` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:132` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:122` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:189` | — |
| `scenario:scavengerResponse` | `ui/comms.js:468`, `ui/comms.js:472` | `systems/scenarioRuntime.js:29` |
| `secret:listeningPostDecodeFailed` | `systems/world.js:3793` | `ui/screens/codex.js:508` |
| `secret:listeningPostDecodeRequested` | `ui/screens/codex.js:727` | `systems/world.js:362` |
| `secret:listeningPostDecoded` | `systems/world.js:3830` | `ui/screens/codex.js:509` |
| `secret:listeningPostLogRecovered` | `systems/world.js:3648` | `ui/screens/codex.js:507` |
| `sector:discovered` | `systems/world.js:679` | `systems/presentationOrchestrator.js:169` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:692`, `testing/metrics/arcadeCorePacingRoute.js:159` | `audio/audioSystem.js:886`, `render/renderer.js:3435`, `render/vfx.js:2153`, `save/saveSystem.js:159`, `systems/aftermathWrecks.js:545`, `systems/asteroidFormations.js:120`, `systems/asteroidSites.js:190`, `systems/automation.js:536`, `systems/claims.js:248`, `systems/economy.js:891`, `systems/encounterDirector.js:232`, `systems/factionPresence.js:422`, `systems/factions.js:165`, `systems/fields.js:162`, `systems/fuelStack.js:75`, `systems/heistFacilities.js:159`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:119`, `systems/mines.js:36`, `systems/mining.js:213`, `systems/missions.js:835`, `systems/moralTrap.js:72`, `systems/npcJobsRuntime.js:391`, `systems/presentationOrchestrator.js:206`, `systems/routeFollower.js:328`, `systems/salvage.js:74`, `systems/sectorSim.js:95`, `systems/story.js:144`, `systems/story.js:176`, `systems/survivorPod.js:370`, `systems/tetherGameplay.js:146`, `systems/timeTrials.js:371`, `systems/traffic.js:1013`, `systems/wingmen.js:50`, `ui/causeLedger.js:132`, `ui/commandBar.js:415`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/radar.js:655`, `ui/radar.js:656`, `ui/sectorPostcard.js:148`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:621` | `render/renderer.js:3399`, `render/vfx.js:2154`, `systems/aftermathWrecks.js:546`, `systems/anomalyRuntime.js:402`, `systems/asteroidSites.js:196`, `systems/automation.js:525`, `systems/claims.js:256`, `systems/encounterDirector.js:234`, `systems/environmentalMachinery.js:45`, `systems/factionPresence.js:423`, `systems/fields.js:161`, `systems/fuelStack.js:76`, `systems/fuelTenderService.js:37`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:160`, `systems/lawSecurity.js:123`, `systems/massSeed.js:118`, `systems/masslineSnares.js:118`, `systems/mediumEnemyRuntime.js:147`, `systems/mines.js:35`, `systems/missions.js:836`, `systems/npcJobsRuntime.js:390`, `systems/planetRuntime.js:107`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:50`, `systems/stationSideEventDirector.js:92`, `systems/surrenderRecovery.js:70`, `systems/tetherGameplay.js:145`, `systems/timeTrials.js:372`, `systems/traffic.js:1016`, `systems/wingmen.js:53`, `ui/customsPrompt.js:132`, `ui/encounterChoicePrompt.js:145`, `ui/lawfulInspectionPrompt.js:175` |
| `sectorsim:embodiment` | `systems/sectorSim.js:801` | `systems/world.js:406` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:318` | `ui/screens/starmap.js:583` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:822`, `systems/claims.js:1775`, `systems/encounterDirector.js:1932`, `systems/mining.js:2007` | `systems/sectorSim.js:103` |
| `sectorsim:intel` | `systems/sectorSim.js:855` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:639` | `systems/economy.js:921` |
| `sectorsim:reconcile` | `systems/sectorSim.js:596` | — |
| `sectorsim:tick` | `systems/sectorSim.js:263` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:559` | `ui/screens/starmap.js:584` |
| `seededRun:finalized` | `systems/endgameReplay.js:378` | — |
| `seededRun:restored` | `systems/endgameReplay.js:137` | — |
| `seededRun:scoreChanged` | `systems/endgameReplay.js:362` | — |
| `seededRun:started` | `systems/endgameReplay.js:110` | — |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:594` | — |
| `service:completed` | `systems/economy.js:2513`, `systems/economy.js:2560`, `systems/economy.js:2583`, `systems/economy.js:2622` | `systems/ships.js:1038` |
| `setpiece:revealed` | `systems/setpieceEventRuntime.js:268`, `systems/setpieceEventRuntime.js:395`, `systems/setpieceEventRuntime.js:500`, `systems/setpieceEventRuntime.js:597` | — |
| `settings:changed` | `save/saveSystem.js:2388`, `save/saveSystem.js:2389`, `systems/touch.js:275`, `ui/lootHistory.js:180`, `ui/screens/settings.js:251`, `ui/screens/settings.js:590`, `ui/screens/settings.js:665` | `audio/audioSystem.js:934`, `main.js:187`, `render/renderer.js:2984`, `render/vfx.js:2172`, `save/saveSystem.js:131`, `ui/lootHistory.js:174`, `ui/uiRoot.js:478` |
| `ship:appearanceChanged` | `systems/ships.js:1406`, `systems/ships.js:1784`, `systems/traffic.js:2566` | `core/coreSystem.js:117`, `render/renderer.js:2934`, `render/vfx.js:2147` |
| `ship:appearanceSaved` | `systems/ships.js:1786` | — |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:184` | `audio/audioSystem.js:893`, `render/vfx.js:2183`, `systems/cruise.js:25` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:185`, `systems/flightV3.js:412` | `audio/audioSystem.js:898`, `render/renderer.js:2972`, `render/vfx.js:2184` |
| `ship:cargoCapChanged` | `systems/ships.js:1401` | `systems/cargo.js:335` |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:391` | `audio/audioSystem.js:899`, `render/feel.js:693`, `render/vfx.js:2185`, `systems/uniqueLootAbilities.js:115` |
| `ship:livingHullChanged` | `systems/ships.js:1232`, `systems/ships.js:1282` | `render/renderer.js:2942` |
| `ship:lossRefitApplied` | `systems/ships.js:1149` | — |
| `ship:lostHullRecovered` | `systems/ships.js:1175` | — |
| `ship:massChanged` | `systems/ships.js:1680` | — |
| `ship:newGamePlusCosmeticsApplied` | `systems/ships.js:1830` | — |
| `ship:purchased` | `systems/ships.js:1716` | `audio/audioSystem.js:885`, `systems/missions.js:839`, `ui/screens/stationHub.js:2782` |
| `ship:registryFiled` | `systems/ships.js:1803` | — |
| `ship:roleContext` | `systems/ships.js:1340` | `systems/presentationAdapters.js:167` |
| `ship:sold` | `systems/ships.js:1737` | `ui/screens/stationHub.js:2783` |
| `ship:statsChanged` | `systems/ships.js:1400` | `systems/cargo.js:336`, `systems/world.js:357`, `ui/commandBar.js:410`, `ui/hud.js:3241`, `ui/screens/stationHub.js:2756`, `ui/screens/stationHub.js:2778`, `ui/screens/stationHub.js:2779`, `ui/screens/stationHub.js:2780`, `ui/screens/stationHub.js:2781` |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1211` | `render/vfx.js:2182` |
| `signal:investigate` | — | `systems/scanner.js:804` |
| `signal:investigated` | `systems/scanner.js:1379` | `systems/missions.js:774`, `systems/presentationOrchestrator.js:175`, `systems/story.js:129`, `systems/world.js:361`, `ui/signalInvestigationPrompt.js:257` |
| `signal:investigating` | `systems/scanner.js:1141` | `ui/signalInvestigationPrompt.js:256` |
| `signal:receipt` | `systems/scanner.js:1380` | — |
| `signal:scanResults` | `systems/scanner.js:927` | `systems/missions.js:766`, `systems/presentationOrchestrator.js:173`, `ui/screens/codex.js:501`, `ui/signalInvestigationPrompt.js:254` |
| `signal:track` | — | `systems/scanner.js:803` |
| `signal:tracked` | `systems/scanner.js:1158` | `systems/presentationOrchestrator.js:174`, `ui/signalInvestigationPrompt.js:255` |
| `sim:jumpGate` | — | `systems/economy.js:900` |
| `sim:pause` | `ui/screenManager.js:299` | `audio/audioSystem.js:950`, `render/feel.js:684` |
| `sim:resume` | `ui/screenManager.js:306` | `audio/audioSystem.js:951` |
| `site:anchored` | `systems/asteroidSites.js:835` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1727` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1655` | — |
| `site:courierLost` | `systems/asteroidSites.js:1710` | — |
| `site:created` | `systems/asteroidSites.js:785` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1129`, `systems/asteroidSites.js:1213` | — |
| `site:lost` | `systems/asteroidSites.js:1326` | — |
| `site:machineInstalled` | `systems/asteroidSites.js:809` | — |
| `site:machineMode` | `systems/asteroidSites.js:1235` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1146` | — |
| `site:overlayChanged` | `systems/asteroidSites.js:1219` | — |
| `site:podBuilt` | `systems/asteroidSites.js:1565` | — |
| `site:producing` | `systems/asteroidSites.js:1013` | `ui/asteroid/asteroidScreen.js:639` |
| `site:rematerialized` | `systems/asteroidSites.js:1371` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:931` | `ui/asteroid/asteroidScreen.js:624` |
| `site:surveyComplete` | `systems/asteroidSites.js:875` | `ui/asteroid/asteroidScreen.js:618` |
| `site:surveyDetected` | `systems/asteroidSites.js:865` | `ui/asteroid/asteroidScreen.js:611` |
| `smuggling:dropCacheChanged` | `systems/world.js:4451` | — |
| `smuggling:dropCacheSold` | `systems/world.js:4549` | — |
| `smuggling:dropCacheStashed` | `systems/world.js:4402` | — |
| `smuggling:patrolDecoyCommitted` | `systems/encounterScripts.js:544` | — |
| `smuggling:patrolDecoyResolved` | `systems/encounterScripts.js:423` | `systems/missions.js:809` |
| `smuggling:patrolEvaded` | `systems/encounterScripts.js:464` | `systems/missions.js:808` |
| `spawn:request` | `systems/automation.js:1220` | `systems/world.js:390` |
| `specialist:repairDroneLaunched` | `systems/encounterScripts.js:756` | — |
| `specialist:repairTenderStopped` | `systems/encounterScripts.js:867` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:226` | — |
| `station:exitRequest` | `ui/screenManager.js:414`, `ui/uiRoot.js:886` | `ui/screens/stationHub.js:2735`, `ui/station/stationApp.js:1020` |
| `station:navigate` | `ui/screens/automationPanel.js:985`, `ui/station/screens/bar.js:413`, `ui/station/screens/bar.js:418`, `ui/station/screens/industry.js:190` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:246` | `render/vfx.js:2181` |
| `stationContact:changed` | `systems/stationContacts.js:360`, `systems/stationContacts.js:525`, `systems/stationContacts.js:582`, `systems/stationContacts.js:618`, `systems/stationContacts.js:673`, `systems/stationContacts.js:697` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:249`, `systems/stationContacts.js:714` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:606` | — |
| `story:awardPersistentCargo` | `systems/endgameReplay.js:305` | `systems/story.js:181` |
| `story:beatAdvanced` | `systems/missions.js:7038` | `save/saveSystem.js:166`, `systems/onboarding.js:232`, `systems/story.js:122`, `ui/screens/codex.js:497` |
| `story:elroyResolved` | `systems/missions.js:4881` | `systems/story.js:123` |
| `story:kurtzLedger` | `systems/story.js:1377`, `systems/story.js:1388` | — |
| `story:newGamePlusStarted` | `systems/story.js:1538` | `systems/titles.js:463`, `ui/hudMeta.js:95` |
| `story:persistentCargoAwarded` | `systems/story.js:1428` | — |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1754` | — |
| `story:postEndingContinuity` | `systems/story.js:1280` | — |
| `story:postEndingProgress` | `systems/story.js:1250` | `ui/screens/missionLog.js:1968` |
| `story:replayHookUnlocked` | `systems/story.js:1265` | `ui/screens/missionLog.js:1969` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1084` | — |
| `story:vergeObserversRevealed` | `systems/story.js:940` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1104` | — |
| `surrender:secured` | — | `systems/traffic.js:1037` |
| `surrender:tethered` | — | `systems/traffic.js:1036` |
| `survivor:returnGift` | `systems/e1EncounterRuntime.js:417` | — |
| `survivorPod:choose` | — | `systems/survivorPod.js:372` |
| `survivorPod:ejected` | `systems/survivorPod.js:481`, `systems/survivorPod.js:715` | `systems/aftermathWrecks.js:543`, `systems/traffic.js:1019` |
| `survivorPod:promoted` | `systems/survivorPod.js:971` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:1065` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:1077` | — |
| `survivorPod:resolved` | `systems/survivorPod.js:866`, `systems/survivorPod.js:905` | `systems/traffic.js:1020` |
| `survivorPod:stripped` | `systems/survivorPod.js:1116` | — |
| `tech:featGateRevealed` | `systems/ships.js:1466` | — |
| `tech:researched` | `systems/ships.js:1444` | `audio/audioSystem.js:884`, `systems/onboarding.js:308`, `systems/ships.js:981`, `ui/screens/manufacture.js:222`, `ui/screens/stationHub.js:2787` |
| `tech:respecced` | `systems/ships.js:1520` | — |
| `tether:attached` | `combat/attachments.js:322` | `render/vfx.js:2120`, `systems/encounterDirector.js:265`, `systems/presentationOrchestrator.js:86`, `systems/scenarioRuntime.js:23`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:267`, `systems/tetherGameplay.js:963` | `careers/origins/prospectorOrigin.js:646`, `systems/onboarding.js:212`, `systems/surrenderRecovery.js:67` |
| `tether:broken` | `combat/attachments.js:440` | `render/feel.js:824`, `render/renderer.js:2974`, `render/vfx.js:2123`, `systems/presentationOrchestrator.js:94`, `systems/scenarioRuntime.js:27`, `systems/tetherGameplay.js:147` |
| `tether:cut` | `systems/tetherGameplay.js:241`, `systems/tetherGameplay.js:1331` | `systems/masslineThrow.js:68`, `systems/timeTrials.js:374` |
| `tether:latchDenied` | `systems/masslineSnares.js:464`, `systems/tetherGameplay.js:188`, `systems/tetherGameplay.js:357`, `systems/tetherGameplay.js:400`, `systems/tetherGameplay.js:405`, `systems/tetherGameplay.js:415`, `systems/tetherGameplay.js:430`, `systems/tetherGameplay.js:718` | — |
| `tether:latched` | `systems/tetherGameplay.js:450` | `careers/origins/prospectorOrigin.js:643`, `systems/flightV3.js:141`, `systems/missions.js:792`, `systems/onboarding.js:207`, `systems/onboarding.js:225`, `systems/onboarding.js:331`, `systems/onboarding.js:341`, `systems/surrenderRecovery.js:64`, `systems/survivorPod.js:377`, `systems/titles.js:460`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1218` | — |
| `tether:nearBreak` | `combat/attachments.js:769` | `systems/onboarding.js:213`, `systems/presentationOrchestrator.js:87` |
| `tether:rebound` | `combat/attachments.js:712` | — |
| `tether:reel` | `combat/attachments.js:374` | `systems/missions.js:775`, `systems/onboarding.js:210`, `systems/surrenderRecovery.js:65` |
| `tether:reelPump` | `systems/masslineTelemetry.js:247` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:243`, `systems/tetherGameplay.js:268`, `systems/tetherGameplay.js:961`, `systems/tetherGameplay.js:964`, `systems/tetherGameplay.js:1333` | `render/feel.js:850`, `render/vfx.js:2122`, `systems/presentationOrchestrator.js:147` |
| `tether:released` | `systems/tetherGameplay.js:242`, `systems/tetherGameplay.js:960`, `systems/tetherGameplay.js:1332` | `render/renderer.js:2973`, `render/vfx.js:2121`, `systems/onboarding.js:211`, `systems/onboarding.js:226`, `systems/surrenderRecovery.js:66` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:325` | — |
| `tether:strain` | `systems/tetherGameplay.js:1272` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:302` | `render/feel.js:875`, `systems/collisionConsequences.js:56`, `systems/combat.js:580`, `systems/masslineImpactDamage.js:41`, `systems/presentationOrchestrator.js:123`, `systems/tumbleStates.js:80` |
| `timeTrial:arenaAborted` | `systems/timeTrials.js:1029` | — |
| `timeTrial:arenaAvailable` | `systems/timeTrials.js:1125` | — |
| `timeTrial:arenaCompleted` | `systems/timeTrials.js:1010` | — |
| `timeTrial:arenaQueued` | `systems/timeTrials.js:856` | — |
| `timeTrial:arenaRejected` | `systems/timeTrials.js:847` | — |
| `timeTrial:arenaRequest` | `ui/station/screens/trials.js:89` | `systems/timeTrials.js:383` |
| `timeTrial:arenaStarted` | `systems/timeTrials.js:885` | — |
| `timeTrial:arenaWaveCleared` | `systems/timeTrials.js:961` | — |
| `timeTrial:arenaWaveStarted` | `systems/timeTrials.js:928` | — |
| `timeTrial:completed` | `systems/timeTrials.js:812` | — |
| `timeTrial:courseAvailable` | `systems/timeTrials.js:528` | — |
| `timeTrial:gatePassed` | `systems/timeTrials.js:458`, `systems/timeTrials.js:754` | — |
| `timeTrial:ghostSelected` | `systems/timeTrials.js:1156` | — |
| `timeTrial:ghostSelectionRejected` | `systems/timeTrials.js:1149` | — |
| `timeTrial:ghostSpawned` | `systems/timeTrials.js:676` | — |
| `timeTrial:invalidated` | `systems/timeTrials.js:830` | — |
| `timeTrial:postingRead` | `systems/timeTrials.js:1134` | — |
| `timeTrial:selectGhost` | `ui/station/screens/trials.js:73` | `systems/timeTrials.js:381` |
| `timeTrial:selectTrailTint` | `ui/station/screens/trials.js:82` | `systems/timeTrials.js:382` |
| `timeTrial:slingshotQualified` | `systems/timeTrials.js:1086` | — |
| `timeTrial:startRejected` | `systems/timeTrials.js:710` | — |
| `timeTrial:started` | `systems/timeTrials.js:747` | — |
| `timeTrial:trailTintSelected` | `systems/timeTrials.js:1169` | — |
| `timeTrial:trailTintSelectionRejected` | `systems/timeTrials.js:1165` | — |
| `timeTrial:trailTintUnlocked` | `systems/timeTrials.js:806`, `systems/timeTrials.js:1005`, `systems/timeTrials.js:1181` | — |
| `title:earned` | — | `systems/timeTrials.js:384`, `ui/screens/codex.js:504` |
| `title:holdResolved` | — | `systems/titles.js:455` |
| `touch:uiAction` | `systems/touch.js:231` | `ui/input.js:548` |
| `traffic:ceresManifestTransferred` | `systems/traffic.js:6221` | `systems/encounterDirector.js:280` |
| `traffic:heliosLivingChain` | `systems/traffic.js:5673` | — |
| `traffic:heliosManifestTransferred` | `systems/traffic.js:5948` | `systems/encounterDirector.js:281` |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:3025` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:8593` | — |
| `traffic:playerRescueDispatched` | `systems/traffic.js:1302` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:7319` | — |
| `tutorial:finished` | `systems/onboarding.js:754` | `systems/missions.js:681`, `systems/presentationAdapters.js:170`, `systems/story.js:131` |
| `tutorial:say` | `systems/onboarding.js:490` | `systems/story.js:137` |
| `tutorial:verbCompleted` | `systems/onboarding.js:1162` | — |
| `tutorial:verbsFinished` | `systems/onboarding.js:1192` | — |
| `ui:abandonMission` | `ui/screens/missionLog.js:1880` | `systems/missions.js:690` |
| `ui:acceptMission` | `ui/screens/bar.js:1460`, `ui/screens/stationHub.js:1985`, `ui/station/screens/bar.js:350`, `ui/station/screens/contracts.js:495` | `systems/missions.js:689` |
| `ui:acknowledgeWingmanDeath` | — | `systems/automation.js:491` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:1384` | `systems/ships.js:1022` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | `ui/screens/market.js:643` | `careers/origins/haulerOriginSystem.js:88`, `systems/economy.js:835` |
| `ui:buyBack` | `ui/station/screens/market.js:662` | `systems/economy.js:838` |
| `ui:buyFactionBackroom` | `ui/station/screens/factions.js:401` | `systems/economy.js:843` |
| `ui:buyFactionFit` | `ui/station/screens/factions.js:408` | `systems/economy.js:840` |
| `ui:buyModule` | `ui/screens/outfitting.js:989`, `ui/station/screens/shipworks.js:1511` | `systems/onboarding.js:303`, `systems/ships.js:1018` |
| `ui:buyShip` | `ui/screens/shipyard.js:839`, `ui/screens/shipyard.js:861`, `ui/station/screens/shipworks.js:1404` | `systems/ships.js:1016` |
| `ui:cancel` | `ui/input.js:783`, `ui/input.js:797` | — |
| `ui:chooseConflictSide` | `ui/station/screens/factions.js:418` | `systems/factions.js:198` |
| `ui:click` | — | `audio/audioSystem.js:954` |
| `ui:closeAll` | `main.js:552` | `ui/uiRoot.js:760` |
| `ui:closeCargo` | `ui/input.js:131`, `ui/input.js:201` | `ui/hud.js:3215` |
| `ui:closeComms` | `ui/input.js:196` | — |
| `ui:confirm` | `ui/input.js:791` | `audio/audioSystem.js:956` |
| `ui:cycleComponent` | `ui/targetPanel.js:398`, `ui/targetPanel.js:402` | `ui/uiRoot.js:765` |
| `ui:cycleTarget` | `ui/input.js:235`, `ui/input.js:844` | `ui/uiRoot.js:761` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:1394` | `systems/ships.js:1023` |
| `ui:deny` | — | `audio/audioSystem.js:957` |
| `ui:endgameChallengeReroll` | `ui/screens/missionLog.js:1742` | — |
| `ui:endgameChoose` | `systems/missions.js:2127`, `ui/screens/bar.js:844` | `systems/story.js:150` |
| `ui:endgameConfirm` | — | `systems/story.js:151` |
| `ui:endgameDecline` | `ui/comms.js:399` | `systems/story.js:152` |
| `ui:endgameDepartAshfall` | `ui/comms.js:416` | `systems/story.js:156` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1734` | `systems/story.js:153` |
| `ui:endgameStayAshfall` | `ui/comms.js:417` | `systems/story.js:157` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:1738` | `systems/story.js:154` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:155` |
| `ui:entityRoute` | `ui/entityLinks.js:196` | — |
| `ui:factionPresenceService` | `ui/screens/services.js:547` | `systems/factionPresence.js:429`, `ui/screens/stationHub.js:2736` |
| `ui:fitModule` | `ui/screens/outfitting.js:916` | `systems/onboarding.js:300`, `systems/ships.js:1019` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1031` | `systems/automation.js:488`, `systems/wingmen.js:61` |
| `ui:heliosBay7Scan` | — | `systems/story.js:180` |
| `ui:hireWingman` | — | `systems/automation.js:490` |
| `ui:hover` | — | `audio/audioSystem.js:955` |
| `ui:kurtzInteract` | — | `systems/story.js:179` |
| `ui:navigate` | `ui/input.js:771`, `ui/input.js:775`, `ui/input.js:822` | — |
| `ui:popScreen` | `ui/galaxyMap.js:3830`, `ui/screens/automationPanel.js:477`, `ui/screens/starmap.js:425` | `ui/uiRoot.js:758` |
| `ui:purchaseFrontierRumor` | `ui/screens/bar.js:1405`, `ui/station/screens/bar.js:334` | `systems/world.js:392` |
| `ui:purchaseSurveyData` | `ui/screens/bar.js:1442`, `ui/station/screens/bar.js:404` | `systems/world.js:391` |
| `ui:pushScreen` | `systems/story.js:1064`, `ui/mapAuthority.js:133`, `ui/screens/bar.js:551`, `ui/screens/gameOver.js:263`, `ui/screens/starmap.js:433`, `ui/screens/stationHub.js:379`, `ui/signalInvestigationPrompt.js:229`, `ui/station/screens/bar.js:367`, `ui/station/stationApp.js:469` | `ui/uiRoot.js:735` |
| `ui:replaceScreen` | — | `ui/uiRoot.js:759` |
| `ui:respecTech` | `ui/screens/techTree.js:642` | `systems/ships.js:1025` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:1373` | `systems/ships.js:1021` |
| `ui:sell` | `ui/screens/market.js:452`, `ui/screens/stationHub.js:1562` | `careers/origins/haulerOriginSystem.js:89`, `systems/economy.js:836` |
| `ui:sellAllJunk` | `ui/station/screens/market.js:674` | `systems/economy.js:839` |
| `ui:sellShip` | `ui/screens/shipyard.js:812` | — |
| `ui:service` | `balance/careerCohorts.js:699`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/screens/services.js:597`, `ui/screens/stationHub.js:1713`, `ui/station/stationApp.js:765`, `ui/station/stationApp.js:789` | `systems/economy.js:894` |
| `ui:setActiveShip` | `ui/screens/shipyard.js:817`, `ui/station/screens/shipworks.js:1407` | `systems/ships.js:1017` |
| `ui:setCourse` | `systems/factionPresence.js:995`, `systems/missions.js:2678`, `systems/scanner.js:1157`, `ui/galaxyMap.js:2050`, `ui/galaxyMap.js:2062`, `ui/galaxyMap.js:7670`, `ui/screens/localmap.js:593`, `ui/screens/market.js:1895`, `ui/screens/starmap.js:1234`, `ui/screens/starmap.js:1247`, `ui/screens/starmap.js:1251` | `systems/world.js:352` |
| `ui:setShipAppearance` | `ui/station/screens/shipworks.js:1329`, `ui/station/screens/shipworks.js:1348` | `systems/ships.js:1026` |
| `ui:setShipRegistryName` | `ui/station/screens/shipworks.js:1314` | `systems/ships.js:1027` |
| `ui:talkContact` | — | `systems/story.js:184` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:40`, `combat/autoTargetMode.js:191` | `ui/uiRoot.js:766` |
| `ui:toggleCargo` | `ui/input.js:286` | `ui/hud.js:3214` |
| `ui:toggleComms` | `ui/input.js:303` | — |
| `ui:toggleOverview` | `ui/input.js:290` | `ui/hud.js:3599` |
| `ui:trackMission` | `ui/galaxyMap.js:5253`, `ui/screens/missionLog.js:1730`, `ui/screens/missionLog.js:1798`, `ui/screens/missionLog.js:1859`, `ui/station/screens/contracts.js:499` | `systems/missions.js:691` |
| `ui:undock` | — | `ui/input.js:547` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:1515` | `systems/ships.js:1020` |
| `ui:unlockTech` | `ui/screens/techTree.js:650` | `systems/ships.js:1024` |
| `ui:wingOrder` | `ui/wingmanRadial.js:124` | `systems/automation.js:489` |
| `ui:wingmanRadial` | `ui/input.js:296` | `ui/wingmanRadial.js:178` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:305` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:257` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:192` | — |
| `uniqueWreck:ancientLayerCleared` | `systems/uniqueWrecks.js:1404` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1359` | `systems/missions.js:828` |
| `uniqueWreck:choose` | `systems/missions.js:4629`, `ui/recoveryEncounterPrompt.js:532` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:684` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:702`, `systems/uniqueWrecks.js:877`, `systems/uniqueWrecks.js:1083` | `systems/missions.js:829` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1491` | `systems/missions.js:831` |
| `uniqueWreck:decisionRequest` | `ui/recoveryEncounterPrompt.js:627`, `ui/recoveryEncounterPrompt.js:629` | — |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:939` | `systems/missions.js:830` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:972` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:879` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1667` | `systems/missions.js:832` |
| `uniqueWreck:rumorHeard` | `ui/screens/bar.js:1519`, `ui/station/screens/bar.js:383` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:558` | `systems/missions.js:827` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1668` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1331` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1598` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:344` | `ui/bandHud.js:79` |
| `vestaOreCache:cargoChanged` | `systems/world.js:4049` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:537` | `systems/world.js:364` |
| `vestaOreCache:clueRecovered` | `systems/world.js:3869` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:3900` | — |
| `vestaOreCache:pickupReady` | `systems/world.js:4012` | — |
| `vestaOreCache:resolved` | `systems/world.js:3968` | — |
| `voice:clear` | `ui/voiceArbiter.js:359`, `ui/voiceArbiter.js:403` | `ui/alerts.js:259` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:317` |
| `voice:say` | `ui/alerts.js:161` | `ui/voiceArbiter.js:316` |
| `voice:surface` | `ui/voiceArbiter.js:364`, `ui/voiceArbiter.js:413` | `ui/alerts.js:258` |
| `weapons:mineArmed` | `systems/weapons.js:950` | — |
| `weapons:mineDeployed` | `systems/weapons.js:915` | — |
| `weapons:mineDetonated` | `systems/weapons.js:998` | — |
| `weapons:mineExpired` | `systems/weapons.js:944` | — |
| `weapons:vent` | `systems/weapons.js:339`, `systems/weapons.js:359` | `audio/audioSystem.js:869`, `systems/ships.js:1048`, `ui/hud.js:3295` |
| `wingMorale:broken` | `systems/wingMorale.js:252` | — |
| `wingMorale:cargoDumped` | `systems/wingMorale.js:335` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:374` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:401` | — |
| `wingOrder:accepted` | `systems/automation.js:1718` | `systems/wingmen.js:62` |
| `wingOrder:blocked` | `systems/automation.js:1719` | — |
| `wingOrder:converted` | `systems/wingmen.js:335` | — |
| `wingOrder:status` | `systems/automation.js:1720` | — |
| `wingman:dailyRateSettled` | `systems/automation.js:2127` | — |
| `wingman:deathAcknowledged` | `systems/automation.js:2018` | — |
| `wingman:hired` | `systems/automation.js:1996` | — |
| `wingman:pilotDied` | `systems/automation.js:2153` | — |
| `wingman:sortieCompleted` | `systems/automation.js:2093` | — |
| `wingman:sortieStarted` | `systems/automation.js:2053` | — |
| `wingman:veteran` | `systems/automation.js:2082` | — |
| `world:abortJumpCharge` | `systems/story.js:719`, `ui/comms.js:408` | `systems/world.js:349` |
| `world:cometIceDepleted` | `systems/world.js:1784` | — |
| `world:cometIceMaterialized` | `systems/world.js:1723` | — |
| `world:cometIceRetired` | `systems/world.js:1804` | — |
| `world:confirmUnfiledJump` | `systems/story.js:155` | `systems/world.js:348` |
| `world:criticalSpawnDeferred` | `systems/world.js:1133`, `systems/world.js:2443` | — |
| `world:membership` | `systems/world.js:685` | `systems/presentationOrchestrator.js:163` |
| `world:originShift` | `systems/world.js:2854` | — |
| `world:playerRelocated` | `systems/world.js:2589` | `render/vfx.js:2159` |
| `world:requestJump` | `systems/story.js:703`, `ui/galaxyMap.js:2048`, `ui/screens/starmap.js:1246` | `systems/world.js:346` |
| `world:requestRoute` | `ui/galaxyMap.js:2060`, `ui/galaxyMap.js:5270`, `ui/galaxyMap.js:7668`, `ui/screens/starmap.js:1233`, `ui/screens/starmap.js:1250` | `systems/world.js:350` |
| `world:requestSectorScan` | — | `systems/world.js:351` |
| `world:requestUnfiledJump` | `systems/story.js:671` | `systems/world.js:347` |
| `world:residency` | `systems/world.js:810`, `systems/world.js:1296` | `render/renderer.js:2918` |
| `world:spawnLimited` | `systems/world.js:2379` | — |
| `world:zoneEntered` | `systems/world.js:2881`, `testing/metrics/arcadeCorePacingRoute.js:160` | `data/hazardLanguage.js:107`, `systems/encounterDirector.js:278` |
| `world:zoneExited` | `systems/world.js:2884` | `data/hazardLanguage.js:108`, `systems/encounterDirector.js:279` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:529` | `systems/presentationOrchestrator.js:222` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:483` | `systems/presentationOrchestrator.js:223`, `systems/traffic.js:1093` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:rewardUnlocked` — 1 subscriber(s)
- `aceMemory:transition` — 2 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `camera:kill` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `codex:bestiaryUpdated` — 1 subscriber(s)
- `combat:baseDestroyed` — 1 subscriber(s)
- `combat:heavyCookOffPhase` — 1 subscriber(s)
- `combat:lockChanged` — 2 subscriber(s)
- `combat:repairSubsystem` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:routeFieldRepair` — 1 subscriber(s)
- `combat:routeHullRepair` — 1 subscriber(s)
- `combat:subsystemDisabled` — 7 subscriber(s)
- `combat:subsystemEnabled` — 2 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `economy:purchaseInsurance` — 1 subscriber(s)
- `economy:trade` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `entity:spawnRequest` — 1 subscriber(s)
- `flybyFocus:cancel` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
- `game:newGame` — 14 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
- `law:activeHunterKilled` — 1 subscriber(s)
- `law:custodyTransfer` — 2 subscriber(s)
- `law:distressRaised` — 1 subscriber(s)
- `law:reportIncidentReceipt` — 1 subscriber(s)
- `lawfulInspection:offered` — 1 subscriber(s)
- `lawfulInspection:resolved` — 1 subscriber(s)
- `lawfulInspection:scanning` — 1 subscriber(s)
- `miningDrone:sellOre` — 1 subscriber(s)
- `mission:abandoned` — 2 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `moralMemory:remember` — 1 subscriber(s)
- `moralTrap:choose` — 1 subscriber(s)
- `nav:abortRoute` — 1 subscriber(s)
- `nav:engageRoute` — 1 subscriber(s)
- `npcjobs:commission` — 1 subscriber(s)
- `npcjobs:hold` — 1 subscriber(s)
- `npcjobs:load` — 1 subscriber(s)
- `npcjobs:unload` — 1 subscriber(s)
- `npcjobs:work` — 1 subscriber(s)
- `physics:attachmentBroken` — 1 subscriber(s)
- `pirateParley:resolved` — 1 subscriber(s)
- `postEndingReplay:cycleCompleted` — 1 subscriber(s)
- `presentation:cue` — 4 subscriber(s)
- `recovery:started` — 1 subscriber(s)
- `recurringRival:salvageRaceResolved` — 1 subscriber(s)
- `regionalEcology:applied` — 1 subscriber(s)
- `regionalEcology:changed` — 1 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `signal:investigate` — 1 subscriber(s)
- `signal:track` — 1 subscriber(s)
- `sim:jumpGate` — 1 subscriber(s)
- `surrender:secured` — 1 subscriber(s)
- `surrender:tethered` — 1 subscriber(s)
- `survivorPod:choose` — 1 subscriber(s)
- `title:earned` — 2 subscriber(s)
- `title:holdResolved` — 1 subscriber(s)
- `ui:acknowledgeWingmanDeath` — 1 subscriber(s)
- `ui:click` — 1 subscriber(s)
- `ui:deny` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:endgameUnfiledJumpConfirm` — 1 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:hireWingman` — 1 subscriber(s)
- `ui:hover` — 1 subscriber(s)
- `ui:kurtzInteract` — 1 subscriber(s)
- `ui:replaceScreen` — 1 subscriber(s)
- `ui:talkContact` — 1 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `voice:dismiss` — 1 subscriber(s)
- `world:requestSectorScan` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aceMemory:playerKilled` — 1 emitter(s)
- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:completed` — 1 emitter(s)
- `aftermathWreck:cooled` — 1 emitter(s)
- `aftermathWreck:recorded` — 1 emitter(s)
- `aftermathWreck:scavenged` — 1 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `ai:skitterNest` — 1 emitter(s)
- `ai:skitterSpring` — 1 emitter(s)
- `ai:stateChange` — 1 emitter(s)
- `ambientComms:register` — 1 emitter(s)
- `ambientComms:toneChanged` — 1 emitter(s)
- `anomaly:bearing` — 1 emitter(s)
- `anomaly:crystalChime` — 1 emitter(s)
- `anomaly:drifterFlicker` — 1 emitter(s)
- `anomaly:registered` — 5 emitter(s)
- `anomaly:unregistered` — 6 emitter(s)
- `automation:assetDistressed` — 1 emitter(s)
- `automation:assetRepossessed` — 1 emitter(s)
- `automation:incomeCredited` — 2 emitter(s)
- `automation:offlineSummary` — 5 emitter(s)
- `automation:outpostRecipeChanged` — 1 emitter(s)
- `band:bearingReceipt` — 1 emitter(s)
- `band:bearingRequest` — 1 emitter(s)
- `band:bearingResolved` — 2 emitter(s)
- `band:bearingUnavailable` — 3 emitter(s)
- `band:cycle` — 2 emitter(s)
- `beacon:deployed` — 1 emitter(s)
- `beam:denied` — 5 emitter(s)
- `beam:repaired` — 1 emitter(s)
- `beam:transferred` — 1 emitter(s)
- `boss:defeated` — 1 emitter(s)
- `buildIdentity:revealed` — 1 emitter(s)
- `capital:choiceStarted` — 1 emitter(s)
- `capital:phaseChanged` — 1 emitter(s)
- `capital:reactorArmed` — 1 emitter(s)
- `capital:reactorCookOff` — 1 emitter(s)
- `capital:resolved` — 1 emitter(s)
- `cargo:delivered` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `cargo:podArmed` — 1 emitter(s)
- `charge:combo` — 2 emitter(s)
- `charge:stuck` — 1 emitter(s)
- `charge:thrown` — 1 emitter(s)
- `civilianCast:landmarkVisit` — 1 emitter(s)
- `civilianCast:towAttached` — 1 emitter(s)
- `civilianCast:towDelivered` — 1 emitter(s)
- `civilianCast:waypointVisited` — 1 emitter(s)
- `claim:carrierDematerialized` — 1 emitter(s)
- `claim:carrierDispatched` — 1 emitter(s)
- `claim:carrierEngaged` — 1 emitter(s)
- `claim:carrierHeld` — 1 emitter(s)
- `claim:carrierIntercept` — 2 emitter(s)
- `claim:carrierMaterialized` — 1 emitter(s)
- `claim:carrierSettled` — 1 emitter(s)
- `claim:carrierThreat` — 1 emitter(s)
- `claim:defenseEncounterRequested` — 1 emitter(s)
- `claim:defenseResolved` — 1 emitter(s)
- `claim:defenseStarted` — 1 emitter(s)
- `claim:defenseWarning` — 1 emitter(s)
- `claim:infrastructureConstructed` — 1 emitter(s)
- `claim:moduleBuilt` — 1 emitter(s)
- `claim:raidRepelled` — 1 emitter(s)
- `claim:raidWarning` — 1 emitter(s)
- `claim:receipt` — 1 emitter(s)
- `claim:specialized` — 1 emitter(s)
- `claim:teleportRequest` — 1 emitter(s)
- `claims:migrated` — 1 emitter(s)
- `cloak:dropped` — 1 emitter(s)
- `combat:actionCancelled` — 1 emitter(s)
- `combat:actionCompleted` — 1 emitter(s)
- `combat:actionPhase` — 1 emitter(s)
- `combat:actionRejected` — 1 emitter(s)
- `combat:fieldRepaired` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `combat:projectedShieldHit` — 1 emitter(s)
- `combat:statusExpired` — 1 emitter(s)
- `combat:tumbleEnd` — 1 emitter(s)
- `comms:log` — 2 emitter(s)
- `conflict:sideChosen` — 1 emitter(s)
- `conflict:skirmishResolved` — 1 emitter(s)
- `conflict:skirmishUnclaimed` — 1 emitter(s)
- `conflict:staleFrontReset` — 1 emitter(s)
- `conflict:warDeclared` — 1 emitter(s)
- `contactHail:availability` — 2 emitter(s)
- `contactHail:clear` — 1 emitter(s)
- `contactHail:handoff` — 1 emitter(s)
- `contactHail:offer` — 1 emitter(s)
- `contract:clauseHonored` — 2 emitter(s)
- `countermeasure:deployed` — 1 emitter(s)
- `craft:fieldSupplyUsed` — 1 emitter(s)
- `craft:serviceFeeCharged` — 1 emitter(s)
- `customs:breakScan` — 1 emitter(s)
- `customs:submit` — 1 emitter(s)
- `danger:miningNoise` — 1 emitter(s)
- `deadGate:materialRecovered` — 1 emitter(s)
- `deadGate:opened` — 1 emitter(s)
- `deadGate:rewardMaterialized` — 1 emitter(s)
- `debt:changed` — 1 emitter(s)
- `derelictBoarding:hatchOpened` — 1 emitter(s)
- `derelictBoarding:physicalCut` — 1 emitter(s)
- `derelictBoarding:requiresStabilization` — 1 emitter(s)
- `derelictBoarding:stabilized` — 1 emitter(s)
- `derelictBoarding:survivorExtracted` — 1 emitter(s)
- `dock:denied` — 1 emitter(s)
- `economy:regimeChanged` — 1 emitter(s)
- `economy:salvageIntakeApplied` — 1 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:namedCaptainDefeated` — 1 emitter(s)
- `encounter:predationCleared` — 1 emitter(s)
- `encounter:predationEngaged` — 1 emitter(s)
- `encounter:predationTelegraph` — 1 emitter(s)
- `encounter:receipt` — 1 emitter(s)
- `encounter:voice` — 1 emitter(s)
- `encounter:waitStarted` — 1 emitter(s)
- `encounter:winnerHostile` — 1 emitter(s)
- `endgame:ineligible` — 3 emitter(s)
- `endgame:promptChoiceC` — 1 emitter(s)
- `endgame:promptChoiceD` — 1 emitter(s)
- `endgame:promptSandbox` — 1 emitter(s)
- `endgameReplay:challengeInterrupted` — 1 emitter(s)
- `endgameReplay:huntInterrupted` — 1 emitter(s)
- `environmentalMachinery:phaseChanged` — 1 emitter(s)
- `faction:backroomPurchased` — 1 emitter(s)
- `faction:licensedFitPurchased` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `faction:tradePosture` — 3 emitter(s)
- `factionPresence:administrativeRouting` — 1 emitter(s)
- `factionPresence:fulfillmentProvoked` — 1 emitter(s)
- `factionPresence:service` — 1 emitter(s)
- `factionPresence:serviceAction` — 1 emitter(s)
- `factionPresence:spawned` — 2 emitter(s)
- `field:richSeamMissed` — 3 emitter(s)
- `field:richSeamOpened` — 1 emitter(s)
- `field:richSeamWorked` — 2 emitter(s)
- `fields:anchorRegistered` — 1 emitter(s)
- `fields:deployDenied` — 1 emitter(s)
- `fields:reloaded` — 1 emitter(s)
- `fixer:jobRemembered` — 1 emitter(s)
- `fixer:outcomeRemembered` — 1 emitter(s)
- `fixer:voice` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `flybyFocus:end` — 1 emitter(s)
- `formation:discovered` — 1 emitter(s)
- `freight:arrival` — 1 emitter(s)
- `freight:cargoTowAttached` — 1 emitter(s)
- `freight:custodyChanged` — 1 emitter(s)
- `freight:custodyRebound` — 1 emitter(s)
- `freight:custodyReceipt` — 1 emitter(s)
- `freight:loss` — 3 emitter(s)
- `freight:raiderEscaped` — 1 emitter(s)
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:contacted` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `fuel:fieldLoaded` — 1 emitter(s)
- `fuel:scooped` — 1 emitter(s)
- `fuelStack:blown` — 1 emitter(s)
- `fuelStack:discovered` — 1 emitter(s)
- `fuelTender:completed` — 2 emitter(s)
- `fuelTender:interrupted` — 1 emitter(s)
- `fuelTender:rendezvousReady` — 1 emitter(s)
- `fuelTender:rendezvousStarted` — 1 emitter(s)
- `fuelTender:transferred` — 1 emitter(s)
- `gamepad:connected` — 1 emitter(s)
- `gamepad:disconnected` — 1 emitter(s)
- `hazard:changed` — 1 emitter(s)
- `heist:launchCue` — 1 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverCommitted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `insurance:cargoLienConsumed` — 1 emitter(s)
- `insurance:claimSettled` — 1 emitter(s)
- `insurance:policyPurchased` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `law:bountyPosted` — 1 emitter(s)
- `law:fineNotice` — 1 emitter(s)
- `law:majorCrimeStainChanged` — 1 emitter(s)
- `loadoutPresets:changed` — 3 emitter(s)
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
- `massline:snareArmed` — 1 emitter(s)
- `massline:snareCaught` — 1 emitter(s)
- `massline:snareCut` — 1 emitter(s)
- `massline:snareDeployed` — 1 emitter(s)
- `massline:snareEnded` — 1 emitter(s)
- `medium:bulwarkLink` — 1 emitter(s)
- `medium:torcherTrailEnded` — 1 emitter(s)
- `medium:torcherTrailHit` — 1 emitter(s)
- `medium:torcherTrailLaid` — 1 emitter(s)
- `mines:armed` — 1 emitter(s)
- `mines:capReached` — 1 emitter(s)
- `mines:placed` — 1 emitter(s)
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamCooled` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:heatChanged` — 1 emitter(s)
- `mining:resonanceBeat` — 1 emitter(s)
- `mining:resonanceResolved` — 1 emitter(s)
- `mining:ventBonus` — 1 emitter(s)
- `mission:conditionBroken` — 2 emitter(s)
- `mission:conditionPending` — 1 emitter(s)
- `mission:conditionProgress` — 2 emitter(s)
- `mission:setPieceTransition` — 1 emitter(s)
- `mission:setPieceTravelLine` — 1 emitter(s)
- `mission:spawnDeferred` — 1 emitter(s)
- `module:granted` — 1 emitter(s)
- `moralMemory:vengefulReturn` — 1 emitter(s)
- `moralTrap:resolved` — 1 emitter(s)
- `moralTrap:revealed` — 1 emitter(s)
- `namedAce:appeared` — 2 emitter(s)
- `namedAce:defeated` — 1 emitter(s)
- `namedAce:fled` — 1 emitter(s)
- `nav:waypointQueue` — 3 emitter(s)
- `news:dockCards` — 1 emitter(s)
- `news:headline` — 10 emitter(s)
- `news:publish` — 5 emitter(s)
- `npcjobs:minerRelocated` — 1 emitter(s)
- `orrinWitness:evidenceEnsured` — 1 emitter(s)
- `orrinWitness:evidenceRecovered` — 1 emitter(s)
- `orrinWitness:submitted` — 1 emitter(s)
- `pallasHiddenCache:cargoChanged` — 1 emitter(s)
- `pallasHiddenCache:clueRecovered` — 1 emitter(s)
- `pallasHiddenCache:decisionReady` — 1 emitter(s)
- `pallasHiddenCache:pickupReady` — 1 emitter(s)
- `pallasHiddenCache:resolved` — 1 emitter(s)
- `planet:collector` — 1 emitter(s)
- `planet:harvest` — 1 emitter(s)
- `planet:harvestDenied` — 1 emitter(s)
- `planet:recoveryBurn` — 1 emitter(s)
- `planet:unregistered` — 1 emitter(s)
- `playerDefeat:podDrifting` — 1 emitter(s)
- `playerDefeat:recoveryTowOffered` — 1 emitter(s)
- `playerDefeat:wreckRecovered` — 1 emitter(s)
- `presentation:audioCue` — 1 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 2 emitter(s)
- `quartermaster:voice` — 1 emitter(s)
- `rareSpawn:resolved` — 1 emitter(s)
- `recovery:choose` — 1 emitter(s)
- `recovery:vent` — 1 emitter(s)
- `recurringRival:salvageBidDecision` — 4 emitter(s)
- `recurringRival:salvageRaceStarted` — 1 emitter(s)
- `research:pointsChanged` — 1 emitter(s)
- `resonance:patrolQueued` — 1 emitter(s)
- `rumor:ghostConvoy` — 1 emitter(s)
- `salvage:actionRead` — 1 emitter(s)
- `salvage:cutComplete` — 1 emitter(s)
- `salvage:fieldVulture` — 1 emitter(s)
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
- `seededRun:finalized` — 1 emitter(s)
- `seededRun:restored` — 1 emitter(s)
- `seededRun:scoreChanged` — 1 emitter(s)
- `seededRun:started` — 1 emitter(s)
- `sensorGhost:swarm` — 1 emitter(s)
- `setpiece:revealed` — 4 emitter(s)
- `ship:appearanceSaved` — 1 emitter(s)
- `ship:lossRefitApplied` — 1 emitter(s)
- `ship:lostHullRecovered` — 1 emitter(s)
- `ship:massChanged` — 1 emitter(s)
- `ship:newGamePlusCosmeticsApplied` — 1 emitter(s)
- `ship:registryFiled` — 1 emitter(s)
- `signal:receipt` — 1 emitter(s)
- `site:anchored` — 1 emitter(s)
- `site:courierDelivered` — 1 emitter(s)
- `site:courierLaunched` — 1 emitter(s)
- `site:courierLost` — 1 emitter(s)
- `site:created` — 1 emitter(s)
- `site:laneSpilled` — 2 emitter(s)
- `site:lost` — 1 emitter(s)
- `site:machineInstalled` — 1 emitter(s)
- `site:machineMode` — 1 emitter(s)
- `site:machineRemoved` — 1 emitter(s)
- `site:overlayChanged` — 1 emitter(s)
- `site:podBuilt` — 1 emitter(s)
- `site:rematerialized` — 1 emitter(s)
- `smuggling:dropCacheChanged` — 1 emitter(s)
- `smuggling:dropCacheSold` — 1 emitter(s)
- `smuggling:dropCacheStashed` — 1 emitter(s)
- `smuggling:patrolDecoyCommitted` — 1 emitter(s)
- `specialist:repairDroneLaunched` — 1 emitter(s)
- `specialist:repairTenderStopped` — 1 emitter(s)
- `station:broadcastTic` — 1 emitter(s)
- `station:navigate` — 4 emitter(s)
- `stationContact:changed` — 6 emitter(s)
- `stationContact:counterChanged` — 2 emitter(s)
- `stationLife:trafficChanged` — 1 emitter(s)
- `story:kurtzLedger` — 2 emitter(s)
- `story:persistentCargoAwarded` — 1 emitter(s)
- `story:playerChoiceRecorded` — 1 emitter(s)
- `story:postEndingContinuity` — 1 emitter(s)
- `story:vergeEvidenceRecorded` — 1 emitter(s)
- `story:vergeObserversRevealed` — 1 emitter(s)
- `story:vergeValeGatesRevoked` — 1 emitter(s)
- `survivor:returnGift` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:rescueBlocked` — 1 emitter(s)
- `survivorPod:rescueSelected` — 1 emitter(s)
- `survivorPod:stripped` — 1 emitter(s)
- `tech:featGateRevealed` — 1 emitter(s)
- `tech:respecced` — 1 emitter(s)
- `tether:latchDenied` — 8 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:rebound` — 1 emitter(s)
- `tether:reelPump` — 1 emitter(s)
- `tether:snapCatch` — 1 emitter(s)
- `tether:strain` — 1 emitter(s)
- `timeTrial:arenaAborted` — 1 emitter(s)
- `timeTrial:arenaAvailable` — 1 emitter(s)
- `timeTrial:arenaCompleted` — 1 emitter(s)
- `timeTrial:arenaQueued` — 1 emitter(s)
- `timeTrial:arenaRejected` — 1 emitter(s)
- `timeTrial:arenaStarted` — 1 emitter(s)
- `timeTrial:arenaWaveCleared` — 1 emitter(s)
- `timeTrial:arenaWaveStarted` — 1 emitter(s)
- `timeTrial:completed` — 1 emitter(s)
- `timeTrial:courseAvailable` — 1 emitter(s)
- `timeTrial:gatePassed` — 2 emitter(s)
- `timeTrial:ghostSelected` — 1 emitter(s)
- `timeTrial:ghostSelectionRejected` — 1 emitter(s)
- `timeTrial:ghostSpawned` — 1 emitter(s)
- `timeTrial:invalidated` — 1 emitter(s)
- `timeTrial:postingRead` — 1 emitter(s)
- `timeTrial:slingshotQualified` — 1 emitter(s)
- `timeTrial:startRejected` — 1 emitter(s)
- `timeTrial:started` — 1 emitter(s)
- `timeTrial:trailTintSelected` — 1 emitter(s)
- `timeTrial:trailTintSelectionRejected` — 1 emitter(s)
- `timeTrial:trailTintUnlocked` — 3 emitter(s)
- `traffic:heliosLivingChain` — 1 emitter(s)
- `traffic:passengerLinerReceipt` — 1 emitter(s)
- `traffic:passengerLinerSuspended` — 1 emitter(s)
- `traffic:playerRescueDispatched` — 1 emitter(s)
- `traffic:richSeamHelpReserved` — 1 emitter(s)
- `tutorial:verbCompleted` — 1 emitter(s)
- `tutorial:verbsFinished` — 1 emitter(s)
- `ui:bulkHaulTag` — 1 emitter(s)
- `ui:bulkHaulTagCleared` — 1 emitter(s)
- `ui:cancel` — 2 emitter(s)
- `ui:closeComms` — 1 emitter(s)
- `ui:endgameChallengeReroll` — 1 emitter(s)
- `ui:entityRoute` — 1 emitter(s)
- `ui:navigate` — 3 emitter(s)
- `ui:sellShip` — 1 emitter(s)
- `ui:toggleComms` — 1 emitter(s)
- `uniqueLoot:choirBellPulse` — 1 emitter(s)
- `uniqueLoot:nestbreakerSplit` — 1 emitter(s)
- `uniqueLoot:paleCoilBlink` — 1 emitter(s)
- `uniqueWreck:ancientLayerCleared` — 1 emitter(s)
- `uniqueWreck:choose` — 2 emitter(s)
- `uniqueWreck:complicationScheduled` — 1 emitter(s)
- `uniqueWreck:decisionRequest` — 2 emitter(s)
- `uniqueWreck:encounterCompleted` — 1 emitter(s)
- `uniqueWreck:encounterRequested` — 1 emitter(s)
- `uniqueWreck:rumorHeard` — 2 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:scanBlocked` — 1 emitter(s)
- `uniqueWreck:storyRewardGranted` — 1 emitter(s)
- `vestaOreCache:cargoChanged` — 1 emitter(s)
- `vestaOreCache:clueRecovered` — 1 emitter(s)
- `vestaOreCache:decisionReady` — 1 emitter(s)
- `vestaOreCache:pickupReady` — 1 emitter(s)
- `vestaOreCache:resolved` — 1 emitter(s)
- `weapons:mineArmed` — 1 emitter(s)
- `weapons:mineDeployed` — 1 emitter(s)
- `weapons:mineDetonated` — 1 emitter(s)
- `weapons:mineExpired` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:cargoDumped` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `wingOrder:blocked` — 1 emitter(s)
- `wingOrder:converted` — 1 emitter(s)
- `wingOrder:status` — 1 emitter(s)
- `wingman:dailyRateSettled` — 1 emitter(s)
- `wingman:deathAcknowledged` — 1 emitter(s)
- `wingman:hired` — 1 emitter(s)
- `wingman:pilotDied` — 1 emitter(s)
- `wingman:sortieCompleted` — 1 emitter(s)
- `wingman:sortieStarted` — 1 emitter(s)
- `wingman:veteran` — 1 emitter(s)
- `world:cometIceDepleted` — 1 emitter(s)
- `world:cometIceMaterialized` — 1 emitter(s)
- `world:cometIceRetired` — 1 emitter(s)
- `world:criticalSpawnDeferred` — 2 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
