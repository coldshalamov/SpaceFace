// wreckClasses.js — BP-01.1 packet WRECK_PROVENANCE ("Who Died Here") — DATA.
//
// The wreck-class taxonomy a seeded wreck reads as: fresh / battlefield / military / ancient.
// Pure data + pure seeded selector — no imports, no state, no side effects. One source of truth
// for wreck-class prose consumed by the loss-ledger wreck-tagging path and (later) salvage-depth
// packets (SALVAGE_DISTINCT_FROM_MINING, SALVAGE_PERMIT_AND_FINES).
//
// CRITICAL DISCIPLINE (enforced structurally by the system side, lossLedger.js):
//   • Class assignment is SEEDED via the recorded loss id + sectorId (hash32(seed, lossId, sectorId, 'wreckClass')).
//     The same recorded loss ⇒ the same class on every load. The ledger and the wreck read the
//     SAME provenance (both key off lossId + sectorId — see failureMode "provenance drift").
//   • A wreck with NO recorded loss ⇒ the generic class ('debris'), unchanged from today. This is
//     the golden-sim-safe path: 47-A never emits loss events ⇒ no class assignment ⇒ no leak.
//   • Military is the only class SALVAGE_PERMIT_AND_FINES will later tag as restricted salvage.
//
// THE ONE FILTER: a player can SEE the class (scan glyph/label), PREDICT the salvage pool it
// yields (each class names a distinct pool lean), and CHANGE their approach (military ⇒ permit
// risk; ancient ⇒ low yield; fresh ⇒ rich). If none held, this would be cost. All three hold.
//
// reuses (per spec E_salvage_economy_contracts.md WRECK_PROVENANCE):
//   salvage.js per-zone hash pattern (hash32(seed, sectorId, zoneId, 'salvage')) — mirrored with a
//   distinct salt ('wreckClass') and keyed by the recorded LOSS id so the ledger and the wreck agree.
// budget: spawn:none · voice:none · draw:none  (data only)

import { hash32, mulberry32 } from '../core/rng.js';

// Wreck-class catalog. `poolLean` is a *flavor* tag (the real pool is owned by salvage.js); here
// it only informs the scan label so the player can predict what they'll get before committing.
// `restricted` flags classes SALVAGE_PERMIT_AND_FINES will later treat as classified salvage.
export const WRECK_CLASSES = Object.freeze({
  debris: Object.freeze({
    id: 'debris',
    label: 'Wreck Debris',
    scanLabel: 'Wreck Debris',
    blurb: 'Scattered hull plating. Slim pickings, but nobody will ask questions.',
    poolLean: 'scrap',
    restricted: false,
  }),
  fresh: Object.freeze({
    id: 'fresh',
    label: 'Fresh Wreck',
    scanLabel: 'Recent Wreck',
    blurb: 'A recent loss — cargo still largely intact, if you reach it before the scavengers.',
    poolLean: 'intact',
    restricted: false,
  }),
  battlefield: Object.freeze({
    id: 'battlefield',
    label: 'Battlefield Wreck',
    scanLabel: 'Battle-scarred Hulk',
    blurb: 'Shot to pieces in a fight the sim recorded here. Salvageable, but hot — cut carefully.',
    poolLean: 'mixed',
    restricted: false,
  }),
  military: Object.freeze({
    id: 'military',
    label: 'Military Wreck',
    scanLabel: 'Classified Military Hulk',
    blurb: 'A Concord-flagged hull. Stripping it without a permit is a crime — Concord fines, the Quiet launders.',
    poolLean: 'milspec',
    restricted: true,
  }),
  ancient: Object.freeze({
    id: 'ancient',
    label: 'Ancient Derelict',
    scanLabel: 'Ancient Derelict',
    blurb: 'Drifted here long before the lane was charted. Mostly picked clean; the black box may still read.',
    poolLean: 'trace',
    restricted: false,
  }),
});

export const WRECK_CLASS_IDS = Object.freeze(Object.keys(WRECK_CLASSES));

export function wreckClassById(id) {
  return WRECK_CLASSES[id] || null;
}

// The classes a wreck may take ONCE it has provenance (a recorded loss). 'debris' is the
// no-provenance default and is excluded from the provenance draw — a loss always promotes a
// wreck out of the generic state into one of the four story-bearing classes.
const PROVENANCE_CLASSES = Object.freeze(['fresh', 'battlefield', 'military', 'ancient']);

// Deterministic wreck-class assignment keyed off the recorded loss id + sectorId.
// Pure: same (seed, lossId, sectorId) ⇒ same class on every load. No Math.random.
//
// Weighting (biased toward the common cases a real sector-sim produces):
//   fresh       ~40%  — the most common outcome of a recent trader/convoy loss
//   battlefield ~30%  — a loss that came with a fight (the spawn:request ambush path)
//   military    ~15%  — rarer; a Concord/faction-flagged asset lost (restricted salvage)
//   ancient     ~15%  — an old loss resurfacing (the ring buffer's older entries)
const WEIGHTS = Object.freeze({ fresh: 0.40, battlefield: 0.30, military: 0.15, ancient: 0.15 });

/**
 * Pick a wreck class for a recorded loss. Deterministic per (seed, lossId, sectorId).
 * @param {{seed:number, lossId:string, sectorId:string}} key — provenance key (both ledger + wreck use this)
 * @returns {string} a WRECK_CLASS id (never 'debris' — a loss always promotes the wreck)
 */
export function pickWreckClass(key) {
  if (!key || !key.lossId || !key.sectorId) return 'fresh'; // defensive: a loss with no id still gets a class
  const seed = (key.seed >>> 0) || 1;
  const rng = mulberry32(hash32(seed, key.lossId, key.sectorId, 'wreckClass') >>> 0);
  const r = rng();
  let acc = 0;
  for (const id of PROVENANCE_CLASSES) {
    acc += WEIGHTS[id];
    if (r < acc) return id;
  }
  return 'fresh'; // float tail guard
}

export default WRECK_CLASSES;
