# place_nav_buoy — Professional Graphics Revamp Deficiency Log

**Story character:** Sector boundary nav buoy — barrel/collar, marine scuff, nav strobe, ID plate. Per `needed-assets.md`: sector boundary marker, Universal tone.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_nav_buoy (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_place_nav_buoy_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Barrel + collar buoy reads at ~3m marker scale.
- Macro/meso/micro (2/5): Clean barrel; no nav strobe or marine scuff DET layers.
- Bevel language (3/5): Bevel mods on collar; flat clay materials.
- Material zones (2/5): Hull/accent stripe not separated in lit passes.
- Wear/story (1/5): No marine dock scuff or sector ID narrative.
- Scale truth (5/5): Full buoy framed at d≈2.4m.
- Lighting readability (4/5): iter0_lit_34_full shows buoy silhouette in HDRI.

---

## Before iter1 for place_nav_buoy (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_place_nav_buoy_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_nav/barrel/collar/stripe/plate/scuff.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Barrel + collar + sector stripe started.
- Macro/meso/micro (3/5): Initial DET layers for nav strobe + ID plate.
- Bevel language (4/5): DET bevel segs=2 on collar ring.
- Material zones (3/5): Hull barrel + accent stripe emerging.
- Wear/story (2/5): Marine scuff geometry present; trim/wear not wired.
- Scale truth (5/5): Full buoy in frame.
- Lighting readability (4/5): iter1_lit_close_nav shows strobe meso.

---

## Before iter2 for place_nav_buoy (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_place_nav_buoy_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_nav/barrel/collar/stripe/plate/scuff.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Buoy unchanged; mount flange at base interface.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity grime on vent edge.
- Bevel language (4/5): Consistent DET bevel language across barrel + collar zones.
- Material zones (4/5): Hull barrel + mechanical collar in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on dock scuff.
- Scale truth (5/5): Full buoy at d≈2.4m.
- Lighting readability (4/5): iter2_lit_close_barrel shows barrel detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Nav strobe emissive.

---

## Before iter3 for place_nav_buoy (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_place_nav_buoy_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_nav/barrel/collar/stripe/plate/scuff.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full nav buoy + strobe + collar in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + marine scuff + sector stripe; rivet rows visible.
- Bevel language (4/5): Universal nav buoy bevels; landmark scale truth.
- Material zones (5/5): Dark hull barrel + cyan nav accent in lit_34_full.
- Wear/story (4/5): Marine scuff + ID plate + nav strobe = sector marker character.
- Scale truth (5/5): Full buoy at d≈2.4m.
- Lighting readability (5/5): iter3_lit_close_collar shows ring; iter3_lit_close_nav shows strobe.

**Story fit:** Nav buoy per manifest — sector boundary marker + marine wear + ID plate.

**≥6 surfacing techniques:** place_nav_buoy_trim_sheet_1k, place_nav_buoy_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, nav strobe emissive 0.12, marine scuff roughness story.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (nav + barrel + collar), deficiency iter0–iter3.

---

## Elite iter4 uplift for place_nav_buoy (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_nav_buoy_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_nav.png`, `_iter4_lit_close_barrel.png`, `_iter4_lit_close_collar.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_nav_buoy_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_nav_buoy_wear_mask_2k.jpg`)
3. Marine scuff roughness story map (`place_nav_buoy_marine_scuff_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on barrel lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + collar contact zones
10. Anisotropy/clearcoat marine hull paint
11. Emissive story accent on nav strobe + sector stripe
12. Localized decal alpha on ID plate + rivet row ticks

**DET layers (12):** DET_nav_strobe, DET_sector_stripe, DET_buoy_barrel_panel, DET_collar_ring, DET_id_plate, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_mount_flange, DET_rivet_row, DET_dock_scuff, DET_edge_chamfer_band

**Export/finalize:** **2652 tris / 892364 B** · `PRO Elite Finish 2026-07-06`