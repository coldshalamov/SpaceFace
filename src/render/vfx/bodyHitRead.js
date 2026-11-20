// OVH-06b — the body that was hit carries the read (03_COMBAT §6.1, §7; ruling R10).
//
// Pure, presentation-only decisions for "every hit reads on the hull it lands on". No THREE, no
// pools, no sim reads, no state.rng and no Math.random: every number is a pure function of an
// entity id, a tick or sim-second, and a salt, so the same moment draws the same picture and
// fifty hits a second cost fifty array scans and zero allocations.
//
//   bodyDamageTier     — the 60 / 30 / 10 % ladder: smoke, then sparks + flicker, then fire + stutter;
//   hitFlashLevel      — the two-frame emissive flash curve on the struck hull, reduced-flash dimmed;
//   createHitFlashBook — fixed-slot per-entity flash timers (a per-instance uniform's source);
//   plumeStutter       — the drive's flicker (tier 2) and cut-out stutter (tier 3);
//   lampFlicker        — running-light / hull-lamp flicker for a damaged or helm-less body;
//   reflectAxis        — a shot's reflection off the surface it struck (the spark spray axis);
//   seed01 / seedSigned— deterministic presentation seeds from ids and ticks.

// A/B switch for matched within-session measurement: `?ovh06b=off` restores the pre-OVH-06b
// presentation (no struck-hull flash, no reflection spray, smoke from 40 %, no spark/fire tiers).
try {
  if (typeof location !== 'undefined' && /[?&]ovh06b=off/.test(location.search || '')) globalThis.__ovh06bOff = true;
} catch (_) { /* no location: enabled */ }
/** Dynamic so a probe can flip it mid-session (`globalThis.__ovh06bOff = true`). */
export function bodyHitEnabled() {
  return globalThis.__ovh06bOff !== true;
}

export const BODY_TIER_CLEAN = 0;
export const BODY_TIER_SMOKE = 1;   // <= 60 % hull: a smoke trail
export const BODY_TIER_SPARKS = 2;  // <= 30 % hull: sparks and a flickering engine
export const BODY_TIER_FIRE = 3;    // <= 10 % hull: fire and a stuttering drive

export const BODY_TIER_FRACTIONS = Object.freeze([0.6, 0.3, 0.1]);

/** Hull fraction to tier. A dead or unknown hull reads as clean here; death has its own owner. */
export function bodyDamageTier(hull, hullMax) {
  const max = Number(hullMax);
  const now = Number(hull);
  if (!(max > 0) || !Number.isFinite(now) || now <= 0) return BODY_TIER_CLEAN;
  const frac = now / max;
  if (frac <= BODY_TIER_FRACTIONS[2]) return BODY_TIER_FIRE;
  if (frac <= BODY_TIER_FRACTIONS[1]) return BODY_TIER_SPARKS;
  if (frac <= BODY_TIER_FRACTIONS[0]) return BODY_TIER_SMOKE;
  return BODY_TIER_CLEAN;
}

// ---- seeds -----------------------------------------------------------------------------------

