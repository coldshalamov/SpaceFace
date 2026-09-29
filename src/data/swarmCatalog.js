// Swarm armory catalog (design/swarm/SWARM_PROGRAM.md §S3) — the exhaustive sandbox shelf.
//
// THE GAP THIS FILLS
// ------------------
// The authored pools (SURVIVAL_DRAFT_OFFERS + SWARM_DRAFT_OFFERS) field forty-two cards. The
// fitting tables ship ~140 defs. Anything without an authored card was invisible in the
// armory — a sandbox where most of the sandbox cannot be bought.
//
// This file closes that without touching the authored set: for every purchasable def in
// src/data/weapons.js and src/data/modules.js that no authored card names, it synthesizes one
// offer row here, priced by the same tier ladder (swarmPurchasePrice) and legalized by the
// same fits()/capacity pass in offerDraft. If it can be fitted, it can be bought — that is
// the whole contract. Non-purchasable rows (stock thrusters, unique salvage trophies) stay
// out: they are not shop content on any shelf, including this one.
//
// Generated rows are marked `catalog: true` so the armory can tell an authored card — hand-
// written verb and blurb — from a shelf entry, and so the draft-shape audit keeps measuring
// only the authored set.
//
// Pure frozen-ish data: no bus, no RNG, no DOM. The one input is the authored exclusion set,
// passed in by the caller so this file never has to import the draft pools (which import us).

import { WEAPONS } from './weapons.js';
import { MODULES } from './modules.js';

export const SWARM_CATALOG_SCHEMA_VERSION = 1;

/** Armory shelf: the coarse group a card browses under. Stamped on every eligible offer. */
export const SWARM_CATEGORIES = Object.freeze([
  'Weapons',
  'Defense',
  'Motion',
  'Rigs',
  'Bay',
  'Prospecting',
]);

const CATALOG_CATEGORY_BY_SLOT = Object.freeze({
  weapon: 'Weapons',
  shield: 'Defense',
  engine: 'Motion',
  thruster: 'Motion',
  utility: 'Rigs',
  cargo: 'Bay',
  mining: 'Prospecting',
});

// A catalog verb is a shelf word, not an authored action: it says WHAT the thing is so a
// hundred generated rows stay scannable, while authored cards keep their hand-picked verbs.
const CATALOG_VERB_BY_SLOT = Object.freeze({
  weapon: 'Gun',
  shield: 'Screen',
  engine: 'Drive',
  thruster: 'Steer',
  utility: 'Rig',
  cargo: 'Hold',
  mining: 'Extractor',
});

const WEAPON_MOUNT_VERB = Object.freeze({
  gun: 'Gun',
  turret: 'Turret',
  launcher: 'Launcher',
  spinal: 'Spinal',
});

/** The shelf a def browses under in the armory. Exported so the screen needs no def table. */
export function swarmCategoryFor(def) {
  if (!def || typeof def !== 'object') return 'Rigs';
  return CATALOG_CATEGORY_BY_SLOT[def.slotType] || 'Rigs';
}

/** One short shelf word for a generated row. */
function catalogVerbFor(def) {
  if (!def || typeof def !== 'object') return 'Stock';
  if (def.slotType === 'weapon') {
    const mount = typeof def.mount === 'string' ? def.mount : null;
    return WEAPON_MOUNT_VERB[mount] || 'Gun';
  }
  return CATALOG_VERB_BY_SLOT[def.slotType] || 'Stock';
}

/** A spec line when the def carries no authored sentence — always one clean line. */
function catalogBlurbFor(def) {
  const sentence = typeof def.sentence === 'string' && def.sentence.trim()
    ? def.sentence.trim()
    : null;
  if (sentence) return sentence;
  const size = typeof def.size === 'string' ? ` ${def.size}` : '';
  return `${catalogVerbFor(def)}${size} for the bay that takes it.`;
}

/** Shop content test: a def that cannot be bought anywhere is not armory content either. */
export function isArmoryStock(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.purchasable === false) return false;
  if (def.unique === true || def.salvageOnly === true) return false;
  if (typeof def.id !== 'string' || !def.id) return false;
  return def.slotType === 'weapon'
    || def.slotType === 'shield'
    || def.slotType === 'engine'
    || def.slotType === 'thruster'
    || def.slotType === 'utility'
    || def.slotType === 'cargo'
    || def.slotType === 'mining';
}

let allStock = null;
function everyStockDef() {
  if (allStock == null) {
    allStock = WEAPONS.concat(MODULES).filter(isArmoryStock);
    Object.freeze(allStock);
  }
  return allStock;
}

/**
 * The generated shelf: one offer row per purchasable def not already authored.
 * `excludedDefIds` is the authored pool's defId set (the caller owns the pools).
 * Each row carries only the card fields offerDraft does not derive itself — `name`,
 * `slotIndex` and `replaces` come from the legality pass like every other offer.
 */
export function swarmCatalogOffers(excludedDefIds) {
  const excluded = excludedDefIds instanceof Set ? excludedDefIds : new Set();
  const rows = [];
  for (const def of everyStockDef()) {
    if (excluded.has(def.id)) continue;
    rows.push({
      id: `cat_${def.id}`,
      defId: def.id,
      verb: catalogVerbFor(def),
      kind: 'number',
      shape: null,
      blurb: catalogBlurbFor(def),
      catalog: true,
    });
  }
  return Object.freeze(rows);
}

/** Catalog sanity: every generated row resolves to a real def and one shelf word each. */
export function validateSwarmCatalog(excludedDefIds) {
  const issues = [];
  const rows = swarmCatalogOffers(excludedDefIds);
  const seen = new Set();
  const stock = new Set(everyStockDef().map((def) => def.id));
  for (const row of rows) {
    if (seen.has(row.defId)) issues.push(`${row.defId}: duplicate catalog row`);
    seen.add(row.defId);
    if (!stock.has(row.defId)) issues.push(`${row.defId}: row for non-stock def`);
    if (!SWARM_CATEGORIES.includes(swarmCategoryFor({ slotType: rowSlotOf(row.defId) }))) {
      issues.push(`${row.defId}: uncategorized`);
    }
  }
  if (rows.length === 0) issues.push('catalog produced no rows');
  return { ok: issues.length === 0, issues, count: rows.length };
}

function rowSlotOf(defId) {
  const def = everyStockDef().find((entry) => entry.id === defId);
  return def ? def.slotType : null;
}

/** Counts by shelf — the door and tests read this to say what the sandbox really stocks. */
export function swarmCatalogCoverage() {
  const stock = everyStockDef();
  const byCategory = {};
  for (const def of stock) {
    const cat = swarmCategoryFor(def);
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  return { total: stock.length, byCategory };
}
