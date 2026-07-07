# cockpit_slab — Professional Graphics Revamp Deficiency Log

**Story character:** Belt hauler blunt forward view — scratched laminate windshield, rust-amber industrial hull, muted glass (NOT Core interrogation-bright). Per `needed-assets.md`: hauler workhorse cockpit slab; belt dust-cake, wiper scars, manifest stencil, dock scuff wear.

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for cockpit_slab (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_cockpit_slab_iter0_{clay_34,clay_front,clay_side,clay_top,clay_close}.png`, `_iter0_lit_{34,front,side,close_glass}.png`

**MCP observations (iter0_clay_34):**
- Silhouette (4/5): Full blunt slab + bridge block + vent slots readable at d≈4.1m; hauler forward-view identity clear.
- Macro/meso/micro (2/5): Smooth brow block; no laminate scratch, belt stencil, or panel seams.
- Bevel language (3/5): Bridge block has soft edge; glass lacks wiper-scar meso.
- Material zones (2/5): Clay-only; dark brow vs light glass vs mechanical grille zones exist but untextured.
- Wear/story (1/5): No belt rust-amber, no scratched laminate, no industrial hauler character.
- Scale truth (5/5): 4.86×3.70×1.86m bounds correct for P0 cockpit module.
- Lighting readability (4/5): iter0_lit_34 shows HDRI workshop + material separation starting.

**≥5 iter1 improvements:** DET_laminate_scratch, DET_belt_stencil, DET_wiper_scar, DET_panel_seam L/R, DET_rust_streak, DET_mount_bolt pair, DET_vent_grille_detail (professional-techniques.md §Decals separate meshes, §Meso panel insets).

**Techniques:** §Blockout-before-detail, §Camera framing law (d=0.85×max_dim ships), §Clay-then-lit eval.

---

## Before iter1 for cockpit_slab (MCP post-layer 2026-07-06)

**Renders:** `2026-07-06_cockpit_slab_iter1_{clay_34,clay_front,lit_34,lit_front,lit_close_glass,lit_close_stencil}.png`

**MCP observations (iter1_lit_34):**
- Silhouette (5/5): Full blunt slab + armored brow + bridge grille in HDRI frame; 9 DET layers visible.
- Macro/meso/micro (4/5): Laminate scratch plane, belt stencil, wiper scar, panel seams, rust streak, mount bolts, vent grille.
- Bevel language (4/5): DET cubes bevel segs=2; brow block still dominates silhouette (acceptable hauler read).
- Material zones (3/5): Dark brow vs teal glass vs mechanical slots in lit_34; trim/wear not yet wired.
- Wear/story (3/5): Rust streak DET started; belt stencil geometry present but no amber accent material yet.
- Scale truth (5/5): Full asset in frame at d≈4.1m.
- Lighting readability (4/5): HDRI + KEY/FILL; iter1_lit_close_stencil too dark (documented fail — retaken iter3).

**≥5 iter2 targets:** trim/wear image-gen sheets, AO bakes per role, rust-amber hull base, wear→roughness wiring, Material_Accent for belt stencil.

---

## Before iter2 for cockpit_slab (MCP surfacing pass 2026-07-06)

**Renders:** `2026-07-06_cockpit_slab_iter2_{clay_34,lit_34,lit_front,lit_side,lit_top,lit_close_rust}.png`

**MCP observations (iter2_lit_34):**
- Silhouette (5/5): Full blunt hauler slab after hiding unrelated scene objects (engine_resonator/HULL roots polluted bbox).
- Macro/meso/micro (4/5): Trim sheet MULTIPLY on hull brow; wear mask visible in specular breakup on top face.
- Bevel language (4/5): Consistent DET bevel segs=2 across seams/bolts.
- Material zones (4/5): Hull rust-amber + mechanical gunmetal + muted glass (low emissive 0.04 vs dome 0.15).
- Wear/story (4/5): Belt orange grid lines on brow from trim sheet; rust streak DET reads amber in close_rust.
- Scale truth (5/5): Full module in frame.
- Lighting readability (4/5): Prior iter2 black-void fail (CYCLES bake left broken Mix nodes) — fixed by EEVEE rebuild + atomic opengl renders.

**Techniques:** §Trim sheet MULTIPLY, §Wear mask roughness, §AO bake per role (Hull/Mechanical/Glass_ao_1k.png), §Blender 5 Mix RGBA sockets A/B/Result.

---

## Before iter3 for cockpit_slab (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_cockpit_slab_iter3_{lit_34_full,lit_front_full,lit_side,lit_close_glass,lit_close_brow,lit_close_stencil,clay_side}.png` (+ iter0×9, iter1×6, iter2×6, 2026-07-05×3)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full blunt hauler slab + bridge block + vent slots + dock scuff DET in HDRI 3/4; belt industrial identity dominates.
- Macro/meso/micro (4/5): 10 DET layers (laminate scratch, belt stencil amber, wiper scar, panel seams, rust streak, bolts, grille, dock scuff).
- Bevel language (4/5): DET bevel segs=2 on collar/stencil/bolts/scuff; glass lip still smooth (acceptable laminate).
- Material zones (5/5): Hull brow + mechanical grille + accent stencil + muted glass — 4 roles in lit_34_full.
- Wear/story (5/5): Trim/wear sheets on hull; rust-amber belt stencil + dock scuff + scratched laminate = hauler lived-in; NOT interrogation-bright (contrast with cockpit_dome).
- Scale truth (5/5): Full cockpit module in frame at d≈4.1m.
- Lighting readability (5/5): artist_workshop HDRI + KEY 950 / FILL 480 / RIM 650 rust-amber rim sells belt industrial tone.

**Story fit:** Belt hauler blunt forward view — scratched laminate, rust-amber industrial, muted glass. Per vibe-CANONICAL: Belt = rust-amber industrial; contrast with Core `cockpit_dome` interrogation glass.

**≥6 surfacing techniques:** cockpit_slab_trim_sheet_1k, cockpit_slab_wear_mask_1k, AO bake (Hull/Mechanical/Glass_ao_1k.png), wear→roughness wiring, rust-amber hull base + clearcoat 0.12, muted glass emissive 0.04, Material_Accent belt stencil.

**Export/finalize:** spaceface_export.py → finalize_part.mjs → 2644 tris / 699892 B. Textures: `assets/ships/parts/textures/cockpit_slab/`.

**Screenshot audit:** 31 MCP viewport renders total; 28 analyzable full/close (iter0×9, iter1×5 full + 1 dark close documented, iter2×6, iter3×7, 2026-07-05×3); iter2/3 early black-void fails fixed by EEVEE shader rebuild + scene isolation.

**Full Finish Bar:** PASS — ≥6 surfacing, ≥5 lit PBR, skin pass (belt stencil + rust streak + laminate scratch + dock scuff), deficiency iter0–iter3.

---

## Elite iter4 uplift for cockpit_slab (Phase 2 MCP 2026-07-06)

**Renders:** `2026-07-06_cockpit_slab_iter4_lit_34.png`, `_iter4_lit_front.png`, `_iter4_lit_close_glass.png`, `_iter4_lit_close_stencil.png`, `_iter4_lit_close_rust.png`

**≥10 surfacing techniques applied:**
1. 2K trim sheet UV bump (`cockpit_slab_trim_sheet_2k.jpg`)
2. 2K wear mask roughness (`cockpit_slab_wear_mask_2k.jpg`)
3. Belt stencil roughness story map (`cockpit_slab_belt_stencil_roughness_story_2k.jpg`)
4. SF_EdgeWear curvature edge lighten on hull brow
5. SF_CavityDirt cavity grime on DET_cavity_grime_vent
6. Cycles AO bake per role (Hull/Accent/Mechanical/Glass)
7. Micro-scratch mask plate (DET_micro_scratch_plate)
8. Panel line emphasis trim orientation per UV island
9. Secondary wear on rust streak + dock scuff zones
10. Anisotropy/clearcoat rust-amber belt industrial hull
11. Muted glass emissive (not interrogation-bright)
12. Localized decal alpha on faction stripe port

**DET layers (14):** DET_belt_stencil, DET_cavity_grime_vent, DET_dock_scuff, DET_faction_stripe_port, DET_laminate_scratch, DET_micro_scratch_plate, DET_mount_bolt, DET_mount_bolt_port, DET_panel_line_emphasis, DET_panel_seam_L, DET_panel_seam_R, DET_rust_streak, DET_vent_grille_detail, DET_wiper_scar

**Export/finalize:** **3076 tris / 741536 B** · `PRO Elite Finish 2026-07-06`