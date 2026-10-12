# Graphics bar: per-model and per-part audit, fixes, VFX pass

Branch `look/graphics-bar`, stacked on master after #237 (look unify, merged 2026-10-07). Rendered baseline:
`LOOK_UNIFY.md` pass 3 (286 fleet-look models, 9 outliers, spec 0.95 %, non-glow clip 1.67 %).

## 1. Static per-part audit (every release GLB, every primitive)
Checked by a `@gltf-transform` walk of `assets/ships/release/parts/**`; COLLISION_* meshes are excluded.
- **Normals:** present?
  - *faceted curve*: welded edges at a shallow 4–35° dihedral that still carry split, hard normals. A curved surface shaded as facets,
    against Forge's 30–38° smooth angle.
  - *flipped*: vertex normals that oppose the winding.
- **UVs:** present?
  - *collapsed*: zero-area UV triangles on a textured material.
  - *stretch*: p90/p10 texel-density ratio.
  - texel density per world unit.
- **Material:** missing or placeholder material; flat colour (no base map); emissive factor.
- **Geometry:** degenerate (zero-area) triangles.

Live GLBs: 350; visible primitives: 10095; primitives with at least one defect: 1760.

| defect | primitives |
|---|---|
| degenerate-tris | 930 |
| faceted-curve | 470 |
| flipped-normals | 462 |
| uv-collapsed-textured | 200 |
| uv-stretch | 42 |
| textured-without-uv | 26 |

### Worst 30 models (sum of part defect scores)

| # | model | score | defective parts | defects |
|---|---|---|---|---|
| 1 | places/place_ore_bulk_container.glb | 132.0 | 33 | faceted-curve×33, textured-without-uv×26 |
| 2 | works/place_works_inclusion_kit.glb | 97.0 | 36 | faceted-curve×36, degenerate-tris×24, uv-collapsed-textured×12, uv-stretch×1 |
| 3 | works/place_works_rover.glb | 70.0 | 40 | uv-collapsed-textured×26, faceted-curve×21, degenerate-tris×4 |
| 4 | works/place_works_cargo_port.glb | 62.4 | 26 | uv-collapsed-textured×19, faceted-curve×16, uv-stretch×3, degenerate-tris×3 |
| 5 | places/place_landmark_wreck_cathedral.glb | 38.0 | 12 | degenerate-tris×12, uv-collapsed-textured×7, flipped-normals×5 |
| 6 | places/place_latch_nine.glb | 28.5 | 27 | degenerate-tris×27 |
| 7 | hulls/hull_miner.glb | 26.5 | 11 | faceted-curve×11, uv-collapsed-textured×10, degenerate-tris×2, uv-stretch×1 |
| 8 | hulls/hull_freighter.glb | 25.7 | 11 | faceted-curve×11, uv-collapsed-textured×9, uv-stretch×1, degenerate-tris×1 |
| 9 | hulls/hull_interceptor.glb | 25.6 | 11 | faceted-curve×11, uv-collapsed-textured×10, degenerate-tris×1, uv-stretch×1 |
| 10 | hulls/hull_gunship.glb | 24.5 | 11 | faceted-curve×11, uv-collapsed-textured×9, degenerate-tris×2, uv-stretch×1 |
| 11 | hulls/hull_corvette.glb | 23.9 | 11 | faceted-curve×11, uv-collapsed-textured×9, degenerate-tris×1, uv-stretch×1 |
| 12 | engines/engine_ion_twin.glb | 21.0 | 16 | faceted-curve×8, uv-stretch×5, flipped-normals×4, degenerate-tris×2, uv-collapsed-textured×1 |
| 13 | hulls/hull_capital.glb | 19.9 | 12 | uv-collapsed-textured×11, faceted-curve×3, degenerate-tris×2, uv-stretch×1 |
| 14 | hulls/hull_fighter.glb | 19.1 | 11 | faceted-curve×11, uv-collapsed-textured×9, degenerate-tris×2, uv-stretch×1 |
| 15 | hulls/hull_multirole.glb | 18.0 | 11 | uv-collapsed-textured×9, faceted-curve×3, degenerate-tris×2, uv-stretch×1 |
| 16 | hulls/hull_frigate.glb | 18.0 | 11 | uv-collapsed-textured×9, faceted-curve×3, degenerate-tris×1, uv-stretch×1 |
| 17 | wholeships/helios_cradle.glb | 17.9 | 17 | degenerate-tris×10, flipped-normals×4, faceted-curve×4 |
| 18 | wholeships/helios_cradle_dmc.glb | 17.9 | 17 | degenerate-tris×10, flipped-normals×4, faceted-curve×4 |
| 19 | wholeships/warden_production_v1.glb | 17.3 | 7 | degenerate-tris×7 |
| 20 | places/place_aftermath_wreck_ore_freighter_bow.glb | 16.6 | 41 | flipped-normals×26, degenerate-tris×13, faceted-curve×11 |
| 21 | places/place_aftermath_wreck_ore_freighter_bow__derelict.glb | 16.6 | 41 | flipped-normals×26, degenerate-tris×13, faceted-curve×11 |
| 22 | places/place_aftermath_wreck_ore_freighter_bow__fresh.glb | 16.6 | 41 | flipped-normals×26, degenerate-tris×13, faceted-curve×11 |
| 23 | engines/engine_ion_small.glb | 16.3 | 11 | faceted-curve×7, flipped-normals×3, degenerate-tris×2, uv-stretch×1 |
| 24 | wholeships/salvage_cutter.glb | 16.3 | 13 | degenerate-tris×10, flipped-normals×5 |
| 25 | wholeships/ore_barge.glb | 16.3 | 17 | degenerate-tris×11, faceted-curve×5, flipped-normals×5 |
| 26 | wholeships/drifter_production_v1.glb | 15.8 | 10 | degenerate-tris×10, flipped-normals×1 |
| 27 | works/place_works_fabricator.glb | 15.8 | 9 | uv-collapsed-textured×6, faceted-curve×3 |
| 28 | wholeships/ship_stormshift_collector_v01.glb | 15.1 | 23 | degenerate-tris×19, flipped-normals×8 |
| 29 | wholeships/wasp_mts_escort.glb | 14.5 | 14 | degenerate-tris×13, flipped-normals×3 |
| 30 | wholeships/wasp_free_militia.glb | 14.5 | 14 | degenerate-tris×13, flipped-normals×3 |

