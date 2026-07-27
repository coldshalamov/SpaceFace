// src/data/mining.js – consolidated mining data.
// Exports: ORES (27 items), ASTEROIDS (6 types), BEAMS (4 tiers),
//          RECIPES (4 refine/craft chains), FIELDS (4 tier params).
// Ore IDs use cmdty_ prefix per ARCHITECTURE §0.4.
//
// SINGLE SOURCE OF PRICE/MASS/VOLUME/NAME: every ORES row is an EXTRACTION-facing view over the
// canonical commodity record in commodities.js. It carries only the fields the extraction layer
// owns — `category` (ore chain stage), `tier` (tierCap roll gating) and `tags` (seam/scan flavour).
// `name`, `baseValue`, `mass` and `vol` are merged in from COMMODITIES below, exactly the way
// commodities.js merges COMMODITY_FLAVOR and COMMODITY_MORAL_TAGS onto itself.
//
// This used to be a hand-maintained duplicate and it had drifted badly: iron read 12 cr here and
// 28 cr in the market, `cmdty_refined_metals` was called "Iron Ingot" here and "Refined Metals"
// there, and the codex ore table (src/ui/screens/help.js) renders THIS table — so the help screen
// told new players prices the game does not honour. See PHYSICAL_PLAY_GRAMMAR §9.5.5.
import { COMMODITIES } from './commodities.js';

const TAU = Math.PI * 2;

