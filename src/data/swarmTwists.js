// C01-05 — the course twist registry: mechanics the named rounds play, beyond a dealt card.
//
// G08-02 authored every round a name and a twist line; `twistId` on a course row named the
// event CARD the twist dealt (swarmEventFor / swarmMinorEventFor). The nine rounds whose
// twists are ROOM mechanics — the freight carries enemies, the lights go out, the floor
// halves its prices — are not cards at all, so their `twistId` names a row HERE instead.
// `swarmCourseTwists` (the system) resolves the row and runs the mechanic through the
// canonical owners: freightLane moves the room, swarmFloor owns prices, swarmDrops owns
// the drop ledger, attachments owns the tethers, the purse owner owns the purse.
//
// `swarmTwistFor(wave)` is the single consult — planner, wave owner, events seam and the
// system all read the same row so a twist is never double-booked with a dealt card
// (the events consults in swarmEvents.js return null for a non-card twistId).

import { swarmCourseFor } from './swarmCourse.js';
import { FOUNDRY_ARENA_ID } from '../systems/swarmArena.js';

/** Round 29 — the hold before every gate opens at once. 40 s at the 60 Hz sim clock. */
export const SWARM_QUIET_HOLD_TICKS = 40 * 60;
/** Round 24 — the sale runs the round's authored 90 seconds. */
export const SWARM_EMG_SECONDS = 90;
/** Round 13 — the room falls to a quarter light over two seconds. */
export const SWARM_LIGHTS_OUT_INTENSITY = 0.25;
export const SWARM_LIGHTS_OUT_RAMP_S = 2;
/** Round 18 — a touching Reaver lifts this share of the run purse. */
export const SWARM_THEFT_FRACTION = 0.15;
/** Round 20 — the Yardmaster throws the lane twice during its fight. */
export const SWARM_YARDMASTER_REVERSALS = Object.freeze([20 * 60, 55 * 60]);
/** Round 12 — a rider owes its release at the lane midpoint; a cut-loose container
 *  carries it away until the box stalls or leaves the room (then it fights loose). */
export const SWARM_RIDER_STILL_TICKS = 30;
export const SWARM_RIDER_CARRY_EXIT_SCALE = 1.3;

export const SWARM_TWIST_BY_ID = Object.freeze({
  delivery: Object.freeze({ id: 'delivery', name: 'Delivery', arenas: [FOUNDRY_ARENA_ID] }),
  lights_out: Object.freeze({ id: 'lights_out', name: 'Lights Out' }),
  highway_robbery: Object.freeze({ id: 'highway_robbery', name: 'Highway Robbery' }),
  the_law: Object.freeze({ id: 'the_law', name: 'The Law', arenas: [FOUNDRY_ARENA_ID] }),
  the_yardmaster: Object.freeze({ id: 'the_yardmaster', name: 'The Yardmaster', arenas: [FOUNDRY_ARENA_ID] }),
  chain_gang: Object.freeze({ id: 'chain_gang', name: 'Chain Gang' }),
  everything_must_go: Object.freeze({ id: 'everything_must_go', name: 'Everything Must Go', arenas: [FOUNDRY_ARENA_ID] }),
  black_friday: Object.freeze({ id: 'black_friday', name: 'Black Friday' }),
  quiet: Object.freeze({ id: 'quiet', name: 'Quiet' }),
});

/**
 * The twist mechanic a wave plays, or null. Arena-gated twists (the freight-dependent
 * ones and the floor sale) only arm inside the Foundry — the course reads everywhere the
 * Pit runs, and the Pit IS the Foundry, but the consult stays honest for any caller that
 * carries a different arenaId.
 */
export function swarmTwistFor(wave, arenaId = null) {
  const course = swarmCourseFor(wave);
  const id = course && typeof course.twistId === 'string' ? course.twistId : null;
  const twist = id ? SWARM_TWIST_BY_ID[id] || null : null;
  if (!twist) return null;
  if (Array.isArray(twist.arenas) && arenaId != null && !twist.arenas.includes(arenaId)) return null;
  return twist;
}

/** True when the course row names a room mechanic, not an event card. */
export function isSwarmCourseTwistId(id) {
  return typeof id === 'string' && SWARM_TWIST_BY_ID[id] != null;
}
