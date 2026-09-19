# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
>
> Generated: 2026-09-19 · 881 events · 2840 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:280`, `systems/encounterDirector.js:241` |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:545` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:1048` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:1244` | — |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:577` | `systems/salvage.js:71` |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:1100` | `systems/lawSecurity.js:192`, `systems/salvage.js:72` |
| `ai:counterTether` | `ai/sg03ActionPort.js:381` | `systems/presentationOrchestrator.js:155` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:414` | `systems/presentationOrchestrator.js:156`, `systems/tetherGameplay.js:211` |
| `ai:encounterCommand` | `systems/aiPorts.js:231` | — |
| `ai:flee` | `systems/ai.js:243`, `systems/traffic.js:4542`, `systems/wingMorale.js:299` | `render/vfx.js:2080`, `systems/barkDirector.js:195`, `systems/combatOutcome.js:119`, `systems/encounterDirector.js:253`, `systems/presentationOrchestrator.js:157` |
| `ai:formationBroken` | `systems/ai.js:412`, `systems/wingMorale.js:249` | `render/vfx.js:2081` |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:197` |
| `ai:stateChange` | `systems/ai.js:240` | — |
| `ai:telegraph` | `systems/ai.js:308`, `systems/encounterScripts.js:173`, `systems/encounterScripts.js:941`, `systems/masslineSnares.js:331`, `systems/mines.js:100`, `systems/tacticalAI.js:402` | `audio/audioSystem.js:1536`, `render/vfx.js:2079`, `systems/presentationOrchestrator.js:154`, `systems/survivalResults.js:352`, `ui/hud.js:2328`, `ui/survivalHud.js:181`, `ui/threatHalo.js:471` |
| `aiTrader:requestTrade` | `systems/traffic.js:6179` | `systems/economy.js:790` |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114` | — |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:202` | — |
| `anomaly:bearing` | `systems/scanner.js:1021` | — |
| `anomaly:triangulated` | `systems/scanner.js:1039` | `systems/world.js:466` |
| `asset:deployed` | `systems/automation.js:2013`, `systems/automation.js:2073`, `systems/automation.js:2143`, `systems/claims.js:484` | `systems/missions.js:928`, `systems/onboarding.js:473`, `systems/story.js:165` |
| `asteroid:chunked` | `systems/mining.js:1456` | `render/asteroidMotionPresentation.js:188`, `render/vfx.js:2065`, `systems/presentationOrchestrator.js:194` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:509`, `systems/automation.js:1001`, `systems/mining.js:795` | `audio/audioSystem.js:1508`, `render/vfx.js:2064`, `systems/fieldDepletion.js:530`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `render/feel.js:384`, `render/shipMicroMotion.js:1011`, `render/vfx.js:2105`, `systems/ai.js:683`, `systems/beacons.js:55`, `systems/beacons.js:60`, `systems/beacons.js:83`, `systems/bombs.js:156`, `systems/bombs.js:269`, `systems/bulletTime.js:182`, `systems/bulletTime.js:198`, `systems/bulletTime.js:277`, `systems/claims.js:331`, `systems/claims.js:416`, `systems/claims.js:461`, `systems/claims.js:1164`, `systems/claims.js:1775`, `systems/cloak.js:118`, `systems/cloak.js:129`, `systems/countermeasures.js:281`, `systems/crafting.js:268`, `systems/crafting.js:278`, `systems/fields.js:651`, `systems/fields.js:737`, `systems/fields.js:770`, `systems/fields.js:777`, `systems/fields.js:1032`, `systems/flybyFocus.js:428`, `systems/impulseCharges.js:559`, `systems/impulseCharges.js:737`, `systems/impulseCharges.js:850`, `systems/jettisonImpulse.js:78`, `systems/massSeed.js:160`, `systems/massSeed.js:258`, `systems/massSeed.js:307`, `systems/massSeed.js:334`, `systems/massSeed.js:532`, `systems/massSeed.js:575`, `systems/masslineThrow.js:180`, `systems/masslineThrow.js:456`, `systems/masslineThrow.js:533`, `systems/mining.js:587`, `systems/mining.js:1536`, `systems/planetRuntime.js:463`, `systems/presentationAdapters.js:513`, `systems/presentationOrchestrator.js:446`, `systems/salvage.js:555`, `systems/tumbleStates.js:282`, `systems/tumbleStates.js:316`, `systems/weapons.js:1388`, `ui/commsRadial.js:539`, `ui/commsRadial.js:584`, `ui/commsRadial.js:769`, `ui/commsRadial.js:800`, `ui/hud.js:1829`, `ui/hud.js:3135`, `ui/hud.js:3344`, `ui/hud.js:3395`, `ui/hud.js:3436`, `ui/hud.js:3455`, `ui/hud.js:3546`, `ui/hud.js:3667`, `ui/hud.js:3931`, `ui/input.js:175`, `ui/input.js:198`, `ui/input.js:247`, `ui/input.js:276`, `ui/input.js:282`, `ui/input.js:318`, `ui/input.js:373`, `ui/input.js:379`, `ui/input.js:385`, `ui/input.js:391`, `ui/input.js:602`, `ui/input.js:797`, `ui/input.js:802`, `ui/input.js:820`, `ui/input.js:825`, `ui/input.js:918`, `ui/input.js:939`, `ui/input.js:947`, `ui/input.js:953`, `ui/input.js:978`, `ui/input.js:989`, `ui/input.js:993`, `ui/input.js:1006`, `ui/kit/sound.js:14`, `ui/market/tradeLogic.js:488`, `ui/screens/base.js:527`, `ui/screens/base.js:674`, `ui/screens/missionLog.js:1806`, `ui/screens/missionLog.js:1810`, `ui/screens/missionLog.js:1814`, `ui/screens/missionLog.js:1818`, `ui/screens/missionLog.js:1834`, `ui/screens/missionLog.js:1842`, `ui/screens/missionLog.js:1849`, `ui/screens/missionLog.js:1856`, `ui/screens/missionLog.js:1864`, `ui/screens/missionLog.js:1871`, `ui/screens/missionLog.js:1878`, `ui/screens/missionLog.js:1887`, `ui/screens/missionLog.js:1894`, `ui/screens/missionLog.js:1910`, `ui/screens/missionLog.js:1941`, `ui/screens/missionLog.js:1961`, `ui/shipLedgerPanel.js:295`, `ui/shipLedgerPanel.js:302`, `ui/shipLedgerPanel.js:309`, `ui/station/screens/bar.js:409`, `ui/station/screens/bar.js:432`, `ui/station/screens/bar.js:436`, `ui/station/screens/bar.js:440`, `ui/station/screens/bar.js:462`, `ui/station/screens/bar.js:478`, `ui/station/screens/bar.js:506`, `ui/station/screens/bar.js:531`, `ui/station/screens/bar.js:540`, `ui/station/screens/contracts.js:604`, `ui/station/screens/contracts.js:632`, `ui/station/screens/contracts.js:639`, `ui/station/screens/factions.js:239`, `ui/station/screens/industry.js:180`, `ui/station/screens/industry.js:209`, `ui/station/screens/market.js:512`, `ui/station/screens/market.js:763`, `ui/station/screens/market.js:811`, `ui/station/screens/market.js:825`, `ui/station/screens/market.js:836`, `ui/station/screens/shipworks.js:578`, `ui/station/screens/shipworks.js:1961`, `ui/station/screens/shipworks.js:2453`, `ui/station/screens/shipworks.js:2470`, `ui/station/screens/shipworks.js:2483`, `ui/station/screens/shipworks.js:2487`, `ui/station/screens/shipworks.js:2492`, `ui/station/screens/shipworks.js:2519`, `ui/station/screens/shipworks.js:2525`, `ui/station/screens/shipworks.js:2540`, `ui/station/screens/shipworks.js:2582`, `ui/station/screens/shipworks.js:2588`, `ui/station/screens/shipworks.js:2600`, `ui/station/screens/shipworks.js:2607`, `ui/station/screens/shipworks.js:2642`, `ui/station/screens/shipworks.js:2649`, `ui/station/screens/shipworks.js:2660`, `ui/station/screens/shipworks.js:2670`, `ui/station/screens/shipworks.js:2675`, `ui/station/screens/shipworks.js:2779`, `ui/station/screens/shipworks.js:2783`, `ui/station/screens/shipworks.js:2787`, `ui/station/stationApp.js:596`, `ui/station/stationApp.js:831`, `ui/station/stationApp.js:867`, `ui/uiRoot.js:1082`, `ui/wingmanRadial.js:147`, `ui/wingmanRadial.js:168`, `ui/wingmanRadial.js:190`, `ui/wingmanRadial.js:216`, `ui/wingmanRadial.js:241` | `audio/audioSystem.js:1604` |
| `automation:assetDistressed` | `systems/automation.js:1769` | `ui/automationPayoff.js:83` |
| `automation:assetLost` | `systems/automation.js:2239` | `systems/intervention.js:37`, `systems/lossLedger.js:377`, `systems/missions.js:930` |
| `automation:assetRepossessed` | `systems/automation.js:1794` | `ui/automationPayoff.js:90` |
| `automation:incomeCredited` | `systems/automation.js:1823`, `systems/automation.js:1834`, `systems/automation.js:2512` | — |
| `automation:offlineSummary` | `systems/automation.js:2277`, `systems/automation.js:2301`, `systems/automation.js:2325`, `systems/automation.js:2348`, `systems/automation.js:2559` | `ui/automationPayoff.js:80` |
| `automation:outpostRaided` | `systems/automation.js:1696`, `systems/automation.js:2634` | `systems/lossLedger.js:378` |
| `automation:programAssigned` | `systems/automation.js:1968` | `systems/missions.js:929` |
| `automation:traderCycleCompleted` | `systems/automation.js:1462` | — |
| `band:bearingReceipt` | `systems/bandRadio.js:515` | — |
| `band:bearingRequest` | `systems/bandRadio.js:488` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:603`, `systems/uniqueWrecks.js:646` | — |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:610`, `systems/uniqueWrecks.js:618`, `systems/uniqueWrecks.js:632` | — |
| `band:bed` | `systems/bandRadio.js:572` | `audio/audioSystem.js:1639` |
| `band:cycle` | `ui/bandHud.js:81`, `ui/input.js:298` | — |
| `band:status` | `systems/bandRadio.js:554` | `ui/bandHud.js:85` |
| `barkDirector:voice` | — | `audio/audioSystem.js:1629` |
| `beacon:deploy` | — | `systems/beacons.js:38` |
| `beacon:deployed` | `systems/beacons.js:78` | — |
| `beam:denied` | `systems/mining.js:263`, `systems/mining.js:306`, `systems/mining.js:320`, `systems/mining.js:330`, `systems/mining.js:362` | — |
| `beam:repaired` | `systems/mining.js:423` | — |
| `beam:transferred` | `systems/mining.js:454` | — |
| `bombs:armed` | `systems/bombs.js:208` | — |
| `bombs:commanded` | `systems/bombs.js:169` | — |
| `bombs:cycle` | `systems/bombs.js:88` | — |
| `bombs:denied` | `systems/bombs.js:133` | — |
| `bombs:detonated` | `systems/bombs.js:264` | `render/vfx.js:2077` |
| `bombs:dropped` | `systems/bombs.js:155` | `systems/onboarding.js:490` |
| `bombs:fieldEnded` | `systems/bombs.js:396` | `render/vfx.js:2078` |
| `bombs:primed` | `systems/bombs.js:180` | — |
| `bombs:released` | `systems/bombs.js:423` | — |
| `boss:defeated` | `systems/world.js:676` | — |
| `bounty:cleared` | `systems/economy.js:1884` | — |
| `buildIdentity:revealed` | `systems/buildIdentity.js:299` | — |
| `bulletTime:end` | `systems/bulletTime.js:197` | `audio/audioSystem.js:1638` |
| `bulletTime:start` | `systems/bulletTime.js:181` | `audio/audioSystem.js:1635`, `systems/onboarding.js:523` |
| `camera:kill` | `render/feel.js:1095`, `render/feel.js:1542` | — |
| `camera:shake` | `render/shipMicroMotion.js:1009`, `render/vfx.js:3885`, `render/vfx.js:5180`, `render/vfx.js:5517`, `systems/combat.js:511`, `systems/combat.js:589`, `systems/combat.js:631`, `systems/combat.js:691`, `systems/combat.js:804`, `systems/combat.js:886`, `systems/drill.js:1283`, `systems/flybyFocus.js:427`, `systems/intervention.js:106`, `systems/presentationAdapters.js:435`, `systems/survivalAnnounce.js:413`, `systems/tetherGameplay.js:523` | — |
| `camera:zoom` | `ui/crucibleFocus.js:174`, `ui/crucibleFocus.js:179`, `ui/input.js:445`, `ui/input.js:446`, `ui/input.js:666` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:654` | `systems/world.js:468` |
| `cargo:changed` | `systems/cargo.js:154`, `systems/mining.js:1701` | `systems/ships.js:1333`, `ui/cargoConscience.js:122`, `ui/commandBar.js:412`, `ui/hud.js:3467`, `ui/hud.js:3496`, `ui/hudMeta.js:202` |
| `cargo:delivered` | `systems/missions.js:5042` | — |
| `cargo:fragileLost` | `systems/fragileCargo.js:174` | — |
| `cargo:full` | `systems/cargo.js:253`, `systems/mining.js:577`, `systems/mining.js:1063` | `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:433`, `systems/presentationOrchestrator.js:202`, `ui/alerts.js:370`, `ui/floatingText.js:236` |
| `cargo:jettison` | `ui/hud.js:3143` | `ui/hud.js:3400` |
| `cargo:jettisoned` | `systems/cargo.js:477` | `audio/audioSystem.js:1522`, `systems/barkDirector.js:205`, `systems/jettisonImpulse.js:54`, `systems/onboarding.js:519` |
| `cargo:massSettled` | `systems/cargo.js:376` | `systems/presentationOrchestrator.js:201`, `systems/ships.js:1334` |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:740` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:716` | — |
| `chain:detonated` | `systems/impulseCharges.js:539` | `systems/fields.js:310` |
| `chain:primeEnded` | `systems/impulseCharges.js:502` | — |
| `chain:primed` | `systems/impulseCharges.js:479` | — |
| `chain:slam` | `systems/impulseCharges.js:413`, `systems/impulseCharges.js:433` | `systems/fields.js:309` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1852` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:733` | `systems/onboarding.js:531` |
| `charge:armed` | `systems/impulseCharges.js:576` | — |
| `charge:combo` | `systems/impulseCharges.js:775`, `systems/impulseCharges.js:834` | — |
| `charge:detonated` | `systems/impulseCharges.js:551`, `systems/impulseCharges.js:842` | `audio/audioSystem.js:1546`, `render/feel.js:1190`, `render/vfx.js:2075`, `systems/fields.js:311` |
| `charge:stuck` | `systems/impulseCharges.js:653` | — |
| `charge:thrown` | `systems/impulseCharges.js:729` | — |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:18` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:19` |
| `claim:claimed` | `systems/claims.js:330` | `systems/onboarding.js:479`, `systems/story.js:171`, `systems/traffic.js:1332` |
| `claim:defenseEncounterRequested` | `systems/claims.js:1223` | — |
| `claim:defenseIgnore` | — | `systems/claims.js:284` |
| `claim:defenseResolved` | `systems/claims.js:1299` | — |
| `claim:defenseStarted` | `systems/claims.js:1228` | — |
| `claim:defenseWarning` | `systems/claims.js:1147` | — |
| `claim:depotPatrolCompleted` | `systems/claims.js:2069` | `systems/factions.js:293` |
| `claim:depotPatrolRotation` | `systems/claims.js:2026` | — |
| `claim:depotSupport` | `systems/claims.js:1941`, `systems/claims.js:1966` | — |
| `claim:freightDelivered` | `systems/traffic.js:2323` | — |
| `claim:infrastructureActive` | `systems/claims.js:864` | `systems/traffic.js:1330` |
| `claim:infrastructureConstructed` | `systems/claims.js:397` | — |
| `claim:infrastructureStatus` | `systems/claims.js:875` | `systems/traffic.js:1331` |
| `claim:moduleBuilt` | `systems/claims.js:415` | — |
| `claim:raidRepelled` | `systems/claims.js:1096` | — |
| `claim:raidWarning` | `systems/claims.js:1089` | — |
| `claim:receipt` | `systems/claims.js:1516` | — |
| `claim:sensorPostRumor` | `systems/claims.js:924` | `systems/world.js:496` |
| `claim:specialized` | `systems/claims.js:456` | — |
| `claim:teleportRequest` | `systems/claims.js:662` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:2226` | — |
| `claims:migrated` | `systems/claims.js:1634` | — |
| `cloak:dropped` | `systems/cloak.js:128` | — |
| `cloak:engaged` | `systems/cloak.js:117` | `systems/onboarding.js:527` |
| `combat:actionCancelled` | `combat/actions.js:294` | — |
| `combat:actionCompleted` | `combat/actions.js:280` | — |
| `combat:actionPhase` | `combat/actions.js:162` | — |
| `combat:actionRejected` | `combat/actions.js:316` | `ui/toasts.js:347` |
| `combat:actionStarted` | `combat/actions.js:132` | `systems/presentationOrchestrator.js:159`, `systems/scenarioRuntime.js:23` |
| `combat:bankShot` | — | `render/vfx.js:2023` |
| `combat:baseDestroyed` | — | `systems/economy.js:836` |
| `combat:beamStop` | `systems/weapons.js:764` | `audio/audioSystem.js:1472`, `render/asteroidMotionPresentation.js:187`, `render/vfx.js:2019` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:253` | `render/feel.js:1208`, `render/vfx.js:2032`, `systems/fields.js:313`, `systems/gamepad.js:315` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:271` | `render/vfx.js:2033` |
| `combat:damage` | `combat/damage.js:258` | `audio/audioSystem.js:1479`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:470`, `render/asteroidMotionPresentation.js:181`, `render/feel.js:1020`, `render/shipMicroMotion.js:499`, `render/vfx.js:2024`, `save/saveSystem.js:232`, `systems/ai.js:94`, `systems/barkDirector.js:201`, `systems/cruise.js:23`, `systems/difficultyDirector.js:133`, `systems/encounterDirector.js:232`, `systems/factionPresence.js:406`, `systems/heat.js:212`, `systems/lawSecurity.js:187`, `systems/onboarding.js:399`, `systems/onboarding.js:410`, `systems/presentationOrchestrator.js:153`, `systems/scenarioRuntime.js:29`, `systems/ships.js:1394`, `systems/stationBroadcast.js:152`, `systems/survivalResults.js:349`, `systems/titles.js:395`, `systems/traffic.js:1280`, `ui/alerts.js:356`, `ui/commandBar.js:401`, `ui/floatingText.js:145`, `ui/floatingText.js:169`, `ui/hud.js:1683`, `ui/hud.js:1841`, `ui/uiRoot.js:543` |
| `combat:emp` | `combat/damage.js:292` | `ui/hud.js:1847` |
| `combat:fire` | `systems/weapons.js:743`, `systems/weapons.js:892`, `systems/weapons.js:1203` | `audio/audioSystem.js:1471`, `render/feel.js:1111`, `render/shipMicroMotion.js:497`, `render/vfx.js:2018`, `systems/cloak.js:37`, `systems/cruise.js:30`, `systems/lawSecurity.js:188`, `systems/onboarding.js:357`, `systems/onboarding.js:370`, `systems/presentationOrchestrator.js:158`, `systems/traffic.js:1281`, `ui/hud.js:3508` |
| `combat:hit` | `systems/salvageActions.js:182` | `systems/routeFollower.js:332` |
| `combat:hitAsset` | `systems/wingmen.js:88` | `systems/automation.js:539` |
| `combat:kill` | `systems/world.js:4227` | — |
| `combat:lockChanged` | `systems/weapons.js:541` | `systems/world.js:461`, `ui/alerts.js:363` |
| `combat:outcome` | `systems/combatOutcome.js:183` | `systems/barkDirector.js:198` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:184` | — |
| `combat:repairSubsystem` | — | `combat/kernel.js:73` |
| `combat:requestAction` | — | `combat/kernel.js:71` |
| `combat:routeDamage` | `systems/bombs.js:409`, `systems/drill.js:1295`, `systems/impulseCharges.js:1051`, `systems/mines.js:213`, `systems/missions.js:4647` | `combat/kernel.js:72`, `systems/routeFollower.js:333` |
| `combat:shove` | `systems/onboarding.js:1692` | `systems/onboarding.js:369` |
| `combat:statusApplied` | `combat/statuses.js:155` | `render/vfx.js:2034` |
| `combat:statusExpired` | `combat/statuses.js:57` | — |
| `combat:subsystemDisabled` | — | `systems/combatOutcome.js:120`, `systems/encounterDirector.js:227`, `systems/factionPresence.js:404`, `systems/presentationOrchestrator.js:223`, `systems/surrenderRecovery.js:64`, `systems/wingMorale.js:179` |
| `combat:subsystemEnabled` | — | `systems/factionPresence.js:405`, `systems/surrenderRecovery.js:65` |
| `combat:surrendered` | — | `systems/combatOutcome.js:121`, `systems/surrenderRecovery.js:63` |
| `combat:tumbled` | `systems/tumbleStates.js:280` | `systems/fields.js:312`, `systems/missions.js:872`, `systems/tetherGameplay.js:210` |
| `combat:weakPointHit` | `systems/combat.js:565` | `render/vfx.js:2025`, `ui/floatingText.js:173` |
| `comms:log` | `systems/encounterScripts.js:655`, `systems/encounterScripts.js:2467`, `systems/encounterScripts.js:2713`, `systems/salvage.js:553` | `ui/floatingText.js:65` |
| `comms:message` | `systems/traffic.js:4417` | — |
| `comms:popup` | `systems/ai.js:467`, `systems/factionPresence.js:893`, `systems/factionPresence.js:914`, `systems/missions.js:5140`, `systems/missions.js:5174`, `systems/missions.js:5213`, `systems/missions.js:6245`, `systems/missions.js:6635`, `systems/scenarioRuntime.js:186`, `systems/story.js:379`, `systems/story.js:1020`, `systems/story.js:1048` | `audio/audioSystem.js:1590`, `ui/screens/codex.js:673` |
| `conflict:flip` | `systems/factions.js:606` | `systems/factionPresence.js:410`, `systems/sectorSim.js:109`, `systems/story.js:166` |
| `conflict:frontAction` | `systems/factions.js:493` | — |
| `conflict:warDeclared` | `systems/factions.js:550` | — |
| `contactHail:availability` | `systems/scanner.js:1358`, `systems/scanner.js:1369` | — |
| `contactHail:choice` | `ui/commsRadial.js:533`, `ui/contactHailPrompt.js:167` | `systems/scanner.js:837` |
| `contactHail:clear` | `systems/scanner.js:1380` | — |
| `contactHail:handoff` | `systems/scanner.js:1218` | — |
| `contactHail:offer` | `systems/scanner.js:1240` | — |
| `contactHail:request` | `ui/commsRadial.js:585`, `ui/contactHailPrompt.js:161` | `systems/scanner.js:836` |
| `contactHail:response` | `systems/scanner.js:1274` | `systems/traffic.js:1271` |
| `contraband:bribe` | `systems/encounterScripts.js:421`, `ui/customsPrompt.js:187` | `systems/economy.js:832` |
| `contraband:scanned` | `systems/economy.js:2210` | `systems/encounterDirector.js:233`, `systems/factions.js:274`, `systems/heat.js:215`, `systems/lawSecurity.js:198`, `ui/customsPrompt.js:135` |
| `contract:clauseBroken` | `systems/contractClauses.js:351` | `systems/missions.js:909` |
| `contract:clauseHonored` | `systems/contractClauses.js:338`, `systems/missions.js:5227` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:277` | — |
| `craft:complete` | `systems/crafting.js:267`, `systems/crafting.js:310` | `ui/station/screens/industry.js:220` |
| `craft:queueChanged` | `systems/crafting.js:162`, `systems/crafting.js:277`, `systems/crafting.js:312` | `systems/onboarding.js:484`, `ui/station/screens/industry.js:220` |
| `credits:changed` | `systems/economy.js:1824`, `systems/economy.js:1836` | `audio/audioSystem.js:1515`, `balance/hunterPublicRoute.js:466`, `ui/commandBar.js:413`, `ui/hud.js:3495` |
| `cruise:charging` | `systems/cruise.js:90` | `render/vfx.js:2072`, `systems/presentationOrchestrator.js:166` |
| `cruise:dropped` | `systems/cruise.js:101` | `render/vfx.js:2074`, `systems/presentationOrchestrator.js:168` |
| `cruise:engaged` | `systems/cruise.js:66` | `render/vfx.js:2073`, `systems/presentationOrchestrator.js:167` |
| `cruise:snareRequest` | `systems/encounterScripts.js:518` | `systems/cruise.js:35` |
| `cruise:snared` | `systems/cruise.js:100` | `audio/audioSystem.js:1584` |
| `customs:breakScan` | `ui/customsPrompt.js:191` | — |
| `customs:submit` | `ui/customsPrompt.js:183` | — |
| `danger:miningNoise` | `systems/mining.js:1713` | — |
| `day:tick` | `core/coreSystem.js:249` | `systems/custodyConsequences.js:40`, `systems/encounterDirector.js:209`, `systems/factions.js:305`, `systems/sectorSim.js:93` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:186` | `systems/combat.js:484` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:177` | `systems/combat.js:483` |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:315` | — |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:346` | — |
| `discovery:plateUnlocked` | `systems/world.js:631`, `systems/world.js:4125`, `systems/world.js:4367`, `systems/world.js:4987` | `audio/audioSystem.js:1532`, `ui/screens/codex.js:675` |
| `distress:call` | `systems/traffic.js:4415` | — |
| `distress:rescued` | `systems/encounterScripts.js:654` | `systems/factions.js:283` |
| `dock:attempt` | `ui/input.js:170` | `ui/dockDenyBanner.js:116` |
| `dock:denied` | `ui/dockDenyBanner.js:141` | — |
| `dock:docked` | `balance/careerCohorts.js:488`, `balance/courierPublicRoute.js:572`, `balance/courierPublicRoute.js:738`, `balance/courierPublicRoute.js:759`, `balance/courierPublicRoute.js:867`, `balance/courierPublicRoute.js:1006`, `balance/courierPublicRoute.js:1052`, `balance/courierPublicRoute.js:1188`, `balance/courierPublicRoute.js:1246`, `balance/courierPublicRoute.js:1367`, `balance/courierPublicRoute.js:1401`, `balance/courierPublicRoute.js:1488`, `balance/courierPublicRoute.js:1538`, `balance/hunterPublicRoute.js:653`, `balance/hunterPublicRoute.js:771`, `balance/hunterPublicRoute.js:864`, `balance/hunterPublicRoute.js:965`, `balance/hunterPublicRoute.js:1056`, `balance/prospectorPublicRoute.js:550`, `balance/prospectorPublicRoute.js:820`, `balance/prospectorPublicRoute.js:906`, `balance/prospectorPublicRoute.js:1110`, `balance/prospectorPublicRoute.js:1239`, `ui/input.js:174` | `audio/audioSystem.js:1533`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/shipMicroMotion.js:508`, `save/saveSystem.js:259`, `systems/aftermathWrecks.js:700`, `systems/autoTargetAssist.js:101`, `systems/combat.js:470`, `systems/economy.js:811`, `systems/economyContracts.js:164`, `systems/factionPresence.js:402`, `systems/lawSecurity.js:203`, `systems/mining.js:176`, `systems/missions.js:797`, `systems/onboarding.js:335`, `systems/onboarding.js:450`, `systems/pirateDisguise.js:37`, `systems/scanner.js:840`, `systems/stationServices.js:198`, `systems/story.js:136`, `systems/world.js:489`, `ui/alerts.js:330`, `ui/cargoConscience.js:123`, `ui/causeLedger.js:131`, `ui/dockDenyBanner.js:117`, `ui/priceForecast.js:86`, `ui/promptDeck.js:611`, `ui/securityReadout.js:158`, `ui/uiRoot.js:1006`, `ui/wingmanRadial.js:259` |
| `dock:launder` | — | `systems/pirateDisguise.js:38` |
| `dock:range` | `core/physics.js:823`, `core/physics.js:827`, `ui/input.js:147` | `systems/onboarding.js:419`, `ui/alerts.js:326`, `ui/input.js:153` |
| `dock:undocked` | `balance/careerCohorts.js:489`, `balance/courierPublicRoute.js:228`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:265`, `ui/input.js:642`, `ui/station/stationApp.js:806` | `audio/audioSystem.js:1534`, `save/saveSystem.js:260`, `systems/combat.js:474`, `systems/economy.js:819`, `systems/missions.js:816`, `systems/presentationAdapters.js:171`, `systems/stationServices.js:199`, `systems/world.js:490`, `ui/input.js:161`, `ui/uiRoot.js:1036` |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1304` | `ui/uiRoot.js:1095` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1289`, `ui/sandbox/sandboxSetup.js:568` | `ui/uiRoot.js:1085` |
| `drill:approachRequested` | `ui/input.js:557` | `systems/tetherGameplay.js:209` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1181`, `ui/sandbox/sandboxSetup.js:567` | `ui/uiRoot.js:1074` |
| `drill:break` | `systems/drill.js:1194` | `audio/audioSystem.js:1669`, `systems/asteroidSites.js:164`, `systems/presentationOrchestrator.js:209`, `ui/asteroid/asteroidScreen.js:1611`, `ui/screens/drill.js:1723` |
| `drill:cargoFull` | `systems/drill.js:1243` | `audio/audioSystem.js:1671`, `systems/presentationOrchestrator.js:216`, `ui/asteroid/asteroidScreen.js:1601`, `ui/screens/drill.js:1693` |
| `drill:end` | `systems/drill.js:807` | `audio/audioSystem.js:1679`, `systems/asteroidSites.js:174`, `systems/presentationOrchestrator.js:217` |
| `drill:gasHit` | `systems/drill.js:1282` | `audio/audioSystem.js:1670`, `systems/presentationOrchestrator.js:211`, `ui/asteroid/asteroidScreen.js:1588`, `ui/screens/drill.js:1633` |
| `drill:retry` | `systems/drill.js:858` | `systems/presentationOrchestrator.js:218` |
| `drill:rockDepleted` | `systems/drill.js:773`, `systems/drill.js:1208`, `systems/drill.js:1234` | `audio/audioSystem.js:1672`, `ui/asteroid/asteroidScreen.js:1598`, `ui/screens/drill.js:1684` |
| `drill:scanPulse` | `systems/drill.js:931` | `audio/audioSystem.js:1673`, `systems/asteroidSites.js:191`, `systems/presentationOrchestrator.js:207`, `ui/asteroid/asteroidScreen.js:1605`, `ui/screens/drill.js:1711` |
| `drill:spark` | `systems/drill.js:1164` | `audio/audioSystem.js:1668`, `systems/presentationOrchestrator.js:208`, `ui/asteroid/asteroidScreen.js:1616`, `ui/screens/drill.js:1744` |
| `drill:start` | `systems/drill.js:765` | `audio/audioSystem.js:1678`, `systems/asteroidSites.js:157`, `systems/onboarding.js:455`, `systems/presentationOrchestrator.js:206` |
| `drill:warn` | `systems/drill.js:779`, `systems/drill.js:784`, `systems/drill.js:1061`, `systems/drill.js:1096`, `systems/drill.js:1116`, `systems/drill.js:1215`, `systems/drill.js:1246`, `systems/drill.js:1253` | `audio/audioSystem.js:1674`, `systems/presentationOrchestrator.js:205`, `ui/asteroid/asteroidRenderer3d.js:6854`, `ui/asteroid/asteroidScreen.js:1594`, `ui/screens/drill.js:1661` |
| `drill:yield` | `systems/drill.js:1232` | `audio/audioSystem.js:1665`, `systems/presentationOrchestrator.js:210`, `ui/asteroid/asteroidScreen.js:1580`, `ui/screens/drill.js:1612` |
| `economy:applyTradePressure` | `systems/automation.js:847`, `systems/automation.js:1545`, `systems/automation.js:1546`, `systems/claims.js:1005`, `systems/encounterDirector.js:1516`, `systems/encounterDirector.js:1564`, `systems/sectorSim.js:375`, `systems/traffic.js:7762`, `systems/traffic.js:9427` | `systems/economy.js:798` |
| `economy:chargeCredits` | `systems/automation.js:1718`, `systems/automation.js:1725`, `systems/automation.js:2522`, `systems/automation.js:2746`, `systems/beacons.js:64`, `systems/claims.js:310`, `systems/claims.js:380`, `systems/claims.js:451`, `systems/claims.js:1049`, `systems/combat.js:786`, `systems/encounterDirector.js:1510`, `systems/factions.js:369`, `systems/gateControlDirector.js:120`, `systems/mining.js:409`, `systems/missions.js:2411`, `systems/missions.js:2414`, `systems/pirateParley.js:508`, `systems/ships.js:1711`, `systems/ships.js:1778`, `systems/ships.js:1834`, `systems/world.js:2999`, `systems/world.js:3043`, `systems/world.js:3803` | `systems/economy.js:764` |
| `economy:demandShift` | `systems/economy.js:1089` | — |
| `economy:eventEnded` | `systems/economy.js:2288` | `ui/floatingText.js:252` |
| `economy:eventStarted` | `systems/economy.js:2263` | `ui/floatingText.js:241` |
| `economy:grantCredits` | `systems/automation.js:1819`, `systems/automation.js:1830`, `systems/automation.js:2508`, `systems/claims.js:1004`, `systems/claims.js:1620`, `systems/combat.js:638`, `systems/combat.js:650`, `systems/combat.js:871`, `systems/encounterDirector.js:1511`, `systems/mining.js:1376`, `systems/mining.js:1552`, `systems/missions.js:5235`, `systems/missions.js:5238`, `systems/missions.js:6548`, `systems/moralTrap.js:133`, `systems/ships.js:1864`, `systems/survivorPod.js:1019`, `systems/uniqueWrecks.js:1437` | `systems/economy.js:763`, `systems/story.js:164` |
| `economy:marketOpened` | `ui/station/screens/market.js:870` | `systems/economy.js:774`, `ui/priceHistory.js:145` |
| `economy:payBounty` | `ui/screens/footprint.js:1114` | `systems/economy.js:766` |
| `economy:salvageIntakeApplied` | `systems/economy.js:1810` | — |
| `economy:sinkCharged` | `systems/economy.js:1850` | — |
| `economy:tick` | `systems/economy.js:922` | `ui/priceHistory.js:116` |
| `economy:trade` | — | `careers/origins/haulerOriginSystem.js:87` |
| `economy:tradeCompleted` | `systems/economy.js:1609` | `audio/audioSystem.js:1516`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:267`, `systems/claims.js:278`, `systems/factions.js:253`, `systems/missions.js:825`, `systems/onboarding.js:336`, `systems/sectorSim.js:104`, `systems/story.js:160` |
| `economy:tradeFailed` | `systems/economy.js:1687`, `systems/economy.js:1706` | — |
| `encounter:choiceOffered` | `systems/encounterDirector.js:1367` | `ui/encounterChoicePrompt.js:53` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:42` | `systems/encounterDirector.js:246` |
| `encounter:fingerprint` | `systems/encounterDirector.js:1452` | — |
| `encounter:namedCaptainBound` | `systems/missions.js:6040` | `systems/encounterDirector.js:231` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:1638`, `systems/encounterScripts.js:2687` | — |
| `encounter:predationCleared` | `systems/encounterScripts.js:1025` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1010` | — |
| `encounter:predationTelegraph` | `systems/encounterScripts.js:926` | — |
| `encounter:receipt` | `systems/encounterDirector.js:1465` | `ui/recoveryEncounterPrompt.js:479` |
| `encounter:resolved` | `systems/encounterDirector.js:1447`, `systems/encounterDirector.js:1496`, `systems/survivalArena.js:812` | `audio/audioSystem.js:1538`, `systems/aftermathWrecks.js:699`, `systems/claims.js:282`, `systems/claims.js:283`, `systems/story.js:124`, `systems/terrainAnchors.js:67`, `systems/traffic.js:1333`, `systems/uniqueLootAbilities.js:115`, `ui/encounterChoicePrompt.js:54` |
| `encounter:spawned` | `systems/encounterDirector.js:871` | `systems/uniqueLootAbilities.js:114` |
| `encounter:stale` | `systems/encounterDirector.js:306` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:855`, `systems/survivalArena.js:738` | `audio/audioSystem.js:1537`, `systems/survivalResults.js:353`, `systems/terrainAnchors.js:66`, `systems/world.js:499` |
| `encounter:voice` | `systems/encounterDirector.js:1350` | — |
| `encounter:waitStarted` | `systems/e1EncounterRuntime.js:395` | — |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:354` | — |
| `endgame:chosen` | `systems/story.js:864` | `ui/screens/missionLog.js:2055` |
| `endgame:confirmRequired` | `systems/story.js:753` | `ui/screens/missionLog.js:2054` |
| `endgame:eligibility` | `systems/story.js:605` | `ui/screens/missionLog.js:2053` |
| `endgame:ineligible` | `systems/story.js:656`, `systems/story.js:733`, `systems/story.js:798` | — |
| `endgame:loopBack` | — | `systems/story.js:155` |
| `endgame:promptChoiceC` | `systems/story.js:718` | — |
| `endgame:promptChoiceD` | `systems/story.js:682` | — |
| `endgame:promptSandbox` | `systems/story.js:616` | — |
| `endgame:pullCompleted` | `systems/claims.js:2172` | `systems/factions.js:296` |
| `endgame:sandboxContinued` | `systems/story.js:858` | `ui/screens/missionLog.js:2056` |
| `entity:destroyed` | `main.js:443`, `main.js:635`, `save/saveSystem.js:3276`, `systems/survivorPod.js:272`, `systems/traffic.js:5838` | `audio/audioSystem.js:1502`, `combat/kernel.js:66`, `render/vfx.js:2036`, `systems/aftermathWrecks.js:694`, `systems/ai.js:106`, `systems/encounterDirector.js:225`, `systems/gateControlDirector.js:69`, `systems/heistFacilities.js:247`, `systems/lawSecurity.js:191`, `systems/missions.js:840`, `systems/npcJobsRuntime.js:704`, `systems/presentationOrchestrator.js:165`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:92`, `systems/survivalWave.js:95`, `systems/swarmArena.js:419`, `systems/swarmSupply.js:108`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | — | `core/coreSystem.js:162` |
| `entity:killed` | `balance/careerCohorts.js:457`, `combat/damage.js:431`, `combat/kernel.js:45`, `systems/combat.js:617` | `audio/audioSystem.js:1501`, `render/feel.js:1071`, `render/shipMicroMotion.js:492`, `render/vfx.js:2035`, `systems/aftermathWrecks.js:692`, `systems/ai.js:107`, `systems/barkDirector.js:206`, `systems/combatOutcome.js:118`, `systems/encounterDirector.js:226`, `systems/factions.js:215`, `systems/factions.js:243`, `systems/impulseCharges.js:225`, `systems/lawSecurity.js:190`, `systems/lawSecurity.js:202`, `systems/lootShards.js:512`, `systems/lossLedger.js:380`, `systems/mining.js:171`, `systems/missions.js:835`, `systems/npcJobsRuntime.js:696`, `systems/onboarding.js:371`, `systems/onboarding.js:388`, `systems/presentationOrchestrator.js:164`, `systems/sectorSim.js:108`, `systems/surrenderRecovery.js:70`, `systems/survivalResults.js:346`, `systems/survivorPod.js:410`, `systems/swarmChain.js:103`, `systems/swarmSupply.js:101`, `systems/titles.js:396`, `systems/traffic.js:1259`, `systems/wingMorale.js:178`, `systems/world.js:502`, `ui/floatingText.js:170`, `ui/floatingText.js:208`, `ui/uiRoot.js:550` |
| `entity:spawnRequest` | — | `core/coreSystem.js:166` |
| `entity:spawned` | `core/coreSystem.js:67` | `combat/kernel.js:61`, `render/shipMicroMotion.js:493`, `render/vfx.js:2042`, `systems/factionPresence.js:408`, `systems/fields.js:307`, `systems/lawSecurity.js:189`, `systems/lossLedger.js:379`, `systems/npcJobsRuntime.js:681`, `systems/salvageActions.js:69`, `systems/survivalSwarm.js:216`, `systems/swarmSupply.js:106`, `systems/titles.js:397`, `systems/uniqueLootAbilities.js:117` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:598` | `systems/terrainAnchors.js:68` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:413` | `systems/terrainAnchors.js:72` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:492` | `systems/terrainAnchors.js:70` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:689` | `data/hazardLanguage.js:133` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:425` | `systems/terrainAnchors.js:74` |
| `escalation:arrived` | `systems/encounterDirector.js:346` | — |
| `escalation:seeded` | `systems/encounterDirector.js:333` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:238`, `systems/factions.js:345`, `systems/factions.js:411`, `systems/factions.js:720` | `systems/heat.js:221` |
| `faction:bribe` | `ui/screens/footprint.js:1120` | `systems/factions.js:208` |
| `faction:repChanged` | `systems/factions.js:342`, `systems/factions.js:406`, `systems/factions.js:716` | `ui/floatingText.js:226`, `ui/station/screens/factions.js:269` |
| `faction:repDelta` | `balance/careerCohorts.js:256`, `balance/courierPublicRoute.js:389`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:377`, `systems/claims.js:1287`, `systems/economy.js:2059`, `systems/economy.js:2203`, `systems/encounterDirector.js:1512`, `systems/missions.js:5563`, `systems/missions.js:5613`, `systems/missions.js:6501`, `systems/missions.js:6503`, `systems/missions.js:6566`, `systems/moralTrap.js:128`, `systems/moralTrap.js:135`, `systems/stuntGrammar.js:102`, `systems/survivorPod.js:809`, `systems/survivorPod.js:1025`, `systems/uniqueWrecks.js:1441`, `systems/world.js:4492`, `systems/world.js:4726` | `systems/factions.js:205` |
| `faction:repSpillover` | `systems/factions.js:404` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | — |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1133` | — |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:897` | `systems/story.js:179` |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1045` | `ui/uiRoot.js:279` |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:746` | — |
| `factionPresence:service` | `systems/factionPresence.js:846` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:922` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:487`, `systems/factionPresence.js:572` | — |
| `field:depletedChanged` | `systems/fieldDepletion.js:616` | `systems/world.js:465` |
| `field:regrown` | `systems/world.js:3296` | `systems/presentationOrchestrator.js:204` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:544`, `systems/traffic.js:1613`, `systems/traffic.js:9346` | — |
| `field:richSeamOpened` | `systems/traffic.js:8468` | — |
| `field:richSeamWorked` | `systems/mining.js:763`, `systems/traffic.js:8127` | — |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:615` | `systems/npcJobsRuntime.js:712`, `systems/presentationOrchestrator.js:203` |
| `fields:anchorRegistered` | `systems/fields.js:582` | — |
| `fields:cleared` | `systems/fields.js:1060` | — |
| `fields:clusterDetonate` | `systems/fields.js:1567` | — |
| `fields:coneToggled` | `systems/fields.js:769`, `systems/fields.js:776`, `systems/fields.js:870`, `systems/fields.js:878` | — |
| `fields:deployDenied` | `systems/fields.js:649` | — |
| `fields:deployed` | `systems/fields.js:473`, `systems/fields.js:735`, `systems/fields.js:861` | `audio/audioSystem.js:1630`, `systems/fields.js:308`, `systems/onboarding.js:379` |
| `fields:ended` | `systems/fields.js:601`, `systems/fields.js:877`, `systems/fields.js:896`, `systems/fields.js:1030` | — |
| `fields:hitchCut` | `systems/fields.js:504` | — |
| `fields:hitchLatched` | `systems/fields.js:492` | — |
| `fields:specialistDisrupt` | `systems/fields.js:382` | — |
| `firsthour:beat` | `systems/onboarding.js:2451` | — |
| `firsthour:complete` | `systems/onboarding.js:2464` | — |
| `firsthour:milestone` | `systems/onboarding.js:709` | — |
| `firsthour:sentence` | `systems/onboarding.js:1339` | — |
| `firsthour:started` | `systems/onboarding.js:2317` | — |
| `firsthour:verb` | `systems/onboarding.js:2412` | — |
| `flight:modeChanged` | `systems/flightV3.js:574` | — |
| `flybyFocus:cancel` | — | `systems/flybyFocus.js:279` |
| `flybyFocus:end` | `systems/flybyFocus.js:317` | — |
| `flybyFocus:start` | `systems/flybyFocus.js:410` | `systems/onboarding.js:354` |
| `formation:discovered` | `systems/asteroidFormations.js:236` | — |
| `freight:arrival` | `systems/traffic.js:6196` | — |
| `freight:cargoSpilled` | `systems/encounterScripts.js:1427`, `systems/encounterScripts.js:1646`, `systems/traffic.js:4521` | `systems/barkDirector.js:204`, `systems/economy.js:765`, `systems/encounterDirector.js:251`, `systems/lootShards.js:514`, `systems/traffic.js:1277` |
| `freight:custodyChanged` | `systems/encounterScripts.js:1289` | — |
| `freight:custodyRebound` | `systems/encounterDirector.js:463` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:1346` | — |
| `freight:loss` | `systems/encounterDirector.js:1574`, `systems/traffic.js:7764`, `systems/traffic.js:9439` | `systems/encounterDirector.js:252` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:1290` | `systems/surrenderRecovery.js:71` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:1782` | — |
| `freight:recovery` | — | `systems/encounterDirector.js:229`, `systems/traffic.js:1274` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:230`, `systems/traffic.js:1275` |
| `frontierRumor:acquired` | `systems/world.js:3062` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:4957` | — |
| `frontierRumor:contacted` | `systems/world.js:4853` | — |
| `frontierRumor:resolved` | `systems/world.js:3079` | — |
| `fuel:changed` | `systems/economy.js:1924`, `systems/stationServices.js:383`, `systems/stationServices.js:450`, `systems/world.js:4240`, `systems/world.js:4248` | — |
| `fuel:empty` | `systems/world.js:4241` | `audio/audioSystem.js:1558`, `ui/alerts.js:371` |
| `game:exitToMenu` | `ui/screens/crucible.js:1922`, `ui/screens/pause.js:750` | `main.js:232`, `systems/runSession.js:57` |
| `game:load` | `ui/input.js:287`, `ui/input.js:442`, `ui/screens/mainMenu.js:408`, `ui/screens/saveLoad.js:979` | `save/saveSystem.js:181`, `systems/scanner.js:839`, `ui/commandBar.js:430`, `ui/promptDeck.js:610` |
| `game:loadingProgress` | `main.js:140`, `main.js:158`, `main.js:580`, `main.js:660`, `main.js:676`, `main.js:694`, `main.js:712`, `main.js:739` | `ui/loadingPresenter.js:266`, `ui/screens/newGame.js:685`, `ui/screens/saveLoad.js:743` |
| `game:new` | `main.js:392`, `ui/sandbox/sandboxSetup.js:334`, `ui/screens/gameOver.js:291`, `ui/screens/newGame.js:762` | `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:175`, `main.js:211`, `render/feel.js:1014`, `render/vfx.js:2050`, `save/saveSystem.js:244`, `systems/aftermathWrecks.js:706`, `systems/bombs.js:67`, `systems/cloak.js:44`, `systems/encounterDirector.js:223`, `systems/environmentalMachinery.js:128`, `systems/fields.js:301`, `systems/impulseCharges.js:226`, `systems/massSeed.js:120`, `systems/masslineSnares.js:129`, `systems/mines.js:37`, `systems/planetRuntime.js:98`, `systems/presentationOrchestrator.js:230`, `systems/scanner.js:838`, `systems/surrenderRecovery.js:77`, `systems/survivorPod.js:408`, `systems/tetherGameplay.js:204`, `ui/commandBar.js:429`, `ui/hudLayout.js:121`, `ui/priceHistory.js:146`, `ui/promptDeck.js:609` |
| `game:newGame` | `main.js:464` | `core/coreSystem.js:176`, `render/shipMicroMotion.js:496`, `render/vfx.js:2051`, `save/saveSystem.js:248`, `systems/aftermathWrecks.js:707`, `systems/cloak.js:45`, `systems/collisionConsequences.js:62`, `systems/fieldDepletion.js:532`, `systems/fragileCargo.js:203`, `systems/lossInvestigation.js:107`, `systems/lossLedger.js:382`, `systems/survivorPod.js:407`, `systems/titles.js:399`, `systems/wingMorale.js:180`, `ui/uiRoot.js:488` |
| `game:over` | `systems/combat.js:590`, `systems/combat.js:692` | `ui/uiRoot.js:1118` |
| `game:save` | `ui/input.js:286`, `ui/input.js:440`, `ui/screens/saveLoad.js:999` | `save/saveSystem.js:170` |
| `game:scenePrepared` | `main.js:525` | `ui/sandbox/sandboxSetup.js:358` |
| `game:startFailed` | `main.js:829` | `ui/loadingPresenter.js:277`, `ui/sandbox/sandboxSetup.js:363`, `ui/screens/newGame.js:684`, `ui/screens/saveLoad.js:749` |
| `game:started` | `main.js:589` | `audio/audioSystem.js:1707`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:177`, `save/saveSystem.js:241`, `save/saveSystem.js:255`, `systems/automation.js:559`, `systems/collisionConsequences.js:61`, `systems/combat.js:481`, `systems/economyContracts.js:167`, `systems/factions.js:202`, `systems/flight.js:78`, `systems/flightV3.js:154`, `systems/heat.js:228`, `systems/lootShards.js:515`, `systems/masslineSnares.js:130`, `systems/missions.js:778`, `systems/onboarding.js:322`, `systems/presentationAdapters.js:169`, `systems/presentationOrchestrator.js:231`, `systems/sectorSim.js:99`, `systems/ships.js:1426`, `systems/story.js:122`, `systems/surrenderRecovery.js:78`, `systems/tetherGameplay.js:205`, `ui/alerts.js:351`, `ui/commandBar.js:428`, `ui/sandbox/sandboxSetup.js:355`, `ui/uiRoot.js:1103`, `ui/uiRoot.js:1161`, `ui/uiRoot.js:1163` |
| `gamepad:connected` | `systems/gamepad.js:415` | — |
| `gamepad:disconnected` | `systems/gamepad.js:400` | — |
| `gate:range` | `core/physics.js:833`, `core/physics.js:837` | `systems/onboarding.js:426`, `systems/presentationOrchestrator.js:169`, `ui/alerts.js:332` |
| `graffiti:show` | `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:198`, `systems/e1EncounterRuntime.js:565`, `systems/story.js:455`, `systems/story.js:469`, `systems/story.js:1156`, `systems/story.js:1440`, `systems/story.js:1605`, `systems/uniqueWrecks.js:1447` | `systems/ships.js:1421`, `ui/screens/codex.js:674` |
| `harasser:disengaged` | `systems/encounterDirector.js:1820` | — |
| `hazard:changed` | `systems/world.js:624` | — |
| `hazard:enter` | `systems/environmentalMachinery.js:632`, `systems/world.js:4153` | `data/hazardLanguage.js:129`, `render/shipMicroMotion.js:501` |
| `hazard:exit` | `systems/environmentalMachinery.js:641`, `systems/world.js:4160` | `data/hazardLanguage.js:130`, `render/shipMicroMotion.js:502` |
| `heat:changed` | `systems/heat.js:523` | `audio/audioSystem.js:1561`, `render/vfx.js:2047`, `systems/barkDirector.js:210`, `systems/lawSecurity.js:204`, `systems/onboarding.js:391`, `ui/hud.js:3517` |
| `heat:clear` | — | `systems/heat.js:232` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:847` | `systems/missions.js:882` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1213` | — |
| `heist:captureFork` | `systems/heistFacilities.js:1468` | `systems/missions.js:891` |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1355` | `systems/missions.js:887` |
| `heist:launchCue` | `systems/heistFacilities.js:339` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:457`, `systems/heistFacilities.js:466`, `systems/heistFacilities.js:470`, `systems/heistFacilities.js:484` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:1867` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:1809` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:1790` | `systems/npcJobsRuntime.js:715` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:1728` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:249` |
| `hud:firstUse` | `systems/onboarding.js:553` | `ui/hud.js:1744` |
| `hud:layoutChanged` | `ui/hudLayout.js:84` | `save/saveSystem.js:271` |
| `hud:phase` | `systems/story.js:221`, `systems/story.js:251`, `systems/story.js:254`, `systems/story.js:539` | `ui/hudMeta.js:152` |
| `hud:slotClaim` | — | `ui/hud.js:1649` |
| `hud:slotRelease` | — | `ui/hud.js:1650` |
| `hud:tagFlicker` | `systems/story.js:516` | `ui/hudMeta.js:186` |
| `hull:fractured` | `systems/hullFracture.js:175` | — |
| `interdiction:triggered` | `systems/encounterScripts.js:519`, `systems/world.js:3688` | `systems/presentationOrchestrator.js:177`, `systems/sectorSim.js:105` |
| `intervention:available` | `systems/intervention.js:107` | — |
| `intervention:closed` | `systems/intervention.js:121` | — |
| `jump:arrive` | `systems/world.js:3629` | `render/feel.js:1155`, `render/shipMicroMotion.js:506`, `save/saveSystem.js:262`, `systems/gateControlDirector.js:67`, `systems/presentationOrchestrator.js:175`, `systems/sectorSim.js:114` |
| `jump:chargeAbort` | `systems/world.js:3766`, `systems/world.js:3830`, `systems/world.js:3887` | `render/shipMicroMotion.js:507`, `systems/gateControlDirector.js:68`, `systems/presentationOrchestrator.js:174`, `systems/routeFollower.js:324` |
| `jump:chargeStart` | `systems/world.js:3815`, `systems/world.js:3854` | `render/feel.js:1145`, `render/shipMicroMotion.js:503`, `systems/gateControlDirector.js:65`, `systems/presentationOrchestrator.js:171`, `systems/story.js:142` |
| `jump:chargeTick` | `systems/world.js:3580` | `render/shipMicroMotion.js:504`, `systems/presentationOrchestrator.js:172` |
| `jump:departurePreflight` | `systems/world.js:3799` | `systems/story.js:141` |
| `jump:start` | `systems/world.js:3591` | `render/feel.js:1149`, `render/shipMicroMotion.js:505`, `systems/economy.js:830`, `systems/gateControlDirector.js:66`, `systems/presentationOrchestrator.js:173`, `systems/sectorSim.js:113` |
| `jump:unfiledConfirmed` | `systems/world.js:3871` | `systems/story.js:143` |
| `landmark:artifactRecovered` | `systems/missions.js:3664` | `systems/world.js:491` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:39` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:207` |
| `law:impoundPay` | — | `systems/lawSecurity.js:205` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:41` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:43`, `systems/heat.js:242` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:42` |
| `law:incidentOpened` | — | `systems/traffic.js:1282` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:209`, `systems/heat.js:249` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:238` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:208` |
| `law:witnessChoice` | — | `systems/encounterDirector.js:250` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `systems/lawSecurity.js:197` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `loot:drop` | `systems/combat.js:654`, `systems/lootShards.js:833`, `systems/stuntGrammar.js:110` | `systems/mining.js:173`, `ui/floatingText.js:196`, `ui/floatingText.js:199` |
| `loot:magnetCaptured` | `systems/lootShards.js:580` | — |
| `loot:manifestPayload` | `systems/lootShards.js:911` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:160` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:342` | `systems/factionPresence.js:403`, `systems/ships.js:1375` |
| `map:sectorCharted` | `systems/world.js:3003` | `systems/economy.js:779` |
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
| `massline:bridleCut` | `systems/tetherGameplay.js:805` | — |
| `massline:bridleEnded` | `systems/tetherGameplay.js:750`, `systems/tetherGameplay.js:766`, `systems/tetherGameplay.js:935` | — |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:614` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:668` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:815` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:1926` | — |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:2081` | — |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1551` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:1672` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:130` | — |
| `massline:releaseValidated` | `systems/masslineThrow.js:508` | `systems/presentationOrchestrator.js:152` |
| `massline:releaseWindow` | `systems/masslineThrow.js:181` | — |
| `massline:selfSling` | `systems/masslineThrow.js:532` | `systems/flightV3.js:156`, `systems/onboarding.js:515` |
| `massline:snareArmed` | `systems/masslineSnares.js:223` | — |
| `massline:snareCaught` | `systems/masslineSnares.js:418` | — |
| `massline:snareCut` | `systems/masslineSnares.js:532` | — |
| `massline:snareDeployed` | `systems/masslineSnares.js:325` | — |
| `massline:snareEnded` | `systems/masslineSnares.js:534` | — |
| `massline:sweepImpact` | `systems/masslineImpacts.js:330` | `systems/masslineImpactDamage.js:42`, `systems/presentationOrchestrator.js:139` |
| `massline:threat` | `systems/masslineThreats.js:216` | `systems/presentationOrchestrator.js:115` |
| `massline:throw` | `systems/masslineThrow.js:455` | `systems/missions.js:870`, `systems/tumbleStates.js:64` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:101` | `render/feel.js:1238` |
| `massline:tumbled` | `systems/tumbleStates.js:281` | `render/feel.js:1224` |
| `mines:armed` | `systems/mines.js:135` | — |
| `mines:capReached` | `systems/mines.js:53` | — |
| `mines:placeRequest` | `systems/encounterScripts.js:142`, `systems/survivalArena.js:709` | `systems/mines.js:34` |
| `mines:placed` | `systems/mines.js:108` | `systems/survivalArena.js:565` |
| `mines:released` | `systems/mines.js:228` | — |
| `mines:triggered` | `systems/mines.js:193` | — |
| `mining:beamCooled` | `systems/mining.js:535` | — |
| `mining:beamLocked` | `systems/mining.js:672` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:1553` | `systems/missions.js:833`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:686` | `systems/presentationOrchestrator.js:199`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:541` | — |
| `mining:npcExtraction` | `systems/traffic.js:8115` | `systems/fieldDepletion.js:531` |
| `mining:overheated` | `systems/mining.js:527` | `systems/presentationOrchestrator.js:192` |
| `mining:richCoreChargeStart` | `systems/mining.js:1506` | `systems/presentationOrchestrator.js:196` |
| `mining:richCoreCompleted` | `systems/mining.js:1533` | `systems/presentationOrchestrator.js:197` |
| `mining:richCoreExposed` | `systems/mining.js:1484` | `systems/presentationOrchestrator.js:195` |
| `mining:richCoreFizzle` | `systems/mining.js:1535` | `systems/presentationOrchestrator.js:198` |
| `mining:seamHit` | `systems/mining.js:1781` | `systems/presentationOrchestrator.js:186` |
| `mining:start` | `systems/mining.js:250`, `systems/mining.js:372` | `audio/audioSystem.js:1505`, `render/asteroidMotionPresentation.js:185`, `render/vfx.js:2060`, `systems/onboarding.js:339`, `systems/presentationOrchestrator.js:183` |
| `mining:stop` | `systems/mining.js:472` | `audio/audioSystem.js:1506`, `render/asteroidMotionPresentation.js:186`, `render/vfx.js:2061`, `systems/presentationOrchestrator.js:184` |
| `mining:tick` | `systems/automation.js:995`, `systems/mining.js:707` | `audio/audioSystem.js:1507`, `render/vfx.js:2062`, `systems/presentationOrchestrator.js:185` |
| `mining:ventBonus` | `systems/mining.js:578` | — |
| `mining:ventReady` | `systems/mining.js:507` | `systems/presentationOrchestrator.js:191` |
| `mining:yield` | `balance/careerCohorts.js:1806`, `balance/prospectorPublicRoute.js:517`, `systems/mining.js:575`, `systems/mining.js:824`, `systems/mining.js:1220`, `systems/mining.js:1530` | `careers/origins/prospectorOrigin.js:636`, `render/feel.js:1168`, `render/vfx.js:2063`, `systems/encounterDirector.js:248`, `systems/missions.js:827`, `systems/onboarding.js:340`, `systems/presentationOrchestrator.js:193`, `ui/floatingText.js:181` |
| `miningDrone:sellOre` | — | `systems/economy.js:794` |
| `mission:abandoned` | — | `careers/origins/haulerOriginSystem.js:72`, `ui/hud.js:3501` |
| `mission:accepted` | `systems/missions.js:2433` | `audio/audioSystem.js:1526`, `save/saveSystem.js:263`, `systems/aftermathWrecks.js:702`, `systems/contractClauses.js:196`, `systems/economy.js:760`, `systems/onboarding.js:342`, `ui/hud.js:3499`, `ui/screens/missionLog.js:2038` |
| `mission:completed` | `systems/missions.js:5333` | `audio/audioSystem.js:1527`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:264`, `systems/aftermathWrecks.js:703`, `systems/claims.js:279`, `systems/contractClauses.js:200`, `systems/factions.js:262`, `systems/lossLedger.js:381`, `systems/onboarding.js:343`, `systems/story.js:159`, `ui/hud.js:3500`, `ui/screens/missionLog.js:2039` |
| `mission:conditionBroken` | `systems/contractClauses.js:306`, `systems/missions.js:1092` | — |
| `mission:conditionPending` | `systems/missions.js:1145` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:274`, `systems/missions.js:1075` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:285`, `systems/missions.js:1083` | `systems/missions.js:912` |
| `mission:expired` | `systems/missions.js:5626` | `audio/audioSystem.js:1531`, `save/saveSystem.js:266`, `systems/aftermathWrecks.js:705`, `systems/factions.js:271`, `ui/screens/missionLog.js:2041` |
| `mission:failed` | `systems/missions.js:5583` | `audio/audioSystem.js:1530`, `careers/origins/haulerOriginSystem.js:71`, `save/saveSystem.js:265`, `systems/aftermathWrecks.js:704`, `systems/factions.js:270`, `ui/screens/missionLog.js:2040` |
| `mission:forceEvent` | — | `systems/economy.js:835` |
| `mission:offerBoarded` | `systems/missions.js:1781` | `systems/aftermathWrecks.js:701` |
| `mission:offered` | `systems/aftermathWrecks.js:991`, `systems/careerContracts.js:296`, `systems/e1EncounterRuntime.js:415`, `systems/economyContracts.js:232`, `systems/economyContracts.js:254`, `systems/lossLedger.js:318`, `systems/postEndingReplay.js:340`, `systems/salvage.js:561`, `systems/uniqueWrecks.js:785` | `systems/economy.js:759`, `systems/lossInvestigation.js:106`, `systems/missions.js:793`, `systems/survivorPod.js:405` |
| `mission:setPieceTransition` | `systems/missions.js:5161` | — |
| `mission:setPieceTravelLine` | `systems/missions.js:6251` | — |
| `mission:spawnDeferred` | `systems/missions.js:6107` | — |
| `mission:updated` | `systems/contractClauses.js:279`, `systems/contractClauses.js:289`, `systems/contractClauses.js:318`, `systems/missions.js:1079`, `systems/missions.js:1087`, `systems/missions.js:1105`, `systems/missions.js:1180`, `systems/missions.js:1270`, `systems/missions.js:1371`, `systems/missions.js:1441`, `systems/missions.js:1669`, `systems/missions.js:1703`, `systems/missions.js:1715`, `systems/missions.js:1780`, `systems/missions.js:2360`, `systems/missions.js:2445`, `systems/missions.js:2594`, `systems/missions.js:2794`, `systems/missions.js:3371`, `systems/missions.js:3407`, `systems/missions.js:3420`, `systems/missions.js:3428`, `systems/missions.js:3444`, `systems/missions.js:3491`, `systems/missions.js:3541`, `systems/missions.js:3550`, `systems/missions.js:3697`, `systems/missions.js:3723`, `systems/missions.js:3791`, `systems/missions.js:3807`, `systems/missions.js:3849`, `systems/missions.js:3870`, `systems/missions.js:3906`, `systems/missions.js:3958`, `systems/missions.js:4747`, `systems/missions.js:4902`, `systems/missions.js:4948`, `systems/missions.js:4993`, `systems/missions.js:5000`, `systems/missions.js:5322`, `systems/missions.js:5603`, `systems/missions.js:5636`, `systems/missions.js:5923`, `systems/missions.js:6098`, `systems/missions.js:6194`, `systems/missions.js:6333`, `systems/missions.js:6595`, `systems/missions.js:6741` | `ui/hud.js:3498`, `ui/screens/missionLog.js:2037`, `ui/station/screens/contracts.js:645` |
| `mode:changed` | `main.js:235`, `main.js:806`, `main.js:816`, `main.js:827`, `save/saveSystem.js:2902`, `save/saveSystem.js:3020` | `systems/autoTargetAssist.js:96`, `systems/presentationAdapters.js:168`, `systems/scanner.js:841`, `ui/loadingPresenter.js:267`, `ui/screenManager.js:578`, `ui/uiRoot.js:685`, `ui/wingmanRadial.js:258` |
| `module:equipped` | `systems/ships.js:1987` | `systems/ships.js:1330`, `systems/world.js:462` |
| `module:granted` | `systems/ships.js:1792` | — |
| `module:purchased` | `systems/ships.js:1779` | — |
| `module:unequipped` | `systems/ships.js:1481`, `systems/ships.js:2006` | `systems/ships.js:1331`, `systems/world.js:463` |
| `moment:amended` | `systems/bulletTime.js:237` | — |
| `moment:holyShit` | — | `render/feel.js:1213` |
| `moralMemory:remember` | — | `systems/encounterDirector.js:240` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:425` | — |
| `moralTrap:choose` | — | `systems/moralTrap.js:73` |
| `moralTrap:resolved` | `systems/moralTrap.js:118` | — |
| `moralTrap:revealed` | `systems/moralTrap.js:91` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:2637` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:254` |
| `nav:abortRoute` | — | `systems/routeFollower.js:316` |
| `nav:autopilot` | `systems/flight.js:401`, `systems/flightV3.js:898`, `systems/world.js:3932` | `systems/routeFollower.js:319` |
| `nav:engageRoute` | — | `systems/routeFollower.js:315` |
| `nav:waypoint` | `save/saveSystem.js:3254`, `systems/claims.js:1326`, `systems/claims.js:1334`, `systems/missions.js:807`, `systems/missions.js:2783`, `systems/missions.js:2850`, `systems/missions.js:2882`, `systems/missions.js:3389`, `systems/world.js:3931`, `ui/market/tradeLogic.js:483` | — |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:111` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:176` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:107` | — |
| `nemesis:spare` | `ui/nemesisComms.js:48` | — |
| `news:dockCards` | `ui/marketNews.js:360` | — |
| `news:headline` | `systems/aftermathWrecks.js:578`, `systems/e1EncounterRuntime.js:225`, `systems/encounterDirector.js:1576`, `systems/nemesisSignals.js:25`, `systems/traffic.js:7765`, `systems/traffic.js:9441`, `ui/marketNews.js:252` | — |
| `news:publish` | `systems/claims.js:1762`, `systems/claims.js:2180`, `systems/claims.js:2227`, `systems/traffic.js:3127`, `systems/traffic.js:9054`, `systems/uniqueWrecks.js:372`, `systems/uniqueWrecks.js:1491`, `systems/world.js:633` | — |
| `news:render` | `ui/hud.js:1263` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1268` |
| `npcjobs:load` | — | `systems/traffic.js:1266` |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:2612` | — |
| `npcjobs:unload` | — | `systems/traffic.js:1267` |
| `npcjobs:work` | — | `systems/traffic.js:1265` |
| `onboarding:rangePrompt` | `systems/onboarding.js:1544`, `systems/onboarding.js:2310` | — |
| `orrinWitness:ensureEvidence` | `systems/story.js:990` | `systems/world.js:469` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:1467` | — |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1015` | — |
| `orrinWitness:submitted` | `systems/story.js:1043` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:4819` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:380` | `systems/world.js:471` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:4615` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:4650` | `ui/recoveryEncounterPrompt.js:477` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:4779` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:4733` | `ui/recoveryEncounterPrompt.js:478` |
| `patrol:proximity` | `systems/encounterScripts.js:433` | `systems/economy.js:831` |
| `pds:intercept` | `systems/countermeasures.js:220` | — |
| `physics:attachmentBroken` | — | `combat/kernel.js:70` |
| `physics:impact` | `core/physics.js:1349` | `render/asteroidMotionPresentation.js:182`, `render/feel.js:1207`, `render/shipMicroMotion.js:500`, `render/vfx.js:2026`, `systems/asteroidSites.js:226`, `systems/collisionConsequences.js:56`, `systems/fields.js:314`, `systems/fragileCargo.js:202`, `systems/gamepad.js:314`, `systems/heistFacilities.js:248`, `systems/impulseCharges.js:223`, `systems/lootShards.js:513`, `systems/masslineImpactDamage.js:43`, `systems/ships.js:1398` |
| `pickup:collected` | `core/physics.js:1194`, `systems/mining.js:1017`, `systems/mining.js:1635`, `systems/uniqueWrecks.js:1372` | `audio/audioSystem.js:1514`, `render/vfx.js:2085`, `save/saveSystem.js:220`, `systems/encounterDirector.js:228`, `systems/lawSecurity.js:200`, `systems/mining.js:175`, `systems/onboarding.js:341`, `systems/onboarding.js:390`, `systems/presentationOrchestrator.js:200`, `systems/swarmSupply.js:107`, `systems/traffic.js:1276`, `systems/world.js:472`, `systems/world.js:473`, `ui/floatingText.js:218` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:132` | `systems/pirateParley.js:42` |
| `pirateParley:demand` | `systems/scanner.js:1224` | `ui/pirateParleyPrompt.js:160` |
| `pirateParley:resolved` | — | `ui/pirateParleyPrompt.js:161` |
| `planet:collector` | `systems/planetRuntime.js:462` | — |
| `planet:harvest` | `systems/planetRuntime.js:495` | — |
| `planet:harvestDenied` | `systems/planetRuntime.js:499` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:369`, `systems/planetRuntime.js:381` | — |
| `planet:recoveryBurn` | `systems/planetRuntime.js:447` | — |
| `planet:registered` | `systems/planetRuntime.js:188` | — |
| `planet:unregistered` | `systems/planetRuntime.js:218` | — |
| `player:death` | `systems/combat.js:588`, `systems/combat.js:690`, `systems/combat.js:866`, `systems/world.js:4232` | `audio/audioSystem.js:1503`, `render/feel.js:1100`, `render/vfx.js:2059`, `save/saveSystem.js:227`, `systems/aftermathWrecks.js:693`, `systems/lawSecurity.js:199`, `systems/onboarding.js:372`, `systems/onboarding.js:389`, `systems/surrenderRecovery.js:73`, `systems/survivalResults.js:354`, `systems/survivalRun.js:107`, `systems/survivorPod.js:411`, `ui/commandBar.js:405`, `ui/hud.js:2082`, `ui/survivalHud.js:182` |
| `player:recoveryFailed` | `systems/combat.js:744` | `ui/screens/gameOver.js:323` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:266` | `systems/combat.js:475` |
| `player:respawn` | `systems/combat.js:803`, `systems/combat.js:879` | `audio/audioSystem.js:1504`, `save/saveSystem.js:228`, `save/saveSystem.js:278`, `ui/commandBar.js:409`, `ui/hud.js:2096`, `ui/screens/gameOver.js:315` |
| `player:scannedByPatrol` | `systems/economy.js:2152` | `render/vfx.js:2046`, `systems/missions.js:906`, `ui/customsPrompt.js:134` |
| `poi:discovered` | `systems/world.js:662`, `systems/world.js:4065`, `systems/world.js:4110`, `systems/world.js:4338`, `systems/world.js:4364` | `systems/encounterDirector.js:242`, `systems/world.js:497` |
| `poi:identified` | `systems/world.js:4117`, `systems/world.js:4365` | `systems/encounterDirector.js:243`, `systems/missions.js:794`, `systems/world.js:498` |
| `postEndingReplay:cycleCompleted` | — | `ui/screens/missionLog.js:2060` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:284` | `ui/screens/missionLog.js:2059` |
| `presentation:audioCue` | `systems/presentationAdapters.js:512` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:434` | — |
| `presentation:caption` | `audio/audioSystem.js:3949`, `systems/factionPresence.js:672`, `systems/factionPresence.js:1002`, `systems/factionPresence.js:1017`, `systems/factionPresence.js:1035`, `systems/factionPresence.js:1097`, `systems/presentationAdapters.js:604`, `systems/story.js:934`, `systems/story.js:1098` | `ui/hud.js:2145` |
| `presentation:cue` | — | `audio/audioSystem.js:1592`, `render/vfx.js:2082`, `render/vfx.js:2083`, `systems/presentationAdapters.js:165` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:416` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:337`, `systems/presentationAdapters.js:583` | — |
| `presentation:vfxCue` | `render/vfx.js:2098`, `systems/countermeasures.js:228`, `systems/fields.js:1706`, `systems/fields.js:1725`, `systems/massSeed.js:308`, `systems/massSeed.js:423`, `systems/massSeed.js:517`, `systems/massSeed.js:559`, `systems/masslineThrow.js:457`, `systems/missions.js:2458`, `systems/missions.js:5338`, `systems/planetRuntime.js:519`, `systems/presentationAdapters.js:480`, `systems/tumbleStates.js:283`, `systems/tumbleStates.js:312`, `systems/weapons.js:1206`, `systems/weapons.js:1383`, `systems/weapons.js:2240` | `render/vfx.js:2084` |
| `projectile:bank` | — | `render/vfx.js:2021` |
| `projectile:hit` | `core/physics.js:693`, `core/physics.js:731`, `systems/sectorSim.js:548` | `audio/audioSystem.js:1475`, `combat/tetherWebs.js:27`, `render/vfx.js:2020`, `systems/combat.js:468`, `systems/missions.js:871` |
| `projectile:nearMiss` | `core/physics.js:709` | `audio/audioSystem.js:1478`, `systems/presentationOrchestrator.js:163` |
| `projectile:ricochet` | — | `render/vfx.js:2022` |
| `range:opened` | `ui/screens/range.js:1391` | `systems/onboarding.js:377` |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:319` | — |
| `recovery:completed` | — | `ui/recoveryEncounterPrompt.js:472` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:281` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:157` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:158` |
| `rescue:beat` | `systems/onboarding.js:1711`, `systems/onboarding.js:1743` | — |
| `rescue:complete` | `systems/onboarding.js:1722` | — |
| `rescue:started` | `systems/onboarding.js:1315` | `systems/onboarding.js:373` |
| `research:pointsChanged` | `systems/missions.js:3574`, `systems/missions.js:3626`, `systems/missions.js:5281`, `systems/missions.js:5289`, `systems/missions.js:6555` | — |
| `resonance:patrolQueued` | `systems/encounterDirector.js:1918` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1135` | `systems/encounterDirector.js:249` |
| `rhythm:phase` | `systems/encounterDirector.js:317` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:317` | — |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:98` |
| `run:awardRequested` | — | `systems/runSession.js:53` |
| `run:awarded` | — | `ui/survivalHud.js:167` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1071`, `ui/sandbox/sandboxSetup.js:1110` | `systems/runSession.js:50` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:209`, `ui/screens/crucibleDraft.js:393` | `systems/survivalDraft.js:95` |
| `run:draftRerollRequested` | `ui/screens/crucibleDraft.js:293` | `systems/survivalDraft.js:99` |
| `run:draftResolved` | — | `systems/survivalRun.js:101` |
| `run:endRequested` | `save/saveSystem.js:191` | `systems/runSession.js:52` |
| `run:ended` | — | `systems/survivalAnnounce.js:276`, `systems/survivalArena.js:562`, `systems/survivalDraft.js:104`, `systems/survivalResults.js:383`, `systems/survivalRun.js:95`, `systems/survivalWave.js:94`, `systems/swarmArena.js:420`, `systems/swarmChain.js:104`, `systems/swarmSupply.js:109` |
| `run:extractionRequested` | `systems/survivalExtraction.js:22` | `systems/survivalRun.js:104` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:274`, `ui/survivalHud.js:168` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1131` | `systems/ships.js:1430`, `systems/survivalRun.js:96`, `systems/swarmSupply.js:102`, `systems/world.js:493` |
| `run:modifierChosen` | — | `systems/survivalRun.js:102` |
| `run:modifierRecordRequested` | — | `systems/runSession.js:55` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1132` | `systems/survivalRun.js:97` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:446` | `systems/survivalDraft.js:96` |
| `run:refitClosed` | — | `systems/survivalRun.js:103` |
| `run:refitFitRequested` | `ui/screens/crucibleDraft.js:549` | `systems/survivalDraft.js:97` |
| `run:refitStripRequested` | `ui/screens/crucibleDraft.js:545` | `systems/survivalDraft.js:98` |
| `run:resultsReady` | — | `systems/achievements.js:785`, `ui/uiRoot.js:1139` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:247` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:103` |
| `run:spendRequested` | — | `systems/runSession.js:54` |
| `run:spent` | — | `systems/survivalDraft.js:102` |
| `run:started` | — | `systems/survivalAnnounce.js:269`, `systems/survivalResults.js:345`, `systems/survivalRun.js:93`, `ui/survivalHud.js:169`, `ui/uiRoot.js:1160` |
| `run:threatRequested` | — | `systems/runSession.js:56` |
| `run:transitionRequested` | `systems/survivalRun.js:465` | `systems/runSession.js:51` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:275`, `systems/survivalDraft.js:94`, `systems/survivalResults.js:382`, `systems/survivalRun.js:94`, `systems/survivalWave.js:93`, `systems/swarmSupply.js:103` |
| `run:waveCleared` | — | `systems/survivalAnnounce.js:273`, `systems/survivalArena.js:561`, `systems/survivalResults.js:348` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:99` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:272` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:355` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:270`, `systems/survivalArena.js:560`, `systems/survivalWave.js:91`, `systems/swarmArena.js:417`, `ui/survivalHud.js:175` |
| `run:waveProgress` | — | `ui/survivalHud.js:176` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:271`, `systems/survivalResults.js:347`, `systems/survivalWave.js:92`, `systems/swarmArena.js:418` |
| `salvage:actionRead` | `systems/salvageActions.js:126` | — |
| `salvage:communicatorFound` | `systems/salvage.js:562` | `systems/encounterDirector.js:244`, `systems/story.js:182` |
| `salvage:completed` | `systems/mining.js:1225` | `systems/aftermathWrecks.js:698`, `systems/missions.js:831` |
| `salvage:cutComplete` | `systems/mining.js:400` | — |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:350` | — |
| `salvage:npcExtraction` | `systems/traffic.js:5503` | — |
| `salvage:npcUnload` | `systems/traffic.js:9176` | `systems/economy.js:805` |
| `salvage:placed` | `systems/salvage.js:331` | `systems/lossInvestigation.js:104`, `systems/survivorPod.js:403` |
| `salvage:reactorBurst` | `systems/salvageActions.js:185` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:154` | — |
| `salvage:reactorVented` | `systems/salvageActions.js:140` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:71` |
| `save:backup` | `save/saveSystem.js:1090` | — |
| `save:completed` | `save/saveSystem.js:1096` | `ui/uiRoot.js:339` |
| `save:dirty` | — | `save/saveSystem.js:204` |
| `save:error` | `main.js:149`, `save/saveSystem.js:711`, `save/saveSystem.js:806`, `save/saveSystem.js:824`, `save/saveSystem.js:1100`, `save/saveSystem.js:1359`, `save/saveSystem.js:1821`, `save/saveSystem.js:2569`, `save/saveSystem.js:2574`, `save/saveSystem.js:2605`, `save/saveSystem.js:2613`, `save/saveSystem.js:2629`, `save/saveSystem.js:2696`, `save/saveSystem.js:2729`, `save/saveSystem.js:2764`, `save/saveSystem.js:2803`, `save/saveSystem.js:3040`, `save/saveSystem.js:3048`, `save/saveSystem.js:3075`, `save/saveSystem.js:3455`, `save/saveSystem.js:3468`, `save/saveSystem.js:3483`, `save/saveSystem.js:3496`, `ui/screens/saveLoad.js:1052` | `systems/aftermathWrecks.js:710`, `systems/asteroidSites.js:225`, `systems/automation.js:554`, `systems/encounterDirector.js:220`, `ui/loadingPresenter.js:278`, `ui/screenManager.js:579`, `ui/uiRoot.js:361` |
| `save:exportRecovery` | `save/saveSystem.js:3444` | — |
| `save:loaded` | `save/saveSystem.js:3023` | `audio/audioSystem.js:1701`, `careers/origins/haulerOriginSystem.js:65`, `core/coreSystem.js:171`, `core/physics.js:88`, `main.js:205`, `render/feel.js:1016`, `render/shipMicroMotion.js:495`, `render/vfx.js:2053`, `save/saveSystem.js:240`, `save/saveSystem.js:256`, `systems/aftermathWrecks.js:709`, `systems/asteroidFormations.js:122`, `systems/asteroidSites.js:216`, `systems/automation.js:549`, `systems/barkDirector.js:196`, `systems/beacons.js:40`, `systems/bombs.js:68`, `systems/collisionConsequences.js:60`, `systems/combat.js:482`, `systems/economy.js:839`, `systems/encounterDirector.js:219`, `systems/environmentalMachinery.js:130`, `systems/factionPresence.js:409`, `systems/fields.js:302`, `systems/flight.js:74`, `systems/flightV3.js:147`, `systems/gateControlDirector.js:71`, `systems/heat.js:229`, `systems/heistFacilities.js:252`, `systems/impulseCharges.js:227`, `systems/lawSecurity.js:196`, `systems/lossInvestigation.js:108`, `systems/massSeed.js:121`, `systems/masslineSnares.js:131`, `systems/mines.js:38`, `systems/missions.js:780`, `systems/npcJobsRuntime.js:669`, `systems/npcJobsRuntime.js:677`, `systems/onboarding.js:326`, `systems/planetRuntime.js:99`, `systems/presentationAdapters.js:172`, `systems/presentationOrchestrator.js:232`, `systems/routeFollower.js:336`, `systems/runSession.js:61`, `systems/sectorSim.js:98`, `systems/ships.js:1335`, `systems/stationContactLoadBoundary.js:31`, `systems/stationSideEventDirector.js:94`, `systems/story.js:123`, `systems/survivalArena.js:571`, `systems/survivorPod.js:409`, `systems/tetherGameplay.js:203`, `systems/titles.js:398`, `systems/traffic.js:1290`, `systems/travelLanes.js:483`, `systems/uniqueLootAbilities.js:118`, `systems/world.js:478`, `ui/alerts.js:352`, `ui/automationPayoff.js:76`, `ui/bandHud.js:89`, `ui/hudLayout.js:120`, `ui/priceHistory.js:147`, `ui/uiRoot.js:346`, `ui/uiRoot.js:1164` |
| `save:recovered` | `save/saveSystem.js:2594` | `ui/uiRoot.js:354` |
| `save:restoring` | `save/saveSystem.js:2825` | `core/coreSystem.js:168`, `render/feel.js:1015`, `render/vfx.js:2052`, `systems/aftermathWrecks.js:708`, `systems/asteroidSites.js:208`, `systems/automation.js:543`, `systems/encounterDirector.js:212`, `systems/environmentalMachinery.js:129`, `systems/lawSecurity.js:195`, `systems/missions.js:784`, `systems/npcJobsRuntime.js:670`, `systems/runSession.js:60`, `systems/salvage.js:77`, `systems/spawnBudget.js:54`, `systems/stationContactLoadBoundary.js:30`, `systems/surrenderRecovery.js:74`, `systems/traffic.js:1283`, `systems/world.js:474` |
| `save:started` | `save/saveSystem.js:809`, `save/saveSystem.js:1413` | `ui/screenManager.js:586`, `ui/uiRoot.js:335` |
| `scan:completed` | `balance/careerCohorts.js:478`, `balance/prospectorPublicRoute.js:969`, `systems/scanner.js:968`, `systems/world.js:4069` | `careers/origins/prospectorOrigin.js:633`, `systems/missions.js:842`, `systems/onboarding.js:353`, `systems/presentationOrchestrator.js:179`, `systems/salvage.js:74`, `systems/salvageActions.js:70`, `systems/story.js:173`, `ui/hud.js:3913` |
| `scan:pulse` | `systems/scanner.js:906` | `systems/buildIdentity.js:277`, `systems/encounterDirector.js:234`, `systems/pirateDisguise.js:36`, `systems/presentationOrchestrator.js:178`, `systems/scanReveal.js:15`, `ui/hud.js:3914` |
| `scan:shipRevealed` | `systems/scanReveal.js:38` | `systems/buildIdentity.js:276` |
| `scan:weakPoint` | `systems/scanner.js:957` | `ui/hud.js:1310` |
| `scanner:ghostEscaped` | `systems/scanner.js:886` | — |
| `scanner:ghostRevealed` | `systems/scanner.js:936` | — |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:138` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:155` | `systems/presentationOrchestrator.js:89` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:579` | `systems/presentationOrchestrator.js:229` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:366` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:554` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:133` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:123` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:190` | — |
| `scenario:scavengerResponse` | `ui/comms.js:505`, `ui/comms.js:509` | `systems/scenarioRuntime.js:30` |
| `sector:discovered` | `systems/world.js:761` | `systems/presentationOrchestrator.js:176` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:774` | `audio/audioSystem.js:1566`, `render/shipMicroMotion.js:494`, `render/vfx.js:2048`, `save/saveSystem.js:261`, `systems/aftermathWrecks.js:696`, `systems/asteroidFormations.js:121`, `systems/asteroidSites.js:201`, `systems/automation.js:579`, `systems/bombs.js:66`, `systems/claims.js:274`, `systems/claims.js:276`, `systems/economy.js:823`, `systems/encounterDirector.js:208`, `systems/factionPresence.js:400`, `systems/fields.js:300`, `systems/heistFacilities.js:245`, `systems/lossInvestigation.js:105`, `systems/massSeed.js:119`, `systems/masslineSnares.js:128`, `systems/mines.js:36`, `systems/mining.js:178`, `systems/missions.js:923`, `systems/moralTrap.js:72`, `systems/npcJobsRuntime.js:658`, `systems/presentationOrchestrator.js:219`, `systems/routeFollower.js:328`, `systems/salvage.js:70`, `systems/sectorSim.js:95`, `systems/story.js:140`, `systems/story.js:172`, `systems/survivalArena.js:569`, `systems/survivorPod.js:404`, `systems/tetherGameplay.js:207`, `systems/traffic.js:1254`, `systems/wingmen.js:48`, `ui/causeLedger.js:130`, `ui/commandBar.js:415`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorPostcard.js:150`, `ui/securityReadout.js:157` |
| `sector:exit` | `systems/world.js:704` | `render/vfx.js:2049`, `systems/aftermathWrecks.js:697`, `systems/asteroidSites.js:207`, `systems/automation.js:568`, `systems/bombs.js:65`, `systems/encounterDirector.js:210`, `systems/environmentalMachinery.js:127`, `systems/factionPresence.js:401`, `systems/fields.js:299`, `systems/gateControlDirector.js:70`, `systems/heistFacilities.js:246`, `systems/impulseCharges.js:228`, `systems/lawSecurity.js:194`, `systems/massSeed.js:118`, `systems/masslineSnares.js:127`, `systems/mines.js:35`, `systems/missions.js:924`, `systems/npcJobsRuntime.js:657`, `systems/planetRuntime.js:100`, `systems/sectorSim.js:94`, `systems/spawnBudget.js:50`, `systems/stationServices.js:200`, `systems/stationSideEventDirector.js:93`, `systems/surrenderRecovery.js:72`, `systems/survivalArena.js:570`, `systems/tetherGameplay.js:206`, `systems/traffic.js:1257`, `systems/wingmen.js:51`, `ui/customsPrompt.js:136`, `ui/promptDeck.js:608` |
| `sectorsim:embodiment` | `systems/sectorSim.js:801` | `systems/world.js:506` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:318` | `ui/screens/starmap.js:776` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:1041`, `systems/claims.js:1289`, `systems/encounterDirector.js:1586`, `systems/mining.js:1733` | `systems/sectorSim.js:103` |
| `sectorsim:intel` | `systems/sectorSim.js:855` | — |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:639` | `systems/economy.js:843` |
| `sectorsim:reconcile` | `systems/sectorSim.js:596` | — |
| `sectorsim:tick` | `systems/sectorSim.js:263` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:559` | `ui/screens/starmap.js:777` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:543` | — |
| `service:aborted` | `systems/stationServices.js:248` | — |
| `service:completed` | `systems/economy.js:1982`, `systems/economy.js:2014`, `systems/economy.js:2060`, `systems/stationServices.js:436`, `systems/stationServices.js:452` | `systems/ships.js:1402` |
| `service:progress` | `systems/stationServices.js:378` | — |
| `service:queued` | `systems/stationServices.js:301` | — |
| `service:started` | `systems/stationServices.js:367` | — |
| `settings:changed` | `save/saveSystem.js:3056`, `save/saveSystem.js:3057`, `systems/touch.js:509`, `ui/screens/pause.js:415`, `ui/screens/pause.js:423`, `ui/screens/pause.js:501`, `ui/screens/settings.js:342`, `ui/screens/settings.js:689`, `ui/screens/settings.js:760` | `audio/audioSystem.js:1643`, `main.js:204`, `render/vfx.js:2055`, `save/saveSystem.js:198`, `ui/uiRoot.js:579` |
| `ship:appearanceChanged` | `systems/ships.js:1679`, `systems/ships.js:1911`, `systems/traffic.js:2667` | `core/coreSystem.js:167`, `render/vfx.js:2043` |
| `ship:appearanceSaved` | `systems/ships.js:1913` | — |
| `ship:boostPreKick` | `systems/flightV3.js:393` | `render/feel.js:1127` |
| `ship:boostStart` | `systems/flight.js:105`, `systems/flightV3.js:198` | `audio/audioSystem.js:1572`, `render/vfx.js:2069`, `systems/cruise.js:27`, `systems/onboarding.js:378` |
| `ship:boostStop` | `systems/flight.js:106`, `systems/flight.js:217`, `systems/flightV3.js:199`, `systems/flightV3.js:485` | `audio/audioSystem.js:1577`, `render/vfx.js:2070` |
| `ship:cargoCapChanged` | `systems/ships.js:1674` | — |
| `ship:dash` | `systems/flight.js:194`, `systems/flightV3.js:464` | `audio/audioSystem.js:1578`, `render/vfx.js:2071`, `systems/uniqueLootAbilities.js:116` |
| `ship:deathFlash` | `render/shipMicroMotion.js:1005` | `render/vfx.js:2089` |
| `ship:deathPop` | `render/shipMicroMotion.js:379`, `render/shipMicroMotion.js:995` | `render/vfx.js:2088` |
| `ship:livingHullChanged` | `systems/ships.js:1503`, `systems/ships.js:1555`, `systems/story.js:1556` | `systems/barkDirector.js:199` |
| `ship:loadoutPresetApplied` | `systems/ships.js:2142` | — |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:2115` | — |
| `ship:loadoutPresetDeleted` | `systems/ships.js:2074` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:2053` | — |
| `ship:massChanged` | `systems/ships.js:1808` | — |
| `ship:purchased` | `systems/ships.js:1844` | `audio/audioSystem.js:1565`, `systems/missions.js:927` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:424`, `render/shipMicroMotion.js:982` | `render/vfx.js:2087` |
| `ship:roleContext` | `systems/ships.js:1613` | `systems/presentationAdapters.js:167` |
| `ship:sold` | `systems/ships.js:1865` | — |
| `ship:statsChanged` | `systems/ships.js:1673` | `systems/world.js:464`, `ui/commandBar.js:410`, `ui/hud.js:3497` |
| `ship:swingDash` | `systems/flightV3.js:465` | — |
| `ship:thrust` | `systems/flight.js:420`, `systems/flightV3.js:1383` | `render/vfx.js:2068` |
| `signal:investigate` | — | `systems/scanner.js:834` |
| `signal:investigated` | `systems/scanner.js:1440` | `systems/missions.js:856`, `systems/presentationOrchestrator.js:182`, `systems/story.js:125`, `systems/world.js:467`, `ui/signalInvestigationPrompt.js:153` |
| `signal:investigating` | `systems/scanner.js:1183` | `ui/signalInvestigationPrompt.js:152` |
| `signal:receipt` | `systems/scanner.js:1441` | — |
| `signal:scanResults` | `systems/scanner.js:969` | `systems/missions.js:843`, `systems/presentationOrchestrator.js:180`, `ui/signalInvestigationPrompt.js:150` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:317` | `systems/scanner.js:835` |
| `signal:track` | — | `systems/scanner.js:833` |
| `signal:tracked` | `systems/scanner.js:1200` | `systems/presentationOrchestrator.js:181`, `ui/signalInvestigationPrompt.js:151` |
| `sim:jumpGate` | — | `systems/economy.js:829` |
| `sim:pause` | `ui/screenManager.js:403` | `audio/audioSystem.js:1659`, `render/feel.js:1013` |
| `sim:resume` | `ui/screenManager.js:410` | `audio/audioSystem.js:1660` |
| `site:anchored` | `systems/asteroidSites.js:915` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:1846` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:1761` | `audio/audioSystem.js:1681` |
| `site:courierLost` | `systems/asteroidSites.js:1834` | — |
| `site:created` | `systems/asteroidSites.js:853` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1210`, `systems/asteroidSites.js:1294` | — |
| `site:lost` | `systems/asteroidSites.js:1407` | `ui/alerts.js:342` |
| `site:machineInstalled` | `systems/asteroidSites.js:884` | `audio/audioSystem.js:1680`, `ui/alerts.js:341` |
| `site:machineMode` | `systems/asteroidSites.js:1316` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1227` | — |
| `site:machineStatus` | `systems/asteroidSites.js:1702` | `audio/audioSystem.js:1685`, `ui/alerts.js:337` |
| `site:overlayChanged` | `systems/asteroidSites.js:1300` | — |
| `site:podBuilt` | `systems/asteroidSites.js:1650` | — |
| `site:producing` | `systems/asteroidSites.js:1094` | `ui/asteroid/asteroidScreen.js:1670` |
| `site:rematerialized` | `systems/asteroidSites.js:1452` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1012` | `ui/asteroid/asteroidScreen.js:1655` |
| `site:surveyComplete` | `systems/asteroidSites.js:955` | `ui/asteroid/asteroidScreen.js:1649` |
| `site:surveyDetected` | `systems/asteroidSites.js:945` | `ui/asteroid/asteroidScreen.js:1642` |
| `spawn:request` | `systems/automation.js:1473` | `systems/world.js:492` |
| `station:berthAssigned` | `systems/stationServices.js:347` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:226` | — |
| `station:exitRequest` | `ui/screenManager.js:543`, `ui/uiRoot.js:1039` | `ui/station/stationApp.js:1115` |
| `station:holding` | `systems/stationServices.js:351` | — |
| `station:moduleGained` | `systems/claims.js:1755` | `systems/factions.js:290` |
| `station:navigate` | `ui/screens/automationPanel.js:1024`, `ui/station/screens/bar.js:539`, `ui/station/screens/bar.js:544`, `ui/station/screens/industry.js:205` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:253` | `render/vfx.js:2067` |
| `station:throughput` | `systems/claims.js:1725` | — |
| `station:yardChanged` | `systems/stationServices.js:502` | — |
| `stationContact:changed` | `systems/stationContacts.js:261`, `systems/stationContacts.js:297`, `systems/stationContacts.js:352`, `systems/stationContacts.js:376` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:221`, `systems/stationContacts.js:393` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:285` | — |
| `story:beatAdvanced` | `systems/missions.js:6581` | `save/saveSystem.js:268`, `systems/story.js:118`, `ui/screens/codex.js:672` |
| `story:elroyResolved` | `systems/missions.js:3995` | `systems/story.js:119` |
| `story:kurtzLedger` | `systems/story.js:1371`, `systems/story.js:1382` | — |
| `story:newGamePlusStarted` | `systems/story.js:1479` | `systems/titles.js:402`, `ui/hudMeta.js:114` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:1407` | — |
| `story:postEndingContinuity` | `systems/story.js:1274` | — |
| `story:postEndingProgress` | `systems/story.js:1244` | `ui/screens/missionLog.js:2057` |
| `story:replayHookUnlocked` | `systems/story.js:1259` | `ui/screens/missionLog.js:2058` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:203` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:202` |
| `story:vergeEvidenceRecorded` | `systems/story.js:1077` | — |
| `story:vergeObserversRevealed` | `systems/story.js:933` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1097` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:190` | — |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:179` | — |
| `stunt:salvageRights` | `systems/stuntGrammar.js:104` | — |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:126` | — |
| `stunt:styleBanked` | `systems/stuntGrammar.js:91` | — |
| `stunt:trickAmended` | — | `systems/bulletTime.js:131`, `systems/titles.js:401` |
| `stunt:trickDetected` | — | `systems/bulletTime.js:130`, `systems/titles.js:400` |
| `surrender:secured` | — | `systems/traffic.js:1273` |
| `surrender:tethered` | — | `systems/traffic.js:1272` |
| `survivorPod:choose` | — | `systems/survivorPod.js:406` |
| `survivorPod:ejected` | `systems/survivorPod.js:554`, `systems/survivorPod.js:654` | `systems/lawSecurity.js:193` |
| `survivorPod:promoted` | `systems/survivorPod.js:886` | — |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:980` | — |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:992` | — |
| `survivorPod:resolved` | `systems/survivorPod.js:820` | — |
| `survivorPod:stripped` | `systems/survivorPod.js:1031` | — |
| `swarm:chain` | — | `systems/survivalResults.js:358`, `ui/survivalHud.js:177` |
| `swarm:chainBest` | — | `systems/survivalResults.js:371` |
| `swarm:chainBroken` | — | `ui/survivalHud.js:178` |
| `tech:researched` | `systems/ships.js:1716` | `audio/audioSystem.js:1564`, `systems/onboarding.js:468`, `systems/ships.js:1332` |
| `tether:attached` | `combat/attachments.js:365` | `audio/audioSystem.js:1616`, `render/vfx.js:2014`, `systems/encounterDirector.js:239`, `systems/presentationOrchestrator.js:90`, `systems/scenarioRuntime.js:24`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:321`, `systems/tetherGameplay.js:1119` | `careers/origins/prospectorOrigin.js:645`, `systems/onboarding.js:351`, `systems/onboarding.js:367`, `systems/surrenderRecovery.js:69` |
| `tether:broken` | `combat/attachments.js:483` | `audio/audioSystem.js:1607`, `render/feel.js:1180`, `render/vfx.js:2017`, `systems/presentationOrchestrator.js:98`, `systems/scenarioRuntime.js:28`, `systems/tetherGameplay.js:208` |
| `tether:cut` | `systems/tetherGameplay.js:1704` | `systems/masslineThrow.js:74`, `systems/onboarding.js:366`, `systems/onboarding.js:386` |
| `tether:cutDenied` | `systems/tetherGameplay.js:1697` | — |
| `tether:latchDenied` | `systems/masslineSnares.js:549`, `systems/tetherGameplay.js:251`, `systems/tetherGameplay.js:411`, `systems/tetherGameplay.js:454`, `systems/tetherGameplay.js:459`, `systems/tetherGameplay.js:469`, `systems/tetherGameplay.js:487`, `systems/tetherGameplay.js:834` | `testing/lab/proofSixtySeconds.js:953`, `ui/masslineHud.js:373` |
| `tether:latched` | `systems/tetherGameplay.js:507` | `careers/origins/prospectorOrigin.js:642`, `systems/flightV3.js:155`, `systems/lawSecurity.js:201`, `systems/missions.js:867`, `systems/missions.js:893`, `systems/onboarding.js:346`, `systems/onboarding.js:363`, `systems/onboarding.js:376`, `systems/onboarding.js:384`, `systems/onboarding.js:499`, `systems/onboarding.js:509`, `systems/surrenderRecovery.js:66`, `systems/survivorPod.js:412`, `testing/lab/proofSixtySeconds.js:954`, `ui/prompts/bulkHaulTag.js:144` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1398` | — |
| `tether:nearBreak` | `combat/attachments.js:825` | `audio/audioSystem.js:1628`, `systems/onboarding.js:352`, `systems/presentationOrchestrator.js:91` |
| `tether:rebound` | `combat/attachments.js:761` | — |
| `tether:reel` | `combat/attachments.js:417` | `audio/audioSystem.js:1605`, `systems/missions.js:863`, `systems/onboarding.js:349`, `systems/onboarding.js:364`, `systems/surrenderRecovery.js:67` |
| `tether:reelPump` | `systems/masslineTelemetry.js:247` | — |
| `tether:releaseRated` | `systems/tetherGameplay.js:322`, `systems/tetherGameplay.js:1117`, `systems/tetherGameplay.js:1120`, `systems/tetherGameplay.js:1706` | `audio/audioSystem.js:1606`, `render/feel.js:1216`, `render/vfx.js:2016`, `systems/missions.js:868`, `systems/presentationOrchestrator.js:151` |
| `tether:released` | `systems/tetherGameplay.js:1116`, `systems/tetherGameplay.js:1705` | `render/vfx.js:2015`, `systems/onboarding.js:350`, `systems/onboarding.js:365`, `systems/onboarding.js:385`, `systems/surrenderRecovery.js:68` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:325` | — |
| `tether:strain` | `systems/tetherGameplay.js:1452` | `audio/audioSystem.js:1621` |
| `tether:whipImpact` | `systems/masslineImpacts.js:302` | `render/feel.js:1241`, `systems/collisionConsequences.js:57`, `systems/combat.js:469`, `systems/masslineImpactDamage.js:41`, `systems/missions.js:869`, `systems/onboarding.js:368`, `systems/onboarding.js:387`, `systems/presentationOrchestrator.js:127`, `systems/tumbleStates.js:63` |
| `tether:whipSnap` | `systems/tetherGameplay.js:1739` | — |
| `title:holdResolved` | — | `systems/titles.js:394` |
| `touch:uiAction` | `systems/touch.js:457` | `ui/input.js:691` |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:1513` |
| `traffic:passengerLinerReceipt` | `systems/traffic.js:3126` | — |
| `traffic:passengerLinerSuspended` | `systems/traffic.js:9323` | — |
| `traffic:richSeamHelpReserved` | `systems/traffic.js:8003` | — |
| `traffic:spillNoticed` | `systems/traffic.js:5201` | — |
| `tutorial:finished` | `systems/onboarding.js:992` | `systems/achievements.js:789`, `systems/missions.js:779`, `systems/presentationAdapters.js:170`, `systems/story.js:127` |
| `tutorial:say` | `systems/onboarding.js:690` | `systems/story.js:133` |
| `ui:abandonMission` | `ui/screens/missionLog.js:1959` | `systems/missions.js:788` |
| `ui:acceptMission` | `ui/station/screens/bar.js:477`, `ui/station/screens/contracts.js:632` | `systems/missions.js:787` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:2491` | `systems/ships.js:1369` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `careers/origins/haulerOriginSystem.js:88`, `systems/economy.js:772` |
| `ui:buyModule` | `ui/station/screens/shipworks.js:2783` | `systems/onboarding.js:463`, `systems/ships.js:1362` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:2582` | `systems/ships.js:1360` |
| `ui:cancel` | `ui/input.js:938`, `ui/input.js:952` | — |
| `ui:click` | — | `audio/audioSystem.js:1695` |
| `ui:closeAll` | `main.js:749`, `ui/screens/crucible.js:1923` | `ui/uiRoot.js:904` |
| `ui:closeCargo` | `ui/input.js:222`, `ui/input.js:311` | `ui/hud.js:3471` |
| `ui:closeComms` | `ui/input.js:306` | — |
| `ui:closeScreen` | — | `ui/uiRoot.js:898` |
| `ui:confirm` | `ui/input.js:946` | `audio/audioSystem.js:1697` |
| `ui:cycleComponent` | `ui/targetPanel.js:409`, `ui/targetPanel.js:413` | `ui/uiRoot.js:909` |
| `ui:cycleTarget` | `ui/input.js:345`, `ui/input.js:999` | `ui/uiRoot.js:905` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:2522` | `systems/ships.js:1370` |
| `ui:deny` | — | `audio/audioSystem.js:1698` |
| `ui:endgameChoose` | `systems/missions.js:2369`, `ui/station/barContacts.js:712` | `systems/story.js:146` |
| `ui:endgameConfirm` | — | `systems/story.js:147` |
| `ui:endgameDecline` | `ui/comms.js:436` | `systems/story.js:148` |
| `ui:endgameDepartAshfall` | `ui/comms.js:453` | `systems/story.js:152` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:1809` | `systems/story.js:149` |
| `ui:endgameStayAshfall` | `ui/comms.js:454` | `systems/story.js:153` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:1813` | `systems/story.js:150` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:151` |
| `ui:entityRoute` | `ui/entityLinks.js:196` | — |
| `ui:factionPresenceService` | — | `systems/factionPresence.js:407` |
| `ui:fitModule` | — | `systems/onboarding.js:460`, `systems/ships.js:1363` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:1070` | `systems/automation.js:535`, `systems/wingmen.js:59` |
| `ui:heliosBay7Scan` | — | `systems/story.js:176` |
| `ui:hover` | — | `audio/audioSystem.js:1696` |
| `ui:kurtzInteract` | — | `systems/story.js:175` |
| `ui:navigate` | `ui/input.js:926`, `ui/input.js:930`, `ui/input.js:977` | — |
| `ui:popScreen` | `ui/galaxyMap.js:2470`, `ui/screens/achievements.js:126`, `ui/screens/automationPanel.js:516`, `ui/screens/credits.js:112`, `ui/screens/crucible.js:1070`, `ui/screens/crucibleDraft.js:445`, `ui/screens/starmap.js:618`, `ui/screens/techTree.js:762` | `ui/uiRoot.js:894` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:461` | `systems/world.js:495` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:530` | `systems/world.js:494` |
| `ui:pushScreen` | `main.js:357`, `systems/story.js:1057`, `ui/mapAuthority.js:133`, `ui/screens/crucible.js:1924`, `ui/screens/crucibleDraft.js:213`, `ui/screens/gameOver.js:277`, `ui/screens/starmap.js:626`, `ui/signalInvestigationPrompt.js:146`, `ui/station/barContacts.js:447`, `ui/station/screens/bar.js:494`, `ui/station/stationApp.js:499` | `ui/uiRoot.js:871` |
| `ui:replaceScreen` | `ui/screens/crucible.js:1893`, `ui/screens/crucible.js:1915` | `ui/uiRoot.js:903` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:2463` | `systems/ships.js:1368` |
| `ui:screenTop` | `ui/screenManager.js:255` | `ui/kit/temperature.js:46` |
| `ui:sell` | — | `careers/origins/haulerOriginSystem.js:89`, `systems/economy.js:773` |
| `ui:service` | `balance/careerCohorts.js:700`, `balance/courierPublicRoute.js:296`, `balance/hunterPublicRoute.js:386`, `balance/prospectorPublicRoute.js:297`, `ui/station/stationApp.js:830`, `ui/station/stationApp.js:866` | `systems/economy.js:826` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:2587`, `ui/station/screens/shipworks.js:2674` | `systems/ships.js:1361` |
| `ui:setCourse` | `systems/factionPresence.js:1028`, `systems/missions.js:2870`, `systems/scanner.js:1199`, `ui/galaxyMap.js:2140`, `ui/galaxyMap.js:2152`, `ui/galaxyMap.js:6692`, `ui/market/tradeLogic.js:485`, `ui/screens/footprint.js:1129`, `ui/screens/footprint.js:1140`, `ui/screens/localmap.js:730`, `ui/screens/starmap.js:1449`, `ui/screens/starmap.js:1462`, `ui/screens/starmap.js:1466` | `systems/world.js:460` |
| `ui:setShipAppearance` | — | `systems/ships.js:1372` |
| `ui:talkContact` | — | `systems/story.js:177` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:45`, `combat/autoTargetMode.js:205` | `ui/uiRoot.js:910` |
| `ui:toggleCargo` | `ui/input.js:408` | `ui/hud.js:3470` |
| `ui:toggleComms` | `ui/input.js:425` | — |
| `ui:toggleOverview` | `ui/input.js:412` | `ui/hud.js:3923` |
| `ui:trackMission` | `ui/galaxyMap.js:3837`, `ui/screens/missionLog.js:1805`, `ui/screens/missionLog.js:1877`, `ui/screens/missionLog.js:1938`, `ui/station/screens/contracts.js:639` | `systems/missions.js:789` |
| `ui:undock` | — | `ui/input.js:690` |
| `ui:unfitModule` | `ui/station/screens/shipworks.js:2787` | `systems/ships.js:1364` |
| `ui:unlockTech` | `ui/screens/techTree.js:1191` | `systems/ships.js:1371` |
| `ui:wingOrder` | `ui/wingmanRadial.js:194` | `systems/automation.js:536` |
| `ui:wingmanRadial` | `ui/input.js:418` | `ui/wingmanRadial.js:256` |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:309` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:261` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:196` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1253` | `systems/missions.js:916` |
| `uniqueWreck:choose` | `systems/missions.js:3741`, `ui/recoveryEncounterPrompt.js:339` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:674` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:692`, `systems/uniqueWrecks.js:849`, `systems/uniqueWrecks.js:1052` | `systems/missions.js:917` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1313` | `systems/missions.js:919`, `ui/recoveryEncounterPrompt.js:473` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:911` | `systems/missions.js:918` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:941` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:441`, `systems/uniqueWrecks.js:851` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:1489` | `systems/missions.js:920`, `ui/recoveryEncounterPrompt.js:474` |
| `uniqueWreck:rumorHeard` | `ui/station/screens/bar.js:510` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:548` | `systems/missions.js:915` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:1490` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1232` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1420` | — |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:382` | `systems/missions.js:853`, `ui/bandHud.js:86` |
| `verb:used` | `systems/onboarding.js:2418` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:4579` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:359` | `systems/world.js:470` |
| `vestaOreCache:clueRecovered` | `systems/world.js:4400` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:4431` | `ui/recoveryEncounterPrompt.js:475` |
| `vestaOreCache:pickupReady` | `systems/world.js:4542` | — |
| `vestaOreCache:resolved` | `systems/world.js:4499` | `ui/recoveryEncounterPrompt.js:476` |
| `voice:clear` | `ui/voiceArbiter.js:359`, `ui/voiceArbiter.js:403` | `ui/alerts.js:322` |
| `voice:dismiss` | — | `ui/voiceArbiter.js:317` |
| `voice:say` | `systems/achievements.js:652`, `systems/survivalAnnounce.js:326`, `ui/alerts.js:221` | `ui/voiceArbiter.js:316` |
| `voice:surface` | `ui/voiceArbiter.js:364`, `ui/voiceArbiter.js:413` | `systems/barkDirector.js:200`, `ui/alerts.js:321` |
| `weapons:inertialShunt` | `systems/weapons.js:241` | — |
| `weapons:mineArmed` | `systems/weapons.js:1247` | — |
| `weapons:mineDeployed` | `systems/weapons.js:1204` | — |
| `weapons:mineDetonated` | `systems/weapons.js:1377` | — |
| `weapons:mineExpired` | `systems/weapons.js:1241` | — |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:221` | — |
| `weapons:momentumSinkReleased` | `systems/weapons.js:908` | — |
| `weapons:vent` | `systems/weapons.js:456`, `systems/weapons.js:476` | `audio/audioSystem.js:1543`, `render/shipMicroMotion.js:498`, `render/vfx.js:2066`, `systems/ships.js:1416`, `ui/hud.js:3537` |
| `web:linked` | `combat/tetherWebs.js:95` | — |
| `well:capture` | `systems/fields.js:1601` | — |
| `well:fling` | `systems/fields.js:1535` | — |
| `well:grind` | `systems/fields.js:1339` | `systems/impulseCharges.js:224` |
| `wingMorale:broken` | `systems/wingMorale.js:257` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:342` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:369` | — |
| `wingOrder:accepted` | `systems/automation.js:1948` | `systems/wingmen.js:60` |
| `wingOrder:blocked` | `systems/automation.js:1949` | — |
| `wingOrder:converted` | `systems/wingmen.js:310` | — |
| `wingOrder:status` | `systems/automation.js:1950` | — |
| `world:abortJumpCharge` | `systems/story.js:712`, `ui/comms.js:445` | `systems/world.js:457` |
| `world:confirmUnfiledJump` | `systems/story.js:151` | `systems/world.js:456` |
| `world:criticalSpawnDeferred` | `systems/world.js:1338`, `systems/world.js:2794` | — |
| `world:farActorRestored` | `world/farActorTable.js:531` | `systems/npcJobsRuntime.js:660`, `systems/traffic.js:1261` |
| `world:farActorShelved` | `world/farActorTable.js:509` | `systems/npcJobsRuntime.js:659`, `systems/traffic.js:1260` |
| `world:membership` | `systems/world.js:767` | `systems/presentationOrchestrator.js:170` |
| `world:originShift` | `systems/world.js:3532` | — |
| `world:playerRelocated` | `systems/world.js:2940` | `render/vfx.js:2054` |
| `world:requestJump` | `systems/story.js:696`, `ui/galaxyMap.js:2138`, `ui/screens/starmap.js:1461` | `systems/world.js:454` |
| `world:requestRoute` | `ui/galaxyMap.js:2150`, `ui/galaxyMap.js:3854`, `ui/galaxyMap.js:6690`, `ui/screens/starmap.js:1448`, `ui/screens/starmap.js:1465` | `systems/world.js:458` |
| `world:requestSectorScan` | — | `systems/world.js:459` |
| `world:requestUnfiledJump` | `systems/story.js:664` | `systems/world.js:455` |
| `world:residency` | `systems/world.js:911`, `systems/world.js:944`, `systems/world.js:1519` | — |
| `world:spawnLimited` | `systems/world.js:2730` | — |
| `world:zoneEntered` | `systems/world.js:3559` | `data/hazardLanguage.js:131` |
| `world:zoneExited` | `systems/world.js:3562` | `data/hazardLanguage.js:132` |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:541` | `systems/presentationOrchestrator.js:235` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:495` | `systems/presentationOrchestrator.js:236`, `systems/traffic.js:1338` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:1628` | — |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:1392` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:1556` | `systems/npcJobsRuntime.js:690` |
| `wreckField:source` | `systems/factionPresence.js:604`, `systems/salvage.js:350`, `systems/uniqueWrecks.js:1149` | `systems/aftermathWrecks.js:695` |

