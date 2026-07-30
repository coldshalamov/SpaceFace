---
name: spaceface-blender-material-truth
description: >
  Primary SpaceFace hard-surface workflow for authoring or remastering a camera-prominent Blender or
  GLB ship, station, place, or prop. Always use for Blender/GLB form or surfacing work, and
  especially when components read as plastic, clay, rubber, leather, LEGO-like primitive stacks,
  generic greebles, or otherwise disagree with their in-fiction function and manufacture. Establish
  fiction/material truth before modeling, preserve existing identity and gameplay interfaces when
  remastering, use component-only generated references when selected, iterate on the complete
  surfaced asset in Blender, export through the sanctioned pipeline, and require matched
  clay/material/runtime evidence.
---

# SpaceFace Blender Material Truth

For an existing asset, remaster what is there rather than designing a replacement. For a new asset,
establish its manufactured assemblies before accepting a blockout. In either case, start from what
each visible component is in the fiction, then make its geometry, construction, material response,
wear, and LOD agree with that fact.

This is a technique workflow, not acceptance authority. Route the result through the G0-G7 process
in `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`.

## 0. Material-truth preflight

Complete this preflight before any camera-visible Blender/GLB geometry or surfacing change. Scale the
record to the work, never the quality bar: Tier A/B components require individual entries; Tier C/D
may use one entry for a repeated manufactured family, but no changed zone may inherit a DCC default.

1. create one exhaustive visible-zone register; classify every zone visible in a supported review
   camera as `billed`, `retained_reviewed`, or `blocked`; use `outside_supported_view` only when the
   zone is absent from every supported review camera (`supportedViews: []`), never for a visible or
   dominant region; record supported views and whether the zone dominates one, and keep
   `allSupportedViewZonesClassified: false` until a reviewer confirms coverage; “quiet” describes
   composition, not permission to leave donor/default material unexamined;
2. write the fiction-development agreement and material bill for every `billed` item or grouped
   repeated family;
3. record the shape-grammar failure or new manufactured assembly sequence;
4. record `componentReferenceDecision` as `not_needed`, `native_imagegen`, `codex_handoff`, or
   `blocked:image-generation-capability`;
5. when a reference is used for a remaster, freeze silhouette envelope, footprint, orientation,
   attachment points, sockets, neighboring clearances, role, and useful authored work; then name the
   quality axes the reference will judge;
6. inventory dominant inherited/retained zones visible in the supported whole-asset cameras;
   `retained_reviewed` requires an actual material/construction review and remains inside the
   whole-asset visual veto;
7. name the complete surfaced Blender working scene and the supported cameras that will judge it;
8. name the G0-G7 evidence, gate scope, hash-bound review record, and independent reviewer required
   for the exact candidate.

Do not begin from a generic primitive, shader preset, procedural texture recipe, or beauty-render
goal and invent the fictional explanation afterward.

## 1. Establish authority and boundaries

1. Read the root and nearest `AGENTS.md`, `design/program/NOW.md`, the activated asset packet, exact
   manifests/runtime maps, and the current asset source. Inspect any applicable path-local
   `authoring.__lock/`, `assets/ships/release.__lock/`, and `assets/ships/release.__building/`
   signals when present; never infer ownership from an old handoff alone.
2. Record source, candidate, and live-release paths and hashes before editing.
3. Freeze the gameplay identity, silhouette anchors, dimensions, sockets, collision, pivots, forward
   axis, and runtime role unless the brief explicitly authorizes a change.
4. Work in candidate paths. Do not patch live release files or promote an unaccepted local result.

## 2. Write the fiction-development agreement

Start at `docs/worldbuilding/README.md` and follow its canon authority order before inventing component
history. Cite the relevant canon source in the asset dossier. Label every unsupported but useful
manufacturing, manufacturer, service-history, or slang detail `ART EXTRAPOLATION`; fiction and
geometry agreeing with each other is not enough if both contradict the game.

For every disputed camera-visible component, write:

- function, origin, and manufacturer or repair context;
- substrate and manufacturing process;
- coating, heat treatment, seal, or optical finish;
- fasteners, joints, access, load path, cable/fluid interfaces, and service history;
- expected optical and tactile read;
- explicitly forbidden reads.

