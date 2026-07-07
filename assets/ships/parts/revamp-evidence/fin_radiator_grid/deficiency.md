# fin_radiator_grid — Professional Graphics Revamp Deficiency Log

**Story character:** Industrial vented radiator fin — copper coolant pipes, oxidized grid vanes, flow stencil. Per `needed-assets.md`: freighter/miner heat dump fin; NOT Pit starter wedge (`fin_wedge`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for fin_radiator_grid (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_fin_radiator_grid_iter0_{clay_34_full,clay_front,clay_side,clay_top}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Vented grid frame reads at ~4.1m fin scale.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on 2 meshes; chamfer present but flat materials.
- Material zones (2/5): Clay/lit single-tone — hull/mechanical/accent not separated.
- Wear/story (1/5): No heat discolor or copper pipe wear yet.
- Scale truth (5/5): Full fin framed at d≈4.1m.
- Lighting readability (4/5): iter0_lit_34_full shows radiator grid silhouette in HDRI.

**≥5 iter1 targets:** DET grid vane/copper/mount layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for fin_radiator_grid (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_fin_radiator_grid_iter1_{clay_34_full,clay_side,lit_34_full,lit_front,lit_side,lit_close_grid,lit_close_copper,lit_close_mount}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full radiator grid + status lens + mount flange in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + grid vanes + copper pipe started.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (4/5): Hull frame + mechanical grid + accent status lens — 3 roles.
- Wear/story (3/5): Flow stencil geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full fin in frame.
- Lighting readability (4/5): iter1_lit_close_grid shows vane meso detail.

---

## Before iter2 for fin_radiator_grid (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_fin_radiator_grid_iter2_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_grid,lit_close_copper,lit_close_mount,clay_34_full,clay_side}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Industrial radiator unchanged; heat discolor band on grid face.
- Macro/meso/micro (4/5): Oxidized rib + cavity grime DET; panel line on frame flank.
- Bevel language (4/5): Consistent DET bevel language across grid + copper zones.
- Material zones (5/5): Hull + mechanical + accent status lens in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on heat discolor face.
- Scale truth (5/5): Full fin at d≈4.1m.
- Lighting readability (5/5): iter2_lit_close_copper shows copper pipe wear.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat industrial hull.

---

## Before iter3 for fin_radiator_grid (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_fin_radiator_grid_iter3_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_grid,lit_close_copper,lit_close_mount,clay_34_full,clay_side}.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full vented radiator + copper pipes + status lens in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + oxidized ribs + flow stencil; heat discolor on flank.
- Bevel language (4/5): Industrial radiator bevels; NOT Pit starter wedge utilitarian.
- Material zones (5/5): Gunmetal hull + mechanical copper/grid + accent status in lit_34_full.
- Wear/story (5/5): Flow stencil + heat discolor + oxidized rib + mount flange = industrial heat dump; contrast fin_wedge Pit starter stabilizer.
- Scale truth (5/5): Full fin at d≈4.1m.
- Lighting readability (5/5): iter3_lit_close_mount shows mount flange detail; iter3_lit_close_grid shows grid vanes.

**Story fit:** Industrial vented radiator per `needed-assets.md` — coolant flow accountability + heat discolor marks.

**≥6 surfacing techniques:** fin_radiator_grid_trim_sheet_1k, fin_radiator_grid_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, industrial hull clearcoat 0.1, accent emissive status lens 0.2.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 652 tris / 209476 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/fin_radiator_grid/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (heat discolor + copper pipe + flow stencil), deficiency iter0–iter3.

---

## Elite iter4 uplift for fin_radiator_grid (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_fin_radiator_grid_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_grid.png`, `_iter4_lit_close_copper.png`, `_iter4_lit_close_mount.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`fin_radiator_grid_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`fin_radiator_grid_wear_mask_2k.jpg`)
3. Heat flow roughness story map (`fin_radiator_grid_heat_flow_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on grid frame
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on heat discolor + oxidized rib zones
10. Anisotropy/clearcoat industrial gunmetal paint
11. Emissive story accent on status lens + flow stencil
12. Localized decal alpha on faction stripe port + flow stencil

**DET layers (12):** DET_cavity_grime_vent, DET_copper_pipe, DET_faction_stripe_port, DET_flow_stencil, DET_grid_vane_a, DET_grid_vane_b, DET_heat_discolor, DET_micro_scratch_plate, DET_mount_flange, DET_oxidized_rib, DET_panel_line_emphasis, DET_status_lens

**Export/finalize:** **2364 tris / 228064 B** · `PRO Elite Finish 2026-07-06`