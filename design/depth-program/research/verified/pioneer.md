# Pioneer — Verified Content Inventory

> Frontier: Elite II successor. Full 3D, Newtonian physics, dynamic economy,
> procedurally-generated galaxy. Verified by reading the actual files in
> `/tmp/sf-research/repos/pioneer/`. All counts and examples are sourced from
> those files.
>
 - Data root: `pioneer/data/`
 - Ships: `pioneer/data/ships/` (JSON)
 - Economy: `pioneer/data/economy/` (commodities, industries, conditions)
 - Factions: `pioneer/data/factions/` (Lua)
 - Galaxy/systems: `pioneer/data/systems/` + C++ generator in `src/galaxy/`
 - Modules (BBS/missions): `pioneer/data/modules/` (Lua)
 - Equipment: `pioneer/data/modules/Equipment/` (Lua registry)
 - Facegen: `pioneer/data/facegen/`
 - Source: `src/` (C++); key files `src/galaxy/StarSystemGenerator.cpp`,
   `src/galaxy/GalaxyGenerator.cpp`, `src/ship/Propulsion.cpp`,
   `src/galaxy/SystemBody.h`

NOTE on path convention: the brief used `pioneer/data/...` and `pioneer/pioneer`;
the actual clone layout is `<repo>/data/...` with `<repo>/pioneer` being a
build script file, not a directory. Every path below is the real path.

---

## Counts

| Thing | Count | Source path |
|---|---|---|
| Player ship definitions (JSON) | **31** | `data/ships/` (4 are missiles, 27 are pilotable hulls) |
| Pilotable hull classes | **27** | `data/ships/*.json` minus `missile_*` |
| Equipment items | **123** | `data/modules/Equipment/*.lua` (`Equipment.Register(...)` ids) |
| Commodities | **32** | `data/economy/commodities/*.json` |
| Industries | **25** | `data/economy/industries/{agricultural,industrial,mining,high_tech}.json` |
| Economy types | **4** + generic | `data/economy/economies.json` (agricultural/industrial/mining/high_tech) |
| Named **conditions** (rules-engine predicates) | **19** | `data/economy/conditions/basic.json` |
| Faction definitions (Lua) | **103** | `data/factions/*.lua` (incl. `XX_AutoGenerate.OLD`) |
| Culture / name-pool files | **30** | `data/culture/*.lua` (en, de, ja, ru, …) |
| BBS / station modules | **41** | `data/modules/` (each a mission/trade/service type) |
| BBS mission icons | **21** | `data/icons/bbs/` |
| Hand-authored custom systems | **2** | `data/systems/00_sol.lua`, `01_epsilon_eridani.lua` |
| Planet/star **body types** | ~40 enum values | `src/galaxy/SystemBody.h` `enum BodyType` |
| Star spectral classes | O B A F G K M (+ giants/supergiants/hypergiants, brown dwarfs, Wolf-Rayet) | `src/galaxy/SystemBody.h` |
| Galaxy density map | 1024 × 1024 8-bit BMP | `data/galaxy_dense.bmp` |
| Facegen species | up to 10 (1 present) | `data/facegen/species_0/` |
| Facegen races per species | up to 16 (3 present in species_0) | `data/facegen/species_0/race_{0,1,2}/` |
| Custom-system population stages | 8-stage pipeline | `src/galaxy/GalaxyGenerator.cpp` |

Industry breakdown by economy: `agricultural.json` 3, `industrial.json` 9,
`mining.json` 4, `high_tech.json` 9 = **25**.

---

## Factions

`pioneer/data/factions/` contains **103 Lua files** defining the political
map. Most are procedurally-suggested (e.g. `049_True_Expanse.lua`,
`061_Dagger_Union.lua`) but the majors are hand-written. Faction API
(verified from `001_Solar_Federation.lua`):

```lua
local f = Faction:new('Solar Federation')
    :description_short('The historical birthplace of humankind')
    :description('Sol is a fine joint')
    :homeworld(0,0,0,0,16)        -- sectorX, sectorY, sectorZ, systemIdx, bodyIdx (Mars)
    :foundingDate(3050)
    :expansionRate(1)
    :military_name('SolFed Military')
    :police_name('SolFed Police Force')
    :police_ship('kanara')         -- which ship hull police fly
    :colour(0.4,0.4,1)

f:govtype_weight('EARTHDEMOC', 60)       -- weighted government-type distribution
f:govtype_weight('EARTHCOLONIAL', 40)

f:illegal_goods_probability('animal_meat', 75)   -- per-commodity legality, 0–100
f:illegal_goods_probability('slaves', 100)
f:illegal_goods_probability('narcotics', 100)
f:add_to_factions('Solar Federation')
```

