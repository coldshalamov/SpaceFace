<!-- LIFETIME: STABLE -->
# Lane 2 — THE FIGHT & THE SIM (medium complexity)

**Written only by Lane 2.** Other lanes append one line to *Inbox* and nothing else.
Program law: [`README.md`](./README.md). Commands: [`TOOLS.md`](./TOOLS.md). Prompt: [`PROMPT_LANE_2.md`](./PROMPT_LANE_2.md).

**The outcome:** the fight is the best thing in SpaceFace — fast, physics-centric arcade combat
where *the rock is the gun* (owner direction 2026-10-21), Crucible/Swarm is a showcase you want to
replay, enemies and creatures behave like they live in the same physics you do — and the simulation
under it is cheap enough that 150+ bodies cost a few milliseconds, with the code and tests behind it
lean enough to change. Status words: `OPEN`, `ACTIVE`, `LANDED <sha>`, `SKIPPED (<reason>)`.

## Claimed paths (beyond README §3)

## Inbox (other lanes append one line: date, lane, path, what/why)

- 2026-10-28, Lane 3: H0 razor commit a054f36530a touched `test/ui-frame-references/README.md` (mechanical ref rewrite to `design/archive/…` after the doc moves — doc text only). Foreign-dirty work seen in the tree, not mine: `test/ceres-five-minute-acceptance.test.mjs` and `scripts/lib/ui-layout-measure.mjs` left unstaged and preserved.
- 2026-10-28, Lane 3: `test/lived-frontier-pockets.test.mjs` — removed a committed duplicate `ownsCharonSupplyHull` import (line 45) that left the file a SyntaxError on master (this was defect D265's red; the world bug was already fixed, suite 28/28 green). One-line deletion, committed alone as 1406c221a39.
- 2026-10-28, Lane 3: story-ledger red fix edited three test files — `test/story-campaign47a-fixtures.mjs` (new `plantFirstPlayerGrowth`/`plantNestOutcome` evidence helpers), `test/pq-178-03-ledger.test.mjs`, `test/story-spine-memory.test.mjs`. No assertions weakened: same checks now driven through the owner's persisted evidence shapes (compost `understory:playerGrowth` receipt, encounter-director terminal Nest receipt, ordered `campaign47a:b3:berth|maw|foreman` tags) that post-hardening recorders require. Source cause was a legacy-fill stepId mislabel + reader trusting stepId over signal — both in `src/story/`.

## Defects (this lane's share of the demo defect ledger — delete a row in the commit that fixes it)

| # | What a stranger sees | Where | Next step |
|---|---|---|---|
| D191 | Ceres refinery pocket population churn and temporary arrays on re-entry | `test/ceres-table-authority-census.test.mjs`, `test/ceres-active-pockets.test.mjs` | packet F1 |
| D241 | Residual sim-driven reds after the 2026-10-24 stale sweep | the suites named in the ledger row | packet F0 |
| D224 | CI browser checks fail only by timeout on the software-GL runner | `check:assets:live`, `check:market-first-loop`, `probe-flight-visual` | packet T2 |
| D175 | vm-drop `classify-*` patch jobs carry dead-location hunks (standing guard while importing vm-drop jobs) | `design/program/vm-drop/` (read-only) | guard only |

## Day-one review (from `LANDED_REVIEW.md`; delete the row there when done)

- **R-36df771** — row 403 AL-LONG-5 drone composer + warm flight restore: re-check a saved-and-restored
  composed loop resumes at the exact step it paused on. Fold into the first Codex batch.

## The ordered packets

### F0 — Green the floor
Run the sim reds in D241 one suite at a time (never `check:all` in one go), fix root causes, and
record which reds are environment-only. Done when D241's suites are green or each has a one-line
root cause in this board.

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

### Wave C — the fight (the showcase)

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

## Systems review — every system you own, to a studio bar (README §5.7; runs alongside the waves from day one)

**Critical systems — each gets a Codex deep review, then packets:** flight (`flightV3.js`,
`src/core/flight/**`, the feel contract), tactical AI (`tacticalAI.js`, `src/ai/**`, `aiPorts.js`,
`engagementAuthority.js`), physics authority and Rapier integration (`physicsAuthority.js`, contacts,
CCD, sleeping), the Massline/tether (`tetherGameplay.js` and its verbs), weapons and damage
(`src/combat/**`, `physicalEffects.js`, projectiles, heat), the five powers (Pull/Shove/Pin/Bomb/Rig),
spawning and directors for Swarm/Crucible (waves, arenas, draft, round flow), enemy and creature
behaviour, loot and salvage, the registry and system order (`registry.js`,
`authoritativeSystemManifest.js`), input-to-action (`input.js` — focused validation required).
**Then everything else you own**, ranked by how much a player feels it. Keep the list here with a
status per system: `UNREVIEWED → REVIEWED (<n> findings) → AT BAR <sha>`.

## The audit — read every line you own

Split your owned paths (`src/systems/**` combat/flight/swarm/physics/AI files, `src/ai/**`,
`src/combat/**`, `src/core/physics*`, `src/core/flight/**`, `src/sim/**`, `src/balance/**`, `src/matter/**`,
`src/sports/**`) into modules of ≤ ~3k lines and hand them evenly to Grok and Gemini (`TOOLS.md`): each
run reads every line and writes `.devshots/finish/lane2/audit/<module>.md` — bugs, determinism leaks
(ambient `Math.random`, `Date.now`), single-writer violations (economy→credits, factions→reputation,
cargo→cargo, ships→stats, heat→WANTED), O(n²) loops, per-tick allocation, dead code, duplicated systems,
and the three cheapest wins. Turn real findings into packets below this line.

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

## Traps

- Never edit `test/*.expected.json` to pass. A sim change that moves the golden is a real change: explain it or undo it.
- Do not run `check:all` / `check` in one go during a sitting; run the suites you touched.
- The feel contract: hands-off assisted flight gradually comes to rest (owner 2026-09-15); do not restore the old 90 WU/s retention target.
- `src/systems/input.js` edits need focused input/rebind/sim validation (`AGENTS.md` §6).
- A naive "emitted but never heard" event grep is noise here — events go through wrapper helpers; read before calling a wire dead.
