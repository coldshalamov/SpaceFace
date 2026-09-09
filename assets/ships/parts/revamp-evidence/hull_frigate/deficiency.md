# hull_frigate — Professional Graphics Revamp Deficiency Log

**Story character:** Core authority squadron leader — disciplined wear, cyan-steel corporate military, well-maintained command frigate. Per `needed-assets.md`: authority without capital-dread; cleaner than gunship, more rank than corvette escort.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

**Surfacing techniques (≥6 — professional-techniques.md):**
1. Layered MixRGB node materials (cyan-steel Hull / dark Mechanical / Core accent)
2. AO geometry bake → `ao` TEX_IMAGE per role
3. Roughness variation — SF_EdgeWear + SF_CavityDirt + disciplined wear mask (Fac=0.48–0.55)
4. Trim sheet UV — image-gen `hull_frigate_trim_sheet_1k.jpg` + bump 0.68–0.75
5. Wear mask — image-gen `hull_frigate_wear_mask_1k.jpg` (light dock scuff, not battle abuse)
6. Clearcoat 0.25–0.28 corporate authority paint
7. Accent emissive 0.25 on authority stencil + squadron stripe
8. Smart-project UV on LOD0 + 8 DET meshes

**Story-matched skin pass (GOAL item 6):**
- **Treatment 1 — Squadron cyan stripe:** `DET_squadron_stripe` + accent material — Core authority nav identity in `iter1_lit_34`
- **Treatment 2 — Disciplined dock wear:** light wear Fac=0.55 (not gunship 0.82) — maintained military read
- **Treatment 3 — Authority stencil:** `DET_authority_stencil` + emissive — rank insignia on port flank

**Textures folder:** `assets/ships/parts/textures/hull_frigate/`
| File | Story beat |
|---|---|
| `hull_frigate_trim_sheet_1k.jpg` | Corporate panel lines, authority chevrons, bolt grids |
| `hull_frigate_wear_mask_1k.jpg` | Disciplined dock scuff — green → roughness, not battle scorch |
| `Material_Hull_ao_1k.png` | Bridge super + hull plate cavity depth |
| `Material_Mechanical_ao_1k.png` | Turret collar + engine vent depth |
| `Material_Accent_ao_1k.png` | Stencil/insignia grounding |

---

## Before iter0 for hull_frigate (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_hull_frigate_iter0_clay_34/front/side/rear/top/close_bridge/close_stencil/close_vent`

**MCP observations:**
- Silhouette (3/5): Long command frigate wedge; full hull visible but bare LOD0 only.
- Macro/meso/micro (1/5): No bridge super, squadron stripe, authority stencil (§Meso command detailing).
- Material zones (1/5): Monochrome clay — fails Full Finish Bar.
- Wear/story (1/5): No disciplined-wear or Core authority narrative.
- Scale truth (5/5): 13.0×5.3m bounds correct for squadron leader.
- Lighting readability (5/5): Full-frame clay passes.

**≥6 iter1 improvements:**
1. Eight DET layers (bridge, stripe, stencil, wear, turret, sensor, vent, insignia)
2. Image-gen trim + disciplined wear masks
3. Full Finish PBR stack + AO bake
4. Cyan-steel Hull / accent authority zones
5. EEVEE lit HDRI ≥5 passes
6. Clearcoat corporate authority paint

---

## Before iter1 for hull_frigate (MCP post-DET + surfacing 2026-07-06)

**Renders:** `2026-07-06_hull_frigate_iter1_lit_34/front/side/rear/top/close_bridge/close_stencil/close_vent`

**MCP observations:**
- Silhouette (5/5): Command frigate with bridge super reads at game scale; full ship lit_34.
- Macro/meso/micro (4/5): Eight DET layers add authority identity; sensor mast thin but visible top.
- Material zones (4/5): Cyan-steel hull + cyan accent stripe + dark mechanical vents.
- Wear/story (3/5): Disciplined wear light — correct character but weak at mid distance.
- Lighting readability (5/5): Full-frame lit; HDRI workshop grounding.

**≥5 iter2 improvements:**
1. Accent emissive 0.25 on authority stencil
2. Hull clearcoat 0.28 for corporate maintained read
3. close_bridge verification for command super
4. Reduce edge wear Fac to 0.48 (disciplined vs gunship)
5. Bump 0.75 for trim panel depth

---

## Before iter2 for hull_frigate (MCP refinement 2026-07-06)

**Renders:** `2026-07-06_hull_frigate_iter2_lit_34/front/side/top/close_bridge/close_stencil/close_vent`

**MCP observations:**
- Material zones (5/5): Three-role separation; cyan stripe distinct from gunmetal hull.
- Wear/story (4/5): Lighter wear than gunship — authority maintained character correct.
- Lighting readability (5/5): lit_top shows dorsal bridge + sensor mast at game scale.

---

## Before iter3 for hull_frigate (MCP Full Finish 2026-07-06)

**Renders:** `2026-07-06_hull_frigate_iter3_lit_34/front/side/rear/close_stencil/close_vent`

**MCP observations:**
- Silhouette (5/5): Squadron leader frigate unchanged; full ship lit_34.
- Macro/meso/micro (5/5): All eight DET meshes readable in close passes.
- Bevel language (4/5): Bevel+WN applied pre-export.
- Material zones (5/5): Cyan-steel + accent authority — not monochrome.
- Wear/story (5/5): Disciplined dock wear + squadron stripe + authority stencil = Core leader distinct from gunship/fringe.
- Scale truth (5/5): 13.0m preserved.
- Lighting readability (5/5): 29 MCP viewport renders; all full-view analyzable.

**Export:** spaceface_export.py (tri_budget=15000) → finalize **3300 tris** (2026-07-06 blender_mcp). Materials: Hull/Mechanical/Accent.

**Screenshot count:** 29 distinct MCP viewport renders (8 iter0 clay + 8 iter1 lit + 7 iter2 lit + 6 iter3 lit).

**Full Finish Bar:** SATISFIED (including story-matched skin pass item 6).