Factions are data-driven on: **homeworld body coordinate**, founding date,
expansion rate (how far their territory spreads from homeworld), government-type
weights, per-commodity illegality probabilities, police/military ship hull, and a
UI colour. The base `000_Independent.lua` faction carries equal weights across
8 government types (LIBDEM, CORPORATE, SOCDEM, MILDICT1/2, COMMUNIST,
PLUTOCRATIC, DISORDER), so unclaimed space still has political texture.

---

## Ships

Verified from `data/ships/*.json`. Each JSON carries: name, `ship_class`,
`manufacturer`, price, `hull_mass`/`structure_mass`/`armor_mass`, `volume`,
`capacity`/`cargo`, `hyperdrive_class`, **per-axis Newtonian thrust**,
`effective_exhaust_velocity` (rocket equation), cross-sections + drag coeffs
for atmospheric flight, and a modular **`equipment_slots`** map.

| File | Name | Class | Maker | Price | HD | Roles |
|---|---|---|---|---|---|---|
| pumpkinseed | Pumpkinseed | light_courier | kaluri | 46 180 | 1 | pirate, mercenary |
| varada | Varada | light_courier | mandarava-csepel | 9 712 | 0 | pirate, mercenary |
| xylophis | Xylophis | light_passenger_shuttle | opli | 11 685 | 0 | courier, passenger |
| kanara_civ | Kanara (Civilian) | light_fighter | mandarava-csepel | 27 790 | 0 | pirate |
| lunarshuttle | Lunar Shuttle | light_passenger_shuttle | haber | 27 062 | 1 | passenger |
| bowfin | Bowfin | light_fighter | kaluri | 43 104 | 1 | pirate, mercenary, police |
| coronatrix | Coronatrix | light_courier | opli | 50 349 | 1 | pirate, mercenary, courier |
| molamola | Mola Mola | light_freighter | kaluri | 60 279 | 2 | merchant |
| wave | Wave | medium_fighter | auronox | 79 172 | 2 | pirate, mercenary |
| sinonatrix | Sinonatrix | medium_courier | opli | 95 647 | 2 | pirate, merchant, mercenary, courier |
| skipjack | Skipjack | medium_courier | kaluri | 175 779 | 2 | pirate, merchant, mercenary, courier |
| natrix | Natrix | heavy_courier | opli | 245 883 | 3 | pirate, merchant, mercenary, courier |
| bluenose | Bluenose | medium_freighter | kaluri | 269 560 | 3 | merchant |
| deneb | Deneb | medium_freighter | albr | 380 117 | 3 | merchant, pirate, mercenary |
| molaramsayi | Mola Ramsayi | medium_freighter | kaluri | 607 846 | 3 | merchant |
| storeria | Storeria | medium_freighter | opli | 897 564 | 4 | merchant |
| venturestar | Venturestar | medium_freighter | albr | 1 182 421 | 4 | merchant, pirate |
| nerodia | Nerodia | heavy_freighter | opli | 1 233 699 | 4 | merchant |
| malabar | Malabar | heavy_passenger_transport | mandarava-csepel | 2 562 074 | 4 | merchant |
| ac33 | AC-33 Dropstar | heavy_fighter | albr | 1 316 807 | 4 | pirate, merchant, mercenary |
| dsminer | Deep Space Miner | heavy_freighter | haber | 1 493 716 | 5 | merchant |
| vatakara | Vatakara | heavy_freighter | mandarava-csepel | 2 833 883 | 4 | merchant |
| lodos | Lodos | heavy_freighter | auronox | 3 603 283 | 5 | merchant |
| coronatrix_police, kanara, pumpkinseed_police, sinonatrix_police | police variants | various | various | 0 | 1–2 | police, mercenary |

**Manufacturers (fictional shipyards):** kaluri, opli, haber,
mandarava-csepel, albr, auronox. **Ship classes:** light/medium/heavy
× courier, freighter, fighter, plus passenger_shuttle/transport. **Roles:**
pirate, merchant, mercenary, police, courier, passenger — the same hull can
fill several.

### Newtonian flight model (verified in source)

`data/ships/pumpkinseed.json` declares per-axis thrust and acceleration caps:

