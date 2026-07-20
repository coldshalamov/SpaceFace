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
