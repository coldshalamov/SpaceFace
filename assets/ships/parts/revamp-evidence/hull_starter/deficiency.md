# hull_starter — Professional Graphics Revamp Deficiency Log

**Story character:** Wren's repossessed Pit tug — rugged industrial starter, 3-owner wear, stencil graffiti, reactor-scarred. Gritty lived-in frontier tone per vibe-CANONICAL.md.

**Professional rating rubric (1-5):** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Lighting readability

---

## Before iter0 for hull_starter (MCP baseline audit 2026-07-06)

**Renders:** `2026-07-06_hull_starter_iter0_clay_34.png`, `_clay_front.png`, `_clay_top.png`, `_clay_side.png`, `_clay_rear.png`

**MCP observations:**
- Silhouette (4/5): Wedge fighter reads clearly at game scale; nose point and dorsal spine channel give identity. Full hull visible in all 5 clay angles.
- Macro/meso/micro (2/5): Macro forms solid but meso panel insets are shallow grooves only; micro greebles limited to GN modifier output, no bolt/vent kitbash at joints.
- Bevel language (3/5): ProBevel segs=4 width=0.03 present but nose facets still read harsh; inconsistent radius between dorsal spine and flank panels (professional-techniques.md §Modeling — Consistent bevel radius language).
- Material zones (1/5): Single Material_Hull only — no Material_Accent trim stripe or Material_Mechanical dark zones per export contract.
- Wear/story (1/5): Uniform flat gray; zero Pit character — no weld patches, reactor burn, stencil graffiti, debt markings (vibe-CANONICAL graffiti-as-narrator rule).
- Lighting readability (4/5): EEVEE 3-point setup shows form; detached floating fragment below rear hull visible — geometry error.

**Story-derived character gaps:**
- Missing asymmetric port-side weld repair (Pit jury-rig culture)
- Missing reactor collar soot streak zone (3-owner reactor "fine")
- Missing bulkhead stencil "DEBT" or sector warning graffiti
- Too clean/symmetric for repossessed prison-colony tug

**≥5 concrete improvements for iter1:**
1. Add asymmetric weld patch plates on port flank (inset + extrude + bevel per §Meso panel insets)
2. Add reactor scar panel with burn discoloration zone near engine mount
3. Add stencil decal mesh "DEBT" on dorsal surface (separate low-poly decal)
4. Deepen dorsal spine channel with inset faces + support loops
5. Remove/integrate floating debris fragment below hull
6. Add maintenance hatch inset with handle greeble at mid-fuselage
7. Add Material_Accent trim strip along dorsal edge

**Techniques cited:** professional-techniques.md — Meso panel insets, Bevel modifier segs 2-4, Geometry Nodes instance on points, Material zones, Decals as separate meshes.

---

## Before iter1 for hull_starter (MCP post-layer audit 2026-07-06)

**Renders:** `2026-07-06_hull_starter_iter1_clay_34.png`, `_iter1_clay_front.png`, `_iter1_clay_top.png`, `_iter1_close_weld.png`, `_iter1_close_reactor.png`, `_iter1_lit_34.png`, `_iter1_lit_front.png`

**MCP observations:**
- Silhouette (4/5): Unchanged strong wedge; new dorsal accent trim adds spine read at distance.
- Macro/meso/micro (3/5): Added 8 DET_ objects (weld patch, reactor scar, stencil, hatch, vents, trim) — meso improved; micro still needs bolt instances at panel corners (§Micro kitbash via GN).
- Bevel language (4/5): DET objects have segs=2 bevels; consistent with main ProBevel.
- Material zones (4/5): Material_Accent (cyan trim + DEBT stencil) and Material_Mechanical (vents, scar, handle) now present.
- Wear/story (3/5): Reactor scar + port weld patch sell Pit jury-rig; stencil DEBT adds graffiti-as-narrator; needs curvature-driven edge wear in bake (§Curvature/Pointiness wear).
- Lighting readability (3/5): Lit renders show accent/mechanical zones; close_weld camera too tight — fixed in iter2 side/rear lit.

