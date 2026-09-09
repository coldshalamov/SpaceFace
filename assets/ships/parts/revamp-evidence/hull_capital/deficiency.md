# hull_capital — Professional Graphics Revamp Deficiency Log

**Story character:** Cathedral-scale capital hull — Ashfall Reach anomaly dread. Vault ribs, dungeon port recesses, oxidized iron, violet anomaly veins, boss signal spire. Per `needed-assets.md` + Iron Maw / cathedral wreck lore: ominous, dungeon dread, not corporate clean.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

**Surfacing techniques (≥6 — professional-techniques.md):**
1. Layered MixRGB node materials (oxidized Hull / void Mechanical / anomaly Accent)
2. AO geometry bake → `ao` TEX_IMAGE per role
3. Roughness variation — SF_EdgeWear + SF_CavityDirt + heavy ashfall wear mask (Fac=0.68–0.72)
4. Trim sheet UV — image-gen `hull_capital_trim_sheet_1k.jpg` + bump 0.72–0.78
5. Wear mask — image-gen `hull_capital_wear_mask_1k.jpg` (oxidation bloom, ash-cake, rib valley grime)
6. Matte oxidized coat (Coat Weight 0.08 — not corporate chrome)
7. Accent emissive 0.45 on anomaly vein + boss spire
8. Smart-project UV on LOD0 + 9 DET meshes

**Story-matched skin pass (GOAL item 6):**
- **Treatment 1 — Cathedral ribs:** `DET_cathedral_rib` pair + vault keel — dungeon vault read in `iter1_lit_34`
- **Treatment 2 — Ashfall oxidation:** `DET_ashfall_oxidation` + heavy wear mask — rust/ash bloom (fixed camera in `iter3_lit_close_oxidation_fixed`)
- **Treatment 3 — Anomaly violet vein:** `DET_anomaly_vein` emissive stripe — Ashfall anomaly identity distinct from Core cyan or fringe red

**Textures folder:** `assets/ships/parts/textures/hull_capital/`
| File | Story beat |
|---|---|
| `hull_capital_trim_sheet_1k.jpg` | Vault rib seams, cathedral plating, anomaly vein traces |
| `hull_capital_wear_mask_1k.jpg` | Oxidation bloom, ash-cake lower hull, rib valley grime |
| `Material_Hull_ao_1k.png` | Rib recess + vault keel cavity depth |
| `Material_Mechanical_ao_1k.png` | Dungeon port recess depth |
| `Material_Accent_ao_1k.png` | Anomaly vein / spire grounding |

---

## Before iter0 for hull_capital (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_hull_capital_iter0_clay_34/front/side/rear/top/close_rib/close_vein/close_spire` (4 via `render_viewport_to_path` + batch)

**MCP observations:**
- Silhouette (3/5): Large capital wedge ~14m; full hull visible clay_34 but bare LOD0.
- Macro/meso/micro (1/5): No cathedral ribs, vault keel, anomaly vein (§Macro capital dread).
- Material zones (1/5): Monochrome clay — fails Full Finish Bar.
- Wear/story (1/5): No Ashfall oxidation or anomaly narrative.
- Scale truth (5/5): 14.1×7.0m bounds correct for capital tier.
- Lighting readability (5/5): Full-frame clay; top reframed for wingspan.

**≥6 iter1 improvements:**
1. Nine DET layers (ribs, keel, oxidation, vein, port, dread panel, spire, wreck scar)
2. Image-gen trim + ashfall wear masks
3. Full Finish PBR + AO bake (3 roles)
4. Anomaly violet accent emissive
5. EEVEE lit HDRI ≥5 passes
6. Dungeon dread matte oxidized surfaces (low clearcoat)

---

## Before iter1 for hull_capital (MCP post-DET + surfacing 2026-07-06)

**Renders:** `2026-07-06_hull_capital_iter1_lit_34/front/side/rear/top/close_rib/close_vein/close_spire`

**MCP observations:**
- Silhouette (5/5): Cathedral capital with rib towers + boss spire reads at game scale; full ship lit_34.
- Macro/meso/micro (4/5): Nine DET layers add vault identity; dungeon port recess subtle in side view.
- Material zones (4/5): Oxidized dark hull + violet anomaly stripe + spire glow.
- Wear/story (3/5): Oxidation DET present but weak at mid distance without close pass.
- Lighting readability (5/5): Full-frame lit; HDRI grounding.

**≥5 iter2 improvements:**
1. Accent emissive boost 0.45 on vein + spire
2. Wear Fac 0.72 for rib valley oxidation
3. CAM_lit_close_oxidation for ashfall bloom verification
4. Bump 0.78 trim rib depth
5. close_rib camera for cathedral rib pair framing

---

## Before iter2 for hull_capital (MCP refinement 2026-07-06)

**Renders:** `2026-07-06_hull_capital_iter2_lit_34/front/side/top/close_rib/close_vein/close_oxidation`

**MCP observations:**
- Material zones (5/5): Violet vein stripe distinct from gunmetal hull in lit_front.
- Wear/story (4/5): Rib towers + wreck scar asymmetric; oxidation close needs reframing.
- Lighting readability (2/5): **close_oxidation FAILED** — frame mostly black (camera too low/tight).

**≥5 iter3 improvements:**
1. Reframe CAM_lit_close_oxidation on DET_ashfall_oxidation + adjacent rib
2. Final bump 0.78 pass
3. Retake `iter3_lit_close_oxidation_fixed`
4. Export + finalize verification
5. Honest screenshot audit ≥29

---

## Before iter3 for hull_capital (MCP Full Finish 2026-07-06)

**Renders:** `2026-07-06_hull_capital_iter3_lit_34/front/side/rear/close_spire/close_oxidation_fixed`

**MCP observations:**
- Silhouette (5/5): Cathedral-scale capital unchanged; full ship lit_34 with rib pair + spire.
- Macro/meso/micro (5/5): All nine DET meshes readable; boss spire dominates dorsal dread read.
- Bevel language (4/5): Bevel+WN applied pre-export.
- Material zones (5/5): Oxidized hull + violet anomaly — not monochrome; dungeon port mechanical zone.
- Wear/story (5/5): Ashfall oxidation + cathedral ribs + anomaly vein = Ashfall dread distinct from frigate/gunship.
- Scale truth (5/5): 14.1m preserved.
- Lighting readability (5/5): 30 MCP/batch viewport renders; full-view analyzable after oxidation fix.

**Export:** spaceface_export.py (tri_budget=15000) → finalize **3468 tris / 930292 B** (2026-07-06 blender_mcp). Materials: Hull/Mechanical/Accent. Images: 5.

**Screenshot count:** 30 distinct renders (8 iter0 clay + 8 iter1 lit + 7 iter2 lit + 6 iter3 lit + 1 oxidation_fixed).

**Full Finish Bar:** SATISFIED (including story-matched skin pass item 6).