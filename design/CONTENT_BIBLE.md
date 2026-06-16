Both fixes are clean and all references still resolve. The dataset is complete and validated. Now I emit the full deliverable — all 11 data files verbatim plus the progression note.

---

# SpaceFace — Content & Balance Bible

11 reconciled, cross-validated ES-module data files under `src/data/`. All cross-references resolve (verified programmatically); the three mission worked-examples reproduce exactly (385 / 3157 / 300); the economic curve is anchored to `A(T)` = 250/600/1400/3200/7000 cr/min sustained-active income per tier.

**Reconciliation decisions** (where specs conflicted): starter cargo = **40u**; rep scale = **−1000..+1000**; mining-beam dps = **ore-HP/s** (yield from asteroid tables, starter beam free); player ships use the **2-layer** hull+shield model (Ships/Tech catalog is canonical), enemies carry their own stats with the **3-layer** shield→armor→hull combat model; faction-label→id map: Coalition→`scn`, Free-Traders/trade→`mts`, Industrial Guild→`dmc`, Pirate Clans→`reach`, smugglers→`quiet`, alien/endgame→`vael`, settlers→`free`, zealots→`choir`. Weapons merged into one table with each dmg/rof reconciled to a single value.

```js
// src/data/ores.js
// Raw ores, refined metals, crafted components and salvage.
// VALUE LADDER (cr/unit): raw 4..260  <  refined 40..120  <  crafted 220..300.
// `mass` = tonnes per unit (t/u), `vol` = volume units per unit (u/u),
// `baseValue` = direct sell value in credits per unit (cr/u). `tier` gates
// eligibility against an asteroid's tierCap. These sell DIRECTLY at ore-buy /
// refinery stations; they are distinct from the haulable trade commodities in
// commodities.js (which model arbitrage routes, not extraction output).

export const ORES = [
  // id              name                category   mass  vol   baseValue tier  tags
  { id: 'rock_silicate',   name: 'Silicate Rock',    category: 'raw',     mass: 0.6, vol: 1.0, baseValue: 4,   tier: 0, tags: ['common'] },
  { id: 'ore_iron',        name: 'Iron Ore',         category: 'raw',     mass: 0.8, vol: 1.0, baseValue: 12,  tier: 0, tags: ['metal'] },
  { id: 'ore_copper',      name: 'Copper Ore',       category: 'raw',     mass: 0.9, vol: 1.0, baseValue: 18,  tier: 1, tags: ['metal'] },
  { id: 'ore_titanium',    name: 'Titanium Ore',     category: 'raw',     mass: 0.7, vol: 1.0, baseValue: 34,  tier: 2, tags: ['metal'] },
  { id: 'ice_water',       name: 'Water Ice',        category: 'raw',     mass: 0.5, vol: 1.4, baseValue: 6,   tier: 0, tags: ['ice','bulky'] },
  { id: 'ice_volatiles',   name: 'Volatile Ice',     category: 'raw',     mass: 0.5, vol: 1.4, baseValue: 16,  tier: 1, tags: ['ice','bulky'] },
  { id: 'gas_hydrogen',    name: 'Hydrogen Gas',     category: 'raw',     mass: 0.1, vol: 2.5, baseValue: 9,   tier: 0, tags: ['gas','bulky'] },
  { id: 'gas_helium3',     name: 'Helium-3',         category: 'raw',     mass: 0.1, vol: 2.5, baseValue: 40,  tier: 2, tags: ['gas','bulky'] },
  { id: 'crystal_silica',  name: 'Silica Crystal',   category: 'raw',     mass: 1.1, vol: 1.0, baseValue: 30,  tier: 1, tags: ['crystal'] },
  { id: 'crystal_lumin',   name: 'Luminite Crystal', category: 'raw',     mass: 1.0, vol: 1.0, baseValue: 70,  tier: 2, tags: ['crystal','glow'] },
  { id: 'ore_platinoid',   name: 'Platinoid Ore',    category: 'raw',     mass: 1.4, vol: 1.0, baseValue: 110, tier: 3, tags: ['metal','rare'] },
  { id: 'exotic_xenium',   name: 'Xenium',           category: 'raw',     mass: 1.2, vol: 1.0, baseValue: 260, tier: 4, tags: ['exotic','rare'] },

  // Refined outputs (volume-compressed: half the volume of their inputs)
  { id: 'metal_iron_ingot', name: 'Iron Ingot',     category: 'refined',  mass: 0.7, vol: 0.5, baseValue: 40,  tier: 1, tags: ['metal','refined'] },
  { id: 'metal_ti_alloy',   name: 'Titanium Alloy', category: 'refined',  mass: 0.6, vol: 0.5, baseValue: 120, tier: 2, tags: ['metal','refined'] },

  // Crafted ship components
  { id: 'comp_hullplate',   name: 'Hull Plate',     category: 'component', mass: 1.0, vol: 0.6, baseValue: 220, tier: 2, tags: ['component'] },
  { id: 'comp_circuitry',   name: 'Circuitry',      category: 'component', mass: 0.3, vol: 0.4, baseValue: 300, tier: 3, tags: ['component'] },

  // Salvage (from wrecks)
  { id: 'scrap_metal',         name: 'Scrap Metal',        category: 'salvage', mass: 0.9, vol: 1.0, baseValue: 8,  tier: 0, tags: ['salvage'] },
  { id: 'salvage_electronics', name: 'Salvage Electronics', category: 'salvage', mass: 0.4, vol: 0.6, baseValue: 55, tier: 1, tags: ['salvage'] },
];

// Refining / crafting chains (run at stations with the matching service tier).
export const REFINE_RECIPES = [
  { id: 'refine_iron',     inputs: { ore_iron: 2 },                              output: { metal_iron_ingot: 1 }, fee: 6,  timeS: 8,  stationTier: 1 },
  { id: 'refine_titanium', inputs: { ore_titanium: 3, metal_iron_ingot: 1 },     output: { metal_ti_alloy: 1 },   fee: 20, timeS: 14, stationTier: 2 },
  { id: 'craft_hullplate', inputs: { metal_iron_ingot: 2, metal_ti_alloy: 1 },   output: { comp_hullplate: 1 },   fee: 40, timeS: 20, stationTier: 2 },
  { id: 'craft_circuitry', inputs: { crystal_lumin: 2, salvage_electronics: 1, ore_copper: 1 }, output: { comp_circuitry: 1 }, fee: 60, timeS: 25, stationTier: 3 },
];

export const ORE_BY_ID = Object.fromEntries(ORES.map(o => [o.id, o]));
```

```js
// src/data/commodities.js
// Tradeable commodities for the stock-based market economy (economy.js consumes).
// These are the ARBITRAGE goods hauled producer->consumer; mined raw ore output
// lives in ores.js and sells at ore-buy stations. `ore`/`silicates`/`volatiles`
// here are the refinery FEEDSTOCK form (bulk-priced) and intentionally re-priced
// vs the per-unit ore baseValues so a hauler buys cheap feedstock and a miner
// sells extracted ore directly -- two coherent value paths into the same goods.
//
// basePrice (cr/u): price at stock==equilibrium. volatility feeds event amplitude.
// elasticity: per-commodity price curve steepness (staples low, luxuries high).
// legality: 'legal' | 'restricted' | 'illegal' | 'contraband'.
// volPerU / massPerU: hold footprint. producedBy/consumedBy: station-type roles.

export const COMMODITIES = [
  // --- RAW MATERIALS / FEEDSTOCK ---
  { id: 'water_ice',      name: 'Water Ice',        category: 'raw',      basePrice: 12,  volatility: 0.15, elasticity: 0.30, legality: 'legal', volPerU: 1.0, massPerU: 1.0, fineMult: 0,   producedBy: ['ice_field','agri'],            consumedBy: ['habitat','shipyard','refinery'] },
  { id: 'ore',            name: 'Raw Metal Ore',    category: 'raw',      basePrice: 28,  volatility: 0.20, elasticity: 0.40, legality: 'legal', volPerU: 1.0, massPerU: 1.6, fineMult: 0,   producedBy: ['mining','asteroid_outpost'],   consumedBy: ['refinery'] },
  { id: 'silicates',      name: 'Silicates',        category: 'raw',      basePrice: 22,  volatility: 0.18, elasticity: 0.35, legality: 'legal', volPerU: 1.0, massPerU: 1.2, fineMult: 0,   producedBy: ['mining'],                      consumedBy: ['refinery','fab'] },
  { id: 'volatiles',      name: 'Ice Volatiles',    category: 'raw',      basePrice: 35,  volatility: 0.22, elasticity: 0.45, legality: 'legal', volPerU: 1.0, massPerU: 0.4, fineMult: 0,   producedBy: ['gas_skimmer','ice_field'],     consumedBy: ['refinery','shipyard','habitat'] },

  // --- REFINED ---
  { id: 'refined_metals', name: 'Refined Metals',   category: 'refined',  basePrice: 85,  volatility: 0.25, elasticity: 0.45, legality: 'legal', volPerU: 1.0, massPerU: 1.4, fineMult: 0,   producedBy: ['refinery'],                    consumedBy: ['fab','shipyard','military'] },
  { id: 'alloys',         name: 'Composite Alloys', category: 'refined',  basePrice: 140, volatility: 0.28, elasticity: 0.50, legality: 'legal', volPerU: 1.0, massPerU: 1.3, fineMult: 0,   producedBy: ['refinery','fab'],              consumedBy: ['shipyard','military'] },
  { id: 'polymers',       name: 'Polymers',         category: 'refined',  basePrice: 70,  volatility: 0.24, elasticity: 0.40, legality: 'legal', volPerU: 1.2, massPerU: 0.7, fineMult: 0,   producedBy: ['refinery'],                    consumedBy: ['fab','habitat'] },
  { id: 'fuel_cells',     name: 'Fuel Cells',       category: 'refined',  basePrice: 95,  volatility: 0.26, elasticity: 0.50, legality: 'legal', volPerU: 0.8, massPerU: 0.6, fineMult: 0,   producedBy: ['refinery','gas_skimmer'],      consumedBy: ['*'] },

  // --- TECH / ELECTRONICS ---
  { id: 'microchips',     name: 'Microchips',       category: 'tech',     basePrice: 260, volatility: 0.35, elasticity: 0.55, legality: 'legal', volPerU: 0.5, massPerU: 0.2, fineMult: 0,   producedBy: ['fab'],                         consumedBy: ['shipyard','military','habitat','research'] },
  { id: 'electronics',    name: 'Electronics',      category: 'tech',     basePrice: 190, volatility: 0.32, elasticity: 0.50, legality: 'legal', volPerU: 0.8, massPerU: 0.5, fineMult: 0,   producedBy: ['fab'],                         consumedBy: ['shipyard','habitat'] },
  { id: 'ship_parts',     name: 'Ship Parts',       category: 'tech',     basePrice: 320, volatility: 0.34, elasticity: 0.55, legality: 'legal', volPerU: 1.5, massPerU: 1.8, fineMult: 0,   producedBy: ['shipyard','fab'],              consumedBy: ['shipyard','repair_dock','military'] },
  { id: 'quantum_cores',  name: 'Quantum Cores',    category: 'tech',     basePrice: 880, volatility: 0.45, elasticity: 0.60, legality: 'legal', volPerU: 0.7, massPerU: 0.3, fineMult: 0,   producedBy: ['research'],                    consumedBy: ['shipyard','military'] },

  // --- CONSUMER / FOOD / MED ---
  { id: 'consumer_goods', name: 'Consumer Goods',   category: 'consumer', basePrice: 110, volatility: 0.28, elasticity: 0.45, legality: 'legal', volPerU: 1.0, massPerU: 0.5, fineMult: 0,   producedBy: ['fab'],                         consumedBy: ['habitat','frontier'] },
  { id: 'textiles',       name: 'Textiles',         category: 'consumer', basePrice: 60,  volatility: 0.22, elasticity: 0.40, legality: 'legal', volPerU: 1.0, massPerU: 0.6, fineMult: 0,   producedBy: ['agri','fab'],                  consumedBy: ['habitat'] },
  { id: 'food',           name: 'Provisions',       category: 'food',     basePrice: 40,  volatility: 0.20, elasticity: 0.30, legality: 'legal', volPerU: 1.0, massPerU: 0.7, fineMult: 0,   producedBy: ['agri'],                        consumedBy: ['*','frontier'] },
  { id: 'medical',        name: 'Medical Supplies', category: 'med',      basePrice: 175, volatility: 0.30, elasticity: 0.50, legality: 'legal', volPerU: 0.7, massPerU: 0.4, fineMult: 0,   producedBy: ['research','fab'],              consumedBy: ['habitat','frontier','military'] },

  // --- LUXURY ---
  { id: 'luxury_goods',   name: 'Luxury Goods',     category: 'luxury',   basePrice: 380, volatility: 0.40, elasticity: 0.60, legality: 'legal',      volPerU: 0.8, massPerU: 0.4, fineMult: 0,    producedBy: ['habitat','fab'],         consumedBy: ['habitat','casino','frontier'] },
  { id: 'art',            name: 'Art & Antiques',   category: 'luxury',   basePrice: 620, volatility: 0.45, elasticity: 0.65, legality: 'restricted', volPerU: 0.6, massPerU: 0.3, fineMult: 0.8,  producedBy: ['habitat'],               consumedBy: ['casino','habitat'] },

  // --- MILITARY HARDWARE (restricted) ---
  { id: 'weapons',        name: 'Weapon Systems',   category: 'military', basePrice: 400, volatility: 0.40, elasticity: 0.55, legality: 'restricted', volPerU: 0.7, massPerU: 1.5, fineMult: 1.2,  producedBy: ['military','shipyard'],   consumedBy: ['military','pirate_base'] },
  { id: 'munitions',      name: 'Munitions',        category: 'military', basePrice: 130, volatility: 0.32, elasticity: 0.50, legality: 'restricted', volPerU: 0.6, massPerU: 1.1, fineMult: 0.8,  producedBy: ['military','fab'],        consumedBy: ['military','pirate_base'] },
  { id: 'missile_ammo',   name: 'Missiles',         category: 'military', basePrice: 110, volatility: 0.30, elasticity: 0.50, legality: 'restricted', volPerU: 0.5, massPerU: 0.9, fineMult: 0.8,  producedBy: ['military','fab'],        consumedBy: ['*'] }, // consumed by Missile/Torpedo weapons

  // --- CONTRABAND ---
  { id: 'narcotics',      name: 'Narcotics',        category: 'contraband', basePrice: 220, volatility: 0.55, elasticity: 0.60, legality: 'illegal',    volPerU: 0.6, massPerU: 0.2, fineMult: 1.2,  producedBy: ['blackmarket','pirate_base'], consumedBy: ['blackmarket','casino','frontier'] },
  { id: 'stolen_goods',   name: 'Stolen Goods',     category: 'contraband', basePrice: 150, volatility: 0.50, elasticity: 0.55, legality: 'contraband', volPerU: 1.0, massPerU: 0.8, fineMult: 1.5,  producedBy: ['pirate_base'],               consumedBy: ['blackmarket'] },
];

export const COMMODITY_BY_ID = Object.fromEntries(COMMODITIES.map(c => [c.id, c]));

// Economy tuning constants (single source for economy.js).
export const ECONOMY_TUNING = {
  baseEqDefault: 1000,        // units; scaled by station size tier S=0.5/M=1/L=2
  roleFactor: { produce: 2.0, consume: 0.35, none: 0 },
  sizeFactor: { S: 0.5, M: 1.0, L: 2.0 },
  spreadDefault: 0.08,        // 8% buy/sell spread
  spreadClamp: [0.04, 0.40],
  priceMultClamp: [0.40, 2.60],
  driftRate: 0.006,           // per second toward effectiveEq
  econTickSec: 5,
  eventScheduleSec: 90,       // avg seconds between new economic events
  baseScan: 0.25,             // contraband scan base probability
  fineMultByLegality: { restricted: 0.8, illegal: 1.2, contraband: 1.5 },
};
```

