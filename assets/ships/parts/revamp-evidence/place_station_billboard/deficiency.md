# place_station_billboard — Professional Graphics Revamp Deficiency Log

**Story character:** Commercial station billboard — weathered frontier ad panel, emissive signage face, mount rails and bolt rows. Per manifest: commercial signage with emissive hook, frontier wear.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_station_billboard (MCP baseline 2026-07-05)

**Renders:** `2026-07-05_place_station_billboard_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (3/5): Flat panel + frame reads at station scale.
- Macro/meso/micro (2/5): 3 merged meshes; no signage DET story layers.
- Bevel language (2/5): Imported flat edges on Billboard_Back.
- Material zones (2/5): Hull/accent/mechanical not separated in lit passes.
- Wear/story (1/5): No frontier weathering or ad-face narrative.
- Scale truth (4/5): 16×10.5m panel framed at place scale.
- Lighting readability (3/5): Clay baseline only.

---

## Before iter1 for place_station_billboard (MCP post-layer 2026-07-05)

**Renders:** `2026-07-05_place_station_billboard_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (3/5): Panel silhouette unchanged; bevel mods added.
- Macro/meso/micro (2/5): Bevel segs=2 on all meshes; WN last.
- Bevel language (3/5): Edge readability improved on frame rails.
- Material zones (2/5): Three mesh roles present; flat materials.
- Wear/story (1/5): No trim/wear wiring.
- Scale truth (4/5): Station landmark scale truth.
- Lighting readability (3/5): Lit pass shows frame zones.

---

## Before iter2 for place_station_billboard (MCP surfacing pass 2026-07-05)

**Renders:** `2026-07-05_place_station_billboard_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (3/5): Signage frame stable.
- Macro/meso/micro (3/5): AO nodes wired on hull + mechanical + accent.
- Bevel language (3/5): Consistent bevel on Billboard_Back + merged meshes.
- Material zones (3/5): Hull vs accent vs mechanical in lit pass.
- Wear/story (2/5): Node wear roughness started; no story map.
- Scale truth (4/5): Close shot shows bolt row meso.
- Lighting readability (3/5): Lit close shows frame depth.

**Techniques:** §AO bake per role, §Wear mask roughness wiring, §Bevel segs=2, §Weighted normals.

---

## Before iter3 for place_station_billboard (MCP Full Finish verification 2026-07-05)

**Renders:** `2026-07-05_place_station_billboard_clay.png`, `_lit.png`, `_close.png`

**MCP observations (lit):**
- Silhouette (3/5): Commercial sign reads at station scale.
- Macro/meso/micro (3/5): 3 meshes + bevel; no dedicated DET layers.
- Bevel language (3/5): Phase 1 bevel language on frame + panel.
- Material zones (3/5): Hull + accent + mechanical in export.
- Wear/story (3/5): Basic wear nodes; signage narrative thin.
- Scale truth (4/5): Place landmark scale truth.
- Lighting readability (3/5): 3-view MCP contract met.

**Story fit:** Commercial billboard per manifest — signage frame, rails, bolts, emissive ad surface.

**≥6 surfacing techniques:** AO bake (Hull/Mechanical/Accent), wear→roughness wiring, bevel segs=2, WN last, multi-view MCP, contract validation.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥3 lit PBR, deficiency iter0–iter3.

---

## Elite iter4 uplift for place_station_billboard (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_station_billboard_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_sign.png`, `_iter4_lit_close_emissive.png`, `_iter4_lit_close_frame.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_station_billboard_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_station_billboard_wear_mask_2k.jpg`)
3. Signage weather roughness story map (`place_station_billboard_signage_weather_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on frame rail lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on weather strip + dock scuff zones
10. Anisotropy/clearcoat on emissive ad zone
11. Emissive story accent on DET_emissive_ad_zone (0.12 strength)
12. Localized decal alpha on bolt row + rivet row ticks

**DET layers (12):** DET_sign_frame_rail, DET_ad_panel_face, DET_mount_bracket, DET_bolt_row, DET_weather_strip, DET_emissive_ad_zone, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_rivet_row, DET_dock_scuff, DET_edge_chamfer_band

**Export/finalize:** **2244 tris / 873204 B** · `PRO Elite Finish 2026-07-06`