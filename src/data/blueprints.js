// src/data/blueprints.js – manufacturing recipes for the builder profession (Phase 7).
//
// DESIGN (from the vision): mining is only worth it if you can DO something with the ore. This file
// defines a 4-tier crafting chain that turns raw ore into progressively more valuable / powerful
// outputs, gated by the tech tree so a fresh player buys & augments, then researches up to building
// whole modules, and finally manufactures ships from materials.
//
//   Tier 1 — REFINE:   raw ore/gas/crystal  →  refined materials   (entry: any miner, no tech)
//   Tier 2 — ASSEMBLE: refined + components →  a module/weapon       (needs a fab tech node)
//   Tier 3 — AUGMENT:  an owned module + materials → next tier of it (upgrade-in-place; your
//                      "augment a drill to the next level")
//   Tier 4 — SHIPYARD: bulk materials → a whole ship hull            (end-game; "build ships")
//
// Each recipe: { id, name, category, tier, stationType (where buildable), requiresTech|null,
//   timeS (build duration, 0=instant), inputs: {cmdtyId: qty}, outputs: {kind:'module'|'weapon'|
//   'commodity'|'ship', id, qty}, fromModule (augment only: the source module id to upgrade) }
//
// `outputs.kind` tells the crafting system where the product lands: modules→ownedModules, weapons→
// ownedWeapons, commodity→cargo, ship→crafted ship grant (added to ownedShips).
//
// Pure data, no imports. IDs use bp_ prefix. Cross-refs validated by check-data-refs.