```js
// src/data/factions.js
// 8 factions. Reputation scale is [-1000, +1000] (Factions subsystem owns rep;
// UI may rescale for display). `relations` map values are in [-1,+1]
// (ally=+, rival/hostile=-) and also drive rep spillover weights.
//
// homeSectors[] reference ids in sectors.js. The World spec used loose faction
// LABELS; this is the canonical label->id map applied throughout:
//   Coalition Navy        -> scn
//   Free-Traders          -> mts   (Meridian Trade Syndicate = the trade guild)
//   Industrial Guild      -> dmc   (Drift Miners Collective)
//   Pirate Clans          -> reach (Crimson Reach)
//   Smugglers/black-market -> quiet (The Quiet)
//   Alien / Rogue endgame -> vael  (The Vael)
//   Independent settlers  -> free  (Free Frontier)
//   Techno-zealots        -> choir (Ascendant Choir)

export const FACTIONS = [
  {
    id: 'scn', name: 'Solar Concord Navy', short: 'Concord', color: '#3A78FF',
    personality: 'lawful', startingRep: 0,
    homeSectors: ['s0_helios', 's2_tethys'],
    controls: ['core sectors', 'jump-gate checkpoints', 'customs scans'],
    fleetClass: 'federation', // visual silhouette / palette family
    relations: { mts: 0.5, dmc: 0.0, reach: -0.6, quiet: 0.0, vael: -0.5, free: 0.0, choir: 0.3 },
  },
  {
    id: 'mts', name: 'Meridian Trade Syndicate', short: 'Meridian', color: '#F2B233',
    personality: 'corporate', startingRep: 0,
    homeSectors: ['s2_tethys', 's4_pallas'],
    controls: ['trade-hub sectors', 'commodity exchanges', 'tolls'],
    fleetClass: 'syndicate',
    relations: { scn: 0.5, dmc: -0.2, reach: -0.35, quiet: 0.0, vael: 0.0, free: 0.2, choir: 0.0 },
  },
  {
    id: 'dmc', name: 'Drift Miners Collective', short: 'Drift', color: '#C9772E',
    personality: 'blue-collar', startingRep: 0,
    homeSectors: ['s1_ceres', 's3_vesta', 's6_charon'],
    controls: ['asteroid-rich sectors', 'refineries', 'ore prices'],
    fleetClass: 'independent',
    relations: { scn: 0.0, mts: -0.2, reach: -0.35, quiet: 0.0, vael: 0.0, free: 0.35, choir: 0.0 },
  },
  {
    id: 'reach', name: 'Crimson Reach', short: 'Reach', color: '#D8334A',
    personality: 'pirate', startingRep: -50,
    homeSectors: ['s7_sker', 's9_ashfall'],
    controls: ['lawless sectors', 'ambush lanes'],
    fleetClass: 'pirate',
    relations: { scn: -0.6, mts: -0.35, dmc: -0.35, quiet: 0.2, vael: 0.0, free: 0.0, choir: -0.35 },
  },
  {
    id: 'quiet', name: 'The Quiet', short: 'Quiet', color: '#7A5FB0',
    personality: 'smuggler', startingRep: 0,
    homeSectors: ['s4_pallas', 's5_io'],
    controls: ['black markets', 'contraband routes'],
    fleetClass: 'mercenary',
    relations: { scn: 0.0, mts: 0.0, dmc: 0.0, reach: 0.2, vael: 0.0, free: 0.0, choir: 0.0 },
  },
  {
    id: 'vael', name: 'The Vael', short: 'Vael', color: '#2FCFA0',
    personality: 'xenophobic', startingRep: -120,
    homeSectors: ['s8_veil', 's9_ashfall'],
    controls: ['far-rim sectors', 'exotic tech', 'unique commodities'],
    fleetClass: 'alien',
    relations: { scn: -0.5, mts: 0.0, dmc: 0.0, reach: 0.0, quiet: 0.0, free: 0.0, choir: -0.6 },
  },
  {
    id: 'free', name: 'Free Frontier', short: 'Frontier', color: '#4ECBE0',
    personality: 'independent', startingRep: 40,
    homeSectors: ['s5_io', 's8_veil'],
    controls: ['scattered neutral waystations'],
    fleetClass: 'independent',
    relations: { scn: 0.0, mts: 0.2, dmc: 0.35, reach: 0.0, quiet: 0.0, vael: 0.0, choir: -0.2 },
  },
  {
    id: 'choir', name: 'Ascendant Choir', short: 'Choir', color: '#E85FD0',
    personality: 'zealot', startingRep: 0,
    homeSectors: ['s3_vesta'],
    controls: ['fortified zealot sectors', 'relic shrines'],
    fleetClass: 'mercenary',
    relations: { scn: 0.3, mts: 0.0, dmc: 0.0, reach: -0.35, quiet: 0.0, vael: -0.6, free: -0.2 },
  },
];

export const FACTION_BY_ID = Object.fromEntries(FACTIONS.map(f => [f.id, f]));

// Reputation tiers (thresholds on the -1000..+1000 value).
export const REP_TIERS = [
  { name: 'Sworn Enemy', min: -1000, max: -700, aggro: true,  dock: 'locked'     },
  { name: 'Hated',       min: -699,  max: -400, aggro: true,  dock: 'locked'     },
  { name: 'Hostile',     min: -399,  max: -150, aggro: true,  dock: 'locked'     },
  { name: 'Disliked',    min: -149,  max: -30,  aggro: false, dock: 'restricted' },
  { name: 'Neutral',     min: -29,   max: 29,   aggro: false, dock: 'full'       },
  { name: 'Accepted',    min: 30,    max: 149,  aggro: false, dock: 'full'       },
  { name: 'Trusted',     min: 150,   max: 399,  aggro: false, dock: 'full'       },
  { name: 'Allied',      min: 400,   max: 699,  aggro: false, dock: 'full'       },
  { name: 'Hero',        min: 700,   max: 1000, aggro: false, dock: 'full'       },
];

// Action weights table (single source for applyRep deltas).
export const REP_ACTIONS = {
  kill_faction_ship:        { base: -25, classMult: { scout: 0.6, fighter: 1.0, gunship: 1.5, frigate: 2.0, capital: 2.5 }, witnessed: true },
  kill_faction_enemy_ship:  { base: 6 },          // +6 to victim's enemy factions
  complete_faction_mission: { base: 15 },         // x mission.repMult (1..4)
  fail_faction_mission:     { base: -12 },
  trade_at_faction_station: { perThousandCr: 0.5, capPerDock: 3 },
  caught_contraband:        { base: -40, strikeMult: 1.5 },
  destroy_faction_asset:    { base: -150 },
  rescue_distress:          { base: 20 },
  loot_faction_wreck:       { base: -8, witnessed: true },
};

export const REP_CONFIG = {
  witnessRange: 1200,         // wu
  spilloverWeights: { ally: 0.35, friendly: 0.20, neutral: 0.0, rival: -0.20, hostile: -0.35 },
  spilloverCap: 8,            // per event
  friendlyThreshold: 25,      // mission loyalty bonus & offer weighting
  decayPerDay: { negativeTowardNeutral: 2, positiveTowardNeutral: 1, decayPositive: false },
  bribeBaseCr: 500,
  escortHireCrPerSector: 2000,
  // Inter-faction war: contested sectors that can flip owner.
  contestedSectors: [
    { sectorId: 's2_tethys', pair: ['scn', 'reach'] },
    { sectorId: 's4_pallas', pair: ['mts', 'quiet'] },
    { sectorId: 's5_io',     pair: ['free', 'reach'] },
    { sectorId: 's7_sker',   pair: ['reach', 'scn'] },
    { sectorId: 's6_charon', pair: ['dmc', 'reach'] },
  ],
  warThreshold: 75,           // tension 0..100
};
```

