---

<!-- SOURCE: README.md -->

# SpaceFace Gravity & Massline Expansion Package

## Purpose

This package turns the current gravity, massline, planetary, physics-combat, and world-activity discussion into bounded implementation documents that can be pasted into planning threads or coding-agent sessions without re-explaining the design intent.

The package is written around the actual constraint of SpaceFace: the game is a top-down Newtonian-ish space game with keyboard flight, independent cursor aim, a physical massline, impulse effects, a developing asteroid-industry layer, and an open world whose current sectors and NPC activity are too homogeneous. The goal is not to build a scientific orbital simulator. The goal is to make **assisted relational physics** the game's distinctive play language.

The central design sentence is:

> The player chooses the body, direction, risk, and moment; the flight computer supplies the precision needed to make that intention physically legible.

## Package contents

1. `01_DESIGN_BIBLE_ASSISTED_RELATIONAL_PHYSICS.md`  
   The governing thesis, design laws, shared primitives, gameplay pillars, and feature taxonomy.

2. `02_CONTROL_TARGETING_ORBIT_AND_SLINGSHOT.md`  
   Intent-aware tether acquisition, input ergonomics, flyby focus, orbit assist, line-length control, release windows, slingshot chains, and route validation.

3. `03_GRAVITY_WEAPONS_AND_MASSLINE_VARIANTS.md`  
   Physics-first combat, weapon knockback, mass seeds, repulsors, inertial manipulation, alternative masslines, drag nets, twin bridles, and combat combinations.

4. `04_PLANETARY_ACTIVITIES_HEISTS_AND_SECTOR_IDENTITY.md`  
   Planetary slingshot courses, atmospheric skimming, mass-driver theft, satellite operations, convoys, meteor hitchhiking, black-hole regions, missions, and sector archetypes.

5. `05_VFX_AND_PRESENTATION_TECHNICAL_DIRECTION.md`  
   Runtime techniques and exact vocabulary for replacing primitive translucent tubes and N64-like effects with readable modern Three.js VFX.

6. `06_IMPLEMENTATION_ROADMAP_TESTING_AND_AGENT_LANES.md`  
   Dependency order, vertical slices, three-agent work partitioning, deterministic tests, browser evidence, and anti-placeholder gates.

7. `07_PASTEABLE_AGENT_BRIEFS.md`  
   Standalone briefs in the format: problem → consequence → proposed solution → implementation direction → acceptance → forbidden shortcuts.

8. `08_MASTER_IMPLEMENTATION_HANDOFF_TEMPLATE.md`  
   Reusable wrapper that forces repository audit, ownership mapping, evidence, and anti-shortcut discipline.

9. `SPACEFACE_GRAVITY_MASSLINE_COMBINED.md`  
   All documents concatenated into one searchable file.

## Recommended use

Do not hand the whole package to one coding agent and ask it to “implement gravity.” That invitation produces a field shader, a radial force, two toasts, and a victory lap.

Use this workflow:

1. Select one brief from `07_PASTEABLE_AGENT_BRIEFS.md`.
2. Paste it into a planning thread and require a current-repository audit before implementation.
3. Require the planner to name existing owners, files, event seams, tests, and player-route evidence.
4. Hand the bounded plan to the coding agent.
5. Reject completion unless the ordinary game route visibly proves the mechanic.

## Recommended first sequence

The correct dependency order is:

1. Intent-aware tether targeting.
2. Massline input and line-control ergonomics.
3. Anchor-relative orbit assist.
4. Slingshot release prediction and one authored sling course.
5. Baseline physical weapon impulse.
6. Mass Seed and Repulsor Seed.
7. Atmospheric reentry payoff.
8. NPC routes and planetary activities.
9. Sector recomposition around movement topology.
10. Industrial manufacture of permanent physics infrastructure.

## Scope guardrail

This package intentionally rejects a full N-body simulator, universal mutual gravity, manual spacecraft attitude micromanagement, large dialogue trees, and dozens of unrelated action keys. Complexity should arise from combinations of a few stable laws, not from a cockpit keyboard that looks like an organ donated by NASA.


---

<!-- SOURCE: 01_DESIGN_BIBLE_ASSISTED_RELATIONAL_PHYSICS.md -->

# SpaceFace Design Bible: Assisted Relational Physics

## 1. Executive thesis

SpaceFace should not attempt to distinguish itself through realistic orbital mechanics alone. Realism is not the product. The product is a top-down space sandbox in which bodies have understandable relationships—tethered, orbiting, falling, being pushed, being pulled, being made lighter or heavier, being caught in a field, or being redirected toward terrain—and the player can exploit those relationships without needing fighter-pilot dexterity or a joystick.

The strongest formulation of the game's unique value proposition is:

> **SpaceFace is the space game where assisted relational physics is the combat, traversal, crime, and construction language.**

“Assisted” is essential. A trackpad and four directional keys cannot provide the instantaneous aiming and continuous angular correction required by raw Newtonian play. The game must infer likely intent, expose what it inferred, and provide bounded precision. It must not choose strategy for the player.

“Relational” is equally essential. Ordinary spaceflight offers only thrust, rotate, and fire. The massline creates a frame of reference between the player and another body. Artificial gravity creates a temporary relationship among many bodies. Planets, moving freight, meteors, atmospheric bands, and mass drivers create routes and situations. Physics becomes interesting when it is about **what the player is moving relative to**, not merely the player's absolute velocity.

## 2. The current failure pattern

The current game presents several valuable systems, but the player-facing primitives remain too narrow:

- Flight mostly means forward thrust, turning, and braking.
- Combat mostly means hold fire until hull reaches zero.
- Mining means hold the beam until resources increment.
- Docking means approach a broad region and open a screen.
- Most NPCs share the same visible behavior despite having different labels.
- The massline is potentially expressive but often becomes a drag penalty or a confusing attachment.
- Complex backend systems frequently terminate in the same surface action: LMB, RMB, or E.

This produces two related forms of sameness:

1. **World sameness:** sectors contain different nouns but similar spatial arrangements and activity.
2. **Verb sameness:** different objects still resolve through the same hold-button interaction.

The remedy is not simply more content. More content built on the current surface grammar becomes more labeled spheres, more menus, and more sources of `+1 Iron Ore`.

The remedy is to enlarge the reusable physics and interaction vocabulary first, then use it to populate worlds.

## 3. Governing design laws

### Law 1: The player supplies intent; the computer supplies precision

The player must choose:

- Which object matters.
- Which side to pass.
- Which direction to orbit.
- Whether to tow, sling, throw, disable, flee, steal, or harvest.
- When to commit.
- Which risk to accept.

The computer may supply:

- Target preference.
- Lead prediction.
- Angular-rate matching.
- Small radial corrections.
- Release-window assistance.
- Stable camera framing.
- Clear trajectory previews.
- Input hysteresis and forgiveness.

The computer must not silently choose the route, target, weapon combination, or release moment without communicating what it will do.

### Law 2: Artistic physics must be coherent, not realistic

SpaceFace may take large liberties with physics. Those liberties should form a consistent game language.

Acceptable liberties include:

- A planet functioning as a massline anchor even if no physical cable could survive it.
- A mass seed producing a large temporary gravity field.
- Player immunity to impact hull damage while enemies suffer momentum damage.
- Physics-earned velocity exceeding ordinary powered-flight limits.
- A bounded assist maintaining a clean orbit.
- Atmospheres behaving as readable annular gameplay bands rather than full fluid simulations.
- A black hole with authored safe and unsafe corridors rather than relativistic integration.

Unacceptable liberties are those that break legibility:

- A trajectory preview using different physics from the ship.
- Invisible teleports or velocity edits presented as momentum.
- A tether selecting a target the player had no reason to expect.
- A weapon claiming to push but merely playing a ring animation.
- A massive structure visually occupying one shape while colliding as an unrelated tiny sphere.

### Law 3: Complexity should come from combinations, not button count

The game should have a small set of stable actions whose meaning changes predictably with context.

A target set might contain:

- Combat target.
- Navigation target.
- Current tether target.
- Cursor candidate.
- Current route anchor.

A small input set can consume these consistently:

- Fire.
- Mine / secondary tool.
- Massline.
- Physics deployable.
- Detonate / activate.
- Scan.
- Boost.

Do not create one key each for “planet sling,” “enemy throw,” “tow,” “mass seed orbit,” “cargo catch,” and “meteor hitchhike.” That is not depth. That is a keyboard tax.

### Law 4: Momentum and position must matter at least as much as damage

Weapons and tools should alter:

- Linear velocity.
- Angular velocity.
- Tether geometry.
- Relative mass or force response.
- Position relative to terrain, atmosphere, fields, convoys, and routes.
- Ability to aim, thrust, or stabilize.

A combat result may be:

- Destroyed.
- Tumbled.
- Pinned to a field.
- Knocked out of formation.
- Thrown into a planet.
- Forced to disengage.
- Captured in a drag net.
- Stripped of an external component.
- Left behind while the player escapes.

The game becomes creative when “winning” is not identical to removing all hit points.

### Law 5: Environments are combat equipment

Every authored combat pocket should contain one or more meaningful physical affordances:

- A large anchor.
- An atmosphere.
- A gravity field.
- A station hull or shield surface.
- A debris lane.
- A convoy.
- A mass driver path.
- A moving meteor.
- A repulsor or acceleration structure.

The environment should not be dense gravel. It should contain a few legible, consequential bodies.

### Law 6: A new industrial tier must unlock a new verb or scale of control

The automation loop cannot culminate only in better damage numbers. Each tier should change what the player can do:

- Manufacture physics deployables.
- Build permanent mass anchors.
- Operate launch drivers.
- Create gravity-assisted freight lanes.
- Deploy automated cargo catchers.
- Reposition asteroids.
- Construct stations at authored orbital nodes.
- Build planetary defense systems.
- Seed new traffic routes and settlements.

### Law 7: The player should be robust; enemies should be expressive

Physics toys become unusable when every accidental collision kills the player. Recommended asymmetry:

- Player collision: knockback, shield flash, temporary control disturbance, heat, or capacitor cost—but little or no hull damage.
- Enemy collision: momentum-scaled damage, tumble, subsystem disruption, morale effects, and atmospheric destruction.
- Healthy enemies should resist cheap environmental kills; disabled, lightened, tumbled, or heavily redirected enemies should not.

This creates freedom to experiment without removing consequences from intentional setups.

### Law 8: The game must always show the currently inferred action

Before a latch, throw, release, field deployment, or route sling, the player should see:

- The selected candidate.
- Why it is selected, implicitly through visual emphasis.
- The line or field that will be created.
- The direction of the expected result.
- Whether the action affects the player, the tethered payload, or another target.

The user interface should answer “What will happen if I press this now?” before the press becomes irreversible.

## 4. The five gameplay pillars

### 4.1 Physics traversal

The player gains speed and changes direction by exploiting bodies and infrastructure:

- Planetary massline slingshots.
- Asteroid anchor slings.
- Meteor hitchhiking.
- Convoy frame coupling.
- Artificial mass seeds.
- Acceleration rings.
- Gravity corridors.
- Atmosphere-assisted braking or harvesting.

Traversal mastery becomes an optional skill ceiling. A novice can still thrust directly. An expert crosses a sector in a chain of authored momentum transfers.

### 4.2 Physics combat

Combat is organized around setup and payoff:

- Mark or lighten a target.
- Pull, push, tether, net, or tumble it.
- Use terrain, atmosphere, another enemy, or a field as the payoff.
- Fire weapons while movement remains the primary decision.

Basic weapons remain understandable. Advanced weapons alter physical state more than raw DPS.

### 4.3 Space crime and interception

A living world produces physical opportunities:

- Surface-launched cargo pods.
- Ore convoys.
- Courier relays.
- Satellite data transfers.
- Construction shipments.
- Patrol checkpoints.
- Salvage claims.
- Automated harvesters.

The player may protect, intercept, steal, sabotage, redirect, or launder these flows. Crime is expressed through movement and world state, not only dialogue choices.

### 4.4 Planetary and orbital operations

Planets become centers of activity rather than background art:

- Slingshot courses.
- Atmospheric harvesting.
- Orbital salvage.
- Satellite constellations.
- Mass drivers.
- Defense systems.
- Elevator terminals.
- Research or sensor arrays.
- Black-hole and anomaly operations.

### 4.5 Industrial control of physics infrastructure

Asteroid Ops and automation eventually manufacture the world-scale tools used in the other pillars:

- Mass seeds.
- Repulsor charges.
- Specialized masslines.
- Cargo catchers.
- Route beacons.
- Acceleration rings.
- Station frames.
- Defense pylons.
- Artificial orbital anchors.

The player's industry changes the exterior game visibly.

## 5. Shared engine primitives

The project should resist implementing each idea as a bespoke system. The following primitives provide the highest leverage.

### 5.1 Intent-aware candidate scoring

One shared selector ranks tether, physics-tool, and contextual interaction candidates using:

- Cursor precision.
- Cursor direction.
- Current turn input.
- Current thrust input.
- Distance.
- Screen prominence.
- Time to closest approach.
- Relative mass.
- Object category.
- Current target memory.
- Current route anchor.
- Recent player input.

The selector produces a score plus a reason category. It must support different weight profiles for combat, anchor, tow, and route contexts.

### 5.2 Anchor-relative reference frames

Any large anchor supplies:

- Radial direction.
- Clockwise tangent.
- Counterclockwise tangent.
- Radial velocity.
- Tangential velocity.
- Angular velocity.
- Current tether length.

This frame powers orbit assist, atmosphere skimming, route slings, massline aiming, and planet-relative HUD elements.

### 5.3 Bounded orbit and line-control assist

A controller helps maintain the player's intended orbit without forcing a canned animation. It should:

- Match facing or thrust direction to the tangent.
- Suppress excessive inward or outward radial velocity.
- Keep the tether meaningfully taut.
- Respect player boost and reel commands.
- Permit wobble and imperfect motion.
- Disengage instantly on manual override or cut.

### 5.4 Shared trajectory predictor

A fixed-step predictor simulates a short horizon using the same force and constraint approximations as gameplay. It produces:

- Ballistic path.
- Tethered release path.
- Field-curved path.
- Intercept point.
- Release error.
- Closest approach.
- Expected exit speed.

The predictor is a read-only tool. It does not move the ship.

### 5.5 Momentum provenance

Velocity changes should be tagged by source:

- Thruster-earned.
- Boost-earned.
- Massline-earned.
- Gravity-earned.
- Explosion-earned.
- Frame-coupling-earned.
- Collision-earned.

This enables the flight governor to preserve spectacular physics-earned speed while retaining normal handling limits for ordinary thrust.

### 5.6 Continuous field source

One reusable field representation supports:

- Attraction.
- Repulsion.
- Directional cones.
- Projectile-only lensing.
- Momentum damping.
- Authored black-hole regions.

The field is not necessarily physically exact. It must be deterministic, bounded, visualized, and routed through the physics authority.

### 5.7 Physics-effect status model

A small set of statuses should alter physical response:

- `lightened`: stronger response to impulse, tether, and fields.
- `ballasted`: weaker response, slower acceleration, stronger anchoring.
- `tumbling`: reduced or absent aiming and thrust authority.
- `frameLocked`: velocity coupled to another body or reference frame.
- `gravityMarked`: stronger artificial-field coupling.
- `stabilized`: reduced angular disturbance.
- `reentry`: progressive atmospheric destruction state.

Keep these explicit. Do not hide them as arbitrary multipliers scattered across weapon code.

### 5.8 Multi-body attachment graph

A generalized attachment layer eventually supports:

- Player-to-body massline.
- Body-to-body twin bridle.
- Drag net with multiple captured bodies.
- Payload-to-receiver delivery.
- Frame coupling.

The graph must have strict caps, clear ownership, cycle prevention, and deterministic cleanup.

### 5.9 Authored sling-route definition

A route contains:

- Ordered or optional anchors.
- Entry volumes.
- Tetherable surfaces or anchor centers.
- Allowed clockwise/counterclockwise directions.
- Recommended tether-length bands.
- Release targets or gates.
- Minimum and maximum expected speeds.
- Failure recovery positions.
- Camera framing hints.

A route validator should prove that a route is traversable under expected player and assist parameters.

### 5.10 Modern world-space VFX primitives

A reusable presentation library should contain:

- SDF or mesh-based tether ribbons.
- Gradient field discs and cones.
- Instanced particle emitters.
- Shockwave rings.
- Heat and reentry trails.
- Velocity streaks.
- Screen-space distortion surfaces.
- Target and release arcs.
- Depth-aware glows.

These are presentation consumers of semantic events, not gameplay owners.

## 6. The core feature families

### 6.1 Slingshot family

- Large-body massline latch.
- Orbit assist.
- Line reel-in and pay-out.
- Release timing arc.
- Next-anchor route selection.
- Momentum chain.
- Camera zoom and speed presentation.
- Authored sling courses.
- Meteor and convoy hitchhiking.

### 6.2 Gravity-field family

- Natural mild planetary pull.
- Mass Seed attraction.
- Repulsor Seed.
- Directional gravity cone.
- Black-hole field.
- Gravity lens for projectiles.
- Momentum sink or capture field.

### 6.3 Physics weapon family

- Baseline per-shot impulse.
- Concussion cannon.
- Inertial shunt.
- Gravity mark.
- Vector mine.
- Impulse charge combinations.
- Atmosphere and terrain payoffs.

