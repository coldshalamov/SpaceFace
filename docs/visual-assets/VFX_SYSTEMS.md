# VFX runtime systems — current map

**Status:** engineering map, 2026-10-25. The visual acceptance bar remains
[`VFX_TECHNIQUE_STANDARD.md`](./VFX_TECHNIQUE_STANDARD.md), and the forced lifecycle remains
[`VFX_LIFECYCLE_STANDARD.md`](./VFX_LIFECYCLE_STANDARD.md). This page is the quickest route to the
live owners when adding a weapon, power, status or world event.

## One pipeline

```
authoritative gameplay receipt
  → family/verb classification + stable seed
  → bounded admission (existing pool capacity, priority, accessibility)
  → specialized renderer (surface / bolt / volume / cable / thruster / solid debris)
  → pooled HDR light through VFX color/light director
  → renderer bloom + tone mapping, never a CSS filter or screen-space glow substitute
  → cooling, residue, termination
```

The simulation is read-only. VFX may consume a receipt, never invent damage, force, contact or a
successful action, and never write `entity.data`.

## Shared owners

| Stage | Live owner | What it owns |
|---|---|---|
| Receipts | `src/core/eventBus.js`, registered systems | What happened, both actors, contact axis, measured consequence |
| Family vocabulary | `src/render/forceLanguage/catalog.js`, `src/render/vfx/livingVfxCatalog.js` | Force family, verb, material and silhouette vocabulary |
| Shared event carrier | `src/render/vfx/runtime/eventGeometry.js`, `eventMaterial.glsl.js` | Closed three-lobe volumes for flashes, combustion, pressure and rupture; designed folds, dark cavities, HDR crests |
| Field picture compiler | `src/render/vfx/runtime/forceRecipe.js` | Turns deployed-field descriptors into local layered bands with a quiet measured perimeter |
| Surface pool | `src/render/forceLanguage/sweptSurfaceBatch.js` | One instanced folded-surface draw for fields, muzzle/contact matter and action answers |
| Field presentation | `src/render/forceLanguage/fieldForcePresentation.js` | Well, Repulsor, Cone, Skim and Seed lifecycle, contact response and body-local aura parcels |
| Carried energy | `src/render/weapons/energyBoltPool.js`, `ribbonPool.js`, `projectileGeometries.js` | True 3D bolts, wakes, family cross-sections and analytic transport |
| Beams | `src/render/combat/persistentBeams.js` | Two-layer core/sheath, travelling structure and a work face at the authoritative contact |
| Destruction | `src/render/combat/explosionRupture.js`, `phasedExplosions.js` | Mineral, armor, reactor and fuel phase grammar and solid breakup |
| Impact/contact | `src/render/forceLanguage/weaponDischargePool.js`, `weapons/heavyImpactVfx.js`, `combat/arcadeStructuralFx.js` | Family contact beats, heavy structural consequence, scorch and spall |
| Particle matter | `src/render/vfx/quarksSystem.js`, `forceParticleFlow.js` | Bounded debris, sparks, gas/combustion and field parcels; no new particle engine |
| Materials / diagnostics | `src/render/vfx/materialDirector.js`, `materialEnvironment.js` | Combined occupancy, strongest actual contact and one shared contact light |
| Lights | `src/render/vfxColorLightDirector.js`, `src/render/weapons/weaponLights.js` | Six event lights + two weapon lights; presets are the only identity table |
| Post | `src/render/bloom.js` (default present) | Selective bloom and tone mapping. VFX must read without it |

## Family expectations

Each family must carry a distinct **shape, motion and consequence**; color only reinforces them.
The light row is also part of identity, but it never replaces the shape.