Translate those statements into geometry, edge families, attachment logic, shader/material model,
UVs, bakes, wear, and LOD treatment. A convincing object name or shader value cannot override an
incorrect rendered substance.

Use the component profile and material-bill shapes in `docs/visual-assets/TEMPLATES.md`. Require
fail-closed material-bill coverage for every disputed, changed, or newly camera-visible component
in this pass. Do not turn the diagnostic into universal release paperwork for
`outside_supported_view` zones; every visible retained zone still requires review.

## 3. Audit the shape grammar

Identify primitive origins and repeated form families at the supported cameras. For each prominent
tube, box, torus, slab, rail, comb, and repeated bar, require a functional and manufacturing reason.

- Retain a primitive only when its section, load purpose, interfaces, edge scale, and transition into
  adjacent structure make sense.
- Add real negative space, joints, seams, access, mounts, thin sheet, gussets, ribs, vanes, saddles,
  or fasteners where the fiction requires them.
- Do not use object count, triangle count, shape count, or "double the geometry" as acceptance
  criteria. Count only the forms that repair a visible defect.
- Test a neutral clay view. If the asset still reads as stacked primitives without its textures,
  continue at G1/G2.

## 4. Use generated reference only when it clarifies a component

When a specific component is trapped by the current software vocabulary:

1. Crop or isolate that exact component from the authoritative asset. For a remaster this is required
   by default; if genuinely impossible, record why. A text-only study may inspire construction, but
   cannot satisfy reference-quality parity or close an artistic gate.
2. If this worker lacks image generation, run
   `scripts/request_imagegen_reference.mjs` from this skill (usage and packet requirements are in
   `docs/visual-assets/AGENT_PROMPTS.md` § E). The wrapper dispatches a bounded Codex terminal
   session in isolated read-only scratch. It snapshots the prompt and crop, pins the resolved local
   Codex executable across the run, requires one strictly ordered completed turn with one final
   agent message and no other tool/file/web/MCP work, and accepts exactly one fresh PNG from that
   turn's protected `$CODEX_HOME/generated_images/<thread-id>/` directory. It binds freshness and
   identity to a single no-follow handle read, fully decodes and pixel-compares that exact protected
   buffer, then publishes one fixed seven-file evidence bundle with an ownership-token-checked
   same-parent atomic directory rename. Prose attestations are never generation evidence.
   The installed Codex binary's authenticity remains a local host trust boundary even though the
   wrapper records and rechecks its real path, hash, stat, and version. Because Node lacks a Windows
   handle-relative rename, same-user filesystem integrity during the final check-to-rename interval
   is also an explicit host trust boundary. The wrapper records the caller's `codex_handoff` and
   `worker_lacks_image_generation` routing premise without claiming the receipt independently proves
   it. Do not skip the selected reference method, fabricate a text-only substitute, or broaden the
   request into a whole-asset redesign. If the delegated session also lacks image generation, record
   `blocked:image-generation-capability`.
3. Generate a component-only construction or material study that preserves its footprint,
   orientation, interfaces, and role.
4. Record tool, prompt, input/output hashes, selected traits, rejected traits, and license/provenance.
5. Translate the chosen logic into editable geometry and authored materials.

Never use a generated whole-asset redesign as identity proof. Never project generated pixels onto the
shipping asset, and never treat generated normal, AO, roughness, metallic, or collision data as
physically authoritative.

### Reference-quality parity contract

Before generation, separate the two contracts:

- **frozen identity:** silhouette envelope, proportions, component footprint/orientation, sockets,
  interfaces, runtime role, neighboring clearances, and useful existing work;
- **quality target:** material differentiation, manufacture, section/cavity depth, rooted interfaces,
  macro/meso/micro hierarchy, edge behavior, causal wear, and supported-camera surface response.

Compare the rebuilt component and generated reference at similar views and record every selected
quality axis as `met`, `partial`, `miss`, or `not_applicable`, followed by
`keep|revise|revert|blocked`. Do not score pixel similarity or require the asset to copy the
reference's silhouette. A mismatch authorizes revising the deficient quality axis; it never
authorizes deleting sound work, moving frozen interfaces, or restarting the ship merely to resemble
the generated image.

## 5. Iterate in Blender

