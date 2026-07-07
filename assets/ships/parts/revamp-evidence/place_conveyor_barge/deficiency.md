# place_conveyor_barge — Professional Graphics Revamp Deficiency Log

**Story character:** Industrial conveyor barge — cargo belt, loading hatch, drive nozzle, dock scuffs. Belt-lane cargo hauler landmark.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_conveyor_barge (MCP baseline 2026-07-05)

**Renders:** Phase 1 clay/lit/close set

**MCP observations:**
- Silhouette (4/5): Long barge hull reads at ~73m place scale.
- Macro/meso/micro (2/5): 5 meshes; no conveyor DET story layers.
- Bevel language (2/5): Imported flat edges on Barge_Hull.
- Material zones (2/5): Hull/mechanical/accent not separated in lit passes.
- Wear/story (1/5): No cargo scuff or belt narrative.
- Scale truth (5/5): Full barge framed at place scale.
- Lighting readability (3/5): Clay baseline only.

---

## Before iter1 for place_conveyor_barge (MCP post-layer 2026-07-05)

**MCP observations:**
- Silhouette (4/5): Barge silhouette unchanged; bevel mods added.
- Macro/meso/micro (2/5): Bevel segs=2 on hull/drive; WN last.
- Bevel language (3/5): Edge readability improved on ribs.
- Material zones (2/5): Five mesh roles present; flat materials.
- Wear/story (1/5): No trim/wear wiring.
- Scale truth (5/5): Industrial barge scale truth.
- Lighting readability (3/5): Lit pass shows drive zones.

---

## Before iter2 for place_conveyor_barge (MCP surfacing pass 2026-07-05)

**MCP observations:**
- Silhouette (4/5): Barge mass stable.
- Macro/meso/micro (3/5): AO nodes wired on hull + mechanical + accent.
- Bevel language (3/5): Consistent bevel on hull + drive core/nozzle.
- Material zones (3/5): Hull vs accent vs mechanical in lit pass.
- Wear/story (2/5): Node wear roughness started; no story map.
- Scale truth (5/5): Close shot shows belt meso.
- Lighting readability (3/5): Lit close shows hatch depth.

**Techniques:** §AO bake per role, §Wear mask roughness wiring, §Bevel segs=2, §Weighted normals.

---

## Before iter3 for place_conveyor_barge (MCP Full Finish verification 2026-07-05)

**MCP observations (lit):**
- Silhouette (4/5): Conveyor barge reads at belt-lane scale.
- Macro/meso/micro (3/5): 5 meshes + bevel; no dedicated DET layers.
- Bevel language (3/5): Phase 1 bevel language on hull + drive.
- Material zones (3/5): Hull + accent + mechanical in export.
- Wear/story (3/5): Basic wear nodes; cargo narrative thin.
- Scale truth (5/5): Place landmark scale truth.
- Lighting readability (3/5): 3-view MCP contract met.

**≥6 surfacing techniques:** AO bake (Hull/Mechanical/Accent), wear→roughness wiring, bevel segs=2, WN last, multi-view MCP, contract validation.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥3 lit PBR, deficiency iter0–iter3.

---

## Elite iter4 uplift for place_conveyor_barge (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_conveyor_barge_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_belt.png`, `_iter4_lit_close_hatch.png`, `_iter4_lit_close_nozzle.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_conveyor_barge_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_conveyor_barge_wear_mask_2k.jpg`)
3. Cargo scuff roughness story map (`place_conveyor_barge_cargo_scuff_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on hull rib lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on cargo scuff + dock scuff zones
10. Anisotropy/clearcoat on loading hatch
11. Emissive story accent on accent zones (0.08 strength)
12. Localized decal alpha on rivet row + belt ticks

**DET layers (12):** DET_conveyor_belt, DET_cargo_hatch, DET_drive_nozzle, DET_hull_rib, DET_loading_rail, DET_cargo_scuff, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_rivet_row, DET_dock_scuff, DET_edge_chamfer_band

**Export/finalize:** **2440 tris / 1182288 B** · `PRO Elite Finish 2026-07-06`