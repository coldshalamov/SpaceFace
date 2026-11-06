// Pickup worth read — the drop's beacon answers what the lot is worth (inf-pod-worth).
//
// WHAT THIS OWNS
// --------------
// Every commodity drop used to glow identically: same emissive breathe, same halo floor,
// same kick. At flight-camera range a 9,800-credit unbroken lens read exactly like a 7-credit
// silicate chunk, so nothing on the glass said which pod was worth the turn — the chase was
// blind. This module is the single owner of the worth decision, read only from what the sim
// already put on the drop (commodityId + amount), and it grades the drop's light:
//
//   junk (0)   dimmer than today — a chunk that prices under the plain band stops competing
//              for the eye with the drops that matter.
//   plain (1)  exactly today's read — the median drop is unchanged, so this regrade moves
//              only the ends of the table.
//   rich (2)   hotter glint, higher halo floor, wider strobe kick, and the double band — a
//              second inner ring the eye reads as "that one" across the field.
//
// PURE: prices come from the data table (src/data/commodities.js basePrice, the same table
// the economy owns), units from the drop's own amount/qty. An unpriceable drop reads plain —
// this layer never dims something it cannot value. No Three.js, no clock, no state.

import { COMMODITIES } from '../data/commodities.js';

const PRICE_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c.basePrice]));

/** Lot value at or above which a drop reads rich (credits at equilibrium price). */
export const WORTH_RICH_LOT_CR = 900;
/** Lot value at or above which a drop reads plain; below it, junk. */
export const WORTH_PLAIN_LOT_CR = 60;

/**
 * The lot's value in credits, or null when the drop carries no priceable commodity.
 * Units prefer `amount` (the ore spill field), fall back to `qty`, default one unit.
 */
export function pickupLotValue(data) {
  const base = PRICE_BY_ID.get(data && data.commodityId);
  if (!Number.isFinite(base)) return null;
  const raw = data && Number.isFinite(data.amount) ? data.amount
    : data && Number.isFinite(data.qty) ? data.qty : 1;
  const units = Math.max(1, Number(raw) || 1);
  return base * units;
}

/**
 * 0 junk, 1 plain, 2 rich. An unpriceable drop (unknown id, salvage pools, modules) reads
 * plain — never dim, never rich on a guess.
 */
export function worthTierFor(data) {
  const value = pickupLotValue(data);
  if (value == null) return 1;
  if (value >= WORTH_RICH_LOT_CR) return 2;
  if (value >= WORTH_PLAIN_LOT_CR) return 1;
  return 0;
}

/**
 * Presentation parameters per tier.
 *   glintHeat  multiplier on the gem's emissive breathe (plain = today's 1.0).
 *   haloFloor  the beacon ring's resting opacity (plain = today's 0.55).
 *   haloKick   how far the transponder's double-flash lifts the ring.
 *   doubleBand rich only: the factory builds the second inner ring when this is true.
 */
export const WORTH_READS = Object.freeze([
  Object.freeze({ glintHeat: 0.72, haloFloor: 0.4, haloKick: 0.45, doubleBand: false }),
  Object.freeze({ glintHeat: 1.0, haloFloor: 0.55, haloKick: 0.45, doubleBand: false }),
  Object.freeze({ glintHeat: 1.35, haloFloor: 0.78, haloKick: 0.6, doubleBand: true }),
]);

/** The read for a tier, clamped. NaN-safe. */
export function worthReadFor(tier) {
  const t = Number.isFinite(tier) ? Math.min(2, Math.max(0, Math.round(tier))) : 1;
  return WORTH_READS[t];
}
