# Visual Asset Production Standard

## 1. Purpose

This is the production contract for authored real-time assets. It separates three proofs:

- **technical validity**  -  source/export/release files are structurally correct and load;
- **performance validity**  -  the exact candidate fits a measured representative scene;
- **visual acceptance**  -  the exported runtime result communicates its role with professional form,
  construction, surface response, hierarchy, stability, and presentation.

All three are required. A script may prove technical facts. It may not grant artistic acceptance.
Quality is observed from the exact exported candidate in representative lighting and the normal
player route. Modifier count, node count, triangle count, number of passes, and confident prose have
no acceptance value by themselves.

## 2. Production states

- `blockout`  -  scale, occupancy, sockets, and broad silhouette. Primitives and temporary materials are
  allowed only with honest classification.
- `design_candidate`  -  distinctive role, orientation, primary masses, negative space, and construction
  logic are proven in neutral views and the real camera.
- `production_model`  -  final macro/meso geometry, intersections, edge language, topology, shading, and
  transforms are stable enough for deliberate UV/bake work.
- `bake_candidate`  -  final UVs, tangent basis, map transfer, cage/rays, padding, and exported map
  assignments are proven clean.
- `surfaced_candidate`  -  physically coherent, mesh-aware materials survive neutral and adversarial
  lighting and the actual renderer.
- `integration_candidate`  -  authored LODs, metadata, sockets, states, compression, exact runtime load,
  normal-route evidence, and representative performance pass.
- `accepted`  -  every applicable gate passes and required independent review is recorded against the
  exact candidate hash.
- `blocked`  -  a named dependency prevents the next proof. It is not completion.
- `deprecated`  -  intentionally removed from production use.

No Tier A/B asset may self-promote to `accepted`.

## 3. Tiers and severity

Tier A covers hero/player/marketing/major-landmark assets. Tier B covers prominent repeated ships,
station modules, and signature equipment. Tier C covers supporting modular assets. Tier D covers
distant/repeated set dressing. Tier changes proof burden, not style.

- P0: corrupt, unreachable, wrong identity/orientation, catastrophic visual/performance/provenance issue.
- P1: acceptance blocker such as primitive construction, unreadable role, toy/clay surface, bake
  artifacts, generic noise, major LOD pop, or unjustified cost.
- P2: local polish defect.
- P3: optional refinement.

No P0/P1 may remain at acceptance.

## 4. Governing craft principles

### Camera first

Define supported camera states and projected-size bands before deciding geometry or texture detail. A
silhouette defect cannot be repaired by microtexture. A detail invisible at every supported view does
not justify runtime cost.

### Macro -> meso -> micro

- macro: silhouette, proportion, direction, negative space, dominant masses;
- meso: frame/shell relationships, bays, armor, access, engines, tools, payload, cooling, service;
- micro: fasteners, labels, scratches, coating texture, shallow seams.

Never use micro detail to camouflage unresolved macro/meso work.

### Manufacturing and service logic

The mesh should imply how the object is assembled, loaded, cooled, opened, repaired, protected, and
replaced. Delete decoration that does not support function, scale, identity, history, or composition.

### DCC defaults have no authorship value

No visible surface may inherit its artistic identity from Blender defaults, a donor material, or an
unchanged Principled BSDF merely because the software produced something renderable. Before any
modification to camera-visible 3D form or surfacing, complete a material-truth preflight. Inventory
the asset zones relevant to the candidate. Every zone visible in a supported review camera must be
`billed`, `retained_reviewed`, or `blocked`. `outside_supported_view` is valid only when the zone is
absent from every supported review camera (`supportedViews: []`); it cannot classify a visible or
dominant region. Tier A/B work records individual components; Tier C/D may group one repeated
manufactured family. A compositionally quiet plate may be `retained_reviewed`, but “quiet” is not a
status and cannot mean unexamined donor/default material. Each billed zone records:

- physical substrate;
- manufacturing or forming process;
- coating, treatment, or intentionally bare finish;
- attachment/interface to neighboring parts;
- expected optical response by scale and lighting;
- heat, abrasion, contamination, maintenance, and marking history;
- forbidden reads such as plastic toy, clay blockout, rubber/leather when not actually specified.

