# Event Routing Map — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for
> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:
> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and
> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).
> This is a static source index: dynamic names, bus taps, and consumers in scripts or tests
> are not listed. A missing endpoint does not establish that an event is unused.
>
> Generated: 2026-11-20 · 2149 events · 7590 routing sites.

## By event (alphabetical)

| Event | Emitters (file:line) | Subscribers (file:line) |
|---|---|---|
| `aceMemory:transition` | — | `systems/claims.js:368`, `systems/encounterDirector.js:405`, `ui/discoveryPlate.js:207` |
| `achievement:unlocked` | — | `audio/audioSystem.js:3201` |
| `aftermath:causeExhausted` | `systems/aftermathWrecks.js:2582` | — |
| `aftermath:causeRecorded` | `systems/aftermathWrecks.js:930` | — |
| `aftermath:custodyFreight` | `systems/aftermathWrecks.js:2468` | — |
| `aftermath:custodySurvivor` | `systems/aftermathWrecks.js:2480` | — |
| `aftermath:remedied` | `systems/aftermathWrecks.js:2561` | — |
| `aftermathWreck:completed` | `systems/aftermathWrecks.js:2956`, `systems/aftermathWrecks.js:2968` | `systems/combatOutcome.js:266`, `systems/missions.js:736` |
| `aftermathWreck:recorded` | `systems/aftermathWrecks.js:995` | `render/vfx.js:2998`, `systems/missions.js:735`, `systems/salvage.js:161` |
| `aftermathWreck:retired` | `systems/aftermathWrecks.js:1821`, `systems/aftermathWrecks.js:2351`, `systems/aftermathWrecks.js:2362` | `systems/combatOutcome.js:267`, `systems/missions.js:737`, `ui/galaxyMap.js:2165` |
| `aftermathWreck:siteUnavailable` | `systems/aftermathWrecks.js:2039` | — |
| `aftermathWreck:spawned` | `systems/aftermathWrecks.js:2684` | `systems/alienEcology.js:424`, `systems/dyingHull.js:183`, `systems/lawSecurity.js:424`, `systems/salvage.js:162` |
| `ai:counterTether` | `ai/sg03ActionPort.js:386` | `systems/presentationOrchestrator.js:172` |
| `ai:doctrinePhase` | `systems/tacticalAI.js:802`, `systems/tacticalAI.js:852` | `systems/presentationOrchestrator.js:173`, `systems/scissorwake.js:81`, `systems/tetherGameplay.js:376`, `ui/threatHalo.js:927` |
| `ai:egressExit` | `ai/egressExit.js:111`, `systems/missionStoryOps.js:1315` | — |
| `ai:encounterCommand` | `systems/aiPorts.js:401` | — |
| `ai:flee` | `systems/tacticalAI.js:344`, `systems/trafficRoleOps.js:498`, `systems/wingMorale.js:331` | `render/authoredMotion.js:1195`, `render/vfx.js:3094`, `systems/barkDirector.js:877`, `systems/combatOutcome.js:260`, `systems/encounterDirector.js:443`, `systems/presentationOrchestrator.js:174` |
| `ai:formationBroken` | `systems/wingMorale.js:281` | `render/vfx.js:3095` |
| `ai:mayday` | `ai/shovePanic.js:72` | — |
| `ai:reinforcementScheduled` | — | `systems/barkDirector.js:879` |
| `ai:stateChange` | — | `render/authoredMotion.js:1212`, `systems/combatOutcome.js:298` |
| `ai:telegraph` | `ai/counterplay/live.js:138`, `systems/encounterScripts.js:173`, `systems/encounterScripts.js:1223`, `systems/encounterScripts/weirAmbush.js:256`, `systems/masslineSnares.js:347`, `systems/mines.js:207`, `systems/tacticalAI.js:135`, `systems/tacticalAI.js:171`, `systems/tacticalAI.js:829`, `systems/tacticalAI.js:1027` | `audio/audioSystem.js:3157`, `render/authoredMotion.js:1194`, `render/vfx.js:3093`, `systems/presentationOrchestrator.js:171`, `systems/scissorwake.js:74`, `systems/survivalResults.js:536`, `ui/survivalHud.js:398`, `ui/threatHalo.js:923` |
| `ai:ventPress` | `ai/ventPress.js:153` | — |
| `aiTrader:requestTrade` | `systems/trafficEscortOps.js:170` | `systems/economy.js:1859` |
| `alienEcology:blackBoxRecovered` | `systems/world.js:933` | `systems/world.js:904` |
| `alienEcology:cystRupture` | `systems/alienEcology.js:1468` | — |
| `alienEcology:lureDropped` | `systems/impulseCharges.js:1244` | `systems/world.js:912` |
| `alienEcology:nurseryBloom` | — | `systems/world.js:902` |
| `alienEcology:nurseryPowered` | — | `systems/world.js:900` |
| `alienEcology:relaySevered` | — | `systems/world.js:901` |
| `alienEcology:relocateSite` | — | `systems/world.js:903` |
| `alienEcology:vented` | `systems/alienEcology.js:2493` | — |
| `ambientComms:register` | `systems/e1EncounterRuntime.js:114`, `systems/economyContracts.js:787` | `systems/story.js:179` |
| `ambientComms:toneChanged` | `systems/e1EncounterRuntime.js:289` | `systems/story.js:180` |
| `ambush:clauseDecided` | `systems/encounterDirector.js:1115` | — |
| `ambush:clauseFired` | `systems/encounterDirector.js:1308` | — |
| `anomaly:bearing` | `systems/scanner.js:1439` | `systems/presentationOrchestrator.js:208` |
| `anomaly:triangulated` | `systems/scanner.js:1457` | `systems/world.js:802` |
| `archive:amnesty` | `systems/faction_archive.js:1227`, `systems/faction_archive.js:1578` | — |
| `archive:annotated` | `systems/faction_archive.js:1546` | — |
| `archive:cited` | `systems/faction_archive.js:726` | — |
| `archive:copyPublished` | `systems/faction_archive.js:1070` | — |
| `archive:copySuppressed` | `systems/faction_archive.js:1191` | — |
| `archive:courierArrived` | `systems/faction_archive.js:1669` | — |
| `archive:courierHail` | `systems/faction_archive.js:1661` | — |
| `archive:courierSpawn` | `systems/faction_archive.js:1736` | — |
| `archive:deskRefused` | `systems/faction_archive.js:1039` | — |
| `archive:errandExpired` | `systems/faction_archive.js:1262`, `systems/faction_archive.js:1282`, `systems/faction_archive.js:1446` | — |
| `archive:errandPosted` | `systems/faction_archive.js:1364`, `systems/faction_archive.js:1387` | — |
| `archive:errandSettled` | `systems/faction_archive.js:1413` | — |
| `archive:expunged` | `systems/faction_archive.js:1552`, `systems/faction_archive.js:1574` | — |
| `archive:fieldCastSpawn` | `systems/faction_archive.js:1836` | — |
| `archive:fileCirculated` | `systems/faction_archive.js:1494`, `systems/faction_archive.js:1520` | — |
| `archive:folioBought` | `systems/faction_archive.js:1123` | — |
| `archive:folioRecovered` | `systems/faction_archive.js:1293` | — |
| `archive:indexFiled` | `systems/faction_archive.js:1012` | — |
| `archive:indexRead` | `systems/faction_archive.js:964` | — |
| `archive:logCopied` | `systems/faction_archive.js:930` | — |
| `archive:markForgiven` | `systems/faction_archive.js:1565` | — |
| `archive:marked` | `systems/faction_archive.js:1543` | — |
| `archive:penance` | `systems/faction_archive.js:1217` | — |
| `archive:redacted` | `systems/faction_archive.js:848` | — |
| `archive:redactionLifted` | `systems/faction_archive.js:862` | — |
| `archive:suppressOffered` | `systems/faction_archive.js:1150` | — |
| `archive:tier` | `systems/faction_archive.js:706` | — |
| `asset:deployed` | `systems/automation.js:2829`, `systems/automation.js:2906`, `systems/automation.js:2929`, `systems/automation.js:3070`, `systems/claims.js:569` | `systems/missions.js:990`, `systems/onboarding.js:991`, `systems/story.js:270` |
| `asteroid:chunked` | `systems/environmentMaterials.js:337`, `systems/mining.js:2680` | `audio/audioSystem.js:2978`, `render/asteroidMotionPresentation.js:525`, `render/authoredMotion.js:1210`, `render/vfx.js:3039`, `systems/presentationOrchestrator.js:221` |
| `asteroid:destroyed` | `balance/prospectorPublicRoute.js:517`, `systems/automation.js:1239`, `systems/mining.js:1310` | `audio/audioSystem.js:2974`, `render/authoredMotion.js:1209`, `render/vfx.js:3037`, `systems/asteroidFormations.js:131`, `systems/environmentalMachinery.js:285`, `systems/fieldDepletion.js:755`, `ui/prompts/bulkHaulTag.js:147` |
| `audio:cue` | `features/breakwaterSpur/presentation.js:117`, `features/industrialDisasters/presentation.js:126`, `features/salvageTender/presentation.js:64`, `features/shipbreakingYard/audio.js:28`, `matter/collectorKnot.js:155`, `matter/collectorKnot.js:178`, `matter/collectorKnot.js:363`, `matter/collectorKnot.js:410`, `render/feel.js:633`, `render/shipMicroMotion.js:2770`, `render/trailerStaging.js:13`, `render/vfx.js:3122`, `render/vfx.js:6057`, `render/vfx.js:10757`, `render/vfx/tetherCableEventMethods.js:338`, `systems/alienEcology.js:789`, `systems/asteroidSites.js:3653`, `systems/barkDirector.js:2055`, `systems/barkDirector.js:2109`, `systems/barkDirector.js:2318`, `systems/beacons.js:77`, `systems/beacons.js:82`, `systems/beacons.js:94`, `systems/bellhop.js:198`, `systems/blindWelderRuntime.js:161`, `systems/bombs.js:1234`, `systems/bombs.js:1365`, `systems/bombs.js:1757`, `systems/bracket.js:125`, `systems/bulletTime.js:216`, `systems/bulletTime.js:234`, `systems/bulletTime.js:314`, `systems/cargo.js:1299`, `systems/cargo.js:1322`, `systems/claims.js:416`, `systems/claims.js:501`, `systems/claims.js:546`, `systems/claims.js:1594`, `systems/claims.js:1714`, `systems/claims.js:2454`, `systems/cloak.js:201`, `systems/cloak.js:241`, `systems/countermeasures.js:559`, `systems/countermeasures.js:595`, `systems/crafting.js:352`, `systems/crafting.js:362`, `systems/crafting.js:384`, `systems/discoverySound.js:25`, `systems/docket.js:158`, `systems/eighthBellRuntime.js:122`, `systems/eighthBellRuntime.js:137`, `systems/environmentalMachinery.js:1689`, `systems/fields.js:872`, `systems/fields.js:1456`, `systems/fields.js:1620`, `systems/fields.js:1904`, `systems/flybyFocus.js:572`, `systems/glueMeetMassRuntime.js:119`, `systems/gyreSnare.js:531`, `systems/gyreSnare.js:1237`, `systems/gyreSnare.js:1609`, `systems/gyreSnare.js:1642`, `systems/gyreSnare.js:2017`, `systems/gyreSnare.js:2130`, `systems/gyreSnare.js:2212`, `systems/gyreSnare.js:2447`, `systems/gyreSnare.js:2472`, `systems/gyreSnare.js:2487`, `systems/gyreSnare.js:2500`, `systems/gyreSnare.js:2529`, `systems/gyreSnare.js:2560`, `systems/gyreSnare.js:2665`, `systems/gyreSnare.js:2684`, `systems/gyreSnare.js:2700`, `systems/gyreSnare.js:2738`, `systems/gyreSnare.js:2747`, `systems/gyreSnare.js:2769`, `systems/gyreSnare.js:2871`, `systems/gyreSnare.js:2951`, `systems/gyreSnare.js:2961`, `systems/gyreSnare.js:3005`, `systems/heroManeuvers.js:449`, `systems/heroManeuvers.js:489`, `systems/heroManeuvers.js:735`, `systems/heroManeuvers.js:745`, `systems/hullBurst.js:238`, `systems/hullBurst.js:401`, `systems/hullBurst.js:432`, `systems/hullBurst.js:546`, `systems/hullBurst.js:618`, `systems/hullFracture.js:605`, `systems/hullFracture.js:747`, `systems/impulseCharges.js:693`, `systems/impulseCharges.js:800`, `systems/impulseCharges.js:1021`, `systems/impulseCharges.js:1058`, `systems/impulseCharges.js:1258`, `systems/impulseCharges.js:1447`, `systems/jettisonImpulse.js:78`, `systems/lineHeads.js:233`, `systems/machineWork.js:214`, `systems/machineWork.js:264`, `systems/machineWork.js:323`, `systems/machineWork.js:399`, `systems/machineWork.js:481`, `systems/massSeed.js:185`, `systems/massSeed.js:560`, `systems/massSeed.js:606`, `systems/masslineThrow.js:350`, `systems/masslineThrow.js:724`, `systems/masslineThrow.js:812`, `systems/masslineThrow.js:838`, `systems/mining.js:1015`, `systems/mining.js:2768`, `systems/morrow.js:201`, `systems/phaseBlink.js:193`, `systems/phaseBlink.js:338`, `systems/plants/afterHoursCoach.js:404`, `systems/plants/anselsDish.js:162`, `systems/plants/badMagnetPlant.js:150`, `systems/plants/borrowedBoost.js:345`, `systems/plants/borrowedLadder.js:151`, `systems/plants/brokenTollPlant.js:306`, `systems/plants/broodShortcutPlant.js:133`, `systems/plants/busDoesntMove.js:391`, `systems/plants/carriedWord.js:370`, `systems/plants/chalkSeat.js:139`, `systems/plants/chasedThiefPlant.js:359`, `systems/plants/coatRack.js:158`, `systems/plants/coffeeHatch.js:149`, `systems/plants/convoyGodmother.js:371`, `systems/plants/coveredWindow.js:171`, `systems/plants/crowdCoinPlant.js:133`, `systems/plants/crowdCoinPlant.js:221`, `systems/plants/crowdCoinPlant.js:234`, `systems/plants/crowdCoinPlant.js:251`, `systems/plants/darkStretchPlant.js:339`, `systems/plants/deadLane.js:253`, `systems/plants/deadStickPlant.js:275`, `systems/plants/dingPlant.js:82`, `systems/plants/doorstop.js:273`, `systems/plants/doorstop.js:290`, `systems/plants/dutchAfterYou.js:103`, `systems/plants/dutchAfterYou.js:203`, `systems/plants/emptyBerthPlant.js:381`, `systems/plants/farBerth.js:282`, `systems/plants/farePool.js:159`, `systems/plants/figureheadPlant.js:228`, `systems/plants/firstLight.js:362`, `systems/plants/freeForgePlant.js:145`, `systems/plants/freeForgePlant.js:175`, `systems/plants/gateGawkerPlant.js:195`, `systems/plants/glassPays.js:142`, `systems/plants/glassPays.js:148`, `systems/plants/glassPays.js:176`, `systems/plants/goodPatch.js:80`, `systems/plants/goodPatch.js:128`, `systems/plants/goodWord.js:184`, `systems/plants/gullDrone.js:141`, `systems/plants/kidMechanic.js:161`, `systems/plants/lanternLoan.js:141`, `systems/plants/litter.js:151`, `systems/plants/loanerGunPlant.js:99`, `systems/plants/looseBolts.js:157`, `systems/plants/magpieReads.js:136`, `systems/plants/mascotPlant.js:257`, `systems/plants/medicMulePlant.js:223`, `systems/plants/medicMulePlant.js:251`, `systems/plants/mercies/pl269KindnessLocker.js:245`, `systems/plants/mercies/pl270StashedMedal.js:187`, `systems/plants/mercies/pl270StashedMedal.js:268`, `systems/plants/mercies/pl271MapInTheLid.js:303`, `systems/plants/mercies/pl271MapInTheLid.js:376`, `systems/plants/mercies/pl272ForwardBeacon.js:232`, `systems/plants/mercies/pl272ForwardBeacon.js:310`, `systems/plants/mercies/pl364KindnessLedger.js:251`, `systems/plants/mercies/pl365LampGarden.js:175`, `systems/plants/mercies/pl365LampGarden.js:275`, `systems/plants/mercies/pl366RegistryHatch.js:210`, `systems/plants/mercies/pl366RegistryHatch.js:259`, `systems/plants/mercies/pl367LingeringLift.js:262`, `systems/plants/mercies/pl368ThankYouSlate.js:202`, `systems/plants/mercies/pl368ThankYouSlate.js:212`, `systems/plants/mercies/pl369LastAllowance.js:200`, `systems/plants/mercies/pl369LastAllowance.js:256`, `systems/plants/mercies/pl369LastAllowance.js:351`, `systems/plants/mercies/pl370HousewarmingPart.js:170`, `systems/plants/mercies/pl370HousewarmingPart.js:194`, `systems/plants/mercies/pl371LaneTithe.js:225`, `systems/plants/mercies/pl372WreckersCourtesy.js:189`, `systems/plants/mercies/pl372WreckersCourtesy.js:213`, `systems/plants/mercies/pl373HearthLamp.js:170`, `systems/plants/mistaken.js:216`, `systems/plants/mooringAlarms.js:161`, `systems/plants/movingHousePlant.js:331`, `systems/plants/nightBell.js:153`, `systems/plants/nightlyGhostPlant.js:102`, `systems/plants/onTheCallPlant.js:112`, `systems/plants/oneShotShortPlant.js:122`, `systems/plants/oneYank.js:267`, `systems/plants/oneYank.js:301`, `systems/plants/oneYank.js:307`, `systems/plants/oneYank.js:371`, `systems/plants/openDoorPlant.js:88`, `systems/plants/openHatch.js:353`, `systems/plants/orphanWreck.js:248`, `systems/plants/otherSide.js:263`, `systems/plants/otherSide.js:293`, `systems/plants/outriderPlant.js:275`, `systems/plants/overtimeMug.js:150`, `systems/plants/ownFaultPlant.js:403`, `systems/plants/paperTrail.js:133`, `systems/plants/perspective.js:188`, `systems/plants/pipsCounts.js:228`, `systems/plants/pl104Inventory.js:149`, `systems/plants/pl104Inventory.js:172`, `systems/plants/pl105Standoff.js:151`, `systems/plants/pl106PartsSled.js:122`, `systems/plants/pl107EmptySlot.js:130`, `systems/plants/pl124ParkedLight.js:310`, `systems/plants/pl125UnderPaint.js:105`, `systems/plants/pl126KeepingIt.js:182`, `systems/plants/pl128TheSurge.js:129`, `systems/plants/pl129SomebodysCrate.js:116`, `systems/plants/pl130TheStamp.js:125`, `systems/plants/pl146FirstCaller.js:225`, `systems/plants/pl146FirstCaller.js:261`, `systems/plants/pl148TheCount.js:139`, `systems/plants/pl148TheCount.js:233`, `systems/plants/pl149SeedlingLean.js:172`, `systems/plants/pl151NoPapers.js:149`, `systems/plants/pl151NoPapers.js:257`, `systems/plants/pl152TheTally.js:145`, `systems/plants/pl153TheMinute.js:119`, `systems/plants/pl153TheMinute.js:130`, `systems/plants/pl153TheMinute.js:135`, `systems/plants/pl155FairTrade.js:239`, `systems/plants/pl171RattleInB.js:162`, `systems/plants/pl171RattleInB.js:169`, `systems/plants/pl172ShadeMarket.js:218`, `systems/plants/pl173HesperLight.js:192`, `systems/plants/pl173HesperLight.js:233`, `systems/plants/pl175First.js:211`, `systems/plants/pl178SlingshotHour.js:138`, `systems/plants/pl180ChalkThief.js:116`, `systems/plants/pl181HotCargo.js:122`, `systems/plants/pl182FlagTruce.js:125`, `systems/plants/pl183TheWeather.js:152`, `systems/plants/pl190DroneRange.js:170`, `systems/plants/pl190DroneRange.js:205`, `systems/plants/pl191StormLamps.js:180`, `systems/plants/pl191StormLamps.js:194`, `systems/plants/pl193OneShort.js:194`, `systems/plants/pl196MirrorRock.js:159`, `systems/plants/pl199TheJug.js:123`, `systems/plants/pl200TwoTaps.js:226`, `systems/plants/pl200TwoTaps.js:241`, `systems/plants/pl200TwoTaps.js:272`, `systems/plants/pl201OddQueue.js:187`, `systems/plants/pl201OddQueue.js:225`, `systems/plants/pl202KeptBerth.js:264`, `systems/plants/pl202KeptBerth.js:327`, `systems/plants/pl203TheTour.js:204`, `systems/plants/pl203TheTour.js:236`, `systems/plants/pl203TheTour.js:246`, `systems/plants/pl204TheHook.js:218`, `systems/plants/pl204TheHook.js:297`, `systems/plants/pl205TheLitHull.js:151`, `systems/plants/pl205TheLitHull.js:172`, `systems/plants/pl205TheLitHull.js:197`, `systems/plants/pl214PyrrhaBox.js:233`, `systems/plants/pl215SomebodysStall.js:237`, `systems/plants/pl215SomebodysStall.js:243`, `systems/plants/pl216BlueMinute.js:176`, `systems/plants/pl230VennsWindow.js:262`, `systems/plants/pl231MarshsLine.js:214`, `systems/plants/pl231MarshsLine.js:231`, `systems/plants/pl232TheValidInstruction.js:199`, `systems/plants/pl232TheValidInstruction.js:252`, `systems/plants/pl232TheValidInstruction.js:276`, `systems/plants/pl232TheValidInstruction.js:283`, `systems/plants/pl233TheFreshMark.js:194`, `systems/plants/pl233TheFreshMark.js:214`, `systems/plants/pl234TheMiddleSeat.js:208`, `systems/plants/pl234TheMiddleSeat.js:266`, `systems/plants/pl235CleanWeld.js:200`, `systems/plants/pl236IvesMinute.js:185`, `systems/plants/pl237HonkAtHeat.js:188`, `systems/plants/pl238SeeHim.js:234`, `systems/plants/pl239RowansTap.js:190`, `systems/plants/pl245TheBellsHush.js:181`, `systems/plants/pl245TheBellsHush.js:200`, `systems/plants/pl245TheBellsHush.js:215`, `systems/plants/pl246WallTime.js:284`, `systems/plants/pl246WallTime.js:296`, `systems/plants/pl246WallTime.js:312`, `systems/plants/pl246WallTime.js:322`, `systems/plants/pl247TheScandal.js:249`, `systems/plants/pl247TheScandal.js:264`, `systems/plants/pl252RegularsHour.js:113`, `systems/plants/pl252RegularsHour.js:125`, `systems/plants/pl253WallDent.js:151`, `systems/plants/pl257GutterRun.js:252`, `systems/plants/pl258TowAlong.js:276`, `systems/plants/pl259SpareAndShare.js:216`, `systems/plants/pl259SpareAndShare.js:222`, `systems/plants/pl259SpareAndShare.js:258`, `systems/plants/pl260FiftiethVisit.js:113`, `systems/plants/pl260FiftiethVisit.js:139`, `systems/plants/pl261OpenTank.js:151`, `systems/plants/pl261OpenTank.js:184`, `systems/plants/pl262GatheredPile.js:205`, `systems/plants/pl263LessonAlongside.js:112`, `systems/plants/pl263LessonAlongside.js:147`, `systems/plants/pl264LaneLight.js:199`, `systems/plants/pl266SomebodysSpare.js:123`, `systems/plants/pl266SomebodysSpare.js:170`, `systems/plants/pl267QueuePass.js:214`, `systems/plants/pl267QueuePass.js:228`, `systems/plants/pl268WakeGift.js:195`, `systems/plants/pl333NoQuestionsShelf.js:271`, `systems/plants/pl333NoQuestionsShelf.js:344`, `systems/plants/pl334WindBreakChain.js:274`, `systems/plants/pl334WindBreakChain.js:280`, `systems/plants/pl334WindBreakChain.js:297`, `systems/plants/pl335DawnLine.js:311`, `systems/plants/pl335DawnLine.js:328`, `systems/plants/pl335DawnLine.js:341`, `systems/plants/pl335DawnLine.js:366`, `systems/plants/pl336LampKeeper.js:233`, `systems/plants/pl336LampKeeper.js:249`, `systems/plants/pl337HonorUrn.js:231`, `systems/plants/pl337HonorUrn.js:245`, `systems/plants/pl337HonorUrn.js:259`, `systems/plants/pl338TowPost.js:216`, `systems/plants/pl338TowPost.js:244`, `systems/plants/pl338TowPost.js:253`, `systems/plants/pl339SignalMirror.js:235`, `systems/plants/pl339SignalMirror.js:245`, `systems/plants/pl339SignalMirror.js:265`, `systems/plants/pl340EchoCount.js:226`, `systems/plants/pl340EchoCount.js:251`, `systems/plants/pl340EchoCount.js:259`, `systems/plants/pl341RestringBuoys.js:261`, `systems/plants/pl341RestringBuoys.js:280`, `systems/plants/pl342BleedVent.js:207`, `systems/plants/pl342BleedVent.js:286`, `systems/plants/pl342BleedVent.js:308`, `systems/plants/pl343LiftBell.js:238`, `systems/plants/pl343LiftBell.js:258`, `systems/plants/pl343LiftBell.js:269`, `systems/plants/pl343LiftBell.js:280`, `systems/plants/pl344NeedsList.js:294`, `systems/plants/pl344NeedsList.js:298`, `systems/plants/pl344NeedsList.js:311`, `systems/plants/pl345KettleWindow.js:231`, `systems/plants/pl345KettleWindow.js:251`, `systems/plants/pl345KettleWindow.js:258`, `systems/plants/pl345KettleWindow.js:269`, `systems/plants/pl346FixedRope.js:271`, `systems/plants/pl346FixedRope.js:307`, `systems/plants/pl347SmallHullDrum.js:259`, `systems/plants/pl347SmallHullDrum.js:296`, `systems/plants/pl347SmallHullDrum.js:320`, `systems/plants/pl347SmallHullDrum.js:330`, `systems/plants/pl348SeamKitchen.js:272`, `systems/plants/pl348SeamKitchen.js:280`, `systems/plants/pl348SeamKitchen.js:292`, `systems/plants/pl348SeamKitchen.js:311`, `systems/plants/pl349MercyTug.js:268`, `systems/plants/pl349MercyTug.js:301`, `systems/plants/pl349MercyTug.js:322`, `systems/plants/pl350KeyWall.js:289`, `systems/plants/pl350KeyWall.js:326`, `systems/plants/pl350KeyWall.js:352`, `systems/plants/pl350KeyWall.js:370`, `systems/plants/pl351SamplePad.js:313`, `systems/plants/pl351SamplePad.js:350`, `systems/plants/pl352ChalkedName.js:305`, `systems/plants/pl352ChalkedName.js:324`, `systems/plants/pl353CleanStamp.js:253`, `systems/plants/pl353CleanStamp.js:275`, `systems/plants/pl353CleanStamp.js:290`, `systems/plants/pl354GoodHullRate.js:118`, `systems/plants/pl355TheUnit.js:141`, `systems/plants/pl355TheUnit.js:215`, `systems/plants/pl356ParadeBerth.js:202`, `systems/plants/pl357WarmGrid.js:139`, `systems/plants/pl357WarmGrid.js:155`, `systems/plants/pl358ApprenticesReturn.js:228`, `systems/plants/pl358ApprenticesReturn.js:261`, `systems/plants/pl359EscortsGift.js:226`, `systems/plants/pl359EscortsGift.js:263`, `systems/plants/pl360RainCheck.js:127`, `systems/plants/pl360RainCheck.js:160`, `systems/plants/pl361SecondStart.js:142`, `systems/plants/pl362NameOnPlate.js:215`, `systems/plants/pl362NameOnPlate.js:239`, `systems/plants/pl363FamilyRate.js:235`, `systems/plants/ratRun.js:236`, `systems/plants/ratRun.js:250`, `systems/plants/redAtHome.js:119`, `systems/plants/redMinute.js:107`, `systems/plants/redMinute.js:268`, `systems/plants/reversedRobberyPlant.js:190`, `systems/plants/rungPlant.js:114`, `systems/plants/ruthsKnock.js:148`, `systems/plants/ruthsKnock.js:176`, `systems/plants/ruthsKnock.js:184`, `systems/plants/sameTimeTomorrowPlant.js:340`, `systems/plants/secondChair.js:153`, `systems/plants/seen.js:93`, `systems/plants/sennaReads.js:173`, `systems/plants/shadowPilotPlant.js:309`, `systems/plants/snaggedPod.js:237`, `systems/plants/someonesCourse.js:304`, `systems/plants/spareBed.js:383`, `systems/plants/sponsorshipPlant.js:172`, `systems/plants/stalledStringPlant.js:361`, `systems/plants/stillEvenPlant.js:328`, `systems/plants/surrenderDoorPlant.js:97`, `systems/plants/surrenderDoorPlant.js:115`, `systems/plants/sweepingLine.js:319`, `systems/plants/tapCheerPlant.js:110`, `systems/plants/tapCheerPlant.js:187`, `systems/plants/theArch.js:137`, `systems/plants/theArch.js:144`, `systems/plants/theBrightOne.js:285`, `systems/plants/theBrightOne.js:292`, `systems/plants/theBrightOne.js:332`, `systems/plants/theOldTrail.js:244`, `systems/plants/theSampler.js:147`, `systems/plants/theShelf.js:144`, `systems/plants/theShelf.js:184`, `systems/plants/theWindowThatDoesnt.js:120`, `systems/plants/theWindowThatDoesnt.js:223`, `systems/plants/threeCount.js:117`, `systems/plants/threeCount.js:123`, `systems/plants/threeCount.js:147`, `systems/plants/tickingCratePlant.js:370`, `systems/plants/tipJar.js:137`, `systems/plants/tipLine.js:335`, `systems/plants/twice.js:116`, `systems/plants/twice.js:247`, `systems/plants/twice.js:267`, `systems/plants/twoRopes.js:98`, `systems/plants/twoRopes.js:230`, `systems/plants/twoRopes.js:240`, `systems/plants/twoRopes.js:246`, `systems/plants/umbrellaCrane.js:391`, `systems/plants/veteranSeatPlant.js:99`, `systems/plants/veteranSeatPlant.js:242`, `systems/plants/veteranTapPlant.js:113`, `systems/plants/veteranTapPlant.js:158`, `systems/plants/waitingLinePlant.js:264`, `systems/plants/walkingLunch.js:161`, `systems/plants/waveBackPlant.js:198`, `systems/plants/weldersSparksPlant.js:305`, `systems/plants/windowWarmer.js:155`, `systems/plants/wrongWay.js:251`, `systems/precursorMachines.js:194`, `systems/precursorMachines.js:580`, `systems/precursorMachines.js:670`, `systems/precursorMachines.js:1053`, `systems/precursorMachines.js:1111`, `systems/presentationAdapters.js:322`, `systems/presentationAdapters.js:700`, `systems/presentationOrchestrator.js:561`, `systems/ravel.js:131`, `systems/rubric.js:307`, `systems/ruckus.js:143`, `systems/runawayKilnRuntime.js:190`, `systems/runawayKilnRuntime.js:208`, `systems/ruud.js:553`, `systems/ruud.js:557`, `systems/salvage.js:1091`, `systems/salvage.js:1193`, `systems/salvage.js:1249`, `systems/shieldPylons.js:347`, `systems/shieldPylons.js:367`, `systems/shieldPylons.js:377`, `systems/shipjack.js:91`, `systems/solstice.js:296`, `systems/special500DeathBell.js:87`, `systems/special500ForgeKaraoke.js:87`, `systems/special500Spectacle.js:151`, `systems/stationServices.js:342`, `systems/stationServices.js:611`, `systems/survivorPod.js:1710`, `systems/tacticalAI.js:1171`, `systems/tailgater.js:295`, `systems/tailgater.js:335`, `systems/theBolus.js:362`, `systems/tumbleStates.js:563`, `systems/tumbleStates.js:678`, `systems/twoShipsOneMistakeRuntime.js:193`, `systems/vesper.js:245`, `systems/volatileExposure.js:494`, `systems/volatileExposure.js:568`, `systems/weapons.js:2410`, `systems/weapons.js:2542`, `systems/worldClock.js:142`, `ui/commsRadial.js:542`, `ui/commsRadial.js:582`, `ui/commsRadial.js:596`, `ui/commsRadial.js:823`, `ui/commsRadial.js:866`, `ui/contextWheel.js:274`, `ui/contextWheel.js:276`, `ui/contextWheel.js:298`, `ui/hud.js:2824`, `ui/hud.js:4550`, `ui/hud.js:4588`, `ui/hud.js:4816`, `ui/hud.js:4879`, `ui/hud.js:4926`, `ui/hud.js:4947`, `ui/hud.js:5051`, `ui/hud.js:5193`, `ui/hud.js:5562`, `ui/input.js:381`, `ui/input.js:525`, `ui/input.js:583`, `ui/input.js:607`, `ui/input.js:645`, `ui/input.js:651`, `ui/input.js:680`, `ui/input.js:793`, `ui/input.js:875`, `ui/input.js:882`, `ui/input.js:890`, `ui/input.js:1131`, `ui/input.js:1376`, `ui/input.js:1381`, `ui/input.js:1399`, `ui/input.js:1404`, `ui/input.js:1506`, `ui/input.js:1520`, `ui/input.js:1529`, `ui/input.js:1534`, `ui/input.js:1543`, `ui/input.js:1558`, `ui/input.js:1600`, `ui/input.js:1614`, `ui/input.js:1618`, `ui/input.js:1631`, `ui/kit/sound.js:14`, `ui/lineClassMoment.js:42`, `ui/market/tradeLogic.js:580`, `ui/screens/base.js:592`, `ui/screens/base.js:839`, `ui/screens/missionLog.js:2493`, `ui/screens/missionLog.js:2497`, `ui/screens/missionLog.js:2501`, `ui/screens/missionLog.js:2505`, `ui/screens/missionLog.js:2521`, `ui/screens/missionLog.js:2529`, `ui/screens/missionLog.js:2536`, `ui/screens/missionLog.js:2543`, `ui/screens/missionLog.js:2551`, `ui/screens/missionLog.js:2558`, `ui/screens/missionLog.js:2565`, `ui/screens/missionLog.js:2574`, `ui/screens/missionLog.js:2581`, `ui/screens/missionLog.js:2597`, `ui/screens/missionLog.js:2628`, `ui/screens/missionLog.js:2648`, `ui/shipLedgerPanel.js:255`, `ui/shipLedgerPanel.js:531`, `ui/shipLedgerPanel.js:538`, `ui/station/screens/bar.js:761`, `ui/station/screens/bar.js:880`, `ui/station/screens/bar.js:884`, `ui/station/screens/bar.js:888`, `ui/station/screens/bar.js:910`, `ui/station/screens/bar.js:947`, `ui/station/screens/bar.js:1021`, `ui/station/screens/bar.js:1088`, `ui/station/screens/bar.js:1097`, `ui/station/screens/contracts.js:1534`, `ui/station/screens/contracts.js:1545`, `ui/station/screens/contracts.js:1581`, `ui/station/screens/contracts.js:1584`, `ui/station/screens/contracts.js:1670`, `ui/station/screens/factions.js:429`, `ui/station/screens/industry.js:616`, `ui/station/screens/industry.js:666`, `ui/station/screens/industry.js:703`, `ui/station/screens/industry.js:712`, `ui/station/screens/industry.js:720`, `ui/station/screens/industry.js:726`, `ui/station/screens/industry.js:736`, `ui/station/screens/market.js:1678`, `ui/station/screens/market.js:2519`, `ui/station/screens/market.js:2591`, `ui/station/screens/market.js:2624`, `ui/station/screens/market.js:2640`, `ui/station/screens/market.js:2703`, `ui/station/screens/market.js:2718`, `ui/station/screens/market.js:2911`, `ui/station/screens/shipworks.js:918`, `ui/station/screens/shipworks.js:3890`, `ui/station/screens/shipworks.js:4269`, `ui/station/screens/shipworks.js:4930`, `ui/station/screens/shipworks.js:4989`, `ui/station/screens/shipworks.js:5006`, `ui/station/screens/shipworks.js:5019`, `ui/station/screens/shipworks.js:5023`, `ui/station/screens/shipworks.js:5028`, `ui/station/screens/shipworks.js:5058`, `ui/station/screens/shipworks.js:5076`, `ui/station/screens/shipworks.js:5112`, `ui/station/screens/shipworks.js:5134`, `ui/station/screens/shipworks.js:5136`, `ui/station/screens/shipworks.js:5154`, `ui/station/screens/shipworks.js:5201`, `ui/station/screens/shipworks.js:5256`, `ui/station/screens/shipworks.js:5270`, `ui/station/screens/shipworks.js:5277`, `ui/station/screens/shipworks.js:5335`, `ui/station/screens/shipworks.js:5343`, `ui/station/screens/shipworks.js:5385`, `ui/station/screens/shipworks.js:5396`, `ui/station/screens/shipworks.js:5407`, `ui/station/screens/shipworks.js:5417`, `ui/station/screens/shipworks.js:5422`, `ui/station/screens/shipworks.js:5430`, `ui/station/screens/shipworks.js:5439`, `ui/station/screens/shipworks.js:5446`, `ui/station/screens/shipworks.js:5602`, `ui/station/screens/shipworks.js:5612`, `ui/station/screens/shipworks.js:5622`, `ui/station/screens/shipworks.js:5632`, `ui/station/screens/shipworks.js:5694`, `ui/station/screens/shipworks.js:5745`, `ui/station/screens/shipworks.js:5749`, `ui/station/screens/shipworks.js:5777`, `ui/station/screens/shipworks.js:5782`, `ui/station/screens/shipworks.js:5804`, `ui/station/screens/shipworks.js:5808`, `ui/station/stationApp.js:792`, `ui/station/stationApp.js:1241`, `ui/station/stationApp.js:1277`, `ui/station/stationLife.js:33`, `ui/survivalHud.js:864`, `ui/toasts.js:493`, `ui/uiRoot.js:1725`, `ui/wingmanRadial.js:228`, `ui/wingmanRadial.js:251`, `ui/wingmanRadial.js:276`, `ui/wingmanRadial.js:313`, `ui/wingmanRadial.js:338`, `world/motionFossil.js:188` | `audio/audioSystem.js:3281` |
| `audio:outputDeviceChanged` | `audio/audioSystem.js:3655` | — |
| `automation:assetDistressed` | `systems/automation.js:2489` | `ui/automationPayoff.js:107` |
| `automation:assetLost` | `systems/automation.js:3410` | `systems/intervention.js:75`, `systems/lossLedger.js:461`, `systems/missions.js:992` |
| `automation:assetRepossessed` | `systems/automation.js:2537` | `ui/automationPayoff.js:114` |
| `automation:assetResumed` | `systems/automation.js:2991` | — |
| `automation:droneDistressed` | `systems/automation.js:1721` | — |
| `automation:droneRecovered` | `systems/automation.js:1797` | — |
| `automation:fleetChanged` | `systems/automation.js:3271`, `systems/automation.js:3291`, `systems/automation.js:3304`, `systems/automation.js:3309`, `systems/automation.js:3313`, `systems/automation.js:3321`, `systems/automation.js:3340`, `systems/automation.js:3390`, `systems/ships.js:3027`, `systems/ships.js:3081` | — |
| `automation:incomeCredited` | `systems/automation.js:2351`, `systems/automation.js:2383`, `systems/automation.js:2568`, `systems/automation.js:2579`, `systems/automation.js:3688` | — |
| `automation:interact` | `systems/automation.js:4337` | — |
| `automation:offlineSummary` | `systems/automation.js:3446`, `systems/automation.js:3470`, `systems/automation.js:3494`, `systems/automation.js:3517`, `systems/automation.js:3737` | `ui/automationPayoff.js:104`, `ui/dockArrival.js:154` |
| `automation:outpostRaided` | `systems/automation.js:2408`, `systems/automation.js:3812` | `systems/lossLedger.js:462` |
| `automation:outpostsChanged` | `systems/automation.js:2352`, `systems/automation.js:2384`, `systems/automation.js:3071`, `systems/automation.js:3087`, `systems/automation.js:3130`, `systems/automation.js:3164`, `systems/automation.js:3180`, `systems/automation.js:3203`, `systems/automation.js:3214`, `systems/automation.js:3238`, `systems/automation.js:3261` | — |
| `automation:programAssigned` | `systems/automation.js:2761` | `systems/missions.js:991`, `ui/screens/automationPanel.js:1990` |
| `automation:programInterrupted` | `systems/alphabet.js:223`, `systems/alphabet.js:588`, `systems/alphabet.js:596` | — |
| `automation:programRejected` | `systems/automation.js:2727`, `systems/automation.js:2734` | `ui/screens/automationPanel.js:1985` |
| `automation:reactionAssigned` | `systems/automation.js:2776` | — |
| `automation:reactionCleared` | `systems/automation.js:2787` | — |
| `automation:traderCycleCompleted` | `systems/automation.js:2046` | `systems/story.js:269`, `ui/screens/automationPanel.js:1159` |
| `band:bearingReceipt` | `systems/bandRadio.js:1070` | `systems/presentationOrchestrator.js:209` |
| `band:bearingRequest` | `systems/bandRadio.js:1043` | — |
| `band:bearingResolved` | `systems/uniqueWrecks.js:919`, `systems/uniqueWrecks.js:962` | `render/authoredMotion.js:1183` |
| `band:bearingUnavailable` | `systems/uniqueWrecks.js:926`, `systems/uniqueWrecks.js:934`, `systems/uniqueWrecks.js:948` | `ui/bandHud.js:146` |
| `band:bed` | `systems/bandRadio.js:1127` | `audio/audioSystem.js:3453` |
| `band:cycle` | `ui/input.js:729` | — |
| `band:status` | `systems/bandRadio.js:1109` | `ui/bandHud.js:145` |
| `band:tune` | `ui/bandHud.js:199` | — |
| `bark:triggered` | `systems/fenderBenderPlant.js:263`, `systems/nearMissPlant.js:307`, `systems/scramblePlant.js:144` | — |
| `barkDirector:silence` | — | `audio/audioSystem.js:3046` |
| `barkDirector:voice` | `features/salvageOutfits/presentation.js:103`, `systems/barkDirector.js:1001`, `systems/npcJobsRuntime.js:3983`, `systems/survivorPod.js:1554`, `systems/survivorPod.js:1585`, `ui/station/stationArrival.js:239`, `ui/station/stationLife.js:41`, `ui/voiceArbiter.js:894` | `audio/audioSystem.js:3403` |
| `beacon:deploy` | — | `systems/beacons.js:52` |
| `beacon:deployed` | `systems/beacons.js:89` | `render/shipMicroMotion.js:1774`, `systems/onboarding.js:1149` |
| `beam:denied` | `systems/mining.js:474`, `systems/mining.js:556`, `systems/mining.js:672`, `systems/mining.js:688`, `systems/mining.js:700`, `systems/mining.js:731` | `render/authoredMotion.js:1155` |
| `beam:repaired` | `systems/mining.js:801` | — |
| `beam:transferred` | `systems/mining.js:862` | — |
| `body:sled` | — | `systems/spectrum/live.js:63` |
| `bombs:armed` | `systems/bombs.js:1292` | `audio/bombAudio.js:440` |
| `bombs:commanded` | `systems/bombs.js:1247` | `systems/fields.js:513` |
| `bombs:cycle` | `systems/bombs.js:866`, `systems/bombs.js:876`, `systems/bombs.js:1225` | `audio/bombAudio.js:469` |
| `bombs:denied` | `systems/bombs.js:696`, `systems/bombs.js:853`, `systems/bombs.js:893`, `systems/bombs.js:930`, `systems/bombs.js:969`, `systems/bombs.js:994`, `systems/bombs.js:1151`, `systems/bombs.js:1170` | — |
| `bombs:destroyed` | `systems/bombs.js:1754` | `audio/bombAudio.js:441`, `render/vfx.js:3076` |
| `bombs:detonated` | `systems/bombs.js:1358` | `audio/bombAudio.js:444`, `render/vfx.js:3074`, `systems/fields.js:517` |
| `bombs:dropped` | `systems/bombs.js:1233` | `audio/bombAudio.js:438`, `render/ordnanceMotionPresentation.js:315`, `systems/onboarding.js:1008` |
| `bombs:fieldEnded` | `systems/bombs.js:1653` | `audio/bombAudio.js:452`, `render/vfx.js:3075` |
| `bombs:primed` | `systems/bombs.js:1259` | `audio/bombAudio.js:439`, `ui/stuntCallout.js:1100` |
| `bombs:rackChanged` | `systems/bombs.js:1096` | `audio/bombAudio.js:474` |
| `bombs:redirected` | `systems/bombs.js:1720` | — |
| `bombs:released` | `systems/bombs.js:1778` | `audio/bombAudio.js:455` |
| `bombs:stockChanged` | `systems/bombs.js:900`, `systems/bombs.js:1018`, `systems/bombs.js:1230` | — |
| `borrowedSun:charter` | `ui/borrowedSunPrompt.js:35` | — |
| `borrowedSun:collectorsOut` | `systems/borrowedSun.js:1251` | — |
| `borrowedSun:contract` | `systems/borrowedSun.js:1044` | — |
| `borrowedSun:contractAccepted` | `systems/borrowedSun.js:1063` | — |
| `borrowedSun:contractClosed` | `systems/borrowedSun.js:1146`, `systems/borrowedSun.js:1160` | — |
| `borrowedSun:debtEscalated` | `systems/borrowedSun.js:1210`, `systems/borrowedSun.js:1449` | — |
| `borrowedSun:debtPosted` | `systems/borrowedSun.js:1177` | — |
| `borrowedSun:debtSettle` | `ui/borrowedSunPrompt.js:36` | — |
| `borrowedSun:debtSettled` | `systems/borrowedSun.js:956`, `systems/borrowedSun.js:1194`, `systems/borrowedSun.js:1289` | — |
| `borrowedSun:deed` | `systems/borrowedSun.js:660` | — |
| `borrowedSun:freightPosted` | `systems/borrowedSun.js:1083` | — |
| `borrowedSun:leaseBeat` | `systems/borrowedSun.js:917` | — |
| `borrowedSun:leaseBuy` | `ui/borrowedSunPrompt.js:34` | — |
| `borrowedSun:leaseClosed` | `systems/borrowedSun.js:973` | — |
| `borrowedSun:leaseSold` | `systems/borrowedSun.js:886` | — |
| `borrowedSun:levy` | `systems/borrowedSun.js:1281` | — |
| `borrowedSun:lost` | `systems/borrowedSun.js:617` | — |
| `borrowedSun:notice` | `systems/borrowedSun.js:533` | — |
| `borrowedSun:offer` | `systems/borrowedSun.js:604` | `ui/borrowedSunPrompt.js:5` |
| `borrowedSun:phase` | `systems/borrowedSun.js:523` | `ui/borrowedSunPrompt.js:8` |
| `borrowedSun:record` | `systems/borrowedSun.js:679` | — |
| `borrowedSun:regard` | `systems/borrowedSun.js:663` | — |
| `borrowedSun:route` | `ui/borrowedSunPrompt.js:33` | — |
| `borrowedSun:sailDeployed` | `systems/borrowedSun.js:767` | — |
| `borrowedSun:sailLost` | `systems/borrowedSun.js:1426` | — |
| `borrowedSun:shadowFilled` | `systems/borrowedSun.js:1384` | — |
| `borrowedSun:shadowLapsed` | `systems/borrowedSun.js:997`, `systems/borrowedSun.js:1356` | — |
| `borrowedSun:shadowPosted` | `systems/borrowedSun.js:1014` | — |
| `borrowedSun:shadowProgress` | `systems/borrowedSun.js:1373` | — |
| `borrowedSun:wash` | `systems/borrowedSun.js:824` | — |
| `borrowedVoice:disposition` | `ui/borrowedVoicePrompt.js:16` | — |
| `borrowedVoice:dispositionAccepted` | `systems/borrowedVoice.js:155` | — |
| `borrowedVoice:fragmentRecovered` | `systems/borrowedVoice.js:117` | — |
| `borrowedVoice:offer` | `systems/borrowedVoice.js:127` | `ui/borrowedVoicePrompt.js:4` |
| `boss:defeated` | `systems/world.js:1192` | `systems/survivalAnnounce.js:456` |
| `bouncer:banned` | `systems/bouncer.js:725` | — |
| `bouncer:ejected` | `systems/bouncer.js:684` | — |
| `bouncer:muscleHired` | `systems/bouncer.js:776` | — |
| `bouncer:muscleShove` | `systems/bouncer.js:928` | — |
| `bouncer:muscleStandDown` | `systems/bouncer.js:861` | — |
| `bouncer:offense` | `systems/bouncer.js:530` | — |
| `bouncer:vipDischarge` | `systems/bouncer.js:575` | — |
| `bouncer:vipEarned` | `systems/bouncer.js:560` | — |
| `bouncer:wanted` | `systems/bouncer.js:706` | — |
| `bouncer:wantedCleared` | `systems/bouncer.js:799` | — |
| `bouncer:warned` | `systems/bouncer.js:632` | — |
| `bounty:cleared` | `systems/economy.js:5280` | `systems/heat.js:437` |
| `bounty:cooled` | `systems/heat.js:771` | `systems/barkDirector.js:905` |
| `bracket:bank` | `systems/bracket.js:182` | — |
| `bracket:matchFinished` | `systems/bracket.js:239` | — |
| `bracket:matchStarted` | `systems/bracket.js:143` | — |
| `bracket:save` | `systems/bracket.js:188` | — |
| `bracket:shotResolved` | `systems/bracket.js:227` | — |
| `bracket:voice` | `systems/bracket.js:123` | — |
| `breakwaterSpur:action` | `features/breakwaterSpur/presentation.js:65` | `features/breakwaterSpur/runtime.js:71` |
| `breakwaterSpur:close` | `features/breakwaterSpur/runtime.js:143` | `features/breakwaterSpur/presentation.js:32` |
| `breakwaterSpur:cue` | `features/breakwaterSpur/freight.js:72`, `features/breakwaterSpur/runtime.js:121` | `features/breakwaterSpur/presentation.js:101` |
| `breakwaterSpur:offer` | `features/breakwaterSpur/runtime.js:136`, `features/breakwaterSpur/runtime.js:248` | `features/breakwaterSpur/presentation.js:30`, `ui/screens/missionLog.js:2769` |
| `breakwaterSpur:receipt` | `features/breakwaterSpur/runtime.js:287`, `features/breakwaterSpur/runtime.js:314`, `features/breakwaterSpur/runtime.js:316`, `features/breakwaterSpur/runtime.js:323`, `features/breakwaterSpur/runtime.js:347`, `features/breakwaterSpur/runtime.js:353`, `features/breakwaterSpur/runtime.js:358`, `features/breakwaterSpur/runtime.js:363`, `features/breakwaterSpur/runtime.js:368`, `features/breakwaterSpur/runtime.js:375`, `features/breakwaterSpur/runtime.js:395`, `features/breakwaterSpur/runtime.js:402`, `features/breakwaterSpur/runtime.js:426` | `features/breakwaterSpur/presentation.js:31`, `ui/screens/missionLog.js:2770` |
| `buildIdentity:revealed` | `systems/buildIdentity.js:327` | `audio/audioSystem.js:3146` |
| `bulletTime:end` | `systems/bulletTime.js:233` | `audio/audioSystem.js:3452` |
| `bulletTime:start` | `systems/bulletTime.js:215` | `audio/audioSystem.js:3449`, `systems/onboarding.js:1108` |
| `calendar:festival` | `systems/worldClock.js:122` | — |
| `calendar:marketDay` | `systems/worldClock.js:170` | — |
| `calendar:rushHour` | `systems/worldClock.js:198` | — |
| `calendar:stormSeason` | `systems/worldClock.js:107` | — |
| `callout:firstBeat` | `ui/stuntCallout.js:951` | — |
| `camera:shake` | `matter/collectorKnot.js:412`, `render/shipMicroMotion.js:2768`, `render/vfx/explosionPresentationVfx.js:172`, `render/vfx/explosionPresentationVfx.js:473`, `render/vfx/explosionPresentationVfx.js:819`, `systems/combat.js:705`, `systems/combat.js:876`, `systems/combat.js:1094`, `systems/drill.js:1570`, `systems/drill.js:1685`, `systems/drill.js:2035`, `systems/flybyFocus.js:571`, `systems/gyreSnare.js:551`, `systems/gyreSnare.js:1246`, `systems/gyreSnare.js:1636`, `systems/gyreSnare.js:2863`, `systems/gyreSnare.js:2943`, `systems/intervention.js:267`, `systems/presentationAdapters.js:613`, `systems/survivalAnnounce.js:1073`, `systems/tetherGameplay.js:809` | — |
| `camera:zoom` | `ui/crucibleFocus.js:169`, `ui/crucibleFocus.js:174`, `ui/input.js:970`, `ui/input.js:974`, `ui/input.js:1215` | — |
| `capitalBoss:actChanged` | — | `ui/toasts.js:865` |
| `capitalBoss:actRetried` | `systems/capitalBossEncounters.js:650` | — |
| `capitalBoss:countered` | — | `ui/toasts.js:874` |
| `capitalBoss:detach` | `systems/missions.js:1023` | — |
| `capitalBoss:disarmed` | — | `ui/toasts.js:876` |
| `capitalBoss:ended` | — | `audio/audioSystem.js:2962`, `ui/toasts.js:891` |
| `capitalBoss:hit` | — | `ui/toasts.js:883` |
| `capitalBoss:plateTorn` | `systems/capitalBossEncounters.js:590` | — |
| `capitalBoss:recovery` | — | `ui/toasts.js:875` |
| `capitalBoss:start` | `systems/missionObjectiveOps.js:2268` | `systems/swarmJuice.js:149` |
| `capitalBoss:started` | — | `ui/toasts.js:858` |
| `capitalBoss:telegraph` | — | `render/authoredMotion.js:1211`, `ui/toasts.js:843` |
| `capitalBoss:telegraphEnd` | `systems/capitalBossEncounters.js:643`, `systems/capitalBossEncounters.js:669`, `systems/capitalBossEncounters.js:693` | — |
| `captain:remembered` | `systems/captainMemory.js:92` | — |
| `cargo:breakwaterFreightAccepted` | `systems/cargo.js:1531` | — |
| `cargo:caughtByNet` | `systems/lootShards.js:861` | `systems/world.js:804` |
| `cargo:changed` | `features/salvageTender/physical.js:409`, `systems/cargo.js:395`, `systems/mining.js:3010` | `audio/audioSystem.js:3070`, `systems/moistureLoss.js:89`, `systems/onboarding.js:909`, `systems/ships.js:1982`, `ui/cargoConscience.js:143`, `ui/commandBar.js:256` |
| `cargo:cinderglassReceived` | `features/cinderglassJob/ownerSeams.js:46` | — |
| `cargo:delivered` | `systems/asteroidSites.js:4046`, `systems/missions.js:4340`, `systems/missions.js:4400`, `systems/missions.js:4524`, `systems/missions.js:4574` | `systems/economy.js:1871` |
| `cargo:fragileLost` | `systems/fragileCargo.js:320` | — |
| `cargo:full` | `systems/cargo.js:503`, `systems/cargo.js:793`, `systems/mining.js:1919`, `systems/mining.js:2988` | `audio/audioSystem.js:3071`, `careers/origins/prospectorOrigin.js:639`, `systems/onboarding.js:912`, `systems/presentationOrchestrator.js:229`, `ui/alerts.js:670` |
| `cargo:hotDockSpill` | `systems/cargo.js:1243` | — |
| `cargo:jettison` | `ui/hud.js:4558` | — |
| `cargo:jettisoned` | `systems/cargo.js:1652` | `audio/audioSystem.js:3109`, `render/authoredMotion.js:1220`, `render/shipMicroMotion.js:1772`, `systems/barkDirector.js:888`, `systems/cloak.js:57`, `systems/jettisonImpulse.js:54`, `systems/lawSecurity.js:448`, `systems/onboarding.js:1090`, `systems/onboarding.js:1157` |
| `cargo:massSettled` | `systems/cargo.js:966` | `systems/presentationOrchestrator.js:228`, `systems/ships.js:1983` |
| `cargo:parkedHoldSwapped` | `systems/cargo.js:1120` | `systems/shipControlTransfer.js:143` |
| `cargo:parkedTransfer` | `systems/cargo.js:1182` | — |
| `cargo:persistentAdded` | `systems/e1EncounterRuntime.js:84` | — |
| `cargo:podIntake` | `systems/economy.js:4280` | `systems/economy.js:1881` |
| `cargo:radiationCooked` | `systems/fragileCargo.js:152` | — |
| `cargo:tallyThreeDelivered` | `systems/economy.js:4699` | — |
| `cargo:vesselFreightReleased` | `systems/cargo.js:1378` | — |
| `cargo:volatileCorrosive` | `systems/lootShards.js:1031` | — |
| `cargo:volatileCryo` | `systems/lootShards.js:1067` | — |
| `cargo:volatileExposed` | `systems/volatileExposure.js:384` | — |
| `cargo:volatileRupture` | `systems/volatileExposure.js:548` | — |
| `cargo:volatileSlam` | `systems/lootShards.js:951`, `systems/lootShards.js:1007` | `systems/volatileExposure.js:218` |
| `cargo:volatileVent` | `systems/volatileExposure.js:472` | — |
| `ceresNinthMouth:action` | `ui/ceresNinthMouthPrompt.js:58` | `systems/ceresNinthMouth.js:362` |
| `ceresNinthMouth:rescueCommitted` | `systems/ceresNinthMouth.js:470` | — |
| `ceresWinching:action` | `ui/ceresWinchingPrompt.js:26` | `systems/ceresAnchorWinching.js:202` |
| `ceresWorkfleet:interrupted` | `systems/ceresWorkfleet.js:317` | — |
| `chain:detonated` | `systems/impulseCharges.js:1001` | `systems/fields.js:502` |
| `chain:primeEnded` | `systems/impulseCharges.js:964` | — |
| `chain:primed` | `systems/impulseCharges.js:941` | — |
| `chain:slam` | `systems/impulseCharges.js:875`, `systems/impulseCharges.js:895` | `systems/fields.js:501` |
| `chain:tetherShare` | `systems/tetherGameplay.js:1221`, `systems/tetherGameplay.js:2525` | — |
| `charge:aftDropped` | `systems/impulseCharges.js:1254` | `systems/onboarding.js:1116` |
| `charge:armed` | `systems/impulseCharges.js:1075` | — |
| `charge:combo` | `systems/impulseCharges.js:1365`, `systems/impulseCharges.js:1430` | `systems/tetherGameplay.js:381` |
| `charge:detonated` | `systems/impulseCharges.js:684`, `systems/impulseCharges.js:792`, `systems/impulseCharges.js:1013`, `systems/impulseCharges.js:1049`, `systems/impulseCharges.js:1438` | `audio/audioSystem.js:3171`, `render/feel.js:1776`, `render/vfx.js:3072`, `systems/fields.js:503`, `systems/fields.js:514`, `systems/fields.js:518`, `systems/flightV3.js:233`, `systems/gamepad.js:993` |
| `charge:stuck` | `systems/impulseCharges.js:1156` | `render/ordnanceMotionPresentation.js:317`, `render/shipMicroMotion.js:1771` |
| `charge:thrown` | `systems/impulseCharges.js:1241`, `systems/impulseCharges.js:1325` | `render/ordnanceMotionPresentation.js:316` |
| `choir:bellHeadRing` | `systems/faction_choir.js:737` | — |
| `choir:bellPulse` | `systems/faction_choir.js:556` | — |
| `choir:blessing` | `systems/faction_choir.js:802` | — |
| `choir:blessingEnded` | `systems/faction_choir.js:813` | — |
| `choir:circuitComplete` | `systems/faction_choir.js:979` | — |
| `choir:crystalShattered` | `systems/faction_choir.js:586` | — |
| `choir:devotionalYield` | `systems/faction_choir.js:1138` | — |
| `choir:escortComplete` | `systems/faction_choir.js:1420` | — |
| `choir:escortRequest` | `systems/faction_choir.js:1302` | — |
| `choir:heresyLapsed` | `systems/faction_choir.js:1508`, `systems/faction_choir.js:1516` | — |
| `choir:heresyMarked` | `systems/faction_choir.js:1485` | — |
| `choir:heresyResolved` | `systems/faction_choir.js:1630` | — |
| `choir:offering` | `systems/faction_choir.js:1105` | — |
| `choir:pilgrimArrived` | `systems/faction_choir.js:1424` | — |
| `choir:pilgrimLeg` | `systems/faction_choir.js:941` | — |
| `choir:pilgrimLost` | `systems/faction_choir.js:1444` | — |
| `choir:pilgrimSpawn` | `systems/faction_choir.js:1355` | — |
| `choir:pilgrimVisit` | `systems/faction_choir.js:898` | — |
| `choir:relicAlarm` | `systems/faction_choir.js:679` | — |
| `choir:relicCracked` | `systems/faction_choir.js:647` | — |
| `choir:relicPing` | `systems/faction_choir.js:665` | — |
| `choir:sacrilege` | `systems/faction_choir.js:860` | — |
| `choir:sanctuary` | `systems/faction_choir.js:846`, `systems/faction_choir.js:876` | — |
| `choir:siteRaised` | `systems/faction_choir.js:1685`, `systems/faction_choir.js:1706` | — |
| `choir:titheAssessed` | `systems/faction_choir.js:1030` | — |
| `choir:tithePaid` | `systems/faction_choir.js:1049` | — |
| `choir:tribute` | `systems/faction_choir.js:699` | — |
| `chronicler:radio` | — | `chronicler/voiceBridge.js:22` |
| `chronicler:recall` | — | `chronicler/voiceBridge.js:23` |
| `cinderglassJob:action` | `features/cinderglassJob/integration.js:39` | — |
| `cinderglassJob:close` | `features/cinderglassJob/runtime.js:483` | — |
| `cinderglassJob:fact` | `features/cinderglassJob/runtime.js:336`, `features/cinderglassJob/runtime.js:470` | — |
| `cinderglassJob:offer` | `features/cinderglassJob/runtime.js:149` | — |
| `cinderglassJob:refused` | `features/cinderglassJob/runtime.js:428` | `ui/screens/missionLog.js:2772` |
| `cinderglassJob:servicePrompt` | `features/cinderglassJob/runtime.js:320`, `features/cinderglassJob/runtime.js:483` | — |
| `cinderglassJob:view` | `features/cinderglassJob/runtime.js:481` | `features/cinderglassJob/integration.js:89`, `ui/screens/missionLog.js:2771` |
| `claim:claimed` | `systems/claims.js:415` | `systems/onboarding.js:997`, `systems/story.js:279`, `systems/traffic.js:2000` |
| `claim:convoyAbandoned` | `systems/claims.js:1408` | `systems/traffic.js:2003` |
| `claim:convoyDocked` | `systems/trafficConvoyOps.js:211` | `systems/claims.js:376` |
| `claim:convoyManifested` | `systems/trafficConvoyOps.js:111` | `systems/claims.js:375` |
| `claim:defenseDelegate` | — | `systems/claims.js:367` |
| `claim:defenseDelegateRefused` | `systems/claims.js:1787` | — |
| `claim:defenseEncounterRequested` | `systems/claims.js:1669` | — |
| `claim:defenseGo` | — | `systems/claims.js:366` |
| `claim:defenseIgnore` | — | `systems/claims.js:362` |
| `claim:defenseResolved` | `systems/claims.js:1869` | `ui/encounterChoicePrompt.js:182` |
| `claim:defenseStarted` | `systems/claims.js:1679` | `ui/encounterChoicePrompt.js:181` |
| `claim:defenseWarning` | `systems/claims.js:1576`, `systems/claims.js:1694` | `systems/encounterDirector.js:415`, `ui/encounterChoicePrompt.js:178` |
| `claim:depotPatrolCompleted` | `systems/claims.js:3043` | `systems/factions.js:547` |
| `claim:depotPatrolRotation` | `systems/claims.js:2999` | — |
| `claim:depotPatrolSpent` | `systems/claims.js:1774` | — |
| `claim:depotSupport` | `systems/claims.js:2910`, `systems/claims.js:2936` | — |
| `claim:freightDelivered` | `systems/trafficConvoyOps.js:423` | — |
| `claim:infrastructureActive` | `systems/claims.js:1084`, `systems/claims.js:2704` | `systems/traffic.js:1998` |
| `claim:infrastructureConstructed` | `systems/claims.js:482`, `systems/claims.js:2641` | — |
| `claim:infrastructureStatus` | `systems/claims.js:1095` | `systems/traffic.js:1999` |
| `claim:moduleBuilt` | `systems/claims.js:500` | — |
| `claim:raidRepelled` | `systems/claims.js:1525` | — |
| `claim:raidWarning` | `systems/claims.js:1518` | `audio/audioSystem.js:3134` |
| `claim:receipt` | `systems/claims.js:2089` | — |
| `claim:sensorPostRumor` | `systems/claims.js:1144` | `systems/world.js:861` |
| `claim:specialized` | `systems/claims.js:541` | — |
| `claim:trophyHeadGranted` | `systems/claims.js:3177` | — |
| `claims:migrated` | `systems/claims.js:2267` | — |
| `cloak:burned` | `systems/cloak.js:306` | `audio/audioSystem.js:2996` |
| `cloak:dropped` | `systems/cloak.js:240` | `audio/audioSystem.js:2991`, `render/authoredMotion.js:1215`, `render/shipMicroMotion.js:1768` |
| `cloak:engaged` | `systems/cloak.js:200` | `render/authoredMotion.js:1214`, `render/shipMicroMotion.js:1767`, `systems/gamepad.js:998`, `systems/onboarding.js:1112` |
| `cloak:faded` | `systems/aiPorts.js:1327` | `audio/audioSystem.js:2990` |
| `coldburnRey:playerDelivered` | `systems/missions.js:5069` | — |
| `coldburnRey:raceSettled` | `systems/coldburnRey.js:91` | — |
| `collector:absorbed` | `matter/collectorKnot.js:174` | — |
| `collector:freed` | `matter/collectorKnot.js:114` | — |
| `collector:lost` | `matter/collectorKnot.js:123` | — |
| `collector:released` | `matter/collectorKnot.js:405` | — |
| `collector:snagged` | `matter/collectorKnot.js:154` | — |
| `collision:tearOff` | `systems/hullFracture.js:738` | `render/vfx.js:2940` |
| `combat:actionCancelled` | `combat/actions.js:373` | — |
| `combat:actionCompleted` | `combat/actions.js:359` | — |
| `combat:actionPhase` | `combat/actions.js:222` | — |
| `combat:actionRejected` | `combat/actions.js:395` | `ui/toasts.js:902` |
| `combat:actionStarted` | `combat/actions.js:189` | `systems/presentationOrchestrator.js:180`, `systems/scenarioRuntime.js:24` |
| `combat:aftermathChoices` | `systems/combatOutcome.js:496`, `systems/combatOutcome.js:565`, `systems/combatOutcome.js:600` | `ui/aftermathChoicePrompt.js:114` |
| `combat:aftermathChoose` | `ui/aftermathChoicePrompt.js:102` | `systems/combatOutcome.js:292` |
| `combat:aftermathChosen` | `systems/combatOutcome.js:253` | `ui/aftermathChoicePrompt.js:115` |
| `combat:bankShot` | — | `render/vfx.js:2924` |
| `combat:baseDestroyed` | `systems/combat.js:862` | `systems/economy.js:1950`, `systems/gamepad.js:1103` |
| `combat:beamStop` | `systems/swarmFortifyEffects.js:308`, `systems/weapons.js:1602` | `audio/audioSystem.js:2868`, `render/asteroidMotionPresentation.js:524`, `render/vfx.js:2920` |
| `combat:bounceContinued` | `combat/attackHit.js:38` | `render/vfx.js:2925`, `systems/presentationOrchestrator.js:272` |
| `combat:chainKill` | — | `systems/killReplay.js:403` |
| `combat:collisionConsequence` | `systems/collisionConsequences.js:578` | `render/feel.js:1811`, `render/vfx.js:2938`, `systems/economy.js:1952`, `systems/fields.js:505`, `systems/gamepad.js:985`, `systems/lawSecurity.js:419`, `systems/ships.js:2115`, `systems/swarmLegendaries.js:115` |
| `combat:collisionDebris` | `systems/collisionConsequences.js:597` | `render/vfx.js:2939` |
| `combat:crushed` | — | `render/vfx.js:3085` |
| `combat:damage` | `combat/damage.js:621` | `audio/audioSystem.js:2883`, `balance/hunterPublicRoute.js:324`, `balance/hunterPublicRoute.js:473`, `data/encounters/367-the-salvage-tail.js:147`, `render/asteroidMotionPresentation.js:517`, `render/authoredMotion.js:1171`, `render/feel.js:1576`, `render/shipMicroMotion.js:1752`, `render/vfx.js:2926`, `save/saveSystem.js:508`, `systems/aiEncounter.js:140`, `systems/asteroidSites.js:872`, `systems/barkDirector.js:883`, `systems/cloak.js:53`, `systems/collisionConsequences.js:130`, `systems/combatOutcome.js:297`, `systems/cruise.js:60`, `systems/difficultyDirector.js:161`, `systems/encounterDirector.js:386`, `systems/factionPresence.js:522`, `systems/gamepad.js:1111`, `systems/heat.js:377`, `systems/killReplay.js:391`, `systems/lawSecurity.js:418`, `systems/missions.js:868`, `systems/missions.js:976`, `systems/npcJobsRuntime.js:1246`, `systems/npcJobsRuntime.js:1247`, `systems/onboarding.js:833`, `systems/onboarding.js:844`, `systems/onboarding.js:856`, `systems/presentationOrchestrator.js:170`, `systems/routeFollower.js:435`, `systems/salvageActions.js:142`, `systems/scenarioRuntime.js:30`, `systems/ships.js:2104`, `systems/special500HullLog.js:44`, `systems/stationBroadcast.js:265`, `systems/survivalResults.js:529`, `systems/survivalWave.js:237`, `systems/swarmArena.js:940`, `systems/swarmElites.js:184`, `systems/swarmElites.js:185`, `systems/swarmElites.js:186`, `systems/swarmJuice.js:143`, `systems/titles.js:599`, `systems/traffic.js:1918`, `systems/volatileExposure.js:216`, `systems/world.js:797`, `ui/alerts.js:654`, `ui/commandBar.js:245`, `ui/uiRoot.js:1011` |
| `combat:emp` | `combat/damage.js:626` | — |
| `combat:fire` | `systems/impulseCharges.js:726`, `systems/swarmFortifyEffects.js:305`, `systems/swarmFortifyEffects.js:409`, `systems/weapons.js:1479`, `systems/weapons.js:1581`, `systems/weapons.js:1846`, `systems/weapons.js:2271` | `audio/audioSystem.js:2867`, `data/stationBubbles.js:184`, `render/farPlaneLife.js:95`, `render/feel.js:1713`, `render/shipMicroMotion.js:1750`, `render/vfx.js:2919`, `systems/asteroidSites.js:689`, `systems/cloak.js:59`, `systems/cruise.js:68`, `systems/lawSecurity.js:420`, `systems/onboarding.js:747`, `systems/onboarding.js:760`, `systems/presentationOrchestrator.js:179`, `systems/story.js:284`, `systems/traffic.js:1919`, `systems/world.js:910` |
| `combat:hit` | `systems/salvageActions.js:624`, `systems/salvageActions.js:715` | `render/farPlaneLife.js:94`, `systems/routeFollower.js:433`, `systems/story.js:285` |
| `combat:hitAsset` | `systems/wingmen.js:240` | `systems/automation.js:615` |
| `combat:hitstunImpulse` | — | `systems/rubberneckers.js:100`, `systems/scramblePlant.js:119` |
| `combat:hullRepair` | `combat/kernel.js:517` | — |
| `combat:kill` | `systems/world.js:7629` | `systems/factionPresence.js:530` |
| `combat:lockChanged` | `systems/weapons.js:1192` | `systems/onboarding.js:869`, `systems/world.js:796`, `ui/alerts.js:663` |
| `combat:outcome` | `systems/combatOutcome.js:473` | `systems/barkDirector.js:880`, `ui/aftermathChoicePrompt.js:114` |
| `combat:outcomeConsequence` | `systems/combatOutcome.js:474` | — |
| `combat:repairSubsystem` | `systems/npcJobsRuntime.js:6625`, `systems/npcJobsRuntime.js:6991` | `combat/kernel.js:207` |
| `combat:requestAction` | — | `combat/kernel.js:204` |
| `combat:routeDamage` | `systems/bombs.js:1714`, `systems/capitalBossEncounters.js:132`, `systems/drill.js:2047`, `systems/foldAberrant.js:173`, `systems/hullBurst.js:554`, `systems/impulseCharges.js:1672`, `systems/mines.js:566`, `systems/missionObjectiveOps.js:2656`, `systems/theBolus.js:352`, `systems/tumbleStates.js:615` | `combat/kernel.js:206`, `systems/routeFollower.js:434` |
| `combat:shipjackPulse` | `combat/kernel.js:592` | — |
| `combat:shipjackShutdown` | `combat/kernel.js:607` | — |
| `combat:shockwavePass` | — | `render/asteroidMotionPresentation.js:519`, `render/vfx.js:3092` |
| `combat:shove` | `systems/onboarding.js:3797` | `audio/audioSystem.js:3151`, `systems/onboarding.js:759` |
| `combat:statusApplied` | `combat/statuses.js:212` | `render/vfx.js:2941`, `ui/stuntCallout.js:1060` |
| `combat:statusExpired` | `combat/statuses.js:90`, `systems/bombs.js:1691` | `audio/bombAudio.js:464`, `systems/tumbleStates.js:143`, `ui/stuntCallout.js:1081` |
| `combat:subsystemDisabled` | — | `systems/barkDirector.js:956`, `systems/combatOutcome.js:261`, `systems/encounterDirector.js:377`, `systems/factionPresence.js:520`, `systems/npcJobsRuntime.js:1251`, `systems/presentationOrchestrator.js:251`, `systems/surrenderRecovery.js:92`, `systems/tumbleStates.js:147`, `systems/wingMorale.js:202`, `ui/alerts.js:644` |
| `combat:subsystemEnabled` | `combat/latchRepair.js:112` | `render/shipMicroMotion.js:1770`, `systems/factionPresence.js:521`, `systems/npcJobsRuntime.js:1252`, `systems/presentationOrchestrator.js:260`, `systems/surrenderRecovery.js:93`, `ui/alerts.js:649` |
| `combat:surrendered` | — | `systems/combatOutcome.js:262`, `systems/surrenderRecovery.js:91` |
| `combat:thrownWreck` | `systems/deedRecord.js:524` | `systems/barkDirector.js:952` |
| `combat:tumbleRake` | `systems/tumbleStates.js:603` | `systems/barkDirector.js:951` |
| `combat:tumbled` | `systems/tumbleStates.js:561` | `render/shipMicroMotion.js:1753`, `systems/fields.js:504`, `systems/missions.js:873`, `systems/tetherGameplay.js:375` |
| `combat:warded` | `combat/damage.js:581` | `audio/audioSystem.js:3032` |
| `combat:weakPointHit` | `combat/damage.js:514`, `systems/combat.js:769` | `render/vfx.js:2927` |
| `comms:log` | `data/boundaryField.js:42`, `data/curlField.js:41`, `data/encounters/344-opening-hauler-raid.js:60`, `data/encounters/344-opening-hauler-raid.js:583`, `data/encounters/344-opening-hauler-raid.js:611`, `data/encounters/350-the-long-tail.js:229`, `data/encounters/350-the-long-tail.js:264`, `data/encounters/350-the-long-tail.js:282`, `data/encounters/351-the-chord.js:141`, `data/encounters/351-the-chord.js:165`, `data/encounters/352-the-slot.js:155`, `data/encounters/352-the-slot.js:175`, `data/encounters/353-the-wake.js:132`, `data/encounters/353-the-wake.js:172`, `data/encounters/353-the-wake.js:206`, `data/encounters/354-the-sweep.js:138`, `data/encounters/354-the-sweep.js:198`, `data/encounters/354-the-sweep.js:215`, `data/encounters/355-the-winnow-throw.js:144`, `data/encounters/355-the-winnow-throw.js:161`, `data/encounters/355-the-winnow-throw.js:168`, `data/encounters/355-the-winnow-throw.js:186`, `data/encounters/356-the-surge-line.js:188`, `data/encounters/356-the-surge-line.js:204`, `data/encounters/356-the-surge-line.js:213`, `data/encounters/356-the-surge-line.js:230`, `data/encounters/357-the-handoff.js:73`, `data/encounters/357-the-handoff.js:246`, `data/encounters/357-the-handoff.js:261`, `data/encounters/357-the-handoff.js:296`, `data/encounters/357-the-handoff.js:312`, `data/encounters/357-the-handoff.js:355`, `data/encounters/358-the-press-camp.js:117`, `data/encounters/358-the-press-camp.js:153`, `data/encounters/358-the-press-camp.js:344`, `data/encounters/358-the-press-camp.js:358`, `data/encounters/358-the-press-camp.js:372`, `data/encounters/358-the-press-camp.js:382`, `data/encounters/362-the-salvage-watch.js:446`, `data/encounters/367-the-salvage-tail.js:339`, `data/encounters/700-the-weighing.js:142`, `data/encounters/700-the-weighing.js:227`, `data/encounters/701-spine-break.js:137`, `data/encounters/701-spine-break.js:153`, `data/encounters/701-spine-break.js:190`, `data/encounters/701-spine-break.js:206`, `data/encounters/702-the-swap.js:55`, `data/encounters/702-the-swap.js:180`, `data/encounters/702-the-swap.js:201`, `data/encounters/703-too-perfect-pack.js:117`, `data/encounters/703-too-perfect-pack.js:162`, `data/encounters/704-claim-jump.js:128`, `data/encounters/704-claim-jump.js:145`, `data/encounters/705-the-nest.js:254`, `data/encounters/705-the-nest.js:420`, `data/encounters/705-the-nest.js:459`, `data/encounters/705-the-nest.js:464`, `data/encounters/705-the-nest.js:633`, `data/laneField.js:53`, `data/laneField.js:65`, `data/velocityPlane.js:46`, `features/industrialDisasters/presentation.js:119`, `features/salvageOutfits/index.js:72`, `systems/aftermathWrecks.js:3014`, `systems/alienEcology.js:786`, `systems/alienEcology.js:815`, `systems/alienEcology.js:838`, `systems/alienEcology.js:917`, `systems/alienEcology.js:948`, `systems/alienEcology.js:958`, `systems/alienEcology.js:979`, `systems/alienEcology.js:986`, `systems/alienEcology.js:1005`, `systems/alienEcology.js:1345`, `systems/alienEcology.js:1537`, `systems/alienEcology.js:1674`, `systems/alienEcology.js:1707`, `systems/alienEcology.js:1749`, `systems/alienEcology.js:1784`, `systems/alienEcology.js:1789`, `systems/alienEcology.js:1858`, `systems/alienEcology.js:1940`, `systems/alienEcology.js:1952`, `systems/alienEcology.js:2005`, `systems/alienEcology.js:2347`, `systems/alienEcology.js:2426`, `systems/alienEcology.js:2777`, `systems/alienEcology.js:2805`, `systems/alienEcology.js:3092`, `systems/alienEcology.js:3120`, `systems/alienEcology.js:3131`, `systems/alienEcology.js:3190`, `systems/alienEcology.js:3232`, `systems/alienEcology.js:3436`, `systems/alphabet.js:235`, `systems/asteroidSites.js:1648`, `systems/automation.js:4322`, `systems/borrowedSun.js:671`, `systems/contractClauses.js:774`, `systems/docket.js:210`, `systems/docket.js:220`, `systems/economy.js:4240`, `systems/encounterDirector.js:3487`, `systems/encounterScripts.js:828`, `systems/encounterScripts.js:3725`, `systems/encounterScripts.js:3984`, `systems/faction_archive.js:629`, `systems/faction_archive.js:852`, `systems/faction_archive.js:864`, `systems/faction_archive.js:933`, `systems/faction_archive.js:965`, `systems/faction_choir.js:624`, `systems/faction_choir.js:648`, `systems/faction_choir.js:668`, `systems/faction_choir.js:682`, `systems/faction_choir.js:861`, `systems/faction_choir.js:862`, `systems/faction_choir.js:900`, `systems/faction_choir.js:942`, `systems/faction_choir.js:980`, `systems/faction_choir.js:1032`, `systems/faction_choir.js:1038`, `systems/faction_choir.js:1040`, `systems/faction_choir.js:1109`, `systems/faction_choir.js:1112`, `systems/faction_choir.js:1116`, `systems/faction_choir.js:1121`, `systems/faction_choir.js:1303`, `systems/faction_choir.js:1427`, `systems/faction_choir.js:1445`, `systems/faction_choir.js:1486`, `systems/faction_choir.js:1509`, `systems/faction_choir.js:1517`, `systems/faction_choir.js:1628`, `systems/faction_concord.js:215`, `systems/faction_frontier.js:882`, `systems/faction_frontier.js:1186`, `systems/faction_frontier.js:1307`, `systems/faction_frontier.js:1312`, `systems/faction_frontier.js:1317`, `systems/faction_frontier.js:1367`, `systems/faction_frontier.js:1428`, `systems/faction_frontier.js:1485`, `systems/faction_frontier.js:1688`, `systems/faction_frontier.js:2608`, `systems/faction_fulfillment.js:256`, `systems/faction_fulfillment.js:265`, `systems/faction_fulfillment.js:314`, `systems/faction_fulfillment.js:318`, `systems/faction_fulfillment.js:332`, `systems/faction_fulfillment.js:345`, `systems/faction_fulfillment.js:384`, `systems/faction_fulfillment.js:418`, `systems/faction_helix.js:573`, `systems/faction_helix.js:778`, `systems/faction_helix.js:846`, `systems/faction_meridian.js:436`, `systems/faction_meridian.js:737`, `systems/faction_pitborn.js:660`, `systems/faction_pitborn.js:771`, `systems/faction_pitborn.js:855`, `systems/faction_pitborn.js:881`, `systems/faction_pitborn.js:887`, `systems/faction_pitborn.js:890`, `systems/faction_pitborn.js:940`, `systems/faction_understory.js:982`, `systems/faction_understory.js:1008`, `systems/faction_understory.js:1061`, `systems/faction_understory.js:1194`, `systems/faction_understory.js:1242`, `systems/faction_understory.js:1402`, `systems/faction_understory.js:2123`, `systems/faction_vael.js:489`, `systems/faction_vael.js:502`, `systems/faction_vael.js:653`, `systems/faction_vael.js:703`, `systems/faction_vael.js:822`, `systems/faction_vael.js:823`, `systems/faction_vael.js:851`, `systems/faction_verge.js:590`, `systems/faction_verge.js:1701`, `systems/faction_verge.js:1760`, `systems/faction_verge.js:1797`, `systems/faction_verge.js:1848`, `systems/faction_verge.js:1858`, `systems/faction_verge.js:1884`, `systems/faction_verge.js:1908`, `systems/factions.js:610`, `systems/fenderBenderPlant.js:300`, `systems/foldAberrant.js:44`, `systems/impoundGrudge.js:1100`, `systems/lamplighter.js:635`, `systems/lineHeads.js:292`, `systems/machineWork.js:14`, `systems/massSignature.js:514`, `systems/massSignature.js:531`, `systems/massSignature.js:630`, `systems/missionObjectiveOps.js:1510`, `systems/morrow.js:253`, `systems/nestVisit.js:160`, `systems/nestVisit.js:180`, `systems/patrolBait.js:92`, `systems/plants/pl216BlueMinute.js:171`, `systems/precursorMachines.js:65`, `systems/precursorMachines.js:132`, `systems/precursorMachines.js:165`, `systems/precursorMachines.js:172`, `systems/precursorMachines.js:185`, `systems/precursorMachines.js:191`, `systems/precursorMachines.js:409`, `systems/precursorMachines.js:422`, `systems/precursorMachines.js:440`, `systems/precursorMachines.js:464`, `systems/precursorMachines.js:487`, `systems/precursorMachines.js:503`, `systems/precursorMachines.js:517`, `systems/precursorMachines.js:529`, `systems/precursorMachines.js:536`, `systems/precursorMachines.js:552`, `systems/precursorMachines.js:613`, `systems/precursorMachines.js:709`, `systems/precursorMachines.js:728`, `systems/precursorMachines.js:750`, `systems/precursorMachines.js:784`, `systems/precursorMachines.js:799`, `systems/precursorMachines.js:831`, `systems/precursorMachines.js:859`, `systems/precursorMachines.js:907`, `systems/precursorMachines.js:1026`, `systems/precursorMachines.js:1040`, `systems/precursorMachines.js:1086`, `systems/precursorMachines.js:1100`, `systems/precursorMachines.js:1166`, `systems/precursorMachines.js:1219`, `systems/precursorMachines.js:1227`, `systems/quill.js:485`, `systems/rubric.js:474`, `systems/salvage.js:181`, `systems/salvage.js:980`, `systems/salvage.js:1051`, `systems/salvage.js:1085`, `systems/salvage.js:1247`, `systems/shipjack.js:85`, `systems/special500CollectiveHours.js:78`, `systems/special500Confessional.js:234`, `systems/special500Confessional.js:272`, `systems/special500DeathBell.js:92`, `systems/special500Director.js:280`, `systems/special500DockLedger.js:166`, `systems/special500DockLedger.js:178`, `systems/special500DockLedger.js:191`, `systems/special500DockLedger.js:215`, `systems/special500DockLedger.js:239`, `systems/special500ForgeKaraoke.js:89`, `systems/special500HullLog.js:92`, `systems/special500HullLog.js:112`, `systems/special500Invoice.js:129`, `systems/special500Invoice.js:174`, `systems/special500Invoice.js:189`, `systems/special500PortraitBuoys.js:228`, `systems/special500Question.js:90`, `systems/special500Sommelier.js:108`, `systems/special500Sommelier.js:155`, `systems/special500Sommelier.js:161`, `systems/stationContacts.js:392`, `systems/towlineTable.js:266`, `systems/uniqueWrecks.js:2088`, `systems/vesper.js:287`, `systems/wingmen.js:319`, `systems/wingmen.js:325`, `systems/wingmen.js:332`, `systems/worldClock.js:148`, `systems/worldPressure.js:238`, `systems/worldPressure.js:286`, `world/motionFossil.js:41`, `world/playerHullEcho.js:100`, `world/playerHullEcho.js:111`, `world/playerHullEcho.js:133`, `world/vestaWinnowRecovery.js:159`, `world/vestaWinnowRecovery.js:342`, `world/vestaWinnowRecovery.js:552` | `ui/floatingText.js:128` |
| `comms:message` | `systems/ceresAnchorWinching.js:141`, `systems/ceresNinthMouth.js:139`, `systems/ceresWorkfleetStagecraft.js:99`, `systems/economy.js:4646`, `systems/precursorMachines.js:313`, `systems/trafficRoleOps.js:266`, `systems/trafficRoleOps.js:1297`, `systems/trafficRoleOps.js:1440` | — |
| `comms:popup` | `missions/cinderReceivingScene.js:69`, `missions/compostArrivalScene.js:132`, `missions/dioneTargetPractice.js:63`, `missions/furnaceArrivalScene.js:62`, `missions/furnaceCapstan.js:299`, `missions/furnaceCapstan.js:360`, `missions/furnaceCasingReturn.js:113`, `missions/furnaceReceivingLane.js:59`, `missions/lanternWardConversation.js:46`, `missions/lanternWardConversation.js:54`, `missions/weighingWorksite.js:144`, `systems/bellhop.js:140`, `systems/bouncer.js:352`, `systems/bouncer.js:555`, `systems/bouncer.js:571`, `systems/bouncer.js:628`, `systems/bouncer.js:679`, `systems/bouncer.js:710`, `systems/bouncer.js:728`, `systems/careerContracts.js:456`, `systems/careerContracts.js:470`, `systems/careerContracts.js:486`, `systems/coldburnRey.js:64`, `systems/crew.js:250`, `systems/crew.js:361`, `systems/crew.js:382`, `systems/crew.js:507`, `systems/crew.js:523`, `systems/crew.js:539`, `systems/crew.js:561`, `systems/crew.js:570`, `systems/crew.js:590`, `systems/crew.js:614`, `systems/crew.js:623`, `systems/crew.js:646`, `systems/crew.js:667`, `systems/crew.js:692`, `systems/crew.js:712`, `systems/crew.js:741`, `systems/crew.js:771`, `systems/crew.js:788`, `systems/crew.js:800`, `systems/factionPresence.js:817`, `systems/factionPresence.js:1486`, `systems/factionPresence.js:1537`, `systems/factionPresence.js:1552`, `systems/furnaceIntake.js:129`, `systems/furnaceIntake.js:178`, `systems/gateThreeWeir.js:318`, `systems/gateThreeWeir.js:336`, `systems/gravedigger.js:533`, `systems/holdfast.js:163`, `systems/impoundGrudge.js:489`, `systems/kesslerScale.js:267`, `systems/kesslerScale.js:317`, `systems/kesslerScale.js:363`, `systems/lamplighter.js:630`, `systems/mail.js:230`, `systems/memorialThief.js:103`, `systems/missionObjectiveOps.js:278`, `systems/missionObjectiveOps.js:1403`, `systems/missionSpawningOps.js:616`, `systems/missionSpawningOps.js:999`, `systems/missionSpawningOps.js:1350`, `systems/missionSpawningOps.js:1482`, `systems/missionSpawningOps.js:1496`, `systems/missionSpawningOps.js:1507`, `systems/missionSpawningOps.js:1710`, `systems/missionSpawningOps.js:1772`, `systems/missionStoryOps.js:165`, `systems/missionStoryOps.js:1364`, `systems/missionStoryOps.js:1406`, `systems/missionStoryOps.js:1753`, `systems/missionStoryOps.js:1761`, `systems/missionStoryOps.js:1775`, `systems/missionStoryOps.js:1781`, `systems/missionStoryOps.js:1787`, `systems/missionStoryOps.js:1793`, `systems/missionStoryOps.js:1805`, `systems/missionStoryOps.js:1816`, `systems/missionStoryOps.js:1825`, `systems/missionStoryOps.js:1871`, `systems/missionStoryOps.js:1876`, `systems/missionStoryOps.js:1888`, `systems/missionStoryOps.js:1962`, `systems/missionStoryOps.js:2076`, `systems/missionStoryOps.js:2080`, `systems/missionStoryOps.js:2429`, `systems/missionStoryOps.js:2511`, `systems/missionStoryOps.js:2674`, `systems/missionStoryOps.js:2683`, `systems/missionStoryOps.js:2701`, `systems/missionStoryOps.js:2720`, `systems/missionStoryOps.js:2740`, `systems/missionStoryOps.js:2752`, `systems/missions.js:4766`, `systems/missions.js:4931`, `systems/missions.js:5095`, `systems/missions.js:5105`, `systems/missions.js:5113`, `systems/moistureLoss.js:148`, `systems/mop.js:135`, `systems/onboarding.js:1621`, `systems/onboarding.js:4392`, `systems/onboarding.js:4560`, `systems/plants/afterHoursCoach.js:400`, `systems/plants/anselsDish.js:152`, `systems/plants/borrowedBoost.js:341`, `systems/plants/borrowedLadder.js:147`, `systems/plants/brokenTollPlant.js:302`, `systems/plants/busDoesntMove.js:392`, `systems/plants/busDoesntMove.js:413`, `systems/plants/carriedWord.js:362`, `systems/plants/carriedWord.js:366`, `systems/plants/chalkSeat.js:135`, `systems/plants/chasedThiefPlant.js:355`, `systems/plants/coatRack.js:154`, `systems/plants/coffeeHatch.js:145`, `systems/plants/convoyGodmother.js:367`, `systems/plants/coveredWindow.js:167`, `systems/plants/darkStretchPlant.js:326`, `systems/plants/deadStickPlant.js:271`, `systems/plants/doorstop.js:226`, `systems/plants/doorstop.js:274`, `systems/plants/doorstop.js:291`, `systems/plants/doorstop.js:299`, `systems/plants/ducklings.js:237`, `systems/plants/dutchAfterYou.js:232`, `systems/plants/farBerth.js:372`, `systems/plants/farePool.js:155`, `systems/plants/firstLight.js:358`, `systems/plants/glassPays.js:182`, `systems/plants/goodPatch.js:139`, `systems/plants/goodWord.js:180`, `systems/plants/gullDrone.js:135`, `systems/plants/kidMechanic.js:153`, `systems/plants/kindChecker.js:279`, `systems/plants/lanternLoan.js:137`, `systems/plants/litter.js:152`, `systems/plants/looseBolts.js:153`, `systems/plants/magpieReads.js:150`, `systems/plants/measuringHullPlant.js:316`, `systems/plants/mercies/pl269KindnessLocker.js:237`, `systems/plants/mercies/pl270StashedMedal.js:179`, `systems/plants/mercies/pl270StashedMedal.js:260`, `systems/plants/mercies/pl271MapInTheLid.js:295`, `systems/plants/mercies/pl271MapInTheLid.js:336`, `systems/plants/mercies/pl271MapInTheLid.js:368`, `systems/plants/mercies/pl272ForwardBeacon.js:224`, `systems/plants/mercies/pl272ForwardBeacon.js:238`, `systems/plants/mercies/pl272ForwardBeacon.js:302`, `systems/plants/mercies/pl364KindnessLedger.js:243`, `systems/plants/mercies/pl364KindnessLedger.js:294`, `systems/plants/mercies/pl365LampGarden.js:167`, `systems/plants/mercies/pl365LampGarden.js:242`, `systems/plants/mercies/pl365LampGarden.js:267`, `systems/plants/mercies/pl366RegistryHatch.js:202`, `systems/plants/mercies/pl366RegistryHatch.js:213`, `systems/plants/mercies/pl366RegistryHatch.js:251`, `systems/plants/mercies/pl367LingeringLift.js:254`, `systems/plants/mercies/pl367LingeringLift.js:303`, `systems/plants/mercies/pl367LingeringLift.js:314`, `systems/plants/mercies/pl368ThankYouSlate.js:194`, `systems/plants/mercies/pl368ThankYouSlate.js:204`, `systems/plants/mercies/pl368ThankYouSlate.js:247`, `systems/plants/mercies/pl369LastAllowance.js:192`, `systems/plants/mercies/pl369LastAllowance.js:248`, `systems/plants/mercies/pl369LastAllowance.js:281`, `systems/plants/mercies/pl369LastAllowance.js:295`, `systems/plants/mercies/pl369LastAllowance.js:343`, `systems/plants/mercies/pl370HousewarmingPart.js:162`, `systems/plants/mercies/pl370HousewarmingPart.js:186`, `systems/plants/mercies/pl371LaneTithe.js:183`, `systems/plants/mercies/pl371LaneTithe.js:217`, `systems/plants/mercies/pl372WreckersCourtesy.js:181`, `systems/plants/mercies/pl372WreckersCourtesy.js:205`, `systems/plants/mercies/pl373HearthLamp.js:162`, `systems/plants/mercies/pl373HearthLamp.js:212`, `systems/plants/mistaken.js:256`, `systems/plants/movingHousePlant.js:327`, `systems/plants/nightBell.js:147`, `systems/plants/orphanWreck.js:213`, `systems/plants/orphanWreck.js:240`, `systems/plants/otherSide.js:220`, `systems/plants/otherSide.js:256`, `systems/plants/overtimeMug.js:146`, `systems/plants/ownFaultPlant.js:399`, `systems/plants/paperTrail.js:134`, `systems/plants/paperTrail.js:183`, `systems/plants/pipsCounts.js:247`, `systems/plants/pl104Inventory.js:164`, `systems/plants/pl105Standoff.js:146`, `systems/plants/pl106PartsSled.js:117`, `systems/plants/pl107EmptySlot.js:114`, `systems/plants/pl124ParkedLight.js:224`, `systems/plants/pl124ParkedLight.js:260`, `systems/plants/pl125UnderPaint.js:97`, `systems/plants/pl125UnderPaint.js:130`, `systems/plants/pl126KeepingIt.js:174`, `systems/plants/pl126KeepingIt.js:194`, `systems/plants/pl128TheSurge.js:124`, `systems/plants/pl129SomebodysCrate.js:100`, `systems/plants/pl130TheStamp.js:120`, `systems/plants/pl146FirstCaller.js:253`, `systems/plants/pl147FirstPart.js:136`, `systems/plants/pl148TheCount.js:131`, `systems/plants/pl148TheCount.js:225`, `systems/plants/pl149SeedlingLean.js:164`, `systems/plants/pl150ItsSpot.js:165`, `systems/plants/pl151NoPapers.js:141`, `systems/plants/pl151NoPapers.js:261`, `systems/plants/pl152TheTally.js:122`, `systems/plants/pl152TheTally.js:137`, `systems/plants/pl153TheMinute.js:111`, `systems/plants/pl171RattleInB.js:130`, `systems/plants/pl172ShadeMarket.js:217`, `systems/plants/pl175First.js:203`, `systems/plants/pl175First.js:234`, `systems/plants/pl178SlingshotHour.js:133`, `systems/plants/pl179KesslersNumber.js:102`, `systems/plants/pl180ChalkThief.js:111`, `systems/plants/pl181HotCargo.js:117`, `systems/plants/pl182FlagTruce.js:120`, `systems/plants/pl183TheWeather.js:136`, `systems/plants/pl190DroneRange.js:143`, `systems/plants/pl192AgainMaybe.js:112`, `systems/plants/pl193OneShort.js:208`, `systems/plants/pl195FixedX.js:142`, `systems/plants/pl196MirrorRock.js:141`, `systems/plants/pl196MirrorRock.js:151`, `systems/plants/pl199TheJug.js:118`, `systems/plants/pl200TwoTaps.js:157`, `systems/plants/pl201OddQueue.js:217`, `systems/plants/pl203TheTour.js:185`, `systems/plants/pl204TheHook.js:315`, `systems/plants/pl214PyrrhaBox.js:228`, `systems/plants/pl214PyrrhaBox.js:248`, `systems/plants/pl215SomebodysStall.js:212`, `systems/plants/pl215SomebodysStall.js:233`, `systems/plants/pl216BlueMinute.js:172`, `systems/plants/pl231MarshsLine.js:206`, `systems/plants/pl232TheValidInstruction.js:191`, `systems/plants/pl232TheValidInstruction.js:244`, `systems/plants/pl233TheFreshMark.js:296`, `systems/plants/pl247TheScandal.js:241`, `systems/plants/pl247TheScandal.js:245`, `systems/plants/pl252RegularsHour.js:105`, `systems/plants/pl252RegularsHour.js:117`, `systems/plants/pl253WallDent.js:128`, `systems/plants/pl253WallDent.js:143`, `systems/plants/pl257GutterRun.js:245`, `systems/plants/pl259SpareAndShare.js:245`, `systems/plants/pl259SpareAndShare.js:257`, `systems/plants/pl260FiftiethVisit.js:106`, `systems/plants/pl261OpenTank.js:150`, `systems/plants/pl262GatheredPile.js:235`, `systems/plants/pl267QueuePass.js:227`, `systems/plants/pl333NoQuestionsShelf.js:283`, `systems/plants/pl334WindBreakChain.js:215`, `systems/plants/pl335DawnLine.js:247`, `systems/plants/pl336LampKeeper.js:169`, `systems/plants/pl337HonorUrn.js:186`, `systems/plants/pl338TowPost.js:178`, `systems/plants/pl339SignalMirror.js:197`, `systems/plants/pl340EchoCount.js:196`, `systems/plants/pl341RestringBuoys.js:214`, `systems/plants/pl342BleedVent.js:184`, `systems/plants/pl343LiftBell.js:197`, `systems/plants/pl344NeedsList.js:221`, `systems/plants/pl345KettleWindow.js:186`, `systems/plants/pl346FixedRope.js:219`, `systems/plants/pl347SmallHullDrum.js:220`, `systems/plants/pl348SeamKitchen.js:208`, `systems/plants/pl349MercyTug.js:213`, `systems/plants/pl350KeyWall.js:243`, `systems/plants/pl351SamplePad.js:247`, `systems/plants/pl352ChalkedName.js:231`, `systems/plants/pl353CleanStamp.js:205`, `systems/plants/pl354GoodHullRate.js:170`, `systems/plants/pl355TheUnit.js:134`, `systems/plants/pl355TheUnit.js:178`, `systems/plants/pl356ParadeBerth.js:201`, `systems/plants/pl357WarmGrid.js:119`, `systems/plants/pl357WarmGrid.js:154`, `systems/plants/pl358ApprenticesReturn.js:227`, `systems/plants/pl358ApprenticesReturn.js:251`, `systems/plants/pl358ApprenticesReturn.js:263`, `systems/plants/pl358ApprenticesReturn.js:281`, `systems/plants/pl359EscortsGift.js:170`, `systems/plants/pl359EscortsGift.js:225`, `systems/plants/pl359EscortsGift.js:262`, `systems/plants/pl360RainCheck.js:126`, `systems/plants/pl360RainCheck.js:159`, `systems/plants/pl360RainCheck.js:181`, `systems/plants/pl360RainCheck.js:188`, `systems/plants/pl361SecondStart.js:135`, `systems/plants/pl361SecondStart.js:184`, `systems/plants/pl362NameOnPlate.js:202`, `systems/plants/pl362NameOnPlate.js:226`, `systems/plants/pl363FamilyRate.js:190`, `systems/plants/pl363FamilyRate.js:234`, `systems/plants/ratRun.js:311`, `systems/plants/redAtHome.js:154`, `systems/plants/redMinute.js:275`, `systems/plants/rescueDividend.js:457`, `systems/plants/sameTimeTomorrowPlant.js:336`, `systems/plants/secondChair.js:149`, `systems/plants/sennaReads.js:245`, `systems/plants/shadowPilotPlant.js:305`, `systems/plants/sharedCab.js:406`, `systems/plants/someonesCourse.js:258`, `systems/plants/spareBed.js:379`, `systems/plants/stillEvenPlant.js:324`, `systems/plants/sweepingLine.js:312`, `systems/plants/theArch.js:246`, `systems/plants/theBrightOne.js:347`, `systems/plants/theOldTrail.js:320`, `systems/plants/theOtherName.js:176`, `systems/plants/theOtherName.js:198`, `systems/plants/theSampler.js:143`, `systems/plants/theWindowThatDoesnt.js:242`, `systems/plants/threeCount.js:273`, `systems/plants/tickingCratePlant.js:366`, `systems/plants/tipJar.js:131`, `systems/plants/tipLine.js:331`, `systems/plants/twoNames.js:218`, `systems/plants/twoRopes.js:273`, `systems/plants/umbrellaCrane.js:387`, `systems/plants/walkingLunch.js:157`, `systems/plants/weldersSparksPlant.js:301`, `systems/plants/windowWarmer.js:149`, `systems/plants/witness.js:180`, `systems/plants/yourBerth.js:149`, `systems/plants/yourBerth.js:182`, `systems/plants/yourWake.js:208`, `systems/quill.js:480`, `systems/receipt.js:111`, `systems/receipt.js:129`, `systems/receipt.js:177`, `systems/rookBooth.js:404`, `systems/rookBooth.js:435`, `systems/scenarioRuntime.js:189`, `systems/shepherd12.js:174`, `systems/slateColumn.js:138`, `systems/slateColumn.js:156`, `systems/slateColumn.js:180`, `systems/special500Director.js:272`, `systems/special500Invoice.js:122`, `systems/special500Question.js:89`, `systems/special500ReadEverything.js:70`, `systems/story.js:589`, `systems/story.js:1412`, `systems/story.js:1440`, `systems/tallyho.js:461`, `systems/tallyho.js:514`, `systems/tallyho.js:662`, `systems/tare.js:129`, `systems/wexTicket.js:121`, `systems/worldClock.js:214`, `ui/station/screens/bar.js:1041` | `audio/audioSystem.js:3264`, `ui/screens/codex.js:1361` |
| `concord:clampAttached` | `systems/faction_concord.js:270` | — |
| `concord:clampReleased` | `systems/faction_concord.js:246` | — |
| `concord:formationLocked` | `systems/faction_concord.js:209` | — |
| `concord:formationReformed` | `systems/faction_concord.js:226` | — |
| `conflict:flip` | `systems/factions.js:917` | `systems/factionPresence.js:529`, `systems/gateControlDirector.js:80`, `systems/sectorSim.js:148`, `systems/story.js:274` |
| `conflict:frontAction` | `systems/factions.js:787` | — |
| `conflict:warDeclared` | `systems/factions.js:847` | — |
| `contactHail:availability` | `systems/scanner.js:2200`, `systems/scanner.js:2219` | — |
| `contactHail:cancel` | `ui/contactHailPrompt.js:169` | `systems/scanner.js:1130` |
| `contactHail:choice` | `ui/commsRadial.js:536`, `ui/contactHailPrompt.js:295` | `systems/scanner.js:1129`, `systems/special500Question.js:105` |
| `contactHail:clear` | `systems/scanner.js:1794`, `systems/scanner.js:1811`, `systems/scanner.js:1823`, `systems/scanner.js:1838`, `systems/scanner.js:1995`, `systems/scanner.js:2237` | — |
| `contactHail:handoff` | `systems/scanner.js:1879` | — |
| `contactHail:offer` | `systems/scanner.js:1844`, `systems/scanner.js:1922`, `systems/scanner.js:2179` | — |
| `contactHail:request` | `ui/commsRadial.js:597`, `ui/contactHailPrompt.js:289` | `systems/scanner.js:1128`, `systems/special500Question.js:104` |
| `contactHail:response` | `systems/scanner.js:1827`, `systems/scanner.js:1947`, `systems/scanner.js:2007` | `systems/traffic.js:1885` |
| `contraband:bribe` | `systems/encounterScripts.js:432` | `systems/economy.js:1944` |
| `contraband:scanned` | `systems/economy.js:6140` | `systems/encounterDirector.js:387`, `systems/factions.js:527`, `systems/heat.js:382`, `systems/lawSecurity.js:430`, `systems/lawSecurity.js:449`, `ui/customsPrompt.js:60` |
| `contract:clauseBroken` | `systems/contractClauses.js:787` | `systems/missions.js:931` |
| `contract:clauseHonored` | `systems/contractClauses.js:706`, `systems/missions.js:5127` | `systems/contractClauses.js:385` |
| `contract:clauseSettledKill` | `systems/contractClauses.js:563` | `systems/missions.js:804` |
| `countermeasure:denied` | `systems/countermeasures.js:572` | — |
| `countermeasure:deployed` | `systems/countermeasures.js:554` | `render/shipMicroMotion.js:1773` |
| `counterplay:encountered` | `ai/counterplay/adventure.js:82` | `ui/toasts.js:722` |
| `counterweightCircuit:action` | `features/counterweightCircuit/prompts.js:61` | — |
| `counterweightCircuit:attemptStarted` | `features/counterweightCircuit/runtime.js:150` | — |
| `counterweightCircuit:close` | `features/counterweightCircuit/runtime.js:307` | `ui/screens/missionLog.js:2768` |
| `counterweightCircuit:discovered` | `features/counterweightCircuit/runtime.js:506` | — |
| `counterweightCircuit:offer` | `features/counterweightCircuit/runtime.js:273` | — |
| `counterweightCircuit:view` | `features/counterweightCircuit/runtime.js:460` | `ui/screens/missionLog.js:2767` |
| `craft:cancelled` | `systems/crafting.js:382` | — |
| `craft:complete` | `systems/crafting.js:351`, `systems/crafting.js:423` | `ui/station/screens/industry.js:747` |
| `craft:queueChanged` | `systems/crafting.js:212`, `systems/crafting.js:236`, `systems/crafting.js:361`, `systems/crafting.js:383` | `render/authoredMotion.js:1181`, `systems/onboarding.js:1002`, `ui/station/screens/industry.js:747` |
| `credits:changed` | `systems/economy.js:4682`, `systems/economy.js:4732`, `systems/economy.js:4817`, `systems/economy.js:4829` | `audio/audioSystem.js:3094`, `balance/hunterPublicRoute.js:469`, `ui/commandBar.js:257` |
| `crew:decide` | `ui/crewPrompt.js:83` | `systems/crew.js:94` |
| `crew:decisionOffer` | `systems/crew.js:309` | `ui/crewPrompt.js:95` |
| `crew:decline` | `ui/crewPrompt.js:49` | `systems/crew.js:84` |
| `crew:demandSettled` | `systems/crew.js:627` | — |
| `crew:hire` | `ui/crewPrompt.js:46` | `systems/crew.js:83` |
| `crew:hireDenied` | `systems/crew.js:355`, `systems/crew.js:365` | — |
| `crew:hired` | `systems/crew.js:385` | — |
| `crew:injured` | `systems/crew.js:804` | — |
| `crew:lost` | `systems/crew.js:792` | — |
| `crew:loyalty` | `systems/crew.js:744` | — |
| `crew:promoted` | `systems/crew.js:668` | — |
| `crew:quit` | `systems/crew.js:647` | — |
| `crew:recruitOffer` | `systems/crew.js:287` | `ui/crewPrompt.js:94` |
| `crew:salvage` | `systems/crew.js:694` | — |
| `crew:strike` | `systems/crew.js:542` | — |
| `crew:strikeSettled` | `systems/crew.js:593` | — |
| `crew:wagesPaid` | `systems/crew.js:505` | — |
| `cruise:charging` | `systems/cruise.js:178` | `render/vfx.js:3069`, `systems/presentationOrchestrator.js:187` |
| `cruise:dropped` | `systems/cruise.js:250` | `audio/audioSystem.js:3252`, `render/authoredMotion.js:1188`, `render/vfx.js:3071`, `systems/presentationOrchestrator.js:189` |
| `cruise:engaged` | `systems/cruise.js:133` | `audio/audioSystem.js:3248`, `render/vfx.js:3070`, `systems/presentationOrchestrator.js:188` |
| `cruise:snareRequest` | `systems/encounterScripts.js:612` | `render/authoredMotion.js:1187`, `systems/cruise.js:74` |
| `cruise:snared` | `systems/cruise.js:249` | `audio/audioSystem.js:3256` |
| `cruise:wrestleEscaped` | `systems/cruise.js:145` | — |
| `cruise:wrestleStarted` | `systems/cruise.js:82` | — |
| `custody:aftermathChanged` | — | `systems/combatOutcome.js:293` |
| `custody:aftermathSettled` | — | `systems/aftermathWrecks.js:1281` |
| `customs:breakScan` | `systems/encounterScripts.js:407` | `render/authoredMotion.js:1199` |
| `customs:massSlipFiled` | — | `systems/economyContracts.js:267` |
| `customs:scanAborted` | — | `ui/customsPrompt.js:61` |
| `customs:scanWaived` | — | `ui/customsPrompt.js:63` |
| `customs:submit` | `systems/encounterScripts.js:443` | `render/authoredMotion.js:1198`, `systems/lawSecurity.js:445` |
| `customs:trustMarked` | — | `ui/customsPrompt.js:62` |
| `customs:weirBolt` | — | `systems/economy.js:1943`, `systems/heat.js:397` |
| `danger:miningNoise` | `systems/mining.js:3022` | `audio/audioSystem.js:3039` |
| `day:tick` | `core/coreSystem.js:645` | `systems/crew.js:121`, `systems/custodyConsequences.js:58`, `systems/economy.js:1827`, `systems/encounterDirector.js:356`, `systems/factions.js:559`, `systems/impoundLot.js:1095`, `systems/sectorSim.js:128` |
| `debug:invulnerable` | `ui/screens/crucibleLabControls.js:233` | `systems/combat.js:472` |
| `debug:refillPlayer` | `ui/screens/crucibleLabControls.js:224` | `systems/combat.js:471` |
| `deniable:fenceBurned` | — | `systems/fenceDesk.js:52` |
| `deniable:fenceEmboldened` | — | `systems/fenceDesk.js:51` |
| `deniable:fenceThanked` | `systems/encounterDirector.js:1206` | `systems/fenceDesk.js:50` |
| `derby:finished` | `data/encounters/706-breaker-derby.js:213` | — |
| `derby:slam` | `data/encounters/706-breaker-derby.js:143`, `data/encounters/706-breaker-derby.js:165` | — |
| `detonator:detonated` | `systems/impulseCharges.js:672` | — |
| `difficulty:pinReleased` | `systems/difficultyDirector.js:359` | `systems/combatOutcome.js:300` |
| `difficulty:stanceChanged` | `systems/difficultyDirector.js:410` | — |
| `discovery:chartFiled` | `systems/world.js:5339` | — |
| `discovery:plateUnlocked` | `systems/world.js:1147`, `systems/world.js:7343`, `systems/world.js:7980`, `systems/world.js:8606` | `audio/audioSystem.js:3147`, `ui/discoveryPlate.js:205`, `ui/screens/codex.js:1363` |
| `distress:call` | `systems/trafficRoleOps.js:264`, `systems/trafficRoleOps.js:317` | `audio/audioSystem.js:3007` |
| `distress:rescued` | `systems/encounterScripts.js:827` | `systems/factions.js:537` |
| `dock:attempt` | `ui/input.js:376` | `ui/dockDenyBanner.js:54` |
| `dock:committed` | `ui/dockStateCommit.js:19` | `systems/encounterDirector.js:436`, `systems/special500Confessional.js:134`, `ui/alerts.js:544` |
| `dock:denied` | `ui/dockDenyBanner.js:80` | `render/authoredMotion.js:1230` |
| `dock:docked` | `balance/careerCohorts.js:533`, `balance/careerCohorts.js:2010`, `balance/careerCohorts.js:2071`, `balance/careerCohorts.js:2337`, `balance/courierPublicRoute.js:595`, `balance/courierPublicRoute.js:800`, `balance/courierPublicRoute.js:821`, `balance/courierPublicRoute.js:929`, `balance/courierPublicRoute.js:1068`, `balance/courierPublicRoute.js:1114`, `balance/courierPublicRoute.js:1250`, `balance/courierPublicRoute.js:1308`, `balance/courierPublicRoute.js:1429`, `balance/courierPublicRoute.js:1463`, `balance/courierPublicRoute.js:1551`, `balance/courierPublicRoute.js:1617`, `balance/hunterPublicRoute.js:656`, `balance/hunterPublicRoute.js:774`, `balance/hunterPublicRoute.js:867`, `balance/hunterPublicRoute.js:968`, `balance/hunterPublicRoute.js:1059`, `balance/prospectorPublicRoute.js:558`, `balance/prospectorPublicRoute.js:832`, `balance/prospectorPublicRoute.js:918`, `balance/prospectorPublicRoute.js:1122`, `balance/prospectorPublicRoute.js:1251`, `systems/world.js:7835`, `ui/input.js:380` | `audio/audioSystem.js:3150`, `careers/origins/haulerOriginSystem.js:62`, `careers/origins/prospectorOrigin.js:630`, `render/authoredMotion.js:1228`, `render/infrastructureMotion.js:290`, `render/shipMicroMotion.js:1763`, `save/saveSystem.js:575`, `systems/achievements.js:1204`, `systems/aftermathWrecks.js:1278`, `systems/autoTargetAssist.js:148`, `systems/barkDirector.js:959`, `systems/combat.js:422`, `systems/crew.js:126`, `systems/economy.js:1902`, `systems/economyContracts.js:248`, `systems/encounterDirector.js:435`, `systems/factionPresence.js:514`, `systems/fenceDesk.js:49`, `systems/impoundLot.js:1096`, `systems/lawSecurity.js:440`, `systems/lawSecurity.js:444`, `systems/mining.js:307`, `systems/mining.js:309`, `systems/missions.js:680`, `systems/onboarding.js:711`, `systems/onboarding.js:968`, `systems/pirateDisguise.js:436`, `systems/scanner.js:1135`, `systems/shieldPylons.js:247`, `systems/special500CollectiveHours.js:39`, `systems/special500DockLedger.js:124`, `systems/special500ForgeKaraoke.js:45`, `systems/special500HullLog.js:45`, `systems/special500Invoice.js:73`, `systems/stationServices.js:329`, `systems/story.js:233`, `systems/world.js:854`, `systems/world.js:913`, `ui/cargoConscience.js:144`, `ui/causeLedger.js:235`, `ui/comms.js:153`, `ui/contextWheel.js:350`, `ui/dockDenyBanner.js:55`, `ui/impoundPayPrompt.js:73`, `ui/impoundPayPrompt.js:78`, `ui/impoundPayPrompt.js:89`, `ui/priceForecast.js:86`, `ui/promptDeck.js:944`, `ui/securityReadout.js:158`, `ui/station/screens/bar.js:208`, `ui/uiRoot.js:1602`, `ui/watchlistHud.js:90`, `ui/wingmanRadial.js:356`, `ui/worldObjectInteraction.js:470`, `ui/wreckChoicePrompt.js:61` |
| `dock:launder` | `ui/station/launderService.js:22`, `ui/station/launderService.js:73` | `systems/pirateDisguise.js:437` |
| `dock:range` | `core/physics.js:1721`, `core/physics.js:1725`, `ui/input.js:349` | `render/authoredMotion.js:1227`, `systems/onboarding.js:872`, `systems/plants/doorstop.js:124`, `systems/plants/litter.js:74`, `systems/plants/paperTrail.js:75`, `systems/plants/redAtHome.js:81`, `systems/plants/theOtherName.js:91`, `systems/plants/twoNames.js:100`, `systems/plants/witness.js:93`, `systems/plants/yourBerth.js:89`, `ui/alerts.js:519`, `ui/input.js:355` |
| `dock:undocked` | `balance/careerCohorts.js:534`, `balance/careerCohorts.js:2015`, `balance/careerCohorts.js:2076`, `balance/careerCohorts.js:2414`, `balance/courierPublicRoute.js:239`, `balance/hunterPublicRoute.js:174`, `balance/prospectorPublicRoute.js:273`, `ui/input.js:1179`, `ui/station/stationApp.js:1195` | `audio/audioSystem.js:3155`, `render/authoredMotion.js:1229`, `render/infrastructureMotion.js:291`, `render/shipMicroMotion.js:1764`, `render/vfx.js:2891`, `save/saveSystem.js:576`, `systems/combat.js:427`, `systems/economy.js:1916`, `systems/economyContracts.js:277`, `systems/factionPresence.js:515`, `systems/missions.js:712`, `systems/moralTrap.js:188`, `systems/onboarding.js:798`, `systems/pirateDisguise.js:440`, `systems/presentationAdapters.js:345`, `systems/special500Sommelier.js:27`, `systems/stationServices.js:330`, `systems/wingmen.js:175`, `systems/world.js:855`, `ui/comms.js:154`, `ui/impoundPayPrompt.js:76`, `ui/impoundPayPrompt.js:81`, `ui/input.js:363`, `ui/moralTrapPrompt.js:42`, `ui/uiRoot.js:1675`, `ui/wreckChoicePrompt.js:66` |
| `docket:delivered` | `systems/docket.js:219` | — |
| `docket:met` | `systems/docket.js:182`, `systems/docket.js:187` | — |
| `docket:voice` | `systems/docket.js:154` | — |
| `drift:claimContested` | `systems/faction_drift.js:244` | — |
| `drift:claimLifted` | `systems/faction_drift.js:217` | — |
| `drift:claimStaked` | `systems/faction_drift.js:240` | — |
| `drill:approachCancelled` | `systems/tetherGameplay.js:1726` | `ui/uiRoot.js:1744` |
| `drill:approachCompleted` | `systems/tetherGameplay.js:1711`, `ui/sandbox/sandboxSetup.js:743` | `ui/uiRoot.js:1728` |
| `drill:approachRequested` | `ui/fieldBuild/fieldBuildMode.js:487`, `ui/input.js:1086` | `systems/tetherGameplay.js:374` |
| `drill:approachStarted` | `systems/tetherGameplay.js:1603`, `ui/sandbox/sandboxSetup.js:742` | `ui/asteroid/asteroidScreen.js:2754`, `ui/uiRoot.js:1715` |
| `drill:backblast` | `systems/drill.js:1565` | `ui/asteroid/asteroidScreen.js:2656` |
| `drill:beginRejected` | `systems/input.js:1301` | `ui/asteroid/asteroidScreen.js:2613` |
| `drill:break` | `systems/asteroidSites.js:3702`, `systems/drill.js:1491`, `systems/drill.js:1519`, `systems/drill.js:1664`, `systems/drill.js:2005` | `audio/audioSystem.js:3483`, `render/authoredMotion.js:1192`, `systems/asteroidSites.js:705`, `systems/presentationOrchestrator.js:237`, `ui/asteroid/asteroidScreen.js:2683`, `ui/screens/drill.js:2007` |
| `drill:cargoFull` | `systems/drill.js:236`, `systems/drill.js:332` | `audio/audioSystem.js:3485`, `systems/presentationOrchestrator.js:244`, `ui/asteroid/asteroidScreen.js:2640`, `ui/screens/drill.js:1978` |
| `drill:caveIn` | `systems/drill.js:1684` | `audio/audioSystem.js:3491`, `systems/asteroidSites.js:725`, `ui/asteroid/asteroidScreen.js:2666` |
| `drill:chargeArm` | `systems/drill.js:1372`, `systems/drill.js:1382`, `systems/drill.js:1404` | — |
| `drill:chargeBlast` | `systems/drill.js:1571` | `audio/audioSystem.js:3488`, `systems/asteroidSites.js:765`, `ui/asteroid/asteroidScreen.js:2649` |
| `drill:chargePlanted` | `systems/drill.js:1445` | `audio/audioSystem.js:3487`, `systems/asteroidSites.js:764`, `ui/asteroid/asteroidScreen.js:2644` |
| `drill:chargeTick` | `systems/drill.js:1750` | `audio/audioSystem.js:3489` |
| `drill:end` | `systems/drill.js:1023` | `audio/audioSystem.js:3499`, `render/authoredMotion.js:1193`, `systems/asteroidSites.js:767`, `systems/faction_pitborn.js:645`, `systems/presentationOrchestrator.js:245` |
| `drill:gasHit` | `systems/drill.js:1541`, `systems/drill.js:2034` | `audio/audioSystem.js:3484`, `systems/presentationOrchestrator.js:239`, `ui/asteroid/asteroidScreen.js:2627`, `ui/screens/drill.js:1907` |
| `drill:gasVent` | `systems/drill.js:1490` | `audio/audioSystem.js:3492`, `systems/asteroidSites.js:740`, `ui/asteroid/asteroidScreen.js:2672` |
| `drill:retry` | `systems/drill.js:1072` | `systems/presentationOrchestrator.js:246` |
| `drill:rockCreak` | `systems/drill.js:1633` | `audio/audioSystem.js:3490`, `ui/asteroid/asteroidScreen.js:2660` |
| `drill:rockDepleted` | `systems/drill.js:252`, `systems/drill.js:281`, `systems/drill.js:341`, `systems/drill.js:985` | `audio/audioSystem.js:3486`, `ui/asteroid/asteroidScreen.js:2637`, `ui/screens/drill.js:1969` |
| `drill:scanPulse` | `systems/drill.js:1151` | `audio/audioSystem.js:3493`, `systems/asteroidSites.js:791`, `systems/presentationOrchestrator.js:235`, `ui/asteroid/asteroidScreen.js:2677`, `ui/screens/drill.js:1995` |
| `drill:spark` | `systems/drill.js:1973` | `audio/audioSystem.js:3482`, `systems/presentationOrchestrator.js:236`, `ui/asteroid/asteroidScreen.js:2688`, `ui/screens/drill.js:2028` |
| `drill:start` | `systems/drill.js:976` | `audio/audioSystem.js:3498`, `render/authoredMotion.js:1191`, `systems/asteroidSites.js:697`, `systems/onboarding.js:973`, `systems/presentationOrchestrator.js:234`, `ui/asteroid/asteroidScreen.js:2616` |
| `drill:warn` | `systems/drill.js:237`, `systems/drill.js:259`, `systems/drill.js:300`, `systems/drill.js:333`, `systems/drill.js:991`, `systems/drill.js:996`, `systems/drill.js:1415`, `systems/drill.js:1634`, `systems/drill.js:1832`, `systems/drill.js:1862`, `systems/drill.js:1885`, `systems/drill.js:1906` | `audio/audioSystem.js:3494`, `systems/presentationOrchestrator.js:233`, `ui/asteroid/asteroidRenderer3d.js:7485`, `ui/asteroid/asteroidScreen.js:2633`, `ui/screens/drill.js:1935` |
| `drill:yield` | `systems/drill.js:279`, `systems/drill.js:328` | `audio/audioSystem.js:3479`, `systems/missions.js:783`, `systems/presentationOrchestrator.js:238`, `ui/asteroid/asteroidScreen.js:2619`, `ui/screens/drill.js:1885` |
| `drone:grindStart` | `systems/automation.js:1178` | `render/authoredMotion.js:1177` |
| `drone:grindStop` | — | `render/authoredMotion.js:1178` |
| `dyingHull:begin` | `systems/dyingHull.js:356` | `render/vfx.js:2974` |
| `dyingHull:lost` | `systems/dyingHull.js:267`, `systems/dyingHull.js:416` | `render/vfx.js:2976` |
| `dyingHull:ruptured` | `systems/dyingHull.js:506` | `render/vfx.js:2975` |
| `ecology:claimCrew` | `systems/alienEcology.js:3093` | — |
| `ecology:coherence` | `systems/alienEcology.js:1693` | — |
| `ecology:collar` | `systems/alienEcology.js:797` | — |
| `ecology:evidence` | `systems/precursorMachines.js:134`, `systems/precursorMachines.js:135`, `systems/precursorMachines.js:417`, `systems/precursorMachines.js:803`, `systems/precursorMachines.js:835`, `systems/precursorMachines.js:1223`, `world/motionFossil.js:256`, `world/veilRayNursery.js:158` | `systems/world.js:916` |
| `ecology:factionOutcome` | `systems/economy.js:3599`, `systems/economy.js:3903` | `systems/world.js:915` |
| `ecology:fossilRecorded` | `world/motionFossil.js:231` | — |
| `ecology:fossilSettled` | `world/motionFossil.js:257` | — |
| `ecology:quarantinePulse` | `systems/precursorMachines.js:753` | `systems/world.js:917` |
| `ecology:relayPulse` | `systems/alienEcology.js:1813` | `audio/audioSystem.js:3514` |
| `ecology:setpiece` | `systems/alienEcology.js:1844`, `systems/alienEcology.js:3312`, `systems/alienEcology.js:3379` | — |
| `economy:applyTradePressure` | `systems/automation.js:1036`, `systems/automation.js:2139`, `systems/automation.js:2140`, `systems/claims.js:1390`, `systems/encounterDirector.js:2863`, `systems/encounterDirector.js:2911`, `systems/lossLedger.js:617`, `systems/scavengerOccupationSwitch.js:588`, `systems/sectorSim.js:446`, `systems/trafficCausalChainOps.js:2786`, `systems/trafficRecoveryOps.js:333` | `systems/economy.js:1863` |
| `economy:auditorTally` | `systems/economy.js:4313` | — |
| `economy:automationIntake` | `systems/economy.js:3371` | — |
| `economy:cargoKillOpportunity` | `systems/economy.js:3772` | `systems/missions.js:778` |
| `economy:chargeCredits` | `data/encounters/1206-the-fire-sale.js:259`, `data/encounters/1208-the-vetting.js:241`, `data/encounters/1212-the-clean-sheet.js:314`, `features/breakwaterSpur/services.js:113`, `features/salvageTender/services.js:58`, `features/shipbreakingYard/runtime.js:281`, `shipjack/fleetOperations.js:116`, `shipjack/yardOperations.js:128`, `shipjack/yardOperations.js:194`, `shipjack/yardOperations.js:226`, `shipjack/yardOperations.js:239`, `systems/automation.js:2435`, `systems/automation.js:2443`, `systems/automation.js:3699`, `systems/automation.js:3927`, `systems/automation.js:3940`, `systems/beacons.js:86`, `systems/beamRepairResources.js:99`, `systems/bombs.js:897`, `systems/bombs.js:980`, `systems/bombs.js:998`, `systems/bombs.js:1064`, `systems/borrowedSun.js:687`, `systems/borrowedSun.js:1280`, `systems/claims.js:395`, `systems/claims.js:465`, `systems/claims.js:536`, `systems/claims.js:1478`, `systems/combat.js:1063`, `systems/crew.js:381`, `systems/crew.js:504`, `systems/crew.js:589`, `systems/crew.js:622`, `systems/drill.js:1430`, `systems/economy.js:5471`, `systems/eighthBellRuntime.js:304`, `systems/encounterDirector.js:2857`, `systems/faction_archive.js:752`, `systems/faction_choir.js:1035`, `systems/faction_helix.js:608`, `systems/faction_meridian.js:425`, `systems/faction_pitborn.js:686`, `systems/faction_understory.js:2041`, `systems/faction_understory.js:2072`, `systems/faction_vael.js:535`, `systems/faction_vael.js:850`, `systems/faction_verge.js:704`, `systems/faction_verge.js:970`, `systems/faction_verge.js:1433`, `systems/faction_verge.js:1484`, `systems/factions.js:645`, `systems/fenceDesk.js:355`, `systems/gateControlDirector.js:129`, `systems/gateThreeWeir.js:538`, `systems/gateThreeWeir.js:608`, `systems/gateThreeWeir.js:640`, `systems/gateThreeWeir.js:723`, `systems/gravedigger.js:586`, `systems/impoundGrudge.js:748`, `systems/impoundGrudge.js:816`, `systems/longBerth.js:285`, `systems/manifestGame.js:32`, `systems/missions.js:1386`, `systems/missions.js:1587`, `systems/missions.js:1590`, `systems/npcJobsRuntime.js:3756`, `systems/npcJobsRuntime.js:6250`, `systems/pirateParley.js:896`, `systems/plants/litter.js:149`, `systems/plants/pl215SomebodysStall.js:231`, `systems/quill.js:702`, `systems/quill.js:723`, `systems/quill.js:858`, `systems/shieldPylons.js:291`, `systems/shipjack.js:230`, `systems/ships.js:2623`, `systems/ships.js:2794`, `systems/ships.js:2901`, `systems/ships.js:2930`, `systems/special500Confessional.js:263`, `systems/special500Invoice.js:162`, `systems/special500Invoice.js:187`, `systems/special500Sommelier.js:94`, `systems/special500Sommelier.js:153`, `systems/tallyho.js:638`, `systems/world.js:5376`, `systems/world.js:5420`, `systems/world.js:6946` | `systems/economy.js:1816` |
| `economy:coldChainArmed` | `systems/economy.js:4486` | — |
| `economy:coldChainSpoiled` | `systems/economy.js:4543` | — |
| `economy:convoyShareBought` | `systems/economy.js:4104` | — |
| `economy:convoyShareSettled` | `systems/economy.js:4380`, `systems/economy.js:4434` | — |
| `economy:debtEscalated` | `systems/economy.js:5318` | — |
| `economy:demandShift` | `systems/economy.js:2539` | — |
| `economy:eventEnded` | `systems/economy.js:6234` | — |
| `economy:eventStarted` | `systems/economy.js:6209` | — |
| `economy:forwardSlipBought` | `systems/economy.js:4158` | — |
| `economy:forwardSlipSettled` | `systems/economy.js:4402`, `systems/economy.js:4447` | — |
| `economy:freightAccepted` | `systems/economy.js:3986`, `systems/economy.js:4038` | `systems/claims.js:358`, `systems/economyContracts.js:251`, `systems/missions.js:774` |
| `economy:grantCredits` | `features/industrialDisasters/runtime.js:441`, `features/rigWorkshop/jobs.js:292`, `missions/lanternWardStory.js:71`, `shipjack/fleetOperations.js:98`, `shipjack/fleetOperations.js:136`, `shipjack/yardOperations.js:195`, `shipjack/yardOperations.js:263`, `systems/alienEcology.js:978`, `systems/automation.js:2564`, `systems/automation.js:2575`, `systems/automation.js:3684`, `systems/bellhop.js:221`, `systems/bombs.js:1017`, `systems/borrowedSun.js:639`, `systems/cargo.js:1284`, `systems/claims.js:1389`, `systems/claims.js:2253`, `systems/combat.js:879`, `systems/combat.js:891`, `systems/combat.js:1071`, `systems/crew.js:689`, `systems/encounterDirector.js:2858`, `systems/faction_archive.js:721`, `systems/faction_archive.js:734`, `systems/faction_choir.js:944`, `systems/faction_choir.js:981`, `systems/faction_choir.js:1137`, `systems/faction_choir.js:1416`, `systems/faction_choir.js:1626`, `systems/faction_frontier.js:1519`, `systems/faction_fulfillment.js:415`, `systems/faction_helix.js:601`, `systems/faction_meridian.js:419`, `systems/faction_pitborn.js:680`, `systems/faction_pitborn.js:805`, `systems/faction_understory.js:1245`, `systems/faction_understory.js:1341`, `systems/faction_vael.js:529`, `systems/faction_verge.js:896`, `systems/fenceDesk.js:265`, `systems/fenceDesk.js:300`, `systems/gateThreeWeir.js:426`, `systems/gateThreeWeir.js:596`, `systems/gravedigger.js:581`, `systems/impoundGrudge.js:677`, `systems/lamplighter.js:651`, `systems/manifestGame.js:15`, `systems/mining.js:2589`, `systems/mining.js:2784`, `systems/mining.js:2945`, `systems/missionStoryOps.js:2337`, `systems/missions.js:4960`, `systems/missions.js:5140`, `systems/missions.js:5143`, `systems/missions.js:5688`, `systems/moralTrap.js:326`, `systems/npcJobsRuntime.js:3771`, `systems/npcJobsRuntime.js:4058`, `systems/plants/glassPays.js:140`, `systems/plants/glassPays.js:146`, `systems/plants/pl151NoPapers.js:256`, `systems/quill.js:676`, `systems/quill.js:762`, `systems/quill.js:774`, `systems/rookBooth.js:562`, `systems/scanReveal.js:206`, `systems/scanReveal.js:241`, `systems/scavengerOccupationSwitch.js:603`, `systems/shieldPylons.js:337`, `systems/shieldPylons.js:573`, `systems/ships.js:2713`, `systems/ships.js:3066`, `systems/stationServices.js:479`, `systems/survivorPod.js:1692`, `systems/survivorPod.js:2065`, `systems/tallyho.js:632`, `systems/uniqueWrecks.js:2003`, `systems/uniqueWrecks.js:2132`, `systems/world.js:5331`, `systems/wreckCourt.js:1029` | `systems/economy.js:1812`, `systems/onboarding.js:727`, `systems/story.js:268` |
| `economy:marketContractExpired` | `systems/economy.js:4367`, `systems/economy.js:4521` | — |
| `economy:marketOpened` | `ui/station/screens/market.js:2960` | `systems/economy.js:1832` |
| `economy:oreFlood` | `systems/sectorSim.js:718` | `systems/barkDirector.js:945`, `systems/economy.js:1891` |
| `economy:payBounty` | `ui/screens/footprint.js:1662` | `systems/economy.js:1819` |
| `economy:podIntakeAccepted` | `systems/economy.js:4199`, `systems/economy.js:4214` | — |
| `economy:releaseDebt` | `systems/stationServices.js:488` | `systems/economy.js:1817` |
| `economy:salvageIntakeApplied` | `systems/economy.js:4800` | `ui/alerts.js:579` |
| `economy:shortageRelieved` | `systems/economy.js:4030` | `systems/missions.js:775` |
| `economy:shortageRepairRestored` | `systems/economyContracts.js:873` | — |
| `economy:sinkCharged` | `systems/economy.js:4843` | `ui/alerts.js:595` |
| `economy:tick` | `systems/economy.js:2312` | `systems/achievements.js:1190`, `systems/economyContracts.js:290` |
| `economy:towCharge` | `systems/world.js:7805` | `systems/economy.js:1936` |
| `economy:tradeCompleted` | `systems/economy.js:3585` | `audio/audioSystem.js:3097`, `audio/audioSystem.js:3214`, `careers/origins/haulerOriginSystem.js:90`, `careers/origins/prospectorOrigin.js:648`, `save/saveSystem.js:583`, `systems/claims.js:355`, `systems/factions.js:503`, `systems/missions.js:760`, `systems/missions.js:776`, `systems/onboarding.js:718`, `systems/sectorSim.js:143`, `systems/story.js:263`, `ui/adventureDecisions.js:453`, `ui/station/screens/market.js:2475` |
| `economy:tradeFailed` | `systems/economy.js:3856`, `systems/economy.js:3888` | `audio/audioSystem.js:3103`, `ui/adventureDecisions.js:454`, `ui/station/screens/market.js:2474` |
| `emergent:audio` | `systems/emergentPrimitives.js:185`, `systems/environmentMaterials.js:259` | `audio/emergentPrimitiveVoice.js:83` |
| `emergent:contact` | `systems/emergentPrimitives.js:191` | `render/feel.js:1794` |
| `encounter:ambientPredationCleared` | — | `systems/barkDirector.js:936` |
| `encounter:ambientPredationTelegraph` | — | `systems/barkDirector.js:935` |
| `encounter:choiceOffered` | `features/industrialDisasters/presentation.js:140`, `features/industrialDisasters/presentation.js:188`, `systems/encounterDirector.js:2659` | `ui/encounterChoicePrompt.js:175` |
| `encounter:choose` | `ui/encounterChoicePrompt.js:44` | `systems/encounterDirector.js:411` |
| `encounter:claimDefenseRoster` | `systems/encounterDirector.js:1859` | — |
| `encounter:convoyEscorted` | `systems/encounterScripts.js:3339` | — |
| `encounter:distressBroadcast` | `systems/encounterScripts.js:787` | `systems/encounterDirector.js:426` |
| `encounter:fingerprint` | `systems/encounterDirector.js:2791` | — |
| `encounter:hostileCommitted` | `data/encounters/353-the-wake.js:179`, `data/encounters/354-the-sweep.js:203`, `data/encounters/586-the-blank-page.js:323`, `systems/encounterDirector.js:3532` | — |
| `encounter:lootSweepCollected` | `ai/lootSweep.js:494` | — |
| `encounter:lootSweepDispatched` | `ai/lootSweep.js:296` | — |
| `encounter:lootSweepEnded` | `ai/lootSweep.js:327` | — |
| `encounter:namedCaptainBound` | `systems/missionSpawningOps.js:1191` | `systems/encounterDirector.js:385` |
| `encounter:namedCaptainDefeated` | `systems/encounterDirector.js:3057`, `systems/encounterScripts.js:3951` | — |
| `encounter:patrolIntervened` | `systems/encounterDirector.js:3492` | `systems/barkDirector.js:903` |
| `encounter:predationCleared` | `systems/encounterScripts.js:1318` | — |
| `encounter:predationEngaged` | `systems/encounterScripts.js:1235`, `systems/encounterScripts.js:1303` | `render/authoredMotion.js:1196` |
| `encounter:predationTelegraph` | — | `render/authoredMotion.js:1213` |
| `encounter:receipt` | `systems/encounterDirector.js:2808` | `ui/recoveryEncounterPrompt.js:499` |
| `encounter:resolved` | `features/industrialDisasters/presentation.js:113`, `systems/encounterDirector.js:2786`, `systems/encounterDirector.js:2841`, `systems/survivalArena.js:1957` | `audio/audioSystem.js:3159`, `data/encounters/362-the-salvage-watch.js:80`, `data/encounters/367-the-salvage-tail.js:130`, `systems/aftermathWrecks.js:1277`, `systems/claims.js:370`, `systems/claims.js:371`, `systems/encounterDirector.js:422`, `systems/encounterDirector.js:427`, `systems/missions.js:730`, `systems/story.js:170`, `systems/terrainAnchors.js:128`, `systems/traffic.js:1870`, `systems/traffic.js:2004`, `systems/uniqueLootAbilities.js:160`, `ui/encounterChoicePrompt.js:176` |
| `encounter:scarcityRumor` | `systems/encounterDirector.js:1058` | — |
| `encounter:spawned` | `systems/encounterDirector.js:1987` | `systems/uniqueLootAbilities.js:159` |
| `encounter:stale` | `systems/encounterDirector.js:647` | — |
| `encounter:telegraph` | `systems/encounterDirector.js:1959`, `systems/survivalArena.js:1847` | `audio/audioSystem.js:3158`, `render/authoredMotion.js:1208`, `systems/survivalResults.js:537`, `systems/terrainAnchors.js:127`, `systems/world.js:864` |
| `encounter:voice` | `systems/encounterDirector.js:2640` | — |
| `encounter:waitStarted` | `data/encounters/367-the-salvage-tail.js:96`, `data/encounters/367-the-salvage-tail.js:263`, `systems/e1EncounterRuntime.js:499` | `ui/encounterChoicePrompt.js:177` |
| `encounter:winnerHostile` | `systems/e1EncounterRuntime.js:458` | `systems/story.js:185` |
| `endgame:archive` | `systems/story.js:249`, `systems/story.js:1174` | `ui/screens/codex.js:1366` |
| `endgame:chosen` | `systems/story.js:1162` | `systems/routeFollower.js:425`, `systems/traffic.js:1836`, `ui/screens/missionLog.js:2791` |
| `endgame:confirmRequired` | `systems/story.js:1045` | `ui/screens/missionLog.js:2790` |
| `endgame:eligibility` | `systems/story.js:856` | `ui/screens/missionLog.js:2789` |
| `endgame:finaleCompleted` | `systems/story.js:932` | — |
| `endgame:finaleReady` | `systems/story.js:1171` | — |
| `endgame:ineligible` | `systems/story.js:942`, `systems/story.js:999`, `systems/story.js:1025`, `systems/story.js:1092` | — |
| `endgame:loopBack` | — | `systems/story.js:257` |
| `endgame:promptChoiceC` | `systems/story.js:1010` | — |
| `endgame:promptChoiceD` | `systems/story.js:968` | — |
| `endgame:promptSandbox` | `systems/story.js:867` | — |
| `endgame:pullCompleted` | `systems/claims.js:3123` | `systems/factions.js:550` |
| `endgame:sandboxContinued` | `systems/story.js:1156` | `ui/screens/missionLog.js:2792` |
| `entity:destroyed` | `core/newGameBoot.js:215`, `main.js:1004`, `save/saveSystem.js:8570`, `systems/survivorPod.js:425`, `systems/trafficTugOps.js:280` | `audio/audioSystem.js:2934`, `audio/audioSystem.js:2960`, `combat/kernel.js:197`, `data/encounters/362-the-salvage-watch.js:196`, `features/breakwaterSpur/runtime.js:74`, `render/vfx.js:2977`, `systems/aftermathWrecks.js:1256`, `systems/aiEncounter.js:139`, `systems/asteroidFormations.js:140`, `systems/asteroidSites.js:879`, `systems/automation.js:616`, `systems/cloak.js:94`, `systems/combatOutcome.js:265`, `systems/encounterDirector.js:375`, `systems/environmentalMachinery.js:283`, `systems/gateControlDirector.js:77`, `systems/heistFacilities.js:324`, `systems/lawSecurity.js:423`, `systems/missions.js:806`, `systems/missions.js:978`, `systems/missions.js:982`, `systems/npcJobsRuntime.js:1234`, `systems/plants/snaggedPod.js:114`, `systems/plants/someonesCourse.js:125`, `systems/presentationOrchestrator.js:186`, `systems/scramblePlant.js:121`, `systems/spawnBudget.js:55`, `systems/stationSideEventDirector.js:104`, `systems/survivalWave.js:234`, `systems/swarmArena.js:906`, `systems/swarmDrops.js:98`, `systems/swarmFortify.js:180`, `systems/swarmSupply.js:113`, `systems/traffic.js:1866`, `systems/traffic.js:1899`, `systems/traffic.js:1903`, `systems/traffic.js:1910`, `systems/world.js:813`, `systems/world.js:814`, `ui/prompts/bulkHaulTag.js:148` |
| `entity:kill` | `systems/tallyho.js:967` | `core/coreSystem.js:551` |
| `entity:killed` | `balance/careerCohorts.js:502`, `combat/damage.js:766`, `combat/kernel.js:139`, `systems/combat.js:837`, `systems/tallyho.js:969` | `audio/audioSystem.js:2933`, `audio/audioSystem.js:2959`, `combat/chainKills.js:88`, `features/breakwaterSpur/runtime.js:73`, `render/feel.js:1648`, `render/shipMicroMotion.js:1745`, `render/vfx.js:2957`, `render/vfx.js:2971`, `systems/aftermathWrecks.js:1254`, `systems/applausePlant.js:184`, `systems/asteroidSites.js:875`, `systems/barkDirector.js:889`, `systems/barkDirector.js:890`, `systems/barkDirector.js:937`, `systems/combatOutcome.js:259`, `systems/crew.js:99`, `systems/dyingHull.js:182`, `systems/economy.js:1887`, `systems/economy.js:1890`, `systems/encounterDirector.js:376`, `systems/environmentalMachinery.js:284`, `systems/faction_archive.js:589`, `systems/faction_choir.js:520`, `systems/faction_frontier.js:491`, `systems/faction_helix.js:505`, `systems/faction_meridian.js:368`, `systems/faction_pitborn.js:644`, `systems/faction_understory.js:715`, `systems/faction_vael.js:438`, `systems/factions.js:402`, `systems/factions.js:464`, `systems/gamepad.js:1100`, `systems/impoundGrudge.js:397`, `systems/impulseCharges.js:236`, `systems/killReplay.js:375`, `systems/lawSecurity.js:422`, `systems/lawSecurity.js:434`, `systems/lawSecurity.js:435`, `systems/lootShards.js:601`, `systems/lossLedger.js:465`, `systems/mining.js:302`, `systems/missions.js:799`, `systems/missions.js:977`, `systems/missions.js:981`, `systems/npcJobsRuntime.js:1226`, `systems/onboarding.js:761`, `systems/onboarding.js:817`, `systems/pirateDisguise.js:439`, `systems/plants/theOtherName.js:92`, `systems/plants/twoNames.js:99`, `systems/presentationOrchestrator.js:185`, `systems/rockCore.js:90`, `systems/rubberneckers.js:97`, `systems/scramblePlant.js:120`, `systems/sectorSim.js:147`, `systems/surrenderRecovery.js:100`, `systems/survivalResults.js:521`, `systems/survivalWave.js:235`, `systems/survivorPod.js:734`, `systems/swarmChain.js:162`, `systems/swarmDrops.js:91`, `systems/swarmElites.js:183`, `systems/swarmJuice.js:142`, `systems/swarmLegendaries.js:112`, `systems/swarmSupply.js:105`, `systems/titles.js:600`, `systems/traffic.js:1862`, `systems/traffic.js:1898`, `systems/wingMorale.js:201`, `systems/wingmen.js:143`, `systems/world.js:868`, `testing/playerTruth/reader.js:415`, `ui/stuntCallout.js:1035`, `ui/uiRoot.js:1018`, `ui/uiRoot.js:1026` |
| `entity:spawnRequest` | `data/scanReveal.js:537`, `systems/salvageActions.js:279`, `systems/salvageActions.js:528` | `core/coreSystem.js:555` |
| `entity:spawned` | `core/coreSystem.js:382`, `core/coreSystem.js:421` | `audio/audioSystem.js:2958`, `combat/kernel.js:186`, `render/asteroidMotionPresentation.js:526`, `render/ordnanceMotionPresentation.js:313`, `render/pickupMotionPresentation.js:262`, `render/shipMicroMotion.js:1746`, `render/vfx.js:2983`, `render/vfx.js:2988`, `sim/titleAttract.js:10`, `systems/aiEncounter.js:138`, `systems/barkDirector.js:875`, `systems/barkDirector.js:876`, `systems/ceresAnchorWinching.js:281`, `systems/ceresNinthMouth.js:357`, `systems/combatOutcome.js:264`, `systems/factionPresence.js:527`, `systems/faction_understory.js:714`, `systems/fields.js:499`, `systems/flybyFocus.js:328`, `systems/foundryPlateTheft.js:149`, `systems/lawSecurity.js:421`, `systems/lossLedger.js:463`, `systems/npcJobsRuntime.js:1200`, `systems/plants/litter.js:72`, `systems/salvageActions.js:139`, `systems/scanReveal.js:68`, `systems/survivalSwarm.js:227`, `systems/swarmDrops.js:96`, `systems/swarmElites.js:182`, `systems/swarmFortify.js:181`, `systems/swarmSupply.js:111`, `systems/titles.js:601`, `systems/uniqueLootAbilities.js:162`, `testing/playerTruth/impulseObserver.js:123` |
| `environment:detonated` | — | `render/vfx.js:3038` |
| `environment:fractured` | — | `systems/sectorSim.js:163` |
| `environmentalMachinery:ensureAnvil` | `systems/environmentalMachinery.js:585`, `systems/environmentalMachinery.js:1512` | `systems/terrainAnchors.js:129` |
| `environmentalMachinery:ensureAperturePlug` | `systems/environmentalMachinery.js:1095` | `systems/terrainAnchors.js:133` |
| `environmentalMachinery:ensureReef` | `systems/environmentalMachinery.js:1405` | `systems/terrainAnchors.js:131` |
| `environmentalMachinery:phaseChanged` | `systems/environmentalMachinery.js:1620` | `data/hazardLanguage.js:178` |
| `environmentalMachinery:releaseAperturePlug` | `systems/environmentalMachinery.js:1107` | `systems/terrainAnchors.js:135` |
| `erisChoir:drinkReceipt` | `systems/special500Sommelier.js:145` | — |
| `escalation:arrived` | `systems/encounterDirector.js:687` | — |
| `escalation:seeded` | `systems/encounterDirector.js:674` | — |
| `faction:aggro` | `systems/e1EncounterRuntime.js:138`, `systems/e1EncounterRuntime.js:342`, `systems/factions.js:604`, `systems/factions.js:687`, `systems/factions.js:1091` | `systems/heat.js:404` |
| `faction:bribe` | `data/encounters/1208-the-vetting.js:277`, `ui/screens/footprint.js:1668` | `systems/factions.js:380` |
| `faction:repChanged` | `systems/factions.js:600`, `systems/factions.js:682`, `systems/factions.js:1087` | `audio/audioSystem.js:3211`, `systems/factionPresence.js:531`, `systems/missions.js:624`, `ui/station/screens/factions.js:477` |
| `faction:repDelta` | `balance/careerCohorts.js:273`, `balance/courierPublicRoute.js:408`, `balance/hunterPublicRoute.js:244`, `balance/prospectorPublicRoute.js:385`, `features/industrialDisasters/runtime.js:442`, `missions/tenderHaul.js:513`, `missions/tenderHaul.js:553`, `systems/borrowedSun.js:644`, `systems/choirReliefBerth.js:426`, `systems/choirReliefBerth.js:460`, `systems/choirReliefBerth.js:481`, `systems/claims.js:1850`, `systems/economy.js:4950`, `systems/economy.js:5760`, `systems/economy.js:6132`, `systems/encounterDirector.js:2859`, `systems/faction_archive.js:724`, `systems/faction_archive.js:759`, `systems/faction_archive.js:1489`, `systems/faction_archive.js:1516`, `systems/faction_choir.js:945`, `systems/faction_choir.js:982`, `systems/faction_choir.js:1044`, `systems/faction_choir.js:1113`, `systems/faction_choir.js:1117`, `systems/faction_choir.js:1122`, `systems/faction_choir.js:1183`, `systems/faction_choir.js:1211`, `systems/faction_choir.js:1417`, `systems/faction_choir.js:1627`, `systems/faction_frontier.js:1525`, `systems/faction_helix.js:615`, `systems/faction_meridian.js:431`, `systems/faction_pitborn.js:692`, `systems/faction_understory.js:1244`, `systems/faction_understory.js:1347`, `systems/faction_vael.js:541`, `systems/faction_vael.js:882`, `systems/faction_verge.js:752`, `systems/faction_verge.js:771`, `systems/faction_verge.js:897`, `systems/faction_verge.js:1108`, `systems/faction_verge.js:1126`, `systems/faction_verge.js:1405`, `systems/faction_verge.js:1455`, `systems/faction_verge.js:1544`, `systems/faction_verge.js:1571`, `systems/faction_verge.js:1614`, `systems/faction_verge.js:1666`, `systems/fenceDesk.js:268`, `systems/gateThreeWeir.js:427`, `systems/gateThreeWeir.js:539`, `systems/gateThreeWeir.js:597`, `systems/gateThreeWeir.js:609`, `systems/gravedigger.js:591`, `systems/lamplighter.js:656`, `systems/missionStoryOps.js:2274`, `systems/missionStoryOps.js:2276`, `systems/missionStoryOps.js:2355`, `systems/missions.js:5685`, `systems/missions.js:5790`, `systems/moralTrap.js:320`, `systems/quill.js:703`, `systems/quill.js:903`, `systems/scavengerOccupationSwitch.js:761`, `systems/scavengerOccupationSwitch.js:766`, `systems/special500Confessional.js:266`, `systems/special500ForgeKaraoke.js:82`, `systems/special500Invoice.js:173`, `systems/special500Invoice.js:188`, `systems/special500Sommelier.js:102`, `systems/stuntGrammar.js:184`, `systems/stuntGrammar.js:192`, `systems/survivorPod.js:1681`, `systems/survivorPod.js:2071`, `systems/tallyho.js:644`, `systems/uniqueWrecks.js:2007`, `systems/uniqueWrecks.js:2134`, `systems/world.js:5335`, `systems/world.js:8108`, `systems/world.js:8342` | `systems/factions.js:352` |
| `faction:repSpillover` | `systems/factions.js:680` | — |
| `faction:tradePosture` | `systems/e1EncounterRuntime.js:126`, `systems/e1EncounterRuntime.js:130`, `systems/e1EncounterRuntime.js:140` | `systems/factions.js:372` |
| `factionPresence:administrativeRouting` | `systems/factionPresence.js:1835` | `systems/barkDirector.js:917` |
| `factionPresence:archiveEvidenceRead` | `systems/factionPresence.js:1490` | `systems/story.js:298` |
| `factionPresence:berthGreeting` | `systems/factionPresence.js:1027` | — |
| `factionPresence:berthReturned` | `systems/factionPresence.js:1004` | — |
| `factionPresence:berthRobbed` | `systems/factionPresence.js:990` | — |
| `factionPresence:boardingPhase` | `systems/factionPresence.js:1747` | `ui/uiRoot.js:593` |
| `factionPresence:conduct` | `systems/factionPresence.js:801`, `systems/factionPresence.js:908` | — |
| `factionPresence:fulfillmentProvoked` | `systems/factionPresence.js:1324` | `systems/barkDirector.js:916` |
| `factionPresence:service` | `systems/factionPresence.js:1429` | — |
| `factionPresence:serviceAction` | `systems/factionPresence.js:1560` | — |
| `factionPresence:spawned` | `systems/factionPresence.js:777`, `systems/factionPresence.js:948`, `systems/factionPresence.js:1140` | — |
| `fence:routeLegDue` | — | `systems/economyContracts.js:260` |
| `fence:scrubAsk` | — | `systems/fenceDesk.js:62` |
| `field:depletedChanged` | `systems/fieldDepletion.js:841` | `systems/world.js:801` |
| `field:opportunity` | `systems/world.js:6126` | — |
| `field:regrown` | `systems/world.js:6055` | `systems/presentationOrchestrator.js:231` |
| `field:richSeamMissed` | `systems/fieldDepletion.js:769`, `systems/traffic.js:2424`, `systems/trafficCausalChainOps.js:2705` | `systems/presentationOrchestrator.js:232` |
| `field:richSeamOpened` | `systems/heliosClaimOpening.js:158`, `systems/trafficCausalChainOps.js:532` | `systems/traffic.js:1855` |
| `field:richSeamVisible` | `systems/heliosClaimOpening.js:147` | `systems/presentationOrchestrator.js:199` |
| `field:richSeamWorked` | `systems/mining.js:1274`, `systems/trafficRecoveryOps.js:698` | `systems/traffic.js:1856` |
| `fieldDepletion:changed` | `systems/fieldDepletion.js:840` | `systems/npcJobsRuntime.js:1242`, `systems/presentationOrchestrator.js:230` |
| `fields:anchorRegistered` | `systems/fields.js:1111` | `audio/audioSystem.js:3423`, `render/forceLanguage/fieldForcePresentation.js:61` |
| `fields:cleared` | `systems/fields.js:1959` | `audio/fieldAudio.js:321`, `render/forceLanguage/fieldForcePresentation.js:62` |
| `fields:clusterDetonate` | `systems/fields.js:2814` | `systems/presentationOrchestrator.js:293` |
| `fields:coneToggled` | `systems/fields.js:1613`, `systems/fields.js:1619`, `systems/fields.js:1731`, `systems/fields.js:1746` | `systems/onboarding.js:808` |
| `fields:deployDenied` | `systems/fields.js:1452` | — |
| `fields:deployed` | `systems/fields.js:726`, `systems/fields.js:811`, `systems/fields.js:1542`, `systems/fields.js:1610`, `systems/fields.js:1722`, `systems/fields.js:1823` | `audio/audioSystem.js:3424`, `systems/fields.js:500`, `systems/onboarding.js:807` |
| `fields:ended` | `systems/fields.js:1130`, `systems/fields.js:1153`, `systems/fields.js:1217`, `systems/fields.js:1745`, `systems/fields.js:1766`, `systems/fields.js:1902` | `audio/fieldAudio.js:318` |
| `fields:hitchCut` | `systems/fields.js:757` | — |
| `fields:hitchLatched` | `systems/fields.js:745` | — |
| `fields:pullMarked` | `systems/fields.js:1585` | — |
| `fields:specialistDisrupt` | `systems/fields.js:635` | `audio/fieldAudio.js:322` |
| `fields:thermalCreated` | `systems/fields.js:2004` | — |
| `fields:thermalHit` | `core/fields/thermalFields.js:35` | — |
| `firsthour:beat` | `systems/onboarding.js:5314` | — |
| `firsthour:complete` | `systems/onboarding.js:5331` | — |
| `firsthour:milestone` | `systems/onboarding.js:1973` | `audio/audioSystem.js:3416`, `testing/playerTruth/reader.js:410` |
| `firsthour:sentence` | `systems/onboarding.js:3323` | — |
| `firsthour:sentenceOffer` | `systems/onboarding.js:3304` | — |
| `firsthour:sentencePresented` | `ui/station/stationApp.js:1060` | `systems/onboarding.js:773` |
| `firsthour:started` | `systems/onboarding.js:4979` | — |
| `firsthour:verb` | `systems/onboarding.js:5251` | — |
| `flight:modeChanged` | `systems/flightV3.js:1190` | — |
| `flight:racePrecision` | `systems/missions.js:3991` | `systems/flightV3.js:206` |
| `flight:sweptHull` | `systems/flightV3.js:1089` | — |
| `flybyFocus:cancel` | `systems/flybyFocus.js:405` | `render/cameraDirector.js:1572` |
| `flybyFocus:end` | `systems/flybyFocus.js:406` | `render/cameraDirector.js:1571` |
| `flybyFocus:start` | `systems/flybyFocus.js:554` | `systems/onboarding.js:744` |
| `formation:discovered` | `systems/asteroidFormations.js:329` | — |
| `freight:arrival` | `systems/trafficEscortOps.js:187` | `render/authoredMotion.js:1204`, `systems/economy.js:1883`, `systems/traffic.js:1912` |
| `freight:cargoSpilled` | `systems/encounterScripts.js:2220`, `systems/encounterScripts.js:2513`, `systems/trafficRoleOps.js:442` | `systems/barkDirector.js:886`, `systems/economy.js:1818`, `systems/encounterDirector.js:441`, `systems/lootShards.js:604`, `systems/plants/sweepingLine.js:92`, `systems/presentationOrchestrator.js:306`, `systems/scramblePlant.js:118`, `systems/sectorSim.js:154`, `systems/traffic.js:1896`, `systems/traffic.js:1901`, `systems/traffic.js:1906`, `systems/traffic.js:1908` |
| `freight:clear` | — | `render/vfx.js:2932` |
| `freight:custodyChanged` | `systems/encounterScripts.js:2053` | `render/authoredMotion.js:1203`, `systems/aftermathWrecks.js:1279` |
| `freight:custodyRebound` | `systems/encounterDirector.js:893` | — |
| `freight:custodyReceipt` | `systems/encounterScripts.js:2110`, `systems/encounterScripts.js:2132` | — |
| `freight:departed` | — | `systems/survivalWave.js:240` |
| `freight:gratitudeGift` | `systems/missions.js:4187` | — |
| `freight:lootSweepStarted` | `systems/encounterScripts.js:1776` | — |
| `freight:loss` | `systems/encounterDirector.js:2921`, `systems/trafficCausalChainOps.js:2798`, `systems/trafficRecoveryOps.js:335` | `systems/claims.js:377`, `systems/economy.js:1884`, `systems/encounterDirector.js:442`, `systems/sectorSim.js:153` |
| `freight:manifestRemaining` | `systems/encounterScripts.js:2054` | `systems/surrenderRecovery.js:101` |
| `freight:raiderEscaped` | `systems/encounterScripts.js:2669` | `systems/barkDirector.js:887` |
| `freight:recovery` | — | `systems/encounterDirector.js:383`, `systems/traffic.js:1888` |
| `freight:recoveryAbandoned` | — | `systems/encounterDirector.js:384`, `systems/traffic.js:1889` |
| `freight:reverseRequested` | `systems/swarmCourseTwists.js:383` | `systems/freightLane.js:594` |
| `freight:sweeperEscaped` | `systems/encounterScripts.js:1937` | — |
| `freight:warning` | — | `render/vfx.js:2931` |
| `frontier:barnRetry` | `systems/faction_frontier.js:1363` | `systems/missions.js:645` |
| `frontier:debtLapsed` | `systems/faction_frontier.js:1947` | — |
| `frontier:debtPosted` | `systems/faction_frontier.js:1880` | — |
| `frontier:debtSettled` | `systems/faction_frontier.js:1927` | — |
| `frontier:deed` | `systems/faction_frontier.js:1500` | — |
| `frontier:defenseCalled` | `systems/faction_frontier.js:2292` | — |
| `frontier:defenseCleared` | `systems/faction_frontier.js:2300` | — |
| `frontier:defenseFailed` | `systems/faction_frontier.js:2321` | — |
| `frontier:disputeJumped` | `systems/faction_frontier.js:2135` | — |
| `frontier:disputeLapsed` | `systems/faction_frontier.js:2140` | — |
| `frontier:disputePosted` | `systems/faction_frontier.js:1998` | — |
| `frontier:disputeSettled` | `systems/faction_frontier.js:2107` | — |
| `frontier:homesteadLost` | `systems/faction_frontier.js:2330` | — |
| `frontier:homesteadRaised` | — | `systems/missions.js:646` |
| `frontier:jobTier` | `systems/faction_frontier.js:1505` | — |
| `frontier:justiceFiled` | `systems/faction_frontier.js:1538` | — |
| `frontier:leadPosted` | `systems/faction_frontier.js:1749` | — |
| `frontier:leadSoured` | `systems/faction_frontier.js:1764` | — |
| `frontier:leadVerified` | `systems/faction_frontier.js:1785` | — |
| `frontier:missionAttemptLost` | `systems/faction_frontier.js:766`, `systems/faction_frontier.js:1065` | `systems/missions.js:647` |
| `frontier:missionAttemptStarted` | `systems/faction_frontier.js:599` | — |
| `frontier:missionAttemptUnavailable` | `systems/faction_frontier.js:589` | `systems/missions.js:648` |
| `frontier:moduleRestocked` | `systems/faction_frontier.js:1249` | — |
| `frontier:moduleSnapped` | `systems/faction_frontier.js:1298` | `systems/missions.js:644` |
| `frontier:raidSpawned` | `systems/faction_frontier.js:2186` | — |
| `frontier:raiderRepelled` | `systems/faction_frontier.js:2502`, `systems/faction_frontier.js:2520` | — |
| `frontier:sitePlanted` | `systems/faction_frontier.js:877`, `systems/faction_frontier.js:1182` | `systems/missions.js:643` |
| `frontier:steadStruck` | `systems/faction_frontier.js:2263` | — |
| `frontier:supplyDelivered` | `systems/faction_frontier.js:1611`, `systems/faction_frontier.js:1710` | — |
| `frontier:supplyRunAsked` | `systems/faction_frontier.js:1687`, `systems/faction_frontier.js:2259` | — |
| `frontier:trafficTick` | `systems/faction_frontier.js:1681` | — |
| `frontier:vendettaLapsed` | `systems/faction_frontier.js:2422` | — |
| `frontier:vendettaPaid` | `systems/faction_frontier.js:2481` | — |
| `frontier:vendettaPosted` | `systems/faction_frontier.js:2400` | — |
| `frontier:welded` | `systems/faction_frontier.js:2605` | — |
| `frontierRumor:acquired` | `systems/world.js:5439` | — |
| `frontierRumor:blackMarketAccess` | `systems/world.js:8573` | — |
| `frontierRumor:contacted` | `systems/world.js:8469` | — |
| `frontierRumor:resolved` | `systems/world.js:5456` | — |
| `fuel:changed` | `features/salvageTender/services.js:189`, `systems/economy.js:5393`, `systems/economy.js:5554`, `systems/economy.js:5571`, `systems/stationServices.js:593`, `systems/stationServices.js:718`, `systems/stationServices.js:812`, `systems/world.js:7651`, `systems/world.js:7659` | — |
| `fuel:crackCell` | `ui/hud.js:4589` | `systems/world.js:795` |
| `fuel:empty` | `systems/world.js:7652` | `audio/audioSystem.js:3183`, `systems/economy.js:1934`, `ui/alerts.js:671` |
| `fulfillment:boardingDocked` | `systems/faction_fulfillment.js:344` | — |
| `fulfillment:boardingFlung` | `systems/faction_fulfillment.js:331` | — |
| `fulfillment:cargoFiled` | `systems/faction_fulfillment.js:383` | — |
| `fulfillment:derailed` | `systems/faction_fulfillment.js:253` | — |
| `fulfillment:hitchhike` | `systems/faction_fulfillment.js:312` | — |
| `fulfillment:orderOneClosed` | `systems/faction_fulfillment.js:417` | — |
| `fulfillment:rerailed` | `systems/faction_fulfillment.js:264` | — |
| `fulfillment:trainSpawned` | `systems/faction_fulfillment.js:491` | — |
| `furnace:fed` | `systems/furnaceIntake.js:168` | `systems/missions.js:742` |
| `game:embarkSpeculation` | `ui/sandbox/sandboxSetup.js:445`, `ui/screens/gameOver.js:598`, `ui/screens/newGame.js:963` | — |
| `game:exitToMenu` | `ui/loadingPresenter.js:643`, `ui/screens/crucible.js:3796`, `ui/screens/crucible.js:4194`, `ui/screens/gameOver.js:626`, `ui/screens/pause.js:1400` | `audio/audioSystem.js:3542`, `core/gameStartRecovery.js:25`, `main.js:468`, `save/saveSystem.js:601`, `systems/missions.js:953`, `systems/runSession.js:158`, `systems/swarmFortify.js:183`, `ui/confirm.js:337`, `ui/loadingPresenter.js:712`, `ui/sandbox/sandboxSetup.js:723`, `ui/screens/crucibleLabControls.js:583`, `ui/uiRoot.js:1807` |
| `game:load` | `ui/input.js:656`, `ui/input.js:962`, `ui/screens/gameOver.js:587`, `ui/screens/mainMenu.js:741`, `ui/screens/saveLoad.js:1681` | `core/gameStartRecovery.js:17`, `save/saveSystem.js:394`, `systems/scanner.js:1134`, `ui/commandBar.js:274`, `ui/loadingPresenter.js:711`, `ui/loadingPresenter.js:743`, `ui/promptDeck.js:943` |
| `game:loadingProgress` | `main.js:151`, `main.js:239`, `main.js:302`, `main.js:336`, `main.js:525`, `main.js:941`, `main.js:1040`, `main.js:1111`, `main.js:1138`, `main.js:1172`, `main.js:1183`, `main.js:1246`, `main.js:1418`, `save/saveSystem.js:7020` | `ui/loadingPresenter.js:662`, `ui/screens/newGame.js:915`, `ui/screens/saveLoad.js:1145` |
| `game:new` | `main.js:690`, `systems/devSectorJump.js:46`, `ui/physicsVenues.js:28`, `ui/sandbox/sandboxSetup.js:460`, `ui/screens/gameOver.js:613`, `ui/screens/newGame.js:1053`, `ui/screens/raceBoard.js:64` | `audio/audioSystem.js:3537`, `audio/bombAudio.js:458`, `audio/fieldAudio.js:325`, `careers/origins/haulerOriginSystem.js:64`, `core/coreSystem.js:569`, `core/gameStartRecovery.js:16`, `features/breakwaterSpur/presentation.js:35`, `main.js:432`, `render/feel.js:1552`, `render/vfx.js:3001`, `render/vfx.js:3012`, `save/saveSystem.js:523`, `sim/killcamTape.js:471`, `systems/aftermathWrecks.js:1287`, `systems/aiEncounter.js:143`, `systems/bombs.js:704`, `systems/cloak.js:89`, `systems/combatOutcome.js:271`, `systems/countermeasures.js:224`, `systems/difficultyDirector.js:168`, `systems/dockingCorridor.js:84`, `systems/encounterDirector.js:373`, `systems/environmentalMachinery.js:287`, `systems/faction_frontier.js:503`, `systems/faction_helix.js:518`, `systems/fields.js:491`, `systems/impulseCharges.js:241`, `systems/killReplay.js:363`, `systems/massSeed.js:144`, `systems/masslineSnares.js:137`, `systems/masslineTelemetry.js:125`, `systems/mines.js:120`, `systems/mining.js:323`, `systems/planetRuntime.js:214`, `systems/presentationOrchestrator.js:295`, `systems/reactiveMatter.js:537`, `systems/rockCore.js:91`, `systems/salvageActions.js:146`, `systems/scanner.js:1133`, `systems/scissorwake.js:73`, `systems/shieldPylons.js:244`, `systems/ships.js:1967`, `systems/special500Spectacle.js:206`, `systems/surrenderRecovery.js:107`, `systems/survivorPod.js:730`, `systems/swarmFortify.js:182`, `systems/swarmLegendaries.js:124`, `systems/tetherGameplay.js:366`, `systems/titles.js:603`, `systems/tumbleStates.js:145`, `ui/aftermathChoicePrompt.js:116`, `ui/capitalBossOverlayMount.js:718`, `ui/commandBar.js:273`, `ui/hudLayout.js:123`, `ui/loadingPresenter.js:710`, `ui/loadingPresenter.js:742`, `ui/moralTrapPrompt.js:44`, `ui/promptDeck.js:942`, `ui/screens/crucibleLabControls.js:577`, `ui/uiRoot.js:826`, `ui/uiRoot.js:1811`, `ui/voiceArbiter.js:541`, `ui/wreckChoicePrompt.js:68` |
| `game:newGame` | `core/newGameBoot.js:251` | `audio/audioSystem.js:3538`, `audio/bombAudio.js:459`, `audio/fieldAudio.js:326`, `core/coreSystem.js:570`, `core/physics.js:219`, `render/npcJobSignatureVfx.js:903`, `render/shipMicroMotion.js:1749`, `render/vfx.js:3002`, `render/vfx.js:3013`, `save/saveSystem.js:530`, `systems/aftermathWrecks.js:1288`, `systems/bombs.js:707`, `systems/cloak.js:90`, `systems/collisionConsequences.js:137`, `systems/combatOutcome.js:278`, `systems/countermeasures.js:225`, `systems/difficultyDirector.js:169`, `systems/faction_frontier.js:504`, `systems/faction_helix.js:519`, `systems/fieldDepletion.js:757`, `systems/fragileCargo.js:415`, `systems/lossInvestigation.js:131`, `systems/lossLedger.js:468`, `systems/masslineTelemetry.js:126`, `systems/moistureLoss.js:85`, `systems/onboarding.js:689`, `systems/plants/orphanWreck.js:104`, `systems/salvageActions.js:147`, `systems/scanReveal.js:67`, `systems/survivorPod.js:729`, `systems/tumbleStates.js:146`, `systems/wingMorale.js:203`, `ui/cargoConscience.js:148`, `ui/uiRoot.js:886` |
| `game:over` | `systems/combat.js:794`, `systems/combat.js:957` | `ui/confirm.js:336`, `ui/uiRoot.js:1776` |
| `game:retryStart` | `ui/loadingPresenter.js:624` | `core/gameStartRecovery.js:19` |
| `game:save` | `ui/input.js:655`, `ui/input.js:955`, `ui/screens/saveLoad.js:1714` | `save/saveSystem.js:374` |
| `game:scenePrepared` | `core/newGameBoot.js:324` | `systems/missions.js:657`, `systems/onboarding.js:665`, `ui/loadingPresenter.js:759`, `ui/sandbox/sandboxSetup.js:521` |
| `game:startFailed` | `main.js:1368`, `ui/loadingPresenter.js:731` | `core/gameStartRecovery.js:18`, `ui/loadingPresenter.js:709`, `ui/sandbox/sandboxSetup.js:524`, `ui/sandbox/sandboxSetup.js:722`, `ui/screens/crucibleLabControls.js:579`, `ui/screens/newGame.js:914`, `ui/screens/saveLoad.js:1151` |
| `game:started` | `main.js:958` | `audio/audioSystem.js:3543`, `careers/origins/haulerOriginSystem.js:63`, `core/coreSystem.js:571`, `save/saveSystem.js:517`, `save/saveSystem.js:550`, `sim/killcamTape.js:470`, `systems/automation.js:655`, `systems/collisionConsequences.js:136`, `systems/combat.js:469`, `systems/economyContracts.js:254`, `systems/factionPresence.js:518`, `systems/faction_helix.js:520`, `systems/factions.js:349`, `systems/flight.js:83`, `systems/flightV3.js:225`, `systems/heat.js:411`, `systems/masslineSnares.js:138`, `systems/missions.js:609`, `systems/onboarding.js:688`, `systems/presentationAdapters.js:343`, `systems/presentationOrchestrator.js:296`, `systems/sectorSim.js:134`, `systems/ships.js:2158`, `systems/story.js:168`, `systems/surrenderRecovery.js:108`, `systems/survivalDraft.js:222`, `systems/tetherGameplay.js:367`, `systems/wingmen.js:176`, `ui/alerts.js:565`, `ui/commandBar.js:272`, `ui/sandbox/sandboxSetup.js:516`, `ui/sandbox/sandboxSetup.js:715`, `ui/screens/crucibleLabControls.js:578`, `ui/uiRoot.js:827`, `ui/uiRoot.js:1766`, `ui/uiRoot.js:1802`, `ui/uiRoot.js:1812` |
| `gamepad:connected` | `systems/gamepad.js:1299` | — |
| `gamepad:disconnected` | `systems/gamepad.js:1247` | — |
| `gate:range` | `core/physics.js:1731`, `core/physics.js:1735` | `render/authoredMotion.js:1231`, `systems/onboarding.js:881`, `systems/presentationOrchestrator.js:190`, `ui/alerts.js:546` |
| `gate:verdict` | `systems/gateControlDirector.js:144` | `render/infrastructureMotion.js:292` |
| `gateThree:bondLapsed` | `systems/gateThreeWeir.js:434` | — |
| `gateThree:bonded` | `systems/gateThreeWeir.js:652` | — |
| `gateThree:contested` | `systems/gateThreeWeir.js:602`, `systems/gateThreeWeir.js:614` | — |
| `gateThree:evaded` | `systems/gateThreeWeir.js:544` | — |
| `gateThree:inspection` | `systems/gateThreeWeir.js:694` | — |
| `gateThree:laneWeighed` | `systems/gateThreeWeir.js:491` | — |
| `gateThree:logged` | `systems/gateThreeWeir.js:548`, `systems/gateThreeWeir.js:672`, `systems/gateThreeWeir.js:742` | — |
| `gateThree:maintenance` | `systems/gateThreeWeir.js:413` | — |
| `gateThree:weighed` | `systems/gateThreeWeir.js:668`, `systems/gateThreeWeir.js:735` | — |
| `graffiti:show` | `data/encounters/366-the-counting-relay.js:102`, `data/encounters/366-the-counting-relay.js:112`, `systems/blindWelderRuntime.js:153`, `systems/e1EncounterRuntime.js:108`, `systems/e1EncounterRuntime.js:169`, `systems/e1EncounterRuntime.js:285`, `systems/e1EncounterRuntime.js:678`, `systems/historyWear.js:103`, `systems/missionStoryOps.js:2737`, `systems/special500DockLedger.js:158`, `systems/story.js:669`, `systems/story.js:683`, `systems/story.js:717`, `systems/story.js:1570`, `systems/story.js:1979`, `systems/story.js:1984`, `systems/story.js:2196`, `systems/uniqueWrecks.js:2013` | `systems/ships.js:2135`, `ui/comms.js:224`, `ui/screens/codex.js:1362` |
| `gratitude:parcel` | `world/gratitudeParcel.js:131` | `systems/barkDirector.js:901` |
| `gravedigger:claimClosed` | `systems/gravedigger.js:896`, `systems/gravedigger.js:912`, `systems/gravedigger.js:935`, `systems/gravedigger.js:973` | — |
| `gravedigger:claimLapsed` | `systems/gravedigger.js:915` | — |
| `gravedigger:claimPosted` | `systems/gravedigger.js:879` | — |
| `gravedigger:claimRobbed` | `systems/gravedigger.js:976` | — |
| `gravedigger:claimYielded` | `systems/gravedigger.js:938` | — |
| `gravedigger:forgiven` | `systems/gravedigger.js:1059` | — |
| `gravedigger:graveDesecrated` | `systems/gravedigger.js:1323` | — |
| `gravedigger:graveNamed` | `systems/gravedigger.js:1209` | — |
| `gravedigger:grudged` | `systems/gravedigger.js:985` | — |
| `gravedigger:kinSlain` | `systems/gravedigger.js:1305` | — |
| `gravedigger:offering` | `systems/gravedigger.js:1079` | — |
| `gravedigger:pitRefused` | `systems/gravedigger.js:1387` | — |
| `gravedigger:portionPaid` | `systems/gravedigger.js:1070` | — |
| `gravedigger:standing` | `systems/gravedigger.js:1083` | — |
| `gravedigger:verdictFiled` | `systems/gravedigger.js:612` | — |
| `gravedigger:vigilBegun` | `systems/gravedigger.js:747` | — |
| `gravedigger:vigilDeparting` | `systems/gravedigger.js:790` | — |
| `gravedigger:vigilInbound` | `systems/gravedigger.js:722` | — |
| `gravedigger:vigilPosted` | `systems/gravedigger.js:687` | — |
| `gyre:absorbTick` | — | `systems/gamepad.js:1065` |
| `gyre:ballGrave` | — | `systems/gamepad.js:1044` |
| `gyre:beamOn` | — | `systems/gamepad.js:1003` |
| `gyre:caught` | — | `systems/gamepad.js:1045` |
| `gyre:dropped` | — | `systems/gamepad.js:1074` |
| `gyre:full` | — | `systems/gamepad.js:1042` |
| `gyre:fuseLow` | — | `systems/gamepad.js:1043` |
| `gyre:snagged` | — | `systems/gamepad.js:1004` |
| `gyre:strained` | — | `systems/gamepad.js:1089` |
| `gyre:thrown` | — | `systems/gamepad.js:1027` |
| `gyre:windup` | — | `systems/gamepad.js:1014` |
| `harasser:disengaged` | `systems/encounterDirector.js:3325` | `systems/barkDirector.js:904`, `systems/barkDirector.js:1024` |
| `hazard:changed` | `systems/world.js:1140`, `systems/world.js:7519` | `ui/alerts.js:688` |
| `hazard:enter` | `systems/environmentalMachinery.js:1558`, `systems/world.js:7390` | `data/hazardLanguage.js:174`, `render/shipMicroMotion.js:1756`, `render/vfx.js:3030`, `ui/alerts.js:608` |
| `hazard:exit` | `systems/environmentalMachinery.js:1569`, `systems/world.js:7400` | `data/hazardLanguage.js:175`, `render/shipMicroMotion.js:1757`, `render/vfx.js:3031`, `ui/alerts.js:619` |
| `heat:changed` | `systems/heat.js:935` | `audio/audioSystem.js:3186`, `render/vfx.js:3009`, `systems/barkDirector.js:918`, `systems/lawSecurity.js:441`, `systems/onboarding.js:820`, `systems/onboarding.js:823`, `systems/titles.js:610` |
| `heat:clear` | — | `systems/heat.js:415` |
| `heat:scrubRequested` | `data/encounters/1212-the-clean-sheet.js:328`, `systems/fenceDesk.js:352` | `systems/heat.js:451` |
| `heist:capsuleLaunched` | `systems/heistFacilities.js:1057` | `systems/missions.js:883` |
| `heist:capsuleResumed` | `systems/heistFacilities.js:1521` | — |
| `heist:captureFork` | `systems/heistFacilities.js:2060` | `systems/missions.js:892` |
| `heist:counterweight` | `systems/heistFacilities.js:3201` | `systems/missions.js:903` |
| `heist:counterweightSceneReceipt` | `systems/heistFacilities.js:3524`, `systems/heistFacilities.js:3532`, `systems/heistFacilities.js:3537`, `systems/heistFacilities.js:3559` | — |
| `heist:facilityCandidate` | `systems/heistFacilities.js:1947` | `systems/missions.js:888` |
| `heist:launchCue` | `systems/heistFacilities.js:451`, `systems/heistFacilities.js:3896` | — |
| `heist:launchScheduleReceipt` | `systems/heistFacilities.js:591`, `systems/heistFacilities.js:600`, `systems/heistFacilities.js:604`, `systems/heistFacilities.js:618` | — |
| `heist:launchScheduleReleased` | `systems/heistFacilities.js:2509` | — |
| `heist:monitorScan` | `systems/heistFacilities.js:3853` | `systems/missions.js:896` |
| `heist:observed` | `systems/heistFacilities.js:2720` | — |
| `heist:receiverAborted` | `systems/heistFacilities.js:2451` | — |
| `heist:receiverCommitted` | `systems/heistFacilities.js:2432` | `systems/npcJobsRuntime.js:1261` |
| `heist:receiverPrepared` | `systems/heistFacilities.js:2370` | — |
| `heist:requestLaunchSchedule` | — | `systems/heistFacilities.js:326` |
| `heist:routineReceipt` | `systems/heistFacilities.js:1810` | — |
| `heist:shipmentUnit` | `systems/heistFacilities.js:1925` | `systems/missions.js:899` |
| `helix:appealHeard` | `systems/faction_helix.js:1471`, `systems/faction_helix.js:1481` | — |
| `helix:auditBegun` | `systems/faction_helix.js:1549` | — |
| `helix:auditEvaded` | `systems/faction_helix.js:1616` | — |
| `helix:auditRuled` | `systems/faction_helix.js:1607` | — |
| `helix:deed` | `systems/faction_helix.js:633` | — |
| `helix:deskFiled` | `systems/faction_helix.js:932` | — |
| `helix:deskLost` | `systems/faction_helix.js:970` | — |
| `helix:docketChoice` | `ui/impoundPayPrompt.js:157` | `systems/faction_helix.js:516` |
| `helix:fineOverdue` | `systems/faction_helix.js:1400` | — |
| `helix:finePaid` | `systems/faction_helix.js:1445` | — |
| `helix:finePosted` | `systems/faction_helix.js:1385` | — |
| `helix:flagsDropped` | `systems/faction_helix.js:774` | — |
| `helix:garnished` | `systems/faction_helix.js:1419` | — |
| `helix:lienFiled` | `systems/faction_helix.js:842` | — |
| `helix:lienScraped` | `systems/faction_helix.js:816`, `systems/faction_helix.js:1950` | — |
| `helix:lienStuck` | `systems/faction_helix.js:876` | — |
| `helix:manifestFiled` | `systems/faction_helix.js:1514` | — |
| `helix:noticeJumped` | `systems/faction_helix.js:1911` | — |
| `helix:noticeLapsed` | `systems/faction_helix.js:963`, `systems/faction_helix.js:1209`, `systems/faction_helix.js:1224`, `systems/faction_helix.js:1260`, `systems/faction_helix.js:1298`, `systems/faction_helix.js:1321`, `systems/faction_helix.js:1336`, `systems/faction_helix.js:1915`, `systems/faction_helix.js:1932` | — |
| `helix:noticePosted` | `systems/faction_helix.js:1095` | — |
| `helix:noticeVerified` | `systems/faction_helix.js:1362` | — |
| `helix:precedent` | `systems/faction_helix.js:671` | — |
| `helix:serviceOffer` | `systems/faction_helix.js:2047` | `ui/impoundPayPrompt.js:87` |
| `helix:tier` | `systems/faction_helix.js:638` | — |
| `helix:verdictFiled` | `systems/faction_helix.js:657` | — |
| `helix:warrantEscalated` | `systems/faction_helix.js:1683` | — |
| `helix:warrantPosted` | `systems/faction_helix.js:1698` | — |
| `helix:warrantSettled` | `systems/faction_helix.js:1762` | — |
| `helix:writLevy` | `systems/faction_helix.js:1835` | — |
| `helix:writSpawned` | `systems/faction_helix.js:1737` | — |
| `history:deadNoted` | `systems/historyWear.js:65` | — |
| `history:decal` | `systems/historyWear.js:90` | `systems/ships.js:2148` |
| `history:trinket` | `systems/historyWear.js:85` | `systems/ships.js:2144` |
| `hud:firstUse` | `systems/onboarding.js:1338`, `systems/tetherGameplay.js:2223`, `systems/tetherGameplay.js:2294` | — |
| `hud:layoutChanged` | `ui/hudLayout.js:86` | `save/saveSystem.js:587`, `ui/stuntCallout.js:898` |
| `hud:phase` | `systems/story.js:361`, `systems/story.js:391`, `systems/story.js:394`, `systems/story.js:760` | — |
| `hud:recallObjective` | `ui/input.js:737` | — |
| `hud:tagFlicker` | `systems/story.js:735` | — |
| `hull:fractured` | `systems/hullFracture.js:589` | `render/authoredMotion.js:1174` |
| `hullBurst:activated` | `systems/hullBurst.js:231` | — |
| `hullBurst:ended` | `systems/hullBurst.js:253` | — |
| `hullBurst:hit` | `systems/hullBurst.js:400`, `systems/hullBurst.js:431`, `systems/hullBurst.js:610` | `render/authoredMotion.js:1172` |
| `hullBurst:released` | `systems/hullBurst.js:545` | — |
| `ilexArk:accepted` | `systems/ilexArk.js:178` | — |
| `ilexArk:finished` | `systems/ilexArk.js:210` | — |
| `ilexArk:harvested` | `systems/economy.js:4614` | — |
| `ilexArk:offer` | `systems/ilexArk.js:242` | `ui/ilexArkPrompt.js:7` |
| `ilexArk:vaultDelivered` | `systems/ilexArk.js:196` | — |
| `ilexArk:vaultReleased` | `systems/ilexArk.js:118` | — |
| `impoundGrudge:escalated` | `systems/impoundGrudge.js:636` | — |
| `impoundGrudge:offer` | `systems/impoundGrudge.js:718` | — |
| `impoundGrudge:offerRefused` | `systems/impoundGrudge.js:732` | — |
| `impoundGrudge:resolved` | `systems/impoundGrudge.js:693` | — |
| `impoundGrudge:sabotage` | `systems/impoundGrudge.js:818` | — |
| `impoundGrudge:settled` | `systems/impoundGrudge.js:752` | — |
| `impoundGrudge:surfaced` | `systems/impoundGrudge.js:1073` | — |
| `impoundGrudge:surfacingEnded` | `systems/impoundGrudge.js:650` | — |
| `impoundGrudge:tracked` | `systems/impoundGrudge.js:808` | — |
| `impoundLot:deskAnswered` | — | `ui/station/screens/shipworks.js:5218` |
| `impoundLot:deskIntent` | `ui/station/screens/shipworks.js:5226` | `systems/impoundLot.js:1101` |
| `industrialDisasters:commandRejected` | `features/industrialDisasters/runtime.js:208` | — |
| `industrialDisasters:consequence` | `features/industrialDisasters/runtime.js:443` | — |
| `industrialDisasters:discover` | `features/industrialDisasters/encounter.js:17` | — |
| `industrialDisasters:event` | `features/industrialDisasters/runtime.js:405` | — |
| `industrialDisasters:inspect` | `features/industrialDisasters/runtime.js:319`, `features/industrialDisasters/runtime.js:416` | — |
| `industrialDisasters:poses` | `features/industrialDisasters/workerAdapter.js:118` | — |
| `industrialDisasters:signal` | `features/industrialDisasters/runtime.js:264` | — |
| `industrialDisasters:status` | `features/industrialDisasters/runtime.js:456` | — |
| `industry:haulRequested` | `systems/environmentalMachinery.js:1137` | `systems/traffic.js:2018` |
| `input:worldGestureCancelled` | `systems/input.js:1482`, `ui/worldObjectInteraction.js:230` | `systems/masslineThrow.js:180` |
| `interdiction:triggered` | `systems/encounterScripts.js:613`, `systems/world.js:6805` | `render/authoredMotion.js:1186`, `systems/presentationOrchestrator.js:198`, `systems/sectorSim.js:144` |
| `intervention:available` | `systems/intervention.js:268` | — |
| `intervention:closed` | `systems/intervention.js:321` | — |
| `intervention:jumperRipped` | `systems/intervention.js:440` | — |
| `intervention:logged` | `systems/intervention.js:144` | — |
| `jump:arrive` | `systems/world.js:6732` | `render/authoredMotion.js:1234`, `render/feel.js:1756`, `render/infrastructureMotion.js:307`, `render/shipMicroMotion.js:1761`, `render/vfx.js:3036`, `save/saveSystem.js:578`, `systems/gateControlDirector.js:75`, `systems/onboarding.js:898`, `systems/presentationOrchestrator.js:196`, `systems/sectorSim.js:168` |
| `jump:chargeAbort` | `systems/world.js:6751`, `systems/world.js:6885`, `systems/world.js:6978`, `systems/world.js:7044` | `audio/audioSystem.js:3165`, `render/authoredMotion.js:1235`, `render/shipMicroMotion.js:1762`, `systems/gateControlDirector.js:76`, `systems/presentationOrchestrator.js:195`, `systems/routeFollower.js:423`, `ui/galaxyMap.js:3140`, `ui/toasts.js:954` |
| `jump:chargeStart` | `systems/world.js:6960`, `systems/world.js:7004` | `render/authoredMotion.js:1232`, `render/feel.js:1746`, `render/shipMicroMotion.js:1758`, `systems/cloak.js:55`, `systems/cruise.js:72`, `systems/gateControlDirector.js:73`, `systems/missions.js:673`, `systems/presentationOrchestrator.js:192`, `systems/story.js:239`, `ui/galaxyMap.js:3139` |
| `jump:chargeTick` | `systems/world.js:6656` | `render/authoredMotion.js:1226`, `render/shipMicroMotion.js:1759`, `systems/presentationOrchestrator.js:193` |
| `jump:departurePreflight` | `systems/world.js:6942` | `systems/story.js:238` |
| `jump:interdictionWarning` | `systems/world.js:6682` | — |
| `jump:start` | `systems/world.js:6687` | `audio/audioSystem.js:3164`, `render/authoredMotion.js:1233`, `render/feel.js:1750`, `render/infrastructureMotion.js:300`, `render/shipMicroMotion.js:1760`, `systems/economy.js:1939`, `systems/gateControlDirector.js:74`, `systems/mining.js:310`, `systems/presentationOrchestrator.js:194`, `systems/sectorSim.js:167` |
| `jump:unfiledConfirmed` | `systems/world.js:7024` | `systems/story.js:240` |
| `kesslerPod:weighed` | `systems/kesslerScale.js:367` | `systems/missions.js:726` |
| `kilnback:caskReleased` | `systems/kilnback.js:163` | — |
| `kilnback:caskSalvaged` | `systems/kilnback.js:224` | — |
| `kilnback:coolantReleased` | `systems/kilnback.js:212` | — |
| `kilnback:phase` | `systems/kilnback.js:252` | — |
| `lamplighter:amends` | `systems/lamplighter.js:693` | — |
| `lamplighter:askLapsed` | `systems/lamplighter.js:838`, `systems/lamplighter.js:873` | — |
| `lamplighter:askPosted` | `systems/lamplighter.js:808` | — |
| `lamplighter:askSoured` | `systems/lamplighter.js:887` | — |
| `lamplighter:askVerified` | `systems/lamplighter.js:826` | — |
| `lamplighter:favor` | `systems/lamplighter.js:676` | — |
| `lamplighter:forgiven` | `systems/lamplighter.js:697` | — |
| `lamplighter:grudge` | `systems/lamplighter.js:715` | — |
| `lamplighter:guttered` | `systems/lamplighter.js:910` | — |
| `lamplighter:keeperTier` | `systems/lamplighter.js:679` | — |
| `lamplighter:lampSiphoned` | `systems/lamplighter.js:1062` | — |
| `lamplighter:lampTended` | `systems/lamplighter.js:1118` | — |
| `lamplighter:logged` | `systems/lamplighter.js:668` | — |
| `lamplighter:oilPodDropped` | `systems/lamplighter.js:947` | — |
| `lamplighter:oilSold` | `systems/lamplighter.js:1097` | — |
| `lamplighter:oiled` | `systems/lamplighter.js:1146` | — |
| `lamplighter:planted` | `systems/lamplighter.js:1167` | — |
| `lamplighter:rimPaid` | `systems/lamplighter.js:1179` | — |
| `lamplighter:snufferDowned` | `systems/lamplighter.js:1269` | — |
| `lamplighter:snufferInbound` | `systems/lamplighter.js:982` | — |
| `lamplighter:spurned` | `systems/lamplighter.js:718` | — |
| `lamplighter:wayfarerArrived` | `systems/lamplighter.js:1014` | — |
| `lamplighter:wayfarerInbound` | `systems/lamplighter.js:966` | — |
| `lamplighter:wayfarerLost` | `systems/lamplighter.js:1281` | — |
| `lamplighter:wayfarerTurned` | `systems/lamplighter.js:999` | — |
| `landmark:artifactRecovered` | `systems/missionObjectiveOps.js:946` | `systems/world.js:856` |
| `lane:facadeMiss` | `runtime/laneSystemFacades.js:58` | — |
| `lanternWard:serviceCommitted` | — | `systems/missions.js:611` |
| `lastShift:archive` | `ui/lastShiftPrompt.js:92`, `ui/lastShiftPrompt.js:102` | — |
| `lastShift:archived` | `systems/lastShift.js:408` | — |
| `lastShift:cancelRecovery` | `ui/lastShiftPrompt.js:104` | — |
| `lastShift:cue` | `systems/lastShift.js:268` | `ui/lastShiftPrompt.js:25` |
| `lastShift:cueSurfaced` | `ui/lastShiftPrompt.js:56` | — |
| `lastShift:offer` | `systems/lastShift.js:387` | `ui/lastShiftPrompt.js:26` |
| `lastShift:readRecovery` | `ui/lastShiftPrompt.js:97`, `ui/lastShiftPrompt.js:99` | — |
| `lastShift:recorderReturned` | `systems/lastShift.js:450` | — |
| `lastShift:recover` | `ui/lastShiftPrompt.js:103` | — |
| `lastShift:returnRecorder` | `ui/lastShiftPrompt.js:105` | — |
| `law:audit` | — | `systems/lawSecurity.js:452` |
| `law:custodyAcknowledged` | — | `systems/barkDirector.js:906` |
| `law:custodyTransfer` | — | `systems/custodyConsequences.js:57`, `systems/lossLedger.js:469` |
| `law:dispatchStarted` | — | `systems/barkDirector.js:891` |
| `law:distressRaised` | — | `systems/barkDirector.js:915` |
| `law:fineAssessed` | — | `systems/barkDirector.js:909`, `systems/plants/paperTrail.js:79`, `ui/impoundPayPrompt.js:74` |
| `law:fineChoice` | `ui/impoundPayPrompt.js:319`, `ui/impoundPayPrompt.js:413`, `ui/station/lawFineDesk.js:41` | `systems/lawSecurity.js:450` |
| `law:fineRefused` | — | `ui/impoundPayPrompt.js:75` |
| `law:impoundPay` | `ui/impoundPayPrompt.js:196` | `systems/lawSecurity.js:442` |
| `law:impoundPayOffer` | — | `ui/impoundPayPrompt.js:68` |
| `law:impoundPayRefused` | — | `ui/impoundPayPrompt.js:69` |
| `law:impoundPosted` | — | `systems/custodyConsequences.js:59` |
| `law:impoundRecovered` | — | `systems/custodyConsequences.js:61`, `systems/heat.js:425`, `ui/impoundPayPrompt.js:70` |
| `law:impoundReleased` | — | `ui/impoundPayPrompt.js:71` |
| `law:impoundWorked` | — | `systems/custodyConsequences.js:60` |
| `law:incidentOpened` | — | `systems/plants/paperTrail.js:76`, `systems/plants/witness.js:92`, `systems/traffic.js:1920` |
| `law:incidentResolved` | — | `systems/barkDirector.js:913` |
| `law:killedAdjudicated` | — | `systems/factions.js:389` |
| `law:obligationNoted` | — | `ui/impoundPayPrompt.js:79` |
| `law:obligationPaid` | — | `systems/factions.js:397`, `ui/impoundPayPrompt.js:80` |
| `law:playerSurrender` | — | `systems/lawSecurity.js:451` |
| `law:reportIncidentReceipt` | — | `systems/barkDirector.js:902`, `systems/factions.js:477`, `systems/heat.js:448` |
| `law:response` | — | `systems/barkDirector.js:912` |
| `law:responseDeferred` | — | `systems/barkDirector.js:911` |
| `law:sanctuaryWithdrawal` | — | `systems/barkDirector.js:910` |
| `law:sponsorPay` | — | `systems/lawSecurity.js:443` |
| `law:sponsorSettled` | — | `systems/heat.js:433` |
| `law:wantedCheckpointBroken` | — | `systems/heat.js:421` |
| `law:wantedCheckpointPosted` | — | `systems/barkDirector.js:893` |
| `law:wantedSweepEscaped` | — | `systems/heat.js:429` |
| `law:wantedWarrantPosted` | — | `systems/barkDirector.js:892` |
| `law:wantedWarrantReleased` | — | `systems/barkDirector.js:914` |
| `law:warrantIssued` | `data/encounters/700-the-weighing.js:286` | — |
| `law:witnessChoice` | — | `systems/encounterDirector.js:440` |
| `lawfulInspection:choose` | `ui/lawfulInspectionPrompt.js:46` | `render/authoredMotion.js:1197`, `systems/lawSecurity.js:429` |
| `lawfulInspection:offered` | — | `ui/lawfulInspectionPrompt.js:80` |
| `lawfulInspection:resolved` | — | `ui/lawfulInspectionPrompt.js:82` |
| `lawfulInspection:scanning` | — | `ui/lawfulInspectionPrompt.js:81` |
| `ledger:evidenceLinked` | `ui/shipLedgerPanel.js:563` | `systems/story.js:197` |
| `line:classChanged` | `systems/lineProgression.js:169` | `ui/lineClassMoment.js:31` |
| `line:recordStamped` | `systems/lineProgression.js:117` | — |
| `lineHead:breakerSplit` | `systems/lineHeads.js:223` | — |
| `lineHead:sealed` | `systems/lineHeads.js:288` | — |
| `lineHead:stapled` | `systems/lineHeads.js:453` | — |
| `longBerth:claim` | `ui/longBerthPrompt.js:39` | `systems/longBerth.js:66` |
| `longBerth:claimOffer` | `systems/longBerth.js:160` | `ui/longBerthPrompt.js:78` |
| `longBerth:restore` | `ui/longBerthPrompt.js:66` | `systems/longBerth.js:67` |
| `longBerth:restoreOffer` | `systems/longBerth.js:254` | `ui/longBerthPrompt.js:79` |
| `longBerth:stage` | `systems/longBerth.js:291` | `systems/crew.js:111` |
| `longBerth:trophy` | `systems/longBerth.js:312` | `systems/crew.js:114` |
| `loot:drop` | `systems/combat.js:895`, `systems/lootShards.js:1163`, `systems/stuntGrammar.js:202` | `systems/mining.js:304` |
| `loot:magnetCaptured` | `systems/lootShards.js:739` | `audio/audioSystem.js:3073` |
| `loot:manifestPayload` | `systems/lootShards.js:1272` | `systems/missions.js:986`, `systems/traffic.js:1897`, `systems/traffic.js:1902` |
| `loot:overflowConverted` | `systems/mining.js:2950` | `audio/audioSystem.js:3072` |
| `lossInvestigation:closed` | `systems/lossInvestigation.js:331` | — |
| `lossInvestigation:promoted` | `systems/lossInvestigation.js:194` | `systems/lossInvestigation.js:129` |
| `lossLedger:claimSurvey` | `systems/scanReveal.js:172` | `systems/lossLedger.js:464` |
| `lossLedger:priceMove` | `systems/lossLedger.js:626` | — |
| `lossLedger:recorded` | `systems/lossLedger.js:404` | `systems/factionPresence.js:519`, `systems/ships.js:2085` |
| `machine:appealAccepted` | `systems/precursorMachines.js:187` | — |
| `machine:jurisdictionResolved` | `systems/machineWork.js:262` | — |
| `machine:repairCompleted` | `systems/machineWork.js:221`, `systems/machineWork.js:328` | — |
| `machine:tokenDelivered` | `systems/precursorMachines.js:1046`, `systems/precursorMachines.js:1107` | — |
| `machine:workpiecePlaced` | `systems/machineWork.js:398` | — |
| `mail:delivered` | `systems/mail.js:238` | — |
| `manifest:changed` | `systems/manifestGame.js:10` | `ui/screens/manifest.js:152` |
| `manifest:completed` | `systems/manifestGame.js:17` | — |
| `map:sectorCharted` | `systems/world.js:5380` | `systems/economy.js:1848` |
| `massSeed:cleared` | `systems/massSeed.js:622` | — |
| `massSeed:collapsed` | `systems/massSeed.js:442`, `systems/massSeed.js:492`, `systems/massSeed.js:574`, `systems/massSeed.js:605` | `render/authoredMotion.js:1225` |
| `massSeed:collapsing` | `systems/massSeed.js:441`, `systems/massSeed.js:463`, `systems/massSeed.js:558`, `systems/massSeed.js:602` | `audio/audioSystem.js:3390` |
| `massSeed:deployDenied` | `systems/massSeed.js:179` | — |
| `massSeed:deployed` | `systems/massSeed.js:271` | `audio/audioSystem.js:3374`, `render/authoredMotion.js:1222`, `systems/onboarding.js:1122` |
| `massSeed:destroyed` | `systems/massSeed.js:601` | — |
| `massSeed:locked` | `systems/massSeed.js:328` | `audio/audioSystem.js:3382`, `render/authoredMotion.js:1223` |
| `massSeed:locking` | `systems/massSeed.js:393` | `audio/audioSystem.js:3378` |
| `massSeed:tetherCut` | `systems/massSeed.js:520` | `audio/audioSystem.js:3395`, `render/authoredMotion.js:1224` |
| `massSeed:warning` | `systems/massSeed.js:355` | `audio/audioSystem.js:3386` |
| `massline:bridleCut` | `systems/tetherGameplay.js:1124` | `ui/stuntCallout.js:1054` |
| `massline:bridleEnded` | `systems/tetherGameplay.js:1061`, `systems/tetherGameplay.js:1079`, `systems/tetherGameplay.js:1298` | `ui/masslineHud.js:1355` |
| `massline:bridleEndpointSelected` | `systems/tetherGameplay.js:918` | — |
| `massline:bridleLinked` | `systems/tetherGameplay.js:972` | — |
| `massline:bridleSetupEnded` | `systems/tetherGameplay.js:1134` | — |
| `massline:cadenceChanged` | `systems/tetherGameplay.js:2849` | — |
| `massline:flailOffer` | `systems/tetherGameplay.js:543`, `systems/tetherGameplay.js:766` | `systems/rockCore.js:94` |
| `massline:npcCounterplay` | `systems/tetherGameplay.js:3054` | `systems/barkDirector.js:1012` |
| `massline:npcLineCut` | `systems/tetherGameplay.js:1991` | — |
| `massline:playerLineCut` | `systems/tetherGameplay.js:2114` | `systems/gamepad.js:1001` |
| `massline:recovered` | `systems/tumbleStates.js:267` | — |
| `massline:recovering` | `systems/tumbleStates.js:698` | — |
| `massline:releaseCancelled` | `systems/masslineThrow.js:265` | `audio/audioSystem.js:3060` |
| `massline:releaseValidated` | `systems/masslineThrow.js:781` | `systems/plants/otherSide.js:139`, `systems/plants/towWatch.js:95`, `systems/presentationOrchestrator.js:169` |
| `massline:releaseWindow` | `systems/masslineThrow.js:351` | `ui/stuntCallout.js:1018` |
| `massline:rideStarted` | `systems/tetherGameplay.js:2267` | `ui/stuntCallout.js:1019` |
| `massline:selfSling` | `systems/masslineThrow.js:811` | `systems/flightV3.js:249`, `systems/onboarding.js:1086`, `ui/stuntCallout.js:904` |
| `massline:snareArmed` | `systems/masslineSnares.js:239` | `audio/audioSystem.js:3366`, `render/authoredMotion.js:1163` |
| `massline:snareCaught` | `systems/masslineSnares.js:434` | `systems/gamepad.js:992` |
| `massline:snareCut` | `systems/masslineSnares.js:727` | `audio/audioSystem.js:3370` |
| `massline:snareDeployed` | `systems/masslineSnares.js:341`, `systems/masslineSnares.js:686` | `render/authoredMotion.js:1157` |
| `massline:snareEnded` | `systems/masslineSnares.js:729` | `render/authoredMotion.js:1161` |
| `massline:sweepImpact` | `systems/masslineImpacts.js:367` | `render/vfx.js:2997`, `systems/masslineImpactDamage.js:60`, `systems/presentationOrchestrator.js:156`, `ui/stuntCallout.js:1053` |
| `massline:threat` | `systems/masslineThreats.js:273` | `systems/presentationOrchestrator.js:132` |
| `massline:throw` | `systems/masslineThrow.js:723` | `systems/lootShards.js:603`, `systems/mines.js:117`, `systems/missions.js:863`, `systems/onboarding.js:735`, `systems/swarmDrops.js:99`, `systems/tumbleStates.js:129`, `ui/stuntCallout.js:1021` |
| `massline:tumbleEnd` | `systems/tumbleStates.js:697` | `render/feel.js:1841`, `render/shipMicroMotion.js:1754` |
| `massline:tumbled` | `systems/tumbleStates.js:562` | `render/feel.js:1827` |
| `massline:whipSnap` | `systems/masslineThrow.js:832` | — |
| `matter:refused` | `matter/collectorKnot.js:97`, `systems/gyreSnare.js:2280`, `systems/gyreSnare.js:2748` | `ui/arsenalDenials.js:31` |
| `mercyService:completed` | `response/mercyService/live.js:226` | — |
| `mercyService:failedForward` | `response/mercyService/live.js:272` | — |
| `mercyService:order` | `ui/physicalJobsPrompt.js:25` | — |
| `mercyService:started` | `response/mercyService/live.js:83` | — |
| `mercyService:tool` | `ui/physicalJobsPrompt.js:28` | — |
| `mercyService:toolResult` | `response/mercyService/live.js:53` | — |
| `meridian:accountCharged` | `systems/faction_meridian.js:480` | — |
| `meridian:accountPaid` | `systems/faction_meridian.js:670` | — |
| `meridian:accountWarned` | `systems/faction_meridian.js:1529` | — |
| `meridian:assessmentCharged` | `systems/faction_meridian.js:1525` | — |
| `meridian:blacklistLifted` | `systems/faction_meridian.js:1500` | — |
| `meridian:blacklisted` | `systems/faction_meridian.js:1493`, `systems/faction_meridian.js:1511` | — |
| `meridian:claimPosted` | `systems/faction_meridian.js:1029` | — |
| `meridian:claimSettled` | `systems/faction_meridian.js:1089` | — |
| `meridian:claimStolen` | `systems/faction_meridian.js:1133` | — |
| `meridian:containerRecoupled` | `systems/faction_meridian.js:784` | — |
| `meridian:containerSold` | `data/encounters/701-spine-break.js:189` | — |
| `meridian:contractDefaulted` | `systems/faction_meridian.js:989` | — |
| `meridian:contractDelivered` | `systems/faction_meridian.js:947` | — |
| `meridian:contractExpired` | `systems/faction_meridian.js:959` | — |
| `meridian:contractPosted` | `systems/faction_meridian.js:907` | — |
| `meridian:contractTaken` | `systems/faction_meridian.js:649` | — |
| `meridian:convoyArrived` | `systems/faction_meridian.js:1318` | — |
| `meridian:convoyDeparted` | `systems/faction_meridian.js:1231` | — |
| `meridian:convoyLost` | `systems/faction_meridian.js:1340` | — |
| `meridian:convoyRaided` | `systems/faction_meridian.js:1369` | — |
| `meridian:couplerSnapped` | `systems/faction_meridian.js:734` | — |
| `meridian:deed` | `systems/faction_meridian.js:454` | — |
| `meridian:escortAsked` | `systems/faction_meridian.js:1235` | — |
| `meridian:escortSigned` | `systems/faction_meridian.js:1284` | — |
| `meridian:levyCollected` | `systems/faction_meridian.js:1588` | — |
| `meridian:raiderPlucked` | `systems/faction_meridian.js:1420` | — |
| `meridian:raiderRepelled` | `systems/faction_meridian.js:1755` | — |
| `meridian:refused` | `systems/faction_meridian.js:500` | — |
| `meridian:repoFielded` | `systems/faction_meridian.js:1627` | — |
| `meridian:tickerFloor` | `systems/faction_meridian.js:810` | — |
| `meridian:tier` | `systems/faction_meridian.js:449` | — |
| `meridian:verdictFiled` | `systems/faction_meridian.js:466` | — |
| `meridian:warrantLapsed` | `systems/faction_meridian.js:1478` | — |
| `meridian:warrantPaid` | `systems/faction_meridian.js:1735` | — |
| `meridian:warrantPosted` | `systems/faction_meridian.js:1453` | — |
| `meridian:writPosted` | `systems/faction_meridian.js:1550` | — |
| `meridian:writSettled` | `systems/faction_meridian.js:1647` | — |
| `mines:armed` | `systems/mines.js:250`, `systems/mines.js:320`, `systems/mines.js:364` | `audio/audioSystem.js:3027`, `render/ordnanceMotionPresentation.js:314` |
| `mines:capReached` | `systems/mines.js:144` | `audio/audioSystem.js:3104` |
| `mines:detonated` | `systems/mines.js:545` | `audio/audioSystem.js:3014` |
| `mines:expired` | `systems/mines.js:237` | `systems/survivalAnnounce.js:449` |
| `mines:placeRequest` | `systems/encounterScripts.js:153`, `systems/encounterScripts/weirAmbush.js:241`, `systems/impoundGrudge.js:990`, `systems/survivalArena.js:1818`, `systems/swarmEvents.js:280` | `systems/mines.js:116` |
| `mines:placed` | `systems/mines.js:215` | `systems/survivalArena.js:1430` |
| `mines:released` | `systems/mines.js:379`, `systems/mines.js:582` | `systems/survivalAnnounce.js:450` |
| `mines:struck` | `systems/mines.js:482` | `render/vfx.js:3079` |
| `mines:triggered` | `systems/mines.js:534` | — |
| `mines:turned` | `systems/mines.js:324` | `render/vfx.js:3080` |
| `mining:beamLocked` | `systems/mining.js:1160` | — |
| `mining:bulkHaulDelivered` | `systems/mining.js:2785` | `systems/missions.js:797`, `ui/prompts/bulkHaulTag.js:146` |
| `mining:bulkRequiresTether` | `systems/mining.js:1174` | `systems/presentationOrchestrator.js:226`, `ui/prompts/bulkHaulTag.js:143` |
| `mining:heatChanged` | `systems/mining.js:940` | `ui/miningHud.js:210` |
| `mining:npcExtraction` | `systems/trafficRecoveryOps.js:686` | `systems/fieldDepletion.js:756` |
| `mining:podSplit` | `systems/mining.js:2117` | — |
| `mining:richCoreChargeStart` | `systems/mining.js:2730` | `render/asteroidMotionPresentation.js:528`, `systems/presentationOrchestrator.js:223`, `ui/miningHud.js:213` |
| `mining:richCoreCompleted` | `systems/mining.js:2763` | `render/asteroidMotionPresentation.js:529`, `systems/presentationOrchestrator.js:224`, `ui/miningHud.js:214` |
| `mining:richCoreExposed` | `systems/mining.js:2708` | `render/asteroidMotionPresentation.js:527`, `systems/presentationOrchestrator.js:222`, `ui/miningHud.js:212` |
| `mining:richCoreFizzle` | `systems/mining.js:2767` | `render/asteroidMotionPresentation.js:530`, `systems/presentationOrchestrator.js:225`, `ui/miningHud.js:215` |
| `mining:seamHit` | `systems/mining.js:3126` | `systems/presentationOrchestrator.js:215` |
| `mining:start` | `systems/mining.js:493`, `systems/mining.js:547`, `systems/mining.js:608`, `systems/mining.js:749`, `systems/mining.js:2063` | `audio/audioSystem.js:2971`, `render/asteroidMotionPresentation.js:522`, `render/authoredMotion.js:1152`, `render/authoredMotion.js:1179`, `render/vfx.js:3022`, `systems/missions.js:972`, `systems/onboarding.js:728`, `systems/presentationOrchestrator.js:212`, `ui/miningHud.js:208`, `ui/worldObjectInteraction.js:459` |
| `mining:stop` | `systems/mining.js:881` | `audio/audioSystem.js:2972`, `render/asteroidMotionPresentation.js:523`, `render/authoredMotion.js:1154`, `render/authoredMotion.js:1180`, `render/vfx.js:3023`, `systems/presentationOrchestrator.js:213`, `ui/miningHud.js:209` |
| `mining:tick` | `systems/automation.js:1229`, `systems/mining.js:1206` | `audio/audioSystem.js:2973`, `render/vfx.js:3024`, `systems/heliosSharedCut.js:62`, `systems/presentationOrchestrator.js:214`, `ui/miningHud.js:211` |
| `mining:ventBonus` | `systems/mining.js:1004` | `systems/onboarding.js:928`, `ui/miningHud.js:216` |
| `mining:ventReady` | `systems/mining.js:921` | `systems/presentationOrchestrator.js:219` |
| `mining:yield` | `balance/careerCohorts.js:2304`, `balance/prospectorPublicRoute.js:525`, `systems/mining.js:999`, `systems/mining.js:1418`, `systems/mining.js:1491`, `systems/mining.js:2220`, `systems/mining.js:2295`, `systems/mining.js:2760` | `careers/origins/prospectorOrigin.js:636`, `render/authoredMotion.js:1153`, `render/vfx.js:3027`, `systems/encounterDirector.js:417`, `systems/missions.js:780`, `systems/onboarding.js:729`, `systems/presentationOrchestrator.js:220` |
| `missile:guidanceLost` | `systems/weapons.js:1310` | — |
| `mission:abandon` | `systems/moralTrap.js:310` | `systems/missions.js:666` |
| `mission:abandoned` | — | `systems/contractClauses.js:375` |
| `mission:accepted` | `systems/missions.js:1610` | `audio/audioSystem.js:3119`, `save/saveSystem.js:579`, `systems/aftermathWrecks.js:1283`, `systems/contractClauses.js:370`, `systems/contractClauses.js:371`, `systems/economy.js:1809`, `systems/encounterDirector.js:419`, `systems/faction_frontier.js:492`, `systems/fenceDesk.js:53`, `systems/moralTrap.js:191`, `systems/onboarding.js:731`, `ui/screens/missionLog.js:2774`, `ui/wreckChoicePrompt.js:51` |
| `mission:completed` | `missions/lanternWardStory.js:84`, `systems/missions.js:4962`, `systems/missions.js:4982`, `systems/missions.js:5276` | `audio/audioSystem.js:3123`, `balance/careerCohorts.js:2242`, `careers/origins/haulerOriginSystem.js:70`, `save/saveSystem.js:580`, `systems/aftermathWrecks.js:1284`, `systems/claims.js:359`, `systems/contractClauses.js:372`, `systems/contractClauses.js:379`, `systems/crew.js:106`, `systems/economyContracts.js:265`, `systems/encounterDirector.js:428`, `systems/faction_frontier.js:494`, `systems/factions.js:512`, `systems/fenceDesk.js:54`, `systems/lossLedger.js:467`, `systems/onboarding.js:732`, `systems/story.js:261`, `ui/moralTrapPrompt.js:39`, `ui/screens/missionLog.js:2775` |
| `mission:conditionBroken` | `systems/contractClauses.js:674`, `systems/missions.js:1239`, `systems/missions.js:1353` | `systems/missions.js:937` |
| `mission:conditionPending` | `systems/missions.js:1419` | — |
| `mission:conditionProgress` | `systems/contractClauses.js:642`, `systems/missions.js:1222` | — |
| `mission:conditionSatisfied` | `systems/contractClauses.js:653`, `systems/missions.js:1230`, `systems/missions.js:1346` | `systems/missions.js:934` |
| `mission:expired` | `systems/missions.js:5803` | `audio/audioSystem.js:3131`, `save/saveSystem.js:582`, `systems/aftermathWrecks.js:1286`, `systems/contractClauses.js:374`, `systems/contractClauses.js:384`, `systems/encounterDirector.js:433`, `systems/factions.js:521`, `systems/fenceDesk.js:60`, `ui/screens/missionLog.js:2777` |
| `mission:failed` | `systems/missions.js:5719` | `audio/audioSystem.js:3130`, `careers/origins/haulerOriginSystem.js:73`, `save/saveSystem.js:581`, `systems/aftermathWrecks.js:1285`, `systems/contractClauses.js:373`, `systems/encounterDirector.js:429`, `systems/faction_frontier.js:493`, `systems/factions.js:520`, `systems/fenceDesk.js:55`, `systems/story.js:262`, `ui/moralTrapPrompt.js:40`, `ui/screens/missionLog.js:2776` |
| `mission:forceEvent` | `data/encounters/1206-the-fire-sale.js:124`, `systems/economyContracts.js:871` | `systems/economy.js:1949` |
| `mission:gateCleared` | `systems/missions.js:4007`, `systems/missions.js:4135` | — |
| `mission:offerBoarded` | `systems/missionBoardOps.js:1310` | `systems/aftermathWrecks.js:1282`, `systems/economyContracts.js:246` |
| `mission:offered` | `response/mercyService/live.js:136`, `systems/aftermathWrecks.js:2504`, `systems/alienEcology.js:777`, `systems/careerContracts.js:329`, `systems/e1EncounterRuntime.js:520`, `systems/economyContracts.js:403`, `systems/lossInvestigation.js:284`, `systems/lossLedger.js:380`, `systems/postEndingReplay.js:371`, `systems/salvage.js:1257`, `systems/uniqueWrecks.js:1122` | `systems/economy.js:1808`, `systems/lossInvestigation.js:128`, `systems/missions.js:671`, `systems/survivorPod.js:726` |
| `mission:setPieceTransition` | `systems/missions.js:4918` | `systems/lossInvestigation.js:130` |
| `mission:setPieceTravelLine` | `systems/missionStoryOps.js:1370` | — |
| `mission:spawnDeferred` | `systems/missionSpawningOps.js:1438` | — |
| `mission:targetsProjected` | `systems/missionSpawningOps.js:96` | — |
| `mission:updated` | `missions/blackFlagMissions.js:183`, `missions/cinderRoute.js:170`, `missions/cinderRoute.js:197`, `missions/dioneTargetPractice.js:248`, `missions/furnaceWorksiteRuntime.js:83`, `systems/contractClauses.js:647`, `systems/contractClauses.js:657`, `systems/contractClauses.js:686`, `systems/missionBoardOps.js:94`, `systems/missionBoardOps.js:270`, `systems/missionBoardOps.js:551`, `systems/missionBoardOps.js:698`, `systems/missionBoardOps.js:1102`, `systems/missionBoardOps.js:1136`, `systems/missionBoardOps.js:1148`, `systems/missionBoardOps.js:1309`, `systems/missionObjectiveOps.js:66`, `systems/missionObjectiveOps.js:113`, `systems/missionObjectiveOps.js:176`, `systems/missionObjectiveOps.js:189`, `systems/missionObjectiveOps.js:205`, `systems/missionObjectiveOps.js:221`, `systems/missionObjectiveOps.js:267`, `systems/missionObjectiveOps.js:309`, `systems/missionObjectiveOps.js:379`, `systems/missionObjectiveOps.js:462`, `systems/missionObjectiveOps.js:493`, `systems/missionObjectiveOps.js:621`, `systems/missionObjectiveOps.js:734`, `systems/missionObjectiveOps.js:743`, `systems/missionObjectiveOps.js:1020`, `systems/missionObjectiveOps.js:1046`, `systems/missionObjectiveOps.js:1117`, `systems/missionObjectiveOps.js:1133`, `systems/missionObjectiveOps.js:1177`, `systems/missionObjectiveOps.js:1198`, `systems/missionObjectiveOps.js:1228`, `systems/missionObjectiveOps.js:1251`, `systems/missionObjectiveOps.js:1358`, `systems/missionObjectiveOps.js:1557`, `systems/missionObjectiveOps.js:2775`, `systems/missionObjectiveOps.js:2918`, `systems/missionObjectiveOps.js:3032`, `systems/missionObjectiveOps.js:3122`, `systems/missionSpawningOps.js:531`, `systems/missionSpawningOps.js:549`, `systems/missionSpawningOps.js:621`, `systems/missionSpawningOps.js:1071`, `systems/missionSpawningOps.js:1402`, `systems/missionSpawningOps.js:1429`, `systems/missionSpawningOps.js:1526`, `systems/missionSpawningOps.js:1656`, `systems/missionSpawningOps.js:1833`, `systems/missionStoryOps.js:171`, `systems/missionStoryOps.js:253`, `systems/missionStoryOps.js:323`, `systems/missionStoryOps.js:527`, `systems/missionStoryOps.js:560`, `systems/missionStoryOps.js:575`, `systems/missionStoryOps.js:589`, `systems/missionStoryOps.js:774`, `systems/missionStoryOps.js:916`, `systems/missionStoryOps.js:964`, `systems/missionStoryOps.js:1050`, `systems/missionStoryOps.js:1632`, `systems/missionStoryOps.js:2393`, `systems/missionStoryOps.js:2585`, `systems/missionStoryOps.js:2643`, `systems/missions.js:527`, `systems/missions.js:539`, `systems/missions.js:549`, `systems/missions.js:770`, `systems/missions.js:1226`, `systems/missions.js:1234`, `systems/missions.js:1255`, `systems/missions.js:1358`, `systems/missions.js:1449`, `systems/missions.js:1463`, `systems/missions.js:1477`, `systems/missions.js:1487`, `systems/missions.js:1500`, `systems/missions.js:1519`, `systems/missions.js:1623`, `systems/missions.js:1864`, `systems/missions.js:1891`, `systems/missions.js:2052`, `systems/missions.js:2355`, `systems/missions.js:3149`, `systems/missions.js:3182`, `systems/missions.js:3228`, `systems/missions.js:3239`, `systems/missions.js:3255`, `systems/missions.js:3681`, `systems/missions.js:3924`, `systems/missions.js:3946`, `systems/missions.js:4021`, `systems/missions.js:4065`, `systems/missions.js:4141`, `systems/missions.js:4213`, `systems/missions.js:4365`, `systems/missions.js:4372`, `systems/missions.js:5261`, `systems/missions.js:5733`, `systems/missions.js:5814`, `systems/wakeHandoffRuntime.js:25`, `systems/workingBattlefieldRuntime.js:148` | `systems/contractClauses.js:393`, `ui/screens/missionLog.js:2773`, `ui/station/screens/contracts.js:1676` |
| `mission:venueFailure` | `response/mercyService/live.js:283`, `systems/wreckCourt.js:1071` | `systems/missions.js:821` |
| `mission:venueProof` | `response/mercyService/live.js:227`, `systems/wreckCourt.js:1034` | `systems/missions.js:809` |
| `mode:changed` | `core/simLaneCommands.js:182`, `main.js:477`, `main.js:1312`, `main.js:1354`, `main.js:1366`, `save/saveSystem.js:6644`, `save/saveSystem.js:6671`, `save/saveSystem.js:7399`, `save/saveSystem.js:7737` | `render/feel.js:1556`, `systems/autoTargetAssist.js:143`, `systems/input.js:1544`, `systems/presentationAdapters.js:342`, `systems/scanner.js:1136`, `ui/contextWheel.js:349`, `ui/loadingPresenter.js:687`, `ui/masslineHud.js:1378`, `ui/screenManager.js:751`, `ui/screens/mainMenu.js:1259`, `ui/uiRoot.js:1223`, `ui/wingmanRadial.js:355` |
| `module:equipped` | `systems/ships.js:3386` | `systems/onboarding.js:778`, `systems/onboarding.js:788`, `systems/onboarding.js:1138`, `systems/ships.js:1973`, `systems/survivalDraft.js:216`, `systems/world.js:798`, `ui/station/screens/shipworks.js:4543` |
| `module:fitRefused` | `systems/ships.js:2062`, `systems/ships.js:2068`, `systems/ships.js:2725`, `systems/ships.js:3323`, `systems/ships.js:3396` | `ui/station/screens/shipworks.js:4547`, `ui/station/screens/shipworks.js:4570`, `ui/station/screens/shipworks.js:4579` |
| `module:granted` | `systems/ships.js:2354`, `systems/ships.js:2823`, `systems/ships.js:2834` | — |
| `module:purchased` | `systems/ships.js:2795` | `systems/onboarding.js:938` |
| `module:sold` | `systems/ships.js:2714` | — |
| `module:unequipped` | `systems/ships.js:2215`, `systems/ships.js:3431` | `systems/ships.js:1974`, `systems/survivalDraft.js:217`, `systems/world.js:799`, `ui/station/screens/shipworks.js:4567` |
| `moisture:loss` | `systems/moistureLoss.js:208` | — |
| `moment:amended` | `systems/bulletTime.js:278` | `ui/clipCaptureRuntime.js:111` |
| `moment:holyShit` | — | `render/feel.js:1816`, `systems/gamepad.js:1123` |
| `moralMemory:remember` | `data/encounters/1211-the-forecastle-vote.js:437`, `data/encounters/1211-the-forecastle-vote.js:444` | `systems/encounterDirector.js:404` |
| `moralMemory:vengefulReturn` | `systems/e1EncounterRuntime.js:530` | `systems/encounterDirector.js:406` |
| `moralTrap:choose` | `ui/moralTrapPrompt.js:78` | `systems/moralTrap.js:190` |
| `moralTrap:resolved` | `systems/moralTrap.js:306` | `ui/moralTrapPrompt.js:38` |
| `moralTrap:revealed` | `systems/moralTrap.js:254` | `ui/moralTrapPrompt.js:37` |
| `morrow:launch` | `systems/morrow.js:291` | — |
| `morrow:met` | `systems/morrow.js:223` | — |
| `morrow:voice` | `systems/morrow.js:197` | — |
| `mothlight:identified` | `systems/mothlight.js:225` | `ui/mothlightPrompt.js:6` |
| `mothlight:lampReleased` | `systems/mothlight.js:132` | — |
| `mothlight:phase` | `systems/mothlight.js:179` | — |
| `namedAce:appeared` | `systems/encounterScripts.js:3901` | — |
| `namedAce:fled` | — | `systems/encounterDirector.js:444` |
| `nav:abortRoute` | — | `systems/routeFollower.js:415` |
| `nav:autopilot` | `systems/flight.js:408`, `systems/flightV3.js:1547`, `systems/flightV3.js:1848`, `systems/missions.js:2432`, `systems/missions.js:2454`, `systems/world.js:7155` | `systems/routeFollower.js:418` |
| `nav:engageRoute` | `systems/routeFollower.js:413`, `ui/screens/starmap.js:1823` | `systems/routeFollower.js:408` |
| `nav:routeBrake` | — | `audio/audioSystem.js:3238` |
| `nav:waypoint` | `features/industrialDisasters/runtime.js:307`, `save/saveSystem.js:8492`, `systems/claims.js:1898`, `systems/claims.js:1906`, `systems/encounterDirector.js:2684`, `systems/encounterDirector.js:2696`, `systems/missionObjectiveOps.js:150`, `systems/missionObjectiveOps.js:1310`, `systems/missionStoryOps.js:2991`, `systems/missions.js:690`, `systems/missions.js:2344`, `systems/missions.js:2487`, `systems/missions.js:2522`, `systems/world.js:7154`, `ui/market/tradeLogic.js:575` | `render/authoredMotion.js:1182` |
| `nemesis:encounterRejected` | `nemesis/encounterHost.js:135` | — |
| `nemesis:encounterStarted` | `nemesis/encounterHost.js:205` | — |
| `nemesis:escaped` | `nemesis/encounterHost.js:131` | — |
| `nemesis:spare` | `ui/nemesisComms.js:69` | — |
| `nest:waspsLaunched` | `data/encounters/705-the-nest.js:458` | — |
| `news:headline` | `systems/aftermathWrecks.js:897`, `systems/aftermathWrecks.js:997`, `systems/e1EncounterRuntime.js:329`, `systems/lastShift.js:403`, `systems/nemesisSignals.js:25`, `systems/presentationOrchestrator.js:1364`, `systems/trafficCausalChainOps.js:2800`, `systems/trafficRecoveryOps.js:336`, `ui/marketNews.js:298` | — |
| `news:publish` | `data/encounters/1311-eris-last-pod.js:266`, `data/encounters/1311-eris-last-pod.js:294`, `data/encounters/362-the-salvage-watch.js:344`, `data/encounters/362-the-salvage-watch.js:360`, `data/encounters/362-the-salvage-watch.js:451`, `data/encounters/365-the-grandee.js:102`, `data/encounters/365-the-grandee.js:166`, `data/encounters/365-the-grandee.js:196`, `data/encounters/367-the-salvage-tail.js:274`, `data/encounters/367-the-salvage-tail.js:319`, `data/encounters/367-the-salvage-tail.js:345`, `systems/aftermathWrecks.js:905`, `systems/aftermathWrecks.js:1015`, `systems/blindWelderRuntime.js:162`, `systems/choirReliefBerth.js:368`, `systems/choirReliefBerth.js:408`, `systems/claims.js:2441`, `systems/claims.js:2649`, `systems/claims.js:3131`, `systems/claims.js:3178`, `systems/crSituationKit.js:69`, `systems/driftAuctionRuntime.js:194`, `systems/driftAuctionRuntime.js:211`, `systems/driftAuctionRuntime.js:403`, `systems/eighthBellRuntime.js:140`, `systems/factions.js:360`, `systems/factions.js:613`, `systems/glueMeetMassRuntime.js:120`, `systems/heliosClaimOpening.js:123`, `systems/heliosClaimOpening.js:159`, `systems/impoundGrudge.js:682`, `systems/impoundLot.js:1390`, `systems/memorialThief.js:136`, `systems/npcJobsRuntime.js:1636`, `systems/presentationOrchestrator.js:1371`, `systems/runawayKilnRuntime.js:193`, `systems/runawayKilnRuntime.js:210`, `systems/special500Director.js:286`, `systems/special500Spectacle.js:136`, `systems/trafficCausalChainOps.js:2300`, `systems/trafficJobOps.js:983`, `systems/uniqueWrecks.js:669`, `systems/uniqueWrecks.js:2057`, `systems/uniqueWrecks.js:2136`, `systems/world.js:1149`, `systems/world.js:5346`, `systems/worldClock.js:222`, `systems/worldPressure.js:446`, `ui/watchlistHud.js:77` | — |
| `news:render` | `ui/hud.js:2283` | — |
| `npc:hailed` | `systems/barkDirector.js:2061`, `systems/barkDirector.js:2206` | `render/authoredMotion.js:1217` |
| `npcJobs:towAssistComplete` | `systems/npcJobsRuntime.js:3879` | `systems/scanner.js:1131` |
| `npcJobs:towAssistLost` | `systems/npcJobsRuntime.js:3415`, `systems/npcJobsRuntime.js:4022`, `systems/npcJobsRuntime.js:4061` | `systems/missions.js:983`, `systems/scanner.js:1132` |
| `npcjobs:approach` | — | `features/breakwaterSpur/runtime.js:78` |
| `npcjobs:arrived` | — | `features/breakwaterSpur/runtime.js:77` |
| `npcjobs:closeCall` | `systems/npcJobsRuntime.js:5891` | — |
| `npcjobs:complete` | — | `features/breakwaterSpur/runtime.js:80`, `systems/traffic.js:1893` |
| `npcjobs:crewResponse` | `systems/npcJobsRuntime.js:7055` | — |
| `npcjobs:cycle` | — | `systems/traffic.js:1891`, `systems/traffic.js:1892` |
| `npcjobs:depart` | — | `features/breakwaterSpur/runtime.js:76` |
| `npcjobs:distress` | `systems/npcJobsRuntime.js:7261` | `systems/traffic.js:1882` |
| `npcjobs:errand` | `systems/laneErrands.js:376` | — |
| `npcjobs:hold` | — | `systems/traffic.js:1879` |
| `npcjobs:load` | — | `features/breakwaterSpur/runtime.js:75`, `systems/traffic.js:1877` |
| `npcjobs:loadEmpty` | `systems/npcJobsRuntime.js:1437`, `systems/npcJobsRuntime.js:1451` | `systems/barkDirector.js:924` |
| `npcjobs:lotClaimed` | `systems/npcJobsRuntime.js:1444` | `ui/station/barContacts.js:225` |
| `npcjobs:lotPosted` | `systems/npcJobsRuntime.js:1424` | `ui/station/barContacts.js:224` |
| `npcjobs:lotReplaced` | `systems/npcJobsRuntime.js:1422` | — |
| `npcjobs:minerRelocated` | `systems/npcJobsRuntime.js:4190` | `render/authoredMotion.js:1202`, `systems/barkDirector.js:928` |
| `npcjobs:oncallTenderRetired` | `systems/npcJobsRuntime.js:6490` | — |
| `npcjobs:resumed` | `systems/npcJobsRuntime.js:6027` | — |
| `npcjobs:surveyMarked` | `systems/npcJobsRuntime.js:1595` | — |
| `npcjobs:threatened` | `systems/npcJobsRuntime.js:6100` | `render/npcJobSignatureVfx.js:711`, `render/npcJobSignatureVfx.js:902` |
| `npcjobs:unload` | — | `features/breakwaterSpur/runtime.js:79`, `systems/traffic.js:1878` |
| `npcjobs:work` | — | `systems/traffic.js:1876` |
| `npcjobs:yardDispatch` | `systems/npcJobsRuntime.js:6232` | `systems/stationSideEventDirector.js:107` |
| `npcjobs:yardDispatchDone` | `systems/npcJobsRuntime.js:6255` | — |
| `occupation:delivered` | `systems/scavengerOccupationSwitch.js:610` | — |
| `occupation:licensed` | `systems/scavengerOccupationSwitch.js:955` | — |
| `occupation:lost` | `systems/scavengerOccupationSwitch.js:691`, `systems/scavengerOccupationSwitch.js:750` | — |
| `occupation:recommissioned` | `systems/scavengerOccupationSwitch.js:860` | — |
| `occupation:settled` | `systems/scavengerOccupationSwitch.js:631` | — |
| `occupation:switched` | `systems/scavengerOccupationSwitch.js:502` | — |
| `onboarding:drillFolded` | `systems/onboarding.js:2049` | — |
| `onboarding:rangePrompt` | `systems/onboarding.js:2627`, `systems/onboarding.js:3573`, `systems/onboarding.js:4971` | — |
| `onboarding:rosterPrewarm` | `systems/onboarding.js:3213` | — |
| `onboarding:swingClinic` | `systems/onboarding.js:2632` | — |
| `optic:beamContact` | `systems/combat.js:1465` | — |
| `optic:contact` | `systems/weapons.js:3283`, `systems/weapons.js:3349` | `audio/audioSystem.js:2893` |
| `optic:rekindled` | — | `audio/audioSystem.js:2894` |
| `orrinWitness:ensureEvidence` | `systems/story.js:1294` | `systems/world.js:805` |
| `orrinWitness:evidenceEnsured` | `systems/world.js:2720` | `systems/story.js:175` |
| `orrinWitness:evidenceRecovered` | `systems/story.js:1407` | — |
| `orrinWitness:submitted` | `systems/story.js:1435` | — |
| `pallas:shift` | `systems/pallasWorkLoop.js:136` | — |
| `pallasHiddenCache:cargoChanged` | `systems/world.js:8435` | — |
| `pallasHiddenCache:choose` | `ui/recoveryEncounterPrompt.js:394` | `systems/world.js:807` |
| `pallasHiddenCache:clueRecovered` | `systems/world.js:8231` | — |
| `pallasHiddenCache:decisionReady` | `systems/world.js:8266` | `ui/recoveryEncounterPrompt.js:497` |
| `pallasHiddenCache:pickupReady` | `systems/world.js:8395` | — |
| `pallasHiddenCache:resolved` | `systems/world.js:8349` | `ui/recoveryEncounterPrompt.js:498` |
| `palletJack:drop` | `ui/palletJackPrompt.js:19` | — |
| `palletJack:lost` | `systems/palletJack.js:382` | — |
| `palletJack:offer` | `systems/palletJack.js:283` | `ui/palletJackPrompt.js:6` |
| `palletJack:phase` | `systems/palletJack.js:187` | — |
| `palletJack:released` | `systems/palletJack.js:266` | — |
| `palletJack:trail` | `ui/palletJackPrompt.js:20` | — |
| `patrol:proximity` | `systems/encounterScripts.js:455`, `systems/faction_verge.js:802` | `systems/economy.js:1940`, `systems/moralTrap.js:189` |
| `patrolBait:cleared` | `systems/patrolBait.js:330` | — |
| `patrolBait:opened` | `systems/patrolBait.js:262` | — |
| `patrolBait:voice` | `systems/patrolBait.js:93` | — |
| `pds:intercept` | `systems/countermeasures.js:470` | `audio/audioSystem.js:2878` |
| `physics:authorityStalled` | — | `ui/toasts.js:948` |
| `physics:contactsCompleted` | — | `systems/collisionConsequences.js:124`, `systems/survivalArena.js:1383` |
| `physics:impact` | `core/physics.js:2605` | `audio/audioSystem.js:2888`, `features/breakwaterSpur/runtime.js:72`, `features/industrialDisasters/physicalSite.js:505`, `features/rigWorkshop/cargoImpact.js:55`, `gallery/orbital/session.js:118`, `missions/racingOpponents.js:361`, `render/asteroidMotionPresentation.js:518`, `render/feel.js:1793`, `render/shipMicroMotion.js:1755`, `render/vfx.js:2928`, `systems/aftermathWrecks.js:1258`, `systems/asteroidSites.js:857`, `systems/barkDirector.js:1026`, `systems/collisionConsequences.js:123`, `systems/encounterDirector.js:396`, `systems/environmentMaterials.js:217`, `systems/fenderBenderPlant.js:131`, `systems/fields.js:506`, `systems/flightV3.js:240`, `systems/fragileCargo.js:414`, `systems/gamepad.js:984`, `systems/heistFacilities.js:325`, `systems/impulseCharges.js:234`, `systems/lootShards.js:602`, `systems/masslineImpactDamage.js:61`, `systems/missions.js:867`, `systems/npcJobsRuntime.js:1248`, `systems/plants/busDoesntMove.js:147`, `systems/plants/doorstop.js:125`, `systems/plants/ducklings.js:94`, `systems/plants/oneYank.js:128`, `systems/plants/otherSide.js:133`, `systems/plants/snaggedPod.js:112`, `systems/plants/sweepingLine.js:93`, `systems/reactiveMatter.js:530`, `systems/roadRage.js:283`, `systems/roadRage.js:347`, `systems/ships.js:2108`, `systems/survivalArena.js:1382`, `systems/survivalResults.js:530`, `systems/swarmArena.js:910`, `systems/swarmDrops.js:101`, `systems/swarmElites.js:187`, `systems/volatileExposure.js:215`, `testing/lab/titleVerbScenario.js:51`, `testing/motionScenarios.js:1764` |
| `pickup:collected` | `core/physics.js:2357`, `systems/combat.js:657`, `systems/mining.js:1826`, `systems/mining.js:2882`, `systems/uniqueWrecks.js:1918` | `audio/audioSystem.js:3069`, `render/vfx.js:3102`, `save/saveSystem.js:496`, `systems/economy.js:1892`, `systems/encounterDirector.js:378`, `systems/faction_meridian.js:369`, `systems/lawSecurity.js:432`, `systems/mining.js:306`, `systems/missions.js:753`, `systems/onboarding.js:730`, `systems/onboarding.js:819`, `systems/onboarding.js:913`, `systems/plants/busDoesntMove.js:148`, `systems/plants/litter.js:73`, `systems/plants/snaggedPod.js:113`, `systems/presentationOrchestrator.js:227`, `systems/scramblePlant.js:122`, `systems/swarmArena.js:932`, `systems/swarmDrops.js:97`, `systems/swarmEvents.js:118`, `systems/swarmFloor.js:902`, `systems/swarmSupply.js:112`, `systems/tetherGameplay.js:377`, `systems/traffic.js:1894`, `systems/traffic.js:1895`, `systems/traffic.js:1900`, `systems/traffic.js:1904`, `systems/traffic.js:1905`, `systems/traffic.js:1909`, `systems/world.js:808`, `systems/world.js:809`, `systems/world.js:812`, `systems/world.js:827`, `systems/world.js:921` |
| `pilot:comboDetonated` | `systems/fields.js:1370` | — |
| `pirateDisengage:surrenderOffer` | — | `ui/pirateParleyPrompt.js:223` |
| `pirateDisengage:triggered` | `data/encounters/344-opening-hauler-raid.js:124` | `systems/combatOutcome.js:303` |
| `pirateDisengage:verdict` | `ui/pirateParleyPrompt.js:201` | — |
| `pirateDisengage:yieldResolved` | — | `ui/pirateParleyPrompt.js:224` |
| `pirateParley:choose` | `ui/pirateParleyPrompt.js:156` | `systems/pirateParley.js:98` |
| `pirateParley:demand` | `systems/scanner.js:1885` | `ui/pirateParleyPrompt.js:221` |
| `pirateParley:resolved` | — | `systems/combatOutcome.js:302`, `ui/pirateParleyPrompt.js:222` |
| `pirateParley:started` | — | `systems/combatOutcome.js:301` |
| `pitborn:ballastAccreted` | `systems/faction_pitborn.js:831` | — |
| `pitborn:ballastHorn` | `systems/faction_pitborn.js:878` | — |
| `pitborn:ballastNamed` | `systems/faction_pitborn.js:888` | — |
| `pitborn:ballastStart` | `systems/faction_pitborn.js:854` | — |
| `pitborn:blacklistLifted` | `systems/faction_pitborn.js:2085` | — |
| `pitborn:blacklisted` | `systems/faction_pitborn.js:2069` | — |
| `pitborn:claimExtracted` | `systems/faction_pitborn.js:1351` | — |
| `pitborn:claimFiled` | `systems/faction_pitborn.js:1100` | — |
| `pitborn:claimForeclosed` | `systems/faction_pitborn.js:1526` | — |
| `pitborn:claimJumped` | `systems/faction_pitborn.js:1338` | — |
| `pitborn:claimLapsed` | `systems/faction_pitborn.js:1184` | — |
| `pitborn:claimSold` | `systems/faction_pitborn.js:2004` | — |
| `pitborn:collectorDown` | `systems/faction_pitborn.js:2137` | — |
| `pitborn:collectorsOut` | `systems/faction_pitborn.js:1579` | — |
| `pitborn:crowdStyle` | `systems/faction_pitborn.js:764` | — |
| `pitborn:crowdTier` | `systems/faction_pitborn.js:772` | — |
| `pitborn:cullSettled` | `systems/faction_pitborn.js:802` | — |
| `pitborn:debtDueSoon` | `systems/faction_pitborn.js:1499` | — |
| `pitborn:debtEscalated` | `systems/faction_pitborn.js:1514` | — |
| `pitborn:debtPaid` | `systems/faction_pitborn.js:1480` | — |
| `pitborn:debtPosted` | `systems/faction_pitborn.js:1150` | — |
| `pitborn:debtSettled` | `systems/faction_pitborn.js:1684` | — |
| `pitborn:debtWrittenOff` | `systems/faction_pitborn.js:1704` | — |
| `pitborn:deed` | `systems/faction_pitborn.js:702` | — |
| `pitborn:dividend` | `systems/faction_pitborn.js:1782` | — |
| `pitborn:fined` | `systems/faction_pitborn.js:2047` | — |
| `pitborn:levyCollected` | `systems/faction_pitborn.js:1644` | — |
| `pitborn:marketBought` | `systems/faction_pitborn.js:1940` | — |
| `pitborn:marketDelisted` | `systems/faction_pitborn.js:1189`, `systems/faction_pitborn.js:1811`, `systems/faction_pitborn.js:1835`, `systems/faction_pitborn.js:1912`, `systems/faction_pitborn.js:1994` | — |
| `pitborn:marketListed` | `systems/faction_pitborn.js:1865`, `systems/faction_pitborn.js:1976` | — |
| `pitborn:quotaPosted` | `systems/faction_pitborn.js:1415` | — |
| `pitborn:quotaProgress` | `systems/faction_pitborn.js:1368` | — |
| `pitborn:quotaSettled` | `systems/faction_pitborn.js:1454` | — |
| `pitborn:refused` | `systems/faction_pitborn.js:725` | — |
| `pitborn:scoreboard` | `systems/faction_pitborn.js:775` | — |
| `pitborn:shareBought` | `systems/faction_pitborn.js:1750` | — |
| `pitborn:shareSold` | `systems/faction_pitborn.js:1765` | — |
| `pitborn:suspicionFiled` | `systems/faction_pitborn.js:2023` | — |
| `pitborn:suspicionWarned` | `systems/faction_pitborn.js:2042` | — |
| `pitborn:tier` | `systems/faction_pitborn.js:707` | — |
| `pitborn:yardmasterDown` | `systems/faction_pitborn.js:939` | — |
| `pitborn:yardmasterStripped` | `systems/faction_pitborn.js:934` | — |
| `planet:bandFirst` | `systems/planetRuntime.js:618` | `systems/onboarding.js:1156` |
| `planet:collector` | `systems/planetRuntime.js:833` | `audio/audioSystem.js:3111`, `render/authoredMotion.js:1221`, `systems/onboarding.js:1150` |
| `planet:harvest` | `systems/planetRuntime.js:1006` | `audio/audioSystem.js:3112` |
| `planet:harvestDenied` | `systems/planetRuntime.js:1013` | `audio/audioSystem.js:3113` |
| `planet:npcHarvest` | `systems/planetRuntime.js:969` | — |
| `planet:plungeStage` | `systems/planetRuntime.js:711`, `systems/planetRuntime.js:724` | `audio/audioSystem.js:3114` |
| `planet:recoveryBurn` | `systems/planetRuntime.js:808` | `audio/audioSystem.js:3115` |
| `planet:registered` | `systems/planetRuntime.js:324` | — |
| `planet:unregistered` | `systems/planetRuntime.js:513` | — |
| `plants:stalledStringFlash` | `systems/plants/stalledStringPlant.js:308` | — |
| `plants:wrongWayStandDown` | `systems/plants/wrongWay.js:309` | — |
| `player:death` | `systems/combat.js:793`, `systems/combat.js:956`, `systems/world.js:7636` | `audio/audioSystem.js:2969`, `render/feel.js:1702`, `render/shipMicroMotion.js:1766`, `render/vfx.js:3021`, `save/saveSystem.js:503`, `sim/killcamTape.js:476`, `systems/aftermathWrecks.js:1255`, `systems/crew.js:125`, `systems/encounterDirector.js:434`, `systems/flightV3.js:245`, `systems/input.js:1542`, `systems/lawSecurity.js:431`, `systems/lossLedger.js:466`, `systems/masslineTelemetry.js:128`, `systems/missions.js:928`, `systems/onboarding.js:762`, `systems/onboarding.js:818`, `systems/shieldPylons.js:246`, `systems/special500DeathBell.js:61`, `systems/special500ReadEverything.js:39`, `systems/surrenderRecovery.js:103`, `systems/survivalResults.js:538`, `systems/survivalRun.js:156`, `systems/survivorPod.js:735`, `systems/tetherGameplay.js:368`, `systems/world.js:783`, `ui/commandBar.js:249`, `ui/confirm.js:335`, `ui/survivalHud.js:399` |
| `player:recoveryFailed` | `systems/combat.js:1009` | `ui/screens/gameOver.js:647` |
| `player:recoveryRequested` | `ui/screens/gameOver.js:528`, `ui/screens/gameOver.js:541` | `systems/combat.js:428` |
| `player:respawn` | `systems/combat.js:1093` | `audio/audioSystem.js:2970`, `render/shipMicroMotion.js:1765`, `save/saveSystem.js:504`, `save/saveSystem.js:594`, `sim/killcamTape.js:473`, `systems/flightV3.js:246`, `systems/input.js:1543`, `systems/tetherGameplay.js:369`, `ui/commandBar.js:253`, `ui/screens/gameOver.js:639` |
| `player:scannedByPatrol` | `systems/economy.js:6088` | `render/authoredMotion.js:1200`, `render/vfx.js:3008`, `systems/lawSecurity.js:447`, `systems/missions.js:918` |
| `poi:discovered` | `data/encounters/1310-tether-memorial-line.js:217`, `systems/world.js:1178`, `systems/world.js:7229`, `systems/world.js:7327`, `systems/world.js:7947`, `systems/world.js:7977` | `audio/audioSystem.js:3149`, `systems/encounterDirector.js:407`, `systems/world.js:862` |
| `poi:identified` | `systems/world.js:7334`, `systems/world.js:7978` | `systems/encounterDirector.js:408`, `systems/missions.js:677`, `systems/world.js:863` |
| `postEndingReplay:cycleCompleted` | — | `systems/sectorSim.js:139`, `ui/screens/missionLog.js:2797` |
| `postEndingReplay:route` | `systems/postEndingReplay.js:288` | `ui/screens/missionLog.js:2796` |
| `presentation:audioCue` | `render/vfx.js:6056`, `systems/presentationAdapters.js:317`, `systems/presentationAdapters.js:699` | — |
| `presentation:cameraCue` | `systems/presentationAdapters.js:612` | — |
| `presentation:caption` | `audio/audioSystem.js:7143`, `features/breakwaterSpur/presentation.js:118`, `features/salvageTender/presentation.js:69`, `systems/asteroidSites.js:3589`, `systems/asteroidSites.js:3646`, `systems/factionPresence.js:1250`, `systems/factionPresence.js:1704`, `systems/factionPresence.js:1719`, `systems/factionPresence.js:1737`, `systems/factionPresence.js:1799`, `systems/presentationAdapters.js:799`, `systems/shipjack.js:93`, `systems/story.js:1238`, `systems/story.js:1490` | — |
| `presentation:cue` | `systems/aftermathWrecks.js:1675`, `systems/cargo.js:1248`, `systems/planetRuntime.js:735`, `systems/salvageActions.js:283`, `systems/salvageActions.js:498` | `audio/audioSystem.js:3266`, `render/vfx.js:3096`, `render/vfx.js:3097`, `render/vfx.js:3098`, `systems/presentationAdapters.js:339` |
| `presentation:cueApplied` | `systems/presentationAdapters.js:593` | — |
| `presentation:uiCue` | `systems/presentationAdapters.js:514`, `systems/presentationAdapters.js:777` | — |
| `presentation:vfxCue` | `data/encounters/1322-the-shadow-ring.js:171`, `render/vfx.js:3115`, `systems/bombs.js:1405`, `systems/fields.js:2008`, `systems/fields.js:2358`, `systems/fields.js:2971`, `systems/fields.js:3022`, `systems/hullBurst.js:239`, `systems/hullBurst.js:351`, `systems/hullBurst.js:402`, `systems/hullBurst.js:433`, `systems/hullBurst.js:619`, `systems/massSeed.js:335`, `systems/massSeed.js:451`, `systems/massSeed.js:545`, `systems/massSeed.js:589`, `systems/masslineThrow.js:730`, `systems/missions.js:1637`, `systems/missions.js:5310`, `systems/planetRuntime.js:1036`, `systems/presentationAdapters.js:661`, `systems/special500DockLedger.js:205`, `systems/special500Spectacle.js:167`, `systems/special500Spectacle.js:180`, `systems/tumbleStates.js:564`, `systems/tumbleStates.js:674`, `systems/volatileExposure.js:482`, `systems/volatileExposure.js:556`, `systems/weapons.js:2274`, `systems/weapons.js:2405`, `systems/weapons.js:2537`, `systems/weapons.js:4098` | `render/vfx.js:3101` |
| `projectile:bank` | — | `render/vfx.js:2922` |
| `projectile:hit` | `core/physics.js:1458`, `core/physics.js:1487`, `core/physics.js:1678`, `data/encounters/705-the-nest.js:399`, `systems/sectorSim.js:751` | `audio/audioSystem.js:2871`, `combat/tetherWebs.js:61`, `render/vfx.js:2921`, `systems/bombs.js:712`, `systems/combat.js:420`, `systems/gamepad.js:1097`, `systems/missions.js:872` |
| `projectile:nearMiss` | `core/physics.js:1638` | `audio/audioSystem.js:2874`, `systems/presentationOrchestrator.js:184` |
| `projectile:ricochet` | — | `render/vfx.js:2923` |
| `quality:autoEased` | `render/renderer.js:26404` | — |
| `quiet:routeSold` | `data/encounters/702-the-swap.js:52` | — |
| `quill:archiveRebound` | `systems/quill.js:777` | — |
| `quill:errandAnswered` | `systems/quill.js:766` | — |
| `quill:errandArmed` | `systems/quill.js:744` | — |
| `quill:folioBurned` | `systems/quill.js:710` | — |
| `quill:folioMinted` | `systems/quill.js:544` | — |
| `quill:folioSeized` | `systems/quill.js:865` | — |
| `quill:folioSold` | `systems/quill.js:677` | — |
| `quill:forgeryDetected` | `systems/quill.js:727` | — |
| `quill:redactorKilled` | `systems/quill.js:908` | — |
| `quill:redactorSpawned` | `systems/quill.js:799` | — |
| `quill:redactorWithdrew` | `systems/quill.js:839` | — |
| `race:abort` | — | `systems/missions.js:952` |
| `race:ended` | `systems/missions.js:5647` | — |
| `race:launchFailed` | — | `save/saveSystem.js:566` |
| `race:reset` | — | `systems/missions.js:950` |
| `race:restart` | `ui/input.js:713` | `systems/missions.js:951` |
| `race:restarted` | `systems/missions.js:3861` | — |
| `race:toggleView` | `ui/input.js:705`, `ui/input.js:1609` | — |
| `range:opened` | `ui/screens/range.js:2725` | `systems/onboarding.js:805` |
| `ravel:cast` | `systems/ravel.js:176` | — |
| `ravel:destroyed` | `systems/ravel.js:211` | — |
| `ravel:hit` | `systems/ravel.js:190` | — |
| `ravel:pacified` | `systems/ravel.js:199` | — |
| `ravel:telegraph` | `systems/ravel.js:157` | — |
| `ravel:unthreaded` | `systems/ravel.js:196` | — |
| `ravel:voice` | `systems/ravel.js:130` | — |
| `reach:trophyHung` | `data/encounters/705-the-nest.js:267` | — |
| `recovery:choose` | `ui/recoveryEncounterPrompt.js:333` | — |
| `recovery:completed` | `systems/onboarding.js:3859` | `ui/recoveryEncounterPrompt.js:492` |
| `recovery:vent` | `ui/recoveryEncounterPrompt.js:291` | — |
| `redKite:aborted` | `systems/redKite.js:177` | — |
| `redKite:course` | `ui/redKitePrompt.js:18` | — |
| `redKite:finished` | `systems/redKite.js:203` | — |
| `redKite:offer` | `systems/redKite.js:155` | `ui/redKitePrompt.js:6` |
| `redKite:start` | `ui/redKitePrompt.js:19` | — |
| `redKite:started` | `systems/redKite.js:170` | — |
| `regionalEcology:applied` | — | `ui/sectorPostcard.js:279` |
| `regionalEcology:changed` | — | `ui/sectorPostcard.js:280` |
| `rescue:beat` | `systems/onboarding.js:3828`, `systems/onboarding.js:3888` | — |
| `rescue:complete` | `systems/onboarding.js:3839` | — |
| `rescue:started` | `systems/onboarding.js:3272` | `systems/onboarding.js:763` |
| `rescuedWorker:returned` | `systems/rescuedWorkerReturn.js:489` | — |
| `research:pointsChanged` | `systems/missionObjectiveOps.js:767`, `systems/missionObjectiveOps.js:821`, `systems/missionObjectiveOps.js:855`, `systems/missionObjectiveOps.js:902`, `systems/missionStoryOps.js:2344`, `systems/missions.js:5214`, `systems/missions.js:5230` | `ui/alerts.js:571` |
| `resonance:patrolQueued` | `systems/encounterDirector.js:3644` | — |
| `resonance:scanCompleted` | `systems/scanner.js:1570` | `systems/encounterDirector.js:439` |
| `rhythm:phase` | `systems/encounterDirector.js:658` | — |
| `rigWorkshop:changed` | `features/rigWorkshop/runtime.js:346` | — |
| `rigWorkshop:delivered` | `features/rigWorkshop/jobs.js:293` | — |
| `rigWorkshop:feedback` | `features/rigWorkshop/runtime.js:351` | — |
| `rigWorkshop:prompt` | `features/rigWorkshop/runtime.js:364` | — |
| `rigWorkshop:promptClosed` | `features/rigWorkshop/runtime.js:369` | — |
| `rookWreck:appraised` | `systems/rookBooth.js:681` | — |
| `rookWreck:countered` | `systems/rookBooth.js:522` | — |
| `rookWreck:delivered` | `systems/rookBooth.js:586` | `systems/missions.js:738` |
| `rookWreck:disputeFiled` | `systems/rookBooth.js:647` | — |
| `rookWreck:offerLapsed` | `systems/rookBooth.js:490` | — |
| `rookWreck:padRefused` | `systems/rookBooth.js:663` | — |
| `rubric:destroyed` | `systems/rubric.js:369` | — |
| `rubric:last` | `systems/rubric.js:524` | — |
| `rubric:marked` | `systems/rubric.js:453` | — |
| `rubric:voice` | `systems/rubric.js:269` | — |
| `ruckus:pulse` | `systems/ruckus.js:213` | — |
| `ruckus:retrieved` | `systems/ruckus.js:198` | — |
| `ruckus:state` | `systems/ruckus.js:147` | — |
| `ruckus:voice` | `systems/ruckus.js:141` | — |
| `rumor:ghostConvoy` | `systems/lossLedger.js:377` | `ui/station/barContacts.js:182` |
| `run:arenaIntroComplete` | — | `systems/survivalRun.js:142` |
| `run:awardRequested` | `systems/swarmBrood.js:4132`, `systems/swarmEvents.js:217`, `systems/swarmEvents.js:347`, `ui/sandbox/sandboxSetup.js:1426`, `ui/sandbox/sandboxSetup.js:1441` | `systems/runSession.js:150`, `systems/swarmDrops.js:102` |
| `run:awarded` | — | `ui/survivalHud.js:368` |
| `run:beginRequested` | `ui/sandbox/sandboxSetup.js:1338`, `ui/sandbox/sandboxSetup.js:1380` | `systems/runSession.js:146` |
| `run:circuitChoiceApplied` | — | `systems/survivalDraft.js:199` |
| `run:circuitChoiceRequested` | — | `systems/survivalRun.js:153` |
| `run:draftLockRequested` | — | `systems/survivalDraft.js:207` |
| `run:draftPickRequested` | `ui/screens/crucibleDraft.js:1187`, `ui/screens/crucibleDraft.js:1192`, `ui/screens/crucibleDraft.js:1438` | `systems/survivalDraft.js:196` |
| `run:draftRerollRequested` | — | `systems/survivalDraft.js:208` |
| `run:draftResolved` | — | `systems/survivalRun.js:145`, `ui/loadingPresenter.js:677` |
| `run:endRequested` | `save/saveSystem.js:7191` | `systems/runSession.js:148` |
| `run:ended` | — | `audio/audioSystem.js:3086`, `render/feel.js:1561`, `systems/fields.js:493`, `systems/mines.js:123`, `systems/survivalAnnounce.js:455`, `systems/survivalArena.js:1422`, `systems/survivalDraft.js:223`, `systems/survivalResults.js:575`, `systems/survivalRun.js:139`, `systems/survivalWave.js:233`, `systems/swarmArena.js:915`, `systems/swarmChain.js:167`, `systems/swarmDrops.js:106`, `systems/swarmElites.js:191`, `systems/swarmEvents.js:115`, `systems/swarmFortify.js:179`, `systems/swarmJuice.js:170`, `systems/swarmLegendaries.js:123`, `systems/swarmSupply.js:114`, `ui/contextWheel.js:357`, `ui/loadingPresenter.js:686`, `ui/swarmJuiceHud.js:153` |
| `run:extractionRequested` | `systems/survivalExtraction.js:30` | `systems/survivalRun.js:148` |
| `run:levelUp` | — | `systems/survivalAnnounce.js:453`, `ui/survivalHud.js:369` |
| `run:loadoutReady` | `ui/sandbox/sandboxSetup.js:1473` | `systems/ships.js:2163`, `systems/survivalRun.js:140`, `systems/swarmSupply.js:107`, `systems/world.js:858` |
| `run:modifierChosen` | — | `systems/survivalRun.js:146` |
| `run:modifierRecordRequested` | `ui/sandbox/sandboxSetup.js:1118` | `systems/runSession.js:152` |
| `run:modifierRecorded` | — | `systems/survivalArena.js:1380` |
| `run:openingLessonReleased` | — | `systems/survivalAnnounce.js:451`, `systems/survivalArena.js:1417`, `systems/swarmArena.js:911` |
| `run:openingPrepareRequested` | `ui/sandbox/sandboxSetup.js:1474` | `systems/survivalRun.js:141` |
| `run:partialBankRequested` | `systems/survivalExtraction.js:71` | `systems/survivalRun.js:149` |
| `run:pilotCardRequested` | — | `systems/runSession.js:155` |
| `run:pilotRerollRequested` | — | `systems/runSession.js:156` |
| `run:refitChanged` | — | `ui/screens/crucibleDraft.js:2268` |
| `run:refitCloseRequested` | `ui/screens/crucibleDraft.js:2362`, `ui/screens/crucibleDraft.js:2379` | `systems/survivalDraft.js:200` |
| `run:refitClosed` | — | `systems/survivalRun.js:147` |
| `run:refitFitRequested` | — | `systems/survivalDraft.js:201` |
| `run:refitSellRequested` | — | `systems/survivalDraft.js:206` |
| `run:refitStripRequested` | — | `systems/survivalDraft.js:202` |
| `run:resultsReady` | — | `systems/achievements.js:1206`, `ui/uiRoot.js:1789` |
| `run:retireRequested` | — | `systems/runSession.js:149` |
| `run:roleProblemStamped` | `systems/survivalSwarm.js:258` | — |
| `run:spendRejected` | — | `systems/survivalDraft.js:212`, `systems/swarmFloor.js:904` |
| `run:spendRequested` | `systems/swarmCourseTwists.js:223` | `systems/runSession.js:151` |
| `run:spent` | — | `systems/survivalDraft.js:211`, `systems/swarmFloor.js:903` |
| `run:started` | — | `audio/audioSystem.js:3085`, `render/feel.js:1557`, `save/saveSystem.js:520`, `sim/killcamTape.js:469`, `systems/combatOutcome.js:291`, `systems/survivalAnnounce.js:435`, `systems/survivalResults.js:520`, `systems/survivalRun.js:137`, `systems/swarmDrops.js:109`, `systems/swarmElites.js:190`, `systems/swarmEvents.js:117`, `systems/swarmFortify.js:177`, `systems/swarmJuice.js:169`, `systems/swarmLegendaries.js:122`, `systems/travelLanes.js:555`, `ui/contextWheel.js:356`, `ui/survivalHud.js:370`, `ui/swarmJuiceHud.js:152`, `ui/uiRoot.js:1798` |
| `run:swarmDeepContinued` | — | `systems/survivalResults.js:576` |
| `run:swarmDeepRequested` | `ui/screens/crucible.js:4040` | `systems/survivalRun.js:150` |
| `run:threatRequested` | — | `systems/runSession.js:157` |
| `run:transitionRequested` | `systems/survivalRun.js:1128` | `systems/runSession.js:147` |
| `run:transitioned` | — | `systems/survivalAnnounce.js:454`, `systems/survivalDraft.js:195`, `systems/survivalResults.js:574`, `systems/survivalRun.js:138`, `systems/survivalWave.js:232`, `systems/swarmSupply.js:108` |
| `run:waveCleared` | — | `systems/fields.js:492`, `systems/mines.js:122`, `systems/survivalAnnounce.js:452`, `systems/survivalArena.js:1416`, `systems/survivalResults.js:528`, `systems/swarmEvents.js:114`, `systems/swarmLegendaries.js:121` |
| `run:waveIntroComplete` | — | `systems/survivalRun.js:143` |
| `run:waveMaterialized` | — | `systems/survivalAnnounce.js:438` |
| `run:wavePlanFailed` | — | `systems/survivalResults.js:539` |
| `run:wavePlanned` | — | `systems/survivalAnnounce.js:436`, `systems/survivalArena.js:1381`, `systems/survivalWave.js:230`, `systems/swarmArena.js:903`, `systems/swarmFortify.js:178`, `systems/swarmJuice.js:146`, `systems/tetherGameplay.js:378`, `ui/survivalHud.js:386` |
| `run:waveProgress` | — | `ui/survivalHud.js:387` |
| `run:waveStarted` | — | `systems/survivalAnnounce.js:437`, `systems/survivalResults.js:525`, `systems/survivalWave.js:231`, `systems/swarmArena.js:904`, `systems/swarmEvents.js:113`, `systems/swarmJuice.js:147`, `ui/swarmJuiceHud.js:151` |
| `ruud:cut` | `systems/ruud.js:462` | — |
| `ruud:spared` | `systems/ruud.js:435` | — |
| `ruud:stamp` | `systems/ruud.js:379` | — |
| `ruud:voice` | `systems/ruud.js:326`, `systems/ruud.js:378` | — |
| `sable:demonstrated` | `ui/station/screens/shipworks.js:5591` | — |
| `salvage:actionRead` | `systems/salvageActions.js:229` | — |
| `salvage:bayCashedIn` | `systems/cargo.js:1290` | `systems/onboarding.js:922` |
| `salvage:changed` | `systems/cargo.js:567`, `systems/cargo.js:1293` | `systems/onboarding.js:918` |
| `salvage:claimJumped` | `systems/mining.js:2427` | `systems/missions.js:973` |
| `salvage:communicatorFound` | `systems/salvage.js:1258` | `systems/encounterDirector.js:409`, `systems/story.js:301`, `ui/wreckChoicePrompt.js:50` |
| `salvage:completed` | `systems/gravedigger.js:1177`, `systems/mining.js:2241`, `systems/mining.js:2292`, `systems/rookBooth.js:600` | `render/vfx.js:3026`, `systems/aftermathWrecks.js:1276`, `systems/lawSecurity.js:439`, `systems/missions.js:795`, `systems/missions.js:974`, `systems/story.js:283`, `systems/world.js:875` |
| `salvage:cookerFlight` | `systems/salvageActions.js:493` | — |
| `salvage:coreDetonated` | `systems/salvageActions.js:640` | — |
| `salvage:coreEjected` | `systems/salvageActions.js:280` | `render/authoredMotion.js:1207` |
| `salvage:cutComplete` | `systems/mining.js:784` | `audio/audioSystem.js:3089`, `render/authoredMotion.js:1176`, `render/vfx.js:3025` |
| `salvage:fieldVulture` | `systems/e1EncounterRuntime.js:454` | `systems/salvage.js:177` |
| `salvage:npcExtraction` | `systems/trafficRoleOps.js:2422` | `render/authoredMotion.js:1175` |
| `salvage:npcUnload` | `features/salvageOutfits/physical.js:487`, `systems/trafficCausalChainOps.js:2522` | `systems/economy.js:1896` |
| `salvage:placed` | `systems/salvage.js:576` | `systems/lossInvestigation.js:126`, `systems/npcJobsRuntime.js:1219`, `systems/survivorPod.js:710` |
| `salvage:reactorBurst` | `systems/salvageActions.js:746` | — |
| `salvage:reactorTowedClear` | `systems/salvageActions.js:350` | `systems/salvage.js:173` |
| `salvage:reactorVented` | `systems/salvageActions.js:244` | — |
| `salvage:sortDelivered` | `systems/salvage.js:1076` | — |
| `salvage:sortImpact` | `systems/salvage.js:1010` | — |
| `salvage:sortLost` | `systems/salvage.js:1106` | — |
| `salvage:sortSeparated` | `systems/salvage.js:974` | — |
| `salvage:ventReactor` | — | `systems/salvageActions.js:141` |
| `salvageOutfits:agreement` | `features/salvageOutfits/index.js:504`, `features/salvageOutfits/index.js:541` | — |
| `salvageOutfits:choose` | `features/salvageOutfits/presentation.js:65` | — |
| `salvageOutfits:completed` | `features/salvageOutfits/index.js:216` | — |
| `salvageOutfits:delivered` | `features/salvageOutfits/index.js:390` | — |
| `salvageOutfits:mistake` | `features/salvageOutfits/index.js:319` | — |
| `salvageOutfits:offer` | `features/salvageOutfits/index.js:419`, `features/salvageOutfits/index.js:454`, `features/salvageOutfits/index.js:467` | — |
| `salvageOutfits:offerClosed` | `features/salvageOutfits/index.js:460` | — |
| `salvageOutfits:radio` | `features/salvageOutfits/index.js:70` | — |
| `salvageOutfits:started` | `features/salvageOutfits/index.js:125` | — |
| `salvageTender:action` | `features/salvageTender/prompts.js:32` | — |
| `salvageTender:close` | `features/salvageTender/runtime.js:100` | — |
| `salvageTender:cue` | `features/salvageTender/runtime.js:96` | `features/salvageTender/presentation.js:49` |
| `salvageTender:disabled` | `features/salvageTender/physical.js:638` | — |
| `salvageTender:discovered` | `features/salvageTender/runtime.js:115` | — |
| `salvageTender:offer` | `features/salvageTender/runtime.js:363` | — |
| `salvageTender:podPatched` | `features/salvageTender/physical.js:464` | — |
| `salvageTender:rackReleased` | `features/salvageTender/physical.js:598` | — |
| `salvageTender:reset` | `features/salvageTender/runtime.js:562`, `features/salvageTender/runtime.js:568` | — |
| `salvageWatch:repairWork` | `data/encounters/362-the-salvage-watch.js:471` | — |
| `save:backup` | `save/saveSystem.js:2744` | `ui/screens/saveLoad.js:1197` |
| `save:completed` | `save/saveSystem.js:2815` | `ui/screens/saveLoad.js:1187`, `ui/toasts.js:56`, `ui/uiRoot.js:612` |
| `save:dirty` | `features/industrialDisasters/runtime.js:465`, `features/shipbreakingYard/runtime.js:124`, `features/shipbreakingYard/runtime.js:283`, `features/shipbreakingYard/runtime.js:444`, `shipjack/fleetOperations.js:72`, `shipjack/fleetOperations.js:152`, `shipjack/fleetOperations.js:170`, `systems/ruckus.js:91`, `systems/shipjack.js:82` | `save/saveSystem.js:480` |
| `save:durabilitySettled` | — | `runtime/laneSystemFacades.js:40` |
| `save:envelopePrepared` | `save/saveSystem.js:5921`, `save/saveSystem.js:5990`, `save/saveSystem.js:6002` | `main.js:300`, `ui/loadingPresenter.js:744` |
| `save:envelopeSpecPrepared` | `save/saveSystem.js:3376` | `main.js:299`, `ui/screens/saveLoad.js:1211` |
| `save:error` | `main.js:317`, `main.js:1277`, `main.js:1341`, `save/saveSystem.js:1831`, `save/saveSystem.js:2907`, `save/saveSystem.js:5711`, `save/saveSystem.js:5732`, `save/saveSystem.js:5781`, `save/saveSystem.js:5811`, `save/saveSystem.js:5850`, `save/saveSystem.js:5980`, `save/saveSystem.js:6031`, `save/saveSystem.js:6233`, `save/saveSystem.js:6256`, `save/saveSystem.js:6274`, `save/saveSystem.js:6481`, `save/saveSystem.js:6495`, `save/saveSystem.js:6603`, `save/saveSystem.js:6621`, `save/saveSystem.js:6659`, `save/saveSystem.js:6702`, `save/saveSystem.js:6737`, `save/saveSystem.js:6866`, `save/saveSystem.js:6944`, `save/saveSystem.js:6949`, `save/saveSystem.js:7168`, `save/saveSystem.js:7875`, `save/saveSystem.js:7887`, `save/saveSystem.js:7954`, `save/saveSystem.js:8862`, `save/saveSystem.js:8874`, `save/saveSystem.js:8880`, `save/saveSystem.js:8901`, `save/saveSystem.js:8906`, `save/saveSystem.js:8924`, `save/saveSystem.js:9028`, `save/saveSystem.js:9056`, `ui/screens/saveLoad.js:1791` | `systems/aftermathWrecks.js:1291`, `systems/asteroidSites.js:856`, `systems/automation.js:650`, `systems/encounterDirector.js:370`, `systems/faction_understory.js:748`, `systems/special500Confessional.js:141`, `systems/survivorPod.js:733`, `systems/traffic.js:1933`, `ui/loadingPresenter.js:718`, `ui/screenManager.js:752`, `ui/screens/mainMenu.js:696`, `ui/screens/mainMenu.js:1269`, `ui/screens/saveLoad.js:1173`, `ui/screens/saveLoad.js:1198`, `ui/uiRoot.js:638` |
| `save:exportRecovery` | `save/saveSystem.js:8816`, `save/saveSystem.js:8843` | `ui/toasts.js:929` |
| `save:loadSpeculationTarget` | `ui/screens/gameOver.js:920`, `ui/screens/pause.js:1434`, `ui/screens/saveLoad.js:1286`, `ui/screens/saveLoad.js:1426` | `save/saveSystem.js:413` |
| `save:loaded` | `save/saveSystem.js:7767` | `audio/audioSystem.js:3525`, `audio/bombAudio.js:460`, `audio/fieldAudio.js:327`, `careers/origins/haulerOriginSystem.js:65`, `combat/kernel.js:205`, `combat/tetherWebs.js:70`, `core/coreSystem.js:560`, `core/physics.js:218`, `features/breakwaterSpur/runtime.js:84`, `main.js:401`, `main.js:409`, `render/feel.js:1554`, `render/shipMicroMotion.js:1748`, `render/vfx.js:3004`, `render/vfx.js:3015`, `save/saveSystem.js:516`, `save/saveSystem.js:554`, `sim/killcamTape.js:472`, `systems/aftermathWrecks.js:1290`, `systems/aiEncounter.js:141`, `systems/asteroidFormations.js:127`, `systems/asteroidSites.js:680`, `systems/asteroidSites.js:846`, `systems/autoTargetAssist.js:158`, `systems/automation.js:637`, `systems/barkDirector.js:878`, `systems/beacons.js:54`, `systems/bombs.js:711`, `systems/collisionConsequences.js:135`, `systems/combat.js:470`, `systems/combatOutcome.js:268`, `systems/contractClauses.js:394`, `systems/countermeasures.js:226`, `systems/difficultyDirector.js:167`, `systems/dockingCorridor.js:85`, `systems/economy.js:1961`, `systems/economyContracts.js:284`, `systems/encounterDirector.js:369`, `systems/environmentalMachinery.js:289`, `systems/factionPresence.js:517`, `systems/factionPresence.js:528`, `systems/faction_archive.js:591`, `systems/faction_frontier.js:498`, `systems/faction_helix.js:508`, `systems/faction_meridian.js:370`, `systems/faction_understory.js:738`, `systems/faction_vael.js:441`, `systems/fields.js:494`, `systems/flight.js:79`, `systems/flightV3.js:213`, `systems/gateControlDirector.js:79`, `systems/heat.js:412`, `systems/heistFacilities.js:337`, `systems/impoundGrudge.js:398`, `systems/impoundLot.js:1097`, `systems/impulseCharges.js:242`, `systems/lawSecurity.js:428`, `systems/lineProgression.js:51`, `systems/longBerth.js:68`, `systems/lossInvestigation.js:132`, `systems/massSeed.js:145`, `systems/masslineSnares.js:139`, `systems/masslineTelemetry.js:123`, `systems/mines.js:121`, `systems/mining.js:322`, `systems/missions.js:625`, `systems/npcJobsRuntime.js:1188`, `systems/npcJobsRuntime.js:1196`, `systems/npcJobsRuntime.js:1255`, `systems/npcJobsRuntime.js:1258`, `systems/onboarding.js:693`, `systems/pirateDisguise.js:441`, `systems/planetRuntime.js:215`, `systems/plants/busDoesntMove.js:150`, `systems/plants/deadLane.js:108`, `systems/plants/doorstop.js:127`, `systems/plants/farBerth.js:187`, `systems/plants/mooringAlarms.js:107`, `systems/plants/oneYank.js:130`, `systems/plants/orphanWreck.js:105`, `systems/plants/otherSide.js:141`, `systems/plants/snaggedPod.js:116`, `systems/plants/someonesCourse.js:128`, `systems/plants/sweepingLine.js:95`, `systems/plants/theOtherName.js:94`, `systems/plants/twoNames.js:102`, `systems/plants/yourWake.js:105`, `systems/presentationAdapters.js:346`, `systems/presentationOrchestrator.js:297`, `systems/routeFollower.js:438`, `systems/rubberneckers.js:99`, `systems/runSession.js:162`, `systems/salvageActions.js:145`, `systems/scanner.js:1138`, `systems/scramblePlant.js:124`, `systems/sectorSim.js:133`, `systems/shieldPylons.js:245`, `systems/ships.js:1984`, `systems/stationContactLoadBoundary.js:91`, `systems/stationSideEventDirector.js:106`, `systems/story.js:169`, `systems/survivalArena.js:1443`, `systems/survivalArena.js:1445`, `systems/survivorPod.js:731`, `systems/swarmDrops.js:105`, `systems/swarmFortify.js:185`, `systems/swarmLegendaries.js:126`, `systems/tetherGameplay.js:365`, `systems/titles.js:602`, `systems/traffic.js:1837`, `systems/traffic.js:1890`, `systems/traffic.js:1951`, `systems/traffic.js:1977`, `systems/traffic.js:1987`, `systems/traffic.js:1990`, `systems/travelLanes.js:553`, `systems/tumbleStates.js:144`, `systems/uniqueLootAbilities.js:163`, `systems/wingmen.js:174`, `systems/world.js:843`, `ui/aftermathChoicePrompt.js:116`, `ui/alerts.js:566`, `ui/automationPayoff.js:100`, `ui/bandHud.js:159`, `ui/capitalBossOverlayMount.js:717`, `ui/cargoConscience.js:147`, `ui/hudLayout.js:122`, `ui/loadingPresenter.js:752`, `ui/moralTrapPrompt.js:43`, `ui/screens/mainMenu.js:700`, `ui/uiRoot.js:619`, `ui/uiRoot.js:1814`, `ui/voiceArbiter.js:539`, `ui/wreckChoicePrompt.js:67` |
| `save:recovered` | `save/saveSystem.js:5657` | `ui/screens/saveLoad.js:1196`, `ui/uiRoot.js:631` |
| `save:restoreCommitted` | `save/saveSystem.js:7856` | — |
| `save:restoring` | `save/saveSystem.js:7196` | `core/coreSystem.js:557`, `features/breakwaterSpur/presentation.js:33`, `features/breakwaterSpur/presentation.js:249`, `features/breakwaterSpur/runtime.js:83`, `main.js:402`, `render/feel.js:1553`, `render/vfx.js:3003`, `render/vfx.js:3014`, `save/saveSystem.js:562`, `systems/aftermathWrecks.js:1289`, `systems/asteroidSites.js:837`, `systems/autoTargetAssist.js:155`, `systems/automation.js:630`, `systems/cloak.js:80`, `systems/encounterDirector.js:361`, `systems/environmentalMachinery.js:288`, `systems/faction_understory.js:735`, `systems/lawSecurity.js:427`, `systems/masslineTelemetry.js:124`, `systems/missions.js:649`, `systems/missions.js:954`, `systems/npcJobsRuntime.js:1189`, `systems/runSession.js:161`, `systems/salvage.js:167`, `systems/scanner.js:1137`, `systems/spawnBudget.js:54`, `systems/special500Spectacle.js:205`, `systems/stationContactLoadBoundary.js:90`, `systems/stationServices.js:332`, `systems/surrenderRecovery.js:104`, `systems/survivalArena.js:1444`, `systems/survivorPod.js:732`, `systems/swarmFortify.js:184`, `systems/swarmLegendaries.js:125`, `systems/traffic.js:1921`, `systems/world.js:828`, `ui/loadingPresenter.js:749`, `ui/uiRoot.js:1813` |
| `save:slotsValidated` | `save/saveSystem.js:3284` | `ui/screens/saveLoad.js:1186` |
| `save:started` | `save/saveSystem.js:2055`, `save/saveSystem.js:2160`, `save/saveSystem.js:4149` | `systems/drill.js:820`, `systems/encounterDirector.js:360`, `systems/encounterDirector.js:368`, `ui/screenManager.js:764` |
| `scan:capabilityVerdicts` | `systems/scanReveal.js:136` | `ui/signalInvestigationPrompt.js:265` |
| `scan:completed` | `balance/careerCohorts.js:523`, `balance/prospectorPublicRoute.js:981`, `systems/scanner.js:1379`, `systems/world.js:7233` | `careers/origins/prospectorOrigin.js:633`, `features/breakwaterSpur/runtime.js:70`, `systems/aftermathWrecks.js:1253`, `systems/asteroidFormations.js:153`, `systems/heistFacilities.js:332`, `systems/missions.js:808`, `systems/onboarding.js:743`, `systems/presentationOrchestrator.js:201`, `systems/salvage.js:164`, `systems/salvageActions.js:140`, `systems/story.js:287`, `systems/story.js:288`, `systems/world.js:908` |
| `scan:debrisCache` | `systems/mining.js:2328`, `systems/scanReveal.js:275` | `systems/presentationOrchestrator.js:211` |
| `scan:pulse` | `systems/scanner.js:1284` | `render/authoredMotion.js:1151`, `render/shipMicroMotion.js:1775`, `systems/aftermathWrecks.js:1251`, `systems/asteroidSites.js:681`, `systems/buildIdentity.js:305`, `systems/cloak.js:97`, `systems/encounterDirector.js:388`, `systems/pirateDisguise.js:435`, `systems/presentationOrchestrator.js:200`, `systems/scanReveal.js:66`, `systems/world.js:909` |
| `scan:shipRevealed` | `systems/scanReveal.js:96` | `audio/audioSystem.js:2852`, `systems/buildIdentity.js:304` |
| `scan:weakPoint` | `systems/scanner.js:1368` | — |
| `scan:wreckInvestigated` | `systems/scanReveal.js:178` | `audio/audioSystem.js:3056` |
| `scan:wreckResolved` | `systems/scanner.js:1323` | `render/vfx.js:3083`, `systems/aftermathWrecks.js:1252`, `systems/lawSecurity.js:438` |
| `scan:wreckRevealed` | `systems/scanReveal.js:169` | `audio/audioSystem.js:2853`, `systems/presentationOrchestrator.js:210` |
| `scanner:ghostEscaped` | `systems/scanner.js:1225` | `render/vfx.js:3089`, `systems/presentationOrchestrator.js:207` |
| `scanner:ghostRevealed` | `systems/scanner.js:1342` | `render/vfx.js:3088` |
| `scenario:actorBindings` | `systems/scenarioRuntime.js:143` | — |
| `scenario:beatEntered` | `systems/scenarioRuntime.js:159` | `systems/presentationOrchestrator.js:100` |
| `scenario:branchResolved` | `systems/scenarioRuntime.js:581` | `systems/presentationOrchestrator.js:294` |
| `scenario:dialogueLine` | `systems/scenarioRuntime.js:369` | — |
| `scenario:factChanged` | `systems/scenarioRuntime.js:556` | — |
| `scenario:factsInitialized` | `systems/scenarioRuntime.js:138` | — |
| `scenario:loaded` | `systems/scenarioRuntime.js:128` | — |
| `scenario:safeOpeningDemand` | `systems/scenarioRuntime.js:193` | — |
| `scenario:scavengerResponse` | `ui/comms.js:858`, `ui/comms.js:859` | `systems/scenarioRuntime.js:31` |
| `sector:discovered` | `systems/world.js:1379` | `systems/presentationOrchestrator.js:197` |
| `sector:enter` | `balance/hunterPublicRoute.js:177`, `systems/world.js:1435` | `audio/audioSystem.js:3227`, `audio/bombAudio.js:457`, `audio/fieldAudio.js:324`, `data/hazardLanguage.js:173`, `features/breakwaterSpur/runtime.js:82`, `render/shipMicroMotion.js:1747`, `render/vfx.js:2999`, `render/vfx.js:3010`, `render/vfx.js:3035`, `save/saveSystem.js:577`, `systems/achievements.js:1192`, `systems/aftermathWrecks.js:1265`, `systems/aiEncounter.js:142`, `systems/asteroidFormations.js:126`, `systems/asteroidSites.js:802`, `systems/automation.js:676`, `systems/bombs.js:703`, `systems/claims.js:351`, `systems/claims.js:353`, `systems/combatOutcome.js:285`, `systems/difficultyDirector.js:170`, `systems/dockingCorridor.js:83`, `systems/economy.js:1920`, `systems/encounterDirector.js:355`, `systems/factionPresence.js:508`, `systems/faction_archive.js:590`, `systems/faction_frontier.js:507`, `systems/faction_understory.js:724`, `systems/fields.js:490`, `systems/heistFacilities.js:304`, `systems/intervention.js:80`, `systems/lossInvestigation.js:127`, `systems/massSeed.js:143`, `systems/masslineSnares.js:135`, `systems/mines.js:119`, `systems/mining.js:321`, `systems/missions.js:948`, `systems/moistureLoss.js:80`, `systems/moralTrap.js:187`, `systems/npcJobsRuntime.js:1177`, `systems/onboarding.js:948`, `systems/plants/deadLane.js:106`, `systems/plants/orphanWreck.js:100`, `systems/plants/someonesCourse.js:126`, `systems/presentationOrchestrator.js:247`, `systems/routeFollower.js:429`, `systems/salvage.js:138`, `systems/salvageActions.js:148`, `systems/scanner.js:1139`, `systems/sectorSim.js:130`, `systems/shieldPylons.js:243`, `systems/story.js:237`, `systems/story.js:286`, `systems/survivalArena.js:1441`, `systems/survivorPod.js:713`, `systems/swarmLegendaries.js:127`, `systems/tetherGameplay.js:372`, `systems/traffic.js:1835`, `systems/travelLanes.js:554`, `systems/wingmen.js:148`, `ui/causeLedger.js:234`, `ui/commandBar.js:259`, `ui/loadingPresenter.js:760`, `ui/moralTrapPrompt.js:41`, `ui/priceForecast.js:85`, `ui/prompts/bulkHaulTag.js:149`, `ui/sectorArrivalPlate.js:72`, `ui/sectorPostcard.js:272`, `ui/securityReadout.js:157`, `ui/watchlistHud.js:91`, `ui/wreckChoicePrompt.js:65` |
| `sector:exit` | `systems/world.js:1275` | `audio/bombAudio.js:456`, `audio/fieldAudio.js:323`, `core/physics.js:220`, `features/breakwaterSpur/presentation.js:34`, `features/breakwaterSpur/presentation.js:250`, `features/breakwaterSpur/runtime.js:81`, `render/vfx.js:3000`, `render/vfx.js:3011`, `systems/achievements.js:1198`, `systems/aftermathWrecks.js:1275`, `systems/asteroidSites.js:827`, `systems/automation.js:664`, `systems/bombs.js:702`, `systems/dockingCorridor.js:82`, `systems/encounterDirector.js:357`, `systems/environmentalMachinery.js:286`, `systems/factionPresence.js:513`, `systems/factionPresence.js:516`, `systems/fields.js:489`, `systems/gateControlDirector.js:78`, `systems/heistFacilities.js:323`, `systems/impulseCharges.js:243`, `systems/lawSecurity.js:426`, `systems/massSeed.js:142`, `systems/masslineSnares.js:133`, `systems/masslineTelemetry.js:127`, `systems/mines.js:118`, `systems/mining.js:311`, `systems/missions.js:949`, `systems/npcJobsRuntime.js:1176`, `systems/planetRuntime.js:216`, `systems/plants/busDoesntMove.js:149`, `systems/plants/deadLane.js:107`, `systems/plants/doorstop.js:126`, `systems/plants/farBerth.js:186`, `systems/plants/mooringAlarms.js:106`, `systems/plants/oneYank.js:129`, `systems/plants/orphanWreck.js:101`, `systems/plants/otherSide.js:140`, `systems/plants/snaggedPod.js:115`, `systems/plants/someonesCourse.js:127`, `systems/plants/sweepingLine.js:94`, `systems/plants/theOtherName.js:93`, `systems/plants/twoNames.js:101`, `systems/plants/witness.js:94`, `systems/plants/yourWake.js:104`, `systems/reactiveMatter.js:536`, `systems/rubberneckers.js:98`, `systems/scramblePlant.js:123`, `systems/sectorSim.js:129`, `systems/shieldPylons.js:242`, `systems/spawnBudget.js:50`, `systems/stationServices.js:331`, `systems/stationSideEventDirector.js:105`, `systems/surrenderRecovery.js:102`, `systems/survivalArena.js:1442`, `systems/survivorPod.js:739`, `systems/swarmLegendaries.js:128`, `systems/tetherGameplay.js:371`, `systems/traffic.js:1860`, `systems/wingmen.js:160`, `ui/aftermathChoicePrompt.js:116`, `ui/impoundPayPrompt.js:72`, `ui/impoundPayPrompt.js:77`, `ui/impoundPayPrompt.js:82`, `ui/impoundPayPrompt.js:88`, `ui/promptDeck.js:941`, `ui/voiceArbiter.js:540`, `ui/wreckChoicePrompt.js:60` |
| `sector:membershipCandidate` | `systems/world.js:2943` | — |
| `sector:physicalLaw` | `systems/environmentalMachinery.js:854` | — |
| `sectorWonder:secured` | — | `systems/environmentalMachinery.js:274` |
| `sectorsim:embodiment` | `systems/sectorSim.js:1026` | `systems/world.js:891` |
| `sectorsim:fieldAdvanced` | `systems/sectorSim.js:389` | `ui/screens/starmap.js:936` |
| `sectorsim:impulse` | `systems/aftermathWrecks.js:2554`, `systems/claims.js:1852`, `systems/encounterDirector.js:2928`, `systems/masslineImpacts.js:330`, `systems/mining.js:3043`, `systems/trafficRoleOps.js:1810`, `systems/worldPressure.js:192`, `systems/worldPressure.js:276`, `world/motionFossil.js:187` | `systems/sectorSim.js:138`, `systems/world.js:907` |
| `sectorsim:intel` | `systems/sectorSim.js:1080` | `systems/world.js:896` |
| `sectorsim:offlineSummary` | `systems/sectorSim.js:856` | `systems/economy.js:1975` |
| `sectorsim:reconcile` | `systems/sectorSim.js:809` | `systems/world.js:897` |
| `sectorsim:tick` | `systems/sectorSim.js:333` | — |
| `sectorsim:transitOutcome` | `systems/sectorSim.js:762` | `ui/screens/starmap.js:937` |
| `sensorGhost:swarm` | `systems/e1EncounterRuntime.js:656` | `systems/scanner.js:1144` |
| `sensors:playerLit` | `systems/massSignature.js:508` | — |
| `sensors:playerSignature` | `systems/massSignature.js:444` | — |
| `sensors:playerUnlit` | `systems/massSignature.js:489` | — |
| `sensors:quietCoast` | `systems/massSignature.js:420`, `systems/massSignature.js:426` | — |
| `sensors:signatureLost` | `systems/massSignature.js:318`, `systems/massSignature.js:330` | — |
| `sensors:signatureReport` | `systems/massSignature.js:616` | — |
| `sensors:signatureResolved` | `systems/massSignature.js:312` | — |
| `service:aborted` | `systems/stationServices.js:424` | `audio/audioSystem.js:3140`, `render/authoredMotion.js:1170`, `systems/economy.js:1926` |
| `service:completed` | `features/salvageTender/services.js:193`, `systems/blindWelderRuntime.js:142`, `systems/economy.js:5399`, `systems/economy.js:5623`, `systems/economy.js:5674`, `systems/economy.js:5706`, `systems/economy.js:5761`, `systems/economy.js:5802`, `systems/economy.js:5834`, `systems/economy.js:5872`, `systems/stationServices.js:795`, `systems/stationServices.js:814` | `audio/audioSystem.js:3141`, `render/authoredMotion.js:1169`, `render/authoredMotion.js:1173`, `systems/factionPresence.js:526`, `systems/ships.js:2116`, `systems/swarmJuice.js:167` |
| `service:decantRequest` | `ui/station/stationApp.js:1209` | `systems/stationServices.js:345` |
| `service:decanted` | `systems/stationServices.js:594` | `audio/audioSystem.js:3142` |
| `service:progress` | `systems/stationServices.js:713` | — |
| `service:queued` | `systems/stationServices.js:549` | `audio/audioSystem.js:3135` |
| `service:started` | `systems/stationServices.js:697` | `audio/audioSystem.js:3139`, `render/authoredMotion.js:1168` |
| `setPiece:staged` | `render/trailerStaging.js:14` | — |
| `settings:changed` | `render/renderer.js:11679`, `render/slowFrameOffer.js:165`, `save/saveSystem.js:7897`, `save/saveSystem.js:7899`, `systems/legacyTouch.js:707`, `ui/screens/mainMenu.js:107`, `ui/screens/motionAsk.js:108`, `ui/screens/pause.js:736`, `ui/screens/pause.js:744`, `ui/screens/pause.js:860`, `ui/screens/pause.js:900`, `ui/screens/raceBoard.js:104`, `ui/screens/settings.js:754`, `ui/screens/settings.js:1438`, `ui/screens/settings.js:1499`, `ui/screens/settings.js:1621` | `audio/audioSystem.js:3457`, `main.js:400`, `render/vfx.js:3017`, `save/saveSystem.js:474`, `systems/missions.js:955`, `systems/survivalResults.js:527`, `ui/uiRoot.js:1068` |
| `settings:restored` | `save/saveSystem.js:8484` | — |
| `shieldPylon:active` | `systems/shieldPylons.js:487` | — |
| `shieldPylon:contact` | `systems/shieldPylons.js:459` | — |
| `shieldPylon:denied` | `systems/shieldPylons.js:375` | — |
| `shieldPylon:intercepted` | `core/physics.js:1433` | — |
| `shieldPylon:linking` | `systems/shieldPylons.js:362` | — |
| `shieldPylon:overloaded` | `systems/shieldPylons.js:539` | — |
| `shieldPylon:placed` | `systems/shieldPylons.js:345`, `systems/shieldPylons.js:361` | — |
| `shieldPylon:recovered` | `systems/shieldPylons.js:528` | — |
| `shieldPylon:retired` | `systems/shieldPylons.js:575` | — |
| `shieldPylon:strained` | `systems/shieldPylons.js:505` | — |
| `shieldPylon:warning` | `systems/shieldPylons.js:495` | — |
| `ship:appearanceChanged` | `systems/ships.js:2582`, `systems/ships.js:3221`, `systems/trafficJobOps.js:424` | `core/coreSystem.js:556`, `render/vfx.js:3005`, `systems/swarmFloor.js:905` |
| `ship:appearanceSaved` | `systems/ships.js:3223` | `ui/station/screens/shipworks.js:973` |
| `ship:berthSwitching` | `systems/ships.js:3121` | — |
| `ship:boostPreKick` | `systems/flightV3.js:950` | `render/authoredMotion.js:1165`, `render/feel.js:1728` |
| `ship:boostStart` | `systems/flight.js:110`, `systems/flightV3.js:297` | `audio/audioSystem.js:3231`, `render/authoredMotion.js:1166`, `render/vfx.js:3066`, `systems/cruise.js:65`, `systems/onboarding.js:806` |
| `ship:boostStop` | `systems/flight.js:111`, `systems/flight.js:224`, `systems/flightV3.js:298`, `systems/flightV3.js:1029` | `audio/audioSystem.js:3236`, `render/authoredMotion.js:1167`, `render/vfx.js:3067` |
| `ship:captured` | `systems/shipControlTransfer.js:98` | `data/encounters/362-the-salvage-watch.js:93`, `data/encounters/362-the-salvage-watch.js:187`, `data/encounters/367-the-salvage-tail.js:141` |
| `ship:cargoCapChanged` | `systems/ships.js:2576` | — |
| `ship:controlChanging` | `systems/shipControlTransfer.js:162` | `data/encounters/362-the-salvage-watch.js:98`, `data/encounters/362-the-salvage-watch.js:192`, `data/encounters/367-the-salvage-tail.js:136`, `systems/cruise.js:58`, `systems/flightV3.js:247`, `systems/tetherGameplay.js:370` |
| `ship:controlTransferred` | `systems/shipControlTransfer.js:205` | — |
| `ship:dash` | `systems/flight.js:201`, `systems/flightV3.js:975` | `audio/audioSystem.js:3239`, `render/vfx.js:3068`, `systems/combat.js:432`, `systems/gamepad.js:1094`, `systems/uniqueLootAbilities.js:161` |
| `ship:deathFlash` | `render/shipMicroMotion.js:2764` | `render/vfx.js:3106` |
| `ship:deathPop` | `render/shipMicroMotion.js:1420`, `render/shipMicroMotion.js:2754` | `render/vfx.js:3105` |
| `ship:livingHullChanged` | `systems/ships.js:2237`, `systems/ships.js:2415`, `systems/story.js:2122` | `systems/barkDirector.js:881` |
| `ship:loadoutPresetApplied` | `systems/ships.js:3730` | `ui/station/screens/shipworks.js:1004` |
| `ship:loadoutPresetApplyRejected` | `systems/ships.js:3561`, `systems/ships.js:3579`, `systems/ships.js:3608`, `systems/ships.js:3633`, `systems/ships.js:3700`, `systems/ships.js:3720` | `ui/station/screens/shipworks.js:998` |
| `ship:loadoutPresetDeleted` | `systems/ships.js:3546` | — |
| `ship:loadoutPresetSaved` | `systems/ships.js:3517` | — |
| `ship:massChanged` | `systems/ships.js:2850` | — |
| `ship:nameChanged` | `systems/ships.js:3246` | `ui/orrery/hudAdapter.js:526` |
| `ship:parkedHoldSwap` | `systems/shipControlTransfer.js:147`, `systems/ships.js:3104` | — |
| `ship:phaseBlink` | `systems/phaseBlink.js:190`, `systems/phaseBlink.js:331` | `render/phaseBlinkPresentation.js:855` |
| `ship:purchased` | `systems/ships.js:2902`, `systems/ships.js:2942` | `audio/audioSystem.js:3194`, `systems/impoundLot.js:1098`, `systems/lawSecurity.js:446`, `systems/missions.js:989` |
| `ship:rcsPulse` | `render/shipMicroMotion.js:1485`, `render/shipMicroMotion.js:2741` | `render/vfx.js:3104` |
| `ship:released` | `shipjack/ownedOperations.js:26` | — |
| `ship:roleContext` | `systems/ships.js:2473` | `systems/presentationAdapters.js:341` |
| `ship:sold` | `systems/ships.js:3067` | — |
| `ship:statsChanged` | `systems/ships.js:2575` | `systems/stationServices.js:333`, `systems/world.js:800`, `ui/commandBar.js:254` |
| `ship:swingDash` | `systems/flightV3.js:976` | `render/shipMicroMotion.js:1769` |
| `ship:thrust` | `systems/flight.js:435`, `systems/flightV3.js:2343` | `render/vfx.js:3065` |
| `shipbreakingYard:action` | `features/shipbreakingYard/presentation.js:79` | — |
| `shipbreakingYard:close` | `features/shipbreakingYard/runtime.js:131` | — |
| `shipbreakingYard:cue` | `features/shipbreakingYard/runtime.js:128` | `features/shipbreakingYard/audio.js:18` |
| `shipbreakingYard:delivered` | `features/shipbreakingYard/runtime.js:440` | — |
| `shipbreakingYard:offer` | `features/shipbreakingYard/runtime.js:215`, `features/shipbreakingYard/runtime.js:229`, `features/shipbreakingYard/runtime.js:259`, `features/shipbreakingYard/runtime.js:329`, `features/shipbreakingYard/runtime.js:532`, `features/shipbreakingYard/runtime.js:564` | — |
| `shipbreakingYard:receipt` | `features/shipbreakingYard/runtime.js:126` | — |
| `shipbreakingYard:view` | `features/shipbreakingYard/runtime.js:670` | — |
| `shipjack:actionCommitted` | `systems/shipjack.js:113` | — |
| `shipjack:claimResolved` | `shipjack/yardOperations.js:132`, `shipjack/yardOperations.js:197` | — |
| `shipjack:cue` | `systems/shipjack.js:89` | — |
| `shipjack:destroyed` | `systems/shipjack.js:438` | — |
| `shipjack:distress` | `systems/shipjack.js:142` | — |
| `shipjack:fleetArrived` | `shipjack/fleetOperations.js:183` | — |
| `shipjack:fleetDeparted` | `shipjack/fleetOperations.js:153` | — |
| `shipjack:fleetPickedUp` | `shipjack/fleetOperations.js:171` | — |
| `shipjack:fleetReceipt` | `shipjack/fleetOperations.js:73` | — |
| `shipjack:fleetStarted` | `shipjack/fleetOperations.js:118` | — |
| `shipjack:inspection` | `systems/shipjack.js:546` | — |
| `shipjack:opportunity` | `systems/shipjack.js:497` | — |
| `shipjack:result` | `systems/shipjack.js:110` | — |
| `shipjack:route` | `systems/shipjack.js:429` | — |
| `shipjack:settled` | `systems/shipjack.js:572` | — |
| `shipjack:yardCompleted` | `shipjack/yardOperations.js:131`, `shipjack/yardOperations.js:196` | — |
| `shipjack:yardReceipt` | `shipjack/yardOperations.js:93`, `shipjack/yardOperations.js:130` | — |
| `shipjack:yardStarted` | `shipjack/yardOperations.js:241` | — |
| `ships:grantModule` | `systems/fenceDesk.js:266` | `systems/ships.js:1977` |
| `signal:investigate` | — | `systems/scanner.js:1126` |
| `signal:investigated` | `systems/scanner.js:2298` | `systems/missions.js:844`, `systems/presentationOrchestrator.js:204`, `systems/story.js:174`, `systems/world.js:803`, `ui/signalInvestigationPrompt.js:268` |
| `signal:investigating` | `systems/scanner.js:1639`, `systems/spectrum/index.js:257` | `ui/signalInvestigationPrompt.js:267` |
| `signal:receipt` | `systems/scanner.js:2299` | — |
| `signal:scanResults` | `response/mercyService/live.js:144`, `systems/scanner.js:1380`, `systems/spectrum/index.js:131`, `systems/spectrum/index.js:246` | `systems/missions.js:829`, `systems/presentationOrchestrator.js:202`, `systems/story.js:289`, `systems/story.js:292`, `ui/signalInvestigationPrompt.js:264` |
| `signal:surveyFiled` | `systems/v2FlavorRuntime.js:318` | `systems/scanner.js:1127` |
| `signal:track` | — | `systems/scanner.js:1125` |
| `signal:tracked` | `systems/scanner.js:1647`, `systems/scanner.js:1670` | `systems/presentationOrchestrator.js:203`, `ui/signalInvestigationPrompt.js:266` |
| `sim:pause` | `ui/screenManager.js:564` | `audio/audioSystem.js:3473`, `audio/bombAudio.js:463`, `audio/fieldAudio.js:329`, `audio/worldFeelSeams.js:447`, `render/feel.js:1545`, `systems/autoTargetAssist.js:166`, `systems/heliosCuttingCourtesy.js:77`, `systems/input.js:1545`, `ui/masslineHud.js:1364` |
| `sim:resume` | `core/simLaneMain.js:621`, `ui/screenManager.js:572` | `audio/audioSystem.js:3474`, `ui/masslineHud.js:1367`, `ui/screenManager.js:757` |
| `site:anchored` | `systems/asteroidSites.js:1594` | — |
| `site:blueprintApplied` | `systems/asteroidSites.js:2568` | — |
| `site:chargePressed` | `systems/asteroidSites.js:3395` | — |
| `site:claimContested` | `systems/asteroidSites.js:3505` | — |
| `site:clusterBalanced` | `systems/asteroidSites.js:2593` | — |
| `site:commissioned` | `systems/asteroidSites.js:2341` | — |
| `site:courierDelivered` | `systems/asteroidSites.js:3917` | — |
| `site:courierLaunched` | `systems/asteroidSites.js:3805` | `audio/audioSystem.js:3501` |
| `site:courierLost` | `systems/asteroidSites.js:3901` | — |
| `site:created` | `systems/asteroidSites.js:1532`, `systems/asteroidSites.js:2532` | — |
| `site:defenseDeployed` | `systems/asteroidSites.js:2383` | — |
| `site:directiveUpdated` | `systems/asteroidSites.js:2398` | — |
| `site:droneCommissioned` | `systems/asteroidSites.js:2441` | — |
| `site:laneSpilled` | `systems/asteroidSites.js:1929`, `systems/asteroidSites.js:2007` | — |
| `site:linkCreated` | `systems/asteroidSites.js:2168` | — |
| `site:linkRemoved` | `systems/asteroidSites.js:2185` | — |
| `site:linkUpdated` | `systems/asteroidSites.js:2149` | — |
| `site:lost` | `systems/asteroidSites.js:2927` | `ui/alerts.js:556` |
| `site:machineInstalled` | `systems/asteroidSites.js:1563` | `audio/audioSystem.js:3500`, `ui/alerts.js:555` |
| `site:machineMode` | `systems/asteroidSites.js:2028` | — |
| `site:machineRemoved` | `systems/asteroidSites.js:1946` | `render/authoredMotion.js:1185` |
| `site:machineStatus` | `systems/asteroidSites.js:3460` | `audio/audioSystem.js:3505`, `ui/alerts.js:551` |
| `site:podBuilt` | `systems/asteroidSites.js:3319` | — |
| `site:producing` | `systems/asteroidSites.js:1816` | `render/authoredMotion.js:1184`, `ui/asteroid/asteroidScreen.js:2742` |
| `site:rematerialized` | `systems/asteroidSites.js:2980` | — |
| `site:reserveUpdated` | `systems/asteroidSites.js:2102` | — |
| `site:signatureBand` | `systems/asteroidSites.js:3497` | — |
| `site:surveyCommitted` | `systems/asteroidSites.js:1734` | `ui/asteroid/asteroidScreen.js:2727` |
| `site:surveyComplete` | `systems/asteroidSites.js:1685` | `ui/asteroid/asteroidScreen.js:2721` |
| `site:surveyDetected` | `systems/asteroidSites.js:1675` | `ui/asteroid/asteroidScreen.js:2714` |
| `siteEvidence:action` | `ui/physicalJobsPrompt.js:79`, `ui/physicalJobsPrompt.js:83` | `systems/asteroidSites.js:658` |
| `siteEvidence:closed` | `systems/machineWork.js:79`, `systems/machineWork.js:123`, `systems/machineWork.js:149`, `systems/machineWork.js:263`, `world/motionFossil.js:112`, `world/motionFossil.js:147`, `world/motionFossil.js:258` | — |
| `siteEvidence:offer` | `systems/alienEcology.js:884`, `systems/machineWork.js:88`, `world/motionFossil.js:119` | — |
| `siteEvidence:result` | `systems/asteroidSites.js:664`, `systems/asteroidSites.js:670` | — |
| `slate:columnRead` | `systems/slateColumn.js:186` | — |
| `slate:spike` | `systems/slateColumn.js:162` | — |
| `solstice:bloom` | `systems/solstice.js:526` | — |
| `solstice:charged` | `systems/solstice.js:449` | — |
| `solstice:destroyed` | `systems/solstice.js:361` | — |
| `solstice:voice` | `systems/solstice.js:291` | — |
| `spawn:request` | `systems/automation.js:2057` | `systems/world.js:857` |
| `special500:confessional` | `systems/special500Confessional.js:172`, `systems/special500Confessional.js:186` | `ui/special500ConfessionalPrompt.js:84` |
| `special500:confessionalReceipt` | `systems/special500Confessional.js:160` | `ui/special500ConfessionalPrompt.js:95` |
| `special500:deathBell` | `systems/special500DeathBell.js:86` | `render/feel.js:1568` |
| `special500:invoice` | `systems/special500Invoice.js:132` | `ui/special500InvoicePrompt.js:70` |
| `special500:invoiceReceipt` | `systems/special500Invoice.js:164`, `systems/special500Invoice.js:170`, `systems/special500Invoice.js:190` | `ui/special500InvoicePrompt.js:76` |
| `special500:karaokeHeard` | `systems/special500ForgeKaraoke.js:88` | — |
| `special500:portraitCommission` | `systems/special500PortraitBuoys.js:208`, `systems/special500PortraitBuoys.js:218`, `systems/special500PortraitBuoys.js:225` | — |
| `special500:spectacle` | `systems/special500Director.js:301` | `systems/special500Spectacle.js:207` |
| `spectrum:focus` | `ui/signalInvestigationPrompt.js:189` | — |
| `spectrum:resolved` | `systems/spectrum/index.js:314` | — |
| `station:berthAssigned` | `systems/stationServices.js:676` | — |
| `station:blockade` | `systems/economy.js:5246` | — |
| `station:boom` | `systems/economy.js:5213` | — |
| `station:broadcastTic` | `systems/stationBroadcast.js:430` | `render/vfx.js:3054` |
| `station:exitRequest` | `ui/screenManager.js:716`, `ui/uiRoot.js:1678` | `ui/station/stationApp.js:1704` |
| `station:grudge` | `systems/economy.js:5045` | — |
| `station:grudgeCleared` | `systems/economy.js:5083` | — |
| `station:holding` | `systems/stationServices.js:680` | — |
| `station:marketTradeIntentRetired` | `ui/station/screens/market.js:1065` | — |
| `station:marketTradeReceiptRecovered` | `ui/station/screens/market.js:1139` | — |
| `station:moduleGained` | `systems/claims.js:2434` | `systems/factions.js:544` |
| `station:navigate` | `ui/screens/automationPanel.js:2159`, `ui/station/screens/bar.js:1096`, `ui/station/screens/bar.js:1101`, `ui/station/screens/industry.js:725`, `ui/station/screens/industry.js:732`, `ui/station/starterWorkdayConversation.js:212` | — |
| `station:sideEvent` | `systems/stationSideEventDirector.js:339` | `render/infrastructureMotion.js:311`, `render/vfx.js:3053`, `systems/barkDirector.js:948` |
| `station:slammed` | `systems/economy.js:4986` | `systems/sectorSim.js:158` |
| `station:strike` | `systems/economy.js:5176` | — |
| `station:throughput` | `systems/claims.js:2395` | `render/authoredMotion.js:1205` |
| `station:yardChanged` | `systems/stationServices.js:871` | — |
| `stationContact:changed` | `systems/stationContacts.js:252`, `systems/stationContacts.js:456`, `systems/stationContacts.js:492`, `systems/stationContacts.js:784`, `systems/stationContacts.js:808` | — |
| `stationContact:counterChanged` | `systems/stationContacts.js:366`, `systems/stationContacts.js:825` | — |
| `stationContact:counterDelta` | `systems/missions.js:4903` | — |
| `stationContact:hailSpoken` | `systems/scanner.js:1814`, `systems/scanner.js:2002` | — |
| `stationContact:manifestWon` | `systems/manifestGame.js:16` | — |
| `stationLife:deedNoticed` | `systems/stationContacts.js:730` | — |
| `stationLife:trafficChanged` | `systems/stationContacts.js:480`, `systems/stationContacts.js:592`, `systems/stationContacts.js:623` | — |
| `story:beatAdvanced` | `systems/missionStoryOps.js:2370` | `save/saveSystem.js:584`, `systems/story.js:164`, `ui/screens/codex.js:1360` |
| `story:continuationAccess` | `systems/story.js:2606` | — |
| `story:elroyResolved` | `systems/missionObjectiveOps.js:1392` | `systems/story.js:165` |
| `story:kurtzLedger` | `systems/story.js:1795`, `systems/story.js:1806` | `systems/story.js:193` |
| `story:newGamePlusStarted` | `systems/story.js:2036` | `systems/titles.js:606` |
| `story:playerChoiceRecorded` | `systems/encounterDirector.js:2733` | `systems/story.js:191` |
| `story:postEndingContinuity` | `systems/story.js:1693` | `ui/screens/missionLog.js:2794` |
| `story:postEndingProgress` | `systems/story.js:1663` | `ui/screens/missionLog.js:2793` |
| `story:replayHookUnlocked` | `systems/story.js:1678` | `ui/screens/missionLog.js:2795` |
| `story:skimResolved` | `systems/missionStoryOps.js:2091` | `systems/missions.js:725` |
| `story:stuntIncidentRecorded` | — | `systems/barkDirector.js:885`, `systems/wingmen.js:172` |
| `story:stuntIncidentUpdated` | — | `systems/barkDirector.js:884`, `systems/wingmen.js:173` |
| `story:varianceSeamFailed` | `systems/missionStoryOps.js:2687` | — |
| `story:vergeEvidenceRecorded` | `systems/story.js:1469` | `systems/story.js:192` |
| `story:vergeObserversRevealed` | `systems/story.js:1237` | — |
| `story:vergeValeGatesRevoked` | `systems/story.js:1489` | `systems/story.js:194` |
| `stunt:arenaLawBounty` | `systems/stuntGrammar.js:185` | — |
| `stunt:bridge` | `systems/stuntGrammar.js:299` | `ui/stuntCallout.js:920` |
| `stunt:lineContractCompleted` | `systems/stuntGrammar.js:284` | `ui/stuntCallout.js:919` |
| `stunt:salvageRights` | `systems/stuntGrammar.js:194` | `ui/stuntCallout.js:917` |
| `stunt:salvageRightsClaimed` | `systems/stuntGrammar.js:218` | `ui/stuntCallout.js:918` |
| `stunt:styleBanked` | `systems/stuntGrammar.js:167` | `audio/audioSystem.js:3077`, `ui/stuntCallout.js:903` |
| `stunt:trickAmended` | — | `systems/achievements.js:1181`, `systems/bulletTime.js:136`, `systems/survivalResults.js:533`, `systems/titles.js:605`, `ui/stuntCallout.js:902` |
| `stunt:trickDetected` | — | `audio/audioSystem.js:3076`, `systems/achievements.js:1179`, `systems/bulletTime.js:135`, `systems/killReplay.js:382`, `systems/survivalResults.js:532`, `systems/titles.js:604`, `ui/stuntCallout.js:901`, `ui/toasts.js:688` |
| `surrender:escaped` | — | `systems/combatOutcome.js:299` |
| `surrender:secured` | — | `systems/traffic.js:1887` |
| `surrender:tethered` | — | `systems/traffic.js:1886` |
| `survivalArena:installed` | — | `systems/survivalAnnounce.js:457`, `systems/swarmArena.js:928` |
| `survivalArena:plateTheft` | `systems/foundryPlateTheft.js:79` | `systems/survivalAnnounce.js:458` |
| `survivalArena:released` | — | `systems/swarmArena.js:929` |
| `survivalArena:rosterPrewarm` | `systems/survivalArena.js:1787` | — |
| `survivalArena:stormPresented` | `render/renderer.js:21171` | `systems/survivalArena.js:1434` |
| `survivalWave:cohortJoined` | `systems/capitalBossRuntime.js:356` | `systems/survivalWave.js:244` |
| `survivorPod:boarded` | `systems/survivorPod.js:1334`, `systems/survivorPod.js:1452` | `systems/traffic.js:1915` |
| `survivorPod:choose` | `ui/wreckChoicePrompt.js:156` | `systems/survivorPod.js:727` |
| `survivorPod:delivered` | `systems/trafficRoleOps.js:1282` | `render/authoredMotion.js:1206`, `systems/survivorPod.js:738`, `systems/titles.js:607` |
| `survivorPod:ejected` | `systems/survivorPod.js:978`, `systems/survivorPod.js:1121` | `render/authoredMotion.js:1189`, `render/vfx.js:3051`, `systems/aftermathWrecks.js:1280`, `systems/lawSecurity.js:425`, `systems/survivorPod.js:737` |
| `survivorPod:heatCooled` | `systems/heat.js:812` | `systems/survivorPod.js:728` |
| `survivorPod:huntDispatched` | `ai/podHunt.js:188` | — |
| `survivorPod:huntEnded` | `ai/podHunt.js:244` | — |
| `survivorPod:promoted` | `systems/survivorPod.js:1858` | — |
| `survivorPod:ransomed` | — | `systems/fenceDesk.js:63` |
| `survivorPod:rescueBlocked` | `systems/survivorPod.js:2001`, `systems/survivorPod.js:2040` | `ui/wreckChoicePrompt.js:58` |
| `survivorPod:rescueSelected` | `systems/survivorPod.js:2016` | `render/authoredMotion.js:1190`, `systems/missions.js:923` |
| `survivorPod:rescued` | — | `systems/heat.js:441`, `systems/titles.js:608` |
| `survivorPod:resolved` | `systems/survivorPod.js:1721` | — |
| `survivorPod:stripBlocked` | `systems/survivorPod.js:1978` | `ui/wreckChoicePrompt.js:59` |
| `survivorPod:stripped` | `systems/survivorPod.js:2077` | `systems/missions.js:925`, `ui/wreckChoicePrompt.js:57` |
| `survivorpod:barrel` | — | `render/visualFactory.js:7941` |
| `survivorpod:crashcollar` | — | `render/visualFactory.js:7953` |
| `survivorpod:lamp` | — | `render/visualFactory.js:7966` |
| `survivorpod:mast` | — | `render/visualFactory.js:7960` |
| `survivorpod:nose` | — | `render/visualFactory.js:7943` |
| `survivorpod:retroblock` | — | `render/visualFactory.js:7956` |
| `survivorpod:viewportglass` | — | `render/visualFactory.js:7950` |
| `survivorpod:viewportring` | — | `render/visualFactory.js:7948` |
| `swarm:affix` | — | `systems/survivalAnnounce.js:443` |
| `swarm:announce` | `systems/capitalBossRuntime.js:194`, `ui/stuntCallout.js:938`, `ui/stuntCallout.js:945` | `ui/swarmJuiceHud.js:132` |
| `swarm:arenaEntered` | `systems/world.js:1366` | `audio/audioSystem.js:3230` |
| `swarm:arenaLights` | `systems/swarmCourseTwists.js:704` | `render/sectorDimmer.js:32` |
| `swarm:bonusChip` | `systems/swarmCourseTwists.js:270` | — |
| `swarm:bossDown` | — | `render/feel.js:1562`, `ui/swarmJuiceHud.js:137` |
| `swarm:bossHp` | — | `ui/swarmJuiceHud.js:136` |
| `swarm:bossIntro` | — | `ui/swarmJuiceHud.js:135` |
| `swarm:bossMilestoneAck` | `ui/screens/crucible.js:4204` | — |
| `swarm:bossMove` | `ui/capitalBossOverlayMount.js:462`, `ui/capitalBossOverlayMount.js:598`, `ui/toasts.js:834` | `ui/swarmJuiceHud.js:138` |
| `swarm:broodAggression` | `systems/swarmBrood.js:4222` | — |
| `swarm:broodBurst` | `systems/swarmBrood.js:3689`, `systems/swarmBrood.js:3763` | `render/vfx.js:3045` |
| `swarm:broodCounter` | `systems/swarmBrood.js:2415`, `systems/swarmBrood.js:2486`, `systems/swarmBrood.js:3802` | `systems/swarmJuice.js:164` |
| `swarm:broodDeathPositions` | `systems/swarmBrood.js:4149` | `systems/swarmLegendaries.js:120` |
| `swarm:broodKills` | `systems/swarmBrood.js:4120` | `render/vfx.js:3048`, `systems/survivalResults.js:524`, `systems/swarmChain.js:166`, `systems/swarmDrops.js:92`, `systems/swarmJuice.js:145`, `systems/swarmSupply.js:106` |
| `swarm:broodProjectileHit` | `systems/swarmBrood.js:3375` | — |
| `swarm:broodRemains` | `systems/swarmBrood.js:3865` | — |
| `swarm:broodRemainsSpent` | `systems/swarmBrood.js:3981` | — |
| `swarm:broodReserve` | `systems/swarmBrood.js:4097` | `systems/survivalAnnounce.js:446` |
| `swarm:broodShielded` | `systems/swarmBrood.js:3541` | — |
| `swarm:broodTelegraph` | `systems/swarmBrood.js:1984` | `systems/survivalAnnounce.js:442` |
| `swarm:broodTeslaHit` | `systems/swarmBrood.js:3405` | — |
| `swarm:callinQueued` | — | `ui/contextWheel.js:353` |
| `swarm:chain` | — | `audio/audioSystem.js:3081`, `systems/survivalResults.js:542`, `systems/swarmElites.js:188`, `systems/swarmJuice.js:150`, `ui/survivalHud.js:394`, `ui/swarmJuiceHud.js:144` |
| `swarm:chainBest` | — | `systems/survivalResults.js:563` |
| `swarm:chainBroken` | — | `audio/audioSystem.js:3084`, `systems/swarmElites.js:189`, `systems/swarmJuice.js:151`, `ui/survivalHud.js:395`, `ui/swarmJuiceHud.js:145` |
| `swarm:chainShatter` | — | `ui/swarmJuiceHud.js:147` |
| `swarm:chainTier` | — | `ui/swarmJuiceHud.js:146` |
| `swarm:cryoWeather` | — | `systems/swarmJuice.js:168` |
| `swarm:dropRequested` | `systems/swarmCourseTwists.js:572` | `systems/swarmDrops.js:95` |
| `swarm:event` | `systems/swarmEvents.js:367` | `ui/encounterChoicePrompt.js:184` |
| `swarm:eventTelegraphed` | `systems/swarmEvents.js:169` | `ui/encounterChoicePrompt.js:183` |
| `swarm:eventVerdict` | `ui/encounterChoicePrompt.js:158` | `systems/swarmEvents.js:119` |
| `swarm:floorSaleRequested` | `systems/swarmCourseTwists.js:518` | `systems/swarmFloor.js:909` |
| `swarm:fortifyBuildRequested` | `ui/swarmFortifyPanel.js:151` | — |
| `swarm:fortifyBuildResolved` | — | `ui/swarmFortifyPanel.js:131` |
| `swarm:fortifyReloadRequested` | `ui/swarmFortifyPanel.js:153` | — |
| `swarm:fortifyRepairRequested` | `ui/swarmFortifyPanel.js:152` | — |
| `swarm:fortifyState` | — | `ui/swarmFortifyPanel.js:127` |
| `swarm:fortifyStateRequested` | `ui/swarmFortifyPanel.js:145` | — |
| `swarm:hiveSacKilled` | — | `systems/survivalAnnounce.js:445` |
| `swarm:killPopup` | — | `ui/stuntCallout.js:1107` |
| `swarm:openingBeatEnded` | — | `systems/swarmArena.js:914` |
| `swarm:overdrive` | — | `systems/swarmJuice.js:155`, `ui/swarmJuiceHud.js:150` |
| `swarm:perkTrigger` | — | `ui/orrery/hudAdapter.js:519` |
| `swarm:pressureSpend` | — | `systems/survivalResults.js:531` |
| `swarm:pressureTelegraph` | — | `systems/survivalAnnounce.js:441` |
| `swarm:roundClear` | — | `ui/swarmJuiceHud.js:134` |
| `swarm:roundSlam` | — | `ui/swarmJuiceHud.js:133` |
| `swarm:scoreboardToggle` | `ui/input.js:691` | `ui/swarmJuiceHud.js:154` |
| `swarm:stallReleased` | — | `systems/survivalAnnounce.js:444` |
| `swarm:stormDischarge` | — | `systems/swarmJuice.js:159` |
| `swarm:supplyCollected` | — | `systems/swarmJuice.js:166` |
| `swarmrepair:crossbar` | — | `render/visualFactory.js:4294`, `render/visualFactory.js:4295` |
| `swarmrepair:flange` | — | `render/visualFactory.js:4283` |
| `swarmrepair:weldseam` | — | `render/visualFactory.js:4290` |
| `tallyho:betLost` | `systems/tallyho.js:783`, `systems/tallyho.js:800`, `systems/tallyho.js:816`, `systems/tallyho.js:828` | — |
| `tallyho:betPaid` | `systems/tallyho.js:777` | — |
| `tallyho:betPosted` | `systems/tallyho.js:1126` | — |
| `tallyho:bountyClaimed` | `systems/tallyho.js:1108` | — |
| `tallyho:bountyCold` | `systems/tallyho.js:1040` | — |
| `tallyho:bountyPosted` | `systems/tallyho.js:1070` | — |
| `tallyho:deed` | `systems/tallyho.js:676` | — |
| `tallyho:huntCold` | `systems/tallyho.js:833` | — |
| `tallyho:huntPoached` | `systems/tallyho.js:805` | — |
| `tallyho:huntPosted` | `systems/tallyho.js:731` | — |
| `tallyho:huntSlipped` | `systems/tallyho.js:821` | — |
| `tallyho:ledgerFiled` | `systems/tallyho.js:654` | — |
| `tallyho:quarryFleeing` | `systems/tallyho.js:1153` | — |
| `tallyho:rivalDowned` | `systems/tallyho.js:994` | — |
| `tallyho:rivalLeft` | `systems/tallyho.js:887`, `systems/tallyho.js:1233` | — |
| `tallyho:rivalPosted` | `systems/tallyho.js:930` | — |
| `tallyho:sightingFiled` | `systems/tallyho.js:612` | — |
| `tallyho:standing` | `systems/tallyho.js:681` | — |
| `tech:researched` | `systems/ships.js:2628` | `audio/audioSystem.js:3190`, `systems/onboarding.js:986`, `systems/ships.js:1981` |
| `terrainAnchors:replenished` | `systems/terrainAnchors.js:297` | — |
| `tether:attached` | `combat/attachments.js:563` | `audio/audioSystem.js:3298`, `render/authoredMotion.js:1156`, `render/vfx.js:2915`, `systems/encounterDirector.js:393`, `systems/presentationOrchestrator.js:101`, `systems/scenarioRuntime.js:25`, `systems/surrenderRecovery.js:95`, `systems/survivalArena.js:1431`, `ui/prompts/bulkHaulTag.js:145` |
| `tether:broke` | `systems/tetherGameplay.js:565`, `systems/tetherGameplay.js:1524`, `systems/tetherGameplay.js:1545`, `systems/tetherGameplay.js:2447` | `audio/audioSystem.js:3325`, `careers/origins/prospectorOrigin.js:645`, `render/shipMicroMotion.js:1777`, `systems/faction_understory.js:720`, `systems/lineProgression.js:50`, `systems/onboarding.js:741`, `systems/onboarding.js:757`, `systems/surrenderRecovery.js:99`, `ui/stuntCallout.js:1028` |
| `tether:broken` | `combat/attachments.js:683` | `audio/audioSystem.js:3286`, `render/feel.js:1766`, `render/vfx.js:2918`, `systems/encounterDirector.js:394`, `systems/missions.js:860`, `systems/presentationOrchestrator.js:109`, `systems/scenarioRuntime.js:29`, `systems/surrenderRecovery.js:96`, `systems/survivalArena.js:1432`, `systems/tetherGameplay.js:373`, `systems/volatileExposure.js:217`, `ui/masslineHud.js:1347` |
| `tether:couplerLock` | `systems/tetherGameplay.js:2858` | — |
| `tether:cut` | `systems/tetherGameplay.js:2176` | `audio/audioSystem.js:3343`, `systems/gamepad.js:987`, `systems/masslineThrow.js:171`, `systems/onboarding.js:756`, `systems/onboarding.js:815`, `systems/onboarding.js:825`, `ui/stuntCallout.js:1022` |
| `tether:cutDenied` | `systems/tetherGameplay.js:2160` | — |
| `tether:detached` | — | `systems/missions.js:859` |
| `tether:latchDenied` | `systems/masslineSnares.js:744`, `systems/tetherGameplay.js:458`, `systems/tetherGameplay.js:645`, `systems/tetherGameplay.js:675`, `systems/tetherGameplay.js:718`, `systems/tetherGameplay.js:723`, `systems/tetherGameplay.js:732`, `systems/tetherGameplay.js:773`, `systems/tetherGameplay.js:1153` | `render/authoredMotion.js:1162`, `systems/onboarding.js:1022`, `testing/lab/proofSixtySeconds.js:1532`, `ui/masslineHud.js:1292` |
| `tether:latched` | `systems/tetherGameplay.js:545`, `systems/tetherGameplay.js:768`, `systems/tetherGameplay.js:797` | `audio/audioSystem.js:3313`, `careers/origins/prospectorOrigin.js:642`, `systems/fields.js:509`, `systems/flightV3.js:248`, `systems/flybyFocus.js:331`, `systems/gamepad.js:986`, `systems/heistFacilities.js:336`, `systems/lawSecurity.js:433`, `systems/lineProgression.js:48`, `systems/longBerth.js:53`, `systems/masslineThrow.js:177`, `systems/missions.js:858`, `systems/missions.js:905`, `systems/missions.js:975`, `systems/onboarding.js:736`, `systems/onboarding.js:753`, `systems/onboarding.js:804`, `systems/onboarding.js:813`, `systems/onboarding.js:1029`, `systems/onboarding.js:1032`, `systems/onboarding.js:1044`, `systems/onboarding.js:1066`, `systems/surrenderRecovery.js:94`, `systems/survivalAnnounce.js:439`, `systems/survivorPod.js:736`, `systems/swarmArena.js:905`, `testing/lab/proofSixtySeconds.js:1533`, `ui/masslineHud.js:1306`, `ui/prompts/bulkHaulTag.js:144`, `ui/stuntCallout.js:1045` |
| `tether:lineControlDenied` | `systems/tetherGameplay.js:1827` | — |
| `tether:massWeighed` | `systems/masslineTelemetry.js:338` | `systems/economyContracts.js:263` |
| `tether:nearBreak` | `combat/attachments.js:1069`, `combat/attachments.js:1092` | `audio/audioSystem.js:3310`, `systems/onboarding.js:742`, `systems/onboarding.js:1068`, `systems/presentationOrchestrator.js:102` |
| `tether:rebound` | `combat/attachments.js:998` | `audio/audioSystem.js:3354`, `systems/survivalArena.js:1433` |
| `tether:reel` | `combat/attachments.js:615` | `audio/audioSystem.js:3284`, `systems/missions.js:854`, `systems/onboarding.js:739`, `systems/onboarding.js:754`, `systems/surrenderRecovery.js:97` |
| `tether:reelPump` | `systems/masslineTelemetry.js:400` | `render/authoredMotion.js:1159`, `ui/stuntCallout.js:1051` |
| `tether:releaseRated` | `systems/tetherGameplay.js:566`, `systems/tetherGameplay.js:1520`, `systems/tetherGameplay.js:1525`, `systems/tetherGameplay.js:1547`, `systems/tetherGameplay.js:2178` | `audio/audioSystem.js:3285`, `render/feel.js:1819`, `render/vfx.js:2917`, `systems/economy.js:1882`, `systems/gamepad.js:988`, `systems/masslineThrow.js:174`, `systems/missions.js:861`, `systems/presentationOrchestrator.js:168`, `systems/titles.js:609`, `ui/masslineHud.js:1314` |
| `tether:released` | `systems/tetherGameplay.js:1517`, `systems/tetherGameplay.js:1543`, `systems/tetherGameplay.js:2177` | `render/authoredMotion.js:1160`, `render/shipMicroMotion.js:1776`, `render/vfx.js:2916`, `systems/barkDirector.js:919`, `systems/faction_understory.js:719`, `systems/lineProgression.js:49`, `systems/onboarding.js:740`, `systems/onboarding.js:755`, `systems/onboarding.js:814`, `systems/onboarding.js:824`, `systems/rockCore.js:97`, `systems/surrenderRecovery.js:98`, `systems/tumbleStates.js:133`, `systems/world.js:914` |
| `tether:snagCleared` | `systems/tetherGameplay.js:2759` | `ui/stuntCallout.js:1020` |
| `tether:snagged` | `systems/tetherGameplay.js:2612` | `audio/audioSystem.js:3347` |
| `tether:snapCatch` | `systems/masslineTelemetry.js:478` | `render/authoredMotion.js:1158`, `systems/plants/otherSide.js:134`, `systems/plants/towWatch.js:91`, `ui/stuntCallout.js:1050` |
| `tether:strain` | `systems/tetherGameplay.js:1891` | `audio/audioSystem.js:3303`, `render/authoredMotion.js:1164`, `systems/missions.js:752`, `systems/onboarding.js:1069` |
| `tether:tractorCapture` | `systems/tetherGameplay.js:815` | — |
| `tether:whipImpact` | `systems/masslineImpacts.js:324` | `render/feel.js:1844`, `render/vfx.js:2996`, `systems/collisionConsequences.js:127`, `systems/combat.js:421`, `systems/lineHeads.js:121`, `systems/lineHeads.js:122`, `systems/masslineImpactDamage.js:59`, `systems/missions.js:862`, `systems/onboarding.js:758`, `systems/onboarding.js:816`, `systems/onboarding.js:1070`, `systems/presentationOrchestrator.js:144`, `systems/survivalAnnounce.js:440`, `systems/swarmDrops.js:100`, `systems/tumbleStates.js:128`, `ui/stuntCallout.js:1052` |
| `tether:whipSnap` | `systems/tetherGameplay.js:2305` | `systems/gamepad.js:1002` |
| `title:arrivalGreeted` | `ui/station/stationArrival.js:213` | `systems/titles.js:611` |
| `title:holdResolved` | — | `systems/titles.js:598` |
| `touch:guide` | `ui/screens/pause.js:1182` | — |
| `touch:uiAction` | `systems/legacyTouch.js:637` | `ui/input.js:1243` |
| `towlineTable:assistAccepted` | `systems/towlineTable.js:202` | — |
| `towlineTable:assistFulfilled` | `systems/towlineTable.js:226` | — |
| `towlineTable:cleanupAccepted` | `systems/towlineTable.js:159` | — |
| `towlineTable:offer` | `systems/towlineTable.js:261` | `ui/towlineTablePrompt.js:7` |
| `traffic:anvilSpillReturned` | `systems/anvilWork.js:700` | — |
| `traffic:anvilTransfer` | `systems/anvilWork.js:801` | — |
| `traffic:ceresCausalChain` | — | `audio/audioSystem.js:3067` |
| `traffic:freightTallied` | `systems/trafficRoleOps.js:981` | — |
| `traffic:haulerRegroup` | `systems/trafficRoleOps.js:1818` | `systems/barkDirector.js:939` |
| `traffic:nearMiss` | — | `systems/barkDirector.js:943` |
| `traffic:oreCollected` | `systems/trafficRoleOps.js:1056` | `render/authoredMotion.js:1201`, `render/npcJobSignatureVfx.js:676`, `render/npcJobSignatureVfx.js:901` |
| `traffic:passengerLinerReceipt` | `systems/trafficJobOps.js:982` | — |
| `traffic:passengerLinerSuspended` | `systems/trafficCausalChainOps.js:2682` | — |
| `traffic:richSeamHelpReserved` | `systems/trafficRecoveryOps.js:572` | `systems/barkDirector.js:925` |
| `traffic:spillNoticed` | `systems/trafficRoleOps.js:1742` | `systems/barkDirector.js:923` |
| `traffic:vesselRelinquished` | `systems/traffic.js:1736` | — |
| `travelLanes:slingRingPass` | — | `ui/toasts.js:698` |
| `tutorial:finished` | `systems/onboarding.js:2470` | `systems/achievements.js:1210`, `systems/missions.js:610`, `systems/presentationAdapters.js:344`, `systems/story.js:187` |
| `tutorial:say` | `systems/onboarding.js:1954` | `audio/audioSystem.js:3413`, `systems/story.js:227` |
| `ui:abandonMission` | `ui/screens/missionLog.js:2646` | `systems/missions.js:663` |
| `ui:acceptMission` | `ui/adventureDecisions.js:431` | `systems/missions.js:662` |
| `ui:applyLoadoutPreset` | `ui/station/screens/shipworks.js:5027` | `systems/ships.js:2076` |
| `ui:bulkHaulTag` | `ui/prompts/bulkHaulTag.js:185` | — |
| `ui:bulkHaulTagCleared` | `ui/prompts/bulkHaulTag.js:204` | — |
| `ui:buy` | — | `systems/economy.js:1830` |
| `ui:buyModule` | — | `systems/onboarding.js:981`, `systems/ships.js:2051` |
| `ui:buyPayload` | `ui/station/screens/shipworks.js:5601` | `systems/bombs.js:713` |
| `ui:buyShip` | `ui/station/screens/shipworks.js:5269` | `systems/ships.js:2014` |
| `ui:cancel` | `ui/input.js:1542`, `ui/input.js:1557` | `ui/screens/crucibleDraft.js:1334`, `ui/swarmFortifyPanel.js:138` |
| `ui:clearTarget` | `ui/input.js:835` | `ui/uiRoot.js:1490` |
| `ui:closeAll` | `main.js:1260`, `ui/loadingPresenter.js:644`, `ui/screens/crucible.js:3797`, `ui/screens/crucible.js:4195` | `ui/uiRoot.js:1485` |
| `ui:closeCargo` | `ui/input.js:560`, `ui/input.js:785`, `ui/input.js:1492` | — |
| `ui:closeComms` | `ui/input.js:779` | — |
| `ui:closeFieldBuild` | `ui/input.js:767` | `ui/uiRoot.js:940` |
| `ui:closeScreen` | `ui/pilotCards.js:457` | `ui/uiRoot.js:1479` |
| `ui:confessionalChoose` | `ui/special500ConfessionalPrompt.js:76` | `systems/special500Confessional.js:135` |
| `ui:confessionalReady` | `ui/special500ConfessionalPrompt.js:101`, `ui/special500ConfessionalPrompt.js:118`, `ui/special500ConfessionalPrompt.js:122`, `ui/special500ConfessionalPrompt.js:124` | `systems/special500Confessional.js:136` |
| `ui:confirm` | `ui/input.js:1500`, `ui/input.js:1552` | `audio/audioSystem.js:3519` |
| `ui:convoyShareBuy` | — | `systems/economy.js:1879` |
| `ui:cycleComponent` | `ui/targetPanel.js:1017`, `ui/targetPanel.js:1021` | `ui/uiRoot.js:1494` |
| `ui:cycleTarget` | `ui/input.js:830`, `ui/input.js:1624` | `ui/uiRoot.js:1489` |
| `ui:deleteLoadoutPreset` | `ui/station/screens/shipworks.js:5073` | `systems/ships.js:2077` |
| `ui:endgameChoose` | `systems/missions.js:1526`, `ui/station/barContacts.js:1490` | `systems/story.js:243` |
| `ui:endgameConfirm` | — | `systems/story.js:244` |
| `ui:endgameDecline` | `ui/comms.js:809` | `systems/story.js:245` |
| `ui:endgameDepartAshfall` | `ui/comms.js:826` | `systems/story.js:254` |
| `ui:endgameSandbox` | `ui/screens/missionLog.js:2496` | `systems/story.js:251` |
| `ui:endgameStayAshfall` | `ui/comms.js:827` | `systems/story.js:255` |
| `ui:endgameUnfiledJump` | `ui/screens/missionLog.js:2500` | `systems/story.js:252` |
| `ui:endgameUnfiledJumpConfirm` | — | `systems/story.js:253` |
| `ui:endingArchiveOpen` | `ui/screens/pause.js:1207` | `systems/story.js:247` |
| `ui:entityDrawer` | `ui/entityLinks.js:370`, `ui/entityLinks.js:388`, `ui/entityLinks.js:459` | `ui/globalFind.js:232` |
| `ui:entityRoute` | `ui/entityLinks.js:245` | `systems/routeFollower.js:411` |
| `ui:factionPresenceService` | `ui/station/serviceQuotes.js:87` | `systems/factionPresence.js:523` |
| `ui:fitModule` | — | `systems/onboarding.js:978`, `systems/ships.js:2053` |
| `ui:fitPayload` | `ui/station/screens/shipworks.js:5611` | `systems/bombs.js:714` |
| `ui:fleetOrder` | `ui/screens/automationPanel.js:2211` | `systems/automation.js:608`, `systems/wingmen.js:169` |
| `ui:forwardSlipBuy` | — | `systems/economy.js:1880` |
| `ui:globalFind` | `ui/input.js:620`, `ui/input.js:747` | `ui/globalFind.js:228` |
| `ui:heliosBay7Scan` | — | `systems/story.js:295` |
| `ui:kurtzInteract` | `ui/station/barContacts.js:259` | `systems/story.js:294` |
| `ui:loadingHidden` | `ui/loadingPresenter.js:428` | `ui/screens/mainMenu.js:972` |
| `ui:manifestAction` | `ui/screens/manifest.js:172` | — |
| `ui:manifestOpen` | `ui/screens/manifest.js:168` | — |
| `ui:manifestStart` | `ui/screens/manifest.js:65` | — |
| `ui:navigate` | `ui/input.js:1505`, `ui/input.js:1528`, `ui/input.js:1533`, `ui/input.js:1599` | — |
| `ui:popScreen` | `ui/galaxyMap.js:3562`, `ui/screens/achievements.js:272`, `ui/screens/automationPanel.js:1202`, `ui/screens/clips.js:355`, `ui/screens/credits.js:184`, `ui/screens/crucible.js:2597`, `ui/screens/crucible.js:4039`, `ui/screens/crucible.js:4162`, `ui/screens/crucibleDraft.js:2361`, `ui/screens/localmap.js:887`, `ui/screens/manifest.js:223`, `ui/screens/replay.js:305`, `ui/screens/starmap.js:739`, `ui/screens/statistics.js:175`, `ui/screens/techTree.js:347`, `ui/swarmFortifyPanel.js:119`, `ui/swarmFortifyPanel.js:139` | `ui/uiRoot.js:1475` |
| `ui:prepareBombRack` | `systems/ships.js:3718`, `ui/station/screens/shipworks.js:5132` | `systems/bombs.js:724` |
| `ui:previewBombRackPreparation` | `systems/ships.js:3629`, `ui/station/screens/shipworks.js:4056`, `ui/station/screens/shipworks.js:5088` | `systems/bombs.js:721` |
| `ui:purchaseFrontierRumor` | `ui/station/screens/bar.js:909` | `systems/world.js:860` |
| `ui:purchaseSurveyData` | `ui/station/screens/bar.js:1087` | `systems/world.js:859` |
| `ui:pushScreen` | `main.js:634`, `systems/capitalBossRuntime.js:220`, `systems/story.js:1449`, `ui/loadingPresenter.js:478`, `ui/loadingPresenter.js:645`, `ui/mapAuthority.js:148`, `ui/pilotCards.js:573`, `ui/pilotCards.js:682`, `ui/screens/crucible.js:3798`, `ui/screens/crucible.js:3799`, `ui/screens/crucible.js:4196`, `ui/screens/crucibleDraft.js:92`, `ui/screens/crucibleDraft.js:1197`, `ui/screens/gameOver.js:554`, `ui/screens/starmap.js:747`, `ui/signalInvestigationPrompt.js:260`, `ui/station/barContacts.js:1000`, `ui/station/cinderDepartureConversation.js:117`, `ui/station/cinderReturnConversation.js:77`, `ui/station/furnaceDetailConversation.js:46`, `ui/station/heliosCampaignHandoff.js:167`, `ui/station/screens/bar.js:976`, `ui/station/screens/bar.js:1081`, `ui/station/screens/industry.js:719`, `ui/station/stationApp.js:627` | `ui/uiRoot.js:1451` |
| `ui:replaceScreen` | `ui/screens/crucible.js:4044`, `ui/screens/crucible.js:4169`, `ui/screens/crucible.js:4189`, `ui/screens/motionAsk.js:118` | `ui/uiRoot.js:1484` |
| `ui:restockBombRack` | — | `systems/bombs.js:717` |
| `ui:saveLoadoutPreset` | `ui/station/screens/shipworks.js:4999` | `systems/ships.js:2075` |
| `ui:screenTop` | `ui/screenManager.js:379` | `systems/onboarding.js:768`, `ui/bandHud.js:165`, `ui/comms.js:155`, `ui/kit/temperature.js:46`, `ui/wingmanRadial.js:359` |
| `ui:sell` | — | `systems/economy.js:1831` |
| `ui:sellModule` | — | `systems/ships.js:2052` |
| `ui:sellPayload` | `ui/station/screens/shipworks.js:5621` | `systems/bombs.js:716` |
| `ui:service` | `balance/careerCohorts.js:752`, `balance/courierPublicRoute.js:315`, `balance/hunterPublicRoute.js:389`, `balance/prospectorPublicRoute.js:305`, `ui/adventureDecisions.js:552`, `ui/station/stationApp.js:1240`, `ui/station/stationApp.js:1276` | `systems/economy.js:1923` |
| `ui:setActiveShip` | `ui/station/screens/shipworks.js:5276`, `ui/station/screens/shipworks.js:5421` | `systems/ships.js:2050` |
| `ui:setCourse` | `data/encounters/1210-the-deadweight.js:284`, `features/breakwaterSpur/runtime.js:300`, `features/breakwaterSpur/runtime.js:303`, `features/breakwaterSpur/runtime.js:308`, `features/cinderglassJob/runtime.js:349`, `features/cinderglassJob/runtime.js:369`, `features/rigWorkshop/jobs.js:339`, `features/rigWorkshop/jobs.js:347`, `features/rigWorkshop/jobs.js:360`, `features/rigWorkshop/runtime.js:332`, `features/rigWorkshop/runtime.js:484`, `features/salvageTender/runtime.js:384`, `features/shipbreakingYard/runtime.js:519`, `features/shipbreakingYard/runtime.js:525`, `systems/borrowedSun.js:608`, `systems/economy.js:5446`, `systems/economy.js:5473`, `systems/factionPresence.js:1730`, `systems/ilexArk.js:40`, `systems/missions.js:2425`, `systems/missions.js:2510`, `systems/palletJack.js:291`, `systems/redKite.js:61`, `systems/scanner.js:1669`, `systems/scanner.js:1701`, `systems/scanner.js:1797`, `systems/scanner.js:2025`, `systems/shipjack.js:428`, `systems/tallyThree.js:118`, `systems/towlineTable.js:34`, `ui/contactHailPrompt.js:212`, `ui/galaxyMap.js:3148`, `ui/galaxyMap.js:3163`, `ui/galaxyMap.js:9065`, `ui/market/tradeLogic.js:577`, `ui/radar.js:1825`, `ui/radar.js:1837`, `ui/screens/footprint.js:1677`, `ui/screens/footprint.js:1688`, `ui/screens/localmap.js:1222`, `ui/screens/starmap.js:1800`, `ui/screens/starmap.js:1813`, `ui/screens/starmap.js:1817`, `ui/station/cinderDepartureConversation.js:109`, `ui/station/cinderReturnConversation.js:81`, `ui/station/heliosCampaignHandoff.js:169` | `systems/world.js:794` |
| `ui:setShipAppearance` | `ui/screens/raceBoard.js:366`, `ui/station/screens/shipworks.js:4926` | `systems/ships.js:2079` |
| `ui:setShipName` | `ui/station/screens/shipworks.js:5334` | `systems/ships.js:2082` |
| `ui:shipjack` | `ui/blackFlag.js:86`, `ui/blackFlag.js:115`, `ui/blackFlag.js:118`, `ui/blackFlag.js:125`, `ui/blackFlag.js:212`, `ui/blackFlagRegistry.js:143`, `ui/blackFlagRegistry.js:146`, `ui/blackFlagRegistry.js:155` | — |
| `ui:standbyFeeChoose` | `ui/special500InvoicePrompt.js:65` | `systems/special500Invoice.js:71` |
| `ui:talkContact` | `ui/station/screens/bar.js:281` | `systems/fenceDesk.js:61`, `systems/special500PortraitBuoys.js:121`, `systems/special500Sommelier.js:26`, `systems/story.js:296` |
| `ui:targetNearestHostileToPlayer` | `combat/autoTargetMode.js:66`, `combat/autoTargetMode.js:256` | `ui/uiRoot.js:1495` |
| `ui:toast` | `features/counterweightCircuit/runtime.js:507`, `features/counterweightCircuit/runtime.js:551`, `systems/scanner.js:2022`, `systems/scanner.js:2028` | — |
| `ui:toggleCargo` | `ui/input.js:910` | — |
| `ui:toggleComms` | `ui/bandHud.js:236`, `ui/input.js:935` | — |
| `ui:toggleFieldBuild` | `ui/input.js:720` | `ui/uiRoot.js:939` |
| `ui:toggleOverview` | `ui/input.js:918` | — |
| `ui:trackMission` | `ui/galaxyMap.js:4998`, `ui/galaxyMap.js:5157`, `ui/screens/missionLog.js:2492`, `ui/screens/missionLog.js:2564`, `ui/screens/missionLog.js:2625`, `ui/station/cinderDepartureConversation.js:116`, `ui/station/furnaceDetailConversation.js:45`, `ui/station/heliosCampaignHandoff.js:166`, `ui/station/screens/contracts.js:1670` | `systems/missions.js:667` |
| `ui:transferParkedCargo` | `ui/station/screens/shipworks.js:5442` | — |
| `ui:undock` | — | `ui/input.js:1242` |
| `ui:unfitModule` | — | `systems/ships.js:2067` |
| `ui:unfitPayload` | `ui/station/screens/shipworks.js:5631` | `systems/bombs.js:715` |
| `ui:unlockTech` | `ui/screens/techTree.js:854` | `systems/ships.js:2078` |
| `ui:upgradeBombRack` | `ui/station/screens/shipworks.js:5255` | `systems/bombs.js:718` |
| `ui:wingOrder` | `ui/wingmanRadial.js:282` | `systems/automation.js:612` |
| `ui:wingmanRadial` | `ui/input.js:926` | `ui/wingmanRadial.js:353` |
| `understory:accessTier` | `systems/faction_understory.js:1325` | — |
| `understory:blacklisted` | `systems/faction_understory.js:1934` | — |
| `understory:buyCover` | — | `systems/faction_understory.js:722` |
| `understory:compostRunComplete` | `systems/faction_understory.js:1239` | — |
| `understory:coverBurned` | `systems/faction_understory.js:2000` | — |
| `understory:coverIssued` | `systems/faction_understory.js:1989` | — |
| `understory:debtChanged` | `systems/faction_understory.js:1363`, `systems/faction_understory.js:1380`, `systems/faction_understory.js:2076` | — |
| `understory:debtSquared` | `systems/faction_understory.js:1386` | — |
| `understory:dropCracked` | `systems/faction_understory.js:1701` | — |
| `understory:dropDelivered` | `systems/faction_understory.js:1638` | — |
| `understory:dropLapsed` | `systems/faction_understory.js:1568`, `systems/faction_understory.js:1578`, `systems/faction_understory.js:1611`, `systems/faction_understory.js:1619`, `systems/faction_understory.js:1679` | — |
| `understory:dropReturned` | `systems/faction_understory.js:1652` | — |
| `understory:dropStashed` | `systems/faction_understory.js:1490` | — |
| `understory:favor` | `systems/faction_understory.js:1320` | — |
| `understory:gardenFed` | `systems/faction_understory.js:1188` | — |
| `understory:gardenSeeded` | `systems/faction_understory.js:1109` | — |
| `understory:gardenStage` | `systems/faction_understory.js:1191` | — |
| `understory:markedStash` | `systems/faction_understory.js:1850` | — |
| `understory:noticeChanged` | `systems/faction_understory.js:1905`, `systems/faction_understory.js:1957` | — |
| `understory:payDebt` | — | `systems/faction_understory.js:723` |
| `understory:playerGrowth` | `systems/faction_understory.js:1070`, `systems/faction_understory.js:1189` | `systems/missions.js:729` |
| `understory:sporeSkin` | `systems/faction_understory.js:1307` | — |
| `understory:whisperPosted` | `systems/faction_understory.js:1723` | — |
| `understory:whisperVerified` | `systems/faction_understory.js:1796` | — |
| `uniqueLoot:choirBellPulse` | `systems/uniqueLootAbilities.js:395` | — |
| `uniqueLoot:nestbreakerSplit` | `systems/uniqueLootAbilities.js:333` | — |
| `uniqueLoot:paleCoilBlink` | `systems/uniqueLootAbilities.js:251` | — |
| `uniqueWreck:bearingFixed` | `systems/uniqueWrecks.js:1723` | `audio/audioSystem.js:3148`, `systems/missions.js:941`, `ui/discoveryPlate.js:206` |
| `uniqueWreck:blackBoxRecovered` | `systems/uniqueWrecks.js:1757` | — |
| `uniqueWreck:choiceBlocked` | `systems/uniqueWrecks.js:1885` | — |
| `uniqueWreck:choose` | `systems/missionObjectiveOps.js:1064`, `systems/uniqueWreckEncounterScripts.js:123`, `ui/recoveryEncounterPrompt.js:353` | — |
| `uniqueWreck:complicationScheduled` | `systems/uniqueWrecks.js:992` | — |
| `uniqueWreck:complicationTriggered` | `systems/uniqueWrecks.js:1013`, `systems/uniqueWrecks.js:1187`, `systems/uniqueWrecks.js:1375` | `systems/missions.js:942` |
| `uniqueWreck:decisionReady` | `systems/uniqueWrecks.js:1819` | `systems/missions.js:944`, `ui/recoveryEncounterPrompt.js:493` |
| `uniqueWreck:encounterActivated` | `systems/uniqueWrecks.js:1234` | `systems/missions.js:943` |
| `uniqueWreck:encounterCompleted` | `systems/uniqueWrecks.js:1264` | — |
| `uniqueWreck:encounterRequested` | `systems/uniqueWrecks.js:742`, `systems/uniqueWrecks.js:1189` | — |
| `uniqueWreck:resolved` | `systems/uniqueWrecks.js:2055` | `systems/missions.js:945`, `systems/traffic.js:1914`, `ui/recoveryEncounterPrompt.js:494` |
| `uniqueWreck:rumorHeard` | `systems/trafficJobOps.js:1146`, `ui/station/screens/bar.js:1030` | — |
| `uniqueWreck:rumorRecorded` | `systems/uniqueWrecks.js:863` | `systems/missions.js:940` |
| `uniqueWreck:salvaged` | `systems/uniqueWrecks.js:2056` | — |
| `uniqueWreck:scanBlocked` | `systems/uniqueWrecks.js:1702` | `systems/world.js:865` |
| `uniqueWreck:storyRewardDisposed` | `systems/uniqueWrecks.js:2147` | — |
| `uniqueWreck:storyRewardGranted` | `systems/uniqueWrecks.js:1984` | `systems/factions.js:357` |
| `v2:flavorPresented` | `systems/v2FlavorRuntime.js:388` | `systems/missions.js:841`, `ui/bandHud.js:156` |
| `vael:clauseDone` | `systems/faction_vael.js:1599` | — |
| `vael:clauseFailed` | `systems/faction_vael.js:1626` | — |
| `vael:clauseLapsed` | `systems/faction_vael.js:1636` | — |
| `vael:clausePosted` | `systems/faction_vael.js:1564` | — |
| `vael:clauseSigned` | `systems/faction_vael.js:1578` | — |
| `vael:debtorCollected` | `systems/faction_vael.js:1867` | — |
| `vael:debtorPosted` | `systems/faction_vael.js:1823` | — |
| `vael:debtorSkipped` | `systems/faction_vael.js:1744`, `systems/faction_vael.js:1751` | — |
| `vael:debtorTransferred` | `systems/faction_vael.js:1767` | — |
| `vael:hullScriptRead` | `systems/faction_vael.js:1321` | — |
| `vael:invoiceFiled` | `systems/faction_vael.js:970` | — |
| `vael:invoiceReminded` | `systems/faction_vael.js:1016` | — |
| `vael:invoiceSettled` | `systems/faction_vael.js:995` | — |
| `vael:ledgerFiled` | `systems/faction_vael.js:511` | — |
| `vael:lienClamped` | `systems/faction_vael.js:700` | — |
| `vael:lienCut` | `systems/faction_vael.js:883` | — |
| `vael:lienPaid` | `systems/faction_vael.js:852` | — |
| `vael:lienServed` | `systems/faction_vael.js:1691` | — |
| `vael:lienTelegraph` | `systems/faction_vael.js:652` | — |
| `vael:lienThrown` | `systems/faction_vael.js:736` | — |
| `vael:lienTransferred` | `systems/faction_vael.js:819` | — |
| `vael:marked` | `systems/faction_vael.js:1280` | — |
| `vael:milestone` | `systems/faction_vael.js:1881` | — |
| `vael:overrideThrust` | `systems/faction_vael.js:918` | — |
| `vael:pageNineArmed` | `systems/faction_vael.js:488` | — |
| `vael:pageTurned` | `systems/faction_vael.js:1899` | — |
| `vael:paperTier` | `systems/faction_vael.js:1603`, `systems/faction_vael.js:1861` | — |
| `vael:patrolHail` | `systems/faction_vael.js:1269` | — |
| `vael:patrolPosted` | `systems/faction_vael.js:1406` | — |
| `vael:patrolWithdrew` | `systems/faction_vael.js:1289` | — |
| `vael:reading` | `systems/faction_vael.js:1306` | — |
| `vael:riderLeft` | `systems/faction_vael.js:1347` | — |
| `vael:riderOpened` | `systems/faction_vael.js:1362` | — |
| `vael:writClosed` | `systems/faction_vael.js:1109` | — |
| `vael:writHullKilled` | `systems/faction_vael.js:1963` | — |
| `vael:writPosted` | `systems/faction_vael.js:1083` | — |
| `vael:writRecalled` | `systems/faction_vael.js:1119` | — |
| `vael:writServed` | `systems/faction_vael.js:1181` | — |
| `vael:writTelegraph` | `systems/faction_vael.js:1157` | — |
| `verb:used` | `systems/onboarding.js:5257` | — |
| `verge:appealDenied` | `systems/faction_verge.js:1854` | — |
| `verge:appealGranted` | `systems/faction_verge.js:1845` | — |
| `verge:checkpointChallenged` | `systems/faction_verge.js:740` | — |
| `verge:checkpointCleared` | `systems/faction_verge.js:727` | — |
| `verge:checkpointScan` | `systems/faction_verge.js:796` | — |
| `verge:courtConvened` | `systems/faction_verge.js:1759` | — |
| `verge:directive` | `systems/faction_verge.js:595`, `systems/faction_verge.js:1698` | — |
| `verge:directiveViolated` | `systems/faction_verge.js:1747` | — |
| `verge:escortBroken` | `systems/faction_verge.js:1122`, `systems/faction_verge.js:1540`, `systems/faction_verge.js:1610` | — |
| `verge:escortDemanded` | `systems/faction_verge.js:1041` | — |
| `verge:escortReleased` | `systems/faction_verge.js:1104` | — |
| `verge:incident` | `systems/faction_verge.js:551` | — |
| `verge:jurorWoke` | `systems/faction_verge.js:1881` | — |
| `verge:lawWoke` | `systems/worldPressure.js:281` | — |
| `verge:lineTrialPassed` | `systems/faction_verge.js:1904` | — |
| `verge:manifestFined` | `systems/faction_verge.js:705` | — |
| `verge:massWeighed` | `systems/faction_verge.js:678`, `systems/faction_verge.js:1794`, `systems/tare.js:192` | — |
| `verge:permitDenied` | `systems/faction_verge.js:983` | — |
| `verge:permitGranted` | `systems/faction_verge.js:977` | — |
| `verge:permitLapsed` | `systems/faction_verge.js:891` | — |
| `verge:permitReinstated` | `systems/faction_verge.js:1841` | — |
| `verge:permitSuspended` | `systems/faction_verge.js:1740` | — |
| `verge:pursuitCold` | `systems/faction_verge.js:1464` | — |
| `verge:pursuitCrossed` | `systems/faction_verge.js:1409`, `systems/faction_verge.js:1575`, `systems/faction_verge.js:1670` | — |
| `verge:pursuitEscaped` | `systems/faction_verge.js:1459` | — |
| `verge:pursuitIntercepted` | `systems/faction_verge.js:1437` | — |
| `verge:pursuitOpened` | `systems/faction_verge.js:1168`, `systems/faction_verge.js:1636` | — |
| `verge:pursuitResumed` | `systems/faction_verge.js:1380` | — |
| `verge:pursuitSubmitted` | `systems/faction_verge.js:1488` | — |
| `verge:scanLogged` | `systems/faction_verge.js:822` | — |
| `verge:treatmentChanged` | `systems/faction_verge.js:635` | — |
| `vesper:met` | `systems/vesper.js:205` | — |
| `vesper:note` | `systems/vesper.js:247` | — |
| `vesper:performance` | `systems/vesper.js:271` | — |
| `vesper:phraseProgress` | `systems/vesper.js:263` | — |
| `vesper:voice` | `systems/vesper.js:103`, `systems/vesper.js:189` | — |
| `vestaOreCache:cargoChanged` | `systems/world.js:8195` | — |
| `vestaOreCache:choose` | `ui/recoveryEncounterPrompt.js:373` | `systems/world.js:806` |
| `vestaOreCache:clueRecovered` | `systems/world.js:8016` | — |
| `vestaOreCache:decisionReady` | `systems/world.js:8047` | `ui/recoveryEncounterPrompt.js:495` |
| `vestaOreCache:pickupReady` | `systems/world.js:8158` | — |
| `vestaOreCache:resolved` | `systems/world.js:8115` | `ui/recoveryEncounterPrompt.js:496` |
| `voice:clear` | `ui/voiceArbiter.js:949`, `ui/voiceArbiter.js:996` | `ui/alerts.js:515` |
| `voice:dismiss` | `ui/bindings.js:104`, `ui/input.js:757` | `ui/voiceArbiter.js:428` |
| `voice:say` | `audio/audioSystem.js:3058`, `audio/audioSystem.js:5715`, `features/breakwaterSpur/runtime.js:113`, `features/salvageOutfits/presentation.js:96`, `systems/achievements.js:1027`, `systems/mines.js:148`, `systems/mines.js:332`, `systems/mines.js:505`, `systems/plants/afterHoursCoach.js:398`, `systems/plants/anselsDish.js:156`, `systems/plants/badMagnetPlant.js:144`, `systems/plants/borrowedBoost.js:339`, `systems/plants/carriedWord.js:360`, `systems/plants/chasedThiefPlant.js:351`, `systems/plants/darkStretchPlant.js:335`, `systems/plants/kidMechanic.js:157`, `systems/plants/kindChecker.js:277`, `systems/plants/loanerGunPlant.js:106`, `systems/plants/movingHousePlant.js:323`, `systems/plants/onTheCallPlant.js:109`, `systems/plants/ownFaultPlant.js:395`, `systems/plants/pl107EmptySlot.js:124`, `systems/plants/pl129SomebodysCrate.js:110`, `systems/plants/pl171RattleInB.js:125`, `systems/plants/pl172ShadeMarket.js:215`, `systems/plants/pl179KesslersNumber.js:112`, `systems/plants/pl183TheWeather.js:146`, `systems/plants/pl192AgainMaybe.js:110`, `systems/plants/pl214PyrrhaBox.js:246`, `systems/plants/pl257GutterRun.js:250`, `systems/plants/pl260FiftiethVisit.js:111`, `systems/plants/pl333NoQuestionsShelf.js:278`, `systems/plants/pl334WindBreakChain.js:210`, `systems/plants/pl335DawnLine.js:242`, `systems/plants/pl336LampKeeper.js:164`, `systems/plants/pl337HonorUrn.js:181`, `systems/plants/pl338TowPost.js:173`, `systems/plants/pl339SignalMirror.js:192`, `systems/plants/pl340EchoCount.js:191`, `systems/plants/pl341RestringBuoys.js:209`, `systems/plants/pl342BleedVent.js:179`, `systems/plants/pl343LiftBell.js:192`, `systems/plants/pl344NeedsList.js:216`, `systems/plants/pl345KettleWindow.js:181`, `systems/plants/pl346FixedRope.js:214`, `systems/plants/pl347SmallHullDrum.js:215`, `systems/plants/pl348SeamKitchen.js:203`, `systems/plants/pl349MercyTug.js:208`, `systems/plants/pl350KeyWall.js:238`, `systems/plants/pl351SamplePad.js:242`, `systems/plants/pl352ChalkedName.js:226`, `systems/plants/pl353CleanStamp.js:200`, `systems/plants/pl355TheUnit.js:139`, `systems/plants/pl362NameOnPlate.js:208`, `systems/plants/pl362NameOnPlate.js:232`, `systems/plants/rescueDividend.js:455`, `systems/plants/reversedRobberyPlant.js:186`, `systems/plants/spareBed.js:377`, `systems/plants/sponsorshipPlant.js:190`, `systems/plants/umbrellaCrane.js:385`, `systems/plants/veteranTapPlant.js:130`, `systems/survivalAnnounce.js:539`, `systems/survivalAnnounce.js:1199`, `systems/world.js:977`, `systems/world.js:999`, `ui/alerts.js:379`, `ui/hud.js:684` | `ui/voiceArbiter.js:427` |
| `voice:surface` | `ui/voiceArbiter.js:954`, `ui/voiceArbiter.js:1006` | `audio/audioSystem.js:3408`, `systems/barkDirector.js:882`, `systems/heliosCuttingCourtesy.js:84`, `systems/heliosSharedCut.js:57`, `systems/story.js:183`, `ui/alerts.js:514`, `ui/voiceArbiter.js:538` |
| `vultures:departed` | — | `systems/barkDirector.js:899` |
| `vultures:dispatch` | — | `systems/barkDirector.js:897` |
| `vultures:race` | — | `systems/barkDirector.js:898` |
| `warrant:acceptPayment` | `ui/warrantOfferPrompt.js:93` | — |
| `watch:changed` | `ui/entityLinks.js:285`, `ui/entityLinks.js:329` | `ui/watchlistHud.js:89` |
| `weapons:debrisOrbitClaimed` | `systems/weapons.js:2633` | — |
| `weapons:inertialShunt` | `systems/weapons.js:628` | `ui/stuntCallout.js:1057` |
| `weapons:mineArmed` | `systems/weapons.js:2315` | `audio/audioSystem.js:3028` |
| `weapons:mineDeployed` | `systems/weapons.js:2272` | `render/vfx.js:2992` |
| `weapons:mineDetonated` | `systems/weapons.js:2399` | — |
| `weapons:mineExpired` | `systems/weapons.js:2309` | `render/vfx.js:2993`, `systems/presentationOrchestrator.js:286` |
| `weapons:momentumSinkPlanted` | `systems/weapons.js:594` | `audio/audioSystem.js:3061` |
| `weapons:momentumSinkReleased` | `systems/weapons.js:1862` | `audio/audioSystem.js:3062` |
| `weapons:mortarDetonated` | `systems/weapons.js:2533` | — |
| `weapons:mortarLanded` | `systems/weapons.js:2471` | — |
| `weapons:vent` | `systems/weapons.js:1075`, `systems/weapons.js:1095` | `audio/audioSystem.js:3168`, `render/shipMicroMotion.js:1751`, `render/vfx.js:3052`, `systems/ships.js:2130` |
| `weather:ionBlackout` | `systems/environmentalMachinery.js:1688`, `systems/environmentalMachinery.js:1885` | — |
| `web:linked` | `combat/tetherWebs.js:161` | — |
| `weighing:overMass` | `data/encounters/700-the-weighing.js:232` | — |
| `well:capture` | `systems/fields.js:2852` | — |
| `well:fling` | `systems/fields.js:2777` | `systems/flightV3.js:226`, `ui/stuntCallout.js:1055` |
| `well:grind` | `systems/fields.js:2436` | `systems/impulseCharges.js:235` |
| `well:haulerDragged` | `systems/fields.js:2721` | `systems/traffic.js:1913` |
| `wexTicket:found` | `systems/wexTicket.js:125` | — |
| `wingMorale:broken` | `systems/wingMorale.js:289` | — |
| `wingMorale:enraged` | `systems/wingMorale.js:398` | — |
| `wingMorale:reinforcementBlocked` | `systems/wingMorale.js:426` | — |
| `wingOrder:accepted` | `systems/automation.js:2705` | `systems/wingmen.js:170` |
| `wingOrder:blocked` | `systems/automation.js:2706` | `ui/wingmanRadial.js:363` |
| `wingOrder:converted` | `systems/wingmen.js:781` | `ui/wingmanRadial.js:369` |
| `wingOrder:status` | `systems/automation.js:2707` | `ui/wingmanRadial.js:373` |
| `wingmen:gap` | `systems/wingmen.js:338` | — |
| `world:abortJumpCharge` | `systems/story.js:998`, `ui/comms.js:818` | `systems/world.js:791` |
| `world:confirmUnfiledJump` | `systems/story.js:253` | `systems/world.js:790` |
| `world:courtRulingRecorded` | `systems/world.js:723` | — |
| `world:criticalSpawnDeferred` | `systems/world.js:2551`, `systems/world.js:5127` | — |
| `world:farActorRestored` | `world/farActorTable.js:1243` | `systems/npcJobsRuntime.js:1179`, `systems/traffic.js:1872` |
| `world:farActorShelved` | `world/farActorTable.js:1189` | `systems/npcJobsRuntime.js:1178`, `systems/traffic.js:1871` |
| `world:membership` | `systems/world.js:1387` | `systems/presentationOrchestrator.js:191` |
| `world:originShift` | `systems/world.js:6582` | — |
| `world:playerRelocated` | `systems/world.js:5273` | `core/coreSystem.js:568`, `render/vfx.js:3016` |
| `world:requestJump` | `systems/story.js:982`, `ui/galaxyMap.js:3142`, `ui/screens/starmap.js:1812` | `systems/world.js:788` |
| `world:requestRoute` | `ui/galaxyMap.js:3161`, `ui/galaxyMap.js:5174`, `ui/galaxyMap.js:9063`, `ui/screens/starmap.js:1799`, `ui/screens/starmap.js:1816` | `systems/world.js:792` |
| `world:requestSectorScan` | `ui/galaxyMap.js:7462` | `systems/world.js:793` |
| `world:requestUnfiledJump` | `systems/story.js:950` | `systems/world.js:789` |
| `world:residency` | `systems/world.js:1607`, `systems/world.js:1674`, `systems/world.js:2792` | — |
| `world:spawnLimited` | `systems/world.js:5042` | — |
| `world:stuckCleared` | `systems/world.js:7730` | — |
| `world:stuckTowAccept` | `ui/stuckTowPrompt.js:52` | `systems/world.js:920` |
| `world:stuckTowOffer` | `systems/world.js:7763` | `ui/stuckTowPrompt.js:23` |
| `world:zoneEntered` | `systems/world.js:6609` | `data/hazardLanguage.js:176` |
| `world:zoneExited` | `systems/world.js:6623` | `data/hazardLanguage.js:177` |
| `worldPressure:auditAnnounced` | `systems/worldPressure.js:237` | `systems/missions.js:750` |
| `worldPressure:auditDelayed` | `systems/worldPressure.js:352` | — |
| `worldPressure:colossusRemains` | `systems/worldPressure.js:381` | — |
| `worldPressure:gateClosed` | `systems/worldPressure.js:278` | `systems/missions.js:751` |
| `worldPressure:scaffoldSpawned` | `systems/worldPressure.js:437` | — |
| `worldPressure:slowGray` | `systems/worldPressure.js:300` | — |
| `worldPressure:tideChanged` | `systems/worldPressure.js:208` | — |
| `worldSite:failureReceipt` | `systems/asteroidSites.js:1386` | `systems/presentationOrchestrator.js:300` |
| `worldSite:operationReceipt` | `systems/asteroidSites.js:1270` | `audio/worldFeelSeams.js:446`, `systems/economy.js:1815`, `systems/presentationOrchestrator.js:301`, `systems/traffic.js:2009` |
| `wreckCourt:action` | `ui/physicalJobsPrompt.js:33` | — |
| `wreckCourt:lawFact` | `systems/wreckCourt.js:1031` | `systems/heat.js:357` |
| `wreckCourt:opened` | `systems/wreckCourt.js:950` | — |
| `wreckCourt:result` | `systems/wreckCourt.js:894` | — |
| `wreckCourt:ruled` | `systems/wreckCourt.js:1032` | — |
| `wreckCourt:worldFact` | `systems/wreckCourt.js:1030` | `systems/world.js:716` |
| `wreckEcology:decayed` | `systems/aftermathWrecks.js:3558` | — |
| `wreckEcology:departed` | `systems/aftermathWrecks.js:1619` | `systems/barkDirector.js:896` |
| `wreckEcology:rivalPressured` | `systems/aftermathWrecks.js:1580` | `systems/barkDirector.js:895` |
| `wreckEcology:scavenged` | `systems/aftermathWrecks.js:1662` | `systems/barkDirector.js:894` |
| `wreckEcology:seeded` | `systems/aftermathWrecks.js:3239` | — |
| `wreckEcology:spawned` | `systems/aftermathWrecks.js:3461` | `systems/npcJobsRuntime.js:1209` |
| `wreckField:source` | `systems/factionPresence.js:1178`, `systems/salvage.js:595`, `systems/uniqueWrecks.js:1594` | `systems/aftermathWrecks.js:1257` |
| `wreckMarket:rates` | `systems/rookBooth.js:460` | — |
| `wreckMission:choiceApplied` | `systems/missionObjectiveOps.js:1503` | — |
| `wreckMission:choose` | `ui/wreckChoicePrompt.js:165` | `systems/missions.js:921` |

## Events with no statically indexed emitter

- `aceMemory:transition` — 3 subscriber(s)
- `achievement:unlocked` — 1 subscriber(s)
- `ai:reinforcementScheduled` — 1 subscriber(s)
- `ai:stateChange` — 2 subscriber(s)
- `alienEcology:nurseryBloom` — 1 subscriber(s)
- `alienEcology:nurseryPowered` — 1 subscriber(s)
- `alienEcology:relaySevered` — 1 subscriber(s)
- `alienEcology:relocateSite` — 1 subscriber(s)
- `barkDirector:silence` — 1 subscriber(s)
- `beacon:deploy` — 1 subscriber(s)
- `body:sled` — 1 subscriber(s)
- `capitalBoss:actChanged` — 1 subscriber(s)
- `capitalBoss:countered` — 1 subscriber(s)
- `capitalBoss:disarmed` — 1 subscriber(s)
- `capitalBoss:ended` — 2 subscriber(s)
- `capitalBoss:hit` — 1 subscriber(s)
- `capitalBoss:recovery` — 1 subscriber(s)
- `capitalBoss:started` — 1 subscriber(s)
- `capitalBoss:telegraph` — 2 subscriber(s)
- `chronicler:radio` — 1 subscriber(s)
- `chronicler:recall` — 1 subscriber(s)
- `claim:defenseDelegate` — 1 subscriber(s)
- `claim:defenseGo` — 1 subscriber(s)
- `claim:defenseIgnore` — 1 subscriber(s)
- `combat:bankShot` — 1 subscriber(s)
- `combat:chainKill` — 1 subscriber(s)
- `combat:crushed` — 1 subscriber(s)
- `combat:hitstunImpulse` — 2 subscriber(s)
- `combat:requestAction` — 1 subscriber(s)
- `combat:shockwavePass` — 2 subscriber(s)
- `combat:subsystemDisabled` — 10 subscriber(s)
- `combat:surrendered` — 2 subscriber(s)
- `custody:aftermathChanged` — 1 subscriber(s)
- `custody:aftermathSettled` — 1 subscriber(s)
- `customs:massSlipFiled` — 1 subscriber(s)
- `customs:scanAborted` — 1 subscriber(s)
- `customs:scanWaived` — 1 subscriber(s)
- `customs:trustMarked` — 1 subscriber(s)
- `customs:weirBolt` — 2 subscriber(s)
- `deniable:fenceBurned` — 1 subscriber(s)
- `deniable:fenceEmboldened` — 1 subscriber(s)
- `drone:grindStop` — 1 subscriber(s)
- `encounter:ambientPredationCleared` — 1 subscriber(s)
- `encounter:ambientPredationTelegraph` — 1 subscriber(s)
- `encounter:predationTelegraph` — 1 subscriber(s)
- `endgame:loopBack` — 1 subscriber(s)
- `environment:detonated` — 1 subscriber(s)
- `environment:fractured` — 1 subscriber(s)
- `fence:routeLegDue` — 1 subscriber(s)
- `fence:scrubAsk` — 1 subscriber(s)
- `freight:clear` — 1 subscriber(s)
- `freight:departed` — 1 subscriber(s)
- `freight:recovery` — 2 subscriber(s)
- `freight:recoveryAbandoned` — 2 subscriber(s)
- `freight:warning` — 1 subscriber(s)
- `frontier:homesteadRaised` — 1 subscriber(s)
- `gyre:absorbTick` — 1 subscriber(s)
- `gyre:ballGrave` — 1 subscriber(s)
- `gyre:beamOn` — 1 subscriber(s)
- `gyre:caught` — 1 subscriber(s)
- `gyre:dropped` — 1 subscriber(s)
- `gyre:full` — 1 subscriber(s)
- `gyre:fuseLow` — 1 subscriber(s)
- `gyre:snagged` — 1 subscriber(s)
- `gyre:strained` — 1 subscriber(s)
- `gyre:thrown` — 1 subscriber(s)
- `gyre:windup` — 1 subscriber(s)
- `heat:clear` — 1 subscriber(s)
- `heist:requestLaunchSchedule` — 1 subscriber(s)
- `impoundLot:deskAnswered` — 1 subscriber(s)
- `lanternWard:serviceCommitted` — 1 subscriber(s)
- `law:audit` — 1 subscriber(s)
- `law:custodyAcknowledged` — 1 subscriber(s)
- `law:custodyTransfer` — 2 subscriber(s)
- `law:dispatchStarted` — 1 subscriber(s)
- `law:distressRaised` — 1 subscriber(s)
- `law:fineAssessed` — 3 subscriber(s)
- `law:fineRefused` — 1 subscriber(s)
- `law:impoundPayOffer` — 1 subscriber(s)
- `law:impoundPayRefused` — 1 subscriber(s)
- `law:impoundPosted` — 1 subscriber(s)
- `law:impoundRecovered` — 3 subscriber(s)
- `law:impoundReleased` — 1 subscriber(s)
- `law:impoundWorked` — 1 subscriber(s)
- `law:incidentOpened` — 3 subscriber(s)
- `law:incidentResolved` — 1 subscriber(s)
- `law:killedAdjudicated` — 1 subscriber(s)
- `law:obligationNoted` — 1 subscriber(s)
- `law:obligationPaid` — 2 subscriber(s)
- `law:playerSurrender` — 1 subscriber(s)
- `law:reportIncidentReceipt` — 3 subscriber(s)
- `law:response` — 1 subscriber(s)
- `law:responseDeferred` — 1 subscriber(s)
- `law:sanctuaryWithdrawal` — 1 subscriber(s)
- `law:sponsorPay` — 1 subscriber(s)
- `law:sponsorSettled` — 1 subscriber(s)
- `law:wantedCheckpointBroken` — 1 subscriber(s)
- `law:wantedCheckpointPosted` — 1 subscriber(s)
- `law:wantedSweepEscaped` — 1 subscriber(s)
- `law:wantedWarrantPosted` — 1 subscriber(s)
- `law:wantedWarrantReleased` — 1 subscriber(s)
- `law:witnessChoice` — 1 subscriber(s)
- `lawfulInspection:offered` — 1 subscriber(s)
- `lawfulInspection:resolved` — 1 subscriber(s)
- `lawfulInspection:scanning` — 1 subscriber(s)
- `mission:abandoned` — 1 subscriber(s)
- `moment:holyShit` — 2 subscriber(s)
- `namedAce:fled` — 1 subscriber(s)
- `nav:abortRoute` — 1 subscriber(s)
- `nav:routeBrake` — 1 subscriber(s)
- `npcjobs:approach` — 1 subscriber(s)
- `npcjobs:arrived` — 1 subscriber(s)
- `npcjobs:complete` — 2 subscriber(s)
- `npcjobs:cycle` — 2 subscriber(s)
- `npcjobs:depart` — 1 subscriber(s)
- `npcjobs:hold` — 1 subscriber(s)
- `npcjobs:load` — 2 subscriber(s)
- `npcjobs:unload` — 2 subscriber(s)
- `npcjobs:work` — 1 subscriber(s)
- `optic:rekindled` — 1 subscriber(s)
- `physics:authorityStalled` — 1 subscriber(s)
- `physics:contactsCompleted` — 2 subscriber(s)
- `pirateDisengage:surrenderOffer` — 1 subscriber(s)
- `pirateDisengage:yieldResolved` — 1 subscriber(s)
- `pirateParley:resolved` — 2 subscriber(s)
- `pirateParley:started` — 1 subscriber(s)
- `postEndingReplay:cycleCompleted` — 2 subscriber(s)
- `projectile:bank` — 1 subscriber(s)
- `projectile:ricochet` — 1 subscriber(s)
- `race:abort` — 1 subscriber(s)
- `race:launchFailed` — 1 subscriber(s)
- `race:reset` — 1 subscriber(s)
- `regionalEcology:applied` — 1 subscriber(s)
- `regionalEcology:changed` — 1 subscriber(s)
- `run:arenaIntroComplete` — 1 subscriber(s)
- `run:awarded` — 1 subscriber(s)
- `run:circuitChoiceApplied` — 1 subscriber(s)
- `run:circuitChoiceRequested` — 1 subscriber(s)
- `run:draftLockRequested` — 1 subscriber(s)
- `run:draftRerollRequested` — 1 subscriber(s)
- `run:draftResolved` — 2 subscriber(s)
- `run:ended` — 22 subscriber(s)
- `run:levelUp` — 2 subscriber(s)
- `run:modifierChosen` — 1 subscriber(s)
- `run:modifierRecorded` — 1 subscriber(s)
- `run:openingLessonReleased` — 3 subscriber(s)
- `run:pilotCardRequested` — 1 subscriber(s)
- `run:pilotRerollRequested` — 1 subscriber(s)
- `run:refitChanged` — 1 subscriber(s)
- `run:refitClosed` — 1 subscriber(s)
- `run:refitFitRequested` — 1 subscriber(s)
- `run:refitSellRequested` — 1 subscriber(s)
- `run:refitStripRequested` — 1 subscriber(s)
- `run:resultsReady` — 2 subscriber(s)
- `run:retireRequested` — 1 subscriber(s)
- `run:spendRejected` — 2 subscriber(s)
- `run:spent` — 2 subscriber(s)
- `run:started` — 19 subscriber(s)
- `run:swarmDeepContinued` — 1 subscriber(s)
- `run:threatRequested` — 1 subscriber(s)
- `run:transitioned` — 6 subscriber(s)
- `run:waveCleared` — 7 subscriber(s)
- `run:waveIntroComplete` — 1 subscriber(s)
- `run:waveMaterialized` — 1 subscriber(s)
- `run:wavePlanFailed` — 1 subscriber(s)
- `run:wavePlanned` — 8 subscriber(s)
- `run:waveProgress` — 1 subscriber(s)
- `run:waveStarted` — 7 subscriber(s)
- `salvage:ventReactor` — 1 subscriber(s)
- `save:durabilitySettled` — 1 subscriber(s)
- `sectorWonder:secured` — 1 subscriber(s)
- `signal:investigate` — 1 subscriber(s)
- `signal:track` — 1 subscriber(s)
- `story:stuntIncidentRecorded` — 2 subscriber(s)
- `story:stuntIncidentUpdated` — 2 subscriber(s)
- `stunt:trickAmended` — 5 subscriber(s)
- `stunt:trickDetected` — 8 subscriber(s)
- `surrender:escaped` — 1 subscriber(s)
- `surrender:secured` — 1 subscriber(s)
- `surrender:tethered` — 1 subscriber(s)
- `survivalArena:installed` — 2 subscriber(s)
- `survivalArena:released` — 1 subscriber(s)
- `survivorPod:ransomed` — 1 subscriber(s)
- `survivorPod:rescued` — 2 subscriber(s)
- `survivorpod:barrel` — 1 subscriber(s)
- `survivorpod:crashcollar` — 1 subscriber(s)
- `survivorpod:lamp` — 1 subscriber(s)
- `survivorpod:mast` — 1 subscriber(s)
- `survivorpod:nose` — 1 subscriber(s)
- `survivorpod:retroblock` — 1 subscriber(s)
- `survivorpod:viewportglass` — 1 subscriber(s)
- `survivorpod:viewportring` — 1 subscriber(s)
- `swarm:affix` — 1 subscriber(s)
- `swarm:bossDown` — 2 subscriber(s)
- `swarm:bossHp` — 1 subscriber(s)
- `swarm:bossIntro` — 1 subscriber(s)
- `swarm:callinQueued` — 1 subscriber(s)
- `swarm:chain` — 6 subscriber(s)
- `swarm:chainBest` — 1 subscriber(s)
- `swarm:chainBroken` — 5 subscriber(s)
- `swarm:chainShatter` — 1 subscriber(s)
- `swarm:chainTier` — 1 subscriber(s)
- `swarm:cryoWeather` — 1 subscriber(s)
- `swarm:fortifyBuildResolved` — 1 subscriber(s)
- `swarm:fortifyState` — 1 subscriber(s)
- `swarm:hiveSacKilled` — 1 subscriber(s)
- `swarm:killPopup` — 1 subscriber(s)
- `swarm:openingBeatEnded` — 1 subscriber(s)
- `swarm:overdrive` — 2 subscriber(s)
- `swarm:perkTrigger` — 1 subscriber(s)
- `swarm:pressureSpend` — 1 subscriber(s)
- `swarm:pressureTelegraph` — 1 subscriber(s)
- `swarm:roundClear` — 1 subscriber(s)
- `swarm:roundSlam` — 1 subscriber(s)
- `swarm:stallReleased` — 1 subscriber(s)
- `swarm:stormDischarge` — 1 subscriber(s)
- `swarm:supplyCollected` — 1 subscriber(s)
- `swarmrepair:crossbar` — 2 subscriber(s)
- `swarmrepair:flange` — 1 subscriber(s)
- `swarmrepair:weldseam` — 1 subscriber(s)
- `tether:detached` — 1 subscriber(s)
- `title:holdResolved` — 1 subscriber(s)
- `traffic:ceresCausalChain` — 1 subscriber(s)
- `traffic:nearMiss` — 1 subscriber(s)
- `travelLanes:slingRingPass` — 1 subscriber(s)
- `ui:buy` — 1 subscriber(s)
- `ui:buyModule` — 2 subscriber(s)
- `ui:convoyShareBuy` — 1 subscriber(s)
- `ui:endgameConfirm` — 1 subscriber(s)
- `ui:endgameUnfiledJumpConfirm` — 1 subscriber(s)
- `ui:fitModule` — 2 subscriber(s)
- `ui:forwardSlipBuy` — 1 subscriber(s)
- `ui:heliosBay7Scan` — 1 subscriber(s)
- `ui:restockBombRack` — 1 subscriber(s)
- `ui:sell` — 1 subscriber(s)
- `ui:sellModule` — 1 subscriber(s)
- `ui:undock` — 1 subscriber(s)
- `ui:unfitModule` — 1 subscriber(s)
- `understory:buyCover` — 1 subscriber(s)
- `understory:payDebt` — 1 subscriber(s)
- `vultures:departed` — 1 subscriber(s)
- `vultures:dispatch` — 1 subscriber(s)
- `vultures:race` — 1 subscriber(s)

## Events with no statically indexed subscriber

- `aftermath:causeExhausted` — 1 emitter(s)
- `aftermath:causeRecorded` — 1 emitter(s)
- `aftermath:custodyFreight` — 1 emitter(s)
- `aftermath:custodySurvivor` — 1 emitter(s)
- `aftermath:remedied` — 1 emitter(s)
- `aftermathWreck:siteUnavailable` — 1 emitter(s)
- `ai:egressExit` — 2 emitter(s)
- `ai:encounterCommand` — 1 emitter(s)
- `ai:mayday` — 1 emitter(s)
- `ai:ventPress` — 1 emitter(s)
- `alienEcology:cystRupture` — 1 emitter(s)
- `alienEcology:vented` — 1 emitter(s)
- `ambush:clauseDecided` — 1 emitter(s)
- `ambush:clauseFired` — 1 emitter(s)
- `archive:amnesty` — 2 emitter(s)
- `archive:annotated` — 1 emitter(s)
- `archive:cited` — 1 emitter(s)
- `archive:copyPublished` — 1 emitter(s)
- `archive:copySuppressed` — 1 emitter(s)
- `archive:courierArrived` — 1 emitter(s)
- `archive:courierHail` — 1 emitter(s)
- `archive:courierSpawn` — 1 emitter(s)
- `archive:deskRefused` — 1 emitter(s)
- `archive:errandExpired` — 3 emitter(s)
- `archive:errandPosted` — 2 emitter(s)
- `archive:errandSettled` — 1 emitter(s)
- `archive:expunged` — 2 emitter(s)
- `archive:fieldCastSpawn` — 1 emitter(s)
- `archive:fileCirculated` — 2 emitter(s)
- `archive:folioBought` — 1 emitter(s)
- `archive:folioRecovered` — 1 emitter(s)
- `archive:indexFiled` — 1 emitter(s)
- `archive:indexRead` — 1 emitter(s)
- `archive:logCopied` — 1 emitter(s)
- `archive:markForgiven` — 1 emitter(s)
- `archive:marked` — 1 emitter(s)
- `archive:penance` — 1 emitter(s)
- `archive:redacted` — 1 emitter(s)
- `archive:redactionLifted` — 1 emitter(s)
- `archive:suppressOffered` — 1 emitter(s)
- `archive:tier` — 1 emitter(s)
- `audio:outputDeviceChanged` — 1 emitter(s)
- `automation:assetResumed` — 1 emitter(s)
- `automation:droneDistressed` — 1 emitter(s)
- `automation:droneRecovered` — 1 emitter(s)
- `automation:fleetChanged` — 10 emitter(s)
- `automation:incomeCredited` — 5 emitter(s)
- `automation:interact` — 1 emitter(s)
- `automation:outpostsChanged` — 11 emitter(s)
- `automation:programInterrupted` — 3 emitter(s)
- `automation:reactionAssigned` — 1 emitter(s)
- `automation:reactionCleared` — 1 emitter(s)
- `band:bearingRequest` — 1 emitter(s)
- `band:cycle` — 1 emitter(s)
- `band:tune` — 1 emitter(s)
- `bark:triggered` — 3 emitter(s)
- `beam:repaired` — 1 emitter(s)
- `beam:transferred` — 1 emitter(s)
- `bombs:denied` — 8 emitter(s)
- `bombs:redirected` — 1 emitter(s)
- `bombs:stockChanged` — 3 emitter(s)
- `borrowedSun:charter` — 1 emitter(s)
- `borrowedSun:collectorsOut` — 1 emitter(s)
- `borrowedSun:contract` — 1 emitter(s)
- `borrowedSun:contractAccepted` — 1 emitter(s)
- `borrowedSun:contractClosed` — 2 emitter(s)
- `borrowedSun:debtEscalated` — 2 emitter(s)
- `borrowedSun:debtPosted` — 1 emitter(s)
- `borrowedSun:debtSettle` — 1 emitter(s)
- `borrowedSun:debtSettled` — 3 emitter(s)
- `borrowedSun:deed` — 1 emitter(s)
- `borrowedSun:freightPosted` — 1 emitter(s)
- `borrowedSun:leaseBeat` — 1 emitter(s)
- `borrowedSun:leaseBuy` — 1 emitter(s)
- `borrowedSun:leaseClosed` — 1 emitter(s)
- `borrowedSun:leaseSold` — 1 emitter(s)
- `borrowedSun:levy` — 1 emitter(s)
- `borrowedSun:lost` — 1 emitter(s)
- `borrowedSun:notice` — 1 emitter(s)
- `borrowedSun:record` — 1 emitter(s)
- `borrowedSun:regard` — 1 emitter(s)
- `borrowedSun:route` — 1 emitter(s)
- `borrowedSun:sailDeployed` — 1 emitter(s)
- `borrowedSun:sailLost` — 1 emitter(s)
- `borrowedSun:shadowFilled` — 1 emitter(s)
- `borrowedSun:shadowLapsed` — 2 emitter(s)
- `borrowedSun:shadowPosted` — 1 emitter(s)
- `borrowedSun:shadowProgress` — 1 emitter(s)
- `borrowedSun:wash` — 1 emitter(s)
- `borrowedVoice:disposition` — 1 emitter(s)
- `borrowedVoice:dispositionAccepted` — 1 emitter(s)
- `borrowedVoice:fragmentRecovered` — 1 emitter(s)
- `bouncer:banned` — 1 emitter(s)
- `bouncer:ejected` — 1 emitter(s)
- `bouncer:muscleHired` — 1 emitter(s)
- `bouncer:muscleShove` — 1 emitter(s)
- `bouncer:muscleStandDown` — 1 emitter(s)
- `bouncer:offense` — 1 emitter(s)
- `bouncer:vipDischarge` — 1 emitter(s)
- `bouncer:vipEarned` — 1 emitter(s)
- `bouncer:wanted` — 1 emitter(s)
- `bouncer:wantedCleared` — 1 emitter(s)
- `bouncer:warned` — 1 emitter(s)
- `bracket:bank` — 1 emitter(s)
- `bracket:matchFinished` — 1 emitter(s)
- `bracket:matchStarted` — 1 emitter(s)
- `bracket:save` — 1 emitter(s)
- `bracket:shotResolved` — 1 emitter(s)
- `bracket:voice` — 1 emitter(s)
- `calendar:festival` — 1 emitter(s)
- `calendar:marketDay` — 1 emitter(s)
- `calendar:rushHour` — 1 emitter(s)
- `calendar:stormSeason` — 1 emitter(s)
- `callout:firstBeat` — 1 emitter(s)
- `camera:shake` — 21 emitter(s)
- `camera:zoom` — 5 emitter(s)
- `capitalBoss:actRetried` — 1 emitter(s)
- `capitalBoss:detach` — 1 emitter(s)
- `capitalBoss:plateTorn` — 1 emitter(s)
- `capitalBoss:telegraphEnd` — 3 emitter(s)
- `captain:remembered` — 1 emitter(s)
- `cargo:breakwaterFreightAccepted` — 1 emitter(s)
- `cargo:cinderglassReceived` — 1 emitter(s)
- `cargo:fragileLost` — 1 emitter(s)
- `cargo:hotDockSpill` — 1 emitter(s)
- `cargo:jettison` — 1 emitter(s)
- `cargo:parkedTransfer` — 1 emitter(s)
- `cargo:persistentAdded` — 1 emitter(s)
- `cargo:radiationCooked` — 1 emitter(s)
- `cargo:tallyThreeDelivered` — 1 emitter(s)
- `cargo:vesselFreightReleased` — 1 emitter(s)
- `cargo:volatileCorrosive` — 1 emitter(s)
- `cargo:volatileCryo` — 1 emitter(s)
- `cargo:volatileExposed` — 1 emitter(s)
- `cargo:volatileRupture` — 1 emitter(s)
- `cargo:volatileVent` — 1 emitter(s)
- `ceresNinthMouth:rescueCommitted` — 1 emitter(s)
- `ceresWorkfleet:interrupted` — 1 emitter(s)
- `chain:primeEnded` — 1 emitter(s)
- `chain:primed` — 1 emitter(s)
- `chain:tetherShare` — 2 emitter(s)
- `charge:armed` — 1 emitter(s)
- `choir:bellHeadRing` — 1 emitter(s)
- `choir:bellPulse` — 1 emitter(s)
- `choir:blessing` — 1 emitter(s)
- `choir:blessingEnded` — 1 emitter(s)
- `choir:circuitComplete` — 1 emitter(s)
- `choir:crystalShattered` — 1 emitter(s)
- `choir:devotionalYield` — 1 emitter(s)
- `choir:escortComplete` — 1 emitter(s)
- `choir:escortRequest` — 1 emitter(s)
- `choir:heresyLapsed` — 2 emitter(s)
- `choir:heresyMarked` — 1 emitter(s)
- `choir:heresyResolved` — 1 emitter(s)
- `choir:offering` — 1 emitter(s)
- `choir:pilgrimArrived` — 1 emitter(s)
- `choir:pilgrimLeg` — 1 emitter(s)
- `choir:pilgrimLost` — 1 emitter(s)
- `choir:pilgrimSpawn` — 1 emitter(s)
- `choir:pilgrimVisit` — 1 emitter(s)
- `choir:relicAlarm` — 1 emitter(s)
- `choir:relicCracked` — 1 emitter(s)
- `choir:relicPing` — 1 emitter(s)
- `choir:sacrilege` — 1 emitter(s)
- `choir:sanctuary` — 2 emitter(s)
- `choir:siteRaised` — 2 emitter(s)
- `choir:titheAssessed` — 1 emitter(s)
- `choir:tithePaid` — 1 emitter(s)
- `choir:tribute` — 1 emitter(s)
- `cinderglassJob:action` — 1 emitter(s)
- `cinderglassJob:close` — 1 emitter(s)
- `cinderglassJob:fact` — 2 emitter(s)
- `cinderglassJob:offer` — 1 emitter(s)
- `cinderglassJob:servicePrompt` — 2 emitter(s)
- `claim:defenseDelegateRefused` — 1 emitter(s)
- `claim:defenseEncounterRequested` — 1 emitter(s)
- `claim:depotPatrolRotation` — 1 emitter(s)
- `claim:depotPatrolSpent` — 1 emitter(s)
- `claim:depotSupport` — 2 emitter(s)
- `claim:freightDelivered` — 1 emitter(s)
- `claim:infrastructureConstructed` — 2 emitter(s)
- `claim:moduleBuilt` — 1 emitter(s)
- `claim:raidRepelled` — 1 emitter(s)
- `claim:receipt` — 1 emitter(s)
- `claim:specialized` — 1 emitter(s)
- `claim:trophyHeadGranted` — 1 emitter(s)
- `claims:migrated` — 1 emitter(s)
- `coldburnRey:playerDelivered` — 1 emitter(s)
- `coldburnRey:raceSettled` — 1 emitter(s)
- `collector:absorbed` — 1 emitter(s)
- `collector:freed` — 1 emitter(s)
- `collector:lost` — 1 emitter(s)
- `collector:released` — 1 emitter(s)
- `collector:snagged` — 1 emitter(s)
- `combat:actionCancelled` — 1 emitter(s)
- `combat:actionCompleted` — 1 emitter(s)
- `combat:actionPhase` — 1 emitter(s)
- `combat:emp` — 1 emitter(s)
- `combat:hullRepair` — 1 emitter(s)
- `combat:outcomeConsequence` — 1 emitter(s)
- `combat:shipjackPulse` — 1 emitter(s)
- `combat:shipjackShutdown` — 1 emitter(s)
- `comms:message` — 8 emitter(s)
- `concord:clampAttached` — 1 emitter(s)
- `concord:clampReleased` — 1 emitter(s)
- `concord:formationLocked` — 1 emitter(s)
- `concord:formationReformed` — 1 emitter(s)
- `conflict:frontAction` — 1 emitter(s)
- `conflict:warDeclared` — 1 emitter(s)
- `contactHail:availability` — 2 emitter(s)
- `contactHail:clear` — 6 emitter(s)
- `contactHail:handoff` — 1 emitter(s)
- `contactHail:offer` — 3 emitter(s)
- `countermeasure:denied` — 1 emitter(s)
- `counterweightCircuit:action` — 1 emitter(s)
- `counterweightCircuit:attemptStarted` — 1 emitter(s)
- `counterweightCircuit:discovered` — 1 emitter(s)
- `counterweightCircuit:offer` — 1 emitter(s)
- `craft:cancelled` — 1 emitter(s)
- `crew:demandSettled` — 1 emitter(s)
- `crew:hireDenied` — 2 emitter(s)
- `crew:hired` — 1 emitter(s)
- `crew:injured` — 1 emitter(s)
- `crew:lost` — 1 emitter(s)
- `crew:loyalty` — 1 emitter(s)
- `crew:promoted` — 1 emitter(s)
- `crew:quit` — 1 emitter(s)
- `crew:salvage` — 1 emitter(s)
- `crew:strike` — 1 emitter(s)
- `crew:strikeSettled` — 1 emitter(s)
- `crew:wagesPaid` — 1 emitter(s)
- `cruise:wrestleEscaped` — 1 emitter(s)
- `cruise:wrestleStarted` — 1 emitter(s)
- `derby:finished` — 1 emitter(s)
- `derby:slam` — 2 emitter(s)
- `detonator:detonated` — 1 emitter(s)
- `difficulty:stanceChanged` — 1 emitter(s)
- `discovery:chartFiled` — 1 emitter(s)
- `docket:delivered` — 1 emitter(s)
- `docket:met` — 2 emitter(s)
- `docket:voice` — 1 emitter(s)
- `drift:claimContested` — 1 emitter(s)
- `drift:claimLifted` — 1 emitter(s)
- `drift:claimStaked` — 1 emitter(s)
- `drill:chargeArm` — 3 emitter(s)
- `ecology:claimCrew` — 1 emitter(s)
- `ecology:coherence` — 1 emitter(s)
- `ecology:collar` — 1 emitter(s)
- `ecology:fossilRecorded` — 1 emitter(s)
- `ecology:fossilSettled` — 1 emitter(s)
- `ecology:setpiece` — 3 emitter(s)
- `economy:auditorTally` — 1 emitter(s)
- `economy:automationIntake` — 1 emitter(s)
- `economy:coldChainArmed` — 1 emitter(s)
- `economy:coldChainSpoiled` — 1 emitter(s)
- `economy:convoyShareBought` — 1 emitter(s)
- `economy:convoyShareSettled` — 2 emitter(s)
- `economy:debtEscalated` — 1 emitter(s)
- `economy:demandShift` — 1 emitter(s)
- `economy:eventEnded` — 1 emitter(s)
- `economy:eventStarted` — 1 emitter(s)
- `economy:forwardSlipBought` — 1 emitter(s)
- `economy:forwardSlipSettled` — 2 emitter(s)
- `economy:marketContractExpired` — 2 emitter(s)
- `economy:podIntakeAccepted` — 2 emitter(s)
- `economy:shortageRepairRestored` — 1 emitter(s)
- `encounter:claimDefenseRoster` — 1 emitter(s)
- `encounter:convoyEscorted` — 1 emitter(s)
- `encounter:fingerprint` — 1 emitter(s)
- `encounter:hostileCommitted` — 4 emitter(s)
- `encounter:lootSweepCollected` — 1 emitter(s)
- `encounter:lootSweepDispatched` — 1 emitter(s)
- `encounter:lootSweepEnded` — 1 emitter(s)
- `encounter:namedCaptainDefeated` — 2 emitter(s)
- `encounter:predationCleared` — 1 emitter(s)
- `encounter:scarcityRumor` — 1 emitter(s)
- `encounter:stale` — 1 emitter(s)
- `encounter:voice` — 1 emitter(s)
- `endgame:finaleCompleted` — 1 emitter(s)
- `endgame:finaleReady` — 1 emitter(s)
- `endgame:ineligible` — 4 emitter(s)
- `endgame:promptChoiceC` — 1 emitter(s)
- `endgame:promptChoiceD` — 1 emitter(s)
- `endgame:promptSandbox` — 1 emitter(s)
- `erisChoir:drinkReceipt` — 1 emitter(s)
- `escalation:arrived` — 1 emitter(s)
- `escalation:seeded` — 1 emitter(s)
- `faction:repSpillover` — 1 emitter(s)
- `factionPresence:berthGreeting` — 1 emitter(s)
- `factionPresence:berthReturned` — 1 emitter(s)
- `factionPresence:berthRobbed` — 1 emitter(s)
- `factionPresence:conduct` — 2 emitter(s)
- `factionPresence:service` — 1 emitter(s)
- `factionPresence:serviceAction` — 1 emitter(s)
- `factionPresence:spawned` — 3 emitter(s)
- `field:opportunity` — 1 emitter(s)
- `fields:deployDenied` — 1 emitter(s)
- `fields:hitchCut` — 1 emitter(s)
- `fields:hitchLatched` — 1 emitter(s)
- `fields:pullMarked` — 1 emitter(s)
- `fields:thermalCreated` — 1 emitter(s)
- `fields:thermalHit` — 1 emitter(s)
- `firsthour:beat` — 1 emitter(s)
- `firsthour:complete` — 1 emitter(s)
- `firsthour:sentence` — 1 emitter(s)
- `firsthour:sentenceOffer` — 1 emitter(s)
- `firsthour:started` — 1 emitter(s)
- `firsthour:verb` — 1 emitter(s)
- `flight:modeChanged` — 1 emitter(s)
- `flight:sweptHull` — 1 emitter(s)
- `formation:discovered` — 1 emitter(s)
- `freight:custodyRebound` — 1 emitter(s)
- `freight:custodyReceipt` — 2 emitter(s)
- `freight:gratitudeGift` — 1 emitter(s)
- `freight:lootSweepStarted` — 1 emitter(s)
- `freight:sweeperEscaped` — 1 emitter(s)
- `frontier:debtLapsed` — 1 emitter(s)
- `frontier:debtPosted` — 1 emitter(s)
- `frontier:debtSettled` — 1 emitter(s)
- `frontier:deed` — 1 emitter(s)
- `frontier:defenseCalled` — 1 emitter(s)
- `frontier:defenseCleared` — 1 emitter(s)
- `frontier:defenseFailed` — 1 emitter(s)
- `frontier:disputeJumped` — 1 emitter(s)
- `frontier:disputeLapsed` — 1 emitter(s)
- `frontier:disputePosted` — 1 emitter(s)
- `frontier:disputeSettled` — 1 emitter(s)
- `frontier:homesteadLost` — 1 emitter(s)
- `frontier:jobTier` — 1 emitter(s)
- `frontier:justiceFiled` — 1 emitter(s)
- `frontier:leadPosted` — 1 emitter(s)
- `frontier:leadSoured` — 1 emitter(s)
- `frontier:leadVerified` — 1 emitter(s)
- `frontier:missionAttemptStarted` — 1 emitter(s)
- `frontier:moduleRestocked` — 1 emitter(s)
- `frontier:raidSpawned` — 1 emitter(s)
- `frontier:raiderRepelled` — 2 emitter(s)
- `frontier:steadStruck` — 1 emitter(s)
- `frontier:supplyDelivered` — 2 emitter(s)
- `frontier:supplyRunAsked` — 2 emitter(s)
- `frontier:trafficTick` — 1 emitter(s)
- `frontier:vendettaLapsed` — 1 emitter(s)
- `frontier:vendettaPaid` — 1 emitter(s)
- `frontier:vendettaPosted` — 1 emitter(s)
- `frontier:welded` — 1 emitter(s)
- `frontierRumor:acquired` — 1 emitter(s)
- `frontierRumor:blackMarketAccess` — 1 emitter(s)
- `frontierRumor:contacted` — 1 emitter(s)
- `frontierRumor:resolved` — 1 emitter(s)
- `fuel:changed` — 9 emitter(s)
- `fulfillment:boardingDocked` — 1 emitter(s)
- `fulfillment:boardingFlung` — 1 emitter(s)
- `fulfillment:cargoFiled` — 1 emitter(s)
- `fulfillment:derailed` — 1 emitter(s)
- `fulfillment:hitchhike` — 1 emitter(s)
- `fulfillment:orderOneClosed` — 1 emitter(s)
- `fulfillment:rerailed` — 1 emitter(s)
- `fulfillment:trainSpawned` — 1 emitter(s)
- `game:embarkSpeculation` — 3 emitter(s)
- `gamepad:connected` — 1 emitter(s)
- `gamepad:disconnected` — 1 emitter(s)
- `gateThree:bondLapsed` — 1 emitter(s)
- `gateThree:bonded` — 1 emitter(s)
- `gateThree:contested` — 2 emitter(s)
- `gateThree:evaded` — 1 emitter(s)
- `gateThree:inspection` — 1 emitter(s)
- `gateThree:laneWeighed` — 1 emitter(s)
- `gateThree:logged` — 3 emitter(s)
- `gateThree:maintenance` — 1 emitter(s)
- `gateThree:weighed` — 2 emitter(s)
- `gravedigger:claimClosed` — 4 emitter(s)
- `gravedigger:claimLapsed` — 1 emitter(s)
- `gravedigger:claimPosted` — 1 emitter(s)
- `gravedigger:claimRobbed` — 1 emitter(s)
- `gravedigger:claimYielded` — 1 emitter(s)
- `gravedigger:forgiven` — 1 emitter(s)
- `gravedigger:graveDesecrated` — 1 emitter(s)
- `gravedigger:graveNamed` — 1 emitter(s)
- `gravedigger:grudged` — 1 emitter(s)
- `gravedigger:kinSlain` — 1 emitter(s)
- `gravedigger:offering` — 1 emitter(s)
- `gravedigger:pitRefused` — 1 emitter(s)
- `gravedigger:portionPaid` — 1 emitter(s)
- `gravedigger:standing` — 1 emitter(s)
- `gravedigger:verdictFiled` — 1 emitter(s)
- `gravedigger:vigilBegun` — 1 emitter(s)
- `gravedigger:vigilDeparting` — 1 emitter(s)
- `gravedigger:vigilInbound` — 1 emitter(s)
- `gravedigger:vigilPosted` — 1 emitter(s)
- `heist:capsuleResumed` — 1 emitter(s)
- `heist:counterweightSceneReceipt` — 4 emitter(s)
- `heist:launchCue` — 2 emitter(s)
- `heist:launchScheduleReceipt` — 4 emitter(s)
- `heist:launchScheduleReleased` — 1 emitter(s)
- `heist:observed` — 1 emitter(s)
- `heist:receiverAborted` — 1 emitter(s)
- `heist:receiverPrepared` — 1 emitter(s)
- `heist:routineReceipt` — 1 emitter(s)
- `helix:appealHeard` — 2 emitter(s)
- `helix:auditBegun` — 1 emitter(s)
- `helix:auditEvaded` — 1 emitter(s)
- `helix:auditRuled` — 1 emitter(s)
- `helix:deed` — 1 emitter(s)
- `helix:deskFiled` — 1 emitter(s)
- `helix:deskLost` — 1 emitter(s)
- `helix:fineOverdue` — 1 emitter(s)
- `helix:finePaid` — 1 emitter(s)
- `helix:finePosted` — 1 emitter(s)
- `helix:flagsDropped` — 1 emitter(s)
- `helix:garnished` — 1 emitter(s)
- `helix:lienFiled` — 1 emitter(s)
- `helix:lienScraped` — 2 emitter(s)
- `helix:lienStuck` — 1 emitter(s)
- `helix:manifestFiled` — 1 emitter(s)
- `helix:noticeJumped` — 1 emitter(s)
- `helix:noticeLapsed` — 9 emitter(s)
- `helix:noticePosted` — 1 emitter(s)
- `helix:noticeVerified` — 1 emitter(s)
- `helix:precedent` — 1 emitter(s)
- `helix:tier` — 1 emitter(s)
- `helix:verdictFiled` — 1 emitter(s)
- `helix:warrantEscalated` — 1 emitter(s)
- `helix:warrantPosted` — 1 emitter(s)
- `helix:warrantSettled` — 1 emitter(s)
- `helix:writLevy` — 1 emitter(s)
- `helix:writSpawned` — 1 emitter(s)
- `history:deadNoted` — 1 emitter(s)
- `hud:firstUse` — 3 emitter(s)
- `hud:phase` — 4 emitter(s)
- `hud:recallObjective` — 1 emitter(s)
- `hud:tagFlicker` — 1 emitter(s)
- `hullBurst:activated` — 1 emitter(s)
- `hullBurst:ended` — 1 emitter(s)
- `hullBurst:released` — 1 emitter(s)
- `ilexArk:accepted` — 1 emitter(s)
- `ilexArk:finished` — 1 emitter(s)
- `ilexArk:harvested` — 1 emitter(s)
- `ilexArk:vaultDelivered` — 1 emitter(s)
- `ilexArk:vaultReleased` — 1 emitter(s)
- `impoundGrudge:escalated` — 1 emitter(s)
- `impoundGrudge:offer` — 1 emitter(s)
- `impoundGrudge:offerRefused` — 1 emitter(s)
- `impoundGrudge:resolved` — 1 emitter(s)
- `impoundGrudge:sabotage` — 1 emitter(s)
- `impoundGrudge:settled` — 1 emitter(s)
- `impoundGrudge:surfaced` — 1 emitter(s)
- `impoundGrudge:surfacingEnded` — 1 emitter(s)
- `impoundGrudge:tracked` — 1 emitter(s)
- `industrialDisasters:commandRejected` — 1 emitter(s)
- `industrialDisasters:consequence` — 1 emitter(s)
- `industrialDisasters:discover` — 1 emitter(s)
- `industrialDisasters:event` — 1 emitter(s)
- `industrialDisasters:inspect` — 2 emitter(s)
- `industrialDisasters:poses` — 1 emitter(s)
- `industrialDisasters:signal` — 1 emitter(s)
- `industrialDisasters:status` — 1 emitter(s)
- `intervention:available` — 1 emitter(s)
- `intervention:closed` — 1 emitter(s)
- `intervention:jumperRipped` — 1 emitter(s)
- `intervention:logged` — 1 emitter(s)
- `jump:interdictionWarning` — 1 emitter(s)
- `kilnback:caskReleased` — 1 emitter(s)
- `kilnback:caskSalvaged` — 1 emitter(s)
- `kilnback:coolantReleased` — 1 emitter(s)
- `kilnback:phase` — 1 emitter(s)
- `lamplighter:amends` — 1 emitter(s)
- `lamplighter:askLapsed` — 2 emitter(s)
- `lamplighter:askPosted` — 1 emitter(s)
- `lamplighter:askSoured` — 1 emitter(s)
- `lamplighter:askVerified` — 1 emitter(s)
- `lamplighter:favor` — 1 emitter(s)
- `lamplighter:forgiven` — 1 emitter(s)
- `lamplighter:grudge` — 1 emitter(s)
- `lamplighter:guttered` — 1 emitter(s)
- `lamplighter:keeperTier` — 1 emitter(s)
- `lamplighter:lampSiphoned` — 1 emitter(s)
- `lamplighter:lampTended` — 1 emitter(s)
- `lamplighter:logged` — 1 emitter(s)
- `lamplighter:oilPodDropped` — 1 emitter(s)
- `lamplighter:oilSold` — 1 emitter(s)
- `lamplighter:oiled` — 1 emitter(s)
- `lamplighter:planted` — 1 emitter(s)
- `lamplighter:rimPaid` — 1 emitter(s)
- `lamplighter:snufferDowned` — 1 emitter(s)
- `lamplighter:snufferInbound` — 1 emitter(s)
- `lamplighter:spurned` — 1 emitter(s)
- `lamplighter:wayfarerArrived` — 1 emitter(s)
- `lamplighter:wayfarerInbound` — 1 emitter(s)
- `lamplighter:wayfarerLost` — 1 emitter(s)
- `lamplighter:wayfarerTurned` — 1 emitter(s)
- `lane:facadeMiss` — 1 emitter(s)
- `lastShift:archive` — 2 emitter(s)
- `lastShift:archived` — 1 emitter(s)
- `lastShift:cancelRecovery` — 1 emitter(s)
- `lastShift:cueSurfaced` — 1 emitter(s)
- `lastShift:readRecovery` — 2 emitter(s)
- `lastShift:recorderReturned` — 1 emitter(s)
- `lastShift:recover` — 1 emitter(s)
- `lastShift:returnRecorder` — 1 emitter(s)
- `law:warrantIssued` — 1 emitter(s)
- `line:recordStamped` — 1 emitter(s)
- `lineHead:breakerSplit` — 1 emitter(s)
- `lineHead:sealed` — 1 emitter(s)
- `lineHead:stapled` — 1 emitter(s)
- `lossInvestigation:closed` — 1 emitter(s)
- `lossLedger:priceMove` — 1 emitter(s)
- `machine:appealAccepted` — 1 emitter(s)
- `machine:jurisdictionResolved` — 1 emitter(s)
- `machine:repairCompleted` — 2 emitter(s)
- `machine:tokenDelivered` — 2 emitter(s)
- `machine:workpiecePlaced` — 1 emitter(s)
- `mail:delivered` — 1 emitter(s)
- `manifest:completed` — 1 emitter(s)
- `massSeed:cleared` — 1 emitter(s)
- `massSeed:deployDenied` — 1 emitter(s)
- `massSeed:destroyed` — 1 emitter(s)
- `massline:bridleEndpointSelected` — 1 emitter(s)
- `massline:bridleLinked` — 1 emitter(s)
- `massline:bridleSetupEnded` — 1 emitter(s)
- `massline:cadenceChanged` — 1 emitter(s)
- `massline:npcLineCut` — 1 emitter(s)
- `massline:recovered` — 1 emitter(s)
- `massline:recovering` — 1 emitter(s)
- `massline:whipSnap` — 1 emitter(s)
- `mercyService:completed` — 1 emitter(s)
- `mercyService:failedForward` — 1 emitter(s)
- `mercyService:order` — 1 emitter(s)
- `mercyService:started` — 1 emitter(s)
- `mercyService:tool` — 1 emitter(s)
- `mercyService:toolResult` — 1 emitter(s)
- `meridian:accountCharged` — 1 emitter(s)
- `meridian:accountPaid` — 1 emitter(s)
- `meridian:accountWarned` — 1 emitter(s)
- `meridian:assessmentCharged` — 1 emitter(s)
- `meridian:blacklistLifted` — 1 emitter(s)
- `meridian:blacklisted` — 2 emitter(s)
- `meridian:claimPosted` — 1 emitter(s)
- `meridian:claimSettled` — 1 emitter(s)
- `meridian:claimStolen` — 1 emitter(s)
- `meridian:containerRecoupled` — 1 emitter(s)
- `meridian:containerSold` — 1 emitter(s)
- `meridian:contractDefaulted` — 1 emitter(s)
- `meridian:contractDelivered` — 1 emitter(s)
- `meridian:contractExpired` — 1 emitter(s)
- `meridian:contractPosted` — 1 emitter(s)
- `meridian:contractTaken` — 1 emitter(s)
- `meridian:convoyArrived` — 1 emitter(s)
- `meridian:convoyDeparted` — 1 emitter(s)
- `meridian:convoyLost` — 1 emitter(s)
- `meridian:convoyRaided` — 1 emitter(s)
- `meridian:couplerSnapped` — 1 emitter(s)
- `meridian:deed` — 1 emitter(s)
- `meridian:escortAsked` — 1 emitter(s)
- `meridian:escortSigned` — 1 emitter(s)
- `meridian:levyCollected` — 1 emitter(s)
- `meridian:raiderPlucked` — 1 emitter(s)
- `meridian:raiderRepelled` — 1 emitter(s)
- `meridian:refused` — 1 emitter(s)
- `meridian:repoFielded` — 1 emitter(s)
- `meridian:tickerFloor` — 1 emitter(s)
- `meridian:tier` — 1 emitter(s)
- `meridian:verdictFiled` — 1 emitter(s)
- `meridian:warrantLapsed` — 1 emitter(s)
- `meridian:warrantPaid` — 1 emitter(s)
- `meridian:warrantPosted` — 1 emitter(s)
- `meridian:writPosted` — 1 emitter(s)
- `meridian:writSettled` — 1 emitter(s)
- `mines:triggered` — 1 emitter(s)
- `mining:beamLocked` — 1 emitter(s)
- `mining:podSplit` — 1 emitter(s)
- `missile:guidanceLost` — 1 emitter(s)
- `mission:conditionPending` — 1 emitter(s)
- `mission:conditionProgress` — 2 emitter(s)
- `mission:gateCleared` — 2 emitter(s)
- `mission:setPieceTravelLine` — 1 emitter(s)
- `mission:spawnDeferred` — 1 emitter(s)
- `mission:targetsProjected` — 1 emitter(s)
- `module:granted` — 3 emitter(s)
- `module:sold` — 1 emitter(s)
- `moisture:loss` — 1 emitter(s)
- `morrow:launch` — 1 emitter(s)
- `morrow:met` — 1 emitter(s)
- `morrow:voice` — 1 emitter(s)
- `mothlight:lampReleased` — 1 emitter(s)
- `mothlight:phase` — 1 emitter(s)
- `namedAce:appeared` — 1 emitter(s)
- `nemesis:encounterRejected` — 1 emitter(s)
- `nemesis:encounterStarted` — 1 emitter(s)
- `nemesis:escaped` — 1 emitter(s)
- `nemesis:spare` — 1 emitter(s)
- `nest:waspsLaunched` — 1 emitter(s)
- `news:headline` — 9 emitter(s)
- `news:publish` — 49 emitter(s)
- `news:render` — 1 emitter(s)
- `npcjobs:closeCall` — 1 emitter(s)
- `npcjobs:crewResponse` — 1 emitter(s)
- `npcjobs:errand` — 1 emitter(s)
- `npcjobs:lotReplaced` — 1 emitter(s)
- `npcjobs:oncallTenderRetired` — 1 emitter(s)
- `npcjobs:resumed` — 1 emitter(s)
- `npcjobs:surveyMarked` — 1 emitter(s)
- `npcjobs:yardDispatchDone` — 1 emitter(s)
- `occupation:delivered` — 1 emitter(s)
- `occupation:licensed` — 1 emitter(s)
- `occupation:lost` — 2 emitter(s)
- `occupation:recommissioned` — 1 emitter(s)
- `occupation:settled` — 1 emitter(s)
- `occupation:switched` — 1 emitter(s)
- `onboarding:drillFolded` — 1 emitter(s)
- `onboarding:rangePrompt` — 3 emitter(s)
- `onboarding:rosterPrewarm` — 1 emitter(s)
- `onboarding:swingClinic` — 1 emitter(s)
- `optic:beamContact` — 1 emitter(s)
- `orrinWitness:evidenceRecovered` — 1 emitter(s)
- `orrinWitness:submitted` — 1 emitter(s)
- `pallas:shift` — 1 emitter(s)
- `pallasHiddenCache:cargoChanged` — 1 emitter(s)
- `pallasHiddenCache:clueRecovered` — 1 emitter(s)
- `pallasHiddenCache:pickupReady` — 1 emitter(s)
- `palletJack:drop` — 1 emitter(s)
- `palletJack:lost` — 1 emitter(s)
- `palletJack:phase` — 1 emitter(s)
- `palletJack:released` — 1 emitter(s)
- `palletJack:trail` — 1 emitter(s)
- `patrolBait:cleared` — 1 emitter(s)
- `patrolBait:opened` — 1 emitter(s)
- `patrolBait:voice` — 1 emitter(s)
- `pilot:comboDetonated` — 1 emitter(s)
- `pirateDisengage:verdict` — 1 emitter(s)
- `pitborn:ballastAccreted` — 1 emitter(s)
- `pitborn:ballastHorn` — 1 emitter(s)
- `pitborn:ballastNamed` — 1 emitter(s)
- `pitborn:ballastStart` — 1 emitter(s)
- `pitborn:blacklistLifted` — 1 emitter(s)
- `pitborn:blacklisted` — 1 emitter(s)
- `pitborn:claimExtracted` — 1 emitter(s)
- `pitborn:claimFiled` — 1 emitter(s)
- `pitborn:claimForeclosed` — 1 emitter(s)
- `pitborn:claimJumped` — 1 emitter(s)
- `pitborn:claimLapsed` — 1 emitter(s)
- `pitborn:claimSold` — 1 emitter(s)
- `pitborn:collectorDown` — 1 emitter(s)
- `pitborn:collectorsOut` — 1 emitter(s)
- `pitborn:crowdStyle` — 1 emitter(s)
- `pitborn:crowdTier` — 1 emitter(s)
- `pitborn:cullSettled` — 1 emitter(s)
- `pitborn:debtDueSoon` — 1 emitter(s)
- `pitborn:debtEscalated` — 1 emitter(s)
- `pitborn:debtPaid` — 1 emitter(s)
- `pitborn:debtPosted` — 1 emitter(s)
- `pitborn:debtSettled` — 1 emitter(s)
- `pitborn:debtWrittenOff` — 1 emitter(s)
- `pitborn:deed` — 1 emitter(s)
- `pitborn:dividend` — 1 emitter(s)
- `pitborn:fined` — 1 emitter(s)
- `pitborn:levyCollected` — 1 emitter(s)
- `pitborn:marketBought` — 1 emitter(s)
- `pitborn:marketDelisted` — 5 emitter(s)
- `pitborn:marketListed` — 2 emitter(s)
- `pitborn:quotaPosted` — 1 emitter(s)
- `pitborn:quotaProgress` — 1 emitter(s)
- `pitborn:quotaSettled` — 1 emitter(s)
- `pitborn:refused` — 1 emitter(s)
- `pitborn:scoreboard` — 1 emitter(s)
- `pitborn:shareBought` — 1 emitter(s)
- `pitborn:shareSold` — 1 emitter(s)
- `pitborn:suspicionFiled` — 1 emitter(s)
- `pitborn:suspicionWarned` — 1 emitter(s)
- `pitborn:tier` — 1 emitter(s)
- `pitborn:yardmasterDown` — 1 emitter(s)
- `pitborn:yardmasterStripped` — 1 emitter(s)
- `planet:npcHarvest` — 1 emitter(s)
- `planet:registered` — 1 emitter(s)
- `planet:unregistered` — 1 emitter(s)
- `plants:stalledStringFlash` — 1 emitter(s)
- `plants:wrongWayStandDown` — 1 emitter(s)
- `presentation:audioCue` — 3 emitter(s)
- `presentation:cameraCue` — 1 emitter(s)
- `presentation:caption` — 14 emitter(s)
- `presentation:cueApplied` — 1 emitter(s)
- `presentation:uiCue` — 2 emitter(s)
- `quality:autoEased` — 1 emitter(s)
- `quiet:routeSold` — 1 emitter(s)
- `quill:archiveRebound` — 1 emitter(s)
- `quill:errandAnswered` — 1 emitter(s)
- `quill:errandArmed` — 1 emitter(s)
- `quill:folioBurned` — 1 emitter(s)
- `quill:folioMinted` — 1 emitter(s)
- `quill:folioSeized` — 1 emitter(s)
- `quill:folioSold` — 1 emitter(s)
- `quill:forgeryDetected` — 1 emitter(s)
- `quill:redactorKilled` — 1 emitter(s)
- `quill:redactorSpawned` — 1 emitter(s)
- `quill:redactorWithdrew` — 1 emitter(s)
- `race:ended` — 1 emitter(s)
- `race:restarted` — 1 emitter(s)
- `race:toggleView` — 2 emitter(s)
- `ravel:cast` — 1 emitter(s)
- `ravel:destroyed` — 1 emitter(s)
- `ravel:hit` — 1 emitter(s)
- `ravel:pacified` — 1 emitter(s)
- `ravel:telegraph` — 1 emitter(s)
- `ravel:unthreaded` — 1 emitter(s)
- `ravel:voice` — 1 emitter(s)
- `reach:trophyHung` — 1 emitter(s)
- `recovery:choose` — 1 emitter(s)
- `recovery:vent` — 1 emitter(s)
- `redKite:aborted` — 1 emitter(s)
- `redKite:course` — 1 emitter(s)
- `redKite:finished` — 1 emitter(s)
- `redKite:start` — 1 emitter(s)
- `redKite:started` — 1 emitter(s)
- `rescue:beat` — 2 emitter(s)
- `rescue:complete` — 1 emitter(s)
- `rescuedWorker:returned` — 1 emitter(s)
- `resonance:patrolQueued` — 1 emitter(s)
- `rhythm:phase` — 1 emitter(s)
- `rigWorkshop:changed` — 1 emitter(s)
- `rigWorkshop:delivered` — 1 emitter(s)
- `rigWorkshop:feedback` — 1 emitter(s)
- `rigWorkshop:prompt` — 1 emitter(s)
- `rigWorkshop:promptClosed` — 1 emitter(s)
- `rookWreck:appraised` — 1 emitter(s)
- `rookWreck:countered` — 1 emitter(s)
- `rookWreck:disputeFiled` — 1 emitter(s)
- `rookWreck:offerLapsed` — 1 emitter(s)
- `rookWreck:padRefused` — 1 emitter(s)
- `rubric:destroyed` — 1 emitter(s)
- `rubric:last` — 1 emitter(s)
- `rubric:marked` — 1 emitter(s)
- `rubric:voice` — 1 emitter(s)
- `ruckus:pulse` — 1 emitter(s)
- `ruckus:retrieved` — 1 emitter(s)
- `ruckus:state` — 1 emitter(s)
- `ruckus:voice` — 1 emitter(s)
- `run:roleProblemStamped` — 1 emitter(s)
- `ruud:cut` — 1 emitter(s)
- `ruud:spared` — 1 emitter(s)
- `ruud:stamp` — 1 emitter(s)
- `ruud:voice` — 2 emitter(s)
- `sable:demonstrated` — 1 emitter(s)
- `salvage:actionRead` — 1 emitter(s)
- `salvage:cookerFlight` — 1 emitter(s)
- `salvage:coreDetonated` — 1 emitter(s)
- `salvage:reactorBurst` — 1 emitter(s)
- `salvage:reactorVented` — 1 emitter(s)
- `salvage:sortDelivered` — 1 emitter(s)
- `salvage:sortImpact` — 1 emitter(s)
- `salvage:sortLost` — 1 emitter(s)
- `salvage:sortSeparated` — 1 emitter(s)
- `salvageOutfits:agreement` — 2 emitter(s)
- `salvageOutfits:choose` — 1 emitter(s)
- `salvageOutfits:completed` — 1 emitter(s)
- `salvageOutfits:delivered` — 1 emitter(s)
- `salvageOutfits:mistake` — 1 emitter(s)
- `salvageOutfits:offer` — 3 emitter(s)
- `salvageOutfits:offerClosed` — 1 emitter(s)
- `salvageOutfits:radio` — 1 emitter(s)
- `salvageOutfits:started` — 1 emitter(s)
- `salvageTender:action` — 1 emitter(s)
- `salvageTender:close` — 1 emitter(s)
- `salvageTender:disabled` — 1 emitter(s)
- `salvageTender:discovered` — 1 emitter(s)
- `salvageTender:offer` — 1 emitter(s)
- `salvageTender:podPatched` — 1 emitter(s)
- `salvageTender:rackReleased` — 1 emitter(s)
- `salvageTender:reset` — 2 emitter(s)
- `salvageWatch:repairWork` — 1 emitter(s)
- `save:restoreCommitted` — 1 emitter(s)
- `scan:weakPoint` — 1 emitter(s)
- `scenario:actorBindings` — 1 emitter(s)
- `scenario:dialogueLine` — 1 emitter(s)
- `scenario:factChanged` — 1 emitter(s)
- `scenario:factsInitialized` — 1 emitter(s)
- `scenario:loaded` — 1 emitter(s)
- `scenario:safeOpeningDemand` — 1 emitter(s)
- `sector:membershipCandidate` — 1 emitter(s)
- `sector:physicalLaw` — 1 emitter(s)
- `sectorsim:tick` — 1 emitter(s)
- `sensors:playerLit` — 1 emitter(s)
- `sensors:playerSignature` — 1 emitter(s)
- `sensors:playerUnlit` — 1 emitter(s)
- `sensors:quietCoast` — 2 emitter(s)
- `sensors:signatureLost` — 2 emitter(s)
- `sensors:signatureReport` — 1 emitter(s)
- `sensors:signatureResolved` — 1 emitter(s)
- `service:progress` — 1 emitter(s)
- `setPiece:staged` — 1 emitter(s)
- `settings:restored` — 1 emitter(s)
- `shieldPylon:active` — 1 emitter(s)
- `shieldPylon:contact` — 1 emitter(s)
- `shieldPylon:denied` — 1 emitter(s)
- `shieldPylon:intercepted` — 1 emitter(s)
- `shieldPylon:linking` — 1 emitter(s)
- `shieldPylon:overloaded` — 1 emitter(s)
- `shieldPylon:placed` — 2 emitter(s)
- `shieldPylon:recovered` — 1 emitter(s)
- `shieldPylon:retired` — 1 emitter(s)
- `shieldPylon:strained` — 1 emitter(s)
- `shieldPylon:warning` — 1 emitter(s)
- `ship:berthSwitching` — 1 emitter(s)
- `ship:cargoCapChanged` — 1 emitter(s)
- `ship:controlTransferred` — 1 emitter(s)
- `ship:loadoutPresetDeleted` — 1 emitter(s)
- `ship:loadoutPresetSaved` — 1 emitter(s)
- `ship:massChanged` — 1 emitter(s)
- `ship:parkedHoldSwap` — 2 emitter(s)
- `ship:released` — 1 emitter(s)
- `ship:sold` — 1 emitter(s)
- `shipbreakingYard:action` — 1 emitter(s)
- `shipbreakingYard:close` — 1 emitter(s)
- `shipbreakingYard:delivered` — 1 emitter(s)
- `shipbreakingYard:offer` — 6 emitter(s)
- `shipbreakingYard:receipt` — 1 emitter(s)
- `shipbreakingYard:view` — 1 emitter(s)
- `shipjack:actionCommitted` — 1 emitter(s)
- `shipjack:claimResolved` — 2 emitter(s)
- `shipjack:cue` — 1 emitter(s)
- `shipjack:destroyed` — 1 emitter(s)
- `shipjack:distress` — 1 emitter(s)
- `shipjack:fleetArrived` — 1 emitter(s)
- `shipjack:fleetDeparted` — 1 emitter(s)
- `shipjack:fleetPickedUp` — 1 emitter(s)
- `shipjack:fleetReceipt` — 1 emitter(s)
- `shipjack:fleetStarted` — 1 emitter(s)
- `shipjack:inspection` — 1 emitter(s)
- `shipjack:opportunity` — 1 emitter(s)
- `shipjack:result` — 1 emitter(s)
- `shipjack:route` — 1 emitter(s)
- `shipjack:settled` — 1 emitter(s)
- `shipjack:yardCompleted` — 2 emitter(s)
- `shipjack:yardReceipt` — 2 emitter(s)
- `shipjack:yardStarted` — 1 emitter(s)
- `signal:receipt` — 1 emitter(s)
- `site:anchored` — 1 emitter(s)
- `site:blueprintApplied` — 1 emitter(s)
- `site:chargePressed` — 1 emitter(s)
- `site:claimContested` — 1 emitter(s)
- `site:clusterBalanced` — 1 emitter(s)
- `site:commissioned` — 1 emitter(s)
- `site:courierDelivered` — 1 emitter(s)
- `site:courierLost` — 1 emitter(s)
- `site:created` — 2 emitter(s)
- `site:defenseDeployed` — 1 emitter(s)
- `site:directiveUpdated` — 1 emitter(s)
- `site:droneCommissioned` — 1 emitter(s)
- `site:laneSpilled` — 2 emitter(s)
- `site:linkCreated` — 1 emitter(s)
- `site:linkRemoved` — 1 emitter(s)
- `site:linkUpdated` — 1 emitter(s)
- `site:machineMode` — 1 emitter(s)
- `site:podBuilt` — 1 emitter(s)
- `site:rematerialized` — 1 emitter(s)
- `site:reserveUpdated` — 1 emitter(s)
- `site:signatureBand` — 1 emitter(s)
- `siteEvidence:closed` — 7 emitter(s)
- `siteEvidence:offer` — 3 emitter(s)
- `siteEvidence:result` — 2 emitter(s)
- `slate:columnRead` — 1 emitter(s)
- `slate:spike` — 1 emitter(s)
- `solstice:bloom` — 1 emitter(s)
- `solstice:charged` — 1 emitter(s)
- `solstice:destroyed` — 1 emitter(s)
- `solstice:voice` — 1 emitter(s)
- `special500:karaokeHeard` — 1 emitter(s)
- `special500:portraitCommission` — 3 emitter(s)
- `spectrum:focus` — 1 emitter(s)
- `spectrum:resolved` — 1 emitter(s)
- `station:berthAssigned` — 1 emitter(s)
- `station:blockade` — 1 emitter(s)
- `station:boom` — 1 emitter(s)
- `station:grudge` — 1 emitter(s)
- `station:grudgeCleared` — 1 emitter(s)
- `station:holding` — 1 emitter(s)
- `station:marketTradeIntentRetired` — 1 emitter(s)
- `station:marketTradeReceiptRecovered` — 1 emitter(s)
- `station:navigate` — 6 emitter(s)
- `station:strike` — 1 emitter(s)
- `station:yardChanged` — 1 emitter(s)
- `stationContact:changed` — 5 emitter(s)
- `stationContact:counterChanged` — 2 emitter(s)
- `stationContact:counterDelta` — 1 emitter(s)
- `stationContact:hailSpoken` — 2 emitter(s)
- `stationContact:manifestWon` — 1 emitter(s)
- `stationLife:deedNoticed` — 1 emitter(s)
- `stationLife:trafficChanged` — 3 emitter(s)
- `story:continuationAccess` — 1 emitter(s)
- `story:varianceSeamFailed` — 1 emitter(s)
- `story:vergeObserversRevealed` — 1 emitter(s)
- `stunt:arenaLawBounty` — 1 emitter(s)
- `survivalArena:rosterPrewarm` — 1 emitter(s)
- `survivorPod:huntDispatched` — 1 emitter(s)
- `survivorPod:huntEnded` — 1 emitter(s)
- `survivorPod:promoted` — 1 emitter(s)
- `survivorPod:resolved` — 1 emitter(s)
- `swarm:bonusChip` — 1 emitter(s)
- `swarm:bossMilestoneAck` — 1 emitter(s)
- `swarm:broodAggression` — 1 emitter(s)
- `swarm:broodProjectileHit` — 1 emitter(s)
- `swarm:broodRemains` — 1 emitter(s)
- `swarm:broodRemainsSpent` — 1 emitter(s)
- `swarm:broodShielded` — 1 emitter(s)
- `swarm:broodTeslaHit` — 1 emitter(s)
- `swarm:fortifyBuildRequested` — 1 emitter(s)
- `swarm:fortifyReloadRequested` — 1 emitter(s)
- `swarm:fortifyRepairRequested` — 1 emitter(s)
- `swarm:fortifyStateRequested` — 1 emitter(s)
- `tallyho:betLost` — 4 emitter(s)
- `tallyho:betPaid` — 1 emitter(s)
- `tallyho:betPosted` — 1 emitter(s)
- `tallyho:bountyClaimed` — 1 emitter(s)
- `tallyho:bountyCold` — 1 emitter(s)
- `tallyho:bountyPosted` — 1 emitter(s)
- `tallyho:deed` — 1 emitter(s)
- `tallyho:huntCold` — 1 emitter(s)
- `tallyho:huntPoached` — 1 emitter(s)
- `tallyho:huntPosted` — 1 emitter(s)
- `tallyho:huntSlipped` — 1 emitter(s)
- `tallyho:ledgerFiled` — 1 emitter(s)
- `tallyho:quarryFleeing` — 1 emitter(s)
- `tallyho:rivalDowned` — 1 emitter(s)
- `tallyho:rivalLeft` — 2 emitter(s)
- `tallyho:rivalPosted` — 1 emitter(s)
- `tallyho:sightingFiled` — 1 emitter(s)
- `tallyho:standing` — 1 emitter(s)
- `terrainAnchors:replenished` — 1 emitter(s)
- `tether:couplerLock` — 1 emitter(s)
- `tether:cutDenied` — 1 emitter(s)
- `tether:lineControlDenied` — 1 emitter(s)
- `tether:tractorCapture` — 1 emitter(s)
- `touch:guide` — 1 emitter(s)
- `towlineTable:assistAccepted` — 1 emitter(s)
- `towlineTable:assistFulfilled` — 1 emitter(s)
- `towlineTable:cleanupAccepted` — 1 emitter(s)
- `traffic:anvilSpillReturned` — 1 emitter(s)
- `traffic:anvilTransfer` — 1 emitter(s)
- `traffic:freightTallied` — 1 emitter(s)
- `traffic:passengerLinerReceipt` — 1 emitter(s)
- `traffic:passengerLinerSuspended` — 1 emitter(s)
- `traffic:vesselRelinquished` — 1 emitter(s)
- `ui:bulkHaulTag` — 1 emitter(s)
- `ui:bulkHaulTagCleared` — 1 emitter(s)
- `ui:closeCargo` — 3 emitter(s)
- `ui:closeComms` — 1 emitter(s)
- `ui:manifestAction` — 1 emitter(s)
- `ui:manifestOpen` — 1 emitter(s)
- `ui:manifestStart` — 1 emitter(s)
- `ui:navigate` — 4 emitter(s)
- `ui:shipjack` — 8 emitter(s)
- `ui:toast` — 4 emitter(s)
- `ui:toggleCargo` — 1 emitter(s)
- `ui:toggleComms` — 2 emitter(s)
- `ui:toggleOverview` — 1 emitter(s)
- `ui:transferParkedCargo` — 1 emitter(s)
- `understory:accessTier` — 1 emitter(s)
- `understory:blacklisted` — 1 emitter(s)
- `understory:compostRunComplete` — 1 emitter(s)
- `understory:coverBurned` — 1 emitter(s)
- `understory:coverIssued` — 1 emitter(s)
- `understory:debtChanged` — 3 emitter(s)
- `understory:debtSquared` — 1 emitter(s)
- `understory:dropCracked` — 1 emitter(s)
- `understory:dropDelivered` — 1 emitter(s)
- `understory:dropLapsed` — 5 emitter(s)
- `understory:dropReturned` — 1 emitter(s)
- `understory:dropStashed` — 1 emitter(s)
- `understory:favor` — 1 emitter(s)
- `understory:gardenFed` — 1 emitter(s)
- `understory:gardenSeeded` — 1 emitter(s)
- `understory:gardenStage` — 1 emitter(s)
- `understory:markedStash` — 1 emitter(s)
- `understory:noticeChanged` — 2 emitter(s)
- `understory:sporeSkin` — 1 emitter(s)
- `understory:whisperPosted` — 1 emitter(s)
- `understory:whisperVerified` — 1 emitter(s)
- `uniqueLoot:choirBellPulse` — 1 emitter(s)
- `uniqueLoot:nestbreakerSplit` — 1 emitter(s)
- `uniqueLoot:paleCoilBlink` — 1 emitter(s)
- `uniqueWreck:blackBoxRecovered` — 1 emitter(s)
- `uniqueWreck:choiceBlocked` — 1 emitter(s)
- `uniqueWreck:choose` — 3 emitter(s)
- `uniqueWreck:complicationScheduled` — 1 emitter(s)
- `uniqueWreck:encounterCompleted` — 1 emitter(s)
- `uniqueWreck:encounterRequested` — 2 emitter(s)
- `uniqueWreck:rumorHeard` — 2 emitter(s)
- `uniqueWreck:salvaged` — 1 emitter(s)
- `uniqueWreck:storyRewardDisposed` — 1 emitter(s)
- `vael:clauseDone` — 1 emitter(s)
- `vael:clauseFailed` — 1 emitter(s)
- `vael:clauseLapsed` — 1 emitter(s)
- `vael:clausePosted` — 1 emitter(s)
- `vael:clauseSigned` — 1 emitter(s)
- `vael:debtorCollected` — 1 emitter(s)
- `vael:debtorPosted` — 1 emitter(s)
- `vael:debtorSkipped` — 2 emitter(s)
- `vael:debtorTransferred` — 1 emitter(s)
- `vael:hullScriptRead` — 1 emitter(s)
- `vael:invoiceFiled` — 1 emitter(s)
- `vael:invoiceReminded` — 1 emitter(s)
- `vael:invoiceSettled` — 1 emitter(s)
- `vael:ledgerFiled` — 1 emitter(s)
- `vael:lienClamped` — 1 emitter(s)
- `vael:lienCut` — 1 emitter(s)
- `vael:lienPaid` — 1 emitter(s)
- `vael:lienServed` — 1 emitter(s)
- `vael:lienTelegraph` — 1 emitter(s)
- `vael:lienThrown` — 1 emitter(s)
- `vael:lienTransferred` — 1 emitter(s)
- `vael:marked` — 1 emitter(s)
- `vael:milestone` — 1 emitter(s)
- `vael:overrideThrust` — 1 emitter(s)
- `vael:pageNineArmed` — 1 emitter(s)
- `vael:pageTurned` — 1 emitter(s)
- `vael:paperTier` — 2 emitter(s)
- `vael:patrolHail` — 1 emitter(s)
- `vael:patrolPosted` — 1 emitter(s)
- `vael:patrolWithdrew` — 1 emitter(s)
- `vael:reading` — 1 emitter(s)
- `vael:riderLeft` — 1 emitter(s)
- `vael:riderOpened` — 1 emitter(s)
- `vael:writClosed` — 1 emitter(s)
- `vael:writHullKilled` — 1 emitter(s)
- `vael:writPosted` — 1 emitter(s)
- `vael:writRecalled` — 1 emitter(s)
- `vael:writServed` — 1 emitter(s)
- `vael:writTelegraph` — 1 emitter(s)
- `verb:used` — 1 emitter(s)
- `verge:appealDenied` — 1 emitter(s)
- `verge:appealGranted` — 1 emitter(s)
- `verge:checkpointChallenged` — 1 emitter(s)
- `verge:checkpointCleared` — 1 emitter(s)
- `verge:checkpointScan` — 1 emitter(s)
- `verge:courtConvened` — 1 emitter(s)
- `verge:directive` — 2 emitter(s)
- `verge:directiveViolated` — 1 emitter(s)
- `verge:escortBroken` — 3 emitter(s)
- `verge:escortDemanded` — 1 emitter(s)
- `verge:escortReleased` — 1 emitter(s)
- `verge:incident` — 1 emitter(s)
- `verge:jurorWoke` — 1 emitter(s)
- `verge:lawWoke` — 1 emitter(s)
- `verge:lineTrialPassed` — 1 emitter(s)
- `verge:manifestFined` — 1 emitter(s)
- `verge:massWeighed` — 3 emitter(s)
- `verge:permitDenied` — 1 emitter(s)
- `verge:permitGranted` — 1 emitter(s)
- `verge:permitLapsed` — 1 emitter(s)
- `verge:permitReinstated` — 1 emitter(s)
- `verge:permitSuspended` — 1 emitter(s)
- `verge:pursuitCold` — 1 emitter(s)
- `verge:pursuitCrossed` — 3 emitter(s)
- `verge:pursuitEscaped` — 1 emitter(s)
- `verge:pursuitIntercepted` — 1 emitter(s)
- `verge:pursuitOpened` — 2 emitter(s)
- `verge:pursuitResumed` — 1 emitter(s)
- `verge:pursuitSubmitted` — 1 emitter(s)
- `verge:scanLogged` — 1 emitter(s)
- `verge:treatmentChanged` — 1 emitter(s)
- `vesper:met` — 1 emitter(s)
- `vesper:note` — 1 emitter(s)
- `vesper:performance` — 1 emitter(s)
- `vesper:phraseProgress` — 1 emitter(s)
- `vesper:voice` — 2 emitter(s)
- `vestaOreCache:cargoChanged` — 1 emitter(s)
- `vestaOreCache:clueRecovered` — 1 emitter(s)
- `vestaOreCache:pickupReady` — 1 emitter(s)
- `warrant:acceptPayment` — 1 emitter(s)
- `weapons:debrisOrbitClaimed` — 1 emitter(s)
- `weapons:mineDetonated` — 1 emitter(s)
- `weapons:mortarDetonated` — 1 emitter(s)
- `weapons:mortarLanded` — 1 emitter(s)
- `weather:ionBlackout` — 2 emitter(s)
- `web:linked` — 1 emitter(s)
- `weighing:overMass` — 1 emitter(s)
- `well:capture` — 1 emitter(s)
- `wexTicket:found` — 1 emitter(s)
- `wingMorale:broken` — 1 emitter(s)
- `wingMorale:enraged` — 1 emitter(s)
- `wingMorale:reinforcementBlocked` — 1 emitter(s)
- `wingmen:gap` — 1 emitter(s)
- `world:courtRulingRecorded` — 1 emitter(s)
- `world:criticalSpawnDeferred` — 2 emitter(s)
- `world:originShift` — 1 emitter(s)
- `world:residency` — 3 emitter(s)
- `world:spawnLimited` — 1 emitter(s)
- `world:stuckCleared` — 1 emitter(s)
- `worldPressure:auditDelayed` — 1 emitter(s)
- `worldPressure:colossusRemains` — 1 emitter(s)
- `worldPressure:scaffoldSpawned` — 1 emitter(s)
- `worldPressure:slowGray` — 1 emitter(s)
- `worldPressure:tideChanged` — 1 emitter(s)
- `wreckCourt:action` — 1 emitter(s)
- `wreckCourt:opened` — 1 emitter(s)
- `wreckCourt:result` — 1 emitter(s)
- `wreckCourt:ruled` — 1 emitter(s)
- `wreckEcology:decayed` — 1 emitter(s)
- `wreckEcology:seeded` — 1 emitter(s)
- `wreckMarket:rates` — 1 emitter(s)
- `wreckMission:choiceApplied` — 1 emitter(s)
