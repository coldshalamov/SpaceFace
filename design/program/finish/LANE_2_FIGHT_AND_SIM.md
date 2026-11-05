<!-- LIFETIME: STABLE -->
# Lane 2 — THE FIGHT & THE SIM (medium complexity)

The controller coordinates current writers under README §3; lane labels do not create permanent path locks.
Program law: [`README.md`](./README.md). Commands: [`TOOLS.md`](./TOOLS.md). Prompt: [`PROMPT_LANE_2.md`](./PROMPT_LANE_2.md).

**The outcome:** the fight is the best thing in SpaceFace — fast, physics-centric arcade combat
where *the rock is the gun* (owner direction 2026-10-21), Crucible/Swarm is a showcase you want to
replay, enemies and creatures behave like they live in the same physics you do — and the simulation
under it is cheap enough that 150+ bodies cost a few milliseconds, with the code and tests behind it
lean enough to change. Status words: `OPEN`, `ACTIVE`, `LANDED <sha>`, `SKIPPED (<reason>)`.

## Claimed paths (beyond README §3)

**Active connected batch,2026-11-03:** fifteen exact whole-hulk releases use existing measured
outlines, native convex decompositions and uniform-area inertia at unchanged operational mass.
Old capsule native-save caches correctly decline exact continuation and rebuild the fitted body;
pose, motion, remaining salvage and custody survive the selected restore check. Normal impact
behavior and the ordinary encounter remain separate checks. Swarm arena pursuit now retains its
existing wounded-tail commitment; the Fortify same-reply mirror includes the charged purse.
The changed ordinary Bank7/boss journey remains open. One batch baseline passes17/17 in80,529ms,
within90,000ms; the in-flight ecology attachment hunk has its own affected check.

## Inbox (other lanes append one line: date, lane, path, what/why)

**Current November3 checkpoint:** published `89ddfe4830e2` fixes arcade Exit overwriting Adventure autosave; the ordinary buy/save/Swarm/Exit/Continue route preserves4,962 credits, cargo and sector. Final29 isolation and13 affected Racing/export cases pass. The newer1347 Swarm attempt lost at wave4 with significant pilot/operator movement limitations; a corrected moving pilot is now exercising repair/Fortify and natural Bank/boss progression. This is not yet a balance defect or mode acceptance. Ceres's paid player brace and crew cutter release pass; full same-plate tow/receiving is still being completed. Earlier inbox receipts below retain their original scope.

- 2026-11-03 ordinary Intel Swarm8ea: actual fitted fire and a six-ton shard latch/move clear round1 to the Armory,15/15 resolved, score1385/cr946/hull260. Shard impact is not established. Headed Chrome reports Intel Graphics/D3D11, driver32.0.101.8860; no valid active-window FPS was retained. Wave7/first boss remain open. Next operator uses interruptible30-second public-input combat segments rather than long wall time between tiny simulation pulses.

- 2026-11-03 Foundry collision repair: a production native probe fully outside the visible gate previously contacts its radius-ball and moves8→8.1603; corrected hex contact gives0 contacts/stays8. Furnace main body/mouth and moving shutter now use their visible planar shapes through a shared datum, preserving mass/phase/transform and plate geometry. Legacy unproxied rooms resolve the corrected footprints; incompatible ball caches are refused. Native/sweep/open-gap/save checks pass; ordinary contact feel remains to be played.

- 2026-11-03 combat feedback: one counted physical cause replaces duplicate `ARENA: PRESSED`/`PRESSED`; routine wreck/loss accounting stays in its owners while quiet in Swarm's flight register. Desktop chain/announcer retain the upper center and existing voice/receipt lanes move right. The pictured overlap reproduces before and clears after in the real2D presenter bench;24 checks retain danger preemption, actionable receipts and player-owned loss. Smaller/mobile and actual combat look remain open.

- 2026-11-03 ordinary Swarm: runtime confirms `kind: survival`, `ruleset: swarm` under the public Crucible entry. Two rounds were reached, a real Autocannon S purchased and fired in round2. Hovering Strip moved Sell underneath the pointer; the changed Refit layout keeps measured controls stable and passes actual in-place candidate input plus geometry checks. The initial round's largely environmental kills do not accept combat feel; the next active play targets Bank/wave7 and the first boss without wave skips.

