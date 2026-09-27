# Alien Ecology Program — Actionable Plan: Phases 0–4 (through the vertical-slice hard gate)

Source: `design/alien-ecology-program/` (PR #168). This file converts the program's roadmap
packets AE-000..AE-049 into concrete engineering work against live seams. Phases 5–15 are
deliberately deferred: the program's own hard gate (doc 09) forbids mass content before the
Cinder Nursery slice proves out.

## Scope decision

"Half the program" = Phases 0–4: canon cleanup + data foundations + infestation art foundation
+ fauna primitives + the Cinder Nursery vertical slice. Phases 5+ are content multiplication
explicitly gated on this slice.

## Seam decisions (verified against code)

| Program requirement | Live seam used |
|---|---|
| No new registered system (doc 08) | `world.js` owns `state.world.alienEcology`: spawn call at the end of `_spawnDressing`, tick call in `update()`, fields in `serialize()`/`deserialize()`. No manifest/registry change. |
| Contamination model `C = clamp(G+L+T+E)` | Pure data module `src/data/alienEcology.js`; `contaminationAt(state, sectorId, zoneId)` derives from zone/sector baselines + site overrides — no spread sim. |
| Revelation axis R | `state.world.alienEcology.revelation` (tier 0–3), advanced by authored events (site identified, relay severed, cyst harvested, black box recovered). |
| Hero site = colonized DMC service barge | `WORLD_SITE_MANIFESTS` entry `world_site_charon_cinder_nursery` (worldSiteKernel + asteroidSites + worldSiteRuntime already handle components/operations/payloads/stages/persistence). Visual root: `place_conveyor_barge` (new `WORLD_SITE_ASSET_BINDINGS` entry). |
| Objective: recover DMC black box | Site component `black_box_cradle` (`payload_mount`, sealed) + `cut` op releases payload `dmc_black_box` → existing salvage/pickup path yields `cmdty_dmc_black_box`. |
| Restore power wakes the ecology | Operation `restore_power_bus` (repair) → consequence emits `alienEcology:nurseryPowered` intent on the bus → alienEcology wakes fauna + site state. |
| Aftermath states persist | World-site record persists via `state.sites.worldById` (asteroidSites serializer); ecology aftermath (`deadFauna`, site state, revelation) persists via `state.world.alienEcology` in world's serialize. |
| "Destroying relay reduces coherence, doesn't kill" | `relay_choir_node` site component, `sever` op (cut) → `alienEcology:relaySevered` → fauna lose relay coherence (alert radius/heading correlation drop, latency rises). |
| Fauna are core entities, not tactical stack | `type: 'fauna'`, `physicsBody: false`, `collides: false`; kinematic drive tick writes pos/rot directly. `isMovableEntity` gains a `fauna` case for interpolation. |
| Infestation kit (filament sheet, bulbs, cysts…) | Dressing rows via `insertDressingRow` with `placeId: 'alien_growth_<module>'`; `partsLibrary.buildFallbackPlaceProp` gains an organic procedural builder for that family. |
| Fauna bodies | `visualFactory.build` `case 'fauna'` → procedural builders (`buildFaunaMesh`) keyed on `data.ecology.speciesId`. |
| Scanner language evolves with R | Entities/POI carry `scannerSignalKind: 'anomaly'`; `scanLabel`/`name` refreshed by the ecology tick when revelation tier changes (`scannerBiologyLabel`). |
| Canon cleanup (AE-002/AE-003) | Vael `fleetClass: 'alien'` → `'contractual'` (displayed in entityResolver kicker). Understory `fleetClass: 'xenomorphic'` → `'biological'` per the BIOLOGICAL/UNDERSTORY reframe. Machine-protocol state lives in `state.world.alienEcology.machineProtocol` (unknown/observed/compliant/witnessed/exception/violation/revoked). |
| Determinism | Spawn plans use `mulberry32(hash32(meta.seed, sectorId, epoch, 'alien-ecology'))`; no `Math.random`; site identity seeded. |

## Packet mapping

- AE-000..004 → faction data edits + `ALIEN_MACHINE_PROTOCOLS` + state shape.
- AE-010..014 → `src/data/alienEcology.js` (bands, baselines, strains, sites, labels, helpers).
- AE-020..025 → growth place-prop family + placement planner (procedural kit; authored GLBs are a later lane).
- AE-030..037 → `src/data/alienFauna.js` species grammar + drive engine in `src/systems/alienEcology.js`.
- AE-040..049 → zone `zone_charon_cinder_nursery`, POI `poi_charon_cinder_nursery` (runtimeOwner keeps the marker off the dressing path; the site root is the visual), world-site manifest, fauna cast, staged arrival beats, aftermath, rewards (credits intent + taxonomy flag + toast).

## Not in this slice (phases 5+, per the hard gate)

Content waves of sites/fauna, rep-grinding/faction mission packs, precursor Verge-Layer setpieces,
new registered systems, authored GLB infestation art, per-item cargo contamination custody chains.

## Verification

`test/alienEcology.test.mjs`: contamination math + band boundaries, scanner labels by tier,
deterministic materialization (same seed → identical fauna/growth layout), drive transitions on
stimulus, relay-sever coherence collapse, serialize/deserialize roundtrip, manifest validation,
zone/POI presence. Then `npm run check:baseline`.
