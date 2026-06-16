# Ships, Modules & Tech Tree (progression)

## Summary
Data-driven ship/module/research progression spanning 6 tiers (T0 starter -> T5 capital). 13 ships defined by role with hull/shield/cargo/mass/handling/energy + a typed-and-sized slot grid (weapon/shield/engine/cargo/mining/utility x S/M/L). 35 modules/weapons fill those slots; every ship is viable in its lane with no dead tier (effective power ~2.3x per tier, price ~3x per tier so upgrades always feel earned). Shipyard handles buy/sell ships & modules with 50% sell-back, hot-swapping fittings (cargo must fit before downsizing), and a per-station stock list. A tech tree of 28 nodes gated by credits + research points (RP earned from scanning/missions/kills, owned by another system) unlocks module access, ship-tier purchase rights, drone tiers, and global efficiency bonuses. All ship/module/tech definitions are plain data in GameState.content; the runtime computes a ship's derived stats by folding equipped module modifiers over the hull base, and re-emits ship:statsChanged so combat, movement, cargo, mining and economy systems read one canonical stat block. Composes purely through GameState fields + event bus; this system owns hull/fitting/research state and exposes getDerivedStats(state) as the single source of truth other systems consume.

## Mechanics
- TIER MODEL: 6 tiers T0..T5. Each ship has tier, role, and a slot grid. Power curve target: effectivePower ~= 100 * 2.3^tier; ship hull price ~= base * 3^tier. No tier is skippable and each role appears at >=2 tiers so a player in any lane always has a next buy.
- SLOT SYSTEM: 6 slot types (weapon, shield, engine, cargo, mining, utility) x 3 sizes (S=1,M=2,L=3 capacity-points). A module declares slotType + minSize; it fits a slot if slot.type==module.slotType AND slot.size>=module.minSize. Larger slots accept smaller modules (an L weapon slot fits S/M/L weapons) but a module gains no bonus from over-sizing. Engine slot is always exactly 1 per ship (mandatory thruster). Shield slot 0-2. Weapon slots are the role differentiator.
- FITTING RULES: a module may only occupy a slot of its own type. Cargo modules add cargo volume; if you try to unfit a cargo module or swap to a smaller hull while currentCargoUsed > newCapacity, the swap is blocked with event ui:toast (must jettison/sell first). Mass of equipped modules adds to hull mass and degrades handling/accel (see formulas). Energy draw of all active modules must be regenerated; if total continuous drain > energyRegen the ship still fits but weapons soft-cap their fire rate (handled by combat system reading energy).
- DERIVED STATS: getDerivedStats(ship) folds module modifiers over hull base. Order: (1) sum additive flats (hull+, shield+, cargo+, energyCap+), (2) sum mass, (3) apply multiplicative efficiency bonuses from tech (e.g. shieldRegenMult), (4) recompute handling/accel/topSpeed from mass. Result cached on ship.derived and invalidated on any fit change; emits ship:statsChanged{shipId, derived}.
- SHIPYARD/OUTFITTING: station UI lists ships+modules in that station's stock (data-driven per station from economy system). Buy ship = pay price, new hull added to player.ownedShips, optionally set active; old fittings stay on old hull. Buy module = pay price, goes to player.moduleInventory (unequipped) or directly into a chosen empty/compatible slot. Sell ship/module returns floor(price * SELLBACK=0.5) adjusted by station priceMod. Swapping a fitted module to inventory is free; equipping from inventory is free. Active ship cannot be sold.
- RESEARCH/TECH TREE: 28 nodes. A node has {id, prereqs[], costCr, costRP, unlocks[]}. Player can research a node when all prereqs done, credits>=costCr, researchPoints>=costRP. On research: deduct, add id to player.researchedNodes, apply unlocks (flag module/ship buyable, raise drone tier cap, set a global efficiency multiplier). RP is a currency owned by missions/scan system; this system only spends it. Tech tree is a DAG with 4 branches: Combat, Industry (mining/cargo), Drives (speed/energy), Logistics (drones/outposts/trade).
- ACCESS GATING: a ship hull or module has optional requiresTech. Shipyard shows it greyed with 'Research X' until the unlocking node is in researchedNodes. This is how T3+ ships and top-tier weapons are paced behind the tree rather than pure credits.
- UPGRADE LOOP: starter Kestrel (T0) -> within T1 pick a lane (mining Pelican / fighter Wasp / trade Mule) -> T2 multirole/role ships -> T3 corvette/heavy hauler/gunship -> T4 cruiser-class -> T5 single capital Leviathan. Each step is affordable from the income of the prior step within ~20-40 min of active play.

