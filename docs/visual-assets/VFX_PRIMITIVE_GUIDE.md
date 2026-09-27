<!-- LIFETIME: STABLE -->
# Composing SpaceFace effects

The purpose is to make force, work, and consequences visible. An effect starts at an actual
port, contact, material surface, or field source; it transports something; the receiving
body answers; the supplied material cools or separates after supply stops. A bright object
that grows, rotates, and shrinks is not a substitute for that sequence.

Use this with [the technique standard](VFX_TECHNIQUE_STANDARD.md),
[lifecycle standard](VFX_LIFECYCLE_STANDARD.md), and
[continuous gameplay lab](VFX_LAB_WORKFLOW.md).

## The common material vocabulary

`src/render/vfx/actionPrimitives.js` supplies six analytic, filtered cross-sections through
`ActionPrimitiveComposer`. All share the existing `SweptSurfaceBatch` upload owner and
`ForceParticleFlow` parcel owner. They do not introduce six render engines or six texture atlases.

| Primitive | Construction and motion | Suitable use |
| --- | --- | --- |
| Compression | Open rolled exhaust folds, uneven downstream sections, a separately loaded throat | Ignition, venting, hot ejection, short singularity inlets |
| Connection | Closed elliptical conductor with a dark lumen and independently travelling packets | Transfer, loaded line, field hitch, induction paths to real receivers |
| Deposition | Broad lenticular patch, raised seam, unequal rim, local travelling reaction | Repair, grinding, cooling, goo, corrosion, thermite adhesion |
| Pressure | Bowed standing front with depth, folded skirt, independent front travel and tearing | Shoves, concussion, expulsion, cryo/kinetic response |
| Induction | Branching prismatic channels with a diamond section and delayed forks | ECM, disruption, optical contact, command transmission |
| Capture | Opposed angular hooks, staggered closure, late material bridges, tangential unloading | Net catch, arming, priming, charge attachment |

Weapon heat and Well lensing use the existing `DistortionField` producers. The default bloom
compositor consumes the presenter's retained producer array, skips the pass when both are idle,
and composites the same encoded offsets as the optional render graph. Use that owner and its
accessibility controls; adding a field to the scene alone does not bend the rendered background.

The primitive is a physical construction, not an event recipe. Multiple primitives may coexist
inside a recipe. For example, a concussion uses distinct receipted shove directions; thermite
throws hot matter and deposits it on actual victims; an anchor bomb establishes loaded
connections to its hit list and places clamps at those bodies. Changing orange to blue does
not create a new family.

Large and continuous effects keep their dedicated owners:

| Owner | Use |
| --- | --- |
| `forceLanguage/fieldForcePresentation.js` | Well, seed, repulsor, cone, and sheet flow; nearby-body diversion |
| `forceLanguage/bombFlowSurface.js`, `bombPresentation.js` | Bomb warning and sustained gravity/viscous matter |
| `vfx/statusMatterVfx.js` | Hull-attached burning seats, viscous residue, signed momentum stress; authoritative status cutoff |
| `vfx/bombDetonationVfx.js` | Eight payload-specific releases, real hit contacts, collapse and interruption |
| `combat/explosionRupture.js`, `combat/phasedExplosions.js` | Material-specific rock, armor, fuel, reactor, and capital rupture |
| `weapons/presenter.js`, `forceLanguage/weaponDischargePool.js` | Muzzle, projectile body/wake, and weapon-specific impact |
| `combat/persistentBeams.js`, `toolConduit.js` | Sustained coherent beams and working conduits |
| `thruster/systems/plasmaStream.js`, flight history owners | Actual nozzle flow and recorded path history |
| `forceLanguage/emergentPrimitivePools.js` | Current, pressure, deposited gel, optical matter |

Use the existing Three.js, Quarks, geometry pools, derivative-filtered analytic materials,
and released models. An extra editor or engine is justified by a missing production capability,
not by an attractive demo. Any imported asset/tool still needs the license and runtime-cost
record in [open-source intake](../OPEN_SOURCE_INTAKE.md). Physical ship separation and collision
fragments remain the physical destruction owner's responsibility; do not spawn competing hulls.

## Add a real action response

Find the simulation publisher first. Write down its exact event payload, when it is emitted,
which entity owns it, and whether it proves success, anticipation, interruption, or expiry.
Never infer a successful hit from a button press or paint extra force radius/damage.

For a short receipted response, add a plain recipe to
`src/render/vfx/actionEventRecipes.js`. `ActionVfx` normalizes it once and the production
`vfx.js` subscription table automatically subscribes to the exported event list.

```js
'existing:confirmedReceipt': {
  verb: 'repair',
  primitive: 'deposition',
  color: 0x84ffd2,
  life: .7,
  continuous: false,
}
```

