# Living VFX — implementation and review receipt

2026-10-12. Presentation-only candidate; no damage, targeting, economy, save format, or simulation
force changes. This extends the existing owners rather than adding a parallel effects engine.

## The failure being removed

The old shared `ForceParticleFlow` recalculated position from normalized age. A collision could alter
one displayed pose but the next update reconstructed the unperturbed curve. The primary deployed
fields also depended on periodically deformed fixed paths, with dim thin working material beneath
relatively legible boundaries. Increasing bloom alone would amplify both problems.

The replacement has two deliberately different layers. Actual bounded material parcels integrate
velocity and preserve contact history. The continuous force surfaces retain their authored silhouettes,
but material travels through those surfaces, tears, shears, cools, and releases independently. A laser
is not made into a vortex merely because a vortex looks energetic.

## Shared architecture

`src/render/vfx/livingVfxCatalog.js` is the material vocabulary and family-owner review map. Its first
ten numeric recipe codes preserve the shipped adapter ABI. Six additional recipes distinguish
ballistic, shield, coherent, propulsion, mineral and pickup material. Coherent muzzle and propulsion
retro admissions are wired in this change; the other additional recipes are available to existing
owners, not a claim that every original owner has been replaced.

`materialFlow.js` integrates emitter-relative particle position and velocity in bounded 1/120-second
substeps. The curl of smooth scalar potentials contributes secondary motion; family-specific transport
retains the identifying inward/outward/axial/ballistic/adhesive verb. Ten real poses sampled at 60 Hz
form a curved mesh wake. A velocity deflection changes subsequent positions instead of disappearing
on the next frame. Noise is event-seeded and consumes no simulation RNG.

`materialEnvironment.js` snapshots up to eight published fields from a bounded 32-record scan and
samples the existing `fieldRawAcceleration` kernel. Free cosmetic material responds to those fields;
bonded repair/transfer/gel/coherent work remains on its real substrate or endpoint. Field acceleration
is capped by the existing `FIELD_MAX_ACCEL`. These are cosmetic acceleration samples, not a second
physics simulation or fluid solver. Coupling/viscosity and body gameplay impulses are not redefined.

`materialDirector.js` registers the existing pools per scene and exposes their combined occupancy and
strongest actual particle contact. One low-priority request competes inside the existing six-light
budget. There is no new particle pool, per-particle light, postprocess pass, or private animation loop.

`livingMaterial.glsl.js` shares filtered, advected material structure across the swept surfaces,
projectile bodies, shield surfaces, energy materials, reactor rupture and nozzle chamber. Shapes,
contact rules and lifecycle timing remain owned by their existing production presenters.

## Category coverage and protected distinctions

| Category | Changed path | Distinction deliberately preserved |
| --- | --- | --- |
| Well / Seed / Repulsor / Cone / Skim | Shared retained material, field surface transport, uneven intake channels, denser bounded emissions | Real footprint, zero-target animation, inward vs outward vs axial flow; release removes force boundaries immediately |
| Bombs and reactive payloads | Existing bomb owners inherit shared swept material and retained particles | Each payload's warning, resolve and aftermath; connected gel does not become a neon shockwave |
| Weapons | Energy bolt body shader, discharge surfaces and coherent muzzle material | Distinct bolt geometries, axial travel, real hit endpoint, ballistic debris |
| Shields | Traveling panel load replaces uniform breathing | Surface-local contacts, segmented ribs, clear panes, no permanently opaque glowing bubble |
| Explosions | Reactor material shear and density; shared heat transport | Mineral cleavage, armor tearing, reactor rupture, fuel secondary ignition, solid fragments |
| Propulsion | Nozzle chamber turnover, stable raymarch jitter, propulsion retro recipe | Long recorded world-space exhaust and distinct nozzle-local thrust remain intact |
| Induction | Shared current parcels and discharge surfaces | Connected branching junctions, not a purple gravity spiral |
| Repair / transfer / docking / pickups | Existing action and station owners inherit transport and cooling | Real body/socket anchors and clean completion; not an invented successful action |
| Status / deposits | Existing status-matter flow owner receives collision memory | Attached material, substrate return, no harmful-looking unearned blast |
| Massline / tethers | Common energy-volume material where used; audit retains specialized ribbon owners | Both authoritative endpoints, tension and retained momentum; specialized cable/ribbon geometry is not rewritten |