### 6.4 Massline family

- Orbital spool.
- Tractor spool.
- Elastic whip.
- Frame coupler.
- Monofilament line.
- Twin bridle.
- Drag net.

### 6.5 Planetary activity family

- Atmospheric harvesting.
- Orbital salvage.
- Satellite repair or theft.
- Surface-launch interception.
- Planetary defense.
- Black-hole expedition.
- Gravity-course contracts.
- Lagrange-style construction nodes.

### 6.6 Living-world family

- Miners working fields.
- Haulers moving output.
- Surface launch schedules.
- Patrol routes.
- Customs intercepts.
- Pirate ambush and theft.
- Scavenger response to battles.
- Construction traffic.
- Player interference that creates persistent consequences.

## 7. Progression thesis

The progression should move through four levels of physical agency.

### Level 1: Use bodies

The player learns to:

- Tether.
- Orbit.
- Sling.
- Tow.
- Push.
- Use terrain.

### Level 2: Alter bodies

The player learns to:

- Lighten or ballast targets.
- Tumble enemies.
- Attach charges.
- Deploy nets.
- Redirect cargo.
- Harvest atmosphere.

### Level 3: Create fields and routes

The player manufactures:

- Mass seeds.
- Repulsors.
- Acceleration beacons.
- Cargo catchers.
- Sensor networks.
- Permanent route anchors.

### Level 4: Rewrite regions

The player builds:

- Gravity-assisted freight lanes.
- Orbital depots.
- Defense networks.
- Station frames.
- New settlements.
- Artificial sling routes.
- Black-hole or anomaly research installations.

## 8. Restraint rules

Not every planet needs atmosphere gameplay. Not every sector needs gravity. Not every weapon should push strongly. Not every NPC needs a complex simulation.

The following limits preserve clarity:

- One signature physics idea per sector, occasionally two.
- Three or four excellent massline heads, not twelve at launch.
- One attractive field and one repulsive field before exotic lensing.
- One planetary sling course before an entire solar system.
- One mass-driver heist with complete consequences before procedural cargo theft everywhere.
- A few large terrain bodies per combat pocket, not dozens of collision hazards.
- Short, strong visual telegraphs rather than constant overlays.

The game should feel like a coherent machine with surprising combinations, not a box of physics demos held together by a settings menu.


---

<!-- SOURCE: 02_CONTROL_TARGETING_ORBIT_AND_SLINGSHOT.md -->

# Control, Targeting, Orbit Assist, and Slingshot Design

## 1. Why this is the foundational feature

The massline is not failing primarily because the rope physics lacks possibilities. It is failing because the game does not reliably answer three questions:

1. What does the player intend to tether?
2. What maneuver does the player intend after tethering?
3. How much precision should the computer supply without taking the maneuver away?

Raw control asks too much of the player's hands:

- Aim a trackpad cursor at a fast or large target.
- Press the tether key.
- Continue holding thrust.
- Hold left or right to establish the orbit.
- Boost.
- Manage reel distance.
- Aim or select a destination.
- Release at a narrow angular window.
- Immediately resume cursor combat.

That is not a reasonable baseline on a trackpad. A joystick might make it possible, but the shipping control system must work with keyboard and trackpad.

The target solution is not stronger automation in general. It is a **hierarchy of intent inference, previews, and bounded assists**.

## 2. The target-acquisition problem

A simple “closest target” rule is insufficient:

- A small enemy may be closer than the planet the player is clearly turning toward.
- A cursor may be resting over an irrelevant object while the player is using keyboard flight.
- A towable object may need precise cursor selection even when a large anchor is nearby.
- During a high-speed flyby, the most relevant enemy may only be targetable for a fraction of a second.
- A slingshot route needs to favor the next route anchor over unrelated bodies.

A simple cursor ray is also insufficient:

- Trackpad aim becomes difficult during simultaneous flight input.
- A large visual body may have only a small logical target region.
- The player may be deliberately using directional input rather than cursor input.

The selector therefore needs to combine several weak signals rather than trusting one absolute signal.

## 3. Candidate taxonomy

Each tetherable candidate should be classified before scoring.

### 3.1 Massive anchor

Examples:

- Planet.
- Moon.
- Station.
- Large wreck section.
- Massive asteroid.
- Artificial mass anchor.
- Black-hole tether node, if fiction permits.

Likely intentions:

- Orbit.
- Self-sling.
- Stabilize position.
- Atmosphere skim.
- Route traversal.

### 3.2 Combat body

Examples:

- Hostile ship.
- Hostile drone.
- Disabled enemy.
- Boss component.

Likely intentions:

- Tether-lock fire.
- Orbit attack.
- Drag.
- Tumble.
- Throw.
- Net or bridle combination.

### 3.3 Towable body

Examples:

- Cargo pod.
- Wreck fragment.
- Meteorite.
- Construction component.
- Salvage module.
- Friendly disabled ship.

Likely intentions:

- Tow.
- Deliver.
- Catch.
- Throw.
- Frame-match.

### 3.4 Route anchor

A route anchor is any massive anchor currently selected by an authored or player-defined slingshot route. Route status does not replace the underlying category; it adds strong context.

### 3.5 Field deployable

Examples:

- Mass Seed.
- Repulsor Seed.
- Temporary acceleration node.

Likely intentions:

- Create an anchor.
- Group enemies.
- Launch or escape.
- Alter a route.

## 4. Input-intent signals

The target scorer should read a short history, not merely the current frame. Recommended window: roughly 150–250 ms, tuned through playtesting.

### 4.1 Cursor precision

Measure the cursor's surface miss from the candidate:


aimMiss = distance(cursorWorld, candidateCenter) - candidateRadius

Convert this into a score. A candidate directly under the cursor receives a very large bonus. A candidate near but not under the cursor receives a smaller soft-target bonus.

The soft radius should be dynamic:

- Cursor stationary and close to a target: shrink the radius, treating the cursor as deliberate precision.
- Cursor moving quickly or no recent pointer input: enlarge the radius modestly, treating it as broad intent.
- Large bodies: use visible projected extent or authored target surfaces, not an arbitrary tiny center sphere.

This implements the useful intuition: precise pointer aim should override broader assistance, but an idle cursor should not veto clear keyboard intent.

### 4.2 Turn-direction alignment

If the player is turning right, compute how strongly each candidate lies in the right-side acquisition lobe. A candidate on the right should gain preference; one far to the left should lose preference.

Use the ship's local frame:

- Forward vector `f`.
- Right vector `r`.
- Unit direction to candidate `d`.

Right-side alignment:

rightAlignment = dot(d, r)

If right input is held, map positive values to a bonus. If left is held, invert the sign.

This should be a preference, not a hard exclusion. A precisely cursor-selected object on the opposite side should still win.

### 4.3 Forward-trajectory relevance

A candidate should gain score if the current velocity or nose direction will pass near it soon.

Useful quantities:

- Time to closest approach.
- Closest-approach distance.
- Whether the object is ahead or behind.
- Whether the player is closing or separating.

This is critical for flyby tethering. A ship that will pass within 100 world units in 0.5 seconds is more relevant than a stationary ship at the same current distance but moving away.

### 4.4 Distance

Closer bodies receive a moderate preference. Distance must never dominate a strong cursor selection or route anchor.

Use surface distance, not center distance:

surfaceDistance = max(0, centerDistance - candidateRadius)

This prevents a giant planet from appearing falsely distant because its center is far away.

### 4.5 Relative mass and intended context

Relative mass provides a strong clue:

- Candidate mass far greater than player: likely anchor.
- Similar or lower mass and hostile: likely combat tether.
- Low mass and neutral: likely towable payload.

When the player is holding a side-turn and forward thrust near a huge body, anchor intent should gain a large bonus. There is almost no plausible reason to tether a planet and deliberately thrust radially into empty space away from the intended orbit.

### 4.6 Current route

If a slingshot route is active, the next valid route anchor receives a major score bonus. It must still be within a reasonable acquisition cone or cursor neighborhood; routes should assist, not tether across the sector.

### 4.7 Combat focus

A hostile target gains preference when:

- It is the selected combat target.
- It is near the center of the camera during flyby focus.
- It recently fired at the player.
- It is the nearest hostile on the player's current passage.
- It is already highlighted by target cycling.

### 4.8 Recent candidate memory

Once a candidate is highlighted, apply hysteresis. Do not switch candidates every frame because two scores are close.

Recommended rules:

- Current candidate retains a stability bonus.
- A new candidate must beat it by a margin.
- A precise cursor hit may override immediately.
- A candidate leaving the valid cone or range is dropped.
- A short grace period survives temporary occlusion or pointer jitter.

## 5. Example scoring model

The implementation does not need to use exactly this equation, but it needs a model of this form:

```text
score(candidate) =
    Wcursor   * cursorScore
  + Wturn     * turnAlignment
  + Wapproach * approachScore
  + Wdistance * distanceScore
  + Wmass     * massContextScore
  + Wroute    * routeScore
  + Wcombat   * combatFocusScore
  + Wmemory   * candidateMemory
  + Wtype     * modeCompatibility
```

Weights change by inferred context.

### Anchor acquisition profile

High weights:

- Turn alignment.
- Surface proximity.
- Route status.
- Relative mass.
- Approach geometry.

Moderate weight:

- Cursor alignment.

### Combat acquisition profile

High weights:

- Cursor alignment.
- Flyby focus.
- Selected target.
- Time to closest approach.

Moderate weights:

- Distance.
- Turn alignment.

### Tow acquisition profile

High weights:

- Precise cursor alignment.
- Existing interaction objective.
- Distance.

Low weight:

- Turn alignment.

This prevents the same scoring rule from making all contexts feel wrong in different ways.

## 6. Player-facing acquisition feedback

Target assistance must not be invisible.

Before the massline fires, show one candidate with:

- A thin bracket or contour.
- A small tether endpoint preview.
- A semantic glyph: anchor, combat, tow, route.
- The projected line from ship to attachment point.
- Optional microcopy only during onboarding: `ANCHOR`, `TOW`, `HOSTILE`.

When several candidates are close, the strongest candidate is highlighted and the runner-up may receive a faint secondary mark. Do not draw ten brackets.

The preview should appear as soon as the score crosses a confidence threshold, not only after the player presses tether. This lets the player steer the selection before committing.

## 7. Recommended input redesign

The massline is central enough to deserve a thumb-accessible action. Space is the strongest candidate, with F preserved as an alias or legacy option.

The recommendation is a **tap/hold massline action with input history**, not a simultaneous D+F chord requirement.

### 7.1 Unattached

- Press Massline: immediately latch the currently previewed candidate if confidence is sufficient.
- Hold Massline: latch and enter temporary line-control mode.
- No valid candidate: display a brief dry-fire or acquisition sweep; do not attach to a random object behind the player.

### 7.2 Attached

- Quick tap Massline: cut.
- Hold Massline beyond a short threshold: enter line-control mode; releasing the button does not cut.
- The threshold must be forgiving and visually signaled.

### 7.3 Line-control mode

While the Massline modifier is held:

- Up / forward: reel in.
- Down / reverse: pay out line.
- Left / right: choose or reinforce orbit direction.
- Shift: boost / orbit pump.
- Cursor: select throw or release destination when relevant.

After releasing the modifier, ordinary flight controls resume while the line remains attached.

This is one recommended mapping, not an immutable law. The important contract is that line extension, retraction, and orbit direction must become accessible without adding separate obscure keys.

### 7.4 Input-history tolerance

The game should treat side input within a short window before or after latch as intended orbit direction.

Example:

- Player holds forward and right.
- Player presses tether 80 ms later.
- Target scorer prefers the right-side massive anchor.
- Orbit assist enters clockwise mode immediately.

The player should not need perfect simultaneity.

## 8. Flyby Focus 2.0

The current concept of flyby focus is correct but must be made mechanically authoritative rather than purely presentational.

### 8.1 Trigger conditions

A valid flyby candidate exists when:

- Relative speed exceeds a threshold.
- Time to closest approach is within a short window.
- Closest-approach distance is within tether opportunity range.
- Candidate is hostile or otherwise interactable.
- Candidate occupies a meaningful screen area or target score.

### 8.2 Effect

When the player begins holding Massline or enters the acquisition window:

- Time scale eases toward perhaps 0.4–0.6 for a bounded interval.
- Camera framing includes player and candidate.
- Candidate receives a large acquisition bonus.
- Tether endpoint preview becomes prominent.
- Audio and motion streaks communicate the opportunity.

Time dilation must ease in and out; it should not abruptly freeze the game.

### 8.3 Failure recovery

If the player misses:

- The focus ends cleanly.
- No target is auto-latched after it has passed outside the valid cone.
- The player remains in control.
- A cooldown prevents repeated strobing.

### 8.4 Acceptance

A normal player should be able to perform a high-speed pass and tether the intended enemy repeatedly without placing the cursor exactly on a small moving model.

## 9. Anchor-relative orbit assist

## 9.1 Problem

With raw steering, the player turns too quickly or too slowly for the current tether radius. The ship then:

- Flies inward and collides with the anchor.
- Rotates away and boosts against the line.
- Loses tangential velocity.
- Oscillates around the constraint edge.
- Feels slower and less controllable than untethered flight.

## 9.2 Player intention

When attached to a much more massive object and holding a side direction, the likely intention is almost always:

> Establish or maintain a clockwise/counterclockwise orbit while building tangential speed.

The assist should recognize that intention and solve the angular coordination.

## 9.3 Reference frame

For player position `p`, anchor position `a`, and relative vector:

```text
r = p - a
rHat = normalize(r)
tHatCW  = perpendicularCW(rHat)
tHatCCW = -tHatCW
```

Relative velocity:

```text
vRel = vPlayer - vAnchor
vRadial = dot(vRel, rHat)
vTangential = dot(vRel, tHatChosen)
```

Tether error:

```text
lengthError = currentDistance - desiredLength
```

## 9.4 Controller goals

The controller should:

1. Align the ship's useful thrust direction toward the selected tangent.
2. Dampen excessive radial velocity.
3. Correct large length error.
4. Preserve player-supplied tangential acceleration.
5. Avoid canceling physics-earned speed.
6. Keep some visible looseness and dynamics.

A bounded correction might use:

```text
radialCorrection = -Kr * lengthError - Kd * vRadial
```

and a facing target based on `tHatChosen`.

The correction must be capped. It is an assist, not an invisible rigid rail.

## 9.5 Activation

Orbit assist engages only when:

- Tether target is classified as a massive anchor.
- Side input is held or an orbit direction was recently selected.
- Tether is meaningfully taut or approaching tautness.
- Player is not explicitly braking or commanding tow behavior.

It disengages when:

- Tether is cut.
- Player commands the opposite orbit direction long enough to reverse.
- Player applies strong manual radial input.
- Target becomes dynamic/towable.
- Player disables assist in settings.

## 9.6 Strength settings

Recommended player-facing options:

- Full assist: strong angular matching and radial damping.
- Standard: recommended default.
- Light: facing help and small radial damping.
- Off: raw physics.

This preserves mastery without making baseline play hostile.

## 10. Reel and pay-out

The current one-way reel is too limiting. Line extension creates several new verbs:

- Adjust orbital radius.
- Manage atmosphere-skimming depth.
- Reduce excessive angular speed.
- Increase throw lever arm.
- Give a towable body more room.
- Escape an inward spiral without cutting.

The line should have:

- Minimum length.
- Maximum length based on spool or upgrade.
- Reel-in rate.
- Pay-out rate.
- Tension and overload.
- Optional elastic compliance by massline type.

Paying out should not instantly create free energy. It changes constraint geometry; any energy effects should emerge from the controller and motion model.

## 11. Sling-release presentation

The player needs an intuitive release language, not an orbital mechanics lecture.

### 11.1 Destination selection

The release destination may come from:

- Current navigation waypoint.
- Next authored route anchor.
- Cursor world point.
- Current combat target for payload throws.

The HUD must show which destination is active.

### 11.2 Release arc

Around the anchor, display a restrained annular ribbon:

- Red: release path misses badly or sends the player toward danger.
- Amber: viable but inefficient.
- Green: predicted path intersects destination gate.
- White-hot or cyan tick: current exact solution moment.

The ribbon may only appear while tethered and a destination exists. Avoid painting every planet with permanent arcade circles.

### 11.3 Screen-edge timing cue

The user's red-to-green screen-edge idea is valuable as a secondary cue. Use a subtle vignette:

- Neutral outside the opportunity window.
- Amber as solution approaches.
- Green at valid release.
- Brief red flash after the window passes.

The world-space release arc remains the authoritative cue; the vignette supports peripheral timing.

### 11.4 Snap and arm modes

Offer two assistance styles:

- **Arm:** hold release/throw input; system cuts on the next valid solution frame.
- **Snap:** player taps within a forgiveness window; system delays or slightly corrects to the solution.

No assist mode should fabricate a solution when the player has not built enough tangential speed or chosen a reachable destination.

## 12. Authored slingshot chains

## 12.1 Player fantasy

The player enters a planetary or anchor sequence, builds speed around one body, releases through a corridor, catches the next body, and crosses a vast region through a chain of increasingly fast momentum transfers.

The camera pulls out with speed. Trails lengthen. The player may pass an enemy installation too quickly for defenders to catch, drop a bomb, intercept cargo, or escape a pursuit.

## 12.2 Route structure

A sling route should use deliberately placed anchors. Random placement will not reliably produce good chains.

