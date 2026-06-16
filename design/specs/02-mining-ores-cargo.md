# Mining, Ores & Cargo

## Summary
This subsystem owns asteroid extraction, the raw ore/material registry (12+ entries), the unified cargo container (volume cap + derived mass), collectible pickups with magnet auto-collect, wreck salvage, and station-side refining/crafting chains. Ores are first-class commodities living in ONE shared cargo container (not a private ore bag), so the trade subsystem sells them through the same addCargo/removeCargo helpers and the cargo_changed event. Cargo capacity is a HARD cap in volume units (u) — 1 ore unit = 1 u except bulky gas/ice (vol>1); total mass (t) is DERIVED (sum of qty*mass_per_unit) and exported as a handling input the flight system consumes — mass is a penalty, never a second cap. The mining laser is a hardpoint-mounted beam (composes with weapons/hardpoint system): it must target an asteroid, deals ore-HP/s, and asteroids drop ore as physical collectible pickups (so combat looting/jettison/drones share one pickup path). The extraction routine is exposed as a callable applyMining(targetId, dps, dt) so mining-drone passive income can drive the EXACT same mechanic. Refining (raw ore -> refined metal -> ship components) runs at stations, marked optional/late-game; beam overheat is optional QoL. Derived early loop: starter hold 40u, beam 18 ore-HP/s, small common rock (120 HP -> 8u) mines in 6.7s, fill hold ~43s active, ~440 cr raw, ~2.7 min round trip = ~160 cr/min raw; metallic mid-field ~22 cr/s while mining; refining 2 iron ore (24cr) -> 1 ingot (40cr) = +67% value and half the volume.

## Mechanics
- Mining beam is a hardpoint module with type:'mining'. Must have an asteroid soft-locked as target (TAB cycles; must be in range and roughly in front). Hold-to-fire continuous beam, no projectile.
- Beam range 240 wu / DPS-to-ore 18 ore-HP/s (tier-1). Damage applies ONLY to asteroids (no hull damage to ships) so it cannot be used as a weapon.
- Each asteroid has oreHP; applyMining subtracts effectiveDps*dt. Ore ejects each time cumulative oreHP loss crosses a 25% threshold, plus a final burst on destruction — so partial mining is rewarded and players can break off early.
- Default extraction = 'ejected pickups': ore spawns as floating collectible meshes drifting outward, then drawn in by the ship magnet. A late-game module flag directToCargo bypasses pickups, crediting cargo instantly with a small (+8%) efficiency bonus.
- Yield composition: each ejection rolls the asteroid type's weighted oreYield table; only ores with ore.tier <= asteroid.tierCap are eligible (weights renormalized), so rarer ores need higher-tier asteroids/sectors.
- Overheat (OPTIONAL): beam heat 0-100, +heatRate/s firing, -coolRate/s idle. At 100 force-cools, locked until <=40. Tier-1 12/s up, 20/s down => ~8.3s continuous before lockout; upgradable. Drones never overheat.
- Pickups carry {commodityId, qty}. Within magnetRange they accelerate toward the ship; on contact call addCargo. If cargo full the pickup is rejected (stays floating, red edge-pulse) and emits cargo_full.
- Cargo container is ONE object shared with trade/salvage/drones. addCargo(id,qty) clamps to remaining volume and RETURNS accepted amount so callers handle overflow; removeCargo for selling/refining/jettison.
- Mass recomputed on every cargo change and written to cargoMassT; flight reads it for accel/turn handling. Volume is the only hard cap.
- Salvage: on ship_destroyed combat spawns a wreck. Player holds the mining beam/tractor on the wreck which drains its salvagePool over salvageTime into pickups/cargo, then despawns. Wrecks also drop a guaranteed pickup burst.
- Jettison: player can dump cargo (hotkey/context menu) to free volume; jettisoned cargo spawns as recoverable pickups and emits cargo_changed.
- Refining (station, OPTIONAL): convert raw ore -> refined metal -> components via refineRecipes; consumes input cargo, produces output cargo, charges a fee. Refined goods have higher value/volume ratio (volume compression) so they are the smart haul from poor sectors.
- Asteroid fields generated per-sector from fieldParams (density, type weights, size distribution, tier cap, respawn). Mined-out asteroids respawn after a cooldown so fields are renewable but not instant-farm.