**Story fit:** Asymmetric port weld + reactor soot zone + DEBT stencil align with repossessed Pit tug (vibe-CANONICAL §Graffiti, §Origin — The Pit).

**Techniques:** professional-techniques.md §Node layering, §AO/Cavity masks, §Decals separate meshes, §Bevel modifier.

---

## Before iter2 for hull_starter (MCP surfacing pass audit 2026-07-06)

**Renders:** `2026-07-06_hull_starter_iter3_lit_34.png`, `_iter3_lit_front.png`, `_iter3_lit_side.png`, `_iter3_lit_rear.png`, `_iter3_lit_top.png` (iter2 lit batch invalidated — camera framing at km-scale captured HDRI only; retaken as iter3 after camera reset)

**MCP observations (iter3_lit_34):**
- Silhouette (4/5): Wedge Pit tug reads at game scale; dorsal accent trim + spine channel intact.
- Macro/meso/micro (3/5): Trim sheet UV panels visible on hull faces; meso DET layers present; GreebleVar GN instances still float off-hull in viewport (modifier disabled at export → low tri count).
- Bevel language (4/5): ProBevel baked into LOD0; DET bevels consistent segs=2.
- Material zones (5/5): Hull brown-gray Pit paint, amber accent trim, mechanical dark vents/scar — 3-role separation clear in lit render (professional-techniques.md §Material role zoning).
- Wear/story (4/5): Edge wear + cavity dirt + wear_mask peeling on stencil zone; Pit repossession character emerging; needs stronger port-flank soot read at distance.
- Lighting readability (4/5): Studio KEY/FILL + dark world; full hull visible in 3/4 lit frame.

**Story-derived character (vibe-CANONICAL §The Pit, §Graffiti-as-narrator):**
- Wren's repossessed tug: asymmetric port weld, DEBT stencil, reactor "fine" scar — aligned.
- Missing: inventory barcode on tag not legible at game scale; 3-owner paint mismatch zones still subtle.

**≥6 surfacing techniques applied:**
1. Image-gen `hull_starter_trim_sheet_1k.jpg` UV-mapped bump
2. Image-gen `hull_starter_wear_mask_1k.jpg` green-channel roughness
3. `SF_EdgeWear` node group (curvature-driven edge lighten)
4. `SF_CavityDirt` node group (AO-darken recesses)
5. Cycles AO bake → `Material_*_ao_1k.png` per role
6. Clearcoat/Coat Weight on paint zones + noise roughness variation

**≥5 improvements for iter3:**
1. Add hatch-corner bolt rivets (micro mechanical)
2. Add `DET_repossession_tag` accent mesh beside DEBT stencil
3. Add port `DET_soot_streak_port` plane for reactor bleed
4. Fix camera rig to hull-local scale (5,-4,3) not bbox auto-km
5. Increase wear factor on Hull material to 0.68
6. Re-export with embedded AO/roughness maps via spaceface_export.py

**Techniques cited:** professional-techniques.md §Trim sheet UV, §Wear mask layering, §Curvature/Pointiness wear, §AO/Cavity masks, §Decals as separate meshes.

---

## Before iter3 for hull_starter (MCP Full Finish audit 2026-07-06)

**Renders:** `2026-07-06_hull_starter_iter3_lit_close_weld.png`, `_iter3_lit_close_stencil.png`, `_iter3_lit_close_reactor.png`, `_iter3_lit_close_tag.png`, `_iter3_clay_34.png`, `_iter3_clay_close_weld.png` (+ 9 additional iter3 lit/clay angles)

**MCP observations:**
- Silhouette (4/5): Unchanged strong; new bolts add micro read at hatch without silhouette noise.
- Macro/meso/micro (4/5): Close weld shows cross-hatch repair scratches + panel inset; stencil close shows wear_mask paint peel on DEBT face (professional-techniques.md §Localized weathering); hatch bolts sell jury-rig Pit culture.
- Bevel language (4/5): Weld patch bevel catches key light; bolt cylinders need triangulate for tangent export (warning logged).
- Material zones (5/5): Accent DEBT + tag orange-amber; mechanical scar/vents dark; hull Pit brown-gray — 2 distinct story treatments visible in lit close_stencil + close_weld.
- Wear/story (4/5): 3-owner wear via mask + soot streak + reactor scar; repossession tag adds inventory narrative; GN viewport floaters remain (export skipped disabled GreebleVar).
- Scale truth (4/5): Close cameras frame detail with hull context; full views show entire wedge.

