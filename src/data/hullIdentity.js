// PQ-142.01 — the name a stranger uses for the hull you are flying.
//
// `design/VISION.md` Part II: the ship accumulates history "until it is my fucking ship". A hull
// nobody can name cannot be recognised, so recognition needs one deterministic name per owned hull.
//
// The first hull is not invented: `src/data/narrative.js` already names it. The Tessera is canon —
// the cold open pings its registry, the dockmaster knows it by silhouette, and the band radio in
// `src/data/flavor/040-band.js` already speaks the name. Later hulls draw a name from an authored
// bank, seeded by the run seed and the berth index, so the same save always says the same word.
//
// FB-057 — the owner can overrule the banked word. `ownedShip.name` is a hand-typed name the ships
// system writes (cleaned, capped). When present it outranks both canon and the bank, and every
// reader funnels through `hullNameForOwnedShip`, so the ledger, the barks, and the shipworks crest
// all say the renamed word.
//
// Pure data + pure functions. No state writes, no bus, no imports outside data/core.
import { SHIP as NARRATIVE_SHIP } from './narrative.js';
import { NEW_GAME } from './newGameDefaults.js';
import { SHIPS } from './ships.js';
import { hash32 } from '../core/rng.js';

const SHIP_BY_ID = new Map(SHIPS.map((entry) => [entry.id, entry]));

/** Hull names for berths after the first. Authored, not generated — a name has to sound owned. */
export const HULL_NAME_BANK = Object.freeze([
  'Long Answer', 'Cold Restart', 'Second Shift', 'Held Line', 'Paper Wake',
  'Quiet Tenner', 'Unfiled', 'Slow Freight', 'Last Berth', 'Open Docket',
  'Nine Grams', 'Counterweight', 'Short Notice', 'Rough Manifest', 'Salt Line',
  'Working Light',
]);

/** The registry code the Concord ping reads out for the starting hull. */
export const STARTER_HULL_REGISTRATION = NARRATIVE_SHIP.registration;

/** FB-057: the longest name the ships owner will write onto an ownedShip record. */
export const SHIP_NAME_MAX = 32;

/**
 * Owner-given hull name, cleaned for the record: trimmed, whitespace collapsed, control
 * characters dropped, capped at SHIP_NAME_MAX. Returns '' for no usable name — an empty
 * string is never a name, so the banked name answers instead (nothing is fabricated).
 */
export function cleanShipName(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SHIP_NAME_MAX)
    .trim();
  return cleaned;
}

function positiveIndex(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function seedOf(state) {
  const seed = Number(state && state.meta && state.meta.seed);
  return Number.isFinite(seed) ? seed >>> 0 : 0;
}

/**
 * True when this berth holds the hull the campaign starts with. Checked by defId rather than
 * assumed from the index alone: a player who sold the starter and bought another Kestrel-class
 * hull into berth 0 has a different ship, and the ledger must not call it the Tessera by accident.
 */
export function isStarterHull(ownedShip, index) {
  return positiveIndex(index) === 0
    && !!ownedShip
    && ownedShip.defId === NEW_GAME.shipId
    && ownedShip.starterHull !== false;
}

/**
 * The spoken name of one owned hull. An owner-given name wins; then the starter's canon name; then
 * a deterministic pick from the bank for the given seed + berth.
 */
export function hullNameForOwnedShip(ownedShip, index = 0, seed = 0) {
  const given = ownedShip && typeof ownedShip.name === 'string' ? cleanShipName(ownedShip.name) : '';
  if (given) return given;
  if (isStarterHull(ownedShip, index)) return NARRATIVE_SHIP.name;
  const defId = ownedShip && ownedShip.defId ? String(ownedShip.defId) : 'ship_unknown';
  const pick = hash32(seed >>> 0, 'hullName', defId, positiveIndex(index)) % HULL_NAME_BANK.length;
  return HULL_NAME_BANK[pick];
}

/** The class word a stranger would use if they did not know the name ("Kestrel"). */
export function hullClassForOwnedShip(ownedShip) {
  const def = ownedShip && ownedShip.defId ? SHIP_BY_ID.get(ownedShip.defId) : null;
  return def && def.name ? def.name : 'unregistered hull';
}

/** The berth the player is flying right now, or null before a ship exists. */
export function activeOwnedShip(state) {
  const player = state && state.player;
  if (!player || !Array.isArray(player.ownedShips)) return null;
  const index = positiveIndex(player.activeShipIndex);
  return player.ownedShips[index] || null;
}

/**
 * Name / class / registry for the hull the player is flying. One reader for the ledger, the barks,
 * and any later surface, so two places can never disagree about what the ship is called.
 */
export function activeHullIdentity(state) {
  const player = state && state.player;
  const index = positiveIndex(player && player.activeShipIndex);
  const owned = activeOwnedShip(state);
  if (!owned) return null;
  return Object.freeze({
    index,
    defId: owned.defId || null,
    name: hullNameForOwnedShip(owned, index, seedOf(state)),
    className: hullClassForOwnedShip(owned),
    registration: isStarterHull(owned, index) ? STARTER_HULL_REGISTRATION : null,
  });
}

export default activeHullIdentity;