“Metal,” “hull,” “mechanical,” a material-slot name, a color, or a roughness number is not enough to
resolve material identity. If a default or inherited shader response survives because no one made
and reviewed these decisions, that is a P1—not a neutral starting point. The bill covers changed
camera-visible work; it is not universal release paperwork for `outside_supported_view` zones.
`retained_reviewed` records why an unchanged zone already supports the accepted visual premise;
`blocked` keeps whole-asset G1/G2/G4 open. Any inherited or untouched zone that dominates a supported
whole-asset view remains inside the whole-asset P1 veto.

Use one exhaustive visible-zone register rather than independent optional lists. Every row names its
supported views, whether it dominates one, its disposition, and its bill or retained-review
evidence. `allSupportedViewZonesClassified` remains false until the reviewer confirms that every
camera-visible zone is present; false or missing blocks whole-asset G1/G2/G4.

### Primitive and shape-grammar accountability

Boxes, cylinders, cones, toruses, and planes are valid blockout or manufacturing inputs, not automatic
finished components. The preflight inventories primitive-derived camera-prominent forms. When one
survives into a changed zone, a shape-grammar audit is mandatory before G1/G2: identify the primitive
or repeated family and its function, scale, manufacturing rationale, interface, and transformation
into final form. An unexplained perfect tube, floating bar, repeated rectangular “chiclet,”
decorative hoop, or uniformly beveled slab remains blockout construction even when it has textures,
scratches, or a plausible object name.

### Blender anti-toy implementation controls

For every billed changed zone, begin with a manufactured section and assembly sequence—not a software
primitive. Name the rolled or faceted case, folded hat section, plate shell, hollow bell,
gusset, saddle, clevis, flange, service line, aperture, access cover, or pressure vessel that the
primitive is being transformed into. Then model its interfaces, wall thickness, negative space, load
or service path, and transition into the neighboring structure.

The fail-closed technique list, Blender session order, and per-candidate ledger are
[`ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`](./ADVANCED_MODEL_TECHNIQUE_CONTRACT.md). A remaster that
skips that ledger, or that ships a lofted primitive stack with a tinted shared sheet, has not
done the form or surfacing work this standard requires.

Use a deliberate size hierarchy:

- macro forms preserve the existing asset identity and role;
- meso forms explain construction, attachment, access, cooling, and replacement;
- micro forms explain fasteners, seams, clamps, ribs, shutters, and service lines.

Do not make every detail a metre-scale block. More objects or triangles do not repair a missing scale
hierarchy.

Review what the supported camera sees, not what the outliner calls the object. Naming a long blank
bar `RecoilBeam`, a slab `Mantlet`, or a cuboid `ServicePack` does not transform its visible
cross-section. Camera-prominent housings need section changes, edge breaks, mounting transitions,
openings, and smaller interfaces. If a design claims an open machinery bay, the render must expose
the receiver, bearing/trunnion, recoil device, load frame, fasteners, and rooted service paths rather
than hiding them behind decorative plate walls.

Preserve manufactured edge behavior. Do not apply unconditional smooth shading to folded sheet,
machined facets, segmented clamps, plate edges, or ceramic throats. Record a smooth-by-angle or
equivalent hard-edge policy, inspect it under hard grazing light, and validate the mesh before glTF
export. Over-smoothed normals can make correct geometry read as soap, rubber, or molded plastic.

Surface grammar must match the component and its UV scale. A generic plate grid, leather-like bump,
or large tile noise projected across a machined receiver, rolled hot jacket, nozzle bell, cable, or
ceramic throat is a material error, even when the image is technically a valid base/normal/ORM set.
Apply plate seams only where plate construction exists. Let modeled clamps, stringers, joints, wall
thickness, and cavities describe assembly; use substrate-appropriate microstructure for the
remaining response. Reject visible texel/block scale that substitutes for modeled construction in a
supported close view. Procedural corner studs or plate fasteners belong only to actual plate roles;
receivers, hot sections, cable hardware, and refractory assemblies require modeled fasteners at
their real interfaces.

Recess emissive surfaces inside a fixture, slit, aperture, instrument, or throat. The component must
still explain its function with emissive disabled; a bright disk or glowing torus is not a substitute
for a reactor, sensor, or thruster assembly.

