// Hazard storm read — the pure decision layer for crossing and riding a hazard zone.
//
// The player story: the chart's hazard zones — the Ashfall Roaming Burn, radiation shadows,
// nebula fields, debris runs — damage the hull every tick while you are inside them, and the
// world says so only through HUD alerts. On the picture itself, the storm that is killing you
// is invisible: `hazard:enter`/`hazard:exit` fire with zone type and intensity and no renderer
// reads them, and `state.world.hazardPresence` (the sim's own nebula/radiation flags) has no
// consumer outside the scanner. This layer is the picture's half of that seam: the beat when
// the hull crosses the boundary, and the sustained static while the storm works on the hull.
//
// Truth read: the hazard receipts and presence flags the sim already publishes — no sim state
// is created or written. No rng and no wall time: every plan hashes simTime and the zone's own
// identity, so a frozen sim freezes the storm with the world. Reduced motion thins the
// sustained static and slows its cadence; the crossing beat keeps a floor (a boundary you
// never notice is worse than none), and the caller's flash gain still dims its peak.

/** Zone presentation: one hue per hazard family, none of them a pickup or dock color. */
export const STORM_ZONE_COLORS = Object.freeze({
  radiation: 0xc8ff4f,   // charged chartreuse — the burn's sick glow
  nebula: 0x9a7aff,      // violet wash — suspended dust ionizing
  debris: 0x8a94a6,      // slate grey — a hull grinding through wreckage
});

const UNKNOWN_ZONE_COLOR = 0xffb35c; // the house quiet-amber for an unlisted zone family

export function resolveStormZoneColorHex(zoneType) {
  const key = String(zoneType || '');
  return Object.prototype.hasOwnProperty.call(STORM_ZONE_COLORS, key)
    ? STORM_ZONE_COLORS[key]
    : UNKNOWN_ZONE_COLOR;
}

/** Sustained hull static: cadence and per-tick budget while the storm works the hull. */
export const STORM_STATIC_CADENCE_HZ = 7;
export const STORM_STATIC_REDUCED_CADENCE_HZ = 2.5;
export const STORM_STATIC_BASE_COUNT = 1;
export const STORM_STATIC_HOT_EXTRA = 1; // one more tick per emission while intensity > 0.5
/** The boundary beat: more charge the harder the storm bites at the line. */
export const STORM_CROSSING_BASE_COUNT = 10;
export const STORM_CROSSING_INTENSITY_COUNT = 10;
export const STORM_CROSSING_REDUCED_MUL = 0.5;

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

export function clamp01(value) {
  return Number.isFinite(value) ? (value < 0 ? 0 : value > 1 ? 1 : value) : 0;
}

/**
 * The boundary-crossing beat. `receipt` is a hazard:enter payload { entityId, zoneType,
 * intensity }; `now` is simTime. Returns null when the receipt carries no zone or no hull.
 * Deterministic per receipt: the same payload at the same time builds the same beat.
 */
export function resolveStormCrossingBeat(receipt, now, reducedMotion = false) {
  if (!receipt || receipt.entityId == null) return null;
  const zoneType = String(receipt.zoneType || '');
  if (!zoneType) return null;
  const intensity = clamp01(Number(receipt.intensity));
  const seed = hash(`storm-cross:${zoneType}:${receipt.entityId}:${Math.round((Number(now) || 0) * 8)}`);
  const countMul = reducedMotion ? STORM_CROSSING_REDUCED_MUL : 1;
  const count = Math.max(3, Math.round(
    (STORM_CROSSING_BASE_COUNT + STORM_CROSSING_INTENSITY_COUNT * intensity) * countMul,
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
    // The light pool keys severity off the bite at the line: a heavy zone announces itself.
    lightSeverity: intensity > 0.6 ? 'detonation' : intensity > 0.25 ? 'contact' : 'graze',
    seed,
  };
}

/**
 * One sustained-static decision. Returns { plan, step } on an emission tick, null on a quiet
 * one. `lastStep` is the caller's latch (keep it on the presenter); only the tick whose
 * floor(simTime * cadence) advances emits, so a variable frame rate cannot stack static, and
 * the caller can just stop advancing time under reduced motion's slower cadence. `types` is
 * the live zone families on the hull (from state.world.hazardPresence); the tick's family
 * rotates deterministically through them, and the family's known intensity rides the read.
 */
export function stormStaticTickPlan(simTime, types, intensityByType = {}, cadenceHz = STORM_STATIC_CADENCE_HZ, lastStep = null) {
  const presence = Array.isArray(types) ? types.filter(Boolean) : [];
  if (!presence.length || !(Number(cadenceHz) > 0)) return null;
  const now = Number(simTime);
  if (!Number.isFinite(now) || now < 0) return null;
  const step = Math.floor(now * cadenceHz);
  if (step === lastStep) return null;
  const zoneType = presence[step % presence.length];
  const intensity = clamp01(Number(intensityByType && intensityByType[zoneType]));
  const seed = hash(`storm-static:${zoneType}:${step}`);
  return {
    step,
    plan: {
      zoneType,
      colorHex: resolveStormZoneColorHex(zoneType),
      intensity,
      count: STORM_STATIC_BASE_COUNT + (intensity > 0.5 ? STORM_STATIC_HOT_EXTRA : 0),
      angle: ((seed % 6283) / 1000) * Math.PI * 2,
      speed: 4 + ((seed >>> 8) % 100) / 100 * 5,
      seed,
    },
  };
}
