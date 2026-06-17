# SpaceFace — V2 Master Plan (living design doc)

> **Status:** DRAFT — active collaboration between the designer and the engineer. This doc
> sits *above* the 12 per-subsystem specs (`design/specs/00–11`) and `ARCHITECTURE.md`. It
> does **not** replace them; it unifies them around a single arc and adds the missing
> vertical-craft layers. Every section is open for iteration. Decisions marked **[LOCKED]**
> are settled in conversation; everything else is proposal.

---

## 0. North Star (the thesis)

> **Progression is the migration of the player's attention, not the addition of features.**

The verbs don't disappear as you advance — they *zoom out*. At Tier 0 your attention is on
the drill bit. At Tier 5 your attention is on which faction to back. Same world, same verbs
the whole way; the only thing that changes is the layer you operate on.

This is the DNA of every progression game people lose themselves to (Factorio, Satisfactory,
Stardew, Mindustry, Eve, Motherload). The single design law that makes it work:

> **Every automation must correspond to a pain you personally felt.** Design the pain first;
> the relief is the reward. You cannot begin the player with automation — the tedium *is* the
> onboarding, on a smooth curve.

Two axes structure the whole plan:
- **Horizontal axis — the arc:** manual → templated → automated → empire (§5–§8).
- **Vertical axis — the craft:** game feel, audio, rendering finish, UX clarity (§9–§12).
  Vertical cuts *across* every horizontal tier. You build it once, as infrastructure, and
  every system afterward benefits.

---

## 1. The Three Lenses (the world structure)

**[LOCKED]** — settled this conversation. This is the most important structural decision.

The game is **one continuous world seen through three lenses** — not three games. Progression
is, in part, spending more of your time at the higher (more abstract) lenses. Your attention
literally zooms out as you automate. All three lenses use the *same* Three.js engine; only
the camera + control scheme + renderable set change. Transitions are smooth (eased), never
hard cuts.

| Lens | View | You operate on | When you're here |
|---|---|---|---|
| **Space** | free-flight, semi-top-down 3D | ships, lanes, factions, fleets | always-available; the strategic layer |
| **Surface** | orthographic top-down 2D (StarCraft/Mindustry-style) | bases, rovers, conveyor logistics, structures | when you claim a body & descend to it |
| **Drill** | ant-farm 2D cross-section, ship/rover locked to L/R + up/down, ground transparent so you see veins | ore veins, gas pockets, hazards, depth | when you mine; the most tactile, manual verb |

**Why this works:** the visual *language switching* between lenses is itself the buildup feel.
You live in the Drill lens at Tier 0 (manual, intimate). By Tier 5 you live in Space and drop
into Drill only for fun or rescue. The same asteroid you hand-drilled at hour 1 is being
drilled by your rover-program at hour 20. *That* is the payoff.

**Engine note:** the existing flight camera already leans semi-top-down. Surface lens =
orthographic camera swap + a 2D world-anchor plane; Drill lens = orthographic + a slice plane
through a procedural voxel/vein field. Reuses the renderer; no second engine. This is the
cheap path that doesn't sacrifice the fantasy.

---

## 2. The Intervention Loop (the gold mechanic) — **PROPOSED, react hard**

When your automation fails — a rover gets jumped on a red lane, an outpost gets raided — the
game gives you a **choice**, not just a sad notification:

> *Let it go (eat the loss / insurance), or fly out personally and save it.*

If you fly out, **the manual verbs come back, on demand, at high stakes.** Your automated
empire *generates missions for you.* Late game you're not "done with dogfighting" — you're a
CEO who rolls up their sleeves to save a shipment.

Why this is the spine:
- Keeps manual combat relevant forever (it becomes elite *rescue* play, not grind).
- Makes you *care* about your drones (names, logs, damage → FTL/Rimworld emotion, cheaply).
- Ties combat directly to economy (your military protects your logistics, not a separate mode).
- Creates the drama a sandbox needs. The story is *your save's history*.

---

## 3. The Salvage Loop (death model) — **[LOCKED]**

- **Pirate / faction kill** → total loss. They take the cargo. (Build energy is always sunk.)
- **Animal / explosion / malfunction / gas** → wreck stays on-site, cargo recoverable at
  ~50% value + some depreciated scrap. Flying back to collect Rustbucket's remains is itself
  a mission. This creates a **salvage loop** and a reason to revisit old ground.

Corollary: **hazards must be *legible*, never random.** A gas pocket that nukes you with no
warning teaches nothing. A gas pocket with a tell (discoloration, hiss, seismometer blip)
teaches you to add a WAIT/avoid node to your drill program. *Pain must be readable so it can
be programmed around.* This is a core design law for the whole game and threads back into the
"aliveness" pillar — the world must *signal* so you can *decide*.

---

## 4. The Unified Automation Alphabet — **[LOCKED] + refined**

One alphabet, learned once at the manual tier by doing, then re-encoded. **Five atoms, period.**
Resist bloat.

| Primitive | Meaning |
|---|---|
| **MOVE** | to beacon / entity / sector (named targets, never raw coords) |
| **MINE** | here, until cargo full or vein empty |
| **INTERACT** | contextual verb from target: sell / buy / load / unload / dock / repair / build |
| **GUARD** | follow entity, engage hostiles (this is how escorts work — allied NPCs, no new engine) |
| **WAIT** | on a condition: cargo full, hull<X, threat near, or timer |

Every robot in the game is some sequence of those five. Examples:
- Hauler: `MOVE depot → INTERACT load → MOVE market → INTERACT sell → loop`
- Escort: `GUARD hauler`
- Scout: `MOVE sector → WAIT threat → INTERACT report`
- Drill rover: `MOVE vein → MINE until full → MOVE depot → INTERACT unload → loop`

**Refinements that preserve simplicity:**
- **Beacons, not coordinates.** "Move to *Depot Alpha*" — a named beacon you place in the
  world and stamp onto templates. Move the beacon → every template referencing it updates.
  Templates become *portable* across bodies.
- **Templates are saved compositions** ("Mine→Move→Sell"), parametrized by beacon slot.
  Author once, deploy to all your rovers.
- **Conditionals are a tier-unlock, not day-one.** `WAIT hull<50% → MOVE base → repair` is
  how you harden against pitfalls you've lived through. But you can't write it until you've
  researched the conditional node. So **automation-complexity itself is a progression axis:**
  early programs are straight lines; late ones have guards & branches.

