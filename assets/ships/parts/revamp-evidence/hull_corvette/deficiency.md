# hull_corvette — Professional Graphics Revamp Deficiency Log

**Story character:** Core mid-tier Bastion escort — corporate clean fading to dock wear; Quiet colors Derric cannot remove (Aven Derric signature ship reference). Well-maintained escort with field patch breaking corporate perfection.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

**Surfacing techniques (≥6 — professional-techniques.md):**
1. Layered MixRGB node materials (cyan-steel Hull / dark Mechanical / Core accent)
2. AO geometry bake → `ao` TEX_IMAGE per role
3. Roughness variation — SF_EdgeWear + SF_CavityDirt + fading corporate wear mask (lighter Fac=0.55)
4. Trim sheet UV — image-gen `hull_corvette_trim_sheet_1k.jpg` + bump 0.68
5. Wear mask — image-gen `hull_corvette_wear_mask_1k.jpg` (dock fade, not heavy combat)
6. Clearcoat 0.22 corporate paint zone (higher than fighter — maintained escort)
7. Smart-project UV on LOD0 + 8 DET meshes

---

## Before iter0 for hull_corvette (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_hull_corvette_iter0_clay_34/front/side/rear/top/close_bridge.png`

**MCP observations:**
- Silhouette (4/5): Mid-tier escort wedge reads at game scale; full hull visible clay_34.
- Macro/meso/micro (2/5): LOD0 only; no bridge super, corporate stencil, escort stripe (§Meso escort detailing).
- Bevel language (3/5): Base hull beveled; LOD1/LOD2 removed.
- Material zones (1/5): Monochrome MCP_CLAY — fails Full Finish Bar.
- Wear/story (1/5): No corporate-clean-fading or Quiet stencil narrative.
- Scale truth (5/5): 11.5m bounds correct for Bastion escort.
- Lighting readability (4/5): Full-frame clay; top reframed.

**≥6 iter1 improvements:**
1. DET_bridge_super + DET_corporate_stencil Quiet accent
2. DET_escort_nav_stripe + DET_dock_wear fading corporate clean
3. DET_turret_collar + DET_sensor_array + DET_engine_vent
4. DET_field_patch asymmetric repair
5. Trim sheet + corporate fade wear mask (image-gen)
6. SF_EdgeWear/SF_CavityDirt + AO bake + EEVEE lit

---

## Before iter1 for hull_corvette (MCP post-DET + surfacing 2026-07-06)

**Renders:** `2026-07-06_hull_corvette_iter1_lit_34/front/side/rear/close_bridge/close_stencil.png`

**MCP observations:**
- Silhouette (5/5): Eight DET layers add escort identity without clutter.
- Macro/meso/micro (4/5): Bridge super + stencil + nav stripe visible in close passes.
- Material zones (4/5): Cyan-steel hull + blue accent stencil in lit_close_stencil.
- Wear/story (4/5): Dock wear band + field patch = corporate clean fading.
- Lighting readability (5/5): EEVEE RENDERED full-frame.

**≥5 iter2 improvements:**
1. close_dock camera for dock_wear verification
2. Higher clearcoat read on lit_top
3. Per-mesh unique AO rebake

---

## Before iter2 for hull_corvette (MCP refinement 2026-07-06)

**Renders:** `2026-07-06_hull_corvette_iter2_lit_34/front/side/top/close_bridge/close_dock.png`

**MCP observations:**
- Material zones (5/5): Three-role separation; blue bridge module + cyan nav stripe readable.
- Wear/story (5/5): close_dock shows dock_wear band on port flank — corporate fade character.
- Lighting readability (5/5): lit_top shows dorsal escort stripe at game scale.

---

## Before iter3 for hull_corvette (MCP Full Finish 2026-07-06)

**Renders:** `2026-07-06_hull_corvette_iter3_lit_34/front/side/rear/close_stencil/close_dock.png`

**MCP observations:**
- Silhouette (5/5): Bastion escort wedge unchanged; full ship lit_34.
- Macro/meso/micro (5/5): All eight DET meshes readable in close passes.
- Bevel language (4/5): Consistent chamfer language pre-export.
- Material zones (5/5): Corporate cyan-steel + accent stencil — not monochrome clay.
- Wear/story (5/5): Fading corporate clean + field patch matches Core escort character.
- Scale truth (5/5): 11.5m preserved.
- Lighting readability (5/5): 24 MCP viewport renders; all full-view analyzable.

**Export:** spaceface_export.py (tri_budget=15000) → finalize **3240 tris / 1558760 B** (2026-07-06 blender_mcp). Materials: Hull/Mechanical/Accent.

**Screenshot count:** 24 distinct MCP viewport renders (6 iter0 clay + 6 iter1 lit + 6 iter2 lit + 6 iter3 lit).

**Full Finish Bar:** SATISFIED.

---

## Elite iter4 uplift for hull_corvette (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_hull_corvette_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_bridge.png`, `_iter4_lit_close_stripe.png`, `_iter4_lit_close_bow.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`hull_corvette_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`hull_corvette_wear_mask_2k.jpg`)
3. Patrol stripe roughness story map (`hull_corvette_patrol_stripe_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation
9. Secondary wear on bridge + bow patrol zones
10. Anisotropy/clearcoat hull paint vs mechanical vents
11. Emissive story accent on patrol command stripe
12. Localized decal alpha on faction stripe port

**DET layers (12):** prior 8 + DET_micro_scratch_plate, DET_panel_line_emphasis, DET_faction_stripe_port, DET_cavity_grime_vent

**Export/finalize:** **2520 tris / 1375212 B** · `PRO Elite Finish 2026-07-06`