## State Owned
- cargo: { [commodityId: string]: number } — unified hold contents in units (u). Shared with trade/salvage/drones.
- cargoCapacityU: number — hard volume cap in u (ship-derived; starter 40).
- cargoUsedU: number — cached sum(qty*volPerUnit) for HUD; recomputed on change.
- cargoMassT: number — cached sum(qty*massPerUnit) in tonnes; consumed by flight as handling input.
- miningBeam: { tierId, range, dps, heat, heatRate, coolRate, overheated:boolean, directToCargo:boolean } — active mining hardpoint runtime state.
- magnetRange: number — auto-collect radius in wu (ship-derived; starter 90).
- asteroids: { [id]: { id, typeId, tier, pos:{x,z}, oreHP, oreHPMax, size, pctEjected, respawnAt:number|null } } — live asteroid entities in current sector.
- pickups: { [id]: { id, commodityId, qty, pos:{x,z}, vel:{x,z}, ttl } } — floating collectibles (mining ejecta, wreck/jettison drops).
- wrecks: { [id]: { id, pos:{x,z}, salvagePool:{[commodityId]:number}, salvageTimeLeft } } — salvageable hulks.
- oreRegistry: static data (owned here) — the 12+ raw/refined material defs (mass, volume, baseValue, tier, tags).
- refineRecipes: static data (owned here) — conversion chains.
- fieldParams: static data (owned here, keyed per sectorTier) — field-generation parameters.

## Content
- ORE rock_silicate | mass 0.6 t/u | vol 1.0 u/u | base 4 cr/u | tier 0 | from common_rock | grey dull low-spec
- ORE ore_iron | mass 0.8 | vol 1.0 | base 12 | tier 0 | from rock/metallic | reddish veins
- ORE ore_copper | mass 0.9 | vol 1.0 | base 18 | tier 1 | from metallic | orange flecks
- ORE ore_titanium | mass 0.7 | vol 1.0 | base 34 | tier 2 | from metallic | silver-white sheen
- ORE ice_water | mass 0.5 | vol 1.4 | base 6 | tier 0 | from icy | bulky translucent blue
- ORE ice_volatiles | mass 0.5 | vol 1.4 | base 16 | tier 1 | from icy | frosted teal
- ORE gas_hydrogen | mass 0.1 | vol 2.5 | base 9 | tier 0 | from gas_cloud | very bulky low mass
- ORE gas_helium3 | mass 0.1 | vol 2.5 | base 40 | tier 2 | from gas_cloud | pale glow valuable
- ORE crystal_silica | mass 1.1 | vol 1.0 | base 30 | tier 1 | from crystalline | faceted clear
- ORE crystal_lumin | mass 1.0 | vol 1.0 | base 70 | tier 2 | from crystalline | emissive violet glow
- ORE ore_platinoid | mass 1.4 | vol 1.0 | base 110 | tier 3 | from rare_exotic | dark dense metallic
- ORE exotic_xenium | mass 1.2 | vol 1.0 | base 260 | tier 4 | from exotic only | animated shader pulse
- REFINED metal_iron_ingot | mass 0.7 | vol 0.5 | base 40 | tier 1 | refined output
- REFINED metal_ti_alloy | mass 0.6 | vol 0.5 | base 120 | tier 2 | refined output
- CRAFTED comp_hullplate | mass 1.0 | vol 0.6 | base 220 | tier 2 | ship component
- CRAFTED comp_circuitry | mass 0.3 | vol 0.4 | base 300 | tier 3 | ship component
- SALVAGE scrap_metal | mass 0.9 | vol 1.0 | base 8 | tier 0 | from wrecks
- SALVAGE salvage_electronics | mass 0.4 | vol 0.6 | base 55 | tier 1 | from wrecks
- ASTEROID common_rock | oreHP 120(small)/520(large) | yield 8u small | spawn weight 45 | size 6-14 wu | tierCap 0 | table {rock_silicate 0.7, ore_iron 0.3} | grey lumpy icosphere
- ASTEROID metallic | oreHP 320/900 | yield 14u | weight 22 | size 7-16 | tierCap 2 | {ore_iron 0.45, ore_copper 0.35, ore_titanium 0.20} | dark rock metallic specular veins
- ASTEROID icy | oreHP 180/640 | yield 12u | weight 14 | size 8-18 | tierCap 1 | {ice_water 0.75, ice_volatiles 0.25} | translucent blue emissive rim
- ASTEROID crystalline | oreHP 260/720 | yield 9u | weight 9 | size 5-12 | tierCap 2 | {crystal_silica 0.7, crystal_lumin 0.3} | sharp emissive crystal cluster
- ASTEROID gas_cloud | oreHP 90/300 | yield 16u | weight 7 | size 14-30 | tierCap 2 | {gas_hydrogen 0.75, gas_helium3 0.25} | soft additive billboard puff no hard mesh
- ASTEROID rare_exotic | oreHP 480/1200 | yield 7u | weight 3 | size 6-13 | tierCap 4 | {ore_platinoid 0.6, crystal_lumin 0.25, exotic_xenium 0.15} | dark dense rock slow xenium glow
- BEAM beam_mk1 | range 240 wu | dps 18 ore-HP/s | heatRate 12/s | coolRate 20/s | directToCargo no | price 0 (starter)
- BEAM beam_mk2 | range 300 | dps 30 | heat 10/s | cool 24/s | direct no | price 4200
- BEAM beam_mk3 | range 360 | dps 48 | heat 8/s | cool 30/s | direct no | price 14000
- BEAM beam_industrial | range 420 | dps 70 | heat 6/s | cool 40/s | direct YES | price 46000
- RECIPE refine_iron | 2 ore_iron -> 1 metal_iron_ingot | fee 6 cr | 8s | station tier1
- RECIPE refine_titanium | 3 ore_titanium + 1 metal_iron_ingot -> 1 metal_ti_alloy | fee 20 | 14s | tier2
- RECIPE craft_hullplate | 2 metal_iron_ingot + 1 metal_ti_alloy -> 1 comp_hullplate | fee 40 | 20s | tier2
- RECIPE craft_circuitry | 2 crystal_lumin + 1 salvage_electronics + 1 ore_copper -> 1 comp_circuitry | fee 60 | 25s | tier3
- HOLD starter_scout | capacity 40u | magnetRange 90 wu
- HOLD hauler_light | capacity 120u | magnet 110 wu
- HOLD hauler_heavy | capacity 320u | magnet 140 wu
- HOLD industrial_rig | capacity 600u | magnet 180 wu
- FIELD core_safe T0 | astCount 60 | weights {common_rock 60, metallic 25, icy 15} | tierCap 1 | respawn 90s | clusterRadius 350 wu
- FIELD frontier T1 | count 90 | {common_rock 40, metallic 25, icy 15, crystalline 15, gas_cloud 5} | tierCap 2 | respawn 120s | cluster 450
- FIELD deep_belt T2 | count 130 | default weights | tierCap 3 | respawn 150s | cluster 550
- FIELD exotic_reach T3 | count 110 | {metallic 25, crystalline 25, gas_cloud 15, rare_exotic 20, common_rock 15} | tierCap 4 | respawn 200s | cluster 600

