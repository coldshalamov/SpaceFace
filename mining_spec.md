# SpaceFace — Mining, Ores & Cargo subsystem spec

Owns asteroid extraction, the ~12 raw ore/material definitions, the unified cargo
container model (volume cap + mass), collectible pickups w/ magnet auto-collect,
wreck salvage, and station-side refining/crafting chains.

Derived early loop: starter hold 40u, beam 18 ore-HP/s. Small rock (120 HP -> 8u)
mines in 6.7s; fill hold in ~43s active; full raw value ~440cr; round trip ~2.7min
= ~160 cr/min raw. Metallic mid field ~22 cr/s while mining. Refining 2 iron ore
(24cr) -> 1 ingot (40cr) = +67% value and half the volume.
