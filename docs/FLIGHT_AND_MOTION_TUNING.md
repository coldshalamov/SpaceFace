# Flight and motion tuning

This is the engineering guide for the coherent-flight gameplay change. It describes the live owners,
the intended player experience, and the evidence needed to tune them together. It is not a separate
program board or a declaration that one patch completes the game's quality work.

## The experience being tuned

SpaceFace needs two compatible kinds of motion. Near a berth, cargo pod, or opponent, a small
correction should produce a small, legible change in position. Releasing that correction should
settle the unwanted motion promptly. Out in open space, sustained thrust and a successful Massline
release should carry the ship into a broad, powerful trajectory. The player's accumulated speed
must remain useful.

The resulting control law has a precision region at low speed and a gradual transition to the
existing inertial flight at higher speed. Precision assistance spends available thruster force; it
does not snap position, erase collision impulses, or rotate velocity instantaneously. The same
principle applies to NPCs: their guidance should ask for a feasible trajectory and their actuators
should execute it through the existing physics owner.

A calm world still permits violent events. Resting overlap, decorative traffic, and stationkeeping
should not manufacture launch impulses or destruction. Deliberate ramming, weapon impacts,
gravity, towing, and high-energy collisions should remain consequential. Motion should explain its
cause before its spectacle fills the screen.

## Live owners and configuration

The defaults in [gameState.js](../src/core/gameState.js) select `flightBackend: 'v3'`,
`aiBackend: 'sg06-tactical'`, and `physicsBackend: 'rapier-dynamic'`.
[registry.js](../src/core/registry.js) resolves those system slots. The compatibility files
`systems/flight.js`, `core/flightDynamics.js`, and `systems/ai.js` still have callers and tests;
changing them alone does not tune the default game.

| Concern | Authoritative implementation/data | What the parameters mean |
|---|---|---|
| Player and NPC propulsion | [flightV3.js](../src/systems/flightV3.js), [propulsionKernel.js](../src/core/flight/propulsionKernel.js) | The adapter builds an input packet; the pure kernel turns it into finite forces and torque. The physics membrane applies the command. |
| Drive families and base limits | [propulsionCatalog.js](../src/core/flight/propulsionCatalog.js) | Forward/reverse/lateral acceleration, yaw acceleration/braking/rate, combat and travel speeds, boost, energy/heat, and assist horizons. Acceleration is in world units per second squared; a horizon is the response or settling time in seconds. |
| Low-speed precision assistance | [flightTuning.js](../src/data/flightTuning.js), [precisionAssist.js](../src/core/flight/precisionAssist.js) | `PRECISION_ASSIST_TUNING` defines the continuous speed band and response time; the V3 adapter decides whether the player is eligible. |
| Hull handling identity | [flightFeelEnvelopes.js](../src/data/flightFeelEnvelopes.js) | Player multipliers differentiate thrust, strafe, yaw, lateral correction, and braking between hulls. Enemy maneuver scales are derived from the same rows rather than independently invented. |
| Input and player options | [input.js](../src/systems/input.js), [gameState.js](../src/core/gameState.js), [settings.js](../src/ui/screens/settings.js) | Physical controls become raw axes and semantic actions. Control scheme, flight model, gamepad curve, targeting, and velocity-vectoring options are distinct settings. |
| Tactical decisions and movement requests | [tacticalAI.js](../src/systems/tacticalAI.js), [ai/](../src/ai/), [aiPorts.js](../src/systems/aiPorts.js) | Target selection, maneuver/formation intent, steering, and command ownership. A previous command must not become a new independent upstream order. |
| Native bodies and contacts | [physicsAuthority.js](../src/core/physicsAuthority.js), [sg02DynamicBodyOwner.js](../src/core/sg02DynamicBodyOwner.js), [physics.js](../src/core/physics.js) | Mass/inertia, collision shapes, solver commands, contact events, and pose authority. Separate real approach velocity from numerical overlap correction. |
| Exterior docking | [collisionProxyManifests.js](../src/data/collisionProxyManifests.js), [dockingCorridor.js](../src/systems/dockingCorridor.js), [dockRange.js](../src/core/dockRange.js) | Real approach/capture/berth geometry, hull fit, entry speed, and bounded capture assistance. |
| Camera and speed readability | [tabletopPolicy.js](../src/render/tabletopPolicy.js), [camera.js](../src/render/camera.js), [velocityLanguage.js](../src/render/velocityLanguage.js) | Speed-dependent framing, velocity lead, threat composition, and exceptional-speed cues. These present motion; they do not change it. |
| Asset geometry and interaction | [modelTruth.js](../src/data/modelTruth.js), [collisionProxyManifests.js](../src/data/collisionProxyManifests.js), [entityInteractionProfiles.js](../src/data/entityInteractionProfiles.js), [partsLibrary.js](../src/render/partsLibrary.js) | Measured visible geometry, physical proxies, docking anchors, interaction roles, and release asset selection must agree. |

