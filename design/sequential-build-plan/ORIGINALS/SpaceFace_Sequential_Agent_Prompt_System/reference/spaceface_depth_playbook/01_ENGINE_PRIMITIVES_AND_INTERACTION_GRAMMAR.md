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