```js
// src/data/sectors.js
// 10-sector core->frontier graph. security 0..1, factionId in the 8 faction ids.
// neighbors[] are bidirectional jump links (verified symmetric).
// position{x,y} is the STAR-MAP node coordinate (abstract map units, not wu).
// fields[].type references asteroidTypes.js ids. hazards[].type in HAZARD_TYPES.
// enemyDensity 0..1 and enemyLevel [min,max] feed the spawn system.
// wealthIndex/dangerIndex are derived hints economy/combat read.
//
// Tier->securityLevel-int (0..5) mapping for economy danger tiers:
//   securityLevel = round(security*5); dangerTier = 5 - securityLevel.

const HAZARD_TYPES = ['dense_asteroid', 'nebula', 'radiation', 'debris'];

export const SECTORS = [
  {
    id: 's0_helios', name: 'Helios Prime', tier: 0, security: 0.98, securityLevel: 5,
    factionId: 'scn', position: { x: 0, y: 0 }, worldRadius: 3500,
    wealthIndex: 0.35, dangerIndex: 0.05, trafficPerMin: 18, enemyDensity: 0.03, enemyLevel: [1, 2],
    neighbors: ['s1_ceres', 's2_tethys', 's3_vesta'],
    stations: [
      { id: 'st_helios',     name: 'Helios Station', type: 'trade_hub', factionId: 'scn', size: 'L', services: ['trade','shipyard','refuel','repair','missions'] },
      { id: 'st_coalition',  name: 'Coalition HQ',   type: 'military',  factionId: 'scn', size: 'M', services: ['missions','repair','refuel'] },
    ],
    fields: [],
    hazards: [],
    pois: [ { id: 'poi_tutorial', type: 'beacon', name: 'Tutorial Beacon' }, { id: 'poi_memorial', type: 'beacon', name: 'Memorial Array' } ],
  },
  {
    id: 's1_ceres', name: 'Ceres Belt', tier: 1, security: 0.72, securityLevel: 4,
    factionId: 'dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
    wealthIndex: 0.50, dangerIndex: 0.20, trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
    neighbors: ['s0_helios', 's2_tethys', 's4_pallas'],
    stations: [
      { id: 'st_ceres',   name: 'Ceres Refinery', type: 'refinery', factionId: 'dmc', size: 'M', services: ['trade','refuel','repair','ore_buy','refine'] },
      { id: 'st_beltout', name: 'Belt Outpost',   type: 'mining',   factionId: 'dmc', size: 'S', services: ['trade','missions','ore_buy'] },
    ],
    fields: [
      { id: 'f_ceres_1', type: 'metallic',   countWeight: 1.0 },
      { id: 'f_ceres_2', type: 'common_rock', countWeight: 1.0 },
      { id: 'f_ceres_3', type: 'metallic',   countWeight: 0.8 },
    ],
    hazards: [ { type: 'dense_asteroid', center: { x: 600, z: -400 }, radius: 700, intensity: 0.5 } ],
    pois: [ { id: 'poi_driller', type: 'derelict', name: 'Abandoned Driller' }, { id: 'poi_survey', type: 'cache', name: 'Survey Cache' } ],
  },
  {
    id: 's2_tethys', name: 'Tethys Junction', tier: 1, security: 0.65, securityLevel: 3,
    factionId: 'mts', position: { x: 3, y: 2 }, worldRadius: 4000,
    wealthIndex: 0.62, dangerIndex: 0.25, trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
    neighbors: ['s0_helios', 's1_ceres', 's3_vesta', 's5_io'],
    stations: [
      { id: 'st_tethys',  name: 'Tethys Trade Hub', type: 'trade_hub', factionId: 'mts', size: 'L', services: ['trade','shipyard','refuel','repair','missions'] },
      { id: 'st_customs', name: 'Customs Gate',     type: 'military',  factionId: 'scn', size: 'S', services: ['toll','scan','refuel'] },
    ],
    fields: [ { id: 'f_tethys_1', type: 'common_rock', countWeight: 1.0 } ],
    hazards: [],
    pois: [ { id: 'poi_blackmkt', type: 'cache', name: 'Black Market Contact', hidden: true, factionId: 'quiet' } ],
  },
  {
    id: 's3_vesta', name: 'Vesta Forge', tier: 1, security: 0.60, securityLevel: 3,
    factionId: 'dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
    wealthIndex: 0.70, dangerIndex: 0.30, trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
    neighbors: ['s0_helios', 's2_tethys', 's6_charon'],
    stations: [
      { id: 'st_forge',  name: 'Forge Foundry', type: 'fab',     factionId: 'dmc', size: 'M', services: ['trade','shipyard','repair','refine','module_craft'] },
      { id: 'st_depot3', name: 'Refuel Depot',  type: 'mining',  factionId: 'choir', size: 'S', services: ['refuel'] },
    ],
    fields: [
      { id: 'f_vesta_1', type: 'metallic', countWeight: 1.0 },
      { id: 'f_vesta_2', type: 'metallic', countWeight: 1.0 },
      { id: 'f_vesta_3', type: 'crystalline', countWeight: 0.6 },
    ],
    hazards: [ { type: 'radiation', center: { x: -800, z: 500 }, radius: 600, intensity: 0.4 } ],
    pois: [ { id: 'poi_freighter', type: 'derelict', name: 'Derelict Freighter' } ],
  },
  {
    id: 's4_pallas', name: 'Pallas Drift', tier: 2, security: 0.42, securityLevel: 2,
    factionId: 'mts', position: { x: -5, y: 5 }, worldRadius: 4500,
    wealthIndex: 0.85, dangerIndex: 0.50, trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
    neighbors: ['s1_ceres', 's5_io', 's7_sker'],
    stations: [
      { id: 'st_drift',     name: 'Drift Market', type: 'trade_hub',  factionId: 'mts',   size: 'M', services: ['trade','refuel','repair','missions'] },
      { id: 'st_smuggler',  name: 'Smuggler Den', type: 'blackmarket', factionId: 'quiet', size: 'S', services: ['black_market','missions','refuel'] },
    ],
    fields: [
      { id: 'f_pallas_1', type: 'metallic', countWeight: 1.0 },
      { id: 'f_pallas_2', type: 'icy', countWeight: 0.9 },
      { id: 'f_pallas_3', type: 'icy', countWeight: 0.7 },
    ],
    hazards: [ { type: 'nebula', center: { x: 400, z: 600 }, radius: 800, intensity: 0.4 } ],
    pois: [ { id: 'poi_pwreck', type: 'wreck', name: 'Pirate Wreckage' }, { id: 'poi_hcache', type: 'cache', name: 'Hidden Cache', hidden: true } ],
  },
  {
    id: 's5_io', name: 'Io Reach', tier: 2, security: 0.35, securityLevel: 2,
    factionId: 'free', position: { x: 5, y: 5 }, worldRadius: 4600,
    wealthIndex: 0.95, dangerIndex: 0.60, trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
    neighbors: ['s2_tethys', 's4_pallas', 's6_charon', 's8_veil'],
    stations: [
      { id: 'st_reach', name: 'Reach Station', type: 'trade_hub', factionId: 'free', size: 'M', services: ['trade','repair','refuel','missions'], contested: true },
    ],
    fields: [
      { id: 'f_io_1', type: 'metallic',    countWeight: 1.0 },
      { id: 'f_io_2', type: 'crystalline', countWeight: 0.8 },
    ],
    hazards: [
      { type: 'dense_asteroid', center: { x: -500, z: -300 }, radius: 700, intensity: 0.5 },
      { type: 'nebula',         center: { x: 700, z: 400 },  radius: 900, intensity: 0.45 },
    ],
    pois: [ { id: 'poi_merc', type: 'colony', name: 'Mercenary Outpost', factionId: 'quiet' }, { id: 'poi_cruiser', type: 'derelict', name: 'Derelict Cruiser' } ],
  },
  {
    id: 's6_charon', name: 'Charon Expanse', tier: 2, security: 0.30, securityLevel: 2,
    factionId: 'dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
    wealthIndex: 1.00, dangerIndex: 0.62, trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
    neighbors: ['s3_vesta', 's5_io', 's9_ashfall'],
    stations: [
      { id: 'st_expanse', name: 'Expanse Refinery', type: 'refinery', factionId: 'dmc', size: 'M', services: ['ore_buy','refuel','repair','refine'] },
    ],
    fields: [
      { id: 'f_charon_1', type: 'rare_exotic', countWeight: 0.7 },
      { id: 'f_charon_2', type: 'metallic',    countWeight: 1.0 },
      { id: 'f_charon_3', type: 'rare_exotic', countWeight: 0.6 },
    ],
    hazards: [
      { type: 'radiation',      center: { x: 300, z: -700 }, radius: 700, intensity: 0.5 },
      { type: 'dense_asteroid', center: { x: -600, z: 500 }, radius: 650, intensity: 0.5 },
    ],
    pois: [ { id: 'poi_colony', type: 'colony', name: 'Abandoned Mining Colony' } ],
  },
  {
    id: 's7_sker', name: 'Pirate Haven (Sker)', tier: 3, security: 0.08, securityLevel: 0,
    factionId: 'reach', position: { x: -7, y: 8 }, worldRadius: 5000,
    wealthIndex: 1.20, dangerIndex: 0.85, trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
    neighbors: ['s4_pallas', 's8_veil'],
    stations: [
      { id: 'st_sker', name: 'Sker Bazaar', type: 'blackmarket', factionId: 'reach', size: 'M', services: ['black_market','repair','refuel','missions'], repGated: true },
    ],
    fields: [ { id: 'f_sker_1', type: 'rare_exotic', countWeight: 0.8 } ],
    hazards: [
      { type: 'dense_asteroid', center: { x: 500, z: 300 },   radius: 800, intensity: 0.6 },
      { type: 'dense_asteroid', center: { x: -500, z: -400 }, radius: 700, intensity: 0.6 },
    ],
    pois: [ { id: 'poi_bounty', type: 'wreck', name: 'Bounty Wrecks' }, { id: 'poi_stash', type: 'cache', name: 'Stash Cache', hidden: true } ],
  },
  {
    id: 's8_veil', name: 'Veil Nebula', tier: 3, security: 0.12, securityLevel: 1,
    factionId: 'free', position: { x: 7, y: 9 }, worldRadius: 5200,
    wealthIndex: 1.30, dangerIndex: 0.90, trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
    neighbors: ['s5_io', 's7_sker'], // + gated wormhole -> s9_ashfall (unlock via tech/story)
    wormholeTo: { sectorId: 's9_ashfall', gatedBy: 'tech:long_range_survey' },
    stations: [
      { id: 'st_veil', name: 'Research Station Veil', type: 'research', factionId: 'free', size: 'M', services: ['scan_tech','missions','repair'] },
    ],
    fields: [ { id: 'f_veil_1', type: 'gas_cloud', countWeight: 1.0 } ],
    hazards: [
      { type: 'nebula',    center: { x: 0, z: 0 },      radius: 3000, intensity: 0.9 },
      { type: 'radiation', center: { x: 200, z: -200 }, radius: 600,  intensity: 0.6 },
    ],
    pois: [ { id: 'poi_anomaly', type: 'anomaly', name: 'Anomaly Signal' }, { id: 'poi_wormhole', type: 'wormhole', name: 'Wormhole', gatedBy: 'tech:long_range_survey' } ],
  },
  {
    id: 's9_ashfall', name: 'Ashfall Reach', tier: 4, security: 0.05, securityLevel: 0,
    factionId: 'vael', position: { x: 4, y: 11 }, worldRadius: 5500,
    wealthIndex: 1.60, dangerIndex: 1.00, trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
    neighbors: ['s6_charon'], // one-way back to s6; entered via s8 wormhole
    stations: [
      { id: 'st_ashcache', name: 'Ruined Cache Station', type: 'blackmarket', factionId: 'vael', size: 'S', services: ['repair','refuel'], repGated: true },
    ],
    fields: [
      { id: 'f_ash_1', type: 'rare_exotic', countWeight: 1.0 },
      { id: 'f_ash_2', type: 'rare_exotic', countWeight: 1.0 },
    ],
    hazards: [
      { type: 'radiation', center: { x: 0, z: 0 },     radius: 2000, intensity: 0.8, moving: true },
      { type: 'debris',    center: { x: 400, z: 300 }, radius: 800,  intensity: 0.5 },
    ],
    pois: [ { id: 'poi_boss', type: 'anomaly', name: 'Boss Arena Signal' }, { id: 'poi_vault', type: 'cache', name: 'Ancient Vault', hidden: true } ],
  },
];

export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map(s => [s.id, s]));

// Jump-drive / navigation tuning (single source for navigation system).
export const NAV_TUNING = {
  baseFuelPerLy: 4, baseChargeSec: 6, baseInterdict: 0.35, cooldownSec: 6,
  maxJumpSpeed: 80, scanRange: 400, sectorScanSec: 2,
  jumpDriveTiers: {
    1: { baseCharge: 8.0, fuelMult: 1.0,  stealth: 0.0,  hotJump: false },
    2: { baseCharge: 5.5, fuelMult: 0.85, stealth: 0.15, hotJump: false },
    3: { baseCharge: 3.5, fuelMult: 0.70, stealth: 0.35, hotJump: true  },
  },
  // edge distances (ly) keyed by sorted pair; core short, frontier long.
  edgeDist: {
    's0_helios|s1_ceres': 2.5, 's0_helios|s2_tethys': 2.0, 's0_helios|s3_vesta': 3.0,
    's1_ceres|s2_tethys': 2.5, 's1_ceres|s4_pallas': 4.0,
    's2_tethys|s3_vesta': 3.0, 's2_tethys|s5_io': 4.5,
    's3_vesta|s6_charon': 5.0,
    's4_pallas|s5_io': 3.5, 's4_pallas|s7_sker': 6.0,
    's5_io|s6_charon': 4.0, 's5_io|s8_veil': 6.5,
    's6_charon|s9_ashfall': 7.0,
    's7_sker|s8_veil': 6.0,
    's8_veil|s9_ashfall': 9.0, // wormhole leg
  },
};
```

