# SpaceFace Gameplay Depth Playbook — Combined Edition

**Generated:** 2026-07-19  
**Format:** Markdown  
**Use:** Read as one document, or copy individual numbered sections into planning and coding-agent threads.

---


<!-- BEGIN FILE: README.md -->

# SpaceFace Gameplay Depth Playbook

**Purpose:** a set of self-contained, pasteable design and implementation briefs for turning SpaceFace from a collection of largely interchangeable objects and inputs into a game whose movement, combat, world activity, industry, and story reinforce one another.

**Repository context inspected:** `coldshalamov/SpaceFace`, default-branch snapshots observed around commits `cb60752c`, `c6cee0cf`, and neighboring July 2026 work. The tree is moving quickly. Every coding agent must re-read current owner files and `AGENTS.md` contracts before editing.

This package is deliberately not a fantasy wishlist. It distinguishes:

- foundational engine primitives that make many later features possible;
- low-risk content and behavior work that agents can implement now;
- experimental mechanics that need isolated prototypes;
- ideas that should be deferred because they are expensive, brittle, or mostly administrative;
- acceptance criteria designed to prevent “technically present” features that never become a player experience.

## Recommended reading order

1. **`00_NORTH_STAR_AND_DESIGN_CONSTRAINTS.md`**  
   Defines the game SpaceFace is trying to become, the progression payoff, the interaction grammar, and the non-goals.

2. **`01_ENGINE_PRIMITIVES_AND_INTERACTION_GRAMMAR.md`**  
   The critical technical substrate: collision proxies, targetable components, dynamic payloads, force fields, contextual tools, persistent site states, and NPC job controllers.

3. **`02_MASSLINE_FLIGHT_AND_PHYSICS_COMBAT.md`**  
   Concrete massline moves, orbit assistance, trackpad control alternatives, physics weapons, combat arenas, and exact controller mathematics.

4. **`03_LIVING_WORLD_SECTORS_PLANETS_AND_NPC_JOBS.md`**  
   How to make sectors spatially distinct and alive through activity pockets, traffic routes, orbital operations, jobs, crime, hazards, and landmarks.

5. **`04_WRECK_CATHEDRAL_VERTICAL_SLICE.md`**  
   A complete agent-ready specification for one monumental wreck adapted to SpaceFace’s top-down plane, current input vocabulary, and present engine limitations.

6. **`05_AUTOMATION_PROGRESSION_AND_ENDGAME.md`**  
   Answers “revenue streams for what?” by connecting Asteroid Ops to deployables, infrastructure, mobility, world transformation, settlement, and regional control.

7. **`06_STORY_LEDGER_AND_IMAGE_PIPELINE.md`**  
   A non-blocking, non-branch-pruning story system using brief flight fragments, illustrated ledger pages, maps, evidence, and persistent discoveries.

8. **`07_AGENT_EXECUTION_CONTRACT.md`**  
   The anti-slop contract, prompt templates, visual terminology, evidence requirements, and forbidden shortcuts.

9. **`08_PRIORITIZED_ROADMAP_FOR_THREE_AGENTS.md`**  
   Dependency-aware build waves and a safe division of labor for three coding agents.

10. **`09_PASTEABLE_FEATURE_BRIEFS.md`**  
    A large idea bank. Each section is written to stand alone when pasted into another Pro-mode or coding-agent conversation.

11. **`10_CURRENT_REPO_AUDIT_AND_GAP_MAP.md`**  
    A grounded map of what already exists, what is only semantic or test-level depth, what should be protected, and which missing seams block the game.

12. **`11_PROMPTING_GLOSSARY_AND_TECHNIQUE_LEXICON.md`**  
    Concrete game-dev, control, physics, rendering, UI, AI, persistence, testing, and image-generation vocabulary for writing prompts that close the agents’ easiest escape hatches.

13. **`12_MASTER_AGENT_HANDOFF_TEMPLATE.md`**  
    A ready-to-paste audit, planning, implementation, anti-placeholder, and evidence template for turning any individual brief into a controlled coding-agent task.

## The central diagnosis

SpaceFace already contains more design and system machinery than the current player experience reveals. The repository includes named zones, regional ecology, unique-wreck provenance, asteroid-site production, massline throw assistance, tumbles, impulse charges, wing orders, and other deep concepts. Yet the live game often compresses these concepts into one of four player-visible outcomes:

1. a circle or sphere with a label;
2. an NPC that wanders and sometimes shoots;
3. a beam that yields `+1` material;
4. a station that opens a screen.

The playbook treats this as a **translation failure** between semantic systems and embodied gameplay. The next major gains come from making existing and future systems physical, spatial, legible, and combinable—not from adding more ledgers or more names.

## How to use an individual brief

Paste one brief into a planning model and require it to return:

1. an implementation plan against the current repository;
2. an owner/file map;
3. a minimal vertical slice;
4. deterministic tests;
5. a default-route browser capture plan;
6. explicit anti-placeholder criteria;
7. a list of existing systems reused rather than duplicated.

Then paste the expanded plan into the coding session together with `07_AGENT_EXECUTION_CONTRACT.md`.

## Truth hierarchy

In this project, use the following order:

1. **What a player can reach on the normal route**
2. **What current browser/Electron footage shows**
3. **What runtime telemetry proves**
4. **What deterministic tests prove**
5. **What code exists**
6. **What a design document claims**

A sophisticated data table feeding an invisible or generic object is not a sophisticated game feature. A green unit test is not a player experience. A routed GLB with an unrelated spherical collider is not a physical structure.

<!-- END FILE: README.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 00_NORTH_STAR_AND_DESIGN_CONSTRAINTS.md -->

# 00 — Product North Star and Design Constraints

## 1. Product thesis

SpaceFace should become a **top-down, physics-forward space sandbox about turning motion, matter, and infrastructure into control**.

The player begins as one small ship with a few direct verbs:

- thrust and steer;
- aim and fire;
- attach and release a massline;
- scan;
- extract;
- carry.

The player does not merely improve the numerical efficiency of those verbs. Progress gradually lets the player:

- manipulate the motion of other bodies;
- exploit terrain, gravity, and hazards;
- build machinery inside asteroids;
- automate extraction and fabrication;
- create routes and moving traffic;
- assemble stations and orbital infrastructure;
- alter how sectors function;
- turn a sparse hostile frontier into a network that visibly exists because the player built it.

The arc is not “weak gun → stronger gun.” It is:

> **pilot → operator → engineer → network builder → regional power**

This is both the progression system and the story.

## 2. What the game should not become

The following systems are not forbidden forever, but they are poor default investments for the current game.

### 2.1 No general crew-management layer

Crew salaries, morale meters, food, shift schedules, and staff buffs would add accounting without adding a new embodied verb. Named people can matter as contacts, pilots, rivals, witnesses, or specialists without becoming a payroll simulator.

A crew feature should only be admitted if it creates a visible world action that cannot be achieved more cleanly another way—for example, a named salvager physically joining an operation—not because “space games have crew.”

### 2.2 No broad ammunition chore

Standard weapons should use heat, energy, cooldowns, positioning, or state. Consumable munitions are appropriate only where scarcity creates a deliberate strategic choice:

- torpedoes;
- impulse charges;
- rare physics ordnance;
- deployable gravity devices;
- siege weapons.

They should be manufactured or replenished in useful batches. The player should not have to visit a shop because ordinary bullets ran out after two encounters.

### 2.3 No maintenance whack-a-mole

A refinery without input may idle. A route without cargo may remain dormant. A damaged site may produce less until repaired. The default penalty for looking away should not be constant decay.

Use **events**, not hygiene:

- a convoy is attacked;
- a storm disrupts a relay;
- a high-signature site attracts a raid;
- an experimental machine faults;
- a route becomes politically contested.

Events create stories and decisions. Per-minute drains create chores.

### 2.4 No full-scale cutscene pipeline

Blender cinematics, character animation, lip sync, and orchestral scoring are production disciplines of their own. Static illustrated evidence, animated UI composition, camera moves over live scenes, and short in-engine tableaus offer far better return for autonomous agents.

### 2.5 No dialogue-choice maze

The player should not be forced to read paragraphs and select from three responses, nor should one click permanently delete half the content.

Story threads should be additive and discoverable. Player actions may alter context, order, rewards, and world state without locking the player out of whole arcs.

### 2.6 No fleets before the world earns them

Fleet command is not a substitute for a living world or competent navigation. A fleet multiplies AI defects and screen clutter. Build purposeful NPC jobs, stable movement controllers, and interesting physical battle spaces first.

### 2.7 No realistic N-body simulation as a prerequisite

A stylized gravity well that creates readable slingshots can be excellent. Full orbital mechanics, arbitrary moving frames, and physically scaled solar systems are unnecessary for the first useful version. Use one dominant gravity source, softened/capped acceleration, analytic satellite orbits, and trajectory previews.

## 3. The actual deficit: interaction bandwidth

The player’s present experience is dominated by a small set of low-information actions:

- `LMB`: repeated damage;
- `RMB`: repeated extraction;
- `F`: attach or detach;
- `E`: open a screen;
- movement: go closer or farther.

The answer is not necessarily twenty new buttons. The answer is to make the existing input vocabulary operate over richer states and physical targets.

A compact interaction grammar can support a large game:

| Primitive | Meaning |
|---|---|
| **Aim** | Select an entity or one of its components |
| **Tap** | Immediate action or mode change |
| **Hold** | Continuous work, charge, tracking, or stabilization |
| **Release** | Commit a stored trajectory, charge, or constraint |
| **Constraint** | Massline relationship between bodies |
| **Impulse** | Instant change in momentum |
| **Field** | Continuous force or condition within space |
| **Component state** | Intact, damaged, disabled, severed, repaired, active |
| **Placement** | Put a device, structure, anchor, or route node into the world |
| **Persistence** | The object or region remembers what happened |

The same right mouse button can perform distinct but coherent industrial-beam actions if the target is explicit and the presentation is honest:

- geological face → extract;
- brace → cut;
- damaged relay → weld;
- salvage joint → dismantle;
- sealed panel → heat and breach.

The input remains simple. The world acquires more verbs.

## 4. Design law: unlock verbs, not percentages

Every major progression tier should unlock at least one of these:

- a new way to move;
- a new way to alter another body’s motion;
- a new kind of target component;
- a new deployable;
- a new infrastructure operation;
- a new way to automate a previous manual task;
- a new way to alter a sector;
- a new way to discover hidden information.

Numerical upgrades can support these verbs, but they cannot be the payoff by themselves.

Bad progression:

- +12% laser damage;
- +15% mining speed;
- +10 cargo;
- +8% drone income.

Better progression:

- an impulse cannon that moves ships and debris;
- a survey suite that reveals component topology;
- a massline head that can attach to detachable modules;
- a gravity puck that bends projectiles;
- a shuttle dock that turns abstract exports into visible traffic;
- an acceleration ring that changes regional travel;
- a station assembly frame that makes an asteroid cluster become a new destination.

## 5. The combinatorial target

A useful mechanic should ideally interact with at least three existing systems.

Example: **detachable wreck reactor**

- scanner locates it;
- industrial beam cuts its braces;
- massline pulls it free;
- physics lets it collide or be thrown;
- cargo/site systems accept it as an input;
- ledger reveals its history;
- fabrication turns it into a unique machine.

That is one asset and one state machine producing many consequences.

A poor mechanic has one input and one output:

- hold button;
- wait;
- receive credits.

## 6. The “toy” test

A core mechanic deserves to be central only if a player can enjoy it without a mission reward.

Ask:

- Would the player experiment with this in an empty arena?
- Does it produce surprising but understandable outcomes?
- Can mastery improve the result?
- Does the environment change what is possible?
- Can two mechanics combine into a third behavior?
- Is failure interesting rather than merely slower?

The massline is currently the closest thing SpaceFace has to a toy. The next work should strengthen it and add neighboring toys—impulses, fields, component detachment, collision geometry, gravity—not bury it under more menus.

## 7. The “world exists without me” test

Every populated sector should display at least one causal loop that would continue if the player did nothing:

- miners extract;
- cargo moves to a refinery;
- couriers leave a station;
- patrols inspect a lane;
- pirates stalk high-value traffic;
- scavengers strip battle debris;
- construction drones assemble a frame;
- survey craft orbit an anomaly;
- satellites relay data;
- orbital launchers fire cargo capsules.

The player may observe, assist, protect, rob, redirect, or destroy these loops. The world is not decoration around the protagonist; the protagonist is an opportunist inside a running machine.

## 8. Sector identity law

A sector is not a list of object categories. It is a spatial proposition.

Every sector must have:

1. **one sentence of identity** that no other sector can claim;
2. **one dominant silhouette** visible before arrival;
3. **two to four separated activity pockets** rather than one central pile;
4. **at least one route** visibly connecting pockets;
5. **one local mechanical condition** that changes play;
6. **one persistent consequence** the player can cause.

Examples:

- “The customs gauntlet where every cargo route narrows through a scanning ring.”
- “The carrier graveyard whose drifting hull slabs form the battle terrain.”
- “The broken moon refinery that the player can restart and eventually own.”
- “The storm system where wrecks surface only during quiet windows.”
- “The construction frontier where a station visibly grows over the campaign.”

Not every sector needs every system. Deliberate absence is identity.

## 9. Story law

Story should be delivered in layers that do not block movement.

### Layer 1: flight fragments

Eight to twenty words, shown briefly when an event occurs.

> POWER RELAY 3 ANSWERS. THE OTHER TWO WERE CUT FROM INSIDE.

### Layer 2: physical evidence

A changed object, component, route, wreck, cargo manifest, black box, or NPC behavior.

### Layer 3: optional illustrated ledger

A page the player may open later: image, map, recovered record, and concise prose.

No response menu is required. No story thread must be deleted because the player clicked the “wrong” line.

## 10. Industry law

Asteroid Ops is not merely a source of passive credits. Its output should feed the exterior world.

The existing contact-ring and site-production thesis is strong:

- consuming geology now versus preserving it for long-term production;
- building machines into the shape the player excavated;
- aggregate logistics rather than item spam;
- production moving from manual to automated;
- station assembly as the visible exterior payoff.

Preserve that spine.

The industrial chain should create:

- construction modules;
- courier pods and shuttle drones;
- deployable physics tools;
- sensor and navigation infrastructure;
- defense devices;
- station components;
- orbital machines;
- specialized massline heads;
- rare ordnance;
- eventually ships and autonomous construction systems.

Credits remain useful, but matter should become capability.

## 11. Assists versus automation

Physics assists are acceptable when they translate an unambiguous human intention into actuator commands the player could theoretically perform.

Good assist:

- while tethered to a massive anchor, holding forward plus left clearly means “orbit left”; the controller manages yaw and a small radial correction while respecting thrust, line tension, and acceleration limits.

Bad assist:

- pressing left teleports the ship to the ideal orbital path or injects unexplained velocity.

The rule:

> **Shape input; do not script outcomes.**

A useful assist computes desired heading, thrust mix, or timing, then acts through the same force/torque pipeline as manual flight.

## 12. Scope discipline

The project should grow through vertical slices.

A vertical slice is not “the data definitions exist.” It includes:

- a player-visible object at correct scale;
- aligned collision or interaction geometry;
- normal-route reachability;
- at least one meaningful input;
- a persistent state change;
- save/load;
- presentation;
- telemetry;
- a current browser capture.

Build one excellent wreck before twelve wreck definitions. Build one sector that feels alive before expanding all twenty-four. Build one controllable convoy robbery before a faction-wide crime system.

## 13. Priority filter

Score each proposed feature on five axes from 0–3:

1. **New verb:** does it create a genuinely new action?
2. **Composability:** how many existing systems can use it?
3. **Visibility:** is it obvious in normal play?
4. **Agent feasibility:** can coding/image agents implement it with current tools?
5. **Foundation value:** does it unlock several future features?

Subtract:

6. **AI dependence:** does it rely on sophisticated autonomous behavior?
7. **UI burden:** does it require a new complex screen?
8. **content burden:** does it need large bespoke art/audio/cinematic production?
9. **systemic risk:** does it touch core physics, saves, and many owners at once?

The highest-value work tends to be:

- compound collision proxies;
- component targeting;
- force/impulse kernels;
- simple NPC job routes;
- one top-down wreck field;
- orbit assistance;
- an impulse weapon;
- separated sector pockets;
- visible exterior consequences of Asteroid Ops.

## 14. Compact product north star

When uncertain, choose the change that makes this sentence more true:

> **I move through a galaxy that is already working, use momentum and machinery to intervene in it, and gradually build a physical network that changes what the galaxy can do.**

<!-- END FILE: 00_NORTH_STAR_AND_DESIGN_CONSTRAINTS.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 01_ENGINE_PRIMITIVES_AND_INTERACTION_GRAMMAR.md -->

# 01 — Engine Primitives and Interaction Grammar

## 0. Why this document exists

The most dangerous development pattern in SpaceFace is to ask for a new *thing* before the engine has a way for that thing to be physically different.

Ask for a wreck without component geometry and the agent makes a glowing ball labeled “wreck.”  
Ask for a station without aligned collision and the agent makes a visible hull wrapped around one unrelated spherical core.  
Ask for a miner without a job controller and the agent gives an ordinary wandering NPC a `role: "miner"` field.  
Ask for an anomaly without field mechanics and the agent makes a colored damage circle.

The engine needs a compact set of reusable primitives that make later content difficult to fake.

This document defines those primitives in dependency order.

---

## 1. Current constraints observed in the repository

The following observations are important because they explain present failure modes.

### 1.1 Collision is effectively circular

The custom physics layer documents broad-phase and narrow-phase as circle/circle collision. Static sweep tests use a segment against the sum of the ship radius and target radius. Stations and asteroids are treated as circular static bodies.

The optional Rapier observer likewise creates one `Ball(e.radius)` collider per entity. It does not derive collision from station or wreck geometry.

Consequences:

- a long station collides as one disk;
- a hollow ring has a solid core;
- a split wreck cannot contain navigable channels;
- docking is geometrically unrelated to the visible bay;
- projectile cover cannot match art;
- “fly through the wreck” is impossible unless the visual happens to live outside its own circular proxy.

This is foundational, not cosmetic.

### 1.2 World semantics exceed world embodiment

The repository contains named zones, ecology profiles, unique-wreck provenance, salvage law, and persistent aftermath. Much of that ultimately materializes as generic entities with one position, one radius, and one interaction.

### 1.3 The input layer already carries useful state

SpaceFace already has:

- independent weapon aim;
- raw movement axes;
- a massline state;
- scanner pulses;
- deployable/charge actions;
- an auto-target path;
- target IDs;
- world-space cursor projection.

The correct strategy is usually to improve what those actions can act upon rather than add ten new keys.

---

# Foundation A — Aligned collision geometry

## 2. Goal

A structure’s physical footprint must approximately match its visible footprint, including intentional gaps, channels, and docking approaches.

Do **not** begin with full triangle-mesh collision. The game is top-down and needs readable, stable, performant 2D/2.5D collision—not a general rigid-body CAD solver.

## 3. Two-stage implementation

### Stage A1: multi-circle collision proxies

This is the lowest-risk useful step because the current collision system already knows circles.

Represent one visible structure with:

- one parent visual entity;
- several invisible static collision-proxy entities;
- each proxy positioned in parent-local coordinates;
- proxies excluded from targeting, radar, missions, loot, and rendering;
- parent/child identity for cleanup and save reconstruction.

Example:

```js
data: {
  collisionProxyManifest: {
    version: 1,
    parts: [
      { id: 'port_spine_1', x: -140, z: -40, radius: 42 },
      { id: 'port_spine_2', x: -70,  z: -40, radius: 42 },
      { id: 'engine_block', x: -230, z: 20,  radius: 70 },
      { id: 'starboard_hull_1', x: 65, z: 55, radius: 46 },
      { id: 'starboard_hull_2', x: 135, z: 55, radius: 46 }
    ]
  }
}
```

A chain of circles can approximate long slabs while leaving real gaps. It is not elegant, but it immediately enables a top-down wreck field and honest docking corridors.

Required proxy flags:

```js
{
  type: 'collision_proxy',
  collides: true,
  renderable: false,
  targetable: false,
  radarVisible: false,
  parentWorldObjectId: 'wreck_cathedral_01',
  collisionMask: Masks.SHIP | Masks.PROJECTILE | Masks.PAYLOAD
}
```

**Important:** broad-phase queries and target pickers must ignore proxies unless performing collision.

### Stage A2: compound 2D shapes

Once the vertical slice proves value, replace proxy chains or supplement them with a compound-shape manifest:

- circle;
- capsule/segment with radius;
- oriented box;
- convex polygon only if necessary.

Recommended data:

```js
collision: {
  kind: 'compound2d',
  boundsRadius: 420,
  parts: [
    {
      id: 'engine_block',
      shape: 'obb',
      center: { x: -220, z: 0 },
      halfExtents: { x: 62, z: 95 },
      rotation: 0.08,
      material: 'wreck_hull'
    },
    {
      id: 'cargo_spine',
      shape: 'capsule',
      a: { x: -120, z: 40 },
      b: { x: 160, z: 40 },
      radius: 26,
      material: 'wreck_hull'
    }
  ]
}
```

The broad phase still uses `boundsRadius`. Narrow phase tests the player circle or projectile segment against each part.

Minimum algorithms:

- circle–circle;
- circle–capsule: closest point on segment;
- circle–OBB: transform point to box-local frame, clamp, measure distance;
- swept circle–capsule;
- swept circle–expanded OBB.

For Rapier, attach several colliders to one fixed rigid body:

- `ColliderDesc.ball`;
- `ColliderDesc.capsule`;
- `ColliderDesc.cuboid`.

Do not use trimesh collision until profiling and play prove it necessary.

## 4. Collision and visual source of truth

A recurring failure is separate art and physics authoring that drift apart.

Every hero structure should have one manifest that names:

- visual asset;
- local transform;
- collision proxy parts;
- targetable component anchors;
- docking/trigger volumes;
- massline anchors;
- LOD assets;
- gameplay scale.

Example:

```js
export const WORLD_OBJECTS = {
  wreck_cathedral_01: {
    visual: {
      glb: 'assets/world/wreck_cathedral/wreck_cathedral.glb',
      scale: 1,
      rotation: 0
    },
    collision: { /* parts */ },
    components: [ /* anchors */ ],
    triggers: [ /* scan, dock, extraction */ ],
    tetherAnchors: [ /* local positions */ ]
  }
};
```

A Blender export script may emit a JSON sidecar from named empties:

- `COLLIDER_CIRCLE_*`;
- `COLLIDER_BOX_*`;
- `COMPONENT_*`;
- `DOCK_MOUTH`;
- `DOCK_CAPTURE`;
- `TETHER_*`.

This is much safer than having an agent guess offsets by eye in JavaScript.

## 5. Docking as corridor capture, not core-bonking

A docking structure needs two non-solid volumes:

1. **approach corridor** — a visible lane aligned with the bay;
2. **capture volume** — the region where docking can complete.

Recommended conditions:

- player inside capture volume;
- speed below threshold;
- heading within a generous cone;
- no hostile lock or active combat constraint;
- optional `E` confirmation once “DOCK READY” appears.

The player should not have to collide with the station.

Example:

```js
dock: {
  mouth: { local: { x: 180, z: -40 }, radius: 80 },
  corridor: {
    start: { x: 180, z: -40 },
    end: { x: 320, z: -40 },
    halfWidth: 55
  },
  capture: { center: { x: 210, z: -40 }, radius: 36 },
  maxSpeed: 42,
  headingToleranceDeg: 65
}
```

Acceptance:

- collision proxies do not overlap the corridor;
- the bay is visible from normal gameplay zoom;
- approaching through the visible opening works;
- approaching through a wall does not;
- docking never requires impact.

## 6. Collision acceptance contract

A collision feature is not done until all are true:

- debug overlay draws every proxy over the live visual;
- no proxy center is visibly detached from the object it represents;
- at least one intended gap is traversable;
- at least one visible solid wall blocks the player;
- projectiles collide with the same major parts;
- docking path is unobstructed;
- save/reload reconstructs proxies;
- proxies never appear on radar, target lists, mission boards, or loot systems;
- a headed browser capture shows traversal and collision;
- a scripted route tests both blocked and open paths.

---

# Foundation B — Targetable components

## 7. Goal

Entities and sites need sub-objects that can be scanned, damaged, cut, repaired, disabled, detached, activated, or recovered.

Without component targeting, every interaction collapses into “affect the whole object until a number reaches zero.”

## 8. Component data model

```js
components: [
  {
    id: 'brace_a',
    label: 'PORT CARGO BRACE',
    role: 'cuttable',
    localPos: { x: -80, z: 46 },
    radius: 18,
    state: 'intact',
    progress: 0,
    maxProgress: 100,
    toolTags: ['industrial_beam'],
    reveal: 'scan',
    onComplete: 'detach:cargo_module_a'
  },
  {
    id: 'relay_3',
    label: 'EMERGENCY POWER RELAY',
    role: 'repairable',
    localPos: { x: 115, z: -30 },
    radius: 20,
    state: 'offline',
    requirements: { cmdty_control_unit: 1 },
    onComplete: 'site:powerRestored'
  }
]
```

Component fields should be JSON-safe and persisted in parent world state. Runtime may cache world positions.

## 9. Picking components

Use screen-space picking because the game is top-down and the cursor is already projected.

Suggested order:

1. explicit component under cursor on selected/hovered entity;
2. nearest revealed component within screen radius;
3. parent entity;
4. existing nearest-target fallback.

Algorithm:

- transform each component local point into world;
- project world point to screen;
- compute distance to pointer;
- choose smallest distance under `componentPickRadiusPx`;
- bias selected parent and currently active component;
- never choose hidden/unscanned components.

The target panel should show:

- parent name;
- component label;
- state;
- available verb;
- short consequence.

Example:

> ISC VIGILANT  
> PORT CARGO BRACE · INTACT  
> RMB CUT · FREES CARGO SPINE

No modal screen is required.

## 10. Component state machine

Use a small standard vocabulary:

- hidden;
- revealed;
- intact;
- damaged;
- disabled;
- offline;
- active;
- severed;
- detached;
- repaired;
- exhausted.

Do not invent bespoke booleans for every feature.

Events:

```js
component:revealed
component:workStarted
component:progress
component:stateChanged
component:detached
component:repaired
```

Every state change carries:

- parent ID;
- component ID;
- source/tool;
- actor ID;
- world position;
- previous/next state;
- tick/sim time.

This lets story, VFX, audio, missions, and persistence listen without owning component logic.

## 11. Component visuals without mesh destruction

Agents may claim component mechanics require deformable meshes. They do not.

Use:

- named child nodes in GLB;
- local meshes toggled or swapped;
- emissive/material state changes;
- particle/spark effects;
- detached replacement entity;
- scorch decal;
- cable or brace line removed;
- debris burst.

A component can disappear from the parent and spawn as a dynamic payload. That is enough to make the world feel physical.

## 12. Ship subsystem application

Once stable on wrecks, components can deepen combat:

- engines: reduce acceleration/boost;
- RCS: reduce turn/strafe authority;
- weapons: disable one mount;
- sensors: reduce lock/scan;
- power: increase heat or reduce shield regeneration;
- cargo pods: detach loot;
- massline node: alter tether resistance.

Do not require pixel-perfect component aim in a frantic fight. Use generous screen-space pick radii, target cycling, and scan reveal.

---

# Foundation C — Contextual industrial beam

## 13. Goal

RMB should remain one learnable tool input while gaining several target-dependent industrial verbs.

The beam must stop being “the same reddish tube plus a different toast.”

## 14. Target-context resolver

One pure function decides the action:

```js
resolveIndustrialBeamAction(state, actor, target, component)
```

Return one of:

- `extract_geology`;
- `cut_joint`;
- `dismantle_component`;
- `repair_component`;
- `heat_seal`;
- `stabilize_reactor`;
- `none`.

Priority:

1. explicit revealed component under cursor;
2. selected component;
3. active tethered mineable;
4. ordinary mineable target;
5. no action.

The resolver does not apply effects. It provides intent to the owning system.

## 15. Work model

Use continuous work with clear progress and interruptibility.

```js
workRate =
  tool.baseRate
  * rangeFalloff
  * stabilityMultiplier
  * targetMaterialMultiplier
  * powerRatio
```

Possible stability inputs:

- target relative velocity;
- line tension if tethered;
- beam contact continuity;
- angle to work face.

Do not overcomplicate the first version. One useful variation is enough:

- tethered/stable target: 1.0 rate;
- moving target: 0.55 rate;
- out of range or occluded: no progress.

## 16. Beam presentation

Do not render the primary industrial beam as HTML/CSS.

Recommended world-space rendering:

- thin bright core line or cylinder;
- soft outer glow using an additive billboard strip or shader;
- constant apparent screen thickness;
- impact sprite and directional sparks;
- target material response: heat glow, cut line, debris;
- occlusion by physical collision proxy;
- endpoint fixed to the selected component, not arbitrary object center;
- beam noise concentrated near impact, not gross whole-beam pulsing;
- reduced-motion mode removes rapid noise but preserves contact clarity.

The outer glow must not merely be a second larger translucent tube with synchronized scaling.

## 17. Beam feedback

Display:

- verb label near reticle: `CUTTING`, `WELDING`, `EXTRACTING`;
- local progress ring;
- component temperature or stability only if it matters;
- completion state change in the world;
- no repeated `+1 Iron Ore` spam for non-geology actions.

---

# Foundation D — Dynamic payloads and detachable parts

## 18. Goal

The massline needs interesting movable bodies. The world needs objects that can be separated from larger sites, carried, thrown, lost, installed, or used as evidence.

## 19. Payload definition

```js
{
  type: 'payload',
  radius: 24,
  mass: 1800,
  collides: true,
  data: {
    payloadKind: 'reactor_assembly',
    sourceSiteId: 'wreck_cathedral_01',
    sourceComponentId: 'reactor_mount',
    tetherable: true,
    towable: true,
    installTags: ['power_source', 'salvage_reactor'],
    cargoEquivalent: null,
    visualRef: 'reactor_assembly_a'
  }
}
```

Not every payload belongs in the cargo hold. Large objects should remain physical until delivered to an extraction or installation zone.

## 20. Lifecycle

1. component becomes severed;
2. parent visual hides attached module;
3. dynamic payload spawns at exact anchor;
4. payload receives inherited velocity plus bounded separation impulse;
5. player can tether, push, tow, or throw it;
6. entering a valid receiver zone consumes or installs it;
7. persistence records detached/installed/lost state.

## 21. Receiver zones

Examples:

- salvage tug capture field;
- station cargo crane;
- asteroid Massline Core socket;
- mission extraction beacon;
- orbital construction frame;
- black-market handoff.

Receiver zones should be visible structures, not invisible coordinates.

## 22. Failure cases

- payload drifts away: bearing remains on map;
- payload destroyed: alternate salvage or recovery thread;
- player leaves sector: persist pose/velocity or snap to a bounded recovery record;
- payload blocks docking: cleanup/recovery rules;
- multiple saves: stable world record identity.

---

# Foundation E — Force and field kernel

## 23. Goal

One deterministic physics service should power:

- explosive knockback;
- recoil weapons;
- gravity wells;
- tractor/repulsor pulses;
- debris currents;
- ion storms;
- mass drivers;
- atmospheric pull;
- vortex anomalies;
- cargo launchers.

Without a common kernel, every agent will write another direct `vel.x += ...` special case.

## 24. API

```js
combatPhysics.applyImpulse(entityId, impulse, provenance)

forceFields.applyRadialImpulse({
  center,
  radius,
  impulse,
  falloff: 'linear' | 'quadratic' | 'smoothstep',
  filters,
  sourceId,
  affectProjectiles,
  conserveWithSource
})

forceFields.register({
  id,
  kind: 'gravity' | 'vortex' | 'current' | 'repulsor',
  center,
  radius,
  strength,
  falloff,
  durationS,
  sourceId,
  filters
})
```

Every application should flow through the physics owner, with provenance.

## 25. Determinism and ordering

- query the spatial hash;
- collect candidate IDs;
- sort by stable entity ID before applying;
- use sim time;
- no wall-clock randomness;
- no render-driven force;
- cap acceleration/impulse;
- emit one event per affected body or a bounded aggregate event.

## 26. Mass response

Decide explicitly whether a feature applies:

- **force**: acceleration decreases with mass naturally;
- **impulse**: velocity change decreases with mass;
- **scripted velocity delta**: avoid except bounded assists.

For an explosion:

```text
J(d) = J0 × smoothstep(1 - d / R)
Δv = J(d) / mass
```

For a gravity field:

```text
a(r) = min(a_max, μ / (r² + ε²))
direction = toward center
```

## 27. Player asymmetry

SpaceFace may preserve the existing rule that physical impact does not directly damage the player while still allowing motion, shield flicker, camera trauma, or temporary control disruption.

This makes physics weapons usable as mobility tools without making experimentation suicidal. Enemy bodies may take impact/tumble damage.

The asymmetry must be explicit and tested, not an accident.

---

# Foundation F — Persistent world-object state

## 28. Goal

A site must remember what the player did and visibly materialize that state.

## 29. Standard world-object record

```js
{
  schemaVersion: 1,
  worldObjectId: 'wreck_cathedral_01',
  sectorId: 'sector_io_reach',
  state: 'partially_recovered',
  components: {
    brace_a: 'severed',
    brace_b: 'intact',
    power_relay_1: 'active',
    reactor_mount: 'detached'
  },
  payloads: {
    reactor_assembly: { state: 'in_world', recordId: 'payload_reactor_01' }
  },
  discoveries: ['log_bridge_02', 'blueprint_mass_driver'],
  updatedTick: 123456
}
```

## 30. Visual projection

A pure projection maps record to visuals:

- intact model nodes visible;
- cut braces hidden;
- power emissives enabled;
- detached module absent;
- scorch decals added;
- stripped version selected;
- construction stage selected.

The visual state must be reconstructible after save/load without replaying every event.

## 31. Persistent consequences

Good state changes:

- a route opens;
- traffic density changes;
- a station frame advances;
- a wreck becomes stripped;
- a satellite constellation begins transmitting;
- a mine field depletes or becomes automated;
- a customs checkpoint changes ownership;
- a planet receives an orbital installation.

