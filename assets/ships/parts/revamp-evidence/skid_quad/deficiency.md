# skid_quad — Professional Graphics Revamp Deficiency Log

**Story character:** Heavy hauler quad landing gear — four contact pads, ore dock scuffs, belt-faction orange stripe. Per `needed-assets.md`: heavy hauler quad gear, Belt tone.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for skid_quad (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_skid_quad_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Four-pad quad cluster reads at ~4.5m hauler gear scale.
- Macro/meso/micro (2/5): Clean leg forms; no pad contact or ore scuff DET story layers.
- Bevel language (3/5): Bevel mods on legs; flat clay materials.
- Material zones (2/5): Hull/mechanical not separated in lit passes.
- Wear/story (1/5): No hauler ore-dock or belt stripe narrative.
- Scale truth (5/5): Full gear framed at d≈2.8m.
- Lighting readability (4/5): iter0_lit_34_full shows quad silhouette in HDRI.

**≥5 iter1 targets:** DET quad-pad/strut/mount layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for skid_quad (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_skid_quad_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_pad/stripe/strut/ore.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Four pad feet + strut joints started.
- Macro/meso/micro (3/5): Initial DET layers for pad contact + belt faction stripe.
- Bevel language (4/5): DET bevel segs=2 on strut slabs.
- Material zones (3/5): Hull dark + mechanical struts emerging.
- Wear/story (2/5): Pad geometry present; trim/wear not wired.
- Scale truth (5/5): Full gear in frame.
- Lighting readability (4/5): iter1_lit_close_pad shows meso contact zone.

---

## Before iter2 for skid_quad (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_skid_quad_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_pad/stripe/strut/ore.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Quad cluster unchanged; mount flange at hull interface.
- Macro/meso/micro (4/5): Panel line + rivet row DET; cavity grime on strut edge.
- Bevel language (4/5): Consistent DET bevel language across pad + strut zones.
- Material zones (4/5): Hull + mechanical struts in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on ore dock scuff.
- Scale truth (5/5): Full gear at d≈2.8m.
- Lighting readability (4/5): iter2_lit_close_strut shows strut joint detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat hull paint.

---

## Before iter3 for skid_quad (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_skid_quad_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_pad/stripe/strut/ore.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full four-pad skid + struts + mount flange in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + ore dock scuff + belt stripe; rivet rows visible.
- Bevel language (4/5): Industrial hauler bevels; NOT light starter trio scale.
- Material zones (5/5): Dark hull + mechanical struts + belt accent stripe in lit_34_full.
- Wear/story (4/5): Ore dock scuff + pad contact + mount flange = hauler gear character.
- Scale truth (5/5): Full gear at d≈2.8m.
- Lighting readability (5/5): iter3_lit_close_ore shows contact wear; iter3_lit_close_pad shows pad meso.

**Story fit:** Heavy hauler quad gear per manifest — four scratched pads + ore dock scuff + belt mount.

**≥6 surfacing techniques:** skid_quad_trim_sheet_1k, skid_quad_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, hull clearcoat 0.1, belt accent emissive 0.08.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → Phase 1 baseline. Textures: `assets/ships/parts/textures/skid_quad/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (quad pads + strut joints + ore scuff), deficiency iter0–iter3.

---

## Elite iter4 uplift for skid_quad (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_skid_quad_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_pad.png`, `_iter4_lit_close_strut.png`, `_iter4_lit_close_ore.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`skid_quad_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`skid_quad_wear_mask_2k.jpg`)
3. Hauler contact roughness story map (`skid_quad_hauler_contact_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on pad lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on ore dock scuff + pad contact zones
10. Anisotropy/clearcoat industrial hull paint
11. Emissive story accent on belt faction stripe
12. Localized decal alpha on rivet row + strut joint ticks

**DET layers (12):** DET_skid_pad_front_l, DET_skid_pad_front_r, DET_skid_pad_rear_l, DET_skid_pad_rear_r, DET_strut_joint, DET_panel_line_emphasis, DET_faction_stripe_belt, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_mount_flange, DET_rivet_row, DET_ore_dock_scuff

**Export/finalize:** **4812 tris / 1373008 B** · `PRO Elite Finish 2026-07-06`