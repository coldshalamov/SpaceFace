---
name: spaceface-blender-hardsurface
description: >
  SpaceFace Blender Surfacing Pass — advanced skins, layers, procedural + painted effects, node groups, trim sheets, wear systems, and all the texturing/filter techniques that create professional material richness. Requires strong Modeling Pass. Use for any asset. Heavily references professional-techniques.md.
---

# SpaceFace Blender — Surfacing Pass (Skins, Layers, Effects, Advanced Techniques on the Polygons)

**This is the pass for everything that happens *on top of and around* the polygons.**

After the Modeling Pass has produced a form that holds up professionally in clay, this pass adds:

- Real material complexity and layering (not 2-3 flat colors)
- Procedural + painted textures, wear systems, filters, effects
- Node-based smart materials, multiple UV channels, decals, trim sheets
- All the advanced surfacing techniques that make Eve-style and modern game ships look rich instead of plastic.

Do not start this pass with a weak model. The base must already be strong.

If you are still "adding a couple more polygons" here, you did the previous pass wrong.

## Prerequisites

- Modeling Pass complete. The base must already show professional form quality.

## Core Mandate of This Pass

Use the full power of Blender's surfacing tools to create rich layered materials, effects, and variation. 

You will not use flat colors or basic single-node materials. Reference and use techniques from `references/professional-techniques.md` (Surfacing section).

## Rigor Protocol

1. Load any provided concept or project bible images as reference planes.
2. Build using many surfacing techniques from the reference doc.
3. Render with basic lighting to evaluate materials and effects.
4. Create deficiency list naming specific missing techniques (e.g., "no node groups for reusable wear", "no procedural + hand hybrid", "flat roughness, no curvature/AO driven variation", "no compositor post on maps").
5. Apply the named techniques.
6. Repeat. Minimum 8-10 specific deficiencies addressed per round.

---

## Mandatory Advanced Surfacing Techniques (you must use the majority)

This is where we stop using only basic Principled + color.

**Shader Editor & Node Power:**
- Create reusable Node Groups for wear, edge highlights, cavity, panel variation.
- Layered materials using Mix Shader, MixRGB, and masks (not just one BSDF).
- Procedural generation with Noise, Voronoi, Musgrave, Wave, Magic textures combined with ColorRamps and Math nodes.
- Use of Geometry input (Position, Normal, Pointiness/curvature) to drive effects.
- Multiple material slots per object with intelligent assignment.

**Texturing & Painting:**
- Texture Paint mode with stencils, masks, and projection.
- Use of multiple UV maps (one for trim sheets, one for unique details).
- Hand-painted wear combined with procedural.
- Baking from shader (roughness, color variation, etc.) in addition to geometry bakes.

**Advanced Effects & Filters:**
- Use of the Compositor for post-bake cleanup, blurring specific channels, dilate, contrast on maps.
- Bump + Normal + Displacement combination where appropriate.
- Clearcoat, anisotropy, or other advanced Principled inputs for metal/plastic variation.
- Decal workflow (separate meshes or UV projected).

**Trim Sheets & Efficiency:**
- Design or use repeating trim sheets for panel lines, rivets, plating.
- UV islands aligned to sheet for consistent texel.
- This is how pros get high detail without millions of tris.

**Wear & Material Variation Systems (the difference between #1 and #4/Eve):**
- Curvature-driven edge wear (lighter roughness on edges).
- Cavity/ AO driven dirt and darkening.
- Directional scratches and streaks.
- Multiple material "zones" (hull paint, mechanical, glass, accent) with proper transitions.
- Rust, chipping, repair patches as layered masks.

**Bake Integration:**
- Proper multi-pass bakes (AO, Normal, Curvature, Roughness variation, Emissive mask, Material ID).
- Pack ORM correctly.
- Use high-poly details to drive low-poly maps.

**Review:**
- Render with basic lighting to judge material response.
- Evaluate against the characteristics in professional-techniques.md.

## Iteration & Artifacts

- `surfacing_iteration_log.md`: deficiency lists naming specific techniques from the reference doc.
- Evaluation renders showing material/layer/effect quality.
- Final maps contact sheet.
- GLB passes exporter.

## Exit criteria

The surfacing must visibly use multiple advanced techniques and produce rich, varied, layered results that would be recognized as professional work. Flat or minimal surfacing fails.

**Next pass:** Life & Polish (the third skill file) — thrusters, guns, animation, secondary life, final advanced finishing touches.

## Anti-patterns (still banned here)

- Treating this as "just add some roughness variation and call it advanced".
- Doing all the work in one Principled node.
- Ignoring node groups and reusability.
- Baking everything from flat colors instead of layered systems.
- Forgetting that 90% of modern pro look comes from sophisticated surfacing work on top of good topology.