export const BLUEPRINTS = [

  // ===================================================================================
  // TIER 1 — REFINE  (raw ore → refined materials). The miner's entry into manufacturing.
  // No tech required; any station with a refinery can do it. Low margin vs. raw selling, but it
  // feeds the higher tiers and is the way a miner converts bulk low-value ore into useful stock.
  // ===================================================================================
  {
    id: 'bp_refine_metals', name: 'Refine Metals', category: 'refine', tier: 1, stationType: 'refinery', requiresTech: null, timeS: 0,
    inputs: { cmdty_ore_iron: 3, cmdty_ore_titanium: 1 },
    outputs: { kind: 'commodity', id: 'cmdty_refined_metals', qty: 2 },
    desc: 'Smelt iron + titanium ore into refined metals — the backbone of every hull and component.',
  },
  {
    id: 'bp_refine_alloys', name: 'Refine Composite Alloys', category: 'refine', tier: 1, stationType: 'refinery', requiresTech: null, timeS: 0,
    inputs: { cmdty_ore_titanium: 2, cmdty_ore_platinoid: 1, cmdty_polymers: 1 },
    outputs: { kind: 'commodity', id: 'cmdty_alloys', qty: 2 },
    desc: 'Advanced alloys for ship hulls and heavy weapon frames.',
  },
  {
    id: 'bp_refine_polymers', name: 'Process Polymers', category: 'refine', tier: 1, stationType: 'refinery', requiresTech: null, timeS: 0,
    inputs: { cmdty_volatiles: 2, cmdty_silicate: 2 },
    outputs: { kind: 'commodity', id: 'cmdty_polymers', qty: 2 },
    desc: 'Crack volatiles + silicate into versatile polymers.',
  },
  {
    id: 'bp_refine_fuelcells', name: 'Pressurize Fuel Cells', category: 'refine', tier: 1, stationType: 'refinery', requiresTech: null, timeS: 0,
    inputs: { cmdty_gas_hydrogen: 3, cmdty_ice_water: 2 },
    outputs: { kind: 'commodity', id: 'cmdty_fuel_cells', qty: 2 },
    desc: 'Stabilize hydrogen into fuel cells for jump drives and stations.',
  },
  {
    id: 'bp_refine_microchips', name: 'Etch Microchips', category: 'refine', tier: 1, stationType: 'fab', requiresTech: null, timeS: 0,
    inputs: { cmdty_crystal_silica: 2, cmdty_ore_copper: 2 },
    outputs: { kind: 'commodity', id: 'cmdty_microchips', qty: 1 },
    desc: 'Fabricate microchips from silica + copper — the basis of all electronics.',
  },
  {
    id: 'bp_refine_circuitry', name: 'Assemble Circuitry', category: 'refine', tier: 1, stationType: 'fab', requiresTech: null, timeS: 0,
    inputs: { cmdty_microchips: 1, cmdty_ore_copper: 1, cmdty_polymers: 1 },
    outputs: { kind: 'commodity', id: 'cmdty_comp_circuitry', qty: 1 },
    desc: 'Lay microchips onto polymer boards to make finished circuitry.',
  },
  {
    id: 'bp_refine_hullplate', name: 'Stamp Hull Plates', category: 'refine', tier: 1, stationType: 'fab', requiresTech: null, timeS: 0,
    inputs: { cmdty_refined_metals: 2, cmdty_alloys: 1 },
    outputs: { kind: 'commodity', id: 'cmdty_comp_hullplate', qty: 2 },
    desc: 'Press metals + alloys into structural hull plating.',
  },

  // ===================================================================================
  // TIER 2 — ASSEMBLE (build a module/weapon from refined + components).
  // First tech gate: the player must research a fabrication node. This is "build simple parts" —
  // cheaper than buying at a shipyard once you have the materials, and the only way to get some
  // modules in deep space. Produces items into ownedModules / ownedWeapons.
  // ===================================================================================
  {
    id: 'bp_build_shield_s', name: 'Build Shield Booster (S)', category: 'assemble', tier: 2, stationType: 'fab', requiresTech: 'tech_deflector_theory', timeS: 0,
    inputs: { cmdty_comp_circuitry: 2, cmdty_alloys: 1, cmdty_microchips: 1 },
    outputs: { kind: 'module', id: 'mod_shield_booster_s', qty: 1 },
    desc: 'A small shield booster — cheaper to build than buy if you have the parts.',
  },
  {
    id: 'bp_build_cargopod_m', name: 'Build Cargo Pod (M)', category: 'assemble', tier: 2, stationType: 'fab', requiresTech: 'tech_bulk_logistics', timeS: 0,
    inputs: { cmdty_comp_hullplate: 3, cmdty_polymers: 2 },
    outputs: { kind: 'module', id: 'mod_cargo_pod_m', qty: 1 },
    desc: 'An expanded cargo pod — turn hull plating into hauling capacity.',
  },
  {
    id: 'bp_build_pulse_laser_s', name: 'Build Pulse Laser (S)', category: 'assemble', tier: 2, stationType: 'fab', requiresTech: 'tech_combat_basics', timeS: 0,
    inputs: { cmdty_comp_circuitry: 2, cmdty_refined_metals: 2, cmdty_microchips: 1 },
    outputs: { kind: 'weapon', id: 'wpn_pulse_laser_s', qty: 1 },
    desc: 'A basic pulse laser. Forge your own guns instead of buying them.',
  },
  {
    id: 'bp_build_phaseminer_m', name: 'Build Mining Beam (M)', category: 'assemble', tier: 2, stationType: 'fab', requiresTech: 'tech_focused_extraction', timeS: 0,
    inputs: { cmdty_comp_circuitry: 3, cmdty_crystal_lumin: 1, cmdty_alloys: 1 },
    outputs: { kind: 'module', id: 'mod_mining_beam_m', qty: 1 },
    desc: 'A mid-tier mining beam. The builder\'s path to faster ore.',
  },
  {
    id: 'bp_build_scanner_s', name: 'Build Cargo Scanner (S)', category: 'assemble', tier: 2, stationType: 'fab', requiresTech: 'tech_nanofabrication', timeS: 0,
    inputs: { cmdty_microchips: 2, cmdty_comp_circuitry: 1, cmdty_crystal_silica: 1 },
    outputs: { kind: 'module', id: 'mod_cargo_scanner_s', qty: 1 },
    desc: 'A cargo scanner for smuggling / appraisal runs.',
  },

  // ===================================================================================
  // TIER 3 — AUGMENT (upgrade an owned module in place, consuming materials).
  // Your "augment a drill to the next level": take the module you already own + materials → the
  // next-tier version of it. `fromModule` is the consumed source; the output replaces it. This lets
  // a player invest in a favourite module line rather than rebuying. Requires a manufacturing tech.
  // ===================================================================================
  {
    id: 'bp_aug_mining_laser_to_beam', name: 'Augment: Mining Laser → Beam', category: 'augment', tier: 3, stationType: 'fab', requiresTech: 'tech_focused_extraction', timeS: 0,
    fromModule: 'mod_mining_laser_s',
    inputs: { cmdty_crystal_lumin: 1, cmdty_comp_circuitry: 2, cmdty_microchips: 1 },
    outputs: { kind: 'module', id: 'mod_mining_beam_m', qty: 1 },
    desc: 'Upgrade your starter mining laser into a proper mining beam. The signature augment.',
  },
  {
    id: 'bp_aug_shield_s_to_m', name: 'Augment: Shield Booster S → Capacitor M', category: 'augment', tier: 3, stationType: 'fab', requiresTech: 'tech_deflector_theory', timeS: 0,
    fromModule: 'mod_shield_booster_s',
    inputs: { cmdty_comp_circuitry: 2, cmdty_alloys: 2, cmdty_quantum_cores: 1 },
    outputs: { kind: 'module', id: 'mod_shield_capacitor_m', qty: 1 },
    desc: 'Reinforce a small shield booster into a medium shield capacitor.',
  },
  {
    id: 'bp_aug_cargopod_m_to_l', name: 'Augment: Cargo Pod M → Expander L', category: 'augment', tier: 3, stationType: 'fab', requiresTech: 'tech_bulk_logistics', timeS: 0,
    fromModule: 'mod_cargo_pod_m',
    inputs: { cmdty_comp_hullplate: 3, cmdty_alloys: 2, cmdty_polymers: 2 },
    outputs: { kind: 'module', id: 'mod_cargo_expander_l', qty: 1 },
    desc: 'Expand a medium cargo pod into a large hold expander — more capacity per slot.',
  },

  // ===================================================================================
  // TIER 4 — SHIPYARD (manufacture a whole ship hull from bulk materials).
  // The end-game builder fantasy: "build whole ships if you have the material." Huge material costs,
  // gated behind capital-grade tech. The crafted ship is added to ownedShips (swap at a shipyard).
  // ===================================================================================
  {
    id: 'bp_ship_pelican', name: 'Manufacture Pelican (Miner)', category: 'ship', tier: 4, stationType: 'fab', requiresTech: 'tech_industrial_mining', timeS: 0,
    inputs: { cmdty_comp_hullplate: 18, cmdty_alloys: 10, cmdty_comp_circuitry: 6, cmdty_microchips: 4 },
    outputs: { kind: 'ship', id: 'ship_pelican', qty: 1 },
    desc: 'Build a Pelican mining barge from scratch. A hull for the dedicated prospector.',
  },
  {
    id: 'bp_ship_mule', name: 'Manufacture Mule (Freighter)', category: 'ship', tier: 4, stationType: 'fab', requiresTech: 'tech_bulk_logistics', timeS: 0,
    inputs: { cmdty_comp_hullplate: 24, cmdty_polymers: 12, cmdty_comp_circuitry: 5, cmdty_fuel_cells: 6 },
    outputs: { kind: 'ship', id: 'ship_mule', qty: 1 },
    desc: 'Build a Mule freighter — your own cargo empire, forged not bought.',
  },
  {
    id: 'bp_ship_wasp', name: 'Manufacture Wasp (Fighter)', category: 'ship', tier: 4, stationType: 'fab', requiresTech: 'tech_combat_basics', timeS: 0,
    inputs: { cmdty_alloys: 14, cmdty_comp_circuitry: 6, cmdty_microchips: 5, cmdty_weapons: 2 },
    outputs: { kind: 'ship', id: 'ship_wasp', qty: 1 },
    desc: 'Build a Wasp fighter. A warship rolled in your own foundry.',
  },
  {
    id: 'bp_ship_drifter', name: 'Manufacture Drifter (Multirole)', category: 'ship', tier: 4, stationType: 'fab', requiresTech: 'tech_long_range_survey', timeS: 0,
    inputs: { cmdty_comp_hullplate: 30, cmdty_alloys: 16, cmdty_quantum_cores: 2, cmdty_electronics: 8 },
    outputs: { kind: 'ship', id: 'ship_drifter', qty: 1 },
    desc: 'Build a Drifter — a versatile multirole hull for the independent captain.',
  },
];

// Quick lookup maps (populated by the crafting system on init).
export const BLUEPRINT_BY_ID = new Map(BLUEPRINTS.map((b) => [b.id, b]));
