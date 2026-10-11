// src/data/sites.js — asteroid site machine catalog + balance anchors.
// Design: design/ASTEROID_SITES_BRIEF.md. IDs use sm_ (site machine) / sr_ (site recipe)
// prefixes and are save-stable per src/data/AGENTS.md. Pure data, no imports.
//
// The one law this data serves (brief §1): every machine reads its 8-cell contact ring.
// Solid neighbors feed it; hollow neighbors are access. Nothing in this table may grant
// output that ignores the ring for the geology machines, and nothing may compensate a
// machine for contacts the player drilled away.

// Per-minute yield of ONE solid contact cell, by what that cell is.
// 'matrix' = silicate matrix (drill tile type 'dirt'), 'basalt' = dense basalt ('rock').
// Ore veins pay their own commodity at a tier-scaled trickle: preserving a rich vein as a
// contact is a long-term annuity; drilling it out is an immediate lump. Both must stay real.
export const CONTACT_YIELD = {
  matrixPerMin: 1.2,       // cmdty_silicate from silicate matrix
  basaltPerMin: 0.45,      // cmdty_silicate from dense basalt (general mineral mass)
  orePerMinByTier: [1.2, 0.8, 0.45, 0.18, 0.06], // vein contact → that vein's ore, by ore tier 0-4
  oreValuePerMinCap: 24,   // nominal credits/min/contact; valuable veins cannot bypass the factory ladder
  gasPowerPerContact: 8,   // MW per gas contact (gas tap, generate mode)
  gasFeedPerMinPerContact: 1.0, // cmdty_gas_hydrogen per gas contact (feedstock mode)
};

// The six starter machines (brief §3). `power` < 0 draws from the network, > 0 generates.
// `cost` is the §3 local + imported split: Regocrete is producible on-site later; the
// Machine Control Unit is the imported part that gives ship hauling industrial meaning.
export const SITE_MACHINES = [
  {
    id: 'sm_massline_core',
    name: 'Massline Core',
    short: 'Core',
    verb: 'anchor',
    desc: 'Feeds 12 MW down the massline umbilical and exposes the exterior attachment point. Your first installation already makes this asteroid a permanent claim.',
    power: 12,
    usesGeology: false,
    cost: { cmdty_regocrete: 2, cmdty_control_unit: 1, cmdty_refined_metals: 1 },
    installS: 8,
    unique: true, // one command/power core per asteroid; the first install owns persistence
  },
  {
    id: 'sm_extractor',
    name: 'Geological Extractor',
    short: 'Extractor',
    verb: 'extract',
    desc: 'Continuously works every solid contact face: silicate matrix, dense basalt, and live ore veins each pay their own material.',
    power: -6,
    usesGeology: true,
    cost: { cmdty_regocrete: 2, cmdty_control_unit: 1 },
    installS: 6,
  },
  {
    id: 'sm_gas_tap',
    name: 'Gas Tap',
    short: 'Gas Tap',
    verb: 'generate',
    desc: 'Safely interfaces sealed gas pockets without breaching them. Choose power, hydrogen for fuel cells and advanced controllers, or a split of both.',
    power: 0, // contributes via mode + gas contacts; see CONTACT_YIELD
    usesGeology: true,
    requiresContact: 'gas',
    modes: ['generate', 'feedstock', 'split'],
    defaultMode: 'generate',
    cost: { cmdty_regocrete: 2, cmdty_control_unit: 1, cmdty_refined_metals: 1 },
    installS: 6,
  },
  {
    id: 'sm_refinery',
    name: 'Refinery',
    short: 'Refinery',
    verb: 'transform',
    desc: 'Processes lane-fed materials with power. Matching preserved mineral and gas faces accelerate the selected recipe; bare floor still works.',
    power: -8,
    usesGeology: false,
    modes: ['sr_smelt_iron', 'sr_fuse_silica', 'sr_blend_alloys', 'sr_synthesize_fuel'],
    defaultMode: 'sr_smelt_iron',
    cost: { cmdty_regocrete: 4, cmdty_control_unit: 1, cmdty_refined_metals: 2 },
    installS: 7,
  },
  {
    id: 'sm_fabricator',
    name: 'Fabricator',
    short: 'Fabricator',
    verb: 'fabricate',
    desc: 'Discrete assembly line. Preserved specialist veins accelerate matched builds. Courier mode maintains the fleet and replaces lost pods.',
    power: -10,
    usesGeology: false,
    modes: ['sr_fab_courier', 'sr_cast_regocrete', 'sr_fab_electronics',
      'sr_fab_hullplate', 'sr_fab_circuitry', 'sr_fab_control_unit'],
    defaultMode: 'sr_fab_courier',
    cost: { cmdty_regocrete: 3, cmdty_control_unit: 1, cmdty_electronics: 2 },
    installS: 7,
  },
  {
    id: 'sm_cargo_port',
    name: 'Cargo Port',
    short: 'Cargo Port',
    verb: 'route',
    desc: 'Buffers exports, launches courier pods and adds 12 units/min of throughput to its material network. The laser never touches refined output.',
    power: -4,
    usesGeology: false,
    storeBonus: 120,
    cost: { cmdty_regocrete: 5, cmdty_control_unit: 1, cmdty_electronics: 1 },
    installS: 8,
  },
];