Each route node needs:

- Anchor position and effective radius.
- Tether acquisition radius.
- Recommended approach hemisphere.
- Allowed orbit directions.
- Minimum entry speed.
- Recommended line-length band.
- Destination gate toward the next node.
- Recovery gate for missed releases.
- Hazard volumes.
- Camera scale.

## 12.3 Optional versus fixed order

Two route styles are useful:

- Authored order: teaches or supports a cinematic high-speed route.
- Player-planned order: map allows selecting several anchors; solver indicates reachable connections.

Build authored order first. Player-planned routing is a later layer.

## 12.4 Momentum chain

A successful chain should preserve physics-earned speed. It may also maintain a presentation-only chain state:

- `Chain 2`, `Chain 3`, etc.
- Longer trails.
- Stronger camera pullback.
- Increased navigation reward or mission bonus.

Do not add an arbitrary speed multiplier merely because the player hit multiple anchors. The route geometry and sling assistance should create the speed; the chain state communicates mastery.

## 13. Sling-route compiler and validator

This is essential if agents are authoring routes.

A route-design tool should:

1. Load anchor positions, radii, assist limits, ship reference stats, and route order.
2. Sample entry positions, entry velocities, orbit directions, tether lengths, and release phases.
3. Simulate each connection using the same or conservative gameplay model.
4. Report reachable release windows.
5. Estimate player timing tolerance.
6. Reject routes with no robust solution.
7. Generate debug visualizations or JSON diagnostics.

Useful outputs:

```text
Node A -> Node B
reachable: true
entry speed band: 150–260
recommended clockwise: true
valid release arc: 21.4 degrees
standard-assist timing window: 310 ms
miss recovery: Node C outer gate
```

## 13.1 Route acceptance thresholds

A route should not be accepted merely because one mathematically exact solution exists.

Require:

- Multiple valid sampled approaches.
- A release window wide enough for the standard assist.
- No unavoidable collision under ordinary variation.
- A recoverable miss path.
- No dependence on a single frame-perfect boost.
- Normal camera and target acquisition support.

## 14. Moving-body hitchhiking

Fast meteors, cargo tugs, and express liners can serve as moving reference frames.

Recommended sequence:

1. Traffic route is visible and predictable.
2. Candidate gains a hitchhike targeting glyph.
3. Player latches or uses a Frame Coupler.
4. Relative velocity gradually matches.
5. Player rides through the route.
6. The moving body may itself sling around authored anchors.
7. Player cuts at a chosen destination.

This can become a memorable world event: a meteor train sweeps through a sector at intervals, whips around a moon, and exits toward another region.

## 15. Camera and speed presentation

Physics-earned speed needs strong but controlled presentation.

### Camera behavior

- Zoom out as speed exceeds ordinary combat cruise.
- Bias camera ahead of velocity, not only ship facing.
- Frame anchor and player during tether orbit.
- Ease changes; never snap zoom on every speed fluctuation.
- Cap zoom so targets remain readable.

### Speed effects

- Longer engine and field trails.
- Sparse star or dust streaks aligned with velocity.
- Tether vibration and emissive intensity tied to load.
- Subtle FOV or orthographic-scale punch on release.
- Audio low-pass and Doppler-like pitch treatment, if quality permits.

The camera should make speed feel enormous without making the player unable to see the next anchor.

## 16. Failure modes to prevent

### Wrong-target latch

Cause: one dominant nearest-target or cursor-only rule.  
Prevention: context-weighted scoring, preview, hysteresis, and precision override.

### Orbit assist becomes a canned animation

Cause: direct position writes or perfectly fixed circular path.  
Prevention: bounded force/turn corrections, player-driven boost and line length, visible wobble.

### Assist drains momentum

Cause: generic velocity damping or speed governor.  
Prevention: preserve tangential component and physics-earned provenance.

### Player flies into the anchor

Cause: facing-only assistance without radial control.  
Prevention: bounded radial damping and line-length error correction.

### Player boosts against the line

Cause: ship orientation does not match tangent.  
Prevention: tangent-facing controller and clear orbit-direction state.

### Route is only solvable in debug

Cause: anchor placement based on appearance rather than sampled trajectory solutions.  
Prevention: route compiler and robust acceptance thresholds.

### HUD becomes a permanent geometry textbook

Cause: every field and anchor always displays all information.  
Prevention: contextual reveal; show only the active candidate, route, and immediate solution.

## 17. Vertical-slice acceptance

The first complete control slice should prove all of the following on the ordinary player route:

1. Player approaches a massive anchor on the right while an enemy is closer on the left.
2. Right-turn input plus tether action selects the anchor.
3. Precise cursor aim at the enemy overrides the anchor selection.
4. Candidate preview makes the selection visible before latch.
5. Orbit assist establishes a stable clockwise pass without collision.
6. Player can reel in and pay out.
7. Boost increases tangential speed rather than pushing against the line.
8. A selected destination produces a green release window.
9. Standard assist permits a reliable release.
10. Physics-earned speed survives the release.
11. Camera pulls out smoothly.
12. Manual input and raw-assist-off modes remain available.
13. The same setup is deterministic under a fixed input trace.


---

<!-- SOURCE: 03_GRAVITY_WEAPONS_AND_MASSLINE_VARIANTS.md -->

# Gravity Weapons, Physics Combat, and Massline Variants

## 1. Combat direction

SpaceFace combat should shift from sustained hit-point attrition toward a setup/payoff sandbox built from force, mass, angular control, terrain, fields, and expendable enemies.

The target experience is not:

> Equip a higher-tier cannon so the same enemy dies after fewer identical impacts.

The target experience is:

> Use a weak but rapid concussion weapon to shove three raiders into a mass seed, tether the lightest one, whip it through the cluster, and detonate an impulse charge while the survivors tumble toward a planet.

A player should discover preferred styles through combinations rather than selecting a declared class from a menu.

Possible emergent styles:

- Orbit gunner.
- Concussion brawler.
- Gravity trapper.
- Massline throw specialist.
- Drag-net pirate.
- Bomb-propulsion interceptor.
- Environmental executioner.
- Stealth momentum runner.
- Heavy tractor and salvage controller.

## 2. Baseline physical response for all weapons

Every weapon impact should communicate momentum, but not every weapon should have strong gameplay knockback.

Recommended weapon data fields:

```text
impulsePerHit
angularImpulse
impulseFalloff
massScaling
surfaceNormalBias
fieldCoupling
statusApplication
```

### 2.1 Starter pulse weapon

- Very small impulse.
- Mostly visual recoil on target.
- Repeated hits can gradually disturb a light drone.
- Does not push ordinary ships enough to frustrate aiming.

### 2.2 Kinetic autocannon

- Moderate directional impulse.
- Stronger angular disturbance on off-center hits.
- Good for walking a target toward terrain.

### 2.3 Railgun or siege weapon

- Large impulse per shot.
- Strong armor penetration.
- Long recovery or low rate of fire.
- Excellent setup/payoff tool against large ships.

### 2.4 Beam weapons

- Low instantaneous knockback.
- Optional continuous micro-force or component-cutting effect.
- Good for holding pressure rather than launching targets.

### 2.5 Explosives

- Radial or shaped impulse.
- Strong environmental interaction.
- Limited through manufactured munitions or cooldowns.

The combat system should route impulse through the existing physics authority. Do not directly mutate velocity in weapon code.

## 3. Enemy durability and swarm structure

Physics combat benefits from more numerous, more expendable enemies.

Current long-duration one-on-one attrition makes displacement feel cosmetic. Recommended structure:

### Light enemies

- Low hull.
- High movement.
- Strong response to impulse and fields.
- Easy to tumble, net, or fling.
- Dangerous in groups.
- Designed to die or disengage quickly after a successful setup.

### Medium enemies

- Moderate resistance.
- Need one setup status or environmental combination.
- Can recover from weak pushes.
- Form the core combat targets.

### Heavy enemies

- High mass and low displacement.
- Contain external components or weak points.
- Can serve as temporary anchors.
- Require inertial manipulation, repeated impulse, component disablement, or environmental hazards.

### Bosses and capital targets

- Cannot be casually yeeted.
- Their components can be shifted, disabled, tethered, or stripped.
- Arena geometry and authored gravity tools matter.
- Victory may be disabling, rerouting, or forcing retreat rather than only hull depletion.

## 4. Mass Seed family

The Mass Seed is a portable artificial reference frame. It is the strongest candidate for a signature multi-use physics tool.

Fictional framing:

- A contained degenerate-matter kernel.
- A frame-locked gravitic mass.
- A micro-singularity cage.
- A mass-coupling node.

It should not be described as a literal ordinary dark-matter ball carried casually in the hold. The fiction should state that effective gravitational mass couples only after deployment.

## 4.1 Mass Seed: Anchor mode

### Problem

Many combat and traversal spaces lack useful tether anchors.

### Player fantasy

Create your own temporary moon.

### Behavior

- Launch toward cursor or deploy at ship position.
- Locks to the local frame after a short arming period.
- Becomes a very-high-effective-mass tether anchor.
- Does not attract surrounding bodies.
- Persists for a bounded duration.
- Only one or two may exist per player.

### Uses

- Self-slingshot in open space.
- Emergency escape.
- Orbit firing platform.
- Change the geometry of a combat arena.
- Provide a midpoint in an authored route.
- Anchor a drag net or twin bridle.

### Balance

- Manufactured deployable or capacitor-limited device.
- Long cooldown or short lifetime.
- Visible to enemies and sensors.
- Cannot be placed inside solid objects or forbidden station cores.

## 4.2 Mass Seed: Well mode

### Problem

Enemy formations and debris lack a controllable gathering mechanic.

### Player fantasy

Throw a temporary gravity well into the fight and make the battlefield reorganize around it.

### Behavior

- Applies a bounded continuous attractive force within radius.
- Strongest against light bodies, projectiles, pickups, and gravity-marked targets.
- Weak against heavy ships and stations.
- Player is affected honestly but has clear trajectory preview.
- Pull ramps in smoothly after arming.

### Uses

- Group enemies for explosives.
- Bend missiles and debris.
- Pull enemies toward atmosphere or terrain.
- Catch scattered salvage.
- Create a temporary orbiting combat cluster.
- Supply an artificial slingshot source.

### Failure mode to prevent

Do not make it a stun sphere. Enemies should continue moving and firing unless separate statuses disable them.

## 4.3 Repulsor Seed

### Problem

The player lacks a continuous area-clearing and escape tool distinct from an instantaneous bomb.

### Behavior

- Creates outward force for several seconds.
- Force is strongest near the center and fades smoothly.
- Can be fired into a crowd or dropped behind the player.
- Pushes enemies, debris, missiles, and the player.

### Uses

- Break formations.
- Escape pursuit.
- Clear asteroid/debris corridors.
- Push enemies into natural gravity.
- Counter an attractive field.
- Launch the player from a stationary point.

### Distinction from impulse charge

- Impulse charge: instantaneous radial velocity change.
- Repulsor Seed: sustained field that continues shaping trajectories.

## 4.4 Directional gravity cone

### Problem

A radial repulsor is imprecise when the player wants to open a forward corridor.

### Player fantasy

Turn the ship into a gravitic snowplow.

### Behavior

- Short-duration forward cone.
- Applies outward or forward force based on cone axis.
- Affects debris, small enemies, mines, and missiles strongly.
- Affects large ships weakly.
- Draws significant energy or heat.

### Uses

- Clear dense fields.
- Force a passage through a swarm.
- Push enemies away from a convoy.
- Redirect surface-launched cargo.
- Deflect incoming torpedoes.

### Visual requirement

The cone must be visible as a refractive, vector-flow volume—not a flat colored triangle.

## 5. Inertial manipulation

## 5.1 Inertial Shunt

### Problem

Large targets resist the most interesting physics tools, while small targets may become uncontrollably sensitive.

### Solution

A temporary status changes the target's response to impulse, tether, and artificial fields.

### Lighten mode

- Higher impulse response.
- Higher angular disturbance.
- Stronger massline throw response.
- Stronger artificial-gravity coupling.
- Lower anchoring ability.

### Ballast mode

- Lower impulse response.
- Lower angular disturbance.
- Stronger anchoring.
- Slower acceleration and turn response.
- Useful defensively on the player or a protected convoy.

### Implementation caution

Do not blindly change rigid-body mass everywhere. Separate control quantities are safer:

```text
impulseResponseMult
tetherResponseMult
fieldResponseMult
angularResponseMult
propulsionResponseMult
```

The fiction may call it mass manipulation; the implementation may remain intentionally decoupled for stability.

## 5.2 Gravity Mark

### Problem

A strong field that affects every target equally becomes overpowering.

### Solution

A low-damage marking weapon increases artificial-field coupling on one target.

### Uses

- Mark a heavy enemy, then pull it into a Mass Seed.
- Mark cargo for automated catcher systems.
- Mark one ship in a crowd for selective repulsion.
- Mark a boss component rather than the whole hull.

### Player-facing read

The target displays a visible gravitic lattice or orbiting motes. The effect must not be a tiny status icon only.

## 5.3 Momentum Sink

### Problem

The player can add momentum more easily than remove or capture it.

### Behavior

A field or beam damps velocity relative to a chosen reference frame:

- Player frame.
- Planet frame.
- Mass Seed frame.
- Convoy frame.
- Station frame.

### Uses

- Catch high-speed cargo.
- Stabilize salvage.
- Stop a thrown object before delivery.
- Prevent an enemy escaping a well.
- Match velocity for boarding or scanning.
- Protect a station from incoming debris.

### Failure mode

Do not set velocity directly to zero. Use a capped force or exponential convergence with visible field behavior.

## 6. Concussion and displacement weapons

## 6.1 Concussion Cannon

### Player fantasy

A gun chosen because it rearranges the battle, not because it has the highest DPS.

### Behavior

- Low or moderate hull damage.
- High directional impulse.
- Fast enough rate of fire for steering targets through repeated shots.
- Stronger against lightened or damaged targets.
- Off-center hits add torque.

### Uses

- Push enemies into asteroids.
- Herd a swarm toward a Mass Seed.
- Knock attackers away from a transport.
- Prevent pursuit.
- Force atmospheric reentry.
- Add speed to a tethered payload.

### Starter versus advanced version

- Starter pulse/cannon: tiny displacement, teaches physical response.
- Dedicated concussion weapon: major displacement, lower damage.
- Heavy accelerator: slower, devastating single impulse.

## 6.2 Vector Mine

### Behavior

- Player places a mine with an authored force direction.
- On trigger, mine applies a shaped impulse rather than a radial explosion.
- Direction is previewed as an arrow or field ribbon.

### Uses

- Build a launch path.
- Ambush a pursuer.
- Kick cargo toward a catcher.
- Deflect a formation.
- Combine several mines into a course.

This is a compact way to give the player temporary control over space without full construction UI.

## 6.3 Gravity Lens

Later-game tool affecting projectiles more strongly than ships.

### Uses

- Curve shots around structures.
- Create defensive missile arcs.
- Focus a spread weapon.
- Bend enemy fire into another target.
- Shoot through a planetary gravity corridor.

### Defer until

- Trajectory preview is reliable.
- Projectile force integration is stable.
- Visual distortion and curved-path rendering are good.

Otherwise it becomes invisible randomness.

## 7. Alternative massline heads

Massline heads should be outfitting choices using the same core action. They alter line law and permitted contexts, not the basic vocabulary.

## 7.1 Orbital Spool

The refined general-purpose massline.

Features:

- Intent-aware targeting.
- Orbit assist.
- Reel in and pay out.
- Release prediction.
- Good self-sling performance.
- Moderate towing.
- Tether-lock gunnery.

This should be the baseline around which other heads specialize.

## 7.2 Tractor Spool

A force-based line that attempts to maintain distance rather than enforcing a hard constraint.

Approximate law:

```text
F = -Kp * (distance - desiredDistance) - Kd * radialVelocity
```

Features:

- Stable towing.
- Minimal heading torque through center-of-mass attachment.
- Adjustable stand-off distance.
- Safer cargo and salvage movement.
- Can hold an enemy at weapon range but is poor for high-speed slings.

Uses:

- Towing missions.
- Cargo capture.
- Construction assembly.
- Disabled-ship rescue.
- Salvage delivery.

The tractor spool makes towing useful infrastructure, not the signature combat toy.

## 7.3 Elastic Whip Spool

A spring-damper line that stores energy.

Approximate law:

```text
F = -K * extension - C * extensionRate
```

Features:

- Stretch meter.
- Snap release.
- Bungee turns.
- Catapulting light payloads.
- Rapid direction changes without full orbit.
- Higher overload and break risk.

Uses:

- Flick enemies.
- Rebound around anchors.
- Escape a closing formation.
- Turn large approach speed into stored launch energy.

The key is timing and elastic energy, not simply a longer line.

## 7.4 Frame Coupler

A velocity-matching connection.

Features:

- Gradually converges the player's velocity toward target velocity.
- Does not strongly pull centers together.
- Can maintain a safe offset.
- Low combat utility against agile enemies.

Uses:

- Hitchhiking on meteors or express freighters.
- Catching moving cargo.
- Matching orbit with satellites.
- Docking with moving platforms.
- Stabilizing a damaged ship.

## 7.5 Monofilament Line

A high-tension combat line whose swept segment can damage targets.

### Activation law

Damage only occurs when:

