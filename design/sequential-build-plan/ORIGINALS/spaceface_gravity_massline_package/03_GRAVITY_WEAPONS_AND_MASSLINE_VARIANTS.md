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
