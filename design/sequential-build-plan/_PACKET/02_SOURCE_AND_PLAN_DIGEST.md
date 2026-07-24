# 02 — Source & plan digest (high-fidelity)

> This file is a verbose, nuance-preserving digest of: (A) the three upstream design
> packages, (B) the 36-prompt sequential system's structure, (C) cross-cutting themes,
> and (D) every place two sources describe the same thing slightly differently.
>
> It exists so the reviewer can understand the whole plan in one read without re-reading
> 90+ source files. **Nothing was summarized away.** Named systems, specific numbers,
> distinctive author voice, and wonky/underspecified flags are all preserved per file.
>
> For verbatim user quotes, see `01_THE_USERS_OWN_WORDS.md`. For the live-repo collision
> map, see `03_COLLISION_AND_FLAG_MAP.md`.

---

## A. Package 1 — Depth Playbook (`ORIGINALS/spaceface_depth_playbook/`, 13 docs)

### A.0 The north star (00_NORTH_STAR_AND_DESIGN_CONSTRAINTS.md)

**Thesis (verbatim):** SpaceFace should become a *"top-down, physics-forward space
sandbox about turning motion, matter, and infrastructure into control."* The arc is
explicitly **not** "weak gun → stronger gun"; it is
`pilot → operator → engineer → network builder → regional power`, and *"this is both
the progression system and the story."*

**The tie-breaker sentence (Section 14):** *"I move through a galaxy that is already
working, use momentum and machinery to intervene in it, and gradually build a physical
network that changes what the galaxy can do."*

**Design laws worth memorizing:**
- **"Unlock verbs, not percentages"** (§4) — every progression tier must unlock a new
  verb category. Rejected examples: "+12% laser damage, +15% mining speed, +10 cargo."
- **"Shape input; do not script outcomes"** (§11) — the rule underlies orbit assist,
  docking capture, target-slot control, and the rejection of direct velocity writes.
- **Combinatorial target (§5):** a useful mechanic should interact with **≥3 existing
  systems**. Worked example: detachable wreck reactor → scanner → industrial beam →
  massline → physics → cargo/site → ledger → fabrication.
- **The "toy" test (§6):** a core mechanic must be enjoyable in an empty arena with
  no mission reward. The massline is named as the project's best existing toy candidate.
- **"World exists without me" test (§7):** every populated sector must display ≥1
  causal loop (miner→refinery, courier→station, patrol→lane, pirate→traffic,
  scavenger→debris, construction drone→frame, survey→anomaly, satellite relay,
  orbital launcher).
- **Sector identity law (§8):** six requirements — one sentence of identity, one
  dominant silhouette, **2–4 separated activity pockets**, ≥1 visible route, 1 local
  mechanical condition, 1 persistent consequence. *"Deliberate absence is identity."*
- **Three-layer story law (§9):** flight fragments (8–20 words), physical evidence,
  optional illustrated ledger.
- **Vertical-slice definition (§12):** not "the data exists" — must include player-
  visible object at correct scale, aligned collision, normal-route reachability,
  ≥1 meaningful input, persistent state change, save/load, presentation, telemetry,
  current browser capture.

**Explicit NOT-to-do list (§2):**
- 2.1 No general crew-management layer (no salaries/morale/food/shifts/buffs).
- 2.2 No broad ammunition chore (consumables only for torpedoes, impulse charges,
  rare physics ordnance, deployable gravity devices, siege weapons).
- 2.3 No maintenance whack-a-mole — use **events**, not hygiene.
- 2.4 No full-scale cutscene pipeline.
- 2.5 No dialogue-choice maze — additive, discoverable; no click-deletes-half-content.
- 2.6 No fleets before the world earns them.
- 2.7 No realistic N-body simulation.

**Specific numbers:** flight fragments 8–20 words; priority axes scored 0–3; "build
one excellent wreck before twelve wreck definitions"; implied scope **24 sectors**.

### A.1 Engine primitives & interaction grammar (01_ENGINE_PRIMITIVES_AND_INTERACTION_GRAMMAR.md)

**Thesis (verbatim):** *"The most dangerous development pattern in SpaceFace is to ask
for a new thing before the engine has a way for that thing to be physically different."*
Defines **ten reusable foundations (A–J)** in dependency order.

**The ten foundations (the spine of everything):**
- **A — Aligned collision geometry.** Multi-circle invisible static proxies → compound
  2D shapes (circle, capsule, OBB, convex polygon). `collisionProxyManifest` data
  structure. Flags: `type: 'collision_proxy'`, `collides: true`, `renderable: false`,
  `targetable: false`, `radarVisible: false`. **Docking = corridor + capture volume,
  not core-bonking.**
- **B — Targetable components.** Data model: `id, label, role, localPos, radius, state,
  progress, maxProgress, toolTags, reveal, onComplete`. **State vocabulary:**
  hidden/revealed/intact/damaged/disabled/offline/active/severed/detached/repaired/exhausted.
- **C — Contextual industrial beam.** Pure resolver `resolveIndustrialBeamAction(state,
  actor, target, component)` → `extract_geology | cut_joint | dismantle_component |
  repair_component | heat_seal | stabilize_reactor | none`. Work model:
  `workRate = tool.baseRate * rangeFalloff * stabilityMultiplier * targetMaterialMultiplier * powerRatio`.
  **"Do not render the primary industrial beam as HTML/CSS."**
- **D — Dynamic payloads & detachable parts.** Payload schema + lifecycle:
  severed → parent visual hides → payload spawns at anchor → inherits velocity +
  bounded separation impulse → tether/push/tow/throw → receiver zone consumes → persistence.
  **Receiver zones:** salvage tug capture field, station cargo crane, asteroid Massline
  Core socket, mission extraction beacon, orbital construction frame, black-market handoff.
- **E — Force & field kernel.** `combatPhysics.applyImpulse(entityId, impulse, provenance)`,
  `forceFields.register({id, kind: gravity|vortex|current|repulsor, center, radius,
  strength, falloff, durationS, sourceId, filters})`.
- **F — Persistent world-object state.** Record: `schemaVersion, worldObjectId,
  sectorId, state, components{}, payloads{}, discoveries[], updatedTick`.
- **G — Shared interaction recipes.** Recipe schema with `targetRole, input,
  prerequisites, progress{baseSeconds, resetOnBreak, decayPerSecond}, completion{state,
  emit, spawnPayloadRef}, presentation{verb, activeLabel, completeLabel}`.
- **H — NPC job controller.** State machine: `jobId, role, phase, originId,
  destinationId, routeId, cargo, scheduleSeed, phaseStartedAt, threatPolicy`. Phases:
  spawn/commission, depart, transit, approach, work, load, return, unload, loiter,
  flee, resume. **Offscreen virtualization:** store phase + normalized progress,
  advance statistically, materialize along real route, *"never spawn a convoy from
  nowhere within the player's immediate view."*
- **I — Gravity & orbital motion.** One static dominant body; analytic orbiters
  `angle(t) = angle0 + ωt`; trajectory preview **90–180 points at 8–12 Hz**.
- **J — Presentation & debugging.** Every foundation gets a toggleable debug overlay.
  Gameplay-camera review rules (never accept from Blender viewport, turntable, concept
  image, ortho preview).

**Specific numbers (illustrative, NOT balanced):** proxy example radii 42/42/70/46/46;
compound example `boundsRadius: 420`, OBB halfExtents `{x:62,z:95}`; dock example
`maxSpeed: 42`, `headingToleranceDeg: 65`; payload `radius: 24, mass: 1800`; gravity
`radius: 420, atmosphereRadius: 510, influenceRadius: 2100, mu: 12_000_000`; recipe
`baseSeconds: 4, decayPerSecond: 0.1`; job cadence **5–10 Hz**.

**Distinctive voice:** *"Ask for a wreck without component geometry and the agent
makes a glowing ball labeled 'wreck.'"* … *"A chain of circles can approximate long
slabs while leaving real gaps. It is not elegant, but it immediately enables a top-down
wreck field and honest docking corridors."* … *"Without a common kernel, every agent
will write another direct `vel.x += ...` special case."*

