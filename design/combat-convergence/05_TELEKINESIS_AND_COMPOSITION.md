# 05 — Telekinesis, deployed attractors, and physical composition

**Outcome:** manipulation is a central, reliable combat language: gather actual matter, read its weight and material, hold or move it, choose a trajectory, release it, and cause meaningful collisions. Planning only. Evidence: E01–E04/E14. Research: R01/R05. Interfaces: 01, 02, 03, 06, 07, 08, 09.

## Continue the existing tools

The audited source already has a placed Pull well, repulsor, anchor, sticky/drift ordnance, and Gyre Snare's gather/hold/launch implementation. Gyre has ingestion protections and a dedicated visual renderer. Repair the full existing route before authoring another tractor beam or black-hole system.

Keep three understandable physical roles: a placed well shapes a region; Gyre acquires and launches a material aggregate; the Line creates a relationship between bodies. A moving singularity payload may be another authored weapon, but its appearance must not falsely imply the same mass-transfer and launch behavior as Gyre.

First deliver a reliable baseline combination: place Pull beside useful loose matter, move to collect that gathered matter with Gyre, and throw it through a pack. Neither movement nor handoff may teleport the aggregate into the player ship. The player must see which body moved, which tool owns the relationship, and where the thrown object will go.

## The physical lifecycle

Use a finite state contract through current owners: available matter → influenced → captured/held → loaded/aimed → launched → impact/fragmentation → recoverable aftermath. A state with no mechanical difference should not become another subsystem.

The visual language should answer: what is within reach, what is affected but not absorbable, what joined the aggregate, how large/heavy it is, what is limiting further gathering, and what release will do. Saturated capacity should stop the appropriate capture behavior with a specific cue, not keep swallowing objects cosmetically. Dry charge, out-of-range matter, protected cargo, oversized pieces, and anchored structures are different outcomes.

Preserve protected quest/custody/cargo bodies. Influence can move some objects without consuming them. Do not convert a cargo-filled wreck into anonymous ballast, erase mission state, or turn the same resource into both absorbed mass and collectible loot. Existing `hasProtectedContent`/ingestion guards are starting evidence, not a reason to skip cross-system tests.

## Mass and momentum accounting

When several passive bodies become one collision body, total physical mass is `M = sum(m_i)`. Its center of mass and velocity should be derived from the same member snapshot:

`x_cm = sum(m_i * x_i) / M`

`v_cm = sum(m_i * v_i) / M`

Preserve or explicitly account for angular momentum about the common center, including member spin and orbital contribution. Do not use a visually scaled sphere with unchanged collision mass. For mixed materials, size follows occupied volume/density and packing, not an arbitrary linear relation to mass. Approximate geometry is acceptable when declared and validated against the visible envelope.

Capture is a representation transaction: before it, members are authoritative; after it, the core is authoritative and consumed members no longer collide or pay rewards independently. Reserve the transaction before mutation so reentrant events, repeated contact, or save callbacks cannot duplicate mass. Generation-safe member references and a bounded ledger are required.

Active powered fields and launch impulses are not closed-system conservation. Account for their external impulse/energy through the actual tool/anchor/power owner. Do not claim total momentum conservation while adding free launch velocity. For an applied launch impulse, `delta_v = J/M`; when a design intentionally targets a characteristic launch speed, calculate the required impulse and resource/authority limits. Larger masses must have a meaningful handling, charge, or launch tradeoff instead of infinite damage for the same free gesture.

Preserve the current feel unless the comparative experiment supports a change. Recoil on the player is a design decision, not a mandatory realism tax; an anchored emitter can react against its attachment, and a powered gravitic drive can have an explicit external budget. What matters is a consistent advertised rule and no hidden per-frame velocity teleports.

## Hold and release must feel intentional

The existing Gyre gathers near the nose and launches on release. Test that route with keyboard flight plus independent mouse gun aim before changing it. The player should not have to steer, aim a gun, and drag a separate tiny handle simultaneously.

Compare an improved existing nose-aligned throw with a clearly entered aim/hold variant only if the baseline fails the owner experience. Both require a visible actual launch vector, honest inherited velocity, predictable cancellation, and a deliberate release. A selected enemy can supply a suggested lead, but must not silently curve a thrown wreck into an offscreen target.

