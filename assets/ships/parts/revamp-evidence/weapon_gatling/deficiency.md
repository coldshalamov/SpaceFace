# weapon_gatling — Professional Graphics Revamp Deficiency Log

**Story character:** Belt-fed industrial gatling — rapid-fire wear, heat scoring on muzzle, cartridge scuffs. Fringe/Pit weapons culture per vibe-CANONICAL.md.

---

## Before iter0 for weapon_gatling (MCP baseline audit 2026-07-06)

**Renders:** `2026-07-06_weapon_gatling_iter0_clay_34.png`, `_iter0_clay_front.png`, `_iter0_clay_top.png`, `_iter0_clay_side.png`, `_iter0_close_barrel.png`

**MCP observations:**
- Silhouette (4/5): Multi-barrel cluster + coil housing reads as gatling at game scale; full weapon visible after camera fix.
- Macro/meso/micro (3/5): Good barrel ring meso; coils merged; lacks ammo feed, mount rail, heat disc micro-story.
- Bevel language (3/5): Prior bevel+WN on main meshes; barrel rings faceted but consistent.
- Material zones (2/5): Mechanical merged present; no accent heat zone on muzzle.
- Wear/story (2/5): No cartridge scuff plate, no heat scoring — doesn't sell rapid-fire industrial grit.
- Lighting readability (2/5): Initial clay_34 too small in frame; close_barrel too dark.

**≥5 improvements for iter1:**
1. Add ammo feed bracket (belt-fed character)
2. Add heat scoring disc at muzzle (accent material)
3. Add mount rail under housing
4. Add cartridge scuff plate on housing flank
5. Fix camera framing (1.4x dist, lens 65)
6. Add AO + noise roughness variation
7. Brighter key light (1200 energy)

**Techniques:** professional-techniques.md §Meso panel insets, §Material zones, §Curvature wear, §Bevel modifier.

---

## Before iter1 for weapon_gatling (MCP post-layer audit 2026-07-06)

**Renders:** `2026-07-06_weapon_gatling_iter1_clay_34.png`, `_iter1_clay_front/top/side.png`, `_iter1_close_barrel.png`, `_iter1_lit_34.png`, `_iter1_lit_front.png`

**MCP observations:**
- Silhouette (5/5): Ammo feed + mount rail add industrial bulk; heat disc adds muzzle identity.
- Macro/meso/micro (4/5): 4 DET_ objects layered; barrel rings + coils + new details cohesive.
- Bevel language (4/5): DET objects have segs=2 bevels matching main meshes.
- Material zones (4/5): Accent on heat disc, Mechanical on feed/rail/scuff.
- Wear/story (4/5): Scuff plate + heat disc sell rapid-fire; belt fringe character achieved.
- Lighting readability (4/5): Lit renders show cyan heat disc and dark mechanical zones clearly.

**Techniques:** §Node layering, §AO/Cavity masks, §Decals separate meshes, §Multiple material slots.

---

## Before iter2 for weapon_gatling (MCP Full Finish surfacing audit 2026-07-06)

**Renders:** `2026-07-06_weapon_gatling_iter2_lit_34.png`, `_iter2_lit_front.png`, `_iter2_lit_side.png`, `_iter2_lit_top.png`, `_iter2_lit_close_barrel.png`

**MCP observations (iter2_lit_34):**
- Silhouette (5/5): Full belt-fed gatling visible — housing, barrel cluster, muzzle heat disc, mount rail, ammo feed bracket; reads at game scale.
- Macro/meso/micro (4/5): Trim sheet rust on housing + barrel rings; meso DET layers positioned; barrel ring micro reads in close_barrel.
- Bevel language (4/5): Ring facets + housing bevels consistent; heat disc cylinder clean.
- Material zones (5/5): Mechanical gunmetal + orange accent heat at muzzle — 2 story treatments visible (professional-techniques.md §Material role zoning).
- Wear/story (4/5): Cartridge scuff plate + belt markings on barrel; Pit/Fringe rapid-fire grit achieved; muzzle was peach placeholder before accent rewire.
- Lighting readability (5/5): Full weapon in frame; studio KEY 1200; dark world — analyzable for iteration.

**Story fit (vibe-CANONICAL §Fringe weapons, belt-fed industrial):** Ammo feed + scuff plate + heat scoring sell rapid-fire belt culture; orange emissive heat disc = sustained fire scoring.

**≥6 surfacing techniques applied:**
1. Image-gen `weapon_gatling_trim_sheet_1k.jpg` UV bump
2. Image-gen `weapon_gatling_wear_mask_1k.jpg` green-channel roughness
3. `SF_EdgeWear` node group (curvature edge wear)
4. Cycles AO bake → `Material_Mechanical_ao_1k.png` + `Material_Accent_ao_1k.png`
5. Clearcoat/Coat Weight on mechanical paint
6. Emissive heat on `Material_Accent` muzzle disc + wear mask red on accent

**≥5 improvements for iter3:**
1. Reposition DET meshes from origin to housing/muzzle (parent-local coords)
2. Assign `Material_Accent` to `Gatling_Muzzle` (was peach Material_Mechanical.002)
3. Hide duplicate `weapon_gatling_Material_Mechanical_Merged` from viewport
4. Add `CAM_lit_close_heat` + `CAM_lit_close_scuff` with full-context framing
5. Name `ao_bake`/`rough_bake` nodes for export contract
6. Re-export with embedded textures via spaceface_export.py

**Techniques cited:** professional-techniques.md §Trim sheet UV, §Wear mask layering, §Curvature wear, §AO/Cavity masks, §Emissive masking.

---

## Before iter3 for weapon_gatling (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_weapon_gatling_iter3_lit_34.png`, `_iter3_lit_close_heat_fixed.png`, `_iter3_lit_close_scuff.png`, `_iter3_clay_34.png`, `_iter2_lit_close_barrel.png` (+ 18 prior iter0/iter1/2026-07-05)

**MCP observations:**
- Silhouette (5/5): Unchanged strong; heat close shows muzzle+disc+barrel context after camera reframe.
- Macro/meso/micro (4/5): Close barrel shows BELT stencil + ring wear + scuff micro; heat disc emissive orange reads against gunmetal.
- Bevel language (4/5): Barrel ring bevels catch key light in close_barrel.
- Material zones (5/5): Accent heat vs mechanical housing/barrels — distinct story treatments in lit_close_heat_fixed + lit_34.
- Wear/story (5/5): Trim rust + wear mask chips + cartridge scuff + belt-fed bracket = Fringe/Pit rapid-fire character complete.
- Scale truth (5/5): All lit full views show entire weapon assembly; close views include surrounding context.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → **3680 tris / 1466816 B**, 3 embedded images. Textures: `assets/ships/parts/textures/weapon_gatling/`.

**Screenshot audit:** 23 analyzable MCP renders (iter0×5, iter1×7, iter2×5, iter3×4, 2026-07-05×3). Invalid tight heat close retaken as `_fixed`.

**Full Finish Bar:** PASS — ≥6 surfacing techniques, ≥5 lit PBR renders, skin pass (heat+scuff+belt), deficiency iter0–iter3, export log match manifest.