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

/**
 * Wallet prices for the hull row — the same tier ladder shape as the fittings', but a hull is
 * the most consequential purchase in the sandbox so it prices an order bigger.
 */
export const SWARM_HULL_PRICES = Object.freeze([40, 80, 130, 190, 260, 340]);
export function swarmHullPrice(shipDef) {
  const tier = Math.max(0, Math.min(SWARM_HULL_PRICES.length - 1,
    Math.trunc(Number(shipDef && shipDef.tier) || 0)));
  return SWARM_HULL_PRICES[tier];
}

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

/**
 * A spec line when the def carries no authored sentence — always one clean line. Weapons carry
 * the two figures combat pays (sustained fire, shove), so a shelf row reads as a choice between
 * guns instead of a list of names with prices. Exported for the armory's checks.
 */
export function catalogBlurbFor(def) {
  if (!def || typeof def !== 'object') return '';
  const size = typeof def.size === 'string' ? ` ${def.size}` : '';
  const base = swarmFightReason(def) || `${catalogVerbFor(def)}${size} for the bay that takes it.`;
  if (def.slotType !== 'weapon') return base;
  if (/dps|impulse/i.test(base)) return base;
  const dps = Number.isFinite(def.dps) ? def.dps : null;
  const impulse = Number.isFinite(def.impulsePerHit) ? def.impulsePerHit : null;
  if (dps == null && impulse == null) return base;
  const figures = [
    dps != null ? `${Math.round(dps * 10) / 10} dps` : '',
    impulse != null ? `impulse ${Math.round(impulse * 10) / 10}` : '',
  ].filter(Boolean).join(' · ');
  return `${base} ${figures}.`;
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

/**
 * Swarm is a fight in a closed room: no hold to fill, no ore to cut, no market, no scan
 * economy, no ecology, no travel. Kit whose whole effect lives in those loops is adventure
 * stock and stays off the Swarm shelf (owner playtest 2026-10-11: a Cargo Scanner on the
 * armory). Whole slots first, then the utility rigs that only speak to those loops.
 */
const SWARM_IRRELEVANT_SLOTS = new Set(['cargo', 'mining']);
export const SWARM_ADVENTURE_ONLY_IDS = Object.freeze(new Set([
  // scanning / information economy
  'mod_cargo_scanner_s', 'mod_market_data_s', 'mod_triangulation_suite_s', 'mod_survey_suite',
  'mod_sensor_array_l', 'mod_sensor_scrambler_s', 'mod_sensor_scrambler_m',
  'mod_cloak_mk1', 'mod_cloak_mk2',
  // ore and salvage pickup
  'mod_drill_amp', 'mod_tractor_beam_m',
  // travel
  'mod_engine_warp_l', 'mod_jump_drive_m',
  // ecology, contamination, biological cargo
  'mod_filter_stack_s', 'mod_filter_stack_m', 'mod_bio_spectral_pass_s', 'mod_field_coherence_meter',
  'mod_quarantine_locker_s', 'mod_hull_purge_ring_m', 'mod_quiet_mask_s', 'mod_relay_needle_s',
  'mod_capture_cradle_m', 'mod_containment_seal_s', 'mod_filament_contrast_s',
  'mod_host_cartography_s', 'mod_echo_recorder_s',
  // faction standing gates that a Crucible run never earns
  'mod_sanction_spool', 'mod_deep_scoop_array_m',
]));

/** True when a def does something in a Swarm fight. */
export function isSwarmRelevantDef(def) {
  if (!def || typeof def !== 'object') return false;
  if (SWARM_IRRELEVANT_SLOTS.has(def.slotType)) return false;
  return !SWARM_ADVENTURE_ONLY_IDS.has(def.id);
}

/**
 * One line for why this fitting is on a Swarm shelf. Prefers an authored
 * swarmReason, then the air sentence, then the first sentence of the description.
 * Read at offer time. Shared WEAPONS and MODULES rows are not mutated: an
 * adventure import of this module must not grow a swarmReason onto stock.
 */
export function swarmFightReason(def) {
  if (!def || typeof def !== 'object') return '';
  const own = typeof def.swarmReason === 'string' ? def.swarmReason.trim() : '';
  if (own.length >= 12) return own;
  const sentence = typeof def.sentence === 'string' ? def.sentence.trim() : '';
  if (sentence.length >= 12) return sentence;
  const desc = typeof def.description === 'string' ? def.description.trim() : '';
  if (desc.length >= 12) {
    const cut = desc.split(/(?<=[.!?])\s/)[0].trim();
    if (cut.length >= 12) return cut.length > 160 ? `${cut.slice(0, 157)}…` : cut;
  }
  if (def.slotType === 'weapon') return 'A gun for the fight in this room.';
  const size = typeof def.size === 'string' ? ` ${def.size}` : '';
  return `${catalogVerbFor(def)}${size} for the bay that takes it.`;
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
    if (!isSwarmRelevantDef(def)) continue;
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
