<!-- LIFETIME: ACTIVE_CANDIDATE -->
# Cost model — PQ-045.wreck-dressing

Declared before / with the Ceres wreck-dressing promote. Figures from
`evidence/author-down-report.json` and the finalized place sources.

## Raw selected pack (seven ledger assets)

| Metric | Value |
|---|---|
| Source meshes (draw-ish primitives) | **185** |
| Source triangles (all LOD0-only) | **3,092** |
| Textures / images | **0** |
| LODs | **none** |
| Instancing | **none** |

## Authored-down per asset (source meshes → merged LOD0 objects)

| Asset | Source meshes | Merged LOD0 objects | Tris LOD0 / 1 / 2 | Materials used |
|---|---:|---:|---|---|
| `wreck_ore_freighter_hopper` | 56 | 5 | 1012 / 482 / 186 | Heat, Hull, Insulation, Service, Structural |
| `deb_ore_freighter_hopper_lid` | 21 | 4 | 260 / 122 / 50 | Heat, Hull, Insulation, Structural |
| `wreck_liner_bow` | 36 | 4 | 724 / 346 / 127 | Glass, Heat, Hull, Insulation |
| `wreck_liner_boatbay` | 28 | 5 | 436 / 208 / 77 | Glass, Heat, Insulation, Service, Structural |
| `deb_liner_hull_panel` | 19 | 4 | 228 / 107 / 42 | Glass, Hull, Insulation, Structural |
| `aft_armor_slab` | 16 | 4 | 324 / 154 / 62 | Armor, Heat, Insulation, Structural |
| `frag_grating_sheet` | 9 | 2 | 108 / 51 / 21 | Insulation, Structural |
| **Total** | **185** | **28** | — | shared 7-role material set |

Mesh reduction on the seven: **185 → 28** objects at LOD0 (−157 authoring primitives).

## Composed place assets (what ships)

| Place | Slot | Draw calls LOD0 | Materials | Tris LOD0 / 1 / 2 | Source GLB | Release GLB |
|---|---|---:|---:|---|---:|---:|
| `place_ceres_bait_wreck` | `ceres_ambush_bait_wreck` | **7** | 7 | **2496 / 1190 / 452** (composed; finalized source total across LODs 4138) | ~4.51 MB | ~1.72 MB |
| `place_ceres_grave_shard` | `ceres_cathedral_grave_shard` | **5** | 5 | **596 / 280 / 113** (composed; finalized source total 989) | ~2.99 MB | ~1.15 MB |

Shared texture pool (authoring maps): **~4.2 MB PNG** across 7 roles × basecolor/normal/ORM.
Embedded in each source GLB; release encodes to KTX2 (bait 21 images, grave 15 images).

## Comparison summary

| | Raw selected pack | Authored-down + composed places |
|---|---|---|
| Draw primitives (selected) | 185 | 12 total LOD0 draws across both places (7+5) |
| LODs | 0 | LOD0/1/2 strictly reducing tris |
| Textures | 0 | Real basecolor / normal / ORM per role |
| Texture MB (shared maps) | 0 | ~4.2 MB PNG source; release KTX2 smaller |
| Instancing | none | `frag_grating_sheet` instanced ×3 in grave composition |

## Entity / collider impact

These slots **re-point** existing Ceres belt-dressing props (`world.js` activity binding). No new
entity count on the ordinary route — only different `placeId` / visual radius:
`place_ceres_bait_wreck` radius 48, `place_ceres_grave_shard` radius 28.

## Honest residuals

- Source geometry is still low-poly blockout mass; materials carry most of the close-camera read.
- Whole-asset G1/G2/G4 human visual verdict is **open**.
- UV quantize skips TEXCOORD outside [0,1] (intentional tiling world-space UVs); release still Meshopt+KTX2.
