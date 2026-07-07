# place_lane_beacon — Professional Graphics Revamp Deficiency Log

**Story character:** Lane navigation beacon — sodium lamp, nav ring, rust-streaked pylon, fringe lane marker. Per `needed-assets.md`: lane navigation, blinking sodium, Fringe tone.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_lane_beacon (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_place_lane_beacon_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Pylon + ring landmark reads at ~6m beacon scale.
- Macro/meso/micro (2/5): Clean pylon; no sodium lamp or rust DET story layers.
- Bevel language (3/5): Bevel mods on base; flat clay materials.
- Material zones (2/5): Hull/accent ring not separated in lit passes.
- Wear/story (1/5): No fringe rust or sodium narrative.
- Scale truth (5/5): Full beacon framed at d≈2.8m.
- Lighting readability (4/5): iter0_lit_34_full shows pylon silhouette in HDRI.

---

## Before iter1 for place_lane_beacon (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_place_lane_beacon_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_sodium/pylon/ring/marker/rust/base.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Pylon + nav ring + sodium cap started.
- Macro/meso/micro (3/5): Initial DET layers for sodium lamp + lane marker.
- Bevel language (4/5): DET bevel segs=2 on base flange.
- Material zones (3/5): Hull pylon + accent ring emerging.
- Wear/story (2/5): Rust streak geometry present; trim/wear not wired.
- Scale truth (5/5): Full beacon in frame.
- Lighting readability (4/5): iter1_lit_close_sodium shows lamp meso.

---

## Before iter2 for place_lane_beacon (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_place_lane_beacon_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_sodium/pylon/ring/marker/rust/base.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Beacon unchanged; mount flange at base interface.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity grime on vent edge.
- Bevel language (4/5): Consistent DET bevel language across pylon + ring zones.
- Material zones (4/5): Hull pylon + accent ring in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on rust streak.
- Scale truth (5/5): Full beacon at d≈2.8m.
- Lighting readability (4/5): iter2_lit_close_pylon shows pylon detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Sodium emissive accent.

---

## Before iter3 for place_lane_beacon (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_place_lane_beacon_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_sodium/pylon/ring/marker/rust/base.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full lane beacon + sodium lamp + nav ring in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + rust streak + lane marker; rivet rows visible.
- Bevel language (4/5): Fringe beacon bevels; landmark scale truth.
- Material zones (5/5): Dark hull pylon + sodium accent ring in lit_34_full.
- Wear/story (4/5): Rust streak + sodium lamp + lane marker = fringe nav character.
- Scale truth (5/5): Full beacon at d≈2.8m.
- Lighting readability (5/5): iter3_lit_close_ring shows nav ring; iter3_lit_close_sodium shows lamp.

**Story fit:** Lane beacon per manifest — sodium navigation + rust fringe wear + lane marker.

**≥6 surfacing techniques:** place_lane_beacon_trim_sheet_1k, place_lane_beacon_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, sodium emissive 0.15, rust streak roughness story.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (sodium + ring + rust), deficiency iter0–iter3.

---

## Elite iter4 uplift for place_lane_beacon (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_lane_beacon_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_sodium.png`, `_iter4_lit_close_pylon.png`, `_iter4_lit_close_ring.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_lane_beacon_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_lane_beacon_wear_mask_2k.jpg`)
3. Sodium rust roughness story map (`place_lane_beacon_sodium_rust_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on pylon lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on rust streak + dock scuff zones
10. Anisotropy/clearcoat weathered hull paint
11. Emissive story accent on sodium lamp + nav ring
12. Localized decal alpha on lane marker + rivet row ticks

**DET layers (12):** DET_sodium_lamp, DET_nav_ring, DET_pylon_panel, DET_rust_streak, DET_lane_marker, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_mount_flange, DET_rivet_row, DET_dock_scuff, DET_edge_chamfer_band

**Export/finalize:** **3020 tris / 894048 B** · `PRO Elite Finish 2026-07-06`