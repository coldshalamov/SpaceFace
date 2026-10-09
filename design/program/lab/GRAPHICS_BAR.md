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
| shields | `weapons/shieldContacts.js` (`addShieldContact`) | |
| explosions / destruction | `_onKilled`, `_explode`, causal explosion phases, `bombDetonationVfx`, `fragmentFamilies` | |
| damage smoke / gas | `_emitDamageSmoke`, gas ablation | |
| tether / massline | `_initTetherCable`, massline release arc | |
| mining beam | `_initMiningBeam`, seam markers | |
| combat beams | `_initCombatBeams` | |

(Frames and verdicts follow in section 4.)
