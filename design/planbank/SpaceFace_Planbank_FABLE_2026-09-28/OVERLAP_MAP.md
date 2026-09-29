# Overlap map — which FB packets serialize on a shared seam

Domain folders separate understanding, not write-sets. Two packets that carry the same seam tag touch the same owner file and should not run in the same sitting unless one integrator holds both. Inspect `git status --short` and the exact paths before every batch; a live foreign hunk on an owner is a reason to take a different seam, never a reason to stop.

| Shared seam | Packets | Integration rule |
|---|---|---|
| `audioSystem.js` | FB-010, FB-071, FB-078, FB-079, FB-080, FB-081, FB-082, FB-122, FB-126, FB-131, FB-135, FB-142 | One ear packet per sitting; the recipe table and the priority bus are shared, so add routes additively and pin no-double-voice on every event you touch. |
| `saveSystem.js` | FB-015, FB-057, FB-061, FB-093, FB-094, FB-104, FB-105, FB-108, FB-109, FB-110, FB-114, FB-130 | One save-envelope integrator per batch; capture-plan rows, worker changes and eviction order land together and are proven by the corrupt-recovery and atomicity suites before the next packet touches the file. |
| `missions.js` | FB-041, FB-044, FB-056, FB-063, FB-065, FB-066, FB-067, FB-068, FB-137 | The mission owner settles; other systems offer through `mission:offered` and read receipts. One mission packet per sitting. |
| `economy.js` | FB-045, FB-046, FB-047, FB-048, FB-049, FB-068, FB-101, FB-124 | The single writer of credits; every packet here adds a service or a receipt, never a second ledger. |
| `marketNews.js` | FB-034, FB-036, FB-042, FB-045, FB-049, FB-051, FB-052, FB-140 | Subscriptions are additive; every publication carries a citation key or it is dropped by ticker retention. One integrator lands all news subscriptions in a batch. |
| `gameState.js` | FB-004, FB-005, FB-099, FB-100, FB-102, FB-113, FB-126 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `audioRecipes.js` | FB-010, FB-073, FB-078, FB-081, FB-123, FB-135 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `settings.js` | FB-099, FB-100, FB-105, FB-106, FB-112, FB-116 | Rows use the existing builders; the ORRERY lane reads the diff. Never two settings packets in one sitting. |
| `hud.js` | FB-008, FB-012, FB-013, FB-065, FB-137 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `achievements.js` | FB-060, FB-102, FB-103, FB-104 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `enemies.js` | FB-016, FB-017, FB-020, FB-121 | Roster data edits (telegraphs, classes, phases) stack cleanly; run the table tests after each. |
| `gamepad.js` | FB-003, FB-004, FB-005, FB-009 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `input.js` | FB-002, FB-003, FB-004, FB-113 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `onboarding.js` | FB-006, FB-114, FB-117, FB-136 | One teaching integrator per batch; every hint is once-per-profile and never fires in combat. |
| `shipLedger.js` | FB-014, FB-046, FB-069, FB-127 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `swarmMode.js` | FB-023, FB-024, FB-027, FB-120 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `traffic.js` | FB-029, FB-030, FB-128, FB-133 | Role mixes, casts and stamps are one owner; the pocket packet composes after the PB-LANE-WORLD claim releases. |
| `automation.js` | FB-051, FB-054, FB-138 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `camera.js` | FB-082, FB-084, FB-085 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `chronicler.js` | FB-036, FB-064, FB-090 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `combat.js` | FB-016, FB-090, FB-105 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `combatDefs.js` | FB-017, FB-023, FB-121 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `crucible.js` | FB-028, FB-086, FB-087 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `frontierRegions` | FB-029, FB-043, FB-125 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `lawSecurity.js` | FB-039, FB-040, FB-119 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `missingThree.js` | FB-002, FB-116, FB-118 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `playerDefeat.js` | FB-111, FB-119, FB-124 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `renderer.js` | FB-091, FB-092, FB-098 | Serialize admission, residency and draw-path changes; compare `probe-frame-solid` before and after each and never land two renderer packets in one sitting. |
| `sectors.js` | FB-029, FB-062, FB-125 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `serviceQuotes.js` | FB-044, FB-049, FB-124 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `ships.js` | FB-054, FB-059, FB-062 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `shipworks.js` | FB-057, FB-058, FB-061 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `story.js` | FB-063, FB-064, FB-129 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `tetherGameplay.js` | FB-006, FB-009, FB-013 | The signature verb has one owner; receipts and readouts read its state, never re-derive load or cadence. |
| `actionEventRecipes.js` | FB-009, FB-070 | Recipe rows are additive and auto-subscribed; one VFX integrator per batch checks no event gets two rows. |
| `barkDirector.js` | FB-040, FB-139 | Barks are data rows plus one subscription each; keep the ambient gap and voice-arbiter priority; one integrator per batch. |
| `causalVfxGrammar.js` | FB-070, FB-072 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `claims.js` | FB-051, FB-132 | Claim receipts and the defense prompt share payloads; land the receipt subscriptions first. |
| `codex.js` | FB-037, FB-129 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `combatVerbCues.js` | FB-070, FB-080 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `cueRecipes.js` | FB-072, FB-077 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `factions.js` | FB-042, FB-044 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `feel.js` | FB-084, FB-099 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `fields.js` | FB-003, FB-118 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `galaxyMap.js` | FB-132, FB-140 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `hudAttention.js` | FB-013, FB-116 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `masslineHud.js` | FB-006, FB-007 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `masslineInstrument.js` | FB-079, FB-080 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `masslineSnares.js` | FB-010, FB-015 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `missionConditions.js` | FB-065, FB-066 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `pause.js` | FB-085, FB-103 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `propulsionCatalog.js` | FB-008, FB-059 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `saveLoad.js` | FB-110, FB-130 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `saveWorker.js` | FB-093, FB-108 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `stuntCallout.js` | FB-012, FB-014 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `stuntGrammar.js` | FB-012, FB-014 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `survivalArena.js` | FB-022, FB-120 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `survivalRecords.js` | FB-028, FB-104 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `survivalWave.js` | FB-024, FB-027 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `tacticalAI.js` | FB-018, FB-020 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `targetPanel.js` | FB-058, FB-121 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `travelLaneRoutes.js` | FB-033, FB-066 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `vfx.js` | FB-074, FB-096 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `vfxProfiles.js` | FB-021, FB-071 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `world.js` | FB-101, FB-111 | One writer per sitting; later packets read the landed diff first and extend it, never re-derive it. |
| `worldCueRecipes.js` | FB-131, FB-142 | Variants are additive; keep the whitelist in `resolveWorldCueReceipt` in step. |