- Tension exceeds threshold.
- Relative line sweep speed exceeds threshold.
- Target cooldown has elapsed.
- Target is not the player.

### Uses

- Orbit a heavy anchor and sweep through drones.
- Cut light external components.
- Slice tethers, cables, or braces at authored weak points.
- Turn movement path into attack geometry.

### Balance

- Weak against armored hull.
- Overheats or loses charge.
- Requires positioning.
- Strong visual line and contact sparks.
- No invisible line hits.

This adds a combat verb without another aiming system: the player attacks by placing a moving segment through space.

## 7.6 Twin Bridle

Two endpoints create a body-to-body relationship.

### Recommended interaction

- First activation attaches endpoint A.
- Candidate preview changes to endpoint B mode.
- Second activation attaches B.
- The player may remain attached to one end only during setup, or the system deploys an autonomous bridle node.

### Uses

- Tie two enemies together.
- Tie an enemy to a planet or asteroid.
- Make two ships exchange momentum and spin.
- Stabilize a large salvage component with two anchors.
- Form a temporary slingshot gate.

### Guardrails

- Maximum one active bridle initially.
- No attachment graph cycles.
- Clear color-coded endpoints.
- Automatic cleanup if either body despawns.
- Large bodies may be valid as one endpoint but not both.

This is high-value but higher-risk. Build after single-line targeting and orbit behavior are excellent.

## 7.7 Massline Drag Net

A wide deployable capture surface trailing behind a sufficiently large ship.

### Player fantasy

Sweep through a swarm, gather smaller craft, and drag the captured mass toward a planet or trap.

### Behavior

- Deploys two or more nodes that open a curved net behind the player.
- Captures only small targets under a mass cap.
- Captured targets receive damping relative to the net frame.
- Net load reduces player acceleration and increases turn inertia.
- Player may release all, release selectively later, or deliver to a field/atmosphere.

### Uses

- Swarm control.
- Piracy.
- Salvage gathering.
- Capture missions.
- Planetary disposal.

### Failure mode

Do not simulate a deformable cloth net. Use a visually convincing ribbon volume and bounded capture constraints.

## 7.8 Wrap Line / transverse snare

A projectile deploys a horizontal or curved line that wraps or catches bodies crossing it.

This can be treated as a compact variant of drag-net technology:

- Fire two endpoint darts.
- A line forms between them.
- Small ships crossing at speed become snared or tumbled.
- Large ships break it.

It adds area denial without introducing conventional mines only.

## 8. Combination grammar

The system becomes deep when tools compose. The following combinations should be deliberately supported and tested.

### Lighten → Concussion → Terrain

1. Apply Inertial Shunt.
2. Fire concussion weapon.
3. Target impacts asteroid, station shield, or atmosphere.

### Gravity Mark → Mass Seed → Torpedo

1. Mark priority target.
2. Deploy attractive seed near formation.
3. Marked target pulls strongly; nearby light ships gather.
4. Fire explosive weapon into cluster.

### Orbital Spool → Monofilament sweep

1. Latch heavy anchor or capital target.
2. Establish assisted orbit.
3. Tension line.
4. Sweep through drones or external components.

### Twin Bridle → Repulsor

1. Tie two enemies together.
2. Deploy repulsor between or beside them.
3. Bridle converts opposing force into violent rotation and collision.

### Drag Net → Planet

1. Capture light enemies.
2. Sling around planetary anchor.
3. Pay out or reel to manage net depth.
4. Release past reentry threshold.

### Mass Seed Anchor → Bomb propulsion

1. Deploy anchor seed.
2. Orbit and build speed.
3. Release with physics-earned velocity.
4. Drop and detonate impulse charge for a second-stage launch.

### Meteor Frame Coupler → Heist

1. Couple to a scheduled meteor or freighter.
2. Ride through guarded route.
3. Detach near cargo launch path.
4. Intercept or bomb target before defenders match speed.

## 9. Weapon progression and industry

Asteroid industry should produce not merely stronger cannons but new physical agencies.

### Early fabrication

- Impulse charges.
- Basic concussion ammunition or capacitors.
- Orbital Spool upgrade.
- Tether-strength components.
- Small Mass Seed Anchor.

### Midgame fabrication

- Repulsor Seed.
- Inertial Shunt emitter.
- Tractor Spool.
- Elastic Whip Spool.
- Vector mines.
- Cargo catchers.

### Late fabrication

- Well-mode Mass Seed.
- Twin Bridle controller.
- Drag-net frame.
- Projectile lens.
- Permanent acceleration anchor.
- Artificial sling-route infrastructure.
- Planetary defense emitters.

Recipes should consume meaningfully different materials and industrial capabilities:

- Dense/exotic matter for mass seeds.
- Superconductors for field emitters.
- High-tensile composites for masslines.
- Control electronics for prediction and assist systems.
- Volatiles or munitions for impulse devices.

## 10. VFX semantics required by combat

Each physical effect needs its own visual grammar.

- Impulse: sharp shockfront, debris kick, short camera response.
- Attraction: inward-flowing particles and curved distortion.
- Repulsion: outward vector streaks and expanding field surface.
- Lighten: loosened orbiting fragments, high-frequency lattice shimmer.
- Ballast: compressed low-frequency glow, subtle space distortion.
- Tumble: RCS sputter, rotating status arc, unstable engine trails.
- Monofilament: narrow luminous core, tension waveform, contact plasma.
- Drag net: broad ribbon mesh, node lights, captured-body strain lines.

Do not reuse one generic blue sphere for all field effects.

## 11. Combat acceptance metrics

A physics-combat slice is successful when:

- A light enemy can be displaced visibly by repeated kinetic hits.
- A dedicated concussion weapon can intentionally move it into terrain.
- A heavy enemy resists until lightened or component-disabled.
- Mass Seed clusters bodies without freezing them.
- Repulsor opens a pursuit corridor.
- Enemy collision or reentry produces a meaningful payoff.
- The player is encouraged to move and set up, not merely hold fire.
- At least three distinct successful combat styles are demonstrated in normal play.
- Tools remain useful outside direct combat.
- Effects are readable at ordinary camera zoom and high slingshot zoom.

## 12. Forbidden shortcuts

- Implementing “gravity” as a damage-over-time circle.
- Making Inertial Shunt a generic slow debuff with no physics composition.
- Making all weapons share identical impulse.
- Directly teleporting enemies into fields.
- Calling a net a radial stun effect.
- Making Mass Seed a one-use black-hole ultimate with no traversal utility.
- Adding ten massline heads before the input model is solved.
- Balancing every tool around boss fights and making ordinary enemies spongy.
- Claiming environmental combat is complete when terrain is absent from the ordinary encounter route.


---

<!-- SOURCE: 04_PLANETARY_ACTIVITIES_HEISTS_AND_SECTOR_IDENTITY.md -->

# Planetary Activities, Heists, Living Traffic, and Sector Identity

## 1. Purpose

Planets, stations, meteors, and orbital structures should generate movement problems and opportunities. Their value should not be limited to visual scale or another menu entrance.

The best activities reuse the same flight primitives:

- Select a body.
- Acquire a tether or field relationship.
- Match, alter, or exploit momentum.
- Cross a spatial condition.
- Deliver, steal, protect, redirect, or harvest something physical.

This gives variety without building a separate bespoke minigame for every landmark.

## 2. Stylized planetary gravity

Planets do not require a fully realistic gravity model. The game may combine:

- Mild ambient radial pull.
- Stronger massline-anchor sling behavior.
- Authored orbit-assist bands.
- Atmosphere or danger annuli.
- Scripted moving cargo and satellite paths.

The massline remains the principal high-agency mechanic. Gravity adds character, route curvature, and environmental consequences.

Recommended planet layers:

1. **Visual body:** enormous silhouette and surface motion.
2. **Collision/exclusion body:** physically aligned with the visible planet.
3. **Massline anchor zone:** valid tether surfaces or center attraction.
4. **Sling band:** recommended tether lengths and orbit radii.
5. **Atmosphere band:** optional harvesting, drag, heat, and reentry.
6. **Orbital activity band:** satellites, traffic, launch paths, stations.
7. **Navigation topology:** entry and exit gates that connect to other sites.

Not every planet needs every layer.

## 3. Planetary slingshot courses

### Problem

Open sectors are mostly empty travel, and raw massline slings are too difficult to coordinate.

### Solution

Author deliberate sequences of massive bodies or artificial anchors designed as high-speed traversal courses.

### Player experience

- Route appears on map as a chain of reachable anchors.
- Approaching the first anchor reveals candidate and entry guidance.
- The player latches with directional targeting assistance.
- Orbit assist maintains the intended spin.
- Release ribbon turns green as path intersects the next anchor gate.
- Player releases, camera pulls back, speed trails lengthen.
- Next anchor receives route priority.
- A miss remains recoverable through an outer path.

### Uses beyond racing

- Escape a pursuit.
- Infiltrate a guarded region at extreme speed.
- Reach a hidden installation.
- Carry fragile cargo without using boost.
- Deliver a timed payload.
- Intercept a convoy at a specific phase.
- Drop ordnance during a flyby.

### Authored restraint

One excellent course can define a sector. Do not place sling hoops in every region.

## 4. Meteor Express

### Concept

A small number of enormous fast meteorites or engineered mass carriers travel on predictable routes. They may sling around planets and continue toward neighboring sectors or remote pockets.

### Player uses

- Hitchhike using Frame Coupler or massline.
- Arrive faster than normal drive travel.
- Cross hostile territory while difficult to intercept.
- Detach near hidden cargo or a station.
- Use meteor momentum to throw a payload.
- Plant charges or sensors on the meteor.

### World value

The meteor route gives the sector a schedule and a recognizable event. NPCs may:

- Attempt to mine it during slow phases.
- Patrol its approach.
- Pirate riders or cargo attached to it.
- Operate catchers and tugs.

### Failure mode

Do not make it a decorative object moving in a circle. It must have a route, timetable, uses, and consequences.

## 5. Atmospheric skimming and harvesting

Atmosphere becomes worthwhile when it combines tether distance, orbital path, resource collection, and risk.

### Activity structure

1. Player installs or deploys a collector.
2. Player tethers to the planet or uses orbit assist.
3. Reel and pay-out adjust altitude.
4. Resource rate increases with atmospheric density and path length.
5. Heat, drag, or structural load increases deeper in the band.
6. Player balances collection rate against escape margin.
7. Collected gas feeds industry, fuel, field devices, or trade.

### Simplified model

Use an authored density curve by radial band rather than full fluid dynamics.

Example:

```text
outer skim: low yield, very safe
working band: good yield, moderate heat
storm band: high yield, strong drag / hazard
reentry band: enemy destruction risk, player emergency recovery
```

### Interaction richness

- Long tether provides broad, safe orbit.
- Short tether reaches dense atmosphere but increases angular speed and risk.
- Paying out can save an inward spiral.
- Boost adds tangential velocity and collection distance.
- Storm cells can temporarily alter best altitude.
- Pirates may attack harvesters at predictable locations.

### Player asymmetry

The player should receive warnings and emergency recovery before fatal loss. Enemies deliberately forced deep should suffer full reentry consequences.

## 6. Enemy atmospheric reentry

### Problem

Flinging an enemy away is often temporary and lacks payoff.

### Solution

Planets provide a visible point-of-no-return sequence for disabled, tumbled, or heavily redirected enemies.

### Entry conditions

An enemy enters reentry state if:

- Inside deep atmosphere.
- Radial velocity is inward beyond threshold.
- Ship is tumbling, disabled, lightened, or lacks enough thrust authority.
- Escape estimate falls below authored margin.

### State sequence

1. **Skim:** light plasma glow and control struggle.
2. **Commit:** stronger trail, hull heat, failed RCS bursts.
3. **Breakup:** parts shed, weapons stop, distress fragment.
4. **Descent:** glowing fragments continue toward surface.
5. **Aftermath:** optional orbital debris, surface impact marker, news or ledger receipt.

### Balance

A healthy medium or heavy enemy should usually escape a marginal pass. The player earns the kill through setup:

- Inertial Shunt.
- Tumble.
- Concussion.
- Repulsor placement.
- Drag net.
- Twin bridle.
- Disabled propulsion.

## 7. Surface-launch mass drivers

### Concept

A planet or moon launches physical cargo capsules along an authored trajectory toward an orbital catcher, station, or convoy.

### Visible cycle

- Ground or surface installation charges.
- Launch beam or electromagnetic rails illuminate.
- Capsule erupts from the surface with a bright trail.
- Capsule coasts through orbit.
- Catcher or tug intercepts it.
- Cargo enters local traffic or market.

### Legal interactions

- Escort the capsule.
- Match velocity and inspect it.
- Repair a failed guidance package.
- Tow it into the catcher.
- Defend against pirates.

### Criminal interactions

- Intercept and steal capsule.
- Alter beacon or transponder.
- Push it off the lawful catcher path.
- Replace cargo with contraband.
- Plant a tracker.
- Destroy or sabotage launch timing.

### Consequence structure

- Heat and faction response.
- Patrol pursuit.
- Market shortage or price impulse.
- Mission generation.
- Physical wreckage if capsule is lost.
- Persistent schedule disruption until repaired.

This is an ideal GTA-in-space activity because it produces a physical object, a predictable opportunity, witnesses, pursuit, and economic consequence.

## 8. Cargo catchers and orbital theft

A catcher is a large structure or field that captures high-speed capsules.

### Player actions

- Install a temporary catcher.
- Hack catcher ownership.
- Disable lawful catcher.
- Redirect capsule to a hidden catcher.
- Use Momentum Sink to catch manually.
- Defend an automated catch operation.

### Industrial progression

- Early: manual interception.
- Midgame: deployable catcher.
- Late: permanent orbital catcher and automated laundering route.

## 9. Satellite constellations

### World role

Satellites provide communications, scanning, navigation, weather, law enforcement, and story evidence.

### Activities

- Visit satellites efficiently through orbital routes.
- Scan and recalibrate.
- Tow dead satellite to proper orbit.
- Replace a module.
- Reorient arrays through tether or tractor.
- Defend a repair drone.
- Hack a data relay.
- Steal survey data.
- Disable a customs constellation.
- Rebuild a broken chain.

### Design rule

The challenge should be the route, velocity matching, and physical manipulation. Avoid six satellites that each ask the player to press E.

### Persistent consequences

- Improved map visibility.
- Reduced route risk.
- Increased customs detection.
- New rumors or wreck bearings.
- Better market intelligence.
- Faction retaliation after sabotage.

## 10. Orbital salvage

Wrecks or cargo occupy moving trajectories rather than remaining static resource balls.

### Activity

- Detect decay or collision risk.
- Intercept at the correct phase.
- Match frame using massline or Frame Coupler.
- Stabilize or alter orbit.
- Pull a valuable component clear.
- Deliver to a receiver.

### Time pressure

- Atmosphere will consume it.
- Another scavenger is approaching.
- Orbit intersects debris.
- Reactor or field instability has a timer.

### Variety

- Small cargo pod recovery.
- Large tumbling panel.
- Military component with legal risk.
- Ancient object whose orbit reveals a hidden anchor.

## 11. Planetary defense

The player protects a colony, station, or orbital network from incoming objects.

Targets may include:

- Asteroids.
- Wreck fragments.
- Missiles.
- Sabotaged cargo.
- Disabled ships.
- Gravity-shifted debris.

Useful tools:

- Concussion cannon.
- Tractor Spool.
- Vector mines.
- Repulsor Seed.
- Mass Seed.
- Twin Bridle.
- Momentum Sink.
- Impulse charges.

The objective is trajectory alteration, not necessarily destruction.

Possible scoring or rewards:

- Bodies diverted.
- Infrastructure preserved.
- Minimal debris created.
- Cargo recovered.
- Fuel or munitions spent.

## 12. Convoys and visible industry

NPC world activity should become legible through simple job state machines.

### Miner

1. Depart station or site.
2. Travel to field.
3. Select asteroid or working zone.
4. Produce mining effect and collect cargo statistically or physically.
5. Fill hold.
6. Travel to refinery or hauler.
7. Transfer cargo.
8. Repeat or respond to threat.

### Hauler

1. Load at producer.
2. Follow authored lane.
3. Pass checkpoint or dangerous region.
4. Unload at station or construction site.
5. Return or pick up another load.

### Patrol

1. Follow lane or checkpoint loop.
2. Scan relevant traffic.
3. Investigate anomalies, combat, or theft.
4. Pursue or call reinforcement.
5. Return to route.

### Scavenger

1. Hear or detect aftermath.
2. Travel to wreck.
3. Claim, strip, or fight over it.
4. Carry salvage to market.

### Survey vessel

1. Travel among orbital or anomaly points.
2. Stop or orbit.
3. Emit visible scans.
4. Publish data or create a recoverable record.

These behaviors can use waypoints and short state machines. They do not require brilliant tactical AI until attacked.

## 13. Crime systems

### 13.1 Opportunistic theft

The player sees a valuable physical flow and chooses to interfere.

Examples:

- Cargo capsule.
- Courier pod.
- Mining haul.
- Construction component.
- Satellite data core.
- Salvage claim.
- Fuel shipment.

### 13.2 Detection

Crime should be witnessed through:

- Patrol sensors.
- Satellite coverage.
- Convoy transponders.
- Station jurisdiction.
- Physical evidence and black boxes.

### 13.3 Escape

The player uses physics systems to escape:

