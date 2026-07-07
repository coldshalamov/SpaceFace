# greeble_hatches — Professional Graphics Revamp Deficiency Log

**Story character:** Access hatch greeble cluster — latch plate, handle grip, hatch seam stencil. Per `needed-assets.md`: freighter/miner hull access kit; socket-mountable maintenance hatch.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for greeble_hatches (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_greeble_hatches_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Hatch frame + handle read at ~3.7m cluster scale.
- Macro/meso/micro (2/5): Clean hatch forms; no latch/seam DET story layers.
- Bevel language (3/5): Bevel mods on merged meshes; flat clay materials.
- Material zones (2/5): Hull/mechanical/accent not separated in lit passes.
- Wear/story (1/5): No hatch stencil or latch wear narrative.
- Scale truth (5/5): Full cluster framed at d≈3.7m.
- Lighting readability (4/5): iter0_lit_34_full shows hatch silhouette in HDRI.

**≥5 iter1 targets:** DET latch/seam/handle layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for greeble_hatches (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_greeble_hatches_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_latch/handle/seam.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Hatch frame + handle + latch plate started.
- Macro/meso/micro (3/5): Initial DET layers for seam + handle grip.
- Bevel language (4/5): DET bevel segs=2 on hull/mechanical slabs.
- Material zones (3/5): Hull dark + mechanical latch + amber handle accent emerging.
- Wear/story (2/5): Latch geometry present; trim/wear not wired.
- Scale truth (5/5): Full cluster in frame.
- Lighting readability (4/5): iter1_lit_close_latch shows latch meso.

---

## Before iter2 for greeble_hatches (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_greeble_hatches_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_latch/handle/seam.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Hatch cluster unchanged; mount flange at base.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity vent on frame edge.
- Bevel language (4/5): Consistent DET bevel language across hatch + latch zones.
- Material zones (4/5): Hull + mechanical + accent handle in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on hatch seam.
- Scale truth (5/5): Full cluster at d≈3.7m.
- Lighting readability (4/5): iter2_lit_close_seam shows seam wear detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat maintenance hull.

---

## Before iter3 for greeble_hatches (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_greeble_hatches_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_latch/handle/seam.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full hatch cluster + latch + handle grip in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + inspection ticks + dock scuff; rivet rows visible.
- Bevel language (4/5): Maintenance hatch bevels; NOT armor plate or antenna greeble.
- Material zones (5/5): Dark hull + mechanical latch + amber handle accent in lit_34_full.
- Wear/story (4/5): Hatch seam + latch plate + handle grip = freighter access character.
- Scale truth (5/5): Full cluster at d≈3.7m.
- Lighting readability (5/5): iter3_lit_close_handle shows grip detail; iter3_lit_close_seam shows stencil.

**Story fit:** Access hatch greeble per manifest — maintenance latch + hatch stencil + handle wear.

**≥6 surfacing techniques:** greeble_hatches_trim_sheet_1k, greeble_hatches_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, maintenance hull clearcoat 0.1, accent handle emissive 0.08.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → Phase 1 baseline. Textures: `assets/ships/parts/textures/greeble_hatches/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (latch + seam + handle), deficiency iter0–iter3.

---

## Elite iter4 uplift for greeble_hatches (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_greeble_hatches_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_latch.png`, `_iter4_lit_close_handle.png`, `_iter4_lit_close_seam.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`greeble_hatches_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`greeble_hatches_wear_mask_2k.jpg`)
3. Hatch stencil roughness story map (`greeble_hatches_hatch_stencil_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on hatch frame lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + latch contact zones
10. Anisotropy/clearcoat maintenance hull paint
11. Emissive story accent on handle grip + edge chamfer band
12. Localized decal alpha on hatch seam + inspection ticks

**DET layers (12):** DET_cavity_grime_vent, DET_dock_scuff, DET_edge_chamfer_band, DET_faction_stripe_port, DET_handle_grip, DET_hatch_seam, DET_inspection_tick, DET_latch_plate, DET_micro_scratch_plate, DET_mount_flange, DET_panel_line_emphasis, DET_rivet_row

**Export/finalize:** **8580 tris / 1513880 B** · `PRO Elite Finish 2026-07-06`