## State Owned
- content.ships: ShipDef[] — static catalog (tier, role, hull, shield, cargo, mass, handling, energyCap, energyRegen, slots[], price, requiresTech?)
- content.modules: ModuleDef[] — static catalog (slotType, minSize, tier, stat modifiers, energyDraw, mass, price, requiresTech?)
- content.techNodes: TechNode[] — static DAG (id, branch, prereqs[], costCr, costRP, unlocks[])
- player.ownedShips: OwnedShip[] — { defId, fittings: (moduleInstanceId|null)[] parallel to slots, customName? }
- player.activeShipIndex: int — index into ownedShips; the flown ship
- player.moduleInventory: ModuleInstance[] — owned-but-unequipped modules { instanceId, defId }
- player.researchedNodes: string[] — ids of completed tech nodes
- player.droneTierCap: int (0..4) — max drone tier unlocked by tech (read by drone/passive-income system)
- player.efficiencyMods: { miningYieldMult, shieldRegenMult, energyRegenMult, cargoCapMult, tradeFeeMult, ... } — global multipliers set by tech, default 1.0
- ship.derived (transient, recomputed): { maxHull, maxShield, shieldRegen, cargoCap, mass, topSpeed, accel, turnRate, energyCap, energyRegen, weaponMounts[] } — canonical stat block other systems read

