# Cycle 34 — Massline passenger and drive identity repair

State: `surfaced_candidate` / `evidence_ready` / implementing verdict `REVISE`.
This record is not independent acceptance and does not close G1, G2, G4, or G7.

## Exact editable and exported sources

| Source | SHA-256 | Triangles | Draws |
|---|---|---:|---:|
| `blender/massline_express_liner_v1.blend` | `637B0F3AE63464AAADFD95C20E260E706DEFB318E0EA918E8F61940F9ABFE527` | — | — |
| `source/wholeships/massline_express_liner_v1_lod0.glb` | `256454E3CF02C4EB34AEE1069C6047DBF336351E94041A196DC94D818FA85208` | 47,700 | 9 |
| `source/wholeships/massline_express_liner_v1_lod1.glb` | `44D9E875194DC8F297E3F830B99D4CF3CBA48646B11D955E8C9E28BC82AA0FBF` | 42,336 | 9 |
| `source/wholeships/massline_express_liner_v1_lod2.glb` | `A281D0E8E0A6248D8F29984E38C7CF8CE2C5D82532CA04AF5ADBACF563C3BF31` | 19,508 | 8 |

Every GLB contains the same 13 canonical socket empties and `COLLISION_HULL`. Exported material names
are unsuffixed and match `MATERIAL_CONTRACT.json`; LOD2 intentionally omits the amber micro fixture.

## Repair implemented

- Replaced the parallel pale passenger course with three stepped pressure sections and sharp width/
  height transitions rather than another surface-only pass.
- Cut six paired deck-edge gallery wells with set-back smoked glazing, full frames, and a rhythm large
  enough to survive D=144; LOD2 retains the same six beats as simplified glazed bands.
- Added full-height intermediate hat frames so pressure-section hierarchy survives neutral clay.
- Widened the aft pressure/load shoulder and grew each drive case through it. The outboard transition
  is 2.75 m rather than 4.55 m, roots/cases are thicker, and ceramic shoulder armor reads before the
  refractory bore.
- Separated ceramic, anodized frame, smoked glass, galvanized primer, forged keel, refractory, and
  oxidized throat values at the matched gameplay exposure.
- Replaced generic Blender export material names with the exact semantic names in the material bill.

## Matched evidence

LOD0: `cycles/cycle_34/`; LOD1: `cycles/cycle_34/lod1/`; LOD2: `cycles/cycle_34/lod2/`.
Each set contains `play_chase.png`, `play_chase_abeam.png`, `play_chase_close.png`,
`clay_play_chase.png`, `grazing_close.png`, `drive_rear.png`, `id_or_material_id.png`,
`orm_isolation.png`, `normal_isolation.png`, and an exact-source `EVIDENCE_IDENTITY.json`.

- LOD0 default: This is the chase camera; I can see the whole planform; the ship is not a close-up.
- LOD0 abeam: This is the chase camera; I can see the whole abeam silhouette; the ship is not a close-up.
- LOD0 close: This is the legal D=58 chase camera; I can see the whole planform; the ship is not clipped.
- LOD1 default/abeam/close use the same matched camera contract and remain wholly framed.
- LOD2 default/abeam/close use the same matched camera contract and remain wholly framed.

Bounds are 40.67 × 22.454 × 10.9873 m, length-to-beam 1.8113. LOD0/1 occupancy is 17.45% default,
9.80% abeam, and 44.96% close. LOD2 occupancy is 17.46%, 9.81%, and 45.09%. All are uncropped and
inside the legal bands.

## Original-resolution implementing review

All nine legal LOD0/1/2 default, abeam, and close PNGs were inspected at their 1600×900 source
resolution. The LOD0 clay, grazing, drive-rear, material-ID, ORM, and normal diagnostics were also
inspected at original resolution. LOD1/2 diagnostics remain hash-bound reproduction evidence but were
not used to broaden this implementing verdict. The passenger course now has visible pressure-section
and window hierarchy at D=144, the abeam frame retains a multi-volume passenger body with boarding/
service apertures, and material roles no longer collapse into one grey value. The drive roots are
materially thicker and visibly continuous with the aft load shoulder.

Decision: `REVISE`. Residual risk is concentrated rather than hidden: the long separated drive cases
can still read as prongs at default chase distance, and the wide abeam passenger belt still approaches
a cross-shaped composition. The controller owns the independent exact-hash decision.

## Validation run

- Full reproducible Blender 5.1.2 build completed for LOD0/1/2; no bake failures and no occupancy
  failures. Builder-reported counts are 47,700 / 42,336 / 19,508 triangles and 9 / 9 / 8 draws.
- `tools/blender/spaceface_export.py --validate-only ... --kind wholeship` passed all three GLBs.
  LOD0 emitted non-failing diagnostics that the post-export node extras do not assert chamfer
  treatment; the exact grazing frame, builder bevel policy, and geometry remain review evidence.
- Asset-local hash audit recomputed all three GLBs, all three identity sources, all still hashes,
  the material-contract hash, and the technique-ledger hash with zero mismatches.
- `npm run check:baseline`: 12/12 green in 87,427 ms, under the 90,000 ms wall budget.
- The optional Khronos wrapper could not start because its configured local `gltf-validator` npm
  module was absent. No dependency was installed and the sanctioned SpaceFace validator was used.