- Planet sling.
- Meteor hitchhike.
- Mass Seed anchor.
- Repulsor corridor.
- Cloaked ballistic drift.
- Bomb propulsion.
- Dragging stolen cargo through a route.

### 13.4 Laundering and conversion

Stolen physical cargo can be:

- Sold at black market.
- Processed into anonymous materials.
- Re-registered through a faction contact.
- Used directly in construction.
- Hidden in an asteroid site.

The crime loop connects world activity, physics flight, economy, and industry.

## 14. Black-hole or compact-object sector

This should be a late, handcrafted region—not a generic hazard template.

### Visual and spatial identity

- Colossal central dark object.
- Lensed starfield or controlled distortion.
- Accretion structures or debris streams.
- Sparse but extreme orbital paths.
- Abandoned research or religious installations.
- One hidden planet, station, or object in a stable authored orbit.

### Gameplay

- Strong field or massline routes.
- High minimum momentum required to enter and escape certain bands.
- Extreme slingshot opportunities.
- Orbital salvage moving rapidly.
- Unique materials or blueprints.
- Sensors distorted by field.
- Enemies unable to casually follow optimized routes.

### Artistic liberty

Do not attempt general relativity. Use authored zones, bounded forces, trajectory previews, and stable path solutions.

### Failure recovery

The player must not lose a long save because a first visit crossed an invisible point of no return. Provide:

- Warning bands.
- Emergency seed or ejection.
- Outer recovery orbit.
- Mission-provided safe route.

## 15. Lagrange-style construction nodes

The project may author stable equilibrium volumes between two large bodies without simulating a true three-body problem.

### Uses

- Sensor relay.
- Cargo depot.
- Research station.
- Trade beacon.
- Defense platform.
- Transfer station.
- Player-built sling anchor.

### Gameplay purpose

Placement gains meaning from gravitational geography. A node may:

- Connect routes.
- Minimize station-keeping cost.
- Improve traffic.
- Expose or hide a structure.
- Create a strategic defense location.

## 16. Gravity-course contracts

Mission constraints can transform traversal into a structured challenge.

Examples:

- Cross three anchors in order.
- Reach each release gate.
- Preserve minimum final velocity.
- Use no boost.
- Carry fragile cargo.
- Maintain a stolen capsule.
- Complete before a convoy window closes.
- Avoid customs influence zones.
- Collect atmosphere during one orbit.
- Intercept a moving object after the final sling.

Do not turn these into floating-hoop races. Gates should correspond to real trajectory requirements and destinations.

## 17. Sector archetypes

Each sector should have one defining movement or activity sentence.

### 17.1 Gas-giant harvesting region

Defining sentence:

> This is the region where ships surf the atmosphere to gather volatile gas while pirates camp the exit arcs.

Contains:

- Large gas giant.
- Skim bands.
- Harvesters.
- Fuel traffic.
- One sling shortcut.
- Weather or radiation pockets.

### 17.2 Ring salvage region

Defining sentence:

> This is the debris sea where every route is also a salvage opportunity and a collision threat.

Contains:

- Ring particles as visual background with a few large physical bodies.
- Shepherd satellites.
- Moving wrecks.
- Salvage traffic.
- Hidden caches.

### 17.3 Binary-moon sling region

Defining sentence:

> This is the figure-eight route that skilled pilots use to cross the frontier without burning fuel.

Contains:

- Two authored anchors.
- Sling course.
- Equilibrium construction node.
- Convoys using the route.
- Ambushers at predictable exits.

### 17.4 Industrial launch region

Defining sentence:

> This is the planet that fires its economy into orbit.

Contains:

- Mass drivers.
- Cargo catchers.
- Dense freight.
- Customs and patrols.
- Theft opportunities.
- Construction rings.

### 17.5 Black-hole research region

Defining sentence:

> This is the place where every useful path bends around something that wants to keep you.

Contains:

- Strong field.
- Extreme route.
- Research installation.
- Rare salvage.
- Hidden object or easter egg.

### 17.6 Player expansion region

Defining sentence:

> This is the empty region whose routes, traffic, stations, and defenses exist because the player built them.

Contains:

- Claimable asteroids.
- Artificial anchors.
- Cargo routes.
- Construction traffic.
- Station frame.
- Visible evolution over time.

## 18. Sector composition principles

### Separate pockets

Do not place station, asteroids, enemies, and POIs in one central pile. Use spatially distinct regions connected by visible movement.

### Movement topology

Each sector should contain routes that explain why ships travel through particular space:

- Station to mine.
- Surface launcher to catcher.
- Refinery to trade lane.
- Sling anchor to exit gate.
- Patrol checkpoint to border.
- Scavenger route to graveyard.

### Major silhouette

At least some sectors need a landmark visible from far away:

- Planet.
- Giant wreck.
- Ring.
- Mass driver.
- Shipyard frame.
- Black-hole structure.

### Not every category everywhere

A sector may omit ordinary stations, mining, or combat if another identity carries it. Variation requires absence as well as addition.

## 19. Mission templates built from shared primitives

### Sling courier

Carry a sensitive package through an authored route faster than pursuit can follow.

### Mass-driver hijack

Intercept a launch capsule, alter its trajectory, and escape through a planet sling.

### Atmosphere harvest

Collect a resource quota while maintaining safe tether radius and heat.

### Constellation blackout

Disable or hack satellites in a route-efficient sequence before patrol response.

### Orbital salvage race

Reach and stabilize a decaying object before a rival scavenger.

### Planetary defense

Redirect incoming bodies away from colony assets.

### Meteor rider infiltration

Hitchhike on a scheduled meteor, detach near a guarded installation, and plant or steal an object.

### Drag-net capture

Collect several small drones or raiders and deliver them alive.

### Black-hole retrieval

Enter an extreme field, recover one object, and use an authored exit path.

## 20. Implementation restraint

Several ideas are attractive but expensive. Use this decision test:

A feature should be prioritized when it:

- Reuses targeting, trajectory, field, tether, or NPC-route primitives.
- Produces visible world activity.
- Creates more than one player use.
- Connects to industry or crime.
- Defines a sector or mission.

Deprioritize when it:

- Requires an entirely new UI for one interaction.
- Exists only as a lore label.
- Adds a hidden simulation without visible consequences.
- Needs bespoke animation content the agents cannot reliably produce.
- Produces only a small numerical buff.

## 21. First planetary vertical slice

Recommended composition:

- One large planet.
- One massline sling band.
- One atmosphere harvest band.
- One mass driver and catcher.
- One visible cargo schedule.
- One patrol route.
- One legal escort mission.
- One theft opportunity.
- One enemy reentry payoff.
- One route to a second anchor or station.

This single slice proves traversal, planetary activity, crime, traffic, atmosphere, and combat composition without building an entire solar system.


---

<!-- SOURCE: 05_VFX_AND_PRESENTATION_TECHNICAL_DIRECTION.md -->

# VFX and Presentation Technical Direction

## 1. Problem statement

Physics mechanics will feel cheap if the visual language remains limited to translucent primitive tubes, expanding circles, low-density particles, and generic bloom.

The current failure mode is not merely “the effect needs more particles.” It is usually structural:

- The effect has no layered temporal sequence.
- It does not show force direction.
- It does not react to velocity, tension, mass, or impact.
- It uses one material and one opacity envelope.
- It ignores world scale and camera zoom.
- It has no distortion, lighting response, surface interaction, or aftermath.
- It is not pooled or batched, so adding density risks performance collapse.

A modern effect should communicate the mechanic first and spectacle second.

## 2. Governing VFX laws

### 2.1 Semantic before decorative

Every effect must answer:

- Where is the force acting?
- In which direction?
- How strong is it?
- What body owns it?
- What state is changing?
- When is the actionable timing window?

### 2.2 Layered event structure

Most effects should have four phases:

1. **Anticipation:** charge, field formation, target lock, tension growth.
2. **Primary event:** impulse, release, detonation, field activation.
3. **Secondary response:** debris, trails, distortion, target motion, camera response.
4. **Decay / aftermath:** embers, residual field, fading wake, scorched or heated state.

A single expanding mesh is rarely sufficient.

### 2.3 World-space truth

Effects should attach to the actual world positions, surfaces, lines, velocities, and normals involved. They should not appear as arbitrary screen overlays unless used as secondary timing feedback.

### 2.4 Scale-aware detail

Effects need at least two presentation levels:

- Near / combat zoom: surface sparks, local distortion, component detail.
- Far / sling zoom: strong silhouette, broad field shape, long velocity trail.

### 2.5 Bounded post-processing

Bloom, chromatic aberration, screen shake, and distortion are accents. They should never erase target readability or make every mechanic share the same neon fog.

## 3. Recommended Three.js VFX toolbox

The following terms are useful when prompting agents.

### 3.1 Instanced particle systems

Use `THREE.InstancedMesh` or custom `InstancedBufferGeometry` for repeated particles. Store per-instance:

- Position.
- Velocity.
- Age.
- Lifetime.
- Size.
- Rotation.
- Color or palette index.
- Seed.

Update in a bounded pool rather than creating and destroying Mesh objects per particle.

Use for:

- Field motes.
- Debris.
- Sparks.
- Reentry fragments.
- Dust streaks.
- Attraction/repulsion flow markers.

### 3.2 Shader-driven ribbons and trails

Use a camera-facing strip mesh, `THREE.Line2`, or custom ribbon geometry rather than a thin GL line. Generate a polyline from recent positions or semantic endpoints and extrude width in the vertex shader or CPU geometry.

Useful features:

- Width based on tension or velocity.
- Gradient along length.
- Noise displacement.
- UV-scrolling energy texture.
- Edge softness using signed distance in fragment shader.
- Taper at endpoints.
- Breakup near overload.

Use for:

- Massline.
- Velocity trails.
- Reentry plasma.
- Gravitic flow.
- Sling trajectory preview.
- Drag-net surfaces.

### 3.3 Signed-distance-field shapes

Use analytic SDF functions in fragment shaders for clean rings, arcs, cones, brackets, and soft field boundaries. This avoids low-resolution geometry and supports smooth animation.

Use for:

- Release arcs.
- Target brackets.
- Orbit bands.
- Field discs.
- Shockwave rings.
- Atmospheric bands.

### 3.4 Screen-space distortion

Render selected effect geometry into a distortion buffer containing offset vectors and intensity. During composition, sample the scene color at offset UVs.

Use controlled procedural noise and radial/tangential distortion patterns.

Use for:

- Mass Seed.
- Black hole.
- Inertial Shunt.
- High-tension massline release.
- Concussion shockfront.

Do not distort the entire screen strongly. Restrict it to the world-space volume and cap displacement.

### 3.5 Depth-aware soft particles

When a depth texture is available, compare particle depth to scene depth and fade particles near intersections. This removes hard square clipping where particles meet ships or planets.

Use for:

- Dust.
- Smoke-like energy clouds.
- Reentry plasma.
- Atmospheric haze.
- Explosion debris.

### 3.6 Mesh shockwaves

Use a thin ring or disc mesh with:

- Expanding radius.
- Contracting width.
- Emissive edge.
- Normal/distortion contribution.
- Alpha decay.
- Optional surface intersection sparks.

A shockwave should be one layer among several, not the entire explosion.

### 3.7 Flow-field particles

For gravity, attraction, and repulsion, seed particles in the field and advect them along the same or a stylized vector field.

Attraction:

- Curved inward spirals.
- Increasing speed toward center.
- Occasional orbital arcs.

Repulsion:

- Radial outward acceleration.
- Stretching streaks.
- Hollow center pulse.

The particles communicate force direction better than a static sphere.

### 3.8 GPU-friendly noise

Use small tiling noise textures or procedural hash/noise functions for:

- Distortion breakup.
- Field flicker.
- Ribbon edge variation.
- Plasma turbulence.
- Surface heat.

Avoid loading huge animated textures when a compact shader can produce the motion.

### 3.9 Dynamic emissive lighting

Use a small pool of temporary point lights or emissive proxies tied to major events:

- Mass Seed activation.
- Repulsor detonation.
- Reentry breakup.
- Concussion impact.
- Massline snap.

Cap active lights and use priority. Do not create one dynamic light per particle.

### 3.10 Camera response

Use semantic camera cues:

- Short trauma impulse on impact.
- Directional kick aligned with force.
- Smooth zoom-out with physics-earned speed.
- Small orthographic scale punch on slingshot release.
- Brief focus framing during flyby tether opportunity.
- High-frequency micro-shake only for tension overload, not constantly.

## 4. Massline visual redesign

## 4.1 Current failure to avoid

Do not represent the line as two nested translucent cylinders that pulse by scaling. That reads as an HTML bloom mockup rather than a physical tether.

## 4.2 Recommended layered massline

### Structural core

- Narrow opaque or near-opaque luminous filament.
- Stable endpoint attachment.
- Slight catenary or vibration only if supported by the physical model.

### Energy sheath

- Wider soft ribbon.
- UV flow toward load direction.
- Color and width tied to tension.
- Noise breakup near overload.

### Load packets

- Sparse moving pulses along the line.
- Direction communicates reel, pay-out, or energy transfer.

### Endpoint interaction

- Surface-aligned attachment flare.
- Small sparks or distortion under high load.
- Anchor-specific attachment graphic.

### High-speed wake

- When line sweeps rapidly, add a faint trailing ribbon showing its recent path.
- Monofilament variant increases this into a dangerous cutting plane.

## 4.3 Color grammar

Example only; maintain palette consistency:

- Stable: cyan-white.
- Building tension: cyan to amber.
- High tension: amber to hot white.
- Overload: sharp red edge flicker and breakup.
- Tractor: broader teal flow.
- Elastic whip: magenta or violet stored-energy wave.
- Monofilament: thin white core with ultraviolet corona.
- Twin bridle: distinguish endpoints with two coordinated hues.

Do not rely on color alone. Use shape, motion, and intensity for accessibility.

## 5. Slingshot presentation

### Trajectory ribbon

- World-space ribbon, not dotted UI line.
- Taper into the future.
- Fade uncertainty with distance.
- Color by viability.
- Use the actual predictor samples.

### Release arc

- SDF annular segment around anchor.
- Green segment expands or contracts based on current speed and destination.
- Current phase indicator rotates with the player.
- Missed window leaves a short red afterimage.

### Momentum transition

On release:

- Tether core snaps to a bright point.
- A thin shock crescent travels along exit tangent.
- Camera eases outward.
- Velocity trail stretches over 150–300 ms.
- Dust and stars bias into the movement direction.
- Engine effect distinguishes coasting from thrusting.

### High-speed camera

Prompt language:

> Implement a speed-responsive orthographic camera scale with critically damped easing, velocity look-ahead, anchor framing while tethered, and hysteresis so the camera does not pump on every speed fluctuation.

## 6. Mass Seed VFX

### Anticipation

- Compact projectile or deployment node.
- Containment rings counter-rotate.
- Local dust begins curving before full activation.
- Surface or node emits a low-frequency pulse.

### Activation

- Brief inward collapse of light.
- Distortion disc forms.
- Thin lensing ring appears.
- Flow particles begin spiraling.
- Nearby trails visibly curve.

### Active field

- Do not fill the entire radius with opaque fog.
- Use sparse inward-flowing particles.
- Use a faint refractive volume boundary.
- Show target trajectories bending.
- Field strength may appear as denser curvature near center.

### Collapse

- Flow rapidly contracts.
- Small outward release wave.
- Distortion dissipates.
- Node fragments or folds shut.

### Exact agent prompt language

> Build the Mass Seed as a layered world-space gravitic effect using a small containment mesh, a bounded screen-space distortion pass, an SDF lensing ring, and pooled instanced flow particles advected inward along a curved field. Do not use a translucent sphere with bloom as the primary effect. The field must communicate force direction and remain readable over bright planets and dark space.

## 7. Repulsor VFX

### Anticipation

- Node compresses or folds inward.
- Directional particles briefly draw toward center.

### Primary event

- Bright outward shockfront.
- Radial vector streaks.
- Local scene distortion pushes outward.
- Bodies receive synchronized velocity trails.

### Active phase

- Repeating low-amplitude outward waves.
- Sparse outward-moving flow particles.
- Clear field boundary.

### Exact prompt language

> Use an expanding mesh shockwave with depth fade, a directional distortion buffer, and instanced outward vector streaks. Couple particle direction and length to the actual field force. Avoid generic explosion fireballs; this is a sustained repulsive field, not combustion.

## 8. Concussion impact VFX

Layers:

1. Contact flash aligned to surface normal.
2. Thin directional pressure ring.
3. Target hull ripple or shield distortion.
4. Debris and sparks moving in impulse direction.
5. Short directional camera kick.
6. Target trail showing sudden velocity change.

The impulse direction should be readable instantly.

## 9. Inertial Shunt VFX

### Lighten

- Fine orbiting fragments or lattice points loosen around the target.
- High-frequency shimmer.
- Target trail responds more dramatically to motion.
- A faint expanding spatial grid may show reduced inertia.

### Ballast

- Visual compression toward hull.
- Lower-frequency field pulse.
- Denser, darker distortion.
- Movement trail becomes shorter and heavier.

Do not simply tint the ship blue or red.

## 10. Atmosphere and reentry VFX

### Atmospheric band

- Large, subtle curved haze around planet.
- Layered color gradients.
- Sparse storm or density structures.
- Edge lighting aligned with star direction.

### Player skim

