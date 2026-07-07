# weapon_heavy_cannon — Professional Graphics Revamp Deficiency Log

**Story character:** Oversized bolted heavy cannon — brutal industrial recoil cylinders, combat scarring, military stencil. Per `needed-assets.md`: capital/combat ships frontline weapon; NOT agile Fringe gatling (`weapon_gatling`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for weapon_heavy_cannon (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_weapon_heavy_cannon_iter0_{clay_34_full,clay_front,clay_side,clay_top,clay_rear}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Brutal heavy barrel + recoil housing reads at ~6.43m weapon scale.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on 3 meshes; chamfer present but flat materials.
- Material zones (2/5): Clay/lit single-tone — hull/mechanical/accent not separated.
- Wear/story (1/5): No combat scar or military stencil yet.
- Scale truth (5/5): Full weapon framed at d≈6.4m.
- Lighting readability (4/5): iter0_lit_34_full shows brutal silhouette in HDRI.

**≥5 iter1 targets:** DET recoil/bolt/stencil/scar layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for weapon_heavy_cannon (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_weapon_heavy_cannon_iter1_{clay_34_full,lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_bolt,lit_close_barrel,lit_close_stencil}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full heavy cannon + recoil cylinders + muzzle glow in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + bolt collars + heat vent stack started.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (4/5): Hull gunmetal + mechanical recoil + accent muzzle glow — 3 roles.
- Wear/story (3/5): Military stencil geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full weapon in frame.
- Lighting readability (4/5): iter1_lit_close_bolt shows bolt collar meso detail.

---

## Before iter2 for weapon_heavy_cannon (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_weapon_heavy_cannon_iter2_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_bolt,lit_close_barrel,lit_close_stencil,clay_34_full}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Brutal heavy cannon unchanged; breach wear band on muzzle face.
- Macro/meso/micro (4/5): Combat scar + recoil scorch DET; mount rail on housing base.
- Bevel language (4/5): Consistent DET bevel language across recoil + bolt zones.
- Material zones (5/5): Hull + mechanical + accent muzzle in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on breach face.
- Scale truth (5/5): Full weapon at d≈6.43m.
- Lighting readability (5/5): iter2_lit_close_stencil shows military ID stencil.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat brutal hull.

---

## Before iter3 for weapon_heavy_cannon (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_weapon_heavy_cannon_iter3_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_bolt,lit_close_barrel,lit_close_stencil,clay_34_full}.png` (+ iter0×8, iter1×9, iter2×9, 2026-07-05×4)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full brutal heavy cannon + recoil cylinders + muzzle glow in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + bolt collars + heat vents; combat scar on flank.
- Bevel language (4/5): Industrial brutal bevels; NOT Fringe agile or Core clean patrol.
- Material zones (5/5): Gunmetal hull + mechanical recoil + accent muzzle glow in lit_34_full.
- Wear/story (5/5): Military stencil + combat scar + recoil scorch + breach wear = frontline heavy weapon; contrast weapon_gatling belt-fed rapid-fire.
- Scale truth (5/5): Full weapon at d≈6.43m.
- Lighting readability (5/5): iter3_lit_close_barrel shows breach face wear; iter3_lit_close_bolt shows collar bolts.

**Story fit:** Oversized bolted heavy cannon per `needed-assets.md` — brutal scale + combat accountability marks.

**≥6 surfacing techniques:** weapon_heavy_cannon_trim_sheet_1k, weapon_heavy_cannon_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, brutal hull clearcoat 0.18, accent emissive muzzle 0.25.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 2296 tris / 246532 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/weapon_heavy_cannon/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (recoil scorch + combat scar + military stencil), deficiency iter0–iter3.

---

## Elite iter4 uplift for weapon_heavy_cannon (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_weapon_heavy_cannon_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_barrel.png`, `_iter4_lit_close_bolt.png`, `_iter4_lit_close_stencil.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`weapon_heavy_cannon_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`weapon_heavy_cannon_wear_mask_2k.jpg`)
3. Combat scorch roughness story map (`weapon_heavy_cannon_combat_scorch_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on barrel housing
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on breach wear + recoil scorch bands
10. Anisotropy/clearcoat brutal gunmetal paint
11. Emissive story accent on muzzle glow + recoil scorch
12. Localized decal alpha on military stencil + faction stripe port

**DET layers (12):** DET_bolt_collar, DET_breach_wear, DET_cavity_grime_vent, DET_combat_scar, DET_faction_stripe_port, DET_heat_vent_stack, DET_micro_scratch_plate, DET_military_stencil, DET_mount_rail, DET_panel_line_emphasis, DET_recoil_cylinder, DET_recoil_scorch

**Export/finalize:** **9640 tris / 600676 B** · `PRO Elite Finish 2026-07-06`