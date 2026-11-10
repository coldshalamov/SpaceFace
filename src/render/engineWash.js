// Engine wash (inf-engine-wash).
//
// A ship's exhaust plume was a light effect with no environment: it lit nothing and it stirred
// nothing, so a tug hovering its drive over a rock — or a hauler breathing down onto a station
// deck — sat on a surface that behaved like a painted backdrop. Now a burning main drive that
// hangs over a nearby surface blows that surface's dust off its skin: the contact sits on the
// near face under the plume, the breath drifts downrange along the exhaust, strength follows the
// throttle and the height above the skin, and the tint names the surface (pale mineral off rock,
// grey metal off station hulls, dull ash off wrecks).
//
// Pure decision layer: no THREE, no pools, no GameState, no rng and no wall time — the cadence
// is quantized sim-time slots and every variation seed is a deterministic hash. The vfx adapter
// owns the ship/surface walk and feeds the pooled gas field (dust family); it never owns the
// contact law, so the picture stays testable headless.

/** Main-drive power below which the plume cannot stir anything (the plume's own idle band). */
export const ENGINE_WASH_DRIVE_FLOOR = 0.35;
/** At and above this drive the wash pulses every cadence slot; below it, every second slot. */
export const ENGINE_WASH_STRONG_DRIVE = 0.62;
/** Cadence: quantized emission slots per second of sim time (the dust family stays frugal). */
export const ENGINE_WASH_HZ = 2.5;
/** Plume reach above a skin: wash range from the surface centre, beyond which nothing stirs. */
export const ENGINE_WASH_RANGE_WU = 340;
/** Surface kinds washable today; unknown kinds draw nothing (the caller skips them). */
export const ENGINE_WASH_SURFACE_KINDS = Object.freeze(['rock', 'station', 'wreck']);

// Dust tints by surface kind — linear-ish sRGB the gas film reads directly.
export const ENGINE_WASH_TINTS = Object.freeze({
  rock: Object.freeze({ r: 0.66, g: 0.58, b: 0.50 }),
  station: Object.freeze({ r: 0.60, g: 0.60, b: 0.66 }),
  wreck: Object.freeze({ r: 0.52, g: 0.50, b: 0.48 }),
});

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Deterministic per-entity phase in [0,1) — the house hash habit, no RNG anywhere. */
export function engineWashPhase(entityId) {
  let hash = 2166136261;
  const text = String(entityId);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) / 4294967296 + 0.38196601125) % 1;
}

/** Quantized cadence slot for sim time — two calls in one slot emit once. */
export function engineWashSlot(now) {
  return Math.floor(finite(now) * ENGINE_WASH_HZ);
}

/**
 * Slot gate. A drive at or above ENGINE_WASH_STRONG_DRIVE pulses every slot; a working but
 * weaker drive pulses every second slot (same parity per ship phase), so a light wash is a
 * sparser wash, not a different law.
 */
export function shouldEmitEngineWash(drive, slot, shipPhase = 0) {
  const d = finite(drive, 0);
  if (d < ENGINE_WASH_DRIVE_FLOOR) return false;
  if (d >= ENGINE_WASH_STRONG_DRIVE) return true;
  return ((Math.trunc(slot) + Math.trunc(finite(shipPhase, 0) * 2)) & 1) === 0;
}

/**
 * One ship-vs-surface wash contact. Pure; writes caller-owned `out`.
 *
 * `ship`   { pos:{x,z}, rot, radius } — the hull's play-plane pose; the exhaust blows BEHIND it
 *          (−forward), so a surface on the nose side reads clean burn-away, not wash.
 * `drive`  the plume's own working read (0..1.35, the same _engineDriveFor number the nozzles use)
 * `surface` { pos:{x,z}, radius, kind } — kind keys the tint; unknown kinds do not wash.
 *
 * Plan: { hit, x, z, y, driftX, driftZ, scale, severity, r, g, b }
 *   hit       false when the plume is not working this surface this instant
 *   x/z       the contact, on the near face of the surface under the plume path
 *   driftX/Z  the breath's downrange drift along the exhaust direction
 *   scale     dust body scale in world units, hull- and throttle-sized
 *   severity  0..1 — drives the gas body's life and peak
 */