1. Inspect the connected scene before mutation: collections, units, transforms, parents, materials,
   modifiers, shared datablocks, sockets, collision, and render visibility.
2. Rebuild only the selected component logic in editable, repeatable, idempotent source.
3. Prefer manufacturing-specific sections and joints over generic bevels or stuck-on greebles.
4. When a non-conflicting connected Blender MCP session is available, use it for the primary
   geometry/material iteration. Keep the complete surfaced asset visible in that Blender window.
   Use Material Preview or Rendered shading as the primary working state, with the intended
   materials, neighboring components, and restrained emission present. Headless builders remain
   reproducible authoring/output tools, not a reason to hide the surfaced result. Review matched
   neutral material, hard grazing-light, and supported-camera views after each meaningful pass.
5. Use solid/clay, wireframe, material-ID, and channel-isolation views as short diagnostic modes.
   Return immediately to the complete surfaced assembly before deciding whether a change survives.
   Clay can reject construction; it cannot prove material truth or grant acceptance.
6. Ask continuously: "Does this still look like the same asset?" and "Does this look like fabricated
   hardware rather than a model made from software defaults?"
7. Keep, revise, or revert from those images. Do not accept a change because the script ran or the
   object count increased.
8. Derive physical maps from the actual mesh and authored surface information.

For Tier A/B assets, follow the outcome-based iteration protocol in
`design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md`; one self-reviewed render is never the whole
proof, but an iteration count is not acceptance. When the same defect survives a repair method,
change the method or return to the earliest failed gate instead of accumulating parameter nudges.
Request independent specialist review when the owning agent can no longer discriminate the defect.

### Fail-closed whole-asset review

Every G1/G2/G4 result names `component`, `zone`, or `whole_asset` scope. A technical receipt may mark
`evidence_ready`; it cannot close G1, G2, or G4. Pixel coverage, luma, hashes, material bindings,
camera framing, renderer completion, and channel audits prepare evidence only. A component-scoped
pass never implies a whole-asset pass. Each gate record names the reviewed subjects; empty subjects
or an incomplete visible-zone register cannot support `pass`.

Before any whole-asset G1/G2/G4 claim, commit a review record bound to the exact candidate hash. It
must name the reviewer, supported views, original-resolution inspection, changed zones, dominant
inherited/retained zones, reference-quality parity evidence when used, visible material allocation,
open P0/P1 defects, and `keep|revise|revert|blocked`. If the new component succeeds but the inherited
hull still reads as clay, plastic, leather, generic noise, or primitive blockout, keep the successful
component work and fail the whole-asset gate. Do not discard the good work and do not promote its
component-scoped pass into a whole-asset status.

### Proven controls against the toy/plastic failure mode

Apply these explicitly; Blender defaults are not art direction.

- **Do not start with the primitive.** Start with a component section and assembly sequence:
  rolled/faceted case, hollow bell, folded hat section, plate shell, gusset, saddle, clevis, flange,
  service run, aperture, or formed pressure vessel. A cylinder with rings and boxes attached is still
  a cylinder with rings and boxes attached.
- **Use authored cross-sections when the silhouette needs transition.** When an existing hull or
  large housing reads as one tube/box, consider a short sequence of stepped or lofted sections that
  establishes taper, shoulder, waist, flare, wall thickness, and mounting transition. Preserve the
  asset's silhouette anchors and interfaces; lofting is a repair method, not permission to restart
  the ship. Reject twists, pinching, shading waves, or gratuitous section count.
- **Cut construction into the shell.** Use inset/recess, clean booleans, or equivalent direct
  modeling for bays, trenches, keel channels, service apertures, and hangars. Give them rims, wall
  thickness, interiors, and connections. Keep separate stuck-on parts only when they are plausibly
  replaceable hardware.
- **Make the surfaced assembly the authoritative working view.** Keep the actual materials applied
  to the complete model in the visible Blender window while authoring. Do not spend an entire pass
  looking at a clay model and defer substance judgment to an external render. After every geometry,
  normal, material, or emission change, inspect the result in Material Preview or Rendered shading
  with adjacent parts present. Use clay only to expose silhouette and construction defects.