// Refinery modes run CONTINUOUSLY (units/min with fractional carry). Fabricator recipes are
// DISCRETE builds (load inputs, assemble for buildS, unload the batch). Distinct verbs and feel.
// Contact bonuses change speed, never material bills: preserve selected faces to specialize a
// processing pocket. All commodity batches earn at least 20% gross margin at catalog baseline.
export const SITE_RECIPES = [
  {
    id: 'sr_smelt_iron', machine: 'sm_refinery', name: 'Smelt Iron',
    inputs: { cmdty_ore_iron: 2 }, output: { cmdty_refined_metals: 1 },
    inputRatePerMin: 3,
    contactOres: ['cmdty_ore_iron'],
  },
  {
    id: 'sr_fuse_silica', machine: 'sm_refinery', name: 'Fuse Silica',
    inputs: { cmdty_silicate: 3 }, output: { cmdty_purified_silica: 1 },
    inputRatePerMin: 4.5,
    contactKinds: ['matrix', 'basalt'],
  },
  {
    id: 'sr_cast_regocrete', machine: 'sm_fabricator', name: 'Cast Regocrete',
    inputs: { cmdty_silicate: 2, cmdty_refined_metals: 1 }, output: { cmdty_regocrete: 2 },
    buildS: 45,
    contactKinds: ['matrix', 'basalt'],
  },
  {
    id: 'sr_fab_electronics', machine: 'sm_fabricator', name: 'Print Electronics',
    inputs: { cmdty_purified_silica: 2, cmdty_refined_metals: 1 }, output: { cmdty_electronics: 3 },
    buildS: 45,
    contactOres: ['cmdty_ore_copper', 'cmdty_ore_silverium', 'cmdty_ore_goldium'],
  },
  {
    id: 'sr_fab_courier', machine: 'sm_fabricator', name: 'Assemble Courier Pod',
    inputs: { cmdty_refined_metals: 1, cmdty_purified_silica: 1, cmdty_electronics: 1 },
    output: { pod: 1 },
    buildS: 90,
    contactOres: ['cmdty_ore_titanium'],
  },
  // Industry expansion: existing commodities, machines and production owner. No market-price
  // overrides, no bonus-income tick. Rare feedstocks gate local controller manufacturing;
  // importing your first controllers remains the bootstrap, not a circular recipe demand.
  {
    id: 'sr_blend_alloys', machine: 'sm_refinery', name: 'Blend Structural Alloys',
    inputs: { cmdty_ore_iron: 2, cmdty_ore_titanium: 1 },
    output: { cmdty_alloys: 1 }, inputRatePerMin: 3,
    contactOres: ['cmdty_ore_titanium'],
  },
  {
    id: 'sr_synthesize_fuel', machine: 'sm_refinery', name: 'Synthesize Fuel Cells',
    inputs: { cmdty_gas_hydrogen: 1, cmdty_ore_iron: 1, cmdty_silicate: 1 },
    output: { cmdty_fuel_cells: 1 }, inputRatePerMin: 4,
    contactKinds: ['gas'],
  },
  {
    id: 'sr_fab_hullplate', machine: 'sm_fabricator', name: 'Press Hull Plate',
    inputs: { cmdty_refined_metals: 1, cmdty_silicate: 3 }, output: { cmdty_comp_hullplate: 2 },
    buildS: 55,
    contactOres: ['cmdty_ore_titanium'],
  },
  {
    id: 'sr_fab_circuitry', machine: 'sm_fabricator', name: 'Etch Circuitry',
    inputs: { cmdty_purified_silica: 1, cmdty_ore_copper: 2 },
    output: { cmdty_comp_circuitry: 1 }, buildS: 75,
    contactOres: ['cmdty_ore_copper', 'cmdty_ore_silverium', 'cmdty_ore_goldium'],
  },
  {
    id: 'sr_fab_control_unit', machine: 'sm_fabricator', name: 'Assemble Machine Controller',
    inputs: { cmdty_comp_circuitry: 1, cmdty_alloys: 1, cmdty_silicate: 2, cmdty_fuel_cells: 1 },
    output: { cmdty_control_unit: 3 }, buildS: 180,
    contactOres: ['cmdty_ore_platinoid', 'cmdty_ore_platinium', 'cmdty_ore_einsteinium'],
  },
];

export const SITE_BALANCE = {
  // Material lane networks (brief §2: aggregated flow, not per-item sim).
  laneThroughputPerMin: 12,  // total units/min a lane network may move (intake + output)
  laneThroughputPerPort: 12, // one port expands only its connected material network
  processBonusPerContact: 0.15,
  maxProcessBonus: 0.6,
  laneStoreBase: 80,         // units a bare lane network can hold
  laneStorePerCell: 12,      // the lane IS the buffer — more track, more buffer
  // Courier pods (brief §6: cheap, one-way, high attrition, sold at destination).
  podCapacity: 12,           // units of cargo per launch
  podLaunchCooldownS: 20,
  podTravelSBase: 50,
  podTravelSPerDanger: 40,   // × sector dangerIndex (0..1)
  podLossBase: 0.03,
  podLossPerDanger: 0.3,     // × sector dangerIndex, capped below
  podLossCap: 0.35,
  podSalvageMult: 0.92,      // destination pays slightly under spot for pod-freight
  defaultPodTarget: 4,
  maxPodTarget: 24,
  // Production cadence (s of simTime between site production steps).
  tickS: 1,
  // New claims hold construction supplies and every recipe feedstock. A fresh port must
  // not sell the inputs out from under its factory; the player can explicitly export any good.
  exportDefaultOff: [
    'cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_ore_titanium',
    'cmdty_silicate', 'cmdty_gas_hydrogen',
    'cmdty_regocrete', 'cmdty_electronics', 'cmdty_control_unit',
    'cmdty_refined_metals', 'cmdty_purified_silica',
    'cmdty_alloys', 'cmdty_comp_circuitry', 'cmdty_fuel_cells',
  ],
  ledgerMax: 40,             // receipts kept per site
};

export const SITE_MACHINE_BY_ID = new Map(SITE_MACHINES.map((m) => [m.id, m]));
export const SITE_RECIPE_BY_ID = new Map(SITE_RECIPES.map((r) => [r.id, r]));
