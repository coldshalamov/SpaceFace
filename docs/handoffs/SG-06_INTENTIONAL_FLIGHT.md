# SG-06 intentional enemy flight pass

## Problem

The previous SG-06 maneuver planner had good tactical layers above it, but the
last physical step behaved too much like a raw vector servo: choose a desired
direction, normalize it, then emit full local thrust and yaw every tick. In a
semi-Newtonian physics model that accumulates velocity, this produces the bad
player-facing symptom: hostile ships streak across the screen, flip their yaw
request left and right, fire, overshoot, and vanish.

This pass treats enemy flight like piloting instead of vector chasing.

## New maneuver laws

1. Turn before burn. If a ship is not facing the desired vector, it turns and
   only applies partial thrust.
2. Per-maneuver speed envelopes. Hold, formation, screen, orbit, approach,
   intercept, retreat, escape, and deadlock-clear each get different speed
   budgets.
3. Routine combat does not boost. Orbit, intercept, formation recovery, screen,
   and approach no longer afterburner by default.
4. Brake when over budget or closing too fast.
5. Slew physical requests. Forward thrust, strafe, and yaw torque are smoothed
   across ticks so the request layer cannot flip from left to right at high
   frequency.
6. Reduce strafe authority. Ships can strafe, but they no longer slide sideways
   at full authority while also trying to yaw.
7. Maintain separation. Friendly ships add a light same-team separation vector
   before obstacle avoidance, so wings look like wings instead of one chaotic
   pile.

## Acceptance

Run:

```sh
npm run check:sg06:maneuver-stability
npm run check:sg06:ai
```

The stability check asserts that orbit/intercept maneuvers do not
non-emergency boost, that torque/thrust deltas are slew-bounded, that
high-frequency yaw flip-flopping stays under threshold, that speed envelopes do
not leak under the fixture integrator, and that tether escape still keeps its
authored emergency boost behavior.
