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