Render review evidence from the exact finalized uncompressed source GLB, not only the mutable Blender
scene. Bind each image to the source hash and registered renderer hash; reject historical,
unversioned, or mixed-source evidence. A pass fails while any prominent component is still best
described as a tube, box, torus, glowing disk, or smooth lump rather than by a fabricated part and its
interfaces.

A pre-finalize render may reject geometry, framing, or component construction, but it cannot close
G4. Keep its receipt ineligible, run the actual surface/finalization path, and rerender the exact
post-finalize source. The material pipeline must also fail closed when an authored material name
does not resolve to its declared physical role. A `RepairPrimer` slot classified and generated as
generic hull steel is not material truth merely because both paths emit valid PNG/KTX2 data. A
receipt-only shortcut may not relabel existing images with a new source or producer hash. Eligible
evidence requires a complete exact-source rerender.

### Component-first generated-reference loop

When DCC blockout vocabulary is constraining design, one useful repair method is to isolate the exact deficient component from an
authoritative screenshot or source render and generate a reference for that component—not a
replacement beauty image of the whole asset. The prompt must preserve the component's footprint,
orientation, role, interfaces, and identity while naming its substrate, manufacture, finish,
fasteners, service access, load path, and forbidden reads. Prefer a sheet with three-quarter,
orthographic, exploded, and material/interface views.

For a remaster, record a frozen identity contract before generation: silhouette envelope, component
footprint, orientation, attachment points, sockets, neighboring clearances, runtime role, and useful
existing work that must survive. The exact deficient-component crop is required by default. When a
crop is genuinely impossible, record the reason; a text-only study may inform construction, but it
cannot satisfy reference-quality parity or authorize a gate pass.

Generated imagery remains reference-only. Record its prompt, tool, source capture, hash, selected
traits, rejected traits, and asset-specific resemblance target. Translate the approved manufacturing
logic into editable geometry and authored materials; do not project the image over a primitive and
call the component resolved, and never infer authoritative normal/AO/ORM data from the generated
pixels. Review the rebuilt component beside the reference in material and textureless/clay views.

Reference-quality parity is not pixel, outline, or whole-shape similarity. It judges the selected
quality axes: material differentiation, manufacturing logic, section and cavity depth, rooted
interfaces, macro/meso/micro hierarchy, edge behavior, causal wear, and supported-camera surface
response. Record each axis as `met`, `partial`, `miss`, or `not_applicable`, then record
`keep|revise|revert|blocked`. A reference mismatch never authorizes deleting sound authored work,
moving frozen interfaces, or redesigning the asset until it resembles the generated image.

Image generation is optional until the chosen repair method actually depends on it; tool absence is
not permission to fake a reference or quietly lower the quality bar. If the assigned worker lacks
image generation and the component remains blocked by DCC vocabulary, hand the bounded component
packet to a Codex session with image-generation capability using `AGENT_PROMPTS.md` § E. The handoff
must receive the authoritative component crop, frozen footprint/orientation/interfaces, material
bill, forbidden reads, and exact output/provenance paths. If the delegated Codex session also lacks
the tool, record `blocked:image-generation-capability` and return to the controller. Do not
substitute a text-only description, unrelated web image, or whole-asset redesign and call the
reference step complete.

### Visible Blender working state

When a non-conflicting connected Blender MCP session is available for authored 3D work, use it for
the primary geometry/material iteration and keep the complete surfaced asset visible in Material
Preview or Rendered shading. Materials, adjacent assemblies, recessed emission, and edge response
must remain available for judgment while geometry changes. Headless builders remain useful for
repeatability and output, not a substitute for surfaced iteration. Solid/clay, wireframe,
material-ID, and channel-isolation views are bounded diagnostics: they can reveal a silhouette,
intersection, normal, or construction defect, but they cannot demonstrate substance or close G4.
Return to the surfaced assembly after each meaningful edit. An external beauty render or later
texturing pass must not be used to excuse a toy-like component accepted in the working viewport.

For a disputed material/shape component, fiction and implementation must agree in the result:

- fiction identifies what the component is, what it does, who made or modified it, its materials,
  manufacture, interfaces, and service history;
