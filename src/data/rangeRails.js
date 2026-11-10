// The Range's rung rail: stable rung/drill IDs, the authored rule+instruction table, and the
// rung-index lookup. Lives in src/data/ — not src/ui/screens/range.js — because sim-side code
// reads it: the death-recovery offer in src/combat/playerDefeat.js cites the swing rung, and the
// combat-grammar ownership check forbids src/combat → src/ui imports. The screen module re-exports
// every name here, so its public surface is unchanged.
//
// Rung ORDER is recorded data: existing rung indices are baked into funnels and pinned by
// range-door tests — append new rungs at the end, never reorder.

export const TRACTOR_THROW_DRILL_ID = 'tractor_throw';
export const TRACTOR_THROW_DRILL_SECONDS = 60;
export const ELASTIC_WHIP_DRILL_ID = 'whip_snap';
export const ELASTIC_WHIP_DRILL_SECONDS = 60;

export const SLIP_GAP_DRILL_ID = 'slip_a_gap';
export const BRAKE_BESIDE_LOAD_DRILL_ID = 'brake_beside_load';
export const ORBIT_RELEASE_DRILL_ID = 'orbit_before_release';

export const SEED_PARKS_DRIFT_DRILL_ID = 'seed_parks_drift';
export const REPULSOR_PILES_BERM_DRILL_ID = 'repulsor_piles_berm';
export const CONE_PLOWS_LANE_DRILL_ID = 'cone_plows_lane';
export const SKIM_COLLECTS_BAND_DRILL_ID = 'skim_collects_band';

export const POWER_RUNG_IDS = Object.freeze([
  'well_pulls_light',
  SEED_PARKS_DRIFT_DRILL_ID,
  REPULSOR_PILES_BERM_DRILL_ID,
  CONE_PLOWS_LANE_DRILL_ID,
  SKIM_COLLECTS_BAND_DRILL_ID,
]);

/** The rungs' rules and verdicts are authored in caps (RAIL_ROWS is data and does not change); the
 *  sheet sets them in sentence case. Only the first letter is raised; everything else lowers. */
export function sentenceCase(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const RAIL_ROWS = Object.freeze([
  Object.freeze({ id: 'heavy_turns_wide', group: 'MASS', rule: 'HEAVY HULLS TURN WIDE', instruction: 'Fly the loaded hull through all four gates without clipping one.' }),
  Object.freeze({ id: 'stopping_takes_room', group: 'MASS', rule: 'STOPPING TAKES ROOM', instruction: 'From flat out, stop before the wall line.' }),
  Object.freeze({ id: 'swing_do_not_pull', group: 'MASSLINE', rule: 'SWING, DO NOT PULL', instruction: 'Hook the anchor, swing, and release through the exit gate.' }),
  Object.freeze({ id: 'you_can_run_dry', group: 'POWER', rule: 'YOU CAN RUN DRY', instruction: 'Hold fire for 20 seconds and keep cap above zero.' }),
  Object.freeze({ id: 'boost_keep_speed', group: 'SPEED', rule: 'BOOST KEEPS THE SPEED', instruction: 'Hold boost through the far gate. Thrust alone will not make it.' }),
  Object.freeze({ id: 'draw_the_stroke', group: 'FLIGHT', rule: 'DRAW THE STROKE', instruction: 'Draw a line through the gate. The hull follows your stroke.' }),
  Object.freeze({ id: 'well_pulls_light', group: 'FIELD', rule: 'THE WELL PULLS LIGHT', instruction: 'Drop a well near the scrap. Let it pull.' }),
  Object.freeze({
    id: TRACTOR_THROW_DRILL_ID,
    group: 'MASSLINE',
    rule: 'PICK UP, SPIN, THROW',
    instruction: 'Latch the pod, swing it up, and cut so it flies through the gate.',
    durationSeconds: TRACTOR_THROW_DRILL_SECONDS,
  }),
  Object.freeze({
    id: ELASTIC_WHIP_DRILL_ID,
    group: 'MASSLINE',
    rule: 'STRETCH STORES, RELEASE SNAPS',
    instruction: 'Latch the wasp, burn away to store the stretch, and let the return yank it through the gate.',
    durationSeconds: ELASTIC_WHIP_DRILL_SECONDS,
  }),
  // SF-015 proving-ground rungs: appended (never reordered — existing rung indices are
  // recorded in funnels and pinned by range-door-funnel tests).
  Object.freeze({
    id: 'slip_a_gap',
    group: 'FLIGHT',
    rule: 'SLIP THE GAP',
    instruction: 'Thread the slot between the two hulls. Touch nothing.',
  }),
  Object.freeze({
    id: 'brake_beside_load',
    group: 'MASS',
    rule: 'HOLD BESIDE THE LOAD',
    instruction: 'Come alongside the drifting load. Hold station two seconds.',
  }),
  Object.freeze({
    id: 'orbit_before_release',
    group: 'MASSLINE',
    rule: 'ORBIT BEFORE RELEASE',
    instruction: 'Hook the anchor, take the long way around, then release through the exit.',
  }),
  // FB-002/B118 — the Range teaches all five powers. Well is 'well_pulls_light' above; these
  // four rows land the rest of POWER_ROSTER (seed / repulsor / cone / skim) as live rungs,
  // appended after SF-015's rungs so no recorded funnel index moves.
  Object.freeze({
    id: 'seed_parks_drift',
    group: 'FIELD',
    rule: 'A LOCK-RING BECOMES AN ANCHOR',
    instruction: 'Throw the Mass Seed ahead of the drift. The ring parks what it catches.',
  }),
  Object.freeze({
    id: 'repulsor_piles_berm',
    group: 'FIELD',
    rule: 'A RING SHOVES MASS OUT TO A BERM',
    instruction: 'Drop the plow inside the pile. Bowl the scrap out to the berm.',
  }),
  Object.freeze({
    id: 'cone_plows_lane',
    group: 'FIELD',
    rule: 'A WEDGE PLOWS A LANE AHEAD OF THE NOSE',
    instruction: 'Open the wedge and hold the lane through the clutter.',
  }),
  Object.freeze({
    id: 'skim_collects_band',
    group: 'FIELD',
    rule: 'A SHEET COLLECTS LOOSE MASS ONTO THE LINE',
    instruction: 'Open the scoop and graze the ring. The sheet brings the motes to you.',
  }),
]);
export const RAIL_INDEX_BY_ID = new Map(RAIL_ROWS.map((row, index) => [row.id, index]));
export const RANGE_RAIL_ROWS = RAIL_ROWS;

export function rangeRungIndex(rungId) {
  const index = RAIL_INDEX_BY_ID.get(rungId);
  return Number.isInteger(index) ? index : -1;
}
