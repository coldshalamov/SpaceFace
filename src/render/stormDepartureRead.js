// inf-storm-departure — the storm's grip letting go, as a picture.
//
// The player story: crossing INTO a hazard zone plays the charge beat at the boundary line,
// and riding it keeps the static crawling the hull (hazardStormRead.js, inf-storm-crossing).
// But leaving the zone was silent: the sim publishes `hazard:exit` with { entityId, zoneType,
// intensity } — the boundary crossing out, the family, and the zone's live intensity at the
// line — and the picture's only response was to stop the static mid-tick, as if someone
// switched the storm off. A storm you leave should shed: one last discharge flicker of the
// zone's own hue drifting OFF the hull, thinner and slower than the entry charge — a
// release, not a bite.
//
// This is the departure's pure decision layer, a sibling of hazardStormRead.js (whose enter/
// ride layer is a committed subject left untouched). Same truth law: the receipt the sim
// already publishes is the only input, no rng and no wall time — the plan hashes simTime and
// the zone's identity, so a frozen sim freezes the shed with the world. Reduced motion thins
// the shed but never to zero (a boundary you never notice leaving is worse than one you
// misread); the caller's flash gain still dims its peak.
//
// The character difference is the point: the entry beat CHARGES (fast particles slamming
// outward, severity keyed to the bite); the departure SHEDS (slow drift off the hull, and
// the light never reaches detonation grade — the storm is not hurting you on the way out).

import { resolveStormZoneColorHex } from './hazardStormRead.js';

export { resolveStormZoneColorHex };

/** The shed: thinner than the entry charge (STORM_CROSSING_* is 10 + 10·intensity). */
export const STORM_DEPARTURE_BASE_COUNT = 6;
export const STORM_DEPARTURE_INTENSITY_COUNT = 6;
export const STORM_DEPARTURE_REDUCED_MUL = 0.5;
/** The shed drifts off the hull — slower than the entry charge's 13 + 15·intensity. */
export const STORM_DEPARTURE_SHED_SPEED_BASE = 4;
export const STORM_DEPARTURE_SHED_SPEED_INTENSITY = 7;
/** The flicker lingers a breath longer than the entry beat's sparks. */
export const STORM_DEPARTURE_LIFE_BASE_S = 0.55;
export const STORM_DEPARTURE_LIFE_INTENSITY_S = 0.25;

function hash(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function noise01(seed, index) {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad) >>> 0;
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97) >>> 0;
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

function clamp01(value) {
  return Number.isFinite(value) ? (value < 0 ? 0 : value > 1 ? 1 : value) : 0;
}

/**
 * The departure shed. `receipt` is a hazard:exit payload { entityId, zoneType, intensity };
 * `now` is simTime. Returns null when the receipt carries no zone or no hull — the same
 * guards as the entry beat, so machinery emitters without a hull stay unhurried here too.
 * Deterministic per receipt: the same payload at the same time builds the same shed.
 */
export function resolveStormDepartureBeat(receipt, now, reducedMotion = false) {
  if (!receipt || receipt.entityId == null) return null;
  const zoneType = String(receipt.zoneType || '');
  if (!zoneType) return null;
  const intensity = clamp01(Number(receipt.intensity));
  const seed = hash(`storm-depart:${zoneType}:${receipt.entityId}:${Math.round((Number(now) || 0) * 8)}`);
  const countMul = reducedMotion ? STORM_DEPARTURE_REDUCED_MUL : 1;
  const count = Math.max(2, Math.round(
    (STORM_DEPARTURE_BASE_COUNT + STORM_DEPARTURE_INTENSITY_COUNT * intensity) * countMul,
  ));
  const angles = [];
  for (let k = 0; k < count; k++) {
    angles.push(((seed % 6283) / 1000) + (k / count) * Math.PI * 2 + noise01(seed, k) * 0.5);
  }
  return {
    zoneType,
    colorHex: resolveStormZoneColorHex(zoneType),
    intensity,
    count,
    angles,
    shedSpeed: STORM_DEPARTURE_SHED_SPEED_BASE
      + STORM_DEPARTURE_SHED_SPEED_INTENSITY * intensity,
    lifeS: STORM_DEPARTURE_LIFE_BASE_S + STORM_DEPARTURE_LIFE_INTENSITY_S * intensity,
    // The release's light: a heavy zone still flickers as you slip it, but the storm is
    // not biting at the line on the way out — never detonation grade.
    lightSeverity: intensity > 0.5 ? 'contact' : 'graze',
    seed,
  };
}
