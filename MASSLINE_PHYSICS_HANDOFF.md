# MASSLINE PHYSICS IDENTITY — Implementation Handoff

**For:** An autonomous implementation agent with high reasoning effort.
**From:** A design conversation between Robin (the developer) and a planning agent, July 2026.
**Latitude:** HIGH. This document describes a vision, a set of approved ideas, and the reasoning behind them. It deliberately avoids prescribing exact tunings, exact input schemes, or exact implementations. Where this doc says "one option is..." you are expected to consider alternatives and pick the best one. Where an idea has an unsolved design problem, the problem is stated honestly and solving it is part of your job. You may reorder, restructure, or improve anything here — what you may not do is violate the hard constraints in §7 or reintroduce the explicitly rejected ideas in §6.

---

## 1. The Vision — what this game becomes

SpaceFace is a top-down 2D Newtonian three.js space game (trade/combat/mining, Escape Velocity lineage) with a deep, feature-complete simulation backend: living economy, pirate ecology with named aces, factions, careers, story spine. An audit found its presentation layer strong (per-sector procedural nebulas, ACES-graded bloom, adaptive music, tiered hit-stop). What it lacks is a **unique, ownable gameplay identity** — and it already has the seed of one.

The seed is the **massline**: a physical tether (Rapier constraint) from the player's ship to other objects. Robin's core design insight, which this whole handoff builds on:

> Newtonian flight fails in most games because there is no way to establish a frame of reference between you and the thing you care about. The tether solves that. It makes Newtonian dogfighting *possible* — and 2D makes the tether *tractable* (only rotational inertia, centrifugal force, release timing, and relative mass to manage; in 3D it would be hopeless).

The closest prior art is Hardspace: Shipbreaker's salvage tethers. **No game has made relational physics the combat and traversal language of an open-world space game.** That is the unique value proposition, and after this work the game should be describable in one line:

> **"The space game where physics is the combat language — grapple, orbit, sling, and throw with honest Newtonian momentum."**

After implementation, a player in a light ship latches a heavy pirate and whips around him in a stabilized orbit, guns auto-tracking, while his shots miss her lateral speed. A player in a heavy ship grapples a light raider, drags him flailing, spins up by reeling in, and releases at the glowing indicator's peak to fling him tumbling into an asteroid — his wingman's morale breaks and he flees. The same player then latches a big rock, swings 180°, and slingshots herself across the sector toward the station she has targeted on the map, engines cold, invisible to the customs sensor cone she's coasting through. Every one of those moments is honest physics, every decision was the player's, and every millisecond of inhuman precision was the machine's.

**Momentum is the game's real currency.** Players earn it (slingshots, hitchhiking), spend it (throws, flings), hide inside it (coasting dark), and are defined by it (ship mass as class system). Newtonian flight stops being a difficulty setting and becomes the resource system the whole game runs on.

---

## 2. Design principles (the filters everything must pass)

These came out of hard-won discussion. Treat them as law unless you find something better, and if you do, document why.

