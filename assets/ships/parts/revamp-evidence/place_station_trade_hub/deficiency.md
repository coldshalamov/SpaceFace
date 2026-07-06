# place_station_trade_hub — Professional Graphics Revamp Deficiency Log

**Story character:** Meridian gold trade hub — tiered ring + tower commerce station, lying billboard signage, ostentatious accent trim. Per vibe-CANONICAL: corporate polish over industrial grit; ads that lie.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for place_station_trade_hub (MCP viewport audit 2026-07-06)

**Renders (render_viewport_to_path):** `2026-07-06_place_station_trade_hub_iter0_clay_front.png`, `_iter0_clay_34.png` (reframed), early close crops rejected (HDRI room dominated frame / too tight)

**MCP observations:**
- Silhouette (3/5): Deck slab + tower + torus ring reads at profile distance; ring face-on dominates bad angles (professional-techniques.md §Camera framing law).
- Macro/meso/micro (2/5): Only 3 greebles + 2 windows; no Meridian signage, dock collar, or gold band.
- Bevel language (2/5): Primitive cubes/torus; no consistent segs=2 on hub joints.
- Material zones (2/5): Clay-only audit; accent windows exist but no gold trim zone.
- Wear/story (1/5): No lying billboard / corporate Meridian character.
- Scale truth (4/5): 28×28×23m bounds correct for P0 station landmark.
- Lighting readability (2/5): HDRI workshop bleed + underexposed clay; fixed via neutral world + KEY/RIM boost.

**≥5 iter1 improvements:**
1. DET_gold_trim_band Meridian accent at tower crown
2. DET_signage_meridian + DET_lie_billboard (graffiti-as-narrator inverse: corporate lies)
3. DET_dock_collar at deck edge for ship interface
4. DET_antenna_mast + DET_cargo_rib meso industrial
5. Remove template hull LOD bleed (HULL_MULTIROLE_ROOT)
6. AO/rough ORM nodes per Material_Hull/Mechanical/Accent
7. artist_workshop HDRI lit eval with full-frame cameras

**Techniques:** §Material zones, §Decals separate meshes, §Geo bevel segs=2, §HDRI+rim eval (Ryan King), §Blockout-before-detail.

---

## Before iter1 for place_station_trade_hub (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_place_station_trade_hub_iter1_clay_front/side/34.png`, `_iter1_lit_front/34/close.png` (+ iter0 profile/wide reframes)

**MCP observations:**
- Silhouette (4/5): Front profile shows deck+tower+ring arch; gold trim band adds Meridian crown read.
- Macro/meso/micro (4/5): Six DET_ layers (dock collar, billboard, signage, antenna, cargo rib, gold band) atop existing Hub_* greebles.
- Bevel language (4/5): DET bevel segs=2 applied pre-export; hub primitives retain WN stack.
- Material zones (4/5): Lit_front shows gold accent trim vs dark hull vs mechanical antenna/dock.
- Wear/story (4/5): Lie billboard + Meridian signage sell corporate trade fiction.
- Scale truth (5/5): Full station visible in clay_front/lit_front after camera dist=1.35×max_dim.
- Lighting readability (4/5): 12 MCP viewport renders; neutral clay + HDRI lit passes analyzable.

**Remaining iter2 targets:** BP-08 faction ring redesign (concentric tiers), glass emissive windows, per-mesh unique AO bakes.

**Export:** spaceface_export.py → finalize 6284 tris / 539268 B (2026-07-06 blender_mcp).

**Screenshot count:** 12 distinct MCP viewport renders (2026-07-06).

---

## Before iter2 for place_station_trade_hub (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_place_station_trade_hub_iter2_{lit_34,lit_front,lit_side,lit_close,lit_close_dock,clay_34}.png`

**MCP observations:**
- Silhouette (2/5): iter2 lit_34/front are ring-wall close-ups — deck+tower+ring NOT visible (professional-techniques.md §Camera framing law; cross-call MCP viewport desync).
- Macro/meso/micro (4/5): Close dock shows CORPSEC collar + yellow hazard trim; trim sheet veins readable on hull panels.
- Bevel language (4/5): DET bevel segs=2; hub WN stack intact.
- Material zones (4/5): Hull gunmetal + mechanical antenna + gold accent trim band starting to separate in lit_side.
- Wear/story (3/5): Trim/wear masks applied but billboard/signage unreadable at failed full-frame angles.
- Scale truth (2/5): Close crops cannot verify 28m landmark scale.
- Lighting readability (3/5): HDRI workshop + KEY/FILL; full station underexposed in tight ring face-on views.

