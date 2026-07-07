# greeble_armor_plates — Professional Graphics Revamp Deficiency Log

**Story character:** Ablative armor plate greeble cluster — impact scars, bolt rows, ablative patch zones. Per `needed-assets.md`: gunship/corvette dorsal armor kit; socket-mountable greeble for combat hulls.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for greeble_armor_plates (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_greeble_armor_plates_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Stacked armor plates read at ~3.9m cluster scale.
- Macro/meso/micro (2/5): Clean plate forms; no ablative/impact DET story layers.
- Bevel language (3/5): Bevel mods on merged meshes; flat clay materials.
- Material zones (2/5): Hull/mechanical not separated in lit passes.
- Wear/story (1/5): No ablative scorch or impact scar narrative.
- Scale truth (5/5): Full cluster framed at d≈3.9m.
- Lighting readability (4/5): iter0_lit_34_full shows plate stack silhouette in HDRI.

**≥5 iter1 targets:** DET ablative/impact/bolt layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for greeble_armor_plates (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_greeble_armor_plates_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_ablative/impact/bolt.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Plate stack + ablative patch started.
- Macro/meso/micro (3/5): Initial DET layers for impact scar + bolt row.
- Bevel language (4/5): DET bevel segs=2 on hull/mechanical slabs.
- Material zones (3/5): Hull dark + mechanical bolts emerging.
- Wear/story (2/5): Ablative geometry present; trim/wear not wired.
- Scale truth (5/5): Full cluster in frame.
- Lighting readability (4/5): iter1_lit_close_ablative shows patch meso.

---

## Before iter2 for greeble_armor_plates (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_greeble_armor_plates_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_ablative/impact/bolt.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Plate cluster unchanged; mount flange at base.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity vent on edge.
- Bevel language (4/5): Consistent DET bevel language across plate + bolt zones.
- Material zones (4/5): Hull + mechanical bolts in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on impact scar.
- Scale truth (5/5): Full cluster at d≈3.9m.
- Lighting readability (4/5): iter2_lit_close_impact shows scar wear detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat armor hull.

---

## Before iter3 for greeble_armor_plates (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_greeble_armor_plates_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_ablative/impact/bolt.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full armor plate cluster + ablative patch + impact scar in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + inspection ticks + dock scuff; bolt rows visible.
- Bevel language (4/5): Combat armor bevels; NOT antenna greeble or nav-light kit.
- Material zones (5/5): Dark hull + mechanical bolts + accent stripe in lit_34_full.
- Wear/story (4/5): Ablative patch + impact scar + mount flange = gunship armor character.
- Scale truth (5/5): Full cluster at d≈3.9m.
- Lighting readability (5/5): iter3_lit_close_ablative shows patch detail; iter3_lit_close_impact shows scar.

**Story fit:** Ablative armor greeble per manifest — impact scars + ablative zones + bolt hardware.

**≥6 surfacing techniques:** greeble_armor_plates_trim_sheet_1k, greeble_armor_plates_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, armor hull clearcoat 0.1, accent stripe emissive 0.1.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 3492 tris / 337068 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/greeble_armor_plates/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (ablative patch + impact scar + bolt row), deficiency iter0–iter3.

---

## Elite iter4 uplift for greeble_armor_plates (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_greeble_armor_plates_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_ablative.png`, `_iter4_lit_close_impact.png`, `_iter4_lit_close_mount.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`greeble_armor_plates_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`greeble_armor_plates_wear_mask_2k.jpg`)
3. Ablative scorch roughness story map (`greeble_armor_plates_ablative_scorch_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on plate leading edge
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + impact scar zones
10. Anisotropy/clearcoat gunship armor paint
11. Emissive story accent on edge chamfer band + faction stripe
12. Localized decal alpha on inspection ticks + ablative patch

**DET layers (12):** DET_ablative_patch, DET_cavity_grime_vent, DET_dock_scuff, DET_edge_chamfer_band, DET_faction_stripe_port, DET_impact_scar, DET_inspection_tick, DET_micro_scratch_plate, DET_mount_flange, DET_panel_line_emphasis, DET_plate_bolt_row, DET_rivet_row

**Export/finalize:** **4788 tris / 1294756 B** · `PRO Elite Finish 2026-07-06`