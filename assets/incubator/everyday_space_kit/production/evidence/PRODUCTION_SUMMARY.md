# Everyday Space props — production build summary

Packet `PQ-045-PROP-PROMOTION-001`. Selection: ledger §4.2 sixteen (outside REVISE-first 19).

## Per-prop table

| prop | LOD0 | LOD1 | LOD2 | materials | tex MB est | collision (half-extents m) | gameplay-distance read | reducing |
|---|---:|---:|---:|---|---:|---|---|:---:|
| `cargo_pod_standard` | 168 | 156 | 36 | BareSteel, PaintTeal, Struct | 9 | box +/-3.06×1.7×1.615 | 110/140 WU neutral EEVEE; Berth pod silhouette holds | yes |
| `container_rack` | 6600 | 6528 | 928 | BareSteel, LightFlood, LightNavGreen, PaintTeal, Struct, Tank, Truss | 16.5 | box +/-6.7693×4.18×5.85 | rack frame + bay lights readable as logistics plant | yes |
| `freight_platform` | 4152 | 4116 | 836 | BareSteel, Cabin, Deck, Hazard, LightFlood, LightNavGreen, LightNavRed, PaintTeal, Struct, Tank, Truss | 19.5 | box +/-13.2×7.225×4.9923 | wide deck + floods; approach lights carry handedness | yes |
| `transfer_arm` | 1128 | 1028 | 308 | BareSteel, Hazard, LightFlood, PaintTeal, Pipe, Struct, Truss | 14.25 | box +/-10.15×2.3×5.225 | crane post+boom silhouette clear at play distance | yes |
| `radiator_bank` | 880 | 280 | 184 | Hazard, Ore, Pipe, Struct, Truss | 8.25 | box +/-8.5×0.8×3.525 | long fin bank remains the heat-rejection read | yes |
| `slurry_tank` | 2368 | 1180 | 460 | BareSteel, Hazard, Insulation, LightFlood, PaintOchre, Pipe, Struct, Tank, Truss | 18 | box +/-5.595×2.252×2.88 | three-lobe vessel + amber wrap survives far band | yes |
| `drill_platform` | 2008 | 1896 | 456 | BareSteel, Hazard, LightFlood, LightMining, PaintOchre, Scorch, Struct, Truss | 15 | box +/-7.35×7.35×5.87 | ring deck + outriggers + amber bit collar | yes |
| `conveyor_truss` | 2824 | 2724 | 1444 | BareSteel, Deck, LightFlood, Ore, PaintOchre, Truss | 11.25 | box +/-13.5×2.3×3.415 | long span-gauge girder reads as ore path | yes |
| `extraction_mast` | 728 | 248 | 148 | Hazard, LightFlood, LightSignal, PaintOchre, Pipe, Struct, Truss | 12 | box +/-2.97×2.0672×6.5453 | yard mast + amber head lights | yes |
| `worklight_tower` | 768 | 208 | 108 | Hazard, LightFlood, LightSignal, Struct, Truss | 8.25 | box +/-1.5×1.5×7.91 | flood tower = work happens here | yes |
| `transponder_gate` | 1916 | 156 | 96 | Hazard, LightFlood, LightNavRed, PaintNavy, Struct, Truss | 11.25 | box +/-1.2×11.2×6.621 | portal / goalpost lane gate | yes |
| `interdiction_buoy` | 646 | 430 | 230 | BareSteel, Hazard, LightAuthority, LightNavRed, Ore | 6 | box +/-3.7×3.2138×2.47 | spiked bicone threat silhouette | yes |
| `sensor_mast` | 1248 | 768 | 468 | BareSteel, Hazard, LightAuthority, PaintNavy, Pipe, Struct, Truss | 14.25 | box +/-2.645×2×6.6653 | post + dish cluster | yes |
| `scrap_cage` | 588 | 96 | 72 | BareSteel, Deck, LightHooded, PaintRust, Scorch, Struct | 11.25 | box +/-5.5365×3.11×2.8519 | cage block + hooded red | yes |
| `improvised_dock` | 876 | 852 | 572 | BareSteel, LightHooded, PaintRust, PaintTeal, Struct, Truss | 15.75 | box +/-4.58×6.2297×2.2265 | L-shape pod+arm salvage dock | yes |
| `maintenance_gantry` | 1716 | 1692 | 172 | BareSteel, Hazard, LightFlood, PaintService, Pipe, Struct, Truss | 14.25 | box +/-2×10.05×5.3556 | portal gantry a hull parks under | yes |

## Material-truth

Tier C/D grouped record: `production/evidence/MATERIAL_TRUTH.json`.
G1/G2/G4 remain **OPEN** (this pass is evidence_ready only).

## Reproducibility (promoted outputs)

- Production dual-build (Blender 5.1.2 factory-startup): **16/16** byte-identical.
  See `production/evidence/reproducibility/TWO_BUILD_HASH_TABLE.md`.
- Publish finalize dual-run: 16/16 on `publish_everyday_space_props.mjs` (same session; see
  `PUBLISH_TWO_BUILD_HASH_TABLE.md` when present).
- Place-release KTX2+meshopt dual-run: 16/16 on `scripts/build-place-release-assets.mjs`
  (same session; see `RELEASE_TWO_BUILD_HASH_TABLE.json` when present).

## Residuals

- Whole-asset G1/G2/G4 open (independent visual review not claimed).
- Runtime scatter/wiring is a separate PQ-045 leaf — this leaf is promotion only.
- LOD reduction uses drop_close + whole-mesh membership drops only (no Blender DECIMATE);
  some LOD1 totals stay close to LOD0 when few close-only parts exist, but every prop is
  strictly reducing.
- Distance PNGs are silhouette notes, not G1/G2/G4 closure.
- No integration/acceptance claims.
