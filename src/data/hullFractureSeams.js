// PQ-154.00 — authored fracture seams for wrecking-ball hull breakup.
//
// Purpose: data for wrecking-ball fracture (PQ-154.00). Extreme collisions above fractureThresholdWU
// split a ship hull along an authored structural seam instead of swapping to a flat wreck sprite.
// A subsequent Grok lane will split hulls along these seams, spawning pieces that inherit motion and mass.
//
// Pure data catalog and deterministic readers: no UI, no Math.random, no ambient randomness.

/**
 * Closing speed (wu/s) above which an extreme slam / wrecking-ball collision may split a hull.
 * Cites and reuses the terrain crumple scale (~30+ wu/s, TERRAIN_CRUMPLE_LAW.threshold = 30 wu/s
 * in src/combat/impulseKernel.js; SCAR_CONTACT_HEAVY_SPEED = 30 in src/combat/hullScars.js).
 */
export const fractureThresholdWU = 30;
export const FRACTURE_THRESHOLD_WU = fractureThresholdWU;

/**
 * Authored fracture seams keyed by coarse class: light, medium, heavy.
 * Each class provides 3–5 seams with id, human-readable label, mass fraction,
 * and an outward unit-ish impulse direction {x, z} in the gameplay plane.
 * massFrac sums to ~1 per class.
 */
export const HULL_FRACTURE_SEAMS = Object.freeze({
  light: Object.freeze([
    Object.freeze({
      id: 'light_forward_canopy',
      label: 'Forward Canopy Shear',
      massFrac: 0.34,
      impulseDir: Object.freeze({ x: 0, z: -1 }),
    }),
    Object.freeze({
      id: 'light_port_spar',
      label: 'Port Stabilizer Break',
      massFrac: 0.33,
      impulseDir: Object.freeze({ x: -0.866, z: 0.5 }),
    }),
    Object.freeze({
      id: 'light_starboard_spar',
      label: 'Starboard Stabilizer Break',
      massFrac: 0.33,
      impulseDir: Object.freeze({ x: 0.866, z: 0.5 }),
    }),
  ]),

  medium: Object.freeze([
    Object.freeze({
      id: 'medium_forward_prow',
      label: 'Forward Prow Cleave',
      massFrac: 0.34,
      impulseDir: Object.freeze({ x: 0, z: -1 }),
    }),
    Object.freeze({
      id: 'medium_port_outrigger',
      label: 'Port Outrigger Shear',
      massFrac: 0.33,
      impulseDir: Object.freeze({ x: -0.866, z: 0.5 }),
    }),
    Object.freeze({
      id: 'medium_starboard_outrigger',
      label: 'Starboard Outrigger Shear',
      massFrac: 0.33,
      impulseDir: Object.freeze({ x: 0.866, z: 0.5 }),
    }),
  ]),

  heavy: Object.freeze([
    Object.freeze({
      id: 'heavy_prow_cleave',
      label: 'Forward Prow Cleave',
      massFrac: 0.25,
      impulseDir: Object.freeze({ x: 0, z: -1 }),
    }),
    Object.freeze({
      id: 'heavy_port_sponson',
      label: 'Port Sponson Shear',
      massFrac: 0.25,
      impulseDir: Object.freeze({ x: -1, z: 0 }),
    }),
    Object.freeze({
      id: 'heavy_starboard_sponson',
      label: 'Starboard Sponson Shear',
      massFrac: 0.25,
      impulseDir: Object.freeze({ x: 1, z: 0 }),
    }),
    Object.freeze({
      id: 'heavy_aft_engines',
      label: 'Aft Drive Bulkhead Shear',
      massFrac: 0.25,
      impulseDir: Object.freeze({ x: 0, z: 1 }),
    }),
  ]),
});

/**
 * Classify a ship mass into a coarse hull class:
 * - light: mass < 30
 * - medium: 30 <= mass < 80
 * - heavy: mass >= 80
 *
 * @param {number} mass
 * @returns {'light'|'medium'|'heavy'}
 */
export function hullClassForMass(mass) {
  const m = Number(mass);
  if (!Number.isFinite(m) || m < 30) {
    return 'light';
  }
  if (m < 80) {
    return 'medium';
  }
  return 'heavy';
}

/**
 * Deterministically pick one fracture seam for a given coarse class from rng01 in [0, 1).
 *
 * @param {string|number} classId - Hull class name ('light'|'medium'|'heavy') or numeric ship mass.
 * @param {number|function} [rng01=0] - Number in [0, 1) or rng function returning [0, 1).
 * @returns {object|null} The chosen seam definition.
 */
export function seamFor(classId, rng01) {
  let key = classId;
  if (typeof key === 'number') {
    key = hullClassForMass(key);
  } else if (typeof key === 'string') {
    key = key.toLowerCase();
  }
  const seams = HULL_FRACTURE_SEAMS[key] || HULL_FRACTURE_SEAMS.medium;
  if (!seams || seams.length === 0) {
    return null;
  }

  const raw = typeof rng01 === 'function' ? rng01() : rng01;
  const r = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.max(0, Math.min(0.999999999, raw))
    : 0;

  let acc = 0;
  for (let i = 0; i < seams.length; i++) {
    acc += seams[i].massFrac;
    if (r < acc || i === seams.length - 1) {
      return seams[i];
    }
  }
  return seams[seams.length - 1];
}

export default HULL_FRACTURE_SEAMS;
