---
name: spaceface-blender-surface-pass
description: >
  SpaceFace Blender Life & Polish Pass — animation/articulation for thrusters/guns/parts, secondary details, rigging, shape keys, final polish and "making it alive" techniques. Requires strong prior passes. Use for hero assets. References professional-techniques.md. Also handles final export validation.
---

# SpaceFace Blender — Life & Polish Pass (Animation, Secondary Details, Making it Alive, Advanced Finishing)

**This is the final professional pass.**

After you have a strong professional form (Modeling Pass) and rich layered surfacing (Surfacing Pass), this pass adds the elements that make the ship *feel alive* and finished at a modern standard:

- Thrusters, engine details, moving parts
- Gun and weapon animations / articulation
- Secondary greebles and details that move or have life
- Advanced finishing touches (extra micro detail, polish passes, integration points)
- Anything that prevents the ship from looking like a static plastic model

The goal is that when the asset is in the game (with runtime VFX and movement), it has the life and polish of the pro references.

## Prerequisites

- Modeling and Surfacing passes must be strong.

## Rigor Protocol

Use the same strict iteration: renders, deficiency lists explicitly naming techniques from professional-techniques.md (Life & Polish section), apply, repeat. Focus on whether the asset feels static and unfinished or has life and polish.

## Mandatory Techniques for Life & Polish

**Animation & Articulation (make it alive):**
- Armatures for moving parts (thrusters, guns, landing gear, hatches).
- Shape keys for deformation (engine glow variation, flex, damage hints).
- Drivers or simple actions that can be triggered at runtime.
- Proper bone naming and export considerations for GLB.

**Secondary Details & Effects Setup:**
- Detailed thruster geometry, cones, glow meshes, particle attachment points.
- Animated or multi-state greebles (rotating elements, pistons).
- Proper sockets/hooks for runtime attachment of beams, projectiles, effects (align with game code needs).

**Advanced Finishing Touches:**
- Final micro greeble and polish pass after surfacing.
- Edge highlights via additional thin geo or normal details.
- Integration of all previous passes (ensure surfacing holds up with moving parts).
- Compositor or post work on final beauty turntables for review.
- Attention to small things: rivet variation, panel wear consistency, light catching on every bevel.

**Advanced Blender Features in this pass:**
- Rigging tools, pose mode, action editor.
- Geometry Nodes for procedural secondary elements or animation drivers.
- Shape key creation and editing.
- Multiple render layers or view layers for polish passes.
- Final high-quality turntable renders with decent lighting to judge "alive" quality.

**Baking & Export Polish:**
- Final validation of all maps.
- Ensure moving parts have correct materials and UVs.
- Export validation is stricter here.

---

## Key Deliverables for this Pass

- Animated or articulated elements for thrusters/guns (armatures or shape keys where they add life).
- Detailed secondary geometry and polish that reads in the final asset.
- All attachment points, sockets, and details needed for runtime "alive" effects.
- Final high-quality turntable renders that demonstrate life and finishing.
- Updated iteration log with deficiencies tied to techniques in professional-techniques.md.

## Exit Criteria

The asset is complete when:
- Modeling pass shows professional form.
- Surfacing pass shows rich layering and effects.
- This pass adds life, movement, and polish so the asset no longer feels static or unfinished.
- All project checks pass.

## Anti-patterns

- Treating life/polish as minimal or skipped.
- No use of rigging or secondary animation techniques.
- Low iteration or review.

These skills are built to force broad, rigorous use of Blender's capabilities on any asset.