# cockpit_recessed — Professional Graphics Revamp Deficiency Log

**Story character:** Paranoid Pit survivor stealth cockpit — low-profile recessed canopy, armor brow, Quiet faction stencil, sensor slits. Per vibe-CANONICAL: low-signature smuggler cache aesthetic, graffiti-as-narrator.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for cockpit_recessed (MCP viewport audit 2026-07-06)

**Renders (render_viewport_to_path):** `2026-07-06_cockpit_recessed_iter0_clay_34.png`, `_iter0_clay_front/top/side.png`, `_iter0_close_canopy.png`

**MCP observations:**
- Silhouette (4/5): Recessed wedge + dorsal spine reads low-profile at game scale; full cockpit visible all 5 angles (HDRI artist_workshop eval setup).
- Macro/meso/micro (2/5): Recessed_Sensor_Slit present; lacks armor brow, mount collar, dash panel meso (professional-techniques.md §Meso panel insets).
- Bevel language (3/5): Merged hull/mechanical stacks; sensor slits sharp.
- Material zones (3/5): Hull/Accent/Mechanical merged meshes exist; no stencil accent zone.
- Wear/story (1/5): Clean clay — no Quiet stencil, no paranoid armor character.
- Scale truth (4/5): REF_human_1p8m wire box validates cockpit height vs 1.8m pilot (Ryan King scale reference technique).
- Lighting readability (4/5): Viewport MCP renders full-frame with studio+HDRI; cyan slits readable.

**≥5 iter1 improvements:**
1. DET_armor_brow over canopy recess (Pit paranoid plating)
2. DET_sensor_cluster port flank
3. DET_mount_collar at hull interface
4. DET_stencil_quiet accent decal (graffiti-as-narrator)
5. DET_dash_panel interior meso
6. AO_Bake + noise roughness on all materials
7. artist_workshop HDRI lit eval passes

**Techniques:** §Bevel segs=2, §Material zones, §Decals separate meshes, Ryan King HDRI+rim eval.

---

## Before iter1 for cockpit_recessed (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_cockpit_recessed_iter1_clay_34/front/top.png`, `_iter1_lit_34/front/side/close.png`

**MCP observations:**
- Silhouette (5/5): Armor brow + mount collar add paranoid low-profile identity without breaking top-down read.
- Macro/meso/micro (4/5): 5 DET_ layers at canopy/mount/sensor joints; sensor slit cluster retained.
- Bevel language (4/5): Brow and collar segs=2 bevels consistent with export contract.
- Material zones (4/5): Stencil accent + mechanical sensor/brow + hull dash separation visible in lit passes.
- Wear/story (4/5): Quiet stencil + armor brow sell smuggler/Pit stealth character.
- Scale truth (4/5): Human ref used in iter0; removed before export.
- Lighting readability (5/5): Lit HDRI passes show accent cyan vs dark mechanical; close_canopy shows recess depth.

**Export:** spaceface_export.py → finalize 1668 tris / 303772 B (2026-07-06 blender_mcp).

**Techniques:** §AO/Cavity masks, §Node layering, §Weighted Normal last, §Texture-paint target for future hand dirt.

---

## Before iter2 for cockpit_recessed (MCP Full Finish surfacing audit 2026-07-06)

**Renders:** `2026-07-06_cockpit_recessed_iter2_lit_34/front/side/top/close_canopy/close_stencil.png`, `_iter2_clay_34.png`

**MCP observations:**
- Silhouette (N/A): iter2 studio-dark world + distant auto-framed cameras produced black void frames — asset not visible for rubric scoring (professional-techniques.md §Ryan King lighting-before-materials violated).
- Macro/meso/micro (N/A): Surfacing stack applied (trim/wear/SF_EdgeWear/AO) but renders unusable for analysis.
- Material zones (N/A): Dark studio bg Strength=0.15 underexposed dark stealth hull.
- Wear/story (N/A): Cannot verify Quiet stencil or canopy wear in failed frames.
- Lighting readability (1/5): iter2_lit_front shows faint panel lines only in bottom strip; iter2_lit_34/close_* fail full-view bar.

**Story fit:** Pit/Quiet stealth requires readable dark hull with cyan sensor slits — not achievable in black-frame renders.

**≥6 surfacing techniques applied (code, pending lit verify):** trim_sheet, wear_mask, SF_EdgeWear, SF_CavityDirt, AO bake (Hull/Mech/Accent), clearcoat hull, emissive glass slits.

**≥5 iter3 improvements:** restore artist_workshop HDRI + KEY/FILL, track-to CAM_TARGET bbox framing (d=0.55×max_dim), DET_canopy_wear_streak + DET_mount_bolt layers, glass ao_bake nodes, reframe close_stencil to mesh center.

**Techniques:** §HDRI eval (Ryan King), §Node layering, §AO/Cavity masks, §Decals separate meshes.

---

## Before iter3 for cockpit_recessed (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_cockpit_recessed_iter3_lit_34.png`, `_iter3_lit_front/side/top.png`, `_iter3_lit_close_canopy.png`, `_iter3_clay_34.png` (+ iter0×5, iter1×7, iter2×7 reframed-fail, 2026-07-05×3)

**MCP observations (iter3_lit_34):**
- Silhouette (5/5): Full recessed cockpit visible — armor brow, dash panel, mount collar, sensor slit field readable at game scale in HDRI 3/4 profile.
- Macro/meso/micro (4/5): Trim sheet panel lines on hull deck; DET armor brow + sensor cluster + mount collar; cyan emissive slits in recess floor.
- Bevel language (4/5): Brow/collar DET segs=2 consistent; canopy lip wear streak adds meso edge read.
- Material zones (5/5): Dark stealth hull paint (Material_Hull.002), mechanical gray brow/collar/dash, cyan glass slits, accent stencil zone — 3+ roles in single lit_34 frame.
- Wear/story (4/5): Trim rust/wear mask darkens hull deck; canopy wear streak accent; Quiet faction stencil on armor brow (subtle teal accent in lit_34 brow zone); mount bolt at collar contact. Pit paranoid survivor character complete.
- Scale truth (5/5): Full asset in frame with HDRI scale context; close_canopy shows recess depth + scratch wear on dash without losing hull context.
- Lighting readability (5/5): HDRI artist_workshop + KEY 900 / FILL 350; trim panels catch rim on hull deck; sensor slits emissive readable.

**Story fit:** Paranoid Pit/Quiet smuggler stealth — low-profile recessed canopy, dark matte hull, cyan sensor slits (not Core corporate), subtle Quiet stencil accent, field-wear at mount collar. Graffiti-as-narrator per vibe-CANONICAL.

**≥6 surfacing techniques:** cockpit_recessed_trim_sheet_1k, cockpit_recessed_wear_mask_1k, SF_EdgeWear, SF_CavityDirt, AO bake (Material_Hull/Mechanical/Accent_ao_1k.png), clearcoat hull, emissive glass sensor slits.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 1884 tris / 1596312 B. Textures: `assets/ships/parts/textures/cockpit_recessed/`.

**Screenshot audit:** 31 MCP renders total; 22 analyzable full-view (iter0×5, iter1×7, iter3×8, 2026-07-05×3); iter2×7 documented camera-fail; stencil close v2/v3 overexposed — Quiet stencil reads in lit_34 brow zone instead.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (stealth dark hull + Quiet stencil + canopy wear streak + sensor slit emissive), deficiency iter0–iter3.