`FLIGHT_TUNING` in `src/data/flightTuning.js` is not a universal master control for the current game.
Its new `PRECISION_ASSIST_TUNING` export is explicitly consumed by V3's precision helper. Follow
the individual export's importers before adjusting its values. Likewise, `precisionSpeed` by itself is not proof that a
speed-dependent precision controller is active: verify the live consumer and its input gating.

### Precision-to-inertia transition

`fullSpeedFraction: 0.18` applies full precision assistance up to 18% of the drive's combat speed.
`fadeSpeedFraction: 0.42` removes it entirely at 42%. Between them a cubic smoothstep blends the
force continuously, with zero blend slope at either endpoint. These fractions are neither new
speed limits nor a speed boost.

For the default Kestrel's 195-WU/s combat speed, this means full precision assistance through
35.1 WU/s and a smooth fade to zero at 81.9 WU/s. `responseS: 0.55` is the default response time
constant: an unconstrained released axis would retain about 37% of its previous velocity after
0.55 seconds. The controller expresses that response as counter-thrust and respects the fitted,
possibly damaged thruster's available acceleration. A drive may override the horizon through
`assist.precisionResponseS`.

On that starter hull, the 26-WU/s capture and 12-WU/s berth conditions sit inside the full precision
region, while the 55-WU/s corridor entry lies in the transition. This aligns the handling change
with the existing interaction geometry instead of asking the pilot to fight a cruise controller
through the final approach.

Only released translation axes receive the extra correction. Holding a lateral input can still
move the hull sideways while the unused forward axis settles. Yaw input does not disable the
precision region. No additional persistent flight mode is saved.

The V3 adapter excludes autopilot, path/draw-flight, active pursuit slots, active tethers, and the saucer's distinct
drive. The kernel excludes explicit braking, boost, tagged earned momentum, travel-drive
spooling/engagement, and Drift/Newtonian. Above the speed band, the prior controller remains the
owner. These boundaries preserve high-speed travel and the momentum earned from physical play.

### Pilot control coherence

NPC motor control now reads the current body's position, velocity, heading, and angular velocity
through [aiPorts.js](../src/systems/aiPorts.js), independently of the slower contact/perception
batch. A cached contact scan should not make a pilot believe its own ship is stationary until the
next scan arrives. The body sample is checked against the entity's current life; contacts and
tactical memory retain their existing cadence.

[maneuver.js](../src/ai/maneuver.js) closes the yaw controller on measured angular velocity and
bounds the combined tracking/correction rate to the hull's allowed rate. Formation arrival uses
the moving slot's full velocity plus a shrinking catch-up term, which reaches zero at a stationary
slot. Authored fly-through maneuvers retain their committed pass. Avoidance adjusts the tracked
position and velocity setpoints as well as the heading, so the actual thrust follows the clear path.

[tacticalAI.js](../src/systems/tacticalAI.js) preserves surviving automatic flight membership and
formation sockets before admitting replacements. Losing a wingman should not reshuffle every
survivor across the others' paths. The visible goal is smooth, deliberate flight and credible
stationkeeping through existing finite thrusters. The focused feedback regression is
[ai-motor-feedback.test.mjs](../test/ai-motor-feedback.test.mjs); `npm run check:sg06:formation`
exercises the live AI ports, V3 flight, and native bodies for formation convergence and hostile
flyby clearance.

### Contact causality

