# Goal Prompt: Visual Assets Revamp for SpaceFace (Blender MCP)

**Instructions for use:** Copy the entire block below (starting after the --- line) as the main goal or system prompt when briefing yourself or a subagent to perform the visual assets overhaul with the connected Blender MCP. Combine with the full pipeline skill context.

This prompt incorporates professional 3D game design practices: strong character definition, per-asset advanced technique selection, iteration with evaluation renders, optimization within constraints, diversity, and the three-pass structure from the skills.

---

**GOAL: Execute a comprehensive Visual Assets Pass to elevate SpaceFace graphics to professional game standards (target: 3x+ improvement in visual quality, character, polish, and appeal while maintaining excellent performance).**

**Primary starting point:** The main starting ship (player's kestrel / hull_starter and its modular supporting parts: engines, fins, greebles, weapons, cockpits). Make this the flagship example of the new quality.

**Full scope (prioritize after starter):**
- All ship hulls and parts (modular system for variety).
- Stations and large places.
- Guns and thrusters.
- Asteroids and rocks.
- Planets (authored details or improvements to procedural bases).
- Any other authored visual GLBs/props.

**Core principles drawn from professional 3D game asset pipelines:**
- **Character first:** Every asset must have distinct personality. Futuristic and beautiful as a base. Add weathered, painted, decaled elements appropriate to its role/faction (e.g., starter ship = accessible, slightly beat-up industrial with stencils and honest wear; military = disciplined armor with precise panels; pirate = heavily scarred and patched with aggressive markings). Avoid generic or toy-like results.
- **Diversity with cohesion:** Different ships/stations feel unique but share a unified visual language (PBR materials respond consistently, color palettes from game data, hard-surface style).
- **Professional craft:** Strong silhouettes at game distance. Interesting macro-to-micro detail hierarchy. Rich material response (layered PBR with proper variation in roughness, AO, normals). Good lighting interaction. Weathering and decals feel purposeful, not slapped on.
- **Optimization by design (pro game dev standard):** Respect exact tri budgets from parts_manifest. Prefer bakes, trim sheets, vertex colors, and smart node materials over dense geometry or large textures. Use LODs, instancing/variation via Geometry Nodes, shared materials. Result must run smoothly even on modest hardware – no over-modeling.
- **Advanced techniques (chosen per-case):** Do not default to basics. From the full palette of professional techniques (detailed in professional-techniques.md): non-destructive modifier stacks, advanced bevel/boolean workflows, Geometry Nodes for efficient detail and variation, sculpt for organic form, full Shader Editor node groups and layering, procedural + hand-painted hybrid texturing, multiple bake types with post-processing, decals, rigging for life/animation where it adds value, etc. Pick what elevates *this specific asset* most (e.g., heavy GN variation for asteroids, deep node layering + decals for hulls, detailed small-part surfacing for guns).
- **Iteration with rigor:** Never one-pass. For each major asset or pass: inspect current → plan character + techniques → work → produce clean turntable/ortho/lit renders (via MCP) → self-critique (deficiency list naming exact techniques from the doc and how current falls short vs pro standards/bible) → apply fixes using those techniques → repeat until the asset looks professionally designed and 3x better.
- **Performance + release ready:** End every asset with validation through the exact exporter contract, full check suite (assets:live, asset-status, reachability, visual-stability, perf where relevant), release build, and in-game confirmation (screenshots in flight showing improvement at multiple distances, lighting, and faction tints).

**Step-by-step execution (follow the three passes from the skills):**
1. **Preparation (MCP + reads):** 
   - Read the full pipeline skill (especially Visual Assets Pass section), professional-techniques.md (all sections, especially asset-type guidance and MCP best practices), assets/AGENTS.md, SPEC3-F9, parts_manifest.json, bible images, concept art, QUEUE.md.
   - In Blender via MCP: inspect current authored assets for the target (e.g., load hull_starter.glb or create new .blend from it). Get stats (tris, materials, UVs, topology issues). Render current "before" turntables (matcap for form, basic PBR lit for surfacing).
   - Load style references (bible B-002 for ship materials, concepts) as image planes/empties.

2. **For the main starting ship (and each subsequent asset):**
   - **Define character:** Futuristic beautiful core. Weathered/painted/decals matching role (starter: practical, lived-in, beginner-friendly grit with nose art/stencils). Reference game lore/palettes.
   - **Modeling Pass:** Establish/improve base geometry using advanced modeling techniques (full modifier mastery, consistent professional bevels, support loops, GN where efficient, sculpt for refinement, clean quad topology). Iterate with renders vs character refs + techniques doc until form is strong and professional. Respect budget. For modular: ensure good mating and slot compatibility.
   - **Surfacing Pass:** Apply rich layered surfacing. Node groups for reusable wear/decals/panels. Procedural base + hand details. Proper multi-map bakes (AO, roughness variation, normal, emissive). Trim sheets. Faction accents + emissive. Weathering that tells a story. Iterate with lit renders. Make materials beautiful and responsive.
   - **Life & Polish Pass:** Add thruster/gun details with character and subtle animation potential (where it fits without perf cost). Secondary polish, micro details, integration. Final character touches. Animated or multi-state turntables if applicable.
   - **Validate:** Export ONLY via spaceface_export.py (MCP or background). Fix any contract failures. Run all relevant npm check:* commands. Update manifest if new.
   - **Test & Document:** In-game flight tests + screenshots (distance readability, close detail, different lighting, faction variants). Note perf impact. Update iteration log with before/after, techniques used, deficiencies fixed.

3. **Expansion & Systematization:**
   - After starter ship is dramatically improved (showcase quality), apply same process to other core assets following QUEUE and priority (other hulls for diversity, key stations, weapons/thrusters, asteroids, etc.).
   - For procedural assets (planets, some asteroids, some VFX): Improve authored components or provide better inputs for visualFactory/vfx (e.g., better normal maps or detail meshes).
   - Ensure overall game cohesion: consistent material language, lighting response, scale, wear philosophy.

4. **Optimization & Professional Balance:**
   - Always trade for performance where needed (smart LOD thinking, efficient texturing, reuse).
   - Result must feel like a modern released game asset pack: beautiful, characterful, performant, readable, detailed where it counts.

5. **Completion criteria for the pass:**
   - Main starting ship visibly 3x+ better with strong character.
   - Other major categories improved.
   - All updated assets pass exporter + checks + in-game.
   - Documentation of techniques and improvements.
   - Game looks diverse, professional, and polished across all asset types.

**MCP Execution Rules:**
- Prefer execute_blender_code for everything possible (scene setup, modifier stacks, bakes, inspections, renders).
- Always inspect before editing (hierarchy, current stats).
- Use code for repeatable/professional results (e.g., consistent bevel application, bake scene prep).
- Render evaluation images programmatically where feasible for consistency.
- After Blender work: trigger release build steps and checks via terminal if needed.
- Respect all locks, contracts, and release process.

**Constraints (do not break):**
- Modular ship system and assembly logic.
- Exact material roles, ORM contract, chamfer/bevel rules, tri budgets.
- Author in appropriate locations, release to release/parts.
- No unnecessary runtime impact.
- Player ship may blend authored + code-native (coordinate).

**Output format for progress:**
- For each major step/asset: describe character choice, techniques selected and why, key MCP actions, before/after description + (if possible) render paths.
- Deficiency lists and fixes.
- Final check outputs and in-game evidence.
- Recommendations for further passes.

Begin immediately with the main starting ship. Make it the proof of the new professional standard. Then expand. Use the skills as your detailed playbook.

This revamp will make the game look like it was built by a professional team using real 3D game asset pipelines.

---

**End of goal prompt block.**

When using with Blender MCP, prefix or combine with the current skill context and any active .blend or GLB. Iterate until the visual quality jump is obvious and assets have distinct, high-quality character while staying lean and performant.