function fallbackHash32(...args) {
  let h = 0x811c9dc5;
  const str = args.join('|');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fallbackMulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round6(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

export function deriveAsteroidSeams(seed, asteroidId, radius, opts = {}) {
  const hash32 = opts.hash32 || fallbackHash32;
  const mulberry32 = opts.mulberry32 || fallbackMulberry32;
  const rng = mulberry32(hash32(seed, asteroidId));
  const requested = Number.isInteger(opts.count) ? opts.count : 1 + Math.floor(rng() * 4);
  const count = Math.max(0, Math.min(4, requested));
  const r = Math.max(1, Number(radius) || 1);
  const seams = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * TAU;
    const radial = r * (0.35 + rng() * 0.55);
    seams.push({
      angle: round6(angle),
      localOffset: {
        x: round6(Math.cos(angle) * radial),
        z: round6(Math.sin(angle) * radial),
      },
    });
  }
  return seams;
}

export const ORES = [
  // --- RAW extraction outputs ---
  { id: 'cmdty_silicate',            category: 'raw',       tier: 0, tags: ['common'] },
  { id: 'cmdty_ore_iron',            category: 'raw',       tier: 0, tags: ['metal'] },
  { id: 'cmdty_ore_copper',          category: 'raw',       tier: 1, tags: ['metal'] },
  { id: 'cmdty_ore_titanium',        category: 'raw',       tier: 2, tags: ['metal'] },
  { id: 'cmdty_ice_water',           category: 'raw',       tier: 0, tags: ['ice','bulky'] },
  { id: 'cmdty_volatiles',           category: 'raw',       tier: 1, tags: ['ice','bulky'] },
  { id: 'cmdty_gas_hydrogen',        category: 'raw',       tier: 0, tags: ['gas','bulky'] },
  { id: 'cmdty_gas_helium3',         category: 'raw',       tier: 2, tags: ['gas','bulky'] },
  { id: 'cmdty_crystal_silica',      category: 'raw',       tier: 1, tags: ['crystal'] },
  { id: 'cmdty_crystal_lumin',       category: 'raw',       tier: 2, tags: ['crystal','glow'] },
  { id: 'cmdty_ore_platinoid',       category: 'raw',       tier: 3, tags: ['metal','rare'] },
  { id: 'cmdty_exotic_xenium',       category: 'raw',       tier: 4, tags: ['exotic','rare'] },
  { id: 'cmdty_ore_bronzium',        category: 'raw',       tier: 1, tags: ['metal'] },
  { id: 'cmdty_ore_silverium',       category: 'raw',       tier: 2, tags: ['metal'] },
  { id: 'cmdty_ore_goldium',         category: 'raw',       tier: 2, tags: ['metal'] },
  { id: 'cmdty_ore_platinium',       category: 'raw',       tier: 3, tags: ['metal','rare'] },
  { id: 'cmdty_ore_einsteinium',     category: 'raw',       tier: 3, tags: ['metal','rare'] },
  { id: 'cmdty_gem_emerald',         category: 'raw',       tier: 3, tags: ['crystal','rare'] },
  { id: 'cmdty_gem_ruby',            category: 'raw',       tier: 4, tags: ['crystal','rare'] },
  { id: 'cmdty_gem_diamond',         category: 'raw',       tier: 4, tags: ['crystal','rare'] },
  { id: 'cmdty_exotic_amazonite',    category: 'raw',       tier: 4, tags: ['exotic','rare'] },

  // --- Refined outputs (volume-compressed) ---
  { id: 'cmdty_refined_metals',      category: 'refined',   tier: 1, tags: ['metal','refined'] },
  { id: 'cmdty_alloys',              category: 'refined',   tier: 2, tags: ['metal','refined'] },

  // --- Crafted ship components ---
  { id: 'cmdty_comp_hullplate',      category: 'component', tier: 2, tags: ['component'] },
  { id: 'cmdty_comp_circuitry',      category: 'component', tier: 3, tags: ['component'] },

  // --- Salvage (from wrecks) ---
  { id: 'cmdty_scrap_metal',         category: 'salvage',   tier: 0, tags: ['salvage'] },
  { id: 'cmdty_salvage_electronics', category: 'salvage',   tier: 1, tags: ['salvage'] },
];

// Merge the canonical trade record onto each ore row at module load. Deliberately NOT a spread of
// the whole commodity: extraction only needs the four fields it used to duplicate, and pulling in
// `producedBy`/`elasticity`/`legality` would make ORES a second market table by accident.
// An id absent from COMMODITIES would be a data bug, so it is left with no price rather than a
// silently invented one — check-data-refs.mjs already fails on an unresolvable cmdty_ id.
for (const ore of ORES) {
  const cmdty = COMMODITIES.find((c) => c.id === ore.id);
  if (!cmdty) continue;
  ore.name = cmdty.name;
  ore.baseValue = cmdty.basePrice;
  ore.mass = cmdty.massPerU;
  ore.vol = cmdty.volPerU;
}

// 6 asteroid types. hp[small,large] = ore-HP endpoints; yieldU[small,large] = units released.
// oreTable weights use cmdty_ ore IDs; tierCap gates eligibility.
export const ASTEROIDS = [
  {
    id: 'ast_common_rock', hp: [120, 520], yieldU: [8, 22], spawnWeight: 45, sizeRange: [6, 14], tierCap: 0,
    oreTable: { cmdty_silicate: 0.7, cmdty_ore_iron: 0.3 },
    authoredPlaceId: 'place_asteroid_seamed',
    look: 'grey lumpy icosphere',
  },
  {
    id: 'ast_metallic', hp: [320, 900], yieldU: [14, 32], spawnWeight: 22, sizeRange: [7, 16], tierCap: 2,
    oreTable: { cmdty_ore_iron: 0.45, cmdty_ore_copper: 0.35, cmdty_ore_titanium: 0.20 },
    authoredPlaceId: 'place_asteroid_rock_a',
    look: 'dark metallic specular veins',
  },
  {
    id: 'ast_icy', hp: [180, 640], yieldU: [12, 26], spawnWeight: 14, sizeRange: [8, 18], tierCap: 1,
    oreTable: { cmdty_ice_water: 0.75, cmdty_volatiles: 0.25 },
    authoredPlaceId: 'place_asteroid_rock_b',
    look: 'translucent blue emissive rim',
  },
  {
    id: 'ast_crystalline', hp: [260, 720], yieldU: [9, 20], spawnWeight: 9, sizeRange: [5, 12], tierCap: 2,
    oreTable: { cmdty_crystal_silica: 0.7, cmdty_crystal_lumin: 0.3 },
    authoredPlaceId: 'place_asteroid_rock_c',
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
//
// heatMax/heatRate/coolRate drive the pulse-timing rhythm in systems/mining.js: heat climbs while
// the beam bites, the amber vent band opens near the top, releasing inside it pays a real ore
// bonus, and letting the gauge peg locks the beam out while the radiators dump (slowly — see
// BEAM_OVERHEAT_COOL_MULT). Numbers are seconds-scale on purpose: mk1 runs ~4.5 s cold-to-peg and
// dumps in ~1.8 s, so the loop is a beat rather than a wait. Higher tiers hold more heat and vent
// faster, which is what a beam upgrade should FEEL like on top of raw dps.
export const BEAMS = [
  { id: 'beam_mk1',        dps: 18, range: 240, energyDraw: 4,  tier: 1, heatMax: 100, heatRate: 22, coolRate: 55 },
  { id: 'beam_mk2',        dps: 30, range: 300, energyDraw: 8,  tier: 2, heatMax: 110, heatRate: 22, coolRate: 60 },
  { id: 'beam_mk3',        dps: 48, range: 360, energyDraw: 16, tier: 3, heatMax: 120, heatRate: 21, coolRate: 66 },
  { id: 'beam_industrial', dps: 70, range: 420, energyDraw: 20, tier: 4, heatMax: 140, heatRate: 20, coolRate: 74 },
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
