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