The shared transport is used by eight existing production owner modules. This is a cross-system
upgrade, not eight new render pools. Specialized owners already doing the right thing are retained.
The owner inventory in the catalog is checked against actual files, not a speculative roadmap.

## Environment and lifecycle details

Each emitted parcel snapshots at most three nearby body records. Contacts use relative swept-circle
motion in the game's XZ playfield, with different sliding, rebounding and adhering responses. Body
velocity is extrapolated over the short parcel lifetime. This is not triangle-exact collision against
an accelerating deforming mesh. It is bounded and read-only. New emissions receive fresh snapshots.
An initial overlap resolves before the first draw. If a solid body and a field footprint leave no
valid space, decorative material is suppressed rather than shown inside rock or outside the force.

Release stops new powered supply. Surviving material keeps its own transport and cooling; it does not
play ignition in reverse. Reduced motion freezes the adjusted pose while finite lifetimes still
retire. Reduced flash removes contact-light requests. Rebases move origins/contact snapshots while
leaving local integrated history unchanged. Reset empties GPU draws; disposal removes registry entries.

## Costs and limits

The retained flow remains one instanced mesh batch per existing owner. Particle state is 64 Float64
values plus the existing descriptor/contact storage. GPU history adds three compact instanced
attributes, not individual meshes. The field presenter keeps its existing 360-parcel and 224-surface
capacities. More frequent admissions replace sparse old admissions but cannot grow those pools.

Added integration and shader structure have a real CPU/GPU cost. No hardware FPS improvement is
claimed. Empty pools sleep; admissions drop at capacity; lower quality still uses the existing owner
budgets. Shipping iPhone and integrated-GPU frame-time/overdraw profiling remains a merge review
requirement, especially overlapping fields and explosions. More color is not permission for less
readability or a slower mobile game.

## Reproducible checks

```
node --test test/living-vfx.test.mjs
node scripts/living-vfx-verify.mjs
python scripts/living-vfx-capture.py --kind well --kind repulsor
python scripts/capture-vfx-gameplay-demo.py --scenario well --scenario repulsor --scenario reactor-breakup --video
```

The first command adds 26 regression tests: curl continuity and divergence, retained perturbations,
30/60/120-Hz agreement, history/rebase/reuse, swept moving contacts, first-frame overlap, contact
lighting, scene ownership, real field-kernel parity, scene isolation, strength/footprint rejection,
bonded endpoint protection, runtime wiring, pool saturation, pause and idle uploads.

The focused gate runs 158 tests across 12 files and bundles the production VFX and plasma-stream
entry points. Both bundles are compile checks, not shipping bundle size claims. Do not infer GLSL
correctness or visual quality from JavaScript bundling alone.

The broader VFX selection ran 398 tests: 392 passed and six failed. Those same six failures were
reproduced after restoring the changed source files to the untouched baseline. They are recorded
rather than hidden by reintroducing deprecated sprite effects or weakening unrelated tests:

| Baseline test file | Existing failure |
| --- | --- |
| player-plume-event-light | Live bridge mock lacks a retained NPC record |
| player-plume-event-light | Accessibility expected zero vs nonzero steady cue |
| vfx-color-light-director | Graze preset decay lies outside the old assertion |
| vfx-death-sizing | Kill-handler mock lacks a usable sprite slot |
| vfx-material-aftermath | Collection assertion expects an obsolete feedback path |
| vfx-priority-admission | Explosion assertion expects an old sprite admission |

The one changed material-source assertion describes the new moving-density shader; the deleted
reciprocal-alpha gain is intentionally not retained. Browser evidence remains necessary.

Offline captures use the production field adapter and real shaders in the existing diagnostic scene,
with bloom off, source hashes, temporal canvas frames and shader error logs. That scene is not the
shipping asset scene and is not full-game acceptance. The separate gameplay-demo capture uses the
released Kestrel, asteroid and Colossus render packages. Review those artifacts and a real gameplay
pass before merging; neither software-rendered diagnostic timing nor a successful screenshot proves
mobile performance, complete interaction coverage, or final art approval.
