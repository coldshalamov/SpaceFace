# engine_industrial — Professional Graphics Revamp Deficiency Log

**Story character:** Belt refinery hauler drive — soot vents, ore dust-cake, rust bloom, amber hazard stripes. Per vibe-CANONICAL: Belt = rust-amber industrial; contrast with Core `engine_ion_twin` clean maintenance.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for engine_industrial (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_engine_industrial_iter0_{clay_34_full,clay_front,clay_side,clay_top}.png`, `_iter0_lit_{34_full,front,side,close_nozzle}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (5/5): Full industrial cylinder + fin cage + top housing + spiral nozzle cap at d≈3.8m; refinery hauler scale clear.
- Macro/meso/micro (3/5): Segmented fin cage ribs + top box; no soot vent stacks, ore dust, or hazard stripe.
- Bevel language (3/5): Cage bars faceted; lacks exhaust scorch meso at nozzle lip.
- Material zones (3/5): Hull/mechanical split; lit shows grid checker on hull (pre-surfacing).
- Wear/story (1/5): Clean clay — no Belt soot/refinery character.
- Scale truth (5/5): 3.41×3.52×2.87m bounds correct for P0 industrial engine.
- Lighting readability (5/5): Full module framed at dist_mul=1.12; atomic opengl pass.

**≥5 iter1 improvements:** DET_soot_vent_stack, DET_rust_bloom_flank, DET_ore_dust_cake, DET_refinery_stencil, DET_exhaust_scorch_band, DET_pipe_coupling, DET_belt_hazard_stripe, DET_cinder_spatter (professional-techniques.md §Decals separate meshes, §Wear mask roughness).

**Techniques:** §Camera framing law (d=1.12×max_dim large industrial), §Clay-then-lit eval.

---

## Before iter1 for engine_industrial (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_engine_industrial_iter1_{clay_34_full,clay_front,lit_34_full,lit_front,lit_close_nozzle,lit_close_stencil}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full hauler drive + 8 DET layers; fin cage + top housing + hazard stripe slab visible.
- Macro/meso/micro (4/5): Soot vent stack on top housing, pipe coupling under flank, scorch band at nozzle.
- Bevel language (4/5): DET bevel segs=2 on stripe/stencil/pipe.
- Material zones (3/5): Accent DET geometry; trim/wear not wired yet.
- Wear/story (3/5): Refinery stencil + hazard stripe geometry sell Belt industrial; needs rust-brown surfacing.
- Scale truth (5/5): Full engine in HDRI frame.
- Lighting readability (4/5): Rust-amber RIM 600; iter1_lit_close_stencil shows accent slab.

**≥5 iter2 targets:** engine_industrial_trim/wear JPGs, per-role AO bakes, rust-brown hull surfacing, soot wear mask on vents, wear→roughness wiring.

---

## Before iter2 for engine_industrial (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_engine_industrial_iter2_{clay_34_full,lit_34_full,lit_side,lit_top,lit_close_soot,lit_close_hazard}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Full refinery drive; rust-brown trim panel grid on hull; dark mechanical fin cage bands.
- Macro/meso/micro (4/5): Soot vent stack reads darker in lit_close_soot; ore dust cake on hull flank.
- Bevel language (4/5): Cage + DET layers consistent bevel language.
- Material zones (4/5): Rust-brown hull + gunmetal cage + amber hazard stripe in lit_close_hazard.
- Wear/story (4/5): Soot bands (top/bottom wear mask) + cinder spatter = Belt refinery hauler fiction.
- Scale truth (5/5): Full module framed.
- Lighting readability (5/5): iter2_lit_top shows soot accumulation on top housing.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role, §Belt hazard stripe emissive 0.1.

---

## Before iter3 for engine_industrial (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_engine_industrial_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_nozzle,lit_close_soot,lit_close_pipe,clay_side}.png` (+ iter0×8, iter1×6, iter2×6, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full industrial cylinder + fin cage + top box + spiral nozzle + 5 dark band clamps in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET layers + pipe coupling + rust bloom + cinder spatter; fin cage reads refinery scale.
- Bevel language (4/5): DET bevel segs=2; cage octagonal facets = Belt heavy industrial (not Core disciplined).
- Material zones (5/5): Rust-brown hull + gunmetal mechanical + amber accent — 3 roles in lit_34_full.
- Wear/story (5/5): Soot vent stack + ore dust cake + refinery stencil + hazard stripe = Belt refinery hauler; NOT Core patrol (contrast engine_ion_twin).
- Scale truth (5/5): Full engine at d≈3.8m.
- Lighting readability (5/5): artist_workshop HDRI + KEY 900 / rust RIM 600; iter3_lit_close_pipe shows external coupling under flank.

**Story fit:** Belt refinery hauler — soot vents and ore dust-cake sell bulk ore transport per `needed-assets.md`. Amber hazard stripe reads Belt faction accent (#ffb35c).

**≥6 surfacing techniques:** engine_industrial_trim_sheet_1k, engine_industrial_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, rust-brown hull, accent emissive hazard 0.1.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 23308 tris / 1009464 B. HOOK_DRIVE retained (drive nodes OK). Mechanical tangent warning non-fatal. Textures: `assets/ships/parts/textures/engine_industrial/`.

**Screenshot audit:** 30 MCP viewport renders total; 27 analyzable full/close (iter0×8, iter1×6, iter2×6, iter3×7, 2026-07-05×3).

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (soot vent + ore dust + refinery stencil + hazard stripe), deficiency iter0–iter3.