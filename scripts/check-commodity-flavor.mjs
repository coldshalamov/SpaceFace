#!/usr/bin/env node
// Validates commodity flavor coverage, word limits, tone guards, and balance-field integrity.
// Run: `node scripts/check-commodity-flavor.mjs`
// Optional: COMMODITY_FLAVOR_SCRATCH=<dir> writes commodity-flavor-validate.log and
// commodity-balance-integrity.log to that directory.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMMODITIES } from '../src/data/commodities.js';
import { COMMODITY_FLAVOR } from '../src/data/commodityFlavor.js';

const BALANCE_KEYS = [
  'id', 'name', 'category', 'basePrice', 'volatility', 'elasticity', 'legality',
  'volPerU', 'massPerU', 'fineMult', 'producedBy', 'consumedBy',
];

// Frozen baseline captured before flavor edits (2026-07-06).
const BASELINE = [
  { id: 'cmdty_ore_iron', name: 'Iron Ore', category: 'raw ore', basePrice: 28, volatility: 0.20, elasticity: 0.40, legality: 'legal', volPerU: 1.0, massPerU: 0.8, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'trade_hub'] },
  { id: 'cmdty_ore_copper', name: 'Copper Ore', category: 'raw ore', basePrice: 40, volatility: 0.22, elasticity: 0.40, legality: 'legal', volPerU: 1.0, massPerU: 0.9, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'fab'] },
  { id: 'cmdty_ore_titanium', name: 'Titanium Ore', category: 'raw ore', basePrice: 65, volatility: 0.25, elasticity: 0.45, legality: 'legal', volPerU: 1.0, massPerU: 0.7, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery'] },
  { id: 'cmdty_silicate', name: 'Silicate Rock', category: 'raw ore', basePrice: 8, volatility: 0.15, elasticity: 0.30, legality: 'legal', volPerU: 1.0, massPerU: 0.6, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'fab', 'trade_hub'] },
  { id: 'cmdty_ice_water', name: 'Water Ice', category: 'raw ore', basePrice: 12, volatility: 0.15, elasticity: 0.30, legality: 'legal', volPerU: 1.4, massPerU: 0.5, fineMult: 0, producedBy: ['mining'], consumedBy: ['trade_hub', 'military', 'research'] },
  { id: 'cmdty_volatiles', name: 'Ice Volatiles', category: 'raw ore', basePrice: 35, volatility: 0.22, elasticity: 0.45, legality: 'legal', volPerU: 1.4, massPerU: 0.5, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'military', 'trade_hub'] },
  { id: 'cmdty_ore_platinoid', name: 'Platinoid Ore', category: 'raw ore', basePrice: 150, volatility: 0.32, elasticity: 0.55, legality: 'legal', volPerU: 1.0, massPerU: 1.4, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery'] },
  { id: 'cmdty_ore_bronzium', name: 'Nickel Ore', category: 'raw ore', basePrice: 60, volatility: 0.22, elasticity: 0.40, legality: 'legal', volPerU: 1.0, massPerU: 0.9, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'trade_hub', 'fab'] },
  { id: 'cmdty_ore_silverium', name: 'Silver Ore', category: 'raw ore', basePrice: 100, volatility: 0.25, elasticity: 0.45, legality: 'legal', volPerU: 1.0, massPerU: 0.7, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'trade_hub'] },
  { id: 'cmdty_ore_goldium', name: 'Gold Ore', category: 'raw ore', basePrice: 250, volatility: 0.28, elasticity: 0.50, legality: 'legal', volPerU: 1.0, massPerU: 1.1, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'trade_hub'] },
  { id: 'cmdty_ore_platinium', name: 'Platinum Ore', category: 'raw ore', basePrice: 750, volatility: 0.30, elasticity: 0.52, legality: 'legal', volPerU: 1.0, massPerU: 1.4, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'trade_hub'] },
  { id: 'cmdty_ore_einsteinium', name: 'Stellarite Ore', category: 'raw ore', basePrice: 2000, volatility: 0.35, elasticity: 0.55, legality: 'legal', volPerU: 1.0, massPerU: 1.5, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'trade_hub'] },
  { id: 'cmdty_gem_emerald', name: 'Raw Emerald', category: 'raw ore', basePrice: 5000, volatility: 0.40, elasticity: 0.60, legality: 'legal', volPerU: 0.8, massPerU: 0.8, fineMult: 0, producedBy: ['mining'], consumedBy: ['trade_hub', 'refinery'] },
  { id: 'cmdty_gem_ruby', name: 'Raw Ruby', category: 'raw ore', basePrice: 20000, volatility: 0.45, elasticity: 0.65, legality: 'legal', volPerU: 0.8, massPerU: 0.8, fineMult: 0, producedBy: ['mining'], consumedBy: ['trade_hub', 'refinery'] },
  { id: 'cmdty_gem_diamond', name: 'Raw Diamond', category: 'raw ore', basePrice: 100000, volatility: 0.50, elasticity: 0.70, legality: 'legal', volPerU: 0.8, massPerU: 0.8, fineMult: 0, producedBy: ['mining'], consumedBy: ['trade_hub', 'refinery'] },
  { id: 'cmdty_exotic_amazonite', name: 'Prism Shard', category: 'raw ore', basePrice: 500000, volatility: 0.60, elasticity: 0.80, legality: 'legal', volPerU: 0.8, massPerU: 0.8, fineMult: 0, producedBy: ['mining'], consumedBy: ['trade_hub', 'research'] },
  { id: 'cmdty_gas_hydrogen', name: 'Hydrogen Gas', category: 'gas', basePrice: 20, volatility: 0.20, elasticity: 0.38, legality: 'legal', volPerU: 2.5, massPerU: 0.1, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'trade_hub'] },
  { id: 'cmdty_gas_helium3', name: 'Helium-3', category: 'gas', basePrice: 80, volatility: 0.28, elasticity: 0.50, legality: 'legal', volPerU: 2.5, massPerU: 0.1, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'research'] },
  { id: 'cmdty_crystal_silica', name: 'Silica Crystal', category: 'crystal', basePrice: 55, volatility: 0.24, elasticity: 0.42, legality: 'legal', volPerU: 1.0, massPerU: 1.1, fineMult: 0, producedBy: ['mining'], consumedBy: ['fab', 'research'] },
  { id: 'cmdty_crystal_lumin', name: 'Phosphor Crystal', category: 'crystal', basePrice: 105, volatility: 0.30, elasticity: 0.46, legality: 'legal', volPerU: 1.0, massPerU: 1.0, fineMult: 0, producedBy: ['mining'], consumedBy: ['fab', 'research'] },
  { id: 'cmdty_exotic_xenium', name: 'Xenium', category: 'exotic', basePrice: 320, volatility: 0.55, elasticity: 0.55, legality: 'legal', volPerU: 1.0, massPerU: 1.2, fineMult: 0, producedBy: ['mining'], consumedBy: ['research', 'blackmarket'] },
  { id: 'cmdty_refined_metals', name: 'Refined Metals', category: 'refined', basePrice: 85, volatility: 0.25, elasticity: 0.45, legality: 'legal', volPerU: 0.5, massPerU: 0.7, fineMult: 0, producedBy: ['refinery'], consumedBy: ['fab', 'military'] },
  { id: 'cmdty_alloys', name: 'Composite Alloys', category: 'refined', basePrice: 140, volatility: 0.28, elasticity: 0.42, legality: 'legal', volPerU: 0.5, massPerU: 0.6, fineMult: 0, producedBy: ['refinery', 'fab'], consumedBy: ['fab', 'military'] },
  { id: 'cmdty_polymers', name: 'Polymers', category: 'refined', basePrice: 70, volatility: 0.24, elasticity: 0.40, legality: 'legal', volPerU: 1.2, massPerU: 0.7, fineMult: 0, producedBy: ['refinery'], consumedBy: ['fab', 'trade_hub'] },
  { id: 'cmdty_fuel_cells', name: 'Fuel Cells', category: 'refined', basePrice: 95, volatility: 0.26, elasticity: 0.50, legality: 'legal', volPerU: 0.8, massPerU: 0.6, fineMult: 0, producedBy: ['refinery'], consumedBy: ['trade_hub', 'military', 'mining'] },
  { id: 'cmdty_comp_hullplate', name: 'Hull Plate', category: 'component', basePrice: 165, volatility: 0.28, elasticity: 0.40, legality: 'legal', volPerU: 0.7, massPerU: 1.0, fineMult: 0, producedBy: ['fab', 'refinery'], consumedBy: ['military', 'fab'] },
  { id: 'cmdty_comp_circuitry', name: 'Circuitry', category: 'component', basePrice: 200, volatility: 0.36, elasticity: 0.40, legality: 'legal', volPerU: 0.6, massPerU: 0.3, fineMult: 0, producedBy: ['fab'], consumedBy: ['research', 'military'] },
  { id: 'cmdty_microchips', name: 'Microchips', category: 'tech', basePrice: 185, volatility: 0.35, elasticity: 0.40, legality: 'legal', volPerU: 0.7, massPerU: 0.2, fineMult: 0, producedBy: ['fab'], consumedBy: ['military', 'trade_hub', 'research'] },
  { id: 'cmdty_electronics', name: 'Electronics', category: 'tech', basePrice: 150, volatility: 0.32, elasticity: 0.40, legality: 'legal', volPerU: 0.9, massPerU: 0.5, fineMult: 0, producedBy: ['fab'], consumedBy: ['trade_hub', 'military'] },
  { id: 'cmdty_quantum_cores', name: 'Quantum Cores', category: 'tech', basePrice: 340, volatility: 0.45, elasticity: 0.46, legality: 'legal', volPerU: 0.9, massPerU: 0.3, fineMult: 0, producedBy: ['research'], consumedBy: ['military', 'fab'] },
  { id: 'cmdty_consumer_goods', name: 'Consumer Goods', category: 'consumer', basePrice: 110, volatility: 0.28, elasticity: 0.45, legality: 'legal', volPerU: 1.0, massPerU: 0.5, fineMult: 0, producedBy: ['fab', 'trade_hub'], consumedBy: ['trade_hub', 'mining'] },
  { id: 'cmdty_textiles', name: 'Textiles', category: 'consumer', basePrice: 60, volatility: 0.22, elasticity: 0.40, legality: 'legal', volPerU: 1.0, massPerU: 0.6, fineMult: 0, producedBy: ['fab'], consumedBy: ['trade_hub'] },
  { id: 'cmdty_luxury_goods', name: 'Luxury Goods', category: 'luxury', basePrice: 190, volatility: 0.40, elasticity: 0.42, legality: 'legal', volPerU: 0.9, massPerU: 0.4, fineMult: 0, producedBy: ['trade_hub', 'fab'], consumedBy: ['trade_hub', 'blackmarket'] },
  { id: 'cmdty_art', name: 'Art & Antiques', category: 'luxury', basePrice: 300, volatility: 0.45, elasticity: 0.50, legality: 'restricted', volPerU: 0.7, massPerU: 0.3, fineMult: 0.8, producedBy: ['trade_hub'], consumedBy: ['trade_hub', 'blackmarket'] },
  { id: 'cmdty_food', name: 'Provisions', category: 'food', basePrice: 40, volatility: 0.20, elasticity: 0.30, legality: 'legal', volPerU: 1.0, massPerU: 0.7, fineMult: 0, producedBy: ['trade_hub'], consumedBy: ['mining', 'military', 'blackmarket'] },
  { id: 'cmdty_medical', name: 'Medical Supplies', category: 'med', basePrice: 150, volatility: 0.30, elasticity: 0.40, legality: 'legal', volPerU: 0.8, massPerU: 0.4, fineMult: 0, producedBy: ['research', 'fab'], consumedBy: ['trade_hub', 'mining', 'military'] },
  { id: 'cmdty_scrap_metal', name: 'Scrap Metal', category: 'salvage', basePrice: 8, volatility: 0.18, elasticity: 0.30, legality: 'legal', volPerU: 1.0, massPerU: 0.9, fineMult: 0, producedBy: ['mining'], consumedBy: ['refinery', 'fab'] },
  { id: 'cmdty_salvage_electronics', name: 'Salvage Electronics', category: 'salvage', basePrice: 55, volatility: 0.25, elasticity: 0.40, legality: 'legal', volPerU: 0.6, massPerU: 0.4, fineMult: 0, producedBy: ['mining'], consumedBy: ['fab', 'military'] },
  { id: 'cmdty_classified_salvage', name: 'Classified Salvage', category: 'salvage', basePrice: 90, volatility: 0.35, elasticity: 0.45, legality: 'restricted', volPerU: 0.6, massPerU: 0.4, fineMult: 0.8, producedBy: ['blackmarket'], consumedBy: ['military', 'blackmarket', 'fab'] },
  { id: 'cmdty_narcotics', name: 'Narcotics', category: 'contraband', basePrice: 220, volatility: 0.55, elasticity: 0.60, legality: 'contraband', volPerU: 0.6, massPerU: 0.2, fineMult: 1.2, producedBy: ['blackmarket'], consumedBy: ['blackmarket'] },
  { id: 'cmdty_stolen_goods', name: 'Stolen Goods', category: 'contraband', basePrice: 150, volatility: 0.50, elasticity: 0.55, legality: 'contraband', volPerU: 1.0, massPerU: 0.8, fineMult: 1.5, producedBy: ['blackmarket'], consumedBy: ['blackmarket'] },
  { id: 'cmdty_weapons', name: 'Weapon Systems', category: 'military', basePrice: 280, volatility: 0.40, elasticity: 0.48, legality: 'restricted', volPerU: 0.9, massPerU: 1.5, fineMult: 1.2, producedBy: ['military'], consumedBy: ['military', 'blackmarket'] },
  { id: 'cmdty_munitions', name: 'Munitions', category: 'military', basePrice: 115, volatility: 0.32, elasticity: 0.48, legality: 'restricted', volPerU: 0.6, massPerU: 1.1, fineMult: 0.8, producedBy: ['military', 'fab'], consumedBy: ['military', 'blackmarket'] },
  { id: 'cmdty_impulse_charge', name: 'Impulse Charge', category: 'military', basePrice: 180, volatility: 0.25, elasticity: 0.50, legality: 'restricted', volPerU: 2.0, massPerU: 2.0, fineMult: 1.0, producedBy: ['military', 'fab'], consumedBy: ['military', 'blackmarket'] },
  // Asteroid-site industry chain (deliberate catalog extension, 2026-07-17 — design/ASTEROID_SITES_BRIEF.md).
  { id: 'cmdty_purified_silica', name: 'Purified Silica', category: 'refined', basePrice: 45, volatility: 0.24, elasticity: 0.42, legality: 'legal', volPerU: 0.8, massPerU: 0.9, fineMult: 0, producedBy: ['refinery', 'fab'], consumedBy: ['fab', 'research'] },
  { id: 'cmdty_regocrete', name: 'Regocrete', category: 'component', basePrice: 30, volatility: 0.18, elasticity: 0.35, legality: 'legal', volPerU: 1.5, massPerU: 1.8, fineMult: 0, producedBy: ['fab', 'trade_hub'], consumedBy: ['mining', 'fab'] },
  { id: 'cmdty_control_unit', name: 'Machine Control Unit', category: 'tech', basePrice: 450, volatility: 0.30, elasticity: 0.45, legality: 'legal', volPerU: 1.2, massPerU: 0.8, fineMult: 0, producedBy: ['fab', 'trade_hub'], consumedBy: ['mining', 'fab'] },
];