## Events with no emitter (likely dead, or emitted dynamically)

- `aceMemory:transition` — 2 subscriber(s)
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
- `heat:clear` — 1 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
- `hud:slotClaim` — 1 subscriber(s)
- `hud:slotRelease` — 1 subscriber(s)
- `law:custodyTransfer` — 1 subscriber(s)
- `law:dispatchStarted` — 1 subscriber(s)
- `law:impoundPay` — 1 subscriber(s)
- `law:impoundPosted` — 1 subscriber(s)
- `law:impoundRecovered` — 2 subscriber(s)
- `law:impoundWorked` — 1 subscriber(s)
- `law:incidentOpened` — 1 subscriber(s)
- `law:reportIncidentReceipt` — 2 subscriber(s)
- `law:wantedCheckpointBroken` — 1 subscriber(s)
- `law:wantedWarrantPosted` — 1 subscriber(s)
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
- `bombs:commanded` — 1 emitter(s)
- `bombs:cycle` — 1 emitter(s)
- `bombs:denied` — 1 emitter(s)
- `bombs:primed` — 1 emitter(s)
- `bombs:released` — 1 emitter(s)
- `boss:defeated` — 1 emitter(s)
- `bounty:cleared` — 1 emitter(s)
- `buildIdentity:revealed` — 1 emitter(s)
- `camera:kill` — 2 emitter(s)
- `camera:shake` — 16 emitter(s)
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
- `cloak:dropped` — 1 emitter(s)
- `combat:actionCancelled` — 1 emitter(s)
- `combat:actionCompleted` — 1 emitter(s)
- `combat:actionPhase` — 1 emitter(s)
- `combat:kill` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `combat:statusExpired` — 1 emitter(s)
- `comms:message` — 1 emitter(s)
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
- `difficulty:pinReleased` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `distress:call` — 1 emitter(s)
- `dock:denied` — 1 emitter(s)
- `economy:demandShift` — 1 emitter(s)
- `economy:salvageIntakeApplied` — 1 emitter(s)
- `economy:sinkCharged` — 1 emitter(s)
- `economy:tradeFailed` — 2 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:namedCaptainDefeated` — 2 emitter(s)
- `encounter:predationCleared` — 1 emitter(s)
- `encounter:predationEngaged` — 1 emitter(s)
- `encounter:predationTelegraph` — 1 emitter(s)
- `encounter:stale` — 1 emitter(s)
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
- `firsthour:milestone` — 1 emitter(s)
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
- `massline:releaseCancelled` — 1 emitter(s)
- `massline:releaseWindow` — 1 emitter(s)
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
- `nemesis:encounterRejected` — 1 emitter(s)
- `nemesis:encounterStarted` — 1 emitter(s)
- `nemesis:escaped` — 1 emitter(s)
- `nemesis:spare` — 1 emitter(s)
- `news:dockCards` — 1 emitter(s)
- `news:headline` — 7 emitter(s)
- `news:publish` — 8 emitter(s)
- `news:render` — 1 emitter(s)
- `npcjobs:minerRelocated` — 1 emitter(s)
- `onboarding:rangePrompt` — 2 emitter(s)
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
- `ship:massChanged` — 1 emitter(s)
- `ship:sold` — 1 emitter(s)
- `ship:swingDash` — 1 emitter(s)
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
- `world:residency` — 3 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
- `wreckEcology:decayed` — 1 emitter(s)
- `wreckEcology:seeded` — 1 emitter(s)
