<!-- LIFETIME: ACTIVE_PROGRAM -->
# CHAOS — the physics-chaos open world (GTA in space)

**Owner direction, 2026-11-06.** The Adventure world should have the **physics-chaos feeling of
GTA**: a living place you can barrel through in a big ship like a tank, where everything reacts,
things break and pile up, the law comes after you, and the situation spirals into a story. The
world today feels boring and lacking character — and that is mostly **attention to detail**, which
agents can supply if the work is laid out so they can't stop short.

**Gameplay and UX only.** No filler features (no replay, photo, or share tools). Every line in this
program changes what the player *does* or how clearly they understand it.

| File | What it is |
|---|---|
| this README | the vision, what exists, the reaction matrix (the stopping condition), the maturity ladder, the taste bar |
| [`IDEAS.md`](./IDEAS.md) | the front-loaded idea bank: ~45 gameplay/UX units in INFERENCE line format, grouped, each with reuse, done check, and how it goes wrong |
| [`LANES.md`](./LANES.md) | three lanes, their files, collisions with running work, and copy-paste prompts |

Related: `design/VISION.md` (the fantasy — read it all), `design/program/strategic-chaos/` (13
written but unbuilt commissions; this program builds the GTA-shaped ones), the master plan
(`../MASTER_PLAN.md`) and its lanes. INFERENCE agents: `design/inference-workflows/` and
`design/program/INFERENCE_LANES.md` remain the workflow; **this README and IDEAS.md are the seed**.

---

## 1. The vision

You're flying a heavy hauler through Helios traffic. You clip a shuttle — it spins out, its pilot
leans on the horn and swears at you on open comms. A patrol cutter two screens away swings toward
you. You don't stop: you shoulder through the docking queue, three tugs tumble into each other, a
fuel pod cracks and goes up, the explosion shoves a mining barge into the station's solar array,
which tears loose and drifts across the lane. Now you have two stars of heat, scavengers are
diving on the spilled ore, the shuttle you clipped is chasing you, and the news ticker at the next
station is talking about it.

None of that was scripted. It came from a few verbs (fly, ram, shoot, tow, throw) meeting a world
where **every object has mass and every actor has a reaction**.

What makes it GTA-like (study these qualities from what you know of the games — no videos needed):

| Reference | The quality |
|---|---|
| **GTA V / GTA IV** | reaction density: almost every person reacts to almost everything (honks, flinches, flees, films, fights back); the wanted ladder; carjacking; random events on the road; consequences you can see |
| **Just Cause 3/4** | the grapple as a chaos tool; physics destruction as the reward; escalating military response |
| **Burnout Paradise / Takedown** | ramming as the main verb; crash weight, slow-mo on the big one, wrecks that block the road |
| **BeamNG.drive / Teardown** | deformation and breakage that obey the physics; things come apart in believable pieces |
| **Red Faction: Guerrilla** | structures you can bring down, and why that's satisfying |
| **Saints Row / Crackdown** | rewarding the player for causing chaos with progression |
| **Freelancer / Elite** | the space setting: traffic lanes, stations, factions, police scans — read *how they made space feel inhabited*, not their pace |

**Never:**
- a reaction that is only text (a toast saying "the pilot is angry") — reactions are motion,
  sound and a short bark;
- a scripted event pretending to be systemic;
- the player immune to consequences: the world remembers, but failure mutates the situation
  instead of ending it (VISION: "failure should make better stories");
- breadth before depth: no new sector, faction or ship until the reaction matrix is full;
- filler features that don't change play.

## 2. What already exists (verified in code 2026-11-06)

| GTA staple | In code | Gap |
|---|---|---|
| Carjacking | `src/systems/shipjack.js`, Black Flag inputs, capture cradle research | not a casual, anytime verb |
| Wanted level | `src/systems/heat.js`, `lawSecurity.js` (jurisdiction, motive, named retaliation), WANTED ladder, custody chain | law reaches 3 sectors; escalation isn't cinematic; no visible search |
| Witnesses | law incidents, witnesses (FEEL_CONTRACT A12 added listeners) | not visible as a chase you can intercept |
| Bounty hunters | `src/data/bountyHunters.js`, Nemesis learner | not the escalation top tier |
| Explosive objects | `src/data/commodityVolatileClasses.js` (volatile cargo physics) | no chain reactions people notice |
| Tank vehicle | `ship_ironback` (barge), `ship_atlas` (heavy hauler), `ship_colossus` (battlecruiser, mass 520), `ship_leviathan` (flagship, 600) | no ram identity; light ships don't crumple dramatically against you |
| Crash damage | crumple law, heavy-as-terrain at mass ≥ 150, tumble fling (`src/combat/impulseKernel.js`) | tuned for safety, not spectacle (see `../swarm/AUDIT.md` §A) |
| Traffic | `src/systems/traffic*.js` (convoys, escorts, tugs, jobs, recovery) | drives like rails; no panic, no honks, no road rage |
| Random events | encounter director, 370 encounter files, microevent library | "211 vignettes from one template" |
| Gang turf | factions with grudges, conflict zones | you can't light the fuse yourself |

