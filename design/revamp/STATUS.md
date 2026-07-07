# SpaceFace Revamp — Wave 1.5 Status

Captured: 2026-07-05 (post Wave-2 combat closure + story/HUD minimum).

## Shipped (Wave 1.5)

### Combat ceiling (BP-02) — closed for play
- Shared lead solver exported from `src/systems/weapons.js` (`solveLeadAngle`); HUD façade in `src/ai/gunnery.js`
- Lead pip overlay in `src/ui/hud.js` + `.sf-leadpip` styles in `src/ui/uiRoot.js`
- Damage triangle (E/K/X) on `src/ui/targetPanel.js` against current shield/armor/hull layer
- Scan → weak-point reveal → bonus damage + callout (`src/data/weakPoints.js`, `scanner.js`, `combat.js`, `floatingText.js`)
- Missile LOS + fuel + coast (`combat.missileV2` flag); momentum inherit stub stays OFF
- Tier-B flags in `src/data/featureFlags.js` (OFF in node golden, ON in browser)
- Acceptance: `npm run check:combat-ceiling`

### Story wire minimum (BP-05)
- Helix Directorate paper faction in `src/data/factions.js` (`faction_helix`, zero ships)
- B8 beat registered in `src/data/narrative.js` (`BEAT_CONTENT[8]`, `story_b8_helix_audit`)
- B8 fires once on `salvage:communicatorFound` via `src/systems/story.js` `_onB8SalvageTrigger`
- Story comms route surfaced notifications through `ctx.helpers.voice.say` (one-voice arbiter)
- Acceptance: `npm run check:story-beats`

### Contact HUD identity (BP-10 subset)
- Target panel identity row: faction · role · state · threat tier · level (`sf-target__identity`)
- Extended `scripts/check-ui-identity.mjs` coverage

### Regression floor (unchanged baseline)
- `check:bundle`, `check:mining:2`, `check:ai` green
- `check:sim:compare` fails **only** on documented 47-A projectile-collision precondition (`design/revamp/_BASELINE.md`)

### Verification scripts (all green except documented sim precondition)
- `npm run check:combat-ceiling` — 9 checks
- `npm run check:story-beats` — 6 checks
- `node scripts/check-ui-identity.mjs` — 12/12
- `npm run check:wave15-flight-boot` — flight boot + lead pip + weak-point + identity screenshot
- `npm run check:wave15-regression` — bundle/mining/ai green; sim:compare fails only on 47-A projectile-collision precondition per `_BASELINE.md`

### Evidence (scratch)
- `wave15-regression.log`, `wave15-boot.log`, `wave15-combat-panel.png`

---

## Remaining (hard half of Wave 2)

### BP-07 Flight & traversal — **not started** (highest golden risk)
- Brake-to-stop (Space), mass-wired handling, leash-steering to GDD targets
- Ring-lane mechanic (traversal code; gate visuals remain Grok lane)
- Tether traversal extensions (yank, wreck tow, slingshot)
- Requires Fable advisor sign-off + fresh baseline diff before touching `flightV3.js`

### BP-05 Story — full corpus deferred
- Complete B8+ beat registry (only B8 minimum shipped)
- Wren artifact quest chain (cargo item, anomaly/salvage depth, quest markers)
- Manifest phases 2–3 *content* expansion (phase machinery exists; more beats needed)
- NPC-ecology graffiti web (Kessler↔Drift↔Voss↔… full wiring)
- Callum encounter, VALE registry sightings, faction bark corpus on all SG-06 transitions
- Endgame A–E re-wire (already built; no change needed)

### BP-10 Render code — gaps
- Standalone `src/render/ribbonTrails.js` extraction (ribbons exist inline in `vfx.js`)
- Dedicated contact badges on radar (overview strip has threat tier; radar row not extended)
- `check:perf` re-measure with all post toggles on (bloom/ACES/fog/lights pre-exist)

### BP-02 Combat — optional/deferred
- `beamWeapons.js` module (pipeline already in `weapons.js`→`combat.js`; document only)
- `momentumInherit` playtest enablement
- `check:combat-ceiling` browser screenshot proof (module smoke + structural checks pass)

### Wave 2 §6 handoff — partial
- This STATUS doc replaces ad-hoc `CURRENT_BUILD_STATUS` drift for revamp scope
- `design/revamp/WAVE3_PROMPT.md` pre-authored (detail layer); Wave 4 holds wingman orders, one-map cutover, overload/vent, tooltips/a11y

### Asset-gated (Grok lane — out of scope for Wave 1.5 code goal)
- Blender/GLB authoring, `parts_manifest.json`, ring-gate/landmark visuals, PBR hero maps
- **Note:** `assets/**` changes in the working tree are **concurrent graphics-lane work** (not modified by this Wave 1.5 code goal). Scoped file list: `{SCRATCH}/wave15-changed-files.log`.

### Lead pip proof (structural fix)
- Pure gate: `computeLeadPipOverlay()` in `src/ai/gunnery.js` (headless-tested in `check:combat-ceiling`)
- DOM path: `hud.frame()` → `updateCombatHud()` applies overlay coords; `check:wave15-flight-boot` asserts `.sf-leadpip.visible` strictly (no fallback math)

---

## Reconciliation pass (concurrent render + flight lanes) — 2026-07-06

A later orchestration session reconciled the **uncommitted** concurrent graphics/flight work that was
sitting in the working tree alongside the committed combat+story lanes. Two adversarial read-only
reviewers (render, flight) + the Fable advisor drove this. Verdicts and fixes:

### Render code lane (BP-10) — KEEP + one fix applied
- New shared trail system (`trailTexture.js`, `engineTrailSurfaces.js` — ribbon + streak-mesh pool),
  `hlod.js` (legit distance impostor, detail preserved not deleted), `postTelemetry.js`, plus vfx/renderer/
  bloom/partsLibrary edits. **Golden-safe** (vfx runs in the render phase, never the sim step).
- **FIXED — HARD RULE #3 (no quality reduction):** the new streak/ribbon surfaces originally had NO
  quality toggle and had replaced the old particle path. Added `settings.video.engineTrails` (default true) +
  `richEngineTrailsEnabled(video)` in `vfx.js` gating both `_spawnTrailStreak` and the ribbon path (off →
  degrades to the base particle look; also off at `particleQuality:'low'`/`motionReduce`). Settings UI row added.
  Still TODO (Wave 3): capture the 30fps-floor A/B and the mapless→textured hull-material spot-check.
- New render/perf gates (`check:render-hotpath`, `check:ship-material-sharing`, `check:station-hlod`,
  `check:spatial-hash`, `check:vfx-sleep`, `check:perf-summary`, `probe-gpu-path`) audited: mostly HONEST
  behavioral asserts; `check:render-hotpath` is grep-heavy and `check:perf-budget` is a doc-keyword linter (weak).

### Flight/tether lane — KEEP (this is NOT BP-07 feel work)
- `masslineTricks.js` → split into `masslineTelemetry.js` (read-only observer) + `tetherGameplay.rateRelease()`
  + tiered release feedback; incidental snap-policy bugfix + latch-grace fix. Clean removal (no dangling refs).
- `check:flight:clean` + `check:juice` PASS; new `check:massline:*` gates are honest. Golden byte-identical
  (the 47-A tape has no break event, so the cut-threshold retune has no fixture to perturb).
