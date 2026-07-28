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
4. Review matched clay, neutral material, hard grazing-light, and supported-camera views after each
   meaningful pass.
5. Ask continuously: "Does this still look like the same asset?" and "Does this look like fabricated
   hardware rather than a model made from software defaults?"
6. Keep, revise, or revert from those images. Do not accept a change because the script ran or the
   object count increased.
7. Derive physical maps from the actual mesh and authored surface information.

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
