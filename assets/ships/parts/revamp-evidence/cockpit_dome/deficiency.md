# cockpit_dome — Professional Graphics Revamp Deficiency Log

**Story character:** Core corporate bubble canopy — interrogation-bright glass, older corporate clean-fading laminate. Per vibe-CANONICAL: fully-lit Core stations feel like interrogation rooms; cyan-steel accent arch, scratched glass, collar bolts.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for cockpit_dome (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_cockpit_dome_iter0_{clay_34,clay_front,clay_side,clay_top,clay_close}.png`, `_iter0_lit_{34,front,side,close_glass}.png`

**MCP observations (iter0_clay_34):**
- Silhouette (4/5): Full teardrop dome + teal arch + mount collar readable at d≈3.9m; game-scale cockpit part identifiable.
- Macro/meso/micro (2/5): Smooth blob dome; no panel ribs, collar seams, or Core stencil.
- Bevel language (3/5): Collar block has edge bevel; dome glass lacks lip chamfer read.
- Material zones (2/5): Clay-only; teal arch vs dark glass vs white collar zones exist but untextured.
- Wear/story (1/5): No interrogation-bright glass, no scratched laminate, no Core corporate character.
- Scale truth (5/5): 4.6×3.26m bounds correct for P0 cockpit module.
- Lighting readability (3/5): iter0_lit shows dark glass; lacks interrogation overexposure story beat.

**≥5 iter1 improvements:** DET_frame_rib L/R, DET_core_stencil, DET_collar_seam, DET_glass_scratch, DET_mount_bolt pair, emissive glass boost (professional-techniques.md §Emissive glass, §Decals separate meshes).

**Techniques:** §Blockout-before-detail, §Camera framing law (d=0.85×max_dim ships), §Clay-then-lit eval.

---

## Before iter1 for cockpit_dome (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_cockpit_dome_iter1_{clay_34,clay_front,lit_34,lit_front,lit_close_glass,lit_close_collar}.png`

**MCP observations (iter1_lit_34):**
- Silhouette (5/5): Full dome + arch + platform in HDRI frame; DET ribs and stencil visible on surface.
- Macro/meso/micro (4/5): Seven DET layers add collar seam, frame ribs, mount bolts, glass scratch plane.
- Bevel language (4/5): DET cubes bevel segs=2; arch still dominates silhouette.
- Material zones (4/5): Bright emissive glass vs teal accent arch vs dark collar in lit_34.
- Wear/story (3/5): Glass brightens (interrogation read started) but trim/wear masks not yet wired.
- Scale truth (5/5): Full asset in frame.
- Lighting readability (4/5): HDRI + KEY/FILL; square specular on glass sells corporate polish.

**≥5 iter2 targets:** trim/wear image-gen sheets, SF_EdgeWear+SF_CavityDirt, per-role AO bakes, clearcoat hull collar, disable viewport overlays for export renders.

---

## Before iter2 for cockpit_dome (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_cockpit_dome_iter2_{lit_34,lit_front,lit_side,lit_top,clay_34,lit_close_glass}.png` (iter2_lit_34 overlay fail — orange wireframe; retaken iter3)

**MCP observations:**
- Silhouette (2/5): iter2 surfacing pass triggered viewport overlay/wireframe — full PBR not analyzable (documented fail).
- Material zones (4/5): Close glass pass pre-overlay showed trim veins starting.
- **iter2 fix:** Blender 5 Mix node socket migration + `show_overlays=False` before lit passes.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role (Ryan King ORM contract).

---

## Before iter3 for cockpit_dome (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_cockpit_dome_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_glass,lit_close_collar,lit_close_stencil,clay_side}.png` (+ iter0×9, iter1×6, iter2×6, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full corporate bubble dome + dark arch frame + mount collar in HDRI 3/4; interrogation-bright white glass dome dominates (story beat).
- Macro/meso/micro (4/5): Frame ribs, collar seam, mount bolts, core stencil, glass scratch DET readable in close passes.
- Bevel language (4/5): DET bevel segs=2 on collar/stencil/bolts; dome lip still smooth (acceptable for glass).
- Material zones (5/5): Hull collar + mechanical arch/ribs + accent stencil + emissive glass — 4 roles in lit_34_full.
- Wear/story (4/5): Trim/wear sheets on collar; interrogation-bright glass + Core cyan arch = corporate clean-fading; scratched glass DET for laminate story.
- Scale truth (5/5): Full cockpit module in frame at d≈3.9m.
- Lighting readability (5/5): artist_workshop HDRI + area KEY 900; square specular highlight on glass sells interrogation overexposure.

**Story fit:** Core corporate bubble — too-bright glass reads as interrogation room per vibe-CANONICAL §Voice (fully-lit Core = sensory friction). Not Pit stealth (contrast with cockpit_recessed).

**≥6 surfacing techniques:** cockpit_dome_trim_sheet_1k, cockpit_dome_wear_mask_1k, SF_EdgeWear, SF_CavityDirt, AO bake (Hull/Mechanical/Accent/Glass_ao_1k.png), clearcoat hull, emissive interrogation glass.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 3214 tris / 288048 B. Textures: `assets/ships/parts/textures/cockpit_dome/`.

**Screenshot audit:** 31 MCP viewport renders total; 27 analyzable full/close (iter0×9, iter1×6, iter3×7, 2026-07-05×3); iter2×6 includes overlay-fail documented + iter3 retake.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (interrogation glass + Core stencil + collar seam + scratch laminate), deficiency iter0–iter3.