- Collector wake.
- Heat glints.
- Atmosphere particles streaming along relative velocity.
- UI band showing density and heat.

### Enemy reentry

1. Leading-edge emissive heating.
2. Plasma ribbon aligned opposite velocity.
3. RCS jets firing irregularly.
4. Small components shedding.
5. Hull material darkening and glowing.
6. Larger breakup fragments with separate trails.
7. Final descent or surface flash.

### Technical prompt

> Implement reentry as a state-driven layered effect: velocity-aligned plasma ribbon, leading-edge emissive mask, pooled fragment shedding, heat-distortion surface, and progressively unstable engine/RCS cues. The effect must escalate across skim, commit, and breakup states; do not spawn one explosion immediately on crossing a radius.

## 11. Black-hole visual direction

A black hole is a high-risk flagship effect. Recommended layers:

- Dark central occluder.
- Screen-space gravitational-lensing ring.
- Accretion ribbon or disc using procedural noise and emissive gradient.
- Starfield distortion near field.
- Sparse fast orbital debris.
- Trajectory ribbons visibly curving.
- Controlled chromatic separation near extreme lensing only.

Avoid:

- A black sphere with purple bloom.
- Full-screen distortion that causes nausea.
- Excessive realistic simulation.
- Low-resolution billboard accretion disc.

A dedicated render pass may be justified for this one handcrafted sector.

## 12. Drag-net and twin-bridle VFX

### Drag net

- Two or more bright node endpoints.
- Curved ribbon surface with animated grid or strands.
- Captured objects deform the visual net locally without cloth simulation.
- Load lines connect captured bodies to the net frame.
- Color and waveform indicate capacity.

Implementation shortcut with good appearance:

- Build a parametric curved strip or fan mesh.
- Represent local deformation through shader offsets and per-capture influence points.
- Use constraints for gameplay, not cloth vertices.

### Twin bridle

- Distinct endpoint colors.
- Central relationship glyph or tension intersection.
- Angular momentum pulses traveling along both lines.
- Strong visual warning before bodies collide or line overloads.

## 13. Visual concept generation

Image-generation agents are useful for concept frames, not final runtime VFX.

Prompt them for:

- Orthographic or high-angle top-down gameplay composition.
- Real-time game screenshot language.
- Physically based materials.
- Hard-surface industrial science-fiction.
- Restrained cinematic lighting.
- Modern PC/console game VFX.
- Clear silhouettes and readable force vectors.
- No illustration, comic, poster, pulp cover, painted concept-art brushwork, or retro-futurist cartooning.

Example negative prompt language:

> No 1950s pulp illustration, no comic-book ink, no cel shading, no painterly concept art, no poster composition, no exaggerated cartoon anatomy, no flat graphic shapes, no vintage print texture.

For runtime references, request:

- Separate anticipation, active, impact, and decay frames.
- Dark and bright background variants.
- Near and far zoom variants.
- Colorblind-safe alternate palette.

## 14. Performance architecture

### Pool everything transient

- Particles.
- Shockwaves.
- Temporary lights.
- Ribbon segments.
- Debris fragments.
- Distortion emitters.

### Batch by material

- Shared geometry.
- Shared shader programs.
- Texture atlases where appropriate.
- Instancing for repeated nodes and particles.

### Budget by lane

Example budgets should be measured, not guessed:

- Combat field particles.
- Ambient particles.
- Major-event particles.
- Dynamic lights.
- Distortion surfaces.
- Trail sample counts.

### Level of detail

At far zoom:

- Reduce particle count.
- Increase particle size modestly.
- Simplify distortion.
- Preserve silhouette and timing arcs.
- Collapse surface sparks into one emissive response.

### Avoid allocation churn

- Reuse typed arrays.
- Preallocate ribbon buffers.
- Use object pools.
- Avoid per-frame creation of vectors, materials, or geometry.

## 15. Accessibility

- Never communicate release validity by red/green alone.
- Add shape or pulse-frequency differences.
- Respect reduced-motion settings by lowering shake, distortion, and rapid flashes.
- Preserve readable target outlines under high bloom.
- Provide high-contrast field boundaries.
- Cap full-screen flash intensity.
- Allow trajectory and release aids to remain visible when particles are reduced.

## 16. VFX acceptance gates

An effect is not accepted because the source file contains a shader.

Require:

1. Ordinary browser-route capture.
2. Near and far camera screenshots or video.
3. Bright and dark environment tests.
4. Reduced-motion mode.
5. Colorblind/high-contrast test.
6. Stable frame time under representative combat density.
7. No per-frame object or material creation in profiler hot path.
8. Semantic synchronization with the actual force or state.
9. Distinct anticipation, event, and decay phases.
10. Side-by-side rejection of the previous primitive effect.

## 17. Anti-slop checklist for agents

Reject the implementation if any of these are true:

- The primary effect is one transparent sphere, cone, cylinder, or ring.
- Bloom is carrying all perceived quality.
- Particles move randomly rather than following the force.
- The effect does not scale with mass, speed, tension, or field strength.
- The effect is readable only in a black test scene.
- The effect creates new geometry/materials every activation.
- The effect uses a full-screen filter for a local world event.
- The agent claims “cinematic” without a captured comparison.
- The effect obscures the target or release timing.
- The visual outcome is disconnected from physics telemetry.


---

<!-- SOURCE: 06_IMPLEMENTATION_ROADMAP_TESTING_AND_AGENT_LANES.md -->

# Implementation Roadmap, Testing, and Agent Work Lanes

## 1. Development doctrine

The project should not begin by implementing a black hole, a complete planetary system, or seven massline heads. The first objective is to prove that one assisted tether maneuver is reliably controllable and satisfying on the ordinary game route.

The correct implementation order is dependency-driven:

```text
intent detection
  → candidate selection
  → line-control ergonomics
  → orbit assist
  → release prediction
  → authored sling route
  → physical weapon response
  → fields and atmosphere
  → world activities
  → industrial infrastructure
```

Each phase must produce a player-visible vertical slice. Infrastructure without playtest evidence is not completion.

## 2. Current repository seams to audit first

Before editing, the planning agent should inspect the live versions of at least:

- `src/systems/input.js`
- `src/systems/autoTargetAssist.js`
- `src/combat/autoTargetMode.js`
- `src/systems/tetherGameplay.js`
- `src/core/constraints/masslineController.js`
- `src/systems/masslineTelemetry.js`
- `src/systems/masslineThrow.js`
- `src/systems/masslineImpacts.js`
- `src/systems/flightV3.js`
- `src/core/physics.js`
- `src/core/sg02DynamicBodyOwner.js`
- `src/systems/impulseCharges.js`
- `src/systems/weapons.js`
- `src/render/vfx.js`
- `src/render/energy/energyMaterials.js`
- `src/ui/masslineHud.js`
- `src/ui/hud.js`
- `src/core/registry.js`
- `src/data/featureFlags.js`

Relevant current architectural facts to verify rather than assume:

- The repository already contains throw-solution logic and physics-authority impulse routing.
- Auto-target mode currently records trackpad gestures into a path-following system.
- Current massline targeting and throw semantics have multiple context-dependent branches.
- The physics backend uses entity-level collision representations and a separate dynamic-body authority.
- Impulse charges already provide radial momentum and massline combination hooks.
- Flight governor behavior can destroy the feel of physics-earned velocity if not coordinated.

The agent must identify current owners and existing tests before proposing parallel systems.

## 3. Phase 0: Physics control laboratory

### Goal

Create a deterministic, rapidly repeatable proving ground for massline and gravity mechanics.

### Contents

- One player ship.
- One massive anchor on each side.
- One towable object.
- One hostile flyby target.
- One destination gate.
- One terrain impact target.
- Toggleable telemetry.

### Debug overlays

- Candidate scores and score components.
- Current inferred intent.
- Radial/tangential velocity.
- Tether length and error.
- Orbit direction.
- Assist force and turn command.
- Predicted release path.
- Physics-earned velocity provenance.
- Current input history.

### Why

Without a laboratory, agents will tune through one brittle scripted route and mistake accidental success for a robust mechanic.

### Acceptance

- Replayable input traces.
- Deterministic outputs.
- Screenshot/video capture.
- No debug-state injection required for core interactions.

## 4. Phase 1: Intent-aware tether targeting

### Problem

The player cannot reliably combine trackpad aim, turn input, thrust, and tether timing.

### Deliverables

- Candidate taxonomy.
- Shared scoring kernel.
- Cursor precision override.
- Turn-direction preference.
- Approach/flyby relevance.
- Relative-mass context.
- Route priority.
- Candidate hysteresis.
- Candidate preview.
- Debug score display.

### Non-goals

- Orbit assist.
- New massline heads.
- Gravity fields.
- New world content.

### Required tests

#### Pure scoring tests

- Exact cursor candidate wins over closer off-cursor candidate.
- Right-turn intent favors right-side massive anchor.
- Route anchor beats unrelated anchor under route context.
- Towable objective beats large anchor under precise tow context.
- Candidate remains stable under small score jitter.

#### Metamorphic tests

- Mirroring positions left/right mirrors selected candidate.
- Scaling all distances proportionally preserves ordering where normalized.
- Shuffling candidate iteration order does not change result.

#### Browser route

- Approach two competing objects and visibly select each through different intent signals.

### Forbidden completion claim

“Targeting score function exists” is not sufficient. The ordinary player must reliably latch the intended body.

## 5. Phase 2: Massline input and line control

### Deliverables

- Thumb-accessible massline mapping or selectable mapping.
- Tap/hold state machine.
- Input-history tolerance.
- Reel-in and pay-out.
- Line-control overlay.
- Clear cut versus control semantics.
- Settings and rebinding support.

### Tests

- Quick tap cuts.
- Hold enters line control without cutting on release.
- Side input before or after latch selects orbit direction.
- Pay-out cannot exceed spool maximum.
- Reel cannot cross minimum.
- UI/modal states suppress flight actions.
- Blur/focus clears transient input safely.

### Failure modes

- Tap/hold ambiguity cuts unexpectedly.
- Releasing modifier leaves movement keys captured.
- Massline action conflicts with brake or fire.
- Trackpad scrolling changes camera while intended to adjust line.

## 6. Phase 3: Orbit assist

### Deliverables

- Anchor-relative telemetry kernel.
- Orbit-mode inference.
- Tangent-facing command.
- Bounded radial correction.
- Tension-preserving behavior.
- Assist strength settings.
- Immediate manual override.
- Camera framing.

### Deterministic fixtures

Test at multiple:

- Tether lengths.
- Player masses.
- Anchor masses.
- Entry speeds.
- Clockwise and counterclockwise directions.
- Boost states.

Metrics:

- Collision rate.
- Mean radial error.
- Tangential speed retention.
- Time to stable orbit.
- Control saturation.
- Energy added or removed by assist.

### Important invariant

The assist may correct error but must not create unbounded free energy. Any sanctioned launch bonus must be explicit, bounded, and separately tagged.

### Browser acceptance

A human using ordinary controls can repeatedly:

- Latch a massive anchor.
- Enter orbit in chosen direction.
- Boost without fighting the line.
- Change line length.
- Cut cleanly.

## 7. Phase 4: Release prediction and sling course

### Deliverables

- Shared predictor.
- Destination gate.
- Release arc.
- Snap and arm assistance.
- Physics-earned velocity preservation.
- Speed-responsive camera.
- One authored two- or three-anchor course.
- Route validator tool.

### Predictor tests

- Predicted and actual path stay within tolerance over a short horizon.
- Mirrored orbit produces mirrored solution.
- Destination outside reachable velocity cone shows no green window.
- Larger destination radius yields wider release tolerance.
- Higher tangential speed changes window appropriately.

### Route validator tests

- Known-good route passes.
- Deliberately impossible route fails.
- Route with one frame-perfect solution but no robust window fails acceptance.
- Miss recovery path exists.

### Player-route evidence

Capture an uninterrupted run:

- Latch first anchor.
- Establish orbit.
- Release through window.
- Acquire second anchor.
- Complete route.

No console injection or position teleportation.

## 8. Phase 5: Universal weapon impulse

### Deliverables

- Weapon impulse fields in data.
- Surface-normal or shot-direction impulse.
- Angular impulse for off-center impact where supported.
- Mass-scaled response.
- Physics-authority routing.
- Tuned starter-weapon micro-response.
- Dedicated concussion weapon.

### Tests

- Starter weapon moves light target slightly over repeated hits.
- Concussion moves light target strongly.
- Heavy target moves less.
- Lightened target moves more.
- Player recoil/impact policy remains intentional.
- Damage and impulse are independently tunable.

### Browser acceptance

The player can intentionally walk an enemy into a large asteroid using the concussion weapon.

## 9. Phase 6: Mass Seed and Repulsor Seed

Build Anchor mode before Well mode.

### Anchor mode deliverables

- Deployable seed.
- Frame-lock behavior.
- Tether candidate category.
- Lifetime and collapse.
- Placement restrictions.
- VFX.
- Sling interaction.

### Well mode deliverables

- Shared continuous-field kernel.
- Bounded attraction.
- Affected entity masks.
- Trajectory visualization.
- Gravity Mark composition.
- NPC and projectile response.

### Repulsor deliverables

- Sustained outward field.
- Escape and debris-clearing use.
- Distinct VFX and force law.

### Tests

- Field result deterministic.
- Force continuous at center/edge according to authored law.
- No NaN or singularity.
- Heavy targets resist.
- Marked/lightened targets respond more.
- Seed cannot spawn inside invalid geometry.
- Field cleanup removes all transient references.

## 10. Phase 7: Atmosphere and reentry

### Deliverables

- Authored atmosphere bands.
- Density/heat/risk readout.
- Player skim feedback.
- Enemy reentry state machine.
- Progressive VFX.
- Emergency player recovery.
- One harvesting tool or collector.

### Tests

- Outer skim safe.
- Deeper band increases collection and heat.
- Paying out line raises safe radius.
- Healthy enemy can escape marginal entry.
- Disabled or tumbled enemy cannot.
- Reentry progression survives save/load or is explicitly nonpersistent with safe recovery.

### Browser acceptance

The player uses a physics setup to drive an enemy into reentry and watches a staged breakup.

## 11. Phase 8: Living planetary operations

### Deliverables

- One mass driver.
- Scheduled capsule launches.
- One catcher.
- Miner/hauler/patrol routes.
- One legal mission.
- One theft opportunity.
- Heat/faction/economic consequence.

### Why after physics

Physical traffic is only meaningful when the player can intercept, tow, push, catch, or escape with it.

### Tests

- Schedule deterministic.
- Capsule has a physical route.
- Catcher receives legal capsule.
- Player diversion changes outcome.
- Patrol response follows witnessed crime.
- Market or mission consequence routes through existing owners.

## 12. Phase 9: Massline variants

Priority order:

1. Tractor Spool.
2. Elastic Whip.
3. Frame Coupler.
4. Monofilament.
5. Twin Bridle.
6. Drag Net.

Do not begin this phase until the baseline Orbital Spool is delightful.

Each variant requires:

- Clear role.
- Same primary input grammar.
- Unique visual language.
- At least one traversal/world use and one combat/utility use.
- A reason to choose it over baseline.
- A normal-route teaching situation.

## 13. Phase 10: Sector identity and built gravity

### Deliverables

- Recompose one sector around a planet and activity topology.
- Add separate spatial pockets.
- Add visible routes.
- Add a signature landmark.
- Exteriorize player-built physics infrastructure.
- Allow Asteroid Ops to manufacture at least one permanent anchor or catcher.

### Acceptance

A player can describe the sector without naming its color palette or faction label.

## 14. Three-agent lane division

Concurrent agents need authority boundaries, not merely different task titles.

### Agent A: Controls and physics authority

Owns bounded changes to:

- Input action semantics.
- Target-scoring kernel.
- Orbit controller.
- Predictor.
- Field force requests.
- Physics provenance.
- Pure tests.

Must coordinate before editing broad shared files such as `input.js`, `flightV3.js`, `physics.js`, or `registry.js`.

### Agent B: Gameplay systems and world state

Owns:

- Mass Seed lifecycle.
- Weapon data/effects.
- Atmosphere states.
- Reentry state.
- NPC job controllers.
- Mass-driver schedules.
- Mission/economy/faction event adapters.
- Save normalization.

Must not bypass credit, cargo, faction, or physics owners.

### Agent C: World composition and presentation

Owns:

- Planet and anchor visual assets.
- Sling-course layout.
- Candidate/release HUD.
- VFX library.
- Camera presentation.
- Sector spatial composition.
- Browser captures and visual evidence.

Must not author gameplay outcomes in render code.

### Shared-file lease rule

Before editing a shared file:

1. Announce the exact file and intended seam.
2. Check current diff.
3. Make the smallest ownership-safe edit.
4. Commit a coherent slice.
5. Release the lease.

Do not let three agents simultaneously rewrite `input.js` because all three features use a key.

## 15. Feature flags and rollout

High-risk mechanics should be independently flaggable:

```text
physicsIntentTargeting
masslineInputV2
masslineOrbitAssist
masslinePayOut
masslineSlingRoutes
weaponImpulse
massSeedAnchor
massSeedWell
repulsorSeed
atmosphereGameplay
reentryGameplay
masslineVariants
```

Flags are not a substitute for wiring. Player-facing acceptance still requires the normal game route with the intended default configuration.

## 16. Test strategy

### 16.1 Pure kernel tests