## Single-packet seams

`flightV3.js` (FB-001) · `pursuitSlotAssist.js` (FB-001) · `powerRail.js` (FB-002) · `drawFlightInput.js` (FB-007) · `drawFlightControl.js` (FB-007) · `massSeed.js` (FB-010) · `masslineCadenceReadout.js` (FB-011) · `masslineTelemetry.js` (FB-011) · `impulseCharges.js` (FB-015) · `tetherWebs.js` (FB-015) · `countermeasures.js` (FB-018) · `pdScreen.js` (FB-018) · `floatingText.js` (FB-019) · `hitVoice.js` (FB-019) · `subsystems.js` (FB-020) · `survivalDraft.js` (FB-021) · `swarmDraft.js` (FB-021) · `stormLatticeArena.js` (FB-022) · `cryoDriftArena.js` (FB-022) · `capitalBossRuntime.js` (FB-024) · `survivalRun.js` (FB-025) · `survivalAnnounce.js` (FB-025) · `survivalHud.js` (FB-025) · `waveMaterialization.js` (FB-026) · `survivalActs.js` (FB-026) · `difficulty.js` (FB-026) · `hunterTricks.js` (FB-027) · `survivalResults.js` (FB-028) · `sectorActivityPockets.js` (FB-030) · `sectorWayOfLife.js` (FB-031) · `sectorPostcard.js` (FB-031) · `sectorZones.js` (FB-031) · `sectorPhysical.js` (FB-032) · `sectorCompositions.js` (FB-032) · `travelLanes.js` (FB-033) · `sectorSim.js` (FB-034) · `livingPoiBehaviors.js` (FB-035) · `localmap.js` (FB-035) · `radar.js` (FB-035) · `voiceBridge.js` (FB-036) · `uniqueWrecks.js` (FB-038) · `uniqueWreckEncounterScripts.js` (FB-038) · `customsPrompt.js` (FB-039) · `impoundPayPrompt.js` (FB-039) · `barks.js` (FB-040) · `lossInvestigation.js` (FB-041) · `conflictReactions.js` (FB-042) · `factions` (FB-043) · `market.js` (FB-045) · `footprint.js` (FB-046) · `marketIntelligence.js` (FB-047) · `cargoDeck.js` (FB-048) · `watchlist.js` (FB-050) · `marketDriverPresenter.js` (FB-050) · `dockArrival.js` (FB-051) · `asteroidSites.js` (FB-052) · `worldSiteMapLayer.js` (FB-052) · `techVerbLadder.js` (FB-053) · `techTree.js` (FB-053) · `tech.js` (FB-053) · `modules.js` (FB-054) · `uniqueLootAbilities.js` (FB-054) · `automationPanel.js` (FB-055) · `asteroidScreen.js` (FB-055) · `contractClauses.js` (FB-056) · `hullIdentity.js` (FB-057) · `buildIdentity.js` (FB-058) · `synergies.js` (FB-058) · `titles.js` (FB-060) · `cargo.js` (FB-061) · `campaignData.js` (FB-063) · `schema.js` (FB-064) · `careerContracts.js` (FB-067) · `shipLedgerPanel.js` (FB-069) · `dockingCradle.js` (FB-073) · `actionVfx.js` (FB-073) · `vfxColorLightDirector.js` (FB-074) · `fragmentFamilies.js` (FB-075) · `pickupMotionPresentation.js` (FB-075) · `wholeShipLodPolicy.js` (FB-075) · `infrastructureMotion.js` (FB-076) · `stationSideEventVfx.js` (FB-076) · `vfxAccessibility.js` (FB-077) · `bombAudio.js` (FB-079) · `cuePriorityBus.js` (FB-083) · `spaceRenderGraph.js` (FB-085) · `killReplay.js` (FB-086) · `killcamTape.js` (FB-086) · `gameOver.js` (FB-087) · `clips.js` (FB-087) · `physics.js` (FB-088) · `spatialHash.js` (FB-088) · `authoritativeSystemManifest.js` (FB-089) · `mining.js` (FB-090) · `wingmen.js` (FB-090) · `collisionConsequences.js` (FB-090) · `liveGeometryAdmission.js` (FB-091) · `decodeTaskBudget.js` (FB-091) · `openingSubmissionPlan.js` (FB-092) · `latePipelineAdmission.js` (FB-092) · `check-phase0-slice-contract.mjs` (FB-095) · `perfRuntime.js` (FB-097) · `hitchClassifier.js` (FB-097) · `runtimeWitness.js` (FB-097) · `batchedInstanceRenderer.js` (FB-098) · `presentationSnapshot.js` (FB-098) · `hudLayout.js` (FB-100) · `stationServices.js` (FB-101) · `main.cjs` (FB-106) · `pipeline.js` (FB-107) · `gameLocalization.js` (FB-107) · `settingsControls.js` (FB-112) · `kit.css` (FB-112) · `migrations.js` (FB-115) · `controlPrompts.js` (FB-117) · `bindings.js` (FB-117) · `range.js` (FB-118) · `surrenderRecovery.js` (FB-119) · `themeMatrix.js` (FB-122) · `captions.js` (FB-123) · `poiBehaviorFamilies.js` (FB-125) · `presentationRunner.js` (FB-126) · `haulerOriginSystem.js` (FB-127) · `ladderShared.js` (FB-127) · `laneContacts.js` (FB-128) · `comms.js` (FB-129) · `scanner.js` (FB-131) · `encounterChoicePrompt.js` (FB-132) · `occupationalTrafficCraft.js` (FB-133) · `dockingCorridor.js` (FB-134) · `fuelReserveWarning.js` (FB-135) · `promptDeck.js` (FB-136) · `storeSentence.js` (FB-136) · `routeRibbon.js` (FB-137) · `wingmanRadial.js` (FB-138) · `e1EncounterRuntime.js` (FB-139) · `aceMemory.js` (FB-139) · `aftermathWrecks.js` (FB-140) · `package.json` (FB-141) · `probe-heap-verify.mjs` (FB-141) · `planetRuntime.js` (FB-142)

