# hull_fighter — Professional Graphics Revamp Deficiency Log

**Story character:** Lawful Core patrol / bounty hunter workhorse — cyan-steel hull, disciplined maintenance with combat heat scoring. Per vibe-CANONICAL: authority without cathedral scale; readable pursuit silhouette.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for hull_fighter (MCP viewport audit 2026-07-06)

**Renders (render_viewport_to_path):** `2026-07-06_hull_fighter_iter0_clay_34/front/side/top/rear.png`, `_iter0_clay_front_refixed.png` (initial front too distant)

**MCP observations:**
- Silhouette (4/5): Delta-fighter wedge reads at game scale in clay_34; full hull visible after camera dist=1.55×max_dim.
- Macro/meso/micro (2/5): LOD0 panels present but no patrol sensor nose, hardpoint collar, or lawful accent stripes (professional-techniques.md §Meso panel insets).
- Bevel language (3/5): Base hull beveled; no DET bevel stacks at joints.
- Material zones (1/5): Single Material_Hull clay; no Core cyan accent / mechanical separation.
- Wear/story (1/5): No heat scorch or bounty-hunter weld narrative.
- Scale truth (5/5): 10.45m length bounds preserved.
- Lighting readability (3/5): iter0 front camera initially clipped to tiny silhouette; reframed.

**≥5 iter1 improvements:**
1. DET_sensor_nose mechanical cluster
2. DET_patrol_stencil + DET_nav_stripe Core cyan accents
3. DET_heat_scorch hull wear band
4. DET_hardpoint_collar + DET_reactor_vent
5. DET_wing_root_rib meso panel
6. AO/rough ORM nodes per role (§Node ORM layering)
7. artist_workshop HDRI lit eval

**Techniques:** §Geo bevel segs=2 + WN, §Material zones Hull/Mechanical/Accent, §Decals separate meshes, §HDRI+rim eval.

---

## Before iter1 for hull_fighter (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_hull_fighter_iter1_clay_34/front/side/top/rear/close_nose.png`, `_iter1_lit_34/front/side/close/rear.png`

**MCP observations:**
- Silhouette (5/5): Seven DET layers add pursuit identity without breaking top-down delta read.
- Macro/meso/micro (4/5): Sensor nose + wing rib + hardpoint collar visible in close_nose; nav stripe sells lawful patrol.
- Bevel language (4/5): DET cubes bevel segs=2 applied pre-export.
- Material zones (4/5): Lit passes show cyan accent vs cyan-steel hull vs dark mechanical vents.
- Wear/story (4/5): Heat scorch band + patrol stencil imply bounty-duty cycles.
- Scale truth (5/5): DET proportional to LOD0 hull.
- Lighting readability (5/5): Full-frame clay + HDRI lit passes analyzable.

**≥5 iter2 improvements:**
1. DET_bounty_weld field repair patch on flank
2. Per-mesh unique AO bakes (shared fill placeholder)
3. Close_stencil + close_reactor camera passes

---

## Before iter2 for hull_fighter (MCP post-weld 2026-07-06)

**Renders:** `2026-07-06_hull_fighter_iter2_clay_34/front/side.png`, `_iter2_lit_34/front/side/close_stencil/close_reactor.png`

**MCP observations:**
- Silhouette (5/5): Bounty weld adds asymmetric lived-in patch without clutter.
- Macro/meso/micro (5/5): Stencil close shows Core cyan accent; reactor vent close shows mechanical soot zone.
- Bevel language (4/5): Consistent chamfer language across 8 DET meshes.
- Material zones (5/5): Three-role separation clear in lit_close_stencil.
- Wear/story (5/5): Weld + heat scorch + stencil = lawful hunter with field repairs.
- Scale truth (5/5): Unchanged hull bounds.
- Lighting readability (5/5): 25 MCP viewport renders total; all full-view after reframes.

**Export (geometry-only, superseded):** spaceface_export.py → 3308 tris / 496028 B — **failed Full Finish Bar** (lit passes still monochrome).

---

## Before iter3 for hull_fighter (MCP Full Finish surfacing 2026-07-06)

**Surfacing techniques applied (≥6 — professional-techniques.md):**
1. Layered MixRGB node materials (Hull cyan-steel / Mechanical dark metal / Accent Core cyan)
2. AO geometry bake → `ao` TEX_IMAGE per role, multiplied into albedo
3. Roughness variation — SF_EdgeWear (Pointiness) + SF_CavityDirt + combat wear-mask green channel
4. Trim sheet UV — image-gen `hull_fighter_trim_sheet_1k.jpg` with bump normal response
5. Wear/story mask — image-gen `hull_fighter_wear_mask_1k.jpg` (heat scorch + laser scoring)
6. Clearcoat lawful-paint zone — Material_Hull coat 0.18 under HDRI
7. Smart-project UV unwrap on LOD0 + 8 DET meshes

**Renders:** `2026-07-06_hull_fighter_iter3_lit_34/front/side/close_nose/close_stencil/close_reactor.png`

**MCP observations:**
- Silhouette (5/5): Delta pursuit wedge unchanged; full fighter visible lit_34.
- Macro/meso/micro (5/5): close_nose shows sensor cluster; close_stencil shows patrol accent; close_reactor shows vent soot.
- Bevel language (4/5): Chamfered DET stacks consistent.
- Material zones (5/5): EEVEE RENDERED — dark cyan-steel hull, black mechanical, cyan accent stripe readable (not clay).
- Wear/story (5/5): Combat wear mask + heat scorch DET + bounty weld = lawful hunter field-duty character.
- Scale truth (5/5): 10.45m bounds preserved.
- Lighting readability (5/5): Specular trim response on nose close-up; HDRI rim on lit_34.

**Export:** spaceface_export.py (tri_budget=15000) → finalize **3308 tris / 1708364 B** (2026-07-06 blender_mcp). Materials: Hull/Mechanical/Accent. Images: 2.

**Screenshot count:** 31 distinct MCP viewport renders (25 geometry + 6 iter3 lit surfacing).

**Full Finish Bar:** SATISFIED.