| Family | Read at the chase camera | Light / feedback |
|---|---|---|
| Kinetic / machined | Breech kick, solid slug, directional spall, metal heat; debris is lit, not emissive | Brass-white muzzle, hard orange-white contact, weapon-light slot, camera answer owned by `feel.js` |
| Concussive / pressure | Bowed compression fronts, open shoulders, target displacement; never a generic ring | Warm pressure light across the impacted body and nearby matter |
| Coherent / energy | Split aperture or latched jaws, collimated packet and a truthful work face | Cyan-white core, tight sheath, endpoint light only where the ray actually stopped |
| Thermal / propulsion | Hot throat, rolling convection lobes, cooling residue | Orange-white source and contact; heat is carried by moving folds |
| Induction | Branches that meet real contacts, travelling charge, extinguished junctions | Violet-white junction flashes; no purple gravity spiral |
| Metric / gravity / telekinesis | Concave intake or convex pressure around a real body; body-local aura motes when matter is held | Field color on hulls, one sustained field light, one shared contact light at the affected body |
| Reactive matter | Adhesion, spread, porosity and residue on the actual receiver | Local reaction light; no explosion unless the receipt says so |
| Massline / cable | Both endpoints, tension, travelling load and retained body momentum | Core/sheath colour change at the loaded line, local endpoint light |
| Solid matter / cargo | Opaque lit body, silhouette, tumbling and material identity | No halo as the object; contact light supports it |

## Hit-reaction chain

Every confirmed contact should answer in this order, within one or two frames:

1. **Contact truth** — the real surface point, normal/approach, target and receipt.
2. **Contact light** — the authored family light through the event or weapon pool.
3. **Contact geometry** — family fan/slit/ribs plus one short reflected ping on an
   unshielded hull. The ping is presentation; it never claims a damage bounce.
4. **Physical answer** — solver impulse/torque and the one hitstun law; concussive loads
   cross the tumble threshold, while lighter hits still produce a visible hull rock.
5. **Visual answer** — `shipMicroMotion` hull roll/pitch/yaw and local contact yield. The
   weapon family sets the multipliers: concussive > explosive > kinetic > thermal >
   induction > coherent. The player's authored heading is never replaced.
6. **Aftermath** — cooling marks, residue, debris or a status that outlives the flash.

If any stage is missing, the action reads as a sticker rather than an event. If any stage
invents force or damage, it is a bug even when it looks good.

## Adding a family

1. Read the receipt and name the family and verb. If the event does not exist, build the gameplay
   receipt first.
2. Choose an existing renderer from the table. A new pool needs a measured reason and must register
   with `materialDirector`; it does not get a private frame loop or light budget.
3. Author silhouette and motion before color. Use closed volumes or folded surfaces, not
   `THREE.Points`, `THREE.Sprite` or a camera-facing glow card as the designed object.
4. Put the light request in the director preset table. Use the existing event/weapon pools; never
   create a point light per particle.
5. Provide ignition, sustain (including no targets), contact/consequence and cooling. Show the
   affected body and the direction of force.
6. Preserve pause, floating origins, reduced motion/flash and target-bound cleanup.
7. Add the focused contract test and inspect the real chase-camera lifecycle. A static thumbnail is
   not evidence.

## Rejected shortcuts

- CSS blur/glow/filter pretending to be light, including a pixelated full-screen bloom layer.
- A universal soft disc or ball for unrelated effects.
- More particles, larger bloom or screen shake as the only answer to weak feedback.
- A second renderer, particle pool or point-light pool for one family.
- Escaping pool capacity by silently deleting a contact while keeping the decorative part.
- Claiming a still image or a green check proves the picture.

## Verification

```sh
node --test test/vfx-modern-runtime.test.mjs
npm run check:vfx-force-language
npm run check:vfx-sleep
npm run check:vfx-techniques
python scripts/capture-vfx-gameplay-demo.py --all --output .devshots/vfx-review
```

Open the native-resolution frames and motion. A capture is a working tool, not an acceptance
verdict. The binding gameplay route is `npm run player-truth -- --mode=<mode> --gate`.
