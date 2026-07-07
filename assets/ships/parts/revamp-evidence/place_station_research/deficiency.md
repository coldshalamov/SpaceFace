# place_station_research — deficiency log

## Before iter0 for place_station_research (MCP baseline 2026-07-05)
**MCP observations:** Silhouette 3/5 · Macro 2/5 · Bevel 2/5 · Zones 2/5 · Wear 1/5 · Scale 4/5 · Light 3/5

## Before iter1 for place_station_research (MCP post-layer 2026-07-05)
**MCP observations:** Bevel segs=2 + WN on primary station meshes.

## Before iter2 for place_station_research (MCP surfacing pass 2026-07-05)
**Techniques:** AO bake per role, wear→roughness wiring, bevel segs=2, WN last.

## Before iter3 for place_station_research (MCP Full Finish 2026-07-05)
**Full Finish Bar:** PASS — ≥6 surfacing, ≥3 lit PBR, deficiency iter0–iter3.

## Elite iter4 uplift for place_station_research (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_station_research_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_story.png`, `_iter4_lit_close_dock.png`, `_iter4_lit_close_detail.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_station_research_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_station_research_wear_mask_2k.jpg`)
3. Story roughness map (`place_station_research_sensor_wear_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + deck traffic zones
10. Anisotropy/clearcoat on accent story zones
11. Emissive story accent on DET_primary_story_a (0.1 strength)
12. Localized decal alpha on rivet row ticks

**DET layers (12):** DET_primary_story_a, DET_primary_story_b, DET_dock_collar, DET_antenna_mast, DET_cargo_rib, DET_deck_traffic_wear, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_rivet_row, DET_dock_scuff, DET_edge_chamfer_band

**Export/finalize:** **2175 tris / 514604 B** · `PRO Elite Finish 2026-07-06`