**Relationship to existing spec 08:** spec 08 models drones/traders/outposts as *abstract
production buffers* (per the README's known-simplifications). **V2's job is to make them
literal, visible entities** driven by this alphabet. The economy math (upkeep, passive cap,
offline catch-up, loss rolls) from spec 08 is *kept* — it becomes the *consequence* of what
your visible drones actually do, not a parallel spreadsheet.

---

## 5. The Tiered Arc (horizontal progression)

Each tier gated by **money + tech + understanding** (you can't use conditional nodes until
you've earned them by hitting the pitfall). Names & gating open for iteration.

- **Tier 0 — Drifter.** Manual everything. Hand-drill (Drill lens), hand-haul, hand-fight.
  Meet all hazards, learn their tells. Feel every pain. Ship is a beat-up beater (per the
  Freelancer memory: "fly at least, not fast"). *Lens time: 90% Drill/Surface, 10% Space.*
- **Tier 1 — Operator.** First rover/drone. Alphabet unlocked: MOVE, MINE, INTERACT. You
  write a 3-step template and *feel* the relief. First beacon placed. *Lens time shifts.*
- **Tier 2 — Manager.** Small fleet, reusable templates, routes visible on the map. WAIT
  node unlocks → you start hardening against known pitfalls. **First intervention mission
  fires** (a drone gets jumped; fly out or eat it).
- **Tier 3 — Industrialist.** Claim a body (Surface lens unlocks as a real place you build
  on). Depot, factory, **teleporter that collapses your worst lane**. GUARD node unlocks
  escorts. Your logistics start shaping the local economy.
- **Tier 4 — Magnate.** Faction-scale. Your routes move enough volume to *move prices*.
  Escorts necessary on red lanes. Faction standing becomes a strategic resource.
- **Tier 5 — Sovereign.** You command fleets. Your automation *is* the economy. The world
  escalates around your power (rivals, blockades, war). Manual verbs return only as
  high-stakes intervention, by choice.

**[OPEN — react]** Tier 3 base-building scope: full Mindustry-style tile grid vs abstracted
"base-as-node-with-modules" seen from orbit with a light visual. The plan currently leans
**abstracted-with-light-visual** to keep focus on space, but Surface lens implies *some*
grid. This is a real fork.

---

## 6. New: Surface lens (top-down planetary) — **PROPOSED**

From the conversation: your ship (or a deployed rover) flies around a planet surface top-down
StarCraft/Mindustry-style to place structures, lay conveyor/logistics, and dispatch rovers.
Smooth flip from Space lens on descent; smooth flip into Drill lens when you mine a tile.

Open design questions to iterate:
- Does the *ship* land, or does it deploy rovers from orbit? (Memory note: user floats both —
  "maybe you need a mining rover; the ship just sends it down.") Lean: **early = ship lands &
  drives; Tier 1+ = deployable rover, ship stays in orbit.** This *is* the first automation.
- How literal are conveyors? Mindustry has belt primitives; we could template them as MOVE
  routes for hauler-bots instead of belt tiles. Lean: **bots-as-conveyors** — one alphabet,
  no second logistic system.
- Persistence: a claimed body is a saveable sub-region with its own state (structures,
  rovers, programs). New save schema section.

---

## 7. New: Drill lens (ant-farm mining) — **PROPOSED**

Motherload-style. Ship/rover locked to 2D (left/right + up/down) on a cross-section wall;
ground transparent so veins are visible; drill toward richer/harder materials. Depth = risk &
reward. This is the tactile verb that makes "I'm a miner" feel distinct from "I'm a trader."

Hazards (the learnable taxonomy, §3): **gas pocket** (tell: discoloration + hiss), **rock
burst** (tell: hairline cracks + tremor), **lava/hot zone** (tell: glow + heat gauge), and
ship-limit hazards like **pressure/depth crush** (tell: hull creak + depth gauge). Each has a
tell + a counter-program (WAIT condition, avoid-pattern, or equipment like a gas-shield).

This replaces the current "press mine near asteroid" abstraction with a real verb — and the
verb is *exactly* what the alphabet's MINE node externalizes later.

---

## 8. Economy ↔ Automation coupling (deepens spec 03 + 08)

- Your drones flood a market → price drops → you must find new markets or process higher.
  *Your own automation creates your next problem.* Economy isn't background; it's the
  consequence of your logistics.
- **Factories on-planet process ore into lighter, dearer goods** (Mindustry refinement as
  logistics: ore is heavy/cheap, processed goods are light/dear). *Where* you process is a
  decision.
- **Teleporter collapse**: building a teleporter between your base and a station zeroes your
  most painful lane — classic "automation that rewrites map geometry." A milestone unlock.
- Route danger is **visible on the map** (red/amber lanes) and *legible* (red because pirates
  operate here, or a faction war is on), so it's a *choice* (slow-safe vs fast-risky), not a
  hidden roll.

---

## 9. Vertical Craft — Game Feel (Tier S, do first)

The gap between "prototype with systems" and "game I lose hours to" is **game feel** — fifty
tiny feedback loops that make every action *land*. Currently near-zero. Highest ROI layer.

- **Camera trauma / shake** on impacts, scaled to event weight (bullet = micro-jitter,
  explosion = punch, capital death = trauma), decaying ~200ms. Earned, never constant.
- **Hit-stop**: 40–80ms world freeze on heavy hits/explosions. Most underrated trick in
  action games. Free weight.
- **Number popups**: damage, income, rep. Floating, eased, fading. Math → dopamine.
- **No linear interpolation on anything organic** — ship banking, UI panels, camera all use
  cubic/ease-out/back-overshoot. Linear = amateur giveaway.
- **Anticipation + follow-through**: engines flare *before* dash, barrel wobbles *after* a
  hard bank. Action lives in the negative space around the verb.
- **Input buffering + coyote time**: actions fire on intent, not razor frames.
- **Communicative particles**: directional impact sparks, shield-hit ring, mining debris by
  material. Particles are *information*, not confetti.
- **Engine ribbon trails** (GPU ribbon, tapering, gradient-fade) replacing the glow-orb.
  Feel *and* graphics at once; trail = info about direction/speed/boost/damage.

## 10. Vertical Craft — Audio bed (Tier S, equally non-negotiable)

Synth-only is fine (no asset pipeline), but the *bed* must exist. Half of feel.

- **Layered SFX per verb**, distinct by material & weapon.
- **Adaptive music** crossfaded by game state (cruise bed → tension on threat → combat →
  resolve), not hardcoded track switches.
- **Engine pitch follows throttle/boost** — ship *sounds* fast before it looks fast.
- **UI feedback**: hover/click/open/error beeps. Makes menus feel pro alone.
- **Ambient beds**: station hum, solar wind, scanner pulse — kills dead-silence space.
- **Spatial/distance attenuation** for combat events.

## 11. Vertical Craft — Rendering finish (Tier A)

Payoff order for Three.js:
1. **Bloom** — emissive materials glow. Biggest "looks real" win. One EffectComposer pass.
2. **Dynamic point lights at events** — muzzle, explosion, mining impact, shield bubble light
   their surroundings. Cheap, transformative.
3. **Tone mapping + color grading** (ACES filmic + coherent LUT). Fixes the flat/washed look
   every ungraded Three.js scene has.
4. **Distance fog / atmosphere** — depth, mood, hides pop-in. Almost free.
5. **PBR materials on hero assets** — ships/stations metalness/roughness, lit by the star.
6. **Subtle post on focus**: DoF; chromatic aberration + motion blur *only during boost*.
   The AAA tell without the AAA cost.
7. **MSAA/anti-aliasing** — no jaggies. Baseline.

Defer: volumetric god-rays, ray-tracing, SSR, photoreal textures. Overkill for browser.

## 12. Vertical Craft — UX clarity (Tier A)

- **Glanceable HUD** — health/cargo/heat peripheral, not a spreadsheet.
- **Minimap / sector map** with routes, threats (red lanes), beacons, drones.
- **Directional damage indicators** — red arcs at screen edge.
- **Goal compass / mission pointer** — soft 3D arrow to objective. Kills "what do I do."
- **Tooltips + progressive disclosure** — hover-for-info, advanced hidden until asked.
- **No full-screen modals during action.**
- **Settings that matter** — rebinds, audio mix, graphics quality toggle, color-blind palette,
  pause. Accessibility is table stakes in 2026.
- **Bulletproof save/load** — including the deferred items (nav waypoint, autoFire, save
  version bump to v2 with migration).

---

## 13. What EXISTS vs what's NEW (honest mapping)

Per the README + existing specs. V2's posture toward each:

| Area | Exists (v1) | V2 posture |
|---|---|---|
| Flight/combat | ✓ semi-Newtonian, mouse-aim, AI archetypes | **Deepen**: feel layer, engine ribbons, combat AI behaviors |
| Mining | ✓ beam-mining abstraction | **Transform**: add Drill lens (ant-farm); keep beam as a low-tier tool |
| Economy | ✓ living supply/demand, 33 commodities | **Deepen**: couple to your automation volume (your drones move prices) |
| Progression | ✓ 13 ships, tech tree, outfitting | **Keep + extend**: ship archetypes for boost/dash (already in v1) |
| World | ✓ 10 sectors, jump graph, fog-of-war | **Extend**: add claimable bodies for Surface lens; visible lane danger |
| Factions | ✓ 8 factions, rep, hostility | **Deepen**: factions run the *same* automation alphabet; their haulers ply your lanes |
| Missions | ✓ 10 types + story spine | **Transform**: intervention loop generates missions from your logistics state |
| Automation | spec'd, **abstract buffers** | **Transform**: literal visible entities driven by the 5-primitive alphabet |
| UI | ✓ full flight HUD + station hub | **Deepen**: feel, map w/ routes, goal compass, settings polish |
| Save | ✓ versioned, localStorage + export | **Harden**: serialize nav/autoFire, bump to v2 with migration; serialize claimed-bodies |
| Audio | ✓ synth SFX + adaptive bed | **Deepen**: the full Tier-S audio layer; ensure bed is actually playing |
| Render | ✓ meshes + camera + vfx | **Add**: post-processing stack (bloom/grade/fog), PBR, dynamic lights |

---

## 14. Build order — milestone slices (dependency-ordered)

Each milestone is a **playable, polished vertical slice**, not a raw feature dump. Vertical
craft is front-loaded as infrastructure so everything after lands polished.

**M0 — Feel & audio foundation (vertical infrastructure).** Juice framework (trauma,
hit-stop, number popups, easing), engine-ribbon trails, adaptive audio bed, post-processing
stack (bloom/grade/fog), dynamic event lights. *Deliverable: the existing game, but it feels
pro. No new systems.*

**M1 — Drill lens + manual mining verb (deepen the core).** Ant-farm mining screen, vein
fields, hazard taxonomy with tells, salvage loop. *Deliverable: mining is a real verb.*

**M2 — The alphabet + first drone (Tier 1 arc).** 5 primitives, beacons, templates, one
visible rover running a MINE→MOVE→INTERACT program in the Drill/Surface lens. *Deliverable:
you feel the first relief of automation.*

**M3 — Surface lens + claimable body (Tier 3 foundation).** Top-down planetary view,
base-as-node, depot/factory/teleporter, bots-as-conveyors. *Deliverable: you own a place.*

**M4 — Fleet + intervention loop (Tier 2–4).** GUARD escorts, visible route lanes, the
intervention mission generator, drone-as-character (names/logs/wear). *Deliverable: your
empire generates your drama.*

**M5 — Economy coupling + faction automation (Tier 4–5).** Your volume moves prices; factions
run the same alphabet; world escalation. *Deliverable: the world reacts to your power.*

**M6 — Polish & save hardening.** UX clarity pass, settings, accessibility, save v2 migration,
claimed-body serialization. *Deliverable: shippable.*

Milestones are ordered but **not strictly serial** — e.g. the feel framework (M0) and the
drill lens (M1) can prototyped in parallel. Dependencies: M2 needs M1 (you must feel the
manual verb before automating it — the core design law). M3 needs M2 (templates need the
alphabet). M4 needs M2+M3. M5 needs M4.

---

## 15. Open design questions (for further iteration)

1. **Sim model for drones:** real-time (drones update on the same 60Hz loop, you watch them)
   vs tick-on-dock (Stardew-style catch-up)? Lean real-time (watching the empire run = half
   the joy), but tick-on-dock is far less code. Spec 08 already has offline catch-up math —
   real-time would extend it, not replace it.
2. **Surface lens base scope:** full Mindustry tile grid vs abstracted base-as-node. Lean
   abstracted-with-light-visual.
3. **Ship-lands vs rover-deployed on surface:** lean early=land, Tier1+=deployable rover.
4. **Failure tone dial:** medium-harsh (intervention matters) vs gentle (insurance). Lean
   medium-harsh.
5. **Programming depth ceiling:** behavior templates forever, or a node-graph ("Programmer"
   rank) as a late tier for power users? Lean templates-first, graph-later/optional.
6. **Conditional-node gating:** which conditions unlock at which tier, and what pitfall earns
   each? (Maps hazard taxonomy → WAIT conditions → tier unlocks.)
7. **Teleporter as lane-collapser:** one per game? Faction-tech-gated? Does it trivialize the
   economy and need its own balancing?

---

## 16. Design laws (non-negotiable, recurring)

1. **Every automation = a pain you felt.** No starting automation. Tedium is onboarding.
2. **Pain must be legible** so it can be programmed around. Hazards have tells.
3. **One alphabet, learned once.** Five primitives. Resist bloat. Bots-as-conveyors, not a
   second logistic system.
4. **Manual verbs never die — they escalate** into elite intervention play.
5. **Progression zooms your attention out;** the world doesn't add features, you ascend layers.
6. **Feel is infrastructure.** Build it first; every system after benefits.
7. **The story is your save's history** — drone logs, faction grudges, salvage wrecks. No
   separate narrative engine needed beyond the intervention generator.

---

# PART II — Anti-patterns & Depth (iteration 2)

> The framing for this pass: **what would a professional Steam release refuse to ship with,
> and how do we *deepen* the systems we already have rather than just add more?** "Depth" here
> means a system has a *mastery curve* — a beginner gets a result, an expert gets a better
> result from the same system because they understand it deeper. Shallow systems have one
> answer. Deep systems have *better* answers.

## 17. Anti-patterns pro games refuse to ship (the shame-list)

Curated to *this* project. Each is a thing that reads as "indie/student/amateur" the second a
player sees it.

### Presentation anti-patterns
- **Flat-shaded unlit primitives** as final art. Acceptable for a prototype; unacceptable for
  ship. The fix is PBR + emissive maps (§11), not a million polys.
- **Linear motion on anything organic.** The single most reliable "amateur" tell. Every bank,
  zoom, panel open, camera move must ease. Non-negotiable.
- **Default browser font / Arial / unstyled DOM.** A real display font (even a free one —
  Orbitron, Rajdhani, Exo) + a readable body font instantly reads "shipped." Cost: one
  @font-face.
- **HUD as a spreadsheet.** Health as a bare number. Cargo as a table. Pro HUDs are *glanceable
  shapes* — arcs, rings, bars with state color, icons — that read in peripheral vision.
- **No death screen / no respawn flow / silent failures.** When something goes wrong the game
  must *say so*, clearly, with a path forward. Silent black screens are the #1 review-killer.
- **Loading with no progress, no idle.** A black screen during asset/sim init. Even a procedurally
  animated starfield + "INITIALIZING NAV…" reads pro. We already have a starfield; use it.
- **Inconsistent or missing tooltips.** Every stat, every icon, every commodity needs a hover
  affordance. Mystery numbers = "I don't understand my own ship."

### Gameplay anti-patterns
- **Single optimal build / single optimal route.** If there's one right answer, the game is
  solved on day one and dies. Every system needs ≥2 viable strategies (§19, mastery curves).
- **Number-go-up as the only feedback.** Credits increase and… nothing changes. Pro games make
  the *world* react to your numbers (rep unlocks dialogue, wealth draws threats, faction stance
  opens/closes markets). Your existing factions/rep system is the lever — *use it visibly*.
- **Failure with no information.** "You died." Why? A pro game tells you: *"Hull breached by
  plasma torpedo from Pirate Brigantine — shield was down."* Death is a *teaching moment*,
  not a punishment. This pairs with the legible-hazard law (§3).
- **Travel as dead time.** Flying from A to B with nothing to do or decide is the space-game
  killer. Fix: every long flight has a *decision* (route choice, scan-for-ambush, listen to
  comms, plan the next trade) — or it's fast (autopilot/jump with a skip + random-event roll).
  Never 3 minutes of empty void.
- **Menu-only "gameplay."** If the dominant late-game verb is clicking through menus, the game
  becomes a spreadsheet. The fix is the intervention loop (§2): automation generates
  *in-world* action, not more clicking.
- **Reversible, consequence-free choices.** If every decision can be undone, none of them
  matter. Some choices must *stick* — which faction you back, which body you claim, what you
  sacrifice to escape. Stakes create engagement.
- **Enemies that are stat-scaled clones.** Five interceptors with +10% HP each is not content.
  Behaviors are content (§20). A swarmer that *feels* different from a gunship is content.
- **Padded length.** Artificial grind gates ("collect 500 ore to unlock the next tier") are the
  cheap way to extend playtime. Pro games extend playtime with *mastery* and *emergence*, not
  grind. Every gate should be a *skill/knowledge* gate, not a number gate, where possible.

### Engineering/UX anti-patterns
- **No pause.** A single-player game in 2026 without a real pause (that also pauses menus,
  not just the sim) is unfinished. Critical for accessibility.
- **Unrebinding/unrebindable keys only.** ESDF, arrow-key, and left-handed players exist.
  Full rebind + presets is table stakes.
- **No accessibility options.** Color-blind palettes, text scale, motion-reduction (kills the
  trauma/shake for vestibular players — must be a toggle, §9), subtitle/equalized audio mix.
  Not optional in 2026.
- **Save corruption with no recovery.** A single bad byte shouldn't nuke a 20-hour save.
  Redundant slots + autosave rotation + JSON export (already spec'd) + a "last known good"
  backup on load failure.
- **Settings buried or absent.** Audio mix sliders, graphics quality, FOV/zoom, control
  sensitivity — all must exist and persist.
- **No difficulty options.** One curve fits nobody. At minimum: a "pilot skill" dial that
  scales enemy aggression/damage/economy pace. Pro games ship 3–5 presets + custom.

## 18. What "deepening" means (the principle)

A system is *deep* when an expert extracts more from it than a beginner, using the *same*
mechanics. Three levers create depth, in order of value:

1. **Inter-system coupling** — system A's output is system B's input. Expert sees the chain;
   beginner sees only A. *Highest value, lowest code cost.* Example: your drone fleet's mining
   volume feeds the economy, which moves prices, which changes which routes are profitable,
   which changes where you send drones. One loop, four systems, infinite emergence.
2. **Emergent state** — the world carries *memory* of what happened (drone logs, faction
   grudges, depleted veins, price history). The same action has different consequences
   depending on history. Replayability for free.
3. **Decision trade-offs** — every meaningful choice closes another door. Speed vs cargo, range
   vs firepower, automation vs control. If a choice has no cost, it's not a choice.

The cheap, high-value move is always **(1) coupling**. Most of the depth ideas below are
"wire the systems you already have into each other," not "build new systems."

## 19. Mastery curves per system (the depth targets)

For each core system, define a **beginner move** (works, gets a result) and an **expert move**
(gets a *better* result from the same system). This is how you know a system is deep, not just
present.

- **Mining (Drill lens):** Beginner = drill the nearest vein. Expert = read the vein map, route
  around gas pockets, target the deep rare seam, manage heat so you don't overheat mid-drill,
  time the rock-burst tells to dodge. *Same drill button, 3× yield for the expert.*
- **Trading:** Beginner = buy low, sell high, whatever the board says. Expert = read price
  *history* (is this rising or falling?), anticipate your own fleet's price impact, arbitrage
  across 3 stations, hold contraband for the right black market, use faction rep for better
  prices. *Same market screen, 5× profit.*
- **Combat:** Beginner = point and shoot, facetank. Expert = use facing weapon slots as a
  strategic choice (broadsides vs chase), manage heat/cap, exploit enemy archetype behavior
  (bait the swarmer, bracket the gunship), use asteroids as cover, dash to break locks. *Same
  guns, you survive 5v1 instead of dying 1v1.*
- **Automation:** Beginner = one drone on one route. Expert = template libraries, beacon
  networks, conditional guards for every known pitfall, escort composition per lane danger,
  diversified routes so you don't crash your own prices. *Same alphabet, an empire vs a bot.*
- **Exploration:** Beginner = follow the mission marker. Expert = read lane danger, plan fuel,
  scan for unmarked rich bodies, claim before competitors, map the fog-of-war strategically.
  *Same map, you find the gold others miss.*

If we can't articulate the beginner→expert gap for a system, that system is shallow and needs
deepening before it needs *more* of itself.

## 20. New depth mechanics to add (this iteration)

### 20a. The build-order puzzle (Factorio's real genius)
Mindustry/Factorio depth isn't "place buildings" — it's *what to build next, with limited
resources.* Port this: **at any moment you have more things you want than resources to build
them, and the order matters.** Do you sink credits into a second rover (more throughput) or a
teleporter (collapses a lane) or escorts (protects what you have)? Each choice delays the
others. This turns the progression from "earn → buy everything" into a *real-time strategy
puzzle*. **No new system** — just ensure resource scarcity makes the build order non-obvious.

### 20b. Threat escalation that mirrors your power (the rubber-band done right)
As your net worth/fleet grows, the world escalates *in kind, visibly*: pirate raids get bigger,
a rival faction sends privateers, bounties appear on *you* in hostile space. The key: **it must
be legible** (a comms warning, a rep threshold, a visible "WANTED" level) so it feels *fair*,
not punitive. This is the "the universe grew teeth because I got dangerous" beat from the v1
vision — make it mechanical. Couples directly to §20e (intervention loop).

### 20c. Wear, maintenance & degradation (the anti-depreciation loop)
Everything you own degrades: drone fuel (already spec'd), rover tread, weapon heat-sinks,
shield emitters, station modules. **Maintenance is a recurring cost that turns "I own it" into
"I upkeep it."** This is the real anti-idle mechanic — not an arbitrary cap (spec 08's passive
cap) but a *physical* reason your empire needs attention. Expert play = maintenance scheduling
(rotate rovers through depot repair cycles via the alphabet: `WAIT tread<30% → MOVE depot →
INTERACT repair → loop`). *Same alphabet, new INTERACT context.* Deepens automation, doesn't
add a system.

### 20d. Mass & inertia as a loadout decision
Cargo has *mass*, and mass affects handling. A full hold turns your interceptor into a barge.
This creates a real trade-off: **carry more (profit) or stay nimble (survive).** Traders hire
escorts *because* they can't fight loaded. Miners accept slugishness for yield. This is one
number (mass → turn-rate/thrust curve) that makes every loadout a decision. Pairs with §19
combat mastery (loaded-running is a real combat scenario).

### 20e. Time windows & perishable opportunity (kills static optimization)
Markets have *events*: a blockade creates a shortage (spike), a discovery floods a market
(crash), a faction war opens a black-market window. These are **time-boxed** — miss it, it's
gone. This prevents the late-game "solved economy" where you run the same optimal route forever.
The expert reads the *news feed* and reroutes; the beginner ignores it and wonders why prices
changed. Couples economy ↔ factions ↔ your routes. *Reuses existing economy event system,
makes it time-critical.*

### 20f. Reputation as a *spatial* resource, not just a number
Faction rep isn't a meter — it's *where you can fly safely, who'll trade with you, who'll shoot
on sight, whose lanes your drones can use.* Visualize it on the map: your space is green,
contested is amber, hostile is red. Losing rep with a faction *physically closes territory.*
This makes a diplomatic choice into a spatial one — deep, legible, consequential. Uses your
existing faction system; just *render* it on the map.

### 20g. The information economy (scanning as a verb)
Right now prices/veins/threats are presumably all visible immediately. **Make some of them
hidden until scanned.** A scan probe reveals a station's *current* prices (vs stale board
data), an asteroid's *vein composition* (vs blind drilling), a lane's *current* threat level
(vs average). Scanning costs time/fuel/probes. This creates an **information asymmetry** the
expert exploits: knowing what others don't is worth money. *One new verb (scan), deepens
trading/mining/routing simultaneously.* High leverage.

## 21. The "first 5 minutes" contract

A pro game teaches by doing, never by a text wall. The opening sequence must, without a
tutorial popup, let the player *do* one of each core verb and feel competent:

1. **Fly** (the ship responds — feel) →
2. **Mine** (Drill lens, first vein — number goes up) →
3. **Dock & sell** (market — first credits) →
4. **See a thing you can't afford yet** (the hook — "I want that") →
5. **A tiny threat** (one weak pirate — you fight or flee, both work).

No reading. By minute 5 the player understands fly/mine/trade/fight and has a *desire* (the
unaffordable ship/module). Everything else is layered on that competent base. If the opening
can't do this, no amount of late-game depth matters — they quit first.

## 22. Updated design laws (additions)

8. **Every system has a mastery curve** (§19). If you can't articulate beginner vs expert, the
   system is shallow — deepen it before extending it.
9. **Depth comes from coupling, not systems.** Wire existing systems into each other before
   building new ones.
10. **Travel is never dead time.** Every flight has a decision, or it's fast/skippable.
11. **Choices must have costs.** A reversible, consequence-free choice isn't a choice.
12. **The opening teaches by doing, in 5 minutes, no text walls.**
13. **The world reacts to your numbers visibly** (rep → territory, wealth → threats, volume →
    prices). Number-go-up with no world reaction is the spreadsheet death.

## 23. New open questions (this iteration)

8. **Wear/maintenance scope (§20c):** full per-component degradation, or just fuel + a generic
   "condition" stat? Lean: fuel + condition (two numbers), keep it legible.
9. **Scanning verb (§20g):** is it a deployable probe (physical object, costs materials) or a
   ship module (passive, costs a slot)? Lean: ship module — fits the existing outfitting system,
   and "do I sacrifice a slot for info" is itself a depth decision.
10. **Mass model (§20d):** linear mass→handling curve, or tiered (light/medium/heavy bands)?
    Lean: smooth curve, feels better.
11. **Threat escalation cap:** is there a "ceiling" so a Tier 5 player isn't perpetually
    swarmed, or does it scale infinitely? Lean: ceilings per region — safe core space stays
    safe, escalation happens at the frontier where the rewards are.

---

# PART III — Continuous Zoom & Deeper Coupling (iteration 3)

> **The breakthrough reframe:** there are no "modes." The game is **one continuous camera
> dolly along an altitude axis.** What I called "lenses" in Part I are not states you switch
> between — they're *altitudes* on a single zoom. You never press a button to "enter mining
> mode." You fly toward a planet, it grows, you get closer, surface detail resolves, you
> descend, you're driving on it. **No loading screen. No "press E to land." No modal switch.**
> The seamlessness *is* the buildup feel — it reads as one boundless world, not minigames
> stitched together.

## 24. The Continuous Zoom model (replaces the "Three Lenses" framing)

[LOCKED in spirit, mechanics PROPOSED] — this supersedes the discrete-lens table in §1. §1's
*content* (Space/Surface/Drill as what you do at each altitude) stays; the *framing* changes
from "switch modes" to "fly along a continuous altitude."

The camera has **one continuous zoom parameter** — call it `altitude` (or `cameraScale`).
Everything else is derived:

| Altitude band | What's visible | What you do | How it feels |
|---|---|---|---|
| High (system view) | sectors, jump lanes, your fleet dots | navigate, plan, command | strategic, god-view |
| Mid (space-flight) | ships, asteroids, stations, combat | fly, fight, dock, jump | the "core game" |
| Low (orbit) | a planet grows large, you match orbit | choose a landing zone, scan | transitional, anticipatory |
| Surface (top-down) | Mindustry-style: terrain, your structures, rovers | build, route logistics, explore for sites | SimCity/Mindustry |
| Subsurface (ant-farm) | transparent-ground cross-section, veins, hazards | drill (manual or watch a rover drill) | Motherload, tactile |

**The contract:** transitions between bands are **eased and continuous**, never modal. As you
descend toward a planet, LOD (level-of-detail) progressively swaps in surface geometry — from a
distant sphere, to a textured disc, to terrain tiles, to a drivable surface — *while you watch*.
The reverse on ascent. This is the Spore / No Man's Sky / Star Citizen fantasy, achievable in a
browser because **we control scope**: not every planet is landable, only *claimable bodies* get
the full descent chain. Gas giants and stars stay as backdrop. Scope-honest.

**Why this is the right call:** "minigames stitched together" is the #1 thing that makes a
sandbox feel like a mod pack. Seamless zoom makes it feel like *a universe*. The whole
progression fantasy (attention zooms out as you automate) is now *literally visualized* by the
camera. At Tier 0 you live at subsurface altitude. At Tier 5 you live at system altitude and
*dive* to subsurface only for fun or rescue.

## 25. The smooth manual-vs-automated rover solution

You nailed the problem: don't prompt "manual or automated?" with two buttons. The elegant
answer: **the camera follows your attention; automation happens whether you watch or not.**

- A rover has a **program** (the 5-primitive alphabet). It *always* runs, whether you're
  watching or not.
- If the rover has **no program** (or a "manual" stub), controlling it means **the camera
  follows it and you fly it** — your inputs drive it directly. This is manual mining.
- If the rover has a **real program**, it runs autonomously. You can still **watch it work** by
  flying the camera down to its altitude — you see it drill, move, unload, loop. You're not
  *controlling* it; you're *observing* your automation run. Optionally grab control mid-loop
  ("take the stick") if you want to intervene — and release to let the program resume.

**No prompt, no button choice.** The distinction emerges from *whether the rover has a program*
and *where your camera is.* This is the same principle as "the same verbs at different
altitudes": at subsurface altitude you *can* fly a rover; whether you *do* depends on if you've
automated it. The first time you watch your unattended rover fill a depot while you sip coffee
at orbit altitude — *that's the moment.*

Corollary — **the 2D view IS the mining view, manual or automated.** User insight: don't split
"manual mining view" from "automated mining view." There is one subsurface ant-farm view. If
your rover is manual, you drive it there. If it's automated, you watch it (or don't — you're at
orbit altitude doing something else). One view, two relationships to it. Cleaner, less code,
more legible. [LOCKED]

## 26. Progressive rendering & the no-loading-screen contract

To kill loading screens between altitude bands, rendering must **stream in** as you approach.
Concretely (Three.js):

- **LOD chain per claimable body:** far = billboard/low-poly sphere → mid = textured sphere →
  near = terrain tiles + structures → subsurface = vein cross-section. Each LOD is a renderable
  that fades in as altitude drops, swapped under a distance threshold. Standard Three.js LOD or
  a manual distance-gated visibility toggle.
- **Geometry is procedural & seed-stable:** a body's terrain, veins, and resource layout are
  generated from a per-body seed (one RNG per body id). Fly away, come back — it's the *same
  world*. This is also what makes "depleted vein" / "my old base" persistent: it's seed + your
  saved mutations on top.
- **No hard scene swap.** The space scene and the surface scene aren't two scenes — they're the
  *same scene graph* at different camera scale + different active LODs. This is the engineering
  commitment that makes seamlessness real. (Open question §31.1: how much of the existing
  space-scene renderer we reuse vs wrap — lean reuse, swap camera + add LODs.)
- **Subsurface is a slice, not a second world.** The drill view is a 2D camera looking at a
  procedurally-generated vertical slice through the body at your rover's position. Moving
  left/right scrolls the slice along the surface; drilling down extends it deeper. The "wall in
  front of you" is literally a cross-section of the planet you're standing on. No separate
  mining engine — it's a render mode of the same body.

## 27. What this means for the existing renderer (engineering scope read)

Honest read of what changes vs the current Three.js setup:

- **Camera system:** becomes altitude-driven, with eased transitions and a scale factor that
  affects what's culled/LOD'd. The current counter-lean roll stays for the space band.
- **Scene graph:** stays *one* scene. Bodies gain LOD children. Surface terrain + subsurface
  slice are children of a body, visible only at low altitude. This is additive — doesn't break
  existing space rendering.
- **New systems:** a `body` system (claimable bodies: seed, terrain gen, vein gen, structures,
  rovers, programs), a `zoom` controller (camera altitude + LOD gating + transition easing),
  and a `drill` system (subsurface rover control + vein extraction + hazards).
- **Save schema:** grows a `bodies` section (per-claimed-body: structures, rover states,
  program templates, depleted veins, scrap wrecks). Save v2 migration territory.

This is real work but it's **the** signature feature. It's what makes SpaceFace not feel like a
web toy. Worth the investment.

## 28. More depth mechanics (this iteration — coupling, not systems)

Continuing the §20 theme: wire existing systems together so experts extract more.

### 28a. Information propagation delay (price discovery as gameplay)
Prices don't update globally the instant a trade happens — **price info travels at the speed of
communication**, which in-space means: a station's board shows *its* prices; other stations'
prices are *stale* until a trader (you or NPC) visits and "reports" them. Scanning (§20g) or
visiting refreshes data. This makes the **information economy physical**: the expert maintains a
network of scouts/traders refreshing prices across stations; the beginner trades on stale data
and wonders why the "profitable" route dried up. Deepens trading + justifies the scan verb +
creates a role for fast scout ships. One rule (stale prices) couples three systems.

### 28b. NPC economic agents running the same alphabet as you
Factions/NPCs aren't background — they run the **same 5-primitive automation** you do. Their
haulers ply `MOVE→INTERACT` routes; their miners `MINE→MOVE→UNLOAD`; their patrols `GUARD`.
Their activity *is* the economy: when their haulers flood a station, prices drop (and you can
raid them). When a faction war disrupts their routes, shortages spike (and you profit). **One
alphabet, two sides of the economy.** This is the ultimate unification: you and the world are
made of the same stuff. Deepens factions + economy + combat (raiding NPC logistics is now a
*strategy*, not random piracy).

### 28c. Specialization as an emergent identity
Don't hardcode "classes" (Miner/Trader/Pirate). Let identity *emerge* from what you do and own:
- Your **ship loadout** (mining beams vs weapon racks vs cargo bays),
- Your **fleet composition** (rovers vs haulers vs escorts),
- Your **faction standing** (beloved trader vs wanted pirate),
- Your **claimed bodies** (industrial moons vs hidden pirate bases).

These combine into a *reputation the world assigns you* — NPCs address you differently, missions
offered shift, factions react. The expert *leans into* an identity for synergies (e.g., a
mining-magnate gets better drill-tech missions); the beginner is a generalist and gets generic
offers. No class-select screen — identity is earned, not picked. Deepens progression + factions
+ the "your save is your story" law.

### 28d. Compounding consequences (the anti-reset)
Some consequences **persist and compound**: a vein you depleted stays depleted (so you must
explore for new ones — exploration has lasting value). A faction you angered remembers (their
haulers avoid your space; their patrols hunt you). A body you strip-mined is *ruined* (lower
future yields, environmental consequences — maybe pollution that draws different hazards).
**Nothing resets.** The world is a ledger of your decisions. This is what makes a save *mean
something* and gives the 50th hour weight the 1st didn't. (Pairs with §20c wear — everything
decays, everything remembers.)

### 28e. The logistics chain as a puzzle (refining where, not just what)
You can refine ore → ingots → parts (v1 crafting). V2 deepens it: **WHERE you refine is a
decision.** On-planet refinery = cheap power, but you must ship refined goods up the gravity
well (mass cost, §20d). Station refinery = instant market access, but pricey fees and limited
slots. Deep-space mobile refinery (a ship module) = flexible but fragile. The expert optimizes
the *whole chain's location*; the beginner refines wherever's closest. Same crafting recipes,
spatial depth. Couples crafting + economy + mass + scan (knowing where demand is).

## 29. More anti-patterns pro games refuse to ship (this iteration)

- **Mode-switching UI for things that should be continuous.** "Press Tab for map, press M for
  mining, press B for base." A pro game's map/base/mining are *the same view at different
  zoom*. The continuous-zoom model (§24) is the fix. Modal stovepipes are the smell.
- **Instant, consequence-free fast travel.** "Click to teleport to station." Kills the spatial
  game. Fast travel, if it exists, must be *earned* (teleporter you built, §8), *risky*
  (jump-interdiction), or *costly* (fuel, jump-cooldown). The continuous zoom means travel is
  *never skipped for free* — you can dive to a body, but you flew there.
- **NPCs as static props.** Station NPCs that stand forever in the same spot with one line.
  Pro NPCs have schedules, routes, reactions — and in our case, *logistics* (§28b). A station
  trader whose prices change because a hauler arrived is alive; one whose prices are fixed is a
  vending machine.
- **Economy decoupled from the world.** Prices that ignore what's physically happening (your
  drones flooding the market, a war blockading a route). The coupling (§8, §28b) is the fix —
  the economy *is* the consequence of logistics, not a parallel spreadsheet.
