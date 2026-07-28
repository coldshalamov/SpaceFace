# Visual Asset Production Standard

## 1. Purpose

This is the production contract for authored real-time assets. It separates three proofs:

- **technical validity** ΓÇö source/export/release files are structurally correct and load;
- **performance validity** ΓÇö the exact candidate fits a measured representative scene;
- **visual acceptance** ΓÇö the exported runtime result communicates its role with professional form,
  construction, surface response, hierarchy, stability, and presentation.

All three are required. A script may prove technical facts. It may not grant artistic acceptance.
Quality is observed from the exact exported candidate in representative lighting and the normal
player route. Modifier count, node count, triangle count, number of passes, and confident prose have
no acceptance value by themselves.

## 2. Production states

- `blockout` ΓÇö scale, occupancy, sockets, and broad silhouette. Primitives and temporary materials are
  allowed only with honest classification.
- `design_candidate` ΓÇö distinctive role, orientation, primary masses, negative space, and construction
  logic are proven in neutral views and the real camera.
- `production_model` ΓÇö final macro/meso geometry, intersections, edge language, topology, shading, and
  transforms are stable enough for deliberate UV/bake work.
- `bake_candidate` ΓÇö final UVs, tangent basis, map transfer, cage/rays, padding, and exported map
  assignments are proven clean.
- `surfaced_candidate` ΓÇö physically coherent, mesh-aware materials survive neutral and adversarial
  lighting and the actual renderer.
- `integration_candidate` ΓÇö authored LODs, metadata, sockets, states, compression, exact runtime load,
  normal-route evidence, and representative performance pass.
- `accepted` ΓÇö every applicable gate passes and required independent review is recorded against the
  exact candidate hash.
- `blocked` ΓÇö a named dependency prevents the next proof. It is not completion.
- `deprecated` ΓÇö intentionally removed from production use.

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

### Macro ΓåÆ meso ΓåÆ micro

- macro: silhouette, proportion, direction, negative space, dominant masses;
- meso: frame/shell relationships, bays, armor, access, engines, tools, payload, cooling, service;
- micro: fasteners, labels, scratches, coating texture, shallow seams.

Never use micro detail to camouflage unresolved macro/meso work.

### Manufacturing and service logic

The mesh should imply how the object is assembled, loaded, cooled, opened, repaired, protected, and
replaced. Delete decoration that does not support function, scale, identity, history, or composition.

### DCC defaults have no authorship value

No visible surface may inherit its artistic identity from Blender defaults, a donor material, or an
unchanged Principled BSDF merely because the software produced something renderable. When an
activated Tier A/B rebuild has a named material-truth failure, use a component material bill to
resolve the disputed zones:

- physical substrate;
- manufacturing or forming process;
- coating, treatment, or intentionally bare finish;
- attachment/interface to neighboring parts;
- expected optical response by scale and lighting;
- heat, abrasion, contamination, maintenance, and marking history;
- forbidden reads such as plastic toy, clay blockout, rubber/leather when not actually specified.

“Metal,” “hull,” “mechanical,” a material-slot name, a color, or a roughness number is not enough to
resolve a disputed material identity. If a default or inherited shader response survives because no
one made and reviewed these decisions, that is a P1—not a neutral starting point. The bill is a
diagnostic aid for that failure, not universal release paperwork.

### Primitive and shape-grammar accountability

Boxes, cylinders, cones, toruses, and planes are valid blockout or manufacturing inputs, not automatic
finished components. When a G1/G2 review identifies primitive-default construction, a shape-grammar
audit can identify the camera-prominent primitive or repeated family and its function, scale,
manufacturing rationale, interface, and transformation into final form. An unexplained perfect tube, floating bar, repeated rectangular
“chiclet,” decorative hoop, or uniformly beveled slab remains blockout construction even when it has
textures, scratches, or a plausible object name.

### Component-first generated-reference loop

When DCC blockout vocabulary is constraining design, one useful repair method is to isolate the exact deficient component from an
authoritative screenshot or source render and generate a reference for that component—not a
replacement beauty image of the whole asset. The prompt must preserve the component's footprint,
orientation, role, interfaces, and identity while naming its substrate, manufacture, finish,
fasteners, service access, load path, and forbidden reads. Prefer a sheet with three-quarter,
orthographic, exploded, and material/interface views.

