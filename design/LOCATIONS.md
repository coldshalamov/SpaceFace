# LOCATIONS — Canonical Reference (v1)

Six recurring sites. All entries derived from SECTORS table, world.js jump costs, economy stock deltas, hazard geometry, and mission objective coordinates. No descriptive prose.

## Helios Station (sector_helios_prime / station_helios)
Physical alteration: docking collar 3 shows 0.4 m radial compression scar from repeated heavy freighter impacts.
Scarcity cost: fuel purchase requires 18 % station stock drawdown per 100 units; triggers +12 % price on next tick.
Contradictory traversal: gate logs list 47 s transit to Ceres Belt; nav computer records 51 s average over 200 jumps.
Embedded violence: debris field at 620, -280 spawns only after player has killed 3+ hostiles in adjacent sector; blocks direct line to starter asteroid field until cleared.

## Ceres Refinery (sector_ceres_belt / station_ceres)
Physical alteration: ore hopper 2 intake grate exhibits 180 mm melt-through consistent with plasma cutter breach.
Scarcity cost: selling metallic ore above 240 units forces refinery stock below equilibrium, raising buy price 9 % for all subsequent loads.
Contradictory traversal: sector edge distance to Tethys Junction gate measured 1840 m; jump drive charge time logs 2.1× expected for that range.
Embedded violence: radiation hazard zone at -800, 500 is static only after player has completed one bounty mission in the sector; otherwise absent from collision map.

## Tethys Trade Hub (sector_tethys_junction / station_tethys)
Physical alteration: customs scanner array shows three missing emitter panels; replaced with lower-output units reducing scan range 22 %.
Scarcity cost: mission board refresh rate drops from 180 s to 420 s when player cargo hold is >70 % full on arrival.
Contradictory traversal: Customs Gate toll records show 65 cr collected on 31 % of entries; player ledger shows 0 cr deducted on same visits.
Embedded violence: black-market cache POI remains locked until player has negative reputation with faction_mts; otherwise collision mesh blocks access.

## Forge Foundry (sector_vesta_forge / station_forge)
Physical alteration: module assembly arm 4 exhibits permanent 14° offset from documented zero; causes +3 s craft time on S-slot items.
Scarcity cost: module_craft service consumes 40 units polymer stock per operation; stock depletion adds 25 % credit surcharge.
Contradictory traversal: Vesta-to-Helios jump gate distance listed 2100 m in sector data; actual measured transit vector requires 2380 m clearance.
Embedded violence: derelict freighter POI at 300, -700 spawns wreckage only after player has triggered one interdiction event; wreckage acts as 120 m impassable collider until salvaged.

## Drift Market (sector_pallas_drift / station_drift)
Physical alteration: market concourse deck plating shows 60 mm gouge pattern matching autocannon impact at 15° incidence.
Scarcity cost: black_market service availability requires 180 units contraband stock; each trade removes 12 % of that buffer.
Contradictory traversal: nebula hazard at 400, 600 registers 0.4 intensity in hazard table; player shield drain logs show 0.65 average.
Embedded violence: pirate wreckage POI at 1200, -900 appears only after player has destroyed 5+ pirate-class ships in sector; blocks shortest route to hidden cache.

## Reach Station (sector_io_reach / station_reach)
Physical alteration: external comms array lists two dishes with 0.8 m structural bends; reduces mission offer range by one sector.
Scarcity cost: contested flag on station increases all service prices 15 % while player holds positive reputation with faction_free.
Contradictory traversal: sector neighbor list includes Charon Expanse; jump graph edge weight is 0 (no direct connection).
Embedded violence: mercenary outpost POI at -500, -300 is hostile to player until one smuggling mission is completed; otherwise spawns three additional enemy ships on approach.