## Lines that share an owner with a packet

| Owner file | Lines | Packets |
|---|---|---|
| `achievements.js` | PRO-13 | FB-102, FB-103, FB-104 |
| `actionEventRecipes.js` | PIC-15, PIC-16, PIC-18, FIGHT-08, LAW-02 | FB-009, FB-010, FB-070 |
| `aftermathWrecks.js` | PIC-26, WORLD-41 | FB-140 |
| `audioRecipes.js` | INST-17, INST-20, INST-23, INST-33, INST-34 | FB-010, FB-073, FB-078, FB-081, FB-135 |
| `audioSystem.js` | PIC-15, PIC-18, VERB-18, VERB-24, VERB-28, INST-17, INST-18, INST-19, INST-20, INST-21, INST-24, INST-27, INST-28, INST-29, INST-30, INST-31, INST-32, INST-33, INST-34, FIGHT-07, ECON-03 | FB-010, FB-070, FB-071, FB-073, FB-078, FB-079, FB-080, FB-081, FB-082, FB-122, FB-126, FB-131, FB-135, FB-142 |
| `authoritativeSystemManifest.js` | MACH-01 | FB-089 |
| `automation.js` | ECON-06 | FB-051, FB-054, FB-138 |
| `barkDirector.js` | VERB-21, WORLD-21, WORLD-24, WORLD-28, WORLD-32, FIGHT-06, LAW-03, LAW-05, LAW-07, WORLD-42 | FB-040, FB-100 |
| `barks.js` | WORLD-35 | FB-040 |
| `bindings.js` | PRO-09 | FB-117 |
| `bombAudio.js` | VERB-23 | FB-079 |
| `buildIdentity.js` | INST-32 | FB-058 |
| `captions.js` | INST-24 | FB-123 |
| `cargo.js` | PIC-28 | FB-061 |
| `chronicler.js` | MACH-02 | FB-036, FB-064, FB-090 |
| `claims.js` | WORLD-37, INST-27, STORY-01, LAW-09 | FB-051, FB-132 |
| `clips.js` | VERB-22 | FB-087 |
| `combat.js` | FIGHT-06 | FB-016, FB-090, FB-105, FB-121 |
| `combatDefs.js` | FIGHT-01 | FB-017, FB-023 |
| `combatVerbCues.js` | VERB-19, INST-21, INST-22, INST-23, INST-26 | FB-070, FB-080 |
| `comms.js` | STORY-03 | FB-129 |
| `conflictReactions.js` | STORY-01 | FB-042 |
| `countermeasures.js` | PIC-15 | FB-018 |
| `dockArrival.js` | WORLD-27, WORLD-38, TEACH-07 | FB-051 |
| `economy.js` | ECON-01, ECON-03, ECON-04, ECON-05, ECON-06 | FB-045, FB-046, FB-047, FB-049, FB-068, FB-101, FB-124 |
| `enemies.js` | FIGHT-01 | FB-016, FB-017, FB-020, FB-121 |
| `flightV3.js` | VERB-15 | FB-001, FB-095 |
| `footprint.js` | LAW-08 | FB-046 |
| `galaxyMap.js` | WORLD-37, STORY-05, LAW-09, WORLD-41 | FB-140 |
| `gameLocalization.js` | PRO-02 | FB-107 |
| `gameOver.js` | ECON-07, PRO-14 | FB-087 |
| `gamepad.js` | TEACH-09 | FB-003, FB-004, FB-005, FB-009 |
| `haulerOriginSystem.js` | STORY-07 | FB-127 |
| `hud.js` | VERB-27, PRO-03 | FB-008, FB-012, FB-013, FB-065 |
| `impulseCharges.js` | PIC-17, VERB-30 | FB-015 |
| `infrastructureMotion.js` | PIC-24 | FB-076 |
| `input.js` | VERB-14 | FB-003, FB-004, FB-113 |
| `laneContacts.js` | WORLD-40 | FB-128 |
| `lawSecurity.js` | LAW-01, LAW-08 | FB-039, FB-119 |
| `market.js` | LAW-06 | FB-045 |
| `marketNews.js` | WORLD-22, WORLD-26, WORLD-27, WORLD-31, STORY-01, STORY-06 | FB-034, FB-036, FB-045, FB-049, FB-051, FB-052, FB-140 |
| `masslineHud.js` | VERB-20, VERB-25, VERB-29 | FB-006, FB-007 |
| `masslineSnares.js` | TEACH-04 | FB-015 |
| `mining.js` | WORLD-33 | FB-090 |
| `missions.js` | ECON-02, STORY-02 | FB-041, FB-044, FB-063, FB-065, FB-066, FB-067, FB-068, FB-137 |
| `occupationalTrafficCraft.js` | PIC-30 | FB-133 |
| `onboarding.js` | TEACH-01, TEACH-03, TEACH-04, TEACH-05, TEACH-06, TEACH-07, TEACH-08 | FB-006, FB-114, FB-117, FB-136 |
| `pause.js` | PRO-05 | FB-085, FB-103 |
| `playerDefeat.js` | PRO-03, TEACH-08, ECON-07 | FB-111, FB-119, FB-124 |
| `powerRail.js` | VERB-16, VERB-30 | FB-002 |
| `radar.js` | PRO-04 | FB-035 |
| `range.js` | PRO-04 | FB-118 |
| `renderer.js` | MACH-03, MACH-04, MACH-05, MACH-07, MACH-08 | FB-091, FB-092, FB-098 |
| `runtimeWitness.js` | MACH-06, MACH-07, MACH-09 | FB-097 |
| `saveSystem.js` | PRO-06, PRO-07, PRO-10, PRO-14 | FB-015, FB-093, FB-094, FB-104, FB-105, FB-109, FB-114, FB-130 |
| `sectorSim.js` | WORLD-33 | FB-034 |
| `settings.js` | VERB-14, VERB-15, VERB-17, PRO-05, PRO-08, PRO-12, TEACH-02, PRO-15 | FB-003, FB-004, FB-005, FB-099, FB-100, FB-105, FB-106, FB-112, FB-113, FB-116, FB-126 |
| `stationServices.js` | WORLD-38, INST-29 | FB-101 |
| `story.js` | STORY-04, STORY-05 | FB-063, FB-064, FB-129 |
| `stuntCallout.js` | VERB-26 | FB-012, FB-014 |
| `survivalAnnounce.js` | FIGHT-02, FIGHT-10 | FB-025 |
| `survivalDraft.js` | FIGHT-03, FIGHT-04 | FB-021 |
| `survivalRun.js` | FIGHT-04 | FB-025 |
| `swarmMode.js` | FIGHT-10 | FB-023, FB-024, FB-027, FB-120 |
| `tetherGameplay.js` | PIC-13, VERB-20, VERB-21 | FB-006, FB-009, FB-013 |
| `traffic.js` | PIC-21, PIC-25, WORLD-21, WORLD-22, WORLD-32, WORLD-35, WORLD-40 | FB-030, FB-133 |
| `uniqueLootAbilities.js` | INST-31 | FB-054 |
| `uniqueWrecks.js` | STORY-06 | FB-038 |
| `vfx.js` | PIC-14 | FB-074, FB-096 |
| `world.js` | WORLD-25, WORLD-26, FIGHT-02, STORY-03, MACH-06 | FB-101, FB-111 |
| `worldCueRecipes.js` | PIC-20, PIC-21, PIC-26, PIC-27, PIC-28 | FB-131, FB-142 |

## Parallel pattern

Pick one packet per seam family per sitting: one massline owner, one traffic/jobs owner, one economy owner, one renderer/VFX owner, one audio owner, one save owner. Lines are safe to run beside a packet when their paths do not appear in that packet's write-set (the table above).