An overlap correction used to receive a fresh contact-motion allowance on successive ticks even
when the bodies had no incoming relative motion. In the stationary overlapping-Kestrel diagnostic,
that generated roughly 125 WU/s of launch speed and about 81 first-contact damage in the pure
consequence calculation. Those pre-change observations are not a retained immutable baseline
replay. The corrected fixture peaks around 0.019 WU/s with zero damage or helm loss.

The native body owner groups connected dynamic contacts and bounds their response by the kinetic
energy entering the solve, including rotation. It measures that energy in the group's center-of-mass
frame, preserving shared cruising velocity. A fixed surface anchors the local energy frame without
joining unrelated ships through an entire station. Checking the group's total response prevents
several overlapping bodies from each spending the same available energy. Only unsupported contact
changes are reduced toward the expected motion, which already includes commanded, weapon, and
spring impulses. Existing player contact/helm policy remains the owner for the player. Native joint
work and active kinematic anchor recoil retain their established policy because their external
work is not measured by the incoming dynamic-body energy budget; settled anchors remain bounded.

Contact receipts also carry measured surface approach speed and each endpoint's available motion
change through the physics adapter, deferred snapshots, and damage kernel. A spinning arm can
therefore strike with stationary centers, and a real A→B→C impact can transfer energy through the
same solve. Numerical separation alone cannot manufacture that damage allowance.
[contact-motion-coherence.test.mjs](../test/contact-motion-coherence.test.mjs) covers resting and
co-moving overlap, slow multi-body settling, genuine chain impacts, and signed rotating strikes
through native bodies. These are causal physics fixtures; the rendered route still has to establish
how busy world traffic and debris read to the player. The compact
[contact validation record](validation/coherent-flight/contact-validation.json) binds the measured
fixtures and regression commands to the collision patch.

### Tune related quantities together

For a given acceleration limit, doubling speed approximately quadruples the distance needed to
stop under constant braking: `distance = speed² / (2 × braking acceleration)`. The actual game has
bounded, speed-dependent assist and hull envelopes, so this equation is a design estimate, not a
replacement for a measured stopping trajectory.

A station's capture radius, entry speed, braking authority, and camera lead therefore belong in
one test. A weapon's range, enemy closing speed, turn radius, and firing alignment belong in
another. A formation's spacing must clear the members' collision envelopes during turns, not only
when every ship sits at its ideal slot.

Increasing damping globally can reduce overshoot while also destroying the speed fantasy. Faster
yaw can make a hull point correctly while its actual path still misses the slot. Increasing a
contact threshold can hide destruction while leaving the numerical launch that caused it. Tune
the causal owner first and confirm the visible consequence afterward.

## Controls and player intent

The default **Pilot** scheme is keyboard flight with independent mouse aim:

| Input | Live meaning |
|---|---|
| W / Up | Forward thrust |
| S / Down | Brake to rest; this also supplies a negative throttle axis, but the brake wins |
| A / D or Left / Right | Yaw the nose, including while thrusting |
| Q / E | Lateral strafe; the contextual dock action consumes a fresh E press when available |
| 0 | Dedicated brake without a thrust command |
| Shift | Boost |
| Mouse + left button | Aim and fire weapons |
| Right button | Select; hold to use the eligible target's tool, including mining |
| Space / F | Massline tap/hold grammar |
| E / Enter at a dock prompt | Dock |

**Helm Assist** changes nose steering to mouse aim and uses A/D for strafe. **Classic** retains its
older key projection. Neither control scheme is the same thing as the **Assisted / Drift /
Newtonian** flight-model setting. Keep those concepts separate in prompts and tests.

S is intentionally a stop command in the existing input contract. Holding it from rest does not
back the ship out of a berth. A future precision-reverse control would need its own deliberate,
discoverable gesture and save/rebind/gamepad coverage. Do not introduce it by letting braking
accidentally overshoot zero.

Other intent owners also matter. Autopilot, pursuit assist, a live tether, scripted occupation, and
draw-flight control can legitimately own movement. Manual precision assistance must respect those
ownership boundaries. Pausing, docking, death, and focus loss must release held control state so a
resume cannot produce a surprise burn.

## Docking and close interaction

The ring-hub manifest defines three distinct approach conditions: the corridor allows up to
55 WU/s, capture allows up to 26 WU/s, and the berth requires at most 12 WU/s within a 20-WU
docking radius. Resolved model geometry can change the placement and size of the usable approach,
so always use the manifest-derived anchor instead of a station-center shortcut.

