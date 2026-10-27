# 06 — Linked shield pylons

**Outcome:** deploy one physical endpoint, deploy a second, and create a visible shield connection that blocks hostile ships and hostile weapons while allowing the player and permitted allies to cross and fire through it. Moving, attacking, overloading, or destroying the endpoints changes the tactical space. Planning only. Research prerequisite: R04. Interfaces: 01/02/03/05/07/08/09. Existing generic shield-emitter proposals are not proof this exact mechanic ships.

## Specify the actual fantasy

This is a **relation-selective shield**, not merely a geometrically one-way wall. The player and permitted allies can cross either way. Hostile ships and hostile attacks are blocked from either side. A front-face-only collider would not satisfy the request. Directional shields can remain a distinct later variant; do not silently substitute one.

The pair gives the player a temporary piece of controllable battlefield geometry: split a pack, protect a recovery, create a firing position, or channel enemies toward a mass-launch lane. It must not become a permanent invulnerability bunker or a way to erase every environmental consequence.

## Endpoint and pairing lifecycle

The first use previews and places endpoint A through the existing deployment/input owner. An unpaired endpoint is a visible physical device, not an unexplained protective bubble. The next compatible use previews endpoint B, the prospective segment, its current span, and any reason the connection would fail. Commit only if both endpoint positions and the connection are valid.

Pair identity is stable and explicit. Do not recalculate the nearest neighboring endpoint every tick. Deployment of a third endpoint starts the next pair, subject to the fitted capacity; it does not silently disconnect A from B. At capacity, offer a clear replace/recall choice or deny deployment. Do not destroy a working shield because the player inspected another location.

Candidate states are unpaired, linking, active, strained, overloaded/offline, recovering, and retired. Each state needs a meaningful rule and presentation, not another independent timer manager. A linking delay can prevent surprise collision geometry materializing inside a ship. Its duration is prototype tuning and must match the visible commit.

Preserve the economy/ordnance owner's charge consumption and refund rules. Preview and rejected placement spend nothing. A successful placement spends once, even if multiple input layers submit the same intent. Endpoints have stable lifetime-aware identity; pair references cannot attach to an unrelated entity that reuses an ID.

## Real bodies, bounded forces

Endpoints are destructible physical devices with visible load paths. Decide which deployment surfaces support attachment and which placements float freely. An attached endpoint reacts against an actual support through the existing attachment/physics authority; it is not an infinitely strong anchor created by a render transform.

A freely floating pair can be displaced. Its screen follows the actual endpoints and can stretch, weaken, or fail when its span/energy envelope is exceeded. Towing an endpoint is a useful manipulation, but moving a shield through a crowd must not inject unlimited kinetic energy through a kinematic wall.

Prototype the most compatible contact implementation against the repository's pinned physics backend. A physical force/impulse limit, endpoint recoil, or overload policy should bound the interaction. Do not claim a particular Rapier contact-modification API is available until the installed JavaScript binding and current physics abstraction have been checked. See R04.

Creating or reconnecting a panel through occupied space cannot teleport ships, crush them instantly, or forcibly move protected world actors. Use placement clearance, an honest warning/arming phase, and a deterministic refusal or overload response for invalid geometry. Existing projectiles or enemies already on the player's side remain there; shields are not retroactive damage erasers.

## One geometric fact across all attack paths

Represent the active gameplay footprint in the XZ plane with finite thickness and endpoint caps. The rendered panel must match its collision footprint at the normal camera. It can rise visually in Y, but it does not create a new 3D simulation.

A physical collider alone is insufficient: inspect the repository's separate projectile sweep, beam/ray, blast, chain, and field queries. Build a shared read of panel geometry and eligibility that those existing owners consume. Do not add a parallel damage engine.

For each applicable attack, determine the first actual intersection and route its accepted effect through the normal combat owner. A beam ends at the shield contact, a missile detonates at an accepted intercept point, and a stopped slug cannot also hit the target behind it in the same step. Exactly one owner debits shield energy and emits the contact receipt.

Continuous collision handling must cover fast projectiles and a moving segment, not just the endpoints sampled once per frame. Test near-endcap hits, glancing crossings, multiple panels, variable simulation load, rebasing, and a panel rotating across a projectile path. Broad-phase bounds may be conservative; the narrow phase must still make the same contact decision as the visible footprint.

## Permission matrix

Resolve allegiance through the existing relation/engagement contracts. Do not infer hostility solely from team-number inequality, and do not treat recent damage attribution as object allegiance.

