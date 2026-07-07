# pod_utility — Professional Graphics Revamp Deficiency Log

**Story character:** Utility pod — tool latch, hazard stripe, oil stains, industrial scuffs. Per `needed-assets.md`: utility pod, tool scuffs, Industrial tone.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for pod_utility (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_pod_utility_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Cylindrical utility shell reads at ~2m pod scale.
- Macro/meso/micro (2/5): Clean shell; no latch/hazard/oil DET story layers.
- Bevel language (3/5): Bevel mods on shell; flat clay materials.
- Material zones (2/5): Hull/accent band not separated in lit passes.
- Wear/story (1/5): No tool-use or oil stain narrative.
- Scale truth (5/5): Full pod framed at d≈2.4m.
- Lighting readability (4/5): iter0_lit_34_full shows pod silhouette in HDRI.

---

## Before iter1 for pod_utility (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_pod_utility_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_latch/hazard/scuff/oil.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Shell + utility band + latch started.
- Macro/meso/micro (3/5): Initial DET layers for tool latch + hazard stripe.
- Bevel language (4/5): DET bevel segs=2 on mechanical latch.
- Material zones (3/5): Hull + accent band emerging.
- Wear/story (2/5): Latch geometry present; trim/wear not wired.
- Scale truth (5/5): Full pod in frame.
- Lighting readability (4/5): iter1_lit_close_latch shows meso latch detail.

---

## Before iter2 for pod_utility (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_pod_utility_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_latch/hazard/scuff/oil.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Pod unchanged; mount flange at hull interface.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity grime on vent edge.
- Bevel language (4/5): Consistent DET bevel language across latch + hatch zones.
- Material zones (4/5): Hull + mechanical latch in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on dock scuff.
- Scale truth (5/5): Full pod at d≈2.4m.
- Lighting readability (4/5): iter2_lit_close_oil shows oil stain detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat hull paint.

---

## Before iter3 for pod_utility (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_pod_utility_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_latch/hazard/scuff/oil.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full utility shell + band + latch in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + oil stain + hazard stripe; rivet rows visible.
- Bevel language (4/5): Industrial pod bevels; NOT cargo container scale.
- Material zones (5/5): Dark hull + mechanical latch + hazard accent in lit_34_full.
- Wear/story (4/5): Oil stain + tool latch + dock scuff = utility pod character.
- Scale truth (5/5): Full pod at d≈2.4m.
- Lighting readability (5/5): iter3_lit_close_hazard shows stripe; iter3_lit_close_oil shows stain.

**Story fit:** Utility pod per manifest — tool latch + hazard stripe + oil stains + industrial mount.

**≥6 surfacing techniques:** pod_utility_trim_sheet_1k, pod_utility_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, hull clearcoat 0.1, hazard accent emissive 0.08.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (latch + hazard + oil stain), deficiency iter0–iter3.

---

## Elite iter4 uplift for pod_utility (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_pod_utility_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_latch.png`, `_iter4_lit_close_hazard.png`, `_iter4_lit_close_oil.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`pod_utility_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`pod_utility_wear_mask_2k.jpg`)
3. Tool wear roughness story map (`pod_utility_tool_wear_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on shell lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + oil stain zones
10. Anisotropy/clearcoat industrial hull paint
11. Emissive story accent on hazard stripe + edge chamfer band
12. Localized decal alpha on rivet row + access hatch ticks

**DET layers (12):** DET_tool_latch, DET_hazard_stripe, DET_oil_stain, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_mount_flange, DET_rivet_row, DET_dock_scuff, DET_faction_stripe_port, DET_access_hatch, DET_edge_chamfer_band

**Export/finalize:** **3848 tris / 580840 B** · `PRO Elite Finish 2026-07-06`