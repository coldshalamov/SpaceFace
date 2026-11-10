# Everyday kit stills — outbox import

## What this is

Chase/berth stills of every **source** everyday space kit GLB under
`assets/incubator/everyday_space_kit/source/` (46 design-candidate props across
six families). Render only — **the kit was not edited**. Purpose: a person can
open the stills and see which pieces read as objects at the live chase pose.

Camera: in-folder `spaceface_chase_camera.py` (tilt 60°, vertical FOV 50°,
heading 0 / 90). Distance scales with measured `sizeMax` so berth-scale pods and
yard platforms share a similar occupancy band:

`D = clamp(144 * sizeMax / 16, 22, 420)`

Two stills per piece at 1600×900 EEVEE 16 samples: `play_chase.png`,
`play_chase_abeam.png`. Blender **4.5.14 LTS**.

Source master tip at job start on this box: `0fd64234a71147fd16f47f7a5f988d30fe758e3f`  
vm-drop tip before this job: `a6303a2cecc22599c149e9ca4bac635f400aa06c`  
Evidence: `build-report.json` (schema `spaceface.vmDrop.everydayKitStills.v1`).

Rebuild:

```sh
blender --background --factory-startup --python \
  design/program/vm-drop/everyday-kit-stills/render_everyday_kit_stills.py -- \
  --out design/program/vm-drop/everyday-kit-stills/stills \
  --report design/program/vm-drop/everyday-kit-stills/build-report.json
```

## Families covered (46 / 46)

- **cargo** (9): `cargo_pod_standard`, `cargo_pod_hazmat`, `cargo_pod_standard_breached`, `ore_bulk_container`, `container_rack`, `container_rack_abandoned`, `transfer_arm`, `tanker_coupling`, `freight_platform`
- **mining** (8): `drill_platform`, `drill_platform_cold`, `crusher_module`, `ore_sorter`, `slurry_tank`, `radiator_bank`, `conveyor_truss`, `extraction_mast`
- **service** (8): `maintenance_gantry`, `repair_scaffold`, `repair_scaffold_bent`, `construction_frame`, `welding_drone`, `parts_rack`, `power_skid`, `worklight_tower`
- **law** (6): `customs_pylon`, `inspection_platform`, `interdiction_buoy`, `transponder_gate`, `sensor_mast`, `traffic_signal`
- **civic** (8): `habitat_pod`, `habitat_pod_derelict`, `shuttle_dock`, `observation_blister`, `comms_array`, `solar_array`, `utility_module`, `passenger_platform`
- **salvage** (7): `salvage_clamp`, `scrap_cage`, `hull_rack`, `illicit_transfer_frame`, `improvised_dock`, `pirate_sensor_mast`, `power_skid_patched`

## Piece table