- development identifies the geometry, material model, attachment, LOD, and export evidence that
  expresses those facts;
- if the fiction describes a machined drive clamp, ceramic isolator, rolled pressure case, or folded
  radiator but the render reads as a plastic torus, clay box, rubber tube, or cube comb, the
  component fails regardless of its object name or shader settings.

### Scope and whole-asset visual veto

Every G1, G2, and G4 result declares `component`, `zone`, or `whole_asset` scope. A technical receipt
may mark `evidence_ready`; it cannot close G1, G2, or G4. Hashes, renderer completion, material-slot
presence, luminance, pixel coverage, framing, and channel correctness are necessary evidence where
applicable, but none is an art verdict. A component-scoped pass never implies a whole-asset pass.
Each gate record also names its reviewed subjects; an empty subject list cannot support `pass`.

A whole-asset G1/G2/G4 pass requires a committed review record bound to the exact candidate hash. It
must name the reviewer, supported views, original-resolution inspection, changed zones, dominant
inherited/retained zones, reference-quality parity when used, open P0/P1 defects, and an iteration
decision of `keep`, `revise`, `revert`, or `blocked`. Machine evidence can prepare that record but
cannot choose its verdict. If a repaired component succeeds while a dominant inherited hull still
reads as clay, plastic, leather, generic noise, or primitive blockout, retain the successful
component work and fail the whole-asset gate. Do not delete the successful work or relabel the
component pass as whole-asset acceptance.

Program ledgers, evidence epochs, and handoffs may not say `G1-G4 green`, `visually eligible`,
`finished`, or an equivalent whole-asset claim without that exact-candidate review record. Missing
or stale review evidence keeps the artistic gate open.

### Edge language

Bevels/chamfers are design information. Cast masses, formed sheet, machined blocks, armor plates,
glass, and rubber do not share one global radius. Review edge width in screen space under grazing
light. A uniform bevel across every primitive creates the molded-clay look.

### Mesh-derived truth and causal wear

Where materials depend on contacts, edges, cavities, thickness, position, or exposure, derive normal,
AO, curvature, ID, thickness, position, or equivalent data from the exact geometry. Generic UV noise
cannot know the object. Use those maps as inputs, then constrain wear by heat, abrasion, flow,
maintenance, handling, shelter, and direction. Raw curvature/AO is not finished weathering.

### Physically coherent material roles

Define substrate, coating/finish, roughness response, microstructure, interfaces, heat/contact history,
and markings. Material roles must differ by response, not only tint. Base color must not carry baked
lighting; metallic is a material classification; roughness should have intentional scale hierarchy;
normal detail must match physical scale; glass/transparency must survive Three.js sorting/depth.
Audit the material generators themselves: one base/ORM/normal recipe recolored across every slot is
still one fake substance. Repeated panel grids, corner studs, rosettes, quilted bumps, or leather-like
normal structure on curved drums, bearings, hot sections, cables, and refractory are P1 material
failures even when the files, channel bindings, and scalar values are technically valid.

### LODs are authored representations

Each LOD targets a projected-size band. Preserve silhouette, negative space, orientation, engines,
weapons/tools, and major emissive anchors; remove/bake detail below the pixel threshold. Fixed-ratio
decimation may create a rough candidate but cannot prove production LOD quality.

### Budgets are measured hypotheses

No global 4,000-triangle, 2-6k-ship, texture-size, or material-count ceiling defines quality. Measure:

- visible triangles and exported vertices;
- draw calls/primitives/material slots;
- texture transfer, decoded/GPU memory, upload and residency;
- scene nodes and CPU traversal;
- shader features, skinning/morphs;
- transparency and overdraw;
- repetition count, target hardware/browser, frame time, and headroom.

Use the least expensive representation that preserves the accepted visual premise. Compression can
reduce transfer; it cannot repair bad design, draw structure, or invisible geometry.

## 5. G0-G7 acceptance gates

### G0  -  identity and brief

Prove exact asset/source/release/runtime identity, owner/locks, role/tier, supported views, scale,
interfaces, family language, reference/provenance, exclusions, representative scene, and provisional
cost hypothesis. "Make it AAA/more detailed" is not a brief.

### G1  -  design and silhouette

