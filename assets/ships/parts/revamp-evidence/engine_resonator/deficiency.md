# engine_resonator — Professional Graphics Revamp Deficiency Log

**Story character:** Fringe anomaly drive — violet bleed, nested faceted hoops, phase-shift seams. Per `needed-assets.md`: Anomaly faction; NOT Core patrol (`engine_ion_twin`) or Belt hauler (`engine_industrial`). Reads as unstable fringe tech with oxidized hull and emissive resonance ports.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for engine_resonator (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_engine_resonator_iter0_{clay_34_full,clay_front,clay_side,clay_top,clay_rear,clay_close_facets}.png`, `_iter0_lit_{34_full,front,side,close_facets}.png`

**MCP observations (iter0_clay_34_full — reframed EEVEE camera d=2.8×max_dim, lens=35):**
- Silhouette (5/5): Full nested cylinder + inner blade fins + faceted rear nozzle; anomaly drive scale ~2.6m clear.
- Macro/meso/micro (3/5): Mechanical merged inner fins visible through hull opening; 8 DET slabs present but small at distance.
- Bevel language (3/5): Faceted mechanical mesh; hull cylinder relatively smooth; DET bevel segs=2.
- Material zones (2/5): All clay — no hull/mechanical/accent separation yet.
- Wear/story (1/5): Clean white clay — zero violet bleed or anomaly oxidation.
- Scale truth (5/5): Full module framed after reframing (initial opengl crop failed — EEVEE camera render fix).
- Lighting readability (5/5): iter0_clay_rear shows faceted nozzle termination; iter0_clay_34_full shows full nested form.

**≥5 iter1 targets:** AO bakes per role, engine_resonator_trim/wear JPGs wired, violet emissive accent ≥0.25, dark oxidized hull, mechanical phase-seam wear mask (professional-techniques.md §AO bake per role, §Wear mask roughness, §Trim sheet MULTIPLY).

**Techniques:** §Camera framing law (d=2.8×max_dim for nested hoop), §Clay-then-lit eval.

---

## Before iter1 for engine_resonator (MCP post-surfacing 2026-07-06)

**Renders:** `2026-07-06_engine_resonator_iter1_{lit_34_full,lit_front,lit_side,lit_top,lit_close_vein,lit_close_port,clay_34_full}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full resonator in HDRI frame; violet DET panels on hull flank; top emissive port cylinder visible.
- Macro/meso/micro (4/5): Inner mechanical blade cage reads through intake; violet bleed vein + facet plate DET visible.
- Bevel language (4/5): DET layers consistent bevel; mechanical fins faceted = anomaly unstable aesthetic (not Core disciplined).
- Material zones (4/5): Purple accent DET vs white hull vs dark mechanical — 3 roles in lit_34_full.
- Wear/story (3/5): Violet trim veins on accent; hull still too bright/white — needs darker oxidized anomaly tone.
- Scale truth (5/5): Full module at d≈2.6m.
- Lighting readability (4/5): iter1_lit_close_vein shows violet vein dots on accent slab; port emissive weak.

**≥5 iter2 targets:** Darken hull base (0.07 oxidized), boost accent emissive 0.38, clearcoat 0.12 hull crystal read, scale vein/port DET for meso readability, iter2 close_ring/stencil passes.

---

## Before iter2 for engine_resonator (MCP surfacing tune 2026-07-06)

**Renders:** `2026-07-06_engine_resonator_iter2_{lit_34_full,lit_side,lit_rear,lit_close_facet,lit_close_port,lit_close_ring}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Full anomaly drive; violet panels + top port + inner fin cage in 3/4.
- Macro/meso/micro (4/5): Resonance ring DET at aft; phase seam band on upper hull; crystal fracture slab on flank.
- Bevel language (4/5): Mechanical merged fins + DET bevel language consistent.
- Material zones (4/5): Darker hull + gunmetal mechanical + violet emissive accent — 3 roles distinct.
- Wear/story (4/5): Violet bleed vein enlarged; veil stencil hex pattern on accent; NOT Belt soot or Core cyan.
- Scale truth (5/5): Full module framed.
- Lighting readability (5/5): iter2_lit_close_port shows emissive cylinder; iter2_lit_rear shows faceted nozzle.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Anomaly violet emissive 0.38.

---

## Before iter3 for engine_resonator (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_engine_resonator_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_vein,lit_close_stencil,clay_side}.png` (+ iter0×9, iter1×7, iter2×6 = 29 MCP EEVEE camera renders total)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full nested cylinder + blade fin cage + faceted aft + violet DET panels in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + mechanical merged inner fins; resonance ring + emissive port sell anomaly tech.
- Bevel language (4/5): Faceted mechanical = fringe unstable; hull smooth oxidized cylinder = anomaly housing.
- Material zones (5/5): Oxidized dark hull + gunmetal mechanical + violet emissive accent in lit_34_full.
- Wear/story (5/5): Violet bleed vein + veil stencil + crystal fracture + phase seam = Fringe anomaly drive; contrast engine_industrial Belt and engine_ion_twin Core.
- Scale truth (5/5): Full engine at d≈2.6m.
- Lighting readability (5/5): iter3_lit_close_stencil shows hex veil pattern; iter3_lit_close_vein shows violet vein meso.

**Story fit:** Fringe anomaly drive per `needed-assets.md` — violet bleed (#9b3dff range) and nested hoop resonator sell unstable fringe tech. NOT lawful Core maintenance or Belt refinery soot.

**≥6 surfacing techniques:** engine_resonator_trim_sheet_1k, engine_resonator_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, oxidized hull clearcoat 0.12, accent emissive 0.38.

**Export/finalize:** GLB export → finalize_part.mjs → 15474 tris / 951260 B. HOOK_DRIVE retained (tangent warn non-fatal). Textures: `assets/ships/parts/textures/engine_resonator/`.

**PASS — Full Finish verified 2026-07-06.**