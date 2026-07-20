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
