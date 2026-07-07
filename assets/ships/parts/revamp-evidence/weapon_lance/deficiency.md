# weapon_lance — Professional Graphics Revamp Deficiency Log

**Story character:** Long precision energy lance — rail-guided focus crystal, phase seam wear, capacitor bands. Per `needed-assets.md`: capital/interceptor sniper weapon; NOT belt-fed gatling (`weapon_gatling`) or brutal heavy cannon (`weapon_heavy_cannon`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for weapon_lance (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_weapon_lance_iter0_{clay_34_full,clay_front,clay_side,clay_top,clay_rear}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Long lance spine + rail guide reads at ~7.65m weapon scale.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on 3 meshes; chamfer present but flat materials.
- Material zones (2/5): Clay/lit single-tone — hull/mechanical/accent not separated.
- Wear/story (1/5): No phase seam or beam scorch yet.
- Scale truth (5/5): Full weapon framed at d≈7.65m.
- Lighting readability (4/5): iter0_lit_34_full shows long lance silhouette in HDRI.

**≥5 iter1 targets:** DET rail/focus/seam layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for weapon_lance (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_weapon_lance_iter1_{clay_34_full,lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_tip,lit_close_rib,lit_close_seam}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full lance spine + rail guide + focus ribs in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + phase seam + focus rib stack started.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (4/5): Hull gunmetal + mechanical rail + accent tip glow — 3 roles.
- Wear/story (3/5): Phase seam geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full weapon in frame.
- Lighting readability (4/5): iter1_lit_close_tip shows energy tip meso detail.

---

## Before iter2 for weapon_lance (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_weapon_lance_iter2_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_tip,lit_close_rib,lit_close_seam,clay_34_full}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Long precision lance unchanged; beam scorch band on focus housing.
- Macro/meso/micro (4/5): Capacitor band + inspection tick DET; mount collar on housing base.
- Bevel language (4/5): Consistent DET bevel language across rail + focus zones.
- Material zones (5/5): Hull + mechanical + accent tip glow in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on phase seam face.
- Scale truth (5/5): Full weapon at d≈7.65m.
- Lighting readability (5/5): iter2_lit_close_seam shows phase seam wear.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat precision hull.

---

## Before iter3 for weapon_lance (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_weapon_lance_iter3_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_tip,lit_close_rib,lit_close_seam,clay_34_full}.png` (+ iter0×8, iter1×9, iter2×9, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full long lance + rail guide + focus crystal glow in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + focus ribs + capacitor bands; beam scorch on flank.
- Bevel language (4/5): Precision industrial bevels; NOT Fringe agile or heavy cannon brutal.
- Material zones (5/5): Gunmetal hull + mechanical rail + accent energy tip in lit_34_full.
- Wear/story (5/5): Phase seam + beam scorch + inspection ticks + capacitor wear = precision sniper weapon; contrast weapon_gatling belt-fed rapid-fire.
- Scale truth (5/5): Full weapon at d≈7.65m.
- Lighting readability (5/5): iter3_lit_close_rib shows focus rib detail; iter3_lit_close_tip shows energy tip glow.

**Story fit:** Long precision energy lance per `needed-assets.md` — rail-guided focus + phase accountability marks.

**≥6 surfacing techniques:** weapon_lance_trim_sheet_1k, weapon_lance_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, precision hull clearcoat 0.15, accent emissive tip 0.35.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 1112 tris / 220168 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/weapon_lance/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (beam scorch + phase seam + inspection ticks), deficiency iter0–iter3.

---

## Elite iter4 uplift for weapon_lance (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_weapon_lance_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_tip.png`, `_iter4_lit_close_rib.png`, `_iter4_lit_close_seam.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`weapon_lance_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`weapon_lance_wear_mask_2k.jpg`)
3. Beam glow roughness story map (`weapon_lance_beam_glow_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on focus housing
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on phase seam + beam scorch bands
10. Anisotropy/clearcoat precision gunmetal paint
11. Emissive story accent on energy tip glow + beam scorch
12. Localized decal alpha on inspection tick + faction stripe port

**DET layers (12):** DET_beam_scorch, DET_capacitor_band, DET_cavity_grime_vent, DET_energy_tip_glow, DET_faction_stripe_port, DET_focus_rib, DET_inspection_tick, DET_micro_scratch_plate, DET_mount_collar, DET_panel_line_emphasis, DET_phase_seam, DET_rail_guide

**Export/finalize:** **7870 tris / 412316 B** · `PRO Elite Finish 2026-07-06`