## Content
- SHIP T0 Kestrel (starter shuttle): hull 120, shield 40, cargo 25u, mass 18t, handling 1.0, energyCap 80, regen 12/s | slots: 1xS-weapon,1xS-shield,1xM-engine,1xS-cargo,1xS-utility | price 0 (start)/buyback 8000
- SHIP T1 Pelican (mining skiff): hull 180, shield 60, cargo 60u, mass 32t, handling 0.8, eCap 110, regen 16 | 1xS-wpn,1xS-shield,1xM-engine,1xM-cargo,2xM-mining,1xS-util | price 22000
- SHIP T1 Wasp (light fighter): hull 150, shield 110, cargo 15u, mass 16t, handling 1.4, eCap 140, regen 22 | 2xS-wpn,1xM-shield,1xM-engine,1xS-util | price 28000; requiresTech combat_basics
- SHIP T1 Mule (light freighter): hull 200, shield 70, cargo 140u, mass 55t, handling 0.6, eCap 100, regen 14 | 1xS-wpn,1xM-shield,1xM-engine,3xM-cargo,1xS-util | price 35000
- SHIP T2 Drifter (multirole): hull 320, shield 180, cargo 90u, mass 48t, handling 1.0, eCap 200, regen 28 | 2xM-wpn,1xM-shield,1xM-engine,2xM-cargo,1xM-mining,2xM-util | price 95000
- SHIP T2 Hornet (interceptor): hull 260, shield 240, cargo 20u, mass 24t, handling 1.7, eCap 260, regen 38 | 3xM-wpn,1xM-shield,1xL-engine,2xS-util | price 110000; requiresTech strike_craft
- SHIP T2 Ironback (mining barge): hull 480, shield 160, cargo 200u, mass 90t, handling 0.5, eCap 240, regen 26 | 1xM-wpn,2xM-shield,1xM-engine,3xM-cargo,4xL-mining,2xM-util | price 130000; requiresTech industrial_mining
- SHIP T3 Bastion (corvette): hull 640, shield 460, cargo 70u, mass 80t, handling 1.1, eCap 420, regen 52 | 3xL-wpn,2xL-shield,1xL-engine,1xM-cargo,3xM-util | price 320000; requiresTech warship_license
- SHIP T3 Atlas (heavy hauler): hull 720, shield 300, cargo 480u, mass 200t, handling 0.45, eCap 360, regen 40 | 2xM-wpn,2xL-shield,1xL-engine,6xL-cargo,3xM-util | price 380000; requiresTech bulk_logistics
- SHIP T3 Ranger (explorer): hull 480, shield 380, cargo 110u, mass 60t, handling 1.3, eCap 500, regen 64 | 2xM-wpn,2xM-shield,1xL-engine,2xM-cargo,4xL-util | price 290000; requiresTech long_range_survey
- SHIP T4 Warden (gunship): hull 1100, shield 820, cargo 90u, mass 150t, handling 0.95, eCap 720, regen 84 | 4xL-wpn,3xL-shield,1xL-engine,1xM-cargo,4xL-util | price 950000; requiresTech capital_weapons
- SHIP T4 Colossus (battlecruiser): hull 1600, shield 1100, cargo 200u, mass 300t, handling 0.7, eCap 900, regen 100 | 5xL-wpn,4xL-shield,1xL-engine,2xL-cargo,5xL-util | price 1400000; requiresTech capital_hulls
- SHIP T5 Leviathan (capital flagship): hull 3200, shield 2600, cargo 350u, mass 600t, handling 0.6, eCap 1600, regen 160 | 7xL-wpn,5xL-shield,1xL-engine,3xL-cargo,8xL-util | price 4500000; requiresTech flagship_command
- WEAPON Pulse Laser S: dmg 8, rof 4/s (DPS32), energy 3/shot, mass 2, range 600, tier 1, price 4500
- WEAPON Autocannon S: dmg 14, rof 2.2/s (DPS31), energy 1.5/shot, mass 4, range 520, tier 1, price 5200
- WEAPON Burst Laser M: dmg 12, rof 6/s (DPS72), energy 4/shot, mass 5, range 680, tier 2, price 16000; requiresTech beam_focusing
- WEAPON Railgun M: dmg 60, rof 0.8/s (DPS48), energy 14/shot, mass 9, range 1100, tier 2, price 21000; requiresTech kinetic_drivers
- WEAPON Plasma Cannon M: dmg 34, rof 3/s (DPS102) splash 30wu, energy 9/shot, mass 8, range 600, tier 3, price 42000; requiresTech plasma_dynamics
- WEAPON Missile Rack M: dmg 90 homing, rof 0.6/s (DPS54), energy 6/shot, ammo, mass 7, range 1400, tier 2, price 24000; requiresTech guided_ordnance
- WEAPON Heavy Beam L: dmg 160 sustained/s, energy 22/s, mass 16, range 900, tier 4, price 130000; requiresTech capital_weapons
- WEAPON Siege Lance L: dmg 420, rof 0.5/s (DPS210), energy 40/shot, mass 24, range 1600, tier 5, price 310000; requiresTech flagship_command
- SHIELD Booster S: +60 shield, +2 regen/s, energy 2/s, mass 3, tier 1, price 6000
- SHIELD Capacitor M: +180 shield, +6 regen/s, energy 4/s, mass 6, tier 2, price 19000; requiresTech deflector_theory
- SHIELD Aegis L: +520 shield, +14 regen/s, energy 9/s, mass 14, tier 4, price 95000; requiresTech hardened_deflectors
- ENGINE Ion Thruster M: topSpeed 70wu/s, accel x1.0, turn x1.0, energy 4/s, mass 6, tier 1, price 7000
- ENGINE Fusion Drive M: topSpeed 95, accel x1.3, turn x1.15, energy 7/s, mass 9, tier 2, price 24000; requiresTech drive_tuning
- ENGINE Warp Coil L: topSpeed 130, accel x1.6, turn x1.25, energy 12/s, mass 18, tier 3, price 70000; requiresTech graviton_drives
- CARGO Pod M: +50u cargo, mass 4, tier 1, price 5000
- CARGO Hold Expander L: +160u cargo, mass 12, tier 2, price 18000; requiresTech bulk_logistics
- CARGO Compactor L: +110u cargo +15% cargoCapMult on hull, mass 8, tier 3, price 46000; requiresTech matter_compression
- MINING Laser S: 6 yield/s, energy 4/s, mass 3, range 240, tier 1, price 8000
- MINING Beam M: 16 yield/s, energy 8/s, mass 6, range 300, tier 2, price 22000; requiresTech focused_extraction
- MINING Pulverizer L: 40 yield/s + 10% rare-ore chance, energy 16/s, mass 13, range 360, tier 3, price 64000; requiresTech deep_core_mining
- UTIL Cargo Scanner S: reveals cargo/ore composition, energy 1/s, mass 1, tier 1, price 4000
- UTIL Shield Hardener M: +12% incoming-dmg reduction, energy 5/s, mass 5, tier 2, price 20000; requiresTech deflector_theory
- UTIL Afterburner M: +40% topSpeed burst 4s/12s cd, energy 10/s burst, mass 5, tier 2, price 17000; requiresTech drive_tuning
- UTIL Repair Nanobots M: +4 hull/s out of combat, energy 3/s, mass 6, tier 3, price 38000; requiresTech nanofabrication
- UTIL Drone Bay L: deploys 1 combat/mining drone of player.droneTierCap, mass 14, tier 3, price 80000; requiresTech drone_control
- UTIL Tractor Beam M: auto-collects pickups in 400wu, energy 3/s, mass 4, tier 2, price 12000; requiresTech tractor_systems
- UTIL Targeting Computer M: +15% weapon range +8% dmg, energy 4/s, mass 4, tier 3, price 40000; requiresTech fire_control
- UTIL Sensor Array L: +60% radar range, scan yields +RP, energy 5/s, mass 8, tier 3, price 36000; requiresTech long_range_survey
- TECH combat_basics: branch Combat, prereq none, 6000cr+10RP, unlocks Wasp + Autocannon/PulseLaser fully
- TECH strike_craft: prereq combat_basics, 30000cr+40RP, unlocks Hornet
- TECH warship_license: prereq strike_craft, 120000cr+120RP, unlocks Bastion
- TECH capital_weapons: prereq warship_license+fire_control, 600000cr+400RP, unlocks Warden + Heavy Beam L
- TECH capital_hulls: prereq capital_weapons, 900000cr+600RP, unlocks Colossus
- TECH flagship_command: prereq capital_hulls+graviton_drives, 2500000cr+1200RP, unlocks Leviathan + Siege Lance
- TECH beam_focusing: branch Combat, prereq combat_basics, 18000cr+30RP, unlocks Burst Laser M
- TECH kinetic_drivers: prereq combat_basics, 22000cr+35RP, unlocks Railgun M
- TECH plasma_dynamics: prereq kinetic_drivers+beam_focusing, 90000cr+150RP, unlocks Plasma Cannon M
- TECH guided_ordnance: prereq combat_basics, 26000cr+45RP, unlocks Missile Rack M
- TECH fire_control: prereq strike_craft, 80000cr+110RP, unlocks Targeting Computer M
- TECH deflector_theory: branch Combat, prereq none, 12000cr+20RP, unlocks Capacitor M + Shield Hardener M
- TECH hardened_deflectors: prereq deflector_theory, 100000cr+140RP, unlocks Aegis L +5% shieldRegenMult
- TECH industrial_mining: branch Industry, prereq none, 25000cr+30RP, unlocks Ironback + Mining Beam M
- TECH focused_extraction: prereq industrial_mining, 30000cr+40RP, unlocks Mining Beam M (alt), +10% miningYieldMult
- TECH deep_core_mining: prereq focused_extraction, 110000cr+160RP, unlocks Pulverizer L, +15% miningYieldMult
- TECH matter_compression: prereq bulk_logistics, 90000cr+130RP, unlocks Cargo Compactor L
- TECH bulk_logistics: branch Industry, prereq none, 20000cr+25RP, unlocks Mule(already)/Atlas + Hold Expander L
- TECH drive_tuning: branch Drives, prereq none, 15000cr+20RP, unlocks Fusion Drive M + Afterburner M
- TECH graviton_drives: prereq drive_tuning, 95000cr+150RP, unlocks Warp Coil L, +8% energyRegenMult
- TECH long_range_survey: branch Drives, prereq drive_tuning, 60000cr+90RP, unlocks Ranger + Sensor Array L
- TECH tractor_systems: branch Logistics, prereq none, 10000cr+15RP, unlocks Tractor Beam M
- TECH drone_control: branch Logistics, prereq tractor_systems, 70000cr+100RP, unlocks Drone Bay L + droneTierCap=1
- TECH drone_swarm: prereq drone_control, 200000cr+260RP, droneTierCap=2 +1 extra drone per bay
- TECH autonomous_fleets: prereq drone_swarm, 500000cr+500RP, droneTierCap=3 + NPC-trader hiring
- TECH nanofabrication: branch Logistics, prereq drone_control, 140000cr+180RP, unlocks Repair Nanobots M
- TECH outpost_charter: prereq autonomous_fleets, 800000cr+700RP, unlocks player-owned outpost construction, droneTierCap=4

