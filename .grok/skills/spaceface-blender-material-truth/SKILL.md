---
name: spaceface-blender-material-truth
description: >
  Focused SpaceFace remaster pass for an existing Blender or GLB ship, station, place, or prop whose
  camera-prominent components read as plastic, clay, rubber, leather, LEGO-like primitive stacks,
  generic greebles, or otherwise disagree with their in-fiction function and manufacture. Use to
  preserve the asset's identity, footprint, sockets, collision, and runtime role while rebuilding
  selected components through a fiction-development agreement, component material bills,
  shape-grammar audits, optional component-only generated references, editable Blender source,
  sanctioned GLB export, and matched clay/material/runtime evidence.
---

# SpaceFace Blender Material Truth

Remaster the existing asset rather than designing a replacement. Start from what each visible
component is in the fiction, then make its geometry, construction, material response, wear, and LOD
agree with that fact.

This is a technique workflow, not acceptance authority. Route the result through the G0-G7 process
in `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`.

## 1. Establish authority and boundaries

1. Read the root and nearest `AGENTS.md`, the live lock/lease board, the activated asset packet,
   exact manifests/runtime maps, and the current asset source.
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
fail-closed material-bill coverage for every retained and newly visible component.

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

1. Crop or isolate that exact component from the authoritative asset.
2. Generate a component-only construction or material study that preserves its footprint,
   orientation, interfaces, and role.
3. Record tool, prompt, input/output hashes, selected traits, rejected traits, and license/provenance.
4. Translate the chosen logic into editable geometry and authored materials.

Never use a generated whole-asset redesign as identity proof. Never project generated pixels onto the
shipping asset, and never treat generated normal, AO, roughness, metallic, or collision data as
physically authoritative.

## 5. Iterate in Blender

1. Inspect the connected scene before mutation: collections, units, transforms, parents, materials,
   modifiers, shared datablocks, sockets, collision, and render visibility.
2. Rebuild only the selected component logic in editable, repeatable, idempotent source.
3. Prefer manufacturing-specific sections and joints over generic bevels or stuck-on greebles.
4. Keep the complete surfaced asset visible in the connected Blender window. Use Material Preview
   or Rendered shading as the primary working state, with the intended materials, neighboring
   components, and restrained emission present. Review matched neutral material, hard grazing-light,
   and supported-camera views after each meaningful pass.
5. Use solid/clay, wireframe, material-ID, and channel-isolation views as short diagnostic modes.
   Return immediately to the complete surfaced assembly before deciding whether a change survives.
   Clay can reject construction; it cannot prove material truth or grant acceptance.
6. Ask continuously: "Does this still look like the same asset?" and "Does this look like fabricated
   hardware rather than a model made from software defaults?"
7. Keep, revise, or revert from those images. Do not accept a change because the script ran or the
   object count increased.
8. Derive physical maps from the actual mesh and authored surface information.

For Tier A/B assets, follow the minimum valid-cycle floors in
`design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md`; one self-reviewed render is never the whole
proof. If the same defect survives two repair cycles, change method rather than nudging parameters.
If it survives a third, return to the earlier gate or request independent specialist review.

### Proven controls against the toy/plastic failure mode

Apply these explicitly; Blender defaults are not art direction.

- **Do not start with the primitive.** Start with a component section and assembly sequence:
  rolled/faceted case, hollow bell, folded hat section, plate shell, gusset, saddle, clevis, flange,
  service run, aperture, or formed pressure vessel. A cylinder with rings and boxes attached is still
  a cylinder with rings and boxes attached.
- **Make the surfaced assembly the authoritative working view.** Keep the actual materials applied
  to the complete model in the visible Blender window while authoring. Do not spend an entire pass
  looking at a clay model and defer substance judgment to an external render. After every geometry,
  normal, material, or emission change, inspect the result in Material Preview or Rendered shading
  with adjacent parts present. Use clay only to expose silhouette and construction defects.
- **Use size hierarchy.** Macro shape carries identity; meso parts explain construction; small
  fasteners, clamps, ribs, shutter leaves, and lines explain service. Do not make every detail a
  metre-scale block.
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

Reject the pass if any prominent component is still best described as “tube,” “box,” “torus,”
“glowing disk,” or “smooth lump” rather than by a fabricated part and its interfaces.

## 6. Export and validate

Use `tools/blender/spaceface_export.py` and the asset family's actual source/release workflow. Do not
invent a parallel exporter.

Validate:

- exact source/export/release hashes and build provenance;
- GLB structure, texture roles and KTX2 profiles;
- source and release LODs, sockets, collision, transforms, and runtime identity;
- matched clay, material, grazing-light, normal-route, and supported-size evidence;
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

For a concrete example, inspect:

- `assets/ships/kestrel_borrowed_time_v4/MATERIAL_AND_SHAPE_AUDIT.md`
- `assets/ships/kestrel_borrowed_time_v4/MATERIAL_CONTRACT.json`
- `assets/ships/kestrel_borrowed_time_v4/reference/REFERENCE_PROVENANCE.md`
- `assets/ships/m4_ashline_v2/reference/material_truth_v2/DART_COMPONENT_MATERIAL_BILL.md`
- `assets/ships/m4_ashline_v2/reference/material_truth_v2/REFERENCE_PROVENANCE.md`
- `tools/blender/build_m4_ashline_v2.py`
- `tools/blender/render_m4_ashline_material_truth.py`
- `tools/art/lib/ashlineEvidenceEpoch.mjs`