## Formulas
- effectiveDps = beam.dps * (asteroid.softnessMult ?? 1) * (directToCargo ? 1.08 : 1)
- oreHP_after = max(0, oreHP - effectiveDps * dt)
- ejectionTrigger: fires each time cumulative oreHP lost crosses a 25% threshold (pctEjected step), plus a final burst on destruction
- ejectedUnits(event) = round(oreYield_total * 0.25); final event flushes the remainder
- yieldRoll: per ejected unit pick commodityId via weighted table, including only ores where ore.tier <= asteroid.tierCap (renormalize weights)
- size->oreHP: oreHP = lerp(HP_small, HP_large, (size - sizeMin)/(sizeMax - sizeMin)); oreYield scales identically
- cargoUsedU = sum over id of cargo[id] * volPerUnit[id]
- cargoMassT = sum over id of cargo[id] * massPerUnit[id]
- addCargo(id,q): accepted = min(q, floor((cargoCapacityU - cargoUsedU) / volPerUnit[id])); cargo[id]+=accepted; recompute caches; emit cargo_changed; return accepted
- handling (consumed by flight): accelMult = thrust / (hullMassT + cargoMassT) (floored at 0.25); turnMult = baseTurn * hullMassT / (hullMassT + cargoMassT). Mass is a penalty only, never blocks movement
- magnet pull: if dist(ship,pickup) <= magnetRange then pickup.vel += normalize(ship-pickup) * magnetAccel(180 wu/s^2) * dt, capped at magnetMaxSpeed(140 wu/s); collect when dist <= ship.radius+4
- overheat: heat += (firing ? heatRate : -coolRate) * dt clamp 0-100; if heat>=100 overheated=true; clears when heat<=40
- refine: requires all inputs present; on complete removeCargo(inputs), charge fee, addCargo(output); if output volume does not fit, job blocks and emits cargo_full
- field gen (on sector enter): for i in 0..astCount: typeId=weightedPick(typeWeights); tier=rand(0..min(type.tierCap, sector.tierCap)); size=rand(sizeMin,sizeMax); pos=clusterScatter(clusterRadius); oreHP from size scaling. Uses seeded RNG for determinism
- respawn: on destroy set respawnAt = now + respawnSec; each tick if now >= respawnAt and pop < astCount, respawn at fresh cluster position
- salvageYield(dt): drain salvagePool proportionally over salvageTime; convert drained amounts to pickups or direct cargo

