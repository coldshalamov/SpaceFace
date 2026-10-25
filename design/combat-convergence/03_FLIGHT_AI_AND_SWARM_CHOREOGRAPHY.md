# 03 — Stable flight AI and intentional swarm choreography

**Outcome:** units look as though they are trying to do something, can physically do it, and visibly lose and regain that ability when the player disrupts them. Swarm combat stays abundant and exuberant without becoming an unstructured stream of collisions. Planning only. Evidence: E06/E08/E12/E14. Research prerequisite: R02. Interfaces: 02, 04, 05, 06, 08, 09.

## Diagnose the layer before replacing it

The source already contains tactical selection, maneuver requests, formation frames, gap queuing, disruption recovery, and a flight execution path. The owner's report of unstable flight does not establish that another flight engine is needed. Trace a few visibly bad actors through the real route before changing coefficients.

Capture, with simulation tick and actor lifetime: perception inputs and their age; current role/target; selected doctrine and phase; maneuver goal and reference velocity; requested acceleration and yaw; accepted actuator command; actual velocity/angular velocity; collision impulses; external field/tether forces; control-loss status; and reasons a command was rejected or replaced. Identify all writers touching movement. A perfectly tuned controller cannot succeed when a second system overwrites its command later in the tick.

Separate these failure classes: unstable controller, unreachable target/slot, rapid decision switching, stale contacts, avoidance fighting formation, incorrect mass/inertia/authority, sampling delay under load, and expected disruption that lacks a visible explanation. Preserve this classification in the defect record. Do not hide any of them with forced poses, velocity resets, visual-only following, or making all enemies slow.

## A layered control contract

Keep the existing perception → intent/doctrine → maneuver → actuator/physics ownership. Each layer must publish a meaningful reason, not several competing wishes.

Intent chooses a tactical objective and holds it long enough to form a readable action. Maneuver produces an achievable trajectory/reference in the current environment. Control turns reference errors into bounded thrust/torque using the hull's actual capabilities. Physics integrates those commands with collisions and external forces. Presentation shows the resulting motion and commitment.

Use real relative motion. A candidate translational controller is:

`a_cmd = a_reference + Kp * (p_reference - p) + Kd * (v_reference - v)`

This is a design candidate, not an instruction to replace the current solver. Gains have units and must be fitted to the real update period and actuator limits. Project the result into available local thrust axes, apply damage/status limits, and let the existing physics authority issue force. Avoid an integral term unless measured persistent bias requires it; saturation plus accumulated integral is a common source of overshoot.

Arrival speed must account for available braking and relative closing speed. A useful starting bound is `v_close <= sqrt(2 * a_brake * distance_remaining)`, with safety margin for controller latency, obstacles, and changing targets. It is a bound relative to the moving reference, not a command that forces the follower's absolute speed to zero near a moving leader.

For yaw, inspect angular velocity as well as heading error. A proportional-derivative torque or equivalent existing FlightV3 request should damp rotation, respect inertia and torque limits, and avoid angle-wrap discontinuities. A ship that cannot turn tightly enough should widen its run or choose a new maneuver, not shake between left and right commands.

## Formations are moving frames, not points to chase

A slot belongs to a stable squad frame. For offset `r` in the leader's frame, derive its world position and feed-forward velocity. If the frame rotates, slot velocity includes the planar equivalent of `omega × r`; acceleration can include tangential and centripetal terms when the existing controller supports them. Chasing only the slot's current position makes turning formations perpetually late.

Assign slots at meaningful membership events and retain them. Do not reshuffle the nearest slot every tick or every time two ships cross. Prefer deterministic, low-crossing assignments, with deliberate reallocation after death, split, or role change. Use small squad-local work; an expensive global matching problem over the entire swarm is unnecessary.

A leader's maneuver envelope must be feasible for its members. Limit collective turn curvature and acceleration when required, or explicitly break the formation into attack runs. A heavy escort should not be ordered to occupy a slot requiring a light fighter's lateral authority.

Do not keep rigid formations in every phase. Use approach formation, attack commitment, separation/egress, and regroup as distinct observable phases. Formation itself should be a tactical state the player can break, not a screenshot arrangement agents constantly snap back into.

## Obstacle avoidance and physical disruption

Plan against swept hull clearance, not only the actor's center. Include expected travel during perception/control latency and a conservative rotational envelope where relevant. Moving debris and moving shield panels need relative-motion tests. A physically large ship must not take a gap just because its visual origin fits.

Use explicit priority arbitration: an imminent collision can override formation briefly; nonurgent separation should not cancel every attack. Retain a chosen avoidance side through a local encounter so two agents do not mirror each other indefinitely. Queue in narrow corridors when necessary. When a route is infeasible, choose another route, wait with visible intent, or disengage; repeated left-right indecision is not a valid fallback.

