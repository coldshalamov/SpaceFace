# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-08-07 · 625 events · 2220 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/encounterDirector.js:128` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:215` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:412` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:530` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:232` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:447` | — |
| `ai:counterTether` | `ai/sg03ActionPort.js:372` | `systems/presentationOrchestrator.js:142` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:154` | `systems/presentationOrchestrator.js:143` |
| `ai:encounterCommand` | `systems/aiPorts.js:201` | — |
| `ai:flee` | `systems/ai.js:235`, `systems/wingMorale.js:262` | `render/vfx.js:1134`, `systems/barkDirector.js:37`, `systems/combatOutcome.js:103`, `systems/presentationOrchestrator.js:144` |
| `ai:formationBroken` | `systems/ai.js:404`, `systems/wingMorale.js:224` | `render/vfx.js:1135` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:38` |
| `ai:stateChange` | `systems/ai.js:232` | — |
| `ai:telegraph` | `systems/ai.js:300`, `systems/encounterScripts.js:113`, `systems/masslineSnares.js:299`, `systems/mines.js:100`, `systems/tacticalAI.js:143` | `audio/audioSystem.js:693`, `render/vfx.js:1133`, `systems/presentationOrchestrator.js:141`, `ui/hud.js:1809` |
| `aiTrader:requestTrade` | `systems/traffic.js:1396` | `systems/economy.js:455` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:102` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:190` | — |
| `anomaly:bearing` | `systems/scanner.js:881` | — |
| `anomaly:triangulated` | `systems/scanner.js:899` | `systems/world.js:235` |
| `asset:deployed` | `systems/automation.js:1130`, `systems/automation.js:1639`, `systems/automation.js:1676`, `systems/automation.js:1746`, `systems/claims.js:384` | `systems/missions.js:624`, `systems/onboarding.js:287`, `systems/story.js:150` |
| `asteroid:chunked` | `systems/mining.js:973` | `systems/presentationOrchestrator.js:178` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:775`, `systems/mining.js:681` | `audio/audioSystem.js:677`, `systems/fieldDepletion.js:186`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/vfx.js:1155`, `systems/ai.js:675`, `systems/beacons.js:52`, `systems/beacons.js:57`, `systems/beacons.js:80`, `systems/bulletTime.js:95`, `systems/bulletTime.js:111`, `systems/claims.js:231`, `systems/claims.js:316`, `systems/claims.js:361`, `systems/claims.js:1045`, `systems/cloak.js:107`, `systems/cloak.js:118`, `systems/countermeasures.js:189`, `systems/crafting.js:221`, `systems/crafting.js:231`, `systems/fields.js:191`, `systems/fields.js:262`, `systems/fields.js:290`, `systems/fields.js:297`, `systems/fields.js:364`, `systems/flybyFocus.js:408`, `systems/impulseCharges.js:303`, `systems/impulseCharges.js:465`, `systems/jettisonImpulse.js:63`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:154`, `systems/masslineThrow.js:389`, `systems/masslineThrow.js:515`, `systems/mining.js:519`, `systems/mining.js:1053`, `systems/planetRuntime.js:463`, `systems/presentationAdapters.js:478`, `systems/salvage.js:217`, `systems/tumbleStates.js:185`, `systems/weapons.js:913`, `systems/weapons.js:946`, `ui/hud.js:2669`, `ui/hud.js:2872`, `ui/hud.js:2923`, `ui/hud.js:2962`, `ui/hud.js:2979`, `ui/hud.js:3070`, `ui/hud.js:3161`, `ui/hud.js:3373`, `ui/input.js:79`, `ui/input.js:102`, `ui/input.js:148`, `ui/input.js:160`, `ui/input.js:166`, `ui/input.js:202`, `ui/input.js:256`, `ui/input.js:458`, `ui/input.js:670`, `ui/input.js:675`, `ui/input.js:759`, `ui/input.js:767`, `ui/input.js:773`, `ui/input.js:798`, `ui/input.js:809`, `ui/input.js:813`, `ui/input.js:826`, `ui/screens/bar.js:1026`, `ui/screens/bar.js:1055`, `ui/screens/bar.js:1092`, `ui/screens/bar.js:1110`, `ui/screens/bar.js:1161`, `ui/screens/base.js:506`, `ui/screens/base.js:648`, `ui/screens/market.js:451`, `ui/screens/market.js:453`, `ui/screens/market.js:524`, `ui/screens/market.js:637`, `ui/screens/market.js:647`, `ui/screens/market.js:698`, `ui/screens/market.js:707`, `ui/screens/market.js:736`, `ui/screens/market.js:793`, `ui/screens/market.js:799`, `ui/screens/market.js:809`, `ui/screens/market.js:902`, `ui/screens/market.js:1122`, `ui/screens/market.js:1635`, `ui/screens/market.js:1898`, `ui/screens/missionLog.js:1656`, `ui/screens/missionLog.js:1660`, `ui/screens/missionLog.js:1664`, `ui/screens/missionLog.js:1668`, `ui/screens/missionLog.js:1684`, `ui/screens/missionLog.js:1691`, `ui/screens/missionLog.js:1698`, `ui/screens/missionLog.js:1706`, `ui/screens/missionLog.js:1713`, `ui/screens/missionLog.js:1720`, `ui/screens/missionLog.js:1729`, `ui/screens/missionLog.js:1736`, `ui/screens/missionLog.js:1752`, `ui/screens/missionLog.js:1783`, `ui/screens/missionLog.js:1803`, `ui/screens/outfitting.js:909`, `ui/screens/outfitting.js:913`, `ui/screens/outfitting.js:979`, `ui/screens/outfitting.js:986`, `ui/screens/services.js:380`, `ui/screens/services.js:402`, `ui/screens/services.js:415`, `ui/screens/services.js:431`, `ui/screens/services.js:437`, `ui/screens/shipLedger.js:297`, `ui/screens/shipLedger.js:304`, `ui/screens/shipLedger.js:311`, `ui/screens/shipyard.js:813`, `ui/screens/shipyard.js:818`, `ui/screens/shipyard.js:840`, `ui/screens/shipyard.js:844`, `ui/screens/shipyard.js:862`, `ui/screens/stationHub.js:1197`, `ui/screens/stationHub.js:1206`, `ui/screens/stationHub.js:1262`, `ui/screens/stationHub.js:1295`, `ui/screens/stationHub.js:1301`, `ui/screens/stationHub.js:1348`, `ui/screens/stationHub.js:1360`, `ui/screens/stationHub.js:1364`, `ui/screens/stationHub.js:1376`, `ui/screens/stationHub.js:1392`, `ui/screens/stationHub.js:1556`, `ui/screens/stationHub.js:1669`, `ui/screens/stationHub.js:1678`, `ui/screens/stationHub.js:1694`, `ui/screens/stationHub.js:1704`, `ui/screens/stationHub.js:1707`, `ui/screens/stationHub.js:1962`, `ui/screens/stationHub.js:1982`, `ui/screens/stationHub.js:2451`, `ui/station/screens/bar.js:219`, `ui/station/screens/bar.js:242`, `ui/station/screens/bar.js:258`, `ui/station/screens/bar.js:286`, `ui/station/screens/bar.js:312`, `ui/station/screens/bar.js:321`, `ui/station/screens/contracts.js:469`, `ui/station/screens/contracts.js:474`, `ui/station/screens/contracts.js:478`, `ui/station/screens/factions.js:322`, `ui/station/screens/industry.js:150`, `ui/station/screens/industry.js:159`, `ui/station/screens/industry.js:167`, `ui/station/screens/market.js:544`, `ui/station/screens/market.js:561`, `ui/station/screens/market.js:650`, `ui/station/screens/market.js:659`, `ui/station/screens/market.js:679`, `ui/station/screens/shipworks.js:635`, `ui/station/screens/shipworks.js:1004`, `ui/station/screens/shipworks.js:1051`, `ui/station/screens/shipworks.js:1053`, `ui/station/screens/shipworks.js:1057`, `ui/station/screens/shipworks.js:1066`, `ui/station/screens/shipworks.js:1156`, `ui/station/screens/shipworks.js:1160`, `ui/station/screens/shipworks.js:1164`, `ui/station/stationApp.js:495`, `ui/station/stationApp.js:670`, `ui/uiRoot.js:800`, `ui/uiRoot.js:867`, `ui/wingmanRadial.js:77`, `ui/wingmanRadial.js:98`, `ui/wingmanRadial.js:120`, `ui/wingmanRadial.js:146`, `ui/wingmanRadial.js:163` | `audio/audioSystem.js:754` |
| `automation:assetDistressed` | `systems/automation.js:1427` | — |
| `automation:assetLost` | `systems/automation.js:1842` | `systems/intervention.js:37`, `systems/lossLedger.js:331`, `systems/missions.js:626` |
| `automation:assetRepossessed` | `systems/automation.js:1452` | — |
| `automation:incomeCredited` | `systems/automation.js:1480`, `systems/automation.js:2113` | — |
| `automation:offlineSummary` | `systems/automation.js:1880`, `systems/automation.js:1904`, `systems/automation.js:1928`, `systems/automation.js:1951`, `systems/automation.js:2160` | — |
| `automation:outpostRaided` | `systems/automation.js:1360`, `systems/automation.js:2235` | `systems/lossLedger.js:332` |
| `automation:programAssigned` | `systems/automation.js:1613` | `systems/missions.js:625` |
| `band:bearingReceipt` | `systems/bandRadio.js:504` | — |
| `band:bearingRequest` | `systems/bandRadio.js:477` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:533`, `systems/uniqueWrecks.js:576` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:540`, `systems/uniqueWrecks.js:548`, `systems/uniqueWrecks.js:562` | — |
| `band:bed` | `systems/bandRadio.js:561` | `audio/audioSystem.js:759` |
| `band:cycle` | `ui/bandHud.js:57`, `ui/input.js:182` | — |
| `band:status` | `systems/bandRadio.js:543` | `ui/bandHud.js:61` |
| `beacon:deploy` | — | `systems/beacons.js:35` |
| `beacon:deployed` | `systems/beacons.js:75` | — |
| `beam:denied` | `systems/mining.js:228`, `systems/mining.js:264`, `systems/mining.js:275`, `systems/mining.js:307` | — |
| `beam:repaired` | `systems/mining.js:368` | — |
| `beam:transferred` | `systems/mining.js:399` | — |
| `boss:defeated` | `systems/world.js:354` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:290` | — |
| `bulletTime:end` | `systems/bulletTime.js:110` | `audio/audioSystem.js:758` |
| `bulletTime:start` | `systems/bulletTime.js:94` | `audio/audioSystem.js:755`, `systems/onboarding.js:336` |
| `camera:kill` | `render/feel.js:639`, `render/feel.js:790` | `render/renderer.js:1407` |
| `camera:shake` | `render/vfx.js:2240`, `render/vfx.js:2929`, `systems/combat.js:347`, `systems/combat.js:420`, `systems/combat.js:445`, `systems/combat.js:481`, `systems/combat.js:579`, `systems/combat.js:657`, `systems/drill.js:972`, `systems/flybyFocus.js:407`, `systems/intervention.js:106`, `systems/presentationAdapters.js:425`, `systems/tetherGameplay.js:387` | `render/renderer.js:1398` |
| `camera:zoom` | `ui/input.js:310`, `ui/input.js:311`, `ui/input.js:504` | `render/renderer.js:1414` |
| `cargo:changed` | `systems/cargo.js:72`, `systems/mining.js:1151` | `systems/cargo.js:130`, `systems/ships.js:641`, `ui/cargoConscience.js:122`, `ui/commandBar.js:410`, `ui/hud.js:2991`, `ui/hud.js:3020`, `ui/hudMeta.js:183`, `ui/screens/manufacture.js:214`, `ui/screens/stationHub.js:2748`, `ui/screens/stationHub.js:2765`, `ui/screens/stationHub.js:2766`, `ui/screens/stationHub.js:2767` |
| `cargo:delivered` | `systems/missions.js:3411` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:93`, `systems/mining.js:509`, `systems/mining.js:823`, `systems/mining.js:1119` | `careers/origins/prospectorOrigin.js:640`, `systems/onboarding.js:242`, `systems/presentationOrchestrator.js:186`, `ui/alerts.js:290`, `ui/floatingText.js:160` |
| `cargo:jettison` | `ui/hud.js:2677` | `ui/hud.js:2928` |
| `cargo:jettisoned` | `systems/cargo.js:233` | `systems/jettisonImpulse.js:28`, `systems/onboarding.js:331` |
| `cargo:massSettled` | `systems/cargo.js:170` | `systems/presentationOrchestrator.js:185`, `systems/ships.js:642` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:72` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:299` | `systems/onboarding.js:346` |
| `charge:combo` | `systems/impulseCharges.js:341`, `systems/impulseCharges.js:444` | — |
| `charge:detonated` | `systems/impulseCharges.js:452` | `audio/audioSystem.js:703`, `render/feel.js:734`, `render/vfx.js:1132` |
| `charge:stuck` | `systems/impulseCharges.js:224` | — |
| `charge:thrown` | `systems/impulseCharges.js:295` | — |
| `claim:claimed` | `systems/claims.js:230` | `systems/onboarding.js:294`, `systems/story.js:156` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1104` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:184` |
| `claim:defenseResolved` | `systems/claims.js:1180` | — |
| `claim:defenseStarted` | `systems/claims.js:1109` | — |
| `claim:defenseWarning` | `systems/claims.js:1028` | — |
| `claim:infrastructureActive` | `systems/claims.js:755` | `systems/traffic.js:258` |
| `claim:infrastructureConstructed` | `systems/claims.js:297` | — |
| `claim:infrastructureStatus` | `systems/claims.js:766` | `systems/traffic.js:259` |
| `claim:moduleBuilt` | `systems/claims.js:315` | — |
| `claim:raidRepelled` | `systems/claims.js:980` | — |
| `claim:raidWarning` | `systems/claims.js:973` | — |
| `claim:receipt` | `systems/claims.js:1397` | — |
| `claim:sensorPostRumor` | `systems/claims.js:814` | `systems/world.js:240` |
| `claim:specialized` | `systems/claims.js:356` | — |
| `claim:teleportRequest` | `systems/claims.js:561` | — |
| `claims:migrated` | `systems/claims.js:1508` | — |
| `cloak:dropped` | `systems/cloak.js:117` | — |
| `cloak:engaged` | `systems/cloak.js:106` | `systems/onboarding.js:341` |
| `combat:actionCancelled` | `combat/actions.js:285` | — |
| `combat:actionCompleted` | `combat/actions.js:271` | — |
| `combat:actionPhase` | `combat/actions.js:157` | — |
| `combat:actionRejected` | `combat/actions.js:307` | — |
| `combat:actionStarted` | `combat/actions.js:127` | `systems/presentationOrchestrator.js:146`, `systems/scenarioRuntime.js:22` |
| `combat:baseDestroyed` | — | `systems/economy.js:486` |
| `combat:beamStop` | `systems/weapons.js:574` | `audio/audioSystem.js:653`, `render/vfx.js:1098` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:143` | `render/vfx.js:1106` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:145` | `render/vfx.js:1107` |
| `combat:damage` | `combat/damage.js:193` | `audio/audioSystem.js:657`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/feel.js:582`, `render/vfx.js:1100`, `save/saveSystem.js:127`, `systems/ai.js:89`, `systems/cruise.js:21`, `systems/encounterDirector.js:120`, `systems/factionPresence.js:162`, `systems/heat.js:151`, `systems/lawSecurity.js:52`, `systems/onboarding.js:212`, `systems/onboarding.js:219`, `systems/presentationOrchestrator.js:140`, `systems/scenarioRuntime.js:28`, `systems/stationBroadcast.js:152`, `systems/titles.js:371`, `ui/alerts.js:276`, `ui/commandBar.js:399`, `ui/floatingText.js:88`, `ui/floatingText.js:96`, `ui/hud.js:1074`, `ui/hud.js:1345` |
| `combat:fire` | `systems/weapons.js:553`, `systems/weapons.js:687`, `systems/weapons.js:818` | `audio/audioSystem.js:652`, `render/feel.js:652`, `render/vfx.js:1097`, `systems/cloak.js:37`, `systems/cruise.js:28`, `systems/onboarding.js:204`, `systems/presentationOrchestrator.js:145`, `ui/hud.js:3032` |
| `combat:hit` | `systems/salvageActions.js:182` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:417` |
| `combat:lockChanged` | — | `systems/world.js:230`, `ui/alerts.js:283` |
| `combat:outcome` | `systems/combatOutcome.js:164` | `systems/barkDirector.js:39` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:165` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:72` |
| `combat:requestAction` | — | `combat/kernel.js:70` |
| `combat:routeDamage` | `systems/drill.js:984`, `systems/impulseCharges.js:493`, `systems/mines.js:212` | `combat/kernel.js:71`, `systems/routeFollower.js:333` |
| `combat:statusApplied` | `combat/statuses.js:155` | — |
| `combat:statusExpired` | `combat/statuses.js:57` | — |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:104`, `systems/factionPresence.js:160`, `systems/presentationOrchestrator.js:201`, `systems/surrenderRecovery.js:36`, `systems/wingMorale.js:160` |
| `combat:subsystemEnabled` | — | `systems/factionPresence.js:161` |
| `combat:surrendered` | — | `systems/combatOutcome.js:105`, `systems/surrenderRecovery.js:35` |
| `combat:weakPointHit` | `systems/combat.js:401` | `ui/floatingText.js:100` |
| `comms:log` | `systems/encounterScripts.js:515`, `systems/salvage.js:215` | — |
| `comms:popup` | `systems/ai.js:459`, `systems/factionPresence.js:522`, `systems/factionPresence.js:543`, `systems/missions.js:3483`, `systems/missions.js:3516`, `systems/missions.js:3555`, `systems/missions.js:4188`, `systems/missions.js:4561`, `systems/scenarioRuntime.js:185`, `systems/story.js:363` | `audio/audioSystem.js:740`, `ui/comms.js:229`, `ui/screens/codex.js:308` |
| `conflict:flip` | `systems/factions.js:378` | `systems/sectorSim.js:109`, `systems/story.js:151` |
| `conflict:warDeclared` | `systems/factions.js:335` | — |
| `contactHail:availability` | `systems/scanner.js:1107`, `systems/scanner.js:1118` | — |
| `contactHail:choice` | `ui/contactHailPrompt.js:82` | `systems/scanner.js:717` |
| `contactHail:clear` | `systems/scanner.js:1129` | — |
| `contactHail:handoff` | `systems/scanner.js:1016` | — |
| `contactHail:offer` | `systems/scanner.js:1038` | — |
| `contactHail:request` | `ui/contactHailPrompt.js:76` | `systems/scanner.js:716` |
| `contactHail:response` | `systems/scanner.js:1067` | — |
| `contraband:bribe` | `systems/encounterScripts.js:345`, `ui/customsPrompt.js:174` | `systems/economy.js:482` |
| `contraband:scanned` | `systems/economy.js:1441` | `systems/encounterDirector.js:121`, `systems/factions.js:191`, `systems/heat.js:154`, `ui/customsPrompt.js:126` |
| `contract:clauseBroken` | `systems/contractClauses.js:351` | `systems/missions.js:605` |
| `contract:clauseHonored` | `systems/contractClauses.js:338`, `systems/missions.js:3569` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:185` | — |
| `craft:complete` | `systems/crafting.js:220`, `systems/crafting.js:257` | `ui/screens/manufacture.js:216`, `ui/station/screens/industry.js:171` |
| `craft:queueChanged` | `systems/crafting.js:122`, `systems/crafting.js:230`, `systems/crafting.js:259` | `systems/onboarding.js:300`, `ui/screens/manufacture.js:217`, `ui/station/screens/industry.js:171` |
| `credits:changed` | `systems/economy.js:1253`, `systems/economy.js:1264` | `audio/audioSystem.js:679`, `balance/hunterPublicRoute.js:466`, `ui/commandBar.js:411`, `ui/hud.js:3019`, `ui/screens/manufacture.js:215`, `ui/screens/stationHub.js:2746`, `ui/screens/stationHub.js:2768`, `ui/screens/stationHub.js:2769` |
| `cruise:charging` | `systems/cruise.js:88` | `render/vfx.js:1129`, `systems/presentationOrchestrator.js:150` |
| `cruise:dropped` | `systems/cruise.js:99` | `render/vfx.js:1131`, `systems/presentationOrchestrator.js:152` |
| `cruise:engaged` | `systems/cruise.js:64` | `render/vfx.js:1130`, `systems/presentationOrchestrator.js:151` |
| `cruise:snareRequest` | `systems/encounterScripts.js:422` | `systems/cruise.js:33` |
| `cruise:snared` | `systems/cruise.js:98` | `audio/audioSystem.js:734` |
| `customs:breakScan` | `ui/customsPrompt.js:178` | — |
| `customs:submit` | `ui/customsPrompt.js:170` | — |
| `danger:miningNoise` | `systems/mining.js:1163` | — |
| `day:tick` | `core/coreSystem.js:151` | `systems/custodyConsequences.js:30`, `systems/encounterDirector.js:112`, `systems/factions.js:207`, `systems/sectorSim.js:93` |
| `discovery:plateUnlocked` | `systems/world.js:2562`, `systems/world.js:2727` | `ui/screens/codex.js:310` |
| `distress:rescued` | `systems/encounterScripts.js:514` | `systems/factions.js:200` |
| `dock:attempt` | — | `ui/dockDenyBanner.js:100` |
| `dock:denied` | `ui/dockDenyBanner.js:125` | — |
| `dock:docked` | `balance/careerCohorts.js:487`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:78` | `audio/audioSystem.js:690`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:631`, `save/saveSystem.js:143`, `systems/aftermathWrecks.js:320`, `systems/autoTargetAssist.js:92`, `systems/combat.js:310`, `systems/economy.js:469`, `systems/economyContracts.js:158`, `systems/factionPresence.js:158`, `systems/mining.js:144`, `systems/missions.js:527`, `systems/onboarding.js:182`, `systems/onboarding.js:259`, `systems/scanner.js:720`, `systems/story.js:121`, `ui/alerts.js:267`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:133`, `ui/dockDenyBanner.js:101`, `ui/priceForecast.js:86`, `ui/securityReadout.js:158`, `ui/uiRoot.js:788`, `ui/wingmanRadial.js:181` |
| `dock:range` | `core/physics.js:650`, `core/physics.js:654` | `systems/onboarding.js:226`, `ui/alerts.js:263`, `ui/input.js:64` |
| `dock:undocked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:498`, `ui/station/stationApp.js:650` | `audio/audioSystem.js:691`, `save/saveSystem.js:144`, `systems/combat.js:314`, `systems/economy.js:472`, `systems/missions.js:546`, `systems/presentationAdapters.js:167`, `ui/input.js:71`, `ui/uiRoot.js:817` |
| `drill:break` | `systems/drill.js:883` | `systems/asteroidSites.js:153`, `systems/presentationOrchestrator.js:192`, `ui/asteroid/asteroidScreen.js:580`, `ui/screens/drill.js:1863` |
| `drill:cargoFull` | `systems/drill.js:932` | `ui/asteroid/asteroidScreen.js:569`, `ui/screens/drill.js:1833` |
| `drill:end` | `systems/drill.js:552` | `systems/asteroidSites.js:163`, `systems/presentationOrchestrator.js:195`, `ui/sectorLawPresenter.js:222` |
| `drill:gasHit` | `systems/drill.js:971` | `systems/presentationOrchestrator.js:194`, `ui/asteroid/asteroidScreen.js:556`, `ui/screens/drill.js:1773` |
| `drill:retry` | `systems/drill.js:603` | `systems/presentationOrchestrator.js:196` |
| `drill:rockDepleted` | `systems/drill.js:518`, `systems/drill.js:897`, `systems/drill.js:923` | `ui/asteroid/asteroidScreen.js:566`, `ui/screens/drill.js:1824` |
| `drill:scanPulse` | `systems/drill.js:676` | `systems/asteroidSites.js:180`, `systems/presentationOrchestrator.js:190`, `ui/asteroid/asteroidScreen.js:573`, `ui/screens/drill.js:1851` |
| `drill:spark` | `systems/drill.js:855` | `systems/presentationOrchestrator.js:191`, `ui/asteroid/asteroidScreen.js:585`, `ui/screens/drill.js:1884` |
| `drill:start` | `systems/drill.js:510` | `systems/asteroidSites.js:146`, `systems/onboarding.js:265`, `systems/presentationOrchestrator.js:189`, `ui/sectorLawPresenter.js:221` |
| `drill:warn` | `systems/drill.js:524`, `systems/drill.js:529`, `systems/drill.js:777`, `systems/drill.js:809`, `systems/drill.js:828`, `systems/drill.js:904`, `systems/drill.js:935`, `systems/drill.js:942` | `systems/presentationOrchestrator.js:188`, `ui/asteroid/asteroidScreen.js:562`, `ui/screens/drill.js:1801` |
| `drill:yield` | `systems/drill.js:921` | `systems/presentationOrchestrator.js:193`, `ui/asteroid/asteroidScreen.js:548`, `ui/screens/drill.js:1752` |
| `economy:applyTradePressure` | `systems/automation.js:655`, `systems/automation.js:1211`, `systems/automation.js:1212`, `systems/claims.js:893`, `systems/encounterDirector.js:1003`, `systems/sectorSim.js:375`, `systems/traffic.js:1605` | `systems/economy.js:463` |
| `economy:chargeCredits` | `systems/automation.js:1382`, `systems/automation.js:1389`, `systems/automation.js:2123`, `systems/automation.js:2347`, `systems/beacons.js:61`, `systems/claims.js:210`, `systems/claims.js:280`, `systems/claims.js:351`, `systems/claims.js:933`, `systems/combat.js:561`, `systems/encounterDirector.js:997`, `systems/gateControlDirector.js:119`, `systems/mining.js:354`, `systems/missions.js:1819`, `systems/missions.js:1822`, `systems/pirateParley.js:507`, `systems/ships.js:822`, `systems/ships.js:889`, `systems/ships.js:945`, `systems/world.js:1884`, `systems/world.js:1928`, `systems/world.js:2287` | `systems/economy.js:434` |
| `economy:eventEnded` | `systems/economy.js:1523` | `ui/floatingText.js:176`, `ui/screens/stationHub.js:2808` |
| `economy:eventStarted` | `systems/economy.js:1498` | `ui/floatingText.js:165`, `ui/screens/market.js:741`, `ui/screens/stationHub.js:2807` |
| `economy:grantCredits` | `systems/automation.js:1476`, `systems/automation.js:2109`, `systems/claims.js:892`, `systems/claims.js:1494`, `systems/combat.js:448`, `systems/combat.js:453`, `systems/combat.js:642`, `systems/encounterDirector.js:998`, `systems/mining.js:1069`, `systems/missions.js:3577`, `systems/missions.js:3580`, `systems/missions.js:4487`, `systems/moralTrap.js:133`, `systems/ships.js:974`, `systems/survivorPod.js:368`, `systems/uniqueWrecks.js:1349` | `systems/economy.js:433`, `systems/story.js:149` |
| `economy:marketOpened` | `ui/screens/market.js:1816`, `ui/station/screens/market.js:698` | `systems/economy.js:439`, `ui/priceHistory.js:118` |
| `economy:tick` | `systems/economy.js:572` | `ui/priceHistory.js:93`, `ui/screens/stationHub.js:2764` |
| `economy:trade` | — | `careers/origins/haulerOriginSystem.js:87` |
| `economy:tradeCompleted` | `systems/economy.js:1111` | `audio/audioSystem.js:680`, `careers/origins/prospectorOrigin.js:649`, `save/saveSystem.js:151`, `systems/factions.js:170`, `systems/missions.js:554`, `systems/onboarding.js:183`, `systems/sectorSim.js:104`, `systems/story.js:145`, `ui/screens/market.js:721`, `ui/screens/stationHub.js:2750`, `ui/screens/stationHub.js:2762`, `ui/screens/stationHub.js:2763` |
| `economy:tradeFailed` | `systems/economy.js:1189`, `systems/economy.js:1207` | `ui/screens/market.js:732` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:867` | `ui/encounterChoicePrompt.js:143` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:106` | `systems/encounterDirector.js:133` |
| `encounter:fingerprint` | `systems/encounterDirector.js:945` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:4064` | `systems/encounterDirector.js:119` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1046` | — |
| `encounter:receipt` | `systems/encounterDirector.js:958` | — |
| `encounter:resolved` | `systems/encounterDirector.js:940`, `systems/encounterDirector.js:983` | `audio/audioSystem.js:695`, `systems/aftermathWrecks.js:319`, `systems/claims.js:183`, `systems/terrainAnchors.js:44`, `systems/uniqueLootAbilities.js:114`, `ui/encounterChoicePrompt.js:144` |
| `encounter:spawned` | `systems/encounterDirector.js:554` | `systems/uniqueLootAbilities.js:113` |
| `encounter:telegraph` | `systems/encounterDirector.js:539` | `audio/audioSystem.js:694`, `systems/terrainAnchors.js:43`, `systems/world.js:243` |
| `encounter:voice` | `systems/encounterDirector.js:851` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:383` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:342` | — |
| `endgame:chosen` | `systems/story.js:848` | `ui/screens/missionLog.js:1886` |
| `endgame:confirmRequired` | `systems/story.js:737` | `ui/comms.js:416`, `ui/screens/missionLog.js:1885` |
| `endgame:eligibility` | `systems/story.js:589` | `ui/comms.js:429`, `ui/screens/missionLog.js:1884` |
| `endgame:ineligible` | `systems/story.js:640`, `systems/story.js:717`, `systems/story.js:782` | `ui/comms.js:424` |
| `endgame:loopBack` | — | `systems/story.js:140` |
| `endgame:promptChoiceC` | `systems/story.js:702` | `ui/comms.js:393` |
| `endgame:promptChoiceD` | `systems/story.js:666` | `ui/comms.js:399` |
| `endgame:promptSandbox` | `systems/story.js:600` | `ui/comms.js:408` |
| `endgame:sandboxContinued` | `systems/story.js:842` | `ui/screens/missionLog.js:1887` |
| `entity:destroyed` | `main.js:307`, `main.js:425`, `save/saveSystem.js:2462`, `systems/wingmen.js:133`, `systems/world.js:991` | `audio/audioSystem.js:671`, `combat/kernel.js:65`, `render/renderer.js:1378`, `render/vfx.js:1109`, `systems/ai.js:101`, `systems/encounterDirector.js:117`, `systems/gateControlDirector.js:68`, `systems/heistFacilities.js:161`, `systems/missions.js:566`, `systems/npcJobsRuntime.js:151`, `systems/presentationOrchestrator.js:149`, `systems/stationSideEventDirector.js:55`, `ui/prompts/bulkHaulTag.js:148`, `ui/radar.js:510` |
| `entity:kill` | — | `core/coreSystem.js:103` |
| `entity:killed` | `balance/careerCohorts.js:456`, `combat/damage.js:316`, `combat/kernel.js:44`, `systems/combat.js:436` | `audio/audioSystem.js:670`, `render/feel.js:615`, `render/vfx.js:1108`, `systems/aftermathWrecks.js:315`, `systems/ai.js:102`, `systems/combatOutcome.js:102`, `systems/encounterDirector.js:118`, `systems/factions.js:148`, `systems/heat.js:147`, `systems/lootShards.js:32`, `systems/lossLedger.js:334`, `systems/mining.js:139`, `systems/missions.js:564`, `systems/npcJobsRuntime.js:146`, `systems/presentationOrchestrator.js:148`, `systems/sectorSim.js:108`, `systems/titles.js:372`, `systems/traffic.js:244`, `systems/wingMorale.js:159`, `systems/world.js:246`, `ui/floatingText.js:97`, `ui/floatingText.js:126`, `ui/galaxyMap.js:5437` |
| `entity:spawnRequest` | — | `core/coreSystem.js:107` |
| `entity:spawned` | `core/coreSystem.js:59` | `combat/kernel.js:60`, `render/renderer.js:1376`, `render/vfx.js:1110`, `systems/factionPresence.js:164`, `systems/lawSecurity.js:53`, `systems/lossLedger.js:333`, `systems/npcJobsRuntime.js:144`, `systems/salvageActions.js:69`, `systems/titles.js:373`, `systems/uniqueLootAbilities.js:116`, `ui/radar.js:509` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:166` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:226`, `systems/factions.js:241`, `systems/factions.js:272`, `systems/factions.js:459` | `systems/heat.js:159` |
| `faction:repChanged` | `systems/factions.js:238`, `systems/factions.js:267`, `systems/factions.js:455` | `ui/floatingText.js:153`, `ui/screens/stationHub.js:2789`, `ui/station/screens/factions.js:337` |
| `faction:repDelta` | `balance/careerCohorts.js:255`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:1168`, `systems/economy.js:1440`, `systems/encounterDirector.js:999`, `systems/missions.js:3678`, `systems/missions.js:3717`, `systems/missions.js:4440`, `systems/missions.js:4442`, `systems/missions.js:4492`, `systems/moralTrap.js:128`, `systems/moralTrap.js:135`, `systems/survivorPod.js:374`, `systems/uniqueWrecks.js:1353` | `systems/factions.js:142` |
| `faction:repSpillover` | `systems/factions.js:265` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:114`, `systems/e1EncounterRuntime.js:118`, `systems/e1EncounterRuntime.js:128` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:762` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:526` | `systems/story.js:163` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:674` | `ui/uiRoot.js:189` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:405` | — |
| `factionPresence:service` | `systems/factionPresence.js:475` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:551` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:273` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:268` | `systems/world.js:234` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:267` | `systems/presentationOrchestrator.js:187` |
| `fields:cleared` | `systems/fields.js:378` | — |
| `fields:coneToggled` | `systems/fields.js:289`, `systems/fields.js:296` | — |
| `fields:deployDenied` | `systems/fields.js:189` | — |
| `fields:deployed` | `systems/fields.js:260` | — |
| `fields:ended` | `systems/fields.js:362` | — |
| `flight:modeChanged` | `systems/flightV3.js:465` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:273` |
| `flybyFocus:end` | `systems/flybyFocus.js:312` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:390` | `systems/onboarding.js:201` |
| `formation:discovered` | `systems/asteroidFormations.js:235` | — |
| `freight:arrival` | `systems/traffic.js:1407` | — |
| `freight:loss` | `systems/traffic.js:1617` | — |
| `frontierRumor:acquired` | `systems/world.js:1947` | — |
| `frontierRumor:resolved` | `systems/world.js:1964` | — |
| `fuel:changed` | `systems/economy.js:1286`, `systems/world.js:2612`, `systems/world.js:2620` | `ui/screens/stationHub.js:2747`, `ui/screens/stationHub.js:2782`, `ui/screens/stationHub.js:2783`, `ui/screens/stationHub.js:2784`, `ui/screens/stationHub.js:2785` |
| `fuel:empty` | `systems/world.js:2613` | `audio/audioSystem.js:712`, `ui/alerts.js:291` |
| `game:load` | `ui/input.js:171`, `ui/input.js:307`, `ui/screens/mainMenu.js:253`, `ui/screens/saveLoad.js:305` | `save/saveSystem.js:111`, `systems/scanner.js:719`, `ui/commandBar.js:428`, `ui/encounterChoicePrompt.js:147`, `ui/pirateParleyPrompt.js:250`, `ui/recoveryEncounterPrompt.js:260`, `ui/sectorLawPresenter.js:227`, `ui/signalInvestigationPrompt.js:186` |
| `game:loadingProgress` | `main.js:127`, `main.js:145`, `main.js:392`, `main.js:450`, `main.js:462`, `main.js:478`, `main.js:503`, `main.js:521` | `ui/loadingPresenter.js:46` |
| `game:new` | `ui/screens/gameOver.js:261`, `ui/screens/newGame.js:425` | `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:113`, `main.js:179`, `render/feel.js:576`, `save/saveSystem.js:139`, `systems/environmentalMachinery.js:46`, `systems/fields.js:129`, `systems/massSeed.js:120`, `systems/masslineSnares.js:100`, `systems/mines.js:37`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:208`, `systems/scanner.js:718`, `systems/tetherGameplay.js:106`, `ui/commandBar.js:427`, `ui/encounterChoicePrompt.js:146`, `ui/hudLayout.js:121`, `ui/pirateParleyPrompt.js:249`, `ui/priceHistory.js:119`, `ui/recoveryEncounterPrompt.js:259`, `ui/sectorLawPresenter.js:226`, `ui/signalInvestigationPrompt.js:185` |
| `game:newGame` | — | `core/coreSystem.js:114`, `save/saveSystem.js:140`, `systems/aftermathWrecks.js:326`, `systems/collisionConsequences.js:42`, `systems/fieldDepletion.js:188`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:335`, `systems/survivorPod.js:152`, `systems/titles.js:375`, `systems/wingMorale.js:161` |
| `game:over` | `systems/combat.js:421`, `systems/combat.js:482` | `ui/uiRoot.js:933` |
| `game:save` | `ui/input.js:170`, `ui/input.js:305`, `ui/screens/saveLoad.js:291` | `save/saveSystem.js:110` |
| `game:startFailed` | `main.js:593` | `ui/loadingPresenter.js:54`, `ui/screens/newGame.js:410` |
| `game:started` | `main.js:401` | `audio/audioSystem.js:795`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:115`, `render/renderer.js:1415`, `save/saveSystem.js:136`, `systems/automation.js:437`, `systems/combat.js:321`, `systems/economyContracts.js:160`, `systems/factions.js:139`, `systems/flight.js:78`, `systems/flightV3.js:135`, `systems/masslineSnares.js:101`, `systems/missions.js:513`, `systems/onboarding.js:169`, `systems/onboarding.js:355`, `systems/presentationAdapters.js:165`, `systems/presentationOrchestrator.js:209`, `systems/sectorSim.js:99`, `systems/story.js:109`, `systems/tacticalAI.js:113`, `systems/tetherGameplay.js:107`, `ui/commandBar.js:426`, `ui/radar.js:511`, `ui/sectorLawPresenter.js:216`, `ui/uiRoot.js:924`, `ui/uiRoot.js:949` |
| `gamepad:connected` | `systems/gamepad.js:177` | `ui/uiRoot.js:415` |
| `gamepad:disconnected` | `systems/gamepad.js:162` | `ui/uiRoot.js:416` |
| `gate:range` | `core/physics.js:660`, `core/physics.js:664` | `systems/onboarding.js:234`, `systems/presentationOrchestrator.js:153`, `ui/alerts.js:269` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:96`, `systems/e1EncounterRuntime.js:157`, `systems/e1EncounterRuntime.js:186`, `systems/e1EncounterRuntime.js:550`, `systems/story.js:439`, `systems/story.js:453`, `systems/story.js:1021`, `systems/story.js:1305`, `systems/story.js:1396`, `systems/uniqueWrecks.js:1359` | `ui/comms.js:322`, `ui/screens/codex.js:309` |
| `hazard:enter` | `systems/environmentalMachinery.js:146`, `systems/world.js:2590` | `data/hazardLanguage.js:105` |
| `hazard:exit` | `systems/environmentalMachinery.js:152`, `systems/environmentalMachinery.js:179`, `systems/world.js:2600` | `data/hazardLanguage.js:106` |
| `heat:changed` | `systems/heat.js:364` | `ui/hud.js:3041` |
| `heat:clear` | — | `systems/heat.js:162` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:496` | `systems/missions.js:582` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:591` | `systems/missions.js:587` |
| `heist:launchCue` | `systems/heistFacilities.js:243` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:282`, `systems/heistFacilities.js:291`, `systems/heistFacilities.js:295`, `systems/heistFacilities.js:308` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:790` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:745` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:726` | — |
| `heist:receiverPrepared` | `systems/heistFacilities.js:681` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:163` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:155` |
| `hud:phase` | `systems/story.js:205`, `systems/story.js:235`, `systems/story.js:238`, `systems/story.js:523` | `ui/hudMeta.js:133` |
| `hud:tagFlicker` | `systems/story.js:500` | `ui/hudMeta.js:167` |
| `interdiction:triggered` | `systems/encounterScripts.js:423`, `systems/world.js:2173` | `systems/presentationOrchestrator.js:161`, `systems/sectorSim.js:105` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:2135` | `render/feel.js:686`, `render/renderer.js:1549`, `save/saveSystem.js:146`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:159`, `systems/sectorSim.js:114` |
| `jump:chargeAbort` | `systems/world.js:2250`, `systems/world.js:2314`, `systems/world.js:2371` | `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:158`, `systems/routeFollower.js:324` |
| `jump:chargeStart` | `systems/world.js:2299`, `systems/world.js:2338` | `render/feel.js:676`, `systems/gateControlDirector.js:64`, `systems/presentationOrchestrator.js:155`, `systems/story.js:127` |
| `jump:chargeTick` | `systems/world.js:2086` | `systems/presentationOrchestrator.js:156` |
| `jump:departurePreflight` | `systems/world.js:2283` | `systems/story.js:126` |
| `jump:start` | `systems/world.js:2097` | `render/feel.js:680`, `systems/economy.js:480`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:157`, `systems/sectorSim.js:113` |
| `jump:unfiledConfirmed` | `systems/world.js:2355` | `systems/story.js:128` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:29` |
| `law:dispatchStarted` | — | `ui/sectorLawPresenter.js:218` |
| `law:distressRaised` | — | `ui/recoveryEncounterPrompt.js:257`, `ui/sectorLawPresenter.js:217`, `ui/signalInvestigationPrompt.js:184` |
| `law:incidentReceipt` | — | `ui/sectorLawPresenter.js:220` |
| `law:incidentResolved` | — | `ui/recoveryEncounterPrompt.js:258`, `ui/sectorLawPresenter.js:219` |
| `law:reportIncidentReceipt` | — | `systems/heat.js:171` |
| `loot:drop` | `systems/combat.js:455`, `systems/lootShards.js:66` | `systems/mining.js:141`, `ui/floatingText.js:121` |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:297` | `systems/factionPresence.js:159` |
| `map:sectorCharted` | `systems/world.js:1888` | `systems/economy.js:444` |
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
| `massline:bridleCut` | `systems/tetherGameplay.js:610` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:555`, `systems/tetherGameplay.js:571`, `systems/tetherGameplay.js:710` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:475` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:529` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:620` | — |
| `massline:releaseValidated` | `systems/masslineThrow.js:441` | — |
| `massline:selfSling` | `systems/masslineThrow.js:514` | `render/renderer.js:1413`, `systems/flightV3.js:137`, `systems/onboarding.js:326` |
| `massline:snareArmed` | `systems/masslineSnares.js:191` | — |
| `massline:snareCaught` | `systems/masslineSnares.js:386` | — |
| `massline:snareCut` | `systems/masslineSnares.js:427` | — |
| `massline:snareDeployed` | `systems/masslineSnares.js:293` | — |
| `massline:snareEnded` | `systems/masslineSnares.js:429` | — |
| `massline:sweepImpact` | `systems/masslineImpacts.js:330` | `systems/masslineImpactDamage.js:42`, `systems/presentationOrchestrator.js:127` |
| `massline:threat` | `systems/masslineThreats.js:165` | `systems/presentationOrchestrator.js:103` |
| `massline:throw` | `systems/masslineThrow.js:388` | `systems/tumbleStates.js:66` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:100` | — |
| `massline:tumbled` | `systems/tumbleStates.js:181` | — |
| `mines:armed` | `systems/mines.js:134` | — |
| `mines:capReached` | `systems/mines.js:53` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:82` | `systems/mines.js:34` |
| `mines:placed` | `systems/mines.js:108` | — |
| `mines:released` | `systems/mines.js:226` | — |
| `mines:triggered` | `systems/mines.js:192` | — |
| `mining:beamCooled` | `systems/mining.js:467` | — |
| `mining:beamLocked` | `systems/mining.js:601` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:1070` | `systems/missions.js:562`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:615` | `systems/presentationOrchestrator.js:183`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:473` | — |
| `mining:npcExtraction` | `systems/traffic.js:1497` | `systems/fieldDepletion.js:187` |
| `mining:overheated` | `systems/mining.js:459` | `systems/presentationOrchestrator.js:176` |
| `mining:richCoreChargeStart` | `systems/mining.js:1023` | `systems/presentationOrchestrator.js:180` |
| `mining:richCoreCompleted` | `systems/mining.js:1050` | `systems/presentationOrchestrator.js:181` |
| `mining:richCoreExposed` | `systems/mining.js:1001` | `systems/presentationOrchestrator.js:179` |
| `mining:richCoreFizzle` | `systems/mining.js:1052` | `systems/presentationOrchestrator.js:182` |
| `mining:seamHit` | `systems/mining.js:1231` | `systems/presentationOrchestrator.js:170` |
| `mining:start` | `systems/mining.js:215`, `systems/mining.js:317` | `audio/audioSystem.js:674`, `render/vfx.js:1120`, `systems/onboarding.js:186`, `systems/presentationOrchestrator.js:167` |
| `mining:stop` | `systems/mining.js:412` | `audio/audioSystem.js:675`, `render/vfx.js:1121`, `systems/presentationOrchestrator.js:168` |
| `mining:tick` | `systems/automation.js:638`, `systems/automation.js:769`, `systems/mining.js:636` | `audio/audioSystem.js:676`, `render/vfx.js:1122`, `systems/presentationOrchestrator.js:169` |
| `mining:ventBonus` | `systems/mining.js:510` | — |
| `mining:ventReady` | `systems/mining.js:439` | `systems/presentationOrchestrator.js:175` |
| `mining:yield` | `balance/careerCohorts.js:1805`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:507`, `systems/mining.js:700`, `systems/mining.js:884`, `systems/mining.js:1047` | `careers/origins/prospectorOrigin.js:637`, `render/feel.js:699`, `render/vfx.js:1123`, `systems/encounterDirector.js:135`, `systems/missions.js:556`, `systems/onboarding.js:187`, `systems/presentationOrchestrator.js:177`, `ui/floatingText.js:106` |
| `miningDrone:sellOre` | — | `systems/economy.js:459` |
| `mission:abandoned` | — | `careers/origins/haulerOriginSystem.js:72`, `ui/hud.js:3025` |
| `mission:accepted` | `systems/missions.js:1851` | `audio/audioSystem.js:684`, `save/saveSystem.js:147`, `systems/aftermathWrecks.js:322`, `systems/contractClauses.js:196`, `systems/onboarding.js:189`, `ui/hud.js:3023`, `ui/screens/missionLog.js:1869`, `ui/screens/stationHub.js:2797` |
| `mission:completed` | `systems/missions.js:3648` | `audio/audioSystem.js:685`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:148`, `systems/aftermathWrecks.js:323`, `systems/contractClauses.js:200`, `systems/factions.js:179`, `systems/onboarding.js:190`, `systems/story.js:144`, `ui/hud.js:3024`, `ui/screens/missionLog.js:1870`, `ui/screens/stationHub.js:2804` |
| `mission:conditionBroken` | `systems/contractClauses.js:306`, `systems/missions.js:779` | — |
| `mission:conditionPending` | `systems/missions.js:831` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:274`, `systems/missions.js:762` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:285`, `systems/missions.js:770` | `systems/missions.js:608` |
| `mission:expired` | `systems/missions.js:3730` | `audio/audioSystem.js:689`, `save/saveSystem.js:150`, `systems/aftermathWrecks.js:325`, `systems/factions.js:188`, `ui/screens/missionLog.js:1872`, `ui/screens/stationHub.js:2806` |
| `mission:failed` | `systems/missions.js:3696` | `audio/audioSystem.js:688`, `careers/origins/haulerOriginSystem.js:71`, `save/saveSystem.js:149`, `systems/aftermathWrecks.js:324`, `systems/factions.js:187`, `ui/screens/missionLog.js:1871`, `ui/screens/stationHub.js:2805` |
| `mission:forceEvent` | — | `systems/economy.js:485` |
| `mission:offerBoarded` | `systems/missions.js:1310` | `systems/aftermathWrecks.js:321` |
| `mission:offered` | `systems/aftermathWrecks.js:355`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:403`, `systems/economyContracts.js:221`, `systems/economyContracts.js:242`, `systems/lossLedger.js:273`, `systems/postEndingReplay.js:340`, `systems/salvage.js:223`, `systems/uniqueWrecks.js:715` | `systems/lossInvestigation.js:106`, `systems/missions.js:524`, `systems/survivorPod.js:150` |
| `mission:setPieceTransition` | `systems/missions.js:3503` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:4194` | — |
| `mission:updated` | `systems/contractClauses.js:279`, `systems/contractClauses.js:289`, `systems/contractClauses.js:318`, `systems/missions.js:766`, `systems/missions.js:774`, `systems/missions.js:791`, `systems/missions.js:861`, `systems/missions.js:915`, `systems/missions.js:1016`, `systems/missions.js:1068`, `systems/missions.js:1199`, `systems/missions.js:1233`, `systems/missions.js:1245`, `systems/missions.js:1309`, `systems/missions.js:1779`, `systems/missions.js:1863`, `systems/missions.js:2005`, `systems/missions.js:2173`, `systems/missions.js:2640`, `systems/missions.js:2676`, `systems/missions.js:2689`, `systems/missions.js:2697`, `systems/missions.js:2713`, `systems/missions.js:2753`, `systems/missions.js:2796`, `systems/missions.js:2805`, `systems/missions.js:2826`, `systems/missions.js:2852`, `systems/missions.js:2920`, `systems/missions.js:2936`, `systems/missions.js:2978`, `systems/missions.js:2999`, `systems/missions.js:3035`, `systems/missions.js:3085`, `systems/missions.js:3332`, `systems/missions.js:3362`, `systems/missions.js:3369`, `systems/missions.js:3637`, `systems/missions.js:3707`, `systems/missions.js:3740`, `systems/missions.js:3993`, `systems/missions.js:4095`, `systems/missions.js:4265`, `systems/missions.js:4521`, `systems/missions.js:4667` | `ui/hud.js:3022`, `ui/screens/missionLog.js:1868`, `ui/screens/stationHub.js:2791`, `ui/station/screens/contracts.js:484` |
| `mode:changed` | `main.js:570`, `main.js:580`, `main.js:591`, `save/saveSystem.js:2231` | `render/renderer.js:1538`, `systems/autoTargetAssist.js:87`, `systems/presentationAdapters.js:164`, `systems/scanner.js:721`, `ui/comms.js:480`, `ui/loadingPresenter.js:47`, `ui/screenManager.js:394`, `ui/uiRoot.js:516`, `ui/wingmanRadial.js:180` |
| `module:equipped` | `systems/ships.js:1096` | `systems/ships.js:638`, `systems/world.js:231`, `ui/screens/stationHub.js:2777` |
| `module:granted` | `systems/ships.js:903` | — |
| `module:purchased` | `systems/ships.js:890` | `ui/screens/stationHub.js:2779` |
| `module:unequipped` | `systems/ships.js:1115` | `systems/ships.js:639`, `systems/world.js:232`, `ui/screens/stationHub.js:2778` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:127` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:413` | — |
| `moralTrap:choose` | — | `systems/moralTrap.js:73` |
| `moralTrap:resolved` | `systems/moralTrap.js:118` | — |
| `moralTrap:revealed` | `systems/moralTrap.js:91` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:829` | — |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:738`, `systems/world.js:2416` | `systems/routeFollower.js:319` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:2440`, `systems/claims.js:1207`, `systems/claims.js:1215`, `systems/missions.js:537`, `systems/missions.js:2162`, `systems/missions.js:2229`, `systems/missions.js:2261`, `systems/missions.js:2658`, `systems/world.js:2415`, `ui/screens/market.js:1893` | `ui/screens/stationHub.js:2786`, `ui/screens/stationHub.js:2787` |
| `news:dockCards` | `ui/marketNews.js:222` | — |
| `news:headline` | `systems/aftermathWrecks.js:233`, `systems/e1EncounterRuntime.js:213`, `systems/traffic.js:1619`, `ui/marketNews.js:189` | — |
| `news:publish` | `systems/uniqueWrecks.js:337`, `systems/uniqueWrecks.js:1403` | — |
| `npcjobs:unload` | — | `systems/traffic.js:249` |
| `npcjobs:work` | — | `systems/traffic.js:248` |
| `patrol:proximity` | `systems/encounterScripts.js:357` | `systems/economy.js:481` |
| `physics:attachmentBroken` | — | `combat/kernel.js:69` |
| `physics:impact` | `core/physics.js:1046` | `systems/asteroidSites.js:215`, `systems/collisionConsequences.js:40`, `systems/fragileCargo.js:202`, `systems/heistFacilities.js:162`, `systems/masslineImpactDamage.js:43` |
| `pickup:collected` | `core/physics.js:954`, `systems/mining.js:804`, `systems/uniqueWrecks.js:1284` | `audio/audioSystem.js:678`, `render/vfx.js:1139`, `systems/cargo.js:133`, `systems/mining.js:143`, `systems/onboarding.js:188`, `systems/presentationOrchestrator.js:184`, `ui/floatingText.js:136` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:188` | `systems/pirateParley.js:41` |
| `pirateParley:demand` | `systems/scanner.js:1022` | `ui/pirateParleyPrompt.js:247`, `ui/recoveryEncounterPrompt.js:255`, `ui/sectorLawPresenter.js:223`, `ui/signalInvestigationPrompt.js:183` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:248`, `ui/recoveryEncounterPrompt.js:256` |
| `planet:collector` | `systems/planetRuntime.js:462` | — |
| `planet:harvest` | `systems/planetRuntime.js:495` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:499` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:369`, `systems/planetRuntime.js:381` | — |
| `planet:recoveryBurn` | `systems/planetRuntime.js:447` | — |
| `planet:registered` | `systems/planetRuntime.js:188` | — |
| `planet:unregistered` | `systems/planetRuntime.js:218` | — |
| `player:death` | `systems/combat.js:419`, `systems/combat.js:480`, `systems/combat.js:637` | `audio/audioSystem.js:672`, `render/feel.js:643`, `render/vfx.js:1119`, `save/saveSystem.js:122`, `ui/commandBar.js:403`, `ui/hud.js:1560` |
| `player:recoveryFailed` | `systems/combat.js:519` | `ui/screens/gameOver.js:295` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:232` | `systems/combat.js:315` |
| `player:respawn` | `systems/combat.js:578`, `systems/combat.js:650` | `audio/audioSystem.js:673`, `render/renderer.js:1417`, `save/saveSystem.js:123`, `save/saveSystem.js:156`, `ui/commandBar.js:407`, `ui/hud.js:1574`, `ui/screens/gameOver.js:287` |
| `player:scannedByPatrol` | `systems/economy.js:1393` | `systems/missions.js:602`, `ui/customsPrompt.js:125` |
| `poi:discovered` | `systems/world.js:2520`, `systems/world.js:2547`, `systems/world.js:2706` | `systems/encounterDirector.js:129`, `systems/world.js:241` |
| `poi:identified` | `systems/world.js:2554` | `systems/encounterDirector.js:130`, `systems/world.js:242` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:1891` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:1890` |
| `presentation:audioCue` | `systems/presentationAdapters.js:477` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:424` | — |
| `presentation:caption` | `systems/factionPresence.js:331`, `systems/factionPresence.js:631`, `systems/factionPresence.js:646`, `systems/factionPresence.js:664`, `systems/factionPresence.js:726`, `systems/presentationAdapters.js:569`, `systems/story.js:918`, `systems/story.js:964` | `ui/hud.js:1625` |
| `presentation:cue` | — | `audio/audioSystem.js:742`, `render/vfx.js:1136`, `render/vfx.js:1137`, `systems/presentationAdapters.js:161` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:406` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:333`, `systems/presentationAdapters.js:548` | — |
| `presentation:vfxCue` | `render/vfx.js:1148`, `systems/fields.js:548`, `systems/fields.js:564`, `systems/impulseCharges.js:453`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:390`, `systems/missions.js:1876`, `systems/missions.js:3653`, `systems/planetRuntime.js:519`, `systems/presentationAdapters.js:451`, `systems/tumbleStates.js:186`, `systems/weapons.js:908`, `systems/weapons.js:942` | `render/vfx.js:1138` |
| `projectile:hit` | `core/physics.js:525`, `core/physics.js:563`, `systems/sectorSim.js:548` | `audio/audioSystem.js:656`, `render/vfx.js:1099`, `systems/combat.js:308` |
| `projectile:nearMiss` | `core/physics.js:541` | `systems/presentationOrchestrator.js:147` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:210` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:252` |
| `recovery:started` | — | `ui/sectorLawPresenter.js:225`, `ui/signalInvestigationPrompt.js:182` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:209` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:155` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:156` |
| `research:pointsChanged` | `systems/missions.js:3611` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:272` | — |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:224` | `systems/encounterDirector.js:131`, `systems/story.js:166` |
| `salvage:completed` | `systems/mining.js:890` | `systems/aftermathWrecks.js:318`, `systems/missions.js:560` |
| `salvage:cutComplete` | `systems/mining.js:345` | — |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:338` | — |
| `salvage:placed` | `systems/salvage.js:119` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:148` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:726` | — |
| `save:completed` | `save/saveSystem.js:732` | `ui/uiRoot.js:249` |
| `save:error` | `main.js:136`, `save/saveSystem.js:469`, `save/saveSystem.js:524`, `save/saveSystem.js:538`, `save/saveSystem.js:735`, `save/saveSystem.js:967`, `save/saveSystem.js:1256`, `save/saveSystem.js:1946`, `save/saveSystem.js:1951`, `save/saveSystem.js:1981`, `save/saveSystem.js:1989`, `save/saveSystem.js:2000`, `save/saveSystem.js:2045`, `save/saveSystem.js:2063`, `save/saveSystem.js:2248`, `save/saveSystem.js:2256`, `save/saveSystem.js:2283`, `save/saveSystem.js:2618`, `save/saveSystem.js:2631`, `save/saveSystem.js:2645` | `systems/asteroidSites.js:214`, `systems/automation.js:432`, `ui/loadingPresenter.js:55`, `ui/screenManager.js:395`, `ui/uiRoot.js:271` |
| `save:exportRecovery` | `save/saveSystem.js:2607` | — |
| `save:loaded` | `save/saveSystem.js:2234` | `audio/audioSystem.js:789`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:112`, `core/physics.js:62`, `main.js:173`, `render/feel.js:578`, `render/renderer.js:1416`, `render/renderer.js:1557`, `render/vfx.js:1114`, `save/saveSystem.js:135`, `systems/aftermathWrecks.js:327`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:205`, `systems/automation.js:427`, `systems/beacons.js:37`, `systems/collisionConsequences.js:41`, `systems/combat.js:322`, `systems/economy.js:489`, `systems/encounterDirector.js:115`, `systems/environmentalMachinery.js:48`, `systems/factionPresence.js:165`, `systems/fields.js:130`, `systems/flight.js:74`, `systems/flightV3.js:128`, `systems/gateControlDirector.js:70`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:102`, `systems/mines.js:38`, `systems/missions.js:515`, `systems/onboarding.js:173`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:168`, `systems/presentationOrchestrator.js:210`, `systems/routeFollower.js:336`, `systems/sectorSim.js:98`, `systems/ships.js:643`, `systems/spawnBudget.js:49`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:57`, `systems/story.js:110`, `systems/survivorPod.js:153`, `systems/tacticalAI.js:114`, `systems/tetherGameplay.js:105`, `systems/titles.js:374`, `systems/traffic.js:250`, `systems/travelLanes.js:288`, `systems/uniqueLootAbilities.js:117`, `ui/bandHud.js:62`, `ui/hudLayout.js:120`, `ui/priceHistory.js:120`, `ui/radar.js:512`, `ui/uiRoot.js:256`, `ui/uiRoot.js:950` |
| `save:recovered` | `save/saveSystem.js:1970` | `ui/uiRoot.js:264` |
| `save:restoring` | `save/saveSystem.js:2085` | `core/coreSystem.js:111`, `render/feel.js:577`, `render/renderer.js:1451`, `systems/asteroidSites.js:197`, `systems/automation.js:421`, `systems/environmentalMachinery.js:47`, `systems/salvage.js:60`, `systems/stationContactLoadBoundary.js:30` |
| `save:started` | `save/saveSystem.js:527`, `save/saveSystem.js:1017` | `ui/uiRoot.js:245` |
| `scan:completed` | `balance/careerCohorts.js:477`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:837`, `systems/world.js:2524` | `careers/origins/prospectorOrigin.js:634`, `systems/missions.js:568`, `systems/onboarding.js:200`, `systems/presentationOrchestrator.js:163`, `systems/salvage.js:57`, `systems/salvageActions.js:70`, `systems/story.js:158`, `ui/hud.js:3355` |
| `scan:pulse` | `systems/scanner.js:775` | `systems/buildIdentity.js:268`, `systems/encounterDirector.js:122`, `systems/pirateDisguise.js:16`, `systems/presentationOrchestrator.js:162`, `systems/scanReveal.js:14`, `ui/hud.js:3356` |
| `scan:shipRevealed` | `systems/scanReveal.js:37` | `systems/buildIdentity.js:267` |
| `scan:weakPoint` | `systems/scanner.js:826` | `ui/hud.js:1059` |
| `scanner:ghostEscaped` | `systems/scanner.js:758` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:805` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:137` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:154` | `systems/presentationOrchestrator.js:84` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:572` | `systems/presentationOrchestrator.js:207`, `ui/comms.js:234` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:359` | `ui/comms.js:230` |
| `scenario:factChanged` | `systems/scenarioRuntime.js:547` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:132` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:122` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:189` | `ui/comms.js:433` |
| `scenario:scavengerResponse` | `ui/comms.js:454`, `ui/comms.js:458` | `systems/scenarioRuntime.js:29` |
| `sector:discovered` | `systems/world.js:434` | `systems/presentationOrchestrator.js:160` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:447` | `audio/audioSystem.js:717`, `render/renderer.js:1484`, `render/vfx.js:1112`, `save/saveSystem.js:145`, `systems/aftermathWrecks.js:316`, `systems/asteroidFormations.js:120`, `systems/asteroidSites.js:190`, `systems/automation.js:457`, `systems/claims.js:182`, `systems/economy.js:473`, `systems/encounterDirector.js:111`, `systems/factionPresence.js:156`, `systems/fields.js:128`, `systems/heistFacilities.js:159`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:99`, `systems/mines.js:36`, `systems/mining.js:146`, `systems/missions.js:619`, `systems/moralTrap.js:72`, `systems/npcJobsRuntime.js:141`, `systems/presentationOrchestrator.js:197`, `systems/routeFollower.js:328`, `systems/salvage.js:55`, `systems/sectorSim.js:95`, `systems/story.js:125`, `systems/story.js:157`, `systems/survivorPod.js:149`, `systems/tetherGameplay.js:109`, `systems/traffic.js:239`, `systems/wingmen.js:48`, `ui/causeLedger.js:132`, `ui/commandBar.js:413`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/radar.js:513`, `ui/radar.js:514`, `ui/sectorLawPresenter.js:215`, `ui/sectorPostcard.js:148`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:382` | `render/renderer.js:1463`, `render/vfx.js:1113`, `systems/aftermathWrecks.js:317`, `systems/asteroidSites.js:196`, `systems/automation.js:446`, `systems/encounterDirector.js:113`, `systems/environmentalMachinery.js:45`, `systems/factionPresence.js:157`, `systems/fields.js:127`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:160`, `systems/massSeed.js:118`, `systems/masslineSnares.js:98`, `systems/mines.js:35`, `systems/missions.js:620`, `systems/npcJobsRuntime.js:140`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:45`, `systems/stationSideEventDirector.js:56`, `systems/tetherGameplay.js:108`, `systems/traffic.js:242`, `systems/wingmen.js:51`, `ui/customsPrompt.js:127`, `ui/encounterChoicePrompt.js:145` |
| `sectorsim:embodiment` | `systems/sectorSim.js:801` | `systems/world.js:250` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:318` | `ui/screens/starmap.js:578` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:405`, `systems/claims.js:1170`, `systems/encounterDirector.js:1007`, `systems/mining.js:1183` | `systems/sectorSim.js:103` |
| `sectorsim:intel` | `systems/sectorSim.js:855` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:639` | `systems/economy.js:493` |
| `sectorsim:reconcile` | `systems/sectorSim.js:596` | — |
| `sectorsim:tick` | `systems/sectorSim.js:263` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:559` | `ui/screens/starmap.js:579` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:528` | — |
| `settings:changed` | `save/saveSystem.js:2264`, `save/saveSystem.js:2265`, `systems/touch.js:275`, `ui/screens/settings.js:249`, `ui/screens/settings.js:543`, `ui/screens/settings.js:618` | `audio/audioSystem.js:763`, `main.js:172`, `render/renderer.js:1422`, `render/vfx.js:1115`, `save/saveSystem.js:117`, `ui/uiRoot.js:392` |
| `ship:appearanceChanged` | `systems/ships.js:790`, `systems/ships.js:1020` | `core/coreSystem.js:110`, `render/renderer.js:1392`, `render/vfx.js:1111` |
| `ship:appearanceSaved` | `systems/ships.js:1022` | — |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:179` | `audio/audioSystem.js:722`, `render/feel.js:713`, `render/vfx.js:1126`, `systems/cruise.js:25` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:180`, `systems/flightV3.js:378` | `audio/audioSystem.js:727`, `render/renderer.js:1410`, `render/vfx.js:1127` |
| `ship:cargoCapChanged` | `systems/ships.js:785` | `systems/cargo.js:157` |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:357` | `audio/audioSystem.js:728`, `render/vfx.js:1128`, `systems/uniqueLootAbilities.js:115` |
| `ship:massChanged` | `systems/ships.js:919` | — |
| `ship:purchased` | `systems/ships.js:954` | `audio/audioSystem.js:716`, `systems/missions.js:623`, `ui/screens/stationHub.js:2775` |
| `ship:roleContext` | `systems/ships.js:725` | `systems/presentationAdapters.js:163` |
| `ship:sold` | `systems/ships.js:975` | `ui/screens/stationHub.js:2776` |
| `ship:statsChanged` | `systems/ships.js:784` | `systems/cargo.js:158`, `systems/world.js:233`, `ui/commandBar.js:408`, `ui/hud.js:3021`, `ui/screens/stationHub.js:2749`, `ui/screens/stationHub.js:2771`, `ui/screens/stationHub.js:2772`, `ui/screens/stationHub.js:2773`, `ui/screens/stationHub.js:2774` |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1122` | `render/vfx.js:1125` |
| `signal:investigated` | `systems/scanner.js:1170` | `systems/missions.js:571`, `systems/presentationOrchestrator.js:166`, `systems/world.js:236`, `ui/signalInvestigationPrompt.js:181` |
| `signal:receipt` | `systems/scanner.js:1171` | — |
| `signal:scanResults` | `systems/scanner.js:838` | `systems/presentationOrchestrator.js:164`, `ui/sectorLawPresenter.js:224`, `ui/signalInvestigationPrompt.js:179` |
| `signal:track` | `ui/signalInvestigationPrompt.js:155` | `systems/scanner.js:715` |
| `signal:tracked` | `systems/scanner.js:998` | `systems/presentationOrchestrator.js:165`, `ui/signalInvestigationPrompt.js:180` |
| `sim:jumpGate` | — | `systems/economy.js:479` |
| `sim:pause` | `ui/screenManager.js:252` | `audio/audioSystem.js:779`, `render/feel.js:575` |
| `sim:resume` | `ui/screenManager.js:259` | `audio/audioSystem.js:780` |
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
| `spawn:request` | `systems/automation.js:1139` | `systems/world.js:237` |
| `station:broadcastTic` | `systems/stationBroadcast.js:226` | — |
| `station:exitRequest` | `ui/screenManager.js:359`, `ui/uiRoot.js:820` | `ui/screens/stationHub.js:2728`, `ui/station/stationApp.js:805` |
| `station:navigate` | `ui/station/screens/bar.js:320`, `ui/station/screens/bar.js:325`, `ui/station/screens/industry.js:155` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:187` | `render/vfx.js:1124` |
| `stationContact:changed` | `systems/stationContacts.js:125` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:90` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:149` | — |
| `story:beatAdvanced` | `systems/missions.js:4507` | `save/saveSystem.js:152`, `systems/story.js:105`, `ui/screens/codex.js:307` |
| `story:elroyResolved` | `systems/missions.js:3122` | `systems/story.js:106` |
| `story:kurtzLedger` | `systems/story.js:1236`, `systems/story.js:1247` | — |
| `story:newGamePlusStarted` | `systems/story.js:1342` | `ui/hudMeta.js:95` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:907` | — |
| `story:postEndingContinuity` | `systems/story.js:1139` | — |
| `story:postEndingProgress` | `systems/story.js:1109` | `ui/screens/missionLog.js:1888` |
| `story:replayHookUnlocked` | `systems/story.js:1124` | `ui/screens/missionLog.js:1889` |
| `story:vergeEvidenceRecorded` | `systems/story.js:943` | — |
| `story:vergeObserversRevealed` | `systems/story.js:917` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:963` | — |
| `survivorPod:choose` | — | `systems/survivorPod.js:151` |
| `survivorPod:promoted` | `systems/survivorPod.js:235` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:329` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:341` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:380` | — |
| `tech:researched` | `systems/ships.js:827` | `audio/audioSystem.js:715`, `systems/onboarding.js:281`, `systems/ships.js:640`, `ui/screens/manufacture.js:218`, `ui/screens/stationHub.js:2780` |
| `tether:attached` | `combat/attachments.js:270` | `render/vfx.js:1095`, `systems/encounterDirector.js:126`, `systems/presentationOrchestrator.js:85`, `systems/scenarioRuntime.js:23`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:203`, `systems/tetherGameplay.js:900` | `careers/origins/prospectorOrigin.js:646`, `systems/onboarding.js:198`, `systems/surrenderRecovery.js:40` |
| `tether:broken` | `combat/attachments.js:388` | `render/feel.js:724`, `render/renderer.js:1412`, `render/vfx.js:1096`, `systems/presentationOrchestrator.js:93`, `systems/scenarioRuntime.js:27` |
| `tether:cut` | `systems/tetherGameplay.js:178`, `systems/tetherGameplay.js:1080` | `systems/masslineThrow.js:61` |
| `tether:latchDenied` | `systems/masslineSnares.js:444`, `systems/tetherGameplay.js:126`, `systems/tetherGameplay.js:268`, `systems/tetherGameplay.js:321`, `systems/tetherGameplay.js:326`, `systems/tetherGameplay.js:336`, `systems/tetherGameplay.js:351`, `systems/tetherGameplay.js:639` | — |
| `tether:latched` | `systems/tetherGameplay.js:371` | `careers/origins/prospectorOrigin.js:643`, `systems/flightV3.js:136`, `systems/missions.js:589`, `systems/onboarding.js:193`, `systems/onboarding.js:308`, `systems/onboarding.js:319`, `systems/surrenderRecovery.js:37`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:967` | — |
| `tether:nearBreak` | `combat/attachments.js:716` | `systems/onboarding.js:199`, `systems/presentationOrchestrator.js:86` |
| `tether:rebound` | `combat/attachments.js:659` | — |
| `tether:reel` | `combat/attachments.js:322` | `systems/missions.js:572`, `systems/onboarding.js:196`, `systems/surrenderRecovery.js:38` |
| `tether:reelPump` | `systems/masslineTelemetry.js:247` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:180`, `systems/tetherGameplay.js:204`, `systems/tetherGameplay.js:898`, `systems/tetherGameplay.js:901`, `systems/tetherGameplay.js:1082` | `systems/presentationOrchestrator.js:139` |
| `tether:released` | `systems/tetherGameplay.js:179`, `systems/tetherGameplay.js:897`, `systems/tetherGameplay.js:1081` | `render/renderer.js:1411`, `systems/onboarding.js:197`, `systems/surrenderRecovery.js:39` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:325` | — |
| `tether:strain` | `systems/tetherGameplay.js:1021` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:302` | `systems/combat.js:309`, `systems/masslineImpactDamage.js:41`, `systems/presentationOrchestrator.js:115`, `systems/tumbleStates.js:65` |
| `title:holdResolved` | — | `systems/titles.js:370` |
| `touch:uiAction` | `systems/touch.js:231` | `ui/input.js:523` |
| `tutorial:finished` | `systems/onboarding.js:737` | `systems/missions.js:514`, `systems/presentationAdapters.js:166`, `systems/story.js:112` |
| `tutorial:say` | `systems/onboarding.js:480` | `systems/story.js:118` |
| `ui:abandonMission` | `ui/screens/missionLog.js:1801` | `systems/missions.js:519` |
| `ui:acceptMission` | `ui/screens/bar.js:1109`, `ui/screens/stationHub.js:1978`, `ui/station/screens/bar.js:257`, `ui/station/screens/contracts.js:474` | `systems/missions.js:518` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | `ui/screens/market.js:643` | `careers/origins/haulerOriginSystem.js:88`, `systems/economy.js:437` |
| `ui:buyModule` | `ui/screens/outfitting.js:985`, `ui/station/screens/shipworks.js:1160` | `systems/onboarding.js:275`, `systems/ships.js:653` |
| `ui:buyShip` | `ui/screens/shipyard.js:839`, `ui/screens/shipyard.js:861`, `ui/station/screens/shipworks.js:1053` | `systems/ships.js:651` |
| `ui:cancel` | `ui/input.js:758`, `ui/input.js:772` | — |
| `ui:click` | — | `audio/audioSystem.js:783` |
| `ui:closeAll` | `main.js:531` | `ui/uiRoot.js:698` |
| `ui:closeCargo` | `ui/input.js:125`, `ui/input.js:195` | `ui/hud.js:2995` |
| `ui:closeComms` | `ui/input.js:190` | `ui/comms.js:307` |
| `ui:confirm` | `ui/input.js:766` | `audio/audioSystem.js:785` |
| `ui:cycleComponent` | `ui/targetPanel.js:313`, `ui/targetPanel.js:317` | `ui/uiRoot.js:703` |
| `ui:cycleTarget` | `ui/input.js:229`, `ui/input.js:819` | `ui/uiRoot.js:699` |
| `ui:deny` | — | `audio/audioSystem.js:786` |
| `ui:drillFadeStart` | `ui/input.js:413` | `ui/uiRoot.js:850` |
| `ui:endgameChoose` | `systems/missions.js:1788`, `ui/screens/bar.js:667` | `systems/story.js:131` |
| `ui:endgameConfirm` | — | `systems/story.js:132` |
| `ui:endgameDecline` | `ui/comms.js:387` | `systems/story.js:133` |
| `ui:endgameDepartAshfall` | `ui/comms.js:404` | `systems/story.js:137` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1659` | `systems/story.js:134` |
| `ui:endgameStayAshfall` | `ui/comms.js:405` | `systems/story.js:138` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:1663` | `systems/story.js:135` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:136` |
| `ui:factionPresenceService` | `ui/screens/services.js:375` | `systems/factionPresence.js:163`, `ui/screens/stationHub.js:2729` |
| `ui:fitModule` | `ui/screens/outfitting.js:912` | `systems/onboarding.js:271`, `systems/ships.js:654` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:940` | `systems/automation.js:413`, `systems/wingmen.js:59` |
| `ui:heliosBay7Scan` | — | `systems/story.js:161` |
| `ui:hover` | — | `audio/audioSystem.js:784` |
| `ui:kurtzInteract` | — | `systems/story.js:160` |
| `ui:navigate` | `ui/input.js:746`, `ui/input.js:750`, `ui/input.js:797` | — |
| `ui:popScreen` | `ui/galaxyMap.js:3753`, `ui/screens/automationPanel.js:434`, `ui/screens/starmap.js:424` | `ui/uiRoot.js:696` |
| `ui:purchaseFrontierRumor` | `ui/screens/bar.js:1054`, `ui/station/screens/bar.js:241` | `systems/world.js:239` |
| `ui:purchaseSurveyData` | `ui/screens/bar.js:1091`, `ui/station/screens/bar.js:311` | `systems/world.js:238` |
| `ui:pushScreen` | `ui/mapAuthority.js:133`, `ui/screens/bar.js:414`, `ui/screens/gameOver.js:245`, `ui/screens/starmap.js:432`, `ui/screens/stationHub.js:379`, `ui/station/screens/bar.js:274`, `ui/station/stationApp.js:411` | `ui/uiRoot.js:673` |
| `ui:replaceScreen` | — | `ui/uiRoot.js:697` |
| `ui:sell` | `ui/screens/market.js:452`, `ui/screens/stationHub.js:1555` | `careers/origins/haulerOriginSystem.js:89`, `systems/economy.js:438` |
| `ui:sellShip` | `ui/screens/shipyard.js:812` | — |
| `ui:service` | `balance/careerCohorts.js:699`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/screens/services.js:436`, `ui/screens/stationHub.js:1706`, `ui/station/stationApp.js:669` | `systems/economy.js:476` |
| `ui:setActiveShip` | `ui/screens/shipyard.js:817`, `ui/station/screens/shipworks.js:1056` | `systems/ships.js:652` |
| `ui:setCourse` | `systems/factionPresence.js:657`, `systems/missions.js:2249`, `systems/scanner.js:997`, `ui/galaxyMap.js:1973`, `ui/galaxyMap.js:1985`, `ui/galaxyMap.js:7353`, `ui/screens/localmap.js:588`, `ui/screens/market.js:1895`, `ui/screens/starmap.js:1226`, `ui/screens/starmap.js:1239`, `ui/screens/starmap.js:1243` | `systems/world.js:229` |
| `ui:setShipAppearance` | — | `systems/ships.js:657` |
| `ui:talkContact` | `ui/screens/bar.js:1153`, `ui/station/screens/bar.js:282` | `systems/story.js:162` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:38`, `combat/autoTargetMode.js:189` | `ui/uiRoot.js:704` |
| `ui:toggleCargo` | `ui/input.js:273` | `ui/hud.js:2994` |
| `ui:toggleComms` | `ui/input.js:290` | `ui/comms.js:306` |
| `ui:toggleOverview` | `ui/input.js:277` | `ui/hud.js:3365` |
| `ui:trackMission` | `ui/galaxyMap.js:5115`, `ui/screens/missionLog.js:1655`, `ui/screens/missionLog.js:1719`, `ui/screens/missionLog.js:1780`, `ui/station/screens/contracts.js:478` | `systems/missions.js:520` |
| `ui:undock` | — | `ui/input.js:522` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:1164` | `systems/ships.js:655` |
| `ui:unlockTech` | `ui/screens/techTree.js:579` | `systems/ships.js:656` |
| `ui:wingOrder` | `ui/wingmanRadial.js:124` | `systems/automation.js:414` |
| `ui:wingmanRadial` | `ui/input.js:283` | `ui/wingmanRadial.js:178` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:305` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:257` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:192` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1165` | `systems/missions.js:612` |
| `uniqueWreck:choose` | `systems/missions.js:2870`, `ui/recoveryEncounterPrompt.js:205` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:604` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:622`, `systems/uniqueWrecks.js:779`, `systems/uniqueWrecks.js:982` | `systems/missions.js:613` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1225` | `systems/missions.js:615`, `ui/recoveryEncounterPrompt.js:253` |
| `uniqueWreck:decisionRequest` | `ui/recoveryEncounterPrompt.js:256`, `ui/recoveryEncounterPrompt.js:258` | — |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:841` | `systems/missions.js:614` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:871` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:781` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1401` | `systems/missions.js:616`, `ui/recoveryEncounterPrompt.js:254` |
| `uniqueWreck:rumorHeard` | `ui/screens/bar.js:1167`, `ui/station/screens/bar.js:290` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:478` | `systems/missions.js:611` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1402` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1144` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1332` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:315` | — |
| `voice:clear` | `ui/voiceArbiter.js:359`, `ui/voiceArbiter.js:403` | `ui/alerts.js:259` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:317` |
| `voice:say` | `ui/alerts.js:161` | `ui/voiceArbiter.js:316` |
| `voice:surface` | `ui/voiceArbiter.js:364`, `ui/voiceArbiter.js:413` | `ui/alerts.js:258` |
| `weapons:mineArmed` | `systems/weapons.js:854` | — |
| `weapons:mineDeployed` | `systems/weapons.js:819` | — |
| `weapons:mineDetonated` | `systems/weapons.js:902` | — |
| `weapons:mineExpired` | `systems/weapons.js:848` | — |
| `weapons:vent` | `systems/weapons.js:304`, `systems/weapons.js:324` | `audio/audioSystem.js:700`, `ui/hud.js:3061` |
| `wingMorale:broken` | `systems/wingMorale.js:225` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:303` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:330` | — |
| `wingOrder:accepted` | `systems/automation.js:1593` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1594` | — |
| `wingOrder:converted` | `systems/wingmen.js:307` | — |
| `wingOrder:status` | `systems/automation.js:1595` | — |
| `world:abortJumpCharge` | `systems/story.js:696`, `ui/comms.js:396` | `systems/world.js:226` |
| `world:confirmUnfiledJump` | `systems/story.js:136` | `systems/world.js:225` |
| `world:membership` | `systems/world.js:440` | `systems/presentationOrchestrator.js:154` |
| `world:originShift` | `systems/world.js:2038` | — |
| `world:playerRelocated` | `systems/world.js:1825` | — |
| `world:requestJump` | `systems/story.js:680`, `ui/galaxyMap.js:1971`, `ui/screens/starmap.js:1238` | `systems/world.js:223` |
| `world:requestRoute` | `ui/galaxyMap.js:1983`, `ui/galaxyMap.js:5132`, `ui/galaxyMap.js:7351`, `ui/screens/starmap.js:1225`, `ui/screens/starmap.js:1242` | `systems/world.js:227` |
| `world:requestSectorScan` | — | `systems/world.js:228` |
| `world:requestUnfiledJump` | `systems/story.js:648` | `systems/world.js:224` |
| `world:residency` | `systems/world.js:555`, `systems/world.js:931` | `render/renderer.js:1377` |
| `world:zoneEntered` | `systems/world.js:2065` | `data/hazardLanguage.js:107` |
| `world:zoneExited` | `systems/world.js:2068` | `data/hazardLanguage.js:108` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:529` | `systems/presentationOrchestrator.js:213` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:483` | `systems/presentationOrchestrator.js:214`, `systems/traffic.js:260` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 1 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:baseDestroyed` — 1 subscriber(s)
- `combat:lockChanged` — 2 subscriber(s)
- `combat:repairSubsystem` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 5 subscriber(s)
- `combat:subsystemEnabled` — 1 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `dock:attempt` — 1 subscriber(s)
- `economy:trade` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `entity:spawnRequest` — 1 subscriber(s)
- `flybyFocus:cancel` — 1 subscriber(s)
- `game:newGame` — 11 subscriber(s)
- `heat:clear` — 1 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
- `law:custodyTransfer` — 1 subscriber(s)
- `law:dispatchStarted` — 1 subscriber(s)
- `law:distressRaised` — 3 subscriber(s)
- `law:incidentReceipt` — 1 subscriber(s)
- `law:incidentResolved` — 2 subscriber(s)
- `law:reportIncidentReceipt` — 1 subscriber(s)
- `miningDrone:sellOre` — 1 subscriber(s)
- `mission:abandoned` — 2 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `moralMemory:remember` — 1 subscriber(s)
- `moralTrap:choose` — 1 subscriber(s)
- `nav:abortRoute` — 1 subscriber(s)
- `nav:engageRoute` — 1 subscriber(s)
- `npcjobs:unload` — 1 subscriber(s)
- `npcjobs:work` — 1 subscriber(s)
- `physics:attachmentBroken` — 1 subscriber(s)
- `pirateParley:resolved` — 2 subscriber(s)
- `postEndingReplay:cycleCompleted` — 1 subscriber(s)
- `presentation:cue` — 4 subscriber(s)
- `recovery:completed` — 1 subscriber(s)
- `recovery:started` — 2 subscriber(s)
- `regionalEcology:applied` — 1 subscriber(s)
- `regionalEcology:changed` — 1 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `sim:jumpGate` — 1 subscriber(s)
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
- `anomaly:bearing` — 1 emitter(s)
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
- `beam:denied` — 4 emitter(s)
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
- `environmentalMachinery:phaseChanged` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `faction:tradePosture` — 3 emitter(s)
- `factionPresence:administrativeRouting` — 1 emitter(s)
- `factionPresence:fulfillmentProvoked` — 1 emitter(s)
- `factionPresence:service` — 1 emitter(s)
- `factionPresence:serviceAction` — 1 emitter(s)
- `factionPresence:spawned` — 1 emitter(s)
- `fields:cleared` — 1 emitter(s)
- `fields:coneToggled` — 2 emitter(s)
- `fields:deployDenied` — 1 emitter(s)
- `fields:deployed` — 1 emitter(s)
- `fields:ended` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `flybyFocus:end` — 1 emitter(s)
- `formation:discovered` — 1 emitter(s)
- `freight:arrival` — 1 emitter(s)
- `freight:loss` — 1 emitter(s)
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `heist:launchCue` — 1 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverCommitted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
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
- `massline:releaseValidated` — 1 emitter(s)
- `massline:snareArmed` — 1 emitter(s)
- `massline:snareCaught` — 1 emitter(s)
- `massline:snareCut` — 1 emitter(s)
- `massline:snareDeployed` — 1 emitter(s)
- `massline:snareEnded` — 1 emitter(s)
- `massline:tumbleEnd` — 1 emitter(s)
- `massline:tumbled` — 1 emitter(s)
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
- `module:granted` — 1 emitter(s)
- `moralMemory:vengefulReturn` — 1 emitter(s)
- `moralTrap:resolved` — 1 emitter(s)
- `moralTrap:revealed` — 1 emitter(s)
- `namedAce:appeared` — 1 emitter(s)
- `news:dockCards` — 1 emitter(s)
- `news:headline` — 4 emitter(s)
- `news:publish` — 2 emitter(s)
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
- `research:pointsChanged` — 1 emitter(s)
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
- `scenario:factChanged` — 1 emitter(s)
- `scenario:factsInitialized` — 1 emitter(s)
- `scenario:loaded` — 1 emitter(s)
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
- `station:navigate` — 3 emitter(s)
- `stationContact:changed` — 1 emitter(s)
- `stationContact:counterChanged` — 1 emitter(s)
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
- `uniqueWreck:rumorHeard` — 2 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:scanBlocked` — 1 emitter(s)
- `uniqueWreck:storyRewardGranted` — 1 emitter(s)
- `v2:flavorPresented` — 1 emitter(s)
- `weapons:mineArmed` — 1 emitter(s)
- `weapons:mineDeployed` — 1 emitter(s)
- `weapons:mineDetonated` — 1 emitter(s)
- `weapons:mineExpired` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `wingOrder:blocked` — 1 emitter(s)
- `wingOrder:converted` — 1 emitter(s)
- `wingOrder:status` — 1 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:playerRelocated` — 1 emitter(s)