```js
// src/data/ships.js
// 13 player-purchasable hulls across 6 tiers (T0..T5). Two-layer defense model
// (hull + shield); no armor layer for player ships (armor is an enemy/combatant
// concept, see enemies.js). `slots` is the typed+sized fitting grid consumed by
// modules.js (slotType x size S=1/M=2/L=3). Engine slot is always exactly 1.
//
// Derived stats (topSpeed/accel/turnRate) are computed at runtime from the
// equipped engine + total mass (see FORMULAS in the Ships/Tech spec); the hull
// `handling` scalar and `mass` feed that. `cargo` is base hold volume (u).
// requiresTech (optional) references a techTree.js node id and gates purchase.

export const SHIPS = [
  // ---------- T0 ----------
  {
    id: 'kestrel', name: 'Kestrel', role: 'starter', tier: 0,
    hull: 120, shield: 40, baseShieldRegen: 6, cargo: 40, mass: 18, handling: 1.0,
    energyCap: 80, energyRegen: 12, collisionRadius: 14, price: 0, buyback: 8000,
    slots: { weapon: ['S'], shield: ['S'], engine: ['M'], cargo: ['S'], mining: [], utility: ['S'] },
  },
  // ---------- T1 ----------
  {
    id: 'pelican', name: 'Pelican', role: 'mining', tier: 1,
    hull: 180, shield: 60, baseShieldRegen: 8, cargo: 60, mass: 32, handling: 0.8,
    energyCap: 110, energyRegen: 16, collisionRadius: 16, price: 22000,
    slots: { weapon: ['S'], shield: ['S'], engine: ['M'], cargo: ['M'], mining: ['M','M'], utility: ['S'] },
  },
  {
    id: 'wasp', name: 'Wasp', role: 'fighter', tier: 1, requiresTech: 'combat_basics',
    hull: 150, shield: 110, baseShieldRegen: 10, cargo: 15, mass: 16, handling: 1.4,
    energyCap: 140, energyRegen: 22, collisionRadius: 14, price: 28000,
    slots: { weapon: ['S','S'], shield: ['M'], engine: ['M'], cargo: [], mining: [], utility: ['S'] },
  },
  {
    id: 'mule', name: 'Mule', role: 'freighter', tier: 1,
    hull: 200, shield: 70, baseShieldRegen: 8, cargo: 140, mass: 55, handling: 0.6,
    energyCap: 100, energyRegen: 14, collisionRadius: 18, price: 35000,
    slots: { weapon: ['S'], shield: ['M'], engine: ['M'], cargo: ['M','M','M'], mining: [], utility: ['S'] },
  },
  // ---------- T2 ----------
  {
    id: 'drifter', name: 'Drifter', role: 'multirole', tier: 2,
    hull: 320, shield: 180, baseShieldRegen: 12, cargo: 90, mass: 48, handling: 1.0,
    energyCap: 200, energyRegen: 28, collisionRadius: 18, price: 95000,
    slots: { weapon: ['M','M'], shield: ['M'], engine: ['M'], cargo: ['M','M'], mining: ['M'], utility: ['M','M'] },
  },
  {
    id: 'hornet', name: 'Hornet', role: 'interceptor', tier: 2, requiresTech: 'strike_craft',
    hull: 260, shield: 240, baseShieldRegen: 16, cargo: 20, mass: 24, handling: 1.7,
    energyCap: 260, energyRegen: 38, collisionRadius: 16, price: 110000,
    slots: { weapon: ['M','M','M'], shield: ['M'], engine: ['L'], cargo: [], mining: [], utility: ['S','S'] },
  },
  {
    id: 'ironback', name: 'Ironback', role: 'mining_barge', tier: 2, requiresTech: 'industrial_mining',
    hull: 480, shield: 160, baseShieldRegen: 10, cargo: 200, mass: 90, handling: 0.5,
    energyCap: 240, energyRegen: 26, collisionRadius: 24, price: 130000,
    slots: { weapon: ['M'], shield: ['M','M'], engine: ['M'], cargo: ['M','M','M'], mining: ['L','L','L','L'], utility: ['M','M'] },
  },
  // ---------- T3 ----------
  {
    id: 'bastion', name: 'Bastion', role: 'corvette', tier: 3, requiresTech: 'warship_license',
    hull: 640, shield: 460, baseShieldRegen: 18, cargo: 70, mass: 80, handling: 1.1,
    energyCap: 420, energyRegen: 52, collisionRadius: 22, price: 320000,
    slots: { weapon: ['L','L','L'], shield: ['L','L'], engine: ['L'], cargo: ['M'], mining: [], utility: ['M','M','M'] },
  },
  {
    id: 'atlas', name: 'Atlas', role: 'heavy_hauler', tier: 3, requiresTech: 'bulk_logistics',
    hull: 720, shield: 300, baseShieldRegen: 12, cargo: 480, mass: 200, handling: 0.45,
    energyCap: 360, energyRegen: 40, collisionRadius: 30, price: 380000,
    slots: { weapon: ['M','M'], shield: ['L','L'], engine: ['L'], cargo: ['L','L','L','L','L','L'], mining: [], utility: ['M','M','M'] },
  },
  {
    id: 'ranger', name: 'Ranger', role: 'explorer', tier: 3, requiresTech: 'long_range_survey',
    hull: 480, shield: 380, baseShieldRegen: 16, cargo: 110, mass: 60, handling: 1.3,
    energyCap: 500, energyRegen: 64, collisionRadius: 18, price: 290000,
    slots: { weapon: ['M','M'], shield: ['M','M'], engine: ['L'], cargo: ['M','M'], mining: [], utility: ['L','L','L','L'] },
  },
  // ---------- T4 ----------
  {
    id: 'warden', name: 'Warden', role: 'gunship', tier: 4, requiresTech: 'capital_weapons',
    hull: 1100, shield: 820, baseShieldRegen: 22, cargo: 90, mass: 150, handling: 0.95,
    energyCap: 720, energyRegen: 84, collisionRadius: 26, price: 950000,
    slots: { weapon: ['L','L','L','L'], shield: ['L','L','L'], engine: ['L'], cargo: ['M'], mining: [], utility: ['L','L','L','L'] },
  },
  {
    id: 'colossus', name: 'Colossus', role: 'battlecruiser', tier: 4, requiresTech: 'capital_hulls',
    hull: 1600, shield: 1100, baseShieldRegen: 26, cargo: 200, mass: 300, handling: 0.7,
    energyCap: 900, energyRegen: 100, collisionRadius: 32, price: 1400000,
    slots: { weapon: ['L','L','L','L','L'], shield: ['L','L','L','L'], engine: ['L'], cargo: ['L','L'], mining: [], utility: ['L','L','L','L','L'] },
  },
  // ---------- T5 ----------
  {
    id: 'leviathan', name: 'Leviathan', role: 'flagship', tier: 5, requiresTech: 'flagship_command',
    hull: 3200, shield: 2600, baseShieldRegen: 32, cargo: 350, mass: 600, handling: 0.6,
    energyCap: 1600, energyRegen: 160, collisionRadius: 45, price: 4500000,
    slots: { weapon: ['L','L','L','L','L','L','L'], shield: ['L','L','L','L','L'], engine: ['L'], cargo: ['L','L','L'], mining: [], utility: ['L','L','L','L','L','L','L','L'] },
  },
];

export const SHIP_BY_ID = Object.fromEntries(SHIPS.map(s => [s.id, s]));

// Derived-stat constants (used by getDerivedStats fold).
export const SHIP_DERIVE = {
  baseTurn: 2.4,            // rad/s reference before engine/handling/mass
  sellback: 0.5,           // 50% sell-back of price
};
```