| Id | Family | Envelope (m) | Tris | D | Stills | SHA-256 prefix (chase / abeam) |
|---|---|---|---|---|---|---|
| `cargo_pod_standard` | cargo | 6.12 × 3.40 × 3.23 | 168 | 55.1 | `stills/cargo_pod_standard/` | `dc1483c4d0f6…` / `4338f5b83530…` |
| `cargo_pod_hazmat` | cargo | 6.12 × 3.40 × 3.55 | 404 | 55.1 | `stills/cargo_pod_hazmat/` | `b4d865cf9f7d…` / `778a3826bc60…` |
| `cargo_pod_standard_breached` | cargo | 6.12 × 6.44 × 3.41 | 264 | 57.9 | `stills/cargo_pod_standard_breached/` | `7b75034db84a…` / `a85cd2e64ba0…` |
| `ore_bulk_container` | cargo | 10.20 × 5.28 × 4.76 | 720 | 91.8 | `stills/ore_bulk_container/` | `487b6670b2a3…` / `e3cbe3a862c5…` |
| `container_rack` | cargo | 13.54 × 8.36 × 11.70 | 6600 | 121.8 | `stills/container_rack/` | `1739d6f23411…` / `d68f2666c14f…` |
| `container_rack_abandoned` | cargo | 14.06 × 9.58 × 11.48 | 5144 | 126.6 | `stills/container_rack_abandoned/` | `7b5b74ee0a60…` / `18fa9e6d9629…` |
| `transfer_arm` | cargo | 20.30 × 4.60 × 10.45 | 1128 | 182.7 | `stills/transfer_arm/` | `6c821960437f…` / `cb09fe9bbdc7…` |
| `tanker_coupling` | cargo | 12.20 × 6.20 × 7.62 | 712 | 109.8 | `stills/tanker_coupling/` | `8b56092addad…` / `073814046b3e…` |
| `freight_platform` | cargo | 26.40 × 14.45 × 9.98 | 4152 | 237.6 | `stills/freight_platform/` | `f8e83b451c49…` / `068049f241d3…` |
| `drill_platform` | mining | 14.70 × 14.70 × 11.74 | 2008 | 132.3 | `stills/drill_platform/` | `c8a2979b3731…` / `b5749e381764…` |
| `drill_platform_cold` | mining | 14.60 × 14.60 × 10.14 | 1688 | 131.4 | `stills/drill_platform_cold/` | `169c22e94ee3…` / `709690e2e817…` |
| `crusher_module` | mining | 11.95 × 10.89 × 9.25 | 628 | 107.6 | `stills/crusher_module/` | `a8049b7441c5…` / `a2a17b6bbf4b…` |
| `ore_sorter` | mining | 9.70 × 4.50 × 7.40 | 1460 | 87.3 | `stills/ore_sorter/` | `a625e5920bfc…` / `03fc2b4aef20…` |
| `slurry_tank` | mining | 11.19 × 4.50 × 5.76 | 2368 | 100.7 | `stills/slurry_tank/` | `e65405ee3421…` / `fbe9a8e5f59c…` |
| `radiator_bank` | mining | 17.00 × 1.60 × 7.05 | 880 | 153.0 | `stills/radiator_bank/` | `def9fa407ae4…` / `fc9086a1ca09…` |
| `conveyor_truss` | mining | 27.00 × 4.60 × 6.83 | 2824 | 243.0 | `stills/conveyor_truss/` | `5a1b76eb7630…` / `7ac8d929b22e…` |
| `extraction_mast` | mining | 5.94 × 4.48 × 13.09 | 728 | 117.8 | `stills/extraction_mast/` | `d50aba748b03…` / `d1e8dc05b080…` |
| `maintenance_gantry` | service | 4.00 × 20.10 × 10.71 | 1716 | 180.9 | `stills/maintenance_gantry/` | `587965430321…` / `cf5be1c7d3fd…` |
| `repair_scaffold` | service | 7.52 × 3.04 × 9.15 | 504 | 82.4 | `stills/repair_scaffold/` | `7b1df7d5b9eb…` / `0c13dc09e80a…` |
| `repair_scaffold_bent` | service | 7.40 × 3.80 × 9.15 | 308 | 82.4 | `stills/repair_scaffold_bent/` | `89c828691990…` / `f3fec131f361…` |
| `construction_frame` | service | 27.22 × 12.94 × 8.13 | 2024 | 245.0 | `stills/construction_frame/` | `fa7dc14dc220…` / `f35234d5bf9c…` |
| `welding_drone` | service | 2.06 × 1.09 × 0.83 | 352 | 22.0 | `stills/welding_drone/` | `d8297cc10ad8…` / `a3c84b8b66e9…` |
| `parts_rack` | service | 8.62 × 4.00 × 5.03 | 412 | 77.6 | `stills/parts_rack/` | `453338d4568f…` / `23a4058e5d68…` |
| `power_skid` | service | 8.25 × 3.48 × 5.00 | 644 | 74.2 | `stills/power_skid/` | `381ef3a315f7…` / `e5bfc9f7e6ec…` |
| `worklight_tower` | service | 3.00 × 3.00 × 15.82 | 768 | 142.4 | `stills/worklight_tower/` | `fd60c0ee4cfa…` / `d01f490526f5…` |
| `customs_pylon` | law | 3.40 × 3.40 × 14.16 | 208 | 127.4 | `stills/customs_pylon/` | `113600aa2114…` / `ebb69ef68f27…` |
| `inspection_platform` | law | 20.40 × 10.40 × 5.69 | 388 | 183.6 | `stills/inspection_platform/` | `1a5068c1a332…` / `4d985f73c96a…` |
| `interdiction_buoy` | law | 7.40 × 6.62 × 4.94 | 656 | 66.6 | `stills/interdiction_buoy/` | `967f45b1a4f6…` / `0b1def234f13…` |
| `transponder_gate` | law | 2.40 × 22.40 × 13.24 | 1916 | 201.6 | `stills/transponder_gate/` | `1d54130d088c…` / `3cd1b2b14f53…` |
| `sensor_mast` | law | 5.29 × 4.08 × 13.33 | 1248 | 120.0 | `stills/sensor_mast/` | `3563f462455b…` / `8ef3831825c3…` |
| `traffic_signal` | law | 4.75 × 2.40 × 8.16 | 256 | 73.4 | `stills/traffic_signal/` | `833fe94fe2a1…` / `cf891271e43a…` |
| `habitat_pod` | civic | 11.78 × 7.60 × 7.19 | 840 | 106.0 | `stills/habitat_pod/` | `f837f019e8e8…` / `d071e6a9fb9e…` |
| `habitat_pod_derelict` | civic | 11.78 × 7.41 × 6.38 | 720 | 106.0 | `stills/habitat_pod_derelict/` | `399aa9919064…` / `c2bf2006bb89…` |
| `shuttle_dock` | civic | 27.39 × 10.40 × 8.66 | 1800 | 246.5 | `stills/shuttle_dock/` | `60c08ce3eebb…` / `790208544f08…` |
| `observation_blister` | civic | 6.29 × 6.30 × 7.74 | 1200 | 69.7 | `stills/observation_blister/` | `7583e9da2e4f…` / `ce5793c65aba…` |
| `comms_array` | civic | 7.39 × 6.60 × 7.77 | 908 | 69.9 | `stills/comms_array/` | `f323e514c727…` / `6dc3211a3244…` |
| `solar_array` | civic | 4.60 × 21.46 × 3.70 | 1148 | 193.1 | `stills/solar_array/` | `1ab0eab66130…` / `4023aad53242…` |
| `utility_module` | civic | 6.12 × 4.32 × 4.85 | 276 | 55.1 | `stills/utility_module/` | `58d2a7c83a9b…` / `ad0ab92a6741…` |
| `passenger_platform` | civic | 16.50 × 4.00 × 5.77 | 568 | 148.5 | `stills/passenger_platform/` | `3be26e03a5c2…` / `f765254a45f1…` |
| `salvage_clamp` | salvage | 5.60 × 3.60 × 7.47 | 328 | 67.3 | `stills/salvage_clamp/` | `a23478e263ff…` / `3f2e3a64dace…` |
| `scrap_cage` | salvage | 11.11 × 6.23 × 5.70 | 588 | 100.0 | `stills/scrap_cage/` | `6897b1739e87…` / `c585146014d1…` |
| `hull_rack` | salvage | 17.12 × 7.14 × 7.49 | 3604 | 154.1 | `stills/hull_rack/` | `c72c3c6d29e5…` / `5c3197726c0f…` |
| `illicit_transfer_frame` | salvage | 9.39 × 12.10 × 4.47 | 544 | 108.9 | `stills/illicit_transfer_frame/` | `efbb80ba25ae…` / `c27a3ae67250…` |
| `improvised_dock` | salvage | 9.16 × 12.47 × 4.46 | 876 | 112.2 | `stills/improvised_dock/` | `818d454856c3…` / `33997105bbc4…` |
| `pirate_sensor_mast` | salvage | 5.97 × 7.90 × 11.61 | 1120 | 104.5 | `stills/pirate_sensor_mast/` | `bf423ef6ca9c…` / `39f88f29b0fd…` |
| `power_skid_patched` | salvage | 8.25 × 3.48 × 5.65 | 656 | 74.2 | `stills/power_skid_patched/` | `b570aaf5b529…` / `11236a605a13…` |

## Exact future live paths

Stills are **evidence / review only** — not runtime. No promotion path proposed.
If a later owner wants kit donor PNGs refreshed, copy from
`design/program/vm-drop/everyday-kit-stills/stills/<id>/` into an owner-chosen
evidence tree; do not treat this outbox as wired.

Production `place_*` GLBs under `assets/incubator/everyday_space_kit/production/source/`
were **not** re-rendered (source identities already cover the same visual grammar;
production pack remains the release slice for PQ-045.prop-promotion).

## What is not wired / freeze notes

Nothing is wired. `assets/incubator/everyday_space_kit/` was **read only**.
No edit to manifests, `src/`, `NOW.md`, `VM_LANES.md`, live GLBs, places, or
shared builders. Failures: **0**.
