// src/data/automation.js – passive income assets + economy balance anchor.
// activeRefByTier is an ARRAY per ARCHITECTURE §3.9 (index 0 = tier 1).
// Commodity refs use cmdty_ prefix. Pure data, no imports.

export const AUTO_BALANCE = {
  // A(T): sustained active cr/min at tier T (index = tier-1, so [0]=T1 .. [4]=T5).
  activeRefByTier: [250, 600, 1400, 3200, 7000],
  passiveCapFrac: 0.45,
  overflowEff: 0.25,
  offlineEff: 0.6,
  offlineCapSec: 14400,
  distressGraceSec: 120,
  fleetCapByTier: [2, 3, 4, 6, 8],
};

export const DRONES = [
  { id: 'drone_mk1', tier: 1, mineRate: 0.8,  bufferCap: 60,  fuelMax: 240, fuelRate: 1.0, durabilityMax: 40,  deployRange: 350, cost: 4000,  upkeepPerMin: 6  },
  { id: 'drone_mk2', tier: 2, mineRate: 1.6,  bufferCap: 120, fuelMax: 360, fuelRate: 1.0, durabilityMax: 70,  deployRange: 400, cost: 12000, upkeepPerMin: 14 },
  { id: 'drone_mk3', tier: 3, mineRate: 3.0,  bufferCap: 240, fuelMax: 540, fuelRate: 1.0, durabilityMax: 110, deployRange: 450, cost: 34000, upkeepPerMin: 30 },
  { id: 'drone_mk4', tier: 4, mineRate: 5.5,  bufferCap: 480, fuelMax: 720, fuelRate: 1.0, durabilityMax: 180, deployRange: 500, cost: 90000, upkeepPerMin: 60 },
];

export const TRADERS = [
  { id: 'trader_hauler_l',    tier: 1, cargoVol: 80,  cycleTime: 180, tradeEff: 0.90, hireCost: 9000,  upkeepPerMin: 18, baseLossPerCycle: 0.02  },
  { id: 'trader_freighter_m', tier: 2, cargoVol: 200, cycleTime: 240, tradeEff: 0.92, hireCost: 28000, upkeepPerMin: 40, baseLossPerCycle: 0.025 },
  { id: 'trader_bulk_h',      tier: 3, cargoVol: 480, cycleTime: 320, tradeEff: 0.94, hireCost: 75000, upkeepPerMin: 85, baseLossPerCycle: 0.03  },
];

export const OUTPOSTS = [
  {
    id: 'outpost_refinery',
    recipe: { inputs: { cmdty_ore_iron: 2 }, output: { cmdty_alloys: 1 } },
    outRate: 0.5, storageCap: 300, buildCost: 60000,  defense: 20, upkeepPerMin: 50,
  },
  {
    id: 'outpost_fuelsynth',
    recipe: { inputs: { cmdty_volatiles: 1 }, output: { cmdty_fuel_cells: 1 } },
    outRate: 0.7, storageCap: 400, buildCost: 45000,  defense: 15, upkeepPerMin: 40,
  },
  {
    id: 'outpost_habhub',
    recipe: { passive: true, creditGen: 12, capBuffer: 1500 },
    outRate: 12, storageCap: 1500, buildCost: 110000, defense: 30, upkeepPerMin: 90,
  },
];