### Worst 40 parts

| # | model | mesh / material | tris | defects |
|---|---|---|---|---|
| 1 | hulls/hull_miner.glb | LOD0_HULL_MINER / Material_Hull | 8477 | faceted-curve 0.74, degenerate-tris 1.00 |
| 2 | hulls/hull_miner.glb | LOD0_HULL_MINER.002 / Material_Hull | 256 | faceted-curve 0.94, uv-collapsed-textured 0.32, uv-stretch 1.00 |
| 3 | places/place_landmark_wreck_cathedral.glb | LOD0_MechanicalExposed_Mesh / Material_Mechanical_Exposed | 50932 | uv-collapsed-textured 0.42, degenerate-tris 0.73 |
| 4 | places/place_landmark_wreck_cathedral.glb | LOD0_InteriorExposedAlloy_Mesh / Material_Interior_ExposedAlloy | 57296 | uv-collapsed-textured 0.36, degenerate-tris 0.76 |
| 5 | places/place_landmark_wreck_cathedral.glb | LOD1_MechanicalExposed_Mesh / Material_Mechanical_Exposed | 22836 | flipped-normals 0.10, uv-collapsed-textured 0.36, degenerate-tris 0.76 |
| 6 | wholeships/saucer_production_v1.glb | LOD0_MOTION_HULL_CORE_MechanicalDark / Material_MechanicalDark | 33742 | flipped-normals 0.10, degenerate-tris 1.00 |
| 7 | places/place_landmark_wreck_cathedral.glb | LOD1_InteriorExposedAlloy_Mesh / Material_Interior_ExposedAlloy | 18268 | flipped-normals 0.10, uv-collapsed-textured 0.22, degenerate-tris 0.84 |
| 8 | engines/engine_industrial.glb | engine_industrial_Material_Mechanical_Merged / Material_Mechanical | 6984 | flipped-normals 0.24, uv-stretch 1.00, degenerate-tris 0.02 |
| 9 | hulls/hull_interceptor.glb | LOD0_HULL_INTERCEPTOR / Material_Hull | 2348 | faceted-curve 1.00, uv-collapsed-textured 0.29, degenerate-tris 0.07 |
| 10 | hulls/hull_miner.glb | LOD0_HULL_MINER.001 / Material_Hull | 3394 | faceted-curve 0.96, uv-collapsed-textured 0.20, degenerate-tris 0.12 |
| 11 | places/place_ore_bulk_container.glb | IdPlate.001 / Material_Mechanical | 188 | faceted-curve 0.96, textured-without-uv 1.00 |
| 12 | places/place_ore_bulk_container.glb | WallAft.001 / Material_Hull | 188 | faceted-curve 0.96, textured-without-uv 1.00 |
| 13 | places/place_ore_bulk_container.glb | WallFore.001 / Material_Hull | 188 | faceted-curve 0.96, textured-without-uv 1.00 |
| 14 | places/place_ore_bulk_container.glb | WallPort.001 / Material_Hull | 188 | faceted-curve 0.96, textured-without-uv 1.00 |
| 15 | places/place_ore_bulk_container.glb | WallStar.001 / Material_Hull | 188 | faceted-curve 0.96, textured-without-uv 1.00 |
| 16 | hulls/hull_capital.glb | LOD0_HULL_GUNSHIP.003 / Material_Hull | 2496 | faceted-curve 1.00, uv-collapsed-textured 0.20, degenerate-tris 0.10 |
| 17 | places/place_ore_bulk_container.glb | RibP0.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 18 | places/place_ore_bulk_container.glb | RibP1.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 19 | places/place_ore_bulk_container.glb | RibP2.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 20 | places/place_ore_bulk_container.glb | RibP3.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 21 | places/place_ore_bulk_container.glb | RibP4.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 22 | places/place_ore_bulk_container.glb | RibP5.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 23 | places/place_ore_bulk_container.glb | RibP6.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 24 | places/place_ore_bulk_container.glb | RibS0.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 25 | places/place_ore_bulk_container.glb | RibS1.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 26 | places/place_ore_bulk_container.glb | RibS2.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 27 | places/place_ore_bulk_container.glb | RibS3.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 28 | places/place_ore_bulk_container.glb | RibS4.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 29 | places/place_ore_bulk_container.glb | RibS5.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 30 | places/place_ore_bulk_container.glb | RibS6.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 31 | places/place_ore_bulk_container.glb | RimAft.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 32 | places/place_ore_bulk_container.glb | RimFore.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 33 | places/place_ore_bulk_container.glb | RimPort.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 34 | places/place_ore_bulk_container.glb | RimStar.001 / Material_Mechanical | 188 | faceted-curve 0.92, textured-without-uv 1.00 |
| 35 | places/place_ore_bulk_container.glb | Floor.001 / Material_Mechanical | 188 | faceted-curve 0.89, textured-without-uv 1.00 |
| 36 | places/place_ore_bulk_container.glb | RubPort.001 / Material_MechanicalDark | 188 | faceted-curve 0.81, textured-without-uv 1.00 |
| 37 | places/place_ore_bulk_container.glb | RubStar.001 / Material_MechanicalDark | 188 | faceted-curve 0.81, textured-without-uv 1.00 |
| 38 | engines/engine_ion_small.glb | engine_ion_small_Material_Mechanical_Merged / Material_Mechanical | 12568 | uv-stretch 1.00, degenerate-tris 0.01 |
| 39 | works/place_works_cargo_port.glb | LOD0_crate_0 / Material_Atlas | 1404 | faceted-curve 1.00, uv-collapsed-textured 0.30 |
| 40 | wholeships/wasp_free_militia.glb | LOD0_MechanicalDark / Material_MechanicalDark | 10988 | degenerate-tris 1.00 |

