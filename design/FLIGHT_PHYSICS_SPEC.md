# Flight Physics V2

## Summary
SpaceFace uses an authored deterministic starship controller, not raw rigid-body steering. The ship has inertia and drift, but the default `assisted` mode converges smoothly to the pilot's intent, brakes yaw quickly on release, and never steers itself toward hidden diagonal attractors. Banking is visual-only roll: positive turn input banks right, negative turn input banks left, and bank never feeds yaw or velocity.

## Flight Model
- Modes: `assisted` default, `drift`, `newtonian`.
- Input axes: `moveZ` throttle/reverse, `turnIntent` yaw, `moveX` lateral thrusters from Q/E.
- Canonical API: `resolveFlightProfile`, `stepPlayerFlight`, `stepNpcFlight`, `computeFlightFrame`.
- Ship-derived model fields: `flightClass`, `mass`, `inertia`, `mainAccel`, `reverseAccel`, `strafeAccel`, `angularAccel`, `angularBrake`, `maxYawRate`, `linearDrag`, `lateralDrag`, `assistStrength`, `reverseBrake`, `boostMult`, `bankMax`, `bankFactor`.
- Player and NPC ships both use the same dynamics module. AI still writes the existing intent contract.
- Flight assist damps lateral slip per mode; it does not overwrite heading, teleport velocity, or steer based on bank.
- Boost controls distinguish tap and hold: quick Shift taps trigger dash, while sustained holds spend boost energy on continuous acceleration without consuming the dash chunk.

## Collision And Backend Policy
- Default backend: `custom`.
- Optional backend: `rapier`, loaded lazily through `@dimforge/rapier3d-compat` for collision/CCD experiments and diagnostics.
- Rapier is not allowed to own player handling. It may observe or prototype simple proxy contacts, but authored control remains in `src/core/flightDynamics.js`.
- Browser runtime maps `@dimforge/rapier3d-compat` to the vendored compat module under `vendor/rapier3d-compat/` so the backend flag works in the actual game, not only in Node probes.
- Custom physics owns production collision response, with swept ship/static contacts, swept projectile checks, and material-specific response tuning so station hulls, asteroids, ships, and drones do not all bounce like the same object.

## Diagnostics
- `?debug=flight` exposes `window.__SF_FLIGHT_DIAGNOSTICS__`.
- Snapshot fields include mode, class, speed, forward/lateral speed, slip angle, yaw rate, target yaw rate, assist strength, bank, physics backend, and flight tick cost.
- Physics diagnostics live on `state.physicsRuntime.diagnostics` and include backend, Rapier readiness, proxy counts, swept contacts/hits, and tick cost.

## Verification Gates
- `npm run check` must pass.
- `npm run check:flight` runs deterministic flight lab scenarios and browser probes.
- Browser probe must dismiss onboarding and verify desktop and mobile: nonblank WebGL canvas, correct bank sign, yaw braking after release, strafe without yaw, throttle, sustained boost, reverse braking, diagnostics availability, Rapier readiness, and no page errors.
- Performance target: flight update under 2ms/tick for the lab load; physics diagnostics should remain under the 2ms budget in ordinary play.