```
"forward_thrust": 1320000,  "forward_acceleration_cap": 41.202,
"reverse_thrust": 700000,   "reverse_acceleration_cap": 21.582,
"up_thrust": 800000,  "up_acceleration_cap": 30.411,
"down_thrust": 160000, "left/right_thrust": 160000,
"angular_thrust": 1001276.26,
"effective_exhaust_velocity": 15200000,   // ← rocket-equation Isp analogue
"fuel_tank_mass": 10,
"front/side/top_cross_section": 38/45/72, "front/side/top_drag_coeff": 0.1/0.2/0.6,
"lift_coeff": 0.5, "aero_stability": 1.6
```

`src/ship/Propulsion.cpp` uses these for genuine reaction-mass physics.
Verified: delta-V is computed by the **Tsiolkovsky rocket equation** —

```cpp
// src/ship/Propulsion.cpp:226-234
// returns speed that can be reached using fuel minus reserve according to the Tsiolkovsky equation
return m_effectiveExhaustVelocity * log(mass / (mass - fuelmass));
```

Fuel burn is proportional to thrust (`m_thrusterFuel -= timeStep * (totalThrust * fuelUseRate)`,
Propulsion.cpp:217). Acceleration = thrust / current mass (Propulsion.h:53-57),
so acceleration degrades as fuel mass burns off. There is **no linear damping**
in space (the Body/physics code does not apply space drag) — this is true
Newtonian inertia; you must spend equal delta-v to decelerate.

### Modular equipment slots

Each ship defines `equipment_slots` — named hardpoints with a `type`
(hyperdrive, thruster, weapon, missile, shield, fuel_scoop, cabin, computer,
hull, structure, utility), a **size tier (1–5)**, optional `hardpoint: true`,
`gimbal` range, and a `default` equipment id. Example: pumpkinseed has 4 ×
size-1 missile hardpoints, 1 front size-1 laser (2° gimbal), a shield slot,
two cabins, a fuel scoop hardpoint, a utility hardpoint, plus required
hull/structure/thruster/hyperdrive slots. Equipment must fit the slot type
and size.

---

## Economy

### Commodities (32) — `data/economy/commodities/{agricultural,industrial,mining,high_tech,generic}.json`

Grouped by producer economy. Each commodity has `l10n_key`, `inputs` (the
commodities consumed to make it), `producer` economy id, `price`, sometimes
a legality/`pclass`. Examples:

- **agricultural (6):** fruit_and_veg, grain, animal_meat, live_animals,
  liquor, slaves
- **industrial (10):** metal_alloys, plastics, textiles, consumer_goods,
  farm_machinery, mining_machinery, fertilizer, military_fuel, radioactives,
  narcotics, hand_weapons
- **mining (6):** metal_ore, carbon_ore, precious_metals, hydrogen, water,
  liquid_oxygen
- **high_tech (9):** computers, robots, medicines, industrial_machinery,
  air_processors, chemicals, nerve_gas, battle_weapons, (+ one more)
- **generic (1):** rubbish (price −16, i.e. you pay to dispose)

### Industries (25) — `data/economy/industries/*.json`

Each industry is a mini production-rule with **inputs → outputs**, build
**conditions**, **modifiers** from local planet traits, and a
**`build_next`** growth chain. From `industries/agricultural.json`:

```json
"station_aquaponics": {
  "l10n_key": "ZERO_G_AQUAPONICS",
  "conditions_any": [ "starport_orbital", "zero_g" ],
  "inputs":  { "farm_machinery": 1, "fertilizer": 2, "air_processors": 1, "water": 4 },
  "outputs": { "fruit_and_veg": 3, "grain": 3 },
  "modifiers": { "rare_microbial_life": [ "i:fertilizer-1", "o:*+1" ] },
  "build_next": [ { "id": "drug_lab", "chance": 0.8 }, { "id": "distillery", "chance": "0.4" } ]
}
```

`build_next` means an industry, once established, probabilistically spawns
related industries (aquaponics → drug_lab/distillery). `modifiers` rewrite
inputs/outputs when a local condition holds (`rare_microbial_life` cuts
fertilizer need and boosts all outputs). This is an **economic ecosystem**,
not a static price table.

### The conditions rules-engine — `data/economy/conditions/basic.json`

19 named predicates over raw system/planet properties:

| Condition | Rule (example) |
|---|---|
| lawless | `lawlessness > 0.8` (system context) |
| zero_g / low_gravity / norm_gravity | `gravity <= 3.3` / `> 3.3` / `> 6.0` |
| atmos_airless / tenuous / unbreathable / breathable | thresholds on `atmosDensity` + `atmosOxidizing` |
| gas_giant_o2 | `type = PLANET_GAS_GIANT AND atmosOxidizing > 0.1` |
| ice_abundant / ice_moderate | `volatileIces > 0.6` / `> 0.3` |
| carbon_ores / carbon_ores_rich | low metallicity + low ices (+ random) |
| metal_abundant / metal_moderate | `metallicity > 0.7` / `> 0.4` |
| rare_metals, biosphere_basic, biosphere_rich, rare_microbial_life | resource/life tiers |

Industries reference these by name in `conditions`/`conditions_any`, so the
economy of a station is a function of *where it is*.

### Economy types — `data/economy/economies.json`

Four economy archetypes (agricultural/industrial/mining/high_tech), each with
`affinity` (how strongly it leans on agricultural/metallicity/industrial
system traits) and `generation` weights (how likely a system is to *be* that
economy, from system properties + population + randomness). Each economy type
also has localised description strings keyed by system size
(small/medium/large/huge: "YOUNG_FARMING_COLONY" → "HIGH_POPULATION_OUTDOOR_WORLD").

### Population as a consumer — `data/economy/population.json`

Population is itself an "industry" with inputs (food, water, air, medicines,
consumer goods, textiles, computers, robots, energy) and outputs (rubbish,
radioactives), plus condition modifiers:

```json
"modifiers": {
  "atmos_breathable": [ "i:air_processors-3" ],
  "lawless":          [ "i:hand_weapons+1", "i:battle_weapons+0", "i:nerve_gas+1", "o:slaves+1" ],
  "ice_abundant":     [ "i:water-1" ]
}
```

So a lawless world consumes more weapons and *produces* slaves; a breathable
atmosphere cuts air-processor demand. The economy models the populace, not
just factories.

### Dynamic market simulation — `src/galaxy/StarSystemGenerator.cpp` `PopulateStage1` (verified)

This is Pioneer's signature depth feature. Each system's market is a vector
`m_tradeLevel[commodity]` (signed integer per commodity) stored on StarSystem
(`src/galaxy/StarSystem.h:152`). **Negative = surplus/cheap/export;
positive = demand/expensive/import.** It is computed at system generation by
walking every planet body and every commodity:

```cpp
// src/galaxy/StarSystemGenerator.cpp:~1534-1600
for (const auto &commodity : GalacticEconomy::Commodities()) {
    fixed affinity = 0;
    if (economy.affinity.agricultural > 0) affinity += economy.affinity.agricultural * sbody->GetAgriculturalAsFixed();
    if (economy.affinity.metallicity  > 0) affinity += economy.affinity.metallicity  * sbody->GetMetallicityAsFixed();
    if (economy.affinity.industrial   > 0) affinity += economy.affinity.industrial   * system->GetIndustrial();
    affinity *= rand.Fixed();                       // per-system noise
    fixed howmuch = affinity * 256 * rand.Fixed() * 3;

    system->AddTradeLevel(commodity.id, -2 * howmuch.ToInt32());      // PRODUCE → price falls
    for (const auto &input : commodity.inputs)
        system->AddTradeLevel(input.first, (input.second * howmuch).ToInt32());  // CONSUME inputs → price rises
}
// then: population consumes consumables (food/water/air/medicines) → demand
// then: workforce (sum of affinity × humanProximity) → population number
// then: outdoor/life-bearing worlds get ~10× population
```

So the price you see at any station is the deterministic consequence of:
that system's planets' metallicity/agriculture/industry/life/temperature,
the commodity's production recipe, the population's consumption, and the
faction's legality rules — all layered. (`AddTradeLevel` is the only mutator;
runtime trading does not appear to permanently shift it in the code I read,
though it is the documented hook.)

---

## Missions / dynamic content

### BBS (bulletin-board) modules — `data/modules/` (41 modules)

Missions and services are Lua modules posted as adverts on station
bulletin boards. Each module has its own icon (`data/icons/bbs/`) and a
localisation resource. Verified mission/service categories:

- **Cargo/haul:** CargoRun (+ `CargoTypes.lua`), DeliverPackage, TradeShips,
  BulkShips, GoodsTrader, FuelScoop, Scoop, Mining, SecondHand, SoldOut,
  StationRefuelling, FuelClub, NewsEventCommodity
- **Passenger:** Taxi, CrewContracts, SearchRescue, FindPerson, LifeSupport
- **Combat/risk:** Assassination, Combat, Pirates, PolicePatrol,
  AIWarning, CrimeTracking, Scoop
