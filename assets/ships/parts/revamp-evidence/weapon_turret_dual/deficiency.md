# weapon_turret_dual — Professional Graphics Revamp Deficiency Log

**Story character:** Dual-barrel gimbal turret — paired barrels, charge block, combat scorch. Per `needed-assets.md`: capital/combat ship point-defense turret; NOT single-barrel gatling (`weapon_gatling`) or linear rail (`weapon_railgun`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for weapon_turret_dual (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_weapon_turret_dual_iter0_{clay_34_full,clay_front,clay_side,clay_top,clay_rear}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Dual barrel + gimbal head reads at ~5.58m turret scale.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on meshes; chamfer present but flat materials.
- Material zones (2/5): Clay/lit single-tone — hull/mechanical/accent not separated.
- Wear/story (1/5): No combat scorch or charge block wear yet.
- Scale truth (5/5): Full turret framed at d≈5.58m.
- Lighting readability (4/5): iter0_lit_34_full shows dual-barrel silhouette in HDRI.

**≥5 iter1 targets:** DET barrel/charge/gimbal layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for weapon_turret_dual (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_weapon_turret_dual_iter1_{clay_34_full,lit_34_full,lit_front,lit_side,lit_close_barrel,lit_close_badge,lit_close_stripe}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full dual turret + charge block + paired barrels in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + gimbal collar + heat vent stack started.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (4/5): Hull gunmetal + mechanical barrels + accent charge block — 3 roles.
- Wear/story (3/5): Inspection stencil geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full turret in frame.
- Lighting readability (4/5): iter1_lit_close_barrel shows paired barrel meso detail.

---

## Before iter2 for weapon_turret_dual (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_weapon_turret_dual_iter2_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_barrel,lit_close_badge,lit_close_stripe,clay_34_full}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Dual turret unchanged; combat scorch band on barrel face.
- Macro/meso/micro (4/5): Mount rail + faction stripe DET; panel line on base flank.
- Bevel language (4/5): Consistent DET bevel language across barrel + gimbal zones.
- Material zones (5/5): Hull + mechanical + accent charge block in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on combat scorch face.
- Scale truth (5/5): Full turret at d≈5.58m.
- Lighting readability (5/5): iter2_lit_close_stripe shows faction stripe detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat brutal hull.

---

## Before iter3 for weapon_turret_dual (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_weapon_turret_dual_iter3_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_barrel,lit_close_badge,lit_close_stripe,clay_34_full}.png` (+ iter0×8, iter1×9, iter2×9, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full dual turret + charge block + paired barrels in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + heat vents + mount rail; combat scorch on flank.
- Bevel language (4/5): Point-defense brutal bevels; NOT agile Fringe gatling.
- Material zones (5/5): Gunmetal hull + mechanical barrels + accent charge block in lit_34_full.
- Wear/story (5/5): Inspection stencil + combat scorch + heat vent grime + faction stripe = capital turret; contrast weapon_gatling belt-fed rapid-fire.
- Scale truth (5/5): Full turret at d≈5.58m.
- Lighting readability (5/5): iter3_lit_close_badge shows inspection tick; iter3_lit_close_barrel shows paired barrels.

**Story fit:** Dual-barrel gimbal turret per `needed-assets.md` — charge block + combat accountability marks.

**≥6 surfacing techniques:** weapon_turret_dual_trim_sheet_1k, weapon_turret_dual_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, brutal hull clearcoat 0.12, accent emissive charge block 0.3.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 1808 tris / 241160 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/weapon_turret_dual/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (combat scorch + charge block + inspection stencil), deficiency iter0–iter3.

---

## Elite iter4 uplift for weapon_turret_dual (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_weapon_turret_dual_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_barrel.png`, `_iter4_lit_close_badge.png`, `_iter4_lit_close_stripe.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`weapon_turret_dual_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`weapon_turret_dual_wear_mask_2k.jpg`)
3. Combat scorch roughness story map (`weapon_turret_dual_combat_scorch_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on gimbal collar
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on combat scorch + barrel port zones
10. Anisotropy/clearcoat brutal gunmetal paint
11. Emissive story accent on charge block + faction stripe
12. Localized decal alpha on inspection stencil + faction stripe port

**DET layers (12):** DET_barrel_port, DET_barrel_starboard, DET_cavity_grime_vent, DET_charge_block, DET_combat_scorch, DET_faction_stripe_port, DET_gimbal_collar, DET_heat_vent_stack, DET_inspection_stencil, DET_micro_scratch_plate, DET_mount_rail, DET_panel_line_emphasis

**Export/finalize:** **11456 tris / 707188 B** · `PRO Elite Finish 2026-07-06`