Avoid invisible “+5 regional stability” as the only result.

---

# Foundation G — Shared interaction recipes

## 32. Goal

Agents should author new sites largely through data rather than new one-off systems and new UI screens.

## 33. Recipe model

```js
{
  id: 'cut_wreck_brace',
  targetRole: 'cuttable',
  input: { action: 'industrialBeam', mode: 'hold' },
  prerequisites: {
    revealed: true,
    toolTag: 'industrial_beam',
    maxRelativeSpeed: 80
  },
  progress: {
    baseSeconds: 4,
    resetOnBreak: false,
    decayPerSecond: 0.1
  },
  completion: {
    state: 'severed',
    emit: 'component:detached',
    spawnPayloadRef: 'cargo_spine_a'
  },
  presentation: {
    verb: 'CUT',
    activeLabel: 'CUTTING BRACE',
    completeLabel: 'BRACE SEVERED'
  }
}
```

The recipe system handles:

- intent resolution;
- work progress;
- interruption;
- requirements;
- completion event;
- basic feedback.

Specific systems still own credits, cargo, reputation, damage, and site records.

## 34. Why recipes matter

With this one grammar, agents can make:

- wreck braces;
- disabled relays;
- satellite repairs;
- anomaly alignment nodes;
- cargo pod clamps;
- refinery valves;
- defense-array emitters;
- claim beacons;
- orbital harvester couplings.

The content differs because the target, state change, visual result, and larger system differ—not because every object gets bespoke input code.

---

# Foundation H — NPC job controller

## 35. Goal

NPCs should look different because they are doing different jobs, not because their HUD labels differ.

Combat AI should not own ordinary work.

## 36. Job state machine

```js
{
  jobId: 'miner_ceres_014',
  role: 'miner',
  phase: 'work',
  originId: 'station_ceres',
  destinationId: 'field_ceres_1',
  routeId: 'route_ceres_refinery',
  cargo: { cmdty_ore_iron: 18 },
  scheduleSeed: 18271,
  phaseStartedAt: 540.2,
  threatPolicy: 'flee_to_patrol'
}
```

Common phases:

- spawn/commission;
- depart;
- transit;
- approach;
- work;
- load;
- return;
- unload;
- loiter;
- flee;
- resume.

## 37. Movement controller

Use a simple non-combat navigation controller:

- waypoint/route following;
- arrival steering;
- speed matching;
- separation;
- obstacle avoidance;
- docking approach;
- analytic orbit/loiter paths.

Update at a modest cadence such as 5–10 Hz. Do not invoke strategic combat planning every frame.

When threatened:

1. pause job state;
2. hand intent to combat doctrine;
3. resolve fight/flee;
4. resume, abort, or reroute.

## 38. Visible work signatures

A job is not real until its work is visible.

Miner:

- travels to field;
- holds position near a rock;
- emits a mining beam;
- fills visible cargo state;
- returns to refinery.

Hauler:

- loads at one site;
- carries a scan-readable manifest;
- follows a route;
- unloads at another.

Scavenger:

- visits a wreck;
- scans;
- attaches to a chunk;
- tows it away or strips it.

Survey craft:

- follows an orbital or triangular scan path;
- emits pulses;
- reveals or marks anomalies.

Construction drone:

- carries a visible module;
- moves to a frame;
- module snaps into place.

## 39. Offscreen virtualization

When the player is absent:

- store job phase and normalized progress;
- advance statistically using sim time;
- resolve bounded risks deterministically;
- on materialization, place the craft along its real route at the appropriate phase;
- never spawn a convoy from nowhere within the player’s immediate view.

This connects living-world simulation to actual traffic without simulating every ship continuously.

## 40. Player interventions

The same job architecture enables:

- escort;
- robbery;
- inspection;
- rescue;
- sabotage;
- following a smuggler;
- stealing a cargo pod;
- defending construction;
- buying route information;
- repairing a stranded ship.

No dialogue tree is required.

---

# Foundation I — Gravity and orbital motion

## 41. Goal

Create readable top-down gravity interactions without importing an astrophysics dissertation into the codebase.

## 42. First useful version

One static dominant body:

```js
gravity: {
  radius: 420,
  atmosphereRadius: 510,
  influenceRadius: 2100,
  mu: 12_000_000,
  softening: 180,
  maxAcceleration: 42
}
```

At each physics step:

```text
r = position - planet
a = -normalize(r) × min(a_max, μ / (|r|² + ε²))
```

Affects:

- ships;
- drones;
- large payloads;
- optionally projectiles.

Does not affect:

- station anchors;
- the planet;
- analytic satellites;
- ordinary decorative debris unless tagged.

## 43. Analytic orbiters

Satellites and orbital stations should initially use authored analytic paths:

```text
angle(t) = angle0 + ωt
position = planet + radius × [cos(angle), sin(angle)]
```

This prevents numerical drift and synchronization problems. They may materialize as kinematic bodies with velocity derived from the analytic path.

## 44. Trajectory preview

Gravity is only fun when the player can predict it.

Near a gravity body, render a short projected path:

- integrate current position/velocity using the same gravity function;
- 90–180 points;
- fixed preview timestep;
- recompute 8–12 Hz;
- stop at atmosphere or preview horizon;
- color/shape changes near collision;
- reduced-motion mode keeps a static path.

This makes slingshots learnable.

## 45. Atmosphere interaction

Crossing the atmosphere radius:

- increasing plasma trail;
- screen-space heat wake;
- audio/rumble;
- escalating drag and heat;
- enemy ships may burn and break apart;
- player receives warning and recoverable danger before destruction.

Do not make the first prototype a one-frame kill wall.

## 46. Gravity acceptance

- one-body determinism;
- no energy explosion from softening boundary;
- stable analytic orbiters;
- visible trajectory preview;
- at least one player slingshot route faster than straight thrust;
- at least one impulse/tether interaction can push an enemy into the atmosphere;
- no full N-body interactions.

---

# Foundation J — Presentation and debugging

## 47. Debug overlays are part of implementation

Every foundational system needs a toggleable overlay:

- collision proxies;
- component anchors and pick radii;
- force vectors and field radii;
- NPC route and job phase;
- target/pursuit slot;
- path lookahead;
- docking corridor;
- gravity trajectory;
- site state IDs.

Agents cannot tune invisible control laws effectively without them.

## 48. Gameplay-camera review

Never accept a hero asset based only on:

- Blender viewport;
- isolated turntable;
- generated concept image;
- orthographic asset preview.

Capture it:

- at normal gameplay zoom;
- while moving;
- with HUD;
- beside player ship;
- at approach distance;
- with collision overlay;
- in sparse and crowded conditions.

## 49. Performance rules

- static collision proxies are cached and indexed;
- job AI updates below render frequency;
- component world positions cache until parent transform/state changes;
- field queries use spatial hash;
- trajectory preview uses fixed bounded samples;
- generated props use instancing/HLOD where possible;
- do not “fix” performance by shrinking or deleting the landmark.

---

# 50. Recommended dependency order

1. Multi-circle collision proxies and debug overlay.
2. Dock approach/capture volumes.
3. Component anchors and screen-space picking.
4. Shared component state/persistence.
5. Contextual industrial-beam resolver.
6. Dynamic detachable payloads and receiver zones.
7. Force/field kernel.
8. NPC job controller.
9. One hero site using all of the above.
10. Compound OBB/capsule collision if multi-circle limitations become visible.
11. Stylized gravity prototype.
12. Replication across sectors.

Do not build gravity, elaborate wrecks, or physics combat arenas before collision and targetable components exist. They are the grammar those features need.

<!-- END FILE: 01_ENGINE_PRIMITIVES_AND_INTERACTION_GRAMMAR.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 02_MASSLINE_FLIGHT_AND_PHYSICS_COMBAT.md -->

# 02 — Massline, Flight, and Physics Combat

## 0. Premise

SpaceFace’s differentiating opportunity is not conventional dogfighting with more weapon DPS. It is a combat and traversal system where the player manipulates constraints, momentum, terrain, and force fields in a top-down plane.

The massline is already the nearest thing in the project to a genuine toy. It should become the center of a broader **momentum grammar**:

- attach;
- orbit;
- reel;
- release;
- throw;
- collide;
- deflect;
- brake;
- hitch;
- redirect.

The important warning is that the repository already contains several sophisticated massline concepts that may not be legible or reliably reachable in normal play. Before inventing another subsystem, build a current player-route proving ground and determine which mechanics are actually alive.

Current code/design around July 2026 includes or claims:

- tether-lock fire control;
- payload throw aiming;
- snap/arm release assistance;
- self-sling bonus from massive anchors;
- tumble states and impact consequences;
- terrain anchors around encounters;
- jettison impulse;
- bomb propulsion;
- hitchhiking on moving ships;
- bullet time;
- cloak interactions.

A design document and a green check are not proof. The official live probe described in the repository failed to reach much of the intended sequence. Treat these as candidates awaiting player acceptance.

---

# Part I — The input philosophy

## 1. Preserve a small vocabulary

Recommended core inputs:

- movement keys: thrust, reverse/brake, lateral/yaw intent;
- cursor/trackpad: aim or maneuver intent, depending on explicit mode;
- `LMB`: primary weapon;
- `RMB`: industrial beam / secondary tool / armed payload throw in an explicit massline context;
- `F`: massline attach/cut/reel contract;
- `C`: scan;
- `R`: detonate deployed charges;
- `G`: explicit combat-assist mode;
- optional hold key: bullet time or focus.

Do not overload an input unless:

1. the context is visible;
2. only one interpretation is plausible;
3. the HUD announces the armed outcome;
4. release returns instantly to ordinary control.

## 2. Input shaping, not outcome scripting

A massline assist may:

- compute the tangent direction;
- set desired yaw;
- blend a bounded radial correction;
- time a release within a visible window;
- map target-relative trackpad motion to a pursuit slot.

It should not:

- teleport the ship onto an orbit;
- set a perfect velocity regardless of thrust;
- ignore tether tension;
- guarantee a hit after a throw;
- quietly change the target;
- seize control after manual override.

---

# Part II — Tether Orbit Assist

## 3. Player problem

While tethered to a massive anchor, holding forward and left/right clearly expresses “drive around the anchor in this direction.” In manual flight, the ideal nose direction changes continuously with tether length, current speed, and radial error. A human using digital keys often turns too quickly or too slowly, producing a slack line, oscillation, or accidental inward/outward spiral.

This is a good case for an assist because the intention is unambiguous.

## 4. Feature name

Use a player-facing name such as:

- **Orbit Assist**
- **Tether Carve**
- **Line Hold**

Avoid “autopilot.” The player is still generating the thrust and choosing direction.

## 5. Activation contract

Orbit Assist is active only while all are true:

- massline attached;
- target mass is at least `anchorMassRatioMin × playerMass`, or target is explicitly fixed;
- line is taut or close to taut;
- forward input held;
- exactly one lateral/yaw direction held;
- brake not held;
- player has not armed a payload throw;
- no UI/modal state.

The instant any condition ends, normal controls return.

## 6. Geometry

Let:

```text
r = player.position - anchor.position
R = |r|
r̂ = r / R
```

For clockwise/counterclockwise intent `s ∈ {-1, +1}`, define tangent:

```text
t̂ = s × perpendicular(r̂)
```

In the XZ gameplay plane:

```text
perpendicular({x, z}) = {-z, x}
```

Desired heading:

```text
θ* = atan2(t̂.z, t̂.x)
eθ = wrapAngle(θ* - player.rot)
```

## 7. Yaw controller

Use a PD-like heading controller through ordinary `turnIntent`:

```text
ω* = clamp(v_t / max(R, Rmin), -ωmax, +ωmax)

turnIntent =
  clamp(
    KpHeading × eθ
    + KdYaw × (ω* - player.angVel),
    -1,
    +1
  )
```

`v_t` is current tangential velocity or an authored target based on thrust. This prevents the “spin right forever until the arrow crosses, then spin left forever” failure.

The controller should use the ship’s normal torque, yaw acceleration, and rate limits. Do not write `rot` or `angVel` directly.

## 8. Radial correction

The tether constraint should remain authoritative. Add only a bounded actuator correction if the existing constraint and digital controls cannot maintain a readable orbit.

```text
radialVelocity = dot(player.vel - anchor.vel, r̂)
lengthError = R - tether.restLength

aRadial =
  clamp(
    -Kr × lengthError
    - KdRadial × radialVelocity,
    -aRadialMax,
    +aRadialMax
  )
```

Apply through the normal body-frame thrust/strafe command, capped at perhaps 15–25% of available acceleration.

The correction should remove accidental oscillation, not create orbital energy.

## 9. Tension policy

Three states:

- **slack:** assist aligns toward tangent and gently re-tensions; no release bonus;
- **working:** normal orbit control;
- **overstrain:** assistance reduces forward command or warns; it does not magically preserve the line.

HUD:

- a small tangent chevron;
- line-tension band;
- `ORBIT L` or `ORBIT R`;
- no modal tutorial.

## 10. Acceptance tests

Run against at least:

- three tether lengths;
- fixed asteroid;
- heavy moving ship;
- light movable payload;
- starter and heavy player hull;
- low and high initial tangential speed.

Pass conditions:

- ten-second intended orbit without uncontrolled full spins;
- radial distance remains within a defined band after settling;
- line does not repeatedly alternate taut/slack under constant input;
- assist disengages in one tick after release or input change;
- no direct velocity/rotation writes;
- net kinetic-energy increase is bounded by player thrust plus existing tether work;
- manual brake and opposite input immediately override;
- capture shows the behavior without a debug overlay.

---

# Part III — Reel Pump and line-energy play

## 11. Why reeling matters

A tether that only attaches and slows the player is inhibitory. Reeling should be a way to exchange radius and tangential speed.

In an ideal constraint:

```text
angular momentum L ≈ m r² ω
```

Shortening the line while preserving angular momentum increases angular speed. Lengthening reduces it.

The game need not simulate a perfect orbital mechanics textbook, but the player should feel:

- reel in at the right time → tighter, faster arc;
- reel out → wider, slower arc or safer line tension;
- release → earned exit velocity.

## 12. Player-facing loop

1. attach to a massive anchor;
2. thrust tangentially;
3. reel in to intensify the orbit;
4. wait for trajectory indicator;
5. release toward destination or target.

This should be teachable in one arena with no prose longer than a sentence.

## 13. Anti-cheese constraints

- reel motor has a power/tension limit;
- high strain slows reeling;
- movable payload reacts honestly;
- no infinite energy from rapid in/out tapping;
- reel work is measured or bounded;
- release indicator is predictive, not a guaranteed destination teleport.

---

# Part IV — Self-sling and payload throw

## 14. Distinguish the payload

The player should internalize:

- plain cut frees the player;
- armed throw releases the tethered mass toward the cursor/target.

The HUD must show which body is the payload and which target is being solved.

## 15. Predictive indicator

For player or payload:

- show current ballistic exit vector;
- show target-intercept error;
- ramp color/shape as the release window approaches;
- show an arrival ghost or impact marker;
- do not draw a giant abstract arrow unrelated to actual motion.

A missed window should cost another revolution, not destroy the setup.

## 16. Throw outcomes

Payload throw can produce:

- direct collision damage;
- tumble;
- component damage;
- terrain impact;
- atmosphere entry;
- cargo interception;
- breaking a brittle site component;
- throwing debris as temporary cover.

Targets should have readable mass classes:

- light: easy to move;
- medium: requires spin/reel;
- heavy: limited displacement;
- fixed: anchor only.

## 17. Terrain requirement

Physics combat is dull in empty space. Encounters intended for massline play need:

- two or three large anchors;
- one or two collision surfaces;
- a hazard or receiver zone;
- enough clearance for an orbit;
- no gravel cloud.

The existing “terrain anchors” concept should become authored battle-space composition rather than invisible emergency rocks.

---

# Part V — Target-relative trackpad dogfight mode

## 18. Why the current conceptual approach fails

There are two distinct control problems:

1. **absolute traversal:** follow a path through world space;
2. **relative combat:** maneuver around a moving target.

Treating both as “ship follows cursor” or “draw a path and chase points” produces instability because:

- trackpad deltas are relative, not an absolute joystick;
- the target moves;
- the ship has inertia and turn limits;
- a point follower ignores curvature and feasible speed;
- a yaw-rate arrow persists after the player’s intent ends;
- the visual indicator may describe input rather than predicted motion.

For dogfighting, use a **target-centered control frame**.

## 19. Pursuit-slot control

When `G` is active and a hostile is locked:

- weapon aim automatically leads the target;
- trackpad motion controls a desired relative slot around the target;
- the flight computer uses ordinary thrusters to pursue that slot.

State:

```js
combatManeuver: {
  targetId,
  bearingRad,
  rangeWu,
  orbitRate,
  closingBias,
  active
}
```

Trackpad mapping:

```text
dx → change desired bearing around target
dy → change desired range
```

Example:

```text
bearing += dx × bearingSensitivity
range   += dy × rangeSensitivity
range = clamp(range, minRange, maxRange)
```

Desired slot:

```text
p* = target.pos + range × [cos(bearing), sin(bearing)]
```

Target-relative desired velocity:

```text
v* =
  target.vel
  + orbitRate × range × tangent
  - rangeCorrection × radialError × radial
```

Desired acceleration:

```text
a* = Kv × (v* - player.vel) + Kp × (p* - player.pos)
```

Convert `a*` into the ship’s body frame and feed normal forward/lateral thrusters. Use a separate heading policy:

- velocity-facing for general movement;
- target-facing if fixed guns require it;
- blended facing if the hull supports strafe.

Do not set ship position, velocity, or rotation directly.

## 20. Why this is suitable for a trackpad

The gesture controls two stable concepts:

- orbit around the target;
- move closer or farther.

The player can learn:

- long horizontal swipe → cross behind or around the target;
- upward/downward swipe → open or close range;
- combine with boost → aggressive pass;
- tap manual movement → instant override.

There is no ambiguous arrow representing turn rate.

## 21. Visual language

Display:

- target-centered orbit ring;
- a ghost chevron at desired slot;
- a short predicted ship path;
- range number only if needed;
- no large arrow attached to the player;
- no cursor-chasing nose.

The player should see where the flight computer is trying to place the ship.

## 22. Manual override

Any of:

- meaningful movement/yaw input;
- brake;
- tether attach;
- target loss;
- mode toggle;
- docking/UI;

must disengage or suspend the assist immediately.

Q/E or a dedicated subtle axis may be allowed as additive orbit adjustment if clearly defined.

## 23. Acceptance suite

- stationary target;
- target crossing left/right;
- target accelerating;
- target circling;
- player at rest;
- player entering at high lateral speed;
- three hull masses and turn rates.

Pass:

- no repeated 180° yaw oscillation;
- no uncontrolled full spin;
- desired slot converges when physically reachable;
- impossible commands saturate gracefully;
- target motion does not cause random thrust direction;
- player can draw a simple around/close/open sequence;
- manual input breaks mode in one tick;
- debug overlay shows desired slot, velocity, and actuator command.

---

# Part VI — Gesture path flight for traversal

## 24. Keep it separate from dogfight control

A drawn path can be useful for traversal, stunt routes, and slingshots, but it needs a proper path follower.

## 25. Path processing

On gesture completion:

1. collect screen-space points;
2. unproject to world plane;
3. resample by arc length;
4. simplify noise with Ramer–Douglas–Peucker or similar;
5. optionally fit a Catmull–Rom spline;
6. compute curvature along the path;
7. display the resulting route before or while following.

## 26. Pure-pursuit follower

Do not chase the next discrete point directly.

Choose a lookahead distance:

```text
L = clamp(Lmin + speed × lookaheadTime, Lmin, Lmax)
```

Find the point `L` ahead along the route. Command velocity toward it.

Curvature-aware speed:

```text
vCurve = sqrt(aLateralMax / max(|curvature|, epsilon))
vTarget = min(shipMaxSpeed, vCurve, endpointProfile)
```

This prevents the ship from attempting a full-speed hairpin and flailing.

## 27. Endpoint semantics

The gesture must declare one of:

- **fly-through:** preserve velocity beyond the end;
- **arrive:** brake and stop;
- **loop:** continue cyclic path;
- **attack pass:** return control after crossing target region.

Do not silently assume every path ends in a stop.

A simple rule:

- finish gesture while holding brake → arrive;
- otherwise → fly-through.

## 28. Tether integration

When tethered:

- path may be interpreted in anchor-relative polar coordinates;
- orbit assist can follow the intended arc;
- path must respect line length and feasible curvature;
- predicted path turns red where constraint/acceleration makes it unreachable.

This is later work. First make untethered pure pursuit stable.

---

# Part VII — Physics weapon families

## 29. Design principle

Weapons should differ by **what they let the player do**, not only damage per second.

A useful taxonomy:

- damage;
- impulse;
- torque;
- disable;
- constraint;
- field;
- deployment;
- component work;
- recoil/mobility;
- environment interaction.

Standard weapons may remain simple. Advanced weapons should create setups and payoffs.

## 30. Concussion cannon

**Fantasy:** a low-damage slug that violently changes target momentum.

**Mechanic:**

- projectile impact;
- directional impulse along projectile travel;
- small radial component;
- mass-scaled;
- may trigger tumble when angular/impact threshold is met;
- low hull damage.

**Combos:**

- push enemy into asteroid/station;
- push enemy into gravity well;
- break formation;
- move payload;
- use at close range for self-recoil only if explicitly designed.

**Acceptance:** visible displacement on fighter, reduced effect on capital, no teleport, collision consequences.

## 31. Vector mine / impulse charge

**Fantasy:** drop a charge, lure or pass an enemy, detonate for momentum.

**Mechanic:**

- deploy behind player;
- persistent visible object;
- manual `R` detonation;
- radial impulse;
- affects player motion;
- player hull-damage policy explicit;
- limited batch/cooldown.

This can evolve the existing bomb-propulsion work rather than create another system.

## 32. Recoil lance

**Fantasy:** a powerful kinetic shot whose recoil is a movement tool.

**Mechanic:**

- high projectile impulse;
- equal and opposite shooter impulse;
- long charge/cooldown;
- aiming backward becomes a boost;
- aiming forward becomes a brake;
- broadside shot becomes lateral dodge.

Damage should not be so high that recoil use is always secondary.

## 33. Gravity puck

**Fantasy:** deploy a short-lived local gravity well.

**Mechanic:**

- projectile or placed device;
- three-to-five-second pull field;
- affects ships, payloads, and optionally projectiles;
- capped acceleration;
- destructible or limited charge;
- strong visual distortion/particle orbit.

**Combos:**

- cluster enemies for explosion;
- bend missiles;
- pull cargo from a convoy;
- curve a massline throw;
- create temporary slingshot anchor.

High systemic value; medium implementation risk after force-field kernel.

## 34. Repulsor burst

**Fantasy:** emergency space-clearing pulse.

**Mechanic:**

- short radial impulse from player;
- long cooldown/energy;
- minimal damage;
- pushes light objects strongly, capitals weakly;
- can propel the player if symmetric policy allows.

Useful against swarms and for positioning.

## 35. RCS disruptor

**Fantasy:** make a target unable to correct its attitude.

**Mechanic:**

- subsystem/EMP hit;
- reduces yaw/strafe authority;
- does not simply freeze target;
- short duration;
- visible sparking/attitude drift;
- prime setup for massline throws.

The repository already contains an EMP concept and tumble systems. Reuse them.

## 36. Anchor charge

**Fantasy:** temporarily make a ship “heavy” and resistant to correction.

Possible implementation:

- adds drag or reduces thrust authority;
- increases effective tether resistance, not actual inertial mass if that destabilizes physics;
- creates a massline setup target;
- allows a light fighter to serve briefly as an anchor or become easy to collide with.

Use careful naming—this is advanced mass-field technology, not ordinary ammunition.

## 37. Tractor pulse

**Fantasy:** a short, directional massline induction pulse.

Mechanic:

- cone query;
- impulse toward player or toward cursor-defined focal point;
- strict mass/range limits;
- no arbitrary telekinetic dragging;
- high energy/cooldown;
- visual field lines;
- intended to bring a payload into tether range or spoil an enemy pass.

This can feel coherent if framed as a massline emitter, not magic.

## 38. Ricochet slug

**Fantasy:** bank shots through stations and wreck fields.

Requires aligned collision geometry.

Mechanic:

- projectile reflects from static collision normal;
- limited bounce count;
- damage/energy falls per bounce;
- predicted first-bounce line while aiming;
- excellent in top-down obstacle fields.

This makes structures mechanically valuable.

## 39. Tether cutter / line jammer

Enemy or player tool that attacks constraints rather than hull:

- damages or destabilizes a massline;
- forces the player to protect line geometry;
- introduces counterplay;
- avoids generic DPS escalation.

Only add after massline play is reliable and readable.

## 40. Atmosphere and hazard weaponization

Weapons become more interesting when fields and structures matter:

- push target into atmosphere;
- disable RCS inside debris current;
- throw conductive payload into ion field;
- ricochet through wreck corridor;
- detonate near brittle station braces;
- lure missiles into gravity puck.

Build terrain and forces alongside weapons.

---

# Part VIII — Combat arena grammar

## 41. Arena elements

A physics combat arena may include:

- fixed anchor;
- movable heavy payload;
- brittle collision surface;
- hazardous field;
- gravity body;
- narrow channel;
- cargo objective;
- escape route.

Use two or three, not all seven.

## 42. Arena examples

### Anchor Yard

- two large fixed pylons;
- one movable cargo pod;
- open center;
- teaches orbit, throw, and cover.

### Carrier Grave

- split hull collision islands;
- narrow channels;
- detachable armor;
- ricochet opportunities;
- enemies can be dashed into slabs.

### Burn Periapsis

- one planetary gravity well;
- orbital platform;
- atmosphere danger;
- impulse weapons and slingshots.

### Debris Current

- continuous directional field;
- floating cover;
- player can use tether to stabilize or accelerate.

### Customs Ring

- large scanning ring;
- protected traffic;
- disabling and robbery opportunities;
- reinforcements arrive along visible route.

---

# Part IX — The Massline Proving Ground

## 43. Purpose

Before expanding massline mechanics, create one normal-route test site that proves what currently works.

Not a debug lab hidden behind query parameters. A small optional training/industrial site in an early sector.

## 44. Layout

- three massive anchors at different radii;
- one moving express liner;
- one inert target drone;
- one light cargo payload;
- one wall/impact slab;
- one safe extraction receiver;
- trajectory and tension readouts;
- no lethal enemies.

## 45. Challenges

1. maintain a five-second orbit;
2. reel inward and increase angular speed;
3. release through a visible gate;
4. throw cargo into receiver;
5. throw drone into impact slab;
6. hitchhike on moving liner;
7. use impulse charge for a self-boost;
8. optional time trial chaining three anchors.

Each challenge is detected from telemetry and world events, not from a bespoke minigame UI.

## 46. Why this is high value

It distinguishes:

- code that exists;
- mechanics that are discoverable;
- mechanics that feel good;
- mechanics that need control assistance;
- mechanics that are too fragile to build content around.

Do not hide failures behind “the feature flag is on.”

---

# Part X — Progression through physics capability

## 47. Massline head families

Rather than pure stat tiers:

- **Anchor Head:** strongest fixed-body attachment and long tether.
- **Tow Head:** stable COM-to-COM attachment for payload transport.
- **Combat Harpoon:** fast latch, lower max mass, vulnerable line.
- **Shear Head:** attaches to cuttable components and helps tear them free.
- **Phase Head:** advanced alien head that can briefly attach across fields or through certain barriers.
- **Dual-Spool Rig:** late/high-risk feature allowing one player-to-anchor line plus one payload line, only after single-line play is excellent.

Each should change possible actions.

## 48. Ship modules that support play styles

- high-torque RCS for tight orbit corrections;
- high-thrust engine for slingshot energy;
- heavy hull for payload wrestling;
- sensor suite for component targeting;
- impulse capacitor for physics weapons;
- line radiator for sustained high-tension work;
- trajectory computer for longer prediction;
- cargo receiver for physical payload capture.

Avoid “Massline Mk. IV: +17% everything.”

## 49. Industrial link

Asteroid Ops should fabricate:

- line heads;
- impulse charges;
- gravity pucks;
- receiver beacons;
- anchor pylons;
- trajectory computers;
- orbital mass drivers;
- station construction cranes.

This answers why the player builds industry: it creates new physical capabilities and infrastructure.

---

# Part XI — Defer list

Do not begin with:

- dual independent tethers;
- arbitrary soft-body cables;
- full rope wrapping around geometry;
- per-segment cable collision;
- realistic orbital multi-body physics;
- player/NPC grappling fleets;
- procedural acrobatics generated by AI;
- competitive timing challenges before controls stabilize;
- another control mode without a debug vector/slot overlay;
- a new physics weapon implemented through direct velocity writes.

First prove orbit assist, target-relative dogfight control, one impulse weapon, and one terrain-rich encounter.

<!-- END FILE: 02_MASSLINE_FLIGHT_AND_PHYSICS_COMBAT.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 03_LIVING_WORLD_SECTORS_PLANETS_AND_NPC_JOBS.md -->

# 03 — Living World, Sectors, Planets, and NPC Jobs

## 0. Objective

SpaceFace should stop presenting sectors as loading-screen rooms that happened to be bolted together into open space.

A sector must become a **small causal geography**:

- distinct places separated by meaningful travel;
- visible routes between those places;
- NPCs performing jobs along those routes;
- structures whose function can be inferred from behavior;
- hazards that alter motion, information, or access;
- persistent changes caused by the player.

The world should not merely contain more props. It should contain more **ongoing processes**.

---

# Part I — Spatial composition

## 1. Replace the central pile with activity pockets

A sector should generally contain two to four activity pockets.

Examples:

- civic/station pocket;
- production pocket;
- transit/checkpoint pocket;
- danger/contested pocket;
- mystery/landmark pocket.

Do not require every sector to use every category.

Recommended spacing for current world scales:

- pocket radius: roughly 350–900 world units;
- pocket separation: roughly 1,200–3,000 world units;
- route length: enough to observe traffic and make interception meaningful;
- landmark visibility: silhouette readable from at least one neighboring pocket.

The player should be able to say:

> “The refinery is beyond the belt, the customs ring is on the Helios route, and the graveyard is off-lane in the shadow.”

That sentence describes geography. “Everything is near the center” does not.

## 2. Sector graph data

Extend or project current named-zone and anchor data into explicit activity pockets and routes:

```js
activityPockets: [
  {
    id: 'ceres_refinery',
    role: 'industrial',
    center: { x: -1600, z: 700 },
    radius: 650,
    landmarkRef: 'dmc_refinery_ring',
    jobs: ['miner_return', 'hauler_depart', 'patrol_inspect'],
    services: ['ore_receive', 'refine'],
    persistentStateRef: 'site_ceres_refinery'
  },
  {
    id: 'ceres_deep_seam',
    role: 'extraction',
    center: { x: 600, z: -1300 },
    radius: 850,
    jobs: ['miner_work', 'scavenger_loiter'],
    fieldRefs: ['f_ceres_1', 'f_ceres_3']
  }
],
routes: [
  {
    id: 'ceres_ore_run',
    from: 'ceres_deep_seam',
    to: 'ceres_refinery',
    width: 220,
    trafficProfile: 'industrial_ore',
    beaconSpacing: 360
  }
]
```

The existing named zones can remain semantic authority. This layer answers where physical routes, traffic, props, and events occur.

## 3. Entry placement

Do not spawn or jump the player directly into the same central cluster in every sector.

Possible entries:

- near a gate on a route edge;
- at an orbital approach;
- in a debris corridor;
- at a customs checkpoint;
- outside a storm front;
- near the player’s own infrastructure.

A sector entrance should reveal one silhouette and one navigational decision.

## 4. Empty space with purpose

Empty space is not inherently bad. It is bad when it separates interchangeable clusters.

Useful empty space:

- a lane where convoys can be intercepted;
- an approach where a landmark grows in scale;
- a gravity arc;
- a quiet region hiding an anomaly;
- a patrol boundary;
- a buffer around a hazardous field;
- construction room around a growing player site.

Travel must either reveal, threaten, enable, or frame.

---

# Part II — Sector archetypes

## 5. Industrial belt

**Identity:** extraction sites feed a refinery through exposed ore routes.

Required visible loop:

- miners depart;
- work seams;
- haulers collect;
- refinery receives;
- cargo pods depart.

Player actions:

- mine manually;
- escort or rob ore traffic;
- automate a seam;
- repair a broken extractor;
- disrupt or defend the refinery;
- build a competing site.

Mechanical condition:

- dense collision terrain;
- high-value metallic formations;
- line-of-sight broken by large asteroids.

Hero silhouette:

- refinery ring, furnace spine, or rotating ore crusher.

## 6. Trade junction

**Identity:** multiple routes cross through a customs or market structure.

Visible loop:

- haulers arrive from different directions;
- queue;
- get scanned;
- unload;
- depart.

Player actions:

- trade;
- follow a convoy;
- smuggle through a blind interval;
- rob traffic off-lane;
- repair/disable scanners;
- buy route intelligence.

Mechanical condition:

- traffic corridors and response times;
- law concentrated near checkpoint, weak farther away.

Hero silhouette:

- customs ring, multi-arm exchange, or cargo elevator.

## 7. Ship graveyard

**Identity:** the sector’s terrain is made from large broken vessels.

Visible loop:

- scavengers strip wrecks;
- patrols investigate restricted hulks;
- pirates ambush salvage traffic;
- debris slowly drifts through authored currents.

Player actions:

- scan;
- cut;
- tether;
- recover black boxes;
- fight through hull channels;
- establish automated salvage.

Mechanical condition:

- compound collision;
- dynamic payloads;
- directional debris current;
- restricted salvage.

Hero silhouette:

- carrier halves, capital spine, or kilometre-scale ring wreck.

## 8. Border checkpoint

**Identity:** geography forces travel through a controlled passage.

Visible loop:

- patrols screen traffic;
- smugglers attempt alternate path;
- couriers wait;
- alarms change route behavior.

Player actions:

- submit to scan;
- evade;
- bribe through an existing lightweight interaction;
- disable one sensor node;
- defend or attack checkpoint;
- build a bypass relay later.

Mechanical condition:

- narrow route;
- law field;
- sensor occlusion pockets.