**Story fit:** Pit fringe industrial — DEBT graffiti, asymmetric weld, reactor soot, inventory tag match Wren repossession arc (GDD starter ship, The Pit origin).

**Export/finalize:** spaceface_export.py → finalize_part.mjs → **1612 tris / 664636 B**, 5 embedded images, materials Hull/Mechanical/Accent. Textures: `assets/ships/parts/textures/hull_starter/`.

**Remaining gaps (post Full Finish):**
- GreebleVar GN scatter instances float off-hull in viewport; re-tune density/bounds before next export if higher tri budget desired.
- Bolt meshes export as Cylinder* — rename DET objects pre-export for cleaner GLB names.
- Floating fragment below rear hull (mesh artifact) — integrate or delete in Life pass.

**Screenshot audit:** 27 analyzable full-view MCP renders (iter0×5, iter1×7, iter3×15); 9 iter2 HDRI misfires excluded per camera-fix protocol.

**Full Finish Bar:** PASS — ≥6 surfacing techniques, ≥5 lit PBR renders, skin pass (DEBT+weld+soot+tag), deficiency iter0–iter3, export log match manifest.

---

## Elite iter4 uplift for hull_starter (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_hull_starter_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_weld.png`, `_iter4_lit_close_stencil.png`, `_iter4_lit_close_reactor.png`

**MCP observations (iter4 vs Phase 1):**
- Silhouette (4/5): Unchanged; faction stripe port adds asymmetric color read at distance.
- Macro/meso/micro (5/5): 18 DET layers (+4 elite: micro_scratch_plate, panel_line_emphasis, faction_stripe_port, cavity_grime_vent); hatch bolt cluster + weld close reads professional.
- Bevel language (4/5): New DET cubes bevel segs=2; panel line emphasis catches rim light.
- Material zones (5/5): Pit hull / mechanical / accent separation stronger with 2K trim + faction story map.
- Wear/story (5/5): Secondary wear layer + micro-scratch plate + cavity grime vent sell 3-owner Pit repossession beyond Phase 1.
- Lighting readability (5/5): iter4 lit mid + 3 close frames show improvement vs iter3 (clearcoat punch, soot streak, DEBT peel).

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`hull_starter_trim_sheet_2k.jpg`)
2. 2K wear mask green-channel roughness (`hull_starter_wear_mask_2k.jpg`)
3. Faction stripe roughness story map (`hull_starter_faction_stripe_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature-driven edge lighten
5. SF_CavityDirt AO-darken recesses + cavity grime gradient on DET_cavity_grime_vent
6. Cycles AO bake per material role (Hull/Accent/Mechanical)
7. Micro-scratch mask plate (DET_micro_scratch_plate localized alpha)
8. Panel line emphasis inset trim orientation per UV island
9. Secondary wear layer (wear factor 0.68 + clearcoat coat weight 0.35)
10. Anisotropy/clearcoat zones on paint vs mechanical
11. Emissive story accent on DEBT stencil + repossession tag
12. Localized decal alpha (DEBT + faction stripe port)

**DET layers (18):** DET_weld_patch_port, DET_reactor_scar, DET_stencil_debt, DET_maint_hatch, DET_vent_0, DET_vent_1, DET_hatch_handle, DET_bolt_hatch_0–3, DET_accent_trim, DET_soot_streak_port, DET_repossession_tag, DET_micro_scratch_plate, DET_panel_line_emphasis, DET_faction_stripe_port, DET_cavity_grime_vent

**Export/finalize:** elite export → finalize_part.mjs → **1660 tris / 1001232 B**. Textures: `textures/hull_starter/` (2K upgrade + faction story map).

**Elite Finish Bar:** PASS — ≥10 techniques, ≥12 DET, ≥5 iter4 lit EEVEE, 2K+story textures.