**Wonky flags:** the example numbers are illustrative not tuned; "radius-9 wreck" is
referenced without unit clarification; offscreen statistical model unspecified.

### A.2 Massline flight & physics combat (02_MASSLINE_FLIGHT_AND_PHYSICS_COMBAT.md)

**Thesis:** the differentiator is **not** "conventional dogfighting with more DPS" but
"a combat and traversal system where the player manipulates constraints, momentum,
terrain, and force fields in a top-down plane." Critical warning: existing massline
concepts *"may not be legible or reliably reachable in normal play"* — treat existing
features as *"candidates awaiting player acceptance."*

**Ten momentum verbs:** attach, orbit, reel, release, throw, collide, deflect, brake,
hitch, redirect.

**Control contracts (critical, preserve nuance):**
- **Inputs:** movement keys; cursor/trackpad; LMB primary weapon; RMB industrial
  beam/secondary/armed payload throw; **F** massline attach/cut/reel; C scan; R
  detonate charges; G combat-assist mode; optional hold for bullet time.
- **Orbit Assist activation (the user's idea, formalized):** massline attached; target
  mass ≥ `anchorMassRatioMin × playerMass`; line taut; forward input held; **exactly
  one** lateral/yaw direction held; brake not held; no armed payload throw; no UI/modal.
- **Yaw controller:** PD-like through `turnIntent` with
  `ω* = clamp(v_t / max(R, Rmin), -ωmax, +ωmax)`. **"Do not write `rot` or `angVel`
  directly."**
- **Radial correction cap:** *"perhaps 15–25% of available acceleration."*
- **Tension policy:** slack / working / overstrain.
- **Reel Pump / line-energy:** `angular momentum L ≈ m r² ω`; reel in → faster arc;
  reel out → wider slower arc; release → earned exit velocity.

**Ten physics weapon families (Part VII):**
1. **Concussion cannon** — low-damage slug, directional impulse, mass-scaled, tumble trigger.
2. **Vector mine / impulse charge** — deploy behind, manual R detonation, radial impulse,
   affects player, hull-damage policy explicit, limited batch/cooldown.
3. **Recoil lance** — high projectile impulse + equal/opposite shooter impulse;
   backward = boost, forward = brake, broadside = lateral dodge.
4. **Gravity puck** — short-lived local gravity well, **3–5 second** pull field, capped
   acceleration, destructible/limited.
5. **Repulsor burst** — short radial impulse from player, long cooldown, minimal damage.
6. **RCS disruptor** — EMP/subsystem hit, reduces yaw/strafe authority, short duration,
   visible sparking/attitude drift. **Reuse existing EMP concept and tumble systems.**
7. **Anchor charge** — makes a ship "heavy"/resistant to correction.
8. **Tractor pulse** — cone query, impulse toward focal point, strict mass/range limits,
   *"no arbitrary telekinetic dragging."*
9. **Ricochet slug** — bank shots, reflects from collision normal, limited bounces,
   requires aligned collision geometry.
10. **Tether cutter / line jammer** — attacks constraints not hull. *"Only add after
    massline play is reliable and readable."*

**Rejected source proposal (Part V):** the source package proposed a target-relative
station-keeping controller. Explicit user direction on 2026-07-24 rejects that mechanic and forbids
its implementation. Preserve G auto-target/draw-to-fly and independent weapon lead instead.

**Gesture path flight for traversal (Part VI — alternative G-mode):** screen-space
points → unproject → arc-length resample → Ramer-Douglas-Peucker simplify → optional
Catmull-Rom → curvature computation. **Pure-pursuit follower** with
`L = clamp(Lmin + speed × lookaheadTime, Lmin, Lmax)` and curvature-aware speed
`vCurve = sqrt(aLateralMax / max(|curvature|, epsilon))`.

**Combat arena grammar (Part VIII):** 8 elements (fixed anchor, movable heavy payload,
brittle collision surface, hazardous field, gravity body, narrow channel, cargo
objective, escape route). *"Use two or three, not all seven."* 5 example arenas:
Anchor Yard, Carrier Grave, Burn Periapsis, Debris Current, Customs Ring.

**Massline Proving Ground (Part IX):** a small **optional training/industrial site**,
NOT a debug lab hidden behind query params.

**Massline head families (§47):** Anchor Head, Tow Head, Combat Harpoon, Shear Head,
Phase Head (alien), **Dual-Spool Rig (late/high-risk, "only after single-line play is
excellent").**

**Defer list (Part XI):** dual independent tethers, arbitrary soft-body cables, full
rope wrapping, per-segment cable collision, realistic orbital multi-body physics,
grappling fleets, procedural acrobatics, competitive timing before controls stabilize,
new control mode without debug overlay, new physics weapon via direct velocity writes.

**Acceptance test (concrete):** **three tether lengths, ten-second intended orbit
without uncontrolled full spins.** Proving ground challenges: 5-second orbit, time
trial chaining three anchors.

**Distinctive voice:** *"A design document and a green check are not proof."* … *"Do
not hide failures behind 'the feature flag is on.'"* … *"Physics combat is dull in
empty space."* … *"A missed window should cost another revolution, not destroy the
setup."*

**Wonky flags:** controller constants (KpHeading, KdYaw, Kr, KdRadial, ωmax, aRadialMax,
Rmin, anchorMassRatioMin) have **no suggested values** — major implementation risk.
Bullet time is listed as both candidate mechanic and optional hold key, interaction
unspecified. Dual-Spool Rig flagged high-risk with no design.

### A.3 Living world, sectors, planets, NPC jobs (03_LIVING_WORLD_SECTORS_PLANETS_AND_NPC_JOBS.md)

**Thesis:** sectors must stop being *"loading-screen rooms bolted together into open
space"* and become *"a small causal geography."* Target: the player can say *"The
refinery is beyond the belt, the customs ring is on the Helios route, and the graveyard
is off-lane in the shadow"* — geography, not "everything is near the center."

**Activity pockets (Part I):** civic/station, production, transit/checkpoint,
danger/contested, mystery/landmark. *"Do not require every sector to use every category."*

**Specific numbers:** pocket radius **350–900 wu**; pocket separation **1,200–3,000
wu**; route example `width: 220, beaconSpacing: 360`; three-scale distances
**Far 1,000–2,000 wu / Mid 300–800 wu / Near 50–250 wu**.

**Ten sector archetypes (Part II):** Industrial belt, Trade junction, Ship graveyard,
Border checkpoint, Anomaly field, Pirate-held ruin, Construction frontier, Quiet
sanctuary, Active war zone, Player expansion region. Each has Identity / Visible loop /
Player actions / Mechanical condition / Hero silhouette.

**Nine NPC jobs (Part III):** Miner, Hauler/caravan, Patrol, Scavenger, Survey vessel,
Construction traffic, Rescue tug, Smuggler, Pirate predator.

**Pirate predator (§23):** loiter → observe manifests → select vulnerable traffic →
intercept → demand or attack → steal cargo → retreat to ruin. *"Pirates should not
simply exist as red ships."*

**Crime loop (§16):** shadow convoy → disable engines/RCS → detach/jettison pods →
tether pods → flee patrol → fence cargo. *"This is the beginning of 'GTA in space.'"*

**Escort AI rule (§16):** escorts have one job — stay in formation, respond when
attacked, cover retreat, disengage after cargo safe/lost. *"Do not ask them to solve
arbitrary tactical warfare."*

**Planetary operations (Part V):** *"Do not build planetary landing first."* Planet is
a visual anchor, gravity field, atmosphere boundary, host for orbital routes, source/sink
for cargo, place whose installations can change. *"Do not begin with three freely
orbiting planets"* — start with one planet + one moon + one acceleration ring + station.

**Hazards that are NOT damage circles (Part VII):** moving ion storm, gravitational
eddy, debris current, radiation corridor, resonant crystal formation, dormant alien
ring, displacement anomaly. *"No random confiscation of player cargo."*

**Six modular visual kits:** Concord civic, DMC industrial, Reach/pirate, Quiet covert,
Vael/alien, Ancient/derelict.

**Twelve pasteable sector seeds (Part IX):** Broken Moon Refinery, Carrier Grave,
Customs Gauntlet, Storm Vault, Cinder Crown, The Rookery, Silent Exchange, Pilgrim
Array, Iron Maw Siege, Lantern Construction Front, Pale Coil Route, Blackglass Lease.

**Distinctive voice:** *"Everything is near the center" is the failure sentence.* …
*"A scavenger makes wrecks feel valuable without a tooltip."* … *"This is the beginning
of 'GTA in space.'"*

**Wonky flags:** relationship between 12 seeds and "24 sectors" unclear; Ceres Belt
(used in file 08 Wave 6 as the first-recomposition candidate) is NOT one of the 12
seeds; "Abandoned Driller landmark" (also file 08 Wave 6) appears nowhere else.

### A.4 Wreck Cathedral vertical slice (04_WRECK_CATHEDRAL_VERTICAL_SLICE.md)

**Thesis:** build **one** monumental, physical, persistent wreck site proving SpaceFace
can convert existing semantic systems into an actual top-down player experience.
Explicitly does **not** require walkable 3D interior, FPS exploration, deformable meshes,
cinematic animation, full triangle collision, dialogue choices, bespoke full-screen UI,
or new combat AI. *"It does require more than a labeled sphere."*

**Specific numbers:** overall length **320–600 wu**; width **180–360 wu**; main
channels **≥55–90 wu wide**; hero sections **80–220 wu**; visible from **≥1,200 wu**;
*"A radius-nine wreck entity cannot be the hero object."*; proxy counts port hull 4–7 /
starboard 4–7 / engine 2–4 / command 2–3 / cargo spine 3–5; components **5–7**;
fragments ~8–20 words; ledger body 80–180 words; ledger image 45–60% of page.

**Component roster (5–7):** Power Relay A (offline, scan-revealed, repairable);
Power Relay B (physically separated, may be cut off); Port Cargo Brace (cuttable,
completion removes brace mesh, detaches cargo module); Starboard Cargo Brace (optional
second — *"Do not make the player repeat five identical cuts"*); Cargo/Weapon Module
(dynamic payload after severing, tetherable); Reactor Assembly (**Version A** =
physical payload, dangerous if thrown, OR **Version B** = stabilizable site component —
*"Do not implement both in first slice"*); Black Box (revealed after power/scan,
unlocks ledger page and provenance).

**Interaction sequence:** Discovery → Approach scan (wreck name/class, two relay
signatures, one structural instability, one hidden data source) → Restore emergency
power → Cut braces → Extract payload (F attaches, COM-to-COM tow, optional throw) →
Recover black box → Persistent aftermath (`partially_recovered` or `recovered`).

**Industrial-beam modes:** repair on relay, cut on brace, extract on geology — same
RMB, distinct label/VFX/audio/progress/result, **no mining yield on brace/relay**.

**Story delivery:** flight fragments (~8–20 words, *"Use only a few. Silence gives the
object weight."*); ledger page (title, image, 80–180 words, map/provenance, related IDs,
no response buttons); no branch deletion.

**Anti-placeholder failures (§16, exhaustive):** sphere hero, asteroid-wreck, central
radius collision, visual-only channels, parent-center targeting, ore on cut, toast-only
power, instant cargo conversion, flag-only black box, unchanged completion, debug-only
reach, isolated renders, no save/load evidence.

**File/owner plan (§14):** plausible separation across `src/data/worldSites/`,
world-record/site owner, shared component/work system, mining/tool owner, world/entity
helper, current tether/throw systems, visual manifest + GLB, target panel/reticle,
ledger/artifact data, focused tests. **"Do not put the entire feature into `world.js`,
`visualFactory.js`, or one giant UI file."**

**Agent task decomposition (§15):** Task A (graybox/collision), Task B (component
grammar), Task C (payload extraction), Task D (final visual/story). *"Integrate in
that order."*

### A.5 Automation, progression, endgame (05_AUTOMATION_PROGRESSION_AND_ENDGAME.md)

**Thesis (verbatim):** *"Industry manufactures new physical capabilities and changes
the world outside the industry screen."* Praises existing Asteroid Ops direction
(contact-ring law, extraction-vs-preservation, aggregate networks, persistent Massline
Core, courier pods, station assembly) as *"unusually strong."*

**Seven-stage progression ladder:**
- Stage 0 **Scrapper** → Stage 1 **Prospector** (new verb: *read* matter before
  consuming) → Stage 2 **Foreman** (new verbs: *anchor, place, automate*; unlocks
  Massline Core, extractor, gas tap, cargo port, first courier pod, remote construction
  queue) → Stage 3 **Engineer** (*transform, fabricate, configure*) → Stage 4
  **Network Builder** (*connect, route, protect*) → Stage 5 **Constructor**
  (*assemble, settle, reshape*) → Stage 6 **Regional Power** (*govern*, *"expressed
  through infrastructure rather than a taxation menu"*).

**Four resource families (branching, not one trunk):**
- silicate matrix → regocrete (structures) / purified silica (electronics) / optical
  glass (scan arrays)
- iron/metallic ore → refined metal / high-density alloy (massline heads, armor, rails)
- volatiles → coolant / propellant / explosive precursor
- crystals/exotics → field resonator / precision optics / research artifact

**Production constraints that create strategy (§4):** geological contact, intact
formations, power, heat, lane throughput, physical export port, route danger, site
signature, construction space, specialized resources, receiver capacity, command range.
**Rejected:** arbitrary wages, constant condition decay, repeated refueling, per-minute
tax, invisible worker happiness, manual collection after automation is complete.

**Exteriorization law (§5):** every important interior upgrade has an exterior
manifestation. 12-row table maps interior changes → exterior results (Massline Core →
visible anchor/socket; Extractor → work lights/drill heads; Cargo Port → storage/pod
launches; Fabricator → drones/modules emerge; Sensor Mast → scan pulses; Shuttle Dock →
reusable traffic; Turret Pylon → physical defense; Transfer Beam → visible beam;
Launch Driver → cargo projectile arcs; Assembly Frame → station grows; Quiet-running
policy → lower lights/signature; Overheated site → plume/alarms).

**Infrastructure projects (§7):** navigation relay, **acceleration ring** (*"a new
movement verb, not a percentage hidden in map UI"*), sensor network, defense platform,
orbital receiver, salvage core, **station frame (six stages: command spine, power,
cargo, industry, habitation/services, defense/shipworks)**, gravity/wormhole anchor.

**Five endgame fantasies (§8):** industrial lattice, mobility network, information
network, security network, outlaw network.

**Failure modes to forbid (§12):** passive-credit trap; idle-game escalation; every
machine is "produce X"; exterior is cosmetic; chore expansion.

**Distinctive voice:** *"If the answer is 'earn credits to buy a gun that kills the same
enemy faster,' the industrial system will eventually feel like an elaborate spreadsheet
feeding a shallow combat loop."* … *"govern, expressed through infrastructure rather
than a taxation menu."*

**Wonky flags:** the 7-stage ladder (Stages 0–6) vs file 00's 5-stage arc don't map 1:1.
Treat the 7-stage as the more granular authoritative version.

### A.6 Story ledger & image pipeline (06_STORY_LEDGER_AND_IMAGE_PIPELINE.md)

**Thesis:** tell a large story without long conversations, animated cutscenes, synthetic
voice, dialogue choices, branch deletion, or mandatory prose reading. The story should
feel like *"evidence accumulating around the player's actions."*

**Three-layer delivery:**
- **Flight fragments** — 8–20 words, 2–5 seconds, auto-stored in ledger.
- **Physical evidence** — strongest channel: wreck layout, missing cargo, powered/
  disabled component, route record, ship manifest, station construction, black box,
  faction markings, scarred planet, convoy behavior, abandoned machinery.
- **Illustrated ledger page** — optional, persistent, readable later. No choices, no
  "Continue" button chain.

**Anti-cartoon image discipline (§6, critical — addresses user's L589 complaint):**
preferred character prompt language: *"cinematic live-action casting portrait;
photorealistic production still; physically plausible human anatomy and skin; 85mm lens;
restrained documentary lighting; practical wardrobe with worn industrial materials;
neutral or guarded expression; natural asymmetry; subtle film grain; grounded
contemporary science-fiction production design; no visible text."* Explicit excludes:
*"no illustration, no painted concept art, no comic-book rendering, no cel shading, no
thick outlines, no retro pulp cover, no 1950s magazine art, no exaggerated heroic pose,
no plastic skin, no anime."*

**Generation workflow (§6.4):** *"Do not ship the first generated image"* — contact
sheet → reject violations → select direction → follow-up views → consistent crop/
color-grade → store prompt/source/license/asset ID → review in actual ledger UI.

**Image style bible (§7):** 3 approved character portraits, 3 approved ship/world
stills, 2 technical scans, palette, grain/contrast target, lens/framing rules,
wardrobe/material rules, forbidden styles. *"Consistency matters more than each image
being individually extravagant."*

**First story package (§12):** 5-page thread around the Wreck Cathedral —
(1) The Missing Convoy (route map), (2) Capital Hull Located (cinematic exterior still),
(3) The Clock Stopped First (technical bridge scan), (4) Released From Inside
(cargo-clamp evidence), (5) What Was Carried (recovered photograph or device image).

### A.7–A.12 Brief notes on remaining files

- **07_AGENT_EXECUTION_CONTRACT.md** — the anti-slop contract (companion to 11).
  Referenced everywhere; *"How to use a brief"* instructs pasting with this file.
  (Reviewer should request this if not already in the digest.)
- **08_PRIORITIZED_ROADMAP_FOR_THREE_AGENTS.md** — the **three-agent operating model**
  (Agent A: physics/controls/collision/interaction; Agent B: world sim/jobs/persistence/
  progression; Agent C: presentation/assets/spatial composition/player-route proof).
  Lease table: one agent at a time per authority file. *"Parallelism without ownership
  is just faster corruption."* Ten waves (0–9) — see digest §C for the wave order,
  which maps almost 1:1 to the SF sequence's phases.
- **09_PASTEABLE_FEATURE_BRIEFS.md** — the idea bank (~73 KB). The single largest file.
- **10_CURRENT_REPO_AUDIT_AND_GAP_MAP.md** — design-facing audit. Central diagnosis:
  **"semantic surplus, embodied deficit."** Keep/repair/defer/reject table (15 rows).
- **11_PROMPTING_GLOSSARY_AND_TECHNIQUE_LEXICON.md** — turns "use advanced techniques"
  into named, inspectable expectations. Core pattern: *"Name the observable behavior,
  name the relevant technique family, name the forbidden shortcut, and name the
  evidence."* 13-item prompt checklist including **at least 5 forbidden shortcuts.**
- **12_MASTER_AGENT_HANDOFF_TEMPLATE.md** — audit/planning/anti-placeholder/evidence
  template.

### A.8 Three-agent operating model & wave order (from 08) — maps to SF phases

**The wave order (file 08) is almost identical to the SF-00…SF-35 phase order:**

| Wave (file 08) | SF phase equivalent | Content |
|---|---|---|
| 0 Establish current truth | SF-00 | Audit + flight/massline proving ground |
| 1 Collision & docking truth | SF-08 | Compound 2D proxies; corridor+berth docking |
| 2 Targetable components & interaction grammar | SF-17 | Component data model; contextual tool contract |
| 3 Wreck Cathedral vertical slice | SF-20 | Uses 04 as feature authority |
| 4 Flight control & physics-combat toy | SF-05, SF-06, SF-07, SF-09, SF-10 | Orbit Assist, release/throw, 3 physics weapons |
| 5 Replace wandering NPCs with visible jobs | SF-15 | Miner/hauler/patrol loops |
| 6 Recompose one complete sector | SF-21 | 3–4 distinct pockets |
| 7 Orbital-operations & gravity prototype | SF-14 | One colossal planetary body |
| 8 Exteriorize Asteroid Ops progression | SF-23, SF-24, SF-25, SF-26 | Massline Core → Cargo Port → courier → station frame |
| 9 Replicate through authored kits | SF-31 | Station/wreck/orbital/industrial modules |

The SF sequence is essentially **the file-08 wave order, expanded and interleaved with
the gravity package's massline/field/atmosphere work and the atlas package's travel
work.** This is strong evidence the SF sequence is a coherent distillation, not a
random reordering.

---

## B. Package 2 — Gravity & Massline Expansion (`ORIGINALS/spaceface_gravity_massline_package/`, 9 docs)

### B.1 Design bible: assisted relational physics (01)

**Thesis (verbatim):** *"SpaceFace is the space game where assisted relational physics
is the combat, traversal, crime, and construction language."* "Assisted" because a
trackpad + 4 keys cannot do raw Newtonian aiming. "Relational" because the interesting
unit is what the player moves **relative to**, not absolute velocity.

**Eight governing laws:**
1. Player supplies intent; computer supplies precision (computer *"must not silently
   choose the route, target, weapon combination, or release moment"*).
2. Artistic physics must be **coherent**, not realistic. Acceptable liberties: planet
   as massline anchor, mass seed temporary field, player immunity to impact hull damage
   while enemies suffer momentum damage, physics-earned velocity exceeding powered-
   flight limits, bounded orbit assist, atmosphere as annular bands, black hole with
   authored corridors. **Unacceptable:** trajectory preview using different physics
   from the ship; invisible teleports presented as momentum; tether selecting an
   unexpected target; a weapon claiming to push but playing only a ring animation;
   visual/collision shape mismatch.
3. Complexity from combinations, not button count. *"Do not create one key each for
   'planet sling,' 'enemy throw,' 'tow,' 'mass seed orbit,' 'cargo catch,' and 'meteor
   hitchhike.' That is not depth. That is a keyboard tax."*
4. Momentum and position must matter at least as much as damage.
5. Environments are combat equipment. *"The environment should not be dense gravel."*
6. New industrial tier must unlock a new verb or scale of control.
7. Player robust; enemies expressive.
8. Always show the currently inferred action.

**Ten shared engine primitives (the package's spine):**
5.1 Intent-aware candidate scoring; 5.2 Anchor-relative reference frames; 5.3 Bounded
orbit & line-control assist; 5.4 Shared trajectory predictor; 5.5 **Momentum provenance**
(velocity tags: Thruster/Boost/Massline/Gravity/Explosion/Frame-coupling/Collision-earned);
5.6 Continuous field source; 5.7 Physics-effect status model (`lightened, ballasted,
tumbling, frameLocked, gravityMarked, stabilized, reentry`); 5.8 Multi-body attachment
graph; 5.9 Authored sling-route definition; 5.10 Modern world-space VFX primitives.

### B.2 Control, targeting, orbit, slingshot (02)

**Candidate scoring model (formalized from user's 3 signals):**
`score = Wcursor*cursorScore + Wturn*turnAlignment + Wapproach*approachScore +
Wdistance*distanceScore + Wmass*massContextScore + Wroute*routeScore +
Wcombat*combatFocusScore + Wmemory*candidateMemory + Wtype*modeCompatibility`.
Three profiles: **Anchor** (high: turn alignment, surface proximity, route status,
relative mass, approach geometry), **Combat** (high: cursor, flyby focus, selected
target, time to closest approach), **Tow** (high: precise cursor, existing interaction
objective, distance).

**Tap/hold massline input redesign (CRITICAL CONTROL SCHEME):**
- **Unattached:** Press = latch previewed candidate if confidence sufficient; Hold =
  latch + temporary line-control mode; no valid candidate = brief dry-fire/acquisition
  sweep, *"do not attach to a random object behind the player."*
- **Attached:** Quick tap = cut; Hold beyond short threshold = enter line-control mode,
  releasing button does NOT cut; threshold must be forgiving and visually signaled.
- **Line-control mode (modifier held):** Up/forward = reel in; Down/reverse = pay out;
  Left/Right = choose/reinforce orbit direction; Shift = boost/orbit pump; Cursor =
  select throw/release destination.
- Recommends **Spacebar** as massline key (thumb-accessible), F preserved as alias.
- **Explicit rejection of D+F chord requirement.**
- **Input-history window: 150–250 ms** (side input before/after latch counts as orbit
  direction). *"The player should not need perfect simultaneity."*

**Flyby Focus 2.0:** trigger on high relative speed + close approach + hostile/
interactable candidate. Time scale eases toward **~0.4–0.6** for bounded interval;
camera frames player+candidate. *"Time dilation must ease in and out; it should not
abruptly freeze the game."* NOTE: user said (L1652) flyby focus *"doesn't work right
now"* — must be fixed before being a dependency.

**Anchor-relative orbit assist (the controller math):**
Reference frame: `r = p - a; rHat = normalize(r); tHatCW = perpendicularCW(rHat);
tHatCCW = -tHatCW; vRel = vPlayer - vAnchor; vRadial = dot(vRel, rHat);
vTangential = dot(vRel, tHatChosen); lengthError = currentDistance - desiredLength`.
Bounded correction: `radialCorrection = -Kr * lengthError - Kd * vRadial`. **"The
correction must be capped. It is an assist, not an invisible rigid rail."** Strength
settings: Full / Standard (default) / Light / Off.

**Sling-release presentation (the user's red→green idea, formalized):** Release arc
colors — Red (miss/danger), Amber (viable inefficient), Green (intersects destination
gate), White-hot/cyan tick (current exact solution moment). Screen-edge vignette as
secondary cue. Two modes: **Arm** (hold; system cuts on next valid solution frame) and
**Snap** (tap within forgiveness window; system delays/slightly corrects to solution).

**Route compiler/validator (§13):** loads anchor positions/radii/assist limits/ship
stats/route order; samples entry positions/velocities/orbit directions/tether lengths/
release phases; simulates each connection; reports reachable release windows. Sample
output: `entry speed band: 150–260; valid release arc: 21.4 degrees; standard-assist
timing window: 310 ms`.

**Wonky flags:** controller constants (Kr, Kd) have **NO numeric values** — entirely
deferred to playtesting. Major implementation risk. Predictor cadence (10–20 Hz per
file 06) vs Arm-mode "next valid solution frame" (reads as 60 Hz) — tension between
docs 02 and 06.

### B.3 Gravity weapons & massline variants (03)

**Enemy durability tiers:** Light (low hull, high movement, strong impulse/field
response, easy to tumble/net/fling, dangerous in groups, die/disengage quickly after
setup); Medium (need one setup status or environmental combo); Heavy (high mass/low
displacement, external components/weak points, can serve as temporary anchors);
Bosses/capital (*"Cannot be casually yeeted"*, components can be shifted/disabled/
tethered/stripped, arena geometry matters).

**Mass Seed family (signature multi-use physics tool):**
- **4.1 Anchor mode** — launch toward cursor or deploy at ship; locks to local frame
  after short arming; very-high-effective-mass tether anchor; does NOT attract
  surrounding bodies; bounded duration; **only one or two per player**.
- **4.2 Well mode** — bounded continuous attractive force within radius; strongest vs
  light bodies/projectiles/pickups/gravity-marked targets; weak vs heavy ships/stations.
  *"Do not make it a stun sphere."*
- **4.3 Repulsor Seed** — outward force for several seconds; can be fired into crowd
  or dropped behind.
- **4.4 Directional gravity cone** — short-duration forward cone. *"Player fantasy:
  Turn the ship into a gravitic snowplow."* Visual must be *"refractive, vector-flow
  volume — not a flat colored triangle."*

**Inertial manipulation:**
- **5.1 Inertial Shunt (Lighten)** — higher impulse response, higher angular disturbance.
- **5.1 Inertial Shunt (Ballast)** — lower impulse response, stronger anchoring.
- **Implementation caution:** *"Do not blindly change rigid-body mass everywhere.
  Separate control quantities are safer: `impulseResponseMult`, `tetherResponseMult`,
  `fieldResponseMult`, `angularResponseMult`, `propulsionResponseMult`."*
- **5.2 Gravity Mark** — low-damage marking weapon increasing artificial-field coupling.
  *"The effect must not be a tiny status icon only."*
- **5.3 Momentum Sink** — damps velocity relative to chosen reference frame. *"Do not
  set velocity directly to zero. Use a capped force or exponential convergence."*

**Eight combination grammar recipes:** Lighten → Concussion → Terrain; Gravity Mark →
Mass Seed → Torpedo; Orbital Spool → Monofilament sweep; Twin Bridle → Repulsor;
Drag Net → Planet; Mass Seed Anchor → Bomb propulsion; Meteor Frame Coupler → Heist.

**Alternative massline heads (outfitting choices, same core action):**
- **7.1 Orbital Spool** — refined general-purpose. *"Should be the baseline around which
  other heads specialize."*
- **7.2 Tractor Spool** — force-based line maintaining distance. Law:
  `F = -Kp * (distance - desiredDistance) - Kd * radialVelocity`.
- **7.3 Elastic Whip Spool** — spring-damper storing energy. Law:
  `F = -K * extension - C * extensionRate`. Snap release, bungee turns, catapulting.
- **7.4 Frame Coupler** — velocity-matching connection. Gradually converges player
  velocity toward target velocity, doesn't pull centers together. Hitchhiking on
  meteors/express freighters.
- **7.5 Monofilament Line** — high-tension combat line whose swept segment damages
  targets. Damage only when tension > threshold AND sweep speed > threshold AND target
  cooldown elapsed AND target is not player. *"The player attacks by placing a moving
  segment through space."*
- **7.6 Twin Bridle** — body-to-body relationship (per user's L1694 reframe). First
  activation attaches endpoint A, candidate preview changes to endpoint B mode, second
  activation attaches B. **Max one active bridle initially, no cycles, color-coded
  endpoints, large bodies valid as one endpoint but not both.**
- **7.7 Massline Drag Net** — wide deployable capture surface trailing behind large
  ship. *"Do not simulate a deformable cloth net."*
- **7.8 Wrap Line / transverse snare** — projectile deploys horizontal/curved line
  wrapping/catching bodies crossing it.

**Eleven forbidden shortcuts (§12):** implementing gravity as DoT circle; Inertial
Shunt as generic slow debuff; all weapons sharing identical impulse; teleporting
enemies into fields; calling a net a radial stun; making Mass Seed a one-use black-hole
ultimate with no traversal utility; adding ten massline heads before input model is
solved; balancing every tool around boss fights making ordinary enemies spongy;
claiming environmental combat is complete when terrain is absent from ordinary route.

### B.4 Planetary activities, heists, sector identity (04)

**Six sector archetypes (gravity-flavored, distinct from depth-playbook's 10):**
17.1 Gas-giant harvesting region; 17.2 Ring salvage region; 17.3 Binary-moon sling
region; 17.4 Industrial launch region; 17.5 Black-hole research region; 17.6 Player
expansion region. Each has a *"one sentence no other sector can claim."*

**Atmospheric skimming density bands:**
```
outer skim: low yield, very safe
working band: good yield, moderate heat
storm band: high yield, strong drag / hazard
reentry band: enemy destruction risk, player emergency recovery
```

**Enemy reentry state machine:** Skim (light plasma glow) → Commit (stronger trail,
hull heat, failed RCS) → Breakup (parts shed, weapons stop, distress fragment) →
Descent (glowing fragments) → Aftermath (orbital debris, surface impact marker).

**Surface-launch mass drivers (§7):** *"This is an ideal GTA-in-space activity because
it produces a physical object, a predictable opportunity, witnesses, pursuit, and
economic consequence."*

**Black-hole sector (§14):** late handcrafted region. *"Do not attempt general
relativity. Use authored zones, bounded forces, trajectory previews, and stable path
solutions."* **"The player must not lose a long save because a first visit crossed an
invisible point of no return."**

### B.5 VFX technical direction (05) — addresses user's "nintendo 64ish" complaint

**Five governing VFX laws:** (2.1) Semantic before decorative; (2.2) **Layered event
structure** — Anticipation / Primary event / Secondary response / Decay-aftermath
(*"A single expanding mesh is rarely sufficient"*); (2.3) World-space truth; (2.4)
Scale-aware detail (Near/combat vs Far/sling); (2.5) Bounded post-processing
(*"They should never erase target readability or make every mechanic share the same
neon fog"*).

**Recommended Three.js VFX toolbox (10 named techniques — the user explicitly doesn't
know these names, per L1680–1681, so build steps must name them):**
- **3.1 Instanced particles** — `THREE.InstancedMesh` or `InstancedBufferGeometry`;
  per-instance position/velocity/age/lifetime/size/rotation/color/seed; bounded pool.
- **3.2 Shader-driven ribbons & trails** — camera-facing strip mesh, `THREE.Line2`, or
  custom ribbon (not thin GL line); width by tension/velocity, gradient along length,
  noise displacement, UV-scrolling energy, SDF edge softness, taper, breakup.
- **3.3 SDF shapes** — analytic SDF in fragment shaders for rings, arcs, cones,
  brackets, soft field boundaries.
- **3.4 Screen-space distortion** — distortion buffer with offset vectors; sample scene
  color at offset UVs. *"Do not distort the entire screen strongly."*
- **3.5 Depth-aware soft particles** — compare particle depth to scene depth, fade near
  intersections.
- **3.6 Mesh shockwaves** — thin ring/disc mesh with expanding radius, contracting
  width, emissive edge. *"A shockwave should be one layer among several."*
- **3.7 Flow-field particles** — advect along vector field; attraction = inward spirals,
  repulsion = radial outward streaks.
- **3.8 GPU-friendly noise** — small tiling textures or procedural hash/noise.
- **3.9 Dynamic emissive lighting** — small pool of temporary point lights. *"Cap
  active lights and use priority. Do not create one dynamic light per particle."*
- **3.10 Camera response** — trauma impulse on impact, directional kick, smooth zoom-out
  with physics-earned speed, orthographic scale punch on slingshot release.

**Massline visual redesign (the anti-"HTML bloom" spec):** explicit anti-pattern —
*"Do not represent the line as two nested translucent cylinders that pulse by scaling.
That reads as an HTML bloom mockup rather than a physical tether."* Layered design:
Structural core (narrow opaque luminous filament) + Energy sheath (wider soft ribbon,
UV flow toward load direction, color/width tied to tension) + Load packets (sparse
moving pulses) + Endpoint interaction (surface-aligned flare) + High-speed wake.

**Ten VFX acceptance gates (§16):** ordinary browser-route capture; near AND far
camera; bright AND dark environment; reduced-motion; colorblind/high-contrast; stable
frame time; no per-frame object/material creation in profiler hot path; semantic
synchronization with force/state; distinct anticipation/event/decay phases; side-by-
side rejection of previous primitive effect.

### B.6 Implementation roadmap, testing, agent lanes (06) — the parallelization doc

**Repository seams to audit first (concrete file list):** `src/systems/input.js`,
`src/systems/autoTargetAssist.js`, `src/combat/autoTargetMode.js`,
`src/systems/tetherGameplay.js`, `src/core/constraints/masslineController.js`,
`src/systems/masslineTelemetry.js`, `src/systems/masslineThrow.js`,
`src/systems/masslineImpacts.js`, `src/systems/flightV3.js`, `src/core/physics.js`,
`src/core/sg02DynamicBodyOwner.js`, `src/systems/impulseCharges.js`,
`src/systems/weapons.js`, `src/render/vfx.js`, `src/render/energy/energyMaterials.js`,
`src/ui/masslineHud.js`, `src/ui/hud.js`, `src/core/registry.js`,
`src/data/featureFlags.js`.

**11 phases (0–10):** Phase 0 Physics control laboratory → Phase 1 Intent-aware
targeting → Phase 2 Input/line control → Phase 3 Orbit assist → Phase 4 Release
prediction & sling course → Phase 5 Universal weapon impulse → Phase 6 Mass Seed &
Repulsor (**Anchor mode before Well mode**) → Phase 7 Atmosphere & reentry → Phase 8
Living planetary operations → Phase 9 Massline variants (priority order: Tractor →
Elastic Whip → Frame Coupler → Monofilament → Twin Bridle → Drag Net) → Phase 10
Sector identity & built gravity.

**Critical invariant (Phase 3):** *"The assist may correct error but must not create
unbounded free energy. Any sanctioned launch bonus must be explicit, bounded, and
separately tagged."*

**Three-agent lane division (§14):**
- **Agent A: Controls & physics authority** — input semantics, target-scoring kernel,
  orbit controller, predictor, field force requests, physics provenance, pure tests.
- **Agent B: Gameplay systems & world state** — Mass Seed lifecycle, weapon data/
  effects, atmosphere states, reentry state, NPC job controllers, mass-driver
  schedules, mission/economy/faction adapters, save normalization.
- **Agent C: World composition & presentation** — planet/anchor assets, sling-course
  layout, candidate/release HUD, VFX library, camera, sector composition, browser
  captures. **"Must not author gameplay outcomes in render code."**

**Shared-file lease rule (5 steps):** announce exact file + seam; check current diff;
smallest ownership-safe edit; commit coherent slice; release lease. *"Do not let three
agents simultaneously rewrite `input.js` because all three features use a key."*

**12 feature flags:** `physicsIntentTargeting`, `masslineInputV2`, `masslineOrbitAssist`,
`masslinePayOut`, `masslineSlingRoutes`, `weaponImpulse`, `massSeedAnchor`,
`massSeedWell`, `repulsorSeed`, `atmosphereGameplay`, `reentryGameplay`,
`masslineVariants`. **"Flags are not a substitute for wiring."**

**Six stop conditions (§19):** core control not reliable after two focused iterations;
agent proposes adding more UI rather than resolving intent; performance requires
removing visual payoff; feature cannot name two meaningful uses; creates parallel owner
for physics/cargo/credits/missions/state; depends on another unproven high-risk system.
*"A smaller complete physical toy is more valuable than a cathedral of unverified
systems."*

**Performance budgets (§18):** predictor at **10–20 Hz with interpolation**; NPC job
decisions at low cadence; pooled VFX; LOD based on camera scale/screen area.

### B.7–B.8 Pasteable briefs (07) and handoff template (08)

**16 self-contained briefs** in `problem → consequence → proposed solution →
implementation direction → acceptance → forbidden shortcuts` format (the user's
requested format from L1891–1895):
- 01 Intent-Aware Target Acquisition; 02 Input & Line-Control Redesign; 03 Orbit
  Assist; 04 Slingshot Predictor/Release Arc/Route Compiler; 05 Universal Weapon
  Impulse & Concussion Cannon; 06 Mass Seed; 07 Repulsor & Cone; 08 Inertial Shunt &
  Gravity Mark; 09 Atmosphere & Reentry; 10 Surface Mass Driver & Cargo Heist; 11
  Meteor Express & Frame Coupler; 12 Monofilament; 13 Twin Bridle; 14 Drag Net; 15
  Modern Physics VFX Foundation; 16 First Planetary Physics Vertical Slice.

**Brief→prompt mapping (already done by the SF system):** Briefs 01–14 map almost 1:1
to SF-03 through SF-29. Brief 15 → SF-32. Brief 16 → SF-14.

---

## C. Package 3 — Universe Atlas & Physical Travel (`ORIGINALS/spaceface_universe_atlas_prompt_pack/`, 14 docs)

### C.1 What this package owns (and where it collides)

This is a **third, parallel planning stream** focused on **MAP, NAVIGATION,
LONG-DISTANCE TRAVEL, and CONTENT PIPELINE**. Where Package 1 owns physics/sites/wrecks
and Package 2 owns gravity/massline variants, this package owns the player's experience
of **maps and long-distance travel** — currently *"fragmented, ambiguous, and often
empty."*

**Map = one of four major player interfaces** (mining / flight-combat / station / map),
declared the *"future substrate for fleet, logistics, territory, and remote strategic
control."*

### C.2 Named systems

- **Canonical Atlas** — stable record per map-visible concept: stable ID, type, name,
  parent hierarchy, authoring coordinate frame, canonical galactic-global position,
  bounds/orbit/region/corridor/uncertainty volume, discovery state/confidence/staleness/
  provenance, map glyph + label + holographic proxy, navigation connectors,
  services/economy/faction/law/threat/resources/traffic/missions/history, permitted
  player actions.
- **Navigation contract** — every objective resolves into: ultimate destination,
  immediate reachable leg, reason for travel, required arrival action, location-state
  (exact/approximate/uncertain/stale/unknown), route alternatives + policy, ETA +
  stopping info, fuel implications, threat/legality/confidence, interruption + recovery.
  **The HUD points to the next reachable leg, never blindly through empty space.**
- **Flight-control dimensions (4 orthogonal axes, NOT tangled booleans):** Assist
  regime (Assisted/Drift/Newtonian) × Control owner (Manual/Local autopilot/Route
  follower) × Travel drive (Off/Charging/Engaged/Interdicted) × Actuator request
  (Main thrust/Reverse-brake/Boost/Dash/Lateral RCS/Yaw RCS).
- **Travel Burn** — rebindable latched forward-thrust mode (**Num Lock default**) that
  suppresses the assisted speed governor, lets velocity accumulate via real force,
  preserves steering, restores prior regime on disengage *"without secretly applying a
  braking command."*
- **Boost = Dash as two discharge profiles of one booster** — same capacitor/
  propellant; dash = high-discharge burst, held boost = lower-discharge continuous.
- **Route executor state machine:** `ALIGN → BURN → COAST → FLIP → BRAKE → APPROACH →
  ARRIVE`; multi-sector adds `APPROACH CONNECTOR → TRANSIT → ACQUIRE NEXT LEG`.
- **Physical lanes** — real route edges in the same world (NOT loading-screen
  teleports); capture/align/accelerate/guide/exit/dropout/re-enter. *"A damaged or
  destroyed segment causes a local dropout. The next intact segment remains physically
  reachable where topology permits."*
- **Surveyor's Table aesthetic** — binding product identity: *"warm black, brass,
  amber, restrained teal, and technical typography."*
- **Semantic zoom / continuous chart** — replace hard Local/System/Galaxy switches with
  one continuous camera `{focusGlobal, logZoom}`.
- **Holographic proxies** — tiered: auto-derived wireframe from GLB → procedural →
  fallback glyph → Blender-authored hero (reserve for important locations only).
- **5-tier evidence labels:** `FIRSTHAND_OBSERVATION`, `PRIOR_AUDIT_CLAIM`,
  `BINDING_PRODUCT_DIRECTION`, `PROPOSED_DESIGN`, `VERIFIED_CURRENT_FACT`. *"Never
  collapse these categories."*
- **"Never Lost" rescue slice** — recommended first implementation.

### C.3 The eight collision points with Packages 1 & 2 (critical for the reviewer)

| # | Topic | Atlas pack says | Packages 1/2 say | Collision risk |
|---|---|---|---|---|
| 1 | Travel/propulsion | "Travel Burn" owns long-distance thrust; scopes propulsion agent to NOT own route planning, map UI, speed-line rendering, or physical-lane gameplay | Depth-playbook "Agent A" owns physics/controls/collision including propulsionKernel.js | **Two packages assume ownership of propulsionKernel.js.** User has not reconciled. |
| 2 | VFX | Owns speed-streaks, RCS nozzle, env transitions; same forbidden-shortcut list (anti "translucent sphere + bloom"); same techniques (`THREE.InstancedMesh`, SDF rings, depth-aware particles, flow-field) | Gravity package doc 05 owns VFX vocabulary for gravity/massline/physics-combat; **near-identical technique list** | **Direct duplication. Two agents would build competing VFX systems.** |
| 3 | Content pipeline | `10_CONTENT_PIPELINE_HOLOGRAPHS.md` owns spatial/world content (places, holographic inspection proxies) | Depth-playbook `06_STORY_LEDGER_AND_IMAGE_PIPELINE.md` owns narrative content (ledger pages, story images) | Coexist, but **don't conflate** — story pipeline owns the 1950s-cartoon fix. |
| 4 | NPC jobs / traffic | "travel ecology" — convoys, patrols, piracy, wreckage along travel routes | NPC miner/hauler/customs/piracy/patrol loops | Same NPCs, two framings. |
| 5 | Planets | Planets = map records (bounds/orbit/trajectory); gravity NOT simulated here | Planets = physical gravity wells (softened inverse-square, atmosphere, slingshot) | **Planet identity must be shared** — map's planet and physics's planet must be one object. |
| 6 | Sectors | Sectors = Atlas records with parent-child + connectors | Authored sector archetypes with "one sentence no other sector can claim" | Atlas schema can hold these but doesn't enforce authored identity. |
| 7 | Wrecks | Wrecks = Atlas entries (bounds + discovery + connectors) | Wrecks = monumental physical sites (300–600 wu, multi-component) | Map's wreck record and depth's Wreck Cathedral must reconcile. |
| 8 | Story | "reason for travel" field | Ambient fragments / inspection fragments / ledger | Complementary, not conflicting. |

**Alignment:** all three reject placeholder balls, invisible velocity writes, unit-tests-
as-acceptance, shared-tree collisions, and "use advanced techniques" as a vague license.

### C.4 The atlas pack's relationship to the live repo (CRITICAL)

The atlas pack is the source of `design/program/atlas/`, which on **2026-07-19** was
written by an integration engineer who **inverted** the pack's sequencing. Per
`design/program/atlas/01_DECISIONS.md` (accepted 2026-07-19, supersedes the prompt
pack's README): *"the spatial foundation already exists and is sound... the program is
NOT 'build the Atlas, then fix the map.' It is 'make the existing truth visible, then
build the one missing spine [route follower + Travel Burn], then grow semantics on
top.'"*

**Implication for the reviewer:** the atlas pack's 14-doc sequencing is **partially
superseded by live repo decisions**. Do not execute the atlas pack's plan as written;
reconcile against `design/program/atlas/01_DECISIONS.md` first. The live state:
`check:journey:textile` scores **10 of 11** (the 11th — `truthful-instruments` — is
deliberately red).

---

## D. The 36-prompt sequential system (structure recap)

### D.1 The dependency spine (6 phases)

| Phase | Prompts | Theme |
|---|---|---|
| **P0 Truth & control foundation** | SF-00 → SF-07 | Reconcile truth, baseline closure, deterministic lab, tether acquisition, input grammar, orbit assist, release predictor, dogfight control fix |
| **P1 Physical combat & gravity** | SF-08 → SF-14 | Compound collision, weapon impulse, physics weapons, mass seed, fields, mass coupling, planet sling |
| **P2 Living world & world-site kernel** | SF-15 → SF-22 | NPC jobs, cargo/heist loop, interaction descriptors, industrial beam, World Site kernel, Wreck Cathedral, sector recompose, env machinery |
| **P3 Asteroid Ops, industry, infrastructure** | SF-23 → SF-26 | Asteroid exteriorization, ops heat/signature, transforming claim, manufactured infrastructure |
| **P4 Specialized masslines & narrative/visual consolidation** | SF-27 → SF-32 | Tractor/frame coupler/elastic whip, monofilament/transverse snare, twin bridle, ship's ledger, visual families, HUD/VFX/camera/a11y |
| **P5 Integration, endings, release** | SF-33 → SF-35 | Gold corridor 30/90-min, embodied story/endings, final save/perf/platform/release |

### D.2 Model routing (who runs what)

- **Backend/no-vision suitable:** SF-00, SF-02, SF-05, SF-09.
- **Backend impl + vision review:** SF-01, SF-03, SF-04, SF-11, SF-13, SF-15, SF-19,
  SF-27, SF-29.
- **Strong vision/frontend required for acceptance:** SF-06, SF-07, SF-08, SF-10,
  SF-12, SF-14, SF-16, SF-17, SF-18, SF-20, SF-21, SF-22, SF-23, SF-24, SF-25, SF-26,
  SF-28, SF-30, SF-31, SF-32, SF-33, SF-34, SF-35.

**Dispatch rules:** a `VISION-YES` task is not accepted from source inspection alone.
A strong visual agent should not be spent on pure kernel work. A visual agent must
still obey deterministic sim, physics authority, save, route, single-writer contracts.

### D.3 What every prompt contains (the shared scaffold, ~40% of each file)

- YAML routing metadata + stable dependencies.
- XML-tagged role, context, pseudo-skills, mission, scope, implementation direction,
  acceptance, failure modes, verification, receipt contract.
- A dated but explicitly non-authoritative live-repo snapshot.
- The authority chain, shared-tree safety, single-writer rules, determinism, browser/
  Electron parity, save, accessibility, evidence requirements.
- The causal problem, why valuable, exact player-observable checkpoint.
- Anti-placeholder rules (central circles, generic spheres, labels as behavior, UI-only
  rewards, hidden autopilot, direct velocity writes, primitive+bloom VFX, debug-only
  routes).
- Completion checklist + file-movement protocol.

**Reading-efficiency tip:** because ~40% of each prompt is the shared scaffold, read
SF-00 in full, then skim 2–3 representative prompts to internalize the pattern, then
read the rest only as you build their corrected steps.

### D.4 The status vocabulary (do not collapse)

`IMPLEMENTED` / `FOCUSED_GREEN` / `ROUTE_ACCEPTED` / `VISUALLY_ACCEPTED` /
`INTEGRATED` / `ALREADY_SATISFIED` / `BLOCKED`. **No agent may compress these into
"done."**

---

## E. Cross-cutting themes (the true spine across all three packages)

1. **Semantic surplus, embodied deficit** — rich data models, glowing spheres on
   screen. Every file frames its work as fixing this translation failure.
2. **Unlock verbs, not percentages** — every tier adds a new action category.
3. **Compound collision proxies as the keystone** — without them, no wreck channels,
   no honest docking, no ricochet slugs.
4. **Targetable components + shared recipes as the multiplier** — one input code path
   → braces, relays, satellite repairs, anomaly nodes, refinery valves.
5. **Shape input, do not script outcomes** — the rule underlies all assists; rejects
   direct velocity writes.
6. **Living world via job state machines, not combat AI** — combat is an interrupt;
   miner/hauler/patrol loops carry world life.
7. **Additive, non-blocking, evidence-based story** — three layers, no branch deletion.
8. **Vertical slice before scale** — one wreck before twelve; one sector before 24;
   prove the operation before replicating.
9. **Exteriorization of interior upgrades** — every internal milestone produces
   visible exterior change.
10. **Anti-cartoon image discipline** — production-still/documentary realism; explicit
    exclusion lists.
11. **Events, not hygiene** — idle is fine; failure creates a situation, not a chore.
12. **Massline as the central toy** — repeatedly named as the project's best existing
    candidate.
13. **Authority-seam ownership** — one owner per file family per wave.
14. **One input vocabulary, extended through context** — RMB stays one button; the
    world gains verbs.
15. **Truth hierarchy: normal-route reachability > browser footage > telemetry > tests
    > code > design docs.**

---

## F. Where two sources describe the same thing slightly differently (preserve both)

These nuances matter. A reviewer who picks one side loses information.

| # | Topic | Source A says | Source B says | Resolution hint |
|---|---|---|---|---|
| F1 | Sector pocket count | depth 00 §8 + 03 §1: "**2–4** activity pockets" | depth 08 Wave 6: "**three or four** distinct pockets" | "2–4" is the design law; "3–4" is the stricter first-recomposition target. |
| F2 | Progression stages | depth 00: 5-stage arc | depth 05: 7-stage ladder (Stages 0–6) | 7-stage is more granular; treat as authoritative for implementation. |
| F3 | First physics-weapon set | depth 02 Part VII: **10** weapons | depth 08 Wave 4: **3** (concussion, vector mine, RCS disruptor) | Wave 4's 3 is the first prototype; 10 is the catalog. |
| F4 | Sector examples | depth 03: 12 named seeds | depth 08 Wave 6: **Ceres Belt** + Abandoned Driller (neither in the 12) | Reviewer must decide which sector is canonical for Wave 6 / SF-21. |
| F5 | "Radius-nine wreck" | depth 04 §3: "cannot be the hero object" | depth 10 §6: "small generic wreck entities" | Number is an internal default; reviewer should confirm current value. |
| F6 | G/path mode | Source packages proposed target-relative station keeping | Later package proposed comparative prototypes | **Resolved by user:** reject both automatic-pursuit interpretations; preserve direct auto-target/draw-to-fly. |
| F7 | Massline input key | gravity 02 §7: **Space** | gravity Brief 02 + 06: "rebindable/thumb-accessible" | Space is a recommendation, not locked. |
| F8 | Tap-vs-hold threshold | gravity 02 §7.2: "threshold, forgiving, visually signaled" | gravity Brief 02: "Avoid delaying the initial latch while waiting to decide tap vs hold" | Reconcile: latch fires immediately, tap/hold disambiguated later. |
| F9 | Predictor cadence | gravity 02 §11.4 Arm mode: "next valid solution frame" (reads 60 Hz) | gravity 06 §18: "10–20 Hz with interpolation" | Arm mode may need higher cadence; or "frame" means "sampled solution." |
| F10 | Player impact hull damage | gravity 01 Law 2: "immunity" | gravity 01 Law 7: "little or no hull damage" | Zero vs small — reviewer must decide. |
| F11 | Twin bridle cap | gravity 03 §7.6: "max one initially" | gravity Brief 13: "bounded count" | Treat "one" as the launch cap. |
| F12 | Gravity Lens | gravity 01 §6.2: core feature | gravity 03 §6.3: defer until preview reliable | Doc 01's taxonomy overstates near-term scope; defer per 03. |
| F13 | VFX "exact prompt" asymmetry | gravity 05: full prompts for Mass Seed, Repulsor, reentry, high-speed camera | gravity 05: NO equivalent prompts for massline, concussion, Inertial Shunt, atmosphere skim, drag net, twin bridle, black hole | Agent handed prompt-less effects has less direction. |
| F14 | NPC cargo collection | gravity 04 §12: "statistically or physically" | gravity 06 §16.2: "cargo remains sole cargo writer" | "Statistically" could bypass cargo owner; must route through either way. |
| F15 | Frame Coupler / Meteor Express ordering | gravity 06 Phase 8 includes Meteor Express | gravity 06 Phase 9 builds Frame Coupler; Brief 11 Meteor Express requires Frame Coupler | Real dependency inversion — Frame Coupler must be pulled earlier or meteor hitchhiking deferred. |
| F16 | Atmosphere ambivalence | user L1655: skeptical | user L1698: conditionally in favor | Conditional: only if combines massline-spin primitive AND line pay-out exists. |
| F17 | Twin bridle scope | user L1694: object-to-object | gravity 03 original: ship-between-two (corrected in package response) | Use object-to-object per user. |
| F18 | Physics realism | user L1650: "take artistic liberties" | gravity docs: extensive physics-purity discussion | Constraint is coherence, not realism. |

---

## G. What the digest intentionally does NOT include (so you know where to look)

- The full ~3,000-word body of each SF-XX prompt — read those in `PLANS/plans/`.
- The verbatim user quotes — those are in `01_THE_USERS_OWN_WORDS.md`.
- The live-repo collision map and 16 flags — those are in `03_COLLISION_AND_FLAG_MAP.md`.
- The 73 KB of pasteable feature briefs (depth 09) — read selectively from
  `ORIGINALS/spaceface_depth_playbook/09_PASTEABLE_FEATURE_BRIEFS.md` if a specific
  SF-XX prompt's source brief is needed.
- The full anti-slop contracts (depth 07, 11, 12) — read from `ORIGINALS/` if you need
  the exact forbidden-shortcut enumeration for a specific feature.