- **Service/flavour:** Advice, BreakdownServicing, DonateToCranks,
  EasterEgg, AutoSave, StatsTracking, FlightLog, System, Rondel,
  StationTrafficControl, MusicPlayer, Debug
- **Shared infra:** Common, MissionUtils (+ `ShipBuilder`, templates like
  `WeakPirate`, `GenericPolice`)

### Mission structure (verified from `data/modules/CargoRun/CargoRun.lua`)

```lua
local PirateTemplate = MissionUtils.ShipTemplates.WeakPirate
local EscortTemplate = MissionUtils.ShipTemplates.GenericPolice
local max_delivery_dist = 15            -- light years
local typical_reward = 35 * max_delivery_dist
local typical_reward_local = 35
local max_cargo = 10
local max_cargo_wholesaler = 100
local pickup_factor = 2
-- custom_cargo: weighted branches (CargoTypes.lua) for flavour cargo

local ads = {}
local missions = {}
-- ... on advert creation: pick destination system, compute reward by distance,
--     decide pirate-ambush probability, attach a Character (facegen) client
```

Missions reference `Character` (NPCs with procedural faces from
`data/facegen/`), spawn ships from role **templates** (WeakPirate,
GenericPolice), and key all text through `Lang.GetResource("module-cargorun")`.
The reward model is openly distance-driven, and missions compose with the
dynamic economy (cargo quantity is bounded by what you can carry; pirate
threat scales the reward).

---

## Data architecture

- **JSON for ship + economy data** (`data/ships/*.json`,
  `data/economy/**/*.json`) — clean, schema-friendly, diff-friendly.
- **Lua for everything behavioural**: factions (`data/factions/`), modules
  (`data/modules/`), equipment registration (`data/modules/Equipment/`),
  name/culture pools (`data/culture/`). Equipment items are *registered at
  runtime* via `Equipment.Register(id, Type.New {...})` rather than declared
  in a static table, so modules can extend the catalogue modularly.
- **C++ for the procedural generators** (`src/galaxy/`), driven by the
  JSON/Lua data. The galaxy is an 8-stage pipeline (`src/galaxy/GalaxyGenerator.cpp`):
  sector stages → `SectorCustomSystemsGenerator` (apply hand-authored systems),
  `SectorRandomSystemsGenerator` (seed star positions from the density BMP),
  `SectorOverrideSystemsGenerator`, `SectorPersistenceGenerator`; then
  star-system stages → `StarSystemFromSectorGenerator`,
  `StarSystemCustomGenerator`, `StarSystemRandomGenerator`,
  `PopulateStarSystemGenerator` (runs `PopulateStage1` = the economy sim).
- **Galaxy as an image.** `data/galaxy_dense.bmp` (verified: 1024 × 1024,
  8-bit) encodes stellar density per region; the generator samples it to
  decide how many stars each sector gets, producing a galaxy-shaped galaxy
  with a core and arms rather than a uniform cube.
- **Fixed-point math.** Star system generation uses a `fixed` rational type
  (e.g. `f(387,1000)` for semi-major axis, `f(9,10)` for metallicity) so
  galaxy generation is **bit-for-bit reproducible** across platforms.
- **Body properties** are physical and feed the economy:
  `metallicity, volcanicity, atmos_density, atmos_oxidizing, ocean_cover,
  ice_cover, life, average_temp, surface_gravity, volatileIces,
  semi_major_axis, eccentricity, inclination, rotation_period, axial_tilt`
  (verified in `data/systems/00_sol.lua` CustomSystemBody builder chain).

---

## Depth patterns

1. **Depth-via-simulation: an economy that emerges from physics.** Pioneer
   does not store prices. It stores `m_tradeLevel[]` and *derives* prices from
   a model where each planet produces goods proportional to its
   metallicity/agriculture/industry/life, consumes its inputs, and a
   population layer consumes consumables — all modified by named conditions.
   The result is a galaxy where trade routes *make sense* (buy hydrogen at a
   water-rich mining world, sell it at an industrial hub) without any
   hand-authored market. (Verified: `src/galaxy/StarSystemGenerator.cpp`
   `PopulateStage1`; `data/economy/population.json`.)

2. **Newtonian flight with the real rocket equation.** `Propulsion.cpp`
   computes available delta-V with `Ve * ln(m0 / (m0 − mf))` (Tsiolkovsky),
   burns reaction mass proportional to thrust, and degrades acceleration as
   mass drops. Per-axis thrust + acceleration caps + atmospheric cross-section
   drag are all data on the ship JSON. Flying is a genuine orbital-mechanics
   puzzle, not arcade. (Verified: `src/ship/Propulsion.cpp:226-234`,
   `data/ships/pumpkinseed.json`.)

