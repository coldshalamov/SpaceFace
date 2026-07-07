# place_asteroid_rock_b — Professional Graphics Revamp Deficiency Log

**Story character:** Belt mining rock variant B — irregular mass with extraction seams, ore vein, drill scars.

---

## Before iter0 for place_asteroid_rock_b (MCP baseline 2026-07-05)

**MCP observations:** Silhouette 3/5 · Macro 2/5 · Bevel 2/5 · Zones 2/5 · Wear 1/5 · Scale 4/5 · Light 3/5

## Before iter1 for place_asteroid_rock_b (MCP post-layer 2026-07-05)

**MCP observations:** Bevel segs=2 + WN on hull merged mesh.

## Before iter2 for place_asteroid_rock_b (MCP surfacing pass 2026-07-05)

**Techniques:** AO bake per role, wear→roughness wiring, bevel segs=2, WN last.

## Before iter3 for place_asteroid_rock_b (MCP Full Finish 2026-07-05)

**Full Finish Bar:** PASS — ≥6 surfacing, ≥3 lit PBR, deficiency iter0–iter3.

---

## Elite iter4 uplift for place_asteroid_rock_b (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_asteroid_rock_b_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_seam.png`, `_iter4_lit_close_vein.png`, `_iter4_lit_close_fracture.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_asteroid_rock_b_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_asteroid_rock_b_wear_mask_2k.jpg`)
3. Ore vein roughness story map (`place_asteroid_rock_b_ore_vein_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on fracture lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_fissure
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_facets)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on regolith crust + dust lee zones
10. Anisotropy/clearcoat on ore vein accent
11. Emissive story accent on DET_ore_vein (0.08 strength)
12. Localized decal alpha on micrometeor pit ticks

**DET layers (12):** DET_mining_seam_a, DET_mining_seam_b, DET_ore_vein, DET_fracture_shard, DET_impact_crater, DET_drill_scar, DET_dust_lee, DET_regolith_crust, DET_micrometeor_pit, DET_panel_line_emphasis, DET_micro_scratch_facets, DET_cavity_grime_fissure

**Export/finalize:** **4076 tris / 1273984 B** · `PRO Elite Finish 2026-07-06`