## Formulas
- fits(slot,module) = slot.type===module.slotType && slot.size >= module.minSize
- maxHull = hull.base + Σ moduleHullFlat
- maxShield = (hull.shield + Σ shieldFlat) ; shieldRegen = (hull.baseShieldRegen + Σ shieldRegenFlat) * player.efficiencyMods.shieldRegenMult
- cargoCap = floor((hull.cargo + Σ cargoFlat) * (1 + Σ cargoCapPct) * player.efficiencyMods.cargoCapMult)
- totalMass = hull.mass + Σ moduleMass
- massRatio = totalMass / hull.mass
- topSpeed = engine.topSpeed * (2 / (1 + massRatio))  // mass over hull baseline cuts speed, ratio 1.0 => full speed
- accel = engine.topSpeed * engine.accelMult * hull.handling * (1.5 / (0.5 + massRatio))
- turnRate = BASE_TURN(2.4 rad/s) * engine.turnMult * hull.handling * (1.4 / (0.4 + massRatio))
- energyRegen = (hull.baseRegen) * player.efficiencyMods.energyRegenMult ; continuousDrain = Σ module.energyDraw(active); sustainable iff energyRegen >= continuousDrain
- weaponDPS_effective = Σ over weapons of (dmg*rof) ; gated by energy: if shotEnergy*rof summed > energyRegen+capBuffer, combat system throttles fire
- effectivePower (balance metric, not runtime) = 0.5*maxHull + 0.7*maxShield + 6*weaponDPS_effective + 2*topSpeed ; target ≈ 100*2.3^tier
- incomingDamageReduction = 1 - Π(1 - hardenerPct_i)  // multiplicative stacking of Shield Hardener/util
- sellValue = floor(def.price * 0.5 * station.priceMod)
- researchable(node) = node.prereqs ⊆ player.researchedNodes && credits>=node.costCr && researchPoints>=node.costRP
- droneCount(ship) = (#DroneBay slots) * (1 + (drone_swarm researched?1:0)) ; each drone uses min(droneTierCap, bayTier)

## Interactions
- EMITS ship:statsChanged {shipId, derived} — after any fit/buy/sell/research; combat, movement, cargo, mining, HUD all re-read ship.derived
- EMITS ship:purchased {defId, price} and ship:sold {defId, refund} — economy system applies credit delta (or this system calls a shared spendCredits/addCredits helper); minimap/fleet UI refresh
- EMITS module:equipped {shipId, slotIndex, defId} / module:unequipped — drone, mining, weapon systems rebind their active module lists
- EMITS tech:researched {nodeId, unlocks} — drone system reads droneTierCap, economy reads tradeFeeMult, outpost system reads outpost_charter, shipyard refreshes greyed items
- EMITS ship:cargoCapChanged {shipId, cargoCap} — cargo/trade system clamps currentCargoUsed and rejects swap if it would overflow (handshake: cargo system can veto via returning needed-space, this system aborts swap and emits ui:toast)
- LISTENS economy:stationStock {stationId, ships[], modules[]} — shipyard UI shows only in-stock + tech-unlocked items; LISTENS player:creditsChanged to enable/disable buy buttons
- LISTENS research:pointsChanged {researchPoints} — tech tree UI updates affordability; RP currency is OWNED by mission/scan system, this system only reads+spends via tech:researched
- LISTENS combat:shipDestroyed {shipId} — if player active ship destroyed, respawn logic (handled by core) reads ownedShips for fallback hull; modules on destroyed hull lost per insurance rule (core decides)
- READS player.efficiencyMods (written only here via tech) — mining/shield/energy/cargo/trade systems multiply their base values by these
- WRITES player.droneTierCap (via tech) — drone/passive-income system reads it as the cap for deployable drone tier
- PROVIDES getDerivedStats(state, shipIndex?) as exported pure fn — single source of truth; movement/combat/HUD import it rather than recomputing, ensuring deterministic fixed-timestep sim

## UI Needs
- Shipyard panel: grid of purchasable ships (icon from primitive thumbnail, name, tier, role, price, key stats hull/shield/cargo/speed), greyed with 'Research <node>' tag if requiresTech unmet; Buy / Sell(50%) buttons; 'set active' on owned ships
- Outfitting/loadout screen: visual slot grid of active ship showing each slot's type+size; drag module from inventory into compatible slot, highlight valid targets, red on incompatible; live derived-stat readout (hull, shield, cargoCap, topSpeed, mass, DPS, energy balance: regen vs drain bar)
- Module shop list: filterable by slotType, shows stat line, tier, price, energyDraw, mass, requiresTech lock state; Buy adds to inventory
- Inventory tray: owned unequipped modules with quick-equip
- Energy balance widget: regen/s vs continuous drain/s with warning when drain>regen (weapons will throttle)
- Tech tree screen: DAG laid out by branch (Combat/Industry/Drives/Logistics) with node cards (name, costCr, costRP, unlock summary), prereq lines, states: locked(prereq) / available / researching-affordable / done; click to research with confirm; shows current researchPoints + credits
- Comparison tooltip: hovering a ship/module shows stat delta vs currently active (green/red arrows)
- Fleet view: list of ownedShips with their fittings summary and active marker
- Toast hooks: insufficient credits/RP, cargo overflow blocks downsize, successful research/purchase

## Risks
- 