## Interactions
- emits cargo_changed {cargo, usedU, massT} -> read by Trade (sell screen), Flight (handling), HUD, Save. Single funnel for ALL cargo mutation
- emits cargo_full {commodityId} -> read by HUD (warning toast) when a pickup/refine is rejected
- emits asteroid_destroyed {id, typeId, pos} -> read by Audio (procedural crack SFX), VFX (debris burst), Missions ('mine N asteroids')
- emits ore_mined {commodityId, qty} -> read by Missions/Achievements, stats tracker
- emits pickup_collected {commodityId, qty} -> read by Audio (collect blip), HUD
- emits beam_overheated {} / beam_ready {} -> read by HUD beam-heat bar, Audio
- emits salvage_completed {wreckId, loot} -> read by Missions, HUD
- handles ship_destroyed {id, pos, lootTable} (from Combat) -> spawns a wreck in wrecks
- handles sector_entered {sectorId} (from World/Map) -> runs field gen from fieldParams, clears old asteroids/pickups/wrecks
- handles fire_mining_beam {targetId, on} (from Input/Weapons) -> drives applyMining
- handles refine_request {recipeId} (from Station UI) -> runs refine recipe if at qualifying station
- handles jettison_request {commodityId, qty} -> removeCargo + spawn pickups
- exposes callable applyMining(targetId, dps, dt) -> consumed by Mining-Drone subsystem (passive income) to run identical extraction without the player beam
- exposes callables addCargo/removeCargo/getCargoMass/getCargoVolume -> consumed by Trade, Salvage, Drones, Save
- reads ship stats (cargoCapacityU, magnetRange, hardpoints, hullMassT) from Ship/Module subsystem each tick (it owns outfitting; this subsystem only reads derived numbers)

## UI Needs
- HUD cargo bar: usedU / capacityU with fill %, plus secondary mass readout (massT) tinting toward red as handling penalty rises
- HUD target reticle on soft-locked asteroid: typeId, oreHP bar, tierCap, and 'out of range' state when too far
- HUD mining beam heat bar (only when overheat module present); flashes on beam_overheated
- HUD floating '+Nu <oreName>' pickup toasts on pickup_collected; 'CARGO FULL' warning on cargo_full
- HUD magnet-range subtle ring indicator (toggleable) so players learn the auto-collect radius
- Cargo panel (menu): per-commodity rows (color swatch, name, qty, volume used, mass, unit value, total value), with Jettison and Sell-here actions, sortable by value/volume
- Station Refinery panel: list refineRecipes available at this station tier, input/output preview, fee, time, 'Refine x1 / xMax' buttons; greys out recipes lacking inputs
- Salvage prompt: on-screen 'Hold [F] to salvage' near a wreck, with a salvage progress bar
- Map/scanner: asteroid-field density and dominant-ore hint per sector (composes with Map subsystem data)

## Risks
- Cargo container must be the single source of truth shared with Trade/Salvage/Drones; if any system writes cargo directly instead of via addCargo/removeCargo, cargoMassT/cargoUsedU caches desync and flight handling breaks. Enforce helper-only mutation.
- Mass-as-handling-only (not a second cap) must be honored by Flight or heavy cargo soft-locks the ship; accelMult is floored at 0.25 so an overloaded hold is slow, never immobile.
- Pickup entity count can explode in dense fields (every 25% ejection x many asteroids). Pool pickups, cap concurrent count (~200), and merge same-commodity pickups within a small radius.
- Refining volume compression can be exploited (refine to shrink) but output must still fit — block refine jobs whose output won't fit and surface clearly, else silent cargo loss.
- Exotic/rare yields gated by tierCap: ensure weight renormalization when filtering ore tables, or low-tier sectors roll nulls and drop nothing.
- Determinism: field gen and yield rolls must use the seeded RNG from GameState (not Math.random) so saves/loads and sector revisits are reproducible.
- Gas/ice bulky volume (vol>1) interacts with the volume cap — HUD must show VOLUME not unit count, or players miscount capacity.
- Overheat + drones: drones must bypass the heat model or they stall passive income; keep heat on the player beam runtime only.
