// RC-21 — the loss-to-docket router. The loss ledger records five authored loss shapes
// (KIND_NORMALIZE in systems/lossLedger.js: trader, drone, fleet, outpost, ship); each shape owns
// a list of the lab cases a field court could plausibly convene for it, and one deterministic
// hash pick lands a real loss on one of them. The union across the five shapes is the whole
// authored docket, so every lab-only case is reachable from live play. Case data itself is never
// edited: this table only NAMES ids that already exist in cases.js.

import { hash32 } from '../../core/rng.js';
import { WRECK_COURT_CASE_IDS, WRECK_COURT_ENTRY_CASE, caseDef } from './index.js';

export const LOSS_SHAPE_CASES = Object.freeze({
  // A hauler gone dark: insurer disputes, staged collisions, quiet raids, and the ordinary
  // tragedies (ram, rock, dropped tow, ricochet) a manifest loss can actually be.
  trader: Object.freeze([
    'wc_desperate_rescue',
    'wc_faked_collision',
    'wc_smuggling_cleanup',
    'wc_ambush_as_accident',
    'wc_abandoned_tow',
    'wc_ricochet_blame',
  ]),
  // A mining drone's end is industrial: the barge that cooked off or the line that whipped.
  drone: Object.freeze([
    'wc_industrial_overload',
    'wc_massline_snap',
  ]),
  // A fleet hull lost in company: magazine chains and fratricidal fire.
  fleet: Object.freeze([
    'wc_cookoff_chain',
    'wc_ricochet_blame',
  ]),
  // An outpost raid reads as a station-side incident or a cleanup after the fact.
  outpost: Object.freeze([
    'wc_clamp_shear',
    'wc_smuggling_cleanup',
  ]),
  // A lone ship's silence: vanished off the lane, an engine that let go, or a cover story.
  ship: Object.freeze([
    'wc_slingshot_disappearance',
    'wc_engine_failure',
    'wc_abandoned_tow',
    'wc_faked_collision',
  ]),
});

const CASE_ID_SET = new Set(WRECK_COURT_CASE_IDS);

/**
 * The case a recorded loss convenes, chosen deterministically from its shape's list by the same
 * seed triple the ledger itself is keyed on (seed, sector, lossId). Identical inputs always land
 * the same case; an unrecognized shape falls back to the docket's entry case rather than failing.
 */
export function caseIdForLoss(loss, { seed = 1, sectorId = null } = {}) {
  const kind = loss && typeof loss.kind === 'string' ? loss.kind : null;
  const list = (kind && LOSS_SHAPE_CASES[kind]) || [WRECK_COURT_ENTRY_CASE];
  const idx = hash32(
    seed || 1,
    sectorId || (loss && loss.sectorId) || '',
    (loss && loss.lossId) || '',
    kind || 'unknown',
    'wreckCourtCase',
  ) % list.length;
  return list[idx] || list[0] || WRECK_COURT_ENTRY_CASE;
}

/** The distinct cases the five shapes can convene — the full authored docket by construction. */
export function lossDocketCoverage() {
  const seen = new Set();
  for (const list of Object.values(LOSS_SHAPE_CASES)) {
    for (const id of list) seen.add(id);
  }
  return [...seen].sort();
}

/** Guard rail for a fat-fingered edit: every table entry must name a real authored case. */
export function assertValidLossDocket() {
  for (const [kind, list] of Object.entries(LOSS_SHAPE_CASES)) {
    if (!Array.isArray(list) || !list.length) throw new Error(`loss docket shape ${kind} has no cases`);
    for (const id of list) {
      if (!CASE_ID_SET.has(id) || !caseDef(id)) throw new Error(`loss docket shape ${kind} names unknown case ${id}`);
    }
  }
  return true;
}
