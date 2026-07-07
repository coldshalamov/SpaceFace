# engine_vector — Professional Graphics Revamp Deficiency Log

**Story character:** Fringe agile vectoring thruster — precision gimbal + fringe-red stripe + pilot stencil. Per `needed-assets.md`: high-performance interceptor drive; NOT Core corporate (`engine_ion_twin`) or Belt industrial (`engine_industrial`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for engine_vector (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_engine_vector_iter0_{clay_34_full,clay_front,clay_side,clay_top,clay_rear}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Compact vectoring cylinder + gimbal ring + vane cluster reads agile fighter scale ~3.3m.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on main meshes; chamfer language present but flat materials.
- Material zones (2/5): Single-tone clay/lit — hull/mechanical/accent not separated.
- Wear/story (1/5): No fringe-red stripe or pilot stencil yet.
- Scale truth (5/5): Full module framed at d≈2.6m.
- Lighting readability (4/5): iter0_lit_34_full shows vector nozzle termination.

**≥5 iter1 targets:** DET fringe stripe + pilot stencil + vector vane + gimbal mount, trim/wear sheets, AO bakes.

---

## Before iter1 for engine_vector (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_engine_vector_iter1_{clay_34_full,lit_34_full,lit_front,lit_side,lit_close_nozzle,lit_close_stripe,lit_close_vane}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full vector drive + gimbal collar + fringe-red stripe in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + maneuver bolts + cable tie on mount.
- Bevel language (4/5): DET bevel segs=2; gimbal ring facets read precision engineering.
- Material zones (4/5): Hull gunmetal + mechanical + fringe-red accent — 3 roles in lit_34_full.
- Wear/story (3/5): Pilot stencil geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full engine in frame.
- Lighting readability (4/5): iter1_lit_close_vane shows vector vane cluster depth.

---

## Before iter2 for engine_vector (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_engine_vector_iter2_{lit_34_full,lit_side,lit_rear,lit_close_nozzle,lit_close_stripe,lit_close_scorch}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Agile vectoring silhouette unchanged; exhaust burn band on aft nozzle.
- Macro/meso/micro (4/5): Heat scorch band + exhaust burn DET; gimbal mount bolts readable.
- Bevel language (4/5): Consistent DET bevel language across vane + stripe slabs.
- Material zones (5/5): Hull + mechanical + fringe-red accent in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on nozzle scorch band.
- Scale truth (5/5): Full module at d≈3.3m.
- Lighting readability (5/5): iter2_lit_close_scorch shows heat band on nozzle lip.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat precision hull.

---

## Before iter3 for engine_vector (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_engine_vector_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_vane,lit_close_stencil,clay_side}.png` (+ iter0×8, iter1×7, iter2×6, 2026-07-05×4)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full vector drive + gimbal + fringe-red stripe + vane cluster in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + cable tie + maneuver bolts; vector vane sells agile thrust vectoring.
- Bevel language (4/5): Precision engineering bevels; NOT Belt soot stacks or Core inspection stencil bulk.
- Material zones (5/5): Gunmetal hull + mechanical gimbal + fringe-red accent in lit_34_full.
- Wear/story (5/5): Pilot stencil + fringe stripe + heat scorch + exhaust burn = Fringe interceptor fiction; contrast engine_ion_twin Core patrol.
- Scale truth (5/5): Full engine at d≈3.3m.
- Lighting readability (5/5): iter3_lit_close_stencil shows pilot ID stencil; iter3_lit_close_vane shows vane articulation read.

**Story fit:** Fringe agile vectoring thruster per `needed-assets.md` — gimbal precision + fringe-red stripe + pilot stencil sell interceptor kit role.

**≥6 surfacing techniques:** engine_vector_trim_sheet_1k, engine_vector_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, precision hull clearcoat 0.15, accent emissive fringe-red 0.2.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 1076 tris / 243280 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/engine_vector/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (fringe stripe + pilot stencil + vector vane + heat scorch), deficiency iter0–iter3.

---

## Elite iter4 uplift for engine_vector (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_engine_vector_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_nozzle.png`, `_iter4_lit_close_vane.png`, `_iter4_lit_close_stencil.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`engine_vector_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`engine_vector_wear_mask_2k.jpg`)
3. Vector burn roughness story map (`engine_vector_vector_burn_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on precision hull
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on heat scorch + exhaust burn bands
10. Anisotropy/clearcoat precision gimbal paint
11. Emissive story accent on fringe-red stripe + vector vane tips
12. Localized decal alpha on faction stripe port

**DET layers (12):** DET_cable_tie, DET_cavity_grime_vent, DET_exhaust_burn, DET_faction_stripe_port, DET_fringe_red_stripe, DET_gimbal_mount, DET_heat_scorch_band, DET_maneuver_bolt, DET_micro_scratch_plate, DET_panel_line_emphasis, DET_pilot_stencil, DET_vector_vane

**Export/finalize:** **2372 tris / 417480 B** · `PRO Elite Finish 2026-07-06`