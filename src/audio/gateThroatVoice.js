// inf-gate-throat-voice — WF-13: a jump gate sounds like a gate.
//
// The picture already gives a gate a body: counter-rotating containment rings, a breathing portal
// and an approach spin-up (render/infrastructureMotion.js updateGateMotion — inside 400 wu the
// swirl climbs from 0.7 to 2.5 rad/s as approachFactor = 1 - d / 400). The ear gave it nothing of
// its own: gates spawn as `type: 'station'` bodies with `data.isGate`, so the station approach bed
// (audioSystem._nearestDockableStation) picked the gate up as if it were a berth and hummed a
// docking station's bed at it — a jump gate and a wormhole both sounded like a dock.
//
// This planner is the decision layer for the gate's own voice:
//   jump gate   a resonant ring-hum that breathes on the portal's own breathing rate and climbs a
//               whole tone as the player crosses the picture's spin-up radius, so the swirl you
//               see winding up is the pitch you hear winding up.
//   wormhole    a filtered throat moan that sags instead of climbing — the unstable mouth draws
//               you in rather than spinning up.
//
// Pure: no AudioContext, no THREE, no Math.random. Per-gate variation is a stable hash of the
// gate id (two neighbouring gates never sing the same note) leaned by the owning house the way
// the station approach bed leans. Bounded: only the nearest live gate inside hearing speaks.
// The caller passes a scratch `out` object, so the planner allocates nothing per frame.

import { hash32 } from '../core/rng.js';

/** Hearing radius: a gate is a big machine (dock radius 70–80 wu, place scale ~5). */
export const GATE_THROAT_HEARING_WU = 640;
/** Full voice inside the throat mouth. */
export const GATE_THROAT_NEAR_WU = 60;
/** Peak gain on the ambient bus — beside the station approach bed (0.028), never over the berth. */
export const GATE_THROAT_PEAK = 0.03;
/** The picture's spin-up radius (infrastructureMotion: approachFactor = 1 - d / 400). */
export const GATE_THROAT_SPINUP_WU = 400;
/** Combat owns the mix: the throat bows under a live fight (the place-accent threshold). */
export const GATE_THROAT_THREAT_HOLD = 0.35;
export const GATE_THROAT_THREAT_DUCK = 0.5;
/** One caption per gate per visit window — the hum is a place, not an alarm. */
export const GATE_THROAT_CAPTION_GAP_S = 120;
/** Below this the throat is inaudible and the loop releases. */
export const GATE_THROAT_GAIN_FLOOR = 0.0004;

export const GATE_THROAT_RECIPES = Object.freeze({
  gate: 'sfx_gate_throat',
  wormhole: 'sfx_wormhole_throat',
});

/** Pitch travel at the mouth, in cents: the ring climbs a whole tone; a wormhole sags. */
export const GATE_THROAT_SPIN_CENTS = Object.freeze({ gate: 200, wormhole: -150 });

// Whose gate it is, at hum scale — the same leans the station approach bed uses
// (audioSystem APPROACH_HUM_FACTION_RATE). Unlisted houses keep the rest rate.
const HOUSE_LEAN = Object.freeze({
  faction_scn: 1.0,
  faction_reach: 0.94,
  faction_choir: 1.06,
});
/** ± spread of the per-gate stable pitch seed. */
const RATE_JITTER = 0.04;

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/** 'gate' | 'wormhole' for a live gate body, else null. Wormholes are gates too (isGate). */
export function gateThroatKind(entity) {
  if (!entity || entity.alive === false || !entity.pos) return null;
  const data = entity.data;
  if (!data || (data.isGate !== true && data.isWormhole !== true)) return null;
  if (!Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return null;
  return data.isWormhole === true ? 'wormhole' : 'gate';
}

/** Stable per-gate playback rate: house lean × a ±RATE_JITTER seed from the gate id. */
export function gateThroatRate(entity) {
  const data = (entity && entity.data) || {};
  const house = data.factionId || (entity && entity.factionId) || null;
  const lean = (house && HOUSE_LEAN[house]) || 1;
  const id = entity && entity.id != null ? entity.id : 0;
  const u = (hash32('gate-throat', id) >>> 0) / 4294967296;
  return Math.round(lean * (1 + (u * 2 - 1) * RATE_JITTER) * 10000) / 10000;
}

/** Distance falloff, squared like the station approach bed: a swell, not a fader. */
export function gateThroatGain(distanceWu) {
  const d = Number(distanceWu);
  if (!Number.isFinite(d) || d >= GATE_THROAT_HEARING_WU) return 0;
  const frac = clamp(1 - (d - GATE_THROAT_NEAR_WU) / (GATE_THROAT_HEARING_WU - GATE_THROAT_NEAR_WU), 0, 1);
  return frac * frac * GATE_THROAT_PEAK;
}

/** 0..1 spin-up — the picture's own approachFactor, on the same radius. */
export function gateThroatSpin(distanceWu) {
  const d = Number(distanceWu);
  if (!Number.isFinite(d) || d >= GATE_THROAT_SPINUP_WU) return 0;
  return clamp(1 - d / GATE_THROAT_SPINUP_WU, 0, 1);
}

/**
 * Plan the gate throat for this frame. `gates` is the entity index's gate lane (or any list —
 * non-gates are skipped); `playerPos` the listener; `threat` the mix's live threat read.
 * Returns `out` filled for the nearest live gate inside hearing, or null when none speaks.
 */
export function planGateThroat(gates, playerPos, threat, out = {}) {
  if (!gates || typeof gates.length !== 'number' || !playerPos
    || !Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.z)) return null;
  let best = null;
  let bestKind = null;
  let bestD2 = GATE_THROAT_HEARING_WU * GATE_THROAT_HEARING_WU;
  for (let i = 0; i < gates.length; i++) {
    const e = gates[i];
    const kind = gateThroatKind(e);
    if (!kind) continue;
    const dx = e.pos.x - playerPos.x;
    const dz = e.pos.z - playerPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = e; bestKind = kind; }
  }
  if (!best) return null;
  const distance = Math.sqrt(bestD2);
  let gain = gateThroatGain(distance);
  if (Number.isFinite(threat) && threat >= GATE_THROAT_THREAT_HOLD) gain *= GATE_THROAT_THREAT_DUCK;
  if (!(gain > GATE_THROAT_GAIN_FLOOR)) return null;
  const spin = gateThroatSpin(distance);
  out.gateId = best.id;
  out.kind = bestKind;
  out.recipeId = GATE_THROAT_RECIPES[bestKind];
  out.distance = distance;
  out.gain = gain;
  out.rate = gateThroatRate(best);
  out.spin = spin;
  out.spinCents = Math.round(spin * GATE_THROAT_SPIN_CENTS[bestKind]);
  out.x = best.pos.x;
  out.z = best.pos.z;
  return out;
}

/** Caption admission: one authored caption per gate per GATE_THROAT_CAPTION_GAP_S. */
export function admitGateThroatCaption(memory, gateId, nowS) {
  if (!memory || gateId == null || !Number.isFinite(nowS)) return false;
  if (memory.gateId === gateId && Number.isFinite(memory.at)
    && nowS >= memory.at && nowS - memory.at < GATE_THROAT_CAPTION_GAP_S) return false;
  memory.gateId = gateId;
  memory.at = nowS;
  return true;
}
