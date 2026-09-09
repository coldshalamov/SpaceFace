# engine_ion_twin — Professional Graphics Revamp Deficiency Log

**Story character:** Core lawful patrol twin-drive — maintenance marks, cyan nav stripes, inspection stencils, disciplined dock scuff (NOT Pit jury-rig). Per vibe-CANONICAL: Core cyan-steel corporate clean-fading; contrast with Pit `engine_ion_small`.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for engine_ion_twin (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_engine_ion_twin_iter0_{clay_34_full,clay_front,clay_side,clay_top}.png`, `_iter0_lit_{34_full,front,side,close_nozzle}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (5/5): Full twin nacelle + dual ring nozzles + central bridge readable at d≈4.3m; patrol twin-drive identity clear.
- Macro/meso/micro (3/5): Segmented ring stacks + hull chevron; no inspection stencil, cyan stripe, or sync bridge.
- Bevel language (3/5): Ring octagonal facets intentional; lacks maintenance tick meso.
- Material zones (3/5): Hull/mechanical split in lit; grid checker overlay on hull (pre-surfacing).
- Wear/story (1/5): Clean clay — no Core maintenance marks or disciplined dock scuff.
- Scale truth (5/5): 3.74×3.02×1.89m bounds correct for P0 twin engine.
- Lighting readability (3/5): `render_viewport_to_path` desync on first clay attempt (close crop) — fixed by atomic opengl at dist_mul=1.15.

**≥5 iter1 improvements:** DET_cyan_nav_stripe, DET_inspection_stencil, DET_maintenance_tick, DET_torque_witness pair, DET_sync_ring_bridge, DET_dock_collar_scuff, DET_panel_respray_edge (professional-techniques.md §Decals separate meshes, §Trim sheet MULTIPLY).

**Techniques:** §Camera framing law (d=1.15×max_dim twin assemblies), §Clay-then-lit eval.

---

## Before iter1 for engine_ion_twin (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_engine_ion_twin_iter1_{clay_34_full,clay_front,lit_34_full,lit_front,lit_close_nozzle,lit_close_stencil}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full twin module + 8 DET layers; sync bridge between ring nozzles visible.
- Macro/meso/micro (4/5): Cyan nav stripe slab, inspection stencil, torque witness bolts, dock collar scuff.
- Bevel language (4/5): DET bevel segs=2 on stripe/stencil/bridge.
- Material zones (3/5): Accent DET geometry present; trim/wear sheets not yet wired.
- Wear/story (3/5): Core maintenance tick + stencil sell lawful patrol; needs cyan-steel surfacing.
- Scale truth (5/5): Full twin engine in HDRI frame.
- Lighting readability (4/5): HDRI + cyan RIM 550; iter1_lit_close_stencil shows accent slab.

**≥5 iter2 targets:** engine_ion_twin_trim/wear JPGs, per-role AO bakes, cyan-steel hull + emissive accent 0.18, wear→roughness wiring, clearcoat 0.15 hull.

---

## Before iter2 for engine_ion_twin (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_engine_ion_twin_iter2_{clay_34_full,lit_34_full,lit_side,lit_top,lit_close_sync,lit_close_stripe}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Full twin patrol drive; cyan trim bands on hull from trim sheet MULTIPLY.
- Macro/meso/micro (4/5): Sync ring bridge + dock collar scuff wear mask darkens nozzle region in lit_top.
- Bevel language (4/5): Ring stacks + DET layers consistent bevel language.
- Material zones (4/5): Cyan-steel hull + gunmetal rings + emissive accent stripe in lit_close_stripe.
- Wear/story (4/5): Disciplined dock scuff bands (top/bottom wear mask) = Core maintenance fiction vs Pit patchwork.
- Scale truth (5/5): Full module framed.
- Lighting readability (5/5): iter2_lit_close_sync shows bridge between dual ring nozzles.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Clearcoat corporate hull.

---

## Before iter3 for engine_ion_twin (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_engine_ion_twin_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_nozzle,lit_close_stencil,lit_close_sync,clay_side}.png` (+ iter0×8, iter1×6, iter2×6, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full twin nacelle + dual black ring nozzles + cyan stripe + sync bridge in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + segmented rings + panel respray edge; torque witness bolts at nozzle collars.
- Bevel language (4/5): DET bevel segs=2; ring octagonal facets read Core disciplined (not Pit crude).
- Material zones (5/5): Hull cyan-steel + mechanical gunmetal + accent cyan — 3 roles in lit_34_full.
- Wear/story (5/5): Inspection stencil + maintenance tick + dock scuff = lawful patrol maintenance marks; NOT Pit 3-owner patch (contrast engine_ion_small).
- Scale truth (5/5): Full twin engine at d≈4.3m.
- Lighting readability (5/5): artist_workshop HDRI + KEY 900 / cyan RIM 550; iter3_lit_close_nozzle shows ring stack depth.

**Story fit:** Core patrol twin-drive — corporate clean-fading with maintenance accountability. Cyan nav stripe + inspection stencil sell lawful authority per `needed-assets.md`.

**≥6 surfacing techniques:** engine_ion_twin_trim_sheet_1k, engine_ion_twin_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, cyan-steel hull + clearcoat 0.15, accent emissive 0.18.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 5664 tris / 459984 B. Twin HOOK P/S drive advisory non-fatal (expected for twin-drive). Textures: `assets/ships/parts/textures/engine_ion_twin/`.

**Screenshot audit:** 30 MCP viewport renders total; 27 analyzable full/close (iter0×8, iter1×6, iter2×6, iter3×7, 2026-07-05×3); render_viewport_to_path desync documented + atomic opengl retake.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (cyan stripe + inspection stencil + maintenance tick + sync bridge), deficiency iter0–iter3.