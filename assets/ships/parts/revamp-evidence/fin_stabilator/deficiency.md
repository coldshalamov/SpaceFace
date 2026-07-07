# fin_stabilator — Professional Graphics Revamp Deficiency Log

**Story character:** Multirole/corvette articulated stabilator — hinge bar, control tab, actuator slot, inspection ticks. Per `needed-assets.md`: swept control-surface fin for lawful patrol and corvette builds; NOT delta patrol (`fin_delta`) or Pit wedge (`fin_wedge`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for fin_stabilator (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_fin_stabilator_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Swept stabilator + accent merged read at ~4.8m span.
- Macro/meso/micro (2/5): Clean swept form; no hinge/actuator DET story layers.
- Bevel language (3/5): Bevel mods on 3 merged meshes; flat clay materials.
- Material zones (2/5): Hull/mechanical/accent not separated in lit passes.
- Wear/story (1/5): No articulated control-surface or hinge wear narrative.
- Scale truth (5/5): Full fin framed at d≈4.8m.
- Lighting readability (4/5): iter0_lit_34_full shows stabilator silhouette in HDRI.

**≥5 iter1 targets:** DET hinge/tab/actuator layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for fin_stabilator (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_fin_stabilator_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_hinge/hazard/rust.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Swept plate + accent edge; hinge bar started at root.
- Macro/meso/micro (3/5): Initial DET layers for actuator + control tab.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (3/5): Hull dark + mechanical hinge + cyan accent — 3 roles emerging.
- Wear/story (2/5): Hinge geometry present; trim/wear not wired.
- Scale truth (5/5): Full fin in frame.
- Lighting readability (4/5): iter1_lit_close_hinge shows hinge meso detail.

---

## Before iter2 for fin_stabilator (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_fin_stabilator_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_hinge/hazard/rust.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Stabilator unchanged; dock scuff band at mount root.
- Macro/meso/micro (4/5): Panel line + rivet row DET; actuator slot on dorsal.
- Bevel language (4/5): Consistent DET bevel language across sweep + hinge zones.
- Material zones (4/5): Hull + mechanical + accent stripe in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on control tab tip.
- Scale truth (5/5): Full fin at d≈4.8m.
- Lighting readability (4/5): iter2_lit_close_hinge shows hinge wear detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat multirole hull.

---

## Before iter3 for fin_stabilator (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_fin_stabilator_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_hinge/hazard/rust.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full stabilator + control tab + hinge bar in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + inspection ticks + dock scuff; tab-tip wear on trailing edge.
- Bevel language (4/5): Multirole bevels; NOT delta patrol or Belt smuggler sweep.
- Material zones (5/5): Dark hull + mechanical hinge + Core cyan accent in lit_34_full.
- Wear/story (4/5): Hinge rust + dock scuff + tab wear = articulated stabilator; contrast fin_delta patrol delta.
- Scale truth (5/5): Full fin at d≈4.8m.
- Lighting readability (5/5): iter3_lit_close_hinge shows hinge detail; iter3_lit_close_hazard shows warning stripe.

**Story fit:** Multirole/corvette articulated stabilator per manifest — hinge articulation + control tab + inspection character.

**≥6 surfacing techniques:** fin_stabilator_trim_sheet_1k, fin_stabilator_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, multirole hull clearcoat 0.1, accent emissive stripe 0.12.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 520 tris / 197944 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/fin_stabilator/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (hinge bar + control tab + dock scuff), deficiency iter0–iter3.

---

## Elite iter4 uplift for fin_stabilator (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_fin_stabilator_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_hinge.png`, `_iter4_lit_close_tab.png`, `_iter4_lit_close_stripe.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`fin_stabilator_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`fin_stabilator_wear_mask_2k.jpg`)
3. Control surface roughness story map (`fin_stabilator_control_surface_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on stabilator trailing edge
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + hinge rust zones
10. Anisotropy/clearcoat multirole hull paint
11. Emissive story accent on edge chamfer band + control tab tip
12. Localized decal alpha on faction stripe port + inspection ticks

**DET layers (12):** DET_actuator_slot, DET_cavity_grime_vent, DET_control_tab, DET_dock_scuff, DET_edge_chamfer_band, DET_faction_stripe_port, DET_hinge_bar, DET_inspection_tick, DET_micro_scratch_plate, DET_mount_flange, DET_panel_line_emphasis, DET_rivet_row

**Export/finalize:** **3360 tris / 1215792 B** · `PRO Elite Finish 2026-07-06`