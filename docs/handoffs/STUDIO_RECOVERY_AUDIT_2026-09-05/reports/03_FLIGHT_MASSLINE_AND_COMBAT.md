# 03 — Flight, Massline, combat, and the camera
## Build a trustworthy physical toy without sanding away its character

The inspected implementation is not a primitive movement script awaiting a physics engine. Flight produces commands, a dynamic-body owner consumes them, Rapier solves the bodies, and the game publishes authoritative motion and consequence telemetry. Several layers deliberately protect player control. Replacing this with another flight system would create a new coordination problem before solving the existing one. [FLIGHT] [PHYSICS] [AGENTS]

The right question is **which layer violates the player's expectation in each reproducible maneuver?** A ship can feel clumsy because its forces are wrong, because input changes meaning with context, because the camera conceals where it will go, because contact correction erases useful motion, because a control lock has no tell, or because a frame never arrives. These failures can look similar while requiring opposite fixes.

## 3.1 Separate response, motion, and presentation

Record an action through five points: physical input event, sampled simulation action, issued force/torque, post-solve body response, and first displayed response. Include the reason for suppressed commands. For a single turn, distinguish intentional yaw demand from automatic alignment, collision-generated angular change, recoil, and camera bank. The trace should answer “why did the nose not turn?” rather than merely reporting an average turn rate.

The input system currently contains a substantial action vocabulary and context-dependent steering: A/D can represent yaw or contribute to translation depending on other input, while Q/E provide explicit strafe. The current brake path suppresses manual thrust/strafe. These are valid possible controls, but inconsistent teaching makes them feel arbitrary. The root and design documentation disagree about key meanings. Reconcile the language before tuning the forces around a misunderstood control scheme. [INPUT] [FLIGHT] [README] [GDD]

I would preserve the shipping pilot scheme for the first comparison, with accurate hints and a small contextual action display. Do not silently return to mouse-steering because an old onboarding paragraph says so. First establish whether conditional A/D behavior is the actual source of accidental movement. When a control simplification is justified, treat it as a named scheme revision with remap migration and a clear transition—not a hidden change in a general polish task.

Use a response budget that includes **input age**, not just simulation time. A fixed-step system that repeatedly discards backlog may avoid a spiral while still feeling unresponsive. Similarly, smoothing the camera more strongly can hide visible jitter while making the ship feel delayed. Neither is an acceptable substitute for identifying the cause. The existing loop already splits simulation and presentation and records backlog shedding; extend its evidence rather than installing another loop. [SIM] [PRESENT]

## 3.2 Momentum should be a legible resource

The owner values earned speed. The current forward-held governor no longer applies the old braking floor, and assistance blends down in the overspeed region. Preserve that work. The pilot must be able to coast after a sling or impulse, choose when to brake, and recognize the difference between engine acceleration and externally acquired motion. [FLIGHT] [VISION]

Do not solve every handling complaint with a hard velocity cap or broad drag. Those changes would remove the resource that makes Massline interesting. But “never add drag” must not be interpreted as “never apply any stabilizing force.” An explicit brake, a selected drive family, a visible thruster correction, and carefully authored angular damping are different things. Current body materials already include angular damping and contact protections. The implementation should explain its costs and preserve intended maneuvers rather than pretend that no stabilizing authority exists. [BUILD] [PHYSICS]

An assisted controller can remain force-based. Use desired acceleration and angular acceleration constrained by the current hull's capability; clamp commands, not post-solve earned velocity. If translational acceleration is smoothed, rate-limit the requested acceleration rather than teleporting the body toward a target velocity. Make emergency braking a separate declared behavior so a jerk limiter does not turn a deliberate stop into a sluggish glide.

A useful handling report gives the player actual outcomes: loaded and unloaded stopping distance, lateral recovery, turn behavior at ordinary and earned speed, and available thrust under heat or damage. A percentage labeled “handling” does not reveal whether a fit changes the maneuver the player cares about. The existing engineering preview is the appropriate place for these derived examples. [OUTFIT] [SHIPS]

## 3.3 The rope problem: a feasibility envelope, not another stiffness patch

