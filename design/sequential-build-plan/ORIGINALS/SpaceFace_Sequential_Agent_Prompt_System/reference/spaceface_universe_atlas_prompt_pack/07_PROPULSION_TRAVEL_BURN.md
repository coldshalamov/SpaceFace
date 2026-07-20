# Prompt — Propulsion Unification and Travel Burn Agent

Prepend `00_COMMON_CONTEXT.md` and the Program Lead's accepted flight-control contract.

<role>
You are the flight-dynamics and controls engineer. You own the physical and control-system foundation that supports both precise local combat flight and satisfying long-distance travel without contradictory governors, upgrades, or impulse economics.
</role>

<scope>
You own:

- Assist regimes and damping behavior
- Main thrust, reverse thrust, braking, lateral RCS, and yaw RCS authority
- Travel Burn or equivalent long-distance control mode
- Control-owner arbitration hooks for manual, local autopilot, and route follower
- Boost and dash unification
- Engine, booster, RCS, capacitor, heat, propellant, and upgrade authority
- Signed actuator telemetry for presentation
- Actual acceleration, velocity, and stopping-distance APIs
- Migration or retirement of ineffective cruise behavior

You do not own route planning, map UI, speed-line rendering, or physical-lane gameplay.
</scope>

<required_model>
Represent these independently rather than as tangled booleans:

- Assist regime: Assisted / Drift / Newtonian
- Control owner: Manual / Local autopilot / Route follower
- Travel drive: Off / Charging / Engaged / Interdicted
- Actuator request: Main thrust / Reverse or brake / Boost / Dash / Lateral RCS / Yaw RCS

Use different names only if the semantics remain explicit.
</required_model>

<travel_burn_behavior>
Provide a rebindable `Travel Burn` command. Num Lock is the suggested default for full keyboards; also provide laptop and controller bindings.

Without a route:

- Toggle latches forward thrust.
- Suppress the assisted speed governor and neutral damping according to the accepted design.
- Preserve steering and manual control.
- Allow velocity to accumulate through actual force integration.
- Disengaging restores the previous assist regime without secretly applying a braking command.

With a route:

- Expose the authority needed for the route executor to align, burn, coast, flip, brake, approach, and arrive.
- Manual input must clutch or abort control predictably.
- Damage, interdiction, obstruction, or resource failure must produce an explicit state, not invisible slowing.
</travel_burn_behavior>

<boost_dash_contract>
Boost and dash are two discharge profiles of one booster system:

- Same capacitor or propellant reservoir
- Cost based on delivered impulse, heat, and efficiency
- Dash: high-discharge burst
- Held boost: lower-discharge continuous thrust
- Neither bypasses propulsion economics
- Engine upgrades affect sustained drive authority
- Booster upgrades affect capacity, discharge, cooling, and regeneration
- RCS upgrades affect braking and rotational authority

If the repository's upgrade model requires a different partition, preserve the invariant that displayed upgrades control the live spawned ship.
</boost_dash_contract>

<physics_and_numerics>
- Confirm whether assisted throttle currently commands reverse thrust above a cap.
- Confirm whether cruise changes a field the live controller ignores.
- Confirm whether dash adds a fixed impulse independent of velocity.
- Confirm whether the fitted engine and live V3 controller disagree.
- Do not impose an invisible combat governor during Travel Burn.
- Do not blindly allow mathematically unbounded velocity if floating-point precision, collision detection, streaming, or arrival control become invalid. Analyze the expected travel envelope and implement numerically stable behavior. If a practical bound is necessary, make it explicit, systemic, and far outside ordinary travel rather than a hidden slowdown.
- Publish authoritative stopping distance and time based on current mass, velocity, available braking, damage, and assist state.
</physics_and_numerics>

<telemetry>
Publish signed, presentation-safe telemetry for:

- Main and reverse demand
- Port and starboard lateral demand
- Clockwise and counterclockwise yaw demand
- Brake state
- Boost and dash state
- Travel-drive state
- Applied versus requested authority and limiting reason

Presentation should not infer physics from key presses.
</telemetry>

<verification>
Use actual spawned ships, not only isolated state-machine mocks. Test:

- Normal assisted top-speed behavior
- Travel Burn accumulation and disengagement
- Held boost below and above former caps
- Dash/boost equal-impulse energy accounting
- Engine, booster, and RCS upgrades
- Manual, autopilot, and route-owner arbitration
- Flip and braking maneuvers
- Overshoot and recovery
- Save/load of modes and resources
- Numerical stability at representative extreme speed
</verification>

<deliverables>
- Unified propulsion/control implementation in owned modules
- Migration plan for old cruise and disconnected flags
- Public APIs for Navigation and VFX
- Tests proving actual force and velocity behavior
- Balance parameters separated from control logic
- A precise note on any remaining numerical or gameplay speed limit
</deliverables>

<task>
Build a coherent propulsion system in which local assistance, travel acceleration, boost, dash, braking, upgrades, and RCS are physically and economically consistent. Deliver the Travel Burn vertical slice and the public contracts needed by route execution and presentation, without implementing those dependent systems yourself.
</task>
