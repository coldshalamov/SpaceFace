# Physics contract for the new material and machine work

This is design/engineering guidance for the **existing** XZ, fixed-step, authority-owned runtime. It is not a new engine specification. Current code determines units, integration order, admitted target types and concrete API signatures. Basic force/body distinctions are supported by Rapier's official documentation [E01, E02]. Proposed new mechanics below are game rules, not claims of demonstrated real alien physics.

## First question: which body can actually respond?

Before designing an effect, identify whether the target is dynamic, kinematic/scripted, fixed, a sensor, cosmetic or aggregated. These are not interchangeable. An impulse on a dynamic body should go through current physics authority. A scripted sensor need not be shoved. A machine may remain noncolliding while its **workpiece** is a real dynamic object. A visually present but noninteractive object needs a deliberate affordance, not a fake interaction.

Master bomb filters omit fauna in the inspected source. PR machine spawns explicitly opt out of physics. Fixing the planned interactions therefore starts with admission/ownership, not higher VFX intensity. [S13, S24]

## Quantities and laws

For a dynamic body's translational change, impulse gives Δv = J/m. At a contact offset r from the center, angular impulse in the planar axis is proportional to r × J, divided by the actual rotational inertia. Use the engine's current impulse/torque path and signs; do not invent a second mass accessor or write the visual mesh's rotation as physical rotation.

A rigid-body point moving with position offset r has velocity v_point = v_center + ω × r. A detached goo parcel or workpiece should inherit that point motion, plus any explicit release impulse. A renderer-only spark may approximate motion, but it must not produce gameplay damage, change physics RNG or assert a larger damaging extent.

### Coating is not atmospheric drag

A deposit attached to a freely coasting ship does not continuously slow it merely because it is sticky. For a stylized coating mechanic, choose and name the rule: blocked thrust, degraded maneuver authority, additional accounted mass, or the existing **effective coupling** mass/inertia status. An effective mass multiplier is a game abstraction; do not claim material mass conservation unless transfer is actually accounted for. Avoid changing base ship mass outside its canonical derived-stat owner.

A surrounding moving goo cloud can exert medium-relative resistance. For u = v_body − v_cloud, a bounded damping step can target u' = exp(−k Δt)u. The corresponding impulse is J = m_eff(u' − u), applied through authority. This cannot reverse relative velocity for nonnegative k by itself. Overlapping clouds need a declared shared budget or composition law so damping is not accidentally applied many times. Reuse the current Tarburst helper where its law already fits.

A membrane in vacuum cannot act as an ordinary air brake. A proposed “membrane brake” must either interact with a modeled local medium, expel reaction mass, or be an explicit powered field device with costs and limits. Do not ship the metaphor as a physical explanation.

### Sparse adhesive representation

Begin with a small bounded number of authoritative macro-parcels. Their swept collisions determine actual hits. Cosmetic droplets, ripples and filaments make that material rich without requiring a rigid body per visible mote. Start with a measured cap appropriate to the scene; earlier chat counts such as 8–24 are prototype guesses, not production benchmarks.

On attachment, store stable target identity, local anchor/normal, material quantity or coverage bucket, age/expiry and effect state. Use a few hull regions rather than a per-triangle database. Merge only compatible nearby deposits under a deterministic rule. Visual coverage must explain the actual penalty; random cosmetic density cannot change it.

Mass transfer, when modeled, must debit the projectile/deposit and credit the recipient once. Simplified effective coupling should instead be clearly labeled and bounded. Source death, target death, purge, cure, sector unload and save/load each need a terminal rule.

### Elastic bridge

Use the existing constraint machinery if possible. A simple spring-damper description is T = k max(0, length − restLength) + c relativeEndpointSpeedAlongLine, clamped to the admitted tensile range. Apply equal/opposite endpoint forces and corresponding torques when both bodies are dynamic. Fixed anchors or powered devices define their external momentum source explicitly.

This equation alone does not guarantee numerical stability. Stiffness, timestep, solver iterations, damping, caps and projected constraints must be tested together. Reuse the Massline authority rather than copying its solver into “alienRope.js.” Define maximum links per body, maximum live bridges, cycle handling, deterministic break order and no self-links. Below-threshold load can recover; crossing a break threshold emits one event and leaves a clear detach state.

### Pressure sac

A sac's pressure represents a stored/expended energy source. Its contact normal determines impulse direction; contact offset determines torque. Inflation communicates time-to-release. Purge, shooting or cutting before burst needs a defined result. Do not announce a directional device and then apply only an isotropic blast. Its cooldown/ammunition and recovery window are game balance parameters, not derived physical constants.

### Precursor fields

Give every field an explicit reference frame, finite geometry, admission predicate, strength/time envelope, energy source or sink, and terminal state. For a velocity plane with unit normal n, split u into u_n = (u·n)n and u_t = u − u_n. Damping only u_n is a different law from stopping the ship or pulling toward a point. Keep the tangent term unchanged where that is the promise.

A curl field applies bounded tangential acceleration. Soften the center, cap authority and prevent overlap from becoming an unbounded speed pump. A powered field may legitimately add energy; say so. A portal/vector transform requires explicit energy, orientation, position, collision, continuity and permission contracts and remains optional until those costs are justified.

**Coherence suppression, material blocking and sterilization are three different operations.** A Shepherd may reduce coordination while animals remain alive and free to move. A selective physical plane needs a separate admitted force/collision rule. Biomass removal is a consequential world event, not a shader fade.

## Input contract

Aim and action should fit the current keyboard/trackpad model. Reuse the current target/rig/ordnance selection semantics. A two-anchor tool must explain how the first and second anchors are selected without requiring simultaneous precise steering, sustained right-click and scroll input. If no workable gesture exists, simplify the tool before implementing its solver. No new bindings are assigned by this pack; the current action/rebind owner decides.

## Required adversarial matrix

Dynamic versus scripted; equal and extreme mass ratios; stationary and high relative speed; zero distance; exact-center field entry; body destruction during attachment; duplicate receipts; overlapping sources; pool saturation; pause; fractional time effects; rebase; sector exit; save/load; controller/trackpad parity; reduced visual detail without changed gameplay; visible but unsupported targets.

Do not call the physical primitive finished merely because one trajectory looks good. Test negative capability cases as carefully as successful combinations.