- **BP-07 headline items remain UNBUILT** (leash-steering, brake-to-stop/Space, mass-wired handling,
  ring-lane mechanic). Correctly DEFERRED — a half-tuned `flightV3.js` is the one way to leave the tree worse.

### Gate seam fix (orchestrator)
- Split `check:runtime-assets` OUT of `check:bundle` → own `check:assets` gate. `check:bundle` is now
  code/reachability-only and GREEN; `check:assets` is allowed-red on Grok's GLB asset debt (dock-interior
  NORMALs, 8 station-lod0 markers), documented like the 47-A precondition. Keeps the code-merge gate honest.

### Corruption recovery (concurrent-writer hazard)
- A stash-collision from the review pass clobbered `src/systems/combat.js` (−89 lines, lost weak-point
  integration + World-Overhaul faction precedence) and `src/core/physics.js` (−100, lost the
  `projectileSweepLimit` maxDistance-enforcement invariant). Both **restored from HEAD** and re-verified
  byte-identical golden. `src/combat/damage.js` scratch-reuse perf-opt was verified legit and KEPT.

### Verified state at end of pass (all GREEN except the documented asset gate)
`check:bundle` · `check:combat-ceiling` · `check:story-beats` · `check:mining:2` · `check:flight:clean` ·
`check:juice` · `check:ai` all PASS. `check:sim:compare` fails ONLY on the documented 47-A
projectile-collision precondition (`_BASELINE.md`) — byte-identical. `check:assets` RED on Grok's GLB debt.
- **Committed:** combat (BP-02) + story-minimum (BP-05). **Uncommitted (reviewed+kept, gremlin-protected via
  `git add -N`):** render lane + engineTrails fix, flight massline refactor, damage.js perf-opt, gate-seam.
  Recommend committing these as durable lanes.

## Wave 4 — T3 massline ladder resumed (2026-07-06)

### T3-04 `tether.load` (rung 04) — DONE
- `state.player.tether.load`: 0..1 PRESENTATION signal, separate from `tether.strain` (physical break
  ratio, untouched). Formula: `load = clamp(max(strain*2.5, baseByPhase), 0, 1)`, floors
  `{slack:0, capture:0.35, loaded:0.55, overload:0.9}` — exported as `computeTetherLoad()` in
  `tetherGameplay.js`; mirrored in `_mirror`; relayed by `masslineTelemetry.js` (`telemetry.load`).
- `vfx.js` tether cable: ordinary glow/color/band/anchor reads now key off `load` (loadSmooth);
  physical strain keeps sag geometry, taut width, overload flicker, and near-break sparks.
- Acceptance: `npm run check:massline:load` PASS (real tetherGameplay+masslineTelemetry integration:
  inactive→0, slack≈0, capture≥0.25, loaded+low-strain≥0.5, overload≥0.9, strain byte-equal to
  lastTension/breakTension). Adjacent green: `check:massline:{telemetry,release,release-feedback}`,
  `check:sg02:{tether,tether-break}`. `check:sim:compare` failure identical to `_BASELINE.md`
  (47-A projectile-collision precondition only).
### T3-09..12 "make the swing readable" loop (rungs 09-12) — DONE (2026-07-06)
- **09 threat events**: NEW observer `src/systems/masslineThreats.js`, registered immediately after
  `masslineTelemetry` (registry SYSTEMS + UPDATE_ORDER + rationale comment). Reads settled tether
  mirror + telemetry + entities; writes ONLY `state.player.masslineThreats`; single documented emit
  `massline:threat` {kind, targetId, severity, tick, time}. Kinds: `line-near-break` (strain ≥ 0.75
  overload floor, once/latch), `hostile-on-arc` (scanner.isHostileToPlayer + closing ≥ 12.5 wu/s +
  genuine swing ≥ 25 wu/s, once/hostile/latch), `collision-course` (ballistic first-contact ≤ 1.5 s,
  once/obstacle/latch). `check:massline:threats` PASS (9 cases); 4 break-controls each failed red.
- **10 threat feedback**: `presentationOrchestrator` consumes `massline:threat` → `massline.threat`
  cue (severity→magnitude, kind in tags; sibling of tether.near_break); recipe in `cueRecipes.js`;
  adapters fan-out audio sting + ONE non-diegetic HUD warn ('SWING THREAT') + caption.
  `check:massline:threat-feedback` PASS (5 cases incl. end-to-end from the real rung-09 observer +
  dedupe suppression); 3 break-controls red.
- **11 arc-preview data**: `telemetry.arcPreview` {peakSpeed = targetSpeed+|relVel| (≥ current speed),
  exitAngle, exitSpeed, timeToWhip (taut-solve, null > 8 s), viable (loaded phase + tangentQuality
  ≥ 0.5 + exit ≥ 25 wu/s + anchor-clearance ray test)} recomputed per active tick, cleared inactive;
  in FALLBACK/freshRuntime/writeInactive. `check:massline:arc-data` PASS (7 cases incl. isolated
  anchor-clearance A/B); 4 break-controls red.
- **12 arc-preview render**: `vfx.js` `_initArcPreview`/`_updateArcPreview` (tether-cable siblings,
  gated by `_arcPreviewActive` in update()): faint dashed additive ribbon along the exit vector,
  length ∝ peakSpeed (24-130 wu), visible only tethered+viable, fade envelope, cosmetic-only
  (Math.random shimmer — VFX exempt). `check:massline:arc-render` PASS (5 cases); vfx
  trail-bind/frame-sleep/sg08 green; 3 break-controls red.
- No-regression: all 12 `check:massline:*` green after each rung; `check-tether-gameplay` green;
  `check:sim:compare` fails ONLY on the documented 47-A projectile-collision precondition —
  A/B-verified byte-identical with masslineThreats unregistered. Pre-existing (not ours):
  `check-phase0-slice-contract` red on `stationHub.js:1226` Math.random site (committed 7/5 state,
  zero working diff). Next: **T3-13 (whip-impact detect) — Chunk B, whip+impulse**.

### T3-13 whip-impact detect (rung 13) — DONE (2026-07-06)
- NEW observer `src/systems/masslineImpacts.js`, registered immediately after `masslineThreats`
  (registry SYSTEMS + UPDATE_ORDER + rationale comment). The whip verb belongs to the MASS: the
  tether target — latched, or coasting ≤ 6 s post-release (sling window, armed only if it left the
  line ≥ 25 wu/s) — contacting a solid body (asteroid/ship/station/drone; never the player, never
  itself) with world speed ≥ 25 wu/s AND relative contact speed ≥ 25 wu/s (the SNAP_CATCH
  "genuinely moving" bar). Contact = padded-radius overlap OR one-tick swept crossing (no
  tunneling). Once per victim per run; a new latch re-arms; a relatch onto the sling-tracked mass
  resumes the same run. Writes ONLY `state.player.masslineImpacts` {tracking, slung, massId,
  impacts[cap 12], latest}; records PERSIST post-run (the rung-20 debris-sling proof reads them
  after the fact); single emit `tether:whipImpact` {targetId=mass, victimId, relSpeed, massSpeed,
  mass, momentum, slung, severity, rating glance/solid/crushing, tick, time} — momentum is the
  rung-14 damage read.