The existing capture controller is a bounded proportional/derivative assist: position error
provides the pull and velocity provides the braking. It fades against deliberate pilot input.
Large hulls that cannot fit the pocket receive a mooring standoff rather than being pulled into
solid geometry. Low-speed flight tuning should make entry into these conditions easier, while
leaving the berth's physical meaning intact.

Test both sides of the station, an off-axis approach, a small ship, a large mooring hull, a lightly
loaded hull, and a loaded one. Verify that the prompt appears when the same physical gate accepts
the command and that docking does not simultaneously apply E's strafe action. Dock and keyboard
undock are fresh-press actions: holding E while approaching must not dock when range changes, and
holding the docking press while the station opens must not immediately undock. Enter also requires
a new press to dock; inside the station it remains available for focused buttons.

Ordinary civilian arrivals in [traffic.js](../src/systems/traffic.js) now approach a service point
outside the station's measured collision envelope. A tapered velocity in the target's frame feeds
the existing physical rendezvous controller; arrival requires position error within 8 WU and
relative drift at most 3 WU/s. The wait state holds near the station, or settles locally when a
displaced craft's old target is remote. Express freight keeps its long boosted leg and hands over
using stopping distance. Authored corridor jobs keep their own controllers.

Traffic and [npcJobsRuntime.js](../src/systems/npcJobsRuntime.js) clear the previous rendezvous
intent when a new movement owner takes over, preventing an old arrival controller from pulling
against the new job. The native Mule approach in
[traffic-station-arrival.test.mjs](../test/traffic-station-arrival.test.mjs) starts 500 WU away at
100 WU/s and reaches trade with 2.87 WU/s relative drift and no contacts. This proves one concrete
arrival path; full port queueing and right-of-way choreography remain follow-up work.

## Evidence and regression strategy

Use deterministic behavior fixtures for each causal change and a public rendered route for their
composition. Tests of formulas alone cannot establish readability, and a screenshot cannot
establish stability or momentum conservation.

| Scenario | Measure or invariant |
|---|---|
| Release a small translation near rest | Time and distance to settle; no oscillation, heading snap, or force discontinuity |
| Release one axis while commanding another | Uncommanded drift settles without cancelling the commanded movement |
| Cross the precision transition both ways | Smooth forces; no jump in velocity or automatic mode chatter |
| High-speed coast, boost release, and earned sling | Existing inertial behavior remains intact; deliberate braking still stops the ship |
| Drift/Newtonian, autopilot, and tether ownership | Precision assist does not silently replace the selected model or movement owner |
| NPC acquire → approach → attack → reposition | Requests change when the situation changes; yaw and throttle remain bounded and purposeful |
| Sustained formation | Slot error, yaw reversals, clearance, and re-exits over a settled window; best-ever slot error is insufficient |
| Resting or shallow body overlap | No solver-created launch or fabricated impact damage |
| Real high-energy collision | Physical response and intended damage remain; the stability fix must not grant immunity |
| Berth approach and interaction | Physical clearance, speed-gated prompt, capture, and dock command agree; held keys cannot cross into a new contextual action |
| Pause, resume, save/load, worker route | No stale command, ownership, or lifetime state crosses the transition |

The change-specific fast entry is `npm run check:motion`: precision, motor feedback, contact and
traffic coherence, formation character, dormant-flight ownership, and the docking key boundary.
The broader existing V3 entry is `npm run check:flight:v3`. `scripts/flight-lab-sim.mjs` exercises the compatibility
`flightDynamics.js` implementation and must not be presented as evidence for default V3 behavior.
`test/flight-formation-metrics.test.mjs` proves the measurement instrument; an actual formation
fixture is still needed to prove the pilots.

The native regression in [precision-flight-assist.test.mjs](../test/precision-flight-assist.test.mjs)
steps the production V3 adapter and Rapier body owner at 60 Hz for three seconds, with a single
24-mass reaction-drive ship and released controls. Its measured low-speed case falls from
20 WU/s to about **0.086 WU/s**, traveling **10.94 WU**. The 320-WU/s coast remains at
**320 WU/s** and travels **960.02 WU**. These establish local settling and preserved fast coast
through the real force/physics path. They do not by themselves establish docking success, camera
readability, combat balance, or subjective handling quality. The focused docking regression is
`npm run check:station-interact-undock`.

