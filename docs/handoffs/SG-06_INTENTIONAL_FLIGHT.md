# SG-06 intentional enemy flight pass

## Problem

The previous SG-06 maneuver planner had good tactical layers above it, but the last physical step behaved too much like a raw vector servo: choose a desired direction, normalize it, then emit full local thrust and yaw every tick. In a semi-Newtonian physics model that accumulates velocity, this produces the bad player-facing symptom: hostile ships streak across the screen, flip their yaw request left/right, fire, overshoot, and vanish.

This pass treats enemy flight like piloting instead of vector chasing.

## Clean-room observations used

Craig Reynolds' steering model separates action selection, steering, and locomotion. That separation matters here because SG-06 already has higher-level tactics; the broken part was locomotion-facing steering. The controller needs bounded steering force, bounded speed, and anticipation when velocity is large relative to turn authority.

Endless Sky's AI code follows the same practical law: ships do not simply thrust at the target every frame. They keep station, account for target velocity, gate thrust by facing/alignment, slow or reverse when they are too close, and attack from ranges instead of always burning straight through the player.

The historical SpaceFace combat spec also called for a steering + FSM stack with seek/flee/arrive/pursue/evade/separation/wander/orbit/strafe clamped to ship accel and turn limits. This pass restores that spirit inside the existing SG-06 maneuver layer without replacing the tactical stack.

## New maneuver laws

1. **Turn before burn.** If a ship is not facing the desired vector, it turns and only applies partial thrust. This prevents jackknifing and broadside acceleration spikes.

2. **Per-maneuver speed envelopes.** Hold, formation, screen, orbit, approach, intercept, retreat, escape, and deadlock-clear each get different speed budgets. This is not a global speed nerf; it is intent-specific flight discipline.

3. **Routine combat does not boost.** Orbit, intercept, formation recovery, screen, and approach no longer afterburner by default. Boost is reserved for retreat, tether escape, and deadlock clearing.

4. **Brake when over budget or closing too fast.** The planner explicitly requests braking/counter-thrust when speed exceeds the intent envelope or when an attack/orbit approach is collapsing too quickly.

5. **Slew physical requests.** Forward thrust, strafe, and yaw torque are smoothed across ticks so the request layer cannot flip from left to right at high frequency.

6. **Reduce strafe authority.** Ships can strafe, but they no longer slide sideways at full authority while also trying to yaw. That gives them a visible nose, path, and commitment.

7. **Maintain separation.** Friendly ships now add a light same-team separation vector before obstacle avoidance, so wings look like wings instead of one chaotic hairball.

## Acceptance

Run:

```sh
node scripts/check-sg06-maneuver-stability.mjs
npm run check:sg06:ai
```

The new stability check asserts that orbit/intercept maneuvers do not non-emergency boost, that torque/thrust deltas are slew-bounded, that high-frequency yaw flip-flopping stays under threshold, that speed envelopes do not leak under the fixture integrator, and that tether escape still keeps its authored emergency boost behavior.