Use for:

- Candidate scoring.
- Orbit reference-frame math.
- Force falloff.
- Predictor steps.
- Route reachability.
- Status response multipliers.

### 16.2 Contract tests

Verify ownership and event routing:

- Physics systems request impulses/forces rather than writing velocity.
- Economy remains sole credit writer.
- Cargo remains sole cargo writer.
- Faction response routes through faction events.
- Presentation reads semantic state and events.

### 16.3 Metamorphic tests

Useful invariants:

- Mirror geometry → mirror outcome.
- Candidate array order does not affect selection.
- Time-step subdivision produces boundedly similar results.
- Increasing target radius cannot shrink release window unexpectedly.
- Increasing mass cannot increase impulse response unless status overrides.
- Turning assist off produces no hidden assist force.

### 16.4 Replay tests

Record input traces for:

- Anchor selection.
- Clockwise and counterclockwise orbit.
- Sling route.
- Concussion terrain kill.
- Mass Seed cluster.
- Atmospheric reentry.

### 16.5 Browser route evidence

Each feature needs:

- Ordinary start/load route.
- Player controls only.
- Video or sequence of screenshots.
- Console error gate.
- Performance trace.
- No debug injection for feature outcome.

### 16.6 Visual acceptance

Require independent review of:

- Readability.
- Timing cues.
- Scale.
- Palette distinction.
- Bright/dark scenes.
- Reduced motion.
- Far zoom.

## 17. Anti-placeholder gates

A feature fails acceptance if:

- The target selector exists but no pre-latch preview is visible.
- Orbit assist is a position animation.
- Gravity is a circular buff zone.
- Atmosphere is an invisible damage radius.
- A mass driver launch is a toast and inventory increment.
- NPC routes exist only as metadata.
- A Mass Seed is a glowing sphere with no curved trajectories.
- A weapon says “knockback” but velocity change is negligible or direct-written.
- A sling course is traversed only through teleports in capture scripts.
- VFX is one primitive plus bloom.
- The implementation is unreachable from default play.

## 18. Performance budgets

The exact numbers should be measured on target hardware, but require named budgets for:

- Fixed-step physics cost.
- Candidate queries per tick.
- Predictor samples and cadence.
- Field-affected body cap.
- Trail samples.
- Instanced particle count.
- Dynamic lights.
- Distortion emitters.
- NPC job updates.

Suggested architecture:

- Candidate scoring at input/target cadence, not every render object blindly.
- Predictor at 10–20 Hz with interpolation, unless timing window requires higher cadence.
- Field forces at fixed step with spatial query and affected-body cap.
- NPC job decisions at low cadence; movement remains normal AI/flight.
- Pooled VFX.
- LOD based on camera scale and screen area.

## 19. Stop conditions

Pause a feature track when:

- Core control is not reliable after two focused iterations.
- The agent proposes adding more UI rather than resolving intent.
- Performance requires removing the visual payoff.
- A feature cannot name two meaningful uses.
- It creates a parallel owner for physics, cargo, credits, missions, or state.
- It depends on another unproven high-risk system.

A smaller complete physical toy is more valuable than a cathedral of unverified systems.


---

<!-- SOURCE: 07_PASTEABLE_AGENT_BRIEFS.md -->

# Pasteable Agent Briefs

Each brief is intentionally self-contained. Paste one brief into a planning thread. Require the planner to inspect the current repository before naming exact files or asserting current behavior.

---

# Brief 01 — Intent-Aware Massline Target Acquisition

## Problem

The player currently has to aim at an object with a trackpad while simultaneously flying and pressing the tether input. This is unreliable during fast combat passes and awkward around large bodies. A nearest-target rule would select the wrong body in clutter. A cursor-only rule overweights wherever the pointer happened to rest. A target-cycle-only rule adds menu-like friction.

## What this causes

- The player misses flyby tether opportunities.
- A nearby enemy may steal selection from the planet the player is turning toward.
- Large planetary or station anchors feel harder to target than their visible scale suggests.
- The player cannot trust the massline enough to build advanced maneuvers around it.
- Every future massline feature inherits a broken acquisition layer.

## Why solving it is cool

The massline begins to feel like a flight computer interpreting physical intention rather than a pixel-precise grappling hook. The player can turn toward a planet, hit the massline, and expect the planet; point precisely at cargo and expect cargo; pass an enemy at speed and expect the focused enemy.

## Proposed solution

Create a pure candidate-scoring system combining:

- Cursor surface miss and pointer precision.
- Turn direction and recent side-input history.
- Time to closest approach.
- Surface distance.
- Relative mass and object category.
- Current route anchor.
- Current combat target and threat focus.
- Candidate hysteresis.

Use context-specific weight profiles for massive anchors, combat targets, and towable objects.

## General implementation direction

1. Collect tetherable candidates through the existing spatial-query path.
2. Normalize each candidate into a record containing category, surface distance, direction in ship-local coordinates, relative velocity, relative mass, cursor miss, route/combat flags, and current-highlight memory.
3. Score with a pure deterministic function.
4. Keep the winner stable until another candidate wins by a margin or receives a precise cursor override.
5. Publish the current candidate and reason category to state for HUD use.
6. Fire the tether only at the published candidate.
7. Never allow iteration order to choose ties accidentally; use stable IDs as final tie-breakers.

## Player-facing presentation

- One primary candidate bracket.
- A short preview line to the predicted attachment point.
- A small glyph for `ANCHOR`, `HOSTILE`, `TOW`, or `ROUTE`.
- Stronger highlight when the candidate is precise-cursor selected.

## Non-goals

- Do not implement orbit assist.
- Do not rewrite combat target cycling.
- Do not add a radial menu.
- Do not auto-latch without player input.

## Acceptance

- Precise cursor aim overrides a closer body.
- Holding right and approaching a massive anchor on the right favors it over a closer enemy on the left.
- A valid route anchor receives priority without tethering across unreasonable distance.
- A tow objective precisely under the cursor beats a massive anchor.
- Candidate does not flicker under small pointer or score changes.
- Mirrored geometry produces mirrored selection.
- Browser capture proves the player intentionally selects competing candidates.

## Forbidden shortcuts

- Closest object only.
- Cursor ray only.
- Invisible selection with no preview.
- Expanding the target radius until everything near the cursor is equally valid.
- Hardcoding planet priority over all other objects.

---

# Brief 02 — Massline Input and Line-Control Redesign

## Problem

Advanced massline maneuvers require simultaneous directional flight, tether activation, boost, reel control, and later release. The current F-centered interaction is not ergonomic enough for a primary mechanic, and one-way reeling prevents orbit-radius control and atmosphere-skimming design.

## What this causes

- The player cannot reliably hit turn and tether together.
- The player must release movement to reach the tether key.
- Tethered flight becomes slower and less expressive.
- No way exists to pay out line and recover from an inward spiral.
- Future massline variants would require more buttons.

## Why solving it is cool

The massline becomes a first-class control layer: easy to enter, easy to steer, and deep without cockpit-keyboard complexity.

## Proposed solution

Introduce one rebindable central Massline action, preferably thumb-accessible. Preserve F as an alias if desired.

Recommended semantics:

- Unattached press: latch current candidate.
- Attached quick tap: cut.
- Attached hold: enter temporary line-control mode; release does not cut.
- In line-control mode:
  - Up/forward reels in.
  - Down/reverse pays out.
  - Left/right reinforces orbit direction.
  - Shift boosts/pumps.

Use a 150–250 ms input-history window so side input just before or after latch counts as intent.

## General implementation direction

1. Define edge/level actions without consumer systems reading raw keys.
2. Implement an explicit tap/hold state machine with clear timers.
3. Avoid delaying the initial latch while waiting to decide tap versus hold.
4. Ensure UI and modal states zero all transient controls.
5. Preserve rebinding and gamepad/touch mapping.
6. Publish line-control mode for HUD prompts.
7. Add pay-out to massline controller using bounded target length.

## Player-facing presentation

- Brief mode label when line-control activates.
- Current length and allowed range.
- Reel direction packets moving along the line.
- Clear cut prompt when a quick tap would cut.

## Non-goals

- Do not implement a new flight model.
- Do not require holding the modifier for the entire tether lifetime.
- Do not introduce separate keys for reel-in and pay-out unless accessibility mapping needs them.

## Acceptance

- Tap and hold are distinguishable in repeated ordinary play.
- Hold never cuts on release after line-control use.
- Side input within the tolerance window sets orbit direction.
- Reel and pay-out work under high tension.
- No stuck controls after modal, docking, blur, or pointer-lock changes.
- All actions are rebindable or have accessible alternatives.

## Forbidden shortcuts

- Making line extension a UI slider.
- Using direct distance teleportation.
- Capturing movement keys after line-control exits.
- Requiring a frame-perfect D+F chord.

---

# Brief 03 — Anchor-Relative Orbit Assist

## Problem

When tethered to a massive anchor, ordinary yaw input is not matched to tether length or angular velocity. The player turns too fast and collides inward, or too slowly and boosts against the line. The massline therefore inhibits motion instead of enabling it.

## What this causes

- Planetary slingshots are impractical.
- Combat orbiting loses speed.
- The player bounces at the constraint boundary.
- Boost feels broken while tethered.
- The supposed UVP feels worse than free flight.

## Why solving it is cool

The player can turn toward a planet, latch, hold the chosen side, and enter a dynamic Spider-Man-like orbit while still choosing boost, radius, release destination, and timing.

## Proposed solution

Implement a bounded anchor-relative controller. Decompose relative motion into radial and tangential components. Use player side input to choose clockwise or counterclockwise tangent. Supply:

- Tangent-facing assistance.
- Bounded radial-velocity damping.
- Tether-length error correction.
- Tension preservation.

Do not animate the ship along a circle or overwrite position.

## General implementation direction

1. Create a pure reference-frame helper returning `rHat`, both tangents, radial velocity, tangential velocity, angular rate, and length error.
2. Engage only for targets classified as massive anchors.
3. Infer orbit direction from recent side input.
4. Feed bounded turn/thrust corrections through existing flight/physics ports.
5. Preserve player tangential input and boost.
6. Disengage on manual radial override, cut, brake, or incompatible target.
7. Expose assist strength settings.

## Presentation

- Small orbit-direction chevron.
- Tangent arrow near ship.
- Tether tension and radius.
- Optional debug vectors in laboratory only.

## Acceptance

- Stable clockwise and counterclockwise orbits at several line lengths.
- Player does not collide under ordinary entry conditions.
- Boost increases tangential speed.
- Assist does not erase physics-earned speed.
- Player may reel in and pay out while orbiting.
- Manual override is immediate.
- Assist-off mode applies no hidden force.

## Forbidden shortcuts

- Positioning the ship on a parametric circle.
- Setting angular velocity directly to a target value without force/turn authority.
- Global damping that makes all tether flight slow.
- Perfectly rigid motion with no dynamics.

---

# Brief 04 — Slingshot Predictor, Release Arc, and Route Compiler

## Problem

Even with a stable orbit, releasing toward a specific destination is a narrow timing problem. Agents may also place planets or anchors based on visual composition without verifying that a robust slingshot path exists.

## What this causes

- Slingshots miss unpredictably.
- Authored routes are only solvable through debug or luck.
- The player cannot learn timing.
- Future missions become fake checkpoint races.

## Why solving it is cool

The player reads a red/amber/green release arc, times a launch, catches the next anchor, and chains momentum through a deliberately designed planetary route.

## Proposed solution

Build one shared trajectory predictor and one offline route validator.

The predictor uses the same relevant force and release assumptions as live gameplay and produces:

- Future path samples.
- Destination intercept error.
- Current release validity.
- Time to solution.
- Closest approach.
- Expected exit speed.

The route validator samples entry states and proves robust release windows between authored anchors.

## General implementation direction

1. Keep predictor pure and deterministic.
2. Simulate a bounded horizon at fixed substeps.
3. Use target radius and destination gate to compute tolerance.
4. Publish a world-space ribbon and annular release window.
5. Support arm and snap assistance modes.
6. Tag release velocity as physics-earned.
7. Build a Node script that loads route JSON and outputs reachability diagnostics.

## Presentation

- Annular red/amber/green ribbon around current anchor.
- Current phase marker.
- Predicted trajectory ribbon.
- Subtle screen-edge timing vignette.
- Next-anchor bracket.

## Acceptance

- Predictor and actual path agree within defined tolerance.
- Impossible destinations never show green.
- Larger destination gates widen the window.
- Route validator rejects frame-perfect-only routes.
- One two- or three-anchor route is completed in uninterrupted normal play.
- Miss recovery is possible.

## Forbidden shortcuts

- Teleporting to the next anchor.
- Making all release phases valid.
- Using a predictor with different physics from gameplay.
- Placing anchors by eye and adjusting capture scripts until one run passes.

---

# Brief 05 — Universal Weapon Impulse and Concussion Cannon

## Problem

Combat is dominated by repeated damage application. Weapons rarely change relative position, so the environment and massline do not meaningfully combine with gunplay.

## What this causes

- Higher-tier weapons only shorten time-to-kill.
- Asteroids and planets are scenery rather than combat tools.
- Flinging and gravity fields lack setup support.
- Players cannot discover displacement-based styles.

## Why solving it is cool

Every hit has physical character. A dedicated concussion weapon can herd enemies, peel attackers off a convoy, knock a lightened target into an asteroid, or force a disabled enemy into atmosphere.

## Proposed solution

Add independently tunable impulse behavior to weapon data. Give ordinary weapons small but visible physical response and create one low-damage/high-impulse Concussion Cannon.

## General implementation direction

1. Extend weapon definitions with impulse and optional angular impulse.
2. Apply impulse along projectile direction or contact normal through physics authority.
3. Scale response by target mass/response status.
4. Separate damage balance from impulse balance.
5. Add off-center torque only where hit geometry supports it.
6. Add target velocity-change trails and directional impact VFX.

## Acceptance

- Starter weapon creates subtle response without ruining aim.
- Concussion weapon strongly displaces light targets.
- Heavy targets resist.
- Lightened targets respond more.
- Player can intentionally drive an enemy into terrain.
- No direct velocity writes.

## Forbidden shortcuts

- Applying a generic slow instead of impulse.
- Making impulse a visual-only shake.
- Giving all weapons the same force.
- Increasing damage and calling the result “physics combat.”

---

# Brief 06 — Mass Seed: Temporary Anchor and Gravity Well

## Problem

Open-space encounters often lack anchors or a way to gather bodies. The massline needs a portable reference frame, and gravity combat needs one multi-use flagship tool.

## What this causes

- Massline utility depends too heavily on sector clutter.
- Enemy formations remain difficult to manipulate.
- Escape and traversal setups are unavailable in empty regions.

## Why solving it is cool

The player deploys a temporary artificial moon: sling around it, pull enemies into it, bend projectiles, group a swarm, or use it as a route anchor.

## Proposed solution

Build in two stages.

### Stage A: Anchor mode

- Deployable frame-locked node.
- High effective anchor mass.
- Tetherable.
- No surrounding pull.
- Bounded lifetime and count.

### Stage B: Well mode

- Continuous attractive field.
- Strong effect on light, marked, or projectile bodies.
- Weak effect on heavy ships.
- Player affected honestly with preview.

## General implementation direction

1. Reuse existing deployable/projectile lifecycle where possible.
2. Lock anchor mode through physics authority or explicit fixed entity type.
3. Create one pure bounded field function for well mode.
4. Query affected bodies spatially with a cap.
5. Route force through physics authority.
6. Publish semantic field telemetry for VFX and HUD.
7. Add deterministic cleanup.

## Presentation

- Containment node.
- SDF lens ring.
- Local distortion buffer.
- Inward flow particles following field direction.
- Curved trajectory ribbons.

## Acceptance

- Anchor supports ordinary massline orbit and sling.
- Well gathers light bodies without freezing them.
- Heavy bodies resist.
- Marked/lightened body responds more.
- Player can use it for both traversal and combat.
- No singularity, NaN, or unbounded acceleration.
- VFX is not a translucent sphere.

## Forbidden shortcuts

- A radial stun.
- A damage-over-time black sphere.
- Teleporting bodies to center.
- Affecting enemies but not player/projectiles.
- Building Well mode before Anchor mode is proven.

---

# Brief 07 — Repulsor Seed and Forward Gravity Cone

## Problem

The player needs a physics-based escape and corridor-clearing tool distinct from an explosive damage bomb.

## What this causes

- Pursuit has few creative escape options.
- Debris and asteroid fields remain passive obstruction.
- Attractive fields lack counterplay.
- Swarms can crowd the player without a positioning response.

## Why solving it is cool

Drop a repulsor behind the ship to scatter pursuers, fire one into a crowd to dash enemies against terrain, or activate a forward gravitic cone to snowplow a route through debris.

## Proposed solution

Create one sustained radial Repulsor Seed and, later, a short-duration directional cone using the same field kernel.

## General implementation direction

- Smooth bounded outward force.
- Strong response on small bodies and missiles.
- Weak response on heavy ships.
- Clear duration and field boundary.
- Player affected honestly.
- Energy/cooldown or manufactured deployable cost.

## Acceptance

- Opens a pursuit corridor.
- Pushes an enemy into a nearby hazard under deliberate placement.
- Clears small debris without deleting it.
- Counters attractive seed interaction.
- VFX communicates outward direction.

## Forbidden shortcuts

