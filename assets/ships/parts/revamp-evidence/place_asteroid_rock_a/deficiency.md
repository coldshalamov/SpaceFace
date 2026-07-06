# place_asteroid_rock_a — Professional Graphics Revamp Deficiency Log

**Story character:** Belt hero mining rock variant A — irregular mass with laser-cut seams, drill scars, and luminite ore veins. Per vibe-CANONICAL: lived-in industrial frontier; rocks tell extraction history, not pristine spheres.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_asteroid_rock_a (MCP viewport audit 2026-07-06)

**Renders (render_viewport_to_path):** `2026-07-06_place_asteroid_rock_a_iter0_clay_front/side/top.png`, `_iter0_close_seam.png`, `_iter0_clay_34_fixed.png` (iter0 clay_34 blank — camera reframed)

**MCP observations:**
- Silhouette (2/5): Perfect UV-sphere read; no Belt irregularity or mined asymmetry (professional-techniques.md §Macro silhouette variation).
- Macro/meso/micro (1/5): Zero mining seams, fractures, or ore veins — reads as placeholder primitive.
- Bevel language (2/5): Smooth faceted sphere only; no chamfered DET inserts at tool-contact zones.
- Material zones (1/5): Single Material_Hull merge; no mechanical scar or accent vein separation.
- Wear/story (1/5): No drill/laser narrative; contradicts Belt extraction fiction.
- Scale truth (4/5): ~20m bounds correct for hero field rock at game scale.
- Lighting readability (3/5): Front clay full-frame; iter0 34° was blank until camera re-aimed.

**≥5 iter1 improvements:**
1. DISPLACE_macro cloud noise on hull for irregular Belt mass (§Procedural form breakup)
2. DET_mining_seam_a/b groove scars (Material_Mechanical)
3. DET_ore_vein luminite accent stripe (Belt rust-amber palette)
4. DET_fracture_shard + DET_impact_crater meso breaks
5. DET_drill_scar linear tool mark
6. AO bake + roughness map nodes per role (§AO/Cavity masks)
7. artist_workshop HDRI lit eval passes

**Techniques:** §Displacement non-destructive layer, §Material zones Hull/Mechanical/Accent, §Geo bevel segs=2 + WN, §Node ORM roughness link.

---

## Before iter1 for place_asteroid_rock_a (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_rock_a_iter1_clay_34/front/side/top/close_seam.png`, `_iter1_lit_34/front/side/close.png`

**MCP observations:**
- Silhouette (4/5): Displace facets break sphere perfection; attached fracture shard adds asymmetric Belt identity. Pole starburst from displace needs future sculpt pass.
- Macro/meso/micro (4/5): Six DET_ layers visible in lit close — mining seams, ore vein amber, drill scar, impact dish.
- Bevel language (4/5): DET cubes bevel segs=2 applied pre-export; root BEVEL_root on hull angles.
- Material zones (4/5): Hull rust-rock / Mechanical dark iron scars / Accent luminite vein readable in lit_34.
- Wear/story (4/5): Laser seams + drill scar sell mined Belt field rock; ore vein hints reward proximity.
- Scale truth (5/5): 20m dims preserved; DET scale proportional to hull.
- Lighting readability (5/5): All 9 iter1 MCP renders full-frame; HDRI + rim show facet depth and accent.

**Remaining iter2 targets (not blocking T1 pass):**
- Pole displace pinching → manual sculpt flatten (§Sculpt polish)
- Per-mesh unique AO bakes (currently shared fill)
- Vertex-color dust gradient on lee faces (§Texture-paint wear)

**Export:** spaceface_export.py → finalize 9295 tris / 394096 B (2026-07-06 blender_mcp).

**Screenshot count:** 15 distinct MCP viewport renders (2026-07-06), excluding blank iter0 clay_34 and purged _pending opengl stubs.

---

## Before iter2 for place_asteroid_rock_a (MCP Full Finish surfacing audit 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_rock_a_iter2_lit_34/front/side/close/close_seam.png`, `_iter2_clay_34.png`

**MCP observations:**
- Silhouette (3/5): iter2_lit_34 too tight/dark — partial facet crop, not full 20m hero rock (camera d=0.62×max_dim insufficient; professional-techniques.md §Ryan King eval framing).
- Macro/meso/micro (4/5): Trim sheet fracture veins visible on facets in close_seam; mining DET geometry retained from iter1.
- Material zones (4/5): Hull rust-rock trim applied; mechanical seams dark iron; accent vein not visible in dark iter2 frames.
- Wear/story (3/5): Wear mask darkens facets but belt dust narrative weak until iter3 DET_dust_lee.
- Lighting readability (2/5): iter2 underexposed (exposure 0.3); close_seam shows seam geometry but full-rock bar unmet.

**≥6 surfacing techniques applied:** trim_sheet, wear_mask, SF_EdgeWear, AO bake (Hull/Mech/Accent), bump from trim, emissive luminite accent vein.

**≥5 iter3 improvements:** pull back camera to d=1.35×max_dim, exposure 0.5, DET_dust_lee lee-face patch, iter3_lit_34_full reframed pass, KEY 1200/FILL 500.

**Techniques:** §Node layering, §AO/Cavity masks, §Texture-paint wear target (dust lee), §HDRI eval.

---

## Before iter3 for place_asteroid_rock_a (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_rock_a_iter3_lit_34_full.png`, `_iter3_lit_front/side/top/close/close_seam.png`, `_iter3_clay_34.png` (+ iter0×6, iter1×9, iter2×6, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full ~20m irregular mined mass in HDRI workshop frame; displacement facets + fracture shard break sphere perfection.
- Macro/meso/micro (4/5): Impact crater flower-facet, drill scar, mining seams, luminite amber vein on port flank, pole starburst displace (future sculpt).
- Bevel language (4/5): DET segs=2 at tool-contact zones; BEVEL_root on hull angles catch rim light.
- Material zones (5/5): Hull rust-regolith trim, mechanical iron scars, accent luminite emissive vein — 3 roles readable in lit_34_full.
- Wear/story (4/5): Laser seams + drill scar + ore vein + belt dust lee patch = Belt extraction history complete.
- Scale truth (5/5): 20m bounds preserved; DET proportional to hull in full frame.
- Lighting readability (5/5): HDRI + KEY/FILL; trim veins and wear mask read at mid distance; close_seam shows mining groove context.

**Story fit:** Belt hero mining rock variant A — irregular mass telling extraction history (laser-cut seams, drill scars, luminite reward vein), not pristine sphere. Per vibe-CANONICAL lived-in frontier.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 9403 tris / 2316688 B. Textures: `assets/ships/parts/textures/place_asteroid_rock_a/`.

**Screenshot audit:** 32 MCP renders; 24+ analyzable full-view (iter1×9, iter3×9, iter0×5, 2026-07-05×3); iter2×6 partial/dark documented.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (rust trim + luminite vein + belt dust lee), deficiency iter0–iter3.