```js
// src/data/modules.js
// 35 modules: weapons, shields, engines, cargo expanders, mining lasers, utility.
// Merged from the Combat and Ships/Tech specs; where the two disagreed on a
// weapon's dmg/rof, ONE reconciled value is used (noted inline). Combat fields
// (damageType, heat, projSpeed, range, tracking) folded in. `requiresTech`
// references techTree.js node ids. Slot fit rule: slot.type==slotType && slot.size>=size.
//
// Common fields: id, name, slotType, size(S/M/L), tier, mass(t), price(cr),
//   energyDraw (cr-cap/s continuous) OR energyCost (cr-cap/shot for weapons).
// Weapon fields: dmg, rof(/s), dps(derived), damageType, projSpeed(wu/s),
//   range(wu), tracking, heatPerShot/heatMax/heatDissip (heat-gated only),
//   ammo (commodityId if ammo-consuming).
// Stat modifiers (shields/engines/cargo/util): see `mods` block per item.

export const MODULES = [
  // ===================== WEAPONS =====================
  // Pulse Laser S: reconciled dmg=8 (Ships/Tech) over Combat's 6; rof 4 -> DPS 32.
  { id: 'w_pulse_s', name: 'Pulse Laser S', slotType: 'weapon', size: 'S', tier: 1, mass: 2, price: 4500,
    dmg: 8, rof: 4.0, dps: 32, damageType: 'energy', energyCost: 3, projSpeed: 320, range: 600, tracking: 'fixed', spreadDeg: 0.6 },
  { id: 'w_pulse_m', name: 'Pulse Laser M', slotType: 'weapon', size: 'M', tier: 2, mass: 5, price: 14000, requiresTech: 'beam_focusing',
    dmg: 12, rof: 6.0, dps: 72, damageType: 'energy', energyCost: 4, projSpeed: 340, range: 680, tracking: 'fixed', spreadDeg: 0.6 }, // "Burst Laser M"
  { id: 'w_autocannon_s', name: 'Autocannon S', slotType: 'weapon', size: 'S', tier: 1, mass: 4, price: 5200,
    dmg: 14, rof: 2.2, dps: 31, damageType: 'kinetic', energyCost: 1.5, projSpeed: 420, range: 520, tracking: 'fixed', spreadDeg: 2.2,
    heatPerShot: 9, heatMax: 100, heatDissip: 28, armorPierce: 0.5 }, // reconciled to Ships/Tech dmg14/rof2.2
  { id: 'w_autocannon_m', name: 'Heavy Autocannon M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 19000, requiresTech: 'kinetic_drivers',
    dmg: 18, rof: 4.0, dps: 72, damageType: 'kinetic', energyCost: 2, projSpeed: 400, range: 560, tracking: 'fixed', spreadDeg: 1.6,
    heatPerShot: 14, heatMax: 100, heatDissip: 28, armorPierce: 0.5 },
  { id: 'w_beam_m', name: 'Beam Laser M', slotType: 'weapon', size: 'M', tier: 3, mass: 7, price: 22000, requiresTech: 'beam_focusing',
    dmg: 60, rof: 0, dps: 60, damageType: 'energy', energyCost: 14 /* per second */, projSpeed: Infinity, range: 520, tracking: 'hitscan',
    continuous: true, heatPerSec: 55, heatMax: 100, heatDissip: 22 },
  { id: 'w_railgun_m', name: 'Railgun M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 21000, requiresTech: 'kinetic_drivers',
    dmg: 60, rof: 0.8, dps: 48, damageType: 'kinetic', energyCost: 14, projSpeed: 700, range: 1100, tracking: 'fixed', armorPierce: 0.5 },
  { id: 'w_plasma_m', name: 'Plasma Cannon M', slotType: 'weapon', size: 'M', tier: 3, mass: 8, price: 42000, requiresTech: 'plasma_dynamics',
    dmg: 34, rof: 3.0, dps: 102, damageType: 'thermal', energyCost: 9, projSpeed: 360, range: 600, tracking: 'fixed', splashRadius: 30 },
  { id: 'w_missile_m', name: 'Missile Rack M (Hawk)', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 24000, requiresTech: 'guided_ordnance',
    dmg: 70, splashDmg: 35, splashRadius: 40, rof: 0.8, dps: 56, damageType: 'explosive', energyCost: 4,
    projSpeed: 320, projSpeedMin: 180, range: 900, tracking: 'homing', turnRate: 3.5, lockTimeS: 1.2, ammo: 'missile_ammo' },
  { id: 'w_flak_s', name: 'Flak/PD Turret S', slotType: 'weapon', size: 'S', tier: 2, mass: 3, price: 11000,
    dmg: 4, rof: 8.0, dps: 32, damageType: 'kinetic', energyCost: 1, projSpeed: 600, range: 300, tracking: 'auto_turret', turretArcDeg: 180,
    intercepts: true /* shoots down missiles */ },
  { id: 'w_heavybeam_l', name: 'Heavy Beam L', slotType: 'weapon', size: 'L', tier: 4, mass: 16, price: 130000, requiresTech: 'capital_weapons',
    dmg: 160, rof: 0, dps: 160, damageType: 'energy', energyCost: 22 /* per second */, projSpeed: Infinity, range: 900, tracking: 'hitscan',
    continuous: true, heatPerSec: 50, heatMax: 100, heatDissip: 20 },
  { id: 'w_torpedo_l', name: 'Torpedo (Lance) L', slotType: 'weapon', size: 'L', tier: 4, mass: 24, price: 60000, requiresTech: 'capital_weapons',
    dmg: 320, splashDmg: 120, splashRadius: 70, rof: 0.25, dps: 80, damageType: 'explosive', energyCost: 10,
    projSpeed: 240, projSpeedMin: 140, range: 1400, tracking: 'homing', turnRate: 1.4, lockTimeS: 2.5, ammo: 'missile_ammo' },
  { id: 'w_siege_l', name: 'Siege Lance L', slotType: 'weapon', size: 'L', tier: 5, mass: 24, price: 310000, requiresTech: 'flagship_command',
    dmg: 420, rof: 0.5, dps: 210, damageType: 'kinetic', energyCost: 40, projSpeed: 600, range: 1600, tracking: 'fixed', armorPierce: 0.5 },

  // ===================== SHIELDS =====================
  { id: 's_booster_s', name: 'Shield Booster S', slotType: 'shield', size: 'S', tier: 1, mass: 3, price: 6000,
    energyDraw: 2, mods: { shieldFlat: 60, shieldRegenFlat: 2 } },
  { id: 's_capacitor_m', name: 'Shield Capacitor M', slotType: 'shield', size: 'M', tier: 2, mass: 6, price: 19000, requiresTech: 'deflector_theory',
    energyDraw: 4, mods: { shieldFlat: 180, shieldRegenFlat: 6 } },
  { id: 's_aegis_l', name: 'Aegis Shield L', slotType: 'shield', size: 'L', tier: 4, mass: 14, price: 95000, requiresTech: 'hardened_deflectors',
    energyDraw: 9, mods: { shieldFlat: 520, shieldRegenFlat: 14 } },

  // ===================== ENGINES (exactly 1 per ship) =====================
  { id: 'e_ion_m', name: 'Ion Thruster M', slotType: 'engine', size: 'M', tier: 1, mass: 6, price: 7000,
    energyDraw: 4, mods: { topSpeed: 70, accelMult: 1.0, turnMult: 1.0 } },
  { id: 'e_fusion_m', name: 'Fusion Drive M', slotType: 'engine', size: 'M', tier: 2, mass: 9, price: 24000, requiresTech: 'drive_tuning',
    energyDraw: 7, mods: { topSpeed: 95, accelMult: 1.3, turnMult: 1.15 } },
  { id: 'e_warp_l', name: 'Warp Coil L', slotType: 'engine', size: 'L', tier: 3, mass: 18, price: 70000, requiresTech: 'graviton_drives',
    energyDraw: 12, mods: { topSpeed: 130, accelMult: 1.6, turnMult: 1.25 } },

  // ===================== CARGO =====================
  { id: 'c_pod_m', name: 'Cargo Pod M', slotType: 'cargo', size: 'M', tier: 1, mass: 4, price: 5000,
    energyDraw: 0, mods: { cargoFlat: 50 } },
  { id: 'c_expander_l', name: 'Hold Expander L', slotType: 'cargo', size: 'L', tier: 2, mass: 12, price: 18000, requiresTech: 'bulk_logistics',
    energyDraw: 0, mods: { cargoFlat: 160 } },
  { id: 'c_compactor_l', name: 'Cargo Compactor L', slotType: 'cargo', size: 'L', tier: 3, mass: 8, price: 46000, requiresTech: 'matter_compression',
    energyDraw: 0, mods: { cargoFlat: 110, cargoCapPct: 0.15 } },

  // ===================== MINING LASERS =====================
  // dps here = ore-HP/s (asteroid damage). Yield comes from asteroidTypes tables.
  { id: 'm_laser_s', name: 'Mining Laser S', slotType: 'mining', size: 'S', tier: 1, mass: 3, price: 0 /* starter, free */,
    energyDraw: 4, dps: 18, range: 240, heatRate: 12, coolRate: 20, directToCargo: false }, // beam_mk1
  { id: 'm_beam_m', name: 'Mining Beam M', slotType: 'mining', size: 'M', tier: 2, mass: 6, price: 22000, requiresTech: 'focused_extraction',
    energyDraw: 8, dps: 30, range: 300, heatRate: 10, coolRate: 24, directToCargo: false }, // beam_mk2
  { id: 'm_pulverizer_l', name: 'Mining Pulverizer L', slotType: 'mining', size: 'L', tier: 3, mass: 13, price: 64000, requiresTech: 'deep_core_mining',
    energyDraw: 16, dps: 48, range: 360, heatRate: 8, coolRate: 30, directToCargo: false, rareOreChance: 0.10 }, // beam_mk3
  { id: 'm_industrial_l', name: 'Industrial Extractor L', slotType: 'mining', size: 'L', tier: 4, mass: 16, price: 46000, requiresTech: 'deep_core_mining',
    energyDraw: 20, dps: 70, range: 420, heatRate: 6, coolRate: 40, directToCargo: true }, // beam_industrial

  // ===================== UTILITY =====================
  { id: 'u_cargo_scanner_s', name: 'Cargo Scanner S', slotType: 'utility', size: 'S', tier: 1, mass: 1, price: 4000,
    energyDraw: 1, mods: { revealCargo: true } },
  { id: 'u_market_data_s', name: 'Market Data Uplink S', slotType: 'utility', size: 'S', tier: 1, mass: 1, price: 6000,
    energyDraw: 1, mods: { marketIntel: true } },
  { id: 'u_shield_hardener_m', name: 'Shield Hardener M', slotType: 'utility', size: 'M', tier: 2, mass: 5, price: 20000, requiresTech: 'deflector_theory',
    energyDraw: 5, mods: { damageReductionPct: 0.12 } },
  { id: 'u_afterburner_m', name: 'Afterburner M', slotType: 'utility', size: 'M', tier: 2, mass: 5, price: 17000, requiresTech: 'drive_tuning',
    energyDraw: 10, mods: { boostTopSpeedPct: 0.40, boostDurS: 4, boostCdS: 12 } },
  { id: 'u_repair_nanobots_m', name: 'Repair Nanobots M', slotType: 'utility', size: 'M', tier: 3, mass: 6, price: 38000, requiresTech: 'nanofabrication',
    energyDraw: 3, mods: { hullRepairOOC: 4 } },
  { id: 'u_tractor_m', name: 'Tractor Beam M', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 12000, requiresTech: 'tractor_systems',
    energyDraw: 3, mods: { magnetRange: 400 } },
  { id: 'u_targeting_m', name: 'Targeting Computer M', slotType: 'utility', size: 'M', tier: 3, mass: 4, price: 40000, requiresTech: 'fire_control',
    energyDraw: 4, mods: { weaponRangePct: 0.15, weaponDmgPct: 0.08 } },
  { id: 'u_sensor_array_l', name: 'Sensor Array L', slotType: 'utility', size: 'L', tier: 3, mass: 8, price: 36000, requiresTech: 'long_range_survey',
    energyDraw: 5, mods: { radarRangePct: 0.60, scanRpBonus: true } },
  { id: 'u_drone_bay_l', name: 'Drone Bay L', slotType: 'utility', size: 'L', tier: 3, mass: 14, price: 80000, requiresTech: 'drone_control',
    energyDraw: 4, mods: { droneBay: 1 } },
  { id: 'u_jump_drive_m', name: 'Jump Drive T2 M', slotType: 'utility', size: 'M', tier: 2, mass: 6, price: 26000, requiresTech: 'drive_tuning',
    energyDraw: 2, mods: { jumpDriveTier: 2 } },
];

export const MODULE_BY_ID = Object.fromEntries(MODULES.map(m => [m.id, m]));
```