Hero silhouette:

- gate lattice, defense pylons, or scanning arc.

## 9. Anomaly field

**Identity:** movement and information are unreliable.

Visible loop:

- survey vessels triangulate;
- probes disappear/reappear;
- research platforms transmit;
- scavengers wait for quiet windows.

Player actions:

- scan from several bearings;
- deploy probes;
- use massline to align an ancient mechanism;
- exploit a field for slingshots;
- recover displaced payloads.

Mechanical condition:

- gravity/vortex/ion fields;
- intermittent access;
- projectile bending;
- sensor noise.

Hero silhouette:

- alien ring, crystal lattice, or oscillating machine.

## 10. Pirate-held ruin

**Identity:** a broken industrial or military structure has become a functioning outlaw settlement.

Visible loop:

- stolen cargo arrives;
- raiders depart;
- repair drones service pirate ships;
- lookouts patrol approach routes.

Player actions:

- trade at black market;
- infiltrate via debris channels;
- attack power/components;
- steal cargo;
- follow raiders;
- eventually clear or claim the site.

Mechanical condition:

- layered defenses;
- destructible/disable-able components;
- escape routes.

Hero silhouette:

- scavenged station welded into a wreck.

## 11. Construction frontier

**Identity:** a new station or megastructure visibly grows over time.

Visible loop:

- construction drones carry modules;
- freighters deliver material;
- defense ships protect frame;
- new arms light up as stages complete.

Player actions:

- deliver materials;
- defend;
- sabotage;
- attach modules;
- choose build order without exclusive story lockouts;
- eventually use the completed structure.

Mechanical condition:

- persistent staged visuals;
- physical payload receivers;
- route demand.

Hero silhouette:

- skeletal station frame.

## 12. Quiet sanctuary

**Identity:** low traffic and low threat make subtle activity readable.

Visible loop:

- research craft;
- memorial traffic;
- pilgrims or couriers;
- maintenance drones.

Player actions:

- discover story evidence;
- perform precision scan;
- repair old infrastructure;
- hide from pursuit;
- build a low-signature relay.

Mechanical condition:

- cloak/sensor play;
- no ambient combat spam.

Hero silhouette:

- memorial array, silent habitat, or light sail.

## 13. Active war zone

**Identity:** conflict has geography and supply, not random enemy clusters.

Visible loop:

- reinforcements arrive from owned routes;
- damaged ships retreat;
- wrecks persist;
- supply carriers matter;
- control points alter spawning.

Player actions:

- interdict supply;
- rescue disabled ships;
- defend artillery;
- salvage aftermath;
- shift local control.

Mechanical condition:

- persistent battle damage;
- causal reinforcements;
- terrain anchors.

Hero silhouette:

- contested fortress or destroyed capital.

## 14. Player expansion region

**Identity:** the sector changes most visibly because of the player.

Visible loop after development:

- player couriers;
- drones;
- construction;
- defenses;
- visiting traders;
- competing/attacking factions.

Mechanical condition:

- asteroid-site output;
- station assembly;
- infrastructure placement;
- traffic growth.

Hero silhouette:

- whatever the player built.

---

# Part III — NPC jobs

## 15. Miner

### States

1. depart station or tender;
2. transit along ore route;
3. approach selected asteroid;
4. scan/contact;
5. hold working position;
6. beam or deploy mining drone;
7. accumulate manifest;
8. return;
9. unload.

### Visible behavior

- miner hull silhouette;
- industrial beam;
- occasional ore pod;
- scan-readable cargo;
- route marker.

### Player interactions

- escort;
- rob after disabling;
- follow to productive seam;
- rescue when stranded;
- sell fuel/repair only if such services remain light;
- compete for a high-value formation.

### Failure modes to forbid

- miner wanders randomly inside field;
- `role: miner` exists only in data;
- beam points nowhere;
- ore appears without a trip;
- miner uses combat AI during ordinary work.

## 16. Hauler / caravan

### States

- load at producer;
- form convoy;
- depart;
- transit;
- checkpoint;
- arrive;
- unload;
- return or select next route.

### Manifest

Scanning should reveal:

- cargo type/value;
- origin/destination;
- escort strength;
- legal status;
- route.

### Crime loop

The player may:

- shadow convoy;
- disable engines/RCS;
- detach or force jettison cargo pods;
- tether pods;
- flee patrol response;
- fence cargo.

This is the beginning of “GTA in space.” It does not require a sprawling dialogue system.

### Security

Escorts have one job:

- stay in formation;
- respond when convoy attacked;
- cover retreat;
- disengage after cargo is safe/lost.

Do not ask them to solve arbitrary tactical warfare.

## 17. Patrol

### Route

- follows authored corridor;
- pauses at checkpoint;
- scans ships;
- responds to weapon fire, distress, or high heat;
- returns.

### Readability

- authority lights;
- predictable route;
- scan cone or ring;
- clear escalation state.

### Player interaction

- observe timing;
- comply;
- evade;
- lure away;
- attack and create consequences;
- restore patrol capacity in unsafe region.

## 18. Scavenger

- receives rumor or detects aftermath;
- travels to wreck;
- scans;
- cuts/tethers a payload;
- tows it to yard or strips it;
- may compete with player.

A scavenger makes wrecks feel valuable without a tooltip.

## 19. Survey vessel

- follows triangular or orbital path;
- emits scan pulses;
- deploys probes;
- marks a signal;
- returns to research station.

The player can follow the pattern, steal data, protect the survey, or complete missing bearings.

## 20. Construction traffic

- freighter arrives with module;
- crane drone extracts module;
- module moves to frame;
- frame state changes;
- traffic departs.

This is a cheap “cutscene” made from gameplay objects.

## 21. Rescue tug

- responds to distress;
- attaches to disabled craft;
- tows or repairs;
- may be attacked.

The player can help, steal the disabled ship’s cargo, or protect the tug.

## 22. Smuggler

- travels ordinary route until checkpoint;
- diverts into occlusion pocket;
- meets hidden receiver;
- returns.

Following one can reveal black markets or secret structures.

## 23. Pirate predator

Pirates should not simply exist as red ships.

Job:

1. loiter at ambush pocket;
2. observe manifests;
3. select valuable vulnerable traffic;
4. intercept;
5. issue a brief demand or attack;
6. steal cargo;
7. retreat to ruin.

Even a simple state machine creates motivation.

---

# Part IV — Player interaction with ordinary traffic

## 24. Scan

Scan should produce actionable information, not only lore:

- cargo;
- destination;
- damaged subsystem;
- active job;
- affiliation;
- bounty or restricted cargo;
- hidden tether/cut points;
- route vulnerability.

## 25. Hail without dialogue trees

Use one-line contextual actions:

- `REQUEST MANIFEST`
- `DEMAND CARGO`
- `OFFER ESCORT`
- `REQUEST DISTRESS STATUS`
- `WARN OF AMBUSH`

The result can be deterministic from reputation, strength, and context. No long conversation.

## 26. Disable and steal

A crime system becomes interesting when destruction is not the only option.

Needed primitives:

- engine/RCS component disable;
- cargo pods or jettison;
- physical pickup/tether;
- response heat;
- patrol arrival from real route;
- fence destination.

## 27. Follow

A subtle but valuable verb:

- target a ship;
- use pursuit mode at distance;
- do not attack;
- ship continues its job;
- following reveals destination, hidden site, or event.

This turns existing traffic into navigation/story content.

---

# Part V — Planets and orbital operations

## 28. Do not build planetary landing first

Planets can become mechanically rich through orbital structures and fields.

A planet is:

- a dominant visual anchor;
- a gravity field;
- an atmosphere boundary;
- a host for orbital routes;
- a source/sink for cargo;
- a place whose installations can change.

## 29. Orbital elevator terminal

Visible elements:

- equatorial ground tether rising toward orbital counterweight;
- cargo terminal;
- moving capsules or lights;
- queue of haulers.

Interactions:

- retrieve launched cargo;
- defend terminal;
- repair relay nodes;
- rob cargo at transfer point;
- build/upgrade orbital receiver.

No surface gameplay required.

## 30. Satellite constellation

Several analytic orbiters:

- communications;
- weather;
- navigation;
- defense;
- survey.

Interactions:

- scan from correct orbital positions;
- repair one satellite;
- replace a missing node;
- hack/disable;
- align constellation;
- extend player sensor coverage.

Avoid “press E at each.” Use scan, beam repair, payload installation, or tether alignment.

## 31. Atmospheric harvester

- skims upper atmosphere analytically;
- transfers gas to orbital depot;
- emits visible plume;
- vulnerable at predictable points.

Player can:

- install extractor;
- defend;
- collect capsule;
- adjust orbit;
- use output in Asteroid Ops.

## 32. Surface-to-orbit mass driver

- periodically launches cargo capsules;
- visible trajectory;
- receiver catches them;
- missed launches become salvage;
- player may intercept.

This creates world activity and a physics toy.

## 33. Mining ring

- partial orbital ring around moon/planet;
- material moves along it;
- sections can be repaired or sabotaged;
- massline anchors permit traversal;
- construction can extend ring.

## 34. Research platform

- points instruments toward anomaly or surface;
- generates scan patterns;
- needs power or alignment;
- unlocks illustrated ledger evidence and new coordinates.

## 35. Colony evacuation

A live event:

- shuttles launch in waves;
- hostile force approaches;
- player defends routes;
- disabled shuttle can be towed;
- cargo/passenger abstraction remains in manifests;
- outcome changes orbital population/traffic state.

No cutscene needed.

## 36. Defense array

- several emitter satellites;
- overlapping coverage;
- can be disabled by component attacks;
- protects traffic or hostile region;
- player can repair, capture, or bypass.

## 37. Abandoned habitat

- large collision-aligned structure;
- dark sections;
- emergency power nodes;
- salvage;
- illustrated records;
- eventual claim or reuse.

---

# Part VI — Gravity as sector identity

## 38. Stylized gravity sector

Begin with one sector built around one large body.

Required:

- clear influence boundary through particles/background;
- trajectory preview;
- one fast route that uses a close pass;
- one slow safe route outside;
- orbital traffic;
- atmosphere interaction;
- an impulse/massline opportunity.

The player should learn gravity through repeated ordinary travel, not a tutorial screen.

## 39. Chaining gravity assists

Do not begin with three freely orbiting planets.

A manageable first chain:

- one planet;
- one moon on analytic orbit;
- one acceleration ring;
- destination station.

The player can:

1. use planet swing;
2. intercept moon side;
3. pass through ring;
4. reach station faster.

The route preview may show waypoints and projected arcs.

## 40. Enemy atmospheric destruction

Requirements:

- enemy receives real impulse/tether trajectory;
- atmosphere crossing triggers escalating burn state;
- ship breaks into a few debris pieces;
- no instant disappearance;
- story/combat receipt attributes kill;
- player gets readable payoff.

Do not make every enemy easy to push. Mass, RCS, and distance matter.

---

# Part VII — Hazards that are not damage circles

## 41. Moving ion storm

- field center/shape moves on deterministic path;
- hides scanner contacts;
- bends or disrupts projectiles;
- exposes wreck during quiet window;
- player may deploy beacon to track it.

## 42. Gravitational eddy

- localized vortex field;
- alters trajectories;
- can be exploited for turn/boost;
- pulls debris into an orbiting belt.

## 43. Debris current

- continuous directional force;
- carries small payloads;
- larger hulls resist;
- tether to fixed anchor to work inside current;
- hidden salvage periodically passes.

## 44. Radiation corridor

- hazard opens/closes or sweeps;
- shield/heat consequence;
- not pure DPS: sensor interference, component heat, trajectory timing;
- provides safe window.

## 45. Resonant crystal formation

- several movable/rotatable nodes;
- massline changes alignment;
- correct geometry activates signal/route;
- visible beam or resonance;
- wrong arrangement is reversible.

## 46. Dormant alien ring

- component nodes;
- power/position requirements;
- aligns via tether or installed modules;
- opens shortcut, gravity field, or story coordinate.

## 47. Displacement anomaly

- moves tagged payloads between two points or mirrors velocity;
- strongly telegraphed;
- used for puzzles and combat;
- deterministic;
- no random confiscation of player cargo.

---

# Part VIII — Landmark and asset grammar

## 48. Three-scale readability

Every hero structure must read at:

### Far scale

At 1,000–2,000 world units:

- unique silhouette;
- dominant axis;
- emissive signature;
- no reliance on texture detail.

### Mid scale

At 300–800 units:

- function becomes obvious;
- routes, arms, bays, broken sections, or moving machinery read;
- player knows where to approach.

### Near scale

At 50–250 units:

- components;
- docking mouth;
- braces;
- windows/decals;
- damage;
- interaction cues.

## 49. Modular visual kits

To let three agents create volume without every sector looking cloned, build six reusable hard-surface kits:

1. **Concord civic:** clean panels, cool emissives, rings, regulated symmetry.
2. **DMC industrial:** trusses, furnaces, orange work lights, exposed machinery.
3. **Reach/pirate:** asymmetry, scavenged plates, tags, improvised armor.
4. **Quiet covert:** dark low-signature geometry, narrow lights, hidden bays.
5. **Vael/alien:** unfamiliar curves or segmented structures, nonhuman rhythm.
6. **Ancient/derelict:** eroded megastructure, dead emissives, broken scale.

Each kit includes:

- structural modules;
- connector modules;
- docking/receiver modules;
- antenna/sensor modules;
- damage variants;
- material presets;
- decals;
- collision proxy conventions;
- LODs.

Variation should come from silhouette and composition, not only recoloring.

## 50. Named advanced techniques for agent prompts

Use these phrases when relevant:

- silhouette-first graybox;
- hard-surface modular kitbashing;
- weighted normals;
- beveled edges sized for gameplay camera;
- physically based metal/roughness;
- trim-sheet or atlas workflow;
- decal layering;
- emissive hierarchy;
- instancing;
- HLOD;
- collision proxy manifest;
- gameplay-camera texel-density review;
- top-down occlusion/readability test;
- screen-space constant-width lines;
- analytic orbit;
- pure-pursuit steering;
- PD controller;
- spatial-hash query;
- deterministic state machine.

“Use advanced techniques” is too weak. Name the technique and the observable result.

---

# Part IX — Twelve pasteable sector seeds

## 51. Broken Moon Refinery

A scorched moon with a segmented refinery ring, one half dark. Miners still deliver ore to the surviving half. Player repairs power couplings and eventually claims the dead half for Asteroid Ops exports. Gravity and ring collision create curved routes.

## 52. Carrier Grave

A capital carrier lies split into five collision islands. Scavengers tow modules through channels; pirates hide behind the engine block. Restricted command section contains a blueprint and illustrated ledger sequence.

## 53. Customs Gauntlet

All safe trade routes pass through three scanning arcs. Smugglers use a radiation shadow. Player can comply, follow smugglers, disable one scanner component, or later build a legal bypass after gaining regional control.

## 54. Storm Vault

A moving ion storm hides an ancient vault. Survey vessels triangulate the clear window. Projectiles bend or lose lock in the storm. The vault becomes reachable through timing and sensor infrastructure.

## 55. Cinder Crown

A volcanic/industrial body with surface launchers firing cargo into orbit. Capsules cross a dangerous pirate lane. Player can intercept, defend, or build an orbital receiver.

## 56. The Rookery

A dense asteroid field with many small independently operated sites. Traffic is miners and courier pods, not generic wandering ships. The player’s first automated asteroid visibly joins the network.

## 57. Silent Exchange

A covert station lies inside a sensor-dead nebula. Traffic goes dark before entering. Following a ship reveals the approach. The station has no giant UI difference; its world route and access behavior create identity.

## 58. Pilgrim Array

A memorial constellation orbits a dead planet. No combat unless provoked. Scanning satellites unlocks illustrated records and eventually activates a navigation relay.

## 59. Iron Maw Siege

A fortress sits behind a debris current and defense-array coverage. Supply carriers sustain it. Interdicting supplies changes the battle before direct attack.

## 60. Lantern Construction Front

A station frame grows in stages around a player-accessible resource pocket. Construction drones and freighters are constant visible activity. Player contributions become actual modules.

## 61. Pale Coil Route

An alien acceleration ring and gravity eddy create a fast but difficult traversal line. Mastery opens a meaningful shortcut; ordinary route remains available.

## 62. Blackglass Lease

A dark player-claimable asteroid near an outlaw route. High production signature attracts predation. Quiet running and sensor infrastructure matter more than upkeep timers.

<!-- END FILE: 03_LIVING_WORLD_SECTORS_PLANETS_AND_NPC_JOBS.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 04_WRECK_CATHEDRAL_VERTICAL_SLICE.md -->

# 04 — Wreck Cathedral Vertical Slice

## 0. Mission

Build one monumental, physical, persistent wreck site that proves SpaceFace can convert its existing semantic systems—wreck provenance, scanning, salvage, massline physics, component state, story fragments, and industrial progression—into an actual top-down player experience.

This brief deliberately does **not** require:

- a walkable 3D interior;
- first-person exploration;
- deformable meshes;
- cinematic animation;
- full triangle collision;
- dialogue choices;
- a bespoke full-screen wreck UI;
- a new combat AI stack.

It does require more than a labeled sphere.

---

# 1. Player-facing promise

From a neighboring activity pocket, the player sees the broken silhouette of a capital ship.

On approach, the wreck resolves into several huge separated sections with navigable channels between them. The player can fly among those sections because collision proxies match the visible hull pieces.

A scan reveals a small number of physical components. The player restores emergency power, cuts structural braces with the industrial beam, pulls a cargo or reactor assembly free with the massline, recovers a black box, and leaves the wreck visibly changed. Later, the player may install a salvage core and turn the site into an automated recovery operation.

The wreck tells a short story through the object and brief fragments. No response menu appears.

---

# 2. Adaptation to top-down gameplay

“Fly through the split hull” does not mean piloting through a detailed volumetric corridor.

It means the wreck is authored as a **top-down navigable debris architecture**:

- port hull slab;
- starboard hull slab;
- command section;
- engine block;
- cargo spine;
- detached armor plates;
- a few dynamic debris pieces.

These pieces sit in the XZ gameplay plane with clear channels between them.

The player flies:

- between split hull halves;
- through a broken hangar mouth;
- around the command section;
- behind the engine block;
- along a cargo-spine corridor.

Closed solid sections remain blocked. Visible gaps remain open.

This is achievable with multi-circle collision proxies before compound OBB/capsule collision exists.

---

# 3. Scale

Minimum footprint:

- overall length: 320–600 world units;
- overall width: 180–360 world units;
- main channels: at least 55–90 world units wide, adjusted to player hull radius;
- individual hero sections: 80–220 world units;
- visible from at least 1,200 world units through silhouette/emissive cues.

The site must dwarf the player ship. A radius-nine wreck entity cannot be the hero object.

A normal-gameplay screenshot should make the player ship appear like a small craft beside a dead capital vessel.

---

# 4. Site layout

Suggested local layout:

```text
                   [COMMAND SECTION]
                       /      \
       [PORT HULL]  --          --  [STARBOARD HULL]
            \                       /
             \    [CARGO SPINE]    /
              \         |         /
                   [ENGINE BLOCK]

     detached plates / small debris outside the main channels
```

Use asymmetry. The wreck should look like it broke under directional force, not like a symmetrical model exploded radially.

Required routes:

1. **outer approach** — wide and safe;
2. **split-hull channel** — visually dramatic, medium width;
3. **cargo corridor** — narrower, component-rich;
4. optional **engine shadow** — cover/combat route.

---

# 5. Visual asset contract

## 5.1 Modeling approach

Use modular hard-surface kitbashing:

- hull slabs;
- trusses;
- bulkhead ribs;
- engine bells;
- cargo containers;
- bridge/command block;
- armor plates;
- cable bundles;
- broken end caps.

The wreck may reuse a ship-family kit at much larger scale, but it must not read as a normal ship scaled up.

## 5.2 Damage language

Required:

- torn structural ends;
- exposed internal trusses;
- uneven missing sections;
- scorch direction;
- dead and intermittent emissives;
- a few glowing emergency systems, not an entirely molten-orange hull;
- material contrast: hull metal, dark interior, insulation, cables, reactor hardware.

Forbidden final visual:

- sphere;
- asteroid with boxes;
- orange molten ball;
- one intact ship model rotated and labeled “wreck”;
- repeated cubes with no dominant silhouette;
- emissive glow used to hide absent geometry.

## 5.3 Materials

Use grounded PBR values:

- mostly rough/oxidized hull;
- limited polished surviving surfaces;
- soot/grime decal masks;
- exposed insulation or ceramic;
- selective emergency amber/red emissive;
- cool scan-reactive components;
- no cartoon outlines;
- no baked text labels in textures.

## 5.4 Three-scale review

Far:

- split capital silhouette readable.

Mid:

- hull halves, engine, command section, cargo spine distinguishable.

Near:

- braces, relays, black-box housing, cut marks, attachment points visible.

## 5.5 LOD and performance

- hero LOD near;
- simplified mid LOD;
- HLOD or merged distant silhouette;
- batch repeated trusses/panels;
- no hundreds of separate draw calls;
- no quality reduction in default route to pass.

---

# 6. Collision contract

## 6.1 Phase-one implementation

Use a parent wreck visual plus multi-circle invisible static proxies aligned to major solid sections.

Example proxy groups:

- port hull: 4–7 circles;
- starboard hull: 4–7 circles;
- engine block: 2–4 circles;
- command section: 2–3 circles;
- cargo spine: 3–5 circles.

Do not place proxies across intended channels.

## 6.2 Debug overlay

Toggle displays:

- parent origin;
- each proxy circle;
- component anchors;
- receiver/extraction zones;
- scan radius;
- massline anchors.

The overlay must be captured over the live GLB before acceptance.

## 6.3 Collision tests

- fly through split-hull channel without contact;
- hit visible port hull and bounce/stop at correct edge;
- fire projectile through open gap;
- projectile strikes visible solid section;
- no invisible central core;
- no proxy appears as a target;
- no docking/receiver volume overlaps solid proxy.

---

# 7. Component roster

Use five to seven components. More is not automatically better.

## 7.1 Power Relay A

- state: offline;
- revealed by scan;
- repairable with industrial beam and one control unit or repair kit;
- activation lights one section and reveals deeper components;
- brief fragment on completion.

## 7.2 Power Relay B

- physically separated;
- requires approach through another channel;
- may be cut off by a blocked brace or hazard;
- activation restores cargo-spine lights.

## 7.3 Port Cargo Brace

- role: cuttable;
- industrial beam work target;
- visible cut line and sparks;
- completion removes brace mesh;
- unlocks/detaches cargo module.

## 7.4 Starboard Cargo Brace

Optional second brace so extraction requires two physical positions. Do not make the player repeat five identical cuts.

## 7.5 Cargo/Weapon Module

- attached visual before cut;
- dynamic payload after braces severed;
- tetherable;
- mass appropriate for reel/throw/tow;
- may contain unique blueprint or materials.

## 7.6 Reactor Assembly

Choose one of two roles:

### Version A — physical payload

- locked by braces;
- can be pulled free;
- dangerous if thrown/impacted;
- delivered to receiver or Asteroid Ops site.

### Version B — stabilizable site component

- overheating/offline;
- industrial beam stabilizes or installs control unit;
- powers emergency systems;
- later enables automated salvage.

Do not implement both in first slice unless existing systems make it trivial.

## 7.7 Black Box

- revealed after power or scan;
- small recoverable object or component;
- collection unlocks illustrated ledger page and exact provenance;
- no choice prompt.

---

# 8. Interaction sequence

## 8.1 Discovery

Trigger:

- rumor, map bearing, or visual discovery.

Flight fragment:

> LONG-RANGE RETURN: CAPITAL HULL. NO ACTIVE REGISTRY.

Map gains fuzzy or exact site marker according to existing unique-wreck system.

## 8.2 Approach scan

Player presses scan.

Results:

- wreck name/class;
- two relay signatures;
- one structural instability;
- one hidden data source.

Do not reveal every component instantly if power restoration is part of the loop.

## 8.3 Restore emergency power

At relay:

- target component;
- target panel says `RMB REPAIR`;
- hold beam;
- beam endpoint remains on relay;
- progress ring;
- relay emissive changes from dead to active;
- local lights animate on;
- second scan may reveal cargo/black box.

Flight fragment:

> RELAY 1 ANSWERS. INTERNAL CLOCK STOPPED FORTY-THREE YEARS AGO.

## 8.4 Cut braces

At brace:

- target panel says `RMB CUT`;
- beam visual changes to cutting mode;
- heat/scorch accumulates;
- progress persists through brief interruption;
- on completion, brace mesh disappears and a small separation motion occurs;
- no ore reward toast.

Flight fragment:

> PORT SPINE FREE. MASS SHIFT DETECTED.

## 8.5 Extract payload

- `F` attaches to the detached module;
- module uses COM-to-COM tow anchor;
- player reels or pulls;
- receiver/extraction zone is visible;
- optional throw solution lets player sling the module into receiver;
- ordinary slow tow also works.

The activity should be fun at low skill and expressive at high skill.

## 8.6 Recover black box

Possible implementations:

- small magnetized pickup after housing opens;
- component recovered by close scan;
- payload socket delivered to receiver.

On recovery:

- one short fragment;
- illustrated ledger page unlocked;
- blueprint or map lead granted through owning system.

## 8.7 Persistent aftermath

After completion:

- cut braces remain gone;
- cargo module remains absent/delivered;
- powered sections remain lit or later go to low-power mode;
- black-box housing remains open;
- site state becomes `partially_recovered` or `recovered`;
- revisiting shows the changed wreck.

---

# 9. Industrial-beam modes used

The same RMB tool supports:

- **repair** on relay;
- **cut** on brace;
- ordinary **extract** on geological targets elsewhere.

Required differences:

- target label;
- beam impact VFX;
- audio cue family;
- progress language;
- completion result;
- no generic mining yield on brace/relay.

This is exactly the kind of contextual depth that adds variety without a new button.

---

# 10. Story delivery

## 10.1 Flight fragments

Maximum roughly 8–20 words each.

Examples:

> BRIDGE PRESSURE RECORD ENDS BEFORE THE IMPACT.

> CARGO CLAMPS WERE RELEASED FROM INSIDE.

> THE FINAL TRANSMISSION IS ADDRESSED TO A SHIP THAT NEVER EXISTED.

Use only a few. Silence gives the object weight.

## 10.2 Ledger page

One illustrated page:

- title;
- recovered image or scan reconstruction;
- 80–180 words;
- map/provenance;
- related object IDs;
- no response buttons.

Possible image forms:

- cinematic reconstruction of the ship before destruction;
- black-box still;
- technical damage scan;
- crew photograph;
- route map.

Do not bake text into generated image.

## 10.3 No branch deletion

The player may later:

- return;
- install salvage core;
- recover another compartment;
- follow map lead;
- use blueprint.

No initial salvage action permanently deletes unrelated story content.

---

# 11. Automated salvage follow-on

This is a later slice, not required for first physical proof.

## 11.1 Claim action

Player installs a Massline/Salvage Core at a visible socket.

Requirements:

- construction module;
- power;
- cargo receiver;
- perhaps sensor coverage.

## 11.2 Output

Site periodically produces:

- scrap;
- electronics;
- rare component chance;
- story/evidence only once.

Output leaves through:

- courier pods;
- salvage tug;
- cargo receiver.

Do not credit invisible money directly if a physical export path exists.

## 11.3 Visual evolution

- salvage core appears;
- work lights activate;
- drones move around wreck;
- stripped areas grow;
- cargo pods accumulate/launch;
- site appears on player network map.

---

# 12. Optional combat use

If enemies appear:

- one small scavenger/pirate encounter;
- wreck pieces provide actual cover;
- impulse weapon can dash enemy into hull;
- massline can use engine block as anchor;
- no complex scripted boss.

The site should remain valuable without combat.

---

# 13. State and persistence

Recommended record:

```js
{
  worldObjectId: 'wreck_cathedral_01',
  state: 'discovered',
  components: {
    relay_a: 'offline',
    relay_b: 'offline',
    brace_port: 'intact',
    brace_starboard: 'intact',
    cargo_module: 'attached',
    black_box: 'sealed'
  },
  discoveries: [],
  automation: null
}
```

Transitions are explicit and idempotent.

Save/load tests:

- after one relay;
- after one brace;
- while payload detached but not delivered;
- after delivery;
- after black-box recovery;
- after leaving and returning.

Do not reconstruct a detached module twice.

---

# 14. File/owner plan

The implementing agent must inspect current owners before choosing exact paths. A plausible separation:

- data definition: `src/data/worldSites/` or equivalent;
- world-object state owner: existing world-record/site system;
- component interaction: shared component/work system;
- beam mode resolver: mining/tool owner;
- payload spawning: world/entity helper;
- massline: reuse current tether/throw systems;
- renderer: visual manifest + GLB;
- UI: target panel/reticle only;
- story: ledger/artifact data;
- tests/scripts: focused site route and visual capture.

Do not put the entire feature into `world.js`, `visualFactory.js`, or one giant UI file.

---

# 15. Agent task decomposition

## Task A — graybox and collision

Deliver:

- top-down graybox;
- gameplay scale;
- multi-circle proxy manifest;
- debug overlay;
- navigable channels;
- no interactions yet.

Acceptance capture before art detail.

## Task B — component grammar

Deliver:

- component anchors;
- screen-space pick;
- relay/brace states;
- work progress;
- persistence;
- placeholder but distinct component visuals.

## Task C — payload extraction

Deliver:

- brace completion detaches module;
- dynamic payload;
- massline attach;
- receiver zone;
- persistence.

## Task D — final visual and story

Deliver:

- hard-surface GLB/kitbash;
- state visual variants;
- short fragments;
- ledger image/page;
- LOD/performance.

Integrate in that order.

---

# 16. Anti-placeholder acceptance contract

The slice fails if any are true:

- the hero wreck is one sphere/ball;
- the visible wreck is mostly an asteroid;
- collision remains one central radius;
- channels are visual only;
- interaction targets the parent center instead of components;
- cutting produces ore;
- “power restored” is only a toast;
- detached module is immediately converted into cargo with no physical stage;
- black box is only a mission flag;
- completion leaves the wreck visually unchanged;
- feature is reachable only through debug/query route;
- screenshots are isolated asset renders instead of gameplay;
- agent claims completion without save/load and current route evidence.

---

# 17. Final acceptance matrix

| Observable | Required proof |
|---|---|
| Monumental scale | Gameplay screenshot with player ship |
| Unique silhouette | Far-approach screenshot |
| Aligned collision | Debug-overlay screenshot and traversal test |
| Open channels | Scripted player route through at least two |
| Component selection | Cursor/reticle capture |
| Relay repair | Before/after visual and state test |
| Brace cutting | Beam contact, removed brace, persisted state |
| Dynamic payload | Live tether/tow/throw capture |
| Black-box recovery | Ledger unlock and one-time grant test |
| Persistent change | Leave/re-enter and save/reload |
| Performance | Frame/draw-call evidence in normal route |
| No hidden route | Browser and Electron/default-path proof as applicable |

---

# 18. Pasteable implementation prompt

> Implement the **Wreck Cathedral vertical slice** against the current SpaceFace repository. Read all owner `AGENTS.md` files and current world, physics, massline, mining/tool, save, render, and unique-wreck seams before editing. Do not create a generic wreck entity or a central spherical collider.
>
> The player-visible outcome is a 320–600 wu split capital wreck made of several visible hull sections with aligned multi-circle or compound collision proxies and at least two traversable channels. The player scans targetable components, repairs at least one relay with the RMB industrial beam, cuts at least one visible brace with the same beam in a distinct CUT mode, causes a cargo/reactor module to detach as a real dynamic tetherable payload, moves that payload to a visible receiver with the massline, recovers a black box, and returns after save/load to a visibly changed wreck.
>
> Before coding, return an owner/file map, state-transition table, collision manifest strategy, component schema, normal-route interaction sequence, and proof plan. Then implement in bounded stages: graybox/collision, components, payload, final presentation. Use the shared physics/event owners; do not write velocity, credits, cargo, or save data from the wrong system. A green unit test is insufficient: provide current gameplay captures with collision overlay, component reticle, before/after state, and live massline extraction. Apply the anti-placeholder contract in this brief.

<!-- END FILE: 04_WRECK_CATHEDRAL_VERTICAL_SLICE.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 05_AUTOMATION_PROGRESSION_AND_ENDGAME.md -->

# 05 — Automation, Progression, and Endgame

## 0. The question

Why build an asteroid industry?

If the answer is “earn credits to buy a gun that kills the same enemy faster,” the industrial system will eventually feel like an elaborate spreadsheet feeding a shallow combat loop.

The answer should be:

> **Industry manufactures new physical capabilities and changes the world outside the industry screen.**

The existing Asteroid Ops direction is unusually strong. Its contact-ring law, extraction-versus-preservation choice, aggregate networks, persistent Massline Core, courier pods, and eventual station assembly already point toward the right game.

This document connects that interior factory game to exterior flight, combat, navigation, story, and territorial growth.

---

# 1. Progression ladder

## Stage 0 — Scrapper

Player does:

- manual flight;
- manual mining;
- manual salvage;
- ordinary station trade;
- basic massline attachment.

Outputs:

- raw materials;
- first control units;
- basic credits.

New question:

- which rock or wreck is worth attention?

## Stage 1 — Prospector

Unlocks:

- richer scans;
- geological formation information;
- component topology;
- better drilling;
- first deployable survey beacon.

Outputs:

- precise site knowledge;
- materials selected for purpose rather than only value.

New verb:

- **read** matter before consuming it.

## Stage 2 — Foreman

Unlocks:

- Massline Core;
- extractor;
- gas tap;
- cargo port;
- first courier pod;
- remote construction queue after core.

Outputs:

- persistent asteroid site;
- continuous raw production;
- visible exports.

New verbs:

- **anchor**
- **place**
- **automate**

## Stage 3 — Engineer

Unlocks:

- refinery;
- fabricator;
- power/material networks;
- thermal or signature management;
- specialized tools and deployables.

Outputs:

- refined materials;
- electronics;
- replacement couriers;
- impulse charges;
- massline heads;
- sensor modules.

New verbs:

- **transform**
- **fabricate**
- **configure**

## Stage 4 — Network Builder

Unlocks:

- shuttle docks;
- route beacons;
- sensor relays;
- transfer beams;
- convoy/freighter tiers;
- defense platforms;
- acceleration infrastructure.

Outputs:

- multi-site logistics;
- visible traffic;
- regional reach;
- reduced manual hauling.

New verbs:

- **connect**
- **route**
- **protect**

## Stage 5 — Constructor

Unlocks:

- station assembly frame;
- orbital structures;
- gravity/acceleration devices;
- shipyard modules;
- large receivers and launch drivers.

Outputs:

- new destinations;
- new trade routes;
- new respawn/repair/industry hubs;
- altered sector geometry and traffic.

New verbs:

- **assemble**
- **settle**
- **reshape**

## Stage 6 — Regional Power

Unlocks:

- autonomous construction;
- settlement seeding;
- mass-driver networks;
- wormhole/gravity anchors;
- capital-scale industrial projects;
- player security or outlaw networks.

Output:

- the galaxy’s map, traffic, danger, and economy visibly depend on the player’s network.

New verb:

- **govern**, expressed through infrastructure rather than a taxation menu.

---

# 2. What industry should manufacture

## 2.1 Tool capability

- industrial-beam heads;
- survey probes;
- component scanners;
- salvage cutters;
- repair emitters;
- trajectory computers;
- cargo receivers;
- line-tension radiators.

## 2.2 Physics combat capability

- impulse charges;
- concussion slugs;
- gravity pucks;
- repulsor capacitors;
- RCS disruptor assemblies;
- recoil-lance components;
- anchor charges;
- line cutters.

## 2.3 Mobility

- acceleration-ring sections;
- navigation relays;
- jump stabilizers;
- fuel processors if fuel remains;
- gravity-assist computers;
- teleport/shortcut infrastructure only at high tier;
- massline traversal pylons.

## 2.4 World infrastructure

- sensor mast;
- cargo port;
- shuttle dock;
- orbital receiver;
- defense satellite;
- customs scanner;
- repair tug;
- refinery module;
- station frame segment;
- habitat module.

## 2.5 Automation

- courier pods;
- shuttle drones;
- mining drones;
- construction drones;
- salvage drones;
- repair drones;
- route-control units.

## 2.6 Narrative/exploration

- black-box decoder;
- alien signal translator;
- deep survey array;
- vault key components;
- map reconstruction computer.

The industrial chain produces access to new mysteries, not only money.

---

# 3. Resource-chain design

## 3.1 Branching, not one trunk

A healthy graph has multiple uses for the same intermediate.

Example:

```text
silicate matrix
  → regocrete → structures / station frames
  → purified silica → electronics / sensors / guidance
  → optical glass → scan arrays / beam components

iron and metallic ore
  → refined metal → machines / hulls / projectiles
  → high-density alloy → massline heads / armor / rails

volatiles
  → coolant → thermal management
  → propellant → courier/shuttle operations
  → explosive precursor → impulse ordnance

crystals/exotics
  → field resonator → gravity/massline technology
  → precision optics → advanced beam and scanner
  → research artifact → story/exploration unlock
```

The player chooses what capability to pursue.

## 3.2 Avoid unnecessary intermediates

Every material stage should justify itself through at least two uses or one major visible payoff.

Do not create twelve nearly identical alloys because factory games have long recipe trees.

## 3.3 Local versus imported parts

Early structures should require:

- abundant local mass;
- one or two imported control/precision parts.

Later, the player learns to manufacture those parts and closes the loop.

This gives cargo and travel meaning without survival chores.

---

# 4. Production constraints that create strategy

Use constraints that arise from building, geography, and risk.

Good constraints:

- geological contact;
- intact formations;
- power;
- heat;
- lane throughput;
- physical export port;
- route danger;
- site signature;
- construction space;
- specialized resources;
- receiver capacity;
- command range.

Poor default constraints:

- arbitrary wages;
- constant condition decay;
- repeated refueling of every machine;
- per-minute tax;
- invisible worker happiness;
- manual collection after automation is supposedly complete.

## 4.1 Idle is acceptable

When input is absent:

- production stops;
- nothing silently dies;
- the player gets a clear readout;
- restart is straightforward.

## 4.2 Failure should create a situation

Examples:

- courier loss leaves recoverable wreck;
- overheated machine faults and needs one repair action;
- route attack becomes a visible encounter;
- export backlog causes physical pod accumulation;
- sensor outage hides route risk;
- high signature attracts a raid.

The result becomes gameplay.

---

# 5. Exteriorization law

Every important interior upgrade should have an exterior manifestation.

| Interior change | Exterior result |
|---|---|
| Massline Core | visible anchor/socket and persistent site marker |
| Extractor | work lights, drill heads, occasional material movement |
| Cargo Port | storage modules and pod launches |
| Fabricator | constructed drones or modules emerge |
| Sensor Mast | scan pulses and map coverage |
| Shuttle Dock | reusable traffic appears |
| Turret Pylon | physical defense and combat response |
| Transfer Beam | visible beam between asteroids |
| Launch Driver | cargo projectile arcs |
| Assembly Frame | station visibly grows |
| Quiet-running policy | lower lights/traffic/signature |
| Overheated site | plume, alarms, reduced movement |

If the exterior remains an unchanged asteroid while a ledger says “industrial complex,” the progression has failed.

---

# 6. Routes as player-built capabilities

## 6.1 Route components

A route may consist of:

- origin cargo port;
- destination receiver;
- navigation beacon chain;
- sensor coverage;
- transport vehicles;
- escort/defense coverage;
- policy.

## 6.2 Route metrics

Keep the strategic readout compact:

- throughput;
- cycle time;
- loss risk;
- current backlog;
- vehicles required;
- last incident.

## 6.3 Materialization

Player absent:

- deterministic statistical resolution.

Player near:

- actual courier/hauler entities;
- real manifest;
- real attackers;
- outcome from play.

## 6.4 Player intervention

The player can:

- escort;
- reroute;
- add sensor node;
- build defense;
- deliberately run quiet;
- recover losses;
- rob competing routes;
- intercept hostile supplies.

---

# 7. Infrastructure projects

## 7.1 Navigation relay

Cost:

- structure mass;
- electronics;
- optical components.

Effect:

- reveals neighboring route/market/traffic data;
- provides waypoint;
- improves autopilot reliability;
- becomes a visible beacon.

## 7.2 Acceleration ring

Cost:

- high-density alloy;
- field resonators;
- large power.

Effect:

- applies directional impulse to ships through ring;
- reduces travel time along a route;
- can be used tactically;
- may require alignment/repair.

This is a new movement verb, not a percentage hidden in map UI.

## 7.3 Sensor network

Several nodes produce:

- convoy visibility;
- anomaly bearings;
- lower ambush risk;
- market intelligence;
- cloak counterplay.

Nodes are orbiters/beacons that can be attacked or repaired.

## 7.4 Defense platform

Physical object:

- follows clear engagement rules;
- protects route/site;
- can be disabled by components;
- creates safe pocket;
- does not require player fleet AI.

## 7.5 Orbital receiver

Catches mass-driver cargo or surface launches. Makes planets and industry connect.

## 7.6 Salvage core

Installed at major wreck. Generates drones and output, changes visual state.

## 7.7 Station frame

A multi-stage persistent structure:

1. command spine;
2. power;
3. cargo;
4. industry;
5. habitation/services;
6. defense/shipworks.

Build order can change function without locking out later modules.

## 7.8 Gravity/wormhole anchor

Late game:

- stabilizes anomaly;
- opens route;
- requires large power and rare materials;
- becomes a regional landmark.

---

# 8. Multiple endgame fantasies, all eventually accessible

The player dislikes losing story or content through exclusive choices. Endgame paths should be specializations or orders of expansion, not permanent lockouts.

## 8.1 Industrial lattice

Build dense production and stations.

Payoff:

- high fabrication;
- ship/tool construction;
- visible traffic;
- large projects.

## 8.2 Mobility network

Build acceleration rings, relays, and gravity anchors.

Payoff:

- fastest traversal;
- shortcut control;
- strategic interception.

## 8.3 Information network

Build sensors, survey arrays, and archives.

Payoff:

- hidden worlds/wrecks;
- market forecasts;
- anomaly access;
- illustrated story corpus.

## 8.4 Security network

Build patrol relays and defense platforms.

Payoff:

- safer routes;
- civilian traffic growth;
- rescue and construction events;
- control over dangerous regions.

## 8.5 Outlaw network

Build hidden receivers, stealth routes, and salvage fences.

Payoff:

- robbery, contraband, stolen technology;
- secret destinations;
- hostile traffic manipulation.

The player may eventually build all of them. Their order changes experience.

---

# 9. Progression rewards by category

Every milestone should grant a mix:

### Physical

- visible module;
- new site;
- new route;
- new traffic;
- changed landmark.

### Mechanical

- new verb;
- new combination;
- new target type;
- new field;
- new deployable.

### Informational

- map;
- scan capability;
- ledger page;
- recipe;
- market knowledge.

### Economic

- throughput;
- reduced manual work;
- new goods;
- new buyers.

Do not make economic value the only reward.

---

# 10. Suggested first exterior payoff chain

## Milestone A — one productive asteroid

The existing Asteroid Ops goal:

- core;
- extractor;
- gas generation;
- refinery;
- fabricator;
- cargo port;
- one courier every roughly two minutes.

Exterior:

- modified asteroid;
- visible port;
- pod launch.

## Milestone B — one physics tool

Fabricate an impulse charge or specialized massline head from site output.

Player immediately uses it in flight. Industry now feeds the game’s toy.

## Milestone C — one route

Build receiver/beacons to send output to a station.

Visible courier traffic appears.

## Milestone D — one route incident

A courier loss materializes as wreck/ambush. Player intervenes.

Industry now creates world events.

## Milestone E — one infrastructure upgrade

Use materials to build a sensor mast or acceleration pylon.

Sector travel/information changes.

## Milestone F — station frame

Several sites contribute components to a visible frame.

The exterior world transforms.

---

# 11. “Revenue for what?” answer in one table

| Revenue/material surplus funds | Player payoff |
|---|---|
| Better extractor | more design freedom and production capacity |
| Tool head | new component interaction |
| Impulse ordnance | new combat/mobility verb |
| Sensor array | new discoveries and route knowledge |
| Courier fleet | automates hauling |
| Salvage core | converts wreck into persistent operation |
| Acceleration ring | faster and more expressive traversal |
| Defense platform | changes local safety and traffic |
| Orbital receiver | links planets to logistics |
| Station frame | creates new destination and services |
| Shipyard | constructs specialized hulls/tools |
| Gravity anchor | opens late-game route/anomaly |
| Construction fleet | seeds new sites without manual commissioning |

---

# 12. Non-goals and failure modes

## 12.1 Passive-credit trap

Failure:

- site produces credits directly;
- player never sees goods move;
- income only buys stat upgrades.

Correction:

- produce matter, machines, routes, and world changes;
- credits are one settlement mechanism.

## 12.2 Idle-game escalation

Failure:

- exponential production;
- infinite factories;
- game becomes menu optimization.

Correction:

- geography, route capacity, physical sites, signature, and world projects bound growth;
- focus on new capability tiers.

## 12.3 Every machine is “produce X”

Correction:

Machine verbs must include:

- extract;
- generate;
- transform;
- fabricate;
- store;
- route;
- sense;
- cool;
- defend;
- assemble;
- launch;
- receive.

## 12.4 Exterior is cosmetic

Failure:

- asteroid ledger says “factory” but exterior remains ordinary rock.

Correction:

- every major machine has exterior projection or traffic result.

## 12.5 Chore expansion

Failure:

- every site demands repair, fuel, wages, and manual collection.

Correction:

- default stability;
- event-driven failures;
- automation actually removes old labor.

---

# 13. Agent-ready rule

Any new Asteroid Ops or automation task must answer before implementation:

1. What manual verb does this automate?
2. What new design decision replaces the automated labor?
3. What physical exterior result appears?
4. What new capability does the output enable?
5. What happens when input is absent?
6. What world event can emerge from the system?
7. How is it proven in normal play?

If the answers are “mine faster,” “earn more,” and “a number changes,” reject the feature.

<!-- END FILE: 05_AUTOMATION_PROGRESSION_AND_ENDGAME.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 06_STORY_LEDGER_AND_IMAGE_PIPELINE.md -->

# 06 — Story Ledger and Image Pipeline

## 0. Story objective

Tell a large story without:

- stopping the player for long conversations;
- requiring animated cutscenes;
- relying on low-quality synthetic voice;
- forcing dialogue choices;
- permanently hiding story branches;
- expecting players to read mission prose before following a waypoint.

The story should feel like **evidence accumulating around the player’s actions**.

---

# 1. Three-layer delivery

## 1.1 Flight fragments

Short, automatic, non-blocking.

Length:

- usually 8–20 words;
- rarely two short lines.

Triggers:

- first scan;
- component activation;
- entering a landmark;
- witnessing an NPC event;
- recovering an object;
- finishing construction stage.

Examples:

> THE RECEIVER IS STILL TRACKING A CONVOY THAT VANISHED YEARS AGO.

> RELAY 2 WAS DISABLED MANUALLY. THE IMPACT CAME LATER.

> SURFACE LAUNCH DETECTED. NO COLONY ANSWERS THE MANIFEST.

Presentation:

- stylistic font;
- strong hierarchy;
- 2–5 seconds;
- fade without input;
- stored in ledger automatically;
- critical information also represented by waypoint/target state.

Do not make mission completion depend on reading it.

## 1.2 Physical evidence

The strongest story channel:

- wreck layout;
- missing cargo;
- powered/disabled component;
- route record;
- ship manifest;
- station construction;
- black box;
- faction markings;
- scarred planet;
- convoy behavior;
- abandoned machinery.

The world should make the fragment plausible.

## 1.3 Illustrated ledger page

Optional, persistent, readable later.

Page contains:

- title;
- image or technical illustration;
- 80–180 words;
- location and date if known;
- related people/factions/sites;
- map annotation;
- discovered evidence list;
- follow-up lead.

No choices. No “Continue” button chain.

---

# 2. Story threads remain additive

A thread may have:

- prerequisites;
- discoveries;
- physical state changes;
- consequences;
- follow-up locations.

It should not ordinarily have:

- one irreversible response that deletes two other threads;
- replay-only content;
- a morality menu;
- a requirement to restart the campaign.

Player actions may change:

- order;
- context;
- difficulty;
- reward;
- who occupies a site;
- what a later ledger page says.

The underlying locations and major evidence remain accessible whenever physically plausible.

---

# 3. Artifact-page data model

```js
{
  id: 'artifact_vigilant_bridge_clock',
  threadId: 'thread_vigilant',
  order: 3,
  title: 'The Clock Stopped First',
  deck: 'Recovered bridge telemetry',
  unlock: {
    event: 'component:stateChanged',
    parentId: 'wreck_isc_vigilant',
    componentId: 'relay_bridge',
    nextState: 'active'
  },
  imageRef: 'assets/story/vigilant/bridge_clock.webp',
  body: [
    'The bridge clock stopped eleven minutes before the hull broke.',
    'The impact report was appended afterward by an emergency recorder...'
  ],
  map: {
    sectorId: 'sector_veil_nebula',
    markerId: 'wreck_isc_vigilant'
  },
  related: ['person_...', 'faction_scn'],
  leads: ['artifact_vigilant_receiver_log']
}
```

System requirements:

- one-time unlock;
- deterministic;
- persisted IDs;
- unread/read state;
- no raw credits/cargo writes;
- optional notification;
- accessible from Ship’s Ledger.

---

# 4. Mission/objective separation

The player may ignore prose and still understand:

- where to go;
- what target matters;
- what action is available;
- what changed.

Objective UI:

> VIGILANT RECOVERY  
> Search the marked bearing  
> 0/2 relays active

Story UI:

> THE CLOCK STOPPED FIRST

These are related but not conflated.

---

# 5. Story image types

Use several visual forms so the ledger does not become a gallery of identical portraits.

## 5.1 Cinematic reconstruction

A believable still of:

- battle;
- convoy;
- station before destruction;
- character in environment;
- orbital event.

## 5.2 Recovered photograph

- crew;
- work team;
- family;
- station opening;
- ship commissioning.

## 5.3 Technical scan

- wreck damage map;
- component diagram;
- trajectory;
- signal analysis;
- planet anomaly.

## 5.4 Treasure or route map

- annotated star chart;
- cargo route;
- hand-marked bearing;
- smuggler lane.

## 5.5 Security still

- grainy customs image;
- silhouette;
- dock camera;
- unidentified ship.

## 5.6 Propaganda or archival material

Use sparingly:

- faction poster;
- industrial prospectus;
- memorial image.

Text should be HTML/CSS overlay, not generated inside the image unless the distorted artifact itself matters and exact spelling is not required.

---

# 6. Art direction: preventing cartoon drift

Image models often interpret “sci-fi character portrait” as pulp illustration, comic art, or painterly concept art. Avoid those trigger phrases when realism is desired.

## 6.1 Character prompt language

Prefer:

> cinematic live-action casting portrait; photorealistic production still; physically plausible human anatomy and skin; 85mm lens; restrained documentary lighting; practical wardrobe with worn industrial materials; neutral or guarded expression; natural asymmetry; subtle film grain; grounded contemporary science-fiction production design; no visible text.

Explicitly exclude:

> no illustration, no painted concept art, no comic-book rendering, no cel shading, no thick outlines, no retro pulp cover, no 1950s magazine art, no exaggerated heroic pose, no plastic skin, no anime.

## 6.2 Battle/ship prompt language

Prefer:

> photorealistic cinematic production still of a physically constructed hard-surface spacecraft; believable scale cues; grounded PBR metal, ceramic insulation, soot, thermal discoloration, and practical emissive lighting; restrained lens effects; documentary framing; deep space black levels; asymmetric battle damage; no text.

Exclude:

> no cartoon, no painterly brushwork, no toy-like proportions, no glowing fantasy ornament, no clean showroom render, no retro pulp poster.

## 6.3 Technical image prompt language

Prefer:

> high-resolution forensic spacecraft scan visualization; orthographic damage reconstruction; precise silhouettes; restrained monochrome/cyan instrument palette; fine grid and vector overlays added later in HTML; no baked labels or illegible generated typography.

## 6.4 Generation workflow

Do not ship the first generated image.

1. Generate a contact sheet or several candidates.
2. Reject candidates that violate realism, anatomy, faction identity, or scale.
3. Select one visual direction.
4. Generate consistent follow-up views using the selected image as reference where tooling permits.
5. Crop and color-grade consistently.
6. Store prompt, source, license/provenance, and selected asset ID.
7. Review inside the actual ledger UI.

---

# 7. Image style bible

Create a small reference package containing:

- three approved character portraits;
- three approved ship/world stills;
- two technical scans;
- palette;
- grain/contrast target;
- lens/framing rules;
- wardrobe/material rules;
- forbidden styles.

Every image-generation agent must be given the bible or approved references.

Consistency matters more than each image being individually extravagant.

---

# 8. UI composition

## 8.1 Ledger page

Suggested structure:

- large image occupying 45–60% of page;
- title and deck;
- concise body;
- evidence chips;
- small map/location block;
- next/related items;
- no giant navigation chrome.

## 8.2 Flight fragment

- edge or upper-third placement, not center obstruction;
- max two lines;
- high contrast;
- brief icon/category;
- optional “LOGGED” state;
- no click required.

## 8.3 Discovery montage without cutscene

For a major event:

1. camera briefly eases toward live object;
2. one fragment appears;
3. one or two live component lights change;
4. ledger image unlocks;
5. control remains available or returns immediately.

This produces cinematic punctuation without Blender animation.

---

# 9. Story through construction

The player’s industrial expansion should generate story:

- first site receives a name;
- first lost courier leaves a wreck;
- first station frame attracts workers/raiders;
- a faction reacts through traffic and news;
- an old artifact becomes part of a new machine;
- a region changes from empty to inhabited.

The Ship’s Ledger can record:

- “first production” pages;
- before/after site images;
- route incident maps;
- named constructed stations;
- recovered components installed in new structures.

The player’s own history becomes the longest story thread.

---

# 10. Open storyline structure

Use a graph where nodes unlock but do not delete peers.

```text
rumor
  → site discovery
      → physical evidence A
      → physical evidence B
      → construction consequence
      → faction response
      → deeper location
```

If the player strips a component before reading it:

- the evidence may be recovered from the detached payload;
- a later analyst may interpret it;
- the page changes context;
- the thread is not simply lost.

## 10.1 Soft consequences

Instead of branch deletion:

- different text;
- different route;
- different occupant;
- different price/reputation;
- different visual state;
- delayed access;
- extra repair/material requirement.

---

# 11. Audio policy

Do not block story work on a music or voice pipeline.

Use current audio only for:

- short confirmation cue;
- radio/static texture;
- impact/relay sounds;
- environmental loops;
- optional abstract voice fragments if quality is acceptable.

Text and images carry narrative authority until an authored audio pipeline exists.

Avoid promising “the score tells the story” without an actual composition and implementation workflow.

---

# 12. First story package

Build one five-page thread around the Wreck Cathedral.

1. **The Missing Convoy** — route map.
2. **Capital Hull Located** — cinematic exterior still.
3. **The Clock Stopped First** — technical bridge scan.
4. **Released From Inside** — cargo-clamp evidence.
5. **What Was Carried** — recovered photograph or device image.

Unlock through physical actions. No dialogue choices.

---

# 13. Acceptance

- player can ignore every page and still complete gameplay;
- each page is unlocked by a real event;
- no page duplicates mission instructions;
- images share a consistent style;
- no cartoon portrait slips through realism brief;
- no generated text is relied upon inside image;
- ledger persists read/unread;
- story threads do not disappear due to arbitrary first choice;
- flight fragments are short and non-blocking;
- at least one world object visibly supports each story claim.

---

# 14. Pasteable image-generation prompt: realistic character

> Create a cinematic live-action casting portrait for a grounded hard-science-fiction game. The subject is [CHARACTER DESCRIPTION]. Photorealistic production still, physically plausible anatomy and natural skin texture, restrained documentary lighting, 85mm lens, shallow but believable depth of field, subtle film grain, practical worn industrial clothing, small signs of real use and fatigue, neutral guarded expression, natural asymmetry, contemporary prestige-TV science-fiction production design. Dark simple environment with one contextual industrial detail. No visible text. No illustration, no painted concept art, no comic-book rendering, no cel shading, no thick outlines, no retro pulp-cover style, no 1950s science-fiction magazine look, no anime, no exaggerated heroic pose, no plastic skin.

# 15. Pasteable image-generation prompt: wreck evidence

> Create a photorealistic cinematic production still of [WRECK/EVENT DESCRIPTION] for a grounded top-down space game’s evidence ledger. The vessel is a physically constructed hard-surface machine at enormous scale, with readable structural sections, practical trusses, ceramic insulation, PBR metal and roughness, soot, asymmetric impact damage, torn bulkheads, restrained emergency emissives, and small scale cues from utility craft. Documentary framing, deep-space black levels, restrained lens effects, believable lighting and exposure. No text, no cartoon styling, no painterly concept-art brushwork, no toy proportions, no molten glowing ball, no intact ship merely rotated, no retro pulp poster.

<!-- END FILE: 06_STORY_LEDGER_AND_IMAGE_PIPELINE.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 07_AGENT_EXECUTION_CONTRACT.md -->

# 07 — Agent Execution Contract

## 0. Purpose

This document exists because language-model coding agents often interpret vague ambition as permission to produce the smallest artifact that can be described with the requested noun.

Examples:

- “wreck” becomes an orange sphere with boxes;
- “miner” becomes an ordinary NPC with a role label;
- “station collision” becomes one core radius;
- “story” becomes a toast;
- “advanced graphics” becomes more bloom;
- “living sector” becomes a higher spawn count;
- “gravity” becomes a circular damage zone;
- “automation” becomes passive credits;
- “dogfight mode” becomes direct cursor-to-yaw mapping and uncontrolled spin.

The contract forces the agent to define and prove the player-visible outcome before coding.

---

# 1. Pre-coding response required

Before editing, the agent must return the following.

## 1.1 Player-observable contract

A table:

| Observable | Input | Immediate feedback | State change | Persistent consequence |
|---|---|---|---|---|

If the feature has no meaningful state change or persistent/world consequence, say so and justify why it is still a toy.

## 1.2 Existing-system reuse map

List:

- current owner system;
- event/API to reuse;
- data catalog to extend;
- save owner;
- renderer seam;
- input seam;
- test/capture pattern.

The agent must search the current tree. It may not rely only on an old design document.

## 1.3 Anti-placeholder criteria

The agent must write:

> “A technically minimal fake of this feature would look like…”

Then list the shortcuts that the implementation and acceptance tests will prevent.

Example for a wreck:

- one generic sphere;
- one central collider;
- one `salvagePool`;
- one label;
- one progress timer;
- no visual state change.

## 1.4 Dependency/risk statement

Classify:

- data-only;
- presentation;
- input;
- physics;
- save;
- AI;
- UI;
- asset;
- performance.

Identify shared-tree/high-conflict files.

## 1.5 Proof plan

Name:

- focused deterministic tests;
- default-route script;
- headed browser capture;
- collision/debug overlay;
- save/load checkpoint;
- performance evidence;
- broad regression commands.

No implementation begins until this plan is coherent.

---

# 2. Definition of done

A player-facing feature is complete only when:

1. **Reachable:** normal browser/player route reaches it without a debug query, state injection, or console call.
2. **Embodied:** the visible asset/state exists at gameplay scale.
3. **Interactive:** real input acts on the intended target.
4. **Legible:** feedback announces what is armed and what changed.
5. **Systemic:** owning systems receive events through correct seams.
6. **Persistent:** save/load or deliberate ephemerality is tested.
7. **Performant:** normal scene remains within agreed budgets.
8. **Captured:** current footage/screenshot proves the result.
9. **Reviewed:** the evidence is assessed against the visual/gameplay brief, not merely attached.
10. **Recoverable:** code, assets, manifests, and evidence are committed or otherwise durably represented according to project policy.

“Code exists” is an implementation milestone, not completion.

---

# 3. Forbidden shortcuts

## 3.1 Representation shortcut

Forbidden:

- using a label to substitute for behavior;
- using lore to substitute for geometry;
- using a glow to substitute for detail;
- using a generic asset to substitute for a hero silhouette;
- using a timer to substitute for an interaction;
- using a data tag to substitute for NPC work.

## 3.2 Collider shortcut

For non-spherical hero objects:

- do not use one sphere/circle as final collision;
- do not place an unrelated solid core;
- do not make the visible docking bay collidable;
- do not accept visual gaps that are physically closed.

## 3.3 UI shortcut

- do not create a new full-screen panel when a target reticle, shared site screen, existing station screen, or contextual overlay suffices;
- do not hide a missing world interaction behind “press E to open management”;
- do not add a new button without input-budget review;
- do not use a modal confirmation for an action that can be physically reversible.

## 3.4 Data-only shortcut

A new catalog row is not a feature unless:

- it is loaded;
- materialized;
- reachable;
- presented;
- interacted with;
- persisted where required.

## 3.5 Test shortcut

Forbidden:

- unit test proves object definition exists;
- source grep proves feature;
- expected telemetry edited to match regression;
- screenshot from isolated asset viewer;
- debug injection skips travel, eligibility, state, or input;
- hidden feature flag treated as player acceptance.

## 3.6 Art shortcut

Forbidden final hero asset:

- primitives with no silhouette plan;
- random boxes around a sphere;
- unmodified stock model;
- texture-only faction variation;
- emissive overload;
- cartoon concept image where realism was requested;
- no gameplay-camera review;
- no LOD/collision/provenance.

## 3.7 System-owner shortcut

Do not:

- write credits outside economy;
- write cargo outside cargo helpers/events;
- write reputation outside factions;
- write derived ship stats outside ships;
- write velocities directly when physics service exists;
- duplicate world/state authority;
- use wall clock in deterministic simulation.

---

# 4. Player-visible outcome format

Use this structure in every task brief.

## Feature name

### Player fantasy

One sentence.

### Exact player sequence

Numbered inputs and observations.

### New verb

State the genuinely new action. If none, explain the combination or world process that creates value.

### Existing systems reused

Name exact current files/events after inspection.

### State transition

Before → action → after.

### Visible transformation

What changes in the world.

### Non-goals

Explicitly bound ambition.

### Failure modes

List specific cheap substitutes.

### Acceptance evidence

Tests, route, capture, performance.

---

# 5. Minimum-observable floors

Numbers are not a substitute for taste, but minimum observables prevent pathological minimalism.

## 5.1 Hero wreck

Must have:

- multiple major hull sections;
- dominant silhouette;
- aligned multi-part collision;
- navigable gap;
- targetable components;
- at least one detached payload;
- persistent visual state.

## 5.2 Station

Must have:

- visible approach;
- aligned docking corridor;
- at least one function visible through traffic or machinery;
- scale hierarchy;
- no central-core docking requirement.

## 5.3 NPC job

Must have:

- authored origin and destination;
- phase state machine;
- visible work behavior;
- manifest/output;
- threat handoff;
- offscreen progression or explicit scope;
- player intervention.

## 5.4 Hazard

Must alter at least one of:

- motion;
- sensor information;
- projectile path;
- access timing;
- component state;
- resource availability.

A pure damage-over-time circle is not sufficient unless paired with another mechanical dimension.

## 5.5 Sector identity

Must have:

- one unique sentence;
- separated pockets;
- visible route;
- hero silhouette;
- local mechanical condition;
- persistent consequence.

## 5.6 Story artifact

Must have:

- real unlock event;
- physical evidence;
- concise optional page;
- consistent image style;
- no mandatory choice;
- no content deletion without physical reason.

---

# 6. Named technical language for prompts

When asking for quality, specify the technique.

## Physics/control

- proportional-derivative controller;
- pure-pursuit path following;
- curvature-aware speed profile;
- target-relative pursuit slot;
- body-frame acceleration command;
- analytic orbit;
- softened inverse-square field;
- spatial-hash broad phase;
- swept-circle collision;
- compound collider;
- capsule/OBB narrow phase;
- deterministic fixed-step integration;
- impulse provenance;
- bounded assist through actuator commands.

## Rendering/assets

- silhouette-first graybox;
- top-down gameplay-camera blockout;
- modular hard-surface kitbashing;
- beveled edges with weighted normals;
- physically based metal/roughness;
- trim sheet;
- decal atlas;
- emissive hierarchy;
- screen-space constant-width line;
- instancing;
- HLOD;
- occlusion/readability review;
- collision-proxy sidecar;
- GLB named-node/component anchors;
- same-framing before/after capture.

## UI

- contextual target reticle;
- progressive disclosure;
- event-driven state updates;
- no per-frame DOM rebuild;
- accessible focus order;
- reduced-motion behavior;
- screen-space pick radius;
- direct manipulation;
- shared component inspector;
- non-modal feedback.

## AI/world

- finite-state job controller;
- authored waypoint route;
- arrival steering;
- velocity matching;
- offscreen virtualization;
- deterministic materialization;
- combat-doctrine handoff;
- causal manifest;
- activity pocket;
- route graph.

---

# 7. Visual-production workflow

## 7.1 Graybox first

Before detail:

- place player ship beside object;
- establish gameplay scale;
- validate silhouette at far/mid/near distances;
- author collision;
- validate approach routes;
- capture.

Do not spend tokens detailing an unusable shape.

## 7.2 Concept reference

Image generation creates reference, not proof.

Require:

- top-down/three-quarter reference;
- side or profile where structure matters;
- material notes;
- damage/state variants;
- explicit realism style;
- no text baked into art.

## 7.3 Modular build

Use kits:

- structural;
- functional;
- damage;
- connectors;
- detail;
- materials.

A hero asset may be unique in composition while reusing kit modules.

## 7.4 Gameplay acceptance

Review:

- normal camera;
- motion;
- fog/lighting;
- HUD;
- neighboring objects;
- actual scale;
- actual LOD;
- actual collision.

## 7.5 Reject and iterate

The agent must be permitted—and required—to reject its own first asset.

A pipeline that always ships candidate one is not an art pipeline.

---

# 8. Image-generation anti-cartoon contract

When realism is requested, include:

- photorealistic cinematic production still;
- live-action casting;
- grounded hard-science-fiction production design;
- practical materials;
- physically plausible anatomy;
- natural asymmetry;
- restrained lighting;
- documentary framing;
- no illustration;
- no painted concept art;
- no comic rendering;
- no cel shading;
- no retro pulp cover;
- no exaggerated heroic pose;
- no toy-like proportions.

Do not use “1950s sci-fi,” “pulp,” “retro-futurist illustration,” or generic “concept art” unless that style is explicitly wanted.

---

# 9. Control-system development protocol

Control bugs are difficult because vague “feel better” requests cause agents to tune symptoms.

For any control feature:

## 9.1 Define frames

- world frame;
- ship/body frame;
- target-relative frame;
- tether radial/tangent frame;
- screen frame.

State which frame each input controls.

## 9.2 Define command

Does input command:

- position;
- velocity;
- acceleration;
- heading;
- angular rate;
- orbit bearing;
- range;
- path?

Never leave this ambiguous.

## 9.3 Define plant limits

- max thrust;
- lateral thrust;
- yaw acceleration;
- yaw rate;
- drag;
- mass;
- tether length/tension.

## 9.4 Define controller

Write equation or pseudocode.

## 9.5 Define override

What cancels assistance and how quickly?

## 9.6 Debug overlay

Show:

- desired state;
- actual state;
- error;
- command;
- saturation;
- active mode.

## 9.7 Scenario matrix

Test across hulls, speeds, target motion, and extreme initial conditions.

---

# 10. Physics-feature protocol

Before adding a force effect:

1. specify force versus impulse;
2. specify mass response;
3. specify source recoil/momentum policy;
4. specify player damage asymmetry;
5. specify projectile/payload filters;
6. specify falloff;
7. cap magnitude;
8. route through physics owner;
9. emit provenance;
10. visualize field/impact.

---

# 11. NPC-job protocol

Before adding an NPC role:

1. origin;
2. destination;
3. route;
4. phase list;
5. visible work;
6. produced/transported thing;
7. threat behavior;
8. offscreen progression;
9. player intervention;
10. state/manifest scan.