- `check:massline:whip-impact` PASS (10 cases: latched full-record, slow-contact gate, parked-tow
  gate, once-per-victim + relatch re-arm, slung end-to-end, window expiry, static release,
  no-tether, player-never-victim, observer-only); 4 break-controls red (relSpeed gate, per-victim
  throttle, sling arming, world-speed gate). No-regression: all 12 prior `check:massline:*` +
  `check-tether-gameplay` green; `check:sim:compare` fails ONLY on the documented 47-A
  projectile-collision precondition (identical to `_BASELINE.md`). Next: **T3-14 (whip feedback)**.


### T4c-1 WRECK_PROVENANCE — BP-01.1 loss ledger seam — DONE (2026-07-07)
- NEW event-sourced loss recorder `src/systems/lossLedger.js` + pure wreck-class taxonomy
  `src/data/wreckClasses.js` (fresh/battlefield/military/ancient; military=restricted for the later
  SALVAGE_PERMIT packet). The system LISTENS to the two loss events ALL offscreen+live+offline
  losses funnel through (`automation:assetLost {kind,id,value,sectorId}` +
  `automation:outpostRaided {outpostId,sectorId,lossVol}` — `offscreenRiskPass` reuses them, so one
  subscription pair captures 100% of losses). Records structured entries
  `{lossId, sectorId, assetId, factionId, kind, simDay, t, cargoHint, value, source}` in a per-sector
  ring buffer (MAX_PER_SECTOR=8, newest-first, global backstop 64). Seeded lossId via
  `hash32(seed,sectorId,kind,simTime,assetId)` — same loss ⇒ same id on every load, so the ledger
  and the wreck read IDENTICAL provenance (both key off lossId+sectorId — failureMode "provenance
  drift" closed). Public reads: `lossesFor/latestLossFor/latestLossLine`.
- Wreck tagging is ADDITIVE via `entity:spawned` (coreSystem.js:29) — NO edit to salvage.js or
  intervention.js. A wreck spawned in a sector with a recorded loss gets `data.provenance` +
  `data.wreckClass` + an enriched `data.scanLabel` (the class label); communicators keep their
  mission-bearing label (don't clobber the mission hook). A wreck with NO recorded loss is UNCHANGED
  (generic debris) — this is the golden-sim-safe path: the 47a slice emits no loss events ⇒ the
  ledger stays empty ⇒ no leak.
- One news-channel voice headline per loss via `ctx.helpers.voice.say({channel:'news'})`
  (marketNews.js has NO inbound custom-headline event — the 'news' voiceArbiter channel IS the
  station-news channel). Emits ONLY `lossLedger:recorded` (consumed by GHOST_CONVOY_RUMOR +
  CONVOY_LOSS_INVESTIGATION) — single-writer honored, never writes credits/cargo/rep. Serialize/
  deserialize round-trips through saveSystem (durable subset: entries + seed; bySector rebuilt).
- `check:wreck-provenance` PASS (14 tests: catalog integrity, event-sourcing empty-until-loss,
  loss→entry+headline, outpost raid, seeded determinism, wreck tagging, no-provenance unchanged,
  communicator-keeps-label, ring buffer, single-writer, dedupe, serialize round-trip + 3 non-vacuous
  controls). Non-vacuous controls proven: (A) break event-sourcing → record from a non-loss event →
  FAIL → restore GREEN; (B) break ring buffer cap → unbounded → FAIL → restore GREEN. No-regression:
  `check:causal-economy` 8/8 GREEN, `check:balance` 0 FAIL, `check:sim:compare` fails ONLY on the
  documented 47-A projectile precondition (identical to `_BASELINE.md`). **Unblocks CONVOY_LOSS
  INVESTIGATION (T4b last hole) + GHOST_CONVOY_RUMOR (T4c-4).** Next: **T4c-2 SALVAGE_DISTINCT_FROM_MINING**.

### T4b-10 CONVOY_LOSS_INVESTIGATION — BP-12 hole closed — DONE (2026-07-07)
- NEW event-driven `src/systems/lossInvestigation.js` registered after `salvage` and before
  `missions`, so salvage can place points first and the provenance overlay can mutate the outgoing
  `mission:offered` payload before consumers see it. It reads the real `lossLedger` only; no recorded
  sector loss means strict no-op, no communicator promotion, and no offer rewrite.
- With a recorded loss, exactly one existing salvage point/entity in that sector is promoted into a
  communicator. It does not spawn extra entities, and it reuses `wm_manifest_run` /
  `wm_blackbox_attacker` from `wreckMissions`. The outgoing salvage offer remains `source:'salvage'`
  and `tag:'wreck_salvage'`, with additive `lossInvestigation` metadata and log/summary text naming
  the lost asset/faction/sector. No direct credits/cargo/rep writes.
- `check:convoy-loss-investigation` PASS + non-vacuous control: disabling `point.isCommunicator`
  made the check fail (`0 !== 1` promoted points), then restore GREEN. `check:causal-economy` now
  includes this row and passes. No-regression: `check:wreck-provenance` PASS, `check:balance` 0 FAIL.
  `check:sim:compare` fails only on the documented 47-A projectile-collision precondition; A/B with
  the new registry entry temporarily removed produced the identical `sf-sim.mjs:1161` failure.
  Next backend row per objective: **T4c-2 SALVAGE_DISTINCT_FROM_MINING**.

### T4c-2 SALVAGE_DISTINCT_FROM_MINING — wreck verbs + reactor counterplay — DONE (2026-07-07)
- NEW pure catalog `src/data/salvageActions.js`: debris maps to `cut_panel`, communicators to
  `decode_blackbox`, ship/module wreckage to `pull_module`, and unstable reactors to `vent_reactor`.
  Each verb has a distinct label/glyph/pool; reactor action carries explicit `vent` and `tether-away`
  counterplay plus bounded burst damage.
- NEW event-driven `src/systems/salvageActions.js` registered beside salvage/lossInvestigation. It
  annotates existing wreck entities on `entity:spawned`, surfaces a targeted scan readout on
  `scan:completed`, and handles the unstable-reactor timer. Venting or towing the reactor clear emits
  a counterplay receipt and prevents damage; ignoring it routes one bounded hit through
  `combat.onHit` (or emits `combat:hit` only if combat is absent), then consumes the wreck.
  No edits to `salvage.js`, `mining.js`, or `combat.js`; no new spawns.
- `check:salvage-actions` PASS + non-vacuous control: forcing every wreck to use one generic pool
  made the check fail on the distinct-pool assertion, then restore GREEN. No-regression:
  `check:wreck-provenance` PASS, `node scripts/check-tether-gameplay.mjs` PASS, `check:balance` 0
  FAIL. `check:sim:compare` fails only on the documented 47-A projectile-collision precondition;
  A/B with only the new `salvageActions` registry entry removed produced the identical
  `sf-sim.mjs:1161` failure. Next backend row: **T4c-3 SURVIVOR_POD_TRIAGE**.

### T4c-3 SURVIVOR_POD_TRIAGE — survivor-pod rescue/strip backend — DONE (2026-07-07)
- NEW event-driven `src/systems/survivorPod.js` registered after `salvageActions` and before
  `factions`/`missions`. It promotes exactly one existing salvage point/entity in a sector into a
  tetherable `wm_survivor_pod` communicator; it does not spawn content and does not edit
  `salvage.js`, `missions.js`, `wreckMissions.js`, or `economy.js`.
- The outgoing salvage `mission:offered` payload is stamped with the shipped `wm_survivor_pod`
  template and exact binary `choice`, converted to a `passenger_transport` offer with one passenger,
  a concrete destination, and `faction_scn` (Solar Concord Navy/Concord goodwill). The oxygen clock
  is visible metadata on the offer and `state.ui.survivorPod`; expiry is soft, decaying reward down
  to a floor rather than killing the pod.
- Rescue requires the pod to be under tow and emits `survivorPod:rescueSelected`; payout and
  goodwill remain on the passenger mission completion path. Strip emits `economy:grantCredits` plus
  `faction:repDelta{reason:'survivorPod:strip'}` and resolves the pod; no direct credits/rep writes.
- `check:survivor-pod` PASS + non-vacuous control: forcing the rescue offer type back to
  `salvage_retrieval` made the check fail, then restore GREEN. No-regression:
  `check:causal-economy` PASS (now includes `check:salvage-actions` + `check:survivor-pod`),
  `check:wreck-provenance` PASS, `check:salvage-actions` PASS, `check-tether-gameplay.mjs` PASS,
  `check:balance` 0 FAIL. `check:sim:compare` fails only on the documented 47-A projectile-collision
  precondition; A/B with only the new `survivorPod` registry entry removed produced the identical
  `sf-sim.mjs:1161` failure. Next backend row: **T4c-4 GHOST_CONVOY_RUMOR**.

### T4c-4 GHOST_CONVOY_RUMOR — repeated-loss raider-nest rumor — DONE (2026-07-07)
- No new runtime system. `src/systems/lossLedger.js` now owns the read rule promised by the spec:
  when the event-sourced ledger records at least three losses in the same sector/faction lane and
  `sectorSignalFor(sectorId).driver.danger === 'reach_pressure'`, it emits a durable one-shot
  `rumor:ghostConvoy` intent plus a `mission:offered` payload. Fewer than three losses, calm/non-Reach
  pressure, or losses split across victim factions stay silent.
- The emitted offer reuses shipped `wm_reach_bounty` and the existing `bounty_hunt` mission pipeline:
  it carries `targetStrength`, `clearCount`, reward/time/risk fields, concrete sector/station anchors,
  and `budgetedEncounter.spawnBudgetClient:'missions'`. The rumor itself spawns nothing; hostiles
  remain deferred to missions' existing spawn-on-accept path.
- Fired lane keys are serialized inside `lossLedger.serialize()`/`deserialize()` so a saved game does
  not repeat the same rumor after reload. Consequences are emit-only: no credits/cargo/rep writes.
  noTouch honored: `sectorSim.js`, `missions.js`, and `automation.js` were not edited.
- `check:ghost-convoy-rumor` PASS + non-vacuous control: raising the threshold from 3 to 4 made the
  third-loss assertion fail, then restore GREEN. No-regression: `check:wreck-provenance` PASS,
  `check:causal-economy` PASS (now includes ghost convoy), `check-tether-gameplay.mjs` PASS,
  `check:balance` 0 FAIL. `check:sim:compare` fails only on the documented 47-A projectile-collision
  precondition; A/B with only the new `maybeEmitGhostConvoyRumor(...)` call removed produced the
  identical `sf-sim.mjs:1161` failure. Next backend row: **T4c-5 SALVAGE_PERMIT_AND_FINES**.

### T4c-5 SALVAGE_PERMIT_AND_FINES — restricted classified salvage — DONE (2026-07-07)
- NEW pure data helper `src/data/salvageLegality.js` maps wreck metadata to cargo legality. Only
  `wreckClass:'military'` or `parentType:'military'` converts ordinary salvage electronics into
  `cmdty_classified_salvage`; common debris/fresh wrecks stay legal. `salvageActions` is the only
  runtime consumer and still annotates existing wreck entities only.
- `cmdty_classified_salvage` was added to `src/data/commodities.js` as category `salvage` with
  legality `restricted` and `fineMult:0.8`. That means the shipped `economy.runScan` path applies
  the existing restricted fine/confiscation/rep-hit machinery; no salvage-specific fine event or
  alternate cargo writer was introduced. Blackmarket sale at `station_smuggler` clears the cargo via
  the shipped market/sell path before scans.
- noTouch honored: `economy.js`, `cargo.js`, and `salvage.js` were not edited.
- `check:salvage-legality` PASS + non-vacuous control: changing classified salvage legality from
  `restricted` to `legal` made the check fail, then restore GREEN. No-regression:
  `check:causal-economy` PASS (now includes salvage legality), `check:salvage-actions` PASS,
  `check-tether-gameplay.mjs` PASS, `check:balance` 0 FAIL. `check:sim:compare` fails only on the
  documented 47-A projectile-collision precondition; A/B with only the new `salvagePoolForWreck(...)`
  call removed produced the identical `sf-sim.mjs:1161` failure.
- T4c's active E-spec backend sequence is now closed. The broader BP-01 encounter-aftermath ideas in
  `detail/C_combat_encounters.md` are separate rows, not T4c leftovers in this objective. Next backend
  row per `goal-objective.md` / `EXECUTION_LANES.md`: **T4d / BP-13 Pirate Ecology**.

### T4d-1 B9 PIRATE_DOCTRINES — pirate motive/readout axis — DONE (2026-07-07)
- NEW pure data helper `src/data/pirateDoctrines.js` defines exactly the five BP-13 B9 doctrines:
  `toll`, `thief`, `salvage-jackal`, `tech-raider`, and `ideological`. The cut `slaver` doctrine stays
  absent. Unknown legacy doctrines (`scavenger`, `balanced`, `official`) return `null` so existing
  encounters are not silently converted into parley pirates.
- Each doctrine changes an observable axis: demand type, target preference, bark situation, parley
  start, or cargo strategy. `toll` exposes a B6-compatible scan -> demand-cargo -> attack parley plan
  with comply -> break-off; `thief` skips the formal demand and goes straight to `grab-cargo`.
  `pirateDoctrineReadout(...)` returns a stable compact shape for later contacts/scan consumers.
- `check:pirate-doctrines` was added, and `check:pirate-ecology` now aggregates it. Red: the check
  failed before `src/data/pirateDoctrines.js` existed. Non-vacuous control: changing toll
  `startsParley:true` to `false` made the B6 ladder assertion fail, then restore GREEN.
- No runtime system was registered and `rg "pirateDoctrines"` shows the data is currently imported
  only by its check, so this row cannot alter 47-A sim behavior yet. No-regression: `check:pirate-ecology`
  PASS, `check-tether-gameplay.mjs` PASS, `check:balance` 0 FAIL. `check:sim:compare` fails only on
  the documented 47-A projectile-collision precondition. Next backend row: **T4d-2 B6 PIRATE_TOLL_LADDER**.

### T4d-2 B6 PIRATE_TOLL_LADDER — doctrine parley state machine — DONE (2026-07-07)
- NEW `src/systems/pirateParley.js` registered immediately after scanner and before AI. It layers
  SCAN -> DEMAND -> ATTACK over already-spawned `toll` doctrine squads only, keeping them passive,
  no-fire, and scanner-non-hostile until the demand resolves. It does not spawn ships and does not
  edit encounterDirector/combat/scanner/barks/cargo.
- Compliance uses the cargo system's `jettison(...)` seam to drop a deterministic tithe as a
  recoverable pickup, then marks the squad as break-off/passive. Refuse or timeout emits the attack
  bark and flips scanner-readable hostility through AI fields (`hostileTeams`, `forcePlayerTarget`,
  player combat target). `thief`/non-parley pirates remain untouched.
- `check:pirate-parley` was added and `check:pirate-ecology` now aggregates doctrines + parley. Red:
  the check failed before `src/systems/pirateParley.js` existed. Non-vacuous control: inverting the
  startsParley gate made the first scan voice disappear and the check fail, then restore GREEN.
- No-regression: `check:pirate-ecology` PASS, `check-tether-gameplay.mjs` PASS after local dependency
  refresh, `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented 47-A
  projectile-collision precondition. Wider `check:sg06:live-registry` is blocked by pre-existing
  `src/render/bloom.js` syntax (`rtScene.dispose()` inside the composite uniforms object), outside
  this backend lane. Next backend row: **T4d-3 B7 FAKE_CIVILIAN_UNTIL_SCAN**.

### T4d-3 B7 FAKE_CIVILIAN_UNTIL_SCAN — scannable pirate disguise — DONE (2026-07-07)
- NEW `src/data/pirateDisguise.js` defines deterministic disguise skins and reveal helpers. The
  `thief` doctrine now carries `disguised:true`, so a disguised thief can present as neutral
  traffic (`trafficRole:'hauler'`, `team:2`, passive trader AI) until scanned.
- NEW `src/systems/pirateDisguise.js` listens to the existing `scan:pulse` event. In-range disguised
  pirates are revealed once, get `data.disguiseBlown=true`, swap to their true hostile team/archetype,
  and use ordinary scanner-readable AI fields (`forcePlayerTarget`, `hostileTeams`, attack fsm).
  Scanner, traffic, HUD, and combat were not edited.
- `check:pirate-disguise` was added and `check:pirate-ecology` now aggregates B9+B6+B7. Red: the
  check failed before `src/data/pirateDisguise.js` existed. Non-vacuous control: changing
  `disguiseBlown` to false made the scanner flip assertion fail, then restore GREEN.
- No-regression: `check:pirate-ecology` PASS, `check-tether-gameplay.mjs` PASS, `check:balance`
  0 FAIL. `check:sim:compare` still fails only on the documented 47-A projectile-collision
  precondition. Wider `check:sg06:live-registry` remains blocked by the pre-existing
  `src/render/bloom.js` syntax issue outside this backend lane. Next backend row:
  **T4d-4 B8 BREAK_OFF_WHEN_PATROL_ARRIVES**.

### T4d-4 B8 BREAK_OFF_WHEN_PATROL_ARRIVES — lawful patrol pressure — DONE (2026-07-07)
- NEW `src/systems/pirateDisengage.js` registered before AI. It scans for active pirate squads near
  lawful patrol ships, waits a one-second nerve beat, then supplies normal AI-facing flee fields:
  `fsm:'flee'`, no fire intent, dropped player combat target, and an immediate movement intent away
  from the patrol.
- The trigger is sticky per squad and speaks exactly one `flee` bark through the voice arbiter. No
  patrol, out-of-role patrol spoof, or non-lawful nearby ship leaves pirate behavior unchanged.
  encounterDirector, enemies, combat, and SG-06 AI files were not edited.
- `check:pirate-disengage` was added and `check:pirate-ecology` now aggregates B9+B6+B7+B8. Red:
  the check failed before `src/systems/pirateDisengage.js` existed. Non-vacuous control: increasing
  the nerve delay from 1s to 10s made the acceptance window fail, then restore GREEN.
- No-regression: `check:pirate-ecology` PASS, `check-tether-gameplay.mjs` PASS, `check:balance`
  0 FAIL. `check:sim:compare` still fails only on the documented 47-A projectile-collision
  precondition. Wider `check:sg06:live-registry` remains blocked by the pre-existing
  `src/render/bloom.js` syntax issue outside this backend lane. Next backend row:
  **T4d-5 B10 NAMED_CREWS_AND_ACES**.

### T4d-5 B10 NAMED_CREWS_AND_ACES — durable pirate ace memory — DONE (2026-07-07)
- NEW pure roster `src/data/namedAces.js` defines the three B10 crews and leaders: Yara No-Cut
  (Red Latch Crew), Toll Saint Venn (Sker Hooks), and Mako of the Broken Ring (The Empty Ledger),
  each with a loadout gimmick tag and signature bark. The reader also aliases shipped
  `NAMED_CAPTAINS` (Sable Iask / Redcut Sorrel / Vane the Ash) so existing named-hunter receipts
  feed the new memory layer without an encounterDirector edit.
- NEW event-driven `src/systems/aceMemory.js` registered SYSTEMS-only. It writes only
  `state.aceMemory`, records `encountered` / `fled` / `defeated` at `state.aceMemory[id]`, emits
  exactly one `news:headline` per flee/defeat transition, and schedules bigger returns
  deterministically from `state.meta.seed + aceId`. It listens to direct `namedAce:*` seams and
  shipped `encounter:receipt {shape:'named_hunter'}`; it does not spawn ships or alter hostility.
- Save persistence is wired through `saveSystem.js` and regenerated `SAVE_SCHEMA.md`. `check:save-schema`
  is green after generation; old saves without `aceMemory` normalize to an empty versioned record.
- `check:ace-memory` was added and `check:pirate-ecology` now aggregates B9+B6+B7+B8+B10. Red: the
  check failed before `src/data/namedAces.js` existed. Non-vacuous control: changing `rec.fled=true`
  to `false` made the fled-state assertion fail, then restore GREEN.
- No-regression: `check:pirate-ecology` PASS, `check:save-resume-confidence` PASS,
  `check:save-schema` PASS, `check-tether-gameplay.mjs` PASS, `check:balance` 0 FAIL.
  `check:sim:compare` still fails only on the documented 47-A projectile-collision precondition.
  Next backend row: **T4d-6 B11 SPARED_PIRATE_RETURNS_BIGGER**.

### T4d-6 B11 SPARED_PIRATE_RETURNS_BIGGER — promoted ace comeback — DONE (2026-07-07)
- B11 is an addendum to the B10 files, as specified: `aceMemory` now runs in UPDATE_ORDER at a
  throttled cadence, consumes due `returnScheduled` records, and turns them into spawnBudget-backed
  comeback squads. It does not edit `encounterDirector.js` or `enemies.js`.
- `src/data/namedAces.js` now carries return archetypes/escorts/base levels plus pure helpers for
  bounded promotion tiers, bumped level bands, and deterministic return crews. Promotion caps at
  tier 3 to avoid infinite escalation.
- A due spared ace emits `aceMemory:returnRequested`, reserves spawnBudget slots, spawns a named
  encounterBoss plus escorts with `spawnContext:'ace_return'`, tags each entity with
  `data.aceMemory`, consumes the schedule, and speaks one callback taunt: "you should have finished
  me" plus a faction `taunt` bark. Spawn positions and loadouts derive only from seed + ace id.
- Defeated aces clear `returnScheduled` and do not zombie-return. Active return slots release on
  `entity:destroyed`.
- `check:pirate-promotion` was added and `check:pirate-ecology` now aggregates B9+B6+B7+B8+B10+B11.
  Red: the check saw zero return requests before the addendum. Non-vacuous control: forcing
  `rec.returnScheduled` to remain true after spawn made the schedule-consumption assertion fail,
  then restore GREEN.
- No-regression: `check:pirate-promotion` PASS, `check:pirate-ecology` PASS,
  `check:save-schema` PASS, `check:save-resume-confidence` PASS, `check-tether-gameplay.mjs`
  PASS, `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented 47-A
  projectile-collision precondition. Next backend row: **T4d-7 B12 STATION_PIRATE_RUMOR_HEAT**.

### T4d-7 B12 STATION_PIRATE_RUMOR_HEAT — zone-named piracy rumors — DONE (2026-07-07)
- NEW reader/aggregator `src/systems/pirateRumor.js` registered after `encounterDirector`. It listens
  only to real `encounter:spawned` pirate shapes (`ambush_snare`, `pirate_toll`, `named_hunter`,
  `claim_threat`) and civilian traffic `entity:killed` events whose position resolves to a named
  `sectorZones` zone. No random/prospective rumor source exists.
- Per-zone heat lives in `state.pirateRumor.zones`. At the three-real-event threshold, the hottest
  zone emits one `news:headline {kind:'piracy'}` and one `pirateRumor:card` payload naming the zone
  (for dock-card consumers). The headline variants use `marketNews.pickVariant`; the system never
  edits market/economy state.
- Rumors are rate-limited per zone and heat decays (`PIRATE_RUMOR_DECAY_PER_S`) so a hot lane
  becomes quiet again without further events.
- `check:pirate-rumor` was added and `check:pirate-ecology` now aggregates B9+B6+B7+B8+B10+B11+B12.
  Red: the check failed before `src/systems/pirateRumor.js` existed. Non-vacuous control: changing
  the threshold from 3 to 4 failed the explicit three-event bar, then restore GREEN.
- No-regression: `check:pirate-rumor` PASS, `check:pirate-ecology` PASS,
  `check:save-schema` PASS, `check:save-resume-confidence` PASS, `check-tether-gameplay.mjs`
  PASS, `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented 47-A
  projectile-collision precondition.
  Next backend row: **T4d-8 B13 ROUTE_DANGER_FEEDBACK**.

### T4d-8 B13 ROUTE_DANGER_FEEDBACK — causal route danger shifts — DONE (2026-07-07)
- ADDENDUM in `src/systems/pirateRumor.js`: sustained ignored pirate heat now creates bounded
  route danger feedback, while a `named_hunter` leader clear creates an opposite suppression/convoy
  boost. The runtime hook applies the modifier to existing pending encounter plans when present;
  exported pure helpers expose the same route-adjusted plan and traffic role-mix for checks/future
  consumers.
- The feedback is causal only: ignored danger comes from real `encounter:spawned` pirate events after
  the sustained threshold; leader relief comes from real `encounter:resolved {shape:'named_hunter',
  outcome:'killed'}` for a named zone. No random/prospective route shift exists.
- Bounded clamps prevent runaway escalation (`ROUTE_DANGER_MAX` <= 0.75). Leader clear suppresses one
  next-plan pirate item for the affected zone and annotates convoy/traffic weighting; ignored raids
  add one bounded pressure item instead of bypassing spawnBudget or spawning directly.
- Every shift emits exactly one `news:headline {kind:'route-feedback'}` cause line inside cooldown, so
  route changes are not silent. NoTouch honored: `encounterDirector.js`, `traffic.js`, and
  `marketNews.js` were not edited.
- `check:route-danger-feedback` was added and `check:pirate-ecology` now aggregates B13. Red: the
  check failed before the route-feedback exports existed. Non-vacuous control: changing the
  leader-clear delta from negative to positive failed the "leader clears lower route danger" guard,
  then restore GREEN.
- No-regression: `check:route-danger-feedback` PASS, `check:pirate-ecology` PASS,
  `check:save-schema` PASS, `check:save-resume-confidence` PASS, `check-tether-gameplay.mjs`
  PASS, `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented 47-A
  projectile-collision precondition.
  Next backend row: **T4d-9 B14 AMBUSH_SIGNATURES**.

### T4d-9 B14 AMBUSH_SIGNATURES — scannable pre-ambush tells — DONE (2026-07-07)
- NEW data table `src/data/ambushSignatures.js` maps ambush-capable encounter shapes to passive,
  scannable tells such as a dead beacon, cargo bait, callsign echo, sensor tripline, or false
  distress ping. Non-ambush shapes intentionally return no tell.
- NEW backend system `src/systems/ambushSignatures.js` is registry-wired after
  `encounterDirector`/`pirateRumor`. It reads `state.encounterDirector.pending` and writes only
  `state.ambushSignatures` passive tell records; it does not spawn hostiles, consume spawnBudget,
  or touch renderer state.
- A `scan:pulse` near an unscanned tell emits one `ambushSignature:scanned` warning hint and marks
  that tell scanned, giving counterplay before ships spawn. Re-scanning the same tell does not spam.
- `check:ambush-signatures` was added and `check:pirate-ecology` now aggregates B14. Red: the check
  failed before `src/systems/ambushSignatures.js` existed. Non-vacuous control: disabling the
  `ambush_snare` signature key failed the "ambush_snare has a signature tell" guard, then restore
  GREEN.
- NoTouch honored: `encounterDirector.js`, `scanner.js`, `sectorZones.js`, and `src/render/**` were
  not edited.
- No-regression: `check:ambush-signatures` PASS, `check:pirate-ecology` PASS,
  `check:save-schema` PASS, `check:save-resume-confidence` PASS, `check-tether-gameplay.mjs`
  PASS, `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented 47-A
  projectile-collision precondition.
  Next backend row: **T4d-10 B15 AMBUSH_WRECK_FIELDS_AND_BASE_DISCOVERY**.

### T4d-10 B15 AMBUSH_WRECK_FIELDS_AND_BASE_DISCOVERY — pirate-base provenance seed — DONE (2026-07-07)
- ADDENDUM in `src/systems/pirateRumor.js`: repeated real pirate ambush vectors in one named zone
  now plant a single deterministic `pirate_base_candidate` record. This is only the pirate-vector
  provenance seed; it does not spawn a base, seed wreck fields, or write salvage/sector-sim state.
- Candidate creation is causally gated by `PIRATE_BASE_CANDIDATE_EVENTS = 6` actual
  `encounter:spawned` events with pirate vector kinds (`ambush_snare`, `pirate_toll`,
  `named_hunter`). Naked rumor heat or manually inflated event counts produce no candidate.
- The candidate payload is exposed through `pirateBaseCandidateForZone`,
  `pirateBaseCandidates`, `pirateRumor:baseCandidate`, and generic `poi:candidate`. It carries
  sector/zone identity, deterministic seed, actual event ids/kinds/timing provenance, and explicit
  future payoff flags (`salvage`, `bounty`) for POI/salvage consumers.
- `check:pirate-base-provenance` was added and `check:pirate-ecology` now aggregates B15. Red: the
  check failed before the candidate exports existed. Non-vacuous control: changing the candidate
  threshold from 6 to 7 failed the six-event contract, then restore GREEN.
- NoTouch honored: `salvage.js`, `encounterDirector.js`, and `sectorSim.js` were not edited.
- No-regression: `check:pirate-base-provenance` PASS, `check:pirate-ecology` PASS,
  `check:save-schema` PASS, `check:save-resume-confidence` PASS, `check-tether-gameplay.mjs`
  PASS, `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented 47-A
  projectile-collision precondition.
  Next backend row: **T4d-11 B16 BOUNTY_HUNTER_NEUTRALITY**.

### T4d-11 B16 BOUNTY_HUNTER_NEUTRALITY — NPC quarry contracts — DONE (2026-07-07)
- NEW `src/data/bountyHunters.js` and `src/systems/bountyHunt.js`. Contract hunters now carry a
  neutral scanner context (`bounty_contract`) while chasing an NPC quarry, avoiding the existing
  force-hostile `bounty_hunter` scanner context until `contractTargetId === state.playerId`.
- The `bountyHunt` system normalizes hunter AI each tick: NPC-target contracts set quarry pursuit
  intent and stay scanner-neutral via shipped `isHostileToPlayer`; player-target contracts set
  `forcePlayerTarget` + hostile team 0 and flip hostile.
- Player interference is recorded deterministically: killing the quarry records
  `player_helped_hunter`; killing the hunter records `player_defended_quarry`, with one
  `bountyHunt:outcome` event per contract.
- `check:bounty-hunter-neutrality` was added and `check:pirate-ecology` now aggregates B16. Red:
  the check failed before `src/systems/bountyHunt.js` existed. Non-vacuous control: changing the
  neutral context to `bounty_hunter` failed the scanner-hostility guard, then restore GREEN.
- NoTouch honored: `scanner.js`, `encounterDirector.js`, and `combat.js` were not edited.
- No-regression: `check:bounty-hunter-neutrality` PASS, `check:pirate-ecology` PASS,
  `check:save-schema` PASS, `check:save-resume-confidence` PASS, `check-tether-gameplay.mjs`
  PASS, `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented 47-A
  projectile-collision precondition.
  Next backend row: **T4d-12 B17 BOUNTY_HUNTER_SIGNATURE_TRICK**.

### T4d-12 B17 BOUNTY_HUNTER_SIGNATURE_TRICK — telegraphed hunter gimmicks — DONE (2026-07-07)
- NEW `src/data/hunterTricks.js` defines the seven spec tricks in stable order: tether-cutter,
  mine-dropper, phase-jammer, shield-turtle, ram-plate, decoy-clone, and emergency-jump-spool.
  Each entry has a readable telegraph, counter-window, cooldown, and exactly one existing verb/event
  mapping so the packet does not introduce a new physics/combat subsystem.
- `src/data/bountyHunters.js` now lets the B16 hunter shape carry an explicit `trick`, while
  `src/systems/bountyHunt.js` assigns a deterministic trick from seed+contract when none is
  specified. The trick state rides `data.bountyHunt.trickState`; it does not spawn extra hunters.
- The runtime starts with a telegraph phase, emits one `bountyHunt:trickTelegraph` payload and one
  voice bark through the existing voice helper, waits the counter-window, then emits
  `bountyHunt:trickActivated` and applies the mapped backend intent/effect. Emergency-jump-spool
  physically moves the hunter only after the counter-window, proving the "predict it" rule headless.
- `check:bounty-hunter-tricks` was added and `check:pirate-ecology` now aggregates all 12 BP-13
  packets. Red: the check failed before `src/data/hunterTricks.js` existed. Non-vacuous control:
  reducing the emergency-jump counter-window from 1.75s to 0.1s failed the readability guard, then
  restore GREEN.
- NoTouch honored: `combat.js`, `flightV3.js`, tether system files, and SG-06 AI were not edited.
- No-regression: `check:bounty-hunter-tricks` PASS, `check:pirate-ecology` PASS,
  `check:save-schema` PASS, `check:save-resume-confidence` PASS, `check-tether-gameplay.mjs`
  PASS, `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented 47-A
  projectile-collision precondition.
  Next backend row: **T8d SMUGGLING_CARD**.

### T8d SMUGGLING_CARD — customs/contraband card proof — DONE (2026-07-07)
- NEW check `scripts/check-smuggling-card.mjs` plus `npm run check:smuggling-card`. This is a
  verification-only row: no shipped gameplay/UI file is changed.
- The check composes the real smuggling contract surfaces: `missionConsequenceSummary` for the
  station card heat/stake chips, `missionPreflight`/`missionCargoStaging` for readiness and
  contraband staging, and `activeMissionContractTerms` for the accepted Mission Log card.
- It also boots a real headless customs stack (`cargo`, `economy`, `factions`, `heat`, `missions`)
  and proves the warning is backed by shipped behavior: bribe charges through `economy.payBribe`,
  submit/scan fine confiscates cargo, emits law-faction rep, raises WANTED heat, and a patrol scan
  bust fails an active smuggling run as `reason:'busted'`.
- Red: package script failed before the check file existed. Non-vacuous control: changing the
  shipped smuggling heat chip kind from `bad` to `info` failed `check:smuggling-card`, then restore
  GREEN.
- Related gates: `check:customs-prompt` PASS, `check:mission-preflight` PASS,
  `check:mission-log-contract-terms` PASS, `check:causal-economy` PASS.
- No-regression: `check:balance` 0 FAIL. `check:sim:compare` still fails only on the documented
  47-A projectile-collision precondition.
- Note: the objective file names `design/revamp/EXECUTION_LANES.md`, but that file is absent in the
  current tree; this row followed `PROGRESS.md` + `WAVE4_PROMPT.md` instead.
  Next backend row: **T8e STATION_MOOD**.

### T8e STATION_MOOD — station life cross-surface proof — DONE (2026-07-07)
- NEW check `scripts/check-station-mood.mjs` plus `npm run check:station-mood`. This is a
  verification-only row: no shipped gameplay/UI/asset/render source is changed.
- The check composes the shipped BP-11 station-life surfaces into one station mood proof:
  `STATION_GLYPHS` labels, `STATION_BROADCASTS` text/tics, orbit bubble colors/radii,
  no-fire warning comms, seeded side-event affinities, and the visible-only silent side-event
  director.
- It guards the backend path by poisoning `Math.random` and `Date.now`, proves all 7
  `STATION_TYPES` have type-specific reads, proves blackmarket stations stay furtive/no-patrol,
  proves military stations can launch patrol mood events, and verifies side-events do not speak
  over the one-voice channel.
- Red: package script failed before `scripts/check-station-mood.mjs` existed. Non-vacuous control:
  changing the blackmarket glyph label from `Cache` to `Market` failed the station mood catalog,
  then restore GREEN.
- Related gates: `check:station-broadcast` PASS, `check:station-side-events` PASS,
  `check:station-bubbles` PASS, `check:station-glyphs` PASS, `check:sector-atmosphere` PASS.
  Next backend row: **T8h MARKET_CHART**.

### T8h MARKET_CHART — market chart data/forecast proof — DONE (2026-07-07)
- NEW check `scripts/check-market-chart.mjs` plus `npm run check:market-chart`. This is a
  verification-only row: no shipped gameplay/UI/asset/render source is changed.
- The check boots the real economy system headless, warms the home market, records live
  `priceHistory` from `economy:tick`, verifies active economic event ids are captured for the
  chart event log, and proves `predictPriceCurve` is deterministic over the live hidden cycle.
- It pins the shipped Market screen chart contract: commodity-card click opens the chart modal,
  regime uses the live economy cycle wrapper, forecast uses the 24x5s window, history uses the
  recorder, trend labels are thresholded, active events are filtered to station/commodity, the
  expanded canvas draws base/history/forecast, tooltips use the same data, and row sparklines use
  the same history source.
- Red: package script failed before `scripts/check-market-chart.mjs` existed. Non-vacuous control:
  changing the shipped chart forecast window from `24` to `6` failed the source contract, then
  restore GREEN.
- Related gates: `check:price-forecast` PASS, `check:market-nav` PASS, `check:balance` 0 FAIL.
  `check:market-first-loop` is blocked before `window.SF` by the existing render syntax error;
  confirmed separately with `node --check src/render/bloom.js` failing at `src/render/bloom.js:344`.
  Next backend row: **T8f CLAIM_LEDGER**.

### T8f CLAIM_LEDGER — claimed-body receipt/save proof — DONE (2026-07-07)
- NEW check `scripts/check-claim-ledger.mjs` plus `npm run check:claim-ledger`. This is a
  verification-only row: no shipped gameplay/UI/asset/render source is changed.
- The check exercises the real `claims` system headless: claiming a body creates a durable ledger
  row with sector/POI/name/size/slots/modules/position/claimedAt, routes claim cost through
  `economy:chargeCredits` reason `claim_body`, emits `claim:claimed`, and rejects duplicate claims.
- It verifies module builds append module ids to the body ledger, route costs through
  `economy:chargeCredits` reason `build_module`, emit `claim:moduleBuilt`, reject duplicates,
  and that teleporter builds link to the nearest station before `claim:teleportRequest`.
- It proves `serialize()` copies module arrays, `deserialize()` restores bodies, and the next claim
  id is re-derived past restored `claim_N` rows. The base-screen source contract is pinned so the
  UI reads `claims.list()`, shows size/slots/sector/module slots, consumes pending claim handoff,
  rebuilds after module builds, and routes teleport through `claims.teleportFrom`.
- Red: package script failed before `scripts/check-claim-ledger.mjs` existed. Non-vacuous control:
  changing the shipped module-build charge reason from `build_module` to `base_module` failed the
  build receipt check, then restore GREEN.
- Related gates: `check:claim-base` PASS, `check:base-build-guidance` PASS,
  `check:claims-guidance` PASS, `check:balance` 0 FAIL.
  Next backend row: **T8g WAR_OVERLAY**.

### T8g WAR_OVERLAY — faction war map proof — DONE (2026-07-07)
- NEW check `scripts/check-war-overlay.mjs` plus `npm run check:war-overlay`. This is a
  verification-only row: no shipped gameplay/UI/asset/render source is changed.
- The check exercises the real `factions` system headless: offscreen tension creates the conflict
  ledger row, crosses the real war threshold, emits `conflict:warDeclared`, preserves zero
  `playerLean`, resolves a contested-sector flip through the factions single-writer path, emits
  `conflict:flip`, and proves `sectorSignalFor` reads the runtime owner after the flip.
- It also boots `sectorSim` with a real contested field and a fake factions registry boundary,
  proving sectorSim injects only through `factions.addOffscreenTension(pairKey, delta,
  'sector_field')`, never writes `state.conflicts` directly, and keeps runtime owner separate from
  modeled dominant influence.
- The starmap source contract is pinned for the overlay surface: shared `sectorSignalFor` import,
  driver labels for contested/shift/flip states, low-margin contested ring, dominant-influence node
  coloring/tooltip, sorted influence bars, runtime-owner strip, and the single-writer explanation.
- Red: package script failed before `scripts/check-war-overlay.mjs` existed. Non-vacuous control:
  raising the shipped `WAR_THRESHOLD` from `75` to `95` made the check fail at the war-state guard,
  then restore GREEN.
- Related gates: `check:war-overlay` PASS, `check-sectorSim.mjs` PASS, `check:balance` 0 FAIL.
  `check:sim:compare` still fails only on the documented 47-A projectile-collision precondition.
  Next backend row: **T8b FACT_LEDGER**.

### T8b FACT_LEDGER — scenario fact ledger proof — DONE (2026-07-07)
- NEW check `scripts/check-fact-ledger.mjs` plus `npm run check:fact-ledger`. This is a
  verification-only row: no shipped gameplay/UI/asset/render source is changed.
- The row uncovered stale wording in the revamp docs: the shipped fact ledger is
  `state.scenario.facts`, not `state.world.facts`. The check pins that live contract without
  rebuilding it: `gameState` initializes `scenario.facts`, `scenarioRuntime` owns it, and
  branch effects mutate it.
- The check validates the 47-A scenario contract, pins the five initial fact values, proves every
  beat references declared facts, proves branch `worldFactEffects` reference declared facts, and
  pins the escape branch's immediate fact outcomes.
- Runtime coverage boots the real `scenarioRuntime`, verifies `scenario:factsInitialized`, applies
  `escape_with_evidence` through the shipped `applyScenarioBranch` helper, verifies one
  `scenario:factChanged` receipt per effect, verifies the `scenario:branchResolved` payload carries
  the same fact deltas and authored aftermath, and checks serialize/deserialize preserves the fact
  ledger plus resolution.
- Surface coverage pins `sf-sim` factValues extraction, `eventTrace` inclusion of initialized /
  changed / resolved fact events, and `comms` consumption of branch lifecycle text.
- Red: package script failed before `scripts/check-fact-ledger.mjs` existed. Non-vacuous control:
  renaming the shipped `scenario:factChanged` emission to `scenario:factDelta` made the check fail
  at the receipt-count guard, then restore GREEN.
- Related gates: `check:fact-ledger` PASS, `check:encounter-director` PASS, `check:balance` 0 FAIL.
  `check:sg05` gets through `check-sg05-scenario` and then hits the same documented 47-A
  projectile-collision precondition via `sf-sim`; `check:sim:compare` fails on that same
  documented precondition.
  Next backend row: **T1a ENCOUNTER_DIRECTOR verify/augment**.

### T1a ENCOUNTER_DIRECTOR — determinism/budget/one-voice gate — DONE (2026-07-07)
- Verified the existing `scripts/check-encounter-director.mjs` instead of recreating it. The T2f
  side-finding was correct: the file already existed, and the row scope is verify/augment.
- Package script `check:encounter-director` now chains both existing proofs:
  `check-encounter-director.mjs` for static discipline, planner determinism, schedule budgets,
  runtime pacing, quiet time, dock/tutorial suppression, spawnBudget use, pressure spend, and
  bounty gate; plus `check-encounter-one-voice.mjs` for exactly-one primary line, bark spacing,
  snare warning window, scan-first distress tell, copy law, and no modal-shaped encounter events.
- Red/control: temporarily bypassing the shipped dock/tutorial pump guard in `encounterDirector`
  made `check:encounter-director` fail on "encounter fired during protected tutorial beat", then
  restore GREEN.
- Related gates: `check:encounter-director` PASS and `check:balance` 0 FAIL. `check:living-universe`
  currently fails on its existing `bait spring line` assertion; this row changed only the package
  check aggregation, not encounter runtime behavior. `check:sim:compare` still fails only on the
  documented 47-A projectile-collision precondition.
  Next backend row: **T1b ONE_VOICE verify/augment**.
