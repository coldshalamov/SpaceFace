# greeble_nav_lights — Professional Graphics Revamp Deficiency Log

**Story character:** Port/starboard navigation light greeble — red/green lens pair, strobe housing, wire channel. Per `needed-assets.md`: lawful flight nav kit; HOOK_Emissive strobe accent for dorsal mount.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for greeble_nav_lights (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_greeble_nav_lights_iter0_clay_34_full.png`, `_iter0_clay_front/side/top.png`, `_iter0_lit_34_full/front/side.png`

**MCP observations:**
- Silhouette (4/5): Nav base + accent merged read at ~2.0m cluster scale.
- Macro/meso/micro (2/5): Clean nav forms; no lens/strobe DET story layers.
- Bevel language (3/5): Bevel mods on meshes; flat clay materials.
- Material zones (2/5): Hull/mechanical/accent not separated in lit passes.
- Wear/story (1/5): No port/starboard lens or strobe narrative.
- Scale truth (5/5): Full cluster framed at d≈2.0m.
- Lighting readability (4/5): iter0_lit_34_full shows nav silhouette in HDRI.

**≥5 iter1 targets:** DET port/starboard/strobe layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for greeble_nav_lights (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_greeble_nav_lights_iter1_clay_34_full.png`, `_iter1_lit_34_full/front/side/rear/top.png`, `_iter1_lit_close_port/strobe/mount.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Nav base + lens pair started.
- Macro/meso/micro (3/5): Initial DET layers for strobe housing + wire channel.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (3/5): Hull dark + mechanical mount + red/green accent emerging.
- Wear/story (2/5): Lens geometry present; trim/wear not wired.
- Scale truth (5/5): Full cluster in frame.
- Lighting readability (4/5): iter1_lit_close_port shows port lens meso.

---

## Before iter2 for greeble_nav_lights (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_greeble_nav_lights_iter2_lit_34_full.png`, `_iter2_lit_front/side/rear/top.png`, `_iter2_lit_close_port/strobe/mount.png`, `_iter2_clay_34_full/side.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Nav cluster unchanged; mount flange at base.
- Macro/meso/micro (4/5): Panel line + rivet row DET; wire channel on dorsal.
- Bevel language (4/5): Consistent DET bevel language across lens + strobe zones.
- Material zones (4/5): Hull + mechanical + accent lenses in lit_34_full.
- Wear/story (3/5): Trim sheet MULTIPLY on hull; wear mask on mount flange.
- Scale truth (5/5): Full cluster at d≈2.0m.
- Lighting readability (4/5): iter2_lit_close_strobe shows housing detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat nav hull.

---

## Before iter3 for greeble_nav_lights (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_greeble_nav_lights_iter3_lit_34_full.png`, `_iter3_lit_front/side/rear/top.png`, `_iter3_lit_close_port/strobe/mount.png`, `_iter3_clay_34_full/side.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (4/5): Full nav cluster + port/starboard lenses + strobe in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + wire channel + dock scuff; rivet rows visible.
- Bevel language (4/5): Flight nav bevels; NOT antenna comms or armor plate greeble.
- Material zones (5/5): Dark hull + mechanical mount + red/green emissive lenses in lit_34_full.
- Wear/story (4/5): Port/starboard lenses + strobe housing + wire run = lawful nav character.
- Scale truth (5/5): Full cluster at d≈2.0m.
- Lighting readability (5/5): iter3_lit_close_port shows lens emissive; iter3_lit_close_strobe shows housing.

**Story fit:** Navigation light greeble per manifest — port/starboard emissive + strobe housing + wire routing.

**≥6 surfacing techniques:** greeble_nav_lights_trim_sheet_1k, greeble_nav_lights_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, nav hull clearcoat 0.1, accent lens emissive 0.45.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 1852 tris / 255708 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/greeble_nav_lights/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (port lens + strobe + wire channel), deficiency iter0–iter3.

---

## Elite iter4 uplift for greeble_nav_lights (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_greeble_nav_lights_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_port.png`, `_iter4_lit_close_strobe.png`, `_iter4_lit_close_mount.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`greeble_nav_lights_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`greeble_nav_lights_wear_mask_2k.jpg`)
3. Nav strobe roughness story map (`greeble_nav_lights_nav_strobe_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on nav base lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + mount flange zones
10. Anisotropy/clearcoat nav hull paint
11. Emissive story accent on port/starboard lenses + strobe housing
12. Localized decal alpha on faction stripe port + edge chamfer band

**DET layers (12):** DET_cavity_grime_vent, DET_dock_scuff, DET_edge_chamfer_band, DET_faction_stripe_port, DET_micro_scratch_plate, DET_mount_flange, DET_panel_line_emphasis, DET_port_lens, DET_rivet_row, DET_starboard_lens, DET_strobe_housing, DET_wire_channel

**Export/finalize:** **3148 tris / 923140 B** · `PRO Elite Finish 2026-07-06`