- **Use size hierarchy.** Macro shape carries identity; meso parts explain construction; small
  fasteners, clamps, ribs, shutter leaves, and lines explain service. Do not make every detail a
  metre-scale block.
- **Zone detail against clean plate.** Assign primary-read, construction, service, heat/wear, and
  quiet-plate regions. Concentrate meso detail where forces, access, cooling, fastening, or repair
  justify it, and preserve visual rest areas. Size fine work from supported screen space and
  function, not a borrowed hull-length quota.
- **Audit the visible cross-section, not the object count or object name.** A "recoil beam,"
  "mantlet," "service pack," or "casemate panel" is still toy construction when the supported
  camera sees only a blank rectangular bar or slab. Primary housings need authored section changes,
  edge breaks, mounting transitions, openings, and adjacent smaller interfaces. An open machinery
  bay must actually expose its receiver, bearings, dampers, fasteners, lines, and load frame; a
  painted shell hiding those parts fails even when they exist behind it.
- **Preserve hard-surface normals.** Never apply unconditional `shade_smooth()` to folded sheet,
  machined facets, clamp segments, or plate edges. Use `shade_smooth_by_angle` at a recorded angle
  (the Ashline pilot uses 28 degrees), inspect hard grazing light, and validate the mesh before glTF
  export. Over-smoothed normals turn correct geometry into soap, rubber, or molded plastic.
- **Resolve scale before bevel evaluation.** Inspect object and parent transforms before adding or
  tuning bevels. Apply non-uniform mesh scale only when doing so preserves authored dimensions,
  pivots, parents, sockets, collision, and shared-data intent; otherwise compensate deliberately.
  Recheck those contracts after the operation.
- **Classify the substance before setting Principled values.** Intact paint/coating is dielectric;
  bare steel and nickel alloy are metallic; refractory ceramic is non-metallic and dry; carbon
  composite has its own weave/edge logic; glass is not dark polished metal. Vary roughness from
  manufacture and wear, not generic noise. Assert that every authored material name resolves to its
  intended surface-generator role. A named repair primer that silently falls through to a generic
  hull profile is a contract failure even when the render technically contains textures.
- **Match surface grammar to the component and UV scale.** Do not stamp a generic plate grid,
  leather-like bump, or large tile noise across a machined receiver, rolled hot jacket, nozzle bell,
  cable, or ceramic throat. Plate seams belong to actual plate construction; curved hardware gets
  material-appropriate microstructure, while modeled clamps, stringers, joints, and wall breaks
  carry its assembly story. Reject any texture whose texel/block scale becomes a visible substitute
  for geometry in the supported close view. Procedural corner studs or plate fasteners belong only
  to actual plate roles; use modeled fasteners at the real interfaces of receivers, hot sections,
  cable hardware, and refractory assemblies.
- **Audit the generator, not only the material names.** A single base/ORM/normal recipe recolored for
  every role is still one fake substance. Inspect native-size outputs from each material generator:
  plate may carry authored seams and sparse fasteners; machined steel needs directional machining;
  hot alloy needs heat/flow response; refractory needs dry granular structure; paint may reveal metal
  only where the coating is actually lost. Reject repeated icons, rosettes, quilted bumps, or corner
  studs on curved drums, bearings, cables, hot sections, and ceramics even when their shader slots and
  metallic values are technically different.
- **Model interfaces and depth.** Throats, apertures, vents, bays, and reflectors need cavities,
  inner walls, rims, attachment structure, and a believable load or service path. A bright disk on a
  surface is not a reactor, sensor, or thruster.
- **Recess and restrain emissives.** Emissive pixels live inside a fixture, throat, slit, or
  instrument. Review with emissive disabled; the component must still explain itself.
- **Keep generated references component-only.** Record why a reference was selected or rejected,
  then translate its construction logic into deterministic source. A wrong weapon or mechanism must
  be preserved as rejected provenance, not quietly adapted into canon.
- **Make LODs preserve meaning.** LOD0 keeps clamps, seams, lines, ribs, shutters, and cavities;
  LOD1 keeps the load path, pressure cases, bells, housings, and material boundaries; LOD2 keeps the
  macro identity. Dropping all construction at LOD1 recreates the toy read during normal play.
