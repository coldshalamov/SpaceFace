# hull_gunship — Professional Graphics Revamp Deficiency Log

**Story character:** Heavy weapons platform — military/fringe gunship with battle scars, gunmetal hull, fringe-red military stencil, exhaust soot aft, asymmetric fracture patches. Per `needed-assets.md`: fought hard, maintained only where it matters (hardpoints/turret), abused everywhere else.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

**Surfacing techniques (≥6 — professional-techniques.md):**
1. Layered MixRGB node materials (gunmetal Hull / dark Mechanical / fringe-red Accent)
2. AO geometry bake → `ao` TEX_IMAGE per role (Hull/Mechanical/Accent)
3. Roughness variation — SF_EdgeWear (Pointiness) + SF_CavityDirt + heavy battle wear mask (Fac=0.75–0.82)
4. Trim sheet UV — image-gen `hull_gunship_trim_sheet_1k.jpg` + bump 0.70–0.78
5. Wear mask — image-gen `hull_gunship_wear_mask_1k.jpg` (battle scorch, soot bands, chip zones)
6. Clearcoat 0.18–0.22 gunmetal paint zone on Hull
7. Accent emissive 0.35 on military stencil (fringe-red identity)
8. Smart-project UV on LOD0 + 8 DET meshes

**Story-matched skin pass (GOAL item 6):**
- **Treatment 1 — Battle scarring:** `DET_battle_scar` + wear-mask blotch visible in `iter3_lit_close_scar` — asymmetric combat abuse, not corporate fade
- **Treatment 2 — Exhaust soot band:** `DET_exhaust_soot` + mechanical roughness boost — aft engine abuse read in `iter3_lit_close_soot_fixed`
- **Treatment 3 — Military stencil:** fringe-red `DET_military_stencil` with emissive — faction identity on port flank in `iter1_lit_34`

**Textures folder:** `assets/ships/parts/textures/hull_gunship/`
| File | Story beat |
|---|---|
| `hull_gunship_trim_sheet_1k.jpg` | Industrial panel lines, bolt rows, gunship hard-surface trim |
| `hull_gunship_wear_mask_1k.jpg` | Battle scorch, soot aft, chip paint — green channel → roughness |
| `Material_Hull_ao_1k.png` | Contact shadow depth on gunmetal plates |
| `Material_Mechanical_ao_1k.png` | Turret/hardpoint cavity depth |
| `Material_Accent_ao_1k.png` | Stencil edge grounding |

---

## Before iter0 for hull_gunship (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_hull_gunship_iter0_clay_34/front/side/rear/top/close_hardpoint/close_scar/close_turret`

**MCP observations:**
- Silhouette (4/5): Heavy wedge gunship reads at game scale; full hull visible clay_34.
- Macro/meso/micro (3/5): Eight DET layers present; weapon hardpoint + turret mount add military identity.
- Bevel language (3/5): Base hull beveled; DET meshes need consistent chamfer pre-export.
- Material zones (1/5): Monochrome MCP_CLAY — fails Full Finish Bar.
- Wear/story (1/5): No battle scar, soot, or military stencil narrative in clay.
- Scale truth (5/5): 11.75m bounds correct for heavy weapons platform.
- Lighting readability (5/5): All clay frames full-view analyzable.

**≥6 iter1 improvements:**
1. Full Finish PBR stack (trim + wear + SF_EdgeWear + SF_CavityDirt + AO bake)
2. Three-role materials Hull/Mechanical/Accent with gunmetal + fringe-red
3. Military stencil emissive for faction read
4. Heavy wear Fac=0.75 battle-scar character
5. EEVEE lit HDRI passes (≥5)
6. Apply bevel + WN pre-export

---

## Before iter1 for hull_gunship (MCP post-surfacing 2026-07-06)

**Renders:** `2026-07-06_hull_gunship_iter1_lit_34/front/side/rear/top/close_hardpoint/close_scar/close_turret`

**MCP observations:**
- Silhouette (5/5): Full gunship visible lit_34; red stencil on port flank reads military/fringe.
- Macro/meso/micro (4/5): Hardpoint + turret DET visible; armor plate needs stronger close read.
- Material zones (4/5): Gunmetal hull vs dark mechanical vs red accent — three zones in lit_front.
- Wear/story (3/5): Trim bump visible but battle scar blotch weak at mid distance.
- Lighting readability (5/5): Full-frame lit passes; HDRI workshop grounding.

**≥5 iter2 improvements:**
1. Increase wear Fac to 0.82 for heavier battle-scar character
2. Accent emissive 0.35 on military stencil
3. Add CAM_lit_close_soot for exhaust band verification
4. Mechanical roughness boost for soot zones
5. Rebake AO if cavity read weak on turret collar

---

## Before iter2 for hull_gunship (MCP refinement 2026-07-06)

**Renders:** `2026-07-06_hull_gunship_iter2_lit_34/front/side/top/close_hardpoint/close_scar/close_turret/close_soot`

**MCP observations:**
- Material zones (5/5): Gunmetal + mechanical separation clear in lit_side.
- Wear/story (4/5): close_scar shows asymmetric blotch; battle character improving.
- Lighting readability (2/5): **close_soot FAILED** — frame mostly black, not analyzable (camera too tight on void).
- Scale truth (5/5): Unchanged.

**≥5 iter3 improvements:**
1. Reframe CAM_lit_close_soot to include DET_exhaust_soot + adjacent hull plate
2. Hull clearcoat 0.22 for maintained gunmetal paint read
3. Trim bump 0.78 for panel line depth at mid distance
4. Retake close_soot with fixed camera
5. Final export + finalize verification

---

## Before iter3 for hull_gunship (MCP Full Finish 2026-07-06)

**Renders:** `2026-07-06_hull_gunship_iter3_lit_34/front/side/rear/close_scar/close_soot_fixed`

**MCP observations:**
- Silhouette (5/5): Heavy weapons wedge unchanged; full ship lit_34.
- Macro/meso/micro (5/5): Eight DET meshes readable; hardpoint + turret + scar in close passes.
- Bevel language (4/5): Bevel+WN applied pre-export; consistent chamfer language.
- Material zones (5/5): Gunmetal hull + fringe-red stencil + dark mechanical — not monochrome.
- Wear/story (5/5): Battle scar blotch + exhaust soot band + military stencil = military/fringe character distinct from corvette/fighter.
- Scale truth (5/5): 11.75×3.74×5.5m preserved.
- Lighting readability (5/5): close_soot_fixed shows exhaust band + panel grime — full-view analyzable.

**Export:** spaceface_export.py (tri_budget=15000) → finalize **3288 tris / 914176 B** (2026-07-06 blender_mcp). Materials: Hull/Mechanical/Accent. Images: 5.

**Screenshot count:** 32 distinct MCP viewport renders (8 iter0 clay + 8 iter1 lit + 8 iter2 lit + 6 iter3 lit + 2 close_soot_fixed retakes).

**Full Finish Bar:** SATISFIED (including story-matched skin pass item 6).