const EXPECTED_COMMODITY_COUNT = BASELINE.length;

const PLACE_FACTION_RE = /\b(ceres|helios|vael|meridian|concord|reach|luna|kuiper|outer)\b/i;
const MORALIZING_RE = /\b(evil|wrong|should not|immoral|unethical|sinful|shameful)\b/i;

export function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function pickBalanceFields(cmdty) {
  const out = {};
  for (const key of BALANCE_KEYS) out[key] = cmdty[key];
  return out;
}

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length
    && a.every((v, i) => v === b[i]);
}

function deepEqualBalance(a, b) {
  for (const key of BALANCE_KEYS) {
    const av = a[key];
    const bv = b[key];
    if (Array.isArray(av)) {
      if (!arraysEqual(av, bv)) return false;
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}

export function runCommodityFlavorCheck() {
const logs = [];
const balanceLogs = ['# commodity balance-field integrity (frozen baseline vs live COMMODITIES)'];

function log(line) {
  logs.push(line);
  console.log(line);
}

function balanceLog(line) {
  balanceLogs.push(line);
}

let fail = 0;
let balanceFail = 0;

assert.equal(COMMODITIES.length, EXPECTED_COMMODITY_COUNT, `COMMODITIES length must be ${EXPECTED_COMMODITY_COUNT}`);
assert.equal(Object.keys(COMMODITY_FLAVOR).length, EXPECTED_COMMODITY_COUNT, `COMMODITY_FLAVOR keys must be ${EXPECTED_COMMODITY_COUNT}`);

const ids = COMMODITIES.map((c) => c.id);
const uniqueIds = new Set(ids);
assert.equal(uniqueIds.size, EXPECTED_COMMODITY_COUNT, 'commodity ids must be unique');

const flavorIds = new Set(Object.keys(COMMODITY_FLAVOR));
for (const id of ids) {
  if (!flavorIds.has(id)) {
    log(`FAIL missing flavor for ${id}`);
    fail++;
  }
}
for (const id of flavorIds) {
  if (!uniqueIds.has(id)) {
    log(`FAIL extra flavor key ${id}`);
    fail++;
  }
}

const baselineById = Object.fromEntries(BASELINE.map((b) => [b.id, b]));

for (const cmdty of COMMODITIES) {
  const { id, displayName, desc, lore, name } = cmdty;
  const baseline = baselineById[id];

  if (!baseline) {
    log(`FAIL ${id}: no baseline entry`);
    fail++;
    continue;
  }

  const liveBalance = pickBalanceFields(cmdty);
  if (!deepEqualBalance(liveBalance, baseline)) {
    log(`FAIL ${id}: balance fields changed`);
    balanceLog(`FAIL ${id}: balance fields changed`);
    for (const key of BALANCE_KEYS) {
      const lv = liveBalance[key];
      const bv = baseline[key];
      const same = Array.isArray(lv) ? arraysEqual(lv, bv) : lv === bv;
      if (!same) balanceLog(`  ${key}: live=${JSON.stringify(lv)} baseline=${JSON.stringify(bv)}`);
    }
    fail++;
    balanceFail++;
  } else {
    balanceLog(`ok   ${id}: balance fields match baseline`);
  }

  if (!displayName || !desc || !lore) {
    log(`FAIL ${id}: missing displayName/desc/lore on merged record`);
    fail++;
    continue;
  }

  if (displayName === name) {
    log(`FAIL ${id}: displayName must differ from name`);
    fail++;
  }

  if (!/[A-Za-z]/.test(displayName)) {
    log(`FAIL ${id}: displayName must contain letters`);
    fail++;
  }

  const descWords = wordCount(desc);
  const loreWords = wordCount(lore);

  if (descWords > 16) {
    log(`FAIL ${id}: desc ${descWords} words (max 16) — "${desc}"`);
    fail++;
  }

  if (loreWords > 30) {
    log(`FAIL ${id}: lore ${loreWords} words (max 30) — "${lore}"`);
    fail++;
  }

  if (!PLACE_FACTION_RE.test(lore)) {
    log(`FAIL ${id}: lore missing place/faction reference — "${lore}"`);
    fail++;
  }

  if (cmdty.legality === 'contraband' && MORALIZING_RE.test(`${displayName} ${desc} ${lore}`)) {
    log(`FAIL ${id}: contraband flavor moralizes — sample blocked`);
    fail++;
  }

  log(`ok   ${id}: desc=${descWords}w lore=${loreWords}w display="${displayName}"`);
}

// Spot-check contraband samples for log evidence
for (const id of ['cmdty_narcotics', 'cmdty_stolen_goods', 'cmdty_weapons']) {
  const c = COMMODITIES.find((x) => x.id === id);
  log(`sample ${id}: "${c.lore}"`);
}

balanceLogs.push('');
balanceLogs.push(`${balanceFail ? 'FAIL' : 'PASS'} balance integrity (${EXPECTED_COMMODITY_COUNT - balanceFail}/${EXPECTED_COMMODITY_COUNT} ok)`);

log(`\n${fail ? 'FAIL' : 'PASS'} commodity flavor check (${EXPECTED_COMMODITY_COUNT - fail}/${EXPECTED_COMMODITY_COUNT} ok)`);

const scratch = process.env.COMMODITY_FLAVOR_SCRATCH;
if (scratch) {
  fs.mkdirSync(scratch, { recursive: true });
  fs.writeFileSync(path.join(scratch, 'commodity-flavor-validate.log'), `${logs.join('\n')}\n`);
  fs.writeFileSync(path.join(scratch, 'commodity-balance-integrity.log'), `${balanceLogs.join('\n')}\n`);
  console.log(`wrote logs to ${scratch}`);
}

return fail;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const fail = runCommodityFlavorCheck();
  if (fail) process.exit(1);
}
