# fin_swept_smuggler — Professional Graphics Revamp Deficiency Log

**Story character:** Belt smuggler swept fin — contraband patch, amber smuggler stripe, dock scuff at root. Per `needed-assets.md`: Fringe/Belt fast-runner stabilizer; NOT Pit starter wedge (`fin_wedge`) or industrial radiator (`fin_radiator_grid`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for fin_swept_smuggler (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_fin_swept_smuggler_iter0_{clay_34_full,clay_front,clay_side,clay_top}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Swept blade + edge light reads at ~5.16m fin scale.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on 3 meshes; chamfer present but flat materials.
- Material zones (2/5): Clay/lit single-tone — hull/mechanical/accent not separated.
- Wear/story (1/5): No contraband patch or smuggler stripe yet.
- Scale truth (5/5): Full fin framed at d≈5.16m.
- Lighting readability (4/5): iter0_lit_34_full shows swept silhouette in HDRI.

**≥5 iter1 targets:** DET sweep/contraband/stripe layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for fin_swept_smuggler (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_fin_swept_smuggler_iter1_{clay_34_full,clay_side,lit_34_full,lit_front,lit_side,lit_close_tip,lit_close_patch,lit_close_stripe}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full swept fin + edge chamfer + mount bracket in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + smuggler stripe + contraband patch started.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (4/5): Hull dark + mechanical mount + amber accent edge — 3 roles.
- Wear/story (3/5): Contraband patch geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full fin in frame.
- Lighting readability (4/5): iter1_lit_close_tip shows sweep tip wear meso detail.

---

## Before iter2 for fin_swept_smuggler (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_fin_swept_smuggler_iter2_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_tip,lit_close_patch,lit_close_stripe,clay_34_full,clay_side}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Swept smuggler fin unchanged; dock scuff band at mount root.
- Macro/meso/micro (4/5): Heat vent + jury bolt DET; panel line on blade flank.
- Bevel language (4/5): Consistent DET bevel language across sweep + stripe zones.
- Material zones (5/5): Hull + mechanical + accent smuggler stripe in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on sweep tip face.
- Scale truth (5/5): Full fin at d≈5.16m.
- Lighting readability (5/5): iter2_lit_close_stripe shows Belt amber stripe detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat swept hull.

---

## Before iter3 for fin_swept_smuggler (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_fin_swept_smuggler_iter3_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_tip,lit_close_patch,lit_close_stripe,clay_34_full,clay_side}.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full swept fin + contraband patch + smuggler stripe in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + heat vents + dock scuff; sweep tip wear on leading edge.
- Bevel language (4/5): Belt smuggler bevels; NOT Pit wedge utilitarian or industrial radiator.
- Material zones (5/5): Dark hull + mechanical mount + amber accent stripe in lit_34_full.
- Wear/story (5/5): Contraband patch + smuggler stripe + dock scuff + sweep tip wear = Belt runner fin; contrast fin_wedge Pit starter stabilizer.
- Scale truth (5/5): Full fin at d≈5.16m.
- Lighting readability (5/5): iter3_lit_close_patch shows contraband patch; iter3_lit_close_tip shows sweep wear.

**Story fit:** Belt smuggler swept fin per `needed-assets.md` — contraband accountability + dock contact marks.

**≥6 surfacing techniques:** fin_swept_smuggler_trim_sheet_1k, fin_swept_smuggler_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, swept hull clearcoat 0.1, accent emissive smuggler stripe 0.22.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 576 tris / 194864 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/fin_swept_smuggler/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (contraband patch + smuggler stripe + dock scuff), deficiency iter0–iter3.

---

## Elite iter4 uplift for fin_swept_smuggler (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_fin_swept_smuggler_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_tip.png`, `_iter4_lit_close_patch.png`, `_iter4_lit_close_stripe.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`fin_swept_smuggler_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`fin_swept_smuggler_wear_mask_2k.jpg`)
3. Belt stripe roughness story map (`fin_swept_smuggler_belt_stripe_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on swept blade leading edge
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on sweep tip + dock scuff zones
10. Anisotropy/clearcoat Belt smuggler hull paint
11. Emissive story accent on smuggler stripe + edge chamfer band
12. Localized decal alpha on contraband patch + faction stripe port

**DET layers (12):** DET_cavity_grime_vent, DET_contraband_patch, DET_dock_scuff, DET_edge_chamfer_band, DET_faction_stripe_port, DET_heat_vent_stack, DET_jury_bolt_port, DET_micro_scratch_plate, DET_mount_bracket, DET_panel_line_emphasis, DET_smuggler_stripe, DET_sweep_tip_wear

**Export/finalize:** **7528 tris / 455088 B** · `PRO Elite Finish 2026-07-06`