# First ten batches — recommended dispatch order

Each batch is one integrator's sitting. Where packets in a batch share a seam (listed per batch below, derived from the seam tags), they land in the order given, by one integrator, never in parallel; packets that share no seam may run beside each other. Lines listed with a batch touch no owner file in that batch's write-sets. The order front-loads surface-before-invent work (dead seams, unwired data), then the pieces other batches read.

## Batch 1 — Surface before invent — the dead-seam sweep

Highest evidence density in the bank: every packet here wires an event or a table that already computes, so risk is lowest and player-visible gain arrives first. Two packets share the action-recipe table, so they land in the order given.

Shared seams in this batch: `actionEventRecipes.js` (serialize on these).

- FB-070 — Every refusal the player causes has one voice and one withdrawal shape (THE PICTURE; seams combatVerbCues.js, causalVfxGrammar.js, actionEventRecipes.js)
- FB-009 — Thirteen receipts from the signature verb reach the picture and the pad (THE HAND; seams actionEventRecipes.js, tetherGameplay.js, gamepad.js)
- FB-051 — Claims and automation report their receipts: convoys arrive, patrols rotate, income lands, raids warn (THE LONG GAME; seams claims.js, automation.js, marketNews.js, dockArrival.js)
- FB-040 — Fourteen silent law receipts get a voice where they matter to the player (THE WORLD; seams barkDirector.js, lawSecurity.js, barks.js)
- FB-053 — Every research node reads as what you can do now, using the verb ladder that already exists (THE LONG GAME; seams techVerbLadder.js, techTree.js, tech.js)
- FB-074 — The authored light identities drive event lights instead of per-call-site hand tuning (THE PICTURE; seams vfxColorLightDirector.js, vfx.js)
- FB-134 — The docking corridor clears its far-quiet latch on the sector event the world actually emits (THE WORLD; seams dockingCorridor.js)
- Lines to run beside it: WORLD-27, INST-25, PRO-01, FIGHT-03, PIC-23

## Batch 2 — The ear, first sitting

The ear packets all touch `audioSystem.js`, so they run one per sitting; the kill ladder and the dispatcher unlock every later voice.

Shared seams in this batch: `audioSystem.js`, `audioRecipes.js` (serialize on these).

- FB-080 — The combat verb cue table dispatches every row it authors, with one writer per massline event (THE EAR; seams combatVerbCues.js, audioSystem.js, masslineInstrument.js)
- FB-078 — Light, medium and heavy kills sound different by acoustic mass, the way slams already do (THE EAR; seams audioSystem.js, audioRecipes.js)
- FB-123 — Every gameplay cue the game can play has a caption record, checked by a test that walks the recipes (THE EAR; seams captions.js, audioRecipes.js)
- Lines to run beside it: INST-17, INST-21, INST-22

## Batch 3 — The fight reads

Roster data (telegraphs, mass classes, variant pairs) and the provenance families are data-heavy, test-pinned and independent of the Crucible packets; they make every later fight legible.

Shared seams in this batch: none (packets may run in parallel).

- FB-016 — Every enemy archetype carries a telegraph block, so intent is readable before the shot (THE FIGHT; seams enemies.js, combat.js)
- FB-071 — Every weapon's picture and voice agree, keyed on the impulse provenance it already carries (THE FIGHT; seams vfxProfiles.js, audioSystem.js)
- FB-019 — A hit confirms in three states at the reticle: shield, armor, hull (THE FIGHT; seams floatingText.js, hitVoice.js)
- FB-018 — The flak turret's intercept flag intercepts, and the PD screen escort is reached by the live AI (THE FIGHT; seams countermeasures.js, pdScreen.js, tacticalAI.js)
- Lines to run beside it: FIGHT-01, FIGHT-06, FIGHT-05

## Batch 4 — The Crucible on the default route

Roster, boss machine, intro window and arc difficulty change what the default swarm run is; they share `swarmMode.js` and `survivalRun.js` seams so they land in sequence under one integrator.

Shared seams in this batch: `swarmMode.js` (serialize on these).

- FB-023 — The warden, the cutter and the lawman reach the default Crucible route (THE FIGHT; seams swarmMode.js, combatDefs.js)
- FB-025 — Arena and wave intros are real windows that say what is coming (THE FIGHT; seams survivalRun.js, survivalAnnounce.js, survivalHud.js)
- FB-026 — The scored arc stops inflating hull and damage; its curve moves into composition (THE FIGHT; seams waveMaterialization.js, survivalActs.js, difficulty.js)
- FB-024 — The Crucible's every-ten-waves champion can be an authored capital with a telegraphed score (THE FIGHT; seams survivalWave.js, swarmMode.js, capitalBossRuntime.js)
- Lines to run beside it: FIGHT-02, FIGHT-04

## Batch 5 — The machine, table clock

Deterministic, measurable, goldens-guarded: the four table-clock packets and the wall-time guard change no picture and free the frame the presentation packets will spend.

Shared seams in this batch: none (packets may run in parallel).

- FB-088 — The dynamic spatial hash rebuilds only when a body actually moved cells (THE MACHINE; seams physics.js, spatialHash.js)
- FB-089 — Every registered system sits on exactly one declared clock, never 60 Hz by omission (THE MACHINE; seams authoritativeSystemManifest.js)
- FB-090 — The five loudest idle systems learn the quiet latch the others already use (THE MACHINE; seams combat.js, mining.js, wingmen.js, collisionConsequences.js, chronicler.js)
- FB-095 — The determinism guard bans wall time in sim owners, not only Math.random (THE MACHINE; seams check-phase0-slice-contract.mjs)
- Lines to run beside it: MACH-01, MACH-02, MACH-06

