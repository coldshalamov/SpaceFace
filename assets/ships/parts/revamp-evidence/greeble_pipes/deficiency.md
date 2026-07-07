# greeble_pipes — Professional Graphics Revamp Deficiency Log

**Story character:** Industrial pipe run greeble — elbow joint, flange, valve wheel, soot staining. Per `needed-assets.md`: freighter/miner fluid routing kit; socket-mountable dorsal pipe cluster.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for greeble_pipes (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_greeble_pipes_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Pipe base + accent/mechanical merged read at ~4.2m cluster scale.
- Macro/meso/micro (2/5): Clean pipe forms; no elbow/flange DET story layers.
- Bevel language (3/5): Bevel mods on meshes; flat clay materials.
- Material zones (2/5): Hull/mechanical/accent not separated in lit passes.
- Wear/story (1/5): No soot stain or valve hardware narrative.
- Scale truth (5/5): Full cluster framed at d≈4.2m.
- Lighting readability (4/5): iter0_lit_34_full shows pipe silhouette in HDRI.

**≥5 iter1 targets:** DET elbow/flange/valve layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for greeble_pipes (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_greeble_pipes_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_elbow/valve/flange.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Pipe run + elbow joint started.
- Macro/meso/micro (3/5): Initial DET layers for valve wheel + flange joint.
- Bevel language (4/5): DET bevel segs=2 on mechanical slabs.
- Material zones (3/5): Hull dark + mechanical pipes + amber valve accent emerging.
- Wear/story (2/5): Flange geometry present; trim/wear not wired.
- Scale truth (5/5): Full cluster in frame.
- Lighting readability (4/5): iter1_lit_close_elbow shows joint meso.

---

## Before iter2 for greeble_pipes (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_greeble_pipes_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_elbow/valve/flange.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Pipe cluster unchanged; mount flange at base.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity vent on run edge.
- Bevel language (4/5): Consistent DET bevel language across elbow + flange zones.
- Material zones (4/5): Hull + mechanical + accent valve in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on elbow bend.
- Scale truth (5/5): Full cluster at d≈4.2m.
- Lighting readability (4/5): iter2_lit_close_flange shows joint wear detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat industrial hull.

---

## Before iter3 for greeble_pipes (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_greeble_pipes_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_elbow/valve/flange.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full pipe cluster + elbow + valve wheel in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + soot zones + dock scuff; rivet rows visible.
- Bevel language (4/5): Industrial pipe bevels; NOT nav-light or hatch greeble.
- Material zones (5/5): Dark hull + mechanical pipes + amber valve accent in lit_34_full.
- Wear/story (4/5): Elbow soot + flange joint + valve wheel = industrial routing character.
- Scale truth (5/5): Full cluster at d≈4.2m.
- Lighting readability (5/5): iter3_lit_close_valve shows wheel detail; iter3_lit_close_elbow shows soot.

**Story fit:** Industrial pipe greeble per manifest — fluid routing + soot staining + valve hardware.

**≥6 surfacing techniques:** greeble_pipes_trim_sheet_1k, greeble_pipes_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, industrial hull clearcoat 0.1, accent valve emissive 0.06.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → Phase 1 baseline. Textures: `assets/ships/parts/textures/greeble_pipes/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (elbow + flange + valve), deficiency iter0–iter3.

---

## Elite iter4 uplift for greeble_pipes (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_greeble_pipes_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_elbow.png`, `_iter4_lit_close_valve.png`, `_iter4_lit_close_flange.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`greeble_pipes_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`greeble_pipes_wear_mask_2k.jpg`)
3. Pipe soot roughness story map (`greeble_pipes_pipe_soot_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on pipe run lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + elbow soot zones
10. Anisotropy/clearcoat industrial hull paint
11. Emissive story accent on valve wheel + edge chamfer band
12. Localized decal alpha on faction stripe port + inspection ticks

**DET layers (12):** DET_cavity_grime_vent, DET_dock_scuff, DET_edge_chamfer_band, DET_faction_stripe_port, DET_flange_joint, DET_inspection_tick, DET_micro_scratch_plate, DET_mount_flange, DET_panel_line_emphasis, DET_pipe_elbow, DET_rivet_row, DET_valve_wheel

**Export/finalize:** **5964 tris / 684356 B** · `PRO Elite Finish 2026-07-06`