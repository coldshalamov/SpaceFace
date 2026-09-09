# Live non-Hitch flyable roster

Built from `src/data/ships.js`, `src/render/partsLibrary.js` maps, and `parts_manifest.json`.
Hitch (`ship_kestrel`) is excluded.

## Player ships (12)

| Def | Name | Role | Live visual today | Shared with | Remaster unit |
|---|---|---|---|---|---|
| ship_pelican | Pelican | mining T1 | `pelican_production_v1.glb` | — | Live remaster, more loops |
| ship_wasp | Wasp | fighter T1 | `wasp_production_v1.glb` | — | Live remaster, more loops |
| ship_mule | Mule | freighter T1 | `mule_production_v1.glb` | — | Live remaster, more loops |
| ship_drifter | Drifter | multirole T2 | `drifter_production_v1.glb` | — | Factory remaster |
| ship_hornet | Hornet | interceptor T2 | `hornet_production_v1.glb` | — | Factory remaster |
| ship_ironback | Ironback | mining_barge T2 | `ironback_production_v1.glb` | — | Factory remaster |
| ship_bastion | Bastion | corvette T3 | `bastion_production_v1.glb` | — | Factory remaster |
| ship_atlas | Atlas | heavy_hauler T3 | `atlas_production_v1.glb` | — | Factory remaster |
| ship_ranger | Ranger | explorer T3 | `ranger_production_v1.glb` | — | Factory remaster |
| ship_warden | Warden | gunship T4 | `warden_production_v1.glb` | — | Factory remaster |
| ship_colossus | Colossus | battlecruiser T4 | `colossus_production_v1.glb` | — | Factory remaster |
| ship_leviathan | Leviathan | flagship T5 | `leviathan_production_v1.glb` | — | Factory remaster |

Unwired / blocked wholeships (do **not** wire): `wholeships/pelican.glb`, `wholeships/wasp.glb` — accessory-only, no Material_Hull body.

## NPC / hostile / traffic bodies (10)

| Presentation | File | Notes |
|---|---|---|
| wasp_swarmer | `ashline_dart_production_v1.glb` | Ashline Dart |
| bruiser_brawler | `ashline_lode_production_v1.glb` | Ashline Lode |
| reaver_pirate / corsair_raider | `ashline_rig_production_v1.glb` | Shared hostile body (already shared live) |
| courier | `helios_lark_production_v1.glb` | Helios Lark |
| miner | `helios_cradle_production_v1.glb` | Helios Cradle |
| hauler | `helios_span_production_v1.glb` | Helios Span |
| ore_carrier | `ore_barge_production_v1.glb` | Work fleet |
| tender | `repair_tender_production_v1.glb` | Work fleet |
| salvor | `salvage_cutter_production_v1.glb` | Work fleet |
| surveyor | `survey_pin_production_v1.glb` | Work fleet |

## Modular kit parts that remain visible

Non-Hitch player ships still compose engines / weapons / fins / cockpits / pods / gear on the modular path until a wholeship is live. Remaster those kit parts after the bodies, except `hull_starter` (Hitch). `hull_gunship` exists but is not mapped to a live def.