- 2026-11-03 ordinary Anvil: DDE Continue→Tethys→Storm Orchard→Scoop feed→release→physical pickup completed with the same player lot/pod. Reserve44→43, release revision2/tetherable, then H hold13→14 at pickup; no grants or teleports. Root inspected the recovery scene. This closes that specific ordinary skim/release/recovery loop, not all Tethys content or performance.

- 2026-11-03 Armory: rapid Refit Strip/Fit/Sell presses previously queued duplicate transactions, replacing a successful action with a refusal. The screen now waits for a matching owner receipt, disables pending transactions and names the actual fitting movement. Review reproduced a late Strip after public Launch at unchanged generation leaving controls pending; correlated early exits now return the existing refusal receipt. The actual UI/main-lane/production-worker regression and focused cohort pass21 cases. Ordinary intermission → refit → round2 firing, first-ten/boss journey and performance remain open.

- 2026-11-03 native contact repair (`c16e43dd6c24`): already tumbling hulls no longer receive a second legacy entry-spin impulse after the native contact solve. The authored Kestrel reproduction previously multiplied spin2.52× and angular energy6.34× across that command boundary; the corrected path preserves the native response. Disabling tumble now restores an installed contact/damping profile. Sixty focused native cases pass, including tracked contact-normal/material/energy checks replacing obsolete world-axis bounce assumptions. No mass/inertia clamp or expected golden was changed; ordinary perceived combat feel remains open.

- 2026-11-03 integration: incoming PR811's player-truth retry was corrected so menu/loading/route and unclassified graphics failures remain failures, and a failed first-attempt archive prevents a destructive retry. Existing classified environment-loss handling is retained. Thirty-two focused checks pass; no long survival run was added.

