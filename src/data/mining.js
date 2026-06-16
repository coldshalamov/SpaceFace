// src/data/mining.js – consolidated mining data.
// Exports: ORES (18 items), ASTEROIDS (6 types), BEAMS (4 tiers),
//          RECIPES (4 refine/craft chains), FIELDS (4 tier params).
// Ore IDs use cmdty_ prefix per ARCHITECTURE §0.4. Pure data, no imports.

export const ORES = [
  // --- RAW extraction outputs ---
  { id: 'cmdty_silicate',            name: 'Silicate Rock',         category: 'raw',       mass: 0.6, vol: 1.0, baseValue: 4,   tier: 0, tags: ['common'] },
  { id: 'cmdty_ore_iron',            name: 'Iron Ore',              category: 'raw',       mass: 0.8, vol: 1.0, baseValue: 12,  tier: 0, tags: ['metal'] },
  { id: 'cmdty_ore_copper',          name: 'Copper Ore',            category: 'raw',       mass: 0.9, vol: 1.0, baseValue: 18,  tier: 1, tags: ['metal'] },
  { id: 'cmdty_ore_titanium',        name: 'Titanium Ore',          category: 'raw',       mass: 0.7, vol: 1.0, baseValue: 34,  tier: 2, tags: ['metal'] },
  { id: 'cmdty_ice_water',           name: 'Water Ice',             category: 'raw',       mass: 0.5, vol: 1.4, baseValue: 6,   tier: 0, tags: ['ice','bulky'] },
  { id: 'cmdty_volatiles',           name: 'Volatile Ice',          category: 'raw',       mass: 0.5, vol: 1.4, baseValue: 16,  tier: 1, tags: ['ice','bulky'] },
  { id: 'cmdty_gas_hydrogen',        name: 'Hydrogen Gas',          category: 'raw',       mass: 0.1, vol: 2.5, baseValue: 9,   tier: 0, tags: ['gas','bulky'] },
  { id: 'cmdty_gas_helium3',         name: 'Helium-3',              category: 'raw',       mass: 0.1, vol: 2.5, baseValue: 40,  tier: 2, tags: ['gas','bulky'] },
  { id: 'cmdty_crystal_silica',      name: 'Silica Crystal',        category: 'raw',       mass: 1.1, vol: 1.0, baseValue: 30,  tier: 1, tags: ['crystal'] },
  { id: 'cmdty_crystal_lumin',       name: 'Luminite Crystal',      category: 'raw',       mass: 1.0, vol: 1.0, baseValue: 70,  tier: 2, tags: ['crystal','glow'] },
  { id: 'cmdty_ore_platinoid',       name: 'Platinoid Ore',         category: 'raw',       mass: 1.4, vol: 1.0, baseValue: 110, tier: 3, tags: ['metal','rare'] },
  { id: 'cmdty_exotic_xenium',       name: 'Xenium',                category: 'raw',       mass: 1.2, vol: 1.0, baseValue: 260, tier: 4, tags: ['exotic','rare'] },

  // --- Refined outputs (volume-compressed) ---
  { id: 'cmdty_refined_metals',      name: 'Iron Ingot',            category: 'refined',   mass: 0.7, vol: 0.5, baseValue: 40,  tier: 1, tags: ['metal','refined'] },
  { id: 'cmdty_alloys',              name: 'Titanium Alloy',        category: 'refined',   mass: 0.6, vol: 0.5, baseValue: 120, tier: 2, tags: ['metal','refined'] },

  // --- Crafted ship components ---
  { id: 'cmdty_comp_hullplate',      name: 'Hull Plate',            category: 'component', mass: 1.0, vol: 0.6, baseValue: 220, tier: 2, tags: ['component'] },
  { id: 'cmdty_comp_circuitry',      name: 'Circuitry',             category: 'component', mass: 0.3, vol: 0.4, baseValue: 300, tier: 3, tags: ['component'] },

  // --- Salvage (from wrecks) ---
  { id: 'cmdty_scrap_metal',         name: 'Scrap Metal',           category: 'salvage',   mass: 0.9, vol: 1.0, baseValue: 8,   tier: 0, tags: ['salvage'] },
  { id: 'cmdty_salvage_electronics', name: 'Salvage Electronics',   category: 'salvage',   mass: 0.4, vol: 0.6, baseValue: 55,  tier: 1, tags: ['salvage'] },
];

