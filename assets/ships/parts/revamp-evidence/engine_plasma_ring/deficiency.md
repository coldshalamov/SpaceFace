# engine_plasma_ring — Professional Graphics Revamp Deficiency Log

**Story character:** High-tier Core/Meridian ring drive — corporate polish, cyan plasma coil band, nav trim ring. Per `needed-assets.md`: NOT Pit patch (`engine_ion_small`) or Belt refinery (`engine_industrial`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for engine_plasma_ring (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_engine_plasma_ring_iter0_{clay_34_full,clay_front,clay_side,clay_top,clay_rear}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Ring outer + main cylinder + mechanical coupling reads; plasma ring identity at ~2.77m.
- Macro/meso/micro (2/5): Smooth forms; no DET story layers yet.
- Bevel language (3/5): Main mesh bevel present; ring outer relatively clean corporate.
- Material zones (2/5): Clay only — hull/mechanical/accent not separated in lit pass yet.
- Wear/story (1/5): No corporate stencil or plasma coil accent.
- Scale truth (5/5): Full module framed at d≈2.7m.
- Lighting readability (4/5): iter0_lit_34_full shows ring silhouette in HDRI.

**≥5 iter1 targets:** DET plasma coil + corporate stencil + nav trim, trim/wear sheets, AO bakes per role.

---

## Before iter1 for engine_plasma_ring (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_engine_plasma_ring_iter1_{clay_34_full,lit_34_full,lit_front,lit_side,lit_close_ring,lit_close_coil,lit_close_stencil}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full ring drive + outer plasma torus in HDRI 3/4.
- Macro/meso/micro (4/5): Coil band + field coupling DET started; ring outer facet readable.
- Bevel language (4/5): DET bevel segs=2 on accent slabs.
- Material zones (4/5): Hull gunmetal + cyan accent coil + mechanical coupling.
- Wear/story (3/5): Corporate stencil geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full engine in frame.
- Lighting readability (4/5): iter1_lit_close_ring shows torus termination.

---

## Before iter2 for engine_plasma_ring (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_engine_plasma_ring_iter2_{lit_34_full,lit_side,lit_rear,lit_top,lit_close_coupling,lit_close_nav}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Corporate ring drive unchanged; nav trim ring visible on flank.
- Macro/meso/micro (4/5): Heat discolor + dock scuff DET; meridian tick accent.
- Bevel language (4/5): Consistent DET bevel language across coupling + coil band.
- Material zones (5/5): Hull + mechanical + accent cyan in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on ring outer.
- Scale truth (5/5): Full module at d≈2.77m.
- Lighting readability (5/5): iter2_lit_close_nav shows cyan nav trim ring.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat corporate hull.

---

## Before iter3 for engine_plasma_ring (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_engine_plasma_ring_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_coil,lit_close_stencil,clay_side}.png` (+ iter0×8, iter1×7, iter2×6, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full plasma ring + outer torus + corporate accent bands in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + ring outer mesh; field coupling + glow port sell high-tier drive.
- Bevel language (4/5): Corporate disciplined bevels; NOT Pit crude or Belt soot stacks.
- Material zones (5/5): Gunmetal hull + mechanical coupling + cyan accent plasma coil.
- Wear/story (5/5): Corporate stencil + meridian maintenance tick + heat discolor = Core/Meridian polish; contrast engine_ion_small Pit patch.
- Scale truth (5/5): Full engine at d≈2.77m.
- Lighting readability (5/5): iter3_lit_close_stencil shows corporate hex stencil; iter3_lit_close_coil shows plasma band.

**Story fit:** Core/Meridian high-tier ring drive per `needed-assets.md` — corporate polish with cyan plasma coil accent.

**≥6 surfacing techniques:** engine_plasma_ring_trim_sheet_1k, engine_plasma_ring_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, corporate hull clearcoat 0.18, accent emissive coil 0.22.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 1888 tris / 248812 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/engine_plasma_ring/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (plasma coil + corporate stencil + nav trim), deficiency iter0–iter3.

---

## Elite iter4 uplift for engine_plasma_ring (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_engine_plasma_ring_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_ring.png`, `_iter4_lit_close_coil.png`, `_iter4_lit_close_stencil.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`engine_plasma_ring_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`engine_plasma_ring_wear_mask_2k.jpg`)
3. Plasma glow roughness story map (`engine_plasma_ring_plasma_glow_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on ring outer
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + heat discolor zones
10. Anisotropy/clearcoat corporate Meridian hull paint
11. Emissive story accent on plasma coil band + ring glow port
12. Localized decal alpha on faction stripe port

**DET layers (12):** DET_cavity_grime_vent, DET_corporate_stencil, DET_dock_scuff, DET_faction_stripe_port, DET_field_coupling, DET_heat_discolor, DET_meridian_tick, DET_micro_scratch_plate, DET_nav_trim_ring, DET_panel_line_emphasis, DET_plasma_coil_band, DET_ring_glow_port

**Export/finalize:** **8784 tris / 1901232 B** · `PRO Elite Finish 2026-07-06`