# Prompt — Mission Navigation, Route Planning, and Route Execution Agent

Prepend `00_COMMON_CONTEXT.md`, the accepted Atlas contract, and the accepted Propulsion control contract.

<role>
You are the navigation and autonomous-flight systems engineer. You own the contract that turns a mission or selected place into a truthful destination, an immediate reachable leg, a route, and an executable itinerary.
</role>

<scope>
You own:

- Mission objective resolution into navigable targets
- Destination versus next-leg semantics
- Route graph and route-policy calculation
- ETA, resource, risk, legality, and confidence estimates
- Route state and interruption reasons
- Local autopilot integration
- Multi-leg route executor
- HUD, radar, and map-facing navigation data contract
- Plot, engage, pause, resume, disengage, and recovery semantics
- Route save/load and migration

You do not own map rendering, flight force integration, speed VFX, or lane art. Consume those systems through public interfaces.
</scope>

<required_behavior>
## Objective contract

Every tracked objective must expose:

- Why the player is going
- Ultimate destination
- Required arrival action
- Immediate reachable leg
- Exact, approximate, uncertain, stale, or unknown position
- Route alternatives and active policy
- ETA and resource estimate
- Threat, legality, and confidence
- Conditions that invalidate or interrupt the route

## Route planning

- Resolve a route through real connectors and traversable space.
- Support explicit policies where the world data makes them meaningful: fastest, safer, lower-resource, known-only, or player-constrained.
- Never point the HUD directly at an unreachable final station while hiding the gate or corridor sequence.
- Return a structured explanation when no route exists.

## Route execution

Implement a visible, inspectable state machine rather than a boolean:

`ALIGN → BURN → COAST → FLIP → BRAKE → APPROACH → ARRIVE`

For multiple sectors or connectors:

`APPROACH CONNECTOR → TRANSIT → ACQUIRE NEXT LEG`

State names may differ if the accepted architecture requires it, but the states and transitions must remain observable, interruptible, and testable.

- Manual input clutches or aborts control according to a documented policy.
- Threat, obstruction, damaged infrastructure, low resources, and stale route data produce explicit interruptions.
- The player can recover, replot, resume, or disengage.
- Plotting a route and engaging control are separate actions.
</required_behavior>

<engineering_constraints>
- Verify the prior claim that `nav.autoTravel` is written without a consumer.
- Reuse sound local-autopilot braking, obstacle, and capture logic where it is genuinely reusable; do not simply wrap a local point controller around a multi-sector route.
- Use propulsion-provided acceleration, braking, stopping-distance, and actuator APIs. Do not duplicate physics constants in navigation.
- Use Atlas connectors and positions. Do not infer topology from UI markers.
- Do not report engagement if no executor owns control.
- Keep mission semantics independent of one specific textile mission.
</engineering_constraints>

<verification>
At minimum, test:

- Local destination
- Destination in another system through multiple connectors
- Deep-space start
- Missing or stale connector
- Route policy changes
- Manual abort during burn and brake
- Overshoot and recovery
- Damaged or interdicted route segment
- Save/load in every significant executor state
- Final arrival action becoming available only at the correct place
- HUD and map showing the same destination, next leg, progress, and interruption
</verification>

<deliverables>
- Navigation and route schemas
- Planner and executor code in owned modules
- State-machine tests and end-to-end primary-journey proof
- Migration from any existing local autopilot and `autoTravel` flags
- Clear UI-facing states and human-readable interruption reasons
- Exact dependency list for physical lanes and future strategic orders
</deliverables>

<task>
Implement the smallest complete route contract and executor that can take the player from a tracked mission to the next reachable leg truthfully. Do not hide missing runtime behavior behind UI state, and do not attempt physical-lane ecology until the basic itinerary is executable and recoverable.
</task>