## Batch 6 — The save envelope

One integrator, one sitting: bounded gzipped writes, one worker, eviction order and the deployable/onboarding capture rows are proven together by the corrupt-recovery and atomicity suites.

Shared seams in this batch: `saveSystem.js` (serialize on these).

- FB-093 — Save writes are bounded and gzip-compressed inside the worker that already serializes them (THE MACHINE; seams saveSystem.js, saveWorker.js)
- FB-094 — Autosave reuses one long-lived worker instead of spawning one per request (THE MACHINE; seams saveSystem.js)
- FB-109 — Quota eviction never destroys every rollback copy at once (THE MACHINE; seams saveSystem.js)
- FB-015 — A deployed snare, an armed charge network and a live web survive save and load (THE HAND; seams saveSystem.js, masslineSnares.js, impulseCharges.js, tetherWebs.js)
- FB-114 — The first-hour rail and the pad tuning survive a save and a load (THE MACHINE; seams saveSystem.js, onboarding.js)
- Lines to run beside it: PRO-06, PRO-07

## Batch 7 — The world gets faces and rhythms

Sector data packets are independent of the parked pocket lane and give the frontier its first identity; the ticker packets consume their events.

Shared seams in this batch: `marketNews.js` (serialize on these).

- FB-029 — Nineteen sectors stop sharing one byte-identical traffic mix (THE WORLD; seams sectors.js, frontierRegions, traffic.js)
- FB-032 — Seventeen frontier sectors stop inheriting Helios' physics and Helios' arrangement (THE WORLD; seams sectorPhysical.js, sectorCompositions.js)
- FB-031 — The authored way-of-life sheet is read on arrival and feeds the zones it describes (THE WORLD; seams sectorWayOfLife.js, sectorPostcard.js, sectorZones.js)
- FB-034 — A day passing is a beat the player can read: what changed and why (THE WORLD; seams sectorSim.js, marketNews.js)
- FB-036 — The chronicler's cited story arcs are published where the player reads news (THE WORLD; seams chronicler.js, voiceBridge.js, marketNews.js)
- Lines to run beside it: WORLD-35, WORLD-22, WORLD-38

## Batch 8 — The hands and the teaching

Pad coverage needs input ownership and focused validation, so it takes its own sitting; the teaching packets ride the onboarding seam beside it.

Shared seams in this batch: `input.js`, `missingThree.js` (serialize on these).

- FB-003 — A pad player can reach every bound flight verb, not two-thirds of them (THE HAND; seams gamepad.js, input.js, fields.js)
- FB-116 — Charge throw, bullet time, cloak, beacon, skim collector and jettison are each spoken once and rebindable (THE HAND; seams missingThree.js, hudAttention.js, settings.js)
- FB-117 — A pad or touch player sees pad or touch prompts, from the tables that already exist (THE HAND; seams controlPrompts.js, bindings.js, onboarding.js)
- FB-002 — The second speed is taught once and has a place on the verb shelf (THE HAND; seams missingThree.js, powerRail.js, input.js)
- Lines to run beside it: TEACH-01, TEACH-06, VERB-15

## Batch 9 — The long game you can read

Economy receipts and the debt instrument share the single credit writer; the ship-identity packets share Shipworks; both groups are data-plus-one-reader and safe to run beside the ear.

Shared seams in this batch: `economy.js`, `marketNews.js`, `shipworks.js` (serialize on these).

- FB-045 — The market says why a price moved and which station is starving (THE LONG GAME; seams economy.js, marketNews.js, market.js)
- FB-049 — A loan can be taken, a balance can be seen, and a stale debt is announced (THE LONG GAME; seams economy.js, serviceQuotes.js, marketNews.js)
- FB-057 — The persistent ship can be named by its owner (THE LONG GAME; seams hullIdentity.js, shipworks.js, saveSystem.js)
- FB-058 — The archetype badge and the synergy tell your fit earns are printed where you fit (THE LONG GAME; seams buildIdentity.js, synergies.js, shipworks.js, targetPanel.js)
- FB-063 — Beats 4–7 use the authored step machine, so a stuck player hears the recovery line (THE LONG GAME; seams story.js, campaignData.js, missions.js)
- Lines to run beside it: ECON-01, ECON-03, STORY-02

## Batch 10 — Professional parity

Settings, fuel, statistics and the shell are independent seams with mature-parity payoff; the ORRERY-routed screens are listed so the lane sees the sim contracts they read.

Shared seams in this batch: `settings.js`, `gameState.js` (serialize on these).

- FB-099 — Three shipped settings controls stop being dead, and a check keeps new ones honest (THE INSTRUMENT; seams settings.js, feel.js, gameState.js)
- FB-100 — HUD scale and opacity, camera distance, post-processing, sharpen and the voice bus get rows and defaults (THE INSTRUMENT; seams gameState.js, settings.js, hudLayout.js)
- FB-101 — A dry tank with no credits is a situation with a way out, not a soft lock (THE WORLD; seams world.js, stationServices.js, economy.js)
- FB-102 — The sim keeps the career numbers a statistics screen needs: distance flown, kills by weapon, biggest throw, time per sector (THE LONG GAME; seams achievements.js, gameState.js)
- FB-106 — The desktop shell remembers window bounds and mode, and Settings has a window-mode row (THE MACHINE; seams main.cjs, settings.js)
- Lines to run beside it: PRO-02, PRO-03, PRO-08