Review matched front/side/top/rear/three-quarter clay views, game-camera sizes, and family lineup.
Forward direction and role must read without labels/color. Primary masses, negative space, load/thrust,
access/service, cooling, payload/tool/weapon relationships must feel designed rather than boxes and
cones with attachments. For a named primitive-default failure, use a shape-grammar audit of the
prominent primitives and repeated forms. Any
retained primitive must have a visible functional reason, plausible scale, and designed transition
into adjoining structure; naming a box “armor,” “vent,” or “service rail” does not satisfy this gate.

### G2  -  production geometry

Prove finished intersections, joints, recesses, thickness, rooted attachments, edge-radius families,
stable grazing-light shading, final transforms, controlled triangulation, and an editable high/low or
direct-game strategy. Uniform bevel, floating strips as every panel cut, impossible intersections,
and polished blockout construction fail. Large repeated bars, petals, ribs, or louvers must show the
brackets, pivots, gaps, housings, formed profiles, fasteners, or welds appropriate to their material
and service method. Surface detail cannot promote unresolved primitive geometry to production.
When a continuous hull or large housing is a prominent tube/box stack, an authored stepped
cross-section loft is a valid repair candidate: preserve identity and interfaces, vary the
manufactured section along its axis, and bridge it into one shell. Where the fiction calls for
depth, cut bays, trenches, channels, apertures, and hangars into that shell with real rims, walls,
thickness, and interiors. Detail must be zoned against quiet plate; full-surface greeble noise is not
construction. These are defect-driven methods, not a mandatory house silhouette.

### G3  -  UV and bake integrity

Prove deliberate unique/trim/tiled/decal/hybrid UV strategy, measured density, checker/stretch,
orientation, mip padding, mirror/overlap policy, frozen triangulation/tangent basis, controlled
high-to-low cage/rays, clean tangent normal/AO/curvature/ID and other useful maps, and exported channel
packing/color spaces. Automatic UV existence and a flat normal map do not pass.

### G4  -  materials and surface story

Prove declared physical surface stacks, roughness hierarchy, scale-correct normals, localized
mesh-aware masks, causal wear, purposeful decals, stable glass/transparency, and material distinction
under neutral, bright, dark, colored, and grazing light in the runtime. One procedural noise recipe
recolored across roles fails. The material bill maps every changed camera-visible zone or grouped
manufactured family to substrate, manufacture, finish, interface, response, and use history. Review
material-ID isolation and native-resolution crops: labels, texture filenames, extension use, and
shader settings cannot prove that a surface reads as its intended substance. Any unexplained
plastic/clay/leather/rubber read fails G4 unless that substance was deliberately specified. A
whole-asset G4 result also inventories the visible material allocation of dominant changed and
inherited zones; a small successful machinery treatment cannot close G4 while most supported views
remain visually unresolved. The exact-candidate, hash-bound visual review—not a technical receipt—
records the gate verdict.

### G5  -  LOD and measured cost

Compare baseline/candidate in a representative worst-case scene. Record calls, scene triangles,
asset vertices/triangles by LOD, materials/textures/nodes, transfer and estimated GPU memory,
transparency/overdraw, load/upload stalls, CPU/GPU/frame timing where available, switch conditions, and
transition captures. Optimization must preserve the visual premise.

### G6  -  runtime integration

Prove sanctioned export, glTF validation, metadata, axes/scale/pivot/bounds/collision/sockets/materials/
LOD/states, release processing, exact reviewed hash, no fallback, normal browser route, packaged route
where required, movement/combat/tool/VFX behavior, mips/culling/shadows/transparency/post stability,
and current runtime profile. Blender-only renders cannot pass.

### G7  -  independent acceptance

A separate reviewer inspects the brief, matched form/bake/material/LOD evidence, normal-route capture,
profile, exact hashes, and unresolved issues. Decision is `accept`, `reject`, or `blocked`. Rejection
must name gate, view/state, region, defect, and an outcome-based acceptance condition. "Needs more
polish" is insufficient.

Gate results are `pass`, `fail`, `not_applicable`, `blocked`, or a specifically approved `waived`.
Missing evidence is not `not_applicable`. No ordinary release waiver may hide a P0/P1.

## 6. Defect-driven technique selection