The additional native events cover countermeasures, charge attachment/arming, snare/reel/catch,
inertial shunts, volatile cargo contacts, cloak transitions, optical contacts, and beacon deployment.
The `worldCueRecipes.js` whitelist also consumes 14 formerly empty normalized survey, drill,
capacity, seam, and heat cues. Unknown semantic cues remain with their existing owners.

Use `variants` keyed by the receipt's `kind` when construction actually differs, as chaff,
ECM, and decoy do. Use `resolveAdditionalActionVfxReceipt(name, receipt, state)` only to map
known receipt identities and authoritative state into presentation anchors. It must not mutate
simulation, query hypothetical collisions, or add a generic player fallback.

For a complex composition, own a bounded retained slot pool and reuse the composer. A slot
retains world-frame origin, source, rotation, radius, birth, seed, color, and recipe lifetime.
`composer.render(slot, simTime, reducedMotion, reducedFlash)` draws the standard recipe.
For bespoke combinations, set `composer.slot` then call `composer.piece(...)`; see the eight
bomb recipes for complete examples. The piece arguments describe cross-section, origin,
heading, longitudinal interval, width, height, bow, side offset, pressure radius, phase,
opacity, material arrival, supply cutoff, and heat. Do not encode a second gameplay boundary
in decorative reach. Keep a separate inspectable gameplay range.

## Origin, scale, and environment

1. Prefer the actual named model socket. Preserve its rotating local offset; a port isn't a
   fixed point in world space. Use measured model-truth ports when the scene object is absent.
2. Preserve a receipted contact exactly. Explicit `attachToTarget: true` converts that point
   into a rotating local offset; otherwise it remains the world snapshot that was published.
3. If the event names only a body, use a bounded body-facing surface approximation and call it
   that in diagnostics. It is not a mesh-triangle contact. A shunt receipt has no manifold point.
4. Use the true source field, owner, or emitter; never borrow the player for an NPC effect.
   Player-only publishers are explicitly resolved by event type. Chaff/decoy use `cm.effect`
   diversion coordinates, because the receipt's x/z identifies the hull centre.
5. Derive size/direction from the body, receipt, port, velocity, or force direction. A seed changes
   curl, timing, asymmetry, and secondary paths; it must not change what the action communicates.
6. Keep primary force boundaries readable. Environmental diversion is decorative. A local hot
   seam or wet deposit may respond to a known neighboring body without implying new damage.

## Choreography

Author a source, transported material, a receiver response, and remaining matter as separate
parts. Start them at unequal times. Give secondary responses a cause: converging channels,
contact, accumulated load, ruptured restraint. Their speeds and lifetimes should differ.

The source may stop sharply; matter already emitted should continue. A repair seam cools in
place, a severed conductor separates along the cut, a pressure front sheds its skirt, and a
vent leaves slower parcels downstream. Do not reverse an onset scale curve for dismissal.
Seeded detail must remain stable during a run, with time supplied by `state.simTime`.

Use a substantial translucent body, dark internal separation, and limited HDR crests. The
silhouette must work without bloom. Filter unresolved detail with screen derivatives. Avoid
full-bright blocks, periodic visible noise cells, default radial spokes, and camera-facing
puffs as the shape of an object. At flight distance, a strong local contour matters more than
hundreds of tiny particles.

## Runtime contract and practical acceptance

- Retain slots and scratch buffers; no allocation per presented frame. Coalesce repeated work
  receipts by real target. Bound surfaces, contacts, parcels, and simultaneous instances.
- Idle owners do no work. Precompile the exact runtime program in the existing cook; bombs
  and actions share the action program and need no duplicate shader warmup.
- Keep seed generation cosmetic. Never consume simulation RNG. Pause freezes motion; rewind
  clears stale instances; rebasing moves rendered data without changing world anchors.
- Reduced motion preserves a stable readable construction. Reduced flash lowers radiance;
  neither setting should fabricate, hide, or change a gameplay success state.
- Clear at sector/save/new-game boundaries and dispose buffers/materials through the existing
  renderer owner. Let already-issued finite residue retire when an action ends.
- Add a fixture using the real receipt shape to the lab. Run the entire onset, active period,
  interruption/expiry, and empty aftermath at **60 captured frames per simulated second**.
  The lab runs slower than real time on software GPUs; encoded frame rate is not runtime FPS.
- Watch the sequence as motion and inspect neighboring frames at cuts and contacts. Check
  normal flight scale first, then close view, another seed/context, and accessibility where
  the changed construction requires it. Do not approve an effect from its brightest still.
- Use focused checks for route wiring, anchoring, bounded pools, pause/rebase, and cleanup.
  Tests establish those contracts; visible craft is judged from the captured sequence.

The compact capture manifest and timeline are the review entry points. Keep native frames
inside continuous MP4 chunks by default; retain all PNGs only for a specific temporal defect.
Future events should extend this vocabulary and catalog, rather than beginning another
parameter-only redesign of a generic effect.
