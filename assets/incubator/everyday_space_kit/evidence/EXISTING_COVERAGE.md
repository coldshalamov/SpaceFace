# Existing-coverage audit — what already exists vs. what this kit builds
2026-08-08 · read before accusing the kit of duplication, or extending it.

Census sources: runtime/release mappings in `assets/ships/parts/parts_manifest.json`,
`src/render/partsLibrary.js`, and release metadata, plus source-only comparison
packs under `assets/places/lane_furniture/` and
`assets/incubator/npc_activity_pack/`. A source row or incubator file is not live
runtime authority.

## Runtime environmental assets (pre-kit)

| Existing asset | Scale class | What it covers |
|---|---|---|
| `place_station_trade_hub/refinery/military/blackmarket/mining/fab/research` | hero station | The nouns themselves — NOT their surroundings |
| `place_gate_jump_ring` | hero gate | Inter-sector transit portal |
| `place_dock_interior` (+`_military`, `_grit`) | interior set | Docked-state presentation |
| `place_claim_outpost_base/refinery/relay/bastion` | large site | Claim-site machine buildings |
| `place_landmark_wreck_cathedral` | hero landmark | Monumental wreck |
| `place_dead_hulk`, `place_debris_chunk` | large wreckage | Destruction set dressing |
| `place_asteroid_rock_a/b/c`, `place_asteroid_seamed`, `place_asteroid_graffiti` | geology | Rocks and marked rocks |
| `place_lane_beacon`, `place_nav_buoy` | small nav | **Route beacon + warning buoy — brief items deliberately NOT rebuilt** |
| `place_station_billboard`, `place_memorial_array` | medium signage | Advertising / memorial presence |
| `place_conveyor_barge`, `place_mining_drone` | vehicle | Mobile industry (vehicles, not plant) |

## Source-only comparison packs (not runtime-wired)

| Existing source pack | Scale class | What it covers |
|---|---|---|
| `place_claim_mark/lane_pin/tally_post/whistle/cold_locker/ash_pin` source rows | matchstick furniture | Territorial/lane-marker donors; absent from the current runtime selector/release map |
| `npc_activity_pack` (incubator, 15 GLBs) | working craft | Source-only occupational-craft donors, not live crews and not fixed plant |

## The gap (why every kit piece exists)

Nothing in the verified runtime set is **fixed mid-scale industrial plant**: there are no
cargo pods, container racks, cranes, coupling stations, drill platforms,
crushers, sorters, tanks, radiators, conveyors, gantries, scaffolds,
construction frames, parts racks, power units, flood towers, customs hardware,
inspection docks, transponder gates, sensor masts, habitat pods, shuttle docks,
comms/solar arrays, utility modules, salvage clamps, scrap cages, hull racks or
improvised criminal docks. A refinery today is a model floating in empty space.

## Brief items resolved to existing assets instead of rebuilt

| Brief item | Resolution |
|---|---|
| Route beacon | `place_lane_beacon` (live, re-authored 2026-07) — skip |
| Warning buoy / traffic beacon | `place_nav_buoy` (live, re-authored) — skip; the kit's `interdiction_buoy` and `traffic_signal` are LAW devices with deliberately different silhouettes and the arc-blue/signal light codes |
| Billboard-class signage | `place_station_billboard` — skip |
| Small territorial markers | source-only lane-furniture pack already covers the authoring space — skip; this is a duplication guard, not a live-runtime claim |
| Welding drone (brief: "repair drones") | no existing asset; built (`welding_drone`) — `place_mining_drone` is extraction, different trade code |
| Orbital cargo catcher | **cut** — niche silhouette, weakest gameplay story of the cargo family; coupling + transfer arm + catcher was one crane-family too many |
| Small freight depot | built as `freight_platform` (26 m open deck) — distinct from hero trade-hub STATION scale |
| Temporary miner depot | covered by composing `freight_platform` + ore containers + `extraction_mast` (see composition 1) rather than a bespoke asset |
| Shipbreaking tool arm | covered by `salvage_clamp` + `hull_rack` + staged `transfer_arm` in rust paint (composition 5) rather than a near-duplicate of `transfer_arm` |

## Naming / convention inheritance

- Prefix `esk_*` for material roles (one Principled BSDF per role, role name =
  material name) — same promotion contract as `npcwork_*`.
- The kit's cargo pod is the SAME 6×3×3 footprint as the working fleet's
  shared `cargo_container` assembly — one manufacturing standard across packs
  (`THE_COMMON_YARD.md` §1).
- Axis: props are yard plant, mostly rotation-symmetric in use; authored +Z up,
  +X = principal working face where one exists, 1 u = 1 m.
