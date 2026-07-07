# greeble_rcs — Professional Graphics Revamp Deficiency Log

**Story character:** Reaction-control thruster greeble — nozzle, reaction block, fuel line, burn scorch. Per `needed-assets.md`: attitude-control kit for corvette/multirole dorsal mount.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for greeble_rcs (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_greeble_rcs_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): RCS base + mechanical merged read at ~2.5m cluster scale.
- Macro/meso/micro (2/5): Clean RCS forms; no nozzle/block DET story layers.
- Bevel language (3/5): Bevel mods on meshes; flat clay materials.
- Material zones (2/5): Hull/mechanical/accent not separated in lit passes.
- Wear/story (1/5): No burn scorch or fuel line narrative.
- Scale truth (5/5): Full cluster framed at d≈2.5m.
- Lighting readability (4/5): iter0_lit_34_full shows RCS silhouette in HDRI.

**≥5 iter1 targets:** DET nozzle/block/fuel layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for greeble_rcs (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_greeble_rcs_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_nozzle/block/mount.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): RCS base + thruster nozzle started.
- Macro/meso/micro (3/5): Initial DET layers for reaction block + fuel line.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (3/5): Hull dark + mechanical block + cyan nozzle accent emerging.
- Wear/story (2/5): Nozzle geometry present; trim/wear not wired.
- Scale truth (5/5): Full cluster in frame.
- Lighting readability (4/5): iter1_lit_close_nozzle shows nozzle meso.

---

## Before iter2 for greeble_rcs (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_greeble_rcs_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_nozzle/block/mount.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): RCS cluster unchanged; mount flange at base.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity vent on block edge.
- Bevel language (4/5): Consistent DET bevel language across nozzle + block zones.
- Material zones (4/5): Hull + mechanical + accent nozzle in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on nozzle throat.
- Scale truth (5/5): Full cluster at d≈2.5m.
- Lighting readability (4/5): iter2_lit_close_block shows reaction block detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat RCS hull.

---

## Before iter3 for greeble_rcs (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_greeble_rcs_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_nozzle/block/mount.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full RCS cluster + nozzle + reaction block in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + fuel line + dock scuff; rivet rows visible.
- Bevel language (4/5): Attitude-control bevels; NOT nav-light or pipe greeble.
- Material zones (5/5): Dark hull + mechanical block + cyan emissive nozzle in lit_34_full.
- Wear/story (4/5): Burn scorch + fuel line + mount flange = RCS attitude character.
- Scale truth (5/5): Full cluster at d≈2.5m.
- Lighting readability (5/5): iter3_lit_close_nozzle shows emissive throat; iter3_lit_close_block shows block.

**Story fit:** RCS greeble per manifest — attitude thruster nozzle + reaction block + burn staining.

**≥6 surfacing techniques:** greeble_rcs_trim_sheet_1k, greeble_rcs_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, RCS hull clearcoat 0.1, accent nozzle emissive 0.25.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → Phase 1 baseline. Textures: `assets/ships/parts/textures/greeble_rcs/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (nozzle + block + fuel line), deficiency iter0–iter3.

---

## Elite iter4 uplift for greeble_rcs (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_greeble_rcs_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_nozzle.png`, `_iter4_lit_close_block.png`, `_iter4_lit_close_mount.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`greeble_rcs_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`greeble_rcs_wear_mask_2k.jpg`)
3. RCS burn roughness story map (`greeble_rcs_rcs_burn_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on nozzle throat lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + burn scorch zones
10. Anisotropy/clearcoat RCS hull paint
11. Emissive story accent on thruster nozzle + edge chamfer band
12. Localized decal alpha on faction stripe port + inspection ticks

**DET layers (12):** DET_cavity_grime_vent, DET_dock_scuff, DET_edge_chamfer_band, DET_faction_stripe_port, DET_fuel_line, DET_inspection_tick, DET_micro_scratch_plate, DET_mount_flange, DET_panel_line_emphasis, DET_reaction_block, DET_rivet_row, DET_thruster_nozzle

**Export/finalize:** **4448 tris / 470752 B** · `PRO Elite Finish 2026-07-06`