```js
// src/data/asteroidTypes.js
// 6 asteroid types. hp[small,large] = ore-HP endpoints (interpolated by size).
// yieldU[small,large] = total ore units released across the mining (interpolated).
// oreTable weights reference ores.js ids; only ores with ore.tier <= tierCap are
// eligible (weights renormalized at roll time). spawnWeight = field composition.
// sizeRange in wu. `look` = VFX hint.

export const ASTEROID_TYPES = [
  {
    id: 'common_rock', hp: [120, 520], yieldU: [8, 22], spawnWeight: 45, sizeRange: [6, 14], tierCap: 0,
    oreTable: { rock_silicate: 0.7, ore_iron: 0.3 },
    look: 'grey lumpy icosphere',
  },
  {
    id: 'metallic', hp: [320, 900], yieldU: [14, 32], spawnWeight: 22, sizeRange: [7, 16], tierCap: 2,
    oreTable: { ore_iron: 0.45, ore_copper: 0.35, ore_titanium: 0.20 },
    look: 'dark metallic specular veins',
  },
  {
    id: 'icy', hp: [180, 640], yieldU: [12, 26], spawnWeight: 14, sizeRange: [8, 18], tierCap: 1,
    oreTable: { ice_water: 0.75, ice_volatiles: 0.25 },
    look: 'translucent blue emissive rim',
  },
  {
    id: 'crystalline', hp: [260, 720], yieldU: [9, 20], spawnWeight: 9, sizeRange: [5, 12], tierCap: 2,
    oreTable: { crystal_silica: 0.7, crystal_lumin: 0.3 },
    look: 'sharp emissive crystal cluster',
  },
  {
    id: 'gas_cloud', hp: [90, 300], yieldU: [16, 30], spawnWeight: 7, sizeRange: [14, 30], tierCap: 2,
    oreTable: { gas_hydrogen: 0.75, gas_helium3: 0.25 },
    look: 'soft additive billboard puff, no hard mesh',
  },
  {
    id: 'rare_exotic', hp: [480, 1200], yieldU: [7, 18], spawnWeight: 3, sizeRange: [6, 13], tierCap: 4,
    oreTable: { ore_platinoid: 0.6, crystal_lumin: 0.25, exotic_xenium: 0.15 },
    look: 'dark dense rock, slow xenium glow',
  },
];

export const ASTEROID_BY_ID = Object.fromEntries(ASTEROID_TYPES.map(a => [a.id, a]));

// Per-sector-tier field generation parameters.
export const FIELD_PARAMS = {
  0: { astCount: 60,  weights: { common_rock: 60, metallic: 25, icy: 15 },                                      tierCap: 1, respawnSec: 90,  clusterRadius: 350 },
  1: { astCount: 90,  weights: { common_rock: 40, metallic: 25, icy: 15, crystalline: 15, gas_cloud: 5 },        tierCap: 2, respawnSec: 120, clusterRadius: 450 },
  2: { astCount: 130, weights: null /* use ASTEROID_TYPES spawnWeight */,                                        tierCap: 3, respawnSec: 150, clusterRadius: 550 },
  3: { astCount: 110, weights: { metallic: 25, crystalline: 25, gas_cloud: 15, rare_exotic: 20, common_rock: 15 }, tierCap: 4, respawnSec: 200, clusterRadius: 600 },
};

// Cargo holds (ship-derived; HUD/handling reads capacity + magnetRange).
export const CARGO_HOLDS = {
  kestrel:  { capacityU: 40,  magnetRange: 90 },
  pelican:  { capacityU: 60,  magnetRange: 110 },
  hauler:   { capacityU: 120, magnetRange: 110 },
  heavy:    { capacityU: 320, magnetRange: 140 },
  industrial: { capacityU: 600, magnetRange: 180 },
};
```

```js
// src/data/enemies.js
// 8 enemy archetypes. Enemies carry their OWN hull stats (NOT player ship hulls --
// the player "Wasp" is a 150-hull fighter; the enemy "Wasp swarmer" is a 60-hull
// throwaway). Stats live here, NOT in ships.js. Uses the 3-layer combatant model
// (shield -> armor -> hull) since enemies run through the combat resolver.
// levelRange skews enemy power within a sector's band.
// `hullClass` is the Art-spec silhouette family the render factory builds
// ('Scout','Fighter','Frigate','Cruiser','Capital') -- a visual hint, not a ship id.
// loot references ores.js / commodities.js / modules.js ids. Values are BASE
// (pre-dangerTier scaling: hull*=1+0.25*tier, shield*=1+0.30*tier, dmg*=1+0.18*tier,
//  bounty*=1+0.5*tier -- applied at spawn from sector dangerTier).

export const ENEMY_TYPES = [
  {
    id: 'wasp_swarmer', name: 'Wasp', hullClass: 'Fighter', aiArchetype: 'swarmer', levelRange: [1, 3],
    hull: 60, armor: 10, armorFlat: 1, shield: 30, shieldRegen: 5, cap: 60, capRegen: 20,
    maxSpeed: 240, accel: 240, turnRate: 4.2, collisionRadius: 12, mass: 16,
    weapons: [{ id: 'w_pulse_s', dmgOverride: 5, rofOverride: 4 }],
    behavior: 'strafe/orbit, packs of 3-6',
    bountyCr: 120, shipClass: 'fighter',
    loot: { creditsRange: [20, 60], drops: [{ id: 'scrap_metal', chance: 0.5, qtyRange: [1, 3] }] },
  },
  {
    id: 'lancer_sniper', name: 'Lancer', hullClass: 'Fighter', aiArchetype: 'sniper', levelRange: [2, 5],
    hull: 90, armor: 20, armorFlat: 2, shield: 80, shieldRegen: 6, cap: 120, capRegen: 22,
    maxSpeed: 180, accel: 120, turnRate: 2.0, collisionRadius: 14, mass: 24,
    weapons: [{ id: 'w_railgun_m', dmgOverride: 40, rofOverride: 0.7, projSpeedOverride: 700, rangeOverride: 1100 }],
    behavior: 'kite at max range, retreat when closed',
    bountyCr: 260, shipClass: 'fighter',
    loot: { creditsRange: [60, 140], drops: [{ id: 'electronics', chance: 0.4, qtyRange: [1, 2] }, { id: 'scrap_metal', chance: 0.6, qtyRange: [2, 4] }] },
  },
  {
    id: 'bruiser_brawler', name: 'Bruiser', hullClass: 'Frigate', aiArchetype: 'brawler', levelRange: [3, 7],
    hull: 420, armor: 160, armorFlat: 8, shield: 160, shieldRegen: 12, cap: 180, capRegen: 24,
    maxSpeed: 160, accel: 130, turnRate: 2.2, collisionRadius: 20, mass: 70,
    weapons: [{ id: 'w_autocannon_m' }, { id: 'w_autocannon_m' }, { id: 'w_pulse_s' }],
    behavior: 'close to <250wu, circle-strafe, relentless pursue',
    bountyCr: 520, shipClass: 'gunship',
    loot: { creditsRange: [120, 300], drops: [{ id: 'ore_iron', chance: 0.6, qtyRange: [3, 8] }, { id: 'w_autocannon_m', chance: 0.05, qtyRange: [1, 1] }] },
  },
  {
    id: 'mule_trader', name: 'Fleeing Trader', hullClass: 'Frigate', aiArchetype: 'fleeing_trader', levelRange: [1, 6],
    hull: 200, armor: 60, armorFlat: 4, shield: 120, shieldRegen: 8, cap: 100, capRegen: 14,
    maxSpeed: 190, accel: 90, turnRate: 1.6, collisionRadius: 18, mass: 55,
    weapons: [{ id: 'w_flak_s', defensiveOnly: true }],
    behavior: 'flee to nearest station/lane, boost when threatened, shoots only if cornered',
    bountyCr: 0, illegalToKill: true, shipClass: 'frigate',
    loot: { creditsRange: [200, 800], drops: [
      { id: 'consumer_goods', chance: 0.5, qtyRange: [4, 12] },
      { id: 'refined_metals', chance: 0.4, qtyRange: [3, 8] },
      { id: 'electronics', chance: 0.25, qtyRange: [2, 5] },
    ] },
  },
  {
    id: 'reaver_pirate', name: 'Reaver', hullClass: 'Frigate', aiArchetype: 'pirate', levelRange: [1, 8],
    hull: 260, armor: 90, armorFlat: 5, shield: 140, shieldRegen: 10, cap: 160, capRegen: 22,
    maxSpeed: 200, accel: 160, turnRate: 2.6, collisionRadius: 18, mass: 60,
    weapons: [{ id: 'w_autocannon_s' }, { id: 'w_pulse_s' }, { id: 'w_missile_m', occasional: true }],
    behavior: 'aggressive pursue+attack, calls 1-2 swarmers, flees at <20% hull',
    bountyCr: 340, shipClass: 'gunship',
    loot: { creditsRange: [100, 400], drops: [
      { id: 'stolen_goods', chance: 0.5, qtyRange: [2, 6] },
      { id: 'w_pulse_s', chance: 0.08, qtyRange: [1, 1] },
    ] },
  },
  {
    id: 'corsair_raider', name: 'Corsair', hullClass: 'Fighter', aiArchetype: 'pirate', levelRange: [4, 10],
    hull: 340, armor: 120, armorFlat: 7, shield: 200, shieldRegen: 12, cap: 200, capRegen: 26,
    maxSpeed: 210, accel: 170, turnRate: 2.8, collisionRadius: 18, mass: 64,
    weapons: [{ id: 'w_autocannon_m' }, { id: 'w_plasma_m', occasional: true }],
    behavior: 'mid-tier pirate elite, frontier ambush packs',
    bountyCr: 620, shipClass: 'gunship',
    loot: { creditsRange: [200, 600], drops: [
      { id: 'stolen_goods', chance: 0.5, qtyRange: [3, 8] },
      { id: 'alloys', chance: 0.35, qtyRange: [2, 6] },
      { id: 'w_plasma_m', chance: 0.06, qtyRange: [1, 1] },
    ] },
  },
  {
    id: 'patrol_lawman', name: 'Patrol Interceptor', hullClass: 'Fighter', aiArchetype: 'brawler', levelRange: [3, 9],
    hull: 380, armor: 140, armorFlat: 7, shield: 240, shieldRegen: 14, cap: 220, capRegen: 28,
    maxSpeed: 200, accel: 160, turnRate: 2.6, collisionRadius: 18, mass: 70,
    weapons: [{ id: 'w_pulse_m' }, { id: 'w_flak_s' }],
    behavior: 'lawful patrol; hostile only if player wanted; assists at Trusted+ rep',
    bountyCr: 0, factionLawful: true, shipClass: 'gunship',
    loot: { creditsRange: [0, 0], drops: [{ id: 'munitions', chance: 0.3, qtyRange: [1, 3] }] },
  },
  {
    id: 'dreadnought_boss', name: "Dreadnought 'Iron Maw'", hullClass: 'Capital', aiArchetype: 'miniboss_capital', levelRange: [10, 15],
    hull: 6000, armor: 2200, armorFlat: 25, shield: 2400, shieldRegen: 60, shieldRegenDelay: 6, cap: 2000, capRegen: 40,
    maxSpeed: 70, accel: 30, turnRate: 0.4, collisionRadius: 60, mass: 2000,
    weapons: [
      { id: 'w_torpedo_l', count: 2, turret: true }, { id: 'w_heavybeam_l', count: 2, turret: true },
      { id: 'w_autocannon_m', count: 6, turret: true }, { id: 'w_flak_s', count: 4, turret: true },
    ],
    subsystems: { turretHp: 300, spawnsSwarmers: true, phases: [0.66, 0.33] },
    behavior: 'slow fortress, destructible turrets, spawns swarmers, phases at 66%/33%',
    bountyCr: 12000, shipClass: 'capital',
    loot: { creditsRange: [4000, 9000], guaranteed: [{ id: 'exotic_xenium', qtyRange: [10, 25] }],
      drops: [{ id: 'quantum_cores', chance: 1.0, qtyRange: [1, 3] }, { id: 'w_siege_l', chance: 0.5, qtyRange: [1, 1] }],
      blueprint: true },
  },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMY_TYPES.map(e => [e.id, e]));

// Danger-tier scaling applied at spawn (from sector dangerTier 0..5).
export const ENEMY_SCALING = {
  hullMult: t => 1 + 0.25 * t,
  shieldMult: t => 1 + 0.30 * t,
  armorFlatMult: t => 1 + 0.20 * t,
  weaponDmgMult: t => 1 + 0.18 * t,
  bountyMult: t => 1 + 0.5 * t,
  speedMult: t => 1 + 0.04 * t,
};
```