The integrated public-route commands are:

```sh
npm run player-truth -- --mode=adventure --gate
npm run player-truth -- --mode=swarm --gate
npm run player-truth -- --mode=gauntlet --gate
npm run player-truth -- --mode=racing --gate
```

The harness produces `verdict.md` and `contact-sheet.jpg`; record the actual verdict and its
limitations in the PR. It checks served assets against the tested Git tree before launching.
An incomplete sparse asset checkout is an environment failure, not gameplay evidence. Software
WebGL may prove a route runs but does not establish GPU performance on the player's hardware.
The harness uses a disposable save store; ordinary browser test servers must also isolate saves.

## Ten next improvements to evaluate

These are follow-up proposals, not features claimed by this patch. Each should extend the current
owner instead of creating another parallel system.

1. **A relative-motion approach instrument.** Extend the existing arrival/braking telemetry and HUD
   cue to moving cargo and rescue targets. Show closing speed, lateral drift, and a conservative
   stopping cue using actual hull/brake capability and relative target velocity. The pilot should
   know whether the next input produces capture, overshoot, or collision before committing.
2. **A coherent interaction focus.** Use the existing interaction profiles to make a single selected
   object expose its available verbs,
   the required distance/speed, and a specific reason when a verb is unavailable. Make a station,
   wreck, pod, and disabled ship equally understandable without a wall of permanent HUD text.
3. **Port traffic choreography.** Give arrivals, departures, queueing craft, service tugs, and
   escorts compatible corridor and right-of-way behavior. Keep berth lanes visibly navigable and
   make local work read as scheduled activity with interruptions, not ambient random motion.
4. **Squad tactics with readable commitments.** Extend current formation and attack primitives
   into leader-led approach, coordinated attack windows, cover, regroup, and withdrawal. Telegraph
   a short commitment through motion or comms so expert enemies are threatening and learnable.
5. **Pilot character through constraints.** Express veteran, cautious, reckless, damaged, and
   working pilots through perception delay, trajectory choice, formation discipline, and risk
   tolerance. Avoid using raw yaw jitter as a personality generator.
6. **A stronger speed-and-force presentation.** Refine camera lead, nearby reference motion,
   thruster effort, contact sound, and brief acceleration cues from the same telemetry. High speed
   should read through motion even when the HUD number is covered; braking should visibly cost
   work. Respect reduced motion and preserve target readability.
7. **Encounters with space to breathe.** Coordinate encounter density, attack direction,
   preparation time, quiet observation, and recovery. Test a finite representative journey for
   the contrast between calm and danger, rather than optimizing only enemies per minute.
8. **Persistent, legible aftermath.** Leave a finite, readable result of a fight: disabled hulls,
   recoverable cargo, rescue requests, scavengers, and consequences attributed to the cause.
   Integrate existing salvage and world-memory owners so aftermath becomes the next decision.
9. **Mastery routes built from the real world.** Turn existing berths, gates, work sites, and
   wrecks into short optional exercises: clean dock, tight passage, matched-velocity rescue, sling
   release, and formation interception. Reward control and understanding, and keep the same
   physics and controls as ordinary play.
10. **A repeatable handling review surface.** Compose the existing lab and player-truth evidence
    into a comparison of a small set of seeded routes with the same hull/load, input tape, and
    camera. Keep stopping distance, formation stability, uncaused destruction, input latency,
    and frame pacing visible together. Quantities can reject
    regressions; they should not be mislabeled as a scalar score for fun.

### Recommended combined follow-up

Combine **1, 2, 3, and 9** into one polished approach-and-interaction slice around an existing hub.
The player arrives quickly, sees when to brake, enters a disciplined stream of traffic, aligns
with the real berth, docks, accepts a nearby recovery job, and returns with a moving object. That
one route tests whether the flight model, world geometry, controls, prompts, NPC behavior, and
assets work as a single game experience.

Use **6** only for the cues required to make that route readable. Follow with **4 + 5 + 7** as a
separate combat-directed patch once the same movement foundations hold. This ordering gives each
patch a concrete playable outcome and keeps a large new content batch from masking a handling
problem.
