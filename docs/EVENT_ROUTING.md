# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-07-14 · 490 events · 1800 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/encounterDirector.js:128` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:215` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:412` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:530` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:232` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:447` | — |
| `ai:doctrinePhase` | `systems/tacticalAI.js:133` | `systems/presentationOrchestrator.js:109` |
| `ai:encounterCommand` | `systems/aiPorts.js:195` | — |
| `ai:flee` | `systems/ai.js:235`, `systems/wingMorale.js:234` | `render/vfx.js:600`, `systems/barkDirector.js:36`, `systems/combatOutcome.js:103`, `systems/presentationOrchestrator.js:110` |
| `ai:formationBroken` | `systems/ai.js:404`, `systems/wingMorale.js:205` | `render/vfx.js:601` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:37` |
| `ai:stateChange` | `systems/ai.js:232` | — |
| `ai:telegraph` | `systems/ai.js:300`, `systems/tacticalAI.js:122` | `audio/audioSystem.js:670`, `render/vfx.js:599`, `systems/presentationOrchestrator.js:108`, `ui/hud.js:1287` |
| `aiTrader:requestTrade` | `systems/traffic.js:851` | `systems/economy.js:304` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:84` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:166` | — |
| `asset:deployed` | `systems/automation.js:739`, `systems/automation.js:1174`, `systems/automation.js:1211`, `systems/automation.js:1279`, `systems/claims.js:294` | `systems/missions.js:406`, `systems/onboarding.js:275` |
| `asteroid:chunked` | `systems/mining.js:516` | `systems/presentationOrchestrator.js:138` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:627`, `systems/mining.js:272` | `audio/audioSystem.js:654`, `systems/fieldDepletion.js:182`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/vfx.js:621`, `systems/ai.js:675`, `systems/beacons.js:52`, `systems/beacons.js:57`, `systems/beacons.js:80`, `systems/bulletTime.js:95`, `systems/bulletTime.js:111`, `systems/claims.js:189`, `systems/claims.js:226`, `systems/claims.js:271`, `systems/claims.js:727`, `systems/cloak.js:107`, `systems/cloak.js:118`, `systems/countermeasures.js:189`, `systems/crafting.js:221`, `systems/crafting.js:231`, `systems/flybyFocus.js:367`, `systems/impulseCharges.js:264`, `systems/impulseCharges.js:426`, `systems/jettisonImpulse.js:63`, `systems/masslineThrow.js:138`, `systems/masslineThrow.js:321`, `systems/masslineThrow.js:403`, `systems/mining.js:593`, `systems/presentationAdapters.js:406`, `systems/salvage.js:217`, `systems/tumbleStates.js:151`, `ui/hud.js:2074`, `ui/hud.js:2277`, `ui/hud.js:2328`, `ui/hud.js:2367`, `ui/hud.js:2384`, `ui/hud.js:2475`, `ui/hud.js:2562`, `ui/hud.js:2766`, `ui/input.js:75`, `ui/input.js:98`, `ui/input.js:144`, `ui/input.js:156`, `ui/input.js:162`, `ui/input.js:198`, `ui/input.js:238`, `ui/input.js:393`, `ui/input.js:572`, `ui/input.js:577`, `ui/input.js:661`, `ui/input.js:669`, `ui/input.js:675`, `ui/input.js:700`, `ui/input.js:711`, `ui/input.js:715`, `ui/input.js:728`, `ui/screens/bar.js:985`, `ui/screens/bar.js:1014`, `ui/screens/bar.js:1032`, `ui/screens/bar.js:1083`, `ui/screens/market.js:441`, `ui/screens/market.js:443`, `ui/screens/market.js:514`, `ui/screens/market.js:627`, `ui/screens/market.js:637`, `ui/screens/market.js:688`, `ui/screens/market.js:697`, `ui/screens/market.js:726`, `ui/screens/market.js:782`, `ui/screens/market.js:788`, `ui/screens/market.js:798`, `ui/screens/market.js:891`, `ui/screens/market.js:1111`, `ui/screens/market.js:1612`, `ui/screens/market.js:1875`, `ui/screens/missionLog.js:1534`, `ui/screens/missionLog.js:1538`, `ui/screens/missionLog.js:1542`, `ui/screens/missionLog.js:1558`, `ui/screens/missionLog.js:1565`, `ui/screens/missionLog.js:1572`, `ui/screens/missionLog.js:1580`, `ui/screens/missionLog.js:1587`, `ui/screens/missionLog.js:1594`, `ui/screens/missionLog.js:1603`, `ui/screens/missionLog.js:1610`, `ui/screens/missionLog.js:1626`, `ui/screens/missionLog.js:1657`, `ui/screens/missionLog.js:1677`, `ui/screens/outfitting.js:735`, `ui/screens/outfitting.js:739`, `ui/screens/outfitting.js:797`, `ui/screens/outfitting.js:804`, `ui/screens/services.js:380`, `ui/screens/services.js:402`, `ui/screens/services.js:415`, `ui/screens/services.js:431`, `ui/screens/services.js:437`, `ui/screens/shipLedger.js:134`, `ui/screens/shipyard.js:813`, `ui/screens/shipyard.js:818`, `ui/screens/shipyard.js:840`, `ui/screens/shipyard.js:844`, `ui/screens/shipyard.js:862`, `ui/screens/stationHub.js:1196`, `ui/screens/stationHub.js:1205`, `ui/screens/stationHub.js:1261`, `ui/screens/stationHub.js:1294`, `ui/screens/stationHub.js:1300`, `ui/screens/stationHub.js:1347`, `ui/screens/stationHub.js:1359`, `ui/screens/stationHub.js:1363`, `ui/screens/stationHub.js:1375`, `ui/screens/stationHub.js:1391`, `ui/screens/stationHub.js:1541`, `ui/screens/stationHub.js:1654`, `ui/screens/stationHub.js:1663`, `ui/screens/stationHub.js:1679`, `ui/screens/stationHub.js:1689`, `ui/screens/stationHub.js:1692`, `ui/screens/stationHub.js:1947`, `ui/screens/stationHub.js:1967`, `ui/screens/stationHub.js:2436`, `ui/station/screens/contracts.js:171`, `ui/station/screens/contracts.js:176`, `ui/station/screens/contracts.js:180`, `ui/station/screens/factions.js:255`, `ui/station/screens/industry.js:133`, `ui/station/screens/industry.js:141`, `ui/station/screens/market.js:227`, `ui/station/screens/market.js:232`, `ui/station/screens/market.js:250`, `ui/station/screens/shipworks.js:283`, `ui/station/screens/shipworks.js:290`, `ui/station/screens/shipworks.js:295`, `ui/station/screens/shipworks.js:297`, `ui/station/screens/shipworks.js:305`, `ui/station/screens/shipworks.js:309`, `ui/station/stationApp.js:190`, `ui/station/stationApp.js:232`, `ui/uiRoot.js:689`, `ui/uiRoot.js:756`, `ui/wingmanRadial.js:77`, `ui/wingmanRadial.js:98`, `ui/wingmanRadial.js:120`, `ui/wingmanRadial.js:146`, `ui/wingmanRadial.js:163` | `audio/audioSystem.js:731` |
| `automation:assetDistressed` | `systems/automation.js:963` | — |
| `automation:assetLost` | `systems/automation.js:1374` | `systems/intervention.js:37`, `systems/lossLedger.js:329`, `systems/missions.js:408` |
| `automation:assetRepossessed` | `systems/automation.js:987` | — |
| `automation:incomeCredited` | `systems/automation.js:1015`, `systems/automation.js:1555` | — |
| `automation:offlineSummary` | `systems/automation.js:1405`, `systems/automation.js:1429`, `systems/automation.js:1453`, `systems/automation.js:1476`, `systems/automation.js:1602` | — |
| `automation:outpostRaided` | `systems/automation.js:896`, `systems/automation.js:1677` | `systems/lossLedger.js:330` |
| `automation:programAssigned` | `systems/automation.js:1148` | `systems/missions.js:407` |
| `band:bearingReceipt` | `systems/bandRadio.js:439` | — |
| `band:bearingRequest` | `systems/bandRadio.js:412` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:502`, `systems/uniqueWrecks.js:545` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:509`, `systems/uniqueWrecks.js:517`, `systems/uniqueWrecks.js:531` | — |
| `band:bed` | `systems/bandRadio.js:496` | `audio/audioSystem.js:736` |
| `band:cycle` | `ui/bandHud.js:51`, `ui/input.js:178` | — |
| `band:status` | `systems/bandRadio.js:478` | `ui/bandHud.js:55` |
| `beacon:deploy` | — | `systems/beacons.js:35` |
| `beacon:deployed` | `systems/beacons.js:75` | — |
| `boss:defeated` | `systems/world.js:326` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:290` | — |
| `bulletTime:end` | `systems/bulletTime.js:110` | `audio/audioSystem.js:735` |
| `bulletTime:start` | `systems/bulletTime.js:94` | `audio/audioSystem.js:732`, `systems/onboarding.js:324` |
| `camera:kill` | `render/feel.js:392`, `render/feel.js:543` | `render/renderer.js:933` |
| `camera:shake` | `render/vfx.js:1365`, `render/vfx.js:1838`, `systems/combat.js:326`, `systems/combat.js:399`, `systems/combat.js:420`, `systems/combat.js:456`, `systems/combat.js:494`, `systems/combat.js:565`, `systems/drill.js:610`, `systems/flybyFocus.js:366`, `systems/intervention.js:106`, `systems/presentationAdapters.js:353`, `systems/tetherGameplay.js:183` | `render/renderer.js:932` |
| `camera:zoom` | `ui/input.js:288`, `ui/input.js:289`, `ui/input.js:439` | `render/renderer.js:939` |
| `cargo:changed` | `systems/cargo.js:45`, `systems/mining.js:691` | `systems/cargo.js:103`, `systems/ships.js:496`, `ui/cargoConscience.js:122`, `ui/commandBar.js:407`, `ui/hud.js:2396`, `ui/hud.js:2425`, `ui/hudMeta.js:152`, `ui/screens/manufacture.js:214`, `ui/screens/stationHub.js:2733`, `ui/screens/stationHub.js:2750`, `ui/screens/stationHub.js:2751`, `ui/screens/stationHub.js:2752` |
| `cargo:delivered` | `systems/missions.js:2471` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:66`, `systems/mining.js:392`, `systems/mining.js:659` | `careers/origins/prospectorOrigin.js:640`, `systems/onboarding.js:230`, `systems/presentationOrchestrator.js:146`, `ui/alerts.js:290`, `ui/floatingText.js:151` |
| `cargo:jettison` | `ui/hud.js:2082` | `ui/hud.js:2333` |
| `cargo:jettisoned` | `systems/cargo.js:206` | `systems/jettisonImpulse.js:28`, `systems/onboarding.js:319` |
| `cargo:massSettled` | `systems/cargo.js:143` | `systems/presentationOrchestrator.js:145`, `systems/ships.js:497` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:57` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:260` | `systems/onboarding.js:334` |
| `charge:combo` | `systems/impulseCharges.js:302`, `systems/impulseCharges.js:405` | — |
| `charge:detonated` | `systems/impulseCharges.js:413` | `audio/audioSystem.js:680`, `render/feel.js:487`, `render/vfx.js:598` |
| `charge:stuck` | `systems/impulseCharges.js:187` | — |
| `charge:thrown` | `systems/impulseCharges.js:256` | — |
| `claim:claimed` | `systems/claims.js:188` | `systems/onboarding.js:282`, `systems/story.js:130` |
| `claim:defenseEncounterRequested` | `systems/claims.js:786` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:142` |
| `claim:defenseResolved` | `systems/claims.js:862` | — |
| `claim:defenseStarted` | `systems/claims.js:791` | — |
| `claim:defenseWarning` | `systems/claims.js:710` | — |
| `claim:moduleBuilt` | `systems/claims.js:225` | — |
| `claim:raidRepelled` | `systems/claims.js:662` | — |
| `claim:raidWarning` | `systems/claims.js:655` | — |
| `claim:receipt` | `systems/claims.js:1014` | — |
| `claim:specialized` | `systems/claims.js:266` | — |
| `claim:teleportRequest` | `systems/claims.js:456` | — |
| `claims:migrated` | `systems/claims.js:1118` | — |
| `cloak:dropped` | `systems/cloak.js:117` | — |
| `cloak:engaged` | `systems/cloak.js:106` | `systems/onboarding.js:329` |
| `combat:actionCancelled` | `combat/actions.js:285` | — |
| `combat:actionCompleted` | `combat/actions.js:271` | — |
| `combat:actionPhase` | `combat/actions.js:157` | — |
| `combat:actionRejected` | `combat/actions.js:307` | — |
| `combat:actionStarted` | `combat/actions.js:127` | `systems/presentationOrchestrator.js:112`, `systems/scenarioRuntime.js:22` |
| `combat:baseDestroyed` | — | `systems/economy.js:335` |
| `combat:beamStop` | `systems/weapons.js:163` | `audio/audioSystem.js:632` |
| `combat:damage` | `combat/damage.js:165` | `audio/audioSystem.js:634`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/feel.js:335`, `render/vfx.js:574`, `systems/ai.js:89`, `systems/cruise.js:21`, `systems/encounterDirector.js:120`, `systems/factionPresence.js:162`, `systems/heat.js:118`, `systems/lawSecurity.js:52`, `systems/onboarding.js:200`, `systems/onboarding.js:207`, `systems/presentationOrchestrator.js:107`, `systems/scenarioRuntime.js:28`, `systems/stationBroadcast.js:144`, `ui/alerts.js:276`, `ui/commandBar.js:396`, `ui/floatingText.js:75`, `ui/floatingText.js:83`, `ui/hud.js:726`, `ui/hud.js:921` |
| `combat:fire` | `systems/weapons.js:442`, `systems/weapons.js:553` | `audio/audioSystem.js:631`, `render/feel.js:405`, `render/vfx.js:572`, `systems/cloak.js:37`, `systems/cruise.js:28`, `systems/onboarding.js:192`, `systems/presentationOrchestrator.js:111`, `ui/hud.js:2437` |
| `combat:hit` | `systems/salvageActions.js:182` | — |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:304` |
| `combat:lockChanged` | — | `systems/world.js:209`, `ui/alerts.js:283` |
| `combat:outcome` | `systems/combatOutcome.js:160` | `systems/barkDirector.js:38` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:161` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:69` |
| `combat:requestAction` | — | `combat/kernel.js:67` |
| `combat:routeDamage` | `systems/drill.js:622`, `systems/impulseCharges.js:454` | `combat/kernel.js:68` |
| `combat:statusApplied` | `combat/statuses.js:142` | — |
| `combat:statusExpired` | `combat/statuses.js:53` | — |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:104`, `systems/factionPresence.js:160`, `systems/presentationOrchestrator.js:161`, `systems/wingMorale.js:141` |
| `combat:subsystemEnabled` | — | `systems/factionPresence.js:161` |
| `combat:surrendered` | — | `systems/combatOutcome.js:105`, `systems/surrenderRecovery.js:30` |
| `combat:weakPointHit` | `systems/combat.js:380` | `ui/floatingText.js:87` |
| `comms:log` | `systems/encounterScripts.js:426`, `systems/salvage.js:215` | — |
| `comms:popup` | `systems/ai.js:459`, `systems/factionPresence.js:522`, `systems/factionPresence.js:543`, `systems/missions.js:2543`, `systems/missions.js:2576`, `systems/missions.js:3148`, `systems/missions.js:3517`, `systems/scenarioRuntime.js:185`, `systems/story.js:328` | `audio/audioSystem.js:717`, `ui/comms.js:221`, `ui/screens/codex.js:301` |
| `conflict:flip` | `systems/factions.js:384` | `systems/sectorSim.js:106`, `systems/story.js:129` |
| `conflict:warDeclared` | `systems/factions.js:341` | — |
| `contactHail:availability` | `systems/scanner.js:722`, `systems/scanner.js:733` | — |
| `contactHail:choice` | `ui/contactHailPrompt.js:82` | `systems/scanner.js:441` |
| `contactHail:clear` | `systems/scanner.js:744` | — |
| `contactHail:handoff` | `systems/scanner.js:631` | — |
| `contactHail:offer` | `systems/scanner.js:653` | — |
| `contactHail:request` | `ui/contactHailPrompt.js:76` | `systems/scanner.js:440` |
| `contactHail:response` | `systems/scanner.js:682` | — |
| `contraband:bribe` | `systems/encounterScripts.js:271`, `ui/customsPrompt.js:174` | `systems/economy.js:331` |
| `contraband:scanned` | `systems/economy.js:1035` | `systems/encounterDirector.js:121`, `systems/factions.js:196`, `systems/heat.js:121`, `ui/customsPrompt.js:126` |
| `contract:clauseBroken` | `systems/contractClauses.js:169` | `systems/missions.js:390` |
| `contract:clauseHonored` | `systems/contractClauses.js:156`, `systems/missions.js:2608` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:185` | — |
| `craft:complete` | `systems/crafting.js:220`, `systems/crafting.js:257` | `ui/screens/manufacture.js:216`, `ui/station/screens/industry.js:144` |
| `craft:queueChanged` | `systems/crafting.js:122`, `systems/crafting.js:230`, `systems/crafting.js:259` | `systems/onboarding.js:288`, `ui/screens/manufacture.js:217`, `ui/station/screens/industry.js:144` |
| `credits:changed` | `systems/economy.js:847`, `systems/economy.js:858` | `audio/audioSystem.js:656`, `balance/hunterPublicRoute.js:466`, `ui/commandBar.js:408`, `ui/hud.js:2424`, `ui/screens/manufacture.js:215`, `ui/screens/stationHub.js:2731`, `ui/screens/stationHub.js:2753`, `ui/screens/stationHub.js:2754` |
| `cruise:charging` | `systems/cruise.js:88` | `render/vfx.js:595`, `systems/presentationOrchestrator.js:116` |
| `cruise:dropped` | `systems/cruise.js:99` | `render/vfx.js:597`, `systems/presentationOrchestrator.js:118` |
| `cruise:engaged` | `systems/cruise.js:64` | `render/vfx.js:596`, `systems/presentationOrchestrator.js:117` |
| `cruise:snareRequest` | `systems/encounterScripts.js:335` | `systems/cruise.js:33` |
| `cruise:snared` | `systems/cruise.js:98` | `audio/audioSystem.js:711` |
| `customs:breakScan` | `ui/customsPrompt.js:178` | — |
| `customs:submit` | `ui/customsPrompt.js:170` | — |
| `danger:miningNoise` | `systems/mining.js:703` | — |
| `day:tick` | `core/coreSystem.js:96` | `systems/custodyConsequences.js:30`, `systems/encounterDirector.js:112`, `systems/factions.js:212`, `systems/sectorSim.js:92` |
| `distress:rescued` | `systems/encounterScripts.js:425` | `systems/factions.js:205` |
| `dock:attempt` | — | `ui/dockDenyBanner.js:100` |
| `dock:denied` | `ui/dockDenyBanner.js:125` | — |
| `dock:docked` | `balance/careerCohorts.js:487`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:74` | `audio/audioSystem.js:667`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:631`, `save/saveSystem.js:107`, `systems/aftermathWrecks.js:320`, `systems/combat.js:290`, `systems/economy.js:318`, `systems/economyContracts.js:133`, `systems/factionPresence.js:158`, `systems/mining.js:81`, `systems/missions.js:354`, `systems/onboarding.js:170`, `systems/onboarding.js:247`, `systems/scanner.js:444`, `systems/story.js:107`, `ui/alerts.js:267`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:133`, `ui/dockDenyBanner.js:101`, `ui/priceForecast.js:86`, `ui/securityReadout.js:158`, `ui/uiRoot.js:677`, `ui/wingmanRadial.js:181` |
| `dock:range` | `core/physics.js:601`, `core/physics.js:605` | `systems/onboarding.js:214`, `ui/alerts.js:263`, `ui/hud.js:705`, `ui/input.js:63` |
| `dock:undocked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:433`, `ui/station/stationApp.js:227` | `audio/audioSystem.js:668`, `save/saveSystem.js:108`, `systems/combat.js:294`, `systems/economy.js:321`, `systems/missions.js:363`, `systems/presentationAdapters.js:142`, `ui/input.js:67`, `ui/uiRoot.js:706` |
| `drill:break` | `systems/drill.js:566` | `systems/presentationOrchestrator.js:152`, `ui/screens/drill.js:1814` |
| `drill:cargoFull` | `systems/drill.js:583` | `ui/screens/drill.js:1784` |
| `drill:end` | `systems/drill.js:299` | `systems/presentationOrchestrator.js:155` |
| `drill:gasHit` | `systems/drill.js:609` | `systems/presentationOrchestrator.js:154`, `ui/screens/drill.js:1757` |
| `drill:retry` | `systems/drill.js:313` | `systems/presentationOrchestrator.js:156` |
| `drill:scanPulse` | `systems/drill.js:386` | `systems/presentationOrchestrator.js:150`, `ui/screens/drill.js:1802` |
| `drill:spark` | `systems/drill.js:541` | `systems/presentationOrchestrator.js:151`, `ui/screens/drill.js:1835` |
| `drill:start` | `systems/drill.js:288` | `systems/onboarding.js:253`, `systems/presentationOrchestrator.js:149` |
| `drill:warn` | `systems/drill.js:501`, `systems/drill.js:519`, `systems/drill.js:586` | `systems/presentationOrchestrator.js:148`, `ui/screens/drill.js:1778` |
| `drill:yield` | `systems/drill.js:579` | `systems/presentationOrchestrator.js:153`, `ui/screens/drill.js:1736` |
| `economy:applyTradePressure` | `systems/automation.js:507`, `systems/automation.js:820`, `systems/automation.js:821`, `systems/claims.js:575`, `systems/encounterDirector.js:980`, `systems/sectorSim.js:367`, `systems/traffic.js:932` | `systems/economy.js:312` |
| `economy:chargeCredits` | `systems/automation.js:918`, `systems/automation.js:925`, `systems/automation.js:1565`, `systems/automation.js:1766`, `systems/beacons.js:61`, `systems/claims.js:168`, `systems/claims.js:216`, `systems/claims.js:261`, `systems/claims.js:615`, `systems/combat.js:477`, `systems/encounterDirector.js:974`, `systems/gateControlDirector.js:119`, `systems/missions.js:1042`, `systems/missions.js:1045`, `systems/pirateParley.js:507`, `systems/ships.js:675`, `systems/ships.js:726`, `systems/ships.js:786`, `systems/world.js:1753`, `systems/world.js:2024` | `systems/economy.js:290` |
| `economy:eventEnded` | `systems/economy.js:1117` | `ui/floatingText.js:167`, `ui/screens/stationHub.js:2793` |
| `economy:eventStarted` | `systems/economy.js:1092` | `ui/floatingText.js:156`, `ui/screens/market.js:731`, `ui/screens/stationHub.js:2792` |
| `economy:grantCredits` | `systems/automation.js:1011`, `systems/automation.js:1551`, `systems/claims.js:574`, `systems/claims.js:1104`, `systems/combat.js:423`, `systems/combat.js:428`, `systems/combat.js:550`, `systems/encounterDirector.js:975`, `systems/mining.js:609`, `systems/missions.js:2616`, `systems/missions.js:2619`, `systems/missions.js:3443`, `systems/moralTrap.js:133`, `systems/ships.js:811`, `systems/survivorPod.js:368`, `systems/uniqueWrecks.js:1272` | `systems/economy.js:289` |
| `economy:marketOpened` | `ui/screens/market.js:1793`, `ui/station/screens/market.js:268` | `systems/economy.js:295` |
| `economy:tick` | `systems/economy.js:399` | `ui/priceHistory.js:36`, `ui/screens/stationHub.js:2749` |
| `economy:trade` | — | `careers/origins/haulerOriginSystem.js:87` |
| `economy:tradeCompleted` | `systems/economy.js:721` | `audio/audioSystem.js:657`, `careers/origins/prospectorOrigin.js:649`, `save/saveSystem.js:115`, `systems/factions.js:175`, `systems/missions.js:371`, `systems/onboarding.js:171`, `systems/sectorSim.js:101`, `systems/story.js:125`, `ui/screens/market.js:711`, `ui/screens/stationHub.js:2735`, `ui/screens/stationHub.js:2747`, `ui/screens/stationHub.js:2748` |
| `economy:tradeFailed` | `systems/economy.js:798`, `systems/economy.js:815` | `ui/screens/market.js:722` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:857` | `ui/encounterChoicePrompt.js:128` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:103` | `systems/encounterDirector.js:133` |
| `encounter:fingerprint` | `systems/encounterDirector.js:922` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:3024` | `systems/encounterDirector.js:119` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1023` | — |
| `encounter:receipt` | `systems/encounterDirector.js:935` | — |
| `encounter:resolved` | `systems/encounterDirector.js:917`, `systems/encounterDirector.js:960` | `audio/audioSystem.js:672`, `systems/aftermathWrecks.js:319`, `systems/claims.js:141`, `systems/terrainAnchors.js:44`, `systems/uniqueLootAbilities.js:114`, `ui/encounterChoicePrompt.js:129` |
| `encounter:spawned` | `systems/encounterDirector.js:560` | `systems/uniqueLootAbilities.js:113` |
| `encounter:telegraph` | `systems/encounterDirector.js:545` | `audio/audioSystem.js:671`, `systems/terrainAnchors.js:43` |
| `encounter:voice` | `systems/encounterDirector.js:841` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:359` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:318` | — |
| `endgame:chosen` | `systems/story.js:681` | `ui/screens/missionLog.js:1759` |
| `endgame:confirmRequired` | `systems/story.js:577` | `ui/comms.js:395`, `ui/screens/missionLog.js:1758` |
| `endgame:eligibility` | `systems/story.js:463` | `ui/comms.js:408`, `ui/screens/missionLog.js:1757` |
| `endgame:ineligible` | `systems/story.js:557`, `systems/story.js:622` | `ui/comms.js:403` |
| `endgame:loopBack` | — | `systems/story.js:120` |
| `endgame:promptChoiceC` | `systems/story.js:546` | `ui/comms.js:375` |
| `endgame:promptChoiceD` | `systems/story.js:539` | `ui/comms.js:380` |
| `endgame:promptChoiceE` | `systems/story.js:422` | `ui/comms.js:384` |
| `endgame:promptSandbox` | `systems/story.js:474` | `ui/comms.js:387` |
| `endgame:sandboxContinued` | `systems/story.js:675` | `ui/screens/missionLog.js:1760` |
| `entity:destroyed` | `main.js:215`, `main.js:271`, `save/saveSystem.js:2134`, `systems/wingmen.js:133`, `systems/world.js:963` | `audio/audioSystem.js:648`, `combat/kernel.js:62`, `render/renderer.js:919`, `render/vfx.js:577`, `systems/ai.js:101`, `systems/encounterDirector.js:117`, `systems/gateControlDirector.js:68`, `systems/missions.js:379`, `systems/presentationOrchestrator.js:115`, `systems/stationSideEventDirector.js:55`, `ui/prompts/bulkHaulTag.js:148`, `ui/radar.js:405` |
| `entity:kill` | — | `core/coreSystem.js:66` |
| `entity:killed` | `balance/careerCohorts.js:456`, `combat/damage.js:242`, `combat/kernel.js:42`, `systems/combat.js:415` | `audio/audioSystem.js:647`, `render/feel.js:368`, `render/vfx.js:576`, `systems/aftermathWrecks.js:315`, `systems/ai.js:102`, `systems/combatOutcome.js:102`, `systems/contractClauses.js:91`, `systems/encounterDirector.js:118`, `systems/factions.js:153`, `systems/heat.js:114`, `systems/lootShards.js:32`, `systems/lossLedger.js:332`, `systems/mining.js:76`, `systems/missions.js:377`, `systems/presentationOrchestrator.js:114`, `systems/sectorSim.js:105`, `systems/traffic.js:199`, `systems/wingMorale.js:140`, `systems/world.js:218`, `ui/floatingText.js:84`, `ui/floatingText.js:114` |
| `entity:spawnRequest` | — | `core/coreSystem.js:70` |
| `entity:spawned` | `core/coreSystem.js:29` | `combat/kernel.js:57`, `render/renderer.js:918`, `render/vfx.js:578`, `systems/factionPresence.js:164`, `systems/lawSecurity.js:53`, `systems/lossLedger.js:331`, `systems/salvageActions.js:69`, `systems/uniqueLootAbilities.js:116`, `ui/radar.js:404` |
| `faction:aggro` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:202`, `systems/factions.js:246`, `systems/factions.js:277`, `systems/factions.js:465` | `systems/heat.js:126` |
| `faction:repChanged` | `systems/factions.js:243`, `systems/factions.js:272`, `systems/factions.js:461` | `ui/floatingText.js:141`, `ui/screens/stationHub.js:2774` |
| `faction:repDelta` | `balance/careerCohorts.js:255`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:850`, `systems/economy.js:1034`, `systems/encounterDirector.js:976`, `systems/missions.js:2712`, `systems/missions.js:2751`, `systems/missions.js:3396`, `systems/missions.js:3398`, `systems/missions.js:3448`, `systems/moralTrap.js:128`, `systems/moralTrap.js:135`, `systems/survivorPod.js:374`, `systems/uniqueWrecks.js:1276` | `systems/factions.js:147` |
| `faction:repSpillover` | `systems/factions.js:270` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:96`, `systems/e1EncounterRuntime.js:100`, `systems/e1EncounterRuntime.js:110` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:762` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:526` | `systems/story.js:136` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:674` | `ui/uiRoot.js:154` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:405` | — |
| `factionPresence:service` | `systems/factionPresence.js:475` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:551` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:273` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:236` | `systems/world.js:213` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:235` | `systems/presentationOrchestrator.js:147` |
| `flight:modeChanged` | `systems/flightV3.js:442` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:252` |
| `flybyFocus:end` | `systems/flybyFocus.js:285` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:349` | `systems/onboarding.js:189` |
| `freight:arrival` | `systems/traffic.js:862` | — |
| `freight:loss` | `systems/traffic.js:944` | — |
| `fuel:changed` | `systems/economy.js:880`, `systems/world.js:2263`, `systems/world.js:2271` | `ui/screens/stationHub.js:2732`, `ui/screens/stationHub.js:2767`, `ui/screens/stationHub.js:2768`, `ui/screens/stationHub.js:2769`, `ui/screens/stationHub.js:2770` |
| `fuel:empty` | `systems/world.js:2264` | `audio/audioSystem.js:689`, `ui/alerts.js:291` |
| `game:load` | `ui/input.js:167`, `ui/input.js:285`, `ui/screens/mainMenu.js:280`, `ui/screens/saveLoad.js:334` | `save/saveSystem.js:90`, `systems/scanner.js:443`, `ui/commandBar.js:425`, `ui/encounterChoicePrompt.js:132`, `ui/pirateParleyPrompt.js:250`, `ui/recoveryEncounterPrompt.js:254`, `ui/sectorLawPresenter.js:215`, `ui/signalInvestigationPrompt.js:169` |
| `game:new` | `ui/screens/gameOver.js:215`, `ui/screens/newGame.js:350` | `careers/origins/haulerOriginSystem.js:64`, `main.js:126`, `render/feel.js:329`, `save/saveSystem.js:103`, `systems/presentationOrchestrator.js:168`, `systems/scanner.js:442`, `ui/commandBar.js:424`, `ui/encounterChoicePrompt.js:131`, `ui/pirateParleyPrompt.js:249`, `ui/priceHistory.js:58`, `ui/recoveryEncounterPrompt.js:253`, `ui/sectorLawPresenter.js:214`, `ui/signalInvestigationPrompt.js:168` |
| `game:newGame` | — | `save/saveSystem.js:104`, `systems/aftermathWrecks.js:326`, `systems/fieldDepletion.js:183`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:333`, `systems/survivorPod.js:152`, `systems/wingMorale.js:142` |
| `game:over` | `systems/combat.js:400`, `systems/combat.js:457` | `ui/uiRoot.js:822` |
| `game:save` | `ui/input.js:166`, `ui/input.js:283`, `ui/screens/saveLoad.js:320` | `save/saveSystem.js:89` |
| `game:startFailed` | `main.js:366` | `ui/screens/newGame.js:340` |
| `game:started` | `main.js:262` | `audio/audioSystem.js:768`, `careers/origins/haulerOriginSystem.js:63`, `render/renderer.js:940`, `save/saveSystem.js:100`, `systems/automation.js:308`, `systems/combat.js:300`, `systems/economyContracts.js:135`, `systems/factions.js:144`, `systems/flight.js:78`, `systems/flightV3.js:128`, `systems/missions.js:340`, `systems/onboarding.js:157`, `systems/onboarding.js:343`, `systems/presentationAdapters.js:141`, `systems/presentationOrchestrator.js:169`, `systems/sectorSim.js:96`, `systems/story.js:95`, `systems/tacticalAI.js:98`, `ui/commandBar.js:423`, `ui/radar.js:406`, `ui/sectorLawPresenter.js:206`, `ui/uiRoot.js:813`, `ui/uiRoot.js:838` |
| `gamepad:connected` | `systems/gamepad.js:154` | `ui/uiRoot.js:359` |
| `gamepad:disconnected` | `systems/gamepad.js:147` | `ui/uiRoot.js:360` |
| `gate:range` | `core/physics.js:611`, `core/physics.js:615` | `systems/onboarding.js:222`, `systems/presentationOrchestrator.js:119`, `ui/alerts.js:269` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:81`, `systems/e1EncounterRuntime.js:139`, `systems/e1EncounterRuntime.js:165`, `systems/story.js:404`, `systems/story.js:416`, `systems/story.js:1041`, `systems/story.js:1097` | `ui/comms.js:314`, `ui/screens/codex.js:302` |
| `hazard:enter` | `systems/world.js:2241` | `data/hazardLanguage.js:99` |
| `hazard:exit` | `systems/world.js:2251` | `data/hazardLanguage.js:100` |
| `heat:changed` | `systems/heat.js:270` | `ui/hud.js:2446` |
| `heat:clear` | — | `systems/heat.js:129` |
| `hud:phase` | `systems/story.js:178`, `systems/story.js:200`, `systems/story.js:203` | `ui/hudMeta.js:102` |
| `hud:tagFlicker` | `systems/story.js:437` | `ui/hudMeta.js:136` |
| `interdiction:triggered` | `systems/encounterScripts.js:336`, `systems/world.js:1928` | `systems/presentationOrchestrator.js:127`, `systems/sectorSim.js:102` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:1894` | `render/feel.js:439`, `render/renderer.js:1014`, `save/saveSystem.js:110`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:125`, `systems/sectorSim.js:111` |
| `jump:chargeAbort` | `systems/world.js:1997`, `systems/world.js:2047`, `ui/comms.js:378`, `ui/comms.js:382` | `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:124` |
| `jump:chargeStart` | `systems/world.js:2034` | `render/feel.js:429`, `systems/gateControlDirector.js:64`, `systems/presentationOrchestrator.js:121`, `systems/story.js:112` |
| `jump:chargeTick` | `systems/world.js:1850` | `systems/presentationOrchestrator.js:122` |
| `jump:start` | `systems/world.js:1859` | `render/feel.js:433`, `systems/economy.js:329`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:123`, `systems/sectorSim.js:110` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:29` |
| `law:dispatchStarted` | — | `ui/sectorLawPresenter.js:208` |
| `law:distressRaised` | — | `ui/recoveryEncounterPrompt.js:251`, `ui/sectorLawPresenter.js:207`, `ui/signalInvestigationPrompt.js:167` |
| `law:incidentReceipt` | — | `ui/sectorLawPresenter.js:210` |
| `law:incidentResolved` | — | `ui/recoveryEncounterPrompt.js:252`, `ui/sectorLawPresenter.js:209` |
| `loot:drop` | `systems/combat.js:430`, `systems/lootShards.js:66` | `systems/mining.js:78`, `ui/floatingText.js:108` |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:295` | `systems/factionPresence.js:159` |
| `map:sectorCharted` | `systems/world.js:1757` | — |
| `massline:selfSling` | `systems/masslineThrow.js:394` | `systems/flightV3.js:130`, `systems/onboarding.js:314` |
| `massline:threat` | `systems/masslineThreats.js:146` | `systems/presentationOrchestrator.js:84` |
| `massline:throw` | `systems/masslineThrow.js:320` | `systems/tumbleStates.js:53` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:79` | — |
| `massline:tumbled` | `systems/tumbleStates.js:147` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:610` | `systems/missions.js:375`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:217` | `systems/presentationOrchestrator.js:143`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:richCoreChargeStart` | `systems/mining.js:563` | `systems/presentationOrchestrator.js:140` |
| `mining:richCoreCompleted` | `systems/mining.js:590` | `systems/presentationOrchestrator.js:141` |
| `mining:richCoreExposed` | `systems/mining.js:541` | `systems/presentationOrchestrator.js:139` |
| `mining:richCoreFizzle` | `systems/mining.js:592` | `systems/presentationOrchestrator.js:142` |
| `mining:seamHit` | `systems/mining.js:744` | `systems/presentationOrchestrator.js:136` |
| `mining:start` | `systems/mining.js:133` | `audio/audioSystem.js:651`, `render/vfx.js:587`, `systems/onboarding.js:174`, `systems/presentationOrchestrator.js:133` |
| `mining:stop` | `systems/mining.js:151` | `audio/audioSystem.js:652`, `render/vfx.js:588`, `systems/presentationOrchestrator.js:134` |
| `mining:tick` | `systems/automation.js:490`, `systems/automation.js:621`, `systems/mining.js:238` | `audio/audioSystem.js:653`, `render/vfx.js:589`, `systems/presentationOrchestrator.js:135` |
| `mining:yield` | `balance/careerCohorts.js:1805`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:291`, `systems/mining.js:441`, `systems/mining.js:587` | `careers/origins/prospectorOrigin.js:637`, `render/feel.js:452`, `render/vfx.js:590`, `systems/encounterDirector.js:135`, `systems/missions.js:373`, `systems/onboarding.js:175`, `systems/presentationOrchestrator.js:137`, `ui/floatingText.js:93` |
| `miningDrone:sellOre` | — | `systems/economy.js:308` |
| `mission:abandoned` | — | `careers/origins/haulerOriginSystem.js:72`, `ui/hud.js:2430` |
| `mission:accepted` | `systems/missions.js:1066` | `audio/audioSystem.js:661`, `save/saveSystem.js:111`, `systems/aftermathWrecks.js:322`, `systems/contractClauses.js:93`, `systems/onboarding.js:177`, `ui/hud.js:2428`, `ui/screens/missionLog.js:1742`, `ui/screens/stationHub.js:2782` |
| `mission:completed` | `systems/missions.js:2682` | `audio/audioSystem.js:662`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:112`, `systems/aftermathWrecks.js:323`, `systems/contractClauses.js:97`, `systems/factions.js:184`, `systems/story.js:124`, `ui/hud.js:2429`, `ui/screens/missionLog.js:1743`, `ui/screens/stationHub.js:2789` |
| `mission:expired` | `systems/missions.js:2764` | `audio/audioSystem.js:666`, `save/saveSystem.js:114`, `systems/aftermathWrecks.js:325`, `systems/factions.js:193`, `ui/screens/missionLog.js:1745`, `ui/screens/stationHub.js:2791` |
| `mission:failed` | `systems/missions.js:2730` | `audio/audioSystem.js:665`, `careers/origins/haulerOriginSystem.js:71`, `save/saveSystem.js:113`, `systems/aftermathWrecks.js:324`, `systems/factions.js:192`, `ui/screens/missionLog.js:1744`, `ui/screens/stationHub.js:2790` |
| `mission:forceEvent` | — | `systems/economy.js:334` |
| `mission:offerBoarded` | `systems/missions.js:658` | `systems/aftermathWrecks.js:321` |
| `mission:offered` | `systems/aftermathWrecks.js:355`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:379`, `systems/economyContracts.js:195`, `systems/lossLedger.js:271`, `systems/postEndingReplay.js:340`, `systems/salvage.js:223`, `systems/uniqueWrecks.js:684` | `systems/lossInvestigation.js:106`, `systems/missions.js:351`, `systems/survivorPod.js:150` |
| `mission:setPieceTransition` | `systems/missions.js:2563` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:3154` | — |
| `mission:updated` | `systems/missions.js:457`, `systems/missions.js:479`, `systems/missions.js:563`, `systems/missions.js:582`, `systems/missions.js:594`, `systems/missions.js:657`, `systems/missions.js:1002`, `systems/missions.js:1077`, `systems/missions.js:1211`, `systems/missions.js:1329`, `systems/missions.js:1738`, `systems/missions.js:1774`, `systems/missions.js:1787`, `systems/missions.js:1795`, `systems/missions.js:1811`, `systems/missions.js:1834`, `systems/missions.js:1873`, `systems/missions.js:1882`, `systems/missions.js:1903`, `systems/missions.js:1929`, `systems/missions.js:1997`, `systems/missions.js:2013`, `systems/missions.js:2055`, `systems/missions.js:2076`, `systems/missions.js:2112`, `systems/missions.js:2162`, `systems/missions.js:2396`, `systems/missions.js:2422`, `systems/missions.js:2429`, `systems/missions.js:2671`, `systems/missions.js:2741`, `systems/missions.js:2774`, `systems/missions.js:2981`, `systems/missions.js:3055`, `systems/missions.js:3221`, `systems/missions.js:3477`, `systems/missions.js:3599` | `ui/hud.js:2427`, `ui/screens/missionLog.js:1741`, `ui/screens/stationHub.js:2776` |
| `mode:changed` | `main.js:343`, `main.js:353`, `main.js:364`, `save/saveSystem.js:1925` | `systems/presentationAdapters.js:140`, `systems/scanner.js:445`, `ui/comms.js:459`, `ui/screenManager.js:383`, `ui/uiRoot.js:411`, `ui/wingmanRadial.js:180` |
| `module:equipped` | `systems/ships.js:899` | `systems/ships.js:493`, `systems/world.js:210`, `ui/screens/stationHub.js:2762` |
| `module:granted` | `systems/ships.js:744` | — |
| `module:purchased` | `systems/ships.js:731` | `ui/screens/stationHub.js:2764` |
| `module:unequipped` | `systems/ships.js:918` | `systems/ships.js:494`, `systems/world.js:211`, `ui/screens/stationHub.js:2763` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:127` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:389` | — |
| `moralTrap:choose` | — | `systems/moralTrap.js:73` |
| `moralTrap:resolved` | `systems/moralTrap.js:118` | — |
| `moralTrap:revealed` | `systems/moralTrap.js:91` | — |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:676`, `systems/world.js:2085` | — |
| `nav:waypoint` | `save/saveSystem.js:2112`, `systems/claims.js:889`, `systems/claims.js:897`, `systems/missions.js:1318`, `systems/missions.js:1373`, `systems/missions.js:1405`, `systems/missions.js:1756`, `systems/world.js:2084`, `ui/screens/market.js:1870` | `ui/screens/stationHub.js:2771`, `ui/screens/stationHub.js:2772` |
| `news:dockCards` | `ui/marketNews.js:222` | — |
| `news:headline` | `systems/aftermathWrecks.js:233`, `systems/e1EncounterRuntime.js:189`, `systems/traffic.js:946`, `ui/marketNews.js:189` | — |
| `news:publish` | `systems/uniqueWrecks.js:327`, `systems/uniqueWrecks.js:1316` | — |
| `patrol:proximity` | `systems/encounterScripts.js:283` | `systems/economy.js:330` |
| `physics:attachmentBroken` | — | `combat/kernel.js:66` |
| `physics:impact` | `core/physics.js:962` | `systems/fragileCargo.js:202`, `systems/masslineImpactDamage.js:39` |
| `pickup:collected` | `core/physics.js:870`, `systems/mining.js:373`, `systems/uniqueWrecks.js:1210` | `audio/audioSystem.js:655`, `render/vfx.js:605`, `systems/cargo.js:106`, `systems/mining.js:80`, `systems/onboarding.js:176`, `systems/presentationOrchestrator.js:144`, `ui/floatingText.js:124` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:188` | `systems/pirateParley.js:41` |
| `pirateParley:demand` | `systems/scanner.js:637` | `ui/pirateParleyPrompt.js:247`, `ui/recoveryEncounterPrompt.js:249`, `ui/sectorLawPresenter.js:211`, `ui/signalInvestigationPrompt.js:166` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:248`, `ui/recoveryEncounterPrompt.js:250` |
| `player:death` | `systems/combat.js:398`, `systems/combat.js:455`, `systems/combat.js:545` | `audio/audioSystem.js:649`, `render/feel.js:396`, `render/vfx.js:586`, `save/saveSystem.js:96`, `ui/commandBar.js:400`, `ui/hud.js:1038` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:186` | `systems/combat.js:295` |
| `player:respawn` | `systems/combat.js:493`, `systems/combat.js:558` | `audio/audioSystem.js:650`, `render/renderer.js:942`, `save/saveSystem.js:97`, `save/saveSystem.js:117`, `ui/commandBar.js:404`, `ui/hud.js:1052`, `ui/screens/gameOver.js:241` |
| `player:scannedByPatrol` | `systems/economy.js:987` | `systems/contractClauses.js:92`, `systems/missions.js:387`, `ui/customsPrompt.js:125` |
| `poi:discovered` | `systems/world.js:2189`, `systems/world.js:2215` | `systems/encounterDirector.js:129` |
| `poi:identified` | `systems/world.js:2218` | `systems/encounterDirector.js:130` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:1764` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:1763` |
| `presentation:audioCue` | `systems/presentationAdapters.js:405` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:352` | — |
| `presentation:caption` | `systems/factionPresence.js:331`, `systems/factionPresence.js:631`, `systems/factionPresence.js:646`, `systems/factionPresence.js:664`, `systems/factionPresence.js:726`, `systems/presentationAdapters.js:494`, `systems/story.js:751`, `systems/story.js:797` | `ui/hud.js:1103` |
| `presentation:cue` | — | `audio/audioSystem.js:719`, `render/vfx.js:602`, `render/vfx.js:603`, `systems/presentationAdapters.js:137` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:334` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:284`, `systems/presentationAdapters.js:476` | — |
| `presentation:vfxCue` | `render/vfx.js:614`, `systems/impulseCharges.js:414`, `systems/masslineThrow.js:322`, `systems/missions.js:1083`, `systems/missions.js:2687`, `systems/presentationAdapters.js:379`, `systems/tumbleStates.js:152` | `render/vfx.js:604` |
| `projectile:hit` | `core/physics.js:495`, `core/physics.js:533`, `systems/sectorSim.js:540` | `audio/audioSystem.js:633`, `render/vfx.js:573`, `systems/combat.js:288` |
| `projectile:nearMiss` | `core/physics.js:511` | `systems/presentationOrchestrator.js:113` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:204` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:246` |
| `recovery:started` | — | `ui/sectorLawPresenter.js:213`, `ui/signalInvestigationPrompt.js:165` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:203` | — |
| `research:pointsChanged` | `systems/missions.js:2650` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:270` | — |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:224` | `systems/encounterDirector.js:131`, `systems/story.js:139` |
| `salvage:completed` | `systems/mining.js:447` | `systems/aftermathWrecks.js:318` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:314` | — |
| `salvage:placed` | `systems/salvage.js:119` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:148` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:581` | — |
| `save:completed` | `save/saveSystem.js:587` | `ui/uiRoot.js:214` |
| `save:error` | `save/saveSystem.js:329`, `save/saveSystem.js:379`, `save/saveSystem.js:393`, `save/saveSystem.js:590`, `save/saveSystem.js:757`, `save/saveSystem.js:1007`, `save/saveSystem.js:1646`, `save/saveSystem.js:1651`, `save/saveSystem.js:1681`, `save/saveSystem.js:1689`, `save/saveSystem.js:1700`, `save/saveSystem.js:1745`, `save/saveSystem.js:1763`, `save/saveSystem.js:1941`, `save/saveSystem.js:1949`, `save/saveSystem.js:1976`, `save/saveSystem.js:2290`, `save/saveSystem.js:2303`, `save/saveSystem.js:2317` | `ui/screenManager.js:384`, `ui/uiRoot.js:236` |
| `save:exportRecovery` | `save/saveSystem.js:2279` | — |
| `save:loaded` | `save/saveSystem.js:1928` | `audio/audioSystem.js:762`, `careers/origins/haulerOriginSystem.js:65`, `core/physics.js:56`, `main.js:120`, `render/feel.js:331`, `render/renderer.js:941`, `render/renderer.js:1019`, `render/vfx.js:581`, `save/saveSystem.js:99`, `systems/aftermathWrecks.js:327`, `systems/automation.js:307`, `systems/beacons.js:37`, `systems/combat.js:301`, `systems/encounterDirector.js:115`, `systems/factionPresence.js:165`, `systems/flight.js:74`, `systems/flightV3.js:127`, `systems/gateControlDirector.js:70`, `systems/lossInvestigation.js:108`, `systems/missions.js:342`, `systems/onboarding.js:161`, `systems/presentationAdapters.js:143`, `systems/presentationOrchestrator.js:170`, `systems/sectorSim.js:95`, `systems/ships.js:498`, `systems/spawnBudget.js:49`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:57`, `systems/story.js:96`, `systems/survivorPod.js:153`, `systems/tacticalAI.js:99`, `systems/uniqueLootAbilities.js:117`, `ui/bandHud.js:56`, `ui/priceHistory.js:59`, `ui/radar.js:407`, `ui/uiRoot.js:221`, `ui/uiRoot.js:839` |
| `save:recovered` | `save/saveSystem.js:1670` | `ui/uiRoot.js:229` |
| `save:restoring` | `save/saveSystem.js:1785` | `render/feel.js:330`, `render/renderer.js:976`, `systems/salvage.js:60`, `systems/stationContactLoadBoundary.js:30` |
| `save:started` | `save/saveSystem.js:382`, `save/saveSystem.js:789` | `ui/uiRoot.js:210` |
| `scan:completed` | `balance/careerCohorts.js:477`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:527`, `systems/world.js:2193` | `careers/origins/prospectorOrigin.js:634`, `systems/missions.js:381`, `systems/onboarding.js:188`, `systems/presentationOrchestrator.js:129`, `systems/salvage.js:57`, `systems/salvageActions.js:70`, `systems/story.js:132`, `ui/hud.js:2748` |
| `scan:pulse` | `systems/scanner.js:479` | `systems/buildIdentity.js:268`, `systems/encounterDirector.js:122`, `systems/pirateDisguise.js:16`, `systems/presentationOrchestrator.js:128`, `systems/scanReveal.js:14`, `ui/hud.js:2749` |
| `scan:shipRevealed` | `systems/scanReveal.js:37` | `systems/buildIdentity.js:267` |
| `scan:weakPoint` | `systems/scanner.js:516` | `ui/hud.js:711` |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:137` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:154` | `systems/presentationOrchestrator.js:65` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:572` | `systems/presentationOrchestrator.js:167`, `ui/comms.js:226` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:359` | `ui/comms.js:222` |
| `scenario:factChanged` | `systems/scenarioRuntime.js:547` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:132` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:122` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:189` | `ui/comms.js:412` |
| `scenario:scavengerResponse` | `ui/comms.js:433`, `ui/comms.js:437` | `systems/scenarioRuntime.js:29` |
| `sector:discovered` | `systems/world.js:406` | `systems/presentationOrchestrator.js:126` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:419` | `audio/audioSystem.js:694`, `render/renderer.js:992`, `render/vfx.js:580`, `save/saveSystem.js:109`, `systems/aftermathWrecks.js:316`, `systems/automation.js:319`, `systems/claims.js:140`, `systems/economy.js:322`, `systems/encounterDirector.js:111`, `systems/factionPresence.js:156`, `systems/lossInvestigation.js:105`, `systems/mining.js:83`, `systems/missions.js:401`, `systems/moralTrap.js:72`, `systems/presentationOrchestrator.js:157`, `systems/salvage.js:55`, `systems/sectorSim.js:94`, `systems/story.js:111`, `systems/story.js:131`, `systems/survivorPod.js:149`, `systems/traffic.js:194`, `systems/wingmen.js:48`, `ui/causeLedger.js:132`, `ui/commandBar.js:410`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/radar.js:408`, `ui/radar.js:409`, `ui/sectorLawPresenter.js:205`, `ui/sectorPostcard.js:136`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:354` | `render/renderer.js:988`, `systems/aftermathWrecks.js:317`, `systems/automation.js:313`, `systems/encounterDirector.js:113`, `systems/factionPresence.js:157`, `systems/gateControlDirector.js:69`, `systems/missions.js:402`, `systems/sectorSim.js:93`, `systems/spawnBudget.js:45`, `systems/stationSideEventDirector.js:56`, `systems/traffic.js:197`, `systems/wingmen.js:51`, `ui/customsPrompt.js:127`, `ui/encounterChoicePrompt.js:130` |
| `sectorsim:embodiment` | `systems/sectorSim.js:762` | `systems/world.js:222` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:310` | `ui/screens/starmap.js:578` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:405`, `systems/claims.js:852`, `systems/encounterDirector.js:984` | `systems/sectorSim.js:100` |
| `sectorsim:intel` | `systems/sectorSim.js:816` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:613` | — |
| `sectorsim:reconcile` | `systems/sectorSim.js:586` | — |
| `sectorsim:tick` | `systems/sectorSim.js:255` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:551` | `ui/screens/starmap.js:579` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:504` | — |
| `settings:changed` | `save/saveSystem.js:1957`, `save/saveSystem.js:1958`, `systems/touch.js:250`, `ui/screens/settings.js:251`, `ui/screens/settings.js:538`, `ui/screens/settings.js:613` | `audio/audioSystem.js:740`, `main.js:119`, `render/renderer.js:947`, `render/vfx.js:582`, `save/saveSystem.js:91`, `ui/uiRoot.js:336` |
| `ship:appearanceChanged` | `systems/ships.js:643` | `render/renderer.js:931`, `render/vfx.js:579` |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:172` | `audio/audioSystem.js:699`, `render/feel.js:466`, `render/vfx.js:592`, `systems/cruise.js:25` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:173`, `systems/flightV3.js:351` | `audio/audioSystem.js:704`, `render/renderer.js:936`, `render/vfx.js:593` |
| `ship:cargoCapChanged` | `systems/ships.js:638` | `systems/cargo.js:130` |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:330` | `audio/audioSystem.js:705`, `render/vfx.js:594`, `systems/uniqueLootAbilities.js:115`, `ui/floatingText.js:111` |
| `ship:massChanged` | `systems/ships.js:760` | — |
| `ship:purchased` | `systems/ships.js:791` | `audio/audioSystem.js:693`, `systems/missions.js:405`, `systems/onboarding.js:178`, `ui/screens/stationHub.js:2760` |
| `ship:roleContext` | `systems/ships.js:579` | `systems/presentationAdapters.js:139` |
| `ship:sold` | `systems/ships.js:812` | `ui/screens/stationHub.js:2761` |
| `ship:statsChanged` | `systems/ships.js:637` | `systems/cargo.js:131`, `systems/world.js:212`, `ui/commandBar.js:405`, `ui/hud.js:2426`, `ui/screens/stationHub.js:2734`, `ui/screens/stationHub.js:2756`, `ui/screens/stationHub.js:2757`, `ui/screens/stationHub.js:2758`, `ui/screens/stationHub.js:2759` |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1140` | `render/vfx.js:591` |
| `signal:investigated` | `systems/scanner.js:785` | `systems/missions.js:384`, `systems/presentationOrchestrator.js:132`, `ui/signalInvestigationPrompt.js:164` |
| `signal:receipt` | `systems/scanner.js:786` | — |
| `signal:scanResults` | `systems/scanner.js:528` | `systems/presentationOrchestrator.js:130`, `ui/sectorLawPresenter.js:212`, `ui/signalInvestigationPrompt.js:162` |
| `signal:track` | `ui/signalInvestigationPrompt.js:138` | `systems/scanner.js:439` |
| `signal:tracked` | `systems/scanner.js:613` | `systems/presentationOrchestrator.js:131`, `ui/signalInvestigationPrompt.js:163` |
| `sim:jumpGate` | — | `systems/economy.js:328` |
| `sim:pause` | `ui/screenManager.js:243` | `audio/audioSystem.js:752`, `render/feel.js:328` |
| `sim:resume` | `ui/screenManager.js:250` | `audio/audioSystem.js:753` |
| `spawn:request` | `systems/automation.js:748` | `systems/world.js:214` |
| `station:broadcastTic` | `systems/stationBroadcast.js:203` | — |
| `station:exitRequest` | `ui/screenManager.js:348`, `ui/uiRoot.js:709` | `ui/screens/stationHub.js:2713` |
| `station:sideEvent` | `systems/stationSideEventDirector.js:187` | — |
| `stationContact:changed` | `systems/stationContacts.js:125` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:90` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:149` | — |
| `story:beatAdvanced` | `systems/missions.js:3463` | `save/saveSystem.js:116`, `systems/story.js:91`, `ui/screens/codex.js:300` |
| `story:elroyResolved` | `systems/missions.js:2199` | `systems/story.js:92` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:884` | — |
| `story:postEndingContinuity` | `systems/story.js:921` | — |
| `story:postEndingProgress` | `systems/story.js:891` | `ui/screens/missionLog.js:1761` |
| `story:replayHookUnlocked` | `systems/story.js:906` | `ui/screens/missionLog.js:1762` |
| `story:vergeEvidenceRecorded` | `systems/story.js:776` | — |
| `story:vergeObserversRevealed` | `systems/story.js:750` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:796` | — |
| `survivorPod:choose` | — | `systems/survivorPod.js:151` |
| `survivorPod:promoted` | `systems/survivorPod.js:235` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:329` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:341` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:380` | — |
| `tech:researched` | `systems/ships.js:680` | `audio/audioSystem.js:692`, `systems/onboarding.js:269`, `systems/ships.js:495`, `ui/screens/manufacture.js:218`, `ui/screens/stationHub.js:2765` |
| `tether:attached` | `combat/attachments.js:157` | `render/vfx.js:570`, `systems/encounterDirector.js:126`, `systems/presentationOrchestrator.js:66`, `systems/scenarioRuntime.js:23`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:127`, `systems/tetherGameplay.js:310` | `careers/origins/prospectorOrigin.js:646`, `systems/onboarding.js:186`, `systems/surrenderRecovery.js:34` |
| `tether:broken` | `combat/attachments.js:273` | `render/feel.js:477`, `render/renderer.js:938`, `render/vfx.js:571`, `systems/presentationOrchestrator.js:74`, `systems/scenarioRuntime.js:27` |
| `tether:cut` | `systems/tetherGameplay.js:103` | `systems/masslineThrow.js:58` |
| `tether:latched` | `systems/tetherGameplay.js:182` | `careers/origins/prospectorOrigin.js:643`, `systems/flightV3.js:129`, `systems/onboarding.js:181`, `systems/onboarding.js:296`, `systems/onboarding.js:307`, `systems/surrenderRecovery.js:31`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:nearBreak` | `combat/attachments.js:410` | `systems/onboarding.js:187`, `systems/presentationOrchestrator.js:67` |
| `tether:reel` | `combat/attachments.js:207` | `systems/missions.js:385`, `systems/onboarding.js:184`, `systems/surrenderRecovery.js:32` |
| `tether:reelPump` | `systems/masslineTelemetry.js:247` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:105`, `systems/tetherGameplay.js:128`, `systems/tetherGameplay.js:308`, `systems/tetherGameplay.js:311` | `systems/presentationOrchestrator.js:106` |
| `tether:released` | `systems/tetherGameplay.js:104`, `systems/tetherGameplay.js:307` | `render/renderer.js:937`, `systems/onboarding.js:185`, `systems/surrenderRecovery.js:33` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:325` | — |
| `tether:strain` | `systems/tetherGameplay.js:367` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:184` | `systems/combat.js:289`, `systems/masslineImpactDamage.js:38`, `systems/presentationOrchestrator.js:95`, `systems/tumbleStates.js:52` |
| `touch:uiAction` | `systems/touch.js:219` | `ui/input.js:458` |
| `tutorial:finished` | `systems/onboarding.js:686` | `systems/missions.js:341`, `systems/story.js:98` |
| `tutorial:say` | `systems/onboarding.js:468` | `systems/story.js:104` |
| `ui:abandonMission` | `ui/screens/missionLog.js:1675` | `systems/missions.js:346` |
| `ui:acceptMission` | `ui/screens/bar.js:1031`, `ui/screens/stationHub.js:1963`, `ui/station/screens/contracts.js:176`, `ui/station/screens/contracts.js:180` | `systems/missions.js:345` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | `ui/screens/market.js:633` | `careers/origins/haulerOriginSystem.js:88`, `systems/economy.js:293` |
| `ui:buyModule` | `ui/screens/outfitting.js:803`, `ui/station/screens/shipworks.js:305` | `systems/onboarding.js:263`, `systems/ships.js:508` |
| `ui:buyShip` | `ui/screens/shipyard.js:839`, `ui/screens/shipyard.js:861`, `ui/station/screens/shipworks.js:297` | `systems/ships.js:506` |
| `ui:cancel` | `ui/input.js:660`, `ui/input.js:674` | — |
| `ui:click` | — | `audio/audioSystem.js:756` |
| `ui:closeAll` | `main.js:315` | `ui/uiRoot.js:591` |
| `ui:closeCargo` | `ui/input.js:121`, `ui/input.js:191` | `ui/hud.js:2400` |
| `ui:closeComms` | `ui/input.js:186` | `ui/comms.js:299` |
| `ui:confirm` | `ui/input.js:668` | `audio/audioSystem.js:758` |
| `ui:cycleTarget` | `ui/input.js:225`, `ui/input.js:721` | `ui/uiRoot.js:592` |
| `ui:deny` | — | `audio/audioSystem.js:759` |
| `ui:drillFadeStart` | `ui/input.js:367` | `ui/uiRoot.js:739` |
| `ui:endgameChoose` | `systems/missions.js:1011` | `systems/story.js:115` |
| `ui:endgameConfirm` | — | `systems/story.js:116` |
| `ui:endgameDecline` | `ui/comms.js:370` | `systems/story.js:117` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1537` | `systems/story.js:118` |
| `ui:factionPresenceService` | `ui/screens/services.js:375` | `systems/factionPresence.js:163`, `ui/screens/stationHub.js:2714` |
| `ui:fitModule` | `ui/screens/outfitting.js:738` | `systems/onboarding.js:259`, `systems/ships.js:509` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:711` | `systems/automation.js:300`, `systems/wingmen.js:59` |
| `ui:hover` | — | `audio/audioSystem.js:757` |
| `ui:kurtzInteract` | — | `systems/story.js:134` |
| `ui:navigate` | `ui/input.js:648`, `ui/input.js:652`, `ui/input.js:699` | — |
| `ui:popScreen` | `ui/galaxyMap.js:1795`, `ui/screens/automationPanel.js:262`, `ui/screens/starmap.js:424` | `ui/uiRoot.js:589` |
| `ui:purchaseSurveyData` | `ui/screens/bar.js:1013` | `systems/world.js:215` |
| `ui:pushScreen` | `ui/mapAuthority.js:133`, `ui/screens/bar.js:396`, `ui/screens/gameOver.js:199`, `ui/screens/starmap.js:432`, `ui/screens/stationHub.js:378` | `ui/uiRoot.js:566` |
| `ui:replaceScreen` | — | `ui/uiRoot.js:590` |
| `ui:sell` | `ui/screens/market.js:442`, `ui/screens/stationHub.js:1540` | `careers/origins/haulerOriginSystem.js:89`, `systems/economy.js:294` |
| `ui:sellShip` | `ui/screens/shipyard.js:812` | — |
| `ui:service` | `balance/careerCohorts.js:699`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/screens/services.js:436`, `ui/screens/stationHub.js:1691`, `ui/station/stationApp.js:232` | `systems/economy.js:325` |
| `ui:setActiveShip` | `ui/screens/shipyard.js:817`, `ui/station/screens/shipworks.js:288` | `systems/ships.js:507` |
| `ui:setCourse` | `systems/factionPresence.js:657`, `systems/input.js:532`, `systems/missions.js:1393`, `systems/scanner.js:612`, `ui/galaxyMap.js:1248`, `ui/galaxyMap.js:1260`, `ui/galaxyMap.js:3109`, `ui/screens/localmap.js:586`, `ui/screens/market.js:1872`, `ui/screens/starmap.js:1226`, `ui/screens/starmap.js:1239`, `ui/screens/starmap.js:1243` | `systems/world.js:208` |
| `ui:talkContact` | `ui/screens/bar.js:1075` | `systems/story.js:135` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:28`, `combat/autoTargetMode.js:113` | `ui/uiRoot.js:593` |
| `ui:toggleCargo` | `ui/input.js:251` | `ui/hud.js:2399` |
| `ui:toggleComms` | `ui/input.js:268` | `ui/comms.js:298` |
| `ui:toggleOverview` | `ui/input.js:255` | `ui/hud.js:2758` |
| `ui:trackMission` | `ui/screens/missionLog.js:1533`, `ui/screens/missionLog.js:1593`, `ui/screens/missionLog.js:1654`, `ui/station/screens/contracts.js:180` | `systems/missions.js:347` |
| `ui:undock` | — | `ui/input.js:457` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:309` | `systems/ships.js:510` |
| `ui:unlockTech` | `ui/screens/techTree.js:579` | `systems/ships.js:511` |
| `ui:wingOrder` | `ui/wingmanRadial.js:124` | `systems/automation.js:301` |
| `ui:wingmanRadial` | `ui/input.js:261` | `ui/wingmanRadial.js:178` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:305` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:257` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:192` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1091` | `systems/missions.js:394` |
| `uniqueWreck:choose` | `systems/missions.js:1947`, `ui/recoveryEncounterPrompt.js:199` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:573` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:591`, `systems/uniqueWrecks.js:748` | `systems/missions.js:395` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1151` | `systems/missions.js:397`, `ui/recoveryEncounterPrompt.js:247` |
| `uniqueWreck:decisionRequest` | `ui/recoveryEncounterPrompt.js:250`, `ui/recoveryEncounterPrompt.js:252` | — |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:810` | `systems/missions.js:396` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:840` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:750` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1314` | `systems/missions.js:398`, `ui/recoveryEncounterPrompt.js:248` |
| `uniqueWreck:rumorHeard` | `ui/screens/bar.js:1089` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:465` | `systems/missions.js:393` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1315` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1070` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1258` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:314` | — |
| `voice:clear` | `ui/voiceArbiter.js:339`, `ui/voiceArbiter.js:383` | `ui/alerts.js:259` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:297` |
| `voice:say` | `ui/alerts.js:161` | `ui/voiceArbiter.js:296` |
| `voice:surface` | `ui/voiceArbiter.js:344`, `ui/voiceArbiter.js:393` | `ui/alerts.js:258` |
| `weapons:vent` | `systems/weapons.js:221`, `systems/weapons.js:241` | `audio/audioSystem.js:677`, `ui/hud.js:2466` |
| `wingMorale:broken` | `systems/wingMorale.js:206` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:274` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:301` | — |
| `wingOrder:accepted` | `systems/automation.js:1128` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1129` | — |
| `wingOrder:converted` | `systems/wingmen.js:307` | — |
| `wingOrder:status` | `systems/automation.js:1130` | — |
| `world:membership` | `systems/world.js:412` | `systems/presentationOrchestrator.js:120` |
| `world:originShift` | `systems/world.js:1807` | — |
| `world:playerRelocated` | `systems/world.js:1694` | — |
| `world:requestJump` | `ui/galaxyMap.js:1246`, `ui/screens/starmap.js:1238` | `systems/world.js:205` |
| `world:requestRoute` | `ui/galaxyMap.js:1258`, `ui/galaxyMap.js:3107`, `ui/screens/starmap.js:1225`, `ui/screens/starmap.js:1242` | `systems/world.js:206` |
| `world:requestSectorScan` | — | `systems/world.js:207` |
| `world:residency` | `systems/world.js:527`, `systems/world.js:903` | — |
| `world:zoneEntered` | `systems/world.js:1834` | `data/hazardLanguage.js:101` |
| `world:zoneExited` | `systems/world.js:1837` | `data/hazardLanguage.js:102` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 1 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:baseDestroyed` — 1 subscriber(s)
- `combat:lockChanged` — 2 subscriber(s)
- `combat:repairSubsystem` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 4 subscriber(s)
- `combat:subsystemEnabled` — 1 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `dock:attempt` — 1 subscriber(s)
- `economy:trade` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `entity:spawnRequest` — 1 subscriber(s)
- `flybyFocus:cancel` — 1 subscriber(s)
- `game:newGame` — 8 subscriber(s)
- `heat:clear` — 1 subscriber(s)
- `law:custodyTransfer` — 1 subscriber(s)
- `law:dispatchStarted` — 1 subscriber(s)
- `law:distressRaised` — 3 subscriber(s)
- `law:incidentReceipt` — 1 subscriber(s)
- `law:incidentResolved` — 2 subscriber(s)
- `miningDrone:sellOre` — 1 subscriber(s)
- `mission:abandoned` — 2 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `moralMemory:remember` — 1 subscriber(s)
- `moralTrap:choose` — 1 subscriber(s)
- `physics:attachmentBroken` — 1 subscriber(s)
- `pirateParley:resolved` — 2 subscriber(s)
- `postEndingReplay:cycleCompleted` — 1 subscriber(s)
- `presentation:cue` — 4 subscriber(s)
- `recovery:completed` — 1 subscriber(s)
- `recovery:started` — 2 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `sim:jumpGate` — 1 subscriber(s)
- `survivorPod:choose` — 1 subscriber(s)
- `ui:click` — 1 subscriber(s)
- `ui:deny` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:hover` — 1 subscriber(s)
- `ui:kurtzInteract` — 1 subscriber(s)
- `ui:replaceScreen` — 1 subscriber(s)
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
- `ai:stateChange` — 1 emitter(s)
- `ambientComms:register` — 1 emitter(s)
- `ambientComms:toneChanged` — 1 emitter(s)
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
- `boss:defeated` — 1 emitter(s)
- `buildIdentity:revealed` — 1 emitter(s)
- `cargo:delivered` — 1 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `charge:combo` — 2 emitter(s)
- `charge:stuck` — 1 emitter(s)
- `charge:thrown` — 1 emitter(s)
- `claim:defenseEncounterRequested` — 1 emitter(s)
- `claim:defenseResolved` — 1 emitter(s)
- `claim:defenseStarted` — 1 emitter(s)
- `claim:defenseWarning` — 1 emitter(s)
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
- `combat:hit` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `combat:statusApplied` — 1 emitter(s)
- `combat:statusExpired` — 1 emitter(s)
- `comms:log` — 2 emitter(s)
- `conflict:warDeclared` — 1 emitter(s)
- `contactHail:availability` — 2 emitter(s)
- `contactHail:clear` — 1 emitter(s)
- `contactHail:handoff` — 1 emitter(s)
- `contactHail:offer` — 1 emitter(s)
- `contactHail:response` — 1 emitter(s)
- `contract:clauseHonored` — 2 emitter(s)
- `countermeasure:deployed` — 1 emitter(s)
- `customs:breakScan` — 1 emitter(s)
- `customs:submit` — 1 emitter(s)
- `danger:miningNoise` — 1 emitter(s)
- `dock:denied` — 1 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:namedCaptainDefeated` — 1 emitter(s)
- `encounter:receipt` — 1 emitter(s)
- `encounter:voice` — 1 emitter(s)
- `encounter:waitStarted` — 1 emitter(s)
- `encounter:winnerHostile` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `faction:tradePosture` — 3 emitter(s)
- `factionPresence:administrativeRouting` — 1 emitter(s)
- `factionPresence:fulfillmentProvoked` — 1 emitter(s)
- `factionPresence:service` — 1 emitter(s)
- `factionPresence:serviceAction` — 1 emitter(s)
- `factionPresence:spawned` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `flybyFocus:end` — 1 emitter(s)
- `freight:arrival` — 1 emitter(s)
- `freight:loss` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `lossInvestigation:promoted` — 1 emitter(s)
- `map:sectorCharted` — 1 emitter(s)
- `massline:tumbleEnd` — 1 emitter(s)
- `massline:tumbled` — 1 emitter(s)
- `mission:setPieceTransition` — 1 emitter(s)
- `mission:setPieceTravelLine` — 1 emitter(s)
- `module:granted` — 1 emitter(s)
- `moralMemory:vengefulReturn` — 1 emitter(s)
- `moralTrap:resolved` — 1 emitter(s)
- `moralTrap:revealed` — 1 emitter(s)
- `nav:autopilot` — 3 emitter(s)
- `news:dockCards` — 1 emitter(s)
- `news:headline` — 4 emitter(s)
- `news:publish` — 2 emitter(s)
- `presentation:audioCue` — 1 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 2 emitter(s)
- `recovery:choose` — 1 emitter(s)
- `recovery:vent` — 1 emitter(s)
- `research:pointsChanged` — 1 emitter(s)
- `rumor:ghostConvoy` — 1 emitter(s)
- `salvage:actionRead` — 1 emitter(s)
- `salvage:fieldVulture` — 1 emitter(s)
- `salvage:reactorBurst` — 1 emitter(s)
- `salvage:reactorTowedClear` — 1 emitter(s)
- `salvage:reactorVented` — 1 emitter(s)
- `save:backup` — 1 emitter(s)
- `save:exportRecovery` — 1 emitter(s)
- `scenario:actorBindings` — 1 emitter(s)
- `scenario:factChanged` — 1 emitter(s)
- `scenario:factsInitialized` — 1 emitter(s)
- `scenario:loaded` — 1 emitter(s)
- `sectorsim:intel` — 1 emitter(s)
- `sectorsim:offlineSummary` — 1 emitter(s)
- `sectorsim:reconcile` — 1 emitter(s)
- `sectorsim:tick` — 1 emitter(s)
- `sensorGhost:swarm` — 1 emitter(s)
- `ship:massChanged` — 1 emitter(s)
- `signal:receipt` — 1 emitter(s)
- `station:broadcastTic` — 1 emitter(s)
- `station:sideEvent` — 1 emitter(s)
- `stationContact:changed` — 1 emitter(s)
- `stationContact:counterChanged` — 1 emitter(s)
- `stationLife:trafficChanged` — 1 emitter(s)
- `story:playerChoiceRecorded` — 1 emitter(s)
- `story:postEndingContinuity` — 1 emitter(s)
- `story:vergeEvidenceRecorded` — 1 emitter(s)
- `story:vergeObserversRevealed` — 1 emitter(s)
- `story:vergeValeGatesRevoked` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:rescueBlocked` — 1 emitter(s)
- `survivorPod:rescueSelected` — 1 emitter(s)
- `survivorPod:stripped` — 1 emitter(s)
- `tether:reelPump` — 1 emitter(s)
- `tether:snapCatch` — 1 emitter(s)
- `tether:strain` — 1 emitter(s)
- `ui:bulkHaulTag` — 1 emitter(s)
- `ui:bulkHaulTagCleared` — 1 emitter(s)
- `ui:cancel` — 2 emitter(s)
- `ui:navigate` — 3 emitter(s)
- `ui:sellShip` — 1 emitter(s)
- `uniqueLoot:choirBellPulse` — 1 emitter(s)
- `uniqueLoot:nestbreakerSplit` — 1 emitter(s)
- `uniqueLoot:paleCoilBlink` — 1 emitter(s)
- `uniqueWreck:choose` — 2 emitter(s)
- `uniqueWreck:complicationScheduled` — 1 emitter(s)
- `uniqueWreck:decisionRequest` — 2 emitter(s)
- `uniqueWreck:encounterCompleted` — 1 emitter(s)
- `uniqueWreck:encounterRequested` — 1 emitter(s)
- `uniqueWreck:rumorHeard` — 1 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:scanBlocked` — 1 emitter(s)
- `uniqueWreck:storyRewardGranted` — 1 emitter(s)
- `v2:flavorPresented` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `wingOrder:blocked` — 1 emitter(s)
- `wingOrder:converted` — 1 emitter(s)
- `wingOrder:status` — 1 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:playerRelocated` — 1 emitter(s)
- `world:residency` — 2 emitter(s)
