# hull_freighter — Professional Graphics Revamp Deficiency Log

**Story character:** Belt cargo runner — manifest lies, dock-scrape wear, soot-stained aft, belt-amber accent stripe. Per vibe-CANONICAL: bulky utilitarian hauler; paperwork fiction vs cargo truth; lived-in frontier industrial.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

**Surfacing techniques applied (≥6 exterior realism — professional-techniques.md):**
1. **Layered node materials** — Hull/Mechanical/Accent Principled stacks with MixRGB albedo layering (not flat color)
2. **AO geometry bake** — Cycles AO bake → `ao` TEX_IMAGE nodes per role, multiplied into base color
3. **Roughness variation** — SF_EdgeWear (Pointiness) + SF_CavityDirt (AO invert) + wear-mask green channel driving Roughness
4. **Trim sheet UV exterior** — Image-gen `hull_freighter_trim_sheet_1k.jpg` smart-project UV mapped with bump normal response
5. **Wear/story mask plate** — Image-gen `hull_freighter_wear_mask_1k.jpg` multiplies albedo + roughness (dock soot, edge chips)
6. **Clearcoat paint zone** — Material_Hull coat weight 0.12 for maintained-but-worn paint read under HDRI
7. **Multi-zone material assignment** — DET meshes split across Hull/Mechanical/Accent roles visible in lit passes

---

## Before iter0 for hull_freighter (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_hull_freighter_iter0_clay_34/front/side/rear/top/close_cargo.png`

**MCP observations:**
- Silhouette (4/5): Long wedge + raised superstructure reads Belt freighter at game scale; full hull visible clay_34.
- Macro/meso/micro (2/5): LOD0 panels only; no cargo bay rim, manifest stencil, container latches (§Meso cargo detailing).
- Bevel language (3/5): Hull bevels present; no DET bevel stacks at dock/scrape zones.
- Material zones (1/5): Monochrome MCP_CLAY — **fails Full Finish Bar** (no surfacing).
- Wear/story (1/5): No manifest-lies stencil, dock scrape, or soot narrative.
- Scale truth (5/5): 11.35×4.24m bounds correct for Belt runner.
- Lighting readability (4/5): Clay full-frame; top view initially too distant (reframed iter1).

**≥6 iter1 improvements (geometry + surfacing):**
1. DET_cargo_bay_rim + DET_container_latch cargo interface
2. DET_manifest_stencil + DET_dock_scrape (manifest lies fiction)
3. DET_rust_stripe belt-amber + DET_exhaust_soot aft band
4. DET_superstructure_rib + DET_field_weld asymmetric repair
5. UV smart-project + trim sheet + wear mask (image-gen textures)
6. SF_EdgeWear + SF_CavityDirt node groups + AO bake + clearcoat
7. ≥5 lit EEVEE RENDERED viewport passes (HDRI artist_workshop)

**Techniques:** §Material zones, §Decals separate meshes, §Geo bevel segs=2 + WN, §Trim sheets, §Curvature wear, §AO bake.

---

## Before iter1 for hull_freighter (MCP post-DET geometry 2026-07-06)

**Renders:** `2026-07-06_hull_freighter_iter1_clay_34/front/side/rear/top/close_cargo.png`

**MCP observations:**
- Silhouette (5/5): Eight DET layers add cargo-runner identity without breaking top-down wedge read.
- Macro/meso/micro (4/5): Cargo rim + manifest stencil + container latch visible in close_cargo.
- Bevel language (4/5): DET cubes bevel segs=2 pre-export.
- Material zones (1/5): Still clay-only — surfacing pass not yet applied (**blocked on Full Finish Bar**).
- Wear/story (3/5): Geometry implies wear zones; no shader/mask proof yet.
- Scale truth (5/5): DET proportional to LOD0.
- Lighting readability (5/5): Full-frame clay after top reframe.

**≥6 iter2 surfacing improvements:**
1. Apply trim sheet + wear mask on UV exterior
2. Build SF_EdgeWear + SF_CavityDirt node groups
3. AO bake per role; roughness linked (not uniform scalar)
4. EEVEE RENDERED lit passes — prove non-monochrome PBR
5. Bump from trim affecting specular response in close_cargo

---

## Before iter2 for hull_freighter (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_hull_freighter_iter2_lit_34/front/side/close_cargo/close_manifest/close_stripe.png`

**MCP observations:**
- Material zones (3/5): Accent stripe + mechanical deck tint emerging; hull still reads too white in MATERIAL viewport (not RENDERED).
- Wear/story (3/5): DET soot band + manifest plate geometry visible; trim/wear masks too subtle at distance.
- Lighting readability (4/5): HDRI workshop background; full ship in lit_34.

**≥5 iter3 improvements:**
1. Switch viewport to EEVEE RENDERED shading
2. Increase trim/wear MixRGB Fac to 0.92
3. Darken hull base albedo for panel contrast
4. Bump strength 0.7 for trim panel lines in close passes

---

## Before iter3 for hull_freighter (MCP EEVEE RENDERED surfacing 2026-07-06)

**Renders:** `2026-07-06_hull_freighter_iter3_lit_34/front/close_cargo/close_manifest/close_stripe.png`

**MCP observations:**
- Silhouette (5/5): Freighter wedge unchanged; black mechanical deck + amber stripe sell Belt runner.
- Macro/meso/micro (4/5): close_cargo shows cargo latch + rim; close_manifest shows stencil plate; close_stripe shows belt accent.
- Bevel language (4/5): Chamfered DET + LOD0 consistent.
- Material zones (5/5): Three-role separation clear in RENDERED lit — dark mechanical, warm hull paint, amber accent stripe.
- Wear/story (4/5): Soot aft band + dock scrape + manifest stencil = manifest-lies Belt character; trim bump visible in specular on close_cargo.
- Scale truth (5/5): 11.35m length preserved.
- Lighting readability (5/5): EEVEE specular + HDRI rim; full-view analyzable.

**Remaining (Life pass — not blocking geometry/surfacing export):**
1. Per-mesh unique 1024 AO rebake (currently shared hull bake)
2. Stronger trim texel on dorsal spine (increase mapping scale locally)
3. Runtime emissive on nav fixtures (Life pass)

**Export:** spaceface_export.py (tri_budget=15000) → finalize 3248 tris / 1781788 B (2026-07-06 blender_mcp). Materials: Material_Hull, Material_Mechanical, Material_Accent. Images: 2 baked.

**Screenshot count:** 23 distinct MCP viewport renders (6 iter0 clay + 6 iter1 clay + 5 iter2 lit + 5 iter3 lit + 1 prior iter0 clay_34).

**Full Finish Bar:** Surfacing pass SATISFIED (≥6 techniques + ≥5 lit). Life pass partial.