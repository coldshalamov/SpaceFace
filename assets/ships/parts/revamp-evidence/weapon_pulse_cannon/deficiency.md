# weapon_pulse_cannon — Professional Graphics Revamp Deficiency Log

**Story character:** Functional futuristic pulse cannon — coil bands, emitter glow, heat vent stacks. Per `needed-assets.md`: Core patrol energy weapon; NOT Fringe belt-fed gatling (`weapon_gatling`) or brutal heavy cannon (`weapon_heavy_cannon`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for weapon_pulse_cannon (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_weapon_pulse_cannon_iter0_{clay_34_full,clay_front,clay_side,clay_top,clay_rear}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Pulse barrel + cooling housing reads at ~4.79m weapon scale.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on 2 meshes; chamfer present but flat materials.
- Material zones (2/5): Clay/lit single-tone — hull/mechanical/accent not separated.
- Wear/story (1/5): No pulse scorch or coil wear yet.
- Scale truth (5/5): Full weapon framed at d≈4.79m.
- Lighting readability (4/5): iter0_lit_34_full shows pulse silhouette in HDRI.

**≥5 iter1 targets:** DET coil/emitter/vent layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for weapon_pulse_cannon (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_weapon_pulse_cannon_iter1_{clay_34_full,lit_34_full,lit_front,lit_side,lit_close_emitter,lit_close_coil,lit_close_heat}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full pulse cannon + coil band + emitter glow in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + heat vent stack + capacitor ring started.
- Bevel language (4/5): DET bevel segs=2 on accent/mechanical slabs.
- Material zones (4/5): Hull gunmetal + mechanical coil + accent emitter glow — 3 roles.
- Wear/story (3/5): Inspection stencil geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full weapon in frame.
- Lighting readability (4/5): iter1_lit_close_emitter shows muzzle glow meso detail.

---

## Before iter2 for weapon_pulse_cannon (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_weapon_pulse_cannon_iter2_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_barrel,lit_close_stencil,clay_34_full}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Functional pulse cannon unchanged; pulse scorch band on emitter face.
- Macro/meso/micro (4/5): Cooling fin + mount collar DET; panel line on housing flank.
- Bevel language (4/5): Consistent DET bevel language across coil + vent zones.
- Material zones (5/5): Hull + mechanical + accent emitter in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on pulse scorch face.
- Scale truth (5/5): Full weapon at d≈4.79m.
- Lighting readability (5/5): iter2_lit_close_stencil shows inspection tick stencil.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat precision hull.

---

## Before iter3 for weapon_pulse_cannon (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_weapon_pulse_cannon_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_emitter,lit_close_vent,lit_close_rib,clay_side}.png` (+ iter0×8, iter1×9, iter2×8, 2026-07-05×4)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full pulse cannon + coil bands + emitter glow in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + heat vents + cooling fins; pulse scorch on flank.
- Bevel language (4/5): Core patrol precision bevels; NOT Fringe agile or heavy cannon brutal.
- Material zones (5/5): Gunmetal hull + mechanical coil + accent emitter glow in lit_34_full.
- Wear/story (5/5): Inspection stencil + pulse scorch + heat vent grime + coil wear = Core energy weapon; contrast weapon_gatling belt-fed rapid-fire.
- Scale truth (5/5): Full weapon at d≈4.79m.
- Lighting readability (5/5): iter3_lit_close_vent shows heat vent detail; iter3_lit_close_emitter shows emitter glow.

**Story fit:** Functional futuristic pulse weapon per `needed-assets.md` — coil accountability + heat vent story.

**≥6 surfacing techniques:** weapon_pulse_cannon_trim_sheet_1k, weapon_pulse_cannon_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, precision hull clearcoat 0.12, accent emissive emitter 0.35.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 1944 tris / 239152 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/weapon_pulse_cannon/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (pulse scorch + heat vent + inspection stencil), deficiency iter0–iter3.

---

## Elite iter4 uplift for weapon_pulse_cannon (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_weapon_pulse_cannon_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_emitter.png`, `_iter4_lit_close_coil.png`, `_iter4_lit_close_vent.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`weapon_pulse_cannon_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`weapon_pulse_cannon_wear_mask_2k.jpg`)
3. Pulse glow roughness story map (`weapon_pulse_cannon_pulse_glow_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on emitter housing
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on pulse scorch + coil band zones
10. Anisotropy/clearcoat precision gunmetal paint
11. Emissive story accent on emitter glow + pulse scorch
12. Localized decal alpha on inspection stencil + faction stripe port

**DET layers (12):** DET_capacitor_ring, DET_cavity_grime_vent, DET_coil_band, DET_cooling_fin, DET_emitter_glow, DET_faction_stripe_port, DET_heat_vent_stack, DET_inspection_stencil, DET_micro_scratch_plate, DET_mount_collar, DET_panel_line_emphasis, DET_pulse_scorch

**Export/finalize:** **14180 tris / 764196 B** · `PRO Elite Finish 2026-07-06`