**≥5 iter3 improvements:** per-role AO bakes to `textures/place_station_trade_hub/`, SF_EdgeWear+SF_CavityDirt stack, image-gen trim/wear sheets, emissive window accent, DET_deck_traffic_wear, atomic viewport orbit render (d≥3×max_dim).

**Techniques:** §Trim sheet MULTIPLY, §Wear mask albedo/roughness, §AO bake per role, §HDRI+area KEY/FILL (Ryan King).

---

## Before iter3 for place_station_trade_hub (MCP surfacing applied 2026-07-06)

**Renders:** `2026-07-06_place_station_trade_hub_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_dock,lit_close_signage,clay_34,lit_top}.png` (+ iter3_lit_34_full_v2 reframed-fail)

**MCP observations:**
- Silhouette (2/5): iter3 full_v2 still panel close-up — `render_viewport_to_path` does not inherit separate-call viewport orbit (documented MCP desync).
- Macro/meso/micro (5/5): Close_dock: dock collar + deck traffic wear streak + hazard stripes; close_signage: Meridian gold band + lie billboard face.
- Bevel language (4/5): Consistent DET bevel; ring torus smooth read.
- Material zones (5/5): Lit_close shows Hull/Mechanical/Accent separation with trim veins + gold crown band.
- Wear/story (5/5): Lie billboard + Meridian signage sell corporate trade fiction; deck traffic wear = lived-in commerce lane.
- Scale truth (2/5): Full landmark scale still unverified in iter3 full attempts.
- Lighting readability (4/5): Surfacing readable in close passes; HDRI bloom on gold accent.

**≥5 iter4 improvements:** atomic `bpy.ops.render.opengl` via `temp_override` after orbit sync (d≈200m, lens 12); full lit/clay turntable; export with baked AO textures; finalize + manifest PRO Full Finish note.

---

## Before iter4 for place_station_trade_hub (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_place_station_trade_hub_iter4_{lit_34_full,lit_front_full,lit_side,lit_top,clay_34_full,clay_front,lit_close_dock,lit_close_signage}.png` (+ iter0×7, iter1×7, iter2×6, iter3×7, 2026-07-05×3; iter2/iter3 cross-call full-frame fails documented)

**MCP observations (iter4_lit_34_full):**
- Silhouette (5/5): Full tiered station visible — deck slab + tower + torus ring arch + antenna mast; landmark readable at game scale in HDRI 3/4 profile (orbit d≈205m, lens 12mm).
- Macro/meso/micro (4/5): Gold trim crown, ring greebles, dock collar, billboard/signage zones identifiable; deck traffic wear at commerce edge.
- Bevel language (4/5): DET segs=2 on collar/billboard/ribs; hub primitives retain WN stack.
- Material zones (5/5): Gunmetal hull + mechanical antenna/dock + Meridian gold accent + emissive windows — 3+ roles in single lit_34 frame.
- Wear/story (5/5): Corporate polish over industrial grit — ostentatious gold trim, lying billboard, Meridian signage, deck traffic wear lane. Matches vibe-CANONICAL Meridian trade fiction.
- Scale truth (5/5): 28×23m bounds confirmed in full frame with HDRI human-scale context.
- Lighting readability (5/5): artist_workshop HDRI + KEY 2200 / FILL 900 / RIM 1100; trim veins + gold band catch rim.

**Story fit:** Meridian gold trade hub — tiered ring commerce station, ads that lie, corporate accent over worn deck lanes. Faction: Meridian corporate / neutral trade pillar.

**≥6 surfacing techniques:** place_station_trade_hub_trim_sheet_1k, place_station_trade_hub_wear_mask_1k, SF_EdgeWear, SF_CavityDirt, AO bake (Material_Hull/Mechanical/Accent_ao_1k.png), clearcoat hull, emissive accent windows.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 6392 tris / 2050056 B. Textures: `assets/ships/parts/textures/place_station_trade_hub/`.

**Screenshot audit:** 38 MCP viewport renders total; 30 analyzable (iter4×8 full/close pass, iter1×7, iter0×7, iter3 close×4, 2026-07-05×3); iter2×6 + iter3×3 full-frame fails = cross-call MCP desync (fixed iter4 via atomic opengl).

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (Meridian gold trim + lie billboard + deck traffic wear + CORPSEC dock), deficiency iter0–iter4.