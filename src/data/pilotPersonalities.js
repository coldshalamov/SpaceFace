// CH-61 — pilots with personality. Every ambient traffic pilot carries a stable,
// seeded temperament that changes how the hull is actually flown: cruise pacing,
// spacing to the hull ahead, approach braking, weave, boost appetite — and which
// way the same stimulus lands (a panicky hauler dumps at the first whiff of
// violence; a cocky one keeps its load and just leaves). The default ('standard')
// is the historical behavior bit-for-bit: a hull with no personality drives
// exactly as it always did, so scenario casts, determinism envelopes and any
// path that never asks for a temperament are untouched.
//
// Pure data + pure decisions. No Three.js, no wall clock, no ambient randomness:
// the pick is hash32 over the run seed and the hull's stable id.

import { hash32 } from '../core/rng.js';

export const PILOT_PERSONALITY_IDS = Object.freeze(['cautious', 'cocky', 'panicky', 'veteran']);

export const PILOT_PERSONALITIES = Object.freeze({
  cautious: Object.freeze({
    id: 'cautious',
    // Never boosts in company; eases off early behind another hull; brakes for
    // the berth well before the historical band.
    spacingLookaheadWu: 240,
    easeThrottle: 0.45,
    boostWhenClearWu: 0,
    weaveAmpRad: 0,
    brakeEarlyDistWu: 170,
    dumpOnViolence: true,
  }),
  cocky: Object.freeze({
    id: 'cocky',
    // Boosts whenever the lane ahead reads clear, runs its spacing tight, and
    // keeps the load when violence starts — flee, never dump.
    spacingLookaheadWu: 0,
    easeThrottle: null,
    boostWhenClearWu: 320,
    weaveAmpRad: 0,
    brakeEarlyDistWu: 0,
    dumpOnViolence: false,
  }),
  panicky: Object.freeze({
    id: 'panicky',
    // Weaves on cruise, boosts at anything close, dumps at the first hit.
    spacingLookaheadWu: 200,
    easeThrottle: null,
    boostWhenClearWu: 0,
    boostWhenNearWu: 170,
    weaveAmpRad: 0.22,
    brakeEarlyDistWu: 60,
    dumpOnViolence: true,
  }),
  veteran: Object.freeze({
    id: 'veteran',
    // Steady cruise, precise spacing, one early breathing-off before the berth.
    spacingLookaheadWu: 150,
    easeThrottle: null,
    boostWhenClearWu: 0,
    weaveAmpRad: 0,
    brakeEarlyDistWu: 210,
    dumpOnViolence: true,
  }),
});

/** The stable temperament for one hull — hashed once, stamped on the live data. */
export function pilotPersonalityFor(state, entity) {
  if (!entity || !entity.data) return null;
  const data = entity.data;
  if (data.pilotPersonality != null) return data.pilotPersonality;
  const seed = (state && state.meta && state.meta.seed >>> 0) || 1;
  const id = PILOT_PERSONALITY_IDS[hash32(seed, 'pilot-personality', String(entity.id)) % PILOT_PERSONALITY_IDS.length];
  data.pilotPersonality = id;
  return id;
}

export function pilotPersonalityDef(state, entity) {
  const id = pilotPersonalityFor(state, entity);
  return id ? PILOT_PERSONALITIES[id] || null : null;
}

/**
 * The cruise decision for one personality, given what the driver sees. Pure:
 * `sight` = { distToTarget, distToHullAhead, simTime, hullId } — no state writes,
 * no entities. Returns null when the personality has nothing to say this tick
 * (the caller then flies the historical default verbatim).
 */
export function pilotPersonalityDrive(def, sight) {
  if (!def || !sight) return null;
  const out = {};
  const now = Number.isFinite(sight.simTime) ? sight.simTime : 0;
  const wobble = Math.sin(now * 1.7 + (Number(sight.hullId) || 0));

  // Spacing: a hull ahead inside the lookahead asks for breathing room.
  const easeAt = def.spacingLookaheadWu || 0;
  if (easeAt > 0 && Number.isFinite(sight.distToHullAhead) && sight.distToHullAhead >= 0
    && sight.distToHullAhead < easeAt) {
    out.moveZ = def.easeThrottle != null ? def.easeThrottle : Math.max(0.35, Math.min(0.8, sight.distToHullAhead / easeAt + 0.3));
  }

  // Boost appetite.
  if (def.boostWhenClearWu > 0 && Number.isFinite(sight.distToHullAhead)
    && (sight.distToHullAhead < 0 || sight.distToHullAhead >= def.boostWhenClearWu)) {
    out.boost = true;
  } else if (def.boostWhenNearWu > 0 && Number.isFinite(sight.distToHullAhead)
    && sight.distToHullAhead >= 0 && sight.distToHullAhead < def.boostWhenNearWu) {
    out.boost = true;
  }

  // Weave: a gentle periodic strafe, per hull phase, never against the aim.
  if (def.weaveAmpRad > 0) out.aimAngleOffset = wobble * def.weaveAmpRad;

  // Approach braking: an early breathing-off band before the berth.
  if (def.brakeEarlyDistWu > 0 && Number.isFinite(sight.distToTarget) && sight.distToTarget < def.brakeEarlyDistWu) {
    out.moveZ = Math.min(out.moveZ != null ? out.moveZ : 1, 0.55);
  }
  return Object.keys(out).length ? out : null;
}