- **Separate authoring from evidence.** A Blender scene or beauty render is not proof. Render from
  the exact finalized uncompressed source GLB, register and hash the renderer, bind each artifact to
  its exact ship/source hash, and make historical or mixed-epoch images fail closed. Pre-finalize
  renders are useful geometry diagnostics only; keep them out of the eligible receipt, then rerender
  after the authored surface finalizer so material response is judged on the candidate actually
  being encoded. Never offer a receipt-only mode that checks filenames and relabels existing images
  with a new source hash; eligible evidence must be produced by a complete exact-source rerender.
- **Preserve the connected Blender environment.** Clear scene datablocks locally; do not reset
  factory preferences or disable the MCP add-on as a build shortcut.
- **Verify the visible graph and post-export scene.** When auditing Principled inputs, follow active
  node links and inspect the linked image or procedural source; an input's default value is not the
  rendered value when the socket is linked. Exporters may also unhide selected collision/non-render
  helpers. Re-hide those helpers, restore the complete surfaced assembly, and save the clean
  production scene before taking the visible Blender checkpoint.
- **Use bounds-fitted diagnostic cameras.** Derive full-subject framing from evaluated visible
  world-space bounds, record camera/exposure, and keep supported gameplay cameras mandatory. A sudden
  render-time spike or implausible crop first triggers a check for a camera inside geometry.
- **Treat Blender API names as versioned facts.** Query the connected version and available
  RNA/socket/operator surface, establish mode/selection/context explicitly, and keep compatibility
  helpers local. A suspiciously fast transparent-black render is a failed render dependency, not
  successful evidence.

Reject the pass if any prominent component is still best described as “tube,” “box,” “torus,”
“glowing disk,” or “smooth lump” rather than by a fabricated part and its interfaces.

## 6. Export and validate

Use `tools/blender/spaceface_export.py` and the asset family's actual source/release workflow. Do not
invent a parallel exporter.

SpaceFace ships authored GLBs through its manifest/finalizer/runtime path. Do not copy project-specific
advice that assumes there is no glTF loader, uses a different world-unit scale, or exports loose
models to an unrelated folder. Blender-only procedural nodes are authoring inputs; preserve their
approved result through portable textures/material parameters and the real SpaceFace finalizer.

Validate:

- exact source/export/release hashes and build provenance;
- GLB structure, texture roles and KTX2 profiles;
- source and release LODs, sockets, collision, transforms, and runtime identity;
- matched clay, material, grazing-light, normal-route, and supported-size evidence;
- exact-candidate, hash-bound review scope and verdict for G1/G2/G4, including dominant inherited
  zones and reference-quality parity when used;
- representative cost when geometry, draws, textures, or residency changed.

Leave Browser/Electron, performance, or independent G7 gates explicitly open when their real
acceptance route is unavailable. Never manufacture headed values from a headless check.

## 7. Preserve durable learning

Update canonical guidance only when the pass reveals a repeated root cause or reusable process
lesson. Keep asset-specific typography, decals, faction taste, fiction, and material decisions in the
asset's audit, contract, provenance, and visual review.

Required references:

- `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`
- `docs/visual-assets/TEMPLATES.md`
- `docs/visual-assets/AGENT_PROMPTS.md`
- `design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md`
- `references/loft-recess-method.md` when primitive-stack, blank-shell, recess, diagnostic-camera,
  or Blender-version defects are active.

For a concrete example, inspect:

- `assets/ships/kestrel_borrowed_time_v4/MATERIAL_AND_SHAPE_AUDIT.md`
- `assets/ships/kestrel_borrowed_time_v4/MATERIAL_CONTRACT.json`
- `assets/ships/kestrel_borrowed_time_v4/reference/REFERENCE_PROVENANCE.md`
- `assets/ships/kestrel_borrowed_time_v4/evidence/material_truth_v6/VISUAL_REVIEW.md`
- `assets/ships/m4_ashline_v2/reference/material_truth_v2/DART_COMPONENT_MATERIAL_BILL.md`
- `assets/ships/m4_ashline_v2/reference/material_truth_v2/REFERENCE_PROVENANCE.md`
- `tools/blender/build_m4_ashline_v2.py`
- `tools/blender/render_m4_ashline_material_truth.py`
- `tools/art/lib/ashlineEvidenceEpoch.mjs`
