# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-07-08 · 331 events · 1162 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:333` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:153` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:258` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:188` | — |
| `ai:flee` | `systems/ai.js:235`, `systems/wingMorale.js:234` | `render/vfx.js:369`, `systems/barkDirector.js:36`, `systems/combatOutcome.js:103` |
| `ai:formationBroken` | `systems/ai.js:404`, `systems/wingMorale.js:205` | `render/vfx.js:370` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:37` |
| `ai:stateChange` | `systems/ai.js:232` | — |
| `ai:telegraph` | `systems/ai.js:300` | `render/vfx.js:368` |
| `aiTrader:requestTrade` | `systems/traffic.js:347` | `systems/economy.js:266` |
| `asset:deployed` | `systems/automation.js:581`, `systems/automation.js:931`, `systems/automation.js:968`, `systems/automation.js:1034` | `systems/missions.js:239`, `systems/onboarding.js:237` |
| `asteroid:chunked` | `systems/mining.js:504` | — |
| `asteroid:destroyed` | `systems/automation.js:484`, `systems/mining.js:272` | `audio/audioSystem.js:235`, `systems/fieldDepletion.js:182`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/vfx.js:390`, `systems/ai.js:675`, `systems/beacons.js:52`, `systems/beacons.js:57`, `systems/beacons.js:80`, `systems/claims.js:86`, `systems/claims.js:123`, `systems/countermeasures.js:189`, `systems/crafting.js:221`, `systems/crafting.js:231`, `systems/impulseCharges.js:365`, `systems/mining.js:575`, `systems/presentationAdapters.js:184`, `systems/salvage.js:204`, `ui/hud.js:899`, `ui/hud.js:924`, `ui/hud.js:932`, `ui/hud.js:1023`, `ui/hud.js:1142`, `ui/hud.js:1346`, `ui/input.js:45`, `ui/input.js:82`, `ui/input.js:91`, `ui/input.js:103`, `ui/input.js:109`, `ui/input.js:137`, `ui/input.js:174`, `ui/input.js:306`, `ui/input.js:456`, `ui/input.js:534`, `ui/input.js:542`, `ui/input.js:548`, `ui/input.js:573`, `ui/input.js:584`, `ui/input.js:600`, `ui/screens/bar.js:936`, `ui/screens/bar.js:965`, `ui/screens/bar.js:983`, `ui/screens/bar.js:1024`, `ui/screens/drill.js:943`, `ui/screens/drill.js:949`, `ui/screens/drill.js:954`, `ui/screens/market.js:395`, `ui/screens/market.js:397`, `ui/screens/market.js:478`, `ui/screens/market.js:488`, `ui/screens/market.js:539`, `ui/screens/market.js:558`, `ui/screens/market.js:591`, `ui/screens/market.js:597`, `ui/screens/market.js:607`, `ui/screens/market.js:691`, `ui/screens/market.js:911`, `ui/screens/market.js:1313`, `ui/screens/missionLog.js:812`, `ui/screens/missionLog.js:816`, `ui/screens/missionLog.js:830`, `ui/screens/missionLog.js:850`, `ui/screens/outfitting.js:478`, `ui/screens/outfitting.js:511`, `ui/screens/outfitting.js:515`, `ui/screens/outfitting.js:541`, `ui/screens/services.js:347`, `ui/screens/services.js:360`, `ui/screens/services.js:365`, `ui/screens/shipyard.js:437`, `ui/screens/shipyard.js:442`, `ui/screens/shipyard.js:462`, `ui/screens/stationHub.js:731`, `ui/screens/stationHub.js:747`, `ui/screens/stationHub.js:753`, `ui/screens/stationHub.js:823`, `ui/screens/stationHub.js:835`, `ui/screens/stationHub.js:839`, `ui/screens/stationHub.js:851`, `ui/screens/stationHub.js:867`, `ui/screens/stationHub.js:930`, `ui/screens/stationHub.js:1144`, `ui/uiRoot.js:425`, `ui/uiRoot.js:479`, `ui/wingmanRadial.js:74`, `ui/wingmanRadial.js:91`, `ui/wingmanRadial.js:109`, `ui/wingmanRadial.js:117`, `ui/wingmanRadial.js:125` | `audio/audioSystem.js:284` |
| `automation:assetDistressed` | `systems/automation.js:805` | — |
| `automation:assetLost` | `systems/automation.js:1119` | `systems/intervention.js:37`, `systems/lossLedger.js:312` |
| `automation:assetRepossessed` | `systems/automation.js:829` | — |
| `automation:incomeCredited` | `systems/automation.js:857` | — |
| `automation:offlineSummary` | `systems/automation.js:1200` | — |
| `automation:outpostRaided` | `systems/automation.js:738`, `systems/automation.js:1271` | `systems/lossLedger.js:313` |
| `beacon:deploy` | — | `systems/beacons.js:35` |
| `beacon:deployed` | `systems/beacons.js:75` | — |
| `boss:defeated` | `systems/world.js:151` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:290` | — |
| `camera:kill` | `render/feel.js:389`, `render/feel.js:538` | `render/renderer.js:704` |
| `camera:shake` | `render/vfx.js:883`, `render/vfx.js:1144`, `systems/combat.js:269`, `systems/combat.js:338`, `systems/combat.js:354`, `systems/combat.js:406`, `systems/drill.js:349`, `systems/intervention.js:106`, `systems/presentationAdapters.js:148` | `render/renderer.js:703` |
| `camera:zoom` | `ui/input.js:224`, `ui/input.js:225`, `ui/input.js:351` | `render/renderer.js:710` |
| `cargo:changed` | `systems/cargo.js:41`, `systems/mining.js:673` | `ui/cargoConscience.js:122`, `ui/commandBar.js:360`, `ui/hud.js:944`, `ui/hud.js:973`, `ui/hudMeta.js:152`, `ui/screens/manufacture.js:214`, `ui/screens/stationHub.js:1384`, `ui/screens/stationHub.js:1385`, `ui/screens/stationHub.js:1386` |
| `cargo:delivered` | `systems/missions.js:1164` | — |
| `cargo:full` | `systems/cargo.js:62`, `systems/mining.js:380`, `systems/mining.js:641` | `systems/onboarding.js:192`, `ui/alerts.js:133`, `ui/floatingText.js:135` |
| `cargo:jettison` | `ui/hud.js:903` | `ui/hud.js:907` |
| `charge:combo` | `systems/impulseCharges.js:250`, `systems/impulseCharges.js:344` | — |
| `charge:detonated` | `systems/impulseCharges.js:352` | `render/feel.js:484`, `render/vfx.js:367` |
| `charge:stuck` | `systems/impulseCharges.js:157` | — |
| `charge:thrown` | `systems/impulseCharges.js:213` | — |
| `claim:claimed` | `systems/claims.js:85` | `systems/onboarding.js:244` |
| `claim:moduleBuilt` | `systems/claims.js:122` | — |
| `claim:teleportRequest` | `systems/claims.js:136` | — |
| `combat:actionCancelled` | `combat/actions.js:285` | — |
| `combat:actionCompleted` | `combat/actions.js:271` | — |
| `combat:actionPhase` | `combat/actions.js:157` | — |
| `combat:actionRejected` | `combat/actions.js:299` | — |
| `combat:actionStarted` | `combat/actions.js:127` | `systems/scenarioRuntime.js:20` |
| `combat:baseDestroyed` | — | `systems/economy.js:297` |
| `combat:beamStop` | `systems/weapons.js:145` | `audio/audioSystem.js:215` |
| `combat:damage` | `combat/damage.js:163` | `audio/audioSystem.js:217`, `render/feel.js:332`, `render/vfx.js:347`, `systems/ai.js:89`, `systems/cruise.js:21`, `systems/encounterDirector.js:91`, `systems/heat.js:118`, `systems/onboarding.js:162`, `systems/onboarding.js:169`, `systems/presentationOrchestrator.js:82`, `systems/stationBroadcast.js:138`, `ui/alerts.js:124`, `ui/commandBar.js:356`, `ui/floatingText.js:75`, `ui/floatingText.js:83`, `ui/hud.js:382`, `ui/hud.js:573` |
| `combat:fire` | `systems/weapons.js:362`, `systems/weapons.js:433` | `audio/audioSystem.js:214`, `render/feel.js:402`, `render/vfx.js:345`, `systems/cruise.js:28`, `ui/hud.js:985` |
| `combat:hit` | `systems/salvageActions.js:137` | — |
| `combat:hitAsset` | `systems/wingmen.js:60` | `systems/automation.js:188` |
| `combat:lockChanged` | — | `systems/world.js:121`, `ui/alerts.js:129` |
| `combat:outcome` | `systems/combatOutcome.js:160` | `systems/barkDirector.js:38` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:161` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:69` |
| `combat:requestAction` | — | `combat/kernel.js:67` |
| `combat:routeDamage` | `systems/impulseCharges.js:393` | `combat/kernel.js:68` |
| `combat:statusApplied` | `combat/statuses.js:142` | — |
| `combat:statusExpired` | `combat/statuses.js:53` | — |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:104`, `systems/presentationOrchestrator.js:83`, `systems/wingMorale.js:141` |
| `combat:surrendered` | — | `systems/combatOutcome.js:105` |
| `combat:weakPointHit` | `systems/combat.js:323` | `ui/floatingText.js:87` |
| `comms:log` | `systems/encounterScripts.js:365`, `systems/salvage.js:202` | — |
| `comms:popup` | `systems/ai.js:459`, `systems/missions.js:1231`, `systems/story.js:266` | `ui/comms.js:189`, `ui/screens/codex.js:301` |
| `conflict:flip` | `systems/factions.js:384` | `systems/sectorSim.js:86` |
| `conflict:warDeclared` | `systems/factions.js:341` | — |
| `contraband:bribe` | `systems/encounterScripts.js:215`, `ui/customsPrompt.js:174` | `systems/economy.js:293` |
| `contraband:scanned` | `systems/economy.js:889` | `systems/encounterDirector.js:92`, `systems/factions.js:196`, `systems/heat.js:121`, `ui/customsPrompt.js:126` |
| `contract:clauseBroken` | `systems/contractClauses.js:164` | — |
| `contract:clauseHonored` | `systems/contractClauses.js:155` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:185` | — |
| `craft:complete` | `systems/crafting.js:220`, `systems/crafting.js:257` | `ui/screens/manufacture.js:216` |
| `craft:queueChanged` | `systems/crafting.js:122`, `systems/crafting.js:230`, `systems/crafting.js:259` | `systems/onboarding.js:250`, `ui/screens/manufacture.js:217` |
| `credits:changed` | `systems/economy.js:735`, `systems/economy.js:746` | `audio/audioSystem.js:237`, `ui/commandBar.js:361`, `ui/hud.js:972`, `ui/screens/manufacture.js:215`, `ui/screens/stationHub.js:1387`, `ui/screens/stationHub.js:1388` |
| `cruise:charging` | `systems/cruise.js:88` | `render/vfx.js:364` |
| `cruise:dropped` | `systems/cruise.js:99` | `render/vfx.js:366` |
| `cruise:engaged` | `systems/cruise.js:64` | `render/vfx.js:365` |
| `cruise:snareRequest` | `systems/encounterScripts.js:274` | `systems/cruise.js:33` |
| `cruise:snared` | `systems/cruise.js:98` | — |
| `customs:breakScan` | `ui/customsPrompt.js:178` | — |
| `customs:submit` | `ui/customsPrompt.js:170` | — |
| `danger:miningNoise` | `systems/mining.js:685` | — |
| `day:tick` | `core/coreSystem.js:96` | `systems/encounterDirector.js:84`, `systems/factions.js:212`, `systems/sectorSim.js:72` |
| `distress:rescued` | `systems/encounterScripts.js:364` | `systems/factions.js:205` |
| `dock:attempt` | — | `ui/dockDenyBanner.js:100` |
| `dock:denied` | `ui/dockDenyBanner.js:125` | — |
| `dock:docked` | `ui/input.js:44` | `audio/audioSystem.js:248`, `save/saveSystem.js:77`, `systems/combat.js:240`, `systems/economy.js:280`, `systems/economyContracts.js:78`, `systems/mining.js:81`, `systems/missions.js:207`, `systems/onboarding.js:140`, `systems/onboarding.js:209`, `systems/story.js:75`, `ui/alerts.js:116`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:121`, `ui/dockDenyBanner.js:101`, `ui/priceForecast.js:86`, `ui/securityReadout.js:98`, `ui/uiRoot.js:413`, `ui/wingmanRadial.js:140` |
| `dock:range` | `core/physics.js:556`, `core/physics.js:560` | `systems/onboarding.js:176`, `ui/alerts.js:112`, `ui/hud.js:361`, `ui/input.js:33` |
| `dock:undocked` | `ui/input.js:345`, `ui/screens/stationHub.js:840`, `ui/screens/stationHub.js:868` | `audio/audioSystem.js:249`, `save/saveSystem.js:78`, `systems/combat.js:244`, `systems/economy.js:283`, `systems/missions.js:215`, `ui/input.js:37`, `ui/uiRoot.js:440` |
| `drill:end` | `systems/drill.js:155` | — |
| `drill:gasHit` | `systems/drill.js:348` | `ui/screens/drill.js:946` |
| `drill:spark` | `systems/drill.js:315` | `ui/screens/drill.js:957` |
| `drill:start` | `systems/drill.js:144` | `systems/onboarding.js:215` |
| `drill:warn` | `systems/drill.js:224`, `systems/drill.js:231`, `systems/drill.js:286`, `systems/drill.js:301`, `systems/drill.js:338` | `ui/screens/drill.js:952` |
| `drill:yield` | `systems/drill.js:336` | `ui/screens/drill.js:938` |
| `economy:applyTradePressure` | `systems/automation.js:366`, `systems/automation.js:662`, `systems/automation.js:663`, `systems/encounterDirector.js:670`, `systems/sectorSim.js:313` | `systems/economy.js:274` |
| `economy:chargeCredits` | `systems/automation.js:760`, `systems/automation.js:767`, `systems/automation.js:1193`, `systems/automation.js:1353`, `systems/beacons.js:61`, `systems/claims.js:68`, `systems/claims.js:113`, `systems/encounterDirector.js:664`, `systems/gateControlDirector.js:119`, `systems/missions.js:608`, `systems/ships.js:562`, `systems/ships.js:613`, `systems/ships.js:640`, `systems/world.js:882`, `systems/world.js:1121` | `systems/economy.js:252` |
| `economy:eventEnded` | `systems/economy.js:971` | `ui/floatingText.js:151`, `ui/screens/stationHub.js:1425` |
| `economy:eventStarted` | `systems/economy.js:946` | `ui/floatingText.js:140`, `ui/screens/stationHub.js:1424` |
| `economy:grantCredits` | `systems/automation.js:853`, `systems/combat.js:356`, `systems/combat.js:360`, `systems/combat.js:392`, `systems/encounterDirector.js:665`, `systems/mining.js:591`, `systems/missions.js:1250`, `systems/missions.js:1252`, `systems/missions.js:1632`, `systems/moralTrap.js:133`, `systems/ships.js:665`, `systems/story.js:483`, `systems/survivorPod.js:368` | `systems/economy.js:251` |
| `economy:marketOpened` | `ui/screens/market.js:1241` | `systems/economy.js:257` |
| `economy:tick` | `systems/economy.js:356` | `ui/priceHistory.js:36`, `ui/screens/stationHub.js:1383` |
| `economy:tradeCompleted` | `systems/economy.js:616` | `audio/audioSystem.js:238`, `save/saveSystem.js:85`, `systems/factions.js:175`, `systems/missions.js:219`, `systems/onboarding.js:141`, `systems/sectorSim.js:81`, `ui/screens/market.js:543`, `ui/screens/stationHub.js:1381`, `ui/screens/stationHub.js:1382` |
| `economy:tradeFailed` | `systems/economy.js:686`, `systems/economy.js:703` | `ui/screens/market.js:554` |
| `encounter:choiceOffered` | `systems/encounterDirector.js:595` | — |
| `encounter:choose` | — | `systems/encounterDirector.js:96` |
| `encounter:receipt` | `systems/encounterDirector.js:634` | — |
| `encounter:resolved` | `systems/encounterDirector.js:625`, `systems/encounterDirector.js:651` | — |
| `encounter:spawned` | `systems/encounterDirector.js:347` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:333` | — |
| `encounter:voice` | `systems/encounterDirector.js:579` | — |
| `endgame:chosen` | `systems/story.js:457` | — |
| `endgame:loopBack` | `systems/story.js:477` | — |
| `endgame:offer` | `systems/story.js:393` | `ui/comms.js:373` |
| `endgame:promptChoiceC` | `systems/story.js:439` | `ui/comms.js:375` |
| `entity:destroyed` | `main.js:178`, `save/saveSystem.js:779`, `systems/wingmen.js:99`, `systems/world.js:237` | `audio/audioSystem.js:229`, `combat/kernel.js:62`, `render/renderer.js:694`, `render/vfx.js:350`, `systems/ai.js:101`, `systems/encounterDirector.js:89`, `systems/gateControlDirector.js:68`, `systems/missions.js:227`, `systems/stationSideEventDirector.js:55`, `ui/prompts/bulkHaulTag.js:148`, `ui/radar.js:271` |
| `entity:kill` | — | `core/coreSystem.js:66` |
| `entity:killed` | `combat/damage.js:229`, `combat/kernel.js:42`, `systems/combat.js:349` | `audio/audioSystem.js:228`, `render/feel.js:365`, `render/vfx.js:349`, `systems/aftermathWrecks.js:225`, `systems/ai.js:102`, `systems/combatOutcome.js:102`, `systems/contractClauses.js:91`, `systems/encounterDirector.js:90`, `systems/factions.js:153`, `systems/heat.js:114`, `systems/mining.js:76`, `systems/missions.js:225`, `systems/onboarding.js:154`, `systems/sectorSim.js:85`, `systems/story.js:79`, `systems/wingMorale.js:140`, `systems/world.js:130`, `ui/floatingText.js:84`, `ui/floatingText.js:98` |
| `entity:spawnRequest` | — | `core/coreSystem.js:70` |
| `entity:spawned` | `core/coreSystem.js:29` | `combat/kernel.js:57`, `render/renderer.js:693`, `render/vfx.js:351`, `systems/lossLedger.js:314`, `systems/salvageActions.js:41`, `ui/radar.js:270` |
| `faction:aggro` | `systems/factions.js:246`, `systems/factions.js:277`, `systems/factions.js:465` | `systems/heat.js:126` |
| `faction:repChanged` | `systems/factions.js:243`, `systems/factions.js:272`, `systems/factions.js:461` | `ui/floatingText.js:125`, `ui/screens/stationHub.js:1406` |
| `faction:repDelta` | `systems/economy.js:888`, `systems/encounterDirector.js:666`, `systems/missions.js:1314`, `systems/missions.js:1337`, `systems/missions.js:1604`, `systems/missions.js:1606`, `systems/missions.js:1637`, `systems/moralTrap.js:128`, `systems/moralTrap.js:135`, `systems/story.js:466`, `systems/story.js:468`, `systems/survivorPod.js:374` | `systems/factions.js:147` |
| `faction:repSpillover` | `systems/factions.js:270` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:236` | `systems/world.js:125` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:235` | — |
| `flight:modeChanged` | `systems/flightV3.js:413` | — |
| `fuel:changed` | `systems/economy.js:768`, `systems/world.js:1360`, `systems/world.js:1368` | `ui/screens/stationHub.js:1400`, `ui/screens/stationHub.js:1401`, `ui/screens/stationHub.js:1402` |
| `fuel:empty` | `systems/world.js:1361` | `audio/audioSystem.js:265`, `ui/alerts.js:134` |
| `game:load` | `ui/input.js:114`, `ui/input.js:221`, `ui/screens/mainMenu.js:278`, `ui/screens/saveLoad.js:333` | `save/saveSystem.js:69`, `ui/commandBar.js:378` |
| `game:new` | `ui/screens/gameOver.js:172`, `ui/screens/newGame.js:313` | `main.js:110`, `ui/commandBar.js:377`, `ui/priceHistory.js:58` |
| `game:newGame` | — | `systems/aftermathWrecks.js:229`, `systems/fieldDepletion.js:183`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:315`, `systems/survivorPod.js:152`, `systems/wingMorale.js:142` |
| `game:over` | `systems/combat.js:339` | `ui/uiRoot.js:540` |
| `game:save` | `ui/input.js:113`, `ui/input.js:219`, `ui/screens/saveLoad.js:319` | `save/saveSystem.js:68` |
| `game:startFailed` | `main.js:267` | `ui/screens/newGame.js:303` |
| `game:started` | `main.js:215` | `audio/audioSystem.js:303`, `render/renderer.js:711`, `systems/automation.js:192`, `systems/economyContracts.js:81`, `systems/factions.js:144`, `systems/flight.js:78`, `systems/flightV3.js:105`, `systems/missions.js:198`, `systems/onboarding.js:127`, `systems/onboarding.js:258`, `systems/sectorSim.js:76`, `systems/story.js:66`, `systems/tacticalAI.js:92`, `ui/commandBar.js:376`, `ui/radar.js:272`, `ui/uiRoot.js:536`, `ui/uiRoot.js:555` |
| `gamepad:connected` | `systems/gamepad.js:154` | `ui/uiRoot.js:219` |
| `gamepad:disconnected` | `systems/gamepad.js:147` | `ui/uiRoot.js:220` |
| `gate:range` | `core/physics.js:566`, `core/physics.js:570` | `systems/onboarding.js:184`, `ui/alerts.js:118` |
| `graffiti:show` | `systems/story.js:342`, `systems/story.js:354`, `systems/story.js:540`, `systems/story.js:589` | `ui/comms.js:282`, `ui/screens/codex.js:302` |
| `hazard:enter` | `systems/world.js:1338` | `data/hazardLanguage.js:99` |
| `hazard:exit` | `systems/world.js:1348` | `data/hazardLanguage.js:100` |
| `heat:changed` | `systems/heat.js:265` | `ui/hud.js:994` |
| `hud:phase` | `systems/story.js:129`, `systems/story.js:148`, `systems/story.js:151` | `ui/hudMeta.js:102` |
| `hud:tagFlicker` | `systems/story.js:368` | `ui/hudMeta.js:136` |
| `interdiction:triggered` | `systems/encounterScripts.js:275`, `systems/world.js:1025` | `systems/sectorSim.js:82` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:992` | `audio/audioSystem.js:259`, `render/feel.js:436`, `render/renderer.js:764`, `render/vfx.js:373`, `save/saveSystem.js:80`, `systems/gateControlDirector.js:66`, `systems/sectorSim.js:91` |
| `jump:chargeAbort` | `systems/world.js:1094`, `systems/world.js:1144`, `ui/comms.js:400` | `systems/gateControlDirector.js:67` |
| `jump:chargeStart` | `systems/world.js:1131` | `audio/audioSystem.js:250`, `render/feel.js:426`, `systems/gateControlDirector.js:64`, `systems/story.js:83` |
| `jump:chargeTick` | `systems/world.js:949` | — |
| `jump:start` | `systems/world.js:958` | `audio/audioSystem.js:254`, `render/feel.js:430`, `render/vfx.js:372`, `systems/economy.js:291`, `systems/gateControlDirector.js:65`, `systems/sectorSim.js:90` |
| `loot:drop` | `systems/combat.js:361`, `systems/onboarding.js:732` | `systems/mining.js:78`, `ui/floatingText.js:92` |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:282` | — |
| `map:sectorCharted` | `systems/world.js:886` | — |
| `massline:threat` | `systems/masslineThreats.js:146` | `systems/presentationOrchestrator.js:59` |
| `mining:bulkHaulDelivered` | `systems/mining.js:592` | `systems/missions.js:223`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:217` | `ui/prompts/bulkHaulTag.js:143` |
| `mining:richCoreChargeStart` | `systems/mining.js:551` | — |
| `mining:richCoreCompleted` | `systems/mining.js:572` | — |
| `mining:richCoreExposed` | `systems/mining.js:529` | — |
| `mining:richCoreFizzle` | `systems/mining.js:574` | — |
| `mining:seamHit` | `systems/mining.js:726` | — |
| `mining:start` | `systems/mining.js:133` | `audio/audioSystem.js:232`, `render/vfx.js:356`, `systems/onboarding.js:144` |
| `mining:stop` | `systems/mining.js:151` | `audio/audioSystem.js:233`, `render/vfx.js:357` |
| `mining:tick` | `systems/automation.js:349`, `systems/automation.js:478`, `systems/mining.js:238` | `audio/audioSystem.js:234`, `render/vfx.js:358` |
| `mining:yield` | `systems/mining.js:291`, `systems/mining.js:429`, `systems/mining.js:571` | `audio/audioSystem.js:262`, `render/feel.js:449`, `render/vfx.js:359`, `systems/encounterDirector.js:98`, `systems/missions.js:221`, `ui/floatingText.js:91` |
| `miningDrone:sellOre` | — | `systems/economy.js:270` |
| `mission:abandoned` | — | `ui/hud.js:978` |
| `mission:accepted` | `systems/missions.js:620` | `audio/audioSystem.js:242`, `save/saveSystem.js:81`, `systems/onboarding.js:146`, `ui/hud.js:976`, `ui/screens/missionLog.js:885`, `ui/screens/stationHub.js:1414` |
| `mission:completed` | `systems/missions.js:1292` | `audio/audioSystem.js:243`, `save/saveSystem.js:82`, `systems/contractClauses.js:94`, `systems/factions.js:184`, `ui/hud.js:977`, `ui/screens/missionLog.js:886`, `ui/screens/stationHub.js:1421` |
| `mission:expired` | `systems/missions.js:1346` | `audio/audioSystem.js:247`, `save/saveSystem.js:84`, `systems/factions.js:193`, `ui/screens/missionLog.js:888`, `ui/screens/stationHub.js:1423` |
| `mission:failed` | `systems/missions.js:1324` | `audio/audioSystem.js:246`, `save/saveSystem.js:83`, `systems/factions.js:192`, `ui/screens/missionLog.js:887`, `ui/screens/stationHub.js:1422` |
| `mission:forceEvent` | — | `systems/economy.js:296` |
| `mission:offered` | `systems/economyContracts.js:117`, `systems/lossLedger.js:258`, `systems/salvage.js:210` | `systems/lossInvestigation.js:106`, `systems/survivorPod.js:150` |
| `mission:updated` | `systems/missions.js:287`, `systems/missions.js:621`, `systems/missions.js:675`, `systems/missions.js:753`, `systems/missions.js:1012`, `systems/missions.js:1041`, `systems/missions.js:1055`, `systems/missions.js:1072`, `systems/missions.js:1098`, `systems/missions.js:1284`, `systems/missions.js:1328`, `systems/missions.js:1350`, `systems/missions.js:1443`, `systems/missions.js:1561`, `systems/missions.js:1663` | `ui/hud.js:975`, `ui/screens/missionLog.js:884`, `ui/screens/stationHub.js:1408` |
| `mode:changed` | `main.js:252`, `main.js:259`, `main.js:266`, `save/saveSystem.js:619` | `ui/comms.js:417`, `ui/uiRoot.js:271`, `ui/wingmanRadial.js:139` |
| `module:equipped` | `systems/ships.js:744` | `systems/ships.js:442`, `systems/world.js:122`, `ui/screens/stationHub.js:1395` |
| `module:purchased` | `systems/ships.js:618` | `ui/screens/stationHub.js:1397` |
| `module:unequipped` | `systems/ships.js:763` | `systems/ships.js:443`, `systems/world.js:123`, `ui/screens/stationHub.js:1396` |
| `moralTrap:choose` | — | `systems/moralTrap.js:73` |
| `moralTrap:resolved` | `systems/moralTrap.js:118` | — |
| `moralTrap:revealed` | `systems/moralTrap.js:91` | — |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:617`, `systems/world.js:1182` | — |
| `nav:waypoint` | `save/saveSystem.js:757`, `systems/missions.js:790`, `systems/missions.js:822`, `systems/missions.js:1030`, `systems/world.js:1181`, `ui/screens/market.js:1308` | `ui/screens/stationHub.js:1403`, `ui/screens/stationHub.js:1404` |
| `news:dockCards` | `ui/marketNews.js:200` | — |
| `news:headline` | `systems/aftermathWrecks.js:154`, `ui/marketNews.js:183` | — |
| `patrol:proximity` | `systems/encounterScripts.js:222` | `systems/economy.js:292` |
| `physics:attachmentBroken` | — | `combat/kernel.js:66` |
| `physics:impact` | `core/physics.js:907` | — |
| `pickup:collected` | `core/physics.js:815`, `systems/mining.js:361` | `audio/audioSystem.js:236`, `render/vfx.js:374`, `systems/cargo.js:97`, `systems/mining.js:80`, `systems/onboarding.js:145`, `ui/floatingText.js:108` |
| `pirateParley:choose` | — | `systems/pirateParley.js:30` |
| `player:death` | `systems/combat.js:336`, `systems/combat.js:387` | `audio/audioSystem.js:230`, `render/feel.js:393`, `render/vfx.js:355`, `save/saveSystem.js:73`, `ui/hud.js:684` |
| `player:respawn` | `systems/combat.js:399` | `audio/audioSystem.js:231`, `render/renderer.js:713`, `save/saveSystem.js:74`, `save/saveSystem.js:87`, `ui/commandBar.js:357`, `ui/hud.js:698` |
| `player:scannedByPatrol` | `systems/economy.js:854` | `systems/contractClauses.js:92`, `systems/missions.js:231`, `ui/customsPrompt.js:125` |
| `poi:discovered` | `systems/world.js:1286`, `systems/world.js:1312` | — |
| `poi:identified` | `systems/world.js:1315` | — |
| `presentation:audioCue` | `systems/presentationAdapters.js:183` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:147` | — |
| `presentation:caption` | `systems/presentationAdapters.js:218` | `ui/hud.js:749` |
| `presentation:cue` | — | `systems/presentationAdapters.js:74` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:129` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:200` | — |
| `presentation:vfxCue` | `render/vfx.js:383`, `systems/impulseCharges.js:353`, `systems/missions.js:627`, `systems/missions.js:1297`, `systems/presentationAdapters.js:168` | `render/vfx.js:371` |
| `projectile:hit` | `core/physics.js:474`, `core/physics.js:488`, `systems/sectorSim.js:479` | `audio/audioSystem.js:216`, `render/vfx.js:346`, `systems/combat.js:238` |
| `research:pointsChanged` | `systems/missions.js:1267` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:257` | — |
| `salvage:actionRead` | `systems/salvageActions.js:81` | — |
| `salvage:communicatorFound` | `systems/salvage.js:211` | `systems/encounterDirector.js:94`, `systems/story.js:90` |
| `salvage:completed` | `systems/mining.js:435` | `systems/aftermathWrecks.js:228` |
| `salvage:placed` | `systems/salvage.js:106` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:148` |
| `salvage:reactorBurst` | `systems/salvageActions.js:140` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:109` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:95` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:43` |
| `save:completed` | `save/saveSystem.js:307` | `ui/uiRoot.js:112` |
| `save:error` | `save/saveSystem.js:226`, `save/saveSystem.js:249`, `save/saveSystem.js:291`, `save/saveSystem.js:300`, `save/saveSystem.js:314`, `save/saveSystem.js:319`, `save/saveSystem.js:326`, `save/saveSystem.js:446`, `save/saveSystem.js:451`, `save/saveSystem.js:452`, `save/saveSystem.js:460`, `save/saveSystem.js:468`, `save/saveSystem.js:470`, `save/saveSystem.js:471`, `save/saveSystem.js:478`, `save/saveSystem.js:485`, `save/saveSystem.js:487`, `save/saveSystem.js:494`, `save/saveSystem.js:626`, `save/saveSystem.js:918`, `save/saveSystem.js:931`, `save/saveSystem.js:945` | `ui/uiRoot.js:126` |
| `save:loaded` | `save/saveSystem.js:622` | `audio/audioSystem.js:302`, `core/physics.js:52`, `main.js:104`, `render/renderer.js:712`, `render/renderer.js:769`, `render/vfx.js:354`, `systems/aftermathWrecks.js:230`, `systems/automation.js:191`, `systems/beacons.js:37`, `systems/economyContracts.js:82`, `systems/encounterDirector.js:87`, `systems/flight.js:74`, `systems/flightV3.js:104`, `systems/gateControlDirector.js:70`, `systems/lossInvestigation.js:108`, `systems/missions.js:199`, `systems/onboarding.js:131`, `systems/presentationAdapters.js:75`, `systems/presentationOrchestrator.js:90`, `systems/salvage.js:58`, `systems/sectorSim.js:75`, `systems/spawnBudget.js:46`, `systems/stationSideEventDirector.js:57`, `systems/story.js:67`, `systems/survivorPod.js:153`, `systems/tacticalAI.js:93`, `ui/priceHistory.js:59`, `ui/radar.js:273`, `ui/uiRoot.js:119`, `ui/uiRoot.js:556` |
| `save:started` | `save/saveSystem.js:294` | `ui/uiRoot.js:108` |
| `scan:completed` | `systems/scanner.js:224`, `systems/world.js:1290` | `systems/missions.js:229`, `systems/salvage.js:56`, `systems/salvageActions.js:42`, `ui/hud.js:1328` |
| `scan:pulse` | `systems/scanner.js:182` | `systems/buildIdentity.js:268`, `systems/encounterDirector.js:93`, `systems/onboarding.js:153`, `systems/pirateDisguise.js:16`, `systems/scanReveal.js:14`, `ui/hud.js:1329` |
| `scan:shipRevealed` | `systems/scanReveal.js:37` | `systems/buildIdentity.js:267` |
| `scan:weakPoint` | `systems/scanner.js:219` | `ui/hud.js:367` |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:129` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:146` | `systems/presentationOrchestrator.js:35` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:464` | `systems/presentationOrchestrator.js:89`, `ui/comms.js:194` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:251` | `ui/comms.js:190` |
| `scenario:factChanged` | `systems/scenarioRuntime.js:439` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:124` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:114` | — |
| `sector:discovered` | `systems/world.js:218` | — |
| `sector:enter` | `systems/world.js:224` | `audio/audioSystem.js:270`, `render/renderer.js:744`, `render/vfx.js:353`, `save/saveSystem.js:79`, `systems/aftermathWrecks.js:226`, `systems/economy.js:284`, `systems/encounterDirector.js:83`, `systems/lossInvestigation.js:105`, `systems/mining.js:83`, `systems/missions.js:234`, `systems/moralTrap.js:72`, `systems/salvage.js:54`, `systems/sectorSim.js:74`, `systems/story.js:82`, `systems/survivorPod.js:149`, `systems/traffic.js:98`, `systems/wingmen.js:34`, `ui/causeLedger.js:120`, `ui/commandBar.js:363`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/radar.js:274`, `ui/radar.js:275`, `ui/sectorPostcard.js:136`, `ui/securityReadout.js:97` |
| `sector:exit` | `systems/world.js:171` | `systems/aftermathWrecks.js:227`, `systems/automation.js:196`, `systems/encounterDirector.js:85`, `systems/gateControlDirector.js:69`, `systems/missions.js:235`, `systems/sectorSim.js:73`, `systems/spawnBudget.js:45`, `systems/stationSideEventDirector.js:56`, `ui/customsPrompt.js:127` |
| `sector:leave` | — | `systems/traffic.js:99`, `systems/wingmen.js:36` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:276` | `ui/screens/starmap.js:577` |
| `sectorsim:impulse` | `systems/encounterDirector.js:674` | `systems/sectorSim.js:80` |
| `sectorsim:intel` | `systems/sectorSim.js:610` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:530` | — |
| `sectorsim:reconcile` | `systems/sectorSim.js:510` | — |
| `sectorsim:tick` | `systems/sectorSim.js:224` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:490` | `ui/screens/starmap.js:578` |
| `settings:changed` | `render/renderer.js:523`, `save/saveSystem.js:631`, `systems/touch.js:250`, `ui/screens/settings.js:215`, `ui/screens/settings.js:468`, `ui/screens/settings.js:543` | `audio/audioSystem.js:285`, `main.js:103`, `render/renderer.js:717`, `save/saveSystem.js:70`, `ui/uiRoot.js:196` |
| `ship:appearanceChanged` | `systems/ships.js:530` | `render/renderer.js:702`, `render/vfx.js:352` |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:144` | `audio/audioSystem.js:271`, `render/feel.js:463`, `render/vfx.js:361`, `systems/cruise.js:25` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:145`, `systems/flightV3.js:322` | `audio/audioSystem.js:276`, `render/renderer.js:707`, `render/vfx.js:362` |
| `ship:cargoCapChanged` | `systems/ships.js:525` | `systems/cargo.js:120` |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:301` | `audio/audioSystem.js:277`, `render/vfx.js:363`, `ui/floatingText.js:95` |
| `ship:purchased` | `systems/ships.js:645` | `audio/audioSystem.js:269`, `systems/missions.js:238`, `systems/onboarding.js:147`, `ui/screens/stationHub.js:1393` |
| `ship:sold` | `systems/ships.js:666` | `ui/screens/stationHub.js:1394` |
| `ship:statsChanged` | `systems/ships.js:524` | `systems/cargo.js:121`, `systems/world.js:124`, `ui/commandBar.js:358`, `ui/hud.js:974`, `ui/screens/stationHub.js:1390`, `ui/screens/stationHub.js:1391`, `ui/screens/stationHub.js:1392` |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1019` | `render/vfx.js:360` |
| `sim:jumpGate` | — | `systems/economy.js:290` |
| `sim:pause` | `ui/screenManager.js:171`, `ui/screens/gameOver.js:186`, `ui/screens/gameOver.js:204`, `ui/screens/pause.js:389`, `ui/screens/pause.js:403` | `audio/audioSystem.js:292` |
| `sim:resume` | `ui/screenManager.js:179`, `ui/screens/pause.js:383` | `audio/audioSystem.js:293` |
| `spawn:request` | `systems/automation.js:590` | `systems/world.js:126` |
| `station:broadcastTic` | `systems/stationBroadcast.js:194` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:186` | — |
| `story:beatAdvanced` | `systems/missions.js:1652` | `save/saveSystem.js:86`, `systems/story.js:63`, `ui/screens/codex.js:300` |
| `survivorPod:choose` | — | `systems/survivorPod.js:151` |
| `survivorPod:promoted` | `systems/survivorPod.js:235` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:329` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:341` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:380` | — |
| `tech:researched` | `systems/ships.js:567` | `audio/audioSystem.js:268`, `systems/onboarding.js:231`, `systems/ships.js:444`, `ui/screens/manufacture.js:218`, `ui/screens/stationHub.js:1398` |
| `tether:attached` | `combat/attachments.js:98` | `render/vfx.js:343`, `systems/presentationOrchestrator.js:36`, `systems/scenarioRuntime.js:21`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:119`, `systems/tetherGameplay.js:263` | `systems/onboarding.js:152` |
| `tether:broken` | `combat/attachments.js:213` | `render/feel.js:474`, `render/renderer.js:709`, `render/vfx.js:344`, `systems/presentationOrchestrator.js:49`, `systems/scenarioRuntime.js:22` |
| `tether:cut` | `systems/tetherGameplay.js:95` | — |
| `tether:latched` | `systems/tetherGameplay.js:166` | `systems/flightV3.js:106`, `systems/onboarding.js:150`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:nearBreak` | `combat/attachments.js:433` | `systems/presentationOrchestrator.js:42` |
| `tether:reel` | `combat/attachments.js:148` | — |
| `tether:reelPump` | `systems/masslineTelemetry.js:247` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:97`, `systems/tetherGameplay.js:120`, `systems/tetherGameplay.js:261`, `systems/tetherGameplay.js:264` | `systems/presentationOrchestrator.js:81` |
| `tether:released` | `systems/tetherGameplay.js:96`, `systems/tetherGameplay.js:260` | `render/renderer.js:708`, `systems/onboarding.js:151` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:325` | — |
| `tether:strain` | `systems/tetherGameplay.js:314` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:184` | `systems/combat.js:239`, `systems/presentationOrchestrator.js:70` |
| `touch:uiAction` | `systems/touch.js:219` | `ui/input.js:359` |
| `tutorial:finished` | `systems/onboarding.js:461` | `systems/story.js:69` |
| `tutorial:say` | `systems/onboarding.js:341` | `systems/story.js:72` |
| `ui:abandonMission` | `ui/screens/missionLog.js:848` | `systems/missions.js:203` |
| `ui:acceptMission` | `ui/screens/bar.js:982`, `ui/screens/stationHub.js:929` | `systems/contractClauses.js:93`, `systems/missions.js:202` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | `ui/screens/market.js:484` | `systems/economy.js:255` |
| `ui:buyModule` | `ui/screens/outfitting.js:540` | `systems/onboarding.js:225`, `systems/ships.js:448` |
| `ui:buyShip` | `ui/screens/shipyard.js:461` | `systems/ships.js:447` |
| `ui:cancel` | `ui/input.js:533`, `ui/input.js:547` | — |
| `ui:click` | — | `audio/audioSystem.js:296` |
| `ui:closeAll` | `main.js:233` | `ui/uiRoot.js:381` |
| `ui:closeCargo` | `ui/input.js:73`, `ui/input.js:130` | `ui/hud.js:948` |
| `ui:closeComms` | `ui/input.js:125` | `ui/comms.js:267` |
| `ui:confirm` | `ui/input.js:541` | `audio/audioSystem.js:298` |
| `ui:cycleTarget` | `ui/input.js:161`, `ui/input.js:593` | `ui/uiRoot.js:382` |
| `ui:deny` | — | `audio/audioSystem.js:299` |
| `ui:drillFadeStart` | `ui/input.js:280` | `ui/uiRoot.js:462` |
| `ui:endgameChoose` | `ui/comms.js:359`, `ui/comms.js:394` | `systems/story.js:85` |
| `ui:fitModule` | `ui/screens/outfitting.js:514` | `systems/onboarding.js:221`, `systems/ships.js:449` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:711`, `ui/wingmanRadial.js:114` | `systems/automation.js:185`, `systems/wingmen.js:41` |
| `ui:hover` | — | `audio/audioSystem.js:297` |
| `ui:kurtzInteract` | — | `systems/story.js:87` |
| `ui:navigate` | `ui/input.js:520`, `ui/input.js:524`, `ui/input.js:572` | — |
| `ui:popScreen` | `ui/galaxyMap.js:416`, `ui/screens/automationPanel.js:262`, `ui/screens/starmap.js:423` | `ui/uiRoot.js:379` |
| `ui:purchaseSurveyData` | `ui/screens/bar.js:964` | `systems/world.js:127` |
| `ui:pushScreen` | `ui/screens/bar.js:366`, `ui/screens/missionLog.js:478`, `ui/screens/starmap.js:431`, `ui/screens/stationHub.js:190` | `ui/uiRoot.js:378` |
| `ui:replaceScreen` | — | `ui/uiRoot.js:380` |
| `ui:sell` | `ui/screens/market.js:396` | `systems/economy.js:256` |
| `ui:sellShip` | `ui/screens/shipyard.js:436` | — |
| `ui:service` | `ui/screens/services.js:364` | `systems/economy.js:287` |
| `ui:setActiveShip` | `ui/screens/shipyard.js:441` | — |
| `ui:setCourse` | `systems/input.js:516`, `systems/missions.js:810`, `ui/galaxyMap.js:719`, `ui/screens/localmap.js:586`, `ui/screens/market.js:1310`, `ui/screens/starmap.js:1215`, `ui/screens/starmap.js:1228`, `ui/screens/starmap.js:1232` | `systems/world.js:120` |
| `ui:talkContact` | `ui/screens/bar.js:1023` | — |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:28`, `combat/autoTargetMode.js:113` | `ui/uiRoot.js:383` |
| `ui:toggleCargo` | `ui/input.js:187` | `ui/hud.js:947` |
| `ui:toggleComms` | `ui/input.js:204` | `ui/comms.js:266` |
| `ui:toggleOverview` | `ui/input.js:191` | `ui/hud.js:1338` |
| `ui:trackMission` | `ui/screens/missionLog.js:811`, `ui/screens/missionLog.js:827` | `systems/missions.js:204` |
| `ui:undock` | `ui/screenManager.js:272` | `ui/input.js:358` |
| `ui:unfitModule` | `ui/screens/outfitting.js:477` | `systems/ships.js:450` |
| `ui:unlockTech` | `ui/screens/techTree.js:579` | `systems/ships.js:451` |
| `ui:wingmanRadial` | `ui/input.js:197` | `ui/wingmanRadial.js:137` |
| `voice:say` | — | `ui/voiceArbiter.js:175` |
| `weapons:vent` | `systems/weapons.js:192`, `systems/weapons.js:205` | `ui/hud.js:1014` |
| `wingMorale:broken` | `systems/wingMorale.js:206` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:274` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:301` | — |
| `world:requestJump` | `ui/screens/starmap.js:1227` | `systems/world.js:117` |
| `world:requestRoute` | `ui/galaxyMap.js:717`, `ui/screens/starmap.js:1214`, `ui/screens/starmap.js:1231` | `systems/world.js:118` |
| `world:requestSectorScan` | — | `systems/world.js:119` |
| `world:zoneEntered` | `systems/world.js:933` | `data/hazardLanguage.js:101` |
| `world:zoneExited` | `systems/world.js:936` | `data/hazardLanguage.js:102` |

## Events with no emitter (likely dead, or emitted dynamically)

- `ai:reinforcementScheduled` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `combat:baseDestroyed` — 1 subscriber(s)
- `combat:lockChanged` — 2 subscriber(s)
- `combat:repairSubsystem` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 3 subscriber(s)
- `combat:surrendered` — 1 subscriber(s)
- `dock:attempt` — 1 subscriber(s)
- `encounter:choose` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `entity:spawnRequest` — 1 subscriber(s)
- `game:newGame` — 6 subscriber(s)
- `miningDrone:sellOre` — 1 subscriber(s)
- `mission:abandoned` — 1 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `moralTrap:choose` — 1 subscriber(s)
- `physics:attachmentBroken` — 1 subscriber(s)
- `pirateParley:choose` — 1 subscriber(s)
- `presentation:cue` — 1 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `sector:leave` — 2 subscriber(s)
- `sim:jumpGate` — 1 subscriber(s)
- `survivorPod:choose` — 1 subscriber(s)
- `ui:click` — 1 subscriber(s)
- `ui:deny` — 1 subscriber(s)
- `ui:hover` — 1 subscriber(s)
- `ui:kurtzInteract` — 1 subscriber(s)
- `ui:replaceScreen` — 1 subscriber(s)
- `voice:say` — 1 subscriber(s)
- `world:requestSectorScan` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aftermathWreck:completed` — 1 emitter(s)
- `aftermathWreck:recorded` — 1 emitter(s)
- `aftermathWreck:spawned` — 1 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `ai:stateChange` — 1 emitter(s)
- `asteroid:chunked` — 1 emitter(s)
- `automation:assetDistressed` — 1 emitter(s)
- `automation:assetRepossessed` — 1 emitter(s)
- `automation:incomeCredited` — 1 emitter(s)
- `automation:offlineSummary` — 1 emitter(s)
- `beacon:deployed` — 1 emitter(s)
- `boss:defeated` — 1 emitter(s)
- `buildIdentity:revealed` — 1 emitter(s)
- `cargo:delivered` — 1 emitter(s)
- `charge:combo` — 2 emitter(s)
- `charge:stuck` — 1 emitter(s)
- `charge:thrown` — 1 emitter(s)
- `claim:moduleBuilt` — 1 emitter(s)
- `claim:teleportRequest` — 1 emitter(s)
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
- `contract:clauseBroken` — 1 emitter(s)
- `contract:clauseHonored` — 1 emitter(s)
- `countermeasure:deployed` — 1 emitter(s)
- `cruise:snared` — 1 emitter(s)
- `customs:breakScan` — 1 emitter(s)
- `customs:submit` — 1 emitter(s)
- `danger:miningNoise` — 1 emitter(s)
- `dock:denied` — 1 emitter(s)
- `drill:end` — 1 emitter(s)
- `encounter:choiceOffered` — 1 emitter(s)
- `encounter:receipt` — 1 emitter(s)
- `encounter:resolved` — 2 emitter(s)
- `encounter:spawned` — 1 emitter(s)
- `encounter:telegraph` — 1 emitter(s)
- `encounter:voice` — 1 emitter(s)
- `endgame:chosen` — 1 emitter(s)
- `endgame:loopBack` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `fieldDepletion:changed` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `jump:chargeTick` — 1 emitter(s)
- `lossInvestigation:promoted` — 1 emitter(s)
- `lossLedger:recorded` — 1 emitter(s)
- `map:sectorCharted` — 1 emitter(s)
- `mining:richCoreChargeStart` — 1 emitter(s)
- `mining:richCoreCompleted` — 1 emitter(s)
- `mining:richCoreExposed` — 1 emitter(s)
- `mining:richCoreFizzle` — 1 emitter(s)
- `mining:seamHit` — 1 emitter(s)
- `moralTrap:resolved` — 1 emitter(s)
- `moralTrap:revealed` — 1 emitter(s)
- `nav:autopilot` — 3 emitter(s)
- `news:dockCards` — 1 emitter(s)
- `news:headline` — 2 emitter(s)
- `physics:impact` — 1 emitter(s)
- `poi:discovered` — 2 emitter(s)
- `poi:identified` — 1 emitter(s)
- `presentation:audioCue` — 1 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 1 emitter(s)
- `research:pointsChanged` — 1 emitter(s)
- `rumor:ghostConvoy` — 1 emitter(s)
- `salvage:actionRead` — 1 emitter(s)
- `salvage:reactorBurst` — 1 emitter(s)
- `salvage:reactorTowedClear` — 1 emitter(s)
- `salvage:reactorVented` — 1 emitter(s)
- `scenario:actorBindings` — 1 emitter(s)
- `scenario:factChanged` — 1 emitter(s)
- `scenario:factsInitialized` — 1 emitter(s)
- `scenario:loaded` — 1 emitter(s)
- `sector:discovered` — 1 emitter(s)
- `sectorsim:intel` — 1 emitter(s)
- `sectorsim:offlineSummary` — 1 emitter(s)
- `sectorsim:reconcile` — 1 emitter(s)
- `sectorsim:tick` — 1 emitter(s)
- `station:broadcastTic` — 1 emitter(s)
- `station:sideEvent` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:rescueBlocked` — 1 emitter(s)
- `survivorPod:rescueSelected` — 1 emitter(s)
- `survivorPod:stripped` — 1 emitter(s)
- `tether:cut` — 1 emitter(s)
- `tether:reel` — 1 emitter(s)
- `tether:reelPump` — 1 emitter(s)
- `tether:snapCatch` — 1 emitter(s)
- `tether:strain` — 1 emitter(s)
- `ui:bulkHaulTag` — 1 emitter(s)
- `ui:bulkHaulTagCleared` — 1 emitter(s)
- `ui:cancel` — 2 emitter(s)
- `ui:navigate` — 3 emitter(s)
- `ui:sellShip` — 1 emitter(s)
- `ui:setActiveShip` — 1 emitter(s)
- `ui:talkContact` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
