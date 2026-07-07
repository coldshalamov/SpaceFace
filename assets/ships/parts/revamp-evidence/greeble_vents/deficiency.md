# greeble_vents — Professional Graphics Revamp Deficiency Log

**Story character:** Heat vent greeble cluster — louver slats, exhaust grille, heat discolor zone. Per `needed-assets.md`: industrial/miner hull vent kit; radiator-adjacent dorsal mount.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for greeble_vents (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_greeble_vents_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Vent hull + mechanical merged read at ~3.5m cluster scale.
- Macro/meso/micro (2/5): Clean vent forms; no louver/grille DET story layers.
- Bevel language (3/5): Bevel mods on meshes; flat clay materials.
- Material zones (2/5): Hull/mechanical not separated in lit passes.
- Wear/story (1/5): No heat discolor or louver narrative.
- Scale truth (5/5): Full cluster framed at d≈3.5m.
- Lighting readability (4/5): iter0_lit_34_full shows vent silhouette in HDRI.

**≥5 iter1 targets:** DET louver/grille/heat layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for greeble_vents (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_greeble_vents_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_louver/grille/heat.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Vent frame + louver slats started.
- Macro/meso/micro (3/5): Initial DET layers for exhaust grille + heat discolor.
- Bevel language (4/5): DET bevel segs=2 on mechanical slabs.
- Material zones (3/5): Hull dark + mechanical louvers emerging.
- Wear/story (2/5): Grille geometry present; trim/wear not wired.
- Scale truth (5/5): Full cluster in frame.
- Lighting readability (4/5): iter1_lit_close_louver shows slat meso.

---

## Before iter2 for greeble_vents (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_greeble_vents_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_louver/grille/heat.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Vent cluster unchanged; mount flange at base.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity vent on frame edge.
- Bevel language (4/5): Consistent DET bevel language across louver + grille zones.
- Material zones (4/5): Hull + mechanical louvers in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on heat discolor.
- Scale truth (5/5): Full cluster at d≈3.5m.
- Lighting readability (4/5): iter2_lit_close_grille shows exhaust detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat vent hull.

---

## Before iter3 for greeble_vents (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_greeble_vents_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_louver/grille/heat.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full vent cluster + louvers + exhaust grille in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + heat discolor + dock scuff; rivet rows visible.
- Bevel language (4/5): Industrial vent bevels; NOT pipe or RCS greeble.
- Material zones (5/5): Dark hull + mechanical louvers + accent stripe in lit_34_full.
- Wear/story (4/5): Heat discolor + louver slats + mount flange = miner vent character.
- Scale truth (5/5): Full cluster at d≈3.5m.
- Lighting readability (5/5): iter3_lit_close_heat shows discolor; iter3_lit_close_louver shows slats.

**Story fit:** Heat vent greeble per manifest — louver exhaust + heat staining + industrial mount.

**≥6 surfacing techniques:** greeble_vents_trim_sheet_1k, greeble_vents_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, vent hull clearcoat 0.1, accent stripe emissive 0.08.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → Phase 1 baseline. Textures: `assets/ships/parts/textures/greeble_vents/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (louver + grille + heat discolor), deficiency iter0–iter3.

---

## Elite iter4 uplift for greeble_vents (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_greeble_vents_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_louver.png`, `_iter4_lit_close_grille.png`, `_iter4_lit_close_heat.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`greeble_vents_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`greeble_vents_wear_mask_2k.jpg`)
3. Heat vent roughness story map (`greeble_vents_heat_vent_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on vent frame lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + heat discolor zones
10. Anisotropy/clearcoat industrial vent hull paint
11. Emissive story accent on edge chamfer band + faction stripe
12. Localized decal alpha on inspection ticks + louver slats

**DET layers (12):** DET_cavity_grime_vent, DET_dock_scuff, DET_edge_chamfer_band, DET_exhaust_grille, DET_faction_stripe_port, DET_heat_discolor, DET_inspection_tick, DET_louver_slats, DET_micro_scratch_plate, DET_mount_flange, DET_panel_line_emphasis, DET_rivet_row

**Export/finalize:** **4240 tris / 589816 B** · `PRO Elite Finish 2026-07-06`