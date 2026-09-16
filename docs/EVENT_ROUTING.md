# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-09-15 · 834 events · 2689 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/encounterDirector.js:197` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:532` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:951` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:1144` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:564` | `systems/salvage.js:70` |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:1003` | `systems/lawSecurity.js:179`, `systems/salvage.js:71` |
| `ai:counterTether` | `ai/sg03ActionPort.js:381` | `systems/presentationOrchestrator.js:155` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:354` | `systems/presentationOrchestrator.js:156`, `systems/tetherGameplay.js:204` |
| `ai:encounterCommand` | `systems/aiPorts.js:225` | — |
| `ai:flee` | `systems/ai.js:243`, `systems/traffic.js:4304`, `systems/wingMorale.js:299` | `render/vfx.js:2063`, `systems/barkDirector.js:185`, `systems/combatOutcome.js:119`, `systems/encounterDirector.js:209`, `systems/presentationOrchestrator.js:157` |
| `ai:formationBroken` | `systems/ai.js:412`, `systems/wingMorale.js:249` | `render/vfx.js:2064` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:187` |
| `ai:stateChange` | `systems/ai.js:240` | — |
| `ai:telegraph` | `systems/ai.js:308`, `systems/encounterScripts.js:126`, `systems/encounterScripts.js:828`, `systems/masslineSnares.js:331`, `systems/mines.js:100`, `systems/tacticalAI.js:342` | `audio/audioSystem.js:1226`, `render/vfx.js:2062`, `systems/presentationOrchestrator.js:154`, `systems/survivalResults.js:352`, `ui/hud.js:2052`, `ui/survivalHud.js:181`, `ui/threatHalo.js:471` |
| `aiTrader:requestTrade` | `systems/traffic.js:5743` | `systems/economy.js:762` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | — |
| `anomaly:bearing` | `systems/scanner.js:1011` | — |
| `anomaly:triangulated` | `systems/scanner.js:1029` | `systems/world.js:397` |
| `asset:deployed` | `systems/automation.js:2007`, `systems/automation.js:2067`, `systems/automation.js:2137`, `systems/claims.js:385` | `systems/missions.js:887`, `systems/onboarding.js:360`, `systems/story.js:165` |
| `asteroid:chunked` | `systems/mining.js:1427` | `systems/presentationOrchestrator.js:194` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:1001`, `systems/mining.js:788` | `audio/audioSystem.js:1198`, `systems/fieldDepletion.js:443`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:254`, `render/vfx.js:2084`, `systems/ai.js:683`, `systems/beacons.js:52`, `systems/beacons.js:57`, `systems/beacons.js:80`, `systems/bombs.js:253`, `systems/bombs.js:363`, `systems/bombs.js:638`, `systems/bulletTime.js:182`, `systems/bulletTime.js:198`, `systems/bulletTime.js:277`, `systems/claims.js:232`, `systems/claims.js:317`, `systems/claims.js:362`, `systems/claims.js:1049`, `systems/cloak.js:107`, `systems/cloak.js:118`, `systems/countermeasures.js:200`, `systems/crafting.js:268`, `systems/crafting.js:278`, `systems/fields.js:650`, `systems/fields.js:736`, `systems/fields.js:769`, `systems/fields.js:776`, `systems/fields.js:1027`, `systems/flybyFocus.js:422`, `systems/impulseCharges.js:555`, `systems/impulseCharges.js:733`, `systems/impulseCharges.js:846`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:179`, `systems/masslineThrow.js:464`, `systems/masslineThrow.js:590`, `systems/mining.js:580`, `systems/mining.js:1507`, `systems/planetRuntime.js:463`, `systems/presentationAdapters.js:513`, `systems/presentationOrchestrator.js:445`, `systems/salvage.js:554`, `systems/tumbleStates.js:282`, `systems/tumbleStates.js:316`, `systems/weapons.js:1262`, `ui/commsRadial.js:509`, `ui/commsRadial.js:554`, `ui/commsRadial.js:739`, `ui/commsRadial.js:770`, `ui/hud.js:2857`, `ui/hud.js:3066`, `ui/hud.js:3117`, `ui/hud.js:3158`, `ui/hud.js:3177`, `ui/hud.js:3268`, `ui/hud.js:3362`, `ui/hud.js:3600`, `ui/input.js:174`, `ui/input.js:197`, `ui/input.js:246`, `ui/input.js:275`, `ui/input.js:281`, `ui/input.js:317`, `ui/input.js:372`, `ui/input.js:378`, `ui/input.js:384`, `ui/input.js:390`, `ui/input.js:601`, `ui/input.js:803`, `ui/input.js:808`, `ui/input.js:826`, `ui/input.js:831`, `ui/input.js:927`, `ui/input.js:935`, `ui/input.js:941`, `ui/input.js:966`, `ui/input.js:977`, `ui/input.js:981`, `ui/input.js:994`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:482`, `ui/screens/base.js:526`, `ui/screens/base.js:673`, `ui/screens/missionLog.js:1803`, `ui/screens/missionLog.js:1807`, `ui/screens/missionLog.js:1811`, `ui/screens/missionLog.js:1815`, `ui/screens/missionLog.js:1831`, `ui/screens/missionLog.js:1839`, `ui/screens/missionLog.js:1846`, `ui/screens/missionLog.js:1853`, `ui/screens/missionLog.js:1861`, `ui/screens/missionLog.js:1868`, `ui/screens/missionLog.js:1875`, `ui/screens/missionLog.js:1884`, `ui/screens/missionLog.js:1891`, `ui/screens/missionLog.js:1907`, `ui/screens/missionLog.js:1938`, `ui/screens/missionLog.js:1958`, `ui/shipLedgerPanel.js:295`, `ui/shipLedgerPanel.js:302`, `ui/shipLedgerPanel.js:309`, `ui/station/screens/bar.js:409`, `ui/station/screens/bar.js:432`, `ui/station/screens/bar.js:436`, `ui/station/screens/bar.js:440`, `ui/station/screens/bar.js:462`, `ui/station/screens/bar.js:478`, `ui/station/screens/bar.js:506`, `ui/station/screens/bar.js:531`, `ui/station/screens/bar.js:540`, `ui/station/screens/contracts.js:602`, `ui/station/screens/contracts.js:630`, `ui/station/screens/contracts.js:637`, `ui/station/screens/factions.js:239`, `ui/station/screens/industry.js:180`, `ui/station/screens/industry.js:209`, `ui/station/screens/market.js:501`, `ui/station/screens/market.js:728`, `ui/station/screens/market.js:774`, `ui/station/screens/market.js:788`, `ui/station/screens/market.js:799`, `ui/station/screens/shipworks.js:571`, `ui/station/screens/shipworks.js:1837`, `ui/station/screens/shipworks.js:2329`, `ui/station/screens/shipworks.js:2346`, `ui/station/screens/shipworks.js:2359`, `ui/station/screens/shipworks.js:2363`, `ui/station/screens/shipworks.js:2368`, `ui/station/screens/shipworks.js:2395`, `ui/station/screens/shipworks.js:2401`, `ui/station/screens/shipworks.js:2416`, `ui/station/screens/shipworks.js:2458`, `ui/station/screens/shipworks.js:2464`, `ui/station/screens/shipworks.js:2476`, `ui/station/screens/shipworks.js:2483`, `ui/station/screens/shipworks.js:2518`, `ui/station/screens/shipworks.js:2525`, `ui/station/screens/shipworks.js:2536`, `ui/station/screens/shipworks.js:2546`, `ui/station/screens/shipworks.js:2551`, `ui/station/screens/shipworks.js:2655`, `ui/station/screens/shipworks.js:2659`, `ui/station/screens/shipworks.js:2663`, `ui/station/stationApp.js:567`, `ui/station/stationApp.js:819`, `ui/station/stationApp.js:855`, `ui/uiRoot.js:1043`, `ui/wingmanRadial.js:81`, `ui/wingmanRadial.js:102`, `ui/wingmanRadial.js:124`, `ui/wingmanRadial.js:150`, `ui/wingmanRadial.js:167` | `audio/audioSystem.js:1291` |
| `automation:assetDistressed` | `systems/automation.js:1763` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2233` | `systems/intervention.js:37`, `systems/lossLedger.js:333`, `systems/missions.js:889` |
| `automation:assetRepossessed` | `systems/automation.js:1788` | `ui/automationPayoff.js:90` |
| `automation:incomeCredited` | `systems/automation.js:1817`, `systems/automation.js:1828`, `systems/automation.js:2506` | — |
| `automation:offlineSummary` | `systems/automation.js:2271`, `systems/automation.js:2295`, `systems/automation.js:2319`, `systems/automation.js:2342`, `systems/automation.js:2553` | `ui/automationPayoff.js:80` |
| `automation:outpostRaided` | `systems/automation.js:1690`, `systems/automation.js:2628` | `systems/lossLedger.js:334` |
| `automation:programAssigned` | `systems/automation.js:1962` | `systems/missions.js:888` |
| `automation:traderCycleCompleted` | `systems/automation.js:1456` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:513` | — |
| `band:bearingRequest` | `systems/bandRadio.js:486` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:603`, `systems/uniqueWrecks.js:646` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:610`, `systems/uniqueWrecks.js:618`, `systems/uniqueWrecks.js:632` | — |
| `band:bed` | `systems/bandRadio.js:570` | `audio/audioSystem.js:1326` |
| `band:cycle` | `ui/bandHud.js:81`, `ui/input.js:297` | — |
| `band:status` | `systems/bandRadio.js:552` | `ui/bandHud.js:85` |
| `barkDirector:voice` | — | `audio/audioSystem.js:1316` |
| `beacon:deploy` | — | `systems/beacons.js:35` |
| `beacon:deployed` | `systems/beacons.js:75` | — |
| `beam:denied` | `systems/mining.js:256`, `systems/mining.js:299`, `systems/mining.js:313`, `systems/mining.js:323`, `systems/mining.js:355` | — |
| `beam:repaired` | `systems/mining.js:416` | — |
| `beam:transferred` | `systems/mining.js:447` | — |
| `bombs:armed` | `systems/bombs.js:284` | — |
| `bombs:cycle` | `systems/bombs.js:174` | — |
| `bombs:detonated` | `systems/bombs.js:352`, `systems/bombs.js:627` | `render/vfx.js:2060` |
| `bombs:dropped` | `systems/bombs.js:245` | — |
| `bombs:fieldEnded` | `systems/bombs.js:640` | `render/vfx.js:2061` |
| `bombs:released` | `systems/bombs.js:690` | — |
| `boss:defeated` | `systems/world.js:607` | — |
| `bounty:cleared` | `systems/economy.js:1794` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:290` | — |
| `bulletTime:end` | `systems/bulletTime.js:197` | `audio/audioSystem.js:1325` |
| `bulletTime:start` | `systems/bulletTime.js:181` | `audio/audioSystem.js:1322`, `systems/onboarding.js:402` |
| `camera:kill` | `render/feel.js:946`, `render/feel.js:1363` | — |
| `camera:shake` | `render/vfx.js:3780`, `render/vfx.js:5069`, `render/vfx.js:5406`, `systems/combat.js:491`, `systems/combat.js:569`, `systems/combat.js:611`, `systems/combat.js:662`, `systems/combat.js:760`, `systems/combat.js:842`, `systems/drill.js:1283`, `systems/flybyFocus.js:421`, `systems/intervention.js:106`, `systems/presentationAdapters.js:435`, `systems/survivalAnnounce.js:413`, `systems/tetherGameplay.js:514` | — |
| `camera:zoom` | `ui/crucibleFocus.js:174`, `ui/crucibleFocus.js:179`, `ui/input.js:444`, `ui/input.js:445`, `ui/input.js:657` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:578` | `systems/world.js:399` |
| `cargo:changed` | `systems/cargo.js:154`, `systems/mining.js:1672` | `systems/ships.js:1318`, `ui/cargoConscience.js:122`, `ui/commandBar.js:412`, `ui/hud.js:3189`, `ui/hud.js:3218`, `ui/hudMeta.js:202` |
| `cargo:delivered` | `systems/missions.js:4824` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:253`, `systems/mining.js:570`, `systems/mining.js:1051` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:320`, `systems/presentationOrchestrator.js:202`, `ui/alerts.js:362`, `ui/floatingText.js:200` |
| `cargo:jettison` | `ui/hud.js:2865` | `ui/hud.js:3122` |
| `cargo:jettisoned` | `systems/cargo.js:477` | `audio/audioSystem.js:1212`, `systems/barkDirector.js:195`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:398` |
| `cargo:massSettled` | `systems/cargo.js:376` | `systems/presentationOrchestrator.js:201`, `systems/ships.js:1319` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:664` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:640` | — |
| `chain:detonated` | `systems/impulseCharges.js:535` | `systems/fields.js:309` |
| `chain:primeEnded` | `systems/impulseCharges.js:498` | — |
| `chain:primed` | `systems/impulseCharges.js:475` | — |
| `chain:slam` | `systems/impulseCharges.js:409`, `systems/impulseCharges.js:429` | `systems/fields.js:308` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1807` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:729` | `systems/onboarding.js:410` |
| `charge:armed` | `systems/impulseCharges.js:572` | — |
| `charge:combo` | `systems/impulseCharges.js:771`, `systems/impulseCharges.js:830` | — |
| `charge:detonated` | `systems/impulseCharges.js:547`, `systems/impulseCharges.js:838` | `audio/audioSystem.js:1236`, `render/feel.js:1043`, `render/vfx.js:2058`, `systems/fields.js:310` |
| `charge:stuck` | `systems/impulseCharges.js:649` | — |
| `charge:thrown` | `systems/impulseCharges.js:725` | — |
| `claim:claimed` | `systems/claims.js:231` | `systems/onboarding.js:366`, `systems/story.js:171`, `systems/traffic.js:1289` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1108` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:185` |
| `claim:defenseResolved` | `systems/claims.js:1184` | — |
| `claim:defenseStarted` | `systems/claims.js:1113` | — |
| `claim:defenseWarning` | `systems/claims.js:1032` | — |
| `claim:freightDelivered` | `systems/traffic.js:2282` | — |
| `claim:infrastructureActive` | `systems/claims.js:756` | `systems/traffic.js:1287` |
| `claim:infrastructureConstructed` | `systems/claims.js:298` | — |
| `claim:infrastructureStatus` | `systems/claims.js:767` | `systems/traffic.js:1288` |
| `claim:moduleBuilt` | `systems/claims.js:316` | — |
| `claim:raidRepelled` | `systems/claims.js:981` | — |
| `claim:raidWarning` | `systems/claims.js:974` | — |
| `claim:receipt` | `systems/claims.js:1401` | — |
| `claim:sensorPostRumor` | `systems/claims.js:815` | `systems/world.js:427` |
| `claim:specialized` | `systems/claims.js:357` | — |
| `claim:teleportRequest` | `systems/claims.js:562` | — |
| `claims:migrated` | `systems/claims.js:1512` | — |
| `cloak:dropped` | `systems/cloak.js:117` | — |
| `cloak:engaged` | `systems/cloak.js:106` | `systems/onboarding.js:406` |
| `combat:actionCancelled` | `combat/actions.js:294` | — |
| `combat:actionCompleted` | `combat/actions.js:280` | — |
| `combat:actionPhase` | `combat/actions.js:162` | — |
| `combat:actionRejected` | `combat/actions.js:316` | `ui/toasts.js:347` |
| `combat:actionStarted` | `combat/actions.js:132` | `systems/presentationOrchestrator.js:159`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2009` |
| `combat:baseDestroyed` | — | `systems/economy.js:808` |
| `combat:beamStop` | `systems/weapons.js:721` | `audio/audioSystem.js:1165`, `render/vfx.js:2005` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:240` | `render/feel.js:1061`, `render/vfx.js:2018`, `systems/fields.js:312`, `systems/gamepad.js:313` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:258` | `render/vfx.js:2019` |
| `combat:damage` | `combat/damage.js:247` | `audio/audioSystem.js:1169`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/feel.js:889`, `render/vfx.js:2010`, `save/saveSystem.js:232`, `systems/ai.js:94`, `systems/barkDirector.js:191`, `systems/cruise.js:23`, `systems/encounterDirector.js:189`, `systems/factionPresence.js:405`, `systems/heat.js:207`, `systems/lawSecurity.js:174`, `systems/onboarding.js:286`, `systems/onboarding.js:297`, `systems/presentationOrchestrator.js:153`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1379`, `systems/stationBroadcast.js:152`, `systems/survivalResults.js:349`, `systems/titles.js:395`, `systems/traffic.js:1237`, `ui/alerts.js:348`, `ui/commandBar.js:401`, `ui/floatingText.js:119`, `ui/floatingText.js:143`, `ui/hud.js:1199`, `ui/hud.js:1492`, `ui/uiRoot.js:510` |
| `combat:fire` | `systems/weapons.js:700`, `systems/weapons.js:849`, `systems/weapons.js:1146` | `audio/audioSystem.js:1164`, `render/feel.js:962`, `render/vfx.js:2004`, `systems/cloak.js:37`, `systems/cruise.js:30`, `systems/lawSecurity.js:175`, `systems/onboarding.js:256`, `systems/onboarding.js:269`, `systems/presentationOrchestrator.js:158`, `systems/traffic.js:1238`, `ui/hud.js:3230` |
| `combat:hit` | `systems/salvageActions.js:182` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:539` |
| `combat:kill` | `systems/world.js:3628` | — |
| `combat:lockChanged` | — | `systems/world.js:392`, `ui/alerts.js:355` |
| `combat:outcome` | `systems/combatOutcome.js:183` | `systems/barkDirector.js:188` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:184` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:73` |
| `combat:requestAction` | — | `combat/kernel.js:71` |
| `combat:routeDamage` | `systems/bombs.js:674`, `systems/drill.js:1295`, `systems/impulseCharges.js:1047`, `systems/mines.js:213`, `systems/missions.js:4429` | `combat/kernel.js:72`, `systems/routeFollower.js:333` |
| `combat:shove` | `systems/onboarding.js:1494` | `systems/onboarding.js:268` |
| `combat:statusApplied` | `combat/statuses.js:155` | `render/vfx.js:2020` |
| `combat:statusExpired` | `combat/statuses.js:57` | — |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:120`, `systems/encounterDirector.js:184`, `systems/factionPresence.js:403`, `systems/presentationOrchestrator.js:222`, `systems/surrenderRecovery.js:64`, `systems/wingMorale.js:179` |
| `combat:subsystemEnabled` | — | `systems/factionPresence.js:404`, `systems/surrenderRecovery.js:65` |
| `combat:surrendered` | — | `systems/combatOutcome.js:121`, `systems/surrenderRecovery.js:63` |
| `combat:tumbled` | `systems/tumbleStates.js:280` | `systems/fields.js:311`, `systems/missions.js:831`, `systems/tetherGameplay.js:203` |
| `combat:weakPointHit` | `systems/combat.js:545` | `render/vfx.js:2011`, `ui/floatingText.js:147` |
| `comms:log` | `systems/encounterScripts.js:552`, `systems/salvage.js:552` | — |
| `comms:popup` | `systems/ai.js:467`, `systems/factionPresence.js:855`, `systems/factionPresence.js:876`, `systems/missions.js:4922`, `systems/missions.js:4956`, `systems/missions.js:4995`, `systems/missions.js:5991`, `systems/missions.js:6368`, `systems/scenarioRuntime.js:186`, `systems/story.js:379`, `systems/story.js:1020`, `systems/story.js:1048` | `audio/audioSystem.js:1277`, `ui/screens/codex.js:660` |
| `conflict:flip` | `systems/factions.js:582` | `systems/sectorSim.js:109`, `systems/story.js:166` |
| `conflict:frontAction` | `systems/factions.js:469` | — |
| `conflict:warDeclared` | `systems/factions.js:526` | — |
| `contactHail:availability` | `systems/scanner.js:1348`, `systems/scanner.js:1359` | — |
| `contactHail:choice` | `ui/commsRadial.js:503`, `ui/contactHailPrompt.js:166` | `systems/scanner.js:834` |
| `contactHail:clear` | `systems/scanner.js:1370` | — |
| `contactHail:handoff` | `systems/scanner.js:1208` | — |
| `contactHail:offer` | `systems/scanner.js:1230` | — |
| `contactHail:request` | `ui/commsRadial.js:555`, `ui/contactHailPrompt.js:160` | `systems/scanner.js:833` |
| `contactHail:response` | `systems/scanner.js:1264` | `systems/traffic.js:1228` |
| `contraband:bribe` | `systems/encounterScripts.js:358`, `ui/customsPrompt.js:182` | `systems/economy.js:804` |
| `contraband:scanned` | `systems/economy.js:2051` | `systems/encounterDirector.js:190`, `systems/factions.js:265`, `systems/heat.js:210`, `systems/lawSecurity.js:185`, `ui/customsPrompt.js:130` |
| `contract:clauseBroken` | `systems/contractClauses.js:351` | `systems/missions.js:868` |
| `contract:clauseHonored` | `systems/contractClauses.js:338`, `systems/missions.js:5009` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:196` | — |
| `craft:complete` | `systems/crafting.js:267`, `systems/crafting.js:310` | `ui/station/screens/industry.js:220` |
| `craft:queueChanged` | `systems/crafting.js:162`, `systems/crafting.js:277`, `systems/crafting.js:312` | `systems/onboarding.js:371`, `ui/station/screens/industry.js:220` |
| `credits:changed` | `systems/economy.js:1735`, `systems/economy.js:1746` | `audio/audioSystem.js:1205`, `balance/hunterPublicRoute.js:466`, `ui/commandBar.js:413`, `ui/hud.js:3217` |
| `cruise:charging` | `systems/cruise.js:90` | `render/vfx.js:2055`, `systems/presentationOrchestrator.js:166` |
| `cruise:dropped` | `systems/cruise.js:101` | `render/vfx.js:2057`, `systems/presentationOrchestrator.js:168` |
| `cruise:engaged` | `systems/cruise.js:66` | `render/vfx.js:2056`, `systems/presentationOrchestrator.js:167` |
| `cruise:snareRequest` | `systems/encounterScripts.js:446` | `systems/cruise.js:35` |
| `cruise:snared` | `systems/cruise.js:100` | `audio/audioSystem.js:1271` |
| `customs:breakScan` | `ui/customsPrompt.js:186` | — |
| `customs:submit` | `ui/customsPrompt.js:178` | — |
| `danger:miningNoise` | `systems/mining.js:1684` | — |
| `day:tick` | `core/coreSystem.js:199` | `systems/custodyConsequences.js:40`, `systems/encounterDirector.js:166`, `systems/factions.js:281`, `systems/sectorSim.js:93` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:186` | `systems/combat.js:466` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:177` | `systems/combat.js:465` |
| `discovery:plateUnlocked` | `systems/world.js:562`, `systems/world.js:3526`, `systems/world.js:3768`, `systems/world.js:4390` | `audio/audioSystem.js:1222`, `ui/screens/codex.js:662` |
| `distress:rescued` | `systems/encounterScripts.js:551` | `systems/factions.js:274` |
| `dock:attempt` | `ui/input.js:169` | `ui/dockDenyBanner.js:110` |
| `dock:denied` | `ui/dockDenyBanner.js:135` | — |
| `dock:docked` | `balance/careerCohorts.js:487`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:173` | `audio/audioSystem.js:1223`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `save/saveSystem.js:248`, `systems/aftermathWrecks.js:686`, `systems/autoTargetAssist.js:101`, `systems/combat.js:452`, `systems/economy.js:783`, `systems/economyContracts.js:162`, `systems/factionPresence.js:401`, `systems/mining.js:172`, `systems/missions.js:767`, `systems/onboarding.js:234`, `systems/onboarding.js:337`, `systems/pirateDisguise.js:36`, `systems/scanner.js:837`, `systems/story.js:136`, `systems/world.js:420`, `ui/alerts.js:322`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:131`, `ui/dockDenyBanner.js:111`, `ui/priceForecast.js:86`, `ui/securityReadout.js:158`, `ui/uiRoot.js:967`, `ui/wingmanRadial.js:185` |
| `dock:launder` | — | `systems/pirateDisguise.js:37` |
| `dock:range` | `core/physics.js:808`, `core/physics.js:812`, `ui/input.js:146` | `systems/onboarding.js:306`, `ui/alerts.js:318`, `ui/input.js:152` |
| `dock:undocked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:641`, `ui/station/stationApp.js:794` | `audio/audioSystem.js:1224`, `save/saveSystem.js:249`, `systems/combat.js:456`, `systems/economy.js:791`, `systems/missions.js:786`, `systems/presentationAdapters.js:171`, `systems/world.js:421`, `ui/input.js:160`, `ui/uiRoot.js:997` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1290` | `ui/uiRoot.js:1056` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1275`, `ui/sandbox/sandboxSetup.js:568` | `ui/uiRoot.js:1046` |
| `drill:approachRequested` | `ui/input.js:556` | `systems/tetherGameplay.js:202` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1167`, `ui/sandbox/sandboxSetup.js:567` | `ui/uiRoot.js:1035` |
| `drill:break` | `systems/drill.js:1194` | `audio/audioSystem.js:1356`, `systems/asteroidSites.js:161`, `systems/presentationOrchestrator.js:208`, `ui/asteroid/asteroidScreen.js:1611`, `ui/screens/drill.js:1723` |
| `drill:cargoFull` | `systems/drill.js:1243` | `audio/audioSystem.js:1358`, `systems/presentationOrchestrator.js:215`, `ui/asteroid/asteroidScreen.js:1601`, `ui/screens/drill.js:1693` |
| `drill:end` | `systems/drill.js:807` | `audio/audioSystem.js:1366`, `systems/asteroidSites.js:171`, `systems/presentationOrchestrator.js:216` |
| `drill:gasHit` | `systems/drill.js:1282` | `audio/audioSystem.js:1357`, `systems/presentationOrchestrator.js:210`, `ui/asteroid/asteroidScreen.js:1588`, `ui/screens/drill.js:1633` |
| `drill:retry` | `systems/drill.js:858` | `systems/presentationOrchestrator.js:217` |
| `drill:rockDepleted` | `systems/drill.js:773`, `systems/drill.js:1208`, `systems/drill.js:1234` | `audio/audioSystem.js:1359`, `ui/asteroid/asteroidScreen.js:1598`, `ui/screens/drill.js:1684` |
| `drill:scanPulse` | `systems/drill.js:931` | `audio/audioSystem.js:1360`, `systems/asteroidSites.js:188`, `systems/presentationOrchestrator.js:206`, `ui/asteroid/asteroidScreen.js:1605`, `ui/screens/drill.js:1711` |
| `drill:spark` | `systems/drill.js:1164` | `audio/audioSystem.js:1355`, `systems/presentationOrchestrator.js:207`, `ui/asteroid/asteroidScreen.js:1616`, `ui/screens/drill.js:1744` |
| `drill:start` | `systems/drill.js:765` | `audio/audioSystem.js:1365`, `systems/asteroidSites.js:154`, `systems/onboarding.js:342`, `systems/presentationOrchestrator.js:205` |
| `drill:warn` | `systems/drill.js:779`, `systems/drill.js:784`, `systems/drill.js:1061`, `systems/drill.js:1096`, `systems/drill.js:1116`, `systems/drill.js:1215`, `systems/drill.js:1246`, `systems/drill.js:1253` | `audio/audioSystem.js:1361`, `systems/presentationOrchestrator.js:204`, `ui/asteroid/asteroidRenderer3d.js:6854`, `ui/asteroid/asteroidScreen.js:1594`, `ui/screens/drill.js:1661` |
| `drill:yield` | `systems/drill.js:1232` | `audio/audioSystem.js:1352`, `systems/presentationOrchestrator.js:209`, `ui/asteroid/asteroidScreen.js:1580`, `ui/screens/drill.js:1612` |
| `economy:applyTradePressure` | `systems/automation.js:847`, `systems/automation.js:1539`, `systems/automation.js:1540`, `systems/claims.js:894`, `systems/encounterDirector.js:1365`, `systems/encounterDirector.js:1413`, `systems/sectorSim.js:375`, `systems/traffic.js:7326`, `systems/traffic.js:8949` | `systems/economy.js:770` |
| `economy:chargeCredits` | `systems/automation.js:1712`, `systems/automation.js:1719`, `systems/automation.js:2516`, `systems/automation.js:2740`, `systems/beacons.js:61`, `systems/claims.js:211`, `systems/claims.js:281`, `systems/claims.js:352`, `systems/claims.js:934`, `systems/combat.js:742`, `systems/encounterDirector.js:1359`, `systems/factions.js:345`, `systems/gateControlDirector.js:119`, `systems/mining.js:402`, `systems/missions.js:2255`, `systems/missions.js:2258`, `systems/pirateParley.js:508`, `systems/ships.js:1696`, `systems/ships.js:1763`, `systems/ships.js:1819`, `systems/world.js:2752`, `systems/world.js:2796`, `systems/world.js:3241` | `systems/economy.js:736` |
| `economy:eventEnded` | `systems/economy.js:2129` | `ui/floatingText.js:216` |
| `economy:eventStarted` | `systems/economy.js:2104` | `ui/floatingText.js:205` |
| `economy:grantCredits` | `systems/automation.js:1813`, `systems/automation.js:1824`, `systems/automation.js:2502`, `systems/claims.js:893`, `systems/claims.js:1498`, `systems/combat.js:618`, `systems/combat.js:630`, `systems/combat.js:827`, `systems/encounterDirector.js:1360`, `systems/mining.js:1347`, `systems/mining.js:1523`, `systems/missions.js:5017`, `systems/missions.js:5020`, `systems/missions.js:6294`, `systems/moralTrap.js:133`, `systems/ships.js:1849`, `systems/survivorPod.js:1011`, `systems/uniqueWrecks.js:1437` | `systems/economy.js:735`, `systems/story.js:164` |
| `economy:marketOpened` | `ui/station/screens/market.js:831` | `systems/economy.js:746`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1114` | `systems/economy.js:738` |
| `economy:salvageIntakeApplied` | `systems/economy.js:1723` | — |
| `economy:sinkCharged` | `systems/economy.js:1760` | — |
| `economy:tick` | `systems/economy.js:894` | `ui/priceHistory.js:116` |
| `economy:trade` | — | `careers/origins/haulerOriginSystem.js:87` |
| `economy:tradeCompleted` | `systems/economy.js:1523` | `audio/audioSystem.js:1206`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:256`, `systems/factions.js:244`, `systems/missions.js:795`, `systems/onboarding.js:235`, `systems/sectorSim.js:104`, `systems/story.js:160` |
| `economy:tradeFailed` | `systems/economy.js:1601`, `systems/economy.js:1620` | — |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1216` | `ui/encounterChoicePrompt.js:143` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:106` | `systems/encounterDirector.js:202` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1301` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:5786` | `systems/encounterDirector.js:188` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1477` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:912` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:897` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:813` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1314` | — |
| `encounter:resolved` | `systems/encounterDirector.js:1296`, `systems/encounterDirector.js:1345`, `systems/survivalArena.js:805` | `audio/audioSystem.js:1228`, `systems/aftermathWrecks.js:685`, `systems/claims.js:184`, `systems/story.js:124`, `systems/terrainAnchors.js:51`, `systems/traffic.js:1290`, `systems/uniqueLootAbilities.js:115`, `ui/encounterChoicePrompt.js:144` |
| `encounter:spawned` | `systems/encounterDirector.js:752` | `systems/uniqueLootAbilities.js:114` |
| `encounter:telegraph` | `systems/encounterDirector.js:737`, `systems/survivalArena.js:731` | `audio/audioSystem.js:1227`, `systems/survivalResults.js:353`, `systems/terrainAnchors.js:50`, `systems/world.js:430` |
| `encounter:voice` | `systems/encounterDirector.js:1200` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | — |
| `endgame:chosen` | `systems/story.js:864` | `ui/screens/missionLog.js:2052` |
| `endgame:confirmRequired` | `systems/story.js:753` | `ui/screens/missionLog.js:2051` |
| `endgame:eligibility` | `systems/story.js:605` | `ui/screens/missionLog.js:2050` |
| `endgame:ineligible` | `systems/story.js:656`, `systems/story.js:733`, `systems/story.js:798` | — |
| `endgame:loopBack` | — | `systems/story.js:155` |
| `endgame:promptChoiceC` | `systems/story.js:718` | — |
| `endgame:promptChoiceD` | `systems/story.js:682` | — |
| `endgame:promptSandbox` | `systems/story.js:616` | — |
| `endgame:sandboxContinued` | `systems/story.js:858` | `ui/screens/missionLog.js:2053` |
| `entity:destroyed` | `main.js:360`, `main.js:547`, `save/saveSystem.js:3071`, `systems/survivorPod.js:264`, `systems/traffic.js:5402` | `audio/audioSystem.js:1192`, `combat/kernel.js:66`, `render/vfx.js:2022`, `systems/aftermathWrecks.js:680`, `systems/ai.js:106`, `systems/encounterDirector.js:182`, `systems/gateControlDirector.js:68`, `systems/heistFacilities.js:208`, `systems/lawSecurity.js:178`, `systems/missions.js:810`, `systems/npcJobsRuntime.js:672`, `systems/presentationOrchestrator.js:165`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:92`, `systems/survivalWave.js:95`, `systems/swarmArena.js:419`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:133` |
| `entity:killed` | `balance/careerCohorts.js:456`, `combat/damage.js:396`, `combat/kernel.js:45`, `systems/combat.js:597` | `audio/audioSystem.js:1191`, `render/feel.js:922`, `render/vfx.js:2021`, `systems/aftermathWrecks.js:678`, `systems/ai.js:107`, `systems/barkDirector.js:196`, `systems/combatOutcome.js:118`, `systems/encounterDirector.js:183`, `systems/factions.js:206`, `systems/factions.js:234`, `systems/heat.js:203`, `systems/impulseCharges.js:221`, `systems/lawSecurity.js:177`, `systems/lootShards.js:493`, `systems/lossLedger.js:336`, `systems/mining.js:167`, `systems/missions.js:805`, `systems/npcJobsRuntime.js:664`, `systems/onboarding.js:270`, `systems/presentationOrchestrator.js:164`, `systems/sectorSim.js:108`, `systems/surrenderRecovery.js:70`, `systems/survivalResults.js:346`, `systems/survivorPod.js:402`, `systems/swarmChain.js:103`, `systems/swarmSupply.js:101`, `systems/titles.js:396`, `systems/traffic.js:1216`, `systems/wingMorale.js:178`, `systems/world.js:433`, `ui/floatingText.js:144`, `ui/floatingText.js:175`, `ui/uiRoot.js:517` |
| `entity:spawnRequest` | — | `core/coreSystem.js:137` |
| `entity:spawned` | `core/coreSystem.js:74` | `combat/kernel.js:61`, `render/vfx.js:2028`, `systems/factionPresence.js:407`, `systems/fields.js:306`, `systems/lawSecurity.js:176`, `systems/lossLedger.js:335`, `systems/npcJobsRuntime.js:649`, `systems/salvageActions.js:69`, `systems/survivalSwarm.js:216`, `systems/swarmSupply.js:106`, `systems/titles.js:397`, `systems/uniqueLootAbilities.js:117` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:547` | `systems/terrainAnchors.js:52` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:362` | `systems/terrainAnchors.js:56` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:441` | `systems/terrainAnchors.js:54` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:638` | `data/hazardLanguage.js:133` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:374` | `systems/terrainAnchors.js:58` |
| `escalation:arrived` | `systems/encounterDirector.js:279` | — |
| `escalation:seeded` | `systems/encounterDirector.js:266` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:321`, `systems/factions.js:387`, `systems/factions.js:667` | `systems/heat.js:216` |
| `faction:bribe` | `ui/screens/footprint.js:1120` | `systems/factions.js:199` |
| `faction:repChanged` | `systems/factions.js:318`, `systems/factions.js:382`, `systems/factions.js:663` | `ui/floatingText.js:193`, `ui/station/screens/factions.js:269` |
| `faction:repDelta` | `balance/careerCohorts.js:255`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:1172`, `systems/economy.js:2044`, `systems/encounterDirector.js:1361`, `systems/missions.js:5324`, `systems/missions.js:5374`, `systems/missions.js:6247`, `systems/missions.js:6249`, `systems/missions.js:6299`, `systems/moralTrap.js:128`, `systems/moralTrap.js:135`, `systems/survivorPod.js:801`, `systems/survivorPod.js:1017`, `systems/uniqueWrecks.js:1441`, `systems/world.js:3893`, `systems/world.js:4128` | `systems/factions.js:196` |
| `faction:repSpillover` | `systems/factions.js:380` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1095` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:859` | `systems/story.js:179` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1007` | `ui/uiRoot.js:276` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:708` | — |
| `factionPresence:service` | `systems/factionPresence.js:808` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:884` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:477`, `systems/factionPresence.js:562` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:529` | `systems/world.js:396` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:457`, `systems/traffic.js:1570`, `systems/traffic.js:8868` | — |
| `field:richSeamOpened` | `systems/traffic.js:8032` | — |
| `field:richSeamWorked` | `systems/mining.js:756`, `systems/traffic.js:7691` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:528` | `systems/npcJobsRuntime.js:680`, `systems/presentationOrchestrator.js:203` |
| `fields:anchorRegistered` | `systems/fields.js:581` | — |
| `fields:cleared` | `systems/fields.js:1055` | — |
| `fields:clusterDetonate` | `systems/fields.js:1547` | — |
| `fields:coneToggled` | `systems/fields.js:768`, `systems/fields.js:775`, `systems/fields.js:869`, `systems/fields.js:877` | — |
| `fields:deployDenied` | `systems/fields.js:648` | — |
| `fields:deployed` | `systems/fields.js:472`, `systems/fields.js:734`, `systems/fields.js:860` | `audio/audioSystem.js:1317`, `systems/fields.js:307`, `systems/onboarding.js:278` |
| `fields:ended` | `systems/fields.js:600`, `systems/fields.js:876`, `systems/fields.js:895`, `systems/fields.js:1025` | — |
| `fields:hitchCut` | `systems/fields.js:503` | — |
| `fields:hitchLatched` | `systems/fields.js:491` | — |
| `fields:specialistDisrupt` | `systems/fields.js:381` | — |
| `firsthour:beat` | `systems/onboarding.js:1794` | — |
| `firsthour:complete` | `systems/onboarding.js:1807` | — |
| `firsthour:sentence` | `systems/onboarding.js:1183` | — |
| `firsthour:started` | `systems/onboarding.js:1660` | — |
| `firsthour:verb` | `systems/onboarding.js:1755` | — |
| `flight:modeChanged` | `systems/flightV3.js:531` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:279` |
| `flybyFocus:end` | `systems/flybyFocus.js:317` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:404` | `systems/onboarding.js:253` |
| `formation:discovered` | `systems/asteroidFormations.js:235` | — |
| `freight:arrival` | `systems/traffic.js:5760` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1314`, `systems/encounterScripts.js:1533`, `systems/traffic.js:4283` | `systems/barkDirector.js:194`, `systems/economy.js:737`, `systems/encounterDirector.js:207`, `systems/lootShards.js:495`, `systems/traffic.js:1234` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1176` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:396` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1233` | — |
| `freight:loss` | `systems/encounterDirector.js:1423`, `systems/traffic.js:7328`, `systems/traffic.js:8961` | `systems/encounterDirector.js:208` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1177` | `systems/surrenderRecovery.js:71` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1669` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:186`, `systems/traffic.js:1231` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:187`, `systems/traffic.js:1232` |
| `frontierRumor:acquired` | `systems/world.js:2815` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:4360` | — |
| `frontierRumor:contacted` | `systems/world.js:4256` | — |
| `frontierRumor:resolved` | `systems/world.js:2832` | — |
| `fuel:changed` | `systems/economy.js:1824`, `systems/world.js:3641`, `systems/world.js:3649` | — |
| `fuel:empty` | `systems/world.js:3642` | `audio/audioSystem.js:1245`, `ui/alerts.js:363` |
| `game:exitToMenu` | `ui/screens/crucible.js:1919`, `ui/screens/pause.js:783` | `main.js:231`, `systems/runSession.js:57` |
| `game:load` | `ui/input.js:286`, `ui/input.js:441`, `ui/screens/mainMenu.js:406`, `ui/screens/saveLoad.js:968` | `save/saveSystem.js:181`, `systems/scanner.js:836`, `ui/commandBar.js:430`, `ui/encounterChoicePrompt.js:147`, `ui/lawfulInspectionPrompt.js:177`, `ui/pirateParleyPrompt.js:250`, `ui/signalInvestigationPrompt.js:262` |
| `game:loadingProgress` | `main.js:139`, `main.js:157`, `main.js:492`, `main.js:572`, `main.js:588`, `main.js:606`, `main.js:624`, `main.js:651` | `ui/loadingPresenter.js:266`, `ui/screens/newGame.js:677`, `ui/screens/saveLoad.js:732` |
| `game:new` | `ui/sandbox/sandboxSetup.js:334`, `ui/screens/gameOver.js:279`, `ui/screens/newGame.js:752` | `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:146`, `main.js:210`, `render/feel.js:883`, `render/vfx.js:2036`, `save/saveSystem.js:244`, `systems/aftermathWrecks.js:692`, `systems/bombs.js:135`, `systems/encounterDirector.js:180`, `systems/environmentalMachinery.js:104`, `systems/fields.js:300`, `systems/impulseCharges.js:222`, `systems/massSeed.js:120`, `systems/masslineSnares.js:129`, `systems/mines.js:37`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:229`, `systems/scanner.js:835`, `systems/surrenderRecovery.js:77`, `systems/survivorPod.js:400`, `systems/tetherGameplay.js:197`, `ui/commandBar.js:429`, `ui/encounterChoicePrompt.js:146`, `ui/hudLayout.js:121`, `ui/lawfulInspectionPrompt.js:176`, `ui/pirateParleyPrompt.js:249`, `ui/priceHistory.js:146`, `ui/signalInvestigationPrompt.js:261` |
| `game:newGame` | — | `core/coreSystem.js:147`, `render/vfx.js:2037`, `save/saveSystem.js:245`, `systems/aftermathWrecks.js:693`, `systems/collisionConsequences.js:55`, `systems/fieldDepletion.js:445`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:337`, `systems/survivorPod.js:399`, `systems/titles.js:399`, `systems/wingMorale.js:180` |
| `game:over` | `systems/combat.js:570`, `systems/combat.js:663` | `ui/uiRoot.js:1079` |
| `game:save` | `ui/input.js:285`, `ui/input.js:439`, `ui/screens/saveLoad.js:988` | `save/saveSystem.js:170` |
| `game:scenePrepared` | `main.js:437` | `ui/sandbox/sandboxSetup.js:358` |
| `game:startFailed` | `main.js:741` | `ui/loadingPresenter.js:277`, `ui/sandbox/sandboxSetup.js:363`, `ui/screens/newGame.js:676`, `ui/screens/saveLoad.js:738` |
| `game:started` | `main.js:501` | `audio/audioSystem.js:1394`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:148`, `save/saveSystem.js:241`, `systems/automation.js:559`, `systems/collisionConsequences.js:54`, `systems/combat.js:463`, `systems/economyContracts.js:164`, `systems/factions.js:193`, `systems/flight.js:78`, `systems/flightV3.js:151`, `systems/heat.js:223`, `systems/masslineSnares.js:130`, `systems/missions.js:748`, `systems/onboarding.js:221`, `systems/presentationAdapters.js:169`, `systems/presentationOrchestrator.js:230`, `systems/sectorSim.js:99`, `systems/ships.js:1411`, `systems/story.js:122`, `systems/surrenderRecovery.js:78`, `systems/tetherGameplay.js:198`, `ui/alerts.js:343`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:355`, `ui/uiRoot.js:1064`, `ui/uiRoot.js:1122`, `ui/uiRoot.js:1124` |
| `gamepad:connected` | `systems/gamepad.js:413` | — |
| `gamepad:disconnected` | `systems/gamepad.js:398` | — |
| `gate:range` | `core/physics.js:818`, `core/physics.js:822` | `systems/onboarding.js:313`, `systems/presentationOrchestrator.js:169`, `ui/alerts.js:324` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:562`, `systems/story.js:455`, `systems/story.js:469`, `systems/story.js:1156`, `systems/story.js:1440`, `systems/story.js:1605`, `systems/uniqueWrecks.js:1447` | `systems/ships.js:1406`, `ui/screens/codex.js:661` |
| `hazard:changed` | `systems/world.js:555` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:581`, `systems/world.js:3554` | `data/hazardLanguage.js:129` |
| `hazard:exit` | `systems/environmentalMachinery.js:590`, `systems/world.js:3561` | `data/hazardLanguage.js:130` |
| `heat:changed` | `systems/heat.js:524` | `audio/audioSystem.js:1248`, `render/vfx.js:2033`, `systems/lawSecurity.js:189`, `ui/hud.js:3239` |
| `heat:clear` | — | `systems/heat.js:227` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:588` | `systems/missions.js:841` |
| `heist:captureFork` | `systems/heistFacilities.js:827` | `systems/missions.js:850` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:714` | `systems/missions.js:846` |
| `heist:launchCue` | `systems/heistFacilities.js:299` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:344`, `systems/heistFacilities.js:353`, `systems/heistFacilities.js:357`, `systems/heistFacilities.js:371` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:1205` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:1147` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:1128` | — |
| `heist:receiverPrepared` | `systems/heistFacilities.js:1067` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:210` |
| `hud:firstUse` | `systems/onboarding.js:432` | `ui/hud.js:1551` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:260` |
| `hud:phase` | `systems/story.js:221`, `systems/story.js:251`, `systems/story.js:254`, `systems/story.js:539` | `ui/hudMeta.js:152` |
| `hud:slotClaim` | — | `ui/hud.js:1458` |
| `hud:slotRelease` | — | `ui/hud.js:1459` |
| `hud:tagFlicker` | `systems/story.js:516` | `ui/hudMeta.js:186` |
| `hull:fractured` | `systems/hullFracture.js:175` | — |
| `interdiction:triggered` | `systems/encounterScripts.js:447`, `systems/world.js:3126` | `systems/presentationOrchestrator.js:177`, `systems/sectorSim.js:105` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:3067` | `render/feel.js:1008`, `save/saveSystem.js:251`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:175`, `systems/sectorSim.js:114` |
| `jump:chargeAbort` | `systems/world.js:3204`, `systems/world.js:3268`, `systems/world.js:3325` | `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:174`, `systems/routeFollower.js:324` |
| `jump:chargeStart` | `systems/world.js:3253`, `systems/world.js:3292` | `render/feel.js:998`, `systems/gateControlDirector.js:64`, `systems/presentationOrchestrator.js:171`, `systems/story.js:142` |
| `jump:chargeTick` | `systems/world.js:3018` | `systems/presentationOrchestrator.js:172` |
| `jump:departurePreflight` | `systems/world.js:3237` | `systems/story.js:141` |
| `jump:start` | `systems/world.js:3029` | `render/feel.js:1002`, `systems/economy.js:802`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:173`, `systems/sectorSim.js:113` |
| `jump:unfiledConfirmed` | `systems/world.js:3309` | `systems/story.js:143` |
| `landmark:artifactRecovered` | `systems/missions.js:3447` | `systems/world.js:422` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:39` |
| `law:distressRaised` | — | `ui/signalInvestigationPrompt.js:260` |
| `law:impoundPay` | — | `systems/lawSecurity.js:190` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:41` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:43`, `systems/heat.js:237` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:42` |
| `law:incidentOpened` | — | `systems/traffic.js:1239` |
| `law:reportIncidentReceipt` | — | `systems/heat.js:244` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:233` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:206` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:140` | `systems/lawSecurity.js:184` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:172` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:174` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:173` |
| `loot:drop` | `systems/combat.js:634`, `systems/lootShards.js:757` | `systems/mining.js:169`, `ui/floatingText.js:170` |
| `loot:manifestPayload` | `systems/lootShards.js:835` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:299` | `systems/factionPresence.js:402`, `systems/ships.js:1360` |
| `map:sectorCharted` | `systems/world.js:2756` | `systems/economy.js:751` |
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
| `massline:bridleCut` | `systems/tetherGameplay.js:796` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:741`, `systems/tetherGameplay.js:757`, `systems/tetherGameplay.js:926` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:605` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:659` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:806` | — |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:2025` | — |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1513` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:1634` | — |
| `massline:releaseValidated` | `systems/masslineThrow.js:516` | `systems/presentationOrchestrator.js:152` |
| `massline:selfSling` | `systems/masslineThrow.js:589` | `systems/flightV3.js:153`, `systems/onboarding.js:394` |
| `massline:snareArmed` | `systems/masslineSnares.js:223` | — |
| `massline:snareCaught` | `systems/masslineSnares.js:418` | — |
| `massline:snareCut` | `systems/masslineSnares.js:532` | — |
| `massline:snareDeployed` | `systems/masslineSnares.js:325` | — |
| `massline:snareEnded` | `systems/masslineSnares.js:534` | — |
| `massline:sweepImpact` | `systems/masslineImpacts.js:330` | `systems/masslineImpactDamage.js:42`, `systems/presentationOrchestrator.js:139` |
| `massline:threat` | `systems/masslineThreats.js:216` | `systems/presentationOrchestrator.js:115` |
| `massline:throw` | `systems/masslineThrow.js:463` | `systems/missions.js:829`, `systems/tumbleStates.js:64` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:101` | `render/feel.js:1091` |
| `massline:tumbled` | `systems/tumbleStates.js:281` | `render/feel.js:1077` |
| `mines:armed` | `systems/mines.js:135` | — |
| `mines:capReached` | `systems/mines.js:53` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:95`, `systems/survivalArena.js:702` | `systems/mines.js:34` |
| `mines:placed` | `systems/mines.js:108` | `systems/survivalArena.js:558` |
| `mines:released` | `systems/mines.js:228` | — |
| `mines:triggered` | `systems/mines.js:193` | — |
| `mining:beamCooled` | `systems/mining.js:528` | — |
| `mining:beamLocked` | `systems/mining.js:665` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:1524` | `systems/missions.js:803`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:679` | `systems/presentationOrchestrator.js:199`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:534` | — |
| `mining:npcExtraction` | `systems/traffic.js:7679` | `systems/fieldDepletion.js:444` |
| `mining:overheated` | `systems/mining.js:520` | `systems/presentationOrchestrator.js:192` |
| `mining:richCoreChargeStart` | `systems/mining.js:1477` | `systems/presentationOrchestrator.js:196` |
| `mining:richCoreCompleted` | `systems/mining.js:1504` | `systems/presentationOrchestrator.js:197` |
| `mining:richCoreExposed` | `systems/mining.js:1455` | `systems/presentationOrchestrator.js:195` |
| `mining:richCoreFizzle` | `systems/mining.js:1506` | `systems/presentationOrchestrator.js:198` |
| `mining:seamHit` | `systems/mining.js:1752` | `systems/presentationOrchestrator.js:186` |
| `mining:start` | `systems/mining.js:243`, `systems/mining.js:365` | `audio/audioSystem.js:1195`, `render/vfx.js:2046`, `systems/onboarding.js:238`, `systems/presentationOrchestrator.js:183` |
| `mining:stop` | `systems/mining.js:465` | `audio/audioSystem.js:1196`, `render/vfx.js:2047`, `systems/presentationOrchestrator.js:184` |
| `mining:tick` | `systems/automation.js:995`, `systems/mining.js:700` | `audio/audioSystem.js:1197`, `render/vfx.js:2048`, `systems/presentationOrchestrator.js:185` |
| `mining:ventBonus` | `systems/mining.js:571` | — |
| `mining:ventReady` | `systems/mining.js:500` | `systems/presentationOrchestrator.js:191` |
| `mining:yield` | `balance/careerCohorts.js:1805`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:568`, `systems/mining.js:817`, `systems/mining.js:1208`, `systems/mining.js:1501` | `careers/origins/prospectorOrigin.js:636`, `render/feel.js:1021`, `render/vfx.js:2049`, `systems/encounterDirector.js:204`, `systems/missions.js:797`, `systems/onboarding.js:239`, `systems/presentationOrchestrator.js:193`, `ui/floatingText.js:155` |
| `miningDrone:sellOre` | — | `systems/economy.js:766` |
| `mission:abandoned` | — | `careers/origins/haulerOriginSystem.js:72`, `ui/hud.js:3223` |
| `mission:accepted` | `systems/missions.js:2277` | `audio/audioSystem.js:1216`, `save/saveSystem.js:252`, `systems/aftermathWrecks.js:688`, `systems/contractClauses.js:196`, `systems/onboarding.js:241`, `ui/hud.js:3221`, `ui/screens/missionLog.js:2035` |
| `mission:completed` | `systems/missions.js:5094` | `audio/audioSystem.js:1217`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:253`, `systems/aftermathWrecks.js:689`, `systems/contractClauses.js:200`, `systems/factions.js:253`, `systems/onboarding.js:242`, `systems/story.js:159`, `ui/hud.js:3222`, `ui/screens/missionLog.js:2036` |
| `mission:conditionBroken` | `systems/contractClauses.js:306`, `systems/missions.js:1051` | — |
| `mission:conditionPending` | `systems/missions.js:1104` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:274`, `systems/missions.js:1034` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:285`, `systems/missions.js:1042` | `systems/missions.js:871` |
| `mission:expired` | `systems/missions.js:5387` | `audio/audioSystem.js:1221`, `save/saveSystem.js:255`, `systems/aftermathWrecks.js:691`, `systems/factions.js:262`, `ui/screens/missionLog.js:2038` |
| `mission:failed` | `systems/missions.js:5344` | `audio/audioSystem.js:1220`, `careers/origins/haulerOriginSystem.js:71`, `save/saveSystem.js:254`, `systems/aftermathWrecks.js:690`, `systems/factions.js:261`, `ui/screens/missionLog.js:2037` |
| `mission:forceEvent` | — | `systems/economy.js:807` |
| `mission:offerBoarded` | `systems/missions.js:1680` | `systems/aftermathWrecks.js:687` |
| `mission:offered` | `systems/aftermathWrecks.js:894`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:229`, `systems/economyContracts.js:251`, `systems/lossLedger.js:275`, `systems/postEndingReplay.js:340`, `systems/salvage.js:560`, `systems/uniqueWrecks.js:785` | `systems/lossInvestigation.js:106`, `systems/missions.js:763`, `systems/survivorPod.js:397` |
| `mission:setPieceTransition` | `systems/missions.js:4943` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:5997` | — |
| `mission:spawnDeferred` | `systems/missions.js:5853` | — |
| `mission:updated` | `systems/contractClauses.js:279`, `systems/contractClauses.js:289`, `systems/contractClauses.js:318`, `systems/missions.js:1038`, `systems/missions.js:1046`, `systems/missions.js:1064`, `systems/missions.js:1138`, `systems/missions.js:1214`, `systems/missions.js:1315`, `systems/missions.js:1385`, `systems/missions.js:1571`, `systems/missions.js:1605`, `systems/missions.js:1617`, `systems/missions.js:1679`, `systems/missions.js:2204`, `systems/missions.js:2289`, `systems/missions.js:2438`, `systems/missions.js:2628`, `systems/missions.js:3205`, `systems/missions.js:3241`, `systems/missions.js:3254`, `systems/missions.js:3262`, `systems/missions.js:3278`, `systems/missions.js:3325`, `systems/missions.js:3375`, `systems/missions.js:3384`, `systems/missions.js:3480`, `systems/missions.js:3506`, `systems/missions.js:3574`, `systems/missions.js:3590`, `systems/missions.js:3632`, `systems/missions.js:3653`, `systems/missions.js:3689`, `systems/missions.js:3741`, `systems/missions.js:4529`, `systems/missions.js:4684`, `systems/missions.js:4730`, `systems/missions.js:4775`, `systems/missions.js:4782`, `systems/missions.js:5083`, `systems/missions.js:5364`, `systems/missions.js:5397`, `systems/missions.js:5684`, `systems/missions.js:5844`, `systems/missions.js:5940`, `systems/missions.js:6079`, `systems/missions.js:6328`, `systems/missions.js:6474` | `ui/hud.js:3220`, `ui/screens/missionLog.js:2034`, `ui/station/screens/contracts.js:643` |
| `mode:changed` | `main.js:234`, `main.js:718`, `main.js:728`, `main.js:739`, `save/saveSystem.js:2729`, `save/saveSystem.js:2818` | `systems/autoTargetAssist.js:96`, `systems/presentationAdapters.js:168`, `systems/scanner.js:838`, `ui/loadingPresenter.js:267`, `ui/screenManager.js:575`, `ui/uiRoot.js:652`, `ui/wingmanRadial.js:184` |
| `module:equipped` | `systems/ships.js:1972` | `systems/ships.js:1315`, `systems/world.js:393` |
| `module:granted` | `systems/ships.js:1777` | — |
| `module:purchased` | `systems/ships.js:1764` | — |
| `module:unequipped` | `systems/ships.js:1466`, `systems/ships.js:1991` | `systems/ships.js:1316`, `systems/world.js:394` |
| `moment:amended` | `systems/bulletTime.js:237` | — |
| `moment:holyShit` | — | `render/feel.js:1066` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:196` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | — |
| `moralTrap:choose` | — | `systems/moralTrap.js:73` |
| `moralTrap:resolved` | `systems/moralTrap.js:118` | — |
| `moralTrap:revealed` | `systems/moralTrap.js:91` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:2373` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:210` |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:870`, `systems/world.js:3370` | `systems/routeFollower.js:319` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:3049`, `systems/claims.js:1211`, `systems/claims.js:1219`, `systems/missions.js:777`, `systems/missions.js:2617`, `systems/missions.js:2684`, `systems/missions.js:2716`, `systems/missions.js:3223`, `systems/world.js:3369`, `ui/market/tradeLogic.js:477` | — |
| `news:dockCards` | `ui/marketNews.js:360` | — |
| `news:headline` | `systems/aftermathWrecks.js:565`, `systems/e1EncounterRuntime.js:225`, `systems/traffic.js:7329`, `systems/traffic.js:8963`, `ui/marketNews.js:252` | — |
| `news:publish` | `systems/traffic.js:3086`, `systems/traffic.js:8576`, `systems/uniqueWrecks.js:372`, `systems/uniqueWrecks.js:1491`, `systems/world.js:564` | — |
| `news:render` | `ui/hud.js:1151` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1225` |
| `npcjobs:load` | — | `systems/traffic.js:1223` |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:2444` | — |
| `npcjobs:unload` | — | `systems/traffic.js:1224` |
| `npcjobs:work` | — | `systems/traffic.js:1222` |
| `onboarding:rangePrompt` | `systems/onboarding.js:1362`, `systems/onboarding.js:1653` | — |
| `orrinWitness:ensureEvidence` | `systems/story.js:990` | `systems/world.js:400` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1309` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1015` | — |
| `orrinWitness:submitted` | `systems/story.js:1043` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:4222` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:543` | `systems/world.js:402` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:4017` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:4052` | — |
| `pallasHiddenCache:pickupReady` | `systems/world.js:4182` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:4135` | — |
| `patrol:proximity` | `systems/encounterScripts.js:370` | `systems/economy.js:803` |
| `physics:attachmentBroken` | — | `combat/kernel.js:70` |
| `physics:impact` | `core/physics.js:1316` | `render/feel.js:1060`, `render/vfx.js:2012`, `systems/asteroidSites.js:223`, `systems/collisionConsequences.js:49`, `systems/fields.js:313`, `systems/fragileCargo.js:202`, `systems/gamepad.js:312`, `systems/heistFacilities.js:209`, `systems/impulseCharges.js:219`, `systems/lootShards.js:494`, `systems/masslineImpactDamage.js:43`, `systems/ships.js:1383` |
| `pickup:collected` | `core/physics.js:1161`, `systems/mining.js:1007`, `systems/mining.js:1606`, `systems/uniqueWrecks.js:1372` | `audio/audioSystem.js:1204`, `render/vfx.js:2068`, `save/saveSystem.js:220`, `systems/encounterDirector.js:185`, `systems/lawSecurity.js:187`, `systems/mining.js:171`, `systems/onboarding.js:240`, `systems/presentationOrchestrator.js:200`, `systems/swarmSupply.js:107`, `systems/traffic.js:1233`, `systems/world.js:403`, `systems/world.js:404`, `ui/floatingText.js:185` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:188` | `systems/pirateParley.js:42` |
| `pirateParley:demand` | `systems/scanner.js:1214` | `ui/pirateParleyPrompt.js:247`, `ui/signalInvestigationPrompt.js:259` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:248` |
| `planet:collector` | `systems/planetRuntime.js:462` | — |
| `planet:harvest` | `systems/planetRuntime.js:495` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:499` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:369`, `systems/planetRuntime.js:381` | — |
| `planet:recoveryBurn` | `systems/planetRuntime.js:447` | — |
| `planet:registered` | `systems/planetRuntime.js:188` | — |
| `planet:unregistered` | `systems/planetRuntime.js:218` | — |
| `player:death` | `systems/combat.js:568`, `systems/combat.js:661`, `systems/combat.js:822`, `systems/world.js:3633` | `audio/audioSystem.js:1193`, `render/feel.js:951`, `render/vfx.js:2045`, `save/saveSystem.js:227`, `systems/aftermathWrecks.js:679`, `systems/lawSecurity.js:186`, `systems/onboarding.js:271`, `systems/surrenderRecovery.js:73`, `systems/survivalResults.js:354`, `systems/survivalRun.js:107`, `systems/survivorPod.js:403`, `ui/commandBar.js:405`, `ui/hud.js:1810`, `ui/survivalHud.js:182` |
| `player:recoveryFailed` | `systems/combat.js:700` | `ui/screens/gameOver.js:311` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:254` | `systems/combat.js:457` |
| `player:respawn` | `systems/combat.js:759`, `systems/combat.js:835` | `audio/audioSystem.js:1194`, `save/saveSystem.js:228`, `save/saveSystem.js:267`, `ui/commandBar.js:409`, `ui/hud.js:1824`, `ui/screens/gameOver.js:303` |
| `player:scannedByPatrol` | `systems/economy.js:1993` | `render/vfx.js:2032`, `systems/missions.js:865`, `ui/customsPrompt.js:129` |
| `poi:discovered` | `systems/world.js:593`, `systems/world.js:3474`, `systems/world.js:3511`, `systems/world.js:3739`, `systems/world.js:3765` | `systems/encounterDirector.js:198`, `systems/world.js:428` |
| `poi:identified` | `systems/world.js:3518`, `systems/world.js:3766` | `systems/encounterDirector.js:199`, `systems/missions.js:764`, `systems/world.js:429` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2057` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2056` |
| `presentation:audioCue` | `systems/presentationAdapters.js:512` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:434` | — |
| `presentation:caption` | `audio/audioSystem.js:3155`, `systems/factionPresence.js:634`, `systems/factionPresence.js:964`, `systems/factionPresence.js:979`, `systems/factionPresence.js:997`, `systems/factionPresence.js:1059`, `systems/presentationAdapters.js:604`, `systems/story.js:934`, `systems/story.js:1098` | `ui/hud.js:1873` |
| `presentation:cue` | — | `audio/audioSystem.js:1279`, `render/vfx.js:2065`, `render/vfx.js:2066`, `systems/presentationAdapters.js:165` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:416` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:337`, `systems/presentationAdapters.js:583` | — |
| `presentation:vfxCue` | `render/vfx.js:2077`, `systems/fields.js:1685`, `systems/fields.js:1704`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:465`, `systems/missions.js:2302`, `systems/missions.js:5099`, `systems/planetRuntime.js:519`, `systems/presentationAdapters.js:480`, `systems/tumbleStates.js:283`, `systems/tumbleStates.js:312`, `systems/weapons.js:1257`, `systems/weapons.js:2103` | `render/vfx.js:2067` |
| `projectile:bank` | — | `render/vfx.js:2007` |
| `projectile:hit` | `core/physics.js:678`, `core/physics.js:716`, `systems/sectorSim.js:548` | `audio/audioSystem.js:1168`, `combat/tetherWebs.js:26`, `render/vfx.js:2006`, `systems/combat.js:450`, `systems/missions.js:830` |
| `projectile:nearMiss` | `core/physics.js:694` | `systems/presentationOrchestrator.js:163` |
| `projectile:ricochet` | — | `render/vfx.js:2008` |
| `range:opened` | `ui/screens/range.js:1378` | `systems/onboarding.js:276` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:548` | — |
| `recovery:started` | — | `ui/signalInvestigationPrompt.js:258` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:547` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:157` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:158` |
| `rescue:beat` | `systems/onboarding.js:1513`, `systems/onboarding.js:1545` | — |
| `rescue:complete` | `systems/onboarding.js:1524` | — |
| `rescue:started` | `systems/onboarding.js:1159` | `systems/onboarding.js:272` |
| `research:pointsChanged` | `systems/missions.js:3408`, `systems/missions.js:5054` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:1612` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1125` | `systems/encounterDirector.js:205` |
| `rhythm:phase` | `systems/encounterDirector.js:250` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:274` | — |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:98` |
| `run:awardRequested` | — | `systems/runSession.js:53` |
| `run:awarded` | — | `ui/survivalHud.js:167` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1071`, `ui/sandbox/sandboxSetup.js:1110` | `systems/runSession.js:50` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:209`, `ui/screens/crucibleDraft.js:393` | `systems/survivalDraft.js:95` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:293` | `systems/survivalDraft.js:99` |
| `run:draftResolved` | — | `systems/survivalRun.js:101` |
| `run:endRequested` | `save/saveSystem.js:191` | `systems/runSession.js:52` |
| `run:ended` | — | `systems/survivalAnnounce.js:276`, `systems/survivalArena.js:555`, `systems/survivalDraft.js:104`, `systems/survivalResults.js:383`, `systems/survivalRun.js:95`, `systems/survivalWave.js:94`, `systems/swarmArena.js:420`, `systems/swarmChain.js:104`, `systems/swarmSupply.js:109` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:104` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:274`, `ui/survivalHud.js:168` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1131` | `systems/ships.js:1415`, `systems/survivalRun.js:96`, `systems/swarmSupply.js:102`, `systems/world.js:424` |
| `run:modifierChosen` | — | `systems/survivalRun.js:102` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:55` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1132` | `systems/survivalRun.js:97` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:446` | `systems/survivalDraft.js:96` |
| `run:refitClosed` | — | `systems/survivalRun.js:103` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:549` | `systems/survivalDraft.js:97` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:545` | `systems/survivalDraft.js:98` |
| `run:resultsReady` | — | `systems/achievements.js:785`, `ui/uiRoot.js:1100` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:103` |
| `run:spendRequested` | — | `systems/runSession.js:54` |
| `run:spent` | — | `systems/survivalDraft.js:102` |
| `run:started` | — | `systems/survivalAnnounce.js:269`, `systems/survivalResults.js:345`, `systems/survivalRun.js:93`, `ui/survivalHud.js:169`, `ui/uiRoot.js:1121` |
| `run:threatRequested` | — | `systems/runSession.js:56` |
| `run:transitionRequested` | `systems/survivalRun.js:465` | `systems/runSession.js:51` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:275`, `systems/survivalDraft.js:94`, `systems/survivalResults.js:382`, `systems/survivalRun.js:94`, `systems/survivalWave.js:93`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:273`, `systems/survivalArena.js:554`, `systems/survivalResults.js:348` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:99` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:272` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:355` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:270`, `systems/survivalArena.js:553`, `systems/survivalWave.js:91`, `systems/swarmArena.js:417`, `ui/survivalHud.js:175` |
| `run:waveProgress` | — | `ui/survivalHud.js:176` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:271`, `systems/survivalResults.js:347`, `systems/survivalWave.js:92`, `systems/swarmArena.js:418` |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:561` | `systems/encounterDirector.js:200`, `systems/story.js:182` |
| `salvage:completed` | `systems/mining.js:1213` | `systems/aftermathWrecks.js:684`, `systems/missions.js:801` |
| `salvage:cutComplete` | `systems/mining.js:393` | — |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | — |
| `salvage:npcExtraction` | `systems/traffic.js:5067` | — |
| `salvage:npcUnload` | `systems/traffic.js:8698` | `systems/economy.js:777` |
| `salvage:placed` | `systems/salvage.js:330` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:395` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:954` | — |
| `save:completed` | `save/saveSystem.js:960` | `ui/uiRoot.js:336` |
| `save:dirty` | — | `save/saveSystem.js:204` |
| `save:error` | `main.js:148`, `save/saveSystem.js:684`, `save/saveSystem.js:746`, `save/saveSystem.js:764`, `save/saveSystem.js:964`, `save/saveSystem.js:1223`, `save/saveSystem.js:1685`, `save/saveSystem.js:2402`, `save/saveSystem.js:2407`, `save/saveSystem.js:2438`, `save/saveSystem.js:2446`, `save/saveSystem.js:2462`, `save/saveSystem.js:2529`, `save/saveSystem.js:2559`, `save/saveSystem.js:2594`, `save/saveSystem.js:2633`, `save/saveSystem.js:2835`, `save/saveSystem.js:2843`, `save/saveSystem.js:2870`, `save/saveSystem.js:3236`, `save/saveSystem.js:3249`, `save/saveSystem.js:3264`, `save/saveSystem.js:3277`, `ui/screens/saveLoad.js:1041` | `systems/aftermathWrecks.js:696`, `systems/asteroidSites.js:222`, `systems/automation.js:554`, `systems/encounterDirector.js:177`, `ui/loadingPresenter.js:278`, `ui/screenManager.js:576`, `ui/uiRoot.js:358` |
| `save:exportRecovery` | `save/saveSystem.js:3225` | — |
| `save:loaded` | `save/saveSystem.js:2821` | `audio/audioSystem.js:1388`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:142`, `core/physics.js:85`, `main.js:204`, `render/feel.js:885`, `render/vfx.js:2039`, `save/saveSystem.js:240`, `systems/aftermathWrecks.js:695`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:213`, `systems/automation.js:549`, `systems/barkDirector.js:186`, `systems/beacons.js:37`, `systems/bombs.js:136`, `systems/collisionConsequences.js:53`, `systems/combat.js:464`, `systems/economy.js:811`, `systems/encounterDirector.js:176`, `systems/environmentalMachinery.js:106`, `systems/factionPresence.js:408`, `systems/fields.js:301`, `systems/flight.js:74`, `systems/flightV3.js:144`, `systems/gateControlDirector.js:70`, `systems/heat.js:224`, `systems/heistFacilities.js:213`, `systems/impulseCharges.js:223`, `systems/lawSecurity.js:183`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:131`, `systems/mines.js:38`, `systems/missions.js:750`, `systems/npcJobsRuntime.js:637`, `systems/npcJobsRuntime.js:645`, `systems/onboarding.js:225`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:172`, `systems/presentationOrchestrator.js:231`, `systems/routeFollower.js:336`, `systems/runSession.js:61`, `systems/sectorSim.js:98`, `systems/ships.js:1320`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:94`, `systems/story.js:123`, `systems/survivalArena.js:564`, `systems/survivorPod.js:401`, `systems/tetherGameplay.js:196`, `systems/titles.js:398`, `systems/traffic.js:1247`, `systems/travelLanes.js:483`, `systems/uniqueLootAbilities.js:118`, `systems/world.js:409`, `ui/alerts.js:344`, `ui/automationPayoff.js:76`, `ui/bandHud.js:89`, `ui/hudLayout.js:120`, `ui/priceHistory.js:147`, `ui/uiRoot.js:343`, `ui/uiRoot.js:1125` |
| `save:recovered` | `save/saveSystem.js:2427` | `ui/uiRoot.js:351` |
| `save:restoring` | `save/saveSystem.js:2655` | `core/coreSystem.js:139`, `render/feel.js:884`, `render/vfx.js:2038`, `systems/aftermathWrecks.js:694`, `systems/asteroidSites.js:205`, `systems/automation.js:543`, `systems/encounterDirector.js:169`, `systems/environmentalMachinery.js:105`, `systems/lawSecurity.js:182`, `systems/missions.js:754`, `systems/npcJobsRuntime.js:638`, `systems/runSession.js:60`, `systems/salvage.js:76`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:74`, `systems/traffic.js:1240`, `systems/world.js:405` |
| `save:started` | `save/saveSystem.js:749`, `save/saveSystem.js:1277` | `ui/screenManager.js:583`, `ui/uiRoot.js:332` |
| `scan:completed` | `balance/careerCohorts.js:477`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:958`, `systems/world.js:3478` | `careers/origins/prospectorOrigin.js:633`, `systems/missions.js:812`, `systems/onboarding.js:252`, `systems/presentationOrchestrator.js:179`, `systems/salvage.js:73`, `systems/salvageActions.js:70`, `systems/story.js:173`, `ui/hud.js:3582` |
| `scan:pulse` | `systems/scanner.js:896` | `systems/buildIdentity.js:268`, `systems/encounterDirector.js:191`, `systems/pirateDisguise.js:35`, `systems/presentationOrchestrator.js:178`, `systems/scanReveal.js:14`, `ui/hud.js:3583` |
| `scan:shipRevealed` | `systems/scanReveal.js:37` | `systems/buildIdentity.js:267` |
| `scan:weakPoint` | `systems/scanner.js:947` | `ui/hud.js:1184` |
| `scanner:ghostEscaped` | `systems/scanner.js:876` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:926` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:89` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:228` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:505`, `ui/comms.js:509` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:692` | `systems/presentationOrchestrator.js:176` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:705` | `audio/audioSystem.js:1253`, `render/vfx.js:2034`, `save/saveSystem.js:250`, `systems/aftermathWrecks.js:682`, `systems/asteroidFormations.js:120`, `systems/asteroidSites.js:198`, `systems/automation.js:579`, `systems/bombs.js:134`, `systems/claims.js:183`, `systems/economy.js:795`, `systems/encounterDirector.js:165`, `systems/factionPresence.js:399`, `systems/fields.js:299`, `systems/heistFacilities.js:206`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:128`, `systems/mines.js:36`, `systems/mining.js:174`, `systems/missions.js:882`, `systems/moralTrap.js:72`, `systems/npcJobsRuntime.js:626`, `systems/presentationOrchestrator.js:218`, `systems/routeFollower.js:328`, `systems/salvage.js:69`, `systems/sectorSim.js:95`, `systems/story.js:140`, `systems/story.js:172`, `systems/survivalArena.js:562`, `systems/survivorPod.js:396`, `systems/tetherGameplay.js:200`, `systems/traffic.js:1211`, `systems/wingmen.js:48`, `ui/causeLedger.js:130`, `ui/commandBar.js:415`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:150`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:635` | `render/vfx.js:2035`, `systems/aftermathWrecks.js:683`, `systems/asteroidSites.js:204`, `systems/automation.js:568`, `systems/bombs.js:133`, `systems/encounterDirector.js:167`, `systems/environmentalMachinery.js:103`, `systems/factionPresence.js:400`, `systems/fields.js:298`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:207`, `systems/impulseCharges.js:224`, `systems/lawSecurity.js:181`, `systems/massSeed.js:118`, `systems/masslineSnares.js:127`, `systems/mines.js:35`, `systems/missions.js:883`, `systems/npcJobsRuntime.js:625`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:50`, `systems/stationSideEventDirector.js:93`, `systems/surrenderRecovery.js:72`, `systems/survivalArena.js:563`, `systems/tetherGameplay.js:199`, `systems/traffic.js:1214`, `systems/wingmen.js:51`, `ui/customsPrompt.js:131`, `ui/encounterChoicePrompt.js:145`, `ui/lawfulInspectionPrompt.js:175` |
| `sectorsim:embodiment` | `systems/sectorSim.js:801` | `systems/world.js:437` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:318` | `ui/screens/starmap.js:776` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:944`, `systems/claims.js:1174`, `systems/encounterDirector.js:1428`, `systems/mining.js:1704` | `systems/sectorSim.js:103` |
| `sectorsim:intel` | `systems/sectorSim.js:855` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:639` | `systems/economy.js:815` |
| `sectorsim:reconcile` | `systems/sectorSim.js:596` | — |
| `sectorsim:tick` | `systems/sectorSim.js:263` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:559` | `ui/screens/starmap.js:777` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:540` | — |
| `service:completed` | `systems/economy.js:1855`, `systems/economy.js:1886` | `systems/ships.js:1387` |
| `settings:changed` | `save/saveSystem.js:2851`, `save/saveSystem.js:2852`, `systems/touch.js:627`, `ui/screens/pause.js:414`, `ui/screens/pause.js:422`, `ui/screens/pause.js:500`, `ui/screens/settings.js:330`, `ui/screens/settings.js:604`, `ui/screens/settings.js:675` | `audio/audioSystem.js:1330`, `main.js:203`, `render/vfx.js:2041`, `save/saveSystem.js:198`, `ui/uiRoot.js:546` |
| `ship:appearanceChanged` | `systems/ships.js:1664`, `systems/ships.js:1896`, `systems/traffic.js:2626` | `core/coreSystem.js:138`, `render/vfx.js:2029` |
| `ship:appearanceSaved` | `systems/ships.js:1898` | — |
| `ship:boostPreKick` | `systems/flightV3.js:381` | `render/feel.js:980` |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:195` | `audio/audioSystem.js:1259`, `render/vfx.js:2052`, `systems/cruise.js:27`, `systems/onboarding.js:277` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:196`, `systems/flightV3.js:444` | `audio/audioSystem.js:1264`, `render/vfx.js:2053` |
| `ship:cargoCapChanged` | `systems/ships.js:1659` | — |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:424` | `audio/audioSystem.js:1265`, `render/vfx.js:2054`, `systems/uniqueLootAbilities.js:116` |
| `ship:livingHullChanged` | `systems/ships.js:1488`, `systems/ships.js:1540`, `systems/story.js:1556` | `systems/barkDirector.js:189` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2127` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2100` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2059` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2038` | — |
| `ship:massChanged` | `systems/ships.js:1793` | — |
| `ship:purchased` | `systems/ships.js:1829` | `audio/audioSystem.js:1252`, `systems/missions.js:886` |
| `ship:roleContext` | `systems/ships.js:1598` | `systems/presentationAdapters.js:167` |
| `ship:sold` | `systems/ships.js:1850` | — |
| `ship:statsChanged` | `systems/ships.js:1658` | `systems/world.js:395`, `ui/commandBar.js:410`, `ui/hud.js:3219` |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1283` | `render/vfx.js:2051` |
| `signal:investigate` | — | `systems/scanner.js:832` |
| `signal:investigated` | `systems/scanner.js:1411` | `systems/missions.js:821`, `systems/presentationOrchestrator.js:182`, `systems/story.js:125`, `systems/world.js:398`, `ui/signalInvestigationPrompt.js:257` |
| `signal:investigating` | `systems/scanner.js:1173` | `ui/signalInvestigationPrompt.js:256` |
| `signal:receipt` | `systems/scanner.js:1412` | — |
| `signal:scanResults` | `systems/scanner.js:959` | `systems/missions.js:813`, `systems/presentationOrchestrator.js:180`, `ui/signalInvestigationPrompt.js:254` |
| `signal:track` | — | `systems/scanner.js:831` |
| `signal:tracked` | `systems/scanner.js:1190` | `systems/presentationOrchestrator.js:181`, `ui/signalInvestigationPrompt.js:255` |
| `sim:jumpGate` | — | `systems/economy.js:801` |
| `sim:pause` | `ui/screenManager.js:400` | `audio/audioSystem.js:1346`, `render/feel.js:882` |
| `sim:resume` | `ui/screenManager.js:407` | `audio/audioSystem.js:1347` |
| `site:anchored` | `systems/asteroidSites.js:912` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1843` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1758` | `audio/audioSystem.js:1368` |
| `site:courierLost` | `systems/asteroidSites.js:1831` | — |
| `site:created` | `systems/asteroidSites.js:850` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1207`, `systems/asteroidSites.js:1291` | — |
| `site:lost` | `systems/asteroidSites.js:1404` | `ui/alerts.js:334` |
| `site:machineInstalled` | `systems/asteroidSites.js:881` | `audio/audioSystem.js:1367`, `ui/alerts.js:333` |
| `site:machineMode` | `systems/asteroidSites.js:1313` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1224` | — |
| `site:machineStatus` | `systems/asteroidSites.js:1699` | `audio/audioSystem.js:1372`, `ui/alerts.js:329` |
| `site:overlayChanged` | `systems/asteroidSites.js:1297` | — |
| `site:podBuilt` | `systems/asteroidSites.js:1647` | — |
| `site:producing` | `systems/asteroidSites.js:1091` | `ui/asteroid/asteroidScreen.js:1670` |
| `site:rematerialized` | `systems/asteroidSites.js:1449` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1009` | `ui/asteroid/asteroidScreen.js:1655` |
| `site:surveyComplete` | `systems/asteroidSites.js:952` | `ui/asteroid/asteroidScreen.js:1649` |
| `site:surveyDetected` | `systems/asteroidSites.js:942` | `ui/asteroid/asteroidScreen.js:1642` |
| `spawn:request` | `systems/automation.js:1467` | `systems/world.js:423` |
| `station:broadcastTic` | `systems/stationBroadcast.js:226` | — |
| `station:exitRequest` | `ui/screenManager.js:540`, `ui/uiRoot.js:1000` | `ui/station/stationApp.js:1092` |
| `station:navigate` | `ui/screens/automationPanel.js:1024`, `ui/station/screens/bar.js:539`, `ui/station/screens/bar.js:544`, `ui/station/screens/industry.js:205` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:253` | `render/vfx.js:2050` |
| `stationContact:changed` | `systems/stationContacts.js:261`, `systems/stationContacts.js:297`, `systems/stationContacts.js:352`, `systems/stationContacts.js:376` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:221`, `systems/stationContacts.js:393` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:285` | — |
| `story:beatAdvanced` | `systems/missions.js:6314` | `save/saveSystem.js:257`, `systems/story.js:118`, `ui/screens/codex.js:659` |
| `story:elroyResolved` | `systems/missions.js:3778` | `systems/story.js:119` |
| `story:kurtzLedger` | `systems/story.js:1371`, `systems/story.js:1382` | — |
| `story:newGamePlusStarted` | `systems/story.js:1479` | `systems/titles.js:402`, `ui/hudMeta.js:114` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1256` | — |
| `story:postEndingContinuity` | `systems/story.js:1274` | — |
| `story:postEndingProgress` | `systems/story.js:1244` | `ui/screens/missionLog.js:2054` |
| `story:replayHookUnlocked` | `systems/story.js:1259` | `ui/screens/missionLog.js:2055` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:193` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:192` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1077` | — |
| `story:vergeObserversRevealed` | `systems/story.js:933` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1097` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:146` | — |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:135` | — |
| `stunt:styleBanked` | `systems/stuntGrammar.js:85` | — |
| `stunt:trickAmended` | — | `systems/bulletTime.js:131`, `systems/titles.js:401` |
| `stunt:trickDetected` | — | `systems/bulletTime.js:130`, `systems/titles.js:400` |
| `surrender:secured` | — | `systems/traffic.js:1230` |
| `surrender:tethered` | — | `systems/traffic.js:1229` |
| `survivorPod:choose` | — | `systems/survivorPod.js:398` |
| `survivorPod:ejected` | `systems/survivorPod.js:546`, `systems/survivorPod.js:646` | `systems/lawSecurity.js:180` |
| `survivorPod:promoted` | `systems/survivorPod.js:878` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:972` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:984` | — |
| `survivorPod:resolved` | `systems/survivorPod.js:812` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1023` | — |
| `swarm:chain` | — | `systems/survivalResults.js:358`, `ui/survivalHud.js:177` |
| `swarm:chainBest` | — | `systems/survivalResults.js:371` |
| `swarm:chainBroken` | — | `ui/survivalHud.js:178` |
| `tech:researched` | `systems/ships.js:1701` | `audio/audioSystem.js:1251`, `systems/onboarding.js:355`, `systems/ships.js:1317` |
| `tether:attached` | `combat/attachments.js:365` | `audio/audioSystem.js:1303`, `render/vfx.js:2000`, `systems/encounterDirector.js:195`, `systems/presentationOrchestrator.js:90`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:312`, `systems/tetherGameplay.js:1105` | `careers/origins/prospectorOrigin.js:645`, `systems/onboarding.js:250`, `systems/onboarding.js:266`, `systems/surrenderRecovery.js:69` |
| `tether:broken` | `combat/attachments.js:483` | `audio/audioSystem.js:1294`, `render/feel.js:1033`, `render/vfx.js:2003`, `systems/presentationOrchestrator.js:98`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:201` |
| `tether:cut` | `systems/tetherGameplay.js:1659` | `systems/masslineThrow.js:69`, `systems/onboarding.js:265` |
| `tether:latchDenied` | `systems/masslineSnares.js:549`, `systems/tetherGameplay.js:244`, `systems/tetherGameplay.js:402`, `systems/tetherGameplay.js:445`, `systems/tetherGameplay.js:450`, `systems/tetherGameplay.js:460`, `systems/tetherGameplay.js:478`, `systems/tetherGameplay.js:825` | `testing/lab/proofSixtySeconds.js:953`, `ui/masslineHud.js:334` |
| `tether:latched` | `systems/tetherGameplay.js:498` | `careers/origins/prospectorOrigin.js:642`, `systems/flightV3.js:152`, `systems/lawSecurity.js:188`, `systems/missions.js:826`, `systems/missions.js:852`, `systems/onboarding.js:245`, `systems/onboarding.js:262`, `systems/onboarding.js:275`, `systems/onboarding.js:378`, `systems/onboarding.js:388`, `systems/surrenderRecovery.js:66`, `systems/survivorPod.js:404`, `testing/lab/proofSixtySeconds.js:954`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1360` | — |
| `tether:nearBreak` | `combat/attachments.js:825` | `audio/audioSystem.js:1315`, `systems/onboarding.js:251`, `systems/presentationOrchestrator.js:91` |
| `tether:rebound` | `combat/attachments.js:761` | — |
| `tether:reel` | `combat/attachments.js:417` | `audio/audioSystem.js:1292`, `systems/missions.js:822`, `systems/onboarding.js:248`, `systems/onboarding.js:263`, `systems/surrenderRecovery.js:67` |
| `tether:reelPump` | `systems/masslineTelemetry.js:247` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:313`, `systems/tetherGameplay.js:1103`, `systems/tetherGameplay.js:1106`, `systems/tetherGameplay.js:1661` | `audio/audioSystem.js:1293`, `render/feel.js:1069`, `render/vfx.js:2002`, `systems/missions.js:827`, `systems/presentationOrchestrator.js:151` |
| `tether:released` | `systems/tetherGameplay.js:1102`, `systems/tetherGameplay.js:1660` | `render/vfx.js:2001`, `systems/onboarding.js:249`, `systems/onboarding.js:264`, `systems/surrenderRecovery.js:68` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:325` | — |
| `tether:strain` | `systems/tetherGameplay.js:1414` | `audio/audioSystem.js:1308` |
| `tether:whipImpact` | `systems/masslineImpacts.js:302` | `render/feel.js:1094`, `systems/collisionConsequences.js:50`, `systems/combat.js:451`, `systems/masslineImpactDamage.js:41`, `systems/missions.js:828`, `systems/onboarding.js:267`, `systems/presentationOrchestrator.js:127`, `systems/tumbleStates.js:63` |
| `tether:whipSnap` | `systems/tetherGameplay.js:1694` | — |
| `title:holdResolved` | — | `systems/titles.js:394` |
| `touch:uiAction` | `systems/touch.js:575` | `ui/input.js:697` |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:1203` |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:3085` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:8845` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:7567` | — |
| `traffic:spillNoticed` | `systems/traffic.js:4765` | — |
| `tutorial:finished` | `systems/onboarding.js:841` | `systems/achievements.js:789`, `systems/missions.js:749`, `systems/presentationAdapters.js:170`, `systems/story.js:127` |
| `tutorial:say` | `systems/onboarding.js:561` | `systems/story.js:133` |
| `ui:abandonMission` | `ui/screens/missionLog.js:1956` | `systems/missions.js:758` |
| `ui:acceptMission` | `ui/station/screens/bar.js:477`, `ui/station/screens/contracts.js:630` | `systems/missions.js:757` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:2367` | `systems/ships.js:1354` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `careers/origins/haulerOriginSystem.js:88`, `systems/economy.js:744` |
| `ui:buyModule` | `ui/station/screens/shipworks.js:2659` | `systems/onboarding.js:350`, `systems/ships.js:1347` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:2458` | `systems/ships.js:1345` |
| `ui:cancel` | `ui/input.js:926`, `ui/input.js:940` | — |
| `ui:click` | — | `audio/audioSystem.js:1382` |
| `ui:closeAll` | `main.js:661`, `ui/screens/crucible.js:1920` | `ui/uiRoot.js:871` |
| `ui:closeCargo` | `ui/input.js:221`, `ui/input.js:310` | `ui/hud.js:3193` |
| `ui:closeComms` | `ui/input.js:305` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:865` |
| `ui:confirm` | `ui/input.js:934` | `audio/audioSystem.js:1384` |
| `ui:cycleComponent` | `ui/targetPanel.js:392`, `ui/targetPanel.js:396` | `ui/uiRoot.js:876` |
| `ui:cycleTarget` | `ui/input.js:344`, `ui/input.js:987` | `ui/uiRoot.js:872` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:2398` | `systems/ships.js:1355` |
| `ui:deny` | — | `audio/audioSystem.js:1385` |
| `ui:endgameChoose` | `systems/missions.js:2213`, `ui/station/barContacts.js:712` | `systems/story.js:146` |
| `ui:endgameConfirm` | — | `systems/story.js:147` |
| `ui:endgameDecline` | `ui/comms.js:436` | `systems/story.js:148` |
| `ui:endgameDepartAshfall` | `ui/comms.js:453` | `systems/story.js:152` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1806` | `systems/story.js:149` |
| `ui:endgameStayAshfall` | `ui/comms.js:454` | `systems/story.js:153` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:1810` | `systems/story.js:150` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:151` |
| `ui:entityRoute` | `ui/entityLinks.js:196` | — |
| `ui:factionPresenceService` | — | `systems/factionPresence.js:406` |
| `ui:fitModule` | — | `systems/onboarding.js:347`, `systems/ships.js:1348` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1070` | `systems/automation.js:535`, `systems/wingmen.js:59` |
| `ui:heliosBay7Scan` | — | `systems/story.js:176` |
| `ui:hover` | — | `audio/audioSystem.js:1383` |
| `ui:kurtzInteract` | — | `systems/story.js:175` |
| `ui:navigate` | `ui/input.js:914`, `ui/input.js:918`, `ui/input.js:965` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2615`, `ui/screens/achievements.js:111`, `ui/screens/automationPanel.js:516`, `ui/screens/credits.js:109`, `ui/screens/crucible.js:1067`, `ui/screens/crucibleDraft.js:445`, `ui/screens/starmap.js:618` | `ui/uiRoot.js:861` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:461` | `systems/world.js:426` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:530` | `systems/world.js:425` |
| `ui:pushScreen` | `systems/story.js:1057`, `ui/mapAuthority.js:133`, `ui/screens/crucible.js:1921`, `ui/screens/crucibleDraft.js:213`, `ui/screens/gameOver.js:265`, `ui/screens/starmap.js:626`, `ui/signalInvestigationPrompt.js:229`, `ui/station/barContacts.js:447`, `ui/station/screens/bar.js:494`, `ui/station/stationApp.js:470` | `ui/uiRoot.js:838` |
| `ui:replaceScreen` | `ui/screens/crucible.js:1890`, `ui/screens/crucible.js:1912` | `ui/uiRoot.js:870` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:2339` | `systems/ships.js:1353` |
| `ui:screenTop` | `ui/screenManager.js:252` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `careers/origins/haulerOriginSystem.js:89`, `systems/economy.js:745` |
| `ui:service` | `balance/careerCohorts.js:699`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/station/stationApp.js:818`, `ui/station/stationApp.js:854` | `systems/economy.js:798` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:2463`, `ui/station/screens/shipworks.js:2550` | `systems/ships.js:1346` |
| `ui:setCourse` | `systems/factionPresence.js:990`, `systems/missions.js:2704`, `systems/scanner.js:1189`, `ui/galaxyMap.js:2085`, `ui/galaxyMap.js:2097`, `ui/galaxyMap.js:6820`, `ui/market/tradeLogic.js:479`, `ui/screens/footprint.js:1129`, `ui/screens/footprint.js:1140`, `ui/screens/localmap.js:726`, `ui/screens/starmap.js:1449`, `ui/screens/starmap.js:1462`, `ui/screens/starmap.js:1466` | `systems/world.js:391` |
| `ui:setShipAppearance` | — | `systems/ships.js:1357` |
| `ui:talkContact` | — | `systems/story.js:177` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:45`, `combat/autoTargetMode.js:205` | `ui/uiRoot.js:877` |
| `ui:toggleCargo` | `ui/input.js:407` | `ui/hud.js:3192` |
| `ui:toggleComms` | `ui/input.js:424` | — |
| `ui:toggleOverview` | `ui/input.js:411` | `ui/hud.js:3592` |
| `ui:trackMission` | `ui/galaxyMap.js:3978`, `ui/screens/missionLog.js:1802`, `ui/screens/missionLog.js:1874`, `ui/screens/missionLog.js:1935`, `ui/station/screens/contracts.js:637` | `systems/missions.js:759` |
| `ui:undock` | — | `ui/input.js:696` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:2663` | `systems/ships.js:1349` |
| `ui:unlockTech` | `ui/screens/techTree.js:1087` | `systems/ships.js:1356` |
| `ui:wingOrder` | `ui/wingmanRadial.js:128` | `systems/automation.js:536` |
| `ui:wingmanRadial` | `ui/input.js:417` | `ui/wingmanRadial.js:182` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:308` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:260` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:195` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1253` | `systems/missions.js:875` |
| `uniqueWreck:choose` | `systems/missions.js:3524`, `ui/recoveryEncounterPrompt.js:532` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:674` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:692`, `systems/uniqueWrecks.js:849`, `systems/uniqueWrecks.js:1052` | `systems/missions.js:876` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1313` | `systems/missions.js:878` |
| `uniqueWreck:decisionRequest` | `ui/recoveryEncounterPrompt.js:627`, `ui/recoveryEncounterPrompt.js:629` | — |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:911` | `systems/missions.js:877` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:941` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:441`, `systems/uniqueWrecks.js:851` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1489` | `systems/missions.js:879` |
| `uniqueWreck:rumorHeard` | `ui/station/screens/bar.js:510` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:548` | `systems/missions.js:874` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1490` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1232` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1420` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:344` | `ui/bandHud.js:86` |
| `verb:used` | `systems/onboarding.js:1761` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:3981` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:537` | `systems/world.js:401` |
| `vestaOreCache:clueRecovered` | `systems/world.js:3801` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:3832` | — |
| `vestaOreCache:pickupReady` | `systems/world.js:3944` | — |
| `vestaOreCache:resolved` | `systems/world.js:3900` | — |
| `voice:clear` | `ui/voiceArbiter.js:359`, `ui/voiceArbiter.js:403` | `ui/alerts.js:314` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:317` |
| `voice:say` | `systems/achievements.js:652`, `systems/survivalAnnounce.js:326`, `ui/alerts.js:216` | `ui/voiceArbiter.js:316` |
| `voice:surface` | `ui/voiceArbiter.js:364`, `ui/voiceArbiter.js:413` | `systems/barkDirector.js:190`, `ui/alerts.js:313` |
| `weapons:inertialShunt` | `systems/weapons.js:239` | — |
| `weapons:mineArmed` | `systems/weapons.js:1182` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1147` | — |
| `weapons:mineDetonated` | `systems/weapons.js:1251` | — |
| `weapons:mineExpired` | `systems/weapons.js:1176` | — |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:219` | — |
| `weapons:momentumSinkReleased` | `systems/weapons.js:865` | — |
| `weapons:vent` | `systems/weapons.js:446`, `systems/weapons.js:466` | `audio/audioSystem.js:1233`, `systems/ships.js:1401`, `ui/hud.js:3259` |
| `web:linked` | `combat/tetherWebs.js:80` | — |
| `well:capture` | `systems/fields.js:1581` | — |
| `well:fling` | `systems/fields.js:1515` | — |
| `well:grind` | `systems/fields.js:1319` | `systems/impulseCharges.js:220` |
| `wingMorale:broken` | `systems/wingMorale.js:257` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:342` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:369` | — |
| `wingOrder:accepted` | `systems/automation.js:1942` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1943` | — |
| `wingOrder:converted` | `systems/wingmen.js:310` | — |
| `wingOrder:status` | `systems/automation.js:1944` | — |
| `world:abortJumpCharge` | `systems/story.js:712`, `ui/comms.js:445` | `systems/world.js:388` |
| `world:confirmUnfiledJump` | `systems/story.js:151` | `systems/world.js:387` |
| `world:criticalSpawnDeferred` | `systems/world.js:1180`, `systems/world.js:2547` | — |
| `world:farActorRestored` | `world/farActorTable.js:447` | `systems/npcJobsRuntime.js:628`, `systems/traffic.js:1218` |
| `world:farActorShelved` | `world/farActorTable.js:425` | `systems/npcJobsRuntime.js:627`, `systems/traffic.js:1217` |
| `world:membership` | `systems/world.js:698` | `systems/presentationOrchestrator.js:170` |
| `world:originShift` | `systems/world.js:2970` | — |
| `world:playerRelocated` | `systems/world.js:2693` | `render/vfx.js:2040` |
| `world:requestJump` | `systems/story.js:696`, `ui/galaxyMap.js:2083`, `ui/screens/starmap.js:1461` | `systems/world.js:385` |
| `world:requestRoute` | `ui/galaxyMap.js:2095`, `ui/galaxyMap.js:3995`, `ui/galaxyMap.js:6818`, `ui/screens/starmap.js:1448`, `ui/screens/starmap.js:1465` | `systems/world.js:389` |
| `world:requestSectorScan` | — | `systems/world.js:390` |
| `world:requestUnfiledJump` | `systems/story.js:664` | `systems/world.js:386` |
| `world:residency` | `systems/world.js:823`, `systems/world.js:1361` | — |
| `world:spawnLimited` | `systems/world.js:2483` | — |
| `world:zoneEntered` | `systems/world.js:2997` | `data/hazardLanguage.js:131` |
| `world:zoneExited` | `systems/world.js:3000` | `data/hazardLanguage.js:132` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:538` | `systems/presentationOrchestrator.js:234` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:492` | `systems/presentationOrchestrator.js:235`, `systems/traffic.js:1295` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:1528` | — |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:1292` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:1456` | `systems/npcJobsRuntime.js:658` |
| `wreckField:source` | `systems/salvage.js:349`, `systems/uniqueWrecks.js:1149` | `systems/aftermathWrecks.js:681` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 1 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `barkDirector:voice` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:bankShot` — 1 subscriber(s)
- `combat:baseDestroyed` — 1 subscriber(s)
- `combat:lockChanged` — 2 subscriber(s)
- `combat:repairSubsystem` — 1 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:subsystemDisabled` — 6 subscriber(s)
- `combat:subsystemEnabled` — 2 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `dock:launder` — 1 subscriber(s)
- `economy:trade` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `entity:kill` — 1 subscriber(s)
- `entity:spawnRequest` — 1 subscriber(s)
- `flybyFocus:cancel` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
- `game:newGame` — 12 subscriber(s)
- `heat:clear` — 1 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
- `hud:slotClaim` — 1 subscriber(s)
- `hud:slotRelease` — 1 subscriber(s)
- `law:custodyTransfer` — 1 subscriber(s)
- `law:distressRaised` — 1 subscriber(s)
- `law:impoundPay` — 1 subscriber(s)
- `law:impoundPosted` — 1 subscriber(s)
- `law:impoundRecovered` — 2 subscriber(s)
- `law:impoundWorked` — 1 subscriber(s)
- `law:incidentOpened` — 1 subscriber(s)
- `law:reportIncidentReceipt` — 1 subscriber(s)
- `law:wantedCheckpointBroken` — 1 subscriber(s)
- `law:witnessChoice` — 1 subscriber(s)
- `lawfulInspection:offered` — 1 subscriber(s)
- `lawfulInspection:resolved` — 1 subscriber(s)
- `lawfulInspection:scanning` — 1 subscriber(s)
- `miningDrone:sellOre` — 1 subscriber(s)
- `mission:abandoned` — 2 subscriber(s)
- `mission:forceEvent` — 1 subscriber(s)
- `moment:holyShit` — 1 subscriber(s)
- `moralMemory:remember` — 1 subscriber(s)
- `moralTrap:choose` — 1 subscriber(s)
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
- `recovery:started` — 1 subscriber(s)
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
- `sim:jumpGate` — 1 subscriber(s)
- `story:stuntIncidentRecorded` — 1 subscriber(s)
- `story:stuntIncidentUpdated` — 1 subscriber(s)
- `stunt:trickAmended` — 2 subscriber(s)
- `stunt:trickDetected` — 2 subscriber(s)
- `surrender:secured` — 1 subscriber(s)
- `surrender:tethered` — 1 subscriber(s)
- `survivorPod:choose` — 1 subscriber(s)
- `swarm:chain` — 2 subscriber(s)
- `swarm:chainBest` — 1 subscriber(s)
- `swarm:chainBroken` — 1 subscriber(s)
- `title:holdResolved` — 1 subscriber(s)
- `traffic:ceresCausalChain` — 1 subscriber(s)
- `ui:buy` — 2 subscriber(s)
- `ui:click` — 1 subscriber(s)
- `ui:closeScreen` — 1 subscriber(s)
- `ui:deny` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:endgameUnfiledJumpConfirm` — 1 subscriber(s)
- `ui:factionPresenceService` — 1 subscriber(s)
- `ui:fitModule` — 2 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:hover` — 1 subscriber(s)
- `ui:kurtzInteract` — 1 subscriber(s)
- `ui:sell` — 2 subscriber(s)
- `ui:setShipAppearance` — 1 subscriber(s)
- `ui:talkContact` — 1 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `voice:dismiss` — 1 subscriber(s)
- `world:requestSectorScan` — 1 subscriber(s)

## Events with no subscriber (likely dead, or subscribed dynamically)

- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:completed` — 1 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `ai:stateChange` — 1 emitter(s)
- `ambientComms:register` — 1 emitter(s)
- `ambientComms:toneChanged` — 1 emitter(s)
- `anomaly:bearing` — 1 emitter(s)
- `automation:incomeCredited` — 3 emitter(s)
- `automation:traderCycleCompleted` — 1 emitter(s)
- `band:bearingReceipt` — 1 emitter(s)
- `band:bearingRequest` — 1 emitter(s)
- `band:bearingResolved` — 2 emitter(s)
- `band:bearingUnavailable` — 3 emitter(s)
- `band:cycle` — 2 emitter(s)
- `beacon:deployed` — 1 emitter(s)
- `beam:denied` — 5 emitter(s)
- `beam:repaired` — 1 emitter(s)
- `beam:transferred` — 1 emitter(s)
- `bombs:armed` — 1 emitter(s)
- `bombs:cycle` — 1 emitter(s)
- `bombs:dropped` — 1 emitter(s)
- `bombs:released` — 1 emitter(s)
- `boss:defeated` — 1 emitter(s)
- `bounty:cleared` — 1 emitter(s)
- `buildIdentity:revealed` — 1 emitter(s)
- `camera:kill` — 2 emitter(s)
- `camera:shake` — 15 emitter(s)
- `camera:zoom` — 5 emitter(s)
- `cargo:delivered` — 1 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `cargo:volatileCorrosive` — 1 emitter(s)
- `cargo:volatileSlam` — 1 emitter(s)
- `chain:primeEnded` — 1 emitter(s)
- `chain:primed` — 1 emitter(s)
- `chain:tetherShare` — 1 emitter(s)
- `charge:armed` — 1 emitter(s)
- `charge:combo` — 2 emitter(s)
- `charge:stuck` — 1 emitter(s)
- `charge:thrown` — 1 emitter(s)
- `claim:defenseEncounterRequested` — 1 emitter(s)
- `claim:defenseResolved` — 1 emitter(s)
- `claim:defenseStarted` — 1 emitter(s)
- `claim:defenseWarning` — 1 emitter(s)
- `claim:freightDelivered` — 1 emitter(s)
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
- `combat:kill` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `combat:statusExpired` — 1 emitter(s)
- `comms:log` — 2 emitter(s)
- `conflict:frontAction` — 1 emitter(s)
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
- `economy:sinkCharged` — 1 emitter(s)
- `economy:tradeFailed` — 2 emitter(s)
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
- `escalation:arrived` — 1 emitter(s)
- `escalation:seeded` — 1 emitter(s)
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
- `fuel:changed` — 3 emitter(s)
- `gamepad:connected` — 1 emitter(s)
- `gamepad:disconnected` — 1 emitter(s)
- `hazard:changed` — 1 emitter(s)
- `heist:launchCue` — 1 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverCommitted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `hull:fractured` — 1 emitter(s)
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
- `massline:npcCounterplay` — 1 emitter(s)
- `massline:npcLineCut` — 1 emitter(s)
- `massline:playerLineCut` — 1 emitter(s)
- `massline:snareArmed` — 1 emitter(s)
- `massline:snareCaught` — 1 emitter(s)
- `massline:snareCut` — 1 emitter(s)
- `massline:snareDeployed` — 1 emitter(s)
- `massline:snareEnded` — 1 emitter(s)
- `mines:armed` — 1 emitter(s)
- `mines:capReached` — 1 emitter(s)
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
- `module:purchased` — 1 emitter(s)
- `moment:amended` — 1 emitter(s)
- `moralMemory:vengefulReturn` — 1 emitter(s)
- `moralTrap:resolved` — 1 emitter(s)
- `moralTrap:revealed` — 1 emitter(s)
- `namedAce:appeared` — 1 emitter(s)
- `nav:waypoint` — 10 emitter(s)
- `news:dockCards` — 1 emitter(s)
- `news:headline` — 5 emitter(s)
- `news:publish` — 5 emitter(s)
- `news:render` — 1 emitter(s)
- `npcjobs:minerRelocated` — 1 emitter(s)
- `onboarding:rangePrompt` — 2 emitter(s)
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
- `research:pointsChanged` — 2 emitter(s)
- `resonance:patrolQueued` — 1 emitter(s)
- `rhythm:phase` — 1 emitter(s)
- `rumor:ghostConvoy` — 1 emitter(s)
- `run:roleProblemStamped` — 1 emitter(s)
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
- `ship:cargoCapChanged` — 1 emitter(s)
- `ship:loadoutPresetApplied` — 1 emitter(s)
- `ship:loadoutPresetApplyRejected` — 1 emitter(s)
- `ship:loadoutPresetDeleted` — 1 emitter(s)
- `ship:loadoutPresetSaved` — 1 emitter(s)
- `ship:massChanged` — 1 emitter(s)
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
- `stunt:bridge` — 1 emitter(s)
- `stunt:lineContractCompleted` — 1 emitter(s)
- `stunt:styleBanked` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:rescueBlocked` — 1 emitter(s)
- `survivorPod:rescueSelected` — 1 emitter(s)
- `survivorPod:resolved` — 1 emitter(s)
- `survivorPod:stripped` — 1 emitter(s)
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
- `uniqueWreck:decisionRequest` — 2 emitter(s)
- `uniqueWreck:encounterCompleted` — 1 emitter(s)
- `uniqueWreck:encounterRequested` — 2 emitter(s)
- `uniqueWreck:rumorHeard` — 1 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:scanBlocked` — 1 emitter(s)
- `uniqueWreck:storyRewardGranted` — 1 emitter(s)
- `verb:used` — 1 emitter(s)
- `vestaOreCache:cargoChanged` — 1 emitter(s)
- `vestaOreCache:clueRecovered` — 1 emitter(s)
- `vestaOreCache:decisionReady` — 1 emitter(s)
- `vestaOreCache:pickupReady` — 1 emitter(s)
- `vestaOreCache:resolved` — 1 emitter(s)
- `weapons:inertialShunt` — 1 emitter(s)
- `weapons:mineArmed` — 1 emitter(s)
- `weapons:mineDeployed` — 1 emitter(s)
- `weapons:mineDetonated` — 1 emitter(s)
- `weapons:mineExpired` — 1 emitter(s)
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
- `world:residency` — 2 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
- `wreckEcology:decayed` — 1 emitter(s)
- `wreckEcology:seeded` — 1 emitter(s)