- **Collectibles without meaning.** "Find 50 space rocks for an achievement." Pro collectibles
  *do something* — unlock lore, reveal a vein, flag a faction. Every collectible has gameplay
  value or it doesn't exist.
- **"Game-y" UI overlays that break world coherence.** Giant objective markers floating in
  diegetic space, mini-maps that look like a different art style than the world. Pro diegetic
  UI (in-cockpit readouts, ship-station comms) or *cohesive* overlay UI — pick one language and
  hold it. The continuous zoom helps: HUD at space altitude, base UI at surface altitude,
  rover dashboard at drill altitude. Each altitude has its own *coherent* interface.
- **Difficulty as damage sponges.** "Hard mode = enemies have 3× HP." That's not harder, that's
  slower. Pro difficulty = smarter AI, more enemies, scarcer resources, tighter economy, more
  aggressive threats. Behaviors and scarcity, not HP inflation. (Restates §17 / §20b.)
- **No reason to return to old areas.** Once you leave a sector, it's dead to you. Pro games
  give reasons to revisit: depleted veins recover (slowly), new events spawn, salvage wrecks
  await (§3), faction control shifts. The world isn't a one-way funnel.

## 30. Updated design laws (additions, this iteration)

14. **There are no modes — only altitude.** The game is one continuous zoom. Never prompt the
    player to "switch to" anything.
