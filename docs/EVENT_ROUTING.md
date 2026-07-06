# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-07-05 · 264 events · 952 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `ai:encounterCommand` | `systems/aiPorts.js:188` | — |
| `ai:flee` | `systems/ai.js:233` | `render/vfx.js:304` |
| `ai:formationBroken` | `systems/ai.js:402` | `render/vfx.js:305` |
| `ai:stateChange` | `systems/ai.js:230` | — |
| `ai:telegraph` | `systems/ai.js:298` | `render/vfx.js:303` |
| `aiTrader:requestTrade` | `systems/traffic.js:347` | `systems/economy.js:266` |
| `asset:deployed` | `systems/automation.js:581`, `systems/automation.js:931`, `systems/automation.js:968`, `systems/automation.js:1034` | `systems/missions.js:239`, `systems/onboarding.js:232` |
| `asteroid:chunked` | `systems/mining.js:482` | — |
| `asteroid:destroyed` | `systems/automation.js:484`, `systems/mining.js:250` | `audio/audioSystem.js:234` |
| `audio:cue` | `render/vfx.js:325`, `systems/ai.js:673`, `systems/beacons.js:52`, `systems/beacons.js:57`, `systems/beacons.js:80`, `systems/claims.js:86`, `systems/claims.js:123`, `systems/countermeasures.js:189`, `systems/crafting.js:221`, `systems/crafting.js:231`, `systems/impulseCharges.js:283`, `systems/mining.js:553`, `systems/presentationAdapters.js:165`, `ui/hud.js:861`, `ui/hud.js:886`, `ui/hud.js:894`, `ui/hud.js:984`, `ui/hud.js:1102`, `ui/hud.js:1291`, `ui/input.js:45`, `ui/input.js:82`, `ui/input.js:91`, `ui/input.js:103`, `ui/input.js:109`, `ui/input.js:137`, `ui/input.js:173`, `ui/input.js:305`, `ui/input.js:455`, `ui/input.js:533`, `ui/input.js:541`, `ui/input.js:547`, `ui/input.js:572`, `ui/input.js:583`, `ui/input.js:599`, `ui/screens/bar.js:970`, `ui/screens/bar.js:999`, `ui/screens/bar.js:1017`, `ui/screens/bar.js:1058`, `ui/screens/drill.js:786`, `ui/screens/drill.js:792`, `ui/screens/drill.js:797`, `ui/screens/market.js:391`, `ui/screens/market.js:393`, `ui/screens/market.js:474`, `ui/screens/market.js:484`, `ui/screens/market.js:535`, `ui/screens/market.js:554`, `ui/screens/market.js:587`, `ui/screens/market.js:593`, `ui/screens/market.js:603`, `ui/screens/market.js:687`, `ui/screens/market.js:907`, `ui/screens/market.js:1285`, `ui/screens/missionLog.js:812`, `ui/screens/missionLog.js:816`, `ui/screens/missionLog.js:830`, `ui/screens/missionLog.js:850`, `ui/screens/outfitting.js:478`, `ui/screens/outfitting.js:511`, `ui/screens/outfitting.js:515`, `ui/screens/outfitting.js:541`, `ui/screens/services.js:347`, `ui/screens/services.js:360`, `ui/screens/services.js:365`, `ui/screens/shipyard.js:437`, `ui/screens/shipyard.js:442`, `ui/screens/shipyard.js:462`, `ui/screens/stationHub.js:732`, `ui/screens/stationHub.js:738`, `ui/screens/stationHub.js:807`, `ui/screens/stationHub.js:827`, `ui/screens/stationHub.js:834`, `ui/screens/stationHub.js:896`, `ui/screens/stationHub.js:1103`, `ui/uiRoot.js:405`, `ui/uiRoot.js:459`, `ui/wingmanRadial.js:74`, `ui/wingmanRadial.js:91`, `ui/wingmanRadial.js:109`, `ui/wingmanRadial.js:117`, `ui/wingmanRadial.js:125` | `audio/audioSystem.js:283` |
| `automation:assetDistressed` | `systems/automation.js:805` | — |
| `automation:assetLost` | `systems/automation.js:1119` | `systems/intervention.js:37` |
| `automation:assetRepossessed` | `systems/automation.js:829` | — |
| `automation:incomeCredited` | `systems/automation.js:857` | — |
| `automation:offlineSummary` | `systems/automation.js:1200` | — |
| `automation:outpostRaided` | `systems/automation.js:738`, `systems/automation.js:1271` | — |
| `beacon:deploy` | — | `systems/beacons.js:35` |
| `beacon:deployed` | `systems/beacons.js:75` | — |
| `boss:defeated` | `systems/world.js:148` | — |
| `camera:kill` | `render/feel.js:389`, `render/feel.js:538` | `render/renderer.js:701` |
| `camera:shake` | `render/vfx.js:761`, `render/vfx.js:1022`, `systems/combat.js:248`, `systems/combat.js:276`, `systems/combat.js:292`, `systems/combat.js:344`, `systems/drill.js:348`, `systems/intervention.js:106`, `systems/presentationAdapters.js:129` | `render/renderer.js:700` |
| `camera:zoom` | `ui/input.js:223`, `ui/input.js:224`, `ui/input.js:350` | `render/renderer.js:707` |
| `cargo:changed` | `systems/cargo.js:41`, `systems/mining.js:651` | `ui/commandBar.js:360`, `ui/hud.js:906`, `ui/hud.js:935`, `ui/hudMeta.js:152`, `ui/screens/manufacture.js:214`, `ui/screens/stationHub.js:1325`, `ui/screens/stationHub.js:1326`, `ui/screens/stationHub.js:1327` |
| `cargo:delivered` | `systems/missions.js:1164` | — |
| `cargo:full` | `systems/cargo.js:62`, `systems/mining.js:358`, `systems/mining.js:619` | `systems/onboarding.js:187`, `ui/alerts.js:133`, `ui/floatingText.js:129` |
| `cargo:jettison` | `ui/hud.js:865` | `ui/hud.js:869` |
| `charge:detonated` | `systems/impulseCharges.js:270` | `render/feel.js:484`, `render/vfx.js:302` |
| `charge:stuck` | `systems/impulseCharges.js:154` | — |
| `charge:thrown` | `systems/impulseCharges.js:210` | — |
| `claim:claimed` | `systems/claims.js:85` | `systems/onboarding.js:239` |
| `claim:moduleBuilt` | `systems/claims.js:122` | — |
| `claim:teleportRequest` | `systems/claims.js:136` | — |
| `combat:actionCancelled` | `combat/actions.js:285` | — |
| `combat:actionCompleted` | `combat/actions.js:271` | — |
| `combat:actionPhase` | `combat/actions.js:157` | — |
| `combat:actionRejected` | `combat/actions.js:299` | — |
| `combat:actionStarted` | `combat/actions.js:127` | `systems/scenarioRuntime.js:20` |
| `combat:baseDestroyed` | — | `systems/economy.js:297` |
| `combat:beamStop` | `systems/weapons.js:118` | `audio/audioSystem.js:214` |
| `combat:damage` | `combat/damage.js:154` | `audio/audioSystem.js:216`, `render/feel.js:332`, `render/vfx.js:282`, `systems/ai.js:87`, `systems/cruise.js:21`, `systems/heat.js:118`, `systems/onboarding.js:157`, `systems/onboarding.js:164`, `systems/presentationOrchestrator.js:56`, `ui/alerts.js:124`, `ui/commandBar.js:356`, `ui/floatingText.js:75`, `ui/floatingText.js:83`, `ui/hud.js:351`, `ui/hud.js:542` |
| `combat:fire` | `systems/weapons.js:308`, `systems/weapons.js:374` | `audio/audioSystem.js:213`, `render/feel.js:402`, `render/vfx.js:280`, `systems/cruise.js:28`, `ui/hud.js:947` |
| `combat:hitAsset` | `systems/wingmen.js:60` | `systems/automation.js:188` |
| `combat:lockChanged` | — | `systems/world.js:118`, `ui/alerts.js:129` |
| `combat:repairSubsystem` | — | `combat/kernel.js:69` |
| `combat:requestAction` | — | `combat/kernel.js:67` |
| `combat:routeDamage` | `systems/impulseCharges.js:295` | `combat/kernel.js:68` |
| `combat:statusApplied` | `combat/statuses.js:142` | — |
| `combat:statusExpired` | `combat/statuses.js:53` | — |
| `combat:subsystemDisabled` | — | `systems/presentationOrchestrator.js:57` |
| `comms:popup` | `systems/ai.js:457`, `systems/missions.js:1231`, `systems/story.js:247` | `ui/comms.js:189`, `ui/screens/codex.js:301` |
| `conflict:flip` | `systems/factions.js:384` | `systems/sectorSim.js:86` |
| `conflict:warDeclared` | `systems/factions.js:341` | — |
| `contraband:bribe` | — | `systems/economy.js:293` |
| `contraband:scanned` | `systems/economy.js:884` | `systems/factions.js:196`, `systems/heat.js:121` |
| `countermeasure:deployed` | `systems/countermeasures.js:185` | — |
| `craft:complete` | `systems/crafting.js:220`, `systems/crafting.js:257` | `ui/screens/manufacture.js:216` |
| `craft:queueChanged` | `systems/crafting.js:122`, `systems/crafting.js:230`, `systems/crafting.js:259` | `systems/onboarding.js:245`, `ui/screens/manufacture.js:217` |
| `credits:changed` | `systems/economy.js:730`, `systems/economy.js:741` | `audio/audioSystem.js:236`, `ui/commandBar.js:361`, `ui/hud.js:934`, `ui/screens/manufacture.js:215`, `ui/screens/stationHub.js:1328`, `ui/screens/stationHub.js:1329` |
| `cruise:charging` | `systems/cruise.js:82` | `render/vfx.js:299` |
| `cruise:dropped` | `systems/cruise.js:93` | `render/vfx.js:301` |
| `cruise:engaged` | `systems/cruise.js:58` | `render/vfx.js:300` |
| `cruise:snared` | `systems/cruise.js:92` | — |
| `danger:miningNoise` | `systems/mining.js:663` | — |
| `day:tick` | `core/coreSystem.js:96` | `systems/factions.js:212`, `systems/sectorSim.js:72` |
| `distress:rescued` | — | `systems/factions.js:205` |
| `dock:docked` | `ui/input.js:44` | `audio/audioSystem.js:247`, `save/saveSystem.js:77`, `systems/combat.js:223`, `systems/economy.js:280`, `systems/mining.js:82`, `systems/missions.js:207`, `systems/onboarding.js:135`, `systems/onboarding.js:204`, `systems/story.js:75`, `ui/alerts.js:116`, `ui/uiRoot.js:393`, `ui/wingmanRadial.js:140` |
| `dock:range` | `core/physics.js:556`, `core/physics.js:560` | `systems/onboarding.js:171`, `ui/alerts.js:112`, `ui/hud.js:339`, `ui/input.js:33` |
| `dock:undocked` | `ui/input.js:344`, `ui/screens/stationHub.js:835` | `audio/audioSystem.js:248`, `save/saveSystem.js:78`, `systems/combat.js:227`, `systems/economy.js:283`, `systems/missions.js:215`, `ui/input.js:37`, `ui/uiRoot.js:420` |
| `drill:end` | `systems/drill.js:154` | — |
| `drill:gasHit` | `systems/drill.js:347` | `ui/screens/drill.js:789` |
| `drill:spark` | `systems/drill.js:314` | `ui/screens/drill.js:800` |
| `drill:start` | `systems/drill.js:143` | `systems/onboarding.js:210` |
| `drill:warn` | `systems/drill.js:223`, `systems/drill.js:230`, `systems/drill.js:285`, `systems/drill.js:300`, `systems/drill.js:337` | `ui/screens/drill.js:795` |
| `drill:yield` | `systems/drill.js:335` | `ui/screens/drill.js:781` |
| `economy:applyTradePressure` | `systems/automation.js:366`, `systems/automation.js:662`, `systems/automation.js:663`, `systems/sectorSim.js:313` | `systems/economy.js:274` |
| `economy:chargeCredits` | `systems/automation.js:760`, `systems/automation.js:767`, `systems/automation.js:1193`, `systems/automation.js:1353`, `systems/beacons.js:61`, `systems/claims.js:68`, `systems/claims.js:113`, `systems/missions.js:608`, `systems/ships.js:560`, `systems/ships.js:611`, `systems/ships.js:638`, `systems/world.js:833`, `systems/world.js:1046` | `systems/economy.js:252` |
| `economy:eventEnded` | `systems/economy.js:966` | `ui/floatingText.js:145`, `ui/screens/stationHub.js:1366` |
| `economy:eventStarted` | `systems/economy.js:941` | `ui/floatingText.js:134`, `ui/screens/stationHub.js:1365` |
| `economy:grantCredits` | `systems/automation.js:853`, `systems/combat.js:294`, `systems/combat.js:298`, `systems/combat.js:330`, `systems/mining.js:569`, `systems/missions.js:1250`, `systems/missions.js:1252`, `systems/missions.js:1632`, `systems/ships.js:663`, `systems/story.js:427` | `systems/economy.js:251` |
| `economy:marketOpened` | `ui/screens/market.js:1213` | `systems/economy.js:257` |
| `economy:tick` | `systems/economy.js:356` | `ui/priceHistory.js:36`, `ui/screens/stationHub.js:1324` |
| `economy:tradeCompleted` | `systems/economy.js:611` | `audio/audioSystem.js:237`, `systems/factions.js:175`, `systems/missions.js:219`, `systems/onboarding.js:136`, `systems/sectorSim.js:81`, `ui/screens/market.js:539`, `ui/screens/stationHub.js:1322`, `ui/screens/stationHub.js:1323` |
| `economy:tradeFailed` | `systems/economy.js:681`, `systems/economy.js:698` | `ui/screens/market.js:550` |
| `endgame:chosen` | `systems/story.js:401` | — |
| `endgame:loopBack` | `systems/story.js:421` | — |
| `endgame:offer` | `systems/story.js:337` | `ui/comms.js:373` |
| `endgame:promptChoiceC` | `systems/story.js:383` | `ui/comms.js:375` |
| `entity:destroyed` | `main.js:173`, `save/saveSystem.js:744`, `systems/wingmen.js:99`, `systems/world.js:234` | `audio/audioSystem.js:228`, `combat/kernel.js:62`, `render/renderer.js:691`, `render/vfx.js:285`, `systems/ai.js:99`, `systems/missions.js:227`, `ui/radar.js:271` |
| `entity:kill` | — | `core/coreSystem.js:66` |
| `entity:killed` | `combat/damage.js:222`, `combat/kernel.js:42`, `systems/combat.js:287` | `audio/audioSystem.js:227`, `render/feel.js:365`, `render/vfx.js:284`, `systems/ai.js:100`, `systems/factions.js:153`, `systems/heat.js:114`, `systems/mining.js:77`, `systems/missions.js:225`, `systems/onboarding.js:149`, `systems/sectorSim.js:85`, `systems/story.js:79`, `systems/world.js:127`, `ui/floatingText.js:84`, `ui/floatingText.js:92` |
| `entity:spawnRequest` | — | `core/coreSystem.js:70` |
| `entity:spawned` | `core/coreSystem.js:29` | `combat/kernel.js:57`, `render/renderer.js:690`, `render/vfx.js:286`, `ui/radar.js:270` |
| `faction:aggro` | `systems/factions.js:246`, `systems/factions.js:277`, `systems/factions.js:465` | `systems/heat.js:126` |
| `faction:repChanged` | `systems/factions.js:243`, `systems/factions.js:272`, `systems/factions.js:461` | `ui/floatingText.js:119`, `ui/screens/stationHub.js:1347` |
| `faction:repDelta` | `systems/economy.js:883`, `systems/missions.js:1314`, `systems/missions.js:1337`, `systems/missions.js:1604`, `systems/missions.js:1606`, `systems/missions.js:1637`, `systems/story.js:410`, `systems/story.js:412` | `systems/factions.js:147` |
| `faction:repSpillover` | `systems/factions.js:270` | — |
| `field:depletedChanged` | — | `systems/world.js:122` |
| `flight:modeChanged` | `systems/flightV3.js:413` | — |
| `fuel:changed` | `systems/economy.js:763`, `systems/world.js:1285`, `systems/world.js:1293` | `ui/screens/stationHub.js:1341`, `ui/screens/stationHub.js:1342`, `ui/screens/stationHub.js:1343` |
| `fuel:empty` | `systems/world.js:1286` | `audio/audioSystem.js:264`, `ui/alerts.js:134` |
| `game:load` | `ui/input.js:114`, `ui/input.js:220`, `ui/screens/mainMenu.js:278`, `ui/screens/saveLoad.js:333` | `save/saveSystem.js:69`, `ui/commandBar.js:378` |
| `game:new` | `ui/screens/gameOver.js:172`, `ui/screens/newGame.js:313` | `main.js:105`, `ui/commandBar.js:377`, `ui/priceHistory.js:58` |
| `game:over` | `systems/combat.js:277` | `ui/uiRoot.js:520` |
| `game:save` | `ui/input.js:113`, `ui/input.js:218`, `ui/screens/saveLoad.js:319` | `save/saveSystem.js:68` |
| `game:startFailed` | `main.js:253` | `ui/screens/newGame.js:303` |
| `game:started` | `main.js:209` | `audio/audioSystem.js:302`, `render/renderer.js:708`, `systems/automation.js:192`, `systems/factions.js:144`, `systems/flight.js:78`, `systems/flightV3.js:105`, `systems/missions.js:198`, `systems/onboarding.js:122`, `systems/onboarding.js:253`, `systems/sectorSim.js:76`, `systems/story.js:66`, `systems/tacticalAI.js:92`, `ui/commandBar.js:376`, `ui/radar.js:272`, `ui/uiRoot.js:516`, `ui/uiRoot.js:535` |
| `gamepad:connected` | `systems/gamepad.js:154` | `ui/uiRoot.js:214` |
| `gamepad:disconnected` | `systems/gamepad.js:147` | `ui/uiRoot.js:215` |
| `gate:range` | `core/physics.js:566`, `core/physics.js:570` | `systems/onboarding.js:179`, `ui/alerts.js:118` |
| `graffiti:show` | `systems/story.js:286`, `systems/story.js:298`, `systems/story.js:484`, `systems/story.js:533` | `ui/comms.js:282`, `ui/screens/codex.js:302` |
| `hazard:enter` | `systems/world.js:1263` | — |
| `hazard:exit` | `systems/world.js:1273` | — |
| `heat:changed` | `systems/heat.js:265` | `ui/hud.js:956` |
| `hud:phase` | `systems/story.js:126`, `systems/story.js:145`, `systems/story.js:148` | `ui/hudMeta.js:102` |
| `hud:tagFlicker` | `systems/story.js:312` | `ui/hudMeta.js:136` |
| `interdiction:triggered` | `systems/world.js:950` | `systems/sectorSim.js:82` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:917` | `audio/audioSystem.js:258`, `render/feel.js:436`, `render/renderer.js:761`, `render/vfx.js:308`, `systems/sectorSim.js:91` |
| `jump:chargeAbort` | `systems/world.js:1019`, `systems/world.js:1069`, `ui/comms.js:400` | — |
| `jump:chargeStart` | `systems/world.js:1056` | `audio/audioSystem.js:249`, `render/feel.js:426`, `systems/story.js:83` |
| `jump:chargeTick` | `systems/world.js:874` | — |
| `jump:start` | `systems/world.js:883` | `audio/audioSystem.js:253`, `render/feel.js:430`, `render/vfx.js:307`, `systems/economy.js:291`, `systems/sectorSim.js:90` |
| `loot:drop` | `systems/combat.js:299`, `systems/onboarding.js:722` | `systems/mining.js:79`, `ui/floatingText.js:86` |
| `map:sectorCharted` | `systems/world.js:837` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:570` | `systems/missions.js:223` |
| `mining:bulkRequiresTether` | `systems/mining.js:201` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:529` | — |
| `mining:richCoreCompleted` | `systems/mining.js:550` | — |
| `mining:richCoreExposed` | `systems/mining.js:507` | — |
| `mining:richCoreFizzle` | `systems/mining.js:552` | — |
| `mining:seamHit` | `systems/mining.js:704` | — |
| `mining:start` | `systems/mining.js:134` | `audio/audioSystem.js:231`, `render/vfx.js:291`, `systems/onboarding.js:139` |
| `mining:stop` | `systems/mining.js:152` | `audio/audioSystem.js:232`, `render/vfx.js:292` |
| `mining:tick` | `systems/automation.js:349`, `systems/automation.js:478`, `systems/mining.js:222` | `audio/audioSystem.js:233`, `render/vfx.js:293` |
| `mining:yield` | `systems/mining.js:269`, `systems/mining.js:407`, `systems/mining.js:549` | `audio/audioSystem.js:261`, `render/feel.js:449`, `render/vfx.js:294`, `systems/missions.js:221`, `ui/floatingText.js:85` |
| `miningDrone:sellOre` | — | `systems/economy.js:270` |
| `mission:abandoned` | — | `ui/hud.js:940` |
| `mission:accepted` | `systems/missions.js:620` | `audio/audioSystem.js:241`, `systems/onboarding.js:141`, `ui/hud.js:938`, `ui/screens/missionLog.js:885`, `ui/screens/stationHub.js:1355` |
| `mission:completed` | `systems/missions.js:1292` | `audio/audioSystem.js:242`, `save/saveSystem.js:80`, `systems/factions.js:184`, `ui/hud.js:939`, `ui/screens/missionLog.js:886`, `ui/screens/stationHub.js:1362` |
| `mission:expired` | `systems/missions.js:1346` | `audio/audioSystem.js:246`, `save/saveSystem.js:82`, `systems/factions.js:193`, `ui/screens/missionLog.js:888`, `ui/screens/stationHub.js:1364` |
| `mission:failed` | `systems/missions.js:1324` | `audio/audioSystem.js:245`, `save/saveSystem.js:81`, `systems/factions.js:192`, `ui/screens/missionLog.js:887`, `ui/screens/stationHub.js:1363` |
| `mission:forceEvent` | — | `systems/economy.js:296` |
| `mission:updated` | `systems/missions.js:287`, `systems/missions.js:621`, `systems/missions.js:675`, `systems/missions.js:753`, `systems/missions.js:1012`, `systems/missions.js:1041`, `systems/missions.js:1055`, `systems/missions.js:1072`, `systems/missions.js:1098`, `systems/missions.js:1284`, `systems/missions.js:1328`, `systems/missions.js:1350`, `systems/missions.js:1443`, `systems/missions.js:1561`, `systems/missions.js:1663` | `ui/hud.js:937`, `ui/screens/missionLog.js:884`, `ui/screens/stationHub.js:1349` |
| `mode:changed` | `main.js:238`, `main.js:245`, `main.js:252`, `save/saveSystem.js:584` | `ui/comms.js:417`, `ui/uiRoot.js:251`, `ui/wingmanRadial.js:139` |
| `module:equipped` | `systems/ships.js:742` | `systems/ships.js:440`, `systems/world.js:119`, `ui/screens/stationHub.js:1336` |
| `module:purchased` | `systems/ships.js:616` | `ui/screens/stationHub.js:1338` |
| `module:unequipped` | `systems/ships.js:761` | `systems/ships.js:441`, `systems/world.js:120`, `ui/screens/stationHub.js:1337` |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:617`, `systems/world.js:1107` | — |
| `nav:waypoint` | `save/saveSystem.js:722`, `systems/missions.js:790`, `systems/missions.js:822`, `systems/missions.js:1030`, `systems/world.js:1106`, `ui/screens/market.js:1280` | `ui/screens/stationHub.js:1344`, `ui/screens/stationHub.js:1345` |
| `patrol:proximity` | — | `systems/economy.js:292` |
| `physics:attachmentBroken` | — | `combat/kernel.js:66` |
| `physics:impact` | `core/physics.js:907` | — |
| `pickup:collected` | `core/physics.js:815`, `systems/mining.js:339` | `audio/audioSystem.js:235`, `render/vfx.js:309`, `systems/cargo.js:97`, `systems/mining.js:81`, `systems/onboarding.js:140`, `ui/floatingText.js:102` |
| `player:death` | `systems/combat.js:274`, `systems/combat.js:325` | `audio/audioSystem.js:229`, `render/feel.js:393`, `render/vfx.js:290`, `save/saveSystem.js:73`, `ui/hud.js:646` |
| `player:respawn` | `systems/combat.js:337` | `audio/audioSystem.js:230`, `render/renderer.js:710`, `save/saveSystem.js:74`, `ui/commandBar.js:357`, `ui/hud.js:660` |
| `player:scannedByPatrol` | `systems/economy.js:849` | `systems/missions.js:231` |
| `poi:discovered` | `systems/world.js:1211`, `systems/world.js:1237` | — |
| `poi:identified` | `systems/world.js:1240` | — |
| `presentation:audioCue` | `systems/presentationAdapters.js:164` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:128` | — |
| `presentation:caption` | `systems/presentationAdapters.js:199` | `ui/hud.js:711` |
| `presentation:cue` | — | `systems/presentationAdapters.js:55` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:110` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:181` | — |
| `presentation:vfxCue` | `render/vfx.js:318`, `systems/impulseCharges.js:271`, `systems/missions.js:627`, `systems/missions.js:1297`, `systems/presentationAdapters.js:149` | `render/vfx.js:306` |
| `projectile:hit` | `core/physics.js:474`, `core/physics.js:488`, `systems/sectorSim.js:479` | `audio/audioSystem.js:215`, `render/vfx.js:281`, `systems/combat.js:222` |
| `research:pointsChanged` | `systems/missions.js:1267` | — |
| `salvage:completed` | `systems/mining.js:413` | — |
| `save:completed` | `save/saveSystem.js:283` | `ui/uiRoot.js:108` |
| `save:error` | `save/saveSystem.js:202`, `save/saveSystem.js:225`, `save/saveSystem.js:267`, `save/saveSystem.js:276`, `save/saveSystem.js:290`, `save/saveSystem.js:295`, `save/saveSystem.js:302`, `save/saveSystem.js:422`, `save/saveSystem.js:427`, `save/saveSystem.js:428`, `save/saveSystem.js:436`, `save/saveSystem.js:444`, `save/saveSystem.js:446`, `save/saveSystem.js:447`, `save/saveSystem.js:454`, `save/saveSystem.js:461`, `save/saveSystem.js:463`, `save/saveSystem.js:470`, `save/saveSystem.js:591`, `save/saveSystem.js:851`, `save/saveSystem.js:864`, `save/saveSystem.js:878` | `ui/uiRoot.js:122` |
| `save:loaded` | `save/saveSystem.js:587` | `audio/audioSystem.js:301`, `core/physics.js:52`, `main.js:99`, `render/renderer.js:709`, `render/renderer.js:766`, `render/vfx.js:289`, `systems/automation.js:191`, `systems/beacons.js:37`, `systems/flight.js:74`, `systems/flightV3.js:104`, `systems/missions.js:199`, `systems/onboarding.js:126`, `systems/presentationAdapters.js:56`, `systems/presentationOrchestrator.js:64`, `systems/sectorSim.js:75`, `systems/story.js:67`, `systems/tacticalAI.js:93`, `ui/priceHistory.js:59`, `ui/radar.js:273`, `ui/uiRoot.js:115`, `ui/uiRoot.js:536` |
| `save:started` | `save/saveSystem.js:270` | `ui/uiRoot.js:104` |
| `scan:completed` | `systems/scanner.js:202`, `systems/world.js:1215` | `systems/missions.js:229`, `ui/hud.js:1273` |
| `scan:pulse` | `systems/scanner.js:175` | `systems/onboarding.js:148`, `ui/hud.js:1274` |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:129` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:146` | `systems/presentationOrchestrator.js:35` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:464` | `systems/presentationOrchestrator.js:63`, `ui/comms.js:194` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:251` | `ui/comms.js:190` |
| `scenario:factChanged` | `systems/scenarioRuntime.js:439` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:124` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:114` | — |
| `sector:discovered` | `systems/world.js:215` | — |
| `sector:enter` | `systems/world.js:221` | `audio/audioSystem.js:269`, `render/renderer.js:741`, `render/vfx.js:288`, `save/saveSystem.js:79`, `systems/economy.js:284`, `systems/mining.js:84`, `systems/missions.js:234`, `systems/sectorSim.js:74`, `systems/story.js:82`, `systems/traffic.js:98`, `systems/wingmen.js:34`, `ui/commandBar.js:363`, `ui/radar.js:274`, `ui/radar.js:275` |
| `sector:exit` | `systems/world.js:168` | `systems/automation.js:196`, `systems/missions.js:235`, `systems/sectorSim.js:73` |
| `sector:leave` | — | `systems/traffic.js:99`, `systems/wingmen.js:36` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:276` | `ui/screens/starmap.js:577` |
| `sectorsim:impulse` | — | `systems/sectorSim.js:80` |
| `sectorsim:intel` | `systems/sectorSim.js:610` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:530` | — |
| `sectorsim:reconcile` | `systems/sectorSim.js:510` | — |
| `sectorsim:tick` | `systems/sectorSim.js:224` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:490` | `ui/screens/starmap.js:578` |
| `settings:changed` | `render/renderer.js:521`, `save/saveSystem.js:596`, `systems/touch.js:250`, `ui/screens/settings.js:215`, `ui/screens/settings.js:463`, `ui/screens/settings.js:538` | `audio/audioSystem.js:284`, `main.js:98`, `render/renderer.js:714`, `save/saveSystem.js:70`, `ui/uiRoot.js:191` |
| `ship:appearanceChanged` | `systems/ships.js:528` | `render/renderer.js:699`, `render/vfx.js:287` |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:144` | `audio/audioSystem.js:270`, `render/feel.js:463`, `render/vfx.js:296`, `systems/cruise.js:25` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:145`, `systems/flightV3.js:322` | `audio/audioSystem.js:275`, `render/renderer.js:704`, `render/vfx.js:297` |
| `ship:cargoCapChanged` | `systems/ships.js:523` | `systems/cargo.js:120` |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:301` | `audio/audioSystem.js:276`, `render/vfx.js:298`, `ui/floatingText.js:89` |
| `ship:purchased` | `systems/ships.js:643` | `audio/audioSystem.js:268`, `systems/missions.js:238`, `systems/onboarding.js:142`, `ui/screens/stationHub.js:1334` |
| `ship:sold` | `systems/ships.js:664` | `ui/screens/stationHub.js:1335` |
| `ship:statsChanged` | `systems/ships.js:522` | `systems/cargo.js:121`, `systems/world.js:121`, `ui/commandBar.js:358`, `ui/hud.js:936`, `ui/screens/stationHub.js:1331`, `ui/screens/stationHub.js:1332`, `ui/screens/stationHub.js:1333` |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1019` | `render/vfx.js:295` |
| `sim:jumpGate` | — | `systems/economy.js:290` |
| `sim:pause` | `ui/screenManager.js:171`, `ui/screens/gameOver.js:186`, `ui/screens/gameOver.js:204`, `ui/screens/pause.js:389`, `ui/screens/pause.js:403` | `audio/audioSystem.js:291` |
| `sim:resume` | `ui/screenManager.js:179`, `ui/screens/pause.js:383` | `audio/audioSystem.js:292` |
| `spawn:request` | `systems/automation.js:590` | `systems/world.js:123` |
| `story:beatAdvanced` | `systems/missions.js:1652` | `systems/story.js:63`, `ui/screens/codex.js:300` |
| `tech:researched` | `systems/ships.js:565` | `audio/audioSystem.js:267`, `systems/onboarding.js:226`, `systems/ships.js:442`, `ui/screens/manufacture.js:218`, `ui/screens/stationHub.js:1339` |
| `tether:attached` | `combat/attachments.js:97` | `render/vfx.js:278`, `systems/presentationOrchestrator.js:36`, `systems/scenarioRuntime.js:21` |
| `tether:broke` | `systems/tetherGameplay.js:94`, `systems/tetherGameplay.js:220` | `systems/onboarding.js:147` |
| `tether:broken` | `combat/attachments.js:212` | `render/feel.js:474`, `render/renderer.js:706`, `render/vfx.js:279`, `systems/presentationOrchestrator.js:49`, `systems/scenarioRuntime.js:22` |
| `tether:cut` | `systems/tetherGameplay.js:77` | — |
| `tether:latched` | `systems/tetherGameplay.js:135` | `systems/flightV3.js:106`, `systems/onboarding.js:145` |
| `tether:nearBreak` | `combat/attachments.js:431` | `systems/presentationOrchestrator.js:42` |
| `tether:reel` | `combat/attachments.js:147` | — |
| `tether:released` | `systems/tetherGameplay.js:78`, `systems/tetherGameplay.js:219` | `render/renderer.js:705`, `systems/onboarding.js:146` |
| `tether:strain` | `systems/tetherGameplay.js:257` | — |
| `touch:uiAction` | `systems/touch.js:219` | `ui/input.js:358` |
| `tutorial:finished` | `systems/onboarding.js:456` | `systems/story.js:69` |
| `tutorial:say` | `systems/onboarding.js:336` | `systems/story.js:72` |
| `ui:abandonMission` | `ui/screens/missionLog.js:848` | `systems/missions.js:203` |
| `ui:acceptMission` | `ui/screens/bar.js:1016`, `ui/screens/stationHub.js:895` | `systems/missions.js:202` |
| `ui:buy` | `ui/screens/market.js:480` | `systems/economy.js:255` |
| `ui:buyModule` | `ui/screens/outfitting.js:540` | `systems/onboarding.js:220`, `systems/ships.js:446` |
| `ui:buyShip` | `ui/screens/shipyard.js:461` | `systems/ships.js:445` |
| `ui:cancel` | `ui/input.js:532`, `ui/input.js:546` | — |
| `ui:click` | — | `audio/audioSystem.js:295` |
| `ui:closeAll` | `main.js:226` | `ui/uiRoot.js:361` |
| `ui:closeCargo` | `ui/input.js:73`, `ui/input.js:130` | `ui/hud.js:910` |
| `ui:closeComms` | `ui/input.js:125` | `ui/comms.js:267` |
| `ui:confirm` | `ui/input.js:540` | `audio/audioSystem.js:297` |
| `ui:cycleTarget` | `ui/input.js:160`, `ui/input.js:592` | `ui/uiRoot.js:362` |
| `ui:deny` | — | `audio/audioSystem.js:298` |
| `ui:drillFadeStart` | `ui/input.js:279` | `ui/uiRoot.js:442` |
| `ui:endgameChoose` | `ui/comms.js:359`, `ui/comms.js:394` | `systems/story.js:85` |
| `ui:fitModule` | `ui/screens/outfitting.js:514` | `systems/onboarding.js:216`, `systems/ships.js:447` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:711`, `ui/wingmanRadial.js:114` | `systems/automation.js:185`, `systems/wingmen.js:41` |
| `ui:hover` | — | `audio/audioSystem.js:296` |
| `ui:kurtzInteract` | — | `systems/story.js:87` |
| `ui:navigate` | `ui/input.js:519`, `ui/input.js:523`, `ui/input.js:571` | — |
| `ui:popScreen` | `ui/screens/automationPanel.js:262`, `ui/screens/starmap.js:423` | `ui/uiRoot.js:359` |
| `ui:purchaseSurveyData` | `ui/screens/bar.js:998` | `systems/world.js:124` |
| `ui:pushScreen` | `ui/screens/bar.js:367`, `ui/screens/missionLog.js:478`, `ui/screens/starmap.js:431`, `ui/screens/stationHub.js:190` | `ui/uiRoot.js:358` |
| `ui:replaceScreen` | — | `ui/uiRoot.js:360` |
| `ui:sell` | `ui/screens/market.js:392` | `systems/economy.js:256` |
| `ui:sellShip` | `ui/screens/shipyard.js:436` | — |
| `ui:service` | `ui/screens/services.js:364` | `systems/economy.js:287` |
| `ui:setActiveShip` | `ui/screens/shipyard.js:441` | — |
| `ui:setCourse` | `systems/input.js:514`, `systems/missions.js:810`, `ui/screens/localmap.js:586`, `ui/screens/market.js:1282`, `ui/screens/starmap.js:1215`, `ui/screens/starmap.js:1228`, `ui/screens/starmap.js:1232` | `systems/world.js:117` |
| `ui:talkContact` | `ui/screens/bar.js:1057` | — |
| `ui:targetNearestHostileToCursor` | `systems/input.js:535`, `systems/input.js:549` | `ui/uiRoot.js:363` |
| `ui:toggleCargo` | `ui/input.js:186` | `ui/hud.js:909` |
| `ui:toggleComms` | `ui/input.js:203` | `ui/comms.js:266` |
| `ui:toggleOverview` | `ui/input.js:190` | `ui/hud.js:1283` |
| `ui:trackMission` | `ui/screens/missionLog.js:811`, `ui/screens/missionLog.js:827` | `systems/missions.js:204` |
| `ui:undock` | `ui/screenManager.js:272` | `ui/input.js:357` |
| `ui:unfitModule` | `ui/screens/outfitting.js:477` | `systems/ships.js:448` |
| `ui:unlockTech` | `ui/screens/techTree.js:579` | `systems/ships.js:449` |
| `ui:wingmanRadial` | `ui/input.js:196` | `ui/wingmanRadial.js:137` |
| `weapons:vent` | `systems/weapons.js:165`, `systems/weapons.js:178` | `ui/hud.js:976` |
| `world:requestJump` | `ui/screens/starmap.js:1227` | `systems/world.js:114` |
| `world:requestRoute` | `ui/screens/starmap.js:1214`, `ui/screens/starmap.js:1231` | `systems/world.js:115` |
| `world:requestSectorScan` | — | `systems/world.js:116` |

## Events with no emitter (likely dead, or emitted dynamically)

- `beacon:deploy` — 1 subscriber(s)
- `combat:baseDestroyed` — 1 subscriber(s)
- `combat:lockChanged` — 2 subscriber(s)
- `combat:repairSubsystem` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 1 subscriber(s)
- `contraband:bribe` — 1 subscriber(s)
- `distress:rescued` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `entity:spawnRequest` — 1 subscriber(s)
- `field:depletedChanged` — 1 subscriber(s)
- `miningDrone:sellOre` — 1 subscriber(s)
- `mission:abandoned` — 1 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `patrol:proximity` — 1 subscriber(s)
- `physics:attachmentBroken` — 1 subscriber(s)
- `presentation:cue` — 1 subscriber(s)
- `sector:leave` — 2 subscriber(s)
- `sectorsim:impulse` — 1 subscriber(s)
- `sim:jumpGate` — 1 subscriber(s)
- `ui:click` — 1 subscriber(s)
- `ui:deny` — 1 subscriber(s)
- `ui:hover` — 1 subscriber(s)
- `ui:kurtzInteract` — 1 subscriber(s)
- `ui:replaceScreen` — 1 subscriber(s)
- `world:requestSectorScan` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `ai:encounterCommand` — 1 emitter(s)
- `ai:stateChange` — 1 emitter(s)
- `asteroid:chunked` — 1 emitter(s)
- `automation:assetDistressed` — 1 emitter(s)
- `automation:assetRepossessed` — 1 emitter(s)
- `automation:incomeCredited` — 1 emitter(s)
- `automation:offlineSummary` — 1 emitter(s)
- `automation:outpostRaided` — 2 emitter(s)
- `beacon:deployed` — 1 emitter(s)
- `boss:defeated` — 1 emitter(s)
- `cargo:delivered` — 1 emitter(s)
- `charge:stuck` — 1 emitter(s)
- `charge:thrown` — 1 emitter(s)
- `claim:moduleBuilt` — 1 emitter(s)
- `claim:teleportRequest` — 1 emitter(s)
- `combat:actionCancelled` — 1 emitter(s)
- `combat:actionCompleted` — 1 emitter(s)
- `combat:actionPhase` — 1 emitter(s)
- `combat:actionRejected` — 1 emitter(s)
- `combat:statusApplied` — 1 emitter(s)
- `combat:statusExpired` — 1 emitter(s)
- `conflict:warDeclared` — 1 emitter(s)
- `countermeasure:deployed` — 1 emitter(s)
- `cruise:snared` — 1 emitter(s)
- `danger:miningNoise` — 1 emitter(s)
- `drill:end` — 1 emitter(s)
- `endgame:chosen` — 1 emitter(s)
- `endgame:loopBack` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `hazard:enter` — 1 emitter(s)
- `hazard:exit` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `jump:chargeAbort` — 3 emitter(s)
- `jump:chargeTick` — 1 emitter(s)
- `map:sectorCharted` — 1 emitter(s)
- `mining:bulkRequiresTether` — 1 emitter(s)
- `mining:richCoreChargeStart` — 1 emitter(s)
- `mining:richCoreCompleted` — 1 emitter(s)
- `mining:richCoreExposed` — 1 emitter(s)
- `mining:richCoreFizzle` — 1 emitter(s)
- `mining:seamHit` — 1 emitter(s)
- `nav:autopilot` — 3 emitter(s)
- `physics:impact` — 1 emitter(s)
- `poi:discovered` — 2 emitter(s)
- `poi:identified` — 1 emitter(s)
- `presentation:audioCue` — 1 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 1 emitter(s)
- `research:pointsChanged` — 1 emitter(s)
- `salvage:completed` — 1 emitter(s)
- `scenario:actorBindings` — 1 emitter(s)
- `scenario:factChanged` — 1 emitter(s)
- `scenario:factsInitialized` — 1 emitter(s)
- `scenario:loaded` — 1 emitter(s)
- `sector:discovered` — 1 emitter(s)
- `sectorsim:intel` — 1 emitter(s)
- `sectorsim:offlineSummary` — 1 emitter(s)
- `sectorsim:reconcile` — 1 emitter(s)
- `sectorsim:tick` — 1 emitter(s)
- `tether:cut` — 1 emitter(s)
- `tether:reel` — 1 emitter(s)
- `tether:strain` — 1 emitter(s)
- `ui:cancel` — 2 emitter(s)
- `ui:navigate` — 3 emitter(s)
- `ui:sellShip` — 1 emitter(s)
- `ui:setActiveShip` — 1 emitter(s)
- `ui:talkContact` — 1 emitter(s)
