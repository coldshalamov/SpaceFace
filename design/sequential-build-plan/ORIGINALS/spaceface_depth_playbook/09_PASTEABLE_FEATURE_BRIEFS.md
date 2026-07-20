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