If any of these are absent, the NPC is probably another wanderer with a label.

---

# 12. Sector-content protocol

Before populating a sector:

1. write one unique identity sentence;
2. draw pocket/route map;
3. choose hero silhouette;
4. choose one local mechanical condition;
5. choose one causal NPC loop;
6. choose one player-caused persistent change;
7. set far/mid/near visual reads;
8. place entry routes;
9. verify travel time;
10. capture ten minutes of ordinary play.

Do not begin by duplicating the existing station/asteroid/enemy bundle.

---

# 13. Prompt template — implementation planning

> You are planning one bounded SpaceFace gameplay slice against the current repository. Read the root and nested `AGENTS.md` files, current architecture/status authority, and the live owner files before proposing edits. Old plans are context, not proof.
>
> Feature: **[NAME]**
>
> Player-visible outcome: **[ONE PARAGRAPH]**
>
> Required inputs and sequence:
> 1. [INPUT/ACTION]
> 2. [INPUT/ACTION]
> 3. [VISIBLE/PERSISTENT RESULT]
>
> The new verb or combination is: **[VERB]**
>
> Before coding, return:
> - player-observable contract table;
> - owner/file/event map;
> - anti-placeholder criteria;
> - state-transition model;
> - physics/control equations where relevant;
> - asset/collision/component manifest plan;
> - normal-route proof plan;
> - save/load and performance risks;
> - bounded implementation stages.
>
> Do not satisfy this with a label, generic sphere, central collider, toast, hidden flag, data-only row, isolated asset render, or new modal UI. Reuse owners and event seams. A unit test is not player acceptance.

---

# 14. Prompt template — coding session

> Implement the approved **[NAME]** slice. Preserve the current repository’s single-writer, deterministic, public-route, asset, input, accessibility, and shared-tree contracts. Inspect `git status --short` and file-specific diffs before edits; do not destroy concurrent work.
>
> Work in logical stages and verify each:
> 1. [FOUNDATION]
> 2. [INTERACTION]
> 3. [PERSISTENCE]
> 4. [PRESENTATION]
> 5. [NORMAL-ROUTE PROOF]
>
> At each stage report:
> - files changed;
> - exact player-visible outcome now reachable;
> - focused tests run;
> - remaining gaps.
>
> Do not claim completion until the player can reach it through ordinary input and current browser footage proves the intended visual/physical result. Include debug-overlay evidence where collision/control is involved and same-framing before/after evidence where state changes.

---

# 15. Prompt template — visual asset

> Build a gameplay-ready **[ASSET]**, not a symbolic representation. Start with a silhouette-first top-down graybox at the exact world scale beside the player ship. Validate far/mid/near readability and author aligned collision/component anchors before detail.
>
> Visual identity: [MATERIALS, FACTION, FUNCTION, DAMAGE, SILHOUETTE].
>
> Required observables:
> - [MAJOR SECTION 1]
> - [MAJOR SECTION 2]
> - [FUNCTIONAL FEATURE]
> - [STATE VARIANT]
> - [APPROACH/CHANNEL]
>
> Use modular hard-surface kitbashing, PBR metal/roughness, bevels/weighted normals, decals, restrained emissives, and LOD/HLOD appropriate to the gameplay camera. Export GLB plus source, provenance, collision/component sidecar, and gameplay captures. Do not submit an isolated beauty render, generic primitive cluster, molten sphere, scaled ordinary ship, or emissive-heavy placeholder.

---

# 16. Prompt template — control mechanic

> Implement **[CONTROL FEATURE]** as an input-shaping assist through the normal force/torque pipeline. Define world, body, target-relative, and tether frames. Input commands [POSITION/VELOCITY/HEADING/RANGE/BEARING], not an ambiguous arrow.
>
> Controller:
> [EQUATIONS/PSEUDOCODE]
>
> Activation:
> [PRECISE CONDITIONS]
>
> Override:
> [PRECISE CONDITIONS; ONE-TICK OR BOUNDED EXIT]
>
> Hard constraints:
> - no direct position/velocity/rotation writes;
> - respect hull acceleration/turn limits;
> - no hidden target changes;
> - no unexplained full spins;
> - deterministic fixed-step behavior;
> - debug overlay for desired/actual/error/command/saturation.
>
> Test the scenario matrix [LIST]. Provide gameplay capture without debug overlay after numerical tests pass.

---

# 17. Prompt template — NPC job

> Implement **[NPC ROLE]** as a finite-state job controller separate from combat AI.
>
> Origin: [OBJECT]
> Destination: [OBJECT]
> Route: [ROUTE]
> Phases: [LIST]
> Visible work: [ANIMATION/BEHAVIOR]
> Manifest/output: [DATA]
> Threat handoff: [POLICY]
> Offscreen progression: [RULE]
> Player interventions: [LIST]
>
> The NPC is not complete if it merely wanders with a role label. Prove one full origin→work→destination cycle in live play and one interruption/resume or flee case.

---

# 18. Review checklist

A reviewer should ask:

- What can the player do now that was impossible before?
- Is the target physical and correctly scaled?
- Does collision match?
- Does the object visibly change?
- Is the action clear without prose?
- Does it combine with other mechanics?
- Is the result persistent?
- Is it reachable normally?
- Did the agent create a duplicate owner/system?
- Did it add a menu because world interaction was harder?
- Could the same tests pass with a glowing sphere?
- Is the screenshot actually from gameplay?
- Did the first candidate get accepted without taste review?
- Does the feature create a reason to use industry or travel?
- Does the world continue doing something without the player?

If the answer to the “glowing sphere” question is yes, the acceptance criteria are insufficient.

<!-- END FILE: 07_AGENT_EXECUTION_CONTRACT.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 08_PRIORITIZED_ROADMAP_FOR_THREE_AGENTS.md -->

# 08 — Prioritized Roadmap for Three Coding Agents

## 1. What this roadmap optimizes for

This roadmap is not organized by how impressive a feature sounds. It is organized by **how many later features become possible after the work is done**, how easily the result can be verified in normal play, and how likely an autonomous coding agent is to create a technically present but experientially worthless implementation.

The order is therefore:

1. establish physical truth;
2. establish targeting and interaction truth;
3. establish one deep physical site;
4. establish useful movement and force verbs;
5. establish purposeful NPC activity;
6. recompose one whole sector;
7. connect industry to the flight world;
8. replicate only after the vertical slices are good.

Do not begin by making twenty more sectors, fifty more POIs, or a fleet-command UI. That would multiply the current sameness.

## 2. The three-agent operating model

The safest division is by **authority seam**, not by feature fantasy.

### Agent A — Physics, controls, collision, and interaction kernel

Owns work involving:

- collision proxies and contact queries;
- target/component selection;
- force, impulse, tether, and trajectory mathematics;
- flight-control assists;
- dynamic-body behavior;
- deterministic physics tests and debug visualization.

Agent A should not author final landmark art or redesign station screens.

### Agent B — World simulation, jobs, persistence, and progression

Owns work involving:

- activity-pocket and route data;
- NPC job state machines;
- persistent site/component states;
- encounter consequences;
- infrastructure effects;
- Asteroid Ops exterior integration;
- economy, cargo, automation, and save-safe event wiring.

Agent B should not invent a second physics authority or write directly to state owned by another system.

### Agent C — Presentation, assets, spatial composition, and player-route proof

Owns work involving:

- graybox and final visual assemblies;
- collision-proxy authoring data associated with those assemblies;
- VFX, component-state presentation, map/radar readability;
- sector composition;
- illustrated ledger art and non-blocking story surfaces;
- headed browser capture, screenshot comparison, and visual acceptance.

Agent C is not merely “the artist.” This agent is the **embodiment and proof owner**. A feature is not complete until Agent C can show it functioning on the normal route.

### Integration rule

Only one agent at a time edits each authority file. The other agents consume exported contracts or work in new files. Before each wave, create a lease table such as:

| File family | Owner for this wave | Other agents may |
|---|---|---|
| `src/core/physics*`, SG-02 adapters | Agent A | read only |
| `src/systems/input.js`, `flightV3.js` | Agent A | propose patches, do not edit |
| world/site/job systems | Agent B | read contracts |
| `src/render/**`, landmark assets | Agent C | receive data interfaces |
| shared data catalog | one named owner | submit exact requested rows |
| tests/check scripts | owner of feature | other agents add non-overlapping fixtures |

Do not let three agents independently “improve” input, world spawning, or rendering in the same worktree. Parallelism without ownership is just faster corruption.

## 3. Wave 0 — Establish the current truth

### Goal

Determine which existing mechanics are genuinely usable in normal play and which are only present in code or focused tests.

### Work

**Agent A** builds a dedicated flight-and-massline proving ground reachable from the main menu or a debug-safe developer route. It contains:

- one immovable anchor;
- one light dynamic payload;
- one heavy dynamic payload;
- one non-hostile moving ship;
- one hostile moving ship;
- two large collision bodies;
- a marked launch target;
- live telemetry for line length, tension, radial velocity, tangential velocity, angular rate, predicted release direction, and payload mass.

**Agent B** inventories current massline, impulse, tumble, hitchhiking, bomb, path-flight, mining-site, unique-wreck, regional-ecology, and wingman features. For each, classify:

- normal-route player proof exists;
- developer-route proof exists;
- focused test only;
- code/data only;
- obsolete or contradictory.

**Agent C** captures the current baseline:

- a station collision/docking attempt;
- current generic wreck interaction;
- current sector center cluster;
- current G/path-flight behavior;
- current massline swing and release;
- current asteroid-site exterior.

### Acceptance

This wave is complete only when there is one concise audit table with links to current files, checks, and captures. Any feature without normal-route or proving-ground proof is treated as **unproven**, regardless of code comments or prior status documents.

### Why first

The repository already contains sophisticated concepts whose player sequence was never completed in the official live probe. Continuing to add features without this audit would create a second layer of invisible machinery.

## 4. Wave 1 — Collision truth and docking truth

### Goal

Make large structures occupy approximately the same space their silhouettes occupy, and make docking a readable approach rather than finding the correct point inside vaporous geometry.

### Minimum implementation

Do **not** begin with arbitrary triangle-mesh collision. Begin with a deterministic compound 2D proxy:

- circle primitives;
- capsules for long spars and hull sections;
- optional oriented rectangles for broad slabs;
- named sensor volumes for docking, interaction, and hazards.

A structure definition provides a local-space proxy list:

```js
collisionProxy: [
  { kind: 'circle', x: 0, z: 0, r: 44, tag: 'reactor-hub' },
  { kind: 'capsule', ax: -120, az: 0, bx: -38, bz: 0, r: 20, tag: 'west-spine' },
  { kind: 'capsule', ax: 38, az: 0, bx: 120, bz: 0, r: 20, tag: 'east-spine' },
]
```

The physics layer transforms proxies by entity position and rotation, performs broad phase at entity level, then narrow phase against proxy primitives.

### Docking contract

A dock is a **corridor plus berth**, not a proximity sphere.

It needs:

- a visible exterior dock marker;
- an approach axis;
- an entry gate;
- a berth volume;
- maximum lateral and forward speed;
- optional automatic final capture over the final short distance;
- clear feedback: `APPROACH`, `ALIGN`, `TOO FAST`, `BERTH CAPTURED`.

The player must never need to cross through arbitrary station walls to find the prompt.

### Agent split

**Agent A:** compound-proxy query library, ship-versus-proxy sweep, projectile-versus-proxy sweep, debug overlay, deterministic tests.

**Agent B:** component tags, station docking-state data, persistence compatibility, event payloads identifying which component was contacted.

**Agent C:** one station proxy authored against its visible mesh, visible docking corridor, capture sequence, before/after footage.

### Acceptance

- The ship cannot pass through the protected station silhouette where proxies are present.
- Deliberate open channels remain traversable.
- Projectiles collide with the relevant hull section rather than the unrelated central sphere.
- Docking can be completed from outside without entering any solid proxy.
- Debug view displays each proxy over the rendered structure and shows no unexplained core collider.
- Browser and Electron use the same proxy data.
- Performance is measured with several structures active; no per-frame geometry construction or unbounded allocation.

### Stop condition

Do not scale proxy authoring to every station until one complex station passes visual review. A poor proxy system applied everywhere will make the game more frustrating, not more physical.

## 5. Wave 2 — Targetable components and the interaction grammar

### Goal

Give the existing inputs more meanings without adding a keyboard piano.

### Foundation

A large entity may expose components:

```js
components: [
  {
    id: 'cargo_clamp_a',
    kind: 'salvage-clamp',
    proxyTag: 'cargo-wing-a',
    localPos: { x: 74, z: -31 },
    state: 'intact',
    verbs: ['scan', 'cut', 'tether'],
  },
]
```

The targeting layer chooses an **entity and component**, not merely an entity ID. Candidate selection should use:

1. cursor-to-projected-component distance;
2. line of sight or occlusion against large proxies when relevant;
3. explicit target priority;
4. short hysteresis so targeting does not flicker between nearby components.

### Contextual tool contract

The industrial beam remains RMB, but the target and component state determine the operation:

| Target | Operation | Visible result |
|---|---|---|
| geological face | extract | material removed, yield generated |
| structural brace | cut | cut progress, sparks, brace detaches |
| damaged relay | weld | repair progress, lights return |
| salvage clamp | dismantle | clamp opens, payload becomes tetherable |
| sealed panel | breach | panel heats, opens, reveals component |

The reticle and prompt must state the exact action before the player holds RMB. The player should never have to infer why the same beam is producing a different outcome.

### Agent split

**Agent A:** component picking, hysteresis, interaction-range and line-of-sight utilities.

**Agent B:** component state machine, save serialization, event routing, generic action-recipe executor.

**Agent C:** component highlights, world-space progress visualization, damaged/repaired/severed visual states, one test fixture.

### Acceptance

- At least four components can be selected independently on one fixture.
- The target panel names the component and available verb.
- Holding RMB on the wrong component does not silently perform another operation.
- State changes survive save/load and sector rematerialization.
- A cut component visibly changes the structure and can become a dynamic payload.
- The generic executor is used by at least two feature families, proving it is not a one-off wreck script.

## 6. Wave 3 — Wreck Cathedral vertical slice

### Goal

Build one landmark that proves collision, components, industrial tools, massline manipulation, persistence, story, and automation can become one coherent experience.

Use `04_WRECK_CATHEDRAL_VERTICAL_SLICE.md` as the feature authority.

### Agent split

**Agent A:** collision channels, dynamic detachable payloads, tether attachment points, impact and release behavior.

**Agent B:** site state, scan/cut/recover sequence, rewards, black-box ledger entry, stripped-state persistence, eventual salvage-operation hook.

**Agent C:** large modular wreck assembly, component-state visuals, lighting, debris field, readable channels, route capture and screenshots.

### Non-negotiable scope discipline

The first version does not need:

- interiors in full 3D;
- walking;
- arbitrary mesh fracture;
- voice acting;
- branching dialogue;
- procedural wreck generation;
- ten wrecks.

It does need one structure that is physically and visually impossible to confuse with an asteroid.

### Acceptance

See the full matrix in document 04. In brief:

- 320–600 world-unit silhouette;
- multiple collision islands and deliberate passages;
- at least five targetable components;
- scan, cut, tether, recover, and restore operations;
- one dynamic extracted payload;
- persistent before/after state;
- illustrated ledger artifact;
- no generic radius-nine wreck as the primary body;
- no single progress bar that completes the whole site.

## 7. Wave 4 — Flight control and physics-combat toy

### Goal

Make free flight and massline manipulation fun in an empty proving ground before connecting them to progression or content.

### 7.1 Orbit Assist

Implement the bounded control assist described in document 02. It should infer intent only while:

- a massline is taut;
- the player holds forward thrust;
- the player holds exactly one lateral/yaw direction;
- radial and tangential motion indicate an attempted orbit.

It may stabilize line length and yaw relationship. It may not inject arbitrary tangential speed or fly a canned circle.

### 7.2 Release and throw readability

Make current throw and self-sling machinery visible:

- predicted tangent;
- target solution window;
- payload/self distinction;
- reason a release is unavailable;
- post-release trajectory trail.

Do not add another hidden solver before the existing solver is player-legible.

### 7.3 Physics weapon prototype set

Prototype three, not twelve:

1. **Concussion cannon:** radial impulse and modest damage.
2. **Vector mine:** placed object with directional blast chosen at placement.
3. **RCS disruptor:** induces temporary tumble/steering loss on NPCs without deleting hull.

These produce displacement, setup, and control rather than merely higher DPS.

### 7.4 Arena fixture

Use a dense but readable field:

- two large anchors;
- several medium rocks;
- one fragile hazard;
- one boundary or gravity source;
- moving enemy targets.

The arena exists to make impulse, collision, tether, and positioning matter. Empty space erases the value of physics weapons.

### Agent split

**Agent A:** assist mathematics, force kernel, weapon physics, tests.

**Agent B:** weapon definitions, research/fabrication costs, NPC response states, receipts.

**Agent C:** prediction graphics, impact VFX, arena geometry, footage demonstrating each verb.

### Acceptance

- Orbit Assist preserves the player’s sign of rotation and does not oscillate between left/right.
- Releasing at the indicated solution produces the expected direction in repeated trials.
- Concussion can knock an enemy into terrain.
- Vector mine can alter both player and enemy motion; player has no collision hull damage unless explicitly designed, while enemy collision consequences are readable.
- RCS disruptor creates a finite recoverable state, not permanent AI failure.
- At least one encounter can be won primarily through physical manipulation rather than sustained LMB damage.

## 8. Wave 5 — Replace wandering NPCs with visible jobs

### Goal

Make the universe appear to operate without the player.

### First three jobs

Implement only these initially:

1. **Miner loop:** depart berth → travel lane → approach field → work several rocks → transfer to hauler or return to refinery.
2. **Hauler loop:** load at producer → follow freight route → pass checkpoint if present → unload at station.
3. **Patrol loop:** depart station → travel patrol corridor → inspect contacts → respond to distress/hostility → return.

Each is a small explicit state machine with authored route anchors. Combat is an interrupt, not the default behavior.

### Rules

- NPC jobs must change position for a reason.
- Job ships carry readable intent and, where appropriate, a manifest.
- Job transitions produce world-visible events: docking, loading, beam work, transfer pods, scan pulses.
- Avoid continuous heavyweight pathfinding. Follow route splines/waypoints with local avoidance and bounded recovery.
- If a ship fails to progress, recover to a safe route point rather than spin forever.

### GTA-in-space interaction

After the hauler loop is stable, add convoy interception:

- scan manifests;
- threaten or attack;
- disable/tumble escorts or hauler;
- force cargo jettison or physically collect released containers;
- trigger faction heat, pursuit, and market consequence;
- preserve a lawful alternative such as escorting the same convoy.

The same moving system supports legal and criminal play.

### Agent split

**Agent A:** stable route follower and local avoidance; no combat doctrine rewrite.

**Agent B:** job controller, schedules, cargo/market consequences, crime response.

**Agent C:** job-specific lights, effects, route visualization, loading/unloading presentation, normal-play capture.

### Acceptance

- A player can remain stationary for several minutes and observe at least two complete noncombat job cycles.
- Miner, hauler, and patrol are distinguishable by motion before reading the HUD label.
- Destroying or robbing a hauler changes a real cargo or market outcome.
- NPCs recover from blocked waypoints without random spinning or teleporting through landmarks.
- Job state survives sector residency transitions at the correct abstraction level.

## 9. Wave 6 — Recompose one complete sector

### Goal

Prove that a sector can be spatially memorable rather than a central pile attached to empty space.

Choose one sector. Do not touch all twenty-four.

### Required composition

The sector should have three or four distinct pockets separated by meaningful travel:

- a civic or destination pocket;
- a production or resource pocket;
- a route/checkpoint pocket;
- a mystery, hazard, or ruin pocket.

At least one moving job route connects pockets. At least one landmark is visible from beyond its interaction range. Empty space between pockets must have navigational purpose, traffic, scenery, or a route—not merely padding.

### Example candidate

**Ceres Belt:**

- Ceres Refinery and industrial yard;
- wide, irregular metallic belt with active miners;
- ore-hauler route and loading point;
- belt-shadow pirate ambush pocket;
- Abandoned Driller landmark with a physical salvage operation;
- one player-claimable asteroid site whose exterior visibly changes as it develops.

### Agent split

**Agent A:** collision/proxy budget, route performance, obstacle recovery.

**Agent B:** authored pocket data, job schedules, consequences, site hooks.

**Agent C:** spatial layout, landmark kit, sector palettes/lighting, map/radar read, capture.

### Acceptance

- A blind screenshot of each pocket is distinguishable.
- The sector is not organized around one central coordinate cluster.
- A player can name the sector’s signature feature after one visit.
- NPC traffic visibly travels between functional locations.
- The sector supports at least one legal, one industrial, one criminal/combat, and one exploratory interaction without requiring separate bespoke UIs for each.

## 10. Wave 7 — Orbital-operations and gravity prototype

### Goal

Test whether planets can become meaningful spatial actors in a top-down game without full orbital simulation.

### Prototype scope

One colossal planetary body with:

- a softened, capped gravity well;
- a readable influence ring;
- a safe minimum periapsis/atmosphere boundary;
- one analytic orbital habitat or satellite ring;
- one cargo-launch event;
- one slingshot route with preview;
- one combat interaction where an NPC can be displaced into atmospheric destruction.

### Physics model

Use stylized planar acceleration:

```text
r = bodyPos - objectPos
r2 = dot(r, r) + softening²
accel = normalize(r) * min(gMax, mu / r2)
```

Apply only inside an authored influence radius. Tune for readable seconds-long arcs, not real planetary scale. Satellites may follow analytic authored orbits independent of the full dynamic-body solver.

### Controls

The player receives:

- predicted short trajectory samples;
- periapsis marker;
- atmosphere-impact warning;
- optional bounded “gravity-line” assist that preserves player thrust authority.

No hidden autopilot should perform the entire slingshot.

### Acceptance

- A player can deliberately enter, bend through, and exit the gravity well.
- The same approach works at varied speeds without singular acceleration.
- Trajectory preview is close enough to teach, not merely decorative.
- Atmospheric destruction is visually clear and does not look like ordinary HP reaching zero.
- The feature does not destabilize ordinary sectors or save determinism.

## 11. Wave 8 — Exteriorize Asteroid Ops progression

### Goal

Make industry change the flight world before the player reaches an endgame spreadsheet.

The current Asteroid Ops vision already has a strong internal machine-design spine. The missing payoff is exterior embodiment.

### First exterior chain

1. Install a Massline Core.
2. Exterior asteroid gains a visible anchored-site module and persistent identity.
3. Install a Cargo Port.
4. Exterior gains a physical port and storage state.
5. Produce courier pods.
6. Pods visibly launch when the player is present; otherwise resolve statistically.
7. Build a Transfer Beam or shuttle tier.
8. Link a second asteroid.
9. Accumulate a station-frame project.
10. Construction drones assemble a persistent structure in flight space.

### Important constraint

Do not wait until the final station to show anything. Every major internal machine milestone should create an exterior visual or moving-world consequence.

### Agent split

**Agent A:** exterior attachment points, launch/transfer trajectories, collision-safe construction stages.

**Agent B:** site-state projection, route state, fabrication requirements, statistical/present materialization seam.

**Agent C:** exterior modules, launch effects, visible storage, staged station frame, progression captures.

### Acceptance

- A before/after flight screenshot proves each key site milestone.
- Produced couriers correspond to real site policy and inventory.
- Destroyed witnessed couriers reconcile with site state.
- The station frame is built from staged visible components, not spawned fully formed after a timer.
- The player gains at least one new world verb or route capability before the project becomes a credit generator.

## 12. Wave 9 — Replicate through authored kits

Only after Waves 1–8 each have one accepted vertical slice should agents scale content.

Build reusable kits:

- station proxy and dock modules;
- wreck hull sections and detachable components;
- orbital infrastructure modules;
- industrial route anchors;
- NPC job definitions;
- hazard/field recipes;
- illustrated ledger templates;
- interaction recipes;
- sector-composition templates that deliberately omit different pockets.

Replication means authored recombination under constraints, not random distribution of the same kit into every sector.

## 13. Priority and risk matrix

| Work item | Leverage | Player visibility | Agent feasibility | Integration risk | Priority |
|---|---:|---:|---:|---:|---:|
| Compound collision proxies | Very high | High | Medium | High | 1 |
| Component targeting/action grammar | Very high | High | Medium | Medium | 2 |
| Wreck Cathedral | Very high | Very high | Medium | Medium | 3 |
| Orbit Assist and release readability | High | Very high | Medium | High | 4 |
| Three physics weapons | High | Very high | Medium | Medium | 5 |
| NPC miner/hauler/patrol jobs | High | High | Medium | Medium | 6 |
| One-sector recomposition | High | Very high | High | Medium | 7 |
| Asteroid Ops exterior milestones | Very high | Very high | Medium | High | 8 |
| Planet/gravity prototype | Medium–high | Very high | Medium | High | 9 |
| More stations/planets using current grammar | Medium | Medium | High | Low | after slices |
| Fleet command expansion | Medium | Medium | Low | Very high | defer |
| Full cutscenes/voice/music generation | Low now | High | Low | High | defer |
| Crew/payroll/ammo hygiene | Low/negative | Medium | High | Medium | reject |

## 14. Integration protocol for every wave

Each wave should end with the following packet:

1. **Observable outcome statement** — one paragraph describing what the player can now do.
2. **Owner/file map** — exact files changed and authority respected.
3. **Narrow deterministic check** — mechanics and save behavior.
4. **Normal-route headed capture** — no injected state after launch except selecting the documented developer fixture for prototype-only waves.
5. **Before/after evidence** — same framing where visual change is claimed.
6. **Performance receipt** — frame/runtime delta on a representative dense scene.
7. **Failure-mode list** — what remains broken or deliberately out of scope.
8. **Recoverable commit** — one logical slice, no unrelated concurrent work.

A source file, test, screenshot, and prose status must all refer to the same revision.

## 15. Stop rules that prevent bad scaling

Stop and repair rather than expanding when any of these are true:

- the landmark still uses one unrelated spherical collider;
- the component exists but cannot be selected reliably in normal play;
- the interaction is represented only by a progress bar and a reward toast;
- the NPC job is identifiable only from a label, not motion;
- an assist writes arbitrary velocity instead of shaping bounded control authority;
- the player cannot explain what the control mode did after trying it;
- a sector’s new content is still piled around one center;
- a “persistent” result disappears after save/load or residency transition;
- an industry upgrade changes only a number in a panel;
- visual evidence is from a special capture route that bypasses the ordinary player path;
- an agent says “implemented” but cannot produce a repeatable player sequence.

The operating principle is simple:

> **Never scale a representation before proving the operation it represents.**

<!-- END FILE: 08_PRIORITIZED_ROADMAP_FOR_THREE_AGENTS.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 09_PASTEABLE_FEATURE_BRIEFS.md -->

# 09 — Pasteable Feature Briefs

Each numbered section below is deliberately self-contained. It can be pasted into a planning model together with `07_AGENT_EXECUTION_CONTRACT.md` and the current repository context. The examples are concrete enough to prevent a coding agent from silently reducing the request to a label, a sphere, a progress bar, or a new number in a menu.

Every brief uses the same structure:

- **Fantasy:** what the player should feel.
- **Player operation:** what the player actually does with current or deliberately added controls.
- **Implementation shape:** the smallest technical structure that can produce the experience.
- **Existing systems to reuse:** likely SpaceFace seams rather than parallel inventions.
- **Minimum viable slice:** where the agent must stop before scaling.
- **Forbidden shortcuts:** common technically compliant failures.
- **Acceptance:** observable proof.

---

## 1. Massline Orbit Assist

### Fantasy

The massline becomes a learnable flight instrument. A player can attach to an anchor, hold forward plus left or right, and carve a clean accelerating orbit without constantly guessing the yaw rate needed for the current tether length.

### Player operation

- Attach with `F`.
- Hold forward thrust plus exactly one turn direction.
- The ship continues orbiting in the chosen direction.
- Reel input changes the radius and therefore the angular velocity.
- Release with `F` to leave tangentially.

The assist should feel like coordinated steering or a good fly-by-wire system, not an autopilot performing a canned circle.

### Implementation shape

Compute a radial/tangential frame about the tether anchor every tick. Let `r` be anchor-to-player, `rHat = r/|r|`, and `tHat` be `rHat` rotated by the selected orbit sign. Measure radial velocity `vr = dot(vRel, rHat)` and tangential velocity `vt = dot(vRel, tHat)`.

When the intent gate is active, shape controls with:

- target nose heading aligned near `tHat` plus a bounded inward lead angle;
- yaw command from a damped angle-error controller;
- small radial correction opposing `vr` and line-length error;
- ordinary forward thrust preserved as the source of energy;
- no direct tangential velocity assignment.

Disengage instantly when the player releases forward/turn, reverses direction, brakes, the line goes slack, or the tether breaks.

### Existing systems to reuse

`tetherGameplay`, massline telemetry, `flightV3`, the current Rapier attachment authority, time effects only for optional teaching—not for the core controller.

### Minimum viable slice

One fixed anchor in a proving ground. No combat. Demonstrate stable clockwise and counterclockwise orbits at three line lengths.

### Forbidden shortcuts

- Setting velocity to a perfect tangent every frame.
- Rotating the ship around the anchor kinematically.
- Injecting free orbital speed.
- A mode that continues flying after input is released.
- An assist that changes the sign of rotation by itself.

### Acceptance

Starting from imperfect radial/tangential motion, the player can hold the two intended controls for several revolutions without spiraling into the anchor or falling slack. Reeling inward visibly increases angular speed through the physical constraint. Release direction agrees with the displayed tangent in repeated trials.

---

## 2. Target-Relative Trackpad Dogfight Mode

### Fantasy

The player locks an enemy and uses the trackpad like a two-dimensional combat-intent surface: left/right asks for a flank angle around the target; forward/back asks for closer/farther engagement range. The computer translates that into stable thrust and yaw while the mouse remains available for firing.

### Player operation

- Press `G` to lock the nearest valid hostile and enter combat-flight mode.
- Relative horizontal trackpad motion moves an intent marker clockwise/counterclockwise around the target.
- Relative vertical motion changes desired range.
- LMB fires at the locked target using the existing lead solution.
- Manual keyboard thrust, yaw, or brake immediately overrides or exits the mode.

The input is not “cursor direction equals turn direction.” It is a target-relative desired slot.

### Implementation shape

Maintain a desired polar slot around the target:

```text
slot.angle += dx * angularSensitivity
slot.radius = clamp(slot.radius + dy * rangeSensitivity, rMin, rMax)
desiredPos = target.pos + rotate(targetBasis, slot.angle) * slot.radius
```

Use a pursuit controller to generate world-space acceleration toward `desiredPos` while damping relative velocity. Convert desired acceleration into bounded ship-local forward/lateral commands and a desired heading. Heading can prefer the target, velocity vector, or a blend according to weapon type.

Use hysteresis and rate limits. Target loss, tether latch, docking, or manual input terminates the controller cleanly.

### Existing systems to reuse

`autoTargetAssist`, lead aiming in `autoTargetMode`, `flightV3`, target selection, current pointer-lock/relative input route.

### Minimum viable slice

One non-firing target circling a proving-ground anchor. The player can choose front, rear, left, right, close, and far slots and the ship converges without spinning.

### Forbidden shortcuts

- Treating trackpad displacement as indefinite yaw rate.
- Making the ship nose chase a hidden arrow while translation uses unrelated logic.
- Directly teleporting to the slot.
- Continuing to accumulate unbounded relative cursor coordinates.
- Auto-firing or choosing maneuvers without player intent.

### Acceptance

A reviewer can predict the ship’s response from the gesture: horizontal motion changes target bearing; vertical motion changes separation. The ship never flails between opposing yaw commands. After finger lift, it holds the chosen slot rather than continuing an unfinished turn command. Manual input breaks control within one tick.

---

## 3. Drawn Command Curve Flight

### Fantasy

The player draws a short maneuver in screen space—an arc around a rock, an S-turn through fire, a hook behind a target—and the ship executes it as a fly-by-wire trajectory while retaining physical acceleration limits.

### Player operation

- Enter the mode with `G` or a dedicated experimental toggle.
- Draw a short path from the ship using relative trackpad motion.
- On finger lift or idle clutch, the path freezes.
- The ship follows the curve.
- LMB remains weapon aim/fire; manual flight input cancels the route.

### Implementation shape

Do not chase raw sampled points one by one. Convert the gesture to a smoothed world-space polyline or spline:

1. resample at roughly equal arc-length intervals;
2. remove points below a distance/angle threshold;
3. fit a Catmull–Rom or cubic Hermite curve without overshooting corners;
4. compute a look-ahead point based on current speed;
5. reduce target speed from local curvature and stopping distance;
6. use a pure-pursuit or vector-field follower;
7. terminate by crossing a finish plane and settling, not by circling the last point.

Draw the route, look-ahead point, and commanded velocity during development.

### Existing systems to reuse

The current `autoTargetPath` recording, world-to-screen/raycast helpers, `flightV3`, input override rules.

### Minimum viable slice

Three fixtures: straight line, 90-degree arc, S-curve. No combat or target locking.

### Forbidden shortcuts

- Point-to-point full thrust with no curvature speed plan.
- Heading toward the current point while simultaneously strafing toward another.
- An arrow representing a command that the ship does not obey.
- Braking only after overshooting the endpoint.
- Keeping hundreds of noisy input points as the route.

### Acceptance

The ship follows all three fixtures without random spin, gross corner cutting, or orbiting the final point. A faster ship looks farther ahead and slows for curvature. The rendered command curve matches the actual path closely enough to teach the control.

---

## 4. Massline Payload Throw

### Fantasy

The player can use a dynamic object—cargo container, severed armor slab, asteroid fragment, disabled drone, or enemy ship—as a physical projectile.

### Player operation

- Attach to a throwable target with `F`.
- Build tangential speed through flight and reel control.
- Hold RMB to arm a throw toward the entity or point under the cursor.
- A trajectory indicator and target bracket show the intended release.
- The line cuts at the solution or within the selected manual-assist mode.

### Implementation shape

Use the existing massline throw solver and physics impulse path. The work is primarily to make it reliable and player-visible:

- explicit payload classification;
- cursor target hysteresis;
- predicted ballistic segment;
- valid/invalid solution states;
- target-size tolerance;
- post-release collision receipt;
- finite tumble/impact reaction for ships;
- cleanup rules for missed payloads.

A missed payload should not become a permanently simulated object lost at infinity. Give it bounded lifetime, recovery behavior, or sector-record demotion.

### Existing systems to reuse

`masslineThrow`, `tumbleStates`, combat physics impulse port, `masslineHud`, world records, aftermath/wreck payload classifications.

### Minimum viable slice

Throw one standardized cargo mass at one large stationary target and one moving ship in a proving ground.

### Forbidden shortcuts

- Direct damage on button press with a decorative thrown object.
- Teleporting the payload to the target.
- Releasing without showing which body is the payload.
- Unlimited throw accuracy against tiny moving targets.
- Leaving missed objects active forever.

### Acceptance

The payload’s pre-release velocity, release direction, and impact location are physically continuous. A stationary large target is reliably hittable after learning the indicator. A moving target remains challenging. Impact produces displacement/state through the shared physics kernel, not a bespoke damage call.

---

## 5. Concussion Cannon

### Fantasy

A weapon whose primary effect is momentum. It blasts enemies away, breaks formations, knocks ships into terrain, clears a close pursuit, and can propel the player when fired near a surface or at close range.

### Player operation

- Aim with cursor.
- Fire a visible projectile or short-range pulse.
- On impact, a radial impulse moves all eligible bodies.
- Damage is secondary and may be low.

### Implementation shape

Create a general `physics:radialImpulse` event or force-kernel call:

```text
for body within radius:
  surfaceDistance = max(0, centerDistance - body.radius)
  falloff = smoothstep(radius, 0, surfaceDistance)
  impulse = normalize(body.pos - center) * strength * falloff
```

Scale by authored mass response, not by setting a fixed velocity. Preserve player collision-damage immunity if that is the game rule, while allowing enemy tumble/impact consequences. Give large bodies lower acceleration naturally through mass.

### Existing systems to reuse

Projectile hit events, combat physics impulse port, tumble states, impact VFX, terrain anchors, damage kernel for the optional small blast component.

### Minimum viable slice

One weapon in the proving ground, one light enemy, one heavy enemy, one asteroid wall.

### Forbidden shortcuts

- Ordinary explosive damage with knockback animation only.
- Same displacement for every mass.
- Invisible impulse.
- Enemies immediately overriding the impulse with infinite AI correction.
- Player self-use silently disabled.

### Acceptance

The light target moves farther than the heavy target under the same surface-distance impulse. An enemy can be knocked into an asteroid and enter the normal impact/tumble consequence. The player can use a close blast to change trajectory, with clear risk or cooldown. VFX makes force direction readable.

---

## 6. Directional Vector Mine

### Fantasy

The player drops a charge that applies a strong impulse in a chosen direction rather than merely exploding outward. It becomes a trap, mobility tool, convoy ambush device, and massline-combo component.

### Player operation

- Hold the placement control to preview a mine behind or near the ship.
- Drag or aim to choose the impulse direction.
- Release to deploy.
- Trigger manually with `R`, by proximity, or by a limited authored condition.

### Implementation shape

A mine stores:

- world position;
- forward vector;
- arming delay;
- trigger mode;
- finite lifetime;
- impulse cone angle and range;
- owner/team and legality metadata.

On detonation, bodies inside the cone receive force weighted by forward alignment and distance. The player can ride the impulse. Mines need map/radar marks, arming feedback, and deterministic cleanup.

### Existing systems to reuse

`impulseCharges`, charge detonation input, combat physics impulse port, deployable entity patterns, faction/crime events.

### Minimum viable slice

Manual detonation only, one mine active, no inventory economy. Demonstrate pushing player, enemy, and cargo.

### Forbidden shortcuts

- A radial explosion renamed “vector mine.”
- Direction stored only for VFX.
- Unlimited active mines.
- Instant arming that lets the player stack a target without counterplay.
- A placement UI that blocks flight with a full-screen panel.

### Acceptance

Rotating the mine 180 degrees reverses the displacement result. The cone is visible before placement and briefly at detonation. The mine can propel the player, deflect a pursuing enemy, and launch a loose payload. Cleanup and save behavior are bounded and deterministic.

---

## 7. Recoil Lance

### Fantasy

A high-force weapon that kicks both the target and the firing ship. It is simultaneously a gun, an evasive maneuver, a braking tool, and a dangerous precision instrument.

### Player operation

- Aim with cursor.
- Charge briefly.
- Fire a high-speed lance or slug.
- The player receives equal-and-opposite recoil along the firing axis.

### Implementation shape

At fire time, compute projectile momentum or an authored impulse budget. Route recoil through the same physics impulse port used by external forces. The weapon needs:

- charge tell;
- minimum energy/heat condition;
- recoil preview arrow;
- player orientation independent of cursor aim if weapons gimbal;
- a bounded rule preventing trivial repeated acceleration, such as heat, capacitor cost, charge count, or post-fire lockout.

### Existing systems to reuse

Weapon energy/heat, projectile spawning, combat physics, bullet-time presentation if useful, existing gimbaled cursor aim.

### Minimum viable slice

One weapon and a proving-ground speed/trajectory readout.

### Forbidden shortcuts

- Camera shake substituting for actual recoil.
- Recoil along ship nose when weapon aimed elsewhere.
- Direct velocity addition that bypasses mass and physics authority.
- Infinite acceleration by firing into empty space with no meaningful limiter.

### Acceptance

The firing ship’s momentum change is aligned opposite the shot and scales according to the authored recoil law. The player can deliberately use it to brake or dodge. The target receives a distinct impact impulse. HUD/VFX show the effect before and after firing.

---

## 8. Gravity Puck

### Fantasy

A deployable temporary local gravity source that bends ship paths, projectile trajectories, loot, and loose wreckage. It creates a physical terrain feature during combat.

### Player operation

- Deploy at cursor range or drop from the ship.
- Puck arms after a short delay.
- For several seconds it pulls eligible dynamic bodies.
- It expires, can be destroyed, or collapses with a final pulse.

### Implementation shape

Use a general continuous-field component:

```text
force(body) = toward(center) * strength * falloff(surfaceDistance)
```

Use softened distance and an acceleration cap. Evaluate at a stable cadence or over spatial-query candidates. Projectiles may receive a reduced multiplier to prevent unreadable curves. The field must advertise radius, direction, and remaining life.

### Existing systems to reuse

Spatial queries, combat physics force/impulse port, deployables, projectile entities, radar/field rendering, deterministic sim time.

### Minimum viable slice

One puck, one enemy, one loose payload, one projectile stream. No upgrades.

### Forbidden shortcuts

- Applying a slow debuff rather than force.
- Pulling through arbitrary distances without a visible field.
- Singular acceleration near the center.
- Moving static stations/asteroids.
- Per-frame full-entity scans when spatial queries exist.

### Acceptance

A coasting body follows a visibly curved path through the field. A projectile stream bends in a consistent direction. A massline throw can be curved through the puck. The field cannot generate NaN, unbounded velocity, or permanent captured orbits under ordinary parameters.

---

## 9. RCS Disruptor and Tumble State

### Fantasy

The player disables an enemy’s ability to stabilize rather than simply lowering HP. A disrupted ship spins, loses firing authority, becomes vulnerable to massline manipulation, and eventually recovers.

### Player operation

- Aim and land an EMP/RCS-disrupting hit.
- Target enters a clearly telegraphed unstable state.
- Use the opening to escape, tether, throw, board later, or collide it with terrain.

### Implementation shape

Use a finite status with physical angular behavior:

- apply torque impulse based on hit location/direction;
- temporarily reduce or disable AI control torque and firing;
- let real angular damping recover the body;
- terminate below angular-speed threshold or at a hard maximum duration;
- exempt or specially tune bosses;
- never leave an entity permanently input-disabled.

### Existing systems to reuse

Existing EMP weapon fields, `tumbleStates`, status/action blockers, AI emergency handling, impact consequence.

### Minimum viable slice

One enemy archetype and one disruptor weapon in the proving ground.

### Forbidden shortcuts

- Stun icon while the ship remains visually stable.
- Scripted spin animation independent of physics.
- Permanent disable.
- AI continuing to fire accurately while tumbling.
- Applying the same duration regardless of spin/ship authority.

### Acceptance

The target’s physical spin and inability to aim are visible. A lighter or low-authority target is easier to tumble than a stable heavy ship. Recovery is smooth and bounded. The status creates a reliable massline/impact opportunity without becoming a universal instant-win stun.

---

## 10. Ricochet / Pinball Slug

### Fantasy

A kinetic weapon that rebounds from large collision surfaces, allowing bank shots through station yards, wreck channels, and asteroid fields.

### Player operation

- Aim with a projected first segment.
- When a valid surface is within range, show one predicted rebound segment.
- Fire; the projectile reflects from the surface and can strike a target.

### Implementation shape

This feature depends on truthful component/proxy collision normals. On impact with an eligible static proxy:

```text
v2 = v - 2 * dot(v, n) * n
v2 *= restitution
```

Allow a small fixed rebound count, typically one or two. Consume damage/speed per bounce. Avoid ricochets from tiny decorative objects. Keep prediction limited and honest; no full aimbot solution is needed.

### Existing systems to reuse

Compound proxy collision, projectile sweep, predicted-line rendering, weapon definitions, target component normals.

### Minimum viable slice

One rectangular/capsule arena wall, one target behind cover, one-bounce weapon.

### Forbidden shortcuts

- Choosing a new target after bounce and steering toward it.
- Reflecting from the old entity-level circle when the visible wall has another normal.
- Unlimited bounces.
- Prediction that does not match the physics collision path.

### Acceptance

A player can deliberately hit a target hidden behind a proxy-defined wall by reading one predicted rebound. The visible impact point and normal match the structure. Direct shots remain possible and balance separately. The projectile terminates cleanly after its bounce budget.

---

## 11. Compound Structure Collision Proxies

### Fantasy

Stations, wrecks, gates, and habitats feel like physical structures. The player collides with visible hull sections, can fly through deliberate openings, and no longer passes through walls until hitting an unrelated invisible core.

### Player operation

No new control. The improvement is immediate physical credibility:

- walls stop the ship;
- channels remain open;
- projectiles hit visible surfaces;
- docking occurs at a visible berth;
- massline attaches to meaningful hull regions.

### Implementation shape

Add per-structure local-space proxy primitives: circles, capsules, and optionally oriented boxes. Keep entity-level radius for broad phase and map/radar purposes, then perform narrow-phase tests against transformed proxies.

Each proxy has tags such as:

- `solid-hull`;
- `dock-wall`;
- `tether-anchor`;
- `destructible-component`;
- `sensor-only`;
- `projectile-only`.

Author proxies from simple data or an exported Blender helper file. Provide a debug overlay that renders proxy outlines over the actual model in world space.

### Existing systems to reuse

Custom physics sweeps, SG-02 static-body sync, projectile sweep, entity broad phase, asset manifests, station/landmark data.

### Minimum viable slice

One existing station converted from one sphere to 5–12 proxies, including one traversable opening and one external docking berth.

### Forbidden shortcuts

- Replacing one large sphere with several arbitrary spheres unrelated to the model.
- Triangle-mesh collision without performance or determinism proof.
- Visual openings blocked by collision.
- Visible walls without collision.
- Different proxy definitions in browser and Electron.

### Acceptance

In debug view, proxies align with protected silhouettes. The player can fly through the intended opening but not through solid arms. Fast ship sweeps do not tunnel. Projectiles hit the same sections. Proxy count and query time remain bounded in a dense fixture.

---

## 12. Docking Corridor and Berth Capture

### Fantasy

Docking feels like approaching a real port rather than wandering inside a station until a proximity check happens to become true.

### Player operation

- Select or approach a station.
- A visible corridor appears near the correct exterior berth.
- Enter roughly aligned and below a readable speed.
- The last short distance may be automatically captured.
- `E` confirms dock only after the berth condition is honestly satisfied, or capture may dock automatically according to the chosen UX.

### Implementation shape

Define a dock fixture with local-space data:

- approach origin and forward axis;
- corridor length/width;
- entry plane;
- berth center/radius or oriented box;
- maximum axial/lateral velocity;
- maximum heading error;
- capture distance;
- obstruction proxy tags.

Use a small state machine: `OUTSIDE → APPROACH → ALIGN → CAPTURE → DOCKED`. Publish one concise prompt and corrective reason.

### Existing systems to reuse

Station target data, docking UI events, autopilot approach only for optional final capture, compound proxies, HUD prompts.

### Minimum viable slice

One station, one berth, manual approach plus final magnetic capture.

### Forbidden shortcuts

- A larger invisible proximity sphere.
- Docking from inside solid station geometry.
- Requiring pixel-perfect alignment with no final assist.
- Autopilot taking control from long range.
- Multiple contradictory prompts.

### Acceptance

A first-time player can identify the port visually and dock without entering a wall. Approaching too fast produces `TOO FAST`; approaching sideways produces `ALIGN`; correcting the stated issue succeeds. The same corridor is used by visible NPC arrivals later.

---

## 13. Targetable Structure Components

### Fantasy

Large objects are not monolithic HP circles. They contain relays, braces, clamps, engines, turrets, cargo pods, reactors, sensors, and attachment points that can be read and manipulated individually.

### Player operation

- Move cursor over a visible component.
- Reticle snaps with short hysteresis.
- Target panel identifies the component and state.
- LMB/RMB/F operate on that component according to available verbs.

### Implementation shape

A component record includes:

- stable ID;
- kind;
- local transform or proxy tag;
- pick radius/shape;
- state and state transitions;
- allowed interactions;
- optional dynamic child entity created when detached;
- save projection;
- visual binding.

Picking should rank projected cursor miss, target priority, range, and occlusion. Keep entity target and component target separate so existing systems remain compatible.

### Existing systems to reuse

Target panel, scanner, entity component data, world records, render child-node naming, collision proxy tags.

### Minimum viable slice

Four components on a stationary test structure: relay, brace, cargo clamp, tether anchor.

### Forbidden shortcuts

- Four labels all pointing to the entity center.
- Component selection available only from a menu.
- State stored only in DOM/UI.
- Detachment represented by hiding the component and spawning generic loot at the center.
- Reticle flicker between adjacent parts.

### Acceptance

Each component can be targeted independently from normal flight. Its world highlight matches the visible geometry. Scan, cut, repair, and tether availability differ as authored. A changed component state survives save/load and rematerialization.

---

## 14. Contextual Industrial Beam

### Fantasy

The mining beam becomes a general-purpose industrial tool. It still extracts rock, but it can also cut, weld, breach, dismantle, and stabilize clearly identified components.

### Player operation

- Aim at an explicit target/component.
- The reticle states the operation before firing.
- Hold RMB to perform continuous work.
- Work can be interrupted and resumed where appropriate.
- Beam appearance changes modestly by operation: cutting sparks, welding arc, extraction dust, breach heating.

### Implementation shape

Create a generic work recipe:

```js
{
  verb: 'cut',
  requiredToolClass: 'industrial-beam',
  durationS: 3.5,
  range: 240,
  energyPerS: 8,
  progressPersistence: 'component',
  completionEvent: 'component:severed'
}
```

Use component state, not object type alone, to resolve the recipe. Beam targeting needs hysteresis and line/range checks. Progress should be visible in-world; a small HUD readout may supplement it.

### Existing systems to reuse

Mining beam input and VFX, module/tool tiers, component actions, event bus, energy/heat if suitable, scanner target panel.

### Minimum viable slice

Existing asteroid extraction plus one brace cut and one relay repair.

### Forbidden shortcuts

- Same red pulsing tube and same `+1` toast for every operation.
- Automatic nearest-object selection overriding the cursor’s explicit component.
- A single interaction duration for all targets.
- Reward spawning without a visible state change.
- New full-screen UI for basic beam work.

### Acceptance

The player can tell from reticle, color/particles, and target response whether the beam is extracting, cutting, or welding. Aiming at empty hull does nothing or gives a clear reason. Completion alters the component and enables a follow-on action.

---

## 15. Detachable Modules and Salvage Payloads

### Fantasy

A wreck or damaged structure contains physical modules that can be cut free and moved: armor plates, cargo pods, reactor assemblies, weapon mounts, sensor dishes, or drive coils.

### Player operation

1. Scan to identify a detachable component.
2. Cut or release its clamps with RMB.
3. Component becomes a dynamic body.
4. Attach massline with `F`.
5. Tow, throw, deliver, install, or recover it.

### Implementation shape

The structure component stores a `detachSpec` describing the dynamic entity:

- mass/inertia;
- radius or compound proxy;
- visual source/node clone;
- attachment points;
- cargo/reward identity;
- ownership and legality;
- cleanup/demotion policy.

Detachment should transfer world transform and initial parent velocity without teleportation. The parent’s visual state changes to an empty socket or torn mount.

### Existing systems to reuse

Component states, entity spawn factory, massline throwable classification, cargo or module grant seams, world records, salvage legality.

### Minimum viable slice

One cargo pod detached from the Wreck Cathedral and delivered to a marked receiver.

### Forbidden shortcuts

- Generic glowing orb in place of the actual module.
- Reward granted immediately when clamps are cut.
- Payload with mass `1` regardless of visual scale.
- Parent still rendering the attached component after detachment.
- Payload lost forever outside the active area.

### Acceptance

The detached object is visibly the component removed from the structure. It inherits continuous position/motion, has believable mass response, can be tethered, and produces the reward only through the authored delivery/recovery path. Save/load preserves whether it is attached, loose, delivered, or lost.

---

## 16. Massline Receiver and Delivery Socket

### Fantasy

Towing and salvage gain precision. Instead of merely bringing an object near a marker, the player swings or guides a payload into a visible receiver that captures it.

### Player operation

- Tether a compatible payload.
- Approach a receiver or construction socket.
- A capture cone/ring shows position, speed, and alignment requirements.
- Bring the payload—not necessarily the ship—through the volume.
- Receiver locks the payload and completes the transfer.

### Implementation shape

A receiver defines:

- accepted payload tags;
- capture volume;
- maximum relative speed;
- optional orientation requirement;
- magnetic/capture assist over the final short distance;
- completed state and visual socket occupancy.

Measure payload-relative conditions, not player distance. Provide feedback such as `PAYLOAD FAST`, `WRONG MODULE`, `ALIGN CLAMP`, `CAPTURED`.

### Existing systems to reuse

Component/interaction grammar, docking corridor logic, dynamic payloads, massline telemetry, cargo/module/site events.

### Minimum viable slice

One cargo pod, one receiver, one fixed proving-ground route.

### Forbidden shortcuts

- Completion when the player ship reaches the marker while payload remains elsewhere.
- Invisible large capture sphere.
- Instant teleport from arbitrary range.
- No distinction between incompatible objects.
- New inventory screen replacing physical delivery.

### Acceptance

The receiver captures only the payload and only under readable conditions. The player can fail because the payload is too fast, correct the approach, and succeed. Completion visibly places or consumes the object and updates the correct system.

---

## 17. Repair and Reactivation Circuit

### Fantasy

Dead infrastructure can be brought back online through a short physical sequence rather than one `E` prompt and a credit charge.

### Player operation

A typical reactivation uses three steps:

1. Scan to reveal failed components.
2. Repair two or three components in any sensible order.
3. Deliver or connect one physical power/control item.

As systems return, lights, moving parts, traffic, and functionality come alive incrementally.

### Implementation shape

Represent the site as a small dependency graph:

```text
power relay ─┐
control core ├─> main system online
coolant pump ┘
```

Each node is a targetable component with a state and action recipe. The site computes capabilities from node states. This is not a hidden puzzle; dependency lines or scanner readouts make causality clear.

### Existing systems to reuse

Component actions, industrial beam, detachable/deliverable modules, site state, VFX/material swaps, event bus.

### Minimum viable slice

One dead relay structure with three components and one capability: enabling a navigation shortcut or cargo launcher.

### Forbidden shortcuts

- One global repair progress bar.
- Requiring components in a fixed arbitrary order without explanation.
- All visuals changing only at final completion.
- Repair reward limited to credits.
- State lost on sector exit.

### Acceptance

Each repaired node has an immediate visible and systemic effect. The main function activates only when dependencies are satisfied. The player can leave and return mid-repair. The final result changes navigation, traffic, production, or another world operation.

---

## 18. Deployable Anchor / Beacon Network

### Fantasy

The player can place persistent nodes that make space more usable: navigation beacons, massline anchors, sensor relays, construction markers, or route extenders.

### Player operation

- Enter placement mode in flight.
- Preview range, overlap, and valid surface/space rules.
- Place a beacon using fabricated hardware.
- Beacon becomes targetable, visible on map/radar, and part of a network.

Different beacon heads may provide different functions without requiring wholly separate systems.

### Implementation shape

A shared deployable base supports:

- owner and stable ID;
- position/rotation;
- capability tags;
- link radius or explicitly selected links;
- durability or protected status;
- save/world-record representation;
- retrieval/reposition rules;
- visual tier.

Network effects should be graph-derived: connected sensor coverage, drone command radius, acceleration route, or navigation visibility.

### Existing systems to reuse

Existing beacon deployment input, world records, map layers, claim/automation data, component targeting.

### Minimum viable slice

Two sensor beacons that reveal a hidden pocket only when their coverage overlaps or triangulates it.

### Forbidden shortcuts

- Permanent buff immediately applied on purchase with no world object.
- Beacons visible only as map icons.
- Unlimited placement.
- Overlap rules hidden from the player.
- Directly writing another system’s state instead of exposing a readout/service.

### Acceptance

Placed beacons persist and appear in flight and map views. Moving/removing one changes network coverage deterministically. The player can understand why the hidden pocket is or is not revealed from the visible geometry.

---

## 19. Visible Miner Job Loop

### Fantasy

Mining is something the world does, not just the player. Industrial regions contain ships that depart, work specific rocks, transfer ore, and return.

### Player operation

The player may simply observe, escort, rob, compete with, rescue, or later employ the miner.

### Implementation shape

Use an explicit state machine:

```text
AT_BERTH
→ DEPART
→ TRANSIT_TO_FIELD
→ SELECT_WORKSITE
→ WORK_SEAM
→ LOAD_COMPLETE
→ TRANSIT_TO_DROPOFF
→ TRANSFER
→ RETURN/REPEAT
```

Each state owns a route target and completion condition. `WORK_SEAM` emits a visible beam and slowly changes an abstract manifest; it need not run the player’s drill minigame. Route following uses authored anchors and bounded local avoidance. Combat interrupts into flee/defend, then resumes or aborts.

### Existing systems to reuse

Traffic roles, sector zones, station/field anchors, cargo manifest semantics, mining VFX, regional economy, NPC flight ports.

### Minimum viable slice

One miner traveling between one station and one field, completing one loop.

### Forbidden shortcuts

- Miner wandering near asteroids with a `MINER` label.
- Beam effect without manifest or destination.
- Teleporting from field to station.
- Running full player mining simulation for every NPC.
- Getting stuck forever behind one obstacle.

### Acceptance

Without HUD text, a reviewer can infer that the ship is mining from its route, pause, beam work, and return. The manifest increases at the field and clears at dropoff. Destroying or delaying it has a bounded economic or encounter consequence.

---

## 20. Visible Hauler and Freight Route

### Fantasy

Goods physically move through the universe. A refinery’s output leaves on a hauler, travels a recognizable lane, passes checkpoints, and reaches a market.

### Player operation

The player can:

- scan the manifest;
- escort the hauler;
- shadow it to discover a route;
- intercept or rob it;
- exploit its arrival to trade;
- defend it from pirates.

### Implementation shape

A hauler job has:

- source site/station;
- destination;
- route anchors;
- schedule or trigger from available cargo;
- manifest with value and legality;
- escort/security profile;
- unload event that influences stock/pressure through existing economy seams;
- statistical resolution when absent, witnessed materialization when present.

Loading and unloading should have visible cargo pods, docking, cranes, or transfer beams even if the underlying inventory moves in aggregate.

### Existing systems to reuse

Traffic system, freight causality, economy pressure, docking corridor, world residency, encounter director.

### Minimum viable slice

One recurring ore hauler from a player-independent mining site to a refinery.

### Forbidden shortcuts

- Decorative freighter with no source/destination.
- Economy change occurring on a timer unrelated to arrival.
- Full inventory simulation duplicated inside traffic.
- Instant despawn at the destination boundary.
- Escort ships wandering independently of the convoy.

### Acceptance

The hauler visibly loads, traverses a route, and unloads. Its manifest matches its role. Its destruction or successful arrival creates a real, bounded consequence. The same trip reconciles correctly whether witnessed or statistically resolved.

---

## 21. Customs Checkpoint and Inspection Lane

### Fantasy

Law exists as behavior and infrastructure, not merely a faction color. Ships queue through a checkpoint, submit scans, get cleared, diverted, fined, or chased.

### Player operation

- Approach the lane or attempt to bypass it.
- A scanner sweeps the ship.
- Legal cargo clears automatically.
- Contraband creates a readable response: surrender, flee, bribe where authored, hide through equipment/route, or fight.
- The player may also observe NPC inspections and exploit congestion or distraction.

### Implementation shape

Build a checkpoint from:

- physical gate/scanner structure;
- approach and queue anchors;
- inspection volume;
- traffic controller assigning ships one at a time;
- manifest query service;
- lawful response state machine;
- bypass-detection zones;
- pursuit/heat event routing.

NPCs should slow, align, pause, and proceed. The scanner beam and status lights make the process legible without dialogue.

### Existing systems to reuse

Customs prompt/contraband scan, patrol roles, sector zones, docking/corridor controller, traffic manifests, law/security, faction heat.

### Minimum viable slice

One checkpoint on an existing trade lane, one legal NPC hauler, one contraband fixture, and the player route.

### Forbidden shortcuts

- Scan triggered by an invisible sector-wide timer.
- NPCs clipping through the checkpoint while the player gets a UI prompt.
- Pirates/law determined only by HUD labels.
- A modal dialogue tree for every scan.
- Unavoidable scan with no route or equipment counterplay.

### Acceptance

A stationary observer sees a complete NPC inspection. The player can pass lawfully, be caught with contraband, or physically attempt a bypass. Checkpoint geometry, scanner volume, and patrol response agree. The result affects heat/reputation/cargo through existing owners.

---

## 22. Convoy Robbery / Space-GTA Interception

### Fantasy

The player sees a valuable convoy operating in the world and can choose to escort it, ignore it, or rob it through physical combat and intimidation.

### Player operation

1. Scan convoy ships to reveal manifest and security.
2. Attack, jam, or threaten the hauler.
3. Disable/tumble escorts or separate the hauler from formation.
4. Force cargo jettison, cut loose external pods, or destroy cargo clamps.
5. Collect or tow cargo while patrol response escalates.
6. Escape to a fence, black market, or player facility.

No dialogue-choice box is required. The player’s actions are the choice.

### Implementation shape

The convoy controller needs:

- leader/hauler and escort membership;
- route and destination;
- manifest;
- threat-state thresholds;
- surrender/jettison conditions based on escort state, hull state, player threat, and jurisdiction;
- distress transmission and response delay;
- cargo release entities;
- heat/reputation/market consequences;
- route continuation or abort after the event.

### Existing systems to reuse

Hauler jobs, patrol/encounter response, cargo jettison, massline payloads, tumble/disruptor mechanics, faction heat, black market.

### Minimum viable slice

One lightly guarded convoy with one surrender condition and physical cargo pods.

### Forbidden shortcuts

- Pressing `E` to choose “Rob convoy.”
- Destroying the hauler and receiving credits directly.
- Cargo represented only by a toast.
- Escorts that ignore formation or the hauler.
- No lasting law/economy response.

### Acceptance

The robbery can succeed without destroying every ship. The hauler visibly releases recoverable cargo under clear conditions. Lawful escort of the same convoy is also supported. The event leaves a receipt and changes real cargo, heat, and route/economy state.

---

## 23. Patrol Route and Jurisdiction Behavior

### Fantasy

Patrol ships act like authorities: they follow routes, inspect suspicious activity, protect traffic, respond to distress, and distinguish lawful space from frontier chaos.

### Player operation

The player can observe, cooperate, evade, lure, impersonate later, or attack. Patrol behavior gives sectors character without requiring sophisticated dogfight tactics.

### Implementation shape

State machine:

```text
DEPART
→ PATROL_ROUTE
→ OBSERVE_CONTACT
→ INSPECT / WARN / IGNORE
→ RESPOND_DISTRESS
→ PURSUE / ESCORT / RETURN
```

Use authored jurisdiction zones, route anchors, and a contact-scoring layer based on heat, hostile acts, distress, contraband tells, and faction relationship. Keep investigation timing visible with scanner sweeps and approach vectors.

Combat behavior remains delegated to the existing tactical system once engagement begins.

### Existing systems to reuse

Regional law/security, patrol encounters, customs, traffic routes, scanner hostility authority, crime/heat.

### Minimum viable slice

One two-ship patrol completing a route and responding to a staged pirate attack on a hauler.

### Forbidden shortcuts

- Random wandering with periodic proximity scan.
- Patrol instantly knows all crimes anywhere in sector.
- Pursuit without a witnessed or transmitted cause.
- Full new combat AI.
- Patrol only differentiable by blue lights.

### Acceptance

A patrol completes its route in peace, visibly investigates a suspicious contact, and diverts to a real distress event. Its action has a traceable cause. After resolution it resumes or returns rather than entering permanent combat-search behavior.

---

## 24. Scavenger Race at Fresh Wreckage

### Fantasy

After a battle, multiple scavengers race toward valuable wreckage. The player can beat them, scare them off, cooperate, ambush them, or follow them to hidden salvage markets.

### Player operation

- A fresh aftermath marker or distress/news event creates a scavenger opportunity.
- Scavenger ships approach and attach/beam/tow specific salvage pieces.
- The player can scan claims, take unclaimed pieces, contest restricted salvage, or attack.

### Implementation shape

Use a simple claim arbitration system:

- wreck components have claim state;
- scavengers reserve a target while approaching;
- reservation expires if stalled/fled/destroyed;
- work time produces physical cargo/payload or marks component stripped;
- faction/law decides whether contesting is legal;
- scavengers depart to a destination when loaded.

### Existing systems to reuse

Aftermath wreck records, unique-wreck components, NPC job controller, salvage legality, traffic destinations, massline/dynamic payloads.

### Minimum viable slice

One fresh wreck with three salvage components, two scavenger NPCs, and player participation.

### Forbidden shortcuts

- Scavengers circling a wreck while a timer removes loot.
- Invisible ownership.
- Every scavenger targeting the same point indefinitely.
- Generic ore rewards.
- No destination after collection.

### Acceptance

Scavengers choose distinct components, visibly work/recover them, and depart with manifests or payloads. The player can arrive first or contest a claim. The wreck’s stripped state changes according to who recovered what.

---

## 25. Survey Expedition and Triangulation

### Fantasy

Survey ships behave like researchers. They travel to anomalies, hold specific observation positions, emit scans, and publish results that reveal routes, resources, or story sites.

### Player operation

The player can:

- watch an expedition;
- escort it;
- assist by occupying another bearing;
- steal or buy its data;
- sabotage a scan;
- follow the resulting bearing.

### Implementation shape

An expedition owns three or more authored observation anchors around a target. Ships move to anchors, settle within tolerance, then emit synchronized scan pulses. Progress depends on geometry—not repeated button presses at one point.

The target reveals a result only when enough distinct bearings are completed. NPC and player contributions use the same bearing record. Danger may interrupt but should not reset all progress.

### Existing systems to reuse

Scanner pulses, anomaly POI behavior, route follower, mission/rumor bearings, map layers, regional research ecology.

### Minimum viable slice

One survey ship and one player-assisted three-bearing scan around an anomaly.

### Forbidden shortcuts

- Three scan presses while stationary.
- Survey ship orbiting randomly with no anchor logic.
- Result granted on arrival.
- Progress hidden in a full-screen modal.
- Losing all progress when interrupted.

### Acceptance

Distinct observation positions are visible and geometrically meaningful. The NPC completes its own bearings; the player can fill one. Final reveal creates a real map/world result and a concise ledger fragment.

---

## 26. Smuggler Shadow Route

### Fantasy

A suspicious ship leaves a lawful route, kills its transponder, and follows an indirect path to a hidden transfer point. The player can tail it to discover the route or intercept the exchange.

### Player operation

- Scan or receive a rumor about a suspect ship.
- Maintain distance and line-of-sight/sensor contact without entering its suspicion radius.
- Follow through several route transitions.
- Discover a hidden cache, black-market contact, or rendezvous.

### Implementation shape

Use an authored route with suspicion logic:

- suspect moves through normal and covert anchors;
- player proximity, active scan, weapon fire, or repeated obvious interception increases suspicion;
- losing contact starts a grace timer, not immediate failure;
- high suspicion causes abort, decoy, or escape route;
- successful tail reveals a persistent POI and ledger/map mark.

No advanced stealth AI is required; the behavior is route- and threshold-driven.

### Existing systems to reuse

Cloak/sensor radius, traffic routes, hidden POIs, faction flavor, scanner, map discovery.

### Minimum viable slice

One suspect route with four anchors and one hidden cache reveal.

### Forbidden shortcuts

- Follow a waypoint with no suspicion mechanics.
- Instant mission failure for one brief detection.
- Hidden destination spawned only after success instead of existing in world state.
- Dialogue tree at the rendezvous.
- Suspect wandering randomly.

### Acceptance

The suspect’s route and concealment behavior are visible. The player can succeed through positioning and sensor discipline. Discovery persists and remains accessible later; failure postpones or alters the opportunity rather than deleting an entire storyline.

---

## 27. Rescue Tug and Disabled-Ship Recovery

### Fantasy

Ships can become disabled and require help. Rescue tugs travel to them, stabilize their motion, attach a line, and tow or repair them. The player can assist, compete, extort, or become the rescuer.

### Player operation

- Receive/observe a distress signal.
- Approach a disabled ship.
- Scan its state.
- Stabilize or attach massline.
- Bring it to a recovery zone, transfer a module, or hold position while a tug repairs it.

### Implementation shape

Define a bounded disabled state separate from destroyed:

- no ordinary thrust/fire;
- residual drift remains;
- distress event and expiry/resolution rules;
- compatible recovery actions;
- tug job state machine;
- tow receiver/docking corridor at destination;
- restored or scrapped outcome.

### Existing systems to reuse

RCS/tumble states, massline, NPC job controller, docking receiver, distress encounters, cargo/module transfer.

### Minimum viable slice

One disabled trader, one NPC rescue tug, and an optional player-assisted tow.

### Forbidden shortcuts

- Disabled ship frozen in place.
- Tug visually approaches while a timer teleports the ship home.
- Player completes by pressing `E` near target.
- No distinction from a wreck.
- Permanent disabled entities cluttering the world.

### Acceptance

The disabled ship drifts physically. The tug attaches and changes its motion. Player intervention can alter the outcome. Resolution produces a visible departure/repair/salvage state and cleans up correctly.

---

## 28. Construction Traffic and Staged Assembly

### Fantasy

New infrastructure is built in the world. Materials arrive, frames appear in stages, drones move between anchor points, and the completed structure begins operating.

### Player operation

The player may supply materials, protect construction, accelerate it with a site network, sabotage it, or simply witness regional change.

### Implementation shape

A construction project has:

- stable project ID and location;
- stage graph;
- material requirements per stage;
- visible assembly nodes/components;
- incoming freight demand;
- construction activity presentation;
- interruption/damage state;
- completed capability.

Use a small library of frame, truss, habitat, tank, dock, and antenna modules. Swap/add modules per stage rather than scaling one generic mesh.

### Existing systems to reuse

Asteroid-site fabrication, hauler jobs, dynamic construction pods, persistent world records, infrastructure capability services.

### Minimum viable slice

Three stages of one navigation relay or small cargo dock.

### Forbidden shortcuts

- A timer followed by spawning the finished asset.
- Construction visible only in a UI percentage.
- Materials deducted without arriving or being supplied.
- Identical stage silhouette with different labels.
- Completion granting only income.

### Acceptance

Same-framing screenshots clearly distinguish all stages. Freight or player supply is causally linked to progress. The finished structure performs a new world operation such as docking, scanning, route extension, or cargo launch.

---

## 29. War-Zone Supply Line

### Fantasy

An active conflict consumes resources. Ammunition, repair parts, and fuel move toward a frontline; damaged ships withdraw; victories and shortages alter local activity.

### Player operation

- Escort or raid supply convoys.
- Deliver fabricated goods.
- Destroy a depot or restore one.
- Exploit shortages in the market.
- Observe battle intensity change from the supply state.

### Implementation shape

Do not simulate a full war economy. Maintain a bounded regional supply state:

- stock values for two or three relevant goods;
- convoy arrivals/losses;
- frontline encounter weighting and repair/reinforcement availability derived from stock bands;
- visible depot and convoy jobs;
- decay/consumption at coarse cadence;
- story/news receipts from meaningful thresholds.

### Existing systems to reuse

Regional ecology/encounter weights, freight routes, economy pressure, faction conflict, aftermath records, station industry.

### Minimum viable slice

One supply depot, one convoy route, and two frontline intensity states.

### Forbidden shortcuts

- A hidden global war meter unrelated to moving goods.
- Per-second detailed simulation of every bullet.
- Infinite respawning convoys.
- Supply state changing only from player missions.
- No visible difference between stocked and starved frontline.

### Acceptance

A successful convoy arrival and a destroyed convoy produce different, observable frontline behavior. The player can affect the state through hauling, escort, or piracy. Markets/news and world traffic agree with the same underlying supply record.

---

## 30. Sector Pocket Recomposition

### Fantasy

A sector is a place with geography and activity, not one central encounter bundle surrounded by emptiness.

### Player operation

The player travels among distinct pockets with different visual silhouettes and purposes. Routes, landmarks, and moving traffic teach the layout.

### Implementation shape

Select one sector and author:

- 3–4 pocket centers separated by meaningful distance;
- one destination/civic pocket;
- one production/resource pocket;
- one route/checkpoint or traffic pocket;
- one danger/mystery/ruin pocket;
- route anchors joining only the pockets that exchange people/goods;
- one major silhouette visible at long range;
- pocket-specific dressing, lighting, and object grammar;
- map labels that correspond to real spatial compositions.

Keep travel time within the game’s fun envelope. Empty intervals may contain lane markers, sparse debris, traffic, gradients, or speed opportunities.

### Existing systems to reuse

Sector anchors, named zones, regional ecology, traffic jobs, landmark models, continuous-world coordinates, map/radar.

### Minimum viable slice

Recompose Ceres Belt or another early sector without changing the whole galaxy.

### Forbidden shortcuts

- Moving the same central cluster into four smaller identical clusters.
- Copying every pocket type into every sector.
- Empty travel with no visual/navigation cues.
- Pocket identity existing only in map text.
- Adding more objects without changing spatial relationships.

### Acceptance

Screenshots from each pocket are visually distinguishable. An NPC route crosses between functional pockets. A player can describe the sector’s layout and signature after one visit. The center of the sector is not automatically where all useful content lives.

---

## 31. Wreck Cathedral Landmark

### Fantasy

A colossal broken ship dominates a sector. It reads immediately as the remains of a specific disaster, contains navigable channels and separate salvage operations, and becomes visibly stripped or reactivated over time.

### Player operation

- Approach and scan major sections.
- Navigate around or through deliberate top-down channels.
- Target relays, braces, clamps, reactor, and black-box housing.
- Cut or repair components with RMB.
- Extract one or more physical payloads with the massline.
- Recover evidence and later establish automated salvage.

### Implementation shape

Build the structure from 8–20 large modular hull pieces with compound collision proxies. Use 5–8 targetable components and a persistent site-state record. Keep the ship on the gameplay plane; “flying through” means navigating broad open bays, broken spinal gaps, and separated hull islands visible from the top-down camera—not a first-person interior.

### Existing systems to reuse

Unique-wreck data, component grammar, compound proxies, industrial beam, dynamic payloads, world records, ledger artifacts, Asteroid Ops/automation hook.

### Minimum viable slice

One wreck, five components, one physical cargo/weapon payload, one black-box ledger entry, one persistent stripped state.

### Forbidden shortcuts

- One orange molten sphere with boxes.
- Radius-nine generic wreck entity as the main body.
- One RMB progress bar yielding generic scrap.
- Story only in a modal choice box.
- Decorative mesh with unrelated central collider.

### Acceptance

At long range the wreck is unmistakable. The ship cannot pass through solid hull proxies but can traverse authored gaps. Individual components have distinct operations and visual states. Recovery changes the landmark permanently and produces a non-generic world/progression result.

---

## 32. Broken Moon Refinery

### Fantasy

A refinery complex built around a moon or huge asteroid is half-dead: sections drift out of alignment, transfer arms are cold, and ore traffic has stopped. Restoring it changes the sector economy and creates a major production node.

### Player operation

- Survey three refinery sections.
- Repair a power relay and control spine.
- Massline a detached transfer arm or cargo coupler into a receiver.
- Deliver a fabricated control unit.
- Defend or witness the first restarted ore shipment.

### Implementation shape

Use a colossal central body as visual anchor and several orbital/attached modules. The site state controls:

- power lights and rotating machinery;
- active dock/receiver;
- hauler job availability;
- market/refining capacity;
- map identity;
- optional player claim or contract.

The moon itself need not have walkable surface. Interaction occurs at external infrastructure.

### Existing systems to reuse

Repair circuit, detachable payload/receiver, NPC miner/hauler jobs, station industry screens for complex transactions, regional economy pressure.

### Minimum viable slice

Three repair components, one arm-alignment operation, one hauler departure after activation.

### Forbidden shortcuts

- Another station screen with a different background.
- Press `E` and pay credits to restore.
- Moon represented by a small asteroid-scale ball.
- Refinery machinery that never moves or receives traffic.
- Reward limited to passive credits.

### Acceptance

Before/after flight footage shows a dormant versus working refinery. The physical alignment operation matters. Restart causes visible traffic and a real refining/route capability. The landmark remains accessible and useful after the initial task.

---

## 33. Orbital Elevator Terminal

### Fantasy

A planet has an enormous tether/elevator terminal that exchanges cargo with the surface. Capsules rise and descend, orbital freighters queue, and the structure makes the planet feel inhabited without planetary landing.

### Player operation

- Dock at or approach the orbital terminal.
- Retrieve a launched capsule.
- Escort surface-bound cargo through a danger window.
- Repair a counterweight relay.
- Rob or protect high-value shipments.
- Later link player logistics into the terminal.

### Implementation shape

Represent the elevator as an orbital terminal plus a stylized tether line toward the planet. Capsules move along an analytic path from atmosphere edge to terminal; they need not be full physics bodies for the entire surface distance. At the playable end they materialize as cargo entities or dock events.

The terminal publishes scheduled launch/arrival windows and manifests. Local traffic jobs respond.

### Existing systems to reuse

Planet anchor, docking corridor, hauler/convoy jobs, cargo pods, construction/repair components, market/freight causality.

### Minimum viable slice

One scheduled capsule rises, becomes recoverable at the terminal, and transfers to a hauler.

### Forbidden shortcuts

- Static line and ordinary station menu only.
- Capsule represented by a toast.
- Realistic full-length tether simulation.
- Planet surface UI pretending to be flight gameplay.
- No traffic response.

### Acceptance

The elevator is visually legible from long range. A complete capsule movement and transfer can be observed. The player can participate physically in at least one operation. The terminal changes local freight routes and provides a distinct sector identity.

---

## 34. Atmospheric Harvester Network

### Fantasy

Platforms skim or siphon a gas giant’s upper atmosphere, launching volatile canisters to orbital collectors. Storm bands and gravity create a dangerous industrial environment.

### Player operation

- Follow collector platforms around the planet.
- Retrieve or escort canisters.
- Repair a harvester in a safe storm interval.
- Deploy sensor beacons to improve launch timing.
- Steal volatile cargo or protect the network.

### Implementation shape

Use analytic orbital/platform paths around a stylized gravity body. Harvester platforms periodically emit cargo capsules along predicted trajectories toward an orbital receiver. A storm field temporarily blocks or increases risk. Platform production is aggregated; visible canisters materialize when the player is present.

### Existing systems to reuse

Gravity/field kernel, cargo pods, receiver, hazards, NPC hauler jobs, resource/economy data, sensor network.

### Minimum viable slice

Two harvesters, one receiver, one storm window, one visible canister transfer.

### Forbidden shortcuts

- Gas giant as background art with an ordinary mineable node.
- `+1 gas` from RMB on the planet.
- Random canister spawn unrelated to platform cycle.
- Full fluid simulation.
- Hazard only as generic damage circle.

### Acceptance

The player can read when and where a canister will launch, intercept it, and deliver it. Storm state changes the route or timing visibly. Platforms and receiver operate without the player, creating sector activity and a real volatile supply source.

---

## 35. Communications Constellation Repair

### Fantasy

A planet or region is surrounded by broken satellites. Repairing or repositioning them restores map intelligence, communications, mission leads, and traffic coordination.

### Player operation

- Scan satellites to identify dead, drifting, or misaligned nodes.
- Repair electronics with RMB where appropriate.
- Tether a drifting satellite into an orbital slot or receiver.
- Deploy a replacement node fabricated by the player.
- Watch the constellation reconnect link by link.

### Implementation shape

Model the constellation as a graph. Nodes have position/orbital phase, state, and link range/line-of-sight. Capabilities depend on connected coverage rather than raw count:

- map reveal;
- market intelligence;
- distress detection;
- drone route-risk reduction;
- story/data transmissions.

Use analytic circular/elliptic motion or fixed stylized orbit slots. The massline alignment can use a capture volume rather than exact orbital mechanics.

### Existing systems to reuse

Deployable beacons, repair actions, massline receiver, map discovery, market intel, scanner, illustrated ledger/story channels.

### Minimum viable slice

Four satellites, two broken, one reposition task, one replacement deployment, one unlocked capability.

### Forbidden shortcuts

- Collect four repair tokens.
- Satellites fixed in a decorative ring with no graph.
- Capability granted by a UI checkbox.
- Exact orbital rendezvous requiring simulation precision the controls cannot support.
- All nodes visually identical and unmarked.

### Acceptance

Links appear/disappear according to node state and geometry. Repairing/repositioning nodes visibly closes the network. The unlocked capability is used elsewhere in the game. Save/load preserves constellation topology and node states.

---

## 36. Mass-Driver Cargo Launcher

### Fantasy

A giant industrial rail launches cargo canisters across a sector or toward a transfer route. The player can align, load, defend, intercept, or eventually build one.

### Player operation

- Deliver cargo to the driver.
- Select or activate a destination route.
- Watch the launch solution and countdown.
- Defend the driver or intercept launched cargo.
- Repair alignment coils or clear debris from the launch corridor.

### Implementation shape

The mass driver is a structure with:

- loading receiver;
- destination registry;
- charge state;
- visible barrel/rail orientation;
- predicted path;
- launch corridor clearance;
- cargo pod entity at launch;
- statistical resolution after leaving the witnessed region;
- market/site receipt at destination.

The cargo projectile may use a high-speed guided corridor or analytic transit after its initial physical segment. Do not keep it as a full projectile across the galaxy.

### Existing systems to reuse

Receiver, construction/repair components, projectile/trajectory rendering, site production, freight causality, world records.

### Minimum viable slice

One driver launching one cargo pod to a receiver elsewhere in the same sector.

### Forbidden shortcuts

- Instant inventory transfer with a launch animation disconnected from state.
- Ordinary weapon reskinned as infrastructure.
- No obstruction or alignment logic.
- Keeping hundreds of high-speed pods alive indefinitely.
- Payoff limited to credits.

### Acceptance

Loading, charge, launch, flight, and receipt form one causal chain. The player can see and interact with the physical launch segment. The destination receives the authored cargo. The driver unlocks a new logistics route or strategic interception opportunity.

---

## 37. Planetary Gravity Slingshot Arena

### Fantasy

A colossal planet changes movement and combat. The player dives into its gravity well, bends around it, and exits faster or on a new vector. Enemies can be forced into atmospheric destruction.

### Player operation

- Enter the gravity influence ring.
- Use thrust to shape periapsis and exit direction.
- Read short trajectory preview and atmosphere warning.
- Chain a massline anchor, impulse weapon, or gravity assist.
- Knock an enemy below safe altitude.

### Implementation shape

Use one dominant softened planar gravity source with capped acceleration and authored influence radius. The atmosphere is a visible inner boundary. Objects crossing it enter a distinct burn/destruction sequence based on trajectory and time, not ordinary invisible damage ticks.

Trajectory preview integrates several short future samples using the same gravity function and current planned thrust assumption. Keep satellites on analytic paths.

### Existing systems to reuse

Continuous force kernel, trajectory renderer, combat physics, tumble/impulse weapons, hazard presentation, sector anchors.

### Minimum viable slice

One planet in a dedicated sector, one player slingshot gate-to-gate route, one enemy atmosphere kill.

### Forbidden shortcuts

- Full N-body simulation.
- Planet-scale realism making arcs take minutes or require microscopic inputs.
- Gravity represented only as drag or a HUD modifier.
- Atmosphere as an ordinary red damage circle.
- Autopilot performing the complete slingshot.

### Acceptance

The player can intentionally produce different exit vectors by changing approach/periapsis. Preview teaches the maneuver. An enemy displaced below the boundary visibly burns and breaks up. Ordinary flight outside the influence remains unchanged.

---

## 38. Debris Current / Moving Salvage River

### Fantasy

A sector contains a broad flow of debris carried by an electromagnetic or gravitational current. Wreck pieces, cargo, and hazards drift along it, creating moving opportunities and obstacles.

### Player operation

- Enter or cross the current.
- Ride it for faster travel.
- Tether salvage out of the stream.
- Avoid or redirect dangerous masses.
- Deploy a collector or anchor.
- Follow the current to discover where debris originates.

### Implementation shape

Define a vector field along a spline or authored corridor. Dynamic eligible bodies receive a bounded force toward the local flow direction. The player receives a lower or tunable multiplier. Spawn/demote debris from a bounded pool using upstream/downstream gates rather than simulating endless objects.

### Existing systems to reuse

Continuous field kernel, dynamic payloads, massline, spatial pockets, aftermath wreck visuals, route/landmark system.

### Minimum viable slice

One curved current, six debris bodies, one valuable payload, one upstream source landmark.

### Forbidden shortcuts

- Moving texture with no force.
- Global wind affecting the whole sector.
- Hundreds of persistent rigid bodies.
- Random debris with no flow source/destination.
- Player controls completely disabled in the field.

### Acceptance

Coasting bodies visibly follow the current. The player can ride, cross, and extract from it. Debris population remains bounded and deterministic. The current creates a route and interaction pattern no ordinary asteroid field provides.

---

## 39. Alien Alignment Ring

### Fantasy

A dormant ancient machine consists of several massive ring segments or pylons. It responds to mass, position, timing, and alignment rather than an `E` prompt.

### Player operation

- Scan to reveal target alignment states.
- Use massline to rotate or move one or more dynamic segments, or place weighted payloads at receiver points.
- Stabilize the configuration for a short interval.
- Machine activates, opening a route, revealing a site, or changing local physics.

### Implementation shape

Keep the puzzle readable and planar. Use 2–4 movable elements with constrained axes or capture sockets. Scanner shows current versus required phase/orientation. The solution may be additive and persistent; once opened, the route remains available.

### Existing systems to reuse

Dynamic payloads, massline receiver, component scanning, repair/alignment state graph, wormhole/gate navigation, illustrated ledger.

### Minimum viable slice

Two movable masses and one activation result.

### Forbidden shortcuts

- Arbitrary symbol-matching UI.
- Free six-degree-of-freedom manipulation unsuited to top-down controls.
- Exact physics tolerances with no capture assist.
- Activation by holding RMB on the central object.
- Permanent story lockout from an incorrect action.

### Acceptance

The player can understand the required arrangement from world-space cues. Massline movement and receiver capture solve the task. Activation causes a large visible state change and a durable navigational or systemic consequence.

---

## 40. Player-Built Station Frame

### Fantasy

The player’s asteroid industry culminates in a structure visibly assembled in space. The station is not purchased from a menu; it emerges from the production network the player designed.

### Player operation

- Choose an authored valid construction site.
- Supply frame modules, control cores, power, drone labor, and logistics capacity.
- Watch construction traffic deliver modules.
- Use massline receivers or construction beams to place a few milestone components.
- Defend vulnerable stages.
- Activate the completed station and choose practical functions through installed modules.

### Implementation shape

A station project uses staged modules:

1. command spine;
2. power/thermal ring;
3. cargo/dock arm;
4. habitation/control shell;
5. optional refinery, sensor, defense, or shipworks modules.

Each stage has real inputs and a visible assembly. The completed station uses existing station UI for complex transactions, but its exterior modules, docks, traffic, and capabilities reflect what was built.

### Existing systems to reuse

Asteroid Ops production, construction traffic, compound collision/docking, module kits, claim/network state, NPC jobs, station screens.

### Minimum viable slice

Three-stage small station with cargo port, repair/refuel, and route-extension capability. No full shipyard yet.

### Forbidden shortcuts

- Timer then fully formed station spawn.
- A new ugly duplicate station UI when existing screens suffice.
- Construction resources reduced to credits only.
- Station exterior unrelated to installed functions.
- Pure passive-income payoff.

### Acceptance

The player can trace materials from asteroid sites to visible construction stages. Same-framing captures show the station grow. The finished structure creates new docking, traffic, logistics, and route behavior. It remains a physical landmark and persistent part of the galaxy.

---

# Selection guide

When choosing a brief for the next coding session, prefer one that satisfies at least three of these:

- makes an existing input do something qualitatively new;
- creates a visible before/after state;
- gives NPCs purposeful movement;
- connects Asteroid Ops to exterior flight;
- gives the massline a new setup or payoff;
- creates a reusable engine primitive;
- makes one sector spatially memorable;
- creates a new route, network, or capability rather than a stat increase;
- can be proven in one bounded vertical slice;
- can be built without relying on autonomous voice acting, orchestral music, or character animation.

The best first picks are usually not the largest. They are the ones that make several later ideas cheaper and harder to implement badly.

<!-- END FILE: 09_PASTEABLE_FEATURE_BRIEFS.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 10_CURRENT_REPO_AUDIT_AND_GAP_MAP.md -->

# 10 — Current Repository Audit and Gap Map

## 1. Purpose and caution

This is a design-facing audit of the SpaceFace repository snapshots inspected while preparing this playbook. The tree is changing quickly, so it is not a substitute for checking current `master`, working-tree state, owner contracts, tests, and headed footage before editing.

Its purpose is to prevent two costly mistakes:

1. asking an agent to build a system that already exists in some form;
2. assuming a sophisticated system is a usable game mechanic merely because files and checks exist.

The central pattern is **semantic surplus, embodied deficit**. Many concepts already have data models, systems, tests, or design documents. The game often fails at the last translation step: physical form, input legibility, spatial composition, normal-route reachability, and persistent visible consequence.

## 2. Physics and collision

### What currently exists

The custom physics spine integrates ships in the XZ gameplay plane, performs circle/circle collision, sweeps ship motion against static asteroid/station circles, sweeps projectiles against entity circles, and emits impact events. An optional Rapier collision observer similarly creates one ball collider from each entity radius. The SG-02 dynamic-body authority supports dynamic bodies and attachments, including the massline.

### What this means in play

A visually complicated station may still be one collision circle. A wreck may still be one tiny radius. A ship can cross visible geometry that lies outside the radius, then collide with an invisible central core. Deliberate openings in the model cannot be physically meaningful because the collider has no topology.

This is not primarily an asset problem. Better models alone make the mismatch more obvious.

### Required next seam

Add **compound planar collision proxies** while retaining entity-level broad phase. Start with circles and capsules; add oriented boxes only if necessary. Support named sensor volumes separately from solid proxies. Author debug overlays and collision fixtures before converting content.

### What not to do

- Do not jump directly to arbitrary triangle-mesh collision.
- Do not give each mesh child an independent full entity unless interaction requires it.
- Do not solve docking by increasing station proximity radius.
- Do not allow art and collision definitions to drift silently.

## 3. Flight controls and auto-target path mode

### What currently exists

The input system contains pilot, helm-assist, and classic schemes. Pilot mode separates keyboard flight from mouse combat. Auto-target mode can acquire a hostile, control weapon lead, and record relative trackpad motion into world-space path points. The path follower chases sampled points using a world-space command, advances when it reaches or passes points, and brakes near the final point.

### Likely experiential failure

The current path follower is closer to waypoint chasing than gesture flight. It does not appear to establish a proper curvature-dependent speed profile, a stable look-ahead based on path arc length, or a target-relative combat slot. Mapping one desired world direction simultaneously into forward, lateral, and heading commands can make the ship feel as if translation and nose orientation disagree. Raw relative gesture accumulation and point sampling can also produce noisy or unintuitive routes.

### Decision

Treat the current G/path mode as an **experimental prototype**, not a protected game pillar. Do not keep piling special cases onto it.

Choose one of two clearer control experiments:

1. **Target-relative slot control:** trackpad X chooses bearing around locked target; Y chooses range.
2. **Command curve:** gesture becomes a smoothed path followed with pure pursuit and a curvature speed plan.

Prototype both in an isolated fixture if needed. Keep only the mode that a reviewer can understand without an explanation after a few attempts.

### Acceptance gap

A green input test does not prove good control feel. Require headed telemetry and repeatable route captures with visible command vectors, desired heading, desired velocity, path, look-ahead point, and actual trajectory.

## 4. Massline mechanics

### What currently exists

The repository contains a surprisingly broad massline program:

- tether-lock fire control;
- self-sling release assistance;
- payload throws toward cursor/selected targets;
- target-size solution tolerances;
- tumble states and impact consequences;
- bullet time;
- terrain-anchor spawning around encounters;
- jettison reaction mass;
- bomb propulsion;
- hitchhiking on faster neutral traffic;
- loot shards and related presentation.

The governing design states a clear intent vocabulary: `F` frees the player; RMB throws the tethered payload; LMB shoots.

### What is not proven

The same design audit reports that a bespoke live browser probe proved launch, physics readiness, latch, and reel shortening but did not complete the later LMB/RMB/loot/cloak/jettison sequence. Controlled reruns timed out. Therefore, many mechanics may be correct in isolated code/tests but are not yet a reliable player toy.

### Required next seam

Do not invent ten more massline verbs immediately. Build a **Massline Proving Ground** and make current verbs legible:

- explicit payload/self indicators;
- tension, line length, radial/tangential speed;
- release tangent and target solution;
- impact receipt;
- repeatable fixtures;
- Orbit Assist as the missing control-shaping layer.

### Likely highest-value addition

Orbit Assist is not another content feature. It is the control law that may make the existing physical vocabulary consistently usable. It should stabilize yaw/radial relationship under explicit intent while preserving real thrust and momentum.

### What to defer

- fleet-wide massline orders;
- arbitrary multi-tether webs;
- fully free telekinesis;
- long towing missions as a headline feature;
- additional assists before current ones are visible and testable.

## 5. Combat and weapons

### What currently exists

The weapon catalog already contains more than pure Galaga bullets:

- pulse lasers and autocannons;
- flak/point defense;
- beam weapons;
- railgun;
- plasma splash;
- missiles and torpedoes using `cmdty_munitions`;
- a siege lance;
- an EMP disruptor intended to damage subsystems rather than hull;
- unique salvage-only variants.

Most ordinary weapons use energy and/or heat. Broad ammunition management is not intrinsic to the whole arsenal.

### Why combat still reads as hold-LMB-until-dead

Weapon definitions can differ numerically while producing the same decision loop. Range, DPS, heat, and projectile speed are useful balancing dimensions but do not necessarily change the verb. Empty combat space also removes the value of displacement and terrain interaction.

### Required next seam

Build a small **force and field kernel**, then prototype weapons whose primary outputs are:

- impulse;
- directional placement;
- temporary control disruption;
- trajectory bending;
- rebound;
- deployable terrain;
- self-recoil.

Pair them with combat arenas containing large anchors, obstacles, hazards, and boundaries. A physics weapon in empty space is usually a temporary inconvenience followed by the enemy flying back.

### Munitions ruling

Keep ordinary weapons replenishment-free. Use manufactured munitions only for rare strategic ordnance: torpedoes, gravity pucks, vector mines, siege charges, or other deliberate high-impact tools. Replenish in useful batches through industry.

## 6. Wreck systems

### What currently exists

The unique-wreck catalog is semantically rich. It includes:

- multiple rumor channels;
- fuzzy bearings and scan gates;
- authored hazard contexts;
- unique weapon/module drops;
- legality and faction consequences;
- provenance from losses/incidents;
- complications and follow-up receipts;
- persistent state across rumor, fix, decision, and salvage phases.

Battle aftermath records also preserve victim, faction, zone, killer, encounter cause, class, and potential remedy.

### What reaches the player physically

Ordinary aftermath wrecks materialize as small generic wreck entities with a single radius, short salvage duration, and salvage pool. This can reduce an entire recorded battle to an asteroid-like object. The semantic identity may appear in labels or provenance text while the spatial operation remains the same.

### Required next seam

Do not rewrite the rumor/provenance system. It is valuable. Build a **physical embodiment adapter** capable of mapping selected authored wrecks or high-value aftermath records to:

- modular hull assemblies;
- compound collision proxies;
- targetable components;
- detachable payloads;
- persistent stripped/activated states;
- automated-salvage hooks.

Use generic small debris for low-value aftermath. Reserve monumental embodiment for authored or promoted losses. This preserves performance and rarity.

### First proof

The Wreck Cathedral should become the reference implementation. No procedural wreck generator is needed before it succeeds.

## 7. Asteroid Ops and industry

### What currently exists

The current Asteroid Ops vision is one of the strongest systems in the project. It has a coherent machine-design thesis:

- 28×45 drill field;
- irreversible contact-ring tradeoff;
- extraction versus preservation;
- Massline Core, extractor, gas tap, refinery, fabricator, cargo port;
- aggregate power/material networks;
- persistent anchored sites;
- courier pods;
- machine recipes and production;
- planned formation, thermal, signature, logistics, defense, and cluster layers;
- a north star in which asteroid clusters visibly assemble a station in flight space.

This is not merely a speculative idea; relevant machine/recipe data and site systems exist.

### Main risk

The industry layer can become an excellent internal game that pays out only credits or statistical efficiency. If so, it will deepen one screen while leaving the flight world unchanged.

### Required next seam

Implement an **exterior projection contract** from site state to flight state:

- Massline Core creates a visible exterior anchor/module;
- Cargo Port creates a physical port and storage/readout;
- couriers visibly launch when witnessed;
- shuttle/freighter tiers create moving jobs;
- transfer beams link asteroids;
- station frame appears in stages;
- site signature affects witnessed encounters and route risk;
- infrastructure unlocks travel, sensors, construction, or defense.

Every major internal milestone should produce an exterior change before the final station.

### Protect these laws

- contact ring remains irreversible;
- aggregates, not per-item belt simulation;
- output exits through engineered ports, not the mining laser;
- automation removes old attention demands and opens new design verbs;
- progression unlocks operations, not only rates.

## 8. Stations and destination UI

### What currently exists

Stations already route to a substantial shared shell: market, shipworks, industry, missions, factions, bar, repair, refuel, resupply, and undock. Splitting every station function into a new physical building and new UI would have poor return and create presentation debt.

### Correct direction

Keep complex transactions in the shared station interface. Differentiate destinations through:

- exterior geometry and docking;
- available services and stock;
- moving traffic/jobs;
- local laws and inspection behavior;
- adjacent industrial operations;
- visible construction/damage states;
- unique landmarks and route topology;
- concise station identity and ledger context.

A refinery can use the same industry screen while still being physically surrounded by ore traffic, storage tanks, transfer arms, and a working belt region.

### Required next seam

Docking truth and visible operations, not duplicated UIs.

## 9. Sectors, zones, and regional ecology

### What currently exists

The repository explicitly recognizes the “flat disc of unrelated dots” problem. It defines named zone types such as civilian cores, trade lanes, patrol corridors, mining belts, derelict fields, outlaw zones, radiation fields, nebulae, ambush lanes, and anomalies. Regional ecology classifies sectors into macro families and adjusts traffic, resources, law, danger, and encounter weights.

### Why sectors can still feel identical

The systems mostly provide metadata, labels, weights, and spawn biases. If physical objects remain clustered and NPCs share wandering behavior, the player sees little of the distinction. The current POI behavior families also reduce to a small set of existing verbs: dock, mine, salvage, scan, escort, kill.

### Required next seam

Convert authored zones into **activity pockets with routes and operations**:

- spatially separated pocket centers;
- pocket-specific landmark/dressing grammar;
- job routes between producers, checkpoints, stations, and ruins;
- one signature silhouette;
- at least one persistent state or consequence;
- omission rules so sectors do not all contain every pocket type.

Recompose one sector before scaling.

## 10. NPC activity and AI

### What currently exists

Traffic, encounters, regional ecology, faction presence, wingmen, patrol behaviors, and combat doctrines exist in various forms. Wingmen can materialize from the fleet ledger, but a mining order maps to a defensive/fleeing-trader archetype because there is no real mining AI in that path.

### Main mistake to avoid

Do not solve world life by making combat AI more elaborate. Most visible life can come from small job state machines:

- miner;
- hauler;
- patrol;
- scavenger;
- survey ship;
- rescue tug;
- construction tender;
- smuggler.

Each job has route anchors, visible work, a manifest or purpose, completion conditions, and an interruption policy. Combat remains a delegated interrupt.

### Required next seam

A generic **NPC job controller** separate from combat doctrine. It writes high-level destinations and intent into the existing movement/control ports. Add stuck detection and bounded recovery. Prove three jobs before adding more.

## 11. Story and presentation

### What currently exists

The repository has extensive worldbuilding, campaign logic, flavor channels, rumors, bars, comms, news, mission records, and a ship ledger. Image generation is available to the development agents, but character images have tended toward illustrated/cartoon pulp aesthetics.

### User preference and product fit

Long dialogue, response menus, mutually exclusive branches, and forced reading are poor fits. Blender cutscenes and autonomous audio production are also expensive and unreliable.

### Required next seam

Use a three-layer nonblocking story model:

1. **flight fragments:** one or two lines triggered by place/action;
2. **physical evidence:** model states, black boxes, decals, manifests, wreck geometry, traffic behavior;
3. **optional illustrated ledger:** beautiful static images, maps, diagrams, documents, and concise text available later.

Story threads should be additive. Actions alter context and world state but rarely delete whole arcs.

### Image-generation discipline

Prompt for production stills, documentary evidence, cinematic realism, material-specific lighting, restrained palettes, and in-world artifacts. Explicitly reject pulp illustration, comic ink, cel shading, retro-futurist magazine covers, exaggerated faces, and generic space opera costumes unless intentionally desired.

## 12. Progression and endgame

### Current opportunity

Asteroid industry provides a credible accumulation engine. The missing question is what accumulated capacity buys besides faster extraction and stronger guns.

### Progression outputs to prioritize

- new movement heads and assists;
- physics weapons/deployables;
- component tools;
- sensor and map infrastructure;
- courier/shuttle/freighter routes;
- gravity, acceleration, and wormhole infrastructure;
- automated salvage;
- construction capacity;
- station assembly;
- territorial security and traffic control;
- the ability to seed new sites/settlements.

### Endgame shape

No mandatory restart or branch-pruned campaign is required. Possible persistent endgames include:

- industrial network builder;
- salvage archaeologist;
- lawful route authority;
- pirate logistics predator;
- anomaly/infrastructure restorer;
- station and settlement constructor.

The galaxy should increasingly contain visible evidence of the player’s history.

## 13. Recommended keep, repair, defer, reject table

