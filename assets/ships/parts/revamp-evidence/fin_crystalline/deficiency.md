# fin_crystalline — Professional Graphics Revamp Deficiency Log

**Story character:** Anomaly crystalline fin — violet vein bleed, crystal spire, phase seam facets. Per `needed-assets.md`: Anomaly faction exotic stabilizer; NOT Belt smuggler (`fin_swept_smuggler`) or Pit wedge (`fin_wedge`).

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for fin_crystalline (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_fin_crystalline_iter0_{clay_34_full,clay_front,clay_side,clay_top}.png`, `_iter0_lit_{34_full,front,side}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (4/5): Crystal plane + accent merged reads at ~4.2m fin scale.
- Macro/meso/micro (2/5): Imported GLB bevel mods only; no DET story layers.
- Bevel language (3/5): Bevel segs=3 on meshes; chamfer present but flat materials.
- Material zones (2/5): Clay/lit single-tone — accent-dominant, no hull/mechanical separation.
- Wear/story (1/5): No violet vein or fracture lines yet.
- Scale truth (5/5): Full fin framed at d≈4.2m.
- Lighting readability (4/5): iter0_lit_34_full shows crystalline silhouette in HDRI.

**≥5 iter1 targets:** DET spire/vein/facet layers, trim/wear sheets, AO bakes per role.

---

## Before iter1 for fin_crystalline (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_fin_crystalline_iter1_{clay_34_full,clay_side,lit_34_full,lit_front,lit_side,lit_close_crystal,lit_close_vein,lit_close_spire}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full crystal fin + spire + violet veins in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + anomaly facet + phase seam started.
- Bevel language (4/5): DET bevel segs=2 on accent crystal slabs.
- Material zones (4/5): Violet accent + dark hull collar + mechanical vent — 3 roles.
- Wear/story (3/5): Veil stencil geometry present; trim/wear not yet wired.
- Scale truth (5/5): Full fin in frame.
- Lighting readability (4/5): iter1_lit_close_crystal shows crystal plane meso detail.

---

## Before iter2 for fin_crystalline (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_fin_crystalline_iter2_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_crystal,lit_close_vein,lit_close_spire,clay_34_full,clay_side}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Anomaly crystalline fin unchanged; fracture line on crystal edge.
- Macro/meso/micro (4/5): Resonance tick + cavity grime DET; panel line on facet flank.
- Bevel language (4/5): Consistent DET bevel language across vein + spire zones.
- Material zones (5/5): Violet accent + hull collar + mechanical vent in lit_34_full.
- Wear/story (4/5): Trim sheet MULTIPLY on hull; wear mask on violet vein face.
- Scale truth (5/5): Full fin at d≈4.2m.
- Lighting readability (5/5): iter2_lit_close_vein shows violet bleed detail.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat crystal accent.

---

## Before iter3 for fin_crystalline (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_fin_crystalline_iter3_{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_crystal,lit_close_vein,lit_close_spire,clay_34_full,clay_side}.png` (+ iter0×7, iter1×10, iter2×10, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full crystal fin + spire + violet veins in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + fracture lines + veil stencil; phase seam on facet.
- Bevel language (4/5): Anomaly exotic bevels; NOT Belt smuggler or industrial radiator.
- Material zones (5/5): Violet accent crystal + dark hull collar + mechanical vent in lit_34_full.
- Wear/story (5/5): Violet vein + fracture line + resonance tick + veil stencil = Anomaly exotic fin; contrast fin_swept_smuggler Belt runner.
- Scale truth (5/5): Full fin at d≈4.2m.
- Lighting readability (5/5): iter3_lit_close_spire shows crystal spire; iter3_lit_close_vein shows violet bleed.

**Story fit:** Anomaly crystalline fin per `needed-assets.md` — phase seam accountability + violet resonance marks.

**≥6 surfacing techniques:** fin_crystalline_trim_sheet_1k, fin_crystalline_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, crystal clearcoat 0.15, accent emissive violet 0.35.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 540 tris / 194568 B (Phase 1 baseline). Textures: `assets/ships/parts/textures/fin_crystalline/`.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (violet vein + fracture + veil stencil), deficiency iter0–iter3.

---

## Elite iter4 uplift for fin_crystalline (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_fin_crystalline_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_crystal.png`, `_iter4_lit_close_vein.png`, `_iter4_lit_close_spire.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`fin_crystalline_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`fin_crystalline_wear_mask_2k.jpg`)
3. Violet vein roughness story map (`fin_crystalline_violet_vein_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on crystal plane leading edge
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on phase seam + fracture line zones
10. Anisotropy/clearcoat Anomaly violet crystal paint
11. Emissive story accent on crystal spire + violet vein bleed
12. Localized decal alpha on veil stencil + faction stripe port

**DET layers (12):** DET_anomaly_facet, DET_cavity_grime_vent, DET_crystal_spire, DET_faction_stripe_port, DET_fracture_line, DET_micro_scratch_plate, DET_mount_collar, DET_panel_line_emphasis, DET_phase_seam, DET_resonance_tick, DET_veil_stencil, DET_violet_vein

**Export/finalize:** **4248 tris / 329464 B** · `PRO Elite Finish 2026-07-06`