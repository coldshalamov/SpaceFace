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