```js
// src/data/techTree.js
// 27-node research DAG across 4 branches (Combat / Industry / Drives / Logistics).
// name = human-readable label. cost = { credits, rp }. prereqs[] must all be
// researched first. unlocks[] flags modules/ships buyable, raises droneTierCap,
// or sets global efficiency mults. Every techTree id referenced by ships.js /
// modules.js / automation.js resolves here; every unlock id below resolves to a
// real ship/module id (verified). RP earned via scanning/missions (spent here).

export const TECH_NODES = [
  // ---------------- COMBAT branch ----------------
  { id: 'combat_basics',      name: 'Combat Basics',        branch: 'combat', prereqs: [],                                   cost: { credits: 6000,    rp: 10 },  unlocks: { ships: ['wasp'], modules: ['w_pulse_s', 'w_autocannon_s'] } },
  { id: 'beam_focusing',      name: 'Beam Focusing',        branch: 'combat', prereqs: ['combat_basics'],                    cost: { credits: 18000,   rp: 30 },  unlocks: { modules: ['w_pulse_m', 'w_beam_m'] } },
  { id: 'kinetic_drivers',    name: 'Kinetic Drivers',      branch: 'combat', prereqs: ['combat_basics'],                    cost: { credits: 22000,   rp: 35 },  unlocks: { modules: ['w_autocannon_m', 'w_railgun_m'] } },
  { id: 'guided_ordnance',    name: 'Guided Ordnance',      branch: 'combat', prereqs: ['combat_basics'],                    cost: { credits: 26000,   rp: 45 },  unlocks: { modules: ['w_missile_m'] } },
  { id: 'plasma_dynamics',    name: 'Plasma Dynamics',      branch: 'combat', prereqs: ['kinetic_drivers', 'beam_focusing'], cost: { credits: 90000,   rp: 150 }, unlocks: { modules: ['w_plasma_m'] } },
  { id: 'deflector_theory',   name: 'Deflector Theory',     branch: 'combat', prereqs: [],                                   cost: { credits: 12000,   rp: 20 },  unlocks: { modules: ['s_capacitor_m', 'u_shield_hardener_m'] } },
  { id: 'hardened_deflectors',name: 'Hardened Deflectors',  branch: 'combat', prereqs: ['deflector_theory'],                 cost: { credits: 100000,  rp: 140 }, unlocks: { modules: ['s_aegis_l'], efficiency: { shieldRegenMult: 0.05 } } },
  { id: 'strike_craft',       name: 'Strike Craft',         branch: 'combat', prereqs: ['combat_basics'],                    cost: { credits: 30000,   rp: 40 },  unlocks: { ships: ['hornet'] } },
  { id: 'fire_control',       name: 'Fire Control',         branch: 'combat', prereqs: ['strike_craft'],                     cost: { credits: 80000,   rp: 110 }, unlocks: { modules: ['u_targeting_m'] } },
  { id: 'warship_license',    name: 'Warship License',      branch: 'combat', prereqs: ['strike_craft'],                     cost: { credits: 120000,  rp: 120 }, unlocks: { ships: ['bastion'] } },
  { id: 'capital_weapons',    name: 'Capital Weapons',      branch: 'combat', prereqs: ['warship_license', 'fire_control'],  cost: { credits: 600000,  rp: 400 }, unlocks: { ships: ['warden'], modules: ['w_heavybeam_l', 'w_torpedo_l'] } },
  { id: 'capital_hulls',      name: 'Capital Hulls',        branch: 'combat', prereqs: ['capital_weapons'],                  cost: { credits: 900000,  rp: 600 }, unlocks: { ships: ['colossus'] } },
  { id: 'flagship_command',   name: 'Flagship Command',     branch: 'combat', prereqs: ['capital_hulls', 'graviton_drives'],cost: { credits: 2500000, rp: 1200 },unlocks: { ships: ['leviathan'], modules: ['w_siege_l'] } },

  // ---------------- INDUSTRY branch ----------------
  { id: 'industrial_mining',  name: 'Industrial Mining',    branch: 'industry', prereqs: [],                                 cost: { credits: 25000,   rp: 30 },  unlocks: { ships: ['ironback'], modules: ['m_beam_m'] } },
  { id: 'focused_extraction', name: 'Focused Extraction',   branch: 'industry', prereqs: ['industrial_mining'],             cost: { credits: 30000,   rp: 40 },  unlocks: { modules: ['m_beam_m'], efficiency: { miningYieldMult: 0.10 } } },
  { id: 'deep_core_mining',   name: 'Deep-Core Mining',     branch: 'industry', prereqs: ['focused_extraction'],            cost: { credits: 110000,  rp: 160 }, unlocks: { modules: ['m_pulverizer_l', 'm_industrial_l'], efficiency: { miningYieldMult: 0.15 } } },
  { id: 'bulk_logistics',     name: 'Bulk Logistics',       branch: 'industry', prereqs: [],                                 cost: { credits: 20000,   rp: 25 },  unlocks: { ships: ['atlas'], modules: ['c_expander_l'] } },
  { id: 'matter_compression', name: 'Matter Compression',   branch: 'industry', prereqs: ['bulk_logistics'],                cost: { credits: 90000,   rp: 130 }, unlocks: { modules: ['c_compactor_l'] } },

  // ---------------- DRIVES branch ----------------
  { id: 'drive_tuning',       name: 'Drive Tuning',         branch: 'drives', prereqs: [],                                   cost: { credits: 15000,   rp: 20 },  unlocks: { modules: ['e_fusion_m', 'u_afterburner_m', 'u_jump_drive_m'] } },
  { id: 'graviton_drives',    name: 'Graviton Drives',      branch: 'drives', prereqs: ['drive_tuning'],                     cost: { credits: 95000,   rp: 150 }, unlocks: { modules: ['e_warp_l'], efficiency: { energyRegenMult: 0.08 } } },
  { id: 'long_range_survey',  name: 'Long-Range Survey',    branch: 'drives', prereqs: ['drive_tuning'],                     cost: { credits: 60000,   rp: 90 },  unlocks: { ships: ['ranger'], modules: ['u_sensor_array_l'], flags: ['wormhole_access'] } },

  // ---------------- LOGISTICS branch ----------------
  { id: 'tractor_systems',    name: 'Tractor Systems',      branch: 'logistics', prereqs: [],                                cost: { credits: 10000,   rp: 15 },  unlocks: { modules: ['u_tractor_m'] } },
  { id: 'drone_control',      name: 'Drone Control',        branch: 'logistics', prereqs: ['tractor_systems'],              cost: { credits: 70000,   rp: 100 }, unlocks: { modules: ['u_drone_bay_l'], droneTierCap: 1 } },
  { id: 'drone_swarm',        name: 'Drone Swarm',          branch: 'logistics', prereqs: ['drone_control'],                cost: { credits: 200000,  rp: 260 }, unlocks: { droneTierCap: 2, extraDronePerBay: 1 } },
  { id: 'autonomous_fleets',  name: 'Autonomous Fleets',    branch: 'logistics', prereqs: ['drone_swarm'],                  cost: { credits: 500000,  rp: 500 }, unlocks: { droneTierCap: 3, npcTraderHiring: true } },
  { id: 'nanofabrication',    name: 'Nanofabrication',      branch: 'logistics', prereqs: ['drone_control'],                cost: { credits: 140000,  rp: 180 }, unlocks: { modules: ['u_repair_nanobots_m'] } },
  { id: 'outpost_charter',    name: 'Outpost Charter',      branch: 'logistics', prereqs: ['autonomous_fleets'],            cost: { credits: 800000,  rp: 700 }, unlocks: { droneTierCap: 4, outpostConstruction: true } },
];

export const TECH_BY_ID = Object.fromEntries(TECH_NODES.map(n => [n.id, n]));
```

```js
// src/data/missions.js
// 10 procedural mission templates sharing ONE multiplicative reward family:
//   reward_cr = round(BASE[type] * f_dist * f_risk * f_value * f_faction * f_time)
// plus an 8-beat hand-authored story spine. All rewardFormula fields below are
// concrete, evaluable expressions (the runtime supplies the input vars). RISK_MULT
// and the f_* helpers are shared constants so every type calibrates identically.

export const MISSION_TUNING = {
  BASE: {            // base reward (cr) per type
    cargo_delivery: 120, bulk_trade: 150, bounty_hunt: 200, mining_quota: 90,
    salvage_retrieval: 130, escort: 180, patrol_clear: 220, smuggling_run: 250,
    passenger_transport: 110, recon_scan: 100,
  },
  RISK_MULT: [1.0, 1.3, 1.7, 2.2, 3.0],   // by riskTier 0..4
  BASE_REP: {        // rep gain on success to offering faction
    cargo_delivery: 3, bulk_trade: 3, bounty_hunt: 5, mining_quota: 2,
    salvage_retrieval: 3, escort: 4, patrol_clear: 5, smuggling_run: 4,
    passenger_transport: 2, recon_scan: 4,
  },
  distDivisor: 2000,        // f_dist = 1 + distance_wu / 2000
  valueDivisor: 8000,       // cargo f_value = 1 + cargoValue_cr / 8000
  faction: { friendlyThreshold: 25, loyaltyBonus: 1.15 }, // f_faction
  rush: { fTime: 1.35, slackMult: 0.5 }, // f_time when rush flagged (time halved)
  cruiseSpeedRef: 140,     // wu/s, for travelEstimate
  slackDefault: 2.2,       // time_limit = (travel + task) * slack
  collateralPct: 0.25,     // bulk_trade & smuggling deposit
  refreshSec: 600,         // board refresh epoch
  maxActive: 8,
};

export const MISSION_TEMPLATES = [
  {
    type: 'cargo_delivery', riskTierRange: [0, 1], chainable: true,
    completionEvent: 'cargo.delivered',
    rewardFormula: 'round(120 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 20) * slack)', taskTime: 20,
    failureCondition: 'timer OR cargo lost (ship destroyed)',
    constraints: { needsCargoSpace: true },
  },
  {
    type: 'bulk_trade', riskTierRange: [1, 2], chainable: true, collateral: true,
    completionEvent: 'trade.sold (aggregated to quota)',
    rewardFormula: 'round(150 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + quotaQty*1.5) * slack)', taskTime: 'quotaQty*1.5',
    failureCondition: 'timer OR fail to sell quota; collateral forfeited',
    constraints: { collateralPct: 0.25 },
  },
  {
    type: 'bounty_hunt', riskTierRange: [2, 4], chainable: true,
    completionEvent: 'enemy.killed (entityId==targetId)',
    rewardFormula: 'round(200 * (1 + distance/2000) * RISK_MULT[riskTier] * targetStrength * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 60) * slack)', taskTime: 60,
    failureCondition: 'timer OR target despawns/flees sector',
    constraints: { fValueIsTargetStrength: true },
  },
  {
    type: 'mining_quota', riskTierRange: [1, 3], chainable: true,
    completionEvent: 'mining.yield (aggregated to quota)',
    rewardFormula: 'round(90 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + quotaQty*3) * slack)', taskTime: 'quotaQty*3',
    failureCondition: 'timer',
    constraints: {},
  },
  {
    type: 'salvage_retrieval', riskTierRange: [1, 3], chainable: true,
    completionEvent: 'cargo.delivered (itemId==salvageId)',
    rewardFormula: 'round(130 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 30) * slack)', taskTime: 30,
    failureCondition: 'timer OR wreck destroyed before pickup',
    constraints: {},
  },
  {
    type: 'escort', riskTierRange: [2, 4], chainable: false,
    completionEvent: 'dock.entered@dest with escortee.alive',
    rewardFormula: 'round(180 * (1 + distance/2000) * RISK_MULT[riskTier] * targetStrength * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 90) * slack)', taskTime: 90,
    failureCondition: 'escortee destroyed OR abandoned (player leaves sector)',
    constraints: { fValueIsTargetStrength: true },
  },
  {
    type: 'patrol_clear', riskTierRange: [2, 4], chainable: true,
    completionEvent: 'all spawn-tagged enemy.killed (clearCount reached)',
    rewardFormula: 'round(220 * (1 + distance/2000) * RISK_MULT[riskTier] * targetStrength * f_faction * f_time)',
    timeFormula: 'round((distance/140 + clearCount*45) * slack)', taskTime: 'clearCount*45',
    failureCondition: 'timer expires with hostiles remaining',
    constraints: { fValueIsTargetStrength: true },
  },
  {
    type: 'smuggling_run', riskTierRange: [2, 4], chainable: false, collateral: true,
    completionEvent: 'cargo.delivered (itemId==contrabandId) covertly',
    rewardFormula: 'round(250 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 20) * slack)', taskTime: 20,
    failureCondition: 'scanned with contraband OR timer; collateral forfeited on bust',
    constraints: { collateralPct: 0.25, repToLawFaction: -3 },
  },
  {
    type: 'passenger_transport', riskTierRange: [0, 2], chainable: true,
    completionEvent: 'dock.entered@dest',
    rewardFormula: 'round(110 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 20) * slack)', taskTime: 20,
    failureCondition: 'timer OR ship destroyed (passenger lost)',
    constraints: {},
  },
  {
    type: 'recon_scan', riskTierRange: [1, 3], chainable: true,
    completionEvent: 'scan.completed (targetId in objective set)',
    rewardFormula: 'round(100 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + scanTargets*0.25) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + scanTargets*25) * slack)', taskTime: 'scanTargets*25',
    failureCondition: 'timer OR scan-target despawns',
    constraints: { fValueIsScanTargets: true },
  },
];

// Offer-mix weights by station type (order matches MISSION_TEMPLATES types).
export const OFFER_MIX = {
  // [cargo, trade, bounty, mining, salvage, escort, patrol, smuggling, passenger, recon]
  mining:     [3, 2, 1, 4, 2, 1, 1, 0, 1, 1],
  refinery:   [3, 2, 1, 4, 2, 1, 1, 0, 1, 1],
  fab:        [3, 2, 1, 2, 2, 1, 1, 0, 1, 1],
  trade_hub:  [4, 4, 1, 1, 1, 2, 1, 1, 3, 1],
  military:   [1, 1, 4, 0, 1, 2, 4, 0, 1, 2],
  research:   [2, 1, 1, 1, 2, 1, 1, 0, 1, 4],
  blackmarket:[2, 1, 3, 2, 3, 1, 2, 2, 1, 2],
};

// 8-beat story spine FSM (introduces systems in order).
export const STORY_BEATS = [
  { beat: 0, id: 'cold_start',     objective: 'mining_quota: mine 10u rock_silicate, deliver to home station',
    reward: { credits: 400, rep: { faction: 'home', amount: 5 }, unlock: 'm_laser_s' }, introduces: 'mining', next: 1 },
  { beat: 1, id: 'honest_work',    objective: 'cargo_delivery: carry 12u to neighbor station',
    reward: { credits: 600, unlock: 'trade_tutorial' }, introduces: 'trade', next: 2 },
  { beat: 2, id: 'first_blood',    objective: 'bounty_hunt: kill 1 weak pirate (lvl1)',
    reward: { credits: 800, unlock: 'w_pulse_s' }, introduces: 'combat', next: 3 },
  { beat: 3, id: 'bigger_boat',    objective: 'purchase any T2 hull at shipyard', precredits: 1500,
    reward: { credits: 1000, milestone: 'cargo+20u' }, introduces: 'shipyard', next: 4 },
  { beat: 4, id: 'pick_a_side',    objective: 'accept Traders(mts) OR Patrol(scn) OR Free(free) intro contract', branch: true,
    reward: { credits: 1200, rep: { chosen: 15, opposing: -10 } }, introduces: 'factions', next: 5 },
  { beat: 5, id: 'proving_ground', objective: 'branch chain: mts=bulk_trade x3 / scn=patrol_clear x2 / free=smuggling_run x2',
    reward: { credits: 2500, unlock: 'faction_module' }, introduces: 'chaining+passive_preview', next: 6 },
  { beat: 6, id: 'empire_seed',    objective: 'deploy first passive asset (drone OR trader OR outpost)', precredits: 8000,
    reward: { credits: 3000, unlock: 'passive_income' }, introduces: 'passive_income', next: 7 },
  { beat: 7, id: 'deep_reach',     objective: 'amass 100000cr net worth AND rep>=50 with chosen faction, THEN buy capital hull OR build+defend outpost (3-wave)',
    reward: { title: 'Sector Baron', unlock: 'newgame_plus' }, introduces: 'endgame', next: null },
];
```

