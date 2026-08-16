# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-08-16 · 707 events · 2454 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/encounterDirector.js:202` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:261` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:534` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:665` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:281` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:581` | — |
| `ai:counterTether` | `ai/sg03ActionPort.js:372` | `systems/presentationOrchestrator.js:151` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:154` | `systems/fields.js:144`, `systems/presentationOrchestrator.js:152` |
| `ai:encounterCommand` | `systems/aiPorts.js:227` | — |
| `ai:flee` | `systems/ai.js:235`, `systems/wingMorale.js:290` | `render/vfx.js:1543`, `systems/barkDirector.js:39`, `systems/combatOutcome.js:104`, `systems/presentationOrchestrator.js:153` |
| `ai:formationBroken` | `systems/ai.js:404`, `systems/wingMorale.js:251` | `render/vfx.js:1544` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:40` |
| `ai:skitterNest` | `systems/aiPorts.js:936` | — |
| `ai:skitterSpring` | `systems/aiPorts.js:905` | — |
| `ai:stateChange` | `systems/ai.js:232` | — |
| `ai:telegraph` | `systems/ai.js:300`, `systems/encounterScripts.js:126`, `systems/encounterScripts.js:895`, `systems/masslineSnares.js:319`, `systems/mines.js:100`, `systems/tacticalAI.js:143` | `audio/audioSystem.js:726`, `render/vfx.js:1542`, `systems/presentationOrchestrator.js:150`, `ui/hud.js:2051` |
| `aiTrader:requestTrade` | `systems/traffic.js:4373` | `systems/economy.js:617` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | — |
| `anomaly:bearing` | `systems/scanner.js:953` | — |
| `anomaly:registered` | `systems/anomalyRuntime.js:111` | — |
| `anomaly:triangulated` | `systems/scanner.js:971` | `systems/world.js:327` |
| `anomaly:unregistered` | `systems/anomalyRuntime.js:151` | — |
| `arcade:pacingWingSpawned` | `testing/metrics/arcadeCorePacingRoute.js:245` | `testing/metrics/arcadeCorePacingRoute.js:339` |
| `asset:deployed` | `systems/automation.js:1190`, `systems/automation.js:1718`, `systems/automation.js:1755`, `systems/automation.js:1825`, `systems/claims.js:445` | `systems/missions.js:665`, `systems/onboarding.js:286`, `systems/story.js:161` |
| `asteroid:chunked` | `systems/mining.js:1352` | `systems/presentationOrchestrator.js:187` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:835`, `systems/mining.js:806` | `audio/audioSystem.js:702`, `systems/fieldDepletion.js:431`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `combat/cookOff.js:103`, `render/vfx.js:1564`, `systems/ai.js:675`, `systems/beacons.js:52`, `systems/beacons.js:57`, `systems/beacons.js:80`, `systems/bulletTime.js:95`, `systems/bulletTime.js:111`, `systems/claims.js:292`, `systems/claims.js:377`, `systems/claims.js:422`, `systems/claims.js:1138`, `systems/claims.js:1629`, `systems/cloak.js:107`, `systems/cloak.js:118`, `systems/countermeasures.js:189`, `systems/crafting.js:221`, `systems/crafting.js:231`, `systems/fields.js:339`, `systems/fields.js:410`, `systems/fields.js:438`, `systems/fields.js:445`, `systems/fields.js:512`, `systems/flybyFocus.js:405`, `systems/impulseCharges.js:303`, `systems/impulseCharges.js:465`, `systems/jettisonImpulse.js:63`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:178`, `systems/masslineThrow.js:455`, `systems/masslineThrow.js:564`, `systems/mining.js:601`, `systems/mining.js:1432`, `systems/planetRuntime.js:484`, `systems/presentationAdapters.js:507`, `systems/salvage.js:464`, `systems/tumbleStates.js:233`, `systems/weapons.js:934`, `systems/weapons.js:1001`, `ui/hud.js:2821`, `ui/hud.js:3024`, `ui/hud.js:3075`, `ui/hud.js:3114`, `ui/hud.js:3131`, `ui/hud.js:3236`, `ui/hud.js:3327`, `ui/hud.js:3539`, `ui/input.js:85`, `ui/input.js:108`, `ui/input.js:154`, `ui/input.js:166`, `ui/input.js:172`, `ui/input.js:208`, `ui/input.js:263`, `ui/input.js:269`, `ui/input.js:480`, `ui/input.js:695`, `ui/input.js:700`, `ui/input.js:784`, `ui/input.js:792`, `ui/input.js:798`, `ui/input.js:823`, `ui/input.js:834`, `ui/input.js:838`, `ui/input.js:851`, `ui/screens/bar.js:1170`, `ui/screens/bar.js:1174`, `ui/screens/bar.js:1180`, `ui/screens/bar.js:1209`, `ui/screens/bar.js:1246`, `ui/screens/bar.js:1264`, `ui/screens/bar.js:1315`, `ui/screens/base.js:506`, `ui/screens/base.js:648`, `ui/screens/market.js:451`, `ui/screens/market.js:453`, `ui/screens/market.js:524`, `ui/screens/market.js:637`, `ui/screens/market.js:647`, `ui/screens/market.js:698`, `ui/screens/market.js:707`, `ui/screens/market.js:736`, `ui/screens/market.js:793`, `ui/screens/market.js:799`, `ui/screens/market.js:809`, `ui/screens/market.js:902`, `ui/screens/market.js:1122`, `ui/screens/market.js:1635`, `ui/screens/market.js:1898`, `ui/screens/missionLog.js:1656`, `ui/screens/missionLog.js:1660`, `ui/screens/missionLog.js:1664`, `ui/screens/missionLog.js:1668`, `ui/screens/missionLog.js:1684`, `ui/screens/missionLog.js:1691`, `ui/screens/missionLog.js:1698`, `ui/screens/missionLog.js:1706`, `ui/screens/missionLog.js:1713`, `ui/screens/missionLog.js:1720`, `ui/screens/missionLog.js:1729`, `ui/screens/missionLog.js:1736`, `ui/screens/missionLog.js:1752`, `ui/screens/missionLog.js:1783`, `ui/screens/missionLog.js:1803`, `ui/screens/outfitting.js:909`, `ui/screens/outfitting.js:913`, `ui/screens/outfitting.js:979`, `ui/screens/outfitting.js:986`, `ui/screens/services.js:439`, `ui/screens/services.js:461`, `ui/screens/services.js:474`, `ui/screens/services.js:490`, `ui/screens/services.js:496`, `ui/screens/shipLedger.js:297`, `ui/screens/shipLedger.js:304`, `ui/screens/shipLedger.js:311`, `ui/screens/shipyard.js:813`, `ui/screens/shipyard.js:818`, `ui/screens/shipyard.js:840`, `ui/screens/shipyard.js:844`, `ui/screens/shipyard.js:862`, `ui/screens/stationHub.js:1197`, `ui/screens/stationHub.js:1206`, `ui/screens/stationHub.js:1262`, `ui/screens/stationHub.js:1295`, `ui/screens/stationHub.js:1301`, `ui/screens/stationHub.js:1348`, `ui/screens/stationHub.js:1360`, `ui/screens/stationHub.js:1364`, `ui/screens/stationHub.js:1376`, `ui/screens/stationHub.js:1392`, `ui/screens/stationHub.js:1563`, `ui/screens/stationHub.js:1676`, `ui/screens/stationHub.js:1685`, `ui/screens/stationHub.js:1701`, `ui/screens/stationHub.js:1711`, `ui/screens/stationHub.js:1714`, `ui/screens/stationHub.js:1969`, `ui/screens/stationHub.js:1989`, `ui/screens/stationHub.js:2458`, `ui/station/screens/bar.js:300`, `ui/station/screens/bar.js:305`, `ui/station/screens/bar.js:309`, `ui/station/screens/bar.js:313`, `ui/station/screens/bar.js:335`, `ui/station/screens/bar.js:351`, `ui/station/screens/bar.js:379`, `ui/station/screens/bar.js:405`, `ui/station/screens/bar.js:414`, `ui/station/screens/contracts.js:469`, `ui/station/screens/contracts.js:474`, `ui/station/screens/contracts.js:478`, `ui/station/screens/factions.js:322`, `ui/station/screens/industry.js:150`, `ui/station/screens/industry.js:159`, `ui/station/screens/industry.js:167`, `ui/station/screens/market.js:558`, `ui/station/screens/market.js:575`, `ui/station/screens/market.js:666`, `ui/station/screens/market.js:675`, `ui/station/screens/market.js:685`, `ui/station/screens/market.js:694`, `ui/station/screens/market.js:714`, `ui/station/screens/shipworks.js:721`, `ui/station/screens/shipworks.js:1100`, `ui/station/screens/shipworks.js:1147`, `ui/station/screens/shipworks.js:1149`, `ui/station/screens/shipworks.js:1153`, `ui/station/screens/shipworks.js:1162`, `ui/station/screens/shipworks.js:1252`, `ui/station/screens/shipworks.js:1256`, `ui/station/screens/shipworks.js:1260`, `ui/station/stationApp.js:558`, `ui/station/stationApp.js:751`, `ui/uiRoot.js:399`, `ui/uiRoot.js:859`, `ui/uiRoot.js:922`, `ui/wingmanRadial.js:77`, `ui/wingmanRadial.js:98`, `ui/wingmanRadial.js:120`, `ui/wingmanRadial.js:146`, `ui/wingmanRadial.js:163` | `audio/audioSystem.js:788` |
| `automation:assetDistressed` | `systems/automation.js:1487` | — |
| `automation:assetLost` | `systems/automation.js:1921` | `systems/intervention.js:37`, `systems/lossLedger.js:333`, `systems/missions.js:667` |
| `automation:assetRepossessed` | `systems/automation.js:1512` | — |
| `automation:incomeCredited` | `systems/automation.js:1540`, `systems/automation.js:2192` | — |
| `automation:offlineSummary` | `systems/automation.js:1959`, `systems/automation.js:1983`, `systems/automation.js:2007`, `systems/automation.js:2030`, `systems/automation.js:2239` | — |
| `automation:outpostRaided` | `systems/automation.js:1420`, `systems/automation.js:2314` | `systems/lossLedger.js:334` |
| `automation:programAssigned` | `systems/automation.js:1673` | `systems/missions.js:666` |
| `band:bearingReceipt` | `systems/bandRadio.js:504` | — |
| `band:bearingRequest` | `systems/bandRadio.js:477` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:533`, `systems/uniqueWrecks.js:576` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:540`, `systems/uniqueWrecks.js:548`, `systems/uniqueWrecks.js:562` | — |
| `band:bed` | `systems/bandRadio.js:561` | `audio/audioSystem.js:793` |
| `band:cycle` | `ui/bandHud.js:74`, `ui/input.js:188` | — |
| `band:status` | `systems/bandRadio.js:543` | `ui/bandHud.js:78` |
| `beacon:deploy` | — | `systems/beacons.js:35` |
| `beacon:deployed` | `systems/beacons.js:75` | — |
| `beam:denied` | `systems/mining.js:288`, `systems/mining.js:331`, `systems/mining.js:339`, `systems/mining.js:349`, `systems/mining.js:381` | — |
| `beam:repaired` | `systems/mining.js:442` | — |
| `beam:transferred` | `systems/mining.js:473` | — |
| `boss:defeated` | `systems/world.js:531` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:290` | — |
| `bulletTime:end` | `systems/bulletTime.js:110` | `audio/audioSystem.js:792` |
| `bulletTime:start` | `systems/bulletTime.js:94` | `audio/audioSystem.js:789`, `systems/onboarding.js:328` |
| `camera:kill` | — | `render/renderer.js:2968` |
| `camera:shake` | `render/vfx.js:2943`, `render/vfx.js:3965`, `render/vfx.js:4302`, `render/vfx.js:4541`, `render/vfx.js:4697`, `systems/combat.js:529`, `systems/combat.js:602`, `systems/combat.js:642`, `systems/combat.js:698`, `systems/combat.js:796`, `systems/combat.js:878`, `systems/drill.js:972`, `systems/flybyFocus.js:404`, `systems/intervention.js:106`, `systems/presentationAdapters.js:429`, `systems/tetherGameplay.js:466` | `render/renderer.js:2959` |
| `camera:zoom` | `ui/input.js:323`, `ui/input.js:324`, `ui/input.js:529` | `render/renderer.js:2976` |
| `cargo:changed` | `systems/cargo.js:76`, `systems/mining.js:1607` | `systems/cargo.js:213`, `systems/ships.js:816`, `ui/cargoConscience.js:122`, `ui/commandBar.js:412`, `ui/hud.js:3143`, `ui/hud.js:3172`, `ui/hudMeta.js:183`, `ui/screens/manufacture.js:214`, `ui/screens/stationHub.js:2755`, `ui/screens/stationHub.js:2772`, `ui/screens/stationHub.js:2773`, `ui/screens/stationHub.js:2774` |
| `cargo:delivered` | `systems/missions.js:3624` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:174`, `systems/mining.js:591`, `systems/mining.js:1039` | `careers/origins/prospectorOrigin.js:640`, `systems/onboarding.js:247`, `systems/presentationOrchestrator.js:195`, `ui/alerts.js:290`, `ui/floatingText.js:185` |
| `cargo:jettison` | `ui/hud.js:2829` | `ui/hud.js:3080` |
| `cargo:jettisoned` | `systems/cargo.js:366` | `systems/jettisonImpulse.js:28`, `systems/onboarding.js:324` |
| `cargo:massSettled` | `systems/cargo.js:279` | `systems/presentationOrchestrator.js:194`, `systems/ships.js:817` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:299` | `systems/onboarding.js:336` |
| `charge:combo` | `systems/impulseCharges.js:341`, `systems/impulseCharges.js:444` | — |
| `charge:detonated` | `systems/impulseCharges.js:452` | `audio/audioSystem.js:736`, `render/feel.js:834`, `render/vfx.js:1541` |
| `charge:stuck` | `systems/impulseCharges.js:224` | — |
| `charge:thrown` | `systems/impulseCharges.js:295` | — |
| `claim:carrierDematerialized` | `systems/claims.js:1398` | — |
| `claim:carrierDispatched` | `systems/claims.js:1016` | — |
| `claim:carrierEngaged` | `systems/claims.js:1215` | — |
| `claim:carrierHeld` | `systems/claims.js:1165` | — |
| `claim:carrierIntercept` | `systems/claims.js:1152`, `systems/claims.js:1256` | — |
| `claim:carrierMaterialized` | `systems/claims.js:1349` | — |
| `claim:carrierSettled` | `systems/claims.js:1500` | — |
| `claim:carrierThreat` | `systems/claims.js:1121` | — |
| `claim:claimed` | `systems/claims.js:291` | `systems/onboarding.js:292`, `systems/story.js:167` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1688` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:241` |
| `claim:defenseResolved` | `systems/claims.js:1772` | — |
| `claim:defenseStarted` | `systems/claims.js:1693` | — |
| `claim:defenseWarning` | `systems/claims.js:1612` | — |
| `claim:infrastructureActive` | `systems/claims.js:826` | `systems/traffic.js:1028` |
| `claim:infrastructureConstructed` | `systems/claims.js:358` | — |
| `claim:infrastructureStatus` | `systems/claims.js:837` | `systems/traffic.js:1029` |
| `claim:moduleBuilt` | `systems/claims.js:376` | — |
| `claim:raidRepelled` | `systems/claims.js:1561` | — |
| `claim:raidWarning` | `systems/claims.js:1554` | — |
| `claim:receipt` | `systems/claims.js:2056` | — |
| `claim:sensorPostRumor` | `systems/claims.js:885` | `systems/world.js:354` |
| `claim:specialized` | `systems/claims.js:417` | — |
| `claim:teleportRequest` | `systems/claims.js:632` | — |
| `claims:migrated` | `systems/claims.js:2167` | — |
| `cloak:dropped` | `systems/cloak.js:117` | — |
| `cloak:engaged` | `systems/cloak.js:106` | `systems/onboarding.js:332` |
| `combat:actionCancelled` | `combat/actions.js:285` | — |
| `combat:actionCompleted` | `combat/actions.js:271` | — |
| `combat:actionPhase` | `combat/actions.js:157` | — |
| `combat:actionRejected` | `combat/actions.js:307` | — |
| `combat:actionStarted` | `combat/actions.js:127` | `systems/presentationOrchestrator.js:155`, `systems/scenarioRuntime.js:22` |
| `combat:baseDestroyed` | — | `systems/economy.js:659` |
| `combat:beamStop` | `systems/weapons.js:594` | `audio/audioSystem.js:678`, `render/vfx.js:1487` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:273` | `render/vfx.js:1496` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:275` | `render/vfx.js:1497` |
| `combat:damage` | `combat/damage.js:251` | `audio/audioSystem.js:682`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/feel.js:700`, `render/vfx.js:1489`, `save/saveSystem.js:140`, `systems/ai.js:89`, `systems/cruise.js:21`, `systems/encounterDirector.js:194`, `systems/factionPresence.js:404`, `systems/heat.js:168`, `systems/lawSecurity.js:119`, `systems/onboarding.js:213`, `systems/onboarding.js:224`, `systems/presentationOrchestrator.js:149`, `systems/scenarioRuntime.js:28`, `systems/stationBroadcast.js:152`, `systems/titles.js:371`, `ui/alerts.js:276`, `ui/commandBar.js:401`, `ui/floatingText.js:122`, `ui/floatingText.js:130`, `ui/hud.js:1227`, `ui/hud.js:1521`, `ui/hud.js:3200` |
| `combat:emberCookOff` | `combat/cookOff.js:88` | — |
| `combat:fire` | `systems/weapons.js:573`, `systems/weapons.js:707`, `systems/weapons.js:839` | `audio/audioSystem.js:677`, `render/feel.js:768`, `render/vfx.js:1486`, `systems/cloak.js:37`, `systems/cruise.js:28`, `systems/onboarding.js:205`, `systems/presentationOrchestrator.js:154`, `testing/metrics/arcadeCorePacingRoute.js:153`, `testing/metrics/arcadeCorePacingRoute.js:355`, `ui/hud.js:3184` |
| `combat:hit` | `systems/salvageActions.js:182` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:477` |
| `combat:lockChanged` | — | `systems/world.js:322`, `ui/alerts.js:283` |
| `combat:outcome` | `systems/combatOutcome.js:168` | `systems/barkDirector.js:41` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:169` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:72` |
| `combat:requestAction` | — | `combat/kernel.js:70` |
| `combat:routeDamage` | `systems/drill.js:984`, `systems/impulseCharges.js:493`, `systems/mines.js:212` | `combat/kernel.js:71`, `systems/routeFollower.js:333` |
| `combat:statusApplied` | `combat/statuses.js:155` | — |
| `combat:statusExpired` | `combat/statuses.js:57` | — |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:105`, `systems/encounterDirector.js:189`, `systems/factionPresence.js:402`, `systems/presentationOrchestrator.js:210`, `systems/surrenderRecovery.js:61`, `systems/wingMorale.js:184` |
| `combat:subsystemEnabled` | — | `systems/factionPresence.js:403`, `systems/surrenderRecovery.js:62` |
| `combat:surrendered` | — | `systems/combatOutcome.js:106`, `systems/surrenderRecovery.js:60` |
| `combat:tumbleEnd` | `systems/tumbleStates.js:144` | — |
| `combat:weakPointHit` | `systems/combat.js:583` | `ui/floatingText.js:134` |
| `comms:log` | `systems/encounterScripts.js:552`, `systems/salvage.js:462` | — |
| `comms:popup` | `systems/ai.js:459`, `systems/factionPresence.js:836`, `systems/factionPresence.js:857`, `systems/missions.js:3704`, `systems/missions.js:3738`, `systems/missions.js:3777`, `systems/missions.js:4520`, `systems/missions.js:4904`, `systems/scenarioRuntime.js:185`, `systems/story.js:375`, `systems/story.js:1016`, `systems/story.js:1044` | `audio/audioSystem.js:774`, `ui/screens/codex.js:373` |
| `conflict:flip` | `systems/factions.js:378` | `systems/sectorSim.js:109`, `systems/story.js:162` |
| `conflict:warDeclared` | `systems/factions.js:335` | — |
| `contactHail:availability` | `systems/scanner.js:1290`, `systems/scanner.js:1301` | — |
| `contactHail:choice` | `ui/contactHailPrompt.js:82` | `systems/scanner.js:784` |
| `contactHail:clear` | `systems/scanner.js:1312` | — |
| `contactHail:handoff` | `systems/scanner.js:1150` | — |
| `contactHail:offer` | `systems/scanner.js:1172` | — |
| `contactHail:request` | `ui/contactHailPrompt.js:76` | `systems/scanner.js:783` |
| `contactHail:response` | `systems/scanner.js:1206` | `systems/traffic.js:974` |
| `contraband:bribe` | `systems/encounterScripts.js:358`, `ui/customsPrompt.js:182` | `systems/economy.js:655` |
| `contraband:scanned` | `systems/economy.js:1969` | `systems/encounterDirector.js:195`, `systems/factions.js:191`, `systems/heat.js:171`, `systems/lawSecurity.js:127`, `ui/customsPrompt.js:130` |
| `contract:clauseBroken` | `systems/contractClauses.js:351` | `systems/missions.js:646` |
| `contract:clauseHonored` | `systems/contractClauses.js:338`, `systems/missions.js:3791` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:185` | — |
| `craft:complete` | `systems/crafting.js:220`, `systems/crafting.js:257` | `ui/screens/manufacture.js:216`, `ui/station/screens/industry.js:171` |
| `craft:queueChanged` | `systems/crafting.js:122`, `systems/crafting.js:230`, `systems/crafting.js:259` | `systems/onboarding.js:297`, `ui/screens/manufacture.js:217`, `ui/station/screens/industry.js:171` |
| `credits:changed` | `systems/economy.js:1693`, `systems/economy.js:1704` | `audio/audioSystem.js:704`, `balance/hunterPublicRoute.js:466`, `testing/metrics/arcadeCorePacingRoute.js:351`, `ui/commandBar.js:413`, `ui/hud.js:3171`, `ui/screens/manufacture.js:215`, `ui/screens/stationHub.js:2753`, `ui/screens/stationHub.js:2775`, `ui/screens/stationHub.js:2776` |
| `cruise:charging` | `systems/cruise.js:88` | `render/vfx.js:1538`, `systems/presentationOrchestrator.js:159` |
| `cruise:dropped` | `systems/cruise.js:99` | `render/vfx.js:1540`, `systems/presentationOrchestrator.js:161` |
| `cruise:engaged` | `systems/cruise.js:64` | `render/vfx.js:1539`, `systems/presentationOrchestrator.js:160` |
| `cruise:snareRequest` | `systems/encounterScripts.js:446` | `systems/cruise.js:33` |
| `cruise:snared` | `systems/cruise.js:98` | `audio/audioSystem.js:768` |
| `customs:breakScan` | `ui/customsPrompt.js:186` | — |
| `customs:submit` | `ui/customsPrompt.js:178` | — |
| `danger:miningNoise` | `systems/mining.js:1619` | — |
| `day:tick` | `core/coreSystem.js:172` | `systems/custodyConsequences.js:30`, `systems/encounterDirector.js:171`, `systems/factions.js:207`, `systems/sectorSim.js:93` |
| `discovery:plateUnlocked` | `systems/world.js:486`, `systems/world.js:3091`, `systems/world.js:3268`, `systems/world.js:3784` | `audio/audioSystem.js:722`, `ui/screens/codex.js:375` |
| `distress:rescued` | `systems/encounterScripts.js:551` | `systems/factions.js:200` |
| `dock:attempt` | `ui/input.js:81` | `ui/dockDenyBanner.js:100` |
| `dock:denied` | `ui/dockDenyBanner.js:125` | — |
| `dock:docked` | `balance/careerCohorts.js:487`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:84` | `audio/audioSystem.js:723`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:631`, `save/saveSystem.js:156`, `systems/aftermathWrecks.js:376`, `systems/autoTargetAssist.js:98`, `systems/combat.js:492`, `systems/economy.js:638`, `systems/economyContracts.js:162`, `systems/factionPresence.js:400`, `systems/mining.js:198`, `systems/missions.js:562`, `systems/onboarding.js:183`, `systems/onboarding.js:263`, `systems/scanner.js:787`, `systems/story.js:132`, `systems/world.js:348`, `ui/alerts.js:267`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:133`, `ui/dockDenyBanner.js:101`, `ui/priceForecast.js:86`, `ui/securityReadout.js:158`, `ui/uiRoot.js:847`, `ui/wingmanRadial.js:181` |
| `dock:range` | `core/physics.js:735`, `core/physics.js:739` | `systems/onboarding.js:233`, `ui/alerts.js:263`, `ui/input.js:65` |
| `dock:undocked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:520`, `ui/station/stationApp.js:730` | `audio/audioSystem.js:724`, `save/saveSystem.js:157`, `systems/combat.js:496`, `systems/economy.js:645`, `systems/missions.js:581`, `systems/presentationAdapters.js:171`, `systems/world.js:349`, `ui/input.js:72`, `ui/uiRoot.js:876` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1148` | `ui/uiRoot.js:935` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1133`, `ui/sandbox/sandboxSetup.js:506` | `ui/uiRoot.js:925` |
| `drill:approachRequested` | `ui/input.js:435` | `systems/tetherGameplay.js:148` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1025`, `ui/sandbox/sandboxSetup.js:505` | `ui/uiRoot.js:914` |
| `drill:break` | `systems/drill.js:883` | `systems/asteroidSites.js:153`, `systems/presentationOrchestrator.js:201`, `ui/asteroid/asteroidScreen.js:580`, `ui/screens/drill.js:1863` |
| `drill:cargoFull` | `systems/drill.js:932` | `ui/asteroid/asteroidScreen.js:569`, `ui/screens/drill.js:1833` |
| `drill:end` | `systems/drill.js:552` | `systems/asteroidSites.js:163`, `systems/presentationOrchestrator.js:204` |
| `drill:gasHit` | `systems/drill.js:971` | `systems/presentationOrchestrator.js:203`, `ui/asteroid/asteroidScreen.js:556`, `ui/screens/drill.js:1773` |
| `drill:retry` | `systems/drill.js:603` | `systems/presentationOrchestrator.js:205` |
| `drill:rockDepleted` | `systems/drill.js:518`, `systems/drill.js:897`, `systems/drill.js:923` | `ui/asteroid/asteroidScreen.js:566`, `ui/screens/drill.js:1824` |
| `drill:scanPulse` | `systems/drill.js:676` | `systems/asteroidSites.js:180`, `systems/presentationOrchestrator.js:199`, `ui/asteroid/asteroidScreen.js:573`, `ui/screens/drill.js:1851` |
| `drill:spark` | `systems/drill.js:855` | `systems/presentationOrchestrator.js:200`, `ui/asteroid/asteroidScreen.js:585`, `ui/screens/drill.js:1884` |
| `drill:start` | `systems/drill.js:510` | `systems/asteroidSites.js:146`, `systems/onboarding.js:268`, `systems/presentationOrchestrator.js:198` |
| `drill:warn` | `systems/drill.js:524`, `systems/drill.js:529`, `systems/drill.js:777`, `systems/drill.js:809`, `systems/drill.js:828`, `systems/drill.js:904`, `systems/drill.js:935`, `systems/drill.js:942` | `systems/presentationOrchestrator.js:197`, `ui/asteroid/asteroidScreen.js:562`, `ui/screens/drill.js:1801` |
| `drill:yield` | `systems/drill.js:921` | `systems/presentationOrchestrator.js:202`, `ui/asteroid/asteroidScreen.js:548`, `ui/screens/drill.js:1752` |
| `economy:applyTradePressure` | `systems/automation.js:715`, `systems/automation.js:1271`, `systems/automation.js:1272`, `systems/claims.js:1481`, `systems/encounterDirector.js:1635`, `systems/encounterDirector.js:1683`, `systems/sectorSim.js:375`, `systems/traffic.js:5972`, `systems/traffic.js:7462` | `systems/economy.js:625` |
| `economy:chargeCredits` | `systems/automation.js:1442`, `systems/automation.js:1449`, `systems/automation.js:2202`, `systems/automation.js:2426`, `systems/beacons.js:61`, `systems/claims.js:271`, `systems/claims.js:341`, `systems/claims.js:412`, `systems/claims.js:1514`, `systems/combat.js:778`, `systems/encounterDirector.js:1629`, `systems/gateControlDirector.js:119`, `systems/mining.js:428`, `systems/missions.js:1870`, `systems/missions.js:1873`, `systems/pirateParley.js:507`, `systems/ships.js:1082`, `systems/ships.js:1149`, `systems/ships.js:1205`, `systems/world.js:2367`, `systems/world.js:2411`, `systems/world.js:2813` | `systems/economy.js:593` |
| `economy:eventEnded` | `systems/economy.js:2047` | `ui/floatingText.js:201`, `ui/screens/stationHub.js:2815` |
| `economy:eventStarted` | `systems/economy.js:2022` | `ui/floatingText.js:190`, `ui/screens/market.js:741`, `ui/screens/stationHub.js:2814` |
| `economy:grantCredits` | `systems/automation.js:1536`, `systems/automation.js:2188`, `systems/claims.js:1480`, `systems/claims.js:2153`, `systems/combat.js:649`, `systems/combat.js:666`, `systems/combat.js:863`, `systems/encounterDirector.js:1630`, `systems/mining.js:1273`, `systems/mining.js:1448`, `systems/missions.js:3799`, `systems/missions.js:3802`, `systems/missions.js:4830`, `systems/moralTrap.js:133`, `systems/ships.js:1235`, `systems/survivorPod.js:851`, `systems/uniqueWrecks.js:1349` | `systems/economy.js:592`, `systems/story.js:160` |
| `economy:marketOpened` | `ui/screens/market.js:1816`, `ui/station/screens/market.js:733` | `systems/economy.js:601`, `ui/priceHistory.js:118` |
| `economy:salvageIntakeApplied` | `systems/economy.js:1681` | — |
| `economy:tick` | `systems/economy.js:750` | `ui/priceHistory.js:93`, `ui/screens/stationHub.js:2771` |
| `economy:trade` | — | `careers/origins/haulerOriginSystem.js:87` |
| `economy:tradeCompleted` | `systems/economy.js:1290` | `audio/audioSystem.js:712`, `careers/origins/prospectorOrigin.js:649`, `save/saveSystem.js:164`, `systems/factions.js:170`, `systems/missions.js:589`, `systems/onboarding.js:184`, `systems/sectorSim.js:104`, `systems/story.js:156`, `ui/screens/market.js:721`, `ui/screens/stationHub.js:2757`, `ui/screens/stationHub.js:2769`, `ui/screens/stationHub.js:2770` |
| `economy:tradeFailed` | `systems/economy.js:1368`, `systems/economy.js:1386`, `systems/economy.js:1489` | `ui/screens/market.js:732` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1480` | `ui/encounterChoicePrompt.js:143` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:106` | `systems/encounterDirector.js:207` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1570` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:4353` | `systems/encounterDirector.js:193` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1747` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:979` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:964` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:880` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1583` | — |
| `encounter:resolved` | `systems/encounterDirector.js:1565`, `systems/encounterDirector.js:1615` | `audio/audioSystem.js:728`, `systems/aftermathWrecks.js:375`, `systems/claims.js:240`, `systems/story.js:120`, `systems/terrainAnchors.js:44`, `systems/uniqueLootAbilities.js:114`, `ui/encounterChoicePrompt.js:144` |
| `encounter:spawned` | `systems/encounterDirector.js:615`, `systems/encounterDirector.js:1003` | `systems/uniqueLootAbilities.js:113`, `testing/metrics/arcadeCorePacingRoute.js:148` |
| `encounter:telegraph` | `systems/encounterDirector.js:604`, `systems/encounterDirector.js:988` | `audio/audioSystem.js:727`, `systems/terrainAnchors.js:43`, `systems/world.js:357` |
| `encounter:voice` | `systems/encounterDirector.js:1464` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | — |
| `endgame:chosen` | `systems/story.js:860` | `ui/screens/missionLog.js:1886` |
| `endgame:confirmRequired` | `systems/story.js:749` | `ui/screens/missionLog.js:1885` |
| `endgame:eligibility` | `systems/story.js:601` | `ui/screens/missionLog.js:1884` |
| `endgame:ineligible` | `systems/story.js:652`, `systems/story.js:729`, `systems/story.js:794` | — |
| `endgame:loopBack` | — | `systems/story.js:151` |
| `endgame:promptChoiceC` | `systems/story.js:714` | — |
| `endgame:promptChoiceD` | `systems/story.js:678` | — |
| `endgame:promptSandbox` | `systems/story.js:612` | — |
| `endgame:sandboxContinued` | `systems/story.js:854` | `ui/screens/missionLog.js:1887` |
| `entity:destroyed` | `main.js:325`, `main.js:443`, `save/saveSystem.js:2576`, `systems/lootShards.js:160`, `systems/survivorPod.js:252`, `systems/traffic.js:3943`, `systems/wingmen.js:133`, `systems/world.js:1290` | `audio/audioSystem.js:696`, `combat/kernel.js:65`, `render/renderer.js:2919`, `render/vfx.js:1499`, `systems/ai.js:101`, `systems/encounterDirector.js:187`, `systems/gateControlDirector.js:68`, `systems/heistFacilities.js:161`, `systems/lawSecurity.js:122`, `systems/missions.js:601`, `systems/npcJobsRuntime.js:426`, `systems/presentationOrchestrator.js:158`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:91`, `ui/prompts/bulkHaulTag.js:148`, `ui/radar.js:510` |
| `entity:kill` | — | `core/coreSystem.js:104` |
| `entity:killed` | `balance/careerCohorts.js:456`, `combat/damage.js:467`, `combat/kernel.js:44`, `systems/combat.js:631` | `audio/audioSystem.js:695`, `render/feel.js:733`, `render/vfx.js:1498`, `systems/aftermathWrecks.js:371`, `systems/ai.js:102`, `systems/claims.js:248`, `systems/combatOutcome.js:103`, `systems/encounterDirector.js:188`, `systems/factions.js:148`, `systems/heat.js:164`, `systems/lawSecurity.js:121`, `systems/lootShards.js:176`, `systems/lossLedger.js:336`, `systems/mining.js:193`, `systems/missions.js:599`, `systems/npcJobsRuntime.js:419`, `systems/presentationOrchestrator.js:157`, `systems/sectorSim.js:108`, `systems/surrenderRecovery.js:67`, `systems/survivorPod.js:370`, `systems/titles.js:372`, `systems/traffic.js:962`, `systems/wingMorale.js:183`, `systems/world.js:360`, `testing/metrics/arcadeCorePacingRoute.js:340`, `ui/floatingText.js:131`, `ui/floatingText.js:160`, `ui/galaxyMap.js:5673`, `ui/hud.js:3201` |
| `entity:spawnRequest` | — | `core/coreSystem.js:108` |
| `entity:spawned` | `core/coreSystem.js:60` | `combat/kernel.js:60`, `render/renderer.js:2917`, `render/renderer.js:3375`, `render/vfx.js:1505`, `systems/aiPorts.js:143`, `systems/factionPresence.js:406`, `systems/fields.js:143`, `systems/lawSecurity.js:120`, `systems/lossLedger.js:335`, `systems/npcJobsRuntime.js:412`, `systems/salvageActions.js:69`, `systems/titles.js:373`, `systems/uniqueLootAbilities.js:116`, `ui/radar.js:509` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:166` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:241`, `systems/factions.js:272`, `systems/factions.js:459` | `systems/heat.js:177` |
| `faction:repChanged` | `systems/factions.js:238`, `systems/factions.js:267`, `systems/factions.js:455` | `ui/floatingText.js:178`, `ui/screens/stationHub.js:2796`, `ui/station/screens/factions.js:337` |
| `faction:repDelta` | `balance/careerCohorts.js:255`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:1760`, `systems/economy.js:1962`, `systems/encounterDirector.js:1631`, `systems/missions.js:3904`, `systems/missions.js:3943`, `systems/missions.js:4783`, `systems/missions.js:4785`, `systems/missions.js:4835`, `systems/moralTrap.js:128`, `systems/moralTrap.js:135`, `systems/survivorPod.js:641`, `systems/survivorPod.js:857`, `systems/uniqueWrecks.js:1353`, `systems/world.js:3393`, `systems/world.js:3628` | `systems/factions.js:142` |
| `faction:repSpillover` | `systems/factions.js:265` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1076` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:840` | `systems/story.js:175` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:988` | `ui/uiRoot.js:228` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:689` | — |
| `factionPresence:service` | `systems/factionPresence.js:789` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:865` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:473`, `systems/factionPresence.js:558` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:517` | `systems/world.js:326` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:445`, `systems/traffic.js:1470`, `systems/traffic.js:7381` | — |
| `field:richSeamOpened` | `systems/traffic.js:6665` | — |
| `field:richSeamWorked` | `systems/mining.js:774`, `systems/traffic.js:6337` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:516` | `systems/npcJobsRuntime.js:433`, `systems/presentationOrchestrator.js:196` |
| `fields:anchorRegistered` | `systems/fields.js:239` | — |
| `fields:cleared` | `systems/fields.js:526` | — |
| `fields:coneToggled` | `systems/fields.js:437`, `systems/fields.js:444` | — |
| `fields:deployDenied` | `systems/fields.js:337` | — |
| `fields:deployed` | `systems/fields.js:408` | — |
| `fields:ended` | `systems/fields.js:273`, `systems/fields.js:282`, `systems/fields.js:510` | — |
| `flight:modeChanged` | `systems/flightV3.js:499` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:273` |
| `flybyFocus:end` | `systems/flybyFocus.js:311` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:387` | `systems/onboarding.js:202` |
| `formation:discovered` | `systems/asteroidFormations.js:235` | — |
| `freight:arrival` | `systems/traffic.js:4390` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1381`, `systems/encounterScripts.js:1600` | — |
| `freight:custodyChanged` | `systems/encounterScripts.js:1243` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:655` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1300` | — |
| `freight:loss` | `systems/encounterDirector.js:1693`, `systems/traffic.js:5974`, `systems/traffic.js:7474` | — |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1244` | `systems/surrenderRecovery.js:68` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1736` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:191`, `systems/traffic.js:977` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:192`, `systems/traffic.js:978` |
| `frontierRumor:acquired` | `systems/world.js:2430` | — |
| `frontierRumor:contacted` | `systems/world.js:3755` | — |
| `frontierRumor:resolved` | `systems/world.js:2447` | — |
| `fuel:changed` | `systems/economy.js:1726`, `systems/world.js:3141`, `systems/world.js:3149` | `ui/screens/stationHub.js:2754`, `ui/screens/stationHub.js:2789`, `ui/screens/stationHub.js:2790`, `ui/screens/stationHub.js:2791`, `ui/screens/stationHub.js:2792` |
| `fuel:empty` | `systems/world.js:3142` | `audio/audioSystem.js:745`, `ui/alerts.js:291` |
| `game:load` | `ui/input.js:177`, `ui/input.js:320`, `ui/screens/mainMenu.js:264`, `ui/screens/saveLoad.js:305` | `save/saveSystem.js:124`, `systems/scanner.js:786`, `ui/commandBar.js:430`, `ui/encounterChoicePrompt.js:147`, `ui/lawfulInspectionPrompt.js:177`, `ui/pirateParleyPrompt.js:250`, `ui/signalInvestigationPrompt.js:262` |
| `game:loadingProgress` | `main.js:128`, `main.js:146`, `main.js:410`, `main.js:468`, `main.js:480`, `main.js:496`, `main.js:521`, `main.js:539` | `ui/loadingPresenter.js:46` |
| `game:new` | `ui/sandbox/sandboxSetup.js:285`, `ui/screens/gameOver.js:261`, `ui/screens/newGame.js:425` | `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:119`, `main.js:194`, `render/feel.js:685`, `render/vfx.js:1513`, `save/saveSystem.js:152`, `systems/aftermathWrecks.js:382`, `systems/anomalyRuntime.js:50`, `systems/encounterDirector.js:185`, `systems/environmentalMachinery.js:46`, `systems/fields.js:138`, `systems/massSeed.js:120`, `systems/masslineSnares.js:120`, `systems/mines.js:37`, `systems/planetRuntime.js:103`, `systems/presentationOrchestrator.js:217`, `systems/scanner.js:785`, `systems/surrenderRecovery.js:74`, `systems/survivorPod.js:368`, `systems/tetherGameplay.js:143`, `ui/commandBar.js:429`, `ui/encounterChoicePrompt.js:146`, `ui/hudLayout.js:121`, `ui/lawfulInspectionPrompt.js:176`, `ui/pirateParleyPrompt.js:249`, `ui/priceHistory.js:119`, `ui/signalInvestigationPrompt.js:261` |
| `game:newGame` | — | `core/coreSystem.js:120`, `render/vfx.js:1514`, `save/saveSystem.js:153`, `systems/aftermathWrecks.js:383`, `systems/collisionConsequences.js:61`, `systems/fieldDepletion.js:433`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:337`, `systems/survivorPod.js:367`, `systems/titles.js:375`, `systems/wingMorale.js:185` |
| `game:over` | `systems/combat.js:603`, `systems/combat.js:699` | `ui/uiRoot.js:952` |
| `game:save` | `ui/input.js:176`, `ui/input.js:318`, `ui/screens/saveLoad.js:291` | `save/saveSystem.js:123` |
| `game:startFailed` | `main.js:611` | `ui/loadingPresenter.js:54`, `ui/sandbox/sandboxSetup.js:309`, `ui/screens/newGame.js:410` |
| `game:started` | `main.js:419` | `audio/audioSystem.js:831`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:121`, `render/renderer.js:2977`, `save/saveSystem.js:149`, `systems/automation.js:497`, `systems/collisionConsequences.js:60`, `systems/combat.js:503`, `systems/economyContracts.js:164`, `systems/factions.js:139`, `systems/flight.js:78`, `systems/flightV3.js:140`, `systems/heat.js:184`, `systems/masslineSnares.js:121`, `systems/missions.js:542`, `systems/onboarding.js:170`, `systems/presentationAdapters.js:169`, `systems/presentationOrchestrator.js:218`, `systems/sectorSim.js:99`, `systems/ships.js:873`, `systems/story.js:118`, `systems/surrenderRecovery.js:75`, `systems/tacticalAI.js:113`, `systems/tetherGameplay.js:144`, `ui/commandBar.js:428`, `ui/radar.js:511`, `ui/sandbox/sandboxSetup.js:306`, `ui/uiRoot.js:943`, `ui/uiRoot.js:968` |
| `gamepad:connected` | `systems/gamepad.js:177` | — |
| `gamepad:disconnected` | `systems/gamepad.js:162` | — |
| `gate:range` | `core/physics.js:745`, `core/physics.js:749` | `systems/onboarding.js:240`, `systems/presentationOrchestrator.js:162`, `ui/alerts.js:269` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:562`, `systems/story.js:451`, `systems/story.js:465`, `systems/story.js:1151`, `systems/story.js:1435`, `systems/story.js:1526`, `systems/uniqueWrecks.js:1359` | `systems/ships.js:868`, `ui/screens/codex.js:374` |
| `hazard:changed` | `systems/world.js:479` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:146`, `systems/world.js:3119` | `data/hazardLanguage.js:105` |
| `hazard:exit` | `systems/environmentalMachinery.js:152`, `systems/environmentalMachinery.js:179`, `systems/world.js:3129` | `data/hazardLanguage.js:106` |
| `heat:changed` | `systems/heat.js:411` | `render/vfx.js:1510`, `ui/hud.js:3207` |
| `heat:clear` | `systems/economy.js:1826` | `systems/heat.js:188` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:496` | `systems/missions.js:623` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:591` | `systems/missions.js:628` |
| `heist:launchCue` | `systems/heistFacilities.js:243` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:282`, `systems/heistFacilities.js:291`, `systems/heistFacilities.js:295`, `systems/heistFacilities.js:308` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:790` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:745` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:726` | — |
| `heist:receiverPrepared` | `systems/heistFacilities.js:681` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:163` |
| `hud:firstUse` | `systems/onboarding.js:357` | `ui/hud.js:1558` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:168` |
| `hud:phase` | `systems/story.js:217`, `systems/story.js:247`, `systems/story.js:250`, `systems/story.js:535` | `ui/hudMeta.js:133` |
| `hud:tagFlicker` | `systems/story.js:512` | `ui/hudMeta.js:167` |
| `interdiction:triggered` | `systems/encounterScripts.js:447`, `systems/world.js:2698` | `systems/presentationOrchestrator.js:170`, `systems/sectorSim.js:105` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:2639` | `render/feel.js:799`, `render/renderer.js:3392`, `render/renderer.js:3621`, `save/saveSystem.js:159`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:168`, `systems/sectorSim.js:114` |
| `jump:chargeAbort` | `systems/world.js:2776`, `systems/world.js:2840`, `systems/world.js:2897` | `render/renderer.js:3370`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:167`, `systems/routeFollower.js:324` |
| `jump:chargeStart` | `systems/world.js:2825`, `systems/world.js:2864` | `render/feel.js:789`, `render/renderer.js:3367`, `systems/gateControlDirector.js:64`, `systems/presentationOrchestrator.js:164`, `systems/story.js:138` |
| `jump:chargeTick` | `systems/world.js:2590` | `systems/presentationOrchestrator.js:165` |
| `jump:departurePreflight` | `systems/world.js:2809` | `systems/story.js:137` |
| `jump:start` | `systems/world.js:2601` | `render/feel.js:793`, `systems/economy.js:653`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:166`, `systems/sectorSim.js:113` |
| `jump:unfiledConfirmed` | `systems/world.js:2881` | `systems/story.js:139` |
| `landmark:artifactRecovered` | `systems/missions.js:3006` | `systems/world.js:350` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:29` |
| `law:distressRaised` | — | `ui/signalInvestigationPrompt.js:260` |
| `law:reportIncidentReceipt` | — | `systems/heat.js:197` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:140` | `systems/lawSecurity.js:126` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:172` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:174` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:173` |
| `loot:drop` | `systems/combat.js:670`, `systems/lootShards.js:234` | `systems/mining.js:195`, `ui/floatingText.js:155` |
| `loot:manifestPayload` | `systems/lootShards.js:303` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:299` | `systems/factionPresence.js:401`, `systems/ships.js:850` |
| `map:sectorCharted` | `systems/world.js:2371` | `systems/economy.js:606` |
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
| `massline:selfSling` | `systems/masslineThrow.js:563` | `render/renderer.js:2975`, `systems/flightV3.js:142`, `systems/onboarding.js:320` |
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
| `mines:armed` | `systems/mines.js:134` | — |
| `mines:capReached` | `systems/mines.js:53` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:95` | `systems/mines.js:34` |
| `mines:placed` | `systems/mines.js:108` | — |
| `mines:released` | `systems/mines.js:226` | — |
| `mines:triggered` | `systems/mines.js:192` | — |
| `mining:beamCooled` | `systems/mining.js:549` | — |
| `mining:beamLocked` | `systems/mining.js:683` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:1449` | `systems/missions.js:597`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:697` | `systems/presentationOrchestrator.js:192`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:555` | — |
| `mining:npcExtraction` | `systems/traffic.js:6325` | `systems/fieldDepletion.js:432` |
| `mining:overheated` | `systems/mining.js:541` | `systems/presentationOrchestrator.js:185` |
| `mining:richCoreChargeStart` | `systems/mining.js:1402` | `systems/presentationOrchestrator.js:189` |
| `mining:richCoreCompleted` | `systems/mining.js:1429` | `systems/presentationOrchestrator.js:190` |
| `mining:richCoreExposed` | `systems/mining.js:1380` | `systems/presentationOrchestrator.js:188` |
| `mining:richCoreFizzle` | `systems/mining.js:1431` | `systems/presentationOrchestrator.js:191` |
| `mining:seamHit` | `systems/mining.js:1687` | `systems/presentationOrchestrator.js:179` |
| `mining:start` | `systems/mining.js:275`, `systems/mining.js:391` | `audio/audioSystem.js:699`, `render/vfx.js:1529`, `systems/onboarding.js:187`, `systems/presentationOrchestrator.js:176` |
| `mining:stop` | `systems/mining.js:486` | `audio/audioSystem.js:700`, `render/vfx.js:1530`, `systems/presentationOrchestrator.js:177` |
| `mining:tick` | `systems/automation.js:698`, `systems/automation.js:829`, `systems/mining.js:718` | `audio/audioSystem.js:701`, `render/vfx.js:1531`, `systems/presentationOrchestrator.js:178` |
| `mining:ventBonus` | `systems/mining.js:592` | — |
| `mining:ventReady` | `systems/mining.js:521` | `systems/presentationOrchestrator.js:184` |
| `mining:yield` | `balance/careerCohorts.js:1805`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:589`, `systems/mining.js:833`, `systems/mining.js:1156`, `systems/mining.js:1426` | `careers/origins/prospectorOrigin.js:637`, `render/feel.js:812`, `render/vfx.js:1532`, `systems/encounterDirector.js:209`, `systems/missions.js:591`, `systems/onboarding.js:188`, `systems/presentationOrchestrator.js:186`, `ui/floatingText.js:140` |
| `miningDrone:sellOre` | — | `systems/economy.js:621` |
| `mission:abandoned` | — | `careers/origins/haulerOriginSystem.js:72`, `ui/hud.js:3177` |
| `mission:accepted` | `systems/missions.js:1902` | `audio/audioSystem.js:716`, `save/saveSystem.js:160`, `systems/aftermathWrecks.js:378`, `systems/contractClauses.js:196`, `systems/onboarding.js:190`, `ui/hud.js:3175`, `ui/screens/missionLog.js:1869`, `ui/screens/stationHub.js:2804` |
| `mission:completed` | `systems/missions.js:3874` | `audio/audioSystem.js:717`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:161`, `systems/aftermathWrecks.js:379`, `systems/contractClauses.js:200`, `systems/factions.js:179`, `systems/onboarding.js:191`, `systems/story.js:155`, `ui/hud.js:3176`, `ui/screens/missionLog.js:1870`, `ui/screens/stationHub.js:2811` |
| `mission:conditionBroken` | `systems/contractClauses.js:306`, `systems/missions.js:826` | — |
| `mission:conditionPending` | `systems/missions.js:878` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:274`, `systems/missions.js:809` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:285`, `systems/missions.js:817` | `systems/missions.js:649` |
| `mission:expired` | `systems/missions.js:3956` | `audio/audioSystem.js:721`, `save/saveSystem.js:163`, `systems/aftermathWrecks.js:381`, `systems/factions.js:188`, `ui/screens/missionLog.js:1872`, `ui/screens/stationHub.js:2813` |
| `mission:failed` | `systems/missions.js:3922` | `audio/audioSystem.js:720`, `careers/origins/haulerOriginSystem.js:71`, `save/saveSystem.js:162`, `systems/aftermathWrecks.js:380`, `systems/factions.js:187`, `ui/screens/missionLog.js:1871`, `ui/screens/stationHub.js:2812` |
| `mission:forceEvent` | — | `systems/economy.js:658` |
| `mission:offerBoarded` | `systems/missions.js:1361` | `systems/aftermathWrecks.js:377` |
| `mission:offered` | `systems/aftermathWrecks.js:477`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:229`, `systems/economyContracts.js:251`, `systems/lossLedger.js:275`, `systems/postEndingReplay.js:340`, `systems/salvage.js:470`, `systems/uniqueWrecks.js:715` | `systems/lossInvestigation.js:106`, `systems/missions.js:557`, `systems/survivorPod.js:365` |
| `mission:setPieceTransition` | `systems/missions.js:3725` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:4526` | — |
| `mission:spawnDeferred` | `systems/missions.js:4414` | — |
| `mission:updated` | `systems/contractClauses.js:279`, `systems/contractClauses.js:289`, `systems/contractClauses.js:318`, `systems/missions.js:813`, `systems/missions.js:821`, `systems/missions.js:838`, `systems/missions.js:908`, `systems/missions.js:968`, `systems/missions.js:1069`, `systems/missions.js:1121`, `systems/missions.js:1252`, `systems/missions.js:1286`, `systems/missions.js:1298`, `systems/missions.js:1360`, `systems/missions.js:1830`, `systems/missions.js:1914`, `systems/missions.js:2056`, `systems/missions.js:2232`, `systems/missions.js:2728`, `systems/missions.js:2764`, `systems/missions.js:2777`, `systems/missions.js:2785`, `systems/missions.js:2801`, `systems/missions.js:2848`, `systems/missions.js:2897`, `systems/missions.js:2906`, `systems/missions.js:3039`, `systems/missions.js:3065`, `systems/missions.js:3133`, `systems/missions.js:3149`, `systems/missions.js:3191`, `systems/missions.js:3212`, `systems/missions.js:3248`, `systems/missions.js:3298`, `systems/missions.js:3545`, `systems/missions.js:3575`, `systems/missions.js:3582`, `systems/missions.js:3863`, `systems/missions.js:3933`, `systems/missions.js:3966`, `systems/missions.js:4251`, `systems/missions.js:4405`, `systems/missions.js:4608`, `systems/missions.js:4864`, `systems/missions.js:5010` | `ui/hud.js:3174`, `ui/screens/missionLog.js:1868`, `ui/screens/stationHub.js:2798`, `ui/station/screens/contracts.js:484` |
| `mode:changed` | `main.js:588`, `main.js:598`, `main.js:609`, `save/saveSystem.js:2253`, `save/saveSystem.js:2343` | `render/renderer.js:3608`, `systems/autoTargetAssist.js:93`, `systems/presentationAdapters.js:168`, `systems/scanner.js:788`, `ui/loadingPresenter.js:47`, `ui/screenManager.js:449`, `ui/uiRoot.js:571`, `ui/wingmanRadial.js:180` |
| `module:equipped` | `systems/ships.js:1358` | `systems/ships.js:813`, `systems/world.js:323`, `ui/screens/stationHub.js:2784` |
| `module:granted` | `systems/ships.js:1163` | — |
| `module:purchased` | `systems/ships.js:1150` | `ui/screens/stationHub.js:2786` |
| `module:unequipped` | `systems/ships.js:1377` | `systems/ships.js:814`, `systems/world.js:324`, `ui/screens/stationHub.js:2785` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:201` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | — |
| `moralTrap:choose` | — | `systems/moralTrap.js:73` |
| `moralTrap:resolved` | `systems/moralTrap.js:118` | — |
| `moralTrap:revealed` | `systems/moralTrap.js:91` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:2489` | — |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:804`, `systems/world.js:2942` | `systems/routeFollower.js:319` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:2554`, `systems/claims.js:1799`, `systems/claims.js:1807`, `systems/missions.js:572`, `systems/missions.js:2221`, `systems/missions.js:2288`, `systems/missions.js:2320`, `systems/missions.js:2746`, `systems/world.js:2941`, `ui/screens/market.js:1893` | `ui/screens/stationHub.js:2793`, `ui/screens/stationHub.js:2794` |
| `news:dockCards` | `ui/marketNews.js:281` | — |
| `news:headline` | `systems/aftermathWrecks.js:282`, `systems/e1EncounterRuntime.js:225`, `systems/traffic.js:5975`, `systems/traffic.js:7476`, `ui/marketNews.js:199` | — |
| `news:publish` | `systems/traffic.js:2778`, `systems/uniqueWrecks.js:337`, `systems/uniqueWrecks.js:1403`, `systems/world.js:488` | — |
| `npcjobs:hold` | — | `systems/traffic.js:971` |
| `npcjobs:load` | — | `systems/traffic.js:969` |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:1692` | — |
| `npcjobs:unload` | — | `systems/traffic.js:970` |
| `npcjobs:work` | — | `systems/traffic.js:968` |
| `orrinWitness:ensureEvidence` | `systems/story.js:986` | `systems/world.js:329` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1178` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1011` | — |
| `orrinWitness:submitted` | `systems/story.js:1039` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:3722` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:543` | `systems/world.js:331` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:3517` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:3552` | — |
| `pallasHiddenCache:pickupReady` | `systems/world.js:3682` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:3635` | — |
| `patrol:proximity` | `systems/encounterScripts.js:370` | `systems/economy.js:654` |
| `physics:attachmentBroken` | — | `combat/kernel.js:69` |
| `physics:impact` | `core/physics.js:1133` | `render/vfx.js:1490`, `systems/asteroidSites.js:215`, `systems/collisionConsequences.js:55`, `systems/fragileCargo.js:202`, `systems/heistFacilities.js:162`, `systems/masslineImpactDamage.js:43` |
| `pickup:collected` | `core/physics.js:1047`, `systems/mining.js:1539`, `systems/uniqueWrecks.js:1284` | `audio/audioSystem.js:703`, `render/vfx.js:1548`, `systems/cargo.js:216`, `systems/encounterDirector.js:190`, `systems/mining.js:197`, `systems/onboarding.js:189`, `systems/presentationOrchestrator.js:193`, `systems/traffic.js:979`, `systems/world.js:332`, `systems/world.js:333`, `ui/floatingText.js:170` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:188` | `systems/pirateParley.js:41` |
| `pirateParley:demand` | `systems/scanner.js:1156` | `ui/pirateParleyPrompt.js:247`, `ui/signalInvestigationPrompt.js:259` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:248` |
| `planet:collector` | `systems/planetRuntime.js:483` | — |
| `planet:harvest` | `systems/planetRuntime.js:516` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:520` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:382`, `systems/planetRuntime.js:395` | `testing/metrics/arcadeCoreAtmosphereRoute.js:114` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:468` | — |
| `planet:registered` | `systems/planetRuntime.js:193` | — |
| `planet:unregistered` | `systems/planetRuntime.js:225` | — |
| `player:death` | `systems/combat.js:601`, `systems/combat.js:697`, `systems/combat.js:858` | `audio/audioSystem.js:697`, `render/feel.js:759`, `render/vfx.js:1528`, `save/saveSystem.js:135`, `systems/lawSecurity.js:128`, `systems/surrenderRecovery.js:70`, `testing/metrics/arcadeCorePacingRoute.js:354`, `ui/commandBar.js:405`, `ui/hud.js:1802` |
| `player:recoveryFailed` | `systems/combat.js:736` | `ui/screens/gameOver.js:295` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:232` | `systems/combat.js:497` |
| `player:respawn` | `systems/combat.js:795`, `systems/combat.js:871` | `audio/audioSystem.js:698`, `render/renderer.js:2979`, `save/saveSystem.js:136`, `save/saveSystem.js:169`, `ui/commandBar.js:409`, `ui/hud.js:1816`, `ui/screens/gameOver.js:287` |
| `player:scannedByPatrol` | `systems/economy.js:1915` | `render/vfx.js:1509`, `systems/missions.js:643`, `ui/customsPrompt.js:129` |
| `poi:discovered` | `systems/world.js:517`, `systems/world.js:3046`, `systems/world.js:3076`, `systems/world.js:3239`, `systems/world.js:3265` | `systems/encounterDirector.js:203`, `systems/world.js:355` |
| `poi:identified` | `systems/world.js:3083`, `systems/world.js:3266` | `systems/encounterDirector.js:204`, `systems/missions.js:559`, `systems/world.js:356` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:1891` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:1890` |
| `presentation:audioCue` | `systems/presentationAdapters.js:506` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:428` | — |
| `presentation:caption` | `systems/factionPresence.js:615`, `systems/factionPresence.js:945`, `systems/factionPresence.js:960`, `systems/factionPresence.js:978`, `systems/factionPresence.js:1040`, `systems/presentationAdapters.js:598`, `systems/story.js:930`, `systems/story.js:1094` | `ui/hud.js:1867` |
| `presentation:cue` | — | `audio/audioSystem.js:776`, `render/vfx.js:1545`, `render/vfx.js:1546`, `systems/presentationAdapters.js:165` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:410` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:337`, `systems/presentationAdapters.js:577` | — |
| `presentation:vfxCue` | `combat/cookOff.js:89`, `render/vfx.js:1557`, `systems/fields.js:712`, `systems/fields.js:728`, `systems/impulseCharges.js:453`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:456`, `systems/missions.js:1927`, `systems/missions.js:3879`, `systems/planetRuntime.js:540`, `systems/presentationAdapters.js:474`, `systems/tumbleStates.js:234`, `systems/weapons.js:929`, `systems/weapons.js:997` | `render/vfx.js:1547` |
| `projectile:hit` | `core/physics.js:605`, `core/physics.js:643`, `systems/sectorSim.js:548` | `audio/audioSystem.js:681`, `render/vfx.js:1488`, `systems/combat.js:490`, `testing/metrics/arcadeCorePacingRoute.js:359` |
| `projectile:nearMiss` | `core/physics.js:621` | `systems/presentationOrchestrator.js:156` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:548` | — |
| `recovery:started` | — | `ui/signalInvestigationPrompt.js:258` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:547` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:155` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:156` |
| `research:grant` | `systems/lootShards.js:243` | `systems/missions.js:558` |
| `research:pointsChanged` | `systems/missions.js:2966` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:1882` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1067` | `systems/encounterDirector.js:210` |
| `rumor:ghostConvoy` | `systems/lossLedger.js:274` | — |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:471` | `systems/encounterDirector.js:205`, `systems/story.js:178` |
| `salvage:completed` | `systems/mining.js:1161` | `systems/aftermathWrecks.js:374`, `systems/missions.js:595` |
| `salvage:cutComplete` | `systems/mining.js:419` | — |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | — |
| `salvage:npcExtraction` | `systems/traffic.js:4021` | — |
| `salvage:npcUnload` | `systems/traffic.js:7213` | `systems/economy.js:632` |
| `salvage:placed` | `systems/salvage.js:323` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:363` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:816` | — |
| `save:completed` | `save/saveSystem.js:822` | `ui/uiRoot.js:288` |
| `save:error` | `main.js:137`, `save/saveSystem.js:559`, `save/saveSystem.js:614`, `save/saveSystem.js:628`, `save/saveSystem.js:826`, `save/saveSystem.js:1063`, `save/saveSystem.js:1352`, `save/saveSystem.js:2042`, `save/saveSystem.js:2047`, `save/saveSystem.js:2078`, `save/saveSystem.js:2086`, `save/saveSystem.js:2097`, `save/saveSystem.js:2142`, `save/saveSystem.js:2160`, `save/saveSystem.js:2360`, `save/saveSystem.js:2368`, `save/saveSystem.js:2395`, `save/saveSystem.js:2732`, `save/saveSystem.js:2745`, `save/saveSystem.js:2759` | `systems/aftermathWrecks.js:386`, `systems/asteroidSites.js:214`, `systems/automation.js:492`, `systems/encounterDirector.js:182`, `ui/loadingPresenter.js:55`, `ui/screenManager.js:450`, `ui/uiRoot.js:310` |
| `save:exportRecovery` | `save/saveSystem.js:2721` | — |
| `save:loaded` | `save/saveSystem.js:2346` | `audio/audioSystem.js:823`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:115`, `core/physics.js:74`, `main.js:188`, `render/feel.js:687`, `render/renderer.js:2978`, `render/renderer.js:3629`, `render/vfx.js:1516`, `save/saveSystem.js:148`, `systems/aftermathWrecks.js:385`, `systems/anomalyRuntime.js:52`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:205`, `systems/automation.js:487`, `systems/beacons.js:37`, `systems/collisionConsequences.js:59`, `systems/combat.js:504`, `systems/economy.js:662`, `systems/encounterDirector.js:181`, `systems/environmentalMachinery.js:48`, `systems/factionPresence.js:407`, `systems/fields.js:139`, `systems/flight.js:74`, `systems/flightV3.js:133`, `systems/gateControlDirector.js:70`, `systems/heat.js:185`, `systems/lawSecurity.js:125`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:122`, `systems/mines.js:38`, `systems/missions.js:544`, `systems/npcJobsRuntime.js:400`, `systems/npcJobsRuntime.js:408`, `systems/onboarding.js:174`, `systems/planetRuntime.js:104`, `systems/presentationAdapters.js:172`, `systems/presentationOrchestrator.js:219`, `systems/routeFollower.js:336`, `systems/sectorSim.js:98`, `systems/ships.js:818`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:93`, `systems/story.js:119`, `systems/survivorPod.js:369`, `systems/tacticalAI.js:114`, `systems/tetherGameplay.js:142`, `systems/titles.js:374`, `systems/traffic.js:988`, `systems/travelLanes.js:288`, `systems/uniqueLootAbilities.js:117`, `systems/world.js:338`, `ui/bandHud.js:82`, `ui/hudLayout.js:120`, `ui/priceHistory.js:120`, `ui/radar.js:512`, `ui/uiRoot.js:295`, `ui/uiRoot.js:969` |
| `save:recovered` | `save/saveSystem.js:2067` | `ui/uiRoot.js:303` |
| `save:restoring` | `save/saveSystem.js:2182` | `core/coreSystem.js:112`, `render/feel.js:686`, `render/renderer.js:3016`, `render/vfx.js:1515`, `systems/aftermathWrecks.js:384`, `systems/anomalyRuntime.js:51`, `systems/asteroidSites.js:197`, `systems/automation.js:481`, `systems/encounterDirector.js:174`, `systems/environmentalMachinery.js:47`, `systems/lawSecurity.js:124`, `systems/missions.js:548`, `systems/npcJobsRuntime.js:401`, `systems/salvage.js:72`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:71`, `systems/traffic.js:980`, `systems/world.js:334` |
| `save:started` | `save/saveSystem.js:617`, `save/saveSystem.js:1113` | `ui/screenManager.js:457`, `ui/uiRoot.js:284` |
| `scan:completed` | `balance/careerCohorts.js:477`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:904`, `systems/world.js:3050` | `careers/origins/prospectorOrigin.js:634`, `systems/missions.js:603`, `systems/onboarding.js:201`, `systems/presentationOrchestrator.js:172`, `systems/salvage.js:69`, `systems/salvageActions.js:70`, `systems/story.js:169`, `ui/hud.js:3521` |
| `scan:pulse` | `systems/scanner.js:842` | `systems/buildIdentity.js:268`, `systems/encounterDirector.js:196`, `systems/pirateDisguise.js:16`, `systems/presentationOrchestrator.js:171`, `systems/scanReveal.js:14`, `ui/hud.js:3522` |
| `scan:shipRevealed` | `systems/scanReveal.js:37` | `systems/buildIdentity.js:267` |
| `scan:weakPoint` | `systems/scanner.js:893` | `ui/hud.js:1209` |
| `scanner:ghostEscaped` | `systems/scanner.js:825` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:872` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:137` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:154` | `systems/presentationOrchestrator.js:85` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:572` | `systems/presentationOrchestrator.js:216` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:359` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:547` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:132` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:122` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:189` | — |
| `scenario:scavengerResponse` | `ui/comms.js:468`, `ui/comms.js:472` | `systems/scenarioRuntime.js:29` |
| `sector:discovered` | `systems/world.js:615` | `systems/presentationOrchestrator.js:169` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:628`, `testing/metrics/arcadeCorePacingRoute.js:159` | `audio/audioSystem.js:750`, `render/renderer.js:3435`, `render/vfx.js:1511`, `save/saveSystem.js:158`, `systems/aftermathWrecks.js:372`, `systems/asteroidFormations.js:120`, `systems/asteroidSites.js:190`, `systems/automation.js:517`, `systems/claims.js:239`, `systems/economy.js:646`, `systems/encounterDirector.js:170`, `systems/factionPresence.js:398`, `systems/fields.js:137`, `systems/heistFacilities.js:159`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:119`, `systems/mines.js:36`, `systems/mining.js:200`, `systems/missions.js:660`, `systems/moralTrap.js:72`, `systems/npcJobsRuntime.js:391`, `systems/presentationOrchestrator.js:206`, `systems/routeFollower.js:328`, `systems/salvage.js:67`, `systems/sectorSim.js:95`, `systems/story.js:136`, `systems/story.js:168`, `systems/survivorPod.js:364`, `systems/tetherGameplay.js:146`, `systems/traffic.js:957`, `systems/wingmen.js:48`, `ui/causeLedger.js:132`, `ui/commandBar.js:415`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/radar.js:513`, `ui/radar.js:514`, `ui/sectorPostcard.js:148`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:559` | `render/renderer.js:3399`, `render/vfx.js:1512`, `systems/aftermathWrecks.js:373`, `systems/anomalyRuntime.js:49`, `systems/asteroidSites.js:196`, `systems/automation.js:506`, `systems/claims.js:247`, `systems/encounterDirector.js:172`, `systems/environmentalMachinery.js:45`, `systems/factionPresence.js:399`, `systems/fields.js:136`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:160`, `systems/lawSecurity.js:123`, `systems/massSeed.js:118`, `systems/masslineSnares.js:118`, `systems/mines.js:35`, `systems/missions.js:661`, `systems/npcJobsRuntime.js:390`, `systems/planetRuntime.js:105`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:50`, `systems/stationSideEventDirector.js:92`, `systems/surrenderRecovery.js:69`, `systems/tetherGameplay.js:145`, `systems/traffic.js:960`, `systems/wingmen.js:51`, `ui/customsPrompt.js:131`, `ui/encounterChoicePrompt.js:145`, `ui/lawfulInspectionPrompt.js:175` |
| `sectorsim:embodiment` | `systems/sectorSim.js:801` | `systems/world.js:364` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:318` | `ui/screens/starmap.js:583` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:527`, `systems/claims.js:1762`, `systems/encounterDirector.js:1698`, `systems/mining.js:1639` | `systems/sectorSim.js:103` |
| `sectorsim:intel` | `systems/sectorSim.js:855` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:639` | `systems/economy.js:671` |
| `sectorsim:reconcile` | `systems/sectorSim.js:596` | — |
| `sectorsim:tick` | `systems/sectorSim.js:263` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:559` | `ui/screens/starmap.js:584` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:540` | — |
| `service:completed` | `systems/economy.js:1757`, `systems/economy.js:1788`, `systems/economy.js:1827` | `systems/ships.js:855` |
| `settings:changed` | `save/saveSystem.js:2376`, `save/saveSystem.js:2377`, `systems/touch.js:275`, `ui/screens/settings.js:250`, `ui/screens/settings.js:550`, `ui/screens/settings.js:625` | `audio/audioSystem.js:797`, `main.js:187`, `render/renderer.js:2984`, `render/vfx.js:1524`, `save/saveSystem.js:130`, `ui/uiRoot.js:471` |
| `ship:appearanceChanged` | `systems/ships.js:1050`, `systems/ships.js:1282`, `systems/traffic.js:2318` | `core/coreSystem.js:111`, `render/renderer.js:2934`, `render/vfx.js:1506` |
| `ship:appearanceSaved` | `systems/ships.js:1284` | — |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:184` | `audio/audioSystem.js:756`, `render/vfx.js:1535`, `systems/cruise.js:25` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:185`, `systems/flightV3.js:412` | `audio/audioSystem.js:761`, `render/renderer.js:2972`, `render/vfx.js:1536` |
| `ship:cargoCapChanged` | `systems/ships.js:1045` | `systems/cargo.js:266` |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:391` | `audio/audioSystem.js:762`, `render/feel.js:693`, `render/vfx.js:1537`, `systems/uniqueLootAbilities.js:115` |
| `ship:livingHullChanged` | `systems/ships.js:905`, `systems/ships.js:926` | `render/renderer.js:2942` |
| `ship:massChanged` | `systems/ships.js:1179` | — |
| `ship:purchased` | `systems/ships.js:1215` | `audio/audioSystem.js:749`, `systems/missions.js:664`, `ui/screens/stationHub.js:2782` |
| `ship:roleContext` | `systems/ships.js:984` | `systems/presentationAdapters.js:167` |
| `ship:sold` | `systems/ships.js:1236` | `ui/screens/stationHub.js:2783` |
| `ship:statsChanged` | `systems/ships.js:1044` | `systems/cargo.js:267`, `systems/world.js:325`, `ui/commandBar.js:410`, `ui/hud.js:3173`, `ui/screens/stationHub.js:2756`, `ui/screens/stationHub.js:2778`, `ui/screens/stationHub.js:2779`, `ui/screens/stationHub.js:2780`, `ui/screens/stationHub.js:2781` |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1188` | `render/vfx.js:1534` |
| `signal:investigate` | — | `systems/scanner.js:782` |
| `signal:investigated` | `systems/scanner.js:1353` | `systems/missions.js:612`, `systems/presentationOrchestrator.js:175`, `systems/story.js:121`, `systems/world.js:328`, `ui/signalInvestigationPrompt.js:257` |
| `signal:investigating` | `systems/scanner.js:1115` | `ui/signalInvestigationPrompt.js:256` |
| `signal:receipt` | `systems/scanner.js:1354` | — |
| `signal:scanResults` | `systems/scanner.js:905` | `systems/missions.js:604`, `systems/presentationOrchestrator.js:173`, `ui/signalInvestigationPrompt.js:254` |
| `signal:track` | — | `systems/scanner.js:781` |
| `signal:tracked` | `systems/scanner.js:1132` | `systems/presentationOrchestrator.js:174`, `ui/signalInvestigationPrompt.js:255` |
| `sim:jumpGate` | — | `systems/economy.js:652` |
| `sim:pause` | `ui/screenManager.js:299` | `audio/audioSystem.js:813`, `render/feel.js:684` |
| `sim:resume` | `ui/screenManager.js:306` | `audio/audioSystem.js:814` |
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
| `spawn:request` | `systems/automation.js:1199` | `systems/world.js:351` |
| `station:broadcastTic` | `systems/stationBroadcast.js:226` | — |
| `station:exitRequest` | `ui/screenManager.js:414`, `ui/uiRoot.js:879` | `ui/screens/stationHub.js:2735`, `ui/station/stationApp.js:981` |
| `station:navigate` | `ui/screens/automationPanel.js:962`, `ui/station/screens/bar.js:413`, `ui/station/screens/bar.js:418`, `ui/station/screens/industry.js:155` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:246` | `render/vfx.js:1533` |
| `stationContact:changed` | `systems/stationContacts.js:261`, `systems/stationContacts.js:297`, `systems/stationContacts.js:352`, `systems/stationContacts.js:376` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:221`, `systems/stationContacts.js:393` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:285` | — |
| `story:beatAdvanced` | `systems/missions.js:4850` | `save/saveSystem.js:165`, `systems/story.js:114`, `ui/screens/codex.js:372` |
| `story:elroyResolved` | `systems/missions.js:3335` | `systems/story.js:115` |
| `story:kurtzLedger` | `systems/story.js:1366`, `systems/story.js:1377` | — |
| `story:newGamePlusStarted` | `systems/story.js:1472` | `ui/hudMeta.js:95` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1520` | — |
| `story:postEndingContinuity` | `systems/story.js:1269` | — |
| `story:postEndingProgress` | `systems/story.js:1239` | `ui/screens/missionLog.js:1888` |
| `story:replayHookUnlocked` | `systems/story.js:1254` | `ui/screens/missionLog.js:1889` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1073` | — |
| `story:vergeObserversRevealed` | `systems/story.js:929` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1093` | — |
| `surrender:secured` | — | `systems/traffic.js:976` |
| `surrender:tethered` | — | `systems/traffic.js:975` |
| `survivorPod:choose` | — | `systems/survivorPod.js:366` |
| `survivorPod:ejected` | `systems/survivorPod.js:486` | `systems/traffic.js:963` |
| `survivorPod:promoted` | `systems/survivorPod.js:718` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:812` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:824` | — |
| `survivorPod:resolved` | `systems/survivorPod.js:652` | `systems/traffic.js:964` |
| `survivorPod:stripped` | `systems/survivorPod.js:863` | — |
| `tech:researched` | `systems/ships.js:1087` | `audio/audioSystem.js:748`, `systems/onboarding.js:281`, `systems/ships.js:815`, `ui/screens/manufacture.js:218`, `ui/screens/stationHub.js:2787` |
| `tether:attached` | `combat/attachments.js:322` | `render/vfx.js:1482`, `systems/encounterDirector.js:200`, `systems/presentationOrchestrator.js:86`, `systems/scenarioRuntime.js:23`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:267`, `systems/tetherGameplay.js:963` | `careers/origins/prospectorOrigin.js:646`, `systems/onboarding.js:199`, `systems/surrenderRecovery.js:66` |
| `tether:broken` | `combat/attachments.js:440` | `render/feel.js:824`, `render/renderer.js:2974`, `render/vfx.js:1485`, `systems/presentationOrchestrator.js:94`, `systems/scenarioRuntime.js:27`, `systems/tetherGameplay.js:147` |
| `tether:cut` | `systems/tetherGameplay.js:241`, `systems/tetherGameplay.js:1331` | `systems/masslineThrow.js:68` |
| `tether:latchDenied` | `systems/masslineSnares.js:464`, `systems/tetherGameplay.js:188`, `systems/tetherGameplay.js:357`, `systems/tetherGameplay.js:400`, `systems/tetherGameplay.js:405`, `systems/tetherGameplay.js:415`, `systems/tetherGameplay.js:430`, `systems/tetherGameplay.js:718` | — |
| `tether:latched` | `systems/tetherGameplay.js:450` | `careers/origins/prospectorOrigin.js:643`, `systems/flightV3.js:141`, `systems/missions.js:630`, `systems/onboarding.js:194`, `systems/onboarding.js:304`, `systems/onboarding.js:314`, `systems/surrenderRecovery.js:63`, `systems/survivorPod.js:371`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1218` | — |
| `tether:nearBreak` | `combat/attachments.js:768` | `systems/onboarding.js:200`, `systems/presentationOrchestrator.js:87` |
| `tether:rebound` | `combat/attachments.js:711` | — |
| `tether:reel` | `combat/attachments.js:374` | `systems/missions.js:613`, `systems/onboarding.js:197`, `systems/surrenderRecovery.js:64` |
| `tether:reelPump` | `systems/masslineTelemetry.js:247` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:243`, `systems/tetherGameplay.js:268`, `systems/tetherGameplay.js:961`, `systems/tetherGameplay.js:964`, `systems/tetherGameplay.js:1333` | `render/feel.js:850`, `render/vfx.js:1484`, `systems/presentationOrchestrator.js:147` |
| `tether:released` | `systems/tetherGameplay.js:242`, `systems/tetherGameplay.js:960`, `systems/tetherGameplay.js:1332` | `render/renderer.js:2973`, `render/vfx.js:1483`, `systems/onboarding.js:198`, `systems/surrenderRecovery.js:65` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:325` | — |
| `tether:strain` | `systems/tetherGameplay.js:1272` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:302` | `render/feel.js:875`, `systems/collisionConsequences.js:56`, `systems/combat.js:491`, `systems/masslineImpactDamage.js:41`, `systems/presentationOrchestrator.js:123`, `systems/tumbleStates.js:80` |
| `title:holdResolved` | — | `systems/titles.js:370` |
| `touch:uiAction` | `systems/touch.js:231` | `ui/input.js:548` |
| `traffic:ceresManifestTransferred` | `systems/traffic.js:5149` | `systems/encounterDirector.js:213` |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:2777` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:7358` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:6213` | — |
| `tutorial:finished` | `systems/onboarding.js:717` | `systems/missions.js:543`, `systems/presentationAdapters.js:170`, `systems/story.js:123` |
| `tutorial:say` | `systems/onboarding.js:458` | `systems/story.js:129` |
| `ui:abandonMission` | `ui/screens/missionLog.js:1801` | `systems/missions.js:552` |
| `ui:acceptMission` | `ui/screens/bar.js:1263`, `ui/screens/stationHub.js:1985`, `ui/station/screens/bar.js:350`, `ui/station/screens/contracts.js:474` | `systems/missions.js:551` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | `ui/screens/market.js:643` | `careers/origins/haulerOriginSystem.js:88`, `systems/economy.js:596` |
| `ui:buyBack` | `ui/station/screens/market.js:662` | `systems/economy.js:599` |
| `ui:buyModule` | `ui/screens/outfitting.js:985`, `ui/station/screens/shipworks.js:1256` | `systems/onboarding.js:276`, `systems/ships.js:843` |
| `ui:buyShip` | `ui/screens/shipyard.js:839`, `ui/screens/shipyard.js:861`, `ui/station/screens/shipworks.js:1149` | `systems/ships.js:841` |
| `ui:cancel` | `ui/input.js:783`, `ui/input.js:797` | — |
| `ui:click` | — | `audio/audioSystem.js:817` |
| `ui:closeAll` | `main.js:549` | `ui/uiRoot.js:753` |
| `ui:closeCargo` | `ui/input.js:131`, `ui/input.js:201` | `ui/hud.js:3147` |
| `ui:closeComms` | `ui/input.js:196` | — |
| `ui:confirm` | `ui/input.js:791` | `audio/audioSystem.js:819` |
| `ui:cycleComponent` | `ui/targetPanel.js:398`, `ui/targetPanel.js:402` | `ui/uiRoot.js:758` |
| `ui:cycleTarget` | `ui/input.js:235`, `ui/input.js:844` | `ui/uiRoot.js:754` |
| `ui:deny` | — | `audio/audioSystem.js:820` |
| `ui:endgameChoose` | `systems/missions.js:1839`, `ui/screens/bar.js:712` | `systems/story.js:142` |
| `ui:endgameConfirm` | — | `systems/story.js:143` |
| `ui:endgameDecline` | `ui/comms.js:399` | `systems/story.js:144` |
| `ui:endgameDepartAshfall` | `ui/comms.js:416` | `systems/story.js:148` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1659` | `systems/story.js:145` |
| `ui:endgameStayAshfall` | `ui/comms.js:417` | `systems/story.js:149` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:1663` | `systems/story.js:146` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:147` |
| `ui:entityRoute` | `ui/entityLinks.js:196` | — |
| `ui:factionPresenceService` | `ui/screens/services.js:434` | `systems/factionPresence.js:405`, `ui/screens/stationHub.js:2736` |
| `ui:fitModule` | `ui/screens/outfitting.js:912` | `systems/onboarding.js:273`, `systems/ships.js:844` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1007` | `systems/automation.js:473`, `systems/wingmen.js:59` |
| `ui:heliosBay7Scan` | — | `systems/story.js:172` |
| `ui:hover` | — | `audio/audioSystem.js:818` |
| `ui:kurtzInteract` | — | `systems/story.js:171` |
| `ui:navigate` | `ui/input.js:771`, `ui/input.js:775`, `ui/input.js:822` | — |
| `ui:popScreen` | `ui/galaxyMap.js:3814`, `ui/screens/automationPanel.js:475`, `ui/screens/starmap.js:425` | `ui/uiRoot.js:751` |
| `ui:purchaseFrontierRumor` | `ui/screens/bar.js:1208`, `ui/station/screens/bar.js:334` | `systems/world.js:353` |
| `ui:purchaseSurveyData` | `ui/screens/bar.js:1245`, `ui/station/screens/bar.js:404` | `systems/world.js:352` |
| `ui:pushScreen` | `systems/story.js:1053`, `ui/mapAuthority.js:133`, `ui/screens/bar.js:447`, `ui/screens/gameOver.js:245`, `ui/screens/starmap.js:433`, `ui/screens/stationHub.js:379`, `ui/signalInvestigationPrompt.js:229`, `ui/station/screens/bar.js:367`, `ui/station/stationApp.js:466` | `ui/uiRoot.js:728` |
| `ui:replaceScreen` | — | `ui/uiRoot.js:752` |
| `ui:sell` | `ui/screens/market.js:452`, `ui/screens/stationHub.js:1562` | `careers/origins/haulerOriginSystem.js:89`, `systems/economy.js:597` |
| `ui:sellAllJunk` | `ui/station/screens/market.js:674` | `systems/economy.js:600` |
| `ui:sellShip` | `ui/screens/shipyard.js:812` | — |
| `ui:service` | `balance/careerCohorts.js:699`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/screens/services.js:495`, `ui/screens/stationHub.js:1713`, `ui/station/stationApp.js:750` | `systems/economy.js:649` |
| `ui:setActiveShip` | `ui/screens/shipyard.js:817`, `ui/station/screens/shipworks.js:1152` | `systems/ships.js:842` |
| `ui:setCourse` | `systems/factionPresence.js:971`, `systems/missions.js:2308`, `systems/scanner.js:1131`, `ui/galaxyMap.js:2034`, `ui/galaxyMap.js:2046`, `ui/galaxyMap.js:7653`, `ui/screens/localmap.js:588`, `ui/screens/market.js:1895`, `ui/screens/starmap.js:1234`, `ui/screens/starmap.js:1247`, `ui/screens/starmap.js:1251` | `systems/world.js:321` |
| `ui:setShipAppearance` | — | `systems/ships.js:847` |
| `ui:talkContact` | — | `systems/story.js:173` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:40`, `combat/autoTargetMode.js:191` | `ui/uiRoot.js:759` |
| `ui:toggleCargo` | `ui/input.js:286` | `ui/hud.js:3146` |
| `ui:toggleComms` | `ui/input.js:303` | — |
| `ui:toggleOverview` | `ui/input.js:290` | `ui/hud.js:3531` |
| `ui:trackMission` | `ui/galaxyMap.js:5237`, `ui/screens/missionLog.js:1655`, `ui/screens/missionLog.js:1719`, `ui/screens/missionLog.js:1780`, `ui/station/screens/contracts.js:478` | `systems/missions.js:553` |
| `ui:undock` | — | `ui/input.js:547` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:1260` | `systems/ships.js:845` |
| `ui:unlockTech` | `ui/screens/techTree.js:598` | `systems/ships.js:846` |
| `ui:wingOrder` | `ui/wingmanRadial.js:124` | `systems/automation.js:474` |
| `ui:wingmanRadial` | `ui/input.js:296` | `ui/wingmanRadial.js:178` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:305` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:257` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:192` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1165` | `systems/missions.js:653` |
| `uniqueWreck:choose` | `systems/missions.js:3083`, `ui/recoveryEncounterPrompt.js:532` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:604` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:622`, `systems/uniqueWrecks.js:779`, `systems/uniqueWrecks.js:982` | `systems/missions.js:654` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1225` | `systems/missions.js:656` |
| `uniqueWreck:decisionRequest` | `ui/recoveryEncounterPrompt.js:627`, `ui/recoveryEncounterPrompt.js:629` | — |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:841` | `systems/missions.js:655` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:871` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:781` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1401` | `systems/missions.js:657` |
| `uniqueWreck:rumorHeard` | `ui/screens/bar.js:1321`, `ui/station/screens/bar.js:383` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:478` | `systems/missions.js:652` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1402` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1144` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1332` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:344` | `ui/bandHud.js:79` |
| `vestaOreCache:cargoChanged` | `systems/world.js:3481` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:537` | `systems/world.js:330` |
| `vestaOreCache:clueRecovered` | `systems/world.js:3301` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:3332` | — |
| `vestaOreCache:pickupReady` | `systems/world.js:3444` | — |
| `vestaOreCache:resolved` | `systems/world.js:3400` | — |
| `voice:clear` | `ui/voiceArbiter.js:359`, `ui/voiceArbiter.js:403` | `ui/alerts.js:259` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:317` |
| `voice:say` | `ui/alerts.js:161` | `ui/voiceArbiter.js:316` |
| `voice:surface` | `ui/voiceArbiter.js:364`, `ui/voiceArbiter.js:413` | `ui/alerts.js:258` |
| `weapons:mineArmed` | `systems/weapons.js:875` | — |
| `weapons:mineDeployed` | `systems/weapons.js:840` | — |
| `weapons:mineDetonated` | `systems/weapons.js:923` | — |
| `weapons:mineExpired` | `systems/weapons.js:869` | — |
| `weapons:vent` | `systems/weapons.js:324`, `systems/weapons.js:344` | `audio/audioSystem.js:733`, `systems/ships.js:863`, `ui/hud.js:3227` |
| `wingMorale:broken` | `systems/wingMorale.js:252` | — |
| `wingMorale:cargoDumped` | `systems/wingMorale.js:335` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:374` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:401` | — |
| `wingOrder:accepted` | `systems/automation.js:1653` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1654` | — |
| `wingOrder:converted` | `systems/wingmen.js:307` | — |
| `wingOrder:status` | `systems/automation.js:1655` | — |
| `world:abortJumpCharge` | `systems/story.js:708`, `ui/comms.js:408` | `systems/world.js:318` |
| `world:confirmUnfiledJump` | `systems/story.js:147` | `systems/world.js:317` |
| `world:criticalSpawnDeferred` | `systems/world.js:1067`, `systems/world.js:2162` | — |
| `world:membership` | `systems/world.js:621` | `systems/presentationOrchestrator.js:163` |
| `world:originShift` | `systems/world.js:2542` | — |
| `world:playerRelocated` | `systems/world.js:2308` | `render/vfx.js:1517` |
| `world:requestJump` | `systems/story.js:692`, `ui/galaxyMap.js:2032`, `ui/screens/starmap.js:1246` | `systems/world.js:315` |
| `world:requestRoute` | `ui/galaxyMap.js:2044`, `ui/galaxyMap.js:5254`, `ui/galaxyMap.js:7651`, `ui/screens/starmap.js:1233`, `ui/screens/starmap.js:1250` | `systems/world.js:319` |
| `world:requestSectorScan` | — | `systems/world.js:320` |
| `world:requestUnfiledJump` | `systems/story.js:660` | `systems/world.js:316` |
| `world:residency` | `systems/world.js:746`, `systems/world.js:1230` | `render/renderer.js:2918` |
| `world:spawnLimited` | `systems/world.js:2098` | — |
| `world:zoneEntered` | `systems/world.js:2569`, `testing/metrics/arcadeCorePacingRoute.js:160` | `data/hazardLanguage.js:107`, `systems/encounterDirector.js:211` |
| `world:zoneExited` | `systems/world.js:2572` | `data/hazardLanguage.js:108`, `systems/encounterDirector.js:212` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:529` | `systems/presentationOrchestrator.js:222` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:483` | `systems/presentationOrchestrator.js:223`, `systems/traffic.js:1030` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 1 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `camera:kill` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:baseDestroyed` — 1 subscriber(s)
- `combat:lockChanged` — 2 subscriber(s)
- `combat:repairSubsystem` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 6 subscriber(s)
- `combat:subsystemEnabled` — 2 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `economy:trade` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `entity:spawnRequest` — 1 subscriber(s)
- `flybyFocus:cancel` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
- `game:newGame` — 12 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
- `law:custodyTransfer` — 1 subscriber(s)
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
- `npcjobs:hold` — 1 subscriber(s)
- `npcjobs:load` — 1 subscriber(s)
- `npcjobs:unload` — 1 subscriber(s)
- `npcjobs:work` — 1 subscriber(s)
- `physics:attachmentBroken` — 1 subscriber(s)
- `pirateParley:resolved` — 1 subscriber(s)
- `postEndingReplay:cycleCompleted` — 1 subscriber(s)
- `presentation:cue` — 4 subscriber(s)
- `recovery:started` — 1 subscriber(s)
- `regionalEcology:applied` — 1 subscriber(s)
- `regionalEcology:changed` — 1 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `signal:investigate` — 1 subscriber(s)
- `signal:track` — 1 subscriber(s)
- `sim:jumpGate` — 1 subscriber(s)
- `surrender:secured` — 1 subscriber(s)
- `surrender:tethered` — 1 subscriber(s)
- `survivorPod:choose` — 1 subscriber(s)
- `title:holdResolved` — 1 subscriber(s)
- `ui:click` — 1 subscriber(s)
- `ui:deny` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:endgameUnfiledJumpConfirm` — 1 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:hover` — 1 subscriber(s)
- `ui:kurtzInteract` — 1 subscriber(s)
- `ui:replaceScreen` — 1 subscriber(s)
- `ui:setShipAppearance` — 1 subscriber(s)
- `ui:talkContact` — 1 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `voice:dismiss` — 1 subscriber(s)
- `world:requestSectorScan` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:completed` — 1 emitter(s)
- `aftermathWreck:recorded` — 1 emitter(s)
- `aftermathWreck:spawned` — 1 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `ai:skitterNest` — 1 emitter(s)
- `ai:skitterSpring` — 1 emitter(s)
- `ai:stateChange` — 1 emitter(s)
- `ambientComms:register` — 1 emitter(s)
- `ambientComms:toneChanged` — 1 emitter(s)
- `anomaly:bearing` — 1 emitter(s)
- `anomaly:registered` — 1 emitter(s)
- `anomaly:unregistered` — 1 emitter(s)
- `automation:assetDistressed` — 1 emitter(s)
- `automation:assetRepossessed` — 1 emitter(s)
- `automation:incomeCredited` — 2 emitter(s)
- `automation:offlineSummary` — 5 emitter(s)
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
- `cargo:delivered` — 1 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `charge:combo` — 2 emitter(s)
- `charge:stuck` — 1 emitter(s)
- `charge:thrown` — 1 emitter(s)
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
- `combat:emberCookOff` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `combat:statusApplied` — 1 emitter(s)
- `combat:statusExpired` — 1 emitter(s)
- `combat:tumbleEnd` — 1 emitter(s)
- `comms:log` — 2 emitter(s)
- `conflict:warDeclared` — 1 emitter(s)
- `contactHail:availability` — 2 emitter(s)
- `contactHail:clear` — 1 emitter(s)
- `contactHail:handoff` — 1 emitter(s)
- `contactHail:offer` — 1 emitter(s)
- `contract:clauseHonored` — 2 emitter(s)
- `countermeasure:deployed` — 1 emitter(s)
- `customs:breakScan` — 1 emitter(s)
- `customs:submit` — 1 emitter(s)
- `danger:miningNoise` — 1 emitter(s)
- `dock:denied` — 1 emitter(s)
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
- `environmentalMachinery:phaseChanged` — 1 emitter(s)
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
- `fields:cleared` — 1 emitter(s)
- `fields:coneToggled` — 2 emitter(s)
- `fields:deployDenied` — 1 emitter(s)
- `fields:deployed` — 1 emitter(s)
- `fields:ended` — 3 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `flybyFocus:end` — 1 emitter(s)
- `formation:discovered` — 1 emitter(s)
- `freight:arrival` — 1 emitter(s)
- `freight:cargoSpilled` — 2 emitter(s)
- `freight:custodyChanged` — 1 emitter(s)
- `freight:custodyRebound` — 1 emitter(s)
- `freight:custodyReceipt` — 1 emitter(s)
- `freight:loss` — 3 emitter(s)
- `freight:raiderEscaped` — 1 emitter(s)
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:contacted` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `gamepad:connected` — 1 emitter(s)
- `gamepad:disconnected` — 1 emitter(s)
- `hazard:changed` — 1 emitter(s)
- `heist:launchCue` — 1 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverCommitted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
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
- `mines:armed` — 1 emitter(s)
- `mines:capReached` — 1 emitter(s)
- `mines:placed` — 1 emitter(s)
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamCooled` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:heatChanged` — 1 emitter(s)
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
- `namedAce:appeared` — 1 emitter(s)
- `news:dockCards` — 1 emitter(s)
- `news:headline` — 5 emitter(s)
- `news:publish` — 4 emitter(s)
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
- `planet:registered` — 1 emitter(s)
- `planet:unregistered` — 1 emitter(s)
- `presentation:audioCue` — 1 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 2 emitter(s)
- `recovery:choose` — 1 emitter(s)
- `recovery:vent` — 1 emitter(s)
- `research:pointsChanged` — 1 emitter(s)
- `resonance:patrolQueued` — 1 emitter(s)
- `rumor:ghostConvoy` — 1 emitter(s)
- `salvage:actionRead` — 1 emitter(s)
- `salvage:cutComplete` — 1 emitter(s)
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
- `ship:appearanceSaved` — 1 emitter(s)
- `ship:massChanged` — 1 emitter(s)
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
- `station:broadcastTic` — 1 emitter(s)
- `station:navigate` — 4 emitter(s)
- `stationContact:changed` — 4 emitter(s)
- `stationContact:counterChanged` — 2 emitter(s)
- `stationLife:trafficChanged` — 1 emitter(s)
- `story:kurtzLedger` — 2 emitter(s)
- `story:playerChoiceRecorded` — 1 emitter(s)
- `story:postEndingContinuity` — 1 emitter(s)
- `story:vergeEvidenceRecorded` — 1 emitter(s)
- `story:vergeObserversRevealed` — 1 emitter(s)
- `story:vergeValeGatesRevoked` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:rescueBlocked` — 1 emitter(s)
- `survivorPod:rescueSelected` — 1 emitter(s)
- `survivorPod:stripped` — 1 emitter(s)
- `tether:latchDenied` — 8 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:rebound` — 1 emitter(s)
- `tether:reelPump` — 1 emitter(s)
- `tether:snapCatch` — 1 emitter(s)
- `tether:strain` — 1 emitter(s)
- `traffic:passengerLinerReceipt` — 1 emitter(s)
- `traffic:passengerLinerSuspended` — 1 emitter(s)
- `traffic:richSeamHelpReserved` — 1 emitter(s)
- `ui:bulkHaulTag` — 1 emitter(s)
- `ui:bulkHaulTagCleared` — 1 emitter(s)
- `ui:cancel` — 2 emitter(s)
- `ui:closeComms` — 1 emitter(s)
- `ui:entityRoute` — 1 emitter(s)
- `ui:navigate` — 3 emitter(s)
- `ui:sellShip` — 1 emitter(s)
- `ui:toggleComms` — 1 emitter(s)
- `uniqueLoot:choirBellPulse` — 1 emitter(s)
- `uniqueLoot:nestbreakerSplit` — 1 emitter(s)
- `uniqueLoot:paleCoilBlink` — 1 emitter(s)
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
- `world:criticalSpawnDeferred` — 2 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
