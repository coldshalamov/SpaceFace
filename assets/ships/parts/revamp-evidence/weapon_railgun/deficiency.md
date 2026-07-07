# weapon_railgun — Professional Graphics Revamp Deficiency Log

**Story character:** Linear rail accelerator — long barrel channel, coil bands, arc scorch at muzzle. Per `needed-assets.md`: high-velocity sniper rail; NOT pulse cannon (`weapon_pulse_cannon`) or belt-fed gatling (`weapon_gatling`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for weapon_railgun (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_weapon_railgun_iter0_{clay_34_full,clay_front,clay_side,clay_top,clay_rear}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Long rail channel + breech housing reads at ~6.3m weapon scale.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on 4 meshes; chamfer present but flat materials.
- Material zones (2/5): Clay/lit single-tone — hull/mechanical/accent not separated.
- Wear/story (1/5): No arc scorch or coil wear yet.
- Scale truth (5/5): Full weapon framed at d≈6.3m.
- Lighting readability (4/5): iter0_lit_34_full shows rail silhouette in HDRI.

**≥5 iter1 targets:** DET rail/coil/muzzle layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for weapon_railgun (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_weapon_railgun_iter1_{clay_34_full,lit_34_full,lit_front,lit_side,lit_close_tip,lit_close_coil,lit_close_rail}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full railgun + channel + coil bands in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + rail channel + capacitor bank started.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (4/5): Hull gunmetal + mechanical coil + accent muzzle flux — 3 roles.
- Wear/story (3/5): Inspection tick geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full weapon in frame.
- Lighting readability (4/5): iter1_lit_close_tip shows muzzle flux meso detail.

---

## Before iter2 for weapon_railgun (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_weapon_railgun_iter2_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_rail,lit_close_coil,lit_close_tip,clay_34_full}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Linear rail accelerator unchanged; arc scorch band on channel face.
- Macro/meso/micro (4/5): Breech wear + cavity grime DET; panel line on housing flank.
- Bevel language (4/5): Consistent DET bevel language across rail + coil zones.
- Material zones (5/5): Hull + mechanical + accent muzzle flux in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on arc scorch face.
- Scale truth (5/5): Full weapon at d≈6.3m.
- Lighting readability (5/5): iter2_lit_close_rail shows channel wear detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat precision hull.

---

## Before iter3 for weapon_railgun (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_weapon_railgun_iter3_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_rail,lit_close_coil,lit_close_tip,clay_34_full}.png` (+ iter0×8, iter1×9, iter2×9, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full railgun + coil bands + muzzle flux glow in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + capacitor banks + cavity vents; arc scorch on flank.
- Bevel language (4/5): High-velocity industrial bevels; NOT pulse cannon or heavy cannon brutal.
- Material zones (5/5): Gunmetal hull + mechanical coil + accent muzzle flux in lit_34_full.
- Wear/story (5/5): Inspection tick + arc scorch + breech wear + coil bands = rail accelerator weapon; contrast weapon_pulse_cannon energy pulse housing.
- Scale truth (5/5): Full weapon at d≈6.3m.
- Lighting readability (5/5): iter3_lit_close_coil shows coil band detail; iter3_lit_close_tip shows muzzle flux.

**Story fit:** Linear rail accelerator per `needed-assets.md` — high-velocity channel + arc accountability marks.

**≥6 surfacing techniques:** weapon_railgun_trim_sheet_1k, weapon_railgun_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, precision hull clearcoat 0.14, accent emissive muzzle flux 0.4.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 1788 tris / 237656 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/weapon_railgun/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (arc scorch + breech wear + inspection tick), deficiency iter0–iter3.

---

## Elite iter4 uplift for weapon_railgun (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_weapon_railgun_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_tip.png`, `_iter4_lit_close_coil.png`, `_iter4_lit_close_rail.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`weapon_railgun_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`weapon_railgun_wear_mask_2k.jpg`)
3. Arc flux roughness story map (`weapon_railgun_arc_flux_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on breech housing
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on arc scorch + breech wear bands
10. Anisotropy/clearcoat precision gunmetal paint
11. Emissive story accent on muzzle flux + arc scorch
12. Localized decal alpha on inspection tick + faction stripe port

**DET layers (12):** DET_arc_scorch, DET_breech_wear, DET_capacitor_bank, DET_cavity_grime_vent, DET_coil_band_a, DET_coil_band_b, DET_faction_stripe_port, DET_inspection_tick, DET_micro_scratch_plate, DET_muzzle_flux, DET_panel_line_emphasis, DET_rail_channel

**Export/finalize:** **9324 tris / 600848 B** · `PRO Elite Finish 2026-07-06`