// 6 asteroid types. hp[small,large] = ore-HP endpoints; yieldU[small,large] = units released.
// oreTable weights use cmdty_ ore IDs; tierCap gates eligibility.
export const ASTEROIDS = [
  {
    id: 'ast_common_rock', hp: [120, 520], yieldU: [8, 22], spawnWeight: 45, sizeRange: [6, 14], tierCap: 0,
    oreTable: { cmdty_silicate: 0.7, cmdty_ore_iron: 0.3 },
    look: 'grey lumpy icosphere',
  },
  {
    id: 'ast_metallic', hp: [320, 900], yieldU: [14, 32], spawnWeight: 22, sizeRange: [7, 16], tierCap: 2,
    oreTable: { cmdty_ore_iron: 0.45, cmdty_ore_copper: 0.35, cmdty_ore_titanium: 0.20 },
    look: 'dark metallic specular veins',
  },
  {
    id: 'ast_icy', hp: [180, 640], yieldU: [12, 26], spawnWeight: 14, sizeRange: [8, 18], tierCap: 1,
    oreTable: { cmdty_ice_water: 0.75, cmdty_volatiles: 0.25 },
    look: 'translucent blue emissive rim',
  },
  {
    id: 'ast_crystalline', hp: [260, 720], yieldU: [9, 20], spawnWeight: 9, sizeRange: [5, 12], tierCap: 2,
    oreTable: { cmdty_crystal_silica: 0.7, cmdty_crystal_lumin: 0.3 },
    look: 'sharp emissive crystal cluster',
  },
  {
    id: 'ast_gas_cloud', hp: [90, 300], yieldU: [16, 30], spawnWeight: 7, sizeRange: [14, 30], tierCap: 2,
    oreTable: { cmdty_gas_hydrogen: 0.75, cmdty_gas_helium3: 0.25 },
    look: 'soft additive billboard puff, no hard mesh',
  },
  {
    id: 'ast_rare_exotic', hp: [480, 1200], yieldU: [7, 18], spawnWeight: 3, sizeRange: [6, 13], tierCap: 4,
    oreTable: { cmdty_ore_platinoid: 0.6, cmdty_crystal_lumin: 0.25, cmdty_exotic_xenium: 0.15 },
    look: 'dark dense rock, slow xenium glow',
  },
];

// 4 mining beam tiers. dps = ore-HP/s per ARCHITECTURE §0.10 (beam_mk1 = 18).
export const BEAMS = [
  { id: 'beam_mk1',        dps: 18, range: 240, energyDraw: 4,  heatRate: 12, coolRate: 20, tier: 1 },
  { id: 'beam_mk2',        dps: 30, range: 300, energyDraw: 8,  heatRate: 10, coolRate: 24, tier: 2 },
  { id: 'beam_mk3',        dps: 48, range: 360, energyDraw: 16, heatRate: 8,  coolRate: 30, tier: 3 },
  { id: 'beam_industrial', dps: 70, range: 420, energyDraw: 20, heatRate: 6,  coolRate: 40, tier: 4 },
];

// Refining and crafting chains (run at stations with matching service tier).
// Input/output keys use cmdty_ IDs.
export const RECIPES = [
  {
    id: 'recipe_refine_iron',
    inputs: { cmdty_ore_iron: 2 },
    output: { cmdty_refined_metals: 1 },
    fee: 6, timeS: 8, stationTier: 1,
  },
  {
    id: 'recipe_refine_titanium',
    inputs: { cmdty_ore_titanium: 3, cmdty_refined_metals: 1 },
    output: { cmdty_alloys: 1 },
    fee: 20, timeS: 14, stationTier: 2,
  },
  {
    id: 'recipe_craft_hullplate',
    inputs: { cmdty_refined_metals: 2, cmdty_alloys: 1 },
    output: { cmdty_comp_hullplate: 1 },
    fee: 40, timeS: 20, stationTier: 2,
  },
  {
    id: 'recipe_craft_circuitry',
    inputs: { cmdty_crystal_lumin: 2, cmdty_salvage_electronics: 1, cmdty_ore_copper: 1 },
    output: { cmdty_comp_circuitry: 1 },
    fee: 60, timeS: 25, stationTier: 3,
  },
];

// Per-sector-tier field generation parameters.
export const FIELDS = {
  0: { astCount: 60,  weights: { ast_common_rock: 60, ast_metallic: 25, ast_icy: 15 },                                              tierCap: 1, respawnSec: 90,  clusterRadius: 350 },
  1: { astCount: 90,  weights: { ast_common_rock: 40, ast_metallic: 25, ast_icy: 15, ast_crystalline: 15, ast_gas_cloud: 5 },       tierCap: 2, respawnSec: 120, clusterRadius: 450 },
  2: { astCount: 130, weights: null,                                                                                                  tierCap: 3, respawnSec: 150, clusterRadius: 550 },
  3: { astCount: 110, weights: { ast_metallic: 25, ast_crystalline: 25, ast_gas_cloud: 15, ast_rare_exotic: 20, ast_common_rock: 15 }, tierCap: 4, respawnSec: 200, clusterRadius: 600 },
};