Notes:
- 298 primitives have no material, but all are `COLLISION_*` proxies, which are hidden and not a visual defect.
- No visible part uses an unnamed default material.
- Degenerate triangles: 348k zero-area triangles across 930 primitives. Worst: saucer_production_v1 MechanicalDark has 24.5k of 33.7k
  triangles at zero area, and the wreck cathedral alloy meshes have about 40k. These cost vertex and draw work for nothing.

## 2. VFX inventory (`src/render/vfx.js` pool + `src/render/vfx/*` recipes + `src/render/thruster/*`)
| family | owner | notes / suspected issues (to verify on frames) |
|---|---|---|
| engine trails / thruster plumes | `_emitEngineTrail`, ribbon trails, production thruster family, overflow jets | |
| muzzle flashes | `_onFire`, `_muzzleProfile`, ballistic muzzle exhaust | |
| projectile trails | `PROJECTILE_TRAIL_PROFILES`, `_emitProjectileTrails` | |
| impacts / ricochet / spall | `_onProjectileHit`, `_composeImpact`, `combatContactVfx` | |
| shields | `shieldContacts`, `shieldShell`, pooled shield lane | Previously unverifiable: the harness sent `_onDamage({shieldAbsorbed:true})` against a synthetic `capture-target` id. Shield contacts ride the target entity's shell, so with no entity the frame matches the hull frame. A real shielded target is needed. |
| explosions / destruction | `_onKilled`, `_explode`, causal explosion phases, `bombDetonationVfx`, `fragmentFamilies` | |
| damage smoke / gas | `_emitDamageSmoke`, gas ablation | |
| tether / massline | `_initTetherCable`, massline release arc | |
| mining beam | `_initMiningBeam`, seam markers | |
| combat beams | `_initCombatBeams` | |

