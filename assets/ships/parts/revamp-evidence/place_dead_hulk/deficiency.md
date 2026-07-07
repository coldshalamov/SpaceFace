# place_dead_hulk — Professional Graphics Revamp Deficiency Log

**Story character:** Derelict wreck hulk — fractured spine, bridge ruin, dead engine block, salvage gouges, combat scorch. Abandoned sector landmark.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_dead_hulk (MCP baseline 2026-07-05)

**Renders:** `2026-07-05_place_dead_hulk_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (4/5): Broken arc + spine reads as wreck at ~50m scale.
- Macro/meso/micro (2/5): 3 meshes; no salvage DET story layers.
- Bevel language (2/5): Imported flat edges on fracture arc.
- Material zones (2/5): Hull/mechanical/accent not separated in lit passes.
- Wear/story (1/5): No rust decay or scorch narrative.
- Scale truth (5/5): Full hulk framed at place landmark scale.
- Lighting readability (3/5): Clay baseline only.

---

## Before iter1 for place_dead_hulk (MCP post-layer 2026-07-05)

**Renders:** `2026-07-05_place_dead_hulk_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (4/5): Wreck silhouette unchanged; bevel mods added.
- Macro/meso/micro (2/5): Bevel segs=2 on spine/arc/merged; WN last.
- Bevel language (3/5): Edge readability improved on fracture arc.
- Material zones (2/5): Three mesh roles present; flat materials.
- Wear/story (1/5): No trim/wear wiring.
- Scale truth (5/5): Station wreck scale truth.
- Lighting readability (3/5): Lit pass shows fracture zones.

---

## Before iter2 for place_dead_hulk (MCP surfacing pass 2026-07-05)

**Renders:** `2026-07-05_place_dead_hulk_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (4/5): Wreck mass stable.
- Macro/meso/micro (3/5): AO nodes wired on hull + mechanical + accent.
- Bevel language (3/5): Consistent bevel on spine + arc + merged.
- Material zones (3/5): Hull vs accent vs mechanical in lit pass.
- Wear/story (2/5): Node wear roughness started; no story map.
- Scale truth (5/5): Close shot shows fracture meso.
- Lighting readability (3/5): Lit close shows arc depth.

**Techniques:** §AO bake per role, §Wear mask roughness wiring, §Bevel segs=2, §Weighted normals.

---

## Before iter3 for place_dead_hulk (MCP Full Finish verification 2026-07-05)

**Renders:** `2026-07-05_place_dead_hulk_clay.png`, `_lit.png`, `_close.png`

**MCP observations (lit):**
- Silhouette (4/5): Dead hulk reads at sector landmark scale.
- Macro/meso/micro (3/5): 3 meshes + bevel; no dedicated DET layers.
- Bevel language (3/5): Phase 1 bevel language on spine + arc.
- Material zones (3/5): Hull + accent + mechanical in export.
- Wear/story (3/5): Basic wear nodes; wreck narrative thin.
- Scale truth (5/5): Place landmark scale truth.
- Lighting readability (3/5): 3-view MCP contract met.

**Story fit:** Derelict hulk per manifest — fractured wreck, rust decay, battle scars.

**≥6 surfacing techniques:** AO bake (Hull/Mechanical/Accent), wear→roughness wiring, bevel segs=2, WN last, multi-view MCP, contract validation.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥3 lit PBR, deficiency iter0–iter3.

---

## Elite iter4 uplift for place_dead_hulk (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_dead_hulk_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_fracture.png`, `_iter4_lit_close_scorch.png`, `_iter4_lit_close_engine.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_dead_hulk_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_dead_hulk_wear_mask_2k.jpg`)
3. Wreck scorch roughness story map (`place_dead_hulk_wreck_scorch_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on fracture arc lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + salvage gouge zones
10. Anisotropy/clearcoat on scorched accent plate
11. Emissive story accent on DET_scorch_burn (0.05 strength)
12. Localized decal alpha on rivet row + engine block ticks

**DET layers (12):** DET_fracture_arc, DET_bridge_ruin, DET_engine_block, DET_exposed_cable, DET_scorch_burn, DET_salvage_gouge, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_rivet_row, DET_dock_scuff, DET_edge_chamfer_band

**Export/finalize:** **3036 tris / 1193488 B** · `PRO Elite Finish 2026-07-06`