# place_asteroid_graffiti — Professional Graphics Revamp Deficiency Log

**Story character:** Tagged asteroid — pirate graffiti tags, spray overspray, ore exposure. Fringe landmark prop.

---

## Before iter0 for place_asteroid_graffiti (MCP baseline 2026-07-05)

**MCP observations:** Silhouette 3/5 · Macro 2/5 · Bevel 2/5 · Zones 2/5 · Wear 1/5 · Scale 4/5 · Light 3/5 — tagged rock placeholder.

## Before iter1 for place_asteroid_graffiti (MCP post-layer 2026-07-05)

**MCP observations:** Bevel segs=2 + WN on hull/accent merged meshes; graffiti narrative not yet surfaced.

## Before iter2 for place_asteroid_graffiti (MCP surfacing pass 2026-07-05)

**Techniques:** AO bake per role, wear→roughness wiring, bevel segs=2, WN last.

## Before iter3 for place_asteroid_graffiti (MCP Full Finish 2026-07-05)

**Full Finish Bar:** PASS — ≥6 surfacing, ≥3 lit PBR, deficiency iter0–iter3.

---

## Elite iter4 uplift for place_asteroid_graffiti (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_graffiti_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_tag.png`, `_iter4_lit_close_spray.png`, `_iter4_lit_close_mark.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_asteroid_graffiti_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_asteroid_graffiti_wear_mask_2k.jpg`)
3. Graffiti stencil roughness story map (`place_asteroid_graffiti_graffiti_stencil_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on fracture face
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on spray overspray + dock scuff zones
10. Anisotropy/clearcoat on graffiti tag accent
11. Emissive story accent on DET_graffiti_tag_a (0.1 strength)
12. Localized decal alpha on pirate mark ticks

**DET layers (12):** DET_graffiti_tag_a, DET_graffiti_tag_b, DET_spray_overspray, DET_fracture_face, DET_ore_exposure, DET_pirate_mark, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_rivet_row, DET_dock_scuff, DET_edge_chamfer_band

**Export/finalize:** **2979 tris / 1168336 B** · `PRO Elite Finish 2026-07-06`