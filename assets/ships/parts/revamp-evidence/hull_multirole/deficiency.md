# hull_multirole — Professional Graphics Revamp Deficiency Log

**Story character:** Free Frontier jack-of-all-trades smuggler — mismatched patchwork hull, jury-rig welds, hidden hatch, violet fringe stripe, salvage plates. Per `needed-assets.md` + `fin_swept_smuggler` violet: lived-in asymmetric repair, not corporate discipline or military battle abuse.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

**Surfacing techniques (≥6 — professional-techniques.md):**
1. Layered MixRGB node materials (salvage Hull / dark Mechanical / fringe-violet Accent)
2. AO geometry bake → `ao` TEX_IMAGE per role
3. Roughness variation — SF_EdgeWear + SF_CavityDirt + patchwork wear mask (Fac=0.62–0.66)
4. Trim sheet UV — image-gen `hull_multirole_trim_sheet_1k.jpg` + bump 0.70–0.76
5. Wear mask — image-gen `hull_multirole_wear_mask_1k.jpg` (asymmetric port patch, dock scrape)
6. Low clearcoat 0.12 smuggler matte (not corporate chrome)
7. Accent emissive 0.32 violet stripe
8. Smart-project UV on LOD0 + 8 DET meshes

**Story-matched skin pass (GOAL item 6):**
- **Treatment 1 — Salvage patchwork:** `DET_salvage_patch` + `DET_mismatched_panel` — mismatched plate boundaries visible in `iter2_lit_close_patch`
- **Treatment 2 — Jury-rig weld seam:** `DET_jury_weld` mechanical zone — smuggler repair read in `iter3_lit_close_weld`
- **Treatment 3 — Violet fringe stripe:** `DET_violet_stripe` emissive — Free Frontier smuggler identity in `iter1_lit_34`

**Textures folder:** `assets/ships/parts/textures/hull_multirole/`
| File | Story beat |
|---|---|
| `hull_multirole_trim_sheet_1k.jpg` | Patchwork panel lines, salvage bolt grids, mixed-manufacturer seams |
| `hull_multirole_wear_mask_1k.jpg` | Asymmetric port wear, dock scrape, paint-chip boundaries |
| `Material_Hull_ao_1k.png` | Salvage patch + field repair cavity depth |
| `Material_Mechanical_ao_1k.png` | Hatch + cargo rig + jury antenna depth |
| `Material_Accent_ao_1k.png` | Violet stripe grounding |

---

## Before iter0 for hull_multirole (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_hull_multirole_iter0_clay_34/front/side/rear/top/close_patch/close_hatch/close_stripe` (all via `render_viewport_to_path`)

**MCP observations:**
- Silhouette (3/5): Versatile multirole wedge ~12.2m; full hull visible clay_34 but bare LOD0.
- Macro/meso/micro (1/5): No salvage patch, jury weld, smuggler hatch (§Meso patchwork detailing).
- Material zones (1/5): Monochrome clay — fails Full Finish Bar.
- Wear/story (1/5): No patchwork or smuggler narrative.
- Scale truth (5/5): 12.18×4.45m bounds correct.
- Lighting readability (5/5): Full-frame clay; all 8 MCP renders analyzable.

**≥6 iter1 improvements:**
1. Eight DET layers (salvage, weld, hatch, cargo rig, mismatched panel, violet stripe, antenna, field repair)
2. Image-gen patchwork trim + asymmetric wear masks
3. Full Finish PBR + AO bake (3 roles)
4. Fringe-violet accent emissive stripe
5. EEVEE lit HDRI ≥5 MCP `render_viewport_to_path` passes
6. Low clearcoat smuggler matte surfaces

---

## Before iter1 for hull_multirole (MCP post-DET + surfacing 2026-07-06)

**Renders:** `2026-07-06_hull_multirole_iter1_lit_34/front/side/rear/top/close_patch/close_hatch/close_stripe`

**MCP observations:**
- Silhouette (5/5): Patchwork multirole reads at game scale; full ship lit_34.
- Macro/meso/micro (4/5): Eight DET layers add smuggler identity; antenna_jury thin but visible dorsal.
- Material zones (4/5): Salvage brown hull + violet stripe + dark mechanical hatch.
- Wear/story (3/5): Patchwork DET visible but asymmetric wear weak at mid distance.
- Lighting readability (5/5): Full-frame lit MCP renders; HDRI grounding.

**≥5 iter2 improvements:**
1. Accent emissive 0.32 on violet stripe
2. Wear Fac 0.66 for patch boundary chips
3. Bump 0.74 trim patch seam depth
4. CAM_lit_close_weld for jury-rig verification
5. close_patch framing for salvage plate read

---

## Before iter2 for hull_multirole (MCP refinement 2026-07-06)

**Renders:** `2026-07-06_hull_multirole_iter2_lit_34/front/side/top/close_patch/close_hatch/close_weld`

**MCP observations:**
- Material zones (5/5): Violet stripe + salvage patch + hull separation clear in close_patch.
- Wear/story (4/5): Patchwork asymmetric character improving; weld seam readable in close_weld.
- Lighting readability (5/5): lit_top shows dorsal antenna + cargo rig at game scale.

**≥5 iter3 improvements:**
1. Bump 0.76 final trim depth
2. close_stripe verification for fringe identity
3. Export + finalize verification
4. All 29 renders via `render_viewport_to_path` (renamed from MCP temp)
5. Honest screenshot audit

---

## Before iter3 for hull_multirole (MCP Full Finish 2026-07-06)

**Renders:** `2026-07-06_hull_multirole_iter3_lit_34/front/side/rear/close_stripe/close_weld`

**MCP observations:**
- Silhouette (5/5): Smuggler multirole unchanged; full ship lit_34.
- Macro/meso/micro (5/5): All eight DET meshes readable in close passes.
- Bevel language (4/5): Bevel+WN applied pre-export.
- Material zones (5/5): Salvage hull + violet accent + mechanical — not monochrome.
- Wear/story (5/5): Patchwork + jury weld + violet stripe = Free Frontier smuggler distinct from frigate/gunship.
- Scale truth (5/5): 12.18m preserved.
- Lighting readability (5/5): 29 MCP `render_viewport_to_path` renders; all full-view analyzable.

**Export:** spaceface_export.py (tri_budget=15000) → finalize **2566 tris / 774824 B** (2026-07-06 blender_mcp). Materials: Hull/Mechanical/Accent. Images: 5.

**Screenshot count:** 29 distinct MCP `render_viewport_to_path` renders (8 iter0 clay + 8 iter1 lit + 7 iter2 lit + 6 iter3 lit).

**Full Finish Bar:** SATISFIED (including story-matched skin pass item 6).