(Frames and verdicts: section 4.)

## 3. Model / part fixes (all zero-cost: no new draw calls, no material or texture additions)
One transform, `scripts/lib/glbShadingRepair.mjs`, applied in place by `scripts/repair-release-shading.mjs`
and wired into both release builders (`build-sg04-release-assets`, `build-place-release-assets`) before
meshopt, so a rebuild from source reproduces it. Primitive counts are preserved. Certified Ceres-workfleet
geometry (exact-anatomy contract) and the lossless `place_ceres_second_measure` shell are skipped.

| step | what it fixes | result |
|---|---|---|
| degenerate triangles | zero-area tris (saucer MechanicalDark was 24.5k of 33.7k tris) | 348,290 tris removed, release bytes about -2 % |
| faceted curves | shallow 4–35° edges carrying hard normals: normals rebuilt, area-weighted, 35° crease | 479 prims smoothed. Geology (rock/stone/ice/ore/crystal) stays faceted on purpose. "Ceramic_ore" hull paint and `wreck_ore_freighter_*` are no longer mistaken for geology |
| flipped normals | normals opposing the winding (>2 %) | 482 prims re-oriented |
| collapsed UVs | zero-area UV tris on textured kitbash prims smear one texel across a face (streaked box sides on rover, cargo port, inclusion kit, gas tap, hulls/*, cockpits, fins, weapons) | 20,071 tris re-projected on their dominant axis at the prim's median texel density, anchored at the old UV. Scatter debris over 1,500 tris (wreck cathedral) is left alone |
| no UVs on a textured material | `place_ore_bulk_container` walls, ribs, rims and floor sampled texel (0,0) and read as flat swatches | 26 prims get box UVs at the material's own texel density |
| z-fighting | the same triangle authored twice in two materials (hull under armour/livery/warning/light panel) | 4,456 hidden twin tris dropped across 51 models (wasp frag, volatiles tanker, ironback, survey pin, repair tender, apron shuttle…). The overlay material is kept; a transparent keeper never drops |

Harness fix: the `kestrel_lod1`/`_lod2` "black outlier" in the pass-3 metrics was fleet-look drawing
an empty frame. Split-file LOD siblings carry only LOD1_/LOD2_ names and `fleetLook.blueprintToGroup`
kept lod0 only. It now shoots the finest level the file has. The runtime LOD selector is unchanged, and
the LODs render correctly.

### Static audit, before -> after (visible primitives with a defect)
| defect | before | after |
|---|---|---|
| any defect | 1760 | **160** |
| degenerate-tris | 930 | 3 |
| flipped-normals | 462 | 2 |
| faceted-curve | 470 | 90 (about 33 are intended geology; most of the rest are tiny emissive nav-light spheres) |
| uv-collapsed-textured | 200 | 8 (wreck-cathedral scatter, kept) |
| textured-without-uv | 26 | 0 |
| uv-stretch | 42 | 57 (the 24 new are the ore container's box-UV ribs, mildly stretched where one vertex serves two faces. That still beats a single texel.) |

Coincident cross-material faces (looser centroid+facing audit, `.gb/zfight`): 2,442 in 52 models -> 954 in 46.
The remainder are near-twins with a different triangulation, which a corner-exact fix can't safely pick apart.

Not changed, deliberately:
- **`Material_Accent` emissive trim** on kitbash parts (fins, greebles, weapons, hull accents). This is the parts library's accent-glow convention. Runtime role mapping (#237) governs its intensity.
- **Glass emissive on `cockpit_dome` and `cockpit_recessed`.** Same convention.
- **LOD material drops.** kestrel LOD1/2 drop the ivory panels and ironback LOD2 its brushed metal. The geometry was decimated away rather than merged, so parity would mean adding triangles back to distance LODs. Logged, not fixed.

## 4. VFX pass: capture fix, frames and verdicts
### 4.1 Capture harness (`scripts/capture-combat-vfx-acceptance.mjs`)
The old freeze stepped six pools on `_t` and left `state.simTime` still, so every simTime-driven owner was dead in the
frame (rupture sheets, shells, weapon presenter, contact/bomb receipts, gas). The target was a mesh clone with no entity,
so shield receipts fell through to the hull branch. Both are fixed:
- **Clock.** `__sfFreezeCombatVfx(ms)` now advances `state.simTime` and `_t` together, 1/60 s per step, through the
  production `vfx.update`. Only ambient world emitters are stubbed (other ships' trails, ambient projectiles,
  station/job chatter), and a family frame can opt them back in. The capture target's shell is stepped on the same sim step.
- **Target.** A real passive ship entity (`makeShipEntitySpec` + `spawnEntity`, same hull as the player, shield 200)
  stands at the contract position. `_onDamage` resolves its radius, faction and shield, and the renderer's pooled shield
  lane draws its shell with contacts. Software GL can leave a freshly spawned hull in authored admission for minutes. In
  that case the harness attaches the production `shipKit.createShieldBubble` shell to the live root, so the material and
  lane are the same.
- **Hygiene.** Every presentation owner on the VFX root and the weapon presenter is cleared between frames: rupture,
  arcade structural, contact matter, gas, quarks, scorches, bolts and so on. Each shield frame starts from a cold,
  intact shell. Hull impacts land on the real target.
- **Parity.** On software GL the emergency profile is lifted for evidence frames (full resolution, bloom on), because
  effects are judged at the shipped look. `SF_COMBAT_CAPTURE_CLEAN=1` hides the evidence labels.
- **Family sequence.** `SF_COMBAT_VFX_BAR=1` is a compact sequence: per weapon, muzzle / flight / impact / release /
  shield / hull. Then shield break, small/ordinary/capital explosions, damaged-port smoke, mining beam, tether and
  engine trail. 39 frames.

Before = 76f4d2dc2 (VFX code identical to master) and after = this branch, both with the same harness at 1440x900.
Sheet: `/workspace/look-unify/bar/vfx_before_after.png`. Raw frames: `vfx_before/`, `vfx_after/` alongside it.

### 4.2 Bar and verdicts
The bar: readable silhouette at chase distance, palette tied to weapon/faction, no flat cards or hard alpha edges,
lifetime and falloff that read as cause -> response -> decay, no additive clipping, and coherence with the cleaned-up
hulls (cool teal/ivory hulls, warm fire, faction-tinted shields).

| family | verdict before | change | after |
|---|---|---|---|
| muzzle (5 weapons) | pass: directional, family-coloured | none | unchanged |
| projectile trails | pass: rail dash, plasma wake, missile puff, no bead chains | none | unchanged |
| combat beams | pass now that the clock runs: connected body, clean contact | none | unchanged |
| impacts / spall / scorch | soft, oriented, family-coloured. The hull scorch decal's wobbled radius let char/crack terms reach the quad's edge midpoints at a few % alpha, which is a faint hard-edged card at grazing angles | `contactMarks.js`: every mark kind fades to zero inside its quad (`1-smoothstep(.80,.97,max(abs(d)))`) | no card edge |
| shields | **fail**: one ordinary round (flash ~0.7) charged nearly every panel and saturated `activity`, so the whole dodecahedral cage lit up as a bright football over the hull | `shieldShell.js`: `panelCharge` follows load² and `activity` leans on contact terms, so an ordinary hit lights the contact and nearby welds. Heavy load and rupture (flash > 1) still charge the full lattice | contact reads, hull reads through, cage restrained |
| shield break | pass: tangent tears + flash | none | unchanged |
| explosions (reactor rupture) | **fail**: about 62 % of reactor parcels used a saturated ice-blue ramp peaking at 4.1, so capital/ordinary bursts read as blue crystal shards clashing with the warm combustion family and clipping under bloom | `explosionRupture.js`: the reactor hot ramp is white-gold for most parcels, and the cool minority is a desaturated pale blue (peak 2.35 instead of 4.1) | warm, coherent fireball. Fewer clipped pixels |
| explosion fire / fuel / mineral / armour | pass | none | unchanged |
| gas / missile residue smoke | pass: premultiplied density film, filtered edges | none | unchanged |
| damaged-port venting smoke | not triggered by the harness's injected subsystem table (needs port sockets on an admitted hull). Code audit: quarks venting batch, additive, depthWrite off | none | unverified on frames |
| mining beam | pass: ore-tinted twisted energy ribbon, soft ends | none | unchanged |
| tether / massline | pass: thin cable arc, no clipping | none | unchanged |
| engine trails | pass: blue plume, ribbon wake | none | unchanged |

Perf: no draw call, pass, texture, uniform or particle is added. The three edits change constants and one `smoothstep`
in existing fragment shaders: about 3 ALU ops per scorch fragment, and a cheaper shell where it now discards more
alpha. Overdraw is unchanged; the shield and rupture alpha only go down.

Residuals (logged, not changed):
- A thin dark band sometimes cuts the shell at the target's nose in contact frames. It is not from the scorch, gas or
  distortion owners, and looks like the pending-admission fallback hull's own geometry in front of the shell.
- Shell tint differs between runs on the beam frame (faction accent resolution at attach time).
- The pinned VFX tests pass unchanged: `vfx-shield-shell-and-field-material`, `vfx-radiance-materials`,
  `explosion-rupture`, `impact-event-grammar`, `no-legacy-explosion-bodies`, `vfx-weapon-variation`,
  `combat-vfx-presentation-contract`, `vfx-mach-tracers`, `physics-spectacle-cause-vfx` and the scorch-heat test.

## 5. Rendered before/after (fleet-look, inspect view, SwiftShader; master 38368f739 vs this branch)
Sheets live in `/workspace/look-unify/bar/`:
- `worst_parts_close.png` and `worst_parts_inspect.png`: the 20 worst models, before | after. That's the static top 16 plus gas tap, wasp frag, volatiles tanker and ore barge.
- `all_models.png`: all 280 live models, before | after, most-changed first.
- `vfx_frames.png`: the old acceptance frames. Superseded by `vfx_before_after.png` (section 4).
- `metrics_compare.txt`, `before_m.json`, `after_m.json`: per-model metrics.

```
models compared: 281
L         before 0.2142  after 0.2179
contrast  before 0.1684  after 0.1720
sat       before 0.5328  after 0.5270
detail    before 0.0145  after 0.0150
very dark (L<0.14): 40 -> 38
flat (contrast<0.05): 1 -> 1
most changed (mean |dL| 0-255, d_detail):
  greeble_rcs                                   15.21 +0.0015
  greeble_pipes                                 11.03 +0.0050
  cockpit_slab                                  4.03 +0.0011
  engine_ion_small                              2.83 +0.0002
  place_works_gas_tap                           2.51 +0.0052
  place_ore_bulk_container                      1.43 +0.0032
  place_aftermath_wreck_ore_freighter_hopper    1.21 -0.0001
  place_works_massline_core                     1.11 -0.0003
  place_works_cargo_port                        1.09 +0.0018
  weapon_turret_dual                            1.01 -0.0007
  ore_barge                                     0.99 +0.0011
  warden_production_v1                          0.95 +0.0012
  borrowed_voice_ring                           0.95 +0.0015
  mothlight                                     0.95 +0.0012
  fin_swept_smuggler                            0.94 +0.0006
  sable_patchwork                               0.93 +0.0011
  massline_express_liner_v1                     0.91 +0.0009
  ilex_ark                                      0.91 +0.0009
  place_observation_blister                     0.90 +0.0000
  colossus_production_v1                        0.88 +0.0011
```
The changes are shading-level, so the fleet means move only slightly: mean L 0.214 -> 0.218, contrast 0.168 -> 0.172,
detail 0.0145 -> 0.0150, and very dark models 40 -> 38. The visible wins are local:
- greeble_rcs / greeble_pipes base plates, which had 67 % inverted normals and read as unlit blue, now catch the key light.
- cockpit_slab: the bridge block had inverted normals; its glass and mechanical UVs were collapsed.
- engine_ion_small, gas tap, ore bulk container, cargo port and the hulls/* collapsed-UV faces.