export function resolveEngineWashContact(ship, drive, surface, out = {}) {
  out.hit = false;
  out.x = 0; out.z = 0; out.y = 0.3;
  out.driftX = 0; out.driftZ = 0;
  out.scale = 0; out.severity = 0;
  out.r = 0.6; out.g = 0.57; out.b = 0.5;
  if (!ship || !ship.pos || !surface || !surface.pos
    || !Number.isFinite(ship.pos.x) || !Number.isFinite(ship.pos.z)
    || !Number.isFinite(surface.pos.x) || !Number.isFinite(surface.pos.z)) return out;
  const tint = ENGINE_WASH_TINTS[surface.kind];
  if (!tint) return out;
  const d = finite(drive, 0);
  if (d < ENGINE_WASH_DRIVE_FLOOR) return out;
  const shipR = Math.max(1, finite(ship.radius, 8));
  const surfR = Math.max(2, finite(surface.radius, 10));
  const rot = finite(ship.rot);
  const fx = Math.cos(rot), fz = Math.sin(rot); // hull forward
  // The nozzle sits behind the hull; the wash lives where the plume blows, not under the nose.
  const ex = finite(ship.pos.x) - fx * shipR * 0.85;
  const ez = finite(ship.pos.z) - fz * shipR * 0.85;
  const toSurfX = finite(surface.pos.x) - finite(ship.pos.x);
  const toSurfZ = finite(surface.pos.z) - finite(ship.pos.z);
  // Surface on the nose side: the exhaust streams away from it. Small tolerance so a hull
  // nosed right up against a face still washes the skin beside it.
  const ahead = toSurfX * fx + toSurfZ * fz;
  if (ahead > surfR * 0.35) return out;
  const dx = ex - finite(surface.pos.x);
  const dz = ez - finite(surface.pos.z);
  const dist = Math.hypot(dx, dz);
  if (!(dist > surfR * 0.55)) return out; // inside the hull's own skin: no readable wash seat
  const band = shipR * (0.9 + 1.3 * clamp01(d));
  if (dist > surfR + band || dist > ENGINE_WASH_RANGE_WU) return out;
  const prox = 1 - clamp01((dist - surfR) / band); // 1 at the skin, 0 at the band edge
  const severity = clamp01(d * (0.45 + 0.55 * prox));
  if (!(severity > 0)) return out;
  const inv = 1 / Math.max(1e-6, dist);
  out.x = finite(surface.pos.x) + dx * inv * surfR * 0.94;
  out.z = finite(surface.pos.z) + dz * inv * surfR * 0.94;
  // Downrange: the breath drifts along the exhaust direction, scaled by throttle.
  out.driftX = -fx * (1.4 + 2.2 * clamp01(d));
  out.driftZ = -fz * (1.4 + 2.2 * clamp01(d));
  out.scale = 3 + shipR * 0.35 * (0.6 + 0.4 * clamp01(d)) + 2 * clamp01(d);
  out.severity = severity;
  out.r = tint.r; out.g = tint.g; out.b = tint.b;
  out.hit = true;
  return out;
}

/**
 * The emit payload the adapter hands the pooled gas field. Deterministic seed off the ship's
 * phase and the cadence slot — the same hover paints the same dust, never a coin flip.
 */
export function engineWashEmitPayload(contact, shipId, slot, out = {}) {
  const phase = engineWashPhase(shipId);
  out.x = contact.x;
  out.z = contact.z;
  out.y = contact.y;
  out.heading = Math.atan2(contact.driftZ, contact.driftX);
  out.driftX = contact.driftX;
  out.driftZ = contact.driftZ;
  out.scale = contact.scale;
  out.severity = contact.severity;
  out.r = contact.r;
  out.g = contact.g;
  out.b = contact.b;
  out.opacity = 0.45 + 0.3 * clamp01(contact.severity);
  out.lifeScale = 0.55;
  out.seed = (phase + Math.trunc(slot) * 0.6180339887) % 1;
  return out;
}
