# Professional Blender Techniques for Modern Game Spaceships (2026 bar)

**Purpose:** This is the core reference that makes the skills actually force professional work. Every invocation of any pass **must** reference and actively use techniques from here. 

Do not stop at "I added a bevel and some panels." Pros on forums discuss and combine dozens of these. The skills require you to name, apply, and iterate with specific ones.

The bar: Your output (in clay for modeling, lit for surfacing, alive for polish) should reflect the level of craft seen in high-quality modern game assets (EVE-style, recent space games, etc.), adapted to the project's constraints (tri budgets from parts_manifest, modular parts, spaceface_export contract, ORM + normal maps for runtime).

**General Iteration Rule (applies to all passes):** 
- Always set up multiple cameras (orthographic front/side/top + 3/4 perspective + animated turntable).
- Render clean evaluation images (matcap/flat for form; basic HDRI or studio for surfacing).
- Analyze for absence of professional characteristics.
- Write explicit deficiency list naming missing techniques from this doc.
- Apply the named techniques using Blender tools (prefer non-destructive).
- Re-evaluate. Repeat until the work demonstrates the technique in a way that visibly elevates quality.

Use the Blender MCP (`execute_blender_code`) for precision: inspect topology with bmesh, apply modifier stacks correctly, set up bake scenes, validate node links, etc.

