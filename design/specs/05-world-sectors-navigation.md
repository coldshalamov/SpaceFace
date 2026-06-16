# World, Sectors & Navigation

## Summary
A 10-sector star-map graph forming a "core-to-frontier" gradient: security falls and wealth/danger rise as you travel outward from Helios Prime (core) through industrial mid-ring sectors to lawless frontier and a wormhole-gated endgame. Each sector is a self-contained 2.5D playfield (a finite XZ disc of radius worldRadius) populated from data: stations, asteroid fields, hazard zones, POIs, and spawn tables. Movement is two-layered: (1) in-system flight on the plane, fly to a sector's jump gate or charge a personal jump drive; (2) sector-to-sector JUMP that unloads the current sector and loads a neighbor, costing fuel + charge time, with an interdiction roll that can drop the player into an ambush. Sectors and POIs start as fog-of-war (UNKNOWN) and are revealed by jumping in (sector) or scanning/approaching (POIs). The system owns the world graph, the active sector's live contents, discovery flags, and jump state; it emits events that mining/combat/economy/spawning systems consume. All content is data-driven (SECTORS table + STATION_TYPES + HAZARD_TYPES), so adding a sector is pure data.

## Mechanics
- WORLD GRAPH: 10 sectors as nodes; edges are bidirectional jump links with a per-edge distance d (lightyears, ly) used for fuel + charge scaling. Graph is a connected mesh, not a line: core has 3 links, mid-ring forms a ring, frontier is sparse. One edge (Veil Nebula -> Ashfall Reach) is one-way-gated by a wormhole that unlocks only after a story/tech flag.
- SECTOR AS PLAYFIELD: when a sector is active, its contents instantiate inside a disc of radius worldRadius=4000 wu centered at origin. Player ship + camera always operate near origin-relative coordinates; only one sector is simulated at a time (others are dormant graph data). Leaving via jump despawns all entities and fires sector.exit.
- SECTOR TIERS: tier 0 (core, sec 0.95-1.0), tier 1 (inner ring, sec 0.6-0.8), tier 2 (mid frontier, sec 0.3-0.5), tier 3 (outer frontier, sec 0.05-0.25), tier 4 (endgame/hazard, sec 0.0-0.15 but huge reward). Tier drives every scaling formula below.
- IN-SYSTEM MOVEMENT: normal thruster flight (owned by Ship/Physics system) on the plane. To change sectors the player either (a) flies to a fixed JUMP GATE entity (large station-like ring at a known position per outbound edge) and activates it (no fuel, instant-ish, always available, but gates can be guarded/taxed in faction space), or (b) uses a personal JUMP DRIVE module to jump from any open-space point (costs fuel, needs charge, higher interdiction risk). Gates are the 'safe road'; drive is the 'shortcut'.
- JUMP DRIVE MODULE: a ship module (data in Modules subsystem) with tiers T1-T3. Jump requires: target be a graph neighbor of current sector AND discovered OR adjacent-known; ship not currently in 'combat lock' (no enemy within 600 wu firing in last 4 s) unless drive tier allows hot-jump; enough fuel; charge timer completes uninterrupted.
- JUMP SEQUENCE (state machine on GameState.jump): IDLE -> CHARGING (player picks target on map, charge timer runs, ship must keep moving < maxJumpSpeed and survive) -> JUMPING (brief blackout/tunnel VFX, ~1.2 s) -> arrive -> COOLDOWN. Taking heavy damage or being interdicted during CHARGING aborts to IDLE and refunds 50% fuel.
- FUEL: GameState.fuel (units), max from ship/tank module. Each jump costs fuelCost = ceil(baseFuel * edgeDist * tierFuelMult). Gates cost 0 fuel but may charge a credit toll in high-sec faction space. Refuel at any station with refuel service (price per unit varies by sector wealth). Running out of fuel in a sector with no station = stranded (distress-beacon mission hook).
- CHARGE & COOLDOWN: chargeTime = baseCharge * edgeDist / driveSpeedMult (gate jumps use fixed 3 s align time, no cooldown). After arrival, cooldown blocks re-jump for cooldownTime to prevent jump-spam escapes from combat.
- INTERDICTION: on JUMP via drive (not gate), roll interdiction chance = clamp(baseInterdict * (1 - sec_target) * trafficHostileFactor * (1 - driveStealth), 0, 0.6). On hit, player arrives in a small 'ambush pocket' of the target sector with 1-3 pirates already aggro at short range instead of the normal entry point. Gate jumps have ~0 interdiction in tier<=1, small in tier>=3 (gate-camping pirates).
- ENTRY POINTS: each inbound edge defines an entryPoint {x,z,heading} in the target sector (usually near that sector's gate to the previous sector). Arriving places ship there with small jitter. This makes the world feel spatially consistent: the gate you came through is behind you.
- DISCOVERY / FOG OF WAR: each sector has discovered:bool (false at start except home). Jumping INTO a sector sets discovered=true and reveals its node + its direct edges on the star map (you can 'see one hop ahead'). Undiscovered neighbors show as '??? ' nodes with unknown contents. POIs within a sector have discovered flags too; revealed by flying within scanRange or by a sector scan pulse.
- SECTOR SCAN: holding a scan action (or a Scanner module pulse) for 2 s reveals all stations + asteroid fields in the current sector immediately and marks POIs as 'detected (unidentified)' until approached within 400 wu. Hidden POIs (derelicts, caches) require closer approach or higher scanner tier.
- AMBIENT TRAFFIC: each sector has trafficDensity (NPC traders/civilians per minute target) and a traffic level. Spawning system reads this; navigation system just provides the number + spawn-edge positions (traffic enters/exits via gates). Higher in core, near zero in frontier.
- ENEMY SPAWNS: each sector has enemyDensity (0..1) and enemyLevelBand [min,max]. Combat/Spawn system consumes; navigation provides the per-sector table + 'spawn zones' (e.g., asteroid fields and gate approaches are higher-spawn). Patrol/police spawn scales with security.
- WEALTH/DANGER GRADIENT: wealthIndex and dangerIndex are derived per sector from tier + security; economy system reads wealthIndex to set price spreads and stock; combat reads dangerIndex. Core = low margins, low risk; frontier = high margins + rare commodities + high risk. This is the central progression pull.
- ROUTE PLANNING: star map can compute shortest path (by hops or by total fuel) between current and any discovered sector via Dijkstra over discovered edges. Returns ordered sector list + per-leg fuel/charge so the player can plan multi-jump runs. Auto-travel optionally executes legs sequentially (interruptible on interdiction/combat).
- HAZARD ZONES: in-sector circular regions (nebula = sensor/heat penalties + hidden pirates; asteroid-dense = collision + ambush; radiation = hull drain over time). Defined per sector as zones[] with {type,center,radius,intensity}; navigation tags entities inside, emits hazard.enter/exit for other systems to apply effects.
- SAVE/LOAD: navigation serializes discovery flags, current sector id, jump/fuel state, and per-sector dynamic deltas (e.g., depleted asteroid fields, station rep). Static SECTORS table is code/data, not saved; only the mutable overlay (discovered, depletion, visitedCount) is persisted.

## State Owned
- world.graph: object — static-ish loaded copy of SECTORS keyed by id; nodes + edges. Read by everyone, mutated only via discovery/depletion overlay.
- world.currentSectorId: string — id of the active/loaded sector.
- world.activeSector: object — live runtime instance of the current sector (instantiated entity handles: stations[], fields[], hazards[], pois[], gates[]). Rebuilt on each jump; not directly serialized.
- world.discovery: { [sectorId]: { discovered:bool, visitedCount:int, pois:{ [poiId]: {discovered, identified} }, fieldsDepleted:{ [fieldId]: number 0..1 } } } — fog-of-war + persistent per-sector deltas. Serialized.
- world.entryPoint: {x,z,heading} — where the player ship was placed on arrival this session.
- jump.state: 'IDLE'|'CHARGING'|'JUMPING'|'COOLDOWN' — jump state machine.
- jump.targetSectorId: string|null — selected jump destination.
- jump.via: 'gate'|'drive'|null — how the pending jump is being made.
- jump.chargeT: number (s) — elapsed charge time.
- jump.chargeNeeded: number (s) — required charge for current jump.
- jump.cooldownT: number (s) — remaining cooldown.
- fuel.current: number (units) — current jump fuel.
- fuel.max: number (units) — fuel capacity from tank/ship module.
- nav.route: { legs:[{from,to,fuel,charge,interdict}], totalFuel, totalHops } | null — last computed route for the map UI.
- nav.autoTravel: bool — whether multi-leg auto-jump is engaged.

## Content
- S0 Helios Prime | tier0 | sec 0.98 | faction Coalition | wealth 0.35 danger 0.05 | worldRadius 3500 | traffic HIGH(~18/min) enemyDensity 0.03 lvl[1,2] | stations: Helios Station(trade+shipyard+refuel+repair+missions), Coalition HQ(missions+repair) | fields: none(scenic only) | hazards: none | POIs: Tutorial Beacon, Memorial Array | gates -> S1,S2,S3
- S1 Ceres Belt | tier1 | sec 0.72 | faction Coalition | wealth 0.5 danger 0.2 | worldRadius 4200 | traffic MED(~10/min) enemyDensity 0.18 lvl[2,4] | stations: Ceres Refinery(trade+refuel+repair+ore-buy), Belt Outpost(trade+missions) | fields: 3 rich ore fields(iron,nickel,silicates) | hazards: 1 dense-asteroid zone | POIs: Abandoned Driller, Survey Cache | gates -> S0,S2,S4
- S2 Tethys Junction | tier1 | sec 0.65 | faction Coalition/Free-Traders | wealth 0.62 danger 0.25 | worldRadius 4000 | traffic HIGH(~14/min) enemyDensity 0.2 lvl[2,4] | stations: Tethys Trade Hub(trade+shipyard+refuel+repair+missions), Customs Gate(toll+scan) | fields: 1 modest field | hazards: none | POIs: Black Market Contact(hidden) | gates -> S0,S1,S3,S5
- S3 Vesta Forge | tier1 | sec 0.6 | faction Industrial Guild | wealth 0.7 danger 0.3 | worldRadius 4300 | traffic MED(~9/min) enemyDensity 0.25 lvl[3,5] | stations: Forge Foundry(trade+shipyard+repair+module-craft), Refuel Depot(refuel) | fields: 2 metal fields + 1 rare(titanium) | hazards: 1 radiation belt(slag) | POIs: Derelict Freighter | gates -> S0,S2,S6
- S4 Pallas Drift | tier2 | sec 0.42 | faction Free-Traders | wealth 0.85 danger 0.5 | worldRadius 4500 | traffic MED(~7/min) enemyDensity 0.4 lvl[4,7] | stations: Drift Market(trade+refuel+repair+missions), Smuggler Den(black-market+missions) | fields: 2 fields + 1 ice(volatiles) | hazards: 1 nebula(small) | POIs: Pirate Wreckage, Hidden Cache | gates -> S1,S5,S7
- S5 Io Reach | tier2 | sec 0.35 | faction Contested(Free/Pirate) | wealth 0.95 danger 0.6 | worldRadius 4600 | traffic LOW(~5/min) enemyDensity 0.5 lvl[5,8] | stations: Reach Station(trade+repair+refuel+missions, sometimes pirate-held) | fields: 2 rich fields(rare alloys) | hazards: 1 dense-asteroid + 1 nebula | POIs: Mercenary Outpost, Derelict Cruiser | gates -> S2,S4,S6,S8
- S6 Charon Expanse | tier2 | sec 0.3 | faction Industrial Guild(frontier) | wealth 1.0 danger 0.62 | worldRadius 4800 | traffic LOW(~4/min) enemyDensity 0.5 lvl[5,9] | stations: Expanse Refinery(ore-buy+refuel+repair) | fields: 3 deep fields(platinum, exotics) | hazards: 1 radiation + 1 dense-asteroid | POIs: Abandoned Mining Colony | gates -> S3,S5,S9
- S7 Pirate Haven (Sker) | tier3 | sec 0.08 | faction Pirate Clans | wealth 1.2 danger 0.85 | worldRadius 5000 | traffic NONE enemyDensity 0.7 lvl[7,11] | stations: Sker Bazaar(black-market+repair+refuel+merc-missions, hostile if low pirate-rep) | fields: 1 contested rich field | hazards: 2 dense-asteroid zones(ambush) | POIs: Bounty Wrecks, Stash Cache | gates -> S4,S8 (gate-camped)
- S8 Veil Nebula | tier3 | sec 0.12 | faction Unclaimed | wealth 1.3 danger 0.9 | worldRadius 5200 | traffic NONE enemyDensity 0.65 lvl[8,12] | stations: Research Station Veil(scan-tech+missions+repair, neutral) | fields: 1 exotic-gas field(volatiles+exotics) | hazards: MASSIVE nebula covers ~60% (sensor blackout, hidden hostiles) + radiation core | POIs: Anomaly Signal, Wormhole(gated) | gates -> S5,S7, and wormhole -> S9 (unlock via tech/story flag)
- S9 Ashfall Reach (endgame) | tier4 | sec 0.05 | faction Rogue AI/Boss | wealth 1.6 danger 1.0 | worldRadius 5500 | traffic NONE enemyDensity 0.8 lvl[10,15] | stations: none (or 1 ruined cache-station) | fields: 2 ultra-rich exotic fields(highest value/u in game) | hazards: radiation storm(moving) + dense debris + nebula patches | POIs: Boss Arena Signal, Ancient Vault(legendary loot) | gates -> S6 (one-way back) + wormhole from S8
- STATION_TYPES (services flags): trade, shipyard(buy/sell ships), module-craft, ore-buy(mining sell premium), refuel, repair, missions, black-market, scan-tech, toll. Each station = {id,type,name,services:[],pos:{x,z},faction,rep-gated:bool}.
- HAZARD_TYPES: dense-asteroid(collisionDmg, ambushChance+0.3), nebula(sensorRange*0.4, hideEnemies, heatBuildup), radiation(hullDrain hpPerSec scaled by intensity), debris(collisionDmg lower, salvage chance). Each zone={type,center:{x,z},radius,intensity 0..1}.
- POI_TYPES: derelict(salvage/loot, may have ambush), cache(credits/cargo, scan to find), beacon(lore/mission), wreck(bounty/salvage), anomaly(scan reward/event), wormhole(gated jump edge), colony(mission/lore). Each={id,type,pos,scanRange,reward,discovered,identified,gatedBy?}.
- JUMP DRIVE TIERS: T1 {baseCharge 8s, tierFuelMult 1.0, driveStealth 0.0, hotJump no}, T2 {baseCharge 5.5s, fuelMult 0.85, stealth 0.15, hotJump no}, T3 {baseCharge 3.5s, fuelMult 0.7, stealth 0.35, hotJump yes}. JUMP GATE: fixed 3s align, 0 fuel, 0 cooldown, near-0 interdiction in tier<=1.
- GLOBAL TUNING CONSTANTS: worldRadius default 4000 wu; baseFuel 4 units/ly; baseCharge 6 s; baseInterdict 0.35; cooldownTime 6 s; maxJumpSpeed 80 wu/s (must be below to keep charging via drive); scanRange 400 wu (POI auto-detect); sectorScanTime 2 s; edge distances d range 2-9 ly (core edges ~2-3, frontier edges ~6-9).

## Formulas
- fuelCost(edge,drive) = ceil(baseFuel * edge.d * drive.tierFuelMult)  // baseFuel=4 units/ly; gate jump = 0
- chargeNeeded(edge,drive,via) = via=='gate' ? 3.0 : drive.baseCharge * (edge.d / 4)  // normalize to a 4-ly reference leg
- cooldownTime(via) = via=='gate' ? 0 : 6.0  // seconds
- interdictChance(targetSector,via,drive,trafficHostile) = via=='gate' ? clamp(0.02 + 0.06*targetSector.tier - 0.10, 0, 0.15) : clamp(baseInterdict * (1 - targetSector.security) * (1 + 0.5*trafficHostile) * (1 - drive.driveStealth), 0, 0.6)  // baseInterdict=0.35
- ambushCount = via=='drive' && interdicted ? 1 + floor(rand()* (1 + targetSector.tier)) : 0  // 1..(2+tier) pirates
- wealthIndex(sector) = clamp(0.3 + 0.16*sector.tier + 0.10*(1 - sector.security), 0.3, 1.6)  // economy reads this for price spread/stock rarity
- dangerIndex(sector) = clamp(0.05 + 0.22*sector.tier + 0.25*(1 - sector.security), 0, 1.0)  // combat/spawn reads this
- enemyLevel(sector) = lerp(band.min, band.max, clamp(rand()*0.6 + 0.4*(1-sector.security),0,1))  // skews higher in low-sec
- priceSpreadPct(sector) ~ 4% + 10%*wealthIndex(sector)  // hint passed to economy: frontier = wider buy/sell margins
- refuelPricePerUnit(sector) = round(8 * (1 + 0.8*(1 - sector.security)))  // cr/unit; cheap in core, dear in frontier
- gateToll(sector) = sector.security > 0.6 ? round(50 + 200*sector.security) : 0  // high-sec customs toll, waived with faction rep
- routeFuel(path) = sum over legs of fuelCost(leg.edge, drive); routeCharge = sum chargeNeeded(...)  // Dijkstra weight = fuelCost (or 1 per hop for 'fewest jumps' mode)
- scanReveal(poi, shipPos, scannerTier) = dist(shipPos,poi.pos) <= poi.scanRange * (1 + 0.25*scannerTier) ? identify : detect-only
- hazardHullDrain(ship,zone) = zone.type=='radiation' ? zone.intensity * 6 * dt : 0  // hp/s; nebula sets sensorRange *= 0.4 while inside
- spawnInterval(sector) = 60 / max(trafficDensity_perMin, 0.01)  // seconds between ambient traffic spawns; navigation hands this to spawn system
- depletionRegen(field, dt) = field.depleted = max(0, field.depleted - regenRate*dt)  // regenRate ~ 0.01/min in core, ~0 in frontier (frontier fields stay mined out longer)

## Interactions
- EMITS sector.enter {sectorId, sector, entryPoint, firstVisit:bool} — spawn/economy/combat/audio init the new playfield; UI updates HUD sector name + security.
- EMITS sector.exit {sectorId} — all systems despawn/cleanup their sector-scoped entities before the load.
- EMITS jump.charge.start {targetSectorId, via, chargeNeeded} and jump.charge.tick {progress 0..1} and jump.charge.abort {reason} — UI shows charge bar; audio plays charge whine; combat may abort it.
- EMITS jump.execute {from, to, via} then jump.arrive {sectorId, interdicted:bool, ambushCount} — combat system spawns ambush pocket if interdicted.
- EMITS interdiction.triggered {sectorId, ambushCount, spawnPos} — combat/spawn places the ambush enemies.
- EMITS hazard.enter {entityId, zoneType, intensity} / hazard.exit {entityId, zoneType} — ship/combat apply hull drain, sensor penalty, heat; AI uses for stealth.
- EMITS poi.discovered {poiId, type} and poi.identified {poiId, type, reward} — mission/loot system resolves rewards; UI pings map.
- EMITS sector.discovered {sectorId} — star-map UI reveals node + one-hop edges; achievements/meta track exploration %.
- EMITS field.depleted.changed {fieldId, depleted} — mining system writes here when ore is extracted; navigation persists it in discovery overlay.
- EMITS fuel.changed {current,max} and fuel.empty {sectorId} — UI fuel gauge; fuel.empty triggers stranded/distress mission hook.
- LISTENS request.jump {targetSectorId, via} — from star-map UI click 'Jump' or auto-travel; validates (neighbor? discovered? combat-lock? fuel?) then starts charge or rejects with reason.
- LISTENS request.route {targetSectorId, mode:'fuel'|'hops'} — runs Dijkstra over discovered edges, writes nav.route, returns for map UI.
- LISTENS request.sectorScan {} — runs 2s scan, reveals stations/fields, detects POIs; emits poi.discovered for in-range ones.
- LISTENS combat.lock.changed {locked:bool} — feeds the 'can't jump while in combat (unless hotJump drive)' rule and aborts active charge.
- LISTENS module.equipped/unequipped {slot, module} — recompute jump drive tier, fuel.max (tank), scanner tier used by scan/POI reveal.
- READS GameState.ship.position each tick to test POI scan ranges, hazard-zone membership, gate-activation proximity, and maxJumpSpeed check during charge.
- WRITES (persisted) world.discovery overlay; economy reads wealthIndex/priceSpread, combat reads dangerIndex/enemyLevelBand, spawn reads trafficDensity/enemyDensity/spawnZones — all pulled from world.activeSector each tick or on sector.enter.

## UI Needs
- STAR MAP overlay: node-graph of sectors. Discovered nodes show name, security (color: green>0.6, amber 0.3-0.6, red<0.3), faction icon, station/field count, danger pips. Undiscovered direct-neighbors show as '???'. Edges drawn between nodes; current sector highlighted; player position marker.
- Route overlay on map: clicking a discovered sector draws the Dijkstra path, labels each leg with fuel + charge time + interdiction %, and shows total fuel/hops; 'Plot Route' and 'Auto-Travel' buttons. Disable/red if insufficient fuel or undiscovered.
- Jump panel: selected target name, via Gate vs Drive toggle (Drive disabled if no jump-drive module), fuelCost, chargeTime, cooldown, interdiction % readout, and a JUMP button with rejection-reason tooltip (e.g., 'Combat lock', 'Not a neighbor', 'Low fuel').
- Charge bar: animated 0..100% during CHARGING with abort feedback; cooldown radial timer after arrival.
- HUD sector strip: current sector name, security level + color, faction, danger index, fuel gauge (current/max) with low-fuel warning, and a compass arrow to the nearest jump gate / selected gate.
- In-system minimap (radar): shows stations, asteroid fields, hazard zones (tinted), gates, detected POIs (unidentified = '?'), enemies, ambient traffic, all within worldRadius; fog dims undiscovered POIs.
- Hazard indicator: on-screen edge tint + label when inside a hazard zone (radiation = hull-drain warning, nebula = 'sensors degraded').
- Scan UI: scan progress ring + 'Sector scanned' result toast listing revealed stations/fields and detected POI count.
- Discovery/notifications: toasts for 'New sector discovered: X', 'POI identified: Derelict Freighter', 'Wormhole unlocked'. An exploration % meter (sectors + POIs found) for the map screen.
- Station-approach prompt: when near a station, list its services (trade/shipyard/refuel/repair/missions/black-market) as dock options; gates show 'Activate Gate -> SectorName (toll: X cr)'.

## Risks
- 