15. **The same alphabet runs the world and the player.** NPCs use the 5 primitives; you're made
    of the same stuff as the universe. (Unification law.)
16. **Nothing resets; everything remembers.** Depleted veins, faction grudges, ruined bodies,
    drone logs — the save is a ledger of decisions.
17. **Difficulty = behavior + scarcity, never HP inflation.**

## 31. New open questions (this iteration)

12. **Progressive rendering scope (§26):** full LOD chain on *every* planet (expensive) vs only
    on *claimable bodies* (scoped)? Lean claimable-only — gas giants/stars stay backdrop. Keeps
    the seamlessness where it matters without bankrupting scope.
13. **Subsurface slice persistence (§26):** is the drilled-out cross-section saved per-body
    (so your tunnels persist) or regenerated each descent? Lean saved — persistence is the
    whole point of "your save is your story" (§28d). Costs save schema space but pays in meaning.
14. **Stale-price radius (§28a):** how far does price info propagate instantly vs decay to
    stale? Lean: instant within a station's system, stale across jumps until visited/scanned.
15. **Specialization emergence (§28c):** how many axes before it's noise? Lean 3: loadout,
    fleet-composition, faction-standing. More than that and identity gets muddy.
16. **NPC automation simulation cost (§28b):** simulating every NPC hauler's full program is
    expensive. Lean: simulate NPC logistics *abstractly* (aggregate flows) but render a *sample*
    of them as visible ships near the player. The economy feels alive without N full sims.

