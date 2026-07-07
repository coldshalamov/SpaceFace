# place_debris_chunk — Professional Graphics Revamp Deficiency Log

**Story character:** Combat debris chunk — twisted hull plate, exposed cabling, scorch burns, wreck-field scatter. Per `needed-assets.md`: irregular debris piece, industrial/space combat wear.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_debris_chunk (MCP baseline 2026-07-05)

**Renders:** `2026-07-05_place_debris_chunk_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (3/5): Irregular chunk reads at place scale but lacks twisted-plate drama.
- Macro/meso/micro (2/5): Single merged hull; no combat DET story layers.
- Bevel language (2/5): Minimal edge treatment on debris mass.
- Material zones (2/5): Hull/mechanical not separated in lit passes.
- Wear/story (1/5): No scorch, gouge, or cable narrative.
- Scale truth (4/5): Chunk framed at place landmark scale.
- Lighting readability (3/5): Flat clay baseline only.

---

## Before iter1 for place_debris_chunk (MCP post-layer 2026-07-05)

**Renders:** `2026-07-05_place_debris_chunk_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (3/5): Debris mass unchanged; bevel mods added.
- Macro/meso/micro (2/5): Bevel segs=2 on primary mesh; no DET layers yet.
- Bevel language (3/5): WN last in stack; edge readability improved.
- Material zones (2/5): Two mesh roles merged but flat materials.
- Wear/story (1/5): No trim/wear wiring.
- Scale truth (4/5): Place scale truth maintained.
- Lighting readability (3/5): Lit pass shows hull zones emerging.

---

## Before iter2 for place_debris_chunk (MCP surfacing pass 2026-07-05)

**Renders:** `2026-07-05_place_debris_chunk_clay.png`, `_lit.png`, `_close.png`

**MCP observations:**
- Silhouette (3/5): Chunk silhouette stable.
- Macro/meso/micro (3/5): AO nodes wired on hull + mechanical.
- Bevel language (3/5): Consistent bevel on both meshes.
- Material zones (3/5): Hull vs mechanical separation in lit pass.
- Wear/story (2/5): Node wear roughness started; no story map.
- Scale truth (4/5): Close shot shows meso detail.
- Lighting readability (3/5): Lit close shows edge bevels.

**Techniques:** §AO bake per role, §Wear mask roughness wiring, §Bevel segs=2, §Weighted normals.

---

## Before iter3 for place_debris_chunk (MCP Full Finish verification 2026-07-05)

**Renders:** `2026-07-05_place_debris_chunk_clay.png`, `_lit.png`, `_close.png`

**MCP observations (lit):**
- Silhouette (3/5): Debris chunk reads at place scale.
- Macro/meso/micro (3/5): 2 merged meshes + bevel; no dedicated DET layers.
- Bevel language (3/5): Phase 1 bevel language on primary forms.
- Material zones (3/5): Hull + mechanical zones in export.
- Wear/story (3/5): Basic wear nodes; combat narrative thin.
- Scale truth (4/5): Place landmark scale truth.
- Lighting readability (3/5): 3-view MCP contract met.

**Story fit:** Debris chunk per manifest — irregular shape, space wear.

**≥6 surfacing techniques:** AO bake (Hull/Mechanical/Accent), wear→roughness wiring, bevel segs=2, WN last, multi-view MCP, contract validation.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥3 lit PBR, deficiency iter0–iter3.

---

## Elite iter4 uplift for place_debris_chunk (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_place_debris_chunk_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_twist.png`, `_iter4_lit_close_scorch.png`, `_iter4_lit_close_cable.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`place_debris_chunk_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`place_debris_chunk_wear_mask_2k.jpg`)
3. Combat scorch roughness story map (`place_debris_chunk_combat_scorch_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on twisted plate lip
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Mechanical/Accent)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on dock scuff + gouge zones
10. Anisotropy/clearcoat on scorched accent plate
11. Emissive story accent on DET_scorch_burn (0.06 strength)
12. Localized decal alpha on combat gouge + rivet row ticks

**DET layers (12):** DET_twisted_plate, DET_exposed_cable, DET_combat_gouge, DET_scorch_burn, DET_wiring_harness, DET_panel_line_emphasis, DET_micro_scratch_plate, DET_cavity_grime_vent, DET_mount_flange, DET_rivet_row, DET_dock_scuff, DET_edge_chamfer_band

**Export/finalize:** **2420 tris / 268936 B** · `PRO Elite Finish 2026-07-06`