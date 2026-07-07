# pod_cargo_container — Professional Graphics Revamp Deficiency Log

**Story character:** Cargo pod — stencil ID plate, impact dent, latch hardware, trade-route scrape wear. Per `needed-assets.md`: cargo pod, stencil IDs, dented, Trade tone.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for pod_cargo_container (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_pod_cargo_container_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Box cargo shell reads at ~3m pod scale.
- Macro/meso/micro (2/5): Clean shell; no stencil/dent/latch DET story layers.
- Bevel language (3/5): Bevel mods on shell; flat clay materials.
- Material zones (2/5): Hull/accent ID plate not separated in lit passes.
- Wear/scrape (1/5): No trade-route dent or stencil narrative.
- Scale truth (5/5): Full pod framed at d≈2.6m.
- Lighting readability (4/5): iter0_lit_34_full shows cargo silhouette in HDRI.

---

## Before iter1 for pod_cargo_container (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_pod_cargo_container_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_stencil/latch/dent/scrape.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Shell + ID plate + latch started.
- Macro/meso/micro (3/5): Initial DET layers for stencil + impact dent.
- Bevel language (4/5): DET bevel segs=2 on latch plate.
- Material zones (3/5): Hull + accent stencil emerging.
- Wear/story (2/5): Dent geometry present; trim/wear not wired.
- Scale truth (5/5): Full pod in frame.
- Lighting readability (4/5): iter1_lit_close_stencil shows ID meso.

---

## Before iter2 for pod_cargo_container (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_pod_cargo_container_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_stencil/latch/dent/scrape.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Cargo pod unchanged; mount flange at hull interface.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity grime on vent edge.
- Bevel language (4/5): Consistent DET bevel language across latch + stencil zones.
- Material zones (4/5): Hull + mechanical latch in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on scrape wear.
- Scale truth (5/5): Full pod at d≈2.6m.
- Lighting readability (4/5): iter2_lit_close_dent shows impact detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat hull paint.

---

## Before iter3 for pod_cargo_container (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_pod_cargo_container_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_stencil/latch/dent/scrape.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full cargo shell + stencil + latch in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + impact dent + scrape wear; rivet rows visible.
- Bevel language (4/5): Trade cargo bevels; NOT utility pod scale.
- Material zones (5/5): Dark hull + mechanical latch + stencil accent in lit_34_full.
- Wear/story (4/5): Stencil ID + impact dent + dock scuff = cargo pod character.
- Scale truth (5/5): Full pod at d≈2.6m.
- Lighting readability (5/5): iter3_lit_close_stencil shows ID; iter3_lit_close_dent shows dent.

**Story fit:** Cargo container per manifest — stencil IDs + impact dent + trade scrape.

**≥6 surfacing techniques:** pod_cargo_container_trim_sheet_1k, pod_cargo_container_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, hull clearcoat 0.1, stencil accent emissive 0.05.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (stencil + latch + dent), deficiency iter0–iter3.

---

## Elite iter4 uplift for pod_cargo_container (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_pod_cargo_container_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_stencil.png`, `_iter4_lit_close_latch.png`, `_iter4_lit_close_dent.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`pod_cargo_container_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`pod_cargo_container_wear_mask_2k.jpg`)
3. Stencil roughness story map (`pod_cargo_container_stencil_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on shell lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on scrape wear + impact dent zones
10. Anisotropy/clearcoat trade hull paint
11. Emissive story accent on trade faction stripe + edge chamfer band
12. Localized decal alpha on cargo stencil + rivet row ticks

**DET layers (12):** DET_cargo_stencil, DET_latch_plate, DET_impact_dent, DET_scrape_wear, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_mount_flange, DET_rivet_row, DET_dock_scuff, DET_faction_stripe_trade, DET_edge_chamfer_band

**Export/finalize:** **5072 tris / 1308984 B** · `PRO Elite Finish 2026-07-06`