A short-horizon trajectory preview should use the same initial state, impulse plan, gravity/field queries, and collision shape as execution. Dynamic bodies make the prediction conditional; communicate that rather than pretending a long chain of collisions is certain. Do not run a full duplicate physics world every frame merely to draw a line. Bound candidate queries, reuse buffers, and predict on changed intent at a suitable cadence.

Tumbling survivors should inherit the impact's real impulse and torque through the existing combat/physics owners. A projectile that visibly strikes off-center can rotate a hull; the animation must not simply spin an unaffected collider. Recovery is handled with 03/08.

## A genuine deployed gather-and-launch expansion

After the baseline is legible, prototype the owner's stronger fantasy: throw down an attractor, let it build a heavy knot of matter, then launch that knot from the deployed location.

Preferred extension to investigate: a fitted collector variant of the existing Pull emitter that references the same aggregate transaction/launch primitives used by Gyre. It is not a second gravity kernel, second body store, or clone of Gyre runtime. Extract only the reusable pure calculations/transaction seam that the two owners actually need.

Candidate interaction: deploy a collector at the aim point; its visible maw gathers eligible matter; explicitly focus that emitter; preview a launch direction from the actual core; commit a release that spends the emitter/charge budget. The core starts where it physically is. A second deployment does not steal the first emitter's ball, and ordinary Shove still performs its advertised repulse/detonation unless the UI explicitly enters a distinct command.

The first endpoint of a shield pair and a collector are different devices. Do not overload a generic TOTEM button with invisible context. Fitting can select a deployable role, but current role and next action must be visible. Limit concurrent aggregate ownership and define replacement/recall before enabling multiple collectors.

Compare this extension with simply improving Pull→Gyre transfer. Select the version that adds useful decisions without redundant controls or ownership complexity. The fixed requirement is a deployed gather/launch experience; architectural reuse is the constraint, not a demand to preserve an awkward interaction.

## Material combinations with visible causality

Use the existing material and combat catalogues. Candidate rules to complete or validate:

| Material/condition | What changes | Read the outcome |
|---|---|---|
| Dense metal | Strong physical mass and durable fragments; reflective/conductive behavior only where authored | Heavy travel, distinct impact, persistent useful wreckage |
| Brittle crystal/rock | Fractures into bounded physical pieces above its actual threshold | Cracks precede a readable split; fragments continue moving |
| Volatile/fuel-bearing matter | Can be primed and cook off under valid heat/impact rules | A warning state before a real secondary event |
| Conductive objects | Eligible network geometry for electrical propagation | A visible local path, not arbitrary screen-wide arcs |
| Cold/viscous/control-affected hulls | Altered response or recovery through existing statuses | Different handling and a clear status expiry |
| Anchored machinery | Resists motion until a real joint/support fails | Load path and break event make the release intelligible |

Do not declare all suggested combinations shipped. Audit each existing rule, and add only missing behavior with a defined producer, consumer, counter, lifetime, and cost. Avoid a bespoke `if ability A then ability B bonus` table where physical position already supplies the interaction.

## Limits, saves, and edge cases

Bound the number of captured members, active cores, secondary generations, and physical fragments based on measured scene budgets. Bounds must stop or alter behavior visibly; they must not silently delete valuable matter. Cosmetic lumps can have a cheaper representation than gameplay bodies, but their mass/shape should remain truthful.

Gyre's inspected runtime mirror is documented as unsaved. Investigate how core entities and consumed members interact with the actual save envelope. Choose an explicit compatible policy: persist the authoritative core/ledger, or resolve the capture into a safe saved physical state through existing save ownership. Never leave a reload with missing material, doubled material, a free new charge, or an invisible held body.

Test death while holding, docking, loading, pause, sector change/rebase, target removal, manual cancellation, depleted power, full capacity, extreme mass ratios, mixed materials, protected loot, and two fields contesting one object. Source attribution for damage and loot must remain stable through launch, bounce, secondary collisions, and fragmentation.

## Acceptance

CEC-C proves the full loop under normal controls and camera: the player can gather a recognizable pile, tell its mass is increasing, refuse an ineligible object for the right reason, choose a direction, launch, displace surviving enemies, destroy eligible targets through actual collision, and recover aftermath without duplicated rewards. CEC-F proves that this remains readable and responsive in a swarm. A compelling shader without a useful physical object—or correct mechanics hidden under indistinct effects—fails the same packet.
