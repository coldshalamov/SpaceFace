<!-- LIFETIME: ACTIVE_PLAN — implementation recommendations; root architecture remains authoritative. -->
# Architecture decisions for the selected production-quality wave

Parent: [production plan](PRODUCTION_QUALITY_COMPOUNDING.md).
Scope: preserve the current engine and remove demonstrated cross-system limits on the
[first wave](PRODUCTION_QUALITY_FIRST_WAVE.md). No runtime changes are made by this document.

## 1. One authority for physical effects

The existing [physics authority](../../src/core/physicsAuthority.js) exposes
`queuePhysicsImpulse`, `queuePhysicsTorqueImpulse`, `writePhysicsControl` and telemetry.
New contact assistance must enter through this authority and the selected Rapier path.
It must not write renderer transforms, collider positions or flight velocity directly.

Keep responsibilities:
- input: normalized intent and rebindings, not per-feature hardware polling;
- ships: accepted fitting and derived capability;
- existing physical/contact owner: eligible contact and impulse;
- combat/provenance: actual damage and attribution;
- existing cargo/economy owners: custody and settlement;
- presentation: observes accepted results, never creates them.

Read current callsites and names. These are responsibilities, not permission to invent modules
matching this list. Reuse the existing hullBurst family for its existing effects.

## 2. Collision coverage must follow a consequential trajectory

**Evidence:** the September 30 hull-burst handoff records a flung body outrunning the active body
ring. Reproduce at current HEAD before editing. This is different from tunneling: a swept/continuous
collision setting cannot collide with an object that was never admitted.

**Selected direction if still reproduced:** extend the existing admission owner's bounded demand
to the near-future swept corridor of a small number of consequential moving bodies.
Consider body extent, relative motion and the displacement until the next admission opportunity.
Use the existing spatial index, prioritized demand and budget accounting; no per-frame universe scan.

Keep the live trajectory's collision candidates resident until the consequential interaction
settles or the existing owner resolves its lifecycle. Expire demand on death, removal, leaving the
supported scene, or return to non-consequential motion. Avoid numeric-id reuse mistakes.

Decision order:
1. If the collider is resident but missed, investigate the actual contact/continuous-collision path.
2. If it is absent, repair trajectory-aware admission and bounded retention.
3. If the required density exceeds the declared budget, redesign the local arrangement or choose a
   bounded physically honest supported envelope. Report that limit rather than pretending the far
   collision occurred.
4. Do not silently increase global population, clamp all high speeds, add global drag, or fake a kill.

This is a narrow owner change. Global backend replacement is not justified by the cited failure.

## 3. Capabilities: make selected eligibility consistent, not universal

The current bumper explicitly selects ships/drones; field, tether and mining paths have their own
eligibility. Those differences can be deliberate. Do not make every asteroid dynamic or every
missile catchable just because a generalized property table sounds tidy.

For the selected first-wave bodies, record in the existing definitions/tests:
- fixed versus dynamic body, collider/material, truthful mass;
- permitted attach/carry/release/contact response;
- damage/reactive payload and attribution;
- ownership/receiver semantics;
- wake/sleep/retirement and save behavior.

Consolidate duplicated eligibility only when two consumers are supposed to promise the same action
and disagree. Reuse existing model/physics/target-scoring contracts. Extend an owner predicate or
data schema instead of adding a second universal registry.

A useful matrix is small and intentional: hostile light hull, heavy hull, fixed convex asteroid,
existing loose cargo and an existing machinery surface. Unsupported combinations get honest refusal.
That is reusable consistency without demanding the cross-product of every object and weapon.

## 4. Contact-assisted redirection is not an alternate flight solver

The proposed skate reads a real contact normal and relative velocity, and produces one bounded
authority command for the continuous contact episode. The equipped capability is necessary but
not sufficient: deliberate tangent-compatible flight intent is required; braking suppresses it.

Preserve these invariants:
- outgoing relative speed cannot exceed incoming speed in the initial no-powered-boost design;
- starting at rest cannot generate useful speed;
- recontact jitter and multiple manifold points cannot multiply assistance;
- contact does not change hull mass, permanent thrust curves, input axes or ordinary un-equipped behavior;
- the surface's actual geometry determines the tangent; no hidden path follower;
- save/load cannot retain a stale collider reference or replay a contact impulse.

If live contact APIs cannot provide stable normals/lifecycle, implement the minimal missing contact
information in the existing owner first. Do not approximate it from visible meshes.
Angular feedback is presentation unless accepted torque is deliberately part of the mechanic.

## 5. Reactive bodies and aftermath must remain bounded

Use existing payload, field, damage and aftermath owners. Reaction state belongs to simulation;
cosmetic dust does not acquire collision bodies. Causal effects retain source lineage through
secondary hits and ownership changes. A repeated bus event must not grant a second settlement.

Any future reaction-table extension requires explicit contact thresholds, once-only consumption,
bounded chain depth/active work and stable save/expiry semantics. It is not a license to create
unbounded recursive explosions. Restore valid persistent facts; clear expired transient effects.

Do not add these systems as first-wave prerequisites if the selected hull/terrain interaction
already works. Full movable-rock/ordnance work remains in the hull-burst continuation.

## 6. Authoring topology without making a new editor

Use existing sector-local coordinate, arrangement, activity pocket, encounter and world-site
definitions. Derive small route fixtures from the production definitions where possible, so the
test does not validate a different obstacle layout.

Choose broad visual/physical shapes first: approach, convex contact face, gap, recovery, bypass.
Require collider/navigation clearance on the actual supported hulls before ornamental detail.
Persistent changed geometry needs stable world identities and existing save/restore ownership.
Do not create another level format, general graph editor, event director or save layer for three routes.

## 7. Acquisition and presentation are dependencies, not afterthoughts

A proposed fitting needs a real module definition, accepted derived-stat path, service/offer,
fitting explanation and input-compatible behavior. Cross-check current tier/economy before price
selection. The first-wave skate's number and item ID are implementation details to bind once,
not conflicting alternatives across three docs.

Normal UI, sound and effects consume the same accepted result. Tab selection identifies intent;
it does not guarantee a physical hit or override heading/relative velocity.
Respect current ORRERY and audio arbitration. If presentation is wrong, fix that consumer;
do not falsify the simulation event to obtain a satisfying effect.

## 8. Verification scope and design tensions

Use the existing scenario harness and repository validation ladder; no new observatory or report
service is needed. Reproduce a reported cause once, change it, rerun the affected case, and inspect
its neighbors. Session-shape evidence is only needed for the district's integrated sequence.

Important tensions to resolve locally:
- permissive collision forgiveness versus deliberate contact mastery;
- long throws versus collision residency and camera readability;
- repeatable tricks versus shallow automated steering;
- persistent useful objects versus clutter and body budget;
- many interactions versus a small understandable input vocabulary.

The first version intentionally leaves vertical flight, general destructible topology, unlimited
dynamic asteroids, global stat rebalance and new online progression outside scope. They can be
considered later only for a specific experience that cannot be delivered by the current structure.