Start from evidence. Examples:

- inherited DCC material: write the component material bill, replace or deliberately configure the
  shader and maps, then verify the substance in material-ID isolation and adversarial light;

- primitive stack -> custom profiles, boolean/union/cut with cleanup, SubD/direct modeling, designed
  joints and negative space; for continuous primary masses, consider stepped section lofts rather
  than another layer of attached primitives;
- toy/clay edge response -> edge-radius families, stronger plane hierarchy, grazing-light review;
- floating panel bars -> true inset/recess/shadow gap with wall thickness where depth matters,
  trim/decal where shallow;
- shading waves -> planar/topology cleanup, support geometry, weighted normals/data transfer after valid
  form, frozen triangulation;
- UV stretch/density debt -> logical seams, unwrap/relax/pin/straighten, density and padding review;
- bake skew/bleed -> custom cage, isolated/exploded pairs, added low support, tangent/hard-edge fixes;
- plastic metal -> substrate/coating model, correct metallic classification, broad-to-micro roughness,
  environment reflections, anisotropy/clearcoat only when supported and useful;
- random grunge -> reduce albedo noise, use panel variation and causal masks/painting/decals;
- LOD pop -> hand-authored simplification, preserve anchors, move subpixel detail to maps, better switch;
- high repeated cost -> instancing/BatchedMesh, compatible merge/atlas/trim, scene hierarchy cleanup;
- shimmer -> remove/bake subpixel geometry, mip-safe texture frequency, LOD/filter/anisotropy review;
- glowing VFX blob -> temporal envelope and core/body/halo/particle hierarchy with restrained bloom.

Techniques have no quota. Keep only methods that improve exported role/readability, construction,
material identity, story, motion, cost at equal quality, or reproducibility.

## 7. Agent execution protocol

Before editing:

1. follow root `AGENTS.md` → `assets/AGENTS.md` → `assets/ships/AGENTS.md`; load
   `.grok/skills/spaceface-blender-material-truth/SKILL.md` before any 3D form/surfacing change;
2. inspect status/diffs and locks;
3. resolve exact source/candidate/release/runtime/fallback identities;
4. inventory geometry, modifiers, UVs, maps, materials, sockets, LODs, metadata and states;
5. capture fresh matched baseline and representative profile;
6. fill a brief, classify current state, and list defects by earliest gate/severity.

Then loop:

```text
while state is not accepted and state is not blocked:
  inspect fresh evidence
  select earliest failed gate
  name highest-impact defect and cause
  choose smallest suitable method
  implement in editable source
  export through sanctioned path
  render matched diagnostics
  run normal player route
  profile when cost-relevant
  keep, revise, or revert from evidence
  update gates and candidate hashes
  request independent review after G0-G6 pass
```

The loop has no arbitrary pass count. One excellent pass may suffice; twenty superficial passes do
not. When a late discovery exposes an early failure, return to the early gate and invalidate/rebuild
affected bakes/materials/LODs.

Do not weaken checks, hand-edit generated release metadata, destroy concurrent work, or wire an
unaccepted candidate merely to force green reachability. If Blender/GPU/browser/source/lock/decision
is unavailable, complete unaffected work and mark the exact gate `blocked` with a reproducible error
and smallest external action needed.

## 8. Evidence and completion

Every consequential iteration records candidate hash, state, earliest failed gate, defect, method,
changed sources, matched views, checks, runtime result, profile delta, and keep/revise/revert/block
decision.

Evidence must use matched camera, framing, exposure, background, and resolution unless that variable
is the test. Beauty renders supplement diagnostics; they never replace them.

For G1/G2/G4, record gate scope and keep technical evidence separate from the visual verdict.
Whole-asset claims additionally record the exact-candidate review, original-resolution inspection,
dominant inherited/retained-zone coverage, material allocation, any reference-quality parity matrix,
and remaining P0/P1 defects. Without that record the result is `evidence_ready`, not `pass`.

An asset may stop only at:

- `accepted`  -  applicable G0-G7 pass, no P0/P1, exact runtime candidate and required reviewer recorded;
- `blocked`  -  exact dependency, attempted action, remaining gate, and smallest unblock action recorded.

`integration_candidate` is not finished.