**So, again: the pieces exist; they don't react, escalate or pile up.** Most of this program is
connecting them and adding reactions.

## 3. The reaction matrix — the stopping condition for "feels alive"

"Make it feel mature" has no finish line, so agents stop early. This grid is the finish line.

**Rows — every actor type** (≈15): civilian shuttle, ore hauler, freighter (with containers),
tug, mining barge, miner drone, patrol cutter, interceptor, gunship, pirate raider, pirate boss,
scavenger, bounty hunter, station traffic control, station turret.

**Columns — every player stimulus** (≈12): flies past fast (near-miss); parks too close; shoots
near it; hits it; rams it; tows it with the Line; throws something into it; steals its cargo;
hijacks it; destroys its friend nearby; rescues it; carries high heat nearby.

**Each cell is a reaction with five parts:**
1. **Motion** — what it does physically (swerve, flee, chase, ram back, scatter, form up, stop dead).
2. **Tell** — how you can see it (engine flare, lights, turn, hazard strobe).
3. **Sound** — horn, engine note, radio squelch.
4. **Bark** — ≤ 8 words, in character, optional per cell, never a sentence of lore.
5. **Memory** — does it remember (follows you, reports you, holds a grudge, thanks you later)?

**Personality** varies the cell (cautious, aggressive, cocky, panicky, veteran — see IDEAS
CH-61): the same stimulus should not always produce the same reaction.

**Done for a cell** = implemented through existing owners + a 5–15 s capture of it happening in
ordinary play + a second agent confirms it reads without the HUD. **Done for the matrix** = every
cell done, or explicitly marked "no reaction is right" with a reason. The matrix lives as a table in
`chaos/MATRIX_STATUS.md` (created by lane C2) with a link to each capture.

**The life count (second stopping condition):** in any 10 s of ordinary flight near a station or
lane, at least **4** distinct things visibly happen that the player didn't cause (a docking, a
cargo transfer, a patrol scan, an argument, a breakdown, a race, a near-miss between NPCs). Measured
by an agent sampling 20 random 10 s windows per sector.

## 4. The maturity ladder — how to grow it in order

Don't climb a rung until the one below passes. Breadth (rung 6) is always last.

1. **Runs smooth** — master plan engine lanes (in flight).
2. **Reads clearly** — clean flight screen, plain words, one art direction (master plan lane 6).
3. **Weight** — ramming, breaking and piling up feel heavy and real (lane C1).
4. **Reaction** — the matrix and the life count (lane C2).
5. **Escalation and play** — heat, chases, hijacks, sandbox situations, activities, UX that makes
   chaos easy to start and follow (lanes C1–C3).
6. **Breadth** — more sectors, missions, ships, only after 3–5 pass.

## 5. How agents judge taste without reference videos

Agents know these games. Before building a unit, write 3–5 lines: "How does GTA V (or Burnout, Just
Cause…) handle this, specifically? What makes it feel good?" Then build, capture SpaceFace doing it,
and score the capture against those lines with a second agent. Example: *GTA V near-miss: the car
swerves, the horn sounds immediately, the driver shouts one line, and if you do it twice they may
follow you* — then check the SpaceFace capture does each of those beats.

## 6. Rules for this program

- Read `design/VISION.md` in full; it is this program's soul.
- Every unit reuses existing owners (law, heat, traffic, shipjack, factions, physics consequences,
  barks, fields). A parallel system is out.
- Every unit changes play or understanding. A cosmetic-only unit (glow, smoke, scar) is out of this
  program — the INFERENCE work already covers those well.
- Every visible unit: before/after capture on the ordinary route (Browser pane visible), judged
  against §1 "Never" and §5, plus one independent review.
- Determinism references are versioned, never overwritten. No per-frame cost without a matched
  laptop before/after.
- Shared checkout rules from `AGENTS.md` and `../MASTER_LANES.md` apply.
