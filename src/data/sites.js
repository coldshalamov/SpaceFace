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
  matrixPerMin: 0.9,       // cmdty_silicate from silicate matrix
  basaltPerMin: 0.35,      // cmdty_silicate from dense basalt (general mineral mass)
  orePerMinByTier: [0.7, 0.4, 0.22, 0.1, 0.04], // vein contact → that vein's ore, by ore tier 0-4
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
    desc: 'Anchors the site as a permanent claim, feeds 12 MW down the massline umbilical, and exposes the exterior attachment point.',
    power: 12,
    usesGeology: false,
    cost: { cmdty_regocrete: 4, cmdty_control_unit: 1, cmdty_refined_metals: 2 },
    installS: 8,
    unique: true, // one per asteroid — it IS the site identity
  },
  {
    id: 'sm_extractor',
    name: 'Geological Extractor',
    short: 'Extractor',
    verb: 'extract',
    desc: 'Continuously works every solid contact face: silicate matrix, dense basalt, and live ore veins each pay their own material.',
    power: -6,
    usesGeology: true,
    cost: { cmdty_regocrete: 3, cmdty_control_unit: 1 },
    installS: 6,
  },
  {
    id: 'sm_gas_tap',
    name: 'Gas Tap',
    short: 'Gas Tap',
    verb: 'generate',
    desc: 'Safely interfaces sealed gas pockets without breaching them. Routes the pressure to turbines, feedstock canisters, or both.',
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
    desc: 'A pure process machine — geology gives it nothing. Feed it through the lane network and give it power; it gives you intermediates.',
    power: -8,
    usesGeology: false,
    modes: ['sr_smelt_iron', 'sr_fuse_silica'],
    defaultMode: 'sr_smelt_iron',
    cost: { cmdty_regocrete: 4, cmdty_control_unit: 1, cmdty_refined_metals: 2 },
    installS: 7,
  },
  {
    id: 'sm_fabricator',
    name: 'Fabricator',
    short: 'Fabricator',
    verb: 'fabricate',
    desc: 'Discrete assembly line. In courier mode it holds a fleet policy and quietly replaces every pod the void eats.',
    power: -10,
    usesGeology: false,
    modes: ['sr_fab_courier', 'sr_cast_regocrete', 'sr_fab_electronics'],
    defaultMode: 'sr_fab_courier',
    cost: { cmdty_regocrete: 3, cmdty_control_unit: 1, cmdty_electronics: 2 },
    installS: 7,
  },
  {
    id: 'sm_cargo_port',
    name: 'Cargo Port',
    short: 'Cargo Port',
    verb: 'route',
    desc: 'The honest interface between the bore and the outside: buffers export goods and launches courier pods. The laser never touches refined output.',
    power: -4,
    usesGeology: false,
    storeBonus: 120,
    cost: { cmdty_regocrete: 5, cmdty_control_unit: 1, cmdty_electronics: 1 },
    installS: 8,
  },
];

// Refinery modes run CONTINUOUSLY (units/min with fractional carry). Fabricator recipes are
// DISCRETE builds (consume inputs up front, finish after buildS). Distinct verbs, distinct feel.
export const SITE_RECIPES = [
  {
    id: 'sr_smelt_iron', machine: 'sm_refinery', name: 'Smelt Iron',
    inputs: { cmdty_ore_iron: 2 }, output: { cmdty_refined_metals: 1 },
    inputRatePerMin: 3,
  },
  {
    id: 'sr_fuse_silica', machine: 'sm_refinery', name: 'Fuse Silica',
    inputs: { cmdty_silicate: 3 }, output: { cmdty_purified_silica: 1 },
    inputRatePerMin: 4.5,
  },
  {
    id: 'sr_cast_regocrete', machine: 'sm_fabricator', name: 'Cast Regocrete',
    inputs: { cmdty_silicate: 2, cmdty_refined_metals: 1 }, output: { cmdty_regocrete: 2 },
    buildS: 45,
  },
  {
    id: 'sr_fab_electronics', machine: 'sm_fabricator', name: 'Print Electronics',
    inputs: { cmdty_purified_silica: 2, cmdty_refined_metals: 1 }, output: { cmdty_electronics: 1 },
    buildS: 60,
  },
  {
    id: 'sr_fab_courier', machine: 'sm_fabricator', name: 'Assemble Courier Pod',
    inputs: { cmdty_refined_metals: 1, cmdty_purified_silica: 1, cmdty_electronics: 1 },
    output: { pod: 1 },
    buildS: 90,
  },
];

export const SITE_BALANCE = {
  // Material lane networks (brief §2: aggregated flow, not per-item sim).
  laneThroughputPerMin: 12,  // total units/min a lane network may move (intake + output)
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
  // Build-chain intermediates default to HOLD so a fresh port doesn't drain the fabricator.
  exportDefaultOff: [
    'cmdty_regocrete', 'cmdty_electronics', 'cmdty_control_unit',
    'cmdty_refined_metals', 'cmdty_purified_silica',
  ],
  ledgerMax: 40,             // receipts kept per site
};

export const SITE_MACHINE_BY_ID = new Map(SITE_MACHINES.map((m) => [m.id, m]));
export const SITE_RECIPE_BY_ID = new Map(SITE_RECIPES.map((r) => [r.id, r]));
