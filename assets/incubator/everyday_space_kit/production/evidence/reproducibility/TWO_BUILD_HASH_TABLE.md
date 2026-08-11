# Everyday Space production props — two-build reproducibility

- Blender: `5.1.2`
- Builder: `tools/blender/build_everyday_space_props_production.py`
- Builder SHA-256: `0c66875fbe2a2888c1fd52bd56c33ea0d1471f96da153e33de34d19989da9df3`
- Assets: 16
- Matches: **16/16**
- Tree digest A: `3f8d23a160d0a974670ba77670b8a7ffa7d24e3a2d0e0ec5b30f8c4a68ba1885`
- Tree digest B: `3f8d23a160d0a974670ba77670b8a7ffa7d24e3a2d0e0ec5b30f8c4a68ba1885`
- Tree digests match: **true**

## Causes fixed

1. **Triangle / vertex export order** — `stabilize_mesh` sorts vertices by quantized
   position (merge exact quant dups) and faces by `(material, sorted verts, winding)`.
2. **Blender DECIMATE nondeterminism** — removed. DECIMATE preserved triangle counts but
   could change the geometric vertex *set* across clean runs (Ore / Light* groups).
   LOD reduction now uses drop_close + whole-mesh membership drops only.

## Hash table (production source GLBs, pre-publish finalize)

| id | bytes | sha256 (build A = build B) | match |
|---|---:|---|:---:|
| `place_cargo_pod_standard` | 691088 | `22387a5122defa854158cfc1351cc087cdf744a200a73d4b4e5e1f8de6eef634` | yes |
| `place_container_rack` | 1972272 | `549c84672581097048994be6c1c4a65adc25c5bd530c206e5027df16a42ec912` | yes |
| `place_conveyor_truss` | 1612912 | `64b0c6050f257e25360f302895fb417b0bf8af4d2b80ae5c3fd7f785d3c667e6` | yes |
| `place_drill_platform` | 1495960 | `4d5f93db1414e13e13ab8e54fe56d61d1d9bc5c7e80a12510f9a5eccac62e401` | yes |
| `place_extraction_mast` | 1073200 | `07116c678b895edfc52a2d98d9cf85639ebf32a9c35ec1e42cbb249e03f87f79` | yes |
| `place_freight_platform` | 2097000 | `72ef8f4f02d2406d39d6f523dc397db98a166392c241c2f0674b04f7ea5d528f` | yes |
| `place_improvised_dock` | 1365540 | `2266e6b455361c6d66cf885c959c5b3958634041189f51bab57204326d6c8430` | yes |
| `place_interdiction_buoy` | 950960 | `11b8a9a838fc0467ef5dcf20dca3bf5f548fe7764bab27234debfb7d40111153` | yes |
| `place_maintenance_gantry` | 1291500 | `62e3e9152346ceb9e40eb7def717b46a0ae21077d96e9023481cea9e7b7651ce` | yes |
| `place_radiator_bank` | 1056312 | `e44f4147c36dff097f8e7ab31ae7fd0bf3359e4871b9427d64a89c5f5e154714` | yes |
| `place_scrap_cage` | 1029640 | `64196553d82979b7fdd247008a0e361de9c901718fd99f4540504023d0b02017` | yes |
| `place_sensor_mast` | 1233972 | `42fc1350ca68f7a7d9a6a315d23e315f93b7d1d685307071ccb336b69c592d04` | yes |
| `place_slurry_tank` | 1820352 | `2a2049b0d81af1facdc9876ecd50c8a73d9b6166abcc3d47d841829702028185` | yes |
| `place_transfer_arm` | 1236132 | `8dab3eb3ae34c7dd057add5ad8a46f413845477e8cd4e4a50e7e2614d62e9f42` | yes |
| `place_transponder_gate` | 1049908 | `e01e355ceeb072e061c3015bd179dfe0c8d90e6df0b472018d880412f1e2dbd7` | yes |
| `place_worklight_tower` | 630764 | `7ae35faf9a5459b6cb8207acfc03dcf8ed1ba12246038f153c0aa643513f9961` | yes |

Live `production/source` after publish finalize differs by intentional glTF extras/occlusion bind.