The current dynamic owner already addresses load-dependent stretch. It includes a five-percent stretch target, an angular-frequency/time-step bound, different profiles, and active-reel behavior. The older fixed-K “bungee” calculation is therefore not a complete description of the audited code. [PHYSICS]

The remaining engineering question is where **load, line length, step size, and the permitted response** make the desired rope behavior infeasible. Consider a simplified taut, circular relative motion with reduced mass μ, tangential relative speed v, rest length L, spring stiffness K, and extension x. For two movable masses, μ = 1 / (1/m₁ + 1/m₂); for a fixed anchor, μ is the movable mass. Under the specifically stated approximation of fixed tangential speed:

```text
K x = μ v² / (L + x)
x (L + x) = μ v² / K
x = (sqrt(L² + 4 μ v² / K) - L) / 2
```

This is a diagnostic equilibrium, not a general solution to the live rotating spring, and it differs from the constant-angular-momentum case. The familiar small-extension estimate x/L ≈ μv²/(KL²) overstates extension once its own small-extension assumption is violated.

For target extension ratio ε, the required stiffness in that diagnostic is:

```text
K_required = μ v² / [ε (1 + ε) L²]
```

Short lines are expensive: reducing L by a factor of ten multiplies required stiffness by one hundred. A scalar discrete-oscillator sanity bound such as `sqrt(K/μ) * dt <= omegaDtBudget` creates a competing ceiling. That ceiling is a diagnostic for an explicit spring update—not a universal Rapier stability theorem. Damping, constraint formulation, contact coupling, and the actual integrator must still be examined.

The included `reference_code/ropeEnvelope.mjs` calculates these quantities with validated inputs and tests. It does not apply a force, patch the game, or add a second physics authority. Its purpose is to identify parameter combinations that cannot simultaneously satisfy a stiffness target and the assumed numerical envelope.

When such a case appears in a live trace, choose an explicit behavior. Options include a unilateral constraint solved inside the existing physics owner, a smaller admitted integration step for the connected interaction, a longer soft-capture interval, or a bounded winch command that advertises its limitation. Do not quietly erase tangential speed to make a rope look stiff. Do not make the standard rope auto-break merely because a more convenient spring model does. The attachment policy already distinguishes ordinary standard use from exceptional break conditions and specialized heads. [ATTACH] [WINCH]

Record line length, radial and tangential relative velocity, reduced mass, applied tension, load-scaled K, actual extension, winch work, solver correction, and break reason. A reel-in failure should distinguish “the winch deliberately slipped,” “the target exceeds pulling authority,” “the spring is slack,” and “a competing command restored the old length.” A single tension bar cannot diagnose these cases.

Also separate positive winch work from payout. The inspected controller computes work from tension and absolute length change. Charging power for an actively controlled payout can be a legitimate design, but it is not the same physical statement as saying all payout injects energy. Define the intended operational cost rather than silently treating both directions as identical propulsion. [WINCH]

## 3.4 Drawn maneuvers need a time-optimal feasible path

The owner's drawn-path intent is a fast maneuver, not a slow tram following every mouse sample. Preserve that intent and the existing focus/fire restrictions. However, a universal promise that every stroke remains above a large fraction of cruise speed is impossible with finite acceleration on arbitrarily short paths. The correct implementation must reject or reshape infeasible geometry rather than violate the ship's movement rules. [VISION] [FEEL]

First simplify and smooth the drawn polyline into a bounded-curvature centerline. Preserve the player's broad gesture, endpoint, and intended exit direction. Parameterize it by arc length. For local curvature κ and available lateral acceleration a_lat, the speed envelope satisfies:

```text
v_curve(s) <= sqrt(a_lat / abs(κ(s)))
```

Then perform a forward acceleration pass and backward braking pass:

```js
// Conceptual envelope; the complete validated reference is in the ZIP.
v[i] = Math.min(localLimit[i],
  Math.sqrt(v[i - 1] ** 2 + 2 * accel * segmentLength[i - 1]));

v[i] = Math.min(v[i],
  Math.sqrt(v[i + 1] ** 2 + 2 * brake * segmentLength[i]));
```