- 2026-10-28, Lane 3: H0 razor commit a054f36530a touched `test/ui-frame-references/README.md` (mechanical ref rewrite to `design/archive/…` after the doc moves — doc text only). Foreign-dirty work seen in the tree, not mine: `test/ceres-five-minute-acceptance.test.mjs` and `scripts/lib/ui-layout-measure.mjs` left unstaged and preserved.
- 2026-10-28, Lane 3: `test/lived-frontier-pockets.test.mjs` — removed a committed duplicate `ownsCharonSupplyHull` import (line 45) that left the file a SyntaxError on master (this was defect D265's red; the world bug was already fixed, suite 28/28 green). One-line deletion, committed alone as 1406c221a39.
- 2026-10-28, Lane 3: story-ledger red fix edited three test files — `test/story-campaign47a-fixtures.mjs` (new `plantFirstPlayerGrowth`/`plantNestOutcome` evidence helpers), `test/pq-178-03-ledger.test.mjs`, `test/story-spine-memory.test.mjs`. No assertions weakened: same checks now driven through the owner's persisted evidence shapes (compost `understory:playerGrowth` receipt, encounter-director terminal Nest receipt, ordered `campaign47a:b3:berth|maw|foreman` tags) that post-hardening recorders require. Source cause was a legacy-fill stepId mislabel + reader trusting stepId over signal — both in `src/story/`.
- 2026-10-28, Lane 3 (W1-479 sweep): two stale assertions red at HEAD on clean files, not mine and not foreign-dirty — `test/rc-472-racing-event-cards-4242.test.mjs:174` expects 1 polyline/course where `racingMap.js` deliberately draws 2 (bloom+core, ORRERY §3.1), and `test/station-orbital.test.mjs:66` expects the literal `styles/station-orbital.css` where `stationApp.js` routes through `ensureStylesheet()`. Update the assertions to match the landed visuals. Also `test/hud-contact-roster-visibility.test.mjs` remains 2-red (projection-count contract) — already yours.
- 2026-10-29, Lane 3 (ear/INFERENCE sitting): `src/systems/swarmArena.js` + `src/systems/environmentMaterials.js` — payload additions only, to the existing `asteroid:chunked` emits (`count` + parent `pos`), so the new chunk-split voice in audioSystem sits at the split and grades by piece count. No sim logic touched; `test/inf-asteroid-chunk-voice.test.mjs` pins the audio side.

- 2026-10-31, integration: `scripts/sf-sim-cli.mjs` skips the redundant fresh physics prepare only for envelope resumes; the existing snapshot-bearing reset remains. All four real 47-A physical branch outcomes pass (48,075 ms). This verifies loaded physical behavior; no matched timing improvement or baseline-budget acceptance is claimed.

- 2026-10-31, integration: the Massline aggregate shares the identical 5,200-tick spindle/scavenger inspection in one opt-in child while preserving separate assertions, verdicts, timeouts and standalone commands. The focused pair passes in 23.4 seconds; this does not establish the full 90-second baseline budget.

## Defects (this lane's share of the demo defect ledger — delete a row in the commit that fixes it)

| # | What a stranger sees | Where | Next step |
|---|---|---|---|
| D191 | Ceres population-budget/re-entry churn is repaired; simulation performance remains OPEN | `test/ceres-table-authority-census.test.mjs`, `test/ceres-active-pockets.test.mjs` | F1: obtain a current uncontended Ceres attribution of the Rapier solve/guard cost; the 2026-10-17 profile is historical, not a current performance result |
| D241 | Partial: stale-sweep fixes, the named Ceres Massline case, Ceres native ambush opportunity/lifecycle case, and RC-458 selective staged-pilot 180-second case pass; public Ceres toolkit route remains unverified | `test/ceres-five-minute-acceptance.test.mjs`, `test/rc-458-round1-budget.test.mjs` | F0: verify the Ceres public toolkit route; do not treat the native opportunity fixture as route acceptance |
| D224 | OPEN verification: historical SwiftShader failures were timeouts and their budgets were widened; no current green affected SwiftShader shard is recorded here | `check:assets:live`, `check:market-first-loop`, `probe-flight-visual`, `probe-ship-visual-stability` | T2: rerun the affected software-GL shard; classify any non-timeout failure separately rather than treating the old timeout report as a current product defect |

## Day-one review (from `LANDED_REVIEW.md`; delete the row there when done)

- **R-36df771 — closed 2026-10-31:** all three existing physical seed-4242 MOVE, WAIT and
  partial-transfer checkpoint cases pass production save/load materialization and continue for
  three cycles with matching program counters, trajectories, freight and receipts. This closes
  the exact-step owner invariant; the ordinary Automation screen remains in the public UI journey.

## The ordered packets

### F0 — Green the floor
The stale-sweep/eligibility fixes in `LANDED_REVIEW.md` remain verified. The exact current
`test/ceres-five-minute-acceptance.test.mjs` Massline case passes: the Reaver dies at 913 combat
ticks, with the off-frustum hit at tick 194. The Ceres native opportunity/lifecycle case also
passes: it records the exact live cohort member at the first pointable-acquisition tick, then
marks that actor dead as a controlled native fixture step. That is not evidence of a player-caused
kill, and it does not verify the public Ceres toolkit route, which remains OPEN. The selective
staged-pilot case in `test/rc-458-round1-budget.test.mjs` passes its 180-second check. Keep D241
open only for direct verification of the public Ceres toolkit route; do not repeat the passing
native cases or stale-sweep suites.

### Wave F — the simulation is cheap at a crowd (do first; Lane 1's frame bars depend on it)

**F1 — Crowd cost.** In the Crucible round the sim step is 32 % of an 86 ms main thread (physics 9 %,
contact-impact emission ~8 %, tactical AI 3 %); 98 systems walk a ~408-entity list.
(a) Move whole-list scans onto the per-type `entityIndex` / `spatialHash` the code already prefers
(`tacticalAI.js:~80, ~121`, `engagementAuthority.js:~682` fallback spreads + filters the full list;
plan: `design/perf/TABLE_AUTHORITY_PLAN.md`). (b) Batch and cap contact-impact emission per tick and
coalesce by body pair (`src/combat/physicalEffects.js` and its listeners). (c) AI level-of-detail:
far or off-screen enemies think at a lower cadence, never all on the same tick. (d) Pool projectiles,
events and temporaries; no per-tick closures or array spreads in hot loops. (e) Rapier: try the SIMD
build, CCD only on bodies that need it, sleeping on, profile with `World.timing*`. Everything stays
deterministic (`state.rng`, `state.simTime`) and worker-safe (Lane 1 is flipping the sim into a
worker, packet M1 — no DOM, no `window`, no main-thread-only reads in sim code). Done when a
within-session A/B shows the sim step ≤ 8 ms at the 150-body round.

**F2 — Row 488 ROCK-BUDGET.** Wave 15 at sim p95 ≤ 20 ms (floor), ≤ 8 ms (target), measured on
the laptop with a fixed-seed stress fixture. Commit the fixture so every later packet re-measures it.

Current 2026-11-01 production wave-15 fixture (`sim-crowd-stress`, seed4242, 600 warmup +
600 measured ticks) averages 157.2 entities: total sim mean27.257ms, p50 26.620, p95 39.208,
p99 42.977. Physics averages11.022ms/tick; tactical AI6.227ms. These miss F1/F2 targets.
The bounded CPU profile identifies activity classification/perception as material AI descendants;
`8dc86e044cbe` reuses an identical presence-radius read during discovery-cell rebuilds, with
31 focused owner checks passing. No matched speedup is claimed for that small change.
The separate Ceres physics fixture covers98 entities, p50 6.357/p95 16.673ms; disabling authored
far-static collision bodies is a diagnostic only and was not shipped. Neither fixture is ordinary
wave-15 or public-Ceres acceptance. Artifacts live under `.devshots/finish/integration-2026-11-01/`.

### Wave C — the fight (the showcase)

November3 F1 follow-up: the official matching Rapier0.19.3 SIMD experiment is complete and
rejected for promotion. Production-loader guards remain active in the artifact-only trial.
Full-game trajectories diverge (34,818 scalar impacts versus34,411 SIMD), and the separate
unchanged-fixture timing ABBA provides no reliable useful gain (mean scalar15.505/16.119ms;
SIMD15.133/19.715ms). No production dependency changed and no full save-compatibility claim is
made. F1/F2 targets remain open; do not reassign SIMD as an untried shortcut. See
`.devshots/finish/integration-2026-11-02/terminal-factory/rapier-simd/measurement-02-results.json`.

Build-map rows are the spec; read each row's prose in `build_map.md` (§31–§34) before briefing it.

- **C1 — Row 501 W-HEADS** — the 14 Line heads, P0 first (Coupler, Breaker, Barb, Weld, Magnet, Override).
- **C2 — Row 500 W-PROVENANCE** — Stock, Worked, Named, Storied, Relic, Backordered; behaviours, not stats.
- **C3 — Row 489 ROCK-HEADS** — Line heads worth chasing: meta unlocks between runs (after C1).
- **C4 — Row 550 W-ARSENAL** — keep, merge or move the ~20 physics tools (`design/expansion/05_ASSET_ROSTER.md` §7.3).
- **C5 — Row 270 SWARM-08** — the Circuit journey: route map, alternate objectives, arsenal levels, evolutions, legendaries, abilities.
- **C6 — Row 481 RC-CRUCIBLE-DOOR** — Run What Killed You, Call the Champion, Wreck Ballast, Case Files, Grudge Ledger.
- **C7 — Row 475 RC-FELT** — every verb is felt: callout rarity, haptics, Around the World, Trick Book, arena bounties, Prize Run, Perfect Vent, Match Burn.
- **C8 — Row 545 W-CAMERA** — the camera follows the weight.
- **C9 — Row 390 AL-HAND-1** — the Line touches the world: obstruction provider, terrain wrap only on a deliberate swing (towing never snags), unwrap on reversal, no tunnelling.
- **C10 — Physics for everyone, verified.** `build_map.md` §31.0 fault 2 said AI never throws a body, NPC
  bolts cannot hurt NPCs, `_retaliate` only fires for the player, racing rivals ignore Massline anchors,
  and fields are read only by light enemies. Check each against today's code; finish what is still
  true (owner 2026-10-21: enemy physics weapons stay rare).

### Wave X — Strategic Chaos (the fight becomes a battlefield you can think about)
Thirteen unbuilt commissions in `design/program/strategic-chaos/` (only its authoring/evidence toolchain
exists; `node scripts/strategic-chaos.mjs brief SC-01` prints a complete brief; proof adapter in
`FOUNDATIONS.md`). Yours: **SC-01** Causal Playground, **SC-02** Battlefield Intelligence, **SC-03**
Tactical Command, **SC-04** Adversarial Tactics, **SC-05** Signal Warfare, **SC-07** Combinatorial
Combat, **SC-08** Pursuit and Escape, **SC-11** Multi-Party Operations, **SC-12** Scenario Forge and
Agent Workflow. (SC-06, SC-09, SC-10 are Lane 3's; SC-13 Cinematic Causal Feedback is Lane 1's.) They
extend the existing tactical AI, wingmen, law, cargo and presentation owners — never a parallel system.
Start with SC-01 and SC-12 (the playground and the scenario forge make every later one testable).

### Wave E — enemies and creatures that live in the physics

- **E1 — Row 503 W-COUPLING** — visible filaments; panic, aggression and grief cascades.
- **E2 — Row 504 W-PATHOLOGY** — pain loop, route memory, host-shadow Husks (after E1).
- **E3 — Row 507 W-BLOOM-LOW** — bloom ladder T0–T2 (spore drift, Lantern cyst, Glassback, Wake eel, Bellows).
- **E4 — Row 508 W-BLOOM-HIGH** — T3–T6 (Bristle ram, Furnace maw, Husks, Blind shepherd, Hive-hulk, Veil ray, Anchor beast, the Long Field).
  New creature visuals go in new files you create under `src/render/` (yours by creation; tell Lane 1 in its Inbox)
  and must meet Lane 1's per-effect budget.
- **E5 — Living-world districts with a fight in them** (after Lane 3 lands LW-01/LW-02 composition):
  **LW-04** Niner Bastion — a finite standing army; **LW-05** COUNTERSIGN — steal and use the same machine;
  **LW-14** a world that holds together under a bad pilot. Specs: `node scripts/living-world.mjs --task=LW-04`.

### Wave K — the code you own, consolidated

- **K1 — Retire the compatibility paths.** `flight.js` + `core/flightDynamics.js` (still imported by
  `aiPorts.js`, `redKite.js`, `tumbleStates.js` — port those), `ai.js`, the legacy custom physics backend
  (`core/physics.js` 2,638 lines next to `physicsAuthority.js`). Port or delete their tests (ruling 6).
- **K2 — Slim the registry.** `src/core/registry.js` has 273 imports, many `ui/*Prompt` and HUD modules;
  lazy-register per mode so a Crucible run does not construct Adventure-only systems (coordinate the
  UI imports with Lane 3's Inbox).
- **K3 — One loot path, one VFX request path from sim.** `lootShards`, `salvage`, `salvageActions`,
  `boreDeadDrop`, `uniqueLootAbilities` — find the overlap and fold it; sim emits one kind of effect
  intent that Lane 1's VFX owner consumes.
- **K4 — Census and ledger code out of the tick.** 157 files in `src/` mention "census"; runtime ledgers
  (`lossLedger`, `provenanceLedger`, `shipLedger`, `masslineTelemetry`, `runtimeWitness`) — measure each
  one's per-tick cost in your owned systems, move what is diagnostic behind a debug flag.

### Wave T — tests and scripts an agent can live with

- **T1 — Scripts.** 774 npm scripts and a `check` chain of 250+ `&&` steps. Build a manifest-driven
  runner (one JSON list of checks with tiers: fast / baseline / smoke / all) and cut `package.json`
  scripts to ≤ 150. Keep every command an agent doc names working, or update the doc's owner (Lane 3 Inbox).
- **T2 — CI.** 20 workflows; D224 timeouts on the software-GL runner: give those checks a real-GPU or
  a longer, honest budget, or move them out of the required set with a reason.
- **T3 — Source-text pins.** ~365 tests read `src/` with regexes. Convert the ones in your owned paths to
  behaviour tests as you touch them (ruling 7); keep a running count here.
- **T4 — Test time.** Find the slowest 50 tests; make them fast or move them to a slower tier.

## Critical owner map

These are the lane's high-impact systems and remain useful when a concrete combat, AI, physics,
mission, persistence or performance issue needs an owner: flight and feel, tactical AI, physics and
Rapier, Massline, weapons/damage, the five powers, Swarm/Crucible spawn and round flow, enemies and
creatures, loot/salvage, registry/system order, and input-to-action. The list is an owner map, not a
mandatory review queue or a claim that every system is at bar.

## Source coverage and current findings

The 2026-10-29 full-source inventory, explicit prior-read reuse and coverage caveats are in
[`SOURCE_COVERAGE_2026-10-29.md`](./SOURCE_COVERAGE_2026-10-29.md). Current gameplay results and open
acceptance limits are in [`INTEGRATION_COVERAGE.md`](./INTEGRATION_COVERAGE.md). Use these records
before assigning work so active or completed investigations are not repeated. Source coverage does
not prove gameplay acceptance or blanket quality; close this board's product outcomes against the
live owner and the smallest direct check that establishes the claim.

## INFERENCE (seed ≈ 35 lines in the brainstorm packet, README §6)

Seed directions — ground each in a live owner, write it in player words, give it a done check:
enemies that react to being shoved (tumble, panic, call for help); pilots who flee at low hull and
remember you; wingmen who die and leave a gap the formation feels; asteroids with mass you can read
before you swing them; a kill that ricochets into a second kill and the game noticing; formations that
break when their leader is pinned; pirates baiting patrols into each other; Crucible rounds with a
signature moment each; arena hazards that the physics turns into weapons; enemies that use the
environment rarely and memorably; the near miss rewarded; streaks and grudges that carry across runs;
the champion who adapts to how you killed them; creatures that react to Massline vibration; debris
that keeps momentum and becomes the next round's terrain.

Implemented and focused-tested 2026-11-02 (INFERENCE 100 program, wave 1 — one commit each,
`test/inf-*.test.mjs`, recorded in `design/program/inference-memory.json`; ordinary public
encounter progression remains distinct from these owner checks):
- inf-shove-panic (WF-02): a hull the pilot tosses rattles for a beat — guns cold, one mayday
  over the band — and a rattled reinforcement caller now calls its swarm at full hull, so the
  massline play reaches the encounter beat the counterHint promises (40d7b14def70).
- inf-fled-wing-grudge (WF-02): a wing the pilot broke and let run keeps its name on the moral
  ledger as a spared escape with a crew witness, so the return encounter can bring that named
  crew back grateful or armed, and the band's hails say the name (50e97d88b139).
- inf-crusher-bite (WF-15 repair): the crusher jaws bite — a hull shoved into the anvil at
  crumple speed takes the collision law's own damage through the combat kernel on a half-second
  grind cadence, and the pilot who aimed the shove keeps the kill (acf1f5ba2236).
Verified already deep, no unit taken: formations break when their leader is pinned
(squadFrame.js pinned-commander succession), the near miss rewarded (stunt closeShave → witness
barks → rep/salvage pay), creatures react to Massline vibration (alienEcology AE-051/F5).

Implemented and focused-tested, wave 2 (INFERENCE 100 program — one commit each unless noted,
recorded in `design/program/inference-memory.json`):
- inf-throw-carries (WF-02): the rock you threw keeps its speed into the next round and the
  room says so, instead of forgetting the carry (e08c9b664dd8).
- inf-wing-casualty-fold (WF-02): pick off a wingman and the enemy wing visibly folds in around
  the gap instead of flying a leaderless line; bundled with inf-scar-history and
  inf-mine-lane-drift in one commit (f8b04d2c3ca3 — deviation from one-commit-per-unit, noted).
- inf-mine-lane-drift (WF-02): a jackal's telegraphed mine seed is placed on the drifting
  rock's live pose with its current motion (same bundled commit).

Verified already deep, wave 3 reconciliation, no unit taken: chain kills ("a kill that
ricochets into a second kill and the game noticing") are fully built and registered —
src/combat/chainKills.js witnesses the wreck that carried the contact, holds a bounded
corpse ring, and the wire says one line per link (registered in the authoritative manifest).

Implemented and focused-tested, wave 4 (INFERENCE 100 program — one commit each, recorded in
`design/program/inference-memory.json`):
- inf-patrol-bait (WF-02): a hurt Reach raider squad spoofs Concord's voice — a Meridian
  screen hears a tithe at gunpoint, the patrol hears a rogue screen, and both stamp the
  canonical hostility fields, so the cross-fire flies through isHostileForAI while raiders
  hang wide with cold guns; a scanner pulse burns the mask (9f332bd9e1db).
- inf-current-rider (WF-02): a marked Crucible elite cuts its drive and lets the room current
  carry it — the same field-kernel acceleration every body feels slings it around the seam;
  one hit knocks it off and the authored thrust returns (72661896ebfb).
- inf-wing-gap-press (WF-16): a wingman's death names him on the band from the seat beside
  and carries a bounded grief press — attack_run at the killer, weapons free, leashed to the
  player; the player's fresh order cancels it (821b2b834e56).
Verified already deep, wave 4: Massline fauna vibration (alienEcology AE-051/059),
cross-run grudges (aceMemory New Run+ tiers + moral memory + defeat-streak mercy), Crucible
signature moments (six authored room laws + round events), formation-half of the wingman gap
(squadFrame sockets + wingMorale).

Implemented and focused-tested, wave 5 (INFERENCE 100 program — one commit each, recorded in
`design/program/inference-memory.json`):
- inf-coverseek (WF-02): a marked elite swings until a rock sits between it and you, then
  holds and coasts its orbit there; flank, hit, or the 5 s window restores the closing intent;
  the mark's lit lip shows only while a hold is live (6869b4f0b4dd).
- inf-room-end-cause (WF-16 repair): a hull a mine, drift bomb, sympathetic cookoff or the
  crusher jaws took reads MINED/MILLED and pays the documented PQ-174.02 physics rate when
  player-attributed, instead of reading as a gun kill (fe9b97714a9a).
- inf-dot-end-word (WF-16 repair): a hull the burn or tar corroded down reads WASTED in each
  arena's own language (TEMPERED/SOLDERED/SINGED/THAWED/SURGED/SLAGGED/SCALDED) instead of
  the gun word; attrition pays gun rate, never the force-table ratio (0aa2bdac25c4).
Verified already deep, wave 5: patrol intervention breadth (20182af972c4 —
patrolJurisdictionFor over four lawful responders; the board's "Concord-only" seam note was
stale), ricochet/bounce causality (collisionConsequences provenance + chainKills), DoT kill
credit (status periodic routes the applier as attackerId). Named skip: well dives (same
kind/subject family as coverseek — rotation reserves it).

Implemented and focused-tested, wave 6 (INFERENCE 100 program — one commit each, recorded in
`design/program/inference-memory.json`):
- inf-well-dive (WF-02): a marked Crucible elite dives THROUGH a gravity well to reach you —
  full thrust bent through the pull, guns live — instead of holding behind a rock; a hit
  breaks the commit; law-identical window/stagger/cooldown to the rider (392426e9c689).
- inf-plow-turn (WF-05 repair): shoving an enemy mine fence with your own plow turns it into
  your grenade — it trips on the pack that laid it, pays your credit, and the band says the
  shove took; NPC fields never turn NPC mines; your own mines never turn (8c77b0ed9119).
- inf-lance-aim (WF-15 repair): the Orbital Lance paints and strikes exactly where the
  crosshair points instead of a quarter-turn off it, and the thrown decoy drops ahead of the
  nose line (47209b767a46).
Verified already deep, wave 6: weapon-fire telemetry (overheat/empty/guns-out/guidance-lost
all tell), mine death by gunfire (routed through routeDamage → kernel). Named candidates
left with next steps: tether-latched pair crossing a field zone (needs a fixed-seed sim A/B
before a defect claim), spawn-cadence tell (survivalWave family foreign-dirty at the time).

## Traps

- Never edit `test/*.expected.json` to pass. A sim change that moves the golden is a real change: explain it or undo it.
- Do not run `check:all` / `check` in one go during a sitting; run the suites you touched.
- The feel contract: hands-off assisted flight gradually comes to rest (owner 2026-09-15); do not restore the old 90 WU/s retention target.
- `src/systems/input.js` edits need focused input/rebind/sim validation (`AGENTS.md` §6).
- A naive "emitted but never heard" event grep is noise here — events go through wrapper helpers; read before calling a wire dead.
- **D175 is a standing import guard, not a current game defect.** All 12 `classify-*` jobs were
  verified DONE+IMPORT with zero live dead-location reads in the 2026-10-07 check. On a future
  `design/program/vm-drop/` import, drop hunks using writerless `player.data.*` or `state.comms.*`
  locations; the remote-authoritative drop remains read-only here.