External displacement must produce a genuine tactical opening. While tumbled or disabled, gate the actual steering/fire authority, retain linear/angular inertia, and show the state. On recovery, reacquire a feasible reference rather than instantly correcting the entire positional error. Existing disruption recovery in `maneuver.js` is the starting seam. Measure whether its recovery and regroup phases survive the production update path.

Knockback should not be cancelled immediately by overpowered position holding. Conversely, control loss should not be refreshed forever by tiny incidental hits. Use the existing status/impulse owners to define meaningful thresholds, diminishing extensions, and a bounded recovery policy. Boss resistance can reduce displacement, but it must not make a visible supposedly heavy response mathematically indistinguishable from immunity.

## Choreograph attention, not just spawns

A swarm has many bodies but need not have every body launching a high-consequence attack simultaneously. Extend the existing encounter/director and squad owners to allocate attack opportunities and preserve readable recovery intervals. Do not add a second encounter scheduler.

Prototype a limited number of simultaneous high-salience commitments, calibrated through normal-camera play. Ordinary low-risk fire and physical motion can remain numerous. Attackers waiting for an opening should screen, flank, gather, reposition, or cover retreat—not idle visibly until a token appears. A target can interrupt, displace, or kill an attacker during its preparation; that should free the opportunity without instantly producing an indistinguishable replacement attack.

The director may control pacing using game state, but tactical actors must not receive the player's concealed position as a result. Fairness and perception are separate from encounter scheduling. Telegraphs already committed must remain represented when the VFX budget tightens.

Design a small role grammar using existing enemy types before adding more hulls:

| Role | Readable behavior | Player answer |
|---|---|---|
| Pack striker | Shared approach, brief converging strike, then visible egress | Scatter the pack or throw one member through its route |
| Lance unit | Establishes range, exposes a charge line, commits, recovers | Break line, cross the shot, or disrupt its aim |
| Rammer | Squares its nose, accelerates along a committed lane | Sidestep or redirect it into real terrain |
| Screen escort | Occupies a leader's threatened side; formation changes expose gaps | Displace the screen or attack from another direction |
| Field controller | Places a readable influence source and protects it | Move, destroy, or exploit the emitter |
| Recovery/support unit | Approaches a disabled ally and performs a visible task | Interrupt the task or use the rescue geometry |

Map these roles onto the actual catalog and doctrines. This table does not assert that any named role is missing. Avoid giving every archetype all capabilities; an enemy's silhouette and motion should predict its main problem.

## Encounter pacing and abundance

Use approach lanes, obstacles, and group phase offsets to create readable bursts. Do not spawn an unseen high-damage attacker directly under the player or fill every exit with a simultaneous attack. Make density serve opportunities: a tight pack is excellent ammunition for a heavy thrown mass. Preserve spaces where the player can plan a throw or read the next commitment.

Tune ordinary enemy durability and incoming pressure against the actual starting kit and expected accuracy. Fast swarm kills should coexist with a few durable, readable specialists. Increasing enemy count while leaving every hull as a lengthy damage sponge is not the intended upgrade. Report time-to-kill distributions, not a single perfect-aim DPS number.

An encounter should also have a visible finish. Surviving units may break, retreat, surrender, or recover according to current faction/doctrine rules. Avoid a final offscreen circling enemy holding the whole run hostage; locate it truthfully or define a fair retreat resolution through the existing run owner.

## Tests that actually test control

The formation acceptance must measure sustained behavior after convergence: position error distribution, relative velocity error, overshoot, angular sign reversals, unwanted contacts, slot swaps, and control saturation. Merely entering the desired radius once does not establish stability.

Run: stationary arrival; moving leader; accelerating and turning leader; different hull masses; damaged thrusters; crossing groups; narrow-gap queue; moving obstacle; shield insertion; leader death; member disappearance/recycled ID; temporary lost perception; heavy external impulse; and recovery from tumble. Repeat at different render rates with the same fixed simulation inputs. Compare settled intervals, not only final screenshots.

For swarm choreography, record telegraph overlap, time-to-contact, incoming peak damage, meaningful escape windows, phase switching, and offscreen attack causes. Human review must be able to name what each specialist is attempting. If the scene still reads as noise, improve the role/phase structure before adding enemies or stronger bloom.

## Delivery contract

Return the causal trace and diagnosis, minimal repairs through existing owners, stable formation and disruption behavior, a representative mixed-role encounter, and matched before/after motion evidence. Do not declare the AI repaired from unit tests alone. Do not rewrite the flight engine unless the experiment establishes an architectural limitation and a bounded replacement outperforms the existing path without losing player feel.