```js
// src/data/automation.js
// Passive-income content + the master balance anchor A(T): the designer-fixed
// sustained ACTIVE-play income (cr/min) per progression tier. EVERY passive yield
// is sized as a fraction of A(T) so total passive net <= 0.45*A(T) -- always below
// active play. This table is the economic spine the whole game calibrates against.

export const BALANCE = {
  // A(T): sustained active cr/min at tier T (the progression curve's backbone).
  activeRefByTier: { 1: 250, 2: 600, 3: 1400, 4: 3200, 5: 7000 },
  passiveCapFrac: 0.45,   // net passive <= 0.45*A(T)
  overflowEff: 0.25,      // gross above cap converted at 25%
  offlineEff: 0.6,        // away-progress multiplier (presence always better)
  offlineCapSec: 14400,   // 4h offline catch-up cap
  distressGraceSec: 120,
  fleetCapByTier: { 1: 2, 2: 3, 3: 4, 4: 6, 5: 8 },
};

export const DRONES = [
  { id: 'drone_mk1', tier: 1, mineRate: 0.8, bufferCap: 60,  fuelMax: 240, fuelRate: 1.0, durabilityMax: 40,  deployRange: 350, cost: 4000,  upkeepPerMin: 6 },
  { id: 'drone_mk2', tier: 2, mineRate: 1.6, bufferCap: 120, fuelMax: 360, fuelRate: 1.0, durabilityMax: 70,  deployRange: 400, cost: 12000, upkeepPerMin: 14 },
  { id: 'drone_mk3', tier: 3, mineRate: 3.0, bufferCap: 240, fuelMax: 540, fuelRate: 1.0, durabilityMax: 110, deployRange: 450, cost: 34000, upkeepPerMin: 30 },
  { id: 'drone_mk4', tier: 4, mineRate: 5.5, bufferCap: 480, fuelMax: 720, fuelRate: 1.0, durabilityMax: 180, deployRange: 500, cost: 90000, upkeepPerMin: 60 },
];

export const TRADERS = [
  { id: 'trader_hauler_l',    tier: 1, cargoVol: 80,  cycleTime: 180, tradeEff: 0.90, hireCost: 9000,  upkeepPerMin: 18, baseLossPerCycle: 0.02 },
  { id: 'trader_freighter_m', tier: 2, cargoVol: 200, cycleTime: 240, tradeEff: 0.92, hireCost: 28000, upkeepPerMin: 40, baseLossPerCycle: 0.025 },
  { id: 'trader_bulk_h',      tier: 3, cargoVol: 480, cycleTime: 320, tradeEff: 0.94, hireCost: 75000, upkeepPerMin: 85, baseLossPerCycle: 0.03 },
];

export const OUTPOSTS = [
  { id: 'outpost_refinery',  recipe: { inputs: { ore: 2 }, output: { alloys: 1 } }, outRate: 0.5, storageCap: 300, buildCost: 60000,  defense: 20, upkeepPerMin: 50 },
  { id: 'outpost_fuelsynth', recipe: { inputs: { volatiles: 1 }, output: { fuel_cells: 1 } }, outRate: 0.7, storageCap: 400, buildCost: 45000, defense: 15, upkeepPerMin: 40 },
  { id: 'outpost_habhub',    recipe: { passive: true, creditGen: 12, capBuffer: 1500 }, outRate: 12, storageCap: 1500, buildCost: 110000, defense: 30, upkeepPerMin: 90 },
];

export const OUTPOST_UPGRADE = { outRateMult: 1.6, storageCapMult: 1.7, defensePerLevel: 15, upgradeCostFn: 'round(0.8*buildCost*level)', upkeepMult: 1.5, maxLevel: 5 };

export const FLEET_ORDERS = ['mine', 'trade', 'escort', 'guard', 'idle'];
```

---

## PROGRESSION CURVE

The whole economy is anchored to **A(T) = sustained competent-active income**: T1 250, T2 600, T3 1400, T4 3200, T5 7000 cr/min (in `automation.js → BALANCE.activeRefByTier`). Every other number is back-solved against it, so passive income is hard-capped at 0.45×A(T) (always below active play) and ship/module prices land in deliberate "minutes-of-income" bands.

**Stage 0 — First 15 min (raw survival → first weapon).** The starter Kestrel (40u hold, free `m_laser_s` mining beam @18 ore-HP/s) mines common rock at a measured **~95 cr/min** floor (rock is 70% silicate @4cr + 30% iron @12cr ≈ 6.4 cr/u — deliberately lean so it's a floor, not the main income). What actually carries the first 15 minutes is the **scripted story spine**: beats B0–B2 hand over 400 + 600 + 800 = **1,800 cr** plus free unlocks, and early generated missions add ~150–190 cr/min on top of mining. Net: the player clears the **first module (`w_pulse_s` @4,500cr = 18 min of pure A(1), but ~10–12 min with story+mission income)** inside the target window. Switching to a metallic field roughly doubles mining to ~15 cr/min → with the mk2 beam ~24 cr/min, so the income ramp is visible as you push outward.

**Stage 1 — ~1–2.5 hr (first real ship).** At A(1)=250 cr/min, the T1 hulls cost **88 min (Pelican 22k) / 112 min (Wasp 28k) / 140 min (Mule 35k)** of pure tier income — realistically ~2–2.5 hr blending mining, trade, and missions, since the player is climbing from the T0 floor toward A(1). Trade opens here: the worked `refined_metals` route (refinery→fab) yields ~35 cr/u margin, ~4,900 cr per 200u trip with price-impact, **~1,220 cr/min as a fresh burst** — above sustained A(2) by design, because stock-drift decays an over-farmed route within ~2 min and forces diversification. Each lane is a strong-but-temporary find, not a treadmill.

**Stage 2 — a few hr (mid-tier ships + tech).** T2 hulls (Drifter 95k / Hornet 110k / Ironback 130k) = **2.6–3.6 hr** of A(2); T3 hulls (Bastion 320k / Atlas 380k / Ranger 290k) = **3.8–4.5 hr** of A(3). Tech nodes interleave cleanly: the cheap roots (tractor 10k, drive_tuning 15k, bulk_logistics 20k) are early QoL; mid nodes (60–140k) gate the T3 ships and 0.10–0.15 efficiency mults; expensive nodes (capital_weapons 600k, capital_hulls 900k) pace the endgame. Because each tier's hull costs ~1.5–4.5× its hourly income, every upgrade is felt as earned, never trivial and never a wall.

**Stage 3 — long-term (passive empire → capital flagship).** B6 seeds passive income (drone 4k / trader hire 9k / outpost build 45–110k), capped at 0.45×A(T): T2 270, T3 630, T4 1,440, T5 3,150 cr/min — meaningful but always sub-active, so automation accelerates the grind without replacing play. The endgame north star is **100k net worth + a capital hull**: Warden 950k / Colossus 1.4M = ~5–7 hr of A(4), and the T5 Leviathan at 4.5M is **10.7 hr of pure A(5)** — in practice a **30+ hr** blended-income goal once passive stacks, fleet upkeep bites, and frontier risk taxes throughput. The exotic value ladder (xenium @260 cr/u, quantum cores @880, dreadnought boss dropping 4,000–9,000 cr + guaranteed rare module) gives the frontier the margin to fund that climb.

**Files:** all 11 written and validated at `C:\Users\93rob\Documents\GitHub\SpaceFace\src\data\` — `ores.js`, `commodities.js`, `factions.js`, `sectors.js`, `ships.js`, `modules.js`, `asteroidTypes.js`, `enemies.js`, `techTree.js`, `missions.js`, `automation.js`. Cross-reference integrity (every faction/sector/ship/module/tech/ore/commodity id resolves), neighbor-graph symmetry, and the three mission worked-examples (385/3157/300) were all verified programmatically.