| Encounter with an active panel | Proposed rule | Required clarification |
|---|---|---|
| Player or explicitly permitted allied ship | Pass in either direction | The panel is not invisible solid cover to its owner |
| Hostile ship | Block within available force/energy envelope | Heavy impacts may overload or displace the pair rather than stop infinitely |
| Neutral civilian | Pass unless an explicit lawful/mission policy says otherwise | Deploying a shield must not secretly declare war or imprison routine traffic |
| Owner/allied projectile or beam | Pass | Verify true source/attack ownership; a cosmetic color is not identity |
| Hostile projectile or beam | Intercept at first accepted crossing | Charge/damage/visual/audio all refer to that same intercept |
| Neutral loose debris | Physically blocked on either side by the default panel | Prevent unexplained selective immunity for arbitrary rocks |
| Explicitly controlled, owner-attuned launched payload | May pass as a declared tool interaction | Use a bounded actual control/attunement fact, not merely last-damage credit |
| Uncontrolled rock that the player bumped earlier | Still neutral debris | Damage provenance alone must not turn it into a shield key |
| Hostile explosion outside the panel | Shield occlusion evaluated along the actual blast path | Do not cancel a blast originating inside the protected region |
| Electrical propagation | A blocked cross-panel link cannot reach a protected target | Use existing chain/line-of-sight rules, not a new arbitrary damage multiplier |
| Persistent force field | Explicit field/shield coupling policy, with visible limits | A shield cannot advertise universal protection while a hostile weapon field bypasses it silently |

The last row is a research decision: determine which force-bearing weapon effects the panel blocks, attenuates, or does not claim to resist. Keep the baseline promise—hostile bodies and ordinary hostile weapons stop—while making any specialist exception explicit in both equipment text and telegraph. Do not introduce exceptions merely because one attack path was inconvenient to integrate.

Projectile ownership must be stable through the attack lineage. A ricochet off player scenery does not automatically make an enemy bullet friendly. Actual capture/conversion can change allegiance only through its authored owner. If faction relations change while a projectile is in flight, choose and document the existing engine's intended snapshot/live policy and apply it consistently across beams, missiles, and physical payloads.

## Costs and tactical counterplay

Use a meaningful combination of finite lifetime/charge, damage capacity, span-dependent load, endpoint vulnerability, and recovery. The exact balance is measured, not fixed by this plan. Avoid five redundant meters: the player should understand one primary shield resource and the most relevant failure cause.

Longer spans should have an observable tradeoff. Heavy impacts should look and sound heavier. Sustained weapons can strain the pair, and an overloaded segment should announce collapse before or at the authoritative failure rather than remain visibly solid after it stops blocking.

Enemies can flank an exposed end, shoot an endpoint, pressure the resource, or disengage and re-form. They must learn about an observable shield through their sensor/obstacle path; the director must not grant omniscient knowledge of hidden pylons. A formation encountering a new panel should choose a coherent route instead of every ship oscillating independently against it.

A shield and attractor form a positional combination, not a scripted bonus: collect matter beside a barrier, shelter while preparing a throw, then launch through an intentionally permitted channel or move an endpoint to release the trapped mass. An opponent may reverse the setup by destroying the support. Design the scene so the interaction has an escape and a failure mode.

## Presentation and input

The preview shows the proposed actual segment, not a broad circular bubble. Active panels should leave ships, trajectories, and endpoints visible through them; do not fill the screen with opaque glowing rectangles. Frame the endpoints strongly enough that the player knows what to attack or manipulate.

Contacts generate localized deformation/impact light at the actual hit. Strain travels toward the responsible endpoints; overload, recovery, and loss have distinct cues. Reduced-flash mode preserves contact location and shield availability without repeated full-panel strobing. Actual local illumination shares the existing Look/light pool; a shader is not a license for unlimited extra lights.

Pair selection, recall, replacement, and movement must use existing input/interaction patterns after the binding census. The tooltip names the next operation: place first endpoint, link second endpoint, inspect pair, or capacity reached. Do not overload an unlabelled TOTEM action with a collector, shield, and offensive turret.

## Lifecycle and acceptance

Pair teardown is atomic on endpoint destruction, expiry, invalid world membership, and explicit recall. No orphan panel may keep colliding after its emitter is gone. Save/Continue preserves or deliberately resolves the authoritative pair state, energy, ownership, and endpoint attachments; it never restores a free full-strength shield or a dangling reference. Renderer loss/restoration cannot change collision behavior.

CEC-D tests every permission row from both directions, with moving endpoints, low energy, a heavy hostile ram, neutral traffic, mixed weapon families, a launchable aggregate, and a target behind two overlapping panels. Include failed deployment, occupied-span linking, target lifetime reuse, relation changes, docking/death/load/sector transition, and repeated teardown.

Closure requires a player to place the pair without instruction from the developer, identify who can cross it, use it to reshape a fight, recognize its failure, and understand how the enemy countered it. A luminous line between two objects is not completion.