This produces a feasible speed plan over supplied curvature samples. It is not a complete steering controller, spline generator, obstacle avoider, or collision-proof path. The included reference reports an infeasible entry speed instead of magically lowering the actual body's velocity. A production controller must decide whether to coast past the entry, preview a braking lead-in, or reject the command.

Short segments need careful timing. If both endpoint speeds are zero, dividing segment length by the average endpoint speed incorrectly reports infinite time even though the ship can accelerate and decelerate inside the segment. The reference computes a triangular or capped trapezoidal speed profile inside each segment. That edge case matters precisely because short gestures are common.

Preview only what the planner can support: broad path, feasible exit vector, and a useful indication of whether the requested bend needs more room. Avoid a novel of constraints. The player should learn the gesture through a consistent result.

## 3.5 Contact should preserve agency without becoming consequence-free noise

The current owner distinguishes commanded motion from contact-generated correction, limits extreme contact delta-v, strips unwanted craft yaw, and gives the player a deliberately smaller contact response. Those protections are intentional design choices, not evidence that Rapier has failed. Preserve them while testing for repeated contact, corner trapping, excessive penetration, and discrepancies between the displayed impact and the motion actually applied. [PHYSICS]

Use pre-solve closing motion for impact severity where appropriate, and actual applied response for feedback. These are related but not identical quantities. A correction clamp can reduce a numerical launch without implying that a high-speed collision was physically gentle. Conversely, a large solver correction caused by initial overlap should not manufacture enormous damage or rewards. The current impulse and physics code already contain several of these distinctions; tests should preserve them. [IMPULSE] [PHYSICS]

The inspected collision code deliberately protects ordinary player contact from the same consequences applied to ammunition-like targets. The historical owner ruling retained this asymmetry. Do not add hull damage to every player bump as a generic realism improvement. Instead, give glancing contacts, meaningful shoves, and heavy enemy impacts distinct directional feedback. [ALIGNMENT] [PHYSICS] [FEELFX]

CCD admission currently uses absolute speed, boost state, and hysteresis, while projectile gameplay uses swept tests rather than double-counting solver contacts. The absolute-speed gate is a useful optimization but deserves tests involving thin obstacles, opposing moving bodies, and high earned velocity. Collision safety depends on relative motion and geometry as well as one body's speed. No claim is made here that the inspected threshold is already causing tunneling. [PHYSICS]

## 3.6 Combat: readable commitments, not permanent stun or decorative force

The existing impulse kernel scales consequences using delta-v relative to cruise and mass relations, with bounded hitstun. Several weapons and heads already carry physical behavior. Build encounter decisions around those capabilities rather than increasing hit points and calling the resulting duration difficulty. [IMPULSE] [MODULES]

A useful enemy has a readable intention, a commitment, a consequence, and a recovery opportunity. A sniper should make the player choose a closing route. A brawler should occupy space and become punishable during a committed action. A screen should protect something identifiable. A controller should reveal what constraint it is imposing and how to break that relation. Adding all roles simultaneously does not create depth; it can erase the ability to identify any one of them.

Check repeated stun independently of single-hit stun. A bounded 3.5-second maximum on one event does not prove a target can ever recover under frequent overlapping hits. Decide whether repeated control has diminishing duration, a visible recovery window, or an explicit specialized build that earns a lock. Do not impose a universal immunity timer without first characterizing the existing encounter consequences. [IMPULSE]

The inspected weapon impulse path relates impulse to actual versus authored damage. That can be appropriate for some attacks, but it can also make a control weapon lose its tactical identity against a damage-resistant target. Test this deliberately. Damage resistance, impulse resistance, angular stability, and immunity to a particular control effect should be independently authorable where the design needs them—not accidentally coupled because one scalar was convenient. [IMPULSE]

The engagement authority is already elaborate: motives, legal triggers, offensive activity, response windows, doctrine phases, jurisdiction, and first-session attacker ownership. Preserve final execution-time validation. If an enemy does not fire, inspect the denied reason before increasing damage or shortening its cooldown. The source comments document previously missing doctrine-phase entries that have already been repaired. [ENGAGE]