| Area | Ruling | Reason |
|---|---|---|
| Asteroid Ops contact-ring industry | **Protect and expand** | Strong compositional core and progression identity |
| Unique-wreck rumor/provenance data | **Keep** | Rich semantic foundation; needs embodiment |
| Massline throw/tumble/impulse suite | **Repair and prove** | High UVP potential; normal-route reliability/legibility incomplete |
| G/path auto-target mode | **Prototype or replace** | Current control mapping likely too ambiguous |
| Compound collision proxies | **Build now** | Unlocks physical landmarks, docking, ricochet, navigation |
| Component targeting/action recipes | **Build now** | Multiplies existing inputs into richer verbs |
| NPC job controller | **Build after primitives** | Makes world alive without combat-AI rewrite |
| Regional ecology metadata | **Keep, embody** | Useful weighting/identity but insufficient by itself |
| Shared station UI | **Keep** | Avoid duplicate UI debt; deepen exterior operations |
| Ordinary fuel | **Clarify/tune** | Jump resource, not boost energy; remove if it adds no route decision |
| Ordinary ammunition | **Avoid** | Use only for strategic ordnance |
| General crew/payroll | **Reject for now** | Administrative rather than embodied depth |
| Fleet expansion | **Defer** | Multiplies AI/navigation issues |
| Full cutscenes/voice/orchestral score | **Defer** | Production-heavy and weak autonomous capability |
| More generic POIs/sectors | **Stop scaling** | Multiplies sameness until operations improve |

## 14. The most important audit conclusion

The repository does not primarily need another broad design wave. It needs a disciplined sequence that converts existing ambition into player-operable physical truth:

```text
compound collision
→ component targeting
→ contextual action recipes
→ dynamic detachable payloads
→ reliable massline control/force verbs
→ one monumental embodied site
→ purposeful NPC jobs
→ one recomposed sector
→ exteriorized asteroid industry
→ content replication
```

Anything that skips several arrows should be treated skeptically. The game has already paid for many concepts in code and documents. The next payoff comes from making them impossible to miss on the screen and impossible to reduce to another glowing sphere.

<!-- END FILE: 10_CURRENT_REPO_AUDIT_AND_GAP_MAP.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 11_PROMPTING_GLOSSARY_AND_TECHNIQUE_LEXICON.md -->

# 11 — Prompting Glossary and Technique Lexicon

## 1. Why this document exists

“Use advanced techniques,” “make it polished,” “make the physics feel good,” and “make the sector feel alive” are meaningful requests to an experienced human. To a coding agent they are loopholes. The agent can technically comply by adding a glow, a label, a lerp, or a timer and then declare victory.

This lexicon turns quality intent into named, inspectable implementation expectations. It is not a demand to use every technique. It gives you the vocabulary to ask for the right kind of solution and to reject shallow substitutions.

The strongest prompt pattern is:

> **Name the observable behavior, name the relevant technique family, name the forbidden shortcut, and name the evidence.**

Example:

> Implement a top-down command-curve follower using arc-length resampling, curvature-dependent target speed, and pure-pursuit look-ahead. Do not chase raw pointer samples point by point or write velocity directly. Prove it on straight, 90-degree, and S-curve fixtures with path, look-ahead, desired velocity, and actual trajectory debug overlays.

## 2. Physics and collision vocabulary

### Broad phase

The cheap first pass that identifies possible collision pairs, usually using a spatial hash, sweep-and-prune, bounding circles, or a tree. Use this term when you want many objects without checking every object against every other object.

Prompt signal:

> Preserve entity-level bounding circles for broad phase; perform detailed tests only for candidates.

### Narrow phase

The precise collision test after broad-phase filtering. In SpaceFace, this could test circles, capsules, or oriented boxes belonging to a compound structure.

Prompt signal:

> Add a narrow-phase compound-proxy test; do not replace the broad phase with per-triangle checks.

### Compound collider / compound collision proxy

A large object represented by several simple shapes. Excellent for top-down stations and wrecks. More truthful than one sphere, cheaper and more controllable than triangle-mesh collision.

Useful primitive names:

- circle;
- capsule;
- oriented bounding box (OBB);
- convex polygon;
- sensor volume.

### Capsule collider

A line segment thickened by a radius. Good for station arms, hull spines, pipes, and long wreck sections. It provides more useful collision normals than a string of unrelated circles.

### Oriented bounding box (OBB)

A rectangle/box that can rotate. Good for broad flat station modules. More expensive than a circle but still simple.

### Continuous collision detection (CCD) / swept collision

Testing the path between previous and current position so a fast body or projectile does not tunnel through an obstacle. Ask for swept circle-versus-proxy tests for fast ships and projectiles.

### Contact normal

The direction perpendicular to the surface at collision. Required for believable bounce, slide, ricochet, and impulse response. A generic center-to-center normal is wrong when the visible structure has a different surface.

### Penetration correction / positional correction

Moving overlapping objects apart. Ask for bounded correction and surface response, not teleportation to an arbitrary safe point.

### Restitution

Bounciness. A value near zero is inelastic; larger values rebound more. Useful for different materials and physics weapons.

### Tangential damping / friction-like damping

Reduction of velocity along the surface at contact. Useful for stations or docking capture without modeling terrestrial friction literally.

### Impulse

An instantaneous change in momentum. Use for explosions, recoil, collisions, and massline release corrections. Prefer routing through a single physics authority rather than direct velocity writes.

### Force field / continuous force

A force applied over time inside a region, such as gravity, current, tractor field, or anomaly. Distinguish it from an impulse.

### Softened inverse-square gravity

Gravity using `mu/(r² + epsilon²)` or equivalent to avoid singular acceleration near the center. Pair with an acceleration cap for game readability.

### Analytic orbit

A position computed from an authored formula rather than fully simulated. Excellent for satellites and orbital platforms when full orbital dynamics would be expensive or unstable.

### Fixed timestep

Simulation advances at a stable `dt` independent of render rate. Ask that gameplay physics use sim time and fixed steps; cosmetic animation can use render time.

### Deterministic physics receipt

A recorded event/result that can be tested: initial state, applied impulse/force, final quantized state, collision target, and revision. Useful for preventing “looks about right” claims.

## 3. Flight-control and control-theory vocabulary

### Reference frame

The coordinates in which intent is expressed. This is crucial for trackpad controls.

Possible frames:

- ship-relative: forward/right of player;
- target-relative: bearing/range around locked target;
- world-relative: absolute XZ direction;
- tether-relative: radial/tangential about anchor;
- path-relative: tangent/normal of route.

A great many flailing-control bugs come from mixing frames without stating it.

Prompt signal:

> Trackpad input is target-relative polar intent, not ship-relative yaw rate.

### Radial/tangential decomposition

For tether or gravity motion, split relative velocity into toward/away (`radial`) and around (`tangential`) components. This is the correct vocabulary for orbit assistance and swing telemetry.

### PD controller

Proportional–derivative control: command based on current error and rate of change. Useful for yaw alignment, radial stabilization, docking capture, and route following. Ask for clamps and deadbands.

Conceptually:

```text
command = kp * error - kd * errorRate
```

### Deadband

A small region around zero error where no correction is applied, preventing jitter.

### Hysteresis

Different thresholds for entering and leaving a state or retaining a target. Prevents flicker between components, repeated mode toggles, and unstable target selection.

### Rate limiting / slew-rate limiting

Limits how quickly a command changes. Useful for desired heading, thrust, camera, reticles, and target slots. It smooths control without pretending mass is zero.

### Bounded assist

An assist that modifies control authority within strict limits but does not set the outcome. This phrase is useful for Orbit Assist, docking capture, release snap, and target tracking.

### Intent gate

Explicit conditions under which an assist is allowed to act. Example for Orbit Assist: tether taut + forward held + one turn direction + no brake + sufficient tangential motion.

### Pure pursuit

A path-following method that steers toward a look-ahead point on a path. Good for top-down ships if combined with speed planning and physical control conversion.

### Look-ahead distance

How far along a path the controller targets. Often increases with speed. Too short causes oscillation; too long cuts corners.

### Arc-length resampling

Converts irregular pointer samples into roughly evenly spaced route points. Prevents gesture speed from changing path density and controller behavior.

### Catmull–Rom spline / cubic Hermite spline

Smooth curve families through or between control points. Useful for drawn paths. Ask to avoid overshoot near tight corners or use centripetal Catmull–Rom.

### Curvature-dependent speed planning

Reduce desired speed where the path bends sharply. Without it, the ship overshoots or cuts corners while the code technically “follows” the path.

### Target-relative slot controller

Represents desired position around a target as bearing and range. A strong fit for trackpad dogfight controls.

### Velocity matching

Damp relative velocity to a target/slot, not merely position error. Prevents orbiting and overshoot.

### Feed-forward

Using known target velocity/acceleration or route tangent in addition to error correction. Useful in pursuit and docking. It should supplement feedback, not replace it.

### Clutch gesture

A pause/finger lift that lets the user reposition on a trackpad without clearing the entire command. State exactly whether clutch pauses, appends, freezes, or resets a gesture.

### Control-authority overlay

A debug view showing raw input, desired heading, desired velocity, actual velocity, controller output, and active assist. Extremely useful when an agent says “the steering works” but the ship flails.

## 4. Combat-design vocabulary

### Verb differentiation

Weapons differ by what the player does or causes, not merely damage/range numbers. Useful verbs:

- displace;
- pin;
- tumble;
- sever;
- disable;
- bend;
- anchor;
- rebound;
- deploy;
- deny space;
- self-propel;
- expose weak point.

### Setup and payoff

One action creates a state; another exploits it. Examples:

- disrupt RCS → massline throw;
- concussion knockback → terrain collision;
- scan component → cut clamp;
- gravity puck → curved payload throw;
- vector mine → recoil-lance follow-up.

Ask agents to identify both setup and payoff. A state with no follow-up is usually noise.

### Area denial

A persistent or temporary region that changes safe movement—mine, gravity field, radiation corridor, turret coverage. Better than a damage circle when it changes routes or timing.

### Telegraph

A visible/audible precursor that communicates an attack or hazard. Ask for direction, timing, and counterplay, not just a flashing icon.

### Counterplay window

The time and action available to respond. State it explicitly for mines, pursuit, scan, charge weapons, and hazards.

### Hit-stop

A very brief local or global time effect on strong impact. Use sparingly. It does not replace real displacement or impact VFX.

### Recoil as mobility

Weapon recoil physically changes player motion. Ask that it use the same impulse authority and have a limiter such as heat/energy.

### Collision consequence

Tumble, component damage, cargo loss, or destruction caused by impact. Distinguish player and NPC rules explicitly.

### Combat arena grammar

The arrangement of anchors, cover, channels, hazards, boundaries, and routes that makes mechanics matter. Ask for a battle space, not just more enemies.

### Time-to-kill versus decision density

A longer fight is not automatically deeper. Decision density measures how often the player must choose positioning, target, tool, timing, or route. Use this phrase to reject enemies that are merely larger HP bars.

## 5. World and level-composition vocabulary

### Activity pocket

A spatial region with a purpose, objects, routes, and behavior: refinery approach, mining belt, customs lane, derelict field. Stronger than a named circular zone alone.

### Landmark silhouette

A large recognizable shape visible before interaction range. It lets the player orient without reading the map.

### Spatial hierarchy

Large landmark → pocket structures → interactive components → local VFX/details. Ask for all scales so a sector does not look like uniformly scattered props.

### Visual anchor

The dominant object or composition around which a pocket reads. Not every pocket needs a station.

### Route topology

The network of paths between producers, destinations, checkpoints, hazards, and hidden pockets. Useful for NPC jobs and player interception.

### Occlusion and reveal

Using large objects, fog, nebula, or spatial arrangement to conceal/reveal landmarks gradually. In top-down play, this may be partial silhouette overlap, sensor range, or lighting—not first-person corridors.

### Negative space

Deliberately empty space that frames objects, creates approach, or separates pockets. Distinguish designed negative space from unstructured emptiness.

### Gating by capability

A place is visible but inaccessible or inefficient until the player has a sensor, field tool, route, material, or infrastructure. Better than arbitrary mission locks.

### Persistent state change

A place remembers: repaired, stripped, occupied, linked, constructed, depleted, stabilized. Require before/after visual states and save behavior.

### Authored omission

A sector intentionally lacks certain pocket types. This prevents every sector from becoming the same complete checklist.

### Sector one-sentence identity

A test: “This is the sector with ______.” If the blank cannot be filled uniquely, composition is not done.

### Witnessed materialization

When the player is present, a statistical process appears as real ships/objects/events; when absent, it resolves statistically. Critical for convoys, couriers, raids, and construction traffic.

## 6. NPC and AI vocabulary

### Hierarchical state machine (HSM)

High-level job state with nested movement/combat behavior. Example: `HAUL` job interrupted by `THREAT_RESPONSE`, then resume/abort. Keeps world purpose separate from combat doctrine.

### Utility scoring

Choosing among a few actions by weighted scores. Useful for target/worksite selection, but agents should expose the score terms and avoid a mysterious universal utility AI.

### Route follower

Moves along authored waypoints/splines. Ask for look-ahead, arrival tolerance, speed planning, and stuck recovery.

### Local avoidance

Small steering corrections around nearby obstacles while retaining route goal. Do not let avoidance permanently replace the route command.

### Stuck detection

Measures insufficient progress over time. Recovery may replan to next safe anchor, reverse briefly, or reset controller state. It should not teleport through a landmark except as a documented failsafe outside player view.

### Job intent

The high-level purpose—mine, haul, patrol, salvage, survey. It should determine route and visible work. Combat archetype is not job intent.

### Interrupt policy

What happens when combat/distress/hazard interrupts a job: continue, flee, defend, call escort, abort, resume. Ask agents to define it for each job.

### Manifest

What a ship physically/economically carries. It makes piracy, inspection, routes, and consequences coherent.

### Formation contract

Relative slots, leader, separation, catch-up, break/rejoin conditions. Do not just assign a `formation: wedge` label.

### Cause receipt

A record explaining why an NPC/event acted: witnessed attack, distress signal, contraband scan, route loss. Prevents omniscient AI and disconnected news.

## 7. Rendering and asset vocabulary

### Modular kit

Reusable pieces designed to combine: truss, dock, tank, ring, hull plate, antenna, frame, engine block. Ask for consistent scale, pivots, materials, and attachment sockets.

### Trim sheet

A texture containing reusable strips/edges/details for many meshes. More efficient and coherent than unique textures for every prop.

### Texture atlas

Multiple texture regions packed into one image. Useful for props, decals, UI icons, and material variation.

### Decal atlas

Shared sheet of faction marks, warnings, numbers, damage, graffiti, and identification. Adds identity without unique geometry everywhere.

### Material variants

Shared geometry with controlled material/palette/grime/emissive differences. Ask for faction-specific variation without duplicating full assets.

### PBR material

Physically based material parameters: base color, metalness, roughness, normal, emissive, ambient occlusion. “Use PBR” alone is not enough; specify material story.

### Roughness breakup

Variation in roughness that makes surfaces read as worn, oily, painted, burned, or polished. Often more convincing than excessive geometry.

### Normal detail

Fine surface detail encoded in normal maps. Useful but cannot rescue a bad silhouette.

### Silhouette hierarchy

Primary mass, secondary structures, tertiary greebles. Ask that the object be identifiable at gameplay zoom before adding small detail.

### Hero asset versus kit asset

A hero landmark receives bespoke composition; kit assets support it. Agents often make everything generic because they are not told which asset must be singular.

### LOD (level of detail)

Simplified representations at distance. Ask for stable transitions, preserved silhouette, and HLOD/batching for large sites.

### HLOD (hierarchical LOD)

Combines groups into simplified distant representations. Useful for stations, wrecks, and orbital infrastructure.

### Instancing

Rendering repeated geometry in one draw path. Useful for asteroids, debris, satellites, repeated lights. Do not instance unique interactive components that require independent state unless supported.

### Draw-call budget

Explicit count/measurement for dense scenes. Ask agents to measure, not merely say “optimized.”

### Screen-space size

How large something appears in pixels at gameplay camera. Useful for deciding when details, labels, or components can be recognized.

### Emissive hierarchy

Bright accents used to communicate function: docks, power, danger, target components. Avoid making every edge glow equally.

### Volumetric impostor / billboard

Cheap distant fog, glow, plume, or atmosphere representation. Useful for scale, but should not be an HTML/CSS overlay pretending to be a world-space beam.

### World-space VFX

Effects positioned and occluded in 3D/world coordinates. Ask for beam, sparks, dust, and impact effects to track actual components and camera projection.

### Beam construction

For a better beam, request:

- world-space start/end tied to muzzle and hit point;
- camera-facing ribbon or cylinder with controlled core/halo;
- noise/scroll texture or segmented distortion;
- impact flare and particles;
- width/intensity driven by operation state;
- pooled geometry/materials;
- no nested translucent HTML tubes.

### GPU particles / instanced particles

Efficient repeated particles. Ask for pooling, bounded counts, and operation-specific motion, not just more particles.

### Postprocessing restraint

Bloom, vignette, chromatic aberration, and distortion should reinforce hierarchy. More bloom is not polish. Ask for luminance thresholds and same-framing comparison.

## 8. Frontend and UI vocabulary

### Information architecture

What information belongs where and in what hierarchy. Ask this before styling.

### Progressive disclosure

Show immediate action and state; reveal details on inspection. Useful for avoiding HUD clutter.

### Contextual inspector

A panel tied to selected object/component. Better than persistent panels for every system.

### State machine UI

UI reflects explicit states (`approach`, `align`, `capture`) rather than scattered booleans and string changes.

### View model

A render-ready projection of game state. Keeps DOM/render code from directly mutating simulation.

### Event-driven rendering

Update UI on relevant state/events rather than rebuilding every frame. Ask for stable signatures/diffing where needed.

### Virtualization

Render only visible rows/items in long lists. Relevant for ledgers, markets, and logs—not small HUDs.

### CSS containment

`contain`, isolated layout/paint, and bounded effects reduce expensive reflow/repaint. Useful for complex overlays.

### FLIP animation

First–Last–Invert–Play technique for animating layout changes. Useful for cards/rails, but do not animate gameplay-critical world objects in DOM.

### Reduced motion

Alternate presentation preserving information without large movement/flashes. Require it for camera/UI effects.

### Focus management

Keyboard focus behavior when opening/closing modal or dock screens. Prevents gameplay input leaking into UI and vice versa.

### Hit target

Actual clickable/touchable area. Require readable pointer targets independent of tiny visual glyphs.

### Contrast and luminance hierarchy

Functional readability, not neon everywhere. Ask for primary, secondary, muted, warning, danger, and focus states.

### Same-framing visual comparison

Before/after screenshots at identical camera, viewport, state, and time when claiming a visual improvement.

## 9. Data, architecture, and persistence vocabulary

### Single-writer ownership

One system owns mutation of a field; others emit intents/events. SpaceFace already uses this. Include it explicitly in prompts touching credits, cargo, reputation, world state, or ship stats.

### Pure data catalog

Definitions with no runtime side effects. Good for machines, weapons, components, jobs, routes, and site recipes.

### Pure kernel

Deterministic function taking inputs and returning outputs without state mutation. Excellent for force math, signature, scoring, route planning, and production.

### Adapter

Thin translation between an existing system and a new representation. Prefer adapters over duplicate authorities.

### Stable ID

Save-safe identifier that does not depend on array index or runtime entity ID.

### Event sourcing / receipt

Store meaningful events or outcomes and derive/rematerialize state. Useful for aftermath, construction, site history, and ledger.

### Projection

Convert authoritative state into another view: flight exterior from asteroid-site interior, map readout from world state, visual component states from site record.

### Schema version and migration

Required when persisted shapes change. Ask for old-save defaults and migration tests.

### Idempotent event handling

Repeated delivery produces the same final result without duplicate rewards/state. Critical around save/load and rematerialization.

### Bounded state

Receipts, objects, and histories have caps/cleanup. Prevents endless wrecks, debris, effects, and logs.

### Fail closed

Malformed or missing data does not grant free rewards, invisible stealth, or bypass. It returns a safe conservative behavior and clear diagnostics.

### Feature flag

Useful for experiments, but a hidden default-off feature is not player completion. Require a decision: experiment, live default, or removal.

## 10. Testing and acceptance vocabulary

### Contract test

Tests interface and invariant: event shape, ownership, deterministic math, persistence. Does not prove player experience.

### Fixture

A controlled scenario for testing one mechanic. Good fixtures are reachable and repeatable.

### Golden test

Compares deterministic output against approved baseline. Never update blindly just to make red green.

### Property-based test

Tests broad invariants over many generated inputs: no NaN, monotonic falloff, bounded force, deterministic ordering.

### Metamorphic test

Transforms input and expects a related output: rotating a vector mine 180 degrees reverses impulse; doubling mass halves acceleration under same impulse.

### Headed browser probe

Runs the actual visible game in a browser and interacts through public input. Stronger than headless unit proof.

### Normal-route proof

Feature reached from ordinary player route without injected state or internal console mutation after launch.

### Telemetry invariant

Quantitative runtime rule: no controller oscillation, bounded error, no allocation spike, route progress, stable frame time.

### Mutation resistance

A test suite should fail when the meaningful implementation is removed or weakened. Ask agents to identify which deliberate mutation each test catches.

### Acceptance matrix

Table of requirement, evidence, pass/fail, revision. Prevents “all done” summaries that collapse code existence, focused green, and player acceptance.

### Anti-placeholder test

Explicitly checks that the feature is not represented by a generic sphere, fallback box, single collider, one progress bar, or reward toast.

## 11. Image-generation vocabulary and anti-cartoon controls

### Desired style descriptors

Use combinations such as:

- cinematic documentary still;
- photorealistic hard-surface industrial science fiction;
- restrained production concept art with realistic materials;
- high-end game keyframe, grounded scale and lighting;
- archival mission photograph;
- spacecraft engineering dossier;
- forensic recovery image;
- orbital reconnaissance plate;
- diegetic technical schematic;
- matte-painted cinematic realism, not illustration;
- physically plausible lensing and exposure;
- weathered metal, thermal discoloration, micrometeor impacts;
- utilitarian costumes, natural facial proportions;
- subdued palette with one functional accent color.

### Negative/style exclusions

State them explicitly:

> No comic-book linework, no cel shading, no pulp-magazine illustration, no 1950s retro-futurist cover, no cartoon proportions, no anime, no painterly caricature, no exaggerated heroic pose, no clean plastic cosplay armor, no generic neon cyberpunk, no text baked into the image.

### Character portraits

Request:

- head-and-shoulders documentary portrait;
- practical spacecraft lighting;
- neutral or lived-in expression;
- asymmetry, pores, age, fatigue, scars where appropriate;
- realistic clothing materials;
- faction identity through insignia, construction, and wear—not costume parody;
- consistent lens and framing across the set.

### Wreck images

Request:

- identifiable original ship silhouette broken into structural sections;
- exposed ribs, decks, tanks, conduits, and torn pressure hull;
- scale references such as small salvage craft;
- coherent direction of impact and debris;
- no molten asteroid sphere;
- no random boxes glued to a ball;
- top-down readability if used as a gameplay reference.

### Treasure maps and evidence

Use:

- annotated orbital survey;
- hand-corrected navigation plot;
- radar composite;
- thermal scan;
- insurance-loss diagram;
- black-box frame extraction;
- customs seizure photograph;
- engineering cutaway;
- recovered captain’s route chart.

These are naturally compatible with static story presentation and less prone to character-cartoon failure.

## 12. Translating vague requests into agent-grade prompts

### “Make the station physical.”

Use:

> Replace the entity-level station circle as the sole narrow-phase shape with an authored compound planar proxy made from circles and capsules aligned to the visible hull. Preserve the existing bounding radius for broad phase. Add a debug overlay, one deliberate traversable opening, one protected arm, and one exterior docking corridor. Prove fast ship and projectile sweeps against the proxies in browser and Electron.

### “Make flying feel better.”

Use:

> Instrument raw input, desired heading, desired velocity, actual velocity, yaw error, and active assist. Implement the named controller only after reproducing the failure in a fixture. Use deadband, rate limits, and bounded PD correction. Do not write velocity directly or blend unrelated reference frames.

### “Make the sector feel alive.”

Use:

> Implement one complete miner and one hauler job loop between authored field, transfer point, and station anchors. Their motion must reveal purpose without HUD labels. Loading/working/unloading must have world-space presentation and a real manifest/economy receipt. Add stuck recovery and a five-minute stationary-observer browser capture.

### “Make the wreck more detailed.”

Use:

> Replace the generic wreck representation with a 320–600 wu modular hull assembly, compound collision channels, five targetable components, one detachable dynamic payload, persistent stripped state, and one optional illustrated ledger artifact. Do not use a sphere, fallback box, or one global salvage progress bar.

### “Make combat more strategic.”

Use:

> Add one setup–payoff interaction: RCS disruptor causes a finite physical tumble; the tumbled target can be massline-thrown or knocked into proxy-defined terrain. Build an arena with two anchors and one hazard. Prove an encounter can be won primarily through displacement rather than sustained LMB DPS.

### “Make it look professional.”

Use:

> Establish silhouette hierarchy at gameplay zoom, material-role hierarchy, restrained emissive accents, world-space operation VFX, and same-framing before/after captures. Measure draw calls and frame cost. Reject generic bloom, arbitrary greeble density, CSS overlays for world effects, and details invisible at normal camera scale.

## 13. Compact prompt checklist

Before sending a feature to an agent, include:

1. **Player fantasy** — one sentence.
2. **Exact input sequence** — buttons/gesture and contextual resolution.
3. **Reference frame** — ship, target, world, tether, or path.
4. **Authoritative state owner** — who writes what.
5. **Named technique** — controller, collider, state machine, rendering method.
6. **Existing seams reused** — no parallel authority.
7. **Minimum fixture** — smallest proof.
8. **Forbidden shortcuts** — at least five.
9. **Deterministic checks** — mechanics/save.
10. **Headed capture** — actual player route.
11. **Visual acceptance** — same framing and normal zoom.
12. **Performance bound** — dense representative scene.
13. **Stop condition** — do not replicate until accepted.

The point of technical vocabulary is not to decorate the prompt. It is to close escape hatches. A good agent brief makes the easy wrong implementation more difficult than the intended one.

<!-- END FILE: 11_PROMPTING_GLOSSARY_AND_TECHNIQUE_LEXICON.md -->

<div style="page-break-after: always;"></div>

---


<!-- BEGIN FILE: 12_MASTER_AGENT_HANDOFF_TEMPLATE.md -->

# 12 — Master Agent Handoff Template

Use this template when sending one feature brief into a planning model or coding agent. Replace bracketed fields. Attach or paste the relevant numbered brief from this playbook and `07_AGENT_EXECUTION_CONTRACT.md`.

---

## Prompt begins

You are working in the current `coldshalamov/SpaceFace` repository. The repository is active and may contain concurrent changes newer than any quoted commit. Before editing:

1. read the root and nested `AGENTS.md` files governing every path you may touch;
2. inspect `git status --short`, current branch/HEAD, and diffs for candidate files;
3. identify the current authoritative implementation rather than trusting historical design status;
4. do not reset, clean, stash, overwrite, or revert unrelated work;
5. do not update golden expected data merely to make a check pass.

### Feature authority

Implement this feature:

**[PASTE ONE FEATURE BRIEF HERE]**

The following project-wide contract is also authoritative:

**[PASTE `07_AGENT_EXECUTION_CONTRACT.md` OR ITS RELEVANT SECTIONS HERE]**

### Product objective

The player-facing outcome is:

> [ONE SENTENCE DESCRIBING WHAT THE PLAYER CAN NOW DO OR EXPERIENCE]

This is not complete merely because data, code, a hidden route, a test, or an asset exists. It is complete only when the player can reach and operate it through the declared route and current revision evidence proves the result.

### Scope boundary

In scope:

- [BOUNDED MECHANIC OR SITE]
- [EXISTING SYSTEMS TO REUSE]
- [ONE NORMAL OR DEVELOPER FIXTURE]
- [PERSISTENCE/INTEGRATION REQUIRED]
- [PLAYER-FACING PRESENTATION REQUIRED]

Out of scope:

- [LARGER SYSTEM NOT NEEDED]
- [CONTENT REPLICATION]
- [SECONDARY UI REDESIGN]
- [FULL AI/PHYSICS REWRITE]
- [VOICE/CUTSCENE/PROCEDURAL GENERATION]

### Required first response: audit and implementation plan

Do not edit code in your first response. Return the following:

#### A. Current-state audit

- exact current files and functions that own the relevant behavior;
- which existing systems already partially implement the requested feature;
- whether the feature is normal-route reachable, developer-route reachable, focused-test only, or code/data only;
- current collision/input/save/render authority involved;
- conflicts, stale alternatives, feature flags, or historical files that must not be mistaken for live ownership.

#### B. Player-observable contract

Provide a table:

| Step | Player input | Selected target/component | Visible response | State transition | Failure/counterplay |
|---|---|---|---|---|---|

Every input must be unambiguous in the relevant reference frame. State whether the input is ship-relative, target-relative, world-relative, tether-relative, or path-relative.

#### C. Reuse map

List each required behavior and the existing owner/service/event it will use. Explicitly identify any genuinely missing primitive. Do not create a duplicate credits, cargo, reputation, physics, world, target, or save authority.

#### D. File and lease map

List:

- files to edit;
- new files to create;
- owner of each shared file;
- files read-only due to concurrent work or authority;
- integration order.

#### E. Minimal vertical slice

Define the smallest fixture that proves the mechanic. It must include:

- exact entities/structure/pocket;
- initial state;
- public or declared developer route;
- input sequence;
- expected result;
- cleanup/reset method.

#### F. Technical method

Name the technique rather than saying “advanced” or “smooth.” Examples include:

- compound planar proxies with entity broad phase and proxy narrow phase;
- swept circle-versus-capsule collision;
- bounded PD controller in radial/tangential frame;
- target-relative polar slot controller;
- arc-length-resampled spline with pure-pursuit look-ahead;
- hierarchical NPC job state machine;
- witnessed materialization plus statistical absent resolution;
- event-sourced persistent component state;
- instanced modular kit with HLOD.

Provide equations, state diagrams, data shapes, or pseudocode where ambiguity would otherwise remain.

#### G. Failure-mode pre-mortem

List at least ten ways an autonomous implementation could technically satisfy the words while failing the experience. Include any relevant items from this set:

- generic sphere or fallback box;
- unrelated central collider;
- one global progress bar;
- reward toast without physical state change;
- direct velocity writes;
- hidden autopilot;
- mixed reference frames;
- NPC wandering with a job label;
- timers disconnected from world events;
- duplicate state ownership;
- default-off hidden feature called complete;
- special capture route bypassing normal play;
- visual detail invisible at gameplay zoom;
- unbounded entities/receipts/particles;
- save/load state loss;
- browser/Electron divergence.

#### H. Verification plan

Specify:

1. pure/deterministic tests;
2. persistence/migration tests;
3. integration checks;
4. browser route/probe;
5. Electron route if the feature touches desktop/runtime parity;
6. debug overlays/telemetry;
7. same-framing visual captures;
8. performance measurement;
9. mutations each test should catch.

### Implementation requirements

After the plan is reviewed or when proceeding under best judgment:

1. implement one coherent vertical slice;
2. use stable IDs and existing event/ownership seams;
3. expose tuning constants in one named place;
4. add debug instrumentation that can be disabled without removing the mechanic;
5. preserve deterministic fixed-step behavior;
6. make old saves default safely;
7. keep browser, Electron, and packaged route behavior identical;
8. provide a clean fallback only when it does not hide failure;
9. do not replicate content beyond the fixture;
10. stop if the required primitive cannot be implemented honestly within scope and report the exact blocker rather than substituting a weaker representation.

### Anti-placeholder acceptance

The implementation automatically fails acceptance if any of these are true:

- [FEATURE-SPECIFIC PLACEHOLDER FAILURE 1]
- [FEATURE-SPECIFIC PLACEHOLDER FAILURE 2]
- [FEATURE-SPECIFIC PLACEHOLDER FAILURE 3]
- the primary player result exists only in text/UI;
- the visible object and collision/interaction geometry disagree materially;
- the operation has no persistent or systemic consequence where one is claimed;
- a reviewer cannot reproduce the sequence through declared public inputs;
- the feature is only green because expected/golden output was rewritten without a justified re-record decision.

### Final report format

Return:

1. **What changed for the player**
2. **Files and authorities touched**
3. **Exact input sequence**
4. **Focused checks and results**
5. **Normal-route/browser/Electron evidence**
6. **Performance receipt**
7. **Known limitations and unproven claims**
8. **Commit/revision identity**
9. **Next bounded slice, not a broad wishlist**

Use the status terms distinctly:

- code exists;
- implemented in current tree;
- focused check green;
- player route proven;
- visual acceptance passed;
- integrated and recoverable.

Do not collapse them into “done.”

## Prompt ends

---

## Example anti-placeholder insertions

### For a wreck landmark

- primary body may not be a sphere, asteroid, or one generic wreck entity;
- at least five visible components must correspond to independently targetable states;
- solid hull regions and deliberate channels must agree with compound collision proxies;
- salvage cannot be one global RMB progress bar;
- at least one recovered item must exist as a physical detachable payload before reward settlement.

### For a control mode

- no direct velocity assignment or kinematic orbit/path playback;
- no indefinite yaw-rate command from trackpad displacement;
- reference frame must be explicit and singular;
- manual override must disengage within one simulation tick;
- debug overlay must show raw input, desired state, controller output, and actual state.

### For an NPC job

- motion must reveal purpose without relying on a label;
- loading/working/unloading must correspond to real state transitions;
- route must have stuck detection and bounded recovery;
- combat must be an interrupt with resume/abort policy;
- witnessed and absent resolution must reconcile to the same authoritative result.

### For industry exteriorization

- a site milestone must change flight-world geometry, traffic, route, or capability;
- courier launch must correspond to real site policy and inventory;
- player-present loss must reconcile with statistical route state;
- construction cannot jump from zero to complete after a timer;
- final payoff cannot be passive credits alone.

## Minimal invocation pattern

For a planning thread:

> Read the attached SpaceFace feature brief and execution contract. Audit current `master`, then return only sections A–H from the Master Agent Handoff Template. Do not code yet. Resolve ambiguities using the product north star and choose the smallest honest vertical slice.

For a coding thread after a plan exists:

> Implement the approved vertical slice below against current `master`. Treat the player-observable contract, anti-placeholder criteria, owner map, and verification plan as binding. Re-audit files before editing because the tree may have moved. Do not broaden scope. End with the required final report and current evidence.

<!-- END FILE: 12_MASTER_AGENT_HANDOFF_TEMPLATE.md -->
