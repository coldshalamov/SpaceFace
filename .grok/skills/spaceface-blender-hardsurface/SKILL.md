---
name: spaceface-blender-hardsurface
description: >
  Focused SpaceFace Blender pass for material roles, UVs, bakes, decals, wear, and surface response.
  Use when a structurally sound asset looks flat, plastic, noisy, or visually generic.
---

# SpaceFace Blender — Surfacing Pass

## Scope

Use this pass when current evidence shows a material or surface-response problem. It is not a mandate
to cover every asset with wear, decals, nodes, or multiple materials. A clean, sparse, or flat-painted
surface can be intentional when it has convincing form response and identity.

## Desired outcome

- Material roles remain legible under representative game lighting.
- Roughness, normals, AO/contact, color, emissive, and weathering support the form instead of masking it.
- Scale and wear tell a plausible construction/use story appropriate to faction, age, and role.
- Fine detail survives export and the actual camera; noise that disappears or shimmers is removed.
- Maps, UVs, color space, channel packing, and material names satisfy the live exporter/runtime contract.

## Workflow

1. Inspect current materials, image inputs, UVs, map flats, color space, runtime material assignment,
   and representative lit captures.
2. Identify the highest-impact surface defects from evidence.
3. Choose only methods that address them: authored textures, bakes, trim/decal reuse, procedural masks,
   texture paint, layered nodes, vertex data, or simpler material tuning as appropriate.
4. Compare fully framed neutral and lit views plus the normal player route. Fix material defects that
   remain visible; do not pad a deficiency list or apply a majority of a technique menu.
5. Validate source licensing/provenance, map packing, material roles, exporter output, memory/upload
   cost, and in-game response.

## Substance and portability safeguards

- Use broad, low-amplitude per-plate variation only on objects actually assembled from distinct
  plates or batches. Do not smear one Voronoi/noise field across bells, bearings, cable, ceramic,
  glass, and painted sheet and call the result material variety.
- Derive edge wear, soot, heat, exposure, and cavity response from exact geometry or authored
  object-space masks. Blender/Cycles `Pointiness`, object coordinates, and procedural nodes do not
  automatically survive glTF; bake or reproduce only the approved causal signal through the
  family's sanctioned portable PBR pipeline.
- Put wear where handling, abrasion, flow, heat, repair, or exposure explains it. Raw curvature is
  an input, not finished storytelling.
- Use a bounds-fitted camera and a hard lateral key with restrained fill/rim as reproducible
  diagnostics. Record transforms/exposure and keep the camera on the key side for the primary
  material read. These views supplement rather than replace supported gameplay-camera and
  normal-route evidence.
- Keep shadows readable rather than crushed, but never raise fill until metal, paint, ceramic, and
  composite collapse into the same gray response.

## Evidence

- representative before/after lit views with consistent framing;
- map flats or node/material inspection where they clarify the result;
- current player-route evidence;
- concise rationale for important surface decisions;
- exporter, reachability, and relevant runtime checks.

Professional surfacing is the visible result, not the number of nodes, maps, materials, or named
techniques used.