## 3.7 Swarm: reward a successful clear with something other than immediate replacement

Swarm is not empty scaffolding. It already has a separate ruleset, kill quotas rather than empty-room completion, progressive archetype introduction, a pressure ramp, periodic drafts/refits, and a debris field designed for physical kills. Its inspected concurrency range is 10–30, with a shared run cap of 38; debris and old wrecks have explicit retention policies. These are current source facts, not freshly measured live counts. [SWARMCURVE] [SWARMARENA]

The important design risk is the refill policy. The code explicitly increases top-up batch size when a large deficit appears so that a fast player cannot outrun replacement. That maintains intensity, but it can also cancel the immediate spatial reward for playing well. A spectacular multi-kill should sometimes buy a better position, a pickup window, or enough space to set up the next stunt. Constantly restoring the room to its target can turn mastery into a faster treadmill. [SWARMCURVE]

Test a **pressure reservoir**, not an unconditional automatic difficulty increase. Author arrivals in readable groups, preserve a short earned opening after a large clear, and let a subsequent telegraphed reinforcement spend the accumulated pressure. Keep long-run challenge and kill-quota flow. The hypothesis is that a rhythm of compression and release produces more satisfying action than perfectly maintained crowd density. Compare on the same seed and build, with both survival outcomes and actual player maneuver opportunities recorded.

Do not simply lower every spawn count. The physical game needs useful bodies and terrain. Keep count, approach geometry, projectile density, control overlap, and attack commitment as separate levers. A screen full of enemies that are all executing the same move is less interesting than a readable mixture that creates different problems.

## 3.8 Camera and feedback must not fight aim

Evaluate lookahead in seconds of future travel, not only in world units. If the visible distance ahead is d and approach speed is v, the available reaction horizon is roughly d/v before accounting for target motion. A camera that feels fine at cruise can become blind after a sling. Expanding indefinitely is not a solution because the ship, targets, and relevant attachments eventually become unreadable. [FEEL]

Use bounded lookahead, bounded zoom, stable target-relative framing, and off-screen directional cues when a threat cannot fit. Distinguish dangerous approach from harmless speed; the camera should not lurch just because a number crosses a threshold. Keep critical target positions predictable during recoil and field-of-view effects.

Collision hit-stop, FOV punch, cooldowns, and speed-line ceilings already exist. Tune their composition rather than adding duplicate feedback owners. Hit-stop that changes the shared time scale also affects simulation progression; it is not literally gameplay-free just because it originates in presentation. Verify its relationship to tick-indexed input, replay timing, pause, and focus before asserting determinism across presentation schedules. [FEELFX] [PRESENT]

The acceptance sequence is one trusted maneuver, one physical combat exchange, one mixed encounter, and the same behavior in ordinary Adventure. The mechanism is only finished when the player can anticipate its outcome without reading a debug panel.

<!-- Source links are pinned to the audited commit. -->
[AGENTS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/AGENTS.md
[VISION]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/VISION.md
[GDD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/GDD_2_0.md
[BUILD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/CANONICAL_BUILD_MAP.md#L1-L145
[README]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/README.md#L1-L170
[ALIGNMENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/VISION_ALIGNMENT_PLAN.md#L1-L180
[FEEL]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/FEEL_CONTRACT.md
[SIM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/simulationRunner.js#L1-L220
[PRESENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/presentationRunner.js
[FLIGHT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/flight/propulsionKernel.js
[INPUT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/input.js#L200-L390
[WINCH]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/constraints/masslineController.js#L1-L210
[ATTACH]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/combat/attachments.js#L1-L210
[IMPULSE]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/combat/impulseKernel.js#L1-L220
[PHYSICS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/sg02DynamicBodyOwner.js
[SHIPS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/ships.js#L1-L170
[MODULES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/modules.js#L1-L165
[OUTFIT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/outfitting.js#L1-L180
[ENGAGE]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ai/engagementAuthority.js
[FEELFX]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/render/feel.js#L1-L190
[SWARMARENA]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/swarmArena.js#L1-L175
[SWARMCURVE]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/swarmMode.js#L1-L185
