# greeble_antennas — Professional Graphics Revamp Deficiency Log

**Story character:** Comms antenna greeble cluster — dish mount, coax cable run, beacon lens emissive, inspection ticks. Per `needed-assets.md`: lawful patrol/scanner comms hardware; socket-mountable greeble for hull dorsal.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for greeble_antennas (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_greeble_antennas_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Antenna loop + beacon read as comms cluster at ~2.8m scale.
- Macro/meso/micro (2/5): Clean antenna forms; no dish/coax DET story layers.
- Bevel language (3/5): Bevel mods on merged meshes; flat clay materials.
- Material zones (2/5): Hull/mechanical/accent not separated in lit passes.
- Wear/story (1/5): No beacon emissive story or coax routing narrative.
- Scale truth (5/5): Full cluster framed at d≈2.8m.
- Lighting readability (4/5): iter0_lit_34_full shows antenna silhouette in HDRI.

**≥5 iter1 targets:** DET dish/coax/beacon layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for greeble_antennas (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_greeble_antennas_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_dish/jury/tag.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Loop + beacon + dish mount started.
- Macro/meso/micro (3/5): Initial DET layers for coax + beacon lens.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (3/5): Hull dark + mechanical coax + cyan beacon accent emerging.
- Wear/story (2/5): Beacon geometry present; trim/wear not wired.
- Scale truth (5/5): Full cluster in frame.
- Lighting readability (4/5): iter1_lit_close_dish shows dish mount meso.

---

## Before iter2 for greeble_antennas (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_greeble_antennas_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_dish/jury/tag.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Antenna cluster unchanged; mount flange at base.
- Macro/meso/micro (4/5): Panel line + rivet row DET; coax cable run on dorsal.
- Bevel language (4/5): Consistent DET bevel language across dish + beacon zones.
- Material zones (4/5): Hull + mechanical + accent beacon in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on dish face.
- Scale truth (5/5): Full cluster at d≈2.8m.
- Lighting readability (4/5): iter2_lit_close_dish shows dish wear detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat comms hull.

---

## Before iter3 for greeble_antennas (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_greeble_antennas_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_dish/jury/tag.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full antenna cluster + beacon lens + dish mount in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + inspection ticks + dock scuff; coax routing visible.
- Bevel language (4/5): Comms hardware bevels; NOT nav-light greeble or armor plate.
- Material zones (5/5): Dark hull + mechanical coax + cyan beacon emissive in lit_34_full.
- Wear/story (4/5): Beacon lens + coax run + mount flange = lawful comms greeble character.
- Scale truth (5/5): Full cluster at d≈2.8m.
- Lighting readability (5/5): iter3_lit_close_dish shows dish detail; iter3_lit_close_tag shows inspection tick.

**Story fit:** Comms antenna greeble per manifest — beacon emissive HOOK_Emissive + dish mount + coax routing.

**≥6 surfacing techniques:** greeble_antennas_trim_sheet_1k, greeble_antennas_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, comms hull clearcoat 0.1, accent emissive beacon 0.35.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 2734 tris / 284752 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/greeble_antennas/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (beacon lens + dish mount + coax), deficiency iter0–iter3.

---

## Elite iter4 uplift for greeble_antennas (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_greeble_antennas_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_dish.png`, `_iter4_lit_close_beacon.png`, `_iter4_lit_close_mount.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`greeble_antennas_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`greeble_antennas_wear_mask_2k.jpg`)
3. Beacon stencil roughness story map (`greeble_antennas_beacon_stencil_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on dish rim
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + dish face zones
10. Anisotropy/clearcoat comms hull paint
11. Emissive story accent on beacon lens + edge chamfer band
12. Localized decal alpha on faction stripe port + inspection ticks

**DET layers (12):** DET_beacon_lens, DET_cavity_grime_vent, DET_coax_cable, DET_dish_mount, DET_dock_scuff, DET_edge_chamfer_band, DET_faction_stripe_port, DET_inspection_tick, DET_micro_scratch_plate, DET_mount_flange, DET_panel_line_emphasis, DET_rivet_row

**Export/finalize:** **4030 tris / 953016 B** · `PRO Elite Finish 2026-07-06`