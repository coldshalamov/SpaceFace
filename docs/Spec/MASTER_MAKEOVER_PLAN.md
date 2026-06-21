# SpaceFace Master Makeover Build Plan

> **Source:** Produced by the supergenius (commissioned master-plan prompt, 2026-06-21). Preserved
> verbatim as the canonical north-star document for the project. All agents working on SpaceFace
> should treat this as the authoritative plan; the vertical slice ("47-A: The Mass Discrepancy") is
> the convergence target, and the Definition-of-Done checklists (§E) are the merge gate.
>
> **Status notes (added by resident on integration):**
> - Several Phase 0 foundations are **already integrated on master** as of this writing:
>   `src/render/GLTFLoader.js`, `src/render/assetLoader.js`, `src/render/partsLibrary.js`,
>   `src/render/visualOverrides.js` (asset pipeline — corresponds to SG-04, now needs DoD validation,
>   not a fresh build); `src/systems/dangerModel.js` + `src/systems/sectorSim.js` + the live starmap
>   (deterministic offscreen world field); the headless sim core boundary (PR #2 — `src/core/sim.js`
>   + `src/core/entity.js` SimVector3/WeakMap membrane + `scripts/sim-run.mjs`, deterministic).
>   That means SG-01 (sim/replay kernel) and SG-04 (asset pipeline) are **partially complete** and
>   should be scoped as *extend/validate* jobs, not greenfield.
> - The verified determinism defects (Phase 0 bugs) are real: `Math.random` in `story.js` (2),
>   `traffic.js` (5), `intervention.js` (3). These must be routed through `src/core/rng.js` before
>   the slice's replay/rollback guarantees can hold.

---

## Executive verdict

SpaceFace is not a cheap game internally. It is a remarkably capable pre-production simulation whose strongest systems have never been forced to converge into one finished experience.

The repository already possesses several foundations many projects never reach: a fixed-timestep loop with interpolation, explicit system ordering, deterministic generation, a meaningful economy, faction spillover and conflict, versioned saves, adaptive audio, pooled VFX, and an unusually strong narrative corpus.

Its "cheap web game" feel comes from four broken production contracts:

1. **Movement has no physical authority.** The custom controller directly edits velocity and position while Rapier observes through position-driven kinematic proxies. The result can never produce trustworthy mass, torque, constraints, tethers, or impacts.
2. **Authored art has no ingress path.** The renderer is respectable; the geometry pipeline is not. *(Resident note: a runtime GLTFLoader + asset pipeline now exists on master; the remaining work is DoD validation, KTX2/Draco, prefab enforcement, and release-mode fallback gating.)*
3. **Narrative is presented more than embodied.** The 47-A conspiracy now reaches the player through comms, graffiti, and HUD manipulation, but missions, NPC presence, combat objectives, locations, and consequences still rarely enact it.
4. **"Done" has no evidence bundle.** There are many structural checks, but no single golden encounter with mandatory replay, performance, visual, audio, accessibility, and experience gates.

The makeover is therefore **not a feature-expansion program**. It is a convergence program: build one gold-standard encounter, use it to force the missing structural backbones into existence, and permit expansion only through those proven contracts.

### Corrections to the initial diagnosis

The current repository is slightly further along than the brief suggests:

* `NEW_GAME` contains no weapon, but `ships.js` injects a real starter pulse laser into the fresh player Kestrel. Combat is mechanically available; the mining-first onboarding simply hides that fact.
* The literary story is no longer entirely stranded. `story.js` emits canonical comms, graffiti, HUD lies, and endgame events. The remaining problem is embodiment rather than total absence.
* Audio is not merely a stub. It already has procedural synthesis, buses, limiting, positional attenuation, alarms, and four-state adaptive music. What it lacks is authored sonic identity, HRTF/occlusion, a mix-snapshot model, and close direction against the combat choreography.
* The current flight lab imports the real flight and physics kernels. The structural duplication wound remains most clearly in `balance-sim.mjs`, which explicitly reimplements system formulas because browser-coupled modules cannot be imported cleanly. *(Resident note: the headless sim core from PR #2 begins to close this.)*
* The renderer already has HDR bloom, ACES, grading, grain, PMREM, shadows, LOD, and diagnostics. Replacing it before fixing authored assets would be technical theater.

One governance issue precedes every port: **SpaceFace has no root `LICENSE`.** Public GitHub visibility does not itself grant reuse rights; absent a license, normal copyright restrictions apply. **Choose SpaceFace's intended license before integrating any external implementation.**

---

# I. Clean-room cannibalization map

The correct strategy is not copy-paste. It is **behavioral extraction**:

1. A research agent reads the reference subsystem.
2. It produces a source-linked behavior specification, state diagrams, invariants, edge cases, and black-box tests.
3. A separate implementation agent receives that specification and tests, not the original code.
4. `third_party/reference-ledger.yml` records repository, commit, files studied, license, concepts extracted, and implementation author.
5. No external identifiers, comments, table layouts, constants, or code structure enter SpaceFace without explicit review.

### Pioneer (GPLv3 — architectural reference only unless SpaceFace adopts a compatible license)
**Study:** `src/DynamicBody.*` (force/torque/inertia/damping/integration), `src/Frame.*` (reference frames, orbital-scale transitions), `src/ship/` (flight control over physical bodies), `src/galaxy/` (procedural system + faction-scale data separation), `src/JobQueue.*` (future jobs abstraction).
**Replace in SpaceFace:** direct velocity/angular-rate control in `flightDynamics.js`; Rapier's role as a kinematic contact observer; scalar-only regional modeling in `sectorSim.js`; absence of job-safe simulation phases.

### Endless Sky (GPLv3 — clean-room boundary)
**Study:** `source/Mission.*`, `ConditionSet.*`, `Conversation.*` (declarative mission graphs, conditions, branching dialogue, consequences); `PlayerInfo.*` (durable narrative state); `Outfit.*` + `Ship.*` (outfitting semantics, build accounting); `Government.*` + `Politics.*` (reputation, hostility, fines, cross-faction consequences).
**Replace in SpaceFace:** template-title mission offers with no authored brief/debrief; the split between the generic mission FSM and the literary narrative overlay; flat fitting choices that don't create distinct combat verbs; ad hoc reputation reactions → shared inspectable political model.

### Naev (GPLv3 — extract steering laws and tuning, not code)
**Study:** `src/ai.c`, `src/ai.h`, `dat/ai/`, `src/pilot.*` — approach, brake, intercept, pursue, evade, disengage, weapon-range maneuver logic; `src/physics/` for responsive 2D space motion tuning.
**Replace in SpaceFace:** single-layer AI FSM and elementary seek/circle/flee steering; the shared "turn toward target and thrust" character of too many ships; compressed maneuver identities caused by the universal yaw-rate ceiling.

### Vega Strike (composite/varied licensing — per-file legal decision, default behavioral reference only)
**Study:** `engine/src/cmd/ai/` — flightgroups, orders, mission data, dynamic-universe activity, faction behavior, unit capture; the distinction between strategic orders and tactical execution.
**Replace in SpaceFace:** decorative traffic sampling only a small local route loop; thin links between faction power, logistics, military activity, and visible world events; later — disable, board, tow, capture, ownership-transfer mechanics.

### FreeSpace 2 Source Code Project (source-available, NONCOMMERCIAL — design/behavior reference only for any commercial project)
**Study:** `code/ai/aicode.cpp`, `aigoals.cpp`, `aiturret.cpp`; `code/mission/missionparse.cpp`; `code/parse/sexp.cpp`; `code/ship/ship.cpp` + `shiphit.cpp`; `code/weapon/beam.cpp`.
**Replace in SpaceFace:** flat ship health → spatial subsystem volumes + functional disablement; independent fighter AI → wings/command hierarchies/escort priorities/formation goals; hard-coded encounter scripting → mission-director expression model; generic "shoot until hull zero" capital combat.

### Oolite (GPLv2+ core scripts; OXPs/assets vary — record per file)
**Study:** `Resources/Scripts/oolite-priorityai.js`; mission/contract scripts; OXP lifecycle + world-script events; `Schemata/` validation; `DebugOXP` authoring/inspection.
**Replace in SpaceFace:** unvalidated free-form content files; content changes requiring a programmer to understand browser internals; absence of an expansion-package contract; absence of an agent-facing runtime console, hot reload, state inspection, validation loop.

### Starsector (closed-source — campaign-layer DESIGN reference only, no code)
The north star for replacing scalar regional drift with a **causal campaign simulation**: markets with industries/imports/shortages/accessibility/disruptions; faction expeditions/raids/invasions/trade fleets/military responses; persistent consequences that *generate* missions rather than waiting for scripted boards; a sector in which economic and military causality remains visible to the player.

---

# II. The professional-game foundation menu

This is the ceiling, not the immediate backlog. A professional production chooses from this menu in service of a coherent game. It does not accumulate every fashionable technique like chrome on a refrigerator.

## 1. Engine and architecture
**Cheap-jank → professional:** mutable gameplay objects containing renderer references and browser-only systems → a deterministic simulation kernel with typed contracts, command inputs, snapshots, presentation adapters, validated content, and evidence-producing tools.

| Technique | Canonical examples | Why it creates professional quality |
|---|---|---|
| Archetype ECS, sparse sets, SoA component stores | Overwatch, Factorio | Makes ownership, iteration cost, serialization, and bulk queries explicit. |
| Sim/render decoupling, presentation mirror, snapshot interpolation | Factorio, Rocket League | Rendering can interpolate/animate/exaggerate without corrupting authoritative state. Headless tests + replay become natural. |
| Deterministic command stream, replay, rollback-ready snapshots | StarCraft, GGPO fighting games | Every bug becomes reproducible. Automated agents can compare builds from the same input tape. |
| Data-oriented design, cache-aware hot paths, stable IDs | Doom 2016, Battlefield | Predictable frame cost replaces object churn and incidental GC. |
| Scripting/data separation, content packages, schema validation, hot reload | Oolite, Bethesda mod ecosystems | Designers and content agents can produce work without altering engine contracts. |
| Asset dependency graphs, async streaming, content-addressed bundles | Destiny 2, Marvel's Spider-Man | Loading, memory, patching, fallback become managed systems. |
| Scene graphs, prefabs, nested composition, socket contracts | Half-Life 2, Dishonored | Ships/weapons/damage states/VFX/lights share an authored hierarchy. |
| Loose quadtree, BVH, dynamic AABB tree, hierarchical grids | Supreme Commander, GTA V | Different scales of objects/queries stop fighting one uniform spatial hash. |
| Frame graph/render graph + resource lifetime analysis | Doom Eternal, modern Frostbite | Pass ordering, transient targets, barriers, GPU memory become inspectable. |
| Job graph, work stealing, worker pools, Burst-style kernels | Destiny, Battlefield | Expensive sim/prep work scales across cores without hidden write races. |

For SpaceFace, the professional move is not "rewrite everything into ECS immediately." Build a pure authoritative simulation world and migrate hot-path ships, projectiles, constraints, sensors, and VFX-event production into component stores. Economy, narrative, and campaign state remain domain-specific stores with equally strict schemas.

## 2. Rendering depth
**Cheap-jank → professional:** bloom and noise textures on primitive geometry → authored silhouettes, calibrated material response, depth hierarchy, temporal stability, encounter lighting, controlled cinematic composition.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Clustered Forward+ vs deferred G-buffer | Doom 2016, Control | Forward+ is strong for SpaceFace's translucent trails, particles, MSAA, many local lights. |
| Baked GI, lightmaps, irradiance/reflection probes | HL:Alyx, TLOU2 | Stable rich indirect light at low runtime cost — ideal for stations/derelicts/hero arenas. |
| DDGI / probe-volume GI | Metro Exodus, RTXGI titles | Dynamic ships/lights inhabit believable indirect illumination without full path tracing. |
| RTGI + ray-traced reflections | Cyberpunk 2077, Metro Exodus Enhanced | High-end ceiling for physically coherent bounce light. Not the first cure for bad geometry. |
| SSR + reflection fallback hierarchy | Control, RE2 | Grounds glossy hulls/station surfaces; probes cover missing screen info. |
| SSAO / HBAO / **GTAO** | GTA V, TLOU2 | Restores contact/crevice depth. GTAO is the preferred modern baseline. |
| Volumetrics, froxel fog, god rays, local dust volumes | RDR2, Destiny 2 | Scale + light shafts. In space: dust, leaking atmosphere, ice crystals, exhaust become composition tools. |
| Motion vectors + TAA/TAAU | RDR2, UE titles | Stabilizes fine geometry, decals, particles, distant silhouettes. |
| LUT color grading, exposure, white balance, tone-map discipline | Uncharted 4, Cyberpunk 2077 | Each sector/story phase gets a controlled visual identity. |
| DoF, chromatic aberration, lens distortion, film grain | Alien:Isolation, TLOU2 | Used sparingly = camera language. Used constantly = visual indigestion. |
| Procedural sky, atmosphere, orbital scattering | Elite Dangerous, Horizon Zero Dawn | Planetary scale + location identity beyond a flat nebula backdrop. |
| Subsurface scattering | Hellblade, TLOU2 | Later: characters, organic ships, ice, biological materials — not metal hulls. |
| Clearcoat, anisotropy, thin-film, layered materials | Forza Horizon 5, Gran Turismo 7 | Painted hulls/brushed metal/heat shields/canopies stop looking like one roughness channel. |
| Parallax occlusion / relief mapping | Crysis, Doom 3 | Credible panel depth where geometry would be wasteful. |
| Deferred decals + damage projection | Doom 2016, Dead Space | Scorching, faction markings, scars, leaks, repair history accumulate on a shared authored hull. |
| Point/splat + Gaussian-splat rendering | Dreams, emerging neural-render | Ceiling for captured derelicts, nebular volumes, distant scenery. Never authoritative collision. |
| Cinematic post stack with pass budgets | God of War, Control | The image becomes a directed sequence of exposure/bloom/grade/vignette/optics/UI — not independent filters. |
| GPU-driven culling, indirect draw, meshlets, mesh shaders | UE5 Nanite titles, Alan Wake 2 | Ceiling for immense debris fields and capital battles. |

Three.js already provides professional loaders for Draco geometry and KTX2 textures. WebGPU/TSL is a legitimate ceiling but a migration with experimental edges — not a prerequisite for the vertical slice.

## 3. Physics and simulation
**Cheap-jank → professional:** set velocity, clamp speed, push overlapping circles apart → forces/torques applied to authoritative bodies with declared mass properties, CCD, contact materials, constraints, deterministic instrumentation.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Dynamic rigid bodies, mass, center of mass, inertia tensors | Rocket League, Wreckfest | Motion responds to shape and load. Ramming/towing/recoil/damage become one coherent language. |
| CCD, speculative contacts, contact manifolds, material pairs | Doom Eternal, Rocket League | Fast bodies stop tunneling; metal/shields/rock/debris/stations get distinct restitution + friction. |
| Physics-driven vs kinematic controllers | Rocket League, Exanima | Inputs request forces/torques. The controller does not teleport the answer into velocity. |
| **Constraint zoo: fixed, hinge, ball, slider, spring, rope, cable, pulley, motor** | Half-Life 2, Besiege | Towing, docking arms, rotating habitats, grapple lines, cranes, articulated wrecks, mechanical puzzles from reusable laws. |
| Soft bodies | BeamNG.drive, World of Goo | Deformable structures, pressure-like behavior where deformation is core. |
| Cloth + cable simulation | TLOU2, Spider-Man | Secondary movement, physically readable connections around stations/boarding scenes. |
| Fluid + cellular material simulation | Noita, From Dust | Fuel leaks, fire spread, atmosphere, coolant, future interiors. |
| Destruction, fracture graphs, bonds, chunk activation | Red Faction: Guerrilla, Teardown | Damage changes navigable/tactical geometry rather than swapping an intact mesh for an explosion. |
| Buoyancy + pressure volumes | Sea of Thieves, Subnautica | Atmospheric flight, gas giants, flooded interiors, low-grav fluid. |
| Articulated bodies + ragdolls | Half-Life 2, GTA IV | Boarding characters, mechanical arms, wreck chains, physically reactive equipment. |
| Vehicle physics, traction + thruster allocation | Rocket League, KSP | Maneuverability becomes an engineering consequence of actuator placement/authority. |
| Patched conics, orbital frames, n-body gravity | KSP, Outer Wilds | Future planetary systems, slingshots, orbital stations, reference-frame transitions. |

Rapier's current kinematic bodies intentionally ignore contact forces — that is precisely why position-driven proxy bodies cannot produce the proposed tether combat. Rapier exposes dynamic bodies, CCD, rope joints, spring joints, motors: use those as the real authority, not as a contact oracle.

## 4. Animation
**Cheap-jank → professional:** rotate a mesh or pulse emissive intensity → authored rigs and stateful procedural layers driven by gameplay semantics.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Skeletal animation + rigged mechanisms | God of War, Uncharted 4 | Turrets, landing gear, radiator fins, docking arms, cockpit hardware, boarding characters gain real articulated structure. |
| Animation state machines + blend trees | Halo, TLOU2 | Movement/action transitions are continuous, interruptible, context-aware. |
| IK/FK + aim constraints | Horizon Zero Dawn, TLOU2 | Turrets, tractor emitters, manipulators, characters reach real targets. |
| Procedural animation | Rain World, Spore | Physical + systemic context creates movement authored clips alone never could. |
| Motion matching | For Honor, TLOU2 | Future boarding characters choose animation from trajectory + intent. |
| Physics-based secondary motion | RDR2, Monster Hunter | Antennae, cables, loose armor, fabric, cargo, wreckage react to acceleration + impact. |
| Motion warping + target alignment | Assassin's Creed, God of War | Finishers, docking, boarding, contextual interactions land exactly on targets. |
| Morph targets + damage blend shapes | Hellblade, L.A. Noire | Damage deformation, canopy stress, organic materials, facial performance become continuous. |
| Root motion | Dark Souls, God of War | Future character actions carry authored displacement + timing with physics-aware correction. |
| Layered + additive animation | Call of Duty, Monster Hunter | Recoil, flinch, aiming, breathing, equipment operation coexist without separate full-body clips. |

For the space slice, the immediate animation stack is ship-centric: skeletal turret/engine gimbals, additive recoil, procedural tether emitter tracking, damage morphs, physical secondary motion.

## 5. Game feel and juice
**Cheap-jank → professional:** one explosion + generic screen shake → a semantic choreography in which input, motion, camera, VFX, audio, UI, and time all agree on the importance + direction of an event.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Input buffering + action queueing | Street Fighter 6, Celeste | Players receive the action they intended despite frame-boundary timing. |
| Coyote time + grace windows | Celeste, Super Mario Odyssey | In SpaceFace: tether-attach grace, dash-cancel grace, lock-retention grace, dock/gate forgiveness. |
| Anticipation, active, recovery frames | Monster Hunter, Sekiro | Actions become readable commitments rather than instant functions. |
| Hitstop + screen freeze | Hades, Street Fighter | Important impacts register in perception before motion resumes. |
| Knockback, recoil, transferred impulse | Doom Eternal, Smash Bros | Weapons visibly act on both victim and shooter. |
| Squash, stretch, elastic response | Cuphead, Nuclear Throne | Shields, exhaust, reticles, particles, UI deform without making metal hulls rubbery. |
| Camera lookahead, push-in, trauma, directional shake | Nuclear Throne, Hades | The camera composes intention + impact rather than merely following coordinates. |
| Particle choreography + hit sparks | Doom Eternal, Hades | Shape, direction, duration, color communicate material, damage type, force. |
| Impact frames + chromatic hit flash | DMC5, Bayonetta | One/two highly controlled frames punctuate major events. Accessibility must reduce them. |
| Time scale + bullet time | Max Payne, Bayonetta | Used at decisions/reversals, not constant syrup. |
| Layered SFX + transient/body/tail design | Doom 2016, Dead Space | Sound conveys weapon power, material, space, consequence even off-screen. |
| Haptics + parameterized feedback | Returnal, Astro's Playroom | Force, tension, damage direction, resource state become tactile channels. |

SpaceFace already has several of these primitives. The next step is not adding more isolated effects; it is making `impact.medium`, `tether.near_break`, `shield.collapse`, `subsystem.disabled` drive one coordinated cue graph.

## 6. Combat depth
**Cheap-jank → professional:** DPS races against one hull bar → a timing-and-position game with commitment, counters, subsystem anatomy, momentum, build-specific verbs.

| Concept | Canonical examples | Space-game translation |
|---|---|---|
| Frame data | Street Fighter, Monster Hunter | Every dash/charge/tether attach/counterpulse/vent/reload has startup/active/recovery/cancel ticks. |
| Hitboxes, hurtboxes, armor zones | fighting games, Monster Hunter | Ships expose spatial subsystem volumes: drives, weapons, sensors, shield emitters, cargo, reactor, tether spool. |
| Cancels + combo routes | DMC, Bayonetta | Drift → dash → tether attach → slingshot → cut → weapon burst becomes a mastery sequence. |
| Parry + counter timing | Sekiro, God of War | A counterpulse reverses/severs an enemy tether; phase shields can reflect impulse during a narrow window. |
| Dodge i-frames | Dark Souls, Bayonetta | Use only for an explicitly phase-shifting module. Ordinary boosting should obey collisions. |
| Stagger + posture | Sekiro, FFVIIR | "Stability" = attitude-control saturation. Repeated torque/rams/subsystem hits open a disable window. |
| Poise | Dark Souls, Elden Ring | Mass, inertia, gyro authority, bracing modules, tether load determine interruption resistance. |
| Weapon arts + signature modules | Elden Ring, Hades | Equipment grants verbs — counterpulse, anchor mine, mass inversion, flak screen — not just % bonuses. |
| Cooldown + heat economies | Doom Eternal, Overwatch | Builds rotate meaningful tools rather than holding one trigger indefinitely. |
| Status + elemental interaction | Divinity:OS2, Hades | Ion drains shields+sensors; thermal raises heat; kinetic transfers impulse; plasma compromises armor; cryo weakens joints. |
| Execution + finishers | Doom Eternal, Sekiro | Disabled ships can be captured, boarded, disarmed, salvaged, interrogated, flung into hazards. |
| Subsystem targeting | FreeSpace 2, FTL | Targeting engines/sensors changes the fight before hull destruction. |
| Momentum juggling | DMC, Just Cause 3 | Tethers, debris, recoil, ramming, opposing tractor forces create the "aerial combo" language of a space game. |
| Weapon feel | Doom, Halo | Muzzle event, recoil, sound, projectile behavior, impact, target reaction, recovery all express one weapon identity. |

## 7. AI depth
**Cheap-jank → professional:** a state enum selecting seek/flee/circle → layered cognition in which strategic intent, squad coordination, tactical action choice, maneuver planning, and physical control operate at different rates.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Steering: seek/arrive/flee/evade/intercept/wander/separation/obstacle avoidance | Naev, Homeworld | Competent physical movement without embedding strategy in force calculations. |
| Behavior trees | Halo, modern action | Inspectable execution logic + interrupt handling. |
| Utility AI | The Sims, systemic games | Contextually valuable actions without brittle transition explosions. |
| GOAP | F.E.A.R. | Short tactical plans from world-state preconditions + effects. |
| HTN planners | strategy/sim games | Longer strategic tasks: blockade, escort, raid, resupply, hunt. |
| Formations + slot assignment | Homeworld, Total War | Wings preserve roles, spacing, firing arcs, leader intent. |
| Command hierarchy + squad blackboards | Halo, FreeSpace 2 | Focus fire, screening, flanking, retreat, subsystem priorities. |
| Perception, memory, uncertainty | Alien:Isolation, MGSV | AI searches, loses contact, investigates evidence, can be deceived. |
| Emergent strategic AI | S.T.A.L.K.E.R., Dwarf Fortress | Agents pursue needs/conflicts beyond the player's immediate encounter. |
| Director AI | Left 4 Dead, Alien:Isolation | Controls pacing, pressure, respite, novelty, escalation without openly cheating. |

The correct SpaceFace stack: **Encounter director → squad commander → ship utility/BT → maneuver planner → steering/thruster actuator.** GOAP/HTN belong in campaign/strategic layers, not inside the 60 Hz dogfight loop.

## 8. Progression and metaprogression
**Cheap-jank → professional:** larger numbers unlocked by longer grinding → increasingly expressive builds, new strategic obligations, changed world relationships.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Classes + archetypes | Mass Effect, Borderlands | Strong play promises: interceptor, tether controller, artillery ship, drone carrier, infiltrator. |
| Skill trees + keystone nodes | PoE, Diablo | Meaningful branches alter rules rather than incrementing one stat. |
| Loadout topology + build synergies | PoE, Slay the Spire | Players discover interactions + author strategies. |
| Crafting + material transformation | Monster Hunter, Minecraft | World resources/targets matter beyond sale value. |
| Enchanting, affixes, tuning | Diablo, Grim Dawn | Controlled modifiers create build variation bounded by clear budgets. |
| Roguelite expedition loops | Hades, Rogue Legacy | High-risk regions offer temporary builds, recovery choices, durable discoveries. |
| Prestige + NG+ | Dark Souls, Nioh | Recontextualizes mastered systems with altered factions/evidence/enemies/rules. |
| Diegetic metaprogression | Hades, Outer Wilds | Knowledge, contacts, permits, shipyard capability, recovered schematics matter more than permanent damage inflation. |

SpaceFace's "migration of attention" concept should govern progression: the player graduates from manual survival → tactical intervention → command → political consequence. The game should not graduate them from 100 damage to 10,000 damage.

## 9. World and systems design
**Cheap-jank → professional:** random price changes + spawned enemies → a causal world whose logistics, power, scarcity, violence, information create one another.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Systemic interaction + immersive-sim verbs | Prey, Dishonored | A small set of coherent rules creates many player-authored solutions. |
| Emergent simulation | Dwarf Fortress, RimWorld | Events become stories because agents/resources possess persistent causes. |
| Faction campaign simulation | Mount & Blade, Starsector | Territory, fleets, leaders, logistics, reputation change without waiting for the player. |
| Dynamic economy + logistics | X4, EVE Online | Production, shipping, destruction, shortage, substitution, security form feedback loops. |
| Living-world ecology | Rain World, BotW | Creatures/hazards have routines, predation, migration, responses. |
| Stealth state machines | MGSV, Thief | Signature, suspicion, investigation, search, reacquisition, witness, evidence → readable stealth. |
| Simulation LOD + view-boundary reconciliation | large strategy, Starsector | Nearby actors get high fidelity; distant regions evolve statistically without becoming disconnected dice rolls. |
| Causality ledger + world provenance | Crusader Kings, Dwarf Fortress | Every shortage, war, bounty, price spike, destroyed convoy can answer "why did this happen?" |

SpaceFace already has pieces. The next leap: replace scalar drift with named causes — a refinery shortage caused by a lost convoy, caused by a pirate wing, funded by a faction, leaving a salvage site and generating an escort/retaliation contract.

## 10. Narrative and dialogue
**Cheap-jank → professional:** lore paragraphs next to generic tasks → narrative state embodied in goals, locations, mechanics, NPC behavior, world consequences, what the interface reveals.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Branching dialogue trees + conversation graphs | Disco Elysium, Alpha Protocol | Choice exposes motive, information, leverage, relationship — not only yes/no. |
| Dialogue variables + conditional lines | Fallout:NV, Witcher 3 | The world remembers actions and speaks differently because of them. |
| Narrative-state blackboard + fact database | Disco Elysium, Pentiment | Story logic becomes inspectable + testable. |
| Branching mission state machines | Mass Effect 2, Endless Sky | Objectives, failures, secrets, consequences authored as explicit state graphs. |
| Environmental storytelling | Outer Wilds, BioShock | Space, damage, cargo, documents, sound, arrangement communicate without interrupting play. |
| Systemic narrative | RimWorld, Crusader Kings | Simulation events acquire authored framing + persistent human meaning. |
| Cinematic direction + blocking | TLOU, God of War | Camera, animation, music, timing, character position communicate dramatic hierarchy. |
| Seamless storytelling | Half-Life 2, Portal | Narrative arrives during player control + through the verbs the player is already using. |

The 47-A material should cease being "the lore track" and become the reason a cargo mass behaves strangely, a customs ship attacks, a market changes, an NPC disappears, the HUD contradicts its own sensor reading.

## 11. UI, UX, accessibility, and agent tooling
**Cheap-jank → professional:** many static panels + DOM strings → a coherent interaction language shared by flight, menus, accessibility, diagnostics, automation agents.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Motion design system, tween grammar, easing tokens | Persona 5, Destiny 2 | Transitions + micro-movements communicate hierarchy, causality, continuity. |
| Diegetic + spatial UI | Dead Space, Metro Exodus | Information belongs to the machine/world, not a web dashboard. |
| Accessibility as architecture | TLOU2, Forza Horizon 5 | Remapping, text scale, contrast, captions, reduced motion, audio cues, assist options broaden play without forking the game. |
| Onboarding as gameplay | Portal, Half-Life 2 | The first challenge teaches through necessity + safe consequence, not a lecture. |
| HUD choreography + attention budgeting | Doom Eternal, God of War | Elements enter, pulse, collapse, disappear according to immediate decisions. |
| Micro-interactions + state acknowledgement | Persona 5, Hearthstone | Hover, press, confirmation, error, purchase, equip, mission changes feel deliberate. |
| Task-flow mapping + progressive disclosure | Destiny, console action | The player sees the next relevant decision, not every system simultaneously. |
| **Agent-facing dev console, CLI, JSON-RPC, deterministic scenario API** | Factorio replays/console, Oolite DebugOXP | AI agents inspect, tune, run, compare, validate without scraping pixels or guessing internal state. |

The agent surface should be a first-class product:
- `sf validate` — schemas, foreign keys, assets, lore links, budgets.
- `sf scenario run 47a --seed 47 --policy aggressive`.
- `sf replay verify <tape>`.
- `sf inspect entity|market|mission|faction|cue`.
- `sf tune patch <json>` — bounded, typed runtime parameter changes.
- `sf capture frame|sequence --camera gameplay`.
- `sf diff replay|telemetry|image`.
- `sf profile cpu|gpu|alloc|draw`.
- `sf fuzz action|mission|save`.
- `sf trace subscribe --events combat.*,tether.*,story.*`.

Every result JSON + optional visual artifacts. Every tunable declares type, range, unit, owner, default, provenance. Agents patch parameters/content through contracts, not edit random constants in source.

## 12. Audio
**Cheap-jank → professional:** a sound emitted on an event → a parameterized mix in which sound identifies source, space, material, state, danger, dramatic importance.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Event, state, switch, RTPC, snapshot model | Wwise/FMOD productions | Decouples gameplay semantics from exact sounds + mix behavior. |
| Adaptive music stems + transition matrices | Doom 2016, Hades | Intensity rises through musical layers, not abrupt track switches. |
| 3D positional audio + HRTF | Hellblade, Returnal | Direction + distance become reliable gameplay information. |
| Occlusion, obstruction, reverb zones | Alien:Isolation, Dead Space | Space gains material boundaries + acoustic scale. |
| Layered foley + material responses | TLOU2, Dead Space | Impacts, engines, mechanisms, debris, UI possess distinct physical identity. |
| Adaptive mixing, sidechain ducking, priority buses | Doom 2016, Overwatch | The important cue stays intelligible in dense combat. |
| Procedural + granular audio | No Man's Sky, Spore | Continuous systems (engines, tethers) respond smoothly to simulation parameters. |
| Voice limits, stealing policy, loudness targets | modern AAA audio | Prevents clipping, masking, uncontrolled density. |

SpaceFace can retain WebAudio while adopting the middleware mental model: semantic events, RTPCs, states, switches, snapshots, buses, meters, profilers, authored cue sheets.

## 13. Procedural generation
**Cheap-jank → professional:** call random until something appears → authored grammar + constraints, provenance, solvability tests, budgets, deterministic regeneration.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Wave Function Collapse + adjacency grammars | Townscaper, WFC indies | Local coherence from authored compatibility rules. |
| Noise fields, domain warping, biome composition | Minecraft, No Man's Sky | Large-scale variation with controllable structure. |
| Graph grammars + dungeon generators | Spelunky, Hades | Encounters/routes satisfy pacing + reachability constraints. |
| Cellular automata + material simulation | Noita, Dwarf Fortress | Caves, fluids, fire, local ecology from simple rules. |
| Galaxy + star-system generation | Elite Dangerous, No Man's Sky | Scale when generation preserves navigation, economy, faction, visual identities. |
| Ship + creature generators | Spore, No Man's Sky | Variety when functional anatomy, silhouette, animation, material rules are enforced. |
| Validation, seed corpus, provenance reports | Spelunky, Dwarf Fortress | Bad seeds become test cases; generated content can explain which rules produced it. |

Hero ships, hero stations, the vertical-slice arena should be authored. Procedural generation creates supporting variation around gold-standard authored grammar — never excuses absent art direction.

## 14. Multiplayer and netcode
**Cheap-jank → professional:** send transforms and hope → choose a formal authority + latency model before networking gameplay.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Deterministic lockstep | StarCraft II, Age of Empires | Efficient for large deterministic sims with synchronized commands. |
| Rollback netcode | GGPO, Strive, SF6 | Responsive local control while correcting predicted history. |
| Client prediction + server reconciliation | Quake, Overwatch | Server-authoritative movement feels immediate. |
| Snapshot interpolation + lag compensation | CS, Halo | Smooths remote actors; adjudicates time-sensitive hits fairly. |

No multiplayer belongs in Phases 0–2. The pure command/replay kernel should merely avoid making future lockstep/rollback impossible.

## 15. Production and quality gates
**Cheap-jank → professional:** "it runs" and the agent stops → every deliverable emits a machine-checkable evidence bundle and cannot be called complete without it.

| Technique | Canonical examples | Why it matters |
|---|---|---|
| Gold vertical slice | Doom 2016, Hades | Proves all disciplines converge at shipping quality before breadth multiplies defects. |
| Definition of Done by asset class | Nintendo, Naughty Dog polish cultures | Removes "looks finished to me" as a merge criterion. |
| Telemetry + funnel analytics | Destiny, Fortnite | Reveals where players fail, quit, repeat, hesitate, ignore. |
| Automated agent playtesting + policy suites | simulation-heavy strategy pipelines | Thousands of seeds, builds, tactics, edge states without manual repetition. |
| Performance budgets + profiling gates | Doom Eternal, Mario titles | Performance becomes a design constraint, not a final optimization panic. |
| Golden replays, images, audio traces, event logs | mature engine test pipelines | Catches behavioral/presentation regressions unit tests cannot. |
| Ship-ready bar + severity policy | high-reliability live games | A build cannot advance with unresolved crash, save, deterministic, performance, accessibility, or progression blockers. |

---

# III. The master makeover plan

## A. Honest current-state audit

| Category | Status | Evidence/judgment |
|---|---|---|
| **1. Engine/architecture** | Partial — strong local foundations | Fixed 60 Hz accumulator, interpolation, explicit system phases, ownership, robust saves, deterministic helpers. But entities contain live Three objects, browser concerns leak into systems, no authoritative command/replay kernel, balance sim duplicates formulas. *(Resident: headless sim core from PR #2 begins to close this.)* |
| **2. Rendering** | Partial — renderer ahead of content pipeline | PBR, PMREM, shadowing, bloom, ACES, grading, grain, interpolation, LOD, diagnostics exist. Runtime authored-asset ingress, compressed textures, prefab manifests, proper AO, motion vectors, temporal AA, volumetrics, decal infra do not. *(Resident: GLTFLoader + asset pipeline now on master; needs DoD validation.)* |
| **3. Physics/simulation** | Partial — structurally wrong authority | Flight directly updates velocity/yaw under hard caps + damping. Custom physics integrates/resolves circles; Rapier receives kinematic proxies + reports contacts. Cannot support trustworthy tethers/momentum combat. |
| **4. Animation** | Missing as a production pipeline | Banking, procedural thruster, damage pieces, mesh-level motion exist, but no runtime glTF rig, AnimationMixer, blend graph, IK, morph-target, authored mechanism pipeline. Ships remain code-assembled lofts/extrusions/boxes/cylinders. |
| **5. Game feel/juice** | Partial — good primitives, weak orchestration | Hitstop, FOV punch, damage vignette, speed lines, camera trauma/roll, particles, ribbons, event lights, shield effects exist. Trigger mainly on large damage/kills/death; no prioritized semantic cue language yet. |
| **6. Combat** | Partial — functional DPS combat | Weapons, shields, armor, hull, hardpoint facings, gimbals, lock, projectile/beam, starter armament exist. Missing subsystem anatomy, action windows, stability/posture, counters, disable/capture, physical momentum as resource. |
| **7. AI** | Partial — deterministic single-ship FSM | Archetypes, target selection, threat, seeded decisions, simple approach/hold/circle/flee/wander. Lacks maneuver library, perception uncertainty, utility/BT, squad blackboards, formations, strategic planners, director. |
| **8. Progression** | Partial — broad but insufficiently expressive | Ship fitting, derived stats, 4-branch tech DAG, automation, research, ship tiers, passive assets substantial. Many upgrades scalar; onboarding obscures combat/build identity behind mining. |
| **9. World/systems** | Partial — one of the strongest areas | Economy, market pressure, factions, war, sector ownership, deterministic sector generation, traffic, automation, intervention, aggregate offscreen drift exist. `sectorSim` coherent but mostly scalar. *(Resident: new dangerModel reaction-diffusion field now on master.)* |
| **10. Narrative/dialogue** | Partial — excellent writing, incomplete embodiment | Canonical cast, 47-A, REF 44-C, Vale, Elroy, comms, graffiti, HUD corruption, endings present and partially surfaced. Mission offers remain mechanical templates; bar invents generic contacts; codex lacks lore/fact interface. |
| **11. UI/UX/agent tooling** | Partial | Dense HUD, rate-limited updates, radar, mission tracking, cached screens, basic enter/exit classes, pause handling, ARIA/inert. No coherent motion system, diegetic grammar, task-flow simplification, agent CLI/RPC. |
| **12. Audio** | Partial — technically credible, aesthetically generic | WebAudio synthesis, buses, limiting, positional attenuation, alarms, adaptive stems, cue mapping, extensive subscriptions. Missing authored signatures, HRTF, occlusion, reverb zones, RTPC authoring tools, mix snapshots, loudness gates, golden mix tests. |
| **13. Procedural generation** | Partial | Deterministic sector spawning, asteroid fields, procedural materials, code-built ships, seeded mission boards. Little grammar validation, seed corpus testing, provenance reporting, hero-vs-background distinction. `check-data` verifies imports/exports, not semantic schemas. |
| **14. Multiplayer/netcode** | Missing | No authority/protocol/prediction/lockstep/rollback/reconciliation. Acceptable for the makeover; only replay-ready architecture required now. |
| **15. Production/quality gates** | Partial | Structural checks, data checks, art checks, real flight lab, balance sim, save migration, diagnostics, telemetry hooks. Missing one gold scenario, schema enforcement, integrated real-system headless sim, golden replays/captures, automated play policies, experience metrics, asset-class DoD gates. |

### Determinism defects to treat as Phase 0 bugs
The architecture declares sim code must not use `Math.random()`, yet current gameplay-affecting paths still do: `story.js` (2), `traffic.js` (5), `intervention.js` (3). These are not polish bugs — they compromise replay, agent comparison, save reproducibility. *(Resident: verified present.)*

---

## B. The vertical slice

### 47-A: The Mass Discrepancy
A ten-to-twelve-minute playable encounter in a shattered freight lane. Not a tutorial mission followed by the fun. It is the fun, arranged so the player learns by surviving it.

**The moment.** Wren's Kestrel drops into a debris field surrounding a ruptured Bourse Freight carrier. A sealed 47-A evidence spindle is tumbling among cargo and bodies. Its manifest says 480 kilograms. Its inertia says something else. A distorted message from Kessler instructs the player to recover it without opening it. A second transmission insists the shipment never existed. The player carries a prototype **Massline tractor tether**. They must stabilize and recover the spindle while scavengers arrive, followed by an official Meridian/Concord recovery tug that demands the evidence. The encounter escalates from rescue → combat → three-way physical tug-of-war. The player can: tow the spindle out; use it as a momentum weapon; attach it to an enemy and overload their attitude control; sling debris into a shield emitter; cut the line to rescue a civilian pod; surrender/destroy/deliver the evidence to a competing contact. The story's central metaphor — mass, accounting, bodies-as-inventory — is now the physical mechanic.

### The hook mechanic: the Massline tether
Must be a real constraint, not a visual beam attached to interpolated positions.

**Core verbs:** Lock, Attach, Reel, Pay out, Brake spool, Cut, Re-anchor, Counterpulse, Tow, Sling.
**Physical state:** max cable length, reel target length, spring stiffness/damping, tension, tension derivative, spool heat, capacitor cost, attachment strength, line-of-sight, break impulse, mass ratio, relative angular velocity.
**Player-readable decisions:** high tension = control but risks breakage; heavy payload slows turning + changes drift; paying out preserves line through violent maneuvers; cutting at the right moment converts stored momentum into a projectile; tethering a disabled subsystem allows tow/capture; enemy counter-tether can steal payload or rotate the player into danger.
**Enemy counterplay:** shoot/sever the line; counter-tether the payload; boost perpendicular to spike tension; hide attachment behind debris; ion pulse the spool; disable player lateral thrusters; sacrifice a light craft to redirect payload.

Three successful tactical styles: (1) precision pilot — evade, target subsystems, recover intact; (2) momentum predator — debris + tether release as weapons; (3) control specialist — disable drives, counter-tether, tow/capture.

### Encounter beat sheet
| Time | Beat | Learns/proves |
|---|---|---|
| 0:00–0:15 | Drop into tumbling wreck field; spindle signal pulses | Movement + visual composition; no menu/exposition wall |
| 0:15–1:15 | Attach + stabilize spindle; unexpected mass overloads spool | Attach, reel, pay out, tension reading; story + mechanic become same fact |
| 1:15–2:45 | Two light scavengers arrive; one harasses, one tries to steal spindle | Weapons, target selection, counter-tether, basic tactical choice |
| 2:45–4:30 | Discover debris can be swung/released/shielded | Emergent physics weaponization |
| 4:30–6:30 | Official recovery tug + escorts enter; demands surrender, begins stronger counter-tether | Faction pressure, subsystem targeting, squad behavior |
| 6:30–8:30 | Evidence mass destabilizes fractured carrier section; debris rotates through arena | Spatial hazard, line management, camera composition, director escalation |
| 8:30–10:00 | Civilian pod vs evidence choice; Elroy/Kessler/Vale info changes transmissions | Narrative choice through physical priorities |
| 10:00–12:00 | Escape/surrender/destroy/deliver; immediate faction/economy/NPC/codex/HUD consequences | Reactive world + replayable branch |

### Ship feel
Kestrel = **fast at the nose, heavy through the body.**
- Rapier dynamic body owns X/Z translation + yaw. Y/pitch/roll physically locked; visual roll is presentation.
- Thrusters generate bounded force + torque. Assisted/drift/Newtonian become control laws over the same body. Assisted applies damping *forces*, never sets velocity.
- Turning authority depends on inertia, thruster torque, damage, tether load, capacitor.
- Lateral drift persists long enough to be tactical. Reverse thrust powerful but not magical. Dash = real impulse with startup/recovery/heat + short tether-attach cancel window. Recoil + collisions move the body. Disabled lateral thruster materially changes maneuverability.
- Camera tightens slightly in close combat + composes player + tether payload. Current combat zoom-out does the opposite — remove it.

### Look
Slice ships only with authored assets: Kestrel hero, scavenger fighter, official recovery tug, 47-A spindle, civilian pod, carrier wreck modules, major debris. Each uses authored bevels + weighted normals, deliberate top-down silhouette, UV-authored PBR (base color/normal/ORM/emissive/damage masks), clearcoat/layered paint where appropriate, LOD0/1/2, named hardpoints/thrusters/tether points/subsystem points/damage sockets/camera framing nodes, authored convex/compound colliders, decal + damage projection compatibility.

Immediate professional rendering stack: current PBR/PMREM base + authored HDR environment + encounter lighting + GTAO + depth-aware volumetric dust/leaking atmosphere + stable AA + controlled bloom + sector/story LUT + damage decals + tether particles + local lights. **No procedural hero-ship fallback in release mode.**

### Juice choreography (semantic, not raw damage)
- **Tether attach:** 2-frame emitter anticipation, physical line snap, short camera impulse toward attachment, local spark burst, low-freq spool transient, UI tension arc wakes from contact point.
- **Near break:** cable vibration rises from tension derivative, pitch + roughness increase, reticle directional instability, restrained high-freq camera trauma. No screen-wide red flash unless actual danger.
- **Release/break:** 1–3-frame impact punctuation by stored energy, directional shock cone, payload + ship receive real impulse, audio tail reflects material/environment, brief time dilation only for decisive reversal/kill.
- **Subsystem disable:** visible local failure, ship motion changes immediately, HUD bracket collapses, enemy behavior adapts, audio loses/distorts relevant engine/weapon layer.
- All effects obey priority, distance, player relevance, motion-reduction, flash sensitivity, voice/particle/light budgets.

### Audio
Existing WebAudio foundation upgraded into middleware-style graph: 4–6 adaptive music stems (void/investigation/pressure/combat/reversal/aftermath); tether strain controlled by tension/derivative/spool speed/material; engine audio by force demand/velocity/damage/capacitor; impact cues from transient/body/debris/environmental tail; HRTF for ships + impacts; occlusion through wreck geometry; reverb zones inside leaking carrier volumes; dynamic ducking for critical comms + subsystem alarms; deliberate near-silence when the false mass is revealed.

### UI
Flight UI becomes smaller + more intelligent: tether reticle (valid/invalid attachment language), tension arc + predicted break marker, reel direction + spool heat, subsystem brackets on selected target, relative velocity vector, counter-tether warning, one-line contextual action prompt (never a tutorial paragraph), comms embedded beside relevant actor/signal, evidence/civilian objective represented spatially, color-independent shape + audio encoding, full remapping/hold-toggle/reduced-motion/reduced-flash/scalable text/high-contrast tether mode.

### Vertical-slice proof metrics (acceptance)
- First meaningful steering input within 5s.
- First tether attachment within 60s.
- First hostile shot within 90s.
- No uninterrupted tutorial text exceeds two short lines.
- ≥3 distinct scripted policies complete the encounter.
- ≥2 enemy counter-tether behaviors across the seed suite.
- Every branch changes ≥1 immediate world fact (faction standing, market condition, NPC availability, mission state, sector control pressure).
- Death-to-retry under 6s.
- Same seed + input tape reproduce same authoritative state hash.
- Declared baseline holds 60 Hz sim + agreed frame budget at p95.
- Every visible hero asset passes ship/prop DoD.
- Every critical beat has audio, VFX, camera, UI, accessibility evidence.
- Human playtesters can explain why the shipment's mass matters without reading the codex.

---

## C. Foundations the slice requires

Structural backbones, not feature tickets. Each = an isolated supergenius contract job.

### SG-01 — Pure deterministic simulation kernel + replay
Browser-independent authoritative sim layer accepting versioned `InputFrame` commands, producing deterministic state snapshots + domain events. No DOM/Three/wall-clock/unscoped-random/live-mesh-refs. Stable numeric IDs, explicit per-domain RNG streams, snapshot/hash/replay, presentation events separated from authoritative events, typed domain stores (economy/campaign/missions/narrative), component stores (bodies/ships/projectiles/sensors/subsystems).
**Why structural:** physics/AI/balancing/saves/automated-playtesting/rollback/perf-testing/agent-tooling all depend on it.
**Refs:** Pioneer body/ship/frame/galaxy separation; Oolite script/event lifecycle; the good part of the current SpaceFace flight lab (importing actual kernels).
**Acceptance:** `node scripts/sf-sim.mjs run 47a --seed 47 --ticks 36000 --inputs test/47a.inputs --hash` imports real flight/physics/combat/economy/campaign/mission; 20 repeated runs identical hashes; static analysis = zero DOM/Three/Date.now/Math.random under `src/sim/`; every random draw attributed to a named serialized stream; save@tick 12000 → reload → continue = same final hash as uninterrupted; `balance-sim` no longer reimplements formulas; replay step/bisect/inspect by tick.
*(Resident: the headless sim core from PR #2 is the seed of this — SG-01 should extend it to the full command/replay/snapshot contract, not start over.)*

### SG-02 — Rapier dynamic-body authority + 2.5D constraint layer
Ships, major debris, impact projectiles, tether payloads become dynamic Rapier bodies. Lock vertical + out-of-plane rotations. Authored mass/CoM/inertia. Forces/torques/impulses/damping. CCD for dash-speed bodies + critical projectiles. Collider/material pairs. Rope + spring constraints for the Massline. Reel control, break thresholds, attachment points, tension telemetry. Visual bank derived from lateral accel + torque (don't sim unwanted physical roll).
**Why structural:** tether, collision feel, ramming, recoil, damage-induced handling, towing, capture, trustworthy AI movement all depend on one authority.
**Refs:** Pioneer DynamicBody + ship control; Naev maneuver + 2D-flight tuning; Rapier dynamic bodies/CCD/rope joints/spring joints/motors.
**Acceptance:** no player/combat ship uses `setNextKinematicTranslation`; isolated undamped 2-body tether case momentum error below declared tolerance; max cable-length violation <1% across stress suite; 1000 max-dash collision tests = no tunneling, no NaNs; break on documented impulse/tension tick; damaging one thruster changes measured force/torque authority next tick; assisted/drift/newtonian all operate on same body; replay hashes stable on supported build (cross-platform uses quantized state hashing).

### SG-03 — Action/combat/damage/subsystem framework
Data-authored combat grammar: `ActionDef` (startup/active/recovery/cancel windows/tags/cooldown/heat/capacitor/movement/target reqs); `DamagePacket` (kinetic/thermal/ion/plasma/phase/penetration/impulse/heat/status); `SubsystemDef` (spatial volume/health/armor/dependencies/disabled behavior/repair); `StatusDef` (duration/stacking/immunity/interactions/cues); `AttachmentDef` (tether-compatible socket/break strength/ownership); `CombatTrace` (deterministic record).
**Why structural:** tether combat, dash cancels, counterplay, subsystem targeting, AI actions, weapon identity, progression, effects, balance sim all need the same language.
**Refs:** FS2 ship/subsystem/hit/beam/turret/AI-goal; Endless Sky outfit+ship defs; Sekiro-style action timing as design language.
**Acceptance:** scripted `dash→attach→reel→sling→cut→burst` = exact tick trace; player + AI invoke same ActionDef (no privileged AI damage path); destroying drive/weapon/sensor/tether spool = documented functional effect; every damage packet through one routing function; no render/UI module mutates combat state; all action defs validate (unreachable phases, negative times, impossible cancels, missing cue IDs); property tests for health/energy/heat/cooldown invariants.

### SG-04 — Authored asset ingestion, prefab, socket, LOD pipeline
Production glTF asset system: GLTFLoader, KTX2, Meshopt/Draco, hashed manifest, async dep loading + cache, authored prefab hierarchy, required socket names + semantic metadata in glTF extras, collider extraction, LOD groups, material validation, provenance + license records, release-mode failure when hero asset falls back to procedural.
**Why structural:** until this exists, every art request is theater.
**Refs:** Three.js glTF/Draco/KTX2/Meshopt; Oolite schema-verification mindset; existing Kestrel asset spec + structural art checks.
**Acceptance:** `sf validate asset assets/ships/kestrel/kestrel.glb` verifies scale/orientation/bounds/pivot/tris/draw calls/maps/LODs/colliders/sockets; required hardpoints/thrusters/tether sockets/subsystem nodes/damage sockets/camera framing nodes resolve by semantic name; compressed textures load on supported GPU matrix; missing hero assets fail CI + release startup (procedural fallback dev-only); screenshot tests cover gameplay distance/hangar/damage/faction grade/low+high quality; budgets enforced from manifest not doc comments.
*(Resident: GLTFLoader + assetLoader + partsLibrary already on master. SG-04 = validate against this DoD + add KTX2/Draco/validator/release-gating, NOT greenfield.)*

### SG-05 — Scenario/mission/dialogue/narrative-state DSL
Declarative content language: conditions, facts, variables, objectives, timers, actor bindings, spawn/despawn, dialogue nodes, choices, world consequences, failures, interrupts, director beats, localization IDs, lore IDs, save/version migration. JS extensions behind a narrow capability interface; ordinary missions ≠ arbitrary engine code.
**Why structural:** how 47-A writing enters combat/NPCs/economy/faction/UI/locations/replay without a custom system per beat.
**Refs:** Endless Sky Mission/ConditionSet/Conversation; Oolite mission/world scripts + schemas; FS2 mission parsing + S-expression logic.
**Acceptance:** complete 47-A slice loads from content data without bespoke encounter logic in UI/renderer; graph analysis proves required branches reachable + flags dead nodes; every fact/actor/subsystem/cue/station/faction/lore ref resolves; every branch has offer/active/fail/abandon/complete/aftermath where applicable; headless scripted policies reach all intended outcomes; save/load at every node preserves exact progression; agent CLI prints currently valid choices + conditions blocking invalid ones.

### SG-06 — Layered tactical AI, squad logic, encounter director
Five-layer stack: (1) Director — encounter pressure/escalation/respite/reinforcement/retreat/narrative timing; (2) Squad commander — roles/formations/focus target/screen-tug-steal objectives; (3) Ship utility selector — high-level action from perceived state; (4) Behavior execution — run actions + interrupts; (5) Maneuver planner — action intent → trajectories + physical thruster requests. AI perceives through sensors + memory, never reads hidden player state.
**Why structural:** a tether mechanic is only deep when opponents understand/use/counter it. Same stack later powers escorts/patrols/capital wings/traffic/faction fleets/boarding.
**Refs:** Naev pilot AI + maneuver; FS2 wing/turret/AI-goal/mission; Oolite priority AI; L4D director principles.
**Acceptance (across 100 seeded runs):** scavenger + official wings exhibit ≥3 materially different tactics; ≥2 counter-tether actions under documented conditions; no ship unintentionally stationary >180 ticks; no action-state oscillation above threshold; wing members maintain role/formation bounds until explicit break; AI uses same sensors/actions/heat/energy/subsystems/physics as player; director pressure inside authored threat envelope; every decision emits explainable utility/BT trace.

### SG-07 — Schema-governed content, hot reload, agent API/CLI
Unified contract layer for ships/weapons/modules/actions/factions/markets/NPCs/dialogue/missions/scenarios/audio cues/VFX cues/assets/accessibility/localization/perf budgets. JSON Schema (Ajv) or equivalent typed-schema; generate TS/JSDoc + docs from same source. Dev JSON-RPC service exposes sim/scenario/tuning/capture/profiling; CLI wraps it.
**Why structural:** the contract that lets simpler models produce useful volume without quietly inventing fields or corrupting the game.
**Refs:** Oolite Schemata/OXP lifecycle/DebugOXP; modern data-driven live-game tooling.
**Acceptance:** every canonical data file validates in CI; missing IDs/invalid units/bad ranges/cycles/unreachable prereqs/duplicate keys fail with file/line/field/rule; deliberately malformed corpus produces expected failure set; hot reload preserves compatible runtime state + rejects incompatible migration; `sf validate|run|replay|inspect|tune|capture|diff|profile|trace|fuzz` emit versioned JSON; tuning patches can't exceed declared ranges or mutate non-tunable fields; simple-model submissions can't merge without schema/lore/balance/scenario tests.

### SG-08 — Semantic presentation orchestration + adaptive mix graph
Presentation event layer between sim and camera/VFX/UI/audio/haptics: semantic event IDs, importance, player relevance, direction, magnitude, material, distance, repetition suppression, cooldown/concurrency, accessibility transforms, camera effect stack, VFX budgets, audio state/RTPC/switch/bus/snapshot graph, golden timing traces.
**Why structural:** SpaceFace already has many effects; without orchestration, adding more increases noise not impact.
**Refs:** Doom combat/mix discipline; FS2 mission event semantics; existing feel.js/vfx.js/camera.js/audioSystem.js.
**Acceptance:** every critical slice event resolves to a declared presentation recipe; no sim code directly manipulates DOM styles/camera FOV/AudioNodes/particle pools; duplicate events within suppression windows don't stack; voice/light/particle/decal/shake/flash budgets enforced; reduced-motion/reduced-flash/caption/high-contrast/haptic transforms testable; golden cue traces assert relative timing between sim event/impact frame/audio transient/UI pulse/camera impulse; mix profiler proves no clipping + no critical-cue masking in worst combat case.

---

## D. Parallel execution matrix

### Supergenius: slow structural jobs
| ID | Assignment | Depends on | Handoff |
|---|---|---|---|
| **SG-01** | Pure sim kernel, commands, snapshots, hashes, replay | None | Kernel API, migration adapter, replay CLI, determinism suite |
| **SG-02** | Rapier dynamic-body authority + tether constraints | SG-01 command/state contract | Body/component schema, physics tests, tether telemetry |
| **SG-03** | Action/combat/subsystem framework | SG-01, SG-02 | Action schemas, damage model, subsystem runtime, trace tests |
| **SG-04** | glTF/KTX2/Meshopt asset pipeline + prefab validator | None | Loader, manifest, validator, Kestrel reference integration |
| **SG-05** | Mission/scenario/dialogue/narrative DSL | SG-01 events + state facts | DSL runtime, schemas, graph linter, 47-A skeleton |
| **SG-06** | Layered AI, squad blackboard, director | SG-03 action contract | AI layers, maneuver interface, explainability trace, seed tests |
| **SG-07** | Unified schemas, hot reload, JSON-RPC, CLI | SG-01 interfaces; coordinates with all | Generated types, validators, CLI commands, dev server |
| **SG-08** | Presentation orchestration + adaptive mix graph | SG-03 semantic events, SG-04 sockets | Cue schemas, camera/VFX/audio adapters, budgets, golden trace |

Budget ~16–24 supergenius hours incl. one correction pass per contract.

**Required handoff package from every SG job:** interface spec; ownership + mutation table; schema/version changes; migration plan; unit/property/scenario tests; perf benchmark; debug/agent inspection endpoint; known limitations; reference-source ledger; one working integration fixture; explicit deletion list for superseded legacy code. No handoff accepted as "mostly working" — acceptance script must pass.

### Resident genius-tier: integration + slice ownership
Owns the encounter + the seams between foundations.

**Immediate no-regret work:**
- Freeze the 47-A slice beat sheet + metric contract.
- Make the runtime starter weapon explicit in onboarding/HUD/loadout data rather than silently synthetic.
- Replace mining-first framing with the 47-A cold open.
- Reverse combat camera zoom-out + prepare tether-aware composition.
- Install deterministic event tracing around current flight/combat/economy/story/AI/camera.
- Catalogue every current `Math.random()` call as authoritative or cosmetic.
- Define provisional performance + presentation budgets.
- Create first golden input tape + empty expected telemetry envelope.
- Prevent new broad feature work from landing.

**Integration after foundations arrive:**
- Migrate Kestrel + slice actors to dynamic bodies.
- Tune thrust/torque/damping/mass/inertia/dash/tether force envelopes.
- Author slice action definitions + cancel windows.
- Implement encounter beats through scenario DSL.
- Integrate authored ships + wrecks through asset pipeline.
- Build tether-aware camera + HUD composition.
- Direct VFX/audio/music/comms/accessibility against semantic events.
- Tune scavenger/tug/escort behavior.
- Connect outcomes to faction/economy/NPC/mission/codex state.
- Run profile/replay/capture comparisons after every tuning pass.
- Close every DoD failure before expanding content.

**The resident must not create temporary alternative physics/mission/UI/asset formats "until the real system arrives." Temporary systems are where architecture goes to breed.**

### Simpler models: bulk work after contracts exist
| Bulk assignment | Prerequisite contract | Limits |
|---|---|---|
| Wire Quinn/Kessler/Mira/Hale/Rook/Slate/Voss/Elroy into stations/bars/comms/missions | NPC schema, dialogue DSL, lore IDs, location/availability rules | May not invent canon, engine fields, or branch logic |
| Write mission titles/briefs/accept/reminders/failures/completions/aftermaths | Mission DSL, tone guide, localization schema | Mechanics + rewards remain contract-owned |
| Expand codex into lore facts/people/places/orgs/regulations/evidence | Lore/fact schema, discovery rules, provenance | Locked knowledge must not leak |
| Produce combat barks/wing calls/surrender/disable/tether/retreat lines | AI role tags, semantic cue IDs, dialogue limits | No tactical logic in text data |
| Fill action/weapon/module/ship variant data | Combat schema, stat budgets, simulator checks | Cannot add new mechanics or exceed budget envelopes |
| Fill audio cue metadata + variation tables | Audio cue/RTPC/bus schema | Cannot change mix architecture |
| Create scenario fixtures + edge-case policies | Scenario DSL + expected telemetry schema | Test data only; no hidden implementation hooks |
| Add localization/captions/alt descriptions/control labels/accessibility annotations | Stable string IDs + UI schema | Must obey text + reading-time budgets |
| Build background procgen grammars + seed corpora | Grammar schema + validators | No hero content; every output validates |
| Produce telemetry labels + expected event sequences | Event dictionary + analytics contract | Cannot create new gameplay state |

Every bulk task begins with a valid schema + ends with a validation report. "Write some content into a JS file" is no longer an authorized workflow.

---

## E. Definition of Done

### Ship or major spacecraft asset
- [ ] Authored glTF/GLB; no release-mode primitive fallback.
- [ ] Correct coordinate system, scale, forward axis, pivot, frozen transforms.
- [ ] Silhouette unmistakable at gameplay camera distance + 64–128px thumbnail.
- [ ] No large unintentional planar box faces; production bevels/edge treatment present.
- [ ] Weighted/custom normals produce intended highlight flow.
- [ ] UVs, texel density, seams, material assignments pass validation.
- [ ] Base color, normal, ORM, emissive, applicable clearcoat/damage maps present.
- [ ] Correct color-space + channel-packing metadata.
- [ ] LOD0/1/2 meet triangle + screen-error budgets.
- [ ] Draw-call + material-slot budgets pass.
- [ ] Authored convex/compound collider passes hull-containment + gameplay-clearance tests.
- [ ] Mass, CoM, inertia metadata authored or deterministically derived.
- [ ] Weapon/thruster/tether/camera/subsystem/damage/VFX sockets resolve.
- [ ] Turrets/engine gimbals/gear/doors/mechanisms have valid rigs where applicable.
- [ ] Damage masks, decal response, broken states, emissive failure states function.
- [ ] Team/faction readability works without color alone.
- [ ] Gameplay/hangar/damage/low-quality/high-quality golden captures pass.
- [ ] Asset loads without warnings on supported platform matrix.
- [ ] License, source, author, generation method, modification provenance recorded.
- [ ] No severity-1 visual defect at normal camera.
- [ ] No "we will fix the sockets later."

### Combat moment or encounter
- [ ] Player has a meaningful action within 15s.
- [ ] Core hook used under real pressure, not a detached tutorial box.
- [ ] ≥3 viable tactics complete the encounter.
- [ ] ≥2 enemy counterplays exist + are readable.
- [ ] All enemy actions use shared player-facing combat contracts.
- [ ] Telegraphs expose startup, danger direction, likely consequence.
- [ ] Recovery windows make commitments punishable but not arbitrary.
- [ ] Subsystem damage changes behavior before hull destruction.
- [ ] Physics interactions authoritative, not animation-only.
- [ ] No mandatory exposition interrupts player control > text budget.
- [ ] Camera preserves player/threat/tether-payload readability.
- [ ] Every critical beat has approved VFX/audio/camera/UI/haptic behavior.
- [ ] Every critical cue has reduced-motion/flash + non-color alternatives.
- [ ] Music state + transitions follow dramatic beat graph.
- [ ] Death/failure/restart/checkpoint/abandonment paths function.
- [ ] All intended branches reachable in automated policy tests.
- [ ] Outcomes change immediate + persistent world state.
- [ ] Deterministic replay + golden telemetry pass.
- [ ] Performance passes on declared baseline at p50/p95/p99.
- [ ] No severity-1/2 gameplay/save/camera/accessibility/progression defect.
- [ ] Five consecutive clean runs produce no new warning or console error.

### Gameplay or simulation system
- [ ] One documented authoritative owner.
- [ ] Inputs, outputs, events, state, mutation permissions schema-defined.
- [ ] Pure kernel imports in Node without DOM or renderer dependencies.
- [ ] No `Math.random`, wall-clock, or unversioned environmental dependency in authoritative code.
- [ ] Named RNG stream + serialization behavior documented.
- [ ] Save/load/migration/replay/rollback/snapshot behavior defined.
- [ ] Unit tests cover ordinary cases.
- [ ] Property/fuzz tests cover invariants + invalid inputs.
- [ ] Integrated scenario test imports the actual implementation.
- [ ] No formulas duplicated into a test-only mirror.
- [ ] Performance + allocation budgets measured.
- [ ] Agent inspection + trace endpoints exist.
- [ ] Telemetry names + payloads documented.
- [ ] Failure + degradation behavior deliberate.
- [ ] Debug state cannot mutate release state accidentally.
- [ ] Superseded code path removed in same milestone.
- [ ] External references + license handling recorded.
- [ ] Interface document + examples current.
- [ ] DoD script exits nonzero on failure.

### UI panel or HUD component
- [ ] Serves one clear player decision or information priority.
- [ ] Information hierarchy understandable at a glance.
- [ ] Uses shared motion tokens + transition grammar.
- [ ] Supports keyboard/mouse/controller where applicable.
- [ ] Focus order, focus return, Escape/back, modal behavior pass.
- [ ] Screen reader labels + ARIA semantics pass.
- [ ] Text scaling doesn't clip at supported sizes.
- [ ] Contrast + color-independent state encoding pass.
- [ ] Reduced-motion + reduced-flash modes pass.
- [ ] Loading/empty/invalid/locked/insufficient-resource/success/error states exist.
- [ ] Doesn't poll or rebuild DOM when event-driven updates suffice.
- [ ] No per-frame layout thrashing.
- [ ] Responsive bounds pass at supported aspect ratios/resolutions.
- [ ] Every unfamiliar lore noun links to or unlocks a fact where appropriate.
- [ ] Input confirmation has visual + audio acknowledgement.
- [ ] Screenshot tests cover every major state.
- [ ] Interaction telemetry exists without recording sensitive free text.
- [ ] Inspectable + drivable through agent API.
- [ ] No placeholder copy or generic "Lorem space pirate."

### Audio cue
- [ ] Stable semantic cue ID.
- [ ] Declared event/switch/state/RTPC inputs.
- [ ] Transient/body/tail layers where appropriate.
- [ ] ≥3 variants or controlled procedural variation for repeated cues.
- [ ] Spatial/HRTF behavior defined.
- [ ] Near/far attenuation + culling defined.
- [ ] Occlusion/obstruction/reverb behavior defined.
- [ ] Material + damage-type variants resolve correctly.
- [ ] Bus/priority/concurrency/voice-stealing policy defined.
- [ ] Ducking + mix-snapshot interaction defined.
- [ ] Loudness + peak limits pass.
- [ ] No clipping in worst-case combat mix.
- [ ] Critical cue remains intelligible under maximum density.
- [ ] Captions or non-audio equivalent exist where gameplay-critical.
- [ ] Haptic mapping exists where useful.
- [ ] Reduced-dynamic-range/night mode behavior passes.
- [ ] CPU/node/buffer/memory budgets pass.
- [ ] Golden waveform/meter trace + gameplay capture pass.
- [ ] Source + license provenance recorded.

### Mission/NPC/narrative-content package
- [ ] All IDs + references validate.
- [ ] Canonical source + authorial provenance recorded.
- [ ] Offer/accept/active/reminder/fail/abandon/complete/aftermath text supplied where relevant.
- [ ] Conditions + consequences explicit.
- [ ] Branch reachability passes.
- [ ] No character knows undiscovered information.
- [ ] No lore contradiction or generic filler language.
- [ ] Gameplay objective + prose describe the same actual action.
- [ ] Relevant faction/market/NPC/world consequences exist.
- [ ] Localization length + reading-time budgets pass.
- [ ] Accessibility labels + pronunciation metadata exist where needed.
- [ ] Headless scenario fixture proves content can start + finish.
- [ ] Save/load at every state passes.

---

## F. Phased rollout

### Phase 0 — Structural foundations
**Wave 0A (parallel):** SG-01 (sim/replay kernel), SG-04 (asset pipeline), SG-07 (schema vocab + CLI skeleton). Resident: freeze slice scenario, metrics, event dictionary, initial input tape.
**Wave 0B:** SG-02 (dynamic physics + tether constraints), SG-05 (mission/scenario/dialogue DSL), SG-07 (validators + runtime inspection). Resident: migrate one Kestrel fixture + one 47-A scenario skeleton.
**Wave 0C:** SG-03 (combat/action/subsystem framework), SG-06 (AI/squad/director), SG-08 (semantic presentation graph). Resident: integrate continuously + delete superseded paths.

**Phase 0 exit gate:** real headless 47-A skeleton runs through actual systems; dynamic Kestrel + payload interact through real tether; authored Kestrel GLB loads through production pipeline; scenario branches validate + replay; AI can attach/contest/sever/retreat; CLI can run/inspect/tune/trace/profile/compare; save/reload preserves same replay outcome; no authoritative `Math.random`; no duplicated balance equations; no foundational acceptance failure.
**Effort:** 16–24 supergenius hours + 6–10 resident integration sessions. Phase 0 complete when evidence passes, not when 8 files exist.

### Phase 1 — Take the slice to 100%
1. **Mechanical gold:** tune flight envelopes; tether stability/readability/breakage/emergent uses; action windows + counterpulse; subsystem effects; establish 3 viable tactics.
2. **Encounter gold:** author scavenger/tug/escort roles; director pressure curve; complete 47-A branch logic; connect outcomes to faction/market/NPC/story facts; test failure/surrender/escape/restart.
3. **Presentation gold:** integrate all authored assets; finish encounter lighting/GTAO/dust volumes/decals/LUT/stable AA; tether HUD + subsystem targeting; complete semantic cue recipes; author adaptive music + final mix; complete accessibility transforms.
4. **Production gold:** 100+ deterministic seed/policy tests; adversarial save/load + action fuzzing; profile CPU/GPU/allocs/draw calls/voices/lights/particles; golden replay/images/cue trace/mix trace/telemetry; close all DoD failures; focused human playtests only after automated evidence clean.

**Phase 1 exit gate:** complete 10–12 min slice passes every DoD. A new evaluator should play only this encounter + reasonably believe the rest of SpaceFace could become an excellent commercial game.
**Effort:** 12–20 resident integration/tuning sessions, 3–6 simpler-model content batches, SG intervention only for failed structural contracts.

### Phase 2 — Expand only through proven gold packets
Expansion in complete packets, not horizontal feature sweeps. A **gold packet** = one authored encounter family + one meaningful new verb + required ships/props/environment assets + AI behavior/counterplay + mission/narrative integration + economy/faction consequences + audio/VFX/UI/accessibility support + scenario tests + performance evidence + full DoD closure.

**Recommended packet order:**
1. **Tether encounter family** — salvage rescue, cargo theft, counter-tug, capture/tow, hazard slingshot.
2. **Six authored ship identities** — Kestrel control scout, scavenger interceptor, Concord patrol fighter, Meridian recovery tug/freighter, Drift mining barge, Quiet raider; each with distinct mass/thruster geometry/subsystem topology/actions/AI/sound/silhouette.
3. **47-A narrative chain** — canonical NPC stations/contacts, mission briefs/debriefs, evidence/fact system, reactive codex, environmental clues, five-ending path integrated into actual world consequences.
4. **Causal campaign simulation** — convoy records, production/consumption nodes, named fleet operations, loss sites, shortages, faction strategic plans, contracts generated from real world-state pressure.
5. **Capital + squad combat** — wings/commands/formations, turret + subsystem priorities, capital-ship traversal + disablement, boarding/capture, mission director escalation.
6. **Advanced rendering + animation** — wider authored asset library, full rigged mechanisms, better temporal stack, GPU-driven debris + indirect draw, WebGPU/TSL evaluation, DDGI/RTGI only after measured visual need.
7. **Broader procedural world** — validated encounter grammar, sector visual grammar, background ship variation, persistent ecology + hazard simulation, seed-corpus CI.

Multiplayer deferred until authoritative command/replay + performance envelopes survive broad Phase 2 content.
**Typical Phase 2 packet:** ~4–8 resident sessions, 2–5 simpler-model content batches, at most one SG structural correction. Repeated need for structural corrections means the foundation is not actually done.

---

## G. Anti-loop guardrails
1. No new game feature lands before the 47-A slice ships.
2. The professional menu is not a backlog — only slice dependencies are current commitments.
3. One unfinished structural branch per owner. No stack of half-integrated rewrites.
4. A new path deletes its legacy predecessor in the same milestone.
5. Tests import real implementations. No copied formulas, shadow economies, alternate flight models.
6. No authoritative `Math.random`, wall clock, DOM, or renderer reference.
7. Every system runs headlessly + exposes a deterministic trace.
8. Every merge names the slice metric it is expected to improve.
9. "Compiles" and "functions" are not completion states. Completion = evidence bundle passes.
10. No bulk-content agent works before its schema, lore source, validator exist.
11. Bulk agents fill contracts; they may not invent contracts.
12. No hero ship/station/weapon/story prop ships as runtime primitive geometry.
13. No art asset ships without bevel/normal treatment, PBR maps, LODs, colliders, sockets, budgets, provenance.
14. No new UI screen exists merely to expose another system — must support a distinct player decision.
15. No unexplained lore noun in mission-critical UI — contextualize or link to a discoverable fact.
16. No procedural generator lands without validators, seed replay, provenance, failure-rate reporting.
17. No render-tech migration accepted because fashionable — must solve a measured slice defect.
18. No global camera behavior depends only on an `inCombat` flag — framing follows composition, threats, objectives, tether geometry.
19. Every cue has an importance + concurrency budget. More effects ≠ more impact.
20. Every feature includes its counterplay. A powerful mechanic without opposition is a toy, not combat depth.
21. Every world-state change records cause + evidence. Prices/wars/hostility/shortages must answer "why."
22. Every external reference enters the legal ledger before implementation begins.
23. Golden replay, telemetry, screenshots, cue traces, performance reports are CI artifacts.
24. A visual or experiential regression may block a build even when unit tests pass.
25. Expansion occurs one gold packet at a time. Nothing wide remains shallow.

---

The game hiding inside SpaceFace is not "Elite with more menus." It is a physics-driven conspiracy sim about mass, leverage, obligation, and the machinery that turns bodies into entries on a ledger. The makeover succeeds when every layer — flight, combat, economy, story, art, sound, UI, tooling — speaks that same language.