- Instant radial teleport.
- Generic explosion reskin.
- Deleting debris rather than moving it.
- Full-strength effect on capital ships.

---

# Brief 08 — Inertial Shunt and Gravity Mark

## Problem

Heavy enemies resist physics tools, but making all fields universally strong would trivialize combat. Players need a setup tool that changes how a chosen target participates in the physics sandbox.

## What this causes

- Large ships remain HP sponges.
- Gravity wells must be either weak or overpowered.
- Weapon combinations lack preparatory states.

## Why solving it is cool

A player can lighten a large enemy, then shove or sling it; ballast a convoy to protect it; or mark one target so a gravity field selectively pulls it out of formation.

## Proposed solution

Implement explicit physical-response statuses rather than one generic speed debuff.

### Lighten

- Increased impulse response.
- Increased tether/field response.
- Increased angular disturbance.

### Ballast

- Decreased impulse response.
- Increased anchoring.
- Reduced propulsion response while active.

### Gravity Mark

- Increased artificial-field coupling only.

## General implementation direction

- Add centralized response multipliers.
- Do not scatter weapon-specific checks.
- Keep rigid-body mass stable unless thoroughly proven safe.
- Add clear visual state on target.
- Make durations and stacking policy explicit.

## Acceptance

- Same concussion hit moves lightened target farther.
- Ballasted target resists.
- Marked target is selectively pulled by Mass Seed.
- Status affects massline throws and fields consistently.
- Status does not silently alter unrelated economy or cargo values.

## Forbidden shortcuts

- Generic movement slow.
- Flat damage vulnerability.
- Directly changing every mass-dependent subsystem without audit.
- Tiny HUD icon as the only feedback.

---

# Brief 09 — Atmospheric Skimming and Enemy Reentry

## Problem

Planets currently offer little interactive play, and enemy flings often lack a durable payoff.

## What this causes

- Planets remain background balls.
- Atmosphere feels like unnecessary simulation detail.
- Environmental combat lacks a dramatic endpoint.

## Why solving it is cool

The player tethers to a gas giant, adjusts line length to skim a dense harvesting band, builds speed, and later drags or blasts a disabled enemy past the point of no return where it burns apart in reentry.

## Proposed solution

Create authored radial atmosphere bands and a staged enemy reentry state.

### Player skim

- Resource rate depends on density and distance traveled.
- Deeper band increases heat/drag/risk.
- Reel/pay-out controls depth.
- Boost controls tangential travel.

### Enemy reentry

- Trigger requires inward trajectory plus disability, tumble, lightening, or insufficient escape authority.
- Progress through skim, commit, breakup, descent.

## General implementation direction

1. Use simple radial density curves.
2. Publish atmosphere telemetry.
3. Apply player drag/heat asymmetrically and forgivingly.
4. Evaluate enemy escape capacity before committing reentry.
5. Drive VFX from state progression.
6. Route resource collection through cargo/industry owners.

## Acceptance

- Outer skim safe and low yield.
- Working band better yield.
- Deep band visibly dangerous.
- Pay-out raises altitude.
- Healthy enemy escapes marginal pass.
- Disabled/tumbled enemy enters staged breakup.
- Player has warning and emergency recovery.

## Forbidden shortcuts

- Invisible damage circle.
- Instant enemy explosion at threshold.
- Modal atmosphere minigame disconnected from flight.
- Resource increment based only on time spent inside radius.

---

# Brief 10 — Surface Mass Driver and Cargo Heist

## Problem

The world lacks visible economic events the player can opportunistically protect or rob. Station markets contain value but do not put it into motion.

## What this causes

- GTA-in-space fantasy has no physical targets.
- NPC economy feels decorative.
- Missions create waypoints rather than situations.

## Why solving it is cool

A planetary rail charges, fires a valuable capsule into orbit, lawful catchers and patrols move to receive it, and the player may escort it, intercept it, redirect it, steal it, or sabotage the schedule.

## Proposed solution

Implement one deterministic launch cycle with a physical capsule, catcher, patrol response, legal mission, and criminal branch.

## General implementation direction

1. Author launcher, path, capsule specs, catcher, and schedule.
2. Spawn capsule through world owner with stable identity.
3. Give it velocity and route, not position animation.
4. Allow massline, Frame Coupler, concussion, and Momentum Sink interactions.
5. Catcher resolves legal delivery.
6. Player diversion emits witnessed-crime events.
7. Route economic consequence through existing owners.
8. Persist schedule disruption and capsule outcome.

## Acceptance

- Launch is visible from ordinary flight.
- Capsule follows physical route.
- Catcher receives it when uninterrupted.
- Player can redirect and steal it.
- Patrol responds based on witnesses/coverage.
- Theft changes heat, faction, mission, or market state.
- No dialogue choice is required to initiate the crime.

## Forbidden shortcuts

- Toast announcing launch with no physical capsule.
- Capsule moving along a CSS or render-only spline.
- Adding stolen cargo directly on proximity.
- Hardcoded crime outcome without law-system routing.

---

# Brief 11 — Meteor Express and Frame Coupler

## Problem

Sector travel contains too much empty thrusting, and traffic is not usable as physical infrastructure.

## What this causes

- Open world feels stitched together by empty space.
- Hitchhiking fantasy is absent.
- High-speed routes have no world schedule.

## Why solving it is cool

A huge meteor or express freighter crosses the region on a known route, slings around a planet, and becomes a moving high-speed platform the player can catch, ride, rob from, or use to infiltrate hostile territory.

## Proposed solution

Create one scheduled moving body and a Frame Coupler massline head that gradually matches velocity without pulling centers together aggressively.

## General implementation direction

- Authored deterministic itinerary.
- Clear map and world telegraph.
- Coupler applies bounded relative-velocity convergence through physics authority.
- Safe offset and release.
- Route may cross a planetary sling assist.
- NPCs or cargo may use the same body.

## Acceptance

- Player catches it without debug teleportation.
- Coupler matches velocity smoothly.
- Player can ride and release near destination.
- Route repeats predictably.
- Pursuers struggle to match without route knowledge.
- Body has visible world purpose beyond being a taxi.

## Forbidden shortcuts

- Autopilot fast travel screen.
- Direct velocity copy in one frame.
- Decorative meteor with no route timing.
- Player-only object ignored by NPC/world systems.

---

# Brief 12 — Monofilament Massline

## Problem

The massline currently affects the endpoints but the swept line itself is not a major combat verb. This leaves orbiting and positioning disconnected from damage.

## What this causes

- The player still relies on LMB for payoff while performing massline maneuvers.
- Movement path does not become attack geometry.
- Swarm combat lacks a skillful area-clearing technique.

## Why solving it is cool

Orbit a heavy anchor and sweep a high-tension luminous filament through drones, external weapon mounts, or authored braces. The player's path becomes the blade.

## Proposed solution

Create a specialized massline head whose line segment deals controlled cutting effects under high tension and high sweep speed.

## General implementation direction

1. Compute swept segment volume between prior and current line positions.
2. Query eligible targets spatially.
3. Require tension and sweep-speed thresholds.
4. Apply per-target cooldown.
5. Route damage/component effects through combat owner.
6. Overheat or discharge line after sustained cutting.
7. Make player immune to self-line damage.

## Acceptance

- Ordinary low-tension towing causes no damage.
- High-speed sweep cuts light drones.
- Armored targets resist except at weak components.
- Contact point and line path are visually obvious.
- No duplicate hits from frame-rate variation.
- Reduced-motion mode preserves gameplay cue.

## Forbidden shortcuts

- Radial damage around player.
- Damage based only on tether active state.
- Invisible segment collision.
- Unlimited continuous damage with no cooldown or heat.

---

# Brief 13 — Twin Bridle: Body-to-Body Attachment

## Problem

The current massline relationship always centers the player, limiting the ability to make two world bodies interact directly.

## What this causes

- The player cannot tie enemies together.
- Large salvage orientation requires awkward personal positioning.
- Many interesting traps require the player to remain one endpoint.

## Why solving it is cool

Attach one enemy to another, or an enemy to a planet, then let their different velocities turn the pair into a violent spinning system. Use it for capture, collision, salvage, or field combinations.

## Proposed solution

Add one capped body-to-body bridle attachment with explicit first-endpoint and second-endpoint acquisition.

## General implementation direction

1. First activation stores endpoint A.
2. Candidate selector enters endpoint-B profile.
3. Second activation creates attachment through generalized attachment owner.
4. Enforce mass, range, cycle, and count limits.
5. Provide clear endpoint colors and preview line.
6. Cleanup deterministically on death/despawn/cut.
7. Let artificial fields and impulses act normally on both bodies.

## Acceptance

- Tie two light enemies together and observe momentum exchange.
- Tie enemy to massive anchor and create orbit/impact opportunity.
- Bridle cannot create attachment graph cycles.
- Save/load either restores safely or explicitly resolves attachment.
- UI always shows whether selecting A or B.

## Forbidden shortcuts

- Freezing two objects in place.
- Making the player an invisible permanent endpoint.
- Unlimited bridles.
- Hidden automatic selection of endpoint B.

---

# Brief 14 — Massline Drag Net

## Problem

A more numerous enemy-swarm direction needs a way to capture or redirect several light bodies without individually tethering each one.

## What this causes

- Massline play remains single-target.
- Swarms are handled only through damage or radial explosions.
- Piracy and capture lack a distinctive heavy-ship tool.

## Why solving it is cool

A large ship deploys a luminous net behind it, sweeps through drones or raiders, drags the struggling cluster around a planet, and releases them into reentry or a prison catcher.

## Proposed solution

Implement a visually curved capture volume supported by a few endpoint nodes and bounded per-target constraints. Do not simulate cloth.

## General implementation direction

- Deploy net nodes and parametric ribbon surface.
- Detect small eligible bodies crossing the capture surface.
- Add captured bodies to a capped list.
- Dampen them relative to net frame.
- Apply load penalty to player acceleration/turn.
- Permit release-all initially; selective release later only if needed.
- Route capture/crime consequences through existing systems.

## Acceptance

- Captures multiple small targets.
- Heavy targets break or ignore net.
- Net load visibly affects ship.
- Captured enemies remain physical and may collide.
- Player can release them near atmosphere or catcher.
- Net VFX deforms convincingly without cloth simulation.

## Forbidden shortcuts

- Radial stun or vacuum effect.
- Deleting captured enemies into inventory.
- Unlimited target count.
- Net that has no physical or handling consequence.

---

# Brief 15 — Modern Physics VFX Foundation

## Problem

Current physics effects risk reading as translucent primitive geometry with bloom. New mechanics will not feel premium if every field is a colored sphere and every tether is a pulsing tube.

## What this causes

- Mechanics lack force direction and timing clarity.
- Effects look like prototypes despite sophisticated code.
- Increasing particle count harms performance without improving composition.
- Different mechanics become visually interchangeable.

## Why solving it is cool

Massline tension flows visibly down a layered ribbon; a Mass Seed bends stars and curves field particles; concussion impacts produce directional pressure fronts; reentry escalates from heat to plasma to breakup.

## Proposed solution

Build a pooled semantic VFX library using:

- Instanced particles.
- Shader-driven ribbons.
- SDF rings/arcs/cones.
- Local distortion buffer.
- Depth-aware soft particles.
- Mesh shockwaves.
- Pooled dynamic lights.
- Speed-responsive camera and trails.

## General implementation direction

1. Define semantic VFX events and telemetry inputs.
2. Build reusable pooled emitters and ribbon geometry.
3. Separate anticipation, event, response, and decay phases.
4. Add near/far LOD.
5. Test bright/dark backgrounds and reduced motion.
6. Profile allocations and draw calls.

## Acceptance

- Massline, attraction, repulsion, concussion, and reentry have distinct visual grammar.
- Forces are readable from particle/ribbon motion.
- Effects work at combat and sling zoom.
- No primary effect relies on one translucent primitive.
- Performance remains inside measured budget.
- Browser capture includes side-by-side before/after.

## Forbidden shortcuts

- “Advanced VFX” implemented by more bloom.
- New Mesh/Material creation per activation.
- Full-screen distortion for local effects.
- Random particles unrelated to force vectors.

---

# Brief 16 — First Planetary Physics Vertical Slice

## Problem

The project has many planetary ideas but no bounded slice proving that one planet can support traversal, economy, crime, atmosphere, NPC routes, and combat payoff without becoming several disconnected systems.

## What this causes

- Teams build isolated planet features with no shared activity loop.
- Planet content risks another noninteractive fixture.
- Scope expands into an entire solar-system simulator.

## Why solving it is cool

One planet becomes a complete place: sling around it, skim atmosphere, watch cargo launch, escort or steal a capsule, see patrols respond, and burn a disabled enemy in reentry.

## Proposed solution

Build exactly one planet with:

- Massive visible body and aligned collision.
- Massline sling band.
- Atmosphere harvest band.
- Mass driver.
- Cargo catcher.
- Scheduled capsule.
- Patrol route.
- Legal escort contract.
- Physical theft path.
- Reentry payoff.
- Route to one secondary anchor or station.

## General implementation direction

Use the shared targeting, orbit, predictor, field/atmosphere, NPC-job, and event-owner primitives. Do not build a separate modal planet game.

## Acceptance

- Each activity is reachable in ordinary play.
- Planet has visible traffic independent of the player.
- Legal and criminal interactions share the same physical capsule.
- Sling and atmosphere reuse massline controls.
- Enemy reentry emerges from combat state.
- Player action causes persistent world/economy response.
- Sector can be described by the planet's activity rather than its palette.

## Forbidden shortcuts

- Separate bespoke UIs for every activity.
- A planet that remains mostly decorative while activities spawn elsewhere.
- A mission script that teleports capsules or enemies.
- Expanding to multiple planets before this one is accepted.


---

<!-- SOURCE: 08_MASTER_IMPLEMENTATION_HANDOFF_TEMPLATE.md -->

# Master Implementation Handoff Template

Use this wrapper with one selected feature brief. Replace bracketed fields. Do not ask an agent to implement the entire gravity package at once.

---

## Task

Implement **[FEATURE NAME]** in the SpaceFace repository.

## Product context

SpaceFace is becoming a top-down assisted-relational-physics sandbox. The player chooses targets, directions, risks, and timing; the computer supplies bounded precision needed to express those intentions through keyboard and trackpad controls.

The feature must strengthen at least one of these pillars:

- Physics traversal.
- Physics combat.
- Space crime/interception.
- Planetary/orbital operations.
- Industrial control of world infrastructure.

## Problem

[PASTE THE PROBLEM SECTION]

## Consequences of the problem

[PASTE THE CONSEQUENCE SECTION]

## Intended player fantasy

[PASTE WHY IT IS COOL]

## Proposed solution

[PASTE THE PROPOSED SOLUTION]

## Mandatory first step: current-repository audit

Before proposing code changes:

1. Inspect current `git status` and relevant diffs.
2. Read the current owner files and nearby `AGENTS.md` instructions.
3. Identify any existing implementation of this feature or adjacent mechanics.
4. Name the current single writers for physics, input, cargo, credits, factions, missions, and save state where relevant.
5. Identify current tests, feature flags, and browser probes.
6. State which earlier assumptions from this brief are stale or already implemented.

Do not create a parallel system when an owner or service already exists.

## Required planning output before editing

Return:

1. Current behavior and failure reproduction.
2. Ownership map.
3. Exact vertical slice.
4. Files to modify and files explicitly not to modify.
5. State and event contract.
6. Input contract.
7. Physics/math model.
8. Player-facing presentation.
9. Deterministic test plan.
10. Ordinary browser-route proof plan.
11. Performance budget.
12. Rollback/feature-flag plan.
13. Known risks and deferred work.

## Hard design laws

- Player supplies intent; computer supplies precision.
- Do not add button complexity when context can be inferred and previewed.
- Artistic physics is allowed, but the rules must remain consistent and visible.
- Physics outcomes route through the physics authority; no direct hidden velocity writes.
- Presentation consumes semantic state/events; render code does not author outcomes.
- No new credit, cargo, reputation, or mission owner.
- Preserve physics-earned velocity unless a named mechanic removes it.
- Player collision consequences may be asymmetric and forgiving.
- The feature must have at least two meaningful uses unless explicitly scoped as infrastructure.
- A feature is not complete until reachable and demonstrated in ordinary play.

## Acceptance requirements

[PASTE THE BRIEF ACCEPTANCE SECTION]

Additionally require:

- No console errors.
- Deterministic or boundedly invariant behavior under replay.
- Save/load behavior explicitly tested or explicitly declared transient and safely cleared.
- Reduced-motion/accessibility behavior.
- Measured performance evidence.
- Screenshot/video evidence from the actual game.

## Forbidden shortcuts

[PASTE THE BRIEF FORBIDDEN SHORTCUTS]

Also forbidden:

- State injection used as the only proof.
- A hidden feature flag left unreachable.
- A placeholder primitive claimed as final visual quality.
- Lowering unrelated quality or content density to pass performance.
- Editing expected golden output merely to make checks green.
- Broad rewrites outside the selected ownership seam.

## Completion report format

At completion report:

1. What changed in player-observable terms.
2. What existing systems were reused.
3. Files changed.
4. Tests run and results.
5. Browser route and evidence paths.
6. Performance measurements.
7. Remaining defects or uncertainty.
8. Feature flag/default status.
9. Commit hash if committed.
10. Why this implementation satisfies the intended fantasy rather than only the source-level contract.