Internal references to use when no external concept is provided: assets/concept/ images, assets/bible/*.jpg (especially ship materials board), existing authored parts for consistency.

## Modeling Pass — Professional Form & Topology (use 70%+ of these)

**Non-destructive & Modifier Mastery (core of modern hard surface):**
- Build with full modifier stack in correct order (Bevel after Boolean usually; Weighted Normal last).
- Bevel modifier: segments 2-4, profile 0.5-0.7, use weight or angle limit, miter patterns, spread.
- Boolean with "Exact" solver + post-cleanup (dissolve, limited dissolve, knife).
- Edge Crease + Bevel Weight painting/combination for control without extra geometry.
- Weighted Normal modifier (or Data Transfer) for clean shading on complex surfaces.
- Solidify + Bevel combos for thickness with clean edges.
- Mirror + Bisect + clipping for symmetrical base with asymmetry added later.
- Array + Curve + Deform for pipes, vents, structural repetition.
- Geometry Nodes: Instance on Points for greebles with randomization (scale/rotation/selection), realize only at end.

**Topology & Form Rigor:**
- Quad-dominant on all hero surfaces. Support loops (edge loops) around every hard feature, boolean cut, and inset.
- Consistent bevel radius language across the asset (e.g., small for panel edges, slightly larger for major forms).
- No ngons on visible areas. Use limited dissolve or manual fix.
- Sculpt (Dyntopo or Multires) for organic adjustments to primary forms or initial wear recesses before final retopo.
- High-poly modeling mindset: add supporting geometry for good shading even on final low-poly target.
- Proper support for baking: keep high-frequency detail on separate high-poly or floaters.

**Detail Hierarchy (macro/meso/micro without killing budget):**
- Macro: big structural masses (hulls, bays, rings).
- Meso: panel insets, hatches, armor plates via inset + extrude + bevel.
- Micro: bolts, grilles, vents via kitbash (linked duplicates or GN instances), not modeled one-by-one on low-poly.

**UV & Mesh Prep (start here, don't defer):**
- Advanced unwrap: mark seams intelligently, use pin + relax + minimize stretch, pack with good texel density.
- Multiple UV layers if needed (UVMap for main, UVMap.001 for trims).
- Begin trim sheet thinking: group repeating elements to shared UV space.
- Texel density balancing (use addons or manual checker texture).

**Review Tools:**
- Matcap or "clay" viewport shading for pure form evaluation.
- Turntable animation or multi-view renders.
- bmesh inspection via code for edge sharpness, ngon count, etc.

## Surfacing Pass — Layers, Effects, Textures, Materials (use 70%+ of these)

**Node Power & Layering (this is where most "pro" richness comes from):**
- Build and reuse Node Groups (e.g., "EdgeWear", "CavityDirt", "PanelVariation").
- Layered materials: Mix Shader between multiple Principled BSDFs driven by masks.
- Procedural core: Combine Noise, Voronoi, Musgrave, Wave + ColorRamp + Math nodes for variation.
- Drive effects with Geometry sockets (Position for streaks, Normal/Pointiness for curvature wear, True Normal).
- Multiple material slots + material ID for baking selective effects.

**Texturing & Painting Workflows:**
- Texture Paint with custom brushes, stencils, and mask textures.
- Hybrid: procedural base + hand-painted/sculpted overlays for wear, scratches, dirt.
- Projection painting from reference images (when concept provided).
- Baking from shader (roughness variation, color ID, emission) in addition to geometry bakes.

**Advanced Effects & Polish:**
- Compositor: post-bake passes for edge dilation, Gaussian blur on specific channels, contrast/levels for maps.
- Bump + Normal combo; subtle displacement where runtime supports.
- Principled advanced inputs: Clearcoat for painted metals, Anisotropic for brushed surfaces, IOR/Transmission for glass/lenses.
- Decals: separate low-poly meshes or alpha-masked planes with their own materials.
- Trim sheet application: UV islands snapped to sheet grid.

**Wear & Variation Systems (what separates basic from modern):**
- Curvature/Pointiness + noise for edge wear (lighter roughness, slight color shift on edges).
- AO/Cavity masks for darkening in recesses, dirt accumulation.
- Directional and multi-scale scratches (different noise scales).
- Chipping, rust streaks, repair patches as masked layers with specific albedo/roughness shifts.
- Material zones with believable transitions (hull paint vs mechanical vs accent).

**Baking Best Practices:**
- "Selected to Active" with properly offset cage object (or extrusion + ray distance tuned per asset, test on corners).
- Multiple targeted bakes: AO (multiply safe), Normal (tangent, OpenGL), Curvature, Roughness variation, Emissive mask (pure white on lights only), Material ID.
- Post-process maps in Image Editor or Compositor.
- ORM packing (R=AO, G=Roughness, B=Metallic) matching the contract.

**Efficiency for Game Assets:**
- Detail via maps and smart nodes, not raw geometry.
- Consistent texel density.
- Plan for runtime tinting/accent via specific material slots.

## Life & Polish Pass — Animation, Secondary Details, Finishing (use relevant subset)

**Making it Alive:**
- Armature + bone hierarchy for articulated parts (guns, thrusters, hatches, landing gear).
- Shape keys for state changes (thruster extension, damage, glow pulsing hints).
- Drivers linking shape keys or modifiers to custom properties.
- Geometry Nodes for procedural secondary animation (rotating elements, oscillating pipes).
- Proper export setup (actions, shape keys) so runtime can drive them.

**Secondary & Finishing Details:**
- High-fidelity thruster cones, glow meshes, RCS ports with proper surfacing.
- Micro polish: additional floating details, edge highlights via thin geo or normal enhancement.
- Consistent application of all previous passes to moving parts.
- Attachment points/sockets named per project convention for runtime beams, particles, etc.

**Final Review & Polish:**
- Lit turntables with decent environment to judge material response + life.
- Check for issues only visible in motion or under lighting (shimmering normals, popping details).
- Final validation against export contract.

## General Review & Iteration Standards (all passes)

- Produce evaluation renders that isolate the pass (clay for modeling, basic lit for surfacing, animated for life).
- Deficiency lists must name specific techniques from this document that are missing or poorly executed.
- "Looks okay" is not acceptance. Ask: Does this exhibit the hierarchy, variation, craft, and response of professional work?
- Common failure modes to explicitly avoid: flat materials, insufficient bevels, random greeble, poor bake quality, no layering, low tool usage.
- Leverage MCP for automation and validation (e.g., code to count ngons, verify modifier presence, batch apply bevels, set up consistent bake scenes).

If the work could have been done with only inset, basic bevel on a few edges, and 2-3 flat colors, it fails this skillset. Use the breadth of Blender.

Update this document as new techniques prove valuable on actual assets.

## Asset-Type Specific Guidance

**Ships (modular hard-surface, priority for main starting ship/hull_starter):**
- Start with hull as hero form with strong silhouette, then add modular slots (engines, fins, cockpits, greebles, weapons).
- Character: per ship/faction – e.g. starter = rugged industrial weathered with stenciled decals/graffiti; fighters = sleek aggressive with panel lines and wear from combat; freighters = bulky utilitarian with cargo scars.
- Techniques: full non-destructive stack for hull + GN for greeble variation across instances. Trim sheets for plating. Layered PBR with faction tint + accent emissive. Decals via separate meshes or projected. Weathering via curvature + AO masks (more on leading edges, docking points). Optimize: low tri on hull (respect ~2-6k), heavy use of bakes for micro detail.
- Performance: shared materials, instanced parts where possible, LODs via exporter.

**Stations & Large Props:**
- Architectural hard surface + industrial details. Larger scales allow more macro structure.
- Character: trade hubs = busy with signage/wear; military = armored clean but battle-scarred; blackmarket = gritty patched.
- Techniques: boolean heavy for bays/windows + cleanup; large trim sheets; multiple material zones; emissive for lights/signs. GN for repeated elements like struts.
- Optimization: bigger budgets but still efficient UVs, bakes, no unnecessary geo.

**Guns, Thrusters, Small Parts:**
- High detail in small package. Focus on silhouette from distance + hero detail close.
- Character: functional futuristic with heat marks, bolts, wiring hints.
- Techniques: small high-poly details baked to normal; emissive on barrels/thrusters; layered materials (metal + paint + wear). Simple armatures or GN for moving barrels/recoil if applicable.
- Optimization: very low tri (hundreds), reuse across ships.

**Planets & Asteroids (mostly procedural but improve authored elements):**
- Low poly base + advanced shaders/normals for surface.
- Character: varied by sector (icy, rocky, volcanic) with subtle craters, veins, weathering.
- Techniques (in Blender for hero or detail assets): sculpt for displacement maps, procedural nodes in shader (but since runtime procedural, focus on authored normal/AO overlays or improved visualFactory integration). For authored rocks: high variation via GN scatter + bakes.
- Optimization: heavy procedural in code to avoid many unique meshes.

**Overall Visual Pass Strategy:**
- Per asset: 1. Define character from lore/faction (futuristic beautiful base + appropriate weathering/decals/paint). 2. Choose techniques case-by-case (e.g. GN for asteroids variation, heavy node layering for ship hulls, rigging for guns). 3. Iterate with MCP: model/surface, render turntables in Blender, compare to style bible + concepts, apply fixes. 4. Validate with exporter, run checks. 5. Release build + in-game perf/ visual test.
- Optimization always: stay in budgets, prefer bakes/trim/vertex over dense geo or heavy textures, use LODs, batching, shared assets.
- Diversity: vary wear intensity, decal density, color blocking per type while maintaining cohesive PBR response and readability.
- Professional bar: distance silhouette strong + readable, mid-range interesting forms, close-up rich materials and micro detail without performance cost. Use full PBR (proper AO/rough/normal variation), good lighting response, no flat or toy-like results.

## MCP & Tooling Best Practices for Revamp
- Use execute_blender_code for scene inspection (bpy.data.objects, mesh stats), modifier application, bake setup, validation.
- Load concepts/bible as reference planes.
- Export only via spaceface_export.py.
- After changes: run npm run check:assets:live, check:asset-status, visual tests.
- For perf: profile tris/draw calls in game after updates.