1. **Player supplies intent; computer supplies precision.** Assists may remove *timing precision* (release frames, lead angles) but never *decisions* (what to latch, when to reel, which target, when to commit). "Too much assist and it becomes a cutscene; too little and it's impossible" — the assist strength should be a tunable dial, ideally a player-facing setting, not a hardcoded guess.
2. **No new powers for enemies.** Robin explicitly fears (correctly) that giving AI the tether would ruin the game: "they'll just grapple the shit out of me," and AI line-cutting would negate the mechanic entirely. Every feature here is player-side. Enemies *react* to physics (tumble, morale-break, take momentum damage); they do not wield it. (This could be revisited far in the future, after the player-side game is proven, with extreme calibration care — but it is out of scope for this run.)
3. **Honest physics, asymmetric consequences.** Forces are real (conservation of momentum and angular momentum, real constraint dynamics). But *consequences* can be asymmetric for playability: the player should NOT take hull damage from collisions (see §3.5). Precedent: Escape Velocity had no collision damage; nobody complained.
4. **Difficulty comes from mastery depth, not punishment.** The game has historically had a "ridiculously hard" problem (Robin's words). Every feature should widen the gap between novice-viable and expert-spectacular without making novice play miserable.
5. **Mass ratio is the class system.** Heavy ships drag, flick, and body their way through fights; light ships orbit, dodge, and shred. Every mechanic should express differently across the mass spectrum rather than fighting it.
6. **Compose with what exists.** The repo has ~100 live systems. Prefer wiring new mechanics into existing systems (morale, careers, customs, traffic, loot) over inventing parallel ones. The file map in §8 tells you what exists.

---

## 3. Tier 1 — The core massline combat rework

These form one coherent system and should probably be built together.

### 3.1 Tether-lock fire control ("the massline is how you aim")

**The problem it solves:** Auto-targeting is currently broken and, for free-flying targets, arguably *unfixable* — enemies maneuver erratically and lead prediction against unknown future acceleration is a guess. Robin: "the bullets don't hit the enemy even if I'm very close."

**The insight:** A taut tether *constrains* the target's relative motion. The target sits on (or near) a circle of known radius with measurable angular velocity relative to the player. Lead prediction goes from impossible to closed-form (or near-closed-form). The same erratic motion that breaks free-flight prediction is eliminated by the constraint itself.

**The design:** While tethered to an enemy, guns get a real firing solution and reliably hit. The intended play pattern (Robin's own words): "I can focus on tether tricks and zip around dodging bullets in a dogfight while I can just hold the mouse button and it attacks the enemy, so I can focus on flight." Tethering an enemy should auto-target them — no extra targeting step.

**Implementation latitude:** `src/systems/weapons.js` already has `solveLeadAngle`. You decide: exact constrained-motion solver vs. very-strong-prediction-with-generous-hit-forgiveness (target-radius inflation, slight projectile magnetism while tethered) — or a blend. Consider hold-to-fire semantics where shots only leave the barrel on valid solution frames, so sustained fire feels like the guns "tracking" rather than spraying. Consider what untethered fire should be (current behavior? deliberately dumbfire? player-aimed only in WASD mode?). The requirement is the *guarantee*: tethered = your damage lands. What happens to slack vs. taut lines, extreme range, and turret arcs is yours to design.

### 3.2 Context-aware attachment (Robin's own proposal — he wants this)

Auto-detect what the tether hits and choose the attachment mode:
- **Enemy ship → nose/front attachment** (the current behavior, kept deliberately: facing the target is the point — flee-chases keep your guns on them, and orbiting is supposed to hold them at your focal point).
- **Draggable mass (asteroid, wreck, cargo) → tow attachment** (rear or center-of-mass), so hauling doesn't slew your heading and fight your steering.

One tether key, the game reads your intent from the target type. Consider edge cases: what about tethering a friendly/neutral ship (see hitchhiking, §5.1)? A station? Give the player an override if you find one is needed, but the default must be zero-friction.

### 3.3 The throw system (reel-as-spin-up + assisted release)

**Why it's fun:** "Flicking enemies off into space... or throwing them into each other" and slinging asteroids are the trailer moments. But un-assisted, throwing is impossible: "I'd have to bank a certain way and build up rotational inertia and then spin the thing and let it go right at the perfect instant... it'll be almost impossible to hit anything."

**The physics gift:** The trebuchet already exists in the engine. Reeling in (currently: hold F) while orbiting **is** the spin-up — conservation of angular momentum, the skater pulling in her arms. Shorter radius = faster spin. So the reel key is a physically-honest power meter. The skill is real: choose the mass, build the orbit, manage the radius. Only the release frame is inhuman.

**The assist (design carefully — this is the heart of the intent/precision principle):**
- A **release-timing indicator**: Robin wants "some kind of glowing indicator... that used color changes and intensity to tell the player when they're getting close to needing to release." As the tethered object's velocity vector sweeps toward the selected target each rotation, ramp color/intensity (e.g., cool → hot, pulse near-solution). Make it diegetic and readable at combat speed. The HUD/VFX systems in §8 give you the primitives.
- A **snap window**: player presses release; if within ±N ms of the true solution, the release snaps to the exact frame. N is THE tunable dial between impossible and cutscene.
- **Hold-to-arm as an alternative/additional mode**: hold the release input and it fires on the *next* solution frame. This solves the asymmetry Robin identified: "the button has to be pushed BEFORE the moment, or else the opportunity is gone" — assists can only help on one side of a point-in-time press. Arming works entirely on the early side. Also note: in a sustained spin the solution *recurs every rotation*, so a missed window costs one revolution (~a second), not the whole setup. Consider shipping both snap-window and arm modes as settings.
- **Target-size honesty:** big targets (stations, capital ships, large asteroids) get generous solutions; hitting a small moving fighter with a thrown crate stays genuinely hard. Moving-target intercepts for thrown mass are hard even for the solver — it's fine (maybe correct) for thrown-mass-vs-fighter to be a low-percentage showoff play while thrown-mass-vs-big-slow-thing is bread and butter.

**What "release" targets:** the existing Tab-targeting selects the throw target. See §3.7 for the disambiguation problem — it's real and unsolved.

### 3.4 Tumble states + morale integration (make flinging matter without requiring kills)

**The problem:** "Flicking them into space currently would only throw them far out and then they'd come back" — pointless. And thrown-ship-hits-moving-ship is too hard to be the payoff.

**The design:** Make the *tumble* the payoff. A ship whipped past what its attitude thrusters can counter enters an uncontrolled spin for several seconds — can't aim, can't burn effectively, helpless. This is physically honest (your whip out-torqued their RCS), scales naturally with mass ratio (heavy flicks light — the class system again), and turns the fling into crowd control: tumble one pirate, kill his wingman while he flails.

**The composition:** `src/systems/pirateDisengage.js` and the pirate morale/ecology systems already exist. A pirate flung tumbling out of the fight should roll a morale/disengage check — sometimes he just *leaves*. Routing an enemy by physically yeeting him is a story players tell. Named aces (`aceMemory.js`) remembering being flung is flavor gold if cheap to add.

**The jackpot:** if he tumbles into an asteroid, momentum damage applies (§3.5) — present sometimes, never required. You decide the recovery model (RCS torque budget vs. angular velocity, skill-check, fixed duration...), whether player ships can tumble (probably only from environmental extremes, never from enemy action — see principle 2), and how the AI behaves during/after recovery.

### 3.5 Collision asymmetry ("I'd almost rather make impact damage not happen to me" — granted)

- **Player: no hull damage from impacts, ever.** At most a shield flicker/energy cost and the physical knockback itself (being bounced off-vector mid-fight is already real punishment). Robin's fear is correct: in Newtonian flight everyone smashes into things sometimes; impact damage would make the game "super difficult and next-to-impossible."
- **Enemies/objects: full momentum-exchange damage** above a closing-speed × mass threshold set well above anything normal piloting produces. Scraping = nothing; a slung boulder at full whip = real damage. Deliberate energy hurts; clumsiness doesn't.
- This asymmetry is a design choice, not a hack. Implement it cleanly in the damage path, not scattered.

### 3.6 Bullet time (Robin thinks this may be *essential* — take it seriously)

There is an existing **flyby focus** system ("supposed to slow down and focus on enemies when I fly by them fast, so that I have a chance to tether them" — search the codebase for it, likely in systems/ or presentation/). Robin's read: "a fast-paced newtonian flight game needs bullet-time in general, like a button I can push... slowing time might be essential for getting timing right."

Consider: a player-triggered time-dilation button (resource-limited? cooldown? free?), integration with the existing flyby focus rather than a parallel system, automatic micro-dilation near release-solution moments (careful — principle 1: don't take the moment away, just widen it), and whether bullet time is also the natural *disambiguation space* for §3.7. The fixed-timestep loop (`src/core/loop.js`) and the audio system's time handling will need care. This may be the single highest-leverage usability feature in the whole handoff — a timing-based physics game with a timing-widener stops being "ridiculously hard" without losing depth.

### 3.7 THE UNSOLVED DESIGN PROBLEM: targeting/intent disambiguation

Robin spotted this and it's real. The same primitives (tether + target + release) mean different things in combination:

| Tethered to | Targeting | Intended meaning |
|---|---|---|
| Enemy | (nothing/them) | Guns auto-target the tethered enemy |
| Object (rock) | Nav point / station on map | Release-to-slingshot MYSELF toward it (§4.1) |
| Object (rock) | Enemy | Throw the ROCK at the enemy |
| Enemy | Object / another enemy | Throw the tethered ENEMY at it |

"We'd have to have a way to disambiguate all those things and make them natural without a shitload of retargeting in mid battle." Solving this cleanly is a design task worthy of your effort. Directions to consider (pick, combine, or beat them): separate inputs for "release/drop line" vs. "throw at target" vs. "sling myself"; intent inference from target *type* with a consistent rule the player can internalize; a radial intent menu that only appears during bullet time; sticky dual-target memory (combat target + nav target coexist, different verbs consume different slots); context prompts on the release indicator showing WHICH action the current state would produce (always show the player what will happen before it happens). Whatever you choose, the test is: mid-dogfight, zero menu-fumbling, the player always knows what release will do.

---

## 4. Tier 2 — Traversal, stealth, and world texture

### 4.1 Slingshot traversal (self-throw)

The throw solver aimed at yourself: latch a big rock, swing, release at the indicator — you're the projectile. Free direction changes and speed without burning fuel. Target a station or nav point on the map and the same release-timing indicator tells you when to let go to fly there. Traversal skill ceiling, chase/escape mechanic, and the trailer shot.

**Planetary/large-body version (Robin's proposal, hack explicitly authorized):** True point-mass gravity would be a physics-engine rewrite — don't. Robin: "maybe just slight increase in flight speed and an instant boost when untethering from a planet could approximate this... untethering from larger objects means flicking fast off in the direction you're going." Approximate gravity slingshots with anchor-mass-scaled release bonuses: tether a planet/moon/huge station, swing, and release with a speed bonus proportional to anchor mass. If you find a cheap way to make it feel more like real orbital mechanics (e.g., a scripted acceleration curve while tethered to planetary bodies), great — but the hack is approved and the *feel* (bigger anchor = mightier fling) is the requirement.

**Speed-cap interaction — important:** The game currently has a hard max speed ("tops out at a max speed and that probably helps avoid ridiculousness, but also prevents some of the more interesting aspects... so that should maybe be lessened"). One elegant option: keep the cap on *thruster-generated* speed but exempt (or soft-cap much higher) *physics-earned* velocity from slingshots/flings — control feel stays, physics tricks get to be spectacular, and speed becomes something you *earn* through skill. NOTE: the speed cap likely lives in flight tuning, which is ANOTHER AGENT'S ACTIVE LANE (§7). Implement your side (tagging/exempting slingshot-derived velocity) in massline/gameplay code if possible, and leave a clear coordination note rather than editing `flightTuning.js` / `flightV3.js` yourself.

### 4.2 Cloak & sensor stealth (Robin's design, near-fully specified by him — build his version)

- A **cloak module**: activated stealth with an energy bar that drains and recharges. Upgradeable through the existing outfitting/tech systems (better cloak = better numbers).
- A **detection-radius ring** around the ship: the visible circle showing how close someone must be to see you while cloaked. Better cloak = smaller circle.
- **The ring is dynamic**: thrusting grows it, firing guns grows it, (consider: speed, reeling, boost, bullet time). **Coasting/floating = smallest signature** — this is the beautiful part: it makes Newtonian drift *purposeful*. Cut engines, commit to a ballistic arc, and glide dark through a customs cone or pirate ambush zone. Composes with existing systems: customs/lawSecurity scans, smuggling, `ambushSignatures.js`, pirate ecology. Gives the smuggler career a physical skill instead of a dice roll.
- **Float inhibitor**: the ship's natural drift is currently damped on purpose ("it makes it easier to fly if the ship isn't always floating around, but the inhibitor could be lessened probably because it is a bit strong"). Lessening it slightly rewards the stealth-drift playstyle and honest Newtonian feel — but this brushes the flight lane; prefer making it a cloak-state or player-toggle modifier over changing global tuning (§7).
- AI perception (`tacticalAI.js`, encounter systems) needs to respect the radius honestly — no cheating AI that "knows" where a cloaked player is.

### 4.3 Loot magnetism (small, do it, it unblocks the physics fantasy)

"Currently I have to fly over and get whatever goodies they dropped." Standard genre solution, explicitly wanted: destroyed enemies/cracked rocks drop glowing shards/orbs that accelerate toward the player's ship within a pickup radius and auto-collect. Without this, every fling/tumble/throw kill creates a tedious cleanup chore that punishes using the fun mechanics. Keep bulk salvage wrecks (the salvage career, `salvage.js`, `aftermathWrecks.js`) as-is — magnetism is for small pickups, not the salvage verbs.

### 4.4 Terrain budgets (combat arenas need anchors, not gravel)

Throws, slingshots, and tumble-kills need *stuff to interact with* — but Robin's slippery-slope worry is right: "it'd be hard to fly if there's a lot of things to smash into... it'd impede my flight." The composition rule: **few, large anchors** (2–3 big asteroids/wrecks per combat bubble — tether points, throw targets, tumble hazards), not debris fields. `encounterDirector.js` / `spawnBudget.js` already exist — add a terrain budget alongside the spawn budget. Big-and-few reads as playground; small-and-many reads as gravel in your shoes. (Collision asymmetry §3.5 already ensures clutter can bounce but never kill the player.)

---

## 5. Tier 3 — Later-game and world-dependent (implement if the run has room; otherwise spec stubs)

### 5.1 Tether-hitchhiking on traffic

Latch onto a passing freighter/caravan and steal its delta-v — free towing across the sector if friendly, the opening move of piracy if not. Robin: "this would be best if the world was filled out with more ships doing more things like running trade routes... especially if they were really fast or gained a lot of speed more than I probably could." So this is half a tether feature, half a world-texture feature: the economy/traffic systems (`world.js`, `sectorSim.js`, economy contracts) already simulate trade — consider making fast, visible, schedulable convoys a real presence players can learn and use. Mass ratio comedy included (heavy haulers don't notice you; peers get yanked).

### 5.2 Bomb propulsion (late-game unlock — Robin's design)

An alternative boost: drop explosive charges behind the ship that detonate and propel it forward massively. Dual-use by design: propulsion burst, AND damage to pursuers, AND emergency getaway. Robin wants it as a **later unlock** "when someone gets used to the massline and the regular boost" — respect that pacing; wire it into the tech tree/outfitting progression, not the starting kit. Note `impulseCharges.js` already exists in the massline family — investigate whether it's a foundation or a naming coincidence.

### 5.3 Jettison-as-impulse (small, honest, cheap)

Cargo has real mass (`cargo.js`). Dumping it should thrust you forward (reaction mass) — a panic button that doubles as a bribe: the pirate chooses between chasing you and scooping your ore. Falls out of one honest equation; low effort; include if convenient.

---

## 6. Explicitly REJECTED / DEFERRED ideas (do not reintroduce without strong new reasoning)

- **Enemy tether use / AI line-cutting** — rejected for calibration risk (see principle 2).
- **Recoil-as-thrust (guns pushing the ship)** — rejected: "you're already balancing a whole lot with flight and aiming... you're flirting with the 3-body problem of impossibility." Bomb propulsion (§5.2) is the sanctioned version of weaponized thrust.
- **Centrifugal mining (spinning rocks to shed ore)** — rejected: risks muddying the drag/tow/fling verbs already assigned to asteroids ("could kind of ruin some of the dragging and tethering mechanics").
- **Pin bolts (leaving tether lines between objects, tying enemies to things)** — deferred: "hard to implement or aim." Revisit only after the core loop is proven.
- **True gravity simulation** — deferred in favor of the approved approximation (§4.1).
- **Orbit assist as a major system** — downgraded: once tether-lock gunnery works, perfect facing matters less ("if the guns are auto-targeted it doesn't matter anymore if the ship is perfectly facing the enemy"). Light stabilization damping at most, if it helps the throw system; don't build it big.

---

## 7. HARD CONSTRAINTS — read carefully, these are not suggestions

1. **Another agent is concurrently working on flight feel (BP-07).** Its lane: `src/systems/flightV3.js`, `src/data/flightTuning.js`, `src/core/flight/propulsionKernel.js` (and generally the core flight controller). **Do not modify those files.** Where your features want flight-side changes (speed cap softening §4.1, float inhibitor §4.2), implement on your side of the boundary (state flags, velocity tagging, modifiers applied in your own systems) and/or leave explicit coordination notes in your final report.
2. **The golden sim baseline must stay clean.** The repo is gated by ~360 `check:*` npm scripts and a deterministic golden replay (scenario 47A: `src/data/scenarios/47a.scenario.json`, `docs/Spec/47A_SLICE_CONTRACT.md`). `check:sim:compare` must remain byte-identical (there is one documented pre-existing 47A projectile-collision precondition failure — see `design/revamp/_history/_BASELINE.md`; don't chase it, don't worsen it). **The clean pattern: feature-flag everything, default OFF**, so the 47A replay never sees your systems until a flag is deliberately flipped. Look at how existing systems register in `src/core/registry.js` (SYSTEMS + UPDATE_ORDER) and follow local conventions for gating.
3. **Run the relevant checks** before and after (`package.json` scripts; combat/tether/sim ones especially). New persistent state (tumble states, cloak module, ace memories of being flung) must go through the save system properly: `src/save/saveSystem.js` + `src/save/migrations.js` (schema is check-gated).
4. **Ignore `.campaign/workspaces/*`** — they are stale duplicate snapshots of the whole repo. Also ignore `node_modules`, `.devshots`, `.serena`. Work only in the real tree.
5. **Match repo conventions**: native ES modules, no bundler in dev (`node server.js` to run), data-driven tuning in `src/data/`, DOM/CSS UI overlay (not canvas UI), procedural Web Audio (no audio assets), pooled VFX. Read `design/revamp/PROGRESS.md` for the current task ledger format; `design/revamp/_history/STATUS.md` has the historical shipped-wave ledger (read for conventions).
6. **New mechanics need teaching**: `src/systems/onboarding.js` runs a paced first-hour rail including a tether drill (`onboarding/flightDrill.js` pattern) and one-time contextual hints in `state.player.hints`. Flag-gated onboarding beats for throw/cloak/slingshot should ship with the features (also flag-gated).

---

## 8. Codebase map (verified by prior audits — start here, don't grep blindly)

**Repo root:** `C:\Users\93rob\Documents\GitHub\SpaceFace`

**Massline / tether (your primary lane):**
- `src/systems/tetherGameplay.js` — the gameplay-side tether logic (latch, reel = hold F, release)
- `src/core/constraints/masslineController.js` — the Rapier constraint controller
- `src/systems/masslineTelemetry.js`, `masslineThreats.js`, `masslineImpacts.js` — telemetry/threat/impact layers
- `src/systems/impulseCharges.js` — existing impulse-charge system (relevant to §5.2)

**Combat / weapons / AI:**
- `src/systems/combat.js`, `src/systems/weapons.js` (contains `solveLeadAngle` — the seed of §3.1)
- `src/combat/` — module dir: runtime, statuses, subsystems, geometry, persistence
- `src/systems/tacticalAI.js` (the live AI path; `ai.js` is legacy), `src/systems/aiFireIntent.js`, `src/ai/gunnery.js`, `src/ai/director.js`
- `src/systems/combatOutcome.js`, `src/systems/aftermathWrecks.js`, `src/data/weakPoints.js`
- Pirate ecology: `src/systems/pirateDisengage.js`, `pirateParley.js`, `aceMemory.js`, `pirateRumor.js`, `src/data/pirateDoctrines.js`

**World / encounters / traffic:**
- `src/systems/world.js`, `src/systems/encounterDirector.js`, `src/systems/spawnBudget.js`, `src/systems/sectorSim.js`
- `src/systems/lawSecurity.js`, `src/systems/heat.js`, `src/systems/ambushSignatures.js` (stealth composition targets)

**Core plumbing:**
- `src/core/registry.js` — ~100 systems wired into SYSTEMS (init) and UPDATE_ORDER (fixed-timestep tick). New systems register here.
- `src/core/loop.js` — fixed-timestep loop (bullet time touches this), `src/main.js` — boot/new-game flow
- `src/save/saveSystem.js`, `src/save/migrations.js`, `src/save/checksum.js`
- Physics: Rapier via `@dimforge/rapier3d-compat@0.19.3`

**Presentation (for indicators, tumble VFX, cloak ring, loot shards):**
- `src/render/feel.js` — hit-stop tiers, FOV punch, damage vignette, trauma shake (add fling/tumble feel here)
- `src/render/vfx.js` (2,765 lines, pooled points/sprites/lights), `src/render/energy/energyMaterials.js`
- `src/render/camera.js` + `cameraDirector.js` — trauma shake, kill-cam, context zoom
- `src/ui/floatingText.js`, `src/ui/damageIndicators.js`, `src/ui/toasts.js`, HUD/target panel in `src/ui/`
- `src/audio/audioSystem.js` + `synth.js` + `cuePriorityBus.js` — 100+ semantic cues via `AUDIO_CUE_TO_RECIPE`; new events (latch, spin-up ramp, solution-lock, release, tumble, cloak) want cues; the priority bus handles ducking
- Flyby focus: exists per Robin ("slows down and focuses on enemies when I fly by them fast") — locate it (likely `src/systems/` or `src/presentation/`; search `flyby`) before designing bullet time (§3.6)

**Cargo / loot / progression (for §4.3, §5.3, cloak/bomb unlocks):**
- `src/systems/cargo.js`, `src/systems/fragileCargo.js`, `src/systems/salvage.js`
- `src/ui/screens/outfitting.js`, `src/ui/screens/techTree.js`, `src/systems/ships.js`, `src/data/blueprints.js`

**Status / spec ledger:** `design/revamp/PROGRESS.md` (current task ledger — append your results here), `design/revamp/_history/STATUS.md` (1,577-line historical ledger of shipped waves — read for conventions), `design/revamp/_history/_BASELINE.md` (the known 47A precondition). Flight context: `design/spec3/SPEC3-F3-flight-physics-feel.md` (live successor to the removed `FLIGHT_PHYSICS_SPEC.md`).

**Controls context:** WASD piloting + mouse aim is the working mode. Mouse-piloting mode exists but is currently broken/unusable (invisible cursor problem) — NOT your lane to fix (it's flight-adjacent), but don't design anything that only works with mouse piloting. F = tether/reel currently. Tab = cycle targets.

---

## 9. Suggested shape of the run (yours to improve)

1. Read `design/revamp/PROGRESS.md` and `design/revamp/_history/STATUS.md`, `src/core/registry.js`, the massline files, and `weapons.js` first. Locate flyby focus. Confirm the current tether input model by reading, not assuming.
2. Design pass FIRST on §3.7 (disambiguation) and the input model — it constrains everything else. Write your chosen model down before coding.
3. Build Tier 1 as one coherent flag-gated system family (suggest one master flag + per-feature subflags, e.g. `massline2.*`). Fire control before throw; throw before tumble; collision asymmetry early (it's small and de-risks playtests).
4. Bullet time (§3.6) as soon as the throw indicator exists — they should be tuned together.
5. Tier 2 in whatever order the code makes cheap (slingshot traversal likely nearly free after the throw solver; cloak is the most self-contained).
6. Playtest instrumentation: the repo has headless Playwright probes (`.devshots/`, various `check:*:probe` scripts) — consider adding a probe or dev scenario that exercises latch→orbit→reel→throw against a stationary and a moving target, so tuning has a feedback loop that isn't just vibes.
7. Ship with: feature flags documented, checks green, save migrations in place, STATUS.md ledger entries appended, onboarding beats gated, and a final report that lists (a) every tunable dial you introduced and its current value, (b) the coordination notes for the flight agent (speed cap, float inhibitor), (c) what you deliberately left for later.

**What success feels like:** flip the master flag, start a fight near two big asteroids, and the loop *sings* — latch, orbit, guns tracking, reel in, indicator ramps hot, release, pirate tumbles into rock, wingman flees, shards stream into your hold, and you slingshot off the bigger asteroid toward the station you targeted, engines dark. Every one of those beats already has a system waiting to receive it. Go build the connective tissue.