Generated imagery remains reference-only. Record its prompt, tool, source capture, hash, selected
traits, rejected traits, and asset-specific resemblance target. Translate the approved manufacturing
logic into editable geometry and authored materials; do not project the image over a primitive and
call the component resolved, and never infer authoritative normal/AO/ORM data from the generated
pixels. Review the rebuilt component beside the reference in material and textureless/clay views.

For a disputed material/shape component, fiction and implementation must agree in the result:

- fiction identifies what the component is, what it does, who made or modified it, its materials,
  manufacture, interfaces, and service history;
- development identifies the geometry, material model, attachment, LOD, and export evidence that
  expresses those facts;
- if the fiction describes a machined drive clamp, ceramic isolator, rolled pressure case, or folded
  radiator but the render reads as a plastic torus, clay box, rubber tube, or cube comb, the
  component fails regardless of its object name or shader settings.

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

### LODs are authored representations

Each LOD targets a projected-size band. Preserve silhouette, negative space, orientation, engines,
weapons/tools, and major emissive anchors; remove/bake detail below the pixel threshold. Fixed-ratio
decimation may create a rough candidate but cannot prove production LOD quality.

### Budgets are measured hypotheses

No global 4,000-triangle, 2ΓÇô6k-ship, texture-size, or material-count ceiling defines quality. Measure:

- visible triangles and exported vertices;
- draw calls/primitives/material slots;
- texture transfer, decoded/GPU memory, upload and residency;
- scene nodes and CPU traversal;
- shader features, skinning/morphs;
- transparency and overdraw;
- repetition count, target hardware/browser, frame time, and headroom.

Use the least expensive representation that preserves the accepted visual premise. Compression can
reduce transfer; it cannot repair bad design, draw structure, or invisible geometry.

## 5. G0ΓÇôG7 acceptance gates

### G0 ΓÇö identity and brief

Prove exact asset/source/release/runtime identity, owner/locks, role/tier, supported views, scale,
interfaces, family language, reference/provenance, exclusions, representative scene, and provisional
cost hypothesis. ΓÇ£Make it AAA/more detailedΓÇ¥ is not a brief.

### G1 ΓÇö design and silhouette

Review matched front/side/top/rear/three-quarter clay views, game-camera sizes, and family lineup.
Forward direction and role must read without labels/color. Primary masses, negative space, load/thrust,
access/service, cooling, payload/tool/weapon relationships must feel designed rather than boxes and
cones with attachments. For a named primitive-default failure, use a shape-grammar audit of the
prominent primitives and repeated forms. Any
retained primitive must have a visible functional reason, plausible scale, and designed transition
into adjoining structure; naming a box “armor,” “vent,” or “service rail” does not satisfy this gate.

### G2 ΓÇö production geometry

Prove finished intersections, joints, recesses, thickness, rooted attachments, edge-radius families,
stable grazing-light shading, final transforms, controlled triangulation, and an editable high/low or
direct-game strategy. Uniform bevel, floating strips as every panel cut, impossible intersections,
and polished blockout construction fail. Large repeated bars, petals, ribs, or louvers must show the
brackets, pivots, gaps, housings, formed profiles, fasteners, or welds appropriate to their material
and service method. Surface detail cannot promote unresolved primitive geometry to production.

### G3 ΓÇö UV and bake integrity

Prove deliberate unique/trim/tiled/decal/hybrid UV strategy, measured density, checker/stretch,
orientation, mip padding, mirror/overlap policy, frozen triangulation/tangent basis, controlled
high-to-low cage/rays, clean tangent normal/AO/curvature/ID and other useful maps, and exported channel
packing/color spaces. Automatic UV existence and a flat normal map do not pass.

### G4 ΓÇö materials and surface story

Prove declared physical surface stacks, roughness hierarchy, scale-correct normals, localized
mesh-aware masks, causal wear, purposeful decals, stable glass/transparency, and material distinction
under neutral, bright, dark, colored, and grazing light in the runtime. One procedural noise recipe
recolored across roles fails. For an activated material-truth remediation, the component material
bill should map every disputed camera-visible zone to substrate, manufacture, finish, interface,
response, and use history. Review
material-ID isolation and native-resolution crops: labels, texture filenames, extension use, and
shader settings cannot prove that a surface reads as its intended substance. Any unexplained
plastic/clay/leather/rubber read fails G4 unless that substance was deliberately specified.

