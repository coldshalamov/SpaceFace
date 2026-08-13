# Live non-Hitch flyable roster

Built from `src/data/ships.js`, `src/render/partsLibrary.js` maps, and `parts_manifest.json`.
Hitch (`ship_kestrel`) is excluded.

## Player ships (12)

| Def | Name | Role | Live visual today | Shared with | Remaster unit |
|---|---|---|---|---|---|
| ship_pelican | Pelican | mining T1 | modular `hull_miner.glb` | Ironback | Distinct wholeship (roles must read as themselves) |
| ship_wasp | Wasp | fighter T1 | wholeship `wasp_production_v1.glb` | — | Upgrade existing wholeship |
| ship_mule | Mule | freighter T1 | modular `hull_freighter.glb` | Atlas | Distinct wholeship |
| ship_drifter | Drifter | multirole T2 | modular `hull_multirole.glb` | Ranger | Distinct wholeship |
| ship_hornet | Hornet | interceptor T2 | modular `hull_interceptor.glb` | — | Distinct wholeship |
| ship_ironback | Ironback | mining_barge T2 | modular `hull_miner.glb` | Pelican | Distinct wholeship |
| ship_bastion | Bastion | corvette T3 | modular `hull_corvette.glb` | — | Distinct wholeship |
| ship_atlas | Atlas | heavy_hauler T3 | modular `hull_freighter.glb` | Mule | Distinct wholeship |
| ship_ranger | Ranger | explorer T3 | modular `hull_multirole.glb` | Drifter | Distinct wholeship |
| ship_warden | Warden | gunship T4 | modular `hull_frigate.glb` | — | Distinct wholeship |
| ship_colossus | Colossus | battlecruiser T4 | modular `hull_capital.glb` | Leviathan | Distinct wholeship |
| ship_leviathan | Leviathan | flagship T5 | modular `hull_capital.glb` | Colossus | Distinct wholeship |

Unwired / blocked wholeships (do **not** wire): `wholeships/pelican.glb`, `wholeships/wasp.glb` — accessory-only, no Material_Hull body.

## NPC / hostile / traffic bodies (10)

| Presentation | File | Notes |
|---|---|---|
| wasp_swarmer | `wholeships/ashline_dart.glb` | Ashline Dart |
| bruiser_brawler | `wholeships/ashline_lode.glb` | Ashline Lode |
| reaver_pirate / corsair_raider | `wholeships/ashline_rig.glb` | Shared hostile body (already shared live) |
| courier | `wholeships/helios_lark.glb` | Helios Lark |
| miner | `wholeships/helios_cradle.glb` | Helios Cradle |
| hauler | `wholeships/helios_span.glb` | Helios Span |
| ore_carrier | `wholeships/ore_barge.glb` | Work fleet |
| tender | `wholeships/repair_tender.glb` | Work fleet |
| salvor | `wholeships/salvage_cutter.glb` | Work fleet |
| surveyor | `wholeships/survey_pin.glb` | Work fleet |

## Modular kit parts that remain visible

Non-Hitch player ships still compose engines / weapons / fins / cockpits / pods / gear on the modular path until a wholeship is live. Remaster those kit parts after the bodies, except `hull_starter` (Hitch). `hull_gunship` exists but is not mapped to a live def.
