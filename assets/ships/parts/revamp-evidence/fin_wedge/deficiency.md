# fin_wedge — Professional Graphics Revamp Deficiency Log

**Story character:** Pit starter utilitarian stabilizer — scratched radiator slits, worn mounting hardware, fringe sodium accent on edge light. Per vibe-CANONICAL: repossessed tug parts, honest wear not decoration.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for fin_wedge (MCP baseline 2026-07-06)

**Renders:** `2026-07-06_fin_wedge_iter0_clay_34.png`, `_iter0_clay_front/top/side.png`, `_iter0_close_edge.png`

**MCP observations:**
- Silhouette (4/5): Wedge_Main reads as stabilizer fin at game scale; Wedge_Edge_Light adds dorsal identity.
- Macro/meso/micro (2/5): Clean wedge form; lacks radiator slit meso and mount bracket micro (professional-techniques.md §Meso panel insets).
- Bevel language (3/5): Prior WN on merged mechanical; edge light separate mesh.
- Material zones (2/5): Hull + mechanical merged only; no accent wear patch zone.
- Wear/story (1/5): Uniform clay — no Pit starter radiator scoring or field-repair character.
- Lighting readability (4/5): Full fin visible all 5 angles after camera fix (lens 55-65, dist 1.4x).

**≥5 iter1 improvements:**
1. DET_radiator_slit meso groove (Ryan King panel inset)
2. DET_mount_bracket at root (Star Citizen joint greeble)
3. DET_wear_patch accent zone (texture-paint target per Ryan King hybrid surfacing)
4. AO_Bake + noise roughness variation (professional-techniques.md §Node layering)
5. Material_Accent + Material_Mechanical zones

**Techniques:** §Bevel modifier segs=2, §Material zones, §Micro kitbash at joints.

---

## Before iter1 for fin_wedge (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_fin_wedge_iter1_clay_34/front/top.png`, `_iter1_lit_side/34/front.png`, `_iter1_close_edge.png`

**MCP observations:**
- Silhouette (4/5): Radiator slit adds meso read on dorsal edge; mount bracket grounds fin to hull.
- Macro/meso/micro (4/5): 3 DET_ layers added without silhouette clutter.
- Bevel language (4/5): Mount bracket segs=2 bevel matches main stack.
- Material zones (4/5): Accent wear patch + mechanical radiator/mount.
- Wear/story (3/5): Wear patch sells starter field use; needs hand-painted streak mask (Ryan King texture paint pass).
- Lighting readability (4/5): Lit passes show accent cyan vs dark mechanical.

**Techniques:** §AO/Cavity masks, §Decals separate meshes, §Weighted Normal last.

---

## Before iter2 for fin_wedge (MCP Full Finish surfacing audit 2026-07-06)

**Renders:** `2026-07-06_fin_wedge_iter2_lit_34.png`, `_iter2_lit_front/side/top.png`, `_iter2_lit_close_edge.png` (initial top-down cam fail — reframed to low profile like iter1)

**MCP observations (iter2_lit_34 reframed):**
- Silhouette (4/5): Wedge plate + edge light bar + DET radiator/mount/wear read as stabilizer fin at game scale; full edge profile visible.
- Macro/meso/micro (4/5): Trim sheet panel lines on dorsal + beveled edge wear; radiator slit gold trim in close_edge; mount bracket at root.
- Bevel language (4/5): Edge thickness bands catch key light; DET segs=2 consistent.
- Material zones (4/5): Hull dark paint, mechanical radiator/mount, sodium-amber accent edge light (Pit fringe) — 3 roles visible.
- Wear/story (3/5): Trim rust on edge profile; wear patch accent present; needs root soot at mount (iter3).
- Lighting readability (4/5): Low 3/4 profile shows full fin; close_edge shows slit detail with fin context.

**Story fit:** Pit starter utilitarian stabilizer — honest field wear, sodium accent edge light (not Core cyan), radiator scoring per repossessed tug parts.

**≥6 surfacing techniques:** trim_sheet, wear_mask, SF_EdgeWear, AO bake (Hull/Mech/Accent), clearcoat, emissive accent edge.

**≥5 iter3 improvements:** root soot streak, remove duplicate DET at origin, hide merged mechanical duplicate, export ao_bake nodes, reframed close_radiator cam.

---

## Before iter3 for fin_wedge (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_fin_wedge_iter3_lit_34.png`, `_iter3_lit_close_edge.png`, `_iter3_lit_close_radiator.png`, `_iter3_clay_34.png` (+ 19 prior iter0/iter1/2026-07-05)

**MCP observations:**
- Silhouette (4/5): Unchanged; root soot adds mount contact narrative without clutter.
- Macro/meso/micro (4/5): close_edge shows radiator slit gold insets + wear patch beige; edge light amber stripe along wedge lip.
- Material zones (5/5): Pit sodium accent vs dark hull vs mechanical gray — 2+ story treatments in lit_close_edge + lit_34.
- Wear/story (4/5): Edge trim wear + root soot + field-repair bracket = Pit starter character complete.
- Scale truth (4/5): Profile lit_34 shows full wedge; close views include adjacent fin surface context.

**Export/finalize:** spaceface_export.py → finalize_part.mjs. Textures: `assets/ships/parts/textures/fin_wedge/`.

**Screenshot audit:** 24 analyzable MCP renders (iter0×5, iter1×7, iter2×6, iter3×4, 2026-07-05×3).

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (sodium edge + radiator slit + wear patch), deficiency iter0–iter3.