---

# PART IV — Seed Procgen + Offscreen Statistical Sim (iteration 4)

> **The architecture decision that makes the whole plan viable.** The universe is
> **deterministically generated from per-entity seeds, mutated by a saved overlay of player
> actions, and simulated offscreen by a statistical engine — so when the camera returns,
> the world renders *as if* it had been rendered the whole time.** This is the Stellaris /
> Mount & Blade / Dwarf Fortress pattern. It solves perf, persistence, and "aliveness" in one
> stroke and is the load-bearing wall under everything in Parts I–III.

## 32. The world model: seed + mutation overlay

[LOCKED] — this is the foundation everything else stands on.

Every world entity (sector, body, asteroid field, station, NPC faction) has:
- A **seed** (a stable integer, hashed from its id + the save's master seed). From this seed,
  *all* of its intrinsic properties are deterministically derived: terrain layout, vein
  composition, structure, asteroid distribution, faction colors, NPC names. Same seed → same
  world, every time, forever. No stored geometry needed.
- A **mutation overlay** (saved, per-entity): the *diff* between the seed-state and current
  reality. Built structures, depleted veins, drilled tunnels, killed NPCs, mined-out asteroids,
  changed faction standing, placed beacons. **Only the mutations are saved; the seed regenerates
  the rest on demand.**

This means:
- **Tiny saves.** You don't save planet geometry; you save `{seed, mutations[]}`. A 50-hour save
  is kilobytes of mutations, not megabytes of world.
- **Infinite, stable worlds.** Procgen with a seed means the universe can be vast; only what
  you've *touched* costs memory.
- **"Nothing resets" (§28d) falls out for free.** Depleted veins, ruined bodies, built bases —
  all just entries in the mutation overlay.
- **Deterministic replay.** Same seed + same mutations = identical world. Great for debugging,
  sharing saves, and "the save is your story."

### 32.1 What's seeded vs mutated (the contract)

| Property | Seeded (regenerated) | Mutated (saved) |
|---|---|---|
| Body terrain | ✓ (from seed) | only if terraformed/ruined |
| Vein layout | ✓ | depleted tiles marked off |
| Asteroid field density | ✓ | mined asteroids removed |
| Station stock/prices | base values | live economy state |
| NPC faction roster | ✓ | killed NPCs, rep changes |
| Structures | none | ✓ all built structures |
| Rovers/programs | none | ✓ all your automation |
| Tunnels (drill view) | none | ✓ carved volume |

## 33. The offscreen statistical engine (the core innovation)

[LOCKED in concept, formula shape PROPOSED] — this is your danger-level idea, generalized.

**Nothing offscreen is simulated tick-by-tick.** Instead, when an event *would* happen offscreen
(a rover traverses a lane, a hauler runs a route, an NPC fleet patrols), the outcome is
**computed from a closed-form statistical model** parameterized by world state. When you return
to view, the result is *reconciled* into the visible world.

### 33.1 The universal offscreen-outcome formula

Your danger example is one instance of a general pattern. Define an **outcome probability**
for any offscreen action as a function of *asset stats × environment state*:

```
P(damage) = clamp( baseHazard(sector, lane, body)
                 × exposure(time, distance)
                 × assetVulnerability(stats)
                 × mitigation(stats, escorts) , 0, 1 )

if damage occurs:
  damageAmount = baseHazard × severity(stats) × random()  (seeded)
```

Where:
- **baseHazard** is a *world-owned* per-location scalar (the "danger level"): pirate density,
  faction war intensity, stellar radiation, asteroid turbulence. Stored on the sector/lane/body,
  *visible to the player as a map color* (§8 red/amber lanes), and *moves over time* as the
  offscreen sim advances NPC activity.
- **exposure** scales with how long/how far the asset is in the hazard (a fast hauler is in the
  lane for less time → less exposure → your "faster hauler takes less damage" intuition,
  formalized).
- **assetVulnerability** = function of the asset's stats (hull thickness, shield, sensor range).
  A thick-hulled bulk freighter survives hits a scout wouldn't.
- **mitigation** = function of escorts (GUARD bots), countermeasures, faction standing (friendly
  faction's space = lower hazard), scout intel (scanned lanes = known hazard, can reroute).

Your exact words — *"faster hauler takes less damage, higher danger = higher chance and amount,
thicker hull takes more, faster ship = less chance and less"* — map *directly* onto this:
- faster ship → less `exposure` AND lower `P` (it escapes)
- higher danger → higher `baseHazard` → higher `P` and `damageAmount`
- thicker hull → more `assetVulnerability` tolerance (absorbs more before "lost")

### 33.2 Why this is better than simulating every ship

- **O(1) per offscreen event.** A hauler completes a route → one formula evaluation, not 60Hz
  of pathfinding for 10 minutes. You can have *thousands* of NPC haulers in the background
  economy without CPU cost.
- **Statistically honest.** Over many events, the distribution of outcomes matches what you'd
  get from full simulation. The *aggregate* economy (prices moving, factions rising/falling)
  emerges correctly. Individual ships are a roll, but the *system* behaves right.
- **Reconciles on view.** When the camera arrives, we *instantiate* the entities the formula
  says should be there right now (a rover at 60% along its route, an NPC convoy mid-lane) and
  hand them to the live sim. They're "real" while you watch; they return to the statistical
  model when you leave. **View-gated rendering + view-gated simulation** — same boundary.

### 33.3 The reconciliation rules (what happens when you return)

When the camera re-enters a region after time `T` away:
1. **Advance the offscreen sim** for that region by `T` (coarse tick: economy drifts, hazards
   evolve, NPC logistics complete their cycles via the formula).
2. **Apply deferred outcomes** to your assets: rovers that were mid-route are now wherever the
   formula says (maybe damaged, maybe arrived); depleted veins stay depleted; built structures
   are there.
3. **Instantiate visible entities** the formula says exist *now*: NPC convoys mid-transit,
   patrol ships on station, your rover at its current program-step.
4. **Hand to live sim.** From here it's tick-by-tick until you leave again.

This is exactly "rendered realistically AS IF it had been rendered the whole time" — because
the *state* evolved correctly offscreen via the formula, even though the *pixels* didn't.

## 34. View-gated rendering (the perf model)

[LOCKED] — your direct instruction.

- **Only what's in view (or near view) is rendered.** Geometry for bodies/sectors you're not at
  doesn't exist in the scene graph; it's regenerated from seed + mutation when you approach
  (§32, §26 LOD chain).
- **Only what's in view is tick-simulated.** Offscreen entities use the statistical engine
  (§33), not the 60Hz loop. The live sim is bounded by what's on screen — perf is *always*
  predictable, regardless of how big your empire gets.
- **The continuous zoom (§24) defines the view boundary.** At system altitude you render
  sectors; at surface altitude you render one body's terrain. You never render both at once.
  This is what makes "infinite worlds" viable in a browser.
- **Pre-streaming, not pop-in.** As you descend toward a body, its LODs stream in *just before*
  they'd be visible, eased. The player sees smooth detail resolution, never a hard pop. This is
  the difference between "feels seamless" and "teleports assets in."

## 35. What this architecture *unlocks* (depth via coupling)

This isn't just a perf trick — it makes entire gameplay layers *possible*:

### 35.1 The macro-economy as a living thing
Because NPC haulers run `MOVE→INTERACT` (§28b) *offscreen via the formula*, their aggregate
flows move prices across the whole universe continuously. You return to a station and prices
have *shifted* because of offscreen NPC activity — not because a timer said so. The economy
feels alive because it *is* being simulated (statistically) whether you watch or not.

### 35.2 True empire management at scale
You can own 50 rovers, 10 outposts, 5 trade routes, 8 escorts — and it's cheap, because only
the handful you're watching are tick-simulated. The rest are formula outcomes. This is what
makes Tier 4–5 (§5) * playable*: your empire can be vast without melting the CPU.

### 35.3 The map as a real strategic instrument
Because `baseHazard` moves over time (NPC raids shift, wars flare, shortages propagate), the
sector map is *live intelligence*, not a static reference. Planning a route = reading current
hazard + your asset stats + scout intel (§28a stale prices now generalizes to stale *everything*).
The expert plays the *map*; the beginner plays the *ship*.

### 35.4 Interventions generated from real offscreen state
The intervention loop (§2) now fires from *honest* offscreen events: the formula rolled a
pirate attack on your hauler, you get the choice to intervene. The threat is real (it's in the
math), the stakes are real (your asset), the rescue is real (you fly there live). Drama from
the simulation, not scripted.

### 35.4 Time as a resource (new)
Because the offscreen sim advances whether you act or not, **time pressure becomes real.** A
shortage won't wait for you. A faction war will resolve (or escalate) without your input. Your
drones burn fuel (§20c) whether you watch or not. This kills the "pause and optimize forever"
anti-pattern (§17) and creates urgency — the hallmark of a game with *stakes*.

## 36. The seed economy & fairness contract

A subtle but critical rule: **the RNG used for offscreen outcomes must be seed-stable per
entity, not global.** Each entity (rover, lane, NPC) gets its own seeded RNG stream derived
from its id + the save seed. Why this matters:
- **No save-scumming exploits** (the outcome is deterministic given the seed — but the seed is
  fixed, so reloading doesn't reroll it; the *consequence* stands). Actually — design choice:
  do we *want* determinism (fairer, "the save is a ledger") or a fresh roll on reload (more
  game-y, forgives failure)? Lean determinism + a "fortune insurance" credit-sink that lets you
  reroll catastrophic losses for a price. Keeps stakes without brutal permadeath.
- **Reproducible bugs.** "Rover #42 died at T=3:22" is a deterministic, shareable, debuggable
  event. Huge for QA.

## 37. More anti-patterns this kills (additions)

- **"Simulate everything always"** → O(N) perf death as the empire grows. The statistical
  engine (§33) caps cost regardless of scale. (Engineering anti-pattern, now solved.)
- **Global RNG / save-scum-friendly outcomes** → trivializes consequences. Per-entity seeded
  RNG (§36) keeps stakes honest.
- **Stored geometry in saves** → bloats to unmanageable size. Seed+mutation (§32) keeps saves
  tiny and stable.
- **Static world state (no offscreen evolution)** → returning to a region feels like time
  stopped. The offscreen sim (§33) means the world *moved on* while you were gone.
- **Pop-in on approach** → breaks seamlessness. Pre-streaming LOD (§34) keeps it smooth.

## 38. Updated design laws (additions, this iteration)

18. **Seed + mutation.** World is regenerated from seeds; only player mutations are saved.
    Saves stay tiny; worlds stay stable and infinite.
19. **Offscreen = statistical; onscreen = tick.** The view boundary is the simulation boundary.
    Perf is bounded by what's on screen, never by empire size.
20. **Outcomes are stats × state.** Every offscreen event resolves via the universal formula
    (hazard × exposure × vulnerability × mitigation). Honest, cheap, tunable.
21. **The map is live intelligence, not a reference.** Hazards, prices, and NPC activity move
    offscreen; the expert reads the map, the beginner reads the ship.
22. **Time is a resource.** The world advances whether you act or not — urgency creates stakes.

## 39. New open questions (this iteration)

17. **Determinism vs reroll on catastrophic loss (§36):** per-entity seeded RNG (honest, no
    save-scum) vs a "fortune insurance" credit-sink to reroll disaster? Lean both: deterministic
    by default, insurance as a paid forgiveness mechanic.
18. **Offscreen sim cadence:** does the statistical engine run every frame for all offscreen
    assets (could still be cheap if O(1) each) or batch on a coarse timer (e.g. every 10s of
    game-time, advance all offscreen assets by 10s)? Lean coarse-batch — simpler, and the player
    can't perceive 10s granularity offscreen.
19. **Reconciliation granularity:** when you return to a region, do you see a *snapshot* of
    current state, or a *fast-forward replay* of what happened (e.g., a quick timelapse of your
    rover's path)? Lean snapshot for perf; offer "replay log" as an optional Drone Log feature
    (§2/§28d) for players who want the story.
20. **baseHazard visibility:** fully visible on the map (expert-friendly, less surprise) vs
    partially hidden (needs scanning, §20g)? Lean: average visible, *current spike* hidden until
    scanned — rewards info-gathering without hiding the baseline.
21. **NPC simulation realism vs gameplay:** should NPC logistics actually complete routes
    (creating real price movements) or just *influence* the economy model abstractly? Lean:
    influence abstractly for perf, but *render* visible NPC ships near the player that are
    consistent with the abstract model. (Confirms §31 Q16 lean.)

---

*Iterate freely. Mark things [LOCKED] when settled, **PROPOSED** when open. The goal is a
game where hour 1 and hour 50 use the same verbs at different altitudes, and every automated
relief was earned by a pain you remember — set in a world that evolves whether you're watching
or not.*