3. **A conditions rules-engine as the bridge between world and content.**
   19 named conditions (`metal_abundant`, `atmos_breathable`, `lawless`,
   `rare_microbial_life`, …) are predicates over raw planet properties.
   Industries, population modifiers, and faction legality all reference them
   by name. This decouples "what is this planet?" from "what can exist here?"
   and makes the whole content surface composable. (Verified:
   `data/economy/conditions/basic.json`, used across `industries/*.json` and
   `population.json`.)

4. **Procedural galaxy from a density image + fixed-point seeds.** A 1024² BMP
   gives the galaxy its shape; per-sector fixed-point seeds make every star,
   planet, and market reproducible across machines and save files. Two
   hand-authored systems (Sol, Epsilon Eridani) sit inside an otherwise
   generated ~100k-system galaxy, showing how authored content plugs into the
   generator pipeline via `SectorCustomSystemsGenerator`. (Verified:
   `data/galaxy_dense.bmp`, `src/galaxy/GalaxyGenerator.cpp`,
   `data/systems/00_sol.lua`.)

5. **Layered NPC identity: faces + cultures + names.** Facegen assembles NPC
   portraits from layered PNG parts (background → head → clothes → eyes →
   nose → mouth → accessories → hair → armour) across up to 10 species × 16
   races × 2 genders (`data/facegen/readme.txt`). Names come from 30
   culture-specific pools (`data/culture/`) via `libs/NameGen.lua`, with
   separate formats for outdoor/rock planets and orbital/surface/asteroid
   starports. So every BBS client, station, and planet feels locally rooted.

---

## What SpaceFace could learn

1. **Derive prices from a model, don't store them.** Pioneer's
   `tradeLevel[]` approach — produce commodities from system traits,
   consume their inputs, add a population consumption layer, expose surplus
   as cheap exports and shortage as expensive imports — gives a
   self-balancing, explorable economy for free. SpaceFace can implement a
   small input/output industry graph + a conditions predicate layer and get
   trade depth that *reacts to the world* instead of hand-tuning every
   market. (Verified: `src/galaxy/StarSystemGenerator.cpp::PopulateStage1`,
   `data/economy/industries/*.json`.)

2. **A named-conditions rules-engine as your content glue.** Define ~20
   predicates ("high_security", "resource_rich", "breathable_atmos",
   "frontier") over your world-state, then let every system — industries,
   missions, NPC spawns, legality — gate on those names. This is far more
   composable than if/else ladders and lets new content hook in without
   touching core. (Verified: `data/economy/conditions/basic.json` consumed by
   `industries/`, `population.json`, and faction `illegal_goods_probability`.)

3. **Modular equipment via typed, sized slots + a runtime registry.** Ships
   declare named slots with `type` + `size` + optional `hardpoint`/`gimbal`;
   equipment items register themselves (`Equipment.Register`) with matching
   slot type/size. This lets you add ships or items independently and the
   outfitter UI assembles valid loadouts. SpaceFace's loadout system should
   treat slots and items as independently extensible registries. (Verified:
   `data/ships/pumpkinseed.json` `equipment_slots`,
   `data/modules/Equipment/*.lua` 123 registered items.)

4. **Procedural galaxy shape from a density image + reproducible seeds.**
   Using a bitmap as the density field makes the generated galaxy *look* like
   a galaxy (core, arms, voids) for near-zero authoring cost, and fixed-point
   seeds make it reproducible. SpaceFace can drop any greyscale image in as
   its "where stuff is denser" map and get structured, seed-stable clusters
   for star systems, stations, or encounters. (Verified:
   `data/galaxy_dense.bmp` 1024², `src/galaxy/GalaxyGenerator.cpp` pipeline.)

5. **Layered procedural NPC portraits + culture-rooted names.** The
   background→head→clothes→eyes→nose→mouth→accessories→hair layer order is a
   cheap, artist-extensible recipe for unique-feeling NPCs, and pairing it
   with per-culture name pools makes NPCs feel like they belong to a place.
   SpaceFace can adopt the layer-draw order and the "names come from the
   system's culture" coupling to give every contact an identity for the cost
   of a few PNGs and name lists. (Verified: `data/facegen/readme.txt`,
   `data/culture/*.lua`, `libs/NameGen.lua`.)
