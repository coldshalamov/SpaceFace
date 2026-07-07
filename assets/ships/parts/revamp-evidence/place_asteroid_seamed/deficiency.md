# place_asteroid_seamed — Professional Graphics Revamp Deficiency Log

**Story character:** Mined seam asteroid — ore vein, drill marks, fracture face, dust coat. Per `needed-assets.md`: mined seam asteroid, tool marks, Belt tone.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_asteroid_seamed (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_seamed_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Irregular asteroid mass reads at ~20m place scale.
- Macro/meso/micro (2/5): Clean rock; no ore vein or drill DET story layers.
- Bevel language (3/5): Bevel mods on hull; flat clay materials.
- Material zones (2/5): Rock/accent vein not separated in lit passes.
- Wear/story (1/5): No mining seam or drill narrative.
- Scale truth (5/5): Full asteroid framed at d≈2.8m.
- Lighting readability (4/5): iter0_lit_34_full shows mass silhouette in HDRI.

---

## Before iter1 for place_asteroid_seamed (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_seamed_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_seam/vein/drill/pick/fracture/dust.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Rock mass + ore vein started.
- Macro/meso/micro (3/5): Initial DET layers for mining seam + drill mark.
- Bevel language (4/5): DET bevel segs=2 on fracture face.
- Material zones (3/5): Rock hull + accent vein emerging.
- Wear/story (2/5): Drill geometry present; trim/wear not wired.
- Scale truth (5/5): Full asteroid in frame.
- Lighting readability (4/5): iter1_lit_close_seam shows seam meso.

---

## Before iter2 for place_asteroid_seamed (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_seamed_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_seam/vein/drill/pick/fracture/dust.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Asteroid unchanged; dust coat on upper face.
- Macro/meso/micro (4/5): Panel line + pick scar DET; cavity grime on fracture edge.
- Bevel language (4/5): Consistent DET bevel language across vein + drill zones.
- Material zones (4/5): Rock hull + ore accent in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on dust coat.
- Scale truth (5/5): Full asteroid at d≈2.8m.
- Lighting readability (4/5): iter2_lit_close_vein shows ore detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Ore vein emissive.

---

## Before iter3 for place_asteroid_seamed (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_seamed_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_seam/vein/drill/pick/fracture/dust.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full mined asteroid + seam + vein in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + drill marks + dust coat; pick scars visible.
- Bevel language (4/5): Belt mining bevels; place landmark scale truth.
- Material zones (5/5): Dark rock hull + ore accent vein in lit_34_full.
- Wear/story (4/5): Mining seam + drill marks + fracture = belt asteroid character.
- Scale truth (5/5): Full asteroid at d≈2.8m.
- Lighting readability (5/5): iter3_lit_close_drill shows tool marks; iter3_lit_close_vein shows ore.

**Story fit:** Mined seam asteroid per manifest — ore vein + drill scars + dust coat.

**≥6 surfacing techniques:** place_asteroid_seamed_trim_sheet_1k, place_asteroid_seamed_wear_mask_1k, AO bake (Hull/Accent), wear→roughness wiring, ore vein emissive 0.08, ore dust roughness story.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (seam + vein + drill), deficiency iter0–iter3.

---

## Elite iter4 uplift for place_asteroid_seamed (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_seamed_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_seam.png`, `_iter4_lit_close_vein.png`, `_iter4_lit_close_drill.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_asteroid_seamed_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_asteroid_seamed_wear_mask_2k.jpg`)
3. Ore vein roughness story map (`place_asteroid_seamed_ore_vein_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on fracture lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dust coat + pick scar zones
10. Anisotropy/clearcoat weathered rock paint
11. Emissive story accent on ore vein + mining seam
12. Localized decal alpha on drill mark + rivet row ticks

**DET layers (12):** DET_ore_vein, DET_drill_mark, DET_mining_seam, DET_fracture_face, DET_pick_scar, DET_dust_coat, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_mount_flange, DET_rivet_row, DET_edge_chamfer_band

**Export/finalize:** **3881 tris / 1286844 B** · `PRO Elite Finish 2026-07-06`