### G5 ΓÇö LOD and measured cost

Compare baseline/candidate in a representative worst-case scene. Record calls, scene triangles,
asset vertices/triangles by LOD, materials/textures/nodes, transfer and estimated GPU memory,
transparency/overdraw, load/upload stalls, CPU/GPU/frame timing where available, switch conditions, and
transition captures. Optimization must preserve the visual premise.

### G6 ΓÇö runtime integration

Prove sanctioned export, glTF validation, metadata, axes/scale/pivot/bounds/collision/sockets/materials/
LOD/states, release processing, exact reviewed hash, no fallback, normal browser route, packaged route
where required, movement/combat/tool/VFX behavior, mips/culling/shadows/transparency/post stability,
and current runtime profile. Blender-only renders cannot pass.

### G7 ΓÇö independent acceptance

A separate reviewer inspects the brief, matched form/bake/material/LOD evidence, normal-route capture,
profile, exact hashes, and unresolved issues. Decision is `accept`, `reject`, or `blocked`. Rejection
must name gate, view/state, region, defect, and an outcome-based acceptance condition. ΓÇ£Needs more
polishΓÇ¥ is insufficient.

Gate results are `pass`, `fail`, `not_applicable`, `blocked`, or a specifically approved `waived`.
Missing evidence is not `not_applicable`. No ordinary release waiver may hide a P0/P1.

## 6. Defect-driven technique selection

Start from evidence. Examples:

- inherited DCC material: write the component material bill, replace or deliberately configure the
  shader and maps, then verify the substance in material-ID isolation and adversarial light;

- primitive stack ΓåÆ custom profiles, boolean/union/cut with cleanup, SubD/direct modeling, designed
  joints and negative space;
- toy/clay edge response ΓåÆ edge-radius families, stronger plane hierarchy, grazing-light review;
- floating panel bars ΓåÆ true inset/recess/shadow gap where depth matters, trim/decal where shallow;
- shading waves ΓåÆ planar/topology cleanup, support geometry, weighted normals/data transfer after valid
  form, frozen triangulation;
- UV stretch/density debt ΓåÆ logical seams, unwrap/relax/pin/straighten, density and padding review;
- bake skew/bleed ΓåÆ custom cage, isolated/exploded pairs, added low support, tangent/hard-edge fixes;
- plastic metal ΓåÆ substrate/coating model, correct metallic classification, broad-to-micro roughness,
  environment reflections, anisotropy/clearcoat only when supported and useful;
- random grunge ΓåÆ reduce albedo noise, use panel variation and causal masks/painting/decals;
- LOD pop ΓåÆ hand-authored simplification, preserve anchors, move subpixel detail to maps, better switch;
- high repeated cost ΓåÆ instancing/BatchedMesh, compatible merge/atlas/trim, scene hierarchy cleanup;
- shimmer ΓåÆ remove/bake subpixel geometry, mip-safe texture frequency, LOD/filter/anisotropy review;
- glowing VFX blob ΓåÆ temporal envelope and core/body/halo/particle hierarchy with restrained bloom.

Techniques have no quota. Keep only methods that improve exported role/readability, construction,
material identity, story, motion, cost at equal quality, or reproducibility.

## 7. Agent execution protocol

Before editing:

1. inspect status/diffs and locks;
2. resolve exact source/candidate/release/runtime/fallback identities;
3. inventory geometry, modifiers, UVs, maps, materials, sockets, LODs, metadata and states;
4. capture fresh matched baseline and representative profile;
5. fill a brief, classify current state, and list defects by earliest gate/severity.

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
  request independent review after G0ΓÇôG6 pass
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

An asset may stop only at:

- `accepted` ΓÇö applicable G0ΓÇôG7 pass, no P0/P1, exact runtime candidate and required reviewer recorded;
- `blocked` ΓÇö exact dependency, attempted action, remaining gate, and smallest unblock action recorded.

`integration_candidate` is not finished.
