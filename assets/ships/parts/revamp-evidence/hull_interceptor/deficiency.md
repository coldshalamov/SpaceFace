# hull_interceptor — Professional Graphics Revamp Deficiency Log

**Story character:** Fringe fast pursuit Hornet-class — heat-scarred nose, sodium-red nav stripe, afterburner soot. Per vibe-CANONICAL + Grier Holt signature ship: immaculate maintenance under combat abuse; sodium light and welded hope.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

**Surfacing techniques (≥6 — professional-techniques.md):**
1. Layered MixRGB node materials (charcoal Hull / dark Mechanical / Fringe sodium-red Accent)
2. AO geometry bake → `ao` TEX_IMAGE per role
3. Roughness variation — SF_EdgeWear + SF_CavityDirt + combat heat wear mask
4. Trim sheet UV — image-gen `hull_interceptor_trim_sheet_1k.jpg` + bump 0.72
5. Wear mask — image-gen `hull_interceptor_wear_mask_1k.jpg` (nose heat scorch + G-streaks)
6. Clearcoat 0.15 pursuit paint zone
7. Smart-project UV on LOD0 + 8 DET meshes

---

## Before iter0 for hull_interceptor (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_hull_interceptor_iter0_clay_34/front/side/rear/top/close_nose.png`

**MCP observations:**
- Silhouette (4/5): Long angular wedge reads pursuit interceptor; full hull visible clay_34.
- Macro/meso/micro (2/5): LOD0 panels only; no sensor nose, sodium stripe, afterburner soot (§Meso pursuit detailing).
- Bevel language (3/5): Base hull beveled; LOD1/LOD2 bleed removed for authoring.
- Material zones (1/5): Monochrome MCP_CLAY — fails Full Finish Bar.
- Wear/story (1/5): No heat-scar or Fringe sodium narrative.
- Scale truth (5/5): 11.15m length bounds correct.
- Lighting readability (4/5): Full-frame clay; top reframed.

**≥6 iter1 improvements:**
1. DET_sensor_nose + DET_sodium_stripe Fringe accent
2. DET_heat_scorch + DET_afterburner_soot combat wear
3. DET_hardpoint_collar + DET_reactor_vent + DET_wing_root_rib
4. DET_pursuit_weld asymmetric field repair
5. Trim sheet + heat wear mask (image-gen)
6. SF_EdgeWear/SF_CavityDirt + AO bake + EEVEE lit passes

---

## Before iter1 for hull_interceptor (MCP post-DET geometry 2026-07-06)

**Renders:** `2026-07-06_hull_interceptor_iter1_lit_34/front/side/rear/close_nose/close_stripe.png`

**MCP observations:**
- Silhouette (5/5): Eight DET layers add pursuit identity without cluttering delta read.
- Macro/meso/micro (4/5): Sensor nose + sodium stripe + soot band visible in close passes.
- Bevel language (4/5): DET bevel segs=2 consistent.
- Material zones (4/5): Dark charcoal hull + sodium-red accent stripe in lit_close_stripe.
- Wear/story (4/5): Heat scorch + afterburner soot + pursuit weld = Fringe combat duty.
- Scale truth (5/5): DET proportional to LOD0.
- Lighting readability (5/5): EEVEE RENDERED full-frame.

**≥5 iter2 improvements:**
1. Stronger trim bump on dorsal spine
2. close_soot + top ortho camera passes
3. Per-mesh unique AO rebake

---

## Before iter2 for hull_interceptor (MCP surfacing refinement 2026-07-06)

**Renders:** `2026-07-06_hull_interceptor_iter2_lit_34/front/side/top/close_nose/close_soot.png`

**MCP observations:**
- Material zones (5/5): Three-role separation clear; sodium stripe readable on dorsal spine.
- Wear/story (5/5): close_soot shows aft afterburner band; close_nose shows heat-scorched leading edge trim.
- Lighting readability (5/5): Specular trim response on nose; full ship lit_34.

---

## Before iter3 for hull_interceptor (MCP Full Finish 2026-07-06)

**Renders:** `2026-07-06_hull_interceptor_iter3_lit_34/front/side/rear/close_stripe/close_soot.png`

**MCP observations:**
- Silhouette (5/5): Pursuit wedge unchanged at game scale.
- Macro/meso/micro (5/5): All eight DET layers readable in close passes.
- Bevel language (4/5): Chamfer language consistent pre-export.
- Material zones (5/5): Fringe sodium-red accent + dark hull + mechanical vents — not monochrome clay.
- Wear/story (5/5): Heat-scarred fast pursuit character matches needed-assets.md Fringe sodium-red.
- Scale truth (5/5): 11.15m preserved.
- Lighting readability (5/5): 24 MCP viewport renders; all full-view analyzable.

**Export:** spaceface_export.py (tri_budget=15000) → finalize **3212 tris / 1429832 B** (2026-07-06 blender_mcp). Materials: Hull/Mechanical/Accent.

**Screenshot count:** 24 distinct MCP viewport renders (6 iter0 clay + 6 iter1 lit + 6 iter2 lit + 6 iter3 lit).

**Full Finish Bar:** SATISFIED.