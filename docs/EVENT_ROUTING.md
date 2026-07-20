# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-07-20 · 530 events · 1949 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/encounterDirector.js:128` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:215` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:412` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:530` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:232` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:447` | — |
| `ai:doctrinePhase` | `systems/tacticalAI.js:143` | `systems/presentationOrchestrator.js:109` |
| `ai:encounterCommand` | `systems/aiPorts.js:197` | — |
| `ai:flee` | `systems/ai.js:235`, `systems/wingMorale.js:234` | `render/vfx.js:742`, `systems/barkDirector.js:37`, `systems/combatOutcome.js:103`, `systems/presentationOrchestrator.js:110` |
| `ai:formationBroken` | `systems/ai.js:404`, `systems/wingMorale.js:205` | `render/vfx.js:743` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:38` |
| `ai:stateChange` | `systems/ai.js:232` | — |
| `ai:telegraph` | `systems/ai.js:300`, `systems/encounterScripts.js:113`, `systems/mines.js:100`, `systems/tacticalAI.js:132` | `audio/audioSystem.js:672`, `render/vfx.js:741`, `systems/presentationOrchestrator.js:108`, `ui/hud.js:1509` |
| `aiTrader:requestTrade` | `systems/traffic.js:851` | `systems/economy.js:439` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:102` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:190` | — |
| `asset:deployed` | `systems/automation.js:1128`, `systems/automation.js:1637`, `systems/automation.js:1674`, `systems/automation.js:1744`, `systems/claims.js:294` | `systems/missions.js:525`, `systems/onboarding.js:275`, `systems/story.js:131` |
| `asteroid:chunked` | `systems/mining.js:560` | `systems/presentationOrchestrator.js:138` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:773`, `systems/mining.js:282` | `audio/audioSystem.js:656`, `systems/fieldDepletion.js:182`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/vfx.js:763`, `systems/ai.js:675`, `systems/beacons.js:52`, `systems/beacons.js:57`, `systems/beacons.js:80`, `systems/bulletTime.js:95`, `systems/bulletTime.js:111`, `systems/claims.js:189`, `systems/claims.js:226`, `systems/claims.js:271`, `systems/claims.js:727`, `systems/cloak.js:107`, `systems/cloak.js:118`, `systems/countermeasures.js:189`, `systems/crafting.js:221`, `systems/crafting.js:231`, `systems/flybyFocus.js:367`, `systems/impulseCharges.js:279`, `systems/impulseCharges.js:441`, `systems/jettisonImpulse.js:63`, `systems/masslineThrow.js:138`, `systems/masslineThrow.js:321`, `systems/masslineThrow.js:403`, `systems/mining.js:637`, `systems/presentationAdapters.js:406`, `systems/salvage.js:217`, `systems/tumbleStates.js:151`, `ui/hud.js:2294`, `ui/hud.js:2497`, `ui/hud.js:2548`, `ui/hud.js:2587`, `ui/hud.js:2604`, `ui/hud.js:2695`, `ui/hud.js:2782`, `ui/hud.js:2983`, `ui/input.js:79`, `ui/input.js:102`, `ui/input.js:148`, `ui/input.js:160`, `ui/input.js:166`, `ui/input.js:202`, `ui/input.js:242`, `ui/input.js:440`, `ui/input.js:652`, `ui/input.js:657`, `ui/input.js:741`, `ui/input.js:749`, `ui/input.js:755`, `ui/input.js:780`, `ui/input.js:791`, `ui/input.js:795`, `ui/input.js:808`, `ui/screens/bar.js:985`, `ui/screens/bar.js:1014`, `ui/screens/bar.js:1032`, `ui/screens/bar.js:1083`, `ui/screens/market.js:443`, `ui/screens/market.js:445`, `ui/screens/market.js:516`, `ui/screens/market.js:629`, `ui/screens/market.js:639`, `ui/screens/market.js:690`, `ui/screens/market.js:699`, `ui/screens/market.js:728`, `ui/screens/market.js:784`, `ui/screens/market.js:790`, `ui/screens/market.js:800`, `ui/screens/market.js:893`, `ui/screens/market.js:1113`, `ui/screens/market.js:1620`, `ui/screens/market.js:1883`, `ui/screens/missionLog.js:1548`, `ui/screens/missionLog.js:1552`, `ui/screens/missionLog.js:1556`, `ui/screens/missionLog.js:1572`, `ui/screens/missionLog.js:1579`, `ui/screens/missionLog.js:1586`, `ui/screens/missionLog.js:1594`, `ui/screens/missionLog.js:1601`, `ui/screens/missionLog.js:1608`, `ui/screens/missionLog.js:1617`, `ui/screens/missionLog.js:1624`, `ui/screens/missionLog.js:1640`, `ui/screens/missionLog.js:1671`, `ui/screens/missionLog.js:1691`, `ui/screens/outfitting.js:735`, `ui/screens/outfitting.js:739`, `ui/screens/outfitting.js:797`, `ui/screens/outfitting.js:804`, `ui/screens/services.js:380`, `ui/screens/services.js:402`, `ui/screens/services.js:415`, `ui/screens/services.js:431`, `ui/screens/services.js:437`, `ui/screens/shipLedger.js:134`, `ui/screens/shipyard.js:813`, `ui/screens/shipyard.js:818`, `ui/screens/shipyard.js:840`, `ui/screens/shipyard.js:844`, `ui/screens/shipyard.js:862`, `ui/screens/stationHub.js:1197`, `ui/screens/stationHub.js:1206`, `ui/screens/stationHub.js:1262`, `ui/screens/stationHub.js:1295`, `ui/screens/stationHub.js:1301`, `ui/screens/stationHub.js:1348`, `ui/screens/stationHub.js:1360`, `ui/screens/stationHub.js:1364`, `ui/screens/stationHub.js:1376`, `ui/screens/stationHub.js:1392`, `ui/screens/stationHub.js:1556`, `ui/screens/stationHub.js:1669`, `ui/screens/stationHub.js:1678`, `ui/screens/stationHub.js:1694`, `ui/screens/stationHub.js:1704`, `ui/screens/stationHub.js:1707`, `ui/screens/stationHub.js:1962`, `ui/screens/stationHub.js:1982`, `ui/screens/stationHub.js:2451`, `ui/station/screens/bar.js:158`, `ui/station/screens/bar.js:171`, `ui/station/screens/bar.js:187`, `ui/station/screens/bar.js:196`, `ui/station/screens/contracts.js:285`, `ui/station/screens/contracts.js:290`, `ui/station/screens/contracts.js:294`, `ui/station/screens/factions.js:317`, `ui/station/screens/industry.js:150`, `ui/station/screens/industry.js:159`, `ui/station/screens/industry.js:167`, `ui/station/screens/market.js:505`, `ui/station/screens/market.js:522`, `ui/station/screens/market.js:611`, `ui/station/screens/market.js:620`, `ui/station/screens/market.js:640`, `ui/station/screens/shipworks.js:608`, `ui/station/screens/shipworks.js:968`, `ui/station/screens/shipworks.js:1015`, `ui/station/screens/shipworks.js:1017`, `ui/station/screens/shipworks.js:1021`, `ui/station/screens/shipworks.js:1030`, `ui/station/screens/shipworks.js:1101`, `ui/station/screens/shipworks.js:1105`, `ui/station/stationApp.js:492`, `ui/station/stationApp.js:664`, `ui/uiRoot.js:734`, `ui/uiRoot.js:801`, `ui/wingmanRadial.js:77`, `ui/wingmanRadial.js:98`, `ui/wingmanRadial.js:120`, `ui/wingmanRadial.js:146`, `ui/wingmanRadial.js:163` | `audio/audioSystem.js:733` |
| `automation:assetDistressed` | `systems/automation.js:1425` | — |
| `automation:assetLost` | `systems/automation.js:1840` | `systems/intervention.js:37`, `systems/lossLedger.js:331`, `systems/missions.js:527` |
| `automation:assetRepossessed` | `systems/automation.js:1450` | — |
| `automation:incomeCredited` | `systems/automation.js:1478`, `systems/automation.js:2104` | — |
| `automation:offlineSummary` | `systems/automation.js:1871`, `systems/automation.js:1895`, `systems/automation.js:1919`, `systems/automation.js:1942`, `systems/automation.js:2151` | — |
| `automation:outpostRaided` | `systems/automation.js:1358`, `systems/automation.js:2226` | `systems/lossLedger.js:332` |
| `automation:programAssigned` | `systems/automation.js:1611` | `systems/missions.js:526` |
| `band:bearingReceipt` | `systems/bandRadio.js:504` | — |
| `band:bearingRequest` | `systems/bandRadio.js:477` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:502`, `systems/uniqueWrecks.js:545` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:509`, `systems/uniqueWrecks.js:517`, `systems/uniqueWrecks.js:531` | — |
| `band:bed` | `systems/bandRadio.js:561` | `audio/audioSystem.js:738` |
| `band:cycle` | `ui/bandHud.js:57`, `ui/input.js:182` | — |
| `band:status` | `systems/bandRadio.js:543` | `ui/bandHud.js:61` |
| `beacon:deploy` | — | `systems/beacons.js:35` |
| `beacon:deployed` | `systems/beacons.js:75` | — |
| `boss:defeated` | `systems/world.js:335` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:290` | — |
| `bulletTime:end` | `systems/bulletTime.js:110` | `audio/audioSystem.js:737` |
| `bulletTime:start` | `systems/bulletTime.js:94` | `audio/audioSystem.js:734`, `systems/onboarding.js:324` |
| `camera:kill` | `render/feel.js:632`, `render/feel.js:783` | `render/renderer.js:1220` |
| `camera:shake` | `render/vfx.js:1793`, `render/vfx.js:2379`, `systems/combat.js:347`, `systems/combat.js:420`, `systems/combat.js:441`, `systems/combat.js:477`, `systems/combat.js:575`, `systems/combat.js:653`, `systems/drill.js:972`, `systems/flybyFocus.js:366`, `systems/intervention.js:106`, `systems/presentationAdapters.js:353`, `systems/tetherGameplay.js:250` | `render/renderer.js:1219` |
| `camera:zoom` | `ui/input.js:292`, `ui/input.js:293`, `ui/input.js:486` | `render/renderer.js:1226` |
| `cargo:changed` | `systems/cargo.js:72`, `systems/mining.js:735` | `systems/cargo.js:130`, `systems/ships.js:502`, `ui/cargoConscience.js:122`, `ui/commandBar.js:407`, `ui/hud.js:2616`, `ui/hud.js:2645`, `ui/hudMeta.js:152`, `ui/screens/manufacture.js:214`, `ui/screens/stationHub.js:2748`, `ui/screens/stationHub.js:2765`, `ui/screens/stationHub.js:2766`, `ui/screens/stationHub.js:2767` |
| `cargo:delivered` | `systems/missions.js:2676` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:93`, `systems/mining.js:424`, `systems/mining.js:703` | `careers/origins/prospectorOrigin.js:640`, `systems/onboarding.js:230`, `systems/presentationOrchestrator.js:146`, `ui/alerts.js:290`, `ui/floatingText.js:150` |
| `cargo:jettison` | `ui/hud.js:2302` | `ui/hud.js:2553` |
| `cargo:jettisoned` | `systems/cargo.js:233` | `systems/jettisonImpulse.js:28`, `systems/onboarding.js:319` |
| `cargo:massSettled` | `systems/cargo.js:170` | `systems/presentationOrchestrator.js:145`, `systems/ships.js:503` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:72` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:275` | `systems/onboarding.js:334` |
| `charge:combo` | `systems/impulseCharges.js:317`, `systems/impulseCharges.js:420` | — |
| `charge:detonated` | `systems/impulseCharges.js:428` | `audio/audioSystem.js:682`, `render/feel.js:727`, `render/vfx.js:740` |
| `charge:stuck` | `systems/impulseCharges.js:201` | — |
| `charge:thrown` | `systems/impulseCharges.js:271` | — |
| `claim:claimed` | `systems/claims.js:188` | `systems/onboarding.js:282`, `systems/story.js:133` |
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
| `combat:baseDestroyed` | — | `systems/economy.js:470` |
| `combat:beamStop` | `systems/weapons.js:481` | `audio/audioSystem.js:632`, `render/vfx.js:714` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:140` | — |
| `combat:collisionDebris` | `systems/collisionConsequences.js:142` | — |
| `combat:damage` | `combat/damage.js:177` | `audio/audioSystem.js:636`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/feel.js:575`, `render/vfx.js:716`, `systems/ai.js:89`, `systems/cruise.js:21`, `systems/encounterDirector.js:120`, `systems/factionPresence.js:162`, `systems/heat.js:118`, `systems/lawSecurity.js:52`, `systems/onboarding.js:200`, `systems/onboarding.js:207`, `systems/presentationOrchestrator.js:107`, `systems/scenarioRuntime.js:28`, `systems/stationBroadcast.js:144`, `ui/alerts.js:276`, `ui/commandBar.js:396`, `ui/floatingText.js:75`, `ui/floatingText.js:83`, `ui/hud.js:878`, `ui/hud.js:1143` |
| `combat:fire` | `systems/weapons.js:460`, `systems/weapons.js:601` | `audio/audioSystem.js:631`, `render/feel.js:645`, `render/vfx.js:713`, `systems/cloak.js:37`, `systems/cruise.js:28`, `systems/onboarding.js:192`, `systems/presentationOrchestrator.js:111`, `ui/hud.js:2657` |
| `combat:hit` | `systems/salvageActions.js:182` | `systems/routeFollower.js:242` |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:417` |
| `combat:lockChanged` | — | `systems/world.js:218`, `ui/alerts.js:283` |
| `combat:outcome` | `systems/combatOutcome.js:160` | `systems/barkDirector.js:39` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:161` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:69` |
| `combat:requestAction` | — | `combat/kernel.js:67` |
| `combat:routeDamage` | `systems/drill.js:984`, `systems/impulseCharges.js:469`, `systems/mines.js:212` | `combat/kernel.js:68`, `systems/routeFollower.js:243` |
| `combat:statusApplied` | `combat/statuses.js:142` | — |
| `combat:statusExpired` | `combat/statuses.js:53` | — |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:104`, `systems/factionPresence.js:160`, `systems/presentationOrchestrator.js:161`, `systems/wingMorale.js:141` |
| `combat:subsystemEnabled` | — | `systems/factionPresence.js:161` |
| `combat:surrendered` | — | `systems/combatOutcome.js:105`, `systems/surrenderRecovery.js:30` |
| `combat:weakPointHit` | `systems/combat.js:401` | `ui/floatingText.js:87` |
| `comms:log` | `systems/encounterScripts.js:515`, `systems/salvage.js:215` | — |
| `comms:popup` | `systems/ai.js:459`, `systems/factionPresence.js:522`, `systems/factionPresence.js:543`, `systems/missions.js:2748`, `systems/missions.js:2781`, `systems/missions.js:2815`, `systems/missions.js:3443`, `systems/missions.js:3812`, `systems/scenarioRuntime.js:185`, `systems/story.js:340` | `audio/audioSystem.js:719`, `ui/comms.js:225`, `ui/screens/codex.js:306` |
| `conflict:flip` | `systems/factions.js:378` | `systems/sectorSim.js:107`, `systems/story.js:132` |
| `conflict:warDeclared` | `systems/factions.js:335` | — |
| `contactHail:availability` | `systems/scanner.js:878`, `systems/scanner.js:889` | — |
| `contactHail:choice` | `ui/contactHailPrompt.js:82` | `systems/scanner.js:564` |
| `contactHail:clear` | `systems/scanner.js:900` | — |
| `contactHail:handoff` | `systems/scanner.js:787` | — |
| `contactHail:offer` | `systems/scanner.js:809` | — |
| `contactHail:request` | `ui/contactHailPrompt.js:76` | `systems/scanner.js:563` |
| `contactHail:response` | `systems/scanner.js:838` | — |
| `contraband:bribe` | `systems/encounterScripts.js:345`, `ui/customsPrompt.js:174` | `systems/economy.js:466` |
| `contraband:scanned` | `systems/economy.js:1340` | `systems/encounterDirector.js:121`, `systems/factions.js:191`, `systems/heat.js:121`, `ui/customsPrompt.js:126` |
| `contract:clauseBroken` | `systems/contractClauses.js:169` | `systems/missions.js:509` |
| `contract:clauseHonored` | `systems/contractClauses.js:156`, `systems/missions.js:2829` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:185` | — |
| `craft:complete` | `systems/crafting.js:220`, `systems/crafting.js:257` | `ui/screens/manufacture.js:216`, `ui/station/screens/industry.js:171` |
| `craft:queueChanged` | `systems/crafting.js:122`, `systems/crafting.js:230`, `systems/crafting.js:259` | `systems/onboarding.js:288`, `ui/screens/manufacture.js:217`, `ui/station/screens/industry.js:171` |
| `credits:changed` | `systems/economy.js:1152`, `systems/economy.js:1163` | `audio/audioSystem.js:658`, `balance/hunterPublicRoute.js:466`, `ui/commandBar.js:408`, `ui/hud.js:2644`, `ui/screens/manufacture.js:215`, `ui/screens/stationHub.js:2746`, `ui/screens/stationHub.js:2768`, `ui/screens/stationHub.js:2769` |
| `cruise:charging` | `systems/cruise.js:88` | `render/vfx.js:737`, `systems/presentationOrchestrator.js:116` |
| `cruise:dropped` | `systems/cruise.js:99` | `render/vfx.js:739`, `systems/presentationOrchestrator.js:118` |
| `cruise:engaged` | `systems/cruise.js:64` | `render/vfx.js:738`, `systems/presentationOrchestrator.js:117` |
| `cruise:snareRequest` | `systems/encounterScripts.js:422` | `systems/cruise.js:33` |
| `cruise:snared` | `systems/cruise.js:98` | `audio/audioSystem.js:713` |
| `customs:breakScan` | `ui/customsPrompt.js:178` | — |
| `customs:submit` | `ui/customsPrompt.js:170` | — |
| `danger:miningNoise` | `systems/mining.js:747` | — |
| `day:tick` | `core/coreSystem.js:98` | `systems/custodyConsequences.js:30`, `systems/encounterDirector.js:112`, `systems/factions.js:207`, `systems/sectorSim.js:93` |
| `distress:rescued` | `systems/encounterScripts.js:514` | `systems/factions.js:200` |
| `dock:attempt` | — | `ui/dockDenyBanner.js:100` |
| `dock:denied` | `ui/dockDenyBanner.js:125` | — |
| `dock:docked` | `balance/careerCohorts.js:487`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:78` | `audio/audioSystem.js:669`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:631`, `save/saveSystem.js:118`, `systems/aftermathWrecks.js:320`, `systems/autoTargetAssist.js:95`, `systems/combat.js:310`, `systems/economy.js:453`, `systems/economyContracts.js:158`, `systems/factionPresence.js:158`, `systems/mining.js:84`, `systems/missions.js:463`, `systems/onboarding.js:170`, `systems/onboarding.js:247`, `systems/scanner.js:567`, `systems/story.js:108`, `ui/alerts.js:267`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:133`, `ui/dockDenyBanner.js:101`, `ui/priceForecast.js:86`, `ui/securityReadout.js:158`, `ui/uiRoot.js:722`, `ui/wingmanRadial.js:181` |
| `dock:range` | `core/physics.js:649`, `core/physics.js:653` | `systems/onboarding.js:214`, `ui/alerts.js:263`, `ui/hud.js:857`, `ui/input.js:64` |
| `dock:undocked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:480`, `ui/station/stationApp.js:644` | `audio/audioSystem.js:670`, `save/saveSystem.js:119`, `systems/combat.js:314`, `systems/economy.js:456`, `systems/missions.js:482`, `systems/presentationAdapters.js:142`, `ui/input.js:71`, `ui/uiRoot.js:751` |
| `drill:break` | `systems/drill.js:883` | `systems/asteroidSites.js:120`, `systems/presentationOrchestrator.js:152`, `ui/asteroid/asteroidScreen.js:555`, `ui/screens/drill.js:1863` |
| `drill:cargoFull` | `systems/drill.js:932` | `ui/asteroid/asteroidScreen.js:544`, `ui/screens/drill.js:1833` |
| `drill:end` | `systems/drill.js:552` | `systems/asteroidSites.js:130`, `systems/presentationOrchestrator.js:155`, `ui/sectorLawPresenter.js:222` |
| `drill:gasHit` | `systems/drill.js:971` | `systems/presentationOrchestrator.js:154`, `ui/asteroid/asteroidScreen.js:531`, `ui/screens/drill.js:1773` |
| `drill:retry` | `systems/drill.js:603` | `systems/presentationOrchestrator.js:156` |
| `drill:rockDepleted` | `systems/drill.js:518`, `systems/drill.js:897`, `systems/drill.js:923` | `ui/asteroid/asteroidScreen.js:541`, `ui/screens/drill.js:1824` |
| `drill:scanPulse` | `systems/drill.js:676` | `systems/presentationOrchestrator.js:150`, `ui/asteroid/asteroidScreen.js:548`, `ui/screens/drill.js:1851` |
| `drill:spark` | `systems/drill.js:855` | `systems/presentationOrchestrator.js:151`, `ui/asteroid/asteroidScreen.js:560`, `ui/screens/drill.js:1884` |
| `drill:start` | `systems/drill.js:510` | `systems/asteroidSites.js:113`, `systems/onboarding.js:253`, `systems/presentationOrchestrator.js:149`, `ui/sectorLawPresenter.js:221` |
| `drill:warn` | `systems/drill.js:524`, `systems/drill.js:529`, `systems/drill.js:777`, `systems/drill.js:809`, `systems/drill.js:828`, `systems/drill.js:904`, `systems/drill.js:935`, `systems/drill.js:942` | `systems/presentationOrchestrator.js:148`, `ui/asteroid/asteroidScreen.js:537`, `ui/screens/drill.js:1801` |
| `drill:yield` | `systems/drill.js:921` | `systems/presentationOrchestrator.js:153`, `ui/asteroid/asteroidScreen.js:523`, `ui/screens/drill.js:1752` |
| `economy:applyTradePressure` | `systems/automation.js:653`, `systems/automation.js:1209`, `systems/automation.js:1210`, `systems/claims.js:575`, `systems/encounterDirector.js:1003`, `systems/sectorSim.js:368`, `systems/traffic.js:932` | `systems/economy.js:447` |
| `economy:chargeCredits` | `systems/automation.js:1380`, `systems/automation.js:1387`, `systems/automation.js:2114`, `systems/automation.js:2338`, `systems/beacons.js:61`, `systems/claims.js:168`, `systems/claims.js:216`, `systems/claims.js:261`, `systems/claims.js:615`, `systems/combat.js:557`, `systems/encounterDirector.js:997`, `systems/gateControlDirector.js:119`, `systems/missions.js:1230`, `systems/missions.js:1233`, `systems/pirateParley.js:507`, `systems/ships.js:683`, `systems/ships.js:734`, `systems/ships.js:794`, `systems/world.js:1787`, `systems/world.js:2058` | `systems/economy.js:421` |
| `economy:eventEnded` | `systems/economy.js:1422` | `ui/floatingText.js:166`, `ui/screens/stationHub.js:2808` |
| `economy:eventStarted` | `systems/economy.js:1397` | `ui/floatingText.js:155`, `ui/screens/market.js:733`, `ui/screens/stationHub.js:2807` |
| `economy:grantCredits` | `systems/automation.js:1474`, `systems/automation.js:2100`, `systems/claims.js:574`, `systems/claims.js:1104`, `systems/combat.js:444`, `systems/combat.js:449`, `systems/combat.js:638`, `systems/encounterDirector.js:998`, `systems/mining.js:653`, `systems/missions.js:2837`, `systems/missions.js:2840`, `systems/missions.js:3738`, `systems/moralTrap.js:133`, `systems/ships.js:823`, `systems/survivorPod.js:368`, `systems/uniqueWrecks.js:1318` | `systems/economy.js:420`, `systems/story.js:130` |
| `economy:marketOpened` | `ui/screens/market.js:1801`, `ui/station/screens/market.js:659` | `systems/economy.js:426`, `ui/priceHistory.js:118` |
| `economy:tick` | `systems/economy.js:548` | `ui/priceHistory.js:93`, `ui/screens/stationHub.js:2764` |
| `economy:trade` | — | `careers/origins/haulerOriginSystem.js:87` |
| `economy:tradeCompleted` | `systems/economy.js:1024` | `audio/audioSystem.js:659`, `careers/origins/prospectorOrigin.js:649`, `save/saveSystem.js:126`, `systems/factions.js:170`, `systems/missions.js:490`, `systems/onboarding.js:171`, `systems/sectorSim.js:102`, `systems/story.js:126`, `ui/screens/market.js:713`, `ui/screens/stationHub.js:2750`, `ui/screens/stationHub.js:2762`, `ui/screens/stationHub.js:2763` |
| `economy:tradeFailed` | `systems/economy.js:1101`, `systems/economy.js:1119` | `ui/screens/market.js:724` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:867` | `ui/encounterChoicePrompt.js:143` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:106` | `systems/encounterDirector.js:133` |
| `encounter:fingerprint` | `systems/encounterDirector.js:945` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:3319` | `systems/encounterDirector.js:119` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1046` | — |
| `encounter:receipt` | `systems/encounterDirector.js:958` | — |
| `encounter:resolved` | `systems/encounterDirector.js:940`, `systems/encounterDirector.js:983` | `audio/audioSystem.js:674`, `systems/aftermathWrecks.js:319`, `systems/claims.js:141`, `systems/terrainAnchors.js:44`, `systems/uniqueLootAbilities.js:114`, `ui/encounterChoicePrompt.js:144` |
| `encounter:spawned` | `systems/encounterDirector.js:554` | `systems/uniqueLootAbilities.js:113` |
| `encounter:telegraph` | `systems/encounterDirector.js:539` | `audio/audioSystem.js:673`, `systems/terrainAnchors.js:43` |
| `encounter:voice` | `systems/encounterDirector.js:851` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:383` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:342` | — |
| `endgame:chosen` | `systems/story.js:786` | `ui/screens/missionLog.js:1773` |
| `endgame:confirmRequired` | `systems/story.js:675` | `ui/comms.js:399`, `ui/screens/missionLog.js:1772` |
| `endgame:eligibility` | `systems/story.js:561` | `ui/comms.js:412`, `ui/screens/missionLog.js:1771` |
| `endgame:ineligible` | `systems/story.js:655`, `systems/story.js:720` | `ui/comms.js:407` |
| `endgame:loopBack` | — | `systems/story.js:121` |
| `endgame:promptChoiceC` | `systems/story.js:644` | `ui/comms.js:379` |
| `endgame:promptChoiceD` | `systems/story.js:637` | `ui/comms.js:384` |
| `endgame:promptChoiceE` | `systems/story.js:457` | `ui/comms.js:388` |
| `endgame:promptSandbox` | `systems/story.js:572` | `ui/comms.js:391` |
| `endgame:sandboxContinued` | `systems/story.js:780` | `ui/screens/missionLog.js:1774` |
| `entity:destroyed` | `main.js:268`, `main.js:342`, `save/saveSystem.js:2243`, `systems/wingmen.js:133`, `systems/world.js:972` | `audio/audioSystem.js:650`, `combat/kernel.js:62`, `render/renderer.js:1206`, `render/vfx.js:719`, `systems/ai.js:101`, `systems/encounterDirector.js:117`, `systems/gateControlDirector.js:68`, `systems/missions.js:498`, `systems/presentationOrchestrator.js:115`, `systems/stationSideEventDirector.js:55`, `ui/prompts/bulkHaulTag.js:148`, `ui/radar.js:509` |
| `entity:kill` | — | `core/coreSystem.js:68` |
| `entity:killed` | `balance/careerCohorts.js:456`, `combat/damage.js:287`, `combat/kernel.js:42`, `systems/combat.js:436` | `audio/audioSystem.js:649`, `render/feel.js:608`, `render/vfx.js:718`, `systems/aftermathWrecks.js:315`, `systems/ai.js:102`, `systems/combatOutcome.js:102`, `systems/contractClauses.js:91`, `systems/encounterDirector.js:118`, `systems/factions.js:148`, `systems/heat.js:114`, `systems/lootShards.js:32`, `systems/lossLedger.js:334`, `systems/mining.js:79`, `systems/missions.js:496`, `systems/presentationOrchestrator.js:114`, `systems/sectorSim.js:106`, `systems/titles.js:270`, `systems/traffic.js:199`, `systems/wingMorale.js:140`, `systems/world.js:227`, `ui/floatingText.js:84`, `ui/floatingText.js:113`, `ui/galaxyMap.js:5240` |
| `entity:spawnRequest` | — | `core/coreSystem.js:72` |
| `entity:spawned` | `core/coreSystem.js:31` | `combat/kernel.js:57`, `render/renderer.js:1204`, `render/vfx.js:720`, `systems/factionPresence.js:164`, `systems/lawSecurity.js:53`, `systems/lossLedger.js:333`, `systems/salvageActions.js:69`, `systems/uniqueLootAbilities.js:116`, `ui/radar.js:508` |
| `faction:aggro` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:226`, `systems/factions.js:241`, `systems/factions.js:272`, `systems/factions.js:459` | `systems/heat.js:126` |
| `faction:repChanged` | `systems/factions.js:238`, `systems/factions.js:267`, `systems/factions.js:455` | `ui/floatingText.js:140`, `ui/screens/stationHub.js:2789`, `ui/station/screens/factions.js:332` |
| `faction:repDelta` | `balance/careerCohorts.js:255`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:850`, `systems/economy.js:1339`, `systems/encounterDirector.js:999`, `systems/missions.js:2933`, `systems/missions.js:2972`, `systems/missions.js:3691`, `systems/missions.js:3693`, `systems/missions.js:3743`, `systems/moralTrap.js:128`, `systems/moralTrap.js:135`, `systems/survivorPod.js:374`, `systems/uniqueWrecks.js:1322` | `systems/factions.js:142` |
| `faction:repSpillover` | `systems/factions.js:265` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:114`, `systems/e1EncounterRuntime.js:118`, `systems/e1EncounterRuntime.js:128` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:762` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:526` | `systems/story.js:140` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:674` | `ui/uiRoot.js:156` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:405` | — |
| `factionPresence:service` | `systems/factionPresence.js:475` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:551` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:273` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:236` | `systems/world.js:222` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:235` | `systems/presentationOrchestrator.js:147` |
| `flight:modeChanged` | `systems/flightV3.js:468` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:252` |
| `flybyFocus:end` | `systems/flybyFocus.js:285` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:349` | `systems/onboarding.js:189` |
| `formation:discovered` | `systems/asteroidFormations.js:235` | — |
| `freight:arrival` | `systems/traffic.js:862` | — |
| `freight:loss` | `systems/traffic.js:944` | — |
| `fuel:changed` | `systems/economy.js:1185`, `systems/world.js:2297`, `systems/world.js:2305` | `ui/screens/stationHub.js:2747`, `ui/screens/stationHub.js:2782`, `ui/screens/stationHub.js:2783`, `ui/screens/stationHub.js:2784`, `ui/screens/stationHub.js:2785` |
| `fuel:empty` | `systems/world.js:2298` | `audio/audioSystem.js:691`, `ui/alerts.js:291` |
| `game:load` | `ui/input.js:171`, `ui/input.js:289`, `ui/screens/mainMenu.js:249`, `ui/screens/saveLoad.js:305` | `save/saveSystem.js:96`, `systems/scanner.js:566`, `ui/commandBar.js:425`, `ui/encounterChoicePrompt.js:147`, `ui/pirateParleyPrompt.js:250`, `ui/recoveryEncounterPrompt.js:254`, `ui/sectorLawPresenter.js:227`, `ui/signalInvestigationPrompt.js:169` |
| `game:loadingProgress` | `main.js:113`, `main.js:127`, `main.js:324`, `main.js:367`, `main.js:379`, `main.js:395`, `main.js:420`, `main.js:438` | `ui/loadingPresenter.js:46` |
| `game:new` | `ui/screens/gameOver.js:222`, `ui/screens/newGame.js:337` | `careers/origins/haulerOriginSystem.js:64`, `main.js:159`, `render/feel.js:569`, `save/saveSystem.js:114`, `systems/mines.js:37`, `systems/presentationOrchestrator.js:168`, `systems/scanner.js:565`, `ui/commandBar.js:424`, `ui/encounterChoicePrompt.js:146`, `ui/hudLayout.js:121`, `ui/pirateParleyPrompt.js:249`, `ui/priceHistory.js:119`, `ui/recoveryEncounterPrompt.js:253`, `ui/sectorLawPresenter.js:226`, `ui/signalInvestigationPrompt.js:168` |
| `game:newGame` | — | `save/saveSystem.js:115`, `systems/aftermathWrecks.js:326`, `systems/collisionConsequences.js:41`, `systems/fieldDepletion.js:183`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:335`, `systems/survivorPod.js:152`, `systems/titles.js:272`, `systems/wingMorale.js:142` |
| `game:over` | `systems/combat.js:421`, `systems/combat.js:478` | `ui/uiRoot.js:867` |
| `game:save` | `ui/input.js:170`, `ui/input.js:287`, `ui/screens/saveLoad.js:291` | `save/saveSystem.js:95` |
| `game:startFailed` | `main.js:499` | `ui/loadingPresenter.js:54`, `ui/screens/newGame.js:325` |
| `game:started` | `main.js:333` | `audio/audioSystem.js:770`, `careers/origins/haulerOriginSystem.js:63`, `render/renderer.js:1227`, `save/saveSystem.js:111`, `systems/automation.js:437`, `systems/combat.js:321`, `systems/economyContracts.js:160`, `systems/factions.js:139`, `systems/flight.js:78`, `systems/flightV3.js:140`, `systems/missions.js:449`, `systems/onboarding.js:157`, `systems/onboarding.js:343`, `systems/presentationAdapters.js:141`, `systems/presentationOrchestrator.js:169`, `systems/sectorSim.js:97`, `systems/story.js:96`, `systems/tacticalAI.js:103`, `ui/commandBar.js:423`, `ui/radar.js:510`, `ui/sectorLawPresenter.js:216`, `ui/uiRoot.js:858`, `ui/uiRoot.js:883` |
| `gamepad:connected` | `systems/gamepad.js:160` | `ui/uiRoot.js:375` |
| `gamepad:disconnected` | `systems/gamepad.js:153` | `ui/uiRoot.js:376` |
| `gate:range` | `core/physics.js:659`, `core/physics.js:663` | `systems/onboarding.js:222`, `systems/presentationOrchestrator.js:119`, `ui/alerts.js:269` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:96`, `systems/e1EncounterRuntime.js:157`, `systems/e1EncounterRuntime.js:186`, `systems/e1EncounterRuntime.js:550`, `systems/story.js:416`, `systems/story.js:430`, `systems/story.js:1192`, `systems/story.js:1278`, `systems/uniqueWrecks.js:1328` | `ui/comms.js:318`, `ui/screens/codex.js:307` |
| `hazard:enter` | `systems/world.js:2275` | `data/hazardLanguage.js:99` |
| `hazard:exit` | `systems/world.js:2285` | `data/hazardLanguage.js:100` |
| `heat:changed` | `systems/heat.js:270` | `ui/hud.js:2666` |
| `heat:clear` | — | `systems/heat.js:129` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:130` |
| `hud:phase` | `systems/story.js:182`, `systems/story.js:212`, `systems/story.js:215`, `systems/story.js:495` | `ui/hudMeta.js:102` |
| `hud:tagFlicker` | `systems/story.js:472` | `ui/hudMeta.js:136` |
| `interdiction:triggered` | `systems/encounterScripts.js:423`, `systems/world.js:1962` | `systems/presentationOrchestrator.js:127`, `systems/sectorSim.js:103` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:1928` | `render/feel.js:679`, `render/renderer.js:1350`, `save/saveSystem.js:121`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:125`, `systems/sectorSim.js:112` |
| `jump:chargeAbort` | `systems/world.js:2031`, `systems/world.js:2081`, `ui/comms.js:382`, `ui/comms.js:386` | `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:124` |
| `jump:chargeStart` | `systems/world.js:2068` | `render/feel.js:669`, `systems/gateControlDirector.js:64`, `systems/presentationOrchestrator.js:121`, `systems/story.js:113` |
| `jump:chargeTick` | `systems/world.js:1884` | `systems/presentationOrchestrator.js:122` |
| `jump:start` | `systems/world.js:1893` | `render/feel.js:673`, `systems/economy.js:464`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:123`, `systems/sectorSim.js:111` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:29` |
| `law:dispatchStarted` | — | `ui/sectorLawPresenter.js:218` |
| `law:distressRaised` | — | `ui/recoveryEncounterPrompt.js:251`, `ui/sectorLawPresenter.js:217`, `ui/signalInvestigationPrompt.js:167` |
| `law:incidentReceipt` | — | `ui/sectorLawPresenter.js:220` |
| `law:incidentResolved` | — | `ui/recoveryEncounterPrompt.js:252`, `ui/sectorLawPresenter.js:219` |
| `loot:drop` | `systems/combat.js:451`, `systems/lootShards.js:66` | `systems/mining.js:81`, `ui/floatingText.js:108` |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:297` | `systems/factionPresence.js:159` |
| `map:sectorCharted` | `systems/world.js:1791` | — |
| `massline:selfSling` | `systems/masslineThrow.js:394` | `systems/flightV3.js:142`, `systems/onboarding.js:314` |
| `massline:threat` | `systems/masslineThreats.js:146` | `systems/presentationOrchestrator.js:84` |
| `massline:throw` | `systems/masslineThrow.js:320` | `systems/tumbleStates.js:53` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:79` | — |
| `massline:tumbled` | `systems/tumbleStates.js:147` | — |
| `mines:armed` | `systems/mines.js:134` | — |
| `mines:capReached` | `systems/mines.js:53` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:82` | `systems/mines.js:34` |
| `mines:placed` | `systems/mines.js:108` | — |
| `mines:released` | `systems/mines.js:226` | — |
| `mines:triggered` | `systems/mines.js:192` | — |
| `mining:beamLocked` | `systems/mining.js:213` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:654` | `systems/missions.js:494`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:227` | `systems/presentationOrchestrator.js:143`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:richCoreChargeStart` | `systems/mining.js:607` | `systems/presentationOrchestrator.js:140` |
| `mining:richCoreCompleted` | `systems/mining.js:634` | `systems/presentationOrchestrator.js:141` |
| `mining:richCoreExposed` | `systems/mining.js:585` | `systems/presentationOrchestrator.js:139` |
| `mining:richCoreFizzle` | `systems/mining.js:636` | `systems/presentationOrchestrator.js:142` |
| `mining:seamHit` | `systems/mining.js:788` | `systems/presentationOrchestrator.js:136` |
| `mining:start` | `systems/mining.js:136` | `audio/audioSystem.js:653`, `render/vfx.js:729`, `systems/onboarding.js:174`, `systems/presentationOrchestrator.js:133` |
| `mining:stop` | `systems/mining.js:154` | `audio/audioSystem.js:654`, `render/vfx.js:730`, `systems/presentationOrchestrator.js:134` |
| `mining:tick` | `systems/automation.js:636`, `systems/automation.js:767`, `systems/mining.js:248` | `audio/audioSystem.js:655`, `render/vfx.js:731`, `systems/presentationOrchestrator.js:135` |
| `mining:yield` | `balance/careerCohorts.js:1805`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:301`, `systems/mining.js:485`, `systems/mining.js:631` | `careers/origins/prospectorOrigin.js:637`, `render/feel.js:692`, `render/vfx.js:732`, `systems/encounterDirector.js:135`, `systems/missions.js:492`, `systems/onboarding.js:175`, `systems/presentationOrchestrator.js:137`, `ui/floatingText.js:93` |
| `miningDrone:sellOre` | — | `systems/economy.js:443` |
| `mission:abandoned` | — | `careers/origins/haulerOriginSystem.js:72`, `ui/hud.js:2650` |
| `mission:accepted` | `systems/missions.js:1254` | `audio/audioSystem.js:663`, `save/saveSystem.js:122`, `systems/aftermathWrecks.js:322`, `systems/contractClauses.js:93`, `systems/onboarding.js:177`, `ui/hud.js:2648`, `ui/screens/missionLog.js:1756`, `ui/screens/stationHub.js:2797` |
| `mission:completed` | `systems/missions.js:2903` | `audio/audioSystem.js:664`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:123`, `systems/aftermathWrecks.js:323`, `systems/contractClauses.js:97`, `systems/factions.js:179`, `systems/story.js:125`, `ui/hud.js:2649`, `ui/screens/missionLog.js:1757`, `ui/screens/stationHub.js:2804` |
| `mission:expired` | `systems/missions.js:2985` | `audio/audioSystem.js:668`, `save/saveSystem.js:125`, `systems/aftermathWrecks.js:325`, `systems/factions.js:188`, `ui/screens/missionLog.js:1759`, `ui/screens/stationHub.js:2806` |
| `mission:failed` | `systems/missions.js:2951` | `audio/audioSystem.js:667`, `careers/origins/haulerOriginSystem.js:71`, `save/saveSystem.js:124`, `systems/aftermathWrecks.js:324`, `systems/factions.js:187`, `ui/screens/missionLog.js:1758`, `ui/screens/stationHub.js:2805` |
| `mission:forceEvent` | — | `systems/economy.js:469` |
| `mission:offerBoarded` | `systems/missions.js:792` | `systems/aftermathWrecks.js:321` |
| `mission:offered` | `systems/aftermathWrecks.js:355`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:403`, `systems/economyContracts.js:221`, `systems/economyContracts.js:242`, `systems/lossLedger.js:273`, `systems/postEndingReplay.js:340`, `systems/salvage.js:223`, `systems/uniqueWrecks.js:684` | `systems/lossInvestigation.js:106`, `systems/missions.js:460`, `systems/survivorPod.js:150` |
| `mission:setPieceTransition` | `systems/missions.js:2768` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:3449` | — |
| `mission:updated` | `systems/missions.js:579`, `systems/missions.js:612`, `systems/missions.js:696`, `systems/missions.js:715`, `systems/missions.js:727`, `systems/missions.js:791`, `systems/missions.js:1190`, `systems/missions.js:1265`, `systems/missions.js:1399`, `systems/missions.js:1522`, `systems/missions.js:1943`, `systems/missions.js:1979`, `systems/missions.js:1992`, `systems/missions.js:2000`, `systems/missions.js:2016`, `systems/missions.js:2039`, `systems/missions.js:2078`, `systems/missions.js:2087`, `systems/missions.js:2108`, `systems/missions.js:2134`, `systems/missions.js:2202`, `systems/missions.js:2218`, `systems/missions.js:2260`, `systems/missions.js:2281`, `systems/missions.js:2317`, `systems/missions.js:2367`, `systems/missions.js:2601`, `systems/missions.js:2627`, `systems/missions.js:2634`, `systems/missions.js:2892`, `systems/missions.js:2962`, `systems/missions.js:2995`, `systems/missions.js:3248`, `systems/missions.js:3350`, `systems/missions.js:3516`, `systems/missions.js:3772`, `systems/missions.js:3918` | `ui/hud.js:2647`, `ui/screens/missionLog.js:1755`, `ui/screens/stationHub.js:2791`, `ui/station/screens/contracts.js:300` |
| `mode:changed` | `main.js:476`, `main.js:486`, `main.js:497`, `save/saveSystem.js:2025` | `render/renderer.js:1330`, `systems/autoTargetAssist.js:90`, `systems/presentationAdapters.js:140`, `systems/scanner.js:568`, `ui/comms.js:463`, `ui/loadingPresenter.js:47`, `ui/screenManager.js:394`, `ui/uiRoot.js:456`, `ui/wingmanRadial.js:180` |
| `module:equipped` | `systems/ships.js:929` | `systems/ships.js:499`, `systems/world.js:219`, `ui/screens/stationHub.js:2777` |
| `module:granted` | `systems/ships.js:752` | — |
| `module:purchased` | `systems/ships.js:739` | `ui/screens/stationHub.js:2779` |
| `module:unequipped` | `systems/ships.js:948` | `systems/ships.js:500`, `systems/world.js:220`, `ui/screens/stationHub.js:2778` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:127` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:413` | — |
| `moralTrap:choose` | — | `systems/moralTrap.js:73` |
| `moralTrap:resolved` | `systems/moralTrap.js:118` | — |
| `moralTrap:revealed` | `systems/moralTrap.js:91` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:827` | — |
| `nav:abortRoute` | — | `systems/routeFollower.js:231` |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:745`, `systems/world.js:2119` | `systems/routeFollower.js:234` |
| `nav:engageRoute` | — | `systems/routeFollower.js:230` |
| `nav:waypoint` | `save/saveSystem.js:2221`, `systems/claims.js:889`, `systems/claims.js:897`, `systems/missions.js:473`, `systems/missions.js:1511`, `systems/missions.js:1578`, `systems/missions.js:1610`, `systems/missions.js:1961`, `systems/world.js:2118`, `ui/screens/market.js:1878` | `ui/screens/stationHub.js:2786`, `ui/screens/stationHub.js:2787` |
| `news:dockCards` | `ui/marketNews.js:222` | — |
| `news:headline` | `systems/aftermathWrecks.js:233`, `systems/e1EncounterRuntime.js:213`, `systems/traffic.js:946`, `ui/marketNews.js:189` | — |
| `news:publish` | `systems/uniqueWrecks.js:327`, `systems/uniqueWrecks.js:1372` | — |
| `patrol:proximity` | `systems/encounterScripts.js:357` | `systems/economy.js:465` |
| `physics:attachmentBroken` | — | `combat/kernel.js:66` |
| `physics:impact` | `core/physics.js:1041` | `systems/collisionConsequences.js:39`, `systems/fragileCargo.js:202`, `systems/masslineImpactDamage.js:39` |
| `pickup:collected` | `core/physics.js:949`, `systems/mining.js:405`, `systems/uniqueWrecks.js:1253` | `audio/audioSystem.js:657`, `render/vfx.js:747`, `systems/cargo.js:133`, `systems/mining.js:83`, `systems/onboarding.js:176`, `systems/presentationOrchestrator.js:144`, `ui/floatingText.js:123` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:188` | `systems/pirateParley.js:41` |
| `pirateParley:demand` | `systems/scanner.js:793` | `ui/pirateParleyPrompt.js:247`, `ui/recoveryEncounterPrompt.js:249`, `ui/sectorLawPresenter.js:223`, `ui/signalInvestigationPrompt.js:166` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:248`, `ui/recoveryEncounterPrompt.js:250` |
| `player:death` | `systems/combat.js:419`, `systems/combat.js:476`, `systems/combat.js:633` | `audio/audioSystem.js:651`, `render/feel.js:636`, `render/vfx.js:728`, `save/saveSystem.js:107`, `ui/commandBar.js:400`, `ui/hud.js:1260` |
| `player:recoveryFailed` | `systems/combat.js:515` | `ui/screens/gameOver.js:256` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:193` | `systems/combat.js:315` |
| `player:respawn` | `systems/combat.js:574`, `systems/combat.js:646` | `audio/audioSystem.js:652`, `render/renderer.js:1229`, `save/saveSystem.js:108`, `save/saveSystem.js:131`, `ui/commandBar.js:404`, `ui/hud.js:1274`, `ui/screens/gameOver.js:248` |
| `player:scannedByPatrol` | `systems/economy.js:1292` | `systems/contractClauses.js:92`, `systems/missions.js:506`, `ui/customsPrompt.js:125` |
| `poi:discovered` | `systems/world.js:2223`, `systems/world.js:2249` | `systems/encounterDirector.js:129` |
| `poi:identified` | `systems/world.js:2252` | `systems/encounterDirector.js:130` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:1778` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:1777` |
| `presentation:audioCue` | `systems/presentationAdapters.js:405` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:352` | — |
| `presentation:caption` | `systems/factionPresence.js:331`, `systems/factionPresence.js:631`, `systems/factionPresence.js:646`, `systems/factionPresence.js:664`, `systems/factionPresence.js:726`, `systems/presentationAdapters.js:494`, `systems/story.js:856`, `systems/story.js:902` | `ui/hud.js:1325` |
| `presentation:cue` | — | `audio/audioSystem.js:721`, `render/vfx.js:744`, `render/vfx.js:745`, `systems/presentationAdapters.js:137` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:334` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:284`, `systems/presentationAdapters.js:476` | — |
| `presentation:vfxCue` | `render/vfx.js:756`, `systems/impulseCharges.js:429`, `systems/masslineThrow.js:322`, `systems/missions.js:1271`, `systems/missions.js:2908`, `systems/presentationAdapters.js:379`, `systems/tumbleStates.js:152` | `render/vfx.js:746` |
| `projectile:hit` | `core/physics.js:524`, `core/physics.js:562`, `systems/sectorSim.js:541` | `audio/audioSystem.js:635`, `render/vfx.js:715`, `systems/combat.js:308` |
| `projectile:nearMiss` | `core/physics.js:540` | `systems/presentationOrchestrator.js:113` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:204` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:246` |
| `recovery:started` | — | `ui/sectorLawPresenter.js:225`, `ui/signalInvestigationPrompt.js:165` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:203` | — |
| `research:pointsChanged` | `systems/missions.js:2871` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:272` | — |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:224` | `systems/encounterDirector.js:131`, `systems/story.js:143` |
| `salvage:completed` | `systems/mining.js:491` | `systems/aftermathWrecks.js:318` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:338` | — |
| `salvage:placed` | `systems/salvage.js:119` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:148` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:604` | — |
| `save:completed` | `save/saveSystem.js:610` | `ui/uiRoot.js:216` |
| `save:error` | `main.js:122`, `save/saveSystem.js:347`, `save/saveSystem.js:402`, `save/saveSystem.js:416`, `save/saveSystem.js:613`, `save/saveSystem.js:780`, `save/saveSystem.js:1054`, `save/saveSystem.js:1744`, `save/saveSystem.js:1749`, `save/saveSystem.js:1779`, `save/saveSystem.js:1787`, `save/saveSystem.js:1798`, `save/saveSystem.js:1843`, `save/saveSystem.js:1861`, `save/saveSystem.js:2042`, `save/saveSystem.js:2050`, `save/saveSystem.js:2077`, `save/saveSystem.js:2399`, `save/saveSystem.js:2412`, `save/saveSystem.js:2426` | `systems/automation.js:432`, `ui/loadingPresenter.js:55`, `ui/screenManager.js:395`, `ui/uiRoot.js:238` |
| `save:exportRecovery` | `save/saveSystem.js:2388` | — |
| `save:loaded` | `save/saveSystem.js:2028` | `audio/audioSystem.js:764`, `careers/origins/haulerOriginSystem.js:65`, `core/physics.js:61`, `main.js:153`, `render/feel.js:571`, `render/renderer.js:1228`, `render/renderer.js:1355`, `render/vfx.js:723`, `save/saveSystem.js:110`, `systems/aftermathWrecks.js:327`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:143`, `systems/automation.js:427`, `systems/beacons.js:37`, `systems/collisionConsequences.js:40`, `systems/combat.js:322`, `systems/economy.js:473`, `systems/encounterDirector.js:115`, `systems/factionPresence.js:165`, `systems/flight.js:74`, `systems/flightV3.js:139`, `systems/gateControlDirector.js:70`, `systems/lossInvestigation.js:108`, `systems/mines.js:38`, `systems/missions.js:451`, `systems/onboarding.js:161`, `systems/presentationAdapters.js:143`, `systems/presentationOrchestrator.js:170`, `systems/routeFollower.js:246`, `systems/sectorSim.js:96`, `systems/ships.js:504`, `systems/spawnBudget.js:49`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:57`, `systems/story.js:97`, `systems/survivorPod.js:153`, `systems/tacticalAI.js:104`, `systems/titles.js:271`, `systems/travelLanes.js:174`, `systems/uniqueLootAbilities.js:117`, `ui/bandHud.js:62`, `ui/hudLayout.js:120`, `ui/priceHistory.js:120`, `ui/radar.js:511`, `ui/uiRoot.js:223`, `ui/uiRoot.js:884` |
| `save:recovered` | `save/saveSystem.js:1768` | `ui/uiRoot.js:231` |
| `save:restoring` | `save/saveSystem.js:1883` | `render/feel.js:570`, `render/renderer.js:1263`, `systems/automation.js:421`, `systems/salvage.js:60`, `systems/stationContactLoadBoundary.js:30` |
| `save:started` | `save/saveSystem.js:405`, `save/saveSystem.js:816` | `ui/uiRoot.js:212` |
| `scan:completed` | `balance/careerCohorts.js:477`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:683`, `systems/world.js:2227` | `careers/origins/prospectorOrigin.js:634`, `systems/missions.js:500`, `systems/onboarding.js:188`, `systems/presentationOrchestrator.js:129`, `systems/salvage.js:57`, `systems/salvageActions.js:70`, `systems/story.js:135`, `ui/hud.js:2965` |
| `scan:pulse` | `systems/scanner.js:622` | `systems/buildIdentity.js:268`, `systems/encounterDirector.js:122`, `systems/pirateDisguise.js:16`, `systems/presentationOrchestrator.js:128`, `systems/scanReveal.js:14`, `ui/hud.js:2966` |
| `scan:shipRevealed` | `systems/scanReveal.js:37` | `systems/buildIdentity.js:267` |
| `scan:weakPoint` | `systems/scanner.js:672` | `ui/hud.js:863` |
| `scanner:ghostEscaped` | `systems/scanner.js:605` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:651` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:137` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:154` | `systems/presentationOrchestrator.js:65` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:572` | `systems/presentationOrchestrator.js:167`, `ui/comms.js:230` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:359` | `ui/comms.js:226` |
| `scenario:factChanged` | `systems/scenarioRuntime.js:547` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:132` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:122` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:189` | `ui/comms.js:416` |
| `scenario:scavengerResponse` | `ui/comms.js:437`, `ui/comms.js:441` | `systems/scenarioRuntime.js:29` |
| `sector:discovered` | `systems/world.js:415` | `systems/presentationOrchestrator.js:126` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:428` | `audio/audioSystem.js:696`, `render/renderer.js:1297`, `render/vfx.js:722`, `save/saveSystem.js:120`, `systems/aftermathWrecks.js:316`, `systems/asteroidFormations.js:120`, `systems/asteroidSites.js:142`, `systems/automation.js:456`, `systems/claims.js:140`, `systems/economy.js:457`, `systems/encounterDirector.js:111`, `systems/factionPresence.js:156`, `systems/lossInvestigation.js:105`, `systems/mines.js:36`, `systems/mining.js:86`, `systems/missions.js:520`, `systems/moralTrap.js:72`, `systems/presentationOrchestrator.js:157`, `systems/routeFollower.js:238`, `systems/salvage.js:55`, `systems/sectorSim.js:95`, `systems/story.js:112`, `systems/story.js:134`, `systems/survivorPod.js:149`, `systems/traffic.js:194`, `systems/wingmen.js:48`, `ui/causeLedger.js:132`, `ui/commandBar.js:410`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/radar.js:512`, `ui/radar.js:513`, `ui/sectorLawPresenter.js:215`, `ui/sectorPostcard.js:136`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:363` | `render/renderer.js:1275`, `systems/aftermathWrecks.js:317`, `systems/automation.js:445`, `systems/encounterDirector.js:113`, `systems/factionPresence.js:157`, `systems/gateControlDirector.js:69`, `systems/mines.js:35`, `systems/missions.js:521`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:45`, `systems/stationSideEventDirector.js:56`, `systems/traffic.js:197`, `systems/wingmen.js:51`, `ui/customsPrompt.js:127`, `ui/encounterChoicePrompt.js:145` |
| `sectorsim:embodiment` | `systems/sectorSim.js:763` | `systems/world.js:231` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:311` | `ui/screens/starmap.js:578` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:405`, `systems/claims.js:852`, `systems/encounterDirector.js:1007` | `systems/sectorSim.js:101` |
| `sectorsim:intel` | `systems/sectorSim.js:817` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:614` | `systems/economy.js:477` |
| `sectorsim:reconcile` | `systems/sectorSim.js:587` | — |
| `sectorsim:tick` | `systems/sectorSim.js:256` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:552` | `ui/screens/starmap.js:579` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:528` | — |
| `settings:changed` | `save/saveSystem.js:2058`, `save/saveSystem.js:2059`, `systems/touch.js:250`, `ui/screens/settings.js:229`, `ui/screens/settings.js:517`, `ui/screens/settings.js:592` | `audio/audioSystem.js:742`, `main.js:152`, `render/renderer.js:1234`, `render/vfx.js:724`, `save/saveSystem.js:102`, `ui/uiRoot.js:352` |
| `ship:appearanceChanged` | `systems/ships.js:651`, `systems/ships.js:869` | `render/renderer.js:1218`, `render/vfx.js:721` |
| `ship:appearanceSaved` | `systems/ships.js:871` | — |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:184` | `audio/audioSystem.js:701`, `render/feel.js:706`, `render/vfx.js:734`, `systems/cruise.js:25` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:185`, `systems/flightV3.js:377` | `audio/audioSystem.js:706`, `render/renderer.js:1223`, `render/vfx.js:735` |
| `ship:cargoCapChanged` | `systems/ships.js:646` | `systems/cargo.js:157` |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:356` | `audio/audioSystem.js:707`, `render/vfx.js:736`, `systems/uniqueLootAbilities.js:115` |
| `ship:massChanged` | `systems/ships.js:768` | — |
| `ship:purchased` | `systems/ships.js:803` | `audio/audioSystem.js:695`, `systems/missions.js:524`, `systems/onboarding.js:178`, `ui/screens/stationHub.js:2775` |
| `ship:roleContext` | `systems/ships.js:586` | `systems/presentationAdapters.js:139` |
| `ship:sold` | `systems/ships.js:824` | `ui/screens/stationHub.js:2776` |
| `ship:statsChanged` | `systems/ships.js:645` | `systems/cargo.js:158`, `systems/world.js:221`, `ui/commandBar.js:405`, `ui/hud.js:2646`, `ui/screens/stationHub.js:2749`, `ui/screens/stationHub.js:2771`, `ui/screens/stationHub.js:2772`, `ui/screens/stationHub.js:2773`, `ui/screens/stationHub.js:2774` |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1239` | `render/vfx.js:733` |
| `signal:investigated` | `systems/scanner.js:941` | `systems/missions.js:503`, `systems/presentationOrchestrator.js:132`, `ui/signalInvestigationPrompt.js:164` |
| `signal:receipt` | `systems/scanner.js:942` | — |
| `signal:scanResults` | `systems/scanner.js:684` | `systems/presentationOrchestrator.js:130`, `ui/sectorLawPresenter.js:224`, `ui/signalInvestigationPrompt.js:162` |
| `signal:track` | `ui/signalInvestigationPrompt.js:138` | `systems/scanner.js:562` |
| `signal:tracked` | `systems/scanner.js:769` | `systems/presentationOrchestrator.js:131`, `ui/signalInvestigationPrompt.js:163` |
| `sim:jumpGate` | — | `systems/economy.js:463` |
| `sim:pause` | `ui/screenManager.js:252` | `audio/audioSystem.js:754`, `render/feel.js:568` |
| `sim:resume` | `ui/screenManager.js:259` | `audio/audioSystem.js:755` |
| `site:anchored` | `systems/asteroidSites.js:501` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1140` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1068` | — |
| `site:courierLost` | `systems/asteroidSites.js:1123` | — |
| `site:created` | `systems/asteroidSites.js:456` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:565`, `systems/asteroidSites.js:649` | — |
| `site:lost` | `systems/asteroidSites.js:758` | — |
| `site:machineInstalled` | `systems/asteroidSites.js:480` | — |
| `site:machineMode` | `systems/asteroidSites.js:671` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:582` | — |
| `site:overlayChanged` | `systems/asteroidSites.js:655` | — |
| `site:podBuilt` | `systems/asteroidSites.js:985` | — |
| `site:rematerialized` | `systems/asteroidSites.js:803` | — |
| `spawn:request` | `systems/automation.js:1137` | `systems/world.js:223` |
| `station:broadcastTic` | `systems/stationBroadcast.js:203` | — |
| `station:exitRequest` | `ui/screenManager.js:359`, `ui/uiRoot.js:754` | `ui/screens/stationHub.js:2728`, `ui/station/stationApp.js:781` |
| `station:navigate` | `ui/station/screens/bar.js:195`, `ui/station/screens/bar.js:200`, `ui/station/screens/industry.js:155` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:187` | — |
| `stationContact:changed` | `systems/stationContacts.js:125` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:90` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:149` | — |
| `story:beatAdvanced` | `systems/missions.js:3758` | `save/saveSystem.js:127`, `systems/story.js:92`, `ui/screens/codex.js:305` |
| `story:elroyResolved` | `systems/missions.js:2404` | `systems/story.js:93` |
| `story:kurtzLedger` | `systems/story.js:1123`, `systems/story.js:1134` | — |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:907` | — |
| `story:postEndingContinuity` | `systems/story.js:1026` | — |
| `story:postEndingProgress` | `systems/story.js:996` | `ui/screens/missionLog.js:1775` |
| `story:replayHookUnlocked` | `systems/story.js:1011` | `ui/screens/missionLog.js:1776` |
| `story:vergeEvidenceRecorded` | `systems/story.js:881` | — |
| `story:vergeObserversRevealed` | `systems/story.js:855` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:901` | — |
| `survivorPod:choose` | — | `systems/survivorPod.js:151` |
| `survivorPod:promoted` | `systems/survivorPod.js:235` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:329` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:341` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:380` | — |
| `tech:researched` | `systems/ships.js:688` | `audio/audioSystem.js:694`, `systems/onboarding.js:269`, `systems/ships.js:501`, `ui/screens/manufacture.js:218`, `ui/screens/stationHub.js:2780` |
| `tether:attached` | `combat/attachments.js:161` | `render/vfx.js:711`, `systems/encounterDirector.js:126`, `systems/presentationOrchestrator.js:66`, `systems/scenarioRuntime.js:23`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:159`, `systems/tetherGameplay.js:472` | `careers/origins/prospectorOrigin.js:646`, `systems/onboarding.js:186`, `systems/surrenderRecovery.js:34` |
| `tether:broken` | `combat/attachments.js:277` | `render/feel.js:717`, `render/renderer.js:1225`, `render/vfx.js:712`, `systems/presentationOrchestrator.js:74`, `systems/scenarioRuntime.js:27` |
| `tether:cut` | `systems/tetherGameplay.js:135`, `systems/tetherGameplay.js:634` | `systems/masslineThrow.js:58` |
| `tether:latchDenied` | `systems/tetherGameplay.js:86`, `systems/tetherGameplay.js:199`, `systems/tetherGameplay.js:205`, `systems/tetherGameplay.js:214`, `systems/tetherGameplay.js:233` | — |
| `tether:latched` | `systems/tetherGameplay.js:249` | `careers/origins/prospectorOrigin.js:643`, `systems/flightV3.js:141`, `systems/onboarding.js:181`, `systems/onboarding.js:296`, `systems/onboarding.js:307`, `systems/surrenderRecovery.js:31`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:535` | — |
| `tether:nearBreak` | `combat/attachments.js:456` | `systems/onboarding.js:187`, `systems/presentationOrchestrator.js:67` |
| `tether:reel` | `combat/attachments.js:211` | `systems/missions.js:504`, `systems/onboarding.js:184`, `systems/surrenderRecovery.js:32` |
| `tether:reelPump` | `systems/masslineTelemetry.js:247` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:137`, `systems/tetherGameplay.js:160`, `systems/tetherGameplay.js:470`, `systems/tetherGameplay.js:473`, `systems/tetherGameplay.js:636` | `systems/presentationOrchestrator.js:106` |
| `tether:released` | `systems/tetherGameplay.js:136`, `systems/tetherGameplay.js:469`, `systems/tetherGameplay.js:635` | `render/renderer.js:1224`, `systems/onboarding.js:185`, `systems/surrenderRecovery.js:33` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:325` | — |
| `tether:strain` | `systems/tetherGameplay.js:575` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:184` | `systems/combat.js:309`, `systems/masslineImpactDamage.js:38`, `systems/presentationOrchestrator.js:95`, `systems/tumbleStates.js:52` |
| `title:holdResolved` | — | `systems/titles.js:269` |
| `touch:uiAction` | `systems/touch.js:219` | `ui/input.js:505` |
| `tutorial:finished` | `systems/onboarding.js:686` | `systems/missions.js:450`, `systems/story.js:99` |
| `tutorial:say` | `systems/onboarding.js:468` | `systems/story.js:105` |
| `ui:abandonMission` | `ui/screens/missionLog.js:1689` | `systems/missions.js:455` |
| `ui:acceptMission` | `ui/screens/bar.js:1031`, `ui/screens/stationHub.js:1978`, `ui/station/screens/contracts.js:290` | `systems/missions.js:454` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | `ui/screens/market.js:635` | `careers/origins/haulerOriginSystem.js:88`, `systems/economy.js:424` |
| `ui:buyModule` | `ui/screens/outfitting.js:803`, `ui/station/screens/shipworks.js:1101` | `systems/onboarding.js:263`, `systems/ships.js:514` |
| `ui:buyShip` | `ui/screens/shipyard.js:839`, `ui/screens/shipyard.js:861`, `ui/station/screens/shipworks.js:1017` | `systems/ships.js:512` |
| `ui:cancel` | `ui/input.js:740`, `ui/input.js:754` | — |
| `ui:click` | — | `audio/audioSystem.js:758` |
| `ui:closeAll` | `main.js:448` | `ui/uiRoot.js:636` |
| `ui:closeCargo` | `ui/input.js:125`, `ui/input.js:195` | `ui/hud.js:2620` |
| `ui:closeComms` | `ui/input.js:190` | `ui/comms.js:303` |
| `ui:confirm` | `ui/input.js:748` | `audio/audioSystem.js:760` |
| `ui:cycleTarget` | `ui/input.js:229`, `ui/input.js:801` | `ui/uiRoot.js:637` |
| `ui:deny` | — | `audio/audioSystem.js:761` |
| `ui:drillFadeStart` | `ui/input.js:395` | `ui/uiRoot.js:784` |
| `ui:endgameChoose` | `systems/missions.js:1199` | `systems/story.js:116` |
| `ui:endgameConfirm` | — | `systems/story.js:117` |
| `ui:endgameDecline` | `ui/comms.js:374` | `systems/story.js:118` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1551` | `systems/story.js:119` |
| `ui:factionPresenceService` | `ui/screens/services.js:375` | `systems/factionPresence.js:163`, `ui/screens/stationHub.js:2729` |
| `ui:fitModule` | `ui/screens/outfitting.js:738` | `systems/onboarding.js:259`, `systems/ships.js:515` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:940` | `systems/automation.js:413`, `systems/wingmen.js:59` |
| `ui:heliosBay7Scan` | — | `systems/story.js:138` |
| `ui:hover` | — | `audio/audioSystem.js:759` |
| `ui:kurtzInteract` | — | `systems/story.js:137` |
| `ui:navigate` | `ui/input.js:728`, `ui/input.js:732`, `ui/input.js:779` | — |
| `ui:popScreen` | `ui/galaxyMap.js:3614`, `ui/screens/automationPanel.js:434`, `ui/screens/starmap.js:424` | `ui/uiRoot.js:634` |
| `ui:purchaseSurveyData` | `ui/screens/bar.js:1013`, `ui/station/screens/bar.js:186` | `systems/world.js:224` |
| `ui:pushScreen` | `ui/mapAuthority.js:133`, `ui/screens/bar.js:396`, `ui/screens/gameOver.js:206`, `ui/screens/starmap.js:432`, `ui/screens/stationHub.js:379`, `ui/station/stationApp.js:408` | `ui/uiRoot.js:611` |
| `ui:replaceScreen` | — | `ui/uiRoot.js:635` |
| `ui:sell` | `ui/screens/market.js:444`, `ui/screens/stationHub.js:1555` | `careers/origins/haulerOriginSystem.js:89`, `systems/economy.js:425` |
| `ui:sellShip` | `ui/screens/shipyard.js:812` | — |
| `ui:service` | `balance/careerCohorts.js:699`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/screens/services.js:436`, `ui/screens/stationHub.js:1706`, `ui/station/stationApp.js:663` | `systems/economy.js:460` |
| `ui:setActiveShip` | `ui/screens/shipyard.js:817`, `ui/station/screens/shipworks.js:1020` | `systems/ships.js:513` |
| `ui:setCourse` | `systems/factionPresence.js:657`, `systems/input.js:919`, `systems/missions.js:1598`, `systems/scanner.js:768`, `ui/galaxyMap.js:1855`, `ui/galaxyMap.js:1867`, `ui/galaxyMap.js:7103`, `ui/screens/localmap.js:586`, `ui/screens/market.js:1880`, `ui/screens/starmap.js:1226`, `ui/screens/starmap.js:1239`, `ui/screens/starmap.js:1243` | `systems/world.js:217` |
| `ui:setShipAppearance` | — | `systems/ships.js:518` |
| `ui:talkContact` | `ui/screens/bar.js:1075`, `ui/station/screens/bar.js:167` | `systems/story.js:139` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:31`, `combat/autoTargetMode.js:137` | `ui/uiRoot.js:638` |
| `ui:toggleCargo` | `ui/input.js:255` | `ui/hud.js:2619` |
| `ui:toggleComms` | `ui/input.js:272` | `ui/comms.js:302` |
| `ui:toggleOverview` | `ui/input.js:259` | `ui/hud.js:2975` |
| `ui:trackMission` | `ui/galaxyMap.js:4919`, `ui/screens/missionLog.js:1547`, `ui/screens/missionLog.js:1607`, `ui/screens/missionLog.js:1668`, `ui/station/screens/contracts.js:294` | `systems/missions.js:456` |
| `ui:undock` | — | `ui/input.js:504` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:1105` | `systems/ships.js:516` |
| `ui:unlockTech` | `ui/screens/techTree.js:579` | `systems/ships.js:517` |
| `ui:wingOrder` | `ui/wingmanRadial.js:124` | `systems/automation.js:414` |
| `ui:wingmanRadial` | `ui/input.js:265` | `ui/wingmanRadial.js:178` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:305` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:257` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:192` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1134` | `systems/missions.js:513` |
| `uniqueWreck:choose` | `systems/missions.js:2152`, `ui/recoveryEncounterPrompt.js:199` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:573` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:591`, `systems/uniqueWrecks.js:748`, `systems/uniqueWrecks.js:951` | `systems/missions.js:514` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1194` | `systems/missions.js:516`, `ui/recoveryEncounterPrompt.js:247` |
| `uniqueWreck:decisionRequest` | `ui/recoveryEncounterPrompt.js:250`, `ui/recoveryEncounterPrompt.js:252` | — |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:810` | `systems/missions.js:515` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:840` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:750` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1370` | `systems/missions.js:517`, `ui/recoveryEncounterPrompt.js:248` |
| `uniqueWreck:rumorHeard` | `ui/screens/bar.js:1089`, `ui/station/screens/bar.js:175` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:465` | `systems/missions.js:512` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1371` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1113` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1301` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:314` | — |
| `voice:clear` | `ui/voiceArbiter.js:339`, `ui/voiceArbiter.js:383` | `ui/alerts.js:259` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:297` |
| `voice:say` | `ui/alerts.js:161` | `ui/voiceArbiter.js:296` |
| `voice:surface` | `ui/voiceArbiter.js:344`, `ui/voiceArbiter.js:393` | `ui/alerts.js:258` |
| `weapons:vent` | `systems/weapons.js:223`, `systems/weapons.js:243` | `audio/audioSystem.js:679`, `ui/hud.js:2686` |
| `wingMorale:broken` | `systems/wingMorale.js:206` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:274` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:301` | — |
| `wingOrder:accepted` | `systems/automation.js:1591` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1592` | — |
| `wingOrder:converted` | `systems/wingmen.js:307` | — |
| `wingOrder:status` | `systems/automation.js:1593` | — |
| `world:membership` | `systems/world.js:421` | `systems/presentationOrchestrator.js:120` |
| `world:originShift` | `systems/world.js:1841` | — |
| `world:playerRelocated` | `systems/world.js:1728` | — |
| `world:requestJump` | `ui/galaxyMap.js:1853`, `ui/screens/starmap.js:1238` | `systems/world.js:214` |
| `world:requestRoute` | `ui/galaxyMap.js:1865`, `ui/galaxyMap.js:4936`, `ui/galaxyMap.js:7101`, `ui/screens/starmap.js:1225`, `ui/screens/starmap.js:1242` | `systems/world.js:215` |
| `world:requestSectorScan` | — | `systems/world.js:216` |
| `world:residency` | `systems/world.js:536`, `systems/world.js:912` | `render/renderer.js:1205` |
| `world:zoneEntered` | `systems/world.js:1868` | `data/hazardLanguage.js:101` |
| `world:zoneExited` | `systems/world.js:1871` | `data/hazardLanguage.js:102` |

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
- `game:newGame` — 10 subscriber(s)
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
- `nav:abortRoute` — 1 subscriber(s)
- `nav:engageRoute` — 1 subscriber(s)
- `physics:attachmentBroken` — 1 subscriber(s)
- `pirateParley:resolved` — 2 subscriber(s)
- `postEndingReplay:cycleCompleted` — 1 subscriber(s)
- `presentation:cue` — 4 subscriber(s)
- `recovery:completed` — 1 subscriber(s)
- `recovery:started` — 2 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `sim:jumpGate` — 1 subscriber(s)
- `survivorPod:choose` — 1 subscriber(s)
- `title:holdResolved` — 1 subscriber(s)
- `ui:click` — 1 subscriber(s)
- `ui:deny` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
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
- `combat:collisionConsequence` — 1 emitter(s)
- `combat:collisionDebris` — 1 emitter(s)
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
- `formation:discovered` — 1 emitter(s)
- `freight:arrival` — 1 emitter(s)
- `freight:loss` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `lossInvestigation:promoted` — 1 emitter(s)
- `map:sectorCharted` — 1 emitter(s)
- `massline:tumbleEnd` — 1 emitter(s)
- `massline:tumbled` — 1 emitter(s)
- `mines:armed` — 1 emitter(s)
- `mines:capReached` — 1 emitter(s)
- `mines:placed` — 1 emitter(s)
- `mines:released` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
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
- `station:sideEvent` — 1 emitter(s)
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
- `tether:latchDenied` — 5 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
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
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `wingOrder:blocked` — 1 emitter(s)
- `wingOrder:converted` — 1 emitter(s)
- `wingOrder:status` — 1 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:playerRelocated` — 1 emitter(s)
