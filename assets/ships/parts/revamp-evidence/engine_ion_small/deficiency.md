# engine_ion_small — Professional Graphics Revamp Deficiency Log

**Story character:** Pit rugged starter ion drive — patched reactor "fine for 3 owners" (Wren's repossessed tug lineage). Field-weld patch plate, owner-count stencil, soot vent band, jury-rig bolts/cable tie, heat discolor ring. Per vibe-CANONICAL: Pit survivor register — jury-rigged, not corporate polish.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for engine_ion_small (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_engine_ion_small_iter0_{clay_34_full,clay_front,clay_side,clay_top}.png`, `_iter0_lit_{34_full,front,side,close_nozzle}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (5/5): Full ion cylinder + layered nozzle rings + top mount bar + white rear cap readable at d≈2.8m; starter engine identity clear.
- Macro/meso/micro (3/5): Segmented ring bands present; no patch plate, owner stencil, or soot storytelling.
- Bevel language (3/5): Ring stacks faceted; hull panel grid reads but lacks field-repair meso.
- Material zones (3/5): Hull/mechanical/accent slots exist; lit pass shows brown panels vs dark rings vs white cap.
- Wear/story (1/5): Clean panels — no "3 owners" Pit character, no soot or jury-rig.
- Scale truth (5/5): 2.57×2.12×2.12m bounds correct for P0 starter engine.
- Lighting readability (3/5): iter0_clay_34 (pre-fix) too tight — reframed to iter0_clay_34_full at dist_mul=1.08.

**≥5 iter1 improvements:** DET_patch_plate, DET_owner_stencil, DET_soot_vent_band, DET_jury_bolt pair, DET_heat_discolor, DET_cable_tie (professional-techniques.md §Decals separate meshes, §Meso panel insets).

**Techniques:** §Camera framing law (d=1.05×max_dim engines), §Clay-then-lit eval, §Blockout-before-detail.

---

## Before iter1 for engine_ion_small (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_engine_ion_small_iter1_{clay_34_full,clay_front,lit_34_full,lit_front,lit_close_patch,lit_close_nozzle}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (5/5): Full engine + 7 DET layers visible; patch plate on hull flank, soot band at nozzle.
- Macro/meso/micro (4/5): Field-weld patch, owner stencil slab, heat discolor ring, cable tie on mount bar.
- Bevel language (4/5): DET bevel segs=2 on patch/bolts/cable; ring stacks unchanged (acceptable).
- Material zones (3/5): Accent stencil + mechanical rings + hull body; trim/wear not yet wired.
- Wear/story (3/5): Geometry sells Pit jury-rig; needs rust-brown trim sheet + soot wear mask.
- Scale truth (5/5): Full engine in HDRI frame.
- Lighting readability (4/5): HDRI workshop + KEY 850; close_patch shows copper trim edge starting.

**≥5 iter2 targets:** engine_ion_small_trim/wear JPGs, per-role AO bakes, rust-brown hull surfacing, wear→roughness wiring, EEVEE lit multi-angle pass.

---

## Before iter2 for engine_ion_small (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_engine_ion_small_iter2_{clay_34_full,lit_34_full,lit_side,lit_top,lit_close_stencil,lit_close_soot}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (5/5): Full patched ion drive in HDRI; dark soot-speckled hull + silver ring bands + white rear cap.
- Macro/meso/micro (4/5): Trim sheet panel grid on hull; wear mask soot band darkens nozzle region in lit_top.
- Bevel language (4/5): DET layers consistent bevel language with export contract.
- Material zones (4/5): Hull rust-brown + mechanical gunmetal + accent amber stencil in lit_close_stencil.
- Wear/story (4/5): Soot vent band + patch plate + owner stencil block read Pit "fine for 3 owners" beat.
- Scale truth (5/5): Full module framed.
- Lighting readability (5/5): Rust-amber RIM 580 + KEY 900; iter2_lit_close_soot shows nozzle soot accumulation.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role (Hull/Mechanical/Accent_ao_1k.png), §Blender 5 Mix RGBA sockets.

---

## Before iter3 for engine_ion_small (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_engine_ion_small_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_nozzle,lit_close_patch,lit_close_cable,clay_side}.png` (+ iter0×8, iter1×6, iter2×6, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full starter ion cylinder + ring stack + mount bar + DET patch/stencil/cable in HDRI 3/4.
- Macro/meso/micro (4/5): 7 DET layers + segmented rings + panel grid; cable tie on mount reads jury-rig.
- Bevel language (4/5): DET bevel segs=2; ring octagonal facets intentional Pit rugged read.
- Material zones (5/5): Hull + mechanical + accent — 3 roles in one lit_34_full pass.
- Wear/story (5/5): Rust-brown hull + soot nozzle band + patch plate + owner stencil = Pit 3-owner survivor fiction; NOT Core clean (contrast engine_ion_twin).
- Scale truth (5/5): Full engine at d≈2.8m.
- Lighting readability (5/5): artist_workshop HDRI + area KEY/FILL/RIM; iter3_lit_close_patch shows copper trim + speckled wear at meso scale.

**Story fit:** Pit rugged starter — patched reactor surviving three owners. Jury bolts, cable tie, soot vent band sell Wren tug lineage per `needed-assets.md`.

**≥6 surfacing techniques:** engine_ion_small_trim_sheet_1k, engine_ion_small_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness wiring, rust-brown hull base, accent emissive stencil 0.15.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 13564 tris / 821340 B. HOOK_DRIVE_* mesh placeholders removed (finalize drive-surface advisory non-fatal). Textures: `assets/ships/parts/textures/engine_ion_small/`.

**Screenshot audit:** 32 MCP viewport renders total; 29 analyzable full/close (iter0×8, iter1×6, iter2×6, iter3×7, 2026-07-05×3); iter0_clay_34 (non-full) superseded by clay_34_full.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (owner stencil + patch plate + soot band + cable tie), deficiency iter0–iter3.