/** Integer hash of (id, tick, salt) -> [0, 1). Same inputs, same number, on every machine. */
export function seed01(id, tick = 0, salt = 0) {
  let h = 2166136261 >>> 0;
  const s = typeof id === 'string' ? id : String(id);
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  h = Math.imul(h ^ (tick | 0), 2246822519) >>> 0;
  h = Math.imul(h ^ (salt | 0), 3266489917) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function seedSigned(id, tick = 0, salt = 0) {
  return seed01(id, tick, salt) * 2 - 1;
}

// ---- the two-frame flash -----------------------------------------------------------------------

export const HIT_FLASH_FRAME_S = 1 / 60;
export const HIT_FLASH_FRAMES = 2;
export const HIT_FLASH_S = HIT_FLASH_FRAME_S * HIT_FLASH_FRAMES;
/** Reduced flashing keeps the hit readable (a dim, slightly longer glint) and never strobes. */
export const HIT_FLASH_REDUCED_SCALE = 0.28;
export const HIT_FLASH_REDUCED_S = 0.12;

/**
 * Emissive boost on the struck hull, 0..1, from the age of the last hit.
 * Normal: full on both frames, then gone. Reduced flash: a low, smooth, longer glint.
 */
export function hitFlashLevel(ageS, strength = 1, reducedFlash = false) {
  if (!(ageS >= 0)) return 0;
  const k = strength < 0 ? 0 : strength > 1 ? 1 : strength;
  if (reducedFlash) {
    if (ageS >= HIT_FLASH_REDUCED_S) return 0;
    return HIT_FLASH_REDUCED_SCALE * k * (1 - ageS / HIT_FLASH_REDUCED_S);
  }
  return ageS < HIT_FLASH_S ? k : 0;
}

/**
 * Fixed-capacity flash timers keyed by entity id. Two parallel typed arrays; noteHit overwrites
 * the oldest slot when full, so the hot path never allocates and never grows.
 */
export function createHitFlashBook(capacity = 64) {
  const ids = new Array(capacity).fill(null);
  const born = new Float64Array(capacity).fill(-1e9);
  const power = new Float32Array(capacity);
  const seen = new Uint8Array(capacity);
  let cursor = 0;
  let used = 0;
  function find(id) {
    for (let i = 0; i < capacity; i += 1) if (ids[i] === id) return i;
    return -1;
  }
  return {
    capacity,
    noteHit(id, now, strength = 1) {
      if (id == null) return;
      let slot = find(id);
      if (slot < 0) {
        // Prefer a dead slot, else the oldest.
        let oldest = 0;
        for (let i = 0; i < capacity; i += 1) {
          if (ids[i] == null) { oldest = i; break; }
          if (born[i] < born[oldest]) oldest = i;
        }
        slot = oldest;
        cursor = slot;
        if (ids[slot] == null) used += 1;
        ids[slot] = id;
      }
      born[slot] = now;
      power[slot] = strength;
      seen[slot] = 0;
    },
    level(id, now, reducedFlash = false) {
      const slot = find(id);
      if (slot < 0) return 0;
      const age = now - born[slot];
      let out = hitFlashLevel(age, power[slot], reducedFlash);
      // A slow frame must still show the flash once: the first read after a hit never returns 0.
      if (out === 0 && seen[slot] === 0) out = hitFlashLevel(0, power[slot], reducedFlash);
      if (out > 0) seen[slot] = 1;
      if (out === 0 && age > HIT_FLASH_REDUCED_S + 0.05) { ids[slot] = null; used -= 1; }
      return out;
    },
    clear() { ids.fill(null); born.fill(-1e9); cursor = 0; used = 0; },
    /** Slots currently holding an entity; 0 lets a caller skip its whole pass. */
    get occupied() { return used; },
    get lastSlot() { return cursor; },
    live(now) {
      let n = 0;
      for (let i = 0; i < capacity; i += 1) if (ids[i] != null && now - born[i] < HIT_FLASH_REDUCED_S) n += 1;
      return n;
    },
  };
}

// ---- spark spray -------------------------------------------------------------------------------

/**
 * Reflect the shot's travel axis (ax, az) off the surface normal (nx, nz). Writes a unit vector
 * into `out` ({x, z}) and returns it. A degenerate normal returns the reversed travel axis.
 */
export function reflectAxis(ax, az, nx, nz, out) {
  const al = Math.hypot(ax, az) || 1;
  const nl = Math.hypot(nx, nz);
  const tx = ax / al;
  const tz = az / al;
  if (nl < 1e-6) { out.x = -tx; out.z = -tz; return out; }
  const ux = nx / nl;
  const uz = nz / nl;
  const dot = tx * ux + tz * uz;
  let rx = tx - 2 * dot * ux;
  let rz = tz - 2 * dot * uz;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  out.x = rx; out.z = rz;
  return out;
}

// ---- drive and lamps ---------------------------------------------------------------------------

/**
 * Drive multiplier 0..1. Tier 2: a quick flicker that never drops below 0.55. Tier 3: a stutter,
 * gated bursts that cut the drive to 0.12 about a third of the time. Reduced flash dims the swing
 * (a gentle breathing) so there is no strobe. Deterministic in (entityId, simSeconds).
 */
export function plumeStutter(entityId, simSeconds, tier, reducedFlash = false) {
  if (tier < BODY_TIER_SPARKS) return 1;
  const step = Math.floor(simSeconds * (tier >= BODY_TIER_FIRE ? 9 : 14));
  const r = seed01(entityId, step, 11);
  if (reducedFlash) return 0.82 + 0.18 * r;
  if (tier >= BODY_TIER_FIRE) return r < 0.34 ? 0.12 : 0.55 + 0.45 * seed01(entityId, step, 12);
  return 0.55 + 0.45 * r;
}

/**
 * Lamp brightness multiplier 0..1 for a damaged or helm-less body's running lights.
 * `severity` 0..1 (tier or tumble); at 0 the lamp is steady.
 */
export function lampFlicker(entityId, simSeconds, severity, reducedFlash = false) {
  if (!(severity > 0)) return 1;
  const step = Math.floor(simSeconds * 11);
  const r = seed01(entityId, step, 21);
  const swing = (reducedFlash ? 0.15 : 0.7) * (severity > 1 ? 1 : severity);
  return r < 0.3 ? 1 - swing : 1 - swing * 0.2 * r;
}

// ---- tumble corkscrew --------------------------------------------------------------------------

/**
 * One corkscrew trail point: offset across the body's travel axis as it rolls. Returns the
 * lateral offset in wu for a given age along the trail; the caller rotates it by the heading.
 */
export function corkscrewOffset(entityId, simSeconds, spin, radius) {
  const phase = seed01(entityId, 0, 31) * Math.PI * 2;
  return Math.sin(simSeconds * (4 + Math.min(10, Math.abs(spin))) + phase) * radius * 0.55;
}

// ---- smoke / spark cadence ----------------------------------------------------------------------

const RATES = Object.freeze([
  Object.freeze({ smoke: 0, spark: 0, fire: 0 }),
  Object.freeze({ smoke: 9, spark: 0, fire: 0 }),
  Object.freeze({ smoke: 14, spark: 7, fire: 0 }),
  Object.freeze({ smoke: 18, spark: 9, fire: 12 }),
]);

/** Emissions per second for a tier (frozen shared records: no allocation per call). */
export function tierEmitRates(tier) {
  return RATES[tier > 3 ? 3 : tier < 0 ? 0 : tier | 0];
}
